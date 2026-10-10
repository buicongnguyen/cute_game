// The daily world boss. Timing, numbers and rules follow the public reference (2026-10-05 update);
// names, wording, art and code are original to Zoo Garden.
import type { ItemDef } from './content.ts';

/** The enemy type and its one fixed id in every home world (offline and in each online home room). */
export const COLOSSUS_TYPE = 'colossus';
export const COLOSSUS_ID = 'home:colossus';

/**
 * When and where it wakes: every day at 08:00 Vietnam time (UTC+7) until midnight, in Redrock Canyon on the home
 * world. `warn` is the countdown banner before it (minutes).
 */
export const COLOSSUS_SCHEDULE = { hour: 8, minute: 0, duration: 16 * 3600, utcOffsetHours: 7, warn: 10, x: 78, z: 0, facing: -Math.PI / 2, arenaR: 30 } as const;

/**
 * Combat facts. Hit points and attack are fixed (no zone or difficulty scaling); health grows by 80% per extra
 * explorer, online and offline (the reference's 2026-10-07 balance patch: 3,000,000 for one, was 520,000 +35%). `pierce` is the share of the target's defence its blows ignore.
 */
export const COLOSSUS_STATS = {
  hp: 3000000, atk: 3200, xp: 30000, radius: 9, height: 26, sight: 70, cooldown: 2.6, pierce: .75,
  headMultiplier: 2.5, headReach: 10, kneelAt: .25, enrageAt: .3, fasterAt: .5,
  /** The giant is drawn at this scale (colossus.glb is modelled at 1:1, 17 m to the crown, horns 18.8 m). */
  modelScale: .85,
  /**
   * The feet stand this far left and right of the body (the model's 8.5 m × modelScale; the reference's 8.5 m belongs
   * to its own model); within `footSafe` of one the roar cannot stun you.
   */
  footOffset: 7.2, footSafe: 5.6, roarRange: 62, stunSeconds: 2,
  crackChance: .35, crackSeconds: 30, crackFactor: .5,
  burnDefSeconds: 12, burnDefFactor: .5, burnSeconds: 6, burnTick: .6, burnShare: .03,
  grabShare: .25, throwDistance: 18, throwSeconds: 1.4, throwHeight: 14,
  /** An explorer counts as a helper offline when their last blow was this recent at the kill (seconds). */
  contributionWindow: 20,
  perExtraPlayer: .8,
} as const;

export const COLOSSUS_NAME = 'Cinderpeak Colossus';
export const COLOSSUS_PLACE = 'Redrock Canyon';

/** Boss minions it can spit out, each at most once until all have been used. */
export const COLOSSUS_MINIONS = ['golem', 'yeti', 'gorilla', 'leviathan', 'phoenix', 'shadowlord', 'mammoth', 'robot', 'gingerbread', 'bear'] as const;

export const COLOSSUS_ITEMS: Record<string, ItemDef> = {
  hat_colossus: {
    name: 'Cinderhorn Crown', icon: '🌋', type: 'hat', slot: 'hat', sell: 2000, rare: true, legend: true, lavaproof: true,
    // The reference's 26/26/200 would break the hat ceiling (gear-ceiling.ts: a base must be at most 1/1.4 of it).
    stats: { atk: 22, def: 26, hp: 150, crit: .08 },
    desc: 'Two glowing horns from the Cinderpeak Colossus. Lava cannot hurt the one who wears them.',
  },
  pet_colossus: {
    name: 'Little Cinderpeak', icon: '🪨', type: 'pet', slot: 'pet', sell: 6000, rare: true, legend: true, lavaproof: true,
    // Kept under the companion ceiling (gear-ceiling.ts) instead of the reference's 40/30/300.
    stats: { atk: 16, def: 25, hp: 150 },
    pet: { scale: .09, dmg: 2.5, cd: .9, shot: 'fire' },
    desc: 'A pebble-sized colossus that follows the explorer who landed the final blow, spitting embers at enemies.',
  },
  colossus_shard: {
    name: 'Cinder Heartstone', icon: '🔥', type: 'material', sell: 220, rare: true,
    desc: 'A warm stone that fell from the Cinderpeak Colossus. It never quite cools down.',
  },
};

/** Loot for every explorer who helped (id, chance, min, max); chances under 50% grow with luck. */
export const COLOSSUS_LOOT: [string, number, number, number][] = [
  ['hat_colossus', .15, 1, 1], ['colossus_shard', 1, 4, 8], ['starshard', 1, 6, 10], ['seed_star', 1, 3, 5],
  ['firecore', 1, 4, 6], ['crown', .5, 1, 1], ['dragonscale', .6, 1, 3],
];
/** A spat-out minion also drops a heartstone half the time. */
export const COLOSSUS_MINION_SHARD = .5;

/** Where today's (or the next) window stands at `now` (ms since epoch). Days roll over at midnight UTC+7. */
export interface ColossusClock { phase: 'idle' | 'soon' | 'active'; day: number; startsAt: number; endsAt: number; left: number }
export function colossusClock(now: number, s: { hour: number; minute: number; duration: number; utcOffsetHours: number; warn: number } = COLOSSUS_SCHEDULE): ColossusClock {
  const offset = s.utcOffsetHours * 3600000, local = now + offset, dayMs = 86400000;
  let day = Math.floor(local / dayMs), startsAt = day * dayMs + (s.hour * 60 + s.minute) * 60000 - offset;
  // Past today's window: the next one is tomorrow's.
  if (now >= startsAt + s.duration * 1000) { day++; startsAt += dayMs; }
  const endsAt = startsAt + s.duration * 1000;
  const phase = now >= startsAt ? 'active' : startsAt - now <= s.warn * 60000 ? 'soon' : 'idle';
  return { phase, day, startsAt, endsAt, left: Math.max(0, (phase === 'active' ? endsAt : startsAt) - now) };
}
/** "7:05" for 425 s, "1:02:03" past an hour. */
export function clockText(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, sec = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
/** Health: 3,000,000 for one explorer, +80% for every other explorer nearby (server: every explorer on the home world). */
export const colossusMaxHp = (players: number, solo = false) => Math.round(COLOSSUS_STATS.hp * (1 + COLOSSUS_STATS.perExtraPlayer * Math.max(0, Math.floor(players) - 1)) * (solo ? SOLO_HP_SHARE : 1));
/** Offline (no server, no room) the Colossus has a third of the online health: about 1,000,000 for one explorer. Online keeps 3,000,000. */
export const SOLO_HP_SHARE = 1 / 3;
/** The most one AI neighbour's blow can take off the Colossus (offline; was 400). */
export const NEIGHBOUR_HIT_CAP = 1200;

// ---- Roar hours (added 2026-10-10; the reference now wakes its Colossus at 02:00, 12:00 and 19:00 UTC for an hour each) ----
// Our own long daily window (COLOSSUS_SCHEDULE, 08:00-24:00 UTC+7) is unchanged. Roar hours only sit on top of it as a bonus.
export const ROAR_HOURS_UTC = [2, 12, 19] as const;
export const ROAR_DURATION_MS = 3600000;
/** +25% EXP and +25% of every loot stack's count, solo (offline) only: the online path is server-authoritative and unchanged. */
export const ROAR_BONUS = .25;
export interface RoarHours { active: boolean; startsAt: number; endsAt: number; next: number }
/**
 * The three UTC roar windows at `now` (ms since epoch). Start inclusive, end exclusive: 12:00:00.000 is in, 13:00:00.000 is out.
 * `startsAt`/`endsAt` are the current window when `active`, else the coming one; `next` is the start of the first window
 * that begins strictly after `now` (the one after the current window when active). Day wrap: after 19:00 the next is 02:00 tomorrow.
 */
export function roarHours(now: number): RoarHours {
  const dayMs = 86400000, day = Math.floor(now / dayMs) * dayMs;
  const starts: number[] = [];
  for (let d = -1; d <= 1; d++) for (const h of ROAR_HOURS_UTC) starts.push(day + d * dayMs + h * 3600000);
  const cur = starts.find(s => now >= s && now < s + ROAR_DURATION_MS);
  const upcoming = starts.find(s => s > now)!;
  const startsAt = cur ?? upcoming;
  return { active: cur !== undefined, startsAt, endsAt: startsAt + ROAR_DURATION_MS, next: upcoming };
}
/**
 * Roar bonus on a loot list: each stack gains floor(count x 25%), plus 1 more with the fractional part as its chance
 * (a stack of 1 therefore has a 25% chance of +1, never more). `rng` is injectable so tests are deterministic.
 */
export function roarBonusCount(count: number, rng: () => number = Math.random) {
  const exact = Math.max(0, count) * ROAR_BONUS, whole = Math.floor(exact);
  return whole + (rng() < exact - whole ? 1 : 0);
}
