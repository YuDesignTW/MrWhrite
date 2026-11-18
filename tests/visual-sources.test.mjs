import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { initialState } from "../src/team-state.mjs";
import { client } from "./http-helper.mjs";
import { VisualSources } from "../server/visual-sources.mjs";
import { fetchPublicMedia } from "../server/public-media.mjs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
const candidate = {
  title: "漫畫風格",
  direction: "扁平漫畫",
  palette: "珊瑚橘與青藍",
  typography: "粗體標題",
  composition: "分鏡與留白",
  avoid: "不複製角色",
  observations: [{ page: 1, detail: "實際附圖的色塊" }],
};
async function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "visual-source-")),
    calls = [];
  const visualSourceOptions = {
    fetchMedia: async () => ({
      bytes: Buffer.from("%PDF-test"),
      mime: "application/pdf",
    }),
    render: async (_path, out) => {
      writeFileSync(join(out, "page-1.png"), png);
      return {
        pageCount: 24,
        pages: [{ page: 1, filename: "page-1.png", text: "" }],
      };
    },
    ...options,
  };
  const app = createApp({
    dir,
    teamOptions: { visualSourceOptions },
    runner: (prompt, cwd, o) => {
      calls.push({ prompt, images: o.images.map((p) => readFileSync(p)) });
      return {
        promise: Promise.resolve({ content: JSON.stringify(candidate) }),
        cancel() {},
      };
    },
  });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app),
    state = initialState(),
    team = state.teams[0],
    project = team.projects[0];
  team.projects.push({ ...structuredClone(project), id: "other-project" });
  await c.request("/team-workspace", "PUT", { revision: 0, state });
  await c.request("/settings", "PATCH", { aiConsent: true });
  return {
    app,
    c,
    calls,
    base: `/teams/${team.id}/projects/${project.id}`,
    scope: { teamId: team.id, projectId: project.id },
    visualSourceOptions,
  };
}
async function wait(c, base, id) {
  for (let i = 0; i < 100; i++) {
    const runs = (await c.request(base + "/runs")).data,
      r = runs.find((r) => r.id === id);
    if (r && !["running", "queued"].includes(r.status)) return r;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("timeout");
}
test("designer PDF URL attaches rendered images, creates scoped draft and applies only explicitly; backup preserves pages", async (t) => {
  const f = await setup(t);
  const response = await f.c.request(f.base + "/runs", "POST", {
    id: "pdf-style-test",
    role: "designer",
    model: "Codex",
    text: "請萃取 https://example.com/comic.pdf 的風格",
  });
  assert.equal(response.status, 202);
  const run = await wait(f.c, f.base, "pdf-style-test");
  assert.equal(run.status, "completed", JSON.stringify(run));
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].images, [png]);
  assert.ok(run.steps[0].skills.some((s) => s.id === "visual-pdf"));
  const styles = (await f.c.request(f.base + "/visual-styles")).data;
  assert.equal(styles.length, 1);
  assert.equal(styles[0].source.pageCount, 24);
  assert.match(run.steps[0].output, /抽樣/);
  const before = (await f.c.request(f.base + "/visual-profile")).data;
  assert.notEqual(before.palette, candidate.palette);
  assert.equal(
    (
      await f.c.request(f.base + "/visual-profile", "POST", {
        action: "apply-style",
        revision: before.revision,
        id: styles[0].id,
      })
    ).data.palette,
    candidate.palette,
  );
  assert.equal(
    (
      await f.c.request(
        `/teams/${f.scope.teamId}/projects/other-project/visual-styles`,
      )
    ).data.length,
    0,
  );
  const svc = new VisualSources(f.app.store, f.visualSourceOptions);
  assert.throws(
    () =>
      svc.get({ ...f.scope, projectId: "other-project" }, styles[0].sourceId),
    /不存在/,
  );
  const backup = await f.app.backups.snapshot();
  await f.app.backups.restore(backup.id);
  const restored = svc.get(f.scope, styles[0].sourceId);
  assert.equal(restored.status, "ready");
  assert.deepEqual(readFileSync(svc.images(f.scope, restored.id)[0]), png);
});
test("uploaded image flow scopes source and passes actual bytes; malformed style is not saved", async (t) => {
  const f = await setup(t),
    svc = new VisualSources(f.app.store, f.visualSourceOptions);
  const upload = await f.c.request(f.base + "/visual-sources", "POST", {
    name: "test.png",
    base64: png.toString("base64"),
  });
  assert.equal(upload.status, 200);
  await f.c.request(f.base + "/runs", "POST", {
    id: "image-style-test",
    role: "designer",
    model: "Codex",
    text: "請萃取風格",
    visualSourceId: upload.data.id,
  });
  const run = await wait(f.c, f.base, "image-style-test");
  assert.equal(run.status, "completed");
  assert.deepEqual(f.calls[0].images, [png]);
  assert.ok(run.steps[0].skills.some((s) => s.id === "visual-image"));
  const source = svc.get(f.scope, upload.data.id);
  assert.equal(
    svc.saveStyle(
      { ...f.scope, id: "invalid" },
      source,
      { id: "invalid" },
      JSON.stringify({
        ...candidate,
        observations: [{ page: 99, detail: "不存在的頁面" }],
      }),
    ),
    null,
  );
  assert.equal(
    (
      await f.c.request(f.base + "/visual-sources", "POST", {
        name: "bad",
        base64: Buffer.from("not image").toString("base64"),
      })
    ).status,
    400,
  );
});
test("Instagram unavailable returns failure, no style or fictitious images", async (t) => {
  const f = await setup(t, {
    fetchMedia: async () => ({
      bytes: Buffer.from("<html>Login</html>"),
      mime: "text/html",
    }),
  });
  await f.c.request(f.base + "/runs", "POST", {
    id: "ig-style-test",
    role: "designer",
    model: "Codex",
    text: "分析 https://www.instagram.com/p/example/ 的風格",
  });
  const run = await wait(f.c, f.base, "ig-style-test");
  assert.equal(run.steps[0].visualSource.status, "failed");
  assert.equal(f.calls.length, 0);
  assert.equal((await f.c.request(f.base + "/visual-styles")).data.length, 0);
  assert.match(run.steps[0].output, /未建立風格草稿/);
});
test("public media rejects private DNS, credentials and non HTTPS before requests", async () => {
  await assert.rejects(
    fetchPublicMedia("https://example.com/x.pdf", {
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    /公開網路/,
  );
  await assert.rejects(
    fetchPublicMedia("https://user:secret@example.com/x.pdf"),
    /HTTPS/,
  );
  await assert.rejects(fetchPublicMedia("http://example.com/x.pdf"), /HTTPS/);
});
