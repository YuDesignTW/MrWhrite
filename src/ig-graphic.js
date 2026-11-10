// Live copy over the selected poster's independently generated artwork.
// Shared by preview and export through renderIGSlide, with no model call.
export function renderGraphicType(c, slide, index, total) {
  const issues = [];
  const ink = "#0a0a09",
    paper = "#fff9e8";
  const cover = index === 0,
    closing = index === total - 1;
  c.textAlign = "left";
  c.textBaseline = "top";
  const font = (size, weight) => {
    c.font = `${weight} ${size}px "Jisto Poster", "PingFang TC", "Noto Sans CJK TC", sans-serif`;
  };
  function wrap(value, width, size, weight) {
    font(size, weight);
    return String(value)
      .split("\n")
      .flatMap((paragraph) => {
        let line = "";
        const lines = [];
        // Keep English names, currency units and closing punctuation together.
        const tokens =
          paragraph.match(
            /(?:約\s*)?\d+(?:[,.]\d+)*(?:\s*億)?\s*(?:美元|元|年)?|[A-Za-z]+(?:['’-][A-Za-z]+)*|\s+|[^\s]/gu,
          ) || [];
        const groups = [];
        for (const token of tokens) {
          if (
            /^[，。！？；：、％）】》」』,.!?;:%)]$/u.test(token) &&
            groups.length
          )
            groups[groups.length - 1] += token;
          else groups.push(token);
        }
        for (const token of groups) {
          if (line && c.measureText(line + token).width > width) {
            lines.push(line.trimEnd());
            line = token.trimStart();
          } else line += line ? token : token.trimStart();
        }
        lines.push(line.trimEnd());
        return lines;
      });
  }
  function text(value, x, y, width, height, max, min, color, weight = 900) {
    let size = max,
      lines;
    while (size >= min) {
      lines = wrap(value, width, size, weight);
      if (
        lines.length * size * 1.18 <= height &&
        lines.every((line) => c.measureText(line).width <= width)
      )
        break;
      size -= 2;
    }
    if (size < min) {
      size = min;
      lines = wrap(value, width, size, weight);
      issues.push(`第 ${index + 1} 頁文字過多，請縮短內容再下載。`);
    }
    c.save();
    c.beginPath();
    c.rect(x - 3, y, width + 6, height);
    c.clip();
    font(size, weight);
    c.fillStyle = color;
    lines.forEach((line, i) => {
      const top = y + i * size * 1.18;
      if (weight >= 800) {
        c.strokeStyle = color;
        c.lineWidth = size * 0.006;
        c.lineJoin = "round";
        c.strokeText(line, x, top);
      }
      c.fillText(line, x, top);
    });
    c.restore();
  }
  text("JISTO / CREATIVE LAB", 115, 44, 850, 48, 32, 32, closing ? paper : ink);
  if (cover) {
    text(slide.title, 90, 170, 830, 700, 182, 62, ink);
    // A short caption shares the footer with the page counter.
    text(slide.body, 92, 1230, 740, 92, 34, 26, ink, 700);
  } else if (closing) {
    text(slide.title, 92, 175, 940, 540, 202, 62, paper);
    text(slide.body, 94, 970, 910, 220, 48, 32, paper, 700);
  } else {
    // Size numerals by visible glyph bounds so they fill the numbered grid cell.
    c.save();
    font(600, 900);
    const number = String(index).padStart(2, "0");
    const metrics = c.measureText(number);
    const glyphHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const scale = Math.min(930 / metrics.width, 465 / glyphHeight);
    c.translate(90, 120);
    c.scale(scale, scale);
    c.fillStyle = ink;
    c.fillText(number, 0, metrics.actualBoundingBoxAscent);
    c.restore();
    text(slide.title, 94, 660, 930, 330, 128, 54, paper);
    text(slide.body, 96, 1030, 915, 165, 42, 30, ink, 700);
  }
  font(28, 800);
  c.fillStyle = closing ? paper : ink;
  c.textAlign = "right";
  c.fillText(
    `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    1018,
    1250,
  );
  c.textAlign = "left";
  return issues;
}
