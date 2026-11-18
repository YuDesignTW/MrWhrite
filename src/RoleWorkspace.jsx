import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  UploadSimple,
  FileText,
  X,
  FolderSimple,
  CaretDown,
  Check,
  InstagramLogo,
  ThreadsLogo,
  LinkedinLogo,
  CalendarBlank,
  Trash,
  ArrowCounterClockwise,
  DownloadSimple,
  Cube,
  TrendUp,
  Image as ImageIcon,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { roleNames } from "./role-workspaces.mjs";
import { saveFile, readFile, downloadFile } from "./team-files";
import {
  demoAccounts,
  activeAccount,
  demoCalendar,
  DEMO_TODAY,
  demoVideos,
  demoDaily,
  demoInsights,
  showcaseFiles,
  demoTrends,
} from "./workspace-demo.mjs";
import { api } from "./api";
import "./role-workspace.css";

const format = (n) => n.toLocaleString("zh-TW");
const platformIcons = {
  Instagram: InstagramLogo,
  Threads: ThreadsLogo,
  LinkedIn: LinkedinLogo,
};
function PlatformIcon({ platform, size = 20 }) {
  const Icon = platformIcons[platform] || InstagramLogo;
  return <Icon size={size} />;
}
function Section({ title, aside, children }) {
  return (
    <section className="rw-section">
      <header>
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
function MockBadge() {
  return <span className="rw-mock">示範資料</span>;
}
export function ProjectPicker({ projects, value, onChange }) {
  const [open, setOpen] = useState(false),
    ref = useRef(),
    trigger = useRef(),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="rw-project-dropdown"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="切換目前專案"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <FolderSimple size={15} />
        <span>{projects.find((p) => p.id === value)?.name || "選擇專案"}</span>
        <CaretDown size={13} />
      </button>
      {open && (
        <div className="rw-project-options" id={id} aria-label="專案選項">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === value}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span>{p.name}</span>
              {p.id === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function FileImage({ file, teamId, projectId }) {
  const [url, setUrl] = useState(file.image || ""),
    [missing, setMissing] = useState(false);
  useEffect(() => {
    if (file.image) {
      setUrl(file.image);
      return;
    }
    if (!file.blob || file.kind !== "image") return;
    let live = true,
      objectUrl;
    readFile(teamId, projectId, file.id)
      .then((blob) => {
        if (!live) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else setMissing(true);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.image, file.blob, teamId, projectId]);
  return url ? (
    <img src={url} alt={file.name} loading="lazy" />
  ) : (
    <div className="rw-file-placeholder">
      {missing ? (
        "找不到原檔"
      ) : file.kind === "image" ? (
        <ImageIcon size={30} />
      ) : (
        <FileText size={30} />
      )}
    </div>
  );
}
function FilePreview({ file, team, project, update, close }) {
  const ref = useRef(),
    [name, setName] = useState(file.name),
    [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  async function download() {
    try {
      if (file.blob) {
        await downloadFile(team.id, project.id, file);
        return;
      }
      if (file.image) {
        const a = document.createElement("a");
        a.href = file.image;
        a.download = file.name;
        a.click();
        return;
      }
      const url = URL.createObjectURL(
        new Blob([file.content || ""], { type: "text/markdown;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <dialog
      ref={ref}
      className="tw-dialog rw-file-dialog"
      onCancel={close}
      aria-label="檔案預覽"
    >
      <header>
        <span>
          {file.demo ? "示範檔案" : "本機檔案"} · {file.status}
        </span>
        <button aria-label="關閉預覽" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {file.kind === "image" ? (
        <FileImage file={file} teamId={team.id} projectId={project.id} />
      ) : (
        <pre>{file.content || "此檔案可下載至本機查看。"}</pre>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          update(file.id, { name: name.trim() });
          close();
        }}
      >
        <label>
          檔案名稱
          <input
            aria-label="檔案名稱"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <div>
          <button type="button" onClick={download}>
            <DownloadSimple size={15} />
            下載
          </button>
          <button
            type="button"
            onClick={() => {
              update(file.id, { deleted: !file.deleted });
              close();
            }}
          >
            {file.deleted ? (
              <ArrowCounterClockwise size={15} />
            ) : (
              <Trash size={15} />
            )}{" "}
            {file.deleted ? "還原" : "刪除"}
          </button>
          <button type="submit" className="tw-primary">
            儲存名稱
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
function FileWorkspace({ team, project, role, patchRole, act }) {
  const [tab, setTab] = useState("全部"),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const files = showcaseFiles(project, role),
    live = files.filter((f) => !f.deleted);
  const shown = files.filter(
    (f) =>
      (tab === "垃圾桶" ? f.deleted : !f.deleted) &&
      (tab !== "圖片" || f.kind === "image") &&
      (tab !== "文件" || f.kind === "document") &&
      (tab !== "進行中" || f.status === "進行中") &&
      (tab !== "已完成" || f.status === "已完成") &&
      f.name.toLowerCase().includes(query.toLowerCase()),
  );
  const update = (id, patch) =>
    act({ type: "updateShowcaseFile", role, id, patch });
  async function upload(e) {
    const input = [...e.target.files];
    e.target.value = "";
    setBusy(true);
    setError("");
    try {
      for (const file of input) {
        const image = ["image/png", "image/jpeg", "image/webp"].includes(
          file.type,
        );
        if (!image && !/\.(md|txt|pdf)$/i.test(file.name))
          throw Error("支援 PNG、JPEG、WebP、PDF、Markdown 與文字檔。");
        const saved = await saveFile(team.id, project.id, file);
        act({
          type: "appendShowcaseFile",
          role,
          item: {
            ...saved,
            kind: image ? "image" : "document",
            blob: true,
            content:
              !image && /\.(md|txt)$/i.test(file.name)
                ? (await file.text()).slice(0, 50000)
                : "",
            status: "已完成",
            deleted: false,
            demo: false,
            date: new Date().toISOString().slice(0, 10),
          },
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const tabs =
    role === "designer"
      ? ["全部", "圖片", "文件", "進行中", "已完成", "垃圾桶"]
      : ["全部", "進行中", "已完成", "垃圾桶"];
  return (
    <>
      <div className="rw-output-stats">
        <span>
          <strong>{live.length}</strong> 份
          {role === "designer" ? "設計" : "內容"}
        </span>
        <span>
          <i className="rw-dot amber" />
          {live.filter((f) => f.status === "進行中").length} 進行中
        </span>
        <span>
          <i className="rw-dot green" />
          {live.filter((f) => f.status === "已完成").length} 已完成
        </span>
        <label className="rw-import">
          <UploadSimple size={15} />
          {busy ? "匯入中…" : "匯入檔案"}
          <input
            aria-label="匯入工作區檔案"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,.pdf,.md,.txt"
            disabled={busy}
            onChange={upload}
          />
        </label>
      </div>
      <div className="rw-file-tools">
        <div className="rw-small-tabs">
          {tabs.map((t) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="rw-file-search">
          <MagnifyingGlass size={14} />
          <input
            aria-label="搜尋檔案"
            placeholder="搜尋"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="rw-inline-note">
          {error}
        </p>
      )}
      <div className={role === "writer" ? "rw-writing-list" : "rw-file-grid"}>
        {shown.map((file) => (
          <article key={file.id} className="rw-output-card">
            <button
              className="rw-output-open"
              onClick={() => setSelected(file.id)}
            >
              {role === "designer" ? (
                <FileImage
                  file={file}
                  teamId={team.id}
                  projectId={project.id}
                />
              ) : (
                <div className="rw-document-icon">
                  <FileText size={24} />
                </div>
              )}
              <div>
                <strong>{file.name}</strong>
                <small>
                  {file.date} · {file.demo ? "示範" : "本機"}
                  {role === "writer" && file.content
                    ? ` · ${file.content.length} 字`
                    : ""}
                </small>
                {role === "writer" && (
                  <p>
                    {file.content
                      ?.split("\n")
                      .filter(
                        (l) => l && !l.startsWith("#") && !l.startsWith("示範"),
                      )
                      .slice(0, 2)
                      .join(" ")}
                  </p>
                )}
              </div>
            </button>
            <footer>
              <span
                className={`rw-status ${file.status === "進行中" ? "amber" : "green"}`}
              >
                {file.status}
              </span>
              <button
                aria-label={`${file.deleted ? "還原" : "刪除"}${file.name}`}
                onClick={() => update(file.id, { deleted: !file.deleted })}
              >
                {file.deleted ? (
                  <ArrowCounterClockwise size={15} />
                ) : (
                  <Trash size={15} />
                )}
              </button>
            </footer>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="rw-empty-state">
          {tab === "垃圾桶" ? "垃圾桶是空的" : "沒有符合的檔案"}
        </div>
      )}
      {selected && files.find((f) => f.id === selected) && (
        <FilePreview
          file={files.find((f) => f.id === selected)}
          {...{ team, project, update }}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}
function SocialDashboard({ project }) {
  const account = activeAccount(project),
    days = demoCalendar(account.id),
    all = days.flatMap((d) => d.posts);
  const [day, setDay] = useState(null),
    [view, setView] = useState("排程");
  useEffect(() => {
    setDay(null);
    setView("排程");
  }, [account.id]);
  const upcoming = all.filter((p) => p.date > DEMO_TODAY),
    published = all.filter((p) => p.date <= DEMO_TODAY);
  const shown = (
    day
      ? all.filter((p) => p.date === day)
      : view === "排程"
        ? upcoming
        : published.slice().reverse()
  ).slice(0, 14);
  return (
    <>
      <div className="rw-account-title">
        <PlatformIcon platform={account.platform} size={22} />
        <div>
          <strong>{account.handle}</strong>
          <small>{account.name}</small>
        </div>
        <span>{account.platform}</span>
      </div>
      <div className="rw-stats">
        <div>
          <small>已發佈 · 本期累計</small>
          <strong>
            {published.length}
            <em>篇</em>
          </strong>
        </div>
        <div>
          <small>每週發布</small>
          <strong>
            {account.days.length}
            <em>天</em>
          </strong>
        </div>
        <div>
          <small>待發布</small>
          <strong>
            {upcoming.length}
            <em>篇</em>
          </strong>
        </div>
      </div>
      <Section title="發文頻率" aside={<small>2026.08 — 11</small>}>
        <div className="rw-heat-card">
          <div className="rw-heat-scroll">
            <div className="rw-months">
              <span>8 月</span>
              <span>9 月</span>
              <span>10 月</span>
              <span>11 月</span>
            </div>
            <div className="rw-heat-frame">
              <div className="rw-weekdays">
                <span>一</span>
                <span>三</span>
                <span>五</span>
                <span>日</span>
              </div>
              <div className="rw-heat-grid">
                {days.map((d) => (
                  <button
                    key={d.date}
                    className={`${d.date > DEMO_TODAY ? "future" : ""} ${day === d.date ? "chosen" : ""}`}
                    data-level={d.posts.length}
                    title={`${d.date} · ${d.posts.length} 篇${d.date > DEMO_TODAY ? "排程" : "貼文"}`}
                    aria-label={`${d.date}，${d.posts.length} 篇`}
                    aria-pressed={day === d.date}
                    onClick={() => setDay(day === d.date ? null : d.date)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="rw-heat-legend">
            <span>點選日期查看貼文</span>
            <small>少</small>
            {[0, 1, 2].map((l) => (
              <i key={l} data-level={l} />
            ))}
            <small>多</small>
            <i className="future" />
            <small>排程</small>
          </div>
        </div>
      </Section>
      <Section
        title={day ? `${day} 的貼文` : "貼文排程"}
        aside={
          day ? (
            <button onClick={() => setDay(null)}>全部日期</button>
          ) : (
            <div className="rw-small-tabs">
              {["排程", "已發佈"].map((t) => (
                <button
                  className={view === t ? "selected" : ""}
                  onClick={() => setView(t)}
                  key={t}
                >
                  {t}
                </button>
              ))}
            </div>
          )
        }
      >
        <div className="rw-schedule">
          {shown.map((p) => (
            <article key={p.id}>
              <div className="rw-date-box">
                <small>{p.date.slice(5, 7)} 月</small>
                <strong>{p.date.slice(8)}</strong>
              </div>
              <div>
                <strong>{p.title}</strong>
                <small>
                  {p.time} · {p.format}
                </small>
              </div>
              <span
                className={`rw-status ${p.status === "已排程" ? "blue" : "green"}`}
              >
                {p.status}
              </span>
            </article>
          ))}
          {!shown.length && <p className="rw-empty-state">這一天沒有貼文。</p>}
        </div>
      </Section>
    </>
  );
}
function AnalyticsDashboard() {
  const total = (key) => demoVideos.reduce((sum, r) => sum + r[key], 0);
  return (
    <>
      <div className="rw-date-range">
        <CalendarBlank size={15} />
        2026.11.07 — 11.13 <span>最近 7 天</span>
      </div>
      <div className="rw-stats">
        <div>
          <small>總觀看次數</small>
          <strong>{format(total("views"))}</strong>
          <span className="rw-positive">↑ 24.6% 較上期</span>
        </div>
        <div>
          <small>留言互動</small>
          <strong>{total("comments")}</strong>
          <span className="rw-positive">↑ 18.2% 較上期</span>
        </div>
        <div>
          <small>收藏次數</small>
          <strong>{total("saves")}</strong>
          <span className="rw-positive">↑ 31.4% 較上期</span>
        </div>
      </div>
      <Section title="觀看趨勢">
        <div className="rw-chart">
          <svg
            viewBox="0 0 600 155"
            role="img"
            aria-label="示範每日觀看趨勢，11月7日至13日：3800、4200、5100、4600、6200、5800、8100次"
          >
            <path
              d="M20 30H580 M20 75H580 M20 120H580"
              stroke="var(--line)"
              fill="none"
            />
            <path
              d={`M${demoDaily.map((n, i) => `${20 + i * 93},${140 - n / 80}`).join(" L")}`}
              fill="none"
              stroke="#9abda8"
              strokeWidth="2.5"
            />
            {demoDaily.map((n, i) => (
              <circle
                key={i}
                cx={20 + i * 93}
                cy={140 - n / 80}
                r="3.5"
                fill="#b9d7c5"
              />
            ))}
          </svg>
          <div>
            {demoDaily.map((n, i) => (
              <span key={i}>11/{7 + i}</span>
            ))}
          </div>
        </div>
      </Section>
      <Section title="近期影片">
        <div className="rw-video-list">
          {demoVideos.map((v, i) => (
            <article key={v.id}>
              <span className="rw-rank">0{i + 1}</span>
              <img src={v.image} alt="示範影片封面" />
              <div>
                <strong>{v.title}</strong>
                <small>Instagram · {v.date}</small>
              </div>
              <div className="rw-video-metric">
                <strong>{format(v.views)}</strong>
                <small>觀看</small>
              </div>
              <div className="rw-video-metric">
                <strong>{v.comments}</strong>
                <small>留言</small>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section title="觀察與優化">
        {demoInsights.map((insight, i) => (
          <article className="rw-insight" key={insight.title}>
            <span>0{i + 1}</span>
            <div>
              <small>{insight.tag}</small>
              <h4>{insight.title}</h4>
              <p>{insight.text}</p>
            </div>
          </article>
        ))}
      </Section>
    </>
  );
}
export function RoleDashboard({ team, project, member, patchRole, act }) {
  const role = member.id,
    [trendFilter, setTrendFilter] = useState("全部");
  return (
    <div className="rw-dashboard">
      <header className="rw-dashboard-head">
        <div>
          <span>{project.name}</span>
          <h2>{roleNames[role]}</h2>
        </div>
        <MockBadge />
      </header>
      {role === "social" && <SocialDashboard project={project} />}{" "}
      {role === "analyst" && <AnalyticsDashboard />}
      {["designer", "writer"].includes(role) && (
        <FileWorkspace {...{ team, project, role, patchRole, act }} />
      )}
      {role === "research" && (
        <>
          <div className="rw-trend-heading">
            <span>本週值得留意的方向</span>
            <small>更新於 11/13 · 示範觀測</small>
          </div>
          <div className="rw-small-tabs rw-trend-filters">
            {["全部", "內容敘事", "視覺設計", "社群話題"].map((t) => (
              <button
                key={t}
                className={trendFilter === t ? "selected" : ""}
                onClick={() => setTrendFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="rw-trend-list">
            {demoTrends
              .filter(
                (t) => trendFilter === "全部" || t.category === trendFilter,
              )
              .map((trend, i) => (
                <details key={trend.id} open={i === 0}>
                  <summary>
                    <span className="rw-trend-index">
                      0{demoTrends.indexOf(trend) + 1}
                    </span>
                    <div>
                      <small>{trend.category}</small>
                      <h3>{trend.topic}</h3>
                      <p>{trend.description}</p>
                    </div>
                    <div className="rw-trend-score">
                      <strong>{trend.heat}</strong>
                      <small>{trend.change}</small>
                    </div>
                  </summary>
                  <div className="rw-trend-detail">
                    <p>
                      <strong>建議方向</strong>
                      {trend.action}
                    </p>
                    <small>示範來源分類：{trend.sources}</small>
                    <div className="rw-trend-bar">
                      <span style={{ width: `${trend.heat}%` }} />
                    </div>
                  </div>
                </details>
              ))}
          </div>
        </>
      )}
      {role === "video" && (
        <p className="rw-empty-state">影片工作區將在下一輪規劃。</p>
      )}
    </div>
  );
}
function WriterSkills({ team, openLibrary }) {
  const [skills, setSkills] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api("/team-library/skills")
      .then((r) => live && setSkills(r.skills))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  const bindings = team.skills.filter(
    (s) => s.scope === "writer" || s.scope === "team",
  );
  const ids = bindings.length
    ? bindings.map((s) => s.id)
    : ["copy-carousel", "ig-caption", "ig-human"];
  const notes = {
    "copy-carousel": [
      "從真實人物、事件與選擇展開故事",
      "依目前專案確認的文案與版型基準",
    ],
    "ig-caption": ["自然的開場與貼文敘事", "補充圖面之外的觀點"],
    "ig-human": ["修整制式句型與冗餘轉折", "保留個人觀點與自然繁體中文"],
  };
  return (
    <>
      <Section
        title="寫作 Skills"
        aside={<small>{bindings.length ? "已選用" : "示範配置"}</small>}
      >
        {error && <p className="rw-inline-note">{error}</p>}
        {ids.map((id) => (
          <article className="rw-skill-tile" key={id}>
            <header>
              <Cube size={17} />
              <strong>
                {id === "copy-carousel"
                  ? "品牌故事"
                  : id === "ig-caption"
                    ? "貼文文案"
                    : id === "ig-human"
                      ? "自然語氣"
                      : id}
              </strong>
            </header>
            <ul>
              {(
                notes[id] || [
                  skills.find((s) => s.id === id)?.description ||
                    "讀取 Skill 說明中…",
                ]
              ).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <small>
              {id} {skills.find((s) => s.id === id) ? "· 本機檔案" : "· 未確認"}
            </small>
          </article>
        ))}
      </Section>
      <Section title="寫作界線">
        <ul className="rw-guidelines">
          <li>用具體例子表達觀點</li>
          <li>引述與數據需有來源</li>
          <li>避免空泛口號與虛構經驗</li>
        </ul>
        <small>示範規範</small>
      </Section>
      <button className="tw-secondary" onClick={() => openLibrary("skills")}>
        管理 Skills <ArrowUpRight size={14} />
      </button>
    </>
  );
}
export function RolePanel({
  team,
  project,
  member,
  patchRole,
  act,
  close,
  openLibrary,
}) {
  const role = member.id,
    account = activeAccount(project),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const assets = showcaseFiles(project, "designer").filter(
    (f) => !f.deleted && f.kind === "image" && f.status === "已完成",
  );
  async function upload(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw Error("請選擇 PNG、JPEG 或 WebP。");
      const record = await saveFile(team.id, project.id, file);
      act({
        type: "appendShowcaseFile",
        role: "designer",
        item: {
          ...record,
          kind: "image",
          blob: true,
          status: "已完成",
          demo: false,
          deleted: false,
          date: new Date().toISOString().slice(0, 10),
        },
      });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="tw-right-heading">
        <span>
          {role === "social"
            ? "社群帳號"
            : role === "designer"
              ? "Brand system"
              : role === "writer"
                ? "寫作風格"
                : role === "analyst"
                  ? "成效摘要"
                  : "觀察雷達"}
        </span>
        <button
          className="tw-icon tw-project-toggle"
          aria-label="關閉角色面板"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="tw-right-scroll rw-panel">
        <MockBadge />
        {role === "social" && (
          <>
            <div className="rw-account-list">
              {demoAccounts.map((a) => (
                <button
                  key={a.id}
                  aria-pressed={account.id === a.id}
                  className={account.id === a.id ? "selected" : ""}
                  onClick={() => {
                    patchRole({ showcaseAccount: a.id });
                    close();
                  }}
                >
                  <span className="rw-platform-icon" style={{ color: a.color }}>
                    <PlatformIcon platform={a.platform} />
                  </span>
                  <span>
                    <strong>{a.handle}</strong>
                    <small>
                      {a.platform} · {a.name}
                    </small>
                    <em className={a.status === "已連線" ? "green" : "amber"}>
                      <i />
                      {a.status}
                    </em>
                  </span>
                  {account.id === a.id && <Check size={14} />}
                </button>
              ))}
            </div>
            <Section title="同步狀態">
              <div className="rw-read-row">
                <span>最近同步</span>
                <strong>2 分鐘前</strong>
              </div>
              <div className="rw-read-row">
                <span>排程發布</span>
                <strong>
                  {account.status === "已連線" ? "準備就緒" : "等待授權"}
                </strong>
              </div>
              <div className="rw-read-row">
                <span>留言讀取</span>
                <strong>{account.status === "已連線" ? "正常" : "暫停"}</strong>
              </div>
            </Section>
            <p className="rw-inline-note">
              連線狀態與排程均為示範，不會實際發文。
            </p>
          </>
        )}
        {role === "analyst" && (
          <>
            <Section title="近期成效">
              <div className="rw-panel-big">
                <small>觀看次數</small>
                <strong>37,800</strong>
                <span>↑ 24.6%</span>
              </div>
              <div className="rw-read-row">
                <span>留言</span>
                <strong>166</strong>
              </div>
              <div className="rw-read-row">
                <span>收藏</span>
                <strong>877</strong>
              </div>
              <div className="rw-read-row">
                <span>按讚</span>
                <strong>2,407</strong>
              </div>
            </Section>
            <Section title="本週亮點">
              <div className="rw-highlight">
                <TrendUp size={20} />
                <h4>品牌故事，最值得延續</h4>
                <p>故事型內容的收藏表現較突出，可作為下週主題的優先方向。</p>
              </div>
            </Section>
            <Section title="下一步">
              <ol className="rw-next">
                <li>增加 1 篇品牌故事輪播</li>
                <li>測試午間與晚間時段</li>
                <li>持續追蹤收藏率與留言品質</li>
              </ol>
            </Section>
          </>
        )}
        {role === "designer" && (
          <>
            <Section title="示範品牌基底">
              <div className="rw-brand-board">
                <img
                  src="/ig-backgrounds/graphic-cover.png"
                  alt="示範品牌編輯圖板"
                />
                <img
                  src="/ig-backgrounds/street-content.png"
                  alt="示範街頭影像圖板"
                />
                <div>
                  <span>Aa</span>
                  <small>
                    Noto Sans TC
                    <br />
                    清楚、克制、有個性
                  </small>
                </div>
              </div>
              <div className="rw-brand-swatches">
                {["#191919", "#F2ECDf", "#EF321E"].map((c) => (
                  <div key={c}>
                    <span style={{ background: c }} />
                    <small>{c.toUpperCase()}</small>
                  </div>
                ))}
              </div>
              <div className="rw-style-tags">
                <span>編輯感</span>
                <span>真實敘事</span>
                <span>材質細節</span>
              </div>
            </Section>
            <Section title="視覺規範">
              <ul className="rw-guidelines">
                <li>圖片優先，文字保持呼吸空間</li>
                <li>一頁一個重點，封面清楚可讀</li>
                <li>紅色僅用於關鍵資訊</li>
              </ul>
            </Section>
            <Section
              title="既有素材"
              aside={
                <label className="rw-mini-upload">
                  <UploadSimple size={15} />
                  <input
                    aria-label="加入設計素材"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={upload}
                  />
                </label>
              }
            >
              <div className="rw-asset-library">
                {assets.map((a) => (
                  <figure key={a.id}>
                    <FileImage
                      file={a}
                      teamId={team.id}
                      projectId={project.id}
                    />
                    <figcaption>{a.name}</figcaption>
                  </figure>
                ))}
              </div>
              {error && (
                <p role="alert" className="rw-inline-note">
                  {error}
                </p>
              )}
            </Section>
          </>
        )}
        {role === "writer" && (
          <WriterSkills team={team} openLibrary={openLibrary} />
        )}
        {role === "research" && (
          <>
            <Section title="追蹤範圍">
              <div className="rw-read-row">
                <span>設計與品牌</span>
                <strong>12 個來源</strong>
              </div>
              <div className="rw-read-row">
                <span>社群話題</span>
                <strong>8 個來源</strong>
              </div>
              <div className="rw-read-row">
                <span>觀察頻率</span>
                <strong>每日</strong>
              </div>
            </Section>
            <Section title="關注主題">
              <div className="rw-style-tags">
                <span>品牌敘事</span>
                <span>視覺文化</span>
                <span>內容創作</span>
                <span>社群互動</span>
              </div>
            </Section>
            <Section title="本週摘要">
              <p className="rw-panel-copy">
                內容從抽象的知識整理，轉向具體、有立場的故事。品牌可以從日常的小細節切入，建立自己的觀察角度。
              </p>
            </Section>
            <p className="rw-inline-note">
              話題、熱度與來源數為示範，未執行爬取。
            </p>
          </>
        )}
        {role === "video" && <p className="rw-empty-state">留待下一輪規劃。</p>}
      </div>
      <button
        className="tw-team-settings"
        onClick={() => openLibrary("skills")}
      >
        團隊庫 <ArrowUpRight size={14} />
      </button>
    </>
  );
}
