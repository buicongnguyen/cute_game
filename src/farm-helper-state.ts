/** Stored inside the farm so visiting players see the owner's pen robot too. */
export interface FarmHelperState { owned: boolean; paused: boolean; autoFeed: boolean }
export const newFarmHelper = (): FarmHelperState => ({ owned: false, paused: false, autoFeed: false });
export function parseFarmHelper(raw: unknown): FarmHelperState {
  const h = newFarmHelper();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return h;
  const value = raw as Record<string, unknown>;
  h.owned = value.owned === true; h.paused = value.paused === true; h.autoFeed = value.autoFeed === true;
  return h;
}
