# Mr White Agent System

本機優先的多 Agent 工作台。以團隊與專案管理角色、Skills、工作流程、研究資料、寫作、視覺設計與可追溯的交付成果。此版本只包含系統與合成測試資料，不附帶任何既有組織設定、客戶資料、對話或作品。

## 啟動

需要 Node.js 22（版本見 `.nvmrc`）與 npm。

```sh
npm ci
npm run dev
```

開啟 http://127.0.0.1:4389 。預設使用本目錄的 `data/`，首次建立空白資料庫。若同時運行其他版本，請使用不同連接埠與資料目錄，例如 `PORT=4390 MR_WHITE_DATA_DIR=./data npm run dev`。不要指定既有私人資料庫作為公開展示資料。

```sh
npm run build
npm test
npm start
```

## 系統能力

- 團隊設定：總監訪談、可確認的角色與流程提案；專案各自保存記憶、檔案與對話。
- Agent 與 Skills：總監、研究、寫作、設計及可配置角色；Skills 提供方法，不會自行取得工具權限。
- 工作流程：依賴節點、選題確認、並行產出、取消、失敗續跑、成果版本與 Context Trace。
- 研究：公開來源、新聞搜尋、來源管理與專案追蹤；來源原文與模型分析分開保存。
- 寫作與設計：口吻參考、明確確認的回饋規則、視覺參考與輪播交付。參考資料不等同已核實事實。
- 知識與記憶：Markdown 記憶、專案檔案及網站內容；知識圖使用詞彙相似度，不是語意向量模型。
- 資料保護：SQLite revision、資料 epoch、可驗證備份與還原；本機排程不等同平台發布。

社群與分析中的展示內容有示範標示，不代表真實連線、發布或成效。素材庫初始為空；內建背景只是程式產生的幾何佔位圖，不是歷史作品或針對題目生成的圖片。

## 外部能力與限制

AI 工作需要另行安裝、登入相容的 Codex CLI；可用 `MR_WHITE_CODEX` 指定執行檔。`npm run verify:codex` 會進行真實模型測試並使用帳號額度，日常單元測試不會呼叫它。CLI 由使用者自行管理登入資訊，不隨專案分發。

輪播最終排版使用 macOS Swift/AppKit；一般前後端與測試不因此承諾完整跨平台產圖。PDF 視覺參考需要 Python 3 與 PyMuPDF，影音抽幀需要 ffmpeg，匿名 Instagram 素材工具的依賴見 [工具說明](tools/instagram/README.md)。這些能力沒有隨 npm 安裝自動配置。

可選 rclone 遠端備份及社群服務須自行設定；環境變數名稱見 `.env.example`。專案未內附帳號、token 或 API key；啟動入口會載入專案根目錄的 `.env`，也可由執行環境設定變數。

服務限本機 loopback。保留的靜態打包工具不提供 SQLite／CLI 後端，不可把完整 Agent 後端直接當成公開網站部署。瀏覽器、真實模型、外部平台及人工內容品質需另行驗收。

## 開發與資料邊界

| 位置 | 用途 |
| --- | --- |
| `src/` | React 工作台與介面 |
| `server/` | API、Agent runtime、工作流程與儲存 |
| `shared/` | 共用角色與活動模型 |
| `.agents/skills/` | 通用 Skills 與各自的授權檔 |
| `tests/` | 隔離測試與合成 fixtures |
| `library/manifest.json` | 空白素材庫入口 |
| `data/`、`output/`、`tmp/` | 本機資料與產物，不納入 Git |

詳見 [系統架構](docs/ARCHITECTURE.md)、[分發範圍](docs/DISTRIBUTION.md) 與 [第三方來源](docs/THIRD-PARTY.md)。本次檢查結果見 [驗證紀錄](docs/VALIDATION.md)。
