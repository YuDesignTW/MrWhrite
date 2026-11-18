const id = (x) => typeof x === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
export function validateWorkflow(raw, { roles, capabilities } = {}) {
  if (
    !raw ||
    !id(raw.id) ||
    !["string", "number"].includes(typeof raw.version) ||
    !String(raw.version) ||
    !Array.isArray(raw.nodes) ||
    !raw.nodes.length ||
    raw.nodes.length > 70
  )
    throw Error("無效 Workflow Spec。");
  const seen = new Set();
  const nodes = raw.nodes.map((n) => {
    if (
      !id(n.id) ||
      seen.has(n.id) ||
      !["agent", "capability", "gate"].includes(n.kind)
    )
      throw Error("無效或重複節點。");
    seen.add(n.id);
    if (
      n.kind === "agent" &&
      (!id(n.role) || (roles && !roles.includes(n.role)))
    )
      throw Error("未知角色。");
    if (
      n.kind === "capability" &&
      (!id(n.capability) ||
        (capabilities && !capabilities.includes(n.capability)))
    )
      throw Error("未知能力。");
    const dependsOn = n.dependsOn ?? [],
      outputs = n.outputs ?? [],
      validate = n.validate ?? [];
    if (
      ![dependsOn, outputs, validate].every(
        (a) => Array.isArray(a) && a.every((x) => typeof x === "string"),
      ) ||
      new Set(dependsOn).size !== dependsOn.length
    )
      throw Error("節點欄位格式無效。");
    const retry = { max: 0, on: [], ...n.retry },
      budget = { timeoutSec: 120, maxPromptChars: 120000, ...n.budget };
    if (
      !Number.isInteger(retry.max) ||
      retry.max < 0 ||
      retry.max > 2 ||
      !Array.isArray(retry.on) ||
      retry.on.some((x) => !["schema_invalid", "timeout"].includes(x))
    )
      throw Error("重試規則無效。");
    if (
      !Number.isFinite(budget.timeoutSec) ||
      budget.timeoutSec <= 0 ||
      budget.timeoutSec >= 180 ||
      !Number.isInteger(budget.maxPromptChars) ||
      budget.maxPromptChars < 1 ||
      budget.maxPromptChars > 200000
    )
      throw Error("節點預算無效。");
    if (
      n.gate &&
      !["select_one", "approve_before", "approve_after"].includes(n.gate.type)
    )
      throw Error("未知 gate。");
    return {
      ...n,
      dependsOn,
      outputs,
      validate,
      retry,
      budget,
      gate: n.gate ?? null,
    };
  });
  const visiting = new Set(),
    done = new Set(),
    byId = new Map(nodes.map((n) => [n.id, n]));
  function visit(node) {
    if (visiting.has(node.id)) throw Error("流程依賴有循環。");
    if (done.has(node.id)) return;
    visiting.add(node.id);
    for (const d of node.dependsOn) {
      if (!byId.has(d)) throw Error("依賴不存在。");
      visit(byId.get(d));
    }
    visiting.delete(node.id);
    done.add(node.id);
  }
  nodes.forEach(visit);
  return {
    ...raw,
    nodes,
    maxParallel: Math.min(2, Math.max(1, Number(raw.maxParallel) || 2)),
  };
}
