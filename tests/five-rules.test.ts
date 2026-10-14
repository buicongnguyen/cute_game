// The five-button fight (src/five-rules.ts, docs/FIGHT-PLAN.md section 11): the three-hit attack chain per weapon kind,
// hold-to-unleash, the untouched streak, the fourth skill level that stays in the save, where the weapon specials went,
// the paw's layout under a thumb, and the balance against the fight before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const F = await import('../src/five-rules.ts');
const M = await import('../src/model.ts');
const U = await import('../src/upgrades.ts');
const { CombatSimulation, SPECIALS } = await import('../src/combat.ts');
const { MOVE_SKILLS, CHAIN_SKILL, MOVE_LEVEL_TEXT } = await import('../src/moves.ts');
const { POWER } = await import('../src/power-rules.ts');
const { UNIFORM_SPECIAL } = await import('../src/uniform-skills.ts');
const { benchHtml, skillEffect } = await import('../src/upgrade-bench.ts');
const { fiveReport, chainDamage, BEFORE_FIVE } = await import('../promo/fight-sim.mts');
type Hit = import('../src/combat.ts').CombatHit; type Target = import('../src/combat.ts').CombatTarget; type Weapon = import('../src/combat.ts').WeaponProfile;

const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const main = read('main.ts'), css = read('hud-ours.css');
const { CHAIN, HOLD, STREAK, PAW } = F;

function arena(weapon: Weapon, spots: Array<{ x: number; z: number; radius?: number; boss?: boolean }>, opts: { chain?: boolean; level?: number; height?: number } = {}) {
  const p = { x: 0, z: 0 }; let facing = 0; const hits: Array<{ id: string; h: Hit }> = []; let height = opts.height ?? 0;
  const targets: Target[] = spots.map((s, i) => ({ id: 't' + i, x: s.x, z: s.z, radius: s.radius ?? .5, boss: s.boss, hp: 1e9, maxHp: 1e9 }));
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => weapon, stats: () => ({ attack: 100, critChance: 0 }),
    move() {}, effect() {}, hit: (t, h) => { hits.push({ id: t.id, h }); }, skillLevel: i => i === 3 ? opts.level ?? 0 : 0, height: () => height }, () => .5);
  sim.edge.chain = opts.chain ?? true;
  const run = (s: number) => { for (let t = 0; t < s - 1e-9; t += .025) sim.update(.025, true); };
  return { sim, hits, targets, run, amounts: () => hits.map(h => h.h.amount), setHeight: (h: number) => { height = h; } };
}
const SWORD: Weapon = { kind: 'sword', range: 2, arc: .2, cd: .4 }, FIST: Weapon = { kind: 'fist' }, GUN: Weapon = { kind: 'gun', range: 8, shot: 'pea', cd: .5 };

// ---------------------------------------------------------------- 1. The chain

test('the chain numbers: 90 / 100 / 125% of what one press dealt before, so three presses deal 5% more and no more', () => {
  for (const kind of ['sword', 'fist', 'gun'] as const) {
    const hits = CHAIN.hits[kind], before = CHAIN.before[kind]; assert.equal(hits.length, 3);
    assert.ok(hits[0] < hits[1] && hits[1] < hits[2], kind + ': each press hits harder');
    for (const [i, share] of [.9, 1, 1.25].entries()) assert.ok(Math.abs(hits[i] / before - share) < .012, `${kind} press ${i + 1}: ${(hits[i] / before).toFixed(3)}`);
    assert.ok(F.chainGain(kind) > 1 && F.chainGain(kind) <= 1.0501, `${kind}: sustained ${((F.chainGain(kind) - 1) * 100).toFixed(2)}%`);
  }
  assert.deepEqual([CHAIN.before.sword, CHAIN.before.gun], [1.1, 1]); assert.ok(Math.abs(CHAIN.before.fist - (1 + 1 + 1.5) / 3) < 1e-9, 'fists dealt 1, 1, 1.5');
  assert.deepEqual([F.chainKind('sword'), F.chainKind('gun'), F.chainKind('fist'), F.chainKind('rod')], ['sword', 'gun', 'fist', 'fist']);
  // The order of the presses: one after another within the pause, the first again after it or after the third.
  assert.deepEqual([F.chainNext(-1, 0), F.chainNext(0, .4), F.chainNext(1, .4), F.chainNext(2, .4)], [0, 1, 2, 0]);
  assert.equal(F.chainNext(1, CHAIN.reset), 2); assert.equal(F.chainNext(1, CHAIN.reset + .01), 0, 'a pause starts it again'); assert.equal(F.chainNext(0, -1), 0); assert.equal(F.chainNext(7, .1), 0);
  // Sustained damage as the fight deals it: ten seconds of presses, against the same ten seconds before the chain.
  for (const cd of [.4, .5]) { const now = chainDamage([{ x: 0, z: 1.2 }], 10, cd), was = Math.ceil(10 / cd - 1e-9) * CHAIN.before.fist; assert.ok(now / was > .99 && now / was < 1.06, `fists at ${cd} s: ${(now / was).toFixed(3)}`); }
});

test('a blade: cut, back-cut, overhead; the third knocks harder and launches small creatures, never a boss or a large one', () => {
  const a = arena(SWORD, [{ x: 0, z: 1.5 }]); for (let i = 0; i < 6; i++) { assert.equal(a.sim.basic(a.targets[0]), true); assert.equal(a.sim.chainLast, i % 3); a.run(.4); }
  assert.deepEqual(a.amounts(), [99, 110, 138, 99, 110, 138]);
  assert.deepEqual(a.hits.map(h => h.h.lift), [0, 0, CHAIN.launch, 0, 0, CHAIN.launch]); assert.deepEqual(a.hits.slice(0, 3).map(h => h.h.knock), [1.2, 1.2, 2.2]);
  for (const big of [{ x: 0, z: 2, radius: 1.3 }, { x: 0, z: 2, radius: .8, boss: true }]) { const b = arena(SWORD, [big]); for (let i = 0; i < 3; i++) { b.sim.basic(b.targets[0]); b.run(.4); } assert.deepEqual(b.hits.map(h => h.h.lift), [0, 0, 0]); assert.equal(b.hits[2].h.amount, 138, 'the damage is the same'); }
  // A crowd in the arc: the third launches the small ones only.
  const crowd = arena({ ...SWORD, arc: -.2 }, [{ x: 0, z: 1.4 }, { x: .8, z: 1.2, radius: 1.25 }]); for (let i = 0; i < 3; i++) { crowd.sim.basic(crowd.targets[0]); crowd.run(.4); }
  assert.deepEqual(crowd.hits.slice(-2).map(h => [h.id, h.h.lift > 0]).sort(), [['t0', true], ['t1', false]]);
});

test('paws: jab, jab, hook (the third launches); a pause starts the chain again, and the game\'s launch height is used when it is set', () => {
  const a = arena(FIST, [{ x: 0, z: 1.2 }]); for (let i = 0; i < 3; i++) { a.sim.basic(a.targets[0]); a.run(.5); }
  assert.deepEqual(a.amounts(), [105, 116, 146]); assert.deepEqual(a.hits.map(h => h.h.knock), [...CHAIN.knock]); assert.ok(a.hits[2].h.lift > 0 && !a.hits[1].h.lift);
  const p = arena(FIST, [{ x: 0, z: 1.2 }]); p.sim.basic(p.targets[0]); p.run(.5); p.sim.basic(p.targets[0]); p.run(CHAIN.reset + .2); p.sim.basic(p.targets[0]);
  assert.deepEqual(p.amounts(), [105, 116, 105], 'after a pause the next press is the first again'); assert.equal(p.sim.chainLast, 0);
  const l = arena(FIST, [{ x: 0, z: 1.2 }]); l.sim.edge.launch = 2.4; for (let i = 0; i < 3; i++) { l.sim.basic(l.targets[0]); l.run(.5); } assert.equal(l.hits[2].h.lift, 2.4);
  const r = arena(FIST, [{ x: 0, z: 1.2 }]); r.sim.basic(r.targets[0]); r.sim.reset(); r.sim.edge.chain = true; r.sim.basic(r.targets[0]); assert.deepEqual(r.amounts(), [105, 105], 'a reset fight starts the chain again');
});

test('a gun: shot, shot, double shot; the same total as the others and nothing is launched; a scatter gun fires its volley twice', () => {
  const a = arena(GUN, [{ x: 0, z: 4 }]); for (let i = 0; i < 3; i++) { a.sim.basic(a.targets[0]); a.run(.5); }
  assert.deepEqual(a.amounts(), [90, 100, 63, 63], 'the third press is two shots, each half of 125%'); assert.ok(a.hits.every(h => !h.h.lift), 'a gun launches nothing');
  assert.equal(a.sim.projectiles.length, 0);
  const one = arena(GUN, [{ x: 0, z: 4 }]); one.sim.basic(one.targets[0]); one.sim.basic(one.targets[0]); one.sim.basic(one.targets[0]); assert.equal(one.sim.projectiles.length, 3, 'the second of the two leaves a moment later'); one.run(CHAIN.shotGap + .03); one.run(.4); assert.equal(one.hits.length, 4);
  const s = arena({ ...GUN, spread: 3 }, [{ x: 0, z: 2, radius: 1.5 }]); for (let i = 0; i < 3; i++) { s.sim.basic(s.targets[0]); s.run(.5); }
  assert.equal(s.hits.length, 3 + 3 + 6); assert.deepEqual(s.amounts().slice(0, 6), [41, 41, 41, 45, 45, 45]); assert.ok(s.amounts().slice(6).every(v => v === 28));
});

test('the chain is the basic attack only on the ground with the switch on: without it the old attack, in the air the old air shot', () => {
  const off = arena(FIST, [{ x: 0, z: 1.2 }], { chain: false }); for (let i = 0; i < 6; i++) off.sim.basic(off.targets[0]); assert.deepEqual(off.amounts(), [100, 100, 150, 100, 100, 150]); assert.ok(off.hits.every(h => !h.h.lift)); assert.equal(off.sim.chainLast, 0);
  const blade = arena(SWORD, [{ x: 0, z: 1.5 }], { chain: false }); for (let i = 0; i < 3; i++) blade.sim.basic(blade.targets[0]); assert.deepEqual(blade.amounts(), [110, 110, 110]);
  const air = arena(GUN, [{ x: 0, z: 4 }], { height: 1.5 }); for (let i = 0; i < 3; i++) { air.sim.basic(air.targets[0], .8); air.run(.5); } assert.deepEqual(air.amounts(), [80, 80, 80], 'a gun in the air keeps its lighter single shot');
  assert.match(main, /world\.jumpRules=on;combat\.edge\.moves=on;combat\.edge\.chain=on;/);
  // The explorer shows the three presses: the blade's three cuts in order, the third paw as the big one.
  assert.match(main, /step=combat\.edge\.chain\?combat\.chainLast:-1;/); assert.match(main, /world\.playerAttack\(weapon\.kind,volt\?'#bfefff':undefined,step as 0\|1\|2,step===2\);/);
});

// ---------------------------------------------------------------- 2. Hold to unleash

test('hold to unleash: a tap never fires it, a hold fires once after the hold time, letting go or sliding off cancels, and with no charge a hold keeps attacking', () => {
  assert.equal(HOLD.time, .35, 'one data value'); const dt = 1 / 60;
  const h = new F.AttackHold(); assert.equal(h.held, false); assert.equal(h.step(dt, true), null, 'nothing is held');
  // A tap of any length under the hold time, however often.
  for (const length of [.02, .1, .2, .3, .34]) for (let n = 0; n < 30; n++) { assert.equal(h.down('pad'), true); for (let t = 0; t + dt < length; t += dt) assert.equal(h.step(dt, true), 'fill'); h.up('pad'); assert.equal(h.step(dt, true), null); assert.equal(h.fill, 0, 'each tap starts from nothing'); }
  // A hold: it fills, then it is time, once.
  h.down('pad'); let fired = 0, t = 0; for (; t < 2; t += dt) { const does = h.step(dt, fired === 0); if (does === 'power') { fired++; h.spent(); assert.ok(Math.abs(t + dt - HOLD.time) < dt + 1e-9, `fired at ${(t + dt).toFixed(3)} s`); } else if (fired) assert.equal(does, 'repeat', 'the charge is spent: the same hold goes on attacking'); }
  assert.equal(fired, 1); h.up('pad');
  // The fill is what the pad shows.
  h.down('pad'); h.step(HOLD.time / 2, true); assert.ok(Math.abs(h.fill - .5) < 1e-9); h.step(HOLD.time, true); assert.equal(h.fill, 1); h.up('pad'); assert.equal(h.fill, 0);
  // Released early, or slid off (main.ts calls up for both): nothing, and a new press starts over.
  h.down('pad'); assert.equal(h.step(HOLD.time - .02, true), 'fill'); h.up('pad'); h.down('pad'); assert.equal(h.step(.03, true), 'fill', 'not carried over');
  h.clear(); assert.equal(h.held, false);
  // No charge: the hold repeats (main.ts attacks whenever the weapon's cooldown is over) and never fires.
  h.down('key:KeyF'); for (let i = 0; i < 200; i++) assert.equal(h.step(dt, false), 'repeat'); assert.equal(h.fill, 0);
  // The charge becomes ready while the button is already held: the fill starts then, not before.
  assert.equal(h.step(HOLD.time - .05, true), 'fill'); assert.equal(h.step(.06, true), 'power');
  // A strike that cannot go off yet (the hands are busy) is tried again the next step.
  assert.equal(h.step(dt, true), 'power'); h.spent(); assert.equal(h.step(dt, true), 'fill'); h.up('key:KeyF');
  // Two sources (a key and a finger): held until both are up; `only` tells the mouse on a creature apart.
  assert.equal(h.down('key:KeyN'), true); assert.equal(h.down('pointer:1'), false, 'a second source does not attack again'); h.up('key:KeyN'); assert.equal(h.held, true); assert.equal(h.only('pointer:1'), true); h.up('pointer:1'); assert.equal(h.held, false);
  h.down('world'); assert.equal(h.only('world'), true); assert.equal(h.has('world'), true); h.up('nothing'); assert.equal(h.held, true); h.clear();
  // dt of zero or a paused game never advances the fill.
  h.down('pad'); h.step(0, true); h.step(-1, true); assert.equal(h.fill, 0); h.clear();
});

test('main.ts: the press attacks at once, the hold is stepped in the fight\'s step, a dialog or a knock-out lets go, and the mouse on a creature waits until it is in the strike\'s area', () => {
  assert.match(main, /function attackDown\(source:string\)\{if\(airOn\(\)\)attackHold\.down\(source\);basicAttack\(\);\}/);
  const hold = main.slice(main.indexOf('function stepHold('), main.indexOf(' * The power strike, unleashed by holding Attack'));
  assert.match(hold, /if\(!attackHold\.held\)return;\n  if\(!active\|\|state\.hp<=0\|\|visiting\)\{attackHold\.clear\(\);attackPointers\.clear\(\);worldHold=null;return;\}/);
  assert.match(hold, /const mouse=attackHold\.only\('world'\),does=attackHold\.step\(dt,powerReady\(\)&&\(!mouse\|\|powerInReach\(\)\)\);/);
  assert.match(hold, /powerWindup\(world\.fx,[^;]*HOLD\.time\)/, 'light gathers for as long as the pad fills');
  assert.match(main, /function powerReady\(\)\{return airOn\(\)&&powerCharge\.level>0&&!powerWind&&!powerDive;\}/);
  // A finger on the pad, a slide off it, the release; the mouse held on a creature; the keys.
  assert.match(main, /attackPointers\.add\(e\.pointerId\);attackDown\('pointer:'\+e\.pointerId\);try\{target\.setPointerCapture\(e\.pointerId\);\}/);
  assert.match(main, /if\(attackPointers\.has\(e\.pointerId\)&&fightButtonAt\(e\.clientX,e\.clientY\)!=='attack'\)\{attackPointers\.delete\(e\.pointerId\);attackHold\.up\('pointer:'\+e\.pointerId\);\}/);
  assert.match(main, /if\(attackPointers\.delete\(e\.pointerId\)\)attackHold\.up\('pointer:'\+e\.pointerId\);if\(worldHold===e\.pointerId\)\{worldHold=null;attackHold\.up\('world'\);\}/);
  assert.match(main, /if\(e\.pointerType==='mouse'&&e\.button===0&&airOn\(\)&&!placement&&world\.pickEntity\(e\.clientX,e\.clientY\)\?\.kind==='enemy'\)\{world\.pointer\(e\.clientX,e\.clientY\);worldHold=e\.pointerId;attackHold\.down\('world'\);/);
  assert.match(main, /attackHold\.up\('key:'\+e\.code\);/); assert.match(main, /function clearHeldInput\(\)\{[^}]*attackHold\.clear\(\);attackPointers\.clear\(\);worldHold=null;/);
  // The pad's fill is one class, set when the state changes (power-hud.ts); the hint says what to do.
  assert.match(main, /attackCharge\.sync\(powerCharge\.view\(\),shown,attackHold\.held&&powerReady\(\),t\('Attack: hold to unleash the power strike'\),t\('Basic attack'\)\)/);
  assert.match(main, /toast\('Power strike ready! Hold Attack to unleash it\.','💥'\)/);
  // The strike's own wind-up is short now: the hold is the wind-up.
  assert.ok(POWER.windup <= .12 && POWER.windup + HOLD.time < .5);
});

// ---------------------------------------------------------------- 3. The untouched streak

test('the untouched streak: own hits since the last damage taken; +1.5% each up to +30%; damage resets it, a blocked or dodged blow does not; it is dropped after 20 s without a hit', () => {
  assert.deepEqual([STREAK.step, STREAK.max, STREAK.idle, [...STREAK.milestones]], [.015, .3, 20, [10, 20, 30]]);
  const s = new F.UntouchedStreak(); assert.equal(s.count, 0); assert.equal(s.bonus, 1); assert.equal(s.percent, 0);
  const miles: number[] = []; for (let i = 1; i <= 35; i++) { const m = s.hit(); if (m) miles.push(m); assert.ok(Math.abs(s.bonus - (1 + Math.min(.3, .015 * i))) < 1e-9, 'hit ' + i); }
  assert.deepEqual(miles, [10, 20, 30], 'called out at 10, 20 and 30'); assert.equal(s.count, 35); assert.equal(s.percent, 30, 'capped at +30% from 20 hits on');
  const five = new F.UntouchedStreak(); for (let i = 0; i < 5; i++) five.hit(); assert.equal(five.percent, 7.5); for (let i = 0; i < 7; i++) five.hit(); assert.equal(five.percent, 18);
  // It is not timed like the chain: pauses of a fight do not end it.
  s.step(5); s.step(14.9); assert.equal(s.count, 35, 'still there after 19.9 s'); s.hit(); for (let i = 0; i < 19; i++) s.step(1); assert.equal(s.count, 36, 'a hit starts the wait again');
  assert.equal(s.step(1.01), true, 'dropped after 20 s without a hit'); assert.equal(s.count, 0); assert.equal(s.step(100), false);
  // Being hurt: gone at once. A blow that does no damage (blocked, dodged, shielded) is not a hit taken.
  for (let i = 0; i < 12; i++) s.hit(); assert.equal(s.hurt(0), 0); assert.equal(s.hurt(-5), 0); assert.equal(s.hurt(NaN), 0); assert.equal(s.count, 12);
  assert.equal(s.hurt(1), 12, 'it tells what was lost'); assert.equal(s.count, 0); assert.equal(s.bonus, 1); assert.equal(s.hurt(40), 0);
  for (let i = 0; i < 4; i++) s.hit(); s.clear(); assert.equal(s.count, 0); s.step(0); s.step(-3); assert.equal(s.count, 0);
});

test('main.ts: the streak counts the explorer\'s own counted hits (never a pet\'s), replaces the timed ramp as the damage bonus, and breaks only where damage is really taken', () => {
  assert.match(main, /if\(impact&&!remote&&!hazard&&!impact\.helper\)noteComboHit\(e,impact\);/, 'a pet\'s, the dog\'s or a hazard\'s hit never reaches it');
  const note = main.slice(main.indexOf('function noteComboHit('), main.indexOf('// ---- The hit counter'));
  assert.ok(note.indexOf('if(!comboMeter.hit(kind))return;') < note.indexOf('streak.hit()'), 'one swing through a crowd counts once, like the chain');
  assert.match(note, /const mile=streak\.hit\(\);if\(mile\)\{const text=t\('UNTOUCHED ×\{n\}!',\{n:mile\}\);/);
  assert.match(main, /combat\.edge\.bonus=actionHandler\?1:streak\.bonus;/); assert.doesNotMatch(main, /comboMeter\.bonus|v\.bonus/, 'the ramp of the timed chain is gone, so the two cannot stack');
  // onDamage: a dodge, a block, a shield and the moment after a hit all return before the streak is touched.
  const hurt = main.slice(main.indexOf('world.onDamage=('), main.indexOf('world.onHazardEnemy='));
  const at = hurt.indexOf('if(airOn())streak.hurt(damage);'); assert.ok(at > 0);
  for (const earlier of ['dodges(cls,world.jump.height)', 'if(!(amount>0))return;', 'combatTimers.invulnerable>0||combat.invulnerable', 'combat.blocks(from)']) assert.ok(hurt.indexOf(earlier) >= 0 && hurt.indexOf(earlier) < at, earlier);
  assert.match(hurt, /state\.hp=Math\.max\(0,state\.hp-damage\);[^\n]*comboMeter\.break\(\);if\(airOn\(\)\)streak\.hurt\(damage\);/, 'the timed chain ends too, and is summed up');
  // Knock-out, a reset fight and the switch going off drop it; the counter shows it with the bonus it gives.
  assert.match(main, /function clearPower\(\)\{powerCharge\.clear\(\);streak\.clear\(\);/); assert.match(main, /comboMeter\.reset\(\);streak\.clear\(\);attackHold\.clear\(\);/); assert.match(main, /powerCharge\.step\(dt\);streak\.step\(dt\);/);
  assert.match(main, /s=\{count:Math\.max\(v\.count,streak\.count\),bonus:actionHandler\?0:streak\.percent,live:true,/);
  // The power strike's charge is its own count: 20 own hits, untouched by the streak's rules.
  assert.equal(POWER.need, 20); assert.doesNotMatch(hurt, /powerCharge/);
});

// ---------------------------------------------------------------- 4. The fourth skill level, and the weapon specials

test('the fourth skill level stays in the save and now raises the attack chain\'s third hit, Sky Spin and the weapon special; the bench shows it as "Attack chain"', () => {
  const s = M.newGame(); (s as { skillLevels?: number[] }).skillLevels = [1, 2, 3, 4];
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.skillLevels, [1, 2, 3, 4], 'four slots, as saved'); assert.equal(U.skillLevel(back, 3), 4); assert.deepEqual(U.skillLevels(back), [1, 2, 3, 4]);
  assert.deepEqual(M.parseSave(JSON.stringify({ ...M.newGame(), skillLevels: [0, 0, 0, 5] }))!.skillLevels, [0, 0, 0, 5]);
  // The third hit: +8% a level; the first two do not change.
  assert.equal(CHAIN.perLevel, .08); for (const kind of ['sword', 'fist', 'gun'] as const) { assert.equal(F.chainPower(kind, 0, 5), CHAIN.hits[kind][0]); assert.equal(F.chainPower(kind, 1, 5), CHAIN.hits[kind][1]); assert.ok(Math.abs(F.chainPower(kind, 2, 5) - CHAIN.hits[kind][2] * 1.4) < 1e-9); assert.equal(F.chainPower(kind, 2, 99), F.chainPower(kind, 2, 5), 'never past level 5'); }
  const a = arena(FIST, [{ x: 0, z: 1.2 }], { level: 5 }); for (let i = 0; i < 3; i++) { a.sim.basic(a.targets[0]); a.run(.5); } assert.deepEqual(a.amounts(), [105, 116, 204]);
  const spin = arena(FIST, [{ x: 0, z: 1.2 }], { level: 5 }); spin.sim.airSwing(1.4); assert.equal(spin.hits[0].h.amount, 112, 'Sky Spin: 80% x 1.4');
  assert.match(main, /const weapon=M\.weaponStats\(state\),level=skillTuning\(3,M\.skillLevel\(state,3\)\)\.damage;/, 'every weapon\'s spin is raised by it now');
  // The bench with the moves on: three specials, then the chain (still slot 3, so it can still be bought), then Jump.
  const ui = { art: (_: string, icon: string) => icon, chips: () => '', skills: [...MOVE_SKILLS, CHAIN_SKILL], moves: true, jump: true, weaponKind: 'sword' };
  const rich = M.newGame(); rich.level = 30; rich.energy = 1e7; for (const id of Object.keys(M.ITEMS)) rich.bag[id] = 99; (rich as { skillLevels?: number[] }).skillLevels = [0, 0, 0, 2];
  const html = benchHtml(rich, 'skills', ui); assert.equal([...html.matchAll(/data-bench-action="skill" data-index="(\d)"/g)].map(m => +m[1]).join(), '0,1,2,3');
  assert.match(html, /Attack chain/); assert.doesNotMatch(html, /Paw Storm/); assert.match(html, /<kbd>F<\/kbd>/, 'the attack key, not a skill key');
  assert.equal(skillEffect(3, 2, 0, 'sword', true), 'Third hit ×1.6'); assert.equal(skillEffect(3, 0, 0, 'gun', true), 'Third hit ×1.25'); assert.equal(skillEffect(3, 2, 6, 'sword', false), 'Damage ×1.16 · cooldown 5.52 s', 'switched off: the old row');
  assert.match(MOVE_LEVEL_TEXT[3], /third hit of your attack, for Sky Spin and for your weapon special/);
  const done = U.upgradeSkill(rich, 3); assert.deepEqual(done, { index: 3, level: 3 }, 'the level can still be raised');
  assert.match(main, /skills:\[\.\.\.ownSkills\([^\]]*\),\.\.\.\(airOn\(\)\?\[CHAIN_SKILL\]:\[\]\)\],moves:airOn\(\)/);
});

test('nothing owned is lost: every weapon special and every uniform skill goes off with the power strike, at the fourth level\'s damage; in a disguise the four skills stay on the paw instead', () => {
  const ids = new Set<string>([...Object.values(M.ITEMS).map(item => (item as { weapon?: { special?: string } }).weapon?.special).filter((v): v is string => !!v), ...Object.values(UNIFORM_SPECIAL)]);
  assert.ok(ids.size >= 20, `${ids.size} specials`); ids.delete('fist');
  for (const id of ids) {
    assert.ok(SPECIALS[id], id + ' is a named special');
    const a = arena({ kind: 'sword', range: 2, special: id }, [{ x: 0, z: 2.2 }, { x: 1.5, z: 1.5 }, { x: -1.5, z: 2 }]); const effects: unknown[] = [];
    (a.sim as unknown as { host: { effect(e: unknown): void } }).host.effect = e => effects.push(e);
    assert.equal(a.sim.weaponSpecial(id), true, id); a.run(3); assert.ok(a.hits.length > 0 || effects.length > 0, id + ' does something');
    // The slot it used to stand in is empty while the moves are on, so this is the one way to it.
    const b = arena({ kind: 'sword', range: 2, special: id }, [{ x: 0, z: 2.2 }]); b.sim.edge.moves = true; assert.equal(b.sim.skill(3, id), false);
  }
  assert.equal(arena(FIST, []).sim.weaponSpecial('fist'), false); assert.equal(arena(FIST, []).sim.weaponSpecial(undefined), false, 'bare paws have none: their old fourth skill is the chain itself');
  // The level raises it as it did in the fourth slot: Crescent slash x2.4, +8% a level.
  const plain = arena({ kind: 'sword', special: 'crescent' }, [{ x: 0, z: 2 }]); plain.sim.weaponSpecial('crescent'); assert.equal(plain.hits[0].h.amount, 240);
  const levelled = arena({ kind: 'sword', special: 'crescent' }, [{ x: 0, z: 2 }], { level: 5 }); levelled.sim.weaponSpecial('crescent'); assert.equal(levelled.hits[0].h.amount, 336);
  const after = arena({ kind: 'sword', range: 2, special: 'crescent' }, [{ x: 0, z: 1.5 }], { level: 5, chain: true }); after.sim.weaponSpecial('crescent'); assert.equal(after.sim.basic(after.targets[0]), true); assert.equal(after.hits.at(-1)!.h.amount, 99, 'the factor does not leak into the next attack');
  // main.ts: with the strike, on the ground and after the dive version; not in a disguise (its own four skills are on the paw).
  const release = main.slice(main.indexOf('function releasePower('), main.indexOf('/** A ground attack passed under the explorer.'));
  assert.match(release, /combat\.powerStrike\(shape,level,powerCap\);\n[^\n]*\n[^\n]*\n  \{const own=state\.gear\.disguise\?undefined:weapon\.special;if\(own&&own!=='fist'&&combat\.weaponSpecial\(own\)\)\{/);
  assert.match(main, /function ownSkills\(special:string\):readonly \{name:string;icon:string;cd:number\}\[\]\{return airOn\(\)\?MOVE_SKILLS:\[\.\.\.BASE_SKILLS,SPECIALS\[special\]\?\?SPECIALS\.fist\];\}/, 'three with the switch on, the old four with it off');
  assert.match(main, /function skillList\(\)\{const disguise=state\.gear\.disguise\?M\.DISGUISES\[state\.gear\.disguise\]:null;return disguise\?\.skills\?\?ownSkills\(/, 'a disguise brings its four');
  for (const d of Object.values(M.DISGUISES)) assert.equal(d.skills.length, 4);
  // The fourth button is put away with three skills and comes back with four.
  assert.match(main, /if\(button\.hidden===!!skill\)button\.hidden=!skill;if\(!skill\)return;/); assert.match(main, /four=!!skill&&airOn\(\);if\(cluster\.classList\.contains\('toes-4'\)!==four\)cluster\.classList\.toggle\('toes-4',four\);/);
  assert.match(css, /body\.air-combat #app #hud \.skill\[hidden\] \{ display: none; \}/);
});

// ---------------------------------------------------------------- 5. The paw under a thumb

/** The paw on a screen: the Attack pad's centre from the screen's corner, as hud-ours.css places it (the paw's edge gap, 22 px over the bottom). */
const SCREENS = [{ name: '390x844', sk: 50, edge: 18 }, { name: '320x568', sk: 44, edge: 12 }, { name: '844x390', sk: 46, edge: 18 }, { name: '768x1024', sk: 54, edge: 18 }];
test('the paw: Attack at least 60 px in the corner, Jump beside it, three specials of at least 48 px on an arc that a thumb on Attack or on Jump does not cover, at every screen size; a disguise adds a crown', () => {
  for (const { name, sk, edge } of SCREENS) for (const count of [3, 4] as const) {
    const p = F.pawLayout(sk, count), where = `${name}, ${count} toes`, corner = { x: -(edge + p.attack.size / 2), y: -(22 + p.attack.size / 2) };
    assert.ok(p.attack.size >= 60 && p.jump.size >= 52, where); assert.equal(p.toes.length, count); assert.ok(p.toes.every(toe => toe.size >= 48), where + ': 48 px toes');
    assert.ok(p.toes.every(toe => toe.size >= 1.08 * 44 - .5), 'a little larger than the 44 px toes of four');
    assert.ok(p.jump.x > 0 && Math.abs(p.jump.y) < p.attack.size / 2, where + ': Jump is beside the pad on the inner side');
    const gap = (a: { x: number; y: number; size: number }, b: { x: number; y: number; size: number }) => Math.hypot(a.x - b.x, a.y - b.y) - a.size / 2 - b.size / 2;
    assert.ok(gap(p.attack, p.jump) >= 9, `${where}: room for the charge ring between the pad and Jump (${gap(p.attack, p.jump).toFixed(1)})`);
    for (const [i, toe] of p.toes.entries()) {
      assert.ok(F.thumbClear(toe, corner, p.attack) >= 0, `${where}: a thumb on Attack leaves toe ${i} clear (${F.thumbClear(toe, corner, p.attack).toFixed(1)})`);
      assert.ok(F.thumbClear(toe, corner, p.jump) >= 0, `${where}: a thumb on Jump leaves toe ${i} clear (${F.thumbClear(toe, corner, p.jump).toFixed(1)})`);
      assert.ok(gap(toe, p.attack) >= 9 && gap(toe, p.jump) >= 6, `${where}: toe ${i} is clear of both pads`);
      assert.ok(toe.y - toe.size / 2 > Math.max(p.attack.size / 2, p.jump.y + p.jump.size / 2) - toe.size * .75, `${where}: toe ${i} is above the pads`);
      assert.ok(toe.x - toe.size / 2 >= corner.x + 6, `${where}: toe ${i} stays on the screen`);
      for (const other of p.toes.slice(0, i)) assert.ok(gap(toe, other) >= 6, `${where}: toes ${i} are apart (${gap(toe, other).toFixed(1)})`);
    }
    // The thumb itself: 100 px wide, and it does cover what it rests on.
    assert.equal(PAW.thumb, 100); assert.ok(F.thumbClear(p.attack, corner, p.attack) < 0 && F.thumbClear(p.jump, corner, p.jump) < 0);
  }
  // The first three keep their places when the fourth comes: it is a crown over the two inner toes.
  assert.deepEqual(F.pawToes(4).slice(0, 3), F.pawToes(3)); assert.deepEqual(F.pawToes(4)[3], [...PAW.crown]);
  const [, mid, inner] = F.pawToes(3); for (const toe of [mid, inner]) assert.ok(Math.abs(Math.hypot(PAW.crown[0] - toe[0], PAW.crown[1] - toe[1]) - 1.24) < .02, 'the crown sits the same distance from both');
});

test('hud-ours.css places the buttons exactly where five-rules.ts PAW says, for both hands', () => {
  const at = (hand: string, i: number) => { const m = css.match(new RegExp(`body\\.air-combat #app #hud${hand} \\.skills \\.skill\\[data-index="${i}"\\][^{]*\\{ --x: (-?[\\d.]+); --y: (-?[\\d.]+); \\}`)); assert.ok(m, `${hand} ${i}`); return [+m![1], +m![2]]; };
  const toes = F.pawToes(4);
  // Right-handed the skills read left to right, so the first is the inner toe; left-handed the first is the outer toe.
  assert.deepEqual([0, 1, 2].map(i => at('', i)), [toes[2], toes[1], toes[0]]); assert.deepEqual([0, 1, 2].map(i => at('\\.joystick-right', i)), [toes[0], toes[1], toes[2]]);
  assert.deepEqual(at('', 3), toes[3]); assert.match(css, /\.skills \.skill\[data-index="3"\], body\.air-combat #app #hud\.joystick-right \.skills \.skill\[data-index="3"\] \{ --x: 2\.089; --y: 2\.75; \}/, 'the crown is the same for both hands');
  assert.match(css, new RegExp(`--s: var\\(--jp\\); --x: ${String(PAW.jumpAt[0])}; --y: -\\.11;`)); assert.equal(PAW.jumpAt[1], -.11);
  assert.match(css, new RegExp(`--pad: max\\(${PAW.padMin}px, calc\\(var\\(--sk\\) \\* ${PAW.pad}\\)\\); --jp: max\\(${PAW.jumpMin}px, calc\\(var\\(--sk\\) \\* ${PAW.jump}\\)\\); --toe: max\\(${PAW.toeMin}px, calc\\(var\\(--sk\\) \\* ${PAW.toe}\\)\\);`));
  // The dock and the fishing button leave room for the paw's height.
  const tall = Math.max(...SCREENS.map(({ sk }) => { const p = F.pawLayout(sk, 3); return (Math.max(...p.toes.map(toe => toe.y + toe.size / 2)) + p.attack.size / 2) / sk; }));
  assert.ok(tall <= 3.36 && tall > 3.25, `the paw is ${tall.toFixed(3)} skill widths tall`); assert.match(css, /body\.air-combat \{ --dock-room: calc\(var\(--sk\) \* 3\.36 \+ 44px\); \}/);
});

// ---------------------------------------------------------------- 6. Balance against the fight before

test('fight simulation: against the four-skill fight before it, damage per second moves by less than 8% over all, no hit passes the boss cap, and fighting untouched is what pays', { timeout: 240000 }, () => {
  const rows = fiveReport(); assert.equal(rows.length, 18); assert.equal(Object.keys(BEFORE_FIVE).length, 18);
  const mean = rows.reduce((a, r) => a + r.change, 0) / rows.length;
  assert.ok(Math.abs(mean) <= .08, `mean change ${(mean * 100).toFixed(1)}%`);
  for (const boss of ['bear', 'yeti', 'shadowlord']) { const mine = rows.filter(r => r.boss === boss), m = mine.reduce((a, r) => a + r.change, 0) / mine.length; assert.ok(Math.abs(m) <= .08, `${boss}: ${(m * 100).toFixed(1)}%`); }
  for (const r of rows) {
    assert.ok(r.change > -.16 && r.change < .1, `${r.boss} ${r.script}: ${(r.change * 100).toFixed(1)}%`);
    assert.ok(r.biggest <= POWER.bossCap + 1e-9, `${r.boss} ${r.script}: biggest hit ${(r.biggest * 100).toFixed(1)}% of the boss`);
    assert.ok(r.powers >= 1, `${r.boss} ${r.script}: the hold is used`); assert.ok(r.bonus > .02 && r.bonus <= STREAK.max, `${r.boss} ${r.script}: streak bonus ${(r.bonus * 100).toFixed(1)}%`);
  }
  // Fighting without being hit is what pays now: the careless script's bonus is far under the careful ones'.
  const bonus = (script: string) => rows.filter(r => r.script === script).reduce((a, r) => a + r.bonus, 0) / 3;
  assert.ok(bonus('careless') < .08 && bonus('single') > .15 && bonus('launch') > .15, `${bonus('careless').toFixed(3)} against ${bonus('single').toFixed(3)}`);
});
