import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  openSync,
  closeSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

const exec = promisify(execFile);
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function probe(url, instance) {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    const value = await response.json().catch(() => null);
    if (
      response.ok &&
      value?.app === "mr-white" &&
      value?.status === "ready" &&
      value?.instance === instance
    )
      return "ready";
    return "occupied";
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") return "stopped";
    if (error.name === "TimeoutError") return "waiting";
    throw new Error("無法檢查本機服務。請確認系統允許連線到 127.0.0.1。");
  }
}

export async function launch({ openBrowser = true } = {}) {
  process.chdir(project);
  if (existsSync(".env")) loadEnvFile(".env");
  const port = Number(process.env.PORT || 4389);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("本機服務的 PORT 設定無效。");
  const url = `http://127.0.0.1:${port}`;
  const dataDir = resolve(process.env.MR_WHITE_DATA_DIR || "data");
  const instance = createHash("sha256").update(dataDir).digest("hex");
  const logDir = join(dataDir, "logs");
  const logFile = join(logDir, "launcher.log");
  const before = await probe(url, instance);
  if (before === "occupied")
    throw new Error(
      `連接埠 ${port} 正由其他服務使用，沒有啟動或停止任何服務。`,
    );
  let started = false;
  if (before === "stopped") {
    if (!existsSync("dist/client/index.html"))
      throw new Error("找不到網頁正式版本，請先重新建置啟動器。");
    if (!existsSync("node_modules/express/package.json"))
      throw new Error("找不到本機程式依賴，請保留 mr-white 專案資料夾。");
    mkdirSync(logDir, { recursive: true, mode: 0o700 });
    const fd = openSync(logFile, "a", 0o600);
    let child;
    try {
      child = spawn(process.execPath, ["server/index.mjs"], {
        cwd: project,
        detached: true,
        stdio: ["ignore", fd, fd],
        env: {
          ...process.env,
          NODE_ENV: "production",
          PATH: `${dirname(process.execPath)}:${process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin"}`,
        },
      });
    } finally {
      closeSync(fd);
    }
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () => reject(new Error("無法啟動本機服務。")));
    });
    child.unref();
    started = true;
  }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const state = await probe(url, instance);
    if (state === "ready") {
      if (openBrowser) await exec("/usr/bin/open", [url]);
      mkdirSync(logDir, { recursive: true, mode: 0o700 });
      appendFileSync(
        logFile,
        `${new Date().toISOString()} launcher: ${started ? "started" : "reused"}; ${openBrowser ? "browser opened" : "headless check"}\n`,
        { mode: 0o600 },
      );
      return { url, started, logFile };
    }
    if (state === "occupied")
      throw new Error(`連接埠 ${port} 正由其他服務使用。`);
    await sleep(250);
  }
  throw new Error(`本機服務未能在 20 秒內啟動。診斷紀錄：${logFile}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        await launch({ openBrowser: !process.argv.includes("--no-browser") }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    if (!process.argv.includes("--no-browser")) {
      const script =
        'on run argv\ndisplay alert "懷特先生無法啟動" message (item 1 of argv) as critical buttons {"好"} default button "好"\nend run';
      await exec("/usr/bin/osascript", ["-e", script, error.message]).catch(
        () => {},
      );
    }
    process.exitCode = 1;
  }
}
