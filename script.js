const dict = {
  en: {
    dash_h:"Dashboard",
    dash_note:"This section uses public information only: weather is fetched live when the page opens, GitHub, stock and site-status data are refreshed on a schedule by GitHub Actions, and the \"Now\" card is maintained by hand.",
    dash_now:"Now",
    dash_repos:"public repos",
    dash_act:"activity in the last 12 weeks",
    dash_weather:"New Taipei weather",
    wx_src:"Weather data: Open-Meteo, fetched live when the page opens.",
    dash_stocks:"Markets",
    stk_disc:"Data from the Taiwan Stock Exchange, latest trading-day close. For information only, not investment advice.",
    dash_uptime:"Site status", up_link:"Open live status page ↗", up_note:"Checked every 5 minutes by Better Stack. This data is refreshed on a schedule, not live; I also get an email when the site goes down.",
    gh_langs:"Languages used across repos", gh_recent:"Recently updated repos", gh_weekly:"Public activity per week (last 12 weeks)", gh_note:"Activity includes commits, branches created, issues and pull requests opened, and other public actions.",
    music_open:"Open in YouTube Music",
    nav_site:"Personal site ↗",
    hero_eyebrow:"Personal project",
    hero_lead:"My daily information on one page: weather, stock closes, coding activity and site status. A static page with data refreshed daily by GitHub Actions.",
    disclaimer:"Personal project for demonstration. Market data is for information only, not investment advice."
  }
};
const zh = {};
document.querySelectorAll("[data-i18n]").forEach(el => zh[el.dataset.i18n] = el.innerHTML);
dict.zh = zh;

const root = document.documentElement;
const safe = (fn) => { try { return fn(); } catch (e) {} };

function setLang(l) {
  root.lang = l === "en" ? "en" : "zh-Hant";
  document.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = dict[l][el.dataset.i18n]; });
  document.getElementById("lang").textContent = l === "en" ? "中" : "EN";
  safe(() => localStorage.setItem("lang", l));
  document.title = "Ray.tsai Dashboard";
  if (window.onLangChange) window.onLangChange();
}
function setTheme(t) {
  root.dataset.theme = t;
  safe(() => localStorage.setItem("theme", t));
}

document.getElementById("lang").onclick = () => setLang(root.lang === "en" ? "zh" : "en");
document.getElementById("theme").onclick = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark");
document.getElementById("year").textContent = new Date().getFullYear();

setTheme(safe(() => localStorage.getItem("theme")) || "dark");
if (safe(() => localStorage.getItem("lang")) === "en") setLang("en");
