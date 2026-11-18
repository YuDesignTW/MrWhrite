const labels = {
  director: "總監整理中",
  research: "趨勢分析中",
  writer: "文案撰寫中",
  designer: "圖面設計中",
};
export function runningAgents(run) {
  if (run.status !== "running") return [];
  const steps = (run.steps || []).filter((s) => s.status === "running");
  return (steps.length ? steps : [{ role: run.role }]).map((s) => ({
    role: s.role,
    label:
      s.kind === "trend_search"
        ? "整理研究資料中"
        : s.kind === "render"
          ? "輪播圖片合成中"
          : s.kind === "image_generation"
            ? `第 ${s.page || ""} 頁主視覺生成中`
            : labels[s.role] || "處理中",
  }));
}
export function agentActivity(runs, tracking, epoch) {
  const result = [];
  for (const run of runs.filter((r) => r.dataEpoch === epoch))
    for (const a of runningAgents(run))
      result.push({ ...a, teamId: run.teamId, projectId: run.projectId });
  for (const row of tracking.filter((r) => r.dataEpoch === epoch)) {
    if (row.status === "collecting")
      result.push({
        role: "research",
        teamId: row.teamId,
        projectId: row.projectId,
        label: `正在收集 @${row.username}`,
      });
    if (row.posts?.some((p) => p.mediaStatus === "analyzing"))
      result.push({
        role: "research",
        teamId: row.teamId,
        projectId: row.projectId,
        label: `正在解析 @${row.username} 的素材`,
      });
  }
  return result;
}
