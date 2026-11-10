import { test } from "node:test";
import assert from "node:assert/strict";
import { toPlainText } from "../src/plain-text.js";
test("純文字匯出解析 Markdown，保留 Unicode、程式碼與段落", () => {
  const result = toPlainText(
    "# 標題\n\n**粗體**與*斜體*🌿\n\n[連結](https://example.com)\n\n> 引言\n\n- 第一\n- 第二\n\n```js\nconst a = 1;\n```\n\n<script>alert(1)</script>",
  );
  assert.ok(result.startsWith("標題\n\n粗體與斜體🌿"));
  assert.ok(result.includes("連結\n\n引言"));
  assert.ok(result.includes("第一\n第二"));
  assert.ok(result.includes("const a = 1;"));
  assert.ok(!result.includes("script"));
  assert.ok(!result.includes("https://"));
  assert.ok(!result.includes("**"));
});
