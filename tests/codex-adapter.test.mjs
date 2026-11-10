import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCodexFailure,
  codexEnvironment,
  getCodexBinary,
} from "../server/codex.mjs";

const pathWarning =
  "WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)";

function expectSafeError(input, code, privateFragments = []) {
  const result = classifyCodexFailure(input);
  assert.ok(result instanceof Error);
  assert.equal(result.code, code);
  assert.match(result.message, /\p{Script=Han}/u);
  for (const fragment of privateFragments)
    assert.ok(
      !result.message.includes(fragment),
      `公開錯誤訊息不應包含診斷中的敏感片段：${fragment}`,
    );
  return result;
}

test("Codex：非致命 PATH 權限警告不代表 app-server 初始化遭拒", () => {
  expectSafeError(
    {
      diagnostic: `${pathWarning}\nerror: unexpected argument '--unsupported-example' found`,
      error: "",
      code: 2,
    },
    "CODEX_FAILED",
  );
});

test("Codex：明確的 in-process app-server 權限錯誤分類為初始化遭拒", () => {
  expectSafeError(
    {
      diagnostic: `${pathWarning}\nError: failed to initialize in-process app-server client: Operation not permitted (os error 1)`,
      error: "",
      code: 1,
    },
    "CODEX_INIT_DENIED",
  );
});

test("Codex：網路失敗不被前置 PATH 警告誤分類", () => {
  expectSafeError(
    {
      diagnostic: pathWarning,
      error:
        "error sending request for url (https://chatgpt.com/backend-api/codex/responses): connection refused",
      code: 1,
    },
    "CODEX_NETWORK",
  );
});

test("Codex：授權失敗回傳可理解的中文，不曝光來源中的 bearer 或 API key", () => {
  const bearer = "unit-test-private-bearer-credential";
  const apiKey = "sk-unit-test-private-api-key";
  expectSafeError(
    {
      diagnostic: `${pathWarning}\nAuthorization: Bearer ${bearer}\nOPENAI_API_KEY=${apiKey}`,
      error: `401 Unauthorized: invalid authentication; Bearer ${bearer}`,
      code: 1,
    },
    "CODEX_AUTH",
    [bearer, apiKey, "Authorization:", "OPENAI_API_KEY=", "Bearer "],
  );
});

test("Codex：未知失敗也不直接回傳可能含憑證的 stderr／事件錯誤", () => {
  const marker = "unit-test-secret-should-never-leak";
  expectSafeError(
    {
      diagnostic: `fatal internal issue; Bearer ${marker}`,
      error: `unsupported response format: api_key=${marker}`,
      code: 1,
    },
    "CODEX_FAILED",
    [marker, "Bearer ", "api_key="],
  );
});

test("Codex：執行檔位置在呼叫時解析，允許啟動後載入 .env", () => {
  const previous = process.env.MR_WHITE_CODEX;
  try {
    delete process.env.MR_WHITE_CODEX;
    assert.equal(getCodexBinary(), "codex");
    process.env.MR_WHITE_CODEX = "/tmp/unit-test-first/codex";
    assert.equal(getCodexBinary(), "/tmp/unit-test-first/codex");
    process.env.MR_WHITE_CODEX = "/tmp/unit-test-second/codex";
    assert.equal(getCodexBinary(), "/tmp/unit-test-second/codex");
    delete process.env.MR_WHITE_CODEX;
    assert.equal(getCodexBinary(), "codex");
  } finally {
    if (previous === undefined) delete process.env.MR_WHITE_CODEX;
    else process.env.MR_WHITE_CODEX = previous;
  }
});

test("Codex：沿用本機身分與網路設定，不轉交其他服務憑證", () => {
  const allowed = {
    PATH: "/unit-test/bin",
    HOME: "/unit-test/home",
    CODEX_HOME: "/unit-test/codex",
    TMPDIR: "/unit-test/tmp",
    HTTP_PROXY: "http://proxy.test:8080",
    HTTPS_PROXY: "http://secure-proxy.test:8080",
    ALL_PROXY: "socks5://all-proxy.test:1080",
    NO_PROXY: "localhost,127.0.0.1",
    http_proxy: "http://lower-proxy.test:8080",
    https_proxy: "http://lower-secure-proxy.test:8080",
    all_proxy: "socks5://lower-all-proxy.test:1080",
    no_proxy: "local.test",
    SSL_CERT_FILE: "/unit-test/cert.pem",
    SSL_CERT_DIR: "/unit-test/certs",
  };
  const source = {
    ...allowed,
    LANG: "en_US.UTF-8",
    OPENAI_API_KEY: "unit-test-unrelated-api-key",
    META_APP_SECRET: "unit-test-unrelated-app-secret",
    MR_WHITE_CODEX: "/unit-test/bin/codex",
    UNSET_OPTION: undefined,
  };
  assert.deepEqual(codexEnvironment(source), {
    ...allowed,
    LANG: "zh_TW.UTF-8",
  });
  assert.deepEqual(codexEnvironment({}), { LANG: "zh_TW.UTF-8" });
  assert.equal(source.LANG, "en_US.UTF-8");
});
