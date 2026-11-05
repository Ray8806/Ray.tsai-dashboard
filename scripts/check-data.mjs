// 檢查 data/ 裡的自動產生資料是否正常；有問題就以非零代碼結束，讓 GitHub Actions 變成失敗並通知。
import { readFile } from "node:fs/promises";

const read = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), "utf8"));
const DAY = 86400000;
const ageDays = (iso) => (Date.now() - new Date(iso).getTime()) / DAY;
const errors = [];

// 股市：有資料、自選股沒缺、收盤日期不能太舊（長假最多約 9 天，所以門檻抓 10 天）
try {
  const [stocks, watch] = await Promise.all([read("stocks.json"), read("watchlist.json")]);
  if (!stocks.generated_at || !stocks.index) {
    errors.push("stocks.json 沒有大盤資料");
  } else {
    const have = new Set((stocks.symbols || []).map((s) => s.code));
    const missing = watch.symbols.map((s) => s.code).filter((c) => !have.has(c));
    if (missing.length) errors.push(`stocks.json 缺少自選股：${missing.join("、")}`);
    const stale = ageDays(stocks.index.date);
    if (stale > 10) errors.push(`股市收盤日期已超過 10 天未更新（${stocks.index.date}）`);
  }
} catch (e) { errors.push(`stocks.json 檢查失敗：${e.message}`); }

// GitHub 與網站狀態：資料時間不能超過 3 天
for (const f of ["github.json", "uptime.json"]) {
  try {
    const j = await read(f);
    if (!j.generated_at) errors.push(`${f} 沒有資料`);
    else if (ageDays(j.generated_at) > 3) errors.push(`${f} 已超過 3 天未更新（${j.generated_at}）`);
  } catch (e) { errors.push(`${f} 檢查失敗：${e.message}`); }
}

if (errors.length) {
  for (const m of errors) console.error(`::error::${m}`);
  process.exit(1);
}
console.log("data checks passed");
