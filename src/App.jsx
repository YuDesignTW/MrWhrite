import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Feather,
  Plus,
  MagnifyingGlass,
  ArrowUp,
  ArrowLeft,
  ArrowCounterClockwise,
  ArrowClockwise,
  Check,
  CheckCircle,
  CloudSlash,
  DotsThree,
  Copy,
  DownloadSimple,
  Trash,
  ClockCounterClockwise,
  TextAa,
  SlidersHorizontal,
  Plugs,
  Sparkle,
  X,
  SidebarSimple,
  CaretDown,
  Keyboard,
  TextB,
  TextItalic,
  LinkSimple,
  Stop,
  FileText,
  WarningCircle,
  Command,
  ArrowRight,
  Sun,
  Moon,
} from "@phosphor-icons/react";
import { api, connect, cache, download, toMarkdown, dateLabel } from "./api";
import { AgentStudio } from "./AgentStudio";
import { Intelligence } from "./Intelligence";
import { PublishDialog } from "./PublishDialog";
import { Editor } from "./Editor";
import { toPlainText } from "./plain-text";
import { Settings, Dialog } from "./Settings";
import { useTheme } from "./theme";
const IconButton = ({ label, children, ...p }) => (
  <button className="icon-btn" aria-label={label} title={label} {...p}>
    {children}
  </button>
);
export function App() {
  const [creativeBrief, setCreativeBrief] = useState(null);
  const [theme, setTheme] = useTheme();
  const [view, setView] = useState(
    () => localStorage.getItem("mrwhite-view") || "writing",
  );
  useEffect(() => {
    localStorage.setItem("mrwhite-view", view);
  }, [view]);
  const [publishArticle, setPublishArticle] = useState(null);
  const [articles, setArticles] = useState([]),
    [active, setActive] = useState(null),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(50),
    [preview, setPreview] = useState(false),
    [menu, setMenu] = useState(null),
    [settings, setSettings] = useState(null),
    [prefs, setPrefs] = useState({ wordCount: true, animation: true }),
    [toast, setToast] = useState(null),
    [mobile, setMobile] = useState(false),
    [selection, setSelection] = useState({ from: 0, to: 0, valid: false }),
    [instruction, setInstruction] = useState(""),
    [mode, setMode] = useState("auto"),
    [operations, setOperations] = useState([]),
    [consent, setConsent] = useState(false),
    [whole, setWhole] = useState(false),
    [history, setHistory] = useState(null),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [saving, setSaving] = useState({}),
    [voice, setVoice] = useState(null);
  const refs = useRef([]),
    activeRef = useRef(null),
    pending = useRef(new Map()),
    editor = useRef(),
    title = useRef(),
    prompt = useRef(),
    newLock = useRef(false),
    epoch = useRef(null),
    timer = useRef(),
    seenOps = useRef(new Set());
  const notify = (text, action) => {
    setToast({ text, action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6500);
  };
  const update = useCallback((fn) => {
    refs.current = fn(refs.current);
    setArticles(refs.current);
  }, []);
  const remember = async (a) => {
    try {
      await cache.put(a);
    } catch {
      setError("裝置暫存失敗。請立即複製或匯出內容。");
    }
  };
  const save = useCallback(
    async (id) => {
      if (pending.current.has(id)) {
        await pending.current.get(id);
        if (refs.current.find((a) => a.id === id)?.dirty) return save(id);
        return refs.current.find((a) => a.id === id);
      }
      const a = refs.current.find((a) => a.id === id);
      if (!a || !a.dirty || a.conflict) return a;
      const task = (async () => {
        setSaving((s) => ({ ...s, [id]: true }));
        try {
          if (a.local) await api("/articles", "POST", { id: a.id }, a.epoch);
          const saved = await api(
            "/articles/" + id,
            "PATCH",
            { title: a.title, body: a.body, baseRevision: a.revision },
            a.epoch,
          );
          let merged;
          update((all) =>
            all.map((current) => {
              if (current.id !== id) return current;
              merged = {
                ...saved,
                epoch: a.epoch,
                dirty: current.body !== a.body || current.title !== a.title,
                body: current.body,
                title: current.title,
              };
              return merged;
            }),
          );
          if (merged) await remember(merged);
          setOffline(false);
          return merged;
        } catch (e) {
          if (e.status === 409) {
            update((all) =>
              all.map((x) => (x.id === id ? { ...x, conflict: true } : x)),
            );
            setError(e.message);
          } else if (e.status === 423) {
            setError(e.message);
          } else {
            setOffline(true);
          }
          return null;
        } finally {
          setSaving((s) => ({ ...s, [id]: false }));
          pending.current.delete(id);
        }
      })();
      pending.current.set(id, task);
      return task;
    },
    [update],
  );
  useEffect(() => {
    let live = true;
    (async () => {
      const local = await cache.all().catch(() => []);
      if (!live) return;
      update(() => local.filter((a) => !a.deletedAt));
      const selected = await cache.meta("active").catch(() => null);
      if (selected) {
        setActive(selected);
        activeRef.current = selected;
      }
      try {
        const session = await connect();
        epoch.current = session.epoch;
        const [server, p, v, ops] = await Promise.all([
          api("/articles"),
          api("/settings"),
          api("/voice"),
          api("/operations"),
        ]);
        if (!live) return;
        const merged = server.map((a) => {
          const draft = local.find((x) => x.id === a.id && x.dirty);
          return draft
            ? {
                ...draft,
                conflict:
                  draft.epoch !== session.epoch ||
                  draft.revision !== a.revision,
              }
            : { ...a, epoch: session.epoch };
        });
        for (const a of local.filter(
          (a) => a.dirty && !server.some((s) => s.id === a.id),
        ))
          merged.push(a.epoch !== session.epoch ? { ...a, conflict: true } : a);
        update(() => merged);
        for (const a of merged) await remember(a);
        setPrefs(p);
        setVoice(v);
        setOperations(ops);
        ops
          .filter((o) => o.status !== "running")
          .forEach((o) => seenOps.current.add(o.id + o.status));
        const id =
          merged.find((a) => a.id === selected)?.id || merged[0]?.id || null;
        setActive(id);
        activeRef.current = id;
        for (const a of merged.filter((a) => a.dirty && !a.conflict))
          save(a.id);
      } catch {
        setOffline(true);
        const id =
          local.find((a) => a.id === selected)?.id || local[0]?.id || null;
        setActive(id);
        activeRef.current = id;
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      articles.filter((a) => a.dirty && !a.conflict).forEach((a) => save(a.id));
    }, 800);
    return () => clearTimeout(t);
  }, [articles, save]);
  useEffect(() => {
    const t = setInterval(() => {
      refs.current
        .filter((a) => a.dirty && !a.conflict)
        .forEach((a) => save(a.id));
    }, 5000);
    return () => clearInterval(t);
  }, [save]);
  useEffect(() => {
    const online = () =>
      refs.current
        .filter((a) => a.dirty && !a.conflict)
        .forEach((a) => save(a.id));
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [save]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save(activeRef.current);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMobile(true);
        document.querySelector('[aria-label="搜尋文章"]')?.focus();
      }
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const ops = await api("/operations");
        setOperations(ops);
        for (const op of ops) {
          const key = op.id + op.status;
          if (op.status === "running" || seenOps.current.has(key)) continue;
          seenOps.current.add(key);
          if (op.kind === "writing" && op.status === "completed") {
            const a = await api("/articles/" + op.articleId);
            const local = refs.current.find((x) => x.id === a.id);
            if (local?.dirty) continue;
            const fresh = { ...a, epoch: epoch.current };
            update((all) => all.map((x) => (x.id === a.id ? fresh : x)));
            await remember(fresh);
            notify("已寫入文章，可從版本紀錄復原。");
          } else if (op.status === "failed" || op.status === "conflict")
            notify(op.error || "生成未完成，原文保留。");
        }
      } catch {}
    }, 1200);
    return () => clearInterval(t);
  }, [update]);
  const article = articles.find((a) => a.id === active),
    op = operations.find(
      (o) => o.articleId === active && o.status === "running",
    ),
    lastResult = operations.find(
      (o) =>
        o.articleId === active &&
        ["proposed", "failed", "cancelled", "interrupted", "conflict"].includes(
          o.status,
        ) &&
        o.buffer,
    ),
    busy = !!op;
  const edit = (patch) => {
    if (!article) return;
    const a = {
      ...article,
      ...patch,
      dirty: true,
      updatedAt: new Date().toISOString(),
    };
    update((all) => all.map((x) => (x.id === a.id ? a : x)));
    remember(a);
  };
  const choose = async (id) => {
    if (active) save(active);
    update((all) =>
      [...all].sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      ),
    );
    activeRef.current = id;
    setActive(id);
    cache.meta("active", id);
    setSelection({ from: 0, to: 0, valid: false });
    setMode("auto");
    setPreview(false);
    setMobile(false);
    setMenu(null);
  };
  const create = async () => {
    if (newLock.current) return;
    newLock.current = true;
    if (active) save(active);
    let a = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dirty: true,
      local: true,
      epoch: epoch.current,
    };
    update((all) => [a, ...all]);
    await remember(a);
    choose(a.id);
    setTimeout(() => {
      title.current?.focus();
      newLock.current = false;
    }, 300);
  };
  const remove = async () => {
    try {
      await api("/articles/" + active, "DELETE", {});
      const deleted = article;
      await cache.delete(active);
      update((all) => all.filter((a) => a.id !== active));
      choose(refs.current[0]?.id || null);
      notify("文章已移至垃圾桶。", async () => {
        const a = await api("/articles/" + deleted.id + "/restore", "POST", {});
        update((all) => [{ ...a, epoch: epoch.current }, ...all]);
        choose(a.id);
      });
    } catch (e) {
      notify(e.message);
    }
  };
  const copy = async (plain) => {
    try {
      const text = plain
        ? toPlainText(toMarkdown(article))
        : toMarkdown(article);
      await navigator.clipboard.writeText(text);
      notify(plain ? "已複製純文字。" : "已複製 Markdown。");
      setMenu(null);
    } catch {
      notify("無法使用剪貼簿，請匯出 Markdown。");
    }
  };
  const exportArticle = () => {
    download(
      (article.title || `未命名文章-${article.id.slice(0, 6)}`).replace(
        /[\\/:*?"<>|\x00-\x1f]/g,
        "-",
      ) + ".md",
      toMarkdown(article),
    );
    setMenu(null);
  };
  const openSettings = async (page) => {
    if (active) await save(active);
    setMenu(null);
    setSettings(page);
  };
  const send = async (confirmed = false) => {
    if (!article || !instruction.trim() || busy) return;
    if (!prefs.aiConsent) {
      setConsent(true);
      return;
    }
    if (mode === "all" && !confirmed) {
      setWhole(true);
      return;
    }
    const saved = await save(active);
    const a = saved || refs.current.find((x) => x.id === active);
    if (!a || a.dirty || a.conflict) {
      notify("請先完成儲存，再使用 AI。");
      return;
    }
    let from = selection.valid ? selection.from : a.body.length,
      to = selection.valid ? selection.to : a.body.length;
    if (mode === "all") {
      from = 0;
      to = a.body.length;
    } else if (mode === "append") {
      from = to = a.body.length;
    }
    try {
      const result = await api("/operations", "POST", {
        id: crypto.randomUUID(),
        articleId: a.id,
        baseRevision: a.revision,
        instruction,
        from,
        to,
        mode:
          mode === "all"
            ? "replace_all"
            : from !== to
              ? "replace_selection"
              : a.body
                ? "insert"
                : "draft",
        confirmWhole: confirmed,
      });
      setOperations((all) => [result, ...all]);
      setPreview(false);
      setError("");
    } catch (e) {
      notify(e.message);
    }
  };
  const versions = async () => {
    try {
      await save(active);
      setHistory(await api("/articles/" + active + "/revisions"));
      setMenu(null);
    } catch (e) {
      notify(e.message);
    }
  };
  const restoreRevision = async (rev) => {
    if (!window.confirm("將還原此版本。目前的內容也會保存為新版本。")) return;
    try {
      await save(active);
      const a = refs.current.find((x) => x.id === active);
      const result = await api(
        `/articles/${active}/revisions/${rev.id}/restore`,
        "POST",
        { baseRevision: a.revision },
      );
      const fresh = { ...result, epoch: epoch.current };
      update((all) => all.map((x) => (x.id === active ? fresh : x)));
      await remember(fresh);
      setHistory(null);
      notify("已還原版本。");
    } catch (e) {
      notify(e.message);
    }
  };
  const resolveConflict = async (keep) => {
    try {
      const a = article;
      const session = await connect();
      epoch.current = session.epoch;
      let copyId = null;
      if (keep) {
        const created = await api("/articles", "POST", {
          id: crypto.randomUUID(),
        });
        const result = await api("/articles/" + created.id, "PATCH", {
          title: a.title + "（本機版本）",
          body: a.body,
          baseRevision: 0,
        });
        const fresh = { ...result, epoch: epoch.current };
        copyId = fresh.id;
        update((all) => [fresh, ...all]);
        await remember(fresh);
      }
      try {
        const remote = await api("/articles/" + a.id);
        const fresh = { ...remote, epoch: epoch.current };
        update((all) =>
          all.flatMap((x) =>
            x.id === a.id ? (remote.deletedAt ? [] : [fresh]) : [x],
          ),
        );
        if (remote.deletedAt) await cache.delete(a.id);
        else await remember(fresh);
      } catch (e) {
        if (e.status !== 404) throw e;
        update((all) => all.filter((x) => x.id !== a.id));
        await cache.delete(a.id);
      }
      if (copyId) choose(copyId);
      else if (!refs.current.some((x) => x.id === a.id))
        choose(refs.current[0]?.id || null);
      setError("");
      notify(keep ? "本機內容已另存為文章。" : "已載入較新版本。");
    } catch (e) {
      notify(e.message);
    }
  };
  const filtered = articles.filter((a) =>
    (a.title + " " + a.body).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div
      className={
        "app " +
        (view !== "writing" ? "intelligence-mode " : "") +
        (!prefs.animation ? "reduce-motion" : "")
      }
    >
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <div className="brand-row">
          <div className="brand">
            <Feather size={25} weight="light" />
            <span>
              懷特先生<small>MR. WHITE</small>
            </span>
          </div>
          <IconButton label="新增文章" onClick={create}>
            <Plus size={19} />
          </IconButton>
          <IconButton
            label="關閉文章清單"
            onClick={() => setMobile(false)}
            className="icon-btn mobile-only"
          >
            <X size={19} />
          </IconButton>
        </div>
        <div className="search">
          <MagnifyingGlass size={16} />
          <input
            aria-label="搜尋文章"
            placeholder="搜尋文章…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(50);
            }}
          />
          {search ? (
            <IconButton label="清除搜尋" onClick={() => setSearch("")}>
              <X size={13} />
            </IconButton>
          ) : (
            <kbd>⌘ K</kbd>
          )}
        </div>
        <div className="list-heading">
          <span>全部文章</span>
          <span>{articles.length}</span>
        </div>
        <div className="article-list">
          {filtered.slice(0, limit).map((a) => (
            <button
              key={a.id}
              className={"article-row " + (a.id === active ? "selected" : "")}
              aria-current={a.id === active ? "page" : undefined}
              onClick={() => {
                choose(a.id);
                setView("writing");
              }}
            >
              <div className="article-row-title">
                <FileText size={15} weight="light" />
                <strong>{a.title || "未命名文章"}</strong>
              </div>
              <p>
                {a.body.replace(/[#*`>]/g, "").slice(0, 90) || "還沒落筆的想法"}
              </p>
              <div className="article-row-meta">
                <span title={new Date(a.updatedAt).toLocaleString("zh-TW")}>
                  {dateLabel(a.updatedAt)}
                </span>
                {a.dirty && <span>{a.conflict ? "版本衝突" : "待同步"}</span>}
              </div>
            </button>
          ))}
          {filtered.length > limit && (
            <button
              className="text-button"
              onClick={() => setLimit(limit + 50)}
            >
              載入更多
            </button>
          )}
          {!filtered.length && (
            <div className="list-empty">
              {search ? (
                <>
                  <p>找不到符合的文章。</p>
                  <button onClick={() => setSearch("")}>清除搜尋</button>
                </>
              ) : (
                <>
                  <FileText size={24} weight="light" />
                  <p>從一篇空白文章開始。</p>
                  <button onClick={create}>
                    新增第一篇文章 <Plus size={13} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          <span>
            <Feather size={14} /> 給想法，一點空間。
          </span>
          <span className="version">v0.2</span>
        </div>
      </aside>
      {mobile && (
        <button
          className="drawer-overlay"
          aria-label="收合文章清單"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="workspace">
        <header className="topbar">
          <nav className="workspace-nav" aria-label="工作區">
            <button
              className={view === "writing" ? "active" : ""}
              onClick={() => setView("writing")}
            >
              寫作空間
            </button>
            <button
              className={view === "social" ? "active" : ""}
              onClick={() => {
                save(active);
                setView("social");
                setMobile(false);
              }}
            >
              情報室
            </button>
            <button
              className={view === "studio" ? "active" : ""}
              onClick={() => {
                save(active);
                setView("studio");
                setMobile(false);
              }}
            >
              創作工作台
            </button>
          </nav>
          <div className="breadcrumb">
            <IconButton
              label="開啟文章清單"
              className="icon-btn mobile-only"
              onClick={() => setMobile(true)}
            >
              <SidebarSimple size={20} />
            </IconButton>
            <span>
              {view === "studio"
                ? "創作工作台"
                : view === "social"
                  ? "情報室"
                  : "我的寫作空間"}
            </span>
            {article && view === "writing" && (
              <>
                <span className="slash">/</span>
                <span className="crumb-title">
                  {article.title || "未命名文章"}
                </span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              aria-label={theme === "dark" ? "切換為亮模式" : "切換為暗模式"}
              title={theme === "dark" ? "切換為亮模式" : "切換為暗模式"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              <span className="theme-label">
                {theme === "dark" ? "亮模式" : "暗模式"}
              </span>
            </button>
            <span
              hidden={view !== "writing"}
              className={"save-status " + (offline ? "warning" : "")}
              role="status"
            >
              {article ? (
                article.conflict ? (
                  <>
                    <WarningCircle size={14} /> 版本衝突
                  </>
                ) : article.dirty ? (
                  offline ? (
                    <>
                      <CloudSlash size={14} /> 僅存於此裝置
                    </>
                  ) : (
                    <>
                      <ClockCounterClockwise size={14} />{" "}
                      {saving[active] ? "儲存中" : "等待儲存"}
                    </>
                  )
                ) : (
                  <>
                    <Check size={14} /> 已儲存
                  </>
                )
              ) : (
                <>
                  <span className="status-dot" />
                  本機工作空間
                </>
              )}
            </span>
            <div className="menu-anchor">
              <button
                aria-label="開啟設定選單"
                className="avatar"
                onClick={() => setMenu(menu === "avatar" ? null : "avatar")}
              >
                W
              </button>
              {menu === "avatar" && (
                <div className="popover account-menu">
                  <div className="menu-label">
                    你的寫作空間<small>資料保存在這台電腦</small>
                  </div>
                  <button onClick={() => openSettings("voice")}>
                    <TextAa />
                    語氣風格
                  </button>
                  <button onClick={() => openSettings("connections")}>
                    <Plugs />
                    綁定設定
                  </button>
                  <button onClick={() => openSettings("general")}>
                    <SlidersHorizontal />
                    一般設定
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {error && (
          <div className="global-error" role="alert">
            {error}
            <button aria-label="關閉通知" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {article?.conflict && (
          <div className="conflict-banner">
            <WarningCircle size={17} />
            <span>其他分頁或還原作業已更新文章，你的修改仍保留。</span>
            <button onClick={() => resolveConflict(true)}>另存我的版本</button>
            <button
              onClick={() => {
                if (window.confirm("放棄此分頁的修改，載入已儲存版本？"))
                  resolveConflict(false);
              }}
            >
              載入較新版本
            </button>
          </div>
        )}
        {view === "studio" ? (
          <AgentStudio
            initialBrief={creativeBrief}
            onBriefConsumed={() => setCreativeBrief(null)}
            onIntelligence={() => setView("social")}
            onArticle={async (id, preset, replace = false) => {
              const a = await api("/articles/" + id);
              const local = refs.current.find((x) => x.id === id);
              if (!local?.dirty)
                update((all) => [
                  { ...a, epoch: epoch.current },
                  ...all.filter((x) => x.id !== id),
                ]);
              choose(id);
              if (preset) {
                setInstruction(preset);
                setMode(replace ? "all" : "append");
              }
              setView("writing");
            }}
          />
        ) : view === "social" ? (
          <Intelligence
            onCreate={(brief) => {
              setCreativeBrief(brief);
              setView("studio");
            }}
            onDraft={async (a) => {
              const fresh = { ...a, epoch: epoch.current };
              update((all) => [fresh, ...all]);
              await remember(fresh);
              choose(a.id);
              setView("writing");
              notify("已從情報建立獨立草稿。");
            }}
          />
        ) : article ? (
          <>
            <div className="document-toolbar">
              <div className="segmented">
                <button
                  className={!preview ? "active" : ""}
                  onClick={() => setPreview(false)}
                >
                  <FileText size={14} />
                  編輯
                </button>
                <button
                  className={preview ? "active" : ""}
                  onClick={() => setPreview(true)}
                >
                  預覽
                </button>
              </div>
              <div className="document-tools">
                <button
                  className="pill"
                  disabled={busy || article.conflict || offline}
                  onClick={async () => {
                    const a = await save(active);
                    if (!a || a.dirty || a.conflict) {
                      notify("請先完成儲存再發布。");
                      return;
                    }
                    setPublishArticle({ ...a });
                  }}
                >
                  發布 Threads
                </button>
                <IconButton
                  label="復原"
                  disabled={busy || preview}
                  onClick={() => editor.current?.undo()}
                >
                  <ArrowCounterClockwise size={16} />
                </IconButton>
                <IconButton
                  label="重做"
                  disabled={busy || preview}
                  onClick={() => editor.current?.redo()}
                >
                  <ArrowClockwise size={16} />
                </IconButton>
                <span className="divider" />
                <button className="pill" onClick={() => copy(false)}>
                  <Copy size={14} />
                  複製
                </button>
                <div className="menu-anchor">
                  <IconButton
                    label="文章操作"
                    onClick={() =>
                      setMenu(menu === "article" ? null : "article")
                    }
                  >
                    <DotsThree size={22} />
                  </IconButton>
                  {menu === "article" && (
                    <div className="popover">
                      <button onClick={() => copy(false)}>
                        <Copy />
                        複製 Markdown
                      </button>
                      <button onClick={() => copy(true)}>
                        <TextAa />
                        複製純文字
                      </button>
                      <button onClick={exportArticle}>
                        <DownloadSimple />
                        匯出 Markdown
                      </button>
                      <button onClick={versions}>
                        <ClockCounterClockwise />
                        版本紀錄
                      </button>
                      <button
                        onClick={async () => {
                          if (!article.body.trim()) {
                            notify("請先寫下內容。");
                            return;
                          }
                          if (!window.confirm("將這篇文章的快照加入語氣範例？"))
                            return;
                          try {
                            await api("/voice/import", "POST", {
                              samples: [
                                {
                                  title: article.title,
                                  body: article.body,
                                  source: "article",
                                },
                              ],
                            });
                            notify("已加入語氣範例，尚未自動更新風格。");
                            setMenu(null);
                          } catch (e) {
                            notify(e.message);
                          }
                        }}
                      >
                        <TextAa />
                        加入語氣範例
                      </button>
                      <hr />
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={remove}
                      >
                        <Trash />
                        刪除文章
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="document-scroll">
              <article className="document">
                <div className="document-overline">
                  <span>MARKDOWN</span>
                  <span className="document-date">
                    {new Date(article.createdAt).toLocaleDateString("zh-TW", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <input
                  ref={title}
                  className="title-input"
                  aria-label="文章標題"
                  placeholder="未命名文章"
                  value={article.title}
                  maxLength={500}
                  readOnly={false}
                  onChange={(e) => edit({ title: e.target.value })}
                />
                <div className="title-rule" />
                {selection.from !== selection.to && !preview && !busy && (
                  <div className="selection-toolbar">
                    <IconButton
                      label="粗體"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.current?.format("bold")}
                    >
                      <TextB size={16} />
                    </IconButton>
                    <IconButton
                      label="斜體"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.current?.format("italic")}
                    >
                      <TextItalic size={16} />
                    </IconButton>
                    <IconButton
                      label="連結"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.current?.format("link")}
                    >
                      <LinkSimple size={16} />
                    </IconButton>
                    <button onClick={() => prompt.current?.focus()}>
                      <Sparkle size={14} />請 AI 修改
                    </button>
                  </div>
                )}
                <Editor
                  key={article.id}
                  ref={editor}
                  article={article}
                  onChange={(body) => edit({ body })}
                  onSelect={(value) => setSelection({ ...value, valid: true })}
                  preview={preview}
                  readOnly={false}
                  onAI={() => prompt.current?.focus()}
                />
                {busy && (
                  <div className="generation-state" role="status">
                    <Sparkle size={18} className="breathe" />
                    <div>
                      <strong>正在整理你的想法</strong>
                      <p>
                        等待 Codex
                        回應，完成後先預覽修改建議，由你決定是否套用。
                      </p>
                    </div>
                  </div>
                )}
              </article>
            </div>
            <div className="composer-dock">
              <div className="document-footnote">
                <span>
                  {prefs.wordCount
                    ? `${[...article.body].length.toLocaleString()} 字元`
                    : "Markdown 文件"}
                  <span className="dot-separator">·</span>
                  {Math.max(1, Math.ceil([...article.body].length / 400))}{" "}
                  分鐘閱讀
                </span>
                <span>
                  <Keyboard size={13} /> 自由書寫，隨時儲存
                </span>
              </div>
              {lastResult && !busy && (
                <div className="partial-result">
                  <span>
                    {lastResult.status === "proposed"
                      ? "AI 修改建議 · 尚未套用"
                      : "上次操作保留了可用結果。"}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(lastResult.buffer);
                        notify("已複製結果。");
                      } catch {
                        notify("無法複製。");
                      }
                    }}
                  >
                    複製結果
                  </button>
                  <details className="ai-diff">
                    <summary>查看原文與建議</summary>
                    <div>
                      <h4>原文</h4>
                      <pre>{lastResult.original || "（插入位置）"}</pre>
                      <h4>建議</h4>
                      <pre>{lastResult.buffer}</pre>
                    </div>
                  </details>
                  {lastResult.status === "proposed" && (
                    <button
                      onClick={async () => {
                        try {
                          await api(
                            "/operations/" + lastResult.id + "/reject",
                            "POST",
                            {},
                          );
                          setOperations((all) =>
                            all.map((o) =>
                              o.id === lastResult.id
                                ? { ...o, status: "rejected" }
                                : o,
                            ),
                          );
                        } catch (e) {
                          notify(e.message);
                        }
                      }}
                    >
                      放棄建議
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await save(active);
                        if (refs.current.find((x) => x.id === active)?.dirty)
                          throw Error("請先保存目前的修改。");
                        const a = await api(
                          "/operations/" + lastResult.id + "/apply",
                          "POST",
                          {},
                        );
                        update((all) =>
                          all.map((x) =>
                            x.id === a.id ? { ...a, epoch: epoch.current } : x,
                          ),
                        );
                        await remember({ ...a, epoch: epoch.current });
                        setOperations((all) =>
                          all.map((o) =>
                            o.id === lastResult.id
                              ? { ...o, status: "completed" }
                              : o,
                          ),
                        );
                        notify("已保留生成內容。");
                      } catch (e) {
                        notify(e.message);
                      }
                    }}
                  >
                    保留內容
                  </button>
                </div>
              )}
              <div className={"composer " + (busy ? "generating" : "")}>
                <div className="composer-topline">
                  <div className="composer-label">
                    <Sparkle size={16} weight="light" />
                    <span>與懷特先生一起寫</span>
                  </div>
                  <select
                    aria-label="AI 修改範圍"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    disabled={busy}
                  >
                    <option value="auto">
                      {selection.from !== selection.to
                        ? `修改選取文字 · ${selection.to - selection.from} 字`
                        : article.body
                          ? selection.valid
                            ? "在游標處插入"
                            : "接續撰寫"
                          : "從想法起草"}
                    </option>
                    <option value="append">接續撰寫</option>
                    <option value="all">改寫全文</option>
                  </select>
                </div>
                <div className="composer-input-row">
                  <textarea
                    ref={prompt}
                    aria-label="AI 寫作指令"
                    placeholder="輸入想法，或告訴懷特先生想怎麼修改…"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === "Enter" &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={2}
                    disabled={busy}
                  />
                  {busy ? (
                    <button
                      className="send-button stop"
                      aria-label="停止生成"
                      onClick={async () => {
                        try {
                          await api(
                            "/operations/" + op.id + "/cancel",
                            "POST",
                            {},
                          );
                          setOperations((all) =>
                            all.map((o) =>
                              o.id === op.id
                                ? { ...o, status: "cancelled" }
                                : o,
                            ),
                          );
                          notify("已停止生成，原文保留。");
                        } catch (e) {
                          notify(e.message);
                        }
                      }}
                    >
                      <Stop size={17} weight="fill" />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      aria-label="送出 AI 指令"
                      disabled={!instruction.trim() || article.conflict}
                      onClick={() => send()}
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
                <div className="composer-bottom">
                  <span>
                    {voice?.config.enabled ? (
                      <>
                        <span className="status-dot" />
                        個人語氣已啟用
                      </>
                    ) : (
                      <>依照你的當次指令撰寫</>
                    )}
                  </span>
                  <span>
                    <Command size={12} /> Enter 送出
                  </span>
                </div>
              </div>
              <div className="dock-note">你的文字，你的節奏。</div>
            </div>
          </>
        ) : (
          <div className="workspace-empty">
            <Feather size={38} weight="thin" />
            <h1>{loading ? "正在打開寫作空間" : "從一篇空白文章開始。"}</h1>
            <p>寫下眼前的想法，剩下的慢慢來。</p>
            <button className="primary" onClick={create}>
              <Plus size={17} />
              新增文章
            </button>
            <small>Markdown 編輯 · 本機自動儲存</small>
          </div>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={17} />
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action();
                setToast(null);
              }}
            >
              撤銷
            </button>
          )}
          <button aria-label="關閉提示" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {settings && (
        <Settings
          page={settings}
          setPage={setSettings}
          onClose={() => {
            setSettings(null);
            api("/voice")
              .then(setVoice)
              .catch(() => {});
            api("/articles")
              .then((all) =>
                update((current) =>
                  all.map(
                    (a) =>
                      current.find((x) => x.id === a.id && x.dirty) || {
                        ...a,
                        epoch: epoch.current,
                      },
                  ),
                ),
              )
              .catch(() => {});
          }}
          prefs={prefs}
          theme={theme}
          setTheme={setTheme}
          setPrefs={setPrefs}
          notify={notify}
          beforeRestore={async () => {
            for (const a of refs.current.filter((a) => a.dirty))
              await save(a.id);
            if (refs.current.some((a) => a.dirty))
              throw Error("還有尚未同步的內容，請先另存或匯出。");
          }}
        />
      )}
      {consent && (
        <Dialog title="讓 AI 參與這一次寫作" onClose={() => setConsent(false)}>
          <p>
            送出後，本次指令、必要文章內容與已啟用的語氣參考，會透過你登入的
            Codex 傳送至模型服務。
          </p>
          <p className="muted">
            文章保存在本機；AI
            生成需要網路，使用量依你的登入方式與服務限制計算。
          </p>
          <button
            className="primary"
            onClick={async () => {
              try {
                const p = await api("/settings", "PATCH", { aiConsent: true });
                setPrefs(p);
                setConsent(false);
                notify("已確認，請再次送出你的寫作指令。");
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            我了解，啟用 AI 寫作 <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
      {publishArticle && (
        <PublishDialog
          article={publishArticle}
          onClose={() => setPublishArticle(null)}
          onDone={(p) => {
            setPublishArticle(null);
            notify(
              p.status === "published"
                ? "已發布至 Threads。"
                : p.status === "queued"
                  ? "發布工作已排程。"
                  : "請在情報室查看發布結果。",
            );
            setView("social");
          }}
        />
      )}
      {whole && (
        <Dialog title="要改寫整篇文章嗎？" onClose={() => setWhole(false)}>
          <p>AI 將替換全部內文。原文會保存為版本，可隨時還原。</p>
          <button
            className="primary"
            onClick={() => {
              setWhole(false);
              send(true);
            }}
          >
            確認改寫全文
          </button>
        </Dialog>
      )}
      {history && (
        <Dialog title="文章版本紀錄" onClose={() => setHistory(null)} wide>
          <p className="muted">
            每次還原都會保留目前版本。AI 修改前的原文也會保存在這裡。
          </p>
          {!history.length ? (
            <div className="empty-panel">這篇文章還沒有歷史版本。</div>
          ) : (
            history.map((r) => (
              <details className="revision" key={r.id}>
                <summary>
                  <span>
                    版本 {r.revision} ·{" "}
                    {r.source === "ai"
                      ? "AI 修改前"
                      : r.source === "restore"
                        ? "還原前"
                        : "手動編輯"}
                  </span>
                  <small>{new Date(r.savedAt).toLocaleString("zh-TW")}</small>
                </summary>
                <pre>{r.title + "\n\n" + r.body}</pre>
                <button onClick={() => restoreRevision(r)}>還原此版本</button>
              </details>
            ))
          )}
        </Dialog>
      )}
    </div>
  );
}
