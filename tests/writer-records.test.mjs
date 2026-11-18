import test from "node:test";
import assert from "node:assert/strict";
import {
  readableCopy,
  writerRecords,
  groupWriterRecords,
} from "../src/writer-records.mjs";
test("carousel reading preserves page copy and caption without showing JSON structure", () => {
  const raw = JSON.stringify({
    title: "主題",
    slides: [
      { title: "起點", body: "不能改掉的內文" },
      { title: "下一步", body: "第二頁" },
    ],
    caption: "完整貼文",
  });
  const copy = readableCopy("```json\n" + raw + "\n```");
  assert.equal(copy.type, "carousel");
  assert.equal(copy.title, "主題");
  assert.match(copy.text, /第 1 頁｜起點\n\n不能改掉的內文/);
  assert.match(copy.text, /完整貼文/);
  assert.doesNotMatch(copy.text, /"slides"/);
  assert.equal(readableCopy("一般\n原文").text, "一般\n原文");
  assert.equal(readableCopy('{"caption":"已包裝貼文"}').text, "已包裝貼文");
});
test("writer library keeps custom-role versions, deletion and provenance while excluding other agents and failures", () => {
  const runs = [
    {
      id: "r",
      role: "director",
      text: "任務",
      createdAt: "2026-01-01",
      status: "completed",
      steps: [
        {
          id: "a",
          role: "copywriter",
          status: "completed",
          output: "第一稿",
          deleted: true,
        },
        {
          id: "b",
          role: "copywriter",
          status: "completed",
          output: "新版",
          writingProfile: { type: "post", revision: 2 },
        },
        { id: "c", role: "research", status: "completed", output: "研究" },
        { id: "d", role: "copywriter", status: "failed", output: "失敗" },
      ],
    },
  ];
  const rows = writerRecords(runs, "copywriter");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].deleted, true);
  assert.equal(rows[1].version, 2);
  assert.equal(rows[1].versionCount, 2);
  assert.equal(rows[1].writingProfile.revision, 2);
  assert.equal(rows[1].origin, "總監／合作任務");
  assert.equal(rows[1].runId, "r");
});

test("task list groups deliveries without losing earlier copy and flags missing material", () => {
  const rows = writerRecords(
    [
      {
        id: "batch",
        role: "director",
        text: "原始派工",
        createdAt: "2026-01-01",
        steps: [
          { id: "old", role: "writer", status: "completed", output: "舊稿" },
          {
            id: "new",
            role: "writer",
            status: "completed",
            finishedAt: "2026-01-02",
            output: "## 第一篇｜認識公司\n[待補]\n## 第二篇｜產業介紹\n內容",
          },
        ],
      },
    ],
    "writer",
  );
  const groups = groupWriterRecords(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].id, "new");
  assert.equal(groups[0].title, "文案批次｜認識公司等 2 篇");
  assert.equal(groups[0].pending, true);
  assert.equal(groups[0].items[1].text, "舊稿");
});
