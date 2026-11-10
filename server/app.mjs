import express from "express";
import { mountStudio } from "./studio.mjs";
import { mountAgentStudio } from "./agent-studio.mjs";
import {
  Store,
  uid,
  now,
  hash,
  fail,
  applyRange,
  validateRange,
} from "./store.mjs";
import { codexStatus, runCodex, writingRules } from "./codex.mjs";
import { Backups, validateRemote } from "./backups.mjs";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { mountSocial } from "./social-routes.mjs";
export function createApp({
  dir = resolve("data"),
  runner = runCodex,
  socialOptions = {},
} = {}) {
  const store = new Store(dir),
    backups = new Backups(store),
    app = express(),
    jobs = new Map(),
    sessions = new Map();
  let restoring = false;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host || "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return res.status(403).json({ error: "不允許的主機。" });
    if (req.headers.origin && req.headers.origin !== `http://${host}`)
      return res.status(403).json({ error: "不允許的來源。" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  // Local launcher probe: no session, document contents or credentials exposed.
  app.get("/api/health", (req, res) =>
    res.json({
      app: "mr-white",
      instance: hash(resolve(dir)),
      status: "ready",
    }),
  );
  app.get("/api/session", (req, res) => {
    let id = req.headers.cookie?.match(/(?:^|; )mrwhite=([a-f\d-]+)/)?.[1];
    if (!id || !sessions.has(id)) {
      id = uid();
      sessions.set(id, { token: uid(), created: Date.now() });
      res.cookie("mrwhite", id, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
    }
    res.json({
      token: sessions.get(id).token,
      epoch: store.get("settings", "main").epoch,
    });
  });
  app.use("/api", (req, res, next) => {
    const id = req.headers.cookie?.match(/(?:^|; )mrwhite=([a-f\d-]+)/)?.[1];
    const session = sessions.get(id);
    if (!session)
      return res.status(401).json({ error: "請重新連線至本機服務。" });
    if (!["GET", "HEAD"].includes(req.method)) {
      if (
        !req.is("application/json") ||
        req.headers["x-csrf-token"] !== session.token
      )
        return res.status(403).json({ error: "請求驗證失敗。" });
      if (req.headers["x-data-epoch"] !== store.get("settings", "main").epoch)
        return res.status(409).json({
          error: "資料已從備份還原。請另存本機修改或重新載入。",
          code: "EPOCH",
        });
      if (restoring)
        return res.status(423).json({ error: "正在還原資料，請稍候。" });
    }
    next();
  });
  const social = mountSocial(app, store, {
    ...socialOptions,
    runner,
    paused: () => restoring,
  });
  mountStudio(app, store);
  const agent = mountAgentStudio(app, store, {
    runner,
    dir,
    externalBusy: () => jobs.size > 0,
    paused: () => restoring,
  });
  app.get("/api/articles", (req, res) =>
    res.json(
      store
        .all("article")
        .filter((a) => (req.query.trash ? !!a.deletedAt : !a.deletedAt))
        .sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
        ),
    ),
  );
  app.post("/api/articles", (req, res) => res.json(store.create(req.body.id)));
  app.get("/api/articles/:id", (req, res) =>
    res.json(store.article(req.params.id)),
  );
  app.patch("/api/articles/:id", (req, res) =>
    res.json(store.update(req.params.id, req.body)),
  );
  app.delete("/api/articles/:id", (req, res) => {
    if (store.locked(req.params.id)) throw fail("請先停止 AI 操作。", 423);
    res.json(
      store.put("article", {
        ...store.article(req.params.id),
        deletedAt: now(),
      }),
    );
  });
  app.post("/api/articles/:id/restore", (req, res) => {
    const a = store.article(req.params.id);
    res.json(
      store.put("article", {
        ...a,
        deletedAt: null,
        revision: a.revision + 1,
        updatedAt: now(),
      }),
    );
  });
  app.get("/api/articles/:id/revisions", (req, res) =>
    res.json(
      store
        .all("revision")
        .filter((r) => r.articleId === req.params.id)
        .sort((a, b) => b.revision - a.revision),
    ),
  );
  app.post("/api/articles/:id/revisions/:rev/restore", (req, res) => {
    const r = store.get("revision", req.params.rev);
    if (r?.articleId !== req.params.id) throw fail("找不到版本。", 404);
    res.json(
      store.update(
        req.params.id,
        { ...r, baseRevision: req.body.baseRevision },
        "restore",
      ),
    );
  });
  app.get("/api/settings", (req, res) =>
    res.json({ ...store.get("settings", "main"), dataLocation: store.dir }),
  );
  app.patch("/api/settings", (req, res) => {
    const s = store.get("settings", "main"),
      b = req.body;
    for (const key of ["animation", "wordCount", "aiConsent", "backupEnabled"])
      if (typeof b[key] === "boolean") s[key] = b[key];
    if (b.backupRemote !== undefined) {
      if (b.backupRemote) validateRemote(b.backupRemote);
      s.backupRemote = b.backupRemote;
      if (s.backupVerified !== s.backupRemote) s.backupEnabled = false;
    }
    if (
      s.backupEnabled &&
      (!s.backupVerified || s.backupVerified !== s.backupRemote)
    )
      throw fail("請先完成一次立即備份以驗證目的地。");
    if (s.backupEnabled && !s.nextBackup)
      s.nextBackup = new Date(Date.now() + 86400000).toISOString();
    res.json(store.put("settings", s));
  });
  app.get("/api/integrations/codex/status", async (req, res) =>
    res.json(await codexStatus()),
  );
  app.get("/api/operations", (req, res) =>
    res.json(
      store
        .all("operation")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30),
    ),
  );
  app.get("/api/operations/:id", (req, res) => {
    const o = store.get("operation", req.params.id);
    if (!o) throw fail("找不到操作。", 404);
    res.json(o);
  });
  const startJob = (op, prompt) => {
    store.put("operation", op);
    const job = runner(prompt, dir, {
      onOutput: (content) => {
        if (store.get("operation", op.id)?.status === "running")
          store.put("operation", {
            ...store.get("operation", op.id),
            buffer: content,
          });
      },
    });
    jobs.set(op.id, job);
    job.promise
      .then((value) => {
        let current = store.get("operation", op.id);
        if (current.status !== "running") return;
        if (!value.content.trim())
          throw fail(value.reason || "模型沒有回傳可用內容。");
        current = { ...current, buffer: value.content };
        store.put("operation", current);
        store.tx(() => {
          store.put("operation", {
            ...current,
            status: op.kind === "writing" ? "proposed" : "completed",
            completedAt: now(),
          });
        });
      })
      .catch((e) => {
        const o = store.get("operation", op.id);
        if (o.status === "running")
          store.put("operation", {
            ...o,
            status: e.cancelled
              ? "cancelled"
              : e.status === 409
                ? "conflict"
                : "failed",
            error: e.message,
            completedAt: now(),
          });
      })
      .finally(() => jobs.delete(op.id));
    return op;
  };
  app.post("/api/operations", (req, res) => {
    const b = req.body;
    if (store.get("operation", b.id))
      return res.json(store.get("operation", b.id));
    if (jobs.size || agent.busy)
      throw fail("已有一個 AI 工作正在進行，請等候或停止。", 409);
    if (!store.get("settings", "main").aiConsent)
      throw fail("請先確認 AI 資料使用告知。");
    const a = store.article(b.articleId);
    if (a.deletedAt || a.revision !== b.baseRevision)
      throw fail("文章已變更，請先儲存後重試。", 409);
    if (
      typeof b.instruction !== "string" ||
      !b.instruction.trim() ||
      b.instruction.length > 10000
    )
      throw fail("請輸入 10,000 字元以內的修改要求。");
    if (a.body.length > 40000)
      throw fail(
        "此篇超過 AI 上下文範圍（40,000 字元），請另開文章處理需要修改的段落。",
      );
    validateRange(a, b.from, b.to);
    if (b.mode === "replace_all" && !b.confirmWhole)
      throw fail("請明確選擇並確認改寫全文。");
    if (
      b.mode !== "replace_all" &&
      b.from === b.to &&
      /改寫全文|重寫整篇|全文改寫/.test(b.instruction)
    )
      throw fail("要改寫整篇，請先在範圍選單選擇「改寫全文」。");
    const voice = store.voice(),
      v = voice.config.enabled
        ? voice.versions.find((v) => v.id === voice.config.active && !v.invalid)
        : null;
    const samples = v
      ? voice.samples
          .filter((s) => v.sampleIds.includes(s.id))
          .slice(0, 3)
          .map((s) => ({ title: s.title, body: s.body.slice(0, 2500) }))
      : [];
    const op = {
      id: b.id || uid(),
      kind: "writing",
      articleId: a.id,
      baseRevision: a.revision,
      from: b.from,
      to: b.to,
      selectionHash: hash(a.body.slice(b.from, b.to)),
      original: a.body.slice(b.from, b.to),
      instruction: b.instruction,
      voiceVersion: v?.id || null,
      status: "running",
      buffer: "",
      createdAt: now(),
    };
    const prompt =
      writingRules +
      "\n" +
      JSON.stringify({
        instruction: b.instruction,
        title: a.title,
        context: a.body,
        target: {
          from: b.from,
          to: b.to,
          selected: a.body.slice(b.from, b.to),
          mode: b.mode,
        },
        voice: v?.rules || null,
        samples,
      });
    res.json(startJob(op, prompt));
  });
  app.post("/api/operations/:id/cancel", (req, res) => {
    const o = store.get("operation", req.params.id);
    if (!o) throw fail("找不到操作。", 404);
    if (o.status === "running") {
      jobs.get(o.id)?.cancel();
      store.put("operation", {
        ...o,
        status: "cancelled",
        completedAt: now(),
        error: "已停止生成，原文保留。",
      });
    }
    res.json(store.get("operation", o.id));
  });
  app.post("/api/operations/:id/apply", (req, res) => {
    const o = store.get("operation", req.params.id);
    if (
      !o ||
      o.kind !== "writing" ||
      !o.buffer ||
      !["proposed", "cancelled", "failed", "interrupted", "conflict"].includes(
        o.status,
      )
    )
      throw fail("沒有可保留的結果。");
    const a = store.article(o.articleId),
      body = applyRange(a, o, o.buffer);
    const result = store.tx(() => {
      const saved = store.update(
        a.id,
        { title: a.title, body, baseRevision: o.baseRevision },
        "ai-partial",
      );
      store.put("operation", {
        ...o,
        status: "completed",
        resultRevision: saved.revision,
      });
      return saved;
    });
    res.json(result);
  });
  app.post("/api/operations/:id/reject", (req, res) => {
    const o = store.get("operation", req.params.id);
    if (!o || o.status !== "proposed") throw fail("此建議已處理。", 409);
    res.json(store.put("operation", { ...o, status: "rejected" }));
  });
  app.get("/api/voice", (req, res) => res.json(store.voice()));
  app.post("/api/voice/import", (req, res) => {
    if (!Array.isArray(req.body.samples) || req.body.samples.length > 50)
      throw fail("每批最多 50 篇。");
    let imported = [],
      skipped = [];
    for (const input of req.body.samples) {
      const body =
        typeof input.body === "string"
          ? input.body.replace(/\r\n/g, "\n").trim()
          : "";
      const h = hash(body);
      if (
        !body ||
        Buffer.byteLength(body) > 1048576 ||
        body.includes("\uFFFD")
      ) {
        skipped.push(
          `${input.title || "未命名"}：空內容、編碼錯誤或超過 1 MB。`,
        );
        continue;
      }
      if (store.all("sample").some((s) => s.hash === h && !s.excluded)) {
        skipped.push(`${input.title || "未命名"}：重複內容。`);
        continue;
      }
      imported.push(
        store.put("sample", {
          id: uid(),
          title: String(input.title || "貼上文章").slice(0, 500),
          body,
          hash: h,
          source: input.source || "paste",
          createdAt: now(),
          excluded: false,
        }),
      );
    }
    res.json({ imported, skipped });
  });
  app.delete("/api/voice/samples/:id", (req, res) => {
    const s = store.get("sample", req.params.id);
    if (!s) throw fail("找不到例文。", 404);
    store.put("sample", { ...s, excluded: true });
    for (const v of store
      .all("voiceVersion")
      .filter((v) => v.sampleIds.includes(s.id)))
      store.put("voiceVersion", { ...v, invalid: true });
    const c = store.get("voiceConfig", "main");
    if (store.get("voiceVersion", c.active)?.invalid)
      store.put("voiceConfig", { ...c, enabled: false });
    res.json(store.voice());
  });
  app.post("/api/voice/analyze", (req, res) => {
    if (!req.body.confirmed) throw fail("請先確認例文可用來建立語氣。");
    if (!store.get("settings", "main").aiConsent)
      throw fail("請先在綁定設定確認 AI 資料使用告知。");
    if (jobs.size || agent.busy) throw fail("請等目前 AI 工作完成。", 409);
    const samples = store.voice().samples;
    if (!samples.length) throw fail("請先匯入文章。");
    const chosen = [];
    let chars = 0;
    for (const s of samples) {
      const body = s.body.slice(0, 6000);
      if (chars + body.length > 30000) break;
      chosen.push({ id: s.id, title: s.title, body });
      chars += body.length;
    }
    const op = {
      id: uid(),
      kind: "voice",
      sampleIds: chosen.map((s) => s.id),
      status: "running",
      buffer: "",
      createdAt: now(),
      sampled: chosen.length,
      total: samples.length,
    };
    res.json(
      startJob(
        op,
        writingRules +
          "\n請分析下列已核准例文的寫作風格，用 Markdown 整理整體描述、開頭、節奏、用詞、標點、避免事項。每項引用短例句並標出文章標題。依據弱要明說，不推論人口、健康與敏感身分。分析以 content 回傳。\n" +
          JSON.stringify(chosen),
      ),
    );
  });
  app.post("/api/voice/versions", (req, res) => {
    const b = req.body;
    if (
      typeof b.rules !== "string" ||
      !b.rules.trim() ||
      b.rules.length > 20000
    )
      throw fail("請填寫 20,000 字元以內的風格規則。");
    const samples = store.voice().samples;
    let ids = b.operationId
      ? store.get("operation", b.operationId)?.sampleIds
      : samples.map((s) => s.id);
    if (!ids || ids.some((id) => !samples.some((s) => s.id === id)))
      throw fail("分析使用的例文已被排除，請重新分析。");
    const v = store.put("voiceVersion", {
      id: uid(),
      rules: b.rules,
      sampleIds: ids,
      createdAt: now(),
      invalid: false,
      source: b.operationId ? "analysis + confirmed" : "manual",
    });
    store.put("voiceConfig", { id: "main", active: v.id, enabled: true });
    res.json(store.voice());
  });
  app.patch("/api/voice/config", (req, res) => {
    const c = store.get("voiceConfig", "main"),
      v = store.get("voiceVersion", req.body.active || c.active);
    if (req.body.enabled !== false && (!v || v.invalid))
      throw fail("這個版本包含已排除例文，請重新建立風格。");
    res.json(
      store.put("voiceConfig", {
        ...c,
        active: v?.id || null,
        enabled: req.body.enabled !== false,
      }),
    );
  });
  app.get("/api/backups", (req, res) => res.json(backups.list()));
  app.get("/api/backups/remote", async (req, res) =>
    res.json(await backups.remoteList()),
  );
  app.post("/api/backups/:id/download", async (req, res) => {
    const { records, ...m } = await backups.download(req.params.id);
    res.json(m);
  });
  app.get("/api/backups/status", async (req, res) =>
    res.json(await backups.status()),
  );
  app.post("/api/backups", async (req, res) =>
    res.json(
      req.body.drive ? await backups.upload() : await backups.snapshot(),
    ),
  );
  app.post("/api/backups/:id/verify", (req, res) => {
    const { records, ...m } = backups.verify(req.params.id);
    res.json(m);
  });
  app.post("/api/backups/:id/restore", async (req, res) => {
    if (req.body.confirm !== req.params.id) throw fail("請確認要還原的備份。");
    if (jobs.size || agent.busy || backups.busy || social.busy)
      throw fail("請先停止 AI 並等備份完成再還原。", 423);
    restoring = true;
    try {
      res.json(await backups.restore(req.params.id));
    } finally {
      restoring = false;
    }
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "找不到這個操作。" }),
  );
  app.use("/api", (err, req, res, next) =>
    res.status(err.status || 500).json({
      error: err.status ? err.message : "本機服務無法完成操作，請稍後重試。",
      ...(err.status && /^AGENT_[A-Z_]+$/.test(err.code || "")
        ? { code: err.code }
        : {}),
    }),
  );
  const schedule = setInterval(async () => {
    const s = store.get("settings", "main");
    if (
      s.backupEnabled &&
      s.nextBackup &&
      Date.parse(s.nextBackup) <= Date.now() &&
      !backups.busy &&
      !restoring
    ) {
      try {
        await backups.upload();
      } catch (e) {
        store.put("settings", {
          ...store.get("settings", "main"),
          lastBackupError: e.message,
          nextBackup: new Date(Date.now() + 3600000).toISOString(),
        });
      }
    }
  }, 60000);
  schedule.unref();
  return {
    app,
    store,
    backups,
    social,
    agent,
    close() {
      clearInterval(schedule);
      social.close();
      agent.close();
      for (const job of jobs.values()) job.cancel();
      store.close();
    },
  };
}
