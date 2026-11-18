import { randomUUID } from "node:crypto";
import { fail } from "./store.mjs";
export const writingTypes = ["post", "carousel", "press-release", "general"];
export function writingType(text) {
  if (/新聞稿|press release/i.test(text)) return "press-release";
  if (/輪播|carousel|逐頁|每頁/i.test(text)) return "carousel";
  if (/貼文|caption|社群|post/i.test(text)) return "post";
  return "general";
}
const str = (v, n) => typeof v === "string" && v.length <= n;
export function isWriter(team, role) {
  return (
    role === "writer" ||
    team?.agents?.some(
      (a) =>
        a.id === role && (a.capability === "writer" || a.roleType === "writer"),
    )
  );
}
export class WritingProfiles {
  constructor(store) {
    this.store = store;
  }
  get(s) {
    const dataEpoch = this.store.get("settings", "main").epoch,
      workspace = this.store.get("teamWorkspace", "main");
    const team =
      workspace?.dataEpoch === dataEpoch &&
      workspace.state.teams.find((t) => t.id === s.teamId);
    if (!team?.projects.some((p) => p.id === s.projectId))
      throw fail("找不到團隊或專案。", 404);
    const prior = this.store.get("teamWriting", s.teamId);
    return prior?.dataEpoch === dataEpoch
      ? structuredClone(prior)
      : {
          id: s.teamId,
          teamId: s.teamId,
          dataEpoch,
          revision: 0,
          guide: "",
          samples: [],
          feedback: [],
        };
  }
  save(p) {
    return this.store.put("teamWriting", {
      ...p,
      revision: p.revision + 1,
      updatedAt: new Date().toISOString(),
    });
  }
  change(s, b) {
    const p = this.get(s);
    if (b.revision !== p.revision)
      throw fail("口吻資料已更新，請重新讀取後再修改。", 409);
    if (b.action === "guide") {
      if (!str(b.content, 6000)) throw fail("口吻指南最多6000字。");
      p.guide = b.content;
    } else if (b.action === "sample") {
      if (
        !str(b.title, 120) ||
        !b.title.trim() ||
        !str(b.content, 20000) ||
        !b.content.trim() ||
        !writingTypes.includes(b.type) ||
        !str(b.url || "", 2000)
      )
        throw fail("請填寫標題、類型及參考原文（最多20000字）。");
      if (b.url) {
        let u;
        try {
          u = new URL(b.url);
        } catch {
          throw fail("來源網址無效。");
        }
        if (!["http:", "https:"].includes(u.protocol))
          throw fail("來源網址需為網頁。");
      }
      const old = b.id && p.samples.find((x) => x.id === b.id);
      if (b.id && !old) throw fail("參考不存在。", 404);
      if (!old && p.samples.length >= 50)
        throw fail("最多50份口吻參考，請先整理舊資料。");
      const sample = {
        id: old?.id || randomUUID(),
        title: b.title.trim(),
        content: b.content,
        type: b.type,
        url: b.url || "",
        enabled: b.enabled !== false,
        updatedAt: new Date().toISOString(),
      };
      p.samples = old
        ? p.samples.map((x) => (x.id === old.id ? sample : x))
        : [...p.samples, sample];
    } else if (b.action === "remove-sample") {
      p.samples = p.samples.filter((x) => x.id !== b.id);
    } else if (b.action === "feedback") {
      const f = p.feedback.find((x) => x.id === b.id);
      if (!f) throw fail("回饋不存在。", 404);
      if (
        !["pending", "active", "disabled"].includes(b.status) ||
        !writingTypes.includes(b.type) ||
        !str(b.rule, 2000) ||
        (b.status === "active" && !b.rule.trim())
      )
        throw fail("請填寫有效的規則與適用類型。");
      Object.assign(f, {
        status: b.status,
        type: b.type,
        rule: b.rule,
        updatedAt: new Date().toISOString(),
      });
    } else throw fail("未知口吻操作。");
    return this.save(p);
  }
  capture(s, { id, text, role }, team) {
    if (
      !isWriter(team, role) ||
      !/^(?:(?:我覺得|我|這篇|這段|這次|這個(?:開頭|語氣|口吻|文案)?)[，,：:\s]*){0,3}(?:不喜歡|不太喜歡|不要再|以後.{0,20}(?:不要|避免|請用|改用))/.test(
        text.trim(),
      ) ||
      /^(?:如果|假設|例如|舉例|引用)/.test(text.trim())
    )
      return null;
    const p = this.get(s);
    const existing = p.feedback.find((f) => f.runId === id);
    if (existing) return existing;
    const prior = this.store
      .all("teamRun")
      .filter(
        (r) =>
          r.teamId === s.teamId &&
          r.projectId === s.projectId &&
          r.dataEpoch === p.dataEpoch &&
          r.status === "completed",
      )
      .sort((a, b) =>
        (b.finishedAt || b.createdAt || "").localeCompare(
          a.finishedAt || a.createdAt || "",
        ),
      )
      .find((r) =>
        r.steps?.some(
          (st) => st.status === "completed" && isWriter(team, st.role),
        ),
      );
    const step = prior?.steps
      .filter((st) => st.status === "completed" && isWriter(team, st.role))
      .at(-1);
    const f = {
      id: randomUUID(),
      runId: id,
      projectId: s.projectId,
      text: text.slice(0, 12000),
      targetRunId: prior?.id || null,
      targetStepId: step?.id || null,
      excerpt: step?.output?.slice(0, 3000) || "",
      type: writingType(text + " " + (prior?.text || "")),
      status: "pending",
      rule: "",
      createdAt: new Date().toISOString(),
    };
    p.feedback.push(f);
    this.save(p);
    return f;
  }
  snapshot(s, text, format) {
    const p = this.get(s),
      type = format || writingType(text);
    const grams = new Set(
      (text.match(/[\p{L}\p{N}]{2,}/gu) || []).flatMap((w) =>
        w.length > 3
          ? Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))
          : [w],
      ),
    );
    const score = (x) =>
      (x.type === type ? 100 : 0) +
      [...grams].filter((g) => (x.title + x.content).includes(g)).length;
    const samples = p.samples
      .filter((x) => x.enabled)
      .sort(
        (a, b) => score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt),
      )
      .slice(0, 3)
      .map((x) => ({ ...x, content: x.content.slice(0, 2200) }));
    let budget = 6000;
    const rules = p.feedback
      .filter(
        (f) =>
          f.status === "active" && (f.type === type || f.type === "general"),
      )
      .reverse()
      .filter((f) => {
        if (f.rule.length > budget) return false;
        budget -= f.rule.length;
        return true;
      })
      .slice(0, 20)
      .map((f) => ({ id: f.id, rule: f.rule, type: f.type }));
    return { revision: p.revision, type, guide: p.guide, samples, rules };
  }
}
export function mountWritingProfiles(app, route, store, scope) {
  const svc = new WritingProfiles(store);
  app.get(route + "/writing-profile", (req, res) =>
    res.json(svc.get(scope(req))),
  );
  app.post(route + "/writing-profile", (req, res) =>
    res.json(svc.change(scope(req), req.body)),
  );
  return svc;
}

export function checkWriting(text, request) {
  const warnings = [];
  const limit = request.match(/(?:最多|不超過|上限)\s*(\d{1,5})\s*字/);
  const characters = [...text.replace(/\s/g, "")].length;
  if (limit && characters > Number(limit[1]))
    warnings.push("稿件超過指定字數上限，請確認或要求縮短。");
  if (/(?:\[待補[^\]]*\]|【待補[^】]*】)/.test(text))
    warnings.push("稿件含待補資料，尚非可發布定稿。");
  return {
    characters,
    warnings,
    checked: ["字數上限（明確指定時）", "待補標記"],
    factualVerification: false,
  };
}
