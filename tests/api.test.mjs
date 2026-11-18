import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { request, client } from "./http-helper.mjs";
const setup = (runner) =>
  createApp({ dir: mkdtempSync(join(tmpdir(), "mr-white-api-")), runner });
const tick = () => new Promise((r) => setImmediate(r));
test("HTTP 安全：拒絕不允許 Host、Origin、缺少 session 與 CSRF", async () => {
  const s = setup();
  try {
    const health = await request(s.app, "/api/health");
    assert.equal(health.status, 200);
    assert.deepEqual(Object.keys(health.data).sort(), [
      "app",
      "instance",
      "status",
    ]);
    assert.equal(health.data.app, "mr-white");
    assert.equal(
      (
        await request(s.app, "/api/health", {
          headers: { Host: "evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(s.app, "/api/health", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal((await request(s.app, "/api/articles")).status, 401);
    assert.equal(
      (
        await request(s.app, "/api/session", {
          headers: { Host: "evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(s.app, "/api/session", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const c = await client(s.app);
    assert.equal(
      (await c.request("/articles", "POST", {}, { "X-CSRF-Token": "wrong" }))
        .status,
      403,
    );
    assert.equal((await c.request("/articles", "POST", {})).status, 200);
  } finally {
    s.close();
  }
});
test("端到端文章 CRUD、軟刪除、撤銷、revision conflict", async () => {
  const s = setup();
  try {
    const c = await client(s.app),
      a = (await c.request("/articles", "POST", {})).data;
    assert.equal(
      (
        await c.request("/articles/" + a.id, "PATCH", {
          baseRevision: 0,
          title: "測試",
          body: "繁體🌿",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await c.request("/articles/" + a.id, "PATCH", {
          baseRevision: 0,
          title: "覆蓋",
          body: "wrong",
        })
      ).status,
      409,
    );
    assert.equal(
      (await c.request("/articles/" + a.id, "DELETE", {})).status,
      200,
    );
    assert.equal((await c.request("/articles")).data.length, 0);
    assert.equal((await c.request("/articles?trash=1")).data.length, 1);
    assert.equal(
      (await c.request("/articles/" + a.id + "/restore", "POST", {})).data.body,
      "繁體🌿",
    );
  } finally {
    s.close();
  }
});
test("AI 真正提交路徑：指定範圍、冪等、防止跨文、可還原", async () => {
  let done;
  const s = setup(() => ({
    promise: new Promise((r) => (done = r)),
    cancel() {},
  }));
  try {
    const c = await client(s.app);
    await c.request("/settings", "PATCH", { aiConsent: true });
    const a = (await c.request("/articles", "POST", {})).data,
      b = (await c.request("/articles", "POST", {})).data;
    await c.request("/articles/" + a.id, "PATCH", {
      baseRevision: 0,
      title: "A",
      body: "前文🌿中文後文",
    });
    const payload = {
      id: "test-op",
      articleId: a.id,
      baseRevision: 1,
      from: 2,
      to: 6,
      instruction: "縮短",
      mode: "replace_selection",
    };
    assert.equal((await c.request("/operations", "POST", payload)).status, 200);
    assert.equal(
      (await c.request("/operations", "POST", payload)).data.id,
      "test-op",
    );
    assert.equal(
      (
        await c.request("/articles/" + a.id, "PATCH", {
          baseRevision: 1,
          title: "A",
          body: "前文🌿中文後文",
        })
      ).status,
      200,
    );
    done({ content: "新內容", reason: "" });
    await tick();
    assert.equal(s.store.article(a.id).body, "前文🌿中文後文");
    assert.equal(s.store.get("operation", "test-op").status, "proposed");
    assert.equal(
      (await c.request("/operations/test-op/apply", "POST", {})).status,
      200,
    );
    assert.equal(s.store.article(a.id).body, "前文新內容後文");
    assert.equal(s.store.article(b.id).body, "");
    assert.equal(s.store.get("operation", "test-op").status, "completed");
    const revisions = (await c.request("/articles/" + a.id + "/revisions"))
      .data;
    const original = revisions.find((r) => r.revision === 1);
    assert.equal(
      (
        await c.request(
          `/articles/${a.id}/revisions/${original.id}/restore`,
          "POST",
          { baseRevision: 2 },
        )
      ).data.body,
      "前文🌿中文後文",
    );
  } finally {
    s.close();
  }
});
test("AI 取消終止 adapter；部分結果須明確保留，錯誤不覆蓋", async () => {
  let fail,
    called = false,
    output;
  const s = setup((_, __, cb) => {
    output = cb.onOutput;
    return {
      promise: new Promise((_, r) => (fail = r)),
      cancel() {
        called = true;
        fail(Object.assign(Error("已取消"), { cancelled: true }));
      },
    };
  });
  try {
    const c = await client(s.app);
    await c.request("/settings", "PATCH", { aiConsent: true });
    const a = (await c.request("/articles", "POST", {})).data;
    await c.request("/operations", "POST", {
      id: "cancel-op",
      articleId: a.id,
      baseRevision: 0,
      from: 0,
      to: 0,
      instruction: "寫一段",
    });
    output("部分結果");
    await c.request("/operations/cancel-op/cancel", "POST", {});
    await tick();
    assert.ok(called);
    assert.equal(s.store.article(a.id).body, "");
    assert.equal(s.store.get("operation", "cancel-op").buffer, "部分結果");
    assert.equal(
      (await c.request("/operations/cancel-op/apply", "POST", {})).data.body,
      "部分結果",
    );
    assert.equal(
      (await c.request("/operations/cancel-op/apply", "POST", {})).status,
      400,
    );
  } finally {
    s.close();
  }
});
test("語氣匯入去重與空文排除，刪除例文會停用受影響版本", async () => {
  const s = setup();
  try {
    const c = await client(s.app);
    const imported = (
      await c.request("/voice/import", "POST", {
        samples: [
          { body: "原創例文", title: "A" },
          { body: "原創例文", title: "B" },
          { body: " ", title: "空" },
        ],
      })
    ).data;
    assert.equal(imported.imported.length, 1);
    assert.equal(imported.skipped.length, 2);
    assert.equal(
      (await c.request("/voice/versions", "POST", { rules: "短句。" })).status,
      200,
    );
    const first = s.store.voice().config.active;
    await c.request("/voice/versions", "POST", { rules: "新規則。" });
    assert.equal(s.store.voice().versions.length, 2);
    await c.request("/voice/samples/" + imported.imported[0].id, "DELETE", {});
    assert.equal(s.store.voice().config.enabled, false);
    assert.equal(
      (
        await c.request("/voice/config", "PATCH", {
          active: first,
          enabled: true,
        })
      ).status,
      400,
    );
  } finally {
    s.close();
  }
});
test("還原需確認，舊瀏覽器 epoch 不可回寫還原資料", async () => {
  const s = setup();
  try {
    const c = await client(s.app);
    const b = (await c.request("/backups", "POST", {})).data;
    assert.equal(
      (await c.request("/backups/" + b.id + "/restore", "POST", {})).status,
      400,
    );
    assert.equal(
      (
        await c.request("/backups/" + b.id + "/restore", "POST", {
          confirm: b.id,
        })
      ).status,
      200,
    );
    assert.equal((await c.request("/articles", "POST", {})).status, 409);
  } finally {
    s.close();
  }
});
