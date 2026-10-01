/** One farm game-hour is one real minute. Offline production uses elapsed wall-clock time. */
export const GAME_HOUR_MS = 60_000;
export const FARM_TIMER_VERSION = 2;
export function gameHours(hours: number) { return hours * GAME_HOUR_MS; }
