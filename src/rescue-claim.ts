/**
 * Rescue Call rewards through the shared action rules (actions.ts 'rescueClaim'): offline they run in the browser and
 * online the server applies the same function with its own clock. A claim names the run, the mission, the waves held,
 * whether it was won and how long it took; it is checked against the clock (no wave is cleared faster than
 * RESCUE_REWARD.minSecondsPerWave, two claims are at least the claimed run's length apart), each run pays once, waves
 * pay EXP and energy up to a daily cap, and the first five wins a day pay in full with the friend's thank-you gift.
 * Gifts go to the bag, or the chest when the bag is full (model.ts stowItem: a reward that must not be lost).
 */
import * as Game from './model.ts';
import { PLANETS } from './content.ts';
import { MISSIONS, RESCUE_REWARD, type MissionId } from './rescue-content.ts';
import type { RescueSave } from './rescue-save.ts';

/** Rescue days turn at midnight in Vietnam (UTC+7), like the vault's and Flag Rush's. */
export const rescueDay = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
const today = (s: { rescue?: RescueSave }, now: number) => (s.rescue && s.rescue.day === rescueDay(now) ? s.rescue : null);
/** Winning missions that still pay in full today. */
export function fullWinsLeft(s: { rescue?: RescueSave }, now: number) { return Math.max(0, RESCUE_REWARD.winsPerDay - (today(s, now)?.wins ?? 0)); }
/** Waves that still pay EXP and energy today. */
export function wavesLeft(s: { rescue?: RescueSave }, now: number) { return Math.max(0, RESCUE_REWARD.wavesPerDay - (today(s, now)?.waves ?? 0)); }
export const isMission = (id: unknown): id is MissionId => typeof id === 'string' && Object.hasOwn(MISSIONS, id);
/** What a claim would pay before the daily caps: EXP and energy for `waves` waves of `mission` (and the win bonus). */
export function wavePay(mission: MissionId, waves: number) {
  const L = MISSIONS[mission].level, R = RESCUE_REWARD;
  return { xp: waves * (R.xpPerWave.base + R.xpPerWave.perLevel * L), energy: waves * (R.energyPerWave.base + R.energyPerWave.perLevel * L) };
}
export interface RescueClaim { runId: string; mission: string; waves: number; won: boolean; seconds: number }
export interface RescueClaimResult { xp: number; energy: number; gift: Array<{ id: string; count: number; where: 'bag' | 'chest' | false }>; badge: boolean; full: boolean; winsLeft: number; wavesLeft: number; level: number }
export function claimRescue(s: Game.SaveState, c: RescueClaim, now: number, random: () => number): RescueClaimResult | false {
  if (!/^[\w-]{4,64}$/.test(c.runId) || !isMission(c.mission) || typeof c.won !== 'boolean') return false;
  if (!Number.isInteger(c.waves) || !Number.isInteger(c.seconds) || c.waves < 0 || c.seconds < 0) return false;
  const mission = MISSIONS[c.mission], total = mission.waves.length;
  if (c.waves > total || c.won !== (c.waves === total)) return false;
  // The planet must be open to the explorer: its landing level.
  if (s.level < PLANETS[mission.planet].level) return false;
  if (c.seconds < c.waves * RESCUE_REWARD.minSecondsPerWave || c.seconds > 3600) return false;
  const day = rescueDay(now), d: RescueSave = s.rescue ?? { day, waves: 0, wins: 0, played: 0, won: 0, lastAt: 0, best: {}, heroes: [], claimed: [] };
  if (d.claimed.includes(c.runId)) return false;
  if (d.lastAt && now - d.lastAt < c.seconds * 1000 * .9) return false;
  if (d.day !== day) { d.day = day; d.waves = 0; d.wins = 0; }
  d.played++; d.lastAt = now; d.claimed = [...d.claimed, c.runId].slice(-12);
  d.best = { ...d.best, [c.mission]: Math.max(d.best[c.mission] ?? 0, c.waves) };
  const paidWaves = Math.min(c.waves, Math.max(0, RESCUE_REWARD.wavesPerDay - d.waves)); d.waves += paidWaves;
  let { xp, energy } = wavePay(c.mission, paidWaves);
  const gift: RescueClaimResult['gift'] = []; let full = false, badge = false;
  if (c.won) {
    d.won++;
    full = d.wins < RESCUE_REWARD.winsPerDay;
    if (full) {
      d.wins++; xp += RESCUE_REWARD.winXp;
      const give = (id: string, count: number) => { if (!Object.hasOwn(Game.ITEMS, id)) return; gift.push({ id, count, where: Game.stowItem(s, id, count) }); };
      give(mission.gift.crop, mission.gift.crops); give(mission.gift.decor, 1);
      if (random() < RESCUE_REWARD.rareChance) give(mission.gift.rare, 1);
    } else { xp = Math.round(xp * RESCUE_REWARD.afterCap); energy = Math.round(energy * RESCUE_REWARD.afterCap); }
    if (!d.heroes.includes(c.mission)) { d.heroes = [...d.heroes, c.mission]; badge = true; }
  }
  let gained = 0;
  if (xp > 0) { const level = s.level, had = s.xp; Game.gainXp(s, xp, now); gained = s.xp - had; for (let l = level; l < s.level; l++) gained += Game.xpNeeded(l); }
  if (energy > 0 && Number.isSafeInteger(s.energy + energy)) s.energy += energy;
  s.rescue = d;
  if (c.waves > 0) Game.recordEvent(s, 'rescue', 1, undefined, now);
  return { xp: Math.round(gained), energy, gift, badge, full, winsLeft: Math.max(0, RESCUE_REWARD.winsPerDay - d.wins), wavesLeft: Math.max(0, RESCUE_REWARD.wavesPerDay - d.waves), level: s.level };
}
