import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import ReactMarkdown from "react-markdown";
export const Markdown = ({ children, remarkPlugins = [], components = {} }) => (
  <ReactMarkdown
    skipHtml
    remarkPlugins={remarkPlugins}
    components={{
      ...components,
      img: ({ alt, src }) => (
        <a href={src} target="_blank" rel="noreferrer">
          {alt || "外部圖片"}
        </a>
      ),
      a: ({ children, ...p }) => (
        <a {...p} target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
    }}
  >
    {children}
  </ReactMarkdown>
);
export const Editor = forwardRef(function Editor(
  { article, onChange, onSelect, readOnly, onAI, preview },
  ref,
) {
  const field = useRef(),
    past = useRef([]),
    future = useRef([]),
    last = useRef(article.body),
    typing = useRef(0);
  useEffect(() => {
    past.current = [];
    future.current = [];
    last.current = article.body;
  }, [article.id]);
  useEffect(() => {
    if (last.current !== article.body) {
      past.current.push(last.current);
      last.current = article.body;
      future.current = [];
    }
    if (field.current) {
      field.current.style.height = "0px";
      field.current.style.height =
        Math.max(300, field.current.scrollHeight) + "px";
    }
  }, [article.body]);
  const change = (value, separate = false) => {
    if (value === last.current) return;
    if (separate || Date.now() - typing.current > 700)
      past.current.push(last.current);
    typing.current = Date.now();
    future.current = [];
    last.current = value;
    onChange(value);
  };
  const undo = () => {
    if (!past.current.length || readOnly) return;
    future.current.push(last.current);
    const value = past.current.pop();
    last.current = value;
    onChange(value);
  };
  const redo = () => {
    if (!future.current.length || readOnly) return;
    past.current.push(last.current);
    const value = future.current.pop();
    last.current = value;
    onChange(value);
  };
  useImperativeHandle(ref, () => ({
    focus: () => field.current?.focus(),
    undo,
    redo,
    format: (kind) => {
      const el = field.current;
      if (!el || readOnly) return;
      const { selectionStart: from, selectionEnd: to } = el;
      const text = article.body.slice(from, to);
      const wrapped =
        kind === "bold"
          ? `**${text}**`
          : kind === "italic"
            ? `*${text}*`
            : `[${text}](https://)`;
      change(
        article.body.slice(0, from) + wrapped + article.body.slice(to),
        true,
      );
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(from, from + wrapped.length);
      });
    },
  }));
  return preview ? (
    <div className="markdown">
      <Markdown>{article.body || "尚未撰寫內容。"}</Markdown>
    </div>
  ) : (
    <textarea
      ref={field}
      className="body-editor"
      aria-label="文章內文"
      placeholder="讓想法從這裡開始…"
      value={article.body}
      readOnly={readOnly}
      spellCheck={false}
      onChange={(e) => change(e.target.value)}
      onSelect={(e) =>
        onSelect({ from: e.target.selectionStart, to: e.target.selectionEnd })
      }
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
          e.preventDefault();
          onAI();
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
      }}
    />
  );
});
