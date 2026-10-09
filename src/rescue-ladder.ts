/**
 * The squad's weak → strong gear ladder (docs/RESCUE-CALL-PLAN.md §4 "Growing stronger inside the mission"). Pure.
 *
 * Every list is computed from the game's own item data (content.ts ITEMS: slot, stats, weapon), so new gear slots in
 * by itself:
 * - a weapon's branch comes from its kind: swords for fighters, magic shots (bubble, ice, fire) for support, every other
 *   shot for ranged; fishing rods and the hunting harpoon are tools, not weapons;
 * - an outfit's branch from its stat shape: regeneration → support, speed or crit → ranged, plain defence/health → fighter;
 * - a disguise's branch the same way: regeneration or no attack → support, defence or big health → fighter, else ranged;
 * - each list is ordered by power: attack + 0.8 × defence + 0.1 × health (then price, then id, so the order is stable).
 *
 * Steps (cumulative): 0 plain clothes and a punch · 1 the branch's weakest weapon · 2 its weakest outfit · 3 the middle
 * weapon · 4 a disguise (one skill) · 5 the strongest outfit (armour) and the second skill · 6 the strongest weapon and
 * the ultimate. Disguises are handed out so that no friend wears the hero's, and no two friends share one.
 *
 * Mission gear is borrowed: none of this touches the save (rescue.ts shows it through the squad's poses only).
 */
import { ITEMS, DISGUISES } from './content.ts';
import { SQUAD_BASE, LADDER_STEPS, type SquadRole } from './rescue-content.ts';

export interface LadderGear { weapon?: string; outfit?: string; disguise?: string }
type Stats = { atk?: number; def?: number; hp?: number; regen?: number; speed?: number; crit?: number };
const statsOf = (id: string): Stats => ((ITEMS[id] as { stats?: Stats } | undefined)?.stats ?? {});
const priceOf = (id: string) => (ITEMS[id] as { price?: number } | undefined)?.price ?? 0;
/** One number for "how strong": attack counts most, then defence, then health. */
export function gearScore(id: string) { const s = statsOf(id); return (s.atk ?? 0) + (s.def ?? 0) * .8 + (s.hp ?? 0) * .1; }
const byPower = (a: string, b: string) => gearScore(a) - gearScore(b) || priceOf(a) - priceOf(b) || (a < b ? -1 : a > b ? 1 : 0);
const SUPPORT_SHOTS = new Set(['bubble', 'ice', 'fireball']);

export function weaponRole(id: string): SquadRole | null {
  const w = (ITEMS[id] as { slot?: string; weapon?: { kind: string; shot?: string } } | undefined); if (!w || w.slot !== 'weapon' || !w.weapon) return null;
  if (w.weapon.kind === 'sword') return 'fighter';
  if (w.weapon.kind !== 'gun' || w.weapon.shot === 'harpoon') return null;
  return SUPPORT_SHOTS.has(w.weapon.shot ?? '') ? 'support' : 'ranged';
}
export function outfitRole(id: string): SquadRole | null {
  if ((ITEMS[id] as { slot?: string } | undefined)?.slot !== 'outfit') return null;
  const s = statsOf(id); return (s.regen ?? 0) > 0 ? 'support' : (s.speed ?? 0) > 0 || (s.crit ?? 0) > 0 ? 'ranged' : 'fighter';
}
export function disguiseRole(id: string): SquadRole | null {
  if ((ITEMS[id] as { slot?: string } | undefined)?.slot !== 'disguise' || !DISGUISES[id]) return null;
  const s = statsOf(id); return (s.regen ?? 0) > 0 || !(s.atk ?? 0) ? 'support' : (s.def ?? 0) > 0 || (s.hp ?? 0) >= 90 ? 'fighter' : 'ranged';
}
const cache = new Map<string, string[]>();
function list(kind: 'weapon' | 'outfit' | 'disguise', role: SquadRole) {
  const key = kind + role; let out = cache.get(key); if (out) return out;
  const test = kind === 'weapon' ? weaponRole : kind === 'outfit' ? outfitRole : disguiseRole;
  out = Object.keys(ITEMS).filter(id => test(id) === role).sort(byPower); cache.set(key, out); return out;
}
/** Weak → strong, for one branch. */
export const weaponsFor = (role: SquadRole) => list('weapon', role);
export const outfitsFor = (role: SquadRole) => list('outfit', role);
export const disguisesFor = (role: SquadRole) => list('disguise', role);
/** Every disguise, strongest first (the fallback when a branch has run out). */
const allDisguises = () => { const key = 'all-dz'; let out = cache.get(key); if (!out) { out = Object.keys(ITEMS).filter(id => disguiseRole(id)).sort(byPower).reverse(); cache.set(key, out); } return out; };

/**
 * One disguise per squad member: the strongest of its branch that nobody else has (never the hero's own), else the
 * strongest unused one of any branch.
 */
export function assignDisguises(roles: readonly SquadRole[], heroDisguise?: string | null): string[] {
  const used = new Set<string>(heroDisguise ? [heroDisguise] : []), out: string[] = [];
  for (const role of roles) {
    const pick = [...disguisesFor(role)].reverse().find(id => !used.has(id)) ?? allDisguises().find(id => !used.has(id)) ?? '';
    used.add(pick); out.push(pick);
  }
  return out;
}
/** The gear worn at each step 0..6 of one member's ladder (cumulative). */
export function ladderFor(role: SquadRole, disguise: string): LadderGear[] {
  const w = weaponsFor(role), o = outfitsFor(role);
  const weak = w[0], mid = w[Math.floor((w.length - 1) / 2)], top = w[w.length - 1], work = o[0], armour = o[o.length - 1];
  const steps: LadderGear[] = [{}];
  steps.push({ weapon: weak });
  steps.push({ weapon: weak, outfit: work });
  steps.push({ weapon: mid, outfit: work });
  steps.push({ weapon: mid, outfit: work, disguise });
  steps.push({ weapon: mid, outfit: armour, disguise });
  steps.push({ weapon: top, outfit: armour, disguise });
  return steps.slice(0, LADDER_STEPS + 1);
}
export interface MemberStats { hp: number; atk: number; def: number; range: number; rate: number; air: boolean; speed: number }
/** A member's mission numbers from the gear it wears (step 0: SQUAD_BASE's punch). */
export function memberStats(gear: LadderGear): MemberStats {
  let atk = SQUAD_BASE.atk, hp = SQUAD_BASE.hp, def = SQUAD_BASE.def;
  for (const id of [gear.weapon, gear.outfit, gear.disguise]) { if (!id) continue; const s = statsOf(id); atk += (s.atk ?? 0) * .9; def += s.def ?? 0; hp += (s.hp ?? 0) + (s.def ?? 0) * 1.5; }
  const weapon = gear.weapon ? (ITEMS[gear.weapon] as { weapon?: { kind: string; range?: number; cd?: number } }).weapon : undefined;
  let range: number = SQUAD_BASE.range, rate: number = SQUAD_BASE.rate, air = false;
  if (weapon?.kind === 'sword') { range = Math.max(1.6, (weapon.range ?? 2.3) * .8); rate = Math.min(2.2, Math.max(.7, .75 / (weapon.cd ?? .6))); }
  else if (weapon?.kind === 'gun') { range = Math.min(7.5, Math.max(4.5, (weapon.range ?? 8) * .6)); rate = Math.min(2.2, Math.max(.7, .75 / (weapon.cd ?? .5))); air = true; }
  if (gear.disguise) rate *= 1.1;
  return { hp: Math.round(hp), atk: Math.round(atk * 10) / 10, def, range: Math.round(range * 100) / 100, rate: Math.round(rate * 100) / 100, air, speed: SQUAD_BASE.speed };
}
/** Spreads roles over a squad: helpers keep theirs, neighbours fill whichever role has the fewest members so far. */
export function spreadRoles(fixed: ReadonlyArray<SquadRole | null>): SquadRole[] {
  const count: Record<SquadRole, number> = { fighter: 0, ranged: 0, support: 0 };
  for (const r of fixed) if (r) count[r]++;
  return fixed.map(r => { if (r) return r; const pick = (['fighter', 'ranged', 'support'] as SquadRole[]).sort((a, b) => count[a] - count[b])[0]; count[pick]++; return pick; });
}
/** Which branch each rescued helper climbs. */
export const HELPER_ROLES: Record<string, SquadRole> = { clover: 'fighter', sprout: 'ranged', pepper: 'support' };
