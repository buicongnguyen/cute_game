// Wave 26 "people": friends the same size indoors and out, a friend's Looks tab (save, apply, validate, visitors), the
// mirror's Blender option portraits, and the mirror preview that renders only when something changes.
const classic = <T extends { looks?: unknown }>(s: T) => { delete s.looks; return s; }; // a save from before the girl default
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World, HERO_SCALE } from '../src/world.ts';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { heroKit, heroKitFor, useHeroLoader, wearKit } from '../src/assets.ts';
import { DEFAULT_LOOK, HEIGHT_RATIO, OPTIONS, ROWS, lookOf, type Height, type LookId, type LookOption } from '../src/looks.ts';
import { GROWTH } from '../src/growth.ts';
import { FRIEND_IDS, parseFriends, type Friend, type FriendId } from '../src/friends-state.ts';
import { friendLook, setFriendLook, showsHead } from '../src/friend-looks.ts';
import { WORK_HATS, buildFriend, friendModel, friendSignature, friendWear, setFriendDresser } from '../src/friend-view.ts';
import { FriendCrew } from '../src/friend-crew.ts';
import { HouseView } from '../src/house-view.ts';
import { MirrorPreview, type PreviewRenderer } from '../src/mirror-preview.ts';
import { lookArt, lookRowsHtml } from '../src/look-tiles.ts';
import { friendLooksHtml } from '../src/friend-looks-ui.ts';

const T0 = 1_000_000_000;
const disk = async (url: string) => { const file = url.split('/').pop()!.split('?')[0], bytes = readFileSync(new URL(`../public/assets/models/${file}`, import.meta.url)); return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '')).scene; };
/** The real explorer and gear files from disk (in a browser they are fetched). */
async function kits() {
  useHeroLoader(disk);
  for (const kit of [heroKit, wearKit] as unknown as Array<{ loadScene: typeof disk; loading: unknown; load(): Promise<void> }>) { if (!(kit as unknown as { ready: boolean }).ready) { kit.loadScene = disk; kit.loading = null; } await kit.load(); }
  assert.ok(heroKit.ready && wearKit.ready, 'explorer and wear kits load from disk');
}
// The real World without WebGL (as dispose-tree.test.ts builds it), at home.
function homeWorld(state: M.SaveState) {
  const w = Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 1, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(),
    position: new T.Vector3(0, 0, 4), destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, zoom: 1, remoteRoot: new T.Group(),
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.scene.add(w.root);
  setFriendDresser((color, gear, look) => w.friendAvatar(color, gear, look));
  return w;
}
/** Head-to-feet height of what is drawn (no outline hulls, no floor blob, no pet). */
function standingHeight(root: T.Object3D) {
  root.updateMatrixWorld(true); const box = new T.Box3(), part = new T.Box3();
  root.traverseVisible(o => {
    if (!(o instanceof T.Mesh) || o.userData.outline || o.name === 'friend-blob' || o.parent?.name === 'remote-pet') return;
    o.geometry.computeBoundingBox(); part.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld); box.union(part);
  });
  return box.max.y - box.min.y;
}
const homeFriends = (stage: number, extra: Partial<Friend> = {}): Friend[] => FRIEND_IDS.map((id, i) => ({ id, role: (['garden', 'farm', 'cook'] as const)[i], rescuedAt: T0, gear: {}, home: true, paused: true, grown: stage, ...extra }));

// ------------------------------------------------------------------ 1. the same size indoors and outdoors
test('every friend stands at the same share of the explorer\'s height indoors and outdoors, at every growth stage', async () => {
  await kits();
  const s = classic(M.newGame('Ann')), w = homeWorld(s), explorer = w.lookAvatar(s.color, {}, DEFAULT_LOOK); explorer.scale.setScalar(HERO_SCALE);
  const hero = standingHeight(explorer); assert.ok(hero > 1.8 && hero < 2.1, `the explorer stands about 1.95 m (${hero.toFixed(3)})`);
  const crew = new FriendCrew({ world: w, own: () => s, visiting: () => false, flying: () => false, started: () => false, robotBed: () => undefined, animalAt: () => undefined,
    perform: async () => undefined, rescued() {}, locked() {}, worked() {}, arrived() {} });
  const report: string[] = [];
  for (const stage of [0, 1, 2]) {
    s.friends = homeFriends(stage);
    for (let i = 0; i < 400; i++) crew.update(.25); // the paused cook walks into the cottage and is hidden outside
    const view = new HouseView(); view.syncFriends(s.friends);
    for (const id of FRIEND_IDS) {
      crew.actors.get(id)!.root.visible = true;
      const outside = standingHeight(crew.actors.get(id)!.root) / hero, inside = standingHeight(view.friends.get(id)!.group) / hero;
      report.push(`${id}@${stage}: out ${outside.toFixed(3)} in ${inside.toFixed(3)}`);
      assert.ok(Math.abs(outside - inside) < .005, `${id} at stage ${stage}: ${outside.toFixed(3)} outdoors vs ${inside.toFixed(3)} indoors`);
      assert.equal(crew.actors.get(id)!.root.scale.x, view.friends.get(id)!.group.scale.x, 'one scale');
    }
    // Bare-headed, the body is exactly the growth table's share (the work hat above sits on top of it, in both places).
    const bare = standingHeight(buildFriend('clover', {}, stage)) / hero;
    assert.ok(Math.abs(bare - GROWTH[stage].height) < .02, `stage ${stage}: ${bare.toFixed(3)} vs ${GROWTH[stage].height}`);
  }
  assert.equal(report.length, 9, report.join('\n'));
});

test('a styled friend: the height option sets proportions and growth sets the height (body files measured)', async () => {
  await kits();
  const s = classic(M.newGame('Ann')), w = homeWorld(s), hero = standingHeight(w.lookAvatar(s.color, {}, DEFAULT_LOOK));
  // HEIGHT_RATIO mirrors the files: each height's body over the chibi's.
  for (const h of ROWS.height as Height[]) {
    const id = `boy-${h}-none-bare` as LookId, kit = heroKitFor(id); await kit.load();
    const ratio = standingHeight(kit.instance('#fff')!) / hero;
    assert.ok(Math.abs(ratio - HEIGHT_RATIO[h]) < .01, `${h}: file ratio ${ratio.toFixed(3)} vs HEIGHT_RATIO ${HEIGHT_RATIO[h]}`);
  }
  const explorer = w.lookAvatar(s.color, {}, DEFAULT_LOOK); explorer.scale.setScalar(HERO_SCALE); const heroScaled = standingHeight(explorer);
  for (const h of ['tiny', 'grown'] as Height[]) await heroKitFor(`girl-${h}-none-bare`).load();
  for (const stage of [0, 1, 2]) for (const h of ['tiny', 'grown'] as Height[]) {
    const friend = buildFriend('pepper', {}, stage, `girl-${h}-none-bare`);
    assert.equal(friend.userData.look, `girl-${h}-none-bare`, 'the styled body is drawn once its file is in');
    const share = standingHeight(friend) / heroScaled;
    assert.ok(Math.abs(share - GROWTH[stage].height) < .025, `${h} at stage ${stage}: ${share.toFixed(3)} of the explorer (growth says ${GROWTH[stage].height})`);
  }
  // A Grown-up friend at the last stage still never outgrows the default explorer.
  assert.ok(standingHeight(buildFriend('sprout', {}, 2, 'boy-grown-none-bare')) < heroScaled);
});

test('work hats: worn in both places, but never over ears or a hood; a given hat wins', () => {
  const f = (look?: LookId, gear: Friend['gear'] = {}): Friend => ({ id: 'pepper', role: 'cook', rescuedAt: T0, gear, home: true, look });
  assert.deepEqual(friendWear(f()), { hat: WORK_HATS.pepper });
  assert.deepEqual(friendWear(f('boy-chibi-none-fox')), {}, 'a hood shows: no chef\'s hat over it');
  assert.deepEqual(friendWear(f('girl-tall-cat-bare')), {}, 'ears show too');
  assert.deepEqual(friendWear(f('girl-tall-cat-bare', { hat: 'hat_straw' })), { hat: 'hat_straw' }, 'a hat the player gave stays (it covers the ears, as on the explorer)');
  assert.equal(showsHead(DEFAULT_LOOK), false); assert.equal(showsHead('slim-grown-none-owl'), true);
});

// ------------------------------------------------------------------ 2. friend looks: rules, saving, the server, visitors
const withFriends = (energy = 1000) => { const s = classic(M.newGame('Ann')); s.energy = energy; s.friends = homeFriends(1); return s; };
test('friend looks: owned options are free, missing ones are bought once for the player too, and the explorer keeps their own look', () => {
  const s = withFriends(500);
  assert.equal(setFriendLook(s, 'sprout', 'girl-chibi-none-bare'), true, 'free options dress a friend for free');
  assert.equal(friendLook(s.friends![0]), 'girl-chibi-none-bare'); assert.equal(s.energy, 500);
  assert.equal(setFriendLook(s, 'sprout', 'girl-chibi-none-bare'), false, 'nothing to change');
  assert.equal(setFriendLook(s, 'sprout', 'girl-tall-none-fox'), false, 'unowned options need buying');
  assert.equal(setFriendLook(s, 'sprout', 'girl-tall-none-fox', true), true);
  assert.equal(s.energy, 500 - OPTIONS.tall.price - OPTIONS.fox.price, 'tall and the fox hood, once');
  assert.deepEqual([...s.looks!.owned].sort(), ['fox', 'tall']); assert.equal(lookOf(s), DEFAULT_LOOK, 'the explorer\'s own look is unchanged');
  assert.equal(setFriendLook(s, 'clover', 'boy-tall-none-fox'), true, 'and now they dress every friend for free'); assert.equal(s.energy, 500 - 240);
  assert.equal(setFriendLook(s, 'pepper', 'boy-grown-bunny-bare', true), false, 'grown and bunny ears: 310, more than the 260 left'); assert.equal(s.energy, 260);
  assert.equal(setFriendLook(s, 'pepper', 'boy-grown-none-bare', true), true); assert.equal(s.energy, 100);
  const poor = withFriends(100); assert.equal(setFriendLook(poor, 'pepper', 'boy-grown-none-bare', true), false, 'too dear'); assert.equal(poor.energy, 100); assert.equal(poor.looks, undefined);
  assert.equal(setFriendLook(s, 'sprout', 'robot-chibi-none-bare'), false, 'unknown look');
  assert.equal(setFriendLook(s, 'nobody' as FriendId, DEFAULT_LOOK), false, 'unknown friend');
  assert.equal(setFriendLook(s, 'sprout', DEFAULT_LOOK), true); assert.equal('look' in s.friends![0], false, 'the default is stored as no look');
});

test('friend looks save, load, go through the shared actions, and reach visitors', () => {
  const s = withFriends(1000);
  assert.equal(applyGameAction(s, { type: 'friendLook', payload: { friend: 'pepper', id: 'girl-teen-bunny-bare', buy: true } }, { now: T0, random: () => .5 }), true);
  assert.throws(() => applyGameAction(s, { type: 'friendLook', payload: { friend: 'pepper', id: 'girl-teen-bunny-bare' } }, { now: T0, random: () => .5 }), /not available/, 'no change: refused');
  assert.throws(() => applyGameAction(s, { type: 'friendLook', payload: { friend: 'pepper', id: 'boy-chibi-none-owl' } }, { now: T0, random: () => .5 }), /not available/, 'unowned without buy: refused');
  assert.throws(() => applyGameAction(s, { type: 'friendLook', payload: { friend: 7, id: 'boy-chibi-none-bare' } }, { now: T0, random: () => .5 }), /not available/);
  const back = M.parseSave(JSON.stringify(s))!; assert.equal(back.friends!.find(f => f.id === 'pepper')!.look, 'girl-teen-bunny-bare', 'saved and loaded');
  // A save edited by hand cannot dress a friend in options its owner never bought.
  const forged = JSON.parse(JSON.stringify(s)); forged.friends[0].look = 'boy-chibi-none-owl';
  assert.equal(M.parseSave(JSON.stringify(forged))!.friends![0].look, undefined);
  // Visitors get the host's friends as published (server publicHome) and parse them: the look comes along, junk does not.
  const visitor = parseFriends(JSON.parse(JSON.stringify(s.friends)).concat([{ id: 'sprout', look: 'x' }]));
  assert.equal(visitor.find(f => f.id === 'pepper')!.look, 'girl-teen-bunny-bare');
  assert.equal(parseFriends([{ id: 'clover', role: 'farm', gear: {}, look: '<script>' }])[0].look, undefined);
  assert.equal(parseFriends([{ id: 'clover', role: 'farm', gear: {}, look: 'girl-tall-cat' }])[0].look, 'girl-tall-cat-bare', 'older three-part ids migrate');
});

test('the room and the outdoors draw a friend in its look, and rebuild when the look (or its body file) changes', async () => {
  await kits();
  const s = withFriends(); s.looks = { owned: ['tall', 'cat', 'owl'], style: DEFAULT_LOOK }; assert.equal(setFriendLook(s, 'pepper', 'girl-tall-cat-bare'), true);
  homeWorld(s); const pepper = s.friends!.find(f => f.id === 'pepper')!;
  await heroKitFor('girl-tall-cat-bare').load();
  const view = new HouseView(); view.syncFriends(s.friends!); const first = view.friends.get('pepper')!.group;
  assert.equal(first.userData.look, 'girl-tall-cat-bare');
  view.syncFriends(s.friends!); assert.equal(view.friends.get('pepper')!.group, first, 'nothing changed: no rebuild');
  // A preview (the Looks tab's draft) and the saved look go through the same signature.
  const draft = { ...pepper, look: 'slim-chibi-none-owl' as LookId };
  assert.notEqual(friendSignature(draft), friendSignature(pepper));
  await heroKitFor('slim-chibi-none-owl').load();
  view.syncFriends(s.friends!.map(f => f.id === 'pepper' ? draft : f)); assert.notEqual(view.friends.get('pepper')!.group, first); assert.equal(view.friends.get('pepper')!.group.userData.look, 'slim-chibi-none-owl');
  assert.equal(friendModel(pepper).userData.look, 'girl-tall-cat-bare', 'the same builder outdoors');
});

// ------------------------------------------------------------------ 3. the mirror's option portraits
function webpSize(bytes: Buffer) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === 'VP8L') { const b = bytes.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}
test('every body, height, ears and hood option has a small 128 px Blender portrait, used by the mirror and the friend tab', () => {
  const options = Object.values(ROWS).flat() as LookOption[];
  assert.equal(options.length, 25); assert.deepEqual(new Set(options), new Set(Object.keys(OPTIONS)));
  for (const o of options) {
    const url = new URL(`../public/assets/icons/looks/${o}.webp`, import.meta.url), bytes = readFileSync(url);
    assert.deepEqual(webpSize(bytes), [128, 128], o); assert.ok(statSync(url).size < 8 * 1024, `${o}: ${statSync(url).size} bytes`);
  }
  const html = lookRowsHtml(classic(M.newGame()), DEFAULT_LOOK, { attr: 'data-look-option', worn: DEFAULT_LOOK }) + friendLooksHtml(withFriends(), 'sprout');
  for (const o of options) assert.equal(html.split(`src="${lookArt(o)}"`).length - 1, 2, `${o}: one tile in the mirror, one in the friend tab`);
  assert.ok(!/look-chip-icon">[^<]/.test(html), 'no emoji-only tiles left');
});

// ------------------------------------------------------------------ 4. the mirror renders only when something changes
test('the mirror preview renders once per change, never for a repaint with the same key, and frees its avatar', () => {
  const calls: string[] = [], renderer: PreviewRenderer = { render: () => { calls.push('render'); }, setSize: () => {}, domElement: {} as CanvasImageSource };
  const drawn: unknown[] = [], canvas = { className: '', width: 0, height: 0, parentElement: null, getContext: () => ({ clearRect() {}, drawImage: (src: unknown) => { drawn.push(src); } }) } as unknown as HTMLCanvasElement;
  const mirror = new MirrorPreview({ reach: 3.6, renderer, canvas, width: 190, height: 270 });
  let builds = 0; const disposed: T.BufferGeometry[] = [];
  const build = () => { builds++; const g = new T.BoxGeometry(1, 2.3, .6); g.addEventListener('dispose', () => disposed.push(g)); return new T.Mesh(g, new T.MeshBasicMaterial()); };
  assert.equal(mirror.show(null, 'boy-chibi-none-bare|#4aa8ff', build), true);
  for (let i = 0; i < 5; i++) assert.equal(mirror.show(null, 'boy-chibi-none-bare|#4aa8ff', build), false, 'a repaint of the panel');
  assert.equal(mirror.renders, 1); assert.equal(builds, 1, 'the avatar is built only to render'); assert.equal(calls.length, 1); assert.equal(drawn.length, 1, 'copied into the panel canvas');
  assert.equal(disposed.length, 1, 'the avatar is freed right after');
  assert.equal(mirror.show(null, 'girl-tall-none-fox|#4aa8ff', build), true, 'a tap on a tile');
  assert.equal(mirror.show(null, 'girl-tall-none-fox|#4aa8ff', build), false);
  assert.equal(mirror.show(null, 'girl-tall-none-fox|#ff7ab0', build), true, 'a new shirt colour');
  assert.equal(mirror.renders, 3); assert.equal(builds, 3);
  mirror.reset(); assert.equal(mirror.show(null, 'girl-tall-none-fox|#ff7ab0', build), true, 'reset forgets the picture');
});

test('the mirror keys change with the look, the colour, the outfit and the body file arriving', async () => {
  // look-shop.ts imports its stylesheet: Node only needs the code (vi-panels.test.mjs does the same).
  registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
  const { mirrorKey } = await import('../src/look-shop.ts');
  const look: LookId = 'slim-teen-none-koala', key = mirrorKey(look, '#4aa8ff', {});
  assert.equal(mirrorKey(look, '#4aa8ff', { hat: 'hat_chef', weapon: 'sword_wood' }), key, 'hat and weapon are not in the glass');
  assert.notEqual(mirrorKey(look, '#ff7ab0', {}), key); assert.notEqual(mirrorKey('slim-teen-none-owl', '#4aa8ff', {}), key); assert.notEqual(mirrorKey(look, '#4aa8ff', { outfit: 'armor_cloud' }), key);
  useHeroLoader(disk); await heroKitFor(look).load(); assert.notEqual(mirrorKey(look, '#4aa8ff', {}), key, 'the body file arrived: draw again');
  const f: Friend = { id: 'sprout', role: 'garden', rescuedAt: T0, gear: {}, home: true, grown: 1 };
  const a = friendSignature(f), b = friendSignature({ ...f, look: 'girl-chibi-none-bare' }), c = friendSignature({ ...f, gear: { outfit: 'armor_cloud' } }), d = friendSignature({ ...f, grown: 2 });
  assert.equal(new Set([a, b, c, d]).size, 4);
  assert.equal(friendSignature(f), a, 'stable');
});
