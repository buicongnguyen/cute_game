/**
 * Flag Rush (our Capture the Flag at the Multiworld Gate): the numbers and the field. Pure data, no imports, so the
 * match rules (ctf-rules.ts), the AI (ctf-ai.ts), the server later and the tests all read the same table.
 *
 * Reference facts (scratchpad facts-ctf.md, bundle @1181190): first to 3, an 8-minute match then a 3-minute "next point
 * wins" overtime, everyone at level 8 with the ultimate open, respawn 5 s, a dropped flag flies home after 15 s, the
 * carrier runs 15% slower, is always revealed and cannot teleport, a power-up every 22 s (first at 8 s) from 7 kinds,
 * jump pads over a river, rooms 1v1/2v2/3v3/5v5, the 10 shared disguises as heroes, no gear loss, EXP for winners.
 * The field below is our own layout (sizes, crossings, rocks and pads differ from the reference's).
 */

export const CTF = {
  win: 3, time: 480, overtime: 180, level: 8, respawn: 5, flagReturn: 15, carrySlow: .15,
  /** Radius of the base around each flag stand (the stand heals nobody; it is where captures count). */
  baseR: 8, pickR: 1.6, captureR: 2.4,
  powerEvery: 22, firstPower: 8, powerR: 1.5,
  sizes: [1, 2, 3, 5] as const,
  /** Seconds of "3, 2, 1, go!" before the clock runs. */
  intro: 3,
  padR: 1.4, jumpTime: .9, jumpHeight: 4.5, padLock: 1,
  /** All match damage is multiplied by this: fights at level 8 should end in seconds, not minutes. */
  damageScale: 1.6,
  /** Seconds a downed player cannot be hit again after respawning. */
  spawnGuard: 2,
} as const;
export type TeamId = 0 | 1;
export type CtfSize = typeof CTF.sizes[number];

/** The field, in metres around its own centre: x runs from the blue base (-x) to the red base (+x). */
export const FIELD = {
  hx: 50, hz: 30,
  stands: [{ x: -44, z: 0 }, { x: 44, z: 0 }] as const,
  spawns: [
    [{ x: -47, z: 0 }, { x: -46, z: -4 }, { x: -46, z: 4 }, { x: -48, z: -7 }, { x: -48, z: 7 }],
    [{ x: 47, z: 0 }, { x: 46, z: 4 }, { x: 46, z: -4 }, { x: 48, z: 7 }, { x: 48, z: -7 }],
  ] as const,
  /** The low fence ring around each base (centre, radius); gaps face the river and both flanks. */
  fence: { r: 11, post: .9, step: 9, gaps: [0, 90, -90], gapHalf: 13 },
  /** The river runs north-south through the middle; three bridges cross it. */
  river: { half: 3.4, bridges: [-17, 0, 17], bridgeHalf: 2.8 },
  /** Jump pads: stand on one and it throws you to (tx, tz). team -1 = everyone. */
  pads: [
    { x: -8, z: 24, tx: 12, tz: 24, team: -1 }, { x: 8, z: 24, tx: -12, tz: 24, team: -1 },
    { x: -8, z: -24, tx: 12, tz: -24, team: -1 }, { x: 8, z: -24, tx: -12, tz: -24, team: -1 },
    { x: -26, z: 0, tx: -9, tz: 6, team: 0 }, { x: 26, z: 0, tx: 9, tz: -6, team: 1 },
  ] as const,
  /** Cover rocks (x, z, r), blue half; the red half mirrors them. */
  rocks: [[-20, -8, 1.6], [-20, 8, 1.6], [-31, -19, 2], [-31, 19, 2], [-14, -14, 1.3], [-14, 14, 1.3], [-37, -12, 1.2], [-37, 12, 1.2], [-22, -25, 1.5], [-22, 25, 1.5]] as const,
  /** Where power-ups appear. */
  powerSpots: [{ x: 0, z: 0 }, { x: -20, z: 0 }, { x: 20, z: 0 }, { x: -15, z: -20 }, { x: 15, z: 20 }, { x: -15, z: 20 }, { x: 15, z: -20 }] as const,
} as const;

export type PowerKind = 'zip' | 'bubble' | 'pumpkin' | 'wisp' | 'bigcap' | 'frost' | 'apple';
/** Seven power-ups (our names and art). w = weight of the roll. */
export const POWERS: Record<PowerKind, { name: string; vi: string; icon: string; color: string; w: number; desc: string; viDesc: string }> = {
  zip: { name: 'Zippy Boots', vi: 'Giày Vèo Vèo', icon: '👟', color: '#ffd23f', w: 3, desc: '+60% speed for 6 seconds', viDesc: '+60% tốc chạy trong 6 giây' },
  bubble: { name: 'Bubble Ward', vi: 'Bong Bóng Hộ Thân', icon: '🫧', color: '#8fe3ff', w: 3, desc: 'A bubble soaks up 350 damage', viDesc: 'Bong bóng đỡ 350 sát thương' },
  pumpkin: { name: 'Pumpkin Popper', vi: 'Bí Ngô Nổ Bụp', icon: '🎃', color: '#ff9a3c', w: 2, desc: 'Pops 2 seconds later and throws foes nearby back', viDesc: '2 giây sau nổ bụp, hất văng kẻ địch xung quanh' },
  wisp: { name: 'Wisp Cloak', vi: 'Áo Choàng Đom Đóm', icon: '👻', color: '#c8b8ff', w: 2, desc: 'Unseen for 5 seconds (not while carrying a flag)', viDesc: 'Tàng hình 5 giây (trừ khi đang cầm cờ)' },
  bigcap: { name: 'Big-Cap Mushroom', vi: 'Nấm Mũ To', icon: '🍄', color: '#ff5f6d', w: 2, desc: 'Giant for 8 seconds: tougher and hits harder', viDesc: 'Hoá khổng lồ 8 giây: trâu hơn, đánh đau hơn' },
  frost: { name: 'Frost Burst', vi: 'Bùng Nổ Sương Giá', icon: '❄️', color: '#bff4ff', w: 2, desc: 'Freezes foes around you for 1.5 seconds', viDesc: 'Đóng băng kẻ địch quanh bạn 1,5 giây' },
  apple: { name: 'Sun Apple', vi: 'Táo Mặt Trời', icon: '🍎', color: '#ff4d4d', w: 3, desc: 'Heals you to full', viDesc: 'Hồi đầy máu' },
};
export const POWER_KINDS = Object.keys(POWERS) as PowerKind[];
export const POWER = { zipTime: 6, zipSpeed: .6, bubble: 350, pumpkinFuse: 2, pumpkinR: 4.5, pumpkinPower: 220, pumpkinKnock: 5, wispTime: 5, bigcapTime: 8, bigcapDamage: 1.3, bigcapTaken: .7, frostR: 6, frostTime: 1.5 } as const;

/** How a bot uses a skill (the explorer casts the real disguise kit, combat.ts DISGUISE_KITS). */
export type AiSkillKind = 'blast' | 'nova' | 'line' | 'dash' | 'single' | 'buff' | 'heal' | 'zone' | 'blink';
export interface AiSkill {
  kind: AiSkillKind; cd: number; range?: number; r?: number; len?: number; width?: number; power?: number; delay?: number;
  stun?: number; slow?: number; heal?: number; pull?: boolean; dur?: number;
  buff?: { speed?: number; shield?: number; wisp?: number; giant?: number; evade?: number; time: number };
}
export interface HeroDef { id: string; role: string; vi: string; hp: number; hpL: number; atk: number; atkL: number; def: number; defL: number; as: number; range: number; ms: number; lifesteal?: number; ai: [AiSkill, AiSkill, AiSkill, AiSkill] }
/** The ten heroes: the shared disguises (names, looks and the explorer's kit come from content.ts / combat.ts). */
export const HEROES: Record<string, HeroDef> = {
  dz_knight: { id: 'dz_knight', role: 'Guardian', vi: 'Đỡ đòn', hp: 760, hpL: 92, atk: 52, atkL: 3.6, def: 32, defL: 3, as: .72, range: 2.3, ms: 5.9, ai: [
    { kind: 'buff', cd: 10, buff: { shield: 220, time: 3 } }, { kind: 'dash', cd: 9, range: 9, r: 3, power: 1.4, stun: .6 },
    { kind: 'nova', cd: 12, r: 6, power: .5, stun: .8 }, { kind: 'blast', cd: 45, range: 12, r: 3.5, power: 2.8, delay: .6, stun: .8 }] },
  dz_ninja: { id: 'dz_ninja', role: 'Assassin', vi: 'Sát thủ', hp: 580, hpL: 78, atk: 62, atkL: 4.6, def: 18, defL: 2.4, as: .86, range: 2, ms: 6.3, ai: [
    { kind: 'nova', cd: 12, r: 3.2, power: .9 }, { kind: 'buff', cd: 13, buff: { wisp: 2.5, speed: .3, time: 2.5 } },
    { kind: 'dash', cd: 7, range: 10, r: 1.8, power: 2.2 }, { kind: 'nova', cd: 45, r: 5, power: 1.4, slow: 2 }] },
  dz_mage: { id: 'dz_mage', role: 'Mage', vi: 'Pháp sư', hp: 540, hpL: 74, atk: 50, atkL: 3.4, def: 15, defL: 2, as: .66, range: 7, ms: 5.9, ai: [
    { kind: 'blast', cd: 6, range: 12, r: 3, power: 1.6, delay: .45 }, { kind: 'blink', cd: 10, range: 8 },
    { kind: 'single', cd: 13, range: 10, power: .3, stun: 1.5 }, { kind: 'blast', cd: 45, range: 12, r: 5, power: 2.4, delay: .7, stun: 1, pull: true }] },
  dz_mecha: { id: 'dz_mecha', role: 'Gunner', vi: 'Xạ thủ bọc thép', hp: 660, hpL: 84, atk: 54, atkL: 3.8, def: 24, defL: 2.6, as: .72, range: 6.5, ms: 5.8, ai: [
    { kind: 'buff', cd: 12, buff: { shield: 180, speed: .2, time: 4 } }, { kind: 'zone', cd: 14, r: 5, power: .35, dur: 4 },
    { kind: 'blast', cd: 7, range: 13, r: 2.5, power: 1.5, delay: .5 }, { kind: 'buff', cd: 45, heal: .3, buff: { shield: 300, time: 4 } }] },
  dz_dino: { id: 'dz_dino', role: 'Brawler', vi: 'Đấu sĩ', hp: 720, hpL: 90, atk: 60, atkL: 4.2, def: 26, defL: 2.8, as: .7, range: 2.5, ms: 6, ai: [
    { kind: 'single', cd: 9, range: 3.2, power: 2, heal: .15 }, { kind: 'nova', cd: 6, r: 3.6, power: 1.4 },
    { kind: 'nova', cd: 12, r: 8, power: .3, slow: 2.5 }, { kind: 'buff', cd: 45, buff: { giant: 8, time: 8 } }] },
  dz_fairy: { id: 'dz_fairy', role: 'Support', vi: 'Hỗ trợ', hp: 540, hpL: 76, atk: 46, atkL: 3.2, def: 16, defL: 2.2, as: .7, range: 6.5, ms: 6.1, ai: [
    { kind: 'heal', cd: 12, r: 7, heal: .22 }, { kind: 'buff', cd: 10, buff: { speed: .3, time: 4 } },
    { kind: 'single', cd: 14, range: 10, power: .3, stun: 1.4 }, { kind: 'blast', cd: 45, range: 12, r: 5, power: 1.3, delay: .6, stun: 1.5 }] },
  dz_pirate: { id: 'dz_pirate', role: 'Marksman', vi: 'Xạ thủ', hp: 570, hpL: 80, atk: 58, atkL: 4.3, def: 17, defL: 2.3, as: .82, range: 7.5, ms: 6, ai: [
    { kind: 'line', cd: 9, len: 12, width: 1.4, power: 1.5 }, { kind: 'single', cd: 8, range: 12, power: 1, pull: true, slow: 1.5 },
    { kind: 'single', cd: 10, range: 9, power: 1.1 }, { kind: 'blast', cd: 45, range: 14, r: 5, power: 2.4, delay: .7 }] },
  dz_superhero: { id: 'dz_superhero', role: 'Fighter', vi: 'Đấu sĩ', hp: 650, hpL: 84, atk: 58, atkL: 4, def: 22, defL: 2.5, as: .76, range: 2.3, ms: 6.2, ai: [
    { kind: 'buff', cd: 12, buff: { speed: .5, evade: 1.2, time: 2.5 } }, { kind: 'dash', cd: 9, range: 8, r: 3.2, power: 1.3, stun: .6 },
    { kind: 'line', cd: 8, len: 9, width: 1.4, power: 1.2 }, { kind: 'blast', cd: 45, range: 13, r: 3.6, power: 2.6, delay: .6, stun: 1 }] },
  dz_vampire: { id: 'dz_vampire', role: 'Lifestealer', vi: 'Đấu sĩ hút máu', hp: 610, hpL: 82, atk: 58, atkL: 4.1, def: 20, defL: 2.4, as: .8, range: 2.2, ms: 6.1, lifesteal: .12, ai: [
    { kind: 'single', cd: 6, range: 9, power: 1.3, heal: .6 }, { kind: 'buff', cd: 13, buff: { evade: 1.5, speed: .45, time: 1.5 } },
    { kind: 'zone', cd: 12, r: 3.6, power: .35, dur: 3, heal: .3 }, { kind: 'zone', cd: 45, range: 8, r: 5.6, power: .5, dur: 3, heal: .5, slow: .6 }] },
  dz_snowman: { id: 'dz_snowman', role: 'Frost guard', vi: 'Pháp sư đỡ đòn', hp: 690, hpL: 88, atk: 48, atkL: 3.3, def: 26, defL: 2.8, as: .66, range: 6, ms: 5.7, ai: [
    { kind: 'line', cd: 8, len: 12, width: 1.6, power: 1.3, stun: .9 }, { kind: 'blast', cd: 15, range: 6, r: 3.2, power: 1.4, delay: .6, slow: 1.5 },
    { kind: 'zone', cd: 12, range: 9, r: 4.2, power: .15, dur: 3.5, slow: .6 }, { kind: 'nova', cd: 45, r: 6.6, power: 2.4, delay: .6, stun: 1.4 }] },
};
export const HERO_IDS = Object.keys(HEROES);
/** A hero's numbers at a level (the match plays everyone at CTF.level). */
export function heroStats(id: string, level: number = CTF.level) {
  const h = HEROES[id] ?? HEROES.dz_knight, k = Math.max(0, level - 1);
  return { hp: Math.round(h.hp + h.hpL * k), atk: Math.round((h.atk + h.atkL * k) * 10) / 10, def: Math.round((h.def + h.defL * k) * 10) / 10, as: h.as, range: h.range, ms: h.ms };
}

/** Vietnamese for everything this mode says (registered in locales/vi-catalog.ts). */
export const CTF_VI: Record<string, string> = {
  'Red team: AI opponents': 'Đội đỏ: đối thủ máy',
  'You are blue. Cross the river and take the red flag.': 'Bạn thuộc đội xanh. Qua sông và lấy cờ đỏ.',
  'Bring the red flag back to the blue base.': 'Mang cờ đỏ về căn cứ xanh để ghi điểm.',
  'Recover your blue flag before you can score.': 'Lấy lại cờ xanh của đội mình trước khi ghi điểm.',
  'Arena map: blue allies, red AI opponents, white ring is you.': 'Bản đồ: xanh là đồng đội, đỏ là đối thủ máy, viền trắng là bạn.',

  ...Object.fromEntries(Object.values(POWERS).flatMap(p => [[p.name, p.vi], [p.desc, p.viDesc]])),
  ...Object.fromEntries(Object.values(HEROES).map(h => [h.role, h.vi])),
  'Multiworld Gate': 'Cổng Đa Thế Giới',
  'Gatekeeper Orrin': 'Người Gác Cổng Orrin',
  'Flag Rush': 'Giật Cờ',
  'Lane Clash': 'Đại Chiến Ba Đường',
  'Last One Standing': 'Đấu Trường Sinh Tồn',
  'Gate': 'Cổng',
  'Beyond this gate wait many other worlds. Fancy a match? Pick a mode!': 'Sau cánh cổng này là bao thế giới khác. Thử một trận nhé? Chọn chế độ đi!',
  'Grab the other team\'s flag, carry it home to your own stand while your flag is safe, and score. First to 3 wins. Jump pads fling you over the river, 7 fun power-ups, 10 heroes with their ultimate ready. No gear is ever lost, and winners earn EXP.': 'Cướp cờ đội bạn, mang về bệ cờ nhà mình khi cờ nhà vẫn an toàn để ghi điểm. 3 điểm là thắng. Bệ nhún hất bạn qua sông, 7 vật phẩm vui, 10 tướng mở sẵn chiêu cuối. Không bao giờ mất đồ, đội thắng nhận EXP.',
  'Three lanes, towers and a big boss. Being polished so it is easier to play.': 'Ba đường, trụ và một trùm lớn. Đang được hoàn thiện cho dễ chơi hơn.',
  'Everyone jumps in; the last explorer standing wins.': 'Mọi người cùng vào, ai trụ lại cuối cùng là người thắng.',
  'PLAY': 'CHƠI',
  'Locked': 'Tạm khoá',
  'Coming soon': 'Sắp ra mắt',
  'Online — coming soon': 'Trực tuyến — sắp ra mắt',
  'Practice vs AI': 'Luyện tập với AI',
  'Back to modes': 'Về chọn chế độ',
  'Team size': 'Số người mỗi đội',
  'Pick your hero': 'Chọn tướng của bạn',
  'Start the match': 'Bắt đầu trận',
  'Your AI neighbours join your team; an AI team plays the other side. Online rooms come later.': 'Hàng xóm AI vào đội bạn; một đội AI chơi phía bên kia. Phòng trực tuyến sẽ có sau.',
  'First to 3 · 8 minutes · everyone at level 8 with the ultimate ready · no gear lost · EXP for winners': '3 điểm thắng · 8 phút · ai cũng cấp 8, mở sẵn chiêu cuối · không mất đồ · thưởng EXP cho đội thắng',
  'Touch the enemy flag to take it. Bring it to your own stand while your flag is home: +1. A downed carrier drops the flag; a teammate touching it sends it home at once, or it flies home by itself after 15 s. The carrier runs 15% slower, is always seen and cannot teleport.': 'Chạm cờ địch để cướp. Mang về bệ cờ nhà mình khi cờ nhà vẫn ở nhà: +1 điểm. Người cầm cờ bị hạ thì cờ rơi; đồng đội chạm vào là cờ về nhà ngay, nếu không cờ tự bay về sau 15 giây. Người cầm cờ chạy chậm hơn 15%, luôn bị lộ và không dịch chuyển được.',
  'Rewarded matches left today: {n}': 'Số trận còn thưởng hôm nay: {n}',
  'Blue team': 'Đội Xanh', 'Red team': 'Đội Đỏ',
  'You': 'Bạn',
  'Leave the match': 'Rời trận',
  'Leave the match? It counts as a loss.': 'Rời trận? Trận này sẽ tính là thua.',
  'Leave': 'Rời đi', 'Stay': 'Ở lại',
  'First to 3 points': '3 điểm là thắng',
  'GOLDEN POINT — the next capture wins!': 'ĐIỂM VÀNG — ai ghi điểm tiếp theo sẽ thắng!',
  'Overtime!': 'Hiệp phụ!',
  'Go!': 'Bắt đầu!',
  'Respawning in {s}s': 'Hồi sinh sau {s} giây',
  'You were knocked down': 'Bạn bị hạ gục',
  'Our flag is home': 'Cờ nhà an toàn',
  'Our flag was taken!': 'Cờ nhà bị cướp!',
  'Our flag is down: {s}s': 'Cờ nhà rơi: {s} giây',
  'Enemy flag': 'Cờ địch',
  'You carry the flag!': 'Bạn đang cầm cờ!',
  'Enemy flag down: {s}s': 'Cờ địch rơi: {s} giây',
  '{name} took the {team} flag!': '{name} đã cướp cờ {team}!',
  '{name} took our flag! Stop them!': '{name} đã cướp cờ nhà mình! Chặn lại!',
  '{name} was knocked down: the {team} flag fell!': '{name} bị hạ: cờ {team} rơi xuống đất!',
  '{name} sent the {team} flag home!': '{name} đã trả cờ {team} về nhà!',
  'The {team} flag flew home by itself': 'Cờ {team} tự bay về nhà',
  '{name} SCORES! {a} – {b}': '{name} GHI ĐIỂM! {a} – {b}',
  '{name} picked up {power}': '{name} nhặt được {power}',
  'A power-up appeared: {power}': 'Vật phẩm xuất hiện: {power}',
  'blue': 'Xanh', 'red': 'Đỏ',
  'VICTORY!': 'CHIẾN THẮNG!', 'DEFEAT': 'THUA MẤT RỒI!', 'DRAW': 'HOÀ!',
  'Three flags captured': 'Ghi đủ 3 điểm', 'Time is up': 'Hết giờ', 'Golden point': 'Điểm vàng', 'A team left': 'Một đội rời trận',
  'Flags': 'Cướp', 'Returns': 'Trả', 'K/D': 'H/C',
  '+{xp} EXP': '+{xp} EXP',
  'Flag Rush never takes your gear. Another round?': 'Giật Cờ không bao giờ lấy đồ của bạn. Thêm trận nữa nhé?',
  'Play again': 'Chơi lại', 'Back home': 'Về nhà',
  'No EXP this time: today\'s rewarded matches are used up.': 'Lần này không có EXP: đã hết lượt trận có thưởng hôm nay.',
  'The Multiworld Gate opens…': 'Cổng Đa Thế Giới đang mở…',
  'Flag Rush Isle': 'Đảo Giật Cờ',
  'Touch me to play Flag Rush!': 'Chạm vào ta để chơi Giật Cờ!',
  'Golden point: next capture wins': 'Điểm vàng: ai ghi điểm tiếp sẽ thắng',
  'carrying': 'đang cầm cờ',
  'Welcome back from Flag Rush Isle.': 'Chào mừng trở về từ Đảo Giật Cờ.',
  'The flag carrier cannot teleport!': 'Người cầm cờ không dịch chuyển được!',
  'Bring it home!': 'Mang về nhà nào!',
  'That match was already counted, or it was too short for EXP.': 'Trận này đã được tính rồi, hoặc quá ngắn để nhận EXP.',
  'You score! {a} – {b}': 'Bạn ghi điểm! {a} – {b}',
  'Point for the blue team!': 'Đội Xanh ghi điểm!',
  'The red team scores!': 'Đội Đỏ ghi điểm!',
  'Matches shorter than {s} seconds earn no EXP.': 'Trận ngắn hơn {s} giây không có EXP.',
  'BEYOND THE GATE': 'BÊN KIA CÁNH CỔNG',
  'CAPTURE THE FLAG': 'CƯỚP CỜ',
  'FLAG RUSH': 'GIẬT CỜ',
};
