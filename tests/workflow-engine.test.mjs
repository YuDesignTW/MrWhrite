import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { WorkflowStore } from "../server/workflow-store.mjs";
import { WorkflowEngine } from "../server/workflow-engine.mjs";
import { validateWorkflow } from "../server/workflow-spec.mjs";
const node = (id, dependsOn = [], extra = {}) => ({
  id,
  kind: "agent",
  role: "writer",
  dependsOn,
  outputs: ["Copy"],
  ...extra,
});
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "engine-"));
  const raw = new Store(dir),
    store = new WorkflowStore(raw),
    engine = new WorkflowEngine(store);
  const run = {
    id: "r",
    teamId: "t",
    projectId: "p",
    dataEpoch: raw.get("settings", "main").epoch,
    text: "request",
    context: {},
  };
  t.after(() => {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { raw, store, engine, run };
}
test("spec accepts unordered DAG, rejects cycles, unknown roles/capabilities and excessive budgets", () => {
  assert.equal(
    validateWorkflow({
      id: "flow",
      version: 1,
      nodes: [node("b", ["a"]), node("a")],
    }).nodes.length,
    2,
  );
  for (const nodes of [
    [node("a", ["b"]), node("b", ["a"])],
    [node("a", ["absent"])],
    [node("a"), node("a")],
    [node("a", [], { budget: { timeoutSec: 180 } })],
  ])
    assert.throws(() => validateWorkflow({ id: "flow", version: 1, nodes }));
  assert.throws(() =>
    validateWorkflow(
      { id: "f", version: 1, nodes: [node("a")] },
      { roles: ["director"] },
    ),
  );
  assert.throws(() =>
    validateWorkflow(
      {
        id: "f",
        version: 1,
        nodes: [{ id: "a", kind: "capability", capability: "publish" }],
      },
      { capabilities: ["search"] },
    ),
  );
});
test("parallel failure then resume reuses successful artifact with zero successful-node calls; event snapshots reconstruct status", async (t) => {
  const { store, engine, run } = setup(t);
  engine.create(run, {
    id: "f",
    version: 1,
    nodes: [node("a"), node("b"), node("c", ["a", "b"])],
  });
  let a = 0,
    b = 0,
    c = 0,
    release;
  const barrier = new Promise((r) => (release = r));
  const handlers = {
    a: async () => {
      a++;
      await barrier;
      return "saved";
    },
    b: async () => {
      b++;
      release();
      throw Error("failure");
    },
    c: async () => {
      c++;
      return "done";
    },
  };
  assert.equal((await engine.execute(run, { handlers })).status, "failed");
  assert.equal(store.node(run, "a").status, "succeeded");
  const artifact = store.node(run, "a").artifactId;
  engine.prepareResume(run);
  handlers.a = () => {
    throw Error("successful node must not be called");
  };
  handlers.b = async () => {
    b++;
    return "repaired";
  };
  assert.equal((await engine.execute(run, { handlers })).status, "succeeded");
  assert.deepEqual([a, b, c], [1, 2, 1]);
  assert.equal(store.node(run, "a").artifactId, artifact);
  const snapshots = new Map(
    store
      .list("event", run, run.id)
      .map((e) => [e.entity + ":" + e.snapshot.id, e.snapshot]),
  );
  assert.equal(snapshots.get("run:r").status, "succeeded");
  assert.equal(snapshots.get("node_run:r:b").attempt, 2);
  assert.equal(store.get("run", "r", { ...run, projectId: "other" }), null);
  assert.deepEqual(
    store.list("artifact", { ...run, teamId: "other" }, run.id),
    [],
  );
});
test("select gate persists, rejects unoffered choice, survives recovery, and blocks dependent calls", async (t) => {
  const { store, engine, run } = setup(t);
  engine.create(run, {
    id: "f",
    version: 1,
    nodes: [
      node("topics", [], { gate: { type: "select_one" } }),
      node("write", ["topics"]),
    ],
  });
  let writes = 0;
  const handlers = {
    topics: async () => [{ id: "one" }],
    write: async () => ++writes,
  };
  assert.equal(
    (await engine.execute(run, { handlers })).status,
    "awaiting_input",
  );
  assert.equal(writes, 0);
  store.recover();
  assert.equal(store.get("run", run.id, run).status, "awaiting_input");
  assert.throws(() => engine.select(run, "topics", "bad"));
  engine.select(run, "topics", "one");
  engine.select(run, "topics", "one");
  assert.equal((await engine.execute(run, { handlers })).status, "succeeded");
  assert.equal(writes, 1);
});
test("timeout retries boundedly and ignores late output; interruption recovers, stale recomputes downstream only", async (t) => {
  const { store, engine, run } = setup(t);
  engine.create(run, {
    id: "f",
    version: 1,
    nodes: [
      node("a"),
      node("b", ["a"], {
        budget: { timeoutSec: 0.01 },
        retry: { max: 1, on: ["timeout"] },
      }),
    ],
  });
  let calls = 0;
  const handlers = {
    a: async () => 1,
    b: () => {
      calls++;
      return new Promise(() => {});
    },
  };
  assert.equal((await engine.execute(run, { handlers })).status, "failed");
  assert.equal(calls, 2);
  engine.prepareResume(run, "a");
  assert.equal(store.node(run, "a").status, "stale");
  assert.equal(store.node(run, "b").status, "stale");
  handlers.b = async () => 2;
  assert.equal((await engine.execute(run, { handlers })).status, "succeeded");
  assert.equal(store.node(run, "a").attempt, 2);
});
test("cancellation is terminal and late completion cannot create an artifact", async (t) => {
  const { store, engine, run } = setup(t);
  engine.create(run, { id: "f", version: 1, nodes: [node("a")] });
  let release;
  const executing = engine.execute(run, {
    handlers: { a: () => new Promise((r) => (release = r)) },
  });
  await new Promise((r) => setImmediate(r));
  engine.stop(run);
  release("late");
  await executing;
  assert.equal(store.get("run", run.id, run).status, "cancelled");
  assert.equal(store.artifacts(run).length, 0);
  assert.throws(() => engine.prepareResume(run));
});
test("restart interrupts unfinished nodes without changing successful artifacts or old records", async (t) => {
  const { raw, store, engine, run } = setup(t);
  raw.put("teamRun", { id: "old", status: "completed", output: "preserved" });
  engine.create(run, {
    id: "f",
    version: 1,
    nodes: [node("a"), node("b", ["a"])],
  });
  store.change("run", { ...store.get("run", run.id, run), status: "running" });
  store.change("node_run", {
    ...store.node(run, "a"),
    status: "succeeded",
    output: "saved",
  });
  store.change("node_run", { ...store.node(run, "b"), status: "running" });
  store.recover();
  assert.equal(store.get("run", run.id, run).status, "interrupted");
  assert.equal(store.node(run, "a").status, "succeeded");
  assert.equal(store.node(run, "b").status, "interrupted");
  assert.equal(raw.get("teamRun", "old").output, "preserved");
  assert.throws(
    () =>
      store.change("run", {
        ...store.get("run", run.id, run),
        projectId: "other",
      }),
    /範圍/,
  );
});
test("registered validators gate artifacts and schema retries; unknown validators fail closed", async (t) => {
  const { store, engine, run } = setup(t);
  engine.create(run, {
    id: "f",
    version: 1,
    nodes: [
      node("a", [], {
        validate: ["valid"],
        retry: { max: 1, on: ["schema_invalid"] },
      }),
    ],
  });
  let calls = 0;
  const result = await engine.execute(run, {
    handlers: { a: async () => ++calls },
    validators: {
      valid: (v) => {
        if (v !== 2) throw Error("invalid");
      },
    },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(calls, 2);
  assert.equal(store.artifacts(run).length, 1);
});
test("unknown validator fails closed and approve-before/after gates require persisted human decisions", async (t) => {
  const { store, engine, run } = setup(t);
  engine.create(run, {
    id: "f",
    version: 1,
    nodes: [
      node("a", [], {
        gate: { type: "approve_before" },
        validate: ["unknown"],
      }),
    ],
  });
  let calls = 0;
  const handlers = { a: async () => ++calls };
  assert.equal(
    (await engine.execute(run, { handlers })).status,
    "awaiting_input",
  );
  assert.equal(calls, 0);
  engine.select(run, "a", true);
  assert.equal((await engine.execute(run, { handlers })).status, "failed");
  assert.equal(store.artifacts(run).length, 0);
  const other = { ...run, id: "after" };
  engine.create(other, {
    id: "f",
    version: 1,
    nodes: [
      node("a", [], { gate: { type: "approve_after" } }),
      node("b", ["a"]),
    ],
  });
  assert.equal(
    (
      await engine.execute(other, {
        handlers: { a: async () => 1, b: async () => 2 },
      })
    ).status,
    "awaiting_input",
  );
  assert.equal(store.node(other, "b").attempt, 0);
  engine.select(other, "a", true);
  assert.equal(
    (
      await engine.execute(other, {
        handlers: {
          a: () => {
            throw Error("no recall");
          },
          b: async () => 2,
        },
      })
    ).status,
    "succeeded",
  );
});
