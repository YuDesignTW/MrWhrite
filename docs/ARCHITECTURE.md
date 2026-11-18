# 系統架構

## 執行路徑

React 工作台 → 同源 API → team runtime → workflow engine → scoped Agent／實際工具 adapter → 版本化成果。團隊 Blueprint 定義角色、Skill 綁定與節點依賴；總監提案必須經確認才啟用。

`server/team-runtime.mjs` 接收團隊任務，`workflow-engine.mjs` 管理節點執行與續跑，`workflow-store.mjs` 保存狀態。`configured-workflow.mjs` 與 `team-blueprint.mjs` 處理可配置團隊。`server/codex.mjs`、`codex-policy.mjs` 負責模型子程序及其能力限制。

## 資料隔離

SQLite 是索引與流程儲存；`project-vault.mjs` 將專案原檔、Markdown 記憶與研究紀錄保存在資料目錄。teamId、projectId、dataEpoch 共同界定範圍，revision/hash 防止覆蓋並行修改。已完成的任務保留當時的上下文與 Skill 快照。

研究原文與分析不自動轉成知識或記憶。寫作與視覺參考只提供風格，回饋須明確確認才成為長期規則。備份與還原保留資料邊界並暫停需重新確認的排程。

## 交付與外部服務

輪播流程可以先選題，再讓寫手與設計師產出，最後按確定文案排版。圖像生成和 Swift 排版是不同步驟；失敗不應以固定背景冒充新生成圖片。

本機排程、手動發布紀錄與已連通平台發布是不同狀態。社群／分析展示資料只能留在示範介面。網頁來源、新聞摘要、圖片或 PDF 抽樣都須保留實際覆蓋範圍，不宣稱完整讀取或事實查核。
