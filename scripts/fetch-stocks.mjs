// 從臺灣證券交易所公開 OpenAPI 抓取收盤資料，寫入 data/stocks.json（由 GitHub Actions 每日執行）
// 只抓 data/watchlist.json 列出的大盤指數與自選關注，不涉及任何持股資訊。
import { readFile, writeFile } from "node:fs/promises";

const TWSE = "https://www.twse.com.tw/rwd/zh/";
const cfg = JSON.parse(await readFile(new URL("../data/watchlist.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { "User-Agent": "personal-website-dashboard", "Accept": "application/json" };

// 以台灣時間（UTC+8）取得最近兩個月的月初日期字串 YYYYMM01
function months() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const prev = new Date(Date.UTC(y, m - 1, 1)), cur = new Date(Date.UTC(y, m, 1));
  const f = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`;
  return [f(prev), f(cur)];
}

// 民國日期 "114/11/03" → "2025-11-03"
const rocToIso = (s) => { const [y, m, d] = s.split("/"); return `${Number(y) + 1911}-${m}-${d}`; };

async function monthly(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const body = await res.json();
  if (body.stat !== "OK" || !Array.isArray(body.data)) return [];
  const idx = body.fields.findIndex((f) => f.includes("收盤"));
  if (idx < 0) throw new Error(`no close column in ${url}`);
  return body.data
    .map((r) => ({ date: rocToIso(String(r[0]).trim()), close: Number(String(r[idx]).replace(/,/g, "")) }))
    .filter((r) => Number.isFinite(r.close));
}

async function series(buildUrl) {
  const rows = [];
  for (const mo of months()) { rows.push(...await monthly(buildUrl(mo))); await sleep(1500); }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) throw new Error("not enough data points");
  const last = rows.at(-1), prev = rows.at(-2), tail = rows.slice(-20);
  const change = Math.round((last.close - prev.close) * 100) / 100;
  return {
    date: last.date, close: last.close, change,
    change_pct: Math.round((change / prev.close) * 10000) / 100,
    series: tail.map((r) => r.close),
  };
}

const out = { generated_at: new Date().toISOString(), index: null, symbols: [] };
try {
  out.index = { name: cfg.index.name, ...(await series((d) => `${TWSE}TAIEX/MI_5MINS_HIST?date=${d}&response=json`)) };
} catch (e) { console.warn("index failed:", e.message); }
for (const s of cfg.symbols) {
  try {
    out.symbols.push({ code: s.code, name: s.name, ...(await series((d) => `${TWSE}afterTrading/STOCK_DAY?date=${d}&stockNo=${s.code}&response=json`)) });
  } catch (e) { console.warn(`${s.code} failed:`, e.message); }
}
if (!out.index && out.symbols.length === 0) { console.error("no data fetched; keeping previous file"); process.exit(1); }
await writeFile(new URL("../data/stocks.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`ok: index=${!!out.index}, symbols=${out.symbols.length}`);
