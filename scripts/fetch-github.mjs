// 抓取公開 GitHub 資料並寫入 data/github.json（由 GitHub Actions 定時執行）
// 只使用公開資料；GITHUB_TOKEN 僅用來提高 API 速率上限。
import { writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "Ray8806";
const WEEKS = 12;
const headers = { "Accept": "application/vnd.github+json", "User-Agent": "personal-website-dashboard" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const [profile, repos, ...eventPages] = await Promise.all([
  api(`/users/${USER}`),
  api(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed`),
  api(`/users/${USER}/events/public?per_page=100&page=1`),
  api(`/users/${USER}/events/public?per_page=100&page=2`),
  api(`/users/${USER}/events/public?per_page=100&page=3`),
]);
const events = eventPages.flat();

// 每日活動量（Push 事件算 commit 數，其餘事件各算 1）
const days = {};
for (const e of events) {
  const d = e.created_at.slice(0, 10);
  const n = e.type === "PushEvent" ? (e.payload.size ?? e.payload.commits?.length ?? 1) : 1;
  days[d] = (days[d] || 0) + n;
}

// 語言分布（以 repo 主要語言計次，排除 fork）
const own = repos.filter((r) => !r.fork);
const langs = {};
for (const r of own) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;

const recent = own
  .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
  .slice(0, 4)
  .map((r) => ({ name: r.name, url: r.html_url, desc: r.description, lang: r.language, pushed_at: r.pushed_at }));

const out = {
  generated_at: new Date().toISOString(),
  user: USER,
  weeks: WEEKS,
  public_repos: profile.public_repos,
  followers: profile.followers,
  activity_total: Object.values(days).reduce((a, b) => a + b, 0),
  days,
  languages: Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  recent,
};
await writeFile(new URL("../data/github.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`ok: ${out.public_repos} repos, ${out.activity_total} activity events`);
