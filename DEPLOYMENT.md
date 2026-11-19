# Live payment service deployment

The public Sites page serves free practice. This Docker deployment serves the same game plus the Stars API and webhook. It has no npm dependencies. Node 24 is required for SQLite.

1. Connect a hosting account such as Railway. Create a new service from this directory; do not reuse another app. Confirm any hosting price before accepting a paid plan.
2. Attach a persistent volume at `/app/data`. Without it, paid balances and order records will be lost on replacement. Confirm mounted volume permissions allow the non-root `node` user to write there.
3. Set runtime secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in the host's secret manager. The token is in the owner's BotFather conversation, not in source. Set `PUBLIC_ORIGIN` to the new HTTPS origin with no trailing slash, `BOT_USERNAME=OrbitMergeAjayBot`, and `SUPPORT_USERNAME` to an owner-approved support username. `HOST=0.0.0.0`, `DATA_DIR=/app/data`, and platform `PORT` are handled by the container.
4. Start with purchases disabled by leaving the bot token unset. Check `/api/config` and `/`, restart the service, and verify persisted test records in an isolated test volume.
5. In Telegram's separate test environment, use a test bot and test token, configure the webhook's `secret_token`, run a full invoice/payment/duplicate-delivery check, and verify `/paysupport`. Do not claim production Stars work based only on unit tests.
6. After owner support is configured and the test flow passes, set production secrets, register `/telegram/webhook` using the Bot API, and inspect `getWebhookInfo`. Repoint both BotFather launch URLs to the payment service origin. Test without making an unauthorized real purchase.
7. Keep a tested SQLite backup/restore process. Use SQLite online backup or an application-consistent volume snapshot, not an arbitrary database file copy while WAL writes are active.

Ads require a separate approved publisher account and real rewarded placement. Keep them disabled until completion can be verified without crediting skipped or failed ads. This release does not contain a live ad SDK.

Container definition is prepared; no container build, hosted backend deployment, or live payment transaction has yet been verified.
