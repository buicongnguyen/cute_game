// Creature voices and the low-health warning in the real game (AAA-PLAN WP12, docs/SOUNDS.md "Creature voices").
// promo/loudness.mjs measures how loud each voice is; this plays the game in Chromium, on a desktop and under phone
// emulation, and counts what a build machine can count:
//   1. a fight with twelve creatures, music on: voices started per second, the most at once, what the pauses left out,
//      and the sounds the shared voice counter refused (audioGraph().stats.capped);
//   2. King Bear on the mid-game save: every telegraph with its length, whether its voice started, and how long the
//      wind-up really lasted on the page's clock;
//   3. the low-health warning: where it comes and goes as the bar falls and rises, a bar held at exactly a quarter,
//      the heartbeats in the five seconds after a blow and none ten seconds after it, and two screenshots (.scratch/voice-probe/);
//   4. one AudioContext for all of it, and no request made by any of it.
//
//   ONLY=phone keeps one profile; FIGHT=1 runs only the fight; VOICES=off silences the creature voices in the fight, for the
//   number of refused sounds the same fight has without them (the fight is played in real time: run it a few times).
//   PORT=<dev server port> node promo/voice-probe.mjs            (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if needed)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const pwPath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = pwPath ? await import(pwPath.startsWith('file:') ? pwPath : pathToFileURL(pwPath).href) : createRequire(import.meta.url)('playwright');
const base = `http://127.0.0.1:${process.env.PORT || 5298}`, here = name => fileURLToPath(new URL(name, import.meta.url));
const shots = here('../.scratch/voice-probe/'); mkdirSync(shots, { recursive: true });
const PROFILES = { desktop: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };
const FIGHT_SECONDS = Number(process.env.FIGHT_SECONDS || 12), BOSS_SECONDS = Number(process.env.BOSS_SECONDS || 25);

/** Before any game code: the save, and a count of every AudioContext that is made. */
function before({ save }) {
  try {
    localStorage.setItem('cute-game-save-v1', save); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en');
    localStorage.setItem('zoo-garden-graphics', JSON.stringify({ setting: 'high', autoVersion: 2 })); localStorage.setItem('cute-game-neighbours-on', '0');
  } catch { /* the page then fails to start */ }
  window.__contexts = 0;
  for (const name of ['AudioContext', 'webkitAudioContext']) { const Real = window[name]; if (Real) window[name] = class extends Real { constructor(...a) { super(...a); window.__contexts++; } }; }
}

async function open(browser, profile, saveFile) {
  const ctx = await browser.newContext(PROFILES[profile]);
  await ctx.addInitScript(before, { save: readFileSync(here(saveFile), 'utf8') });
  const page = await ctx.newPage(), requests = [];
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(base + '/'); await page.waitForSelector('[data-action="start"]');
  await page.waitForFunction(() => !!window.__zoo?.world?.renderer, null, { timeout: 60000 });
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => !!window.__zoo?.services && !!window.__zooSfx?.graph.creatures, null, { timeout: 60000 });
  await page.evaluate(() => { __zoo.services.closeDialog(); });
  // From here on: every request the page makes (the dev server's module requests ended with the features).
  await page.waitForTimeout(1500); page.on('request', r => requests.push(r.url().replace(base, '')));
  return { ctx, page, requests };
}

/** 1. The twelve nearest creatures in two rings around the hero in the swamp; an attack at the nearest every quarter second, a skill every second. */
async function fight(page, seconds) {
  return page.evaluate(async ([seconds, silent]) => {
    const w = __zoo.world, graph = __zooSfx.graph, voices = graph.creatures, [x, z] = [-13, -57];
    w.position.set(x, 0, z); w.cameraTarget.set(x, 0, z); __zoo.pinHero?.({ x, z }); __zoo.state.hp = 1e6; // the hero stays up: this counts sounds, not skill
    const used = new Set(), far = e => Math.hypot(e.x - x, e.z - z);
    const wave = () => w.enemies.filter(e => !e.boss && e.hp > 0 && !used.has(e)).sort((a, b) => far(a) - far(b)).slice(0, 12).forEach((e, i) => {
      used.add(e); const a = i / 6 * Math.PI * 2, r = i < 6 ? 3 : 5; e.maxHp *= 4; e.hp = e.maxHp; // tougher: the fight should last
      e.x = e.homeX = x + Math.cos(a) * r; e.z = e.homeZ = z + Math.sin(a) * r; e.lod = undefined; e.resting = false; e.route = []; e.mesh.position.x = e.x; e.mesh.position.z = e.z;
    });
    const aim = () => { const e = [...used].filter(e => e.hp > 0).sort((a, b) => Math.hypot(a.x - w.position.x, a.z - w.position.z) - Math.hypot(b.x - w.position.x, b.z - w.position.z))[0]; if (e) w.facing = Math.atan2(e.x - w.position.x, e.z - w.position.z); };
    const told = { creatureAlert: 0, telegraph: 0, hitLanded: 0, creatureDefeat: 0 }, stop = Object.keys(told).map(event => __zoo.services.on(event, () => { told[event]++; }));
    const trace = [], speak = voices.speak; voices.speak = function (family, kind, say) { const voice = silent ? null : speak.call(this, family, kind, say); trace.push(`${((performance.now() - start.t) / 1000).toFixed(2)} ${family} ${kind}${say?.boss ? ' boss' : ''} ${voice ? 'heard' : 'left out'}`); return voice; };
    const start = { played: voices.stats.played, limited: voices.stats.limited, capped: voices.stats.capped, quiet: voices.stats.quiet, kinds: { ...voices.stats.byKind }, shared: graph.stats.capped, sfx: { ...__zooSfx.stats }, t: performance.now() };
    let most = 0, mostShared = 0, frames = 0, score = 0; const skills = __zoo.skillList().length;
    await new Promise(done => { const tick = () => {
      const now = graph.made?.currentTime ?? 0, elapsed = (performance.now() - start.t) / 1000; __zoo.state.hp = 1e6;
      if (frames === 0) wave();
      if (frames % 15 === 5) { aim(); __zoo.fight.basicAttack(); } if (frames % 60 === 30 && skills) __zoo.skill((frames - 30) / 60 % Math.min(4, skills));
      most = Math.max(most, voices.live(now)); mostShared = Math.max(mostShared, graph.voices.live(now)); if (graph.director?.cur) score++; frames++;
      if (elapsed < seconds) requestAnimationFrame(tick); else done();
    }; requestAnimationFrame(tick); });
    for (const off of stop) off(); voices.speak = speak;
    const s = voices.stats, took = (performance.now() - start.t) / 1000;
    return {
      seconds: +took.toFixed(1), frames, creatures: used.size, defeated: [...used].filter(e => e.hp <= 0).length, families: [...new Set([...used].map(e => e.definition?.family))], told,
      voices: { started: s.played - start.played, perSecond: +((s.played - start.played) / took).toFixed(2), mostAtOnce: most, leftOutByPauses: s.limited - start.limited, refusedByCounter: s.capped - start.capped, tooFar: s.quiet - start.quiet,
        byKind: Object.fromEntries(Object.entries(s.byKind).map(([k, v]) => [k, v - start.kinds[k]])) },
      shared: { capped: graph.stats.capped - start.shared, mostAtOnce: mostShared, budget: graph.voices.budget, reserve: graph.voices.reserve },
      effects: { started: __zooSfx.stats.started - start.sfx.started, limited: __zooSfx.stats.limited - start.sfx.limited, capped: __zooSfx.stats.capped - start.sfx.capped, petHit: __zooSfx.stats.byKind.petHit ?? 0 },
      music: { slider: graph.music, playing: graph.director?.name ?? '', mode: graph.director?.mode ?? '', framesWithMusic: score }, context: graph.made?.state, trace,
    };
  }, [seconds, process.env.VOICES === 'off']);
}

/** 2. King Bear, the hero 8 m away and kept alive: every telegraph and the wind-up that followed it. */
async function boss(page, seconds) {
  return page.evaluate(async seconds => {
    const w = __zoo.world, graph = __zooSfx.graph, voices = graph.creatures, e = w.enemies.find(e => e.type === 'bear' && e.boss && e.hp > 0); if (!e) return { invalid: 'no living King Bear on the map' };
    const d = Math.hypot(e.x, e.z) || 1, x = e.x - e.x / d * 6, z = e.z - e.z / d * 6;
    w.position.set(x, 0, z); w.cameraTarget.set(x, 0, z); __zoo.pinHero?.({ x, z });
    const log = []; let open = null, heard = voices.stats.byKind.windup;
    const off = __zoo.services.on('telegraph', ({ enemy, time }) => {
      if (enemy !== e) return; // the feature listened first: its voice has started by now
      open = { skill: e.skill ?? 'strike', telegraph: +time.toFixed(2), at: performance.now(), voice: voices.stats.byKind.windup > heard, hpPart: +(e.hp / e.maxHp).toFixed(2) }; heard = voices.stats.byKind.windup; log.push(open);
    });
    const t0 = performance.now();
    await new Promise(done => { const tick = () => {
      __zoo.state.hp = 1e6; if (e.hp < e.maxHp * .2) e.hp = e.maxHp * .2; // it stays in the fight, enraged at the end
      if (open && e.phase !== 'windup') { open.lasted = +((performance.now() - open.at) / 1000).toFixed(2); open.then = e.phase; if (open.lasted < open.telegraph - .1) { const cut = open; cut.cut = `stun ${+(e.stun ?? 0).toFixed(2)}`; setTimeout(() => { cut.cut += `, its voice ${voices.winding.has(e) ? 'STILL SOUNDS' : 'was hushed'} 0.2 s later`; }, 200); } open = null; }
      if ((performance.now() - t0) / 1000 < seconds) requestAnimationFrame(tick); else done();
    }; requestAnimationFrame(tick); });
    off();
    return { seconds, telegraphs: log.length, withVoice: log.filter(l => l.voice).length, shortest: Math.min(...log.map(l => l.telegraph)), longest: Math.max(...log.map(l => l.telegraph)), log, sharedCapped: graph.stats.capped };
  }, seconds);
}

/** 3. The warning as the bar falls and rises (the feature looks five times a second). */
async function lowHealth(page, profile) {
  const out = await page.evaluate(async () => {
    const s = __zoo.services, state = __zoo.state, low = __zooSfx.graph.lowHealth, edge = document.getElementById('low-health'), bar = document.querySelector('.meter.health');
    const [x, z] = [0, 3.6]; __zoo.world.position.set(x, 0, z); __zoo.pinHero?.({ x, z }); // the village: nothing bites here
    const wait = ms => new Promise(r => setTimeout(r, ms)), full = state.hp / s.health();
    const read = () => ({ on: edge.classList.contains('on'), pulse: edge.classList.contains('pulse'), heart: bar.classList.contains('low') });
    // The game heals the explorer by itself: the bar is held where the step wants it, frame by frame.
    let hold = full; const keep = () => { state.hp = hold; requestAnimationFrame(keep); }; requestAnimationFrame(keep);
    const set = async (part, ms = 450) => { hold = state.hp = part * full; await wait(ms); };
    const steps = [];
    for (const part of [1, .5, .31, .3, .26, .25, .249, .2, .25, .27, .299, .3, .301, .5, .1]) { await set(part); steps.push({ part, health: +s.health().toFixed(3), ...read() }); }
    // Held at exactly a quarter, from above and from below, with the bar trembling by a thousandth: how often does it switch?
    let flips = 0; await set(.5); let was = read().on;
    for (let i = 0; i < 20; i++) { await set(.25 + (i % 2 ? .001 : -.001), 220); const on = read().on; if (on !== was) flips++; was = on; }
    // The heart is heard for ten seconds after a blow: one is told here (the bar is held by the probe, nothing bites in the village).
    s.closeDialog(); await set(.15); const dialog = s.modal(), silent = low.heart.stats.beats; await wait(1200); const withoutBlow = low.heart.stats.beats - silent;
    s.emit('playerHurt', { amount: 1, source: 'probe' }); await wait(300);
    const beats = low.heart.stats.beats, t = performance.now(); await wait(5000);
    const heard = low.heart.stats.beats - beats, took = (performance.now() - t) / 1000;
    await wait(5200); const late = low.heart.stats.beats; await wait(2000); const afterTen = low.heart.stats.beats - late, edgeStays = read().on;
    const style = getComputedStyle(edge), icon = getComputedStyle(bar, '::before');
    return { steps, flipsAtAQuarter: flips, dialogOpen: dialog, beatsWithoutABlow: withoutBlow, beatsIn5s: heard, beatsAfterTenSeconds: afterTen, edgeStaysAfterTheHeart: edgeStays, beatEvery: +(took / heard).toFixed(2), dropped: low.heart.stats.dropped,
      edge: { ...read(), animation: style.animationName, opacity: style.opacity, pointerEvents: style.pointerEvents, nodes: document.querySelectorAll('#low-health').length }, heart: { content: icon.content, fontSize: icon.fontSize } };
  });
  await page.evaluate(() => { __zoo.services.closeDialog(); }); await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}low-health-${profile}.png` });
  return out;
}

const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const report = {};
try {
  for (const profile of Object.keys(PROFILES).filter(p => !process.env.ONLY || process.env.ONLY === p)) {
    const late = await open(browser, profile, './save-late.json');
    const coarse = await late.page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    const row = report[profile] = { touch: coarse, fight: await fight(late.page, FIGHT_SECONDS) };
    await late.ctx.close();
    if (process.env.FIGHT) continue;
    const calm = await open(browser, profile, './save-late.json'); row.lowHealth = await lowHealth(calm.page, profile); late.page = calm.page; late.ctx = calm.ctx; late.requests.push(...calm.requests);
    row.contexts = await late.page.evaluate(() => window.__contexts); row.requests = late.requests.filter(u => !u.startsWith('/@') && !u.includes('/node_modules/'));
    await late.ctx.close();
    const mid = await open(browser, profile, './save-mid.json');
    row.boss = await boss(mid.page, BOSS_SECONDS); row.bossContexts = await mid.page.evaluate(() => window.__contexts);
    await mid.ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(report, null, 1));
