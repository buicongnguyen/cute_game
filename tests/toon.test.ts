import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { TOON_RAMP, TOON_STEPS, PLANET_LIGHT, planetLight, applyPlanetLight, toToon, toonify, toonMaterial, isLit } from '../src/toon.ts';
import { PLANETS, type PlanetId } from '../src/model.ts';
import { bakeModel } from '../src/assets.ts';
import { buildGround } from '../src/ground.ts';
import { createEnvironmentLayout } from '../src/environments.ts';

test('the toon ramp is the reference 4-step [110,185,235,255] with nearest filtering', () => {
  assert.deepEqual([...TOON_STEPS], [110, 185, 235, 255]);
  const data = TOON_RAMP.image.data as Uint8Array;
  assert.deepEqual([0, 1, 2, 3].map(i => data[i * 4]), [110, 185, 235, 255]);
  assert.equal(TOON_RAMP.magFilter, T.NearestFilter); assert.equal(TOON_RAMP.minFilter, T.NearestFilter);
});

test('every planet has reference hemisphere and sun colours; lava sun is 2.0, others 2.4, hemisphere 1.5', () => {
  for (const id of Object.keys(PLANETS) as PlanetId[]) assert.ok(PLANET_LIGHT[id], id);
  assert.deepEqual(planetLight('home'), { sky: '#e8f6ff', ground: '#9ccf7a', hemi: 1.5, sun: '#fff4dd', sunIntensity: 2.4 });
  assert.equal(planetLight('lava').sunIntensity, 2);
  assert.equal(planetLight('nowhere').sky, '#e8f6ff', 'unknown planets fall back to home');
  const hemi = new T.HemisphereLight(), sun = new T.DirectionalLight();
  applyPlanetLight('shadow', hemi, sun);
  assert.equal('#' + hemi.color.getHexString(), '#6a6aa8'); assert.equal('#' + hemi.groundColor.getHexString(), '#1a1430');
  assert.equal('#' + sun.color.getHexString(), '#8a8ad8'); assert.equal(sun.intensity, 2.4); assert.equal(hemi.intensity, 1.5);
  applyPlanetLight('home', undefined, undefined); // world tests build World without lights
});

test('toToon keeps colour, vertex colours, glow, transparency, side and shader patches, once per source', () => {
  const patch = () => {}, key = () => 'patched';
  const source = new T.MeshStandardMaterial({ color: '#ff8800', emissive: '#331100', emissiveIntensity: .6, transparent: true, opacity: .5, side: T.DoubleSide, vertexColors: true, flatShading: true, alphaTest: .3 });
  source.name = 'glow-thing'; source.userData.sharedKit = true; source.onBeforeCompile = patch; source.customProgramCacheKey = key;
  const toon = toToon(source) as T.MeshToonMaterial;
  assert.ok(toon instanceof T.MeshToonMaterial); assert.equal(toon.gradientMap, TOON_RAMP);
  assert.equal(toon.color.getHex(), source.color.getHex()); assert.equal(toon.emissive.getHex(), source.emissive.getHex()); assert.equal(toon.emissiveIntensity, .6);
  assert.equal(toon.transparent, true); assert.equal(toon.opacity, .5); assert.equal(toon.side, T.DoubleSide); assert.equal(toon.vertexColors, true); assert.equal(toon.alphaTest, .3);
  assert.equal((toon as unknown as { flatShading: boolean }).flatShading, true);
  assert.equal(toon.name, 'glow-thing'); assert.equal(toon.userData.sharedKit, true);
  assert.equal(toon.onBeforeCompile, patch); assert.equal(toon.customProgramCacheKey, key);
  assert.equal(toToon(source), toon, 'one twin per source keeps batches shared'); assert.equal(toToon(toon), toon);
  const basic = new T.MeshBasicMaterial(); assert.equal(toToon(basic), basic, 'unlit materials (outlines, cards) stay as they are');
  assert.ok(isLit(toon) && !isLit(basic));
  const made = toonMaterial({ color: '#00ff00', roughness: .4, metalness: .2, flatShading: true });
  assert.ok(made instanceof T.MeshToonMaterial); assert.equal(made.gradientMap, TOON_RAMP); assert.ok(!('roughness' in made));
});

test('prepared models and the ground draw with toon materials', () => {
  const root = new T.Group();
  for (const color of ['#aa0000', '#00aa00']) root.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color })));
  root.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffcc00', emissiveIntensity: 1 })));
  bakeModel(root);
  const materials: T.Material[] = []; root.traverse(o => { if (o instanceof T.Mesh && o.layers.mask) materials.push(o.material as T.Material); });
  assert.ok(materials.length >= 2 && materials.every(m => m instanceof T.MeshToonMaterial));
  assert.ok(materials.some(m => (m as T.MeshToonMaterial).emissive.getHex() === 0xffcc00), 'the glowing part keeps its glow');
  const ground = buildGround({ planet: 'home', layout: createEnvironmentLayout('home'), ponds: [], base: 0, segments: 2 });
  const tile = ground.children[0] as T.Mesh;
  assert.ok(tile.material instanceof T.MeshToonMaterial); assert.equal((tile.material as T.MeshToonMaterial).vertexColors, true);
  const nested = toonify(new T.Group().add(new T.Mesh(new T.BoxGeometry(), [new T.MeshLambertMaterial(), new T.MeshBasicMaterial()])));
  const pair = (nested.children[0] as T.Mesh).material as T.Material[];
  assert.ok(pair[0] instanceof T.MeshToonMaterial && pair[1] instanceof T.MeshBasicMaterial);
});
