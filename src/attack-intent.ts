/**
 * What a press of Attack does (owner request 2026-10-16): the Attack button is also the "use" button. Next to something usable
 * (the thing the context button shows, action-prompt.ts) with no hostile creature targeted or in reach, a fresh press does that
 * thing (enter the cottage, open the workshop, plant, harvest, fish...); otherwise it swings as before. F on a PC follows the
 * same rule, so phone and PC agree.
 *
 * Priority: a hostile creature targeted or in reach > a usable thing in reach > a swing. Accidents are avoided: only a fresh
 * press uses (a held Attack keeps swinging and its power strike never opens a dialog), and not within USE_AFTER_SWING_S of the
 * last swing, so a combo chain that ends beside the chest does not open it.
 *
 * In a fight Attack never uses (AAA-PLAN WP17, decision R13): while `inFight` says a fight is on, every press swings,
 * whatever stands beside the explorer. Out of a fight Attack is still the use button.
 */

/** Seconds after the last swing during which a press keeps swinging (finishes the chain) instead of using the thing beside you. */
export const USE_AFTER_SWING_S = .5;

export interface IntentInput {
  /** A living hostile creature is targeted, or within the weapon's reach. */
  hostile: boolean;
  /** The context button shows a usable thing that is still in reach (not a creature). */
  usable: boolean;
  /** A new press: not a held button, not a key's auto-repeat. */
  fresh: boolean;
  /** Seconds since the last swing. */
  sinceSwing: number;
  /** A fight is on (inFight): Attack always attacks. */
  fight?: boolean;
}

export function attackIntent(i: IntentInput): 'use' | 'attack' {
  return !i.fight && !i.hostile && i.usable && i.fresh && i.sinceSwing >= USE_AFTER_SWING_S ? 'use' : 'attack';
}

/** Metres that make a fight: an angry creature this close, any living creature this close, a tutorial creature this close. */
export const FIGHT = { aggro: 8, hostile: 6, lesson: 10 } as const;
interface Foe { x: number; z: number; hp: number; tutorial?: boolean; mesh: { visible: boolean } }
/**
 * A fight is on at (x, z): a creature that has noticed someone (`aggro`) is within FIGHT.aggro m, any living creature is
 * within FIGHT.hostile m, or a creature of the first fight step (first-run.ts: they live only while that step is on) is
 * within FIGHT.lesson m. Distances are to the creature's middle. No allocation: it runs on the HUD tick.
 */
export function inFight<E extends Foe>(enemies: readonly E[], x: number, z: number, aggro: (e: E) => boolean): boolean {
  for (const e of enemies) {
    if (!(e.hp > 0) || !e.mesh.visible) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < FIGHT.hostile || e.tutorial && d < FIGHT.lesson || d < FIGHT.aggro && aggro(e)) return true;
  }
  return false;
}
