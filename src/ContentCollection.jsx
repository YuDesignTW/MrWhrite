import React, { useEffect, useState } from "react";
import { api } from "./api";
export const assetUrl = (p) =>
  "/api/content-library/file?path=" + encodeURIComponent(p);
export function ContentCollection({ team, project, member }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [versions, setVersions] = useState({}),
    [expanded, setExpanded] = useState(null),
    [catalog, setCatalog] = useState(null);
  const base = `/teams/${team.id}/projects/${project.id}`;
  async function load() {
    try {
      const r = await api(base + "/content");
      setItems(r.articles);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [base]);
  return (
    <section className="rw-section">
      <header>
        <h3>內容作品 · {items.length} 篇</h3>
        <button
          onClick={async () => {
            try {
              setCatalog((await api("/content-library")).articles);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          從歸檔加入
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {catalog && (
        <div className="rw-import-catalog">
          <button onClick={() => setCatalog(null)}>關閉</button>
          {catalog
            .filter((a) => !items.some((i) => i.id === a.id))
            .map((a) => (
              <button
                key={a.id}
                onClick={async () => {
                  try {
                    await api(base + "/content/import", "POST", {
                      ids: [a.id],
                    });
                    await load();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                ＋ {a.title}
              </button>
            ))}
        </div>
      )}
      <div className="rw-content-grid">
        {items.map((a) => {
          const v =
            a.versions.find(
              (v) => v.id === (versions[a.id] || a.preferredVersion),
            ) || a.versions[0];
          return (
            <article className="rw-content-article" key={a.id}>
              {v.images[0] && (
                <button
                  className="rw-content-cover"
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                >
                  <img
                    src={assetUrl(v.images[0])}
                    loading="lazy"
                    alt={a.title}
                  />
                </button>
              )}
              <div className="rw-content-info">
                <h3>{a.title}</h3>
                <small>
                  {a.versions.length} 個版本 · {v.images.length} 頁{" "}
                  {v.approved ? "· 已核准" : ""}
                </small>
                <select
                  aria-label={`${a.title}版本`}
                  value={v.id}
                  onChange={(e) =>
                    setVersions((x) => ({ ...x, [a.id]: e.target.value }))
                  }
                >
                  {a.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {v.approved ? " · 已核准" : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                >
                  {expanded === a.id ? "收合" : "查看圖文"}
                </button>
              </div>
              {expanded === a.id && (
                <div className="rw-content-detail">
                  {member.id === "designer" ? (
                    <div className="rw-file-grid">
                      {v.images.map((p, i) => (
                        <figure key={p}>
                          <img
                            src={assetUrl(p)}
                            loading="lazy"
                            alt={`${a.title} 第 ${i + 1} 頁`}
                          />
                          <a href={assetUrl(p)} download>
                            下載第 {i + 1} 頁
                          </a>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                  <h4>貼文文案</h4>
                  <pre>
                    {typeof v.caption === "string"
                      ? v.caption
                      : JSON.stringify(v.caption, null, 2)}
                  </pre>
                  <details open={member.id === "writer"}>
                    <summary>完整內容與來源</summary>
                    <pre>{v.copy}</pre>
                  </details>
                  <div className="rw-style-tags">
                    {v.files
                      .filter((f) => /\.(zip|md|txt|json)$/.test(f.path))
                      .map((f) => (
                        <a key={f.path} href={assetUrl(f.path)} download>
                          {f.path.split("/").at(-1)}
                        </a>
                      ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
