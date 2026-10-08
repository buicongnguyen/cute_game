/** The Flag Rush part of a save (model.ts SaveState.ctf). Kept import-free so model.ts can parse it. */
export interface CtfSave { day: string; rewarded: number; played: number; wins: number; lastAt: number; claimed: string[] }

const finite = (v: unknown, min = 0, max = 1e15): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
/** A saved Flag Rush record, or undefined for none or rubbish. */
export function parseCtf(raw: unknown): CtfSave | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const day = typeof v.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.day) ? v.day : '';
  const int = (x: unknown, max: number) => (finite(x, 0, max) ? Math.floor(x) : 0);
  const claimed = Array.isArray(v.claimed) ? v.claimed.filter((id): id is string => typeof id === 'string' && /^[\w-]{4,64}$/.test(id)).slice(-12) : [];
  const out: CtfSave = { day, rewarded: int(v.rewarded, 99), played: int(v.played, 1e9), wins: int(v.wins, 1e9), lastAt: finite(v.lastAt) ? v.lastAt : 0, claimed };
  return out.day || out.played ? out : undefined;
}
