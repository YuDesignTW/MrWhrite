# 平面海報輪播 QA — 2026-11-07

final result: blocked

## 交付與證據

- 使用者選擇四種風格中的平面海報，並確認多頁輪播。來源 `output/ig-graphic-runtime/reference.png` 為確切選定圖。
- 可檢視圖片：`output/ig-graphic-runtime/graphic-01.png` 至 `graphic-05.png`，1080×1350；`overview.png` 為五頁總覽。獨立示範檔，未寫入正式對話或覆蓋既有作品。
- `comparison.png` 上排為來源、下排為相同文案與頁數的 Canvas 實作，各排正規化為 1620×675。比較圖與第二張單頁放大已開啟；不是 App 畫面截圖，無瀏覽器 viewport 或 device density 驗收聲明。
- 內建 ImageGen 產生三張獨立無字背景，提示詞在 `public/ig-backgrounds/graphic-*.prompt.txt` 與輸出目錄 `prompts.txt`。封面拼貼、驚嘆號、網格、收尾紅圓均屬背景資產；可編輯文案、步驟號與頁碼由 Canvas 排版。

## Findings 與修正

- [P1 / 未解決] Guest 瀏覽器仍無法安全定位，沿用先前確認的工具阻擋，未嘗試繞過個人視窗限制。風格選擇、另存、重載、實際下載與 console、手機/深淺色 UI 尚未驗證，因此 App 互動 QA 不判定通過。
- [已修正] 第一輪標題與編號比來源偏細、偏小。改為本機提供 Noto Sans TC variable 900 字重；使用前 await FontFace 載入，失敗阻止匯出。編號按實際字框填入上方網格，封面及結尾放大；重新輸出比較圖並檢視。
- [已修正] 平面海報的固定構圖不使用舊 theme/layout，加入同一 visual signature 規則，避免未改圖片卻宣稱改版。
- [P3 / 可接受差異] 生成圖的字形與本機實字不是完全相同字型；本機字型可替換文案且預覽/匯出一致。三張獨立背景的格線有少量生成偏移，文字安全區沒有碰線；封面拼貼位置與原圖略異。

## 五項視覺檢查

- 字體：Noto Sans TC weight 900，內文 700，正文可讀；本機 PNG 無缺字，未宣稱瀏覽器字型載入已驗收。
- 間距：4:5；標題在網格安全區，封面下方拼貼、紅色內頁大步驟號、黑色收尾形成序列。內頁重用紅底，數字實際依順序為 01/02/03，頁碼為 01–05。
- 色彩：維持紅、黑、米白；不混入 surreal/street 的藍黃或街頭攝影。
- 圖像：每頁完整滿版，無拉伸概念圖裁片；背景按 cover 方式縮放。字型官方來源與 OFL 授權檔在 public/fonts。
- 內容：延伸既有「把收藏靈感做成小實驗」主題，沒有虛構成果、數據。樣例 five-page 輪播為完整可讀內容，不是空模板。

## 程式驗證

88 項測試通過，包括 graphic 與其他風格獨立另存、保留文字/原稿、重啟保留與不呼叫模型。build 通過，有既有大 chunk 提醒。原生 Canvas 執行 App 同一 renderer，五張輸出全無溢出；故意缺圖、超長標題、超長內文均攔下。字型採專案內建檔，僅切至 graphic 才載入。這些不代替瀏覽器操作驗收。

前一輪雙風格 QA 留存 `docs/design-qa-fullbleed.md`。
