import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const M = await import('../src/model.ts');
const U = await import('../src/upgrades.ts');
const S = await import('../src/skill-upgrades.ts');
const P = await import('../src/item-power.ts');
const { CombatSimulation, BASE_SKILLS, SPECIALS } = await import('../src/combat.ts');
const { applyGameAction } = await import('../src/actions.ts');
const { benchHtml, benchGear, skillEffect } = await import('../src/upgrade-bench.ts');
const IG = await import('../src/item-groups.ts');
const { t, localizeHtml, setLanguage } = await import('../src/i18n.ts');
const Tester = await import('../src/tester.ts');
const { ACTIVITIES } = await import('../src/house-activities.ts');
const { INDOOR_STORES, indoorStore } = await import('../src/house-stores.ts');

// ---- 1. sort orders ---------------------------------------------------------------------------
const tabs: Record<string, (item: any) => boolean> = {
  Weapons: i => i.slot === 'weapon', Clothing: i => ['hat', 'outfit', 'boots'].includes(i.slot ?? ''), Pets: i => i.slot === 'pet',
  Disguises: i => i.slot === 'disguise', Supplies: i => !i.slot && i.type !== 'decor', Decor: i => i.type === 'decor',
};
const shopTab = (s: any, tab: string) => M.sortByPower(Object.entries(M.ITEMS).filter(([id, item]) => M.shopPrice(s, id) !== null && tabs[tab](item)), ([id]) => id, ([id]) => M.shopPrice(s, id) ?? 0).map(([id]) => id);
const nonDecreasing = (ids: string[], key: (id: string) => number) => ids.every((id, i) => i === 0 || key(ids[i - 1]) <= key(id) + 1e-9);

test('every outfitters tab runs from the weakest to the strongest, ties by price', () => {
  const s = M.newGame();
  for (const tab of Object.keys(tabs)) {
    const ids = shopTab(s, tab); assert.ok(ids.length > 0 || tab === 'Pets' || tab === 'Decor', tab); // companions and decorations come from the workshop
    // Within each effect kind the score never drops; equal scores never get more expensive first.
    for (const kind of ['weapon', 'rod', 'wear', 'pet', 'food', 'other'] as const) {
      const group = ids.filter(id => P.powerKind(M.ITEMS[id]) === kind);
      assert.ok(nonDecreasing(group, P.itemScore), `${tab}/${kind}: ${group.join(',')}`);
      for (let i = 1; i < group.length; i++) if (P.itemScore(group[i - 1]) === P.itemScore(group[i])) assert.ok(M.shopPrice(s, group[i - 1])! <= M.shopPrice(s, group[i])!, `${tab} tie ${group[i - 1]} ${group[i]}`);
    }
  }
  // Concrete orders the player can check against the chips.
  const weapons = shopTab(s, 'Weapons').filter(id => P.powerKind(M.ITEMS[id]) === 'weapon');
  assert.equal(weapons[0], 'gun_pea'); assert.ok(weapons.indexOf('sword_wood') < weapons.indexOf('sword_lava'));
  // w25: 100 attack / 1.3 s = 77/s, between the lava sword (76/s) and the moon scythe (80/s).
  assert.ok(weapons.indexOf('sword_lava') < weapons.indexOf('harpoon') && weapons.indexOf('harpoon') < weapons.indexOf('scythe_moon'), 'the harpoon: 100 attack / 1.3 s');
  assert.deepEqual(shopTab(s, 'Weapons').slice(0, 3), ['rod', 'rod_gold', 'rod_steady'], 'rods are tools: listed first, by fishing power');
  const clothes = shopTab(s, 'Clothing'); assert.ok(clothes.indexOf('hat_party') < clothes.indexOf('armor_knight'));
});

test('the comparator: scores per category, price breaks ties, id keeps it stable', () => {
  assert.equal(Math.round(P.itemScore('sword_wood') * 10) / 10, 10.9); // 6 / 0.55
  assert.equal(Math.round(P.itemScore('gun_spike')), 45);            // 15 x 5 pellets x .45 / .75
  assert.equal(P.itemScore('rod_gold'), 70);
  assert.equal(P.itemScore('hat_straw'), 3 + 10 / 5);
  assert.ok(P.itemScore('pet_t_eye') > P.itemScore('bunny'));
  assert.ok(P.itemScore('cooked_carrot') > P.itemScore('carrot'), 'cooking makes food stronger');
  assert.equal(P.itemScore('plot_kit'), 0);
  assert.ok(P.compareByPower('sword_wood', 'sword_lava') < 0 && P.compareByPower('sword_lava', 'sword_wood') > 0);
  assert.ok(P.compareByPower('plot_kit', 'seed_star', id => ({ plot_kit: 5, seed_star: 9 } as Record<string, number>)[id]) < 0, 'equal power → cheaper first');
  assert.ok(P.compareByPower('a_x', 'b_x', () => 0) < 0, 'then by id');
  assert.equal(P.powerLabel('sword_wood'), '⚔️ 10.9/s'); assert.equal(P.powerLabel('hat_straw'), '🛡️ 3 · ❤️ 10'); assert.equal(P.powerLabel('plot_kit'), '');
});

test('workshop, forge and tester lists are sorted the same way', () => {
  for (const station of ['craft', 'forge']) for (const category of ['All', ...new Set(M.RECIPES.filter(r => r.station === station).map(r => r.category))]) {
    const list = M.sortByPower(M.RECIPES.filter(r => r.station === station && (category === 'All' || r.category === category)), r => r.result, r => r.energy);
    for (const kind of ['weapon', 'wear', 'pet', 'food'] as const) assert.ok(nonDecreasing(list.map(r => r.result).filter(id => P.powerKind(M.ITEMS[id]) === kind), P.itemScore), `${station}/${category}/${kind}`);
  }
  const s = M.newGame(); s.settings.tester = true; s.energy = 1e9;
  const html = Tester.testerShopHtml(s), order = [...html.matchAll(/data-action="tester-buy" data-item="([^"]+)"/g)].map(m => m[1]);
  // Grouped (item-groups.ts): inside each group, weakest to strongest.
  const weapons = order.filter(id => IG.groupOf(id) === 'sword');
  assert.ok(weapons.length > 3 && nonDecreasing(weapons, P.itemScore), weapons.join(','));
});

// ---- 2. gear upgrade math -----------------------------------------------------------------------
const rich = () => { const s = M.newGame(); s.energy = 1e7; for (const id of ['leather', 'bone', 'starshard', 'moonstone']) s.bag[id] = 500; return s; };
test('gear levels: ten even steps to the outfit ceiling, rising costs scaled by the gap', () => {
  // Knight outfit: 90 hp, 28 def, -5% speed; the outfit ceiling is 126 hp, 40 def, 12 atk, 4.5/s, 8% crit, +18% speed.
  assert.deepEqual(U.gearCost('armor_knight', 0), { energy: 55, materials: { leather: 2, bone: 1 } });
  assert.deepEqual(U.gearCost('armor_knight', 5), { energy: 455, materials: { leather: 7, bone: 3, starshard: 1 } });
  assert.deepEqual(U.gearCost('armor_knight', 9), { energy: 1100, materials: { leather: 11, bone: 5, starshard: 5, moonstone: 1 } });
  for (let l = 1; l < 10; l++) assert.ok(U.gearCost('armor_knight', l).energy > U.gearCost('armor_knight', l - 1).energy);
  const s = rich(); s.bag.armor_knight = 1; M.equip(s, 'armor_knight');
  const hp0 = M.maxHp(s), def0 = M.defense(s), atk0 = M.attack(s), st0 = M.activeStats(s);
  for (let l = 0; l < 10; l++) assert.deepEqual(applyGameAction(s, { type: 'upgradeGear', payload: { id: 'armor_knight' } }, { now: 1, random: Math.random }), { id: 'armor_knight', level: l + 1 });
  assert.equal(U.gearLevel(s, 'armor_knight'), 10);
  assert.equal(M.maxHp(s) - hp0, 36); assert.equal(M.defense(s) - def0, 12); assert.equal(Math.round((M.attack(s) - atk0) * 100) / 100, 12);
  const st = M.activeStats(s); assert.equal(Math.round((st.speed - st0.speed) * 1000) / 1000, 1.38, '6 m/s x (-5% to +18%)'); assert.equal(Math.round((st.critChance - st0.critChance) * 100) / 100, .08); assert.equal(st.regen, 4.5);
  assert.equal(U.upgradeGear(s, 'armor_knight'), null, 'capped at +10');
  const spent = Array.from({ length: 10 }, (_, l) => U.gearCost('armor_knight', l).energy).reduce((a, b) => a + b);
  assert.equal(s.energy, 1e7 - spent); assert.equal(spent, 4690); assert.equal(U.gearCostToMax('armor_knight', 0).energy, 4690);
});

test('gear upgrades need the item, the energy and the materials; weapons and rods stay on the forge', () => {
  const s = M.newGame(); s.energy = 1000; s.bag.leather = 1; s.bag.bone = 1; s.bag.hat_straw = 1;
  assert.equal(U.canUpgradeGear(s, 'hat_straw'), false, 'one leather short');
  s.bag.leather = 2; assert.equal(U.canUpgradeGear(s, 'hat_straw'), true); assert.equal(U.canUpgradeGear(s, 'hat_leather'), false, 'not owned');
  s.bag.sword_wood = 1; s.bag.rod = 1; assert.equal(U.upgradableGear('sword_wood'), false); assert.equal(U.upgradableGear('rod'), false); assert.equal(U.upgradableGear('dz_ninja'), false);
  assert.throws(() => applyGameAction(s, { type: 'upgradeGear', payload: { id: 'sword_wood' } }), /more energy or materials to upgrade/);
  s.energy = U.gearCost('hat_straw', 0).energy - 1; assert.throws(() => applyGameAction(s, { type: 'upgradeGear', payload: { id: 'hat_straw' } }), /more energy or materials to upgrade/);
  assert.equal(s.bag.leather, 2, 'a refused upgrade takes nothing');
});

test('a levelled companion shoots harder: its stat line climbs to the pet ceiling, its own shot keeps +4% a level', () => {
  const s = rich(); s.bag.pet_firefly = 1; M.equip(s, 'pet_firefly'); const atk0 = M.attack(s);
  for (let i = 0; i < 5; i++) U.upgradeGear(s, 'pet_firefly');
  // Firefly: 4 attack; the pet ceiling's 23 attack is halfway at +5 (13.5), and the shot factor is 1.2.
  assert.equal(U.gearFactor(s, 'pet_firefly'), 1.2); assert.ok(Math.abs(M.attack(s) - atk0 - 9.5) < 1e-9);
});

test('levels survive a save round-trip; bad levels are dropped or clamped', () => {
  const s = rich(); s.bag.hat_straw = 1; s.bag.pet_robot = 1; U.upgradeGear(s, 'hat_straw'); U.upgradeGear(s, 'hat_straw');
  for (let i = 0; i < 3; i++) U.upgradeSkill(s, 1);
  const back = M.parseSave(JSON.stringify(s))!;
  assert.deepEqual(back.gearLevels, { hat_straw: 2 }); assert.deepEqual(back.skillLevels, [0, 3, 0, 0]);
  const forged = M.parseSave(JSON.stringify({ ...s, gearLevels: { hat_straw: 99, sword_wood: 4, nope: 3, pet_robot: -2, boots_cowboy: 2.5 }, skillLevels: [9, -1, 'x', 2, 7] }))!;
  assert.deepEqual(forged.gearLevels, { hat_straw: 10 }, 'weapons, unknown ids, negatives and fractions are dropped');
  assert.deepEqual(forged.skillLevels, [5, 0, 0, 2]);
  const old = M.parseSave(JSON.stringify(M.newGame()))!; assert.equal(old.gearLevels, undefined); assert.equal(old.skillLevels, undefined);
  assert.equal(U.gearLevel(old, 'hat_straw'), 0); assert.deepEqual(U.skillLevels(old), [0, 0, 0, 0]);
});

// ---- 3. skill levels ----------------------------------------------------------------------------
test('skill costs and caps; the cooldown and damage table', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(l => U.skillCost(l).energy), [120, 480, 1080, 1920, 3000]);
  assert.deepEqual(U.skillCost(4).materials, { bone: 11, starshard: 4, moonstone: 1 });
  const s = rich(); for (let i = 0; i < 5; i++) assert.deepEqual(applyGameAction(s, { type: 'upgradeSkill', payload: { index: 3 } }), { index: 3, level: i + 1 });
  assert.throws(() => applyGameAction(s, { type: 'upgradeSkill', payload: { index: 3 } }), /at its best/);
  assert.throws(() => applyGameAction(s, { type: 'upgradeSkill', payload: { index: 4 } }), /upgrade that skill/);
  assert.throws(() => applyGameAction(s, { type: 'upgradeSkill', payload: { index: -1 } }), /not available/);
  assert.equal(S.levelledCooldown(1, 4, 5), 3); assert.equal(Math.round(S.levelledCooldown(3, 9, 5) * 100) / 100, 7.2);
  assert.equal(S.levelledCooldown(0, 7, 5), 7); assert.equal(S.levelledCooldown(1, 4, 5, true), 4, 'disguise skills never level');
  assert.equal(S.skillTuning(0, 5).damage, 1.5); assert.equal(S.skillTuning(2, 5).radius, 1.5); assert.equal(S.skillTuning(2, 99).radius, 1.5);
});

/** A test host: one dummy at a distance, attack 100, no crits and no random spread. */
function arena(levels: number[], distance: number, weapon = { kind: 'sword' as const, range: 2.3, cd: .55, special: 'crescent' }) {
  const target = { id: 'dummy', x: 0, z: distance, hp: 1e6, radius: .5 }, hits: number[] = [], at = { x: 0, z: 0 };
  const sim = new CombatSimulation({
    position: () => ({ ...at }), facing: () => 0, face: () => {}, targets: () => [target], weapon: () => weapon,
    stats: () => ({ attack: 100, critChance: 0 }), move: (x, z) => { at.x += x; at.z += z; }, effect: () => {}, skillLevel: i => levels[i] ?? 0,
    hit: (t, h) => { t.hp -= h.amount; hits.push(h.amount); return h.amount; },
  }, () => .5);
  return { sim, target, hits, run(index: number) { sim.skill(index, weapon.special); for (let i = 0; i < 200; i++) sim.update(.02); return hits.reduce((a, b) => a + b, 0); } };
}
test('levelled skills hit harder and wider in the combat simulation (delayed hits keep their level)', () => {
  assert.equal(arena([0], 2).run(0), 10 * 55); assert.equal(arena([5], 2).run(0), 10 * Math.round(55 * 1.5));
  assert.equal(arena([0], 4.2).run(0), 0, 'outside the 3.4 m spin (+0.5 body)'); assert.ok(arena([5], 4.2).run(0) > 0, '4.0 m at level 5');
  assert.equal(arena([0, 0, 0], 5.5).run(2), 0); assert.equal(arena([0, 0, 5], 5.5).run(2), Math.round(230 * 1.4));
  assert.equal(arena([0, 0], 3).run(1), 170); assert.equal(arena([0, 5], 3).run(1), Math.round(170 * 1.5));
  assert.equal(arena([0, 0, 0, 0], 2).run(3), 240); assert.equal(arena([0, 0, 0, 5], 2).run(3), Math.round(240 * 1.4));
  // A gun special: the projectiles carry the factor, then the hit is not scaled twice.
  const gun = { kind: 'gun' as const, range: 9, cd: .5, special: 'bigbubble', shot: 'bubble' };
  assert.equal(arena([0, 0, 0, 5], 4, gun).run(3), Math.round(120 * 1.4)); assert.equal(arena([0, 0, 0, 0], 4, gun).run(3), 120);
  // Basic attacks and the pet never pick up a skill's factor.
  const a = arena([5, 5, 5, 5], 2); a.sim.basic(a.target); assert.deepEqual(a.hits, [110]);
});

// ---- 4. the bench, the house, the vi strings ---------------------------------------------------
const ui = { art: (_: string, icon: string) => icon, chips: (m?: Record<string, number>) => Object.entries(m ?? {}).map(([id, n]) => `<span class="chip">${M.ITEMS[id].icon} ${n}</span>`).join(''), skills: [...BASE_SKILLS, SPECIALS.crescent] };
test('the bench lists owned gear weakest first, weapons with the forge rule, and the four skills', () => {
  const s = rich(); for (const id of ['armor_knight', 'hat_straw', 'sword_lava', 'sword_wood', 'rod', 'pet_robot', 'dz_ninja']) s.bag[id] = 1;
  assert.deepEqual(benchGear(s), ['hat_straw', 'pet_robot', 'sword_wood', 'armor_knight', 'sword_lava'].sort(P.compareByPower));
  const gear = benchHtml(s, 'gear', ui); assert.match(gear, /data-bench-action="forge" data-item="sword_lava"/); assert.match(gear, /data-bench-action="gear" data-item="hat_straw"/); assert.doesNotMatch(gear, /data-item="rod"|dz_ninja/);
  const skills = benchHtml(s, 'skills', ui); assert.equal([...skills.matchAll(/data-bench-action="skill"/g)].length, 4);
  for (let i = 0; i < 5; i++) U.upgradeSkill(s, 0);
  assert.equal([...benchHtml(s, 'skills', ui).matchAll(/data-bench-action="skill"/g)].length, 3, 'a maxed skill shows Maximum');
  assert.equal(skillEffect(1, 5, 4), 'Damage ×1.5 · cooldown 3 s'); assert.equal(skillEffect(2, 2, 9), 'Damage ×1.16 · radius 5 m'); assert.equal(skillEffect(0, 1, 7, 'sword'), 'Damage ×1.1 · radius 3.52 m');
});

test('the upgrade bench is a cottage spot in the craft room with its own title and purpose', () => {
  const spot = ACTIVITIES.find(a => a.id === 'bench')!; assert.equal(spot.room, 'craft'); assert.equal(spot.entity, 'house-bench');
  assert.equal(indoorStore('bench', true), INDOOR_STORES.bench); assert.equal(indoorStore('bench', false), null);
  assert.match(INDOOR_STORES.bench.purpose, /gear you own and your fighting skills/);
});

test('bench, levels and toasts read fully in Vietnamese', () => {
  setLanguage('vi');
  try {
    const s = rich(); for (const id of ['armor_knight', 'hat_straw', 'sword_lava', 'pet_robot']) s.bag[id] = 1; for (let i = 0; i < 10; i++) U.upgradeGear(s, 'hat_straw');
    const english = /\b(level|levels|energy|damage|upgrade|gear|skills?|item|cooldown|radius|attack|chance|maximum|each|forge|your|first|then|here|and)\b/i;
    for (const html of [benchHtml(s, 'gear', ui), benchHtml(s, 'skills', ui), benchHtml(M.newGame(), 'gear', ui), benchHtml(s, 'skills', { ...ui, disguised: true })]) {
      const text = localizeHtml(html).replace(/<[^>]*>/g, ' ').replace(/data-[a-z-]+="[^"]*"/g, '');
      assert.doesNotMatch(text, english, text.slice(0, 300));
      for (const [, label] of localizeHtml(html).matchAll(/aria-label="([^"]*)"/g)) assert.doesNotMatch(label, english, label);
    }
    for (const line of [...S.SKILL_LEVEL_TEXT, 'Upgrade bench', 'UPGRADE BENCH', 'Upgrade', INDOOR_STORES.bench.purpose]) assert.notEqual(t(line), line, line);
    assert.doesNotMatch(t('{name} is now +{level}!', { name: 'x', level: 2 }), english); assert.doesNotMatch(t('{skill} reached level {level}!', { skill: 'x', level: 2 }), english);
  } finally { setLanguage('en'); }
});
