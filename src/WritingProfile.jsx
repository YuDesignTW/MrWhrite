import ReactMarkdown from "react-markdown";
import React, { useEffect, useState } from "react";
import { api } from "./api";
const names = {
  post: "貼文",
  carousel: "輪播",
  "press-release": "新聞稿",
  general: "共通／其他",
};
const empty = { title: "", content: "", url: "", type: "post", enabled: true };
export function WritingProfile({
  base,
  embedded = false,
  initialTab = "samples",
  projects = [],
}) {
  const [data, setData] = useState(null),
    [guide, setGuide] = useState(""),
    [sample, setSample] = useState(empty),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(initialTab),
    [editingGuide, setEditingGuide] = useState(false);
  const apply = (d) => {
    setData(d);
    setGuide(d.guide);
  };
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    api(base + "/writing-profile")
      .then((d) => live && apply(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [base]);
  async function change(body) {
    setBusy(true);
    setError("");
    try {
      const d = await api(base + "/writing-profile", "POST", {
        ...body,
        revision: data.revision,
      });
      apply(d);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const Container = embedded ? "section" : "details";
  return (
    <Container
      className="tl-resource-preview writing-profile"
      {...(!embedded ? { open: true } : {})}
    >
      {!embedded && <summary>口吻參考庫</summary>}
      <p>
        團隊共用的寫作口吻。參考文只學習表達方式，不作為新稿的事實來源。每次選取最多三份片段；只有已確認的回饋才成為長期規則。
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          try {
            apply(await api(base + "/writing-profile"));
            setError("");
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        重新讀取
      </button>
      {!data ? (
        <p>讀取口吻資料中…</p>
      ) : (
        <>
          {!embedded && (
            <nav aria-label="口吻資料分類">
              {[
                ["samples", "參考文案"],
                ["guide", "口吻指南"],
                ["feedback", "回饋紀錄"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id === "feedback"
                    ? `（${data.feedback.filter((f) => f.status === "pending").length} 待確認）`
                    : ""}
                </button>
              ))}
            </nav>
          )}
          {tab === "samples" && (
            <>
              <p>
                貼入你認可的貼文或網站原文，可附來源網址。此處不會自動讀取網址。保存後即作為口吻參考。
              </p>
              <details
                open={sample.id || !data.samples.length ? true : undefined}
              >
                <summary>{sample.id ? "編輯參考文案" : "新增參考文案"}</summary>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await change({ action: "sample", ...sample }))
                      setSample(empty);
                  }}
                >
                  <label>
                    標題
                    <input
                      required
                      maxLength={120}
                      value={sample.title}
                      onChange={(e) =>
                        setSample({ ...sample, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    內容類型
                    <select
                      value={sample.type}
                      onChange={(e) =>
                        setSample({ ...sample, type: e.target.value })
                      }
                    >
                      {Object.entries(names).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    來源網址（選填）
                    <input
                      type="url"
                      value={sample.url}
                      maxLength={2000}
                      onChange={(e) =>
                        setSample({ ...sample, url: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    參考原文
                    <textarea
                      required
                      rows={7}
                      maxLength={20000}
                      value={sample.content}
                      onChange={(e) =>
                        setSample({ ...sample, content: e.target.value })
                      }
                    />
                  </label>
                  <button disabled={busy}>
                    {sample.id ? "儲存修改" : "加入參考"}
                  </button>
                  {sample.id && (
                    <button type="button" onClick={() => setSample(empty)}>
                      取消編輯
                    </button>
                  )}
                </form>
              </details>
              {!data.samples.length && (
                <p>尚無口吻範例。先放入幾篇你認可的文案即可。</p>
              )}
              {data.samples.map((s) => (
                <details key={s.id} className="wp-sample-row">
                  <summary>
                    <span>{s.title}</span>
                    <small>
                      {names[s.type]} · {s.enabled ? "使用中" : "已停用"}
                    </small>
                  </summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{s.content}</p>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      來源網頁
                    </a>
                  )}
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSample(s)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        change({ action: "sample", ...s, enabled: !s.enabled })
                      }
                    >
                      {s.enabled ? "停用" : "啟用"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        change({ action: "remove-sample", id: s.id })
                      }
                    >
                      移除
                    </button>
                  </div>
                </details>
              ))}
            </>
          )}
          {tab === "guide" &&
            (!editingGuide && data.guide ? (
              <section className="wp-guide-preview">
                <div className="wp-guide-title">
                  <span>目前使用的寫作口吻</span>
                  <button onClick={() => setEditingGuide(true)}>
                    編輯口吻
                  </button>
                </div>
                <ReactMarkdown>{data.guide}</ReactMarkdown>
                <small>
                  更新時間：{new Date(data.updatedAt).toLocaleString("zh-TW")}
                </small>
              </section>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  change({ action: "guide", content: guide }).then((ok) => {
                    if (ok) setEditingGuide(false);
                  });
                }}
              >
                <p>
                  填寫已確認的語氣、用詞、句型與避免寫法。當次任務的明確要求優先；指南不改變資料事實。
                </p>
                <label>
                  口吻指南
                  <textarea
                    rows={9}
                    maxLength={6000}
                    value={guide}
                    placeholder="例如：專業但容易閱讀；用具體描述，避免誇張形容詞。"
                    onChange={(e) => setGuide(e.target.value)}
                  />
                </label>
                <div>
                  <button disabled={busy}>儲存口吻</button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setGuide(data.guide);
                      setEditingGuide(false);
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            ))}
          {tab === "feedback" && (
            <>
              <p>
                直接對寫手說「不喜歡」會保存原話，並關聯本專案最近的寫手稿件。請核對關聯，編輯規則後才套用到未來寫作；單次意見可保留待確認或停用。
              </p>
              {!data.feedback.length && <p>尚無回饋。</p>}
              {[...data.feedback].reverse().map((f) => (
                <Feedback
                  key={f.id + data.revision}
                  value={f}
                  projectName={projects.find((p) => p.id === f.projectId)?.name}
                  busy={busy}
                  change={change}
                />
              ))}
            </>
          )}
        </>
      )}
    </Container>
  );
}
function Feedback({ value: f, busy, change, projectName }) {
  const [rule, setRule] = useState(f.rule),
    [type, setType] = useState(f.type);
  return (
    <details>
      <summary>
        {f.status === "active"
          ? "已確認"
          : f.status === "disabled"
            ? "已停用"
            : "待確認"}{" "}
        · {f.text.slice(0, 65)}
      </summary>
      <p>{f.text}</p>
      <small>
        專案：{projectName || "原專案"} ·{" "}
        {new Date(f.createdAt).toLocaleString("zh-TW")} ·{" "}
        {f.targetRunId ? "已關聯當時稿件" : "尚無關聯稿件"}
      </small>
      {f.excerpt && (
        <blockquote style={{ whiteSpace: "pre-wrap" }}>{f.excerpt}</blockquote>
      )}
      <label>
        適用類型
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(names).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        長期規則
        <textarea
          maxLength={2000}
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          placeholder="將本次意見整理成明確、可重複使用的偏好"
        />
      </label>
      <button
        type="button"
        disabled={busy || !rule.trim()}
        onClick={() =>
          change({ action: "feedback", id: f.id, status: "active", rule, type })
        }
      >
        確認套用
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          change({
            action: "feedback",
            id: f.id,
            status: "disabled",
            rule,
            type,
          })
        }
      >
        停用
      </button>
    </details>
  );
}
