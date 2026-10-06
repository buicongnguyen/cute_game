/** The Delvers' Vault part of a save (model.ts SaveState.dungeon). Kept import-free so model.ts can parse it. */
export interface DungeonRun { id: string; stage: number; startedAt: number; lastAt: number; party: number }
export interface DungeonSave { day: string; runs: number; clears: number; run?: DungeonRun }

const finite = (v: unknown, min = 0, max = 1e15): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
/** A saved vault record, or undefined for none or rubbish. */
export function parseDungeon(raw: unknown): DungeonSave | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const day = typeof v.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.day) ? v.day : '';
  const out: DungeonSave = { day, runs: finite(v.runs, 0, 99) ? Math.floor(v.runs) : 0, clears: finite(v.clears, 0, 1e9) ? Math.floor(v.clears) : 0 };
  const r = v.run as Record<string, unknown> | undefined;
  if (r && typeof r === 'object' && typeof r.id === 'string' && r.id.length <= 64 && finite(r.stage, 0, 5) && finite(r.startedAt) && finite(r.lastAt) && finite(r.party, 1, 5))
    out.run = { id: r.id, stage: Math.floor(r.stage), startedAt: r.startedAt, lastAt: r.lastAt, party: Math.floor(r.party) };
  return out.day || out.clears || out.run ? out : undefined;
}
