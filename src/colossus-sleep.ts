/**
 * The Ember Well's lid (solo play): lowered, the Cinderpeak Colossus stays asleep, the sky stays bright and its daily window
 * passes quietly; lifted, it wakes on its usual hour. Kept in its own tiny module so the village well works before the
 * Colossus chunk has loaded (colossus.ts reads the same flag each step). Online the server owns the event and the lid does nothing.
 */
const KEY = 'zoo-colossus-sleeps';
let sleeps = false;
try { sleeps = localStorage.getItem(KEY) === '1'; } catch { /* a private window starts awake */ }
export const colossusSleeps = () => sleeps;
export function setColossusSleeps(on: boolean) {
  sleeps = !!on;
  try { localStorage.setItem(KEY, sleeps ? '1' : '0'); } catch { /* the choice lasts for this visit */ }
}
