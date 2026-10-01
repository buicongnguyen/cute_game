import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAR, placeBars, engaged, targetOf, bossFor, fightNear, lootText, zoneInfo } from '../src/hud-combat.ts';
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

test('bars show while hurt, aggro or selected, never for bosses', () => {
  const calm = enemy(), hurt = enemy({ hp: 5 }), chasing = enemy({ phase: 'chase' }), home = enemy({ phase: 'return' }), boss = enemy({ boss: true, hp: 3, phase: 'chase' });
  assert.equal(engaged(calm, null), false);
  assert.equal(engaged(calm, calm), true, 'the selected creature shows its bar even at full health');
  assert.equal(engaged(hurt, null), true);
  assert.equal(engaged(chasing, null), true, 'aggro at full health still shows');
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
