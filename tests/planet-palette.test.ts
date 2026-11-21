import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { PALETTE, PALETTES, type Palette, type HomeZone } from '../src/planet-palette.ts';
import { LOOKS, grade, groundKeep } from '../src/look.ts';
import { TOON_OWN } from '../src/toon.ts';
import { PLANETS, type PlanetId } from '../src/model.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { groundBase, groundColor } from '../src/ground.ts';
import { pondLook } from '../src/pond-view.ts';
import { perfFlags } from '../src/perf-flags.ts';
import { FOG } from '../src/camera-rig.ts';

const OWN = PALETTES.own, CLASSIC = PALETTES.classic!;
const DAY = (Object.keys(PLANETS) as PlanetId[]).filter(id => id !== 'shadow');
const lin = (hex: string) => new T.Color(hex).toArray() as [number, number, number];
/** A written colour as the screen shows it unlit: 0..1 per channel. */
const screen = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
/** The light flat ground in full sun receives: the sky half plus the sun, per channel. */
const flatLight = (p: Palette, planet: PlanetId) => { const l = p.light[planet], sky = lin(l.hemi[0]), sun = lin(l.sun[0]); return sky.map((v, i) => v * l.hemi[2] + sun[i] * l.sun[1]); };
/** A colour as it is drawn on flat ground in full sun: lit, through the colour curve, as the screen shows it (0..1 per channel). */
function drawn(p: Palette, planet: PlanetId, hex: string): [number, number, number] {
  const light = flatLight(p, planet), c = grade(lin(hex).map((v, i) => v * light[i] / Math.PI) as [number, number, number], p.light[planet].exposure);
  return new T.Color().setRGB(c[0], c[1], c[2]).convertLinearToSRGB().toArray() as [number, number, number];
}
const hsl = ([r, g, b]: readonly number[]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
};
/** CIE lightness (L*, 0..100) of a screen colour. */
const lightness = (c: readonly number[]) => { const f = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4, y = .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); return y > .008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
/** The toy mat's squares come from a texture that takes its colours' linear values as screen values (ground.ts checker): what is drawn is deeper than what is written. */
const matSquare = (hex: string) => '#' + new T.Color().setRGB(...lin(hex), T.SRGBColorSpace).getHexString();
/** Every big area of a table: [name, planet whose light falls on it, colour]. */
function bigAreas(p: Palette): [string, PlanetId, string][] {
  const out: [string, PlanetId, string][] = [];
  for (const [zone, [base]] of Object.entries(p.zones)) out.push([`home ${zone}`, 'home', base]);
  for (const id of DAY) if (id !== 'home') {
    const base = p.ground[id].base?.[0] ?? PLANETS[id].ground[0];
    if (id === 'toy') { out.push(['toy mat, first square', id, matSquare(base)], ['toy mat, second square', id, matSquare(p.ground.toy.base?.[1] ?? PLANETS.toy.ground[1])]); continue; }
    if (id === 'ocean' || id === 'cloud') { out.push([`${id} islands`, id, p.isles[id][1]], [`${id} sea`, id, p.isles[id][3]]); continue; } // their ground lies under the sea
    out.push([`${id} ground`, id, base]);
  }
  for (const [id, w] of Object.entries(p.water)) if (id !== 'shadow') out.push([`${id} water`, (id in PLANETS ? id : 'home') as PlanetId, w.water]);
  return out;
}

test('big areas are vivid, never pastel: drawn saturation .45 or more and lightness .35 to .65 (accents and the Night Planet excepted)', () => {
  for (const [name, planet, hex] of bigAreas(OWN)) {
    const c = hsl(drawn(OWN, planet, hex));
    assert.ok(c.s >= .45, `${name} ${hex}: saturation ${c.s.toFixed(2)}`); assert.ok(c.l >= .35 && c.l <= .65, `${name} ${hex}: lightness ${c.l.toFixed(2)}`);
  }
  // The old tables broke the rule in the places the evaluation named: washed-out Candy, pale mats, sand, snow and cloud.
  const pale = bigAreas(CLASSIC).filter(([, planet, hex]) => hsl(drawn(CLASSIC, planet, hex)).l > .65).map(([name]) => name);
  for (const name of ['candy ground', 'candy water', 'toy mat, first square', 'ice ground', 'cloud sea', 'home canyon']) assert.ok(pale.includes(name), `${name} was pale before`);
});

test('nothing in a table clips to white or crushes to black in full sun', () => {
  for (const [name, planet, hex] of bigAreas(OWN)) { const c = drawn(OWN, planet, hex); assert.ok(Math.max(...c) < .995, `${name} clips`); assert.ok(lightness(c) > 30, `${name} is too dark`); }
});

test('every boss stands at least 20 L* from its ground (the paint that covers most of it, on flat sunlit ground)', () => {
  const homeZone: Record<string, HomeZone> = { bear: 'canyon', treant: 'forest', croc: 'swamp', mushking: 'meadow' };
  // The Night Planet is left as it was: its Shadow Lord is seen against the explorer's pool of light, which is lighter than he is (measured in the pictures).
  for (const id of DAY) for (const boss of PLANETS[id].bosses) {
    const paint = OWN.paint[boss]?.[`Creature ${boss}`] ?? ENEMY_TYPES[boss].color, body = lightness(drawn(OWN, id, paint));
    const grounds = id === 'home' ? [OWN.zones[homeZone[boss]][0]] : id === 'toy' ? OWN.ground.toy.base!.slice(0, 2).map(matSquare) : id === 'ocean' ? [OWN.isles.ocean[3]] : id === 'cloud' ? [OWN.isles.cloud[1]] : [OWN.ground[id].base?.[0] ?? PLANETS[id].ground[0]];
    for (const ground of grounds) { const d = Math.abs(body - lightness(drawn(OWN, id, ground))); assert.ok(d >= 20, `${boss} on ${id} ${ground}: ${d.toFixed(1)} L*`); }
  }
});

test('the Crocodile King is dark teal with a warm belly, well apart from the mossy swamp (it was green on green)', () => {
  const paint = OWN.paint.croc, [skin, dark, under] = ['Creature croc', 'Creature croc dark', 'Creature croc belly'].map(name => paint[name]), body = hsl(screen(skin)), belly = hsl(screen(under));
  assert.deepEqual(Object.keys(paint).sort(), ['Creature croc', 'Creature croc belly', 'Creature croc dark'], 'the material names of creatures.glb');
  assert.ok(body.h > 150 && body.h < 190, `teal body, hue ${body.h.toFixed(0)}`); assert.ok(belly.h > 25 && belly.h < 50 && belly.l > .6, 'a warm, light belly');
  assert.equal(ENEMY_TYPES.croc.color, skin, 'the stand-in shape and the sparks wear the same paint'); assert.equal(ENEMY_TYPES.croc.accent, under);
  assert.ok(lightness(screen(dark)) < lightness(screen(skin)), 'the spikes are the darkest part');
  const swamp = (p: Palette, croc: string) => { const a = drawn(p, 'home', p.zones.swamp[0]), b = drawn(p, 'home', croc), ha = hsl(a).h, hb = hsl(b).h; return { dL: Math.abs(lightness(a) - lightness(b)), dH: Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb)) }; };
  const before = swamp(CLASSIC, '#4f9e5a'), after = swamp(OWN, skin);
  assert.ok(before.dL < 15 && before.dH < 30, `before: ${before.dL.toFixed(0)} L*, ${before.dH.toFixed(0)} degrees of hue`);
  assert.ok(after.dL >= 20 && after.dH >= 70, `after: ${after.dL.toFixed(0)} L*, ${after.dH.toFixed(0)} degrees of hue`);
  assert.deepEqual(CLASSIC.paint, {}, 'the old table leaves every creature in its file\'s colours');
});

test('the forest and the swamp are warm greens now, Candy is berry with one hot accent, the play mat and the cloud isles are more saturated', () => {
  const hue = (p: Palette, planet: PlanetId, hex: string) => hsl(drawn(p, planet, hex)).h, sat = (p: Palette, planet: PlanetId, hex: string) => hsl(drawn(p, planet, hex)).s;
  for (const zone of ['forest', 'swamp'] as const) {
    const was = hue(CLASSIC, 'home', CLASSIC.zones[zone][0]), now = hue(OWN, 'home', OWN.zones[zone][0]);
    assert.ok(now < was - 10 && now >= 70 && now <= 105, `${zone}: hue ${was.toFixed(0)} -> ${now.toFixed(0)} (towards yellow)`);
    const under = new T.Color(OWN.zones[zone][2]); assert.ok(under.r > under.b, `${zone}: the floor under the trees is warm, not teal`);
  }
  assert.deepEqual([OWN.zones.home, OWN.zones.meadow], [CLASSIC.zones.home, CLASSIC.zones.meadow], 'the village green and the meadow keep their colours');
  const candy = hsl(drawn(OWN, 'candy', OWN.ground.candy.base![0])), pink = hsl(drawn(CLASSIC, 'candy', PLANETS.candy.ground[0]));
  assert.ok(candy.h >= 320 && candy.h <= 345 && candy.l <= .62 && candy.s >= .6, `berry: hue ${candy.h.toFixed(0)}, lightness ${candy.l.toFixed(2)}`); assert.ok(pink.l > .74, 'it was a pale pink');
  const hot = Object.values(OWN.kit.candy!).filter(c => { const h = hsl(screen(c)).h; return h >= 10 && h <= 45; });
  assert.ok(hot.length >= 2 && hot.length <= 4, 'one hot accent: the tangerine trees');
  for (const [planet, own, old] of [['toy', matSquare(OWN.ground.toy.base![0]), matSquare(PLANETS.toy.ground[0])], ['cloud', OWN.isles.cloud[1], CLASSIC.isles.cloud[1]], ['cloud', OWN.isles.cloud[3], CLASSIC.isles.cloud[3]]] as const)
    assert.ok(sat(OWN, planet, own) > sat(CLASSIC, planet, old) || hsl(drawn(OWN, planet, own)).l < hsl(drawn(CLASSIC, planet, old)).l - .1, `${planet} ${own}`);
  for (const id of DAY) if (id !== 'home' && OWN.ground[id].base) assert.equal(PLANETS[id].ground.length, 3, 'the planet facts keep their own ground colours');
});

test('shade is blue-violet: the sky half of every day light is bluer and stronger, the sun warmer, and flat sunlit ground gets the light it had', () => {
  for (const id of DAY) {
    const own = OWN.light[id], old = CLASSIC.light[id], sky = (l: typeof own) => lin(l.hemi[0]).map(v => v * l.hemi[2]), a = sky(own), b = sky(old);
    assert.ok(a[2] - a[0] >= b[2] - b[0] + .25, `${id}: the light in shade leans ${(a[2] - a[0] - b[2] + b[0]).toFixed(2)} further to blue`);
    const lum = (v: number[]) => v[0] * .2126 + v[1] * .7152 + v[2] * .0722; assert.ok(Math.abs(lum(a) / lum(b) - 1) < .08, `${id}: shade is as bright as before (${(lum(a) / lum(b)).toFixed(2)})`);
    const sun = new T.Color(own.sun[0]), was = new T.Color(old.sun[0]); assert.ok(sun.b / sun.r < was.b / was.r, `${id}: a warmer sun`);
    flatLight(OWN, id).forEach((v, i) => assert.ok(Math.abs(v / flatLight(CLASSIC, id)[i] - 1) < .015, `${id}: channel ${i} of the light on flat sunlit ground changed by ${((v / flatLight(CLASSIC, id)[i] - 1) * 100).toFixed(1)}%`));
    // The ground correction of the toy finish (look.ts groundKeep) still holds under the new suns.
    const keep = groundKeep(id), s = lin(own.hemi[0]).map(v => v * own.hemi[2]), n = lin(own.sun[0]).map(v => v * own.sun[1]);
    keep.forEach((k, i) => assert.ok(Math.abs(k * (s[i] + n[i] * TOON_OWN[4][i] / 255) - (s[i] + n[i])) < 1e-12, id));
  }
});

test('the Night Planet stays as it was: very dark blue', () => {
  assert.deepEqual(OWN.light.shadow, { sky: ['#03061a', '#101a52'], fog: [24, 78], hemi: ['#8494ff', '#2c2a78', 1.5], sun: ['#a8bcff', 1.9, -36, 62], exposure: 1.05 });
  assert.deepEqual(OWN.ground.shadow, { patch: '#3b3160', s: .15, l: .02, shade: '#5a56a8', wear: '#3a3470' }); assert.equal(OWN.ground.shadow.base, undefined);
  assert.deepEqual(OWN.water.shadow, { water: '#3f3a7a', sand: '#5a5478', deep: '#25204a', shallow: '#4a4672' });
  for (const part of ['light', 'ground', 'water', 'kit'] as const) assert.equal(OWN[part].shadow, CLASSIC[part].shadow, part);
  assert.equal(ENEMY_TYPES.shadowlord.color, '#58476f', 'and its boss');
  assert.deepEqual(PLANETS.shadow.ground, ['#2a2440', '#3a3258', '#1e1a30']);
  const top = screen(OWN.light.shadow.sky[0]); assert.ok(top[2] > top[0] * 2 && lightness(top) < 5, 'very dark blue');
});

test('the game wears our own table; the old one is there for a before and after, switched as the page loads', () => {
  assert.equal(perfFlags.ownColours, true); assert.equal(PALETTE, OWN);
  // Spot checks that the old table is the one from before this package.
  assert.deepEqual(CLASSIC.light.home, { sky: ['#3f9cf2', '#bfe6ff'], fog: [45, 110], hemi: ['#d4e8ff', '#a8d86a', 1.18], sun: ['#fff0d8', 2.55, 54.5, 60.2], exposure: 1 });
  assert.deepEqual(CLASSIC.zones.swamp, ['#52c08c', '#3fa878', '#6f9f96']); assert.deepEqual(CLASSIC.water.candy, { water: '#ff9fd2', sand: '#ffd8ec', deep: '#e06aa8', shallow: '#f6a9cc' });
  assert.equal(CLASSIC.kit.candy!['Leaf A'], '#ff7fb8'); assert.equal(CLASSIC.ground.candy.base, undefined); assert.equal(CLASSIC.space.sky, '#120a2a');
  for (const p of [OWN, CLASSIC]) { assert.deepEqual(Object.keys(p.light).sort(), Object.keys(PLANETS).sort()); assert.deepEqual(Object.keys(p.ground).sort(), Object.keys(PLANETS).sort()); assert.equal(p.kit.home, undefined, 'home wears the kit\'s own colours'); }
});

test('the ground, the lights and the ponds read the table', () => {
  assert.equal(LOOKS, PALETTE.light);
  // Fog and where each sun stands are the same in both tables: only colours and strengths changed, so shadows fall where they did.
  for (const id of Object.keys(PLANETS) as PlanetId[]) { assert.deepEqual(OWN.light[id].fog, CLASSIC.light[id].fog, id); assert.deepEqual(OWN.light[id].sun.slice(2), CLASSIC.light[id].sun.slice(2), id); }
  assert.deepEqual(OWN.light.home.fog, [FOG.near, FOG.far], 'clear days keep the fog of the camera rig');
  assert.equal(groundBase('candy'), OWN.ground.candy.base); assert.equal(groundBase('shadow'), PLANETS.shadow.ground);
  assert.equal(pondLook('candy'), OWN.water.candy); assert.equal(pondLook('nowhere'), OWN.water.home);
  // A patch of Candy's plain is berry, and the swamp is a warm green, as the ground mesh colours them.
  const mean = (planet: PlanetId, spots: [number, number][]) => { const c = new T.Color(), sum = [0, 0, 0]; for (const [x, z] of spots) groundColor(planet, x, z, [], c).toArray().forEach((v, i) => { sum[i] += v / spots.length; }); return hsl(new T.Color().setRGB(sum[0], sum[1], sum[2]).convertLinearToSRGB().toArray()); };
  const candy = mean('candy', [[40, 40], [-60, 30], [20, -80], [90, 90]]); assert.ok(candy.h > 315 && candy.h < 345 && candy.l < .68, `candy plain: hue ${candy.h.toFixed(0)}, lightness ${candy.l.toFixed(2)}`);
});
