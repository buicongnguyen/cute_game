// Browser layout check for item grids (wardrobe, bag, chest, market). The wardrobe once squashed its grid into a strip of
// half-cut tiles: #dialog-body is a scrolling flex column and the grid, with its own max-height + overflow, was allowed to
// shrink. Needs a running DEV server and Playwright, so it only runs when HUD_LAYOUT_URL is set, for example:
//   HUD_LAYOUT_URL=http://127.0.0.1:5591/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/item-layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dismissWelcome } from './browser-start.mjs';

const url = process.env.HUD_LAYOUT_URL;
const VIEWS = {
  'desktop 1440x900': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  'phone 390x844': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'landscape 844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
async function chromium() {
  const given = process.env.PLAYWRIGHT_MODULE;
  const pw = await import(given ? pathToFileURL(given).href : 'playwright');
  return pw.chromium ?? pw.default.chromium;
}

// Runs in the page: every problem with the open panel's tiles, as strings.
const AUDIT = () => {
  const body = document.querySelector('#dialog-body'), bad = [];
  const tiles = [...body.querySelectorAll('.item-tile, .chest-slot')].filter(e => e.getClientRects().length);
  const R = tiles.map(e => e.getBoundingClientRect()), name = e => e.dataset.item;
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i], b = R[j];
    if (a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5) bad.push(`${name(tiles[i])} overlaps ${name(tiles[j])}`);
  }
  tiles.forEach((el, i) => {
    const t = R[i], icon = el.querySelector(':scope > span')?.getBoundingClientRect();
    if (t.height < 40 || t.width < 40) bad.push(`${name(el)} is only ${t.width.toFixed(0)}x${t.height.toFixed(0)}`);
    if (!icon || icon.height < 20 || icon.top < t.top - .5 || icon.bottom > t.bottom + .5 || icon.left < t.left - .5 || icon.right > t.right + .5) bad.push(`${name(el)} icon is cut`);
    // Nothing between the tile and the panel may clip it: the panel is the only scroll.
    for (let p = el.parentElement; p && p !== body; p = p.parentElement) {
      if (getComputedStyle(p).overflowY !== 'visible' && p.scrollHeight > p.clientHeight + 1) { bad.push(`${name(el)} sits in a nested scroll (${p.className})`); break; }
    }
  });
  for (const part of body.children) if (part.scrollHeight > part.clientHeight + 1 && getComputedStyle(part).overflowY !== 'visible') bad.push(`${part.className || part.tagName} is squashed`);
  return { n: tiles.length, bad: [...new Set(bad)].slice(0, 12), scrolls: body.scrollHeight > body.clientHeight + 1 };
};

for (const [name, view] of Object.entries(VIEWS)) {
  test(`item tiles are full size, never overlap and the panel scrolls at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 180000 }, async () => {
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const page = await (await browser.newContext(view)).newPage();
      await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
      await page.fill('#name-input', 'Tiles'); await page.click('#title-screen button.primary');
      await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await dismissWelcome(page); await page.waitForTimeout(2500);
      // A full wardrobe and bag, a stocked chest, and the cottage bedroom (the wardrobe's purpose note takes room too).
      await page.evaluate(async () => {
        const M = await import('/src/model.ts'), z = window.__zoo, ids = Object.keys(M.ITEMS);
        for (const id of ids) z.state.bag[id] = 3;
        z.state.storage ??= {}; for (const id of ids.slice(0, 60)) z.state.storage[id] = 2;
        z.house.enter();
      });
      await page.waitForTimeout(1500);
      for (const panel of ['wardrobe', 'bag', 'chest', 'market']) {
        await page.evaluate(p => { const z = window.__zoo; if (p === 'wardrobe') z.house.interact({ kind: 'house-wardrobe' }); else if (p === 'bag') z.dialogs.inventory(); else if (p === 'chest') z.dialogs.storage(); else z.dialogs.market(); }, panel);
        await page.waitForSelector('#dialog-layer:not([hidden])'); await page.waitForTimeout(300);
        // Picking a tile adds its card under the grid: the case the player reported.
        if (panel === 'wardrobe' || panel === 'bag') { await page.evaluate(() => document.querySelector('#dialog-body .item-tile').click()); await page.waitForTimeout(300); }
        const r = await page.evaluate(AUDIT);
        if (panel !== 'market') assert.ok(r.n > 20, `${panel} lists the items`);
        assert.deepEqual(r.bad, [], `${panel} at ${name}`);
        if (panel !== 'market') assert.ok(r.scrolls, `${panel} scrolls as one panel`);
        // The last tile can be scrolled fully into view.
        const last = await page.evaluate(() => { const body = document.querySelector('#dialog-body'), t = [...body.querySelectorAll('.item-tile, .chest-slot')].pop(); if (!t) return true; t.scrollIntoView({ block: 'nearest' }); const a = t.getBoundingClientRect(), b = body.getBoundingClientRect(); return a.top >= b.top - .5 && a.bottom <= b.bottom + .5; });
        assert.ok(last, `${panel}: the last tile is reachable at ${name}`);
        if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/items-${panel}-${view.viewport.width}x${view.viewport.height}.png` });
        await page.evaluate(() => document.querySelector('#dialog .close-button').click()); await page.waitForTimeout(200);
      }
    } finally { await browser.close(); }
  });
}
