// 個人儀表板：天氣（即時）、近況（手動）、股市與 GitHub（Actions 每日產生）、預算比例（手動）、音樂播放清單
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var now = null, gh = null, music = null, stocks = null, budget = null, wx = null, uptime = null;
  var COLORS = ["#00adef", "#8d9399", "#e0a030", "#5cb85c", "#b06ad8", "#d9534f"];
  var SVGNS = "http://www.w3.org/2000/svg";

  var en = function () { return document.documentElement.lang === "en"; };
  var fmt = function (iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(en() ? "en-US" : "zh-TW", { year: "numeric", month: "short", day: "numeric" });
  };
  var num = function (n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  var signed = function (n, digits) { return (n > 0 ? "+" : "") + (digits == null ? num(n) : n.toFixed(digits)); };
  var el = function (tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  };
  var isNum = function (v) { return typeof v === "number" && isFinite(v); };

  // 迷你折線圖：以 viewBox 100x30 依數值範圍等比繪製
  function spark(values) {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 30"); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "spark"); svg.setAttribute("aria-hidden", "true");
    if (values.length < 2) return svg;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = max - min || 1;
    var pts = values.map(function (v, i) {
      return (i / (values.length - 1) * 100).toFixed(2) + "," + (28 - ((v - min) / span) * 26).toFixed(2);
    }).join(" ");
    var pl = document.createElementNS(SVGNS, "polyline");
    pl.setAttribute("points", pts); pl.setAttribute("fill", "none"); pl.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(pl);
    return svg;
  }

  // ── 天氣（Open-Meteo，免金鑰；新北板橋座標）
  var WX_URL = "https://api.open-meteo.com/v1/forecast?latitude=25.012&longitude=121.465" +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FTaipei&forecast_days=4";
  function wxInfo(c) {
    if (c === 0) return ["☀️", "晴", "Clear"];
    if (c <= 2) return ["🌤️", "多雲時晴", "Partly cloudy"];
    if (c === 3) return ["☁️", "陰", "Overcast"];
    if (c === 45 || c === 48) return ["🌫️", "霧", "Fog"];
    if (c >= 51 && c <= 57) return ["🌦️", "毛毛雨", "Drizzle"];
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ["🌧️", "下雨", "Rain"];
    if (c >= 71 && c <= 77) return ["❄️", "下雪", "Snow"];
    if (c >= 95) return ["⛈️", "雷雨", "Thunderstorm"];
    return ["🌡️", "天氣不明", "Unknown"];
  }
  function renderWeather() {
    var card = $("dash-weather");
    var ok = wx && wx.current && wx.daily && isNum(wx.current.temperature_2m) && wx.daily.time && wx.daily.time.length >= 2;
    if (!ok) { card.hidden = true; return; }
    card.hidden = false;
    var c = wx.current, d = wx.daily, info = wxInfo(c.weather_code);
    $("wx-icon").textContent = info[0];
    $("wx-temp").textContent = Math.round(c.temperature_2m) + "°C";
    $("wx-desc").textContent = en() ? info[2] : info[1];
    var rain0 = d.precipitation_probability_max && d.precipitation_probability_max[0];
    var parts = [];
    if (isNum(c.apparent_temperature)) parts.push((en() ? "Feels " : "體感 ") + Math.round(c.apparent_temperature) + "°");
    if (isNum(c.relative_humidity_2m)) parts.push((en() ? "Humidity " : "濕度 ") + Math.round(c.relative_humidity_2m) + "%");
    if (isNum(rain0)) parts.push((en() ? "Rain " : "降雨機率 ") + Math.round(rain0) + "%");
    $("wx-meta").textContent = parts.join(" · ");
    var ul = $("wx-days"); ul.textContent = "";
    for (var i = 1; i < d.time.length; i++) {
      var dt = new Date(d.time[i] + "T00:00:00");
      var li = el("li");
      li.appendChild(el("span", null, dt.toLocaleDateString(en() ? "en-US" : "zh-TW", { weekday: "short" })));
      li.appendChild(el("span", { "aria-hidden": "true" }, wxInfo(d.weather_code[i])[0]));
      li.appendChild(el("span", null, Math.round(d.temperature_2m_min[i]) + "–" + Math.round(d.temperature_2m_max[i]) + "°"));
      var rp = d.precipitation_probability_max && d.precipitation_probability_max[i];
      li.appendChild(el("em", null, isNum(rp) ? Math.round(rp) + "%" : ""));
      ul.appendChild(li);
    }
  }

  // ── 近況
  function renderNow() {
    if (!now || !now.items) { $("dash-now").hidden = true; return; }
    var ul = $("now-list"); ul.textContent = "";
    now.items.forEach(function (it) {
      var li = el("li"); li.appendChild(el("span", { "aria-hidden": "true" }, it.icon));
      li.appendChild(el("span", null, en() ? it.en : it.zh)); ul.appendChild(li);
    });
    $("now-upd").textContent = (en() ? "Updated " : "更新於 ") + fmt(now.updated);
  }

  // ── 股市（台灣慣例：紅漲綠跌；同時以 ▲▼ 與正負號標示，不只靠顏色）
  function renderStocks() {
    var card = $("dash-stocks");
    if (!stocks || !stocks.generated_at) { card.hidden = true; return; }
    var items = [stocks.index].concat(stocks.symbols || []).filter(function (s) { return s && isNum(s.close) && isNum(s.change); });
    if (!items.length) { card.hidden = true; return; }
    card.hidden = false;
    var ul = $("stk-list"); ul.textContent = "";
    items.forEach(function (s) {
      var dir = s.change > 0 ? "up" : s.change < 0 ? "down" : "flat";
      var li = el("li", { "class": dir });
      var name = el("div", { "class": "stk-name" });
      name.appendChild(el("b", null, en() ? s.name.en : s.name.zh));
      if (s.code) name.appendChild(el("em", null, s.code));
      var px = el("div", { "class": "stk-px" });
      px.appendChild(el("b", null, num(s.close)));
      px.appendChild(el("span", null, (dir === "up" ? "▲ " : dir === "down" ? "▼ " : "") + signed(s.change) + " (" + signed(s.change_pct, 2) + "%)"));
      li.appendChild(name); li.appendChild(spark(s.series || [])); li.appendChild(px); ul.appendChild(li);
    });
    $("stk-upd").textContent = (en() ? "Close as of " : "收盤資料日期：") + (items[0].date || "");
  }

  // ── 預算（只含比例，不含金額）
  // 使用率 = 對上限的比例 → 進度條；分類 = 一個整體的占比 → 由大到小的橫條；每月使用率 → 長條圖
  function renderBudget() {
    var card = $("dash-budget");
    if (!budget || !budget.updated || !isNum(budget.used_pct)) { card.hidden = true; return; }
    card.hidden = false;
    var pct = budget.used_pct;
    var level = pct > 100 ? "over" : pct >= 80 ? "warn" : "ok";
    $("bud-pct").textContent = Math.round(pct) + "%";
    var bar = $("bud-bar"); bar.setAttribute("aria-valuenow", Math.round(Math.min(pct, 100)));
    bar.dataset.level = level; bar.firstChild.style.width = Math.max(0, Math.min(100, pct)) + "%";
    var STATUS = {
      ok:   ["✓", "在預算內", "Within budget"],
      warn: ["⚠", "接近預算上限", "Approaching the limit"],
      over: ["✕", "已超出預算", "Over budget"]
    };
    var st = $("bud-status"); st.dataset.level = level;
    st.textContent = STATUS[level][0] + " " + (en() ? STATUS[level][2] : STATUS[level][1]);

    // 分類：橫條由大到小，真實比例（0–100%），數值標在條尾；文字用一般文字色
    var ul = $("bud-cats"); ul.textContent = "";
    var cats = (budget.categories || []).filter(function (c) { return isNum(c.pct) && c.pct > 0; })
      .sort(function (a, b) { return b.pct - a.pct; });
    cats.forEach(function (c) {
      var name = en() ? c.en : c.zh;
      var li = el("li", { title: name + " " + Math.round(c.pct) + "%" });
      li.appendChild(el("span", { "class": "cat-n" }, name));
      var track = el("span", { "class": "cat-track", "aria-hidden": "true" });
      var fill = el("i"); fill.style.width = Math.min(100, c.pct) + "%"; track.appendChild(fill);
      li.appendChild(track); li.appendChild(el("b", null, Math.round(c.pct) + "%")); ul.appendChild(li);
    });

    // 每月使用率：長條圖，最新月份用主色、其餘用淡色；虛線以外的細線標出 100% 預算
    var tr = $("bud-trend"); tr.textContent = "";
    var pts = (budget.trend || []).filter(function (t) { return isNum(t.used_pct) && t.month; }).slice(-6);
    var head = $("bud-trend-h");
    if (pts.length < 2) {
      head.hidden = true;
      tr.appendChild(el("p", { "class": "bud-wait" }, en() ? "The monthly chart appears once there are two months of data." : "累積兩個月的資料後，會顯示每月趨勢圖。"));
    } else {
      head.hidden = false;
      var max = Math.max(100, Math.max.apply(null, pts.map(function (t) { return t.used_pct; })));
      var plot = el("div", { "class": "cols", role: "img", "aria-label": (en() ? "Budget used by month: " : "每月預算使用率：") + pts.map(function (t) { return t.month + " " + Math.round(t.used_pct) + "%"; }).join("，") });
      var ref = el("span", { "class": "ref" }); ref.style.bottom = (100 / max * 100) + "%"; plot.appendChild(ref);
      pts.forEach(function (t, i) {
        var col = el("div", { "class": "col" + (i === pts.length - 1 ? " now" : ""), title: t.month + " " + Math.round(t.used_pct) + "%" });
        col.appendChild(el("b", null, Math.round(t.used_pct) + "%"));
        var barEl = el("i"); barEl.style.height = (t.used_pct / max * 100) + "%"; col.appendChild(barEl);
        var m = Number(t.month.slice(5, 7));
        col.appendChild(el("span", null, en() ? new Date(2000, m - 1, 1).toLocaleDateString("en-US", { month: "short" }) : m + "月"));
        plot.appendChild(col);
      });
      tr.appendChild(plot);
    }
    $("bud-upd").textContent = (en() ? "Updated " : "更新於 ") + fmt(budget.updated);
  }

  // ── GitHub：近 N 週每週活動次數（長條圖）；只標最高週與本週的數字，下方標週起始日
  var ymd = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var md = function (d) { return en() ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : (d.getMonth() + 1) + "/" + d.getDate(); };
  function renderGh() {
    var card = $("dash-gh");
    if (!gh || !gh.generated_at) { card.hidden = true; return; }
    card.hidden = false;
    $("gh-repos").textContent = gh.public_repos;

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date(today); start.setDate(start.getDate() - start.getDay() - (gh.weeks - 1) * 7);
    var weeks = [], total = 0;
    for (var i = 0; i < gh.weeks; i++) {
      var ws = new Date(start); ws.setDate(ws.getDate() + i * 7);
      var sum = 0;
      for (var k = 0; k < 7; k++) {
        var day = new Date(ws); day.setDate(day.getDate() + k);
        if (day > today) break;
        sum += gh.days[ymd(day)] || 0;
      }
      weeks.push({ start: ws, n: sum }); total += sum;
    }
    $("gh-act").textContent = total;

    var box = $("gh-weeks"); box.textContent = "";
    var max = Math.max.apply(null, [1].concat(weeks.map(function (w) { return w.n; })));
    var maxIdx = weeks.reduce(function (m, w, i) { return w.n > weeks[m].n ? i : m; }, 0);
    var plot = el("div", { "class": "cols dense", role: "img", "aria-label": (en() ? "Public activity per week: " : "每週公開活動：") + weeks.map(function (w) { return md(w.start) + " " + w.n; }).join("，") });
    weeks.forEach(function (w, i) {
      var last = i === weeks.length - 1;
      var col = el("div", { "class": "col" + (last ? " now" : ""), title: md(w.start) + (en() ? " week: " : " 起的一週：") + w.n });
      if (w.n > 0 && (i === maxIdx || last)) col.appendChild(el("b", null, String(w.n)));
      var barEl = el("i"); barEl.style.height = (w.n / max * 100) + "%"; col.appendChild(barEl);
      if (i % 4 === 0 || last) col.appendChild(el("span", null, last ? (en() ? "This wk" : "本週") : md(w.start)));
      plot.appendChild(col);
    });
    box.appendChild(plot);

    var bar = $("gh-langs"); bar.textContent = "";
    var legend = document.getElementById("gh-legend");
    if (legend) legend.remove();
    var total = gh.languages.reduce(function (a, l) { return a + l.count; }, 0);
    legend = el("ul", { id: "gh-legend", "class": "lang-legend" });
    gh.languages.forEach(function (l, i) {
      var color = COLORS[i % COLORS.length];
      var seg = el("i", { title: l.name }); seg.style.width = (l.count / total * 100) + "%"; seg.style.background = color; bar.appendChild(seg);
      var li = el("li"); var dot = el("span"); dot.style.background = color; li.appendChild(dot); li.appendChild(document.createTextNode(l.name)); legend.appendChild(li);
    });
    bar.after(legend);

    var ul = $("gh-recent"); ul.textContent = "";
    gh.recent.forEach(function (r) {
      var li = el("li"); var a = el("a", { href: r.url, target: "_blank", rel: "noopener" }, r.name);
      li.appendChild(a); li.appendChild(el("em", null, fmt(r.pushed_at))); ul.appendChild(li);
    });
    $("gh-upd").textContent = (en() ? "GitHub data updated " : "GitHub 資料更新於 ") + fmt(gh.generated_at);
  }

  // ── 網站狀態（Better Stack 公開狀態頁；Actions 定時抓取）
  // 狀態一律以「圖示 + 文字」呈現，每日色塊另有圖例與 tooltip，不只靠顏色
  var ST = {
    operational: ["✓", "運作正常", "Operational", "ok"],
    degraded: ["⚠", "效能下降", "Degraded", "warn"],
    downtime: ["✕", "服務中斷", "Down", "crit"],
    maintenance: ["🔧", "維護中", "Maintenance", "info"],
    not_monitored: ["–", "未監測", "Not monitored", "none"]
  };
  var stInfo = function (s) { return ST[s] || ["?", "狀態未知", "Unknown", "warn"]; };
  var stText = function (s) { var i = stInfo(s); return i[0] + " " + (en() ? i[2] : i[1]); };
  var wideMq = window.matchMedia ? window.matchMedia("(min-width: 640px)") : null;
  if (wideMq && wideMq.addEventListener) wideMq.addEventListener("change", function () { renderUptime(); });

  function renderUptime() {
    var card = $("dash-uptime");
    if (!uptime || !uptime.generated_at || !uptime.resources || !uptime.resources.length) { card.hidden = true; return; }
    card.hidden = false;
    var ov = stInfo(uptime.state);
    var overall = $("up-overall"); overall.dataset.level = ov[3];
    overall.textContent = uptime.state === "operational"
      ? ov[0] + " " + (en() ? "All systems operational" : "所有系統運作正常")
      : ov[0] + " " + (en() ? "Some services are affected: " : "部分服務異常：") + (en() ? ov[2] : ov[1]);
    if (/^https:\/\/[\w.-]+\.betteruptime\.com\/?$/.test(uptime.page_url || "")) $("up-link").href = uptime.page_url;

    var count = wideMq && wideMq.matches ? 90 : 30, seen = {};
    var ul = $("up-list"); ul.textContent = "";
    uptime.resources.forEach(function (r) {
      var days = (r.days || []).slice(-count);
      var first = (r.days || []).filter(function (x) { return x.status !== "not_monitored"; })[0];
      var li = el("li");
      var name = el("div", { "class": "up-name" });
      name.appendChild(el("b", null, r.name));
      var badge = el("span", { "class": "up-badge", "data-level": stInfo(r.status)[3] }, stText(r.status));
      name.appendChild(badge);
      var av = el("div", { "class": "up-avail" });
      av.appendChild(el("b", null, isNum(r.availability) ? (Math.round(r.availability * 10000) / 100) + "%" : "–"));
      av.appendChild(el("span", null, en() ? "availability" : "狀態頁統計可用率"));
      if (first) av.appendChild(el("span", { "class": "up-since" }, (en() ? "monitored since " : "監測始於 ") + first.day));
      var strip = el("div", { "class": "up-days", role: "img", "aria-label": (en() ? "Daily status, last " : "近 ") + days.length + (en() ? " days" : " 天每日狀態") });
      days.forEach(function (x) {
        seen[x.status] = true;
        strip.appendChild(el("i", { "data-s": stInfo(x.status)[3], title: x.day + "：" + (en() ? stInfo(x.status)[2] : stInfo(x.status)[1]) }));
      });
      li.appendChild(name); li.appendChild(av); li.appendChild(strip); ul.appendChild(li);
    });
    var lg = $("up-legend"); lg.textContent = "";
    Object.keys(seen).forEach(function (s) {
      var span = el("span"); var dot = el("i", { "data-s": stInfo(s)[3] });
      span.appendChild(dot); span.appendChild(document.createTextNode(en() ? stInfo(s)[2] : stInfo(s)[1])); lg.appendChild(span);
    });
    $("up-upd").textContent = (en() ? "Status data updated " : "狀態資料更新於 ") + fmt(uptime.generated_at);
  }

  // ── 音樂：只接受 youtube / music.youtube.com 的 HTTPS 播放清單，並只取出 list ID 組成嵌入網址
  function listId(url) {
    try {
      var u = new URL(url);
      if (u.protocol !== "https:" || !/^(music|www)\.youtube\.com$/.test(u.hostname)) return null;
      var id = u.searchParams.get("list");
      return id && /^[\w-]{10,64}$/.test(id) ? id : null;
    } catch (e) { return null; }
  }
  function renderMusic() {
    var card = $("dash-music"), id = music && listId(music.playlist_url);
    if (!id) { card.hidden = true; return; }
    card.hidden = false;
    $("music-title").textContent = en() ? music.title.en : music.title.zh;
    $("music-note").textContent = en() ? music.note.en : music.note.zh;
    var f = $("music-embed"), src = "https://www.youtube-nocookie.com/embed/videoseries?list=" + id;
    if (f.getAttribute("src") !== src) f.setAttribute("src", src);
    f.hidden = false;
    $("music-link").href = "https://music.youtube.com/playlist?list=" + id;
  }

  function render() { renderWeather(); renderNow(); renderStocks(); renderBudget(); renderGh(); renderMusic(); renderUptime(); }

  var prev = window.onLangChange;
  window.onLangChange = function () { if (prev) prev(); render(); };

  function load(path) { return fetch(path, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([load("data/now.json"), load("data/github.json"), load("data/music.json"), load("data/stocks.json"), load("data/budget.json"), load("data/uptime.json")])
    .then(function (res) { now = res[0]; gh = res[1]; music = res[2]; stocks = res[3]; budget = res[4]; uptime = res[5]; render(); });
  fetch(WX_URL).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (j) { wx = j; renderWeather(); });
})();
