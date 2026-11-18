import { validateArtifact } from "./artifact-schema.mjs";
import { randomUUID } from "node:crypto";
import { validateWorkflow } from "./workflow-spec.mjs";
import { digest } from "./workflow-store.mjs";
const stamp = () => new Date().toISOString();
export class WorkflowEngine {
  constructor(store) {
    this.store = store;
    this.active = new Map();
  }
  create(run, spec) {
    const existing = this.store.get("run", run.id, run);
    if (existing) return existing;
    spec = validateWorkflow(spec);
    return this.store.store.tx(() => {
      const r = this.store.change("run", {
        id: run.id,
        teamId: run.teamId,
        projectId: run.projectId,
        dataEpoch: run.dataEpoch,
        spec,
        inputHash: digest({ text: run.text, context: run.context }),
        status: "queued",
        createdAt: stamp(),
      });
      for (const n of spec.nodes)
        this.store.change("node_run", {
          id: `${r.id}:${n.id}`,
          runId: r.id,
          teamId: r.teamId,
          projectId: r.projectId,
          dataEpoch: r.dataEpoch,
          nodeId: n.id,
          status: "pending",
          attempt: 0,
          createdAt: stamp(),
        });
      return r;
    });
  }
  select(scope, nodeId, value) {
    const r = this.store.get("run", scope.id, scope);
    if (!r) throw Error("找不到流程。");
    const g = this.store.get("gate", `${r.id}:${nodeId}`, r);
    if (!g) throw Error("找不到確認點。");
    if (g.status === "approved") {
      if (digest(g.value) !== digest(value)) throw Error("已確認其他選擇。");
      return;
    }
    if (r.status !== "awaiting_input") throw Error("流程不在等待確認。");
    if (g.type === "select_one" && !g.options?.includes(value))
      throw Error("無效選項。");
    this.store.change("gate", {
      ...g,
      status: "approved",
      value,
      approvedAt: stamp(),
    });
    this.store.change("run", {
      ...r,
      status: "queued",
      productionInputHash: digest(scope.context || {}),
    });
  }
  prepareResume(scope, fromNode) {
    const r = this.store.get("run", scope.id, scope);
    if (!r) throw Error("找不到流程。");
    if (this.active.has(r.id) || !["failed", "interrupted"].includes(r.status))
      throw Error("此流程目前不可續跑。");
    const stale = new Set();
    if (fromNode) {
      if (!r.spec.nodes.some((n) => n.id === fromNode))
        throw Error("找不到重算節點。");
      stale.add(fromNode);
      let more = true;
      while (more) {
        more = false;
        for (const n of r.spec.nodes)
          if (!stale.has(n.id) && n.dependsOn.some((d) => stale.has(d))) {
            stale.add(n.id);
            more = true;
          }
      }
    }
    this.store.store.tx(() => {
      for (const n of this.store.nodes(r))
        if (stale.has(n.nodeId) || ["failed", "interrupted"].includes(n.status))
          this.store.change("node_run", {
            ...n,
            status: stale.has(n.nodeId) ? "stale" : "pending",
            error: null,
          });
      for (const g of this.store.list("gate", r, r.id))
        if (stale.has(g.nodeId))
          this.store.change("gate", { ...g, status: "stale", value: null });
      this.store.change("run", { ...r, status: "queued", error: null });
    });
  }
  stop(scope, status = "cancelled") {
    const r = this.store.get("run", scope.id, scope);
    if (!r || ["succeeded", "cancelled"].includes(r.status)) return;
    this.active.get(r.id)?.abort();
    this.store.store.tx(() => {
      for (const n of this.store.nodes(r))
        if (
          [
            "pending",
            "ready",
            "running",
            "awaiting_approval",
            "stale",
          ].includes(n.status)
        )
          this.store.change("node_run", {
            ...n,
            status: status === "interrupted" ? "interrupted" : "cancelled",
            finishedAt: stamp(),
          });
      this.store.change("run", { ...r, status, finishedAt: stamp() });
    });
  }
  async execute(
    scope,
    {
      handlers,
      validators = {},
      signal,
      onChange = () => {},
      skip = () => false,
      validateOutputs = false,
    },
  ) {
    let run = this.store.get("run", scope.id, scope);
    if (!run) throw Error("找不到流程。");
    if (this.active.has(run.id)) throw Error("流程已執行中。");
    const controller = new AbortController();
    this.active.set(run.id, controller);
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const live = () => !combined.aborted;
    const saveRun = (patch) => {
      run = this.store.change("run", { ...run, ...patch });
      onChange(run);
    };
    const gateFor = (node, output) => {
      const id = `${run.id}:${node.id}`,
        old = this.store.get("gate", id, run);
      if (old?.status === "approved") return false;
      this.store.change("gate", {
        id,
        runId: run.id,
        teamId: run.teamId,
        projectId: run.projectId,
        dataEpoch: run.dataEpoch,
        nodeId: node.id,
        type: node.gate?.type || "approve_before",
        status: "awaiting_input",
        options: Array.isArray(output) ? output.map((t) => t.id) : undefined,
        createdAt: old?.createdAt || stamp(),
      });
      return true;
    };
    try {
      saveRun({ status: "running", error: null });
      while (live()) {
        const records = this.store.nodes(run),
          byId = new Map(records.map((n) => [n.nodeId, n]));
        if (records.some((n) => n.status === "failed")) {
          saveRun({
            status: "failed",
            error: records.find((n) => n.status === "failed").error,
          });
          break;
        }
        let waiting = false;
        for (const n of run.spec.nodes) {
          const record = byId.get(n.id);
          if (
            record.status === "succeeded" &&
            n.gate &&
            n.gate.type !== "approve_before" &&
            gateFor(n, record.output)
          )
            waiting = true;
        }
        if (waiting) {
          saveRun({ status: "awaiting_input" });
          break;
        }
        if (records.every((n) => ["succeeded", "skipped"].includes(n.status))) {
          saveRun({ status: "succeeded", finishedAt: stamp() });
          break;
        }
        const ready = run.spec.nodes
          .filter(
            (n) =>
              ["pending", "stale", "ready", "awaiting_approval"].includes(
                byId.get(n.id).status,
              ) &&
              n.dependsOn.every((d) =>
                ["succeeded", "skipped"].includes(byId.get(d).status),
              ),
          )
          .slice(0, run.spec.maxParallel);
        if (!ready.length) throw Error("流程無可執行節點。");
        await Promise.all(
          ready.map(async (node) => {
            let record = byId.get(node.id);
            if (skip(node)) {
              this.store.change("node_run", { ...record, status: "skipped" });
              return;
            }
            if (
              (node.kind === "gate" || node.gate?.type === "approve_before") &&
              gateFor(node)
            ) {
              this.store.change("node_run", {
                ...record,
                status: "awaiting_approval",
              });
              waiting = true;
              return;
            }
            const dependencies = node.dependsOn.map((d) => ({
              id: d,
              output: byId.get(d).artifactId ? this.store.get("artifact",byId.get(d).artifactId,run)?.content : byId.get(d).output,
              artifactId: byId.get(d).artifactId,
            }));
            const gates = this.store
              .list("gate", run, run.id)
              .filter((g) => g.status === "approved")
              .map((g) => ({ nodeId: g.nodeId, value: g.value }));
            const key = digest({
              runId: run.id,
              nodeId: node.id,
              inputsHash: digest({
                input: run.inputHash,
                productionInput: run.productionInputHash,
                dependencies,
                gates,
              }),
              specVersion: run.spec.version,
            });
            for (let retry = 0; retry <= node.retry.max && live(); retry++) {
              record = this.store.change("node_run", {
                ...record,
                status: "running",
                attempt: record.attempt + 1,
                idempotencyKey: key,
                startedAt: stamp(),
                error: null,
              });
              onChange(run);
              const timeout = new AbortController(),
                nodeSignal = AbortSignal.any([combined, timeout.signal]);
              let timer;
              try {
                const output = await Promise.race([
                  node.kind === "gate"
                    ? Promise.resolve(null)
                    : Promise.resolve().then(() =>
                        handlers[node.id]({
                          node,
                          signal: nodeSignal,
                          dependencies,
                          attempt: record.attempt,
                          previousError: record.lastError,
                        }),
                      ),
                  new Promise((_, reject) => {
                    timer = setTimeout(() => {
                      timeout.abort();
                      reject(
                        Object.assign(Error("節點逾時。"), { code: "timeout" }),
                      );
                    }, node.budget.timeoutSec * 1000);
                  }),
                  new Promise((_, reject) =>
                    nodeSignal.addEventListener(
                      "abort",
                      () =>
                        reject(
                          Object.assign(Error("節點已停止。"), {
                            code: timeout.signal.aborted
                              ? "timeout"
                              : "cancelled",
                          }),
                        ),
                      { once: true },
                    ),
                  ),
                ]);
                if (!live()) return;
                for (const name of node.validate) {
                  if (!validators[name])
                    throw Object.assign(Error("未註冊的驗證器：" + name), {
                      code: "schema_invalid",
                    });
                  try {
                    validators[name](output);
                  } catch (e) {
                    e.code = "schema_invalid";
                    throw e;
                  }
                }
                if(validateOutputs)try{validateArtifact(node.outputs[0]||'Result',output??null,{sources:scope.search?.sources||[]});}catch(e){e.code='schema_invalid';throw e;}
                this.store.store.tx(() => {
                  const artifact = this.store.put("artifact", {
                    id: randomUUID(),
                    runId: run.id,
                    teamId: run.teamId,
                    projectId: run.projectId,
                    dataEpoch: run.dataEpoch,
                    nodeId: node.id,
                    type: node.outputs[0] || "Result",
                    version: record.attempt,
                    hash: digest(output ?? null),
                    inputs: dependencies
                      .map((d) => d.artifactId)
                      .filter(Boolean),
                    content: output ?? null,
                    createdAt: stamp(),
                  });
                  record = this.store.change("node_run", {
                    ...record,
                    status: "succeeded",
                    output: output ?? null,
                    artifactId: artifact.id,
                    finishedAt: stamp(),
                  });
                });
                if(validateOutputs)this.store.put('trace',{id:randomUUID(),runId:run.id,teamId:run.teamId,projectId:run.projectId,dataEpoch:run.dataEpoch,nodeId:node.id,attempt:record.attempt,phase:'validated',validation:{passed:true,type:node.outputs[0]},createdAt:stamp()});
                onChange(run);
                break;
              } catch (e) {
                if (!live()) return;
                record = this.store.change("node_run", {
                  ...record,
                  status: "failed",
                  error: e.message,
                  lastError: e.message,
                  errorCode: e.code || "execution_failed",
                  finishedAt: stamp(),
                });
                if(validateOutputs)this.store.put('trace',{id:randomUUID(),runId:run.id,teamId:run.teamId,projectId:run.projectId,dataEpoch:run.dataEpoch,nodeId:node.id,attempt:record.attempt,phase:'validation_or_execution_failed',validation:{passed:false,type:node.outputs[0]},error:e.message,errorCode:e.code||'execution_failed',createdAt:stamp()});
                onChange(run);
                if (retry === node.retry.max || !node.retry.on.includes(e.code))
                  break;
              } finally {
                clearTimeout(timer);
              }
            }
          }),
        );
        if (waiting && live()) {
          saveRun({ status: "awaiting_input" });
          break;
        }
      }
    } catch (e) {
      if (live()) saveRun({ status: "failed", error: e.message });
    } finally {
      this.active.delete(run.id);
    }
    return this.store.get("run", run.id, scope);
  }
}
