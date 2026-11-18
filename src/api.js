import { openDB } from "idb";
let session;
export async function connect() {
  const r = await fetch("/api/session");
  if (!r.ok) throw Error("無法連接本機服務。");
  session = await r.json();
  return session;
}
export async function api(path, method = "GET", body, epoch, retry = true) {
  if (!session) await connect();
  const r = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": session.token,
      "X-Data-Epoch": epoch || session.epoch,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 401 && retry) {
    await connect();
    return api(path, method, body, epoch, false);
  }
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(Error(data.error || "操作失敗。"), {
      status: r.status,
      code: data.code,
    });
  return data;
}
const db = openDB("mr-white", 1, {
  upgrade(db) {
    db.createObjectStore("articles", { keyPath: "id" });
    db.createObjectStore("meta");
  },
});
export const cache = {
  all: async () => (await db).getAll("articles"),
  put: async (a) => (await db).put("articles", a),
  delete: async (id) => (await db).delete("articles", id),
  clear: async () => {
    await (await db).clear("articles");
  },
  meta: async (k, v) =>
    v === undefined ? (await db).get("meta", k) : (await db).put("meta", v, k),
};
export function download(name, text) {
  const u = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export const toMarkdown = (a) =>
  (a.title ? `# ${a.title}\n\n` : "") + a.body + "\n";
export const dateLabel = (s) => {
  const d = new Date(s),
    now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天";
  now.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
};
