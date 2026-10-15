// Browser check of Rescue Call's fitted camera and compact build drawer (rescue-camera.ts, rescue.css). Like
// hud-layout.test.mjs it needs a running DEV server and Playwright, so it only runs when HUD_LAYOUT_URL is set:
//   HUD_LAYOUT_URL=http://127.0.0.1:5551/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/rescue-view-browser.test.mjs
// At phone portrait, phone landscape and desktop sizes, with the drawer open, folded and during a wave: every route
// point and pad is on screen, the lane end is clear of the drawer and the HUD, the drawer covers at most a quarter of the
// screen, raiders come from the top (portrait) or the right (landscape), and the stick still walks screen-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const url = process.env.HUD_LAYOUT_URL;
const save = readFileSync(new URL('../promo/save.json', import.meta.url), 'utf8');
const VIEWS = {
  'phone portrait 390x844': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone landscape 844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop 1600x900': { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
};
async function chromium() {
  const given = process.env.PLAYWRIGHT_MODULE, pw = await import(given ? pathToFileURL(given).href : 'playwright');
  return pw.chromium ?? pw.default.chromium;
}
/** In the page: where the route, the pads and the lane end are on screen, and what covers them. */
function measure() {
  const w = window.__zoo.world, cam = w.camera, view = window.__rescue.view, field = w.scene.getObjectByName('rescue-field');
  const v = cam.position.clone(), W = innerWidth, H = innerHeight;
  const box = el => { if (!el || el.hidden) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? b : null; };
  const panel = box(document.getElementById('rescue-build')), hud = box(document.getElementById('rescue-hud'));
  const proj = p => { v.set(p.x, 0, p.z).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
  const inside = (b, s) => !!b && s.x >= b.left && s.x <= b.right && s.y >= b.top && s.y <= b.bottom;
  let off = 0; for (const p of view.points) { const s = proj(p); if (s.x < -1 || s.x > W + 1 || s.y < -1 || s.y > H + 1) off++; }
  // Your end: the last point of the samples is the camp's yard (rescue.ts fieldPoints).
  const end = proj(view.points[view.points.length - 1]);
  // Lane direction: the field root turns the field; landscape-local +x is the raiders' side.
  const a = field.localToWorld(v.set(28, 0, 0)).clone(), b = field.localToWorld(v.set(-28, 0, 0)).clone();
  const ra = proj(a), rb = proj(b);
  return { off, n: view.points.length, whole: view.whole, pxPerM: view.pxPerM, endUnderUi: inside(panel, end) || inside(hud, end), endOnScreen: end.x >= 0 && end.x <= W && end.y >= 0 && end.y <= H,
    panelShare: panel ? panel.width * panel.height / (W * H) : 0, raidersFrom: { dx: ra.x - rb.x, dy: ra.y - rb.y }, orient: window.__rescue.orientation };
}

for (const [name, view] of Object.entries(VIEWS)) {
  test(`Rescue camera fits the whole route and the drawer stays compact at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 180000 }, async () => {
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const ctx = await browser.newContext(view);
      await ctx.addInitScript(s => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en'); } catch { /* fine */ } }, save);
      const page = await ctx.newPage();
      await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('[data-action="start"]', { state: 'visible', timeout: 60000 });
      await page.click('[data-action="start"]');
      await page.waitForFunction(() => !!window.__zoo?.world && !!window.__rescue, null, { timeout: 30000 });
      await page.waitForTimeout(3000);
      assert.ok(await page.evaluate(() => { window.__zoo.world.onDamage = () => {}; return window.__rescue.quickStart('toy'); }), 'the mission starts');
      await page.evaluate(() => { window.__rescue.give(800, 10); window.__rescue.autoBuild(); window.__rescue.selectPad(0); });
      await page.waitForTimeout(2500);
      const W = view.viewport.width, H = view.viewport.height, portrait = H > W;
      const check = (r, label) => {
        assert.equal(r.off, 0, `${label}: ${r.off} of ${r.n} route and pad points off screen`);
        assert.ok(r.endOnScreen && !r.endUnderUi, `${label}: the lane end is on screen and clear of the drawer and HUD`);
        assert.ok(r.pxPerM >= 11, `${label}: readable scale (${r.pxPerM.toFixed(1)} px/m)`);
        assert.ok(r.panelShare <= .25, `${label}: the drawer covers ${(r.panelShare * 100).toFixed(0)}% of the screen`);
        if (portrait) assert.ok(-r.raidersFrom.dy > Math.abs(r.raidersFrom.dx) * 2, `${label}: raiders come from the top`);
        else assert.ok(r.raidersFrom.dx > Math.abs(r.raidersFrom.dy) * 2, `${label}: raiders come from the right`);
      };
      const open = await page.evaluate(measure); check(open, 'drawer open');
      assert.equal(open.orient, portrait ? 'portrait' : 'landscape');
      if (W >= 900) assert.equal(open.whole, true, 'a desktop sees the whole field at once');
      await page.evaluate(() => document.querySelector('#rescue-build .fold')?.click()); await page.waitForTimeout(1200);
      check(await page.evaluate(measure), 'drawer folded');
      await page.evaluate(() => window.__rescue.skipBuild()); await page.waitForTimeout(4000);
      check(await page.evaluate(measure), 'wave');
      // The camera never turns: holding "up" walks the explorer up the screen (screen-relative controls).
      const before = await page.evaluate(() => { const p = window.__zoo.world.position, v = p.clone().project(window.__zoo.world.camera); return v.y; });
      await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW'); await page.waitForTimeout(200);
      const after = await page.evaluate(() => { const p = window.__zoo.world.position, v = p.clone().project(window.__zoo.world.camera); return v.y; });
      assert.ok(after > before, `W walks up the screen (${before.toFixed(3)} → ${after.toFixed(3)})`);
    } finally { await browser.close(); }
  });
}
