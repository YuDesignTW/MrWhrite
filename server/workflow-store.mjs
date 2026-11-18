import { randomUUID, createHash } from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tables = new Set([
  "run",
  "node_run",
  "artifact",
  "trace",
  "gate",
  "event",
]);
export class WorkflowStore {
  constructor(store) {
    this.store = store;
    store.db.exec(
      [...tables]
        .map(
          (t) =>
            `CREATE TABLE IF NOT EXISTS "${t}" (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, team_id TEXT NOT NULL, project_id TEXT NOT NULL, epoch TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS "${t}_scope" ON "${t}"(team_id,project_id,epoch,status,created_at); CREATE INDEX IF NOT EXISTS "${t}_run" ON "${t}"(run_id,created_at);`,
        )
        .join("\n"),
    );
  }
  table(t) {
    if (!tables.has(t)) throw Error("Unknown workflow table");
    return `"${t}"`;
  }
  scope(s) {
    return [s.teamId, s.projectId, s.dataEpoch];
  }
  get(t, id, s) {
    const row = this.store.db
      .prepare(
        `SELECT data FROM ${this.table(t)} WHERE id=? AND team_id=? AND project_id=? AND epoch=?`,
      )
      .get(id, ...this.scope(s));
    return row ? JSON.parse(row.data) : null;
  }
  list(t, s, runId) {
    return this.store.db
      .prepare(
        `SELECT data FROM ${this.table(t)} WHERE team_id=? AND project_id=? AND epoch=? ${runId ? "AND run_id=?" : ""} ORDER BY ${t === "event" ? "rowid" : "created_at,rowid"}`,
      )
      .all(...this.scope(s), ...(runId ? [runId] : []))
      .map((r) => JSON.parse(r.data));
  }
  put(t, value) {
    const immutable = ["event", "artifact", "trace"].includes(t);
    const written = this.store.db
      .prepare(
        `INSERT INTO ${this.table(t)} VALUES(?,?,?,?,?,?,?,?) ${immutable ? "" : `ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data WHERE team_id=excluded.team_id AND project_id=excluded.project_id AND epoch=excluded.epoch`}`,
      )
      .run(
        value.id,
        value.runId || value.id,
        ...this.scope(value),
        value.status || "saved",
        value.createdAt || new Date().toISOString(),
        JSON.stringify(value),
      );
    if (written.changes !== 1) throw Error("流程資料範圍衝突。");
    return value;
  }
  change(t, value) {
    return this.store.tx(() => {
      this.put(t, value);
      this.put("event", {
        id: randomUUID(),
        runId: value.runId || value.id,
        teamId: value.teamId,
        projectId: value.projectId,
        dataEpoch: value.dataEpoch,
        createdAt: new Date().toISOString(),
        entity: t,
        snapshot: structuredClone(value),
      });
      return value;
    });
  }
  node(run, nodeId) {
    return this.get("node_run", `${run.id}:${nodeId}`, run);
  }
  nodes(run) {
    return this.list("node_run", run, run.id);
  }
  artifacts(run) {
    return this.list("artifact", run, run.id);
  }
  recover() {
    for (const { data } of this.store.db
      .prepare("SELECT data FROM \"run\" WHERE status IN ('running','queued')")
      .all()) {
      const r = JSON.parse(data);
      this.change("run", {
        ...r,
        status: "interrupted",
        error: "服務已重新啟動，可續跑。",
      });
      for (const n of this.nodes(r))
        if (n.status === "running")
          this.change("node_run", {
            ...n,
            status: "interrupted",
            error: "服務已重新啟動。",
          });
    }
  }
}
