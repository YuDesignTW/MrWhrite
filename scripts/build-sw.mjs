import { readdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const assets = readdirSync("dist/client/assets").map((f) => "/assets/" + f);
const version = createHash("sha256")
  .update(assets.join())
  .update(readFileSync("dist/client/theme-init.js"))
  .digest("hex")
  .slice(0, 12);
writeFileSync(
  "dist/client/sw.js",
  `const CACHE='mr-white-${version}';
const SHELL=['/','/index.html','/manifest.webmanifest','/icon.svg','/theme-init.js',${assets.map((a) => JSON.stringify(a)).join(",")}];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mr-white-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||u.pathname.startsWith('/api')||e.request.method!=='GET')return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return;}
if(SHELL.includes(u.pathname))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
`,
);
