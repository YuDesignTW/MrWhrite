export const IG_THEMES = ["paper", "cobalt", "citrus", "ink"];
export const IG_STYLES = [
  { id: "typographic", name: "原有文字版", description: "保留既有配色與版型" },
  {
    id: "graphic",
    name: "平面海報",
    description: "紅黑米白・大字網格與步驟編號",
  },
  {
    id: "surreal",
    name: "巨物靈感實驗",
    description: "藍黃超現實場景・滿版物件攝影",
  },
  {
    id: "street",
    name: "街頭編輯特刊",
    description: "黑白街頭攝影・螢光黃雜誌大字",
  },
];
export function igBackgroundPath(design, index, total) {
  if (!["surreal", "street", "graphic"].includes(design?.style)) return null;
  const role =
    index === 0 ? "cover" : index === total - 1 ? "closing" : "content";
  return `/ig-backgrounds/${design.style}-${role}.png`;
}
export const IG_LAYOUTS = [
  "cover",
  "editorial",
  "split",
  "statement",
  "checklist",
  "closing",
];
export function normalizeIGDesign(proposal) {
  return {
    ...proposal,
    design: {
      theme: proposal.design?.theme || "paper",
      ...(proposal.design?.style && proposal.design.style !== "typographic"
        ? { style: proposal.design.style }
        : {}),
    },
    slides: proposal.slides.map((s, i) => ({
      ...s,
      layout:
        s.layout ||
        (i === 0
          ? "cover"
          : i === proposal.slides.length - 1
            ? "closing"
            : "editorial"),
    })),
  };
}
export function igVisualSignature(proposal) {
  const p = normalizeIGDesign(proposal);
  // Asset-backed styles have fixed cover/interior/closing compositions.
  // Changing an unused typography layout token must not masquerade as redesign.
  if (["surreal", "street", "graphic"].includes(p.design.style))
    return JSON.stringify([p.design.style, p.slides.length]);
  return JSON.stringify([p.design, p.slides.map((s) => s.layout)]);
}
