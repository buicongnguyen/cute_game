// The face on the hero plate (src/hero-portrait.ts): a still picture, drawn only when what it shows changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { PORTRAIT, Portraits, PortraitTile, aimPortrait, portraitKey, usablePicture, type PortraitSpec } from '../src/hero-portrait.ts';

const read = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PNG = (name: string) => `data:image/png;base64,${name}${'A'.repeat(1200)}`;
const boy: PortraitSpec = { color: '#4aa8ff', look: 'boy-chibi-none-bare', gear: {} };
const wear = (gear: PortraitSpec['gear'], more: Partial<PortraitSpec> = {}): PortraitSpec => ({ ...boy, ...more, gear });
/** A tile on a hand-run idle queue: `run()` plays the idle moments that were asked for. */
function tile({ draw = (s: PortraitSpec) => PNG(portraitKey(s)), busy = () => false, patience = 3 } = {}) {
  const shown: string[] = [], queue: { fn: () => void; again: boolean }[] = [], portraits = new Portraits(draw);
  const view = new PortraitTile({ portraits, show: url => { shown.push(url); }, busy, patience, later: (fn, again) => { queue.push({ fn, again }); } });
  return { view, portraits, shown, queue, run: () => { const jobs = queue.splice(0); for (const j of jobs) j.fn(); return jobs.length; } };
}

test('the key names what the picture shows and nothing else', () => {
  const base = portraitKey(boy, '110');
  assert.equal(portraitKey({ ...boy, gear: {} }, '110'), base);
  // Weapon, boots and companion are never in frame: World.portraitAvatar leaves them out and the key ignores them.
  assert.equal(portraitKey(wear({ weapon: 'sword_crystal', boots: 'boots_rocket', pet: 'pet_robot' } as PortraitSpec['gear']), '110'), base);
  for (const other of [wear({ hat: 'hat_straw' }), wear({ hat: 'dye_ruby_hat_wizard' }), wear({ outfit: 'armor_knight' }), wear({ disguise: 'dz_dino' }), wear({}, { look: 'girl-chibi-none-bare' }), wear({}, { color: '#ff7ab0' })])
    assert.notEqual(portraitKey(other, '110'), base, JSON.stringify(other));
  assert.notEqual(portraitKey(wear({ hat: 'hat_wizard' })), portraitKey(wear({ hat: 'dye_ruby_hat_wizard' })), 'a dye is its own picture');
  assert.notEqual(portraitKey(boy, '100'), base, 'a late art file redraws');
  // A disguise covers the hat and the outfit: changing them underneath is the same picture.
  assert.equal(portraitKey(wear({ disguise: 'dz_snowman', hat: 'hat_straw', outfit: 'armor_knight' })), portraitKey(wear({ disguise: 'dz_snowman' })));
  assert.notEqual(portraitKey(wear({ disguise: 'dz_snowman' })), portraitKey(wear({ disguise: 'dz_dino' })));
});

test('a picture is drawn once per key, kept, and the oldest go first', () => {
  let draws = 0; const p = new Portraits(s => { draws++; return PNG(s.gear.hat ?? 'bare'); }, 3);
  const first = p.get(boy, '1'); assert.ok(usablePicture(first));
  for (let i = 0; i < 10; i++) assert.equal(p.get({ ...boy, gear: {} }, '1'), first);
  assert.equal(draws, 1); assert.equal(p.renders, 1);
  p.get(wear({ hat: 'hat_straw' }), '1'); p.get(wear({ hat: 'hat_chef' }), '1'); assert.equal(draws, 3);
  p.get(boy, '1'); assert.equal(draws, 3, 'still kept, and now the newest');
  p.get(wear({ hat: 'hat_viking' }), '1'); assert.equal(draws, 4);
  assert.equal(p.peek(portraitKey(wear({ hat: 'hat_straw' }), '1')), undefined, 'the oldest was dropped');
  assert.equal(p.peek(portraitKey(boy, '1')), first);
});

test('a failed drawing is the fallback, and is not tried again for the same look', () => {
  for (const bad of [() => '', () => 'data:image/png;base64,AAAA', () => { throw new Error('context lost'); }]) {
    let draws = 0; const p = new Portraits(() => { draws++; return bad(); });
    assert.equal(p.get(boy, '1'), ''); assert.equal(p.get(boy, '1'), ''); assert.equal(draws, 1);
    assert.equal(p.get(boy, '11'), ''); assert.equal(draws, 2, 'new art is a new try');
  }
  assert.equal(usablePicture(PNG('x')), true); assert.equal(usablePicture(undefined), false); assert.equal(usablePicture('blob:x'), false);
});

test('the tile: the same look costs nothing; a new hat, disguise or look is one drawing each, at an idle moment', () => {
  const t = tile();
  t.view.want(boy, '110'); assert.equal(t.portraits.renders, 0, 'nothing is drawn in the call itself'); assert.deepEqual(t.shown, []);
  assert.equal(t.run(), 1); assert.equal(t.portraits.renders, 1); assert.equal(t.shown.length, 1);
  for (let i = 0; i < 50; i++) t.view.want({ ...boy, gear: { ...boy.gear } }, '110'); // the explorer rebuilt with nothing changed (a weapon swap, a try-on ending)
  assert.equal(t.queue.length, 0); assert.equal(t.portraits.renders, 1); assert.equal(t.shown.length, 1);
  const steps: PortraitSpec[] = [wear({ hat: 'hat_straw' }), wear({ hat: 'hat_wizard' }), wear({ disguise: 'dz_dino' }), wear({}, { look: 'girl-chibi-none-bare' })];
  steps.forEach((spec, i) => { t.view.want(spec, '111'); t.view.want(spec, '111'); assert.equal(t.run(), 1); assert.equal(t.portraits.renders, i + 2); assert.equal(t.shown.at(-1), PNG(portraitKey(spec))); });
  // Back to a look drawn before: shown at once, no drawing, no wait.
  t.view.want(wear({ hat: 'hat_straw' }), '111'); assert.equal(t.queue.length, 0); assert.equal(t.portraits.renders, 5); assert.equal(t.shown.at(-1), PNG(portraitKey(wear({ hat: 'hat_straw' }))));
});

test('the tile: quick changes while waiting make one drawing, of the last', () => {
  const t = tile();
  for (const hat of ['hat_straw', 'hat_chef', 'hat_viking']) t.view.want(wear({ hat }), '111');
  assert.equal(t.queue.length, 1); t.run();
  assert.equal(t.portraits.renders, 1); assert.deepEqual(t.shown, [PNG(portraitKey(wear({ hat: 'hat_viking' })))]);
});

test('the tile: a drawing waits out a fight, up to its patience', () => {
  let fighting = true; const t = tile({ busy: () => fighting, patience: 3 });
  t.view.want(wear({ hat: 'hat_straw' }), '111');
  for (let i = 0; i < 3; i++) { assert.equal(t.run(), 1); assert.equal(t.portraits.renders, 0, 'not during the fight'); assert.equal(t.queue[0].again, true); }
  fighting = false; t.run(); assert.equal(t.portraits.renders, 1); assert.equal(t.queue.length, 0);
  // A fight that never ends does not keep the old face for ever.
  fighting = true; t.view.want(wear({ hat: 'hat_chef' }), '111'); let turns = 0; while (t.run()) turns++;
  assert.equal(turns, 4); assert.equal(t.portraits.renders, 2);
});

test('the tile: no explorer file, or a picture that cannot be read back, shows the sprout icon', () => {
  const t = tile();
  t.view.want(null); assert.deepEqual(t.shown, ['']); assert.equal(t.queue.length, 0); assert.equal(t.portraits.renders, 0);
  t.view.want(null); assert.equal(t.shown.length, 1);
  t.view.want(boy, '110'); t.run(); assert.equal(t.shown.length, 2); assert.ok(t.shown[1]);
  t.view.want(null); assert.equal(t.shown.at(-1), ''); // e.g. the save was reset before the art came back
  t.view.want(boy, '110'); assert.equal(t.shown.at(-1), PNG(portraitKey(boy)), 'kept from before'); assert.equal(t.portraits.renders, 1);
  const broken = tile({ draw: () => '' });
  broken.view.want(boy, '110'); broken.run(); assert.deepEqual(broken.shown, ['']);
  broken.view.want(wear({ hat: 'hat_straw' }), '110'); broken.run(); assert.deepEqual(broken.shown, [''], 'the fallback is not put back twice');
});

test('the shot looks down at 30 degrees on the head, and a tall hat cannot shrink the face past the limit', () => {
  const hero = (hat?: [number, number]) => {
    const holder = new T.Group(), head = new T.Group(); head.name = 'head';
    const skull = new T.Mesh(new T.SphereGeometry(.6, 12, 8), new T.MeshBasicMaterial()); skull.name = 'baked'; skull.position.y = 1.6; head.add(skull);
    const body = new T.Mesh(new T.BoxGeometry(.8, 1, .8), new T.MeshBasicMaterial()); body.position.y = .5;
    if (hat) { const cone = new T.Mesh(new T.ConeGeometry(hat[0], hat[1], 8), new T.MeshBasicMaterial()); cone.name = 'hat_wizard@head_1'; cone.position.y = 2.1 + hat[1] / 2; head.add(cone); }
    holder.add(head, body); return holder;
  };
  const shoot = (holder: T.Group) => { const camera = new T.PerspectiveCamera(30, 2, .05, 60); aimPortrait(camera, holder); camera.updateMatrixWorld(true); return camera; };
  const bare = shoot(hero()), dir = bare.getWorldDirection(new T.Vector3());
  assert.ok(Math.abs(T.MathUtils.radToDeg(Math.asin(-dir.y)) - PORTRAIT.pitch) < .01, 'pitch'); assert.equal(PORTRAIT.pitch, 30);
  assert.ok(Math.abs(dir.x) < 1e-9 && dir.z < 0, 'from the front'); assert.equal(bare.aspect, 1); assert.equal(bare.fov, PORTRAIT.fov);
  // Where a point lands in the picture (-1..1 across and up).
  const at = (camera: T.PerspectiveCamera, x: number, y: number, z: number) => new T.Vector3(x, y, z).project(camera);
  const top = at(bare, 0, 2.2, 0), chin = at(bare, 0, 1.0, 0), feet = at(bare, 0, 0, 0);
  assert.ok(top.y < 1 && top.y > .2, `the crown is in frame (${top.y})`); assert.ok(chin.y > -1 && chin.y < 0, `so is the chin (${chin.y})`); assert.ok(feet.y < -1, 'the feet are not: it is a head shot');
  assert.ok(at(bare, 0, 1.6, 0).x < 0, 'the head sits left of centre, clear of the level badge');
  const head = (camera: T.PerspectiveCamera) => at(camera, 0, 2.2, 0).y - at(camera, 0, 1.0, 0).y;
  const small = shoot(hero([.5, .5])), tall = shoot(hero([.6, .7])), spire = shoot(hero([.7, 4]));
  assert.ok(at(small, 0, 2.6, 0).y < 1, 'a small hat is whole'); assert.ok(at(tall, 0, 2.8, 0).y < 1, 'so is a pointed one');
  assert.ok(head(tall) < head(bare), 'the frame grows for the hat');
  assert.ok(head(spire) > head(bare) * PORTRAIT.min / PORTRAIT.max * .97, 'but only so far'); assert.ok(at(spire, 0, 6, 0).y > 1, 'then the tip is cut, not the face');
  assert.ok(at(spire, 0, 1.0, 0).y > -1, 'the chin stays in');
});

test('the plate keeps its sprout as the stand-in, and nothing looks at the face per frame', () => {
  const main = read('main.ts'), css = read('hud-ours.css'), world = read('world.ts'), icons = read('icons.ts'), self = read('hero-portrait.ts');
  assert.match(main, /<button class="avatar" data-action="bag" aria-label="Open character and backpack"><span>\$\{hudIcon\('sprout'\)\}<\/span><img class="hero-pic" alt="" hidden draggable="false"><\/button>/);
  assert.match(css, /#app #hud \.avatar > \.hero-pic \{ display: none; \}/); assert.match(css, /#app #hud \.avatar\.has-face > span \{ display: none; \}/);
  assert.doesNotMatch(css.slice(css.indexOf('.avatar.has-face {'), css.indexOf('}', css.indexOf('.avatar.has-face {'))), /overflow|width|height|border/, 'the tile keeps its size, its border and its 44 px tap area');
  // The one place it is looked at: after the explorer is rebuilt. Not updateHud, not a frame listener.
  const wiring = main.slice(main.indexOf('const heroFace=mountHeroFace('), main.indexOf('\n', main.indexOf('world.refreshPlayer=()=>{rebuild();heroFace.sync();}')));
  assert.match(wiring, /spec:\(\)=>heroKit\.ready\?\{color:state\.color,look:lookOf\(state\),gear:state\.gear\}:null/); assert.match(wiring, /busy:\(\)=>world\.selected\?\.kind==='enemy'\|\|fightNear\(/);
  assert.equal(main.match(/heroFace\.sync\(\)/g)?.length, 2); assert.doesNotMatch(main, /frameListeners\.add\([^\n]*heroFace/);
  const hud = main.slice(main.indexOf('function updateHud('), main.indexOf('\nfunction ', main.indexOf('function updateHud(') + 10)); assert.doesNotMatch(hud, /heroFace|hero-pic/);
  // No further WebGL context: it draws on the item-icon renderer, and frees what it built (kit parts are shared and stay).
  assert.doesNotMatch(self, /WebGLRenderer|requestAnimationFrame/); assert.match(self, /modelShot\(/); assert.match(self, /dropTree\(child\)/);
  assert.equal(icons.match(/new T\.WebGLRenderer/g)?.length, 1);
  // 360 px and narrower hide the tile: nothing is drawn for it.
  assert.match(self, /if \(!tile \|\| getComputedStyle\(tile\)\.display === 'none'\) return;/);
  assert.match(world, /portraitAvatar\(color:string,gear:SaveState\['gear'\],look:string\)\{return this\.avatar\(color,\{hat:gear\.hat,outfit:gear\.outfit,disguise:gear\.disguise\},look\);\}/);
});
