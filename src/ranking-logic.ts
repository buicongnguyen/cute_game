/**
 * The leaderboard's rules, shared by the game server (server/ranking.mjs) and the browser (ranking.ts): the week (it starts
 * Monday 00:00 UTC), what each category counts, the weekly counters an account keeps, how a board is ordered and ranked,
 * and the local board shown in solo play (the player and the AI neighbours). Plain data and functions only: no DOM, no
 * three.js, so the tests and the server can use it.
 */
import { xpNeeded, FISH } from './model.ts';
import { seeded, type BotDef, type Tier } from './bot-logic.ts';

export type Board = 'weekly' | 'all';
export const WEEKLY_CATEGORIES = ['exp', 'harvest', 'fish', 'kills', 'boss'] as const;
export const ALL_TIME_CATEGORIES = ['level', 'big', 'harvest', 'fish', 'kills', 'boss'] as const;
export type WeeklyCategory = typeof WEEKLY_CATEGORIES[number];
export type AllTimeCategory = typeof ALL_TIME_CATEGORIES[number];
export type Category = WeeklyCategory | AllTimeCategory;
export const categoriesOf = (board: Board): readonly Category[] => board === 'weekly' ? WEEKLY_CATEGORIES : ALL_TIME_CATEGORIES;
export const validBoard = (value: unknown): value is Board => value === 'weekly' || value === 'all';
export const validCategory = (board: Board, value: unknown): value is Category => typeof value === 'string' && (categoriesOf(board) as readonly string[]).includes(value);
/** How many rows a board shows (the caller's own rank is reported separately). */
export const BOARD_SIZE = 50;

const DAY = 86_400_000;
/** Monday 00:00 UTC of the week holding `now` (ms). */
export function weekStart(now: number) {
  const d = new Date(now), midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY;
}
/** The week's name: the ISO date of its Monday (2026-10-05). Keys sort by time. */
export const weekKey = (now: number) => new Date(weekStart(now)).toISOString().slice(0, 10);
/** When the weekly boards start again (ms). */
export const weekEnds = (now: number) => weekStart(now) + 7 * DAY;

/** The lifetime totals a profile carries, the source of every weekly gain. */
export interface Totals { exp: number; harvest: number; fish: number; kills: number; boss: number }
export interface WeeklyCounters extends Totals { week: string }
/** The few profile fields the boards read; a full SaveState fits. */
export interface RankedProfile {
  name?: string; color?: string; level?: number; xp?: number;
  counters?: { harvests?: number; fish?: number; kills?: number };
  progression?: { totals?: Record<string, number> };
  fishRecords?: Record<string, number>;
}
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
const MAX_LEVEL = 100_000;
/** Every EXP point ever earned: the levels climbed plus the bar's progress. */
export function totalXp(p: RankedProfile) {
  const level = Math.min(MAX_LEVEL, Math.max(1, count(p.level) || 1));
  let sum = 0; for (let l = 1; l < level; l++) sum += xpNeeded(l);
  return Math.floor(sum + count(p.xp));
}
export function profileTotals(p: RankedProfile | null | undefined): Totals {
  if (!p || typeof p !== 'object') return { exp: 0, harvest: 0, fish: 0, kills: 0, boss: 0 };
  return { exp: totalXp(p), harvest: count(p.counters?.harvests), fish: count(p.counters?.fish), kills: count(p.counters?.kills), boss: count(p.progression?.totals?.boss) };
}
const emptyWeek = (week: string): WeeklyCounters => ({ week, exp: 0, harvest: 0, fish: 0, kills: 0, boss: 0 });
/** The counters as they stand this week: last week's (or none) read as a fresh, empty week. */
export function currentWeek(counters: Partial<WeeklyCounters> | null | undefined, now: number): WeeklyCounters {
  const week = weekKey(now);
  if (!counters || counters.week !== week) return emptyWeek(week);
  return { week, exp: count(counters.exp), harvest: count(counters.harvest), fish: count(counters.fish), kills: count(counters.kills), boss: count(counters.boss) };
}
/**
 * Adds what one authoritative action earned (the profile before and after it) to the week's counters. Only gains count:
 * a reset, a death or a level lost never takes points away, and a new week starts from zero.
 */
export function addProgress(counters: Partial<WeeklyCounters> | null | undefined, before: Totals, after: Totals, now: number): WeeklyCounters {
  const next = currentWeek(counters, now);
  for (const key of WEEKLY_CATEGORIES) {
    const gain = after[key] - before[key];
    if (Number.isFinite(gain) && gain > 0 && Number.isSafeInteger(next[key] + gain)) next[key] += gain;
  }
  return next;
}
/** The biggest fish ever caught (junk does not count): size in cm and the species. */
export function biggestFish(p: RankedProfile | null | undefined): { size: number; fish?: string } {
  let size = 0, fish: string | undefined;
  for (const [id, value] of Object.entries(p?.fishRecords ?? {})) {
    if (!Object.hasOwn(FISH, id) || FISH[id].rarity === 'junk') continue;
    const cm = count(value); if (cm > size) { size = cm; fish = id; }
  }
  return fish ? { size, fish } : { size: 0 };
}

/** One row before ranking: `value` is what the board shows and sorts by, `sub` breaks ties (EXP within a level). */
export interface Entry { id: string; name: string; color?: string; level: number; value: number; sub?: number; fish?: string; bot?: boolean }
export interface RankedEntry extends Entry { rank: number }
/** The row of one profile on one board; null when it has nothing to show there yet. */
export function entryFor(id: string, p: RankedProfile, weekly: Partial<WeeklyCounters> | null | undefined, board: Board, cat: Category, now: number): Entry | null {
  const base = { id, name: String(p.name || 'Explorer').slice(0, 20), color: typeof p.color === 'string' ? p.color : undefined, level: Math.max(1, count(p.level) || 1) };
  let value = 0, sub: number | undefined, fish: string | undefined;
  if (board === 'weekly') value = (currentWeek(weekly, now) as unknown as Record<string, number>)[cat] ?? 0;
  else if (cat === 'level') { value = base.level; sub = count(p.xp); }
  else if (cat === 'big') ({ size: value, fish } = biggestFish(p));
  else value = (profileTotals(p) as unknown as Record<string, number>)[cat] ?? 0;
  if (!(value > 0)) return null;
  return { ...base, value, ...(sub !== undefined ? { sub } : {}), ...(fish ? { fish } : {}) };
}
/** Highest first; equal scores share a rank (1, 2, 2, 4) and are listed by id so every refresh lists them alike. */
export function rankEntries(entries: Entry[]): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => b.value - a.value || (b.sub ?? 0) - (a.sub ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ranked: RankedEntry[] = [];
  sorted.forEach((entry, i) => {
    const prev = ranked[i - 1], tie = prev && prev.value === entry.value && (prev.sub ?? 0) === (entry.sub ?? 0);
    ranked.push({ ...entry, rank: tie ? prev.rank : i + 1 });
  });
  return ranked;
}
export interface BoardReply {
  board: Board; cat: Category; week: string; ends: number; players: number; top: RankedEntry[];
  /** The caller's place: rank null while they have nothing on this board. Absent when nobody is signed in. */
  me?: { rank: number | null; value: number; id: string } | null;
  solo?: boolean;
}
/** Top `limit` rows plus the caller's own rank, from an already ranked list. */
export function boardReply(ranked: RankedEntry[], board: Board, cat: Category, now: number, players: number, meId?: string | null, limit = BOARD_SIZE): BoardReply {
  const reply: BoardReply = { board, cat, week: weekKey(now), ends: weekEnds(now), players, top: ranked.slice(0, limit) };
  if (meId) { const mine = ranked.find(entry => entry.id === meId); reply.me = { id: meId, rank: mine?.rank ?? null, value: mine?.value ?? 0 }; }
  return reply;
}

/* ---------- Solo play: the player and the AI neighbours ---------- */

/** What a neighbour of each tier earns on an ordinary day. */
const DAILY: Record<Tier, Totals> = {
  rich: { exp: 2400, harvest: 48, fish: 18, kills: 64, boss: 1.4 },
  average: { exp: 820, harvest: 26, fish: 9, kills: 24, boss: .35 },
  new: { exp: 210, harvest: 11, fish: 3, kills: 7, boss: .06 },
};
/** Which share of the species (smallest to largest) a neighbour of each tier has landed, and how close to its top size. */
const BIG_FISH: Record<Tier, { band: [number, number]; size: [number, number] }> = { rich: { band: [.6, 1], size: [.7, 1] }, average: { band: [.3, .8], size: [.45, .85] }, new: { band: [0, .5], size: [.2, .6] } };
/** The first Monday of 2026: neighbours' lifetime totals grow from here. */
export const SOLO_EPOCH = Date.UTC(2026, 0, 5);
const hashText = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
/** A neighbour's stats at `now`: steady per neighbour (seed + id), different every week, growing slowly with time. */
export function botTotals(def: Pick<BotDef, 'id' | 'level' | 'tier'>, seed: number, now: number) {
  const r = seeded(seed ^ hashText(def.id)), daily = DAILY[def.tier] ?? DAILY.new;
  const pace = Object.fromEntries(WEEKLY_CATEGORIES.map(key => [key, daily[key] * (.7 + r() * .6)])) as unknown as Totals;
  // Ordinary and rare fish only: a legend (the lake guardian, say) would make every neighbour a hero.
  const fishList = Object.keys(FISH).filter(id => FISH[id].rarity === 'common' || FISH[id].rarity === 'rare').sort((a, b) => FISH[a].size[1] - FISH[b].size[1] || (a < b ? -1 : 1));
  const big = BIG_FISH[def.tier] ?? BIG_FISH.new, band = big.band[0] + r() * (big.band[1] - big.band[0]);
  const fish = fishList[Math.min(fishList.length - 1, Math.floor(band * fishList.length))], [lo, hi] = FISH[fish]?.size ?? [10, 60], reach = big.size[0] + r() * (big.size[1] - big.size[0]);
  const days = Math.max(0, (now - SOLO_EPOCH) / DAY), level = Math.max(1, def.level);
  // A week's luck: some weeks a neighbour plays more. The score fills in as the week goes by.
  const w = seeded(seed ^ hashText(def.id + '@' + weekKey(now))), luck = .55 + w() * .9, elapsed = Math.min(1, Math.max(0, (now - weekStart(now)) / (7 * DAY)));
  const weekly = Object.fromEntries(WEEKLY_CATEGORIES.map(key => [key, Math.floor(pace[key] * 7 * luck * elapsed)])) as unknown as Totals;
  const allTime = Object.fromEntries(WEEKLY_CATEGORIES.map(key => [key, Math.floor(pace[key] * (level * 2.5 + days * .35))])) as unknown as Totals;
  // A little closer to the species' top size as the months go by, never past it.
  const size = Math.round(Math.min(hi, lo + (hi - lo) * Math.min(1, reach + days / 3650)));
  return { weekly, allTime, big: size, fish, level };
}
/** The player's own weekly gains in solo play: lifetime totals now, against those seen at the start of this week. */
export interface SoloWeekState { week: string; base: Totals; last: Totals }
/**
 * Moves the solo snapshot on: in a new week, the totals last seen (in the old week) become the new week's base, so the
 * gains made since then count for this week. Call it when the board opens and now and then while playing.
 */
export function advanceSoloWeek(state: SoloWeekState | null | undefined, totals: Totals, now: number): SoloWeekState {
  const week = weekKey(now), valid = state && typeof state.week === 'string' && state.base && state.last;
  if (!valid) return { week, base: { ...totals }, last: { ...totals } };
  const base = state!.week === week ? state!.base : state!.last;
  // A new game (totals fell) starts the week again from what it has.
  const fresh = WEEKLY_CATEGORIES.some(key => totals[key] < (base[key] ?? 0));
  return { week, base: fresh ? { ...totals } : { ...base }, last: { ...totals } };
}
export function soloWeekGains(state: SoloWeekState, totals: Totals): Totals {
  return Object.fromEntries(WEEKLY_CATEGORIES.map(key => [key, Math.max(0, count(totals[key]) - count(state.base[key]))])) as unknown as Totals;
}
/** The whole solo board for one category: the player (id 'me') and each neighbour, ranked (zeros included). */
export function soloBoard(player: RankedProfile, weekGains: Totals, cast: BotDef[], seed: number, board: Board, cat: Category, now: number): BoardReply {
  const rows: Entry[] = [];
  const mine = board === 'weekly' ? entryFor('me', player, { week: weekKey(now), ...weekGains }, board, cat, now) : entryFor('me', player, null, board, cat, now);
  // Everyone is listed in solo play, a zero too: the board is never empty.
  rows.push(mine ?? { id: 'me', name: String(player.name || 'Explorer').slice(0, 20), color: player.color, level: Math.max(1, count(player.level) || 1), value: 0 });
  for (const def of cast) {
    const stats = botTotals(def, seed, now), base = { id: def.id, name: def.name, color: def.color, level: stats.level, bot: true };
    let value = 0, fish: string | undefined, sub: number | undefined;
    if (board === 'weekly') value = (stats.weekly as unknown as Record<string, number>)[cat] ?? 0;
    else if (cat === 'level') { value = stats.level; sub = Math.floor(stats.allTime.exp % Math.max(1, xpNeeded(stats.level))); }
    else if (cat === 'big') { value = stats.big; fish = stats.fish; }
    else value = (stats.allTime as unknown as Record<string, number>)[cat] ?? 0;
    rows.push({ ...base, value, ...(sub !== undefined ? { sub } : {}), ...(fish ? { fish } : {}) });
  }
  const reply = boardReply(rankEntries(rows), board, cat, now, cast.length + 1, 'me');
  // Listed with a zero, but not ranked until there is something to rank.
  if (reply.me && !(reply.me.value > 0)) reply.me.rank = null;
  return { ...reply, solo: true };
}
