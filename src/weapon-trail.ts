import * as T from 'three';
import { TRAIL, TrailSamples, buildRibbon, bladeAxis, bladeTint, plainBlade, maxSections, type Blade } from './trail-ribbon.ts';
import { WIND, WindBursts, buildWind, WIND_SECTIONS } from './punch-wind.ts';
import { SkillGusts, buildGusts, GUST_SECTIONS } from './skill-wind.ts';

/**
 * Draws the weapon trail, the wind off a punch and the wind of a disguise's skill (trail-ribbon.ts, punch-wind.ts,
 * skill-wind.ts): one mesh per swinger, made once,
 * with vertex buffers that are rewritten in place while a swing shows and hidden (no draw call, no work) the rest of
 * the time. Every swinger shares one material, so a second swinger costs one more draw call and no new shader.
 */

/** Sections one swinger can show at once: a full ring of blade ribbons (a chain leaves up to three), the wind of a punch, the wind of a skill, and the joins between them. */
const SECTIONS = maxSections() + WIND_SECTIONS + GUST_SECTIONS + 10;

let shared: T.ShaderMaterial | null = null;
/**
 * The look of both. A blade's ribbon (look 0): a soft body in the weapon's colour that fades towards the inner edge, a
 * bright line along the tip's path and a thin deep rim outside it. The wind (look 1): a white core inside a rim of
 * its colour, soft at both edges. Both are paint more than light (they cover what is behind them a little), and the
 * deep rims are there for bright ground: on snow or candy a white line alone would vanish, on night ground the white
 * core carries it. Everything fades with age and nothing writes depth.
 */
export function trailMaterial() {
  return shared ??= new T.ShaderMaterial({
    name: 'weapon-trail', transparent: true, depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false,
    blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */`
      attribute vec2 trail; attribute vec4 tint; varying vec2 vTrail; varying vec4 vTint;
      void main() { vTrail = trail; vTint = tint; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vTrail; varying vec4 vTint;
      void main() {
        float across = vTrail.x, left = 1.0 - vTrail.y, fade = left * left;
        vec3 paint = vTint.rgb; vec4 blade, wind;
        {
          float body = (smoothstep(0.0, 0.75, across) * 0.55 + smoothstep(0.3, 0.42, across) * (1.0 - smoothstep(0.42, 0.56, across)) * 0.12) * fade;
          float rim = smoothstep(0.93, 0.975, across) * fade;
          float core = smoothstep(0.74, 0.84, across) * fade * (1.0 - rim);
          // The body is see-through paint in the weapon's colour (so the colour holds on bright ground); the tip's line is light; the rim is the colour, deep.
          blade = vec4(paint * body * (1.0 - core) * (1.0 - rim) + vec3(core) + paint * 0.3 * rim * 0.8, max(body * 0.85 * (1.0 - core), max(core * 0.6, rim * 0.8)));
        }
        {
          float c = 1.0 - abs(across * 2.0 - 1.0);
          float cover = smoothstep(0.0, 0.16, c) * fade, core = smoothstep(0.3, 0.62, c);
          wind = vec4(mix(paint, vec3(1.0), core) * cover * 0.94, cover * 0.94);
        }
        gl_FragColor = mix(blade, wind, step(0.5, vTint.a));
        #include <colorspace_fragment>
      }`,
  });
}

const tmp = new T.Vector3(), toHand = new T.Matrix4(), toPiece = new T.Matrix4();

export interface HeldBlade { blade: Blade; /** The trail colour read off the weapon's paint (linear r, g, b), or null. */ tint: [number, number, number] | null; /** False when no weapon model was there to measure. */ measured: boolean }
/**
 * Measures the weapon a hand holds: its long axis (trail-ribbon.ts bladeAxis) and its colour. Reads the pieces marked
 * `userData.blade` (World.wearKit marks the weapon's), else every drawn piece under the hand. Call it once per avatar
 * and keep the answer: it walks the weapon's vertices.
 */
export function measureBlade(hand: T.Object3D): HeldBlade {
  const pieces: T.Mesh[] = [];
  hand.traverse(o => { if (o instanceof T.Mesh && !o.userData.outline && o.geometry?.getAttribute('position')) pieces.push(o); });
  const marked = pieces.filter(o => o.userData.blade), use = marked.length ? marked : pieces;
  let count = 0; for (const o of use) count += o.geometry.getAttribute('position').count;
  if (!count) return { blade: plainBlade(), tint: null, measured: false };
  hand.updateWorldMatrix(true, true); toHand.copy(hand.matrixWorld).invert();
  const points = new Float32Array(count * 3), paint: number[] = []; let at = 0;
  for (const o of use) {
    const p = o.geometry.getAttribute('position'); toPiece.multiplyMatrices(toHand, o.matrixWorld);
    for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).applyMatrix4(toPiece); points[at++] = tmp.x; points[at++] = tmp.y; points[at++] = tmp.z; }
    const m = (Array.isArray(o.material) ? o.material[0] : o.material) as T.MeshToonMaterial | undefined, c = m?.color;
    if (c && !o.geometry.getAttribute('color')) paint.push(c.r, c.g, c.b, p.count);
  }
  const blade = bladeAxis(points);
  return blade ? { blade, tint: bladeTint(paint), measured: true } : { blade: plainBlade(), tint: null, measured: false };
}

/** One swinger's trail: its samples, its bursts of wind and the mesh that shows them. */
export class WeaponTrail {
  readonly mesh: T.Mesh;
  readonly samples = new TrailSamples();
  readonly wind = new WindBursts();
  /** The wind of a disguise's skill (skill-wind.ts): streaks and arcs, in the same buffers. */
  readonly gusts = new SkillGusts();
  /** Sections drawn by the last `draw` (tests, the perf probe). */
  sections = 0;
  private position: T.BufferAttribute; private trail: T.BufferAttribute; private tint: T.BufferAttribute;

  constructor() {
    const g = new T.BufferGeometry(), dynamic = (a: T.BufferAttribute) => { a.setUsage(T.DynamicDrawUsage); return a; };
    g.setAttribute('position', this.position = dynamic(new T.BufferAttribute(new Float32Array(SECTIONS * 6), 3)));
    g.setAttribute('trail', this.trail = dynamic(new T.BufferAttribute(new Float32Array(SECTIONS * 4), 2)));
    g.setAttribute('tint', this.tint = dynamic(new T.BufferAttribute(new Float32Array(SECTIONS * 8).fill(1), 4))); // r, g, b and the look (0 a blade's ribbon, 1 wind)
    const index = new Uint16Array((SECTIONS - 1) * 6);
    for (let i = 0; i < SECTIONS - 1; i++) index.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    g.setIndex(new T.BufferAttribute(index, 1)); g.setDrawRange(0, 0);
    this.mesh = new T.Mesh(g, trailMaterial());
    this.mesh.name = 'weapon-trail'; this.mesh.frustumCulled = false; this.mesh.castShadow = this.mesh.receiveShadow = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** True while anything is left to draw. */
  get active() { return this.samples.count > 0 || this.wind.count > 0 || this.gusts.count > 0; }

  /**
   * Adds where the blade is now: `hand.matrixWorld` must be this frame's. `fresh` starts a new ribbon (a new cut; what
   * is left of the last one fades on by itself); `fade` is the age the sample is born with (trail-ribbon.ts), for a
   * ribbon whose far end should be soft.
   */
  sample(hand: T.Object3D, blade: Blade, now: number, fresh = false, fade = 0) {
    const e = hand.matrixWorld.elements, i = blade.inner, t = blade.tip;
    this.samples.push(e[0] * i[0] + e[4] * i[1] + e[8] * i[2] + e[12], e[1] * i[0] + e[5] * i[1] + e[9] * i[2] + e[13], e[2] * i[0] + e[6] * i[1] + e[10] * i[2] + e[14],
      e[0] * t[0] + e[4] * t[1] + e[8] * t[2] + e[12], e[1] * t[0] + e[5] * t[1] + e[9] * t[2] + e[13], e[2] * t[0] + e[6] * t[1] + e[10] * t[2] + e[14], now, fresh, fade);
  }

  /**
   * Rebuilds the mesh for time `now`. `detail` 0-1 is the graphics setting's particle density (fx.density): a low one
   * shortens the ribbon and uses fewer sections. (r, g, b) is the blade's colour; `view` is where the camera is (the
   * wind turns to face it). Returns false once nothing is left, with the mesh hidden.
   */
  draw(now: number, detail: number, r: number, g: number, b: number, view?: { x: number; y: number; z: number }) {
    const low = detail <= .5, life = low ? TRAIL.lifeLow : TRAIL.life;
    this.samples.prune(now, life); this.wind.prune(now); if (this.gusts.count) this.gusts.prune(now);
    const position = this.position.array as Float32Array, trail = this.trail.array as Float32Array, tint = this.tint.array as Float32Array;
    const blade = buildRibbon(this.samples, now, life, low ? TRAIL.subdivLow : TRAIL.subdiv, position, trail, 0);
    const wind = this.wind.count ? view ? buildWind(this.wind, now, position, trail, tint, blade, low ? WIND.linesLow : WIND.lines, view.x, view.y, view.z) : buildWind(this.wind, now, position, trail, tint, blade, low ? WIND.linesLow : WIND.lines) : blade;
    const sections = this.gusts.count ? view ? buildGusts(this.gusts, now, position, trail, tint, wind, !low, view.x, view.y, view.z) : buildGusts(this.gusts, now, position, trail, tint, wind, !low) : wind;
    this.sections = sections;
    if (sections < 2) { this.mesh.visible = false; this.mesh.geometry.setDrawRange(0, 0); return false; }
    for (let i = 0, n = blade * 8; i < n; i += 4) { tint[i] = r; tint[i + 1] = g; tint[i + 2] = b; tint[i + 3] = 0; }
    this.tint.clearUpdateRanges(); this.tint.addUpdateRange(0, sections * 8); this.tint.needsUpdate = true;
    this.position.clearUpdateRanges(); this.position.addUpdateRange(0, sections * 6); this.position.needsUpdate = true;
    this.trail.clearUpdateRanges(); this.trail.addUpdateRange(0, sections * 4); this.trail.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, (sections - 1) * 6); this.mesh.visible = true;
    return true;
  }

  clear() { this.samples.clear(); this.wind.clear(); this.gusts.clear(); this.sections = 0; this.mesh.visible = false; this.mesh.geometry.setDrawRange(0, 0); }
}

/**
 * A few trails made on demand and handed out to whoever swings: the explorer keeps one; another swinger takes a free
 * one and gives it back when its trail has faded. `take` returns null when all are out (that swing shows no trail).
 */
export class TrailPool {
  private all: WeaponTrail[] = []; private free: WeaponTrail[] = [];
  readonly max: number;
  constructor(max = 4) { this.max = max; }
  take(): WeaponTrail | null { const t = this.free.pop() ?? (this.all.length < this.max ? new WeaponTrail() : null); if (t && !this.all.includes(t)) this.all.push(t); return t; }
  give(trail: WeaponTrail) { trail.clear(); trail.mesh.removeFromParent(); if (!this.free.includes(trail)) this.free.push(trail); }
  get made() { return this.all.length; }
}
