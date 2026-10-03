// w14-ux: indoor labels sit on their things and a tap on the label or the thing picks it; the indoor stores are their own
// places; workers' gain effects show only outdoors in the home village (user decision 2026-10-02).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as T from 'three';
import { World, type Entity } from '../src/world.ts';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { explorerAway } from '../src/delivery.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { HOUSE } from '../src/house.ts';
import { HouseSession, houseFocus } from '../src/house-session.ts';
import { HouseView } from '../src/house-view.ts';
import { ACTIVITIES } from '../src/house-activities.ts';
import { activityBox, labelSpot, pickHotspot, screenRect } from '../src/house-hotspots.ts';
import { INDOOR_STORES, indoorStore, purposeHtml, wardrobeItem } from '../src/house-stores.ts';
import { showsGain } from '../src/work-effects.ts';
import { cameraOffset } from '../src/camera-rig.ts';
import { t, setLanguage } from '../src/i18n.ts';

const W = 1440, H = 900;
Object.assign(globalThis, { innerWidth: W, innerHeight: H });

function homeWorld(state: M.SaveState = M.newGame()) {
  const w = Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, W / H, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(),
    position: new T.Vector3(0, 0, -4.4), destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, zoom: 1, remoteRoot: new T.Group(),
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.root.add(w.player, w.companion); w.scene.add(w.root, w.marker, w.ring, w.remoteRoot);
  return w;
}
/** The game's indoor camera for the explorer standing at (x, z): the house focus plus the reference offset. */
function aim(w: World, x: number, z: number) {
  w.position.set(x, 0, z); const focus = houseFocus(w.position, W / H, w.zoom);
  w.camera.position.copy(focus).add(cameraOffset(W / H, w.zoom)); w.camera.lookAt(focus); w.camera.updateMatrixWorld(true);
}
const project = (cam: T.Camera, p: { x: number; y: number; z: number }) => { const v = new T.Vector3(p.x, p.y, p.z).project(cam); return { x: (v.x + 1) * W / 2, y: (1 - v.y) * H / 2 }; };
const ROOMS: Array<[number, number]> = [[-1.5, 3], [-7.6, 1.6], [7.6, 1.6], [-5.6, -3.4], [.6, -3.6], [6.2, -3.8]];

test('indoor labels sit on their thing: the label point is inside the thing\'s own screen box, low and centred', () => {
  const w = homeWorld(), house = new HouseSession(); house.enter(w);
  for (const [x, z] of ROOMS) {
    aim(w, x, z);
    for (const e of w.entities) {
      const box = house.boxOf(e); assert.ok(box, e.id);
      const spot = labelSpot(box!), rect = house.screenBox(e)!, p = project(w.camera, spot);
      assert.ok(spot.y <= Math.max(.9, box!.y1) && spot.y >= box!.y0, `${e.id} label at ${spot.y.toFixed(2)} m`);
      assert.ok(p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom, `${e.id}: label off its box`);
    }
  }
  // Before: an empty anchor made the label 3.3 m high, well above the 2.6 m walls.
  for (const a of ACTIVITIES) assert.ok(labelSpot(activityBox(a.id)!).y < 1.3, a.id);
});

test('a tap on an indoor label or on the thing itself picks it; open floor is a walk', () => {
  const w = homeWorld(), house = new HouseSession(); house.enter(w);
  let shown: { id: string; rect: { left: number; right: number; top: number; bottom: number } } | null = null;
  house.labelBox = id => shown && shown.id === id ? shown.rect : null;
  let checked = 0;
  for (const [x, z] of ROOMS) {
    aim(w, x, z);
    for (const e of w.entities) {
      const rect = house.screenBox(e); if (!rect || rect.right < 0 || rect.left > W || rect.bottom < 0 || rect.top > H) continue;
      // The label (a 96 x 22 px pill centred on the label point) takes the tap even where it pokes past a thin thing.
      const p = project(w.camera, labelSpot(house.boxOf(e)!));
      shown = { id: e.id, rect: { left: p.x - 48, right: p.x + 48, top: p.y - 11, bottom: p.y + 11 } };
      assert.equal(w.pickEntity(p.x, p.y)?.id, e.id, `label tap on ${e.id}`);
      assert.equal(w.pickEntity(p.x + 44, p.y + 9)?.id, e.id, `label edge tap on ${e.id}`);
      shown = null;
      // The middle of the thing: itself, or the smaller thing sitting in or on it (the duck in the tub).
      const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2, got = w.pickEntity(cx, cy)?.id;
      assert.ok(got === e.id || e.id === 'house:bath' && got === 'house:duck', `object tap on ${e.id} picked ${got}`);
      checked++;
    }
  }
  assert.ok(checked > 40, `${checked} checks`);
  // Open floor in the living room is a walk, not the nearest piece of furniture.
  aim(w, 0, 3); const floor = project(w.camera, { x: .8, y: 0, z: 3.4 });
  assert.equal(w.pickEntity(floor.x, floor.y), null);
});

test('pickHotspot: a label wins over a box, then the smallest box holding the tap', () => {
  const big = { left: 0, right: 200, top: 0, bottom: 200 }, small = { left: 50, right: 90, top: 50, bottom: 90 };
  assert.equal(pickHotspot([{ e: 'tub', rect: big }, { e: 'duck', rect: small }], 60, 60), 'duck');
  assert.equal(pickHotspot([{ e: 'tub', rect: big }, { e: 'duck', rect: small }], 150, 150), 'tub');
  assert.equal(pickHotspot([{ e: 'tub', rect: big, label: { left: 55, right: 75, top: 55, bottom: 75 } }, { e: 'duck', rect: small }], 60, 60), 'tub');
  assert.equal(pickHotspot([{ e: 'tub', rect: big }], 300, 300), null);
  // A tiny thing grows to a finger's width on screen.
  const cam = new T.PerspectiveCamera(40, W / H, .5, 300); cam.position.set(0, 17, 13.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const r = screenRect({ x0: -.05, x1: .05, y0: 0, y1: .05, z0: -.05, z1: .05 }, cam, W, H)!;
  assert.ok(r.right - r.left >= 44 - 1e-6 && r.bottom - r.top >= 44 - 1e-6);
});

test('hover glow and the nearest ring wrap the thing\'s footprint', () => {
  const view = new HouseView(), b = activityBox('wardrobe')!;
  view.setHover(b);
  assert.ok(view.hoverGlow.visible && view.hoverRing.visible);
  assert.ok(Math.abs(view.hoverGlow.position.x - (b.x0 + b.x1) / 2) < 1e-6 && Math.abs(view.hoverGlow.scale.y - (b.y1 - b.y0 + .06)) < 1e-6);
  assert.ok(view.hoverRing.scale.x * .56 > (b.x1 - b.x0) / 2 && view.hoverRing.scale.z * .56 > (b.z1 - b.z0) / 2, 'ring outside the footprint');
  view.setHover(null); assert.ok(!view.hoverGlow.visible && !view.hoverRing.visible);
});

test('indoor stores are their own places, in English and Vietnamese', () => {
  assert.equal(indoorStore('cook', false), null, 'the village kitchen keeps its own title');
  assert.equal(indoorStore('bag', true), null, 'the bag button indoors is still the backpack');
  assert.equal(indoorStore('bag', true, true), INDOOR_STORES.wardrobe);
  assert.equal(indoorStore('shop', true), null);
  for (const type of ['cook', 'craft', 'travel', 'looks']) assert.ok(indoorStore(type, true), type);
  const titles = Object.values(INDOOR_STORES).map(s => s.title);
  assert.equal(new Set(titles).size, titles.length);
  for (const outdoor of ['A warm meal for the trail', 'Made with a little magic', 'Starship Sprout', 'Your explorer & backpack', 'Mirror, mirror', 'Little outfitters']) assert.ok(!titles.includes(outdoor), outdoor);
  assert.ok(INDOOR_STORES.looks.purpose.includes('Body, height, ears and animal hoods'));
  assert.ok(purposeHtml(INDOOR_STORES.cook).includes('store-purpose'));
  assert.equal(wardrobeItem({ slot: 'hat' }), true); assert.equal(wardrobeItem({}), false); assert.equal(wardrobeItem(undefined), false);
  setLanguage('vi');
  try { for (const s of Object.values(INDOOR_STORES)) for (const text of [s.title, s.kicker, s.purpose]) assert.notEqual(t(text), text, text); assert.notEqual(t('Click a glowing thing to use it'), 'Click a glowing thing to use it'); }
  finally { setLanguage('en'); }
});

test('workers\' gains show only outdoors in the home village; your own show everywhere', () => {
  const at = (planet: string, indoors: boolean, away: boolean) => ({ planet, indoors, away });
  assert.equal(showsGain('worker', at('home', false, false)), true);
  assert.equal(showsGain('worker', at('home', true, false)), false);
  assert.equal(showsGain('worker', at('home', false, true)), false);
  assert.equal(showsGain('worker', at('forest', false, true)), false);
  for (const place of [at('home', false, false), at('home', true, false), at('home', false, true), at('forest', false, true)]) assert.equal(showsGain('own', place), true);
});

// The real main.ts feedback and helper paths, with presentation spied on.
const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = ['floating', 'gainShows', 'explorerOut', 'orbTarget', 'harvestBurst', 'plantBurst', 'helperAction'];
const code = names.map(name => { const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); assert.ok(node, name); return node!.getText(ast); }).join('\n');
const compiled = ts.transpileModule(code + '\n;({harvestBurst,helperAction});', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function run(place: { planet: string; indoors: boolean; x: number; z: number }) {
  const state = M.newGame(); state.helper = { ...(state.helper ?? {}), owned: true, paused: false, last: {} } as M.SaveState['helper'];
  state.plots[0].crop = 'carrot'; state.plots[0].plantedAt = Date.now() - 1e8;
  const effects: string[] = [];
  const fx = { burst: () => effects.push('burst'), orbs: () => effects.push('orbs'), text: () => effects.push('text') };
  const world = { planet: place.planet, interior: place.indoors ? {} : null, position: new T.Vector3(place.x, 0, place.z), entities: [{ kind: 'plot', index: 0, x: -4, z: 6 }, { kind: 'chest', x: 3, z: 3 }] as Entity[], fx, syncCrops() {} };
  const ctx = vm.createContext({ M, state, world, t, tone: () => effects.push('tone'), explorerAway, showsGain, applyGameAction, change: (f: () => unknown) => f(), actionHandler: null, helperPending: new Set(), perform: async () => null });
  const api = vm.runInContext(compiled, ctx) as { harvestBurst(i: number, crop: string, source?: string): void; helperAction(kind: string, i: number): unknown };
  return { state, effects, api };
}
test('a helper harvest: effects outdoors in the village only, the carrot arrives everywhere; your own harvest in the wilds still shows', () => {
  const village = run({ planet: 'home', indoors: false, x: 2, z: 2 });
  assert.equal(village.api.helperAction('helperHarvest', 0), true);
  assert.ok(village.effects.includes('orbs') && village.effects.includes('burst') && village.effects.includes('text'), village.effects.join());
  assert.equal(village.state.bag.carrot, 1);
  const indoors = run({ planet: 'home', indoors: true, x: -7, z: 2 });
  indoors.api.helperAction('helperHarvest', 0);
  assert.deepEqual(indoors.effects, []); assert.equal(indoors.state.bag.carrot, 1, 'indoors you are home: the bag');
  const wilds = run({ planet: 'home', indoors: false, x: 60, z: 40 });
  wilds.api.helperAction('helperHarvest', 0);
  assert.deepEqual(wilds.effects, []); assert.equal(wilds.state.chest.carrot, 1, 'out in the wilds: the chest'); assert.ok(!wilds.state.bag.carrot);
  const planet = run({ planet: 'forest', indoors: false, x: 0, z: 0 });
  planet.api.harvestBurst(0, 'carrot', 'worker'); assert.deepEqual(planet.effects, []);
  // The explorer's own harvest keeps its sparkles, orbs and XP float in the wilds and on planets.
  wilds.api.harvestBurst(0, 'carrot'); assert.ok(wilds.effects.includes('orbs') && wilds.effects.includes('text'));
  planet.api.harvestBurst(0, 'carrot', 'own'); assert.ok(planet.effects.includes('burst'));
});

test('leaving the cottage restores the village entities and drops the indoor pick hook', () => {
  const w = homeWorld(), house = new HouseSession(), outdoor = w.entities;
  house.enter(w); assert.ok(w.interior?.pick);
  house.leave();
  assert.equal(w.interior, null); assert.equal(w.entities, outdoor);
  assert.ok(Math.hypot(w.position.x - HOUSE.outside.x, w.position.z - HOUSE.outside.z) < 1e-6);
});
