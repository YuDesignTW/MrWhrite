import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fail, now } from "./store.mjs";
export function mountContentLibrary(
  app,
  store,
  { root = resolve("library") } = {},
) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "manifest.json"), "utf8"),
  );
  const files = new Map(
    [
      ...manifest.articles.flatMap((a) => a.versions.flatMap((v) => v.files)),
      ...manifest.styles.flatMap((s) => s.files),
      ...(manifest.resources || []),
    ].map((f) => [f.path, f]),
  );
  const epoch = () => store.get("settings", "main").epoch;
  const route = "/api/teams/:teamId/projects/:projectId";
  const scope = (req) => {
    const { teamId, projectId } = req.params;
    if (![teamId, projectId].every((v) => /^[\w-]{1,80}$/.test(v)))
      throw fail("專案識別碼無效。", 400);
    return { teamId, projectId };
  };
  const belongs = (r, s) =>
    r.teamId === s.teamId &&
    r.projectId === s.projectId &&
    r.dataEpoch === epoch();
  const all = (kind, s) => store.all(kind).filter((r) => belongs(r, s));
  function importArticles(s, ids) {
    if (
      !Array.isArray(ids) ||
      ids.some((id) => !manifest.articles.some((a) => a.id === id))
    )
      throw fail("文章不存在。", 400);
    for (const id of new Set(ids)) {
      const key = s.teamId + ":" + s.projectId + ":" + id;
      const old = store.get("contentBinding", key);
      if (!old || !belongs(old, s))
        store.put("contentBinding", {
          id: key,
          ...s,
          articleId: id,
          dataEpoch: epoch(),
          createdAt: now(),
        });
    }
    return all("contentBinding", s);
  }
  app.get("/api/content-library", (req, res) => res.json(manifest));
  app.get("/api/content-library/file", (req, res) => {
    const f = files.get(req.query.path);
    if (!f) throw fail("找不到歸檔檔案。", 404);
    const path = realpathSync(resolve(root, f.path));
    if (!path.startsWith(realpathSync(root) + sep))
      throw fail("無效檔案。", 403);
    res.sendFile(path);
  });
  app.get(route + "/content", (req, res) => {
    const ids = all("contentBinding", scope(req)).map((b) => b.articleId);
    res.json({
      articles: manifest.articles.filter((a) => ids.includes(a.id)),
      styles: manifest.styles,
    });
  });
  app.post(route + "/content/import", (req, res) =>
    res.json(importArticles(scope(req), req.body.ids)),
  );
  app.get(route + "/accounts", (req, res) =>
    res.json(all("localAccount", scope(req))),
  );
  app.post(route + "/accounts", (req, res) => {
    const s = scope(req),
      b = req.body;
    if (
      !["Instagram", "Threads", "LinkedIn"].includes(b.platform) ||
      typeof b.handle !== "string" ||
      !b.handle.trim() ||
      b.handle.length > 100
    )
      throw fail("請填寫平台及帳號名稱。", 400);
    if (
      all("localAccount", s).some(
        (a) => a.platform === b.platform && a.handle === b.handle.trim(),
      )
    )
      throw fail("帳號已存在。", 409);
    res.status(201).json(
      store.put("localAccount", {
        id: randomUUID(),
        ...s,
        dataEpoch: epoch(),
        platform: b.platform,
        handle: b.handle.trim(),
        connected: false,
        createdAt: now(),
      }),
    );
  });
  app.get(route + "/schedule", (req, res) =>
    res.json(
      all("localSchedule", scope(req)).sort((a, b) =>
        a.scheduledAt.localeCompare(b.scheduledAt),
      ),
    ),
  );
  function validate(b, s) {
    const account = store.get("localAccount", b.accountId);
    if (!account || !belongs(account, s))
      throw fail("請選擇目前專案的帳號。", 400);
    const a = manifest.articles.find((a) => a.id === b.articleId),
      v = a?.versions.find((v) => v.id === b.versionId);
    if (!v || !all("contentBinding", s).some((x) => x.articleId === a.id))
      throw fail("請先將內容加入目前專案。", 400);
    if (
      typeof b.scheduledAt !== "string" ||
      !/(Z|[+-]\d\d:\d\d)$/.test(b.scheduledAt) ||
      !Number.isFinite(Date.parse(b.scheduledAt))
    )
      throw fail("請指定有效時間與時區。", 400);
    return {
      accountId: b.accountId,
      articleId: a.id,
      versionId: v.id,
      scheduledAt: new Date(b.scheduledAt).toISOString(),
      snapshot: { title: a.title, caption: v.caption, images: v.images },
      timezone: "Asia/Taipei",
    };
  }
  app.post(route + "/schedule", (req, res) => {
    const s = scope(req),
      record = validate(req.body, s);
    if (
      all("localSchedule", s).some(
        (r) =>
          r.status === "scheduled" &&
          r.accountId === record.accountId &&
          r.articleId === record.articleId &&
          r.versionId === record.versionId &&
          r.scheduledAt === record.scheduledAt,
      )
    )
      throw fail("這筆排程已存在。", 409);
    res.status(201).json(
      store.put("localSchedule", {
        id: randomUUID(),
        ...s,
        ...record,
        dataEpoch: epoch(),
        revision: 1,
        status: "scheduled",
        createdAt: now(),
        updatedAt: now(),
      }),
    );
  });
  app.patch(route + "/schedule/:id", (req, res) => {
    const s = scope(req),
      r = store.get("localSchedule", req.params.id),
      b = req.body;
    if (!r || !belongs(r, s)) throw fail("找不到排程。", 404);
    if (b.revision !== r.revision) throw fail("排程已更新，請重新載入。", 409);
    let patch = {};
    if (b.scheduledAt !== undefined) {
      if (r.status !== "scheduled") throw fail("只有待發布排程可改期。", 409);
      if(r.snapshot?.deliveryId){if(typeof b.scheduledAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(b.scheduledAt)||!Number.isFinite(Date.parse(b.scheduledAt)))throw fail('請指定有效時間。');patch={scheduledAt:new Date(b.scheduledAt).toISOString()};}
      else patch = validate({ ...r, scheduledAt: b.scheduledAt }, s);
    }
    if (b.status !== undefined) {
      if (!["scheduled", "cancelled", "published_manual"].includes(b.status))
        throw fail("排程狀態無效。", 400);
      if (b.status === "published_manual" && r.status !== "scheduled")
        throw fail("只有待發布排程能記錄完成。", 409);
      patch.status = b.status;
      patch.publishedAt = b.status === "published_manual" ? now() : null;
    }
    res.json(
      store.put("localSchedule", {
        ...r,
        ...patch,
        revision: r.revision + 1,
        updatedAt: now(),
      }),
    );
  });
}
