import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { createCanvas } from "@napi-rs/canvas";

test("real force graph mounts under StrictMode, survives tab remount and retains canvas after selection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-render-"));
  const dom = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "HTMLCanvasElement",
    "SVGElement",
    "Node",
    "navigator",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const previous = new Map(
    keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      value: [
        "getComputedStyle",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ].includes(key)
        ? dom.window[key].bind(dom.window)
        : dom.window[key],
      configurable: true,
    });
  globalThis.matchMedia = window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const painted = new Set();
  HTMLCanvasElement.prototype.getContext = function (type) {
    if (!this._canvas) this._canvas = createCanvas(600, 560);
    const ctx = this._canvas.getContext(type);
    if (!ctx._observed) {
      const draw = ctx.fillText.bind(ctx);
      ctx.fillText = (text, ...args) => {
        painted.add(text);
        return draw(text, ...args);
      };
      ctx._observed = true;
    }
    return ctx;
  };
  const errors = [];
  window.addEventListener("error", (e) => {
    errors.push(e.error || Error(e.message));
    e.preventDefault();
  });
  let app;
  const tick = () => new Promise((r) => setTimeout(r, 450));
  try {
    await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{KnowledgeNetwork}from'./src/KnowledgeNetwork.jsx';
 const root=createRoot(document.getElementById('root'));const resources=[{id:'a',name:'公司',kind:'webpage',content:'放射藥物 核醫 同位素 診斷'},{id:'b',name:'技術',kind:'webpage',content:'放射藥物 核醫 同位素 技術'}];
 export function show(){root.render(<React.StrictMode><KnowledgeNetwork resources={resources}/></React.StrictMode>);}
 export function hide(){root.render(<p>另一個分頁</p>);}
 export function close(){root.unmount();}`,
        resolveDir: resolve("."),
        loader: "jsx",
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      loader: { ".css": "empty" },
      outfile: join(dir, "fixture.mjs"),
      logLevel: "silent",
    });
    app = await import(pathToFileURL(join(dir, "fixture.mjs")).href);
    for (let i = 0; i < 2; i++) {
      app.show();
      await tick();
      assert.equal(errors.length, 0, errors.map((e) => e.stack).join("\n"));
      assert.ok(
        document.querySelector("canvas"),
        "graph canvas remains mounted",
      );
      assert.ok(
        painted.has("公司") && painted.has("技術"),
        "real node labels were painted after layout initialized",
      );
      assert.match(document.getElementById("root").textContent, /知識網絡/);
      const button = [...document.querySelectorAll(".kn-node-list button")][0];
      button.click();
      await tick();
      assert.match(
        document.querySelector(".kn-detail").textContent,
        /保存的原文/,
      );
      assert.equal(errors.length, 0, errors.map((e) => e.stack).join("\n"));
      app.hide();
      await tick();
    }
  } finally {
    app?.close();
    await tick();
    dom.window.close();
    for (const [k, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, k, descriptor);
      else delete globalThis[k];
    }
    for (const k of ["matchMedia", "ResizeObserver", "IntersectionObserver"])
      delete globalThis[k];
    rmSync(dir, { recursive: true, force: true });
  }
});
