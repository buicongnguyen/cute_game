/**
 * The explorer's motion that can wait until after Start (AAA-PLAN WP10), posed over the base pose of hero-motion.ts
 * through world.heroExtras, and the two short clips of world.playPose:
 * - a start leans in (LEAN_IN for LEAN_TIME) and a stop settles (a small rock back and a dip, SETTLE_TIME); these
 *   belong to the walk and stay on Battery saver (hero-motion.ts keeps only the blend itself in the start download);
 * - after 6 to 10 s without input a fidget: a look at the nearest creature, pet or ripe crop within 8 m, a stretch,
 *   or a tapping foot; the next one starts 6 to 10 s after that one began;
 * - after 30 s the explorer sits down, until the next input; never with a live creature within 8 m;
 * - playPose('cheer' | 'holdUp', seconds): 0.6 to 1.2 s, for a level-up and a catch. A clip starts from where the
 *   body is (what is shown eases out first), and waits up to CLIP_HOLD seconds for a fight pose to end.
 * Any key, press, pad button or step ends a fidget or the sit by the next frame; the pose eases out in about 0.12 s.
 * The poses of animatePlayer that come later in the frame (air, attacks, skills, the dash, the slam, fishing, the
 * flight; swimming in afterAnimate) keep priority: they are written over whatever is still easing out here.
 * The idle clock only runs while the game is being played: not behind a dialog, on the starship, in space, when
 * knocked out or in a hidden tab.
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
const FIDGET_TIME = { look: 2.6, stretch: 2.4, tap: 2.2 }, LOOK_REACH = 8, HEAD_TURN = 1.1;
/** A start's lean (radians, over LEAN_TIME seconds) and how long a stop settles (seconds). */
export const LEAN_IN = .12, LEAN_TIME = .15, SETTLE_TIME = .3;
/** A clip's length is kept inside these (seconds); how long a clip waits for a fight pose to end before it is dropped. */
export const CLIP_MIN = .6, CLIP_MAX = 1.2, CLIP_HOLD = 3;
/** A catch is held up this long after the fish lands (seconds): the arms rise as it arrives. */
export const HOLD_UP_DELAY = .3;
/** No sitting with a live creature this near (metres). */
const THREAT_REACH = 8;
/** Seconds to ease a pose in (per act) and out (when it ends by itself; when input cancels it). */
const EASE_IN: Record<Act, number> = { '': 1, look: .4, stretch: .5, tap: .3, sit: .6, cheer: .12, holdUp: .15 }, EASE_OUT = .3, CLIP_OUT = .18, CANCEL = .12;

type Rot = { rotation: { x: number; y: number; z: number } } | null | undefined;
export interface HeroParts { armL: Rot; armR: Rot; legL: Rot; legR: Rot; head: Rot }
/** 0: standing free; 1: walking (a fidget ends); 2: another pose has the body, or the game is not being played. */
type Busy = 0 | 1 | 2;

const toward = (r: { x: number; y: number; z: number }, x: number, y: number, z: number, k: number) => { r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k; };
const isClip = (act: Act) => act === 'cheer' || act === 'holdUp';

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
  /** A clip asked for and not yet begun: which, its length, the seconds before it may begin, the seconds it has waited under a fight pose. */
  clip: Act = ''; clipTime = 0; wait = 0; held = 0;
  private seed: number;
  constructor(seed = 1) { this.seed = seed >>> 0; this.next = this.pause(); }
  /** mulberry32: the same seed gives the same fidgets. */
  private random() { let t = this.seed = this.seed + 0x6D2B79F5 | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  private pause() { return FIDGET_MIN + this.random() * (FIDGET_MAX - FIDGET_MIN); }
  /**
   * The lean into a start and the settle of a stop, over the gait blend. A stop settles only after a real walk
   * (blend over one half). Left out while another pose has the body.
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
  /**
   * Asks for a clip, `delay` seconds from now. It begins at the next step that is free: what is shown eases out first
   * (a level-up while seated stands up into the cheer), and a fight pose is waited for (CLIP_HOLD at most).
   */
  play(kind: 'cheer' | 'holdUp', seconds = 1, delay = 0) { this.clip = kind; this.clipTime = Math.max(CLIP_MIN, Math.min(CLIP_MAX, seconds)); this.wait = delay; this.held = 0; }
  /**
   * One frame. `look` is the angle from the facing to the thing to look at (radians), or NaN when nothing is near;
   * `drop` how far the body comes down to sit (metres); `threat`: a live creature is near, no sitting.
   * Changes the parts and the motion's twist, lean, lift and sy.
   */
  step(m: HeroMotion, parts: HeroParts, dt: number, busy: Busy, saver: boolean, look: number, drop: number, threat = false) {
    if (saver) { this.act = this.shown = this.clip = ''; this.w = this.idle = 0; this.poked = false; return; }
    // A clip a fight pose cuts into starts over once the pose is done, so it is seen whole.
    if (busy === 2 && isClip(this.act)) { this.clip = this.act; this.clipTime = this.time; this.wait = this.held = 0; this.act = ''; }
    if (busy || this.poked) {
      this.poked = false; this.idle = 0;
      if (!isClip(this.act)) { this.act = ''; this.next = this.pause(); }
    } else this.idle += dt;
    if (threat && this.act === 'sit') this.act = '';
    if (this.clip) {
      if (busy === 2) { if ((this.held += dt) > CLIP_HOLD) this.clip = ''; }
      else if ((this.wait -= dt) <= 0) {
        // What is shown eases out first (0.12 s); the same clip again goes on from where the arms are.
        if (this.act !== this.clip) this.act = '';
        if (this.w <= 0 || this.shown === this.clip) { this.start(this.clip, this.clipTime); this.clip = ''; this.idle = 0; this.next = this.pause(); }
      }
    }
    if (this.act) {
      this.t += dt;
      if (this.t >= this.time) this.act = '';
    } else if (busy || this.clip) { /* nothing new now */ }
    else if (this.idle >= SIT_AT) { if (!threat) this.start('sit', Infinity); }
    else if (this.idle >= this.next) {
      // A fidget that would run into the sit is left out: the sit comes on time.
      if (this.next + FIDGET_TIME.look > SIT_AT) this.next = Infinity;
      else {
        const seen = look === look, r = this.random();
        let pick: Act = seen && r < .5 ? 'look' : r < (seen ? .75 : .5) ? 'stretch' : 'tap';
        if (pick === this.last) pick = pick === 'tap' ? 'stretch' : 'tap';
        this.start(this.last = pick, FIDGET_TIME[pick as 'look']); this.next = this.idle + this.pause(); if (seen) this.yaw = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, look));
      }
    }
    // The weight: up while the act runs (down again in its last moments), down in CANCEL seconds once it is over or cut.
    // What is left of a pose is still applied under a fight pose, which writes over the parts it needs: no pop.
    const out = isClip(this.act) ? CLIP_OUT : EASE_OUT, on = !!this.act && this.time - this.t > out;
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
        // Both arms up and wide, the back arched, the body turning slowly from side to side on a long breath.
        const s = Math.sin(t * 2.6);
        if (aL) toward(aL, -2.6, 0, -.6 - s * .08, k); if (aR) toward(aR, -2.6, 0, .6 + s * .08, k);
        if (h) toward(h, -.22, 0, 0, k); m.lean -= .16 * k; m.twist += s * .22 * k; m.sy *= 1 + .035 * k; break;
      }
      case 'tap': {
        // One foot out in front, tapping twice a second; hands on the hips, the head nodding along to one side.
        const beat = .5 - .5 * Math.cos(t * 12.6);
        if (lR) toward(lR, -.3 - .4 * beat, 0, .12, k);
        if (aL) toward(aL, .25, 0, -.75, k); if (aR) toward(aR, .25, 0, .75, k);
        if (h) toward(h, .06 * beat, -.3, .12, k); m.twist += .2 * k; break;
      }
      case 'sit': {
        // Down on the ground: legs out in front and apart (the soles show), hands planted behind, the body leaning
        // back on them, and a small bounce as it lands.
        const land = t > .45 && t < .85 ? Math.sin((t - .45) / .4 * Math.PI) : 0;
        if (lL) toward(lL, -1.5, 0, -.4, k); if (lR) toward(lR, -1.5, 0, .4, k);
        if (aL) toward(aL, .85, 0, -.6, k); if (aR) toward(aR, .85, 0, .6, k);
        if (h) toward(h, -.12, h.y, 0, k);
        m.lift = m.lift * (1 - k) - drop * k; m.lean -= .3 * k; m.sy *= 1 - .07 * land * k; break;
      }
      case 'cheer': {
        // Arms up in a V, pumping, with two small hops.
        const pump = Math.sin(t * 14) * .22, hop = Math.abs(Math.sin(t / this.time * Math.PI * 2));
        if (aL) toward(aL, -2.6 + pump, 0, -.55, k); if (aR) toward(aR, -2.6 - pump, 0, .55, k);
        if (h) toward(h, -.2, 0, 0, k); m.lift += .2 * hop * k; m.lean -= .08 * k; break;
      }
      case 'holdUp': {
        // Both hands together, held out and up in front, still, the head tipped up to what they hold. Not straight
        // overhead: the arms are short, and the head would hide them from the game's camera.
        if (aL) toward(aL, -2, 0, .42, k); if (aR) toward(aR, -2, 0, -.42, k);
        if (h) toward(h, -.3, 0, 0, k); m.lean -= .1 * k; m.sy *= 1 + .04 * k; break;
      }
    }
  }
}

/** The fields of the world that mean another pose has the body (animatePlayer, swim.ts), or that the explorer is not on stage. */
interface Posed {
  punchT?: number; spinT?: number; aimT?: number; castT?: number; castAirT?: number; hurtT?: number; landT?: number; pose?: unknown; skillPose?: unknown;
  fishing?: string; jump?: { airborne?: boolean }; playerFlying?: boolean; waterPass?: boolean; gazeAngle?: number | null; hurtReact?: { left: number } | null;
  boarded?: boolean; player?: { visible: boolean };
}
export function busyOf(w: Posed & { moving?: boolean }): Busy {
  return (w.punchT! > 0 || w.spinT! > 0 || w.aimT! > 0 || w.castT! > 0 || w.castAirT! > 0 || w.hurtT! > 0 || w.landT! > 0 || w.pose || w.skillPose || w.fishing && w.fishing !== 'idle'
    || w.jump?.airborne || w.playerFlying || w.waterPass || w.gazeAngle != null || w.hurtReact && w.hurtReact.left > 0 || w.boarded || w.player?.visible === false) ? 2 : w.moving ? 1 : 0;
}

/** How often the slow checks run (frames): an open dialog, the controls editor, a hidden tab, a creature near. */
const POLL = 12;

export function mount(s: GameServices) {
  const w = s.world, idle = new HeroIdle(0x5eed + s.slot()), parts: HeroParts = { armL: null, armR: null, legL: null, legR: null, head: null };
  const NAMES = ['arm-left', 'arm-right', 'leg-left', 'leg-right', 'head'], nodes: (T.Object3D | null)[] = [null, null, null, null, null], kin: (T.Object3D | null)[] = [null, null, null, null, null];
  let root: T.Object3D | null = null, hip: T.Object3D | null = null, best = 0, bx = 0, bz = 0;
  const under = (node: T.Object3D | null, top: T.Object3D) => { for (let p = node; p; p = p.parent) if (p === top) return true; return false; };
  const find = () => {
    const p = w.player; root = p.children[0] ?? null;
    for (let i = 0; i < 5; i++) { nodes[i] = p.getObjectByName(NAMES[i]) ?? null; kin[i] = nodes[i]?.parent ?? null; }
    parts.armL = nodes[0]; parts.armR = nodes[1]; parts.legL = hip = nodes[2]; parts.legR = nodes[3]; parts.head = nodes[4];
  };
  /** A part was swapped or moved (another body style, a disguise, an arm or head of another look): look them up again. */
  const stale = () => { if (root !== (w.player.children[0] ?? null) || !under(hip, w.player)) return true; for (let i = 0; i < 5; i++) if ((nodes[i]?.parent ?? null) !== kin[i]) return true; return false; };
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
  /** A live creature within THREAT_REACH (outdoors). */
  const menace = () => { if (w.interior) return false; const x = w.position.x, z = w.position.z; for (const e of w.enemies) if (e.hp > 0 && e.mesh.visible && (e.mesh.position.x - x) ** 2 + (e.mesh.position.z - z) ** 2 < THREAT_REACH * THREAT_REACH) return true; return false; };
  /** The page says the game is not being played: a native dialog, the controls editor, a hidden tab (main.ts uiBlocked). */
  const covered = () => { const d = globalThis.document; return !!d && (d.hidden || !!d.querySelector?.('dialog[open],#hud.ctl-editing')); };
  // Pads: counted as they connect, read each frame only while one is connected (a button or a stick is input too).
  let pads = 0;
  globalThis.addEventListener?.('gamepadconnected', () => { pads++; }); globalThis.addEventListener?.('gamepaddisconnected', () => { pads = Math.max(0, pads - 1); });
  const padInput = () => {
    const list = globalThis.navigator?.getGamepads?.(); if (!list) return false;
    for (let i = 0; i < list.length; i++) { const g = list[i]; if (!g) continue; for (let b = 0; b < g.buttons.length; b++) if (g.buttons[b].pressed) return true; for (let a = 0; a < g.axes.length; a++) if (Math.abs(g.axes[a]) > .3) return true; }
    return false;
  };
  let seen = NaN, asked = -1, frame = 0, blocked = false, threat = false;
  w.heroExtras = (m, dt) => {
    if (stale()) find();
    const saver = s.quality() === 'low';
    if (frame++ % POLL === 0) { blocked = covered(); threat = !saver && menace(); }
    if (pads && padInput()) idle.poke();
    // Not played (a dialog, knocked out) counts as a pose that has the body: the idle clock starts over.
    const busy = blocked || s.modal() || s.state().hp <= 0 ? 2 : busyOf(w as unknown as Posed);
    // The thing to look at is searched for once a second while standing idle and on every frame of a look (it may walk).
    if (!busy && !saver && idle.act !== 'sit' && (idle.shown === 'look' || idle.idle - asked >= 1 || idle.idle < asked)) { seen = look(); asked = idle.idle; }
    idle.ease(m, dt, !!w.moving, busy);
    idle.step(m, parts, dt, busy, saver, seen, Math.max(0, hip?.position.y ?? .52) * (w.player.scale.y || 1), threat);
  };
  Object.assign(w.heroExtras, { idle }); // for the probes and tests: world.heroExtras.idle
  w.playPose = (kind, seconds, delay?: number) => { if (s.quality() !== 'low') idle.play(kind, seconds, delay); };
  const poke = () => idle.poke();
  for (const type of ['keydown', 'pointerdown', 'wheel']) globalThis.addEventListener?.(type, poke, { capture: true, passive: true });
  s.on('levelUp', () => w.playPose?.('cheer', 1));
  s.on('fishCatch', () => (w.playPose as ((kind: 'holdUp', seconds: number, delay: number) => void) | undefined)?.('holdUp', 1.2, HOLD_UP_DELAY));
}
