import { test } from "node:test";
import assert from "node:assert/strict";
import { codexPolicy } from "../server/codex-policy.mjs";
test("node policy denies general roots and network, grants only runtime and exact node workspace read", () => {
  const args = codexPolicy("/private/tmp/node with spaces");
  assert.ok(args.includes('default_permissions="mr-white-node"'));
  const fs = args.find((s) =>
    s.startsWith("permissions.mr-white-node.filesystem="),
  );
  assert.match(fs, /":root"="deny"/);
  assert.match(fs, /":slash_tmp"="deny"/);
  assert.match(fs, /":tmpdir"="deny"/);
  assert.match(fs, /":minimal"="read"/);
  assert.match(fs, /"\/private\/tmp\/node with spaces"="read"/);
  assert.ok(args.includes("permissions.mr-white-node.network.enabled=false"));
  assert.ok(!args.includes("--sandbox"));
  assert.doesNotMatch(fs, /="write"/);
});
