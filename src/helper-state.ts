import { CROPS, canonicalItem, type CropId } from './content.ts';

/**
 * The garden helper's saved state. Kept apart from helper.ts (which needs model.ts) so model.ts can parse it without
 * an import cycle. Saves from before the helper have no `helper` field: parseHelper turns that into "not owned".
 */
export interface HelperState {
  owned: boolean;
  /** The settings toggle: a paused helper stands by its bench and touches nothing. */
  paused: boolean;
  /** 'same' replants each bed with what grew there last; a crop id always plants that crop. */
  seed: 'same' | CropId;
  /** Last crop planted per bed, keyed by the bed's position (indices shift when a bed is stored, positions do not). */
  last: Record<string, CropId>;
  /** Auto-planting is switched off for the whole garden (auto-plant.ts): helpers only harvest, the player plants every bed. Missing = on. It lives here, even without a robot, so a garden with only Sprout saves it too. */
  manual?: true;
  /** Asked to work through a daily rest until this time (ms). */
  callUntil?: number;
}
export const HELPER_COST = 1000;
const HOUR = 3_600_000;
/** Daily rests, on the UTC clock so client and server agree: the robot rests the last 3 hours of each day, the cook the last hour of every 4, so the grown garden stands for the player to see. */
export const BREAKS = { robot: { cycle: 24 * HOUR, rest: 3 * HOUR }, cook: { cycle: 4 * HOUR, rest: HOUR } } as const;
export const CALL_MS = 30 * 60_000;
export const onBreak = (who: keyof typeof BREAKS, now: number, callUntil?: number) =>
  !(callUntil && now < callUntil) && now % BREAKS[who].cycle >= BREAKS[who].cycle - BREAKS[who].rest;
export const newHelper = (): HelperState => ({ owned: false, paused: false, seed: 'same', last: {} });
/** Records a bed's crop as the newest entry (insertion order is what parseHelper keeps when trimming to 64). */
export function remember(h: HelperState, key: string, crop: CropId) { delete h.last[key]; h.last[key] = crop; }
const crop = (raw: unknown): CropId | null => { if (typeof raw !== 'string') return null; const id = canonicalItem(raw); return Object.hasOwn(CROPS, id) ? id : null; };

/** Validates a saved helper (or a visitor's copy of one); anything malformed falls back to safe defaults. */
export function parseHelper(raw: unknown): HelperState {
  const h = newHelper();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return h;
  const v = raw as Record<string, unknown>;
  h.owned = v.owned === true; h.paused = v.paused === true; if (v.manual === true) h.manual = true;
  if (typeof v.callUntil === 'number' && Number.isFinite(v.callUntil)) h.callUntil = v.callUntil;
  h.seed = v.seed === 'same' ? 'same' : crop(v.seed) ?? 'same';
  if (v.last && typeof v.last === 'object' && !Array.isArray(v.last))
    // The newest 64: remember() moves a key to the end on every write, so these are the beds' current spots, not long-gone ones.
    for (const [key, id] of Object.entries(v.last as Record<string, unknown>).slice(-64)) { const c = crop(id); if (c && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(key)) h.last[key] = c; }
  return h;
}
