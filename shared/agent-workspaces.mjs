// Shared presentation and conversation grouping; no data is rewritten.
export const WORKSPACES = [
  {
    id: "coordinator",
    name: "創意總監",
    description: "統整目標，安排團隊分工",
    icon: "Sparkle",
    members: [],
  },
  {
    id: "strategy",
    name: "策略",
    description: "對標研究、定位、企劃與成效",
    icon: "Compass",
    members: ["ig-viral", "ig-plan", "ig-profile", "ig-audit"],
  },
  {
    id: "creation",
    name: "創作",
    description: "輪播、文案、短影音與內容再製",
    icon: "PaintBrush",
    members: [
      "ig-carousel",
      "ig-caption",
      "ig-reel",
      "ig-story",
      "ig-repurpose",
    ],
  },
  {
    id: "editing",
    name: "編輯",
    description: "修整語氣，讓觀點清楚自然",
    icon: "PencilLine",
    members: ["ig-human"],
  },
  {
    id: "engagement",
    name: "互動",
    description: "留言、回覆與合作私訊",
    icon: "ChatsCircle",
    members: ["ig-comment", "ig-reply", "ig-dm"],
  },
];
export const workspaceId = (id) =>
  WORKSPACES.find((w) => w.id === id || w.members.includes(id))?.id ||
  "coordinator";
