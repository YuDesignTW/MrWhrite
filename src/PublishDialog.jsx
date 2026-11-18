import React, { useEffect, useState, useRef } from "react";
import { Dialog } from "./Settings";
import { api, toMarkdown } from "./api";
import { toPlainText } from "./plain-text";
export function PublishDialog({
  article,
  onClose,
  onDone,
  defaultScheduled = false,
}) {
  const [status, setStatus] = useState(null),
    [at, setAt] = useState(""),
    [scheduled, setScheduled] = useState(defaultScheduled),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const id = useRef(crypto.randomUUID());
  const text = toPlainText(toMarkdown(article)).trim();
  const count = Array.from(text).length;
  useEffect(() => {
    api("/social/status")
      .then((s) => setStatus(s.publishing))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Dialog
      title="發布到 Threads"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="intel-publish-preview">
        <p>
          發布帳號：
          <strong>
            {status?.account?.connected
              ? "@" + status.account.username
              : "尚未綁定有效帳號"}
          </strong>
        </p>
        <p className="muted">
          以下是實際發布的純文字。確認後保存快照，後續修改文章不會改變這筆工作。
        </p>
        <pre>{text}</pre>
        <p className={count > 500 ? "warning" : "muted"}>{count} / 500 字元</p>
        <label className="intel-checkbox">
          <input
            type="checkbox"
            checked={scheduled}
            onChange={(e) => setScheduled(e.target.checked)}
          />
          預約發布
        </label>
        {scheduled && (
          <label>
            發布時間（{Intl.DateTimeFormat().resolvedOptions().timeZone}）
            <input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </label>
        )}
        <p className="muted">本機必須保持運行；錯過的發布不會自動補發。</p>
        <label className="intel-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          我確認帳號與內容，允許在指定時間公開發布。
        </label>
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            !confirmed ||
            !status?.account?.connected ||
            !count ||
            count > 500 ||
            (scheduled && !at)
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await api("/social/publications", "POST", {
                id: id.current,
                articleId: article.id,
                revision: article.revision,
                accountId: status.account.id,
                text,
                confirm: true,
                ...(scheduled
                  ? { scheduledAt: new Date(at).toISOString() }
                  : {}),
              });
              onDone(result);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在確認發布結果…" : scheduled ? "確認排程" : "確認立即發布"}
        </button>
      </div>
    </Dialog>
  );
}
