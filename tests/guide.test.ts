import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/guide.ts';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { catchUpStory, ownedGearCount } from '../src/story-catchup.ts';
import { SpaceFlight, STAR_MAP, SPACE_EDGE, FUEL_MAX, spaceLayout } from '../src/space.ts';
import { t, setLanguage } from '../src/i18n.ts';
import { ANIMALS, ANIMAL_KINDS, priceOf } from '../src/farm.ts';

test('the way home from space: urgent when nearly dry or at the edge, and a flight is never a dead end', () => {
  assert.equal(G.homeButtonUrgent({ fuel: 60, x: 0, z: 100 }), false);
  assert.equal(G.homeButtonUrgent({ fuel: G.LOW_FUEL, x: 0, z: 100 }), true);
  assert.equal(G.homeButtonUrgent({ fuel: 60, x: SPACE_EDGE - 10, z: 0 }), true);
  assert.deepEqual(G.refuelForHome(50, 0, 20), { pay: false, fuel: 50 }, 'enough fuel: nothing to pay');
  assert.deepEqual(G.refuelForHome(0, 100, 20), { pay: true, fuel: FUEL_MAX }, 'dry tank: pay the launch cost for a full tank');
  assert.deepEqual(G.refuelForHome(0, 5, 20), { pay: false, fuel: G.TOW_FUEL }, 'no energy either: a free tow');
});

test('the autopilot flies a dry ship home from the edge of the universe once it is refuelled', () => {
  const flight = new SpaceFlight('home', ['home'], { asteroids: [], dust: [] });
  flight.x = 500; flight.z = -400; flight.vx = flight.vz = 0; flight.fuel = 0;
  flight.fuel = G.refuelForHome(flight.fuel, 0, 20).fuel;
  flight.setAutopilot('home');
  let landed = false;
  for (let i = 0; i < 60 * 120 && !landed; i++) landed = flight.step(1 / 60).some(e => e.kind === 'landed' && e.planet === 'home');
  assert.ok(landed, 'the ship lands at home');
});

test('a straight flight from home spots the easiest planet (Toybox) first', () => {
  const flight = new SpaceFlight('home', ['home'], { asteroids: [], dust: [] }), found: string[] = [];
  for (let i = 0; i < 60 * 40 && !found.length; i++) for (const e of flight.step(1 / 60, { turn: 0, thrust: 1, brake: false, boost: true })) if (e.kind === 'discover') found.push(e.planet);
  assert.deepEqual(found, ['toy']);
  assert.equal(M.PLANETS.toy.level, Math.min(...Object.entries(M.PLANETS).filter(([id]) => id !== 'home').map(([, p]) => p.level)));
  const layout = spaceLayout();
  assert.ok(layout.asteroids.every(r => Math.hypot(r.x - STAR_MAP.toy.x, r.z - STAR_MAP.toy.z) >= STAR_MAP.toy.r + 30));
});

test('the garden pointer stays until the first crop, and picks the nearest empty bed', () => {
  const s = M.newGame('Pointer');
  assert.equal(G.needsGardenGuide(s), true);
  s.plots[0].crop = 'radish';
  assert.equal(G.needsGardenGuide(s), false, 'a planted bed ends the guide');
  s.plots[0].crop = null; s.counters.harvests = 1;
  assert.equal(G.needsGardenGuide(s), false, 'so does a first harvest');
  s.counters.harvests = 0; s.planet = 'ice';
  assert.equal(G.needsGardenGuide(s), false, 'only at home');
  const plots = [{ crop: 'x' }, { crop: null }, { crop: null }], at = (i: number) => [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 3, z: 0 }][i];
  assert.equal(G.nearestEmptyBed(plots, at, { x: 0, z: 0 })?.index, 2);
  assert.equal(G.nearestEmptyBed([{ crop: 'x' }], at, { x: 0, z: 0 }), null);
});

test('an off-screen target becomes an arrow on the screen edge pointing at it', () => {
  const right = G.edgeArrow(2000, 400, 400, 800, 50), left = G.edgeArrow(-500, 400, 400, 800, 50), below = G.edgeArrow(200, 5000, 400, 800, 50);
  assert.equal(right.x, 350); assert.equal(left.x, 50); assert.equal(below.y, 750);
  assert.ok(Math.abs(right.angle) < .1); assert.ok(Math.abs(Math.abs(left.angle) - Math.PI) < .1); assert.ok(Math.abs(below.angle - Math.PI / 2) < .1);
  const behind = G.edgeArrow(200, 200, 400, 800, 50, false);
  assert.ok(behind.y > 400, 'a target behind the camera and above the centre points down');
});

test('the story tracker row walks to the step place', () => {
  assert.equal(G.questPlace({ event: 'harvest' }), 'plot');
  assert.equal(G.questPlace({ event: 'sell' }), 'sell');
  assert.equal(G.questPlace({ event: 'craft' }), 'shop');
  assert.equal(G.questPlace({ event: 'kill' }), null);
  assert.equal(G.questPlace(null), null);
});

test('map travel stops at the village edge first and walks in on the second choice', () => {
  const first = G.wildRoute([-30, 0], false), second = G.wildRoute([-30, 0], true);
  assert.equal(first.inside, false);
  assert.ok(Math.abs(Math.hypot(first.x, first.z) - G.ZONE_EDGE) < 1e-9 && first.x < 0, 'on the ring toward the place');
  assert.deepEqual(second, { x: -30, z: 0, inside: true });
  assert.equal(G.wildRoute([5, 5], false).inside, true, 'a place already inside the ring is simply walked to');
  assert.equal(G.wildDanger(3), true); assert.equal(G.wildDanger(20), false);
});

test('shop tabs: the fishing rod is listed under Weapons and again under Supplies', () => {
  const rod = M.ITEMS.rod, sword = M.ITEMS.sword_wood, bait = Object.values(M.ITEMS).find(i => i.type === 'bait')!;
  assert.equal(G.shopTabMatches('Weapons', rod), true);
  assert.equal(G.shopTabMatches('Supplies', rod), true);
  assert.equal(G.shopTabMatches('Supplies', bait), true);
  assert.equal(G.shopTabMatches('Supplies', sword), false);
  assert.equal(G.shopTabMatches('Clothing', rod), false);
  assert.equal(G.rodShopTab, 'Supplies');
  assert.ok(M.shopPrice(M.newGame('Rod'), 'rod') !== null, 'the rod is for sale');
});

test('shop numbers use thousands separators like the HUD', () => {
  assert.equal(G.formatEnergy(1000091), (1000091).toLocaleString());
  assert.match(G.energyKicker(1000091), /^ϟ 1[,. ]?000[,. ]?091 ENERGY$/);
  assert.equal(G.energyKicker(20), 'ϟ 20 ENERGY');
  setLanguage('vi'); assert.match(t(G.energyKicker(1000091)), /NĂNG LƯỢNG/); setLanguage('en');
});

test('a price button out of reach stays tappable (so the toast can explain); a level gate stays disabled', () => {
  assert.deepEqual(G.priceButtonState(false, true), { disabled: false, short: true });
  assert.deepEqual(G.priceButtonState(true, true), { disabled: true, short: false });
  assert.deepEqual(G.priceButtonState(false, false), { disabled: false, short: false });
});

test('the pen list shows animals by level, then price', () => {
  const s = M.newGame('Pen'), order = G.sortAnimalKinds(ANIMAL_KINDS, k => ANIMALS[k].level, k => priceOf(s, k));
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1], b = order[i];
    assert.ok(ANIMALS[a].level < ANIMALS[b].level || (ANIMALS[a].level === ANIMALS[b].level && priceOf(s, a) <= priceOf(s, b)), `${a} before ${b}`);
  }
  assert.deepEqual([...order].sort(), [...ANIMAL_KINDS].sort());
});

test('surprise challenges wait for level 5 and never start mid-fight; the Colossus banner waits for level 10', () => {
  assert.equal(G.surpriseOk(4, false), false); assert.equal(G.surpriseOk(5, false), true); assert.equal(G.surpriseOk(9, true), false);
  assert.equal(G.COLOSSUS_BANNER_LEVEL, 10);
});

test('wording says Tap on touch devices and Click with a mouse', () => {
  assert.equal(G.tapOrClick(true), 'Tap'); assert.equal(G.tapOrClick(false), 'Click');
  assert.match(G.chooseOwnPathHint(true), /^Tap /); assert.match(G.chooseOwnPathHint(false), /^Click /);
  setLanguage('vi'); assert.notEqual(t(G.chooseOwnPathHint(true)), G.chooseOwnPathHint(true)); assert.notEqual(t('🌱 Tap a bed to plant'), '🌱 Tap a bed to plant'); setLanguage('en');
});

test('story catch-up: buying the wood sword before "Buy or craft one item" is active counts when it comes up', () => {
  const s = M.newGame('Catch');
  s.energy = 500; s.level = 3;
  assert.ok(M.addItem(s, 'sword_wood'));
  P.refreshProgress(s);
  assert.equal(ownedGearCount(s), 1);
  s.progression.story.index = 2; s.quest = 2; s.progression.story.progress = 0; s.progression.story.event = undefined;
  P.refreshProgress(s);
  const entry = P.progressEntries(s, 'story')[0];
  assert.equal(entry.progress, 1); assert.equal(entry.complete, true, 'the owned sword completes the step');
});

test('story catch-up never lowers progress, ignores other steps and keepsake pets', () => {
  const s = M.newGame('Catch2'); s.progression.story.progress = 2;
  assert.equal(catchUpStory(s, { event: 'craft', target: 3 }), false, 'nothing owned');
  s.bag.sword_wood = 1; s.bag.bunny = 1;
  assert.equal(ownedGearCount(s), 1, 'the starting bunny does not count');
  assert.equal(catchUpStory(s, { event: 'kill', target: 5 }), false);
  assert.equal(catchUpStory(s, { event: 'craft', target: 3 }), false, 'one owned item is below the 2 already counted');
  assert.equal(s.progression.story.progress, 2);
  s.bag[Object.keys(M.ITEMS).filter(id => M.ITEMS[id].slot === 'weapon' && id !== 'sword_wood')[0]] = 1; s.gear.hat = Object.keys(M.ITEMS).find(id => M.ITEMS[id].slot === 'hat');
  assert.equal(catchUpStory(s, { event: 'craft', target: 3 }), true);
  assert.equal(s.progression.story.progress, 3);
});
