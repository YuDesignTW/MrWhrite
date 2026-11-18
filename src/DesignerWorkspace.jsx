import React, { useEffect, useState } from "react";
import { api } from "./api";
import { CarouselDelivery } from "./CarouselDelivery.jsx";
import { ContentCollection } from "./ContentCollection.jsx";
import "./writer-workspace.css";
import "./designer-workspace.css";
const styles = {
  "": "依任務決定",
  graphic: "圖形編輯",
  street: "拼貼編輯",
  surreal: "超現實靜物",
  typographic: "極簡留白",
  "warm-editorial": "溫暖編輯",
};
const fields = {
  direction: "整體方向",
  palette: "配色偏好",
  typography: "字體與文字層級",
  composition: "構圖與留白",
  avoid: "避免的做法",
};
const kinds = { general: "所有設計", carousel: "輪播", single: "單張視覺" };
const blank = {
  title: "",
  like: "",
  avoid: "",
  kind: "general",
  scope: "team",
  enabled: true,
  base64: "",
};
export function DesignerWorkspace({ team, project, member }) {
  const base = `/teams/${team.id}/projects/${project.id}`;
  const [tab, setTab] = useState("works"),
    [runs, setRuns] = useState([]),
    [candidates, setCandidates] = useState([]),
    [profile, setProfile] = useState(null),
    [draft, setDraft] = useState(null),
    [editing, setEditing] = useState(false),
    [reference, setReference] = useState(blank),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const [data, styles] = await Promise.all([
          api(base + "/runs"),
          api(base + "/visual-styles"),
        ]);
        if (live) setCandidates(styles);
        if (live) {
          setRuns(data);
          setLoaded(true);
        }
      } catch (e) {
        if (live) setError(e.message);
      }
    }
    load();
    api(base + "/visual-profile")
      .then((p) => {
        if (live) {
          setProfile(p);
          setDraft(p);
        }
      })
      .catch((e) => live && setError(e.message));
    const timer = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [base]);
  async function change(body) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const p = await api(base + "/visual-profile", "POST", {
        ...body,
        revision: profile.revision,
      });
      setProfile(p);
      setDraft(p);
      setNotice("已儲存，後續新任務會使用更新後的設定。");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const works = runs
    .filter(
      (r) =>
        r.deliverable?.files?.length &&
        r.steps?.some((s) => s.role === member.id),
    )
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const plans = runs.flatMap((r) =>
    (r.steps || [])
      .filter((s) => s.role === member.id && !s.kind && s.output)
      .map((s) => ({ ...s, run: r })),
  );
  const imageUrl = (id) => "/api" + base + "/visual-profile/images/" + id;
  return (
    <div className="tw-conversation">
      <main className="ww-workspace dv-workspace">
        <header className="ww-heading">
          <div>
            <h2>視覺設計師</h2>
            <p>閱讀設計作品，整理風格、參考圖片與修改偏好。</p>
          </div>
          <span>{project.name}</span>
        </header>
        <nav className="ww-tabs" aria-label="設計工作區">
          {[
            ["works", "設計作品"],
            ["style", "視覺風格"],
            ["board", "參考圖庫"],
            ["feedback", "回饋紀錄"],
          ].map(([id, name]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setNotice("");
              }}
            >
              {name}
              {id === "works" ? ` · ${works.length}` : ""}
            </button>
          ))}
        </nav>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {tab === "works" ? (
          <>
            {!loaded ? (
              <p>讀取作品中…</p>
            ) : !works.length ? (
              <div className="ww-empty">
                <h3>目前尚無已完成的圖片作品</h3>
                <p>
                  由總監啟動輪播製作後，實際圖片會以作品組別保存在這裡。直接對話可先討論設計方向；文字提案會列在下方製作紀錄。
                </p>
              </div>
            ) : (
              <div className="dv-works">
                {works.map((r) => (
                  <section key={r.id} className="dv-work">
                    <CarouselDelivery run={r} base={base} />
                    <details>
                      <summary>
                        製作依據與紀錄 ·{" "}
                        {new Date(r.createdAt).toLocaleDateString("zh-TW")}
                      </summary>
                      <p>{r.text}</p>
                      <p>
                        文案：{r.productionCopy?.title || r.deliverable.title}
                        。此作品保留該次交付的逐頁文字。
                      </p>
                      {r.visualProfile ? (
                        <>
                          <p>
                            視覺設定第 {r.visualProfile.revision} 版 ·{" "}
                            {styles[r.visualProfile.style]}
                          </p>
                          <p>{r.visualProfile.direction}</p>
                          <h4>本次參考圖片</h4>
                          <div className="dv-reference-thumbs">
                            {r.visualProfile.references.map((ref) => (
                              <figure key={ref.id}>
                                <img
                                  loading="lazy"
                                  src={imageUrl(ref.id)}
                                  alt={ref.title}
                                />
                                <figcaption>{ref.title}</figcaption>
                              </figure>
                            ))}
                          </div>
                          <p>
                            {r.visualProfile.references.length
                              ? "已列入本次設定；各步驟的圖片傳入紀錄如下。"
                              : "本次未選用參考圖。"}
                          </p>
                          {r.steps
                            .filter((s) => s.referenceImages?.length)
                            .map((s) => (
                              <p key={s.id}>
                                {s.kind === "image_generation"
                                  ? `第 ${s.page} 頁產圖`
                                  : "設計規劃"}{" "}
                                · 已傳入 {s.referenceImages.length} 張 ·{" "}
                                {s.status === "completed"
                                  ? "完成"
                                  : s.status === "failed"
                                    ? "失敗"
                                    : s.status}
                              </p>
                            ))}
                        </>
                      ) : (
                        <p>歷史作品未保存新版視覺設定快照。</p>
                      )}
                    </details>
                  </section>
                ))}
              </div>
            )}
            <details className="ww-archive">
              <summary>製作紀錄與設計提案 · {plans.length}</summary>
              {!plans.length && <p>尚無提案紀錄。</p>}
              {[...plans].reverse().map((s) => (
                <details key={s.id}>
                  <summary>
                    {s.run.text.slice(0, 70)} ·{" "}
                    {s.status === "completed"
                      ? "提案完成"
                      : s.status === "failed"
                        ? "未完成"
                        : s.status}
                  </summary>
                  <p>{new Date(s.startedAt).toLocaleString("zh-TW")}</p>
                  <DesignPlan text={s.output} />
                </details>
              ))}
            </details>
            <details className="ww-archive">
              <summary>先前匯入的作品</summary>
              <ContentCollection {...{ team, project, member }} />
            </details>
          </>
        ) : !profile ? (
          <p>讀取視覺資料中…</p>
        ) : (
          <>
            <div className="dv-section-heading">
              <p>
                風格與回饋在團隊內共用；參考圖可限定本專案。新任務最多選取三張適用圖片，實際傳入設計規劃與輪播產圖。
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    const p = await api(base + "/visual-profile");
                    setProfile(p);
                    setDraft(p);
                    setEditing(false);
                    setError("");
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                重新讀取
              </button>
            </div>
            {tab === "style" && (
              <section className="dv-style">
                <details open={candidates.length > 0}>
                  <summary>從素材萃取的風格 · {candidates.length}</summary>
                  {!candidates.length && (
                    <p>
                      到設計師對話貼上 PDF 網址，或附上
                      PDF／圖片，請他萃取風格。完成後會在此保存草稿。
                    </p>
                  )}
                  {[...candidates].reverse().map((c) => (
                    <details key={c.id}>
                      <summary>
                        {c.title} ·{" "}
                        {profile.styleSource?.id === c.id
                          ? "目前套用"
                          : "風格草稿"}
                      </summary>
                      <p>
                        {c.source.name} · {c.source.limitations}
                      </p>
                      {c.source.url && (
                        <a href={c.source.url} target="_blank" rel="noreferrer">
                          來源
                        </a>
                      )}
                      <div className="dv-reference-thumbs">
                        {c.source.pages.map((p) => (
                          <figure key={p.page}>
                            <img
                              loading="lazy"
                              alt={`實際讀取的第 ${p.page} 頁`}
                              src={`/api${base}/visual-sources/${c.sourceId}/pages/${p.page}`}
                            />
                            <figcaption>第 {p.page} 頁</figcaption>
                          </figure>
                        ))}
                      </div>
                      {Object.entries(fields).map(([key, label]) => (
                        <div key={key}>
                          <h4>{label}</h4>
                          <p>{c[key]}</p>
                        </div>
                      ))}
                      <button
                        disabled={busy || profile.styleSource?.id === c.id}
                        onClick={() =>
                          change({ action: "apply-style", id: c.id })
                        }
                      >
                        套用為團隊風格
                      </button>
                    </details>
                  ))}
                </details>
                <header>
                  <h3>團隊視覺方向</h3>
                  <button
                    onClick={() => {
                      setDraft(profile);
                      setEditing(!editing);
                    }}
                  >
                    {editing ? "取消編輯" : "編輯風格"}
                  </button>
                </header>
                {editing ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await change({
                          action: "style",
                          ...Object.fromEntries(
                            ["style", ...Object.keys(fields)].map((k) => [
                              k,
                              draft[k],
                            ]),
                          ),
                        })
                      )
                        setEditing(false);
                    }}
                  >
                    <label>
                      主要風格
                      <select
                        value={draft.style}
                        onChange={(e) =>
                          setDraft({ ...draft, style: e.target.value })
                        }
                      >
                        {Object.entries(styles).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {Object.entries(fields).map(([id, label]) => (
                      <label key={id}>
                        {label}
                        <textarea
                          maxLength={2000}
                          value={draft[id]}
                          onChange={(e) =>
                            setDraft({ ...draft, [id]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <button disabled={busy}>儲存風格</button>
                  </form>
                ) : (
                  <>
                    <p className="dv-style-name">{styles[profile.style]}</p>
                    <dl className="dv-style-grid">
                      {Object.entries(fields).map(([id, label]) => (
                        <div key={id}>
                          <dt>{label}</dt>
                          <dd>{profile[id] || "尚未設定，可依任務討論。"}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </section>
            )}
            {tab === "board" && (
              <>
                <details
                  className="dv-intake"
                  open={reference.id ? true : undefined}
                >
                  <summary>
                    {reference.id ? "編輯參考圖" : "新增參考圖"}
                  </summary>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await change({ action: "reference", ...reference }))
                        setReference(blank);
                    }}
                  >
                    {!reference.id && (
                      <label>
                        圖片（PNG／JPEG／WebP，上限2 MB）
                        <input
                          key={profile.revision}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          required
                          onChange={async (e) => {
                            try {
                              const f = e.target.files[0];
                              if (!f) return;
                              if (f.size > 2 * 1024 * 1024)
                                throw Error("圖片上限2 MB。");
                              const data = await new Promise(
                                (resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onload = () => resolve(reader.result);
                                  reader.onerror = () =>
                                    reject(Error("無法讀取圖片"));
                                  reader.readAsDataURL(f);
                                },
                              );
                              setReference((v) => ({
                                ...v,
                                base64: data.split(",")[1],
                                title: v.title || f.name.slice(0, 120),
                              }));
                            } catch (e) {
                              setError(e.message);
                            }
                          }}
                        />
                      </label>
                    )}
                    <label>
                      名稱
                      <input
                        required
                        maxLength={120}
                        value={reference.title}
                        onChange={(e) =>
                          setReference({ ...reference, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      喜歡什麼／這次要參考什麼
                      <textarea
                        maxLength={2000}
                        value={reference.like}
                        placeholder="例如：參考留白與配色，不沿用人物。"
                        onChange={(e) =>
                          setReference({ ...reference, like: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      不要採用的部分
                      <textarea
                        maxLength={2000}
                        value={reference.avoid}
                        onChange={(e) =>
                          setReference({ ...reference, avoid: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      用途
                      <select
                        value={reference.kind}
                        onChange={(e) =>
                          setReference({ ...reference, kind: e.target.value })
                        }
                      >
                        {Object.entries(kinds).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      適用範圍
                      <select
                        value={reference.scope}
                        onChange={(e) =>
                          setReference({ ...reference, scope: e.target.value })
                        }
                      >
                        <option value="team">團隊共用</option>
                        <option value="project">只限本專案</option>
                      </select>
                    </label>
                    <button disabled={busy}>
                      {reference.id ? "儲存修改" : "加入參考圖"}
                    </button>
                    <button type="button" onClick={() => setReference(blank)}>
                      取消
                    </button>
                  </form>
                </details>
                <div className="dv-board">
                  {profile.references
                    .filter((r) => !r.projectId || r.projectId === project.id)
                    .map((r) => (
                      <article key={r.id}>
                        <a
                          href={imageUrl(r.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            loading="lazy"
                            src={imageUrl(r.id)}
                            alt={r.title}
                          />
                        </a>
                        <h4>{r.title}</h4>
                        <small>
                          {kinds[r.kind]} ·{" "}
                          {r.projectId ? "本專案" : "團隊共用"} ·{" "}
                          {r.enabled ? "可供選用" : "已停用"}
                        </small>
                        <p>
                          <b>參考：</b>
                          {r.like || "未註記，請先補充希望參考的部分。"}
                        </p>
                        {r.avoid && (
                          <p>
                            <b>避免：</b>
                            {r.avoid}
                          </p>
                        )}
                        <div>
                          <button
                            disabled={busy}
                            onClick={() =>
                              setReference({
                                ...r,
                                scope: r.projectId ? "project" : "team",
                              })
                            }
                          >
                            編輯
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              change({
                                action: "reference",
                                ...r,
                                scope: r.projectId ? "project" : "team",
                                enabled: !r.enabled,
                              })
                            }
                          >
                            {r.enabled ? "停用" : "啟用"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              change({ action: "remove-reference", id: r.id })
                            }
                          >
                            移除
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
                {!profile.references.some(
                  (r) => !r.projectId || r.projectId === project.id,
                ) && (
                  <p className="ww-empty">
                    尚無參考圖片。上傳喜歡的設計，並註記要學習的部分。
                  </p>
                )}
              </>
            )}
            {tab === "feedback" && (
              <section>
                <h3>設計回饋</h3>
                <p>
                  直接對設計師說「不喜歡」「字太小」或「太花」，會記錄原話與最近作品；確認規則後才用於未來設計。
                </p>
                {!profile.feedback.length && (
                  <p className="ww-empty">尚無回饋紀錄。</p>
                )}
                {[...profile.feedback].reverse().map((f) => (
                  <VisualFeedback
                    key={f.id + profile.revision}
                    value={f}
                    busy={busy}
                    change={change}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
function VisualFeedback({ value: f, busy, change }) {
  const [rule, setRule] = useState(f.rule),
    [kind, setKind] = useState(f.kind);
  return (
    <details className="dv-feedback">
      <summary>
        {f.status === "active"
          ? "已確認"
          : f.status === "disabled"
            ? "已停用"
            : "待確認"}{" "}
        · {f.text.slice(0, 80)}
      </summary>
      <p>{f.text}</p>
      <p>關聯作品／任務：{f.targetTitle || "尚無關聯作品"}</p>
      <label>
        長期規則
        <textarea
          maxLength={2000}
          value={rule}
          onChange={(e) => setRule(e.target.value)}
        />
      </label>
      <select
        aria-label="適用設計類型"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        {Object.entries(kinds).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <button
        disabled={busy || !rule.trim()}
        onClick={() =>
          change({ action: "feedback", id: f.id, rule, kind, status: "active" })
        }
      >
        確認套用
      </button>
      <button
        disabled={busy}
        onClick={() =>
          change({
            action: "feedback",
            id: f.id,
            rule,
            kind,
            status: "disabled",
          })
        }
      >
        停用
      </button>
    </details>
  );
}
function DesignPlan({ text }) {
  let p;
  try {
    p = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {}
  return p && typeof p === "object" ? (
    <dl className="dv-style-grid">
      {Object.entries(p).map(([k, v]) => (
        <div key={k}>
          <dt>
            {{
              style: "風格",
              rationale: "設計理由",
              layout: "文字位置",
              artDirection: "藝術方向",
              palette: "配色",
              imageConcepts: "逐頁圖像構想",
            }[k] || k}
          </dt>
          <dd>
            {typeof v === "string"
              ? v
              : Array.isArray(v)
                ? v.join("\n")
                : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
  );
}
