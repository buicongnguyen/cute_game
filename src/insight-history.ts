/**
 * The save's small memory of how the village grew: one compact snapshot when the explorer levels up and one at the
 * first action of a new day, the latest HISTORY_CAP kept. The shared rules write it (model.ts gainXp, progression.ts
 * refreshProgress), so the server records it too when it replays an action: no action of its own, nothing to send.
 * The Village Almanac (insight.ts, a lazy chunk) reads it for its trends and level reports. This file is the only part
 * of the Almanac in the first download, so it stays tiny and imports nothing.
 */
export const HISTORY_CAP = 30;
/** What `n` holds, in order: lifetime totals from progression.totals, then three counts of the moment. */
export const HISTORY_FIELDS = ['sell', 'harvest', 'cook', 'fish', 'kill', 'boss', 'craft', 'mine', 'upgrade', 'beds', 'animals', 'worlds'] as const;
export type HistoryField = typeof HISTORY_FIELDS[number];
export interface Snapshot {
  /** When (ms). */ t: number;
  /** Level and energy at that moment. */ l: number; e: number;
  /** Why it was taken. */ k: 'level' | 'day';
  /** HISTORY_FIELDS, in order. `sell` is energy earned at the market, the rest are counts. */ n: number[];
  /** The Almanac's scores then (insight-rules.ts SCORE_IDS order), when its chunk was loaded; the server leaves it out. */ s?: number[];
}
interface Recorded { level: number; energy: number; progression: { totals: Record<string, number> }; plots: unknown[]; farm?: { animals?: unknown[] }; visited: unknown[]; history?: Snapshot[] }
let scorer: ((s: any) => number[]) | null = null;
/** The Almanac registers its scoring once loaded, so later snapshots carry scores too. */
export function setHistoryScorer(fn: ((s: any) => number[]) | null) { scorer = fn; }
const whole = (v: unknown, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0;
/** The numbers of this moment. */
export function snapshotOf(s: Recorded, kind: Snapshot['k'], now: number): Snapshot {
  const totals = s.progression.totals, n = HISTORY_FIELDS.map(key => key === 'beds' ? s.plots.length : key === 'animals' ? s.farm?.animals?.length ?? 0 : key === 'worlds' ? s.visited.length : whole(totals[key]));
  const shot: Snapshot = { t: Math.floor(now), l: whole(s.level) || 1, e: whole(s.energy), k: kind, n };
  if (scorer) { try { const scores = scorer(s); if (Array.isArray(scores) && scores.length) shot.s = scores.map(v => whole(v, 100)); } catch { /* A picture without scores is still a picture. */ } }
  return shot;
}
/**
 * Adds a snapshot. A new day on which nothing changed since the last one only moves that one's time (no flat points);
 * snapshots "from the future" (the clock was wound forward and back) are dropped first; the oldest go past the cap.
 */
export function noteHistory(s: Recorded, kind: Snapshot['k'], now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) return;
  const list = (s.history ??= []), shot = snapshotOf(s, kind, now);
  while (list.length && list[list.length - 1].t > now) list.pop();
  const last = list[list.length - 1];
  if (kind === 'day' && last && last.l === shot.l && last.e === shot.e && last.n.length === shot.n.length && last.n.every((v, i) => v === shot.n[i])) { last.t = shot.t; return; }
  list.push(shot);
  if (list.length > HISTORY_CAP) list.splice(0, list.length - HISTORY_CAP);
}
/** A saved history, cleaned: only well-formed snapshots, the newest HISTORY_CAP. Old saves have none. */
export function parseHistory(raw: unknown): Snapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: Snapshot[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const r = v as Record<string, unknown>;
    if (typeof r.t !== 'number' || !Number.isFinite(r.t) || r.t < 0 || r.t > 8.64e15 || !(whole(r.l) >= 1) || r.k !== 'level' && r.k !== 'day' || !Array.isArray(r.n)) continue;
    const shot: Snapshot = { t: Math.floor(r.t), l: whole(r.l, 1e9), e: whole(r.e), k: r.k, n: HISTORY_FIELDS.map((_, i) => whole((r.n as unknown[])[i])) };
    if (Array.isArray(r.s) && r.s.length && r.s.length <= 16) shot.s = r.s.map(x => whole(x, 100));
    out.push(shot);
  }
  return out.slice(-HISTORY_CAP);
}
/** A field of a snapshot by name. */
export const fieldOf = (shot: Snapshot, key: HistoryField) => shot.n[HISTORY_FIELDS.indexOf(key)] ?? 0;
