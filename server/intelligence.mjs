import { uid, now, hash, fail } from "./store.mjs";
import { socialUrl } from "./social-connectors.mjs";

export function localDay(date = new Date(), zone = "Asia/Taipei") {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(
    f.formatToParts(date).map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
const text = (v, max = 500000) => typeof v === "string" && v.length <= max;
export class Intelligence {
  constructor(store, connector, { clock = () => new Date() } = {}) {
    this.store = store;
    this.connector = connector;
    this.clock = clock;
    this.inFlight = new Map();
    this.closed = false;
    store.db
      .exec(`CREATE UNIQUE INDEX IF NOT EXISTS social_unique_key ON records(kind,json_extract(data,'$.key')) WHERE kind IN ('socialPost','socialSource');
      CREATE INDEX IF NOT EXISTS social_key_lookup ON records(kind,json_extract(data,'$.key'));
      CREATE INDEX IF NOT EXISTS social_posts_order ON records(kind,json_extract(data,'$.createdAt') DESC,id DESC);
      CREATE INDEX IF NOT EXISTS social_posts_platform ON records(kind,json_extract(data,'$.platform'));`);
    for (const r of store
      .all("collectionRun")
      .filter((r) => r.status === "running"))
      store.put("collectionRun", {
        ...r,
        status: "failed",
        error: "服務中斷，已保留先前資料。",
        completedAt: now(),
      });
  }
  config() {
    return (
      this.store.get("collectionConfig", "main") || {
        id: "main",
        timeZone: "Asia/Taipei",
        times: ["09:00", "18:00"],
        enabled: false,
      }
    );
  }
  configure(b) {
    const c = { ...this.config(), ...b, id: "main" };
    try {
      localDay(this.clock(), c.timeZone);
    } catch {
      throw fail("時區無效。");
    }
    if (
      !Array.isArray(c.times) ||
      !c.times.length ||
      c.times.length > 6 ||
      c.times.some(
        (t) => typeof t !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t),
      ) ||
      typeof c.enabled !== "boolean"
    )
      throw fail("請設定 1～6 個每日時間。");
    return this.store.put("collectionConfig", {
      id: "main",
      timeZone: c.timeZone,
      times: [...new Set(c.times)].sort(),
      enabled: c.enabled,
    });
  }
  post(id) {
    const p = this.store.get("socialPost", id);
    if (!p) throw fail("找不到情報。", 404);
    return p;
  }
  list(q = {}) {
    const clauses = [
      "kind='socialPost'",
      q.trash === "1"
        ? "json_extract(data,'$.deletedAt') IS NOT NULL"
        : "json_extract(data,'$.deletedAt') IS NULL",
    ];
    const args = [];
    if (q.platform) {
      clauses.push("json_extract(data,'$.platform')=?");
      args.push(q.platform);
    }
    if (q.favorite === "1") clauses.push("json_extract(data,'$.favorite')=1");
    if (q.source) {
      clauses.push("json_extract(data,'$.sourceId')=?");
      args.push(q.source);
    }
    if (q.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) throw fail("日期格式無效。");
      clauses.push("date(json_extract(data,'$.publishedAt'),'+8 hours')=?");
      args.push(q.date);
    }
    if (q.q) {
      clauses.push(
        "instr(lower(json_extract(data,'$.body') || ' ' || coalesce(json_extract(data,'$.author'),'')),lower(?))>0",
      );
      args.push(String(q.q).slice(0, 200));
    }
    if (q.cursor) {
      let c;
      try {
        c = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
      } catch {
        throw fail("分頁游標無效。");
      }
      if (
        !Array.isArray(c) ||
        c.length !== 2 ||
        c.some((x) => typeof x !== "string")
      )
        throw fail("分頁游標無效。");
      clauses.push("(json_extract(data,'$.createdAt'),id)<(?,?)");
      args.push(...c);
    }
    const rows = this.store.db
      .prepare(
        `SELECT data FROM records WHERE ${clauses.join(" AND ")} ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT 31`,
      )
      .all(...args)
      .map((r) => JSON.parse(r.data));
    const more = rows.length > 30;
    const items = rows.slice(0, 30);
    const last = items.at(-1);
    return {
      items,
      nextCursor: more
        ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString(
            "base64url",
          )
        : null,
    };
  }
  save(input, { manual = false, sourceId = null } = {}) {
    if (!text(input.body) || (!input.body.trim() && !input.media?.length))
      throw fail("請貼上正文；不能保存空白情報。");
    let link = input.url ? socialUrl(input.url, "post") : null;
    const platform = link?.platform || input.platform || "manual";
    if (!["threads", "instagram", "manual"].includes(platform))
      throw fail("平台無效。");
    const key =
      link?.key ||
      `${platform}:text:${hash(input.body.trim().replace(/\r\n/g, "\n"))}`;
    return this.store.tx(() => {
      const existing = this.store.db
        .prepare(
          "SELECT data FROM records WHERE kind='socialPost' AND json_extract(data,'$.key')=?",
        )
        .get(key);
      if (existing) return { post: JSON.parse(existing.data), duplicate: true };
      const p = {
        id: uid(),
        key,
        platform,
        url: link?.url || null,
        externalId: input.externalId || null,
        author: text(input.author, 200) ? input.author : null,
        body: input.body,
        publishedAt:
          input.publishedAt && !Number.isNaN(Date.parse(input.publishedAt))
            ? new Date(input.publishedAt).toISOString()
            : null,
        media: (input.media || [])
          .slice(0, 20)
          .filter((m) => typeof m.url === "string" && /^https:\/\//.test(m.url))
          .map((m) => ({
            url: m.url,
            type: String(m.type || "unknown").slice(0, 50),
          })),
        provider: manual ? "manual-text" : input.provider,
        sourceId,
        createdAt: now(),
        favorite: false,
        deletedAt: null,
        manual,
      };
      return { post: this.store.put("socialPost", p), duplicate: false };
    });
  }
  async preview(url) {
    return this.connector.post(socialUrl(url, "post"));
  }
  patch(id, b) {
    const p = this.post(id);
    if (b.favorite !== undefined && typeof b.favorite !== "boolean")
      throw fail("收藏設定無效。");
    let research;
    if (b.research !== undefined) {
      if (p.deletedAt) throw fail("請先恢復情報。", 409);
      if (b.baseResearchVersion !== (p.researchVersion || 0))
        throw fail("拆解筆記已在其他視窗更新，請重新選取情報後再編輯。", 409);
      const fields = ["hook", "structure", "takeaway"];
      if (
        !b.research ||
        typeof b.research !== "object" ||
        Array.isArray(b.research) ||
        fields.some((k) => !text(b.research[k], 2000)) ||
        Object.keys(b.research).some((k) => !fields.includes(k))
      )
        throw fail("拆解筆記格式無效，每欄最多 2,000 字。");
      research = Object.fromEntries(
        fields.map((k) => [k, b.research[k].trim()]),
      );
    }
    return this.store.put("socialPost", {
      ...p,
      ...(research
        ? {
            research,
            researchVersion: (p.researchVersion || 0) + 1,
            researchUpdatedAt: now(),
          }
        : {}),
      ...(b.favorite !== undefined ? { favorite: b.favorite } : {}),
      ...(b.deleted === true
        ? { deletedAt: now() }
        : b.deleted === false
          ? { deletedAt: null }
          : {}),
    });
  }
  draft(id) {
    const p = this.post(id);
    if (p.deletedAt) throw fail("請先恢復情報。");
    return this.store.tx(() => {
      const a = this.store.create();
      const saved = this.store.update(a.id, {
        title: (p.body.split("\n")[0] || "情報草稿").slice(0, 80),
        body: p.body,
        baseRevision: 0,
      });
      this.store.put("articleSource", {
        id: uid(),
        articleId: a.id,
        postId: p.id,
        url: p.url,
      });
      return saved;
    });
  }
  sources() {
    return this.store.all("socialSource").filter((s) => !s.deletedAt);
  }
  async addSource(url) {
    const epoch = this.store.get("settings", "main").epoch;
    const target = socialUrl(url, "account");
    const existing = this.sources().find((s) => s.key === target.key);
    if (existing) return existing;
    if (this.sources().length >= 20) throw fail("第一版最多 20 個追蹤來源。");
    let verification, error;
    try {
      verification = await this.connector.account(target);
    } catch (e) {
      error = e.status ? e.message : "來源驗證失敗。";
    }
    if (verification?.externalId) {
      const renamed = this.sources().find(
        (s) =>
          s.platform === target.platform &&
          s.externalId === verification.externalId &&
          s.key !== target.key,
      );
      if (renamed)
        return this.store.put("socialSource", {
          ...renamed,
          ...target,
          ...verification,
        });
    }
    const old = this.store.db
      .prepare(
        "SELECT data FROM records WHERE kind='socialSource' AND json_extract(data,'$.key')=?",
      )
      .get(target.key);
    if (this.closed) throw fail("服務已停止。", 503);
    if (epoch !== this.store.get("settings", "main").epoch)
      throw fail("資料已還原，請重新加入來源。", 409);
    const prior = old ? JSON.parse(old.data) : null;
    // Recheck after the network wait to avoid concurrent duplicate inserts.
    if (prior && !prior.deletedAt) return prior;
    if (this.sources().length >= 20) throw fail("第一版最多 20 個追蹤來源。");
    return this.store.put("socialSource", {
      ...target,
      id: prior?.id || uid(),
      enabled: !!verification,
      verified: !!verification,
      error: error || null,
      createdAt: now(),
      deletedAt: null,
      ...verification,
    });
  }
  async setSource(id, b) {
    let s = this.store.get("socialSource", id);
    if (!s || s.deletedAt) throw fail("找不到來源。", 404);
    if (b.enabled === true) {
      const v = await this.connector.account(s);
      s = this.store.get("socialSource", id);
      if (!s || s.deletedAt) throw fail("來源已移除。", 409);
      s = { ...s, ...v, verified: true, error: null };
    }
    return this.store.put("socialSource", {
      ...s,
      ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}),
      ...(b.deleted ? { deletedAt: now(), enabled: false } : {}),
    });
  }
  collect(id) {
    if (this.inFlight.has(id)) return this.inFlight.get(id);
    const task = this.run(id).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, task);
    return task;
  }
  async run(id) {
    const s = this.store.get("socialSource", id);
    if (!s || !s.enabled || s.deletedAt)
      throw fail("來源尚未驗證、已停用或已移除。", 409);
    const started = this.clock(),
      zone = this.config().timeZone,
      day = localDay(started, zone).date,
      epoch = this.store.get("settings", "main").epoch;
    const run = this.store.put("collectionRun", {
      id: uid(),
      sourceId: id,
      day,
      timeZone: zone,
      startedAt: started.toISOString(),
      status: "running",
      added: 0,
      existing: 0,
      skipped: 0,
      undated: 0,
    });
    this.store.put("socialSource", { ...s, lastAttempt: run.startedAt });
    try {
      const result = await this.connector.collect(s);
      if (this.closed) return { ...run, status: "failed" };
      if (epoch !== this.store.get("settings", "main").epoch)
        return { ...run, status: "failed" };
      const live = this.store.get("socialSource", id);
      if (!live?.enabled || live.deletedAt)
        throw fail("來源已停用，本次結果未保存。");
      for (const p of result.posts) {
        if (!p.publishedAt || Number.isNaN(Date.parse(p.publishedAt))) {
          run.undated++;
          continue;
        }
        const d = new Date(p.publishedAt);
        if (p.isReply || d > started || localDay(d, zone).date !== day) {
          run.skipped++;
          continue;
        }
        try {
          const saved = this.save(p, { sourceId: id });
          run[saved.duplicate ? "existing" : "added"]++;
        } catch {
          run.undated++;
        }
      }
      run.status = result.partial || run.undated ? "partial" : "completed";
      this.store.put("socialSource", {
        ...live,
        lastAttempt: run.startedAt,
        lastSuccess:
          run.status === "completed" ? run.startedAt : live.lastSuccess,
        error:
          run.status === "partial"
            ? "已取得部分資料；達筆數上限或有無法判定項目。"
            : null,
      });
    } catch (e) {
      if (this.closed) return { ...run, status: "failed" };
      run.status = "failed";
      run.error = e.status ? e.message : "搜集未完成，請稍後重試。";
      const live = this.store.get("socialSource", id);
      if (live) this.store.put("socialSource", { ...live, error: run.error });
    }
    return this.store.put("collectionRun", {
      ...run,
      completedAt: this.clock().toISOString(),
    });
  }
  async tick() {
    if (this.closed) return;
    const c = this.config();
    if (!c.enabled) return;
    const d = localDay(this.clock(), c.timeZone);
    const due = c.times.filter((t) => t <= d.time).at(-1);
    if (!due) return;
    for (const s of this.sources().filter((s) => s.enabled)) {
      const slot = `${d.date} ${due} ${c.timeZone}`;
      if (s.lastSlot === slot || this.inFlight.has(s.id)) continue;
      this.store.put("socialSource", { ...s, lastSlot: slot });
      await this.collect(s.id);
      if (this.closed) return;
    }
  }
  close() {
    this.closed = true;
  }
}
