# Orbit Merge system
Product: a mobile first five-lane merge game for quick repeat play. Static ES modules; Node server verifies Telegram identity and owns purchases in SQLite.
Screens: Play (board, score, queue); Shop (optional Stars boosters); Records (device personal best, no invented global ranking); Help (rules, privacy, support).
Shell: centered portrait surface, title, native tab buttons; desktop explanatory rail. Selected tab uses a blue bottom rule.
Controls: primary, secondary, icon, lane, tab, product purchase (6 variants). All use visible focus outlines and pressed transform. Hover only on pointer devices. Disabled actions explain why. Product loading says Creating invoice; errors show inline retry text. No payment credit from a client callback.
States: board empty shows drop guidance; full lanes disable input; game over offers free new game, earned undo, or optional rescue. Records empty says finish your first run. Shop without backend says preview purchases unavailable. Ads without placement say unavailable; never fake an ad.
Contrast: dark #142144 on white, white on #244ccc. Disabled is #475569 on #e2e8f0 with no opacity dimming.
Local progress is device-only; paid balances are server-owned. No cash prizes or investment promises.
