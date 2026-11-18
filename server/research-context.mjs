import { createHash } from "node:crypto";
const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
const safeUrl = (s) => {
  try {
    const u = new URL(s);
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
};
export function researchSources({
  accounts = [],
  bound = [],
  previous = [],
} = {}) {
  const tracked = accounts
    .flatMap((a) =>
      (a.posts || [])
        .map((p) => ({
          url: p.url,
          title: `${a.platform} @${a.username} · ${clip(p.body || p.analysis?.summary, 95)}`,
          summary: clip(p.body, 1800),
          analysis: p.analysis
            ? {
                summary: clip(p.analysis.summary, 1800),
                angle: clip(p.analysis.angle, 1000),
                coverage: p.analysis.coverage,
                items: p.analysis.items
                  ?.slice(0, 5)
                  .map((i) => ({
                    observation: clip(i.observation, 1200),
                    limitation: clip(i.limitation, 900),
                  })),
              }
            : undefined,
          collectedAt: p.collectedAt,
          publishedAt: p.publishedAt,
          kind: "tracked",
          evidence: clip(p.evidence, 500) || "已保存的公開貼文摘要，未核驗全文",
          limitations:
            "這是已收集的資料，非本次重新讀取；不保證最新排序。影片依 coverage 記載的抽幀與音訊範圍判讀。",
        }))
        .filter((p) => p.summary?.trim() || p.analysis?.summary?.trim()),
    )
    .sort(
      (a, b) =>
        (Date.parse(b.collectedAt) || 0) - (Date.parse(a.collectedAt) || 0),
    );
  const refs = bound.map((p) => ({
    url: p.url,
    title: p.name,
    summary: clip(p.content, 2500),
    kind: "bound",
    evidence: "使用者明確綁定的專案情報，時效待核驗",
  }));
  const recent = previous
    .filter((r) => Date.parse(r.search?.fetchedAt) > Date.now() - 7 * 86400000)
    .flatMap((r) =>
      (r.search?.sources || [])
        .filter((p) => !p.kind || p.kind === "news")
        .map((p) => ({
          ...p,
          kind: "cached_news",
          collectedAt: r.search.fetchedAt,
          evidence: "先前搜尋保存的新聞標題與摘要，非本次搜尋結果",
        })),
    );
  const seen = new Set();
  return [...tracked, ...refs, ...recent]
    .filter((p) => {
      if (
        !safeUrl(p.url) ||
        (!p.summary?.trim() && !p.analysis?.summary?.trim()) ||
        seen.has(p.url)
      )
        return false;
      seen.add(p.url);
      return true;
    })
    .slice(0, 18)
    .map((p) => ({
      ...p,
      id:
        "saved-" +
        createHash("sha256").update(p.url).digest("hex").slice(0, 12),
    }));
}
export function combineResearch(saved, fresh) {
  const seen = new Set();
  return [
    ...saved.filter((p) => p.kind !== "cached_news"),
    ...fresh.map((p) => ({ ...p, kind: p.kind || "news" })),
    ...saved.filter((p) => p.kind === "cached_news"),
  ]
    .filter((p) => {
      if (!safeUrl(p.url) || seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    })
    .slice(0, 30);
}
