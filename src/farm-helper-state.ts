/** Auto-restock (farm-restock.ts): bought upgrade level, the switch, the "keep at least ϟN" guard and the stock it keeps. */
export interface RestockState { level: number; on: boolean; keep: number; roster: Partial<Record<'chicken' | 'duck' | 'cow' | 'pig', number>> }
/** Stored inside the farm so visiting players see the owner's pen robot too. */
export interface FarmHelperState { owned: boolean; paused: boolean; autoFeed: boolean; restock?: RestockState }
export const newFarmHelper = (): FarmHelperState => ({ owned: false, paused: false, autoFeed: false });
export const RESTOCK_MAX_LEVEL = 4, RESTOCK_KEEP_STEPS = [0, 100, 250, 500, 1000, 2500] as const;
const count = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(max, v) : 0;
export function parseRestock(raw: unknown): RestockState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>, level = count(v.level, RESTOCK_MAX_LEVEL); if (!level) return undefined;
  const keep = (RESTOCK_KEEP_STEPS as readonly number[]).includes(v.keep as number) ? v.keep as number : 250, roster: RestockState['roster'] = {};
  const r = v.roster && typeof v.roster === 'object' ? v.roster as Record<string, unknown> : {};
  for (const kind of ['chicken', 'duck', 'cow', 'pig'] as const) { const n = count(r[kind], 10); if (n) roster[kind] = n; }
  return { level, on: v.on !== false, keep, roster };
}
export function parseFarmHelper(raw: unknown): FarmHelperState {
  const h = newFarmHelper();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return h;
  const value = raw as Record<string, unknown>;
  h.owned = value.owned === true; h.paused = value.paused === true; h.autoFeed = value.autoFeed === true;
  const restock = h.owned ? parseRestock(value.restock) : undefined; if (restock) h.restock = restock;
  return h;
}
