import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { initialState } from "../src/team-state.mjs";
import { client } from "./http-helper.mjs";
test("knowledge page import persists real text, deduplicates URLs, scopes search and refuses stale epochs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-pages-")),
    app = createApp({ dir }),
    c = await client(app.app);
  try {
    const state = initialState(),
      t = state.teams[0],
      p = t.projects[0];
    await c.request("/team-workspace", "PUT", { revision: 0, state });
    const vault = app.store.projectVault;
    const reader = async () => ({
      title: "公司技術",
      summary: "放射藥物研發技術資料",
      collectedAt: "2026-11-17T00:00:00Z",
      evidence: "來源主張",
      limitations: "未讀圖片",
    });
    await vault.importPage(
      t.id,
      p.id,
      "https://example.com/about#intro",
      reader,
    );
    await vault.importPage(t.id, p.id, "https://example.com/about", reader);
    assert.equal(
      vault.knowledge(t.id, p.id).resources.filter((x) => x.kind === "webpage")
        .length,
      1,
    );
    const found = vault.searchPages(t.id, p.id, "放射藥物");
    assert.equal(found.length, 1);
    assert.match(found[0].content, /https:\/\/example.com\/about/);
    assert.equal(vault.searchPages(t.id, p.id, "unrelated").length, 0);
    await assert.rejects(
      vault.importPage(t.id, "missing", "https://example.com", reader),
      /找不到專案/,
    );
    assert.throws(
      () => vault.searchPages(t.id, "missing", "放射"),
      /找不到專案/,
    );
    await assert.rejects(
      vault.importPage(t.id, p.id, "https://127.0.0.1/"),
      /公開HTTPS/,
    );
    assert.equal(vault.document(t.id, p.id, "memory").content, p.memory || "");
  } finally {
    app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
