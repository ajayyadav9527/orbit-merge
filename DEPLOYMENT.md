# Production deployment

Production now uses the existing Sites host as a Worker with managed D1. No separate Railway account or paid server was provisioned. Run `npm run build`, synchronize source using the Sites workflow, save the matching archive, and deploy the saved version. Keep `d1: "DB"` in .openai/hosting.json. Applied SQL migrations are immutable. Runtime secrets live in Sites, never in this repository.

Production variables: TELEGRAM_BOT_TOKEN (secret), TELEGRAM_WEBHOOK_SECRET (secret), OWNER_CHAT_ID (secret), PUBLIC_ORIGIN, PAYMENTS_ENABLED, ADS_ENABLED and ADSGRAM_BLOCK_ID. Ads must stay disabled until the publisher placement is approved. Register the bot webhook with secret_token matching TELEGRAM_WEBHOOK_SECRET. /health and /api/config expose non-secret readiness information only.

The deployed Stars connection has been verified through a signed account request, real invoice creation, invalid-signature rejection, and the bot welcome response. No charge was made and no live successful_payment event has been claimed.

## Optional Node/Docker fallback

The public Sites page serves free practice. This Docker deployment serves the same game plus the Stars API and webhook. It has no npm dependencies. Node 24 is required for SQLite.

1. Connect a hosting account such as Railway. Create a new service from this directory; do not reuse another app. Confirm any hosting price before accepting a paid plan.
2. Attach a persistent volume at `/app/data`. Without it, paid balances and order records will be lost on replacement. Confirm mounted volume permissions allow the non-root `node` user to write there.
3. Set runtime secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in the host's secret manager. The token is in the owner's BotFather conversation, not in source. Set `PUBLIC_ORIGIN` to the new HTTPS origin with no trailing slash, `BOT_USERNAME=OrbitMergeAjayBot`, and `SUPPORT_USERNAME` to an owner-approved support username. `HOST=0.0.0.0`, `DATA_DIR=/app/data`, and platform `PORT` are handled by the container.
4. Start with purchases disabled by leaving the bot token unset. Check `/api/config` and `/`, restart the service, and verify persisted test records in an isolated test volume.
5. In Telegram's separate test environment, use a test bot and test token, configure the webhook's `secret_token`, run a full invoice/payment/duplicate-delivery check, and verify `/paysupport`. Do not claim production Stars work based only on unit tests.
6. After owner support is configured and the test flow passes, set production secrets, register `/telegram/webhook` using the Bot API, and inspect `getWebhookInfo`. Repoint both BotFather launch URLs to the payment service origin. Test without making an unauthorized real purchase.
7. Keep a tested SQLite backup/restore process. Use SQLite online backup or an application-consistent volume snapshot, not an arbitrary database file copy while WAL writes are active.

Ads require a separate approved publisher account and real rewarded placement. Keep them disabled until completion can be verified without crediting skipped or failed ads. This release does not contain a live ad SDK.

The optional container definition is prepared; its build is unverified here because Docker is unavailable. The Worker backend is deployed, while a paid transaction remains unverified.
