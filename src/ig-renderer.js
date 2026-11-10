import { renderFullBleed } from "./ig-fullbleed.js";
// Preview and PNG export use this exact renderer, including the loaded background.
export function renderIGSlide(
  canvas,
  slide,
  index,
  total,
  design = {},
  backgroundImage = null,
) {
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext("2d");
  if (["surreal", "street", "graphic"].includes(design.style))
    return renderFullBleed(
      c,
      slide,
      index,
      total,
      design.style,
      backgroundImage,
    );
  const themes = {
    paper: ["#f6f1e7", "#20211f", "#ef542c", "#e7e0d3"],
    cobalt: ["#182eda", "#ffffff", "#d6f35b", "#1124b4"],
    citrus: ["#e5f562", "#1c2923", "#ffffff", "#d2e345"],
    ink: ["#1c2423", "#f7f1e7", "#ef7850", "#303c39"],
  };
  const [bg, ink, accent, soft] = themes[design.theme] || themes.paper;
  const issues = [];
  c.fillStyle = bg;
  c.fillRect(0, 0, 1080, 1350);
  c.textBaseline = "top";
  const font = (size, weight = 500) => {
    c.font = `${weight} ${size}px "PingFang TC", "Noto Sans CJK TC", sans-serif`;
  };
  function wrap(text, size, width, weight) {
    font(size, weight);
    const result = [];
    for (const paragraph of String(text).split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && c.measureText(line + char).width > width) {
          result.push(line);
          line = char;
        } else line += char;
      }
      result.push(line);
    }
    return result;
  }
  function text(value, x, y, width, height, start, min, color, weight = 500) {
    let size = start,
      lines;
    do {
      lines = wrap(value, size, width, weight);
      if (lines.length * size * 1.4 <= height) break;
      size -= 2;
    } while (size >= min);
    if (size < min) {
      size = min;
      lines = wrap(value, size, width, weight);
      issues.push(`第 ${index + 1} 頁文字過多，請縮短內容。`);
    }
    c.save();
    c.beginPath();
    c.rect(x, y, width, height);
    c.clip();
    font(size, weight);
    c.fillStyle = color;
    lines.forEach((line, i) => c.fillText(line, x, y + i * size * 1.4));
    c.restore();
  }
  const layout =
    slide.layout ||
    (index === 0 ? "cover" : index === total - 1 ? "closing" : "editorial");
  c.fillStyle = ink;
  font(23, 700);
  c.fillText("JISTO / CREATIVE LAB", 64, 54);
  c.fillStyle = ink;
  font(22);
  c.textAlign = "right";
  c.fillText(
    `${String(index + 1).padStart(2, "0")} — ${String(total).padStart(2, "0")}`,
    1016,
    54,
  );
  c.textAlign = "left";
  c.fillStyle = ink;
  c.fillRect(64, 105, 952, 2);
  if (layout === "cover") {
    c.fillStyle = accent;
    c.fillRect(64, 164, 150, 12);
    text(slide.title, 64, 230, 952, 490, 108, 64, ink, 800);
    c.fillStyle = soft;
    c.fillRect(64, 780, 952, 338);
    text(slide.body, 96, 818, 888, 260, 46, 32, ink);
  } else if (layout === "split") {
    text(slide.title, 64, 160, 952, 260, 76, 50, ink, 800);
    c.fillStyle = accent;
    c.fillRect(64, 478, 18, 650);
    text(slide.body, 120, 490, 870, 630, 52, 34, ink);
  } else if (layout === "statement") {
    c.fillStyle = soft;
    c.fillRect(0, 170, 1080, 600);
    text(slide.title, 64, 228, 952, 470, 104, 58, ink, 800);
    text(slide.body, 64, 836, 952, 310, 46, 32, ink);
  } else if (layout === "checklist") {
    text(slide.title, 64, 160, 952, 260, 76, 50, ink, 800);
    c.fillStyle = soft;
    c.fillRect(64, 462, 952, 690);
    text(slide.body, 100, 496, 880, 620, 48, 32, ink);
  } else if (layout === "closing") {
    c.fillStyle = accent;
    c.beginPath();
    c.arc(926, 280, 64, 0, Math.PI * 2);
    c.fill();
    text(slide.title, 64, 380, 952, 350, 94, 54, ink, 800);
    text(slide.body, 64, 814, 952, 320, 46, 32, ink);
  } else {
    c.fillStyle = accent;
    c.fillRect(64, 164, 62, 10);
    text(slide.title, 64, 230, 952, 300, 80, 50, ink, 800);
    text(slide.body, 64, 610, 952, 530, 52, 34, ink);
  }
  c.fillStyle = ink;
  c.fillRect(64, 1204, 952, 2);
  font(23, 600);
  c.fillText(
    index === total - 1 ? "把點子，變成現實。" : "好點子，不只想想而已。",
    64,
    1240,
  );
  c.textAlign = "right";
  c.fillText(index === total - 1 ? "JISTO ACADEMY" : "繼續看 →", 1016, 1240);
  c.textAlign = "left";
  return issues;
}
