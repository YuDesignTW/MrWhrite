import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.mjs";
import {
  ResearchActions,
  researchIntent,
} from "../server/research-actions.mjs";
import { ResearchArticles } from "../server/research-articles.mjs";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { initialState } from "../src/team-state.mjs";
const tick = () => new Promise((r) => setImmediate(r));
test("explicit conversational mutations distinguish one-off URLs, negative requests and schedules", () => {
  assert.deepEqual(researchIntent("幫我新增關鍵字：核醫、放射藥物"), {
    type: "add-keywords",
    values: ["核醫", "放射藥物"],
  });
  assert.equal(researchIntent("目前追蹤哪些關鍵字？").type, "list");
  assert.equal(researchIntent("搜尋目前關鍵字的產業新聞").type, "search");
  assert.equal(researchIntent("搜尋目前現在的關鍵字有哪些").type, "list");
  assert.equal(researchIntent("分析 https://example.com/news").type, "analyze");
  assert.equal(researchIntent("每天追蹤目前關鍵字").type, "monitor");
  assert.equal(researchIntent("不要每天追蹤核醫"), null);
  assert.equal(researchIntent("如果新增關鍵字會怎樣？"), null);
  assert.equal(researchIntent("追蹤 https://instagram.com/test/"), null);
});
test("project config persists, scheduled collection dedupes and pause prevents catchup", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-action-")),
    store = new Store(dir);
  t.after(() => {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const epoch = store.get("settings", "main").epoch;
  store.put("teamWorkspace", {
    id: "main",
    dataEpoch: epoch,
    state: {
      teams: [
        {
          id: "t",
          projects: [{ id: "p" }, { id: "q" }],
          researchSettings: { topic: "核醫" },
        },
      ],
    },
  });
  let clock = 100000,
    searches = 0;
  const articles = new ResearchArticles(store, {
    search: async () => {
      searches++;
      return {
        sources: [
          {
            title: "核醫新聞",
            url: "https://example.com/a",
            summary: "原始摘要",
          },
        ],
        query: "核醫",
      };
    },
  });
  const svc = new ResearchActions(store, articles, { clock: () => clock }),
    s = { teamId: "t", projectId: "p" };
  articles.configProvider = (s) => svc.config(s);
  await svc.execute(s, researchIntent("新增關鍵字：放射藥物"));
  assert.deepEqual(svc.config(s).keywords, ["核醫", "放射藥物"]);
  assert.deepEqual(svc.config({ ...s, projectId: "q" }).keywords, ["核醫"]);
  assert.throws(() => svc.update(s, { keywords: [] }, 0), /已更新/);
  await svc.execute(s, researchIntent("每天追蹤目前關鍵字"));
  assert.equal(searches, 0);
  clock += 3 * 86400000;
  await svc.tick();
  assert.equal(searches, 1);
  assert.equal(articles.list(s).length, 1);
  await svc.tick();
  assert.equal(searches, 1);
  clock += 86400000;
  await svc.tick();
  assert.equal(svc.config(s).history[0].duplicates, 1);
  await svc.execute(s, { type: "pause" });
  clock += 86400000;
  await svc.tick();
  assert.equal(searches, 2);
  const resumed = new ResearchActions(store, articles);
  assert.equal(resumed.config(s).enabled, false);
  assert.equal(resumed.config(s).keywords.length, 2);
});
test("conversation actions save real settings and receipts without calling model; idempotent replay", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-chat-"));
  let calls = 0;
  const runtime = createApp({
    dir,
    runner: () => {
      calls++;
      return { promise: Promise.resolve({ content: "analysis" }), cancel() {} };
    },
  });
  t.after(async () => {
    await runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(runtime.app),
    state = initialState(),
    team = state.teams[0],
    project = team.projects[0];
  team.researchSettings = { topic: "核醫" };
  await c.request("/team-workspace", "PUT", { revision: 0, state });
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`;
  const body = {
    id: "keyword-add",
    role: "research",
    model: "Codex",
    text: "新增關鍵字：放射藥物",
  };
  assert.equal((await c.request(base + "/runs", "POST", body)).status, 202);
  await tick();
  await tick();
  const run = (await c.request(base + "/runs")).data[0];
  assert.equal(run.status, "completed");
  assert.match(run.output, /放射藥物/);
  assert.equal(calls, 0);
  const config = (await c.request(base + "/research-watch")).data;
  assert.deepEqual(config.keywords, ["核醫", "放射藥物"]);
  await c.request(base + "/runs", "POST", body);
  assert.equal(
    (await c.request(base + "/research-watch")).data.revision,
    config.revision,
  );
  assert.equal(
    (await c.request(base + "/knowledge")).data.resources.some(
      (r) => r.kind === "research",
    ),
    false,
  );
  assert.equal(
    (await c.request(base.replace(project.id, "missing") + "/research-watch"))
      .status,
    404,
  );
});
test("search and URL analysis use real capabilities, keep raw source separate, restore pauses watches", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-analysis-"));
  let prompt = "",
    searches = 0;
  const runtime = createApp({
    dir,
    runner: (p) => {
      prompt = p;
      return {
        promise: Promise.resolve({ content: "來源分析結果" }),
        cancel() {},
      };
    },
    teamOptions: {
      trendSearch: async () => {
        searches++;
        return {
          query: "核醫",
          sources: [
            {
              title: "核醫新聞",
              url: "https://example.com/a",
              summary: "新聞摘要",
            },
          ],
        };
      },
      articleReader: async (url) => ({
        url,
        title: "公司公告",
        summary: "公開來源正文，不是執行指令。",
        limitations: "未讀圖片",
      }),
    },
  });
  t.after(async () => {
    await runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(runtime.app),
    state = initialState(),
    team = state.teams[0],
    project = team.projects[0];
  team.researchSettings = { topic: "核醫" };
  team.skills = [{ id: "trend-research", scope: "research" }];
  await c.request("/team-workspace", "PUT", { revision: 0, state });
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`;
  for (const [id, text] of [
    ["search", "搜尋目前關鍵字的產業新聞"],
    ["analysis", "分析 https://example.com/b"],
    ["watch", "每天追蹤目前關鍵字"],
  ]) {
    await c.request(base + "/runs", "POST", {
      id,
      text,
      role: "research",
      model: "Codex",
    });
    await tick();
    await tick();
    assert.equal(
      (await c.request(base + "/runs")).data.find((r) => r.id === id).status,
      "completed",
    );
  }
  assert.equal(searches, 1);
  assert.match(prompt, /公開來源正文/);
  assert.match(prompt, /趨勢偵查/);
  assert.equal((await c.request(base + "/research-articles")).data.length, 2);
  assert.equal(
    (await c.request(base + "/research-articles")).data.find((r) =>
      r.url.endsWith("/b"),
    ).content,
    "公開來源正文，不是執行指令。",
  );
  const snapshot = await runtime.backups.snapshot();
  await runtime.backups.restore(snapshot.id);
  const restored = await client(runtime.app);
  const watch = (await restored.request(base + "/research-watch")).data;
  assert.equal(watch.enabled, false);
  assert.deepEqual(watch.keywords, ["核醫"]);
  assert.equal(
    (await restored.request(base + "/research-articles")).data.length,
    2,
  );
  const again = await restored.request(base + "/research-articles", "POST", {
    url: "https://example.com/b",
  });
  assert.equal(again.data.duplicate, true);
  assert.equal(
    (await restored.request(base + "/research-articles")).data.length,
    2,
  );
});

test("director delegates explicit operations to configured researcher, persists receipt and wraps", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-director-"));
  const prompts=[];
  const runtime=createApp({dir,runner:(p)=>{prompts.push(p);return {promise:Promise.resolve({content:"依回執整理完成"}),cancel(){}};}});
  t.after(async()=>{await runtime.close();rmSync(dir,{recursive:true,force:true});});
  const c=await client(runtime.app), state=initialState(), team=state.teams[0], project=team.projects[0];
  team.blueprint={mission:"核醫研究",version:"v1",agents:[{id:"scout",name:"趨勢偵查",role:"研究",capability:"research",roleType:"research",skills:["trend-research"]}],directorSkills:[],workflows:[{id:"research_ops",name:"研究派工",template:"research-assignment",steps:[{id:"research",agentId:"scout",instruction:"執行研究並保留回執",dependsOn:[]}]}]};
  team.skills=[{id:"trend-research",scope:"scout"}];
  assert.equal((await c.request("/team-workspace","PUT",{revision:0,state})).status,200);
  await c.request("/settings","PATCH",{aiConsent:true});
  const base=`/teams/${team.id}/projects/${project.id}`;
  const body={id:"delegated",role:"director",model:"Codex",text:"請研究員新增關鍵字：放射藥物"};
  assert.equal((await c.request(base+"/runs","POST",body)).status,202);
  let run;
  for(let i=0;i<100;i++){await tick();run=(await c.request(base+"/runs")).data[0];if(["completed","failed"].includes(run.status))break;}
  assert.equal(run.status,"completed",run.error);
  assert.equal(run.workflow,"research-assignment");
  assert.equal(run.executedWorkflow.id,"research_ops");
  assert.equal(run.researchAssignment.role,"scout");
  assert.match(run.output,/放射藥物/);
  assert.equal(prompts.length,2);
  assert.deepEqual(run.steps.filter(s=>s.kind!=="context").map(s=>s.role),["scout","director"]);
  const config=(await c.request(base+"/research-watch")).data;
  assert.ok(config.keywords.includes("放射藥物"));
  assert.equal(config.enabled,false);
  await c.request(base+"/runs","POST",body);
  assert.equal((await c.request(base+"/research-watch")).data.revision,config.revision);
  assert.equal(prompts.length,2);
});

test('natural immediate-search requests route without accidentally enabling tracking',()=>{
 for(const text of ['我是說要你現在去網路上搜尋','現在上網搜尋','請你直接去網路上搜查','可以幫我上網搜尋一下'])assert.deepEqual(researchIntent(text),{type:'search'},text);
 assert.deepEqual(researchIntent('幫我上網搜尋最新的放射藥物新聞並彙整給我'),{type:'search',query:'最新的放射藥物新聞'});
 for(const text of ['不要現在上網搜尋','請你現在不要搜尋','如果現在上網搜尋會怎樣','他說「現在上網搜尋」'])assert.equal(researchIntent(text),null,text);
});
test('immediate web search executes before one synthesis call, includes fresh duplicate results and preserves settings',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'live-research-')),calls=[],queries=[];
 const runtime=createApp({dir,teamOptions:{trendSearch:async args=>{
  queries.push(args.request);args.onRequest?.({url:'https://news.google.com/rss/search?q=test',method:'GET'});
  return {query:args.request,sources:[{title:'放射藥物最新報導',url:'https://example.com/news',summary:'本次搜尋摘要',publishedAt:'2026-11-17'}]};
 }},runner:prompt=>{assert.equal(queries.length,calls.length+1);calls.push(prompt);return {promise:Promise.resolve({content:'本次新聞整理：https://example.com/news'}),cancel(){}};}});
 t.after(async()=>{await runtime.close();rmSync(dir,{recursive:true,force:true});});
 const c=await client(runtime.app),state=initialState(),team=state.teams[0],project=team.projects[0];team.researchSettings={topic:'核醫 放射藥物'};team.skills=[{id:'trend-research',scope:'research'}];
 await c.request('/team-workspace','PUT',{revision:0,state});await c.request('/settings','PATCH',{aiConsent:true});
 const base=`/teams/${team.id}/projects/${project.id}`,before=(await c.request(base+'/research-watch')).data;
 for(const id of ['live-one','live-two']){
  await c.request(base+'/runs','POST',{id,role:'research',model:'Codex',text:'我是說要你現在去網路上搜尋'});
  let run;for(let i=0;i<50;i++){await tick();run=(await c.request(base+'/runs')).data.find(r=>r.id===id);if(run.status==='completed')break;}
  assert.equal(run.status,'completed',run.error);assert.match(run.output,/本次新聞整理/);assert.equal(run.researchReceipt.articles.length,1);assert.equal(run.researchReceipt.result.requests.length,1);
  if(id==='live-two')assert.equal(run.researchReceipt.result.duplicates,1);
 }
 assert.equal(queries.length,2);assert.equal(calls.length,2);assert.match(calls[0],/本次搜尋摘要/);assert.match(calls[0],/2026-11-17/);assert.match(calls[0],/trend-research/);
 const after=(await c.request(base+'/research-watch')).data;assert.equal(after.revision,before.revision);assert.equal(after.enabled,false);
});
