> 最新入口：雙擊專案旁的 `懷特先生.app` 啟動網頁版。功能完成度與最新驗收請以 [CURRENT-STATUS](docs/CURRENT-STATUS.md) 為準；以下較早紀錄保留為歷史依據。

# 懷特先生

**v0.2 情報室開發中：** 已加入手動情報、追蹤與每日搜集流程、Threads 官方串接程式與發布佇列；真實平台及瀏覽器驗收尚未完成。詳見 [工程迴圈紀錄](docs/LOOP-LOG.md) 與 [設定說明](docs/INTELLIGENCE-SETUP.md)。

個人、本機優先的 Markdown 寫作工作台。兩欄介面、文件內 AI 修改、明確確認的個人語氣，以及可校驗的快照備份。

**目前狀態：功能程式與自動測試已建立；尚未達到 PRD 的完整 MVP 驗收。** 瀏覽器視覺／IME／PWA 驗收、真實 Codex 生成與工具隔離測試、真實 Google Drive 上傳還原仍待實測。詳見 [驗收紀錄](VALIDATION.md)。

## 本機啟動

需要 Node.js **22.22.0**（`.nvmrc`）。使用 Node 內建 SQLite，不需要額外資料庫服務；Node 22 會印出 SQLite ExperimentalWarning。

```sh
cd '/Users/yuga/Desktop/SideProject/懷特先生/mr-white'
npm ci
npm run dev
```

本次開發已安裝依賴，可直接 `npm run dev`。開啟 **http://127.0.0.1:4389**。服務只監聽 loopback，請固定使用此網址，避免切換 localhost 造成不同瀏覽器暫存。

正式模式（可驗證 PWA App shell 快取）：

```sh
npm run build
npm start
```

若 4389 已被占用，可執行 `PORT=4390 npm run dev`。本機環境若禁止監聽網路埠，程式會明確回報 `EPERM`；需要在自己的終端機啟動，不能以建置成功代替執行成功。

## 已實作

- 深墨色兩欄介面、低彩度綠色、細邊框、原生繁中文字體、Phosphor 細線圖示。依本次提供圖片調整 PRD 原先的亮色預設。
- 首次沒有示範文章。「＋」建立空白文章、標題、搜尋、固定編輯中排序、軟刪除與撤銷、垃圾桶恢復。
- Markdown 原文與單欄預覽，選取粗體／斜體／連結、Undo／Redo、Markdown 與純文字複製、UTF-8 `.md` 匯出。
- 800ms 閒置儲存、5 秒 checkpoint、切換時儲存、IndexedDB 暫存、SQLite revision 檢查、衝突另存。
- Codex CLI 真實 adapter：獨立工作目錄、JSON Schema 輸出、起草／插入／續寫／選取改寫／明確確認的全文改寫。CLI 不提供細粒度文字 delta 時顯示真實等待，不做假打字動畫。
- 後端文章鎖、UTF-16 範圍與 hash、操作緩衝、真實 SIGTERM／SIGKILL 取消、AI 寫入與操作完成狀態的同一交易、歷史復原、重啟中斷且不自動重送。
- 例文多檔與貼上匯入、去重、排除、明確確認分析、可編輯規則、不可變風格版本、停用與恢復。移除已使用的例文會使相關規則失效。
- SQLite 一致性快照、Markdown／語氣輸出、SHA-256 manifest、COMPLETE 標記、還原前備份、還原後 epoch 保護。
- rclone 備份 adapter：copy → download check → COMPLETE；指定目的地、後端排程、遠端備份清單、隔離下載與驗證後還原。
- PWA manifest、正式建置的版本化 App shell precache；API 不進 Service Worker 快取。

## Codex 設定

開發時偵測版本：`codex-cli 0.162.1`，登入檢查回報已用 ChatGPT 登入。Adapter 使用此版本的 `--ignore-user-config`、`--ignore-rules` 與 `--output-schema` 參數。若使用其他 CLI 版本，請先執行整合驗證。

```sh
codex login
npm run verify:codex
```

`verify:codex` 會用非敏感測試句實際生成並測試取消，可能使用你帳號的模型額度。它不會修改正式文章，並且在失敗時回傳非零 exit code。

路徑不在 PATH 時，以 `MR_WHITE_CODEX=/absolute/path/to/codex npm run dev` 指定。認證由 CLI 管理，App 不讀取／複製 auth.json，不提供 API Key 欄位，也不自動切換計費方式。第一次 AI 使用需確認資料告知。

全域 config、project instructions、shell、MCP、apps、browser、hooks 等會被停用，寫作在受限的獨立工作目錄執行；遇到非寫作工具事件會停止。**這些設定尚未完成 adversarial isolation 實測，不應視為已證實可隔離所有敏感檔案。** 一般寫作與保存不需要 Codex。

參考：[官方 Codex 設定](https://learn.chatgpt.com/docs/config-file/config-reference)、[官方 Codex App Server 文件](https://learn.chatgpt.com/docs/app-server)。此版本採 `codex exec`，未宣稱 App Server delta 串流已實作。

## Google Drive 設定

先在使用者終端機安裝 rclone，執行 `rclone config`，完成自己的 Google Drive remote 授權。本次環境沒有 rclone 或指定的測試目的地，因此未做真實雲端備份驗收。

1. 頭像 → 綁定設定 → 填入 `gdrive:mr-white` 等專用子路徑。
2. 「立即備份並驗證」成功後，才可啟用每 24 小時備份。
3. 「從 Drive 取回備份」讀取清單、下載並檢查；完整校驗後還要明確確認才置換資料。
4. 一般設定可隨時建立本機快照與還原。

服務／主機停止時不會執行排程；重新啟動後只補做一次到期工作。備份失敗保留上次成功時間，一小時後再嘗試。預設保留所有快照，不自動清理，避免傷及目的地既有檔案；後續可增加 PRD 建議的 14 日／8 週保留政策。rclone root folder 不是 OAuth 最小權限保證；未使用 crypt remote 時不宣稱加密。

## 資料與開發結構

```text
src/                 React 介面、編輯器、IndexedDB 與設定
server/store.mjs     SQLite、revision、交易、範圍驗證
server/app.mjs       同源 session、CSRF、文章／AI／語氣／備份 API
server/codex.mjs     Codex 子程序 adapter
server/backups.mjs   快照、rclone、校驗與還原
scripts/            PWA 建置、真實 CLI 驗證
tests/              資料保護與 HTTP adapter 測試
data/               正式 SQLite、AI 工作目錄與本機備份（gitignored）
```

`MR_WHITE_DATA_DIR` 可指定資料位置。請不要將運作中的 SQLite 放進雲端雙向同步資料夾。備份內容不含 .env、OAuth、rclone 設定、CLI 登入或 API Key。資料庫 migration 版本目前為 1（`migrations` 表，初始化在 `store.mjs`）。

```sh
npm test
npm run build
npm run verify:codex
```

HTTP 測試使用真正的 Node HTTP parser 與 Express，經 in-memory duplex 發送請求，不需開監聽埠。AI 與 rclone adapter 在自動測試中採可控制替身，不能代替真實外部服務驗證。

## 尚待驗收與邊界

- 未完成：瀏覽器實際畫面、手機斷點、中文輸入法、離線重連、PWA 安裝與 shell 更新。
- 未完成：真實 CLI 生成、取消、上下文隔離、實際 Drive 備份／還原。
- 編輯器採原生 textarea 與分組 Undo；未使用 CodeMirror，尚未測試跨平台 IME。
- 列表前端每批顯示 50 筆，但 API 仍回傳全量文章；1,000 篇效能測試與伺服器游標分頁仍待完成。
- 語氣分析一次最多 30,000 字元、每篇前 6,000 字元，清楚顯示採樣；未做全量多批分析彙整。
- 垃圾桶與備份目前不自動永久刪除；操作紀錄尚無內容清除 UI。
- 對外發布、會員、多人協作與手機遠端連線不在此版本。
- 模板的 Sites 靜態打包檔保留，但靜態託管不會自動提供本機 SQLite／CLI 後端；不要把它視為可完整雲端部署的產品。
