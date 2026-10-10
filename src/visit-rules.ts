/**
 * Watering a friend's growing crop (reference F-014): each watering takes 10 % off that crop's REMAINING time, earns the
 * visitor 5 + min(30, level) XP, works once per crop for each visitor, and at most 5 times a day in each friend's
 * garden (counted per visitor and garden, by UTC day). The server applies it (server/action-service.mjs waterFriend);
 * the numbers live here so the client's hint and the tests read the same rule.
 */
export const WATER_RULES = { share: .1, perHomePerDay: 10, xpBase: 5, xpLevelCap: 30 } as const;
/** Milliseconds a watering takes off: 10 % of what is left (0 for a ripe or empty bed). */
export function waterBoost(duration: number, elapsed: number) {
  if (!Number.isFinite(duration) || !Number.isFinite(elapsed) || duration <= 0) return 0;
  return Math.max(0, duration - Math.max(0, elapsed)) * WATER_RULES.share;
}
/** XP for one watering: 5 + min(30, level). */
export const waterXp = (level: number) => WATER_RULES.xpBase + Math.min(WATER_RULES.xpLevelCap, Math.max(0, Math.floor(Number.isFinite(level) ? level : 0)));
/** The UTC day a watering counts toward ("2026-10-06"). */
export const waterDay = (now: number) => new Date(now).toISOString().slice(0, 10);
/** A visitor's per-garden counts for today; older days are dropped. Malformed input starts fresh. */
export function waterLedger(raw: unknown, now: number): { day: string; homes: Record<string, number> } {
  const day = waterDay(now), v = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (v.day !== day || !v.homes || typeof v.homes !== 'object') return { day, homes: {} };
  const homes: Record<string, number> = {};
  for (const [id, n] of Object.entries(v.homes as Record<string, unknown>)) if (Number.isSafeInteger(n) && (n as number) > 0) homes[id] = n as number;
  return { day, homes };
}
/** Waterings left today in this garden for this visitor. */
export const waterLeft = (ledger: { homes: Record<string, number> }, ownerId: string) => Math.max(0, WATER_RULES.perHomePerDay - (Object.hasOwn(ledger.homes, ownerId) ? ledger.homes[ownerId] : 0));
