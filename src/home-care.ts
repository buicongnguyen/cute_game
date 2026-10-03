import type { SaveState } from './model.ts';
import { zoneAt } from './environments.ts';
import { INDOOR_Y } from './house.ts';

/**
 * Home is where you heal. In the safe village (zoneAt 'home') and indoors in the cottage the explorer recovers
 * HOME_RECOVERY_MULTIPLIER times faster than before: the old village rest (HOME_REST_HP_PER_SEC) plus the passive
 * regen from gear and buffs (model.ts activeStats().regen, which tickEffects / the authority already add everywhere).
 * Shared by world.ts (offline) and server/combat-authority.mjs (online) so both heal at the same pace.
 */
export const HOME_REST_HP_PER_SEC = 4, HOME_RECOVERY_MULTIPLIER = 4;
/** The total HP/s at home for a given passive regen: 4 × (4 + regen). */
export const homeRecoveryRate = (regen: number) => HOME_RECOVERY_MULTIPLIER * (HOME_REST_HP_PER_SEC + Math.max(0, Number.isFinite(regen) ? regen : 0));
/** What to add on top of the passive regen that is already applied everywhere. */
export const homeRecoveryBonus = (regen: number) => homeRecoveryRate(regen) - Math.max(0, Number.isFinite(regen) ? regen : 0);
/** Indoors the pose is the cottage's (raised by INDOOR_Y on the wire); outdoors the village ring. */
export function atHome(planet: string, pose: { x: number; z: number; y?: number }, indoors = false) {
  return planet === 'home' && (indoors || (pose.y ?? 0) >= INDOOR_Y - 1 || zoneAt(pose) === 'home');
}

/**
 * Negative effects are buffs with a negative value (the Toybox "Sticky feet" curse, and any slow/weaken a later
 * enemy adds the same way) and a shrinking size effect that came without its speed buff. Positive buffs stay.
 * Landing home, flying home and stepping into the cottage clear them (actions.ts returnHome/travel/homeCleanse).
 */
export function debuffKeys(s: SaveState, now = Date.now()) {
  return Object.entries(s.buffs ?? {}).filter(([, b]) => b && b.expiresAt > now && b.value < 0).map(([k]) => k);
}
export function hasDebuffs(s: SaveState, now = Date.now()) { return debuffKeys(s, now).length > 0; }
export function cleanseDebuffs(s: SaveState, now = Date.now()) {
  const keys = debuffKeys(s, now); for (const k of keys) delete (s.buffs as Record<string, unknown>)[k];
  return keys.length;
}
export const homeCleanseAllowed = (s: SaveState) => s.planet === 'home' && s.hp > 0;
/** The subtle HUD chip while home and hurt. */
export function homeChip(show: boolean, label: string) { return show ? `<span class="home-recovery-chip">🏡 ${label} <b>×${HOME_RECOVERY_MULTIPLIER}</b></span>` : ''; }
