import { BODY, bodyCircles, chargeTouches, pushClear, slideOffBodies } from './boss-body.ts';
import { KNOCK_IMPULSE } from './boss-patterns.ts';
import { staggerBroken, type Stagger } from './boss-stagger.ts';
import { BossWearView, type WearBoss } from './boss-wear-view.ts';
import type { Effects } from './fx.ts';

/**
 * Bosses that feel solid (FEEL pass, 2026-10-15), the runtime half of boss-body.ts, boss-stagger.ts and boss-wear.ts:
 * world.ts calls it, it keeps the circles of the bosses near the explorer, the explorer's knockback, and the wear view.
 *
 * - Walking into a boss: world.ts move slides the explorer round the body (slideOffBodies) instead of into it.
 * - A boss walking (or winding, spinning, charging) into the explorer shoves the explorer aside; if a wall is behind,
 *   the explorer slides out sideways, and only if both ways are shut does the boss step back (on the host: a peer cannot
 *   move a creature). The explorer is never left inside or pinned.
 * - A boss's charge stops on touching the explorer (world.ts updateEnemyAi) and throws the explorer back here, once
 *   per charge, on every browser for its own explorer (online the server deals the charge's damage, as before).
 *
 * Other explorers (online) are drawn from their poses and are not blocked here: each browser blocks its own explorer.
 * Titans (their own leaps, pulls and sweeps), the Colossus (its own module) and the dying are not solid.
 */
export interface FeelBoss extends WearBoss {
  x: number; z: number; radius: number; boss: boolean; phase?: string; skill?: string; attackCount?: number;
  dying?: number; driver?: unknown; stagger?: Stagger; chargeKnock?: number; definition?: WearBoss['definition'] & { titan?: boolean };
}
export interface FeelHost {
  time: number; position: { x: number; z: number }; enemies: readonly FeelBoss[]; fx: Effects | null;
  /** Moves the explorer, blocked by walls; `solid`: by boss bodies too (else it may cross them: a push out of one). */
  shove(x: number, z: number, solid?: boolean): void;
  /** Moves a boss (host or solo); false on a peer. */
  moveBoss(e: FeelBoss, x: number, z: number): boolean;
}
/** Bosses closer than this to the explorer are kept as circles; the circle buffer holds at most MAX bosses. */
const NEAR = 16, MAX = 6, PER = 5;
/** The explorer's knockback from a charge (KNOCK_IMPULSE m/s per unit, like a creature's), and how fast it dies away. */
export const HERO_KNOCK = { charge: 2.2, decay: 7 };
export const isSolidBoss = (e: FeelBoss) => e.boss && e.hp > 0 && !(e.dying! > 0) && !e.driver && !e.definition?.titan && !!e.mesh?.visible;

export class BossFeel {
  readonly circles = new Float64Array(MAX * PER * 3);
  /** Index after the last circle written (x, z, r triples). */
  end = 0;
  readonly wear = new BossWearView();
  /** The explorer's knockback velocity (m/s). */
  knock = { x: 0, z: 0 };
  private owners: (FeelBoss | null)[] = new Array(MAX * PER).fill(null);
  private push = { x: 0, z: 0 }; private near: FeelBoss[] = []; private lastFrame = NaN;

  /** The circles of the solid bosses near the explorer, fresh. */
  refresh(host: FeelHost) {
    const p = host.position; let end = 0;
    for (const e of host.enemies) {
      if (end >= this.circles.length - PER * 3) break;
      if (!isSolidBoss(e) || Math.abs(e.x - p.x) > NEAR || Math.abs(e.z - p.z) > NEAR) continue;
      const start = end; end = bodyCircles(e.type, e.radius, e.x, e.z, e.mesh.rotation.y, this.circles, end);
      for (let i = start; i < end; i += 3) this.owners[i / 3] = e;
    }
    this.end = end;
  }
  /** world.ts move: the step `to` slides round the bodies (mutated). */
  slide(from: { x: number; z: number }, to: { x: number; z: number }) { return this.end > 0 && slideOffBodies(from, to, this.circles, this.end, BODY.explorer); }

  /** Every world step, after the creatures moved: charges throw the explorer, overlaps are shoved apart, knockback slides. */
  step(host: FeelHost, dt: number, active: boolean) {
    this.refresh(host);
    if (!active || !(dt > 0)) { this.knock.x = this.knock.z = 0; return; }
    const p = host.position;
    // A charging boss that touches the explorer throws it back, once per charge (attackCount numbers its attacks).
    for (const e of host.enemies) {
      if (e.phase !== 'charge' || e.skill !== 'charge' || !isSolidBoss(e)) continue;
      if (chargeTouches(e.type, e.radius, e.x, e.z, e.mesh.rotation.y, p.x, p.z)) this.thrown(host, e);
    }
    if (Math.abs(this.knock.x) > .05 || Math.abs(this.knock.z) > .05) {
      host.shove(this.knock.x * dt, this.knock.z * dt, true); const k = Math.max(0, 1 - dt * HERO_KNOCK.decay); this.knock.x *= k; this.knock.z *= k;
    } else this.knock.x = this.knock.z = 0;
    if (!this.end) return;
    // A body over the explorer pushes the explorer out (a wall behind: sideways; both shut: the boss steps back).
    const need = pushClear(p.x, p.z, this.circles, this.end, BODY.explorer, this.push); if (!(need > 1e-4)) return;
    const nx = this.push.x / need, nz = this.push.z / need, step = Math.min(need, .6), bx = p.x, bz = p.z;
    host.shove(nx * step, nz * step);
    if (Math.hypot(p.x - bx, p.z - bz) < step * .5) for (const s of [1, -1]) { host.shove((nx * .5 - nz * s) * step, (nz * .5 + nx * s) * step); if (Math.hypot(p.x - bx, p.z - bz) >= step * .5) break; }
    // Shut in both ways (the explorer hardly moved): the boss steps back by what is left (on the host or solo).
    if (Math.hypot(p.x - bx, p.z - bz) >= step * .5) return;
    const left = pushClear(p.x, p.z, this.circles, this.end, BODY.explorer, this.push);
    if (left > .02) { const e = this.nearestOwner(p.x, p.z); if (e) host.moveBoss(e, -this.push.x, -this.push.z); }
  }
  /**
   * A charge touched the explorer: thrown back once per charge (world.ts calls this where its charge stops; a peer from the
   * host's snapshots in step), mostly along the charge and a little to the side it was struck from, clear of the lane.
   */
  thrown(host: FeelHost, e: FeelBoss) {
    const mark = e.attackCount ?? 0; if (e.chargeKnock === mark) return; e.chargeKnock = mark;
    const p = host.position, f = e.mesh.rotation.y, ax = Math.sin(f), az = Math.cos(f), dx = p.x - e.x, dz = p.z - e.z, side = dx * az - dz * ax, sl = Math.sign(side) || 1;
    const kx = ax + az * sl * .45, kz = az - ax * sl * .45, kl = Math.hypot(kx, kz) || 1;
    this.knock.x = kx / kl * HERO_KNOCK.charge * KNOCK_IMPULSE; this.knock.z = kz / kl * HERO_KNOCK.charge * KNOCK_IMPULSE;
    host.fx?.ring({ x: p.x, z: p.z }, { color: '#ffffff', from: .2, to: 1.6, life: .25, y: .5 }); host.fx?.shake(.4);
  }
  private nearestOwner(x: number, z: number) {
    let best: FeelBoss | null = null, bd = Infinity;
    for (let i = 0; i < this.end; i += 3) { const d = Math.hypot(x - this.circles[i], z - this.circles[i + 1]) - this.circles[i + 2]; if (d < bd) { bd = d; best = this.owners[i / 3]; } }
    return best;
  }
  /** Where a blow lands on a boss: its surface on the explorer's side (the nearest of its circles), at `y`. */
  contact(e: FeelBoss, from: { x: number; z: number }, out: { x: number; z: number }) {
    const end = bodyCircles(e.type, e.radius, e.x, e.z, e.mesh.rotation.y, scratch); let bd = Infinity;
    for (let i = 0; i < end; i += 3) {
      const dx = from.x - scratch[i], dz = from.z - scratch[i + 1], d = Math.hypot(dx, dz), gap = d - scratch[i + 2];
      if (gap < bd) { bd = gap; const r = Math.min(scratch[i + 2] * .92, d); out.x = scratch[i] + (d > 1e-6 ? dx / d : 0) * r; out.z = scratch[i + 1] + (d > 1e-6 ? dz / d : 0) * r; }
    }
    return out;
  }
  /** Every drawn frame after the matrices are fresh: the wear of the nearest bosses in view and the dizzy stars. */
  frame(host: FeelHost & { scene: { add(o: unknown): unknown }; viewX: number; viewZ: number }) {
    const dt = Number.isFinite(this.lastFrame) ? Math.max(0, Math.min(.1, host.time - this.lastFrame)) : 0; this.lastFrame = host.time;
    const near = this.near; near.length = 0;
    for (const e of host.enemies) if (e.boss && !e.driver && !e.definition?.titan && e.hp > 0 && e.mesh.visible && Math.abs(e.x - host.viewX) < 30 && Math.abs(e.z - host.viewZ) < 30) near.push(e);
    if (near.length > 1) near.sort((a, b) => Math.hypot(a.x - host.viewX, a.z - host.viewZ) - Math.hypot(b.x - host.viewX, b.z - host.viewZ));
    if (!near.length && !this.wearBusy) return;
    if (this.wear.group.parent !== host.scene) host.scene.add(this.wear.group);
    const now = host.time; this.wear.frame(near, b => { const s = (b as FeelBoss).stagger; return staggerBroken(s, now) ? s!.until - now : 0; }, host.fx, dt, now);
    this.wearBusy = near.length > 0 || this.wear.busy;
  }
  private wearBusy = false;
}
const scratch = new Float64Array(3 * 8);
