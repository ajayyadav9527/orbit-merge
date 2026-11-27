import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png'
};

function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    if (reqPath === '/api/config') reqPath = '/dist/api/config';
    const filePath = path.join(rootDir, reqPath);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function makeFullOrbitState(score = 400) {
  const board = Array(30).fill(0);
  // Alternating 1,2,3 levels so no automatic matches occur and top row is full
  const pattern = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 5; c++) {
      board[r * 5 + c] = ((r + c) % 3) + 1;
    }
  }
  return {
    game: { seed: 123, board, score, drops: 30, merges: 5, history: [], over: true },
    records: { best: score, largest: 4, games: 1, merges: 5, missionIdx: 0, theme: 'default', streak: { count: 0, lastClaimDate: '', lastAdBoostDate: '' }, unlockedThemes: [], themeTrials: {} },
    freeUndo: 1,
    freeShuffle: 1,
    pending: null,
    pendingNextShuffle: 0
  };
}

test('GitHub Pages keeps play and shared challenges on the static release', async () => {
  const origin = 'https://ajayyadav9527.github.io';
  const base = origin + '/orbit-merge/';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const apiRequests = [];
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || !url.pathname.startsWith('/orbit-merge/')) return route.abort();
      const name = url.pathname.slice('/orbit-merge/'.length) || 'index.html';
      if (name.startsWith('api/')) {
        apiRequests.push(name);
        return route.fulfill({status:404, body:'Not found'});
      }
      if (!['index.html','style.css','app.js','engine.js','ads.js','app_icon.png','app_icon_favicon.png','app_icon_touch.png'].includes(name)) return route.abort();
      return route.fulfill({path:path.resolve(name)});
    });
    await page.addInitScript(() => {
      window.Telegram = {WebApp: {
        initData:'test-launch',
        openTelegramLink: url => { window.lastSharedLink = url; }
      }};
    });
    await page.goto(base + '?mode=daily');
    await page.locator('#daily-share').click();
    let link = new URL(await page.evaluate(() => window.lastSharedLink));
    assert.equal(link.searchParams.get('url'), base + '?mode=daily');
    await page.locator('[data-view="shop"]').click();
    assert.equal(await page.locator('#pages-booster-note').isVisible(),true);
    assert.equal(await page.locator('#open-telegram-shop').isVisible(),false);
    assert.equal(await page.locator('#sponsor-drop-btn').isEnabled(),true);
    await page.locator('[data-view="records"]').click();
    await page.locator('#share').click();
    link = new URL(await page.evaluate(() => window.lastSharedLink));
    assert.equal(link.searchParams.get('url'), base + '?beat=200');
    assert.deepEqual(apiRequests,[]);
  } finally {
    await browser.close();
  }
});

test('F6-F10 end-to-end flows: R2 config, dead-end recovery, gameover ad loops, daily 2x, streak, themes, cross-promo & dist parity', async () => {
  const rootDir = path.resolve('.');
  // 1. Root vs dist parity check
  for (const file of ['index.html', 'style.css', 'app.js', 'ads.js', 'engine.js']) {
    const rootContent = fs.readFileSync(path.join(rootDir, file), 'utf8');
    const distContent = fs.readFileSync(path.join(rootDir, 'dist', file), 'utf8');
    assert.equal(distContent, rootContent, `dist/${file} must match root ${file}`);
  }
  assert.ok(fs.existsSync(path.join(rootDir, 'dist', 'server', 'index.js')), 'dist/server/index.js exists');

  const server = createStaticServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch();
  try {
    // Test 1: R2 preservation, challenge param, dead-end recovery & strict reward gating
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const popups = [];
    const alerts = [];
    const page = await context.newPage();
    context.on('page', async (p) => {
      if (p !== page) {
        popups.push(p.url());
        await p.close().catch(() => {});
      }
    });
    page.on('dialog', async (d) => {
      alerts.push(d.type());
      await d.dismiss();
    });
    await page.route('**/*libtl.com/**', (route) => route.abort());

    await page.goto(`${baseUrl}?beat=1500`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);

    // Verify R2 meta/zone/smartlink & incoming challenge banner
    const r2 = await page.evaluate(() => ({
      meta: document.querySelector('meta[name="monetag"]')?.getAttribute('content'),
      sdkPresent: !!document.querySelector('script[src*="libtl.com/sdk.js"]'),
      headerBar: !!document.getElementById('fixed-header-ad-bar'),
      status: document.getElementById('status')?.textContent || ''
    }));
    assert.equal(r2.meta, '4c82b2bde24b3d6a6930e54f5bb74228');
    assert.equal(r2.sdkPresent, false, 'The rewarded SDK loads after a user requests an ad');
    assert.equal(r2.headerBar, true);
    assert.match(r2.status, /Beat 1500 PTS/);

    // Drop 2 planets so both Undo and Shuffle are valid
    await page.click('.lane[data-col="0"]');
    await page.click('.lane[data-col="1"]');

    // Use the 1 free Undo
    await page.click('#undo');
    await page.waitForTimeout(100);
    // Now freeUndo === 0: #ad-undo must be visible, and clicking #undo must NOT deadlock or popup
    assert.equal(await page.isVisible('#ad-undo'), true);
    await page.click('#undo');
    await page.waitForTimeout(100);
    assert.equal(popups.length, 0);

    // Rejecting ad does NOT award +1 Undo
    await page.evaluate(() => {
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'skip' });
    });
    await page.click('#ad-undo');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#undo-count'), '0 free');
    assert.equal(popups.length, 0);

    // Completing ad awards +1 Undo
    await page.evaluate(() => {
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'valued' });
    });
    await page.click('#ad-undo');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#undo-count'), '1 free');
    // Can still drop planets cleanly (no pending deadlock!)
    await page.click('.lane[data-col="2"]');
    const dropsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')).game.drops);
    assert.equal(dropsAfter, 2);

    // Use free Shuffle, then test #ad-shuffle rejection & completion
    await page.click('#shuffle');
    assert.equal(await page.isVisible('#ad-shuffle'), true);
    await page.evaluate(() => {
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => { throw new Error('closed'); };
    });
    await page.click('#ad-shuffle');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#shuffle-count'), '0 free');

    await page.evaluate(() => {
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => 'ok';
    });
    await page.click('#ad-shuffle');
    await page.waitForFunction(() => !document.querySelector('#ad-shuffle').disabled);
    assert.equal(await page.textContent('#shuffle-count'), '0 free');
    await page.evaluate(() => {
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'valued' });
    });
    await page.click('#ad-shuffle');
    await page.waitForFunction(() => document.querySelector('#shuffle-count').textContent === '1 free');
    assert.equal(await page.textContent('#shuffle-count'), '1 free');

    // Test #shop: Daily Supply 1x free + 2x Ad + Sponsor Drop strict gating + 7-day streak
    await page.click('[data-view="shop"]');
    await page.click('#daily-supply-btn');
    await page.waitForTimeout(100);
    assert.equal(await page.isDisabled('#daily-supply-btn'), true);
    assert.equal(await page.isVisible('#daily-supply-2x-btn'), true);

    // 2x Daily Supply rejects on skip, grants on valued
    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'skip' }); });
    await page.click('#daily-supply-2x-btn');
    await page.waitForTimeout(100);
    assert.equal(await page.isVisible('#daily-supply-2x-btn'), true);

    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'valued' }); });
    await page.click('#daily-supply-2x-btn');
    await page.waitForTimeout(100);
    assert.equal(await page.isVisible('#daily-supply-2x-btn'), false);

    // Sponsor Drop rejects without granting & without opening smartlink popup
    const undoBeforeSponsor = await page.textContent('#undo-count');
    const shuffleBeforeSponsor = await page.textContent('#shuffle-count');
    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => false; });
    await page.click('#sponsor-drop-btn');
    await page.waitForTimeout(100);
    assert.equal(popups.length, 0);
    assert.equal(await page.textContent('#undo-count'), undoBeforeSponsor);
    assert.equal(await page.textContent('#shuffle-count'), shuffleBeforeSponsor);

    // Streak Day 1 claim + 2x Today's Streak
    await page.click('#streak-claim-btn');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#streak-badge'), 'Day 1 / 7');
    assert.equal(await page.isVisible('#streak-2x-btn'), true);
    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'valued' }); });
    await page.click('#streak-2x-btn');
    await page.waitForTimeout(100);
    assert.equal(await page.isVisible('#streak-2x-btn'), false);

    // Test broken streak repair via backdated localStorage
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('orbit-merge-v1'));
      s.records.streak = { count: 3, lastClaimDate: '2020-01-01', lastAdBoostDate: '' };
      localStorage.setItem('orbit-merge-v1', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('[data-view="shop"]');
    assert.equal(await page.isVisible('#streak-repair-btn'), true);
    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'valued' }); });
    await page.click('#streak-repair-btn');
    await page.waitForTimeout(100);
    assert.equal(await page.isVisible('#streak-repair-btn'), false);
    await page.click('#streak-claim-btn');
    assert.equal(await page.textContent('#streak-badge'), 'Day 4 / 7');

    // Test #records: Cosmic Themes (locked -> opt-in bar without auto ad -> 24h trial)
    await page.click('[data-view="records"]');
    let adCalls = 0;
    await page.evaluate(() => {
      window.__adCalls = 0;
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => { window.__adCalls++; return { reward_event_type: 'valued' }; };
    });
    await page.click('[data-set-theme="nebula-gold"]');
    adCalls = await page.evaluate(() => window.__adCalls);
    assert.equal(adCalls, 0, 'Clicking locked theme must NOT auto-launch ad');
    assert.equal(await page.isVisible('#theme-trial-bar'), true);

    await page.click('#theme-trial-btn');
    await page.waitForTimeout(100);
    adCalls = await page.evaluate(() => window.__adCalls);
    assert.equal(adCalls, 1);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'nebula-gold');
    assert.equal(await page.isVisible('#theme-trial-bar'), false);

    // Browser players can discover both games without opening Telegram.
    const promoUrls = await page.evaluate(() => [...document.querySelectorAll('.promo-link')].map((a) => a.getAttribute('href')));
    assert.ok(promoUrls.some((u) => u.endsWith('/football-quiz-tma/?ref=from_orbit')));
    assert.ok(promoUrls.some((u) => u.endsWith('/apex-serpent-royale/?ref=from_orbit')));

    // Test Game Over flows (2x Final Score capped 1x/orbit + Bonus Shuffle persisted across Play again)
    await page.evaluate((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
    }, makeFullOrbitState(400));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);

    assert.equal(await page.isVisible('#gameover'), true);
    assert.equal(await page.isVisible('#ad-double-score'), true);
    assert.equal(await page.isVisible('#ad-bonus-shuffle'), true);

    // Reject 2x Score -> stays 400
    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'skip' }); });
    await page.click('#ad-double-score');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#score'), '400');

    // Accept 2x Score -> 800 & disabled (1x/orbit)
    await page.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => ({ reward_event_type: 'valued' }); });
    await page.click('#ad-double-score');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#score'), '800');
    assert.equal(await page.isDisabled('#ad-double-score'), true);

    // Accept Bonus Shuffle -> Restart -> starts with 2 free shuffles
    await page.evaluate(() => sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'));
    await page.click('#ad-bonus-shuffle');
    await page.waitForTimeout(100);
    assert.equal(await page.isDisabled('#ad-bonus-shuffle'), true);
    await page.click('#restart');
    await page.waitForTimeout(100);
    assert.equal(await page.textContent('#shuffle-count'), '2 free');

    // Verify zero unprompted popups & zero alerts throughout all interactions
    assert.deepEqual(popups, []);
    assert.deepEqual(alerts, []);
    await context.close();

    // Test 2: Compact viewport hides .over .cross-promo while keeping gameover buttons usable
    const compactCtx = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const compactPage = await compactCtx.newPage();
    await compactPage.route('**/*libtl.com/**', (route) => route.abort());
    await compactPage.route('**/*telegram.org/**', (route) => route.abort());
    await compactPage.addInitScript((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
    }, makeFullOrbitState(500));
    await compactPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await compactPage.waitForTimeout(150);
    assert.equal(await compactPage.isVisible('#gameover .cross-promo'), false, '.over .cross-promo hidden on 320x568');
    await compactCtx.close();

    // Test 3: Telegram shareToStory & openTelegramLink behavior when mocked
    const tgCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const tgPage = await tgCtx.newPage();
    await tgPage.route('**/*libtl.com/**', (route) => route.abort());
    await tgPage.route('**/*telegram.org/**', (route) => route.abort());
    await tgPage.addInitScript((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
      window.__tgCalls = [];
      window.Telegram = {
        WebApp: {
          initData: 'query_id=123',
          ready() {},
          expand() {},
          setHeaderColor() {},
          setBackgroundColor() {},
          openTelegramLink(url) { window.__tgCalls.push(['openTelegramLink', url]); },
          openLink(url) { window.__tgCalls.push(['openLink', url]); },
          shareToStory(media, params) { window.__tgCalls.push(['shareToStory', media, params]); }
        }
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { window.__copiedShareLink = String(text); }
      }});
    }, makeFullOrbitState(600));
    await tgPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await tgPage.waitForTimeout(150);
    assert.equal(await tgPage.isVisible('#gameover-story'), true);
    assert.equal(await tgPage.isVisible('#gameover-share-whatsapp'), true);
    assert.equal(await tgPage.isVisible('#gameover-share-x'), true);
    assert.equal(await tgPage.isVisible('#gameover-copy'), true);
    await tgPage.click('#gameover-share');
    await tgPage.click('#gameover-share-whatsapp');
    await tgPage.click('#gameover-share-x');
    await tgPage.click('#gameover-copy');
    await tgPage.click('#gameover-story');
    await tgPage.waitForFunction(() => Boolean(window.__copiedShareLink));
    const calls = await tgPage.evaluate(() => window.__tgCalls);
    assert.ok(calls.some(([fn, u]) => fn === 'openTelegramLink' && u.includes('beat_600')));
    assert.ok(calls.some(([fn, u]) => fn === 'openLink' && u.includes('api.whatsapp.com/send?text=') && u.includes('%3Fbeat%3D600')));
    assert.ok(calls.some(([fn, u]) => fn === 'openLink' && u.includes('twitter.com/intent/tweet') && u.includes('%3Fbeat%3D600')));
    assert.ok((await tgPage.evaluate(() => window.__copiedShareLink)).includes('beat=600'));
    assert.ok(calls.some(([fn, m, p]) => fn === 'shareToStory' && m.includes('game_banner.png') && p.widget_link.url.includes('beat_600')));
    await tgCtx.close();

    // Copying a link is not a share-channel action and should not award the share bonus.
    const copyCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const copyPage = await copyCtx.newPage();
    await copyPage.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { window.__copiedShareLink = String(text); }
      }});
    });
    await copyPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await copyPage.waitForTimeout(150);
    await copyPage.click('[data-view="records"]');
    await copyPage.click('#records-share-copy');
    await copyPage.waitForFunction(() => Boolean(window.__copiedShareLink));
    const copyOnlyState = await copyPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.notEqual(copyOnlyState.records.shareBonus, true);
    assert.doesNotMatch(await copyPage.textContent('#status'), /Share bonus/);
    await copyCtx.close();

    // Test 4: Denied #theme-trial-btn feedback persists after render()
    const trialCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const trialPage = await trialCtx.newPage();
    await trialPage.route('**/*libtl.com/**', (route) => route.abort());
    await trialPage.route('**/*telegram.org/**', (route) => route.abort());
    await trialPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await trialPage.waitForTimeout(150);
    await trialPage.click('[data-view="records"]');
    await trialPage.click('[data-set-theme="void-eclipse"]');
    await trialPage.evaluate(() => { sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => false; });
    await trialPage.click('#theme-trial-btn');
    await trialPage.waitForTimeout(100);
    assert.match(await trialPage.textContent('#theme-trial-text'), /Ad not completed\. 24h trial was not unlocked\./);
    assert.match(await trialPage.textContent('#status'), /Ad not completed\. 24h trial was not unlocked\./);
    await trialCtx.close();

    // Test 5: Listeners attach BEFORE top-level await /api/config resolves
    const raceCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const racePage = await raceCtx.newPage();
    await racePage.route('**/*libtl.com/**', (route) => route.abort());
    await racePage.route('**/*telegram.org/**', (route) => route.abort());
    let releaseConfig;
    const configGate = new Promise((r) => { releaseConfig = r; });
    await racePage.route('**/api/config', async (route) => {
      await configGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ payments: false, botUsername: 'OrbitMergeAjayBot', monetag: { zone: '12304789', scriptUrl: 'https://libtl.com/sdk.js' } })
      });
    });
    await racePage.addInitScript((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
      window.__raceAdCalls = 0;
      sessionStorage.removeItem('orbit_merge_rewarded_last_valued_ts'); window.show_12304789 = async () => { window.__raceAdCalls++; return { reward_event_type: 'valued' }; };
    }, makeFullOrbitState(400));
    await racePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    assert.equal(await racePage.isDisabled('#ad-double-score'), true);
    assert.equal(await racePage.evaluate(() => window.__raceAdCalls), 0);
    releaseConfig();
    await racePage.click('#ad-double-score');
    await racePage.waitForFunction(() => document.querySelector('#score').textContent === '800');
    assert.equal(await racePage.evaluate(() => window.__raceAdCalls), 1);
    assert.equal(await racePage.textContent('#score'), '800');
    await racePage.waitForTimeout(100);
    await raceCtx.close();

    // Test 6: Async telegram-web-app.js late load initializes WebApp without blocking domcontentloaded
    const lateTgCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const lateTgPage = await lateTgCtx.newPage();
    await lateTgPage.route('**/*libtl.com/**', (route) => route.abort());
    let releaseTelegram;
    const telegramGate = new Promise(resolve => { releaseTelegram = resolve; });
    await lateTgPage.route('**/*telegram.org/js/telegram-web-app.js', async (route) => {
      await telegramGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.Telegram = { WebApp: { initData: 'query_id=late', ready() { window.__tgReady = true; }, expand() { window.__tgExpanded = true; }, setHeaderColor() {}, setBackgroundColor() {}, shareToStory() {} } };`
      });
    });
    try {
      await lateTgPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      assert.equal(await lateTgPage.isVisible('#board'), true);
      assert.equal(await lateTgPage.evaluate(() => window.__tgReady), undefined);
    } finally {
      releaseTelegram();
    }
    await lateTgPage.waitForFunction(() => window.__tgReady && window.__tgExpanded);
    await lateTgPage.click('[data-view="records"]');
    assert.equal(await lateTgPage.isVisible('#share-story'), true);
    await lateTgCtx.close();

    // Test 7: pending + account === null recovery, #undo retry, #new clear, and starsBackendActive() hiding ads
    const pendingCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pendingPage = await pendingCtx.newPage();
    await pendingPage.route('**/*libtl.com/**', (route) => route.abort());
    await pendingPage.route('**/*telegram.org/**', (route) => route.abort());
    let accountMode = 'fail';
    let consumeMode = 'ok';
    let consumeOkCalls = 0;
    await pendingPage.route('**/api/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ payments: true, botUsername: 'OrbitMergeAjayBot', monetag: { zone: '12304789', scriptUrl: 'https://libtl.com/sdk.js' } })
      });
    });
    await pendingPage.route('**/api/account', async (route) => {
      if (accountMode === 'fail') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Account unavailable' }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ undos: 0, shuffles: 0, rescues: 0 }) });
      }
    });
    await pendingPage.route('**/api/consume', async (route) => {
      if (consumeMode === 'abort') {
        await route.abort('failed');
      } else {
        consumeOkCalls++;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ undos: 1, shuffles: 0, rescues: 0 }) });
      }
    });

    const boardWithTwoDrops = Array(30).fill(0);
    boardWithTwoDrops[25] = 1;
    boardWithTwoDrops[26] = 2;
    const prevBoard = Array(30).fill(0);
    prevBoard[25] = 1;
    const pendingState = {
      game: {
        seed: 42,
        board: boardWithTwoDrops,
        score: 0,
        drops: 2,
        merges: 0,
        history: [{ board: prevBoard, score: 0, drops: 1, merges: 0 }],
        over: false
      },
      records: { best: 0, largest: 2, games: 1, merges: 0, missionIdx: 0, theme: 'default', streak: { count: 0, lastClaimDate: '', lastAdBoostDate: '' }, unlockedThemes: [], themeTrials: {} },
      freeUndo: 0,
      freeShuffle: 0,
      pending: {
        kind: 'undos',
        request_id: '11111111-1111-4111-8111-111111111111',
        game: {
          seed: 42,
          board: boardWithTwoDrops,
          score: 0,
          drops: 2,
          merges: 0,
          history: [{ board: prevBoard, score: 0, drops: 1, merges: 0 }],
          over: false
        }
      },
      pendingNextShuffle: 0
    };

    // 7a: Startup recovers pending undo even when /api/account returns 500
    await pendingPage.addInitScript((state) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
      }
      window.Telegram = { WebApp: { initData: 'query_id=123', ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {} } };
    }, pendingState);
    await pendingPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pendingPage.waitForFunction(() => JSON.parse(localStorage.getItem('orbit-merge-v1')).pending === null);
    const afterAutoRecover = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterAutoRecover.pending, null, 'Startup must recover pending booster even if /api/account failed');
    assert.equal(afterAutoRecover.game.drops, 1);

    // 7b: Transient /api/consume failure leaves pending, #undo retries even with account === null
    consumeMode = 'abort';
    await pendingPage.evaluate((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
    }, pendingState);
    await pendingPage.reload({ waitUntil: 'domcontentloaded' });
    await pendingPage.waitForFunction(() => document.querySelector('#status').textContent.includes('Press its button again'));
    consumeMode = 'ok';
    await pendingPage.click('#undo');
    await pendingPage.waitForFunction(() => JSON.parse(localStorage.getItem('orbit-merge-v1')).pending === null);
    const afterRetry = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterRetry.pending, null, '#undo retry must clear pending even when /api/account failed');
    assert.equal(afterRetry.game.drops, 1);

    // 7c: Confirming #new clears pending if network remains down, unblocking play()
    consumeMode = 'abort';
    await pendingPage.evaluate((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
    }, pendingState);
    await pendingPage.reload({ waitUntil: 'domcontentloaded' });
    await pendingPage.waitForTimeout(200);
    pendingPage.once('dialog', async (d) => { await d.accept(); });
    await pendingPage.click('#new');
    await pendingPage.waitForTimeout(100);
    await pendingPage.click('.lane[data-col="2"]');
    const afterNew = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterNew.pending, null);
    assert.equal(afterNew.game.drops, 1);

    // 7d: starsBackendActive() keeps #ad-undo and #ad-shuffle hidden when Stars backend is active
    accountMode = 'ok';
    await pendingPage.evaluate((state) => {
      state.pending = null;
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
    }, pendingState);
    await pendingPage.reload({ waitUntil: 'domcontentloaded' });
    await pendingPage.waitForTimeout(200);
    assert.equal(await pendingPage.textContent('#mode'), 'TELEGRAM');
    assert.equal(await pendingPage.isVisible('#ad-undo'), false);
    assert.equal(await pendingPage.isVisible('#ad-shuffle'), false);

    // 7e: EDGE_PENDING_FREE_UNDO — earning freeUndo while pending 'undos' is unresolved must NOT consume freeUndo before resolving pending
    accountMode = 'fail';
    consumeMode = 'abort';
    await pendingPage.evaluate((state) => {
      localStorage.setItem('orbit-merge-v1', JSON.stringify(state));
    }, pendingState);
    await pendingPage.reload({ waitUntil: 'domcontentloaded' });
    await pendingPage.waitForTimeout(200);
    await pendingPage.click('[data-view="shop"]');
    await pendingPage.click('#streak-claim-btn');
    await pendingPage.waitForTimeout(100);
    await pendingPage.click('[data-view="play"]');
    assert.equal(await pendingPage.isDisabled('#undo'), false, '#undo must remain enabled when pending is undos and freeUndo > 0');
    consumeMode = 'ok';
    const callsBeforeUndo = consumeOkCalls;
    await pendingPage.click('#undo');
    await pendingPage.waitForTimeout(200);
    assert.equal(consumeOkCalls, callsBeforeUndo + 1, 'First #undo click must resolve pending via /api/consume');
    const afterEdgeUndo = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterEdgeUndo.pending, null, 'pending must be cleared on first #undo click');
    assert.equal(afterEdgeUndo.freeUndo, 1, 'Earned freeUndo must be preserved when resolving pending');
    assert.equal(afterEdgeUndo.game.drops, 1, 'Pending undo must revert drop count');
    await pendingPage.click('.lane[data-col="2"]');
    const afterEdgeDrop = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterEdgeDrop.game.drops, 2, 'play() must be unblocked after pending resolves');

    // 7f: Mismatched pending ('shuffles') + freeUndo > 0 + freeShuffle > 0: #undo warns without consuming freeUndo, #shuffle resolves pending without consuming freeShuffle
    consumeMode = 'abort';
    await pendingPage.evaluate((state) => {
      const s = structuredClone(state);
      s.freeUndo = 1;
      s.freeShuffle = 1;
      s.pending.kind = 'shuffles';
      localStorage.setItem('orbit-merge-v1', JSON.stringify(s));
    }, pendingState);
    await pendingPage.reload({ waitUntil: 'domcontentloaded' });
    await pendingPage.waitForTimeout(200);
    await pendingPage.click('#undo');
    await pendingPage.waitForTimeout(100);
    assert.match(await pendingPage.textContent('#status'), /Finish your pending booster by pressing its button again/);
    const afterMismatchUndo = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterMismatchUndo.freeUndo, 1, 'Mismatched #undo must not consume freeUndo while pending shuffles is active');
    assert.equal(afterMismatchUndo.pending?.kind, 'shuffles');
    consumeMode = 'ok';
    const callsBeforeShuffle = consumeOkCalls;
    await pendingPage.click('#shuffle');
    await pendingPage.waitForTimeout(200);
    assert.equal(consumeOkCalls, callsBeforeShuffle + 1, 'First #shuffle click must resolve pending via /api/consume');
    const afterEdgeShuffle = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterEdgeShuffle.pending, null);
    assert.equal(afterEdgeShuffle.freeShuffle, 1, 'freeShuffle must be preserved when resolving pending shuffles');
    await pendingPage.click('.lane[data-col="2"]');
    const afterShuffleDrop = await pendingPage.evaluate(() => JSON.parse(localStorage.getItem('orbit-merge-v1')));
    assert.equal(afterShuffleDrop.game.drops, 3, 'play() must be unblocked after pending shuffles resolves');

    await pendingCtx.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
