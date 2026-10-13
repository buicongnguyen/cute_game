/**
 * The wind of a disguise's moves: which of the 80 moves (16 disguises x the basic attack and four skills) is a body, a
 * limb or a weapon going through the air, and the wind such a move leaves. No three.js and no page in here
 * (tests/skill-wind.test.ts): world.ts poses the explorer and feeds the shapes, weapon-trail.ts draws them in the weapon
 * trail's own mesh, so a skill's wind adds no mesh, no material and no draw call.
 *
 * Every move has one class:
 *
 *   'swing'   a cut of the blade (or of what the hand holds: a fan). The arm makes one of the three cuts and the
 *             ribbon is the blade's own path (trail-ribbon.ts).
 *   'thrust'  a stab, a bite or a thrown hook: a burst of wind from the hand (or the jaws) along the blow, as a punch
 *             throws; a tapered streak along the chain for the hook.
 *   'sweep'   a wide low arc at the radius the move really hits (a tail, a fan's gust).
 *   'spin'    a full ring of ribbon that follows the thing swung round (an anchor, a brush).
 *   'slam'    a blow that comes down: the arm chops or both fists pound on the frame the damage lands, with a streak
 *             down the fall where something falls (a meteor dive, a sword from the sky).
 *   'dash'    the body itself goes: a tapered streak along the travel, ending in a blow when the dash ends in one.
 *   'none'    a spell, a shot, a summon, a buff or a shout: no blade wind (`why` says which).
 *
 * The size rule of skill-visuals.ts holds here too: a wind is drawn no further than what its move hits (`reach` within
 * 15% of `hit`), and it is a thin ribbon or a streak, never a filled area, so it does not hide a creature.
 */
import { DISGUISE_KITS, DZ } from './combat.ts';
import { bridgeStrip, TRAIL, type CutIndex } from './trail-ribbon.ts';
import { WIND } from './punch-wind.ts';

export type WindClass = 'swing' | 'thrust' | 'sweep' | 'spin' | 'slam' | 'dash' | 'none';
export const WIND_CLASSES: readonly WindClass[] = ['swing', 'thrust', 'sweep', 'spin', 'slam', 'dash', 'none'];

/** What the arm does when no weapon is held: 'blade' swings what the disguise holds (its own blade, a fan, a brush), 'fists' strikes bare. A held sword always cuts and a held blaster never does (world.ts). */
export type Arm = 'blade' | 'fists';
interface Base {
  /** The move's own colour (the colour its effect is cast in). */
  color: string;
  /** Metres the move really hits: a radius, or a length for a thrust and a dash. */
  hit: number;
  /** Metres the wind is drawn to, from where the move starts: never more than 15% past `hit`. */
  reach: number;
  /** Seconds from the cast to the frame the damage lands. */
  at: number;
  arm: Arm;
}
export type WindRule =
  | { cls: 'none'; why: 'spell' | 'shot' | 'summon' | 'buff' | 'shout' | 'form' }
  | Base & { cls: 'swing'; cut: CutIndex }
  | Base & { cls: 'thrust'; /** Where the streak leaves: the hand, the head (a bite). */ from: 'hand' | 'head'; pose: 'stab' | 'lunge' | 'throw'; /** Seconds the head of the streak takes to run its reach, its half width, and the metres of it that show behind the head (0: all of it). */ travel: number; width: number; tail: number; /** The streak runs to the creature the move took (a hook's chain), not a fixed length. */ toTarget?: boolean; /** A stab or a bite throws the punch's own burst of wind (punch-wind.ts), this size, in place of the streak: a gust, its bow and the ring where it lands. */ burst?: number; /** A stab made at arm's length from what it hits has no room ahead of it: its streak starts this many metres behind the hand and ends on the blade's point. */ back?: number }
  | Base & { cls: 'sweep' | 'spin'; /** The body: a full turn with the arm out, a full turn tail first, or one cut of the arm. */ pose: 'spin' | 'tail' | 'cut'; /** Radians swept from the facing (2 pi: a ring), the seconds it takes, the ribbon's height, width and the seconds of its path that show. */ span: number; turn: number; height: number; width: number; keep: number; /** A gust pushed out by a fan: the whole arc at once, growing from this radius to `reach`. */ wave?: number }
  | Base & { cls: 'slam'; pose: 'pound' | 'chop'; /** Seconds from the cast of each blow (the frames the damage lands). */ beats: readonly number[]; /** A streak down the fall: the explorer's own leap (from where it stood), or the thing that falls on a spot away from it. */ fall?: 'leap' | 'far'; /** The blow and the wind do not land where the explorer stands (a sword from the sky). */ far?: boolean }
  | Base & { cls: 'dash'; /** Seconds of the dash, the streak's half width and the metres of it behind the body. */ time: number; width: number; tail: number; /** The blow the dash ends in, and the radius that blow hits. */ end?: 'pound' | 'chop'; endHit?: number };

const none = (why: (WindRule & { cls: 'none' })['why']): WindRule => ({ cls: 'none', why });
const spell = none('spell'), shot = none('shot'), summon = none('summon'), buff = none('buff'), shout = none('shout'), form = none('form');
const FAN = Math.acos(DZ.fan.cone), TAU = Math.PI * 2;
/** The pound's wind (punch-wind.ts): how far its ring and its gust reach. */
/** A burst of size 1 (punch-wind.ts): how far its gust and bow run from where it leaves, and the most the hand or the jaws are ahead of the explorer's place when it does. */
export const BURST = WIND.reach + .16, AHEAD = 1.05;
const POUND = Math.max(WIND.ring * WIND.pound * 2.3 + .13 * WIND.pound, WIND.reach * WIND.pound + .25);

/**
 * The class of every disguise skill, by its effect id (combat.ts DISGUISE_KITS). A skill without a row fails
 * tests/skill-wind.test.ts. The numbers that line a wind up with its skill come from the skill's own table (combat.ts
 * DZ) and from its look (skill-visuals.ts: the anchor's turn, the tail's, the brush's).
 */
export const SKILL_WIND: Readonly<Record<string, WindRule>> = {
  // Superhero: the meteor dive is the body coming down (a streak down the leap, then both fists on the ground)
  flight: buff, dive: { cls: 'slam', pose: 'pound', beats: [DZ.dive.delay], fall: 'leap', color: '#5f8bff', hit: DZ.dive.radius, reach: POUND, at: DZ.dive.delay, arm: 'fists' }, sweep: spell, boulder: shot,
  // Shadow ninja: the shadow strike is a stab from behind
  clones: summon, stealth: buff, backstab: { cls: 'thrust', from: 'hand', pose: 'stab', back: 1.9, travel: .07, width: .2, tail: 0, color: '#9d8cff', hit: 2.5, reach: AHEAD + .9, at: 0, arm: 'blade' }, smoke: spell,
  // Archmage
  fireball: shot, teleport: spell, sheep: spell, blackhole: spell,
  // Sun knight: the charge is the body and ends in a chop; the sky sword is called down with a chop of the knight's own
  block: buff, knightcharge: { cls: 'dash', time: DZ.knightcharge.time, width: .34, tail: 3.2, end: 'chop', endHit: DZ.knightcharge.radius, color: '#ffe08a', hit: DZ.knightcharge.speed * DZ.knightcharge.time, reach: DZ.knightcharge.speed * DZ.knightcharge.time, at: DZ.knightcharge.time, arm: 'blade' }, taunt: shout,
  holy: { cls: 'slam', pose: 'chop', beats: [DZ.holy.delay], fall: 'far', far: true, color: '#ffe08a', hit: DZ.holy.radius, reach: .3, at: DZ.holy.delay, arm: 'blade' },
  // Battle robot
  tank: form, turret: summon, missiles: shot, energyshield: buff,
  // Tyrannosaur: the bite lunges with the head, the tail goes all the way round
  devour: { cls: 'thrust', from: 'head', pose: 'lunge', burst: 1, travel: WIND.travel, width: WIND.width, tail: 0, color: '#3fae3a', hit: DZ.devour.reach, reach: AHEAD + BURST, at: 0, arm: 'fists' },
  tail: { cls: 'sweep', pose: 'tail', span: TAU, turn: .4, height: .5, width: .75, keep: .2, color: '#5fbf5a', hit: DZ.tail.radius, reach: DZ.tail.radius * .9, at: 0, arm: 'fists' }, roar: shout, giant: form,
  // Flower fairy
  heal: spell, hover: buff, charm: spell, tree: summon,
  // Pirate captain: the hook is thrown
  cannon: summon, hook: { cls: 'thrust', from: 'hand', pose: 'throw', toTarget: true, travel: .25 / 2.2, width: .24, tail: 2.8, color: '#ffc93c', hit: DZ.hook.range, reach: DZ.hook.range, at: .25, arm: 'fists' }, parrot: summon, broadside: shot,
  // Vampire count
  drain: spell, bats: form, batcircle: summon, bloodnova: spell,
  // Snowman
  snowball: shot, decoy: summon, icefloor: spell, iceage: spell,
  // Army soldier
  popgun: shot, sandbag: summon, flare: shot, airdrop: summon,
  // Navy sailor: the anchor is swung all the way round on its chain; the wave ride is the body
  anchor: { cls: 'spin', pose: 'spin', span: TAU, turn: .7 / 1.5, height: 1.1, width: .6, keep: .22, color: '#9fd6ff', hit: 4.4, reach: 4.4 * .9, at: .15, arm: 'blade' },
  surfride: { cls: 'dash', time: DZ.surfride.time, width: .34, tail: 3.2, color: '#7fd0ff', hit: DZ.surfride.speed * DZ.surfride.time, reach: DZ.surfride.speed * DZ.surfride.time, at: 0, arm: 'blade' }, whistle: shout, lighthouse: summon,
  // Ao dai lady: the ribbon glide is the body; the paper fan is swung and pushes its gust out through the cone it hits
  lotus: shot, ribbon: { cls: 'dash', time: DZ.ribbon.time, width: .3, tail: 3, color: '#ff8fb1', hit: DZ.ribbon.speed * DZ.ribbon.time, reach: DZ.ribbon.speed * DZ.ribbon.time, at: 0, arm: 'blade' },
  fan: { cls: 'sweep', pose: 'cut', span: 2 * FAN * .95, turn: .34, height: 1, width: 1.3, keep: .5, wave: 2, color: '#ff5f96', hit: DZ.fan.radius, reach: DZ.fan.radius * .92, at: 0, arm: 'blade' }, lanterns: summon,
  // Ao dai gentleman: the dragon fan is one cut that lets the dragons go; the ink circle is drawn with one turn of the brush
  dragon: { cls: 'swing', cut: 0, color: '#ffd84a', hit: 2.4, reach: 2.4, at: 0, arm: 'blade' }, kite: buff,
  ink: { cls: 'spin', pose: 'spin', span: TAU, turn: .35, height: .4, width: .6, keep: .2, color: '#ffd84a', hit: DZ.ink.radius, reach: DZ.ink.radius * .95, at: 0, arm: 'blade' }, dragondance: summon,
  // Stars and stripes: the eagle strike is the body and ends with both fists down
  eagle: { cls: 'dash', time: .3, width: .34, tail: 3.2, end: 'pound', endHit: 3, color: '#ff5a6a', hit: 30 * .3, reach: 30 * .3, at: .3, arm: 'fists' }, starshield: buff, torch: buff, fireworks: shot,
  // Vietnam red flag: the vault is the body and lands on both fists; the bronze drum is beaten three times
  goldstar: shot, bamboo: { cls: 'dash', time: DZ.bamboo.time, width: .32, tail: 3, end: 'pound', endHit: DZ.bamboo.radius, color: '#8fd45a', hit: DZ.bamboo.speed * DZ.bamboo.time, reach: DZ.bamboo.speed * DZ.bamboo.time, at: DZ.bamboo.time, arm: 'fists' },
  drum: { cls: 'slam', pose: 'pound', beats: Array.from({ length: DZ.drum.beats }, (_, i) => i * DZ.drum.gap), color: '#f2c14e', hit: DZ.drum.radius, reach: POUND, at: 0, arm: 'fists' }, bigstar: shot,
};

/** The class of a basic attack, by the kind of weapon that makes it: a blade cuts (the weapon trail), fists jab (the punch wind), a blaster shoots. */
export function basicWind(kind: string | undefined): WindClass { return kind === 'sword' ? 'swing' : kind === 'fist' || kind === undefined ? 'thrust' : 'none'; }
/** The class of a disguise's move: `slot` 0 is the basic attack (by `weapon`, the kind of the disguise's own weapon), 1-4 its skills. Undefined for a skill without a row. */
export function windClass(disguise: string, slot: number, weapon?: string): WindClass | undefined {
  if (slot === 0) return basicWind(weapon);
  const effect = DISGUISE_KITS[disguise]?.[slot - 1]; return effect ? SKILL_WIND[effect]?.cls : undefined;
}
export const windRule = (effect: string | undefined): WindRule | undefined => effect ? SKILL_WIND[effect] : undefined;

/**
 * The blade a disguise shows in the hand while it is worn with no weapon equipped: the id of a weapon whose model the
 * weapon kit already has (content.ts ITEMS, assets.ts weaponKit), so its ribbon follows a real blade. Only disguises
 * whose own weapon is a blade and for which the kit has a fitting model are here; the rest hold nothing, as before.
 */
export const HAND_BLADE: Readonly<Record<string, string>> = {
  dz_knight: 'sword_crystal',   // a straight bright sword
  dz_ninja: 'sword_obsidian',   // a short dark blade
  dz_navy: 'sword_tusk',        // a curved cutlass
  dz_vampire: 'sword_obsidian', // a slim dark blade (the kit has no rapier)
};
/** The weapon a bare disguise shows in the hand, if any: never over a weapon that is equipped. */
export const handBlade = (disguise: string | undefined, weapon: string | undefined): string | undefined => disguise && !weapon ? HAND_BLADE[disguise] : undefined;

// ---------------------------------------------------------------- The shapes

/**
 * A skill's wind is one of two shapes, kept in a few slots made once and written into the trail's buffers each frame it
 * shows:
 *   a streak  a flat strip turned to face the camera, narrow at its tail and pointed at its head, that runs from a
 *             point along a direction (a stab, a hook, a dash, a fall). Its head runs by itself or is held on a body
 *             (`head`: the dash's streak ends where the explorer is).
 *   an arc    a flat ribbon lying level at a height, the bright edge outside, like a blade's ribbon: either swept
 *             round from an angle (the newest part at the head, fading behind it) or a whole arc pushed outwards.
 */
export const GUSTS = {
  /** Shapes alive at once. */
  max: 5,
  /** Sections of a streak, of each of its two speed lines, and the most an arc uses. */
  streak: 10, line: 3, lines: 2, arc: 30,
} as const;
/** Sections all the slots can need at once, with the unseen joins before each strip. */
export const GUST_SECTIONS = GUSTS.max * Math.max(GUSTS.arc + 2, GUSTS.streak + 2 + GUSTS.lines * (GUSTS.line + 2));

const STRIDE = 20;
const smooth = (x: number) => { const s = Math.min(1, Math.max(0, x)); return s * s * (3 - 2 * s); };
const easeOut = (x: number) => { const s = Math.min(1, Math.max(0, x)); return 1 - (1 - s) * (1 - s); };

export interface StreakOptions { /** Metres the head runs, its half width, the seconds the run takes and the seconds the streak fades for after it. */ length: number; width: number; travel: number; fade?: number; /** Metres of it that show behind the head (0: from the start). */ tail?: number; /** The head runs at an even speed (a fall, a dash) instead of out fast. */ even?: boolean; /** Speed lines beside it. */ lines?: number }
export interface ArcOptions { /** The outer edge's radius (m), the ribbon's width, the seconds of the sweep and the seconds of path that show. */ radius: number; width: number; turn: number; keep: number; /** A whole arc at once, growing from this radius to `radius` in `turn` seconds and fading over `keep`. */ wave?: number }

/** The shapes in flight: a few slots, written in place. A slot is free when its time is up. */
export class SkillGusts {
  readonly data = new Float32Array(GUSTS.max * STRIDE);
  /** Slots that still show (after `prune`). */
  count = 0;
  private slot(now: number) {
    const d = this.data; let pick = 0, oldest = Infinity;
    for (let i = 0; i < GUSTS.max; i++) { const o = i * STRIDE; if (!(d[o] > 0) || now - d[o + 7] >= d[o + 8]) return i; if (d[o + 7] < oldest) { oldest = d[o + 7]; pick = i; } }
    return pick; // all in flight: the oldest gives way
  }
  /** A streak from (x, y, z) along (dx, dy, dz) at time `t` in colour (r, g, b). Returns its slot (for `head`), or -1 when the numbers are no streak. */
  streak(x: number, y: number, z: number, dx: number, dy: number, dz: number, t: number, o: StreakOptions, r = 1, g = 1, b = 1) {
    const l = Math.hypot(dx, dy, dz); if (!(l > 1e-6) || !(o.length > 0) || !(o.travel > 0) || !Number.isFinite(x + y + z + t + o.length + o.width + o.travel)) return -1;
    const i = this.slot(t), d = this.data, p = i * STRIDE;
    d[p] = 1; d[p + 1] = x; d[p + 2] = y; d[p + 3] = z; d[p + 4] = dx / l; d[p + 5] = dy / l; d[p + 6] = dz / l; d[p + 7] = t; d[p + 8] = o.travel + (o.fade ?? .2);
    d[p + 9] = o.length; d[p + 10] = Math.max(.01, o.width); d[p + 11] = o.travel; d[p + 12] = r; d[p + 13] = g; d[p + 14] = b; d[p + 15] = NaN; d[p + 16] = o.tail ?? 0; d[p + 17] = o.even ? 1 : 0; d[p + 18] = Math.max(0, Math.min(GUSTS.lines, o.lines ?? GUSTS.lines)); d[p + 19] = 0;
    this.count = Math.max(this.count, 1); return i;
  }
  /** An arc round (x, z) at height y, from the angle `from` (0 is +z, a quarter turn is +x: a facing) through `span` rad. Returns its slot, or -1. */
  arc(x: number, y: number, z: number, from: number, span: number, t: number, o: ArcOptions, r = 1, g = 1, b = 1) {
    if (!(o.radius > 0) || !(o.turn > 0) || !(o.keep > 0) || !(Math.abs(span) > 1e-3) || !Number.isFinite(x + y + z + from + span + t + o.radius + o.width)) return -1;
    const i = this.slot(t), d = this.data, p = i * STRIDE, wave = o.wave !== undefined;
    d[p] = 2; d[p + 1] = x; d[p + 2] = y; d[p + 3] = z; d[p + 4] = from; d[p + 5] = span; d[p + 6] = 0; d[p + 7] = t; d[p + 8] = wave ? Math.max(o.turn, o.keep) : o.turn + o.keep;
    d[p + 9] = o.radius; d[p + 10] = Math.max(.01, Math.min(o.width, o.radius)); d[p + 11] = o.turn; d[p + 12] = r; d[p + 13] = g; d[p + 14] = b; d[p + 15] = NaN; d[p + 16] = o.keep; d[p + 17] = wave ? 1 : 0; d[p + 18] = wave ? Math.max(0, Math.min(o.radius, o.wave!)) : 0; d[p + 19] = 0;
    this.count = Math.max(this.count, 1); return i;
  }
  /** Holds the head of the streak in `slot` `metres` from its start (a dash: where the body is). Nothing for a slot that is not a streak in flight. */
  head(slot: number, metres: number) { const p = slot * STRIDE; if (slot >= 0 && slot < GUSTS.max && this.data[p] === 1 && Number.isFinite(metres)) this.data[p + 15] = Math.max(0, Math.min(this.data[p + 9], metres)); }
  /** Lets a held streak go at time `now`: its tail closes on the head from here on. */
  release(slot: number, now: number) { const p = slot * STRIDE, d = this.data; if (slot < 0 || slot >= GUSTS.max || d[p] !== 1 || d[p + 19] > 0) return; d[p + 19] = Math.max(1e-4, now - d[p + 7]); d[p + 8] = Math.min(d[p + 8], d[p + 19] + .2); }
  /** True while the streak in `slot` is still in flight. */
  live(slot: number, now: number) { const p = slot * STRIDE, d = this.data; return slot >= 0 && slot < GUSTS.max && d[p] > 0 && now - d[p + 7] < d[p + 8]; }
  prune(now: number) { const d = this.data; let n = 0; for (let i = 0; i < GUSTS.max; i++) { const p = i * STRIDE; if (!(d[p] > 0)) continue; if (now - d[p + 7] >= d[p + 8] || now < d[p + 7] - 1) d[p] = 0; else n++; } this.count = n; }
  clear() { this.data.fill(0); this.count = 0; }
}

/** How far the head of a streak is from its start `age` seconds in, and where its tail is: both 0 to `length`, the tail never ahead of the head. */
export function streakSpan(age: number, length: number, travel: number, life: number, tail = 0, even = false, held = NaN, released = 0): [number, number] {
  const run = Math.min(1, Math.max(0, age) / travel), free = even ? run : easeOut(run);
  const head = Number.isNaN(held) ? length * free : Math.min(length, held);
  // The tail stays put (or `tail` m behind the head) while the head runs, then closes on it.
  const since = released > 0 ? released : travel, close = smooth((age - since) / Math.max(1e-3, life - since));
  const back = tail > 0 ? Math.max(0, head - tail) : 0;
  return [head, back + (head - back) * close];
}

/**
 * Writes every shape at time `now` after the `first` sections already in the buffers (position xyz and trail pairs as
 * in trail-ribbon.ts buildRibbon; `tint` r, g, b and the look per vertex: 1 for a streak, the wind's look, and 0 for an
 * arc, the blade's). (vx, vy, vz) is where the camera is: a streak turns to face it. `lines` false leaves the speed
 * lines out (Battery saver). Returns the section count after them: unchanged when nothing shows.
 */
export function buildGusts(gusts: SkillGusts, now: number, position: Float32Array, trail: Float32Array, tint: Float32Array, first = 0, lines = true, vx = 0, vy = 30, vz = 26): number {
  if (!gusts.count) return first;
  const room = Math.min(position.length / 6, trail.length / 4, tint.length / 8) | 0, d = gusts.data;
  let sections = first, r = 1, g = 1, b = 1, look = 1;
  const put = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, old: number) => {
    const p = sections * 6, q = sections * 4, c = sections * 8, age = old < 0 ? 0 : old > 1 ? 1 : old;
    position[p] = ax; position[p + 1] = ay; position[p + 2] = az; position[p + 3] = bx; position[p + 4] = by; position[p + 5] = bz;
    trail[q] = 0; trail[q + 1] = age; trail[q + 2] = 1; trail[q + 3] = age;
    tint[c] = tint[c + 4] = r; tint[c + 1] = tint[c + 5] = g; tint[c + 2] = tint[c + 6] = b; tint[c + 3] = tint[c + 7] = look;
    sections++;
  };
  const begin = (need: number, x: number, y: number, z: number) => {
    if (sections + (sections ? 2 : 0) + need > room) return false;
    if (sections) { const from = sections; sections = bridgeStrip(position, trail, sections, x, y, z); for (let c = from * 8; c < sections * 8; c++) tint[c] = 0; }
    return true;
  };
  for (let n = 0; n < GUSTS.max; n++) {
    const o = n * STRIDE, shape = d[o]; if (!(shape > 0)) continue;
    const age = Math.max(0, now - d[o + 7]), life = d[o + 8]; if (!(age < life)) continue;
    const x = d[o + 1], y = d[o + 2], z = d[o + 3]; r = d[o + 12]; g = d[o + 13]; b = d[o + 14];
    if (shape === 1) {
      look = 1;
      const fx = d[o + 4], fy = d[o + 5], fz = d[o + 6], length = d[o + 9], width = d[o + 10], travel = d[o + 11];
      const [head, tail] = streakSpan(age, length, travel, life, d[o + 16], d[o + 17] === 1, d[o + 15], d[o + 19]);
      const shown = head - tail; if (!(shown > .04)) continue;
      // Square to the streak and to the line of sight, so the strip faces the camera.
      let cx = vx - x, cy = vy - y, cz = vz - z; const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
      let sx = fy * cz - fz * cy, sy = fz * cx - fx * cz, sz = fx * cy - fy * cx, sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-3) { sx = fz; sy = 0; sz = -fx; sl = Math.hypot(sx, sz); if (sl < 1e-3) { sx = 1; sz = 0; sl = 1; } }
      sx /= sl; sy /= sl; sz /= sl;
      const since = d[o + 19] > 0 ? d[o + 19] : travel, old = smooth((age - since) / Math.max(1e-3, life - since)), wide = width * Math.min(1, .35 + shown / (width * 5)) * (1 - .3 * old);
      for (let i = 0; i < GUSTS.streak; i++) {
        // Narrow at the tail, full at three quarters, a point at the head.
        const s = i / (GUSTS.streak - 1), along = tail + shown * s, w = wide * (s < .72 ? .08 + .92 * Math.pow(s / .72, .8) : Math.pow(Math.max(0, 1 - (s - .72) / .28), .7));
        const px = x + fx * along, py = y + fy * along, pz = z + fz * along;
        if (i === 0 && !begin(GUSTS.streak, px, py, pz)) break;
        put(px - sx * w, py - sy * w, pz - sz * w, px + sx * w, py + sy * w, pz + sz * w, 1 - (1 - old) * Math.sqrt(.12 + .88 * s));
      }
      const count = lines ? d[o + 18] : 0;
      for (let i = 0; i < count; i++) {
        // A thin dart either side, a little behind the head.
        const side = (i ? -1.9 : 1.7) * width, to = tail + shown * (i ? .78 : .9), from = Math.max(tail, to - Math.min(shown, 2.2) * (i ? .5 : .62)), mid = from + (to - from) * .6, w = Math.min(.05, width * .22) * (1 - .4 * old);
        const ox = x + sx * side, oy = y + sy * side, oz = z + sz * side;
        if (to - from < .1 || !begin(GUSTS.line, ox + fx * from, oy + fy * from, oz + fz * from)) break;
        put(ox + fx * from, oy + fy * from, oz + fz * from, ox + fx * from, oy + fy * from, oz + fz * from, 1);
        put(ox + fx * mid - sx * w, oy + fy * mid - sy * w, oz + fz * mid - sz * w, ox + fx * mid + sx * w, oy + fy * mid + sy * w, oz + fz * mid + sz * w, old);
        put(ox + fx * to, oy + fy * to, oz + fz * to, ox + fx * to, oy + fy * to, oz + fz * to, old);
      }
    } else {
      look = 0;
      const from = d[o + 4], span = d[o + 5], radius = d[o + 9], width = d[o + 10], turn = d[o + 11], keep = d[o + 16];
      if (d[o + 17] === 1) {
        // A gust pushed outwards: the whole arc at once, growing, thick in the middle and closed at both ends.
        const k = age / life, out = d[o + 18] + (radius - d[o + 18]) * easeOut(age / turn), old = k * k, N = 15;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1), a = from + span * u, edge = Math.sin(u * Math.PI), s = Math.sin(a), c = Math.cos(a), inner = out - width * (.1 + .9 * edge) * (1 - .5 * k);
          if (i === 0 && !begin(N, x + s * inner, y, z + c * inner)) break;
          put(x + s * inner, y, z + c * inner, x + s * out, y, z + c * out, old + (1 - edge) * .5);
        }
      } else {
        // Swept round: from where the head was `keep` seconds ago to where it is, the newest at the head.
        const head = Math.min(1, age / turn), back = Math.max(0, (age - keep) / turn); if (!(head - back > 1e-3)) continue;
        const N = Math.max(3, Math.min(GUSTS.arc, Math.ceil(Math.abs(span) * (head - back) / .16) + 1));
        for (let i = 0; i < N; i++) {
          const u = back + (head - back) * i / (N - 1), a = from + span * u, s = Math.sin(a), c = Math.cos(a);
          // Born soft: the first of the sweep starts as a point; it narrows onto the outer edge's path as it ages, as a blade's ribbon does.
          const old = Math.min(1, (age - u * turn) / keep + TRAIL.soft * Math.max(0, 1 - u / .1)), inner = radius - width * (1 - TRAIL.taper * old);
          if (i === 0 && !begin(N, x + s * inner, y, z + c * inner)) break;
          put(x + s * inner, y, z + c * inner, x + s * radius, y, z + c * radius, old);
        }
      }
    }
  }
  return sections;
}

/** The pose of a stab or a lunge (world.ts animatePlayer): out at once, held, and back, on the punch's own clock (punch-wind.ts PUNCH). */
export const THRUST = { time: .3, /** How far the body leans and steps in (rad, m) for a stab and for a bite's lunge. */ lean: .3, step: .35, lunge: .55, lungeStep: .6 } as const;
/** The turn of a spin or of a tail sweep (world.ts): the body goes once round with the wind and eases back to its facing in `settle` seconds. */
export const TURN = { settle: .14 } as const;
/** The body's turn (rad, added to the facing) `age` seconds into a sweep of `span` rad in `turn` seconds, for a limb held `hold` rad from straight ahead: the limb points where the ribbon's head is. */
export function sweepTurn(age: number, span: number, turn: number, hold: number) {
  if (age < turn) return span * Math.max(0, age) / turn - hold;
  // Back to the facing the short way.
  let rest = (span - hold) % TAU; if (rest > Math.PI) rest -= TAU; if (rest < -Math.PI) rest += TAU;
  return rest * (1 - smooth((age - turn) / TURN.settle));
}
