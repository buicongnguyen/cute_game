import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as H from '../src/helper.ts';
import * as F from '../src/friends.ts';
import * as A from '../src/auto-plant.ts';
import { applyGameAction } from '../src/actions.ts';
import { autoPlantRow, bedPlan, hasGardener } from '../src/auto-plant-ui.ts';
import { helperPanel, helperRow } from '../src/helper-ui.ts';
import { friendPanel } from '../src/friend-ui.ts';
import { localizeHtml, setLanguage, t } from '../src/i18n.ts';

// Round 27: "when turn off the gardener robot, then we can grow the tree by our self" (auto-plant.ts has the rule).
const T0 = 1_000_000, AT = { x: 0, z: 0 };
function garden({ robot = true, sprout = true } = {}) {
  const s = M.newGame(); s.level = 10; s.energy = 5000;
  if (robot) assert.equal(H.buyHelper(s), 'bought');
  if (sprout) s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }];
  return s;
}
const ripe = (s: M.SaveState, i: number, crop?: string) => { const p = s.plots[i]; if (crop) { p.crop = crop; p.growDuration = M.CROPS[crop].duration; } p.plantedAt = T0 - M.cropDuration(p) - 1; };
const crops = (s: M.SaveState) => s.plots.map(p => p.crop ?? '-').join(',');
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}) => applyGameAction(s, { type, payload }, { now: T0, random: () => .5 });

test('robot switched off: no helper plants, Sprout still harvests, and the player plants a tree', () => {
  const s = garden(); ripe(s, 0, 'melon');
  assert.equal(H.setHelperPaused(s, true), true);
  assert.equal(A.autoPlantOff(s), 'robot'); assert.equal(A.autoPlanting(s), false);
  assert.equal(A.autoPlantSwitch(s), true, 'the saved switch itself is untouched: Bolt back on means planting back on');
  // Bolt rests; Sprout gathers the ripe bed and then has nothing to do, with eight empty beds around her.
  assert.equal(H.nextTask(s, AT, T0), null);
  assert.deepEqual(F.nextFriendTask(s, 'sprout', AT, T0), { kind: 'harvest', index: 0 });
  assert.deepEqual(F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0)?.raw, { melon: 1 });
  assert.equal(F.nextFriendTask(s, 'sprout', AT, T0), null);
  // No planting path gets round it: a direct job, the robot's action, either catch-up.
  assert.equal(F.friendWork(s, 'sprout', { kind: 'plant', index: 1 }, T0), null);
  assert.equal(H.helperPlant(s, 1, T0), null);
  assert.deepEqual(H.catchUp(s, T0), { harvested: [], planted: [] });
  assert.equal(F.friendsCatchUp(s, T0).sprout?.jobs, 0);
  assert.equal(crops(s), '-,-,-,-,-,-,-,-,-', 'empty beds stay empty until the player plants');
  // The player plants a fruit tree, and nothing touches it.
  assert.equal(act(s, 'plant', { index: 3, id: 'apple' }), true);
  assert.equal(s.plots[3].crop, 'apple'); assert.equal(s.plots[3].choice, 'apple');
  assert.equal(F.nextFriendTask(s, 'sprout', AT, T0), null);
  // Bolt back at work: the other beds are planted again, never with a tree of the helpers' own choosing.
  H.setHelperPaused(s, false); assert.equal(A.autoPlanting(s), true);
  const task = H.nextTask(s, AT, T0); assert.equal(task?.kind, 'plant'); assert.ok(!M.isFruitTree(task!.crop!));
});

test('the Auto-planting switch stops planting by Bolt and Sprout, not their harvesting', () => {
  const s = garden(); ripe(s, 2, 'carrot');
  assert.equal(A.setAutoPlant(s, false), true); assert.equal(A.autoPlantOff(s), 'switch');
  assert.deepEqual(H.nextTask(s, AT, T0), { kind: 'harvest', index: 2 });
  assert.equal(H.helperHarvest(s, 2, T0), 'carrot'); assert.equal(s.bag.carrot, 1);
  assert.equal(H.nextTask(s, AT, T0), null); assert.equal(H.seedFor(s, 2), null); assert.equal(H.helperPlant(s, 2, T0), null);
  assert.equal(F.nextFriendTask(s, 'sprout', AT, T0), null);
  assert.equal(A.setAutoPlant(s, true), true); assert.equal(s.helper!.manual, undefined);
  assert.equal(H.nextTask(s, AT, T0)?.kind, 'plant'); assert.equal(F.nextFriendTask(s, 'sprout', AT, T0)?.kind, 'plant');
  // A garden with only Sprout has the switch too (no robot is bought by flipping it).
  const only = garden({ robot: false }); assert.equal(F.nextFriendTask(only, 'sprout', AT, T0)?.kind, 'plant');
  A.setAutoPlant(only, false); assert.equal(only.helper?.owned, false); assert.equal(F.nextFriendTask(only, 'sprout', AT, T0), null);
  assert.equal(F.friendWork(only, 'sprout', { kind: 'plant', index: 0 }, T0), null);
  assert.equal(A.setAutoPlant(only, 'yes' as unknown as boolean), false);
});

test('a hand-planted bed keeps its crop: helpers replant it, a tree too, and never anything else', () => {
  // Bolt is told "carrot"; the player plants an apple tree in bed 0 by hand.
  const s = garden({ sprout: false }); H.setHelperSeed(s, 'carrot');
  assert.equal(act(s, 'plant', { index: 0, id: 'apple' }), true); ripe(s, 0);
  assert.equal(H.helperHarvest(s, 0, T0), 'apple');
  assert.equal(H.seedFor(s, 0), 'apple'); assert.equal(H.seedFor(s, 1), 'carrot');
  assert.equal(H.helperPlant(s, 0, T0), 'apple'); assert.equal(H.helperPlant(s, 1, T0), 'carrot');
  assert.equal(s.plots[1].choice, undefined, 'a helper planting is not the player\'s choice');
  // Sprout alone has no robot memory: before, she replaced the tree with her best quick crop.
  const only = garden({ robot: false }); act(only, 'plant', { index: 0, id: 'grape' }); ripe(only, 0);
  assert.ok(F.friendWork(only, 'sprout', { kind: 'harvest', index: 0 }, T0));
  assert.ok(F.friendWork(only, 'sprout', { kind: 'plant', index: 0 }, T0)); assert.equal(only.plots[0].crop, 'grape');
  assert.ok(F.friendWork(only, 'sprout', { kind: 'plant', index: 1 }, T0)); assert.ok(!M.isFruitTree(only.plots[1].crop!), 'her own pick is never a tree');
  // "All" is the player's planting too.
  const all = garden(); assert.equal(act(all, 'plantAll', { id: 'pumpkin' }), 9); assert.equal(A.chosenBeds(all), 9);
  // The bed's own crop cannot be planted (no seed left): the bed waits, it does not get something else.
  const seeds = garden({ sprout: false }); seeds.level = 20; seeds.bag.seed_ice = 1;
  act(seeds, 'plant', { index: 0, id: 'iceberry' }); assert.equal(seeds.bag.seed_ice ?? 0, 0); ripe(seeds, 0); H.helperHarvest(seeds, 0, T0);
  assert.equal(H.seedFor(seeds, 0), null); assert.equal(H.helperPlant(seeds, 0, T0), null); assert.equal(seeds.plots[0].crop, null);
  seeds.bag.seed_ice = 1; assert.equal(H.helperPlant(seeds, 0, T0), 'iceberry');
  // Handing the beds back (Bolt's panel): Bolt's seed takes over after the next harvest.
  assert.equal(act(s, 'clearBedChoices'), 1); ripe(s, 0); H.helperHarvest(s, 0, T0); assert.equal(H.helperPlant(s, 0, T0), 'carrot');
});

test('the bed whose seed list the player has open is held: no helper plants it', () => {
  const s = garden(), near = M.bedPosition(s, 4);
  assert.equal(H.nextTask(s, near, T0)?.index, 4); assert.notEqual(H.nextTask(s, near, T0, 4)?.index, 4);
  assert.equal((F.nextFriendTask(s, 'sprout', near, T0) as { index: number }).index, 4);
  assert.notEqual((F.nextFriendTask(s, 'sprout', near, T0, undefined, 4) as { index: number }).index, 4);
  // A ripe bed is still harvested: holding is about planting only.
  ripe(s, 4, 'carrot'); assert.deepEqual(H.nextTask(s, near, T0, 4), { kind: 'harvest', index: 4 });
});

test('the switch and each bed\'s own crop are saved', () => {
  const s = garden(); A.setAutoPlant(s, false); act(s, 'plant', { index: 2, id: 'apple' });
  const back = M.parseSave(JSON.stringify(s))!;
  assert.equal(back.helper!.manual, true); assert.equal(A.autoPlantOff(back), 'switch');
  assert.equal(back.plots[2].choice, 'apple'); assert.equal(back.plots[0].choice, undefined);
  const only = garden({ robot: false }); A.setAutoPlant(only, false);
  const sprout = M.parseSave(JSON.stringify(only))!; assert.equal(sprout.helper?.owned, false); assert.equal(A.autoPlanting(sprout), false);
  // On again leaves no trace, and bad data is dropped.
  A.setAutoPlant(s, true); assert.equal(M.parseSave(JSON.stringify(s))!.helper!.manual, undefined);
  const bad = JSON.parse(JSON.stringify(s)); bad.helper.manual = 'yes'; bad.plots[2].choice = 'rocks'; bad.plots[3].choice = 7;
  const cleaned = M.parseSave(JSON.stringify(bad))!; assert.equal(cleaned.helper!.manual, undefined); assert.equal(cleaned.plots[2].choice, undefined); assert.equal(cleaned.plots[3].choice, undefined);
  // An older save (no switch, no choices) plays as before: auto-planting on, helpers choose.
  const old = JSON.parse(JSON.stringify(garden())); assert.equal(A.autoPlanting(M.parseSave(JSON.stringify(old))!), true);
});

test('the shared actions carry the rule (offline play and the server run the same ones)', () => {
  const s = garden(); ripe(s, 0, 'melon');
  assert.throws(() => act(s, 'setAutoPlant', { on: 'no' }), /not available/);
  assert.equal(act(s, 'setAutoPlant', { on: false }), true);
  assert.throws(() => act(s, 'helperPlant', { index: 1 }), /not available/); assert.equal(s.plots[1].crop, null);
  assert.deepEqual(act(s, 'friendWork', { id: 'sprout', kind: 'plant', index: 1 }), { kind: 'plant', raw: {}, cooked: {}, skipped: true });
  // The catch-up after time away harvests the ripe bed and plants nothing.
  assert.deepEqual(act(s, 'helperCatchUp'), { harvested: ['melon'], planted: [] });
  ripe(s, 5, 'carrot'); assert.equal((act(s, 'friendsCatchUp') as { sprout: { jobs: number } }).sprout.jobs, 1);
  assert.equal(crops(s), '-,-,-,-,-,-,-,-,-');
  assert.equal(act(s, 'setAutoPlant', { on: true }), true);
  assert.equal((act(s, 'helperCatchUp') as { planted: string[] }).planted.length, 9);
});

test('the bed panel says who plants next, and the same switch sits in Bolt\'s and Sprout\'s panels', () => {
  const ui = { esc: (v: string) => v, mini: () => '', picture: 'helper.webp' };
  const none = M.newGame(); assert.equal(hasGardener(none), false); assert.equal(autoPlantRow(none, 0), ''); assert.doesNotMatch(helperRow(none, false, 0), /auto-plant/);
  const s = garden();
  assert.match(bedPlan(s, 0).text, /^Your helpers will plant Melon here\. Plant a seed yourself/);
  assert.match(helperRow(s, false, 0), /data-action="auto-plant"/); assert.equal(helperRow(s, true, 0), '', 'a visitor sees no switch');
  act(s, 'plant', { index: 0, id: 'apple' });
  assert.equal(bedPlan(s, 0).text, 'Your helpers will plant Magic Red Apple here again. It is your own choice for this bed.');
  assert.match(autoPlantRow(s, 0), /After this harvest: Your helpers will plant Magic Red Apple/);
  s.friends![0].paused = true; assert.match(bedPlan(s, 1).text, /^Bolt will plant/);
  s.friends![0].paused = false; H.setHelperPaused(s, true);
  assert.equal(bedPlan(s, 1).text, 'You plant this bed. Bolt is switched off, so nobody plants for you.');
  assert.match(autoPlantRow(s, 1), /aria-checked="false"[^>]* disabled/, 'while Bolt is off the switch shows off and Bolt\'s own switch decides');
  assert.match(helperPanel(s, ui), /Off while Bolt is switched off/); assert.match(friendPanel(s, 'sprout'), /data-action="auto-plant" data-kind="sprout" disabled/);
  H.setHelperPaused(s, false); A.setAutoPlant(s, false);
  assert.equal(bedPlan(s, 1).text, 'You plant this bed. Your helpers only harvest.'); assert.doesNotMatch(autoPlantRow(s, 1), /disabled/);
  A.setAutoPlant(s, true);
  // Sprout alone, on a break: nobody is at work.
  const only = garden({ robot: false }); assert.match(bedPlan(only, 0).text, /^Sprout will plant/);
  only.friends![0].paused = true; assert.equal(bedPlan(only, 0).text, 'You plant this bed. No helper is at work right now.');
  // A bed waiting for its own crop says why.
  const wait = garden({ sprout: false }); wait.level = 20; wait.bag.seed_ice = 1; act(wait, 'plant', { index: 0, id: 'iceberry' }); ripe(wait, 0); H.helperHarvest(wait, 0, T0);
  assert.equal(bedPlan(wait, 0).text, 'This bed waits for you, because no Ice berry seeds are left.'.replace('Ice berry', M.CROPS.iceberry.name));
  wait.level = 5; assert.match(bedPlan(wait, 0).text, /needs level 12\.$/);
  // Bolt's chosen seed and the player's own beds: the panel counts them and offers to hand them over.
  H.setHelperSeed(s, 'carrot'); assert.match(helperPanel(s, ui), /1 bed keeps the crop you planted there yourself\..*data-action="helper-all-beds">Plant Carrot there too/);
  act(s, 'plantAll', { id: 'pumpkin' }); assert.match(helperPanel(s, ui), /9 beds keep the crop you planted there yourself\./);
  A.forgetChoices(s); assert.doesNotMatch(helperPanel(s, ui), /helper-all-beds/);
});

test('every new line reads in Vietnamese', () => {
  const ui = { esc: (v: string) => v, mini: () => '', picture: 'helper.webp' }, english = /\b(the|you|your|yourself|plant|plants|planted|bed|beds|harvest|helpers?|switched|here|again|choice|keeps?|crop|seeds?|level|waits|after|every|while|nobody|work|until|ripe|about|off|on)\b/i;
  const visible = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1]).concat(html.replace(/<[^>]*>/g, '\n').split('\n')).filter(v => v.trim());
  const rows: string[] = [];
  const s = garden(); act(s, 'plant', { index: 0, id: 'apple' });
  const wait = garden({ sprout: false }); wait.level = 20; wait.bag.seed_ice = 1; act(wait, 'plant', { index: 0, id: 'iceberry' }); ripe(wait, 0); H.helperHarvest(wait, 0, T0);
  setLanguage('vi');
  try {
    const add = (html: string) => rows.push(localizeHtml(html));
    add(autoPlantRow(s, 0)); add(autoPlantRow(s, 1)); add(autoPlantRow(s)); add(autoPlantRow(wait, 0)); wait.level = 5; add(autoPlantRow(wait, 0));
    H.setHelperSeed(s, 'carrot'); add(helperPanel(s, ui)); add(friendPanel(s, 'sprout'));
    A.setAutoPlant(s, false); add(autoPlantRow(s, 0)); add(autoPlantRow(s, 1)); add(autoPlantRow(s)); A.setAutoPlant(s, true);
    H.setHelperPaused(s, true); add(autoPlantRow(s, 1)); add(autoPlantRow(s)); add(helperPanel(s, ui)); H.setHelperPaused(s, false);
    s.friends![0].paused = true; add(autoPlantRow(s, 1)); const only = garden({ robot: false }); add(autoPlantRow(only, 1)); only.friends![0].paused = true; add(autoPlantRow(only, 1));
    rows.push(t('This bed already grows {crop}.', { crop: t(M.CROPS.melon.name) }), t('Bolt now plants {crop} in every bed.', { crop: t(M.CROPS.carrot.name) }), t('About 7 h 59 min until ripe'));
    assert.equal(t('About 7 h 59 min until ripe'), 'Còn khoảng 7 giờ 59 phút nữa là chín');
    const found = rows.flatMap(visible).filter(text => english.test(text));
    assert.deepEqual(found, []);
    assert.match(rows[0], /Tự động gieo trồng/); assert.match(rows[0], /Sau lần thu hoạch này:/);
  } finally { setLanguage('en'); }
});
