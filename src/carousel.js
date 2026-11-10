// Same renderer for preview and export: no HTML screenshot or external fonts required.
export function renderSlide(canvas, slide, index, total, image = null) {
  canvas.width = 1080;
  canvas.height = 1350;
  const c = canvas.getContext("2d");
  c.fillStyle = "#101a18";
  c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = "#b8d4b2";
  c.fillRect(72, 92, 48, 5);
  c.font = "24px sans-serif";
  c.fillText("JISTO ACADEMY / 嘉思學院", 142, 105);
  c.strokeStyle = "#34443c";
  c.beginPath();
  c.moveTo(72, 1186);
  c.lineTo(1008, 1186);
  c.stroke();
  const issues = [];
  function lines(text, size, weight = 400) {
    c.font = `${weight} ${size}px sans-serif`;
    const out = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const ch of [...paragraph]) {
        if (c.measureText(line + ch).width > 936) {
          out.push(line);
          line = ch;
        } else line += ch;
      }
      out.push(line);
    }
    return out;
  }
  let y = slide.layout === "cover" ? 285 : 230;
  const titleSize = slide.layout === "cover" ? 82 : 68;
  c.fillStyle = "#edf2e8";
  c.font = `600 ${titleSize}px sans-serif`;
  const heading = lines(slide.title, titleSize, 600);
  c.font = `600 ${titleSize}px sans-serif`;
  for (const line of heading) {
    c.fillText(line, 72, y);
    y += titleSize * 1.4;
  }
  y += 50;
  if (slide.layout === "comparison" || slide.layout === "checklist") {
    c.fillStyle = "#263c2e";
    c.fillRect(
      56,
      y - 40,
      968,
      Math.min(640, Math.max(120, slide.body.split("\n").length * 70)),
    );
  }
  c.fillStyle = "#c3d0c6";
  const body = lines(slide.body, 38);
  c.font = "38px sans-serif";
  for (const line of body) {
    c.fillText(line, 72, y);
    y += 60;
  }
  if (image) {
    if (y > 780) issues.push(`第 ${index + 1} 頁文字與圖片重疊，請縮短文字。`);
    const scale = Math.max(936 / image.width, 320 / image.height),
      dw = image.width * scale,
      dh = image.height * scale;
    c.save();
    c.beginPath();
    c.rect(72, 820, 936, 320);
    c.clip();
    c.drawImage(
      image,
      72 - (dw - 936) / 2,
      820 - (dh - 320) * (slide.image.position ?? 0.5),
      dw,
      dh,
    );
    c.restore();
  }
  if (y > 1140) issues.push(`第 ${index + 1} 頁文字過多，請縮短或拆頁。`);
  if (!slide.title.trim()) issues.push(`第 ${index + 1} 頁缺少標題。`);
  c.fillStyle = "#b8d4b2";
  c.font = "25px sans-serif";
  c.fillText(
    slide.layout === "closing"
      ? "看到 → 想到 → 做到"
      : "好點子，不只想想而已。",
    72,
    1245,
  );
  c.textAlign = "right";
  c.fillText(
    `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    1008,
    1245,
  );
  c.textAlign = "left";
  return issues;
}
export async function loadSlideImage(slide) {
  if (!slide.image?.data) return null;
  const img = new Image();
  img.src = slide.image.data;
  await img.decode();
  return img;
}
export async function prepareImage(file) {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 10000000)
    throw Error("請選擇 10 MB 內 PNG 或 JPEG。");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL("image/jpeg", 0.8);
  if (data.length > 1300000) throw Error("圖片仍過大，請先壓縮。");
  return {
    data,
    position: 0.5,
    alt: file.name,
    credit: "使用者提供，發布前確認使用權",
  };
}
const enc = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipFiles(files) {
  const parts = [],
    central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name),
      b = typeof data === "string" ? enc.encode(data) : data,
      crc = crc32(b);
    const h = new Uint8Array(30 + n.length),
      v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, b.length, true);
    v.setUint32(22, b.length, true);
    v.setUint16(26, n.length, true);
    h.set(n, 30);
    parts.push(h, b);
    const ch = new Uint8Array(46 + n.length),
      cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, b.length, true);
    cv.setUint32(24, b.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    ch.set(n, 46);
    central.push(ch);
    offset += h.length + b.length;
  }
  const size = central.reduce((s, x) => s + x.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
export function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportCarousel(work) {
  await document.fonts.ready;
  const files = [],
    issues = [];
  for (const [i, slide] of work.slides.entries()) {
    const canvas = document.createElement("canvas");
    issues.push(
      ...renderSlide(
        canvas,
        slide,
        i,
        work.slides.length,
        await loadSlideImage(slide),
      ),
    );
    if (issues.length) throw Error(issues.join("\n"));
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw Error("圖片輸出失敗，請重試。");
    files.push([
      `${String(i + 1).padStart(2, "0")}.png`,
      new Uint8Array(await blob.arrayBuffer()),
    ]);
  }
  for (const k of ["master", "threads", "instagram"])
    files.push([k + ".md", work.articles[k].body]);
  files.push([
    "manifest.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        workId: work.id,
        version: work.version,
        title: work.title,
        slides: work.slides,
        articles: work.articles,
        sources: work.sources,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  ]);
  saveBlob(work.id + `-v${work.version}.zip`, zipFiles(files));
}
