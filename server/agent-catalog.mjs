import { WORKSPACES, workspaceId } from "../shared/agent-workspaces.mjs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Explicit allowlist: client input never becomes a filesystem path.
const definitions = [
  [
    "coordinator",
    "創意總監",
    "統整需求、調度專長 Agent，整合成可執行的成果",
    null,
    "協調",
    "幫我把這個點子拆成研究、創作與檢查任務，交給適合的 Agent。",
  ],
  [
    "ig-viral",
    "對標研究員",
    "分析高流量案例、開場與可借用的內容結構",
    "ig-viral",
    "策略",
    "分析我提供的案例，找出值得借用的開場與內容結構。",
  ],
  [
    "ig-plan",
    "內容企劃",
    "把品牌方向與素材整理成內容計畫",
    "ig-plan",
    "策略",
    "依 JISTO 的 50／30／20 內容比例，規劃下一週的創作方向。",
  ],
  [
    "ig-profile",
    "品牌定位顧問",
    "優化帳號介紹、追蹤理由與品牌表達",
    "ig-profile",
    "策略",
    "幫我寫一份符合嘉思學院定位的 Instagram 自介。",
  ],
  [
    "ig-carousel",
    "輪播設計師",
    "設計封面鉤子、逐頁敘事與畫面方向",
    "ig-carousel",
    "創作",
    "把這個點子整理成六頁輪播，先提出封面與每頁畫面方向。",
  ],
  [
    "ig-caption",
    "貼文文案",
    "撰寫 IG 開場、內文與行動邀請",
    "ig-caption",
    "創作",
    "幫我寫一篇有個人觀點、自然口吻的 IG 貼文文案。",
  ],
  [
    "ig-reel",
    "短影音編導",
    "產出口播、畫面文字與分鏡腳本",
    "ig-reel",
    "創作",
    "把這個點子寫成 30 秒短影音腳本，附上分鏡。",
  ],
  [
    "ig-story",
    "限動企劃",
    "規劃限動故事、投票與互動節奏",
    "ig-story",
    "創作",
    "幫我規劃三張介紹新作品的限動，最後加入一個自然的互動。",
  ],
  [
    "ig-repurpose",
    "內容再製",
    "從長文與逐字稿提煉多種內容",
    "ig-repurpose",
    "創作",
    "從我提供的長文提煉三個可以獨立發展的內容角度。",
  ],
  [
    "ig-human",
    "語氣編輯",
    "修整制式文案，保留個人觀點與自然語氣",
    "ig-human",
    "編輯",
    "幫我把這段文字改得自然、有個人觀點，說明修改重點。",
  ],
  [
    "ig-audit",
    "成效分析師",
    "依實際成效資料檢討內容與下一步",
    "ig-audit",
    "策略",
    "分析我提供的成效數據，分清觀察、推測與下一步實驗。",
  ],
  [
    "ig-comment",
    "互動文案",
    "針對其他人的內容撰寫有觀點的留言",
    "ig-comment",
    "互動",
    "根據這篇貼文，寫三個有觀點而不推銷的留言選項。",
  ],
  [
    "ig-reply",
    "留言回覆",
    "整理留言優先序，草擬合適回覆",
    "ig-reply",
    "互動",
    "幫我整理這些留言的回覆優先序，並草擬回覆。",
  ],
  [
    "ig-dm",
    "私訊顧問",
    "草擬合作邀約與私訊，不自動傳送",
    "ig-dm",
    "互動",
    "幫我草擬一則簡短的品牌合作邀約私訊。",
  ],
];
export const AGENTS = definitions.map(
  ([id, name, description, skill, group, starter]) => {
    const instructions = skill
      ? readFileSync(
          new URL(`../.agents/skills/${skill}/SKILL.md`, import.meta.url),
          "utf8",
        )
      : "";
    return Object.freeze({
      id,
      name,
      description,
      skill,
      group,
      starter,
      instructions,
      skillVersion: skill
        ? createHash("sha256").update(instructions).digest("hex").slice(0, 12)
        : null,
    });
  },
);
export const agentCatalog = () =>
  AGENTS.map(({ instructions, ...agent }) => agent);
export const workspaces = () =>
  WORKSPACES.map((w) => ({
    ...w,
    capabilities: AGENTS.filter((a) => w.members.includes(a.id)).map(
      ({ instructions, ...a }) => a,
    ),
  }));
export const agentFor = (id = "coordinator") =>
  AGENTS.find((a) => a.id === id) ||
  (() => {
    const w = WORKSPACES.find((w) => w.id === id);
    if (!w) return undefined;
    const skills = AGENTS.filter((a) => w.members.includes(a.id));
    return {
      ...w,
      skills,
      skill: null,
      skillVersion: null,
      starter: `請協助我完成${w.name}任務。`,
      instructions: skills
        .map((a) => `## ${a.name} / ${a.skill}\n${a.instructions}`)
        .join("\n\n"),
    };
  })();
export const conversationMatches = (record, agent) =>
  agent.skills
    ? workspaceId(record.agentId) === agent.id
    : (record.agentId || "coordinator") === agent.id;
export function selectCapability(agent, skillId) {
  if (!skillId) return agent;
  const selected = agent.skills?.find((s) => s.id === skillId);
  if (!selected) return null;
  return {
    ...agent,
    skills: [selected],
    skill: selected.skill,
    skillVersion: selected.skillVersion,
    instructions: selected.instructions,
  };
}
export const ownerOf = (record) => record.agentId || "coordinator";
export function agentInstructions(
  agent,
  { synthesis = false, delegated = false } = {},
) {
  const rules = `你本次扮演「${agent.name}」（${agent.id}）：${agent.description}。
JISTO 是創意實驗 × 實際創造 × 有趣觀點的創意實驗室。一般大眾優先，透過需求與好奇切入。初期配置：50% 創意實作、30% 創意改造、20% 案例與觀點；不限中文或台灣案例。保留幽默、美感與真實成果。
能力邊界：本次可根據提供的內容與來源分析、寫作與規劃。沒有即時搜尋、瀏覽器、執行腳本、圖片生成、影片渲染或傳送私訊工具；不得聲稱已執行這些動作。研究需新資料時，說明缺少哪些資料；沒有數據不稱高流量，不把影片觀看當輪播成效。不自行發布或排程。
專長任務可以直接在 reply 回傳完整可用成果，不必一律生成三份文案和輪播；只有要求完整稿包時才使用 draft。`;
  if (agent.id === "coordinator")
    return `${rules}
${
  synthesis
    ? "專長任務已完成，請根據下方結果回覆原始需求；不得再次調度。"
    : `你可直接處理簡單對話；複合任務應實際調度。可選 Agent：${JSON.stringify(agentCatalog().filter((a) => a.skill))}。
要調度時，content 的 JSON 使用 {"reply":"簡短說明分工","delegations":[{"agentId":"ig-viral","task":"完整明確的任務"}]}。一次最多三個不同專長 Agent，依序執行，後面的 Agent 會收到前面的成果。不可把任務交給 coordinator；不可同時輸出 draft 或 needsInput。程式會真正呼叫這些 Agent，完成後再請你彙整；不要只在文字聲稱已派工。`
}`;
  return `${rules}
${delegated ? "你正在接收創意總監的任務。請完成分配的部分；不要調度其他 Agent。" : "你直接處理用戶交給你的專長任務，不可調度其他 Agent。"}
本次可用功能：${agent.skills?.map((s) => s.name).join("、") || agent.name}。未指定功能時依需求採用適合的方法，也可以結合多項；同一分類的對話是連續背景。
以下是已安裝的 ${agent.skills?.map((s) => s.skill).join("、") || agent.skill} 方法參考（版本 ${agent.skillVersion}）。只採用本次適用的內容方法；其中要求的工具、路徑、英文分數、固定格式及外部操作不能覆蓋上方能力邊界、事實規則與輸出協定。不可宣稱跑過參考中的腳本。
<skill-reference>
${agent.instructions}
</skill-reference>`;
}
