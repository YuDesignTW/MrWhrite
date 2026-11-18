import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { WorkflowStore } from "../server/workflow-store.mjs";
import { validateBlueprint } from "../server/team-blueprint.mjs";
import { insightReport } from "../server/team-outcomes.mjs";
const fixture = {
  title: "測試交付",
  caption: "測試文案",
  slides: [1, 2, 3].map((i) => ({ title: "頁" + i, body: "測試" })),
  files: [1, 2, 3].map((i) => ({
    name: i + ".png",
    width: 1080,
    height: 1350,
    sha256: "a".repeat(64),
  })),
  reviewStatus: "待使用者審稿",
};
test("approval gates immutable local scheduling, retries deduplicate, imports retain null and cite every metric", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "outcomes-")),
    app = createApp({ dir });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app),
    epoch = app.store.get("settings", "main").epoch,
    scope = { teamId: "t", projectId: "p", dataEpoch: epoch },
    base = "/teams/t/projects/p";
  app.store.put("teamRun", {
    id: "delivery",
    ...scope,
    status: "completed",
    steps: [],
    deliverable: fixture,
  });
  const account = (
    await c.request(base + "/accounts", "POST", {
      platform: "Instagram",
      handle: "test-only",
    })
  ).data;
  assert.equal(
    (await c.request(base + "/runs/delivery/review", "POST", {})).status,
    400,
  );
  const approved = (
    await c.request(base + "/runs/delivery/review", "POST", { approved: true })
  ).data;
  const request = {
    id: "schedule-test",
    deliveryId: approved.id,
    accountId: account.id,
    scheduledAt: "2030-01-01T10:00:00+08:00",
    confirmed: true,
  };
  assert.equal(
    (
      await c.request(
        "/teams/other/projects/p/schedule-delivery",
        "POST",
        request,
      )
    ).status,
    400,
  );
  const scheduled = await c.request(
    base + "/schedule-delivery",
    "POST",
    request,
  );
  assert.equal(scheduled.status, 201);
  assert.equal(scheduled.data.snapshot.caption, fixture.caption);
  assert.equal(
    (await c.request(base + "/schedule-delivery", "POST", request)).status,
    200,
  );
  assert.equal(app.store.all("localSchedule").length, 1);
  const row = (
    await c.request(base + "/schedule/schedule-test", "PATCH", {
      revision: 1,
      status: "published_manual",
    })
  ).data;
  const dataset = (
    await c.request(base + "/performance", "POST", {
      source: "測試專用手動輸入",
      rows: [
        { id: "one", publicationId: row.id, views: 10, likes: null },
        { id: "two", views: 20, likes: 2 },
      ],
    })
  ).data;
  const report = (
    await c.request(
      base + "/performance/" + dataset.id + "/insight",
      "POST",
      {},
    )
  ).data.content;
  assert.equal(report.observations.find((x) => x.metric === "views").value, 30);
  assert.equal(
    report.observations.find((x) => x.metric === "likes").knownRows,
    1,
  );
  assert.equal(
    report.observations.find((x) => x.metric === "saves").value,
    null,
  );
  assert.equal(report.observations[0].citations.length, 2);
  assert.equal(
    (
      await c.request(base + "/performance", "POST", {
        source: "test",
        rows: [{ id: "bad", views: -1 }],
      })
    ).status,
    400,
  );
});
test("backup restores vault, PNG, traces and engine tables under a new epoch; original files remain archived", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "restore-team-")),
    app = createApp({ dir });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const old = app.store.get("settings", "main").epoch,
    db = new WorkflowStore(app.store),
    scope = { teamId: "t", projectId: "p", dataEpoch: old };
  app.store.projectVault.dir("t", "p");
  const memory = app.store.projectVault.document("t", "p", "memory");
  app.store.projectVault.saveDocument(
    "t",
    "p",
    "memory",
    "saved-memory",
    memory.version,
  );
  mkdirSync(join(dir, "team-artifacts", "render"), { recursive: true });
  writeFileSync(join(dir, "team-artifacts", "render", "01.png"), "saved-png");
  db.change("run", {
    id: "r",
    ...scope,
    status: "failed",
    createdAt: new Date().toISOString(),
  });
  app.store.put("teamRun", { id: "r", ...scope, status: "failed", steps: [] });
  const { TraceStore, assembleContext } = await import(
    "../server/context-trace.mjs"
  );
  const traces = new TraceStore(db, dir),
    trace = traces.start(
      { id: "r", ...scope },
      { id: "step", role: "writer" },
      assembleContext({
        run: {},
        role: "writer",
        task: "backup prompt",
        skills: [],
      }),
    );
  app.store.put("teamTracking", {
    id: "paused-after-restore",
    ...scope,
    enabled: true,
    nextCheckAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const snapshot = await app.backups.snapshot();
  writeFileSync(join(dir, "team-artifacts", "render", "01.png"), "later-png");
  await app.backups.restore(snapshot.id);
  const epoch = app.store.get("settings", "main").epoch;
  assert.notEqual(epoch, old);
  assert.match(
    traces
      .list({ id: "r", ...scope, dataEpoch: epoch })
      .find((t) => t.id === trace.id).payload.prompt,
    /backup prompt/,
  );
  assert.equal(
    app.store.get("teamTracking", "paused-after-restore").enabled,
    false,
  );
  assert.equal(
    app.store.projectVault.document("t", "p", "memory").content,
    "saved-memory",
  );
  assert.equal(
    readFileSync(join(dir, "team-artifacts", "render", "01.png"), "utf8"),
    "saved-png",
  );
  assert.equal(
    db.get("run", "r", { ...scope, dataEpoch: epoch }).status,
    "failed",
  );
  assert.equal(app.store.get("teamRun", "r").dataEpoch, epoch);
  assert.equal(
    readFileSync(
      join(dir, "team-artifacts-before-restore-" + epoch, "render", "01.png"),
      "utf8",
    ),
    "later-png",
  );
  symlinkSync("/tmp", join(dir, "team-artifacts", "escape"));
  await assert.rejects(app.backups.snapshot(), /符號連結/);
});
test("custom roles need explicit bounded contracts; missing metrics never invent totals", () => {
  const plan = {
    mission: "test",
    agents: [
      {
        id: "editor",
        name: "編輯",
        role: "校稿",
        roleType: "fact_editor",
        capability: "general",
        skills: [],
      },
    ],
    roleTypes: [
      {
        id: "fact_editor",
        input: "草稿",
        output: "校稿",
        stop: "完成檢查",
        outputType: "Text",
        capability: "general",
      },
    ],
    workflows: [
      {
        id: "edit",
        name: "校稿",
        steps: [
          {
            id: "proof",
            agentId: "editor",
            instruction: "校稿",
            dependsOn: [],
          },
        ],
      },
    ],
  };
  assert.equal(validateBlueprint(plan, []).agents[0].roleType, "fact_editor");
  assert.throws(() => validateBlueprint({ ...plan, roleTypes: [] }, []));
  assert.equal(
    insightReport({ source: "manual", rows: [] }).observations[0].value,
    null,
  );
});
test("trace replay uses exact saved prompt, revisions preserve original artifact and resume without recalling success", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "trace-api-")),
    prompts = [];
  const runner = (prompt) => {
    prompts.push(prompt);
    return { promise: Promise.resolve({ content: "原始文字" }), cancel() {} };
  };
  const app = createApp({ dir, runner, teamOptions: { engineEnabled: true } });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app),
    base = "/teams/t/projects/p";
  await c.request("/settings", "PATCH", { aiConsent: true });
  const wait = async (id) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setImmediate(r));
      const r = (await c.request(base + "/runs")).data.find((r) => r.id === id);
      if (r && !["running", "queued"].includes(r.status)) return r;
    }
    throw Error("timeout");
  };
  await c.request(base + "/runs", "POST", {
    id: "direct",
    role: "writer",
    model: "Codex",
    text: "撰寫一段測試",
  });
  assert.equal((await wait("direct")).status, "completed");
  const trace = (await c.request(base + "/runs/direct/trace")).data;
  assert.ok(trace.traces.some((t) => t.phase === "validated"));
  const started = trace.traces.find((t) => t.phase === "started");
  assert.equal(
    (
      await c.request(
        "/teams/other/projects/p/runs/direct/trace/" + started.id + "/replay",
        "POST",
        {},
      )
    ).status,
    404,
  );
  const replay = (
    await c.request(
      base + "/runs/direct/trace/" + started.id + "/replay",
      "POST",
      {},
    )
  ).data;
  assert.equal((await wait(replay.id)).status, "completed");
  assert.equal(prompts[1], prompts[0]);
  const original = trace.artifacts[0],
    changed = await c.request(
      base + "/runs/direct/artifacts/" + original.id + "/revise",
      "POST",
      { content: "使用者編修" },
    );
  assert.equal(changed.status, 201);
  assert.equal(changed.data.version, original.version + 1);
  assert.equal(
    (
      await c.request(
        base + "/runs/direct/artifacts/" + original.id + "/revise",
        "POST",
        { content: "過期" },
      )
    ).status,
    409,
  );
  assert.equal(
    (await c.request(base + "/runs/direct/resume", "POST", {})).status,
    202,
  );
  const resumed = await wait("direct");
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.output, "使用者編修");
  assert.equal(prompts.length, 2);
  const after = (await c.request(base + "/runs/direct/trace")).data;
  assert.equal(
    after.artifacts.find((a) => a.id === original.id).content,
    "原始文字",
  );
});
test("configured explicit workflow bypasses router, honors plan and node gates, and validates typed artifacts", async (t) => {
  const { initialState, createTeam, createProject } = await import(
    "../src/team-state.mjs"
  );
  const dir = mkdtempSync(join(tmpdir(), "configured-gates-")),
    calls = [];
  const runner = (prompt) => {
    const role = prompt.match(/的 ([a-z_]+)。/)[1];
    calls.push(role);
    return {
      promise: Promise.resolve({
        content:
          role === "editor"
            ? JSON.stringify({ style: "typographic" })
            : "彙整已完成",
      }),
      cancel() {},
    };
  };
  const app = createApp({ dir, runner, teamOptions: { engineEnabled: true } });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app),
    state = initialState(),
    team = createTeam("test"),
    project = createProject("test");
  team.projects = [project];
  team.activeProjectId = project.id;
  team.blueprint = validateBlueprint(
    {
      mission: "test",
      roleTypes: [
        {
          id: "visual_editor",
          input: "任務",
          output: "設計",
          stop: "選出風格",
          outputType: "DesignPlan",
          capability: "designer",
        },
      ],
      agents: [
        {
          id: "editor",
          name: "編輯",
          role: "選風格",
          roleType: "visual_editor",
          capability: "designer",
          skills: [],
        },
      ],
      workflows: [
        {
          id: "three",
          name: "三步設計",
          steps: [
            {
              id: "one",
              agentId: "editor",
              instruction: "風格",
              dependsOn: [],
              gate: { type: "approve_after" },
            },
            {
              id: "two",
              agentId: "editor",
              instruction: "風格",
              dependsOn: ["one"],
            },
            {
              id: "three",
              agentId: "editor",
              instruction: "風格",
              dependsOn: ["two"],
            },
          ],
        },
      ],
    },
    [],
  );
  state.teams.push(team);
  await c.request("/team-workspace", "PUT", { state, revision: 0 });
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`;
  const wait = async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setImmediate(r));
      const r = (await c.request(base + "/runs")).data[0];
      if (r && !["running", "queued"].includes(r.status)) return r;
    }
    throw Error("timeout");
  };
  await c.request(base + "/runs", "POST", {
    id: "gated",
    role: "director",
    model: "Codex",
    text: "three",
  });
  assert.equal((await wait()).status, "awaiting_approval");
  assert.equal(calls.length, 0);
  assert.equal(
    (await c.request(base + "/runs/gated/approve", "POST", { confirmed: true }))
      .status,
    202,
  );
  assert.equal((await wait()).status, "awaiting_approval");
  assert.deepEqual(calls, ["editor"]);
  await c.request(base + "/runs/gated/approve", "POST", { confirmed: true });
  assert.equal((await wait()).status, "completed");
  assert.deepEqual(calls, ["editor", "editor", "editor", "director"]);
  const data = (await c.request(base + "/runs/gated/trace")).data;
  assert.equal(data.artifacts.filter((a) => a.type === "DesignPlan").length, 3);
  assert.equal(
    (await c.request(base + "/runs/gated/approve", "POST", { confirmed: true }))
      .status,
    409,
  );
});
test("artifact schemas reject nested invalid content and nonexistent evidence", async () => {
  const { validateArtifact } = await import("../server/artifact-schema.mjs");
  assert.throws(
    () =>
      validateArtifact("TopicOptions", [
        { title: "題目", angle: "角度", sourceIds: ["made-up"] },
      ]),
    /來源/,
  );
  assert.throws(
    () =>
      validateArtifact("InsightReport", {
        observations: [
          {
            metric: "likes",
            value: "100",
            knownRows: 1,
            totalRows: 1,
            citations: [],
          },
        ],
        hypotheses: [],
        experiments: [],
        datasetHash: "hash",
      }),
    /結構/,
  );
  assert.throws(() =>
    validateArtifact("RenderedSet", {
      ...fixture,
      files: fixture.files.slice(0, 1),
    }),
  );
});
test("new configured team topic template uses selection gate and custom research role before production", async (t) => {
  const { initialState, createTeam, createProject } = await import(
    "../src/team-state.mjs"
  );
  const f = JSON.parse(
    readFileSync(
      new URL("./fixtures/team-acceptance-contract.json", import.meta.url),
    ),
  );
  const dir = mkdtempSync(join(tmpdir(), "new-topic-")),
    calls = [];
  let searches = 0;
  const runner = (prompt) => {
    const role = prompt.match(/的 ([a-z_]+)。/)[1];
    calls.push(role);
    return {
      promise: Promise.resolve({
        content:
          role === "director"
            ? JSON.stringify(f.topics)
            : f.outputs.research[0],
      }),
      cancel() {},
    };
  };
  const app = createApp({
    dir,
    runner,
    teamOptions: {
      engineEnabled: true,
      trendSearch: async () => {
        searches++;
        return structuredClone(f.search);
      },
    },
  });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app),
    state = initialState(),
    team = createTeam("template"),
    project = createProject("template");
  team.projects = [project];
  team.activeProjectId = project.id;
  team.blueprint = validateBlueprint(
    {
      mission: "topic",
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
          id: "content",
          name: "選題製作",
          template: "topic-to-delivery",
          steps: [
            {
              id: "research",
              agentId: "custom_research",
              instruction: "研究",
              dependsOn: [],
            },
          ],
        },
      ],
    },
    [],
  );
  state.teams.push(team);
  await c.request("/team-workspace", "PUT", { state, revision: 0 });
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`;
  await c.request(base + "/runs", "POST", {
    id: "topic",
    role: "director",
    model: "Codex",
    text: "推薦內容給我選",
  });
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  const run = (await c.request(base + "/runs")).data[0];
  assert.equal(run.workflow, "topic-choice");
  assert.equal(run.status, "awaiting_selection");
  assert.deepEqual(calls, ["custom_research", "director"]);
  assert.equal(searches, 1);
});
