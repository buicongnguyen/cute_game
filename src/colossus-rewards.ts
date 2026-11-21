// Who gets what when the Colossus falls. Shared by the browser (offline) and the server (online rooms).
import * as M from './model.ts';
import { COLOSSUS_STATS, COLOSSUS_TYPE, ROAR_BONUS, roarBonusCount } from './colossus-content.ts';

/** A soothed kill (solo, the gentle fight) pays this share of the Colossus's EXP: 30,000 -> 6,000... */
export const SOOTHED_XP = .2;
/** ...no roll for the horn crown, and these instead. */
export const SOOTHED_GIFT: readonly [string, number] = ['seed_fire', 2];
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
 * drops). Returns the loot and the pet id when one was given. `lid` 'soothed' (solo, the gentle fight): a fifth of the EXP,
 * the same loot without the horn-crown roll, and 2 fire seeds; the final blow still brings the companion. The server never
 * passes it: a shared world's Colossus is always wild.
 */
export function grantColossusReward(s: M.SaveState, lastHit: boolean, rng: () => number = Math.random, bank = true, bonus?: number, lid: 'wild' | 'soothed' = 'wild'): M.DefeatLoot {
  // Soothed: rolled unbanked, so the crown is left out before anything reaches the bag. Its roll is still drawn (and
  // dropped): the other rolls fall as they do for a wild kill with the same dice.
  const soothed = lid === 'soothed', loot = M.grantDefeat(s, COLOSSUS_TYPE, COLOSSUS_STATS.xp * (soothed ? SOOTHED_XP : 1), true, rng, bank && !soothed, bonus);
  if (soothed) {
    const crown = loot.findIndex(item => item.id === 'hat_colossus'); if (crown >= 0) loot.splice(crown, 1);
    loot.push({ id: SOOTHED_GIFT[0], count: SOOTHED_GIFT[1] });
    if (bank) for (const item of loot) M.stowItem(s, item.id, item.count);
  }
  M.recordEvent(s, 'colossus');
  if (lastHit && M.stowItem(s, COLOSSUS_PET, 1)) loot.pet = COLOSSUS_PET;
  return loot;
}

/**
 * Roar hour bonus for the offline/solo kill only (colossus.ts defeated()); the online server never calls this, so online
 * the roar hour is a banner only. Adds 25% of the Colossus's EXP and grows every loot stack by roarBonusCount (mutates `loot`).
 * Returns the extra EXP granted.
 */
export function grantRoarBonus(s: M.SaveState, loot: { id: string; count: number }[], rng: () => number = Math.random, paid: number = COLOSSUS_STATS.xp) {
  const extra = paid * ROAR_BONUS; // a quarter of what the kill paid: 7,500 on a full kill, 1,500 on a soothed one
  M.gainXp(s, extra);
  for (const item of loot) item.count += roarBonusCount(item.count, rng);
  return extra;
}
