/**
 * The Ember Well's lid (solo play only). Three settings, saved on this device:
 *   wild    - the Cinderpeak Colossus wakes at its daily hour as always (the default);
 *   soothed - it still comes, but with 1/50 of its health and hits, and the sky stays bright;
 *   asleep  - the lid is down: it sleeps through its hour, no sky, no banner, no fight.
 * Kept in its own tiny module so the village well works before the Colossus chunk has loaded (colossus.ts reads the same
 * flag each step). Online the server owns the event and the lid does nothing.
 */
export type ColossusLid = 'wild' | 'soothed' | 'asleep';
/** How many times weaker the soothed Colossus is (its health and its damage). */
export const SOOTHE_FACTOR = 50;
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
