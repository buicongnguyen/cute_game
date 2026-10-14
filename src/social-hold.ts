import { aggro } from './hud-combat.ts';
/**
 * Social pop-ups (a neighbour's friend card, an online friend request) wait while any living creature is chasing the
 * explorer (FIX-PLAN 3.3): a card used to land mid-fight over the joystick.
 */
export const socialHold = (enemies: readonly { hp: number; phase?: string | null }[]) => enemies.some(e => e.hp > 0 && aggro(e as never));
