# Instagram 單篇素材下載原型

狀態：分階段 curl 下載流程已通過指定 IG 連結實測（4 圖＋2 影片）。尚未接入情報室 UI。Python requests 直接連線在此受限環境仍不可用。

## 工具選擇與檢查（2026-11-04）

選擇官方 https://github.com/instaloader/instaloader ，固定 v4.16（2026-10-26），commit `3338260f5d956e8b0da862c8b535f667ae791841`。用途涵蓋單篇圖片、輪播、影片與文案。MIT 授權。

- 從 PyPI 安裝 wheel 到專案 `.venv-instagram`；沒有全機安裝，沒有安裝 optional browser_cookie3。
- 已比對已安裝 instaloader 套件內所有 Python 檔與官方 tag checkout，內容一致。
- 檢查 setup.py、初始化、網路與 session 相關程式。發現 session 載入會使用 pickle；本原型不載入任何 session，也不提供登入入口。
- 六個套件版本與 SHA256 見 requirements.lock。首次安裝以固定 Instaloader 版本解析依賴後產生完整鎖檔；不是宣稱首次安裝前即完成雜湊驗證。
- OSV 已知漏洞查詢見 audit-query.json / audit-result.json；六個查詢均無回報。這不證明零漏洞，也不是完整程式碼稽核。
- 官方 GitHub Security 頁未設 SECURITY.md、未發布 advisory。這是治理資訊不足，不是安全保證。
- 獨立 Python 環境可避免依賴污染，但不是 OS 安全沙箱。正式服務仍需受限工作程序、檔案權限與出站網路限制。

對照候選：yt-dlp 官方倉庫有安全政策與公告，較適合後續影音範圍；目前不為此單一任務增加第二套下載器。公告存在不等於目前版本不安全，沒有公告也不等於安全。

官方資料：
- https://github.com/instaloader/instaloader/releases/tag/v4.16
- https://github.com/instaloader/instaloader/security
- https://instaloader.github.io/cli-options.html
- https://github.com/yt-dlp/yt-dlp/security/advisories

## 限制與生命週期

1. 僅接受 HTTPS Instagram 單篇 `/p/`、`/reel/` URL；不下載整個帳號。
2. 匿名模式；不讀 Chrome、Cookie 檔、既有 session，不使用代理／瀏覽器擴充套件或第三方代抓服務。
3. requests 出站網址限制到 Instagram 與其 CDN 網域，重新導向同樣檢查；TLS 驗證維持開啟。這是應用層防護，不取代 OS 網路隔離。
4. 一次最多 20 項、總量 200 MiB、工作 120 秒；401/403/429 停止，不做無限重試。
5. 素材暫存在 `.cache/instagram-intake/<隨機工作ID>`，名稱由本機產生，記錄順序、MIME、雜湊及來源。
6. 分析完成呼叫 finish：預設刪除原始下載素材，保留文案、來源及分析結果；`--keep-media` 才移至 output 永久保留。
7. 超過 24 小時的暫存於下一次 fetch 或 cleanup 清理。目前沒有常駐排程，不能聲稱 24 小時後必定自動刪除。
8. 下載失敗立即清理該次暫存。既有輪播成品不受影響。
9. 分析步驟目前由操作者完成；下載不等於分析完成。圖片與影片不作為指令執行。正式介面應顯示每項分析進度、影片抽幀／逐字稿限制、預設關閉的「保留原始素材」與立即刪除按鈕。

## 使用（在 mr-white 目錄）

重建依賴時使用雜湊鎖檔與 wheels：

```sh
uv venv .venv-instagram
uv pip sync --python .venv-instagram/bin/python --require-hashes --only-binary :all: --index-url https://pypi.org/simple tools/instagram/requirements.lock
.venv-instagram/bin/python tools/instagram/intake.py fetch 'https://www.instagram.com/p/DZp8LxoiTg3/'
```

完成分析後（JOB 換成實際工作 ID）：

```sh
.venv-instagram/bin/python tools/instagram/intake.py finish JOB --analysis-file analysis.txt
# 若使用者選擇保留，在上一條命令末尾加 --keep-media
.venv-instagram/bin/python tools/instagram/intake.py cleanup
```

## 本次驗證

- 6 個離線測試通過：URL／網域限制、完成後刪除、選擇保留、過期清理範圍、symlink／目錄跳脫。
- 真實連結測試失敗於執行環境 network_resolution（ConnectionException），尚未取得 Instagram 回應。不能據此判斷內容需要登入、已刪除或被平台限流。
- 真實下載與影片完整分析仍未驗證；不應把此原型標成已完成情報室整合。


## 下載修復與實測結果（2026-11-04）

根因證據：同環境 Python socket.getaddrinfo 失敗，但獲准的 curl 可連線 Instagram；沒有 proxy 環境變數。這是兩個執行路徑的網路可用性差異，不能稱為電腦 DNS 壞掉。未變更系統 DNS、權限或個人瀏覽器設定。

修復方式：新增 staged.py，沿用 Instaloader v4.16 的公開頁面 → 匿名 CSRF/LSD → GraphQL → 媒體流程，將 HTTP 傳輸交給 curl。這是本專案新增的 adapter，不是上游 Instaloader 官方新增功能。匿名 cookie 來自本次公開連線，不是瀏覽器或使用者的登入 session；遇到 sessionid 明確拒絕。

僅補 request body 的查詢曾回傳 HTML。補齊與官方程式相同的匿名 headers／cookie 後取得完整 6 項 JSON；新建工作重新執行全流程亦成功。curl 的 200 本身不代表下載成功，須驗證 shortcode、數量、檔頭、Content-Type 與總容量。

執行流程（專案根目錄；每步成功才進下一步，JOB 為 bootstrap 輸出的工作 ID）：

```sh
.venv-instagram/bin/python tools/instagram/staged.py bootstrap 'https://www.instagram.com/p/DZp8LxoiTg3/'
curl --disable --config .cache/instagram-intake/JOB/.control/bootstrap.curl
.venv-instagram/bin/python tools/instagram/staged.py query JOB
curl --disable --config .cache/instagram-intake/JOB/.control/query.curl
.venv-instagram/bin/python tools/instagram/staged.py media JOB
# 依 media 輸出數量執行 01.curl、02.curl……，不是固定所有貼文都是六項。
curl --disable --config .cache/instagram-intake/JOB/.control/01.curl
# ……下載所有媒體後：
.venv-instagram/bin/python tools/instagram/staged.py finalize JOB
```

`--disable` 不載入使用者 curlrc；不自動跟隨重新導向。每項最多 200 MiB / 項目數、每次 curl 30 秒。分階段模式沒有整個工作的 120 秒硬性上限；失敗時停止並呼叫 intake.py cleanup 只會清理超過 24 小時的工作，並非立即清除新工作。不得誤用原 Python fetch 的超時／失敗立即清理描述來代表此模式。

成功 finalize 後刪除匿名 cookie、request token、signed URL 及 HTTP headers；僅留媒體與 manifest。之後仍沿用 intake.py finish 的分析後刪除／保留選擇。尚未做內容分析時不可標記 analyzed。

實測工作：c7bc3f5275e840acba5c2dd2766134db
- 01.jpg、03.jpg、04.jpg、06.jpg：1440×1800。
- 02.mp4：720×900，5.118708 秒。
- 05.mp4：720×900，4.052042 秒。
- 六項合計 1,716,099 bytes；六項皆通過 ffmpeg 完整解碼，影片含音軌。
- 14 個離線測試通過，包括拒絕 HTML 假成功、錯誤貼文、不完整輪播、未授權媒體網域、登入 cookie；中文路徑亦測試。
- 素材留在暫存等待分析，未選擇永久保留，未公開發布。

原始首次 DNS 失敗紀錄保留供追溯；它已不是目前 curl 流程的狀態。

## 情報室接入（同日後續）

新增 `staged.py download URL` 單一指令自動執行各階段；180秒整體上限，失敗清理該次工作，不讀使用者 curlrc 或代理。`MR_WHITE_MEDIA_DIR` 由伺服器指定至各資料庫獨立的媒體目錄。

情報室連結匯入現可呼叫 `/api/social/instagram/import`，原始媒體只透過本機驗證過的 session 存取。分析按鈕傳入原圖與影片12格均勻抽幀；未分析音訊。分析成功先保存結果再依選擇刪除媒體；服務每分鐘清理過期未保留素材。這部分已做真實 API／模型驗證，UI 視覺互動尚未驗收。

前面「未接UI」與單純分階段操作描述為歷史進度；目前實測狀態以 docs/CURRENT-STATUS.md 最新段落為準。
