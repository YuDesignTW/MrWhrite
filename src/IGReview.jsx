import React, { useEffect, useRef, useState } from "react";
import { renderIGSlide } from "./ig-renderer";
import {
  normalizeIGDesign,
  IG_STYLES,
  igBackgroundPath,
} from "../shared/ig-design.mjs";
import { loadIGBackground } from "./ig-fullbleed";
import { loadIGFonts } from "./ig-fonts";
import { saveBlob } from "./carousel";
function Artwork({ proposal, page, onOpen }) {
  const ref = useRef(null),
    [issues, setIssues] = useState([]),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    const draw = async () => {
      setLoading(true);
      setIssues([]);
      ref.current?.getContext("2d")?.clearRect(0, 0, 1080, 1350);
      try {
        const [image] = await Promise.all([
          loadIGBackground(proposal.design, page, proposal.slides.length),
          loadIGFonts(proposal.design),
        ]);
        if (alive)
          setIssues(
            renderIGSlide(
              ref.current,
              proposal.slides[page],
              page,
              proposal.slides.length,
              proposal.design,
              image,
            ),
          );
      } catch (e) {
        if (alive) setIssues([e.message]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    draw();
    return () => {
      alive = false;
    };
  }, [proposal, page]);
  return (
    <>
      {loading && <p role="status">正在準備輪播圖片…</p>}
      <canvas
        ref={ref}
        role="img"
        aria-label={`第 ${page + 1} 頁：${proposal.slides[page].title}`}
        onClick={onOpen}
      />
      {issues.map((issue) => (
        <p className="agent-error-text" key={issue}>
          {issue}
        </p>
      ))}
    </>
  );
}
export default function IGReview({
  proposal,
  onRevise,
  onApplyStyle,
  disabled = false,
}) {
  const [page, setPage] = useState(0),
    [expanded, setExpanded] = useState(false),
    [error, setError] = useState(""),
    [style, setStyle] = useState(proposal.design?.style || "typographic"),
    [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false);
  const dialog = useRef(null);
  const p = React.useMemo(
    () =>
      normalizeIGDesign({ ...proposal, design: { ...proposal.design, style } }),
    [proposal, style],
  );
  const changed = style !== (proposal.design?.style || "typographic");
  const saveStyle = async () => {
    if (!onApplyStyle || saving) return;
    setSaving(true);
    setError("");
    try {
      await onApplyStyle(style);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
  }, [expanded]);
  const download = async () => {
    setExporting(true);
    try {
      await loadIGFonts(p.design);
      const image = await loadIGBackground(p.design, page, p.slides.length);
      const canvas = document.createElement("canvas");
      const issues = renderIGSlide(
        canvas,
        p.slides[page],
        page,
        p.slides.length,
        p.design,
        image,
      );
      if (issues.length) throw Error(issues.join("；"));
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw Error("圖片輸出失敗，請重試。");
      saveBlob(`jisto-${style}-${page + 1}.png`, blob);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };
  const nav = (
    <div className="ig-page-nav">
      <button
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        aria-label="上一張輪播"
      >
        ←
      </button>
      <span>
        {page + 1} / {p.slides.length}
      </span>
      <button
        disabled={page === p.slides.length - 1}
        onClick={() => setPage(page + 1)}
        aria-label="下一張輪播"
      >
        →
      </button>
    </div>
  );
  return (
    <div className="ig-review">
      <h3>輪播圖片</h3>
      <fieldset className="ig-style-picker" disabled={saving || exporting}>
        <legend>選擇視覺風格</legend>
        {IG_STYLES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={style === item.id}
            onClick={() => {
              setStyle(item.id);
              setError("");
            }}
          >
            {item.id !== "typographic" && (
              <img src={igBackgroundPath({ style: item.id }, 0, 3)} alt="" />
            )}
            <span>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </fieldset>
      {changed && (
        <div className="ig-style-save">
          <p>目前為風格預覽，文案不變；另存後保留原版。</p>
          <button
            type="button"
            disabled={saving || disabled || !onApplyStyle}
            onClick={saveStyle}
          >
            {saving ? "正在儲存…" : "另存這個風格版本"}
          </button>
        </div>
      )}
      {style === "graphic" && (
        <p className="ig-style-note">
          紅黑米白海報輪播；標題、內文與逐頁編號會隨提案更新。
        </p>
      )}
      {["surreal", "street"].includes(style) && (
        <p className="ig-style-note">
          使用內建創作練習示意背景；尚未依這篇主題生成新素材。
        </p>
      )}
      <Artwork proposal={p} page={page} onOpen={() => setExpanded(true)} />
      {nav}
      <div className="ig-review-actions">
        <button onClick={() => setExpanded(true)}>放大檢視</button>
        <button disabled={exporting} onClick={download}>
          {exporting ? "正在輸出…" : "下載這一頁"}
        </button>
      </div>
      <h3>IG 文案</h3>
      <p className="ig-caption">{p.caption}</p>
      <div className="ig-review-actions">
        <button
          disabled={changed || saving || disabled}
          onClick={() =>
            onRevise("請重新設計整組輪播版面，強化封面、閱讀層級與逐頁節奏。")
          }
        >
          重新設計版面
        </button>
        <button
          disabled={changed || saving || disabled}
          onClick={() => onRevise("")}
        >
          提出修改
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {expanded && (
        <dialog
          ref={dialog}
          className="ig-artwork-dialog"
          onCancel={() => setExpanded(false)}
          onClose={() => setExpanded(false)}
        >
          <button autoFocus onClick={() => setExpanded(false)}>
            關閉預覽
          </button>
          <Artwork proposal={p} page={page} />
          {nav}
        </dialog>
      )}
    </div>
  );
}
