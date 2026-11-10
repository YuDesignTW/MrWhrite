import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIGDesign,
  igVisualSignature,
  igBackgroundPath,
} from "../shared/ig-design.mjs";
test("photo redesign signatures reflect rendered style, not unused legacy layout or palette tokens", () => {
  const original = {
    design: { theme: "paper", style: "street" },
    slides: [
      { title: "首圖", body: "內容", layout: "cover" },
      { title: "收尾", body: "內容", layout: "closing" },
    ],
  };
  const unused = {
    ...original,
    design: { theme: "ink", style: "street" },
    slides: original.slides.map((s) => ({ ...s, layout: "statement" })),
  };
  assert.equal(igVisualSignature(original), igVisualSignature(unused));
  assert.notEqual(
    igVisualSignature(original),
    igVisualSignature({
      ...original,
      design: { theme: "paper", style: "surreal" },
    }),
  );
  assert.equal(normalizeIGDesign(original).design.style, "street");
  assert.equal(
    igBackgroundPath({ style: "street" }, 0, 6),
    "/ig-backgrounds/street-cover.png",
  );
  assert.equal(
    igBackgroundPath({ style: "street" }, 5, 6),
    "/ig-backgrounds/street-closing.png",
  );
  assert.equal(
    igBackgroundPath({ style: "street" }, 3, 6),
    "/ig-backgrounds/street-content.png",
  );
  assert.equal(igBackgroundPath({ style: "../../secret" }, 0, 6), null);
});
