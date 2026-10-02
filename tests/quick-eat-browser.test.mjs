// Browser check for the quick-eat HUD button and gear try-on. Like hud-layout.test.mjs it needs a running DEV server:
//   HUD_LAYOUT_URL=http://127.0.0.1:5341/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> [EVIDENCE_DIR=<folder>] node --test tests/quick-eat-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const url = process.env.HUD_LAYOUT_URL, evidence = process.env.EVIDENCE_DIR;
const VIEWS = {
  'desktop 1440x900': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  'phone 390x844': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'landscape 844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
async function chromium() { const given = process.env.PLAYWRIGHT_MODULE; const pw = await import(given ? pathToFileURL(given).href : 'playwright'); return pw.chromium ?? pw.default.chromium; }

for (const [name, view] of Object.entries(VIEWS)) {
  test(`quick eat heals from the HUD and try-on dresses the explorer without saving at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    const shot = async (page, label) => { if (evidence) await page.screenshot({ path: `${evidence}/${name.split(' ')[0]}-${label}.png` }); };
    try {
      const page = await (await browser.newContext(view)).newPage();
      await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
      await page.fill('#name-input', 'Taster');
      await page.click('#title-screen button.primary');
      await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 });
      await page.waitForTimeout(3000);
      // A hurt explorer with a small and a big food; nothing may hit them while measuring.
      await page.evaluate(() => { const z = window.__zoo, s = z.state; z.world.onDamage = () => {}; s.bag.carrot = 3; s.bag.apple = 2; s.hp = Math.round(s.hp * .4); z.toast('ready'); });
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => ({ hp: window.__zoo.state.hp, label: document.querySelector('#quick-eat').getAttribute('aria-label'), idle: document.querySelector('#quick-eat').classList.contains('idle') }));
      assert.equal(before.idle, false); assert.match(before.label, /\+\d+ HP/);
      await shot(page, '1-before-eat');
      await page.click('#quick-eat'); await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({ hp: window.__zoo.state.hp, max: document.querySelector('#hp-text').textContent, bag: { ...window.__zoo.state.bag } }));
      assert.ok(after.hp > before.hp, 'the tap heals'); assert.equal(after.bag.carrot + after.bag.apple, 4, 'one food was eaten');
      await shot(page, '2-after-eat');
      // Full health: greyed out, and a tap only explains why.
      const full = await page.evaluate(() => { const s = window.__zoo.state; s.hp = 1e6; return true; });
      await page.keyboard.press('h'); await page.waitForTimeout(300);
      const idle = await page.evaluate(() => ({ idle: document.querySelector('#quick-eat').classList.contains('idle'), bag: window.__zoo.state.bag.carrot + window.__zoo.state.bag.apple }));
      assert.ok(full && idle.idle && idle.bag === 4, 'nothing is eaten at full health');
      // Picker: choose the carrot explicitly.
      await page.click('.quick-eat-pick'); await page.waitForSelector('#quick-eat-menu:not([hidden])');
      await shot(page, '3-picker');
      await page.click('#quick-eat-menu [data-item="carrot"]');
      assert.equal(await page.evaluate(() => document.querySelector('#quick-eat').classList.contains('picked')), true);
      await page.click('.quick-eat-pick'); await page.click('#quick-eat-menu [data-item="auto"]');

      // Try on a hat in the shop.
      const savedBefore = await page.evaluate(() => { localStorage.setItem('probe', '1'); return localStorage.getItem('cute-game-save-v1'); });
      await page.evaluate(() => { const w = window.__zoo.world, shop = w.entities.find(e => e.kind === 'shop'); w.position.set(shop.x, 0, shop.z + 3.2); w.cameraTarget.copy(w.position); w.onInteract(shop); });
      await page.waitForSelector('#dialog-layer:not([hidden])');
      await page.click('[data-action="shop-tab"][data-kind="Clothing"]');
      const hat = await page.evaluate(() => document.querySelector('[data-action="try-on"][data-item^="hat_"]')?.dataset.item);
      assert.ok(hat, 'the clothing tab offers Try on for hats');
      const meshes = () => page.evaluate(() => { let n = 0; window.__zoo.world.player.traverse(o => { if (o.isMesh) n++; }); return n; });
      const plain = await meshes();
      await page.click(`[data-action="try-on"][data-item="${hat}"]`); await page.waitForTimeout(800);
      const wearing = await page.evaluate(h => ({ preview: window.__zoo.world.tryOnGear?.hat, saved: window.__zoo.state.gear.hat ?? null, layer: document.querySelector('#dialog-layer').classList.contains('trying-on'), pressed: document.querySelector(`[data-action="try-on"][data-item="${h}"]`).getAttribute('aria-pressed') }), hat);
      assert.deepEqual(wearing, { preview: hat, saved: null, layer: true, pressed: 'true' });
      assert.ok(await meshes() > plain, 'the hat is on the explorer');
      // The hero stays in view: its screen position is not covered by the panel.
      const visible = await page.evaluate(() => { const w = window.__zoo.world, p = w.player.position.clone(); p.y += 1.2; p.project(w.camera); const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight, d = document.querySelector('#dialog').getBoundingClientRect(); return { x, y, covered: x > d.left && x < d.right && y > d.top && y < d.bottom }; });
      assert.equal(visible.covered, false, `the explorer stays visible beside the panel: ${JSON.stringify(visible)}`);
      await shot(page, '4-try-on-hat');
      assert.equal(await page.evaluate(() => localStorage.getItem('cute-game-save-v1')), savedBefore, 'try-on never saves');
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.__zoo.world.tryOnGear ?? null), null, 'closing reverts the try-on');
      assert.equal(await meshes(), plain, 'the explorer is back in their own gear');
      // Buying (and so equipping) the hat shows it on the explorer at once.
      await page.evaluate(() => { window.__zoo.state.energy = 1e6; const w = window.__zoo.world; w.onInteract(w.entities.find(e => e.kind === 'shop')); });
      await page.click('[data-action="shop-tab"][data-kind="Clothing"]');
      await page.click(`[data-action="buy"][data-item="${hat}"]`); await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => window.__zoo.state.gear.hat), hat);
      assert.ok(await meshes() > plain, 'the bought hat is worn');
    } finally { await browser.close(); }
  });
}
