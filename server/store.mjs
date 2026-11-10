import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.db = new DatabaseSync(join(dir, "database.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO migrations VALUES(1);
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));`);
    this.tx(() => {
      for (const op of this.all("operation").filter(
        (o) => o.status === "running",
      ))
        this.put("operation", {
          ...op,
          status: "interrupted",
          error: "本機服務已重新啟動，原文保留。請手動重試。",
        });
    });
    if (!this.get("settings", "main"))
      this.put("settings", {
        id: "main",
        animation: true,
        wordCount: true,
        aiConsent: false,
        backupRemote: "",
        backupEnabled: false,
        backupVerified: "",
        nextBackup: null,
        epoch: uid(),
      });
    if (!this.get("voiceConfig", "main"))
      this.put("voiceConfig", { id: "main", active: null, enabled: false });
  }
  all(kind) {
    return this.db
      .prepare("SELECT data FROM records WHERE kind=?")
      .all(kind)
      .map((x) => JSON.parse(x.data));
  }
  get(kind, id) {
    const r = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return r ? JSON.parse(r.data) : null;
  }
  put(kind, value) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  tx(fn) {
    const depth = this.depth || 0,
      savepoint = "nested_" + depth;
    this.depth = depth + 1;
    this.db.exec(depth ? "SAVEPOINT " + savepoint : "BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec(depth ? "RELEASE " + savepoint : "COMMIT");
      return result;
    } catch (e) {
      if (depth) {
        this.db.exec("ROLLBACK TO " + savepoint);
        this.db.exec("RELEASE " + savepoint);
      } else this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth = depth;
    }
  }
  article(id) {
    const a = this.get("article", id);
    if (!a) throw fail("找不到文章。", 404);
    return a;
  }
  locked(id) {
    return this.all("operation").some(
      (o) =>
        o.articleId === id && o.status === "running" && o.kind !== "writing",
    );
  }
  create(id = uid()) {
    if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id))
      throw fail("文章識別碼無效。");
    return (
      this.get("article", id) ||
      this.put("article", {
        id,
        title: "",
        body: "",
        revision: 0,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null,
      })
    );
  }
  update(id, input, source = "manual", allowLocked = false) {
    return this.tx(() => {
      const a = this.article(id);
      if (a.deletedAt) throw fail("文章已移至垃圾桶。", 409);
      if (!allowLocked && this.locked(id))
        throw fail("這篇文章正在由 AI 修改，請先停止。", 423);
      if (a.revision !== input.baseRevision)
        throw fail("另一個分頁已更新文章。你的內容仍保留，可另存新文章。", 409);
      if (
        typeof input.title !== "string" ||
        typeof input.body !== "string" ||
        input.title.length > 500 ||
        input.body.length > 500000
      )
        throw fail("文章格式不正確，或內容超過 500,000 字元。");
      if (a.title === input.title && a.body === input.body) return a;
      this.put("revision", {
        ...a,
        id: uid(),
        articleId: id,
        source,
        savedAt: now(),
      });
      return this.put("article", {
        ...a,
        title: input.title,
        body: input.body,
        revision: a.revision + 1,
        updatedAt: now(),
      });
    });
  }
  voice() {
    return {
      samples: this.all("sample").filter((s) => !s.excluded),
      versions: this.all("voiceVersion").sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      config: this.get("voiceConfig", "main"),
    };
  }
  dump() {
    return this.db.prepare("SELECT kind,id,data FROM records").all();
  }
  close() {
    this.db.close();
  }
}
export function applyRange(article, op, result) {
  if (
    article.revision !== op.baseRevision ||
    hash(article.body.slice(op.from, op.to)) !== op.selectionHash
  )
    throw fail("文章版本已變更，AI 結果已保留，未覆蓋原文。", 409);
  return article.body.slice(0, op.from) + result + article.body.slice(op.to);
}
export function validateRange(a, from, to) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from > to ||
    to > a.body.length
  )
    throw fail("選取範圍已失效。");
  for (const n of [from, to])
    if (
      n > 0 &&
      n < a.body.length &&
      /[\uD800-\uDBFF]/.test(a.body[n - 1]) &&
      /[\uDC00-\uDFFF]/.test(a.body[n])
    )
      throw fail("選取範圍不可切開 emoji。");
}
