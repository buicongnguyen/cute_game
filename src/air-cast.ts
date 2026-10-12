/**
 * Jumping, then a disguise skill or the weapon in hand: one table of pure rules (tests/air-cast.test.ts). No three.js, no
 * page: main.ts turns a press into the cast, combat.ts deals it, world.ts poses the explorer.
 *
 * Every disguise skill (combat.ts DISGUISE_KITS, 16 disguises x 4) has exactly one class for a press in the air window
 * (jump-rules.ts pressKind 'air'):
 *
 *   'air'     It is cast where the explorer is. The explorer hangs AIR_CASTING.hang s in a casting pose and goes on with
 *             the jump. `at` says where the cast begins: 'body' = at the explorer's own height (shots, beams, hooks,
 *             shields and puffs start up there and shots fly down to their target); 'ground' = on the ground under the
 *             explorer (a summon set down, a shout's ring, a flower ring); 'far' = on a spot away from the explorer
 *             (a strike called down on the enemy), which is on the ground wherever it is cast from.
 *   'plunge'  A ground skill (a slam, a ring, a wall, a rink, a ground charge, a ground form). The explorer drops at
 *             once with the dive's speed and the skill is cast on the ground where it lands, AIR_CASTING.bonus stronger
 *             the higher the press was. No dive strike is added on top, each hit obeys the dive's cap on a boss, and
 *             the cooldown starts when the skill is cast (a plunge that finds no target costs nothing).
 *   'move'    A movement skill takes the jump over, so the hero is never moved twice: a 'glide' holds the height for
 *             the dash and then falls; a 'blink' arrives at the same height and hangs a moment; a blink that 'lands'
 *             arrives on the ground behind its target; a 'flight' ends the jump and carries the height into the flight.
 *
 * A press too late in the fall, or during a dive, is kept and becomes the ordinary ground cast on landing (main.ts
 * bufferPress), so nothing is lost. With the 'Jump and air combat' switch off, or online, nobody is in the air and none
 * of this is reached.
 */
import { DIVE, JUMP, MAX_HEIGHT } from './jump-rules.ts';

export type AirCastClass = 'air' | 'plunge' | 'move';
export interface AirCastRule { cls: AirCastClass; at?: 'body' | 'ground' | 'far'; how?: 'glide' | 'blink' | 'land' | 'flight' | 'leap' }
const body: AirCastRule = { cls: 'air', at: 'body' }, ground: AirCastRule = { cls: 'air', at: 'ground' }, far: AirCastRule = { cls: 'air', at: 'far' }, plunge: AirCastRule = { cls: 'plunge' };
const move = (how: NonNullable<AirCastRule['how']>): AirCastRule => ({ cls: 'move', how });
/** The class of every disguise skill, by its effect id (combat.ts DISGUISE_KITS). A skill without a row fails tests/air-cast.test.ts. */
export const AIR_CAST: Readonly<Record<string, AirCastRule>> = {
  // Superhero: flight takes the jump over; the meteor dive is a real dive that still leaps ahead; the gaze and the throw start up there
  flight: move('flight'), dive: { cls: 'plunge', how: 'leap' }, sweep: body, boulder: body,
  // Shadow ninja
  clones: ground, stealth: body, backstab: move('land'), smoke: plunge,
  // Archmage
  fireball: body, teleport: move('blink'), sheep: far, blackhole: far,
  // Sun knight
  block: body, knightcharge: plunge, taunt: ground, holy: far,
  // Battle robot
  tank: plunge, turret: ground, missiles: body, energyshield: body,
  // Tyrannosaur
  devour: plunge, tail: plunge, roar: ground, giant: plunge,
  // Flower fairy
  heal: ground, hover: move('flight'), charm: far, tree: ground,
  // Pirate captain
  cannon: ground, hook: body, parrot: body, broadside: far,
  // Vampire count
  drain: body, bats: body, batcircle: body, bloodnova: plunge,
  // Snowman
  snowball: ground, decoy: ground, icefloor: plunge, iceage: plunge,
  // Army soldier
  popgun: body, sandbag: plunge, flare: far, airdrop: far,
  // Navy sailor
  anchor: plunge, surfride: plunge, whistle: ground, lighthouse: ground,
  // Ao dai lady
  lotus: body, ribbon: move('glide'), fan: body, lanterns: ground,
  // Ao dai gentleman
  dragon: body, kite: move('flight'), ink: plunge, dragondance: plunge,
  // Stars and stripes
  eagle: move('glide'), starshield: body, torch: body, fireworks: far,
  // Vietnam red flag
  goldstar: body, bamboo: plunge, drum: plunge, bigstar: far,
};
export const airCastRule = (effect: string | undefined): AirCastRule | undefined => effect ? AIR_CAST[effect] : undefined;

export const AIR_CASTING = {
  /** Seconds an 'air' cast hangs in the air (jump-rules.ts JumpState.stall: more airtime, the same top). */
  hang: .2,
  /** Seconds a blink hangs where it arrives, and a glide holds on after its dash. */
  blinkHang: .12, glideAfter: .04,
  /** Seconds the casting pose lasts (world.ts castAirT). */
  pose: .34,
  /**
   * The plunge's reward: [height of the press (m), damage factor]. 10% from a single jump's top, 20% from a double's,
   * 30% from a triple's, in a straight line between. One table for all the plunge skills.
   */
  bonus: [[0, 1], [JUMP.rise[0], 1.1], [JUMP.rise[0] + JUMP.rise[1], 1.2], [MAX_HEIGHT, 1.3]] as readonly (readonly [number, number])[],
  /** A flight flies this high (world.ts); the height of the jump blends into it at `blend` 1/s. */
  flightHeight: 1.7, blend: 12,
} as const;
/** The plunge's damage factor from the height the skill was pressed at. */
export function airCastBonus(height: number) {
  const table = AIR_CASTING.bonus, h = Math.max(0, Math.min(MAX_HEIGHT, Number.isFinite(height) ? height : 0));
  for (let i = 1; i < table.length; i++) if (h <= table[i][0]) { const [h0, p0] = table[i - 1], [h1, p1] = table[i]; return p0 + (p1 - p0) * (h - h0) / (h1 - h0); }
  return table[table.length - 1][1];
}
/** What a press of a disguise skill does: the ordinary 'ground' cast, 'buffer' (kept for the landing), or its air rule. */
export function airCastPlan(effect: string | undefined, press: 'ground' | 'air' | 'buffer'): 'ground' | 'buffer' | AirCastRule {
  if (press === 'buffer') return 'buffer';
  return press === 'air' ? airCastRule(effect) ?? 'ground' : 'ground';
}
/**
 * A flight taking a jump over: the explorer is `carry` m away from the flight's height (below it from a low jump, above
 * it from a triple) and closes the gap smoothly. `flightCarry` is the gap at the hand-over, `carryStep` one step of it.
 */
export const flightCarry = (jumpHeight: number) => (Number.isFinite(jumpHeight) ? Math.max(0, jumpHeight) : 0) - AIR_CASTING.flightHeight;
export function carryStep(carry: number, dt: number) { const next = carry * Math.exp(-AIR_CASTING.blend * Math.max(0, dt)); return Math.abs(next) < .01 ? 0 : next; }

// ---------------------------------------------------------------- The weapon in the air

/**
 * The attack button in the air uses the weapon in hand (model.ts weaponStats: the held weapon, else the disguise's own):
 *   paws   the Sky Spin as it was: one spin, everything within moves.ts AIR_MOVES.swing.radius.
 *   blade  the same spin as a slash of the blade: it reaches as far as the blade does on the ground (never less than
 *          the paws' spin, never more than `maxReach`), in the blade's own colour.
 *   gun    it shoots (combat.basic at AIR.swing power): the shot leaves from the explorer's height and flies down.
 * The dive strikes with it too: a blade's dive reaches as far as the blade, a gun's lands as a point-blank blast in its
 * shot's colour. Damage, cooldowns, the dive's cap and its sure critical are unchanged.
 */
export const AIR_WEAPON = { maxReach: 3.4, /** Seconds a shot's recoil hangs in the air. */ recoil: .06, /** The colour of paws and of a blade without one of its own. */ plain: '#e5f6ff', /** A blade without a colour of its own slashes in the ground swing's colour. */ blade: '#fff4c8', dive: '#ffe9a8' } as const;
export interface AirWeapon { kind: 'fist' | 'sword' | 'gun' | 'rod'; range?: number; fx?: string; shot?: string }
export type AirSwing = { shape: 'spin' | 'slash'; radius: number; color: string } | { shape: 'shot' } | { shape: 'none' };
/** What the attack button does while rising with `weapon`; `spin` is the paws' radius (AIR_MOVES.swing.radius). */
export function airSwingFor(weapon: AirWeapon, spin: number): AirSwing {
  if (weapon.kind === 'rod') return { shape: 'none' };
  if (weapon.kind === 'gun') return { shape: 'shot' };
  if (weapon.kind === 'sword') return { shape: 'slash', radius: Math.max(spin, Math.min(AIR_WEAPON.maxReach, weapon.range ?? spin)), color: weapon.fx ?? AIR_WEAPON.blade };
  return { shape: 'spin', radius: spin, color: AIR_WEAPON.plain };
}
/** The dive's strike with `weapon`: its radius (a blade's reach, never under the plain dive's), its colour and the swing it plays. */
export function diveStrikeFor(weapon: AirWeapon, shotColor?: string): { radius: number; color: string; swing: 'fist' | 'sword' | 'gun' } {
  if (weapon.kind === 'sword') return { radius: Math.max(DIVE.radius, Math.min(AIR_WEAPON.maxReach, weapon.range ?? DIVE.radius)), color: weapon.fx ?? AIR_WEAPON.dive, swing: 'sword' };
  if (weapon.kind === 'gun') return { radius: DIVE.radius, color: shotColor ?? AIR_WEAPON.dive, swing: 'gun' };
  return { radius: DIVE.radius, color: AIR_WEAPON.dive, swing: 'fist' };
}
