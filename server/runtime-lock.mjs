import {
  mkdirSync,
  openSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
// CLI server is single-process per data directory. Do not recover jobs in a second process.
export function lockRuntime(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, ".runtime-lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = openSync(file, "wx", 0o600);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let pid;
      try {
        pid = Number(readFileSync(file, "utf8"));
      } catch {
        throw Error("無法讀取資料目錄執行鎖。");
      }
      if (!Number.isInteger(pid) || pid < 1)
        throw Error("執行鎖無效，請確認沒有其他服務使用此資料目錄。");
      try {
        process.kill(pid, 0);
        throw Error("這個資料目錄已有服務執行中。");
      } catch (err) {
        if (err.code !== "ESRCH") throw err;
      }
      unlinkSync(file);
      continue;
    }
    try {
      writeFileSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    return () => {
      try {
        if (readFileSync(file, "utf8") === String(process.pid))
          unlinkSync(file);
      } catch {}
    };
  }
  throw Error("無法取得資料目錄執行鎖。");
}
