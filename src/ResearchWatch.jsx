import React, { useEffect, useState } from "react";
import { api } from "./api";
export function ResearchWatch({ base }) {
  const [config, setConfig] = useState(null),
    [keywords, setKeywords] = useState(""),
    [urls, setUrls] = useState(""),
    [days, setDays] = useState(1),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function apply(c) {
    setConfig(c);
    setKeywords(c.keywords.join("\n"));
    setUrls(c.sourceUrls.join("\n"));
    setDays(c.days);
    setEnabled(c.enabled);
  }
  async function load() {
    try {
      apply(await api(base + "/research-watch"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    let live = true;
    api(base + "/research-watch")
      .then((c) => live && apply(c))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [base]);
  return (
    <section className="ra-add">
      <header>
        <h3>本專案研究設定</h3>
        <button disabled={busy} onClick={load}>
          重新讀取
        </button>
      </header>
      <p>對話與這裡共用設定。研究資料保存在趨勢偵查，不自動加入知識庫。</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {config && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              apply(
                await api(base + "/research-watch", "PATCH", {
                  revision: config.revision,
                  keywords: keywords
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  sourceUrls: urls
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  days,
                  enabled,
                }),
              );
              setNotice("研究設定已保存。");
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            追蹤關鍵字（每行一個，最多12個）
            <textarea
              rows={4}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </label>
          <label>
            固定公開來源（每行一個 HTTPS 網址，最多5個）
            <textarea
              rows={3}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
            />
          </label>
          <label className="ra-checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            定期搜尋關鍵字與固定來源
          </label>
          <label>
            收集頻率
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>每日一次</option>
              <option value={7}>每週一次</option>
            </select>
          </label>
          <p>本機服務開啟時執行，關閉期間不執行，重新啟動後補一次。</p>
          <button disabled={busy}>保存設定</button>
          <p>
            上次檢查：
            {config.lastCheckedAt
              ? new Date(config.lastCheckedAt).toLocaleString("zh-TW")
              : "尚未執行"}{" "}
            · 下次：
            {config.nextCheckAt
              ? new Date(config.nextCheckAt).toLocaleString("zh-TW")
              : "未啟用"}
          </p>
          {config.lastError && <p>{config.lastError}</p>}
          <details>
            <summary>定期收集紀錄</summary>
            {config.history.length ? (
              config.history.map((h) => (
                <p key={h.at}>
                  {new Date(h.at).toLocaleString("zh-TW")} · 新增 {h.added}{" "}
                  篇，重複 {h.duplicates} 篇 {h.errors.join("；")}
                </p>
              ))
            ) : (
              <p>尚無收集紀錄。</p>
            )}
          </details>
        </form>
      )}
    </section>
  );
}
