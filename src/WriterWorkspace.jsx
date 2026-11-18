import remarkGfm from "remark-gfm";
import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, download } from "./api";
import { WritingProfile } from "./WritingProfile.jsx";
import { ContentCollection } from "./ContentCollection.jsx";
import {
  writerRecords,
  writingLabels,
  groupWriterRecords,
} from "./writer-records.mjs";
import "./writer-workspace.css";
export function WriterWorkspace({ team, project, member }) {
  const base = `/teams/${team.id}/projects/${project.id}`;
  const [runs, setRuns] = useState([]),
    [tab, setTab] = useState("drafts"),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [trash, setTrash] = useState(false),
    [selected, setSelected] = useState(null),
    [versions, setVersions] = useState({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const r = await api(base + "/runs");
        if (live) {
          setRuns(r);
          setLoaded(true);
          setError("");
        }
      } catch (e) {
        if (live) setError(e.message);
      }
    }
    load();
    const timer = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [base]);
  const records = writerRecords(runs, member.id),
    visible = records.filter(
      (s) =>
        !!s.deleted === trash &&
        (type === "all" || s.type === type) &&
        (!query ||
          `${s.title} ${s.text}`.toLowerCase().includes(query.toLowerCase())),
    );
  const groups = groupWriterRecords(visible);
  const active = runs.some(
    (r) =>
      r.status === "running" &&
      r.steps?.some((s) => s.role === member.id && s.status === "running"),
  );
  async function mutate(action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function patch(s, body) {
    const updated = await api(
      base + "/runs/" + s.runId + "/outputs/" + s.id,
      "PATCH",
      body,
    );
    setRuns((v) => v.map((r) => (r.id === updated.id ? updated : r)));
  }
  async function reference(s) {
    const p = await api(base + "/writing-profile");
    if (p.samples.some((x) => x.content === s.text)) {
      setNotice("這份文字已在參考庫中。");
      return;
    }
    await api(base + "/writing-profile", "POST", {
      revision: p.revision,
      action: "sample",
      title: s.title.slice(0, 120),
      content: s.text,
      type: s.type,
      url: "",
    });
    setNotice("已加入團隊口吻參考庫，之後寫作可選用這份文案。");
  }
  return (
    <div className="tw-conversation">
      <main className="ww-workspace">
        <header className="ww-heading">
          <div>
            <h2>文案寫手</h2>
            <p>閱讀寫過的文案，累積團隊的口吻與修改偏好。</p>
          </div>
          <span>{project.name}</span>
        </header>
        <nav className="ww-tabs" aria-label="寫手工作區">
          {[
            ["drafts", "文案庫"],
            ["guide", "寫作口吻"],
            ["samples", "參考庫"],
            ["feedback", "回饋紀錄"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setNotice("");
              }}
            >
              {label}
              {id === "drafts"
                ? ` · ${groupWriterRecords(records.filter((s) => !s.deleted)).length}`
                : ""}
            </button>
          ))}
        </nav>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {tab !== "drafts" ? (
          <section className="ww-profile">
            <header>
              <h3>
                {
                  {
                    guide: "寫作口吻",
                    samples: "口吻參考庫",
                    feedback: "回饋紀錄",
                  }[tab]
                }
              </h3>
              <p>
                這些設定在 {team.name} 團隊內共用；文案庫則顯示目前專案的稿件。
              </p>
            </header>
            <WritingProfile
              key={base + tab}
              base={base}
              embedded
              initialTab={tab}
              projects={team.projects}
            />
          </section>
        ) : (
          <>
            {active && (
              <p className="rw-task-strip" role="status">
                寫手正在處理文案，完成後會出現在下方。
              </p>
            )}
            <div className="ww-toolbar">
              <input
                aria-label="搜尋文案"
                placeholder="搜尋標題或內文"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="文案類型"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="all">全部類型</option>
                {Object.entries(writingLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button aria-pressed={trash} onClick={() => setTrash(!trash)}>
                {trash
                  ? "返回文案庫"
                  : `垃圾桶 · ${records.filter((s) => s.deleted).length}`}
              </button>
            </div>
            {!loaded ? (
              <p className="ww-empty">正在讀取文案…</p>
            ) : !visible.length ? (
              <div className="ww-empty">
                <h3>
                  {query || type !== "all"
                    ? "沒有符合條件的文案"
                    : trash
                      ? "垃圾桶是空的"
                      : "這個專案還沒有寫手稿件"}
                </h3>
                <p>
                  {query || type !== "all"
                    ? "試著調整搜尋詞或文案類型。"
                    : trash
                      ? "移除的文案會保留在這裡，可隨時還原。"
                      : "到「對話」請寫手撰寫貼文或新聞稿，也可以由總監派工。完成後會自動保存在這裡。"}
                </p>
              </div>
            ) : (
              <div className="ww-document-list" aria-label="已寫文案">
                <div className="ww-list-columns" aria-hidden="true">
                  <span>文案名稱</span>
                  <span>類型／狀態</span>
                  <span>更新日期</span>
                  <span></span>
                </div>
                {groups.map((group) => {
                  const current =
                    group.items.find((s) => s.id === versions[group.id]) ||
                    group.items[0];
                  const open = selected === group.id;
                  return (
                    <section className="ww-record" key={group.id}>
                      <button
                        className="ww-record-toggle"
                        aria-expanded={open}
                        aria-controls={"copy-" + group.id}
                        onClick={() => {
                          setSelected(open ? null : group.id);
                          setNotice("");
                        }}
                      >
                        <span>
                          <strong>{group.title}</strong>
                          <small>
                            {current.origin}
                            {group.items.length > 1
                              ? ` · ${group.items.length} 次交付`
                              : ""}
                          </small>
                        </span>
                        <span className="ww-record-status">
                          {writingLabels[current.type]}
                          <small>{group.pending ? "待補資料" : "已保存"}</small>
                        </span>
                        <time>
                          {new Date(
                            group.items[0].createdAt,
                          ).toLocaleDateString("zh-TW")}
                        </time>
                        <span aria-hidden="true">{open ? "−" : "＋"}</span>
                      </button>
                      {open && (
                        <div id={"copy-" + group.id}>
                          <article className="ww-document" key={current.id}>
                            <header>
                              <div className="ww-open-tools">
                                {group.items.length > 1 && (
                                  <label>
                                    交付紀錄{" "}
                                    <select
                                      aria-label="切換同任務交付"
                                      value={current.id}
                                      onChange={(e) =>
                                        setVersions((v) => ({
                                          ...v,
                                          [group.id]: e.target.value,
                                        }))
                                      }
                                    >
                                      {group.items.map((item, i) => (
                                        <option key={item.id} value={item.id}>
                                          {i === 0 ? "最新交付" : "較早交付"} ·{" "}
                                          {new Date(
                                            item.createdAt,
                                          ).toLocaleString("zh-TW")}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                                <button onClick={() => setSelected(null)}>
                                  收合文案
                                </button>
                              </div>
                              <span>
                                {writingLabels[current.type]} · {current.origin}
                              </span>
                              <h3>{current.title}</h3>
                              <small>
                                {new Date(current.createdAt).toLocaleString(
                                  "zh-TW",
                                )}{" "}
                                · 寫手交付紀錄
                              </small>
                              <div className="ww-actions">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    mutate(async () => {
                                      await navigator.clipboard.writeText(
                                        current.text,
                                      );
                                      setNotice("已複製文案。");
                                    })
                                  }
                                >
                                  複製文案
                                </button>
                                <button
                                  onClick={() =>
                                    download(
                                      `${current.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 70)}.md`,
                                      current.text,
                                    )
                                  }
                                >
                                  下載
                                </button>
                                {!current.deleted && (
                                  <button
                                    disabled={
                                      busy || current.text.length > 20000
                                    }
                                    title={
                                      current.text.length > 20000
                                        ? "參考文最多20000字，請至參考庫貼入節選"
                                        : "將這份文案作為未來寫作的口吻範例"
                                    }
                                    onClick={() =>
                                      mutate(() => reference(current))
                                    }
                                  >
                                    加入口吻參考
                                  </button>
                                )}
                                <button
                                  disabled={
                                    busy || current.runStatus === "running"
                                  }
                                  onClick={() =>
                                    mutate(() =>
                                      patch(current, {
                                        deleted: !current.deleted,
                                      }),
                                    )
                                  }
                                >
                                  {current.deleted ? "還原" : "移至垃圾桶"}
                                </button>
                              </div>
                            </header>
                            {!!current.writingChecks?.warnings?.length && (
                              <div className="ww-checks">
                                {current.writingChecks.warnings.map((w) => (
                                  <p key={w}>{w}</p>
                                ))}
                              </div>
                            )}
                            <div className="ww-prose">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {current.text}
                              </ReactMarkdown>
                            </div>
                            <details className="ww-context">
                              <summary>這份文案的需求與口吻依據</summary>
                              <h4>當次需求</h4>
                              <p>{current.request}</p>
                              {current.writingProfile ? (
                                <>
                                  <h4>
                                    使用的口吻紀錄 · 第{" "}
                                    {current.writingProfile.revision} 版
                                  </h4>
                                  <p>
                                    {current.writingProfile.guide ||
                                      "未設定口吻指南。"}
                                  </p>
                                  <h4>參考文案</h4>
                                  {current.writingProfile.samples.map((s) => (
                                    <details key={s.id}>
                                      <summary>{s.title}</summary>
                                      <p>{s.content}</p>
                                    </details>
                                  ))}
                                  {!current.writingProfile.samples.length && (
                                    <p>未使用參考文案。</p>
                                  )}
                                  <h4>採用的回饋規則</h4>
                                  {current.writingProfile.rules.map((r) => (
                                    <p key={r.id}>{r.rule}</p>
                                  ))}
                                  {!current.writingProfile.rules.length && (
                                    <p>未使用已確認的回饋規則。</p>
                                  )}
                                </>
                              ) : (
                                <p>這份歷史紀錄未保存口吻快照。</p>
                              )}
                              <details>
                                <summary>重新命名</summary>
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const name = new FormData(
                                      e.currentTarget,
                                    ).get("title");
                                    mutate(() => patch(current, { name }));
                                  }}
                                >
                                  <input
                                    aria-label="文案名稱"
                                    name="title"
                                    required
                                    maxLength={120}
                                    defaultValue={current.title}
                                  />
                                  <button
                                    disabled={
                                      busy || current.runStatus === "running"
                                    }
                                  >
                                    儲存名稱
                                  </button>
                                </form>
                              </details>
                            </details>
                          </article>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            <details className="ww-archive">
              <summary>先前匯入的作品與版本</summary>
              <ContentCollection {...{ team, project, member }} />
            </details>
          </>
        )}
      </main>
    </div>
  );
}
