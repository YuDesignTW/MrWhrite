import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { ResearchSubscriptions } from "../server/research-subscriptions.mjs";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { initialState, createTeam, createProject } from "../src/team-state.mjs";
import { validateBlueprint } from "../server/team-blueprint.mjs";
test("daily sources persist deduped evidence, survive missed intervals, pause and isolate project/epoch", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "subscriptions-")),
    store = new Store(dir);
  t.after(() => {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let clock = Date.now(),
    calls = 0;
  const svc = new ResearchSubscriptions(store, {
    clock: () => clock,
    read: async (url) => {
      calls++;
      return {
        id: url,
        url,
        title: "radiopharmaceutical update",
        summary: "Actual saved source text",
        collectedAt: new Date(clock).toISOString(),
        links: url.endsWith("/news")
          ? [
              {
                url: "https://example.com/radiopharma",
                title: "Radiopharma research update",
              },
            ]
          : [],
      };
    },
  });
  const s = { teamId: "t", projectId: "p" },
    r = svc.add(s, {
      url: "https://example.com/news",
      name: "Media",
      keywords: ["radiopharma"],
    });
  assert.equal(svc.add(s, { url: r.url, name: "Media" }).id, r.id);
  await svc.tick();
  assert.equal(calls, 2);
  assert.equal(svc.evidence(s).length, 2);
  assert.equal(svc.evidence({ ...s, projectId: "other" }).length, 0);
  await svc.tick();
  assert.equal(calls, 2);
  clock += 3 * 86400000;
  await svc.tick();
  assert.equal(calls, 4);
  assert.equal(svc.get(s, r.id).sources.length, 2);
  svc.update(s, r.id, false);
  clock += 86400000;
  await svc.tick();
  assert.equal(calls, 4);
  store.put("settings", { ...store.get("settings", "main"), epoch: "new" });
  assert.equal(svc.list(s).length, 0);
  svc.close();
});
test("collection abort preserves original evidence and retry remains due", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "subscriptions-stop-")),
    store = new Store(dir);
  t.after(() => {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let entered;
  const ready = new Promise((r) => (entered = r));
  const svc = new ResearchSubscriptions(store, {
    read: (_url, { signal }) =>
      new Promise((resolve, reject) => {
        entered();
        signal.addEventListener("abort", () => reject(Error("stopped")));
      }),
  });
  const s = { teamId: "t", projectId: "p" },
    r = svc.add(s, { url: "https://example.com/news", name: "Media" });
  const promise = svc.collect(s, r.id);
  await ready;
  svc.close();
  await promise;
  assert.equal(store.get("researchSubscription", r.id).status, "interrupted");
  assert.equal(store.get("researchSubscription", r.id).sources.length, 0);
});
test("generated carousel resumes failed page after restart without recalling copy, design or completed images", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "image-resume-"));
  let app,
    fail = true;
  const calls = [],
    images = [];
  let renders = 0;
  const copy = {
    title: "主題",
    caption: "來源說明",
    slides: Array.from({ length: 3 }, (_, i) => ({
      title: "頁" + i,
      body: "這是連貫文案",
    })),
  };
  const render = async ({ copy: c, generatedImages, imageGeneration }) => {
    renders++;
    assert.deepEqual(c, copy);
    assert.equal(imageGeneration, true);
    assert.equal(Object.keys(generatedImages).length, 3);
    return c.slides.map((_, i) => ({
      name: i + ".png",
      width: 1080,
      height: 1350,
      sha256: "a".repeat(64),
    }));
  };
  render.generateSlide = async ({ page, copy: c, visualSettings }) => {
    images.push(page);
    assert.deepEqual(c, copy);
    assert.match(visualSettings.direction, /大膽/);
    if (fail && page === 1) throw Error("injected page failure");
    return {
      directory: "image-" + page,
      name: "generated.png",
      page,
      sha256: "a".repeat(64),
    };
  };
  const runner = (prompt) => {
    calls.push(prompt);
    const role = prompt.match(/的 (\w+)。/)[1];
    let content =
      role === "writer"
        ? JSON.stringify(copy)
        : role === "designer"
          ? JSON.stringify({
              style: "surreal",
              artDirection: "玻璃與光影",
              palette: {
                background: "#102348",
                foreground: "#ffffff",
                accent: "#ff6b2b",
              },
              imageConcepts: ["一", "二", "三"],
            })
          : role === "research"
            ? "研究報告"
            : prompt.includes("回傳content純JSON")
              ? JSON.stringify({
                  reply: "開始",
                  workflowId: "carousel",
                  taskBrief: "一篇三頁",
                  skipNodes: [],
                })
              : prompt.includes("依研究報告提出3")
                ? JSON.stringify({
                    topics: [
                      { title: "主題", angle: "切角", sourceIds: ["source1"] },
                    ],
                  })
                : "完成";
    return { promise: Promise.resolve({ content }), cancel() {} };
  };
  const options = {
    dir,
    runner,
    teamOptions: {
      renderCarousel: render,
      publicResearch: async () => ({ sources: [], warnings: [] }),
      trendSearch: async () => ({
        sources: [
          {
            id: "source1",
            url: "https://example.com/news",
            title: "消息",
            summary: "來源內容",
          },
        ],
      }),
    },
  };
  app = createApp(options);
  t.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let c = await client(app.app);
  const state = initialState(),
    team = createTeam("Example Team"),
    p = createProject("驗證");
  team.projects = [p];
  team.setup = { status: "ready" };
  team.visualSettings = { direction: "大膽色彩" };
  team.blueprint = validateBlueprint(
    {
      mission: "輪播",
      agents: ["research", "writer", "designer"].map((role) => ({
        id: role,
        name: role,
        role,
        roleType: role,
        capability: role,
        skills: [],
      })),
      workflows: [
        {
          id: "carousel",
          name: "輪播",
          template: "topic-to-delivery",
          imageGeneration: true,
          steps: [
            {
              id: "research",
              agentId: "research",
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
  assert.equal(
    (await c.request("/team-workspace", "PUT", { state, revision: 0 })).status,
    200,
  );
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${p.id}/runs`;
  const wait = async () => {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setImmediate(r));
      const r = (await c.request(base)).data[0];
      if (r && !["queued", "running"].includes(r.status)) return r;
    }
    throw Error("timeout");
  };
  assert.equal(
    (
      await c.request(base, "POST", {
        id: "r",
        role: "director",
        model: "Codex",
        text: "製作輪播",
      })
    ).status,
    202,
  );
  let r = await wait();
  if (r.status === "awaiting_approval") {
    await c.request(base + "/r/approve", "POST", { confirmed: true });
    r = await wait();
  }
  assert.equal(r.status, "awaiting_selection");
  assert.equal(images.length, 0);
  await c.request(base + "/r/select", "POST", { topicId: r.topics[0].id });
  r = await wait();
  assert.equal(r.status, "failed");
  assert.deepEqual(images, [0, 1]);
  assert.equal(renders, 0);
  const before = calls.length;
  await app.close();
  fail = false;
  app = createApp(options);
  c = await client(app.app);
  assert.equal((await c.request(base + "/r/resume", "POST", {})).status, 202);
  r = await wait();
  assert.equal(r.status, "completed", r.error);
  assert.deepEqual(images, [0, 1, 1, 2]);
  assert.equal(calls.length, before + 1);
  assert.equal(renders, 1);
});
