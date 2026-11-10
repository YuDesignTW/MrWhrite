import { fail } from "./store.mjs";

export function socialUrl(value, kind) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw fail("請貼上完整的 Threads 或 IG 連結。");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw fail("只接受 HTTPS 平台連結。");
  const host = u.hostname.replace(/^www\./, "");
  const platform = ["threads.net", "threads.com"].includes(host)
    ? "threads"
    : host === "instagram.com"
      ? "instagram"
      : null;
  if (!platform) throw fail("目前只支援 Threads 與 Instagram。");
  const p = u.pathname.split("/").filter(Boolean);
  const user = /^[A-Za-z0-9_.]{1,50}$/;
  const code = /^[A-Za-z0-9_-]{1,100}$/;
  let username, postId;
  if (platform === "threads") {
    username = p[0]?.replace(/^@/, "");
    if (!user.test(username || "")) throw fail("Threads 帳號連結無效。");
    if (p.length === 3 && p[1] === "post" && code.test(p[2])) postId = p[2];
    else if (p.length !== 1) throw fail("請使用帳號首頁或單篇貼文連結。");
  } else {
    if (p.length === 2 && ["p", "reel"].includes(p[0]) && code.test(p[1]))
      postId = p[1];
    else if (
      p.length === 1 &&
      user.test(p[0]) &&
      !["explore", "accounts", "direct", "stories", "p", "reel"].includes(p[0])
    )
      username = p[0];
    else throw fail("請使用 IG 帳號首頁或單篇貼文連結。");
  }
  const type = postId ? "post" : "account";
  if (kind && type !== kind)
    throw fail(
      type === "account"
        ? "這是帳號首頁，請到追蹤來源加入。"
        : "請提供帳號首頁，不是單篇貼文。",
    );
  const url =
    platform === "threads"
      ? `https://www.threads.com/@${username.toLowerCase()}${postId ? "/post/" + postId : ""}`
      : `https://www.instagram.com/${postId ? p[0] + "/" + postId : username.toLowerCase()}/`;
  return {
    platform,
    type,
    username: username?.toLowerCase() || null,
    postId: postId || null,
    url,
    key: `${platform}:${postId || username.toLowerCase()}`,
  };
}

// Only fixed provider hosts are fetched. User URLs are data, never fetch targets.
export async function jsonRequest(url, options = {}, fetcher = fetch) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !["graph.threads.net", "graph.threads.com", "api.apify.com"].includes(
      u.hostname,
    )
  )
    throw fail("不允許的資料提供者。");
  let r;
  try {
    r = await fetcher(u, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw Object.assign(fail("平台連線失敗或逾時，請稍後重試。", 502), {
      retryable: true,
    });
  }
  if (!r.ok) {
    const retryAfter = Number(r.headers.get("retry-after"));
    throw Object.assign(
      fail(
        r.status === 429
          ? "平台暫時限流，請稍後重試。"
          : [401, 403].includes(r.status)
            ? "平台權限不足或授權已失效。"
            : "平台未能完成請求。",
        r.status === 429 ? 429 : 502,
      ),
      {
        retryable: r.status === 429 || r.status >= 500,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0,
      },
    );
  }
  const reader = r.body.getReader();
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8 * 1024 * 1024) {
      await reader.cancel();
      throw fail("平台回應過大。", 502);
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw fail("平台回應格式無法解析。", 502);
  }
}
const fields =
  "id,text,username,timestamp,permalink,media_type,media_url,thumbnail_url,is_reply,is_quote_post";
export class SocialConnectors {
  constructor({ env = process.env, fetcher = fetch, token = () => null } = {}) {
    this.env = env;
    this.fetcher = fetcher;
    this.token = token;
  }
  status() {
    return {
      threads: !!(this.token() || this.env.MR_WHITE_THREADS_READ_TOKEN),
      instagram: !!this.env.MR_WHITE_APIFY_TOKEN,
    };
  }
  async graph(path, params = {}, method = "GET", token) {
    token ||= this.token() || this.env.MR_WHITE_THREADS_READ_TOKEN;
    if (!token)
      throw fail("Threads 尚未授權；請先完成官方綁定或設定讀取權杖。", 503);
    const u = new URL("https://graph.threads.net/v1.0/" + path);
    const headers = { Authorization: `Bearer ${token}` };
    let body;
    if (method === "GET")
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    else {
      body = new URLSearchParams(params);
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    // Only reads can be retried. Never retry a remote publishing side effect.
    for (let attempt = 0; ; attempt++) {
      try {
        return await jsonRequest(u, { method, headers, body }, this.fetcher);
      } catch (e) {
        if (
          method !== "GET" ||
          !e.retryable ||
          attempt >= 2 ||
          e.retryAfter > 30
        )
          throw e;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(e.retryAfter * 1000 || 0, 1000 * 2 ** attempt),
          ),
        );
      }
    }
  }
  normalizeThread(p) {
    return {
      platform: "threads",
      externalId: p.id,
      url: p.permalink,
      author: p.username || null,
      body: p.text || "",
      publishedAt: p.timestamp || null,
      media: p.media_url
        ? [
            {
              url: p.thumbnail_url || p.media_url,
              type: p.media_type || "unknown",
            },
          ]
        : [],
      isReply: p.is_reply === true,
      provider: "threads-official",
    };
  }
  async threads(account, max = 100) {
    const posts = [];
    let after;
    let partial = false;
    for (let page = 0; page < 10; page++) {
      let result;
      try {
        result = await this.graph("profile_posts", {
          username: account.username,
          fields,
          limit: Math.min(max - posts.length, 100),
          ...(after ? { after } : {}),
        });
      } catch (e) {
        if (posts.length) return { posts, partial: true, error: e.message };
        throw e;
      }
      if (!Array.isArray(result.data))
        throw fail("Threads 未回傳可辨識的貼文列表。", 502);
      posts.push(
        ...result.data
          .slice(0, max - posts.length)
          .map((p) => this.normalizeThread(p)),
      );
      after = result.paging?.cursors?.after;
      if (!result.paging?.next) return { posts, partial };
      if (!after || posts.length >= max) {
        partial = true;
        break;
      }
    }
    return { posts, partial: true };
  }
  async instagram(target, max = 100) {
    const token = this.env.MR_WHITE_APIFY_TOKEN;
    if (!token)
      throw fail(
        "IG 尚未設定資料來源。可先貼上文字保存；自動搜集尚未啟用。",
        503,
      );
    // Deliberately bounded, user-configured paid provider. No automatic task resubmission.
    const data = await jsonRequest(
      "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=40&memory=256",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          directUrls: [target.url],
          resultsType: "posts",
          resultsLimit: max,
        }),
      },
      this.fetcher,
    );
    if (!Array.isArray(data) || data.some((p) => p.error))
      throw fail("IG 資料來源無法讀取此來源，請確認公開狀態與服務額度。", 502);
    return {
      posts: data.map((p) => ({
        platform: "instagram",
        externalId: p.id || p.shortCode,
        url: p.url,
        author: p.ownerUsername || null,
        body: p.caption || "",
        publishedAt: p.timestamp || null,
        media: (p.childPosts?.length ? p.childPosts : [p])
          .filter((x) => x.displayUrl)
          .map((x) => ({ url: x.displayUrl, type: x.type || "image" })),
        provider: "apify-instagram",
      })),
      partial: data.length >= max,
    };
  }
  async account(target) {
    if (target.platform === "threads") {
      const p = await this.graph("profile_lookup", {
        username: target.username,
      });
      if (!p.id && !p.data?.[0]?.id)
        throw fail("無法驗證此 Threads 帳號。", 502);
      return { externalId: p.id || p.data[0].id, provider: "threads-official" };
    }
    // An empty posts response cannot establish that an Instagram account exists.
    const result = await this.instagram(target, 1);
    if (
      !result.posts.length ||
      result.posts.some((p) => p.author?.toLowerCase() !== target.username)
    )
      throw fail("未取得可核對作者的 IG 貼文，暫時不能啟用此來源。", 502);
    return { externalId: target.username, provider: "apify-instagram" };
  }
  async collect(target) {
    return target.platform === "threads"
      ? this.threads(target)
      : this.instagram(target);
  }
  async post(target) {
    const result =
      target.platform === "threads"
        ? await this.threads(target)
        : await this.instagram(target, 1);
    const p = result.posts.find((p) => {
      try {
        return socialUrl(p.url, "post").key === target.key;
      } catch {
        return false;
      }
    });
    if (!p)
      throw fail(
        "未能在可讀範圍中找到這篇貼文。請改貼正文；沒有保存空白結果。",
        422,
      );
    return p;
  }
}
