/**
 * What beating an elite pays (elite-roles.ts eliteReward), for the browser (main.ts grantDefeat) and the server
 * (combat-authority.mjs kill) alike: an elite is one ordinary kill of its species (quests, bounties, kill totals, its loot)
 * with its own EXP and one extra loot roll at the role's chance; a splitter's child pays its small EXP and nothing else.
 */
import * as M from './model.ts';
import { eliteReward, type EliteTag } from './elite-roles.ts';
import { rewardScale } from './difficulty.ts';

export function eliteDefeat(s: M.SaveState, type: string, xp: number, tag: EliteTag, rng: () => number = Math.random, bank = false, bonus: number = rewardScale(s)): M.DefeatLoot {
  if (!eliteReward(tag).counts) { M.gainXp(s, xp, Date.now(), bonus); const none: M.DefeatLoot = []; return none; }
  const loot = M.grantDefeat(s, type, xp, false, rng, bank, bonus), extra = eliteReward(tag).extraLoot;
  if (extra > 0 && rng() < extra) for (const item of M.rollLoot(type, M.activeStats(s).luck, rng, bonus)) { if (bank) M.stowItem(s, item.id as M.ItemId, item.count); loot.push(item); }
  return loot;
}
