import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uid, now, hash, fail } from "./store.mjs";
const exec = promisify(execFile);
export const markdown = (a) =>
  (a.title ? `# ${a.title}\n\n` : "") + a.body + "\n";
export function validateRemote(remote) {
  if (
    typeof remote !== "string" ||
    !/^[A-Za-z0-9_][\w-]*:[\w][\w\-/ ]*$/.test(remote) ||
    remote.includes("..")
  )
    throw fail(
      "請填寫已授權的 rclone remote 與專用子資料夾，例如 gdrive:mr-white。",
    );
  return remote;
}
export class Backups {
  constructor(store, { executor = exec } = {}) {
    this.exec = executor;
    this.store = store;
    this.root = join(store.dir, "backups");
    mkdirSync(this.root, { recursive: true });
    this.busy = false;
  }
  async snapshot(reason = "manual") {
    const id = `backup-${Date.now()}-${uid().slice(0, 8)}`,
      dir = resolve(this.root, id);
    mkdirSync(dir);
    // VACUUM INTO produces a transactionally consistent, stand-alone SQLite file.
    this.store.db.prepare("VACUUM INTO ?").run(join(dir, "database.sqlite"));
    const db = new DatabaseSync(join(dir, "database.sqlite"), {
      readOnly: true,
    });
    const records = db.prepare("SELECT kind,id,data FROM records").all();
    db.close();
    const all = (k) =>
      records.filter((r) => r.kind === k).map((r) => JSON.parse(r.data));
    const files = {};
    const save = (file, data) => {
      writeFileSync(join(dir, file), data);
      files[file] = hash(data);
    };
    files["database.sqlite"] = hash(readFileSync(join(dir, "database.sqlite")));
    mkdirSync(join(dir, "articles"));
    mkdirSync(join(dir, "voice"));
    for (const a of all("article")) save(`articles/${a.id}.md`, markdown(a));
    save("voice/samples.json", JSON.stringify(all("sample")));
    save("voice/versions.json", JSON.stringify(all("voiceVersion")));
    save("voice/active-profile.json", JSON.stringify(all("voiceConfig")));
    save("settings-public.json", JSON.stringify(all("settings")));
    const manifest = {
      app: "mr-white",
      schemaVersion: 1,
      appVersion: "0.1.0",
      id,
      createdAt: now(),
      reason,
      articleCount: all("article").filter((a) => !a.deletedAt).length,
      files,
    };
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    writeFileSync(
      join(dir, "COMPLETE"),
      hash(JSON.stringify(manifest, null, 2)),
    );
    this.store.put("backup", {
      id,
      createdAt: manifest.createdAt,
      status: "local",
      articleCount: manifest.articleCount,
      reason,
    });
    return manifest;
  }
  verify(id, stagingDir) {
    if (!/^backup-\d+-[a-f\d]{8}$/.test(id)) throw fail("備份識別碼無效。");
    const dir = stagingDir || join(this.root, id);
    try {
      const raw = readFileSync(join(dir, "manifest.json"), "utf8");
      const m = JSON.parse(raw);
      if (
        m.app !== "mr-white" ||
        m.schemaVersion !== 1 ||
        m.id !== id ||
        readFileSync(join(dir, "COMPLETE"), "utf8") !== hash(raw)
      )
        throw Error();
      for (const [file, checksum] of Object.entries(m.files)) {
        if (
          file.includes("..") ||
          file.startsWith("/") ||
          hash(readFileSync(join(dir, file))) !== checksum
        )
          throw Error();
      }
      if (!m.files["database.sqlite"]) throw Error();
      const db = new DatabaseSync(join(dir, "database.sqlite"), {
        readOnly: true,
      });
      try {
        if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
          throw Error();
        const records = db.prepare("SELECT kind,id,data FROM records").all();
        for (const r of records) {
          const value = JSON.parse(r.data);
          if (
            ![
              "article",
              "revision",
              "sample",
              "voiceVersion",
              "voiceConfig",
              "settings",
              "operation",
              "work",
              "workRevision",
              "workPublication",
              "metricSnapshot",
              "agentMessage",
              "agentDraft",
              "agentRun",
              "agentPreference",
              "backup",
              "socialPost",
              "socialSource",
              "collectionConfig",
              "collectionRun",
              "articleSource",
              "publication",
            ].includes(r.kind) ||
            value.id !== r.id
          )
            throw Error();
          if (
            r.kind === "article" &&
            (!/^[\w-]{1,80}$/.test(value.id) ||
              typeof value.body !== "string" ||
              typeof value.title !== "string" ||
              !Number.isInteger(value.revision))
          )
            throw Error();
        }
        if (!records.some((r) => r.kind === "settings" && r.id === "main"))
          throw Error();
        return { ...m, records };
      } finally {
        db.close();
      }
    } catch {
      throw fail("備份缺少完成標記、校驗失敗或版本不相容，未更動目前資料。");
    }
  }
  async restore(id) {
    const m = this.verify(id);
    await this.snapshot("before-restore");
    this.store.tx(() => {
      this.store.db.exec("DELETE FROM records");
      for (const r of m.records) {
        const v = JSON.parse(r.data);
        if (
          ["operation", "agentRun"].includes(r.kind) &&
          v.status === "running"
        ) {
          v.status = "interrupted";
          v.error = "從備份還原，任務不會自動重送。";
        }
        if (
          r.kind === "publication" &&
          ["queued", "publishing", "unknown"].includes(v.status)
        ) {
          v.status = v.status === "queued" ? "missed" : "unknown";
          v.error = "從備份還原，請先查核平台再重新安排。";
        }
        if (r.kind === "collectionRun" && v.status === "running")
          v.status = "failed";
        if (r.kind === "collectionConfig") v.enabled = false;
        this.store.put(r.kind, v);
      }
      const settings = this.store.get("settings", "main");
      this.store.put("settings", {
        ...settings,
        epoch: uid(),
        backupEnabled: false,
        nextBackup: null,
      });
    });
    return { ok: true };
  }
  async status() {
    try {
      const { stdout } = await this.exec("rclone", ["listremotes"], {
        timeout: 10000,
      });
      return {
        available: true,
        remotes: stdout.trim().split("\n").filter(Boolean),
      };
    } catch {
      return { available: false, remotes: [] };
    }
  }
  async remoteList() {
    const remote = validateRemote(
      this.store.get("settings", "main").backupRemote,
    );
    try {
      const { stdout } = await this.exec(
        "rclone",
        ["lsf", remote, "--dirs-only", "--max-depth", "1"],
        { timeout: 30000 },
      );
      return stdout
        .split("\n")
        .map((s) => s.replace(/\/$/, ""))
        .filter((s) => /^backup-\d+-[a-f\d]{8}$/.test(s))
        .sort()
        .reverse();
    } catch {
      throw fail("無法讀取 Drive 備份清單，請檢查 remote、授權與網路。");
    }
  }
  async download(id) {
    if (!/^backup-\d+-[a-f\d]{8}$/.test(id)) throw fail("備份識別碼無效。");
    if (existsSync(join(this.root, id))) return this.verify(id);
    const remote = validateRemote(
      this.store.get("settings", "main").backupRemote,
    );
    const staging = join(this.root, ".download-" + uid());
    mkdirSync(staging);
    try {
      await this.exec(
        "rclone",
        ["copy", remote + "/" + id, staging, "--timeout", "60s"],
        { timeout: 180000 },
      );
      const m = this.verify(id, staging);
      renameSync(staging, join(this.root, id));
      this.store.put("backup", {
        id,
        createdAt: m.createdAt,
        status: "local",
        articleCount: m.articleCount,
        reason: "download",
      });
      return m;
    } catch (e) {
      throw fail("下載或校驗失敗，未更動目前資料。");
    }
  }
  async upload() {
    if (this.busy) throw fail("已有備份正在進行。", 409);
    this.busy = true;
    let m;
    try {
      const s = this.store.get("settings", "main");
      const remote = validateRemote(s.backupRemote);
      m = await this.snapshot("drive");
      this.store.put("backup", {
        ...this.store.get("backup", m.id),
        status: "uploading",
        remote,
      });
      const destination = `${remote}/${m.id}`,
        dir = join(this.root, m.id);
      await this.exec(
        "rclone",
        ["copy", dir, destination, "--exclude", "COMPLETE", "--timeout", "60s"],
        { timeout: 180000 },
      );
      await this.exec(
        "rclone",
        [
          "check",
          dir,
          destination,
          "--exclude",
          "COMPLETE",
          "--one-way",
          "--download",
        ],
        { timeout: 180000 },
      );
      await this.exec(
        "rclone",
        ["copyto", join(dir, "COMPLETE"), `${destination}/COMPLETE`],
        { timeout: 60000 },
      );
      this.store.put("backup", {
        ...this.store.get("backup", m.id),
        status: "complete",
        completedAt: now(),
      });
      const latest = this.store.get("settings", "main");
      this.store.put("settings", {
        ...latest,
        backupVerified: remote,
        lastBackup: now(),
        lastBackupError: null,
        nextBackup: new Date(Date.now() + 86400000).toISOString(),
      });
      return m;
    } catch (e) {
      if (m)
        this.store.put("backup", {
          ...this.store.get("backup", m.id),
          status: "failed",
          error: "上傳或校驗失敗，本機快照仍保留。",
        });
      throw fail("Drive 備份未完成，請確認 rclone 授權、資料夾與網路。");
    } finally {
      this.busy = false;
    }
  }
  list() {
    return readdirSync(this.root)
      .filter((id) => existsSync(join(this.root, id, "COMPLETE")))
      .map((id) => {
        try {
          const m = JSON.parse(
            readFileSync(join(this.root, id, "manifest.json"), "utf8"),
          );
          return { ...m, ...this.store.get("backup", id), files: undefined };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
