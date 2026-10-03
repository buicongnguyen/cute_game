// Gear ceilings (src/gear-ceiling.ts, src/upgrades.ts): every hat, outfit, pair of boots and companion reaches its slot's
// stats at +10, in even steps, never below the old +4%-per-level rule; costs scale with the gap; saves keep their levels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const M = await import('../src/model.ts');
const U = await import('../src/upgrades.ts');
const G = await import('../src/gear-ceiling.ts');
const P = await import('../src/item-power.ts');
const { benchHtml, benchGear } = await import('../src/upgrade-bench.ts');
const { localizeHtml, setLanguage } = await import('../src/i18n.ts');

const NOW = 1_800_000_000_000;
const slotItems = (slot: string) => Object.keys(M.ITEMS).filter(id => U.upgradableGear(id) && M.ITEMS[id].slot === slot);
const OLD_LEVELLED = new Set(['hp', 'atk', 'def', 'regen']);
/** The rule before the ceilings: +4% of the item's own hp/atk/def/regen per level; crit and speed never moved. */
const oldStat = (id: string, key: string, level: number) => G.baseLine(id)[key as keyof typeof G.SLOT_CEILING.hat] * (OLD_LEVELLED.has(key) ? 1 + .04 * level : 1);
/** A fresh explorer wearing only `id` at `level`: what the HUD, the fights and the server read. */
function wearing(id: string, level: number) {
  const s = M.newGame(); s.bag[id] = 1; M.equip(s, id); if (level) s.gearLevels = { [id]: level };
  const a = M.activeStats(s, NOW); return { maxHp: a.maxHp, attack: a.attack, defense: a.defense, regen: a.regen, critChance: a.critChance, speed: a.speed };
}

test('every item of a slot has identical stats at +10, in the real stat sums', () => {
  for (const slot of G.CEILING_SLOTS) {
    const ids = slotItems(slot); assert.ok(ids.length >= 5, slot);
    const first = wearing(ids[0], 10);
    for (const id of ids) {
      assert.deepEqual(U.levelledLine({ ...M.newGame(), gearLevels: { [id]: 10 } } as any, id), { ...G.SLOT_CEILING[slot] }, id);
      assert.deepEqual(wearing(id, 10), first, `${id} at +10 = ${ids[0]} at +10`);
    }
    // And they really differ before: the ceiling is a choice of look, not a no-op.
    assert.ok(new Set(ids.map(id => JSON.stringify(wearing(id, 0)))).size > 1, slot);
  }
  // Keepsakes (the Mochi bunny) and disguises are not levelled; weapons stay on the forge.
  assert.equal(U.upgradableGear('bunny'), false); assert.equal(U.upgradableGear('dz_ninja'), false); assert.equal(U.upgradableGear('sword_wood'), false);
  assert.equal(U.gearCeiling('sword_wood'), null); assert.equal(P.gearProgressHtml(M.newGame(), 'sword_wood'), '');
});

test('each level raises an item: no stat ever drops, its power always grows, in ten even steps', () => {
  for (const slot of G.CEILING_SLOTS) for (const id of slotItems(slot)) {
    const top = G.SLOT_CEILING[slot], base = G.baseLine(id);
    for (let l = 0; l < 10; l++) {
      const now = G.lineAtLevel(id, l), next = G.lineAtLevel(id, l + 1);
      for (const k of G.CONVERGED_STATS) {
        assert.ok(next[k] >= now[k], `${id} ${k} +${l}->+${l + 1}`);
        assert.ok(Math.abs(next[k] - now[k] - (top[k] - base[k]) / 10) < 1e-9, `${id} ${k}: an even step`);
      }
      assert.ok(G.statPoints(next) > G.statPoints(now), `${id} grows at +${l + 1}`);
      const a = wearing(id, l), b = wearing(id, l + 1);
      for (const k of Object.keys(a) as (keyof typeof a)[]) assert.ok(b[k] >= a[k] - 1e-9, `${id} ${k} in activeStats`);
    }
    assert.deepEqual(G.lineAtLevel(id, 0), base, `${id} +0 is the item itself`);
  }
});

test('no item is weaker than under the old +4% rule, at any level, stat by stat', () => {
  for (const slot of G.CEILING_SLOTS) for (const id of slotItems(slot)) for (let l = 0; l <= 10; l++) {
    const line = G.lineAtLevel(id, l);
    for (const k of G.CONVERGED_STATS) assert.ok(line[k] >= oldStat(id, k, l) - 1e-9, `${id} ${k} at +${l}: ${line[k]} < old ${oldStat(id, k, l)}`);
  }
  // The companion's shot is its own ability: unchanged, +4% a level.
  const s = M.newGame(); s.gearLevels = { pet_t_eye: 7 }; assert.equal(U.gearFactor(s, 'pet_t_eye'), 1 + .04 * 7);
  // Through the real sums: a Knight outfit at +6 has at least the old health and defence, and gains attack it never had.
  const old = { hp: 90 * 1.24, def: 28 * 1.24 }, knight = wearing('armor_knight', 6), bare = wearing('armor_knight', 0);
  assert.ok(knight.maxHp - (bare.maxHp - 90) >= old.hp && knight.defense - (bare.defense - 28) >= old.def && knight.attack > bare.attack);
});

test('the ceilings are the old best per stat in each slot, rounded up only a little', () => {
  const step: Record<string, number> = { hp: 1, def: 1, atk: 1, regen: .5, crit: 1e-9, speed: 1e-9 };
  for (const slot of G.CEILING_SLOTS) for (const k of G.CONVERGED_STATS) {
    const best = Math.max(0, ...slotItems(slot).map(id => oldStat(id, k, 10))), top = G.SLOT_CEILING[slot][k];
    assert.ok(top >= best - 1e-9, `${slot} ${k}: ${top} below the old best ${best}`);
    assert.ok(top - best < step[k], `${slot} ${k}: ${top} rounds ${best} up by more than ${step[k]}`);
  }
  assert.deepEqual(G.SLOT_CEILING.hat, { hp: 210, def: 42, atk: 31, regen: 7, crit: .15, speed: .22 });
  assert.equal(G.statLineLabel(G.SLOT_CEILING.boots), '❤️ 28 · 🛡️ 12 · 💨 +25%');
});

test('the cost: energy per level scales with the gap (at least half the base curve), bigger gaps cost more in total', () => {
  const curve = (l: number) => 60 + 40 * l + 10 * l * l, round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);
  const materials = (l: number) => ({ leather: 2 + l, bone: 1 + Math.floor(l / 2), ...(l >= 5 ? { starshard: l - 4 } : {}), ...(l >= 8 ? { moonstone: 1 } : {}) });
  for (const slot of G.CEILING_SLOTS) {
    const ids = slotItems(slot);
    for (const id of ids) {
      let total = 0;
      for (let l = 0; l < 10; l++) {
        const cost = U.gearCost(id, l); total += cost.energy;
        assert.equal(cost.energy, round5(curve(l) * Math.max(U.GAP_COST_MIN, U.GAP_COST_SCALE * G.gapShare(id))), `${id} +${l}`);
        assert.deepEqual(cost.materials, materials(l), 'materials are the same for every item');
        assert.equal(U.gearCostToMax(id, l).energy, Array.from({ length: 10 - l }, (_, i) => U.gearCost(id, l + i).energy).reduce((a, b) => a + b));
      }
      assert.equal(U.gearCostToMax(id, 0).energy, total); assert.deepEqual(U.gearCostToMax(id, 10), { energy: 0, materials: {} });
    }
    // Further behind → more to pay (shares within a slot: the same order as the totals).
    const byGap = [...ids].sort((a, b) => G.gapShare(a) - G.gapShare(b));
    for (let i = 1; i < byGap.length; i++) assert.ok(U.gearCostToMax(byGap[i], 0).energy >= U.gearCostToMax(byGap[i - 1], 0).energy, `${byGap[i - 1]} <= ${byGap[i]}`);
  }
  // The report's numbers: weakest vs strongest per slot.
  const total = (id: string) => U.gearCostToMax(id, 0).energy;
  assert.deepEqual([total('hat_party'), total('hat_t_turtle')], [7780, 4525]);
  assert.deepEqual([total('armor_leather'), total('armor_cloud')], [6920, 4260]);
  assert.deepEqual([total('boots_flipper'), total('boots_rocket')], [7095, 3560]);
  assert.deepEqual([total('pet_robot'), total('pet_t_turtle')], [7715, 4740]);
  assert.deepEqual(U.gearCostToMax('hat_party', 0).materials, { leather: 65, bone: 30, starshard: 15, moonstone: 2 });
  // The minimum: an item already at its ceiling would still pay half the base curve per level.
  const items = M.ITEMS as Record<string, any>;
  items.test_ceiling_hat = { name: 'Test hat', icon: '🎩', slot: 'hat', stats: { ...G.SLOT_CEILING.hat } };
  try { assert.equal(G.gapShare('test_ceiling_hat'), 0); assert.equal(U.gearCost('test_ceiling_hat', 0).energy, 30); assert.equal(U.gearCost('test_ceiling_hat', 9).energy, round5(curve(9) / 2)); }
  finally { delete items.test_ceiling_hat; }
});

test('save migration: old saves keep their level numbers and read them through the new formula', () => {
  // A save written before the ceilings: levels only (the stats were always derived).
  const old = M.newGame(); old.energy = 5; for (const id of ['hat_straw', 'armor_knight', 'boots_rocket', 'pet_robot']) { old.bag[id] = 1; M.equip(old, id); }
  const json = JSON.stringify({ ...old, gearLevels: { hat_straw: 4, armor_knight: 10, boots_rocket: 2, pet_robot: 7, hat_t_eye: 3 } });
  const s = M.parseSave(json)!;
  assert.deepEqual(s.gearLevels, { hat_straw: 4, armor_knight: 10, boots_rocket: 2, pet_robot: 7, hat_t_eye: 3 }, 'no level is lost or changed');
  assert.deepEqual(M.parseSave(JSON.stringify(s))!.gearLevels, s.gearLevels, 'and it round-trips');
  const a = M.activeStats(s, NOW), worn = ['hat_straw', 'armor_knight', 'boots_rocket', 'pet_robot'], level = (id: string) => s.gearLevels![id];
  const sum = (k: string, f: (id: string, k: string, l: number) => number) => worn.reduce((n, id) => n + f(id, k, level(id)), 0);
  const now = (id: string, k: string, l: number) => G.lineAtLevel(id, l)[k as keyof typeof G.SLOT_CEILING.hat];
  assert.ok(Math.abs(a.maxHp - (100 + sum('hp', now))) < 1e-9); assert.ok(Math.abs(a.defense - sum('def', now)) < 1e-9);
  assert.ok(Math.abs(a.attack - (10 + sum('atk', now))) < 1e-9); assert.ok(Math.abs(a.regen - sum('regen', now)) < 1e-9);
  // Every number is at least what the same save had under the old rule.
  assert.ok(a.maxHp >= 100 + sum('hp', oldStat) && a.defense >= sum('def', oldStat) && a.attack >= 10 + sum('atk', oldStat) && a.regen >= sum('regen', oldStat));
  assert.ok(a.speed >= 6 * Math.max(.2, 1 + sum('speed', oldStat)) && a.critChance >= .05 + sum('crit', oldStat));
});

const ui = { art: (_: string, icon: string) => icon, chips: () => '', skills: [] };
test('the bench shows Lv 7/10, the shared ceiling, a bar to +10 and the energy to max; owned lists sort by levelled power', () => {
  const s = M.newGame(); s.energy = 1e6; for (const id of ['hat_straw', 'hat_t_turtle', 'pet_firefly']) s.bag[id] = 1;
  const hats = () => benchGear(s).filter(id => id.startsWith('hat'));
  assert.deepEqual(hats(), ['hat_straw', 'hat_t_turtle'], 'unlevelled: the straw hat is the weaker');
  s.gearLevels = { hat_straw: 7, pet_firefly: 4 };
  // Sorting by the levelled stats: a straw hat at +7 (5 + 157 x .7 = 114.9 points) outranks an unlevelled Mountain Helm (69).
  assert.deepEqual(hats(), ['hat_t_turtle', 'hat_straw']);
  assert.ok(P.ownedScore(s, 'hat_straw') > P.ownedScore(s, 'hat_t_turtle') && P.itemScore('hat_straw') < P.itemScore('hat_t_turtle'));
  const html = benchHtml(s, 'gear', ui);
  assert.ok(html.includes('Lv 7/10 · at max: ❤️ 210 · 🛡️ 42 · ⚔️ 31 · 💚 7/s · ✨ 15% · 💨 +22% <span class="muted">(same for every hat)</span>'), html);
  assert.ok(html.includes('Lv 0/10 · at max: ❤️ 210'), 'the turtle helm shows the same ceiling');
  assert.match(html, /role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="7" aria-label="Level 7 \/ 10"><i style="width:70%">/);
  assert.ok(html.includes(`ϟ ${U.gearCostToMax('hat_straw', 7).energy.toLocaleString()} in all to reach +10`));
  assert.ok(html.includes('(same for every companion)') && html.includes('Its shot stays its own: +16% damage'));
  // The row's chip shows the stats as levelled now: straw hat +7 = 3 + 39 x .7 def, 10 + 200 x .7 hp, 31 x .7 atk.
  assert.ok(html.includes('<span class="chip chip-power">🛡️ 30.3 · ❤️ 150 · ⚔️ 21.7</span>'), html);
  s.gearLevels.hat_straw = 10; const maxed = benchHtml(s, 'gear', ui);
  assert.equal(maxed.split('in all to reach +10').length - 1, 2, 'a maxed hat has nothing left to pay (the helm and the firefly do)');
  assert.ok(maxed.includes('aria-valuenow="10"') && maxed.includes('width:100%'));
  // The backpack's item detail uses the same block (main.ts: M.gearProgressHtml) and reads in Vietnamese.
  setLanguage('vi');
  try {
    const vi = localizeHtml(P.gearProgressHtml(s, 'pet_firefly') + P.gearProgressHtml(s, 'boots_rocket'));
    assert.match(vi, /Cấp 4\/10 · khi tối đa: ❤️ 210/); assert.match(vi, /mọi thú đồng hành đều như nhau/); assert.match(vi, /mọi đôi giày đều như nhau/);
    assert.doesNotMatch(vi.replace(/<[^>]*>/g, ' '), /\b(at max|same|every|shot|damage|level)\b/i);
  } finally { setLanguage('en'); }
});
