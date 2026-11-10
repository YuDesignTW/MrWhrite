import React, { useEffect, useState, useRef } from "react";
import { api, download } from "./api";
import {
  renderSlide,
  exportCarousel,
  loadSlideImage,
  prepareImage,
} from "./carousel";
import launchPosts from "../content/launch-posts.json";
import "./studio.css";
const series = ["我做了一個東西", "如果換我來做", "這個點子很厲害"];
const fields = {
  audience: "給誰看",
  observation: "看到什麼問題",
  stance: "我的觀點",
  hypothesis: "這次想驗證什麼",
  spreadReason: "誰會想分享給誰",
  nextAction: "下一步",
};
const labels = {
  reach: "觸及帳號",
  views: "觀看次數",
  shares: "分享",
  saves: "收藏",
  attributed_follows: "單篇歸因追蹤",
  replies: "回覆",
  tool_completions: "工具完成次數",
  production_minutes: "製作分鐘",
};
const localTime = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function Slide({ slide, index, total }) {
  const ref = useRef();
  const [issues, setIssues] = useState([]);
  useEffect(() => {
    let live = true;
    loadSlideImage(slide)
      .then((img) => {
        if (live) setIssues(renderSlide(ref.current, slide, index, total, img));
      })
      .catch(() => {
        if (live) setIssues(["圖片無法讀取，請重新上傳。"]);
      });
    return () => {
      live = false;
    };
  }, [slide, index, total]);
  return (
    <>
      <canvas
        ref={ref}
        aria-label={`第 ${index + 1} 頁：${slide.title}`}
        role="img"
      />
      {issues.map((x) => (
        <p role="alert" className="studio-error" key={x}>
          {x}
        </p>
      ))}
    </>
  );
}
export function Studio({ onArticle }) {
  const [list, setList] = useState([]),
    [work, setWork] = useState(null),
    [tab, setTab] = useState(
      () => localStorage.getItem("studio-tab") || "plan",
    ),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [sources, setSources] = useState([]),
    [query, setQuery] = useState(""),
    [history, setHistory] = useState(null),
    [publication, setPublication] = useState({
      platform: "threads",
      url: "",
      account: "",
      publishedAt: localTime(),
    }),
    [metric, setMetric] = useState({
      publicationId: "",
      observedAt: localTime(),
      metrics: {},
      note: "",
    });
  useEffect(() => {
    localStorage.setItem("studio-tab", tab);
  }, [tab]);
  const current = useRef(null);
  current.current = work;
  const action = async (fn) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const a = await api("/studio/works");
    setList(a);
    return a;
  };
  const open = async (id) => {
    const w = await api("/studio/works/" + id);
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem("studio-draft:" + id) || "null");
    } catch {}
    setWork(draft ? { ...w, ...draft } : w);
    setDirty(!!draft);
    localStorage.setItem("studio-active", id);
    setHistory(null);
    if (draft) setMessage("已找回這個瀏覽器的未儲存修改。");
    return w;
  };
  useEffect(() => {
    action(async () => {
      const a = await refresh();
      const id = localStorage.getItem("studio-active");
      if (a.length) await open(a.find((x) => x.id === id)?.id || a[0].id);
    });
  }, []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        api("/social/posts?q=" + encodeURIComponent(query))
          .then((r) => {
            if (live) setSources(r.items);
          })
          .catch((e) => {
            if (live) setError(e.message);
          }),
      200,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);
  useEffect(() => {
    const f = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  const change = (patch) => {
    const w = { ...current.current, ...patch };
    current.current = w;
    setWork(w);
    setDirty(true);
    try {
      localStorage.setItem(
        "studio-draft:" + w.id,
        JSON.stringify({
          ...w,
          articles: undefined,
          publications: undefined,
          metrics: undefined,
          sources: undefined,
        }),
      );
    } catch {
      setError("瀏覽器暫存失敗，請立即儲存或匯出。");
    }
  };
  const persist = async () => {
    const w = current.current;
    await api("/studio/works/" + w.id, "PATCH", {
      ...w,
      baseVersion: w.version,
    });
    localStorage.removeItem("studio-draft:" + w.id);
    await open(w.id);
    await refresh();
    setMessage("作品已儲存。");
  };
  const create = () =>
    action(async () => {
      const w = await api("/studio/works", "POST", {
        title: "新的創作點子",
        nextAction: "先寫下你看到的問題。",
      });
      await refresh();
      await open(w.id);
      setTab("plan");
    });
  const openArticle = (k) =>
    action(async () => {
      if (dirty) await persist();
      await onArticle(work.variants[k]);
    });
  const postMetric = () =>
    action(async () => {
      await api("/studio/works/" + work.id + "/metrics", "POST", {
        ...metric,
        observedAt: new Date(metric.observedAt).toISOString(),
        metrics: Object.fromEntries(
          Object.entries(metric.metrics).map(([k, v]) => [
            k,
            v === "" ? null : Number(v),
          ]),
        ),
      });
      await open(work.id);
      setMetric({ ...metric, metrics: {} });
      setMessage("已保存獨立快照，未與過往累積值相加。");
    });
  return (
    <section className="studio">
      <header className="studio-heading">
        <div>
          <small>JISTO ACADEMY / CREATIVE ROOM</small>
          <h1>好點子，從這裡做到。</h1>
          <p>看到問題，留下觀點，完成下一步。</p>
        </div>
        <div className="studio-actions">
          <button disabled={busy} onClick={create}>
            ＋ 新作品
          </button>
          <button
            disabled={busy}
            onClick={() =>
              action(async () => {
                for (const p of launchPosts)
                  await api("/studio/works", "POST", p);
                await refresh();
                await open(launchPosts[0].id);
                setMessage("前三篇已加入；重複載入不覆蓋你的修改。");
              })
            }
          >
            載入前三篇文章
          </button>
        </div>
      </header>
      {error && (
        <div className="studio-error" role="alert">
          {error}
          <button onClick={() => setError("")}>關閉</button>
        </div>
      )}
      {message && (
        <p role="status" className="studio-message">
          {message}
        </p>
      )}
      <div className="studio-layout">
        <aside className="work-list" aria-label="作品清單">
          {list.length === 0 && (
            <p>從一個問題開始，或載入已為你寫好的前三篇。</p>
          )}
          {list.map((w) => (
            <button
              className={w.id === work?.id ? "selected" : ""}
              key={w.id}
              disabled={busy}
              onClick={() => action(() => open(w.id))}
            >
              <small>{w.series}</small>
              <strong>{w.title || "未命名作品"}</strong>
              <span>{w.nextAction || "補上下一步"}</span>
              <em>
                {
                  {
                    idea: "想法",
                    making: "製作中",
                    ready: "待發布",
                    archived: "已封存",
                  }[w.status]
                }
              </em>
            </button>
          ))}
        </aside>
        {work ? (
          <fieldset className="work-detail" disabled={busy}>
            <div className="studio-toolbar">
              <span>
                {dirty
                  ? "修改已暫存在本瀏覽器"
                  : "已儲存 · " +
                    new Date(work.updatedAt).toLocaleString("zh-TW")}
              </span>
              <button disabled={busy || !dirty} onClick={() => action(persist)}>
                儲存作品
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const data = await api(
                      "/studio/works/" + work.id + "/export",
                    );
                    download(
                      work.id + ".json",
                      JSON.stringify(
                        { ...data, localDraft: dirty ? work : null },
                        null,
                        2,
                      ),
                    );
                  })
                }
              >
                備份作品
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const w = current.current;
                    const copy = await api("/studio/works", "POST", {
                      ...w,
                      id: crypto.randomUUID(),
                      title: w.title + "（另存）",
                      content: Object.fromEntries(
                        Object.entries(w.articles).map(([k, a]) => [k, a.body]),
                      ),
                    });
                    await refresh();
                    await open(copy.id);
                    setMessage("已另存；原作品及本地修改仍保留。");
                  })
                }
              >
                另存作品
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () =>
                    setHistory(
                      await api("/studio/works/" + work.id + "/history"),
                    ),
                  )
                }
              >
                版本
              </button>
            </div>
            <label className="work-title">
              作品名稱
              <input
                value={work.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <nav className="studio-tabs" aria-label="作品功能">
              {[
                ["plan", "觀點企劃"],
                ["copy", "平台文案"],
                ["carousel", "輪播圖文"],
                ["results", "發布與回顧"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={tab === k ? "active" : ""}
                  onClick={() => setTab(k)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {history && (
              <div className="studio-history">
                <h3>企劃與輪播版本</h3>
                <p>文章內文版本在寫作空間查看。還原會保留目前版本。</p>
                <button onClick={() => setHistory(null)}>關閉版本</button>
                {history.map((r) => (
                  <details key={r.id}>
                    <summary>
                      版本 {r.version} ·{" "}
                      {new Date(r.savedAt).toLocaleString("zh-TW")}
                    </summary>
                    <pre>
                      {JSON.stringify(
                        { title: r.title, stance: r.stance, slides: r.slides },
                        null,
                        2,
                      )}
                    </pre>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          if (dirty) throw Error("請先儲存目前修改再還原。");
                          await api(
                            "/studio/works/" + work.id + "/restore",
                            "POST",
                            { revisionId: r.id, baseVersion: work.version },
                          );
                          await open(work.id);
                          await refresh();
                          setMessage("已還原，還原前版本仍保留。");
                        })
                      }
                    >
                      還原此版本
                    </button>
                  </details>
                ))}
              </div>
            )}
            {tab === "plan" && (
              <div className="studio-form">
                <div className="studio-two">
                  <label>
                    內容系列
                    <select
                      value={work.series}
                      onChange={(e) => change({ series: e.target.value })}
                    >
                      {series.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    進度
                    <select
                      value={work.status}
                      onChange={(e) => change({ status: e.target.value })}
                    >
                      {[
                        ["idea", "想法"],
                        ["making", "製作中"],
                        ["ready", "待發布"],
                        ["archived", "封存"],
                      ].map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {Object.entries(fields).map(([k, v]) => (
                  <label key={k}>
                    {v}
                    <textarea
                      rows={k === "nextAction" ? 2 : 3}
                      value={work[k]}
                      onChange={(e) => change({ [k]: e.target.value })}
                    />
                  </label>
                ))}
                <h3>參考情報 · 最多三篇</h3>
                <input
                  aria-label="搜尋參考情報"
                  placeholder="搜尋情報室已保存的文字"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {sources.map((p) => (
                  <label className="source-choice" key={p.id}>
                    <input
                      type="checkbox"
                      checked={work.sourceIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked && work.sourceIds.length >= 3) {
                          setError("最多選三篇。");
                          return;
                        }
                        change({
                          sourceIds: e.target.checked
                            ? [...work.sourceIds, p.id]
                            : work.sourceIds.filter((x) => x !== p.id),
                        });
                      }}
                    />
                    {p.body?.slice(0, 90) || p.url}
                  </label>
                ))}
                {!sources.length && (
                  <p className="muted">
                    還沒有參考情報。可先手寫觀點，或到情報室貼上內容。
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      if (dirty) await persist();
                      const fresh = await api("/studio/works/" + work.id);
                      await onArticle(
                        fresh.variants.master,
                        `請針對以下本人企劃，提出三個實質不同的角度：延伸、反例、跨情境應用。逐一說明受眾價值、所需證據、最小成果。不編造事實。\n${JSON.stringify({ stance: fresh.stance, audience: fresh.audience, observation: fresh.observation, sources: fresh.sources.map((s) => ({ body: s.body, url: s.url })) })}`,
                      );
                    })
                  }
                >
                  到寫作空間探索三個角度
                </button>
              </div>
            )}
            {tab === "copy" && (
              <div className="studio-copy">
                {[
                  ["master", "完整文章"],
                  ["threads", "Threads 文案"],
                  ["instagram", "IG 文案"],
                ].map(([k, v]) => (
                  <section key={k}>
                    <div className="studio-actions">
                      <h3>{v}</h3>
                      <button disabled={busy} onClick={() => openArticle(k)}>
                        編輯／AI 改稿
                      </button>
                      {k !== "master" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              if (dirty) await persist();
                              const fresh = await api(
                                "/studio/works/" + work.id,
                              );
                              await onArticle(
                                fresh.variants[k],
                                `依以下原稿與本人觀點，撰寫${k === "threads" ? "500 字元內的 Threads 原生文案，有具體觀點和自然提問" : "IG 說明文，補充背景與觀眾價值"}。不捏造經驗、數字、來源；只輸出文案。\n觀點：${fresh.stance}\n原稿：${fresh.articles.master.body}`,
                                true,
                              );
                            })
                          }
                        >
                          從主稿擬文案
                        </button>
                      )}
                      <button
                        onClick={() =>
                          action(async () => {
                            await navigator.clipboard.writeText(
                              work.articles[k].body,
                            );
                            setMessage("已複製，尚未發布。");
                          })
                        }
                      >
                        複製
                      </button>
                      <button
                        onClick={() =>
                          download(
                            work.id + "-" + k + ".md",
                            work.articles[k].body,
                          )
                        }
                      >
                        下載
                      </button>
                    </div>
                    <pre>
                      {work.articles[k].body ||
                        "還沒開始撰寫。點「編輯／AI 改稿」開始。"}
                    </pre>
                    {k === "threads" && (
                      <small>
                        {[...work.articles[k].body].length} 字元 ·
                        官方發布請到寫作空間預覽確認
                      </small>
                    )}
                  </section>
                ))}
              </div>
            )}
            {tab === "carousel" && (
              <div className="studio-carousel">
                <div className="studio-actions">
                  <p>
                    1080 × 1350 · {work.slides.length} 頁 ·
                    同一排版引擎預覽與匯出
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        if (dirty) await persist();
                        const fresh = await api("/studio/works/" + work.id);
                        await exportCarousel(fresh);
                        setMessage("輪播 PNG 與文案 ZIP 已匯出，尚未發布。");
                      })
                    }
                  >
                    匯出 PNG 與文案 ZIP
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        if (dirty) await persist();
                        const fresh = await api("/studio/works/" + work.id);
                        const outline = await api(
                          "/studio/works/" + work.id + "/outline",
                          "POST",
                          {},
                        );
                        await onArticle(
                          outline.id,
                          `將下列原稿整理為 4～8 頁輪播。只輸出 JSON，不要 Markdown 標記。格式 {"slides":[{"title":"標題","body":"正文","layout":"cover 或 content 或 checklist 或 closing"}]}。每頁一個重點，正文不超過 100 字，不新增原文沒有的成效或經歷。\n${fresh.articles.master.body}`,
                        );
                      })
                    }
                  >
                    AI 擬輪播大綱
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        if (dirty) await persist();
                        const fresh = await api("/studio/works/" + work.id);
                        await api(
                          "/studio/works/" + work.id + "/outline/apply",
                          "POST",
                          {
                            baseVersion: fresh.version,
                            dataEpoch: fresh.dataEpoch,
                          },
                        );
                        await open(work.id);
                        setMessage("已套用大綱，原輪播保留於版本紀錄。");
                      })
                    }
                  >
                    套用已確認的大綱
                  </button>
                  <button
                    disabled={work.slides.length >= 8}
                    onClick={() =>
                      change({
                        slides: [
                          ...work.slides,
                          {
                            id: crypto.randomUUID(),
                            title: "新的一頁",
                            body: "",
                            layout: "content",
                          },
                        ],
                      })
                    }
                  >
                    新增頁面
                  </button>
                </div>
                {work.slides.map((s, i) => (
                  <div className="slide-editor" key={s.id}>
                    <div className="slide-preview">
                      <Slide slide={s} index={i} total={work.slides.length} />
                    </div>
                    <div>
                      <small>第 {i + 1} 頁</small>
                      <label>
                        自己的配圖（PNG／JPEG）
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              action(async () => {
                                const image = await prepareImage(f);
                                change({
                                  slides: current.current.slides.map((x) =>
                                    x.id === s.id ? { ...x, image } : x,
                                  ),
                                });
                              });
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {s.image && (
                        <>
                          <label>
                            上下裁切位置
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={s.image.position}
                              onChange={(e) =>
                                change({
                                  slides: work.slides.map((x) =>
                                    x.id === s.id
                                      ? {
                                          ...x,
                                          image: {
                                            ...x.image,
                                            position: Number(e.target.value),
                                          },
                                        }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            圖片來源與使用權
                            <input
                              value={s.image.credit}
                              onChange={(e) =>
                                change({
                                  slides: work.slides.map((x) =>
                                    x.id === s.id
                                      ? {
                                          ...x,
                                          image: {
                                            ...x.image,
                                            credit: e.target.value,
                                          },
                                        }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            onClick={() =>
                              change({
                                slides: work.slides.map((x) =>
                                  x.id === s.id ? { ...x, image: null } : x,
                                ),
                              })
                            }
                          >
                            移除圖片
                          </button>
                        </>
                      )}

                      <label>
                        版型
                        <select
                          value={s.layout}
                          onChange={(e) =>
                            change({
                              slides: work.slides.map((x) =>
                                x.id === s.id
                                  ? { ...x, layout: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        >
                          {[
                            ["cover", "封面"],
                            ["content", "內容"],
                            ["comparison", "對照"],
                            ["checklist", "清單"],
                            ["closing", "結尾"],
                          ].map(([k, v]) => (
                            <option value={k} key={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        標題
                        <textarea
                          value={s.title}
                          onChange={(e) =>
                            change({
                              slides: work.slides.map((x) =>
                                x.id === s.id
                                  ? { ...x, title: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        正文
                        <textarea
                          rows={5}
                          value={s.body}
                          onChange={(e) =>
                            change({
                              slides: work.slides.map((x) =>
                                x.id === s.id
                                  ? { ...x, body: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <div className="studio-actions">
                        <button
                          disabled={i === 0}
                          onClick={() => {
                            const slides = [...work.slides];
                            [slides[i - 1], slides[i]] = [
                              slides[i],
                              slides[i - 1],
                            ];
                            change({ slides });
                          }}
                        >
                          上移
                        </button>
                        <button
                          disabled={i === work.slides.length - 1}
                          onClick={() => {
                            const slides = [...work.slides];
                            [slides[i + 1], slides[i]] = [
                              slides[i],
                              slides[i + 1],
                            ];
                            change({ slides });
                          }}
                        >
                          下移
                        </button>
                        <button
                          disabled={work.slides.length <= 4}
                          onClick={() =>
                            change({
                              slides: work.slides.filter((x) => x.id !== s.id),
                            })
                          }
                        >
                          刪除此頁
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "results" && (
              <div className="studio-form">
                <h3>記錄人工發布</h3>
                <p>只有你已在平台發出後才填寫；此紀錄不會代你發文。</p>
                <div className="studio-two">
                  <label>
                    平台
                    <select
                      value={publication.platform}
                      onChange={(e) =>
                        setPublication({
                          ...publication,
                          platform: e.target.value,
                        })
                      }
                    >
                      <option value="threads">Threads</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </label>
                  <label>
                    實際發布時間
                    <input
                      type="datetime-local"
                      value={publication.publishedAt}
                      onChange={(e) =>
                        setPublication({
                          ...publication,
                          publishedAt: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  帳號
                  <input
                    value={publication.account}
                    onChange={(e) =>
                      setPublication({
                        ...publication,
                        account: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  貼文網址（選填）
                  <input
                    value={publication.url}
                    onChange={(e) =>
                      setPublication({ ...publication, url: e.target.value })
                    }
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await api(
                        "/studio/works/" + work.id + "/publications",
                        "POST",
                        {
                          ...publication,
                          publishedAt: new Date(
                            publication.publishedAt,
                          ).toISOString(),
                          revision:
                            work.articles[publication.platform].revision,
                        },
                      );
                      await open(work.id);
                      setMessage("已記錄你回填的發布資訊，未呼叫平台。");
                    })
                  }
                >
                  確認我已發布，保存紀錄
                </button>
                <h3>成效快照</h3>
                <p>
                  未知留白。單篇歸因追蹤只填平台明確提供的值，不填帳號淨增。
                </p>
                <label>
                  發布紀錄
                  <select
                    value={metric.publicationId}
                    onChange={(e) =>
                      setMetric({ ...metric, publicationId: e.target.value })
                    }
                  >
                    <option value="">請選擇</option>
                    {work.publications.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.platform} ·{" "}
                        {new Date(p.publishedAt).toLocaleString("zh-TW")} ·
                        人工回填
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  實際觀察時間
                  <input
                    type="datetime-local"
                    value={metric.observedAt}
                    onChange={(e) =>
                      setMetric({ ...metric, observedAt: e.target.value })
                    }
                  />
                </label>
                <div className="studio-two">
                  {Object.entries(labels).map(([k, v]) => (
                    <label key={k}>
                      {v}
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="未知"
                        value={metric.metrics[k] ?? ""}
                        onChange={(e) =>
                          setMetric({
                            ...metric,
                            metrics: { ...metric.metrics, [k]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  證據與觀察
                  <textarea
                    value={metric.note}
                    onChange={(e) =>
                      setMetric({ ...metric, note: e.target.value })
                    }
                  />
                </label>
                <button
                  disabled={busy || !metric.publicationId}
                  onClick={postMetric}
                >
                  保存此時刻的快照
                </button>
                {work.metrics.map((m) => (
                  <div className="metric-card" key={m.id}>
                    <strong>
                      {m.platform} · 發布後 {m.windowHours.toFixed(1)} 小時
                    </strong>
                    <p>
                      {new Date(m.observedAt).toLocaleString("zh-TW")} ·
                      人工回填
                    </p>
                    <div>
                      每千觸及分享：
                      {m.metrics.reach > 0 && m.metrics.shares !== null
                        ? ((m.metrics.shares / m.metrics.reach) * 1000).toFixed(
                            2,
                          )
                        : "無法計算"}{" "}
                      ／ 每千觸及追蹤：
                      {m.metrics.reach > 0 &&
                      m.metrics.attributed_follows !== null
                        ? (
                            (m.metrics.attributed_follows / m.metrics.reach) *
                            1000
                          ).toFixed(2)
                        : "無法計算"}
                    </div>
                    <details>
                      <summary>原始數據與備註</summary>
                      <pre>
                        {JSON.stringify(m.metrics, null, 2)}
                        {"\n" + m.note}
                      </pre>
                    </details>
                  </div>
                ))}
                <h3>下一輪決策</h3>
                <label>
                  這次學到了什麼，接下來繼續／調整／暫緩？
                  <textarea
                    rows={4}
                    value={work.decision}
                    onChange={(e) => change({ decision: e.target.value })}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      if (dirty) await persist();
                      const next = await api(
                        "/studio/works/" + work.id + "/followup",
                        "POST",
                        {},
                      );
                      await refresh();
                      await open(next.id);
                      setTab("plan");
                    })
                  }
                >
                  保存決策，建立下一輪企劃
                </button>
              </div>
            )}
          </fieldset>
        ) : (
          <div className="work-empty">
            <h2>今天，想解決什麼問題？</h2>
            <p>不必先想完整。留下一句觀察，就能開始。</p>
            <button onClick={create}>建立第一個作品</button>
          </div>
        )}
      </div>
    </section>
  );
}
