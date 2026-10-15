import { Box3, type Object3D } from 'three';
import type { Effects } from './fx.ts';
import { SIGNATURES, SURGE, type SignatureId, type SurgeEvent } from './pet-surge.ts';

/**
 * The picture of a Bond Surge (pet-surge.ts): the pet pops up to about 85% of the explorer's height with a squash and
 * stretch, stays big, then shrinks back; its signature plays from pooled effects; a small ring on the hero plate says
 * whether the surge is ready, running or cooling down.
 *
 * Speed (docs/QUALITY-PLAN.md section 2): the pet's own model is scaled (no new mesh, no new material), the dog's
 * instanced parts take a scale, effects come from the pooled particles, rings and floats of fx.ts, and nothing is
 * allocated per frame. `update` returns at once while no surge runs and the ring has nothing new to show.
 * The timeline is the view's own (from the 'start' and 'end' events), so the same picture follows the simulation here
 * or the server's word online.
 */
export interface PetSurgeHost {
  fx(): Effects | null | undefined;
  /** The model of pet slot 0 or 1 (null for the dog). */
  petModel(slot: number): Object3D | null | undefined;
  /** Where pet slot 0 or 1 trails: `spread` multiplies its distance to the side (pet-world.ts PetCompanion). */
  pen(slot: number): { spread: number } | null | undefined;
  /** The guard dog's drawn scale (dog-world.ts GuardDogs.scale). */
  dog(): { scale: number } | null | undefined;
  hero(): { x: number; y: number; z: number };
  /** The explorer's height (m). */
  heroHeight(): number;
  /** The camera, to keep the big pet out of the line to the explorer (occluders.ts fades the scenery; the pet steps aside). */
  eye(): { x: number; y: number; z: number } | null | undefined;
  /** The pet slot's own shot colour (its element). */
  color(slot: number): string;
  creature(id: string): { x: number; z: number; boss?: boolean } | undefined;
  /** True while any pet that can surge is out with the explorer: the ring shows. */
  canSurge(): boolean;
  /** True while the explorer fights (the first-time tip waits for it). */
  fighting?(): boolean;
  t(key: string, vars?: Record<string, string | number>): string;
  sound?(kind: 'grow' | 'heavy' | 'magic' | 'zap' | 'shrink'): void;
  toast?(message: string, icon: string): void;
}
/** The guard dog's drawn height at its normal size (m): farm.glb's puppy at SHOWN.dog. */
export const DOG_HEIGHT = .62;
const SIDE_BIG = 2.4, SIDE_CLEAR = 3.6, TIP_KEY = 'zoo-garden-surge-tip';
const SOUND: Record<SignatureId, 'heavy' | 'magic' | 'zap'> = { bulwark: 'heavy', returnfire: 'zap', bloom: 'magic', taunt: 'heavy', bigbark: 'heavy', stomp: 'heavy', rebirth: 'magic', breath: 'zap', slam: 'heavy', bind: 'magic' };
const TINT: Partial<Record<SignatureId, string>> = { bulwark: '#bfe6ff', bloom: '#ffb3d9', rebirth: '#ffb347', taunt: '#ffd166', bigbark: '#fff1d6', stomp: '#ffcf8a', bind: '#9b7bff', slam: '#7fd7ff', breath: '#ff8a3d' };
const easeBack = (k: number) => { const c = 1.9, x = k - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

interface Live { slot: number; sig: SignatureId; t: number; ending: number; model: Object3D | null; base: number; target: number; side: number }

export class PetSurgeView {
  private live: Live | null = null;
  /** Game seconds when the cooldown after the last surge ends (the ring fills toward it). */
  private coolUntil = -Infinity;
  private clock = 0;
  private ringEl: HTMLElement | null = null;
  private ringFace = '';
  private tipped = false;
  /** Surges and signatures shown since the start, by signature (probes and tests read it). */
  readonly shown: Record<string, number> = {};
  private h: PetSurgeHost;
  constructor(host: PetSurgeHost) { this.h = host; try { this.tipped = localStorage.getItem(TIP_KEY) === '1'; } catch { /* private mode: the tip may show again next visit */ } }

  /** A surge event (the simulation here, or the server's word online). */
  show(e: SurgeEvent) {
    const fx = this.h.fx(), hero = this.h.hero(), color = e.slot < 2 ? this.h.color(e.slot) : '#fff1d6';
    if (e.phase === 'start') {
      this.shown.start = (this.shown.start ?? 0) + 1;
      this.finish(); const model = e.slot < 2 ? this.h.petModel(e.slot) ?? null : null;
      this.live = { slot: e.slot, sig: e.sig, t: 0, ending: -1, model, base: model ? model.scale.x : 1, target: 1, side: 1 };
      this.live.target = this.targetScale(this.live);
      if (fx) {
        fx.burst({ x: e.x, z: e.z }, { n: 16, color: [color, '#ffffff', '#ffe9a8'], glow: true, size: .14, speed: 3.2, up: 4.2, y: .4, life: .7 });
        fx.ring({ x: e.x, z: e.z }, { color, from: .3, to: 2.2, life: .4, y: hero.y + .1, thick: .2, opacity: .85 });
        fx.flash({ x: e.x, y: hero.y + .8, z: e.z }, color, 1.6, .14);
      }
      this.h.sound?.('grow'); return;
    }
    if (e.phase === 'end') { if (this.live && this.live.ending < 0) this.live.ending = 0; return; }
    if (e.reflect) {
      // Return fire: a streak from where the shot was met back to its owner, and a pop there.
      this.shown.reflect = (this.shown.reflect ?? 0) + 1;
      if (fx && e.tx !== undefined && e.tz !== undefined) {
        for (let i = 1; i <= 5; i++) { const k = i / 5; fx.burst({ x: e.x + (e.tx - e.x) * k, z: e.z + (e.tz - e.z) * k }, { n: 2, glow: true, color, size: .1, life: .3, speed: .3, up: .2, gravity: 0, y: hero.y + 1, spread: .1 }); }
        fx.spark({ x: e.tx, y: hero.y + 1, z: e.tz }, 1.2, .12, color); fx.text({ x: e.x, y: hero.y, z: e.z }, '↩️', 'dmg block');
      }
      this.h.sound?.('zap'); return;
    }
    this.signature(e, color);
  }
  /** Rebirth caught a knock-out (main.ts, the server's word online). */
  revived() {
    this.shown.revive = (this.shown.revive ?? 0) + 1; const fx = this.h.fx(), hero = this.h.hero(); if (!fx) return;
    fx.burst(hero, { n: 22, color: ['#ffb347', '#ff6a3a', '#fff1b0'], glow: true, size: .16, speed: 3, up: 6, y: .3, life: 1 });
    fx.ring(hero, { color: '#ffb347', from: .4, to: 3, life: .6, y: hero.y + .1, thick: .24 });
    fx.text({ x: hero.x, y: hero.y + .6, z: hero.z }, this.h.t('🔥 Rebirth!'), 'skillname s3'); this.h.sound?.('magic');
  }
  private signature(e: SurgeEvent, color: string) {
    const fx = this.h.fx(), hero = this.h.hero(), s = SIGNATURES[e.sig], tint = TINT[e.sig] ?? color; this.shown[e.sig] = (this.shown[e.sig] ?? 0) + 1;
    this.h.sound?.(SOUND[e.sig]); if (!fx) return;
    const at = s.around === 'hero' ? hero : { x: e.x, y: hero.y, z: e.z }, y = hero.y + .12;
    fx.text({ x: e.x, y: hero.y + 1.2, z: e.z }, `${s.icon} ${this.h.t(s.name)}`, 'skillname s2');
    if (s.around === 'cone') {
      // Fire breath: puffs along a fan toward the chosen creature (or ahead of the explorer).
      const c = e.boss ? this.h.creature(e.boss) : undefined, tx = c ? c.x : hero.x, tz = c ? c.z : hero.z, l = Math.hypot(tx - e.x, tz - e.z) || 1, dx = (tx - e.x) / l, dz = (tz - e.z) / l;
      for (let i = 1; i <= 6; i++) { const d = s.radius * i / 6, w = (i % 2 ? .35 : -.35) * d; fx.burst({ x: e.x + dx * d - dz * w, z: e.z + dz * d + dx * w }, { n: 4, glow: true, color: ['#ff8a3d', '#ffd166', '#ff4d2e'], size: .16 + i * .02, speed: 1.2, up: 1.6, y: hero.y + .8, life: .45 }); }
    } else if (s.radius > 0) {
      fx.ring(at, { color: tint, from: .4, to: s.radius, life: .5, y, thick: e.sig === 'stomp' || e.sig === 'slam' ? .36 : .22, opacity: .9 });
      fx.burst(at, { n: e.sig === 'bloom' || e.sig === 'rebirth' ? 16 : 10, color: [tint, '#ffffff'], glow: e.sig !== 'stomp' && e.sig !== 'slam', size: .13, speed: s.radius * .9, up: e.sig === 'bloom' || e.sig === 'rebirth' ? 3.5 : 1.5, y: .3, life: .6 });
      if (e.sig === 'stomp' || e.sig === 'slam' || e.sig === 'bigbark') fx.shake(.18);
    } else fx.ring(at, { color: tint, from: .6, to: 1.6, life: .5, y: hero.y + 1, thick: .12, opacity: .8 });
    if (e.boss) { const b = this.h.creature(e.boss); if (b) fx.text({ x: b.x, y: hero.y + .4, z: b.z }, this.h.t('💫 Staggered'), 'dmg block'); }
  }

  /** The size the pet pops to: SURGE.height of the explorer, measured once per surge. */
  private targetScale(l: Live) {
    const want = SURGE.height * this.h.heroHeight();
    if (l.slot === 2) return want / DOG_HEIGHT;
    if (!l.model) return 1;
    const h = modelHeight(l.model); return h > .05 ? Math.max(1.3, Math.min(8, want / h)) * l.base : l.base * 2.5;
  }
  /** Plays the grow, the hold and the shrink, steps the pet aside, and keeps the ring. Free while nothing runs. */
  update(dt: number) {
    if (!(dt > 0)) return; this.clock += dt; const l = this.live;
    if (l) {
      l.t += dt; if (l.ending >= 0) l.ending += dt; else if (l.t > SURGE.grow + SURGE.hold + 1) l.ending = 0; // the end word got lost: shrink anyway
      // The pet may have been rebuilt (a gear change): the new model starts at its own size.
      if (l.slot < 2) { const m = this.h.petModel(l.slot) ?? null; if (m !== l.model) { if (l.model) l.model.scale.setScalar(l.base); l.model = m; if (m) { l.base = m.scale.x; l.target = this.targetScale(l); } } }
      let k: number, sy = 1;
      if (l.ending >= 0) { const p = Math.min(1, l.ending / SURGE.shrink); k = 1 - p * p * (3 - 2 * p); sy = 1 - .14 * Math.sin(p * Math.PI); }
      else if (l.t < SURGE.grow) { const p = l.t / SURGE.grow; k = easeBack(p); sy = 1 + .2 * Math.sin(p * Math.PI); }
      else { k = 1; sy = 1 + .025 * Math.sin((l.t - SURGE.grow) * 2.6); }
      const scale = 1 + (l.target / l.base - 1) * k, xz = 1 / Math.sqrt(sy);
      if (l.model) l.model.scale.set(l.base * scale * xz, l.base * scale * sy, l.base * scale * xz);
      else if (l.slot === 2) { const d = this.h.dog(); if (d) d.scale = scale; }
      // Aside and a little behind, so the big pet never hides the explorer: further out while it stands in the camera's line.
      if (l.slot < 2) { const pen = this.h.pen(l.slot); if (pen) { const want = l.ending >= 0 && l.ending > SURGE.shrink * .5 ? 1 : this.blocking(l) ? SIDE_CLEAR : SIDE_BIG; l.side += (want - l.side) * (1 - Math.exp(-dt * 4)); pen.spread = l.side; } }
      if (l.ending >= SURGE.shrink) { this.finish(); this.coolUntil = this.clock + SURGE.cooldown; }
    }
    this.ring();
  }
  /** True when the big pet stands between the camera and the explorer's chest. */
  private blocking(l: Live) {
    const m = l.model, eye = this.h.eye(), hero = this.h.hero(); if (!m || !eye) return false;
    const p = m.position, dx = hero.x - eye.x, dz = hero.z - eye.z, l2 = dx * dx + dz * dz; if (l2 < 1e-6) return false;
    const t = ((p.x - eye.x) * dx + (p.z - eye.z) * dz) / l2; if (t <= 0 || t >= 1) return false;
    const off = Math.hypot(eye.x + dx * t - p.x, eye.z + dz * t - p.z), y = eye.y + (hero.y + this.h.heroHeight() * .6 - eye.y) * t;
    return off < .8 * (l.target / Math.max(1e-6, l.base)) * .35 && y < p.y + SURGE.height * this.h.heroHeight();
  }
  /** Ends the running surge's picture at once: every pet at its own size, back at its usual side. */
  private finish() {
    const l = this.live; if (!l) return; this.live = null;
    if (l.model) l.model.scale.setScalar(l.base); if (l.slot === 2) { const d = this.h.dog(); if (d) d.scale = 1; }
    if (l.slot < 2) { const pen = this.h.pen(l.slot); if (pen) pen.spread = 1; }
    const fx = this.h.fx(), hero = this.h.hero(); if (fx && l.model) fx.burst({ x: l.model.position.x, z: l.model.position.z }, { n: 8, color: '#ffffff', glow: true, size: .1, speed: 2, up: 2, y: hero.y + .3, life: .4 });
    this.h.sound?.('shrink');
  }
  /** The surge's state as the ring shows it: 'ready', 'active' (k: share left) or 'cool' (k: share done). */
  state(): { state: 'ready' | 'active' | 'cool'; k: number } {
    const l = this.live; if (l) return { state: 'active', k: l.ending >= 0 ? 0 : Math.max(0, Math.min(1, 1 - Math.max(0, l.t - SURGE.grow) / SURGE.hold)) };
    if (this.clock < this.coolUntil) return { state: 'cool', k: 1 - (this.coolUntil - this.clock) / SURGE.cooldown };
    return { state: 'ready', k: 1 };
  }
  /** The ring on the hero plate: `el` is where it goes (the plate's face). */
  mount(el: HTMLElement | null) {
    if (!el || typeof document === 'undefined') return; injectStyle();
    const ring = document.createElement('span'); ring.className = 'surge-ring'; ring.hidden = true; ring.setAttribute('role', 'img'); ring.innerHTML = '<i></i><b>💞</b>'; el.appendChild(ring); this.ringEl = ring;
  }
  private ring() {
    const el = this.ringEl; if (!el) return; const on = this.h.canSurge(), s = on ? this.state() : null, step = s ? Math.round(s.k * 24) : 0, face = s ? `${s.state}:${step}` : 'off';
    if (face === this.ringFace) return; this.ringFace = face; el.hidden = !s; if (!s) return;
    el.dataset.state = s.state; el.style.setProperty('--k', String(step / 24));
    el.setAttribute('aria-label', this.h.t(s.state === 'ready' ? 'Bond Surge ready: land a 3-hit chain' : s.state === 'active' ? 'Bond Surge: your pet is big' : 'Bond Surge cooling down'));
    el.title = el.getAttribute('aria-label') ?? '';
    if (!this.tipped && s.state === 'ready' && this.h.fighting?.()) {
      this.tipped = true; try { localStorage.setItem(TIP_KEY, '1'); } catch { /* shown once a visit */ }
      this.h.toast?.(this.h.t('Land a 3-hit chain to make your pet surge'), '💞');
    }
  }
  /** A scene change: every pet at its own size, nothing running. */
  clear() { this.finish(); this.coolUntil = -Infinity; }
}

const box = new Box3();
/** A model's height in the world (m): its bounding box, measured once a surge. */
function modelHeight(model: Object3D) { box.setFromObject(model); return box.isEmpty() ? 0 : box.max.y - box.min.y; }
let styled = false;
function injectStyle() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const css = document.createElement('style'); css.id = 'surge-ring-style';
  css.textContent = `.surge-ring{position:absolute;left:-7px;bottom:-7px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;pointer-events:none;z-index:2;background:#3a2433;box-shadow:0 1px 3px #0005}
.surge-ring>i{position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--c,#ffd166) calc(var(--k,1)*360deg),#ffffff33 0);-webkit-mask:radial-gradient(circle,transparent 7.5px,#000 8px);mask:radial-gradient(circle,transparent 7.5px,#000 8px)}
.surge-ring>b{position:relative;font-size:11px;line-height:1;filter:saturate(1.2)}
.surge-ring[data-state=ready]{--c:#ffd166;animation:surge-ready 1.6s ease-in-out infinite}
.surge-ring[data-state=active]{--c:#ff7ab6;background:#5a2448}
.surge-ring[data-state=cool]{--c:#bcd3e6}.surge-ring[data-state=cool]>b{opacity:.55}
@keyframes surge-ready{50%{box-shadow:0 0 0 3px #ffd16688,0 1px 3px #0005}}
@media (prefers-reduced-motion:reduce){.surge-ring[data-state=ready]{animation:none;box-shadow:0 0 0 2px #ffd16699}}`;
  document.head.appendChild(css);
}
