import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import {
  accountUrl,
  trackingIntent,
  trendIntent,
  TeamTracking,
  postLinks,
  publicPage,
} from "../server/team-tracking.mjs";
import { trendQuery } from "../server/trend-search.mjs";
const tick = () => new Promise((r) => setImmediate(r));
const urls =
  "https://x.com/ExampleUser\nhttps://www.threads.com/@example.studio\nhttps://www.instagram.com/example_creator/";
test("natural language routes explicit trends and tracking without treating negation as authorization", () => {
  assert.ok(trendIntent("整理一下目前最新的趨勢有哪些"));
  assert.ok(trendIntent("最近AI品牌的趨勢有哪些"));
  assert.equal(trendIntent("什麼是趨勢？"), false);
  assert.equal(trackingIntent("不要追蹤 " + urls), null);
  assert.equal(
    trackingIntent("我想要追蹤一下這幾個帳號最新發文內容\n" + urls).length,
    3,
  );
  assert.equal(
    trackingIntent("追蹤 " + urls + "\nhttps://twitter.com/exampleuser").length,
    3,
  );
  assert.match(trendQuery("整理一下目前最新的趨勢有哪些"), /when:7d$/);
  assert.match(trendQuery("整理AI品牌設計最新趨勢"), /AI品牌設計/);
  for (const u of [
    "https://localhost/a",
    "https://x.com@localhost/a",
    "https://x.com:444/a",
    "https://x.com/a/status/1",
    "https://instagram.com/accounts/",
  ])
    assert.throws(() => accountUrl(u));
});
test("profile links exclude other X authors and never treat profile text as posts", () => {
  const a = accountUrl("https://x.com/ExampleUser");
  assert.deepEqual(
    postLinks(
      '<a href="/ExampleUser/status/123">one</a><a href="/other/status/234">two</a>',
      a,
    ),
    ["https://x.com/exampleuser/status/123"],
  );
  assert.deepEqual(postLinks("Please log in to continue", a), []);
});
test("public requests refuse oversized documents and redirects", async () => {
  let options;
  await assert.rejects(
    publicPage("https://x.com/exampleuser", undefined, async (u, o) => {
      options = o;
      return new Response(new Uint8Array(3000001));
    }),
    /3 MB/,
  );
  assert.equal(options.redirect, "error");
});
test("conversation stores three scoped accounts without invoking a model; retries deduplicate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracking-"));
  let calls = 0;
  const app = createApp({
    dir,
    runner: () => {
      calls++;
      throw Error("should not invoke");
    },
    teamOptions: {
      trackingCollector: async () => ({ posts: [], partial: true }),
    },
  });
  try {
    const c = await client(app.app);
    await c.request("/settings", "PATCH", { aiConsent: true });
    const base = "/teams/t/projects/p";
    const body = {
      id: "track",
      role: "research",
      model: "Codex",
      text: "追蹤這三個帳號\n" + urls,
    };
    assert.equal((await c.request(base + "/runs", "POST", body)).status, 202);
    await tick();
    const run = (await c.request(base + "/runs")).data[0];
    assert.equal(run.status, "completed");
    assert.equal(calls, 0);
    let rows = (await c.request(base + "/tracking")).data;
    assert.equal(rows.length, 3);
    assert.equal(rows[0].text, undefined);
    assert.equal(
      (await c.request("/teams/t/projects/other/tracking")).data.length,
      0,
    );
    assert.equal(
      (
        await c.request(
          "/teams/t/projects/other/tracking/" + rows[0].id + "/collect",
          "POST",
          {},
        )
      ).status,
      404,
    );
    await c.request(base + "/runs", "POST", { ...body, id: "track-again" });
    await tick();
    assert.equal((await c.request(base + "/tracking")).data.length, 3);
    assert.equal(
      (
        await c.request(base + "/tracking/" + rows[0].id, "PATCH", {
          enabled: false,
        })
      ).data.enabled,
      false,
    );
    assert.equal(
      (
        await c.request(
          base + "/tracking/" + rows[0].id + "/collect",
          "POST",
          {},
        )
      ).status,
      409,
    );
  } finally {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("scheduled collection deduplicates posts, preserves failures, and does not claim fresh results after blocking", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracking-"));
  const app = createApp({ dir });
  let blocked = false;
  const tracker = new TeamTracking(app.store, {
    collector: async () => {
      if (blocked) throw Error("HTTP 403");
      return {
        posts: [{ url: "https://x.com/exampleuser/status/1", body: "observed" }],
        partial: true,
      };
    },
  });
  try {
    const scope = { teamId: "t", projectId: "p" };
    const [row] = tracker.add(scope, [accountUrl("https://x.com/ExampleUser")]);
    await tracker.tick();
    let a = tracker.get(scope, row.id);
    assert.equal(a.status, "partial");
    assert.equal(a.posts.length, 1);
    await tracker.collect(scope, row.id);
    assert.equal(tracker.get(scope, row.id).added, 0);
    blocked = true;
    await tracker.collect(scope, row.id);
    a = tracker.get(scope, row.id);
    assert.equal(a.status, "blocked");
    assert.equal(a.posts.length, 1);
    assert.match(a.lastError, /403/);
    assert.ok(Date.parse(a.nextCheckAt) > Date.now());
  } finally {
    tracker.close();
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("director latest-trends request searches once then stops at topic selection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracking-"));
  let searches = 0,
    calls = 0;
  const sources = [
    { id: "a", url: "https://example.com/a", title: "A" },
    { id: "b", url: "https://example.com/b", title: "B" },
  ];
  const app = createApp({
    dir,
    teamOptions: {
      trendSearch: async ({ request }) => {
        searches++;
        assert.match(request, /最新/);
        return { sources, limitations: "摘要" };
      },
    },
    runner: () => ({
      promise: Promise.resolve({
        content:
          ++calls === 1
            ? "研究報告"
            : JSON.stringify({
                topics: [
                  { title: "主題A", angle: "切角A", sourceIds: ["a"] },
                  { title: "主題B", angle: "切角B", sourceIds: ["b"] },
                ],
              }),
      }),
      cancel() {},
    }),
  });
  try {
    const c = await client(app.app);
    await c.request("/settings", "PATCH", { aiConsent: true });
    const b = "/teams/t/projects/p/runs";
    await c.request(b, "POST", {
      id: "latest",
      role: "director",
      model: "Codex",
      text: "整理一下目前最新的趨勢有哪些",
    });
    await tick();
    await tick();
    const r = (await c.request(b)).data[0];
    assert.equal(r.status, "awaiting_selection");
    assert.equal(r.topics.length, 2);
    assert.equal(searches, 1);
    assert.equal(calls, 2);
  } finally {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('restart recovers interrupted checks; pausing survives in-flight completion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tracking-'));const app=createApp({dir});let resolve;
 const tracker=new TeamTracking(app.store,{collector:()=>new Promise(r=>resolve=r)});const scope={teamId:'t',projectId:'p'};
 try{const [a]=tracker.add(scope,[accountUrl('https://x.com/ExampleUser')]);const collecting=tracker.collect(scope,a.id);tracker.update(scope,a.id,false);resolve({posts:[],partial:true});await collecting;assert.equal(tracker.get(scope,a.id).enabled,false);assert.equal(tracker.get(scope,a.id).nextCheckAt,null);
 app.store.put('teamTracking',{...tracker.get(scope,a.id),enabled:true,status:'collecting'});const recovered=new TeamTracking(app.store);assert.equal(recovered.get(scope,a.id).status,'pending');recovered.close();
 }finally{tracker.close();app.close();rmSync(dir,{recursive:true,force:true});}
});
test('manual video intake is scoped, validates single-post URL, and retains an honest unparsed state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tracking-'));const app=createApp({dir});
 try{const c=await client(app.app),base='/teams/t/projects/p';const a=(await c.request(base+'/tracking','POST',{url:'https://instagram.com/example_creator/'})).data[0];
 assert.equal((await c.request(base+'/tracking/'+a.id+'/posts','POST',{url:'https://localhost/private'})).status,400);
 const result=await c.request(base+'/tracking/'+a.id+'/posts','POST',{url:'https://www.instagram.com/reel/ExampleReel1/'});assert.equal(result.status,200);assert.equal(result.data.posts[0].mediaStatus,'not_analyzed');
 assert.equal((await c.request('/teams/t/projects/other/tracking/'+a.id+'/analyze','POST',{url:result.data.posts[0].url})).status,404);
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});

test('failed media download persists failure on the scoped post instead of claiming analysis', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tracking-'));const app=createApp({dir,socialOptions:{mediaDownload:async()=>{throw Error('unavailable');}}});
 try{const c=await client(app.app),base='/teams/t/projects/p';await c.request('/settings','PATCH',{aiConsent:true});const a=(await c.request(base+'/tracking','POST',{url:'https://instagram.com/example_creator/'})).data[0];const post=(await c.request(base+'/tracking/'+a.id+'/posts','POST',{url:'https://www.instagram.com/reel/ExampleReel1/'})).data.posts[0];
 const response=await c.request(base+'/tracking/'+a.id+'/analyze','POST',{url:post.url});assert.equal(response.status,502);const saved=(await c.request(base+'/tracking')).data[0].posts[0];assert.equal(saved.mediaStatus,'failed');assert.ok(saved.analysisError);assert.equal(saved.analysis,undefined);
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('director accepts ordinary messages with tracking words and reference URLs without requiring social accounts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'director-reference-'));let calls=0;
 const app=createApp({dir,runner:()=>{calls++;return {promise:Promise.resolve({content:JSON.stringify({reply:'可以直接以提供的資料工作，不需要社群帳號。',tasks:[]})}),cancel(){}}}});
 try{const c=await client(app.app);await c.request('/settings','PATCH',{aiConsent:true});
 for(const [i,text] of ['請協助追蹤專案進度，網站參考 https://example.com/brief','請分析這篇貼文的追蹤成長策略 https://www.instagram.com/p/example/','我沒有社群帳號，先幫我整理工作方向'].entries()){
 const response=await c.request('/teams/t/projects/p/runs','POST',{id:'reference-'+i,role:'director',model:'Codex',text});assert.equal(response.status,202,JSON.stringify(response.data));await tick();await tick();
 const run=(await c.request('/teams/t/projects/p/runs')).data.find(r=>r.id==='reference-'+i);assert.equal(run.status,'completed');assert.notEqual(run.workflow,'track-accounts');}
 assert.equal(calls,3);assert.equal(app.store.all('teamTracking').length,0);
 assert.equal((await c.request('/teams/t/projects/p/tracking','POST',{url:'https://example.com/brief'})).status,400);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
