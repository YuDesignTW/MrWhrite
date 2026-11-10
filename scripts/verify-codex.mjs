import { runCodex, writingRules, codexStatus } from "../server/codex.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const status = await codexStatus();
console.log(JSON.stringify(status, null, 2));
if (!status.ready) process.exit(1);
const dir = mkdtempSync(join(tmpdir(), "mr-white-codex-"));
try {
  const start = Date.now();
  const job = runCodex(
    writingRules +
      "\n請寫一句二十字以内的繁體中文短文，主題是安靜的早晨。不要使用任何工具。",
    dir,
  );
  const r = await job.promise;
  if (!r.content.trim()) throw Error("沒有文章內容");
  console.log(
    JSON.stringify({
      test: "generation",
      passed: true,
      characters: r.content.length,
      durationMs: Date.now() - start,
    }),
  );
  const cancel = runCodex(
    writingRules + "\n請寫三千字關於觀察日常的散文。",
    dir,
  );
  setTimeout(() => cancel.cancel(), 1000);
  try {
    await cancel.promise;
    console.log(
      JSON.stringify({
        test: "cancellation",
        passed: false,
        reason: "在取消之前已完成，請重跑驗證。",
      }),
    );
    process.exitCode = 1;
  } catch (e) {
    if (!e.cancelled) throw e;
    console.log(JSON.stringify({ test: "cancellation", passed: true }));
  }
} catch (e) {
  console.error(JSON.stringify({ passed: false, error: e.message }));
  process.exitCode = 1;
}
