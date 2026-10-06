// Who gets what when the Colossus falls. Shared by the browser (offline) and the server (online rooms).
import * as M from './model.ts';
import { COLOSSUS_STATS, COLOSSUS_TYPE } from './colossus-content.ts';

export const COLOSSUS_PET = 'pet_colossus';
/**
 * The helpers: everyone whose last blow is at most `window` seconds old at the kill, plus the one who landed it.
 * Neighbours (AI explorers) help with damage but are never listed: `isBot` filters them out.
 */
export function colossusContributors(lastHits: ReadonlyMap<string, number>, killer: string | null, now: number, window: number = COLOSSUS_STATS.contributionWindow, isBot: (id: string) => boolean = () => false) {
  const ids = [...lastHits].filter(([id, at]) => !isBot(id) && now - at <= window * 1000).map(([id]) => id);
  if (killer && !isBot(killer) && !ids.includes(killer)) ids.push(killer);
  return ids;
}
/**
 * One explorer's share: the Colossus's EXP and its loot table (the horn crown at 15%, better with luck), and for the
 * final blow its little companion, banked straight into the bag. `bank` false leaves the loot for the ground (offline
 * drops). Returns the loot and the pet id when one was given.
 */
export function grantColossusReward(s: M.SaveState, lastHit: boolean, rng: () => number = Math.random, bank = true, bonus?: number): M.DefeatLoot {
  const loot = M.grantDefeat(s, COLOSSUS_TYPE, COLOSSUS_STATS.xp, true, rng, bank, bonus);
  if (lastHit && M.addItem(s, COLOSSUS_PET, 1)) loot.pet = COLOSSUS_PET;
  return loot;
}
