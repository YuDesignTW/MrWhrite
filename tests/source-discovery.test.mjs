import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import {
  ResearchActions,
  researchIntent,
} from "../server/research-actions.mjs";
import { ResearchArticles } from "../server/research-articles.mjs";
import {
  SourceDiscovery,
  linkedInUrl,
  makeDiscoverySearch,
} from "../server/source-discovery.mjs";
import { blockedCodexTool } from "../server/codex.mjs";
function setup(t, { search, read } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "discovery-")),
    store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  store.put("teamWorkspace", {
    id: "main",
    dataEpoch: store.get("settings", "main").epoch,
    state: {
      teams: [
        {
          id: "t",
          projects: [{ id: "p" }, { id: "other" }],
          researchSettings: {
            topic: "核醫",
            sourceUrls: ["https://existing.org/"],
          },
        },
      ],
    },
  });
  const articles = new ResearchArticles(store, { read }),
    watches = new ResearchActions(store, articles),
    service = new SourceDiscovery(store, articles, watches, { search });
  return {
    store,
    articles,
    watches,
    service,
    s: { teamId: "t", projectId: "p" },
  };
}
const row = (url = "https://industry.org/news/") => ({
  url,
  title: "產業新聞",
  summary: "搜尋摘要",
  reason: "核醫新聞與研究來源",
  evidence: [{ url: "https://industry.org/article", title: "文章" }],
});
test("discovery intent stays separate from routine collection and rejects negative requests", () => {
  assert.equal(researchIntent("幫我找新的研究來源").type, "discover");
  assert.equal(researchIntent("有沒有推薦的新聞平台？").kind, "web");
  assert.equal(
    researchIntent("幫我找 LinkedIn 核醫產業重要人物").kind,
    "linkedin",
  );
  assert.equal(researchIntent("不要找 LinkedIn 人物"), null);
  assert.equal(researchIntent("搜尋目前關鍵字的產業新聞").type, "search");
  assert.equal(
    linkedInUrl("https://tw.linkedin.com/in/person?trk=abc"),
    "https://www.linkedin.com/in/person/",
  );
  assert.equal(linkedInUrl("https://fake-linkedin.com/in/person"), null);
});
test("web candidates require selection, exclude existing and unsafe URLs, preserve project isolation", async (t) => {
  const f = setup(t, {
    search: async () => ({
      candidates: [
        row(),
        row(),
        row("https://existing.org/"),
        row("https://127.0.0.1/"),
      ],
      events: [{ type: "web_search" }],
    }),
    read: async (url) => ({
      url,
      title: "媒體",
      summary: "真實公開文字",
      limitations: "未讀圖片",
    }),
  });
  const batch = await f.service.discover(f.s, { kind: "web" });
  assert.equal(batch.candidates.length, 1);
  assert.equal(f.watches.config(f.s).sourceUrls.length, 1);
  assert.equal(f.articles.list(f.s).length, 0);
  assert.throws(() =>
    f.service.select(
      { ...f.s, projectId: "other" },
      batch.id,
      batch.candidates[0].id,
    ),
  );
  f.service.select(f.s, batch.id, batch.candidates[0].id);
  assert.equal(f.watches.config(f.s).sourceUrls.length, 2);
  assert.equal(f.watches.config(f.s).enabled, false);
  await f.service.read(f.s, batch.id, batch.candidates[0].id);
  assert.equal(f.articles.list(f.s).length, 1);
  assert.equal(
    (await f.service.discover(f.s, { kind: "web" })).candidates.length,
    0,
  );
});
test("LinkedIn observation and post discovery never imply content access or enable subscriptions", async (t) => {
  const f = setup(t, {
    search: async (args) => ({
      candidates: args.profile
        ? [row("https://www.linkedin.com/posts/person-123")]
        : [row("https://www.linkedin.com/in/person/")],
      events: [],
    }),
    read: async () => {
      throw Error("HTTP 999");
    },
  });
  const b = await f.service.discover(f.s, { kind: "linkedin" }),
    c = b.candidates[0];
  assert.equal(c.readStatus, "unread");
  f.service.select(f.s, b.id, c.id);
  assert.equal(f.watches.config(f.s).sourceUrls.length, 1);
  const posts = await f.service.posts(f.s, b.id, c.id);
  assert.equal(posts.candidates[0].posts.length, 1);
  const blocked = await f.service.read(
    f.s,
    b.id,
    c.id,
    posts.candidates[0].posts[0].id,
  );
  assert.equal(blocked.candidates[0].posts[0].readStatus, "blocked");
  assert.equal(f.articles.list(f.s).length, 0);
});
test("no search receipt means no fabricated discovery; aborts prevent save", async (t) => {
  const search = makeDiscoverySearch("/tmp", {
    runner: () => ({
      promise: Promise.resolve({ content: '{"candidates":[]}' }),
      cancel() {},
    }),
  });
  await assert.rejects(
    search({ kind: "web", keywords: [], existing: [] }),
    /搜尋紀錄/,
  );
  let release;
  const f = setup(t, { search: () => new Promise((r) => (release = r)) }),
    controller = new AbortController();
  const pending = f.service.discover(
    f.s,
    { kind: "linkedin" },
    { signal: controller.signal },
  );
  controller.abort();
  release({
    candidates: [row("https://www.linkedin.com/in/person/")],
    events: [],
  });
  await assert.rejects(pending);
  assert.equal(f.service.list(f.s).length, 0);
});
test("search-only allowance does not enable command execution or other tools", () => {
  assert.equal(blockedCodexTool("web_search"), true);
  assert.equal(blockedCodexTool("web_search", { webSearch: true }), false);
  for (const type of ["command_execution", "mcp_tool_call", "file_change"])
    assert.equal(blockedCodexTool(type, { webSearch: true }), true);
});
test('publisher discovery groups actual source URLs and retains article evidence',async()=>{
 const {makePublisherDiscovery}=await import('../server/source-discovery.mjs');
 const {parseTrendFeed}=await import('../server/trend-search.mjs');
 const sources=parseTrendFeed('<rss><item><title>核醫新聞</title><link>https://news.google.com/a</link><description>摘要</description><source url="https://publisher.org">媒體</source></item></rss>');
 assert.equal(sources[0].publisherUrl,'https://publisher.org');
 const result=await makePublisherDiscovery({search:async()=>({sources:[...sources,...sources],url:'https://news.google.com/rss',query:'核醫'})})({keywords:['核醫']});
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].evidence[0].url,'https://news.google.com/a');assert.match(result.coverage,/新聞搜尋/);
});
