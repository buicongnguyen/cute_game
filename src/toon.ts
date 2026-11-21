import * as T from 'three';
import type { PlanetId } from './content.ts';
import { perfFlags } from './perf-flags.ts';

/**
 * The reference's look (RC-05): every model is a MeshToonMaterial on one stepped ramp with nearest filtering (the
 * reference's four grey steps [110,185,235,255]; the world now wears our own five colour steps, TOON_OWN), under a hemisphere light (1.5) and a sun (2.4; 2.0 on lava) in per-planet colours, with no tone mapping.
 * Toon lighting gives flat bands instead of the smooth PBR falloff, which is most of why the reference reads as
 * "2.5D". It is also cheaper per pixel than MeshStandardMaterial (no specular/BRDF terms).
 */
export const TOON_STEPS = [110, 185, 235, 255] as const;
/**
 * Our own ramp (AAA plan WP6): five colour steps from the face turned furthest from the sun to the face turned to it.
 * Shade is blue-violet, not grey, so a colour in shade keeps its saturation; the light is a warm cream. Each step
 * multiplies the sun's light per channel, like the grey steps did.
 */
export const TOON_OWN = [[100, 102, 180], [156, 156, 218], [216, 206, 226], [250, 240, 230], [255, 246, 232]] as const;
/** The colour a ramp gives for the cosine between a face and the sun, as the shader reads it (nearest step), 0-1. */
export function rampAt(steps: readonly (number | readonly number[])[], dotNL: number): number[] {
  const step = steps[Math.min(steps.length - 1, Math.max(0, Math.floor((dotNL * .5 + .5) * steps.length)))];
  return (typeof step === 'number' ? [step, step, step] : [...step]).map(v => v / 255);
}

const GREY_LOOKUP = 'vec3( texture2D( gradientMap, coord ).r )';
/**
 * three reads only the red channel of a toon ramp. This makes it read the colour, once, as this module loads (before
 * any renderer compiles a shader), so no shader program is added; with a grey ramp the result is the same as before.
 */
export function installRampColour() {
  const chunk = T.ShaderChunk.gradientmap_pars_fragment;
  if (chunk.includes(GREY_LOOKUP)) T.ShaderChunk.gradientmap_pars_fragment = chunk.replace(GREY_LOOKUP, 'texture2D( gradientMap, coord ).rgb');
}
installRampColour();

function makeRamp(steps: readonly (number | readonly number[])[]) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set(typeof v === 'number' ? [v, v, v, 255] : [...v, 255], i * 4));
  const texture = new T.DataTexture(data, steps.length, 1);
  texture.minFilter = texture.magFilter = T.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  texture.userData.sharedKit = true;
  return texture;
}
/** The reference's grey ramp: item icons and the mirror still draw with it (icons.ts, mirror-preview.ts), and so does the world with perfFlags.ownRamp off. */
export const TOON_RAMP_CLASSIC = makeRamp(TOON_STEPS);
/** The one ramp texture every toon material in the world shares. */
export const TOON_RAMP = perfFlags.ownRamp ? makeRamp(TOON_OWN) : TOON_RAMP_CLASSIC;
/**
 * Runs `draw` with every material under `root` on the grey ramp, then puts our ramp back. A swap by reference: no
 * texture data changes and nothing is uploaded again, and each small renderer keeps its own copy of the grey ramp.
 */
export function withClassicRamp<R>(root: T.Object3D, draw: () => R): R {
  const swapped: T.MeshToonMaterial[] = [];
  if (TOON_RAMP !== TOON_RAMP_CLASSIC) root.traverse(o => {
    for (const m of [(o as T.Mesh).material].flat()) if (m && (m as T.MeshToonMaterial).gradientMap === TOON_RAMP) { (m as T.MeshToonMaterial).gradientMap = TOON_RAMP_CLASSIC; swapped.push(m as T.MeshToonMaterial); }
  });
  try { return draw(); } finally { for (const m of swapped) m.gradientMap = TOON_RAMP; }
}

/** Hemisphere sky/ground and sun colours per planet, from the reference's planet table (bundle @655491…659918).
 *  The world now wears our own rig per planet (look.ts); these still light the UI's own small renderers (item icons, the
 *  mirror), which must not change colour, and the world when perfFlags.richLook is off. */
export const PLANET_LIGHT: Record<PlanetId, { hemi: [string, string]; sun: string }> = {
  home: { hemi: ['#e8f6ff', '#9ccf7a'], sun: '#fff4dd' },
  candy: { hemi: ['#fff0fa', '#ff9fd0'], sun: '#fff0f6' },
  ice: { hemi: ['#f4fbff', '#b8d8f0'], sun: '#f4fbff' },
  lava: { hemi: ['#ffd2b8', '#6a3a3a'], sun: '#ffc9a0' },
  toy: { hemi: ['#fff6fb', '#ffc4e4'], sun: '#fff8f0' },
  jungle: { hemi: ['#e8ffe0', '#3f7a3a'], sun: '#fff4c0' },
  ocean: { hemi: ['#e8fbff', '#6fb0d8'], sun: '#fffbe8' },
  cloud: { hemi: ['#ffffff', '#8fb8e8'], sun: '#ffffff' },
  shadow: { hemi: ['#6a6aa8', '#1a1430'], sun: '#8a8ad8' },
};
export const LIGHT = { hemi: 1.5, sun: 2.4, lavaSun: 2 } as const;
/** Where the sun sits relative to the camera target: the reference's direction (14,30,10) (bundle @1042395), kept at the
 *  clone's old distance (42 m) so the shadow camera's near/far still fit. It lights the right-hand faces, as there. */
export const SUN_OFFSET: readonly [number, number, number] = [17.05, 36.53, 12.18];
/** Light colours and intensities for a planet; unknown ids fall back to home. */
export function planetLight(planet: string) {
  const look = PLANET_LIGHT[planet as PlanetId] ?? PLANET_LIGHT.home;
  return { sky: look.hemi[0], ground: look.hemi[1], hemi: LIGHT.hemi, sun: look.sun, sunIntensity: planet === 'lava' ? LIGHT.lavaSun : LIGHT.sun };
}
/** Points a hemisphere light and sun at a planet's look. */
export function applyPlanetLight(planet: string, hemi: T.HemisphereLight | null | undefined, sun: T.DirectionalLight | null | undefined) {
  const l = planetLight(planet);
  if (hemi) { hemi.color.set(l.sky); hemi.groundColor.set(l.ground); hemi.intensity = l.hemi; }
  if (sun) { sun.color.set(l.sun); sun.intensity = l.sunIntensity; }
}

/** Materials that take the hit flash and hurt tint (both have an emissive colour). */
export type LitMaterial = T.MeshToonMaterial | T.MeshStandardMaterial | T.MeshLambertMaterial | T.MeshPhongMaterial;
export const isLit = (m: unknown): m is LitMaterial => m instanceof T.MeshToonMaterial || m instanceof T.MeshStandardMaterial || m instanceof T.MeshLambertMaterial || m instanceof T.MeshPhongMaterial;

type ToonParameters = T.MeshStandardMaterialParameters & { flatShading?: boolean };
/** A toon material from MeshStandardMaterial-style parameters; roughness, metalness and env maps have no meaning here. */
export function toonMaterial(parameters: ToonParameters = {}) {
  const { roughness, metalness, roughnessMap, metalnessMap, envMap, envMapIntensity, envMapRotation, flatShading, ...rest } = parameters;
  const material = new T.MeshToonMaterial({ ...(rest as T.MeshToonMaterialParameters), gradientMap: TOON_RAMP });
  if (flatShading) (material as unknown as { flatShading: boolean }).flatShading = true;
  return material;
}

const converted = new WeakMap<T.Material, T.Material>();
/**
 * The toon twin of a lit material (one twin per source, so shared materials stay shared and batches stay batched).
 * Colour, map, vertex colours, emissive (glow stays glow), transparency, side, alpha test, user data and any shader
 * patch (onBeforeCompile + cache key) carry over. Unlit and already-toon materials are returned unchanged.
 */
export function toToon<M extends T.Material>(source: M): M | T.MeshToonMaterial {
  if (!(source instanceof T.MeshStandardMaterial || source instanceof T.MeshLambertMaterial || source instanceof T.MeshPhongMaterial)) return source;
  let toon = converted.get(source) as T.MeshToonMaterial | undefined;
  if (!toon) {
    // MeshToonMaterial.copy reads only fields every lit material has (colour, maps, emissive, fog, wireframe...).
    toon = new T.MeshToonMaterial().copy(source as unknown as T.MeshToonMaterial);
    toon.gradientMap = TOON_RAMP;
    if ((source as { flatShading?: boolean }).flatShading) (toon as unknown as { flatShading: boolean }).flatShading = true;
    if (Object.prototype.hasOwnProperty.call(source, 'onBeforeCompile')) toon.onBeforeCompile = source.onBeforeCompile;
    if (Object.prototype.hasOwnProperty.call(source, 'customProgramCacheKey')) toon.customProgramCacheKey = source.customProgramCacheKey;
    converted.set(source, toon); converted.set(toon, toon);
  }
  return toon;
}

/** Swaps every lit material under `root` for its toon twin. */
export function toonify<O extends T.Object3D>(root: O): O {
  root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => toToon(m)) : toToon(o.material);
  });
  return root;
}
