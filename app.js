// ₿itcoin Ticker — web version of bitcoin_ticker.py
// Pulls the same data straight from mempool.space & CoinGecko (both CORS-enabled).

const REFRESH_SECONDS = 15;

const API = {
  blocks: "https://mempool.space/api/blocks",
  difficulty: "https://mempool.space/api/v1/difficulty-adjustment",
  mempool: "https://mempool.space/api/mempool",
  fees: "https://mempool.space/api/v1/fees/recommended",
  price:
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,chf" +
    "&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&precision=2",
  // 5-minute granularity for the 24h chart (mempool.space history is hourly)
  chart24h: "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1",
};

const CURRENCIES = {
  usd: { code: "USD", symbol: "$" },
  eur: { code: "EUR", symbol: "€" },
  chf: { code: "CHF", symbol: "CHF " },
};

// Remembers the previous mempool count to show "new TX since last reload".
let lastMempoolCount = null;
let countdown = REFRESH_SECONDS;
let tickTimer = null;
let lastData = null; // last fetched payload — lets us re-render on currency switch
let mempoolDiffHtml = "—";
let currency = localStorage.getItem("currency") || "usd";
let chartRange = localStorage.getItem("chartRange") || "1";
let priceHistory = null; // ascending [{ t: unixSeconds, usd: number }] — hourly, full history
let priceHistory24h = null; // ascending, 5-min granularity, last 24h only
let fxRates = null; // { USDEUR, USDCHF, ... } from mempool.space
let chartCtx = null; // scale/data closures for the hover handler

const $ = (id) => document.getElementById(id);

// ---------- formatting helpers ----------
const usd0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
// hero price — always exactly 2 decimals, e.g. 79,611.28
const price2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-US");

function compactCur(n) {
  const s = CURRENCIES[currency].symbol;
  if (n >= 1e12) return s + usd2.format(n / 1e12) + "T";
  if (n >= 1e9) return s + usd2.format(n / 1e9) + "B";
  if (n >= 1e6) return s + usd2.format(n / 1e6) + "M";
  return s + usd0.format(n);
}

function shortHash(h) {
  return h ? h.slice(0, 10) + "…" + h.slice(-10) : "—";
}

function timeAgo(unixSeconds) {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return diff + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  return Math.floor(diff / 3600) + "h ago";
}

function signed(value, suffix = "%") {
  const cls = value >= 0 ? "pos" : "neg";
  const sign = value >= 0 ? "+" : "";
  return `<span class="${cls}">${sign}${usd2.format(value)}${suffix}</span>`;
}

// ---------- data fetch ----------
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  $("status").textContent = "Aktualisiere…";
  try {
    const [blocks, difficulty, mempool, fees, price] = await Promise.all([
      getJSON(API.blocks),
      getJSON(API.difficulty),
      getJSON(API.mempool),
      getJSON(API.fees),
      getJSON(API.price),
    ]);

    lastData = { blocks, difficulty, mempool, fees, price };
    render(lastData);
    document.body.classList.remove("loading");
    $("status").textContent =
      "Aktualisiert " +
      new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (err) {
    console.error(err);
    $("status").textContent = "⚠ Fehler beim Laden — neuer Versuch in " + REFRESH_SECONDS + "s";
  }
}

// ---------- render ----------
function render({ blocks, difficulty, mempool, fees, price }, freshData = true) {
  const btc = price.bitcoin;
  const cur = CURRENCIES[currency];
  const value = btc[currency];
  const change = btc[currency + "_24h_change"];

  // Price & Marketcap
  $("price").textContent = price2.format(value);
  $("price-unit").textContent = cur.code;
  $("change").innerHTML = signed(change);
  $("change").className = "change " + (change >= 0 ? "up" : "down");
  $("change24").innerHTML = signed(change);
  $("moscow").textContent = num.format(Math.round(100000000 / value)) + " sat/" + cur.symbol.trim();
  $("mcap").textContent = compactCur(btc[currency + "_market_cap"]);
  $("vol").textContent = compactCur(btc[currency + "_24h_vol"]);

  // Blockchain (latest block = index 0)
  const b = blocks[0];
  $("height").textContent = num.format(b.height);
  $("blocktime").textContent =
    new Date(b.timestamp * 1000).toLocaleString("de-DE") + " (" + timeAgo(b.timestamp) + ")";
  $("txcount").textContent = num.format(b.tx_count);
  $("blocksize").textContent = usd2.format(b.size / 1000) + " kB";
  $("blockhash").textContent = shortHash(b.id);
  $("blockhash").title = b.id;
  $("prevhash").textContent = shortHash(b.previousblockhash);
  $("prevhash").title = b.previousblockhash;

  // Mempool — only recompute the diff on a fresh fetch, not on a currency switch
  $("mempool").textContent = num.format(mempool.count);
  if (freshData) {
    if (lastMempoolCount === null) {
      mempoolDiffHtml = "—";
    } else if (mempool.count > lastMempoolCount) {
      mempoolDiffHtml = `<span class="pos">+${num.format(mempool.count - lastMempoolCount)}</span>`;
    } else {
      mempoolDiffHtml = `<span style="color:var(--orange)">New Block! ⛏</span>`;
    }
    lastMempoolCount = mempool.count;
  }
  $("mempool-diff").innerHTML = mempoolDiffHtml;
  $("minfee").textContent = fees.minimumFee + " sat/vB";

  // Transaction fees
  $("fee-low").textContent = fees.hourFee;
  $("fee-med").textContent = fees.halfHourFee;
  $("fee-high").textContent = fees.fastestFee;

  // Mining & difficulty
  const progress = Math.min(difficulty.progressPercent, 100);
  $("diff-fill").style.width = progress + "%";
  $("diff-progress").textContent = usd2.format(difficulty.progressPercent) + "% bis zum nächsten Retarget";
  $("diff-remaining").textContent = num.format(difficulty.remainingBlocks) + " Blöcke";
  $("diff-change").innerHTML = signed(difficulty.difficultyChange);
  $("diff-prev").innerHTML = signed(difficulty.previousRetarget);
}

// ---------- price chart ----------
const RANGES = {
  "1": { seconds: 86400 },
  "7": { seconds: 604800 },
  "30": { seconds: 2592000 },
  max: { seconds: Infinity },
};

// Format a price for the axis/tooltip — keeps precision for tiny historic values.
function priceLabel(v) {
  const s = CURRENCIES[currency].symbol;
  if (v >= 1000) return s + usd0.format(v);
  if (v >= 1) return s + usd2.format(v);
  return s + +v.toPrecision(2);
}

// USD → selected currency, using mempool.space's current FX rates.
function fxFactor() {
  if (currency === "eur") return fxRates ? fxRates.USDEUR : 1;
  if (currency === "chf") return fxRates ? fxRates.USDCHF : 1;
  return 1;
}

// Thin a long series down to ~max points so the SVG path stays light.
function downsample(arr, max) {
  if (arr.length <= max) return arr;
  const out = [];
  const stride = arr.length / max;
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * stride)]);
  out.push(arr[arr.length - 1]);
  return out;
}

// Compact price for the axis grid — "$25K" / "$1.2M" on wide ranges,
// full numbers when the range is narrow enough that K would collapse ticks.
function axisPrice(v, compact) {
  const s = CURRENCIES[currency].symbol;
  if (compact && v >= 1e6) return s + usd1.format(v / 1e6) + "M";
  if (compact && v >= 1000) return s + usd0.format(v / 1000) + "K";
  if (v >= 1000) return s + usd0.format(v);
  if (v >= 1) return s + usd2.format(v);
  return s + +v.toPrecision(2);
}

// "Nice" rounded values between min and max for the horizontal grid.
function niceTicks(min, max, count) {
  const range = max - min || 1;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

// Evenly-spaced time labels for the X-axis — hours / dates / years depending
// on how long the visible range is. Mirrors how CoinGecko labels its Max view.
function makeTimeTicks(t0, t1) {
  const HOUR = 3600, DAY = 86400;
  const span = t1 - t0;
  const ticks = [];
  if (span <= 2 * DAY) {
    const step = 4 * HOUR;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      ticks.push({
        t,
        label: new Date(t * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      });
    }
  } else if (span <= 45 * DAY) {
    const step = span <= 9 * DAY ? DAY : 7 * DAY;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      ticks.push({
        t,
        label: new Date(t * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
      });
    }
  } else {
    const y0 = new Date(t0 * 1000).getFullYear();
    const y1 = new Date(t1 * 1000).getFullYear();
    const stepY = y1 - y0 > 9 ? 2 : 1;
    for (let y = Math.ceil(y0 / stepY) * stepY; y <= y1; y += stepY) {
      const t = new Date(y, 0, 1).getTime() / 1000;
      if (t >= t0 && t <= t1) ticks.push({ t, label: String(y) });
    }
  }
  return ticks;
}

// Map a timestamp to an X pixel by interpolating within the (time-sorted) pts.
function xForTime(t, pts, getX) {
  if (t <= pts[0].t) return getX(0);
  if (t >= pts[pts.length - 1].t) return getX(pts.length - 1);
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < t) lo = mid;
    else hi = mid;
  }
  const frac = (t - pts[lo].t) / (pts[hi].t - pts[lo].t || 1);
  return getX(lo) + frac * (getX(hi) - getX(lo));
}

// Two sources, fetched together:
//  - mempool.space: full hourly history (back to 2010) + current FX rates,
//    in one response — so 7d/30d/Max and currency switches need no re-fetch.
//  - CoinGecko market_chart (days=1): 5-minute granularity for the 24h view.
// Both are kept in USD and converted client-side via fxFactor().
async function loadChart(attempt = 0) {
  const [histRes, dayRes] = await Promise.allSettled([
    getJSON("https://mempool.space/api/v1/historical-price?currency=USD"),
    getJSON(API.chart24h),
  ]);

  if (histRes.status === "fulfilled") {
    fxRates = histRes.value.exchangeRates;
    priceHistory = histRes.value.prices
      .map((p) => ({ t: p.time, usd: p.USD }))
      .sort((a, b) => a.t - b.t);
  } else {
    console.error("chart history:", histRes.reason);
  }

  if (dayRes.status === "fulfilled") {
    // CoinGecko returns ascending [ms, price] pairs
    priceHistory24h = dayRes.value.prices.map((p) => ({ t: Math.floor(p[0] / 1000), usd: p[1] }));
  } else {
    console.error("chart 24h:", dayRes.reason);
  }

  if (!priceHistory && !priceHistory24h) {
    $("chart-meta").textContent = "⚠ Chart konnte nicht geladen werden";
  }
  drawChart();

  // a source can drop out on a transient rate-limit — retry a few times so
  // long ranges don't get stuck without the full history
  if ((!priceHistory || !priceHistory24h) && attempt < 3) {
    setTimeout(() => loadChart(attempt + 1), 5000);
  }
}

function drawChart() {
  // 24h uses the fine-grained CoinGecko series (hourly history is an OK
  // fallback). Longer ranges MUST use the full history — never the 24h
  // series, or e.g. "Max" would silently show just one day.
  const source = chartRange === "1" ? priceHistory24h || priceHistory : priceHistory;
  if (!source) {
    $("chart-meta").textContent = "Lade Chart…";
    return;
  }

  const svg = $("chart");
  const W = $("chart-wrap").clientWidth || 1000;
  const H = 320;
  const padT = 20;
  const padB = 28; // room for the X-axis date labels
  const padR = 58; // room for the price labels down the right edge
  const plotW = W - padR;
  const plotH = H - padT - padB;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // filter to the selected range, then thin out for long ranges
  const now = source[source.length - 1].t;
  const span = RANGES[chartRange].seconds;
  let pts = span === Infinity ? source : source.filter((p) => now - p.t <= span);
  if (pts.length < 2) pts = source.slice(-2);
  pts = downsample(pts, 800);

  const factor = fxFactor();
  const vals = pts.map((p) => p.usd * factor);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const getX = (i) => (i / (pts.length - 1)) * plotW;
  const getY = (v) => padT + plotH - ((v - min) / (max - min || 1)) * plotH;

  let line = "";
  pts.forEach((p, i) => {
    line += (i ? "L" : "M") + getX(i).toFixed(1) + " " + getY(p.usd * factor).toFixed(1) + " ";
  });
  const area = `${line}L${plotW} ${padT + plotH} L0 ${padT + plotH} Z`;

  // horizontal grid + price labels down the right edge (CoinGecko-style)
  const compact = max >= 1e5;
  let yGrid = "";
  for (const v of niceTicks(min, max, 5)) {
    const y = getY(v);
    yGrid +=
      `<line class="grid-line" x1="0" x2="${plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>` +
      `<text class="axis" x="${plotW + 6}" y="${(y + 3).toFixed(1)}">${axisPrice(v, compact)}</text>`;
  }

  // vertical grid + time labels along the bottom — years on the Max view
  let xGrid = "";
  for (const tk of makeTimeTicks(pts[0].t, pts[pts.length - 1].t)) {
    const x = xForTime(tk.t, pts, getX);
    const labelX = Math.max(14, Math.min(plotW - 14, x));
    xGrid +=
      `<line class="grid-line" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${padT}" y2="${padT + plotH}"/>` +
      `<text class="axis x" x="${labelX.toFixed(1)}" y="${H - 8}">${tk.label}</text>`;
  }

  // colours live in the stylesheet (CSS var() doesn't work in SVG attributes)
  svg.innerHTML = `
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop class="g0" offset="0%"/>
        <stop class="g1" offset="100%"/>
      </linearGradient>
    </defs>
    ${yGrid}
    ${xGrid}
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    <line id="hv-line" class="hv-line" y1="${padT}" y2="${padT + plotH}" opacity="0"/>
    <circle id="hv-dot" class="hv-dot" r="4" opacity="0"/>
  `;

  chartCtx = { pts, factor, getX, getY, plotW, viewW: W };

  // meta line: date range + change over the period
  const change = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100;
  const changeHtml =
    Math.abs(change) >= 1000
      ? `<span class="${change >= 0 ? "pos" : "neg"}">${change >= 0 ? "+" : ""}${num.format(
          Math.round(change)
        )}%</span>`
      : signed(change);
  const fmtDate = (t) => new Date(t * 1000).toLocaleDateString("de-DE");
  $("chart-meta").innerHTML =
    `${fmtDate(pts[0].t)} – ${fmtDate(pts[pts.length - 1].t)} · ` + changeHtml;
}

function onChartHover(e) {
  if (!chartCtx) return;
  const { pts, factor, getX, getY, plotW, viewW } = chartCtx;
  const rect = $("chart").getBoundingClientRect();
  const vx = ((e.clientX - rect.left) / rect.width) * viewW; // cursor in viewBox units
  let i = Math.round((vx / plotW) * (pts.length - 1));
  i = Math.max(0, Math.min(pts.length - 1, i));
  const p = pts[i];
  const cx = getX(i);
  const cy = getY(p.usd * factor);

  const svg = $("chart");
  const hvLine = svg.querySelector("#hv-line");
  const hvDot = svg.querySelector("#hv-dot");
  hvLine.setAttribute("x1", cx);
  hvLine.setAttribute("x2", cx);
  hvLine.setAttribute("opacity", "1");
  hvDot.setAttribute("cx", cx);
  hvDot.setAttribute("cy", cy);
  hvDot.setAttribute("opacity", "1");

  const tip = $("chart-tooltip");
  tip.innerHTML =
    `<b>${priceLabel(p.usd * factor)}</b>` +
    `<span>${new Date(p.t * 1000).toLocaleString("de-DE")}</span>`;
  tip.style.left = Math.max(50, Math.min(viewW - 50, cx)) + "px";
  tip.style.top = cy + "px";
  tip.hidden = false;
}

function hideChartHover() {
  $("chart-tooltip").hidden = true;
  const hvLine = $("chart").querySelector("#hv-line");
  const hvDot = $("chart").querySelector("#hv-dot");
  if (hvLine) hvLine.setAttribute("opacity", "0");
  if (hvDot) hvDot.setAttribute("opacity", "0");
}

$("chart").addEventListener("mousemove", onChartHover);
$("chart").addEventListener("mouseleave", hideChartHover);

const rangeSwitch = $("range-switch");
function applyRange(r) {
  chartRange = r;
  localStorage.setItem("chartRange", r);
  for (const btn of rangeSwitch.children) {
    btn.classList.toggle("active", btn.dataset.range === r);
  }
  drawChart(); // no-op until priceHistory has loaded
}
applyRange(chartRange);

rangeSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) applyRange(btn.dataset.range);
});

// redraw on resize so the SVG stays crisp at the new width
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawChart, 150);
});

// ---------- refresh loop ----------
function tick() {
  countdown -= 1;
  if (countdown <= 0) {
    refresh();
  } else {
    $("refresh-fill").style.width = ((REFRESH_SECONDS - countdown) / REFRESH_SECONDS) * 100 + "%";
  }
}

function refresh() {
  countdown = REFRESH_SECONDS;
  $("refresh-fill").style.width = "0%";
  loadData();
}

$("reload").addEventListener("click", () => {
  $("reload").classList.add("spin");
  setTimeout(() => $("reload").classList.remove("spin"), 300);
  refresh();
  loadChart();
});

// ---------- theme toggle ----------
// initial theme is set by the inline script in <head> to avoid a flash
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("theme-toggle").textContent = theme === "light" ? "☀️" : "🌙";
  localStorage.setItem("theme", theme);
}
applyTheme(document.documentElement.getAttribute("data-theme") || "dark");

$("theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(next);
});

// ---------- currency switch ----------
const currencySwitch = $("currency-switch");
function applyCurrency(cur) {
  currency = cur;
  localStorage.setItem("currency", cur);
  for (const btn of currencySwitch.children) {
    btn.classList.toggle("active", btn.dataset.cur === cur);
  }
  if (lastData) render(lastData, false); // re-render without re-fetching
  drawChart(); // reconvert the chart to the new currency, no re-fetch
}
applyCurrency(currency);

currencySwitch.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) applyCurrency(btn.dataset.cur);
});

// pause the countdown while the tab is hidden, refresh on return
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInterval(tickTimer);
  } else {
    refresh();
    tickTimer = setInterval(tick, 1000);
  }
});

// kick off
document.body.classList.add("loading");
loadData();
loadChart();
tickTimer = setInterval(tick, 1000);
// the chart only moves hourly — refresh it on a slow, separate cadence
setInterval(loadChart, 5 * 60 * 1000);
