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
