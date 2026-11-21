/**
 * The explorer's motion that can wait until after Start (AAA-PLAN WP10), posed over the base pose of hero-motion.ts
 * through world.heroExtras, and the two short clips of world.playPose:
 * - a start leans in (LEAN_IN for LEAN_TIME) and a stop settles (a small rock back and a dip, SETTLE_TIME); these
 *   belong to the walk and stay on Battery saver (hero-motion.ts keeps only the blend itself in the start download);
 * - after 6 to 10 s without input a fidget: a look at the nearest creature, pet or ripe crop within 8 m, a stretch,
 *   or a tapping foot; the next one starts 6 to 10 s after that one began;
 * - after 30 s the explorer sits down, until the next input;
 * - playPose('cheer' | 'holdUp', seconds): 0.6 to 1.2 s, for a level-up and a catch.
 * Any key, press or step ends a fidget or the sit by the next frame (the pose eases out in about 0.12 s, under the
 * walk). The poses of animatePlayer that come later in the frame (air, attacks, skills, the dash, the slam, fishing,
 * the flight; swimming in afterAnimate) keep priority: while one of them runs nothing here is applied at all.
 * Battery saver: no fidgets, no sit, no clips. The fidgets draw from their own seeded generator, never Math.random.
 * Nothing is allocated per frame.
 *
 * No run-time import of start code here: importing model.ts for cropProgress split the start's rules chunk in two (one
 * more file at start). A planted bed carries its own growDuration (model.ts plant and load), which is all a look needs.
 */
import type * as T from 'three';
import type { GameServices } from '../game-services.ts';
import type { HeroMotion } from '../hero-motion.ts';

export type Act = '' | 'look' | 'stretch' | 'tap' | 'sit' | 'cheer' | 'holdUp';
/** The first fidget and the pause between two (seconds, drawn evenly), and when the explorer sits. */
export const FIDGET_MIN = 6, FIDGET_MAX = 10, SIT_AT = 30;
/** How long a fidget lasts, and how far it may look (metres; the head turns at most HEAD_TURN radians). */
export const FIDGET_TIME = { look: 2.6, stretch: 2.4, tap: 2.2 }, LOOK_REACH = 8, HEAD_TURN = 1.1;
/** A start's lean (radians, over LEAN_TIME seconds) and how long a stop settles (seconds). */
export const LEAN_IN = .12, LEAN_TIME = .15, SETTLE_TIME = .3;
/** A clip's length is kept inside these (seconds). */
export const CLIP_MIN = .6, CLIP_MAX = 1.2;
/** Seconds to ease a pose in (per act) and out (when it ends by itself; when input cancels it). */
const EASE_IN: Record<Act, number> = { '': 1, look: .4, stretch: .5, tap: .3, sit: .6, cheer: .12, holdUp: .15 }, EASE_OUT = .3, CLIP_OUT = .18, CANCEL = .12;

type Rot = { rotation: { x: number; y: number; z: number } } | null | undefined;
export interface HeroParts { armL: Rot; armR: Rot; legL: Rot; legR: Rot; head: Rot }
/** 0: standing free; 1: walking (a fidget ends, eased); 2: a pose of animatePlayer has the body (nothing is applied). */
export type Busy = 0 | 1 | 2;

const toward = (r: { x: number; y: number; z: number }, x: number, y: number, z: number, k: number) => { r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k; };

export class HeroIdle {
  /** Seconds since the last input; when the next fidget is due on that clock. */
  idle = 0; next: number;
  /** What is running; what is drawn (it stays while the pose eases out); seconds into it and its length. */
  act: Act = ''; shown: Act = ''; t = 0; time = 0;
  /** How much of the pose is on (0..1, linear; drawn through a smooth step). */
  w = 0;
  /** The last fidget (never the same twice in a row), and a press or key since the last frame. */
  last: Act = ''; poked = false;
  /** Where the head is turned in a look (radians from the facing): it follows the thing, and stays when the thing is gone. */
  yaw = 0;
  /** Walking at the last frame; seconds of lean-in and of settle left. */
  on = false; kick = 0; settle = 0;
  private seed: number;
  constructor(seed = 1) { this.seed = seed >>> 0; this.next = this.pause(); }
  /** mulberry32: the same seed gives the same fidgets. */
  private random() { let t = this.seed = this.seed + 0x6D2B79F5 | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  private pause() { return FIDGET_MIN + this.random() * (FIDGET_MAX - FIDGET_MIN); }
  /**
   * The lean into a start and the settle of a stop, over the gait blend (`blend`, 0..1). A stop settles only after a
   * real walk (blend over one half). Left out while another pose has the body.
   */
  ease(m: HeroMotion, dt: number, moving: boolean, busy: Busy) {
    if (moving !== this.on) { this.on = moving; if (moving) { this.kick = LEAN_TIME; this.settle = 0; } else if (m.gait.blend > .5) this.settle = SETTLE_TIME; }
    this.kick = Math.max(0, this.kick - dt); this.settle = Math.max(0, this.settle - dt);
    if (busy === 2) return;
    if (this.kick > 0) m.lean += LEAN_IN * Math.sin((1 - this.kick / LEAN_TIME) * Math.PI);
    if (this.settle > 0) { const s = 1 - this.settle / SETTLE_TIME, rock = Math.sin(s * Math.PI); m.lean -= .08 * rock * s; m.sy *= 1 - .025 * rock; }
  }
  /** Any input: the fidget or the sit ends at the next step. */
  poke() { this.poked = true; }
  /** A clip, over whatever the explorer was doing. */
  play(kind: 'cheer' | 'holdUp', seconds = 1) { this.act = this.shown = kind; this.t = 0; this.w = 0; this.time = Math.max(CLIP_MIN, Math.min(CLIP_MAX, seconds)); }
  /**
   * One frame. `look` is the angle from the facing to the thing to look at (radians), or NaN when nothing is near;
   * `drop` how far the body comes down to sit (metres). Changes the parts and the motion's twist, lean, lift and sy.
   */
  step(m: HeroMotion, parts: HeroParts, dt: number, busy: Busy, saver: boolean, look: number, drop: number) {
    if (saver) { this.act = this.shown = ''; this.w = this.idle = 0; this.poked = false; return; }
    const clip = this.act === 'cheer' || this.act === 'holdUp';
    if (busy || this.poked) {
      this.poked = false; this.idle = 0;
      if (!clip) { if (this.act) this.act = ''; this.next = this.pause(); }
    } else this.idle += dt;
    if (this.act) {
      this.t += dt;
      if (this.t >= this.time) this.act = '';
    } else if (!busy && this.idle >= SIT_AT) this.start('sit', Infinity);
    else if (!busy && this.idle >= this.next) {
      // A fidget that would run into the sit is left out: the sit comes on time.
      if (this.next + FIDGET_TIME.look > SIT_AT) this.next = Infinity;
      else {
        const seen = look === look, r = this.random();
        let pick: Act = seen && r < .5 ? 'look' : r < (seen ? .75 : .5) ? 'stretch' : 'tap';
        if (pick === this.last) pick = pick === 'tap' ? 'stretch' : 'tap';
        this.start(this.last = pick, FIDGET_TIME[pick as 'look']); this.next = this.idle + this.pause(); if (seen) this.yaw = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, look));
      }
    }
    // The weight: up while the act runs (down again in its last EASE_OUT), down fast after a cancel, nothing under another pose.
    if (busy === 2) { this.w = 0; if (!this.act) this.shown = ''; return; }
    const out = clip ? CLIP_OUT : EASE_OUT, on = !!this.act && this.time - this.t > out;
    this.w = on ? Math.min(1, this.w + dt / EASE_IN[this.act]) : Math.max(0, this.w - dt / (this.act ? out : CANCEL));
    if (this.w <= 0) { if (!this.act) this.shown = ''; return; }
    if (this.shown === 'look' && look === look) this.yaw += (Math.max(-HEAD_TURN, Math.min(HEAD_TURN, look)) - this.yaw) * Math.min(1, dt * 6);
    this.pose(m, parts, this.w * this.w * (3 - 2 * this.w), drop);
  }
  private start(act: Act, time: number) { this.act = this.shown = act; this.t = 0; this.time = time; }
  private pose(m: HeroMotion, p: HeroParts, k: number, drop: number) {
    const t = this.t, aL = p.armL?.rotation, aR = p.armR?.rotation, lL = p.legL?.rotation, lR = p.legR?.rotation, h = p.head?.rotation;
    switch (this.shown) {
      case 'look': {
        if (h) toward(h, 0, this.yaw, 0, k); m.twist += this.yaw * .2 * k; break;
      }
      case 'stretch': {
        // Both arms up and a little apart, the back arched, up on a long breath.
        const s = Math.sin(t * 2.6) * .08;
        if (aL) toward(aL, -2.75 + s, 0, -.3 - s, k); if (aR) toward(aR, -2.75 + s, 0, .3 + s, k);
        if (h) toward(h, -.22, 0, 0, k); m.lean -= .14 * k; m.sy *= 1 + .035 * k; break;
      }
      case 'tap': {
        // One foot forward, tapping twice a second; a hand out, the head to one side.
        const beat = .5 - .5 * Math.cos(t * 12.6);
        if (lR) toward(lR, -.2 - .3 * beat, 0, 0, k); if (aL) toward(aL, 0, 0, -.6, k);
        if (h) toward(h, 0, -.25, .1, k); m.twist += .12 * k; break;
      }
      case 'sit': {
        // Legs out in front, hands planted behind, the body down on the ground and leaning back a little.
        if (lL) toward(lL, -1.45, 0, 0, k); if (lR) toward(lR, -1.38, 0, 0, k);
        if (aL) toward(aL, .5, 0, -.5, k); if (aR) toward(aR, .5, 0, .5, k);
        m.lift = m.lift * (1 - k) - drop * k; m.lean -= .16 * k; break;
      }
      case 'cheer': {
        // Arms up in a V, pumping, with two small hops.
        const pump = Math.sin(t * 14) * .22, hop = Math.abs(Math.sin(t / this.time * Math.PI * 2));
        if (aL) toward(aL, -2.6 + pump, 0, -.55, k); if (aR) toward(aR, -2.6 - pump, 0, .55, k);
        if (h) toward(h, -.2, 0, 0, k); m.lift += .2 * hop * k; m.lean -= .08 * k; break;
      }
      case 'holdUp': {
        // Both hands together overhead, looking up at what they hold.
        if (aL) toward(aL, -3, 0, .14, k); if (aR) toward(aR, -3, 0, -.14, k);
        if (h) toward(h, -.28, 0, 0, k); m.lean -= .06 * k; m.sy *= 1 + .03 * k; break;
      }
    }
  }
}

/** The fields of the world that mean another pose has the body (animatePlayer, swim.ts). */
interface Posed {
  punchT?: number; spinT?: number; aimT?: number; castT?: number; castAirT?: number; hurtT?: number; landT?: number; pose?: unknown; skillPose?: unknown;
  fishing?: string; jump?: { airborne?: boolean }; playerFlying?: boolean; waterPass?: boolean; gazeAngle?: number | null; hurtReact?: { left: number } | null;
}
export function busyOf(w: Posed & { moving?: boolean }): Busy {
  return (w.punchT! > 0 || w.spinT! > 0 || w.aimT! > 0 || w.castT! > 0 || w.castAirT! > 0 || w.hurtT! > 0 || w.landT! > 0 || w.pose || w.skillPose || w.fishing && w.fishing !== 'idle'
    || w.jump?.airborne || w.playerFlying || w.waterPass || w.gazeAngle != null || w.hurtReact && w.hurtReact.left > 0) ? 2 : w.moving ? 1 : 0;
}

export function mount(s: GameServices) {
  const w = s.world, idle = new HeroIdle(0x5eed + s.slot()), parts: HeroParts = { armL: null, armR: null, legL: null, legR: null, head: null };
  let root: T.Object3D | null = null, hip: T.Object3D | null = null, best = 0, bx = 0, bz = 0;
  const under = (node: T.Object3D | null, top: T.Object3D) => { for (let p = node; p; p = p.parent) if (p === top) return true; return false; };
  const find = () => {
    const p = w.player; root = p.children[0] ?? null; hip = p.getObjectByName('leg-left') ?? null;
    parts.armL = p.getObjectByName('arm-left'); parts.armR = p.getObjectByName('arm-right'); parts.legL = hip; parts.legR = p.getObjectByName('leg-right'); parts.head = p.getObjectByName('head');
  };
  const near = (x: number, z: number) => { const d = (x - w.position.x) ** 2 + (z - w.position.z) ** 2; if (d < best) { best = d; bx = x; bz = z; } };
  const pet = (g: T.Object3D) => { if (g.visible && g.children.length) near(g.position.x, g.position.z); };
  /** The angle from the facing to the nearest creature, pet or ripe crop within reach; NaN when there is none (or indoors). */
  const look = () => {
    best = LOOK_REACH * LOOK_REACH; const none = best;
    if (!w.interior) {
      for (const e of w.enemies) if (e.hp > 0 && e.mesh.visible) near(e.mesh.position.x, e.mesh.position.z);
      pet(w.companion); pet(w.companion2);
      const plots = s.state().plots;
      for (let i = 0; i < w.plotMeshes.length; i++) { const bed = w.plotMeshes[i]?.parent, plot = plots[i]; if (bed?.visible && plot?.crop && plot.growDuration! > 0 && Date.now() - plot.plantedAt >= plot.growDuration!) near(bed.position.x, bed.position.z); }
    }
    if (best >= none) return NaN;
    const a = Math.atan2(bx - w.position.x, bz - w.position.z) - w.facing; return Math.atan2(Math.sin(a), Math.cos(a));
  };
  let seen = NaN, asked = -1;
  w.heroExtras = (m, dt) => {
    if (root !== (w.player.children[0] ?? null) || !under(hip, w.player)) find();
    const busy = busyOf(w as unknown as Posed);
    // The thing to look at is searched for once a second while standing idle and on every frame of a look (it may walk).
    if (!busy && (idle.shown === 'look' || idle.idle - asked >= 1 || idle.idle < asked)) { seen = look(); asked = idle.idle; }
    idle.ease(m, dt, !!w.moving, busy);
    idle.step(m, parts, dt, busy, s.quality() === 'low', seen, Math.max(0, (hip?.position.y ?? .52) - .1) * (w.player.scale.y || 1));
  };
  Object.assign(w.heroExtras, { idle }); // for the probes and tests: world.heroExtras.idle
  w.playPose = (kind, seconds) => { if (s.quality() !== 'low') idle.play(kind, seconds); };
  const poke = () => idle.poke();
  for (const type of ['keydown', 'pointerdown', 'wheel']) globalThis.addEventListener?.(type, poke, { capture: true, passive: true });
  s.on('levelUp', () => w.playPose?.('cheer', 1));
  s.on('fishCatch', () => w.playPose?.('holdUp', 1.2));
}
