/**
 * The Ember Well's lid (solo play only), saved on this device. The player picks one of four:
 *   auto    - the automatic rule (the default, also when nothing was ever chosen): asleep below level 20, soothed from 20 on;
 *   wild    - the Cinderpeak Colossus wakes at its daily hour at full strength;
 *   soothed - it still comes, but with 200,000 health (a fifth of the solo fight) and hits 50 times lighter, and the sky stays bright;
 *   asleep  - the lid is down: it sleeps through its hour, no sky, no banner, no fight.
 * Under the rule (FIX-PLAN 4.6, owner) a player below 20 sees nothing of it (no darker sky, no map badge, no News); at 20
 * one News entry says it stirs (main.ts levelCheck) and it comes soothed, and stays soothed until the player chooses
 * otherwise at the well: nobody gets the full-strength giant without asking for it.
 * Kept in its own tiny module so the village well works before the Colossus chunk has loaded (colossus.ts reads the same
 * flags each step). Online the server owns the event and the lid does nothing; there players under 20 only miss the
 * badge and the News pings (colossus.ts) and can still walk to the canyon and join.
 */
export type ColossusLid = 'wild' | 'soothed' | 'asleep';
/** What the player can pick at the well: a lid, or 'auto' for the level rule. */
export type ColossusPick = ColossusLid | 'auto';
/** Below this level the solo Colossus sleeps unless the player chose otherwise at the Ember Well; online, no badge or News below it. */
export const COLOSSUS_LEVEL = 20;
/** How many times lighter the soothed Colossus hits (its blows, grab, burn and minions). */
export const SOOTHE_FACTOR = 50;
/** The solo Colossus has about 1,000,000 health; soothed it has a fifth of that: about 200,000. */
export const SOOTHE_HP_DIVISOR = 5;
const KEY = 'zoo-colossus-sleeps';
/** The player's own lid at the well, or null for the automatic rule (never chose, or chose Automatic). */
let chosen: ColossusLid | null = null;
// '1' is what the first version stored for "asleep"; 'auto' (or nothing) is the rule.
try { const v = localStorage.getItem(KEY); chosen = v === 'soothed' ? 'soothed' : v === 'asleep' || v === '1' ? 'asleep' : v === 'wild' ? 'wild' : null; } catch { /* a private window: the rule */ }

/** The lid in force (pure, for tests): the player's lid, else asleep below level 20 and soothed from 20 on. */
export function lidFor(level: number, choice: ColossusLid | null): ColossusLid {
  if (choice) return choice;
  return level >= COLOSSUS_LEVEL ? 'soothed' : 'asleep';
}
/** The player's lid at the well (null: the automatic rule). */
export const colossusChoice = () => chosen;
export const colossusLid = (level: number) => lidFor(level, chosen);
export const colossusSleeps = (level: number) => colossusLid(level) === 'asleep';
export const colossusSoothed = (level: number) => colossusLid(level) === 'soothed';
export function setColossusLid(next: ColossusPick) {
  chosen = next === 'soothed' || next === 'asleep' || next === 'wild' ? next : null;
  try { localStorage.setItem(KEY, chosen ?? 'auto'); } catch { /* the choice lasts for this visit */ }
}
