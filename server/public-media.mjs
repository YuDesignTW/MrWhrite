import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { publicAddress } from "./public-research.mjs";
export async function fetchPublicMedia(raw, { signal, resolve = lookup } = {}) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /\.(local|internal|localhost)$/i.test(url.hostname)
  )
    throw Error("只接受公開 HTTPS 來源。");
  const addresses = await resolve(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("來源不是公開網路。");
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        lookup: (_h, o, cb) =>
          o?.all
            ? cb(null, [addresses[0]])
            : cb(null, addresses[0].address, addresses[0].family),
        headers: {
          Accept: "application/pdf,image/png,image/jpeg,image/webp,text/html",
          "User-Agent": "MrWhiteVisualReader/1.0",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error(`來源 HTTP ${res.statusCode}；未跟隨轉址。`));
          return;
        }
        let size = 0;
        const chunks = [];
        res.on("data", (c) => {
          size += c.length;
          if (size > 20 * 1024 * 1024) {
            req.destroy(Error("來源超過 20 MB。"));
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            mime: res.headers["content-type"] || "",
            url: url.href,
          }),
        );
      },
    );
    const timeout = setTimeout(
      () => req.destroy(Error("來源讀取逾時。")),
      30000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end();
  });
}
