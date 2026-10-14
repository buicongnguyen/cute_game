// The hit counter (src/combo-counter.ts): milestones, the best chain, where it sits, and that it writes only on change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEST_DAMAGE, BEST_HITS, COUNTER, COUNTER_HTML, COUNTER_TIERS, ComboCounterView, counterClasses, counterMilestone, counterSize, counterTier, placeCounter, recordBest, summaryText, type Box, type CounterState, type Placement } from '../src/combo-counter.ts';
import { createProgression, normalizeProgression } from '../src/progression.ts';
import * as M from '../src/model.ts';
import { CHAIN_VI, POWER_HELP_VI } from '../src/locales/vi-chain.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';

test('the counter warms at 5, 10, 20 and 30 hits and flashes once on each', () => {
  assert.deepEqual(COUNTER_TIERS, [5, 10, 20, 30]);
  assert.deepEqual([1, 4, 5, 9, 10, 19, 20, 29, 30, 99].map(counterTier), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual([4, 5, 6, 10, 20, 30, 31].map(counterMilestone), [false, true, false, true, true, true, false]);
  const s: CounterState = { count: 10, bonus: 40, live: true, charge: .5, level: 0, note: '', summary: '', best: false };
  assert.equal(counterClasses(s, true), 't2 live pa mile'); assert.equal(counterClasses({ ...s, count: 11 }, false), 't2 live pb');
  assert.equal(counterClasses({ ...s, count: 25, level: 2, note: 'POWER!' }, true), 't3 live pa charged over noted');
  assert.equal(counterClasses({ ...s, count: 12, live: false, summary: 'x', best: true }, true), 't2 done pa best', 'an ended chain does not pop or flash');
});

test('the sum of a chain: grouped thousands in the translated phrase', () => {
  assert.equal(summaryText('{count} hits · {damage}', 12, 3480), '12 hits · 3,480'); assert.equal(summaryText('{count} đòn · {damage}', 7, 950.4), '7 đòn · 950'); assert.equal(summaryText('{count} hits · {damage}', 40, 1234567), '40 hits · 1,234,567');
});

test('the best chain is kept in the progression totals (no new save field) and survives a save round trip', () => {
  const totals: Record<string, number> = {};
  assert.equal(recordBest(totals, 2, 500), false, 'too short to count'); assert.deepEqual(totals, {});
  assert.equal(recordBest(totals, 8, 900), false, 'the first chain sets the record quietly'); assert.equal(totals[BEST_HITS], 8); assert.equal(totals[BEST_DAMAGE], 900);
  assert.equal(recordBest(totals, 7, 5000), false); assert.equal(totals[BEST_HITS], 8);
  assert.equal(recordBest(totals, 8, 950.6), false, 'the same count with more damage raises the damage only'); assert.equal(totals[BEST_DAMAGE], 951);
  assert.equal(recordBest(totals, 12, 400), true, 'New best!'); assert.equal(totals[BEST_HITS], 12); assert.equal(totals[BEST_DAMAGE], 400);
  const state = M.newGame(); recordBest(state.progression.totals, 5, 100); recordBest(state.progression.totals, 9, 777);
  const back = normalizeProgression(JSON.parse(JSON.stringify(state.progression)), state);
  assert.equal(back.totals[BEST_HITS], 9); assert.equal(back.totals[BEST_DAMAGE], 777); assert.deepEqual(Object.keys(createProgression().totals), [], 'a new save needs neither key');
  const loaded = M.loadGame ? null : null; void loaded;
});

const meets = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const boxAt = (p: Placement, W: number, H: number): Box => { const s = counterSize(W, H); return { l: p.x, t: p.y, r: p.x + s.w, b: p.y + s.h }; };
/** The HUD's panels at each size, roughly as measured (promo/hud-probe.mjs): hero plate, map and dock, the paw, the stick, target frame. */
const SCREENS: Record<string, { W: number; H: number; hud: (left: boolean) => Box[] }> = {
  '1600x900': { W: 1600, H: 900, hud: () => [{ l: 14, t: 14, r: 265, b: 92 }, { l: 690, t: 12, r: 910, b: 70 }, { l: 1383, t: 16, r: 1585, b: 400 }, { l: 1096, t: 772, r: 1592, b: 868 }, { l: 14, t: 655, r: 202, b: 882 }] },
  '1280x720': { W: 1280, H: 720, hud: () => [{ l: 12, t: 12, r: 250, b: 86 }, { l: 530, t: 10, r: 750, b: 66 }, { l: 1070, t: 14, r: 1268, b: 380 }, { l: 790, t: 600, r: 1272, b: 694 }, { l: 12, t: 480, r: 196, b: 706 }] },
  '768x1024': { W: 768, H: 1024, hud: left => [{ l: 10, t: 10, r: 260, b: 160 }, { l: 540, t: 10, r: 758, b: 420 }, left ? { l: 18, t: 800, r: 260, b: 1000 } : { l: 500, t: 800, r: 750, b: 1000 }, left ? { l: 560, t: 800, r: 720, b: 960 } : { l: 40, t: 800, r: 200, b: 960 }] },
  '390x844': { W: 390, H: 844, hud: left => [{ l: 8, t: 8, r: 200, b: 155 }, { l: 240, t: 10, r: 382, b: 360 }, { l: 16, t: 596, r: 192, b: 642 }, left ? { l: 16, t: 650, r: 215, b: 826 } : { l: 180, t: 650, r: 378, b: 826 }, left ? { l: 230, t: 668, r: 360, b: 796 } : { l: 16, t: 668, r: 144, b: 796 }] },
  '320x568': { W: 320, H: 568, hud: left => [{ l: 8, t: 8, r: 164, b: 78 }, { l: 8, t: 82, r: 118, b: 106 }, { l: 8, t: 112, r: 84, b: 158 }, { l: 180, t: 10, r: 266, b: 100 }, { l: 222, t: 104, r: 266, b: 150 }, { l: 273, t: 10, r: 312, b: 300 }, { l: 128, t: 330, r: 304, b: 366 }, left ? { l: 8, t: 388, r: 182, b: 556 } : { l: 138, t: 388, r: 312, b: 556 }, left ? { l: 174, t: 392, r: 302, b: 520 } : { l: 16, t: 392, r: 144, b: 520 }] },
  '844x390': { W: 844, H: 390, hud: left => [{ l: 8, t: 8, r: 200, b: 110 }, { l: 640, t: 8, r: 836, b: 200 }, { l: 300, t: 8, r: 520, b: 52 }, left ? { l: 20, t: 208, r: 220, b: 380 } : { l: 620, t: 208, r: 830, b: 380 }, left ? { l: 660, t: 240, r: 790, b: 370 } : { l: 40, t: 240, r: 170, b: 370 }] },
};

test('the counter sits beside the explorer, away from the target, and never on the explorer, the target or a HUD panel, at all six sizes and both hands', () => {
  for (const [name, s] of Object.entries(SCREENS)) for (const left of [false, true]) for (const side of [-1, 1, 0]) {
    const tall = s.H * .16, hero: Box = { l: s.W / 2 - tall * .38, r: s.W / 2 + tall * .38, t: s.H * .45 - tall, b: s.H * .45 };
    const target: Box | null = side ? { l: s.W / 2 + side * tall * 1.1 - tall * .4, r: s.W / 2 + side * tall * 1.1 + tall * .4, t: hero.t - tall * .3, b: hero.b } : null, hud = s.hud(left);
    const p = placeCounter(s, hero, target, hud), box = boxAt(p, s.W, s.H), label = `${name} ${left ? 'left-handed' : 'right-handed'} target ${side}`;
    assert.equal(p.free, true, label + ': a free place is found');
    assert.ok(!meets(box, hero), label + ': not on the explorer'); if (target && !p.onTarget) assert.ok(!meets(box, target), label + ': not on the target');
    assert.ok(!p.onTarget || name === '320x568', label + ': only the narrowest phone may let the creature pass behind it');
    for (const h of hud) assert.ok(!meets(box, h), `${label}: not on a HUD panel ${JSON.stringify([box, h])}`);
    assert.ok(box.l >= 8 && box.t >= 8 && box.r <= s.W - 8 && box.b <= s.H - 8, label + ': on the screen');
    if (side && name !== '320x568') assert.equal(p.side, side > 0 ? 'left' : 'right', label + ': on the side away from the target (or, with no room there, over the head)');
    // Near the action: within a counter's width and a half of the explorer, not out on the screen's edge.
    const gap = Math.max(hero.l - box.r, box.l - hero.r, hero.t - box.b, box.t - hero.b); assert.ok(gap >= 0 && gap <= counterSize(s.W, s.H).w * 1.5, `${label}: ${Math.round(gap)} px from the explorer`);
  }
});

test('it keeps its place while that place is free, moves when the target walks onto it, and falls back to the edge when nothing is free', () => {
  const s = SCREENS['1600x900'], hero: Box = { l: 745, r: 855, t: 300, b: 445 }, right: Box = { l: 900, r: 1000, t: 280, b: 445 };
  const first = placeCounter(s, hero, right, s.hud(false)); assert.equal(first.side, 'left');
  assert.equal(placeCounter(s, hero, { l: 880, r: 990, t: 200, b: 400 }, s.hud(false), first), first, 'the same object: nothing to write');
  const onIt: Box = { l: first.x + 10, r: first.x + 100, t: first.y, b: first.y + 80 }, moved = placeCounter(s, hero, onIt, s.hud(false), first);
  assert.notEqual(moved, first); assert.ok(!meets(boxAt(moved, s.W, s.H), onIt));
  const nowhere = placeCounter(s, hero, null, [{ l: 0, t: 0, r: 1600, b: 900 }]); assert.equal(nowhere.free, false); assert.equal(nowhere.x, 8);
  assert.deepEqual(counterSize(390, 844), counterSize(844, 390)); assert.ok(counterSize(1600, 900).w > counterSize(390, 844).w);
});

/** A stand-in element that counts every write. */
function fakeRoot() {
  let writes = 0; const style: Record<string, string> = {};
  const el = () => { let text = ''; return { get textContent() { return text; }, set textContent(v: string) { writes++; text = v; } }; };
  const parts: Record<string, ReturnType<typeof el>> = { '.cc-n': el(), '.cc-w': el(), '.cc-bonus': el(), '.cc-note': el() };
  let hidden = true, cls = '';
  const root = { querySelector: (s: string) => parts[s], style: new Proxy(style, { set(t, k: string, v: string) { writes++; t[k] = v; return true; }, get: (t, k: string) => k === 'setProperty' ? (name: string, v: string) => { writes++; t[name] = v; } : t[k] }),
    get hidden() { return hidden; }, set hidden(v: boolean) { writes++; hidden = v; }, get className() { return cls; }, set className(v: string) { writes++; cls = v; } };
  return { root: root as unknown as HTMLElement, parts, style, get writes() { return writes; }, get hidden() { return hidden; }, get cls() { return cls; } };
}

test('the view writes only when what it shows changes, asks for its place only when the count changes, and pops on each new hit', () => {
  const f = fakeRoot(), view = new ComboCounterView(f.root); let asked = 0; const spot: Placement = { x: 500, y: 300, side: 'left', free: true }, place = (keep: Placement | null) => { asked++; return keep ?? spot; };
  const s: CounterState = { count: 3, bonus: 12, live: true, charge: .15, level: 0, note: '', summary: '', best: false };
  view.show(null, 'HITS', place); assert.equal(f.writes, 0, 'hidden and asked to hide: nothing'); assert.equal(view.visible, false);
  view.show(s, 'HITS', place); assert.equal(f.hidden, false); assert.equal(f.parts['.cc-n'].textContent, '3'); assert.equal(f.parts['.cc-bonus'].textContent, '+12%'); assert.equal(f.style.left, '500px'); assert.equal(f.style['--p'], '15'); assert.equal(asked, 1);
  const after = f.writes; for (let i = 0; i < 200; i++) view.show({ ...s }, 'HITS', place); assert.equal(f.writes, after, '200 frames with nothing new: no write'); assert.equal(asked, 1);
  const pop = f.cls; view.show({ ...s, count: 4, bonus: 16, charge: .2 }, 'HITS', place); assert.equal(asked, 2); assert.notEqual(f.cls.includes('pa'), pop.includes('pa'), 'the pop class swaps, so the animation replays');
  const kept = f.cls; view.show({ ...s, count: 4, bonus: 16, charge: .2, note: 'LAUNCH!' }, 'HITS', place); assert.equal(asked, 2, 'a note does not move it'); assert.equal(f.cls.includes('pa'), kept.includes('pa'), 'and does not pop the number'); assert.equal(f.parts['.cc-note'].textContent, 'LAUNCH!');
  view.show({ ...s, count: 4, bonus: 0, live: false, summary: 'New best!\n4 hits · 520', best: true }, 'HITS', place); assert.match(f.cls, /done/); assert.match(f.cls, /best/); assert.equal(f.parts['.cc-bonus'].textContent, ''); assert.equal(f.parts['.cc-note'].textContent, 'New best!\n4 hits · 520');
  view.show({ ...s, count: 21, level: 1, charge: 0 }, 'HITS', place); assert.equal(f.style['--p'], '100', 'a ready charge closes the ring'); assert.match(f.cls, /charged/);
  view.show(null, 'HITS', place); assert.equal(f.hidden, true); assert.equal(view.visible, false);
  assert.match(COUNTER_HTML, /^<div id="combo-counter" hidden aria-hidden="true">/); assert.equal(COUNTER.from, 2);
});

test('motion is CSS only, stops under reduced motion, and the old chip is gone', () => {
  const css = readFileSync(new URL('../src/combo-counter.css', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), ours = readFileSync(new URL('../src/hud-ours.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*#combo-counter \.cc-n[^}]*animation: none !important;/s); assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.power-pad:not\(\[hidden\]\)[^}]*\{ animation: none; \}/);
  assert.match(css, /#app #hud #combo-counter \{[^}]*pointer-events: none;/s, 'it never takes a tap');
  assert.match(css, /\.power-pad:not\(\[hidden\]\) \{ position: absolute; width: max\(56px,/, 'the touch button is at least 56 px');
  assert.match(css, /#hud\.joystick-right \.skills \.power-pad:not\(\[hidden\]\) \{ left: auto; right:/, 'left-handed play mirrors it');
  assert.doesNotMatch(main, /combo-chip|combo-steps/); assert.doesNotMatch(ours, /#combo-chip/);
  assert.match(main, /comboMeter\.step\(dt\);stepCounter\(dt\);/); assert.doesNotMatch(main.slice(main.indexOf('function stepCounter'), main.indexOf('function clearPower')), /textContent|innerHTML|classList|\.style\./, 'the step itself never touches the page');
  assert.match(main, /recordBest\(state\.progression\.totals,count,chainDamage\)/);
});

test('every new line reads in Vietnamese, with its placeholders and numbers kept', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  for (const [en, vi] of Object.entries(CHAIN_VI)) { assert.equal(VI_PACK[en], vi, en); assert.notEqual(vi, en); assert.deepEqual((vi.match(/\{\w+\}/g) ?? []).sort(), (en.match(/\{\w+\}/g) ?? []).sort(), en); assert.deepEqual(vi.match(/×?\d+/g) ?? [], en.match(/×?\d+/g) ?? [], en); }
  for (const line of ['{count} hits · {damage}', 'New best!', 'Power strike', 'POWER READY!', 'POWER ×2!', 'POWER STRIKE!', 'POWER STRIKE ×2!', 'POWER!', 'Power strike ready! Tap the glowing button above the paw.', 'Power strike ready! Press G or click the glowing button.', 'HITS', 'LAUNCH!', 'FINISHER!']) { assert.ok(VI_PACK[line], 'missing: ' + line); assert.ok(main.includes(`'${line}'`), 'main.ts uses: ' + line); }
  const topic = HELP_TOPICS.find(([, title]) => title === 'Power strike')!; assert.equal(VI_PACK[topic[1]], POWER_HELP_VI[0]); assert.equal(VI_PACK[topic[2]], POWER_HELP_VI[1]);
  assert.deepEqual(POWER_HELP_VI[1].match(/\d+/g), topic[2].match(/\d+/g), 'the same numbers in both languages');
  const at = (title: string) => HELP_TOPICS.findIndex(([, t]) => t === title); // later topics (the elite creatures) may follow it
  assert.ok(at('Power strike') === at('Four moves') + 1, 'added after the older topics, so they keep their order');
});
