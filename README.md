# Ray.tsai Dashboard

個人儀表板：把天氣、股市收盤、GitHub 活動、網站狀態與音樂播放清單整理在同一頁。
純靜態網頁（HTML / CSS / JS，無需建置），支援中英切換與深淺色模式，資料由 GitHub Actions 每天自動更新。

線上展示：https://ray8806.github.io/Ray.tsai-dashboard/

## 卡片與資料來源
| 卡片 | 資料來源 | 更新方式 |
|---|---|---|
| 新北天氣 | [Open-Meteo](https://open-meteo.com/)（免金鑰） | 每次開啟頁面時即時取得 |
| 近況 | `data/now.json` | 手動維護 |
| 股市 | 臺灣證券交易所公開資料（收盤） | Actions 每日更新 `data/stocks.json` |
| GitHub | GitHub 公開 API | Actions 每日更新 `data/github.json` |
| 網站狀態 | Better Stack 公開狀態頁 | Actions 定時更新 `data/uptime.json` |
| 音樂 | `data/music.json`（YouTube Music 公開播放清單） | 手動維護 |

資料檔為空或格式不符時，對應卡片會自動隱藏。

## 設定
1. **開啟 GitHub Pages**：Settings → Pages → Deploy from a branch → `main` / root
2. **允許 Actions 寫入**：Settings → Actions → General → Workflow permissions → *Read and write*
3. **手動跑一次**：Actions → *Update dashboard data* → Run workflow（之後平日 UTC 08:30、每天 UTC 21:17 自動執行）

## 修改內容
- 追蹤的股票：`data/watchlist.json`（只放關注標的，不放持股）
- 天氣地點：`dashboard.js` 內 `WX_URL` 的經緯度
- 播放清單：把 `data/music.json` 的 `playlist_url` 換成你的公開清單連結

## 隱私與安全
- 前端不含任何金鑰；GitHub 與股市資料都在 Actions 內抓取，只使用公開資料。
- 本 repo 為公開，**資料檔與 Git 歷史任何人都看得到**，請勿放入金額、帳戶或持股資訊。
- 股市資料僅供資訊參考，非投資建議。

## 結構
```
index.html        頁面
style.css         樣式
script.js         中英切換、深淺色
dashboard.js      各卡片的讀取與渲染
data/             資料檔（手動或 Actions 產生）
scripts/          Actions 使用的抓取腳本
.github/workflows 每日更新工作流程
```
