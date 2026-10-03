// Desktop menus (all of them: shops, crystal, market, starship travel, map, journal, settings, help, workshop, kitchen)
// dock right without dimming, and the hero stays clear of them (dialog-dock.ts); confirmations stay centred; phones keep the bottom
// sheet. Needs a running DEV server and Playwright, so it only runs when HUD_LAYOUT_URL is set (see hud-layout.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const url = process.env.HUD_LAYOUT_URL;
const DESKTOP = [[1440, 900], [1280, 720], [1920, 1080]];
const PANELS = ['bag', 'wardrobe', 'shop', 'looks', 'upgrade', 'sell', 'travel', 'map', 'quests', 'settings', 'help', 'craft', 'cook'];

async function chromium() {
  const given = process.env.PLAYWRIGHT_MODULE;
  const pw = await import(given ? pathToFileURL(given).href : 'playwright');
  return pw.chromium ?? pw.default.chromium;
}

async function startGame(browser, view) {
  const page = await (await browser.newContext(view)).newPage();
  await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
  await page.click('#title-screen button.primary');
  await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  return page;
}

/** Opens a panel, waits for the framing to settle, and returns the panel box, the hero's projected box and the layer look. */
async function measure(page, type) {
  await page.evaluate(type => { document.querySelector('[data-action="close"]')?.click(); window.__zoo.panel(type); }, type);
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const w = window.__zoo.world, V = w.position.constructor; let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    w.player.updateMatrixWorld(true);
    w.player.traverse(o => { if (!o.isMesh || !o.visible) return; const g = o.geometry; g.boundingBox || g.computeBoundingBox(); const bb = g.boundingBox;
      for (let i = 0; i < 8; i++) { const p = new V(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).project(w.camera);
        const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight; l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); } });
    const d = document.querySelector('#dialog').getBoundingClientRect(), cs = getComputedStyle(document.querySelector('#dialog-layer'));
    return { open: !document.querySelector('#dialog-layer').hidden, hero: { l, t, r, b }, panel: { l: d.left, t: d.top, r: d.right, b: d.bottom }, bg: cs.backgroundColor, blur: cs.backdropFilter, W: innerWidth, H: innerHeight };
  });
}

for (const [width, height] of DESKTOP) {
  test(`desktop menus dock right and leave the hero clear at ${width}x${height}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const page = await startGame(browser, { viewport: { width, height }, deviceScaleFactor: 1 });
      for (const type of PANELS) {
        const m = await measure(page, type);
        assert.ok(m.open, `${type} opens`);
        assert.ok(m.panel.r > m.W - 40 && m.panel.l > m.W * .4, `${type} docks to the right: ${JSON.stringify(m.panel)}`);
        assert.equal(m.bg, 'rgba(0, 0, 0, 0)', `${type} does not dim the world`); assert.equal(m.blur, 'none', `${type} does not blur the world`);
        assert.ok(m.hero.r < m.panel.l && m.hero.l > 0 && m.hero.t > 0, `${type}: the hero ${JSON.stringify(m.hero)} is clear of the panel ${JSON.stringify(m.panel)}`);
      }
      await page.keyboard.press('Escape');
      assert.ok(await page.evaluate(() => document.querySelector('#dialog-layer').hidden), 'Escape closes the docked panel');
      // A confirmation (Start a new adventure) stays centred over a dimmed world.
      await page.evaluate(() => { window.__zoo.panel('settings'); document.querySelector('[data-action="reset-confirm"]').click(); });
      await page.waitForTimeout(500);
      const reset = await page.evaluate(() => { const d = document.querySelector('#dialog').getBoundingClientRect(), layer = document.querySelector('#dialog-layer'); return { docked: layer.classList.contains("docked"), cls: layer.className, mid: (d.left + d.right) / 2, bg: getComputedStyle(layer).backgroundColor, W: innerWidth }; });
      assert.equal(reset.docked, false, 'the reset confirmation is not docked'); assert.ok(Math.abs(reset.mid - reset.W / 2) < 2, `centred: ${JSON.stringify(reset)}`); assert.notEqual(reset.bg, 'rgba(0, 0, 0, 0)', 'and dims the world');
      await page.keyboard.press('Escape');
    } finally { await browser.close(); }
  });
}

test('phones keep the bottom sheet for the bag', { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
  const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await startGame(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const m = await measure(page, 'bag');
    assert.ok(Math.abs(m.panel.l) < 1 && Math.abs(m.panel.r - m.W) < 1 && Math.abs(m.panel.b - m.H) < 1, `bottom sheet spans the width: ${JSON.stringify(m.panel)}`);
    assert.notEqual(m.bg, 'rgba(0, 0, 0, 0)', 'phones keep the dim behind the sheet');
  } finally { await browser.close(); }
});
