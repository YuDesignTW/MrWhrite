import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Store,
  applyRange,
  validateRange,
  hash,
  uid,
} from "../server/store.mjs";
import { Backups, markdown, validateRemote } from "../server/backups.mjs";
const setup = () => new Store(mkdtempSync(join(tmpdir(), "mr-white-test-")));
test("中文、emoji、Markdown 持久保存，過期寫入拒絕且歷史可用", () => {
  const s = setup(),
    a = s.create(),
    original = "# 繁體中文\n\n早安🌿，今天好嗎？\n```js\nconst x = 1\n```";
  const b = s.update(a.id, {
    baseRevision: 0,
    title: "台灣的日常",
    body: original,
  });
  assert.equal(b.revision, 1);
  assert.throws(
    () => s.update(a.id, { baseRevision: 0, title: "過期", body: "壞資料" }),
    { status: 409 },
  );
  assert.equal(s.article(a.id).body, original);
  assert.equal(s.all("revision").length, 1);
  const dir = s.dir;
  s.close();
  const again = new Store(dir);
  assert.equal(again.article(a.id).body, original);
  assert.equal(
    markdown(again.article(a.id)),
    "# 台灣的日常\n\n" + original + "\n",
  );
  again.close();
});
test("AI UTF-16 選取只替換指定段落，拒絕 emoji 切半與過期版本", () => {
  const a = { body: "前文🌿中文後文", revision: 7 };
  validateRange(a, 2, 6);
  const op = {
    baseRevision: 7,
    from: 2,
    to: 6,
    selectionHash: hash(a.body.slice(2, 6)),
  };
  assert.equal(applyRange(a, op, "新內容"), "前文新內容後文");
  assert.throws(() => validateRange(a, 3, 6));
  assert.throws(() => applyRange({ ...a, revision: 8 }, op, "錯誤"), {
    status: 409,
  });
  assert.throws(() =>
    applyRange(a, { ...op, selectionHash: "invalid" }, "錯誤"),
  );
});
test("AI 伺服器鎖阻止其他分頁修改；重新啟動標記中斷，不重送", () => {
  const s = setup(),
    a = s.create();
  s.put("operation", { id: uid(), articleId: a.id, status: "running" });
  assert.throws(
    () => s.update(a.id, { baseRevision: 0, title: "", body: "另一分頁" }),
    { status: 423 },
  );
  const dir = s.dir;
  s.close();
  const again = new Store(dir);
  assert.equal(again.all("operation")[0].status, "interrupted");
  assert.equal(again.locked(a.id), false);
  assert.equal(again.article(a.id).body, "");
  again.close();
});
test("新增冪等、文章識別碼安全、資料交易回滾", () => {
  const s = setup();
  s.create("one");
  s.create("one");
  assert.equal(s.all("article").length, 1);
  assert.throws(() => s.create("../../outside"));
  assert.throws(() =>
    s.tx(() => {
      s.put("article", { id: "rollback" });
      throw Error("fail");
    }),
  );
  assert.equal(s.get("article", "rollback"), null);
  s.close();
});
test("一致性快照與完整還原保留文章、版本、語氣並更新 epoch", async () => {
  const s = setup(),
    a = s.create();
  s.update(a.id, { baseRevision: 0, title: "備份測試", body: "原始內容🌿" });
  s.put("sample", { id: "sample", body: "我的例文" });
  s.put("voiceVersion", {
    id: "voice",
    rules: "短段落",
    sampleIds: ["sample"],
  });
  s.put("voiceConfig", { id: "main", enabled: true, active: "voice" });
  const b = new Backups(s),
    m = await b.snapshot();
  s.update(a.id, { baseRevision: 1, title: "備份後編輯", body: "現在內容" });
  const oldEpoch = s.get("settings", "main").epoch;
  const verified = b.verify(m.id);
  assert.equal(verified.articleCount, 1);
  assert.equal(
    readFileSync(join(b.root, m.id, "articles", a.id + ".md"), "utf8"),
    "# 備份測試\n\n原始內容🌿\n",
  );
  await b.restore(m.id);
  assert.equal(s.article(a.id).body, "原始內容🌿");
  assert.equal(s.all("revision").length, 1);
  assert.equal(s.voice().config.active, "voice");
  assert.notEqual(s.get("settings", "main").epoch, oldEpoch);
  assert.equal(b.list().length, 2);
  s.close();
});
test("損壞與路徑偽造的備份不可覆蓋資料", async () => {
  const s = setup(),
    a = s.create(),
    b = new Backups(s),
    m = await b.snapshot();
  writeFileSync(join(b.root, m.id, "database.sqlite"), "corrupt");
  assert.throws(() => b.verify(m.id));
  await assert.rejects(() => b.restore(m.id));
  assert.equal(s.article(a.id).id, a.id);
  assert.throws(() => b.verify("../outside"));
  s.close();
});
test("Drive remote 限制專用子路徑，不能成為 shell 指令或任意本機路徑", () => {
  assert.equal(validateRemote("gdrive:mr-white"), "gdrive:mr-white");
  for (const s of [
    "/tmp",
    "gdrive:",
    "gdrive:../../secret",
    "gdrive:a; rm -rf /",
    "--config:/tmp/evil",
  ])
    assert.throws(() => validateRemote(s));
});

test("Drive 上傳需先 copy、再校驗、最後寫 COMPLETE；校驗失敗不標成功", async () => {
  const s = setup();
  s.put("settings", {
    ...s.get("settings", "main"),
    backupRemote: "gdrive:mr-white",
  });
  const calls = [];
  const b = new Backups(s, {
    executor: async (_bin, args) => {
      calls.push(args);
      return { stdout: "" };
    },
  });
  await b.upload();
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["copy", "check", "copyto"],
  );
  assert.ok(calls[0].includes("COMPLETE"));
  assert.ok(calls[1].includes("--download"));
  assert.equal(s.get("settings", "main").backupVerified, "gdrive:mr-white");
  const last = s.get("settings", "main").lastBackup;
  const broken = new Backups(s, {
    executor: async (_bin, args) => {
      if (args[0] === "check") throw Error("interrupted");
      return { stdout: "" };
    },
  });
  await assert.rejects(() => broken.upload());
  assert.equal(s.get("settings", "main").lastBackup, last);
  assert.ok(b.list().some((x) => x.status === "failed"));
  assert.ok(b.list().some((x) => x.status === "complete"));
  s.close();
});

test("Drive 清單只辨識自身快照，下載先驗證後納入可還原清單", async () => {
  const source = setup(),
    sourceBackups = new Backups(source);
  const a = source.create();
  source.update(a.id, { baseRevision: 0, title: "雲端恢復測試", body: "原文" });
  const m = await sourceBackups.snapshot();
  const target = setup();
  target.put("settings", {
    ...target.get("settings", "main"),
    backupRemote: "gdrive:mr-white",
  });
  const { cpSync } = await import("node:fs");
  const remote = new Backups(target, {
    executor: async (_bin, args) => {
      if (args[0] === "lsf") return { stdout: m.id + "/\nunrelated-folder/\n" };
      if (args[0] === "copy")
        cpSync(join(sourceBackups.root, m.id), args[2], { recursive: true });
      return { stdout: "" };
    },
  });
  assert.deepEqual(await remote.remoteList(), [m.id]);
  const downloaded = await remote.download(m.id);
  assert.equal(downloaded.articleCount, 1);
  assert.equal(target.all("article").length, 0);
  await remote.restore(m.id);
  assert.equal(target.article(a.id).body, "原文");
  source.close();
  target.close();
});
