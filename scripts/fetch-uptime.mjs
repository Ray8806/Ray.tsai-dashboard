// 讀取 Better Stack 公開狀態頁的 index.json，整理成 data/uptime.json（由 GitHub Actions 定時執行）
// 只使用狀態頁的公開資料，不需要任何金鑰。
import { writeFile } from "node:fs/promises";

const PAGE = (process.env.STATUS_PAGE_URL || "https://ray-tsai.betteruptime.com").replace(/\/$/, "");
const res = await fetch(`${PAGE}/index.json`, { headers: { "User-Agent": "personal-website-dashboard", "Accept": "application/json" } });
if (!res.ok) throw new Error(`${PAGE}/index.json -> ${res.status}`);
const json = await res.json();

const attrs = json?.data?.attributes;
const resources = (json?.included || []).filter((i) => i.type === "status_page_resource");
if (!attrs || resources.length === 0) throw new Error("unexpected status page format");

const out = {
  generated_at: new Date().toISOString(),
  page_url: PAGE + "/",
  state: attrs.aggregate_state,
  resources: resources
    .sort((a, b) => a.attributes.position - b.attributes.position)
    .map((r) => ({
      name: r.attributes.public_name,
      status: r.attributes.status,
      availability: r.attributes.availability,
      days: (r.attributes.status_history || []).slice(-90).map((d) => ({ day: d.day, status: d.status })),
    })),
};
await writeFile(new URL("../data/uptime.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`ok: state=${out.state}, resources=${out.resources.length}`);
