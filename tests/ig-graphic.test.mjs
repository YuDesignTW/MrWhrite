import { test } from "node:test";
import assert from "node:assert/strict";
import { renderGraphicType } from "../src/ig-graphic.js";

function recordingContext() {
  const lines = [];
  const c = {
    font: "900 42px sans-serif",
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    translate() {},
    scale() {},
    strokeText() {},
    measureText(value) {
      const size = Number(this.font.match(/(\d+)px/)[1]);
      return {
        width:
          [...value].reduce(
            (n, ch) => n + (/^[\x00-\x7f]$/.test(ch) ? 0.55 : 1),
            0,
          ) * size,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: size,
      };
    },
    fillText(text, x, y) {
      lines.push({ text, x, y, width: this.measureText(text).width });
    },
  };
  return { c, lines };
}

test("poster wrapping keeps brand words and punctuation readable at a line boundary", () => {
  const { c, lines } = recordingContext();
  const issues = renderGraphicType(
    c,
    { title: "座椅的故事", body: "設計".repeat(10) + "IMPALA。" },
    1,
    8,
  );
  assert.deepEqual(issues, []);
  const body = lines.filter(
    (line) => line.x === 96 && line.y >= 1030 && line.y < 1195,
  );
  assert.ok(body.some((line) => line.text.includes("IMPALA。")));
  assert.ok(body.every((line) => !/^[，。！？,.!?]/u.test(line.text)));
  assert.ok(body.every((line) => line.width <= 915));
});

test("poster currency stays intact and an unfit word blocks output", () => {
  const { c, lines } = recordingContext();
  assert.deepEqual(
    renderGraphicType(c, { title: "賣了\n約120億美元", body: "故事" }, 0, 9),
    [],
  );
  const currency = lines.find((line) => line.text === "約120億美元");
  assert.ok(currency);
  assert.ok(currency.width <= 830);
  assert.ok(
    renderGraphicType(c, { title: "A".repeat(200), body: "故事" }, 0, 9)
      .length > 0,
  );
});
