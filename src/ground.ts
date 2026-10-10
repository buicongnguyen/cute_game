import * as T from 'three';
import { PLANETS, type PlanetId } from './model.ts';
import { zoneAt, type EnvironmentLayout } from './environments.ts';
import { trailDistance, smoothstep, RIM_START } from './biomes.ts';
import { toonMaterial } from './toon.ts';

/**
 * The ground is a grid of 80 m tiles (40 m drew twice the tiles in view for no gain: the ground casts no shadow and
 * its triangles are few) shaded with vertex colours instead of one flat
 * colour: home regions blend softly into each other, gentle noise breaks up large
 * areas, sand trails wind out to the border, ponds get a sandy halo, other planets get
 * a lighter landing area, and the land rises into hills beyond the border.
 */
const hash = (x: number, z: number) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
export function noise2(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const HOME = { home: new T.Color('#93e06a'), forest: new T.Color('#5cbf57'), meadow: new T.Color('#a6e070'), swamp: new T.Color('#5fb889'), canyon: new T.Color('#f1bb7c') };
/** Per planet, the colour of soft ground patches (moss, sugar crust, frost, ash, clover...) that break up wide plains. */
const PATCH: Partial<Record<PlanetId, string>> = { candy: '#ffd0ea', ice: '#b9d6f2', lava: '#55424a', jungle: '#3c9440', ocean: '#f4e2b0', cloud: '#e6f4ff', shadow: '#3b3160' };
const SAMPLES = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2.2, 2.2], [-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2]];
const scratch = new T.Color();

export interface Pond { x: number; z: number; r: number }
/**
 * What the richer ground (look.ts, perfFlags.richLook) reads besides the planet: where trees and rocks stand, where water
 * (or lava, or a glowing plant) lies, and where feet have worn the grass away. All of it goes into the vertex colours the
 * ground already carries, so it costs nothing to draw.
 */
export interface GroundDetail {
  /** 0..1: how much canopy and rock stands over a point (shadeField). */
  shade: (x: number, z: number) => number;
  /** Ponds: the grass round them grows lusher and darker. */
  water: readonly Pond[];
  /** Things that light the ground round them (lava pools, night flowers), with their colour and strength. */
  glow: readonly (Pond & { color: string; strength?: number })[];
  /** Worn patches: doorsteps, market fronts. */
  worn: readonly Pond[];
}
/** Deeper base colours per planet: saturation and lightness shifts, the cool multiply colour of shade, and worn earth. */
const RICH: Record<PlanetId, { s: number; l: number; shade: string; wear: string }> = {
  home: { s: 0, l: 0, shade: '#6f9f96', wear: '#ead27c' }, candy: { s: .03, l: -.035, shade: '#d48ac4', wear: '#ffd98a' }, ice: { s: .06, l: -.02, shade: '#8fb4ec', wear: '#e8f4ff' },
  lava: { s: .1, l: .015, shade: '#8a5a6a', wear: '#7a5a52' }, toy: { s: 0, l: 0, shade: '#c9a8e6', wear: '#fff4c8' }, jungle: { s: 0, l: .03, shade: '#3f7a6a', wear: '#9a7a44' },
  ocean: { s: .05, l: -.02, shade: '#c8a892', wear: '#f8e8b8' }, cloud: { s: .05, l: -.02, shade: '#96b4e0', wear: '#e8f0ff' }, shadow: { s: .15, l: .02, shade: '#5a56a8', wear: '#3a3470' },
};
/** The home regions in the richer look: the same hues as HOME, a step more saturated (the colour curve adds the depth). */
const HOME_RICH = { home: new T.Color('#80d862'), forest: new T.Color('#56bf4f'), meadow: new T.Color('#9fe062'), swamp: new T.Color('#52c08c'), canyon: new T.Color('#f7c284') };
const FIELD_CELL = 4, FIELD_HALF = 212, FIELD_N = Math.ceil(FIELD_HALF * 2 / FIELD_CELL) + 1;
/**
 * A coarse map of how much stands over the ground, from the scenery plan: each piece adds a soft blob as wide as its
 * crown. Sampled smoothly, so a lone tree leaves a soft dark patch and a grove one dark floor. Built once per world.
 */
export function shadeField(pieces: readonly { x: number; z: number; r: number; weight?: number }[]) {
  const grid = new Float32Array(FIELD_N * FIELD_N), at = (v: number) => (v + FIELD_HALF) / FIELD_CELL;
  for (const p of pieces) {
    const reach = p.r + FIELD_CELL, i0 = Math.max(0, Math.floor(at(p.x - reach))), i1 = Math.min(FIELD_N - 1, Math.ceil(at(p.x + reach))), j0 = Math.max(0, Math.floor(at(p.z - reach))), j1 = Math.min(FIELD_N - 1, Math.ceil(at(p.z + reach)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * FIELD_CELL - FIELD_HALF - p.x, j * FIELD_CELL - FIELD_HALF - p.z) / reach;
      if (d < 1) grid[j * FIELD_N + i] += (1 - d * d) * (p.weight ?? 1);
    }
  }
  return (x: number, z: number) => {
    const u = Math.max(0, Math.min(FIELD_N - 1.001, at(x))), v = Math.max(0, Math.min(FIELD_N - 1.001, at(z))), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * FIELD_N + i;
    return Math.min(1, (grid[k] * (1 - fu) + grid[k + 1] * fu) * (1 - fv) + (grid[k + FIELD_N] * (1 - fu) + grid[k + FIELD_N + 1] * fu) * fv);
  };
}
/** A second colour that drifts through each home region in broad patches: moss, sun-bleached grass, peat, baked clay. */
const ACCENT = { home: '#9be064', forest: '#36a552', meadow: '#c4e860', swamp: '#3fa878', canyon: '#f0a468' } as const;
const tint = new T.Color();
/** The richer ground's work on a base colour: deeper and more saturated, broad light and dark drifts, shade under trees, lush banks, glow and wear. */
export function enrichGround(planet: PlanetId, x: number, z: number, detail: GroundDetail, out: T.Color) {
  const look = RICH[planet], plain = planet === 'toy';
  // Broad drifts (about 50 m and 14 m across): sunnier, yellower clearings and deeper, bluer hollows.
  const broad = noise2(x * .021 + 11.3, z * .021 - 7.1) - .5, mid = noise2(x * .07 - 3.7, z * .07 + 19.2) - .5, shade = detail.shade(x, z);
  if (plain) out.multiplyScalar(1 + broad * .08 + mid * .04);
  else out.offsetHSL(broad * .028, look.s + broad * .04, look.l + broad * .055 + mid * .03 + (1 - shade) * Math.max(0, broad) * .04);
  const zone = planet === 'home' ? zoneAt({ x, z }) : null;
  if (zone) out.lerp(tint.set(ACCENT[zone]), smoothstep(noise2(x * .045 + 41.7, z * .045 + 3.3), .48, .8) * .4);
  // Under trees and beside rocks the ground is cooler and darker (rose-brown on the canyon's clay, not green).
  if (shade > 0) out.lerp(tint.set(zone === 'canyon' ? '#c9908c' : look.shade).multiply(out), shade * (planet === 'lava' || planet === 'shadow' ? .4 : .7));
  for (const p of detail.water) {
    const d = Math.hypot(x - p.x, z - p.z) - p.r;
    if (d < 9 && !plain) { const k = 1 - smoothstep(d, .5, 9); out.offsetHSL(0, .1 * k, -.07 * k); }
  }
  for (const p of detail.glow) {
    const d = Math.hypot(x - p.x, z - p.z) - p.r, reach = 3 + p.r * .8;
    if (d < reach) out.lerp(tint.set(p.color), (1 - smoothstep(d, 0, reach)) * (p.strength ?? .5));
  }
  for (const p of detail.worn) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r) out.lerp(tint.set(look.wear), (1 - smoothstep(d, p.r * .2, p.r)) * .45 * (.8 + mid)); }
  return out;
}
export interface GroundOptions {
  planet: PlanetId; layout: EnvironmentLayout; ponds: readonly Pond[];
  /** The richer ground's inputs; without them the ground is the reference's plain blend. */
  detail?: GroundDetail;
  /** Height of the flat ground (the ocean floor and cloud sea sit lower). */
  base: number;
  /** Extra height at a point, such as lava pools sunk below the rock. */
  height?: (x: number, z: number) => number;
  segments?: number;
}

export function groundColor(planet: PlanetId, x: number, z: number, ponds: readonly Pond[], out: T.Color, detail?: GroundDetail) {
  const r = Math.hypot(x, z);
  if (planet === 'home') {
    out.setRGB(0, 0, 0);
    for (const [dx, dz] of SAMPLES) out.add((detail ? HOME_RICH : HOME)[zoneAt({ x: x + dx, z: z + dz })]);
    out.multiplyScalar(1 / SAMPLES.length);
    out.offsetHSL(0, 0, (noise2(x * .15, z * .15) * .7 + noise2(x * .6, z * .6) * .3 - .5) * .09);
    if (detail) enrichGround(planet, x, z, detail, out);
    const trail = trailDistance(x, z);
    // The richer trail is worn: trodden grass fades in from further out, and the sand itself is warmer.
    if (detail && trail < 5 && r < RIM_START - 3) out.lerp(scratch.set(zoneAt({ x, z }) === 'canyon' ? '#dd9858' : '#c9c078'), (1 - smoothstep(trail, 1.6, 5)) * .4);
    if (trail < 2.2 && r < RIM_START - 3) out.lerp(scratch.set(zoneAt({ x, z }) === 'canyon' ? (detail ? '#e8a060' : '#e8a868') : detail ? '#ecd090' : '#e8cf92'), 1 - smoothstep(trail, 1.2, 2.2));
    if (Math.abs(r - 18) < .9) out.offsetHSL(0, 0, -.04);
    if (r > 146) out.lerp(scratch.set('#3f8f4a'), smoothstep(r, 146, 156));
  } else {
    const def = PLANETS[planet], [low, high, pad] = def.ground, n = noise2(x * .08, z * .08) * .65 + noise2(x * .4, z * .4) * .35;
    // The toy play-mat squares come from a texture (vertex colours would blur them); this only shades it.
    if (planet === 'toy') out.set('#ffffff').offsetHSL(0, 0, (n - .5) * .06);
    else out.set(low).lerp(scratch.set(high), smoothstep(n, .3, .75));
    // Patches and a fine dapple, so the plain between props reads as ground rather than a flat fill.
    const patch = PATCH[planet];
    if (patch) { out.lerp(scratch.set(patch), smoothstep(noise2(x * .11 + 31, z * .11 - 17), .5, .72) * .85); out.offsetHSL(0, 0, (noise2(x * .3 + 5, z * .3) - .5) * .08); }
    if (planet === 'lava') out.lerp(scratch.set('#3a2f3a'), Math.max(0, noise2(x * .2 + 7, z * .2) - .55) * 1.5);
    if (detail) enrichGround(planet, x, z, detail, out);
    out.lerp(scratch.set(pad), (1 - smoothstep(r, 9, 11.5)) * .8);
    if (Math.abs(r - 11) < .5) out.offsetHSL(0, 0, -.05);
    if (r > 146) out.lerp(scratch.set(pad).offsetHSL(0, 0, -.15), smoothstep(r, 146, 156));
  }
  // A sandy halo blends each pond into the grass.
  for (const p of ponds) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 1.05 + 1.6) out.lerp(scratch.set(planet === 'candy' ? '#ffd8ec' : '#ecd9a0'), (1 - smoothstep(d, p.r, p.r * 1.05 + 1.6)) * .85); }
  return out;
}

export const GROUND_TILE = 80;
/** One checker texture per colour pair for the session: every toy-planet visit reuses it instead of leaking a new one
 * (ground materials are disposed with the world, their maps are not). */
const checkers = new Map<string, T.DataTexture>();
/** A 2 × 2 pixel checker repeated so each square is 4 m, drawn crisp with nearest filtering. */
export function checker(a: string, b: string) {
  const key = a + '|' + b, cached = checkers.get(key); if (cached) return cached;
  // Raw pixels rather than a canvas, so worlds can also be built outside a browser (tests).
  const bytes = (hex: string) => { const c = new T.Color(hex); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255]; };
  const [pa, pb] = [bytes(a), bytes(b)], texture = new T.DataTexture(new Uint8Array([...pa, ...pb, ...pb, ...pa]), 2, 2);
  texture.colorSpace = T.SRGBColorSpace; texture.magFilter = T.NearestFilter; texture.minFilter = T.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(GROUND_TILE / 8, GROUND_TILE / 8);
  texture.userData.sharedKit = true; checkers.set(key, texture);
  return texture;
}

export function buildGround({ planet, ponds, base, height, segments = 20, detail }: GroundOptions): T.Group {
  const group = new T.Group(), material = toonMaterial({ vertexColors: true, map: planet === 'toy' ? checker(PLANETS.toy.ground[0], PLANETS.toy.ground[1]) : null }), color = new T.Color();
  group.name = 'ground'; group.userData.environment = true;
  const step = GROUND_TILE, cells = Math.round(segments * step / 40);
  for (let tx = -200; tx < 200; tx += step) for (let tz = -200; tz < 200; tz += step) {
    const geometry = new T.PlaneGeometry(step, step, cells, cells).rotateX(-Math.PI / 2).translate(tx + step / 2, 0, tz + step / 2);
    const position = geometry.attributes.position, colors = new Float32Array(position.count * 3);
    let raised = false;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i), r = Math.hypot(x, z);
      // Hills rise behind the border so the world does not end at a flat edge.
      const hill = r > RIM_START + 8 ? (r - RIM_START - 8) * .4 + noise2(x * .2, z * .2) * 2 : 0, y = base + (height?.(x, z) ?? 0) + hill;
      if (y !== base) raised = true;
      position.setY(i, y);
      groundColor(planet, x, z, ponds, color, detail); colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    if (raised) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const tile = new T.Mesh(geometry, material); tile.receiveShadow = true; tile.castShadow = false; tile.matrixAutoUpdate = false;
    group.add(tile);
  }
  return group;
}
