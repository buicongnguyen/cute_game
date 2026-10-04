import { growUp, GROWTH_JOBS_PER_DAY } from './growth.ts';
import * as M from './model.ts';
import { CALL_MS, onBreak } from './helper-state.ts';
import { seedFor, harvestable } from './helper.ts';
import { CAGES, FRIENDS, FRIEND_IDS, FRIEND_SLOTS, friendSlot, type Friend, type FriendId, type FriendRole, type FriendSlot } from './friends-state.ts';

/**
 * Rescued friends, pure and testable (friend-crew.ts walks and poses them; FRIENDS-CONTRACT.md is the shared seam).
 *
 * Cages (which bosses, from the boss tables — enemyRoster HP):
 * - Sprout waits by the treant, the weakest home boss (1,820 HP, level 7; the mushroom king has the same level but 2,470 HP).
 * - Clover waits by the bear, the strongest home boss (5,408 HP, level 13). The titan turtle (27,300 HP) is not counted:
 *   titans are their own tier (titan-content.ts, a 600 s world boss), not one of the zone bosses.
 * - Pepper waits by the robot on the Toy planet: the first planet the explorer can land on (level 4), and it has a single
 *   boss, so the cage is easy to find. Her cage only appears once any boss on a planet other than home has been beaten.
 * A cage opens once its boss has been beaten at least once (SaveState.bosses); a boss's respawn never re-locks it.
 *
 * Jobs (only at home, once the friend has reached the village; every grant goes through the player's own rules):
 * - garden (Sprout): the helper robot's job (helper.ts) for free: harvest ripe beds, replant from the bag. She plants only
 *   while auto-planting is on (auto-plant.ts: one garden switch, off as well while the robot is switched off), and a bed the
 *   player planted by hand gets the player's crop again; both come with helper.ts seedFor.
 *   With a bought robot both work. They cannot double-harvest: M.harvest grants only a ripe crop and empties the bed in
 *   the same step, and M.plant refuses a planted bed, so the second worker at a bed simply finds nothing to do. The view
 *   also steers Sprout away from the bed the robot is walking to, so two gardeners cover the beds about twice as fast:
 *   the robot keeps its value and Sprout is still a gift.
 * - farm (Clover): collects ready products (M.collectProducts) and feeds animals that would take feed (M.feedAnimal,
 *   the cheapest crop in the bag), always keeping at least one of that crop for the player.
 * - cook (Pepper): harvests ripe beds (without replanting) and collects products, then cooks half of the cookable items
 *   (rounded down; an odd item waits for its partner): crops, fish and meat become their cooked_ food (M.cook); eggs
 *   and milk go to the pot and become dishes (M.cookDish). The other half goes to the bag raw.
 */
export type { Friend, FriendId, FriendRole, FriendSlot };
export { FRIENDS, FRIEND_IDS, CAGES };

export { growUp, friendStage, friendHeight, GROWTH } from './growth.ts';
export function friendsOf(s: M.SaveState): Friend[] { return s.friends ?? []; }
export const friendOf = (s: M.SaveState, id: FriendId) => friendsOf(s).find(f => f.id === id);

/** Dresses a friend in anything the explorer has obtained (it is in the bag): the item stays in the bag, so every helper can wear the same piece and the explorer keeps it too. The item the friend wore before is simply replaced. */
export function giveGear(s: M.SaveState, id: FriendId, raw: M.ItemId): boolean {
  const f = friendOf(s, id), item = M.canonicalItem(raw), slot = friendSlot(item);
  if (!f || !slot || (s.bag[item] ?? 0) < 1) return false;
  f.gear[slot] = item; return true;
}
export function takeGear(s: M.SaveState, id: FriendId, slot: string): boolean {
  const f = friendOf(s, id);
  if (!f || !(FRIEND_SLOTS as readonly string[]).includes(slot) || !f.gear[slot as FriendSlot]) return false;
  delete f.gear[slot as FriendSlot]; return true;
}

// ---- Cages ----
export type CageState = 'hidden' | 'locked' | 'open' | 'rescued';
const beatAwayBoss = (s: M.SaveState) => (s.bosses ?? []).some(b => !b.startsWith('home:'));
export function cageState(s: M.SaveState, id: FriendId): CageState {
  if (friendOf(s, id)) return 'rescued';
  if (id === 'pepper') return beatAwayBoss(s) ? 'open' : 'hidden';
  const c = CAGES[id]; return (s.bosses ?? []).includes(`${c.planet}:${c.boss}`) ? 'open' : 'locked';
}
/** Frees a prisoner: only from an open cage on the planet the explorer is on. */
export function rescue(s: M.SaveState, id: FriendId, now = Date.now()): boolean {
  if (!FRIEND_IDS.includes(id) || cageState(s, id) !== 'open' || s.planet !== CAGES[id].planet) return false;
  (s.friends ??= []).push({ id, role: FRIENDS[id].role, rescuedAt: now, gear: {}, home: false }); return true;
}
/** Welcome gift for a new game: the cook joins at once; `take` also gives the 1M energy she "won in the lottery". False when already settled. */
export const WELCOME_ENERGY = 1_000_000;
export function welcomeStart(s: M.SaveState, take: boolean, now = Date.now()): boolean {
  if (s.welcome !== 'pending' || typeof take !== 'boolean') return false;
  if (!friendOf(s, 'pepper')) (s.friends ??= []).push({ id: 'pepper', role: 'cook', rescuedAt: now, gear: {}, home: true });
  if (take && Number.isSafeInteger(s.energy + WELCOME_ENERGY)) s.energy += WELCOME_ENERGY;
  s.welcome = 'done'; return true;
}
/**
 * The cook's change of clothes after a visit home: a random hat, outfit and boots from what the explorer has obtained
 * (borrowed, giveGear), never the same look twice in a row when there is a choice. `pick` is a number in [0, 1) from the caller.
 */
export function changeOutfit(s: M.SaveState, id: FriendId, pick: number): boolean {
  const f = friendOf(s, id); if (!f || !Number.isFinite(pick) || pick < 0 || pick >= 1) return false;
  const owned = (slot: FriendSlot) => Object.keys(s.bag).filter(item => (s.bag[item] ?? 0) > 0 && friendSlot(item) === slot).sort();
  let changed = false;
  FRIEND_SLOTS.forEach((slot, i) => {
    if (slot === 'pet' || slot === 'weapon') return;
    const list = owned(slot).filter(item => item !== f.gear[slot]); if (!list.length) return;
    // A different fraction of `pick` per slot, so hat, outfit and boots do not always move together.
    f.gear[slot] = list[Math.floor(((pick * (i + 3) * 7.31) % 1) * list.length)]; changed = true;
  });
  return changed;
}
/** The safe village (environments.ts zoneAt 'home'). */
export const VILLAGE_RADIUS = 18;
export const inVillage = (p: { x: number; z: number }) => Math.hypot(p.x, p.z) < VILLAGE_RADIUS;
/** Friends still following the explorer reach home: they go to their posts. Only at home, inside the village. */
export function arriveHome(s: M.SaveState, at: { x: number; z: number }): FriendId[] {
  if (s.planet !== 'home' || !inVillage(at)) return [];
  const arrived = friendsOf(s).filter(f => !f.home); for (const f of arrived) f.home = true; return arrived.map(f => f.id);
}
export const following = (s: M.SaveState) => friendsOf(s).filter(f => !f.home);
export function setFriendPaused(s: M.SaveState, id: FriendId, paused: boolean) { const f = friendOf(s, id); if (!f || typeof paused !== 'boolean') return false; f.paused = paused; return true; }
export function setFriendAutoFeed(s: M.SaveState, id: FriendId, on: boolean) { const f = friendOf(s, id); if (!f || f.role !== 'farm' || typeof on !== 'boolean') return false; f.autoFeed = on; return true; }
/** The cook is on her break (the last hour of every four) unless asked to work. */
export const resting = (f: Friend | undefined, now = Date.now()) => f?.role === 'cook' && onBreak('cook', now, f.callUntil);
export function callFriend(s: M.SaveState, id: FriendId, now = Date.now()) { const f = friendOf(s, id); if (!f?.home || s.planet !== 'home') return false; f.paused = false; f.callUntil = now + CALL_MS; return true; }
export const working = (s: M.SaveState, f: Friend | undefined, now = Date.now()): f is Friend => !!f && f.home === true && !f.paused && s.planet === 'home' && !resting(f, now);

// ---- Jobs ----
export type FriendTask = { kind: 'harvest' | 'plant'; index: number } | { kind: 'collect' | 'feed'; uid: number };
export interface WorkResult { kind: FriendTask['kind']; raw: Record<string, number>; cooked: Record<string, number>; collected?: M.Collected[]; skipped?: true }
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const ripe = (p: M.Plot, now: number) => harvestable(p, now);
const UTC_DAY = 86_400_000;
/** Counts a job for the status line; harvests and collects also count toward growth, up to GROWTH_JOBS_PER_DAY a day. */
function tally(f: Friend, n: number, now: number, grows: boolean) {
  const day = Math.floor(now / UTC_DAY); if (f.day !== day) { f.day = day; f.done = 0; f.grew = 0; }
  f.done = (f.done ?? 0) + n;
  if (grows) { const k = Math.max(0, Math.min(n, GROWTH_JOBS_PER_DAY - (f.grew ?? 0))); f.grew = (f.grew ?? 0) + k; f.jobs = (f.jobs ?? 0) + k; }
  growUp(f, now);
}
/** Work done today, for the status line. */
export const doneToday = (f: Friend, now = Date.now()) => f.day === Math.floor(now / UTC_DAY) ? f.done ?? 0 : 0;

/** Beds the gardener (or the cook) would go to; `skip` is a bed another worker is already walking to, `held` the empty bed whose seed list the player has open (nobody plants it). */
function bedTask(s: M.SaveState, from: { x: number; z: number }, now: number, plant: boolean, skip?: number, held?: number): FriendTask | null {
  let best: FriendTask | null = null, bestD = Infinity, bestRipe = false;
  s.plots.forEach((p, i) => {
    if (i === skip) return;
    const r = ripe(p, now); if (!r && !(plant && !p.crop && i !== held && seedFor(s, i))) return;
    const d = dist(M.bedPosition(s, i), from);
    if (r && !bestRipe || r === bestRipe && d < bestD) { best = { kind: r ? 'harvest' : 'plant', index: i }; bestD = d; bestRipe = r; }
  });
  return best;
}
/** The farmer's feed for this animal (farm.ts autoFeedCrop: cheap crops, adults, worth it; bag or, at home, chest), always leaving the player one. */
const keepOne = (s: M.SaveState, a: M.Animal | undefined, now: number) => { const crop = a && M.autoFeedCrop(s, a, now); return crop && M.pantry(s, crop) > 1 ? crop : null; };
function animalTask(s: M.SaveState, from: { x: number; z: number }, now: number, feed: boolean): FriendTask | null {
  if (!M.penBuilt(s)) return null;
  let best: FriendTask | null = null, bestD = Infinity, ready = false;
  for (const a of M.farmOf(s).animals) {
    const r = M.productCount(a, now) > 0; if (!r && !(feed && keepOne(s, a, now))) continue;
    const d = dist(a.home ?? M.PEN, from);
    if (r && !ready || r === ready && d < bestD) { best = { kind: r ? 'collect' : 'feed', uid: a.uid }; bestD = d; ready = r; }
  }
  return best;
}
/** The friend's next job, nearest first (a waiting harvest or product before planting or feeding); null = idle at its post. */
export function nextFriendTask(s: M.SaveState, id: FriendId, from: { x: number; z: number }, now = Date.now(), skipBed?: number, heldBed?: number): FriendTask | null {
  const f = friendOf(s, id); if (!working(s, f, now)) return null;
  if (f.role === 'garden') return bedTask(s, from, now, true, skipBed, heldBed);
  if (f.role === 'farm') return animalTask(s, from, now, f.autoFeed === true);
  // The cook shops for the pot, not for the beds: a bed only once two are ripe (one trip for a basket, so she no
  // longer shadows the gardener bed by bed), farm products only when no farmer is working them.
  if (s.plots.filter(p => ripe(p, now)).length >= 2) { const bed = bedTask(s, from, now, false, skipBed); if (bed) return bed; }
  return working(s, friendOf(s, 'clover'), now) ? null : animalTask(s, from, now, false);
}

/** Cooks half of what the cook gathered (with the carried odd ones); returns what was cooked, the rest stays raw. */
export function cookHalf(s: M.SaveState, f: Friend, gathered: Record<string, number>): Record<string, number> {
  const cooked: Record<string, number> = {}; f.carry ??= {}; f.pot ??= {};
  if (!M.kitchenOpen(s)) return cooked; // a locked kitchen (Normal/Hard below level 14): she only gathers
  const add = (id: string, n: number) => { if (n > 0) cooked[id] = (cooked[id] ?? 0) + n; };
  for (const [id, n] of Object.entries(gathered)) {
    const dish = M.FARM_DISHES.some(d => id in d.materials), cookable = dish || Object.hasOwn(M.ITEMS, `cooked_${id}`);
    if (!cookable || n < 1) continue;
    const total = n + (f.carry[id] ?? 0), half = Math.floor(total / 2);
    if (total % 2) f.carry[id] = 1; else delete f.carry[id];
    if (!half) continue;
    if (!dish) { if (M.cook(s, id, half)) add(`cooked_${id}`, half); continue; }
    f.pot[id] = (f.pot[id] ?? 0) + half;
  }
  // The pot: pancakes when both are there, else omelettes and milkshakes (two of a kind). Its items wait in the bag;
  // if the player has used them meanwhile the dish cannot be made and that share is simply let go.
  for (const dish of ['pancake', 'omelette', 'milkshake']) {
    const need = M.FARM_DISHES.find(d => d.id === dish)!.materials as Record<string, number>;
    const pot = f.pot;
    while (Object.entries(need).every(([m, k]) => (pot[m] ?? 0) >= k)) {
      if (!M.cookDish(s, dish)) { for (const m of Object.keys(need)) delete pot[m]; break; }
      for (const [m, k] of Object.entries(need)) { pot[m] -= k; if (!pot[m]) delete pot[m]; }
      add(dish, 1);
    }
  }
  return cooked;
}

/** Does one job for a friend; null when it is not possible now (another worker got there first, nothing ripe...). */
export function friendWork(s: M.SaveState, id: FriendId, task: FriendTask, now = Date.now()): WorkResult | null {
  const f = friendOf(s, id); if (!working(s, f, now) || !task) return null;
  let collected: M.Collected[] | undefined; const raw: Record<string, number> = {}, got = (item: string) => { raw[item] = (raw[item] ?? 0) + 1; };
  if ('index' in task) {
    if (f.role === 'farm' || task.kind === 'plant' && f.role !== 'garden' || !Number.isSafeInteger(task.index)) return null;
    if (task.kind === 'harvest') { if (!harvestable(s.plots[task.index], now)) return null; const c = M.harvest(s, task.index, now); if (!c) return null; got(c); }
    else { if (s.plots[task.index]?.crop) return null; const c = seedFor(s, task.index); if (!c || !M.plant(s, task.index, c, now)) return null; }
  } else {
    if (f.role === 'garden' || task.kind === 'feed' && f.role !== 'farm' || !Number.isSafeInteger(task.uid)) return null;
    if (task.kind === 'collect') { collected = M.collectProducts(s, now, [task.uid]); if (!collected.length) return null; collected.forEach(c => got(c.item)); }
    else { const crop = f.autoFeed ? keepOne(s, M.farmOf(s).animals.find(a => a.uid === task.uid), now) : null; if (!crop || !M.feedAnimal(s, task.uid, now, crop)) return null; }
  }
  tally(f, 1, now, task.kind === 'harvest' || task.kind === 'collect');
  const cooked = f.role === 'cook' ? cookHalf(s, f, raw) : {};
  for (const [k, n] of Object.entries(cooked)) { const base = k.replace(/^cooked_/, ''); if (raw[base]) raw[base] = Math.max(0, raw[base] - n); }
  return { kind: task.kind, raw, cooked, ...(collected ? { collected } : {}) };
}

/**
 * Catch-up after time away, as the helper's: one round only — every ripe bed at most once, every animal at most once —
 * so a closed game never earns more than a single round of work. Order: gardener, farmer, then the cook takes what is
 * left. `cap` bounds each friend's jobs.
 */
export const FRIEND_CATCH_UP_CAP = M.STARTING_PLOTS + M.MAX_EXTRA_PLOTS;
export function friendsCatchUp(s: M.SaveState, now = Date.now(), cap = FRIEND_CATCH_UP_CAP) {
  const out: Partial<Record<FriendId, { jobs: number; cooked: number }>> = {};
  if (s.planet !== 'home') return out;
  for (const id of FRIEND_IDS) {
    const f = friendOf(s, id); if (f?.home) growUp(f, now); // days at home count even for a friend on a break
    if (!working(s, f, now)) continue;
    let jobs = 0, cooked = 0;
    const run = (task: FriendTask) => { if (jobs >= cap) return; const r = friendWork(s, id, task, now); if (r) { jobs++; cooked += Object.values(r.cooked).reduce((a, b) => a + b, 0); } };
    if (f.role !== 'farm') for (let i = 0; i < s.plots.length; i++) {
      if (ripe(s.plots[i], now)) run({ kind: 'harvest', index: i });
      if (f.role === 'garden' && !s.plots[i].crop) run({ kind: 'plant', index: i });
    }
    if (f.role !== 'garden' && M.penBuilt(s)) for (const a of [...M.farmOf(s).animals]) {
      if (M.productCount(a, now) > 0) run({ kind: 'collect', uid: a.uid });
      if (f.role === 'farm' && M.canFeed(a, now)) run({ kind: 'feed', uid: a.uid });
    }
    out[id] = { jobs, cooked };
  }
  return out;
}
