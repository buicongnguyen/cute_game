// The journey tool (docs/AAA-PLAN.md, WP4): a script plays the game the way a player would (real taps and keys, no rule
// shortcuts) and writes down what happened, so every later package can prove its beat on the same route.
//
// Run against a dev server (it needs the __zoo hook):  npx vite --port 5298 --host 127.0.0.1 --strictPort
//   node promo/journey.mjs --route new --device phone      a fresh save, 15 minutes: plant, harvest, sell, buy, equip, the fight
//                                                          step, the crystal step, fishing, then the story as the tracker leads
//   node promo/journey.mjs --route mid --device pc         promo/save-mid.json: walk to King Bear, fight with a fixed script until
//                                                          the cage opens or 120 s pass
//   --device phone|pc|both (390x844 touch, 1600x900 mouse and keys; default both)   --minutes 15   --save <file> (route mid)
//   --out <dir> (default .scratch/journey)   --baseline writes the numbers into promo/journey-baseline.json   --video <dir>
//   PORT=5298 picks the server.  PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// Each run writes <out>/<route>-<device>/: events.json (what the page recorded), timeline.json (buildTimeline of it), one
// picture per beat and contact.png (all of them on one sheet). Numbers go to git, pictures stay in .scratch/.
//
// How it measures. A recorder runs in the page before any game code: every pointer press and key (Attack, Collect or a plain
// tap), every dialog that opens (title and text), level, knock-outs, kills and story steps, plus anything matching WATCH (the
// ribbons, cards and stingers of later packages). buildTimeline() is pure: tests/journey-timeline.test.mjs feeds it a fixture.
// A dialog is "opened by" the last press in the 2.5 s before it: Attack, Collect, a tap or a key; otherwise the game opened it.
//
// The fight step is two fixed halves. Kills 1-2 "hands off": the tracker is tapped (the game walks to the creature) and Attack
// is pressed only when the creature has not lost health for 4 s, which counts the presses the step NEEDS (0 while auto-attack
// does the work). Kills 3-5 "eager": Attack is pressed on the way and at the creature, as the tip tells a new player to; that
// counts the dialogs Attack opens beside usable things.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The people of the story: a dialog or talk line that names one of them is a "named line". Later packages add names here. */
export const CAST = ['Pepper', 'Sprout', 'Clover'];
/** Page elements recorded when they first show: [event type, selector]. Packages that add a ribbon, card or stinger add its selector. */
export const WATCH = [
  ['ribbon', '[data-beat="ribbon"], .moment-ribbon'],
  ['card', '[data-beat="card"], .moment-card'],
  ['line', '[data-beat="line"], .talk-bar'],
];
const mark = name => e => e.type === 'mark' && e.name === name;
/**
 * The beats table. `on` says which recorded event is the beat; the first time it happens a contact-sheet picture is taken
 * (`frame: false` only counts). `check`, when given, reads the finished timeline and returns a complaint or null: that is
 * how a later package adds its acceptance (for example: no dialog opened by Attack in the fight step).
 */
export const BEATS = [
  { id: 'title', routes: ['new'], on: mark('title') },
  { id: 'first-view', on: mark('first-view') },
  { id: 'seed-picker', routes: ['new'], on: mark('seed-picker') },
  { id: 'planted', routes: ['new'], on: mark('planted') },
  { id: 'ripe', routes: ['new'], on: mark('ripe') },
  { id: 'first-harvest', routes: ['new'], on: mark('first-harvest') },
  { id: 'first-named-line', on: e => !!namedLine(e) },
  { id: 'collect', on: e => e.type === 'input' && e.kind === 'collect' },
  { id: 'market', routes: ['new'], on: mark('market') },
  { id: 'shop', routes: ['new'], on: mark('shop') },
  { id: 'bought', routes: ['new'], on: mark('bought') },
  { id: 'backpack', routes: ['new'], on: mark('backpack') },
  { id: 'fight-start', routes: ['new'], on: mark('fight-start') },
  { id: 'first-kill', on: e => e.type === 'kill' },
  { id: 'attack-opened-dialog', on: (e, i, all) => e.type === 'dialog' && opener(all, i).by === 'attack' },
  { id: 'fight-done', routes: ['new'], on: mark('fight-done') },
  { id: 'level-up', on: e => e.type === 'level' },
  { id: 'knock-out', on: e => e.type === 'ko' },
  { id: 'crystal', routes: ['new'], on: mark('crystal') },
  { id: 'pond', routes: ['new'], on: mark('pond') },
  { id: 'fish-bite', routes: ['new'], on: mark('fish-bite') },
  { id: 'fish-caught', routes: ['new'], on: e => e.type === 'fish' },
  { id: 'map', routes: ['new'], on: mark('map') },
  { id: 'journal', routes: ['new'], on: mark('journal') },
  { id: 'settings', routes: ['new'], on: mark('settings') },
  { id: 'help', routes: ['new'], on: mark('help') },
  { id: 'ribbon', on: e => e.type === 'ribbon' },
  { id: 'card', on: e => e.type === 'card' },
  { id: 'stinger', frame: false, on: e => e.type === 'stinger' },
  { id: 'boss-in-view', routes: ['mid'], on: mark('boss-in-view') },
  { id: 'boss-engaged', routes: ['mid'], on: mark('boss-engaged') },
  { id: 'boss-half', routes: ['mid'], on: mark('boss-half') },
  { id: 'cage-open', routes: ['mid'], on: mark('cage-open') },
  { id: 'boss-timeout', routes: ['mid'], on: mark('boss-timeout') },
  { id: 'end', on: mark('end') },
];

/** { speaker, text } when the event is a dialog or talk line that names someone of the cast. */
export function namedLine(e) {
  if (e.type !== 'dialog' && e.type !== 'line') return null;
  const text = `${e.speaker ?? ''} ${e.title ?? ''} ${e.text ?? ''}`;
  const speaker = e.speaker || CAST.find(name => new RegExp(`\\b${name}\\b`).test(text));
  return speaker ? { speaker, text: (e.text ?? e.title ?? '').slice(0, 120) } : null;
}
/** What opened the dialog at events[i]: the last press within 2.5 s before it, otherwise the game itself (a knock-out's rest dialog always). */
export function opener(events, i) {
  for (let j = i + 1; j < events.length && events[j].t - events[i].t <= 300; j++) if (events[j].type === 'ko') return { by: 'game', target: null };
  for (let j = i - 1; j >= 0 && events[i].t - events[j].t <= 2500; j--) {
    if (events[j].type === 'ko') break;
    if (events[j].type === 'input') return { by: events[j].kind, target: events[j].target };
  }
  return { by: 'game', target: null };
}
const round1 = n => Math.round(n * 10) / 10;

/**
 * The recorded events of one run (ms on the wall clock) as the timeline: times in seconds after Play.
 * Pure: no browser, no clock.
 */
export function buildTimeline(events, { route = 'new', device = 'pc', beats = BEATS } = {}) {
  const startAt = events.find(mark('start'))?.t ?? events[0]?.t ?? 0;
  const s = t => round1((t - startAt) / 1000);
  const played = events.filter(e => e.t >= startAt);
  const between = (from, to) => { const a = events.find(mark(from))?.t, b = events.find(mark(to))?.t ?? Infinity; return a === undefined ? [] : events.filter(e => e.t >= a && e.t < b); };
  const dialogs = [];
  events.forEach((e, i) => { if (e.type === 'dialog' && e.t >= startAt) dialogs.push({ t: s(e.t), title: e.title, ...opener(events, i) }); });
  const dialogsBy = { attack: 0, collect: 0, tap: 0, key: 0, game: 0 };
  for (const d of dialogs) dialogsBy[d.by] = (dialogsBy[d.by] ?? 0) + 1;
  const first = played.map(namedLine).findIndex(Boolean), line = first < 0 ? null : { t: s(played[first].t), ...namedLine(played[first]) };
  const inputs = played.filter(e => e.type === 'input'), presses = kind => inputs.filter(e => e.kind === kind).length;
  const storySteps = played.filter(e => e.type === 'story').length, collectTaps = presses('collect');
  // A knock-out is the state's health reaching 0 or the rest dialog; both within 5 s are one.
  const knockOuts = [];
  for (const e of played) if (e.type === 'ko' && !(knockOuts.length && s(e.t) - knockOuts.at(-1) < 5)) knockOuts.push(s(e.t));
  const list = type => played.filter(e => e.type === type).map(e => ({ t: s(e.t), ...(e.id ? { id: e.id } : {}), ...(e.level ? { level: e.level } : {}) }));
  const timeline = {
    route, device, durationS: played.length ? s(played.at(-1).t) : 0,
    firstNamedLine: line, dialogs, dialogsBy,
    taps: inputs.length, collectTaps, storySteps, collectTapsPerStep: storySteps ? round1(collectTaps / storySteps) : null,
    attackPresses: presses('attack'),
    levelUps: list('level'), ribbons: list('ribbon'), cards: list('card'), stingers: list('stinger'), knockOuts,
    kills: played.filter(e => e.type === 'kill').length, fish: played.filter(e => e.type === 'fish').length,
    steps: played.filter(e => e.type === 'mark').map(e => ({ t: s(e.t), name: e.name, ...(e.data ?? {}) })),
  };
  if (events.some(mark('fight-start'))) {
    const fight = between('fight-start', 'fight-done'), handsOff = between('fight-start', 'fight-eager'), from = events.find(mark('fight-start')).t;
    const attack = list => list.filter(e => e.type === 'input' && e.kind === 'attack').length;
    const firstKill = fight.find(e => e.type === 'kill'), done = events.find(mark('fight-done'));
    timeline.fight = {
      startS: s(from), attackPressesNeeded: attack(handsOff), eagerAttackPresses: attack(fight) - attack(handsOff),
      trackerTaps: fight.filter(e => e.type === 'input' && /quest|tracker/.test(e.target ?? '')).length,
      dialogsOpenedByAttack: dialogs.filter(d => d.by === 'attack' && d.t >= s(from) && (!done || d.t <= s(done.t))).length,
      kills: fight.filter(e => e.type === 'kill').length, firstKillAfterS: firstKill ? round1((firstKill.t - from) / 1000) : null,
      tookS: done ? round1((done.t - from) / 1000) : null,
      lowestHealthPct: Math.min(100, ...fight.filter(e => e.type === 'hp').map(e => e.pct)),
    };
  }
  if (events.some(mark('boss-engaged'))) {
    const from = events.find(mark('boss-engaged')).t, open = events.find(mark('cage-open')), out = events.find(mark('boss-timeout'));
    const fight = events.filter(e => e.t >= from && e.t <= (open ?? out ?? events.at(-1)).t);
    timeline.boss = {
      engagedS: s(from), cageOpened: !!open, tookS: round1(((open ?? out ?? events.at(-1)).t - from) / 1000),
      bossHealthLeftPct: open ? 0 : out?.data?.bossPct ?? null,
      attackPresses: fight.filter(e => e.type === 'input' && e.kind === 'attack').length,
      skillPresses: fight.filter(e => e.type === 'input' && /skill/.test(e.target ?? '')).length,
      knockOuts: knockOuts.filter(t => t >= s(from)).length,
      lowestHealthPct: Math.min(100, ...fight.filter(e => e.type === 'hp').map(e => e.pct)),
    };
  }
  timeline.beats = {}; timeline.complaints = [];
  for (const beat of beats) {
    if (beat.routes && !beat.routes.includes(route)) continue;
    const hits = []; events.forEach((e, i) => { if (e.t >= startAt - 60000 && beat.on(e, i, events)) hits.push(e.t); });
    timeline.beats[beat.id] = { count: hits.length, firstS: hits.length ? s(hits[0]) : null };
  }
  for (const beat of beats) { const said = beat.check?.(timeline); if (said) timeline.complaints.push(`${beat.id}: ${said}`); }
  return timeline;
}

/** The numbers of a timeline that go into promo/journey-baseline.json (no texts, no pictures). */
export function baselineNumbers(t) {
  const out = {
    durationS: t.durationS, firstNamedLineS: t.firstNamedLine?.t ?? null, firstNamedLineBy: t.firstNamedLine?.speaker ?? null,
    dialogsOpened: t.dialogs.length, dialogsBy: t.dialogsBy, taps: t.taps, collectTaps: t.collectTaps, storySteps: t.storySteps,
    collectTapsPerStep: t.collectTapsPerStep, attackPresses: t.attackPresses, levelUps: t.levelUps.length, levelReached: t.levelUps.at(-1)?.level ?? null,
    ribbons: t.ribbons.length, cards: t.cards.length, stingers: t.stingers.length, knockOuts: t.knockOuts.length, kills: t.kills, fish: t.fish,
    beats: Object.fromEntries(Object.entries(t.beats).map(([id, b]) => [id, b.count ? [b.count, b.firstS] : [0]])),
  };
  if (t.fight) out.fight = t.fight;
  if (t.boss) out.boss = t.boss;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// In the page, before any game code: the recorder.
function recorder(watch) {
  const last = { dialog: null }, J = window.__journey = { events: [], last, push(type, data = {}) { J.events.push({ t: Date.now(), type, ...data }); } };
  const describe = el => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (el.dataset?.action ? `[${el.dataset.action}]` : '') + (el.closest('#dialog-layer') ? ' in dialog' : '');
  addEventListener('pointerdown', e => {
    const el = e.target; if (!(el instanceof Element)) return;
    const button = el.closest('button, [data-action], [role=button]') ?? el;
    J.push('input', { kind: button.closest('[data-action="attack"]') ? 'attack' : button.closest('[data-action="claim"]') ? 'collect' : 'tap', target: describe(button) });
  }, true);
  addEventListener('keydown', e => { if (!e.repeat) J.push('input', { kind: e.key.toLowerCase() === 'f' ? 'attack' : 'key', target: 'key ' + e.key }); }, true);
  const seen = new WeakSet();
  const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; };
  setInterval(() => {
    const layer = document.querySelector('#dialog-layer'), open = !!layer && !layer.hidden;
    const title = open ? (document.querySelector('#dialog-title')?.textContent ?? '').trim() : null;
    if (title !== last.dialog) {
      last.dialog = title;
      if (title === null) J.push('dialog-close'); else J.push('dialog', { title, text: layer.innerText.replace(/\s+/g, ' ').trim().slice(0, 260) });
    }
    for (const [type, selector] of watch) for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el) || !shown(el)) continue; seen.add(el);
      J.push(type, { id: el.dataset.beatId || el.id || el.className.toString().split(' ')[0], speaker: el.dataset.speaker, text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) });
    }
    const s = window.__zoo?.state; if (!s) return;
    const now = { level: s.level, kills: s.counters?.kills ?? 0, story: s.progression?.story?.index ?? 0, fish: s.counters?.fish ?? 0, down: s.hp <= 0, hp: Math.round(s.hp) };
    if (last.level !== undefined) {
      if (now.level > last.level) J.push('level', { level: now.level });
      for (let k = last.kills; k < now.kills; k++) J.push('kill');
      for (let k = last.fish; k < now.fish; k++) J.push('fish');
      if (now.story !== last.story) J.push('story', { index: now.story });
      if (now.down && !last.down) J.push('ko');
      if (now.hp < last.hp) { const max = Number(document.querySelector('#hp-text')?.textContent?.split('/')[1]) || now.hp || 1; J.push('hp', { pct: Math.max(0, Math.round(now.hp / max * 100)) }); }
    }
    if (title !== null && /little rest/i.test(title) && !last.rest) J.push('ko');
    last.rest = title !== null && /little rest/i.test(title);
    Object.assign(last, now);
  }, 100);
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };
const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };

export async function loadChromium() {
  const pw = process.env.PLAYWRIGHT_MODULE;
  try { return (pw ? await import(pw.startsWith('file:') ? pw : pathToFileURL(pw).href) : createRequire(import.meta.url)('playwright')).chromium; }
  catch (e) { throw new Error(`Playwright was not found (${e.message.split('\n')[0]}). Set PLAYWRIGHT_MODULE to the path of an installed playwright/index.mjs.`); }
}

/**
 * One browser page with the recorder in it and a player's hands: taps, walking by taps on open ground, dialogs.
 * `save` is the save text to start from (none: a first visit). Also used by promo/reel.mjs.
 */
export async function openPlayer({ chromium, device = 'pc', save = null, base, context = {}, log = () => {} }) {
  const phone = device === 'phone';
  const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...(phone ? PHONE : DESKTOP), ...context });
  await ctx.addInitScript(([text]) => { try { localStorage.setItem('cute-game-language', 'en'); if (text && !localStorage.getItem('cute-game-save-v1')) { localStorage.setItem('cute-game-save-v1', text); localStorage.setItem('cute-game-slot', '0'); } } catch { /* the run then starts as a first visit */ } }, [save]);
  await ctx.addInitScript(recorder, WATCH);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  const size = page.viewportSize(), touch = phone ? await ctx.newCDPSession(page) : null;
  const wait = ms => page.waitForTimeout(ms);
  const P = {
    browser, ctx, page, phone, errors, size, wait,
    mark: (name, data) => page.evaluate(([name, data]) => window.__journey.push('mark', data ? { name, data } : { name }), [name, data]).then(() => log(name, data ?? '')),
    tapAt: (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y),
    async tapSel(selector, { timeout = 4000 } = {}) {
      const target = page.locator(selector).filter({ visible: true }).first();
      try { await target.waitFor({ state: 'visible', timeout }); } catch { return false; }
      const box = await target.boundingBox({ timeout: 1500 }).catch(() => null); if (!box) return false;
      await P.tapAt(box.x + box.width / 2, box.y + box.height / 2); return true;
    },
    /** Press and hold (the Reel button): a real mouse button or a real touch point. */
    async hold(x, y, down) {
      if (!phone) return down ? (await page.mouse.move(x, y), page.mouse.down()) : page.mouse.up();
      return touch.send('Input.dispatchTouchEvent', { type: down ? 'touchStart' : 'touchEnd', touchPoints: down ? [{ x, y }] : [] });
    },
    attack: () => phone ? P.tapSel('.attack-pad', { timeout: 600 }) : page.keyboard.press('f').then(() => true),
    dialog: () => page.evaluate(() => { const d = document.querySelector('#dialog-layer'); return d && !d.hidden ? (document.querySelector('#dialog-title')?.textContent || '?') : null; }),
    async waitDialog(ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { const d = await P.dialog(); if (d) return d; await wait(200); } return null; },
    async closeDialogs(max = 4) { for (let i = 0; i < max; i++) { if (!await P.dialog()) return; if (!await P.tapSel('#dialog-layer [data-action="close"], #dialog-layer [data-wc="done"], #dialog-layer [data-wc="skip"]', { timeout: 1000 })) await page.keyboard.press('Escape'); await wait(500); } },
    screenOf: (x, y, z) => page.evaluate(([x, y, z]) => { const w = __zoo.world, v = w.camera.position.clone().set(x, y, z).project(w.camera), r = w.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }, [x, y, z]),
    hero: () => page.evaluate(() => ({ x: __zoo.world.position.x, z: __zoo.world.position.z })),
    state: () => page.evaluate(() => { const s = __zoo.state; return { level: s.level, hp: s.hp, energy: s.energy, story: s.progression.story.index, kills: s.counters.kills, harvests: s.counters.harvests, fish: s.counters.fish ?? 0, weapon: s.gear.weapon ?? null, bosses: s.bosses ?? [] }; }),
    /** What a tap at (x, y) would land on: the HUD (covered), a thing of the world (kind) or open ground. */
    hitAt: (x, y) => page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); if (!el || el.id !== 'world' && !el.closest('#world')) return { covered: true }; return { kind: __zoo.world.pickEntity?.(x, y)?.kind ?? null }; }, [x, y]),
    /** Walk like a player: tap open ground up to 6 m ahead, again and again, never on a building on the way. */
    async walkTo(x, z, near = 2.5, ms = 30000, want = null) {
      const end = Date.now() + ms, box = phone ? { l: 40, r: 350, t: 260, b: 600 } : { l: 360, r: 1240, t: 200, b: 700 };
      while (Date.now() < end) {
        const h = await P.hero(), d = Math.hypot(x - h.x, z - h.z); if (d < near) return true;
        const step = Math.min(d, 6); let p = await P.screenOf(h.x + (x - h.x) / d * step, 0, h.z + (z - h.z) / d * step);
        p = { x: Math.min(box.r, Math.max(box.l, p.x)), y: Math.min(box.b, Math.max(box.t, p.y)) };
        for (const [dx, dy] of [[0, 0], [50, 0], [-50, 0], [0, 50], [0, -50], [90, 40], [-90, -40]]) { const q = { x: p.x + dx, y: p.y + dy }, hit = await P.hitAt(q.x, q.y); if (!hit.covered && (!hit.kind || hit.kind === want || hit.kind === 'enemy')) { p = q; break; } }
        await P.tapAt(p.x, p.y); await wait(1000);
        if (await P.dialog()) return false;
      }
      return false;
    },
    nearest: kind => page.evaluate(k => { const w = __zoo.world, p = w.position; let best = null, far = 1e9; for (const e of w.entities) if (e.kind === k && (k !== 'fish' || e.pond)) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < far) { far = d; best = { x: e.x, z: e.z, d, r: Math.max(e.radius ?? 1, e.pond?.rx ?? 0) }; } } return best; }, kind),
    /** Walk up to the nearest thing of a kind and tap it until its dialog opens. */
    async openEntity(kind, y = 1) {
      const e = await P.nearest(kind); if (!e) return null;
      for (let attempt = 0; attempt < 4; attempt++) {
        await P.walkTo(e.x, e.z, attempt ? 2.5 : 5, 25000, kind);
        let d = await P.dialog(); if (d) return d;
        const p = await P.screenOf(e.x, y, e.z), hit = await P.hitAt(p.x, p.y);
        if (!hit.covered) { await P.tapAt(p.x, p.y); d = await P.waitDialog(8000); if (d) return d; }
      }
      return null;
    },
    /** Open the game and stop at the title screen. */
    async title() { await page.goto(base); await page.waitForSelector('[data-action="start"]', { timeout: 120000 }); },
    events: () => page.evaluate(() => window.__journey.events),
  };
  return P;
}

// ---------------------------------------------------------------------------------------------------------------------------
/**
 * Play one route on one device and write its folder. For the show reel (promo/reel.mjs): `segment` plays one part only
 * ('fight' and 'level-up' put a fresh save at the fight step with the wood sword, as the earlier steps would have),
 * `stopAt` ends the run `holdMs` after that beat, `bossSeconds` shortens the boss fight, `video` records the page.
 */
export async function playRoute({ chromium, route, device, base, out, name = `${route}-${device}`, minutes = 15, saveFile, video = null, segment = 'all', stopAt = null, holdMs = 4000, bossSeconds = 120 }) {
  const dir = path.join(out, name); mkdirSync(dir, { recursive: true });
  const STOP = new Error('stop');
  const started = Date.now(), log = (...a) => console.log(`[${route}/${device} ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
  const save = route === 'mid' ? readFileSync(saveFile, 'utf8') : null;
  const P = await openPlayer({ chromium, device, save, base, log, context: video ? { recordVideo: { dir: video, size: device === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 720 } } } : {} });
  const film = video ? P.page.video() : null;
  const { page, wait } = P, frames = [], recorded = Object.assign([], { reloadedAt: 0 }); let seen = 0, playFrom = 0;
  const framed = new Set(), limit = () => playFrom && Date.now() - playFrom > minutes * 60_000;
  // New events since the last look: the first hit of each beat gets its picture.
  async function look() {
    const fresh = await P.events().catch(() => null); if (!fresh) return;
    // The page keeps its list only until it reloads (a dev server restart does that): what was read is kept here.
    if (fresh.length < seen - recorded.reloadedAt) { recorded.push({ t: Date.now(), type: 'reload' }); recorded.reloadedAt = ++seen; P.errors.push('the page reloaded during the run'); }
    recorded.push(...fresh.slice(seen - recorded.reloadedAt)); const events = recorded;
    for (let i = seen; i < events.length; i++) for (const beat of BEATS) {
      if (beat.frame === false || framed.has(beat.id) || beat.routes && !beat.routes.includes(route) || !beat.on(events[i], i, events)) continue;
      framed.add(beat.id);
      const file = `${String(frames.length + 1).padStart(2, '0')}-${beat.id}.png`;
      await page.screenshot({ path: path.join(dir, file) }).then(() => frames.push(file), e => P.errors.push(`frame ${beat.id}: ${e.message.slice(0, 80)}`));
      if (beat.id === stopAt) { seen = events.length; await wait(holdMs); throw STOP; }
    }
    seen = events.length;
  }
  const step = async (name, data) => { await P.mark(name, data); await look(); };
  const pause = async ms => { await wait(ms); await look(); };
  const collect = async (patience = 0) => {
    const offered = () => page.evaluate(() => { const b = document.querySelector('#quick-claim'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; });
    for (const end = Date.now() + patience; !await offered();) { if (Date.now() >= end) return false; await wait(300); }
    await P.tapSel('#quick-claim'); await pause(1500); await P.closeDialogs(2); return true;
  };
  // Attack beside the cottage door walks in: a player who ends up indoors taps "Go outside".
  const outside = async () => { if (await page.evaluate(() => { const b = document.querySelector('#interact-button'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0 && /outside/i.test(b.textContent); })) { await P.tapSel('#interact-button', { timeout: 800 }); await pause(2500); } };
  try {
    await P.title(); await wait(3000);
    await step('title');
    if (route === 'new') {
      await P.tapSel('#name-input'); await page.keyboard.type('Mina'); await wait(400);
    }
    await P.mark('start'); await P.tapSel('[data-action="start"]'); playFrom = Date.now();
    await look();
    await P.waitDialog(route === 'new' ? 15000 : 5000); await pause(1200);
    await P.closeDialogs(3); await pause(2500);
    await step('first-view');
    if (route === 'mid') await routeMid();
    else if (segment === 'all') await routeNew();
    else if (segment === 'fishing') { await page.evaluate(() => { __zoo.state.bag.rod = 1; }); await fishing(); } // the fishing step alone, a bamboo rod in the backpack
    else {
      // the fight step without the 70 s before it: the story at "Defeat five creatures", the wood sword in hand
      await page.evaluate(nearLevel => { const s = __zoo.state; s.progression.story.index = 4; s.progression.story.progress = 0; s.quest = 4; s.level = 4; s.bag.sword_wood = 1; s.gear.weapon = 'sword_wood'; s.counters.harvests = 3; if (nearLevel) s.xp = Math.round(25 * Math.pow(4, 1.55)) - 2; __zoo.world.refreshPlayer(); window.__journey.last.level = 4; }, segment === 'level-up');
      await pause(3000); await fightStep();
    }
    await step('end');
  } catch (e) { if (e !== STOP) { P.errors.push('script: ' + (e.stack || e.message).slice(0, 500)); log('SCRIPT ERROR', e.message); await page.screenshot({ path: path.join(dir, '99-error.png') }).then(() => frames.push('99-error.png'), () => {}); } }
  await look().catch(() => {}); const events = [...recorded];
  await P.ctx.close(); const videoFile = film ? await film.path().catch(() => null) : null; await P.browser.close();
  const timeline = { ...buildTimeline(events, { route, device }), viewport: P.size, wallS: Math.round((Date.now() - started) / 1000), errors: P.errors, frames, ...(videoFile ? { videoFile } : {}) };
  writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 1));
  if (frames.length) await contactSheet(chromium, dir, frames, `${route} / ${device}`, device === 'phone' ? [8, 180] : [4, 400]);
  log('done', JSON.stringify(baselineNumbers(timeline)));
  return timeline;

  // ---- route "new": the first 15 minutes of a fresh save ----
  async function routeNew() {
    const ripeBed = () => page.evaluate(() => { const s = __zoo.state, beds = __zoo.world.entities.filter(e => e.kind === 'plot'); for (let i = 0; i < s.plots.length; i++) { const p = s.plots[i]; if (p.crop && p.growDuration && Date.now() - p.plantedAt >= p.growDuration && beds[i]) return { x: beds[i].x, z: beds[i].z }; } return null; });
    // plant three beds: the nearest one, one more, then "All"
    const beds = await page.evaluate(() => { const w = __zoo.world, p = w.position; return w.entities.filter(e => e.kind === 'plot').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).map(b => ({ x: b.x, z: b.z })); });
    for (let i = 0; i < 3 && i < beds.length; i++) {
      let p = await P.screenOf(beds[i].x, .3, beds[i].z), opened = null;
      if (p.x > 0 && p.x < P.size.width && p.y > 0 && p.y < P.size.height && !(await P.hitAt(p.x, p.y)).covered) { await P.tapAt(p.x, p.y); opened = await P.waitDialog(12000); }
      if (!opened) { await P.walkTo(beds[i].x, beds[i].z, 4, 30000, 'plot'); opened = await P.dialog(); if (!opened) { p = await P.screenOf(beds[i].x, .3, beds[i].z); await P.tapAt(p.x, p.y); opened = await P.waitDialog(12000); } }
      if (!opened) continue;
      await pause(500); if (i === 0) await step('seed-picker');
      await P.tapSel(i === 2 ? '#dialog-layer [data-action="plant-all"]:not([disabled])' : '#dialog-layer [data-action="plant"]:not([disabled])'); await pause(600);
      if (i === 0) await step('planted');
      await P.closeDialogs(1);
    }
    // the first ripe bed, harvested by a tap
    for (const end = Date.now() + 90000; Date.now() < end && !await ripeBed();) await pause(1000);
    await step('ripe');
    for (let k = 0; k < 60 && (await P.state()).harvests < 3; k++) {
      const bed = await ripeBed(), before = (await P.state()).harvests;
      if (!bed) { await pause(1000); continue; }
      const q = await P.screenOf(bed.x, .3, bed.z);
      if ((await P.hitAt(q.x, q.y)).covered) await P.walkTo(bed.x, bed.z, 2, 6000, 'plot'); else await P.tapAt(q.x, q.y);
      for (let i = 0; i < 24 && (await P.state()).harvests === before; i++) await wait(250);
      if (before === 0 && (await P.state()).harvests > 0) { await step('first-harvest'); await P.waitDialog(6000); await pause(900); }
      await pause(700); await P.closeDialogs(2);
    }
    await collect();
    // market, shop, backpack
    if (await P.openEntity('sell')) { await pause(600); await step('market'); await P.tapSel('#dialog-layer [data-action="sell-produce"]', { timeout: 2000 }); await pause(900); await P.closeDialogs(2); }
    await pause(1200); await collect();
    if (await P.openEntity('shop')) {
      await pause(800); await step('shop');
      await P.tapSel('#dialog-layer [data-action="buy"]:not([disabled]):not([aria-disabled="true"])', { timeout: 2000 }); await pause(1200);
      await step('bought'); await P.closeDialogs(2);
    }
    await pause(1200); await collect();
    await P.tapSel('.top-actions [data-action="bag"]');
    if (await P.waitDialog(6000)) {
      await pause(800); await step('backpack');
      if (!(await P.state()).weapon) { await P.tapSel('#dialog-layer [data-action="equip"]', { timeout: 1500 }); await pause(800); }
      await P.closeDialogs(2);
    }
    await pause(1200); await collect(); await pause(2000);
    await fightStep();
    await outside(); await collect(12000); await pause(1500);
    // the crystal step: one upgrade (another thing's dialog on the way is closed and the crystal tried again)
    const crystal = async () => {
      for (let attempt = 0; attempt < 3 && (await P.state()).story === 5; attempt++) {
        await outside(); if (!await P.openEntity('upgrade')) continue;
        await pause(800);
        if (await P.tapSel('#dialog-layer [data-action="upgrade"]:not([disabled])', { timeout: 1500 })) { await step('crystal'); await pause(1000); await P.closeDialogs(2); await pause(1200); return collect(4000); }
        await P.closeDialogs(2);
      }
    };
    await crystal();
    await fishing();
    await collect();
    // the menus a new player opens once
    for (const [name, open] of [['map', () => P.tapSel('.minimap')], ['journal', () => P.tapSel('.top-actions [data-action="quests"]')],
      ['settings', async () => { await P.tapSel('.top-actions [data-action="more"]'); await wait(600); return P.tapSel('#more-menu [data-more-key="settings"]'); }],
      ['help', async () => { await P.tapSel('.top-actions [data-action="more"]'); await wait(600); return P.tapSel('#more-menu [data-more-key="help"]'); }]]) {
      await open(); if (await P.waitDialog(5000)) { await pause(600); await step(name); await P.closeDialogs(2); } await pause(500);
    }
    // the rest of the 15 minutes: follow the tracker, press Attack and a skill, collect when the step is done
    await step('free-play');
    for (let turn = 0; !limit(); turn++) {
      if (await P.dialog()) { await P.tapSel('#dialog-layer [data-action="upgrade"]:not([disabled])', { timeout: 300 }); await pause(500); await P.closeDialogs(2); }
      await outside();
      if (await collect()) continue;
      const wanted = turn % 20 ? null : await page.evaluate(() => __zoo.state.progression.story.event ?? null);
      if (wanted === 'fish') { await fishing(); continue; }
      if (wanted === 'upgrade') { await crystal(); continue; }
      // a beat after the tracker tap, so a dialog it opens is not taken for one Attack opened
      if (turn % 4 === 0) { await P.tapSel('#quest-summary', { timeout: 500 }) || await P.tapSel('#tracker-chip', { timeout: 500 }); await wait(450); if (await P.dialog()) continue; }
      await P.attack(); await wait(250); await P.attack();
      if (turn % 3 === 2) await P.tapSel('#hud [data-action="skill"]:not([disabled])', { timeout: 400 });
      await pause(700);
    }
  }

  async function fightStep() {
    await step('fight-start');
    const kills0 = (await P.state()).kills, end = Date.now() + 4 * 60_000;
    let eager = false, reached = 0, lastHp = null, lastLoss = 0;
    const trackerTap = async () => await P.tapSel('#quest-summary', { timeout: 500 }) || P.tapSel('#tracker-chip', { timeout: 500 });
    while (Date.now() < end && !limit()) {
      await look();
      if (await P.dialog()) { await P.closeDialogs(2); continue; }
      await outside();
      const f = await page.evaluate(() => { const w = __zoo.world, p = w.position; const live = w.enemies.filter(e => e.tutorial && e.hp > 0).map(e => ({ d: Math.hypot(e.x - p.x, e.z - p.z), hp: e.hp, x: e.x, z: e.z })).sort((a, b) => a.d - b.d); return { near: live[0] ?? null, kills: __zoo.state.counters.kills, story: __zoo.state.progression.story.index, selected: !!w.selected }; });
      const kills = f.kills - kills0;
      if (kills >= 5 || f.story !== 4) break;
      if (!eager && kills >= 2) { eager = true; await step('fight-eager'); }
      if (!f.near || f.near.d > 2.6) {
        reached = 0; lastHp = null;
        if (eager && f.near) { await P.walkTo(f.near.x, f.near.z, 2.6, 900, 'enemy'); await P.attack(); await wait(300); continue; } // eager: there by taps on the ground, Attack pressed on the way
        if (!f.selected) { await trackerTap(); await wait(450); if (await P.dialog()) continue; } // the game's own way: the tracker walks to the next creature
        if (eager) await P.attack();
        await wait(700); continue;
      }
      if (!reached) { reached = lastLoss = Date.now(); }
      if (lastHp === null || f.near.hp < lastHp) { lastHp = f.near.hp; lastLoss = Date.now(); }
      if (eager || Date.now() - lastLoss > 4000) for (let i = 0; i < 3; i++) { await P.attack(); await wait(260); }
      else await wait(400);
    }
    await step('fight-done');
  }

  async function fishing() {
    const pond = await P.nearest('fish'); if (!pond || limit()) return;
    const fishBefore = (await P.state()).fish, end = Date.now() + 150_000;
    // Walk to the shore, then the "Go fishing" button; where it is not shown, a tap on the water.
    const tapPond = async () => {
      await outside(); await P.walkTo(pond.x, pond.z, pond.r + 2.5, 60000, 'fish');
      const offered = await page.evaluate(() => { const b = document.querySelector('#interact-button'); return !!b && !b.hidden && /fish/i.test(b.textContent); });
      if (!offered || !await P.tapSel('#interact-button', { timeout: 1200 })) for (const k of [1, .7, .45]) {
        const h = await P.hero(), p = await P.screenOf(h.x + (pond.x - h.x) * k, 0, h.z + (pond.z - h.z) * k);
        if (p.x > 0 && p.x < P.size.width && p.y > 0 && p.y < P.size.height && !(await P.hitAt(p.x, p.y)).covered) { await P.tapAt(p.x, p.y); break; }
      }
      await pause(2500);
    };
    await tapPond(); await step('pond');
    // no rod yet: the game says so and offers the way to the outfitters
    if (await P.dialog()) {
      if (await P.tapSel('#dialog-layer [data-action="shop-rod"]', { timeout: 1500 })) { await pause(1500); await P.tapSel('#dialog-layer [data-action="buy"][data-item="rod"]:not([disabled])', { timeout: 2500 }); await pause(1000); }
      await P.closeDialogs(3); await tapPond(); await P.closeDialogs(2);
    }
    let held = false, bites = 0;
    const reel = () => page.evaluate(() => { const b = document.querySelector('#reel-button'), r = b.getBoundingClientRect(); return { on: !b.hidden && r.width > 0, x: r.left + r.width / 2, y: r.top + r.height / 2, cast: b.classList.contains('cast'), bite: b.classList.contains('bite'), hint: document.querySelector('#fish-hint')?.textContent ?? '' }; });
    while (Date.now() < end && !limit() && (await P.state()).fish - fishBefore < 2) {
      const r = await reel();
      if (!r.on) { if (held) { await P.hold(r.x, r.y, false); held = false; } await tapPond(); if (await P.dialog()) { await P.closeDialogs(2); break; } continue; }
      if (r.cast) { await P.tapAt(r.x, r.y); await wait(800); continue; }
      const pull = /Hold Reel/.test(r.hint), letGo = /let go|Let go|Easy/.test(r.hint);
      if (r.bite && !held) { if (!bites++) await step('fish-bite'); await P.hold(r.x, r.y, true); held = true; }
      else if (pull && !held) { await P.hold(r.x, r.y, true); held = true; }
      else if (letGo && held) { await P.hold(r.x, r.y, false); held = false; }
      await wait(90); if (Math.random() < .1) await look();
    }
    if (held) await P.hold(0, 0, false);
    await pause(1500); await P.closeDialogs(2);
  }

  // ---- route "mid": King Bear on the mid-game save ----
  async function routeMid() {
    const bear = () => page.evaluate(() => { const w = __zoo.world, p = w.position, b = w.enemies.find(e => e.boss && e.type === 'bear'); return b ? { x: b.x, z: b.z, hp: b.hp, pct: Math.round(b.hp / b.maxHp * 100), d: Math.hypot(b.x - p.x, b.z - p.z) } : null; });
    const open = async () => (await P.state()).bosses.includes('home:bear');
    let b = await bear(); if (!b) throw new Error('King Bear is not on this planet');
    // A save that starts far away is put 16 m from the bear (the walk across the canyon is not what this route measures);
    // so is a hero who was knocked out and woke up at home: the fight goes on until the time is up, knock-outs counted.
    const place = async name => { await page.evaluate(([x, z]) => { const w = __zoo.world; w.position.set(x, 0, z); w.destination = null; w.route = []; }, [b.x - 13, b.z + 9]); await pause(2500); await P.mark(name, { from: Math.round(b.d) }); };
    if (b.d > 30) await place('placed');
    await step('boss-in-view');
    const tapBear = async () => { b = await bear(); const p = await P.screenOf(b.x, 1.2, b.z); if (p.x > 20 && p.x < P.size.width - 20 && p.y > 90 && p.y < P.size.height - 120 && !(await P.hitAt(p.x, p.y)).covered) { await P.tapAt(p.x, p.y); return true; } return false; };
    for (const end = Date.now() + 30000; Date.now() < end && (b = await bear()) && b.d > 4;) { if (!await tapBear()) await P.walkTo(b.x, b.z, 4, 3000, 'enemy'); await wait(900); }
    await step('boss-engaged', { bossPct: b.pct });
    const from = Date.now(); let half = false, turn = 0, won = false;
    while (Date.now() - from < bossSeconds * 1000) {
      await look();
      if (await open()) { won = true; break; }
      if (await P.dialog()) { await P.closeDialogs(2); continue; }
      b = await bear(); if (!b) break;
      if (b.d > 30) { await place('returned'); continue; }
      if (!half && b.pct <= 50) { half = true; await step('boss-half', { bossPct: b.pct }); }
      if (b.d > 3.2 && turn % 3 === 0 && !await tapBear()) await P.walkTo(b.x, b.z, 4, 2500, 'enemy');
      if (b.d > 8) { await wait(500); turn++; continue; }
      for (let i = 0; i < 3; i++) { await P.attack(); await wait(240); }
      if (turn % 4 === 3) await page.evaluate(n => { const all = [...document.querySelectorAll('#hud [data-action="skill"]:not([disabled])')].filter(e => e.getBoundingClientRect().width > 0); const el = all[n % Math.max(1, all.length)]; if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, turn >> 2).then(p => p && P.tapAt(p[0], p[1]));
      const s = await P.state(); if (s.hp > 0 && turn % 5 === 4 && await page.evaluate(() => { const t = document.querySelector('#hp-text')?.textContent?.split('/').map(Number); return !!t && t[0] / t[1] < .45; })) await P.tapSel('#quick-eat', { timeout: 300 });
      turn++;
    }
    b = await bear();
    await step(won ? 'cage-open' : 'boss-timeout', { bossPct: won ? 0 : b?.pct ?? null }); await pause(2500);
  }
}

/** All pictures of a run on one sheet (contact.png beside them). */
export async function contactSheet(chromium, dir, files, title, [columns, width]) {
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#1d2330;font:600 13px sans-serif;color:#f4efe4;padding:12px}
h1{font-size:18px;margin:0 0 10px}.g{display:grid;grid-template-columns:repeat(${columns},${width}px);gap:10px}figure{margin:0;background:#2b3345;border-radius:8px;overflow:hidden}
img{width:${width}px;display:block}figcaption{padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>
<h1>Zoo Garden journey: ${title}</h1><div class="g">${files.map(f => `<figure><img src="${f}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`).join('')}</div>`;
  writeFileSync(path.join(dir, 'contact.html'), html);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 24 + columns * width + (columns - 1) * 10, height: 600 } });
    await page.goto(pathToFileURL(path.join(dir, 'contact.html')).href); await page.waitForLoadState('load'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, 'contact.png'), fullPage: true });
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
  const here = path.dirname(fileURLToPath(import.meta.url)), route = arg('route', 'new'), which = arg('device', 'both');
  if (!['new', 'mid'].includes(route) || !['phone', 'pc', 'both'].includes(which)) { console.error('Usage: node promo/journey.mjs --route new|mid --device phone|pc|both [--minutes 15] [--save file] [--out dir] [--baseline]'); process.exit(2); }
  const saveFile = path.resolve(arg('save', path.join(here, 'save-mid.json')));
  if (route === 'mid' && !existsSync(saveFile)) { console.error(`Route mid needs a save: ${saveFile} was not found (pass --save <file>).`); process.exit(2); }
  let chromium; try { chromium = await loadChromium(); } catch (e) { console.error(e.message); process.exit(2); }
  const options = { chromium, route, base: `http://127.0.0.1:${process.env.PORT || 5298}/`, out: path.resolve(arg('out', '.scratch/journey')), minutes: Number(arg('minutes', 15)), saveFile, video: arg('video', null) };
  const results = await Promise.all((which === 'both' ? ['phone', 'pc'] : [which]).map(device => playRoute({ ...options, device })));
  if (args.includes('--baseline')) {
    const file = path.join(here, 'journey-baseline.json'), all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    all.note ??= 'Numbers of promo/journey.mjs before the AAA round changed the game (docs/AAA-PLAN.md WP4). Times are seconds after Play. beats: [count, first time].';
    for (const t of results) if (!t.errors.length) all[`${t.route}/${t.device}`] = { measured: new Date().toISOString().slice(0, 10), ...baselineNumbers(t) };
    writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
  }
  if (results.some(t => t.errors.length)) { console.error(results.flatMap(t => t.errors).join('\n')); process.exitCode = 1; }
}
