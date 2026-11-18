import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { createHash } from "node:crypto";
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  blocked.addSubnet(ip, prefix, "ipv4");
export function publicAddress(address) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        /^[23][0-9a-f]{3}:/i.test(address) &&
        !/^2001:db8:/i.test(address);
}
export function sourceUrls(run) {
  const text = [
    ...(Array.isArray(run.researchSettings?.sourceUrls)
      ? run.researchSettings.sourceUrls
      : []),
    run.text,
    run.context?.goal,
    ...(run.history || []).map((h) => h.request),
  ].join("\n");
  return [
    ...new Set(
      (text.match(/https:\/\/[^\s<>"「」]+/g) || []).map((u) =>
        u.replace(/[，。；、）),;]+$/, ""),
      ),
    ),
  ]
    .filter((raw) => {
      try {
        return !/^(www\.)?(x\.com|twitter\.com|instagram\.com|threads\.(com|net))$/i.test(
          new URL(raw).hostname,
        );
      } catch {
        return false;
      }
    })
    .slice(0, 3);
}
export async function readPublicSource(
  raw,
  { signal, onRequest, resolve = lookup } = {},
) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /\.(localhost|local|internal)$/i.test(url.hostname)
  )
    throw Error("僅讀取公開HTTPS網域。");
  const addresses = await resolve(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("來源解析到非公開網路，未讀取。");
  signal?.throwIfAborted();
  onRequest?.({
    url: url.href,
    method: "GET",
    at: new Date().toISOString(),
    kind: "public_page",
  });
  const html = await new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        lookup: (_host, options, cb) => {
          const a = addresses[0];
          options?.all ? cb(null, [a]) : cb(null, a.address, a.family);
        },
        headers: {
          Accept: "text/html,text/plain",
          "User-Agent": "MrWhitePublicResearch/1.0",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error("公開頁HTTP " + res.statusCode + "；未跟隨轉址。"));
          return;
        }
        if (!/text\/(html|plain)/i.test(res.headers["content-type"] || "")) {
          res.resume();
          reject(Error("來源非文字網頁。"));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1000000) {
            req.destroy(Error("公開頁超過1MB。"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error("公開頁讀取逾時。")),
      15000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
  const plain = (s) =>
    s
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  const article =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html;
  const content = plain(article);
  const links = [
    ...article.matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ]
    .flatMap((m) => {
      try {
        const target = new URL(m[1].replace(/&amp;/g, "&"), url);
        target.hash = "";
        const title = plain(m[2]);
        return target.origin === url.origin &&
          target.href !== url.href &&
          title.length > 15
          ? [{ url: target.href, title: title.slice(0, 200) }]
          : [];
      } catch {
        return [];
      }
    })
    .filter((l, i, a) => a.findIndex((x) => x.url === l.url) === i)
    .slice(0, 60);
  if (content.length < 80)
    throw Error("公開頁沒有足夠可讀文字，可能需要JavaScript。");
  return {
    id:
      "web-" + createHash("sha256").update(url.href).digest("hex").slice(0, 12),
    url: url.href,
    links,
    title: plain(
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url.hostname,
    ),
    summary: content.slice(0, 12000),
    kind: "web",
    publishedAt:
      html.match(
        /<meta[^>]*(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
      )?.[1] || null,
    collectedAt: new Date().toISOString(),
    evidence: "本次實際讀取公開網頁的文字；來源主張尚未獨立查證",
    limitations:
      content.length > 12000
        ? "僅保留前12000字；未讀圖片、PDF或JavaScript動態內容"
        : "未讀圖片、PDF或JavaScript動態內容",
  };
}
export async function collectPublicSources(run, options = {}) {
  const sources = [],
    warnings = [];
  for (const url of sourceUrls(run)) {
    options.signal?.throwIfAborted();
    try {
      sources.push(await readPublicSource(url, options));
    } catch (e) {
      options.signal?.throwIfAborted();
      warnings.push(url + "：" + e.message);
    }
  }
  return { sources, warnings };
}
