import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { probe } from "../scripts/launch-local.mjs";

test("啟動器只沿用相同資料目錄的就緒服務", async () => {
  const reply = { app: "mr-white", instance: "same-data", status: "ready" };
  const fetch = mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(reply)),
  );
  try {
    assert.equal(await probe("http://127.0.0.1:4389", "same-data"), "ready");
    assert.equal(
      await probe("http://127.0.0.1:4389", "other-data"),
      "occupied",
    );
    assert.equal(fetch.mock.calls[0].arguments[1].redirect, "error");
  } finally {
    fetch.mock.restore();
  }
});

test("啟動器不將其他網站或未就緒服務視為可開啟的情報室", async () => {
  const fetch = mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>another service</html>"),
  );
  try {
    assert.equal(await probe("http://127.0.0.1:4389", "same-data"), "occupied");
    fetch.mock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            app: "mr-white",
            instance: "same-data",
            status: "ready",
          }),
          { status: 503 },
        ),
    );
    assert.equal(await probe("http://127.0.0.1:4389", "same-data"), "occupied");
  } finally {
    fetch.mock.restore();
  }
});

test("連線拒絕才能啟動新服務；逾時需等待，權限錯誤不可假裝未啟動", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
  });
  try {
    assert.equal(await probe("http://127.0.0.1:4389", "same-data"), "stopped");
    fetch.mock.mockImplementation(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    assert.equal(await probe("http://127.0.0.1:4389", "same-data"), "waiting");
    fetch.mock.mockImplementation(async () => {
      throw new TypeError("fetch failed", { cause: { code: "EPERM" } });
    });
    await assert.rejects(
      () => probe("http://127.0.0.1:4389", "same-data"),
      /無法檢查本機服務/,
    );
  } finally {
    fetch.mock.restore();
  }
});
