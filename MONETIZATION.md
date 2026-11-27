# Monetization

Orbit Merge uses a free-to-play loop with three revenue paths:

- **Telegram Stars boosters:** optional one-time XTR purchases. Orders and balance grants are handled by the production Worker and successful-payment webhook; user-device callbacks do not grant paid inventory.
- **Rewarded ads:** the player chooses when to watch. A booster is granted only when Monetag reports `reward_event_type: valued`. Ad requests carry a unique `ymid` and a placement-specific `requestVar`; a valued ad starts a 60-second session cooldown.
- **Promoted links:** clearly labeled third-party links open only after a tap and have a 60-second per-session cooldown.

The public GitHub Pages build is practice-only for Stars purchases. Production payment readiness is not proof of a completed sale, and the repo has no live revenue measurement. Use Monetag's publisher dashboard to verify impressions and earnings. Server-side postbacks would be needed to make rewarded-ad accounting authoritative; no Monetag postback secret has been configured.
