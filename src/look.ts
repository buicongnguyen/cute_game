import * as T from 'three';
import type { PlanetId } from './content.ts';
import { perfFlags } from './perf-flags.ts';
import { LIGHT, PLANET_LIGHT, SUN_OFFSET } from './toon.ts';
import { FOG } from './camera-rig.ts';

/**
 * Our own look (docs/QUALITY-PLAN.md, stage 1): warm, saturated and toy-glossy, with a mood per planet. All of it is free
 * while playing: light colours and directions, fog and sky colours are numbers the shaders already read, and the colour
 * curve is a few multiply-adds inside the material shaders that draw anyway (three's tone-mapping hook), with no extra pass.
 * `perfFlags.richLook` off gives the reference's flat rig back, for an exact before/after.
 */
export interface PlanetLook {
  /** Sky colour high up and at the horizon. Fog fades the far ground into the horizon colour. */
  sky: readonly [top: string, horizon: string];
  fog: readonly [near: number, far: number];
  hemi: readonly [sky: string, ground: string, intensity: number];
  /** Sun colour, intensity, and where it stands: degrees round from the camera's side (positive lights right-hand faces) and above the ground. */
  sun: readonly [color: string, intensity: number, azimuth: number, elevation: number];
  /** Brightness into the colour curve. */
  exposure: number;
}
/** Clear days keep the reference's fog, which starts well beyond the fight radius (camera-rig.ts). */
const DAY_FOG = [FOG.near, FOG.far] as const;
export const LOOKS: Record<PlanetId, PlanetLook> = {
  // A warm late-morning sun against cool blue shade.
  home: { sky: ['#3f9cf2', '#bfe6ff'], fog: DAY_FOG, hemi: ['#d4e8ff', '#a8d86a', 1.18], sun: ['#fff0d8', 2.55, 54.5, 60.2], exposure: 1 },
  // Strawberry light: peach sun, raspberry bounce.
  candy: { sky: ['#ff6fb8', '#ffc2e6'], fog: DAY_FOG, hemi: ['#ffe2f2', '#ff7fc0', 1.1], sun: ['#fff0d4', 2.4, 38, 63], exposure: 1 },
  // A low winter sun from the left, long blue shadows.
  ice: { sky: ['#3d93ea', '#c4e6ff'], fog: DAY_FOG, hemi: ['#d6eaff', '#7fb0f0', 1.12], sun: ['#fff4e0', 2.5, -46, 50], exposure: 1 },
  // Ember glow from low in front, everything else in deep maroon shade.
  lava: { sky: ['#2a0f1c', '#b8452c'], fog: [34, 100], hemi: ['#ffb494', '#8a3038', 1.3], sun: ['#ffc284', 2.5, 26, 50], exposure: 1.08 },
  // A bright playroom lamp straight overhead.
  toy: { sky: ['#ff8fc6', '#ffe0ef'], fog: DAY_FOG, hemi: ['#ffeaf6', '#ffb4dc', 1.05], sun: ['#fff2d6', 2.3, 54.5, 66], exposure: .96 },
  // Golden shafts through green canopy.
  jungle: { sky: ['#2f9e62', '#b4e894'], fog: [36, 104], hemi: ['#dcffc8', '#2f8a3a', 1.25], sun: ['#fff2cc', 2.55, 68, 55], exposure: 1 },
  // High tropical noon over turquoise.
  ocean: { sky: ['#1f8ef0', '#a6e8ff'], fog: DAY_FOG, hemi: ['#c8f2ff', '#4fb0e6', 1.1], sun: ['#fff4c8', 2.5, 30, 68], exposure: .98 },
  // Thin bright air above the clouds: white stays white, shade goes sky blue, the sun comes low from the left.
  cloud: { sky: ['#3f8cf0', '#a4d2ff'], fog: DAY_FOG, hemi: ['#eef6ff', '#a4c4ff', 1.22], sun: ['#fff8ec', 2.5, -42, 52], exposure: 1 },
  // Moonlight: very dark blue, but every shape still reads.
  shadow: { sky: ['#03061a', '#101a52'], fog: [24, 78], hemi: ['#8494ff', '#2c2a78', 1.5], sun: ['#a8bcff', 1.9, -36, 62], exposure: 1.05 },
};

const SUN_DISTANCE = Math.hypot(...SUN_OFFSET);
/** Where the sun sits relative to the camera target, at the reference's distance so the shadow camera's depth range still fits. */
export function sunOffset(azimuth: number, elevation: number, out = new T.Vector3()) {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180, flat = Math.cos(e) * SUN_DISTANCE;
  return out.set(Math.sin(a) * flat, Math.sin(e) * SUN_DISTANCE, Math.cos(a) * flat);
}

/** The reference's flat rig for a planet, in the shape of a look (perfFlags.richLook off). */
function classicLook(planet: PlanetId, sky: string): PlanetLook {
  const l = PLANET_LIGHT[planet], bg = planet === 'home' ? '#aee4ff' : sky;
  return { sky: [bg, sky], fog: planet === 'shadow' ? [14, 55] : [FOG.near, FOG.far], hemi: [l.hemi[0], l.hemi[1], LIGHT.hemi], sun: [l.sun, planet === 'lava' ? LIGHT.lavaSun : LIGHT.sun, 54.46, 60.16], exposure: 1 };
}
/** The look a planet is drawn with; `classicSky` is the planet's reference sky colour, used when the rich look is off. Unknown ids fall back to home. */
export function planetLook(planet: string, classicSky = '#aee4ff'): PlanetLook {
  const id = (Object.hasOwn(LOOKS, planet) ? planet : 'home') as PlanetId;
  return perfFlags.richLook ? LOOKS[id] : classicLook(id, classicSky);
}

/** Sets a hemisphere light, a sun and (optionally) where the sun stands from a look. */
export function applyLook(look: PlanetLook, hemi: T.HemisphereLight | null | undefined, sun: T.DirectionalLight | null | undefined, offset?: T.Vector3) {
  if (hemi) { hemi.color.set(look.hemi[0]); hemi.groundColor.set(look.hemi[1]); hemi.intensity = look.hemi[2]; }
  if (sun) { sun.color.set(look.sun[0]); sun.intensity = look.sun[1]; }
  if (offset) { if (perfFlags.richLook) sunOffset(look.sun[2], look.sun[3], offset); else offset.set(...SUN_OFFSET); }
}

// ---- The colour curve.
/**
 * The curve, on linear colour: a little more contrast (darks deepen), more saturation, and a soft shoulder so a bright
 * surface in full sun rolls off towards white instead of clipping to a flat pastel. Mid colours pass nearly unchanged,
 * so a material's authored colour is what you see. The shoulder aims a little past white (`peak`), so white paint and
 * snow in sunlight still reach full white.
 */
export const GRADE = { contrast: [.9, .15], saturation: 1.1, shoulder: .8, peak: 1.08 } as const;
const LUMA = [.2126, .7152, .0722] as const;
/** The curve in JavaScript, exactly as the shader computes it (tests, and anything that must match the drawn colour). */
export function grade(rgb: readonly [number, number, number], exposure = 1): [number, number, number] {
  const [a, b] = GRADE.contrast, t = GRADE.shoulder, room = GRADE.peak - t, c = rgb.map(v => { const x = v * exposure; return x * (a + b * x); });
  const l = c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
  return c.map(v => { const x = Math.max(l + (v - l) * GRADE.saturation, 0), d = Math.max(x - t, 0); return Math.min(1, Math.min(x, t) + d * room / (room + d)); }) as [number, number, number];
}
const f = (n: number) => n.toFixed(4);
const GRADE_GLSL = `vec3 CustomToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color *= ${f(GRADE.contrast[0])} + ${f(GRADE.contrast[1])} * color;
	float l = dot( color, vec3( ${LUMA.map(f).join(', ')} ) );
	color = max( l + ( color - l ) * ${f(GRADE.saturation)}, 0.0 );
	vec3 d = max( color - ${f(GRADE.shoulder)}, 0.0 );
	return min( color, ${f(GRADE.shoulder)} ) + d * ${f(GRADE.peak - GRADE.shoulder)} / ( ${f(GRADE.peak - GRADE.shoulder)} + d );
}`;
const STOCK = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
/** Puts the curve into three's custom tone-mapping slot. Call before the first frame; safe to call again. */
export function installGrade() {
  const chunk = T.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes(STOCK)) T.ShaderChunk.tonemapping_pars_fragment = chunk.replace(STOCK, GRADE_GLSL);
}
/** Turns the curve on or off for a renderer (materials marked `toneMapped: false`, the UI's own renderers and render targets never take it). */
export function setGrade(renderer: T.WebGLRenderer, look: PlanetLook) {
  installGrade();
  renderer.toneMapping = perfFlags.richLook ? T.CustomToneMapping : T.NoToneMapping; renderer.toneMappingExposure = look.exposure;
}

// ---- Sky.
const skies = new Map<string, T.DataTexture>();
/** Mixes two '#rrggbb' colours channel by channel, as the screen shows them. */
export function mixHex(a: string, b: string, k: number): [number, number, number] {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k)) as [number, number, number];
}
/** How far up the screen (0 bottom, 1 top) the sky has turned from the horizon colour to the high colour. */
export const skyBlend = (v: number) => { const t = Math.max(0, Math.min(1, (v - .45) / .5)); return t * t * (3 - 2 * t); };
/**
 * A one-pixel-wide sky strip, horizon colour below and the deeper sky above; one per colour pair for the session.
 * The lower part is the plain horizon colour, which is also the fog colour, so far ground melts into it without a seam.
 */
export function skyTexture(top: string, horizon: string, rows = 64) {
  const key = top + horizon, known = skies.get(key); if (known) return known;
  const data = new Uint8Array(rows * 4);
  for (let y = 0; y < rows; y++) data.set([...mixHex(horizon, top, skyBlend(y / (rows - 1))), 255], y * 4);
  const texture = new T.DataTexture(data, 1, rows);
  texture.colorSpace = T.SRGBColorSpace; texture.magFilter = texture.minFilter = T.LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  texture.userData.sharedKit = true; skies.set(key, texture);
  return texture;
}

/** Half the width of the ground square (ground.ts draws tiles from -200 to 200). */
const GROUND_EDGE = 200;
/** Whether the view from a camera target can reach past the edge of the ground, i.e. whether any sky can be on screen. */
export const skyInView = (x: number, z: number, reach: number) => Math.max(Math.abs(x), Math.abs(z)) + reach > GROUND_EDGE;

// ---- The Night Planet.
/** How much of their own colour the Night Planet's small plants give off as light. */
export const NIGHT_GLOW = .6;
/**
 * A soft pool of pale light on the ground: one small additive disc (a centre, a middle ring and a dark rim, coloured per
 * vertex, so no texture), scaled to the radius the explorer can see. One draw, and only where it is dark.
 */
export function lightPool(color = '#9ab8ff', strength = .3, segments = 40) {
  const c = new T.Color(color).multiplyScalar(strength), position: number[] = [0, 0, 0], colors: number[] = [c.r, c.g, c.b], index: number[] = [];
  for (const [radius, k] of [[.5, .5], [1, 0]] as const) for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; position.push(Math.cos(a) * radius, 0, Math.sin(a) * radius); colors.push(c.r * k, c.g * k, c.b * k); }
  for (let i = 0; i < segments; i++) { const j = (i + 1) % segments, a = 1 + i, b = 1 + j, d = 1 + segments + i, e = 1 + segments + j; index.push(0, b, a, a, b, e, a, e, d); }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.setIndex(index);
  const material = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  geometry.userData.sharedKit = material.userData.sharedKit = true;
  const mesh = new T.Mesh(geometry, material); mesh.name = 'hero-light'; mesh.position.y = .05; mesh.renderOrder = 1; mesh.raycast = () => {};
  return mesh;
}

// ---- Contact shading.
/** Shade a kit model takes near the ground and on faces that look down: [red, green, blue] at full strength (a cool, not grey, dark). */
export const CONTACT = { tint: [.66, .68, .8], reach: 1.5, share: .42, under: .82, crown: .07 } as const;
/**
 * Soft shading baked into a model's vertex colours once, when its parts are merged: darker where it meets the ground,
 * a little darker on faces that look down (under roofs, caps and canopies) and a little lighter towards the top.
 * `y` is the height above the model's base, `height` the model's height, `ny` the normal's upward part.
 * Returns the factor for each channel.
 */
export function contactShade(y: number, height: number, ny: number, out: [number, number, number] = [1, 1, 1]) {
  const reach = Math.max(.12, Math.min(CONTACT.reach, height * CONTACT.share)), t = Math.max(0, Math.min(1, y / reach)), near = 1 - t * t * (3 - 2 * t);
  const under = ny < 0 ? 1 - (1 - CONTACT.under) * Math.min(1, -ny) : 1, crown = 1 + CONTACT.crown * (height > 0 ? Math.max(0, Math.min(1, y / height)) * 2 - 1 : 0);
  for (let i = 0; i < 3; i++) out[i] = (1 + (CONTACT.tint[i] - 1) * near) * under * crown;
  return out;
}
/** Applies contactShade to a merged geometry's colour attribute (model space, base at y = 0). */
export function shadeGeometry(geometry: T.BufferGeometry) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), color = geometry.getAttribute('color') as T.BufferAttribute | undefined;
  if (!position || !color) return geometry;
  let top = 0, base = Infinity; for (let i = 0; i < position.count; i++) { const y = position.getY(i); if (y > top) top = y; if (y < base) base = y; }
  base = Math.min(0, base); const k: [number, number, number] = [1, 1, 1], a = color.array as Float32Array;
  for (let i = 0; i < position.count; i++) {
    contactShade(position.getY(i) - base, top - base, normal ? normal.getY(i) : 0, k);
    a[i * 3] *= k[0]; a[i * 3 + 1] *= k[1]; a[i * 3 + 2] *= k[2];
  }
  color.needsUpdate = true;
  return geometry;
}
