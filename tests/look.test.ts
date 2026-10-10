import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { LOOKS, GRADE, CONTACT, NIGHT_GLOW, planetLook, applyLook, sunOffset, grade, installGrade, skyTexture, skyBlend, skyInView, mixHex, contactShade, shadeGeometry, lightPool } from '../src/look.ts';
import { PLANET_LIGHT, SUN_OFFSET, LIGHT } from '../src/toon.ts';
import { perfFlags } from '../src/perf-flags.ts';
import { PLANETS, newGame, type PlanetId } from '../src/model.ts';
import { groundColor, enrichGround, shadeField, buildGround, type GroundDetail } from '../src/ground.ts';
import { createEnvironmentLayout } from '../src/environments.ts';
import { KitLibrary } from '../src/assets.ts';
import { World } from '../src/world.ts';

const luma = (c: readonly number[]) => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
const chroma = (c: readonly number[]) => Math.max(...c) - Math.min(...c);
const hex = (c: T.Color) => '#' + c.getHexString();

test('every planet has its own look: sky, fog, light colours, a sun in front of the camera, sane brightness', () => {
  const seen = new Set<string>();
  for (const id of Object.keys(PLANETS) as PlanetId[]) {
    const l = LOOKS[id]; assert.ok(l, id);
    seen.add(JSON.stringify([l.sky, l.hemi, l.sun]));
    assert.ok(l.fog[0] < l.fog[1] && l.fog[0] >= 20, `${id} fog starts beyond the fight radius`);
    // The sun lights the faces the camera sees (never from behind the scene) and stands high enough for short shadows.
    assert.ok(Math.abs(l.sun[2]) <= 75, `${id} sun azimuth`); assert.ok(l.sun[3] >= 45 && l.sun[3] <= 75, `${id} sun elevation`);
    assert.ok(l.hemi[2] >= .9 && l.hemi[2] <= 1.6 && l.sun[1] >= 1.5 && l.sun[1] <= 2.8 && l.exposure >= .9 && l.exposure <= 1.15, `${id} light levels`);
  }
  assert.equal(seen.size, Object.keys(PLANETS).length, 'no two planets share a rig');
  assert.equal(planetLook('nowhere'), LOOKS.home, 'unknown planets fall back to home');
});

test('the Night Planet is very dark blue but lit enough to read', () => {
  const sky = new T.Color(LOOKS.shadow.sky[1]), top = new T.Color(LOOKS.shadow.sky[0]);
  assert.ok(sky.b > sky.r * 2 && sky.b > sky.g * 1.5, 'the horizon is blue'); assert.ok(luma([top.r, top.g, top.b]) < .01, 'the sky above is nearly black');
  // More light reaches a surface than under the reference's rig.
  const amount = (hemi: string, k: number, sun: string, s: number) => luma(new T.Color(hemi).multiplyScalar(k).add(new T.Color(sun).multiplyScalar(s)).toArray());
  assert.ok(amount(LOOKS.shadow.hemi[0], LOOKS.shadow.hemi[2], LOOKS.shadow.sun[0], LOOKS.shadow.sun[1]) > amount(PLANET_LIGHT.shadow.hemi[0], LIGHT.hemi, PLANET_LIGHT.shadow.sun, LIGHT.sun) * .95);
  assert.ok(NIGHT_GLOW > 0 && NIGHT_GLOW <= 1);
});

test('the sun keeps the reference distance, and the home sun the reference direction', () => {
  const distance = Math.hypot(...SUN_OFFSET);
  for (const l of Object.values(LOOKS)) assert.ok(Math.abs(sunOffset(l.sun[2], l.sun[3]).length() - distance) < 1e-6);
  const home = sunOffset(LOOKS.home.sun[2], LOOKS.home.sun[3]);
  assert.ok(home.distanceTo(new T.Vector3(...SUN_OFFSET)) < .2, 'home shadows fall where they always did');
  assert.ok(sunOffset(-46, 50).x < 0, 'a negative azimuth puts the sun on the left');
});

test('applyLook sets the lights and the sun position; with the look off the reference rig comes back', () => {
  const hemi = new T.HemisphereLight(), sun = new T.DirectionalLight(), at = new T.Vector3();
  applyLook(planetLook('ice'), hemi, sun, at);
  assert.equal(hex(hemi.color), LOOKS.ice.hemi[0]); assert.equal(hex(hemi.groundColor), LOOKS.ice.hemi[1]); assert.equal(hemi.intensity, LOOKS.ice.hemi[2]);
  assert.equal(hex(sun.color), LOOKS.ice.sun[0]); assert.equal(sun.intensity, LOOKS.ice.sun[1]); assert.ok(at.x < 0);
  applyLook(planetLook('home'), undefined, undefined); // worlds built in tests may have no lights
  perfFlags.richLook = false;
  try {
    const classic = planetLook('lava', PLANETS.lava.sky);
    assert.deepEqual([classic.hemi, classic.sun.slice(0, 2), classic.sky, classic.fog, classic.exposure], [[...PLANET_LIGHT.lava.hemi, 1.5], [PLANET_LIGHT.lava.sun, 2], [PLANETS.lava.sky, PLANETS.lava.sky], [45, 110], 1]);
    assert.deepEqual(planetLook('home').sky, ['#aee4ff', '#aee4ff']); assert.deepEqual(planetLook('shadow', PLANETS.shadow.sky).fog, [14, 55]);
    applyLook(classic, hemi, sun, at); assert.deepEqual(at.toArray(), [...SUN_OFFSET]);
  } finally { perfFlags.richLook = true; }
});

test('the colour curve: black stays black, greys stay grey, order is kept, colours gain saturation, nothing clips early', () => {
  assert.deepEqual(grade([0, 0, 0]), [0, 0, 0]);
  for (const v of [.05, .2, .5, .8, 1, 1.3]) { const g = grade([v, v, v]); assert.ok(Math.abs(g[0] - g[1]) < 1e-12 && Math.abs(g[1] - g[2]) < 1e-12, `grey ${v}`); }
  let last = -1; for (let v = 0; v <= 3; v += .01) { const g = grade([v, v, v])[0]; assert.ok(g >= last && g <= 1, `monotonic at ${v}`); last = g; }
  // Mid tones barely move, so authored colours are what you see.
  assert.ok(Math.abs(grade([.5, .5, .5])[0] - .5) < .03);
  // White paint in full sun (about 1.15x) still reaches near-white instead of a dull grey; brighter values roll off, not clip.
  assert.ok(grade([1.15, 1.15, 1.15])[0] > .94); assert.ok(grade([.9, .9, .9])[0] < grade([1.2, 1.2, 1.2])[0]);
  const grass: [number, number, number] = [.25, .55, .12], g = grade(grass);
  assert.ok(chroma(g) / luma(g) > chroma(grass) / luma(grass), 'more saturated'); assert.ok(g.every(v => v >= 0));
  assert.ok(luma(grade([.1, .1, .1])) < .1, 'darks deepen');
  assert.ok(grade([.4, .4, .4], 1.1)[0] > grade([.4, .4, .4])[0], 'exposure brightens');
  assert.ok(GRADE.saturation > 1 && GRADE.saturation <= 1.2, 'vivid, not garish');
});

test('the curve is installed in three\'s custom tone-mapping slot, once', () => {
  installGrade(); const chunk = T.ShaderChunk.tonemapping_pars_fragment; installGrade();
  assert.equal(T.ShaderChunk.tonemapping_pars_fragment, chunk);
  assert.equal(chunk.split('vec3 CustomToneMapping').length, 2, 'one definition');
  assert.ok(chunk.includes('toneMappingExposure') && chunk.includes(GRADE.saturation.toFixed(4)) && chunk.includes(GRADE.shoulder.toFixed(4)));
  assert.ok(!chunk.includes('CustomToneMapping( vec3 color ) { return color; }'));
});

test('the sky strip runs from the horizon colour at the bottom to the deep sky at the top, and is shared', () => {
  const sky = skyTexture('#102030', '#c0e0ff'), data = sky.image.data as Uint8Array, rows = sky.image.height;
  assert.deepEqual([...data.slice(0, 4)], [0xc0, 0xe0, 0xff, 255]); assert.deepEqual([...data.slice((rows - 1) * 4, rows * 4)], [0x10, 0x20, 0x30, 255]);
  // The lower part is plain horizon colour (the fog colour), so far ground meets it without a seam.
  assert.equal(skyBlend(.3), 0); assert.equal(skyBlend(1), 1); assert.deepEqual([...data.slice(Math.floor(rows * .4) * 4, Math.floor(rows * .4) * 4 + 3)], [0xc0, 0xe0, 0xff]);
  assert.equal(skyTexture('#102030', '#c0e0ff'), sky); assert.equal(sky.colorSpace, T.SRGBColorSpace); assert.equal(sky.userData.sharedKit, true);
  assert.deepEqual(mixHex('#000000', '#ff8040', .5), [128, 64, 32]);
});

test('the sky gradient is asked for only where the view can pass the edge of the ground', () => {
  assert.equal(skyInView(0, 3.6, 31), false, 'village'); assert.equal(skyInView(105, -40, 31), false, 'canyon'); assert.equal(skyInView(-13, -57, 60), false, 'wilds, zoomed out');
  assert.equal(skyInView(150, 0, 60), true); assert.equal(skyInView(0, -150, 60), true);
});

test('contact shading: darker and cooler at the base, darker under overhangs, lighter at the crown', () => {
  const base = contactShade(0, 4, 1, [1, 1, 1]).slice(), mid = contactShade(2, 4, 1, [1, 1, 1]).slice(), top = contactShade(4, 4, 1, [1, 1, 1]).slice(), under = contactShade(2, 4, -1, [1, 1, 1]).slice();
  assert.ok(base[0] < mid[0] && mid[0] < top[0]); assert.ok(base[2] > base[0], 'the shade is cool, not grey');
  assert.ok(Math.abs(mid[0] - 1) < 1e-9, 'the middle keeps the authored colour'); assert.ok(Math.abs(under[0] - CONTACT.under) < 1e-9);
  assert.ok(top[0] <= 1 + CONTACT.crown + 1e-9 && base[0] > .55, 'gentle');
  // A low piece (a pebble, a tuft) is shaded over its own small height, not flattened to dark.
  assert.ok(contactShade(.2, .25, 1)[0] > .9);
});

test('shadeGeometry bakes the shading into existing vertex colours and keeps the triangles', () => {
  const g = new T.CylinderGeometry(.5, .5, 4, 8).translate(0, 2, 0), n = g.getAttribute('position').count;
  assert.equal(shadeGeometry(g.clone()).getAttribute('color'), undefined, 'no colours, no change');
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(.5), 3));
  const triangles = g.index!.count; shadeGeometry(g);
  const p = g.getAttribute('position'), c = g.getAttribute('color'); let low = 0, high = 0, lows = 0, highs = 0;
  for (let i = 0; i < n; i++) { if (g.getAttribute('normal').getY(i) !== 0) continue; if (p.getY(i) < .1) { low += c.getX(i); lows++; } else if (p.getY(i) > 3.9) { high += c.getX(i); highs++; } }
  assert.ok(lows > 0 && highs > 0 && low / lows < .5 * .75 && high / highs > .5, `sides: base ${low / lows}, top ${high / highs}`);
  assert.equal(g.index!.count, triangles); assert.equal(g.getAttribute('position').count, n);
});

test('kit scenery is shaded once when its parts are merged; with the look off parts merge as before', () => {
  const kit = new KitLibrary([]) as any, mat = (c: string) => new T.MeshToonMaterial({ color: c });
  const trunk = { geometry: new T.CylinderGeometry(.2, .3, 2, 6).translate(0, 1, 0), material: mat('#8a5a3b'), matrix: new T.Matrix4(), name: 'tree' };
  const crown = { geometry: new T.IcosahedronGeometry(1, 0), material: mat('#6fbf5a'), matrix: new T.Matrix4().makeTranslation(0, 2.6, 0), name: 'tree' };
  const rock = { geometry: new T.DodecahedronGeometry(.9, 0).translate(0, .6, 0), material: mat('#9a9aa8'), matrix: new T.Matrix4(), name: 'rock' };
  kit.parts = (name: string) => name === 'tree' ? [trunk, crown] : [rock];
  const tree = kit.mergedParts('tree'); assert.equal(tree.length, 1, 'still one draw per batch');
  const colors = tree[0].geometry.getAttribute('color'), position = tree[0].geometry.getAttribute('position'); let foot = 1, head = 0;
  for (let i = 0; i < position.count; i++) { if (position.getY(i) < .01) foot = Math.min(foot, colors.getX(i)); if (position.getY(i) > 3.4) head = Math.max(head, colors.getY(i)); }
  assert.ok(foot < new T.Color('#8a5a3b').r * .75, 'the trunk darkens at the ground'); assert.ok(head > new T.Color('#6fbf5a').g, 'the crown catches light');
  assert.equal(kit.mergedParts('tree'), tree, 'cached');
  const shaded = kit.mergedParts('rock'); assert.equal(shaded.length, 1); assert.ok(shaded[0].geometry.getAttribute('color'), 'a lone plain part is shaded too');
  assert.equal(shaded[0].geometry.getAttribute('position').count, rock.geometry.getAttribute('position').count, 'same vertices');
  perfFlags.richLook = false;
  try { assert.equal(kit.mergedParts('rock')[0], rock, 'the reference path hands the part back untouched'); assert.notEqual(kit.mergedParts('tree'), tree); }
  finally { perfFlags.richLook = true; }
});

test('the shade field is dark under trees, joins up across a grove and is clear in the open', () => {
  const grove = [0, 1, 2, 3, 4, 5].map(i => ({ x: 40 + (i % 3) * 3, z: 40 + Math.floor(i / 3) * 3, r: 2.8, weight: 1.15 })), shade = shadeField([...grove, { x: -60, z: 10, r: 2.8, weight: 1.15 }]);
  assert.equal(shade(0, 0), 0); assert.equal(shade(190, -190), 0); assert.equal(shade(500, 500), 0, 'outside the map');
  const lone = shade(-60, 10), deep = shade(43, 41.5);
  assert.ok(lone > .5 && lone <= 1 && deep > .8 && deep <= 1, `lone ${lone}, grove ${deep}`);
  assert.ok(shade(-60, 15) < lone * .5 && shade(-60, 20) === 0, 'it fades out past the crown');
  assert.ok(shade(41.5, 41.5) > .8 && shade(44.5, 41.5) > .8, 'between the trunks of a grove the floor stays dark');
});

test('the richer ground: same triangles, shade under trees, lush banks, glow, wear, and the plain ground unchanged', () => {
  const none: GroundDetail = { shade: () => 0, water: [], glow: [], worn: [] }, c = new T.Color(), d = new T.Color();
  // Without detail the colour is the reference blend, as before.
  groundColor('home', 40, 60, [], c); groundColor('home', 40, 60, [], d); assert.deepEqual(c.toArray(), d.toArray());
  groundColor('home', 40, 60, [], d, none); assert.notDeepEqual(c.toArray(), d.toArray());
  const lum = (planet: PlanetId, x: number, z: number, detail: GroundDetail) => luma(groundColor(planet, x, z, [], new T.Color(), detail).toArray());
  assert.ok(lum('home', 40, 60, { ...none, shade: () => 1 }) < lum('home', 40, 60, none) * .8, 'darker under trees');
  assert.ok(lum('home', 40, 60, { ...none, water: [{ x: 40, z: 68, r: 6 }] }) < lum('home', 40, 60, none), 'deeper green by the water');
  const ember = groundColor('lava', 60, 60, [], new T.Color(), { ...none, glow: [{ x: 60, z: 66, r: 5, color: '#d8502a', strength: .6 }] }), rock = groundColor('lava', 60, 60, [], new T.Color(), none);
  assert.ok(ember.r > rock.r * 1.3, 'lava lights the rock beside it');
  const worn = groundColor('home', 0, -3.5, [], new T.Color(), { ...none, worn: [{ x: 0, z: -3.5, r: 6.5 }] }), grass = groundColor('home', 0, -3.5, [], new T.Color(), none);
  assert.ok(worn.r > grass.r && worn.r / worn.g > grass.r / grass.g, 'trodden ground is warmer');
  // Broad drifts: the ground is not one flat colour over a region.
  const samples = [0, 1, 2, 3, 4, 5, 6, 7].map(i => lum('home', -70 - i * 9, 5 + i * 7, none)); assert.ok(Math.max(...samples) - Math.min(...samples) > .03);
  // Colours stay in range on every planet.
  for (const id of Object.keys(PLANETS) as PlanetId[]) for (const [x, z] of [[0, 0], [30, 40], [-90, 20], [120, -110]]) { const v = groundColor(id, x, z, [], new T.Color(), { ...none, shade: () => .7 }).toArray(); assert.ok(v.every(k => k >= 0 && k <= 1.2 && Number.isFinite(k)), `${id} ${x},${z}`); }
  enrichGround('toy', 10, 10, { ...none, shade: () => 1 }, c.set('#ffffff')); assert.ok(c.r < 1, 'the toy mat is shaded without recolouring its squares');
  const count = (g: T.Group) => g.children.reduce((n, m) => n + (m as T.Mesh).geometry.index!.count / 3, 0), layout = createEnvironmentLayout('home');
  const plain = buildGround({ planet: 'home', layout, ponds: [], base: 0, segments: 12 }), rich = buildGround({ planet: 'home', layout, ponds: [], base: 0, segments: 12, detail: none });
  assert.equal(count(rich), count(plain)); assert.equal(rich.children.length, plain.children.length);
});

test('the explorer\'s pool of light is one small unlit additive mesh', () => {
  const pool = lightPool(), g = pool.geometry, m = pool.material as T.MeshBasicMaterial;
  assert.ok(g.index!.count / 3 <= 160); assert.equal(m.blending, T.AdditiveBlending); assert.equal(m.depthWrite, false); assert.equal(m.toneMapped, false);
  const c = g.getAttribute('color'), last = c.count - 1; assert.ok(c.getX(0) > 0 && c.getX(last) === 0 && c.getY(last) === 0 && c.getZ(last) === 0, 'bright centre, dark rim');
  let reach = 0; const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i))); assert.ok(Math.abs(reach - 1) < 1e-6, 'unit radius: the world scales it');
});

function built(planet: PlanetId) {
  const w = Object.assign(Object.create(World.prototype), {
    state: newGame(), scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 4 / 3, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), hemi: new T.HemisphereLight(), raycaster: new T.Raycaster(), onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {},
  }) as any;
  w.build(planet); return w;
}

test('a built world wears its planet\'s look, and the sky gradient waits until sky can be seen', () => {
  const w = built('ice');
  assert.equal(hex(w.hemi.color), LOOKS.ice.hemi[0]); assert.equal(hex(w.sun.color), LOOKS.ice.sun[0]); assert.ok(w.sunOffset.x < 0, 'the ice sun stands on the left');
  assert.equal(hex(w.scene.fog.color), LOOKS.ice.sky[1]); assert.equal(w.scene.fog.near, LOOKS.ice.fog[0]);
  assert.ok(w.scene.background === w.skyColor && hex(w.skyColor) === LOOKS.ice.sky[1], 'flat horizon colour while only ground is in view');
  // The shadow box was fitted again in the new sun's axes.
  const box = w.sun.shadow.camera; assert.ok(box.right > box.left && box.top > box.bottom && Number.isFinite(box.left));
  w.cameraTarget.set(0, 0, 3.6); w.viewReach = 31; w.updateSky(); assert.equal(w.scene.background, w.skyColor);
  w.cameraTarget.set(0, 0, -150); w.viewReach = 80; w.updateSky(); assert.ok(w.scene.background.isTexture, 'past the edge of the ground the gradient shows');
  w.flatSky = true; w.updateSky(); assert.equal(w.scene.background, w.skyColor, 'the Colossus\'s dusk keeps the flat sky it tints');
  // A mode that put up its own sky is left alone.
  const own = new T.Color('#123456'); w.flatSky = false; w.scene.background = own; w.updateSky(); assert.equal(w.scene.background, own);
  w.build('home'); assert.equal(hex(w.hemi.color), LOOKS.home.hemi[0]); assert.equal(w.flatSky, false); assert.equal(w.scene.background, w.skyColor);
});

test('Night Planet: a pool of light follows the explorer and the Light buff more than doubles it; other planets have none', () => {
  const w = built('shadow'); w.position.set(12, 0, -7); w.updateHeroLight();
  const pool = w.scene.getObjectByName('hero-light') as T.Mesh; assert.ok(pool?.visible); assert.equal(pool.position.x, 12); assert.equal(pool.position.z, -7);
  const plain = pool.scale.x; assert.ok(Math.abs(plain - w.heroLightRadius() * 1.15) < 1e-9); assert.equal(w.heroLightRadius(), 3.6);
  assert.equal(w.lightSources()[0].radius, 3.6, 'the darkness opens exactly as far as before');
  w.state.buffs.light = { value: 1, expiresAt: Date.now() + 60000 }; w.updateHeroLight();
  assert.equal(w.heroLightRadius(), 7.5); assert.ok(pool.scale.x > plain * 2, 'the buff is plain to see');
  w.environment.eclipseUntil = w.environment.time + 10; w.updateHeroLight(); assert.ok(pool.scale.x < plain * 1.1, 'an eclipse shrinks it');
  w.build('home'); w.updateHeroLight(); assert.equal(pool.visible, false);
});
