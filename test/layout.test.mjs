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

async function auditVisibleCollisions(page, scopeSelectors) {
  return page.evaluate((selectors) => {
    const isVisible = (el) => {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      if (el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5;
    };
    const items = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        items.push({
          label: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom
        });
      }
    }
    const collisions = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xOverlap > 1 && yOverlap > 1) {
          collisions.push(`${a.label} overlaps ${b.label} (${xOverlap.toFixed(1)}x${yOverlap.toFixed(1)})`);
        }
      }
    }
    const header = document.getElementById('fixed-header-ad-bar');
    const hBox = header ? header.getBoundingClientRect() : null;
    const headerHits = [];
    if (hBox) {
      for (const item of items) {
        if (item.label === '#fixed-header-ad-bar') continue;
        const xOverlap = Math.min(hBox.right, item.right) - Math.max(hBox.left, item.left);
        const yOverlap = Math.min(hBox.bottom, item.bottom) - Math.max(hBox.top, item.top);
        if (xOverlap > 1 && yOverlap > 1) {
          headerHits.push(`${item.label} overlaps #fixed-header-ad-bar`);
        }
      }
    }
    const app = document.querySelector('.app');
    const horizontalOverflow = Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      app ? app.scrollWidth - app.clientWidth : 0
    );
    const forbiddenSocial = ['#asr-ad-social-bar', '#monetag-ipp-slot', '#adblock-detector-badge', '#ad-mobile-footer-wrapper', '#asr-ad-mobile-footer']
      .filter((s) => isVisible(document.querySelector(s)));
    return { collisions, headerHits, horizontalOverflow, forbiddenSocial };
  }, scopeSelectors);
}

test('zero header ad collisions, zero pairwise collisions, zero social bars, and fast non-blocking load across all 5 viewports', async () => {
  const rootDir = path.resolve('.');
  const server = createStaticServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/index.html`;

  const viewports = [
    { name: 'Desktop', width: 1920, height: 1080, minHeaderH: 44 },
    { name: 'Tablet', width: 768, height: 1024, minHeaderH: 44 },
    { name: 'Mobile Portrait', width: 390, height: 844, minHeaderH: 38 },
    { name: 'Mobile Landscape', width: 844, height: 390, minHeaderH: 28 },
    { name: 'Compact Mobile', width: 320, height: 568, minHeaderH: 38 }
  ];

  const browser = await chromium.launch();
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const popups = [];
      const alerts = [];
      const page = await context.newPage();
      context.on('page', (p) => { if (p !== page) popups.push(p.url()); });
      page.on('dialog', async (d) => {
        alerts.push({ type: d.type(), message: d.message() });
        await d.dismiss();
      });

      const t0 = Date.now();
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const loadMs = Date.now() - t0;
      assert.ok(loadMs < 4000, `${vp.name}: domcontentloaded took ${loadMs}ms (expected <4000ms)`);
      await page.waitForTimeout(250);

      const initialLayout = await page.evaluate(() => {
        const header = document.getElementById('fixed-header-ad-bar');
        const app = document.querySelector('.app');
        const intro = document.querySelector('.intro');
        const hBox = header ? header.getBoundingClientRect() : null;
        const aBox = app ? app.getBoundingClientRect() : null;
        const iBox = (intro && window.getComputedStyle(intro).display !== 'none') ? intro.getBoundingClientRect() : null;
        const sdk = document.querySelector('script[src*="libtl.com/sdk.js"]');
        const tgSdk = document.querySelector('script[src*="telegram-web-app.js"]');
        return {
          hasHeader: !!header,
          headerHeight: hBox ? hBox.height : 0,
          headerBottom: hBox ? hBox.bottom : 0,
          appTop: aBox ? aBox.top : 0,
          hasIntro: !!iBox,
          introTop: iBox ? iBox.top : 0,
          sdkPresent: !!sdk,
          tgSdkAsync: !!tgSdk?.async
        };
      });

      assert.equal(initialLayout.sdkPresent, false, `${vp.name}: rewarded SDK is absent on launch`);
      assert.ok(initialLayout.tgSdkAsync, `${vp.name}: Telegram WebApp SDK script has async attribute`);
      assert.ok(initialLayout.hasHeader, `${vp.name}: header ad banner exists`);
      assert.ok(initialLayout.headerHeight >= vp.minHeaderH, `${vp.name}: header height (${initialLayout.headerHeight}) >= ${vp.minHeaderH}`);
      assert.ok(initialLayout.appTop >= initialLayout.headerBottom - 0.5, `${vp.name}: app top (${initialLayout.appTop}) >= header bottom (${initialLayout.headerBottom})`);
      if (initialLayout.hasIntro) {
        assert.ok(initialLayout.introTop >= initialLayout.headerBottom - 0.5, `${vp.name}: intro top (${initialLayout.introTop}) >= header bottom (${initialLayout.headerBottom})`);
      }

      // Check #play pairwise collisions (including #board, .lane-buttons, .tools buttons)
      const playAudit = await auditVisibleCollisions(page, [
        '#fixed-header-ad-bar',
        'header .brand',
        '#sound',
        '#help',
        'nav .tab',
        '.scoreline',
        '.mission',
        '.board',
        '.lane-buttons',
        '#play .tools button',
        '#play .tools a'
      ]);
      assert.deepEqual(playAudit.collisions, [], `${vp.name} #play collisions`);
      assert.deepEqual(playAudit.headerHits, [], `${vp.name} #play header hits`);
      assert.deepEqual(playAudit.forbiddenSocial, [], `${vp.name} social bars`);
      assert.ok(playAudit.horizontalOverflow <= 1, `${vp.name} #play horizontal overflow (${playAudit.horizontalOverflow})`);

      // Switch to #shop and check streak card, daily supply, star packs, cross-promo
      await page.click('[data-view="shop"]');
      const shopAudit = await auditVisibleCollisions(page, [
        '#fixed-header-ad-bar',
        'nav .tab',
        '#streak-days .streak-day',
        '#streak-claim-btn',
        '#streak-2x-btn',
        '#streak-repair-btn',
        '#daily-supply-btn',
        '#daily-supply-2x-btn',
        '#sponsor-drop-btn',
        '[data-product]',
        '#check-purchase',
        '#shop .promo-link'
      ]);
      assert.deepEqual(shopAudit.collisions, [], `${vp.name} #shop collisions`);
      assert.deepEqual(shopAudit.headerHits, [], `${vp.name} #shop header hits`);
      assert.ok(shopAudit.horizontalOverflow <= 1, `${vp.name} #shop horizontal overflow (${shopAudit.horizontalOverflow})`);
      const streakOverflows = await page.evaluate(() => {
        return [...document.querySelectorAll('#streak-days .streak-day')]
          .map((el, i) => ({
            day: i + 1,
            text: el.textContent,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
          }))
          .filter((d) => d.scrollWidth > d.clientWidth + 1);
      });
      assert.deepEqual(streakOverflows, [], `${vp.name} #streak-days cell horizontal overflow`);

      // Switch to #records and check 5 theme buttons, share buttons, cross-promo
      await page.click('[data-view="records"]');
      const recordsAudit = await auditVisibleCollisions(page, [
        '#fixed-header-ad-bar',
        'nav .tab',
        '.theme-btn',
        '#share',
        '.share-story-action',
        '#records-share-whatsapp',
        '#records-share-x',
        '#records-share-copy',
        '#records .promo-link'
      ]);
      assert.deepEqual(recordsAudit.collisions, [], `${vp.name} #records collisions`);
      assert.deepEqual(recordsAudit.headerHits, [], `${vp.name} #records header hits`);
      assert.ok(recordsAudit.horizontalOverflow <= 1, `${vp.name} #records horizontal overflow (${recordsAudit.horizontalOverflow})`);

      // Back to #play, verify #gameover layout collisions & Help Dialog
      await page.click('[data-view="play"]');
      await page.evaluate(() => {
        const board = Array.from({ length: 30 }, (_, i) => ((Math.floor(i / 5) + (i % 5)) % 3) + 1);
        localStorage.setItem('orbit-merge-v1', JSON.stringify({
          game: { seed: 1, board, score: 500, drops: 30, merges: 4, history: [], over: true },
          records: { best: 500, largest: 4, games: 1, merges: 4, missionIdx: 0, theme: 'default', streak: { count: 0, lastClaimDate: '', lastAdBoostDate: '' }, unlockedThemes: [], themeTrials: {} },
          freeUndo: 0,
          freeShuffle: 0,
          pending: null,
          pendingNextShuffle: 0
        }));
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(150);
      const gameoverAudit = await auditVisibleCollisions(page, [
        '#fixed-header-ad-bar',
        '.board',
        '.lane-buttons',
        '#ad-undo',
        '#ad-shuffle',
        '#gameover button',
        '#gameover .promo-link'
      ]);
      assert.deepEqual(gameoverAudit.collisions, [], `${vp.name} #gameover collisions`);
      assert.deepEqual(gameoverAudit.headerHits, [], `${vp.name} #gameover header hits`);
      assert.ok(gameoverAudit.horizontalOverflow <= 1, `${vp.name} #gameover horizontal overflow (${gameoverAudit.horizontalOverflow})`);

      const dialogLayout = await page.evaluate(() => {
        const d = document.getElementById('help-dialog');
        if (d && typeof d.showModal === 'function') d.showModal();
        const header = document.getElementById('fixed-header-ad-bar');
        const hBox = header ? header.getBoundingClientRect() : null;
        const dBox = d ? d.getBoundingClientRect() : null;
        return {
          hasDialog: !!d,
          headerBottom: hBox ? hBox.bottom : 0,
          dialogTop: dBox ? dBox.top : 0,
          dialogHeight: dBox ? dBox.height : 0
        };
      });

      assert.ok(dialogLayout.hasDialog, `${vp.name}: help dialog exists`);
      assert.ok(dialogLayout.dialogTop >= dialogLayout.headerBottom - 0.5, `${vp.name}: dialog top (${dialogLayout.dialogTop}) >= header bottom (${dialogLayout.headerBottom})`);

      assert.deepEqual(popups, [], `${vp.name}: zero unprompted popups`);
      assert.deepEqual(alerts, [], `${vp.name}: zero alert/confirm dialogs`);

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
