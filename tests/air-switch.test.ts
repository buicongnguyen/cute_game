// The one Settings switch for jumping and air combat (jump-rules.ts AIR_COMBAT_STORE, main.ts airOn). Off, the game is the
// one from before jumping: the same damage on a boss, the same keys, the same HUD markup and paw. On, the new pieces appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as J from '../src/jump-rules.ts';
import { World } from '../src/world.ts';
import * as M from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { CombatSimulation, type CombatHit, type CombatHost, type CombatTarget } from '../src/combat.ts';
import { BOSS_CALLOUTS } from '../src/boss-patterns.ts';
import { keysGuideHtml } from '../src/hud-keys.ts';
import { eatKey, handKey, keyboardBindings } from '../src/gameplay-controls.ts';
import { TelegraphDecals } from '../src/telegraph.ts';
import { fight, FIGHTS } from '../promo/fight-sim.mts';
import type { Effects } from '../src/fx.ts';

const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const main = read('main.ts'), css = read('hud-ours.css');

test('the switch is on by default, remembered per device, and anything but "off" reads as on', () => {
  const store = new Map<string, string>(), s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(J.AIR_COMBAT_STORE, 'zoo-air-combat'); assert.equal(J.readAirCombat(s), true); assert.equal(J.readAirCombat(null), true);
  J.saveAirCombat(s, false); assert.equal(store.get('zoo-air-combat'), 'off'); assert.equal(J.readAirCombat(s), false);
  J.saveAirCombat(s, true); assert.equal(J.readAirCombat(s), true); store.set('zoo-air-combat', 'junk'); assert.equal(J.readAirCombat(s), true);
  assert.equal(J.readAirCombat({ getItem() { throw new Error('blocked'); } }), true);
});

test('off: the keys are the old ones (Space attacks, nothing jumps) whatever the Space choice says', () => {
  for (const space of ['jump', 'attack'] as const) { assert.equal(J.jumpKeyAction('Space', space, false), 'attack'); assert.equal(J.jumpKeyAction('ShiftLeft', space, false), ''); assert.equal(J.jumpKeyAction('KeyF', space, false), ''); }
  // The keyboard guide without a Space choice is the one from before: no Jump row, Space on the basic attack.
  const guide = keysGuideHtml('wasd', false);
  assert.doesNotMatch(guide, /Jump|Shift/);
  assert.deepEqual([...guide.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map(m => [m[1], m[2].replace(/<\/?kbd>/g, ' ').trim().replace(/\s+/g, ' ')]),
    [['Move', 'W A S D'], ['Basic attack', 'Space'], ['Skills', 'J K L ;'], ['Interact', 'F'], ['Journal', 'P'], ['Backpack', 'I'], ['Eat', 'H'], ['Map', 'M']]);
  assert.match(main, /keysGuide\.render\(state\.settings\.keyboardLayout,getLanguage\(\),airOn\(\)\?spaceKey:undefined\)/);
  assert.match(main, /const spaceAction=jumpKeyAction\(event\.code\|\|'',spaceKey,airOn\(\)\);/);
  // F asks the shared Attack rule first (attack-intent.ts); switched off it never swings at nothing: it uses the thing beside you, hits a creature in reach, or picks one to walk to.
  assert.match(main, /else if\(key==='f'\)\{fKey\(event\.code\);\}/);
  assert.match(main, /if\(!airOn\(\)\)\{if\(hostile\)basicAttack\(\);else pick\(\);return;\}/, 'F is interact only, as before');
  // H is Eat, as before, and G does nothing.
  assert.equal(eatKey(false), 'h'); assert.equal(handKey('h', false), 'eat'); assert.equal(handKey('g', false), '');
});

test('on: N is the basic attack for the right hand, a key no layout uses, and H still eats; off: H eats', () => {
  assert.equal(eatKey(true), 'h'); assert.equal(handKey('n', true), 'attack'); assert.equal(handKey('h', true), 'eat'); assert.equal(handKey('n', false), ''); assert.equal(handKey('f', true), ''); assert.equal(handKey('j', true), '');
  // G (and H) are free in both layouts: not a skill, the journal, a WASD move, or one of the fixed keys of main.ts (F, I, M, R).
  for (const layout of ['classic', 'wasd']) { const b = keyboardBindings(layout), taken = [...b.skills, b.journal, 'w', 'a', 's', 'd', 'f', 'i', 'm', 'r'] as string[]; assert.ok(!taken.includes('n') && !taken.includes('h'), layout); }
  assert.deepEqual([...new Set([...main.matchAll(/key==='([a-z])'/g)].map(m => m[1]))].sort(), ['f', 'i', 'm', 'r'], 'the fixed letter keys of the key handler');
  assert.match(main, /else if\(handKey\(key,airOn\(\)\)==='eat'\)void quickEat\(\);else if\(handKey\(key,airOn\(\)\)==='attack'\)attackDown\('key:'\+event\.code\);/);
  assert.match(main, /function attackDown\(source:string\)\{if\(airOn\(\)\)attackHold\.down\(source\);basicAttack\(\);\}/, 'switched off a press is one attack and nothing is held');
  // The guide: on, H joins the basic attack and Eat shows G in both layouts and both Space choices; off, it is the old guide.
  const rows = (html: string) => Object.fromEntries([...html.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map(m => [m[1], m[2].replace(/<\/?kbd>/g, ' ').trim().replace(/\s+/g, ' ')]));
  for (const layout of ['classic', 'wasd']) {
    assert.equal(rows(keysGuideHtml(layout, false, 'jump'))['Basic attack'], 'F N'); assert.equal(rows(keysGuideHtml(layout, false, 'attack'))['Basic attack'], 'Space F N');
    for (const space of ['jump', 'attack'] as const) assert.equal(rows(keysGuideHtml(layout, false, space)).Eat, 'H');
    assert.equal(rows(keysGuideHtml(layout, false)).Eat, 'H'); assert.equal(rows(keysGuideHtml(layout, false))['Basic attack'], 'Space');
  }
  assert.match(main, /eatTip='Eat · H'/, 'the quick-eat button names the key that eats now');
});

test('off: the page markup is the one from before; the Jump toe and the combo chip are made only when the switch is on', () => {
  const hud = main.slice(main.indexOf('<div id="hud" hidden>'), main.indexOf('<div id="space-hud" hidden>'));
  assert.doesNotMatch(hud, /jump-pad|combo-chip|combo-counter|power-pad|data-action="jump"|data-action="power"/); assert.match(hud, /<kbd>Space<\/kbd> attack<\/div>/);
  assert.match(hud, /<button class="attack-pad" data-action="attack" aria-label="Basic attack" title="Basic attack">\$\{hudIcon\('attack'\)\}<\/button><\/div><div id="keys-guide"/, 'the fight cluster ends with the pad');
  const sync = main.slice(main.indexOf('function syncAirCombat(){'), main.indexOf('function jumpBlock(){'));
  assert.match(sync, /if\(on&&!document\.querySelector\('#hud \.jump-pad'\)\)\{/); assert.match(sync, /document\.body\.classList\.toggle\('air-combat',on\)/); assert.match(sync, /world\.jumpRules=on/);
  assert.match(sync, /if\(!on\)\{world\.jump\.cancel\(\);[^}]*combat\.edge\.sure=false;combat\.edge\.bonus=1;combat\.edge\.launch=0;/, 'switching off clears every bonus');
  // The gates sit at the entry points: input, the per-step rules, dodging, the boss block, the HUD pieces.
  assert.match(main, /function airOn\(\)\{return airCombat&&!actionHandler;\}/, 'online play keeps the old rules for now, so a room never mixes them');
  assert.match(main, /function jumpBlock\(\)\{\n  if\(!airOn\(\)\)return 'idle' as const;/);
  assert.match(main, /function stepFight\(dt:number,active:boolean,combatActive:boolean\)\{\n  syncAirCombat\(\);if\(!airOn\(\)\)return;/);
  assert.match(main, /combat\.edge\.scale=target=>\{const e=target as Enemy;if\(!airOn\(\)\|\|/);
  assert.match(main, /if\(airOn\(\)&&dodges\(cls,world\.jump\.height\)\)/);
  assert.match(main, /function noteComboHit\(e:Enemy,impact:CombatHit\)\{\n  if\(!airOn\(\)\)return;/);
  assert.match(main, /const space=!airOn\(\)\?'':`<div class="settings-row keyboard-settings space-key-settings">/, 'the Space choice shows only while the switch is on');
  assert.match(main, /data-action="air-combat" aria-label="Jump and air combat"/);
});

function arena() {
  const player = { x: 0, z: 0 }; let facing = 0; const targets: CombatTarget[] = [], hits: CombatHit[] = [];
  const host: CombatHost = { position: () => player, facing: () => facing, face: v => facing = v, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 100, critChance: 0, critDamage: 5 }), move() {}, effect() {}, hit: (_t, impact) => { hits.push(impact); } };
  return { sim: new CombatSimulation(host, () => .5), targets, hits };
}
test('off: damage on a boss is what it was (no block, no ramp, no launcher, no sure critical)', () => {
  const a = arena(), boss = { id: 'boss', x: 0, z: 1.2, hp: 1e6, maxHp: 1e6, radius: .8, boss: true }; a.targets.push(boss);
  for (let i = 0; i < 6; i++) a.sim.basic(boss);
  assert.deepEqual(a.hits.map(h => h.amount), [100, 100, 150, 100, 100, 150], 'the reference punch chain: 1, 1, 1.5');
  assert.ok(a.hits.every(h => !h.critical && h.lift === 0 && h.blocked === undefined));
  a.sim.skill(2); for (let t = 0; t < .5; t += .025) a.sim.update(.025, true);
  assert.equal(a.hits.at(-1)!.amount, 230, 'Root Quake x2.3'); assert.equal(a.sim.plunging, false);
  // The scripted fight with the switch off never blocks or dodges.
  const f = FIGHTS[1], r = fight(f.boss, f.planet, f.at, f.level, f.gear, 'classic', 1); assert.equal(r.blocked, 0); assert.equal(r.dodged, 0); assert.equal(r.won, true);
});

function world(on: boolean) {
  const w = Object.assign(Object.create(World.prototype), {
    state: M.newGame(), scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(), jump: new J.JumpState(), decals: new TelegraphDecals(),
    onInteract() {}, onAttackEnemy() {}, onZone() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home')); if (on) w.jumpRules = true; return w;
}
test('a boss slam with the switch off and on: the old disc, callout and single ring; or the rippling ring, the arrow and an aftershock', () => {
  const run = (on: boolean) => {
    const w = world(on), callouts: string[] = [], blows: number[] = []; let ripple = false, steps = 0;
    w.fx = { text: (_a: unknown, m: string, style: string) => { if (style.includes('callout')) callouts.push(m); }, burst() {}, ring() {}, spark() {}, shake() {}, update() {}, shakeOffset: () => new T.Vector3() } as unknown as Effects;
    w.onDamage = n => { blows.push(Math.round(n)); }; w.position.set(32, 0, 0); const e = w.spawnSpecies('bear', 30, 0, 0)!; e.attackCount = 1;
    for (; steps < 120; steps++) { w.update(.025, true, false); if (e.phase === 'windup' && w.decals!.active.some(d => d.ground)) ripple = true; if (e.phase === 'chase' && steps > 60) break; if (e.phase !== 'windup' && e.phase !== 'recover' && steps > 50) break; }
    return { callouts, blows, ripple, jumpRules: w.jumpRules };
  };
  const off = run(false), on = run(true);
  assert.ok(!off.jumpRules, 'a world is in the old rules until the game switches them on');
  assert.deepEqual(off.callouts, [BOSS_CALLOUTS.slam]); assert.equal(off.ripple, false); assert.equal(off.blows.length, 1, 'one ring');
  assert.deepEqual(on.callouts, [BOSS_CALLOUTS.slam + ' ⤴']); assert.equal(on.ripple, true); assert.equal(on.blows.length, 2, 'the slam and its aftershock');
  assert.equal(on.blows[1], Math.round(on.blows[0] * J.AFTERSHOCK.power)); assert.equal(off.blows[0], on.blows[0], 'the slam itself is unchanged');
});

test('off: the bench has no Jump row and the old paw sheet is untouched; on: the Attack is the big pad in the corner, Jump beside it on the inner side, three specials on an arc above, mirrored left-handed', () => {
  assert.match(read('upgrade-bench.ts'), /\$\{ui\.jump \? jumpRow\(s, ui\) : ''\}/); assert.match(main, /jump:airOn\(\),disguised:/, 'the bench offers Jump only with the switch on');
  // The sheet from before is still there word for word (tests/hud-ours.test.ts pins the rest).
  for (const old of ['width: calc(var(--sk) * 3.66); height: calc(var(--sk) * 2.38); max-width: none;', '#app #hud .skill[data-index="0"] { left: 0; bottom: calc(var(--sk) * .533); }', '--dock-room: calc(var(--sk) * 2.38 + 44px);', '#app #hud .attack-pad { display: none; }', 'display: grid; place-items: center; position: absolute; left: calc(50% - var(--sk) * .6); bottom: 0; width: calc(var(--sk) * 1.2); height: calc(var(--sk) * 1.2); padding: 0;', '#app #hud .attack-pad > svg { width: 60%; height: 60%; }']) assert.ok(css.includes(old), old);
  // Every rule that moves or resizes the attack pad for the new roles is under the switch (its air look hangs on .skills.air, a class only the switched-on game sets).
  const base = css.slice(0, css.indexOf('Jumping and air combat (Settings switch; body.air-combat)')); assert.ok(base.length > 1000 && !base.includes('air-combat'));
  for (const line of css.slice(base.length).split('\n').filter(line => line.includes('.attack-pad') && !line.trim().startsWith('/*') && !line.includes('.skills.air'))) assert.ok(/body(\.air-combat|:not\(\.air-combat\))/.test(line), 'only under the switch: ' + line.trim().slice(0, 80));
  assert.ok(css.includes('#app #hud .jump-pad { display: none; }'), 'no Jump pad without the switch');
  assert.ok(css.includes('body:not(.air-combat) #app #hud .attack-pad > :not(svg) { display: none; }'), 'switched off again, the pad is bare: no charge ring on it');
  const scoped = css.split('\n').filter(line => /jump-pad|3\.36|--pad|--toe|--jp|--x:|--y:|toes-4/.test(line) && line.includes('{') && !line.trim().startsWith('/*') && !line.includes('#app #hud .jump-pad { display: none; }') && !/^\s*(border-radius|display: grid|--s:|--pad:|touch-action)/.test(line.trim()));
  assert.ok(scoped.length > 12); for (const line of scoped) assert.ok(line.includes('body.air-combat'), 'only under the switch: ' + line.trim().slice(0, 80));
  // The Attack is the big pad in the paw's corner (60 px at least), round; Jump is beside it on the inner side; left-handed it is mirrored.
  assert.match(css, /body\.air-combat #app #hud \.skills, body\.air-combat #app #hud\.joystick-on \.skills \{\s*width: calc\(var\(--sk\) \* 3\.36\); height: calc\(var\(--sk\) \* 3\.36\);\s*--pad: max\(60px, calc\(var\(--sk\) \* 1\.3\)\); --jp: max\(52px, calc\(var\(--sk\) \* 1\.08\)\); --toe: max\(48px, calc\(var\(--sk\) \* 1\.08\)\);/);
  assert.match(css, /body\.air-combat #app #hud \.attack-pad \{ left: auto; right: 0; bottom: 0; width: var\(--pad\); height: var\(--pad\); min-width: 0; border-radius: 50%; touch-action: none; \}/);
  assert.match(css, /body\.air-combat #app #hud\.joystick-right \.attack-pad \{ right: auto; left: 0; \}/);
  assert.match(css, /body\.air-combat #app #hud \.jump-pad \{\s*--s: var\(--jp\); --x: 1\.5; --y: -\.11; display: grid;[^}]*background: linear-gradient\(160deg, #8fe0ff, #2f9be6\);/, 'Jump: sky blue, one and a half skill widths to the inner side, level with the pad');
  // Every toe and Jump is placed from the Attack pad's centre by its --x and --y; left-handed the same numbers run from the left.
  assert.match(css, /right: calc\(var\(--pad\) \/ 2 \+ var\(--sk\) \* var\(--x\) - var\(--s\) \/ 2\); bottom: calc\(var\(--pad\) \/ 2 \+ var\(--sk\) \* var\(--y\) - var\(--s\) \/ 2\);/);
  assert.match(css, /body\.air-combat #app #hud\.joystick-right \.skill, [^{]*\{ right: auto; left: calc\(var\(--pad\) \/ 2 \+ var\(--sk\) \* var\(--x\) - var\(--s\) \/ 2\); \}/);
  // The specials read left to right in key order for both hands (tests/five-rules.test.ts checks the places themselves).
  const xs = (hand: string) => [0, 1, 2].map(i => +css.match(new RegExp(`body\\.air-combat #app #hud${hand} \\.skills \\.skill\\[data-index="${i}"\\] \\{ --x: (-?[\\d.]+);`))![1]);
  const right = xs(''), left = xs('\\.joystick-right'); assert.ok(right[0] > right[1] && right[1] > right[2], 'right-handed: the first skill is the inner (left) toe'); assert.ok(left[0] < left[1] && left[1] < left[2], 'left-handed: the first skill is the outer (left) toe'); assert.deepEqual(right, [...left].reverse());
  // The air look follows the attack (toe) and the skills; the dive look is the attack's. Jump keeps its sky blue.
  assert.match(css, /#app #hud \.skills\.air \.skill, #app #hud \.skills\.air \.attack-pad \{ border-color: #bfeeff;/); assert.match(css, /#app #hud \.skills\.air\.dive \.attack-pad \{ background:/); assert.doesNotMatch(css, /\.skills\.air[^{]*\.jump-pad/);
  // The gestures read the buttons by their action, not their place: the slide starts on Jump and lands on 'attack' or a skill.
  assert.match(main, /function fightButtonAt\(x:number,y:number\)\{const b=\(document\.elementFromPoint\(x,y\) as HTMLElement\|null\)\?\.closest<HTMLElement>\('#hud \.skills button'\);return !b\?null:b\.dataset\.action==='attack'\?'attack':b\.dataset\.action==='skill'\?'skill'\+b\.dataset\.index:null;\}/);
  assert.match(main, /if\(target\?\.dataset\.action==='jump'&&started&&!uiBlocked\(\)&&airOn\(\)\)\{e\.preventDefault\(\);jumpPointers\.add\(e\.pointerId\);touchFight=e\.pointerType==='touch';jumpInput\.down\(\);/, 'the pad jumps as the finger lands; holding it keeps jumpInput held for the extra jumps');
  assert.match(css, /body\.air-combat \{ --dock-room: calc\(var\(--sk\) \* 3\.36 \+ 44px\); \}/, 'the dock leaves room for the taller paw');
  assert.doesNotMatch(css, /animation\s*:|transition\s*:|backdrop-filter|@keyframes/);
});

test('scripted fights: with the block at 0.6 a hero without the double jump still wins (the Yeti in under 100 s), and the double jump is faster', () => {
  // The Shadow Lord is met two levels up and sizes itself to the hero (+24% health): blocked, it is a two to three minute fight
  // on the ground, which is why the block stays switched off (BOSS_BLOCK_ON) until its share is tuned again.
  for (const f of FIGHTS.slice(1)) {
    // The hero holds Attack when a strike is charged: that is where the sword's own special is now.
    const single = fight(f.boss, f.planet, f.at, f.level, f.gear, 'single', 2, undefined, { power: true }), double = fight(f.boss, f.planet, f.at, f.level, f.gear, 'double', 2, undefined, { power: true });
    assert.ok(single.won && single.seconds < (f.boss === 'yeti' ? 100 : 200), `${f.boss} on the ground: ${single.seconds.toFixed(0)} s`); assert.ok(single.blocked > 0, 'ground hits were blocked');
    assert.ok(double.won && double.seconds < single.seconds, `${f.boss} with the double jump: ${double.seconds.toFixed(0)} s`);
    assert.ok(Math.max(single.biggest, double.biggest) / single.bossHp < .15, 'no single hit takes 15% of a boss');
  }
  const bear = FIGHTS[0], r = fight(bear.boss, bear.planet, bear.at, bear.level, bear.gear, 'single', 2); assert.equal(r.blocked, 0, 'the King Bear is met before the double jump: it does not block'); assert.ok(r.dodged > 0);
});

test('off or online: no hit counter, no power strike, no charge, no streak, no chain, no hold (each asks airOn first)', () => {
  const block = main.slice(main.indexOf('function noteComboHit('), main.indexOf('/** A ground attack passed under the explorer.'));
  for (const fn of ['noteComboHit(e:Enemy,impact:CombatHit){\n  if(!airOn())return;', 'function powerStrike(){\n  if(!airOn()||']) assert.ok(block.includes(fn), fn);
  assert.match(block, /if\(airOn\(\)&&v\.live&&v\.count>=COUNTER\.from\)/); assert.match(block, /const shown=airOn\(\)&&started&&/);
  // Its step runs only inside stepFight, after the switch's own gate.
  const step = main.slice(main.indexOf('function stepFight('), main.indexOf('combat.edge.spent='));
  assert.ok(step.indexOf('syncAirCombat();if(!airOn())return;') >= 0 && step.indexOf('syncAirCombat();if(!airOn())return;') < step.indexOf('stepCounter(dt)'));
  assert.equal(main.split('stepCounter(dt)').length, 2, 'called from one place');
  const sync = main.slice(main.indexOf('function syncAirCombat(){'), main.indexOf('function jumpBlock(){'));
  assert.match(sync, /if\(on&&!document\.querySelector\('#hud \.jump-pad'\)\)\{\n[^\n]*\n[^\n]*ATTACK_CHARGE_HTML[^\n]*COUNTER_HTML/, 'the pad\'s ring and the counter are made only when the switch is first on');
  assert.match(sync, /combat\.edge\.moves=on;combat\.edge\.chain=on;/, 'the chain is the basic attack only with the switch on');
  assert.match(main, /if\(airOn\(\)\)streak\.hurt\(damage\);/); assert.match(main, /combat\.edge\.bonus=actionHandler\?1:streak\.bonus;/);
  // The hold: its step is inside stepFight after the gate, and a pointer on the pad only holds with the switch on.
  assert.ok(step.indexOf('stepHold(dt,active)') > step.indexOf('syncAirCombat();if(!airOn())return;')); assert.match(main, /if\(target\?\.dataset\.action==='attack'&&started&&!uiBlocked\(\)&&airOn\(\)\)\{/);
  // The basic attack with the switch off is the old one, hit for hit (the chain needs edge.chain).
  { const a = arena(), t = { id: 't', x: 0, z: 1.2, hp: 1e6, maxHp: 1e6, radius: .5 }; a.targets.push(t); for (let i = 0; i < 6; i++) a.sim.basic(t); assert.deepEqual(a.hits.map(h => [h.amount, h.lift]), [[100, 0], [100, 0], [150, 0], [100, 0], [100, 0], [150, 0]]); }
  // The simulation with the switch off never charges or strikes, with or without the option.
  const f = FIGHTS[0], off = fight(f.boss, f.planet, f.at, f.level, f.gear, 'classic', 1, 1, { power: true }), plain = fight(f.boss, f.planet, f.at, f.level, f.gear, 'classic', 1, 1);
  assert.equal(off.powers, 0); assert.equal(off.seconds, plain.seconds); assert.equal(off.damage, plain.damage);
  // The basic attack itself is untouched by this feature.
  assert.match(main, /if\(combat\.basic\(e\)\)\{const stats=M\.activeStats\(state\),weapon=M\.weaponStats\(state\);combatTimers\.attackCooldown=\(weapon\.cd\?\?\.4\)\/Math\.max\(\.2,1\+stats\.haste\);/);
});
