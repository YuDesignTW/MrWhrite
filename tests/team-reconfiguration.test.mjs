import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { initialState, createTeam, createProject } from "../src/team-state.mjs";
import { validateBlueprint } from "../server/team-blueprint.mjs";
import { WorkflowStore } from "../server/workflow-store.mjs";
import {
  publicAddress,
  readPublicSource,
  sourceUrls,
} from "../server/public-research.mjs";
const raw = {
  mission: "舊版三篇文字規格",
  agents: ["research", "writer", "designer"].map((role) => ({
    id: "custom_" + role,
    name: role,
    role,
    roleType: role,
    capability: role,
    skills: [],
  })),
  workflows: [
    {
      id: "carousel",
      name: "圖文流程",
      steps: ["research", "writer", "designer"].map((role, i, a) => ({
        id: role,
        agentId: "custom_" + role,
        instruction: "舊預設三篇文字",
        dependsOn: i ? [a[i - 1]] : [],
      })),
    },
  ],
};
test("conversation revision requires explicit activation, versions guard stale proposals, and template produces one real render contract", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "reconfigure-"));
  const updated = {
    ...structuredClone(raw),
    mission: "一篇六頁PNG與文案",
    workflows: raw.workflows.map((w) => ({
      ...w,
      template: "topic-to-delivery",
    })),
  };
  let rendered = 0;
  const calls = [];
  const copy = {
    title: "指定題目",
    caption: "依公開來源整理",
    slides: Array.from({ length: 6 }, (_, i) => ({
      title: "頁" + i,
      body: "公開資料內容",
    })),
  };
  const runner = (prompt) => {
    calls.push(prompt);
    const role = prompt.match(/的 ([a-z_]+)。/)[1];
    let content;
    if (prompt.includes("回傳content純JSON"))
      content = JSON.stringify(
        prompt.includes("使用者要求：請改配置")
          ? { reply: "待確認新版", workflowId: null, proposal: updated }
          : {
              reply: "製作一篇六頁",
              workflowId: "carousel",
              taskBrief: "只做一篇六頁指定題目，不能做三篇",
              skipNodes: [],
            },
      );
    else if (role === "custom_research") content = "有來源的研究報告";
    else if (prompt.includes("依研究報告提出3"))
      content = JSON.stringify({
        topics: [
          { title: "指定題目", angle: "一次一篇", sourceIds: ["source1"] },
        ],
      });
    else if (role === "custom_writer") {
      assert.match(prompt, /只做一篇六頁/);
      content = JSON.stringify(copy);
    } else if (role === "custom_designer")
      content = JSON.stringify({ style: "typographic" });
    else content = "已交付六張PNG";
    return { promise: Promise.resolve({ content }), cancel() {} };
  };
  const app = createApp({
    dir,
    runner,
    teamOptions: {
      engineEnabled: true,
      trendSearch: async () => ({
        sources: [
          {
            id: "source1",
            url: "https://example.com/news",
            title: "公開來源",
            summary: "內容",
          },
        ],
      }),
      publicResearch: async () => ({ sources: [], warnings: [] }),
      renderCarousel: async ({ copy: c }) => {
        rendered++;
        assert.deepEqual(c, copy);
        return c.slides.map((_, i) => ({
          name: i + ".png",
          width: 1080,
          height: 1350,
          sha256: "a".repeat(64),
        }));
      },
    },
  });
  t.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app),
    state = initialState(),
    team = createTeam("Example Team"),
    project = createProject("測試");
  team.projects = [project];
  team.blueprint = validateBlueprint(raw, []);
  team.setup = { status: "ready" };
  const oldVersion = team.blueprint.version;
  state.teams.push(team);
  await c.request("/team-workspace", "PUT", { state, revision: 0 });
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`;
  const wait = async (id) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setImmediate(r));
      const r = (await c.request(base + "/runs")).data.find((r) => r.id === id);
      if (r && !["running", "queued"].includes(r.status)) return r;
    }
    throw Error("timeout");
  };
  const start = async (id, text) => {
    assert.equal(
      (
        await c.request(base + "/runs", "POST", {
          id,
          role: "director",
          model: "Codex",
          text,
        })
      ).status,
      202,
    );
    return wait(id);
  };
  const proposal = await start("revision", "請改配置讓既有成員交付圖片");
  assert.ok(proposal.teamProposal);
  assert.equal(proposal.proposalBaseVersion, oldVersion);
  assert.equal(
    app.store.get("teamWorkspace", "main").state.teams.at(-1).blueprint.version,
    oldVersion,
  );
  assert.equal(rendered, 0);
  await start("stale", "請改配置第二個提案");
  assert.equal(
    (await c.request(base + "/runs/revision/activate-team", "POST", {})).status,
    200,
  );
  assert.equal(
    (await c.request(base + "/runs/revision/activate-team", "POST", {})).status,
    200,
  );
  assert.equal(
    (await c.request(base + "/runs/stale/activate-team", "POST", {})).status,
    409,
  );
  assert.equal(app.store.all("teamBlueprintVersion").length, 2);
  assert.equal(
    app.store.get("teamRun", "revision").teamDefinition.version,
    oldVersion,
  );
  let run = await start("production", "好，幫我做一篇六頁");
  assert.equal(run.status, "awaiting_approval");
  await c.request(base + "/runs/production/approve", "POST", {
    confirmed: true,
  });
  run = await wait("production");
  assert.equal(run.status, "awaiting_selection");
  assert.equal(rendered, 0);
  assert.equal(calls.filter((p) => /的 custom_writer。/.test(p)).length, 0);
  assert.equal(
    (
      await c.request(base + "/runs/production/select", "POST", {
        topicId: run.topics[0].id,
      })
    ).status,
    202,
  );
  run = await wait("production");
  assert.equal(run.status, "completed", run.error);
  assert.equal(rendered, 1);
  assert.equal(run.deliverable.files.length, 6);
  const db = new WorkflowStore(app.store);
  assert.ok(db.artifacts(run).some((a) => a.type === "RenderedSet"));
  assert.equal(
    db
      .get("run", run.id, run)
      .spec.nodes.find((n) => n.id === "carousel__render").kind,
    "capability",
  );
});
test("public reader rejects private destinations and extracts only user-provided non-social URLs", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(
    readPublicSource("https://example.com/", {
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    /非公開/,
  );
  await assert.rejects(readPublicSource("https://127.0.0.1/"), /公開HTTPS/);
  assert.deepEqual(
    sourceUrls({
      text: "研究 https://example.com/ 和 https://x.com/user",
      history: [{ request: "官網 https://company.example/" }],
    }),
    ["https://example.com/", "https://company.example/"],
  );
});

test('persistent research websites survive short conversation history',()=>{assert.deepEqual(sourceUrls({text:'做第一篇',history:[{request:'最近的討論沒有網址'}],researchSettings:{sourceUrls:['https://example.com/']}}),['https://example.com/']);});
test('configured carousel with no sources stops before model research and topic retries',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'no-evidence-template-'));let calls=0;const app=createApp({dir,runner:()=>{calls++;throw Error('Should not call model without evidence')},teamOptions:{engineEnabled:true,trendSearch:async()=>({sources:[]}),publicResearch:async()=>({sources:[],warnings:[]})}});t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})});const c=await client(app.app),state=initialState(),team=createTeam('test'),project=createProject('test');team.projects=[project];team.blueprint=validateBlueprint({...raw,workflows:raw.workflows.map(w=>({...w,template:'topic-to-delivery'}))},[]);state.teams.push(team);await c.request('/team-workspace','PUT',{state,revision:0});await c.request('/settings','PATCH',{aiConsent:true});const base=`/teams/${team.id}/projects/${project.id}/runs`;await c.request(base,'POST',{id:'empty',role:'director',model:'Codex',text:'carousel'});for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));await c.request(base+'/empty/approve','POST',{confirmed:true});for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));const run=(await c.request(base)).data[0];assert.equal(run.status,'completed',run.error);assert.equal(calls,0);assert.equal(run.deliverable,undefined);assert.match(run.output,/沒有可分析/);
});
