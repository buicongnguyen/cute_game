/**
 * The Ember Well's lid (solo play only). Three settings, saved on this device:
 *   wild    - the Cinderpeak Colossus wakes at its daily hour as always (the default);
 *   soothed - it still comes, but with 200,000 health (a fifth of the solo fight) and hits 50 times lighter, and the sky stays bright;
 *   asleep  - the lid is down: it sleeps through its hour, no sky, no banner, no fight.
 * Kept in its own tiny module so the village well works before the Colossus chunk has loaded (colossus.ts reads the same
 * flag each step). Online the server owns the event and the lid does nothing.
 */
export type ColossusLid = 'wild' | 'soothed' | 'asleep';
/** How many times lighter the soothed Colossus hits (its blows, grab, burn and minions). */
export const SOOTHE_FACTOR = 50;
/** The solo Colossus has about 1,000,000 health; soothed it has a fifth of that: about 200,000. */
export const SOOTHE_HP_DIVISOR = 5;
const KEY = 'zoo-colossus-sleeps';
let lid: ColossusLid = 'wild';
// '1' is what the first version stored for "asleep".
try { const v = localStorage.getItem(KEY); lid = v === 'soothed' ? 'soothed' : v === 'asleep' || v === '1' ? 'asleep' : 'wild'; } catch { /* a private window starts wild */ }
export const colossusLid = () => lid;
export const colossusSleeps = () => lid === 'asleep';
export const colossusSoothed = () => lid === 'soothed';
export function setColossusLid(next: ColossusLid) {
  lid = next === 'soothed' || next === 'asleep' ? next : 'wild';
  try { localStorage.setItem(KEY, lid); } catch { /* the choice lasts for this visit */ }
}
