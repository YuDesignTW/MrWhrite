import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowSquareOut,
  Star,
  FileText,
  ArrowClockwise,
  Trash,
  Check,
  LinkSimple,
  Broadcast,
  Clock,
  Plugs,
  MagnifyingGlass,
  ArrowLeft,
  ArrowRight,
  Sparkle,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { api } from "./api";
import "./intelligence.css";
const labels = {
  threads: "Threads",
  instagram: "Instagram",
  manual: "手動文字",
  completed: "已完成",
  partial: "部分完成",
  failed: "失敗",
  queued: "等待發布",
  publishing: "發布中",
  published: "已發布",
  unknown: "結果待查核",
  missed: "已錯過",
  cancelled: "已取消",
  running: "執行中",
};
const date = (s) => (s ? new Date(s).toLocaleString("zh-TW") : "未知");
const safeLink = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};
const creativeDirections = [
  {
    id: "hook",
    title: "拆解開場",
    detail: "找出讀者停下來的理由",
    text: "請分析這則指定情報的開場、敘事順序與可帶走的價值，分清可見證據與推測。提出三種不同機制的原創開場、適合受眾及選擇理由。先討論，不要產生完整稿包。",
  },
  {
    id: "carousel",
    title: "製作輪播",
    detail: "一個觀點，六頁說清楚",
    text: "請以這則指定情報為靈感，發展符合嘉思學院定位的原創觀點，生成主文、Threads、IG 文案與六頁輪播待審稿。第二頁要能獨立吸引讀者，倒數第二頁提供可收藏的摘要。若核心事實不足，先問我一個必要問題。",
  },
  {
    id: "reel",
    title: "短影片分鏡",
    detail: "開場、口播與畫面節奏",
    text: "請根據這則指定情報準備一支約 30 秒的原創短影片腳本，先給三種開場（口播、畫面字分開），再給推薦方案的時間、口播、畫面與字幕分鏡表。只在對話回覆腳本，不產生文章稿包；時間為預估，沒有逐字稿或畫面時請說明素材限制，不要假裝看過影片。",
  },
];
function SourceMedia({ post, busy, work, onChange }) {
  const media = post.localMedia;
  if (!media && !post.mediaAnalysis) return null;
  const available = media?.status === "available";
  return (
    <section className="intel-source-media" aria-label="原始圖文與分析">
      <h3>原始素材 · {media?.items?.length || 0} 項</h3>
      <p className="muted">
        {available
          ? "已下載，等待分析或審閱"
          : "原始素材已清除，文案與分析仍保留"}
      </p>
      {available && (
        <>
          <div className="intel-media-grid">
            {media.items.map((item) => (
              <figure key={item.order}>
                {item.type === "video/mp4" ? (
                  <video
                    controls
                    preload="metadata"
                    src={`/api/social/posts/${post.id}/media/${item.order}`}
                  />
                ) : (
                  <img
                    loading="lazy"
                    src={`/api/social/posts/${post.id}/media/${item.order}`}
                    alt={`原始輪播第 ${item.order} 張`}
                  />
                )}
                <figcaption>
                  {item.order} · {item.type === "video/mp4" ? "影片" : "圖片"}
                </figcaption>
              </figure>
            ))}
          </div>
          <label className="intel-retention">
            <input
              type="checkbox"
              checked={media.keep}
              disabled={busy}
              onChange={(e) => {
                const keep = e.target.checked;
                work(async () =>
                  onChange(
                    await api(
                      `/social/posts/${post.id}/media-retention`,
                      "PATCH",
                      { keep },
                    ),
                  ),
                );
              }}
            />
            分析後保留原始素材
          </label>
          <p className="muted">
            未勾選：分析成功後刪除；未完成分析的暫存最長保留約 24
            小時（服務運行時清理）。影片採均勻抽幀，不分析音訊。
          </p>
          <div className="intel-actions">
            <button
              disabled={busy}
              onClick={() =>
                work(async () =>
                  onChange(
                    await api(
                      `/social/posts/${post.id}/analyze-media`,
                      "POST",
                      {},
                    ),
                  ),
                )
              }
            >
              {busy
                ? "處理中…"
                : post.mediaAnalysis
                  ? "重新分析畫面"
                  : "分析圖片與影片"}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                work(async () =>
                  onChange(
                    await api(
                      `/social/posts/${post.id}/delete-media`,
                      "POST",
                      {},
                    ),
                  ),
                )
              }
            >
              刪除原始素材
            </button>
          </div>
        </>
      )}
      {post.mediaAnalysis && (
        <div className="intel-analysis">
          <h3>畫面分析</h3>
          <p>{post.mediaAnalysis.summary}</p>
          {post.mediaAnalysis.items.map((item) => (
            <details key={item.order}>
              <summary>第 {item.order} 項 · 觀察與限制</summary>
              <p>{item.observation}</p>
              <p className="muted">{item.limitation}</p>
            </details>
          ))}
          <h4>延伸觀點建議</h4>
          <p>{post.mediaAnalysis.angle}</p>
          <p className="muted">
            這是素材分析，尚未完成外部查核。可在下方筆記補充資料來源，再送往創作室。
          </p>
        </div>
      )}
    </section>
  );
}

function ResearchNotes({ post, busy, onSave, onCreate }) {
  const [notes, setNotes] = useState(
    () => post.research || { hook: "", structure: "", takeaway: "" },
  );
  const [saved, setSaved] = useState(
    post.research || { hook: "", structure: "", takeaway: "" },
  );
  const [version, setVersion] = useState(post.researchVersion || 0);
  const dirty = JSON.stringify(notes) !== JSON.stringify(saved);
  const save = async () => {
    const fresh = await onSave({
      research: notes,
      baseResearchVersion: version,
    });
    if (fresh) {
      setNotes(fresh.research);
      setSaved(fresh.research);
      setVersion(fresh.researchVersion);
    }
  };
  return (
    <section className="intel-research" aria-label="素材拆解">
      <div className="intel-section-title">
        <h3>素材拆解</h3>
        <span>{post.researchUpdatedAt ? "已保存筆記" : "你的觀察"}</span>
      </div>
      <p>留下值得借鑑的結構，長出自己的觀點。</p>
      <details>
        <summary>編輯拆解筆記{dirty ? " · 尚未保存" : ""}</summary>
        {[
          ["hook", "開場鉤子", "哪一句讓你停下來？"],
          ["structure", "敘事與畫面", "如何鋪陳、轉折、交付重點？"],
          ["takeaway", "我的延伸觀點", "這件事和我們的讀者有什麼關係？"],
        ].map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <textarea
              rows={2}
              maxLength={2000}
              value={notes[key]}
              placeholder={placeholder}
              onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
            />
          </label>
        ))}
        <button disabled={busy || !dirty} onClick={save}>
          {dirty ? "保存拆解筆記" : version ? "筆記已保存" : "填寫後保存"}
        </button>
      </details>
      <div className="intel-directions">
        {creativeDirections.map((d) => (
          <button
            key={d.id}
            disabled={busy || dirty}
            title={dirty ? "請先保存筆記" : d.detail}
            onClick={() => onCreate({ sourceId: post.id, text: d.text })}
          >
            <span>
              <strong>{d.title}</strong>
              <small>{d.detail}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      <small className="muted">
        {dirty
          ? "先保存筆記，再帶到創作工作台。"
          : "帶入這則情報，確認需求後才開始生成。"}
      </small>
    </section>
  );
}
export function Intelligence({ onDraft, onCreate }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tab, setTab] = useState("inbox"),
    [posts, setPosts] = useState([]),
    [selected, setSelected] = useState(null),
    [cursor, setCursor] = useState(null),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [favorite, setFavorite] = useState(false),
    [trash, setTrash] = useState(false);
  const [importing, setImporting] = useState(false),
    [kind, setKind] = useState("link"),
    [url, setUrl] = useState(""),
    [body, setBody] = useState(""),
    [platform, setPlatform] = useState("manual"),
    [preview, setPreview] = useState(null);
  const [sources, setSources] = useState([]),
    [sourceUrl, setSourceUrl] = useState(""),
    [schedule, setSchedule] = useState(null),
    [times, setTimes] = useState("09:00,18:00"),
    [runs, setRuns] = useState([]),
    [status, setStatus] = useState(null),
    [publications, setPublications] = useState([]),
    [callback, setCallback] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const requestId = useRef(0);
  const work = async (fn) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const load = async (more = false) => {
    const serial = ++requestId.current;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        date: dateFilter,
        source: sourceFilter,
        platform: filter,
        q: search,
        favorite: favorite ? "1" : "",
        trash: trash ? "1" : "",
      });
      if (more && cursor) q.set("cursor", cursor);
      const r = await api("/social/posts?" + q);
      if (serial !== requestId.current) return;
      setPosts((p) => (more ? [...p, ...r.items] : r.items));
      setCursor(r.nextCursor);
      if (!more)
        setSelected((p) => r.items.find((x) => x.id === p?.id) || null);
    } finally {
      if (serial === requestId.current) setLoading(false);
    }
  };
  const refresh = async () => {
    const [s, c, r, st, p] = await Promise.all([
      api("/social/sources"),
      api("/social/schedule"),
      api("/social/runs"),
      api("/social/status"),
      api("/social/publications"),
    ]);
    setSources(s);
    setSchedule(c);
    setTimes(c.times.join(","));
    setRuns(r);
    setStatus(st);
    setPublications(p);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load().catch((e) => setError(e.message)), 200);
    return () => {
      clearTimeout(t);
      requestId.current++;
    };
  }, [filter, search, favorite, trash, dateFilter, sourceFilter]);
  const patch = async (p, b) => {
    const fresh = await api("/social/posts/" + p.id, "PATCH", b);
    setSelected(fresh);
    await load();
    return fresh;
  };
  return (
    <section className="intel">
      <div className="intel-heading">
        <div>
          <div className="intel-eyebrow">JISTO · INTELLIGENCE</div>
          <h1>情報室</h1>
          <p>從一則好素材，找到下一個值得說的觀點。</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setImporting(!importing);
            setPreview(null);
          }}
        >
          <Plus size={17} />
          新增情報
        </button>
      </div>
      <nav className="intel-tabs" aria-label="情報室功能">
        {[
          ["inbox", "情報收件匣", FileText],
          ["sources", "追蹤與更新", Broadcast],
          ["publishing", "Threads 發布", Clock],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              if (id !== "inbox") refresh().catch((e) => setError(e.message));
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="intel-collection-strip">
        <span>
          <Broadcast size={15} />
          {status
            ? `Threads ${status.providers.threads ? "已設定" : "待設定"} · IG ${status.providers.instagram ? "已設定" : "待設定"}`
            : "正在讀取蒐集狀態…"}
        </span>
        <button onClick={() => setTab("sources")}>
          {schedule?.enabled
            ? `排程 ${schedule.times.join(" / ")}`
            : "設定追蹤與蒐集"}
          <ArrowRight size={14} />
        </button>
      </div>
      {error && (
        <div className="intel-notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="intel-notice" role="status">
          {message}
        </div>
      )}
      {importing && (
        <div className="intel-import">
          <div className="intel-section-title">
            <h2>留下新的情報</h2>
            <button onClick={() => setImporting(false)}>收起</button>
          </div>
          <div className="segmented">
            <button
              className={kind === "link" ? "active" : ""}
              onClick={() => {
                setKind("link");
                setPreview(null);
              }}
            >
              貼文連結
            </button>
            <button
              className={kind === "text" ? "active" : ""}
              onClick={() => {
                setKind("text");
                setPreview(null);
              }}
            >
              貼上文字
            </button>
          </div>
          {kind === "link" ? (
            <>
              <label>
                Threads／IG 單篇貼文網址
                <input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="https://www.instagram.com/p/…"
                />
              </label>
              <p className="muted">
                IG
                可直接下載公開貼文的圖片、影片與文案，不會讀取瀏覽器登入資料。Threads
                使用已設定的來源。
              </p>
              <button
                disabled={busy || !url.trim()}
                onClick={() =>
                  work(async () => {
                    let isInstagram = false;
                    try {
                      isInstagram = [
                        "instagram.com",
                        "www.instagram.com",
                      ].includes(new URL(url).hostname);
                    } catch {}
                    if (isInstagram) {
                      const result = await api(
                        "/social/instagram/import",
                        "POST",
                        { url, keep: false },
                      );
                      setPreview(null);
                      setImporting(false);
                      setUrl("");
                      setTab("inbox");
                      await load();
                      setSelected(result.post);
                      setMessage("已保存貼文與原始素材，可接著分析畫面。");
                    } else
                      setPreview(await api("/social/preview", "POST", { url }));
                  })
                }
              >
                {busy ? "正在取得素材…" : "取得貼文與素材"}
              </button>
            </>
          ) : (
            <>
              <label>
                正文
                <textarea
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="貼上值得保存的內容。保留原句、換行與你的閱讀脈絡。"
                />
              </label>
              <div className="intel-inline">
                <label>
                  來源平台
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option value="manual">未指定</option>
                    <option value="threads">Threads</option>
                    <option value="instagram">Instagram</option>
                  </select>
                </label>
                <label>
                  原文網址（選填）
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="保留來源，方便回看"
                  />
                </label>
              </div>
              <button
                className="primary"
                disabled={busy || !body.trim()}
                onClick={() =>
                  work(async () => {
                    const r = await api("/social/import", "POST", {
                      body,
                      platform,
                      url: url.trim() || null,
                    });
                    setMessage(
                      r.duplicate
                        ? r.post.deletedAt
                          ? "這篇情報在垃圾桶，可切換垃圾桶恢復。"
                          : "已經保存過這篇情報。"
                        : "情報已保存。",
                    );
                    setBody("");
                    setUrl("");
                    setImporting(false);
                    setTab("inbox");
                    await load();
                    setSelected(r.post);
                  })
                }
              >
                保存情報
              </button>
            </>
          )}
          {preview && (
            <div className="intel-preview">
              <small>
                {preview.post.author || "作者未知"} ·{" "}
                {date(preview.post.publishedAt)}
              </small>
              <p>{preview.post.body || "媒體貼文，沒有正文"}</p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  work(async () => {
                    const r = await api("/social/import", "POST", {
                      previewId: preview.id,
                    });
                    setMessage(
                      r.duplicate ? "這篇情報已存在。" : "情報已保存。",
                    );
                    setPreview(null);
                    setImporting(false);
                    setUrl("");
                    await load();
                    setSelected(r.post);
                  })
                }
              >
                確認保存
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "inbox" && (
        <>
          <div className={"intel-filters " + (filtersOpen ? "expanded" : "")}>
            <button
              className="intel-filter-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={16} />
              篩選
              {[dateFilter, sourceFilter, filter, favorite, trash].filter(
                Boolean,
              ).length || ""}
            </button>
            <div className="intel-search">
              <MagnifyingGlass size={16} />
              <input
                aria-label="搜尋情報"
                placeholder="搜尋內容或作者…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <input
              aria-label="發布日期（臺北）"
              title="原始發布日期（臺北時區）"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <select
              aria-label="來源篩選"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">全部來源</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {labels[s.platform]} · @{s.username}
                </option>
              ))}
            </select>
            <select
              aria-label="平台篩選"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">全部平台</option>
              <option value="threads">Threads</option>
              <option value="instagram">Instagram</option>
              <option value="manual">手動文字</option>
            </select>
            <button
              aria-pressed={favorite}
              className={favorite ? "active" : ""}
              onClick={() => setFavorite(!favorite)}
            >
              <Star size={15} weight={favorite ? "fill" : "regular"} />
              收藏
            </button>
            <button aria-pressed={trash} onClick={() => setTrash(!trash)}>
              <Trash size={15} />
              {trash ? "回到情報" : "垃圾桶"}
            </button>
          </div>
          <div className="intel-list-heading">
            <h2>{trash ? "垃圾桶" : favorite ? "收藏素材" : "靈感素材庫"}</h2>
            <span aria-live="polite">
              {loading
                ? "載入中…"
                : `已顯示 ${posts.length} 則${cursor ? " · 尚有更多" : ""}`}
            </span>
            <button
              disabled={busy || loading}
              aria-label="重新整理情報"
              onClick={() =>
                work(async () => {
                  await load();
                  await refresh();
                })
              }
            >
              <ArrowClockwise size={16} />
            </button>
          </div>
          <div
            className={"intel-grid " + (selected ? "has-selection" : "")}
            aria-busy={loading}
          >
            <div className="intel-list">
              {loading && !posts.length ? (
                <p className="intel-empty" role="status">
                  正在載入情報…
                </p>
              ) : !posts.length ? (
                <div className="intel-empty">
                  <FileText size={32} weight="light" />
                  <h2>
                    {search ||
                    filter ||
                    favorite ||
                    trash ||
                    dateFilter ||
                    sourceFilter
                      ? "這裡還沒有符合的情報"
                      : "把值得留下的貼文放進來"}
                  </h2>
                  <p>貼上連結或文字，開始建立你的情報收件匣。</p>
                  <button onClick={() => setImporting(true)}>
                    <Plus size={16} />
                    新增第一則情報
                  </button>
                </div>
              ) : (
                posts.map((p) => (
                  <button
                    key={p.id}
                    aria-pressed={selected?.id === p.id}
                    className={
                      "intel-card " + (selected?.id === p.id ? "selected" : "")
                    }
                    onClick={() => setSelected(p)}
                  >
                    <span className="intel-card-meta">
                      <span>
                        {labels[p.platform]}
                        <span className="intel-dot">·</span>
                        {p.author ? "@" + p.author : "手動收集"}
                      </span>
                      {p.favorite && <Star size={14} weight="fill" />}
                    </span>
                    <strong>{p.body.slice(0, 160) || "媒體貼文"}</strong>
                    <small>
                      {p.research?.takeaway ? "已留下延伸觀點 · " : ""}保存於{" "}
                      {date(p.createdAt)}
                    </small>
                  </button>
                ))
              )}
              {cursor && (
                <button disabled={busy} onClick={() => work(() => load(true))}>
                  載入更多
                </button>
              )}
            </div>
            <article className="intel-detail">
              {selected ? (
                <>
                  <button
                    className="intel-back"
                    onClick={() => setSelected(null)}
                  >
                    <ArrowLeft size={16} />
                    回到素材庫
                  </button>
                  <div className="intel-detail-meta">
                    <span>
                      {labels[selected.platform]} ·{" "}
                      {selected.manual
                        ? "手動貼上，未核對平台原文"
                        : selected.provider}
                    </span>
                    <button
                      disabled={busy}
                      aria-label={selected.favorite ? "取消收藏" : "收藏情報"}
                      onClick={() =>
                        work(() =>
                          patch(selected, { favorite: !selected.favorite }),
                        )
                      }
                    >
                      <Star
                        weight={selected.favorite ? "fill" : "regular"}
                        size={18}
                      />
                    </button>
                  </div>
                  <h2>
                    {selected.author
                      ? "@" + selected.author
                      : selected.localMedia
                        ? "原始貼文"
                        : "保存的文字"}
                  </h2>
                  <p className="muted">
                    原始發布時間：{date(selected.publishedAt)}
                  </p>
                  <div className="intel-body">
                    {selected.body || "此貼文沒有文字內容。"}
                  </div>
                  {selected.localMedia && !selected.deletedAt && (
                    <SourceMedia
                      post={selected}
                      busy={busy}
                      work={work}
                      onChange={(p) => {
                        setSelected(p);
                        load();
                      }}
                    />
                  )}
                  {!selected.localMedia && selected.media?.length > 0 && (
                    <p className="muted">
                      已記錄 {selected.media.length}{" "}
                      個媒體項目。請到原文查看圖片／影片。
                    </p>
                  )}
                  {!selected.deletedAt && (
                    <ResearchNotes
                      key={`${selected.id}:${selected.researchVersion || 0}`}
                      post={selected}
                      busy={busy}
                      onSave={(b) => work(() => patch(selected, b))}
                      onCreate={onCreate}
                    />
                  )}
                  <div className="intel-actions">
                    {safeLink(selected.url) && (
                      <a
                        href={safeLink(selected.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看原文 <ArrowSquareOut size={14} />
                      </a>
                    )}
                    {!selected.deletedAt && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          work(async () =>
                            onDraft(
                              await api(
                                "/social/posts/" + selected.id + "/draft",
                                "POST",
                                {},
                              ),
                            ),
                          )
                        }
                      >
                        複製原文到草稿
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() =>
                        work(async () => {
                          await patch(selected, {
                            deleted: !selected.deletedAt,
                          });
                          setSelected(null);
                          setMessage(
                            selected.deletedAt
                              ? "情報已恢復。"
                              : "已移至垃圾桶，可恢復。",
                          );
                        })
                      }
                    >
                      {selected.deletedAt ? "恢復情報" : "移至垃圾桶"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="intel-detail-empty">
                  <Sparkle size={26} weight="light" />
                  <h2>好內容，從看懂素材開始。</h2>
                  <p>
                    選一則情報，拆解它的開場與敘事，
                    <br />
                    再發展成你的輪播或短影片。
                  </p>
                  <div className="intel-reading-path">
                    <span>閱讀原文</span>
                    <ArrowRight size={14} />
                    <span>留下觀察</span>
                    <ArrowRight size={14} />
                    <span>開始創作</span>
                  </div>
                  <small>素材保留原始來源；創作稿件另外保存。</small>
                </div>
              )}
            </article>
          </div>
        </>
      )}
      {tab === "sources" && (
        <div className="intel-settings">
          <div className="intel-section">
            <h2>追蹤來源</h2>
            <p className="muted">
              加入公開帳號。通過資料來源驗證後，才會啟用自動搜集。
            </p>
            <form
              className="intel-inline"
              onSubmit={(e) => {
                e.preventDefault();
                work(async () => {
                  const s = await api("/social/sources", "POST", {
                    url: sourceUrl,
                  });
                  setSourceUrl("");
                  setMessage(
                    s.verified
                      ? "來源已驗證，可以搜集。"
                      : "來源已保存，待完成資料來源設定。",
                  );
                  await refresh();
                });
              }}
            >
              <input
                aria-label="追蹤帳號網址"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.threads.com/@…"
              />
              <button disabled={busy || !sourceUrl.trim()}>
                <Plus size={16} />
                加入來源
              </button>
            </form>
            {!sources.length && <p className="intel-empty">還沒有追蹤來源。</p>}
            {sources.map((s) => (
              <div className="intel-source" key={s.id}>
                <div>
                  <strong>
                    {labels[s.platform]} · @{s.username}
                  </strong>
                  <p>
                    {s.enabled ? "追蹤中" : s.verified ? "已暫停" : "待驗證"} ·
                    最近完整更新：{date(s.lastSuccess)}
                  </p>
                  {s.error && <small className="warning">{s.error}</small>}
                </div>
                <div className="intel-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      work(async () => {
                        await api("/social/sources/" + s.id, "PATCH", {
                          enabled: !s.enabled,
                        });
                        await refresh();
                      })
                    }
                  >
                    {s.enabled ? "暫停" : "驗證並啟用"}
                  </button>
                  <button
                    disabled={busy || !s.enabled}
                    onClick={() =>
                      work(async () => {
                        const r = await api(
                          "/social/sources/" + s.id + "/collect",
                          "POST",
                          {},
                        );
                        setMessage(
                          `${labels[r.status]}：新增 ${r.added}、既有 ${r.existing}`,
                        );
                        await refresh();
                      })
                    }
                  >
                    <ArrowClockwise size={15} />
                    立即更新
                  </button>
                  <button
                    disabled={busy}
                    aria-label={"移除 " + s.username}
                    onClick={() =>
                      work(async () => {
                        await api("/social/sources/" + s.id, "PATCH", {
                          deleted: true,
                        });
                        await refresh();
                      })
                    }
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {schedule && (
            <div className="intel-section">
              <h2>每日更新時間</h2>
              <p className="muted">
                只抓執行當日的貼文；不是最近 24
                小時。最後時段後的貼文可能漏收。本機需保持運行。
              </p>
              {!sources.some((source) => source.verified && source.enabled) && (
                <p className="warning" role="status">
                  尚無已驗證且啟用的來源，目前不會自動抓取。可先保存時間，再完成來源設定。
                </p>
              )}
              <div className="intel-inline">
                <label>
                  時區
                  <select
                    value={schedule.timeZone}
                    onChange={(e) =>
                      setSchedule({ ...schedule, timeZone: e.target.value })
                    }
                  >
                    <option>Asia/Taipei</option>
                    <option>UTC</option>
                    <option>Asia/Tokyo</option>
                    <option>America/New_York</option>
                  </select>
                </label>
                <label>
                  每日時間（以逗號分隔）
                  <input
                    value={times}
                    onChange={(e) => setTimes(e.target.value)}
                    placeholder="09:00,18:00"
                  />
                </label>
              </div>
              <label className="intel-checkbox">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(e) =>
                    setSchedule({ ...schedule, enabled: e.target.checked })
                  }
                />
                啟用每日自動搜集
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  work(async () => {
                    await api("/social/schedule", "PATCH", {
                      ...schedule,
                      times: times.split(",").map((x) => x.trim()),
                    });
                    setMessage(
                      schedule.enabled &&
                        !sources.some(
                          (source) => source.verified && source.enabled,
                        )
                        ? "設定已保存；目前沒有可執行來源，尚不會自動抓取。"
                        : "每日搜集設定已保存。",
                    );
                    await refresh();
                  })
                }
              >
                保存設定
              </button>
            </div>
          )}
          <div className="intel-section">
            <h2>最近更新紀錄</h2>
            {!runs.length ? (
              <p className="muted">尚未執行搜集。</p>
            ) : (
              runs.map((r) => (
                <div className="intel-run" key={r.id}>
                  <strong>
                    {sources.find((s) => s.id === r.sourceId)?.username ||
                      "已移除來源"}
                  </strong>
                  <span>
                    {labels[r.status]} · {r.day} · 新增 {r.added} / 既有{" "}
                    {r.existing}
                  </span>
                  {r.error && <small className="warning">{r.error}</small>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {tab === "publishing" && (
        <div className="intel-settings">
          <div className="intel-section">
            <h2>
              <Plugs size={20} /> Threads 官方連線
            </h2>
            <p>
              {status?.publishing.account
                ? `@${status.publishing.account.username} · ${status.publishing.account.connected ? "已連線" : "授權已過期"}`
                : "尚未綁定帳號"}
            </p>
            <p className="muted">
              發布前會確認目的帳號與純文字。請回文章編輯器使用「發布 Threads」。
            </p>
            {!status?.publishing.configured && (
              <div className="intel-notice">
                尚未設定 Meta
                應用。官方綁定與發文目前不可用；不影響手動情報保存。
              </div>
            )}
            <div className="intel-actions">
              <button
                disabled={busy || !status?.publishing.configured}
                onClick={() =>
                  work(async () => {
                    const r = await api("/social/threads/connect", "POST", {});
                    window.location.assign(r.url);
                  })
                }
              >
                前往官方授權
              </button>
              {status?.publishing.account?.connected && (
                <button
                  disabled={busy}
                  onClick={() =>
                    work(async () => {
                      await api("/social/threads/refresh", "POST", {});
                      await refresh();
                      setMessage("官方權杖已更新。");
                    })
                  }
                >
                  更新授權期限
                </button>
              )}
              {status?.publishing.account && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("解除綁定並取消尚未執行的發布？"))
                      work(async () => {
                        await api("/social/threads/disconnect", "POST", {});
                        await refresh();
                      });
                  }}
                >
                  解除綁定
                </button>
              )}
            </div>
            <details>
              <summary>完成官方回呼</summary>
              <p className="muted">
                本機模式：官方同意後，將設定的回呼頁面完整網址貼回此處。同一工作階段十分鐘內有效，網址中的授權碼不會寫入文章或備份。
              </p>
              <label>
                官方回呼網址
                <input
                  type="password"
                  value={callback}
                  autoComplete="off"
                  onChange={(e) => setCallback(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !callback}
                onClick={() =>
                  work(async () => {
                    await api("/social/threads/complete", "POST", {
                      url: callback,
                    });
                    setCallback("");
                    await refresh();
                    setMessage("Threads 已綁定。");
                  })
                }
              >
                完成綁定
              </button>
            </details>
          </div>
          <div className="intel-section">
            <h2>發布紀錄</h2>
            <p className="muted">
              本機休眠或關機時不會發布，錯過的工作需要重新安排。
            </p>
            {!publications.length ? (
              <p className="intel-empty">
                尚未建立發布工作。先寫一篇文章，再預覽發布。
              </p>
            ) : (
              publications.map((p) => (
                <div className="intel-publication" key={p.id}>
                  <div className="intel-section-title">
                    <strong>
                      @{p.username} · {labels[p.status]}
                    </strong>
                    <small>{date(p.scheduledAt)}</small>
                  </div>
                  <p>{p.text}</p>
                  {p.error && <p className="warning">{p.error}</p>}
                  {p.remoteStatus && (
                    <p>平台容器狀態：{p.remoteStatus}（未據此自動重送）</p>
                  )}
                  {!selected.deletedAt && (
                    <ResearchNotes
                      key={`${selected.id}:${selected.researchVersion || 0}`}
                      post={selected}
                      busy={busy}
                      onSave={(b) => work(() => patch(selected, b))}
                      onCreate={onCreate}
                    />
                  )}
                  <div className="intel-actions">
                    {safeLink(p.url) && (
                      <a
                        href={safeLink(p.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看貼文
                      </a>
                    )}
                    {p.status === "queued" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          work(async () => {
                            await api(
                              "/social/publications/" + p.id + "/cancel",
                              "POST",
                              {},
                            );
                            await refresh();
                          })
                        }
                      >
                        取消發布
                      </button>
                    )}
                    {["queued", "missed"].includes(p.status) && (
                      <Reschedule
                        disabled={busy}
                        onSubmit={(scheduledAt) =>
                          work(async () => {
                            await api(
                              "/social/publications/" + p.id + "/reschedule",
                              "POST",
                              { scheduledAt, confirm: true },
                            );
                            await refresh();
                          })
                        }
                      />
                    )}
                    {p.status === "unknown" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          work(async () => {
                            await api(
                              "/social/publications/" + p.id + "/check",
                              "POST",
                              {},
                            );
                            await refresh();
                          })
                        }
                      >
                        查核平台狀態
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {busy && (
        <div className="intel-working" role="status">
          正在處理，請稍候…
        </div>
      )}
    </section>
  );
}
function Reschedule({ disabled, onSubmit }) {
  const [at, setAt] = useState("");
  return (
    <>
      <input
        aria-label="新的發布時間"
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
      />
      <button
        disabled={disabled || !at}
        onClick={() => onSubmit(new Date(at).toISOString())}
      >
        確認改期
      </button>
    </>
  );
}
