import { makeSlideGenerator } from "./carousel-images.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
const exec = promisify(execFile);
export function makeTeamRenderer(dir) {
  const render = async ({
    runId,
    copy,
    design,
    signal,
    branding,
    generatedImages,
    imageGeneration,
  }) => {
    if (!/^[\w-]{1,80}$/.test(runId)) throw Error("無效任務");
    const out = resolve(dir, "team-artifacts", runId);
    await mkdir(out, { recursive: true });
    let generatedPaths;
    if (imageGeneration || generatedImages) {
      generatedPaths = [];
      for (let i = 0; i < copy.slides.length; i++) {
        const asset = generatedImages?.[i];
        if (
          !asset ||
          !/^image-[a-f0-9]+$/.test(asset.directory) ||
          asset.name !== "generated.png"
        )
          throw Error("缺少第" + (i + 1) + "頁生成圖片，請續跑產圖。");
        const path = resolve(
            dir,
            "team-artifacts",
            asset.directory,
            asset.name,
          ),
          bytes = await readFile(path);
        if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
          throw Error("生成圖片檔案已變動。");
        generatedPaths.push(path);
      }
    }
    await writeFile(
      join(out, "input.json"),
      JSON.stringify(
        {
          ...copy,
          design,
          generatedPaths,
          branding: branding || { label: "Mr White", footer: "內容創作" },
        },
        null,
        2,
      ),
    );
    await exec(
      "/usr/bin/swift",
      [
        resolve("scripts/render-team-carousel.swift"),
        join(out, "input.json"),
        out,
        resolve("public/ig-backgrounds"),
      ],
      {
        signal,
        timeout: 90000,
        maxBuffer: 100000,
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: resolve(dir, "swift-cache"),
        },
      },
    );
    const files = [];
    for (let i = 0; i < copy.slides.length; i++) {
      const name = String(i + 1).padStart(2, "0") + ".png",
        bytes = await readFile(join(out, name));
      if (
        bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
        bytes.readUInt32BE(16) !== 1080 ||
        bytes.readUInt32BE(20) !== 1350
      )
        throw Error("輪播PNG驗證失敗");
      files.push({
        name,
        width: 1080,
        height: 1350,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      });
    }
    await writeFile(join(out, "caption.txt"), copy.caption);
    return files;
  };
  render.generateSlide = makeSlideGenerator(dir);
  return render;
}
