import * as M from './model.ts';
import { HELPER_COST } from './helper-state.ts';
import { robotResting } from './helper.ts';
import { autoPlanting } from './auto-plant.ts';
import * as FarmHelper from './farm-helper.ts';
import { RESTOCK_MAX_LEVEL } from './farm-helper-state.ts';
import { friendOf, resting, type FriendId } from './friends.ts';
import { cooldownLeft, activity } from './house-activities.ts';
import { toLook, missingOptions } from './looks.ts';
import { dyeReason } from './dye-rules.ts';

/**
 * Why the shared rules (actions.ts) refused an intent, in plain words for the player's toast. Every intent the reducer
 * knows has an entry here (tests/action-refusals.test.ts checks), so the generic "not available" text is left only for
 * malformed intents, which main.ts logs for developers instead of showing. The reasons read the state as it was when the
 * rule refused; `p` is the intent's payload as sent. Each string is translated in src/locales (vi-refusals.ts).
 */
type Payload = Record<string, unknown>;
type Reason = string | ((s: M.SaveState, p: Payload, now: number) => string);
const fmt = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token);
const id = (p: Payload) => typeof p.id === 'string' ? M.canonicalItem(p.id) : '';
const item = (p: Payload) => Object.hasOwn(M.ITEMS, id(p)) ? M.ITEMS[id(p)] : undefined;
const home = 'Return to your garden at home first.';
const energy = (cost: number | null | undefined, what: string) => cost == null ? what : fmt('You need {cost} energy for that.', { cost });
const friendName = (p: Payload, key = 'id') => typeof p[key] === 'string' ? (M.FRIENDS as Record<string, { name: string }>)[p[key] as string]?.name : undefined;

function buyReason(s: M.SaveState, p: Payload) {
  const price = M.shopPrice(s, id(p)), it = item(p);
  if (it && M.gearLevel(id(p)) > s.level) return fmt('Needs level {level}.', { level: M.gearLevel(id(p)) });
  if (price === null || !it) return id(p) === 'plot_kit' ? fmt('Your garden already has the maximum {count} beds.', { count: M.MAX_PLOTS }) : 'That item is not for sale.';
  if (s.energy < price) return fmt('You need {cost} energy for that.', { cost: price });
  if (!M.hasMaterials(s, it.materials)) return 'You are missing some materials for that.';
  return 'Your backpack cannot hold any more of that.';
}
function craftReason(s: M.SaveState, p: Payload) {
  const r = typeof p.index === 'number' ? M.RECIPES[p.index] : undefined;
  if (!r) return 'That recipe cannot be made here.';
  if (r.station === 'forge' && !M.furnaceReady(s)) return 'Light all three braziers in the lava cave to fire up the forge first.';
  if (s.energy < r.energy) return fmt('You need {cost} energy for that.', { cost: r.energy });
  if (!M.hasMaterials(s, r.materials)) return 'You are missing some materials for that.';
  return 'Your backpack cannot hold any more of that.';
}
function kitchenReason(s: M.SaveState) {
  if (s.planet !== 'home') return 'The kitchen is at home. Return home to cook.';
  if (!M.kitchenOpen(s)) return fmt('The kitchen opens at level {level}.', { level: M.kitchenLevel(s) });
  return 'You do not have enough ingredients for that.';
}
function eatReason(s: M.SaveState, p: Payload) {
  const it = item(p);
  if (!it || !it.heal && !it.buff) return 'You cannot eat that.';
  if (!(s.bag[id(p)] ?? 0)) return 'You have none of that left.';
  if (!it.buff && s.hp >= M.maxHp(s)) return 'Your health is already full.';
  return 'You cannot eat that right now.';
}
function plantReason(s: M.SaveState, p: Payload) {
  const crop = id(p), def = Object.hasOwn(M.CROPS, crop) ? M.CROPS[crop] : undefined, bed = typeof p.index === 'number' ? s.plots[p.index] : undefined;
  if (s.planet !== 'home') return home;
  if (!def) return 'That cannot be planted.';
  if (M.cropLevel(s, crop) > s.level) return fmt('That crop unlocks at level {level}.', { level: M.cropLevel(s, crop) });
  if (def.seed && !(s.bag[def.seed] ?? 0)) return 'You need a seed for that crop.';
  if (p.index !== undefined && bed?.crop) return 'This bed is already growing something.';
  if (p.index === undefined && !s.plots.some(x => !x.crop)) return 'Every bed is already growing something.';
  return 'That bed cannot be planted right now.';
}
function harvestReason(s: M.SaveState, p: Payload) {
  const bed = typeof p.index === 'number' ? s.plots[p.index] : undefined;
  if (!bed?.crop) return 'This bed has nothing to harvest.';
  return 'This crop is not ripe yet.';
}
function fertilizeReason(s: M.SaveState, p: Payload) {
  const bed = typeof p.index === 'number' ? s.plots[p.index] : undefined;
  if (!bed?.crop) return 'Plant something in this bed first.';
  if (M.cropProgress(bed) >= 1) return 'This crop is already ripe. Tap the bed to harvest it.';
  if (!(s.bag[id(p) || 'spore'] ?? 0)) return 'You have none of that fertilizer left.';
  return 'Fertilizer cannot help this crop right now.';
}
function bedKitReason(s: M.SaveState) {
  if (s.plots.length >= M.MAX_PLOTS) return fmt('Your garden already has the maximum {count} beds.', { count: M.MAX_PLOTS });
  if (s.planet !== 'home') return 'Garden beds belong at home. Return to your garden first.';
  return fmt('You need {amount} energy to expand the garden.', { amount: M.gardenExpansionCost(s) });
}
function upgradeBedReason(s: M.SaveState, p: Payload) {
  const bed = typeof p.index === 'number' ? s.plots[p.index] : undefined;
  if (s.planet !== 'home') return home;
  if (!bed) return 'That bed is gone.';
  if (M.bedLevel(bed) >= M.BED_MAX_LEVEL) return 'This bed is fully upgraded.';
  return fmt('You need {cost} energy to upgrade this bed.', { cost: M.bedUpgradeCost(s, M.bedLevel(bed)) });
}
function penReason(s: M.SaveState) {
  if (s.planet !== 'home') return home;
  const check = M.canBuildPen(s);
  if (check === 'built') return 'Your pen is already built.';
  if (check === 'level') return fmt('The animal pen opens at level {level}.', { level: M.PEN_BUILD.level });
  return fmt('You need {amount} energy to build the pen.', { amount: M.PEN_BUILD.price });
}
function animalReason(s: M.SaveState, p: Payload) {
  const kind = p.kind as M.AnimalKind, check = M.canBuyAnimal(s, kind), d = Object.hasOwn(M.ANIMALS, kind) ? M.ANIMALS[kind] : undefined;
  if (!d) return 'That animal is not sold here.';
  if (check === 'away') return home;
  if (check === 'unbuilt') return 'Build the animal pen first.';
  if (check === 'level') return fmt('That animal unlocks at level {level}.', { level: d.level });
  if (check === 'full') return 'The pen is full. Make it bigger for more animals.';
  if (check === 'energy') return fmt('You need {cost} energy for that.', { cost: M.priceOf(s, kind) });
  return 'You cannot buy that animal right now.';
}
function expandPenReason(s: M.SaveState) {
  const cost = M.penExpandCost(s);
  if (cost === null) return 'Your pen is as big as it gets.';
  if (s.planet !== 'home') return home;
  if (!M.penBuilt(s)) return 'Build the animal pen first.';
  return fmt('You need {amount} energy to make the pen bigger.', { amount: cost });
}
function speciesPenReason(s: M.SaveState, p: Payload) {
  const cost = M.speciesPenCost(s, p.kind as M.AnimalKind);
  if (cost === null) return 'That shelter is already built.';
  if (s.planet !== 'home') return home;
  if (!M.penBuilt(s)) return 'Build the animal pen first.';
  return fmt('You need {cost} energy for that.', { cost });
}
function feedReason(s: M.SaveState, p: Payload) {
  if (!M.penBuilt(s)) return 'Build the animal pen first.';
  if (p.uid !== undefined && !M.farmOf(s).animals.some(a => a.uid === p.uid)) return 'That animal is no longer in your pen.';
  return 'That animal is not hungry, or you have no feed for it.';
}
function farmHelperReason(s: M.SaveState) {
  const h = FarmHelper.helperOf(s);
  if (s.planet !== 'home') return home;
  if (!s.farm?.built) return 'Build the animal pen first.';
  if (!h.owned) return 'You do not have a pen robot yet.';
  if (h.paused) return 'Your pen robot is switched off.';
  return 'Your pen robot has nothing to do there right now.';
}
function buyRobotReason(s: M.SaveState, owned: boolean) {
  if (owned) return 'You already have that helper.';
  if (s.planet !== 'home') return home;
  return fmt('You need {cost} energy for that.', { cost: HELPER_COST });
}
function friendReason(s: M.SaveState, p: Payload, key = 'id') {
  const fid = p[key] as FriendId, f = typeof fid === 'string' ? friendOf(s, fid) : undefined, name = friendName(p, key);
  if (!f) return name ? fmt('{name} has not joined you yet.', { name }) : 'That friend has not joined you yet.';
  if (!f.home) return fmt('{name} is still on the way home.', { name: name ?? fid });
  if (s.planet !== 'home') return home;
  return fmt('{name} cannot do that right now.', { name: name ?? fid });
}
function progressReason(s: M.SaveState, p: Payload) {
  return p.kind === 'collection' ? 'Collections fill up by themselves; there is nothing to collect here.' : 'That reward is not ready yet, or you already collected it.';
}
function houseReason(s: M.SaveState, p: Payload, now: number) {
  const a = typeof p.id === 'string' ? activity(p.id) : undefined;
  if (s.planet !== 'home') return home;
  if (!a) return 'That cannot be used.';
  const left = cooldownLeft(s, a.id as Parameters<typeof cooldownLeft>[1], now);
  if (left > 0) return fmt('You can use that again in {minutes} min.', { minutes: Math.max(1, Math.ceil(left / 60_000)) });
  return 'That cannot be used right now.';
}

export const REFUSALS: Record<string, Reason> = {
  buy: buyReason,
  sell: (s, p) => (s.bag[id(p)] ?? 0) > 0 && !M.looseQuantity(s, id(p)) ? 'Take it off before selling it.' : item(p)?.sell ? 'You have none of that left to sell.' : 'That cannot be sold.',
  sellProduce: 'You have no crops or fish to sell.',
  cookSellProduce: s => s.planet !== 'home' || !M.kitchenOpen(s) ? kitchenReason(s) : 'You have no crops or fish to sell.',
  craft: craftReason,
  cook: kitchenReason,
  cookDish: kitchenReason,
  upgrade: (s, p) => p.kind === 'crit' ? 'That wish is already at its best.' : 'You need more energy for that wish.',
  forge: 'You need more energy or materials to forge that.',
  upgradeGear: 'You need more energy or materials to upgrade that.',
  upgradeSkill: 'You need more energy to upgrade that skill, or it is at its best.',
  equip: (s, p) => (s.bag[id(p)] ?? 0) > 0 && M.gearLevel(id(p)) > s.level ? fmt('Needs level {level} to wear.', { level: M.gearLevel(id(p)) }) : 'You do not have that in your backpack.',
  unequip: 'Nothing is worn there.',
  eat: eatReason,
  transfer: (s, p) => s.planet !== 'home' ? 'The chest stands at home. Return home to use it.' : p.toChest === true && (s.bag[id(p)] ?? 0) > 0 ? 'Take it off before storing it.' : 'There is none of that left to move.',
  plant: plantReason,
  plantAll: plantReason,
  setAutoPlant: 'Auto-planting cannot be changed right now.',
  clearBedChoices: home,
  harvest: harvestReason,
  harvestAll: 'Nothing is ripe yet.',
  fertilize: fertilizeReason,
  expandGarden: s => s.planet !== 'home' ? home : s.plots.length >= M.MAX_PLOTS ? fmt('Your garden already has the maximum {count} beds.', { count: M.MAX_PLOTS }) : 'There is no free spot left for another bed. Your kit stays in your bag.',
  buyBedKit: bedKitReason,
  storeBed: 'Only an empty extra bed can be packed away.',
  upgradeBed: upgradeBedReason,
  moveBed: 'That spot is taken. Choose a free spot.',
  placeDecoration: s => s.planet !== 'home' ? home : 'That spot is taken. Choose a free spot.',
  moveDecoration: s => s.planet !== 'home' ? home : 'That spot is taken. Choose a free spot.',
  removeDecoration: s => s.planet !== 'home' ? home : 'That decoration is already gone.',
  buildPen: penReason,
  buyAnimal: animalReason,
  feedAnimal: feedReason,
  feedAll: feedReason,
  collectProducts: 'Nothing is ready to collect yet.',
  expandPen: expandPenReason,
  buildSpeciesPen: speciesPenReason,
  buyHelper: s => buyRobotReason(s, !!s.helper?.owned),
  setHelperPaused: 'You do not have a garden robot yet.',
  setHelperSeed: 'You do not have a garden robot yet.',
  helperHarvest: (s, _p, now) => !s.helper?.owned ? 'You do not have a garden robot yet.' : robotResting(s, now) ? 'Bolt is resting right now.' : 'Bolt found nothing to harvest there.',
  helperPlant: (s, _p, now) => !s.helper?.owned ? 'You do not have a garden robot yet.' : robotResting(s, now) ? 'Bolt is resting right now.' : !autoPlanting(s) ? 'Auto-planting is off: you plant the beds yourself.' : 'Bolt found nothing to plant there.',
  helperCatchUp: 'Bolt has nothing to catch up on.',
  buyFarmHelper: s => !s.farm?.built ? 'Build the animal pen first.' : buyRobotReason(s, FarmHelper.helperOf(s).owned),
  setFarmHelperPaused: farmHelperReason,
  setFarmHelperAutoFeed: farmHelperReason,
  farmHelperCollect: farmHelperReason,
  farmHelperFeed: s => FarmHelper.canWork(s) && !FarmHelper.helperOf(s).autoFeed ? 'Your pen robot feeds animals only when automatic feeding is on.' : farmHelperReason(s),
  farmHelperCatchUp: farmHelperReason,
  upgradeFarmRestock: s => !FarmHelper.helperOf(s).owned ? 'You do not have a pen robot yet.' : s.planet !== 'home' ? home : (FarmHelper.helperOf(s).restock?.level ?? 0) >= RESTOCK_MAX_LEVEL ? 'Auto-restock is fully upgraded.' : 'You need more energy to upgrade auto-restock.',
  setFarmRestock: 'Teach your pen robot auto-restock first.',
  farmHelperRestock: 'Nothing needs restocking right now.',
  homeCleanse: home,
  rescueFriend: 'This cage is still locked.',
  friendsArrive: home,
  setFriendAutoFeed: (s, p) => friendReason(s, p),
  welcomeStart: 'The welcome gift has already been settled.',
  friendOutfit: (s, p) => friendReason(s, p),
  callHelper: s => !s.helper?.owned ? 'You do not have a garden robot yet.' : s.helper.paused ? 'Bolt is switched off. Switch him on first.' : home,
  callFriend: (s, p) => friendReason(s, p),
  setFriendPaused: (s, p) => friendReason(s, p),
  friendWork: (s, p) => friendReason(s, p),
  buyLook: 'You need more energy for that look, or you already own it.',
  buyDye: dyeReason,
  buyDyeSet: dyeReason,
  wearLook: 'Buy that look first.',
  friendLook: (s, p) => { const f = friendOf(s, p.friend as FriendId), look = toLook(p.id); if (!f) return friendReason(s, p, 'friend'); if (!look) return 'That look does not exist.'; if (!missingOptions(s, look).length) return 'Your friend already has that look.'; return p.buy === true ? 'You need more energy for that look.' : 'Buy that look first.'; },
  friendsCatchUp: home,
  ackStored: 'There is nothing new in the chest.',
  ackTrim: 'There is nothing new to report.',
  takeChest: 'The chest stands at home. Return home to use it.',
  giveFriendGear: (s, p) => friendOf(s, p.friend as FriendId) ? 'Your friend cannot wear that.' : friendReason(s, p, 'friend'),
  takeFriendGear: (s, p) => friendOf(s, p.friend as FriendId) ? 'Your friend is not wearing anything there.' : friendReason(s, p, 'friend'),
  fishHunt: 'No fish is in reach. Move closer to the pond and try again.',
  claimProgress: progressReason,
  claimQuest: 'Finish this step of your story first.',
  rerollDaily: 'You have used all three rerolls today, or this task cannot be rerolled.',
  startChallenge: s => s.level < 2 ? 'Quick challenges open at level 2.' : 'Finish or collect your current challenge first.',
  launch: fmt('You need {cost} energy to launch your starship.', { cost: M.LAUNCH_COST }),
  travel: (s, p) => { const planet = typeof p.id === 'string' && Object.hasOwn(M.PLANETS, p.id) ? M.PLANETS[p.id as M.PlanetId] : undefined; return planet ? fmt('You can land there from level {level}.', { level: planet.level }) : 'That planet cannot be reached.'; },
  returnHome: 'You are already home.',
  discover: 'You already know this planet.',
  collectStardust: 'That stardust is gone.',
  claimMine: 'This ore is not ready yet. Come back a little later.',
  claimGift: 'This gift is not ready yet. Come back a little later.',
  openCave: 'The cave gate is already open.',
  lightBrazier: 'You need a fire crystal to light this brazier.',
  claimCaveChest: 'Light all three braziers to open the cave chest.',
  recoverBag: 'Your lost bag is not on this planet.',
  expandStorage: (s, p) => { const kind = M.isStorageKind(p.kind) ? p.kind : 'bag', next = M.nextExpansion(s, kind); if (!next) return kind === 'bag' ? 'Your backpack is already as big as it gets.' : 'Your chest is already as big as it gets.'; if (s.energy < next.energy) return fmt('You need {cost} energy for that.', { cost: next.energy }); return 'You are missing some materials for that.'; },
  dungeonStart: s => s.planet !== 'home' ? 'The vault is reached from Clover Village.' : 'You have used all six vault runs today. Come back tomorrow!',
  dungeonClaim: 'That vault room was already counted, or the run has ended.',
  ctfClaim: 'That match was already counted, or it was too short for EXP.',
  rescueClaim: 'That rescue was already counted, or it ended too quickly.',
  dungeonLeave: 'You are not in the vault.',
  die: 'That cannot happen right now.',
  houseUse: houseReason,
  rest: home,
  reset: 'A fresh start is not possible right now.',
  settings: (s, _p, now) => { const wait = M.lowerReadyAt(s) - now; return wait > 0 ? fmt('You can lower the difficulty again in {hours} h.', { hours: Math.ceil(wait / 3_600_000) }) : 'That setting cannot be changed right now.'; },
};

/** The plain-words reason for a refused intent; the old generic text only for an intent type this table does not know. */
export function refusalReason(type: string, s: M.SaveState, p: Payload, now = Date.now()): string {
  const reason = Object.hasOwn(REFUSALS, type) ? REFUSALS[type] : undefined;
  if (!reason) return 'That action is not available with your current progress.';
  try { return typeof reason === 'string' ? reason : reason(s, p, now); }
  catch { return 'That action is not available with your current progress.'; }
}
