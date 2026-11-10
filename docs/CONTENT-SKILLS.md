# 情報素材與內容技能

## JISTO 故事輪播（2026-11-07，使用者認可）

新建 `.agents/skills/jisto-story-carousel/SKILL.md`，保存使用者滿意的三篇第二稿（OXO、IKEA IMPALA、Mailchimp）的故事、語氣、來源查核與圖像配置方法。附 19 頁完整文案與來源快照、三份整組縮圖、版型及原專案渲染器使用注意事項。

本地專案副本為維護來源，並安裝同版至 `~/.codex/skills/jisto-story-carousel` 供 Codex 發現。可直接指定 `$jisto-story-carousel`；專案 AGENTS.md 也引導相關內容任務載入。這次不新增 App Agent 或修改 server 的 skill allowlist，不宣稱 App 已自動載入新 skill。

以下安裝紀錄是較早批次；「未修改全域」僅指該批次。

更新：2026-11-04。

## 安裝

專案技能位於 `.agents/skills/`，供下一輪在本專案的代理工作使用。未修改全域 Codex／Claude 設定。

- [Instagram Agent Skills](https://github.com/Jakeschincariol/instagram-agent-skill)：13 個技能，commit `d03c56bb598be770c60b201f94237e5d1a4268a6`。
- [taste-skill](https://github.com/leonxlnx/taste-skill)：1 個技能，commit `12af471f627f866411b4bd785b19646d3672784c`。
- 原始 MIT LICENSE 保存在各技能目錄。安裝器下載及 Git 子程序遇到 DNS 限制，改由已成功取得的 Git checkout 複製技能原檔；沒有執行上游安裝 shell 或修改全域檔案。
- Skills 是代理指引，不會僅因安裝就進入 App 的隔離生成環境。App 的適配規則明確寫在 `server/editorial-guide.mjs`，由 Agent 提示引用，無執行下載腳本、無遠端上傳或自動發布。

## 本輪實作

情報詳情新增開場鉤子、敘事與畫面、自己的延伸觀點三欄筆記，保存在原有 socialPost。筆記使用 researchVersion 樂觀鎖；不改原文，垃圾桶內容須先恢復。既有備份會一併包含筆記。

三個入口把一則指定來源帶入創作工作台：拆解開場、六頁輪播稿包、短影片分鏡。保留原有未送出的輸入，清除舊候選選取與舊追問，讓新素材不會誤改舊文。確認後由既有 AI 同意／生成流程處理。

編輯指引採用開場選擇、第二頁獨立成立、每頁一個觀點、摘要頁、單一行動邀請與自然中文。英文 humanizer／hookscore 沒有被當成中文品質評分器。輪播仍沿用 4～8 頁契約；影片是對話內分鏡與口播腳本，尚無 MP4 渲染。

[Sandcastles](https://sandcastles.ai/#features) 僅作流程參考：來源研究、突出內容、開場、逐字稿與敘事分析。本輪收錄一則有來源的官網摘要；沒有下載其影片、假造觀看數或稱已驗證爆款。沒有基準數據，不產生 outlier 倍數。

## Jev 的定位與費用

依 [TypeSafe 官方介紹](https://docs.typesafe.ai/introduction)，Jev 對給定內容回傳分類、評分及是非機率；可放在蒐集後的相關性篩選與路由，不能代替平台資料取得。

依 [2026-11-03 官方價格說明](https://help.typesafe.ai/articles/5187202169-how-much-does-jev-cost)，目前沒有免費／試用 credits，輸入每百萬 tokens US$0.042，輸出免費。不能沿用早期第三方提到的 US$5 贈額。未查閱使用者帳號餘額，未儲值、開啟自動扣款或配置 API key。本輪未接入付費 Jev 呼叫；現有 Threads／Apify 設定仍獨立且待平台驗收。

## 視覺方向

使用 taste-skill 的 app draw：Data terminal，seed 573754429，沒有重抽。保留已決定的墨綠品牌、亮／暗模式與頂部工作區導覽，未套用抽到的 icon rail，因為這是既有 App 的局部優化。素材原文是主體、拆解是下一步；選取以細線與表面區分，不增加假數據卡片。

lint：0 FAIL、4 WARN。保留品牌眉標；兩個陰影屬既有浮動工作提示；另一個 inset shadow 是 1px 選取線，沒有視覺浮起的陰影。Chrome 實際畫面驗證另記在 CURRENT-STATUS。
