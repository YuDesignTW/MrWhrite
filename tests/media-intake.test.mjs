import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Intelligence } from "../server/intelligence.mjs";
import { MediaIntake, validateAnalysis } from "../server/media-intake.mjs";
const url = "https://www.instagram.com/p/DZp8LxoiTg3/";
const analysis = {
  summary: "可見的包裝設計。",
  items: [
    {
      order: 1,
      observation: "圖中有紅白包裝。",
      limitation: "無法從畫面得知成效。",
    },
  ],
  angle: "觀點：先保留識別線索。",
};
async function fixture(t, runner) {
  const dir = await mkdtemp(join(tmpdir(), "mw-media-"));
  const store = new Store(dir);
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  store.put("settings", { ...store.get("settings", "main"), aiConsent: true });
  const intelligence = new Intelligence(store, {});
  let calls = 0;
  const service = new MediaIntake(store, intelligence, {
    runner,
    download: async () => {
      calls++;
      const job = "d".repeat(32),
        p = join(dir, "instagram-media/cache", job);
      await mkdir(p, { recursive: true });
      await writeFile(join(p, "01.jpg"), Buffer.from([255, 216, 255]));
      return {
        job,
        shortcode: "DZp8LxoiTg3",
        status: "awaiting_analysis",
        caption: "原文",
        media: [{ order: 1, name: "01.jpg", type: "image/jpeg", bytes: 3 }],
      };
    },
  });
  return { service, store, calls: () => calls };
}
test("素材分析逐項完整且拒絕虛假缺項", () => {
  assert.deepEqual(validateAnalysis(JSON.stringify(analysis), 1), analysis);
  assert.throws(() => validateAnalysis(JSON.stringify(analysis), 2));
  assert.throws(() => validateAnalysis('{"items":[]}', 1));
});
test("下載去重、預設成功分析後清理並保留文案與觀察", async (t) => {
  let seen;
  const { service, calls } = await fixture(t, (_prompt, _dir, options) => {
    seen = options.images;
    return { promise: Promise.resolve({ content: JSON.stringify(analysis) }) };
  });
  const { post } = await service.import(url);
  await service.import(url);
  assert.equal(calls(), 1);
  const file = await service.asset(post.id, 1);
  const fresh = await service.analyze(post.id);
  assert.equal(seen.length, 1);
  assert.equal(fresh.body, "原文");
  assert.equal(fresh.localMedia.status, "deleted");
  assert.deepEqual(fresh.mediaAnalysis.items, analysis.items);
  await assert.rejects(access(file.path));
  await assert.rejects(service.asset(post.id, 1));
});
test("分析失敗保留原始素材；選擇保留可成功後留下檔案", async (t) => {
  const { service } = await fixture(t, () => ({
    promise: Promise.reject(Error("model failed")),
  }));
  const { post } = await service.import(url, true);
  await assert.rejects(service.analyze(post.id));
  await access((await service.asset(post.id, 1)).path);
  service.runner = () => ({
    promise: Promise.resolve({ content: JSON.stringify(analysis) }),
  });
  const fresh = await service.analyze(post.id);
  assert.equal(fresh.localMedia.status, "available");
  await access((await service.asset(post.id, 1)).path);
});
test("未同意 AI 時不傳送圖片，過期素材不可讀取", async (t) => {
  let called = false;
  const { service, store } = await fixture(t, () => {
    called = true;
    throw Error("unexpected");
  });
  const { post } = await service.import(url);
  store.put("settings", { ...store.get("settings", "main"), aiConsent: false });
  await assert.rejects(service.analyze(post.id), (e) => e.status === 403);
  assert.equal(called, false);
  store.put("socialPost", {
    ...post,
    localMedia: { ...post.localMedia, expiresAt: "2000-01-01" },
  });
  await assert.rejects(service.asset(post.id, 1), (e) => e.status === 410);
  await service.cleanup();
  assert.equal(store.get("socialPost", post.id).localMedia.status, "deleted");
});
