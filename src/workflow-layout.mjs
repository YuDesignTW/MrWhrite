export function layoutWorkflow(steps) {
  const ids = new Set(steps.map((s) => s.id)),
    levels = new Map(),
    visiting = new Set();
  if (ids.size !== steps.length) throw Error("流程節點識別碼重複");
  for (const s of steps)
    if (s.dependsOn?.some((id) => !ids.has(id)))
      throw Error("流程依賴指向不存在的節點");
  const dependencies = (s) =>
    s.dependsOn === undefined
      ? steps.indexOf(s) > 0
        ? [steps[steps.indexOf(s) - 1].id]
        : []
      : s.dependsOn.filter((id) => ids.has(id));
  function level(s) {
    if (levels.has(s.id)) return levels.get(s.id);
    if (visiting.has(s.id)) throw Error("流程依賴包含循環");
    visiting.add(s.id);
    const n = dependencies(s).reduce(
      (n, id) => Math.max(n, level(steps.find((s) => s.id === id)) + 1),
      0,
    );
    visiting.delete(s.id);
    levels.set(s.id, n);
    return n;
  }
  steps.forEach(level);
  const counts = new Map(),
    positions = new Map();
  for (const s of steps) {
    const l = levels.get(s.id),
      row = counts.get(l) || 0;
    counts.set(l, row + 1);
    positions.set(s.id, { x: 48 + l * 290, y: 70 + row * 170 });
  }
  const nodes = steps.map((s) => ({ ...s, ...positions.get(s.id) }));
  return {
    nodes,
    edges: steps.flatMap((s) =>
      dependencies(s).map((from) => ({ from, to: s.id })),
    ),
    width: Math.max(650, ...nodes.map((n) => n.x + 270)),
    height: Math.max(360, ...nodes.map((n) => n.y + 160)),
  };
}
