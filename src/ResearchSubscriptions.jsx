import React, { useState, useEffect } from "react";
import { api } from "./api";
export function ResearchSubscriptions({ base }) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [name, setName] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      api(base + "/research-subscriptions")
        .then((v) => live && setRows(v))
        .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [base]);
  async function act(path, method, body) {
    setBusy(true);
    setError("");
    try {
      await api(base + "/research-subscriptions" + path, method, body);
      setRows(await api(base + "/research-subscriptions"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rw-section">
      <h3>產業資料定期收集</h3>
      <p>
        每日一次 ·
        本機服務開啟時執行，關閉期間不執行，重啟後補一次。只保存研究資料，不自動製作或發布。
      </p>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <article className="rw-live-run" key={r.id}>
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.name}
          </a>
          <p>
            {!r.enabled
              ? "已暫停"
              : {
                  pending: "等待首次收集",
                  collecting: "收集中",
                  collected: "已收集",
                  partial: "部分來源取得",
                  blocked: "讀取失敗",
                  interrupted: "等待補收集",
                }[r.status] || r.status}{" "}
            · {r.sources.length} 筆來源
          </p>
          <small>
            上次：
            {r.lastCollectedAt
              ? new Date(r.lastCollectedAt).toLocaleString("zh-TW")
              : "尚未收集"}
            <br />
            下次：
            {r.nextCheckAt
              ? new Date(r.nextCheckAt).toLocaleString("zh-TW")
              : "已暫停"}
          </small>
          {r.error && <p>{r.error}</p>}
          <div>
            <button
              disabled={busy || r.status === "collecting"}
              onClick={() => act("/" + r.id, "PATCH", { enabled: !r.enabled })}
            >
              {r.enabled ? "暫停" : "恢復"}
            </button>{" "}
            <button
              disabled={busy || !r.enabled || r.status === "collecting"}
              onClick={() => act("/" + r.id + "/collect", "POST", {})}
            >
              立即收集
            </button>
          </div>
          <details>
            <summary>查看已收集資料與紀錄</summary>
            {r.sources.map((s) => (
              <p key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <br />
                <small>
                  {s.summary?.slice(0, 250)}…<br />
                  收集時間：{s.collectedAt}
                </small>
              </p>
            ))}
            {r.history.slice(0, 5).map((h) => (
              <p key={h.startedAt}>
                {new Date(h.startedAt).toLocaleString("zh-TW")} · 取得 {h.count}{" "}
                筆 {h.errors.join("；")}
              </p>
            ))}
          </details>
        </article>
      ))}
      <details>
        <summary>新增公開來源</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act("", "POST", { url, name });
          }}
        >
          <label>
            來源名稱
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            公開網址
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
          </label>
          <button disabled={busy}>加入每日收集</button>
        </form>
      </details>
    </section>
  );
}
