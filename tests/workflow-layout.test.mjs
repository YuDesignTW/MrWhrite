import test from "node:test";
import assert from "node:assert/strict";
import { layoutWorkflow } from "../src/workflow-layout.mjs";
test("canvas preserves parallel branches and joins instead of drawing a sequential imitation", () => {
  const steps = [
    { id: "plan", dependsOn: [] },
    { id: "writer", dependsOn: ["plan"] },
    { id: "designer", dependsOn: ["plan"] },
    { id: "render", dependsOn: ["writer", "designer"] },
  ];
  const g = layoutWorkflow(steps),
    node = (id) => g.nodes.find((n) => n.id === id);
  assert.equal(node("writer").x, node("designer").x);
  assert.notEqual(node("writer").y, node("designer").y);
  assert.ok(node("render").x > node("writer").x);
  assert.deepEqual(g.edges, [
    { from: "plan", to: "writer" },
    { from: "plan", to: "designer" },
    { from: "writer", to: "render" },
    { from: "designer", to: "render" },
  ]);
  assert.deepEqual(steps[1], { id: "writer", dependsOn: ["plan"] });
});
test("legacy ordered steps get explicit edges; malformed dependency graphs are rejected", () => {
  assert.deepEqual(layoutWorkflow([{ id: "a" }, { id: "b" }]).edges, [
    { from: "a", to: "b" },
  ]);
  assert.throws(
    () =>
      layoutWorkflow([
        { id: "a", dependsOn: ["b"] },
        { id: "b", dependsOn: ["a"] },
      ]),
    /循環/,
  );
  assert.throws(
    () => layoutWorkflow([{ id: "a", dependsOn: ["missing"] }]),
    /不存在/,
  );
  assert.throws(() => layoutWorkflow([{ id: "a" }, { id: "a" }]), /重複/);
});
