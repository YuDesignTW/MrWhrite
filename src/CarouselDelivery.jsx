import React, { useEffect, useRef, useState } from "react";
import {
  X,
  CaretLeft,
  CaretRight,
  DownloadSimple,
} from "@phosphor-icons/react";
function Preview({ run, base, index, setIndex, close }) {
  const ref = useRef(),
    d = run.deliverable,
    url = (f) => `/api${base}/runs/${run.id}/artifacts/${f.name}`;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="tw-dialog rw-delivery-dialog"
      aria-label={d.title}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = ref.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }
      }}
      onKeyDown={(e) => {
        if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")
          return;
        if (e.key === "ArrowRight")
          setIndex((i) => Math.min(i + 1, d.files.length - 1));
        if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      }}
    >
      <header>
        <div>
          <h3>{d.title}</h3>
          <small>
            {d.reviewStatus} · {d.files.length} 頁
          </small>
        </div>
        <button aria-label="關閉預覽" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="rw-preview-layout">
        <div>
          <img
            className="rw-preview-image"
            src={url(d.files[index])}
            alt={`第 ${index + 1} 頁`}
          />
          <nav>
            <button
              aria-label="上一頁"
              disabled={!index}
              onClick={() => setIndex(index - 1)}
            >
              <CaretLeft />
            </button>
            <span>
              {index + 1} / {d.files.length}
            </span>
            <button
              aria-label="下一頁"
              disabled={index === d.files.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <CaretRight />
            </button>
            <a href={url(d.files[index])} download>
              <DownloadSimple />
              下載 PNG
            </a>
          </nav>
        </div>
        <div className="rw-preview-copy">
          <h4>貼文文案</h4>
          <p>{d.caption}</p>
          <details>
            <summary>來源與查核界線</summary>
            <p>依各來源的摘要與觀察製作，尚未完成全文查核；影片觀察範圍依來源記錄，不能視為完整觀看或音訊轉錄。</p>
            {d.sources.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                {s.title}
                {s.evidence && <small> · {s.evidence}</small>}
              </a>
            ))}
          </details>
        </div>
      </div>
    </dialog>
  );
}
export function CarouselDelivery({ run, base }) {
  const [index, setIndex] = useState(0),
    [open, setOpen] = useState(false),
    d = run.deliverable;
  if (!d?.files?.length) return null;
  const url = (f) => `/api${base}/runs/${run.id}/artifacts/${f.name}`;
  return (
    <div className="rw-delivery-compact">
      <button
        className="rw-contact-sheet"
        aria-label={`預覽 ${d.title}，${d.files.length} 頁輪播`}
        onClick={() => setOpen(true)}
      >
        <span className="rw-contact-title">{d.title}</span>
        <span
          className="rw-contact-grid"
          style={{ "--columns": Math.min(5, d.files.length) }}
        >
          {d.files.map((f, i) => (
            <img
              key={f.name}
              src={url(f)}
              alt={`第 ${i + 1} 頁`}
              loading="lazy"
            />
          ))}
        </span>
      </button>
      <div className="rw-delivery-caption">
        <span>
          {d.files.length} 頁輪播 · {d.reviewStatus}
        </span>
        <button onClick={() => setOpen(true)}>查看圖文</button>
      </div>
      {open && (
        <Preview
          {...{ run, base, index, setIndex }}
          close={() => setOpen(false)}
        />
      )}
    </div>
  );
}
