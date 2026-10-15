/**
 * The boss stagger meter (break), FEEL pass 2026-10-15. Ordinary hits never stagger a boss (boss-patterns.ts hitControl,
 * after the reference), but heavy blows add up: a hit that carries crowd control (a stun of HARD_STUN or more), a hard
 * knock or a launch (the last hit of a chain is one) and a critical fill a meter. When it is full the boss drops to its
 * knees for STAGGER.time seconds: its wind-up or skill is cancelled, its telegraphs are cleared, it takes
 * STAGGER.vulnerable times the damage and dizzy stars circle its head. The meter then empties and the next break needs
 * STAGGER.grow times as much. Nothing fills in the first STAGGER.grace seconds of a fight (counted from the first hit),
 * and a boss left alone for STAGGER.forget seconds forgets the fight (a new one starts from an empty meter).
 *
 * Pure and shared: solo and the room host's browser call it from world.ts damageEnemy, the server from
 * combat-authority.mjs hit(), with seconds from their own clocks (the server's Date.now()/1000). Online the server's
 * meter is the one that counts; it is sent with the boss's health (`staggerView`). Titans (bosses many metres tall) take
 * twice the filling and kneel only 1.2 s; the Cinderpeak Colossus (its own rules in colossus-authority.mjs) never breaks.
 */
import { HARD_STUN } from './boss-patterns.ts';

export const STAGGER = {
  /** The first break's size, and how much bigger each next one is. */
  need: 100, grow: 1.3,
  /** What a blow adds: a heavy one (hard knock, launch, hard stun), a critical; both together add up. */
  heavy: 22, critical: 16,
  /** Seconds: no filling at the start of a fight; on its knees; a fight forgotten after this long without a hit. */
  grace: 3, time: 2, forget: 15,
  /** Damage taken on its knees. */
  vulnerable: 1.25,
  /** Seconds the world holds still on the blow that breaks it (a critical holds 0.06). Never on Battery saver. */
  stop: .11,
  /** Titans: the meter is this many times bigger and the knees last `titanTime` s. */
  titan: 2, titanTime: 1.2,
} as const;

export interface Stagger { fill: number; need: number; breaks: number; start: number; last: number; until: number }
export const newStagger = (): Stagger => ({ fill: 0, need: STAGGER.need, breaks: 0, start: -Infinity, last: -Infinity, until: -Infinity });
export interface StaggerBlow { critical?: boolean; knock?: number; lift?: number; stun?: number }
/** What a blow adds to the meter: nothing for an ordinary hit. */
export function staggerGain(hit: StaggerBlow) {
  const heavy = (hit.knock ?? 0) >= 2 || (hit.lift ?? 0) > 0 || (hit.stun ?? 0) >= HARD_STUN;
  return (heavy ? STAGGER.heavy : 0) + (hit.critical ? STAGGER.critical : 0);
}
export const staggerBroken = (s: Stagger | undefined, now: number) => !!s && now < s.until;
/** The damage a blow does: STAGGER.vulnerable times on its knees. */
export const staggerDamage = (s: Stagger | undefined, now: number, amount: number) => staggerBroken(s, now) ? amount * STAGGER.vulnerable : amount;

/**
 * One blow on a boss at `now` (seconds). Returns 'break' on the blow that fills the meter, 'fill' when it added to it,
 * else 'none'. On its knees the meter does not fill (the next break is earned after it stands up).
 */
export function staggerHit(s: Stagger, hit: StaggerBlow, now: number, titan = false): 'none' | 'fill' | 'break' {
  if (!Number.isFinite(now)) return 'none';
  if (now - s.last > STAGGER.forget) { s.fill = 0; s.need = STAGGER.need * (titan ? STAGGER.titan : 1); s.breaks = 0; s.start = now; s.until = -Infinity; }
  s.last = now;
  if (now - s.start < STAGGER.grace || staggerBroken(s, now)) return 'none';
  const gain = staggerGain(hit); if (!(gain > 0)) return 'none';
  s.fill += gain; if (s.fill < s.need) return 'fill';
  s.fill = 0; s.breaks++; s.need = Math.round(s.need * STAGGER.grow); s.until = now + (titan ? STAGGER.titanTime : STAGGER.time);
  return 'break';
}
/** The meter's part filled, 0-1 (for the boss bar). */
export const staggerShare = (s: Stagger | undefined) => s && s.need > 0 ? Math.min(1, s.fill / s.need) : 0;

/** What the server sends with a boss's health: the share filled and the seconds left on its knees. */
export interface StaggerView { share: number; broken: number; breaks: number }
export const staggerView = (s: Stagger, now: number): StaggerView => ({ share: Math.round(staggerShare(s) * 100) / 100, broken: Math.max(0, Math.round((s.until - now) * 100) / 100), breaks: s.breaks });
/** A browser's copy of the server's meter (it only draws it; `until` on the browser's own clock). */
export function adoptStaggerView(s: Stagger, v: Partial<StaggerView> | undefined, now: number) {
  if (!v || !Number.isFinite(v.share)) return false;
  s.need = STAGGER.need; s.fill = Math.max(0, Math.min(1, v.share!)) * s.need;
  s.breaks = Math.max(0, Math.floor(v.breaks ?? 0)); s.until = (v.broken ?? 0) > 0 ? now + Math.min(STAGGER.time, v.broken!) : -Infinity; s.last = now; return true;
}
