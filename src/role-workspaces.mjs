export const roleNames = { director:'專案總覽', social:'社群管理', analyst:'成效洞察', designer:'設計工作區', writer:'內容協同', research:'趨勢觀察', video:'影片製作' };
export function roleData(project, role) { return project?.roleData?.[role] || {}; }
export function numericMetric(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw Error('數據須為非負整數。');
  return number;
}
export function summarizeMetrics(rows) {
  const sum = key => { const known = rows.filter(r => r[key] != null); return known.length ? known.reduce((total,r) => total+r[key],0) : null; };
  return { views:sum('views'), comments:sum('comments'), count:rows.length };
}
export function roleSummary(project, role) {
  const data = roleData(project,role);
  if (role === 'social') return `社群管理回報\n${(data.inbox || []).length} 筆手動收錄互動\n${data.note || '尚未填寫經營摘要。'}\n回覆與 Bio 仍為草稿，未送出平台。`;
  if (role === 'analyst') return `成效回顧\n${(data.metrics || []).length} 筆手動輸入資料\n${data.insight || '尚未填寫洞察。'}\n${data.next || ''}`;
  if (role === 'designer') return `視覺提案\n風格：${data.style || '未設定'}\n${data.brief || '尚未填寫製圖說明。'}\n${(data.assets || []).length} 份參考圖；不代表已產出成品。`;
  if (role === 'writer') return `內容稿件\n${data.title || '未命名草稿'}\n${data.content || '尚無正文。'}\n貼文文案：${data.caption || '未填寫'}\n檢查重點：${data.checks || '未設定'}`;
  if (role === 'research') return `趨勢觀察\n${(data.sources || []).length} 個追蹤來源（尚未自動爬取）\n${data.observation || '尚未填寫觀察。'}\n依據：${data.evidence || '未提供'}\n對品牌的意義：${data.implication || '未填寫'}`;
  return '';
}
