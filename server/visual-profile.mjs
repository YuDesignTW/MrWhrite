import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./store.mjs";
export const isDesigner = (team, role) =>
  role === "designer" ||
  team?.agents?.some(
    (a) =>
      a.id === role &&
      (a.capability === "designer" || a.roleType === "designer"),
  );
const styles = [
  "",
  "graphic",
  "street",
  "surreal",
  "typographic",
  "warm-editorial",
];
const kinds = ["general", "carousel", "single"];
const bounded = (v, n) => typeof v === "string" && v.length <= n;
export class VisualProfiles {
  constructor(store) {
    this.store = store;
  }
  get(s) {
    const epoch = this.store.get("settings", "main").epoch,
      w = this.store.get("teamWorkspace", "main"),
      team =
        w?.dataEpoch === epoch && w.state.teams.find((t) => t.id === s.teamId);
    if (!team?.projects.some((p) => p.id === s.projectId))
      throw fail("找不到團隊或專案。", 404);
    const old = this.store.get("teamVisual", s.teamId);
    return old?.dataEpoch === epoch
      ? structuredClone(old)
      : {
          id: s.teamId,
          teamId: s.teamId,
          dataEpoch: epoch,
          revision: 0,
          style: team.visualSettings?.style || "",
          direction: team.visualSettings?.direction || "",
          palette: "",
          typography: "",
          composition: "",
          avoid: "",
          references: [],
          feedback: [],
        };
  }
  save(p) {
    return this.store.put("teamVisual", {
      ...p,
      revision: p.revision + 1,
      updatedAt: new Date().toISOString(),
    });
  }
  change(s, b) {
    const p = this.get(s);
    if (b.revision !== p.revision)
      throw fail("視覺資料已更新，請重新讀取。", 409);
    if (b.action === "apply-style") {
      const candidate=this.store.get("teamVisualStyle",b.id);
      if(!candidate || candidate.teamId!==s.teamId || candidate.projectId!==s.projectId || candidate.dataEpoch!==p.dataEpoch)throw fail("風格草稿不存在。",404);
      for(const field of ["direction","palette","typography","composition","avoid"])p[field]=candidate[field];
      p.style="";
      p.styleSource={id:candidate.id,sourceId:candidate.sourceId,runId:candidate.runId};
    } else if (b.action === "style") {
      if (
        !styles.includes(b.style) ||
        !["direction", "palette", "typography", "composition", "avoid"].every(
          (k) => bounded(b[k], 2000),
        )
      )
        throw fail("請提供有效風格，每個欄位最多2000字。");
      for (const k of [
        "style",
        "direction",
        "palette",
        "typography",
        "composition",
        "avoid",
      ])
        p[k] = b[k];
    } else if (b.action === "reference") {
      if (
        !bounded(b.title, 120) ||
        !b.title.trim() ||
        !bounded(b.like, 2000) ||
        !bounded(b.avoid, 2000) ||
        !kinds.includes(b.kind) ||
        !["team", "project"].includes(b.scope)
      )
        throw fail("請填寫圖片名稱、參考重點及適用範圍。");
      let old = b.id && p.references.find((r) => r.id === b.id);
      if (b.id && !old) throw fail("參考圖不存在。", 404);
      if (!old && p.references.length >= 50)
        throw fail("最多50張參考圖，請先整理。");
      if (old?.projectId && old.projectId !== s.projectId)
        throw fail("請到原專案編輯這張參考圖。", 403);
      const id = old?.id || randomUUID();
      let image = old;
      if (!old) {
        if (
          !bounded(b.base64, 2800000) ||
          !b.base64 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)
        )
          throw fail("請上傳2 MB以內的PNG、JPEG或WebP圖片。");
        const bytes = Buffer.from(b.base64, "base64");
        let mime, ext;
        if (
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ) {
          mime = "image/png";
          ext = "png";
        } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
          mime = "image/jpeg";
          ext = "jpg";
        } else if (
          bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP"
        ) {
          mime = "image/webp";
          ext = "webp";
        }
        if (!mime || !bytes.length || bytes.length > 2 * 1024 * 1024)
          throw fail("只接受2 MB以內的PNG、JPEG或WebP。");
        image = {
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mime,
          ext,
        };
        this.store.put("teamVisualImage", {
          id,
          ...s,
          dataEpoch: p.dataEpoch,
          ...image,
          base64: b.base64,
        });
      }
      const ref = {
        id,
        title: b.title.trim(),
        like: b.like,
        avoid: b.avoid,
        kind: b.kind,
        projectId: b.scope === "project" ? s.projectId : null,
        enabled: b.enabled !== false,
        sha256: image.sha256,
        mime: image.mime,
        ext: image.ext,
        updatedAt: new Date().toISOString(),
      };
      p.references = old
        ? p.references.map((r) => (r.id === id ? ref : r))
        : [...p.references, ref];
    } else if (b.action === "remove-reference") {
      const ref = p.references.find((r) => r.id === b.id);
      if (ref?.projectId && ref.projectId !== s.projectId)
        throw fail("請到原專案移除。", 403);
      p.references = p.references.filter((r) => r.id !== b.id);
    } else if (b.action === "feedback") {
      const f = p.feedback.find((f) => f.id === b.id);
      if (!f) throw fail("回饋不存在。", 404);
      if (
        !["pending", "active", "disabled"].includes(b.status) ||
        !bounded(b.rule, 2000) ||
        !kinds.includes(b.kind) ||
        (b.status === "active" && !b.rule.trim())
      )
        throw fail("請填寫規則與適用類型。");
      Object.assign(f, { status: b.status, rule: b.rule, kind: b.kind });
    } else throw fail("未知視覺操作。");
    return this.save(p);
  }
  image(s, id) {
    const p = this.get(s),
      r = this.store.get("teamVisualImage", id);
    if (!r || r.teamId !== s.teamId || r.dataEpoch !== p.dataEpoch)
      throw fail("圖片不存在。", 404);
    return r;
  }
  snapshot(s, kind) {
    const p = this.get(s);
    return {
      revision: p.revision,
      styleSource: p.styleSource || null,
      style: p.style,
      direction: p.direction,
      palette: p.palette,
      typography: p.typography,
      composition: p.composition,
      avoid: p.avoid,
      kind,
      references: p.references
        .filter(
          (r) =>
            r.enabled &&
            (!r.projectId || r.projectId === s.projectId) &&
            (r.kind === kind || r.kind === "general"),
        )
        .sort(
          (a, b) =>
            (a.kind === kind ? -1 : 0) - (b.kind === kind ? -1 : 0) ||
            b.updatedAt.localeCompare(a.updatedAt),
        )
        .slice(0, 3),
      rules: p.feedback
        .filter(
          (f) =>
            f.status === "active" && (f.kind === kind || f.kind === "general"),
        )
        .slice(-6)
        .map((f) => ({ id: f.id, rule: f.rule })),
    };
  }
  materialize(s, snapshot) {
    return (snapshot?.references || []).map((ref) => {
      const r = this.image(s, ref.id);
      if (r.sha256 !== ref.sha256) throw fail("參考圖版本不符。", 409);
      const bytes = Buffer.from(r.base64, "base64");
      if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256)
        throw fail("參考圖內容損毀。");
      const dir = join(
        this.store.dir,
        "team-artifacts",
        "visual-references",
        s.teamId,
      );
      mkdirSync(dir, { recursive: true });
      const path = join(dir, r.sha256 + "." + r.ext);
      writeFileSync(path, bytes);
      return path;
    });
  }
  capture(s, b, team) {
    if (
      !isDesigner(team, b.role) ||
      !/^(?:(?:我覺得|我|這張|這組|這次|這個設計)[，,：:\s]*){0,3}(?:不喜歡|不太喜歡|字太小|太花|不要再)/.test(
        b.text.trim(),
      )
    )
      return null;
    const p = this.get(s),
      old = p.feedback.find((f) => f.runId === b.id);
    if (old) return old;
    const target = this.store
      .all("teamRun")
      .filter(
        (r) =>
          r.teamId === s.teamId &&
          r.projectId === s.projectId &&
          r.dataEpoch === p.dataEpoch &&
          r.status === "completed" &&
          (r.deliverable ||
            r.steps?.some(
              (st) => isDesigner(team, st.role) && st.status === "completed",
            )),
      )
      .sort((a, b) =>
        (b.finishedAt || b.createdAt).localeCompare(
          a.finishedAt || a.createdAt,
        ),
      )[0];
    const f = {
      id: randomUUID(),
      runId: b.id,
      projectId: s.projectId,
      text: b.text,
      targetRunId: target?.id || null,
      targetTitle:
        target?.deliverable?.title || target?.text?.slice(0, 100) || "",
      kind: target?.deliverable ? "carousel" : "general",
      status: "pending",
      rule: "",
      createdAt: new Date().toISOString(),
    };
    p.feedback.push(f);
    this.save(p);
    return f;
  }
}
export function mountVisualProfiles(app, route, store, scope) {
  const svc = new VisualProfiles(store);
  app.get(route + "/visual-profile", (req, res) =>
    res.json(svc.get(scope(req))),
  );
  app.post(route + "/visual-profile", (req, res) =>
    res.json(svc.change(scope(req), req.body)),
  );
  app.get(route + "/visual-profile/images/:id", (req, res) => {
    const r = svc.image(scope(req), req.params.id);
    res
      .set("Content-Type", r.mime)
      .set("X-Content-Type-Options", "nosniff")
      .send(Buffer.from(r.base64, "base64"));
  });
  return svc;
}
