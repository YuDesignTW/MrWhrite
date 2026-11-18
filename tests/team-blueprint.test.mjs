import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateBlueprint } from "../server/team-blueprint.mjs";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import {
  initialState,
  createTeam,
  createProject,
  teamMembers,
} from "../src/team-state.mjs";
const plan = {
  mission: "為家具品牌寫有來源的文案",
  directorSkills: ["ig-plan"],
  agents: [
    {
      id: "story_architect",
      name: "故事企劃",
      role: "撰寫故事",
      capability: "writer",
      skills: ["ig-caption"],
    },
    {
      id: "fact_editor",
      name: "事實編輯",
      role: "編輯與指出證據限制",
      capability: "general",
      skills: ["ig-human"],
    },
  ],
  workflows: [
    {
      id: "story_flow",
      name: "故事交付",
      steps: [
        {
          id: "draft",
          agentId: "story_architect",
          instruction: "撰寫文案",
          dependsOn: [],
        },
        {
          id: "edit",
          agentId: "fact_editor",
          instruction: "編輯前置草稿",
          dependsOn: ["draft"],
        },
      ],
    },
  ],
};
const library = ["ig-plan", "ig-caption", "ig-human"].map((id) => ({ id }));
const tick = () => new Promise((r) => setImmediate(r));
test("Codex configuration validates installed skills, named agents and acyclic dependencies", () => {
  const good = validateBlueprint(plan, library);
  assert.equal(good.agents[0].id, "story_architect");
  for (const bad of [
    { ...plan, agents: [{ ...plan.agents[0], skills: ["missing"] }] },
    { ...plan, agents: [{ ...plan.agents[0], id: "director" }] },
    {
      ...plan,
      workflows: [
        {
          ...plan.workflows[0],
          steps: [{ ...plan.workflows[0].steps[0], dependsOn: ["edit"] }],
        },
      ],
    },
  ])
    assert.throws(() => validateBlueprint(bad, library));
});
test("new team starts with director; model interview, activation and custom workflow execute in isolation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blueprint-")),
    calls = [];
  let interview = 0;
  const runner = (prompt) => {
    const role = prompt.match(/的 ([a-z_]+)。/)[1];
    calls.push({ role, prompt });
    let content;
    if (prompt.includes("你是新團隊"))
      content = JSON.stringify(
        ++interview === 1
          ? { reply: "希望交付什麼成果？", proposal: null }
          : { reply: "建議故事企劃與事實編輯合作。", proposal: plan },
      );
    else if (prompt.includes("依使用者要求選擇適合流程"))
      content = JSON.stringify({
        reply: "依配置開始製作",
        workflowId: "story_flow",
      });
    else content = role === "director" ? "整合完成" : `${role}的交付`;
    return { promise: Promise.resolve({ content }), cancel() {} };
  };
  const app = createApp({ dir, runner });
  try {
    const c = await client(app.app),
      state = initialState(),
      old = structuredClone(state.teams[0]);
    const team = createTeam("家具品牌團隊"),
      p = createProject("任務");
    team.setup = { status: "interview" };
    team.projects = [p];
    team.activeProjectId = p.id;
    state.teams.push(team);
    state.activeTeamId = team.id;
    assert.deepEqual(
      teamMembers(team).map((m) => m.id),
      ["director"],
    );
    await c.request("/team-workspace", "PUT", { state, revision: 0 });
    await c.request("/settings", "PATCH", { aiConsent: true });
    const base = `/teams/${team.id}/projects/${p.id}`;
    await c.request(base + "/runs", "POST", {
      id: "ask",
      role: "director",
      model: "Codex",
      text: "我要家具行銷",
    });
    await tick();
    let runs = (await c.request(base + "/runs")).data;
    assert.equal(runs[0].output, "希望交付什麼成果？");
    assert.equal(runs[0].teamProposal, undefined);
    await c.request(base + "/runs", "POST", {
      id: "propose",
      role: "director",
      model: "Codex",
      text: "每週三篇故事，先文字不要圖片",
    });
    await tick();
    const proposal = (await c.request(base + "/runs")).data.find(
      (r) => r.id === "propose",
    );
    assert.equal(proposal.teamProposal.agents.length, 2);
    assert.equal(
      (
        await c.request(
          `/teams/${old.id}/projects/${old.projects[0].id}/runs/propose/activate-team`,
          "POST",
          {},
        )
      ).status,
      404,
    );
    const activated = await c.request(
      base + "/runs/propose/activate-team",
      "POST",
      {},
    );
    assert.equal(activated.status, 200);
    assert.deepEqual(activated.data.state.teams[0], old);
    const configured = activated.data.state.teams[1];
    assert.equal(teamMembers(configured).length, 3);
    assert.equal(configured.skills[1].scope, "story_architect");
    assert.equal(
      (
        await c.request(base + "/runs", "POST", {
          id: "wrong",
          role: "writer",
          model: "Codex",
          text: "寫稿",
        })
      ).status,
      400,
    );
    await c.request(base + "/runs", "POST", {
      id: "execute",
      role: "director",
      model: "Codex",
      text: "照故事交付流程寫一份草稿",
    });
    await tick();
    await tick();
    const done = (await c.request(base + "/runs")).data.find(
      (r) => r.id === "execute",
    );
    assert.equal(done.status, "completed");
    assert.equal(done.executedWorkflow.id, "story_flow");
    assert.deepEqual(
      done.steps.map((s) => s.role),
      ["director", "story_architect", "fact_editor", "director"],
    );
    assert.match(
      calls.find((c) => c.role === "fact_editor").prompt,
      /story_architect的交付/,
    );
    assert.equal(done.steps[1].skills[0].id, "ig-caption");
    assert.equal(done.steps[2].workflowNodeId, done.engineVersion ? "story_flow__edit" : "edit");
  } finally {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
