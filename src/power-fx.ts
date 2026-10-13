/**
 * The look of the power strike (power-rules.ts), made only of the pooled effects the game already has (fx.ts arcs,
 * rings, flashes and sparks): no mesh, material or draw call of its own. What is drawn is the area that hits: the
 * crescent is as wide as the wave and travels its whole length at the wave's speed, the gust fills the cone, the beam
 * is the beam, the ring is the ring.
 */
import { POWER, powerArea, type PowerShape } from './power-rules.ts';

interface Point3 { x: number; y?: number; z: number }
/** The few calls it needs of fx.ts FxSystem. */
export interface PowerFxHost {
  burst(at: Point3, options?: { n?: number; color?: string | string[]; speed?: number; up?: number; size?: number; life?: number; glow?: boolean; gravity?: number; spread?: number; y?: number }): void;
  ring(at: Point3, options?: { color?: string; from?: number; to?: number; life?: number; y?: number; thick?: number; opacity?: number }): void;
  flash(at: Point3, color?: string, size?: number, life?: number): void;
  slash(at: Point3, facing: number, radius?: number, color?: string, options?: { arc?: number; y?: number; life?: number; thick?: number; opacity?: number; from?: number; to?: number }): void;
}
/** The weapon's colour, lifted towards white: the strike is the brightest thing the weapon does. */
export function brighter(hex: string, amount = .55) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return '#ffffff';
  const n = parseInt(m[1], 16), up = (c: number) => Math.round(c + (255 - c) * amount);
  return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => up(c).toString(16).padStart(2, '0')).join('');
}
/** Crescents a travelling wave leaves along its way, and how far apart (m). */
export const WAVE_STEP = 1.15;

/** The wind-up: light gathers on the explorer for POWER.windup seconds. */
export function powerWindup(fx: PowerFxHost, at: Point3, color: string, level: number) {
  const y = (at.y ?? 0);
  fx.ring(at, { color: brighter(color), from: level > 1 ? 3 : 2.3, to: .35, life: POWER.windup, y: y + .12, thick: .16, opacity: .9 });
  fx.flash({ x: at.x, y: y + 1, z: at.z }, brighter(color, .8), level > 1 ? 1.9 : 1.4, POWER.windup);
}

/** One wave on its way: where it started, where it points and how far it has come. */
export interface WaveRun { x: number; y: number; z: number; facing: number; color: string; level: number; gone: number; drawn: number }
export class PowerFx {
  private waves: WaveRun[] = [];
  /** The strike lands: the whole look of `shape` from `at` along `facing`. */
  play(fx: PowerFxHost, shape: PowerShape, level: number, at: Point3, facing: number, color: string) {
    const a = powerArea(shape, level), y = at.y ?? 0, bright = brighter(color), sin = Math.sin(facing), cos = Math.cos(facing), big = level > 1;
    fx.flash({ x: at.x + sin * .8, y: y + 1, z: at.z + cos * .8 }, '#ffffff', big ? 3 : 2.3, .12);
    if (shape === 'wave') { this.waves.push({ x: at.x, y, z: at.z, facing, color, level, gone: 0, drawn: 0 }); return; }
    if (shape === 'cone') {
      // The gust: three fronts of wind opening out to the cone's edge, and the cone's own outline on the ground.
      const arc = 2 * Math.acos(a.cone);
      for (let i = 0; i < 3; i++) fx.slash({ x: at.x, y, z: at.z }, facing, a.radius, i === 1 ? '#ffffff' : bright, { arc, y: .55 + i * .35, life: .26 + i * .06, thick: .7, opacity: .85, from: .18 + i * .14, to: 1 });
      fx.slash({ x: at.x, y, z: at.z }, facing, a.radius, bright, { arc, y: .14, life: .4, thick: .09, opacity: .6, from: 1, to: 1 });
      for (let i = 1; i <= 4; i++) fx.burst({ x: at.x + sin * a.radius * i / 4, y, z: at.z + cos * a.radius * i / 4 }, { n: 5, color: ['#ffffff', bright], glow: true, size: .12, speed: 7, up: 1.5, y: .8, life: .35, gravity: 2, spread: 1.4 });
      return;
    }
    if (shape === 'beam') {
      // Sparks and flashes down the whole beam (main.ts lays the beam itself with the pooled beam plane).
      const n = Math.ceil(a.length / 2.75);
      for (let i = 1; i <= n; i++) { const s = a.length * i / n, p = { x: at.x + sin * s, y: y + .9, z: at.z + cos * s }; fx.flash(p, i % 2 ? bright : '#ffffff', a.half * 2.2, .16); fx.burst({ x: p.x, y, z: p.z }, { n: 3, color: ['#ffffff', bright], glow: true, size: .1, speed: 4, up: 2, y: .9, life: .3, gravity: 3 }); }
      fx.ring({ x: at.x + sin * a.length, y, z: at.z + cos * a.length }, { color: bright, from: .3, to: a.half * 2, life: .3, y: y + .15, thick: .14 });
      return;
    }
    // The dive version: a ring to the edge of what it hits, twice, and dirt.
    fx.ring(at, { color: '#ffffff', from: .4, to: a.radius, life: .32, y: y + .14, thick: .3, opacity: .95 });
    fx.ring(at, { color: bright, from: a.radius, to: a.radius, life: .45, y: y + .1, thick: .1, opacity: .7 });
    fx.slash({ x: at.x, y, z: at.z }, facing, a.radius, bright, { arc: 6.2, y: .5, life: .3, thick: .6, opacity: .8, from: .25, to: 1 });
    fx.burst(at, { n: big ? 20 : 14, color: ['#ffffff', bright, color], glow: true, size: .14, speed: 8, up: 4, y: .3, life: .5, gravity: 8 });
  }
  /** Every frame while a wave travels (nothing to do otherwise): a crescent each WAVE_STEP metres, as wide as the wave hits. */
  update(fx: PowerFxHost, dt: number) {
    if (!this.waves.length) return;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i], a = powerArea('wave', w.level), sin = Math.sin(w.facing), cos = Math.cos(w.facing), bright = brighter(w.color, .25);
      w.gone = Math.min(a.length, w.gone + a.speed * dt);
      while (w.drawn + WAVE_STEP <= w.gone + 1e-6) {
        w.drawn += WAVE_STEP;
        // The crescent's middle is `drawn` metres out: its circle's centre lies its radius behind that.
        const r = a.half * 1.25, back = w.drawn - r, at = { x: w.x + sin * back, y: w.y, z: w.z + cos * back }, arc = 2 * Math.asin(Math.min(1, a.half / r));
        fx.slash(at, w.facing, r, bright, { arc, y: .75, life: .24, thick: .55, opacity: .95, from: 1, to: 1 });
        if (Math.round(w.drawn / WAVE_STEP) % 2) fx.slash(at, w.facing, r, '#ffffff', { arc: arc * .8, y: .95, life: .16, thick: .2, opacity: .9, from: 1, to: 1 });
        fx.burst({ x: w.x + sin * w.drawn, y: w.y, z: w.z + cos * w.drawn }, { n: 3, color: ['#ffffff', bright], glow: true, size: .1, speed: 3.5, up: 2.2, y: .5, life: .3, gravity: 4, spread: 2 });
      }
      if (w.gone >= a.length) this.waves.splice(i, 1);
    }
  }
  get busy() { return this.waves.length > 0; }
  clear() { this.waves.length = 0; }
}
