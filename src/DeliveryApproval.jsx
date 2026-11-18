import React, { useEffect, useState } from "react";
import { api } from "./api";
export function DeliveryApproval({ run, base, onChange }) {
  const [accounts, setAccounts] = useState([]),
    [account, setAccount] = useState(""),
    [time, setTime] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(base + "/accounts")
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, [base]);
  async function approve() {
    setBusy(true);
    try {
      const a = await api(base + "/runs/" + run.id + "/review", "POST", {
        approved: true,
      });
      onChange({ ...run, approvedDeliveryId: a.id });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function schedule(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(base + "/schedule-delivery", "POST", {
        id: crypto.randomUUID(),
        deliveryId: run.approvedDeliveryId,
        accountId: account,
        scheduledAt: time + ":00+08:00",
        confirmed: true,
      });
      setDone(true);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {run.approvedDeliveryId ? (
        <p>成品已核准</p>
      ) : (
        <button disabled={busy} onClick={approve}>
          確認已審稿並核准成品
        </button>
      )}
      {run.approvedDeliveryId && !done && (
        <details>
          <summary>建立本機排程草稿</summary>
          <p>台北時間。只保存排程，不會送出平台。</p>
          <form onSubmit={schedule}>
            <select
              aria-label="本機帳號"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            >
              <option value="">選擇本機帳號</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform} {a.handle}
                </option>
              ))}
            </select>
            <input
              aria-label="台北排程時間"
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
            <button type="submit" disabled={busy}>
              確認建立排程草稿
            </button>
          </form>
        </details>
      )}
      {done && <p>已建立本機排程草稿，可到社群排程查看。</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function RunTrace({ run, base }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = async () =>
    setData(await api(base + "/runs/" + run.id + "/trace"));
  async function replay(id) {
    setBusy(true);
    try {
      await api(
        base + "/runs/" + run.id + "/trace/" + id + "/replay",
        "POST",
        {},
      );
      setNotice("已建立單一步驟重播，結果會出現在對話中。");
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revise(e, a) {
    e.preventDefault();
    setBusy(true);
    try {
      const raw = new FormData(e.currentTarget).get("content");
      await api(
        base + "/runs/" + run.id + "/artifacts/" + a.id + "/revise",
        "POST",
        { content: typeof a.content === "string" ? raw : JSON.parse(raw) },
      );
      await load();
      setNotice("已保存新版本，請續跑更新下游。");
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      onToggle={async (e) => {
        if (e.currentTarget.open)
          try {
            await load();
          } catch (e) {
            setError(e.message);
          }
      }}
    >
      <summary>輸入、來源與執行紀錄</summary>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data?.traces.map((t) => (
        <details key={t.id}>
          <summary>
            {t.nodeId} · 第 {t.attempt} 次 · {t.phase}
            {t.durationMs
              ? " · " + (t.durationMs / 1000).toFixed(1) + " 秒"
              : ""}
          </summary>
          <pre>
            {JSON.stringify(
              {
                sections: t.sections,
                skills: t.skills,
                usage: t.usage,
                validation: t.validation,
                error: t.error,
                prompt: t.payload?.prompt ?? "未保存或已到期",
              },
              null,
              2,
            )}
          </pre>
          {t.phase === "started" && t.payload?.prompt && (
            <button disabled={busy} onClick={() => replay(t.id)}>
              以原輸入重播此步驟（會呼叫模型）
            </button>
          )}
        </details>
      ))}
      {data?.artifacts.map((a) => (
        <details key={a.id}>
          <summary>
            {a.nodeId} · {a.type} · 版本 {a.version}
          </summary>
          <p>前置交付：{a.inputs?.join(", ") || "無"}</p>
          <pre>
            {typeof a.content === "string"
              ? a.content
              : JSON.stringify(a.content, null, 2)}
          </pre>
          {!["running", "queued"].includes(run.status) &&
            [
              "Copy",
              "DesignPlan",
              "ResearchReport",
              "TopicOptions",
              "Text",
            ].includes(a.type) &&
            data.nodes.some((n) => n.artifactId === a.id) && (
              <form onSubmit={(e) => revise(e, a)}>
                <textarea
                  name="content"
                  aria-label="編修交付內容"
                  rows={10}
                  defaultValue={
                    typeof a.content === "string"
                      ? a.content
                      : JSON.stringify(a.content, null, 2)
                  }
                />
                <p>保存為新版本；受影響的下游需續跑與重新審稿。</p>
                <button disabled={busy}>保存新版本</button>
              </form>
            )}
        </details>
      ))}
    </details>
  );
}
