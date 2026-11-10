// Optional real Chromium check without opening a listening socket.
// CDP Fetch routes to the real Express HTTP parser via the same in-memory transport
// as API tests. No provider responses are fabricated and data lives in a temp dir.
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { request } from "../tests/http-helper.mjs";
const chrome = process.env.MR_WHITE_CHROME;
if (!chrome || !existsSync(chrome))
  throw Error("Set MR_WHITE_CHROME to a Chromium executable.");
const dir = mkdtempSync(join(tmpdir(), "mr-white-browser-"));
const app = createApp({ dir: join(dir, "data"), socialOptions: { env: {} } });
const child = spawn(
  chrome,
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-debugging-pipe",
    "--no-first-run",
    "--user-data-dir=" + join(dir, "browser"),
  ],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
);
let seq = 0,
  buffer = Buffer.alloc(0),
  session,
  cookie = "";
const pending = new Map();
let stderr = "";
child.stderr.on("data", (b) => (stderr += b.toString()));
const send = (method, params = {}, sid = session) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("CDP timeout: " + method + " " + stderr.slice(-1500)));
    }, 12000);
    pending.set(id, { resolve, reject, timer });
    child.stdio[3].write(
      JSON.stringify({
        id,
        method,
        params,
        ...(sid ? { sessionId: sid } : {}),
      }) + "\0",
    );
  });
child.stdio[4].on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let n;
  while ((n = buffer.indexOf(0)) >= 0) {
    const raw = buffer.subarray(0, n).toString();
    buffer = buffer.subarray(n + 1);
    if (!raw) continue;
    const m = JSON.parse(raw);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error
          ? p.reject(Error(JSON.stringify(m.error)))
          : p.resolve(m.result);
      }
    } else if (m.method === "Fetch.requestPaused")
      handle(m.params, m.sessionId).catch((e) => console.error(e.message));
  }
});
async function handle({ requestId, request: r }, sid) {
  const u = new URL(r.url);
  let status = 200,
    headers = [],
    body;
  if (u.origin !== "http://127.0.0.1:4389") {
    return send(
      "Fetch.failRequest",
      { requestId, errorReason: "BlockedByClient" },
      sid,
    );
  }
  if (u.pathname.startsWith("/api/")) {
    const h = {
      ...r.headers,
      Host: "127.0.0.1:4389",
      ...(cookie ? { Cookie: cookie } : {}),
    };
    const response = await request(app.app, u.pathname + u.search, {
      method: r.method,
      ...(r.postData ? { body: JSON.parse(r.postData) } : {}),
      headers: h,
    });
    status = response.status;
    body = JSON.stringify(response.data);
    const match = response.head.match(/Set-Cookie: ([^;]+)/i);
    if (match) cookie = match[1];
    headers = [{ name: "Content-Type", value: "application/json" }];
  } else {
    let path = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    if (path.includes("..")) throw Error("Invalid asset");
    const file = resolve("dist/client", path);
    if (existsSync(file)) {
      body = readFileSync(file);
      headers = [
        {
          name: "Content-Type",
          value: path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : path.endsWith(".svg")
                ? "image/svg+xml"
                : "text/html",
        },
      ];
    } else {
      status = 404;
      body = "Not found";
    }
  }
  return send(
    "Fetch.fulfillRequest",
    {
      requestId,
      responseCode: status,
      responseHeaders: headers,
      body: Buffer.from(body).toString("base64"),
    },
    sid,
  );
}
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const waitFor = async (expression) => {
  for (let i = 0; i < 50; i++) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("UI not ready: " + expression);
};
const click = async (label) =>
  evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Button missing');e.click();})()`,
  );
const fill = async (selector, value) =>
  evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Input missing');const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;setter.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
try {
  const { targetId } = await send(
    "Target.createTarget",
    { url: "about:blank" },
    null,
  );
  session = (
    await send("Target.attachToTarget", { targetId, flatten: true }, null)
  ).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:4389/" });
  await waitFor(
    `!![...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='情報室')`,
  );
  await click("情報室");
  await waitFor(`document.body.innerText.includes('把值得留下的貼文放進來')`);
  await click("新增情報");
  await click("貼上文字");
  await fill(
    ".intel-import textarea",
    "瀏覽器驗收：先讀懂，再形成自己的觀點。\n繁體中文與 emoji 🌿",
  );
  await click("保存情報");
  await waitFor(`document.body.innerText.includes('情報已保存。')`);
  await click("建立文章草稿");
  await waitFor(
    `document.querySelector('.workspace-nav .active')?.textContent==='寫作空間'`,
  );
  await click("情報室");
  await waitFor(`!!document.querySelector('.intel-card')`);
  await evaluate(`document.querySelector('.intel-card').click()`);
  await send("Page.captureScreenshot", { format: "png" }).then((r) =>
    writeFileSync(join(dir, "desktop.png"), Buffer.from(r.data, "base64")),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate(`new Promise(r=>setTimeout(r,200))`);
  const widths = await evaluate(
    `({body:document.documentElement.scrollWidth,viewport:innerWidth})`,
  );
  if (widths.body > widths.viewport)
    throw Error("Mobile horizontal overflow " + JSON.stringify(widths));
  await send("Page.captureScreenshot", { format: "png" }).then((r) =>
    writeFileSync(join(dir, "mobile.png"), Buffer.from(r.data, "base64")),
  );
  await click("追蹤與更新");
  await waitFor(`document.body.innerText.includes('每日更新時間')`);
  await fill(
    'input[aria-label="追蹤帳號網址"]',
    "https://www.instagram.com/heidisocialbook/",
  );
  await click("加入來源");
  await waitFor(`document.body.innerText.includes('待驗證')`);
  await click("Threads 發布");
  await waitFor(`document.body.innerText.includes('尚未設定 Meta 應用')`);
  console.log(
    JSON.stringify({
      passed: true,
      artifacts: dir,
      transport:
        "real Chromium + real Express over in-memory HTTP; no listening port",
      checks: [
        "manual intake",
        "draft isolation",
        "mobile no overflow",
        "unconfigured source",
        "unconfigured publishing",
      ],
    }),
  );
} finally {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
  }
  child.kill("SIGTERM");
  app.close();
}
