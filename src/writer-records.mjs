export const writingLabels = {
  post: "貼文",
  carousel: "輪播",
  "press-release": "新聞稿",
  general: "其他文字",
};
export function readableCopy(raw) {
  let copy;
  try {
    copy = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {}
  if (
    copy &&
    Array.isArray(copy.slides) &&
    copy.slides.length > 0 &&
    copy.slides.every(
      (s) => typeof s.title === "string" && typeof s.body === "string",
    )
  ) {
    return {
      title: typeof copy.title === "string" ? copy.title : "",
      type: "carousel",
      text: [
        copy.title ? `# ${copy.title}` : "",
        ...copy.slides.map(
          (s, i) => `## 第 ${i + 1} 頁｜${s.title}\n\n${s.body}`,
        ),
        typeof copy.caption === "string"
          ? `## 貼文文案\n\n${copy.caption}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  if (copy && typeof copy === "object") {
    const body =
      typeof copy.content === "string"
        ? copy.content
        : typeof copy.body === "string"
          ? copy.body
          : typeof copy.caption === "string"
            ? copy.caption
            : null;
    if (body)
      return {
        title: typeof copy.title === "string" ? copy.title : "",
        type: null,
        text: [typeof copy.title === "string" ? `# ${copy.title}` : "", body]
          .filter(Boolean)
          .join("\n\n"),
      };
  }
  return { title: "", type: null, text: raw };
}
export function writerRecords(runs, role) {
  return runs
    .flatMap((run) => {
      const steps = (run.steps || []).filter(
        (s) =>
          s.role === role &&
          s.status === "completed" &&
          typeof s.output === "string" &&
          s.output.trim(),
      );
      return steps.map((s, i) => {
        const copy = readableCopy(s.output);
        return {
          ...s,
          runId: run.id,
          request: run.text,
          runStatus: run.status,
          origin: run.role === role ? "直接需求" : "總監／合作任務",
          createdAt: s.finishedAt || run.createdAt,
          version: i + 1,
          versionCount: steps.length,
          type: copy.type || s.writingProfile?.type || "general",
          title:
            s.name ||
            copy.title ||
            run.text?.replace(/\s+/g, " ").slice(0, 70) ||
            "未命名文案",
          text: copy.text,
        };
      });
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function groupWriterRecords(records) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.runId))
      groups.set(record.runId, { id: record.runId, items: [] });
    groups.get(record.runId).items.push(record);
  }
  return [...groups.values()].map((group) => {
    group.items.sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
    const latest = group.items[0];
    const headings = [
      ...latest.text.matchAll(
        /^## 第[一二三四五六七八九十\d]+篇[｜|]([^\n]+)/gm,
      ),
    ].map((m) => m[1].trim());
    return {
      ...group,
      title:
        latest.name ||
        (headings.length > 1
          ? `文案批次｜${headings[0]}等 ${headings.length} 篇`
          : latest.title),
      pending: /待補|待查核|待補證/.test(latest.text),
    };
  });
}
