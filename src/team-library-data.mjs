export const workflows = [
  { id: 'carousel', name: '品牌故事輪播', description: '選題 → 寫作 → 審查 → 圖面', steps: [
    { id: 'plan', name: '文字選題', member: 'director', skills: ['ig-plan'], input: '專案目標、參考資料', output: '3–5 個文字題材', gate: '使用者選題後才繼續' },
    { id: 'write', name: '故事與文案', member: 'writer', skills: ['copy-carousel', 'ig-caption'], input: '已選題材、可核對的來源', output: '逐頁故事、貼文文案' },
    { id: 'review', name: '內容審查', member: 'writer', skills: ['ig-human'], input: '初稿與來源', output: '檢查意見與修訂稿', gate: '最多一次退修；不通過則停止' },
    { id: 'design', name: '輪播設計', member: 'designer', skills: ['ig-carousel'], input: '通過審查的文案', output: '輪播圖面與版型', gate: '使用者審稿，不自動發布' },
  ] },
  { id: 'caption', name: '文案修訂', description: '起草 → 語氣檢查', steps: [
    { id: 'draft', name: '貼文文案', member: 'writer', skills: ['ig-caption'], input: '原文、修改要求', output: '修訂文案' },
    { id: 'edit', name: '語氣檢查', member: 'writer', skills: ['ig-human'], input: '修訂文案、品牌偏好', output: '自然語氣的交付稿', gate: '使用者確認' },
  ] },
  { id: 'analysis', name: '內容成效回顧', description: '資料檢查 → 下輪企劃', steps: [
    { id: 'audit', name: '成效分析', member: 'analyst', skills: ['ig-audit'], input: '真實成效資料', output: '觀察、限制與改善建議' },
    { id: 'next', name: '下輪內容', member: 'director', skills: ['ig-plan'], input: '成效建議、品牌目標', output: '可驗證的內容實驗', gate: '缺少數據時不推測成效' },
  ] },
];
export const skillIsAssigned = (team, id, member) => team.skills.some(s => s.id === id && (s.scope === 'team' || s.scope === member));
export function knowledgeGraph(team, project) {
  if (!project) return { nodes: [], edges: [] };
  const nodes = [{ id: 'project', name: project.name, kind: 'project' }];
  const edges = [];
  const add = node => { nodes.push(node); edges.push({ from: 'project', to: node.id, label: '屬於專案' }); };
  if (project.memory?.trim()) add({ id: 'memory', name: 'MEMORY.md', kind: 'memory', content: project.memory });
  if (project.guardrails?.trim()) add({ id: 'rules', name: 'GUARDRAILS.md', kind: 'memory', content: project.guardrails });
  for (const r of project.resources) add({ ...r, id: `resource:${r.id}`, resourceId: r.id });
  return { nodes, edges };
}
// Inspectable input contract, not an assertion that the runtime consumed it.
export function contextPreview(team, project) {
  if (!project) return '';
  return JSON.stringify({ team: team.name, project: project.name, goal: project.brief, memory: project.memory || '', guardrails: project.guardrails || '', skills: team.skills, sources: project.resources.map(r => ({ id: r.id, name: r.name, content: r.kind === 'file' ? undefined : r.content, status: r.kind === 'file' ? '檔案尚待解析' : '原始資料' })) }, null, 2);
}
