import React, {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
const ForceGraph = lazy(() => import("react-force-graph-2d"));

import { knowledgeNetwork } from "./knowledge-network.mjs";
import "./knowledge-network.css";
class GraphBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="kn-network" role="alert">
          <h3>關係圖暫時無法顯示</h3>
          <p>資料仍保留。可重新載入圖譜，或切回專案資料查看。</p>
          <button onClick={() => this.setState({ failed: false })}>
            重新載入圖譜
          </button>
        </section>
      );
    return this.props.children;
  }
}
export function KnowledgeNetwork(props) {
  return (
    <GraphBoundary>
      <KnowledgeNetworkView {...props} />
    </GraphBoundary>
  );
}
function KnowledgeNetworkView({ resources }) {
  const graph = useMemo(() => knowledgeNetwork(resources), [resources]);
  const [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [hovered, setHovered] = useState(null),
    [width, setWidth] = useState(600),
    [reduced, setReduced] = useState(false);
  const view = useRef(null),
    host = useRef(null),
    fitted = useRef(false);
  const attachGraph = useCallback((instance) => {
    view.current = instance;
    if (instance) {
      instance.d3Force("charge")?.strength(-240);
      instance.d3Force("link")?.distance((link) => 80 + (1 - link.score) * 140);
    }
  }, []);
  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.edges.map((e) => ({ ...e, source: e.from, target: e.to })),
    }),
    [graph],
  );
  const active = graph.nodes.find((n) => n.id === selected);
  const related = graph.edges
    .filter((e) => e.from === selected || e.to === selected)
    .sort((a, b) => b.score - a.score);
  const emphasized = new Set([selected, hovered].filter(Boolean));
  graph.edges.forEach((e) => {
    if (
      e.from === selected ||
      e.to === selected ||
      e.from === hovered ||
      e.to === hovered
    ) {
      emphasized.add(e.from);
      emphasized.add(e.to);
    }
  });
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    fitted.current = false;
  }, [data]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, Math.floor(entries[0].contentRect.width))),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [graph.nodes.length]);
  useEffect(() => {
    if (!host.current) return;
    let visible = true;
    const update = () => {
      if (document.hidden || !visible) view.current?.pauseAnimation();
      else view.current?.resumeAnimation();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      update();
    });
    observer.observe(host.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [graph.nodes.length]);
  function focus(id) {
    setSelected(id);
    const n = data.nodes.find((n) => n.id === id);
    if (Number.isFinite(n?.x)) {
      view.current?.centerAt(n.x, n.y, reduced ? 0 : 250);
      view.current?.zoom(1.5, reduced ? 0 : 250);
    }
  }
  function paint(n, ctx, scale) {
    if (
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y) ||
      !Number.isFinite(scale) ||
      scale <= 0
    )
      return;
    const match =
      !query ||
      `${n.name} ${n.content}`.toLowerCase().includes(query.toLowerCase());
    const lit = emphasized.has(n.id),
      dim = !match || ((selected || hovered) && !lit);
    const color =
      n.kind === "webpage"
        ? "#65dfce"
        : n.kind === "file"
          ? "#b8a2ff"
          : "#79b9ff";
    const radius = n.id === selected ? 9 : 6;
    ctx.save();
    ctx.globalAlpha = dim ? 0.18 : 1;
    const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 4);
    glow.addColorStop(0, color + "70");
    glow.addColorStop(1, color + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (lit) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2 / scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (scale > 0.65 || lit || graph.nodes.length < 12) {
      const label = n.name;
      ctx.font = `${12 / scale}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#e2edf7";
      ctx.fillText(
        label.length > 24 ? label.slice(0, 24) + "…" : label,
        n.x,
        n.y + radius + 8 / scale,
      );
    }
    ctx.restore();
  }
  return (
    <section className="kn-network">
      <header>
        <div>
          <h3>知識網絡</h3>
          <p>
            {graph.nodes.length} 份資料 · {graph.edges.length} 條內容相似連線
          </p>
        </div>
        <input
          aria-label="搜尋知識節點"
          placeholder="搜尋資料標題或內容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      <p className="kn-caption">
        每個節點是一份已保存資料。連線使用本機 TF-IDF
        文字向量相似度，並非語意模型；共同詞彙可在點選後查看。未解析或沒有相似內容的資料仍保留節點。
      </p>
      {!graph.nodes.length ? (
        <p>目前沒有知識資料，加入文件或網頁後即可顯示節點。</p>
      ) : (
        <div className="kn-layout">
          <div className="kn-stage kn-force-stage" ref={host}>
            <div className="kn-controls">
              <button
                aria-label="放大關係圖"
                onClick={() =>
                  view.current?.zoom(
                    view.current.zoom() * 1.3,
                    reduced ? 0 : 200,
                  )
                }
              >
                ＋
              </button>
              <button
                aria-label="縮小關係圖"
                onClick={() =>
                  view.current?.zoom(
                    view.current.zoom() / 1.3,
                    reduced ? 0 : 200,
                  )
                }
              >
                −
              </button>
              <button
                onClick={() => view.current?.zoomToFit(reduced ? 0 : 250, 70)}
              >
                顯示全部
              </button>
              <button
                onClick={() => {
                  setSelected(null);
                  data.nodes.forEach((n) => {
                    delete n.fx;
                    delete n.fy;
                  });
                  fitted.current = false;
                  view.current?.d3ReheatSimulation();
                }}
              >
                重新排列
              </button>
            </div>
            <Suspense
              fallback={<div className="kn-loading">正在載入力導向網絡…</div>}
            >
              <ForceGraph
                ref={attachGraph}
                width={width}
                height={560}
                graphData={data}
                backgroundColor="#101923"
                warmupTicks={reduced ? 120 : 30}
                cooldownTicks={reduced ? 0 : 100}
                d3VelocityDecay={0.3}
                nodeCanvasObject={paint}
                nodePointerAreaPaint={(n, color, ctx) => {
                  if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
                  ctx.fill();
                }}
                nodeLabel={() => ""}
                onNodeHover={(n) => setHovered(n?.id || null)}
                onNodeClick={(n) => focus(n.id)}
                onBackgroundClick={() => setSelected(null)}
                onNodeDragEnd={(n) => {
                  n.fx = n.x;
                  n.fy = n.y;
                }}
                linkColor={(e) =>
                  emphasized.has(e.from) && emphasized.has(e.to)
                    ? "#8ee6e2"
                    : "#4e768a80"
                }
                linkWidth={(e) => 0.6 + e.score * 2}
                onEngineStop={() => {
                  if (!fitted.current) {
                    fitted.current = true;
                    view.current?.zoomToFit(reduced ? 0 : 250, 85);
                  }
                }}
              />
            </Suspense>
            <div className="kn-force-legend">
              <span>● 網頁</span>
              <span>● 文件</span>
              <span>● 筆記</span>
              <small>拖曳節點 · 滾輪縮放 · 點選聚焦</small>
            </div>
          </div>
          <aside className="kn-detail">
            {active ? (
              <>
                <button className="kn-back" onClick={() => setSelected(null)}>
                  ← 所有節點
                </button>
                <h4>{active.name}</h4>
                {active.url && (
                  <a href={active.url} target="_blank" rel="noreferrer">
                    開啟來源網頁 ↗
                  </a>
                )}
                {active.fetchedAt && (
                  <p>
                    擷取日期：{new Date(active.fetchedAt).toLocaleDateString()}
                  </p>
                )}
                <h5>相關資料 · {related.length}</h5>
                {related.map((e) => {
                  const n = graph.nodes.find(
                    (n) => n.id === (e.from === selected ? e.to : e.from),
                  );
                  return (
                    <button
                      className="kn-related"
                      key={e.id}
                      onClick={() => focus(n.id)}
                    >
                      <strong>{n.name}</strong>
                      <span>{Math.round(e.score * 100)}% 文字相似度</span>
                      <small>共同詞彙：{e.terms.join("、")}</small>
                    </button>
                  );
                })}
                {!related.length && <p>尚無達到門檻的相似內容。</p>}
                <h5>保存的原文</h5>
                <div className="kn-content">
                  {active.content ||
                    "此資料尚未解析出文字，仍可在專案資料中查看原件。"}
                </div>
              </>
            ) : (
              <>
                <h4>選取一個資料節點</h4>
                <p>查看原文、來源網址，以及它與其他資料的共同詞彙。</p>
                <div className="kn-node-list">
                  {graph.nodes
                    .filter(
                      (n) =>
                        !query ||
                        `${n.name} ${n.content}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .map((n) => (
                      <button key={n.id} onClick={() => focus(n.id)}>
                        {n.name}
                      </button>
                    ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
