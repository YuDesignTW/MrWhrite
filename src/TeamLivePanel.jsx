import { assetUrl } from "./ContentCollection.jsx";
import React, { useEffect, useState } from "react";
import { saveFile, readFile } from "./team-files";
import { api } from "./api";
export function TeamLivePanel({
  team,
  project,
  member,
  openLibrary,
  act,
  close,
}) {
  const [styles, setStyles] = useState([]);
  useEffect(() => {
    let live = true;
    api("/content-library")
      .then((r) => live && setStyles(r.styles))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  const [skills, setSkills] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api("/team-library/skills")
      .then((r) => live && setSkills(r.skills))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  const selected = skills.filter((k) =>
    team.skills.some(
      (s) => s.id === k.id && [member.id, "team"].includes(s.scope),
    ),
  );
  return (
    <div className="tw-right-scroll rw-panel">
      <button className="tw-project-toggle" onClick={close}>
        關閉面板
      </button>
      {member.id === "designer" && (
        <section className="rw-section">
          <h3>既有設計風格</h3>
          {(team.blueprint ? [] : styles).map((s) => (
            <details key={s.id}>
              <summary>{s.name}</summary>
              <div className="rw-asset-library">
                {s.images.map((p) => (
                  <a
                    key={p}
                    href={assetUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={assetUrl(p)} alt={s.name} loading="lazy" />
                  </a>
                ))}
              </div>
            </details>
          ))}
          <h3>品牌素材板</h3>
          <div className="rw-asset-library">
            {(project.roleData?.designer?.showcaseFiles || [])
              .filter((f) => !f.demo && !f.deleted && f.kind === "image")
              .map((f) => (
                <Asset key={f.id} file={f} team={team} project={project} />
              ))}
          </div>
          <label className="rw-import">
            加入圖片
            <input
              aria-label="加入品牌素材"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    )
                  )
                    throw Error("請使用 PNG、JPEG 或 WebP");
                  const saved = await saveFile(team.id, project.id, file);
                  act({
                    type: "appendShowcaseFile",
                    role: "designer",
                    item: {
                      ...saved,
                      kind: "image",
                      blob: true,
                      demo: false,
                      deleted: false,
                      status: "已完成",
                    },
                  });
                } catch (e) {
                  setError(e.message);
                }
              }}
            />
          </label>
          <small>原圖保存在本機專案資料夾，尚未供模型視覺分析。</small>
        </section>
      )}
      <section className="rw-section">
        <h3>目前選用 Skills</h3>
        {selected.map((k) => (
          <article className="rw-skill-tile" key={k.id}>
            <strong>{k.name}</strong>
            <p className="rw-panel-copy">{k.description}</p>
            <small>{k.version}</small>
          </article>
        ))}
        {!selected.length && (
          <p className="rw-inline-note">
            尚未選用。可在團隊庫設定此角色的方法。
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button onClick={() => openLibrary("skills")}>管理 Skills</button>
      </section>
      <section className="rw-section">
        <h3>專案目標</h3>
        <p className="rw-panel-copy">{project.brief || "尚未設定"}</p>
      </section>
      <section className="rw-section">
        <h3>記憶與規範</h3>
        <p className="rw-panel-copy">{project.memory || "尚無記憶"}</p>
        <p className="rw-panel-copy">{project.guardrails}</p>
        <button onClick={() => openLibrary("memory")}>開啟知識庫</button>
      </section>
      {member.id === "designer" && (
        <p className="rw-inline-note">
          {team.blueprint ? "依團隊流程提供視覺規劃；新增圖片生成工具需另行接入。" : "目前支援文字輪播版型與 PNG 匯出；照片與插畫生成尚未接入。"}
        </p>
      )}
    </div>
  );
}

function Asset({ file, team, project }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true,
      u;
    readFile(team.id, project.id, file.id)
      .then((b) => {
        if (live && b) {
          u = URL.createObjectURL(b);
          setUrl(u);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [file.id, team.id, project.id]);
  return (
    <figure>
      {url ? <img src={url} alt={file.name} /> : <span>本機找不到原檔</span>}
      <figcaption>{file.name}</figcaption>
    </figure>
  );
}
