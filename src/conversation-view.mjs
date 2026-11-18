export const roleLabels = {
  director: "總監",
  research: "趨勢偵查",
  writer: "文案寫手",
  designer: "設計圖面",
};
export const stateLabels = {
  running: "處理中",
  queued: "排隊中",
  awaiting_approval: "等待確認計畫",
  completed: "已完成",
  awaiting_selection: "等待選題",
  failed: "未完成",
  cancelled: "已停止",
  interrupted: "已中斷",
};
export function visibleRuns(runs, role) {
  return role === "director"
    ? runs
    : runs.filter(
        (r) => r.role === role || r.steps.some((s) => s.role === role),
      );
}
export function replyForRole(run, role) {
  if (role === "director") return run.output || "";
  if (run.deliverable && role === "designer")
    return `「${run.deliverable.title}」圖面已完成，共 ${run.deliverable.files.length} 頁，等待審稿。`;
  if (run.deliverable && role === "writer")
    return `「${run.deliverable.title}」文案已完成，共 ${run.deliverable.slides.length} 頁。\n\n${run.deliverable.caption || ""}`;
  const tracked = run.steps.find(
    (s) => s.kind === "account_tracking" && s.status === "completed",
  );
  if (role === "research" && tracked) return tracked.output;
  const steps = run.steps.filter(
    (s) => s.role === role && s.status === "completed" && !s.kind,
  );
  const output = steps.at(-1)?.output || "";
  if (role === "research" && run.search && !output) {
    if(run.status==='completed'&&!run.search.sources.length)return run.output;
    return `這次研究已整理 ${run.search.sources.length} 筆來源，觀察報告尚未完成。`;
  }
  if (!output) return run.role === role ? run.output || "" : "";
  try {
    const v = JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    return (
      v.caption ||
      v.reply ||
      v.rationale ||
      v.title ||
      "已完成交付，詳見合作紀錄。"
    );
  } catch {
    return output;
  }
}
