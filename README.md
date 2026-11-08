# Loxley

Loxley is an AI agent for Robinhood Chain (chain ID 4663). Live at https://askloxley.com.

It audits contracts, builds P&L reports, finds DeFi yield, tracks whales, scores airdrop readiness, drafts social posts, and sends Telegram alerts through [@loxleyalertsbot](https://t.me/loxleyalertsbot). It is read-only: it never holds funds or asks for keys.

## Repository layout

| Path | What it is |
|---|---|
| `web/` | The Next.js 16 app: landing page, `/app` chat agent, API routes, Telegram bot |
| `brand/` | Logo, hero duotones, icons; `brand/source/` holds the original illustrations |
| `mockup/` | Landing page mockup image |

## Run locally

```bash
cd web
cp .env.example .env.local   # then fill in the keys
npm install
npm run dev                  # http://localhost:3000
```

Locally, the Telegram bot long-polls from the dev server. Once the production webhook is set, local polling stops on its own.

## Deploy (Cloudflare Workers)

The app deploys to Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare). Config lives in `web/wrangler.jsonc`, and `web/worker.mjs` adds the cron trigger that runs Telegram watch checks.

```bash
cd web
npm run deploy
```

- **Secrets:** API keys and the bot token are Cloudflare secrets. Set them with `npx wrangler secret put NAME`.
- **Database:** D1 database `loxley` (binding `DB`) holds alert state and rate-limit counters.
- **Config:** keep `cacheComponents` off in `next.config.ts`, because it hangs on Workers.
