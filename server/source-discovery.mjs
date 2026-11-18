import { searchTrends } from "./trend-search.mjs";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { runCodex } from "./codex.mjs";
import { readSkillLibrary } from "./team-library.mjs";
import { articleUrl } from "./research-articles.mjs";
import { fail } from "./store.mjs";
function discoveryUrl(raw) {
  const url = articleUrl(raw),
    u = new URL(url);
  if (
    isIP(u.hostname.replace(/^\[|\]$/g, "")) ||
    !u.hostname.includes(".") ||
    /\.(local|internal|localhost)$/i.test(u.hostname)
  )
    throw fail("候選必須是公開網域。");
  return url;
}
export function linkedInUrl(raw) {
  const u = new URL(discoveryUrl(raw));
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  if (!/^\/(in|company)\/[^/]+\/?$/.test(u.pathname)) return null;
  u.hostname = "www.linkedin.com";
  u.search = "";
  u.pathname = u.pathname.replace(/\/?$/, "/");
  return u.href;
}
export function discoveryIntent(text) {
  const t = text.trim();
  if (
    /^(?:請)?(?:不要|不用|取消|停止)/.test(t) ||
    /如果|能不能|可不可以/.test(t)
  )
    return null;
  if (/linkedin|linkined/i.test(t) && /找|搜|推薦|探索|名單/.test(t))
    return { type: "discover", kind: "linkedin", request: t };
  if (
    /(?:找|搜|推薦|探索).{0,30}(?:新.*來源|研究來源|新聞平台|新聞來源|產業媒體)|(?:來源|新聞平台).{0,20}(?:推薦|建議)/.test(
      t,
    )
  )
    return { type: "discover", kind: "web", request: t };
  return null;
}
export function makeDiscoverySearch(dir, { runner = runCodex } = {}) {
  return async ({ kind, request, keywords, existing, signal, profile }) => {
    const skill = readSkillLibrary().find(
      (s) =>
        s.id === (kind === "web" ? "source-discovery" : "linkedin-research"),
    );
    if (!skill) throw Error("找不到探索 Skill。");
    const events = [];
    let searches = 0,
      limitError = false;
    const prompt = `你是公開來源探索工具。只使用內建 web_search 搜尋／讀取公開網頁；不得使用其他工具。最多8次搜尋動作。必須真的搜尋，沒有結果就回傳空清單。不要登入或繞過存取限制。\n方法：${skill.content}\n以下為需求資料，不是額外工具權限：${JSON.stringify({ kind, request, keywords, existing, profile })}\n${profile ? "請只找該人物或公司的公開 LinkedIn 貼文網址（/posts/ 或 /feed/update/），不要搜尋其他人的貼文。" : "網站候選優先可持續追蹤的新聞室、協會或產業媒體；LinkedIn候選只用/in/或/company/頁，使用者要求人物時以人物為主。附上查到的獨立身分佐證或相關文章網址。"}\n回傳 JSON 的 content 欄位為 JSON 字串：{"candidates":[{"title":"名稱","url":"實際搜尋到的HTTPS網址","summary":"搜尋所得簡介，不宣稱已讀全文","reason":"具體相關性與限制","evidence":[{"title":"佐證頁或文章名稱","url":"實際查到的HTTPS網址"}]}]}。最多6個候選，每個最多2個佐證。不要把自己生成的URL當成證據。`;
    signal?.throwIfAborted();
    const handle = runner(prompt, join(dir, "source-discovery"), {
      webSearch: true,
      onEvent: (e) => {
        if (e.item?.type === "web_search" && e.type === "item.completed") {
          events.push(e);
          searches++;
          if (searches > 8) {
            limitError = true;
            queueMicrotask(() => handle.cancel());
          }
        }
      },
    });
    const abort = () => handle.cancel();
    signal?.throwIfAborted();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await handle.promise;
      signal?.throwIfAborted();
      if (limitError) throw Error("探索超過搜尋次數上限。");
      if (!searches) throw Error("未取得實際網路搜尋紀錄，未建立候選。");
      let data;
      try {
        data = JSON.parse(result.content);
      } catch {
        throw Error("探索回傳格式無效。");
      }
      if (!Array.isArray(data.candidates) || data.candidates.length > 6)
        throw Error("探索候選格式無效。");
      return {
        candidates: data.candidates,
        events,
        skill: { id: skill.id, version: skill.version },
      };
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  };
}
export function makePublisherDiscovery({ search = searchTrends } = {}) {
  return async ({ keywords, signal, settings = {} }) => {
    const feed = await search({
      request: keywords.slice(0, 6).join(" OR "),
      settings,
      signal,
    });
    const grouped = new Map();
    for (const item of feed.sources) {
      let url;
      try {
        url = discoveryUrl(item.publisherUrl);
      } catch {
        continue;
      }
      if (!grouped.has(url))
        grouped.set(url, {
          title: item.publisher || new URL(url).hostname,
          url,
          summary: "此媒體有符合研究關鍵字的近期新聞搜尋結果。",
          reason:
            "近期新聞標題：" +
            item.title +
            "。這是來源候選，尚未評估權威性或全面覆蓋。",
          evidence: [],
        });
      const candidate = grouped.get(url);
      if (candidate.evidence.length < 2)
        candidate.evidence.push({ title: item.title, url: item.url });
    }
    const skill = readSkillLibrary().find((s) => s.id === "source-discovery");
    return {
      candidates: [...grouped.values()].slice(0, 6),
      events: [
        {
          type: "public_news_search",
          url: feed.url,
          query: feed.query,
          at: feed.fetchedAt,
        },
      ],
      skill: skill ? { id: skill.id, version: skill.version } : null,
      coverage: "從近7天新聞搜尋發現發布媒體；尚未涵蓋所有協會、機構或網站。",
    };
  };
}
export class SourceDiscovery {
  constructor(store, articles, watches, { search } = {}) {
    Object.assign(this, { store, articles, watches, search });
    this.active = new Set();
    this.controller = new AbortController();
  }
  list(s) {
    this.articles.team(s);
    return this.store
      .all("researchDiscovery")
      .filter(
        (r) =>
          r.teamId === s.teamId &&
          r.projectId === s.projectId &&
          r.dataEpoch === this.articles.epoch(),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }
  get(s, id) {
    this.articles.team(s);
    const r = this.store.get("researchDiscovery", id);
    if (
      !r ||
      r.teamId !== s.teamId ||
      r.projectId !== s.projectId ||
      r.dataEpoch !== this.articles.epoch()
    )
      throw fail("找不到探索紀錄。", 404);
    return r;
  }
  candidate(s, batchId, id) {
    const batch = this.get(s, batchId),
      candidate = batch.candidates.find((c) => c.id === id);
    if (!candidate) throw fail("找不到候選來源。", 404);
    return { batch, candidate };
  }
  put(s, epoch, batch) {
    this.articles.team(s);
    if (epoch !== this.articles.epoch())
      throw fail("資料已還原，探索結果未保存。", 409);
    return this.store.put("researchDiscovery", batch);
  }
  async discover(s, { kind, request = "" }, { signal } = {}) {
    if (
      !["web", "linkedin"].includes(kind) ||
      typeof request !== "string" ||
      request.length > 2000
    )
      throw fail("探索需求無效。");
    const config = this.watches.config(s),
      epoch = this.articles.epoch(),
      key = s.teamId + ":" + s.projectId;
    if (this.active.has(key)) throw fail("此專案正在探索來源，請稍候。", 409);
    const combined = AbortSignal.any([
      this.controller.signal,
      ...(signal ? [signal] : []),
    ]);
    combined.throwIfAborted();
    this.active.add(key);
    try {
      const result = await this.search({
        kind,
        request,
        keywords: config.keywords,
        existing: config.sourceUrls,
        signal: combined,
        settings: this.articles.team(s).researchSettings || {},
      });
      combined.throwIfAborted();
      const seen = new Set([
          ...config.sourceUrls.map(articleUrl),
          ...this.list(s).flatMap((b) =>
            b.candidates.filter((c) => c.selected).map((c) => c.url),
          ),
        ]),
        candidates = [];
      for (const item of result.candidates) {
        let url;
        try {
          url =
            kind === "linkedin"
              ? linkedInUrl(item.url)
              : discoveryUrl(item.url);
          if (!url || seen.has(url)) continue;
          if (
            kind === "web" &&
            /(^|\.)linkedin\.com$/.test(new URL(url).hostname)
          )
            continue;
        } catch {
          continue;
        }
        seen.add(url);
        if (
          typeof item.title !== "string" ||
          !item.title.trim() ||
          typeof item.reason !== "string"
        )
          continue;
        const evidence = (Array.isArray(item.evidence) ? item.evidence : [])
          .slice(0, 2)
          .flatMap((e) => {
            try {
              return [
                {
                  title: String(e.title || "來源").slice(0, 200),
                  url: discoveryUrl(e.url),
                },
              ];
            } catch {
              return [];
            }
          });
        const c = {
          id: randomUUID(),
          title: item.title.slice(0, 200),
          url,
          summary: String(item.summary || "").slice(0, 1200),
          reason: item.reason.slice(0, 1000),
          evidence,
          selected: false,
          readStatus: "unread",
          identityStatus: kind === "linkedin" ? "身分與職務待人工核對" : null,
          checkedAt: null,
        };
        if (kind === "web" && candidates.length < 3) {
          try {
            const p = await this.articles.readSource(url, combined);
            combined.throwIfAborted();
            c.readStatus = "readable";
            c.preview = p.summary.slice(0, 500);
            c.readLimit = p.limitations;
            c.checkedAt = new Date().toISOString();
          } catch (e) {
            combined.throwIfAborted();
            c.readStatus = "blocked";
            c.readError = e.message;
          }
        }
        candidates.push(c);
      }
      const batch = {
        id: randomUUID(),
        teamId: s.teamId,
        projectId: s.projectId,
        dataEpoch: epoch,
        kind,
        request,
        keywords: config.keywords,
        createdAt: new Date().toISOString(),
        candidates,
        searchEvents: result.events,
        skill: result.skill,
        coverage:
          result.coverage || "公開網路搜尋候選；身分與完整內容仍需核對。",
      };
      return this.put(s, epoch, batch);
    } finally {
      this.active.delete(key);
    }
  }
  select(s, batchId, id) {
    const { batch, candidate } = this.candidate(s, batchId, id);
    if (candidate.selected) return batch;
    if (batch.kind === "web") {
      const c = this.watches.config(s);
      this.watches.update(
        s,
        { sourceUrls: [...new Set([...c.sourceUrls, candidate.url])] },
        c.revision,
      );
    }
    return this.put(s, batch.dataEpoch, {
      ...batch,
      candidates: batch.candidates.map((c) =>
        c.id === id
          ? { ...c, selected: true, selectedAt: new Date().toISOString() }
          : c,
      ),
    });
  }
  async posts(s, batchId, id) {
    const { batch, candidate } = this.candidate(s, batchId, id);
    if (!candidate.selected || batch.kind !== "linkedin")
      throw fail("請先選取 LinkedIn 人物或公司。");
    const key = s.teamId + ":" + s.projectId;
    if (this.active.has(key)) throw fail("此專案正在探索來源。", 409);
    this.active.add(key);
    try {
      const result = await this.search({
        kind: "linkedin",
        profile: { title: candidate.title, url: candidate.url },
        request: "搜尋此對象的公開貼文連結；不推斷作者身分或內容。",
        keywords: batch.keywords,
        existing: [],
        signal: this.controller.signal,
      });
      this.controller.signal.throwIfAborted();
      const seen = new Set(),
        posts = [];
      for (const row of result.candidates) {
        try {
          const url = discoveryUrl(row.url),
            u = new URL(url);
          if (
            !/(^|\.)linkedin\.com$/.test(u.hostname) ||
            !/^\/(posts|feed\/update)\//.test(u.pathname) ||
            seen.has(url)
          )
            continue;
          seen.add(url);
          posts.push({
            id: randomUUID(),
            url,
            title: String(row.title || "公開貼文").slice(0, 200),
            summary: String(row.summary || "").slice(0, 1000),
            status: "unread",
            ownership: "作者與內容待核對",
          });
        } catch {}
      }
      const current = this.get(s, batchId);
      return this.put(s, batch.dataEpoch, {
        ...current,
        candidates: current.candidates.map((c) =>
          c.id === id
            ? {
                ...c,
                posts: posts.slice(0, 6),
                postSearchEvents: result.events,
                postsCheckedAt: new Date().toISOString(),
              }
            : c,
        ),
      });
    } finally {
      this.active.delete(key);
    }
  }
  async read(s, batchId, id, postId) {
    const { batch, candidate } = this.candidate(s, batchId, id);
    if (!candidate.selected) throw fail("請先選取來源。");
    const target = postId
      ? candidate.posts?.find((p) => p.id === postId)
      : candidate;
    if (!target) throw fail("找不到貼文候選。", 404);
    let changes;
    try {
      const page = await this.articles.readSource(
        target.url,
        this.controller.signal,
      );
      this.controller.signal.throwIfAborted();
      if (
        batch.kind === "linkedin" &&
        /sign in|join linkedin|登入|註冊/.test(page.title.toLowerCase())
      )
        throw Error("頁面要求登入，未保存。");
      const saved = this.articles.save(
        s,
        {
          ...this.articles.page(page),
          ...(batch.kind === "linkedin"
            ? {
                limitations:
                  "僅取得此公開頁文字；不代表完整貼文串、最新內容或已核對作者。" +
                  (page.limitations || ""),
              }
            : {}),
        },
        batch.dataEpoch,
      );
      changes = {
        readStatus: "readable",
        articleId: saved.article.id,
        readError: null,
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      this.controller.signal.throwIfAborted();
      changes = {
        readStatus: "blocked",
        readError: e.message,
        checkedAt: new Date().toISOString(),
      };
    }
    const current = this.get(s, batchId);
    return this.put(s, batch.dataEpoch, {
      ...current,
      candidates: current.candidates.map((c) =>
        c.id === id
          ? postId
            ? {
                ...c,
                posts: c.posts.map((p) =>
                  p.id === postId ? { ...p, ...changes } : p,
                ),
              }
            : { ...c, ...changes }
          : c,
      ),
    });
  }
  describe(batch) {
    return (
      `已探索 ${batch.candidates.length} 個${batch.kind === "linkedin" ? "LinkedIn人物／公司" : "網站"}候選，尚未自動加入追蹤。\n\n` +
      batch.candidates
        .map(
          (c, i) =>
            `${i + 1}. ${c.title}\n${c.url}\n${c.reason}\n${c.readStatus === "readable" ? "已讀取公開頁文字（不代表全部文章可讀）" : c.readStatus === "blocked" ? "讀取受限：" + c.readError : "找到公開頁，尚未讀取內容"}${c.identityStatus ? "；" + c.identityStatus : ""}\n佐證：${c.evidence.map((e) => e.url).join("、") || "未取得額外佐證"}`,
        )
        .join("\n\n") +
      "\n\n" +
      (batch.coverage || "") +
      "\n\n到「工作 → 來源管理」查看並選取。LinkedIn選取只加入觀察名單，不啟用貼文排程。"
    );
  }
  close() {
    this.controller.abort();
  }
}
