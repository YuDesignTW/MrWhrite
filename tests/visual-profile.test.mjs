import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
import { initialState } from "../src/team-state.mjs";
import { VisualProfiles } from "../server/visual-profile.mjs";
import { imagePrompt, makeSlideGenerator } from "../server/carousel-images.mjs";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "visual-test-")),
    calls = [];
  const runtime = createApp({
    dir,
    runner: (prompt, cwd, options) => {
      calls.push({ prompt, options });
      return {
        promise: Promise.resolve({ content: "設計提案，未產圖" }),
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
  team.skills = [
    "design-core",
    "design-carousel",
    "design-single",
    "image-art-direction",
  ].map((id) => ({ id, scope: "designer" }));
  const other = structuredClone(team);
  other.id = "other-team";
  other.projects[0].id = "other-project";
  state.teams.push(other);
  team.projects.push({ ...structuredClone(project), id: "second-project" });
  assert.equal(
    (await c.request("/team-workspace", "PUT", { state, revision: 0 })).status,
    200,
  );
  await c.request("/settings", "PATCH", { aiConsent: true });
  const base = `/teams/${team.id}/projects/${project.id}`,
    scope = { teamId: team.id, projectId: project.id };
  async function change(body) {
    const p = (await c.request(base + "/visual-profile")).data;
    return c.request(base + "/visual-profile", "POST", {
      revision: p.revision,
      ...body,
    });
  }
  return { runtime, c, scope, base, change, calls, team };
}
const ref = {
  action: "reference",
  title: "配色參考",
  like: "參考留白",
  avoid: "不複製文字",
  scope: "team",
  kind: "carousel",
  base64: png,
};
test("visual references validate upload, revision and team/project scope, survive backup", async (t) => {
  const { runtime, c, scope, base, change, team } = await setup(t);
  let response = await change(ref);
  assert.equal(response.status, 200);
  const id = response.data.references[0].id;
  assert.equal(
    (await c.request(base + "/visual-profile", "POST", { ...ref, revision: 0 }))
      .status,
    409,
  );
  assert.equal(
    (await change({ ...ref, base64: Buffer.from("<svg/>").toString("base64") }))
      .status,
    400,
  );
  assert.equal(
    (
      await c.request(
        "/teams/other-team/projects/other-project/visual-profile/images/" + id,
      )
    ).status,
    404,
  );
  await change({ ...ref, title: "本專案", scope: "project" });
  const svc = new VisualProfiles(runtime.store);
  assert.equal(
    svc.snapshot({ ...scope, projectId: "second-project" }, "carousel")
      .references.length,
    1,
  );
  assert.equal(svc.snapshot(scope, "single").references.length, 0);
  const snap = svc.snapshot(scope, "carousel"),
    paths = svc.materialize(scope, snap);
  assert.equal(paths.length, 2);
  assert.equal(readFileSync(paths[0]).toString("base64"), png);
  const backup = await runtime.backups.snapshot();
  await runtime.backups.restore(backup.id);
  const restored = await client(runtime.app);
  assert.equal(
    (await restored.request(base + "/visual-profile")).data.references.length,
    2,
  );
  const fresh = svc.snapshot(scope, "carousel");
  assert.equal(
    readFileSync(svc.materialize(scope, fresh)[0]).toString("base64"),
    png,
  );
});
test("designer receives real image attachment and scoped skills; feedback stays pending", async (t) => {
  const { runtime, c, scope, base, change, calls } = await setup(t);
  await change(ref);
  async function run(id, text) {
    await c.request(base + "/runs", "POST", {
      id,
      role: "designer",
      model: "Codex",
      text,
    });
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setImmediate(r));
      const r = (await c.request(base + "/runs")).data.find((r) => r.id === id);
      if (["completed", "failed"].includes(r.status)) {
        assert.equal(r.status, "completed", r.error);
        return r;
      }
    }
    assert.fail("timeout");
  }
  const r = await run("design", "規劃輪播視覺方向");
  assert.equal(calls[0].options.images.length, 1);
  assert.equal(
    readFileSync(calls[0].options.images[0]).toString("base64"),
    png,
  );
  assert.ok(r.steps[0].skills.some((s) => s.id === "design-carousel"));
  assert.ok(!r.steps[0].skills.some((s) => s.id === "design-single"));
  assert.equal(r.steps[0].referenceImages[0].status, "attached");
  await run("feedback", "字太小，請放大標題");
  let p = (await c.request(base + "/visual-profile")).data;
  assert.equal(p.feedback[0].targetRunId, "design");
  assert.equal(p.feedback[0].status, "pending");
  await c.request(base + "/runs", "POST", {
    id: "feedback",
    role: "designer",
    model: "Codex",
    text: "字太小，請放大標題",
  });
  assert.equal(
    (await c.request(base + "/visual-profile")).data.feedback.length,
    1,
  );
  await change({
    action: "feedback",
    id: p.feedback[0].id,
    status: "active",
    rule: "標題優先清楚易讀",
    kind: "carousel",
  });
  assert.equal(
    new VisualProfiles(runtime.store).snapshot(scope, "carousel").rules.length,
    1,
  );
  const single = await run("single", "規劃單張海報");
  assert.equal(calls.at(-1).options.images.length, 0);
  assert.ok(single.steps[0].skills.some((s) => s.id === "design-single"));
});
test("image generator forwards bounded reference attachments without claiming an output on failure", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "visual-generator-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let received;
  const gen = makeSlideGenerator(dir, {
    runner: (prompt, cwd, options) => {
      received = options;
      return {
        promise: Promise.resolve({ content: "", reason: "unavailable" }),
        cancel() {},
      };
    },
  });
  await assert.rejects(
    gen({
      directory: "test",
      copy: { title: "題目", slides: [{ title: "標題", body: "正文" }] },
      design: { style: "graphic", layout: "top" },
      page: 0,
      visualSettings: { referenceImages: ["/tmp/fixture.png"] },
    }),
    /圖片工具不可用|unavailable/,
  );
  assert.deepEqual(received.images, ["/tmp/fixture.png"]);
  assert.equal(received.imageGeneration, true);
});
