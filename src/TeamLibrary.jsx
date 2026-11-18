import { KnowledgeNetwork } from "./KnowledgeNetwork.jsx";
import { WorkflowCanvas } from "./WorkflowCanvas.jsx";
import ReactMarkdown from "react-markdown";
import { WritingProfile } from "./WritingProfile";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Cube,
  MagnifyingGlass,
  Plus,
  Check,
  FileText,
  UploadSimple,
  DownloadSimple,
  CaretRight,
  UsersThree,
  Graph,
  ArrowsClockwise,
  LinkSimple,
} from "@phosphor-icons/react";
import { api, download as downloadText } from "./api";
import { members, skillCatalog, teamMembers } from "./team-state.mjs";
import { BotAvatar, lookAtPointer, resetLook } from "./BotAvatar";
import {
  workflows as legacyWorkflows,
  skillIsAssigned,
  contextPreview,
} from "./team-library-data.mjs";
import { saveFile, downloadFile } from "./team-files";
import "./team-library.css";

const labels = Object.fromEntries(skillCatalog.map((s) => [s.id, s.name]));
const title = (s) => labels[s.id] || s.name;
const size = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
function SkillCard({ skill, team, patchTeam, inspect, scope }) {
  const members = teamMembers(team);
  const binding = team.skills.find(
    (s) =>
      s.id === skill.id && (!scope || s.scope === scope || s.scope === "team"),
  );
  const assigned =
    binding && (!scope || binding.scope === scope || binding.scope === "team");
  return (
    <article className="tl-skill-card">
      <button className="tl-card-open" onClick={() => inspect(skill.id)}>
        <Cube size={23} />
        <strong>{title(skill)}</strong>
        <p>{skill.description || "查看 SKILL.md"}</p>
        <small>
          {size(skill.bytes)} · {skill.version.slice(0, 7)}
        </small>
      </button>
      <div className="tl-card-footer">
        <button
          className={assigned ? "assigned" : ""}
          onClick={() =>
            patchTeam({
              skills:
                binding && !assigned
                  ? team.skills.map((s) =>
                      s === binding ? { ...s, scope } : s,
                    )
                  : binding
                    ? team.skills.filter((s) => s !== binding)
                    : [
                        ...team.skills,
                        {
                          id: skill.id,
                          scope:
                            scope ||
                            (team.blueprint
                              ? "team"
                              : skillCatalog.find((s) => s.id === skill.id)
                                  ?.member) ||
                            "team",
                        },
                      ],
            })
          }
        >
          {assigned ? <Check size={13} /> : <Plus size={13} />}
          {binding && !assigned ? "改派此成員" : binding ? "已選用" : "選用"}
        </button>
        {binding && (
          <select
            aria-label={`${title(skill)}適用成員`}
            value={binding.scope}
            onChange={(e) =>
              patchTeam({
                skills: team.skills.map((s) =>
                  s === binding ? { ...s, scope: e.target.value } : s,
                ),
              })
            }
          >
            <option value="team">整個團隊</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </article>
  );
}
function MemoryEditor({ project, field, label, patchProject, base, document }) {
  const [value, setValue] = useState(document.content),
    [version, setVersion] = useState(document.version),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false),
    [editing, setEditing] = useState(false);
  return (
    <form
      className="tl-memory-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const d = await api(base + "/documents/" + field, "PUT", {
            content: value,
            version,
          });
          setVersion(d.version);
          patchProject({
            [field]: value,
            [field + "UpdatedAt"]: new Date().toISOString(),
          });
          setStatus("已儲存");
          setEditing(false);
        } catch (e) {
          setStatus(e.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <FileText size={19} />
        <strong>{label}</strong>
      </div>
      {!editing ? (
        <div className="tl-memory-read">
          {value.trim() ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="tl-memory-empty">
              {field === "memory"
                ? "尚未設定長期記憶。可記錄已確認的品牌背景、專案偏好與重要決策。"
                : "尚未設定長期規則。可記錄必須遵守的限制與避免事項。"}
            </p>
          )}
        </div>
      ) : (
        <textarea
          aria-label={label}
          maxLength={16000}
          rows={8}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("尚未儲存");
          }}
        />
      )}
      <details>
        <summary>儲存位置與原始檔案</summary>
        <p>{document.path}</p>
      </details>
      <footer>
        <small role="status">{status || "Agent 執行時讀取此文件"}</small>
        <button
          type="button"
          onClick={() =>
            downloadText(
              field === "memory" ? "MEMORY.md" : "GUARDRAILS.md",
              value,
            )
          }
          aria-label={`下載 ${label}`}
        >
          <DownloadSimple size={16} />
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            try {
              const k = await api(base + "/knowledge"),
                d = k.documents[field];
              setValue(d.content);
              setVersion(d.version);
              setStatus("已重新讀取本機文件");
            } catch (e) {
              setStatus(e.message);
            }
          }}
        >
          重新讀取
        </button>
        {editing ? (
          <button disabled={saving}>{saving ? "儲存中…" : "儲存"}</button>
        ) : (
          <button type="button" onClick={() => setEditing(true)}>
            編輯內容
          </button>
        )}
      </footer>
    </form>
  );
}

export function TeamLibrary({
  team,
  project: inputProject,
  patchTeam,
  patchProject,
  appendResources,
  initialTab = "skills",
  close,
  addResource,
}) {
  const members = teamMembers(team);
  const workflows = team.blueprint
    ? team.blueprint.workflows.map((w) => ({
        ...w,
        description: team.blueprint.mission,
        steps: (w.template === "topic-to-delivery"
          ? [
              ["search", "research", "讀取公開來源與新聞"],
              ["report", "research", "整理有來源的研究報告"],
              ["topics", "director", "提出選題，等待人類確認"],
              ["write", "writer", "一篇3–6頁文案與caption"],
              [
                "design",
                "designer",
                w.imageGeneration
                  ? "定義配色、構圖與逐頁主視覺"
                  : "選擇可執行的視覺版型",
              ],
              ...(w.imageGeneration
                ? Array.from({ length: 6 }, (_, i) => [
                    "image" + (i + 1),
                    "designer",
                    "Codex生成第" + (i + 1) + "頁主視覺（可續跑）",
                  ])
                : []),
              ["render", "designer", "實際渲染1080×1350 PNG"],
              ["wrap", "director", "交付圖片與文案，等待人類審稿"],
            ].map(([id, role, instruction], i, all) => ({
              id,
              agentId:
                role === "director"
                  ? "director"
                  : team.blueprint.agents.find(
                      (a) => a.roleType === role || a.capability === role,
                    )?.id,
              instruction,
              dependsOn:
                id === "design"
                  ? ["topics"]
                  : id === "image1"
                    ? ["write", "design"]
                    : id === "render"
                      ? w.imageGeneration
                        ? ["image6"]
                        : ["write", "design"]
                      : i
                        ? [all[i - 1][0]]
                        : [],
            }))
          : w.template === "research-assignment"
            ? [
                {
                  id: "__director_assign",
                  agentId: "director",
                  instruction: "辨識明確需求，指派趨勢偵查",
                  dependsOn: [],
                },
                ...w.steps.map((s, i) => ({
                  ...s,
                  dependsOn: s.dependsOn.length
                    ? s.dependsOn
                    : ["__director_assign"],
                })),
                {
                  id: "__director_wrap",
                  agentId: "director",
                  instruction: "整理實際回執、研究結果與限制；不自動製作輪播",
                  dependsOn: [w.steps[0].id],
                },
              ]
            : [
                {
                  id: "__director_route",
                  agentId: "director",
                  instruction: "理解需求並選擇適用流程",
                  dependsOn: [],
                },
                ...w.steps.map((s) => ({
                  ...s,
                  dependsOn: s.dependsOn.length
                    ? s.dependsOn
                    : ["__director_route"],
                })),
                {
                  id: "__director_wrap",
                  agentId: "director",
                  instruction: "整合實際交付與限制",
                  dependsOn: w.steps
                    .filter(
                      (s) => !w.steps.some((n) => n.dependsOn.includes(s.id)),
                    )
                    .map((s) => s.id),
                },
              ]
        ).map((s) => ({
          ...s,
          name: members.find((a) => a.id === s.agentId)?.name || s.agentId,
          member: s.agentId,
          skills: team.skills
            .filter((b) => b.scope === s.agentId || b.scope === "team")
            .map((b) => b.id),
          input: s.dependsOn.length
            ? "前置節點：" + s.dependsOn.join("、")
            : "使用者要求與專案資料",
          output: s.instruction,
        })),
      }))
    : team.setup
      ? []
      : legacyWorkflows;
  const [knowledge, setKnowledge] = useState(null);
  const project = inputProject && {
    ...inputProject,
    resources: knowledge?.resources || inputProject.resources,
    memory: knowledge?.documents.memory.content ?? inputProject.memory,
    guardrails:
      knowledge?.documents.guardrails.content ?? inputProject.guardrails,
  };
  const base = inputProject
    ? `/teams/${team.id}/projects/${inputProject.id}`
    : null;
  const [tab, setTab] = useState(
    initialTab === "memory" ? "knowledge" : initialTab,
  );
  const [skills, setSkills] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null),
    [expanded, setExpanded] = useState("director");
  const [workflowId, setWorkflowId] = useState(null),
    [stepId, setStepId] = useState(null);
  const [knowledgeTab, setKnowledgeTab] = useState("files"),
    [resourceId, setResourceId] = useState(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [showContext, setShowContext] = useState(false);
  const fileInput = useRef();
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api("/team-library/skills")
      .then((data) => {
        if (live) setSkills(data.skills);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    let live = true;
    setKnowledge(null);
    if (!base) return;
    const load = () =>
      api(base + "/knowledge")
        .then((k) => {
          if (live) {
            setKnowledge(k);
            if (k.error) setNotice(k.error);
          }
        })
        .catch((e) => live && setNotice(e.message));
    load();
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [base, revision, inputProject?.resources]);
  const inspect = (id) => {
    setSelected(id);
  };
  const selectedSkill = skills.find((s) => s.id === selected);
  const workflow = workflows.find((w) => w.id === workflowId);
  const step =
    workflow?.steps.find((s) => s.id === stepId) || workflow?.steps[0];
  const visible = skills.filter(
    (s) =>
      `${title(s)} ${s.id} ${s.description}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter !== "assigned" || team.skills.some((b) => b.id === s.id)),
  );

  const [pageUrl, setPageUrl] = useState("");
  const importPage = async (e) => {
    e.preventDefault(); setBusy(true); setNotice("");
    try { await api(base + "/knowledge/pages", "POST", {url:pageUrl}); setPageUrl(""); setRevision(v=>v+1); setNotice("網頁內容已保存，可供 Agent 搜尋引用。"); }
    catch(e) { setNotice(e.message); } finally { setBusy(false); }
  };
  const resource = project?.resources.find((r) => r.id === resourceId);
  const cards = (list, scope) => (
    <div className="tl-card-grid">
      {list.map((skill) => (
        <SkillCard
          key={skill.id}
          {...{ skill, team, patchTeam, inspect, scope }}
        />
      ))}
    </div>
  );
  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!project || !files.length) return;
    setBusy(true);
    setNotice("");
    let count = 0;
    try {
      for (const file of files) {
        const record = await saveFile(team.id, project.id, file);
        appendResources([record]);
        count++;
      }
      setNotice(`已保存 ${count} 個檔案至本機。`);
      setRevision((v) => v + 1);
    } catch (err) {
      setNotice(`${count ? `已保存 ${count} 個。` : ""}${err.message}`);
    } finally {
      setBusy(false);
    }
  };
  const download = async (r) => {
    try {
      if (r.kind === "file") await downloadFile(team.id, project.id, r);
      else {
        const url = URL.createObjectURL(
          new Blob([r.content || ""], { type: "text/plain;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `${r.name}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setNotice(e.message);
    }
  };
  const visualSettingsPanel = (
    <div className="tl-resource-preview">
      <h3>視覺風格與參考圖</h3>
      <p>
        請至視覺設計師 →
        工作，管理團隊風格、參考圖片與回饋。這些資料會傳入設計與輪播產圖步驟。
      </p>
    </div>
  );
  const researchSettingsPanel = (
    <details className="tl-resource-preview">
      <summary>團隊搜尋預設值</summary>
      <p>
        提供新專案的初始主題與來源；本專案追蹤設定請至趨勢偵查 → 工作 →
        來源管理。
      </p>
      <label>
        固定公開來源（每行一個 HTTPS 網址）
        <textarea
          value={(team.researchSettings?.sourceUrls || []).join("\n")}
          onChange={(e) =>
            patchTeam({
              researchSettings: {
                ...team.researchSettings,
                sourceUrls: e.target.value
                  .split("\n")
                  .filter(Boolean)
                  .slice(0, 3),
              },
            })
          }
        />
      </label>
      <label>
        預設研究主題
        <input
          maxLength={100}
          value={team.researchSettings?.topic ?? "brand design creativity"}
          onChange={(e) =>
            patchTeam({
              researchSettings: {
                ...team.researchSettings,
                topic: e.target.value,
              },
            })
          }
        />
      </label>
      <label>
        搜尋語系
        <select
          value={team.researchSettings?.locale || "en-US"}
          onChange={(e) =>
            patchTeam({
              researchSettings: {
                ...team.researchSettings,
                locale: e.target.value,
              },
            })
          }
        >
          <option value="zh-TW">繁體中文／台灣</option>
          <option value="en-US">英文／美國</option>
          <option value="ja-JP">日文／日本</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={
            !team.researchSettings?.allowedDomains ||
            team.researchSettings.allowedDomains.includes("news.google.com")
          }
          onChange={(e) =>
            patchTeam({
              researchSettings: {
                ...team.researchSettings,
                allowedDomains: e.target.checked ? ["news.google.com"] : [],
              },
            })
          }
        />
        允許公開新聞 RSS 搜尋
      </label>
      <p>僅讀新聞標題與摘要；關閉後仍可使用專案已保存的來源。</p>
    </details>
  );
  const switchTab = (key) => {
    setTab(key);
    setSelected(null);
    setQuery("");
    setNotice("");
  };
  return (
    <main className="tl-workspace" aria-label="團隊庫">
      <div className="tl-shell">
        <header className="tl-heading">
          <div>
            <button aria-label="返回對話" onClick={close}>
              <ArrowLeft size={19} />
            </button>
            <h1>
              團隊庫 <span>{team.name}</span>
            </h1>
          </div>
          <button className="tw-secondary" onClick={close}>
            返回對話
          </button>
        </header>
        <div className="tl-nav" role="tablist" aria-label="團隊庫分頁">
          {[
            ["skills", "Skills"],
            ["members", "團隊成員"],
            ["workflow", "合作流程"],
            ["knowledge", "知識庫"],
          ].map(([key, name]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
            >
              {name}
            </button>
          ))}
        </div>
        {error && (
          <div className="tl-notice" role="alert">
            無法讀取本機 Skills：{error}
            <button onClick={() => setRevision((v) => v + 1)}>重試</button>
          </div>
        )}
        {notice && (
          <div className="tl-notice" role="status">
            {notice}
          </div>
        )}
        {selectedSkill ? (
          <section className="tl-detail">
            <button className="tl-back" onClick={() => setSelected(null)}>
              <ArrowLeft size={15} />
              返回{tab === "workflow" ? "流程" : "卡片"}
            </button>
            <header>
              <Cube size={27} />
              <h2>{title(selectedSkill)}</h2>
              <small>本機原文</small>
            </header>
            <p>{selectedSkill.description}</p>
            <div className="tl-metadata">
              <span>{selectedSkill.source}</span>
              <span>版本 {selectedSkill.version}</span>
              <span>{size(selectedSkill.bytes)}</span>
            </div>
            <details>
              <summary>隨附檔案與資料夾 · {selectedSkill.files.length}</summary>
              <ul>
                {selectedSkill.files.map((f) => (
                  <li key={f.name}>
                    {f.name}
                    {f.directory ? "/" : ""}
                  </li>
                ))}
              </ul>
            </details>
            <pre className="tl-source">{selectedSkill.content}</pre>
          </section>
        ) : (
          <>
            {tab === "skills" && (
              <>
                <div className="tl-toolbar">
                  <div className="tl-filter">
                    {[
                      ["all", "本機全部"],
                      ["assigned", "團隊選用"],
                      ["online", "線上探索"],
                    ].map(([value, name]) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        className={filter === value ? "active" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <label className="tl-search">
                    <MagnifyingGlass size={16} />
                    <input
                      aria-label="搜尋 Skills"
                      placeholder="搜尋 Skills"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <button
                    aria-label="重新讀取 Skills"
                    onClick={() => setRevision((v) => v + 1)}
                  >
                    <ArrowsClockwise size={17} />
                  </button>
                </div>
                {filter === "online" ? (
                  <>
                    <p className="tl-caption">
                      搜尋公開 Skills，於新分頁查看來源。
                    </p>
                    <div className="tl-card-grid">
                      <a
                        className="tl-discovery"
                        href={`https://github.com/search?q=${encodeURIComponent(`${query || "marketing"} path:SKILL.md`)}&type=code`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Cube size={25} />
                        <h3>GitHub Skills</h3>
                        <p>
                          {query ? `搜尋「${query}」` : "搜尋行銷相關 SKILL.md"}
                        </p>
                        <span>
                          搜尋原始碼 <ArrowUpRight size={15} />
                        </span>
                      </a>
                      <a
                        className="tl-discovery"
                        href="https://skills.sh/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Graph size={25} />
                        <h3>Skills.sh</h3>
                        <p>公開目錄、熱門排行與來源</p>
                        <span>
                          開啟目錄 <ArrowUpRight size={15} />
                        </span>
                      </a>
                    </div>
                    <p className="tl-caption">
                      選用前先檢查 SKILL.md
                      與隨附腳本；這裡不會自動安裝。安裝到專案後，重新讀取即可顯示。
                    </p>
                  </>
                ) : loading ? (
                  <p className="tl-empty">讀取本機 Skills…</p>
                ) : (
                  <>
                    <div className="tl-section-title">
                      {filter === "assigned" ? "此團隊選用" : "專案已安裝"}
                      <span>{visible.length}</span>
                    </div>
                    {cards(visible)}
                    {!visible.length && (
                      <p className="tl-empty">
                        {query
                          ? "沒有符合的 Skills。"
                          : "尚未選用 Skills，從「本機全部」加入。"}
                      </p>
                    )}
                    <p className="tl-caption">
                      讀取專案
                      .agents/skills。選用設定會保存到本機，執行時載入對應 Agent
                      的 SKILL.md；合作紀錄可查看實際使用版本。
                    </p>
                  </>
                )}
              </>
            )}
            {tab === "members" && (
              <div className="tl-member-list">
                {members.map((m) => {
                  const assigned = skills.filter((s) =>
                    skillIsAssigned(team, s.id, m.id),
                  );
                  return (
                    <section key={m.id}>
                      <button
                        className="tl-member-heading"
                        onPointerMove={lookAtPointer}
                        onPointerLeave={resetLook}
                        aria-expanded={expanded === m.id}
                        onClick={() =>
                          setExpanded(expanded === m.id ? null : m.id)
                        }
                      >
                        <BotAvatar member={m} />
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.role}</small>
                        </span>
                        <small>{assigned.length} Skills</small>
                        <CaretRight
                          className={expanded === m.id ? "expanded" : ""}
                          size={16}
                        />
                      </button>
                      {expanded === m.id && (
                        <div className="tl-member-skills">
                          {base &&
                            (m.roleType === "writer" ||
                              m.capability === "writer" ||
                              m.id === "writer") && (
                              <WritingProfile
                                key={base}
                                base={base}
                                projects={team.projects}
                              />
                            )}
                          {(m.roleType === "designer" ||
                            m.capability === "designer" ||
                            m.id === "designer") &&
                            visualSettingsPanel}
                          {(m.roleType === "research" ||
                            m.capability === "research" ||
                            m.id === "research") &&
                            researchSettingsPanel}
                          {cards(assigned, m.id)}
                          {!assigned.length && (
                            <p className="tl-empty">尚未指定 Skills</p>
                          )}
                          <button
                            className="tw-secondary"
                            onClick={() => {
                              setTab("skills");
                              setFilter("all");
                            }}
                          >
                            <Plus size={14} />
                            管理 Skills
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            {tab === "workflow" && (
              <>
                {!workflow ? (
                  <>
                    <div className="tl-section-title">
                      流程模板 <span>{workflows.length}</span>
                    </div>
                    <div className="tl-card-grid">
                      {workflows.map((w) => {
                        const bindings = w.steps.flatMap((s) =>
                          s.skills.map((id) => ({ id, member: s.member })),
                        );
                        const count = bindings.filter(
                          (b) =>
                            skillIsAssigned(team, b.id, b.member) &&
                            skills.some((s) => s.id === b.id),
                        ).length;
                        return (
                          <button
                            className="tl-flow-card"
                            key={w.id}
                            onClick={() => {
                              setWorkflowId(w.id);
                              setStepId(w.steps[0].id);
                            }}
                          >
                            <Graph size={26} />
                            <h3>{w.name}</h3>
                            <p>{w.description}</p>
                            <small>
                              {count} / {bindings.length} 技能連接 ·{" "}
                              {w.steps.length} 步驟
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      className="tl-back"
                      onClick={() => setWorkflowId(null)}
                    >
                      <ArrowLeft size={15} />
                      所有流程
                    </button>
                    <div className="tl-flow-title">
                      <h2>{workflow.name}</h2>
                      <small>
                        {team.blueprint
                          ? "Codex 配置 · 依此流程派工"
                          : "模板 · 尚未執行"}
                      </small>
                    </div>
                    <WorkflowCanvas
                      key={workflow.id}
                      workflow={workflow}
                      members={members}
                      selected={step.id}
                      onSelect={setStepId}
                    />
                    <section className="tl-step">
                      <h3>{step.name}</h3>
                      <div className="tl-io">
                        <div>
                          <small>輸入</small>
                          <p>{step.input}</p>
                        </div>
                        <div>
                          <small>交付</small>
                          <p>{step.output}</p>
                        </div>
                      </div>
                      {step.gate && (
                        <p className="tl-gate">確認點 · {step.gate}</p>
                      )}
                      <div className="tl-section-title">此步驟的 Skills</div>
                      {cards(
                        skills.filter((s) => step.skills.includes(s.id)),
                        step.member,
                      )}
                      {step.skills.some(
                        (id) => !skillIsAssigned(team, id, step.member),
                      ) && (
                        <button
                          className="tw-secondary"
                          onClick={() => {
                            const available = step.skills.filter((id) =>
                              skills.some((s) => s.id === id),
                            );
                            patchTeam({
                              skills: [
                                ...team.skills.filter(
                                  (s) =>
                                    !available.includes(s.id) ||
                                    s.scope !== step.member,
                                ),
                                ...available.map((id) => ({
                                  id,
                                  scope: step.member,
                                })),
                              ],
                            });
                          }}
                        >
                          連接此步驟所需 Skills
                        </button>
                      )}
                      {step.skills
                        .filter((id) => !skills.some((s) => s.id === id))
                        .map((id) => (
                          <p className="tl-caption" key={id}>
                            本機缺少：{id}
                          </p>
                        ))}
                    </section>
                  </>
                )}
                {project && (
                  <details className="tl-resource-preview">
                    <summary>{project.name} · 專案執行紀錄</summary>
                    <div className="tl-activity-read">
                      {knowledge?.activity?.content?.trim() ? (
                        <ReactMarkdown>
                          {knowledge.activity.content}
                        </ReactMarkdown>
                      ) : (
                        <p>尚無自動任務紀錄。</p>
                      )}
                    </div>
                  </details>
                )}
              </>
            )}
            {tab === "knowledge" && (
              <>
                <div className="tl-knowledge-heading">
                  <label>
                    專案
                    <select
                      aria-label="知識庫專案"
                      value={project?.id || ""}
                      onChange={(e) =>
                        patchTeam({ activeProjectId: e.target.value })
                      }
                    >
                      {!project && <option value="">尚無專案</option>}
                      {team.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="tl-filter">
                    {[
                      ["files", "專案資料"],
                      ["memory", "Memory"],
                      ["graph", "關係圖"],
                    ].map(([key, name]) => (
                      <button
                        key={key}
                        className={knowledgeTab === key ? "active" : ""}
                        aria-pressed={knowledgeTab === key}
                        onClick={() => {
                          setKnowledgeTab(key);
                          setResourceId(null);
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                {!project ? (
                  <p className="tl-empty">先建立專案，再加入資料。</p>
                ) : (
                  <>
                    {knowledgeTab === "files" && (
                      <>
                        <div className="tl-toolbar">
                          <span className="tl-count">
                            {project.resources.length} 筆資料
                          </span>
                          <button
                            className="tw-secondary"
                            onClick={addResource}
                          >
                            <LinkSimple size={15} />
                            連結／筆記
                          </button>
                          <button
                            className="tw-secondary"
                            disabled={busy}
                            onClick={() => fileInput.current.click()}
                          >
                            <UploadSimple size={16} />
                            {busy ? "保存中…" : "上傳檔案"}
                          </button>
                          <input
                            hidden
                            ref={fileInput}
                            type="file"
                            multiple
                            onChange={upload}
                          />
                        </div>
                        <form onSubmit={importPage} className="tl-toolbar">
                          <input aria-label="知識網頁網址" type="url" required placeholder="https://… 貼上要保存的單一網頁" value={pageUrl} onChange={e=>setPageUrl(e.target.value)} style={{flex:1,minWidth:200}} />
                          <button className="tw-secondary" disabled={busy || !pageUrl.trim()}>{busy ? "擷取中…" : "擷取至知識庫"}</button>
                        </form>
                        <p className="tl-caption">每次保存一頁公開文字；可再次輸入相同網址更新。尚未使用向量化，不會自動追蹤新聞。</p>
                        <div className="tl-files">
                          {project.resources.map((r) => (
                            <div key={r.id}>
                              <button
                                onClick={() =>
                                  setResourceId(
                                    resourceId === r.id ? null : r.id,
                                  )
                                }
                              >
                                {r.kind === "link" ? (
                                  <LinkSimple size={20} />
                                ) : (
                                  <FileText size={20} />
                                )}
                                <span>
                                  {r.name}
                                  <small>
                                    {r.kind === "webpage" ? `已擷取 · ${new Date(r.fetchedAt).toLocaleDateString()} · 可供 Agent 搜尋` : r.kind === "file"
                                      ? r.storage === "missing"
                                        ? "缺少原件 · 等待舊瀏覽器遷移"
                                        : `${size(r.size)} · 本機原檔${r.content ? " · 文字可供Agent讀取" : ""}`
                                      : r.kind === "research"
                                        ? "已收集的研究資料"
                                        : r.kind === "link"
                                          ? "連結 · 尚未擷取"
                                          : "文字筆記"}
                                  </small>
                                </span>
                              </button>
                              <button
                                aria-label={`下載${r.name}`}
                                onClick={() => download(r)}
                              >
                                <DownloadSimple size={18} />
                              </button>
                            </div>
                          ))}
                        </div>
                        {!project.resources.length && (
                          <p className="tl-empty">
                            此專案尚未加入檔案、連結或筆記。研究文章保存在趨勢偵查，文案與圖片保存在各
                            Agent 工作區，不會自動列入知識庫。
                          </p>
                        )}
                        {resource && (
                          <div className="tl-resource-preview">
                            <h3>{resource.name}</h3>
                            {resource.kind === "webpage" && <p><a href={resource.url} target="_blank" rel="noreferrer">原始網頁</a> · {resource.limitations}</p>}
                            <pre>
                              {resource.content ||
                                (resource.kind === "file"
                                  ? `本機原檔：${resource.path || "等待遷移"}；此格式尚未解析。`
                                  : "")}
                            </pre>
                          </div>
                        )}
                        <p className="tl-caption">
                          本機資料夾：{knowledge?.root || "讀取中…"}（每檔最多
                          20 MB）。文字檔會納入 Agent
                          上下文；PDF與圖片原件保存不代表已解析。
                        </p>
                      </>
                    )}
                    {knowledgeTab === "memory" && knowledge && (
                      <>
                        <div className="tl-memory-grid">
                          <MemoryEditor
                            key={`${project.id}:memory`}
                            {...{ project, patchProject }}
                            field="memory"
                            label="長期記憶"
                            base={base}
                            document={knowledge.documents.memory}
                          />
                          <MemoryEditor
                            key={`${project.id}:guardrails`}
                            {...{ project, patchProject }}
                            field="guardrails"
                            label="長期規則"
                            base={base}
                            document={knowledge.documents.guardrails}
                          />
                        </div>
                        <div className="tl-context">
                          <button
                            className="tw-secondary"
                            onClick={() => setShowContext(!showContext)}
                          >
                            查看任務上下文
                          </button>
                          <small>
                            目前保存的設定；任務執行會讀取本機文件與已選 Skills
                          </small>
                        </div>
                        {showContext && (
                          <pre className="tl-source">
                            {contextPreview(team, project)}
                          </pre>
                        )}
                      </>
                    )}
                    {knowledgeTab === "graph" && (
                      <KnowledgeNetwork resources={project.resources} />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
