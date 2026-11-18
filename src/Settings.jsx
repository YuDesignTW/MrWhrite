import React, { useState, useEffect, useRef } from "react";
import {
  X,
  TextAa,
  Plugs,
  SlidersHorizontal,
  UploadSimple,
  Plus,
  Trash,
  Check,
  ArrowClockwise,
  CloudArrowUp,
  Folder,
  Desktop,
  ArrowRight,
  DownloadSimple,
  Feather,
  SpinnerGap,
  WarningCircle,
  Sun,
  Moon,
} from "@phosphor-icons/react";
import { api, cache } from "./api";
import { Markdown } from "./Editor";
export function Dialog({ title, onClose, children, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const prior = document.activeElement;
    ref.current.showModal();
    return () => {
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"dialog " + (wide ? "wide" : "")}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-header">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="關閉視窗" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
export function Settings({
  page,
  setPage,
  onClose,
  prefs,
  setPrefs,
  notify,
  beforeRestore,
  theme,
  setTheme,
}) {
  const [voice, setVoice] = useState(null),
    [status, setStatus] = useState(null),
    [backupStatus, setBackupStatus] = useState(null),
    [backups, setBackups] = useState([]),
    [trash, setTrash] = useState([]),
    [busy, setBusy] = useState(""),
    [pastes, setPastes] = useState([]),
    [rules, setRules] = useState(""),
    [operation, setOperation] = useState(null),
    [approved, setApproved] = useState(false),
    [remote, setRemote] = useState(prefs.backupRemote || ""),
    [restore, setRestore] = useState(null),
    [remoteBackups, setRemoteBackups] = useState(null),
    [error, setError] = useState("");
  const files = useRef();
  const refresh = async () => {
    const [v, b, t, p] = await Promise.all([
      api("/voice"),
      api("/backups"),
      api("/articles?trash=1"),
      api("/settings"),
    ]);
    setVoice(v);
    setBackups(b);
    setTrash(t);
    setPrefs(p);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    api("/integrations/codex/status")
      .then(setStatus)
      .catch(() => setStatus({ message: "無法連接本機服務。" }));
    api("/backups/status")
      .then(setBackupStatus)
      .catch(() => {});
    api("/operations")
      .then((ops) => {
        const o = ops.find((o) => o.kind === "voice");
        if (o?.status === "running") setOperation(o);
        else if (o?.status === "completed") {
          setOperation(o);
          setRules(o.buffer);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (operation?.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const o = await api("/operations/" + operation.id);
        setOperation(o);
        if (o.status === "completed") setRules(o.buffer);
        else if (o.status === "failed") setError(o.error);
      } catch {}
    }, 1200);
    return () => clearInterval(t);
  }, [operation?.id, operation?.status]);
  const act = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const patch = async (values) => {
    const p = await api("/settings", "PATCH", values);
    setPrefs(p);
  };
  const importFiles = async (list) =>
    act("import", async () => {
      const valid = [],
        issues = [];
      if (list.length > 50) throw Error("每批最多 50 篇文章。");
      if ([...list].reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024)
        throw Error("每批總計不可超過 10 MB。");
      for (const f of list) {
        if (!/\.(md|txt)$/i.test(f.name) || f.size > 1048576) {
          issues.push(f.name + "：格式不支援或超過 1 MB");
          continue;
        }
        valid.push({
          title: f.name.replace(/\.(md|txt)$/i, ""),
          body: await f.text(),
          source: "file",
        });
      }
      if (valid.length) {
        const r = await api("/voice/import", "POST", { samples: valid });
        issues.push(...r.skipped);
        await refresh();
      }
      if (issues.length) setError(issues.join("\n"));
      else notify("例文已匯入，請確認後再分析。");
    });
  const activeVersion = voice?.versions.find(
    (v) => v.id === voice.config.active,
  );
  return (
    <Dialog title="你的寫作設定" onClose={onClose} wide>
      <div className="settings-tabs">
        <button
          className={page === "voice" ? "active" : ""}
          onClick={() => setPage("voice")}
        >
          <TextAa size={17} />
          語氣風格
        </button>
        <button
          className={page === "connections" ? "active" : ""}
          onClick={() => setPage("connections")}
        >
          <Plugs size={17} />
          綁定設定
        </button>
        <button
          className={page === "general" ? "active" : ""}
          onClick={() => setPage("general")}
        >
          <SlidersHorizontal size={17} />
          一般設定
        </button>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          <WarningCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      {page === "voice" && (
        <div className="settings-section">
          <div className="section-heading">
            <div>
              <h3>讓文字，更像你。</h3>
              <p>從你的例文整理表達習慣，由你決定是否使用。</p>
            </div>
            <TextAa size={27} weight="light" />
          </div>
          {!voice?.samples.length && !activeVersion && (
            <div className="empty-panel">
              <Feather size={32} weight="light" />
              <h4>目前還沒有語氣風格</h4>
              <p>
                匯入幾篇你寫過的文章，讓懷特先生
                <br />
                整理你的用詞與表達習慣。
              </p>
              <small>尚未建立風格，也可以直接開始寫作。</small>
            </div>
          )}
          {activeVersion && (
            <div className="settings-card">
              <div className="row">
                <strong>目前的語氣風格</strong>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={voice.config.enabled}
                    onChange={(e) =>
                      act("toggle", async () => {
                        await api("/voice/config", "PATCH", {
                          enabled: e.target.checked,
                        });
                        await refresh();
                      })
                    }
                  />
                  <span>套用於 AI 寫作</span>
                </label>
              </div>
              {activeVersion.invalid && (
                <p className="warning">部分例文已移除，請重新建立風格。</p>
              )}
              <div className="voice-rules">
                <Markdown>{activeVersion.rules}</Markdown>
              </div>
            </div>
          )}
          <div
            className="import-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              importFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={files}
              type="file"
              multiple
              accept=".md,.txt"
              hidden
              onChange={(e) => {
                importFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => files.current.click()}
            >
              <UploadSimple size={17} />
              批次匯入文章
            </button>
            <button
              onClick={() =>
                setPastes((p) => [
                  ...p,
                  { id: crypto.randomUUID(), title: "", body: "" },
                ])
              }
            >
              <Plus size={16} />
              貼上文章
            </button>
            <small>拖放 .md 或 .txt · 每批 50 篇 · 單檔 1 MB</small>
          </div>
          {pastes.map((p, i) => (
            <div className="paste-card" key={p.id}>
              <div className="row">
                <input
                  aria-label={`例文 ${i + 1} 標題`}
                  placeholder="文章標題（選填）"
                  value={p.title}
                  onChange={(e) =>
                    setPastes((all) =>
                      all.map((x) =>
                        x.id === p.id ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  className="icon-btn"
                  aria-label="移除此篇貼文"
                  onClick={() =>
                    setPastes((all) => all.filter((x) => x.id !== p.id))
                  }
                >
                  <X size={16} />
                </button>
              </div>
              <textarea
                aria-label={`例文 ${i + 1} 內文`}
                placeholder="貼上完整文章；一個文字框代表一篇文章。"
                rows={5}
                value={p.body}
                onChange={(e) =>
                  setPastes((all) =>
                    all.map((x) =>
                      x.id === p.id ? { ...x, body: e.target.value } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          {pastes.length > 0 && (
            <button
              disabled={!!busy}
              onClick={() =>
                act("paste", async () => {
                  const r = await api("/voice/import", "POST", {
                    samples: pastes,
                  });
                  setPastes([]);
                  await refresh();
                  if (r.skipped.length) setError(r.skipped.join("\n"));
                })
              }
            >
              匯入這 {pastes.length} 篇文章
            </button>
          )}
          {!!voice?.samples.length && (
            <>
              <div className="section-subheading">
                語氣例文 <span>{voice.samples.length} 篇</span>
              </div>
              {voice.samples.map((s) => (
                <details className="sample" key={s.id}>
                  <summary>
                    <span>{s.title}</span>
                    <small>{s.body.length.toLocaleString()} 字元</small>
                  </summary>
                  <pre>{s.body}</pre>
                  <button
                    className="danger"
                    onClick={() =>
                      act("delete", async () => {
                        await api("/voice/samples/" + s.id, "DELETE", {});
                        await refresh();
                      })
                    }
                  >
                    <Trash size={14} />
                    排除此例文
                  </button>
                </details>
              ))}
              {voice.samples.length < 3 && (
                <p className="muted">
                  範例較少，結果僅供初步參考。建議至少匯入 3 篇。
                </p>
              )}
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                這些文章可用來建立我的語氣風格
              </label>
              <p className="hint">
                每次最多分析 30,000 字元，每篇取前 6,000
                字元；會標示實際採用的篇數。
              </p>
              <button
                className="primary"
                disabled={
                  !approved || !!busy || operation?.status === "running"
                }
                onClick={() =>
                  act("analyze", async () =>
                    setOperation(
                      await api("/voice/analyze", "POST", { confirmed: true }),
                    ),
                  )
                }
              >
                <TextAa size={16} />
                {activeVersion ? "重新整理風格" : "分析我的語氣"}
              </button>
            </>
          )}
          {operation?.status === "running" && (
            <div className="operation-note">
              <SpinnerGap className="spin" size={17} />
              <span>
                正在分析 {operation.sampled} / {operation.total} 篇例文…
              </span>
              <button
                onClick={() =>
                  act("cancel", async () =>
                    setOperation(
                      await api(
                        "/operations/" + operation.id + "/cancel",
                        "POST",
                        {},
                      ),
                    ),
                  )
                }
              >
                停止
              </button>
            </div>
          )}
          {rules && (
            <div className="settings-card">
              <h4>確認並調整風格規則</h4>
              <p className="muted">分析結果不會自動覆蓋現行風格。</p>
              <textarea
                className="rules-editor"
                aria-label="風格規則"
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows={10}
              />
              <button
                className="primary"
                disabled={!!busy}
                onClick={() =>
                  act("save-voice", async () => {
                    await api("/voice/versions", "POST", {
                      rules,
                      operationId: operation?.id,
                    });
                    setRules("");
                    setOperation(null);
                    await refresh();
                    notify("語氣風格已儲存並啟用。");
                  })
                }
              >
                <Check size={16} />
                儲存並啟用
              </button>
            </div>
          )}
          {!rules && (
            <button
              className="text-button"
              onClick={() => {
                setRules(
                  activeVersion?.rules ||
                    "整體描述：\n\n段落與節奏：\n\n用詞與標點：\n\n應避免事項：",
                );
                setOperation(null);
              }}
            >
              手動{activeVersion ? "調整" : "建立"}規則
            </button>
          )}
          {!!voice?.versions.length && (
            <>
              <div className="section-subheading">風格版本</div>
              {voice.versions.map((v, i) => (
                <details className="sample" key={v.id}>
                  <summary>
                    <span>
                      版本 {voice.versions.length - i}
                      {v.id === voice.config.active ? " · 目前使用" : ""}
                      {v.invalid ? " · 需重建" : ""}
                    </span>
                    <small>
                      {new Date(v.createdAt).toLocaleDateString("zh-TW")}
                    </small>
                  </summary>
                  <div className="voice-rules">
                    <Markdown>{v.rules}</Markdown>
                  </div>
                  <button
                    disabled={v.invalid || !!busy}
                    onClick={() =>
                      act("switch", async () => {
                        await api("/voice/config", "PATCH", {
                          active: v.id,
                          enabled: true,
                        });
                        await refresh();
                      })
                    }
                  >
                    使用此版本
                  </button>
                </details>
              ))}
            </>
          )}
        </div>
      )}
      {page === "connections" && (
        <div className="settings-section">
          <div className="section-heading">
            <div>
              <h3>連接你的寫作工具</h3>
              <p>讓 AI 幫忙寫作，讓備份多一份安心。</p>
            </div>
            <Plugs size={27} weight="light" />
          </div>
          <div className="settings-card">
            <div className="row">
              <span className="card-title">
                <Desktop size={20} />
                本機 AI · Codex CLI
              </span>
              <span
                className={"status-badge " + (status?.ready ? "ready" : "")}
              >
                {status ? (status.ready ? "已登入" : "未登入") : "檢查中"}
              </span>
            </div>
            <p>{status?.message || "正在檢查本機 Codex…"}</p>
            {status?.version && (
              <small>
                {status.version}
                {status.checkedAt &&
                  " · " +
                    new Date(status.checkedAt).toLocaleTimeString("zh-TW")}
              </small>
            )}
            <div className="card-actions">
              <button
                disabled={busy === "codex"}
                onClick={() =>
                  act("codex", async () =>
                    setStatus(await api("/integrations/codex/status")),
                  )
                }
              >
                <ArrowClockwise size={15} />
                重新檢查
              </button>
            </div>
            <p className="hint">
              使用現有 CLI 登入。若未登入，請於終端機執行{" "}
              <code>codex login</code>。不會自動改用 API Key。
            </p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!prefs.aiConsent}
                onChange={(e) =>
                  act("consent", () => patch({ aiConsent: e.target.checked }))
                }
              />
              允許送出指令、必要文章與啟用的語氣參考至模型服務
            </label>
            <small>
              本機儲存不代表離線 AI；使用量依你的服務與登入方式計算。
            </small>
          </div>
          <div className="settings-card">
            <div className="row">
              <span className="card-title">
                <CloudArrowUp size={21} />
                Google Drive 備份
              </span>
              <span className="status-badge">
                {prefs.backupVerified === prefs.backupRemote &&
                prefs.backupRemote
                  ? "已驗證目的地"
                  : "尚未設定"}
              </span>
            </div>
            <p>將完整快照備份到你指定的專用資料夾。</p>
            {backupStatus && !backupStatus.available && (
              <div className="inline-note">
                尚未安裝 rclone。完成安裝與 <code>rclone config</code>{" "}
                授權後，即可測試目的地。
              </div>
            )}
            {!!backupStatus?.remotes.length && (
              <p className="hint">
                已設定 remote：{backupStatus.remotes.join("、")}
              </p>
            )}
            <label className="field-label">
              備份目的地
              <input
                aria-label="備份目的地"
                placeholder="gdrive:mr-white"
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
              />
            </label>
            <div className="card-actions">
              <button
                disabled={!!busy}
                onClick={() =>
                  act("remote", async () => {
                    await patch({ backupRemote: remote });
                    notify("目的地已保存，尚待備份驗證。");
                  })
                }
              >
                儲存目的地
              </button>
              <button
                className="primary"
                disabled={!!busy || !remote}
                onClick={() =>
                  act("drive", async () => {
                    await patch({ backupRemote: remote });
                    await api("/backups", "POST", { drive: true });
                    await refresh();
                    notify("Drive 備份已上傳並通過校驗。");
                  })
                }
              >
                <CloudArrowUp size={16} />
                {busy === "drive" ? "上傳及驗證中…" : "立即備份並驗證"}
              </button>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!prefs.backupEnabled}
                disabled={
                  !!busy ||
                  !prefs.backupVerified ||
                  prefs.backupVerified !== prefs.backupRemote
                }
                onChange={(e) =>
                  act("schedule", () =>
                    patch({ backupEnabled: e.target.checked }),
                  )
                }
              />
              每 24 小時自動備份
            </label>
            <p className="hint">
              主機與本機服務必須持續運作。預設不自動刪除舊備份；使用專用資料夾，既有檔案不受影響。只有
              crypt remote 才有客戶端加密。
            </p>
            <dl>
              <div>
                <dt>最近成功</dt>
                <dd>
                  {prefs.lastBackup
                    ? new Date(prefs.lastBackup).toLocaleString("zh-TW")
                    : "尚無成功紀錄"}
                </dd>
              </div>
              <div>
                <dt>下次備份</dt>
                <dd>
                  {prefs.backupEnabled && prefs.nextBackup
                    ? new Date(prefs.nextBackup).toLocaleString("zh-TW")
                    : "未啟用"}
                </dd>
              </div>
              {prefs.lastBackupError && (
                <div>
                  <dt>最近錯誤</dt>
                  <dd>{prefs.lastBackupError}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="settings-card">
            <div className="row">
              <h4>從 Drive 取回備份</h4>
              <button
                disabled={!!busy || !prefs.backupRemote}
                onClick={() =>
                  act("list-drive", async () =>
                    setRemoteBackups(await api("/backups/remote")),
                  )
                }
              >
                讀取備份清單
              </button>
            </div>
            <p className="hint">
              下載至隔離目錄並校驗，確認後才還原。這不會更動 Drive 上的檔案。
            </p>
            {remoteBackups?.length === 0 && (
              <p className="muted">目的地中沒有可辨識的備份。</p>
            )}
            {remoteBackups?.map((id) => (
              <div className="backup-row" key={id}>
                <small>{id}</small>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    act("download", async () => {
                      setRestore(
                        await api("/backups/" + id + "/download", "POST", {}),
                      );
                      await refresh();
                    })
                  }
                >
                  下載並檢查
                </button>
              </div>
            ))}
          </div>
          <div className="settings-card">
            <h4>社群發布尚未設定</h4>
            <p>現在可以複製文章或匯出 Markdown，自行發布到喜歡的平台。</p>
          </div>
        </div>
      )}
      {page === "general" && (
        <div className="settings-section">
          <div className="section-heading">
            <div>
              <h3>把空間調整得剛剛好</h3>
              <p>簡單的偏好，以及始終屬於你的資料。</p>
            </div>
            <SlidersHorizontal size={27} weight="light" />
          </div>
          <div className="settings-card appearance-card">
            <h4>外觀模式</h4>
            <p>選擇舒服的閱讀光線，這個瀏覽器會記住你的選擇。</p>
            <div className="theme-options" role="group" aria-label="外觀模式">
              <button
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                <Sun size={18} />
                亮模式
              </button>
              <button
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                <Moon size={18} />
                暗模式
              </button>
            </div>
          </div>
          <div className="settings-card">
            <label className="setting-toggle">
              <span>
                AI 動態效果<small>生成時顯示柔和的呼吸提示</small>
              </span>
              <input
                type="checkbox"
                checked={prefs.animation}
                onChange={(e) =>
                  act("animation", () => patch({ animation: e.target.checked }))
                }
              />
            </label>
            <label className="setting-toggle">
              <span>
                顯示字元數<small>在文件下方顯示目前字元數</small>
              </span>
              <input
                type="checkbox"
                checked={prefs.wordCount}
                onChange={(e) =>
                  act("words", () => patch({ wordCount: e.target.checked }))
                }
              />
            </label>
          </div>
          <div className="settings-card">
            <h4>資料位置</h4>
            <code className="data-path">
              {prefs.dataLocation || "專案內的 data/ 資料夾"}
            </code>
            <p className="hint">
              SQLite 保存文章、版本與語氣。IndexedDB
              保護尚未同步的編輯。內容備份不包含 Codex 登入、金鑰或 rclone
              憑證。
            </p>
          </div>
          <div className="settings-card">
            <div className="row">
              <h4>本機備份與還原</h4>
              <button
                disabled={!!busy}
                onClick={() =>
                  act("backup", async () => {
                    await beforeRestore();
                    await api("/backups", "POST", {});
                    await refresh();
                    notify("本機一致快照已建立。");
                  })
                }
              >
                <Plus size={15} />
                建立快照
              </button>
            </div>
            <p className="hint">
              還原前會先驗證檔案，並自動備份目前資料。既有離線備份可能仍保留已刪除文章。
            </p>
            {!backups.length && <p className="muted">尚未建立備份。</p>}
            {backups.map((b) => (
              <div className="backup-row" key={b.id}>
                <div>
                  <strong>
                    {new Date(b.createdAt).toLocaleString("zh-TW")}
                  </strong>
                  <small>
                    {b.articleCount} 篇文章 ·{" "}
                    {b.status === "complete"
                      ? "Drive 已校驗"
                      : b.status === "failed"
                        ? "Drive 失敗，本機可用"
                        : "本機快照"}
                  </small>
                </div>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    act("verify", async () =>
                      setRestore(
                        await api("/backups/" + b.id + "/verify", "POST", {}),
                      ),
                    )
                  }
                >
                  檢查與還原
                </button>
              </div>
            ))}
          </div>
          <div className="settings-card">
            <h4>
              垃圾桶 <span className="muted">{trash.length}</span>
            </h4>
            <p className="hint">
              文章會保留在這裡，直到你恢復；此版本不自動永久清除。
            </p>
            {!trash.length && <p className="muted">垃圾桶是空的。</p>}
            {trash.map((a) => (
              <div className="backup-row" key={a.id}>
                <span>{a.title || "未命名文章"}</span>
                <button
                  onClick={() =>
                    act("recover", async () => {
                      await api("/articles/" + a.id + "/restore", "POST", {});
                      notify("文章已恢復，重新載入後出現在清單。");
                      await refresh();
                    })
                  }
                >
                  恢復文章
                </button>
              </div>
            ))}
          </div>
          <div className="settings-footer">
            懷特先生 v0.1.0 <span>個人 Markdown 工作台</span>
          </div>
        </div>
      )}
      {busy && (
        <div className="settings-busy" role="status">
          <SpinnerGap size={15} className="spin" />
          正在處理…
        </div>
      )}
      {restore && (
        <div className="restore-confirm">
          <h4>備份校驗通過</h4>
          <p>
            {new Date(restore.createdAt).toLocaleString("zh-TW")} ·{" "}
            {restore.articleCount} 篇文章
          </p>
          <p>
            將以完整快照取代目前資料，可能包含已刪除的文章。現有內容會先另存快照，AI
            不會自動重送。
          </p>
          <div className="card-actions">
            <button onClick={() => setRestore(null)}>取消</button>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() =>
                act("restore", async () => {
                  await beforeRestore();
                  await api("/backups/" + restore.id + "/restore", "POST", {
                    confirm: restore.id,
                  });
                  await cache.clear();
                  window.location.reload();
                })
              }
            >
              確認還原
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
