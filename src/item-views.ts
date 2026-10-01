import { t } from './i18n.ts';
import * as M from './model.ts';
import { UPGRADES } from './content.ts';

/**
 * Data behind the market's "Sell all produce & fish" button and the wishing crystal's stat cards, kept out of main.ts so the
 * numbers are testable. The reference's sell dialog sells every crop, fish and junk stack in one tap (bundle @939401); its
 * crystal shows one card per stat with "Level n" and "Now: <value> • <gain>" (openUpgrade, table Nf).
 */
export const PRODUCE_TYPES = ['crop', 'fish', 'junk'] as const;

/** Loose (unequipped) crop, fish and junk stacks that sell, with the energy they bring in total. */
export function produceLots(s: M.SaveState) {
  const lots = (Object.keys(s.bag) as M.ItemId[])
    .filter(id => (PRODUCE_TYPES as readonly string[]).includes(M.ITEMS[id]?.type) && M.ITEMS[id].sell > 0)
    .map(id => ({ id, n: M.looseQuantity(s, id) })).filter(l => l.n > 0);
  return { lots, total: lots.reduce((sum, l) => sum + l.n * M.ITEMS[l.id].sell, 0) };
}

/** Sells every produce stack; returns the energy gained (0 when there was nothing to sell). */
export function sellProduce(s: M.SaveState) {
  let gained = 0;
  for (const { id, n } of produceLots(s).lots) gained += M.sell(s, id, n);
  return gained;
}

/** Defence as the reference shows it: "N (−X% damage)", X = def / (def + 60), the same curve the hit formula uses. */
export const defenseText = (def: number) => t('{defense} (−{percent}% damage)', { defense: def, percent: Math.round(def / (def + 60) * 100) });

export type UpgradeKind = keyof typeof UPGRADES;
export interface UpgradeCard { kind: UpgradeKind; icon: string; name: string; level: number; now: string; gain: string; cost: number; max: boolean; affordable: boolean }

const GAIN: Record<UpgradeKind, string> = { health: '+25 max HP', attack: '+3 attack', defense: '+4 defense', crit: '+2.5% crit' };
const rank = (s: M.SaveState, kind: UpgradeKind) => kind === 'health' ? s.healthUp : kind === 'attack' ? s.attackUp : kind === 'defense' ? s.defenseUp : s.critUp;

/** One card per stat: icon, name, level, current value, the gain per level, and the price (or MAX at the cap). */
export function upgradeCards(s: M.SaveState): UpgradeCard[] {
  const stats = M.activeStats(s);
  const now: Record<UpgradeKind, string> = { health: `${Math.round(stats.maxHp)}`, attack: stats.attack.toFixed(1), defense: defenseText(stats.defense), crit: `${Math.round(stats.critChance * 100)}%` };
  return (Object.keys(UPGRADES) as UpgradeKind[]).map(kind => {
    const def = UPGRADES[kind], level = rank(s, kind), max = 'max' in def && level >= def.max, cost = M.upgradeCost(s, kind);
    return { kind, icon: def.icon, name: t(def.name), level, now: now[kind], gain: t(GAIN[kind]), cost, max, affordable: !max && s.energy >= cost };
  });
}
