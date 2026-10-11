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
  assert.match(main, /else if\(key==='f'\)\{if\(!airOn\(\)\)world\.interactNearest\(\);/, 'F is interact only, as before');
  // H is Eat, as before, and G does nothing.
  assert.equal(eatKey(false), 'h'); assert.equal(handKey('h', false), 'eat'); assert.equal(handKey('g', false), '');
});

test('on: N is the basic attack for the right hand, a key no layout uses, and H still eats; off: H eats', () => {
  assert.equal(eatKey(true), 'h'); assert.equal(handKey('n', true), 'attack'); assert.equal(handKey('h', true), 'eat'); assert.equal(handKey('n', false), ''); assert.equal(handKey('f', true), ''); assert.equal(handKey('j', true), '');
  // G (and H) are free in both layouts: not a skill, the journal, a WASD move, or one of the fixed keys of main.ts (F, I, M, R).
  for (const layout of ['classic', 'wasd']) { const b = keyboardBindings(layout), taken = [...b.skills, b.journal, 'w', 'a', 's', 'd', 'f', 'i', 'm', 'r'] as string[]; assert.ok(!taken.includes('n') && !taken.includes('h'), layout); }
  assert.deepEqual([...new Set([...main.matchAll(/key==='([a-z])'/g)].map(m => m[1]))].sort(), ['f', 'i', 'm', 'r'], 'the fixed letter keys of the key handler');
  assert.match(main, /else if\(handKey\(key,airOn\(\)\)==='eat'\)void quickEat\(\);else if\(handKey\(key,airOn\(\)\)==='attack'\)basicAttack\(\);/);
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
  assert.doesNotMatch(hud, /jump-pad|combo-chip|data-action="jump"/); assert.match(hud, /<kbd>Space<\/kbd> attack<\/div>/);
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

test('off: the bench has no Jump row and the old paw sheet is untouched; on: Jump is the big pad in the middle, five toes on the arc with the attack on the inner side, mirrored left-handed', () => {
  assert.match(read('upgrade-bench.ts'), /\$\{ui\.jump \? jumpRow\(s, ui\) : ''\}/); assert.match(main, /jump:airOn\(\),disguised:/, 'the bench offers Jump only with the switch on');
  // The sheet from before is still there word for word (tests/hud-ours.test.ts pins the rest).
  for (const old of ['width: calc(var(--sk) * 3.66); height: calc(var(--sk) * 2.38); max-width: none;', '#app #hud .skill[data-index="0"] { left: 0; bottom: calc(var(--sk) * .533); }', '--dock-room: calc(var(--sk) * 2.38 + 44px);', '#app #hud .attack-pad { display: none; }', 'display: grid; place-items: center; position: absolute; left: calc(50% - var(--sk) * .6); bottom: 0; width: calc(var(--sk) * 1.2); height: calc(var(--sk) * 1.2); padding: 0;', '#app #hud .attack-pad > svg { width: 60%; height: 60%; }']) assert.ok(css.includes(old), old);
  // Every rule that moves or resizes the attack pad for the new roles is under the switch (its air look hangs on .skills.air, a class only the switched-on game sets).
  const base = css.slice(0, css.indexOf('Jumping and air combat (Settings switch; body.air-combat)')); assert.ok(base.length > 1000 && !base.includes('air-combat'));
  for (const line of css.slice(base.length).split('\n').filter(line => line.includes('.attack-pad') && !line.trim().startsWith('/*') && !line.includes('.skills.air'))) assert.ok(line.includes('body.air-combat'), 'only under the switch: ' + line.trim().slice(0, 80));
  assert.ok(css.includes('#app #hud .jump-pad { display: none; }'), 'no Jump toe without the switch (and none on desktop)');
  const scoped = css.split('\n').filter(line => /jump-pad|3\.784|2\.55/.test(line) && !line.trim().startsWith('/*') && !line.includes('#app #hud .jump-pad { display: none; }') && !/^\s*(border-radius|display: grid)/.test(line.trim()));
  for (const line of scoped) assert.ok(line.includes('body.air-combat'), 'only under the switch: ' + line.trim().slice(0, 80));
  // Offsets in skill widths: x from the cluster's centre line to the toe's centre, y from the cluster's bottom to it.
  const at = (selector: string, hand = '') => { const m = css.match(new RegExp(`body\\.air-combat #app #hud${hand} ${selector.replace(/[.[\]"=]/g, '\\$&')} \\{ left: calc\\(50% ([+-]) var\\(--sk\\) \\* ([\\d.]+)\\);(?: right: auto;)? bottom: calc\\(var\\(--sk\\) \\* ([\\d.]+)\\); \\}`)); assert.ok(m, selector + hand); return [(m![1] === '-' ? -1 : 1) * +m![2] + .5, +m![3] + .5]; };
  const size = css.match(/body\.air-combat #app #hud \.skills, body\.air-combat #app #hud\.joystick-on \.skills \{ width: calc\(var\(--sk\) \* ([\d.]+)\); height: calc\(var\(--sk\) \* ([\d.]+)\); \}/)!; assert.ok(size); const width = +size[1], height = +size[2];
  // The big pad is Jump: 1.2 skill widths, centred, sky blue. The attack is a full toe.
  const big = css.match(/body\.air-combat #app #hud \.jump-pad \{\s*display: grid; place-items: center; position: absolute; width: calc\(var\(--sk\) \* ([\d.]+)\); height: calc\(var\(--sk\) \* ([\d.]+)\);[^}]*border-radius: 40%;[^}]*background: linear-gradient\(160deg, #8fe0ff, #2f9be6\);/)!; assert.ok(big, 'the Jump pad');
  const padSize = +big[1]; assert.equal(padSize, 1.2, 'as big as the attack pad was'); assert.equal(+big[2], padSize);
  const padAt = at('.jump-pad'), pad = [padAt[0] - .5 + padSize / 2, padAt[1] - .5 + padSize / 2]; assert.ok(Math.abs(pad[0]) < .001, 'Jump is centred in the paw');
  assert.doesNotMatch(css, /body\.air-combat #app #hud\.joystick-right \.jump-pad/, 'the centre pad is the same for both hands');
  assert.match(css, /body\.air-combat #app #hud \.attack-pad \{ width: var\(--sk\); height: var\(--sk\); min-width: 0; border-radius: 46%; \}/, 'the attack toe is a full skill toe');
  const skills = (hand = '') => [0, 1, 2, 3].map(i => at(`.skill[data-index="${i}"]`, hand));
  for (const [hand, toes] of [['', [at('.attack-pad'), ...skills()]], ['.joystick-right', [...skills('.joystick-right'), at('.attack-pad', '.joystick-right')]]] as const) {
    for (let i = 0; i < 5; i++) {
      assert.ok(toes[i][1] + .5 <= height + .001 && toes[i][1] - .5 >= -.001 && Math.abs(toes[i][0]) + .5 <= width / 2 + .001, `toe ${i} stays inside the cluster ${hand}`);
      assert.ok(Math.hypot(toes[i][0] - pad[0], toes[i][1] - pad[1]) >= .5 + padSize / 2 + .05, `toe ${i} is clear of the pad ${hand}`);
      if (i) { assert.ok(toes[i][0] > toes[i - 1][0], 'left to right, the skills in key order'); assert.ok(Math.hypot(toes[i][0] - toes[i - 1][0], toes[i][1] - toes[i - 1][1]) >= 1.05, `toes ${i - 1} and ${i} are more than a toe width apart ${hand}`); }
    }
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(toes[i][0] + toes[4 - i][0]) < .02 && Math.abs(toes[i][1] - toes[4 - i][1]) < .02, 'the paw is symmetric');
  }
  assert.ok(pad[1] + padSize / 2 <= height + .001 && pad[1] - padSize / 2 >= -.001, 'the pad stays inside the cluster');
  assert.ok(at('.attack-pad')[0] < -1 && at('.attack-pad', '.joystick-right')[0] > 1 && at('.attack-pad')[1] < 1, 'the attack is the inner toe (left of the pad; right of it left-handed), level with the pad');
  // The four skill toes are where they were before the roles swapped.
  assert.deepEqual([skills(), skills('.joystick-right')].map(s => s.map(([x, y]) => [+(x - .5).toFixed(3), +(y - .5).toFixed(3)])), [[[-1.54, 1.087], [-.5, 1.55], [.54, 1.087], [.892, .004]], [[-1.892, .004], [-1.54, 1.087], [-.5, 1.55], [.54, 1.087]]]);
  // The air look follows the attack (toe) and the skills; the dive look is the attack's. Jump keeps its sky blue.
  assert.match(css, /#app #hud \.skills\.air \.skill, #app #hud \.skills\.air \.attack-pad \{ border-color: #bfeeff;/); assert.match(css, /#app #hud \.skills\.air\.dive \.attack-pad \{ background:/); assert.doesNotMatch(css, /\.skills\.air[^{]*\.jump-pad/);
  // The gestures read the buttons by their action, not their place: the slide starts on Jump and lands on 'attack' or a skill.
  assert.match(main, /function fightButtonAt\(x:number,y:number\)\{const b=\(document\.elementFromPoint\(x,y\) as HTMLElement\|null\)\?\.closest<HTMLElement>\('#hud \.skills button'\);return !b\?null:b\.dataset\.action==='attack'\?'attack':b\.dataset\.action==='skill'\?'skill'\+b\.dataset\.index:null;\}/);
  assert.match(main, /if\(target\?\.dataset\.action==='jump'&&started&&!uiBlocked\(\)&&airOn\(\)\)\{e\.preventDefault\(\);jumpPointers\.add\(e\.pointerId\);touchFight=e\.pointerType==='touch';jumpInput\.down\(\);/, 'the pad jumps as the finger lands; holding it keeps jumpInput held for the extra jumps');
  assert.match(css, /body\.air-combat \{ --dock-room: calc\(var\(--sk\) \* 2\.55 \+ 44px\); \}/, 'the dock leaves room for the taller paw');
  assert.doesNotMatch(css, /animation\s*:|transition\s*:|backdrop-filter|@keyframes/);
});

test('scripted fights: with the block at 0.6 a hero without the double jump still wins in under 100 s at the level the boss is met, and the double jump is faster', () => {
  for (const f of FIGHTS.slice(1)) {
    const single = fight(f.boss, f.planet, f.at, f.level, f.gear, 'single', 2), double = fight(f.boss, f.planet, f.at, f.level, f.gear, 'double', 2);
    assert.ok(single.won && single.seconds < 100, `${f.boss} on the ground: ${single.seconds.toFixed(0)} s`); assert.ok(single.blocked > 0, 'ground hits were blocked');
    assert.ok(double.won && double.seconds < single.seconds, `${f.boss} with the double jump: ${double.seconds.toFixed(0)} s`);
    assert.ok(Math.max(single.biggest, double.biggest) / single.bossHp < .15, 'no single hit takes 15% of a boss');
  }
  const bear = FIGHTS[0], r = fight(bear.boss, bear.planet, bear.at, bear.level, bear.gear, 'single', 2); assert.equal(r.blocked, 0, 'the King Bear is met before the double jump: it does not block'); assert.ok(r.dodged > 0);
});
