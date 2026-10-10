// HUD layout probe (stage 2 of docs/QUALITY-PLAN.md): at every target screen size, in English and Vietnamese, it measures
// each HUD piece in three states (calm, a boss fight with a target selected and a timed task running, fishing) and
// lists every pair of pieces whose boxes overlap, every piece that leaves the screen, and every touch control under 44 px.
//
//   npx vite --port 5312 --host 127.0.0.1 --strictPort        (in another shell; PROBE_URL overrides)
//   node promo/hud-probe.mjs                                   (all sizes, both languages)
//   SIZES=390x844,320x568 LANGS=vi SHOTS=out/dir node promo/hud-probe.mjs
// Exit code 1 when anything is found.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/n/source/repos/3D_claudeopus55/package.json');
const { chromium } = require('playwright');
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5312/';
const save = readFileSync(new URL('./save.json', import.meta.url), 'utf8');
import { SIZES, STATES, measureHud, findings } from '../tests/support/hud-measure.mjs';
export { SIZES, STATES, measureHud, findings };
const sizes = (process.env.SIZES || Object.keys(SIZES).join(',')).split(',');
const langs = (process.env.LANGS || 'en,vi').split(',');
const shots = process.env.SHOTS; if (shots) mkdirSync(shots, { recursive: true });

export async function openGame(browser, size, lang) {
  const [w, h, touch] = SIZES[size];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(([s, l]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', l); localStorage.setItem('cute-game-tutorial', 'done'); } catch {} }, [save, lang]);
  const page = await ctx.newPage();
  await page.routeWebSocket(u => new URL(u).searchParams.has('token'), () => {});
  await page.goto(URL_); await page.waitForSelector('[data-action="start"]', { timeout: 60000 });
  await page.evaluate(() => document.querySelector('[data-action="start"]').click());
  await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await page.waitForTimeout(6000);
  await page.evaluate(() => { document.querySelector('.tutorial,.welcome')?.remove(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); (document.querySelector('#dialog-layer [data-action="close"]') || document.querySelector('#dialog-close'))?.click(); });
  await page.waitForTimeout(400);
  return { ctx, page };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let bad = 0;
  for (const size of sizes) for (const lang of langs) {
    const { ctx, page } = await openGame(browser, size, lang);
    page.on('pageerror', e => console.log('  pageerror', e.message.slice(0, 140)));
    for (const [state, enter] of Object.entries(STATES)) {
      await enter(page);
      const m = await page.evaluate(measureHud), list = findings(m); bad += list.length;
      console.log(`${size} ${lang} ${state}: ${list.length ? '' : 'clean'} (dock ${m.dockW.trim()}, ${m.groups.dock.length} buttons)`); for (const line of list) console.log('   ' + line);
      if (shots) await page.screenshot({ path: `${shots}/${state}-${size}-${lang}.png` });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `\n${bad} findings` : '\nall clean');
  process.exit(bad ? 1 : 0);
}
