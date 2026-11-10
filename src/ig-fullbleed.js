import { igBackgroundPath } from "../shared/ig-design.mjs";
import { renderGraphicType } from "./ig-graphic.js";

const images = new Map();
export function loadIGBackground(design, index, total) {
  const path = igBackgroundPath(design, index, total);
  if (!path) return Promise.resolve(null);
  if (!images.has(path)) {
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        images.delete(path);
        reject(new Error("背景圖片載入失敗，請重試；尚未輸出圖片。"));
      };
      img.src = path;
    });
    images.set(path, promise);
  }
  return images.get(path);
}

export function renderFullBleed(c, slide, index, total, style, image) {
  if (!image) return ["背景圖片尚未載入，請稍候再下載。"];
  const issues = [];
  const iw = image.naturalWidth || image.width,
    ih = image.naturalHeight || image.height;
  const scale = Math.max(1080 / iw, 1350 / ih);
  c.drawImage(
    image,
    (1080 - iw * scale) / 2,
    (1350 - ih * scale) / 2,
    iw * scale,
    ih * scale,
  );
  if (style === "graphic") return renderGraphicType(c, slide, index, total);
  const street = style === "street",
    cover = index === 0,
    closing = index === total - 1;
  const white = "#fffcef",
    yellow = "#fff000";
  // Contrast overlays sit over actual imagery; they are not image substitutes.
  const wash = c.createLinearGradient(0, 0, 0, 1350);
  wash.addColorStop(0, "rgba(0,0,0,.28)");
  wash.addColorStop(0.42, "rgba(0,0,0,.02)");
  wash.addColorStop(
    0.68,
    street && !cover && !closing ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.22)",
  );
  wash.addColorStop(1, "rgba(0,0,0,.78)");
  c.fillStyle = wash;
  c.fillRect(0, 0, 1080, 1350);
  if (cover && street) {
    const side = c.createLinearGradient(0, 0, 1080, 0);
    side.addColorStop(0, "rgba(0,0,0,.42)");
    side.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = side;
    c.fillRect(0, 0, 1080, 1350);
  }
  c.textBaseline = "top";
  c.textAlign = "left";
  const font = (size, weight = 800) =>
    (c.font = `${weight} ${size}px "PingFang TC", "Noto Sans CJK TC", sans-serif`);
  function wrap(value, width, size, weight) {
    font(size, weight);
    return String(value)
      .split("\n")
      .flatMap((paragraph) => {
        const lines = [];
        let line = "";
        for (const char of paragraph) {
          if (line && c.measureText(line + char).width > width) {
            lines.push(line);
            line = char;
          } else line += char;
        }
        lines.push(line);
        return lines;
      });
  }
  function text(
    value,
    x,
    y,
    width,
    height,
    max,
    min,
    color,
    weight = 800,
    bottom = false,
  ) {
    let size = max,
      lines;
    while (size >= min) {
      lines = wrap(value, width, size, weight);
      if (lines.length * size * 1.25 <= height) break;
      size -= 2;
    }
    if (size < min) {
      size = min;
      lines = wrap(value, width, size, weight);
      issues.push(`第 ${index + 1} 頁文字過多，請縮短內容再下載。`);
    }
    c.save();
    c.beginPath();
    c.rect(x, y, width, height);
    c.clip();
    font(size, weight);
    c.fillStyle = color;
    const top = bottom
      ? y + Math.max(0, height - lines.length * size * 1.25)
      : y;
    lines.forEach((line, i) => {
      const lineY = top + i * size * 1.25;
      if (weight >= 800) {
        c.strokeStyle = color;
        c.lineWidth = size * 0.012;
        c.lineJoin = "round";
        c.strokeText(line, x, lineY);
      }
      c.fillText(line, x, lineY);
    });
    c.restore();
  }
  font(24, 800);
  c.fillStyle = white;
  c.fillText("JISTO / CREATIVE LAB", 64, 52);
  if (cover) {
    text(
      slide.title,
      64,
      street ? 310 : 165,
      street ? 920 : 850,
      street ? 620 : 470,
      street ? 142 : 108,
      64,
      street ? yellow : white,
      900,
    );
    text(slide.body, 64, 1030, 940, 190, 44, 30, white, 600, true);
  } else if (closing) {
    if (street) {
      font(28, 900);
      c.fillStyle = yellow;
      c.fillText("MAKE IT HAPPEN", 64, 135);
    }
    text(slide.title, 64, street ? 205 : 160, 940, 350, 96, 56, white, 900);
    text(slide.body, 64, 960, 940, 260, 44, 30, white, 600, true);
  } else {
    if (street) {
      font(190, 900);
      c.fillStyle = yellow;
      c.fillText(String(index).padStart(2, "0"), 64, 130);
      text(slide.title, 64, 735, 940, 220, 78, 46, white, 900);
    } else {
      text(slide.title, 64, 155, 940, 300, 90, 52, white, 900);
    }
    text(
      slide.body,
      64,
      970,
      940,
      250,
      44,
      30,
      street ? yellow : white,
      600,
      true,
    );
  }
  font(23, 700);
  c.fillStyle = white;
  c.textAlign = "right";
  c.fillText(
    `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    1016,
    1270,
  );
  c.textAlign = "left";
  return issues;
}
