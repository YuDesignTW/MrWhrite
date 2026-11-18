import { createHash } from "node:crypto";
import { fail } from "./store.mjs";
import { readPublicSource } from "./public-research.mjs";
import { searchTrends } from "./trend-search.mjs";
export function articleUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw fail("請填寫有效的 HTTPS 網址。");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.href.length > 2000
  )
    throw fail("請填寫公開 HTTPS 網址。");
  u.hash = "";
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.href;
}
export class ResearchArticles {
  constructor(store, { read = readPublicSource, search = searchTrends } = {}) {
    Object.assign(this, { store, read, search });
    this.active = new Set();
    this.shutdown = new AbortController();
    this.pending = 0;
  }
  async readSource(url, signal) {
    this.pending++;
    try {
      return await this.read(url, {
        signal: AbortSignal.any([
          this.shutdown.signal,
          ...(signal ? [signal] : []),
        ]),
      });
    } finally {
      this.pending--;
    }
  }
  close() {
    this.shutdown.abort();
  }
  epoch() {
    return this.store.get("settings", "main").epoch;
  }
  team(s) {
    const w = this.store.get("teamWorkspace", "main");
    const t =
      w?.dataEpoch === this.epoch() &&
      w.state.teams.find((t) => t.id === s.teamId);
    if (!t?.projects.some((p) => p.id === s.projectId))
      throw fail("找不到專案。", 404);
    return t;
  }
  list(s) {
    this.team(s);
    return this.store
      .all("researchArticle")
      .filter(
        (r) =>
          r.teamId === s.teamId &&
          r.projectId === s.projectId &&
          r.dataEpoch === this.epoch() &&
          !r.deleted,
      )
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  }
  save(s, data, expectedEpoch = this.epoch()) {
    this.team(s);
    if (expectedEpoch !== this.epoch()) throw fail("資料已還原，請重試。", 409);
    const url = articleUrl(data.url);
    const id = createHash("sha256")
      .update(JSON.stringify([expectedEpoch, s.teamId, s.projectId, url]))
      .digest("hex");
    const old =
      this.list(s).find((r) => r.url === url) ||
      this.store.get("researchArticle", id);
    if (old && !old.deleted) return { article: old, duplicate: true };
    return {
      article: this.store.put("researchArticle", {
        ...data,
        teamId: s.teamId,
        projectId: s.projectId,
        id,
        url,
        dataEpoch: expectedEpoch,
        collectedAt: new Date().toISOString(),
        deleted: false,
      }),
      duplicate: false,
    };
  }
  async add(s, body, { signal } = {}) {
    this.team(s);
    signal = AbortSignal.any([
      this.shutdown.signal,
      ...(signal ? [signal] : []),
    ]);
    signal.throwIfAborted();
    const epoch = this.epoch(),
      url = articleUrl(body.url);
    if (body.content) {
      if (
        typeof body.content !== "string" ||
        body.content.length > 50000 ||
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 300
      )
        throw fail("請填寫標題（300字內）與內容（50000字內）。");
      return this.save(
        s,
        {
          url,
          title: body.title.trim(),
          content: body.content,
          status: "manual",
          limitations: "使用者手動提供，尚未查證。",
        },
        epoch,
      );
    }
    const page = await this.readSource(url, signal);
    signal?.throwIfAborted();
    return this.save(s, this.page(page), epoch);
  }
  page(p) {
    return {
      url: p.url,
      title: p.title,
      content: p.summary,
      status: "extracted",
      publishedAt: p.publishedAt,
      limitations: p.limitations,
    };
  }
  remove(s, id) {
    const r = this.list(s).find((r) => r.id === id);
    if (!r) throw fail("找不到文章。", 404);
    this.store.put("researchArticle", { ...r, deleted: true });
    return { ok: true };
  }
  async collect(s, { signal, query, newsOnly = false } = {}) {
    signal = AbortSignal.any([
      this.shutdown.signal,
      ...(signal ? [signal] : []),
    ]);
    signal.throwIfAborted();
    const team = this.team(s),
      config = this.configProvider?.(s),
      settings = {
        ...team.researchSettings,
        ...(config
          ? {
              topic: config.keywords.join(" OR "),
              sourceUrls: config.sourceUrls,
            }
          : {}),
      },
      epoch = this.epoch();
    if (query?.trim()) settings.topic=query.trim().slice(0,100);
    if (newsOnly) settings.sourceUrls=[];
    if (!settings.topic?.trim() && !settings.sourceUrls?.length)
      throw fail("請先在團隊庫的趨勢偵查設定研究主題。");
    const key = JSON.stringify([s.teamId, s.projectId]);
    if (this.active.has(key)) throw fail("此專案正在搜尋。", 409);
    this.active.add(key);
    const result = {
      added: 0,
      duplicates: 0,
      errors: [],
      query: settings.topic,
      fetchedAt: new Date().toISOString(),
      articles: [],
      requests: [],
    };
    const keep = (data) => {
      signal?.throwIfAborted();
      const r = this.save(s, data, epoch);
      result[r.duplicate ? "duplicates" : "added"]++;
      result.articles.push({...data, collectedAt: result.fetchedAt});
    };
    const terms = (settings.topic || "")
      .split(/[\s,，、]+/)
      .filter((t) => t && t !== "OR")
      .slice(0, 12);
    try {
      try {
        const feed = terms.length
          ? await this.search({ request: query?.trim() || terms.join(" OR "), settings, signal, onRequest: request=>result.requests.push(request) })
          : { query: "固定來源", sources: [] };
        result.query = feed.query;
        for (const p of feed.sources)
          keep({
            url: p.url,
            title: p.title,
            content: p.summary,
            status: "summary",
            publishedAt: p.publishedAt,
            limitations: "新聞 RSS 標題與摘要，尚未取得原文。",
          });
      } catch (e) {
        signal?.throwIfAborted();
        result.errors.push("新聞搜尋：" + e.message);
      }
      for (const url of (settings.sourceUrls || []).slice(0, 5)) {
        try {
          signal?.throwIfAborted();
          const page = await this.readSource(url, signal);
          keep(this.page(page));
          const links = (page.links || [])
            .filter((l) =>
              terms.some((t) =>
                (l.title + " " + l.url).toLowerCase().includes(t.toLowerCase()),
              ),
            )
            .slice(0, 3);
          for (const link of links) {
            if (this.list(s).some((r) => r.url === articleUrl(link.url))) {
              result.duplicates++;
              continue;
            }
            try {
              keep(this.page(await this.readSource(link.url, signal)));
            } catch (e) {
              signal?.throwIfAborted();
              result.errors.push(link.url + "：" + e.message);
            }
          }
        } catch (e) {
          signal?.throwIfAborted();
          result.errors.push(url + "：" + e.message);
        }
      }
      return result;
    } finally {
      this.active.delete(key);
    }
  }
}
export function mountResearchArticles(app, route, store, scope, options = {}) {
  const articles = new ResearchArticles(store, options);
  app.get(route + "/research-articles", (req, res) =>
    res.json(articles.list(scope(req))),
  );
  app.post(route + "/research-articles", async (req, res) =>
    res.json(await articles.add(scope(req), req.body)),
  );
  app.post(route + "/research-articles/search", async (req, res) =>
    res.json(await articles.collect(scope(req))),
  );
  app.delete(route + "/research-articles/:id", (req, res) =>
    res.json(articles.remove(scope(req), req.params.id)),
  );
  return articles;
}
