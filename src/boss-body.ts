/**
 * Boss bodies (FEEL pass, 2026-10-15): bosses are drawn about 20% smaller than before (1.85 -> 1.48) and their body is
 * fitted to what is drawn, so the explorer meets the fur, bark or scales instead of walking half inside a boss.
 *
 * Every boss has one or more body circles in its own space ([sideways, ahead, radius], metres at the drawn scale,
 * ahead = the way it faces). A round boss has one; a long boss (the Crocodile King, the Ice Mammoth, the dragons) has two to
 * four along its body, turned with its facing. The circles block the explorer (world.ts move and the shove when a boss
 * walks into the explorer) and decide when a charge touches (here and in the server's combat-authority.mjs, which import
 * this same file). The hit radius (`def.radius`: the tap circle, the reach of the explorer's blows, the server's hit and
 * contact checks, creature-to-creature spacing) stays one number: for a round boss it is its circle, for a long one it
 * reaches far enough that a fist (range 1) touching any part of the body still lands (`hitRadius`).
 *
 * Extents are the models measured at scale 1 (creatures.glb art, and the code shapes of world.ts speciesModel for the
 * rest): half the width across, and how far the model reaches ahead and behind its origin. A flyer's wings pass over the
 * explorer's head, so its extent and circles are its body only; the Ocean Leviathan swims low, so its fins block.
 */
export type BodyCircle = readonly [side: number, ahead: number, r: number];
export interface BossShape { extent: { side: number; front: number; back: number }; circles: readonly BodyCircle[] }
/** Bosses are drawn at BOSS_DRAW = 1.85 x BOSS_SIZE (creature-sizes.ts gives the same factor to radius and reach first). */
export const BOSS_SIZE = .8, BOSS_DRAW = 1.85 * BOSS_SIZE;
/**
 * fit: a single circle is this share of the drawn half-width. explorer: the explorer's own body radius (world.ts
 * EXPLORER_RADIUS). fistGap: a fist's range (1 m) less the explorer's body, so `hitRadius` lets a fist touching any circle
 * land. swing: how far past the explorer's body a boss's blow still has to reach (`bossReach`). touch: the gap at which a
 * charge counts as touching the explorer (the old rule was radius + 0.6 from the boss's centre). friction: how much of the
 * slide round a body a head-on push loses (slideOffBodies).
 */
export const BODY = { fit: [.85, .9] as const, explorer: .45, fistGap: .55, swing: .35, touch: .6, friction: .7 };
const ROUND = (side: number, front: number, back: number, r: number): BossShape => ({ extent: { side, front, back }, circles: [[0, 0, r]] });
const BIPED = ROUND(.65, .65, .65, .85); // the code-built bipeds, blobs and bears (speciesModel): a 0.65 m ball body
const OWL: BossShape = { extent: { side: .65, front: .65, back: .65 }, circles: [[0, 0, .85]] };
const DRAGON: BossShape = { extent: { side: .65, front: 1.48, back: 1.08 }, circles: [[0, 0, .9], [0, 1.35, .75], [0, -1, .6]] };
export const BOSS_SHAPES: Readonly<Record<string, BossShape>> = {
  bear: ROUND(.86, .71, .68, 1.1), yeti: ROUND(.86, .71, .63, 1.1), treant: ROUND(1.31, .92, 1.06, 1.65), mushking: ROUND(.96, .93, .96, 1.25),
  cake: ROUND(.85, .85, .85, 1.1), robot: ROUND(.87, .62, .5, 1.1),
  gingerbread: BIPED, jellyqueen: BIPED, golem: BIPED, gorilla: BIPED, shadowlord: BIPED,
  frostowl: OWL, phoenix: OWL, dragon: DRAGON,
  // Long bodies: head, middle and tail along the facing.
  croc: { extent: { side: .81, front: 1.77, back: 2.01 }, circles: [[0, 1.5, .95], [0, 0, 1.05], [0, -1.75, .85]] },
  mammoth: { extent: { side: .64, front: 1.63, back: .8 }, circles: [[0, -.15, .85], [0, 1.3, .8]] },
  leviathan: { extent: { side: 1.86, front: 1.48, back: 1.08 }, circles: [...DRAGON.circles, [-1.7, -.1, .7], [1.7, -.1, .7]] },
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** How far a circle reaches from the boss's origin. */
const far = (c: BodyCircle) => Math.hypot(c[0], c[1]) + c[2];
/** The hit radius: the middle circle, or far enough that a fist touching the farthest circle still lands. */
export function hitRadius(shape: BossShape) {
  let r = 0; for (const c of shape.circles) r = Math.max(r, c[0] === 0 && c[1] === 0 ? c[2] : far(c) - BODY.fistGap, c[2]);
  return Math.ceil(r * 100 - 1e-9) / 100; // rounded up: never a hair short of the farthest circle
}
/** How far ahead the body reaches (the nose of a long boss). */
export const frontEdge = (shape: BossShape) => Math.max(...shape.circles.map(c => c[1] + c[2]));
/** A boss's melee reach after the resize: its old reach scaled down, but never short of an explorer pressed against its front. */
export const bossReach = (shape: BossShape, reach: number) => round2(Math.max(reach, frontEdge(shape) + BODY.explorer + BODY.swing));
/** A boss's definition with the fitted hit radius and reach (a copy; the shared definition tables are not changed). */
export function fitBoss<D extends { radius: number; reach: number }>(type: string, def: D): D {
  const shape = BOSS_SHAPES[type]; if (!shape) return def;
  return { ...def, radius: hitRadius(shape), reach: bossReach(shape, def.reach) };
}

/**
 * Writes a body's circles in world space as x, z, r triples into `out` from `at`, and returns the index after the last.
 * A creature without a shape (a dungeon guardian, a titan) is one circle of `radius`.
 */
export function bodyCircles(type: string | undefined, radius: number, x: number, z: number, facing: number, out: Float64Array | number[], at = 0) {
  const shape = type ? BOSS_SHAPES[type] : undefined;
  if (!shape) { out[at] = x; out[at + 1] = z; out[at + 2] = radius; return at + 3; }
  const sin = Math.sin(facing), cos = Math.cos(facing);
  // Ahead is (sin, cos); the boss's own sideways axis (its right as drawn: model +x) is (cos, -sin).
  for (const [side, ahead, r] of shape.circles) { out[at] = x + sin * ahead + cos * side; out[at + 1] = z + cos * ahead - sin * side; out[at + 2] = r; at += 3; }
  return at;
}
export const bodyCount = (type: string | undefined) => (type && BOSS_SHAPES[type]?.circles.length) || 1;
const scratch = new Float64Array(3 * 8);
/** The gap from a point to a body's surface (negative inside): the nearest of its circles. */
export function bodyGap(type: string | undefined, radius: number, x: number, z: number, facing: number, px: number, pz: number) {
  const end = bodyCircles(type, radius, x, z, facing, scratch); let gap = Infinity;
  for (let i = 0; i < end; i += 3) gap = Math.min(gap, Math.hypot(px - scratch[i], pz - scratch[i + 1]) - scratch[i + 2]);
  return gap;
}
/** A charge touches its target once the target is this close to its body (the server checks the same). */
export const chargeTouches = (type: string | undefined, radius: number, x: number, z: number, facing: number, px: number, pz: number) => bodyGap(type, radius, x, z, facing, px, pz) < BODY.touch;

/**
 * The explorer's step against solid bodies (world.ts move): `to` is moved out to the surface of every circle it would
 * end inside, along the line from that circle's centre, which keeps the sideways part of the step: walking into a boss
 * slides round it instead of stopping dead. An explorer who already stood inside (a boss stepped onto it, a late
 * snapshot) may walk out but never deeper; boss-feel.ts step shoves it the rest of the way, a little at a time, so
 * nothing jumps. Mutates `to`; true when it changed.
 */
export function slideOffBodies(from: { x: number; z: number }, to: { x: number; z: number }, circles: ArrayLike<number>, end: number, clearance: number) {
  let changed = false;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < end; i += 3) {
    const cx = circles[i], cz = circles[i + 1], minimum = circles[i + 2] + clearance, dx = to.x - cx, dz = to.z - cz, d = Math.hypot(dx, dz);
    if (d >= minimum) continue;
    const before = Math.hypot(from.x - cx, from.z - cz), allowed = before >= minimum - 1e-6 ? minimum : before;
    if (d >= allowed - 1e-9) continue;
    // Straight at the centre there is no sideways part: leave on the side the explorer came from (or any side).
    let nx: number, nz: number;
    if (d > 1e-6) { nx = dx / d; nz = dz / d; } else { const fd = Math.hypot(from.x - cx, from.z - cz); nx = fd > 1e-6 ? (from.x - cx) / fd : 1; nz = fd > 1e-6 ? (from.z - cz) / fd : 0; }
    to.x = cx + nx * allowed; to.z = cz + nz * allowed; changed = true;
    // Friction: pushing straight at the body only creeps round it, a glancing step slides almost freely (the slide is
    // scaled by how sideways the step was), then the point goes back onto the surface.
    const sx = to.x - from.x, sz = to.z - from.z, sl = Math.hypot(sx, sz);
    if (sl > 1e-9 && before >= minimum - 1e-6) {
      const inward = Math.max(0, -((dx + cx - from.x) * nx + (dz + cz - from.z) * nz) / Math.max(1e-9, Math.hypot(dx + cx - from.x, dz + cz - from.z))), k = 1 - BODY.friction * inward;
      const bx = from.x + sx * k - cx, bz = from.z + sz * k - cz, bl = Math.hypot(bx, bz) || 1; to.x = cx + bx / bl * allowed; to.z = cz + bz / bl * allowed;
    }
  }
  return changed;
}
/**
 * How far the explorer must move to stand clear of every circle (a boss walked into it): writes the push into `out`
 * and returns its length (0 when already clear). Several passes, so a point wedged between two circles of one long body
 * comes out of both.
 */
export function pushClear(px: number, pz: number, circles: ArrayLike<number>, end: number, clearance: number, out: { x: number; z: number }) {
  let x = px, z = pz;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < end; i += 3) {
      const cx = circles[i], cz = circles[i + 1], minimum = circles[i + 2] + clearance + .002, dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d >= minimum) continue;
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; x = cx + nx * minimum; z = cz + nz * minimum; moved = true;
    }
    if (!moved) break;
  }
  out.x = x - px; out.z = z - pz; return Math.hypot(out.x, out.z);
}
