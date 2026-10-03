import * as M from './model.ts';
import { newHelper } from './helper-state.ts';

/**
 * Who plants a bed: the player or the helpers (user request, round 27: "when turn off the gardener robot, then we can
 * grow the tree by our self"). Before this, Bolt filled every empty bed within two seconds, Sprout did the same while
 * Bolt was switched off, their own pick never includes a fruit tree, and Sprout replaced a hand-planted tree after its
 * harvest. The rule now, the same offline, online (actions.ts) and in the catch-up after time away:
 *
 * - Auto-planting is ONE garden switch (HelperState.manual, saved; shown in the bed panel and in Bolt's and Sprout's
 *   panels). While Bolt is switched off it is off as well, whatever the switch says: turning the robot off always
 *   means "I plant by myself", and Sprout does not quietly take the beds instead.
 * - Off: nobody plants but the player, and an empty bed stays empty. Helpers at work still HARVEST: a harvest never
 *   takes a choice away (it frees the bed for the player), and a tree left ripe for a day would earn nothing. To stop
 *   the harvesting too, switch Bolt off and send Sprout on a break.
 * - What the player plants by hand ("Plant" or "All") is that bed's own crop (Plot.choice), fruit trees included. With
 *   auto-planting on, helpers replant exactly that crop there after every harvest, before Bolt's "Seed to plant" and
 *   before their own pick; when it cannot be planted (no seeds left, level not reached) the bed waits for the player
 *   rather than getting something else. Beds the player never planted by hand are the helpers' to choose (helper.ts).
 */
export type AutoPlantOff = 'switch' | 'robot';
/** Why nobody plants automatically: the switch is off, or Bolt is switched off; null while helpers plant. */
export function autoPlantOff(s: M.SaveState): AutoPlantOff | null { const h = s.helper; return h?.manual ? 'switch' : h?.owned && h.paused ? 'robot' : null; }
export const autoPlanting = (s: M.SaveState) => autoPlantOff(s) === null;
/** The saved switch alone (Bolt's own on/off is not part of it). */
export const autoPlantSwitch = (s: M.SaveState) => !s.helper?.manual;
export function setAutoPlant(s: M.SaveState, on: boolean) {
  if (typeof on !== 'boolean') return false;
  const h = s.helper ??= newHelper(); if (on) delete h.manual; else h.manual = true; return true;
}

/** The player plants bed `i`: as M.plant, and the crop becomes the bed's own. */
export function plantByHand(s: M.SaveState, i: number, crop: M.CropId, now = Date.now()) {
  if (!M.plant(s, i, crop, now)) return false;
  s.plots[i].choice = s.plots[i].crop!; return true;
}
/** "All": every empty bed gets the crop, each as the player's own choice. */
export function plantAllByHand(s: M.SaveState, crop: M.CropId, now = Date.now()) { let count = 0; s.plots.forEach((_, i) => { if (plantByHand(s, i, crop, now)) count++; }); return count; }
export const bedChoice = (s: M.SaveState, i: number): M.CropId | undefined => { const c = s.plots[i]?.choice; return c && Object.hasOwn(M.CROPS, c) ? c : undefined; };
export const chosenBeds = (s: M.SaveState) => s.plots.filter((_, i) => bedChoice(s, i)).length;
/** Hands every bed back to the helpers' choosing (Bolt's panel: "plant this seed there too"); returns how many. */
export function forgetChoices(s: M.SaveState) { let n = 0; for (const p of s.plots) if (p.choice) { delete p.choice; n++; } return n; }
