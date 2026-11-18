import { createHash, randomUUID } from "node:crypto";
import { readPublicSource } from "./public-research.mjs";
import { fail } from "./store.mjs";
const DAY = 86400000;
export class ResearchSubscriptions {
  constructor(
    store,
    {
      read = readPublicSource,
      paused = () => false,
      clock = () => Date.now(),
    } = {},
  ) {
    Object.assign(this, { store, read, paused, clock });
    this.closed = false;
    this.active = null;
  }
  epoch() {
    return this.store.get("settings", "main").epoch;
  }
  matches(r, s) {
    return (
      r.teamId === s.teamId &&
      r.projectId === s.projectId &&
      r.dataEpoch === this.epoch()
    );
  }
  list(s) {
    return this.store
      .all("researchSubscription")
      .filter((r) => this.matches(r, s));
  }
  get(s, id) {
    const r = this.list(s).find((r) => r.id === id);
    if (!r) throw fail("找不到研究來源。", 404);
    return r;
  }
  add(s, { url, name, keywords = [] }) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw fail("請提供公開HTTPS來源。");
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      url.length > 2000
    )
      throw fail("請提供公開HTTPS來源。");
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 120 ||
      !Array.isArray(keywords) ||
      keywords.length > 12 ||
      keywords.some((k) => typeof k !== "string" || !k.trim() || k.length > 60)
    )
      throw fail("來源名稱或關鍵字無效。");
    const existing = this.list(s).find((r) => r.url === u.href);
    if (existing) return existing;
    if (this.list(s).length >= 5) throw fail("每個專案最多五個定期來源。");
    return this.store.put("researchSubscription", {
      id: randomUUID(),
      ...s,
      dataEpoch: this.epoch(),
      url: u.href,
      name,
      keywords,
      enabled: true,
      status: "pending",
      nextCheckAt: new Date(this.clock()).toISOString(),
      sources: [],
      history: [],
    });
  }
  update(s, id, enabled) {
    if (typeof enabled !== "boolean") throw fail("排程設定無效。");
    const r = this.get(s, id);
    return this.store.put("researchSubscription", {
      ...r,
      enabled,
      nextCheckAt: enabled ? new Date(this.clock()).toISOString() : null,
    });
  }
  evidence(s) {
    return this.list(s)
      .flatMap((r) => r.sources || [])
      .filter((r) => Date.parse(r.collectedAt) > this.clock() - 14 * DAY)
      .map((r) => ({
        ...r,
        evidence: "定期收集保存的公開文字；非本次即時搜尋。" + r.evidence,
      }))
      .slice(0, 20);
  }
  async collect(s, id) {
    if (this.closed || this.active || this.paused())
      throw fail("目前有工作執行中，稍後再收集。", 409);
    const before = this.get(s, id);
    if (!before.enabled) throw fail("請先恢復來源排程。");
    const controller = new AbortController();
    this.active = { id, controller };
    const startedAt = new Date(this.clock()).toISOString();
    this.store.put("researchSubscription", {
      ...before,
      status: "collecting",
      lastAttemptAt: startedAt,
    });
    const requests = [],
      sources = [],
      errors = [];
    const options = {
      signal: controller.signal,
      onRequest: (r) => requests.push(r),
    };
    try {
      const index = await this.read(before.url, options);
      sources.push(index);
      const links = (index.links || [])
        .filter((l) =>
          before.keywords.some((k) =>
            (l.title + " " + l.url).toLowerCase().includes(k.toLowerCase()),
          ),
        )
        .slice(0, 2);
      for (const link of links) {
        controller.signal.throwIfAborted();
        try {
          sources.push(await this.read(link.url, options));
        } catch (e) {
          controller.signal.throwIfAborted();
          errors.push(link.url + ": " + e.message);
        }
      }
    } catch (e) {
      errors.push(e.message);
    } finally {
      this.active = null;
    }
    if (
      this.closed ||
      controller.signal.aborted ||
      before.dataEpoch !== this.epoch()
    )
      return;
    const current = this.get(s, id),
      finishedAt = new Date(this.clock()).toISOString();
    const seen = new Set();
    const merged = [...sources, ...current.sources]
      .filter((x) => {
        if (seen.has(x.url)) return false;
        seen.add(x.url);
        return true;
      })
      .slice(0, 40)
      .map((x) => ({
        ...x,
        links: undefined,
        contentHash: createHash("sha256")
          .update(x.summary || "")
          .digest("hex"),
      }));
    const log = {
      startedAt,
      finishedAt,
      count: sources.length,
      errors,
      requests,
    };
    return this.store.put("researchSubscription", {
      ...current,
      status: sources.length
        ? errors.length
          ? "partial"
          : "collected"
        : "blocked",
      sources: merged,
      lastCollectedAt: sources.length ? finishedAt : current.lastCollectedAt,
      error: errors.join("\n"),
      nextCheckAt: current.enabled
        ? new Date(this.clock() + DAY).toISOString()
        : null,
      history: [log, ...current.history].slice(0, 30),
    });
  }
  async tick() {
    if (this.closed || this.active || this.paused()) return;
    for (const r of this.store.all("researchSubscription")) {
      if (
        r.dataEpoch === this.epoch() &&
        r.enabled &&
        Date.parse(r.nextCheckAt) <= this.clock()
      ) {
        await this.collect(r, r.id);
        break;
      }
    }
  }
  close() {
    this.closed = true;
    if (this.active) {
      const { id, controller } = this.active;
      controller.abort();
      const r = this.store.get("researchSubscription", id);
      if (r?.dataEpoch === this.epoch())
        this.store.put("researchSubscription", {
          ...r,
          status: "interrupted",
          error: "服務停止，下次啟動後補收集。",
        });
    }
  }
}
