import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { uid, now, fail } from "./store.mjs";
import { jsonRequest } from "./social-connectors.mjs";

// Separate from SQLite backups. Encryption key comes from the process environment.
export class TokenVault {
  constructor(dir, key) {
    this.dir = join(dir, "credentials");
    this.file = join(this.dir, "threads.enc");
    this.key =
      key && /^[a-f\d]{64}$/i.test(key) ? Buffer.from(key, "hex") : null;
  }
  read() {
    if (!this.key || !existsSync(this.file)) return null;
    try {
      const b = JSON.parse(readFileSync(this.file, "utf8"));
      const dec = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(b.iv, "hex"),
      );
      dec.setAuthTag(Buffer.from(b.tag, "hex"));
      return JSON.parse(
        Buffer.concat([
          dec.update(Buffer.from(b.data, "hex")),
          dec.final(),
        ]).toString(),
      );
    } catch {
      return null;
    }
  }
  write(data) {
    if (!this.key) throw fail("尚未設定憑證加密金鑰。", 503);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key, iv);
    const dataHex = Buffer.concat([
      c.update(JSON.stringify(data)),
      c.final(),
    ]).toString("hex");
    writeFileSync(
      this.file + ".tmp",
      JSON.stringify({
        iv: iv.toString("hex"),
        tag: c.getAuthTag().toString("hex"),
        data: dataHex,
      }),
      { mode: 0o600 },
    );
    renameSync(this.file + ".tmp", this.file);
  }
  clear() {
    if (existsSync(this.file)) unlinkSync(this.file);
  }
}
export class Publishing {
  constructor(
    store,
    connector,
    { env = process.env, clock = () => new Date() } = {},
  ) {
    this.store = store;
    this.connector = connector;
    this.env = env;
    this.clock = clock;
    this.vault = new TokenVault(store.dir, env.MR_WHITE_CREDENTIAL_KEY);
    this.pending = new Map();
    this.busy = false;
    this.closed = false;
    for (const p of this.list())
      if (p.status === "publishing")
        store.put("publication", {
          ...p,
          status: "unknown",
          error: "服務中斷；請先查核平台，勿直接重送。",
        });
    for (const p of this.list())
      if (
        p.status === "queued" &&
        Date.parse(p.scheduledAt) <= clock().getTime()
      )
        store.put("publication", {
          ...p,
          status: "missed",
          error: "已錯過發布時間，請重新安排。",
        });
  }
  token() {
    const a = this.vault.read();
    return a && a.expiresAt > this.clock().getTime() ? a.token : null;
  }
  account() {
    const a = this.vault.read();
    return a
      ? {
          id: a.id,
          username: a.username,
          expiresAt: a.expiresAt,
          connected: !!this.token(),
        }
      : null;
  }
  status() {
    return {
      account: this.account(),
      configured: !!(
        this.env.MR_WHITE_THREADS_APP_ID &&
        this.env.MR_WHITE_THREADS_APP_SECRET &&
        this.env.MR_WHITE_THREADS_REDIRECT_URI &&
        this.vault.key
      ),
      mode: "local",
      note: "本機服務停止時不會執行排程；逾期發布不補發。",
    };
  }
  start(session) {
    if (!this.status().configured)
      throw fail(
        "請先在本機環境設定 Meta App ID、Secret、回呼網址與憑證加密金鑰。",
        503,
      );
    const redirect = new URL(this.env.MR_WHITE_THREADS_REDIRECT_URI);
    if (
      redirect.protocol !== "https:" &&
      !(
        redirect.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(redirect.hostname)
      )
    )
      throw fail("官方回呼網址必須為 HTTPS 或本機網址。");
    for (const [k, v] of this.pending)
      if (v.expires < this.clock().getTime()) this.pending.delete(k);
    const state = randomBytes(32).toString("hex");
    this.pending.set(state, {
      session,
      expires: this.clock().getTime() + 600000,
    });
    const url = new URL("https://threads.net/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: this.env.MR_WHITE_THREADS_APP_ID,
      redirect_uri: redirect.href,
      scope: "threads_basic,threads_content_publish,threads_profile_discovery",
      response_type: "code",
      state,
    }).toString();
    return { url: url.href };
  }
  async complete(callback, session) {
    if (this.busy) throw fail("正在執行發布或授權工作，請稍候。", 409);
    let u;
    try {
      u = new URL(callback);
    } catch {
      throw fail("請貼上官方授權後的完整回呼網址。");
    }
    const expected = new URL(
      this.env.MR_WHITE_THREADS_REDIRECT_URI || "http://invalid",
    );
    if (u.origin !== expected.origin || u.pathname !== expected.pathname)
      throw fail("回呼網址不符合設定。");
    const state = u.searchParams.get("state"),
      p = this.pending.get(state);
    this.pending.delete(state);
    if (!p || p.session !== session || p.expires < this.clock().getTime())
      throw fail("授權驗證過期或不符合目前工作階段。");
    if (u.searchParams.has("error") || !u.searchParams.get("code"))
      throw fail("授權未完成。");
    this.busy = true;
    try {
      const post = async (url, data) =>
        jsonRequest(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(data),
          },
          this.connector.fetcher,
        );
      const short = await post("https://graph.threads.net/oauth/access_token", {
        client_id: this.env.MR_WHITE_THREADS_APP_ID,
        client_secret: this.env.MR_WHITE_THREADS_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: expected.href,
        code: u.searchParams.get("code"),
      });
      const exchange = new URL("https://graph.threads.net/access_token");
      exchange.search = new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: this.env.MR_WHITE_THREADS_APP_SECRET,
        access_token: short.access_token,
      }).toString();
      const long = await jsonRequest(exchange, {}, this.connector.fetcher);
      if (!long.access_token || !Number.isFinite(long.expires_in))
        throw fail("未取得有效的官方長期權杖。", 502);
      const me = await this.connector.graph(
        "me",
        { fields: "id,username" },
        "GET",
        long.access_token,
      );
      if (!me.id || !me.username) throw fail("無法確認發布帳號。", 502);
      if (this.closed) throw fail("服務已停止。", 503);
      this.vault.write({
        token: long.access_token,
        id: me.id,
        username: me.username,
        expiresAt: this.clock().getTime() + long.expires_in * 1000,
        obtainedAt: this.clock().getTime(),
      });
      return this.status();
    } finally {
      this.busy = false;
    }
  }

  async refresh() {
    if (this.busy) throw fail("正在執行發布或授權工作，請稍候。", 409);
    const a = this.vault.read();
    if (!a || !this.token()) throw fail("授權已過期，請重新官方授權。", 409);
    if (a.obtainedAt && this.clock().getTime() - a.obtainedAt < 86400000)
      throw fail("權杖取得未滿一天，暫不更新。", 409);
    this.busy = true;
    try {
      const url = new URL("https://graph.threads.net/refresh_access_token");
      url.search = new URLSearchParams({
        grant_type: "th_refresh_token",
        access_token: a.token,
      }).toString();
      const result = await jsonRequest(url, {}, this.connector.fetcher);
      if (!result.access_token || !Number.isFinite(result.expires_in))
        throw fail("官方未回傳有效更新權杖。", 502);
      if (this.closed) throw fail("服務已停止。", 503);
      this.vault.write({
        ...a,
        token: result.access_token,
        expiresAt: this.clock().getTime() + result.expires_in * 1000,
        obtainedAt: this.clock().getTime(),
      });
      return this.status();
    } finally {
      this.busy = false;
    }
  }
  disconnect() {
    if (this.busy) throw fail("正在發布，請待結果確認後再解除綁定。", 409);
    this.vault.clear();
    this.pending.clear();
    for (const p of this.list())
      if (p.status === "queued")
        this.store.put("publication", {
          ...p,
          status: "cancelled",
          error: "帳號已解除綁定。",
        });
    return this.status();
  }
  list() {
    return this.store
      .all("publication")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  create(b) {
    if (typeof b.id !== "string" || !/^[-\w]{1,80}$/.test(b.id))
      throw fail("發布操作識別碼無效。");
    const existing = this.store.get("publication", b.id);
    if (existing) return existing;
    const a = this.account();
    if (!a?.connected) throw fail("請先綁定有效的 Threads 發布帳號。", 409);
    if (b.accountId !== a.id) throw fail("發布帳號已改變，請重新預覽。", 409);
    if (
      b.confirm !== true ||
      typeof b.text !== "string" ||
      !b.text.trim() ||
      Array.from(b.text).length > 500
    )
      throw fail("請確認 1～500 字元的純文字內容。");
    if (b.articleId) {
      const article = this.store.article(b.articleId);
      if (article.revision !== b.revision || article.deletedAt)
        throw fail("文章版本已變更，請重新預覽。", 409);
    }
    const at = b.scheduledAt ? new Date(b.scheduledAt) : this.clock();
    if (Number.isNaN(at.getTime()) || (b.scheduledAt && at <= this.clock()))
      throw fail("請選擇未來的發布時間。");
    return this.store.put("publication", {
      id: b.id,
      articleId: b.articleId || null,
      revision: b.revision ?? null,
      text: b.text,
      accountId: a.id,
      username: a.username,
      scheduledAt: at.toISOString(),
      createdAt: now(),
      status: "queued",
    });
  }
  cancel(id) {
    const p = this.store.get("publication", id);
    if (!p) throw fail("找不到發布工作。", 404);
    if (p.status !== "queued") throw fail("工作已開始或結束，不能取消。", 409);
    return this.store.put("publication", { ...p, status: "cancelled" });
  }
  reschedule(id, b) {
    const p = this.store.get("publication", id);
    if (!p || !["queued", "missed"].includes(p.status))
      throw fail("只有待發布或已錯過的工作可以改期。", 409);
    const at = new Date(b.scheduledAt);
    if (!b.confirm || Number.isNaN(at.getTime()) || at <= this.clock())
      throw fail("請確認未來的發布時間。");
    return this.store.put("publication", {
      ...p,
      scheduledAt: at.toISOString(),
      status: "queued",
      error: null,
    });
  }
  async publish(id) {
    if (this.busy || this.closed) return;
    let p = this.store.get("publication", id);
    if (
      !p ||
      p.status !== "queued" ||
      Date.parse(p.scheduledAt) > this.clock().getTime()
    )
      return;
    const a = this.account();
    if (!a?.connected || a.id !== p.accountId)
      return this.store.put("publication", {
        ...p,
        status: "failed",
        error: "帳號或授權已改變，請重新確認發布。",
      });
    this.busy = true;
    let remoteAttempt = false;
    p = this.store.put("publication", {
      ...p,
      status: "publishing",
      startedAt: now(),
    });
    try {
      // Never use auto_publish_text: persist container ID before the side-effecting step.
      const container = await this.connector.graph(
        "me/threads",
        { media_type: "TEXT", text: p.text },
        "POST",
        this.token(),
      );
      if (!container.id) throw fail("平台未提供內容容器識別碼。", 502);
      p = this.store.put("publication", { ...p, containerId: container.id });
      remoteAttempt = true;
      const published = await this.connector.graph(
        "me/threads_publish",
        { creation_id: p.containerId },
        "POST",
        this.token(),
      );
      if (!published.id) throw fail("平台未提供貼文識別碼。", 502);
      p = this.store.put("publication", {
        ...p,
        status: "published",
        remoteId: published.id,
        publishedAt: now(),
        error: null,
      });
      try {
        const remote = await this.connector.graph(
          p.remoteId,
          { fields: "permalink" },
          "GET",
          this.token(),
        );
        p = this.store.put("publication", {
          ...p,
          url: remote.permalink || null,
        });
      } catch {}
    } catch (e) {
      p = this.store.put("publication", {
        ...p,
        status: remoteAttempt ? "unknown" : "failed",
        error: remoteAttempt
          ? "發布結果不明。請先查看平台，不會自動重送。"
          : e.status
            ? e.message
            : "發布失敗，未自動重送。",
      });
    } finally {
      this.busy = false;
    }
    return p;
  }
  async check(id) {
    let p = this.store.get("publication", id);
    if (!p) throw fail("找不到工作。", 404);
    if (!p.containerId) throw fail("沒有可查核的平台容器。");
    if (!this.token() || this.account()?.id !== p.accountId)
      throw fail("請使用原發布帳號查核。");
    const r = await this.connector.graph(
      p.containerId,
      { fields: "status,error_message" },
      "GET",
      this.token(),
    );
    return this.store.put("publication", {
      ...p,
      checkedAt: now(),
      remoteStatus: r.status || "UNKNOWN",
    });
  }
  async tick() {
    if (this.busy || this.closed) return;
    for (const p of this.list().filter(
      (p) =>
        p.status === "queued" &&
        Date.parse(p.scheduledAt) <= this.clock().getTime(),
    )) {
      if (this.clock().getTime() - Date.parse(p.scheduledAt) > 120000)
        this.store.put("publication", {
          ...p,
          status: "missed",
          error: "已錯過發布時間，請重新安排。",
        });
      else await this.publish(p.id);
      if (this.closed) break;
    }
  }
  close() {
    this.closed = true;
  }
}
