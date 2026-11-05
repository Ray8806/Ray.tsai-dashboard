// 個人儀表板：天氣（即時）、近況（手動）、股市與 GitHub（Actions 每日產生）、預算比例（手動）、音樂播放清單
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var now = null, gh = null, music = null, stocks = null, budget = null, wx = null;
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
  function renderBudget() {
    var card = $("dash-budget");
    if (!budget || !budget.updated || !isNum(budget.used_pct)) { card.hidden = true; return; }
    card.hidden = false;
    var used = Math.max(0, Math.min(100, budget.used_pct));
    $("bud-pct").textContent = Math.round(used) + "%";
    var bar = $("bud-bar"); bar.setAttribute("aria-valuenow", Math.round(used));
    bar.firstChild.style.width = used + "%";

    var split = $("bud-split"); split.textContent = "";
    var old = $("bud-legend"); if (old) old.remove();
    var cats = (budget.categories || []).filter(function (c) { return isNum(c.pct) && c.pct > 0; });
    var total = cats.reduce(function (a, c) { return a + c.pct; }, 0) || 1;
    var legend = el("ul", { id: "bud-legend", "class": "lang-legend" });
    cats.forEach(function (c, i) {
      var color = COLORS[i % COLORS.length];
      var seg = el("i", { title: en() ? c.en : c.zh }); seg.style.width = (c.pct / total * 100) + "%"; seg.style.background = color; split.appendChild(seg);
      var li = el("li"), dot = el("span"); dot.style.background = color;
      li.appendChild(dot); li.appendChild(document.createTextNode((en() ? c.en : c.zh) + " " + Math.round(c.pct / total * 100) + "%")); legend.appendChild(li);
    });
    split.after(legend);

    var tr = $("bud-trend"); tr.textContent = "";
    var pts = (budget.trend || []).filter(function (t) { return isNum(t.used_pct); });
    if (pts.length >= 2) {
      tr.appendChild(spark(pts.map(function (t) { return t.used_pct; })));
      tr.appendChild(el("em", null, (en() ? "Usage trend " : "使用率趨勢 ") + pts[0].month + " → " + pts[pts.length - 1].month));
    }
    $("bud-upd").textContent = (en() ? "Updated " : "更新於 ") + fmt(budget.updated);
  }

  // ── GitHub
  function level(n, max) { return n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)); }
  function renderGh() {
    var card = $("dash-gh");
    if (!gh || !gh.generated_at) { card.hidden = true; return; }
    card.hidden = false;
    $("gh-repos").textContent = gh.public_repos;
    $("gh-act").textContent = gh.activity_total;

    var heat = $("gh-heat"); heat.textContent = "";
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date(today); start.setDate(start.getDate() - start.getDay() - (gh.weeks - 1) * 7);
    var max = Math.max.apply(null, [1].concat(Object.keys(gh.days).map(function (k) { return gh.days[k]; })));
    for (var d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var n = gh.days[key] || 0;
      heat.appendChild(el("i", { "data-l": level(n, max), title: key + ": " + n }));
    }
    heat.setAttribute("aria-label", en() ? "Public activity heatmap, last " + gh.weeks + " weeks" : "近 " + gh.weeks + " 週公開活動熱圖");

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

  function render() { renderWeather(); renderNow(); renderStocks(); renderBudget(); renderGh(); renderMusic(); }

  var prev = window.onLangChange;
  window.onLangChange = function () { if (prev) prev(); render(); };

  function load(path) { return fetch(path, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([load("data/now.json"), load("data/github.json"), load("data/music.json"), load("data/stocks.json"), load("data/budget.json")])
    .then(function (res) { now = res[0]; gh = res[1]; music = res[2]; stocks = res[3]; budget = res[4]; render(); });
  fetch(WX_URL).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (j) { wx = j; renderWeather(); });
})();
