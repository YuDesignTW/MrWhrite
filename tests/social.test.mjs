import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.mjs";
import { Intelligence, localDay } from "../server/intelligence.mjs";
import {
  SocialConnectors,
  socialUrl,
  jsonRequest,
} from "../server/social-connectors.mjs";
import { Publishing } from "../server/publishing.mjs";
import { Backups } from "../server/backups.mjs";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-white-social-"));
  const store = new Store(dir);
  return {
    dir,
    store,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
};
const post = (n, at = "2026-11-04T01:00:00Z") => ({
  body: `情報 ${n} 繁體🌿`,
  url: `https://www.threads.com/@tr_lab/post/P${n}`,
  author: "tr_lab",
  publishedAt: at,
  platform: "threads",
  provider: "fixture",
});
const fake = {
  status: () => ({ threads: true, instagram: true }),
  account: async () => ({ externalId: "test", provider: "test" }),
  collect: async () => ({ posts: [], partial: false }),
  post: async () => post(1),
};

test("使用者的來源 URL 正規化、分享參數去除、拒絕非平台及私人網路網址", () => {
  assert.equal(
    socialUrl("https://www.instagram.com/p/DaNLbQyE9F9/?img_index=9", "post")
      .url,
    "https://www.instagram.com/p/DaNLbQyE9F9/",
  );
  assert.equal(
    socialUrl("https://www.threads.com/@tr_lab?xmt=tracking", "account").key,
    "threads:tr_lab",
  );
  for (const u of [
    "https://127.0.0.1/p/a",
    "https://instagram.com.evil.test/p/a",
    "http://instagram.com/p/a",
    "https://x@instagram.com/p/a",
    "https://instagram.com:444/p/a",
    "https://instagram.com/accounts",
    "https://www.threads.com/@x/other/a",
  ])
    assert.throws(() => socialUrl(u));
  assert.throws(() => socialUrl("https://www.instagram.com/tr_lab/", "post"));
});

test("情報保存、重複、收藏、刪除墓碑、獨立草稿與游標分頁", () => {
  const s = make();
  try {
    const i = new Intelligence(s.store, fake);
    const p = i.save(post(1));
    assert.equal(
      i.save({ ...post(1), url: post(1).url + "?x=1" }).duplicate,
      true,
    );
    i.patch(p.post.id, { favorite: true });
    assert.equal(i.list({ favorite: "1" }).items.length, 1);
    i.patch(p.post.id, { deleted: true });
    assert.equal(i.list().items.length, 0);
    assert.equal(i.save(post(1)).post.deletedAt !== null, true);
    i.patch(p.post.id, { deleted: false });
    const a = i.draft(p.post.id);
    s.store.update(a.id, {
      title: "新觀點",
      body: "自己的文章",
      baseRevision: a.revision,
    });
    assert.equal(i.post(p.post.id).body, post(1).body);
    for (let n = 2; n <= 65; n++) i.save(post(n));
    const one = i.list(),
      two = i.list({ cursor: one.nextCursor }),
      three = i.list({ cursor: two.nextCursor });
    assert.equal(one.items.length, 30);
    assert.equal(
      new Set([...one.items, ...two.items, ...three.items].map((p) => p.id))
        .size,
      65,
    );
    assert.equal(i.list({ q: "情報 65" }).items.length, 1);
    assert.throws(() => i.save({ body: "  " }));
  } finally {
    s.close();
  }
});

test("當日篩選、置頂舊文、未知日期、分頁上限及重複抓取", async () => {
  const s = make();
  try {
    const i = new Intelligence(
      s.store,
      {
        ...fake,
        collect: async () => ({
          posts: [
            post(0, "2026-11-03T15:59:59Z"),
            post(1, "2026-11-03T16:00:00Z"),
            post(2),
            post(3, null),
            post(4, "2026-11-04T16:00:00Z"),
            { ...post(5), isReply: true },
          ],
          partial: true,
        }),
      },
      { clock: () => new Date("2026-11-04T10:00:00Z") },
    );
    const src = await i.addSource("https://www.threads.com/@tr_lab");
    const r = await i.collect(src.id);
    assert.equal(r.status, "partial");
    assert.equal(r.added, 2);
    assert.equal(r.undated, 1);
    assert.equal(r.skipped, 3);
    assert.equal((await i.collect(src.id)).existing, 2);
    assert.equal(i.sources()[0].lastSuccess, undefined);
    assert.equal(localDay(new Date("2026-11-03T16:00:00Z")).date, "2026-11-04");
  } finally {
    s.close();
  }
});

test("停用中的來源不保存待回覆結果；並行更新合併", async () => {
  const s = make();
  try {
    let resolve,
      calls = 0;
    const i = new Intelligence(s.store, {
      ...fake,
      collect: () => {
        calls++;
        return new Promise((r) => (resolve = r));
      },
    });
    const src = await i.addSource("https://www.instagram.com/tr_lab/");
    const a = i.collect(src.id),
      b = i.collect(src.id);
    assert.equal(a, b);
    await i.setSource(src.id, { enabled: false });
    resolve({ posts: [post(1)], partial: false });
    assert.equal((await a).status, "failed");
    assert.equal(calls, 1);
    assert.equal(i.list().items.length, 0);
  } finally {
    s.close();
  }
});

test("每日排程同一時段只一次、重啟補最新時段不回播昨日", async () => {
  const s = make();
  try {
    let at = new Date("2026-11-04T11:00:00Z"),
      calls = 0;
    const connector = {
      ...fake,
      collect: async () => {
        calls++;
        return { posts: [], partial: false };
      },
    };
    let i = new Intelligence(s.store, connector, { clock: () => at });
    await i.addSource("https://www.threads.com/@tr_lab");
    i.configure({
      enabled: true,
      times: ["09:00", "18:00"],
      timeZone: "Asia/Taipei",
    });
    await i.tick();
    await i.tick();
    assert.equal(calls, 1);
    i.close();
    i = new Intelligence(s.store, connector, { clock: () => at });
    await i.tick();
    assert.equal(calls, 1);
    at = new Date("2026-11-05T01:00:00Z");
    await i.tick();
    assert.equal(calls, 2);
    assert.throws(() => i.configure({ times: ["25:00"] }));
  } finally {
    s.close();
  }
});

test("未設定資料來源時來源保存為待驗證，不能啟用或假裝成功", async () => {
  const s = make();
  try {
    const i = new Intelligence(s.store, new SocialConnectors({ env: {} }));
    const source = await i.addSource(
      "https://www.instagram.com/heidisocialbook/",
    );
    assert.equal(source.enabled, false);
    assert.match(source.error, /尚未設定/);
    await assert.rejects(() => i.collect(source.id));
    await assert.rejects(() =>
      i.preview("https://www.instagram.com/p/DaNLbQyE9F9/"),
    );
  } finally {
    s.close();
  }
});

const setupPublisher = (s, graph) => {
  const connector = { graph, fetcher: fetch };
  const env = {
    MR_WHITE_CREDENTIAL_KEY: "ab".repeat(32),
    MR_WHITE_THREADS_APP_ID: "id",
    MR_WHITE_THREADS_APP_SECRET: "secret",
    MR_WHITE_THREADS_REDIRECT_URI: "http://127.0.0.1:4389/oauth/threads",
  };
  const p = new Publishing(s.store, connector, {
    env,
    clock: () => new Date("2026-11-04T10:00:00Z"),
  });
  p.vault.write({
    id: "account",
    username: "test",
    token: "test-secret",
    expiresAt: Date.parse("2026-12-04"),
  });
  return p;
};
const payload = (id) => ({
  id,
  accountId: "account",
  text: "這是確認的純文字",
  confirm: true,
});

test("發布確認、帳號檢查、快照與冪等；逾時保持 unknown 不重送", async () => {
  const s = make();
  try {
    let calls = 0;
    const p = setupPublisher(s, async (path) => {
      calls++;
      if (path === "me/threads") return { id: "container" };
      throw Error("network timeout");
    });
    assert.throws(() => p.create({ ...payload("x"), confirm: false }));
    assert.throws(() => p.create({ ...payload("x"), accountId: "other" }));
    const a = p.create(payload("x"));
    assert.deepEqual(p.create({ ...payload("x"), text: "不同內容" }), a);
    const r = await p.publish("x");
    assert.equal(r.status, "unknown");
    assert.equal(r.containerId, "container");
    await p.publish("x");
    assert.equal(calls, 2);
    assert.throws(() =>
      p.reschedule("x", { scheduledAt: "2026-11-05", confirm: true }),
    );
    assert.equal(
      s.store.dump().some((x) => x.data.includes("test-secret")),
      false,
    );
    assert.equal(
      readFileSync(p.vault.file, "utf8").includes("test-secret"),
      false,
    );
  } finally {
    s.close();
  }
});

test("未來發布不可提前執行、取消不發、重啟逾期不補發", async () => {
  const s = make();
  try {
    let calls = 0;
    const p = setupPublisher(s, async () => {
      calls++;
      return { id: "id" };
    });
    p.create({ ...payload("future"), scheduledAt: "2026-11-05T10:00:00Z" });
    await p.publish("future");
    assert.equal(calls, 0);
    p.cancel("future");
    await p.tick();
    assert.equal(calls, 0);
    p.create(payload("now"));
    const restarted = setupPublisher(s, async () => {
      calls++;
    });
    assert.equal(restarted.list().find((x) => x.id === "now").status, "missed");
    await restarted.tick();
    assert.equal(calls, 0);
  } finally {
    s.close();
  }
});

test("發布服務替身：完成保存遠端 ID，重按不再次發布", async () => {
  const s = make();
  try {
    let calls = [];
    const p = setupPublisher(s, async (path) => {
      calls.push(path);
      if (path === "me/threads") return { id: "container" };
      if (path === "me/threads_publish") return { id: "remote" };
      return { permalink: "https://www.threads.com/@test/post/remote" };
    });
    p.create(payload("x"));
    await p.publish("x");
    assert.equal(p.list()[0].status, "published");
    assert.equal(p.list()[0].remoteId, "remote");
    await p.publish("x");
    assert.equal(calls.length, 3);
  } finally {
    s.close();
  }
});

test("OAuth state 綁定工作階段且不可重播，不發送未驗證授權碼", async () => {
  const s = make();
  try {
    let calls = 0;
    const p = setupPublisher(s, async () => {
      calls++;
    });
    const url = new URL(p.start("one").url);
    const cb =
      "http://127.0.0.1:4389/oauth/threads?code=code&state=" +
      url.searchParams.get("state");
    await assert.rejects(() => p.complete(cb, "two"));
    await assert.rejects(() => p.complete(cb, "one"));
    assert.equal(calls, 0);
  } finally {
    s.close();
  }
});

test("情報與排程備份還原：凍結待發、保留 unknown、不備份憑證", async () => {
  const s = make();
  try {
    const i = new Intelligence(s.store, fake);
    i.save(post(1));
    const p = setupPublisher(s, async () => {});
    p.create({ ...payload("future"), scheduledAt: "2026-11-05T10:00:00Z" });
    s.store.put("publication", {
      ...p.list()[0],
      id: "uncertain",
      status: "unknown",
    });
    const b = new Backups(s.store);
    const snap = await b.snapshot();
    i.save(post(2));
    await b.restore(snap.id);
    assert.equal(i.list().items.length, 1);
    assert.equal(s.store.get("publication", "future").status, "missed");
    assert.equal(s.store.get("publication", "uncertain").status, "unknown");
    assert.equal(
      JSON.stringify(b.verify(snap.id)).includes("test-secret"),
      false,
    );
  } finally {
    s.close();
  }
});

test("API 情報導入、伺服器預覽、防止偽造解析資料、草稿與既有 CSRF", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-white-social-api-"));
  const s = createApp({ dir, socialOptions: { connector: fake, env: {} } });
  try {
    const c = await client(s.app);
    const p = (
      await c.request("/social/import", "POST", {
        body: "自己的筆記\n第二行🌿",
      })
    ).data.post;
    assert.equal(p.manual, true);
    assert.equal(
      (await c.request("/social/import", "POST", { previewId: "forged" }))
        .status,
      400,
    );
    const preview = (
      await c.request("/social/preview", "POST", { url: post(1).url })
    ).data;
    const imported = (
      await c.request("/social/import", "POST", {
        previewId: preview.id,
        body: "attempted override",
      })
    ).data.post;
    assert.equal(imported.body, post(1).body);
    assert.equal(
      (await c.request("/social/posts/" + p.id + "/draft", "POST", {})).data
        .body,
      p.body,
    );
    assert.equal(
      (
        await c.request(
          "/social/import",
          "POST",
          { body: "x" },
          { "X-CSRF-Token": "invalid" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await c.request("/social/threads/connect", "POST", {})).status,
      503,
    );
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("固定提供者端點拒絕 SSRF 與 redirect，限制回應大小", async () => {
  let called = false;
  await assert.rejects(() =>
    jsonRequest("https://localhost/private", {}, async () => {
      called = true;
    }),
  );
  assert.equal(called, false);
  await assert.rejects(() =>
    jsonRequest("https://graph.threads.net/test", {}, async (u, opts) => {
      assert.equal(opts.redirect, "error");
      return new Response("x".repeat(8 * 1024 * 1024 + 1));
    }),
  );
});

test("Threads 分頁後失敗仍保留已取得項目並回報部分完成", async () => {
  const c = new SocialConnectors({ env: {} });
  let calls = 0;
  c.graph = async () => {
    if (calls++) throw Error("page failed");
    return {
      data: [
        {
          id: "1",
          text: "已讀到",
          username: "tr_lab",
          permalink: post(1).url,
          timestamp: post(1).publishedAt,
        },
      ],
      paging: { next: "provider-next", cursors: { after: "cursor" } },
    };
  };
  const r = await c.threads({ username: "tr_lab" });
  assert.equal(r.partial, true);
  assert.equal(r.posts.length, 1);
});

test("還原不與等待中的來源驗證並行，避免舊請求污染還原資料", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-white-restore-race-"));
  let release;
  const s = createApp({
    dir,
    socialOptions: {
      env: {},
      connector: { ...fake, account: () => new Promise((r) => (release = r)) },
    },
  });
  try {
    const c = await client(s.app);
    const snap = await s.backups.snapshot();
    const pending = c.request("/social/sources", "POST", {
      url: "https://www.threads.com/@tr_lab",
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(s.social.busy, true);
    assert.equal(
      (
        await c.request("/backups/" + snap.id + "/restore", "POST", {
          confirm: snap.id,
        })
      ).status,
      423,
    );
    release({ externalId: "1" });
    await pending;
    assert.equal(s.social.busy, false);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("資料目錄執行鎖防止第二個伺服器重設發布狀態", async () => {
  const { lockRuntime } = await import("../server/runtime-lock.mjs");
  const dir = mkdtempSync(join(tmpdir(), "mr-white-lock-"));
  try {
    const release = lockRuntime(dir);
    assert.throws(() => lockRuntime(dir), /已有服務/);
    release();
    const releaseAgain = lockRuntime(dir);
    releaseAgain();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("官方 OAuth 請求形狀與權杖更新流程（HTTP 替身，非平台驗收）", async () => {
  const s = make();
  try {
    const p = setupPublisher(s, async () => ({
      id: "account",
      username: "test",
    }));
    const paths = [];
    p.connector.fetcher = async (url, options) => {
      const u = new URL(url);
      paths.push(u.pathname);
      assert.equal(options.redirect, "error");
      return new Response(
        JSON.stringify(
          u.pathname === "/oauth/access_token"
            ? { access_token: "short" }
            : {
                access_token: paths.length === 3 ? "refreshed" : "long",
                expires_in: 5184000,
              },
        ),
        { status: 200 },
      );
    };
    const auth = new URL(p.start("session").url);
    await p.complete(
      "http://127.0.0.1:4389/oauth/threads?state=" +
        auth.searchParams.get("state") +
        "&code=code",
      "session",
    );
    assert.deepEqual(paths, ["/oauth/access_token", "/access_token"]);
    assert.equal(p.token(), "long");
    await assert.rejects(() => p.refresh(), /未滿一天/);
    p.vault.write({ ...p.vault.read(), obtainedAt: 0 });
    await p.refresh();
    assert.equal(p.token(), "refreshed");
    assert.equal(p.status().account.connected, true);
    p.disconnect();
    assert.equal(p.token(), null);
  } finally {
    s.close();
  }
});

test("發布日期使用臺北日期篩選，未知發布時間不冒充今日", () => {
  const s = make();
  try {
    const i = new Intelligence(s.store, fake);
    i.save(post(1, "2026-11-03T16:00:00Z"));
    i.save(post(2, "2026-11-03T15:59:59Z"));
    i.save({ body: "未知日期" });
    assert.equal(i.list({ date: "2026-11-04" }).items.length, 1);
    assert.equal(i.list({ date: "2026-11-03" }).items.length, 1);
    assert.equal(i.list({ date: "2026-11-04" }).items[0].body, post(1).body);
  } finally {
    s.close();
  }
});

test("素材拆解筆記保持原文、版本衝突不覆寫，且可清空", () => {
  const ctx = make();
  try {
    const intel = new Intelligence(ctx.store, fake);
    const { post: original } = intel.save(post(901));
    const research = {
      hook: "先指出困境",
      structure: "問題、方法、摘要",
      takeaway: "原創延伸",
    };
    const saved = intel.patch(original.id, {
      research,
      baseResearchVersion: 0,
    });
    assert.equal(saved.body, original.body);
    assert.equal(saved.researchVersion, 1);
    assert.deepEqual(intel.list().items[0].research, research);
    assert.throws(
      () => intel.patch(original.id, { research, baseResearchVersion: 0 }),
      /其他視窗/,
    );
    assert.throws(
      () =>
        intel.patch(original.id, {
          research: { ...research, hook: "x".repeat(2001) },
          baseResearchVersion: 1,
        }),
      /格式無效/,
    );
    assert.throws(
      () => intel.patch(original.id, { research: [], baseResearchVersion: 1 }),
      /格式無效/,
    );
    const clear = intel.patch(original.id, {
      research: { hook: "", structure: "", takeaway: "" },
      baseResearchVersion: 1,
    });
    assert.equal(clear.researchVersion, 2);
    intel.patch(original.id, { deleted: true });
    assert.throws(
      () => intel.patch(original.id, { research, baseResearchVersion: 2 }),
      /先恢復/,
    );
    intel.close();
  } finally {
    ctx.close();
  }
});
