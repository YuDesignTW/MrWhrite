import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleContext, TraceStore } from "../server/context-trace.mjs";
import { Store } from "../server/store.mjs";
import { WorkflowStore, digest } from "../server/workflow-store.mjs";
test("context slices, always includes policy, excludes activity/history, redacts before sending and rejects skill truncation", () => {
  const run = {
    workflow: "topic-choice",
    context: {
      guardrails: "POLICY",
      memory: "MEMORY",
      references: [{ content: "EVIDENCE" }],
      activity: "ACTIVITY",
    },
    history: ["HISTORY"],
    contextOrigins: { guardrails: "vault" },
  };
  const a = assembleContext({
    run,
    role: "writer",
    task: "Bearer verysecrettoken",
    skills: [],
  });
  assert.match(a.prompt, /POLICY/);
  assert.match(a.prompt, /MEMORY/);
  assert.doesNotMatch(a.prompt, /ACTIVITY|HISTORY|EVIDENCE|verysecrettoken/);
  assert.equal(a.promptHash, digest(a.prompt));
  assert.throws(
    () =>
      assembleContext({
        run,
        role: "writer",
        task: "x",
        skills: [{ id: "too-large", content: "x".repeat(45001) }],
      }),
    /未截斷/,
  );
  const b = assembleContext({
    run,
    role: "research",
    task: "read",
    skills: [],
  });
  assert.match(b.prompt, /不可信資料/);
  assert.match(b.prompt, /EVIDENCE/);
  assert.doesNotMatch(b.prompt, /MEMORY/);
});
test("trace reconstructs exact prompt, retains skill snapshot and preserves scope", () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-")),
    raw = new Store(dir),
    db = new WorkflowStore(raw),
    traces = new TraceStore(db, dir);
  try {
    const run = {
      id: "r",
      teamId: "t",
      projectId: "p",
      dataEpoch: "e",
      context: { guardrails: "policy" },
    };
    const assembled = assembleContext({
      run,
      role: "writer",
      task: "write",
      skills: [{ id: "skill", version: "1", content: "instructions" }],
    });
    const t = traces.start(run, { id: "step", role: "writer" }, assembled);
    traces.finish(run, t, {
      output: "result",
      usage: { input_tokens: 2, output_tokens: 3 },
    });
    assert.equal(traces.list(run)[0].payload.prompt, assembled.prompt);
    assert.equal(traces.list(run)[0].payload.skills[0].content, "instructions");
    assert.equal(traces.list({ ...run, projectId: "other" }).length, 0);
    assert.equal(traces.list(run)[1].usage.input_tokens, 2);
  } finally {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("expired prompt payloads are removed while trace metadata remains inspectable", () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-expiry-")),
    raw = new Store(dir),
    db = new WorkflowStore(raw),
    traces = new TraceStore(db, dir);
  try {
    const run = { id: "r", teamId: "t", projectId: "p", dataEpoch: "e" };
    const entry = traces.start(
      run,
      { id: "s", role: "writer" },
      assembleContext({ run, role: "writer", task: "hello", skills: [] }),
    );
    const expired = { ...entry, expiresAt: "2000-01-01T00:00:00.000Z" };
    raw.db
      .prepare("UPDATE trace SET data=? WHERE id=?")
      .run(JSON.stringify(expired), entry.id);
    const rows = traces.list(run);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload, null);
    assert.equal(rows[0].promptHash, entry.promptHash);
  } finally {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
