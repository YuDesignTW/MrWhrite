import { discoveryIntent } from "./source-discovery.mjs";
import { createHash } from "node:crypto";
import { fail } from "./store.mjs";
import { articleUrl } from "./research-articles.mjs";
const DAY = 86400000;
const terms = (text) => [
  ...new Set(
    text
      .split(/[\n,，、；;]+/)
      .map((s) => s.trim().replace(/^[「『"']|[」』"']$/g, ""))
      .filter(Boolean),
  ),
];
export function researchIntent(text) {
  const discovery = discoveryIntent(text);
  if(discovery) return discovery;
  const t = text
    .trim()
    .replace(/^(?:(?:我是說|我的意思是|要你|請你|請|幫我|麻煩|我想要|我要|現在|立即|馬上|直接|去|到|網路上|網路|上網|可以)\s*)+/, "");
  if (/^(?:不要|不用|不需要)/.test(t)) return null;
  const urls = [
    ...new Set(
      (t.match(/https:\/\/[^\s<>「」]+/g) || []).map((u) =>
        u.replace(/[，。；、）),;]+$/, ""),
      ),
    ),
  ];
  if (
    /^(?:搜尋|查詢).*(?:關鍵字).*(?:有哪些|是什麼)/.test(t) ||
    /^(?:目前|現在|列出|查看|顯示|查詢|有哪些).*(?:關鍵字|追蹤設定|追蹤什麼|追蹤哪些)/.test(
      t,
    ) ||
    /^(?:關鍵字|追蹤設定)(?:有哪些|是什麼|列表|清單|[？?])/.test(t)
  )
    return { type: "list" };
  const keyword = t.match(
    /^(新增|加入|增加|移除|刪除)(?:要追蹤的|追蹤)?關鍵字\s*[:：]?\s*(.+)$/s,
  );
  if (keyword)
    return {
      type: /移除|刪除/.test(keyword[1]) ? "remove-keywords" : "add-keywords",
      values: terms(keyword[2]),
    };
  if (/^(?:暫停|停止|取消)(?:每日|每週|定期|自動)?(?:追蹤|搜尋|收集)/.test(t))
    return { type: "pause" };
  if (/^(?:恢復|啟用)(?:每日|每週|定期|自動)?(?:追蹤|搜尋|收集)/.test(t))
    return { type: "resume" };
  const monitor = t.match(
    /^(?:每天|每日|每週|每周)(?:一次)?(?:幫我)?(?:追蹤|搜尋|收集|監看)\s*[:：]?\s*(.*)$/s,
  );
  if (monitor)
    return {
      type: "monitor",
      days: /每[週周]/.test(t) ? 7 : 1,
      values: urls.length
        ? []
        : /^(?:目前|現在|這些|這個|所有|已設定|現有).*(?:主題|關鍵字)|^$/.test(
              monitor[1],
            )
          ? []
          : terms(monitor[1]),
      urls,
    };
  if (urls.length && /^(?:新增|加入|追蹤|移除|刪除).*(?:來源|網站)/.test(t))
    return {
      type: /^(移除|刪除)/.test(t) ? "remove-sources" : "add-sources",
      urls,
    };
  if (urls.length && /分析|閱讀|讀取|整理|保存|收集/.test(t))
    return { type: "analyze", urls };
  if (
    /^(?:搜尋|查找|找一下|找|查一下|收集|整理|分析).*(?:文章|新聞|關鍵字|產業|趨勢|主題)/.test(
      t,
    ) ||
    /^(?:立即搜尋|搜尋一次)$/.test(t)
  )
    return searchAction(t);
  if(/^(?:搜尋|搜查|搜索|查詢|查找|查一下|找一下)/.test(t))return searchAction(t);
  return null;
}
function searchAction(text){
  const query=text.replace(/^(?:立即搜尋|搜尋一次|搜尋|搜查|搜索|查詢|查找|查一下|找一下|找|收集|整理|分析)(?:一下)?\s*[:：]?\s*/,"").replace(/(?:並且|然後|並|再)?(?:幫我)?(?:整理|彙整|匯整|總結|摘要)(?:一下)?(?:給我)?[。！!？?]*$/g,"").trim();
  return {type:"search",...(query && !/^(?:目前|現在|這些|這個|相關|現有|已設定|最新|產業|新聞|關鍵字|主題|的|內容|有哪些|有什麼|\s|[。？?])+$/u.test(query)?{query:query.slice(0,100)}:{})};
}
export class ResearchActions {
  constructor(
    store,
    articles,
    { clock = () => Date.now(), paused = () => false } = {},
  ) {
    Object.assign(this, { store, articles, clock, paused });
    this.closed = false;
    this.running = false;
  }
  key(s) {
    return createHash("sha256")
      .update(JSON.stringify([s.teamId, s.projectId]))
      .digest("hex");
  }
  config(s) {
    const team = this.articles.team(s),
      saved = this.store.get("researchWatch", this.key(s));
    return (
      (saved?.dataEpoch === this.articles.epoch() ? saved : null) || {
        id: this.key(s),
        teamId: s.teamId,
        projectId: s.projectId,
        dataEpoch: this.articles.epoch(),
        keywords: terms(
          (team.researchSettings?.topic || "").replace(/\s+/g, ","),
        ),
        sourceUrls: team.researchSettings?.sourceUrls || [],
        enabled: false,
        days: 1,
        revision: 0,
        history: [],
      }
    );
  }
  update(s, patch, revision) {
    const before = this.config(s);
    if (revision !== undefined && before.revision !== revision)
      throw fail("研究設定已更新，請重新讀取。", 409);
    const next = { ...before, ...patch, revision: before.revision + 1 };
    if (
      !Array.isArray(next.keywords) ||
      next.keywords.length > 12 ||
      next.keywords.some(
        (k) => typeof k !== "string" || !k.trim() || k.length > 100,
      )
    )
      throw fail("最多12個關鍵字，每個100字內。");
    if (!Array.isArray(next.sourceUrls) || next.sourceUrls.length > 5)
      throw fail("最多5個固定來源。");
    next.sourceUrls = [...new Set(next.sourceUrls.map(articleUrl))];
    if (typeof next.enabled !== "boolean" || ![1, 7].includes(next.days))
      throw fail("追蹤頻率無效。");
    if (next.enabled && !next.keywords.length && !next.sourceUrls.length)
      throw fail("請先加入關鍵字或來源。");
    if (next.enabled && (!before.enabled || next.days !== before.days))
      next.nextCheckAt = new Date(this.clock() + next.days * DAY).toISOString();
    if (!next.enabled) next.nextCheckAt = null;
    return this.store.put("researchWatch", next);
  }
  describe(c) {
    return `目前追蹤關鍵字：${c.keywords.join("、") || "尚未設定"}\n固定來源：${c.sourceUrls.join("\n") || "尚未設定"}\n定期收集：${c.enabled ? (c.days === 7 ? "每週" : "每日") + "一次" : "未啟用"}${c.nextCheckAt ? "\n下次收集：" + c.nextCheckAt : ""}\n資料保存在本專案的趨勢偵查文章庫，不自動加入知識庫或 Memory。`;
  }
  async execute(s, action, { signal } = {}) {
    signal?.throwIfAborted();
    const c = this.config(s);
    if(action.type === "discover") {
      const batch = await this.discovery.discover(s, action, {signal});
      return {text:this.discovery.describe(batch),discoveryId:batch.id};
    }
    let next = c;
    if (action.type === "add-keywords")
      next = this.update(
        s,
        { keywords: [...new Set([...c.keywords, ...action.values])] },
        c.revision,
      );
    else if (action.type === "remove-keywords")
      next = this.update(
        s,
        { keywords: c.keywords.filter((k) => !action.values.includes(k)) },
        c.revision,
      );
    else if (action.type === "add-sources")
      next = this.update(
        s,
        { sourceUrls: [...new Set([...c.sourceUrls, ...action.urls])] },
        c.revision,
      );
    else if (action.type === "remove-sources")
      next = this.update(
        s,
        {
          sourceUrls: c.sourceUrls.filter(
            (u) => !action.urls.map(articleUrl).includes(articleUrl(u)),
          ),
        },
        c.revision,
      );
    else if (action.type === "pause" || action.type === "resume")
      next = this.update(s, { enabled: action.type === "resume" }, c.revision);
    else if (action.type === "monitor")
      next = this.update(
        s,
        {
          enabled: true,
          days: action.days,
          keywords: [...new Set([...c.keywords, ...action.values])],
          sourceUrls: [...new Set([...c.sourceUrls, ...action.urls])],
        },
        c.revision,
      );
    else if (action.type === "search") {
      const result = await this.articles.collect(s, { signal, query: action.query, newsOnly: true });
      return { text: this.receipt(result), result, articles: result.articles || [] };
    } else if (action.type === "analyze") {
      if (action.urls.length > 3) throw fail("每次最多分析3個網址。");
      const articles = [],
        errors = [];
      for (const url of action.urls) {
        try {
          articles.push(
            (await this.articles.add(s, { url }, { signal })).article,
          );
        } catch (e) {
          signal?.throwIfAborted();
          errors.push(url + "：" + e.message);
        }
      }
      return {
        text: `已讀取並保存 ${articles.length} 篇。${errors.length ? "\n" + errors.join("\n") : ""}`,
        articles,
        errors,
      };
    }
    return {
      text:
        (action.type === "list" ? "" : "研究設定已更新。\n") +
        this.describe(next),
    };
  }
  receipt(r) {
    return `研究收集完成：新增 ${r.added} 篇，已存在 ${r.duplicates} 篇。\n本次搜尋時間：${r.fetchedAt || "未記錄"}\n查詢：${r.query}\n${r.errors.length ? "部分來源未取得：\n" + r.errors.join("\n") : "資料已保存至趨勢偵查文章庫。"}\n新聞可能僅含摘要，請依文章的證據標示閱讀。`;
  }
  async tick() {
    if (this.closed || this.running || this.paused()) return;
    const due = this.store
      .all("researchWatch")
      .find(
        (c) =>
          c.dataEpoch === this.articles.epoch() &&
          c.enabled &&
          Date.parse(c.nextCheckAt) <= this.clock(),
      );
    if (!due) return;
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await this.articles.collect(due, {
        signal: controller.signal,
      });
      if (this.closed || due.dataEpoch !== this.articles.epoch()) return;
      const current = this.config(due);
      if (current.revision !== due.revision) return;
      this.update(
        due,
        {
          lastError: "",
          lastCheckedAt: new Date(this.clock()).toISOString(),
          nextCheckAt: new Date(this.clock() + due.days * DAY).toISOString(),
          history: [
            { at: new Date(this.clock()).toISOString(), ...result },
            ...due.history,
          ].slice(0, 20),
        },
        due.revision,
      );
    } catch (e) {
      if (!this.closed && due.dataEpoch === this.articles.epoch()) {
        const current = this.config(due);
        if (current.revision === due.revision)
          this.update(
            due,
            {
              lastError: e.message,
              nextCheckAt: new Date(this.clock() + 3600000).toISOString(),
            },
            due.revision,
          );
      }
    } finally {
      this.running = false;
      this.controller = null;
    }
  }
  close() {
    this.closed = true;
    this.controller?.abort();
  }
}
