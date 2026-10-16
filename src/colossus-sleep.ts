/**
 * The Ember Well's lid (solo play only). Three settings, saved on this device:
 *   wild    - the Cinderpeak Colossus wakes at its daily hour at full strength;
 *   soothed - it still comes, but with 200,000 health (a fifth of the solo fight) and hits 50 times lighter, and the sky stays bright;
 *   asleep  - the lid is down: it sleeps through its hour, no sky, no banner, no fight.
 * The automatic rule (FIX-PLAN 4.6, owner): until the player has chosen at the well, the Colossus sleeps below level 20
 * (no darker sky, no map badge, no News). At 20 one News entry says it stirs (main.ts levelCheck) and its first day comes
 * soothed; after that it is wild, the old default, unless the player chooses. An explicit choice always rules, at any level.
 * "Never chose" (nothing stored) and "chose wild" ('wild' stored) are different on purpose.
 * Kept in its own tiny module so the village well works before the Colossus chunk has loaded (colossus.ts reads the same
 * flags each step). Online the server owns the event and the lid does nothing; there players under 20 only miss the
 * badge and the News pings (colossus.ts) and can still walk to the canyon and join.
 */
export type ColossusLid = 'wild' | 'soothed' | 'asleep';
/** Below this level the solo Colossus sleeps unless the player chose otherwise at the Ember Well; online, no badge or News below it. */
export const COLOSSUS_LEVEL = 20;
/** How many times lighter the soothed Colossus hits (its blows, grab, burn and minions). */
export const SOOTHE_FACTOR = 50;
/** The solo Colossus has about 1,000,000 health; soothed it has a fifth of that: about 200,000. */
export const SOOTHE_HP_DIVISOR = 5;
const KEY = 'zoo-colossus-sleeps', FIRST_KEY = 'zoo-colossus-first';
/** The player's own choice at the well, or null while they never chose. */
let chosen: ColossusLid | null = null, firstDay: string | null = null;
// '1' is what the first version stored for "asleep".
try { const v = localStorage.getItem(KEY); chosen = v === 'soothed' ? 'soothed' : v === 'asleep' || v === '1' ? 'asleep' : v === 'wild' ? 'wild' : null; firstDay = localStorage.getItem(FIRST_KEY); } catch { /* a private window: never chose */ }

/**
 * The lid in force (pure, for tests). `day`: the Colossus clock's day being asked about; `first`: the day of the first
 * event after reaching the level without a choice (null until it came).
 */
export function lidFor(level: number, choice: ColossusLid | null, first: string | null, day?: string): ColossusLid {
  if (choice) return choice;
  if (!(level >= COLOSSUS_LEVEL)) return 'asleep';
  return !first || first === day ? 'soothed' : 'wild';
}
/** What the player chose at the well (null: never). */
export const colossusChoice = () => chosen;
export const colossusLid = (level: number, day?: string) => lidFor(level, chosen, firstDay, day);
export const colossusSleeps = (level: number, day?: string) => colossusLid(level, day) === 'asleep';
export const colossusSoothed = (level: number, day?: string) => colossusLid(level, day) === 'soothed';
/** colossus.ts calls this as the day's event begins: the first one after reaching the level unchosen is the soothed one. */
export function noteColossusDay(level: number, day: string) {
  if (chosen || firstDay || !(level >= COLOSSUS_LEVEL)) return;
  firstDay = day; try { localStorage.setItem(FIRST_KEY, day); } catch { /* lasts for this visit */ }
}
export function setColossusLid(next: ColossusLid) {
  chosen = next === 'soothed' || next === 'asleep' ? next : 'wild';
  try { localStorage.setItem(KEY, chosen); } catch { /* the choice lasts for this visit */ }
}
