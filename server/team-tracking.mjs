import { randomUUID } from "node:crypto";
import { fail, now } from "./store.mjs";

export function accountUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw fail("帳號網址無效。");
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password)
    throw fail("只接受 HTTPS 公開帳號網址。");
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const platform = ["x.com", "twitter.com"].includes(host)
    ? "x"
    : ["threads.com", "threads.net"].includes(host)
      ? "threads"
      : host === "instagram.com"
        ? "instagram"
        : null;
  const parts = u.pathname.split("/").filter(Boolean);
  const username = parts[0]?.replace(/^@/, "").toLowerCase();
  if (
    !platform ||
    parts.length !== 1 ||
    !/^[a-z0-9_.]{1,50}$/.test(username || "") ||
    [
      "p",
      "reel",
      "reels",
      "explore",
      "accounts",
      "home",
      "search",
      "intent",
      "i",
      "login",
    ].includes(username)
  )
    throw fail("請提供 X、Threads 或 Instagram 的帳號首頁，非單篇連結。");
  const url =
    platform === "x"
      ? `https://x.com/${username}`
      : platform === "threads"
        ? `https://www.threads.com/@${username}`
        : `https://www.instagram.com/${username}/`;
  return { platform, username, url, key: `${platform}:${username}` };
}
export function trackingIntent(text) {
  if (
    !/^(?:(?:請|幫我|請你|我想要|我想|我要|可以|麻煩|也請|另外請)\s*)*(?:追蹤|監看|訂閱)/.test(text.trim()) ||
    /(?:不要|不用|不需要|不想|取消|停止|暫停)\s*(?:再)?\s*(?:追蹤|監看|訂閱)/.test(text)
  )
    return null;
  const urls = text.match(/https:\/\/[^\s<>「」]+/g) || [];
  if (!urls.length) return null;
  // Conversation routing is optional: unrelated references and post links stay
  // with the director. The explicit tracking endpoint retains strict validation.
  const accounts = [];
  for (const raw of urls) {
    try { accounts.push(accountUrl(raw.replace(/[，。；、）),;]+$/, ""))); }
    catch { /* A reference URL is not a request to register an account. */ }
  }
  return accounts.length ? [...new Map(accounts.map(a=>[a.key,a])).values()] : null;
}
export function trendIntent(text) {
  if (/不要.*(?:搜尋|推薦|選題)|什麼是.*趨勢/.test(text)) return false;
  return /推薦.*內容|內容.*推薦|選題|(?:最新|目前|近期|整理|搜尋|查一下|找一下|有哪些).{0,30}(?:趨勢|話題)|(?:趨勢|話題).{0,30}(?:最新|整理|搜尋|有哪些|推薦)/s.test(
    text,
  );
}
const decode = (s) =>
  s
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (all, n) => {
      const point =
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : all;
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
export async function publicPage(url, signal, fetcher = fetch) {
  const r = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.any([
      signal || new AbortController().signal,
      AbortSignal.timeout(15000),
    ]),
    headers: { Accept: "text/html" },
  });
  if (!r.ok)
    throw Error(`公開頁讀取失敗（HTTP ${r.status}）；未使用登入或付費服務。`);
  const reader = r.body.getReader();
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3000000) {
      await reader.cancel();
      throw Error("公開頁超過3 MB限制。");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString();
}
export function postLinks(html, account) {
  const text = decode(html.replace(/\\\//g, "/").replace(/\\u0026/g, "&"));
  const expressions =
    account.platform === "x"
      ? /(?:https:\/\/(?:www\.)?(?:x|twitter)\.com)?\/([a-zA-Z0-9_]+)\/status\/(\d+)/g
      : account.platform === "threads"
        ? /(?:https:\/\/(?:www\.)?threads\.(?:com|net))?\/@([a-zA-Z0-9_.]+)\/post\/([a-zA-Z0-9_-]+)/g
        : /(?:https:\/\/(?:www\.)?instagram\.com)?\/(p|reel)\/([a-zA-Z0-9_-]+)\//g;
  return [
    ...new Set(
      [...text.matchAll(expressions)]
        .filter(
          (m) =>
            account.platform === "instagram" ||
            m[1].toLowerCase() === account.username,
        )
        .map((m) =>
          account.platform === "x"
            ? `https://x.com/${account.username}/status/${m[2]}`
            : account.platform === "threads"
              ? `https://www.threads.com/@${account.username}/post/${m[2]}`
              : `https://www.instagram.com/${m[1]}/${m[2]}/`,
        ),
    ),
  ].slice(0, 3);
}
export async function collectPublicAccount(account, { signal } = {}) {
  const html = await publicPage(account.url, signal);
  const links = postLinks(html, account);
  if (!links.length)
    throw Error(
      "公開頁未提供可辨識的貼文連結；可能需要登入或動態載入，不能確認最新發文。",
    );
  const posts = [];
  for (const url of links) {
    signal?.throwIfAborted();
    try {
      const page = await publicPage(url, signal);
      const tags = page.match(/<meta\b[^>]*>/gi) || [];
      const tag = tags.find((t) =>
        /(?:property|name)=["']og:description["']/i.test(t),
      );
      const body = decode(
        tag?.match(/content=["']([^]*?)["']\s*\/?\s*>/i)?.[1] || "",
      );
      posts.push({
        url,
        body: body.slice(0, 6000),
        evidence: "公開頁中繼資料；未核驗帳號歸屬、全文或最新排序",
        mediaStatus: /\/reel\/|og:video/.test(url + " " + page)
          ? "video_pending"
          : "not_analyzed",
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      posts.push({
        url,
        body: "",
        error: e.message,
        evidence: "僅取得公開連結，未讀取內容",
        mediaStatus: "not_analyzed",
      });
    }
  }
  return { posts, partial: true };
}
export class TeamTracking {
  constructor(
    store,
    { collector = collectPublicAccount, paused = () => false } = {},
  ) {
    this.store = store;
    this.collector = collector;
    this.paused = paused;
    this.active = null;
    this.closed = false;
    for (const x of store.all("teamTracking")) {
      if (
        x.dataEpoch === this.epoch() &&
        x.posts?.some((p) => p.mediaStatus === "analyzing")
      )
        store.put("teamTracking", {
          ...x,
          posts: x.posts.map((p) =>
            p.mediaStatus === "analyzing"
              ? {
                  ...p,
                  mediaStatus: "failed",
                  analysisError: "服務重啟，解析已中斷，請重試。",
                }
              : p,
          ),
        });
    }
    for (const x of store.all("teamTracking"))
      if (x.status === "collecting" && x.dataEpoch === this.epoch())
        store.put("teamTracking", {
          ...x,
          status: "pending",
          lastError: "上次收集被中斷，等待重試。",
          nextCheckAt: now(),
        });
  }
  epoch() {
    return this.store.get("settings", "main").epoch;
  }
  matches(x, s) {
    return (
      x.teamId === s.teamId &&
      x.projectId === s.projectId &&
      x.dataEpoch === this.epoch()
    );
  }
  list(s) {
    return this.store.all("teamTracking").filter((x) => this.matches(x, s));
  }
  add(s, accounts) {
    if (accounts.length > 10) throw fail("一次最多10個帳號。");
    return accounts.map((a) => {
      const old = this.list(s).find((x) => x.key === a.key);
      if (old) return old;
      return this.store.put("teamTracking", {
        id: randomUUID(),
        teamId: s.teamId,
        projectId: s.projectId,
        ...a,
        dataEpoch: this.epoch(),
        enabled: true,
        intervalHours: 24,
        status: "pending",
        createdAt: now(),
        nextCheckAt: now(),
        posts: [],
      });
    });
  }
  get(s, id) {
    const x = this.store.get("teamTracking", id);
    if (!x || !this.matches(x, s)) throw fail("找不到追蹤帳號。", 404);
    return x;
  }
  update(s, id, enabled) {
    if (typeof enabled !== "boolean") throw fail("追蹤設定無效。");
    const x = this.get(s, id);
    return this.store.put("teamTracking", {
      ...x,
      enabled,
      nextCheckAt: enabled ? now() : null,
    });
  }
  async collect(s, id) {
    if (this.closed || this.active || this.paused())
      throw fail("已有收集或模型工作進行中，請稍後重試。", 409);
    const x = this.get(s, id);
    if (!x.enabled) throw fail("請先恢復追蹤。", 409);
    const controller = new AbortController();
    this.active = controller;
    this.store.put("teamTracking", {
      ...x,
      status: "collecting",
      lastAttemptAt: now(),
    });
    try {
      const result = await this.collector(x, { signal: controller.signal });
      if (
        this.closed ||
        controller.signal.aborted ||
        x.dataEpoch !== this.epoch()
      )
        return;
      const current = this.get(s, id),
        posts = new Map((current.posts || []).map((p) => [p.url, p]));
      let added = 0;
      for (const p of result.posts.slice(0, 10)) {
        if (!posts.has(p.url)) added++;
        const prior=posts.get(p.url);
        posts.set(p.url, { ...prior, ...p,
          ...(p.error && prior?.body ? {body:prior.body,evidence:prior.evidence,lastReadError:p.error} : {}),
          ...(prior?.analysis ? {mediaStatus:'analyzed'} : {}),
          collectedAt:now() });
      }
      return this.store.put("teamTracking", {
        ...current,
        status: result.partial ? "partial" : "collected",
        lastSuccessAt: now(),
        lastError: null,
        added,
        posts: [...posts.values()].slice(-60),
        nextCheckAt: current.enabled
          ? new Date(Date.now() + 86400000).toISOString()
          : null,
      });
    } catch (e) {
      if (
        this.closed ||
        controller.signal.aborted ||
        x.dataEpoch !== this.epoch()
      )
        return;
      const current = this.get(s, id);
      return this.store.put("teamTracking", {
        ...current,
        status: "blocked",
        lastError: e.message,
        lastAttemptAt: now(),
        nextCheckAt: current.enabled
          ? new Date(Date.now() + 86400000).toISOString()
          : null,
      });
    } finally {
      this.active = null;
    }
  }
  async tick() {
    if (this.closed || this.active || this.paused()) return;
    const due = this.store
      .all("teamTracking")
      .find(
        (x) =>
          x.dataEpoch === this.epoch() &&
          x.enabled &&
          Date.parse(x.nextCheckAt) <= Date.now(),
      );
    if (due) await this.collect(due, due.id);
  }
  close() {
    this.closed = true;
    this.active?.abort();
  }
}
