import * as M from './model.ts';

/**
 * Where the workers' harvest goes (user report, round 13): while the explorer is in the wilds (outside the home safe
 * circle) or on another planet, whatever the garden robot, the pen robot or the friends harvest, collect or cook is
 * stored in the house chest, not the explorer's bag; catch-up work done while you were away goes there too. Inside the
 * circle it keeps going to the bag, like the player's own harvest: you are right there, and the bag is what the
 * market, kitchen and planting read (sending it to the chest then would only add a trip to the chest).
 *
 * The rule runs in actions.ts (shared by the offline client and the server): the work functions stay exactly as they
 * are (XP, quests, counters, stock and growth), and afterwards every item the bag gained is moved to the chest. The
 * client says whether the explorer is away; online, action-service.mjs overwrites that with the server's own pose.
 */
export const HOME_SAFE_R = 18;
/** Work done next to the beds/pen while the explorer may be anywhere: the payload's `away` decides. */
export const WORK_ACTIONS: ReadonlySet<string> = new Set(['helperHarvest', 'farmHelperCollect', 'friendWork']);
/** Work done for time away (game closed, another planet): always to the chest. */
export const CATCH_UP_ACTIONS: ReadonlySet<string> = new Set(['helperCatchUp', 'farmHelperCatchUp', 'friendsCatchUp']);
export const explorerAway = (planet: string, x: number, z: number) => planet !== 'home' || !(Math.hypot(x, z) < HOME_SAFE_R);
export const deliversToChest = (type: string, payload: Record<string, unknown>) => CATCH_UP_ACTIONS.has(type) || WORK_ACTIONS.has(type) && payload.away === true;

/**
 * Moves what the bag gained since `before` into the chest and adds it to the "stored while you were out" note.
 * Items the cook's pot is holding stay in the bag (friends.ts cookHalf: the pot's items wait there for their partner).
 * The chest has no slot limit; a stack that would pass the safe-integer limit stays in the bag (returned as `kept`).
 */
export function storeGains(s: M.SaveState, before: M.Inventory) {
  const stored: M.Inventory = {}, kept: M.Inventory = {}, pot: Record<string, number> = {};
  for (const f of s.friends ?? []) for (const [id, n] of Object.entries(f.pot ?? {})) pot[id] = (pot[id] ?? 0) + n;
  for (const [id, count] of Object.entries(s.bag)) { const now = count ?? 0;
    let gain = now - (before[id] ?? 0); gain -= Math.min(gain, Math.max(0, pot[id] ?? 0)); if (!(gain > 0)) continue;
    if (!Number.isSafeInteger((s.chest[id] ?? 0) + gain) || !Number.isSafeInteger((s.awayStore?.[id] ?? 0) + gain)) { kept[id] = gain; continue; }
    s.bag[id] = now - gain; if (!s.bag[id]) delete s.bag[id];
    s.chest[id] = (s.chest[id] ?? 0) + gain; stored[id] = gain;
    (s.awayStore ??= {})[id] = (s.awayStore[id] ?? 0) + gain;
  }
  return { stored, kept };
}
/** The note shown on coming home; reading it clears it ('ackStored'). */
export function takeStored(s: M.SaveState): M.Inventory { const out = s.awayStore ?? {}; delete s.awayStore; return out; }
/** "12 Carrot, 3 Egg and 2 more" (largest first), already translated by the caller's t(). */
export function storedLine(items: M.Inventory, name: (id: string) => string, max = 4) {
  const list = Object.entries(items).filter((e): e is [string, number] => (e[1] ?? 0) > 0).sort((a, b) => b[1] - a[1]);
  const shown = list.slice(0, max).map(([id, n]) => `${n} ${name(id)}`).join(', ');
  return { text: shown, more: Math.max(0, list.length - max), total: list.reduce((a, [, n]) => a + n, 0) };
}
