import { openDB } from "idb";
import { api } from "./api";
let database;
const db = () =>
  (database ||= openDB("mrwhite-team-files-v1", 1, {
    upgrade(d) {
      d.createObjectStore("files");
    },
  }));
const base = (t, p) => `/teams/${t}/projects/${p}`;
async function upload(teamId, projectId, file, id) {
  if (file.size > 20 * 1024 * 1024) throw Error("單一檔案上限20 MB。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = "";
  for (let i = 0; i < bytes.length; i += 32768)
    raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const r = await api(base(teamId, projectId) + "/files", "POST", {
    id,
    name: file.name || id,
    mime: file.type,
    base64: btoa(raw),
  });
  return {
    id: r.fileId,
    name: r.name,
    size: r.size,
    mime: r.mime,
    kind: "file",
    storage: "local",
    createdAt: r.createdAt,
  };
}
export async function saveFile(t, p, file) {
  return upload(t, p, file, crypto.randomUUID());
}
export async function readFile(t, p, id) {
  await api("/team-activity");
  const r = await fetch("/api" + base(t, p) + `/files/${id}/content`);
  if (!r.ok) throw Error("本機找不到原始檔案；請檢查舊檔遷移狀態。");
  return r.blob();
}
export async function downloadFile(t, p, resource) {
  const blob = await readFile(t, p, resource.id);
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = resource.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function migrateBrowserFiles(state) {
  const missing = [];
  let migrated = 0;
  for (const t of state.teams)
    for (const p of t.projects) {
      const existing = new Set(
        (await api(base(t.id, p.id) + "/knowledge")).resources
          .filter((r) => r.kind === "file" && r.storage === "local")
          .map((r) => r.id),
      );
      const refs = [
        ...p.resources.filter((r) => r.kind === "file"),
        ...(p.roleData?.designer?.showcaseFiles || []).filter(
          (r) => r.blob && !r.demo,
        ),
      ];
      for (const ref of refs) {
        if (existing.has(ref.id)) continue;
        const old = await (
          await db()
        ).get("files", `${t.id}:${p.id}:${ref.id}`);
        if (!old) {
          missing.push(ref.name);
          continue;
        }
        await upload(t.id, p.id, old, ref.id);
        existing.add(ref.id);
        migrated++;
      }
    }
  return { migrated, missing };
}
