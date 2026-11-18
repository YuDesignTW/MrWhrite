// Explicit, deterministic showcase fixtures. Never merged into live provider data.
export const DEMO_TODAY = "2026-11-13";
export const demoAccounts = [
  {
    id: "ig-example",
    platform: "Instagram",
    handle: "@example.studio",
    name: "EXAMPLE 設計觀點",
    status: "已連線",
    color: "#d879ab",
    days: [1, 3, 5],
  },
  {
    id: "ig-white",
    platform: "Instagram",
    handle: "@example.creator",
    name: "懷特先生",
    status: "已連線",
    color: "#bf9eea",
    days: [2, 6],
  },
  {
    id: "threads-example",
    platform: "Threads",
    handle: "@example.studio",
    name: "EXAMPLE 日常筆記",
    status: "已連線",
    color: "#d9d9d9",
    days: [1, 2, 3, 4, 5],
  },
  {
    id: "linkedin-example",
    platform: "LinkedIn",
    handle: "EXAMPLE Studio",
    name: "品牌與商業設計",
    status: "待重新授權",
    color: "#71a9e8",
    days: [2, 4],
  },
];
export const activeAccount = (project) =>
  demoAccounts.find(
    (a) => a.id === project.roleData?.social?.showcaseAccount,
  ) || demoAccounts[0];
export function demoCalendar(accountId) {
  const account =
    demoAccounts.find((a) => a.id === accountId) || demoAccounts[0];
  const accountIndex = demoAccounts.indexOf(account);
  const topics = [
    "讓人記住的品牌，不只是一個 Logo",
    "設計師的日常觀察",
    "好設計如何改變一件小事",
    "本週靈感：留白與節奏",
    "從包裝看品牌個性",
    "一個品牌故事，三個設計選擇",
  ];
  return Array.from({ length: 98 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 7, 24 + i)).toISOString().slice(0, 10);
    const weekday = (i + 1) % 7;
    const count = account.days.includes(weekday)
      ? i % 13 === accountIndex
        ? 2
        : 1
      : 0;
    return {
      date,
      posts: Array.from({ length: count }, (_, j) => ({
        id: `${account.id}:${date}:${j}`,
        date,
        time: j ? "20:00" : "12:30",
        title: topics[(i + accountIndex + j) % topics.length],
        status: date > DEMO_TODAY ? "已排程" : "已發佈",
        format: account.platform === "Instagram" ? "圖文輪播" : "文字貼文",
      })),
    };
  });
}
export const demoVideos = [
  {
    id: "v1",
    title: "設計不是裝飾，是一種選擇",
    date: "11/13",
    views: 13200,
    likes: 892,
    comments: 64,
    saves: 317,
    image: "/ig-backgrounds/graphic-cover.png",
  },
  {
    id: "v2",
    title: "你每天用的物品，藏著什麼設計？",
    date: "11/11",
    views: 9800,
    likes: 621,
    comments: 43,
    saves: 246,
    image: "/ig-backgrounds/street-content.png",
  },
  {
    id: "v3",
    title: "一個好品牌，如何找到自己的聲音",
    date: "11/09",
    views: 8700,
    likes: 518,
    comments: 38,
    saves: 185,
    image: "/ig-backgrounds/surreal-cover.png",
  },
  {
    id: "v4",
    title: "少一點，剛剛好",
    date: "11/07",
    views: 6100,
    likes: 376,
    comments: 21,
    saves: 129,
    image: "/ig-backgrounds/graphic-content.png",
  },
];
export const demoDaily = [3800, 4200, 5100, 4600, 6200, 5800, 8100];
export const demoInsights = [
  {
    title: "故事型開場帶來更多停留",
    text: "以具體物品或人物切入的內容，觀看與收藏表現較突出。下一輪延續「一個物品，一個故事」。",
    tag: "內容方向",
  },
  {
    title: "把收藏價值放在結尾",
    text: "設計拆解與可帶走的觀點，比單純展示畫面更容易被收藏。建議結尾整理一個可實踐的觀察。",
    tag: "優化建議",
  },
  {
    title: "測試午間與晚間的差異",
    text: "下週以相近主題測試 12:30 與 20:00，先比較收藏率，再決定是否調整發布時段。",
    tag: "下一步實驗",
  },
];
const output = (id, name, kind, status, image, content) => ({
  id,
  name,
  kind,
  status,
  image,
  content,
  demo: true,
  date: "2026-11-13",
  deleted: false,
});
export const designFiles = [
  output(
    "design-1",
    "品牌故事・封面提案.png",
    "image",
    "進行中",
    "/ig-backgrounds/graphic-cover.png",
    "",
  ),
  output(
    "design-2",
    "街頭觀察・輪播內頁.png",
    "image",
    "已完成",
    "/ig-backgrounds/street-content.png",
    "",
  ),
  output(
    "design-3",
    "靈感實驗・主視覺.png",
    "image",
    "已完成",
    "/ig-backgrounds/surreal-cover.png",
    "",
  ),
  output(
    "design-4",
    "編輯版型・結尾頁.png",
    "image",
    "已完成",
    "/ig-backgrounds/graphic-closing.png",
    "",
  ),
  output(
    "design-5",
    "十一月視覺提案.md",
    "document",
    "進行中",
    null,
    "# 十一月視覺提案\n\n示範文件\n\n以黑、米白與少量紅色建立編輯感。封面保留清楚主標，內頁以圖片與短段落交錯。",
  ),
  output(
    "design-6",
    "品牌視覺規範.md",
    "document",
    "已完成",
    null,
    "# 品牌視覺規範\n\n示範文件\n\n字體：Noto Sans TC\n色票：炭黑、米白、訊號紅\n圖片：保留主體，避免過度裝飾。",
  ),
];
export const writingFiles = [
  output(
    "writing-1",
    "讓人記住的品牌.md",
    "document",
    "進行中",
    null,
    "# 讓人記住的品牌\n\n示範草稿\n\n讓人記住的品牌，往往先解決了一個具體問題。從那個問題開始，才看得見設計為什麼長成今天的樣子。",
  ),
  output(
    "writing-2",
    "好設計，藏在日常裡.md",
    "document",
    "已完成",
    null,
    "# 好設計，藏在日常裡\n\n示範內容\n\n下次拿起一件常用物品，試著注意它讓你少做了哪一個動作。那些不需要解釋的細節，可能就是設計最好的地方。",
  ),
  output(
    "writing-3",
    "Threads・本週觀點.md",
    "document",
    "已完成",
    null,
    "# 本週觀點\n\n示範內容\n\n品牌的個性，不只在它說了什麼，也在它選擇不說什麼。",
  ),
  output(
    "writing-4",
    "十一月內容提案.md",
    "document",
    "進行中",
    null,
    "# 十一月內容提案\n\n示範企劃\n\n1. 日常物品的設計故事\n2. 品牌改變的關鍵選擇\n3. 一週一個設計觀察",
  ),
];
export function showcaseFiles(project, role) {
  return (
    project.roleData?.[role]?.showcaseFiles ??
    (role === "designer" ? designFiles : writingFiles)
  );
}
export function updateShowcaseFile(files, id, patch) {
  return files.map((f) => (f.id === id ? { ...f, ...patch } : f));
}
export const demoTrends = [
  {
    id: "t1",
    topic: "品牌開始說「小故事」",
    category: "內容敘事",
    heat: 92,
    change: "+24%",
    sources: "設計媒體 · 社群討論",
    description:
      "日常物品、創辦人的一個決定、產品背後的細節，成為更容易延伸討論的內容入口。",
    action: "適合發展成 5–6 頁的品牌故事輪播。",
  },
  {
    id: "t2",
    topic: "低修飾、真實感的視覺回來了",
    category: "視覺設計",
    heat: 86,
    change: "+18%",
    sources: "視覺靈感站 · 創作者社群",
    description: "自然光、材質細節與較少的修飾，形成與高度加工畫面的對比。",
    action: "在下週的圖片板加入材質與自然光參考。",
  },
  {
    id: "t3",
    topic: "從「教學」走向「有立場的觀察」",
    category: "社群話題",
    heat: 79,
    change: "+15%",
    sources: "Threads · 設計討論",
    description: "可被回應的個人判斷，比抽象的大道理更容易引出對話。",
    action: "用一個具體例子加一個觀點，測試短文互動。",
  },
  {
    id: "t4",
    topic: "讓過程成為內容的一部分",
    category: "創作方式",
    heat: 71,
    change: "+9%",
    sources: "創作者日誌 · 工作室網站",
    description: "草稿、取捨與被放棄的版本，提供成品之外的閱讀價值。",
    action: "從已完成的設計中整理一次前後對照。",
  },
];
