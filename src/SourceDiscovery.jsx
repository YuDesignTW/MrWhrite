import React, { useEffect, useState } from "react";
import { ResearchWatch } from "./ResearchWatch.jsx";
import {
  MagnifyingGlass,
  Plus,
  SlidersHorizontal,
  CaretDown,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { api } from "./api";
export function SourceDiscovery({ base }) {
  const [rows, setRows] = useState([]),
    [kind, setKind] = useState("web"),
    [request, setRequest] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [showExplore, setShowExplore] = useState(false),
    [showSettings, setShowSettings] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(null),
    [watch, setWatch] = useState(null),
    [loading, setLoading] = useState(true);
  const endpoint = base + "/research-discovery";
  useEffect(() => {
    let live = true;
    Promise.all([api(endpoint), api(base + "/research-watch")])
      .then(([r, w]) => {
        if (live) {
          setRows(r);
          setWatch(w);
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [endpoint, base]);
  async function act(path = "", body = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(endpoint + path, "POST", body);
      const [r, w] = await Promise.all([
        api(endpoint),
        api(base + "/research-watch"),
      ]);
      setRows(r);
      setWatch(w);
      if (path === "") {
        setShowExplore(false);
        setFilter("pending");
      }
      setNotice(
        path.endsWith("/select")
          ? result.kind === "web"
            ? "已加入固定來源，排程狀態維持原設定。"
            : "已加入觀察名單，尚未啟用貼文排程。"
          : path === ""
            ? "探索完成，請檢視候選。"
            : "已更新讀取結果。",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const status = (c) =>
    c.readStatus === "readable"
      ? "已讀取公開頁文字"
      : c.readStatus === "blocked"
        ? "讀取受限"
        : "尚未讀取內容";
  const byUrl = new Map();
  for (const batch of rows)
    for (const c of batch.candidates) {
      const previous = byUrl.get(c.url);
      if (!previous || (!previous.c.selected && c.selected))
        byUrl.set(c.url, { batch, c });
    }
  for (const url of watch?.sourceUrls || []) {
    const existing = byUrl.get(url);
    if (existing) existing.c = { ...existing.c, fixed: !existing.c.selected, selected: true };
    else
      byUrl.set(url, {
        batch: { kind: "web" },
        c: {
          id: url,
          title: new URL(url).hostname,
          url,
          selected: true,
          readStatus: "unread",
          evidence: [],
          fixed: true,
        },
      });
  }
  const entries = [...byUrl.values()];
  const visible = entries.filter(
    ({ c }) =>
      (filter === "all" || (filter === "added" ? c.selected : !c.selected)) &&
      (c.title + " " + c.url).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="research-articles source-manager">
      <header className="ra-heading">
        <div>
          <h2>來源管理</h2>
          <p>管理固定來源，挑選下一個值得觀察的網站與人物。</p>
        </div>
        <div className="ra-actions">
          <button
            aria-expanded={showSettings}
            onClick={async () => {
              setShowSettings(!showSettings);
              if (showSettings) {
                try {
                  setWatch(await api(base + "/research-watch"));
                } catch (e) {
                  setError(e.message);
                }
              }
            }}
          >
            <SlidersHorizontal size={17} />
            追蹤設定
          </button>
          <button
            className="tw-primary"
            aria-expanded={showExplore}
            onClick={() => setShowExplore(!showExplore)}
          >
            <Plus size={17} />
            找新來源
          </button>
        </div>
      </header>
      {showSettings && <ResearchWatch key={base} base={base} />}
      {showExplore && (
        <form
          className="sm-explore"
          onSubmit={(e) => {
            e.preventDefault();
            act("", { kind, request });
          }}
        >
          <label>
            來源類型
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="web">網站與產業媒體</option>
              <option value="linkedin">LinkedIn 人物與公司</option>
            </select>
          </label>
          <label>
            想找的方向
            <input
              maxLength={2000}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="例如：目標產業的新聞平台"
            />
          </label>
          <button className="tw-primary" disabled={busy}>
            {busy ? "探索中…" : "開始探索"}
          </button>
          <small>
            參考本專案關鍵字。網站探索範圍為近期新聞的發布媒體；LinkedIn
            搜尋仍受執行環境限制。
          </small>
        </form>
      )}
      {error && (
        <p className="ra-notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ra-notice" role="status">
          {notice}
        </p>
      )}
      <div className="sm-toolbar">
        <div className="sm-filters" aria-label="來源篩選">
          {[
            ["all", "全部", entries.length],
            ["added", "已加入", entries.filter((x) => x.c.selected).length],
            [
              "pending",
              "待選候選",
              entries.filter((x) => !x.c.selected).length,
            ],
          ].map(([id, label, count]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <label className="sm-search">
          <MagnifyingGlass size={16} />
          <input
            aria-label="搜尋來源"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋名稱或網址"
          />
        </label>
      </div>
      <div className="sm-list">
        <div className="sm-columns" aria-hidden="true">
          <span>來源</span>
          <span>類型</span>
          <span>內容狀態</span>
          <span>操作</span>
        </div>
        {loading ? (
          <p className="ra-empty" role="status">
            讀取來源中…
          </p>
        ) : !visible.length ? (
          <div className="ra-empty">
            <h3>
              {entries.length ? "沒有符合的來源" : "建立你的研究來源清單"}
            </h3>
            <p>
              {entries.length
                ? "換個名稱或篩選條件。"
                : "點選「找新來源」探索，或從追蹤設定加入網址。"}
            </p>
          </div>
        ) : (
          visible.map(({ batch, c }) => {
            const path = "/" + batch.id + "/candidates/" + c.id;
            return (
              <article key={c.url} className="sm-item">
                <div className="sm-row">
                  <div className="sm-name">
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title}
                      <ArrowSquareOut size={14} />
                    </a>
                    <small>
                      {new URL(c.url).hostname.replace(/^www\./, "")}
                    </small>
                  </div>
                  <span className="sm-type">
                    {batch.kind === "web" ? "網站／媒體" : "LinkedIn"}
                  </span>
                  <span className={"sm-status " + c.readStatus}>
                    {c.readStatus === "readable"
                      ? "公開頁可讀"
                      : c.readStatus === "blocked"
                        ? "讀取受限"
                        : "尚未讀取"}
                  </span>
                  <div className="sm-row-actions">
                    {c.selected ? (
                      <span className="sm-added">
                        {batch.kind === "linkedin"
                          ? "已加入觀察"
                          : "已加入來源"}
                      </span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => act(path + "/select")}
                      >
                        加入
                      </button>
                    )}
                    <button
                      aria-label={"查看" + c.title + "詳細資料"}
                      aria-expanded={expanded === c.url}
                      onClick={() =>
                        setExpanded(expanded === c.url ? null : c.url)
                      }
                    >
                      <CaretDown
                        size={16}
                        style={{
                          transform:
                            expanded === c.url ? "rotate(180deg)" : undefined,
                        }}
                      />
                    </button>
                  </div>
                </div>
                {expanded === c.url && (
                  <div className="sm-detail">
                    <div>
                      <h4>{c.fixed ? "固定來源" : "推薦依據"}</h4>
                      <p>
                        {c.reason || "你已加入的公開來源，可在追蹤設定中管理。"}
                      </p>
                      {c.summary && <p>{c.summary}</p>}
                      <small>{batch.coverage}</small>
                      {c.identityStatus && <p>{c.identityStatus}</p>}
                      <p>{status(c)}</p>
                      {c.readError && <p>{c.readError}</p>}
                      <small>公開頁可讀不代表所有文章或貼文皆可取得。</small>
                    </div>
                    <div>
                      <h4>參考文章與證據</h4>
                      {c.evidence?.length ? (
                        c.evidence.map((e) => (
                          <a
                            key={e.url}
                            href={e.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {e.title}
                            <ArrowSquareOut size={13} />
                          </a>
                        ))
                      ) : (
                        <p>尚無額外佐證。</p>
                      )}
                      <details>
                        <summary>讀取範圍</summary>
                        <p>{c.preview || "尚無預覽文字"}</p>
                        <small>{c.readLimit}</small>
                      </details>
                    </div>
                    {!c.fixed && c.selected && (
                      <div className="sm-detail-actions">
                        <button
                          disabled={busy}
                          onClick={() => act(path + "/read")}
                        >
                          讀取公開頁並保存
                        </button>
                        {batch.kind === "linkedin" && (
                          <button
                            disabled={busy}
                            onClick={() => act(path + "/posts")}
                          >
                            找公開貼文
                          </button>
                        )}
                      </div>
                    )}
                    {c.postsCheckedAt && (
                      <div className="sd-posts">
                        <h4>公開貼文候選</h4>
                        {!c.posts?.length && <p>未找到公開貼文。</p>}
                        {c.posts?.map((p) => (
                          <div key={p.id}>
                            <a href={p.url} target="_blank" rel="noreferrer">
                              {p.title}
                            </a>
                            <p>
                              {p.ownership} · {status(p)}
                            </p>
                            <button
                              disabled={busy}
                              onClick={() =>
                                act(path + "/posts/" + p.id + "/read")
                              }
                            >
                              讀取並保存
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
      <details className="sm-history">
        <summary>探索紀錄 · {rows.length} 次</summary>
        {rows.map((b) => (
          <p key={b.id}>
            {new Date(b.createdAt).toLocaleString("zh-TW")} ·{" "}
            {b.request || b.keywords.join("、")} · {b.candidates.length} 個候選
          </p>
        ))}
      </details>
    </section>
  );
}
