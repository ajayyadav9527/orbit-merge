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

test('zero header ad collisions across all 5 responsive viewports including dialog and app', async () => {
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
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Verify header banner presence and dimensions
      const initialLayout = await page.evaluate(() => {
        const header = document.getElementById('fixed-header-ad-bar');
        const app = document.querySelector('.app');
        const intro = document.querySelector('.intro');
        const hBox = header ? header.getBoundingClientRect() : null;
        const aBox = app ? app.getBoundingClientRect() : null;
        const iBox = (intro && window.getComputedStyle(intro).display !== 'none') ? intro.getBoundingClientRect() : null;
        return {
          hasHeader: !!header,
          headerHeight: hBox ? hBox.height : 0,
          headerBottom: hBox ? hBox.bottom : 0,
          appTop: aBox ? aBox.top : 0,
          hasIntro: !!iBox,
          introTop: iBox ? iBox.top : 0
        };
      });

      assert.ok(initialLayout.hasHeader, `${vp.name}: header ad banner exists`);
      assert.ok(initialLayout.headerHeight >= vp.minHeaderH, `${vp.name}: header height (${initialLayout.headerHeight}) >= ${vp.minHeaderH}`);
      assert.ok(initialLayout.appTop >= initialLayout.headerBottom, `${vp.name}: app top (${initialLayout.appTop}) >= header bottom (${initialLayout.headerBottom})`);
      if (initialLayout.hasIntro) {
        assert.ok(initialLayout.introTop >= initialLayout.headerBottom, `${vp.name}: intro top (${initialLayout.introTop}) >= header bottom (${initialLayout.headerBottom})`);
      }

      // Open Help Dialog and verify zero collision
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
      assert.ok(dialogLayout.dialogTop >= dialogLayout.headerBottom, `${vp.name}: dialog top (${dialogLayout.dialogTop}) >= header bottom (${dialogLayout.headerBottom})`);

      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
