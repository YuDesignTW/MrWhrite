import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { client } from "./http-helper.mjs";
const f = JSON.parse(
  readFileSync(
    new URL("./fixtures/team-acceptance-contract.json", import.meta.url),
  ),
);
const tick = () => new Promise((r) => setImmediate(r));
const base = "/teams/t/projects/p/runs";
test("API resume after restart preserves writer, search, research and choices; scopes and duplicate resume protected", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "resume-"));
  let app,
    fail = true,
    searches = 0;
  const calls = [];
  const runner = (prompt) => {
    const role = prompt.match(/的 (\w+)。/)[1];
    calls.push(role);
    return {
      promise:
        role === "designer" && fail
          ? Promise.reject(Error("injected failure"))
          : Promise.resolve({
              content:
                role === "director"
                  ? prompt.includes("依研究報告提出3")
                    ? JSON.stringify(f.topics)
                    : "完成"
                  : f.outputs[role][0],
            }),
      cancel() {},
    };
  };
  const options = {
    dir,
    runner,
    teamOptions: {
      engineEnabled: true,
      trendSearch: async () => {
        searches++;
        return structuredClone(f.search);
      },
      renderCarousel: async ({ copy }) => {
        assert.deepEqual(copy, JSON.parse(f.outputs.writer[0]));
        return copy.slides.map((_, i) => ({ width:1080,height:1350,sha256:"a".repeat(64),name: `${i}.png` }));
      },
    },
  };
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  app = createApp(options);
  let c = await client(app.app);
  await c.request("/settings", "PATCH", { aiConsent: true });
  await c.request(base, "POST", {
    id: "resume",
    role: "director",
    text: "推薦內容",
    model: "Codex",
  });
  await tick();
  const run = (await c.request(base)).data[0];
  await c.request(base + "/resume/select", "POST", {
    topicId: run.topics[0].id,
  });
  await tick();
  let failed = (await c.request(base)).data[0];
  assert.equal(failed.status, "failed");
  assert.ok(failed.productionCopy);
  assert.equal(failed.engineVersion, 1);
  const before = calls.slice();
  await app.close();
  app = createApp(options);
  c = await client(app.app);
  fail = false;
  assert.equal(
    (await c.request("/teams/other/projects/p/runs/resume/resume", "POST", {}))
      .status,
    404,
  );
  assert.equal(
    (await c.request(base + "/resume/resume", "POST", {})).status,
    202,
  );
  assert.equal(
    (await c.request(base + "/resume/resume", "POST", {})).status,
    409,
  );
  await tick();
  assert.equal((await c.request(base)).data[0].status, "completed");
  assert.deepEqual(calls.slice(before.length), ["designer", "director"]);
  assert.equal(searches, 1);
  const state = (await c.request(base + "/resume/engine")).data;
  assert.equal(state.nodes.find((n) => n.nodeId === "write").attempt, 1);
  assert.equal(state.nodes.find((n) => n.nodeId === "design").attempt, 2);
});
test("new engine requests queue while legacy work is active; queued cancellation prevents all calls", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "queue-"));
  let release,
    calls = 0;
  const app = createApp({
    dir,
    runner: () => ({
      promise: new Promise((r) => {
        calls++;
        release = r;
      }),
      cancel() {
        release({ content: "cancelled" });
      },
    }),
    teamOptions: {
      engineEnabled: true,
      trendSearch: async () => ({ sources: [] }),
    },
  });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app);
  await c.request("/settings", "PATCH", { aiConsent: true });
  await c.request(base, "POST", {
    id: "active",
    role: "writer",
    text: "write",
    model: "Codex",
  });
  await tick();
  assert.equal(
    (
      await c.request(base, "POST", {
        id: "queued",
        role: "research",
        text: "最新趨勢",
        model: "Codex",
      })
    ).data.status,
    "queued",
  );
  assert.equal(
    (await c.request(base)).data.find((r) => r.id === "queued").queuePosition,
    1,
  );
  assert.equal(
    (await c.request(base + "/queued/cancel", "POST", {})).data.status,
    "cancelled",
  );
  release({ content: "done" });
  await tick();
  assert.equal(calls, 1);
});
test("queued reports execute FIFO after active work finishes, with no extra model calls", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "queue-drain-"));
  let release;
  const searches = [];
  const app = createApp({
    dir,
    runner: () => ({
      promise: new Promise((r) => (release = r)),
      cancel() {
        release({ content: "cancelled" });
      },
    }),
    teamOptions: {
      engineEnabled: true,
      trendSearch: async ({ request }) => {
        searches.push(request);
        return { sources: [] };
      },
    },
  });
  t.after(() => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const c = await client(app.app);
  await c.request("/settings", "PATCH", { aiConsent: true });
  await c.request(base, "POST", {
    id: "active",
    role: "writer",
    text: "write",
    model: "Codex",
  });
  await tick();
  for (const id of ["first", "second"])
    assert.equal(
      (
        await c.request(base, "POST", {
          id,
          role: "research",
          text: id + "最新趨勢",
          model: "Codex",
        })
      ).data.status,
      "queued",
    );
  release({ content: "done" });
  await tick();
  await tick();
  assert.deepEqual(searches, ["first最新趨勢", "second最新趨勢"]);
  assert.ok(
    (await c.request(base)).data.every((r) => r.status === "completed"),
  );
});
test("director routing failure returns available configured workflows without specialist execution", async () => {
  const { executeBlueprint } = await import("../server/team-blueprint.mjs");
  for (const response of [
    "not JSON",
    JSON.stringify({ reply: "route", workflowId: "missing" }),
    new Error("model unavailable"),
  ]) {
    const run = {
      text: "task",
      teamDefinition: {
        workflows: [{ id: "known", name: "可用流程", steps: [] }],
      },
      steps: [],
    };
    let calls = 0;
    await executeBlueprint({
      run,
      invoke: async () => {
        calls++;
        if (response instanceof Error) throw response;
        return response;
      },
      persist() {},
      signal: new AbortController().signal,
    });
    assert.equal(calls, 1);
    assert.equal(run.routingFallback, true);
    assert.match(run.output, /known/);
    assert.match(run.output, /可用流程/);
  }
});
