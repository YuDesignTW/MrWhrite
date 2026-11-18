import { PerformanceWorkspace } from "./PerformanceWorkspace.jsx";
import { migrateBrowserFiles } from "./team-files.js";
import { ProcessingIndicator } from "./ProcessingIndicator.jsx";
import { useAgentActivity } from "./useAgentActivity.js";
import { LocalSchedule, AccountPanel } from "./LocalSchedule.jsx";
import { api } from "./api";
import { TeamLivePanel } from "./TeamLivePanel.jsx";
import { TeamRunConversation } from "./TeamRunConversation.jsx";
import { TeamOutputs } from "./TeamOutputs.jsx";
import React, { useEffect, useRef, useState, useReducer } from "react";
import {
  Plus,
  X,
  ArrowUp,
  ArrowUpRight,
  CaretDown,
  CaretRight,
  SidebarSimple,
  FolderSimple,
  SlidersHorizontal,
  Sparkle,
  UsersThree,
  Megaphone,
  ChartBar,
  PaintBrush,
  PenNib,
  VideoCamera,
  Binoculars,
  Cube,
  Check,
  FileText,
  LinkSimple,
  Sun,
  Moon,
  DownloadSimple,
  Info,
  Lightning,
  Brain,
  Paperclip,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  STORAGE_KEY,
  members,
  teamMembers,
  skillCatalog,
  createTeam,
  createProject,
  initialState,
  parseState,
  reducer,
} from "./team-state.mjs";
import "./team-workspace.css";
import "./team-grok.css";
import { RoleDashboard, RolePanel, ProjectPicker } from "./RoleWorkspace.jsx";
import { showcaseFiles } from "./workspace-demo.mjs";
import { roleNames, roleSummary } from "./role-workspaces.mjs";
import { TeamLibrary } from "./TeamLibrary.jsx";
import { BotAvatar as Avatar, lookAtPointer, resetLook } from "./BotAvatar.jsx";

function IconButton({ label, children, ...props }) {
  return (
    <button className="tw-icon" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function Modal({ title, subtitle, children, close, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`tw-dialog ${wide ? "wide" : ""}`}
      aria-labelledby="tw-dialog-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = ref.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }
      }}
    >
      <div className="tw-dialog-head">
        <div>
          <h2 id="tw-dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton label="關閉彈窗" onClick={close}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? parseState(raw) : initialState();
    return {
      state: {
        ...state,
        teams: state.teams.map((t) =>
          t.id === state.activeTeamId
            ? {
                ...t,
                projects: t.projects.map((p) =>
                  p.id === (t.activeProjectId || t.projects[0]?.id)
                    ? { ...p, recipient: "director" }
                    : p,
                ),
              }
            : t,
        ),
      },
      error: "",
    };
  } catch {
    return {
      state: initialState(),
      error: "無法讀取本機預覽資料。暫時在記憶體中操作，不會覆寫原資料。",
    };
  }
}
export function TeamWorkspace() {
  const [loaded, setLoaded] = useState(null),
    [error, setError] = useState("");
  const revision = useRef(0),
    queue = useRef(Promise.resolve()),
    blocked = useRef(false);
  useEffect(() => {
    let live = true;
    api("/team-workspace")
      .then((r) => {
        if (!live) return;
        if(r.state) migrateBrowserFiles(r.state).then(result=>{if(live&&(result.migrated||result.missing.length))setError(`已遷移 ${result.migrated} 個舊檔至本機。${result.missing.length?'找不到此瀏覽器的原件：'+result.missing.join('、'):''}`);}).catch(e=>live&&setError('舊檔遷移未完成：'+e.message));
        revision.current = r.revision;
        setLoaded(
          r.state
            ? { state: parseState(JSON.stringify(r.state)), error: "" }
            : load(),
        );
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  const persist = (state) => {
    queue.current = queue.current.then(async () => {
      if (blocked.current) return false;
      try {
        const r = await api("/team-workspace", "PUT", {
          state,
          revision: revision.current,
        });
        revision.current = r.revision;
        return true;
      } catch (e) {
        blocked.current = true;
        setError(e.message + " 本機副本保留；請先匯出後重新載入。");
        return false;
      }
    });
    return queue.current;
  };
  if (!loaded)
    return (
      <div className="tw" style={{ display: "block", padding: 40 }}>
        {error || "正在讀取團隊工作區…"}
      </div>
    );
  return (
    <>
      <TeamWorkspaceInner loaded={loaded} persist={persist} />
      {error && (
        <div className="tw-toast" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
function TeamWorkspaceInner({ loaded, persist }) {
  const activity = useAgentActivity();
  const [state, dispatch] = useReducer(reducer, loaded.state);
  const [saveError, setSaveError] = useState(loaded.error);
  const [modal, setModal] = useState(null);
  const [library, setLibrary] = useState(null);
  const [workspaceView, setWorkspaceView] = useState(null);
  const [leftOpen, setLeftOpen] = useState(false),
    [rightOpen, setRightOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("mrwhite-team-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const [toast, setToast] = useState("");
  const input = useRef(),
    end = useRef();
  const team =
    state.teams.find((t) => t.id === state.activeTeamId) || state.teams[0];
  const project =
    team.projects.find((p) => p.id === team.activeProjectId) ||
    team.projects[0];
  const members = teamMembers(team);
  const member = members.find((m) => m.id === project?.recipient) || members[0];
  const act = (action) =>
    dispatch({ ...action, teamId: team.id, projectId: project.id });
  const patchRole = (patch) =>
    act({ type: "patchRole", role: member.id, patch });
  const handoff = () => {
    act({
      type: "handoff",
      message: {
        id: crypto.randomUUID(),
        kind: "handoff",
        from: member.id,
        recipient: "director",
        text: roleSummary(project, member.id),
        createdAt: new Date().toISOString(),
      },
    });
    setWorkspaceView("chat");
    setToast("已提交總監，尚未執行 AI 審核。");
  };
  const patchTeam = (patch) =>
    dispatch({ type: "patchTeam", teamId: team.id, patch });
  const patchProject = (patch) =>
    project &&
    dispatch({
      type: "patchProject",
      teamId: team.id,
      projectId: project.id,
      patch,
    });
  const openInfo = (next = "skills") => {
    setLibrary(next);
    setLeftOpen(false);
    setRightOpen(false);
  };
  const appendResources = (resources) =>
    dispatch({
      type: "appendResources",
      teamId: team.id,
      projectId: project.id,
      resources,
    });
  useEffect(() => {
    if (loaded.error) return;
    const timer = setTimeout(() => persist(state), 500);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    try {
      localStorage.setItem("mrwhite-team-theme", theme);
    } catch {
      /* Theme preference is optional. */
    }
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [project?.id, project?.messages.length]);
  const send = (e) => {
    e?.preventDefault();
    const text = project?.draft.trim();
    if (!text) return;
    patchProject({
      messages: [
        ...project.messages,
        {
          id: crypto.randomUUID(),
          text,
          recipient: member.id,
          createdAt: new Date().toISOString(),
        },
      ],
      draft: "",
    });
    setToast("已保存，尚未送往模型。");
    input.current?.focus();
  };
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mr-white-teams-preview.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chooseMember = (t, m) => {
    dispatch({ type: "selectTeam", id: t.id });
    const p =
      t.projects.find((p) => p.id === t.activeProjectId) || t.projects[0];
    if (p)
      dispatch({
        type: "patchProject",
        teamId: t.id,
        projectId: p.id,
        patch: { recipient: m.id },
      });
    else setModal("project");
    setLeftOpen(false);
    setLibrary(null);
    setWorkspaceView(null);
  };
  return (
    <div
      className={`tw ${library ? "tw-library-open" : ""}`}
      data-theme={theme}
    >
      {(leftOpen || rightOpen) && (
        <button
          className="tw-scrim"
          aria-label="關閉側欄"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}
      <aside
        className={`tw-left ${leftOpen ? "open" : ""}`}
        aria-label="團隊導覽"
      >
        <div className="tw-brand">
          <span className="tw-brand-mark">
            w<span>·</span>
          </span>
          <span>懷特先生</span>
          <IconButton
            label="關閉團隊導覽"
            className="tw-icon tw-mobile"
            onClick={() => setLeftOpen(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <div className="tw-nav-title">
          <span>Bot Team</span>
          <IconButton label="創建團隊" onClick={() => setModal("team")}>
            <Plus size={18} />
          </IconButton>
        </div>
        <nav className="tw-teams">
          {state.teams.map((t) => (
            <div className="tw-team" key={t.id}>
              <div
                className={`tw-team-row ${team.id === t.id ? "active" : ""}`}
              >
                <button
                  className="tw-expand"
                  aria-label={`${collapsed[t.id] ? "展開" : "收合"}${t.name}`}
                  aria-expanded={!collapsed[t.id]}
                  onClick={() =>
                    setCollapsed({ ...collapsed, [t.id]: !collapsed[t.id] })
                  }
                >
                  {collapsed[t.id] ? (
                    <CaretRight size={12} />
                  ) : (
                    <CaretDown size={12} />
                  )}
                </button>
                <button
                  className="tw-team-select"
                  onClick={() => chooseMember(t, members[0])}
                >
                  <UsersThree size={17} />
                  <span>{t.name}</span>
                  {activity.some(a=>a.teamId===t.id)&&<ProcessingIndicator compact label={`${t.name}正在處理任務`} />}
                </button>
                <IconButton
                  label={`${t.name}的團隊資訊`}
                  onClick={() => {
                    dispatch({ type: "selectTeam", id: t.id });
                    openInfo();
                  }}
                >
                  <SlidersHorizontal size={16} />
                </IconButton>
              </div>
              {!collapsed[t.id] && (
                <div className="tw-members">
                  {teamMembers(t).map((m) => (
                    <button
                      key={m.id}
                      className={`tw-member ${team.id === t.id && member.id === m.id && project ? "selected" : ""}`}
                      onPointerMove={lookAtPointer}
                      onPointerLeave={resetLook}
                      onClick={() => chooseMember(t, m)}
                    >
                      <Avatar member={m} small />
                      <span>{m.name}</span>
                      {activity.some(a=>a.teamId===t.id&&a.role===m.id)&&<ProcessingIndicator compact label={activity.filter(a=>a.teamId===t.id&&a.role===m.id).map(a=>`${t.projects.find(p=>p.id===a.projectId)?.name||'專案'}：${a.label}`).join('；')} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <button className="tw-add-team" onClick={() => setModal("team")}>
          <Plus size={16} /> 新增團隊
        </button>
        <div className="tw-sidebar-bottom">
          <div className="tw-user">
            <span className="tw-user-avatar">Y</span>
            <div>我的工作空間</div>
            <IconButton
              label={theme === "dark" ? "切換亮色模式" : "切換深色模式"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
          </div>
          <a className="tw-legacy" href="?view=archive">
            封存工作台 <ArrowUpRight size={12} />
          </a>
        </div>
      </aside>

      {library ? (
        <TeamLibrary
          key={`${team.id}:${library}`}
          team={team}
          project={project}
          patchTeam={patchTeam}
          patchProject={patchProject}
          appendResources={appendResources}
          initialTab={library}
          close={() => setLibrary(null)}
          addResource={() => setModal("resource")}
        />
      ) : (
        <>
          <main className="tw-main">
            <header className="tw-header">
              <div className="tw-header-path">
                <IconButton
                  label="開啟團隊導覽"
                  className="tw-icon tw-mobile"
                  onClick={() => setLeftOpen(true)}
                >
                  <SidebarSimple size={20} />
                </IconButton>
              </div>
              <button
                className="tw-bot-pill"
                onClick={() => openInfo("members")}
              >
                <Avatar member={member} small />
                <span>{member.name}</span>
                <CaretDown size={12} />
              </button>
              <div className="tw-header-actions">
                <span className="tw-preview">
                  {"本機工作區"}
                </span>
                <IconButton
                  label="團隊資訊"
                  onClick={() => openInfo("members")}
                >
                  <Info size={19} />
                </IconButton>
                <IconButton
                  label="開啟專案內容"
                  className="tw-icon tw-project-toggle"
                  onClick={() => setRightOpen(true)}
                >
                  <FolderSimple size={20} />
                </IconButton>
              </div>
            </header>
            {saveError && (
              <div className="tw-error" role="alert">
                {saveError}
                <button onClick={exportData}>匯出資料</button>
              </div>
            )}
            {project && (
              <div className="rw-view-tabs">
                {member.id === "director" || member.id === "social" ? (
                  <strong>
                    {member.id === "social" ? "社群排程" : "專案對話"}
                  </strong>
                ) : (
                  <>
                    <button
                      className={workspaceView !== "work" ? "selected" : ""}
                      onClick={() => setWorkspaceView("chat")}
                    >
                      專案對話
                    </button>
                    <button
                      className={workspaceView === "work" ? "selected" : ""}
                      onClick={() => setWorkspaceView("work")}
                    >
                      {roleNames[member.id] || "工作區"}
                    </button>
                  </>
                )}
                <span>{project.name}</span>
              </div>
            )}
            {project && (member.id==='analyst'||member.roleType==='analyst') ? <PerformanceWorkspace {...{team,project}} /> : project && (member.id==='social'||member.roleType==='social') ? <LocalSchedule key={`${team.id}:${project.id}`} {...{team,project}} /> : project &&
            (team.blueprint || ["director", "writer", "designer", "research"].includes(member.id)) ? (
              member.id === "director" || workspaceView !== "work" ? (
                <TeamRunConversation
                  beforeSend={() => persist(state)}
                  key={`${team.id}:${project.id}`}
                  {...{ team, project, member }}
                />
              ) : (
                <TeamOutputs
                  key={`${team.id}:${project.id}:${member.id}`}
                  {...{ team, project, member }}
                />
              )
            ) : project && member.id === "social" ? (
              <LocalSchedule
                key={`${team.id}:${project.id}`}
                {...{ team, project }}
              />
            ) : (
              <div className="tw-conversation" aria-label="專案對話">
                {project &&
                member.id !== "director" &&
                workspaceView !== "chat" ? (
                  <RoleDashboard
                    key={`${team.id}:${project.id}:${member.id}`}
                    team={team}
                    project={project}
                    member={member}
                    patchRole={patchRole}
                    act={act}
                    handoff={handoff}
                    openLibrary={openInfo}
                  />
                ) : project?.messages.length ? (
                  <div className="tw-timeline">
                    <div className="tw-timeline-start">
                      <span>專案對話</span>
                      <p>一個專案，一條持續的對話。</p>
                    </div>
                    {project.messages.map((msg) => (
                      <article className="tw-message" key={msg.id}>
                        <div className="tw-message-meta">
                          {msg.kind === "handoff"
                            ? `你 · 提交${members.find((m) => m.id === msg.from)?.name || "專員"}回報`
                            : "你"}{" "}
                          <span>
                            交給{" "}
                            {members.find((m) => m.id === msg.recipient)
                              ?.name || "總監"}
                          </span>
                        </div>
                        <div className="tw-message-bubble">{msg.text}</div>
                        <small>
                          <Check size={12} /> 已保存
                        </small>
                      </article>
                    ))}
                    <div ref={end} />
                  </div>
                ) : project && member.id === "director" ? (
                  <DirectorConversation project={project} />
                ) : (
                  <div className="tw-welcome">
                    <Avatar member={member} />
                    <h1>{project ? member.name : team.name}</h1>
                    <p>
                      {project ? member.role : "建立一個專案，開始與團隊合作。"}
                    </p>
                    {project ? (
                      <div className="tw-welcome-project">
                        <FolderSimple size={14} />
                        <span>{project.name}</span>
                      </div>
                    ) : (
                      <button
                        className="tw-primary"
                        onClick={() => setModal("project")}
                      >
                        <Plus size={16} /> 建立第一個專案
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {!team.blueprint && !["director", "writer", "designer", "research", "social", "analyst"].includes(
              member.id,
            ) && (
              <div className="tw-composer-wrap">
                <div className="tw-context-line">
                  <span>
                    <Avatar member={member} small />
                    交給 {member.name}
                  </span>
                  <button onClick={() => openInfo("skills")}>
                    <Cube size={14} />
                    {team.skills.length
                      ? `${team.skills.length} 個 Skills`
                      : "設定團隊 Skills"}
                    <CaretRight size={12} />
                  </button>
                </div>
                <form className="tw-composer" onSubmit={send}>
                  <textarea
                    ref={input}
                    aria-label="給團隊的訊息"
                    placeholder={
                      project
                        ? `傳訊息給${member.name}…`
                        : "先建立專案，再開始對話"
                    }
                    value={project?.draft || ""}
                    disabled={!project}
                    maxLength={12000}
                    onChange={(e) => patchProject({ draft: e.target.value })}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        e.keyCode !== 229
                      ) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <div className="tw-composer-tools">
                    <IconButton
                      label="新增專案參考資料"
                      type="button"
                      disabled={!project}
                      onClick={() => setModal("resource")}
                    >
                      <Paperclip size={19} />
                    </IconButton>
                    <button
                      type="button"
                      className="tw-model"
                      onClick={() => setModal("model")}
                    >
                      <span className="tw-model-symbol">⌘</span>
                      {team.model}
                      <CaretDown size={12} />
                    </button>
                    <span className="tw-composer-spacer" />
                    <button
                      className="tw-send"
                      type="submit"
                      aria-label="送出訊息至預覽"
                      disabled={!project?.draft.trim()}
                    >
                      <ArrowUp size={18} weight="bold" />
                    </button>
                  </div>
                </form>
                <div className="tw-composer-caption">
                  預覽模式 · 尚未接入模型
                  <button onClick={() => openInfo("memory")}>
                    關於記憶 <ArrowUpRight size={10} />
                  </button>
                </div>
              </div>
            )}
          </main>

          <aside
            className={`tw-right ${rightOpen ? "open" : ""}`}
            aria-label="專案內容"
          >
            {member.id !== "director" && project ? (
              <>
                <div className="rw-panel-project">
                  <ProjectPicker
                    projects={team.projects}
                    value={project.id}
                    onChange={(id) => {
                      patchTeam({ activeProjectId: id });
                      dispatch({
                        type: "patchProject",
                        teamId: team.id,
                        projectId: id,
                        patch: { recipient: member.id },
                      });
                      setWorkspaceView(null);
                    }}
                  />
                  <IconButton
                    label="新增專案"
                    onClick={() => setModal("project")}
                  >
                    <Plus size={16} />
                  </IconButton>
                </div>
                {(member.id==='analyst'||member.roleType==='analyst') ? <div className="tw-right-scroll rw-panel"><h3>資料來源</h3><p>目前使用本專案手動匯入的成效資料，尚未串接平台。</p><p>未提供的數字保留未知；洞察中的每個數字可展開查看來源列。歷史示範資料不參與分析。</p></div> : (member.id==='social'||member.roleType==='social') ? <AccountPanel key={`${team.id}:${project.id}`} {...{team,project}} patchRole={patch=>patchProject({roleData:{...project.roleData,social:{...project.roleData?.social,...patch}}})} close={()=>setRightOpen(false)}/> : (team.blueprint || ["writer", "designer", "research"].includes(member.id)) ? (
                  <TeamLivePanel
                    act={act}
                    close={() => setRightOpen(false)}
                    {...{ team, project, member }}
                    openLibrary={openInfo}
                  />
                ) : member.id === "social" ? (
                  <AccountPanel
                    key={`${team.id}:${project.id}`}
                    {...{ team, project, patchRole }}
                    close={() => setRightOpen(false)}
                  />
                ) : (
                  <RolePanel
                    key={`${team.id}:${project.id}:${member.id}`}
                    team={team}
                    project={project}
                    member={member}
                    patchRole={patchRole}
                    patchProject={patchProject}
                    act={act}
                    close={() => setRightOpen(false)}
                    openLibrary={openInfo}
                  />
                )}
              </>
            ) : (
              <>
                <div className="tw-right-heading">
                  <span>專案空間</span>
                  <div>
                    <IconButton
                      label="新增專案"
                      onClick={() => setModal("project")}
                    >
                      <Plus size={18} />
                    </IconButton>
                    <IconButton
                      label="關閉專案內容"
                      className="tw-icon tw-project-toggle"
                      onClick={() => setRightOpen(false)}
                    >
                      <X size={18} />
                    </IconButton>
                  </div>
                </div>
                <div className="tw-right-scroll">
                  <div className="tw-projects-label">
                    {team.name}的專案{" "}
                    <span>
                      {team.projects.length.toString().padStart(2, "0")}
                    </span>
                  </div>
                  <div className="tw-project-list">
                    {team.projects.map((p) => (
                      <button
                        key={p.id}
                        className={p.id === project?.id ? "selected" : ""}
                        onClick={() => {
                          patchTeam({ activeProjectId: p.id });
                          dispatch({
                            type: "patchProject",
                            teamId: team.id,
                            projectId: p.id,
                            patch: { recipient: "director" },
                          });
                          setWorkspaceView("chat");
                          setRightOpen(false);
                        }}
                      >
                        <FolderSimple size={17} />
                        <span>{p.name}</span>
                        {p.id === project?.id && (
                          <span className="tw-selected-dot" />
                        )}
                      </button>
                    ))}
                    <button
                      className="tw-new-project"
                      onClick={() => setModal("project")}
                    >
                      <Plus size={15} />
                      新增專案
                    </button>
                  </div>
                  {project ? (
                    <>
                      <div className="tw-project-cover">
                        <FolderSimple size={23} />
                        <h2>{project.name}</h2>
                        <small>{team.name} · 目前專案</small>
                      </div>
                      <section className="tw-project-section">
                        <div className="tw-section-head">
                          <h3>專案目標</h3>
                          <button onClick={() => setModal("brief")}>
                            編輯
                          </button>
                        </div>
                        <p>{project.brief || "尚未設定目標"}</p>
                      </section>
                      <section className="tw-project-section">
                        <div className="tw-section-head">
                          <h3>
                            參考資料 <small>{project.resources.length}</small>
                          </h3>
                          <IconButton
                            label="新增參考資料"
                            onClick={() => setModal("resource")}
                          >
                            <Plus size={16} />
                          </IconButton>
                        </div>
                        {project.resources.length ? (
                          <div className="tw-resources">
                            {project.resources.map((r) => (
                              <button
                                key={r.id}
                                onClick={() =>
                                  r.kind === "file"
                                    ? openInfo("knowledge")
                                    : setModal({ resource: r })
                                }
                              >
                                {r.kind === "link" ? (
                                  <LinkSimple size={17} />
                                ) : (
                                  <FileText size={17} />
                                )}
                                <span>
                                  {r.name}
                                  <small>已保存 · 尚未解析</small>
                                </span>
                                <CaretRight size={12} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            className="tw-resource-empty"
                            onClick={() => setModal("resource")}
                          >
                            <FileText size={20} />
                            <span>加入連結或筆記</span>
                            <Plus size={15} />
                          </button>
                        )}
                      </section>
                      <section className="tw-project-section">
                        <div className="tw-section-head">
                          <h3>專案記憶</h3>
                          <button onClick={() => setModal("memory")}>
                            編輯
                          </button>
                        </div>
                        <p>{project.memory || "尚無記憶"}</p>
                      </section>
                    </>
                  ) : (
                    <div className="tw-project-empty">
                      <FolderSimple size={32} />
                      <h3>專案從這裡開始</h3>
                      <p>每個專案都有自己的對話、參考資料與記憶。</p>
                    </div>
                  )}
                </div>
                <button className="tw-team-settings" onClick={() => openInfo()}>
                  <SlidersHorizontal size={17} />
                  <span>團隊設定</span>
                  <ArrowUpRight size={14} />
                </button>
              </>
            )}
          </aside>
        </>
      )}
      {modal === "team" && (
        <Modal
          title="創建團隊"
          subtitle="選擇團隊類型"
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = data.get("name").trim();
              if (!name) return;
              const newTeam=createTeam(name);
              const kickoff=createProject('團隊任務');
              newTeam.setup={status:'interview'};newTeam.projects=[kickoff];newTeam.activeProjectId=kickoff.id;
              dispatch({ type: "addTeam", team: newTeam });
              setModal(null);
              setLibrary(null);
              setToast("總監已就位，請告訴他這個團隊要完成什麼任務。");
            }}
          >
            <div className="tw-template-grid">
              {[
                {
                  name: "行銷團隊",
                  desc: "內容、設計、社群與成效",
                  icon: Megaphone,
                },
                {
                  name: "設規團隊",
                  desc: "分析、設計、Pitch",
                  icon: PaintBrush,
                },
                {
                  name: "商務團隊",
                  desc: "業務開發與商機偵查",
                  icon: Binoculars,
                },
                {
                  name: "財政團隊",
                  desc: "收支、預算與現金流",
                  icon: ChartBar,
                },
              ].map((t, i) => (
                <button
                  type="button"
                  disabled={i > 0}
                  key={t.name}
                  className={i === 0 ? "selected" : ""}
                >
                  <t.icon size={23} />
                  <strong>{t.name}</strong>
                  <small>{t.desc}</small>
                  {i === 0 ? (
                    <CheckCircle size={17} weight="fill" />
                  ) : (
                    <span>即將推出</span>
                  )}
                </button>
              ))}
            </div>
            <label className="tw-field">
              團隊名稱
              <input
                name="name"
                defaultValue={`行銷團隊 ${state.teams.length + 1}`}
                required
                maxLength={40}
                autoFocus
              />
            </label>
            <p className="tw-form-note">
              <Info size={16} />
              同類型團隊可以重複建立。Skills、模型設定與專案各自獨立，不會複製其他團隊的設定。
            </p>
            <div className="tw-dialog-footer">
              <button
                type="button"
                className="tw-secondary"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button className="tw-primary" type="submit">
                創建團隊 <ArrowUpRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "project" && (
        <Modal
          title="新增專案"
          subtitle={`讓${team.name}專注在一個明確的目標。`}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = data.get("name").trim();
              if (!name) return;
              dispatch({
                type: "addProject",
                teamId: team.id,
                project: createProject(name, data.get("brief").trim()),
              });
              setModal(null);
              setToast("專案已建立，對話與資料獨立保存。");
            }}
          >
            <label className="tw-field">
              專案名稱
              <input
                name="name"
                placeholder="例如：冬季品牌企劃"
                maxLength={60}
                required
                autoFocus
              />
            </label>
            <label className="tw-field">
              你想完成什麼？
              <textarea
                name="brief"
                rows={4}
                maxLength={3000}
                placeholder="描述品牌、對象或預期成果…"
              />
            </label>
            <p className="tw-form-note">
              這個專案只屬於「{team.name}」。切換成員仍沿用同一條專案對話。
            </p>
            <div className="tw-dialog-footer">
              <button
                type="button"
                className="tw-secondary"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button type="submit" className="tw-primary">
                建立專案
              </button>
            </div>
          </form>
        </Modal>
      )}
      {(modal === "brief" || modal === "memory") && project && (
        <Modal
          title={modal === "brief" ? "專案目標" : "專案記憶"}
          subtitle={project.name}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              patchProject({ [modal]: data.get("text").trim() });
              setModal(null);
            }}
          >
            <label className="tw-field">
              {modal === "brief"
                ? "寫下希望團隊完成的事"
                : "保留重要決定、語氣與偏好"}
              <textarea
                name="text"
                defaultValue={project[modal]}
                rows={7}
                maxLength={10000}
                autoFocus
              />
            </label>
            <p className="tw-form-note">
              本次為手動保存。自動摘要與模型記憶尚未啟用。
            </p>
            <div className="tw-dialog-footer">
              <button type="submit" className="tw-primary">
                儲存
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "model" && (
        <Modal
          title="選擇模型提供者"
          subtitle={`只變更「${team.name}」的設定。`}
          close={() => setModal(null)}
        >
          <div className="tw-provider-list">
            {["Codex", "Claude Code", "Gemini"].map((name) => (
              <button
                key={name}
                onClick={() => {
                  patchTeam({ model: name });
                  setModal(null);
                }}
              >
                <span className="tw-provider-logo">
                  {name === "Codex" ? "⌘" : name === "Claude Code" ? "✳" : "✧"}
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>
                    {name === "Codex"
                      ? "預設 · 沿用既有本機執行器，待接入團隊頁"
                      : "尚未接入 · 僅保存偏好"}
                  </small>
                </span>
                {team.model === name && <Check size={18} />}
              </button>
            ))}
          </div>
          <p className="tw-form-note">
            此處選擇執行器，不會下載模型或新增 API 服務。預覽不會執行模型工作。
          </p>
        </Modal>
      )}
      {modal === "resource" && project && (
        <Modal
          title="加入參考資料"
          subtitle="資料只保存在目前專案。"
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = data.get("name").trim(),
                content = data.get("content").trim();
              if (!name || !content) return;
              patchProject({
                resources: [
                  ...project.resources,
                  {
                    id: crypto.randomUUID(),
                    name,
                    content,
                    kind: /^https?:\/\//i.test(content) ? "link" : "note",
                  },
                ],
              });
              setModal(null);
            }}
          >
            <label className="tw-field">
              資料名稱
              <input
                name="name"
                maxLength={100}
                required
                autoFocus
                placeholder="例如：品牌介紹、參考案例"
              />
            </label>
            <label className="tw-field">
              網站連結或文字筆記
              <textarea
                name="content"
                rows={5}
                maxLength={20000}
                required
                placeholder="貼上 https://… 或需要參考的內容"
              />
            </label>
            <p className="tw-form-note">
              目前保存連結與文字；網頁擷取、PDF 解析與索引將在後續接入。
            </p>
            <div className="tw-dialog-footer">
              <button className="tw-primary" type="submit">
                加入專案
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.resource && (
        <Modal
          title={modal.resource.name}
          subtitle="專案參考資料 · 尚未解析"
          close={() => setModal(null)}
        >
          <div className="tw-resource-content">{modal.resource.content}</div>
          <div className="tw-dialog-footer">
            <button
              className="tw-secondary"
              onClick={() => {
                patchProject({
                  resources: project.resources.filter(
                    (r) => r.id !== modal.resource.id,
                  ),
                });
                setModal(null);
              }}
            >
              移除資料
            </button>
            <button className="tw-primary" onClick={() => setModal(null)}>
              完成
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="tw-toast" role="status">
          <CheckCircle size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function DirectorConversation({ project }) {
  const outputs = ["writer", "designer"].map((role) => {
    const files = showcaseFiles(project, role).filter((f) => !f.deleted);
    return {
      role,
      count: files.length,
      done: files.filter((f) => f.status === "已完成").length,
    };
  });
  return (
    <div className="rw-director-demo">
      <div className="rw-demo-label">示範對話 · {project.name}</div>
      <article className="rw-demo-user">
        這週想用品牌故事帶動互動，幫我整理內容方向和團隊進度。
      </article>
      <article className="rw-demo-answer">
        <div className="rw-demo-author">
          <Avatar member={members[0]} small />
          <strong>總監</strong>
        </div>
        <p>
          這週先圍繞「好設計，藏在日常裡」，讓故事、圖面和社群發布保持同一個方向。
        </p>
        <div className="rw-demo-deliverables">
          {outputs.map((o) => (
            <div key={o.role}>
              <span>{o.role === "writer" ? "內容寫手" : "設計圖面"}</span>
              <strong>
                {o.count} 份{o.role === "writer" ? "內容" : "設計"}
              </strong>
              <small>
                {o.done} 份完成 · {o.count - o.done} 份進行中
              </small>
            </div>
          ))}
        </div>
        <p>
          接下來先確認品牌故事的開場，再收斂封面視覺。社群排程和本週成效，已整理在對應專員的工作區。
        </p>
        <small>示範內容，尚未執行模型或派工。</small>
      </article>
    </div>
  );
}
