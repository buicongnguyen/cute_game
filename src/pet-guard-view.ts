import type * as T from 'three';
import type { Effects } from './fx.ts';
import { PET_RULES, shotThreatens, type GuardEvent } from './pet-guard.ts';

/**
 * The picture of a pet's guard (pet-guard.ts): the bolt that meets a creature's shot in the air, the pop or the
 * smaller shot it leaves, a small shield where a blow was blocked, a glow for a mend, and the pet's little jump.
 *
 * Speed (docs/QUALITY-PLAN.md section 2): nothing here adds a draw call. The bolt is a few particles of the pooled
 * glow batch (fx.ts), rings and sparks come from the pooled transients, the float is the damage-number layer, and the
 * pet's reaction is a scale pulse on its own model. `update` returns at once while nothing is in flight; with no pet
 * out no guard ever fires, so nothing runs at all. A guard is ready once every several seconds, so there are few floats.
 */
export interface GuardShot { mesh: T.Object3D; vx: number; vz: number; life: number; damage: number; ownerId: string; targetId?: string; guarded?: boolean }
export interface PetGuardHost {
  fx(): Effects | null | undefined;
  /** The model of pet slot 0 or 1 (null for the dog, or when it is not drawn). */
  petModel(slot: number): T.Object3D | null | undefined;
  hero(): { x: number; y: number; z: number };
  /** The creature with this id, for the boss cap and for where a distraction shows. */
  creature(id: string): { x: number; z: number; boss?: boolean; hp: number } | undefined;
  /** Asks the simulation for a counter (CombatSimulation.counterShot); undefined when no pet answers. */
  counter(shot: { x: number; z: number; damage: number; boss?: boolean; owner?: string }): number | undefined;
  /** False while another machine decides the damage (online): shots are then answered where they land, by the server. */
  local(): boolean;
  /** The colour of pet slot's own shot. */
  color(slot: number): string;
  maxHp(): number;
  t(key: string, vars?: Record<string, string | number>): string;
  sound?(kind: 'guard' | 'mend'): void;
}
interface Bolt { slot: number; t: number; tau: number; fx: number; fy: number; fz: number; tx: number; tz: number; color: string; shot: GuardShot | null; left: number; cut: number }
interface Pulse { model: T.Object3D; t: number; base: number }
const BOLT_SPEED = 30, PULSE = .34;

export class PetGuardView {
  private bolts: Bolt[] = [];
  private pulses: Pulse[] = [];
  /** The bolt a counter in the air just started, waiting for shotNear to hand it the shot it answers. */
  private fresh: Bolt | null = null;
  /** Guards shown since the start, by kind (probes and tests read it). */
  readonly shown: Record<string, number> = {};
  private h: PetGuardHost;
  constructor(host: PetGuardHost) { this.h = host; }

  /** A creature's shot flies at the explorer (world.ts onPlayerShot, every step): a counter pet in reach shoots it down. Solo only. */
  shotNear(shot: GuardShot) {
    if (shot.guarded || shot.targetId || !(shot.damage > 0) || !this.h.local()) return;
    const at = shot.mesh.position, hero = this.h.hero();
    if (Math.hypot(at.x - hero.x, at.z - hero.z) > PET_RULES.leash + PET_RULES.reach || !shotThreatens({ x: at.x, z: at.z, vx: shot.vx, vz: shot.vz }, hero)) return;
    const owner = this.h.creature(shot.ownerId);
    this.fresh = null;
    const left = this.h.counter({ x: at.x, z: at.z, damage: shot.damage, boss: !!owner?.boss, owner: shot.ownerId });
    if (left === undefined) return;
    shot.guarded = true; shot.damage = left;
    // The bolt show() just started carries the shot: it pops (or shrinks) where they meet.
    const bolt = this.fresh as Bolt | null; this.fresh = null;
    if (bolt) { bolt.shot = shot; bolt.tx = at.x + shot.vx * bolt.tau; bolt.tz = at.z + shot.vz * bolt.tau; }
    else if (left <= 0) shot.life = 0;
  }

  /** A guard fired (the simulation here, or the server's word online). */
  show(e: GuardEvent) {
    this.shown[e.kind] = (this.shown[e.kind] ?? 0) + 1;
    const fx = this.h.fx(), hero = this.h.hero(), model = e.slot < 2 ? this.h.petModel(e.slot) : null;
    if (model && !this.pulses.some(p => p.model === model)) this.pulses.push({ model, t: 0, base: model.scale.x });
    if (!fx) return;
    const y = hero.y, from = { x: e.x, y: (model?.position.y ?? y) + .5, z: e.z }, tx = e.tx ?? hero.x, tz = e.tz ?? hero.z;
    if (e.kind === 'counter') {
      const d = Math.hypot(tx - e.x, tz - e.z), bolt: Bolt = { slot: e.slot, t: 0, tau: Math.max(.06, Math.min(.2, d / BOLT_SPEED)), fx: from.x, fy: from.y, fz: from.z, tx, tz, color: this.h.color(e.slot), shot: null, left: e.left, cut: e.power };
      this.bolts.push(bolt); if (e.flight) this.fresh = bolt;
      fx.flash(from, bolt.color, .7, .1); this.h.sound?.('guard');
    } else if (e.kind === 'block') {
      // The pet steps in: a small shield ring where the blow lands, and what it took off.
      const mid = { x: (e.x + hero.x) / 2, y: y + 1, z: (e.z + hero.z) / 2 };
      fx.ring(hero, { color: '#bfe6ff', from: .9, to: 1.5, life: .32, y: y + .12, thick: .14, opacity: .85 });
      fx.spark(mid, 1.1, .12, '#dff3ff');
      fx.text({ x: hero.x, y, z: hero.z }, e.left <= 0 ? this.h.t('🛡️ Blocked') : '🛡️ −' + Math.max(1, Math.round(e.power)), 'dmg block');
      this.h.sound?.('guard');
    } else if (e.kind === 'mend') {
      fx.burst({ x: hero.x, y, z: hero.z }, { n: 8, color: ['#8fe06a', '#d8ffc2'], glow: true, size: .1, speed: 1.2, up: 3.2, gravity: -1, y: .5, life: .7 });
      fx.text({ x: hero.x, y, z: hero.z }, '+' + Math.max(1, Math.round(e.power * this.h.maxHp())), 'heal');
      this.h.sound?.('mend');
    } else {
      // A distraction or the dog's bark: a small ring from the pet, and a mark over the creature it fooled.
      const c = e.target ? this.h.creature(e.target) : undefined, at = c ?? { x: tx, z: tz };
      fx.ring({ x: e.x, z: e.z }, { color: e.kind === 'bark' ? '#fff1d6' : '#ffe9a8', from: .3, to: e.kind === 'bark' ? 2.6 : 1.4, life: .35, y: y + .1, thick: .12, opacity: .7 });
      fx.text({ x: at.x, y, z: at.z }, this.h.t(e.kind === 'bark' ? '🐕 Woof!' : '💫 Distracted'), 'dmg block');
    }
  }

  /** Flies the bolts and plays the pets' jumps. Free while there are none. */
  update(dt: number) {
    if (!this.bolts.length && !this.pulses.length) return;
    const fx = this.h.fx();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i], hero = this.h.hero(); b.t += dt;
      if (b.shot && b.shot.life > 0) { const at = b.shot.mesh.position, rest = Math.max(0, b.tau - b.t); b.tx = at.x + b.shot.vx * rest; b.tz = at.z + b.shot.vz * rest; }
      const k = Math.min(1, b.t / b.tau), ty = hero.y + 1, x = b.fx + (b.tx - b.fx) * k, yy = b.fy + (ty - b.fy) * k, z = b.fz + (b.tz - b.fz) * k;
      fx?.burst({ x, z }, { n: 2, glow: true, color: b.color, size: .09, life: .22, speed: .3, up: .1, gravity: 0, y: yy, spread: .1 });
      if (k < 1) continue;
      this.bolts.splice(i, 1);
      const at = { x: b.tx, y: ty, z: b.tz }, gone = b.left <= 0;
      if (fx) {
        fx.spark(at, gone ? 1.3 : .9, .12, '#ffffff');
        fx.burst({ x: b.tx, z: b.tz }, { n: gone ? 9 : 5, color: [b.color, '#ffffff'], glow: true, size: .1, speed: 3, up: 1.5, y: ty, life: .32 });
        fx.text({ x: b.tx, y: hero.y, z: b.tz }, gone ? this.h.t('🛡️ Blocked') : '🛡️ −' + Math.max(1, Math.round(b.cut)), 'dmg block');
      }
      if (b.shot && b.shot.life > 0) { if (gone) b.shot.life = 0; else b.shot.mesh.scale.multiplyScalar(Math.max(.45, Math.min(.85, Math.sqrt(b.left / (b.left + b.cut))))); }
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]; p.t += dt; const k = Math.min(1, p.t / PULSE);
      p.model.scale.setScalar(p.base * (1 + .28 * Math.sin(k * Math.PI)));
      if (k >= 1) { p.model.scale.setScalar(p.base); this.pulses.splice(i, 1); }
    }
  }
  /** A scene change: drop what was in flight and give every pet its size back. */
  clear() { for (const p of this.pulses) p.model.scale.setScalar(p.base); this.pulses.length = 0; this.bolts.length = 0; this.fresh = null; }
}
