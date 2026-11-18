import React, { useEffect, useState } from "react";
import {
  InstagramLogo,
  ThreadsLogo,
  LinkedinLogo,
} from "@phosphor-icons/react";
import { api } from "./api";
const icons = {
  Instagram: InstagramLogo,
  Threads: ThreadsLogo,
  LinkedIn: LinkedinLogo,
};
const baseOf = (team, project) => `/teams/${team.id}/projects/${project.id}`;
export function AccountPanel({ team, project, patchRole, close }) {
  const [accounts, setAccounts] = useState([]),
    [error, setError] = useState(""),
    [platform, setPlatform] = useState("Instagram"),
    [handle, setHandle] = useState("");
  const base = baseOf(team, project);
  async function load() {
    try {
      setAccounts(await api(base + "/accounts"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [base]);
  return (
    <div className="tw-right-scroll rw-panel">
      <button className="tw-project-toggle" onClick={close}>
        關閉面板
      </button>
      <h3>社群帳號</h3>
      <div className="rw-account-list">
        {accounts.map((a) => {
          const Icon = icons[a.platform];
          return (
            <button
              key={a.id}
              className={
                project.roleData?.social?.accountId === a.id ? "selected" : ""
              }
              onClick={() => {
                patchRole({ accountId: a.id });
                close();
              }}
            >
              <Icon size={22} />
              <span>
                <strong>{a.handle}</strong>
                <small>{a.platform} · 未串接</small>
              </span>
            </button>
          );
        })}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const a = await api(base + "/accounts", "POST", {
              platform,
              handle,
            });
            patchRole({ accountId: a.id });
            setHandle("");
            await load();
            window.dispatchEvent(new Event("mrwhite-schedule"));
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <label className="tw-field">
          平台
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {Object.keys(icons).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="tw-field">
          帳號名稱
          <input
            required
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={100}
          />
        </label>
        <button className="tw-secondary">加入本機帳號</button>
      </form>
      <p className="rw-inline-note">
        帳號名稱僅用於安排內容，尚未授權平台存取。所有排程需手動發布。
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
const taipeiDay = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
const rowDay = (r) =>
  taipeiDay(
    r.status === "published_manual" && r.publishedAt
      ? r.publishedAt
      : r.scheduledAt,
  );
const dateInput = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16);
};
export function LocalSchedule({ team, project }) {
  const [rows, setRows] = useState([]),
    [articles, setArticles] = useState([]),
    [accounts, setAccounts] = useState([]),
    [error, setError] = useState(""),
    [articleId, setArticle] = useState(""),
    [versionId, setVersion] = useState(""),
    [date, setDate] = useState(""),
    [day, setDay] = useState(null),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false);
  const base = baseOf(team, project),
    accountId =
      accounts.find((a) => a.id === project.roleData?.social?.accountId)?.id ||
      accounts[0]?.id;
  async function load() {
    try {
      const [r, c, a] = await Promise.all([
        api(base + "/schedule"),
        api(base + "/content"),
        api(base + "/accounts"),
      ]);
      setRows(r);
      setArticles(c.articles);
      setAccounts(a);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    window.addEventListener("mrwhite-schedule", load);
    return () => window.removeEventListener("mrwhite-schedule", load);
  }, [base]);
  useEffect(() => {
    setDay(null);
    setEdit(null);
  }, [accountId]);
  const article = articles.find((a) => a.id === articleId) || articles[0],
    version =
      article?.versions.find((v) => v.id === versionId) ||
      article?.versions.find((v) => v.id === article.preferredVersion) ||
      article?.versions[0];
  const current = rows.filter((r) => r.accountId === accountId),
    today = taipeiDay(Date.now()),
    start = new Date(today + "T00:00:00+08:00");
  start.setUTCDate(start.getUTCDate() - 70);
  const days = Array.from({ length: 98 }, (_, i) =>
    taipeiDay(start.getTime() + i * 86400000),
  );
  async function patch(row, body) {
    setBusy(true);
    try {
      await api(base + "/schedule/" + row.id, "PATCH", {
        revision: row.revision,
        ...body,
      });
      await load();
      setEdit(null);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const status = (r) =>
    r.status === "published_manual"
      ? "已手動發布"
      : r.status === "cancelled"
        ? "已取消"
        : Date.parse(r.scheduledAt) < Date.now()
          ? "已到期 · 待手動發布"
          : "待手動發布";
  return (
    <div className="tw-conversation">
      <div className="rw-dashboard">
        <header className="rw-dashboard-head">
          <h2>社群排程</h2>
          <span>
            {accounts.find((a) => a.id === accountId)?.handle ||
              "請在右側加入帳號"}
          </span>
        </header>
        <div className="rw-stats">
          <div>
            <small>待發布</small>
            <strong>
              {current.filter((r) => r.status === "scheduled").length}
            </strong>
          </div>
          <div>
            <small>已手動發布</small>
            <strong>
              {current.filter((r) => r.status === "published_manual").length}
            </strong>
          </div>
          <div>
            <small>平台狀態</small>
            <strong style={{ fontSize: 16 }}>未串接</strong>
          </div>
        </div>
        <section className="rw-section">
          <h3>發布與排程頻率 · 台北時間</h3>
          <div className="rw-heat-card">
            <div className="rw-heat-grid">
              {days.map((d) => {
                const count = current.filter(
                  (r) => r.status !== "cancelled" && rowDay(r) === d,
                ).length;
                return (
                  <button
                    key={d}
                    data-level={Math.min(count, 2)}
                    className={day === d ? "chosen" : d > today ? "future" : ""}
                    title={`${d}：${count} 篇`}
                    aria-label={`${d}，${count} 篇`}
                    onClick={() => setDay(day === d ? null : d)}
                  />
                );
              })}
            </div>
          </div>
        </section>
        <form
          className="rw-schedule-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(base + "/schedule", "POST", {
                accountId,
                articleId: article.id,
                versionId: version.id,
                scheduledAt: new Date(date + ":00+08:00").toISOString(),
              });
              setDate("");
              setError("");
              await load();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>新增排程</h3>
          <label>
            內容
            <select
              value={article?.id || ""}
              onChange={(e) => {
                setArticle(e.target.value);
                setVersion("");
              }}
            >
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            版本
            <select
              value={version?.id || ""}
              onChange={(e) => setVersion(e.target.value)}
            >
              {article?.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.approved ? " · 已核准" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            發布時間（Asia/Taipei）
            <input
              type="datetime-local"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            className="tw-primary"
            disabled={busy || !accountId || !article || !date}
          >
            儲存排程
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        <section className="rw-section">
          <header>
            <h3>{day || "全部排程"}</h3>
            {day && <button onClick={() => setDay(null)}>顯示全部</button>}
          </header>
          {current
            .filter((r) => !day || rowDay(r) === day)
            .map((r) => (
              <article className="rw-live-run" key={r.id}>
                <h3>{r.snapshot.title}</h3>
                <small>
                  {r.versionId} ·{" "}
                  {new Date(r.scheduledAt).toLocaleString("zh-TW", {
                    timeZone: "Asia/Taipei",
                  })}{" "}
                  · {status(r)}
                </small>
                {edit === r.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      patch(r, {
                        scheduledAt: new Date(
                          new FormData(e.currentTarget).get("when") +
                            ":00+08:00",
                        ).toISOString(),
                      });
                    }}
                  >
                    <input
                      type="datetime-local"
                      name="when"
                      required
                      defaultValue={dateInput(r.scheduledAt)}
                    />
                    <button disabled={busy}>確認改期</button>
                    <button type="button" onClick={() => setEdit(null)}>
                      取消
                    </button>
                  </form>
                ) : r.status === "scheduled" ? (
                  <div className="rw-small-tabs">
                    <button onClick={() => setEdit(r.id)}>改期</button>
                    <button
                      disabled={busy}
                      onClick={() => patch(r, { status: "published_manual" })}
                    >
                      我已手動發布
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => patch(r, { status: "cancelled" })}
                    >
                      取消排程
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => patch(r, { status: "scheduled" })}
                  >
                    恢復待發布
                  </button>
                )}
              </article>
            ))}
        </section>
      </div>
    </div>
  );
}
