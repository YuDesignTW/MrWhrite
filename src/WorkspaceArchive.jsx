import React, { useEffect, useState } from "react";
import { api, download } from "./api";
export default function WorkspaceArchive() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("works");
  useEffect(() => {
    api("/archive")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div
      className="tw"
      style={{
        display: "block",
        overflow: "auto",
        padding: "40px max(24px,8vw)",
      }}
    >
      <a href="/">← 回團隊工作區</a>
      <h1 style={{ marginTop: 30 }}>封存庫</h1>
      <p className="rw-inline-note">
        舊介面已退出主要流程。歷史作品、草稿與對話保留，這裡僅供查閱及匯出。
      </p>
      <div className="rw-small-tabs">
        {Object.entries({
          works: "作品",
          drafts: "草稿",
          articles: "文章",
          messages: "對話",
        }).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}>
            {label} {data?.[id]?.length || 0}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {data?.[tab]?.map((r) => (
        <details className="rw-live-run" key={r.id}>
          <summary>{r.title || r.text?.slice(0, 70) || r.id}</summary>
          <pre>{JSON.stringify(r, null, 2)}</pre>
          <button
            onClick={() => download(`${r.id}.json`, JSON.stringify(r, null, 2))}
          >
            匯出
          </button>
        </details>
      ))}
    </div>
  );
}
