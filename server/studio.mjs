import { uid, now, fail } from "./store.mjs";
export const SERIES = ["我做了一個東西", "如果換我來做", "這個點子很厲害"];
const fields = [
  "title",
  "audience",
  "observation",
  "stance",
  "hypothesis",
  "spreadReason",
  "nextAction",
  "decision",
];
const text = (v, max = 10000) => {
  if (typeof v !== "string" || v.length > max)
    throw fail("文字格式錯誤或超過長度限制。");
  return v;
};
function imageData(value) {
  if (!value) return null;
  const data = text(value.data, 1500000);
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) throw fail("只接受 PNG 或 JPEG 圖片。");
  const bytes = Buffer.from(match[2], "base64");
  if (
    bytes.length > 1000000 ||
    (match[1] === "png"
      ? bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      : bytes.subarray(0, 3).toString("hex") !== "ffd8ff")
  )
    throw fail("圖片格式不正確或超過 1 MB。");
  if (
    !Number.isFinite(value.position) ||
    value.position < 0 ||
    value.position > 1
  )
    throw fail("圖片裁切位置無效。");
  return {
    data,
    position: value.position,
    alt: text(value.alt || "", 500),
    credit: text(value.credit || "", 500),
  };
}
export class Studio {
  constructor(store) {
    this.s = store;
  }
  get(id) {
    const w = this.s.get("work", id);
    if (!w) throw fail("找不到作品。", 404);
    return w;
  }
  detail(id) {
    const w = this.get(id);
    return {
      ...w,
      dataEpoch: this.s.get("settings", "main").epoch,
      articles: Object.fromEntries(
        Object.entries(w.variants).map(([k, v]) => [k, this.s.article(v)]),
      ),
      publications: this.s
        .all("workPublication")
        .filter((x) => x.workId === id),
      metrics: this.s.all("metricSnapshot").filter((x) => x.workId === id),
      sources: w.sourceIds
        .map((id) => this.s.get("socialPost", id))
        .filter(Boolean),
    };
  }
  create(b) {
    return this.s.tx(() => {
      const id = b.id || uid();
      if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id))
        throw fail("作品識別碼無效。");
      if (this.s.get("work", id)) return this.get(id);
      const variants = {};
      for (const k of ["master", "threads", "instagram"]) {
        const a = this.s.create();
        variants[k] = a.id;
        const body = b.content?.[k] || "";
        if (body)
          this.s.update(a.id, {
            title:
              text(b.title || "新作品", 500) +
              (k === "master" ? "" : ` · ${k}`),
            body: text(body, 500000),
            baseRevision: 0,
          });
      }
      const w = {
        id,
        version: 0,
        createdAt: now(),
        updatedAt: now(),
        status: "idea",
        series: SERIES[0],
        sourceIds: [],
        slides: Array.from({ length: 6 }, (_, i) => ({
          id: uid(),
          title: i === 0 ? "一個值得實現的點子" : "",
          body: "",
          layout: i === 0 ? "cover" : i === 5 ? "closing" : "content",
        })),
        ...Object.fromEntries(fields.map((k) => [k, ""])),
        variants,
      };
      this.s.put("work", w);
      return this.update(id, {
        ...b,
        dataEpoch: this.s.get("settings", "main").epoch,
        baseVersion: 0,
      });
    });
  }
  update(id, b) {
    return this.s.tx(() => {
      const w = this.get(id);
      if (b.dataEpoch && b.dataEpoch !== this.s.get("settings", "main").epoch)
        throw fail("資料已還原，請另存或匯出本地修改後重新載入。", 409);
      if (w.version !== b.baseVersion)
        throw fail(
          "作品已有較新版本。你的內容仍保留，請匯出或另存後重新載入。",
          409,
        );
      const n = { ...w };
      for (const f of fields)
        if (b[f] !== undefined) n[f] = text(b[f], f === "title" ? 500 : 10000);
      for (const [k, allowed] of [
        ["series", SERIES],
        ["status", ["idea", "making", "ready", "archived"]],
      ])
        if (b[k] !== undefined) {
          if (!allowed.includes(b[k])) throw fail("狀態或系列無效。");
          n[k] = b[k];
        }
      if (b.sourceIds !== undefined) {
        if (
          !Array.isArray(b.sourceIds) ||
          b.sourceIds.length > 3 ||
          new Set(b.sourceIds).size !== b.sourceIds.length
        )
          throw fail("請選擇最多三份不同來源。");
        for (const source of b.sourceIds) {
          const p = this.s.get("socialPost", source);
          if (!p || p.deletedAt) throw fail("來源已不存在。");
        }
        n.sourceIds = b.sourceIds;
      }
      if (b.slides !== undefined) {
        if (
          !Array.isArray(b.slides) ||
          b.slides.length < 4 ||
          b.slides.length > 8
        )
          throw fail("輪播需要 4～8 頁。");
        if (new Set(b.slides.map((x) => x.id)).size !== b.slides.length)
          throw fail("頁面識別重複。");
        n.slides = b.slides.map((x) => ({
          id: text(x.id, 80),
          image: imageData(x.image),
          title: text(x.title, 500),
          body: text(x.body, 4000),
          layout: [
            "cover",
            "content",
            "comparison",
            "checklist",
            "closing",
          ].includes(x.layout)
            ? x.layout
            : "content",
        }));
      }
      this.s.put("workRevision", {
        ...w,
        id: uid(),
        workId: id,
        savedAt: now(),
      });
      return this.s.put("work", {
        ...n,
        version: w.version + 1,
        updatedAt: now(),
      });
    });
  }
  publication(id, b) {
    const w = this.get(id);
    if (!["threads", "instagram"].includes(b.platform))
      throw fail("請選擇發布平台。");
    const a = this.s.article(w.variants[b.platform]);
    if (b.revision !== a.revision) throw fail("文案已更新，請重新確認。", 409);
    let url = "";
    if (b.url) {
      try {
        const u = new URL(b.url);
        const host = u.hostname.toLowerCase();
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          !(
            b.platform === "instagram"
              ? ["instagram.com", "www.instagram.com"]
              : [
                  "threads.com",
                  "www.threads.com",
                  "threads.net",
                  "www.threads.net",
                ]
          ).includes(host)
        )
          throw Error();
        url = u.href;
      } catch {
        throw fail("請填入該平台的 HTTPS 貼文連結。");
      }
    }
    const time = Date.parse(b.publishedAt);
    if (!Number.isFinite(time) || time > Date.now() + 60000)
      throw fail("請填寫實際發布時間，不可填未來時間。");
    return this.s.put("workPublication", {
      id: uid(),
      workId: id,
      platform: b.platform,
      url,
      publishedAt: new Date(time).toISOString(),
      account: text(b.account || "", 200),
      verification: "user_reported",
      status: "manual_reported",
      snapshot: {
        title: a.title,
        body: a.body,
        revision: a.revision,
        articleId: a.id,
      },
      createdAt: now(),
    });
  }
  metric(id, b) {
    this.get(id);
    const p = this.s.get("workPublication", b.publicationId);
    if (!p || p.workId !== id) throw fail("請先選擇此作品的發布紀錄。");
    const time = Date.parse(b.observedAt);
    if (
      !Number.isFinite(time) ||
      time < Date.parse(p.publishedAt) ||
      time > Date.now() + 60000
    )
      throw fail("觀察時間須在發布之後、現在之前。");
    const metrics = {};
    for (const k of [
      "reach",
      "views",
      "shares",
      "saves",
      "attributed_follows",
      "replies",
      "tool_completions",
      "production_minutes",
    ]) {
      const v = b.metrics?.[k] ?? null;
      if (v !== null && (!Number.isSafeInteger(v) || v < 0))
        throw fail("指標須為非負整數，未知請留白。");
      metrics[k] = v;
    }
    return this.s.put("metricSnapshot", {
      id: uid(),
      workId: id,
      publicationId: p.id,
      platform: p.platform,
      observedAt: new Date(time).toISOString(),
      windowHours: (time - Date.parse(p.publishedAt)) / 3600000,
      source: "manual",
      scope: "post_lifetime",
      metrics,
      note: text(b.note || "", 3000),
      createdAt: now(),
    });
  }
}
export function mountStudio(app, store) {
  const studio = new Studio(store);
  app.get("/api/studio/works", (req, res) =>
    res.json(
      store.all("work").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    ),
  );
  app.post("/api/studio/works", (req, res) =>
    res.json(studio.create(req.body)),
  );
  app.get("/api/studio/works/:id", (req, res) =>
    res.json(studio.detail(req.params.id)),
  );
  app.patch("/api/studio/works/:id", (req, res) =>
    res.json(studio.update(req.params.id, req.body)),
  );
  app.get("/api/studio/works/:id/history", (req, res) =>
    res.json(
      store
        .all("workRevision")
        .filter((x) => x.workId === req.params.id)
        .sort((a, b) => b.version - a.version),
    ),
  );
  app.post("/api/studio/works/:id/restore", (req, res) => {
    const r = store.get("workRevision", req.body.revisionId);
    if (!r || r.workId !== req.params.id) throw fail("找不到版本。", 404);
    res.json(
      studio.update(req.params.id, { ...r, baseVersion: req.body.baseVersion }),
    );
  });
  app.post("/api/studio/works/:id/publications", (req, res) =>
    res.json(studio.publication(req.params.id, req.body)),
  );
  app.post("/api/studio/works/:id/metrics", (req, res) =>
    res.json(studio.metric(req.params.id, req.body)),
  );
  app.post("/api/studio/works/:id/outline", (req, res) => {
    const w = studio.get(req.params.id);
    if (w.variants.outline) return res.json(store.article(w.variants.outline));
    res.json(
      store.tx(() => {
        const a = store.create();
        store.put("work", {
          ...w,
          variants: { ...w.variants, outline: a.id },
          version: w.version + 1,
          updatedAt: now(),
        });
        return a;
      }),
    );
  });
  app.post("/api/studio/works/:id/outline/apply", (req, res) => {
    const w = studio.get(req.params.id);
    if (!w.variants.outline) throw fail("尚未建立輪播大綱。");
    const a = store.article(w.variants.outline);
    let parsed;
    try {
      parsed = JSON.parse(
        a.body
          .trim()
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, ""),
      );
    } catch {
      throw fail("大綱需要有效 JSON，請先接受 AI 建議或修正格式。");
    }
    if (!Array.isArray(parsed.slides)) throw fail("大綱缺少 slides。");
    res.json(
      studio.update(w.id, {
        baseVersion: req.body.baseVersion,
        dataEpoch: req.body.dataEpoch,
        slides: parsed.slides.map((x) => ({ ...x, id: uid() })),
      }),
    );
  });
  app.post("/api/studio/works/:id/followup", (req, res) => {
    const w = studio.get(req.params.id);
    res.json(
      studio.create({
        title: w.title + " · 下一輪",
        series: w.series,
        sourceIds: w.sourceIds,
        observation: w.decision,
        stance: w.stance,
        hypothesis: "",
        nextAction: "根據上輪結果，選一個因素繼續驗證。",
      }),
    );
  });
  app.get("/api/studio/works/:id/export", (req, res) =>
    res.json({
      schemaVersion: 1,
      exportedAt: now(),
      work: studio.detail(req.params.id),
      history: store
        .all("workRevision")
        .filter((x) => x.workId === req.params.id),
      revisions: store
        .all("revision")
        .filter((r) =>
          Object.values(studio.get(req.params.id).variants).includes(
            r.articleId,
          ),
        ),
    }),
  );
  return studio;
}
