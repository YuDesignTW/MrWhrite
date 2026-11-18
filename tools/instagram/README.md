# 匿名 Instagram 素材工具

`intake.py` 與 `staged.py` 提供受限的單篇公開素材讀取；不讀取個人瀏覽器 cookie、不載入已登入 session、不繞過登入牆。平台限制或讀取失敗應保留錯誤，不猜測內容。

依賴鎖定在 `requirements.lock`，包含 Instaloader。可在專案根目錄自行建立獨立 Python 環境：

```sh
python3 -m venv .venv-instagram
.venv-instagram/bin/python -m pip install --require-hashes -r tools/instagram/requirements.lock
.venv-instagram/bin/python tools/instagram/intake.py --help
```

原始素材預設為暫存，完成分析後使用 finish 清理；只有明確要求保留時才選擇 keep-media。媒體下載不等同完成分析或驗證作者、最新排序與完整內容。

離線測試：`python3 -m unittest discover -s tools/instagram -p 'test_*.py'`。需要先安裝對應依賴。網路與平台的真實存取須另行驗收。
