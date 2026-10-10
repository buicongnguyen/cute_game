import * as M from './model.ts';
import { HELPER_COST, CALL_MS, onBreak, newHelper, remember, type HelperState } from './helper-state.ts';
import { asHelper } from './progression.ts';
import { autoPlanting, bedChoice } from './auto-plant.ts';

/**
 * The garden helper's rules, pure and testable (the view, helper-view.ts, only walks and poses).
 *
 * - Bought once for ϟ1000 from the garden bed panel; it lives at home.
 * - Harvest goes through M.harvest, exactly as the player's own: the crop goes to the bag, the crop's XP is earned and
 *   the harvest counts for quests. XP applies because the helper only saves the walk: every crop it gathers is one the
 *   player planted (or it replanted from the player's own seeds), so withholding XP would make buying it a penalty.
 * - Replanting uses only what is in the bag: crops without a seed item are free (as for the player); seed crops take a
 *   seed from the bag. It never buys seeds.
 * - Which crop: the chosen seed in the settings, or ("same as before") the crop last planted in that bed, otherwise
 *   the cheapest crop the player can plant (free crops first, then the cheapest seed; ties go to the higher-level crop).
 * - It plants only while auto-planting is on, and a bed the player planted by hand keeps the player's crop (fruit
 *   trees too): auto-plant.ts has that rule, shared with Sprout.
 */
export { HELPER_COST };
export const helperOf = (s: M.SaveState): HelperState => s.helper ?? newHelper();
/** A bed's identity for "last planted": its position, which does not shift when another bed is stored. */
export const bedKey = (s: M.SaveState, i: number) => { const p = M.bedPosition(s, i); return `${p.x.toFixed(2)},${p.z.toFixed(2)}`; };

/** Bolt is on his daily rest (unless asked to work). */
export const robotResting = (s: M.SaveState, now = Date.now()) => onBreak('robot', now, s.helper?.callUntil);
/** "Ask Bolt to work now" during his rest: 30 minutes of work. A Bolt the player switched off stays off (that switch also means "I plant by hand", auto-plant.ts). */
export function callHelper(s: M.SaveState, now = Date.now()) { if (!s.helper?.owned || s.helper.paused || s.planet !== 'home') return false; s.helper.callUntil = now + CALL_MS; return true; }
export type BuyResult = 'owned' | 'away' | 'energy' | 'bought';
export function buyHelper(s: M.SaveState): BuyResult {
  if (s.helper?.owned) return 'owned';
  if (s.planet !== 'home') return 'away';
  if (s.energy < HELPER_COST) return 'energy';
  s.energy -= HELPER_COST; s.helper = { ...helperOf(s), owned: true, paused: false };
  rememberPlantings(s); return 'bought';
}
export function setHelperPaused(s: M.SaveState, paused: boolean) { if (!s.helper?.owned) return false; s.helper.paused = paused; return true; }
export function setHelperSeed(s: M.SaveState, seed: 'same' | M.CropId) {
  if (!s.helper?.owned || seed !== 'same' && !Object.hasOwn(M.CROPS, seed)) return false;
  s.helper.seed = seed; return true;
}

/** Records what grows in each bed now, so "same as before" follows the player's own choices too. */
export function rememberPlantings(s: M.SaveState) {
  const h = s.helper; if (!h?.owned) return;
  s.plots.forEach((p, i) => { if (p.crop) remember(h, bedKey(s, i), p.crop); });
}

/** True when the crop can be planted now from what the player has (level reached, seed in the bag if it needs one). */
export function canPlant(s: M.SaveState, crop: M.CropId) {
  const c = Object.hasOwn(M.CROPS, crop) ? M.CROPS[crop] : undefined;
  return !!c && M.cropLevel(s, crop) <= s.level && (!c.seed || (s.bag[c.seed] ?? 0) > 0);
}
/** What a seed costs to use: nothing for crops without a seed item, else the seed's shop price or sell value. */
export const seedCost = (crop: M.CropId) => { const seed = M.CROPS[crop]?.seed; if (!seed) return 0; const item = M.ITEMS[seed]; return item?.price ?? item?.sell ?? 0; };
/** Crops longer than this are never an automatic pick (fruit trees, slow rare crops): only the player's own choice. */
export const FALLBACK_MAX_MS = 30 * 60_000;
const rate = (id: M.CropId) => ((M.ITEMS[id]?.sell ?? 0) - seedCost(id)) / M.CROPS[id].duration; // a used-up seed counts against the crop
/** The automatic pick for a bed with no remembered crop (robot and Sprout): the best energy per minute (sell less seed) among quick crops, cheapest seed on ties. */
export function cheapestSeed(s: M.SaveState): M.CropId | null {
  const options = Object.keys(M.CROPS).filter(id => M.CROPS[id].duration <= FALLBACK_MAX_MS && canPlant(s, id));
  options.sort((a, b) => rate(b) - rate(a) || seedCost(a) - seedCost(b) || (a < b ? -1 : 1));
  return options[0] ?? null;
}
/**
 * The crop a helper (Bolt or Sprout) would plant in bed `i` with auto-planting on, or null when the bed waits. A bed
 * the player planted by hand keeps that crop and gets nothing else (auto-plant.ts); otherwise Bolt's chosen seed (out
 * of it: it waits rather than guessing), else "same as before".
 */
export function cropFor(s: M.SaveState, i: number): M.CropId | null {
  const own = bedChoice(s, i); if (own) return canPlant(s, own) ? own : null;
  const h = helperOf(s);
  if (h.seed !== 'same') return canPlant(s, h.seed) ? h.seed : null;
  const last = h.last[bedKey(s, i)];
  return last && canPlant(s, last) ? last : cheapestSeed(s);
}
/** What a helper plants in bed `i` now: nothing at all while auto-planting is off (every planting path asks here). */
export function seedFor(s: M.SaveState, i: number): M.CropId | null { return autoPlanting(s) ? cropFor(s, i) : null; }

/** The longest a helper leaves a fully grown bed standing, so the garden is seen at its best. The player may harvest any time. */
export const GROWN_HOLD_MS = 5 * 60_000;
/** The shortest hold: a quick crop is still seen ripe for a moment. */
export const GROWN_HOLD_MIN_MS = 20_000;
/** How long a helper waits after a crop of this growing time (ms) is ripe: a quarter of it, between 20 s and 5 min, so quick crops on high-level beds cycle in 20 to 45 s. */
export const growHold = (durationMs: number) => Math.min(GROWN_HOLD_MS, Math.max(GROWN_HOLD_MIN_MS, durationMs / 4));
/** True once the crop in this bed has been ripe for its hold; the one rule for the robot, Sprout and every catch-up. */
export const harvestable = (p: M.Plot, now: number) => { if (!p.crop || M.cropProgress(p, now) < 1) return false; const d = M.cropDuration(p); return now - (p.plantedAt + d) >= growHold(d); };

export interface HelperTask { kind: 'harvest' | 'plant'; index: number; crop?: M.CropId }
/** The next job: the nearest ripe bed, else the nearest empty bed it has a seed for; null = nothing to do (idle). `held` is the empty bed whose seed list the player has open: it is the player's until the panel closes. */
export function nextTask(s: M.SaveState, from: { x: number; z: number }, now = Date.now(), held?: number): HelperTask | null {
  const h = s.helper; if (!h?.owned || h.paused || robotResting(s, now)) return null;
  let best: HelperTask | null = null, bestD = Infinity, bestRipe = false;
  s.plots.forEach((p, i) => {
    // A full backpack leaves the crop standing (storage-slots.ts): no trip that the bag would refuse.
    const ripe = harvestable(p, now) && M.canAddItem(s, p.crop!), crop = !p.crop && i !== held ? seedFor(s, i) : null;
    if (!ripe && !crop) return;
    const b = M.bedPosition(s, i), d = Math.hypot(b.x - from.x, b.z - from.z);
    // Ripe beds come first: a crop left standing is worth more than an empty bed.
    if (ripe && !bestRipe || ripe === bestRipe && d < bestD) { best = ripe ? { kind: 'harvest', index: i } : { kind: 'plant', index: i, crop: crop! }; bestD = d; bestRipe = ripe; }
  });
  return best;
}

/** Harvest bed `i` as the player would (bag, XP, quests); remembers the crop for "same as before". */
export function helperHarvest(s: M.SaveState, i: number, now = Date.now()) {
  if (!s.helper?.owned || robotResting(s, now)) return null;
  if (!s.plots[i] || !harvestable(s.plots[i], now)) return null;
  const crop = s.plots[i].crop; if (crop) remember(s.helper, bedKey(s, i), crop);
  return asHelper(() => M.harvest(s, i, now)); // the robot's harvests never win the player's timed challenge
}
/** Plant bed `i` with the helper's choice; false when it is not empty or there is nothing to plant. */
export function helperPlant(s: M.SaveState, i: number, now = Date.now()) {
  if (!s.helper?.owned || robotResting(s, now) || s.plots[i]?.crop) return null;
  const crop = seedFor(s, i); if (!crop || !M.plant(s, i, crop, now)) return null;
  remember(s.helper, bedKey(s, i), crop); return crop;
}

/**
 * Catch-up after time away (the game was closed, or the explorer was on another planet): every bed that ripened
 * meanwhile is harvested and replanted once, now. One cycle per bed at most (so at most one crop per bed, 24 beds at
 * most): the beds never sit idle while you are gone, but leaving the game closed for a day is not worth more than a
 * single round of tending. Crops replanted now grow from now, so nothing ripens "in the past".
 */
export const HELPER_CATCH_UP_CAP = M.STARTING_PLOTS + M.MAX_EXTRA_PLOTS;
export function catchUp(s: M.SaveState, now = Date.now(), cap = HELPER_CATCH_UP_CAP) {
  const harvested: M.CropId[] = [], planted: M.CropId[] = [];
  if (!s.helper?.owned || s.helper.paused || s.planet !== 'home' || robotResting(s, now)) return { harvested, planted }; // the garden is on the home planet
  rememberPlantings(s);
  for (let i = 0; i < s.plots.length && harvested.length + planted.length < cap * 2; i++) {
    const p = s.plots[i];
    if (harvestable(p, now)) { if (harvested.length >= cap) continue; const c = helperHarvest(s, i, now); if (c) harvested.push(c); else continue; }
    if (!s.plots[i].crop && planted.length < cap) { const c = helperPlant(s, i, now); if (c) planted.push(c); }
  }
  return { harvested, planted };
}
