# Product and launch plan
Choice: Orbit Merge, a five-lane drop-and-merge puzzle. A higher score and collectible high-level planets supply the goal. Matching touching planets fuse; chain reactions reward planning. Future drops are visible. Free games are unlimited.

Revenue hypothesis: Telegram Stars boosters (25 Stars for 5 undos; 50 Stars for 3 rescues), followed by optional rewarded ads for one rescue per run. These are test prices, not revenue projections. No forced ads during play, subscriptions, cash prizes, tokens, or purchased leaderboard advantages. Measure day 1/day 7 retention, completed runs, payer conversion, revenue per active user, refunds, and rewarded-ad completion before buying traffic.

Scope: polished mobile app, offline practice, deterministic game engine, personal records, Telegram SDK, server-verified Stars payment orders with idempotent grants, payment support. No fabricated global leaderboard. Preview remains playable without credentials; purchasing is disabled until a dedicated bot/backend is configured. Rewarded ads require publisher approval and a real placement; disabled otherwise.

Launch gates: create dedicated bot with owner approval, HTTPS public host, server token secret, set webhook with secret, test Telegram initData, test-mode invoice and duplicate delivery, refund/support workflow, configure Main Mini App/menu. Ads must be verified through the provider before rewards can be enabled. Never reuse the owner's existing directory bot.
