import { test } from 'node:test';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import assert from 'node:assert/strict';
import { BAR, MAX_BARS, placeBars, engaged, targetOf, bossFor, bossApproach, fightNear, lootText, zoneInfo, DANGER_LEVELS, CombatHud } from '../src/hud-combat.ts';
import { connect } from '../src/game-events.ts';
import { createEvents } from '../src/game-services.ts';
import type { Enemy } from '../src/world.ts';

const enemy = (over: Partial<Enemy> = {}) => ({ id: 'e' + Math.random(), kind: 'enemy', name: 'Grumpy Mushroom', hp: 10, maxHp: 10, x: 0, z: 0, boss: false, phase: 'idle', level: 1, ...over }) as Enemy;

test('over-head bars are never dropped: clamped into the screen and nudged a row when they would cover another', () => {
  const view = { width: 390, height: 844 };
  const spots = placeBars([{ id: 'a', x: 200, y: 400 }, { id: 'b', x: 210, y: 402 }, { id: 'c', x: 205, y: 399 }, { id: 'edge', x: -30, y: 300 }, { id: 'right', x: 420, y: 10 }], view);
  assert.equal(spots.length, 5, 'every engaged creature keeps its bar');
  for (const s of spots) {
    assert.ok(s.x - BAR.w / 2 >= 4 && s.x + BAR.w / 2 <= view.width - 4, `${s.id} is clamped inside the screen sides`);
    assert.ok(s.y - BAR.h >= 0 && s.y <= view.height, `${s.id} is clamped inside the screen height`);
  }
  const [a, b, c] = spots;
  assert.equal(a.y, 400, 'the first (nearest or selected) bar keeps its natural spot');
  for (const [p, q] of [[a, b], [a, c], [b, c]]) assert.ok(Math.abs(p.y - q.y) >= BAR.h || Math.abs(p.x - q.x) >= BAR.w, 'stacked bars move a row apart');
  assert.ok(b.y < a.y, 'the next bar moves up first');
});

test('bars show for the target, the hurt and elites; a full-health pack in aggro shows none; never bosses (FIX-PLAN 3.6)', () => {
  const calm = enemy(), hurt = enemy({ hp: 5 }), chasing = enemy({ phase: 'chase' }), home = enemy({ phase: 'return' }), boss = enemy({ boss: true, hp: 3, phase: 'chase' });
  assert.equal(engaged(calm, null), false);
  assert.equal(engaged(calm, calm), true, 'the selected creature shows its bar even at full health');
  assert.equal(engaged(hurt, null), true);
  assert.equal(engaged(chasing, null), false, 'aggro at full health no longer shows: a pack would bury the screen in bars');
  assert.equal(engaged(enemy({ phase: 'chase', elite: 'tank' } as never), null), true, 'elites always show');
  assert.equal(MAX_BARS <= 8, true);
  assert.equal(engaged(home, null), false, 'walking home is calm');
  assert.equal(engaged(boss, boss), false, 'bosses use the boss bar');
  assert.equal(engaged(enemy({ hp: 0, maxHp: 10 }), null), false);
});

test('the target frame follows the selection, else the last hit for 3 s, and skips bosses', () => {
  const a = enemy(), b = enemy({ hp: 4 }), boss = enemy({ boss: true });
  assert.equal(targetOf(a, null, 0), a);
  assert.equal(targetOf(null, { e: b, at: 1000 }, 3900), b);
  assert.equal(targetOf(null, { e: b, at: 1000 }, 4100), null, 'the last hit fades after 3 s');
  assert.equal(targetOf(boss, null, 0), null);
  assert.equal(targetOf(null, { e: enemy({ hp: 0 }), at: 0 }, 10), null, 'a defeated creature leaves the frame');
  assert.equal(targetOf({ kind: 'plot' } as never, { e: b, at: 0 }, 10), b, 'selecting a garden bed does not hide the last hit');
});

test('the boss bar shows for an aggro or hurt boss within 35 m', () => {
  const near = enemy({ boss: true, phase: 'chase', x: 20 }), far = enemy({ boss: true, phase: 'chase', x: 40 }), calm = enemy({ boss: true, x: 5 }), hurt = enemy({ boss: true, x: 30, hp: 9 });
  assert.equal(bossFor([far, calm], 0, 0), null);
  assert.equal(bossFor([far, near, calm], 0, 0), near);
  assert.equal(bossFor([hurt], 0, 0), hurt);
});

test('trackers fold while an aggro creature is within 12 m', () => {
  assert.equal(fightNear([enemy({ phase: 'chase', x: 11 })], 0, 0), true);
  assert.equal(fightNear([enemy({ phase: 'chase', x: 13 })], 0, 0), false);
  assert.equal(fightNear([enemy({ hp: 3, x: 2 })], 0, 0), false, 'a hurt but calm creature is no fight');
});

test('loot merges into one line', () => {
  assert.equal(lootText([]), '');
  assert.equal(lootText([{ icon: '🍄', name: 'Mushroom cap', count: 2 }]), '🍄 Mushroom cap ×2');
  assert.equal(lootText([{ icon: '🍄', name: 'Cap', count: 2 }, { icon: '🪵', name: 'Wood', count: 1 }, { icon: '💎', name: 'Gem', count: 1 }, { icon: '🌰', name: 'Nut', count: 1 }]), '🍄🪵💎 +5 items');
});

test('zone banner text names the wild zone, its level and boss instead of the home planet blurb', () => {
  assert.deepEqual(zoneInfo('Clover Village', 'home'), { detail: 'A peaceful place · health restores here', chip: 'Safe' });
  const canyon = zoneInfo('Redrock Canyon', 'home');
  assert.match(canyon.detail, /Prickly Cactus/);
  assert.match(canyon.chip, /Lv 7\+/); assert.match(canyon.chip, /King Bear/);
  const ice = zoneInfo('Frost Peaks', 'ice');
  assert.ok(ice.detail.length > 0); assert.match(ice.chip, /Lv 10\+/);
});

test('the danger chip: a zone 3 or more levels above the explorer says so in words, with a warning sign', () => {
  assert.equal(DANGER_LEVELS, 3);
  const boss = ENEMY_TYPES.bear.name; // the boss's name comes from the table
  assert.deepEqual(zoneInfo('Redrock Canyon', 'home', 2).chip, `⚠️ Lv 7+ Dangerous · 👑 ${boss}`); assert.equal(zoneInfo('Redrock Canyon', 'home', 2).danger, true);
  assert.equal(zoneInfo('Redrock Canyon', 'home', 4).danger, true, 'level 4: still 3 below');
  const near = zoneInfo('Redrock Canyon', 'home', 5); assert.equal(near.danger, undefined); assert.equal(near.chip, `★★★ · Lv 7+ · 👑 ${boss}`, 'level 5: the plain chip');
  assert.deepEqual(zoneInfo('Redrock Canyon', 'home', 5), zoneInfo('Redrock Canyon', 'home'), 'and without a level the chip is as it always was');
  assert.equal(zoneInfo('Chomper Swamp', 'home', 1).danger, true, 'Lv 4+ for a level 1'); assert.equal(zoneInfo('Chomper Swamp', 'home', 2).danger, undefined);
  assert.equal(zoneInfo('Mushroom Forest', 'home', 1).danger, undefined); assert.equal(zoneInfo('Clover Village', 'home', 1).danger, undefined, 'the village is safe');
  assert.equal(zoneInfo('Frost Peaks', 'ice', 7).danger, true, 'planets too: Lv 10+'); assert.equal(zoneInfo('Frost Peaks', 'ice', 8).danger, undefined);
});

test('bossApproach: a calm boss inside its sight radius plus 6 m, the nearest one; never one that is already in the fight', () => {
  // King Bear sees 13 m (enemy-types.ts boss()), so the approach starts under 19 m.
  const bear = (over: Partial<Enemy> = {}) => enemy({ boss: true, type: 'bear', name: 'King Bear', ...over });
  assert.equal(bossApproach([bear({ x: 19.1 })], 0, 0), null, 'just outside sight + 6 m');
  const edge = bear({ x: 18.9 });
  assert.equal(bossApproach([edge], 0, 0), edge);
  assert.equal(bossApproach([bear({ x: 12, z: 16 })], 0, 0), null, 'distance is measured on the ground, not per axis (20 m)');
  assert.equal(bossApproach([bear({ x: 5, phase: 'chase' }), bear({ x: 5, phase: 'windup' }), bear({ x: 5, phase: 'attack' })], 0, 0), null, 'aggro: the fight has begun, that is bossEngaged');
  const home = bear({ x: 5, phase: 'return' });
  assert.equal(bossApproach([home], 0, 0), home, 'walking home is calm again');
  assert.equal(bossApproach([bear({ x: 5, hp: 0 }), enemy({ x: 2 })], 0, 0), null, 'not a fallen boss, not an ordinary creature');
  const far = bear({ x: 15 }), near = bear({ x: -9 });
  assert.equal(bossApproach([far, near], 0, 0), near, 'the nearest of two');
  assert.equal(bossApproach([bear({ x: 22 })], 0, 0, 10)?.x, 22, 'the margin is a parameter (the HUD leaves at +10 m)');
  // The radius is the creature's own: a definition on the creature wins, then its type's, then a boss's usual 13 m.
  const sharp = bear({ x: 24, definition: { sight: 20 } as Enemy['definition'] });
  assert.equal(bossApproach([sharp], 0, 0), sharp);
  assert.equal(bossApproach([enemy({ boss: true, type: 'no-such-type', x: 18.9 })], 0, 0)?.x, 18.9);
  assert.equal(bossApproach([bear({ x: 18.9 })], 0, 0.5)?.x, 18.9); assert.equal(bossApproach([], 0, 0), null);
});

test('the boss events: approach once (again only after walking away), engaged when the bar comes up, break as the meter breaks', () => {
  const bus = createEvents(), told: string[] = [];
  connect(bus);
  for (const event of ['bossApproach', 'bossEngaged', 'bossBreak'] as const) bus.on(event, ({ enemy: e }) => { told.push(`${event}:${e.id}`); });
  const hud = new CombatHud(null as never, null as never) as unknown as { tell(enemies: Enemy[], boss: Enemy | null, x: number, z: number, now: number): void };
  const bear = enemy({ id: 'bear', boss: true, type: 'bear', x: 30 });
  // The HUD calls tell() a few times a second with the boss its bar shows (bossFor), or null.
  const tick = (x: number, now = 0) => hud.tell([bear], bossFor([bear], x, 0), x, 0, now);
  tick(0); assert.deepEqual(told, [], '30 m away: nothing');
  tick(12); tick(13); tick(14);
  assert.deepEqual(told, ['bossApproach:bear'], 'inside 19 m: once, not on every tick');
  tick(8); tick(12); // out to 22 m and back in: still the same approach (it leaves at 23 m)
  assert.equal(told.length, 1);
  tick(6); tick(12);  // out to 24 m, then in again
  assert.deepEqual(told.splice(0), ['bossApproach:bear', 'bossApproach:bear']);
  bear.phase = 'chase';
  tick(14); tick(15);
  assert.deepEqual(told.splice(0), ['bossEngaged:bear'], 'the bar came up: engaged, once');
  bear.hp = 6; bear.stagger = { fill: 0, need: 100, breaks: 1, start: 0, last: 0, until: 9 };
  tick(15, 5); tick(15, 6);
  assert.deepEqual(told.splice(0), ['bossBreak:bear'], 'on its knees until t = 9: said once');
  tick(15, 10); bear.stagger.until = 20; tick(15, 12);
  assert.deepEqual(told.splice(0), ['bossBreak:bear'], 'it stood up and broke again');
  bear.phase = 'idle'; bear.hp = bear.maxHp; bear.stagger = undefined;
  tick(15, 30); tick(16, 31);
  assert.deepEqual(told, [], 'the boss calmed down with the hero still beside it: that is no new approach');
  bear.phase = 'chase'; tick(16, 32);
  assert.deepEqual(told.splice(0), ['bossEngaged:bear'], 'a second fight is engaged again');
  // A fight that starts from afar (a shot) has no approach before it.
  const far = enemy({ id: 'treant', boss: true, type: 'treant', x: 60, phase: 'chase' });
  hud.tell([bear, far], bossFor([far], 30, 0), 30, 0, 40);
  assert.deepEqual(told.splice(0), ['bossEngaged:treant']);
  connect(undefined as never);
});

test('two calm bosses side by side: each approach is said once, however the nearest of the two alternates', () => {
  const bus = createEvents(), told: string[] = [];
  connect(bus);
  bus.on('bossApproach', ({ enemy: e }) => { told.push(e.id); }); bus.on('bossEngaged', ({ enemy: e }) => { told.push('engaged:' + e.id); });
  const hud = new CombatHud(null as never, null as never) as unknown as { tell(enemies: Enemy[], boss: Enemy | null, x: number, z: number, now: number): void };
  const left = enemy({ id: 'left', boss: true, type: 'bear', x: -10 }), right = enemy({ id: 'right', boss: true, type: 'treant', x: 10 });
  const tick = (x: number) => hud.tell([left, right], bossFor([left, right], x, 0), x, 0, 0);
  tick(-1); tick(1); tick(-1); tick(1); tick(-2); tick(2);
  assert.deepEqual(told.splice(0), ['left', 'right'], 'the hero sways between them: two approaches, not six');
  // Walking out of one's range (past sight + 10 m) while staying in the other's: only the one left behind can be said again.
  tick(14); tick(1); tick(-1);
  assert.deepEqual(told.splice(0), ['left']);
  // A fight with one does not make the other new, and the fought one is not an approach when it calms down.
  right.phase = 'chase'; tick(1); tick(-1);
  right.phase = 'idle'; tick(1); tick(-1); tick(1);
  assert.deepEqual(told.splice(0), ['engaged:right']);
  // A boss that fell and came back is approached anew.
  left.hp = 0; tick(-1); left.hp = left.maxHp; tick(-1);
  assert.deepEqual(told.splice(0), ['left']);
  connect(undefined as never);
});
