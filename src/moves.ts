/**
 * The four moves of docs/FIGHT-PLAN.md as one table of pure numbers (tests/moves.test.ts): Strike, Rush, Quake and Lob on
 * the ground, and what each becomes in the air. combat.ts deals them, skill-info.ts describes them, promo/fight-sim.mts
 * balances them; a creature that later learns a move reads the same rows.
 *
 * They replace the four starting skills only while the 'Jump and air combat' switch is on and only in solo play
 * (combat.ts edge.moves; the server's copy of the simulation never sets it). Slot order is the old one, so every key and
 * toe keeps its place: Q/J Petal Gale is the Lob, W/K Breeze Step the Rush, E/L Root Quake the Quake, R/; Paw Storm the
 * Strike. Disguises keep their kits; a weapon or uniform with a special of its own keeps it in the fourth slot.
 *
 * Damage is a factor on the explorer's attack (1 = one basic hit). Times are seconds, lengths metres.
 */
import { JUMP, MAX_HEIGHT } from './jump-rules.ts';

/**
 * Built but off: true puts the Strike in the fourth slot whatever the weapon, retiring the weapon specials while the
 * switch is on. False (shipped): only Paw Storm, the special of bare paws and of weapons without one, becomes the Strike.
 */
export const STRIKE_OVER_WEAPON_SPECIAL: boolean = false;

export const MOVES = {
  /** A chain of three quick hits in front; the third pops small creatures into the air. */
  strike: { hits: [.8, .88, 1.12] as readonly number[], reach: 2, /** Cosine of the half angle of the front arc (0.5 = 120 degrees wide). */ cone: .5,
    windup: .1, gap: .16, recovery: .15, cooldown: 5, /** The third hit lifts a creature narrower than `small` this high. */ launch: 1.7, small: 1.2 },
  /** A fast pass along a line: every creature on it is hit once, and nothing can hurt the explorer on the way. */
  rush: { power: 1.6, length: 6, width: 1.2, speed: 30, windup: .12, recovery: .3, cooldown: 4, stun: .3, knock: 3 },
  /** A ring around the explorer: it launches what it hits and stuns the large ones (a boss resists the stun as a slow). */
  quake: { power: 2.4, radius: 3.5, windup: .35, recovery: .35, cooldown: 7, lift: 2.5, stun: .6, large: 1.2 },
  /**
   * A shot thrown in an arc onto a marked spot `min` to `max` away. Within `core` of the spot it hits for `centre`, out to
   * `splash` for `edge`. It is aimed at the chosen target, else the nearest creature within `max`, else `ahead` in front.
   */
  lob: { centre: 2.6, edge: 1.3, core: .8, splash: 2, min: 4, max: 9, ahead: 6.5, windup: .25, flight: .6, recovery: .2, cooldown: 6, /** How high the arc rises (the look only). */ arc: 3 },
} as const;
export type MoveId = keyof typeof MOVES;
/** Skill slot 0 to 3 -> its move. */
export const MOVE_SLOTS: readonly MoveId[] = ['lob', 'rush', 'quake', 'strike'];

export const AIR_MOVES = {
  /** Strike in the air: one spin that hits all round and holds the height for a moment. Also the attack button while rising. */
  swing: { power: .8, radius: 2.2, hover: .12, cooldown: .32 },
  /** Rush in the air: the same hit at the explorer's height; past `turnAfter` of the way it may turn once towards the stick, if that points more than `turnAngle` rad aside. */
  dash: { power: 1.6, hover: .24, turnAfter: .5, turnAngle: .5 },
  /**
   * Quake in the air: the heavy dive ('Sky Quake'). Damage by the height it starts from (the plan's single, double and
   * triple jump), a wider ring, and one strike never takes more than `bossCap` of a boss's health. The attack button's
   * dive (jump-rules.ts DIVE) is the light one: no cooldown, less damage.
   */
  dive: { power: [[0, 2.2], [JUMP.rise[0], 2.5], [JUMP.rise[0] + JUMP.rise[1], 3.2], [MAX_HEIGHT, 4]] as readonly (readonly [number, number])[], radius: 4.5, lift: 2.5, stun: .6, bossCap: .15 },
  /** Lob in the air: three smaller shots straight down, in a line ahead from under the explorer. */
  rain: { shots: 3, power: .9, spacing: 1.3, radius: 1.3, fall: .28, gap: .1 },
} as const;

/** The four skill buttons while the moves are on: the old names and pictures, the plan's cooldowns. */
export const MOVE_SKILLS: readonly { name: string; icon: string; cd: number; move: MoveId }[] = [
  { name: 'Petal Gale', icon: '🌸', cd: MOVES.lob.cooldown, move: 'lob' },
  { name: 'Breeze Step', icon: '🍃', cd: MOVES.rush.cooldown, move: 'rush' },
  { name: 'Root Quake', icon: '🪨', cd: MOVES.quake.cooldown, move: 'quake' },
  { name: 'Paw Storm', icon: '🐾', cd: MOVES.strike.cooldown, move: 'strike' },
];
/** What floats over the explorer when a slot's air move is cast. */
export const AIR_NAMES: readonly string[] = ['Petal Rain', 'Sky Step', 'Sky Quake', 'Sky Spin'];
/** What a level adds to each move at the cottage bench (the steps are skill-upgrades.ts SKILL_STEPS, unchanged). */
export const MOVE_LEVEL_TEXT: readonly string[] = [
  'Each level: +10% damage and +0.12 m splash radius.',
  'Each level: +10% damage and 0.2 s shorter cooldown.',
  'Each level: +8% damage and +0.3 m ring radius.',
  'Each level: +8% damage and 4% shorter cooldown for your weapon special.',
];

/** The fourth slot is the Strike: with Paw Storm (no special of the weapon's or the uniform's own), or always when STRIKE_OVER_WEAPON_SPECIAL. */
export const strikeSlot = (special: string | undefined) => STRIKE_OVER_WEAPON_SPECIAL || !special || special === 'fist';
/** The move in skill slot `index` for a weapon with `special`, or null where the slot keeps the weapon's own special. */
export function moveAt(index: number, special?: string): MoveId | null { const move = MOVE_SLOTS[index]; return !move ? null : move === 'strike' && !strikeSlot(special) ? null : move; }

export interface MovePoint { x: number; z: number }
/** Where a Lob lands: on the target, never nearer than `min` nor farther than `max` along the line to it; with no target, `ahead` in front. */
export function lobLanding(from: MovePoint, facing: number, target?: MovePoint | null): MovePoint & { facing: number; distance: number } {
  const L = MOVES.lob;
  if (target) {
    const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) { const distance = Math.max(L.min, Math.min(L.max, d)); return { x: from.x + dx / d * distance, z: from.z + dz / d * distance, facing: Math.atan2(dx, dz), distance }; }
  }
  return { x: from.x + Math.sin(facing) * L.ahead, z: from.z + Math.cos(facing) * L.ahead, facing, distance: L.ahead };
}
/** A creature a Lob may aim at: within `max` of the explorer (edge to edge). */
export const lobReaches = (from: MovePoint, target: MovePoint & { radius: number }) => Math.hypot(target.x - from.x, target.z - from.z) <= MOVES.lob.max + target.radius;
/** The Lob's damage factor on a creature whose edge is `gap` m from the landing spot (0 or less = it stands on it): centre, edge, or 0 when out of the splash. `splash` may be the levelled radius. */
export function lobPower(gap: number, splash: number = MOVES.lob.splash) { return gap <= MOVES.lob.core ? MOVES.lob.centre : gap <= splash ? MOVES.lob.edge : 0; }
/** The Strike's third hit launches ordinary creatures narrower than `small`; never a boss. */
export const strikeLaunches = (target: { boss?: boolean; radius: number }) => !target.boss && target.radius < MOVES.strike.small;
/** The Quake stuns bosses and creatures at least `large` wide; the smaller ones are only launched. */
export const quakeStuns = (target: { boss?: boolean; radius: number }) => !!target.boss || target.radius >= MOVES.quake.large;
/** The heavy dive's damage factor from the height it started at: 2.5 from a single jump's top, 3.2 from a double's, 4 from a triple's. */
export function skyQuakePower(height: number) {
  const table = AIR_MOVES.dive.power, h = Math.max(0, Math.min(MAX_HEIGHT, Number.isFinite(height) ? height : 0));
  for (let i = 1; i < table.length; i++) if (h <= table[i][0]) { const [h0, p0] = table[i - 1], [h1, p1] = table[i]; return p0 + (p1 - p0) * (h - h0) / (h1 - h0); }
  return table[table.length - 1][1];
}
/** The most one heavy dive may take from a target: `bossCap` of a boss's full health, anything from ordinary creatures. */
export function skyQuakeCap(target: { boss?: boolean; maxHp?: number }) { return target.boss && target.maxHp ? Math.max(1, Math.round(target.maxHp * AIR_MOVES.dive.bossCap)) : Infinity; }
/** Where the Rain's shots land: the first under the explorer, the rest in a line ahead. */
export function rainPoints(from: MovePoint, facing: number): MovePoint[] {
  const R = AIR_MOVES.rain; return Array.from({ length: R.shots }, (_, i) => ({ x: from.x + Math.sin(facing) * R.spacing * i, z: from.z + Math.cos(facing) * R.spacing * i }));
}
/** The air dash may turn once: past `turnAfter` of the way, towards a stick that points more than `turnAngle` aside. Returns the new direction (rad) or null. */
export function airDashTurn(progress: number, heading: number, stick: number | null, turned: boolean): number | null {
  if (turned || stick === null || !Number.isFinite(stick) || progress < AIR_MOVES.dash.turnAfter || progress >= 1) return null;
  const off = Math.atan2(Math.sin(stick - heading), Math.cos(stick - heading)); return Math.abs(off) > AIR_MOVES.dash.turnAngle ? stick : null;
}
/** Seconds a move keeps the explorer busy from the press: wind-up, the move itself, recovery. */
export function moveTime(move: MoveId) {
  const m = MOVES[move];
  return move === 'strike' ? m.windup + MOVES.strike.gap * (MOVES.strike.hits.length - 1) + m.recovery : move === 'rush' ? m.windup + MOVES.rush.length / MOVES.rush.speed + m.recovery : m.windup + m.recovery;
}
/** Total damage factor of one cast on one creature standing in the best place. */
export function movePower(move: MoveId) { return move === 'strike' ? MOVES.strike.hits.reduce((a, b) => a + b, 0) : move === 'lob' ? MOVES.lob.centre : MOVES[move].power; }
/** Damage factor one creature takes from a move cast as often as its cooldown allows, starting ready, in `seconds` (the plan's ten-second measure). */
export function windowDamage(move: MoveId, seconds = 10, cooldown: number = MOVES[move].cooldown) {
  let total = 0; const land = move === 'lob' ? MOVES.lob.windup + MOVES.lob.flight : move === 'strike' ? MOVES.strike.windup + MOVES.strike.gap * (MOVES.strike.hits.length - 1) : move === 'rush' ? MOVES.rush.windup + MOVES.rush.length / MOVES.rush.speed : MOVES[move].windup;
  for (let t = 0; t + land <= seconds + 1e-9; t += Math.max(.1, cooldown)) total += movePower(move);
  return total;
}
