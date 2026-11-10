import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { zipFiles, crc32 } from "../src/carousel.js";
const setup = (runner) => {
  const dir = mkdtempSync(join(tmpdir(), "studio-test-"));
  const app = createApp({ dir, runner });
  return {
    ...app,
    finish() {
      app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
};
test("作品閉環：來源、文案、衝突、還原、匯出與下一輪", async () => {
  const s = setup();
  try {
    const c = await client(s.app);
    const w = (
      await c.request("/studio/works", "POST", {
        id: "test-work",
        title: "我的觀點",
        stance: "少一個決定",
        content: { threads: "自己的文字" },
      })
    ).data;
    assert.equal(w.version, 1);
    const detail = (await c.request("/studio/works/" + w.id)).data;
    assert.equal(detail.articles.threads.body, "自己的文字");
    assert.equal(
      (
        await c.request("/studio/works", "POST", {
          id: "test-work",
          title: "覆蓋",
        })
      ).data.title,
      "我的觀點",
    );
    assert.equal(
      (
        await c.request("/studio/works/" + w.id, "PATCH", {
          baseVersion: 0,
          title: "wrong",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await c.request("/studio/works/" + w.id, "PATCH", {
          baseVersion: 1,
          sourceIds: ["missing"],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await c.request("/studio/works/" + w.id, "PATCH", {
          baseVersion: 1,
          title: "新觀點",
          decision: "繼續測試",
        })
      ).data.version,
      2,
    );
    const h = (await c.request("/studio/works/" + w.id + "/history")).data;
    const old = h.find((x) => x.version === 1);
    assert.equal(
      (
        await c.request("/studio/works/" + w.id + "/restore", "POST", {
          revisionId: old.id,
          baseVersion: 2,
        })
      ).data.title,
      "我的觀點",
    );
    const exported = (await c.request("/studio/works/" + w.id + "/export"))
      .data;
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.work.articles.threads.body, "自己的文字");
    assert.ok(exported.history.length >= 3);
    const next = (
      await c.request("/studio/works/" + w.id + "/followup", "POST", {})
    ).data;
    assert.notEqual(next.variants.threads, w.variants.threads);
    assert.equal(next.title, "我的觀點 · 下一輪");
  } finally {
    s.finish();
  }
});
test("發布快照與成效：不冒充官方成功，不允許未知歸零、錯平台與錯誤時間", async () => {
  const s = setup();
  try {
    const c = await client(s.app);
    const w = (
      await c.request("/studio/works", "POST", {
        title: "測試",
        content: { threads: "原稿" },
      })
    ).data;
    const input = {
      platform: "threads",
      revision: 1,
      publishedAt: new Date(Date.now() - 86400000).toISOString(),
      url: "https://www.threads.com/@a/post/abc",
    };
    const p = (
      await c.request("/studio/works/" + w.id + "/publications", "POST", input)
    ).data;
    assert.equal(p.verification, "user_reported");
    assert.equal(s.store.all("publication").length, 0);
    assert.equal(
      (
        await c.request("/studio/works/" + w.id + "/publications", "POST", {
          ...input,
          url: "https://evil.example/",
        })
      ).status,
      400,
    );
    await c.request("/articles/" + w.variants.threads, "PATCH", {
      baseRevision: 1,
      title: "改稿",
      body: "改了",
    });
    assert.equal(p.snapshot.body, "原稿");
    assert.equal(
      (
        await c.request(
          "/studio/works/" + w.id + "/publications",
          "POST",
          input,
        )
      ).status,
      409,
    );
    const m = (
      await c.request("/studio/works/" + w.id + "/metrics", "POST", {
        publicationId: p.id,
        observedAt: new Date().toISOString(),
        metrics: { views: 2000, shares: 20 },
      })
    ).data;
    assert.equal(m.metrics.reach, null);
    assert.equal(m.metrics.attributed_follows, null);
    assert.equal(m.metrics.views, 2000);
    assert.ok(m.windowHours >= 24);
    assert.equal(
      (
        await c.request("/studio/works/" + w.id + "/metrics", "POST", {
          publicationId: p.id,
          observedAt: new Date().toISOString(),
          metrics: { reach: -1 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await c.request("/studio/works/" + w.id + "/metrics", "POST", {
          publicationId: p.id,
          observedAt: "2020-01-01",
          metrics: {},
        })
      ).status,
      400,
    );
  } finally {
    s.finish();
  }
});
test("AI 提案：不覆蓋後續手改，拒絕建議後不可套用", async () => {
  let done;
  const s = setup(() => ({
    promise: new Promise((r) => (done = r)),
    cancel() {},
  }));
  try {
    const c = await client(s.app);
    await c.request("/settings", "PATCH", { aiConsent: true });
    const a = (await c.request("/articles", "POST", {})).data;
    await c.request("/operations", "POST", {
      id: "propose",
      articleId: a.id,
      baseRevision: 0,
      from: 0,
      to: 0,
      instruction: "起草",
    });
    await c.request("/articles/" + a.id, "PATCH", {
      baseRevision: 0,
      title: "本人",
      body: "新想法",
    });
    done({ content: "候選" });
    await new Promise((r) => setImmediate(r));
    assert.equal(s.store.article(a.id).body, "新想法");
    assert.equal(s.store.get("operation", "propose").status, "proposed");
    assert.equal(
      (await c.request("/operations/propose/apply", "POST", {})).status,
      409,
    );
    assert.equal(
      (await c.request("/operations/propose/reject", "POST", {})).status,
      200,
    );
    assert.equal(
      (await c.request("/operations/propose/apply", "POST", {})).status,
      400,
    );
  } finally {
    s.finish();
  }
});
test("新增資料可備份還原；未完成工作不冒充已發布", async () => {
  const s = setup();
  try {
    const c = await client(s.app);
    const w = (await c.request("/studio/works", "POST", { title: "備份作品" }))
      .data;
    const manifest = await s.backups.snapshot("test");
    assert.ok(s.backups.verify(manifest.id));
    s.store.put("work", { ...s.store.get("work", w.id), title: "備份後修改" });
    await s.backups.restore(manifest.id);
    assert.equal(s.store.get("work", w.id).title, "備份作品");
  } finally {
    s.finish();
  }
});
test("ZIP 使用 UTF-8、正確 CRC 與中央目錄", async () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const blob = zipFiles([
    ["文案.md", "內容"],
    ["01.png", new Uint8Array([1, 2, 3])],
  ]);
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.byteLength - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.byteLength - 14, true), 2);
});
test("輪播大綱、圖片與還原隔離：無效資料不破壞原作品", async () => {
  const s = setup();
  try {
    const c = await client(s.app);
    let w = (await c.request("/studio/works", "POST", { title: "圖文" })).data;
    const a = (
      await c.request("/studio/works/" + w.id + "/outline", "POST", {})
    ).data;
    w = (await c.request("/studio/works/" + w.id)).data;
    assert.equal(
      (
        await c.request("/studio/works/" + w.id + "/outline/apply", "POST", {
          baseVersion: w.version,
        })
      ).status,
      400,
    );
    await c.request("/articles/" + a.id, "PATCH", {
      title: "大綱",
      baseRevision: 0,
      body: JSON.stringify({
        slides: Array.from({ length: 4 }, (_, i) => ({
          title: "頁" + i,
          body: "實際內容",
        })),
      }),
    });
    const result = await c.request(
      "/studio/works/" + w.id + "/outline/apply",
      "POST",
      { baseVersion: w.version, dataEpoch: w.dataEpoch },
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.slides.length, 4);
    assert.equal(new Set(result.data.slides.map((s) => s.id)).size, 4);
    assert.equal(
      (
        await c.request("/studio/works/" + w.id, "PATCH", {
          baseVersion: result.data.version,
          dataEpoch: "before-restore",
          title: "污染",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await c.request("/studio/works/" + w.id, "PATCH", {
          baseVersion: result.data.version,
          slides: result.data.slides.map((x, i) =>
            i === 0
              ? {
                  ...x,
                  image: {
                    data: "data:image/svg+xml;base64,aaa",
                    position: 0.5,
                  },
                }
              : x,
          ),
        })
      ).status,
      400,
    );
    assert.equal(s.store.get("work", w.id).slides[0].title, "頁0");
  } finally {
    s.finish();
  }
});
