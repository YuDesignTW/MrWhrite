import React, { useEffect, useState } from "react";
import { api } from "./api";
const states = {
  pending: "等待首次收集",
  collecting: "收集中",
  partial: "已取得部分公開資料",
  collected: "已收集",
  blocked: "暫時無法讀取",
};
export function TeamTracking({ base }) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      api(base + "/tracking")
        .then((v) => live && setRows(v))
        .catch((e) => live && setError(e.message));
    setRows([]);
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
      await api(base + path, method, body);
      setRows(await api(base + "/tracking"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rw-section">
      <h3>追蹤帳號</h3>
      <p className="rw-inline-note">
        每日檢查 · 本機服務開啟時執行 · 公開資料不保證包含最新或全部貼文
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act("/tracking", "POST", { url });
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          aria-label="新增專案追蹤帳號"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="X、Threads、Instagram 帳號網址"
        />
        <button disabled={busy}>加入</button>
      </form>
      {busy && <p role="status">正在處理，完成後會更新結果…</p>}
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p>
          尚未追蹤帳號。也可以直接在對話貼上帳號，告訴趨勢偵查「追蹤這幾個帳號」。
        </p>
      )}
      {rows.map((a) => (
        <article key={a.id} className="rw-live-run">
          <a href={a.url} target="_blank" rel="noreferrer">
            {a.platform} · @{a.username}
          </a>
          <p>
            {a.enabled ? states[a.status] : "已暫停"} · {a.posts.length} 筆
          </p>
          {a.lastAttemptAt && (
            <small>
              上次嘗試：{new Date(a.lastAttemptAt).toLocaleString("zh-TW")}
            </small>
          )}
          {a.lastSuccessAt && (
            <small>
              上次取得資料：{new Date(a.lastSuccessAt).toLocaleString("zh-TW")}
            </small>
          )}
          {a.lastError && <p>{a.lastError}</p>}
          <button
            disabled={busy || !a.enabled}
            onClick={() => act(`/tracking/${a.id}/collect`, "POST", {})}
          >
            立即收集
          </button>{" "}
          <button
            disabled={busy}
            onClick={() =>
              act(`/tracking/${a.id}`, "PATCH", { enabled: !a.enabled })
            }
          >
            {a.enabled ? "暫停" : "恢復追蹤"}
          </button>
          {a.platform === "instagram" && (
            <details>
              <summary>補入單篇連結</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get("url");
                  act(`/tracking/${a.id}/posts`, "POST", { url: value });
                }}
              >
                <input
                  name="url"
                  type="url"
                  required
                  aria-label="Instagram 單篇圖片或影片網址"
                  placeholder="Instagram 貼文／Reel 連結"
                />
                <button disabled={busy}>收錄</button>
              </form>
              <small>
                帳號頁讀取受限時，可補入已知單篇；解析前會核對作者。
              </small>
            </details>
          )}
          {!!a.posts.length && (
            <details>
              <summary>收集內容</summary>
              {a.posts.map((p) => (
                <div key={p.url}>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    原始貼文
                  </a>
                  <p>{p.body || "未取得正文"}</p>
                  <small>{p.evidence}</small>
                  <p>
                    {p.mediaStatus === "analyzing"
                      ? "素材解析中"
                      : p.mediaStatus === "failed"
                        ? "解析失敗，可重試"
                        : p.analysis
                          ? "已分析畫面；未解析音訊"
                          : p.mediaStatus === "video_pending"
                            ? "影片待解析"
                            : "素材尚未解析"}
                  </p>
                  {p.analysisError && <p role="alert">{p.analysisError}</p>}
                  {a.platform === "instagram" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(`/tracking/${a.id}/analyze`, "POST", { url: p.url })
                      }
                    >
                      {p.analysis ? "重新解析" : "解析圖片／影片"}
                    </button>
                  )}
                  {p.analysis && (
                    <details>
                      <summary>素材觀察</summary>
                      <p>{p.analysis.summary}</p>
                      {p.analysis.items.map((i) => (
                        <p key={i.order}>
                          {i.order}. {i.observation}
                          <br />
                          {i.limitation}
                        </p>
                      ))}
                    </details>
                  )}
                </div>
              ))}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
