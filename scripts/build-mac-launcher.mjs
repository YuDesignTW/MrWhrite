import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

if (process.platform !== "darwin") throw new Error("此啟動器只支援 macOS。");
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(project, "dist/client/index.html")))
  throw new Error("請先執行 npm run build。");
const app = resolve(project, "..", "懷特先生.app");
const contents = join(app, "Contents");
mkdirSync(join(contents, "MacOS"), { recursive: true });
mkdirSync(join(contents, "Resources"), { recursive: true });
writeFileSync(
  join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>懷特先生</string>
<key>CFBundleDisplayName</key><string>懷特先生・情報室</string>
<key>CFBundleIdentifier</key><string>local.jisto.mr-white.launcher</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>launch</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSUIElement</key><true/>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
);
writeFileSync(join(contents, "Resources", "ProjectPath"), project + "\n");
writeFileSync(join(contents, "Resources", "NodePath"), process.execPath + "\n");
const launcher = join(contents, "MacOS", "launch");
const scratch = mkdtempSync(join(tmpdir(), "mr-white-icon-"));
try {
  execFileSync(
    "/usr/bin/swiftc",
    [
      "-module-cache-path",
      join(scratch, "cache"),
      join(project, "scripts/mac-launcher.swift"),
      "-o",
      launcher,
    ],
    { stdio: "inherit" },
  );
  const iconset = join(scratch, "AppIcon.iconset");
  mkdirSync(iconset);
  execFileSync(
    "/usr/bin/swift",
    [
      "-module-cache-path",
      join(scratch, "cache"),
      join(project, "scripts/mac-icon.swift"),
      iconset,
    ],
    { stdio: "inherit" },
  );
  // PNG-backed ICNS chunks (also documented by Pillow's IcnsImagePlugin).
  // This avoids depending on iconutil's encoder availability.
  const types = {
    icp4: "icon_16x16",
    ic11: "icon_16x16@2x",
    icp5: "icon_32x32",
    ic12: "icon_32x32@2x",
    ic07: "icon_128x128",
    ic13: "icon_128x128@2x",
    ic08: "icon_256x256",
    ic14: "icon_256x256@2x",
    ic09: "icon_512x512",
    ic10: "icon_512x512@2x",
  };
  const chunks = Object.entries(types).map(([type, name]) => {
    const png = readFileSync(join(iconset, `${name}.png`));
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(
    8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    4,
  );
  writeFileSync(
    join(contents, "Resources", "AppIcon.icns"),
    Buffer.concat([header, ...chunks]),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
execFileSync("/usr/bin/plutil", ["-lint", join(contents, "Info.plist")], {
  stdio: "inherit",
});
// Ad-hoc sign this locally built bundle, including its icon and path resources.
execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", app], {
  stdio: "inherit",
});
execFileSync("/usr/bin/codesign", ["--verify", "--verbose=2", app], {
  stdio: "inherit",
});
console.log(`已建立：${app}`);
