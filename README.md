# ₿itcoin Ticker

A modern web dashboard for real-time Bitcoin data — price, mempool, transaction
fees and mining/difficulty info. Pure HTML/CSS/JS, no build step and no backend:
the data is fetched straight from the [mempool.space](https://mempool.space) and
[CoinGecko](https://www.coingecko.com) APIs in the browser.

This is the web version of the original `bitcoin_ticker.py` console script.

## Features

- Live Bitcoin price, market cap and 24h volume
- Currency switch: USD / EUR / CHF
- Latest block details (height, timestamp, hashes, tx count, size)
- Mempool info (unconfirmed transactions, change since last reload, minimum fee)
- Transaction fees (low / medium / high priority)
- Mining & difficulty (progress, remaining blocks, estimated & previous retarget)
- Auto-refresh every 15s with a countdown bar, plus a manual reload button
- Light / dark mode (remembers your choice)

## Usage

The app is a set of static files. Serve them with any web server — for example
Python's built-in one:

```bash
python3 -m http.server 8765
```

Then open <http://127.0.0.1:8765> in your browser.

> Opening `index.html` directly via `file://` is not recommended — some browsers
> block the API requests (CORS). Use a local server.

### Docker

The repo ships a Dockerfile (nginx serving the static files) and a Compose file:

```bash
docker compose up -d --build
```

Then open <http://localhost:8080>. Without Compose:

```bash
docker build -t bitcoin-ticker .
docker run -d -p 8080:80 --name bitcoin-ticker bitcoin-ticker
```

## Hosting

Since there is no backend, the files can be hosted as-is on any static host
(GitHub Pages, Netlify, Cloudflare Pages, …).

## Files

| File                 | Purpose                                  |
|----------------------|------------------------------------------|
| `index.html`         | Page structure                           |
| `style.css`          | Styling, light/dark themes               |
| `app.js`             | API calls, rendering, auto-refresh logic |
| `Dockerfile`         | nginx image serving the static files     |
| `nginx.conf`         | nginx config (gzip, cache headers)       |
| `docker-compose.yml` | Compose service, maps port 8080          |

## Credits

By [haui-btc](https://github.com/haui-btc). Data from mempool.space & CoinGecko.
