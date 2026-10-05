// Real-browser regression for translated phone panels. Run with HUD_LAYOUT_URL
// and PLAYWRIGHT_MODULE just like hud-layout.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dismissWelcome } from './browser-start.mjs';

const url = process.env.HUD_LAYOUT_URL;
const panels = ['bag', 'wardrobe', 'shop', 'looks', 'upgrade', 'sell', 'travel', 'map', 'quests', 'settings', 'help', 'craft', 'cook', 'chest'];
for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
  test(`English and Vietnamese menus fit and scroll on touch ${width}x${height}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 180000 }, async () => {
    const given = process.env.PLAYWRIGHT_MODULE;
    const pw = await import(given ? pathToFileURL(given).href : 'playwright');
    const browser = await (pw.chromium ?? pw.default.chromium).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      for (const lang of ['en', 'vi']) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        await page.addInitScript(lang => { localStorage.setItem('cute-game-language', lang); localStorage.setItem('cute-game-neighbours-on', '0'); }, lang);
        await page.routeWebSocket(u => new URL(u).searchParams.has('token'), () => {});
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => !document.querySelector('#title-screen').inert);
        // The short title card scrolls: its final action must remain reachable by a real tap.
        await page.locator('#title-screen button.primary').tap();
        await page.waitForFunction(() => !!window.__zoo?.world);
        await dismissWelcome(page);
        await page.evaluate(() => { window.__zoo.world.onDamage = () => {}; });
        for (const panel of panels) {
          await page.evaluate(panel => window.__zoo.panel(panel), panel);
          await page.waitForTimeout(300);
          const result = await page.evaluate(() => {
            const dialog = document.querySelector('#dialog'), body = document.querySelector('#dialog-body');
            const r = dialog.getBoundingClientRect();
            const stats = [...body.querySelectorAll('.stat-strip > span')].map(el => ({ text: el.textContent, fits: el.scrollWidth <= el.clientWidth + 1 }));
            const options = [...body.querySelectorAll('.segmented button')].map(el => {
              const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
              return { text: el.textContent, fits: r.left >= p.left && r.right <= p.right, height: r.height };
            });
            body.lastElementChild.scrollIntoView({ block: 'end' });
            const last = body.lastElementChild.getBoundingClientRect(), b = body.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: body.scrollWidth - body.clientWidth, lastReachable: last.bottom <= b.bottom + 1, stats, options };
          });
          assert.ok(result.left >= 0 && result.right <= width && result.top >= 0 && result.bottom <= height + 1, `${lang} ${panel}: on screen ${JSON.stringify(result)}`);
          assert.ok(result.overflow <= 1, `${lang} ${panel}: no horizontal scrolling ${JSON.stringify(result)}`);
          assert.ok(result.lastReachable, `${lang} ${panel}: last content reachable`);
          assert.ok(result.stats.every(s => s.fits), `${lang} ${panel}: complete stat labels ${JSON.stringify(result.stats)}`);
          assert.ok(result.options.every(s => s.fits && s.height >= 44), `${lang} ${panel}: wrapped options have separate touch targets ${JSON.stringify(result.options)}`);
          await page.locator('#dialog .close-button').tap();
        }
        // Synthetic inset values exercise the same variables populated by notched devices.
        await page.addStyleTag({ content: ':root { --safe-top: 24px; --safe-bottom: 34px; }' });
        await page.evaluate(() => window.__zoo.panel('settings'));
        await page.waitForTimeout(300);
        const safe = await page.evaluate(() => {
          const body = document.querySelector('#dialog-body'); body.scrollTop = body.scrollHeight;
          return { closeTop: document.querySelector('#dialog .close-button').getBoundingClientRect().top, lastBottom: body.lastElementChild.getBoundingClientRect().bottom };
        });
        assert.ok(safe.closeTop >= 24 && safe.lastBottom <= height - 34, `${lang}: settings stay outside the notch and home-indicator insets ${JSON.stringify(safe)}`);
        await context.close();
      }
    } finally { await browser.close(); }
  });
}
