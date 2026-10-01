// Browser layout check for the combat HUD (RU-03, C1). It needs a running DEV server and Playwright, so it only
// runs when HUD_LAYOUT_URL is set, for example:
//   npx vite --host 127.0.0.1 --port 5302 --strictPort   (in another shell)
//   HUD_LAYOUT_URL=http://127.0.0.1:5302/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/hud-layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const url = process.env.HUD_LAYOUT_URL;
const VIEWS = {
  'phone 390x844': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop 1440x900': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  'landscape 844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function chromium() {
  const given = process.env.PLAYWRIGHT_MODULE;
  const pw = await import(given ? pathToFileURL(given).href : 'playwright');
  return pw.chromium ?? pw.default.chromium;
}

for (const [name, view] of Object.entries(VIEWS)) {
  test(`boss bar and target frame stay clear of the HUD at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const page = await (await browser.newContext(view)).newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
      await page.fill('#name-input', 'Layout');
      await page.click('#title-screen button.primary');
      await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 });
      await page.waitForTimeout(4000);
      // A boss fight with a regular creature selected: both the boss bar and the target frame show.
      await page.evaluate(() => {
        const w = window.__zoo.world, s = window.__zoo.state;
        const boss = w.enemies.filter(e => e.boss && e.hp > 0).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        w.position.set(boss.x, 0, boss.z + 7); w.cameraTarget.copy(w.position); boss.hp = boss.maxHp * .8;
        const other = w.enemies.filter(e => !e.boss && e.hp > 0).sort((a, b) => Math.hypot(a.x - boss.x, a.z - boss.z) - Math.hypot(b.x - boss.x, b.z - boss.z))[0];
        setInterval(() => { s.hp = 999; boss.hp = Math.max(boss.hp, boss.maxHp * .5); other.hp = Math.max(1, other.maxHp * .5); w.selected = other; }, 100);
      });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const box = el => { const b = el.getBoundingClientRect(); return b.width && b.height && getComputedStyle(el).visibility !== 'hidden' ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
        const all = sel => [...document.querySelectorAll(sel)].filter(el => !el.closest('[hidden]')).map(box).filter(Boolean);
        const panels = { player: all('.player-card'), buttons: all('.top-actions button'), minimap: all('.minimap'), trackers: all('.tracker-stack > :not([hidden])'), skills: all('.skill'), toasts: all('.toast'), prompt: all('#context-prompt button'), pad: all('#touch-controls button'), home: all('.home-button') };
        const W = innerWidth, H = innerHeight; let hits = 0, n = 0;
        for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) { n++; const el = document.elementFromPoint(x, y); if (el && el.closest('#hud') && getComputedStyle(el).pointerEvents !== 'none') hits++; }
        return { boss: all('#boss-bar')[0] ?? null, target: all('#target-frame')[0] ?? null, panels, tappable: hits / n, W, H };
      });
      assert.ok(r.boss, 'the boss bar shows'); assert.ok(r.target, 'the target frame shows');
      const overlap = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
      for (const [what, frame] of [['boss bar', r.boss], ['target frame', r.target]]) {
        assert.ok(frame.l >= 0 && frame.r <= r.W && frame.t >= 0 && frame.b <= r.H, `${what} is on screen`);
        for (const [panel, boxes] of Object.entries(r.panels)) for (const b of boxes) assert.ok(!overlap(frame, b), `${what} overlaps ${panel} at ${name}`);
      }
      assert.ok(!overlap(r.boss, r.target), 'boss bar and target frame do not overlap');
      const mid = { l: r.W * .3, r: r.W * .7, t: r.H * .3, b: r.H * .7 };
      assert.ok(!overlap(r.target, mid), 'the target frame stays out of the middle of the screen');
      if (name.startsWith('landscape')) assert.ok(r.tappable <= .13, `tappable HUD ${(r.tappable * 100).toFixed(1)}% stays near 12% on a short screen`);
    } finally { await browser.close(); }
  });
}
