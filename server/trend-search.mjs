// One bounded, server-controlled public RSS search. No arbitrary URL fetching.
const plain = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function parseTrendFeed(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)]
    .map(([, block], i) => {
      const field = (n) =>
        plain(block.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`))?.[1]);
      const url = field("link");
      return {
        id: "news-" + (i + 1),
        title: field("title"),
        url,
        publishedAt: field("pubDate"),
        summary: field("description").slice(0, 1200),
        publisher: field("source"),
        publisherUrl: plain(block.match(/<source\b[^>]*url=["']([^"']+)["']/i)?.[1]),
        evidence: "RSS 標題與摘要；尚未閱讀全文",
      };
    })
    .filter((x) => x.title && /^https:\/\//.test(x.url))
    .slice(0, 12);
}
export function trendQuery(request = "", topic = "brand design creativity") {
  const cleaned = request
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\n\r"<>]/g, " ")
    .replace(
      /(?:我想要|幫我|請你|請|整理一下|整理|目前|最新的|最新|近期的|有哪些|給我幾個主題|推薦內容給我選|推薦內容|選題|搜尋一下|搜尋|趨勢)/g,
      " ",
    )
    .replace(
      /(?:那目前|那麼|你建議我|你建議|建議我|你推薦我|你推薦|我可以|我應該|可以做什麼|有什麼|哪些|主題|題目|內容|推薦|建議|現在|目前)/g,
      " ",
    )
    .replace(/^(?:那|好|所以)\s*/, "")
    .replace(/[，。？！?:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    (cleaned.length >= 2 ? cleaned.slice(0, 100) : topic.slice(0,100)) +
    " when:7d"
  );
}
export async function searchTrends({ signal, request, settings = {}, onRequest } = {}) {
  const locales={"en-US":"&hl=en-US&gl=US&ceid=US:en","zh-TW":"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant","ja-JP":"&hl=ja&gl=JP&ceid=JP:ja"};
  if(settings.locale && !locales[settings.locale])throw Error("不支援的搜尋語系。");
  if(settings.allowedDomains && !settings.allowedDomains.includes("news.google.com"))throw Error("團隊來源政策不允許 news.google.com。");
  const query = trendQuery(request, settings.topic || "brand design creativity");
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    locales[settings.locale || "en-US"];
  onRequest?.({url,method:"GET",at:new Date().toISOString()});
  const response = await fetch(url, {
    signal: AbortSignal.any([
      signal || new AbortController().signal,
      AbortSignal.timeout(20000),
    ]),
    redirect: "error",
    headers: { Accept: "application/rss+xml, application/xml" },
  });
  if (!response.ok) throw Error("趨勢搜尋失敗：HTTP " + response.status);
  const reader = response.body.getReader();
  let bytes = 0,
    chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 1500000) {
      await reader.cancel();
      throw Error("搜尋結果超過大小限制。");
    }
    chunks.push(Buffer.from(value));
  }
  const sources = parseTrendFeed(Buffer.concat(chunks).toString("utf8"));

  return {
    query,
    url,
    fetchedAt: new Date().toISOString(),
    sources,
    limitations:
      "公開新聞搜尋的標題與摘要，不代表社群熱度、完整事實查核或平台數據。",
  };
}
