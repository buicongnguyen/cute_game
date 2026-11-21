import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { TOON_RAMP, TOON_RAMP_CLASSIC, TOON_OWN, TOON_STEPS, PLANET_LIGHT, planetLight, applyPlanetLight, toToon, toonify, toonMaterial, isLit, rampAt, installRampColour, withClassicRamp } from '../src/toon.ts';
import { INK, INK_CLASSIC } from '../src/outline.ts';
import { PLANETS, type PlanetId } from '../src/model.ts';
import { bakeModel } from '../src/assets.ts';
import { buildGround } from '../src/ground.ts';
import { createEnvironmentLayout } from '../src/environments.ts';

test('the classic ramp is kept: the reference 4-step [110,185,235,255] with nearest filtering', () => {
  assert.deepEqual([...TOON_STEPS], [110, 185, 235, 255]);
  const data = TOON_RAMP_CLASSIC.image.data as Uint8Array;
  assert.equal(TOON_RAMP_CLASSIC.image.width, 4);
  assert.deepEqual([0, 1, 2, 3].map(i => data[i * 4]), [110, 185, 235, 255]);
  assert.equal(TOON_RAMP_CLASSIC.magFilter, T.NearestFilter); assert.equal(TOON_RAMP_CLASSIC.minFilter, T.NearestFilter);
});

test('our own ramp has 5 colour steps: the shade is blue-violet, the light a warm cream, and it gets lighter step by step', () => {
  assert.equal(TOON_OWN.length, 5); assert.notEqual(TOON_RAMP, TOON_RAMP_CLASSIC);
  const data = TOON_RAMP.image.data as Uint8Array; assert.equal(TOON_RAMP.image.width, 5); assert.equal(data.length, 20);
  TOON_OWN.forEach((step, i) => assert.deepEqual([...data.slice(i * 4, i * 4 + 4)], [...step, 255]));
  assert.equal(TOON_RAMP.magFilter, T.NearestFilter); assert.equal(TOON_RAMP.minFilter, T.NearestFilter); assert.equal(TOON_RAMP.generateMipmaps, false);
  const [r0, g0, b0] = TOON_OWN[0], [r4, g4, b4] = TOON_OWN[4];
  assert.ok(b0 > r0 + 40 && b0 > g0 + 40, 'the shade is bluer than it is red or green');
  assert.ok(r0 <= TOON_STEPS[0], 'and no redder than the grey shade it replaces, so warm paint does not turn muddy');
  assert.ok(r4 === 255 && r4 > g4 && g4 > b4, 'the light is warm');
  const luma = (c: readonly number[]) => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  for (let i = 1; i < 5; i++) assert.ok(luma(TOON_OWN[i]) > luma(TOON_OWN[i - 1]), 'step ' + i);
  assert.ok(Math.abs(luma(TOON_OWN[0]) - TOON_STEPS[0]) < 12, 'the darkest step is about as dark as the grey one: no lighter, washed-out shade');
  // Blue minus red falls from shade to light: cool shade, warm light.
  for (let i = 1; i < 5; i++) assert.ok(TOON_OWN[i][2] - TOON_OWN[i][0] < TOON_OWN[i - 1][2] - TOON_OWN[i - 1][0]);
});

test('the shader reads the colour of the ramp: patched once, and a grey ramp gives what it gave before', () => {
  const chunk = T.ShaderChunk.gradientmap_pars_fragment;
  assert.ok(chunk.includes('texture2D( gradientMap, coord ).rgb')); assert.ok(!chunk.includes('texture2D( gradientMap, coord ).r )'));
  installRampColour(); installRampColour();
  assert.equal(T.ShaderChunk.gradientmap_pars_fragment, chunk, 'installing again changes nothing');
  assert.equal(chunk.split('texture2D( gradientMap, coord )').length, 2, 'one lookup, as before');
  // The lookup on the CPU: with the grey ramp the three channels are the red channel three's own shader used.
  for (let k = -100; k <= 100; k++) {
    const d = k / 100, want = TOON_STEPS[Math.min(3, Math.floor((d * .5 + .5) * 4))] / 255;
    assert.deepEqual(rampAt(TOON_STEPS, d), [want, want, want], 'dotNL ' + d);
  }
  assert.deepEqual(rampAt(TOON_STEPS, -1), [110 / 255, 110 / 255, 110 / 255]); assert.deepEqual(rampAt(TOON_STEPS, 1), [1, 1, 1]);
  assert.deepEqual(rampAt(TOON_OWN, -1), TOON_OWN[0].map(v => v / 255)); assert.deepEqual(rampAt(TOON_OWN, 0), TOON_OWN[2].map(v => v / 255)); assert.deepEqual(rampAt(TOON_OWN, 1), TOON_OWN[4].map(v => v / 255));
});

test('icons and the mirror draw on the grey ramp by reference and hand our ramp back, even when the draw throws', () => {
  const own = toonMaterial({ color: '#ff8800' }), other = new T.MeshToonMaterial({ gradientMap: TOON_RAMP_CLASSIC }), basic = new T.MeshBasicMaterial();
  const root = new T.Group().add(new T.Mesh(new T.BoxGeometry(), own), new T.Mesh(new T.BoxGeometry(), [own, other, basic]));
  const before = (TOON_RAMP.image.data as Uint8Array).slice(), version = TOON_RAMP.version;
  const seen = withClassicRamp(root, () => [own.gradientMap, other.gradientMap]);
  assert.deepEqual(seen, [TOON_RAMP_CLASSIC, TOON_RAMP_CLASSIC]);
  assert.equal(own.gradientMap, TOON_RAMP); assert.equal(other.gradientMap, TOON_RAMP_CLASSIC);
  assert.throws(() => withClassicRamp(root, () => { throw new Error('lost context'); })); assert.equal(own.gradientMap, TOON_RAMP);
  assert.deepEqual(TOON_RAMP.image.data, before, 'no data changes'); assert.equal(TOON_RAMP.version, version, 'and nothing is uploaded again');
});

test('the ink is our own warm plum-brown, not the reference colour', () => {
  assert.equal(INK_CLASSIC, '#3a2433'); assert.notEqual(INK, '#3a2433'); assert.match(INK, /^#[0-9a-f]{6}$/);
  const c = new T.Color(INK), hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  assert.ok(c.r > c.g && c.r > c.b && c.g >= c.b, 'warm: red over green over blue'); assert.ok(hsl.l < .3, 'still dark enough to read as ink');
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
