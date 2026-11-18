# 第三方來源

以下是專案既有的來源紀錄，並非本次重新驗證上游版本：

- Instagram Agent Skills：<https://github.com/Jakeschincariol/instagram-agent-skill>，原紀錄 commit `d03c56bb598be770c60b201f94237e5d1a4268a6`。保留各 Skill 的 MIT 授權檔。
- taste-skill：<https://github.com/leonxlnx/taste-skill>，原紀錄 commit `12af471f627f866411b4bd785b19646d3672784c`。保留原授權及參考資料庫；其中網站案例是上游設計資料，不是此系統的使用者資料。
- Noto Sans TC：字型與 OFL 見 `public/fonts/`。
- npm 依賴：精確版本及完整性見 `package-lock.json`，各套件授權由套件附帶。
- 匿名 Instagram 工具：使用 Instaloader，Python 依賴與雜湊見 `tools/instagram/requirements.lock`。

本次分發未重新執行第三方依賴安全稽核，也不沿用舊環境的驗收結果宣稱新環境已通過。
