import { DesignerWorkspace } from "./DesignerWorkspace.jsx";
import { WriterWorkspace } from "./WriterWorkspace.jsx";
import { SourceDiscovery } from "./SourceDiscovery.jsx";
import { ResearchArticles } from "./ResearchArticles.jsx";
import { ResearchSubscriptions } from "./ResearchSubscriptions.jsx";
import { TeamTracking } from "./TeamTracking.jsx";
import { CarouselDelivery } from "./CarouselDelivery.jsx";
import { ContentCollection } from "./ContentCollection.jsx";
import React, { useEffect, useRef, useState } from "react";
import { api, download } from "./api";
import { renderIGSlide } from "./ig-renderer";
function Slide({ slide, index, total }) {
  const ref = useRef(),
    [issues, setIssues] = useState([]);
  useEffect(() => {
    try {
      setIssues(
        renderIGSlide(ref.current, slide, index, total, { theme: "paper" }) ||
          [],
      );
    } catch (e) {
      setIssues([e.message]);
    }
  }, [slide, index, total]);
  return (
    <div>
      <canvas
        ref={ref}
        style={{ width: "100%", height: "auto", borderRadius: 8 }}
      />
      <button
        disabled={issues.length > 0}
        onClick={() =>
          ref.current.toBlob((blob) => {
            if (!blob) return;
            const u = URL.createObjectURL(blob),
              a = document.createElement("a");
            a.href = u;
            a.download = `slide-${index + 1}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          })
        }
      >
        下載 PNG
      </button>
      {issues.length > 0 && (
        <p role="alert">版面文字超出範圍，請在對話要求縮短後重新產出。</p>
      )}
    </div>
  );
}
export function TeamOutputs(props) {
  const m=props.member;
  if(m.id === "designer" || m.capability === "designer" || m.roleType === "designer") return <DesignerWorkspace key={`${props.team.id}:${props.project.id}:${m.id}`} {...props}/>;
  return (m.id === "writer" || m.capability === "writer" || m.roleType === "writer") ? <WriterWorkspace key={`${props.team.id}:${props.project.id}:${m.id}`} {...props}/> : <OtherTeamOutputs {...props}/>;
}
function OtherTeamOutputs({ team, project, member }) {
  const [runs, setRuns] = useState([]),
    [error, setError] = useState(""),
    [tab, setTab] = useState("成果"),
    [sources, setSources] = useState([]),
    [selected, setSelected] = useState([]),
    [tracked, setTracked] = useState([]),
    [sourceText, setSourceText] = useState(""),
    [sourceUrl, setSourceUrl] = useState("");
  const [researchView, setResearchView] = useState("articles");
  const isResearch = (member.capability || member.roleType || member.id) === "research";
  const HistoryContainer = isResearch ? "details" : "div";
  const base = `/teams/${team.id}/projects/${project.id}`;
  useEffect(() => {
    let live = true;
    const load = () =>
      api(base + "/runs")
        .then((r) => live && setRuns(r))
        .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [base]);
  async function loadSources() {
    try {
      const r = await api("/social/posts");
      setTracked(await api("/social/sources"));
      setSources(Array.isArray(r) ? r : r.items || []);
      setTab("情報");
    } catch (e) {
      setError(e.message);
    }
  }
  const outputs = runs.flatMap((r) =>
    r.steps
      .filter((s) => s.role === member.id && s.status === "completed")
      .map((s) => ({ ...s, runId: r.id, createdAt: r.createdAt })),
  );
  async function patchOutput(s, patch) {
    try {
      const r = await api(
        base + "/runs/" + s.runId + "/outputs/" + s.id,
        "PATCH",
        patch,
      );
      setRuns((v) => v.map((x) => (x.id === r.id ? r : x)));
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="tw-conversation">
      <div className={"rw-dashboard" + (isResearch ? " ra-workspace" : "")}>
        {isResearch ? (
          <nav className="ra-view-tabs" aria-label="研究工作分頁">
            {[["articles", "研究資料"], ["sources", "來源管理"]].map(([id, label]) => <button key={id} aria-current={researchView === id ? "page" : undefined} onClick={() => setResearchView(id)}>{label}</button>)}
          </nav>
        ) : <header className="rw-dashboard-head"><h2>{member.name}</h2><span>本機成果</span></header>}
        {isResearch && researchView === "articles" && <ResearchArticles key={base} base={base} team={team} />}
        {isResearch && researchView === "sources" && <>
          <SourceDiscovery key={base} base={base} />
          <details className="ra-management-section"><summary>既有網站與社群帳號追蹤</summary><ResearchSubscriptions base={base} /><TeamTracking base={base} /></details>
        </>}
        {(!isResearch || researchView === "articles") && <HistoryContainer className={isResearch ? "ra-history" : undefined}>
        {isResearch && <summary>研究紀錄與歷史交付</summary>}
        {runs
          .filter((r) => r.status === "running")
          .flatMap((r) =>
            r.steps
              .filter((s) => s.role === member.id && s.status === "running")
              .map((s) => (
                <div className="rw-task-strip" role="status" key={s.id}>
                  {s.kind === "trend_search"
                    ? "正在觸發本次趨勢搜尋"
                    : s.kind === "render"
                      ? "正在合成輪播圖片"
                      : "正在處理總監交辦的任務"}
                </div>
              )),
          )}
        {(member.capability || member.id) === "research" &&
          runs
            .filter((r) => r.search)
            .map((r) => (
              <section className="rw-section rw-search-report" key={r.id}>
                <header>
                  <h3>本次研究資料 · {r.search.sources.length} 筆</h3>
                  <small>
                    {new Date(r.search.fetchedAt).toLocaleString("zh-TW")}
                  </small>
                </header>
                <p className="rw-inline-note">
                  {r.search.query || "已保存的專案資料"} ·{" "}
                  {r.search.limitations}
                </p>
                {r.search.sources.map((source) => (
                  <article key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <small>
                      {source.publisher} · {source.publishedAt}
                    </small>
                  </article>
                ))}
              </section>
            ))}
        {["writer", "designer"].includes(member.id) &&
          runs
            .filter((r) => r.deliverable)
            .map((r) => <CarouselDelivery key={r.id} run={r} base={base} />)}
        {["writer", "designer"].includes(member.id) && (
          <ContentCollection {...{ team, project, member }} />
        )}
        {(member.capability || member.id) === "research" && (
          <div className="rw-small-tabs">
            <button onClick={() => setTab("成果")}>研究成果</button>
            <button onClick={loadSources}>既有情報</button>
          </div>
        )}
        <div className="rw-small-tabs">
          <button onClick={() => setTab("成果")}>
            新任務交付 {outputs.filter((s) => !s.deleted).length}
          </button>
          <button onClick={() => setTab("垃圾桶")}>垃圾桶</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {tab === "情報" ? (
          <>
            <section className="rw-section">
              <h3>追蹤來源</h3>
              {tracked.map((s) => (
                <article className="rw-live-run" key={s.id}>
                  <strong>{s.url}</strong>
                  <p>
                    {s.enabled ? "已啟用" : "未啟用"} ·{" "}
                    {s.verified ? "已驗證" : "待驗證"}
                  </p>
                  <button
                    disabled={!s.enabled}
                    onClick={async () => {
                      try {
                        const r = await api(
                          "/social/sources/" + s.id + "/collect",
                          "POST",
                          {},
                        );
                        setError(
                          `收集結果：${r.status}，新增 ${r.added || 0} 筆`,
                        );
                        await loadSources();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    立即收集
                  </button>
                </article>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api("/social/sources", "POST", { url: sourceUrl });
                    setSourceUrl("");
                    await loadSources();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <input
                  aria-label="追蹤來源網址"
                  type="url"
                  required
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="公開帳號網址"
                />
                <button>新增追蹤來源</button>
              </form>
            </section>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/social/import", "POST", {
                    body: sourceText,
                    url: sourceUrl || undefined,
                    platform: "manual",
                  });
                  setSourceText("");
                  setSourceUrl("");
                  await loadSources();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <textarea
                aria-label="情報內容"
                placeholder="貼入情報原文，保留可查證的內容"
                required
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                maxLength={12000}
              />
              <input
                aria-label="情報來源網址"
                type="url"
                placeholder="來源網址（選填）"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
              <button>收錄情報</button>
            </form>
            <p className="rw-inline-note">
              從既有情報選取素材，明確加入目前專案後供研究使用。
            </p>
            {sources.map((p) => (
              <label
                key={p.id}
                style={{
                  display: "block",
                  padding: 15,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked
                        ? [...v, p.id]
                        : v.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.body || p.text || p.title || p.content || p.url}
              </label>
            ))}
            <button
              onClick={async () => {
                try {
                  await api(base + "/sources", "POST", { ids: selected });
                  setError("已加入目前專案，後續任務會引用這些情報。");
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              加入專案
            </button>
          </>
        ) : (
          <>
            {!outputs.length && (
              <p className="rw-empty-state">
                尚無交付。到專案對話提出任務，完成後會出現在這裡。
              </p>
            )}
            {outputs
              .filter((s) => (tab === "垃圾桶" ? s.deleted : !s.deleted))
              .map((s) => {
                let design = null;
                try {
                  design = JSON.parse(
                    s.output.replace(/^```(?:json)?\s*|\s*```$/g, ""),
                  );
                } catch {}
                return (
                  <article className="rw-live-run" key={s.id}>
                    <header>
                      <input
                        aria-label="交付名稱"
                        defaultValue={s.name || `${member.name}交付`}
                        onBlur={(e) => {
                          if (e.target.value !== s.name)
                            patchOutput(s, { name: e.target.value });
                        }}
                      />
                      <button
                        onClick={() => patchOutput(s, { deleted: !s.deleted })}
                      >
                        {s.deleted ? "還原" : "移至垃圾桶"}
                      </button>
                      {new Date(s.createdAt).toLocaleString("zh-TW")}{" "}
                      <button
                        onClick={() =>
                          download(`${member.name}-${s.id}.md`, s.output)
                        }
                      >
                        下載原稿
                      </button>
                    </header>
                    {member.id === "designer" &&
                    Array.isArray(design?.slides) &&
                    design.slides.length >= 2 &&
                    design.slides.length <= 8 &&
                    design.slides.every(
                      (sl) =>
                        typeof sl.title === "string" &&
                        typeof sl.body === "string",
                    ) ? (
                      <div className="rw-file-grid">
                        {design.slides.map((sl, i) => (
                          <Slide
                            key={i}
                            slide={sl}
                            index={i}
                            total={design.slides.length}
                          />
                        ))}
                      </div>
                    ) : (
                      <pre>{s.output}</pre>
                    )}
                  </article>
                );
              })}
          </>
        )}
        </HistoryContainer>}
      </div>
    </div>
  );
}
