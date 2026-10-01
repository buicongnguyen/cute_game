import * as T from 'three';

/**
 * Pooled visual feedback: particles, glow sparks, rings, flashes, slash arcs and
 * world-anchored floating text. Every particle of a kind shares one instanced draw
 * call, so a big hit costs the same GPU work as a small one and nothing is
 * allocated per spark.
 */
export interface BurstOptions {
  n?: number; color?: string | string[]; speed?: number; up?: number; size?: number; life?: number;
  glow?: boolean; gravity?: number; spread?: number; y?: number;
}
export interface RingOptions { color?: string; from?: number; to?: number; life?: number; y?: number; thick?: number; opacity?: number }
export interface Point3 { x: number; y?: number; z: number }

const TAU = Math.PI * 2;
const between = (min: number, max: number) => min + Math.random() * (max - min);
const tmpMatrix = new T.Matrix4(), tmpQuat = new T.Quaternion(), tmpScale = new T.Vector3(), tmpPos = new T.Vector3(), tmpColor = new T.Color();
const UP = new T.Vector3(0, 1, 0);

let glowTexture: T.Texture | null = null;
/** A soft round spark drawn once and shared by every glow particle, flash and orb. */
function softDot() {
  if (glowTexture) return glowTexture;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (!canvas) return (glowTexture = new T.Texture());
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.25, 'rgba(255,255,255,.85)');
  gradient.addColorStop(.6, 'rgba(255,255,255,.22)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return (glowTexture = new T.CanvasTexture(canvas));
}

/** Particles stored as flat arrays and drawn with one InstancedMesh. */
export class ParticlePool {
  readonly mesh: T.InstancedMesh;
  count = 0;
  private readonly max: number;
  private readonly glow: boolean;
  private p: Float32Array; private v: Float32Array; private c: Float32Array;
  private life: Float32Array; private span: Float32Array; private size: Float32Array; private spin: Float32Array; private grav: Float32Array;
  private homing: Float32Array; private targets: Array<(() => T.Vector3) | null>; private arrive: Array<(() => void) | null>;
  private camera: T.Camera | null = null;

  constructor(max: number, glow: boolean) {
    this.max = max; this.glow = glow;
    const geometry = glow ? new T.PlaneGeometry(1, 1) : new T.IcosahedronGeometry(.5, 0);
    const material = glow
      ? new T.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: T.AdditiveBlending })
      : new T.MeshLambertMaterial({ flatShading: true });
    this.mesh = new T.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set('#ffffff'));
    this.mesh.instanceColor!.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = glow ? 3 : 0;
    this.mesh.castShadow = false;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.span = new Float32Array(max); this.size = new Float32Array(max);
    this.spin = new Float32Array(max); this.grav = new Float32Array(max); this.homing = new Float32Array(max);
    this.targets = new Array(max).fill(null); this.arrive = new Array(max).fill(null);
  }

  setCamera(camera: T.Camera) { this.camera = camera; }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, gravity = 12,
    target: (() => T.Vector3) | null = null, arrive: (() => void) | null = null, homingDelay = 0) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // Recycle a random spark rather than drop the newest.
    else this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    tmpColor.set(color); this.c[i * 3] = tmpColor.r; this.c[i * 3 + 1] = tmpColor.g; this.c[i * 3 + 2] = tmpColor.b;
    this.life[i] = life; this.span[i] = life; this.size[i] = size; this.spin[i] = between(-10, 10); this.grav[i] = gravity;
    this.targets[i] = target; this.arrive[i] = arrive; this.homing[i] = target ? -homingDelay : 0;
    this.mesh.setColorAt(i, tmpColor);
  }

  private remove(i: number) {
    const last = --this.count;
    if (i === last) { this.targets[i] = null; this.arrive[i] = null; return; }
    for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[last * 3 + k]; this.v[i * 3 + k] = this.v[last * 3 + k]; this.c[i * 3 + k] = this.c[last * 3 + k]; }
    this.life[i] = this.life[last]; this.span[i] = this.span[last]; this.size[i] = this.size[last]; this.spin[i] = this.spin[last];
    this.grav[i] = this.grav[last]; this.homing[i] = this.homing[last]; this.targets[i] = this.targets[last]; this.arrive[i] = this.arrive[last];
    this.targets[last] = null; this.arrive[last] = null;
    this.mesh.setColorAt(i, tmpColor.setRGB(this.c[i * 3], this.c[i * 3 + 1], this.c[i * 3 + 2]));
  }

  update(dt: number) {
    const faceCamera = this.glow && this.camera;
    for (let i = 0; i < this.count; i++) {
      const target = this.targets[i];
      if (target) {
        this.homing[i] += dt;
        if (this.homing[i] > 0) {
          // Loot orbs drift, then home in on the player and vanish on arrival.
          const goal = target(), dx = goal.x - this.p[i * 3], dy = goal.y + 1 - this.p[i * 3 + 1], dz = goal.z - this.p[i * 3 + 2];
          const distance = Math.hypot(dx, dy, dz), pull = Math.min(1, this.homing[i] * 1.5) * 30;
          if (distance < .45) { const done = this.arrive[i]; this.remove(i--); done?.(); continue; }
          this.v[i * 3] += (dx / distance * pull - this.v[i * 3]) * Math.min(1, dt * 6);
          this.v[i * 3 + 1] += (dy / distance * pull - this.v[i * 3 + 1]) * Math.min(1, dt * 6);
          this.v[i * 3 + 2] += (dz / distance * pull - this.v[i * 3 + 2]) * Math.min(1, dt * 6);
          this.life[i] = Math.max(this.life[i], .2);
        } else this.v[i * 3 + 1] -= this.grav[i] * dt * .4;
      } else this.v[i * 3 + 1] -= this.grav[i] * dt;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.remove(i--); continue; }
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < .03 && !target) { this.p[i * 3 + 1] = .03; this.v[i * 3 + 1] *= -.35; this.v[i * 3] *= .6; this.v[i * 3 + 2] *= .6; }
      const fade = this.life[i] / this.span[i], scale = this.size[i] * (this.glow ? .4 + fade * .6 : Math.min(1, fade * 1.6));
      tmpPos.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      if (faceCamera) tmpQuat.copy(this.camera!.quaternion);
      else tmpQuat.setFromAxisAngle(UP, this.spin[i] * (this.span[i] - this.life[i]));
      this.mesh.setMatrixAt(i, tmpMatrix.compose(tmpPos, tmpQuat, tmpScale.setScalar(scale)));
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.count = 0; this.mesh.count = 0; this.targets.fill(null); this.arrive.fill(null); }
}

type TransientKind = 'ring' | 'flash' | 'arc' | 'spark';
interface Transient { kind: TransientKind; object: T.Mesh | T.Sprite; material: T.Material & { opacity: number }; t: number; life: number; from: number; to: number; opacity: number }
interface Floater { el: HTMLElement; pos: T.Vector3; t: number; life: number }

let sparkTexture: T.Texture | null = null;
/**
 * An impact star with a thin ink rim, drawn normally (not added): it reads on candy-pink and
 * snow-white planets where an additive white bloom would vanish into the ground.
 */
function sparkCard() {
  if (sparkTexture) return sparkTexture;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (!canvas) return (sparkTexture = new T.Texture());
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!, star = (outer: number, inner: number) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU - Math.PI / 2, r = i % 2 ? inner : (i % 4 ? outer * .62 : outer); ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    ctx.closePath();
  };
  star(60, 17); ctx.fillStyle = '#3a2433'; ctx.fill();
  star(52, 12); ctx.fillStyle = '#ffffff'; ctx.fill();
  star(30, 8); ctx.fillStyle = '#fff6b8'; ctx.fill();
  return (sparkTexture = new T.CanvasTexture(canvas));
}

/** Scene-level effects plus camera shake and hit-stop state shared by the game loop. */
export class Effects {
  readonly sparks = new ParticlePool(420, false);
  readonly glow = new ParticlePool(360, true);
  /** 0–1: fewer particles on lower graphics settings. */
  density = 1;
  shakeAmp = 0; shakeTime = 0; hitstop = 0;
  private root = new T.Group();
  private transients: Transient[] = [];
  /**
   * Finished rings, flashes, arcs and sparks wait here for the next hit instead of being
   * disposed: creating and freeing a material per hit made the GPU relink a shader each time.
   */
  private free: Record<TransientKind, Transient[]> = { ring: [], flash: [], arc: [], spark: [] };
  private floaters: Floater[] = [];
  private layer: HTMLElement | null = null;
  private ringGeometries = new Map<string, T.BufferGeometry>();
  private arcGeometries = new Map<string, T.BufferGeometry>();
  private camera: T.Camera;
  private project = new T.Vector3();
  private side = 1;

  constructor(scene: T.Scene, camera: T.Camera, layer?: HTMLElement | null) {
    this.camera = camera; this.layer = layer ?? null;
    this.root.name = 'effects';
    this.root.add(this.sparks.mesh, this.glow.mesh);
    this.glow.setCamera(camera);
    scene.add(this.root);
  }

  setTextLayer(layer: HTMLElement) { this.layer = layer; }
  /** Re-attach after a world rebuild replaced the scene contents. */
  attach(scene: T.Scene) { if (this.root.parent !== scene) scene.add(this.root); }

  burst(at: Point3, { n = 10, color = '#ffffff', speed = 5, up = 4, size = .12, life = .8, glow = false, gravity = 12, spread = 1, y = .6 }: BurstOptions = {}) {
    const pool = glow ? this.glow : this.sparks, colors = Array.isArray(color) ? color : [color];
    const count = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU, velocity = between(.3, 1) * speed;
      pool.emit(at.x + between(-.2, .2) * spread, (at.y ?? 0) + y, at.z + between(-.2, .2) * spread,
        Math.cos(angle) * velocity, between(.4, 1) * up, Math.sin(angle) * velocity,
        between(.6, 1) * life, between(.6, 1.2) * size * (glow ? 2.4 : 1), colors[i % colors.length], gravity);
    }
  }

  /** Glowing orbs that pop out, then fly into `target` (loot, experience). */
  orbs(at: Point3, count: number, color: string, target: () => T.Vector3, arrive?: () => void) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      this.glow.emit(at.x, (at.y ?? 0) + 1, at.z, Math.cos(angle) * 4, between(4, 7), Math.sin(angle) * 4, 3, .42, color, 4, target, i === 0 ? arrive ?? null : null, .25 + i * .04);
    }
  }

  /** A pooled effect object of this kind, made on first use and recycled after. */
  private take(kind: TransientKind, make: () => Transient['object']) {
    let fx = this.free[kind].pop();
    if (!fx) { const object = make(); fx = { kind, object, material: object.material as Transient['material'], t: 0, life: 1, from: 1, to: 1, opacity: 1 }; }
    fx.t = 0; fx.object.visible = true; fx.object.rotation.set(0, 0, 0);
    this.root.add(fx.object); this.transients.push(fx);
    return fx;
  }

  private ringGeometry(thick: number) {
    const key = thick.toFixed(2);
    let geometry = this.ringGeometries.get(key);
    if (!geometry) { geometry = new T.RingGeometry(Math.max(.05, 1 - thick), 1, 48).rotateX(-Math.PI / 2); this.ringGeometries.set(key, geometry); }
    return geometry;
  }

  ring(at: Point3, { color = '#ffffff', from = .3, to = 4, life = .5, y = .08, thick = .18, opacity = .9 }: RingOptions = {}) {
    const fx = this.take('ring', () => { const mesh = new T.Mesh(this.ringGeometry(thick), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide })); mesh.renderOrder = 2; return mesh; });
    const ring = fx.object as T.Mesh; ring.geometry = this.ringGeometry(thick);
    (fx.material as T.MeshBasicMaterial).color.set(color); fx.material.opacity = opacity;
    ring.position.set(at.x, y, at.z); ring.scale.setScalar(from);
    Object.assign(fx, { life, from, to, opacity });
  }

  /** A quick additive bloom at a point, used for magic and muzzle flashes. */
  flash(at: Point3, color = '#ffffff', size = 1.4, life = .12) {
    const fx = this.take('flash', () => { const sprite = new T.Sprite(new T.SpriteMaterial({ map: softDot(), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); sprite.renderOrder = 3; return sprite; });
    (fx.material as T.SpriteMaterial).color.set(color); fx.material.opacity = 1;
    fx.object.position.set(at.x, at.y ?? 1, at.z); fx.object.scale.setScalar(size);
    Object.assign(fx, { life, from: size, to: size * 1.6, opacity: 1 });
  }

  /** The impact star at the point of contact: a 1.2–1.6 m card for about a tenth of a second, turned at random. */
  spark(at: Point3, size = 1.3, life = .1, color = '#ffffff') {
    const fx = this.take('spark', () => { const sprite = new T.Sprite(new T.SpriteMaterial({ map: sparkCard(), transparent: true, depthWrite: false, depthTest: false })); sprite.renderOrder = 4; return sprite; });
    const material = fx.material as T.SpriteMaterial; material.color.set(color); material.opacity = 1; material.rotation = Math.random() * TAU;
    fx.object.position.set(at.x, at.y ?? 1, at.z); fx.object.scale.setScalar(size * .7);
    Object.assign(fx, { life, from: size * .7, to: size, opacity: 1 });
  }

  /** The swoosh of a swing: a partial ring in front of the attacker. */
  slash(at: Point3, facing: number, radius = 2.2, color = '#ffffff', { arc = 2.2, y = .9, life = .22, thick = .55 } = {}) {
    const key = `${radius.toFixed(2)}:${arc.toFixed(2)}:${thick.toFixed(2)}`;
    let geometry = this.arcGeometries.get(key);
    if (!geometry) {
      geometry = new T.RingGeometry(Math.max(.2, radius - thick), radius, 32, 1, -arc / 2, arc).rotateX(-Math.PI / 2);
      this.arcGeometries.set(key, geometry);
    }
    const shape = geometry;
    const fx = this.take('arc', () => { const mesh = new T.Mesh(shape, new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); mesh.renderOrder = 3; return mesh; });
    const mesh = fx.object as T.Mesh; mesh.geometry = shape;
    (fx.material as T.MeshBasicMaterial).color.set(color); fx.material.opacity = .9;
    mesh.position.set(at.x, (at.y ?? 0) + y, at.z); mesh.rotation.y = facing - Math.PI / 2;
    Object.assign(fx, { life, from: .75, to: 1.08, opacity: .9 });
  }

  /**
   * Floating text anchored to a world point. Styles: dmg, crit, hurt, heal, xp, item, big, alert, callout.
   * Numbers land alternately left and right of the point, within ±0.3 m, so two creatures hit by
   * one spin tick never stack their numbers.
   */
  text(at: Point3, message: string, style = '') {
    if (!this.layer) return;
    const el = document.createElement('span');
    el.className = `float ${style}`; el.textContent = message;
    this.layer.append(el);
    this.side = -this.side;
    const centred = style.includes('callout') || style.includes('alert');
    this.floaters.push({ el, pos: new T.Vector3(at.x + (centred ? 0 : this.side * between(.1, .3)), (at.y ?? 0) + 1.8, at.z + (centred ? 0 : between(-.3, .3))), t: 0, life: style.includes('callout') ? 1.6 : style.includes('big') ? 1.3 : 1 });
    if (this.floaters.length > 40) { const old = this.floaters.shift()!; old.el.remove(); }
  }

  shake(amount: number) { this.shakeAmp = Math.max(this.shakeAmp, amount); this.shakeTime = .3; }
  freeze(seconds: number) { this.hitstop = Math.max(this.hitstop, seconds); }

  /** Camera offset for this frame; the world adds it after following the player. */
  shakeOffset(dt: number, out: T.Vector3) {
    if (this.shakeTime <= 0) return out.set(0, 0, 0);
    this.shakeTime -= dt;
    const k = Math.max(0, this.shakeTime / .3) * this.shakeAmp;
    if (this.shakeTime <= 0) this.shakeAmp = 0;
    return out.set((Math.random() - .5) * 2 * k, (Math.random() - .5) * k, (Math.random() - .5) * 2 * k);
  }

  private release(fx: Transient) { this.root.remove(fx.object); fx.object.visible = false; this.free[fx.kind].push(fx); }

  update(dt: number) {
    this.sparks.update(dt); this.glow.update(dt);
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const fx = this.transients[i]; fx.t += dt;
      const r = Math.min(1, fx.t / fx.life), eased = 1 - (1 - r) ** 3;
      const scale = fx.from + (fx.to - fx.from) * (fx.kind === 'flash' ? r : eased);
      fx.object.scale.setScalar(scale);
      // The impact star holds full strength, then snaps out; the rest fade over their life.
      fx.material.opacity = fx.opacity * (fx.kind === 'spark' ? (r < .6 ? 1 : (1 - r) / .4) : 1 - r);
      if (r >= 1) { this.release(fx); this.transients.splice(i, 1); }
    }
  }

  /** Floating text follows its world point every frame, so it never lags the camera. */
  updateText(dt: number, width: number, height: number) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt; f.pos.y += dt * 1.4;
      const r = f.t / f.life;
      if (r >= 1) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      this.project.copy(f.pos).project(this.camera);
      const pop = f.t < .12 ? .6 + f.t / .12 * .7 : 1.3 - Math.min(.3, (f.t - .12) * 1.5);
      f.el.style.transform = `translate(${(this.project.x * .5 + .5) * width}px,${(-this.project.y * .5 + .5) * height}px) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      f.el.style.opacity = r > .7 ? String((1 - r) / .3) : '1';
    }
  }

  clear() {
    this.sparks.clear(); this.glow.clear();
    for (const fx of this.transients) this.release(fx);
    this.transients = [];
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    this.shakeAmp = 0; this.shakeTime = 0; this.hitstop = 0;
  }

  get activeCount() { return this.sparks.count + this.glow.count + this.transients.length; }
  /** Finished effect objects waiting for reuse (tests). */
  get pooledCount() { return this.free.ring.length + this.free.flash.length + this.free.arc.length + this.free.spark.length; }
}
