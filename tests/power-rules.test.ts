// The power strike (src/power-rules.ts, combat.ts powerStrike): the charge, the areas, the damage and its bounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POWER, POWER_AREAS, POWER_GROW, PowerCharge, powerArea, powerCap, powerDelay, powerReach, powerShape, powerShare } from '../src/power-rules.ts';
import { CombatSimulation, type CombatTarget, type CombatHit } from '../src/combat.ts';
import { PowerFx, brighter, WAVE_STEP } from '../src/power-fx.ts';
import { AttackCharge, ATTACK_CHARGE_HTML, chargeSteps, padState, hintSeen, markHint } from '../src/power-hud.ts';
import { HOLD } from '../src/five-rules.ts';
import { keysGuideHtml } from '../src/hud-keys.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';
import { powerReport } from '../promo/fight-sim.mts';

const fill = (c: PowerCharge, n: number) => { let reached = 0; for (let i = 0; i < n; i++) reached = c.hit() || reached; return reached; };

test('hits fill the charge: one level at POWER.need, the overcharge at twice that, and no further', () => {
  const c = new PowerCharge(); assert.equal(c.level, 0); assert.equal(c.view().progress, 0);
  assert.equal(fill(c, POWER.need - 1), 0); assert.equal(c.level, 0); assert.ok(Math.abs(c.view().progress - (POWER.need - 1) / POWER.need) < 1e-9);
  assert.equal(c.hit(), 1, 'the hit that fills it says so'); assert.equal(c.level, 1); assert.equal(c.left, POWER.keep);
  assert.equal(fill(c, POWER.need - 1), 0); assert.equal(c.level, 1); assert.equal(c.hit(), 2); assert.equal(c.level, 2); assert.equal(c.view().progress, 1);
  assert.equal(fill(c, 30), 0); assert.equal(c.hits, POWER.need * POWER.levels, 'hits past the top are not kept');
  assert.equal(POWER.levels, 2);
});

test('a ready charge waits POWER.keep seconds, blinks through the last POWER.blink, then falls to half a level', () => {
  const c = new PowerCharge(); fill(c, POWER.need);
  assert.equal(c.step(POWER.keep - POWER.blink - .1), false); assert.equal(c.view().blinking, false);
  assert.equal(c.step(.2), false); assert.equal(c.view().blinking, true); assert.equal(c.level, 1);
  assert.equal(c.step(POWER.blink), true, 'it lapses'); assert.equal(c.level, 0); assert.equal(c.hits, Math.floor(POWER.need * POWER.lapse)); assert.equal(c.view().blinking, false);
  assert.equal(c.step(100), false, 'a charge that is still filling never lapses'); assert.equal(c.hits, Math.floor(POWER.need * POWER.lapse));
  // Hits while it waits build the overcharge but do not hold the first level open; reaching level 2 starts the wait again.
  const d = new PowerCharge(); fill(d, POWER.need); d.step(POWER.keep - 1); fill(d, 5); assert.ok(d.left <= 1.0001); fill(d, POWER.need - 5); assert.equal(d.level, 2); assert.equal(d.left, POWER.keep);
});

test('using it spends the whole charge; knocked out it is lost; not ready it does nothing', () => {
  const c = new PowerCharge(); fill(c, 7); assert.equal(c.use(), 0); assert.equal(c.hits, 7);
  fill(c, POWER.need); assert.equal(c.use(), 1); assert.equal(c.hits, 0); assert.equal(c.level, 0);
  fill(c, POWER.need * 2); assert.equal(c.use(), 2); assert.equal(c.hits, 0);
  fill(c, POWER.need + 3); c.clear(); assert.equal(c.hits, 0); assert.equal(c.left, 0);
});

test('the form follows the weapon; in the air every weapon comes down as the ring; level 2 is larger', () => {
  assert.equal(powerShape('sword'), 'wave'); assert.equal(powerShape('fist'), 'cone'); assert.equal(powerShape('gun'), 'beam');
  for (const kind of ['sword', 'fist', 'gun']) assert.equal(powerShape(kind, true), 'ring');
  assert.ok(POWER_AREAS.wave.length >= 6 && POWER_AREAS.wave.length <= 8, 'the crescent travels 6 to 8 m');
  for (const shape of ['wave', 'cone', 'beam', 'ring'] as const) { const a = powerArea(shape, 1), b = powerArea(shape, 2); assert.equal(b.length, a.length * POWER_GROW); assert.equal(b.radius, a.radius * POWER_GROW); assert.equal(b.half, a.half * POWER_GROW); }
  assert.ok(powerArea('ring', 1).radius > 3.5, 'the dive version is bigger than the dive strike');
});

test('what is in the area: a body counts when any part of it is inside', () => {
  const from = { x: 0, z: 0 }, at = (x: number, z: number, radius = .5) => ({ x, z, radius });
  assert.equal(powerReach('wave', 1, from, 0, at(0, 5)), 5); assert.equal(powerReach('wave', 1, from, 0, at(0, 7.4)), 7.4); assert.equal(powerReach('wave', 1, from, 0, at(0, 7.6)), -1);
  assert.ok(powerReach('wave', 1, from, 0, at(2, 3)) >= 0, 'its edge is in the wave'); assert.equal(powerReach('wave', 1, from, 0, at(2.2, 3)), -1); assert.equal(powerReach('wave', 1, from, 0, at(0, -1)), -1, 'nothing behind');
  assert.ok(powerReach('wave', 2, from, 0, at(0, 8.5)) >= 0, 'level 2 reaches further');
  assert.ok(powerReach('wave', 1, from, Math.PI / 2, at(5, 0)) >= 0, 'it follows the facing'); assert.equal(powerReach('wave', 1, from, Math.PI / 2, at(0, 5)), -1);
  assert.ok(powerReach('cone', 1, from, 0, at(0, 4)) >= 0); assert.ok(powerReach('cone', 1, from, 0, at(2.5, 2.5)) >= 0); assert.equal(powerReach('cone', 1, from, 0, at(4, 0, .3)), -1); assert.equal(powerReach('cone', 1, from, 0, at(0, 5.5)), -1);
  assert.ok(powerReach('beam', 1, from, 0, at(0, 11)) >= 0); assert.equal(powerReach('beam', 1, from, 0, at(1.5, 6)), -1);
  assert.ok(powerReach('ring', 1, from, 0, at(0, -4)) >= 0, 'the ring hits all round'); assert.equal(powerReach('ring', 1, from, 0, at(0, 4.6)), -1);
  assert.equal(powerDelay('wave', 5.2), 5.2 / POWER_AREAS.wave.speed); assert.equal(powerDelay('cone', 3), 0);
});

test('the damage is shared: all of it on one creature, split among several, never under the floor', () => {
  assert.equal(powerShare(1, 1), POWER.power[0]); assert.equal(powerShare(1, 2), POWER.power[0] / 2); assert.equal(powerShare(1, 4), POWER.power[0] / 4);
  assert.equal(powerShare(1, 9), POWER.floor[0]); assert.equal(powerShare(2, 1), POWER.power[1]); assert.equal(powerShare(2, 9), POWER.floor[1]);
  assert.ok(POWER.power[1] < POWER.power[0] * 2, 'the overcharge is worth less than two strikes, so waiting never beats pressing');
  assert.ok(POWER.power[0] >= 4 && POWER.power[0] <= 6.5);
  assert.equal(powerCap({ boss: true, maxHp: 10000 }), 1500); assert.equal(powerCap({ maxHp: 10000 }), Infinity); assert.equal(POWER.bossCap, .15);
});

/** A bare fight: attack 100, a fixed roll (no critical unless `crit`), creatures that only count what they take. */
function arena(spots: { x: number; z: number; radius?: number; boss?: boolean; maxHp?: number }[], weapon: 'fist' | 'sword' | 'gun' = 'sword', crit = false) {
  const p = { x: 0, z: 0 }, hits: { id: string; hit: CombatHit; striking: boolean }[] = [];
  const targets: (CombatTarget & { taken: number })[] = spots.map((s, i) => ({ id: 't' + i, x: s.x, z: s.z, radius: s.radius ?? .5, boss: s.boss, hp: 1e9, maxHp: s.maxHp ?? 1e9, taken: 0 }));
  const sim: CombatSimulation = new CombatSimulation({ position: () => p, facing: () => 0, face: () => {}, targets: () => targets, weapon: () => ({ kind: weapon, range: 2, cd: .4 }), stats: () => ({ attack: 100, critChance: crit ? 1 : 0, critDamage: 4 }),
    move: () => {}, effect: () => {}, hit: (t, h) => { (t as typeof targets[0]).taken += h.amount; hits.push({ id: t.id, hit: h, striking: sim.striking }); } }, () => .5);
  return { sim, targets, hits };
}

test('combat.powerStrike deals the shared damage, with the knock and the stun, and the combo ramp does not raise it', () => {
  const one = arena([{ x: 0, z: 3 }]); one.sim.edge.bonus = 1.4;
  assert.equal(one.sim.powerStrike('cone', 1), 1); assert.equal(one.targets[0].taken, POWER.power[0] * 100); assert.equal(one.sim.edge.bonus, 1.4, 'the ramp is put back');
  assert.equal(one.hits[0].hit.knock, POWER.knock); assert.equal(one.hits[0].hit.stun, POWER.stun); assert.equal(one.hits[0].hit.lift, POWER.lift); assert.equal(one.hits[0].hit.critical, false, 'no sure critical');
  assert.equal(one.hits[0].striking, true, 'its own hits are marked, so they do not fill the next charge'); assert.equal(one.sim.striking, false);
  const four = arena([{ x: 0, z: 2 }, { x: 1, z: 3 }, { x: -1, z: 3 }, { x: 0, z: 4 }, { x: 0, z: -3 }]);
  assert.equal(four.sim.powerStrike('cone', 1), 4); for (const t of four.targets.slice(0, 4)) assert.equal(t.taken, POWER.power[0] / 4 * 100); assert.equal(four.targets[4].taken, 0, 'the one behind is not hit');
  const over = arena([{ x: 0, z: 3 }]); over.sim.powerStrike('ring', 2); assert.equal(over.targets[0].taken, POWER.power[1] * 100);
  assert.equal(arena([{ x: 0, z: 30 }]).sim.powerStrike('beam', 1), 0, 'nothing in the area: nothing is hit');
});

test('a wave reaches each creature after the distance to it; the hands stay busy for the recovery', () => {
  const a = arena([{ x: 0, z: 2 }, { x: 0, z: 6.5 }]); assert.equal(a.sim.powerStrike('wave', 1), 2);
  assert.equal(a.targets[0].taken + a.targets[1].taken, 0, 'nothing lands at the press'); assert.equal(a.sim.busy, true);
  a.sim.update(.1, true); assert.equal(a.targets[0].taken, POWER.power[0] / 2 * 100); assert.equal(a.targets[1].taken, 0);
  a.sim.update(.2, true); assert.equal(a.targets[1].taken, POWER.power[0] / 2 * 100);
  a.sim.update(.1, true); assert.equal(a.sim.busy, false);
});

test('a boss never loses more than the boss cap to one strike, critical or not; it can crit by the ordinary chance and multiplier', () => {
  const boss = arena([{ x: 0, z: 3, radius: 1.4, boss: true, maxHp: 2000 }], 'fist', true); boss.sim.powerStrike('cone', 2, powerCap);
  assert.equal(boss.targets[0].taken, 2000 * POWER.bossCap); assert.equal(boss.hits[0].hit.lift, 0, 'a boss is not lifted');
  const crit = arena([{ x: 0, z: 3 }], 'fist', true); crit.sim.powerStrike('cone', 1); assert.equal(crit.targets[0].taken, POWER.power[0] * 100 * 4); assert.equal(crit.hits[0].hit.critical, true);
});

// Since the five-button fight the hold carries the weapon's own special too (it had the fourth button before), so what
// holding Attack adds is the strike (about +11%, as measured when it was built) plus that special: more with a strong
// one (the lava sword's five pillars on the Shadow Lord). The fight as a whole against the one before it is bounded in
// tests/five-rules.test.ts (fiveReport).
test('fight simulation: holding Attack (the strike, its own blow again) is used, never passes the boss cap, and adds a bounded share', () => {
  const rows = powerReport(['careless', 'double'], [1, 2, 3]); assert.equal(rows.length, 6);
  const mean = rows.reduce((a, r) => a + r.gain, 0) / rows.length;
  for (const r of rows) { assert.ok(r.powers >= 1, `${r.boss} ${r.script}: the strike is used`); assert.ok(r.gain > -.03 && r.gain < .3, `${r.boss} ${r.script}: ${(r.gain * 100).toFixed(1)}%`); assert.ok(r.biggest <= POWER.bossCap + 1e-9, `${r.boss}: biggest hit ${(r.biggest * 100).toFixed(1)}%`); }
  assert.ok(mean > .02 && mean <= .2, `mean gain ${(mean * 100).toFixed(1)}%`);
});

test('the look uses only what it is given: the wave lays a crescent every step of its way and then ends', () => {
  const calls: string[] = [], fx = { burst: () => calls.push('burst'), ring: () => calls.push('ring'), flash: () => calls.push('flash'), slash: (_at: unknown, _f: number, radius?: number) => calls.push('slash:' + radius) };
  const view = new PowerFx(); view.play(fx, 'wave', 1, { x: 0, z: 0 }, 0, '#55ccff'); assert.equal(view.busy, true);
  for (let i = 0; i < 40; i++) view.update(fx, 1 / 60);
  assert.equal(view.busy, false); const wide = POWER_AREAS.wave.half * 1.25;
  assert.equal(calls.filter(c => c === 'slash:' + wide).length >= Math.floor(POWER_AREAS.wave.length / WAVE_STEP), true, 'crescents all the way, as wide as the wave');
  const before = calls.length; view.update(fx, 1 / 60); assert.equal(calls.length, before, 'idle, it does nothing');
  for (const shape of ['cone', 'beam', 'ring'] as const) { calls.length = 0; view.play(fx, shape, 2, { x: 0, z: 0 }, 0, '#ffd45a'); assert.ok(calls.length >= 4 && calls.length <= 16, shape); assert.equal(view.busy, false); }
  assert.equal(brighter('#000000', .5), '#808080'); assert.equal(brighter('nope'), '#ffffff');
});

test('no button of its own: the Attack pad wears the charge (a ring in twenty steps, a glow when ready, x2 when overcharged, a blink at the end, a fill while held); written only when its state changes', () => {
  const view = (level: number, progress: number, blinking = false) => ({ level, progress, hits: 0, blinking, left: blinking ? 2 : 12 });
  assert.equal(padState(view(0, 0), true), '0'); assert.equal(padState(view(0, .5), true), '50'); assert.equal(padState(view(0, .5), false), '', 'a menu or the switch off clears it');
  assert.equal(padState(view(1, 0), true), '100r'); assert.equal(padState(view(1, .5), true), '100r', 'ready: the ring stays closed while the overcharge fills');
  assert.equal(padState(view(2, 1, true), true), '100rxb'); assert.equal(padState(view(1, 0), true, true), '100rh'); assert.equal(padState(view(0, .5), true, true), '50', 'holding without a charge shows no fill');
  assert.deepEqual([0, 1, 7, 19, 20].map(hits => chargeSteps(view(0, hits / POWER.need))), [0, 5, 35, 95, 100], 'one step a hit');
  let writes = 0; const classes = new Set<string>(), vars = new Map<string, string>(), attrs = new Map<string, string>();
  const el = { title: '', setAttribute(k: string, v: string) { writes++; attrs.set(k, v); }, classList: { toggle(name: string, on: boolean) { if (classes.has(name) !== on) writes++; if (on) classes.add(name); else classes.delete(name); } }, style: { getPropertyValue: (k: string) => vars.get(k) ?? '', setProperty(k: string, v: string) { writes++; vars.set(k, v); } } };
  const pad = new AttackCharge(el as unknown as HTMLElement), c = new PowerCharge(), sync = (holding = false) => pad.sync(c.view(), true, holding, 'Attack: hold', 'Basic attack');
  assert.equal(vars.get('--hold-time'), HOLD.time + 's', 'the fill takes exactly the hold time');
  assert.equal(sync(), false); const idle = writes; for (let i = 0; i < 50; i++) sync(); assert.equal(writes, idle, 'no writes while nothing changes');
  c.hit(); sync(); assert.equal(vars.get('--charge'), '5'); assert.ok(classes.has('charging') && !classes.has('ready')); const one = writes; sync(); assert.equal(writes, one);
  fill(c, POWER.need - 1); assert.equal(sync(), true, 'it has just become ready'); assert.equal(vars.get('--charge'), '100'); assert.ok(classes.has('ready') && !classes.has('charging')); assert.equal(attrs.get('aria-label'), 'Attack: hold');
  assert.equal(sync(), false); assert.equal(sync(true), false); assert.ok(classes.has('holding'), 'held: the fill plays'); sync(false); assert.ok(!classes.has('holding'), 'let go: it stops');
  fill(c, POWER.need); sync(); assert.ok(classes.has('over')); c.step(POWER.keep - 1); sync(); assert.ok(classes.has('blink'));
  c.use(); sync(true); assert.ok(!classes.has('ready') && !classes.has('over') && !classes.has('blink') && !classes.has('holding')); assert.equal(vars.get('--charge'), '0'); assert.equal(attrs.get('aria-label'), 'Basic attack');
  c.hit(); assert.equal(pad.sync(c.view(), false, false, 'Attack: hold', 'Basic attack'), false); assert.equal(vars.get('--charge'), '0', 'hidden: nothing shows');
  assert.match(ATTACK_CHARGE_HTML, /^<i class="ap-ring" aria-hidden="true"><\/i><i class="ap-hold" aria-hidden="true"><\/i><b class="ap-x" aria-hidden="true">×2<\/b>$/);
  const store = new Map<string, string>(), ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(hintSeen(ls), false); markHint(ls); assert.equal(hintSeen(ls), true); assert.equal(hintSeen(null), false);
  const css = readFileSync(new URL('../src/combo-counter.css', import.meta.url), 'utf8'), ours = readFileSync(new URL('../src/hud-ours.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css + ours, /power-pad/, 'the separate button is gone from both sheets');
  assert.match(css, /\.attack-pad > \.ap-ring \{[^}]*conic-gradient\(#8fe0ff calc\(var\(--charge\) \* 1%\)/, 'the ring fills with the charge');
  assert.match(css, /\.attack-pad\.holding > \.ap-hold \{ display: block; animation: ap-hold var\(--hold-time, \.35s\) linear forwards; \}/);
  assert.match(css, /\.attack-pad\.over > \.ap-x \{ display: block; \}/); assert.match(css, /\.attack-pad\.blink > \.ap-ring \{ animation: ap-blink/);
  assert.match(ours, /body:not\(\.air-combat\) #app #hud \.attack-pad > :not\(svg\) \{ display: none; \}/, 'switched off, the pad is bare again');
});

test('there is no power key: G is free, the guide says to hold the attack key, the help says to hold the button, and only with jumping on', () => {
  assert.ok(!('key' in POWER));
  for (const layout of ['classic', 'wasd']) { assert.match(keysGuideHtml(layout, false, 'jump'), /<dt>Power strike<\/dt><dd><i>hold<\/i><kbd>F<\/kbd><kbd>N<\/kbd><\/dd>/); assert.doesNotMatch(keysGuideHtml(layout, false), /Power strike|hold/); assert.doesNotMatch(keysGuideHtml(layout, false, 'jump'), /<kbd>G<\/kbd>/); }
  assert.match(keysGuideHtml('wasd', false, 'jump'), /<dt>Skills<\/dt><dd><kbd>J<\/kbd><kbd>K<\/kbd><kbd>L<\/kbd><kbd>;<\/kbd><\/dd>/, 'four skill keys'); assert.match(keysGuideHtml('classic', false, 'attack'), /<dt>Skills<\/dt><dd><kbd>Q<\/kbd><kbd>W<\/kbd><kbd>E<\/kbd><kbd>R<\/kbd><\/dd>/);
  assert.match(keysGuideHtml('wasd', false), /<dt>Skills<\/dt><dd><kbd>J<\/kbd><kbd>K<\/kbd><kbd>L<\/kbd><kbd>;<\/kbd><\/dd>/, 'switched off: four, as before');
  const topic = HELP_TOPICS.find(([, title]) => title === 'Power strike'); assert.ok(topic); assert.ok(topic[2].includes(`After ${POWER.need} hits`) && topic[2].includes(`${POWER.keep} seconds`) && topic[2].includes(`×2 at ${POWER.need * 2} hits`), 'the help quotes the numbers of the table');
  assert.match(topic[2], /Hold it for a moment/); assert.match(topic[2], /A quick tap is always a normal attack/); assert.doesNotMatch(topic[2], /\bG\b|button appears/);
});

test('main.ts wiring: own hits charge it (never the strike itself or a helper), the switch gates it, knock-out clears it', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if\(impact&&!remote&&!hazard&&!impact\.helper\)noteComboHit\(e,impact\);/, 'pets, the dog and summons never reach the counter');
  assert.match(main, /function noteComboHit\(e:Enemy,impact:CombatHit\)\{\r?\n  if\(!airOn\(\)\)return;\r?\n[^\n]*\r?\n  if\(!combat\.striking\)\{const level=powerCharge\.hit\(\);/);
  assert.match(main, /function powerStrike\(\)\{\r?\n  if\(!airOn\(\)\|\|!started\|\|uiBlocked\(\)\|\|visiting\|\|state\.hp<=0\|\|powerWind\|\|powerDive\)return false;/);
  assert.match(main, /if\(state\.hp<=0&&\(powerCharge\.hits\|\|powerWind\|\|powerDive\|\|streak\.count\)\)clearPower\(\);/);
  assert.match(main, /combat\.powerStrike\(shape,level,powerCap\);/); assert.doesNotMatch(main, /case 'power'|data-action="power"|POWER\.key|power-pad/, 'no button and no key of its own');
  // The one way in: a held Attack (button, key, mouse on a creature) that has filled for HOLD.time.
  assert.equal(main.split('powerStrike()').length, 3, 'declared, and called from the hold alone'); assert.match(main, /if\(does==='power'\)\{if\(powerStrike\(\)\)attackHold\.spent\(\);\}/);
  assert.match(main, /else if\(does==='repeat'&&!mouse&&combatTimers\.attackCooldown<=0\)basicAttack\(\);/, 'no charge: the hold keeps attacking at the weapon\'s pace');
  assert.match(main, /if\(!on\)\{[^\n]*clearPower\(\);attackHold\.clear\(\);[^\n]*showCombo\(\);syncPower\(\);/, 'switching it off clears the charge, the hold and the pad');
  assert.doesNotMatch(main, /comboMeter\.break\(\);[^\n]{0,40}powerCharge/, 'being hit does not empty the charge');
});
