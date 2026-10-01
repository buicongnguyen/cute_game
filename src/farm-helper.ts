import * as M from './model.ts';
import { HELPER_COST } from './helper-state.ts';
import { newFarmHelper, type FarmHelperState } from './farm-helper-state.ts';

export { HELPER_COST };
/** Reading a visitor's farm or an old save never creates or purchases a helper. */
export const helperOf = (s: M.SaveState): FarmHelperState => s.farm?.helper ?? newFarmHelper();
export type BuyResult = 'bought' | 'owned' | 'away' | 'unbuilt' | 'energy';
export function buyFarmHelper(s: M.SaveState): BuyResult {
  if (helperOf(s).owned) return 'owned';
  if (s.planet !== 'home') return 'away';
  if (!s.farm?.built) return 'unbuilt';
  if (!Number.isSafeInteger(s.energy) || s.energy < HELPER_COST) return 'energy';
  s.energy -= HELPER_COST; s.farm.helper = { owned: true, paused: false, autoFeed: false };
  return 'bought';
}
export function setFarmHelperPaused(s: M.SaveState, paused: boolean) {
  if (s.planet !== 'home' || !s.farm?.built || !s.farm.helper?.owned || typeof paused !== 'boolean') return false;
  s.farm.helper.paused = paused; return true;
}
export function setFarmHelperAutoFeed(s: M.SaveState, autoFeed: boolean) {
  if (s.planet !== 'home' || !s.farm?.built || !s.farm.helper?.owned || typeof autoFeed !== 'boolean') return false;
  s.farm.helper.autoFeed = autoFeed; return true;
}
export function canWork(s: M.SaveState) { return s.planet === 'home' && s.farm?.built === true && s.farm.helper?.owned === true && !s.farm.helper.paused; }
export interface FarmHelperTask { kind: 'collect' | 'feed'; uid: number }
/** Ready products/meat have priority; otherwise use the nearest animal that can eat existing feed. */
export function nextTask(s: M.SaveState, from: { x: number; z: number }, now = Date.now()): FarmHelperTask | null {
  if (!canWork(s) || !Number.isFinite(from.x) || !Number.isFinite(from.z)) return null;
  let task: FarmHelperTask | null = null, nearest = Infinity, collecting = false;
  const feed = helperOf(s).autoFeed && M.feedCrop(s) !== null;
  for (const animal of s.farm.animals) {
    const count = M.productCount(animal, now), ready = count > 0;
    // Do not stall forever on an overflowing stack while another animal can be tended.
    if (ready ? !Number.isSafeInteger((s.bag[M.productFor(animal, now)] ?? 0) + count) : !feed || !M.canFeed(animal, now)) continue;
    const home = animal.home ?? M.PEN, distance = Math.hypot(home.x - from.x, home.z - from.z);
    if (ready && !collecting || ready === collecting && distance < nearest) {
      task = { kind: ready ? 'collect' : 'feed', uid: animal.uid }; nearest = distance; collecting = ready;
    }
  }
  return task;
}
/** All grants use the same inventory, stock, aging and XP rules as manual collection. */
export function helperCollect(s: M.SaveState, uid: number, now = Date.now()): M.Collected[] {
  return canWork(s) && Number.isSafeInteger(uid) && uid > 0 ? M.collectProducts(s, now, [uid]) : [];
}
export function helperFeed(s: M.SaveState, uid: number, now = Date.now()): boolean {
  return canWork(s) && helperOf(s).autoFeed && Number.isSafeInteger(uid) && uid > 0 && M.feedAnimal(s, uid, now) !== null;
}
export const FARM_HELPER_CATCH_UP_CAP = M.MAX_ANIMALS_PER_KIND * 4 + 1;
/** Collect only stock already waiting, once per animal. Never simulate missed cycles or replace livestock. */
export function catchUp(s: M.SaveState, now = Date.now(), cap = FARM_HELPER_CATCH_UP_CAP): { collected: M.Collected[]; fed: number[] } {
  const collected: M.Collected[] = [], fed: number[] = [];
  if (!canWork(s) || !Number.isSafeInteger(cap) || cap < 0) return { collected, fed };
  const uids = [...new Set(s.farm.animals.map(a => a.uid))].slice(0, Math.min(cap, FARM_HELPER_CATCH_UP_CAP));
  for (const uid of uids) collected.push(...helperCollect(s, uid, now));
  if (helperOf(s).autoFeed) for (const uid of uids) if (helperFeed(s, uid, now)) fed.push(uid);
  return { collected, fed };
}
