import {
  mkdirSync,
  lstatSync,
  existsSync,
  writeFileSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fail, now } from "./store.mjs";
import { readPublicSource } from "./public-research.mjs";
const valid = (x) => typeof x === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
const hash = (x) => createHash("sha256").update(x).digest("hex");
const fields = {
  memory: "MEMORY.md",
  guardrails: "GUARDRAILS.md",
  brief: "PROJECT.md",
};
export class ProjectVault {
  constructor(store) {
    this.store = store;
    this.root = resolve(store.dir, "team-projects");
    this.errors = new Map();
  }
  epoch() {
    return this.store.get("settings", "main").epoch;
  }
  dir(t, p, category = "") {
    if (!valid(t) || !valid(p) || !valid(this.epoch()))
      throw fail("專案識別碼無效。");
    const parts = [
      this.root,
      this.epoch(),
      t,
      "projects",
      p,
      ...(category ? [category] : []),
    ];
    let path = parts.shift();
    for (const next of [null, ...parts]) {
      if (next) path = join(path, next);
      if (!existsSync(path)) mkdirSync(path, { recursive: false });
      const st = lstatSync(path);
      if (st.isSymbolicLink() || !st.isDirectory())
        throw fail("專案資料夾不可使用符號連結。");
    }
    return path;
  }
  write(path, data) {
    if (existsSync(path)) {
      if (lstatSync(path).isSymbolicLink())
        throw fail("文件不可使用符號連結。");
      if (readFileSync(path).equals(Buffer.from(data))) return;
    }
    const temp = path + "." + randomUUID() + ".tmp";
    writeFileSync(temp, data, { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
  }
  text(path) {
    if (!existsSync(path)) return "";
    const st = lstatSync(path);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 1000000)
      throw fail("文件格式或大小無效。");
    return readFileSync(path, "utf8");
  }
  document(t, p, field) {
    if (!Object.hasOwn(fields, field)) throw fail("文件名稱無效。");
    const path = join(this.dir(t, p), fields[field]);
    const content = this.text(path);
    return { content, version: hash(content), path };
  }
  saveDocument(t, p, field, content, version) {
    if (typeof content !== "string" || content.length > 16000)
      throw fail("文件上限16000字。");
    const old = this.document(t, p, field);
    if (version !== old.version)
      throw fail("文件已被其他視窗或本機編輯，請重新讀取後再儲存。", 409);
    if (old.content)
      this.write(
        join(
          this.dir(t, p, "history"),
          `${fields[field]}-${Date.now()}-${randomUUID()}.md`,
        ),
        old.content,
      );
    this.write(old.path, content);
    return this.document(t, p, field);
  }
  syncWorkspace(record, prior) {
    if (record.dataEpoch !== this.epoch()) return;
    for (const team of record.state.teams) {
      for (const project of team.projects) {
        const old = prior?.state?.teams
          .find((t) => t.id === team.id)
          ?.projects.find((p) => p.id === project.id);
        const dir = this.dir(team.id, project.id);
        for (const [field, name] of Object.entries(fields)) {
          const path = join(dir, name),
            value = project[field] || "";
          if (!existsSync(path)) this.write(path, value);
          else if (
            old &&
            value !== (old[field] || "") &&
            value !== this.text(path)
          )
            this.saveDocument(
              team.id,
              project.id,
              field,
              value,
              this.document(team.id, project.id, field).version,
            );
        }
        this.write(
          join(dir, "project.json"),
          JSON.stringify(
            {
              id: project.id,
              name: project.name,
              teamId: team.id,
              teamName: team.name,
              skills: team.skills,
            blueprint: team.blueprint || null,
            setup: team.setup || null,
            },
            null,
            2,
          ),
        );
        const notes = this.dir(team.id, project.id, "notes");
        for (const r of project.resources.filter(
          (r) => r.kind !== "file" && valid(r.id),
        ))
          this.write(
            join(notes, r.id + ".md"),
            `# ${r.name}\n\n${r.content || ""}\n`,
          );
        this.syncKnowledge(team.id, project.id);
      }
    }
  }
  hydrate(record) {
    const copy = structuredClone(record);
    for (const t of copy.state.teams)
      for (const p of t.projects)
        for (const field of Object.keys(fields)) {
          const d = this.document(t.id, p.id, field);
          if (field in p || d.content) p[field] = d.content;
        }
    return copy;
  }
  scoped(kind, t, p) {
    return this.store
      .all(kind)
      .filter(
        (r) =>
          r.teamId === t && r.projectId === p && r.dataEpoch === this.epoch(),
      );
  }
  syncKnowledge(t, p) {
    const dir = this.dir(t, p, "research"),
      rows = [];
    for (const a of this.scoped("teamTracking", t, p).filter((a) =>
      valid(a.id),
    )) {
      const path = join(dir, a.id + ".md");
      const content =
        `# ${a.platform} @${a.username}\n\n帳號：${a.url}\n狀態：${a.status}\n最近收集：${a.lastSuccessAt || "尚未成功"}\n${a.lastError || ""}\n\n` +
        (a.posts || [])
          .map(
            (post) =>
              `## ${post.url}\n\n${post.body || "尚未讀取正文"}\n\n證據範圍：${post.evidence || ""}\n收集：${post.collectedAt || ""}\n\n${post.analysis ? "### 素材分析\n\n" + JSON.stringify(post.analysis, null, 2) : "素材尚未解析"}`,
          )
          .join("\n\n");
      this.write(path, content);
      rows.push({
        id: "tracking-" + a.id,
        name: `${a.platform} @${a.username}`,
        kind: "research",
        content,
        path,
        url: a.url,
      });
    }
    for (const r of this.scoped("teamRun", t, p).filter(
      (r) => valid(r.id) && r.search && r.status !== "running",
    )) {
      const path = join(dir, r.id + ".md");
      const content =
        `# ${r.text}\n\n${r.steps
          .filter(
            (s) => s.role === "research" && !s.kind && s.status === "completed",
          )
          .map((s) => s.output)
          .join("\n\n")}\n\n## 來源\n\n` +
        r.search.sources
          .map((s) => `${s.title}\n${s.url}\n${s.summary || ""}`)
          .join("\n\n");
      this.write(path, content);
      rows.push({
        id: "run-" + r.id,
        name: r.text,
        kind: "research",
        content,
        path,
      });
    }
    for (const binding of this.scoped("teamSources", t, p))
      for (const source of binding.sources || []) {
        const id =
            "bound-" +
            hash(String(source.id || source.url || source.name)).slice(0, 24),
          path = join(dir, id + ".md");
        const content = `# ${source.name || "綁定情報"}\n\n${source.url || ""}\n\n${source.content || ""}`;
        this.write(path, content);
        rows.push({
          id,
          name: source.name || "綁定情報",
          kind: "research",
          content,
          path,
          url: source.url,
        });
      }
    const activity = this.scoped("teamRun", t, p)
      .filter((r) =>
        ["completed", "awaiting_selection", "failed", "cancelled"].includes(
          r.status,
        ),
      )
      .slice(-30)
      .map(
        (r) => `## ${r.createdAt} · ${r.status}

要求：${r.text}
${r.selectedTopicId ? "已選題：" + (r.topics?.find((t) => t.id === r.selectedTopicId)?.title || r.selectedTopicId) : ""}
${r.deliverable ? "交付：" + r.deliverable.title : ""}
`,
      )
      .join("\n");
    this.write(
      join(this.dir(t, p, "memory"), "ACTIVITY.md"),
      `# 任務紀錄\n\n自動記錄實際請求、狀態與選題；不是已確認的品牌偏好。\n\n${activity}`,
    );
    return rows;
  }
  files(t, p) {
    return this.scoped("teamFile", t, p);
  }
  upload(t, p, b) {
    if (
      !valid(b.id) ||
      typeof b.name !== "string" ||
      b.name.length > 250 ||
      typeof b.base64 !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)
    )
      throw fail("檔案資料無效。");
    const bytes = Buffer.from(b.base64, "base64");
    if (bytes.length > 20 * 1024 * 1024) throw fail("單檔上限20 MB。");
    const id = `${this.epoch()}:${t}:${p}:${b.id}`,
      old = this.store.get("teamFile", id);
    if (old) {
      if (old.sha256 !== hash(bytes))
        throw fail("檔案識別碼已存在且內容不同。", 409);
      return old;
    }
    const dir = this.dir(t, p, "files");
    const diskName =
      b.id +
      "--" +
      (b.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 100) || "file");
    const path = join(dir, diskName);
    this.write(path, bytes);
    const record = {
      id,
      fileId: b.id,
      diskName,
      teamId: t,
      projectId: p,
      dataEpoch: this.epoch(),
      name: b.name,
      mime: String(b.mime || "application/octet-stream").slice(0, 100),
      size: bytes.length,
      sha256: hash(bytes),
      createdAt: now(),
      kind: "file",
      path,
    };
    this.write(join(dir, b.id + ".json"), JSON.stringify(record, null, 2));
    return this.store.put("teamFile", record);
  }
  file(t, p, id) {
    if (!valid(id)) throw fail("檔案識別碼無效。");
    const r = this.store.get("teamFile", `${this.epoch()}:${t}:${p}:${id}`);
    if (!r) throw fail("本機尚未保存此檔案。", 404);
    const name = r.diskName || id + ".bin";
    if (basename(name) !== name) throw fail("檔案路徑無效。", 400);
    const path = join(this.dir(t, p, "files"), name);
    if (
      !existsSync(path) ||
      lstatSync(path).isSymbolicLink() ||
      !lstatSync(path).isFile()
    )
      throw fail("原始檔案不存在。", 404);
    return { ...r, path };
  }
  assertProject(t, p) {
    const workspace = this.store.get("teamWorkspace", "main");
    if (workspace?.dataEpoch !== this.epoch() || !workspace.state.teams.find(x => x.id === t)?.projects.some(x => x.id === p))
      throw fail("找不到專案。", 404);
  }
  async importPage(t, p, raw, reader = readPublicSource) {
    this.assertProject(t, p);
    if (typeof raw !== "string" || raw.length > 2000) throw fail("請輸入公開 HTTPS 網址。");
    let url;
    try { url = new URL(raw); url.hash = ""; } catch { throw fail("網址格式錯誤。"); }
    const epoch = this.epoch();
    const page = await reader(url.href);
    this.assertProject(t, p);
    if (epoch !== this.epoch()) throw fail("資料已切換，請重試。", 409);
    const record = { id: hash(epoch + ":" + t + ":" + p + ":" + url.href),
      teamId: t, projectId: p, dataEpoch: epoch, kind: "webpage", name: page.title,
      url: url.href, content: page.summary, fetchedAt: page.collectedAt,
      limitations: page.limitations, evidence: page.evidence, status: "ready",
      sha256: hash(page.summary), storage: "local" };
    return this.store.put("teamKnowledgePage", record);
  }
  searchPages(t, p, query) {
    this.assertProject(t, p);
    const terms = [...new Set(String(query).toLowerCase().match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2}/g) || [])];
    return this.scoped("teamKnowledgePage", t, p).flatMap(page => {
      const chunks = page.content.match(/[\s\S]{1,1800}/g) || [];
      return chunks.map((content, index) => ({ name: page.name, url: page.url, fetchedAt: page.fetchedAt,
        content: `來源：${page.url}\n擷取日期：${page.fetchedAt}\n${page.evidence}\n${page.limitations}\n片段 ${index + 1}：${content}`,
        score: terms.reduce((sum, term) => sum + (content.toLowerCase().includes(term) ? 1 : 0) + (page.name.toLowerCase().includes(term) ? 2 : 0), 0) }));
    }).filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0,4);
  }
  knowledge(t, p) {
    this.syncKnowledge(t, p);
    const docs = Object.fromEntries(
      Object.keys(fields).map((f) => [f, this.document(t, p, f)]),
    );
    const record = this.store.get("teamWorkspace", "main");
    const project =
      record?.dataEpoch === this.epoch()
        ? record.state.teams
            .find((x) => x.id === t)
            ?.projects.find((x) => x.id === p)
        : null;
    const files = this.files(t, p).map((r) => ({
      ...r,
      id: r.fileId,
      content:
        /^(text\/)|\.(md|txt|csv|json)$/i.test(r.mime + " " + r.name) &&
        r.size < 200000
          ? this.text(r.path)
          : "",
      storage: "local",
      path: r.path,
    }));
    return {
      root: this.dir(t, p),
      documents: docs,
      activity: {
        path: join(this.dir(t, p, "memory"), "ACTIVITY.md"),
        content: this.text(join(this.dir(t, p, "memory"), "ACTIVITY.md")),
      },
      resources: [
        ...this.scoped("teamKnowledgePage", t, p),
        ...files,
        ...(project?.resources||[]).filter(r=>r.kind==="file"&&!files.some(f=>f.id===r.id)).map(r=>({...r,storage:"missing"})),
        ...(project?.resources || []).filter((r) => r.kind !== "file" && r.kind !== "research"),
        // Research remains in its own archive, not the knowledge library.
      ],
      error:
        this.errors.get(`${t}:${p}`) || this.errors.get("workspace:") || null,
    };
  }
  observe(kind, r, prior) {
    try {
      if (kind === "teamWorkspace") this.syncWorkspace(r, prior);
      else if (
        ["teamTracking", "teamSources", "teamRun"].includes(kind) &&
        r.dataEpoch === this.epoch() &&
        r.teamId &&
        r.projectId
      ) {
        if (
          kind !== "teamRun" ||
          ["completed", "awaiting_selection", "failed", "cancelled"].includes(r.status)
        )
          this.syncKnowledge(r.teamId, r.projectId);
      }
    } catch (e) {
      this.errors.set(
        `${r.teamId || "workspace"}:${r.projectId || ""}`,
        e.message,
      );
    }
  }
}
export function mountProjectVault(app, store) {
  const vault = new ProjectVault(store);
  store.projectVault = vault;
  store.onRecord = (kind, r, prior) => vault.observe(kind, r, prior);
  const saved = store.get("teamWorkspace", "main");
  if (saved?.dataEpoch === vault.epoch()) vault.syncWorkspace(saved);
  const base = "/api/teams/:teamId/projects/:projectId";
  app.post(base + "/knowledge/pages", async (req, res, next) => {
    try { res.json(await vault.importPage(req.params.teamId, req.params.projectId, req.body.url)); }
    catch (e) { next(e); }
  });
  app.get(base + "/knowledge/search", (req, res) => res.json(vault.searchPages(req.params.teamId, req.params.projectId, req.query.q || "")));
  app.get(base + "/knowledge", (req, res) =>
    res.json(vault.knowledge(req.params.teamId, req.params.projectId)),
  );
  app.put(base + "/documents/:field", (req, res) =>
    res.json(
      vault.saveDocument(
        req.params.teamId,
        req.params.projectId,
        req.params.field,
        req.body.content,
        req.body.version,
      ),
    ),
  );
  app.post(base + "/files", (req, res) =>
    res.json(vault.upload(req.params.teamId, req.params.projectId, req.body)),
  );
  app.get(base + "/files/:id/content", (req, res) => {
    const f = vault.file(
      req.params.teamId,
      req.params.projectId,
      req.params.id,
    );
    res.type("application/octet-stream").attachment(f.name).sendFile(f.path);
  });
  return vault;
}
