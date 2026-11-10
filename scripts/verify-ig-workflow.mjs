// Opt-in live acceptance: uses the real CLI and an isolated temporary database.
// No social provider, browser, publishing, or production data is involved.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../server/app.mjs";
import { client } from "../tests/http-helper.mjs";

const dir = mkdtempSync(join(tmpdir(), "mr-white-ig-live-"));
const app = createApp({ dir });
const id = randomUUID();
try {
  const c = await client(app.app);
  const consent = await c.request("/settings", "PATCH", { aiConsent: true });
  if (consent.status !== 200) throw Error("Cannot configure isolated test");
  const result = await c.request("/agent/messages", "POST", {
    id,
    agentId: "creation",
    skillId: "ig-carousel",
    workflow: "ig-carousel",
    intent: "chat",
    sourceIds: [],
    text: "請直接製作一個四頁 IG 輪播提案，給總是存了一堆靈感卻沒有開始創作的人。核心觀點：從收藏中挑一個點子，縮成十五分鐘可做的概念草圖。以嘉思學院的創意實驗語氣寫。這是原創練習建議，沒有實測、研究數據或成效，不要編造；不需要外部案例或追問。請給完整文案與 design、layout，caption 補充練習做法。",
  });
  if (result.status !== 202) throw Error(JSON.stringify(result.data));
  let phase;
  const deadline = Date.now() + 13 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await c.request("/agent/state?agentId=creation");
    if (response.status !== 200) throw Error("Cannot read isolated run");
    const run = response.data.runs.find((r) => r.id === id);
    const current = `${run.status}:${run.steps.length}:${run.phase}`;
    if (current !== phase) {
      console.log(
        JSON.stringify({
          status: run.status,
          phase: run.phase,
          steps: run.steps.map(({ name, status }) => ({ name, status })),
        }),
      );
      phase = current;
    }
    if (run.status !== "running") {
      const message = response.data.messages.find(
        (m) => m.id === run.responseMessageId,
      );
      const artifact = join(dir, "acceptance.json");
      writeFileSync(artifact, JSON.stringify({ run, message }, null, 2));
      if (
        run.status !== "completed" ||
        !message?.proposals?.length ||
        !message.review?.passed
      )
        throw Error(
          `${run.error || "No reviewed proposals"} (artifact: ${artifact})`,
        );
      console.log(
        JSON.stringify({
          passed: true,
          artifact,
          proposals: message.proposals.length,
          scope: message.review.scope,
          revisions: message.review.revisionCount,
        }),
      );
      break;
    }
    await delay(1000);
  }
  if (Date.now() >= deadline) {
    await c.request(`/agent/runs/${id}/cancel`, "POST", {});
    throw Error("Live acceptance timed out");
  }
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: error.message }));
  process.exitCode = 1;
} finally {
  app.close();
}
