import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { lockRuntime } from "./runtime-lock.mjs";
import { createApp } from "./app.mjs";
import express from "express";
import { resolve } from "node:path";
import { createServer } from "node:http";
if (existsSync(".env")) loadEnvFile(".env");
const dataDir = resolve(process.env.MR_WHITE_DATA_DIR || "data");
const release = lockRuntime(dataDir);
process.once("exit", release);
const { app } = createApp({ dir: dataDir });
const server = createServer(app);
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.use(express.static(resolve("dist/client")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(resolve("dist/client/index.html")),
  );
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4389);
server.on("error", (error) => {
  console.error("無法啟動本機服務：", error.code);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () =>
  console.log(`懷特先生：http://127.0.0.1:${port}`),
);
