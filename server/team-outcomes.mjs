import { randomUUID } from "node:crypto";
import { fail, now } from "./store.mjs";
import { digest } from "./workflow-store.mjs";
import { validateArtifact } from "./artifact-schema.mjs";
const metrics = ["views", "likes", "comments", "saves", "shares"];
export function insightReport(dataset) {
  const observations = metrics.map((metric) => {
    const values = dataset.rows.filter((r) => Number.isSafeInteger(r[metric]));
    return {
      metric,
      value: values.length
        ? values.reduce((sum, r) => sum + r[metric], 0)
        : null,
      knownRows: values.length,
      totalRows: dataset.rows.length,
      citations: values.map((r) => ({
        rowId: r.id,
        field: metric,
        value: r[metric],
        source: dataset.source,
      })),
    };
  });
  return {
    observations,
    hypotheses: ["目前數據只能描述已提供樣本，無法單獨判定內容造成成效變化。"],
    experiments: [
      "下一輪固定觀察期間與發文條件，改動單一內容因素，再補回同一組指標。",
    ],
    datasetHash: digest(dataset),
    source: dataset.source,
    limitations: "手動回填或匯入，非官方平台同步；未知值保留 null，不推估。",
  };
}
export function mountTeamOutcomes(app, store, { engine, workflowStore }) {
  const route = "/api/teams/:teamId/projects/:projectId";
  const scope = (req) => {
    const { teamId, projectId } = req.params;
    if (![teamId, projectId].every((x) => /^[\w-]{1,80}$/.test(x)))
      throw fail("無效專案。");
    return {
      teamId,
      projectId,
      dataEpoch: store.get("settings", "main").epoch,
    };
  };
  const belongs = (r, s) =>
    r &&
    r.teamId === s.teamId &&
    r.projectId === s.projectId &&
    r.dataEpoch === s.dataEpoch;
  app.post(route + "/runs/:id/review", (req, res) => {
    const s = scope(req),
      r = store.get("teamRun", req.params.id);
    if (!belongs(r, s) || r.status !== "completed" || !r.deliverable)
      throw fail("找不到完成的圖文。", 404);
    if (req.body.approved !== true) throw fail("需明確核准成品。");
    const prior = workflowStore
      .list("artifact", s, r.id)
      .find(
        (a) => a.type === "Delivery" && a.inputHash === digest(r.deliverable),
      );
    if (prior) {
      r.approvedDeliveryId = prior.id;
      store.put("teamRun", r);
      workflowStore.change("gate", {
        id: r.id + ":delivery-review",
        runId: r.id,
        ...s,
        nodeId: "human-review",
        type: "approve_after",
        status: "approved",
        artifactId: prior.id,
        approvedAt: now(),
        createdAt: now(),
      });
      return res.json(prior);
    }
    const content = {
      ...structuredClone(r.deliverable),
      approvedAt: now(),
      reviewStatus: "已核准",
    };
    validateArtifact("Delivery", content);
    const a = workflowStore.put("artifact", {
      id: randomUUID(),
      runId: r.id,
      ...s,
      nodeId: "human-review",
      type: "Delivery",
      version: 1,
      inputHash: digest(r.deliverable),
      content,
      hash: digest(content),
      createdAt: now(),
    });
    workflowStore.change("gate", {
      id: r.id + ":delivery-review",
      runId: r.id,
      ...s,
      nodeId: "human-review",
      type: "approve_after",
      status: "approved",
      artifactId: a.id,
      approvedAt: now(),
      createdAt: now(),
    });
    r.approvedDeliveryId = a.id;
    store.put("teamRun", r);
    res.status(201).json(a);
  });
  app.post(route + "/schedule-delivery", async (req, res) => {
    const s = scope(req),
      b = req.body;
    if (b.confirmed !== true || !/^[-\w]{1,80}$/.test(b.id || ""))
      throw fail("需確認排程及有效請求識別碼。");
    const delivery = workflowStore.get("artifact", b.deliveryId, s),
      account = store.get("localAccount", b.accountId);
    if (delivery?.type !== "Delivery" || !belongs(account, s))
      throw fail("請選擇同專案已核准成品與本機帳號。");
    const sourceRun = store.get("teamRun", delivery.runId);
    if (
      sourceRun?.approvedDeliveryId !== delivery.id ||
      sourceRun.status !== "completed"
    )
      throw fail("成品已有新版或未完成，請重新審稿。", 409);
    if (
      typeof b.scheduledAt !== "string" ||
      !/(Z|[+-]\d\d:\d\d)$/.test(b.scheduledAt) ||
      !Number.isFinite(Date.parse(b.scheduledAt))
    )
      throw fail("需有效時間與時區。");
    const requestHash = digest({
      deliveryId: b.deliveryId,
      accountId: b.accountId,
      scheduledAt: b.scheduledAt,
    });
    const prior = store.get("localSchedule", b.id);
    if (prior) {
      if (!belongs(prior, s) || prior.requestHash !== requestHash)
        throw fail("排程識別碼衝突。", 409);
      return res.json(prior);
    }
    const run = {
      id: "schedule-" + b.id,
      ...s,
      text: "建立本機排程草稿",
      context: {},
    };
    engine.create(run, {
      id: "schedule-draft",
      version: 1,
      nodes: [
        {
          id: "schedule",
          kind: "capability",
          capability: "local_schedule",
          outputs: ["ScheduleDraft"],
          dependsOn: [],
        },
      ],
    });
    const result = await engine.execute(run, {
      validateOutputs: true,
      handlers: {
        schedule: async () => {
          const draft = {
            accountId: b.accountId,
            scheduledAt: new Date(b.scheduledAt).toISOString(),
            timezone: "Asia/Taipei",
            snapshot: {
              title: delivery.content.title,
              caption: delivery.content.caption,
              images: delivery.content.files.map((f) => ({ ...f })),
              deliveryId: delivery.id,
              deliveryHash: delivery.hash,
            },
          };
          store.put("localSchedule", {
            id: b.id,
            ...s,
            ...draft,
            requestHash,
            articleId: delivery.runId,
            versionId: delivery.id,
            status: "scheduled",
            revision: 1,
            createdAt: now(),
            updatedAt: now(),
          });
          return draft;
        },
      },
    });
    if (result.status !== "succeeded")
      throw fail(result.error || "排程失敗。", 500);
    res.status(201).json(store.get("localSchedule", b.id));
  });
  app.get(route + "/performance", (req, res) => {
    const s = scope(req);
    res.json(store.all("performanceDataset").filter((d) => belongs(d, s)));
  });
  app.post(route + "/performance", (req, res) => {
    const s = scope(req),
      b = req.body;
    if (
      typeof b.source !== "string" ||
      !b.source.trim() ||
      b.source.length > 1000 ||
      !Array.isArray(b.rows) ||
      !b.rows.length ||
      b.rows.length > 1000
    )
      throw fail("請提供來源說明與1–1000筆資料。");
    const seen = new Set();
    const rows = b.rows.map((r) => {
      if (!/^[\w-]{1,80}$/.test(r.id) || seen.has(r.id))
        throw fail("重複或無效資料列。");
      seen.add(r.id);
      if (r.publicationId) {
        const record = store.get("localSchedule", r.publicationId);
        if (!belongs(record, s) || record.status !== "published_manual")
          throw fail("發布紀錄不存在或尚未手動標記發布。");
      }
      const row = { id: r.id, publicationId: r.publicationId || null };
      for (const k of metrics) {
        const v = r[k] ?? null;
        if (v !== null && (!Number.isSafeInteger(v) || v < 0))
          throw fail("成效數字必須為非負整數或 null。");
        row[k] = v;
      }
      return row;
    });
    if (
      metrics.some(
        (k) => !Number.isSafeInteger(rows.reduce((n, r) => n + (r[k] ?? 0), 0)),
      )
    )
      throw fail("加總超過安全數值範圍。");
    const d = {
      id: randomUUID(),
      ...s,
      source: b.source,
      rows,
      createdAt: now(),
      sourceType: "user_reported",
    };
    store.put("performanceDataset", d);
    res.status(201).json(d);
  });
  app.post(route + "/performance/:id/insight", async (req, res) => {
    const s = scope(req),
      d = store.get("performanceDataset", req.params.id);
    if (!belongs(d, s)) throw fail("找不到資料。", 404);
    const run = {
      id: "insight-" + d.id,
      ...s,
      text: "分析已提供資料",
      context: {},
    };
    engine.create(run, {
      id: "performance-insight",
      version: 1,
      nodes: [
        {
          id: "analyze",
          kind: "capability",
          capability: "analyze_metrics",
          outputs: ["InsightReport"],
          dependsOn: [],
        },
      ],
    });
    const result = await engine.execute(run, {
      validateOutputs: true,
      handlers: { analyze: async () => insightReport(d) },
    });
    if (result.status !== "succeeded") throw fail(result.error || "分析失敗。");
    res.json(workflowStore.artifacts(run).at(-1));
  });
}
