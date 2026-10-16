/**
 * What a press of Attack does (owner request 2026-10-16): the Attack button is also the "use" button. Next to something usable
 * (the thing the context button shows, action-prompt.ts) with no hostile creature targeted or in reach, a fresh press does that
 * thing (enter the cottage, open the workshop, plant, harvest, fish...); otherwise it swings as before. F on a PC follows the
 * same rule, so phone and PC agree.
 *
 * Priority: a hostile creature targeted or in reach > a usable thing in reach > a swing. Accidents are avoided: only a fresh
 * press uses (a held Attack keeps swinging and its power strike never opens a dialog), and not within USE_AFTER_SWING_S of the
 * last swing, so a combo chain that ends beside the chest does not open it.
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
}

export function attackIntent(i: IntentInput): 'use' | 'attack' {
  return !i.hostile && i.usable && i.fresh && i.sinceSwing >= USE_AFTER_SWING_S ? 'use' : 'attack';
}
