import React, { useEffect, useId, useRef, useState } from "react";
import { BotAvatar } from "./BotAvatar.jsx";
import { layoutWorkflow } from "./workflow-layout.mjs";
import "./workflow-canvas.css";
export function WorkflowCanvas({ workflow, members, selected, onSelect }) {
  const layout = layoutWorkflow(workflow.steps),
    [view, setView] = useState({ x: 0, y: 0, scale: 1 }),
    [offsets, setOffsets] = useState({}),
    [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(false),
    [onscreen, setOnscreen] = useState(true),
    ref = useRef(),
    gesture = useRef(null),
    marker = useId().replace(/:/g, "");
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)"),
      update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    const observer = new IntersectionObserver(([entry]) =>
      setOnscreen(entry.isIntersecting),
    );
    observer.observe(ref.current);
    return () => {
      m.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  const nodes = layout.nodes.map((n) => ({
    ...n,
    x: n.x + (offsets[n.id]?.x || 0),
    y: n.y + (offsets[n.id]?.y || 0),
  }));
  function fit() {
    const width = ref.current.clientWidth,
      height = ref.current.clientHeight;
    const left = Math.min(...nodes.map((n) => n.x)) - 30,
      top = Math.min(...nodes.map((n) => n.y)) - 30,
      right = Math.max(...nodes.map((n) => n.x + 220)) + 30,
      bottom = Math.max(...nodes.map((n) => n.y + 120)) + 30;
    const scale = Math.min(
      1.2,
      width / (right - left),
      height / (bottom - top),
    );
    setView({
      scale,
      x: (width - (right - left) * scale) / 2 - left * scale,
      y: (height - (bottom - top) * scale) / 2 - top * scale,
    });
  }
  function zoom(delta) {
    setView((v) => {
      const scale = Math.max(0.15, Math.min(2, v.scale + delta)),
        x = ref.current.clientWidth / 2,
        y = ref.current.clientHeight / 2;
      return {
        scale,
        x: x - ((x - v.x) * scale) / v.scale,
        y: y - ((y - v.y) * scale) / v.scale,
      };
    });
  }
  function start(e, id) {
    if (e.button !== 0 || gesture.current) return;
    if (!id && e.target.closest("button")) return;
    gesture.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      view,
      offset: offsets[id] || { x: 0, y: 0 },
      pointer: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (g.id)
      setOffsets((v) => ({
        ...v,
        [g.id]: {
          x: g.offset.x + dx / g.view.scale,
          y: g.offset.y + dy / g.view.scale,
        },
      }));
    else setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
  }
  return (
    <section className="fc-shell">
      <div className="fc-toolbar">
        <span>工作鏈 · 拖曳空白處平移，拖曳節點整理位置</span>
        <div>
          <button aria-label="縮小畫布" onClick={() => zoom(-0.15)}>
            −
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button aria-label="放大畫布" onClick={() => zoom(0.15)}>
            ＋
          </button>
          <button onClick={fit}>符合畫面</button>
          <button
            disabled={reduced}
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {reduced ? "已減少動態" : paused ? "播放流向" : "暫停動畫"}
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="fc-viewport"
        tabIndex={0}
        role="region"
        aria-label="合作流程畫布，方向鍵平移，加減鍵縮放"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const moves = {
            ArrowLeft: [40, 0],
            ArrowRight: [-40, 0],
            ArrowUp: [0, 40],
            ArrowDown: [0, -40],
          };
          if (moves[e.key]) {
            e.preventDefault();
            setView((v) => ({
              ...v,
              x: v.x + moves[e.key][0],
              y: v.y + moves[e.key][1],
            }));
          } else if (e.key === "+" || e.key === "=") zoom(0.15);
          else if (e.key === "-") zoom(-0.15);
          else if (e.key === "Home") fit();
        }}
        onPointerDown={(e) => start(e, null)}
        onPointerMove={move}
        onPointerUp={(e) => {
          if (gesture.current?.pointer === e.pointerId) gesture.current = null;
        }}
        onPointerCancel={(e) => {
          if (gesture.current?.pointer === e.pointerId) gesture.current = null;
        }}
      >
        <div
          className="fc-stage"
          style={{
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg
            className="fc-edges"
            width={Math.max(layout.width, ...nodes.map((n) => n.x + 280))}
            height={Math.max(layout.height, ...nodes.map((n) => n.y + 180))}
            aria-hidden="true"
          >
            <defs>
              <marker
                id={marker}
                markerWidth="9"
                markerHeight="9"
                refX="8"
                refY="4"
                orient="auto"
              >
                <path d="M0 0L8 4L0 8" fill="none" stroke="currentColor" />
              </marker>
            </defs>
            {layout.edges.map((edge, i) => {
              const a = nodes.find((n) => n.id === edge.from),
                b = nodes.find((n) => n.id === edge.to),
                x1 = a.x + 220,
                y1 = a.y + 60,
                x2 = b.x,
                y2 = b.y + 60,
                mid = (x1 + x2) / 2,
                path = `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`;
              return (
                <g key={edge.from + "-" + edge.to}>
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    markerEnd={`url(#${marker})`}
                  />
                  {!paused && !reduced && onscreen && (
                    <circle className="fc-dot" r="3.5">
                      <animateMotion
                        path={path}
                        dur="3.2s"
                        begin={`${-(i % 4) * 0.8}s`}
                        repeatCount="indefinite"
                        calcMode="paced"
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>
          {nodes.map((n) => (
            <button
              key={n.id}
              className={"fc-node" + (selected === n.id ? " selected" : "")}
              style={{ left: n.x, top: n.y }}
              aria-pressed={selected === n.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                start(e, n.id);
              }}
              onClick={() => onSelect(n.id)}
            >
              <span>
                <BotAvatar
                  member={members.find((m) => m.id === n.member)}
                  small
                />
                <strong>{n.name}</strong>
              </span>
              <p>{n.output}</p>
              <small>
                {n.skills.length} Skills {n.gate ? "· 需確認" : ""}
              </small>
            </button>
          ))}
        </div>
      </div>
      <p className="fc-caption">
        動態點表示流程方向，不代表任務執行狀態；移動節點只調整檢視，不更改派工順序。
      </p>
    </section>
  );
}
