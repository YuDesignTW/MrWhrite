# 本機環境啟動指令

適用於 macOS 終端機。以下指令依目前 `package.json`、`.nvmrc` 與伺服器程式整理（2026-11-05）。

## 1. 日常啟動

這台電腦目前已安裝 Node.js `22.22.0`、npm `10.9.4`，專案也已有 `node_modules`。一般使用直接執行：

```sh
cd '/Users/yuga/Desktop/SideProject/懷特先生/mr-white'
npm run dev
```

看到 `懷特先生：http://127.0.0.1:4389` 後，手動在瀏覽器開啟：

```text
http://127.0.0.1:4389
```

使用 Chrome 時，請新開「訪客」視窗並確認身分後再開啟網址；無痕不等於訪客。固定使用 `127.0.0.1`，避免切換 `localhost` 造成不同瀏覽器暫存。

這個指令會同時啟動 React/Vite 前端與本機 API，不需要分開開兩個服務。保留終端機運行；停止時在該終端機按 `Ctrl+C`。

## 2. 首次安裝或重建 Node 依賴

專案指定 Node.js `22.22.0`，`package.json` 支援範圍為 `>=22.16.0 <23`。若已安裝 nvm，可執行：

```sh
cd '/Users/yuga/Desktop/SideProject/懷特先生/mr-white'
nvm install
nvm use
node --version
npm --version
npm ci
npm run dev
```

`nvm install` 與 `nvm use` 會讀取 `.nvmrc`。若出現 `nvm: command not found`，但 `node --version` 已是 `v22.22.0`，可略過這兩行；否則先安裝指定 Node 版本再繼續。`npm ci` 會依鎖檔重建依賴，不必每次啟動都執行。

主程式使用 Node 內建 SQLite，無須 Docker、PostgreSQL 或 Python 虛擬環境。Node 22 出現 SQLite `ExperimentalWarning` 本身不代表啟動失敗。

## 3. 環境變數（選用）

基本寫作與手動情報功能不需要 `.env`。需要設定外部服務時，先建立設定檔，保留既有設定：

```sh
cd '/Users/yuga/Desktop/SideProject/懷特先生/mr-white'
if [ ! -f .env ]; then
  cp .env.example .env
fi
nano .env
```

儲存後重新啟動服務。程式會自動載入專案根目錄的 `.env`，不必執行 `source .env`。Threads 設定詳見 [INTELLIGENCE-SETUP.md](INTELLIGENCE-SETUP.md)；AI 寫作的既有 CLI 設定見 [README.md](../README.md#codex-設定)。這些外部功能的登入／憑證設定與主程式啟動分開。

## 4. Instagram 素材功能（選用）

只有需要 Instagram 素材下載與分析時，才需要額外 Python 環境。以下建立指令需要已安裝 `uv`：

```sh
cd '/Users/yuga/Desktop/SideProject/懷特先生/mr-white'
uv venv .venv-instagram
uv pip sync --python .venv-instagram/bin/python --require-hashes --only-binary :all: --index-url https://pypi.org/simple tools/instagram/requirements.lock
.venv-instagram/bin/python --version
curl --version
ffmpeg -version
ffprobe -version
```

若 `.venv-instagram` 已存在且可使用，不必重新建立。後端會直接使用 `.venv-instagram/bin/python`，日常執行 `npm run dev` 前不需要啟用 Python 環境。

如果要手動進入 Python 環境：

```sh
source .venv-instagram/bin/activate
# 完成 Python 操作後離開：
deactivate
```

下載使用 `curl`，影片檢查與抽幀使用 `ffprobe`、`ffmpeg`；若已安裝 Homebrew 但缺少 FFmpeg，可執行 `brew install ffmpeg`。完整下載操作見 [Instagram 工具說明](../tools/instagram/README.md)。環境安裝完成不代表每個 Instagram 連結都能匿名讀取。

## 5. 正式建置模式

先停止正在執行的開發服務，再執行：

```sh
cd '/Users/yuga/Desktop/SideProject/懷特先生/mr-white'
npm run build
npm start
```

網址仍是 `http://127.0.0.1:4389`。程式修改後需重新 build 才會更新正式模式畫面。`npm run preview` 只是 Vite 預覽，完整本機應用請使用 `npm start`。

## 6. 確認服務與排除啟動問題

服務啟動後，可在另一個終端機檢查：

```sh
curl --fail http://127.0.0.1:4389/api/health
```

- `EADDRINUSE`：4389 已被使用。先檢查是否已由另一個終端機或 `懷特先生.app` 啟動；既有服務可直接使用。
- 「這個資料目錄已有服務執行中」：同一份資料只允許一個服務。先停止原服務；更換連接埠不能解決資料目錄鎖定，也不要直接刪除執行中的鎖檔。
- 若是其他程式占用 4389，且本專案尚未啟動，可使用下列替代連接埠：

```sh
PORT=4390 npm run dev
```

此時開啟 `http://127.0.0.1:4390`。

- `EPERM`：執行環境禁止監聽連接埠，請改在自己的 macOS 終端機執行。
- 找不到依賴：回到專案根目錄執行 `npm ci`，再啟動。

## 7. 資料保存位置

預設資料位於 `mr-white/data/`，含 SQLite、工作資料與本機備份。停止服務不會刪除已儲存資料；不要把刪除 `data/` 當成重啟或修復步驟。

目前文件僅核對設定與啟動程式，未為撰寫文件另行啟動服務、下載素材或呼叫模型。最新功能驗收狀態見 [CURRENT-STATUS.md](CURRENT-STATUS.md)。
