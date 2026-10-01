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
export interface GroundOptions {
  planet: PlanetId; layout: EnvironmentLayout; ponds: readonly Pond[];
  /** Height of the flat ground (the ocean floor and cloud sea sit lower). */
  base: number;
  /** Extra height at a point, such as lava pools sunk below the rock. */
  height?: (x: number, z: number) => number;
  segments?: number;
}

export function groundColor(planet: PlanetId, x: number, z: number, ponds: readonly Pond[], out: T.Color) {
  const r = Math.hypot(x, z);
  if (planet === 'home') {
    out.setRGB(0, 0, 0);
    for (const [dx, dz] of SAMPLES) out.add(HOME[zoneAt({ x: x + dx, z: z + dz })]);
    out.multiplyScalar(1 / SAMPLES.length);
    out.offsetHSL(0, 0, (noise2(x * .15, z * .15) * .7 + noise2(x * .6, z * .6) * .3 - .5) * .09);
    const trail = trailDistance(x, z);
    if (trail < 2.2 && r < RIM_START - 3) out.lerp(scratch.set(zoneAt({ x, z }) === 'canyon' ? '#e8a868' : '#e8cf92'), 1 - smoothstep(trail, 1.2, 2.2));
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
    out.lerp(scratch.set(pad), (1 - smoothstep(r, 9, 11.5)) * .8);
    if (Math.abs(r - 11) < .5) out.offsetHSL(0, 0, -.05);
    if (r > 146) out.lerp(scratch.set(pad).offsetHSL(0, 0, -.15), smoothstep(r, 146, 156));
  }
  // A sandy halo blends each pond into the grass.
  for (const p of ponds) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 1.05 + 1.6) out.lerp(scratch.set(planet === 'candy' ? '#ffd8ec' : '#ecd9a0'), (1 - smoothstep(d, p.r, p.r * 1.05 + 1.6)) * .85); }
  return out;
}

export const GROUND_TILE = 80;
/** A 2 × 2 pixel checker repeated so each square is 4 m, drawn crisp with nearest filtering. */
function checker(a: string, b: string) {
  // Raw pixels rather than a canvas, so worlds can also be built outside a browser (tests).
  const bytes = (hex: string) => { const c = new T.Color(hex); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255]; };
  const [pa, pb] = [bytes(a), bytes(b)], texture = new T.DataTexture(new Uint8Array([...pa, ...pb, ...pb, ...pa]), 2, 2);
  texture.colorSpace = T.SRGBColorSpace; texture.magFilter = T.NearestFilter; texture.minFilter = T.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(GROUND_TILE / 8, GROUND_TILE / 8);
  return texture;
}

export function buildGround({ planet, ponds, base, height, segments = 20 }: GroundOptions): T.Group {
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
      groundColor(planet, x, z, ponds, color); colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    if (raised) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const tile = new T.Mesh(geometry, material); tile.receiveShadow = true; tile.castShadow = false; tile.matrixAutoUpdate = false;
    group.add(tile);
  }
  return group;
}
