import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  renameSync,
  lstatSync, cpSync, rmSync,
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
    for(const root of ['team-projects','team-artifacts','trace-payloads']){
      const walk=(path,relative)=>{if(!existsSync(path))return;const st=lstatSync(path);if(st.isSymbolicLink())throw fail('備份拒絕符號連結。');if(st.isDirectory()){for(const name of readdirSync(path))walk(join(path,name),relative+'/'+name);}else{const dest=join(dir,'assets',relative);mkdirSync(resolve(dest,'..'),{recursive:true});const data=readFileSync(path);writeFileSync(dest,data);files['assets/'+relative]=hash(data);}};
      walk(join(this.store.dir,root),root);
    }
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
          file.split("/").some((_,i,a)=>lstatSync(join(dir,...a.slice(0,i+1))).isSymbolicLink()) ||
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
              "publication", "teamRun", "teamWorkspace", "teamBlueprintVersion", "teamFile", "teamKnowledgePage", "teamSources", "teamTracking", "researchSubscription", "researchArticle", "researchWatch", "researchDiscovery", "teamWriting", "teamVisual", "teamVisualImage", "teamVisualSource", "teamVisualStyle", "contentBinding", "contentMigration", "localAccount", "localSchedule", "topicBatch", "performanceDataset",
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
        const engineTables={};for(const table of ['run','node_run','artifact','trace','gate','event'])if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))engineTables[table]=db.prepare('SELECT * FROM "'+table+'"').all();
        for(const rows of Object.values(engineTables))for(const row of rows){const value=JSON.parse(row.data);if(value.id!==row.id||value.teamId!==row.team_id||value.projectId!==row.project_id||value.dataEpoch!==row.epoch)throw Error('Invalid engine scope');}
        return { ...m, records,engineTables };
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
    const restoreEpoch=uid(), backupEpoch=JSON.parse(m.records.find(r=>r.kind==='settings'&&r.id==='main').data).epoch;
    const moved=[],staging=join(this.root,'.restore-'+uid());mkdirSync(staging);
    for(const root of ['team-projects','team-artifacts','trace-payloads']){const src=join(this.root,id,'assets',root),target=join(staging,root);if(existsSync(src))cpSync(src,target,{recursive:true});else mkdirSync(target);}
    const epochFolder=join(staging,'team-projects',backupEpoch);if(existsSync(epochFolder))renameSync(epochFolder,join(staging,'team-projects',restoreEpoch));
    const transform=value=>{if(Array.isArray(value))return value.map(transform);if(value&&typeof value==='object'){const copy=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v)]));if(copy.dataEpoch===backupEpoch)copy.dataEpoch=restoreEpoch;return copy;}return value;};
    const hook=this.store.onRecord;this.store.onRecord=null;
    try{
    for(const root of ['team-projects','team-artifacts','trace-payloads']){const target=join(this.store.dir,root),archive=target+'-before-restore-'+restoreEpoch;if(existsSync(target))renameSync(target,archive);moved.push({target,archive});renameSync(join(staging,root),target);}
    this.store.tx(() => {
      this.store.db.exec("DELETE FROM records");
      for (const r of m.records) {
        const v = /^(team|local|content|performance|research)/.test(r.kind) ? transform(JSON.parse(r.data)) : JSON.parse(r.data);
        if (
          ["operation", "agentRun", "teamRun"].includes(r.kind) &&
          ["running","queued"].includes(v.status)
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
        if (["teamTracking","researchSubscription","researchWatch"].includes(r.kind)) {v.enabled=false;v.nextCheckAt=null;}
        this.store.put(r.kind, v);
      }
      const settings = this.store.get("settings", "main");
      this.store.put("settings", {
        ...settings,
        epoch: restoreEpoch,
        backupEnabled: false,
        nextBackup: null,
      });
      for(const table of ['run','node_run','artifact','trace','gate','event']){
        if(!this.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
        this.store.db.exec('DELETE FROM "'+table+'"');
        for(const row of m.engineTables[table]||[]){const value=transform(JSON.parse(row.data));if(['run','node_run'].includes(table)&&['running','queued'].includes(value.status))value.status='interrupted';this.store.db.prepare('INSERT INTO "'+table+'" VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.run_id,row.team_id,row.project_id,row.epoch===backupEpoch?restoreEpoch:row.epoch,value.status||row.status,row.created_at,JSON.stringify(value));}
      }
    });
    }catch(e){for(const {target,archive} of moved.reverse()){if(existsSync(target))rmSync(target,{recursive:true,force:true});if(existsSync(archive))renameSync(archive,target);}throw e;}finally{this.store.onRecord=hook;rmSync(staging,{recursive:true,force:true});}
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
