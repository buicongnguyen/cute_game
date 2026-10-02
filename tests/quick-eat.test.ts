import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { healingFoods, pickFood, quickEatView } from '../src/quick-eat.ts';
import { previewGear, canTryOn } from '../src/try-on.ts';
import { applyGameAction } from '../src/actions.ts';

const heal = (id: string) => M.ITEMS[id].heal!;
// Three crops with different heals, from the content tables (so the test follows balance changes).
const crops = Object.keys(M.CROPS).filter(id => M.ITEMS[id]?.heal && !M.ITEMS[id].buff).sort((a, b) => heal(a) - heal(b));
const [small, mid, big] = [crops[0], crops[Math.floor(crops.length / 2)], crops.at(-1)!];
function hungry(missing: number) { const s = M.newGame(); for (const id of [small, mid, big]) M.addItem(s, id, 2); s.hp = M.maxHp(s) - missing; return s; }

test('quick eat picks the smallest heal that covers the missing health, else the biggest', () => {
  assert.ok(heal(small) < heal(mid) && heal(mid) < heal(big), 'fixture needs three distinct heals');
  assert.equal(pickFood(hungry(1)), small);
  assert.equal(pickFood(hungry(heal(small) + 1)), heal(mid) >= heal(small) + 1 ? mid : big);
  const s = hungry(1); s.level = 400; s.hp = 1; // far more missing than any single food heals
  assert.equal(pickFood(s), big);
  assert.deepEqual(healingFoods(hungry(1)), [small, mid, big]);
  // A picked food wins while the player still carries it; otherwise Auto takes over.
  assert.equal(pickFood(hungry(1), big), big);
  assert.equal(pickFood(hungry(1), 'cooked_nothing' as M.ItemId), small);
  // Gear and non-healing items are never offered.
  const geared = hungry(1); M.addItem(geared, 'harpoon'); assert.ok(!healingFoods(geared).includes('harpoon'));
});

test('quick eat view greys out with nothing to eat or full health, and eating goes through the bag action', () => {
  const empty = M.newGame(); empty.hp = 10;
  assert.deepEqual(quickEatView(empty), { id: null, count: 0, idle: true, reason: 'none' });
  const full = hungry(0); assert.equal(quickEatView(full).reason, 'full'); assert.equal(quickEatView(full).idle, true);
  const s = hungry(heal(mid)), view = quickEatView(s);
  assert.equal(view.reason, null); assert.equal(view.id, mid); assert.equal(view.count, 2);
  const before = s.hp;
  applyGameAction(s, { type: 'eat', payload: { id: view.id } }, { now: Date.now(), random: Math.random });
  assert.equal(s.hp, Math.min(M.maxHp(s), before + heal(mid))); assert.equal(s.bag[mid], 1);
});

test('try-on previews one slot without touching the saved gear', () => {
  const hat = Object.keys(M.ITEMS).find(id => M.ITEMS[id].slot === 'hat')!, disguise = Object.keys(M.ITEMS).find(id => M.ITEMS[id].slot === 'disguise')!;
  const s = M.newGame(); s.gear.disguise = disguise; const saved = JSON.stringify(s);
  const preview = previewGear(s.gear, hat);
  assert.equal(preview.hat, hat); assert.equal(preview.disguise, undefined, 'a hat preview lifts the disguise so the hat shows');
  assert.equal(JSON.stringify(s), saved, 'the save is unchanged');
  assert.equal(previewGear(s.gear, disguise).disguise, disguise);
  assert.deepEqual(previewGear(s.gear, null), s.gear);
  assert.ok(canTryOn(hat)); assert.ok(!canTryOn('carrot'));
  const rod = Object.keys(M.ITEMS).find(id => M.ITEMS[id].weapon?.kind === 'rod'); if (rod) assert.ok(!canTryOn(rod));
});
