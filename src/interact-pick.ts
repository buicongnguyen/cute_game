/**
 * Which thing the Interact key (F / the hand button) picks (FIX-PLAN 3.1). The nearest edge used to win outright, so a
 * garden bed beside a pond took F away from fishing. A pond now wins when the explorer stands at its water's edge (and is
 * not turned away from it) or faces it from close by; the cottage door keeps its old head start over a helper in front of it.
 */
export type PickTarget = { kind: string; x: number; z: number; radius: number };
/** Within this many metres of the water line counts as "at the edge". */
export const POND_EDGE = 1.2;
/** How far the pond's score moves ahead when it is preferred: more than a bed's half-width, so a bed beside it loses. */
export const POND_PREFERENCE = 3;
export function interactGap(e: PickTarget, px: number, pz: number, facing: number): number {
  const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz), edge = d - e.radius;
  let gap = edge - (e.kind === 'home' ? 1.6 : 0);
  if (e.kind === 'fish') {
    // How directly the explorer faces the pond's middle: 1 straight at it, -1 straight away (forward is sin/cos of facing).
    const toward = d > 1e-4 ? (Math.sin(facing) * dx + Math.cos(facing) * dz) / d : 1;
    if ((edge <= POND_EDGE && toward > -0.3) || (edge <= 2 && toward > 0.6)) gap -= POND_PREFERENCE;
  }
  return gap;
}
