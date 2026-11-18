import { DeliveryApproval, RunTrace } from "./DeliveryApproval.jsx";
import { ProcessingIndicator } from "./ProcessingIndicator.jsx";
import { runningAgents } from "../shared/agent-activity.mjs";
import { CarouselDelivery } from "./CarouselDelivery.jsx";
import React, { useEffect, useState } from "react";
import { api } from "./api";
import {
  roleLabels,
  stateLabels,
  visibleRuns,
  replyForRole,
} from "./conversation-view.mjs";
import { BotAvatar } from "./BotAvatar.jsx";
import { members, teamMembers } from "./team-state.mjs";
import { ArrowUp, CaretRight } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
export function TeamRunConversation({ team, project, member, beforeSend }) {
  const members = teamMembers(team);
  const [runs, setRuns] = useState([]),
    [attachment, setAttachment] = useState(null),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(null);
  const base = `/teams/${team.id}/projects/${project.id}`;
  useEffect(() => {
    setAttachment(null);
    let live = true;
    const load = () =>
      api(base + "/runs")
        .then((r) => {
          if (live) {
            setRuns(r);
          }
        })
        .catch((e) => live && setError(e.message));
    load();
    const timer = setInterval(load, 2000);
    api("/settings")
      .then((s) => live && setConsent(s.aiConsent))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [base]);
  const acceptsVisual =
    member.capability === "designer" ||
    member.roleType === "designer" ||
    member.id === "designer";
  async function attachFile(file) {
    if (!file || busy || !acceptsVisual) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("素材上限 20 MB。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (beforeSend && !(await beforeSend())) throw Error("設定尚未保存。");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(Error("無法讀取檔案。"));
        reader.readAsDataURL(file);
      });
      const saved = await api(base + "/visual-sources", "POST", {
        name: file.name,
        base64,
      });
      setAttachment(saved);
      if (!text.trim())
        setText("請從這份素材的實際畫面萃取可供後續圖文使用的設計風格。");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      if (beforeSend && !(await beforeSend()))
        throw Error("設定尚未保存，請先處理儲存錯誤。");
      const r = await api(base + "/runs", "POST", {
        id: crypto.randomUUID(),
        role: member.id,
        model: team.model,
        text,
        visualSourceId: attachment?.id,
        skills: team.skills,
        goal: project.brief,
        memory: project.memory,
        guardrails: project.guardrails,
        references: project.resources.filter((r) => r.kind !== "file"),
      });
      setRuns((v) =>
        v.some((x) => x.id === r.id)
          ? v.map((x) => (x.id === r.id ? r : x))
          : [...v, r],
      );
      window.dispatchEvent(new Event("team-activity-change"));
      setText("");
      setAttachment(null);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resumeRun(run, fromNode) {
    setBusy(true);
    try {
      const resumed = await api(
        base + "/runs/" + run.id + "/resume",
        "POST",
        fromNode ? { fromNode } : {},
      );
      setRuns((v) => v.map((x) => (x.id === run.id ? resumed : x)));
      setError("");
      window.dispatchEvent(new Event("team-activity-change"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const active = runs.some((r) => r.status === "running" && !r.engineVersion);
  return (
    <div className="rw-live-chat">
      <div className="rw-live-messages">
        {!visibleRuns(runs, member.id).length && (
          <div className="rw-chat-empty">
            <BotAvatar member={member} />
            <h2>{member.name}</h2>
            <p>
              {team.setup && !team.blueprint
                ? "這個團隊要完成什麼任務？請告訴我服務對象、希望交付的成果，以及重要限制。我會據此安排成員、Skills 與工作流程。"
                : "傳個訊息，開始這個專案。"}
            </p>
          </div>
        )}
        {visibleRuns(runs, member.id).map((r) => {
          const reply = replyForRole(r, member.id);
          const author =
            members.find(
              (m) => m.id === (member.id === "director" ? r.role : member.id),
            ) || member;
          const collaborating = [...new Set(r.steps.map((s) => s.role))]
            .map((id) => members.find((m) => m.id === id))
            .filter(Boolean);
          return (
            <article key={r.id} className="rw-chat-turn">
              <time>
                {new Date(r.createdAt).toLocaleString("zh-TW", {
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {(member.id === "director" || r.role === member.id) && (
                <div className="rw-user-message">{r.text}</div>
              )}
              {r.visualFeedback && (
                <p role="status">
                  已保存設計回饋，請至視覺設計師 → 工作 → 回饋紀錄確認長期規則。
                </p>
              )}
              {r.writingFeedback && (
                <p role="status">
                  已保存這次寫作回饋，尚未套用為長期規則。可至團隊庫 → 文案寫手
                  → 口吻參考庫確認或停用。
                </p>
              )}
              {r.steps
                .filter((s) => member.id === "director" || s.role === member.id)
                .flatMap((s) =>
                  (s.writingChecks?.warnings || []).map((warning, i) => (
                    <p key={s.id + "-check-" + i} role="status">
                      文案檢查：{warning}
                    </p>
                  )),
                )}
              {r.steps.length > 0 && <RunTrace run={r} base={base} />}
              {!!r.steps.length && (
                <details className="rw-collaboration">
                  <summary>
                    <span>{r.steps.length} 則合作紀錄</span>
                    <span className="rw-collab-avatars">
                      {collaborating.map((m) => (
                        <BotAvatar key={m.id} member={m} small />
                      ))}
                    </span>
                    <CaretRight size={12} />
                  </summary>
                  <div className="rw-collab-detail">
                    {r.steps.map((s) => (
                      <details key={s.id}>
                        <summary>
                          {members.find((m) => m.id === s.role)?.name ||
                            roleLabels[s.role] ||
                            s.role}{" "}
                          ·{" "}
                          {s.kind === "trend_search"
                            ? "趨勢搜尋 · "
                            : s.kind === "render"
                              ? "圖面合成 · "
                              : ""}
                          {stateLabels[s.status] || s.status}
                        </summary>
                        <pre>{s.output || "等待處理結果"}</pre>
                      </details>
                    ))}
                    {!!r.topics?.length && (
                      <details>
                        <summary>本次選題 · {r.topics.length} 題</summary>
                        {r.topics.map((topic) => (
                          <div key={topic.id}>
                            <p>
                              {topic.id === r.selectedTopicId
                                ? "已選擇 · "
                                : ""}
                              {topic.title}
                            </p>
                            <p>{topic.angle}</p>
                          </div>
                        ))}
                      </details>
                    )}
                    {r.search && (
                      <details>
                        <summary>
                          研究來源 · {r.search.sources.length} 筆
                        </summary>
                        {r.search.sources.map((source) => (
                          <a
                            key={source.id}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.title}
                          </a>
                        ))}
                      </details>
                    )}
                  </div>
                </details>
              )}
              {reply && (
                <div className="rw-agent-message">
                  <div className="rw-agent-author">
                    <BotAvatar member={author} small />
                    <span>{author.name}</span>
                  </div>
                  <div className="rw-agent-bubble">
                    <ReactMarkdown>{reply}</ReactMarkdown>
                  </div>
                </div>
              )}
              {r.teamProposal && (
                <section className="rw-choice-panel">
                  <h3>團隊規劃</h3>
                  <p>{r.teamProposal.mission}</p>
                  {r.teamProposal.agents.map((a) => (
                    <div className="rw-choice-row" key={a.id}>
                      <strong>{a.name}</strong>
                      <p>{a.role}</p>
                      <small>
                        Skills：
                        {a.skills.join("、") || "未指派，使用一般Codex能力"}
                      </small>
                      <p>{a.skillReason}</p>
                    </div>
                  ))}
                  {r.teamProposal.workflows.map((w) => (
                    <details key={w.id}>
                      <summary>
                        {w.name} ·{" "}
                        {w.template === "topic-to-delivery"
                          ? "實際輪播PNG"
                          : w.steps.length + " 步驟"}
                      </summary>
                      {w.template === "topic-to-delivery" ? (
                        <p>
                          研究公開來源 → 確認選題 → 文案與設計 →{" "}
                          {w.imageGeneration ? "Codex逐頁產圖 → " : ""}
                          渲染1080×1350 PNG → 人類審稿。每次一篇3–6頁。
                        </p>
                      ) : (
                        w.steps.map((s) => (
                          <p key={s.id}>
                            {
                              r.teamProposal.agents.find(
                                (a) => a.id === s.agentId,
                              )?.name
                            }
                            ：{s.instruction}
                          </p>
                        ))
                      )}
                    </details>
                  ))}
                  {!r.activatedAt &&
                  (!team.blueprint ||
                    r.proposalBaseVersion === team.blueprint.version) ? (
                    <button
                      disabled={busy || active}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          if (beforeSend && !(await beforeSend()))
                            throw Error("請先保存團隊設定。");
                          await api(
                            base + "/runs/" + r.id + "/activate-team",
                            "POST",
                            {},
                          );
                          window.location.reload();
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {team.blueprint ? "確認套用新版配置" : "啟用這個團隊"}
                    </button>
                  ) : (
                    <small>
                      {r.activatedAt
                        ? "此配置已套用"
                        : "此提案已過期，請總監依最新配置重新調整。"}
                    </small>
                  )}
                  <small>
                    可繼續告訴總監如何調整；確認套用才會生效，既有任務保留原配置。
                  </small>
                </section>
              )}
              {r.status === "awaiting_selection" &&
                member.id === "director" && (
                  <section className="rw-choice-panel">
                    <h3>這次想做哪一題？</h3>
                    {r.topics.map((topic, i) => (
                      <div className="rw-choice-row" key={topic.id}>
                        <button
                          disabled={busy || active}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              if (beforeSend && !(await beforeSend()))
                                throw Error("設定尚未保存，請先處理儲存錯誤。");
                              const updated = await api(
                                base + "/runs/" + r.id + "/select",
                                "POST",
                                { topicId: topic.id },
                              );
                              setRuns((v) =>
                                v.map((x) =>
                                  x.id === updated.id ? updated : x,
                                ),
                              );
                              window.dispatchEvent(
                                new Event("team-activity-change"),
                              );
                              setError("");
                            } catch (e) {
                              setError(e.message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <span>{String.fromCharCode(65 + i)}</span>
                          {topic.title}
                          <CaretRight size={13} />
                        </button>
                        <details>
                          <summary>切角與來源</summary>
                          <p>{topic.angle}</p>
                          {topic.sources.map((source) => (
                            <a
                              key={source.id}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.title}
                            </a>
                          ))}
                        </details>
                      </div>
                    ))}
                  </section>
                )}
              {r.status === "awaiting_approval" && member.id === "director" && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const updated = await api(
                        base + "/runs/" + r.id + "/approve",
                        "POST",
                        { confirmed: true },
                      );
                      setRuns((v) =>
                        v.map((x) => (x.id === r.id ? updated : x)),
                      );
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  確認計畫並繼續
                </button>
              )}
              {r.status === "completed" &&
                r.deliverable &&
                member.id === "director" && (
                  <DeliveryApproval
                    run={r}
                    base={base}
                    onChange={(updated) =>
                      setRuns((v) =>
                        v.map((x) => (x.id === r.id ? updated : x)),
                      )
                    }
                  />
                )}
              {r.selectedTopicId && member.id === "director" && (
                <div className="rw-selected-topic">
                  已選擇 ·{" "}
                  {r.topics?.find((t) => t.id === r.selectedTopicId)?.title}
                </div>
              )}
              {r.deliverable && member.id !== "research" && (
                <CarouselDelivery run={r} base={base} />
              )}
              {r.error && (
                <p className="rw-chat-error" role="alert">
                  {r.error}
                </p>
              )}
              {[
                "running",
                "queued",
                "awaiting_selection",
                "awaiting_approval",
              ].includes(r.status) && (
                <div className="rw-run-status">
                  {r.status === "running" ? (
                    <ProcessingIndicator
                      label={runningAgents(r)
                        .map((a) => a.label)
                        .join(" · ")}
                    />
                  ) : (
                    <span>
                      {stateLabels[r.status]}
                      {r.status === "queued" && r.queuePosition
                        ? ` · 第 ${r.queuePosition} 位`
                        : ""}
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await api(
                          base + "/runs/" + r.id + "/cancel",
                          "POST",
                          {},
                        );
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {r.status === "awaiting_selection" ? "取消這輪" : "停止"}
                  </button>
                </div>
              )}
              {r.engineVersion &&
                ["failed", "interrupted"].includes(r.status) && (
                  <div>
                    <button disabled={busy} onClick={() => resumeRun(r)}>
                      續跑未完成步驟
                    </button>
                    <details>
                      <summary>從指定步驟重做</summary>
                      <p>保留歷史成果，重做所選步驟及後續內容。</p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          resumeRun(
                            r,
                            new FormData(e.currentTarget).get("fromNode"),
                          );
                        }}
                      >
                        <select
                          name="fromNode"
                          aria-label="重做起點"
                          disabled={busy}
                        >
                          {(r.workflow === "track-accounts"
                            ? [["track", "帳號登記"]]
                            : r.workflow === "trend-report"
                              ? [
                                  ["search", "整理來源"],
                                  ["report", "研究報告"],
                                ]
                              : [
                                  ["search", "整理來源"],
                                  ["report", "研究報告"],
                                  ["topics", "推薦選題"],
                                  ["write", "撰寫文案"],
                                  ["design", "設計規劃"],
                                  ["render", "產生圖面"],
                                  ["wrap", "總監彙整"],
                                ]
                          ).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button disabled={busy} type="submit">
                          從這裡重做
                        </button>
                      </form>
                    </details>
                  </div>
                )}
              {["failed", "cancelled", "interrupted"].includes(r.status) && (
                <small className="rw-run-status">{stateLabels[r.status]}</small>
              )}
            </article>
          );
        })}
      </div>
      {error && (
        <p className="tw-error" role="alert">
          {error}
        </p>
      )}
      {consent === false ? (
        <div className="rw-inline-note">
          任務內容、選用 Skills 與專案資料將交給已登入的 Codex 處理。
          <button
            onClick={async () => {
              try {
                await api("/settings", "PATCH", { aiConsent: true });
                setConsent(true);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            啟用 Codex
          </button>
        </div>
      ) : (
        <form
          className={`rw-live-composer${acceptsVisual ? " rw-has-visual-input" : ""}`}
          onSubmit={submit}
          onDragOver={(e) => {
            if (acceptsVisual) e.preventDefault();
          }}
          onDrop={(e) => {
            if (acceptsVisual) {
              e.preventDefault();
              attachFile(e.dataTransfer.files?.[0]);
            }
          }}
          onPaste={(e) => {
            if (acceptsVisual && e.clipboardData.files?.length) {
              e.preventDefault();
              attachFile(e.clipboardData.files[0]);
            }
          }}
        >
          {acceptsVisual && (
            <label className="rw-visual-attachment" title="附上 PDF 或圖片，最多 20 MB">
              {attachment ? attachment.name : "＋ PDF／圖片"}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabled={busy}
                style={{ maxWidth: 180 }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  attachFile(file);
                }}
              />
              {attachment && (
                <button type="button" onClick={() => setAttachment(null)}>
                  移除附件
                </button>
              )}
            </label>
          )}
          <textarea
            aria-label="專案任務"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={12000}
            rows={1}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (!busy && !active && consent) submit(e);
              }
            }}
            placeholder={`傳訊息給 ${member.name}…`}
          />
          <button
            className="tw-primary"
            aria-label="送出訊息"
            disabled={busy || active || !text.trim() || consent === null}
          >
            {busy || active ? (
              <ProcessingIndicator
                compact
                label={busy ? "正在送出" : "任務處理中"}
              />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </form>
      )}
    </div>
  );
}
