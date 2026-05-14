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
    "&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true",
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

const $ = (id) => document.getElementById(id);

// ---------- formatting helpers ----------
const usd0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
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
  $("price").textContent = usd0.format(value);
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
tickTimer = setInterval(tick, 1000);
