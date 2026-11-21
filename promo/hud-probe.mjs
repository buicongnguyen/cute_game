// HUD layout probe (stage 2 of docs/QUALITY-PLAN.md): at every target screen size, in English and Vietnamese, it measures
// each HUD piece in three states (calm, a boss fight with a target selected and a timed task running, fishing) and
// lists every pair of pieces whose boxes overlap, every piece that leaves the screen, every touch control under 44 px and
// every piece of text under 11 px. Then it opens the panels a player uses most (Help, backpack, journal, shop, settings) and
// lists text under 11 px and touch targets under 44 px there (AAA plan WP16).
//
//   npx vite --port 5312 --host 127.0.0.1 --strictPort        (in another shell; PROBE_URL overrides)
//   PLAYWRIGHT_MODULE=<a playwright install>/index.mjs node promo/hud-probe.mjs      (all sizes, both languages; without it "playwright" is imported)
//   SIZES=390x844,320x568 LANGS=vi SHOTS=out/dir node promo/hud-probe.mjs
//   HAND=left measures left-handed play (the stick on the right, the paw mirrored to the left).
// Exit code 1 when anything is found.
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
const playwright = () => import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright').then(pw => pw.chromium ?? pw.default.chromium);
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5312/';
const save = readFileSync(new URL('./save.json', import.meta.url), 'utf8');
import { SIZES, STATES, measureHud, measureReadable, readableFindings, findings } from '../tests/support/hud-measure.mjs';
export { SIZES, STATES, measureHud, findings };
const PANELS = ['help', 'bag', 'quests', 'shop', 'settings'];
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
  const browser = await (await playwright()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let bad = 0;
  for (const size of sizes) for (const lang of langs) {
    const { ctx, page } = await openGame(browser, size, lang);
    page.on('pageerror', e => console.log('  pageerror', e.message.slice(0, 140)));
    if (process.env.HAND === 'left') { await page.evaluate(() => { __zoo.state.settings.joystickSide = 'right'; document.querySelector('#hud').classList.add('joystick-right'); }); await page.waitForTimeout(300); }
    for (const [state, enter] of Object.entries(STATES)) {
      await enter(page);
      const m = await page.evaluate(measureHud), list = findings(m); bad += list.length;
      console.log(`${size} ${lang} ${state}: ${list.length ? '' : 'clean'} (dock ${m.dockW.trim()}, ${m.groups.dock.length} buttons)`); for (const line of list) console.log('   ' + line);
      if (shots) await page.screenshot({ path: `${shots}/${state}-${size}-${lang}${process.env.HAND === 'left' ? '-left' : ''}.png` });
    }
    await page.evaluate(() => { clearInterval(window.__probeFight); clearInterval(window.__probeChain); __zoo.resetCombat?.(); const w = __zoo.world; w.selected = null; w.position.set(0, 0, 6); w.cameraTarget.copy(w.position); }); await page.waitForTimeout(600);
    for (const panel of PANELS) {
      await page.evaluate(name => __zoo.panel(name), panel); await page.waitForTimeout(900);
      const list = readableFindings(await page.evaluate(measureReadable, '#dialog')); bad += list.length;
      console.log(`${size} ${lang} panel ${panel}: ${list.length ? '' : 'clean'}`); for (const line of list) console.log('   ' + line);
      if (shots) await page.screenshot({ path: `${shots}/panel-${panel}-${size}-${lang}.png` });
      await page.evaluate(() => (document.querySelector('#dialog-layer [data-action="close"]') || document.querySelector('#dialog-close'))?.click()); await page.waitForTimeout(350);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `\n${bad} findings` : '\nall clean');
  process.exit(bad ? 1 : 0);
}
