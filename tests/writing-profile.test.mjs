import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { initialState } from "../src/team-state.mjs";
import { WritingProfiles, checkWriting } from "../server/writing-profile.mjs";
const tick = () => new Promise((r) => setImmediate(r));
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "writing-")),
    prompts = [];
  const runtime = createApp({
    dir,
    runner: (p) => {
      prompts.push(p);
      return {
        promise: Promise.resolve({
          content: p.includes("workflowId=null")
            ? JSON.stringify({
                reply: "派工",
                workflowId: "writing",
                skipNodes: [],
                approvalRequired: false,
                taskBrief: "撰寫新聞稿",
              })
            : "文案初稿【待補日期】",
        }),
        cancel() {},
      };
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
  team.blueprint = {
    mission: "內容製作",
    version: "v1",
    agents: [
      {
        id: "copywriter",
        name: "文案寫手",
        role: "承接貼文、輪播、新聞稿",
        roleType: "writer",
        capability: "writer",
        skills: [
          "copy-core",
          "copy-post",
          "copy-carousel",
          "copy-press-release",
        ],
      },
    ],
    directorSkills: [],
    workflows: [
      {
        id: "writing",
        name: "文案製作",
        steps: [
          {
            id: "write",
            agentId: "copywriter",
            instruction: "依要求寫文案",
            dependsOn: [],
            outputType: "Text",
          },
        ],
      },
    ],
  };
  team.skills = team.blueprint.agents[0].skills.map((id) => ({
    id,
    scope: "copywriter",
  }));
  const other = structuredClone(team);
  other.id = "other-team";
  other.projects[0].id = "other-project";
  state.teams.push(other);
  assert.equal(
    (await c.request("/team-workspace", "PUT", { revision: 0, state })).status,
    200,
  );
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`;
  const change = async (body) => {
    const p = (await c.request(base + "/writing-profile")).data;
    return c.request(base + "/writing-profile", "POST", {
      revision: p.revision,
      ...body,
    });
  };
  async function run(id, text, role = "copywriter") {
    assert.equal(
      (
        await c.request(base + "/runs", "POST", {
          id,
          text,
          role,
          model: "Codex",
        })
      ).status,
      202,
    );
    for (let i = 0; i < 100; i++) {
      await tick();
      const r = (await c.request(base + "/runs")).data.find((r) => r.id === id);
      if (["completed", "failed"].includes(r.status)) {
        assert.equal(r.status, "completed", r.error);
        return r;
      }
    }
    assert.fail("run did not finish");
  }
  return { runtime, c, base, change, run, prompts, team, project };
}
test("voice library isolates teams, checks revisions, selects format and survives backup", async (t) => {
  const { runtime, c, base, change, team, project } = await setup(t);
  for (const type of ["post", "carousel", "press-release", "general"])
    assert.equal(
      (
        await change({
          action: "sample",
          title: type,
          content: "口吻範例" + type,
          type,
        })
      ).status,
      200,
    );
  assert.equal(
    (await change({ action: "guide", content: "自然敘事" })).status,
    200,
  );
  assert.equal(
    (
      await c.request(base + "/writing-profile", "POST", {
        revision: 0,
        action: "guide",
        content: "stale",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await c.request(
        "/teams/other-team/projects/other-project/writing-profile",
      )
    ).data.samples.length,
    0,
  );
  assert.equal(
    (await c.request(base.replace(project.id, "missing") + "/writing-profile"))
      .status,
    404,
  );
  const svc = new WritingProfiles(runtime.store),
    scope = { teamId: team.id, projectId: project.id };
  const selected = svc.snapshot(scope, "寫新聞稿", "press-release");
  assert.equal(selected.samples.length, 3);
  assert.equal(selected.samples[0].type, "press-release");
  const p = (await c.request(base + "/writing-profile")).data;
  await change({ action: "sample", ...p.samples[2], enabled: false });
  assert.equal(
    svc
      .snapshot(scope, "新聞稿", "press-release")
      .samples.some((s) => s.id === p.samples[2].id),
    false,
  );
  const snap = await runtime.backups.snapshot();
  await runtime.backups.restore(snap.id);
  const restored = await client(runtime.app),
    data = (await restored.request(base + "/writing-profile")).data;
  assert.equal(data.guide, "自然敘事");
  assert.equal(data.samples.length, 4);
  assert.notEqual(data.dataEpoch, p.dataEpoch);
});
test("writer loads only selected format skill and voice; dislikes stay pending, editable and idempotent", async (t) => {
  const { c, base, change, run, prompts } = await setup(t);
  await change({
    action: "sample",
    title: "口吻",
    content: "獨特口吻樣本",
    type: "post",
  });
  const first = await run("draft", "寫一篇貼文");
  assert.match(prompts[0], /獨特口吻樣本/);
  assert.deepEqual(first.steps[0].skills.map((s) => s.id).sort(), [
    "copy-core",
    "copy-post",
  ]);
  assert.equal(first.steps[0].writingProfile.samples.length, 1);
  assert.equal(first.steps[0].writingChecks.warnings.length, 1);
  await run("dislike", "不喜歡這篇開頭，太誇張");
  let p = (await c.request(base + "/writing-profile")).data;
  assert.equal(p.feedback.length, 1);
  assert.equal(p.feedback[0].status, "pending");
  assert.equal(p.feedback[0].targetRunId, "draft");
  await c.request(base + "/runs", "POST", {
    id: "dislike",
    role: "copywriter",
    model: "Codex",
    text: "不喜歡這篇開頭，太誇張",
  });
  assert.equal(
    (await c.request(base + "/writing-profile")).data.feedback.length,
    1,
  );
  await change({
    action: "feedback",
    id: p.feedback[0].id,
    status: "active",
    rule: "避免浮誇開場",
    type: "post",
  });
  const next = await run("next", "寫一篇貼文");
  assert.equal(next.steps[0].writingProfile.rules[0].rule, "避免浮誇開場");
  const press = await run("press", "寫新聞稿");
  assert.equal(press.steps[0].writingProfile.rules.length, 0);
  assert.deepEqual(press.steps[0].skills.map((s) => s.id).sort(), [
    "copy-core",
    "copy-press-release",
  ]);
  await run("hypothetical", "如果我說不喜歡會怎樣");
  assert.equal(
    (await c.request(base + "/writing-profile")).data.feedback.length,
    1,
  );
});
test("director configured writing flow uses the same writer voice and records version", async (t) => {
  const { change, run } = await setup(t);
  await change({ action: "guide", content: "專業且簡潔" });
  const r = await run("delegated", "撰寫一篇新聞稿", "director");
  const writer = r.steps.find((s) => s.role === "copywriter");
  assert.ok(writer);
  assert.equal(writer.writingProfile.guide, "專業且簡潔");
  assert.equal(writer.writingProfile.type, "press-release");
  assert.equal(r.executedWorkflow.id, "writing");
});
test("deterministic checks report explicit length and pending information without claiming factual review", () => {
  const c = checkWriting("很長的稿件【待補日期】", "最多3字");
  assert.equal(c.warnings.length, 2);
  assert.equal(c.factualVerification, false);
});
