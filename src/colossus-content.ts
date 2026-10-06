// The daily world boss. Timing, numbers and rules follow the public reference (2026-10-05 update);
// names, wording, art and code are original to Zoo Garden.
import type { ItemDef } from './content.ts';

/** The enemy type and its one fixed id in every home world (offline and in each online home room). */
export const COLOSSUS_TYPE = 'colossus';
export const COLOSSUS_ID = 'home:colossus';

/**
 * When and where it wakes: every day at 20:00 Vietnam time (UTC+7) for one hour, in Redrock Canyon on the home
 * world. `warn` is the countdown banner before it (minutes).
 */
export const COLOSSUS_SCHEDULE = { hour: 20, minute: 0, duration: 3600, utcOffsetHours: 7, warn: 10, x: 78, z: 0, facing: -Math.PI / 2, arenaR: 30 } as const;

/**
 * Combat facts. Hit points and attack are fixed (no zone or difficulty scaling); offline the health grows by 35% per
 * extra explorer, like the reference. `pierce` is the share of the target's defence its blows ignore.
 */
export const COLOSSUS_STATS = {
  hp: 520000, atk: 3200, xp: 30000, radius: 9, height: 26, sight: 70, cooldown: 2.6, pierce: .75,
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
  perExtraPlayer: .35,
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

export const COLOSSUS_VI: Record<string, string> = {
  'Cinderpeak Colossus': 'Cự Thạch Núi Tro',
  'Cinderhorn Crown': 'Vương Miện Sừng Tro',
  'Two glowing horns from the Cinderpeak Colossus. Lava cannot hurt the one who wears them.': 'Đôi sừng rực lửa của Cự Thạch Núi Tro. Dung nham không làm hại được người đội nó.',
  'Little Cinderpeak': 'Cự Thạch Tí Hon',
  'A pebble-sized colossus that follows the explorer who landed the final blow, spitting embers at enemies.': 'Một cự thạch bé bằng hòn sỏi, theo chân người tung đòn kết liễu và phun than hồng vào kẻ thù.',
  'Cinder Heartstone': 'Đá Tim Tro',
  'A warm stone that fell from the Cinderpeak Colossus. It never quite cools down.': 'Viên đá ấm rơi ra từ Cự Thạch Núi Tro. Nó chẳng bao giờ nguội hẳn.',
  '⚠️ ARMOUR-CRACKING STOMP': '⚠️ GIẪM NỨT GIÁP',
  '⚠️ HEAD-DIVE BITE': '⚠️ CÚI ĐẦU ĐỚP',
  '⚠️ BOULDER SLAP': '⚠️ CÚ TÁT TẢNG ĐÁ',
  '⚠️ CINDER BREATH': '⚠️ HƠI THỞ THAN HỒNG',
  '⚠️ GRAB AND HURL': '⚠️ TÓM VÀ NÉM',
  '⚠️ IT SPITS OUT A MINION': '⚠️ NÓ NHỔ RA TAY SAI',
  '⚠️ GROUND-SWEEPING ARM': '⚠️ CÁNH TAY QUÉT ĐẤT',
  '⚠️ ASH METEOR SHOWER': '⚠️ MƯA THIÊN THẠCH TRO',
  '⚠️ QUAKE ROAR — HIDE BY A FOOT!': '⚠️ GẦM RUNG ĐẤT — NÚP CẠNH BÀN CHÂN!',
  '💥 WEAK POINT ×2.5': '💥 ĐIỂM YẾU ×2.5',
  '💔 Armour cracked! −50% DEF for 30 s (it mends by itself).': '💔 Giáp bị nứt! −50% phòng thủ trong 30 giây (giáp tự liền lại).',
  '🔥 Scorched! −50% DEF for 12 s and burning.': '🔥 Bị thiêu! −50% phòng thủ trong 12 giây và đang cháy.',
  '😵 Stunned by the roar!': '😵 Choáng vì tiếng gầm!',
  '🪨 Grabbed and hurled!': '🪨 Bị tóm và ném đi!',
  'The Cinderpeak Colossus falls to its knees! Its head is in reach.': 'Cự Thạch Núi Tro quỵ gối! Đầu nó đã trong tầm với.',
  'The Cinderpeak Colossus is enraged! Its attacks come faster.': 'Cự Thạch Núi Tro nổi giận! Đòn đánh nhanh hơn.',
  'The Cinderpeak Colossus has woken in Redrock Canyon! The sky darkens over every planet.': 'Cự Thạch Núi Tro đã thức giấc ở Hẻm Núi Đá Đỏ! Bầu trời mọi hành tinh tối sầm lại.',
  'The Cinderpeak Colossus sinks back into the canyon. It wakes again tomorrow at 20:00.': 'Cự Thạch Núi Tro chìm lại vào hẻm núi. Nó sẽ thức dậy lúc 20:00 ngày mai.',
  'The Cinderpeak Colossus crumbles! The sky clears.': 'Cự Thạch Núi Tro sụp đổ! Bầu trời quang đãng trở lại.',
  '👑 You landed the FINAL BLOW! Little Cinderpeak joins you.': '👑 Bạn tung ĐÒN KẾT LIỄU! Cự Thạch Tí Hon theo bạn về nhà.',
  'A neighbour landed the final blow. Your share of the spoils is on the ground.': 'Một người hàng xóm tung đòn kết liễu. Phần thưởng của bạn nằm trên mặt đất.',
  'Hit the Colossus within the last {seconds} seconds to share its spoils.': 'Hãy đánh Cự Thạch trong {seconds} giây cuối để được chia chiến lợi phẩm.',
  '{name} (Minion)': '{name} (Tay Sai)',
  'The Cinderpeak Colossus wakes at 20:00': 'Cự Thạch Núi Tro thức giấc lúc 20:00',
  'in {time}': 'sau {time}',
  'Redrock Canyon · until 21:00': 'Hẻm Núi Đá Đỏ · đến 21:00',
  'Defeated today · back tomorrow at 20:00': 'Đã bị hạ hôm nay · trở lại lúc 20:00 ngày mai',
};

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
/** Offline health: 520,000 for one explorer, +35% for every other explorer nearby. */
export const colossusMaxHp = (players: number) => Math.round(COLOSSUS_STATS.hp * (1 + COLOSSUS_STATS.perExtraPlayer * Math.max(0, Math.floor(players) - 1)));
