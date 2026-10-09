/**
 * Rescue Call content (docs/RESCUE-CALL-PLAN.md, phase 1 "Hold the Line"): the missions, their fields (lanes with
 * merges and forks, build pads, guard posts, the camp), the wave tables, the five first defences, the enemy roles, the
 * squad's skills, the Spark/Star bit economy and the rewards. Pure data and small pure helpers, no DOM, no three.js:
 * the rules (rescue-rules.ts), the runtime (rescue.ts), the server (actions.ts → rescue-claim.ts) and the tests read it.
 *
 * Field coordinates are "landscape local": your end (the camp and the friend's farmhouse) on the left at −x, enemies
 * walk in from the right (+x); z runs across the lanes. Portrait play rotates the whole field (rescue-rules.ts toWorld).
 */
import type { PlanetId } from './content.ts';

export type MissionId = 'toy' | 'candy' | 'jungle';
export type EnemyRole = 'runner' | 'grunt' | 'brute' | 'flyer' | 'shooter' | 'splitter' | 'mini' | 'boss';
export type DefenceKind = 'popcorn' | 'tesla' | 'cannon' | 'wall' | 'frost';
export type SquadRole = 'fighter' | 'ranged' | 'support';
export type Point = { x: number; z: number };

export const RESCUE = {
  hearts: 10, startSpark: 150, startStars: 0,
  /** Seconds to build before the first wave and between waves (the player may skip ahead). */
  firstBuild: 40, build: 25,
  maxSquad: 5, maxLive: 40,
  /** The field's half extents (landscape local) and the line enemies must cross to leak. */
  half: { x: 32, z: 16 }, endX: -27,
  camp: { x: -29.5, z: 0 },
  /** A squad member at 0 HP falls back to the camp and recovers for this long; the hero respawns after `heroDown`. */
  recover: 15, heroDown: 5,
  sellBack: .6,
  /** Hearts lost per leak: the wave boss takes three. */
  leak: { normal: 1, boss: 3 },
  /** Health rises per wave (×1.18 a wave, ×1.4 on a boss wave); damage rises slowly (×1.06 a wave). */
  hpPerWave: 1.18, bossWaveHp: 1.4, dmgPerWave: 1.06,
  /** Spark for clearing a wave: base + per wave number. Star bits: one per cleared wave. */
  waveSpark: { base: 40, per: 10 }, waveStars: 1,
  /** A kill's Spark grows by this share each wave. */
  sparkPerWave: .15,
  /** Where the field is built on the home map: far out in the south-east meadow, out of sight of the village. */
  arena: { x: 70, z: 80 },
  /** The SOS portal by the south square (village coordinates). */
  portal: { x: 2.5, z: 35 },
} as const;

// ---------------------------------------------------------------- enemy roles
export interface RoleDef { hp: number; dmg: number; speed: number; spark: number; star: number; air: boolean; /** Stops at squad members and walls. */ blocked: boolean; /** Smashes defences it passes. */ smash: boolean; range: number; cd: number; radius: number }
export const ROLES: Record<EnemyRole, RoleDef> = {
  runner:   { hp: .55, dmg: .6, speed: 3.6, spark: 5,  star: .02, air: false, blocked: false, smash: false, range: 1.2, cd: 1.0, radius: .55 },
  grunt:    { hp: 1,   dmg: 1,  speed: 2.2, spark: 6,  star: .03, air: false, blocked: true,  smash: false, range: 1.3, cd: 1.2, radius: .65 },
  brute:    { hp: 2.6, dmg: 1.6, speed: 1.45, spark: 14, star: .25, air: false, blocked: true, smash: true,  range: 1.6, cd: 1.6, radius: .85 },
  flyer:    { hp: .7,  dmg: .7, speed: 2.7, spark: 7,  star: .04, air: true,  blocked: false, smash: false, range: 1.2, cd: 1.1, radius: .55 },
  shooter:  { hp: .9,  dmg: .9, speed: 1.8, spark: 8,  star: .05, air: false, blocked: true,  smash: false, range: 6,   cd: 2.0, radius: .65 },
  splitter: { hp: 1.2, dmg: .9, speed: 2.0, spark: 6,  star: .04, air: false, blocked: true,  smash: false, range: 1.3, cd: 1.3, radius: .7 },
  mini:     { hp: .28, dmg: .4, speed: 3.0, spark: 2,  star: 0,   air: false, blocked: true,  smash: false, range: 1.1, cd: 1.0, radius: .45 },
  boss:     { hp: 1,   dmg: 2.4, speed: 1.15, spark: 100, star: 1,  air: false, blocked: true,  smash: true,  range: 2.4, cd: 2.2, radius: 1.5 },
};
/** Star bits a kill always gives (on top of the chance): bosses 5. */
export const BOSS_STARS = 5;
/** A splitter breaks into this many minis. */
export const SPLIT_INTO = 3;

// ---------------------------------------------------------------- defences
export interface DefenceLevel { cost: number; hp: number; range: number; dmg: number; rate: number; chain?: number; splash?: number; slow?: number; freeze?: number; block?: number }
export interface DefenceDef { name: string; icon: string; desc: string; air: boolean; levels: [DefenceLevel, DefenceLevel, DefenceLevel] }
export const DEFENCES: Record<DefenceKind, DefenceDef> = {
  popcorn: { name: 'Popcorn turret', icon: '🍿', desc: 'Fast single shots. Hits flyers.', air: true, levels: [
    { cost: 50, hp: 190, range: 6.5, dmg: 8, rate: 2.2 }, { cost: 45, hp: 260, range: 7.5, dmg: 13, rate: 2.6 }, { cost: 70, hp: 340, range: 8.5, dmg: 18, rate: 3.2 }] },
  tesla: { name: 'Tesla coil', icon: '⚡', desc: 'Zaps one foe and chains to the next ones. Short range. Hits flyers.', air: true, levels: [
    { cost: 80, hp: 220, range: 4.6, dmg: 14, rate: 1, chain: 3 }, { cost: 70, hp: 290, range: 5, dmg: 21, rate: 1.1, chain: 4 }, { cost: 100, hp: 370, range: 5.4, dmg: 28, rate: 1.2, chain: 5, slow: .3 }] },
  cannon: { name: 'Deck cannon', icon: '💣', desc: 'Slow, heavy splash on the ground. Cannot hit flyers.', air: false, levels: [
    { cost: 90, hp: 260, range: 8.5, dmg: 30, rate: .5, splash: 2.2 }, { cost: 80, hp: 340, range: 9, dmg: 46, rate: .55, splash: 2.6 }, { cost: 120, hp: 430, range: 9.5, dmg: 64, rate: .6, splash: 3.2 }] },
  wall: { name: 'Sandbag wall', icon: '🧱', desc: 'Blocks the nearest lane until it breaks. Flyers pass over.', air: false, levels: [
    { cost: 40, hp: 510, range: 0, dmg: 0, rate: 0, block: 2.4 }, { cost: 35, hp: 830, range: 0, dmg: 0, rate: 0, block: 2.6 }, { cost: 55, hp: 1280, range: 0, dmg: 0, rate: 0, block: 2.8 }] },
  frost: { name: 'Frost lantern', icon: '🏮', desc: 'Slows every foe in its glow. At level 3 it freezes them briefly.', air: true, levels: [
    { cost: 60, hp: 180, range: 4.2, dmg: 2, rate: 2, slow: .4 }, { cost: 55, hp: 240, range: 4.8, dmg: 3, rate: 2, slow: .5 }, { cost: 80, hp: 320, range: 5.4, dmg: 4, rate: 2, slow: .55, freeze: .8 }] },
};
export const DEFENCE_KINDS = Object.keys(DEFENCES) as DefenceKind[];
/** Spark spent on a defence up to `level`. */
export const defenceSpent = (kind: DefenceKind, level: number) => DEFENCES[kind].levels.slice(0, Math.max(0, Math.min(3, level))).reduce((n, l) => n + l.cost, 0);
/** How often a level-3 frost lantern freezes (seconds). */
export const FREEZE_EVERY = 4;

// ---------------------------------------------------------------- the squad: base numbers, ladder prices, skills
/** A squad member's stats at step 0 (plain clothes, a punch). Gear stats are added on top (rescue-ladder.ts). */
export const SQUAD_BASE = { hp: 120, atk: 6, def: 0, range: 1.3, rate: 1, speed: 3.6, leash: { hold: 5.5, follow: 7 } } as const;
/** Spark and Star bits for each ladder step 1..6 (index 0 is unused). */
export const LADDER_COST: ReadonlyArray<{ spark: number; stars: number }> = [
  { spark: 0, stars: 0 }, { spark: 35, stars: 0 }, { spark: 45, stars: 0 }, { spark: 60, stars: 1 }, { spark: 75, stars: 2 }, { spark: 90, stars: 3 }, { spark: 110, stars: 4 },
];
export const LADDER_STEPS = 6;
/** What each step gives, for the panel. */
export const STEP_TEXT: readonly string[] = [
  'Plain clothes and a punch', 'A starter weapon', 'A work outfit', 'A better weapon', 'A disguise with one skill', 'The second skill and armour', 'Top weapon and the ultimate',
];
/** Skill numbers by role: [skill 1 (step 4), skill 2 (step 5), ultimate (step 6)]. `mul` × attack, `r` metres, `cd` seconds. */
export interface SquadSkill { kind: 'slam' | 'volley' | 'heal' | 'charge' | 'snare' | 'guard' | 'ult'; mul: number; r: number; cd: number; stun?: number; heal?: number; slow?: number; targets?: number }
export const SQUAD_SKILLS: Record<SquadRole, [SquadSkill, SquadSkill, SquadSkill]> = {
  fighter: [{ kind: 'slam', mul: 2.2, r: 2.6, cd: 9, stun: 1 }, { kind: 'charge', mul: 3, r: 5, cd: 13, stun: .6 }, { kind: 'ult', mul: 6, r: 4.5, cd: 26, stun: 1.5 }],
  ranged: [{ kind: 'volley', mul: 1.6, r: 8, cd: 8, targets: 4 }, { kind: 'snare', mul: 1.2, r: 3, cd: 13, slow: .6 }, { kind: 'ult', mul: 5, r: 5, cd: 26 }],
  support: [{ kind: 'heal', mul: 0, r: 5.5, cd: 10, heal: .3 }, { kind: 'guard', mul: 1, r: 3.5, cd: 14, slow: .5, heal: .15 }, { kind: 'ult', mul: 4, r: 5.5, cd: 26, heal: .5 }],
};
/** The hero's mission boosts (the Me tab): reset at the end of the mission. `max` buys of each. */
export type BoostKind = 'dmg' | 'haste' | 'cdr' | 'potion' | 'shield';
export const BOOSTS: Record<BoostKind, { name: string; icon: string; desc: string; spark: number; stars: number; max: number; value: number }> = {
  dmg: { name: 'Sharper hits', icon: '🗡️', desc: '+20% damage', spark: 60, stars: 0, max: 3, value: .2 },
  haste: { name: 'Quick hands', icon: '💨', desc: '+12% attack speed', spark: 55, stars: 0, max: 3, value: .12 },
  cdr: { name: 'Calm focus', icon: '🌀', desc: 'Skill cooldowns −10%', spark: 50, stars: 1, max: 3, value: .1 },
  potion: { name: 'Heal potion', icon: '🧪', desc: 'Heal 60% now', spark: 30, stars: 0, max: 99, value: .6 },
  shield: { name: 'Bubble shield', icon: '🫧', desc: 'Absorbs 40% of your health for 20 s', spark: 40, stars: 0, max: 99, value: .4 },
};
export const BOOST_KINDS = Object.keys(BOOSTS) as BoostKind[];
export const SHIELD_TIME = 20;

/** The hero at the mission's recommended level: hits land as this hero's, whatever the explorer's real level. */
export const heroAtk = (level: number) => 12 + (level - 1) * 1.6 + 8;
export const heroHp = (level: number) => 180 + (level - 1) * 14;

// ---------------------------------------------------------------- the fields
export interface LaneDef { /** One route, or two for a fork (enemies take them in turn). */ routes: Point[][]; /** Only on wide screens (landscape). */ wide?: boolean }
/** `pads`: how many build pads (narrow, wide). They are placed by rescue-rules.ts padSpots beside the paths, where most lane length is in reach. */
export interface FieldDef { lanes: LaneDef[]; pads: [number, number]; /** Guard posts the squad holds: on a route, near your end. */ posts: Array<{ lane: number; route?: number; at: number }>; decor: Array<[string, number, number, number?]> }

const R = (...pts: Array<[number, number]>): Point[] => pts.map(([x, z]) => ({ x, z }));
export const FIELDS: Record<MissionId, FieldDef> = {
  // Toybox: three lanes; the top two merge into one choke before the camp, the bottom one runs alone.
  toy: {
    lanes: [
      { routes: [R([31, -10], [18, -10.5], [8, -7], [-2, -6], [-10, -2.5], [-18, -1], [-27.5, -1])] },
      { routes: [R([31, 0], [20, 1.5], [10, 1.5], [0, -.5], [-10, -2.5], [-18, -1], [-27.5, -1])] },
      { routes: [R([31, 10], [20, 9.5], [8, 10], [-4, 7.5], [-14, 7], [-27.5, 6])] },
    ],
    pads: [10, 10],
    posts: [{ lane: 1, at: .7 }, { lane: 2, at: .7 }, { lane: 1, at: .84 }, { lane: 2, at: .86 }, { lane: 0, at: .52 }],
    decor: [['rs_blocks', 4, -13], ['rs_blocks', -6, 13], ['rs_ball', 14, 5], ['rs_crate', -20, -10], ['rs_crate', 22, -4.5], ['rs_blocks', 26, 5]],
  },
  // Candy: the middle lane forks round a candy rock and joins again; a fourth lane opens on wide screens.
  candy: {
    lanes: [
      { routes: [R([31, -11], [18, -11], [6, -8.5], [-6, -5], [-16, -2], [-27.5, -2])] },
      { routes: [R([31, 1], [20, 1], [12, 1], [6, -2.5], [-2, -2.5], [-8, 1], [-18, 2], [-27.5, 2]), R([31, 1], [20, 1], [12, 1], [6, 4.5], [-2, 4.5], [-8, 1], [-18, 2], [-27.5, 2])] },
      { routes: [R([31, 11], [18, 11], [6, 9.5], [-6, 6], [-16, 2.2], [-27.5, 2])] },
      { routes: [R([31, -15], [12, -14.5], [-4, -12], [-14, -8], [-27.5, -6])], wide: true },
    ],
    pads: [10, 11],
    posts: [{ lane: 1, at: .72 }, { lane: 0, at: .7 }, { lane: 2, at: .7 }, { lane: 1, at: .86 }, { lane: 3, at: .7 }],
    decor: [['rs_candyrock', 2, 1], ['rs_candyrock', 20, -6], ['rs_candyrock', -12, 12.5], ['rs_crate', 24, 6.5], ['rs_crate', -20, -12.5]],
  },
  // Wild Jungle: two pairs of lanes merge, the middle lane forks; two more lanes open on wide screens.
  jungle: {
    lanes: [
      { routes: [R([31, -9], [18, -9], [8, -6.5], [-4, -3.5], [-14, -2], [-27.5, -2])] },
      { routes: [R([31, 0], [22, 0], [14, -1], [6, -3.5], [-4, -3.5], [-14, -2], [-27.5, -2]), R([31, 0], [22, 0], [14, 1], [6, 4], [-4, 4.5], [-14, 3.5], [-27.5, 3.5])] },
      { routes: [R([31, 9], [18, 9], [8, 7], [-4, 4.5], [-14, 3.5], [-27.5, 3.5])] },
      { routes: [R([31, -14.5], [14, -14], [0, -11], [-14, -8.5], [-27.5, -7.5])], wide: true },
      { routes: [R([31, 14.5], [14, 14], [0, 11.5], [-14, 9.5], [-27.5, 8.5])], wide: true },
    ],
    pads: [10, 12],
    posts: [{ lane: 0, at: .74 }, { lane: 2, at: .74 }, { lane: 1, route: 0, at: .62 }, { lane: 3, at: .72 }, { lane: 4, at: .72 }],
    decor: [['rs_bush', 6, 0], ['rs_bush', 22, -5], ['rs_bush', 22, 5], ['rs_crate', -21, -12], ['rs_bush', -9, 13], ['rs_bush', -9, -13.5]],
  },
};

// ---------------------------------------------------------------- the missions and their wave tables
export interface WaveGroup { role: EnemyRole; n: number; lane: number; gap: number; at: number }
export interface WaveDef { groups: WaveGroup[]; boss: boolean; /** Health factor of this wave (rising). */ hp: number; /** Damage factor (rising slowly). */ dmg: number }
export interface MissionDef {
  id: MissionId; planet: PlanetId; level: number; friend: string; friendIcon: string; title: string; story: string;
  /** Planet creatures for each role (ENEMY_TYPES ids), at their normal size. */ kinds: Partial<Record<EnemyRole, string>>;
  /** A light raider tint over the creature's own colours. */ tint: string;
  /** The mission's own health scale (its creatures are tougher planet by planet already). */ hpScale: number;
  waves: WaveDef[]; ground: [string, string, string]; sky: string; fog: string;
  gift: { crop: string; crops: number; decor: string; rare: string };
}
const waveHp = (i: number, boss: boolean) => Math.round(Math.pow(RESCUE.hpPerWave, i) * (boss ? RESCUE.bossWaveHp : 1) * 1000) / 1000;
const waveDmg = (i: number) => Math.round(Math.pow(RESCUE.dmgPerWave, i) * 1000) / 1000;
type G = [EnemyRole, number, number, number?, number?]; // role, count, lane, gap, start
function waves(list: Array<{ g: G[]; boss?: boolean }>): WaveDef[] {
  return list.map((w, i) => ({ boss: !!w.boss, hp: waveHp(i, !!w.boss), dmg: waveDmg(i), groups: w.g.map(([role, n, lane, gap = 1.6, at = 0]) => ({ role, n, lane, gap, at })) }));
}
export const MISSIONS: Record<MissionId, MissionDef> = {
  toy: {
    id: 'toy', planet: 'toy', level: 4, friend: 'Tinker Tess', friendIcon: '🧸', title: 'Hold the Line on Toybox',
    story: 'The toy maker\'s workshop farm is under attack! Wind-up raiders are marching on her farmhouse.',
    kinds: { runner: 'windmouse', grunt: 'toysoldier', brute: 'jackbox', shooter: 'toysoldier', flyer: 'bee', boss: 'robot' },
    tint: '#ffe9d6', hpScale: 1.2, ground: ['#8fd36a', '#a5e07a', '#e8d29a'], sky: '#bfe6ff', fog: '#d6efff',
    gift: { crop: 'pumpkin', crops: 6, decor: 'deco_teddy', rare: 'hat_viking' },
    waves: waves([
      { g: [['grunt', 5, 1, 1.8], ['grunt', 3, 2, 2, 4]] },
      { g: [['grunt', 5, 0, 1.6], ['runner', 5, 2, 1.1, 2], ['grunt', 3, 1, 1.8, 6]] },
      { g: [['grunt', 6, 1, 1.4], ['brute', 1, 0, 2, 5], ['runner', 5, 2, 1, 3], ['flyer', 3, 1, 1.4, 9]] },
      { g: [['shooter', 3, 0, 2], ['grunt', 7, 1, 1.2, 1], ['runner', 6, 2, .9, 4], ['brute', 2, 1, 4, 8]] },
      { g: [['flyer', 6, 0, 1.1], ['brute', 3, 1, 3.4, 2], ['grunt', 8, 2, 1.1, 1], ['shooter', 3, 1, 2, 9], ['runner', 6, 0, .9, 12]] },
      { boss: true, g: [['grunt', 8, 1, 1.1], ['runner', 6, 2, .9, 2], ['brute', 2, 0, 4, 6], ['boss', 1, 1, 1, 12], ['flyer', 4, 2, 1.2, 14]] },
    ]),
  },
  candy: {
    id: 'candy', planet: 'candy', level: 6, friend: 'Baker Bun', friendIcon: '🧁', title: 'Hold the Line on Candy',
    story: 'The baker\'s sugar farm is surrounded! Gummy raiders want every last cupcake.',
    kinds: { runner: 'gummy', grunt: 'bunny', splitter: 'jelly', mini: 'jelly', shooter: 'lollipop', brute: 'chocobeetle', flyer: 'bee', boss: 'cake' },
    tint: '#cdb8ff', hpScale: 1.15, ground: ['#ffb3d6', '#ffc9e3', '#fff0c2'], sky: '#ffd9ec', fog: '#ffe6f3',
    gift: { crop: 'candy', crops: 6, decor: 'deco_rainbow', rare: 'hat_viking' },
    waves: waves([
      { g: [['grunt', 6, 1, 1.7], ['grunt', 3, 0, 2, 5]] },
      { g: [['splitter', 3, 1, 2.4], ['runner', 5, 2, 1.1, 2], ['grunt', 4, 0, 1.6, 4], ['grunt', 3, 3, 1.8, 6]] },
      { g: [['grunt', 7, 0, 1.3], ['splitter', 3, 2, 2.2, 3], ['flyer', 4, 1, 1.3, 6], ['runner', 4, 3, 1, 8]] },
      { g: [['brute', 2, 1, 4], ['shooter', 3, 0, 2, 3], ['runner', 7, 2, .9, 1], ['splitter', 4, 1, 2, 8]] },
      { g: [['flyer', 5, 2, 1.1], ['splitter', 3, 0, 2.2, 2], ['brute', 2, 1, 4, 4], ['grunt', 6, 3, 1.2, 1]] },
      { g: [['runner', 7, 0, .9], ['shooter', 3, 2, 2, 3], ['brute', 2, 1, 3.5, 6], ['splitter', 3, 2, 2.2, 10], ['flyer', 4, 1, 1.2, 12]] },
      { boss: true, g: [['grunt', 6, 1, 1.2], ['splitter', 3, 0, 2.2, 3], ['flyer', 4, 2, 1.2, 5], ['brute', 2, 3, 4, 7], ['boss', 1, 1, 1, 13]] },
    ]),
  },
  jungle: {
    id: 'jungle', planet: 'jungle', level: 8, friend: 'Ranger Rook', friendIcon: '🦜', title: 'Hold the Line in the Wild Jungle',
    story: 'The ranger\'s banana farm is overrun! Boars and bees are charging down every jungle trail.',
    kinds: { runner: 'snake', grunt: 'monkey', brute: 'boar', shooter: 'flytrap', flyer: 'bee', boss: 'gorilla' },
    tint: '#eaffdc', hpScale: 1.05, ground: ['#4fb84a', '#66c95a', '#d9c486'], sky: '#bdeccf', fog: '#d2f2dc',
    gift: { crop: 'mango', crops: 6, decor: 'deco_rafflesia', rare: 'hat_samurai' },
    waves: waves([
      { g: [['grunt', 6, 0, 1.7], ['grunt', 4, 2, 1.8, 3]] },
      { g: [['runner', 6, 1, 1], ['brute', 1, 0, 2, 3], ['grunt', 5, 2, 1.5, 4], ['grunt', 3, 3, 1.8, 6]] },
      { g: [['flyer', 5, 1, 1.2], ['grunt', 7, 0, 1.3, 2], ['brute', 2, 2, 3.5, 5], ['runner', 4, 4, 1, 7]] },
      { g: [['shooter', 3, 1, 2], ['runner', 8, 2, .9, 1], ['brute', 2, 0, 4, 5], ['flyer', 4, 3, 1.2, 9]] },
      { g: [['brute', 3, 1, 3.5], ['flyer', 5, 0, 1.1, 2], ['grunt', 6, 2, 1.2, 1], ['shooter', 2, 4, 2, 8]] },
      { g: [['runner', 8, 0, .9], ['brute', 2, 2, 3.5, 2], ['shooter', 3, 1, 2, 5], ['flyer', 5, 3, 1.1, 9]] },
      { g: [['grunt', 8, 1, 1.1], ['brute', 3, 0, 3.5, 3], ['flyer', 5, 2, 1, 6], ['runner', 6, 4, .9, 10]] },
      { boss: true, g: [['grunt', 6, 1, 1.2], ['brute', 2, 0, 4, 2], ['flyer', 5, 2, 1.1, 5], ['runner', 5, 3, 1, 8], ['boss', 1, 1, 1, 13]] },
    ]),
  },
};
export const MISSION_IDS = Object.keys(MISSIONS) as MissionId[];

// ---------------------------------------------------------------- rewards and the SOS schedule
export const RESCUE_REWARD = {
  /** EXP and energy per wave cleared: base + per recommended level. */
  xpPerWave: { base: 40, perLevel: 10 }, energyPerWave: { base: 30, perLevel: 10 },
  winXp: 200,
  /** Waves that pay per day (all missions together), and winning missions that pay in full (with the gift). */
  wavesPerDay: 40, winsPerDay: 5,
  /** A win after the daily five pays this share of the EXP and energy, and no gift. */
  afterCap: .25,
  rareChance: .06,
  /** No wave is cleared faster than this (seconds per wave, counting the build phase). */
  minSecondsPerWave: 18,
} as const;
export const SOS = {
  /** Minutes of play between calls (a random point in this window). */ every: [30, 60] as const,
  /** A call waits this long (minutes of play) before it fades. */ lasts: 12,
  /** At most this many calls a day. */ perDay: 4,
  /** The first call comes sooner, after this many minutes of play. */ first: 6,
} as const;

/** Vietnamese for every Rescue Call text (merged into the catalog in locales/vi-catalog.ts). */
export const RESCUE_VI: Record<string, string> = {
  'Rescue Call': 'Lời Kêu Cứu',
  'RESCUE CALL': 'LỜI KÊU CỨU',
  'Hold the Line on Toybox': 'Giữ Vững Phòng Tuyến ở Hành tinh Đồ chơi',
  'Hold the Line on Candy': 'Giữ Vững Phòng Tuyến ở Hành tinh Kẹo',
  'Hold the Line in the Wild Jungle': 'Giữ Vững Phòng Tuyến ở Rừng Hoang',
  'Tinker Tess': 'Cô Thợ Tess', 'Baker Bun': 'Bác Thợ Bánh Bun', 'Ranger Rook': 'Anh Kiểm Lâm Rook',
  'The toy maker\'s workshop farm is under attack! Wind-up raiders are marching on her farmhouse.': 'Nông trại xưởng đồ chơi của cô thợ đang bị tấn công! Đội quân lên dây cót đang tiến về nhà cô ấy.',
  'The baker\'s sugar farm is surrounded! Gummy raiders want every last cupcake.': 'Nông trại đường của bác thợ bánh bị bao vây! Lũ cướp kẹo dẻo muốn lấy hết bánh nướng.',
  'The ranger\'s banana farm is overrun! Boars and bees are charging down every jungle trail.': 'Nông trại chuối của anh kiểm lâm bị tràn ngập! Lợn rừng và ong đang lao xuống mọi lối mòn.',
  'Popcorn turret': 'Tháp bỏng ngô', 'Tesla coil': 'Cuộn Tesla', 'Deck cannon': 'Đại bác boong', 'Sandbag wall': 'Tường bao cát', 'Frost lantern': 'Đèn lồng băng',
  'Fast single shots. Hits flyers.': 'Bắn nhanh từng phát. Bắn được quái bay.',
  'Zaps one foe and chains to the next ones. Short range. Hits flyers.': 'Giật điện một kẻ địch rồi lan sang những kẻ kế bên. Tầm ngắn. Bắn được quái bay.',
  'Slow, heavy splash on the ground. Cannot hit flyers.': 'Chậm, nổ lan mạnh trên mặt đất. Không bắn được quái bay.',
  'Blocks the nearest lane until it breaks. Flyers pass over.': 'Chặn làn đường gần nhất cho tới khi vỡ. Quái bay bay qua được.',
  'Slows every foe in its glow. At level 3 it freezes them briefly.': 'Làm chậm mọi kẻ địch trong vùng sáng. Cấp 3 đóng băng chúng một chút.',
  'Sharper hits': 'Đòn sắc hơn', 'Quick hands': 'Tay nhanh', 'Calm focus': 'Tập trung', 'Heal potion': 'Bình hồi máu', 'Bubble shield': 'Khiên bong bóng',
  '+20% damage': '+20% sát thương', '+12% attack speed': '+12% tốc độ đánh', 'Skill cooldowns −10%': 'Hồi chiêu −10%', 'Heal 60% now': 'Hồi 60% máu ngay',
  'Absorbs 40% of your health for 20 s': 'Đỡ 40% máu của bạn trong 20 giây',
  'Plain clothes and a punch': 'Quần áo thường và nắm đấm', 'A starter weapon': 'Vũ khí khởi đầu', 'A work outfit': 'Bộ đồ làm việc', 'A better weapon': 'Vũ khí tốt hơn',
  'A disguise with one skill': 'Bộ hoá trang với một chiêu', 'The second skill and armour': 'Chiêu thứ hai và áo giáp', 'Top weapon and the ultimate': 'Vũ khí mạnh nhất và tuyệt chiêu',
  'fighter': 'cận chiến', 'ranged': 'đánh xa', 'support': 'hỗ trợ',
  'runner': 'chạy nhanh', 'grunt': 'lính', 'brute': 'đô con', 'flyer': 'bay', 'shooter': 'bắn xa', 'splitter': 'tách đôi', 'mini': 'nhỏ', 'boss': 'trùm',
  'Defences': 'Phòng thủ', 'Squad': 'Đội', 'Me': 'Tôi',
  'Hearts': 'Tim', 'Wave {n}/{total}': 'Đợt {n}/{total}', 'Build: {s}s': 'Xây: {s} giây',
  'Ready!': 'Sẵn sàng!', 'Start the wave': 'Bắt đầu đợt', 'Next wave in {s}s': 'Đợt tới sau {s} giây',
  'Hold': 'Giữ chốt', 'Follow me': 'Theo tôi',
  'Place': 'Đặt', 'Upgrade': 'Nâng cấp', 'Sell': 'Bán', 'Level {n}': 'Cấp {n}', 'Max level': 'Cấp tối đa',
  'Pick a build pad': 'Chọn một ô xây', 'Pad {n}': 'Ô {n}', 'Empty pad': 'Ô trống',
  'Not enough Spark': 'Không đủ Tia Sáng', 'Not enough Star bits': 'Không đủ Mảnh Sao',
  'Spark': 'Tia Sáng', 'Star bits': 'Mảnh Sao',
  'Try on': 'Mặc thử', 'Next step': 'Bước tiếp', 'Top of the ladder': 'Đã lên đỉnh thang',
  'Step {n}/{total}': 'Bậc {n}/{total}',
  'Squad gear is borrowed for this mission only.': 'Đồ của đội chỉ mượn cho nhiệm vụ này.',
  'Boosts last until the end of the mission.': 'Tăng cường kéo dài tới hết nhiệm vụ.',
  'Pick your squad': 'Chọn đội của bạn', 'Up to {n} with you': 'Tối đa {n} người cùng bạn',
  'You': 'Bạn', 'Helper': 'Bạn nhỏ', 'Neighbour': 'Hàng xóm',
  'Go to the rescue': 'Lên đường giải cứu', 'Not now': 'Để sau', 'Back': 'Quay lại',
  'Recommended level {n}': 'Cấp khuyến nghị {n}', '{n} waves': '{n} đợt',
  'Enemies': 'Kẻ địch', 'Last wave: {boss}': 'Đợt cuối: {boss}',
  'An SOS from {planet}!': 'Tín hiệu SOS từ {planet}!',
  '{friend} needs help! A rescue portal opened by the south square.': '{friend} cần giúp đỡ! Cổng giải cứu đã mở cạnh quảng trường phía nam.',
  'Rescue portal': 'Cổng giải cứu',
  'The call faded. Another friend will ask for help later.': 'Lời kêu cứu đã tắt. Sẽ có bạn khác nhờ giúp sau.',
  'Touch the portal to answer the SOS!': 'Chạm vào cổng để đáp lời SOS!',
  'Rescue calls': 'Lời kêu cứu',
  'Now and then a friend on another planet asks for help through a portal by the south square.': 'Thỉnh thoảng một người bạn ở hành tinh khác nhờ giúp qua cổng cạnh quảng trường phía nam.',
  'Wave {n}!': 'Đợt {n}!', 'Wave cleared!': 'Đã quét sạch đợt!', '+{spark} Spark · +{stars} Star bit': '+{spark} Tia Sáng · +{stars} Mảnh Sao',
  'The boss is coming!': 'Trùm đang tới!',
  'A raider got through!': 'Một kẻ địch đã lọt qua!',
  'The farm is saved!': 'Nông trại đã được cứu!', 'The farm fell…': 'Nông trại đã thất thủ…',
  'The whole squad fell back': 'Cả đội đã rút lui',
  'All hearts lost': 'Mất hết tim',
  'You left the mission': 'Bạn đã rời nhiệm vụ',
  'Every wave held': 'Giữ vững mọi đợt',
  '{name} fell back to the camp': '{name} rút về trại',
  '{name} is back in the fight!': '{name} đã trở lại chiến đấu!',
  'You fell! Back at the camp in {s}s': 'Bạn đã ngã! Về trại sau {s} giây',
  'Waves held: {n}/{total}': 'Số đợt giữ được: {n}/{total}',
  'Thank-you gift': 'Quà cảm ơn',
  'Hero of {planet}': 'Anh hùng {planet}',
  'Rescues with full rewards left today: {n}': 'Lượt giải cứu nhận thưởng đầy đủ còn lại hôm nay: {n}',
  'No more wave rewards today, but you can still play.': 'Hôm nay đã hết thưởng theo đợt, nhưng bạn vẫn chơi được.',
  'Nothing is ever lost in a rescue. Try again?': 'Đi giải cứu không bao giờ mất đồ. Thử lại nhé?',
  'Play again': 'Chơi lại', 'Back home': 'Về nhà',
  'Leave the mission': 'Rời nhiệm vụ', 'Leave the rescue? Waves you held still count.': 'Rời khỏi cuộc giải cứu? Các đợt đã giữ vẫn được tính.',
  'Leave': 'Rời đi', 'Stay': 'Ở lại',
  'Welcome back from the rescue.': 'Chào mừng trở về từ chuyến giải cứu.',
  'Kills': 'Hạ gục', 'Leaks': 'Lọt qua',
  'Squad order: Hold': 'Lệnh cho đội: Giữ chốt', 'Squad order: Follow me': 'Lệnh cho đội: Theo tôi',
  'Your end': 'Phía bạn',
  'Place defences on the pads, then start the wave. Enemies walk in from the far end; stop them before they reach the farmhouse.': 'Đặt phòng thủ lên các ô xây rồi bắt đầu đợt. Kẻ địch đi vào từ phía xa; hãy chặn chúng trước khi tới nhà trang trại.',
  'Your squad starts with plain clothes and a punch. Spend Spark and Star bits to climb their gear ladder.': 'Đội của bạn bắt đầu với quần áo thường và nắm đấm. Dùng Tia Sáng và Mảnh Sao để leo thang trang bị.',
  'Locked: level {n}': 'Khoá: cấp {n}',
  'Recovering {s}s': 'Đang hồi {s} giây',
  'Defence broken!': 'Phòng thủ bị phá!',
  'EXP': 'EXP', 'energy': 'năng lượng',
  'Rescues': 'Giải cứu',
  'That rescue was already counted, or it ended too quickly.': 'Lần giải cứu này đã được tính rồi, hoặc kết thúc quá nhanh.',
  'Upgrades': 'Nâng cấp',
  'Squad gets': 'Đội nhận',
  'Skill': 'Chiêu',
  'Ultimate': 'Tuyệt chiêu',
  'Built': 'Đã xây',
  'No squad yet: rescue friends or turn on AI neighbours.': 'Chưa có đội: hãy giải cứu bạn bè hoặc bật hàng xóm AI.',
  'Wave {n} incoming': 'Đợt {n} sắp tới',
  'Flyers ahead': 'Có quái bay',
  'You are rescuing a farm': 'Bạn đang giải cứu một nông trại',
  'Victory gift sent to your bag (or the chest when the bag is full).': 'Quà chiến thắng đã vào túi đồ (hoặc rương khi túi đầy).',
};
