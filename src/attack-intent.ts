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

/**
 * What makes a fight. Metres: an angry creature this close, any living creature this close, a creature of the first fight
 * this close. Seconds: while the first fight step is on, a swing this short a time ago keeps Attack a swing wherever
 * its creatures are (one that fled to the garden and fell there leaves the others more than `lesson` m away).
 */
export const FIGHT = { aggro: 8, hostile: 6, lesson: 10, lessonSwing: 4 } as const;
/** A fallen creature of the first fight still counts while it comes back within this many seconds (first-run.ts CRITTER.respawn is 5; once the step is done it is 999,999). */
export const LESSON_BACK_S = 30;
interface Foe { x: number; z: number; hp: number; respawn?: number; tutorial?: boolean; mesh: { visible: boolean } }
/**
 * A fight is on at (x, z): a creature that has noticed someone (`aggro`) is within FIGHT.aggro m, any living creature is
 * within FIGHT.hostile m, or a creature of the first fight step (first-run.ts: they are about only while that step is on)
 * is within FIGHT.lesson m, alive or fallen and on its way back: between two of them Attack must not open the thing the
 * last one fell beside. While that step is on, the last swing (`sinceSwing` seconds ago) also counts for
 * FIGHT.lessonSwing s. Distances are to the creature's middle. No allocation: it runs on the HUD tick.
 */
export function inFight<E extends Foe>(enemies: readonly E[], x: number, z: number, aggro: (e: E) => boolean, sinceSwing = Infinity): boolean {
  for (const e of enemies) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (e.tutorial && (d < FIGHT.lesson || sinceSwing < FIGHT.lessonSwing) && (e.hp > 0 || (e.respawn ?? Infinity) < LESSON_BACK_S)) return true;
    if (!(e.hp > 0) || !e.mesh.visible) continue;
    if (d < FIGHT.hostile || d < FIGHT.aggro && aggro(e)) return true;
  }
  return false;
}
