// The show reel (docs/AAA-PLAN.md, WP4 and WP26): six short videos of the game as it is, recorded by Playwright with the
// journey tool's hands (promo/journey.mjs), so "before" and "after" show the same script.
//
// Run against a dev server (it needs the __zoo hook):  npx vite --port 5298 --host 127.0.0.1 --strictPort
//   node promo/reel.mjs before            writes .scratch/owner/reel/before/ (a kept folder: git-ignored, never cleaned)
//   node promo/reel.mjs after             the same six clips after the round (WP26)
//   --only 1,4 records some clips again   --mid <file> the mid-game save of clip 4 (default promo/save-mid.json)
//   PORT=5298 picks the server.  PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// Clips (1600x900, filmed at 1280x720, WebM), each with a still picture of its key moment and a line in reel.json:
//   1 title-to-first-harvest   a first visit: the title, Play, planting, the first harvest and what follows it
//   2 first-fight              the fight step of chapter 1 (the story is put at that step with the wood sword)
//   3 level-up                 the same step two experience points under level 5: the first kill is a level-up
//   4 king-bear                the mid-game save: walk up to King Bear and fight for 45 s
//   5 candy-26m                the late save on Candy, walking to 26 m from the landing pad
//   6 village-late             the late save: a slow walk through the village
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { closeBrowsers, loadChromium, openPlayer, playRoute, watchdog } from './journey.mjs';

const args = process.argv.slice(2), arg = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url)), tag = args[0] && !args[0].startsWith('--') ? args[0] : 'before';
// the working folder has a name of its own, so removing it at the end can never remove something of the user's
const out = path.resolve(arg('out', `.scratch/owner/reel/${tag}`)), work = path.join(out, `.reel-work-${process.pid}-${Date.now()}`);
const only = (arg('only', '') || '').split(',').filter(Boolean).map(Number);
const midSave = path.resolve(arg('mid', path.join(here, 'save-mid.json')));
const base = `http://127.0.0.1:${process.env.PORT || 5298}/`;
let chromium; try { chromium = await loadChromium(); } catch (e) { console.error(e.message); process.exit(2); }
mkdirSync(out, { recursive: true });
const film = { recordVideo: { dir: work, size: { width: 1280, height: 720 } } };

/** A clip played by a journey route: the video, the picture of its key beat and the route's numbers. */
async function fromRoute(options, still) {
  const t = await playRoute({ chromium, base, device: 'pc', out: work, video: work, ...options });
  const picture = t.frames.find(f => f.includes(still)) ?? t.frames.at(-1);
  return { video: t.videoFile, still: picture && path.join(work, options.name, picture), errors: t.errors, numbers: { durationS: t.durationS, levelUps: t.levelUps.length, kills: t.kills, dialogs: t.dialogs.length, ...(t.fight ? { fight: t.fight } : {}), ...(t.boss ? { boss: t.boss } : {}) } };
}
/** A clip on the late save: Play, then `scene` moves the hero; the picture is taken when `scene` asks for it. */
async function fromLateSave(name, planet, scene) {
  const save = JSON.parse(readFileSync(path.join(here, 'save-late.json'), 'utf8')); save.planet = planet;
  const P = await openPlayer({ chromium, device: 'pc', save: JSON.stringify(save), base, context: film }), still = path.join(work, `${name}.png`), numbers = {};
  try {
    await P.title(); await P.wait(2500); await P.tapSel('[data-action="start"]'); await P.wait(3000); await P.closeDialogs(3); await P.wait(4000);
    numbers.planet = (await P.page.evaluate(() => __zoo.state.planet));
    await scene(P, () => P.page.screenshot({ path: still }), numbers);
  } catch (e) { P.errors.push('script: ' + e.message.slice(0, 300)); }
  const video = P.page.video(); await P.ctx.close().catch(() => {}); const file = await video.path().catch(() => null); await P.close();
  return { video: file, still: existsSync(still) ? still : null, errors: P.errors, numbers };
}
/** Walk the hero in a straight line at walking pace (the dev hook moves it; the camera follows as in play). */
const stroll = (P, to, seconds) => P.page.evaluate(async ([to, ms]) => {
  const w = __zoo.world, from = { x: w.position.x, z: w.position.z }, t0 = performance.now();
  w.facing = Math.atan2(to.x - from.x, to.z - from.z);
  await new Promise(done => { const frame = () => { const k = Math.min(1, (performance.now() - t0) / ms); w.position.set(from.x + (to.x - from.x) * k, 0, from.z + (to.z - from.z) * k); k < 1 ? requestAnimationFrame(frame) : done(); }; frame(); });
}, [to, seconds * 1000]);

const CLIPS = [
  ['title-to-first-harvest', () => fromRoute({ route: 'new', name: 'clip1', stopAt: 'first-named-dialog', holdMs: 6000, minutes: 3 }, 'first-harvest')],
  ['first-fight', () => fromRoute({ route: 'new', name: 'clip2', segment: 'fight', stopAt: 'fight-done', holdMs: 2500, minutes: 2 }, 'first-kill')],
  ['level-up', () => fromRoute({ route: 'new', name: 'clip3', segment: 'level-up', stopAt: 'level-up', holdMs: 6000, minutes: 2 }, 'level-up')],
  ['king-bear', () => existsSync(midSave) ? fromRoute({ route: 'mid', name: 'clip4', saveFile: midSave, bossSeconds: 45 }, 'boss-half') : { skipped: `no mid-game save at ${path.relative(process.cwd(), midSave)}` }],
  ['candy-26m', () => fromLateSave('clip5', 'candy', async (P, picture, numbers) => {
    const pad = await P.nearest('travel'), hero = await P.hero(), d = Math.hypot(hero.x - pad.x, hero.z - pad.z) || 1;
    await P.wait(2000);
    await stroll(P, { x: pad.x + (hero.x - pad.x) / d * 26, z: pad.z + (hero.z - pad.z) / d * 26 }, 9);
    await P.wait(1500); const at = await P.hero(); numbers.metresFromPad = Math.round(Math.hypot(at.x - pad.x, at.z - pad.z) * 10) / 10;
    await picture(); await P.wait(4000);
  })],
  ['village-late', () => fromLateSave('clip6', 'home', async (P, picture) => {
    await P.page.evaluate(() => __zoo.world.position.set(0, 0, 3.6)); await P.wait(3000); await picture();
    for (const [x, z, s] of [[-7, 3.6, 4], [-8.6, -3.2, 4], [4, -4, 5], [8, 6, 5]]) { await stroll(P, { x, z }, s); await P.wait(1200); }
  })],
];

const reportFile = path.join(out, 'reel.json'), report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};
for (const [i, [name, record]] of CLIPS.entries()) {
  const n = i + 1; if (only.length && !only.includes(n)) continue;
  const started = Date.now(), timer = watchdog(8 * 60_000, `clip ${n}`), file = `${n}-${name}`;
  const clip = await Promise.resolve().then(record).catch(e => ({ video: null, errors: ['clip: ' + e.message.slice(0, 300)], numbers: {} }));
  clearTimeout(timer); await closeBrowsers();
  if (clip.skipped) { report[file] = { skipped: clip.skipped }; console.log(file, 'SKIPPED:', clip.skipped); continue; }
  if (clip.video && existsSync(clip.video)) copyFileSync(clip.video, path.join(out, `${file}.webm`));
  if (clip.still && existsSync(clip.still)) copyFileSync(clip.still, path.join(out, `${file}.png`));
  report[file] = { recorded: new Date().toISOString().slice(0, 10), video: clip.video ? `${file}.webm` : null, ...clip.numbers, errors: clip.errors };
  console.log(file, `${Math.round((Date.now() - started) / 1000)} s`, JSON.stringify(report[file]));
  writeFileSync(reportFile, JSON.stringify(report, null, 1) + '\n');
}
writeFileSync(reportFile, JSON.stringify(report, null, 1) + '\n');
rmSync(work, { recursive: true, force: true });
if (Object.values(report).some(c => c.skipped || c.errors?.length || c.video === null)) process.exitCode = 1;
