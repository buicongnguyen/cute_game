import * as T from 'three';
import type { PlanetId } from './content.ts';

/**
 * The reference's look (RC-05): every model is a MeshToonMaterial on one 4-step ramp [110,185,235,255] with nearest
 * filtering, under a hemisphere light (1.5) and a sun (2.4; 2.0 on lava) in per-planet colours, with no tone mapping.
 * Toon lighting gives flat bands instead of the smooth PBR falloff, which is most of why the reference reads as
 * "2.5D". It is also cheaper per pixel than MeshStandardMaterial (no specular/BRDF terms).
 */
export const TOON_STEPS = [110, 185, 235, 255] as const;

function makeRamp() {
  const data = new Uint8Array(TOON_STEPS.length * 4);
  TOON_STEPS.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const texture = new T.DataTexture(data, TOON_STEPS.length, 1);
  texture.minFilter = texture.magFilter = T.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  texture.userData.sharedKit = true;
  return texture;
}
/** The one shared ramp texture. */
export const TOON_RAMP = makeRamp();

/** Hemisphere sky/ground and sun colours per planet, from the reference's planet table (bundle @655491…659918). */
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
