# Orbit Merge
Run with Node 24+: `npm start`, then open http://127.0.0.1:4173. Run `npm test` for game and payment integrity checks. No dependencies are required.

The published static Site is a playable practice preview. It does not process purchases or run the Node backend. Live Telegram purchases require a dedicated bot and a public HTTPS deployment of this server behind a reverse proxy (server listens on loopback). Keep `data/orbit.sqlite` on a persistent volume and back it up, including SQLite WAL data correctly.

Server environment: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (random secret), PUBLIC_ORIGIN (HTTPS, no trailing slash), SUPPORT_USERNAME (owner's support username, no @), BOT_USERNAME, PORT (default 4173). Never place secrets in dist/ or commit them. Purchases remain off unless required settings are present.

In BotFather create a dedicated Orbit Merge bot. Configure its Main Mini App and menu button with the public HTTPS origin. Register the HTTPS `/telegram/webhook` URL via Bot API setWebhook with the same secret_token as TELEGRAM_WEBHOOK_SECRET. Allow `message` and `pre_checkout_query` updates. Confirm getWebhookInfo has no delivery error. Add /start, /paysupport and /privacy commands.

Digital goods use XTR only. Server verifies HMAC-signed initData (one-hour lifetime), creates server-priced orders, checks payer/currency/amount in pre-checkout, and credits only successful_payment webhooks. Grants are transactional and deduplicated by order and Telegram payment charge ID. Invoice UI callbacks never grant balances. Do not enable real purchases before verifying the complete flow in Telegram's test environment. No live transaction was performed by the build tests.

Refund procedure: owner verifies receipt, uses refundStarPayment with Telegram user_id and telegram_payment_charge_id, records the result and adjusts unused granted balance in an audited transaction. This release has no automatic refund dashboard; /paysupport routes users to configured owner support. Set a written refund policy before launch.

Ads: intentionally disabled. Connect an approved rewarded-ad publisher placement and server-verified, replay-protected reward callbacks before enabling. Never reward a failed/skipped ad. No pretend ad timer or production block ID is included.

Privacy: practice board/records live in localStorage. Server stores Telegram IDs, purchases, and paid inventory in SQLite. Choose retention and deletion policies before public launch. There is no tracking SDK. Personal device scores are not trusted competitive rankings.

Limitations: paid booster use is server debited but the practice board is browser-local; a lost response may consume a booster without applying the move. Move paid gameplay state server-side before large-scale commercial launch. No global leaderboard or cash prizes. Revenue and retention have not been validated with users.
