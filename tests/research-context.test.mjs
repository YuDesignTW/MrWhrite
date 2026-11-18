import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { trendQuery } from "../server/trend-search.mjs";
const tick = () => new Promise((r) => setImmediate(r));
test("the exact conversational recommendation question does not become literal search keywords", () => {
  assert.equal(
    trendQuery("那目前你建議我目前有哪些選題？"),
    "brand design creativity when:7d",
  );
});
test("search failure still invokes Codex with scoped tracked posts and video analysis, then offers sourced choices", async () => {
  const dir = mkdtempSync(join(tmpdir(), "research-context-"));
  const prompts = [];
  const app = createApp({
    dir,
    teamOptions: {
      trendSearch: async () => {
        throw Error("可用搜尋結果不足三筆，未產生選題。");
      },
    },
    runner: (prompt) => {
      prompts.push(prompt);
      const content = prompt.includes("依研究報告提出3")
        ? JSON.stringify({
            topics: [
              {
                title: "從賣工具到交付成果",
                angle: "影片畫面觀察，音訊未分析",
                sourceIds: [JSON.parse(prompt.split("\n來源：").at(-1))[0].id],
              },
            ],
          })
        : "依已收集的影片畫面提出研究觀點。";
      return { promise: Promise.resolve({ content }), cancel() {} };
    },
  });
  try {
    const c = await client(app.app);
    await c.request("/settings", "PATCH", { aiConsent: true });
    const epoch = app.store.get("settings", "main").epoch;
    const row = {
      id: "ig",
      teamId: "t",
      projectId: "p",
      dataEpoch: epoch,
      username: "example_creator",
      platform: "instagram",
      posts: [
        {
          url: "https://www.instagram.com/reel/known/",
          body: "Your app was never the product",
          collectedAt: new Date().toISOString(),
          evidence: "公開摘要",
          analysis: {
            summary: "Sell outcomes畫面",
            coverage: [{ sampledFrames: 12, audioAnalyzed: false }],
            items: [{ observation: "成果計價", limitation: "無音訊" }],
          },
        },
      ],
    };
    app.store.put("teamTracking", row);
    app.store.put("teamTracking", {
      ...row,
      id: "foreign",
      projectId: "other",
      posts: [{ url: "https://example.com/private", body: "FOREIGN_SECRET" }],
    });
    const base = "/teams/t/projects/p/runs";
    await c.request(base, "POST", {
      id: "context",
      role: "director",
      model: "Codex",
      text: "那目前你建議我目前有哪些選題？",
    });
    await tick();
    await tick();
    const run = (await c.request(base)).data[0];
    assert.equal(run.status, "awaiting_selection");
    assert.equal(prompts.length, 2);
    assert.match(prompts[0], /Your app was never the product/);
    assert.match(prompts[0], /Sell outcomes/);
    assert.match(prompts[0], /audioAnalyzed/);
    assert.ok(!prompts.join("").includes("FOREIGN_SECRET"));
    assert.equal(run.topics.length, 1);
    assert.equal(run.topics[0].sources[0].url, row.posts[0].url);
    assert.ok(run.search.warnings.length);
    assert.ok(!run.deliverable);
  } finally {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saved research rejects unread links, preserves dates and video limits, and deduplicates URLs", async () => {
  const { researchSources, combineResearch } = await import(
    "../server/research-context.mjs"
  );
  const saved = researchSources({
    accounts: [
      {
        platform: "x",
        username: "a",
        posts: [
          { url: "https://x.com/a/status/1", body: "", error: "403" },
          {
            url: "https://x.com/a/status/2",
            body: "observed",
            collectedAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ],
    bound: [{ url: "javascript:alert(1)", name: "bad", content: "bad" }],
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].collectedAt, "2026-01-01T00:00:00Z");
  assert.match(saved[0].limitations, /非本次重新讀取/);
  assert.equal(
    combineResearch(saved, [{ url: saved[0].url, title: "duplicate" }]).length,
    1,
  );
});
test("one available news item is enough to analyze, cancellation never falls back into model execution", async () => {
  const { recommendContent } = await import("../server/content-workflow.mjs");
  const source = {
    id: "n",
    url: "https://example.com/one",
    title: "One",
    summary: "Evidence",
  };
  const run = { text: "選題", steps: [], context: {}, researchSources: [] };
  let calls = 0;
  await recommendContent({
    run,
    search: async () => ({ sources: [source] }),
    persist() {},
    invoke: async (role) => {
      calls++;
      return role === "research"
        ? "Report"
        : JSON.stringify({
            topics: [
              { title: "A", angle: "One supported angle", sourceIds: ["n"] },
            ],
          });
    },
  });
  assert.equal(calls, 2);
  assert.equal(run.status, "awaiting_selection");
  assert.equal(run.topics.length, 1);
  const controller = new AbortController();
  calls = 0;
  await assert.rejects(
    recommendContent({
      run: { ...run, steps: [] },
      signal: controller.signal,
      persist() {},
      search: async () => {
        controller.abort();
        throw Error("aborted");
      },
      invoke: async () => {
        calls++;
      },
    }),
  );
  assert.equal(calls, 0);
});
