> 最新驗收與 Mac 啟動器狀態請以 [CURRENT-STATUS](docs/CURRENT-STATUS.md) 為準。以下較早紀錄保留為歷史依據，不覆蓋新結果。

# v0.2 更新入口

2026-11-04 的情報室迴圈與驗收結果另見 [LOOP-LOG](docs/LOOP-LOG.md)。以下 v0.1 紀錄保留，未驗證項目不因新功能而自動通過。

# v0.1 開發驗收紀錄

日期：2026-10-11（Asia/Taipei）。環境：macOS arm64，Node 22.22.0，Codex CLI 0.162.1。資料測試於獨立暫存目錄，不建立正式示範文章。

## 已驗證

- `npm run build`：正式前端、PWA shell、保留的 Sites 模板打包成功。
- `npm test`：20 / 20 通過（包含 4 項保留的模板打包測試），測試涵蓋文章 CRUD／版本衝突、UTF-16 emoji 邊界、鎖定、重啟中斷、備份一致性／損壞拒絕／epoch、Host／Origin／CSRF、AI 提交／取消／復原、語氣去重與排除、rclone 呼叫順序與失敗保護、Markdown 純文字輸出。
- `codex --version`：0.162.1。
- `codex login status`：Logged in using ChatGPT。此項只證實登入檢查，不能證明生成可用。

## 明確未通過的驗收

| 項目 | 結果 | 原因／下一步 |
| --- | --- | --- |
| 本機服務啟動 | blocked | 此工具環境禁止 bind/listen，`EPERM`。需使用者終端機啟動 `npm run dev`。 |
| 視覺／響應式驗收 | blocked | 沒有取得本產品的 browser-rendered screenshot，不能宣稱畫面已驗收。 |
| 真實 Codex 生成與取消 | blocked | `npm run verify:codex`：執行環境禁止初始化 Codex 子程序（Operation not permitted）。 |
| Codex adversarial 工具隔離 | pending | 需要在可執行 CLI 的環境測試惡意文章內容；目前只有配置與意外事件停止防護。 |
| Google Drive 真實上傳／還原 | pending | 本機沒有 rclone，也沒有使用者指定並授權的測試目的地。 |
| IME、PWA、離線、多分頁 UI | pending | 需啟動後在真實瀏覽器測試；自動化資料層測試不能取代這些項目。 |
| 1,000 篇效能 | pending | 未量測 p95；API 仍是全量載入。 |

開發時 npm registry 的 DNS 連線受限，提升權限的安裝指令被自動核准機制拒絕。已改用本機快取安裝固定版本，並保存 package-lock.json。

## 手動驗收順序

1. 首次空狀態 → 新增 → 輸入繁中／emoji／Markdown → 等待已儲存 → 刷新。
2. 立即切換文章、搜尋無結果、預覽、複製與匯出。
3. 選字期間 Cmd+Enter 不送出；選取文字後點 AI 框，範圍保持。
4. 真實 AI 起草、游標插入、選取改寫、停止、換文章、一次 Undo、版本還原。
5. 兩分頁同篇：過期更新必須衝突，另存不得丟稿。
6. 本機服務停止：既有文章仍可編輯並標示裝置暫存；恢復後 revision 同步。
7. 語氣匯入 10 篇、重複與空檔排除、分析確認、手動調整、停用與回復。
8. Drive 完整快照 → 下載校驗 → 隔離還原；損壞快照不得置換資料。
9. 桌面／899px／390px、鍵盤焦點、設定 dialog、長標題、20,000 字與 100,000 字文件。
10. 正式模式 PWA 安裝、後端中斷的 shell、更新不強制刷新未儲存文件。

尚未滿足 PRD 第 20 節的 Definition of Done，不能標為完整 MVP 已完成。
