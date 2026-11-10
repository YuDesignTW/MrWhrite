import { TopicPlanning } from "./TopicPlanning.jsx";
import IGReview from "./IGReview";
import { IGWorkflowLog } from "./IGWorkflowLog";
import { IG_STYLES } from "../shared/ig-design.mjs";
import { Tooltip } from "./Tooltip.jsx";
import { WORKSPACES, workspaceId } from "../shared/agent-workspaces.mjs";
import remarkGfm from "remark-gfm";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Compass,
  PaintBrush,
  PencilLine,
  ChatsCircle,
  MagnifyingGlass,
  ChartBar,
  UserCircle,
  CalendarBlank,
  Images,
  VideoCamera,
  Recycle,
  EnvelopeSimple,
  ArrowBendUpLeft,
  ArrowUp,
  ArrowClockwise,
  ArrowSquareOut,
  Check,
  CaretDown,
  CaretRight,
  ChatCircleText,
  Clock,
  FileText,
  Lightbulb,
  Plus,
  SlidersHorizontal,
  Sparkle,
  SpinnerGap,
  Stack,
  Stop,
  Tray,
  X,
} from "@phosphor-icons/react";
import { api } from "./api";
import { Markdown } from "./Editor";
import { Dialog } from "./Settings";
import { PublishDialog } from "./PublishDialog";
import { Studio } from "./Studio";
import { loadSlideImage, renderSlide } from "./carousel";
import "./agent-studio.css";

const AGENT_ICONS = {
  coordinator: Sparkle,
  strategy: Compass,
  creation: PaintBrush,
  editing: PencilLine,
  engagement: ChatsCircle,
  "ig-viral": MagnifyingGlass,
  "ig-plan": CalendarBlank,
  "ig-profile": UserCircle,
  "ig-audit": ChartBar,
  "ig-carousel": Images,
  "ig-caption": FileText,
  "ig-reel": VideoCamera,
  "ig-story": Stack,
  "ig-repurpose": Recycle,
  "ig-human": PencilLine,
  "ig-comment": ChatCircleText,
  "ig-reply": ArrowBendUpLeft,
  "ig-dm": EnvelopeSimple,
};
function AgentIcon({ id, ...props }) {
  const Icon = AGENT_ICONS[id] || Sparkle;
  return <Icon {...props} />;
}
function restoreWorkspaceInput(id) {
  const key = id === "coordinator" ? INPUT_KEY : `${INPUT_KEY}:${id}`;
  const current = readStored(key);
  if (id === "coordinator" || readStored(`${key}:grouped`)) return current;
  const previous = (WORKSPACES.find((w) => w.id === id)?.members || [])
    .map((member) => ({ member, text: readStored(`${INPUT_KEY}:${member}`) }))
    .filter((item) => item.text.trim());
  const combined = [
    current,
    ...previous.map(
      (item) => `【先前 ${item.member} 未送出內容】\n${item.text}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    localStorage.setItem(key, combined);
    localStorage.setItem(`${key}:grouped`, "1");
  } catch {
    /* Original inputs are retained. */
  }
  return combined;
}
const INPUT_KEY = "agent-studio-input:v1";
const SELECTION_KEY = "agent-studio-selection:v1";
const APPROVALS = new Set(["通過", "核准", "可以了"]);
const STATUS = {
  queued: "等待發布",
  missed: "已錯過排程",
  unknown: "結果待查核",
  publishing: "發布中",
  published: "已發布",
  cancelled: "已取消",
  failed: "發布失敗",
};
const time = (value) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "時間未提供";
const readStored = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
const noteText = (note) =>
  typeof note === "string"
    ? note
    : note?.text || note?.note || note?.claim || "待確認的資訊";

function CarouselPreview({ slide, index, total }) {
  const canvas = useRef(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    loadSlideImage(slide)
      .then((img) => {
        if (live)
          setError(
            renderSlide(canvas.current, slide, index, total, img).join("；"),
          );
      })
      .catch(() => {
        if (live) setError("這頁預覽暫時無法載入。");
      });
    return () => {
      live = false;
    };
  }, [slide, index, total]);
  return (
    <figure>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`第 ${index + 1} 頁：${slide.title}`}
      />
      <figcaption>
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </figcaption>
      {error && <small className="agent-error-text">{error}</small>}
    </figure>
  );
}

function DraftPreview({
  draft,
  disabled,
  onApprove,
  onClose,
  onDetails,
  onSchedule,
}) {
  const [platform, setPlatform] = useState("threads");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [draft.id, platform]);
  const text = draft.content?.[platform] || "";
  const blocks = draft.quality?.blocking || [];
  const approved = draft.status === "approved";
  const superseded = draft.status === "superseded";
  return (
    <section className="agent-review" aria-label={`審閱文章：${draft.title}`}>
      <div className="agent-review-heading">
        <div>
          <span className="agent-eyebrow">
            {approved ? "已通過審核" : superseded ? "歷史版本" : "請你過目"} · V
            {draft.version || 1}
          </span>
          <h3>{draft.title || "未命名草稿"}</h3>
        </div>
        <button
          className="agent-icon"
          onClick={onClose}
          aria-label="收起文章預覽"
        >
          <X size={17} />
        </button>
      </div>
      <div className="agent-platforms" role="tablist" aria-label="文章版本">
        {[
          ["threads", "Threads"],
          ["instagram", "IG 文案"],
          ["master", "主稿"],
          ["carousel", "輪播"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={`agent-platform-${id}`}
            role="tab"
            aria-selected={platform === id}
            aria-controls="agent-draft-content"
            onClick={() => setPlatform(id)}
          >
            {label}
            {id === "carousel" && draft.slides?.length ? (
              <span>{draft.slides.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        id="agent-draft-content"
        role="tabpanel"
        aria-labelledby={`agent-platform-${platform}`}
      >
        {platform === "carousel" ? (
          draft.slides?.length ? (
            <div className="agent-slides">
              {draft.slides.map((slide, index) => (
                <CarouselPreview
                  key={slide.id || index}
                  slide={slide}
                  index={index}
                  total={draft.slides.length}
                />
              ))}
            </div>
          ) : (
            <p className="agent-muted">這份草稿尚無輪播內容。</p>
          )
        ) : (
          <>
            <div
              className={`agent-draft-copy ${expanded ? "is-expanded" : ""}`}
            >
              {text ? (
                <Markdown>
                  {expanded || text.length <= 650
                    ? text
                    : text.slice(0, 650) + "…"}
                </Markdown>
              ) : (
                <p className="agent-muted">這個版本尚無內容。</p>
              )}
            </div>
            {text.length > 650 && (
              <button
                className="agent-text-button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "收合全文" : "展開全文"}
                <CaretDown size={13} />
              </button>
            )}
          </>
        )}
      </div>
      {(blocks.length > 0 ||
        draft.factNotes?.length > 0 ||
        draft.quality?.checks?.length > 0 ||
        draft.sourceSnapshots?.length > 0) && (
        <details
          className="agent-quality"
          open={blocks.length > 0 || undefined}
        >
          <summary>
            {blocks.length
              ? `還有 ${blocks.length} 項需要修正`
              : "內容檢查與事實備註"}
            <CaretDown size={13} />
          </summary>
          {blocks.length > 0 && (
            <ul className="agent-error-text">
              {blocks.map((b, i) => (
                <li key={i}>{noteText(b)}</li>
              ))}
            </ul>
          )}
          {!!draft.factNotes?.length && (
            <ul>
              {draft.factNotes.map((n, i) => (
                <li key={i}>{noteText(n)}</li>
              ))}
            </ul>
          )}
          {!!draft.quality?.checks?.length && (
            <ul className="agent-checks">
              {draft.quality.checks.map((c, i) => (
                <li key={i}>
                  <span aria-hidden="true">{c.passed ? "✓" : "○"}</span>
                  {c.label}
                </li>
              ))}
            </ul>
          )}
          {!!draft.sourceSnapshots?.length && (
            <div className="agent-review-sources">
              <strong>參考來源</strong>
              <ul>
                {draft.sourceSnapshots.map((source) => (
                  <li key={source.id}>
                    <span>
                      {source.author || "未提供作者"} ·{" "}
                      {source.platform === "instagram"
                        ? "Instagram"
                        : source.platform === "threads"
                          ? "Threads"
                          : "手動素材"}
                      {source.manual && source.platform !== "manual"
                        ? " · 手動收錄"
                        : ""}
                    </span>
                    {safeUrl(source.url) && (
                      <a
                        href={safeUrl(source.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        原文
                        <ArrowSquareOut size={11} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
      <div className="agent-review-footer">
        <span>
          {approved
            ? "通過後仍可提出修改"
            : superseded
              ? "請選擇最新版本繼續審核"
              : "直接在下方告訴我想修改什麼"}
        </span>
        <div>
          {draft.workId && (
            <button
              className="agent-text-button"
              onClick={() => onDetails(draft.workId)}
            >
              作品細節
              <ArrowSquareOut size={13} />
            </button>
          )}
          {approved && draft.approvedArticle ? (
            <button
              className="agent-secondary"
              disabled={disabled}
              onClick={() => onSchedule(draft.approvedArticle)}
            >
              <Clock size={15} />
              排程 Threads
            </button>
          ) : (
            !superseded && (
              <button
                className="agent-primary"
                disabled={disabled || blocks.length > 0}
                onClick={onApprove}
              >
                <Check size={15} />
                通過審核
              </button>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function PreferencesDialog({ preferences, onClose, onChanged }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(preferences.map((p) => [p.id, p.text])),
  );
  const [addition, setAddition] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const save = async (path, method, body) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      await onChanged();
      if (method === "POST") setAddition("");
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="寫作偏好"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="agent-preferences">
        <p className="agent-muted">
          每次改稿的偏好會用於下一次創作。你可以隨時修改或停用。
        </p>
        {!preferences.length && (
          <p className="agent-empty-copy">
            還沒有記住的偏好。審稿時勾選「記住這次寫作偏好」，或先加上一項。
          </p>
        )}
        {preferences.map((p) => (
          <div
            className={`agent-preference ${p.active ? "" : "is-inactive"}`}
            key={p.id}
          >
            <label htmlFor={`preference-${p.id}`}>
              {p.active
                ? p.applied === false
                  ? "未套用，請整理偏好"
                  : "使用中"
                : "已停用"}
            </label>
            <textarea
              id={`preference-${p.id}`}
              value={values[p.id] ?? p.text}
              onChange={(e) => setValues({ ...values, [p.id]: e.target.value })}
              rows={2}
              disabled={busy}
            />
            <div>
              <button
                disabled={
                  busy ||
                  !(values[p.id] ?? p.text).trim() ||
                  (values[p.id] ?? p.text) === p.text
                }
                onClick={() =>
                  save(`/agent/preferences/${p.id}`, "PATCH", {
                    text: (values[p.id] ?? p.text).trim(),
                  })
                }
              >
                儲存修改
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  save(`/agent/preferences/${p.id}`, "PATCH", {
                    active: !p.active,
                  })
                }
              >
                {p.active ? "停用" : "重新啟用"}
              </button>
            </div>
          </div>
        ))}
        <form
          className="agent-preference-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (addition.trim())
              save("/agent/preferences", "POST", { text: addition.trim() });
          }}
        >
          <label htmlFor="agent-new-preference">新增偏好</label>
          <textarea
            id="agent-new-preference"
            value={addition}
            onChange={(e) => setAddition(e.target.value)}
            placeholder="例如：開頭直接切入問題，避免誇張的形容詞。"
            rows={2}
            maxLength={1000}
            disabled={busy}
          />
          <button disabled={busy || !addition.trim()} type="submit">
            <Plus size={15} />
            新增偏好
          </button>
        </form>
        {error && (
          <p className="agent-error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export function AgentStudio(props) {
  const [agentId, setAgentId] = useState(() => "creation");
  const choose = (value) => {
    const id = workspaceId(value);
    try {
      localStorage.setItem("agent-studio-active:v1", id);
    } catch {
      /* Session still works. */
    }
    setAgentId(id);
  };
  return (
    <AgentStudioSession
      key={agentId}
      {...props}
      agentId={agentId}
      onAgentChange={choose}
    />
  );
}

function AgentStudioSession({
  agentId,
  onAgentChange,
  onArticle,
  onIntelligence,
  initialBrief,
  onBriefConsumed,
}) {
  const inputKey =
    agentId === "coordinator" ? INPUT_KEY : `${INPUT_KEY}:${agentId}`;
  const selectionKey =
    agentId === "coordinator" ? SELECTION_KEY : `${SELECTION_KEY}:${agentId}`;
  const [state, setState] = useState(null);
  const [input, setInput] = useState(() => restoreWorkspaceInput(agentId));
  const [skillId, setSkillId] = useState(() =>
    readStored(`agent-capability:${agentId}`),
  );
  const [selectedId, setSelectedId] = useState(
    () => readStored(selectionKey) || null,
  );
  const [proposal, setProposal] = useState(null);
  const [rightTab, setRightTab] = useState("review");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [allWorks, setAllWorks] = useState(false);
  const [sourceIds, setSourceIds] = useState(null);
  const [remember, setRemember] = useState(true);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [consentRequest, setConsentRequest] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [publishArticle, setPublishArticle] = useState(null);
  const [publications, setPublications] = useState(null);
  const [socialStatus, setSocialStatus] = useState(null);
  const [socialError, setSocialError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryPayload, setRetryPayload] = useState(null);
  const [dismissedContinuation, setDismissedContinuation] = useState(null);
  const [rebaseId, setRebaseId] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const flight = useRef(false),
    alive = useRef(true),
    sequence = useRef(0),
    trackedRun = useRef(null),
    trackedPayload = useRef(null);
  const field = useRef(null),
    messagesEnd = useRef(null),
    scrollRegion = useRef(null),
    nearBottom = useRef(true);
  const selected = state?.drafts?.find((d) => d.id === selectedId);
  const activeRun =
    state?.activeRun || state?.runs?.find((r) => r.status === "running");
  const reviewItems = (state?.messages || [])
    .flatMap((m) =>
      (m.proposals || []).map((p, index) => ({
        ...p,
        messageId: m.id,
        index,
        key: `${m.id}:${index}`,
      })),
    )
    .reverse();
  for (const draft of state?.drafts || []) {
    if (draft.slides?.length && draft.status !== "superseded")
      reviewItems.push({
        title: draft.title,
        summary: draft.title,
        caption: draft.content?.instagram || "",
        slides: draft.slides.map((s, i) => ({
          title: s.title,
          body: s.body,
          layout:
            i === 0
              ? "cover"
              : i === draft.slides.length - 1
                ? "closing"
                : "editorial",
        })),
        design: { theme: "paper" },
        legacyDraftId: draft.id,
        key: `legacy:${draft.id}`,
      });
  }
  const reviewItem = proposal
    ? reviewItems.find((p) =>
        proposal.legacyDraftId
          ? p.legacyDraftId === proposal.legacyDraftId
          : p.messageId === proposal.messageId && p.index === proposal.index,
      ) || proposal
    : reviewItems[0];
  const currentAgent = state?.workspaces?.find((a) => a.id === agentId);
  const capability = currentAgent?.capabilities?.find((c) => c.id === skillId);
  const activeOwner = activeRun?.agentId || "coordinator";
  const agentName = (id) =>
    state?.workspaces?.find((a) => a.id === id)?.name ||
    state?.agents?.find((a) => a.id === id)?.name ||
    "創意總監";
  const latestRun = state?.runs?.[0];
  const continuation =
    latestRun?.status === "completed" &&
    latestRun.needsInput &&
    ["draft", "revise"].includes(latestRun.continuationIntent) &&
    latestRun.id !== dismissedContinuation
      ? latestRun
      : null;
  const pending = state?.drafts?.filter((d) => d.status === "pending") || [];
  const approved = state?.drafts?.filter((d) => d.status === "approved") || [];
  const disabled = busy || !!activeRun;
  const chosenSources = sourceIds ?? [];

  const importedBrief = useRef(false);
  useEffect(() => {
    if (!initialBrief || !state || importedBrief.current) return;
    importedBrief.current = true;
    setInput(
      (current) =>
        initialBrief.text +
        (current.trim() ? "\n\n我先前尚未送出的補充：\n" + current : ""),
    );
    setSourceIds([initialBrief.sourceId]);
    setSelectedId(null);
    setDismissedContinuation(state.runs?.[0]?.id || null);
    setNotice(
      "已帶入指定情報與創作方向，確認後送出。原有未送出文字保留在下方。",
    );
    onBriefConsumed?.();
  }, [initialBrief, state, onBriefConsumed]);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await api(
        `/agent/state?agentId=${encodeURIComponent(agentId)}`,
      );
      if (!alive.current || request !== sequence.current) return;
      setState(result);
      setLoadError("");
      if (!trackedRun.current) {
        trackedRun.current =
          result.runs?.find((r) => r.status === "running")?.id || null;
      }
      if (trackedRun.current) {
        const run = result.runs?.find((r) => r.id === trackedRun.current);
        if (run?.status === "completed") {
          const response = result.messages?.find(
            (m) => m.id === run.responseMessageId,
          );
          if (response?.proposalParent && response.proposals?.length === 1) {
            setProposal({
              ...response.proposals[0],
              messageId: response.id,
              index: 0,
              key: `${response.id}:0`,
            });
          }
          if (run.draftId) {
            setSelectedId(run.draftId);
            nearBottom.current = true;
          }
          trackedRun.current = null;
          trackedPayload.current = null;
        } else if (
          run &&
          ["failed", "cancelled", "interrupted"].includes(run.status)
        ) {
          setError(
            run.error ||
              (run.status === "cancelled"
                ? "已停止這次創作，你可以修改指示後再試。"
                : "這次創作未完成，原有內容已保留。"),
          );
          const message = result.messages?.find(
            (m) => m.role === "user" && m.runId === run.id,
          );
          const retry =
            trackedPayload.current ||
            (message
              ? {
                  agentId: run.agentId || agentId,
                  ...(run.skillId ? { skillId: run.skillId } : {}),
                  ...(run.workflow === "ig-carousel"
                    ? {
                        workflow: run.workflow,
                        ...(run.proposalRef?.legacyDraftId
                          ? { legacyDraftId: run.proposalRef.legacyDraftId }
                          : run.proposalRef
                            ? { proposalRef: run.proposalRef }
                            : {}),
                      }
                    : {}),
                  text: message.content,
                  intent: run.intent || (message.draftId ? "revise" : "chat"),
                  ...(message.draftId ? { draftId: message.draftId } : {}),
                  ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
                  sourceIds: run.sourceIds || [],
                  remember: false,
                }
              : null);
          if (retry) {
            setInput((current) => current || retry.text);
            setRetryPayload({ ...retry, id: crypto.randomUUID() });
          }
          trackedRun.current = null;
          trackedPayload.current = null;
        }
      }
      return result;
    } catch (e) {
      if (alive.current && request === sequence.current)
        setLoadError(
          e.status === 404
            ? "本機服務尚未載入新工作台，請重新啟動本機服務。"
            : e.message,
        );
    }
  }, [agentId]);

  const refreshSocial = useCallback(async () => {
    const result = await Promise.allSettled([
      api("/social/publications"),
      api("/social/status"),
    ]);
    if (!alive.current) return;
    const failures = [];
    if (result[0].status === "fulfilled") setPublications(result[0].value);
    else failures.push(result[0].reason.message);
    if (result[1].status === "fulfilled") setSocialStatus(result[1].value);
    else failures.push(result[1].reason.message);
    setSocialError(failures.join("；"));
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    refreshSocial();
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, [refresh, refreshSocial]);
  useEffect(() => {
    const timer = setInterval(
      () => {
        refresh();
        if (!activeRun) refreshSocial();
      },
      activeRun ? 2000 : 20000,
    );
    return () => clearInterval(timer);
  }, [!!activeRun, refresh, refreshSocial]);
  useEffect(() => {
    try {
      localStorage.setItem(inputKey, input);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    if (field.current) {
      field.current.style.height = "auto";
      field.current.style.height =
        Math.min(160, Math.max(52, field.current.scrollHeight)) + "px";
    }
  }, [input]);
  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem(selectionKey, selectedId);
      else localStorage.removeItem(selectionKey);
    } catch {
      /* Input persistence warning is shown separately. */
    }
  }, [selectedId]);
  useEffect(() => {
    if (nearBottom.current)
      messagesEnd.current?.scrollIntoView({
        block: "end",
        behavior: "instant",
      });
  }, [state?.messages?.length, selectedId, activeRun?.id]);

  const openDetails = (id, tab) => {
    try {
      localStorage.setItem("studio-active", id);
      if (tab) localStorage.setItem("studio-tab", tab);
    } catch {
      setError("無法儲存作品選擇，請確認瀏覽器允許本機儲存。");
      return;
    }
    setDetailsId(id);
  };

  const submitPayload = async (payload, grantConsent = false) => {
    if (flight.current || activeRun) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setRetryPayload(null);
    setRebaseId(null);
    try {
      if (grantConsent) {
        await api("/settings", "PATCH", { aiConsent: true });
        setState((current) =>
          current ? { ...current, consent: true } : current,
        );
        setConsentRequest(null);
      }
      const run = await api("/agent/messages", "POST", payload);
      trackedRun.current = run.id;
      trackedPayload.current = payload;
      if (payload.intent === "draft" && !payload.draftId) setSelectedId(null);
      setInput((current) => (current.trim() === payload.text ? "" : current));
      nearBottom.current = true;
      await refresh();
    } catch (e) {
      setError(e.message);
      if (
        e.code === "AGENT_DRAFT_EPOCH_MISMATCH" &&
        payload.draftId &&
        !state?.drafts?.find((draft) => draft.id === payload.draftId)?.workId
      )
        setRebaseId(payload.draftId);
      setRetryPayload(payload);
      setInput((current) => current || payload.text);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  const approve = async (draft = selected, fromInput = false) => {
    if (!draft || flight.current || activeRun) return;
    if (draft.quality?.blocking?.length) {
      setError(
        "這份草稿仍有需要修正的內容，請查看文章下方的內容檢查後提出修改。",
      );
      return;
    }
    if (draft.status !== "pending") {
      setNotice(
        draft.status === "approved"
          ? "這份文章已通過審核。你可以安排 Threads 發布，或繼續提出修改。"
          : "這是舊版本，請選擇最新草稿。",
      );
      return;
    }
    flight.current = true;
    setBusy(true);
    setError("");
    setRebaseId(null);
    try {
      await api(`/agent/drafts/${draft.id}/approve`, "POST", {});
      setDismissedContinuation(latestRun?.id || null);
      setNotice(`《${draft.title}》已通過審核。接下來可以安排 Threads 發布。`);
      if (fromInput) setInput("");
      await refresh();
    } catch (e) {
      setError(e.message);
      if (e.code === "AGENT_DRAFT_EPOCH_MISMATCH" && !draft.workId)
        setRebaseId(draft.id);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  const send = (text = input, intent) => {
    const trimmed = text.trim();
    if (
      !trimmed ||
      disabled ||
      flight.current ||
      consentRequest ||
      !state ||
      loadError
    )
      return;
    const target =
      proposal ||
      (/修改|重新設計|改版|排版|配色|改圖|圖片/.test(trimmed)
        ? reviewItem
        : null);
    if (target) setProposal(target);
    const payload = {
      agentId: "creation",
      skillId: "ig-carousel",
      workflow: "ig-carousel",
      id: crypto.randomUUID(),
      text: trimmed,
      intent: "chat",
      ...(target
        ? {
            ...(target.legacyDraftId
              ? { legacyDraftId: target.legacyDraftId }
              : {
                  proposalRef: {
                    messageId: target.messageId,
                    index: target.index,
                  },
                }),
          }
        : {}),
    };
    if (!state.consent) {
      setConsentRequest(payload);
      return;
    }
    submitPayload(payload);
  };

  const adopt = async (workId) => {
    if (flight.current || activeRun) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("/agent/adopt", "POST", { workId });
      const draft = result.draft || result;
      setSelectedId(draft.id);
      setDismissedContinuation(latestRun?.id || null);
      setRebaseId(null);
      nearBottom.current = true;
      await refresh();
      field.current?.focus();
    } catch (e) {
      setError(e.message);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!activeRun || flight.current) return;
    flight.current = true;
    setBusy(true);
    try {
      await api(`/agent/runs/${activeRun.id}/cancel`, "POST", {});
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const selectDraft = (draft) => {
    setSelectedId(draft.id);
    setRemember(true);
    setError("");
    setNotice("");
    setDismissedContinuation(latestRun?.id || null);
    setRebaseId(null);
    nearBottom.current = true;
    field.current?.focus();
  };

  const rebase = async () => {
    if (!rebaseId || flight.current || activeRun) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const draft = await api(`/agent/drafts/${rebaseId}/rebase`, "POST", {});
      setSelectedId(draft.id);
      setRebaseId(null);
      setRetryPayload(null);
      setNotice("已沿用還原的草稿建立新版本，請重新審核後再安排發布。");
      nearBottom.current = true;
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="agent-studio ig-simple" aria-label="AI 創作工作台">
      <TopicPlanning onSelect={(topic) => { setProposal(null); setInput(`請依這個已選題材建立 IG 輪播與發文文案：\n${topic.title}\n${topic.summary}\n切角：${topic.angle}\n來源：${topic.sources.map(s=>s.url).join("\n")}`); }} />
      <nav className="agent-roster" aria-label="創作 Agent">
        <div className="agent-roster-heading">
          <h2>創作</h2>
        </div>
        {!state && <p className="agent-muted">正在載入 Agent…</p>}
        <div className="agent-roster-group">
          {(state?.workspaces || WORKSPACES)
            .filter((a) => a.id === "creation")
            .map((a) => {
              const working =
                activeRun &&
                (workspaceId(activeOwner) === a.id ||
                  activeRun.steps?.some(
                    (step) =>
                      workspaceId(step.agentId) === a.id &&
                      step.status === "running",
                  ));
              return (
                <Tooltip key={a.id} content={a.description} side="right">
                  <button
                    className={`agent-roster-item ${agentId === a.id ? "is-active" : ""}`}
                    aria-current={agentId === a.id ? "page" : undefined}
                    disabled={busy || !!consentRequest}
                    onClick={() => onAgentChange(a.id)}
                  >
                    <span className={`agent-roster-icon is-${a.id}`}>
                      <AgentIcon id={a.id} size={16} weight="regular" />
                    </span>
                    <span>
                      <strong>IG 輪播</strong>
                    </span>
                    {working && (
                      <SpinnerGap
                        className="agent-spin"
                        size={14}
                        aria-label="執行中"
                      />
                    )}
                  </button>
                </Tooltip>
              );
            })}
        </div>
      </nav>
      <main className="agent-conversation">
        <header className="agent-header">
          <div>
            <span className="agent-avatar" aria-hidden="true">
              <AgentIcon id={agentId} size={17} weight="regular" />
            </span>
            <div>
              <h2>IG 輪播創作</h2>
              {activeRun && <p>{agentName(activeOwner)}正在執行任務</p>}
            </div>
          </div>
          <div>
            <button
              className="agent-header-button"
              onClick={() => setPreferencesOpen(true)}
              disabled={!state}
            >
              <SlidersHorizontal size={16} />
              <span>寫作偏好</span>
              {state?.preferences?.filter((p) => p.active).length > 0 && <i />}
            </button>
            <button
              className="agent-icon"
              onClick={() => {
                refresh();
                refreshSocial();
              }}
              aria-label="重新整理工作台"
              disabled={busy}
            >
              <ArrowClockwise size={17} />
            </button>
          </div>
        </header>
        {loadError && (
          <div className="agent-load-error" role="alert">
            <span>
              {state
                ? "暫時無法更新工作台，已保留目前內容。"
                : "工作台暫時無法載入。"}{" "}
              {loadError}
            </span>
            <button onClick={refresh}>重試</button>
            {!state && (
              <button onClick={() => setDetailsId("existing-library")}>
                開啟現有作品
              </button>
            )}
          </div>
        )}
        <div
          className="agent-message-scroll"
          ref={scrollRegion}
          onScroll={() => {
            const el = scrollRegion.current;
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          {!state && !loadError && (
            <div className="agent-loading" role="status">
              <SpinnerGap className="agent-spin" size={22} />
              正在讀取創作工作台…
            </div>
          )}
          {state && (
            <div className="agent-thread">
              {!state.messages?.length && (
                <div className="agent-welcome">
                  <h1>
                    {agentId === "coordinator"
                      ? "想做什麼主題的 IG 輪播？"
                      : "想做什麼主題的 IG 輪播？"}
                  </h1>
                  <p>
                    告訴我主題、想法，或貼上想使用的素材。
                    <br />
                    我會提出 1～3 個提案；展開查看內容，再告訴我要怎麼改。
                  </p>
                </div>
              )}
              <div
                className="agent-messages"
                role="log"
                aria-label="創作對話紀錄"
                aria-live="polite"
                aria-relevant="additions"
              >
                {(state.messages || []).map((message) => (
                  <article
                    className={`agent-message is-${message.role}`}
                    key={message.id}
                  >
                    {message.role !== "user" && (
                      <span className="agent-message-avatar" aria-hidden="true">
                        <AgentIcon id={message.agentId || agentId} size={15} />
                      </span>
                    )}
                    <div>
                      <div className="agent-message-meta">
                        <strong>
                          {message.role === "user"
                            ? message.kind === "delegated-task"
                              ? "創意總監交辦"
                              : "你"
                            : agentName(message.agentId)}
                        </strong>
                        <time dateTime={message.createdAt}>
                          {time(message.createdAt)}
                        </time>
                      </div>
                      <div className="agent-message-body">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div
                                className="agent-table-scroll"
                                role="region"
                                aria-label="內容表格"
                                tabIndex={0}
                              >
                                <table>{children}</table>
                              </div>
                            ),
                          }}
                        >
                          {message.content || ""}
                        </Markdown>
                      </div>
                      {!!message.proposals?.length && (
                        <div className="ig-proposal-grid">
                          {message.proposals.map((p, index) => (
                            <details className="ig-proposal-card" key={index}>
                              <summary>
                                <span>
                                  提案 {index + 1} · {p.slides.length} 頁
                                </span>
                                <strong>{p.title}</strong>
                                <p>{p.summary}</p>
                                <span>
                                  查看內容 <CaretDown size={12} />
                                </span>
                              </summary>
                              <div className="ig-proposal-content">
                                <p>
                                  {p.slides.length} 張輪播圖片與 IG
                                  文案，請在右側待審核檢視。
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProposal({
                                      ...p,
                                      messageId: message.id,
                                      index,
                                    });
                                    field.current?.focus();
                                  }}
                                >
                                  查看圖片與文案
                                </button>
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                      {message.review?.passed && (
                        <p className="ig-content-review-note">
                          已完成獨立內容審查
                          {message.review.revisionCount ? "與一次退修複查" : ""}
                          ；圖片仍請在右側確認。
                        </p>
                      )}
                      {(message.role !== "user" ||
                        state.runs?.some(
                          (run) =>
                            run.id === message.runId &&
                            ["cancelled", "interrupted"].includes(run.status),
                        )) && (
                        <IGWorkflowLog
                          run={state.runs?.find(
                            (run) => run.id === message.runId,
                          )}
                        />
                      )}
                      {message.draftId &&
                        state.drafts?.some((d) => d.id === message.draftId) && (
                          <button
                            className="agent-message-link"
                            onClick={() =>
                              selectDraft(
                                state.drafts.find(
                                  (d) => d.id === message.draftId,
                                ),
                              )
                            }
                          >
                            <FileText size={14} />
                            查看這份草稿
                            <CaretRight size={13} />
                          </button>
                        )}
                    </div>
                  </article>
                ))}
              </div>
              {activeRun && (
                <div className="agent-working" role="status">
                  <SpinnerGap size={17} className="agent-spin" />
                  <span>
                    {activeRun.phase?.startsWith("ig-")
                      ? {
                          "ig-compose": "正在撰寫輪播與貼文",
                          "ig-review": "正在獨立檢查內容",
                          "ig-revise": "正在依審稿意見修訂",
                        }[activeRun.phase] || "正在製作輪播"
                      : activeOwner !== agentId
                        ? `${agentName(activeOwner)}正在工作，你可以先閱讀對話`
                        : activeRun.phase === "synthesis"
                          ? "正在整合團隊成果"
                          : "正在處理任務"}
                    <span className="agent-working-dots">…</span>
                  </span>
                  <button
                    className="agent-text-button"
                    disabled={busy}
                    onClick={cancel}
                  >
                    <Stop size={12} />
                    停止
                  </button>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>
          )}
        </div>
        <div className="agent-compose-area">
          {error && (
            <div className="agent-action-error" role="alert">
              <span>{error}</span>
              {retryPayload && (
                <button
                  disabled={disabled}
                  onClick={() => {
                    if (!state?.consent) setConsentRequest(retryPayload);
                    else submitPayload(retryPayload);
                  }}
                >
                  重試
                </button>
              )}
              {selected?.workId && (
                <button
                  disabled={disabled}
                  onClick={() => adopt(selected.workId)}
                >
                  重新載入作品稿
                </button>
              )}
              {rebaseId && (
                <button disabled={disabled} onClick={rebase}>
                  沿用還原草稿
                </button>
              )}
              <button
                className="agent-icon"
                aria-label="關閉提示"
                onClick={() => setError("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <form
            className={`agent-composer ${selected ? "has-selection" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {proposal && (
              <div className="agent-compose-context">
                <FileText size={13} />
                <span>修改提案：{proposal.title}</span>
                <button
                  type="button"
                  className="agent-icon"
                  aria-label="取消提案選擇"
                  onClick={() => setProposal(null)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <label className="agent-sr-only" htmlFor="agent-message-input">
              創作指示與審稿回覆
            </label>
            <textarea
              id="agent-message-input"
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  !e.isComposing &&
                  e.keyCode !== 229 &&
                  e.nativeEvent.keyCode !== 229
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                proposal
                  ? "告訴我這個提案要怎麼改…"
                  : "想做什麼主題的 IG 輪播？"
              }
              maxLength={12000}
              rows={2}
            />
            <div className="agent-composer-bottom">
              <span className="agent-composer-hint">
                Enter 送出 · Shift + Enter 換行
              </span>
              <button
                className="agent-send"
                type="submit"
                disabled={!input.trim() || disabled || !state || !!loadError}
                aria-label={
                  selected && APPROVALS.has(input.trim())
                    ? "通過審核"
                    : "送出訊息"
                }
              >
                {busy ? (
                  <SpinnerGap className="agent-spin" size={19} />
                ) : (
                  <ArrowUp size={20} weight="bold" />
                )}
              </button>
            </div>
          </form>
          <p
            className={`agent-compose-footnote ${storageError ? "agent-error-text" : ""}`}
          >
            {storageError
              ? "輸入內容暫時無法保存，離開前請先複製。"
              : "你的審核，決定最後的樣子。通過後再安排發布。"}
          </p>
        </div>
      </main>
      <aside id="agent-articles" className="agent-sidebar" aria-label="待審核">
        <div className="ig-review-header">
          <h2>待審核</h2>
          {reviewItems.length > 0 && (
            <select
              aria-label="選擇待審核提案"
              value={reviewItem?.key || ""}
              onChange={(e) => {
                const item = reviewItems.find((p) => p.key === e.target.value);
                setProposal(item);
              }}
            >
              {reviewItems.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.title} ·{" "}
                  {
                    IG_STYLES.find(
                      (s) => s.id === (p.design?.style || "typographic"),
                    )?.name
                  }
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="agent-sidebar-body">
          {reviewItem ? (
            <IGReview
              key={reviewItem.key}
              proposal={reviewItem}
              disabled={disabled}
              onApplyStyle={async (style) => {
                const message = await api("/agent/proposals/style", "POST", {
                  id: crypto.randomUUID(),
                  style,
                  ...(reviewItem.legacyDraftId
                    ? { legacyDraftId: reviewItem.legacyDraftId }
                    : {
                        proposalRef: {
                          messageId: reviewItem.messageId,
                          index: reviewItem.index,
                        },
                      }),
                });
                setProposal({
                  ...message.proposals[0],
                  messageId: message.id,
                  index: 0,
                  key: `${message.id}:0`,
                });
                await refresh();
              }}
              onRevise={(text) => {
                setProposal(reviewItem);
                setInput(text);
                field.current?.focus();
              }}
            />
          ) : (
            <p className="agent-muted">
              提出主題後，輪播圖片和 IG 文案會顯示在這裡。
            </p>
          )}
        </div>
      </aside>
      {preferencesOpen && (
        <PreferencesDialog
          preferences={state?.preferences || []}
          onClose={() => setPreferencesOpen(false)}
          onChanged={refresh}
        />
      )}
      {consentRequest && (
        <Dialog
          title="啟用你的 AI 創作夥伴"
          onClose={() => {
            if (!busy) setConsentRequest(null);
          }}
        >
          <div className="agent-consent">
            <span className="agent-consent-icon">
              <Sparkle size={26} />
            </span>
            <p>
              使用本機 Codex
              協助創作時，這次指示、選取的貼文、草稿與寫作偏好會傳送給模型服務。
            </p>
            <p className="agent-muted">
              你仍可先審閱、修改；產生內容不會直接公開發布。
            </p>
            {error && (
              <p className="agent-error-text" role="alert">
                {error}
              </p>
            )}
            <div>
              <button disabled={busy} onClick={() => setConsentRequest(null)}>
                先不要
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => submitPayload(consentRequest, true)}
              >
                {busy ? "正在連接…" : "同意並開始"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {detailsId && (
        <Dialog
          title="作品細節"
          wide
          onClose={() => {
            setDetailsId(null);
            refresh();
          }}
        >
          <div className="agent-work-details">
            <Studio
              key={detailsId}
              onArticle={(...args) => {
                setDetailsId(null);
                return onArticle?.(...args);
              }}
            />
          </div>
        </Dialog>
      )}
      {publishArticle && (
        <PublishDialog
          article={publishArticle}
          defaultScheduled
          onClose={() => setPublishArticle(null)}
          onDone={() => {
            setPublishArticle(null);
            setRightTab("scheduled");
            refreshSocial();
            refresh();
          }}
        />
      )}
    </section>
  );
}
