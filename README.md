# Orbit Merge
Run with Node 24+: `npm run build`, then `npm start`. Open http://127.0.0.1:4173. For the browser and payment tests, run `npm ci`, `npx playwright install chromium`, and `npm test`.

Production runs a Cloudflare Worker with managed D1 storage on the existing Sites host. `worker/index.mjs` is the production API; `npm run build` embeds the game assets into `dist/server/index.js`. `.openai/hosting.json` declares the existing project and D1 binding. The Node server is an optional local preview/fallback, not the production payment server.

Server environment: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (random secret), PUBLIC_ORIGIN (HTTPS, no trailing slash), SUPPORT_USERNAME (owner's support username, no @), BOT_USERNAME, PORT (default 4173). Never place secrets in dist/ or commit them. Purchases remain off unless required settings are present.

In BotFather create a dedicated Orbit Merge bot. Configure its Main Mini App and menu button with the public HTTPS origin. Register the HTTPS `/telegram/webhook` URL via Bot API setWebhook with the same secret_token as TELEGRAM_WEBHOOK_SECRET. Allow `message` and `pre_checkout_query` updates. Confirm getWebhookInfo has no delivery error. Add /start, /paysupport and /privacy commands.

Digital goods use XTR only. Server verifies HMAC-signed initData (one-hour lifetime), creates server-priced orders, checks payer/currency/amount in pre-checkout, and credits only successful_payment webhooks. Grants are transactional and deduplicated by order and Telegram payment charge ID. Invoice UI callbacks never grant balances. Do not enable real purchases before verifying the complete flow in Telegram's test environment. No live transaction was performed by the build tests.

Refund procedure: owner verifies receipt, uses refundStarPayment with Telegram user_id and telegram_payment_charge_id, records the result and adjusts unused granted balance in an audited transaction. This release has no automatic refund dashboard; /paysupport routes users to configured owner support. Set a written refund policy before launch.

Production runtime secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, OWNER_CHAT_ID. Public configuration: PUBLIC_ORIGIN and PAYMENTS_ENABLED. The bot's webhook is `/telegram/webhook`. Secrets are stored in the hosting secret manager and must never be placed in source or browser assets. Production /paysupport creates a durable ticket and notifies the owner. The owner uses /tickets and /reply TICKET_ID MESSAGE in the bot's private chat. Manual refunds remain an owner operation via Telegram's refundStarPayment API after receipt review.

The Worker enables rewarded ads when `ADS_ENABLED=true` and a provider is configured. For Monetag, set `AD_PROVIDER=monetag`, `MONETAG_ZONE`, and `MONETAG_SDK_URL`. For AdsGram, set `ADSGRAM_BLOCK_ID`. Rewarded SDKs load when a player chooses Watch. Monetag reports the placement through `requestVar`, and only a `valued` result grants a practice reward. Paid inventory is credited by Telegram's payment webhook.

Privacy: practice board/records live in localStorage. Server stores Telegram IDs, purchases, and paid inventory in SQLite. Choose retention and deletion policies before public launch. There is no tracking SDK. Personal device scores are not trusted competitive rankings.

Booster consumption uses a persistent action ID and a saved board snapshot, so interrupted requests can be retried without spending twice. Recovery depends on keeping this browser's local storage. Move paid gameplay state server-side before competitive modes or large-scale commercial launch. No global leaderboard or cash prizes. Revenue and retention have not been validated with users.
