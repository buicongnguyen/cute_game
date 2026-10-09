/**
 * The Rescue Call part of a save (model.ts SaveState.rescue). Kept import-free so model.ts can parse it. Only the
 * rewards' bookkeeping lives here: Spark, Star bits, defences and the squad's borrowed gear never enter the save.
 */
export interface RescueSave {
  /** The reward day (rescue-claim.ts rescueDay) these counters belong to. */ day: string;
  /** Waves paid today (all missions together) and winning missions paid in full today. */ waves: number; wins: number;
  played: number; won: number; lastAt: number;
  /** The best number of waves held on each mission, and the missions won at least once (the "Hero of" badges). */
  best: Record<string, number>; heroes: string[];
  /** The last runs already paid (each pays once). */ claimed: string[];
}
const finite = (v: unknown, min = 0, max = 1e15): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const MISSION = /^[a-z]{2,16}$/;
/** A saved Rescue Call record, or undefined for none or rubbish. */
export function parseRescue(raw: unknown): RescueSave | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>, int = (x: unknown, max: number) => (finite(x, 0, max) ? Math.floor(x) : 0);
  const day = typeof v.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.day) ? v.day : '';
  const best: Record<string, number> = {};
  if (v.best && typeof v.best === 'object' && !Array.isArray(v.best)) for (const [k, n] of Object.entries(v.best as Record<string, unknown>)) if (MISSION.test(k) && finite(n, 0, 99)) best[k] = Math.floor(n);
  const heroes = Array.isArray(v.heroes) ? [...new Set(v.heroes.filter((id): id is string => typeof id === 'string' && MISSION.test(id)))].slice(0, 32) : [];
  const claimed = Array.isArray(v.claimed) ? v.claimed.filter((id): id is string => typeof id === 'string' && /^[\w-]{4,64}$/.test(id)).slice(-12) : [];
  const out: RescueSave = { day, waves: int(v.waves, 999), wins: int(v.wins, 99), played: int(v.played, 1e9), won: int(v.won, 1e9), lastAt: finite(v.lastAt) ? v.lastAt : 0, best, heroes, claimed };
  return out.day || out.played ? out : undefined;
}
