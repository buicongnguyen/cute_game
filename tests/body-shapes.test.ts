// Man and Woman bodies, the boy/girl shaping from Teen up, the neck of the Tall and Grown heights, and arms that hang
// from the shoulder (build_hero_styles.py, looks.ts SHAPE, walk-cycle.ts armSwing, arm-fit.ts). Measured on the GLBs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { FIT, OPTIONS, ROWS, SHAPE, bodyFile, fitOf, lookOf, parseLooks, shapeFit, toLook, type FileBody, type Height } from '../src/looks.ts';
import { ARM, applyGait, armOf, armSwing, limbsOf, newGait } from '../src/walk-cycle.ts';
import { handDrop } from '../src/arm-fit.ts';
import { PUNCH, stretchFor } from '../src/punch-wind.ts';
import { makeCast } from '../src/bot-logic.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

type Node = { name?: string; mesh?: number; children?: number[]; translation?: number[] };
function glb(file: string) {
  const data = readFileSync(new URL(`../public/assets/models/${file}`, import.meta.url)), doc = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
  const nodes: Node[] = doc.nodes, parent = new Map<number, number>(); nodes.forEach((n, i) => n.children?.forEach(c => parent.set(c, i)));
  const index = (name: string) => nodes.findIndex(n => n.name === name);
  const at = (i: number): T.Vector3 => (parent.has(i) ? at(parent.get(i)!) : new T.Vector3()).add(new T.Vector3(...(nodes[i].translation ?? [0, 0, 0])));
  const box = (name: string) => { const i = index(name), b = new T.Box3(), o = at(i); for (const p of doc.meshes[nodes[i].mesh!].primitives) { const a = doc.accessors[p.attributes.POSITION]; b.expandByPoint(new T.Vector3(...a.min).add(o)); b.expandByPoint(new T.Vector3(...a.max).add(o)); } return b; };
  const tris = doc.meshes.reduce((n: number, m: { primitives: { indices: number }[] }) => n + m.primitives.reduce((k, p) => k + doc.accessors[p.indices].count / 3, 0), 0) as number;
  return { index, at: (name: string) => at(index(name)), local: (name: string) => new T.Vector3(...(nodes[index(name)].translation ?? [0, 0, 0])), box, tris, meshes: doc.meshes.length as number };
}
const FILE_BODIES: FileBody[] = ['boy', 'girl', 'man', 'woman'], SHAPED: Height[] = ['teen', 'tall', 'grown'];
const act = (s: M.SaveState, type: string, payload: Record<string, unknown>) => applyGameAction(s, { type, payload }, { now: 1e9, random: () => .5 });

test('Man and Woman are free bodies of the mirror: worn at once, combined with owned heights, saved and loaded; old looks still load', () => {
  assert.deepEqual(ROWS.body, ['boy', 'girl', 'man', 'woman', 'sturdy', 'slim']);
  assert.equal(OPTIONS.man.price, 0); assert.equal(OPTIONS.woman.price, 0);
  const s = M.newGame(); delete (s as { looks?: unknown }).looks; s.energy = 500;
  assert.ok(act(s, 'wearLook', { id: 'man-chibi-none-bare' })); assert.equal(lookOf(s), 'man-chibi-none-bare'); assert.equal(s.energy, 500, 'free');
  assert.throws(() => act(s, 'wearLook', { id: 'woman-grown-none-bare' }), 'the Grown height is still bought');
  assert.ok(act(s, 'buyLook', { id: 'woman-grown-none-bare' })); assert.equal(s.energy, 500 - OPTIONS.grown.price);
  assert.ok(act(s, 'wearLook', { id: 'man-grown-none-bare' }), 'an owned height dresses every body');
  const back = M.parseSave(JSON.stringify(s))!; assert.equal(lookOf(back), 'man-grown-none-bare');
  assert.deepEqual(parseLooks({ owned: [], style: 'woman-tall-none-bare' }), undefined, 'a height not owned is not worn');
  for (const old of ['tall', 'catboy', 'girl-tall-cat', 'sturdy-grown-none-bare', 'slim-teen-bunny-fox']) assert.ok(toLook(old), old);
  assert.equal(bodyFile('man', 'chibi'), 'hero-man.glb'); assert.equal(bodyFile('woman', 'grown'), 'hero-woman-grown.glb'); assert.equal(bodyFile('sturdy', 'tall'), 'hero-tall.glb'); assert.equal(bodyFile('slim', 'chibi'), 'hero-girl.glb');
  assert.equal(VI_PACK['Man'], 'Đàn ông'); assert.equal(VI_PACK['Woman'], 'Phụ nữ');
});

test('tiny and chibi boys and girls are untouched; a body costs no more draws and at most 1% more triangles (the neck)', () => {
  const hero = glb('hero.glb');
  for (const b of FILE_BODIES) for (const h of ROWS.height as Height[]) {
    const g = glb(bodyFile(b, h)), base = glb(bodyFile(b === 'man' ? 'boy' : b === 'woman' ? 'girl' : b, 'chibi'));
    assert.equal(g.meshes, 7, `${b}-${h}: one mesh per part plus head-leaf`);
    assert.ok(g.tris - base.tris === (h === 'tall' || h === 'grown' ? 32 : 0), `${b}-${h}: ${g.tris} triangles (its chibi ${base.tris})`);
  }
  assert.equal(hero.tris, 3304); assert.equal(glb('hero-girl.glb').tris, 3804);
  assert.deepEqual(shapeFit('boy', 'tiny'), FIT.tiny); assert.deepEqual(shapeFit('girl', 'chibi'), FIT.chibi); assert.deepEqual(fitOf('man-chibi-none-bare'), {}, 'the chibi man keeps the default pivots');
});

test('from Teen up he is broader at the shoulders than the hips and she has a waist; the difference grows with height, and Man and Woman are a step stronger', () => {
  // Widths across the body file: shoulders = over both arms, torso = the body mesh, legs' pivots = the hips.
  const span = (b: FileBody, h: Height) => { const g = glb(bodyFile(b, h)); return g.box('arm-right').max.x - g.box('arm-left').min.x; };
  let last = 0;
  for (const h of SHAPED) {
    const ratio = span('boy', h) / span('girl', h); assert.ok(ratio > last + .03, `${h}: his shoulders are ${ratio.toFixed(2)} of hers (more than at the height before)`); last = ratio;
    assert.ok(span('man', h) > span('boy', h) && span('woman', h) < span('girl', h), `${h}: the adults are a step further apart`);
    assert.ok(glb(bodyFile('man', h)).box('head').max.y > glb(bodyFile('boy', h)).box('head').max.y + .015, `${h}: the man stands a little taller`);
  }
  assert.ok(last > 1.2 && last < 1.45, `grown: his shoulders are ${last.toFixed(2)} of hers: clear, not a caricature`);
  for (const h of ['tall', 'grown'] as Height[]) assert.ok(glb(bodyFile('girl', h)).box('head').max.y < glb(bodyFile('boy', h)).box('head').max.y - .01, `${h}: she is a little shorter`);
  // The strengths mirror the generator's, and the gear fit follows them.
  assert.deepEqual(SHAPE.boy.strength, { teen: .35, tall: .7, grown: 1 }); assert.deepEqual(SHAPE.woman.strength, { teen: .5, tall: .9, grown: 1.2 });
  const man = fitOf('man-grown-none-bare'), woman = fitOf('woman-grown-none-bare');
  assert.ok(man.body!.scale[0] > FIT.grown.body!.scale[0] * 1.1 && woman.body!.scale[0] === FIT.grown.body!.scale[0], 'his torso gear grows with his chest, hers keeps its size');
  assert.ok(man['arm-left']!.scale[0] > woman['arm-left']!.scale[0] * 1.2, 'arm gear follows the arms');
  assert.ok(Math.abs(man['leg-left']!.offset[1] + .9) < 1e-9 && Math.abs(woman['leg-left']!.offset[1] + .8) < 1e-9, 'boots ride the hips: his 0.06 higher, hers 0.04 lower');
  assert.ok(woman.tail && woman.tail.offset[2] < 0 && !man.tail, 'a tail sits on the back of her wider skirt');
});

test('Tall and Grown have a neck: the chin clears the collar, the neck is one piece with the head and reaches into the torso; total height is unchanged', () => {
  for (const b of FILE_BODIES) for (const [h, least] of [['tall', .05], ['grown', .08]] as [Height, number][]) {
    const g = glb(bodyFile(b, h)), head = g.box('head'), body = g.box('body'), chin = g.at('head').y - .12 * FIT[h].head!.scale[0];
    assert.ok(chin - body.max.y > least - .03, `${b}-${h}: the chin is ${(chin - body.max.y).toFixed(3)} above the top of the torso`);
    assert.ok(head.min.y < body.max.y - .04, `${b}-${h}: the neck (head part) reaches ${(body.max.y - head.min.y).toFixed(3)} into the torso, so a nod opens no crack`);
  }
  for (const h of ['tiny', 'chibi', 'teen'] as Height[]) { const g = glb(bodyFile('boy', h)); assert.ok(g.at('head').y - .12 * (FIT[h].head?.scale[0] ?? 1) < g.box('body').max.y, `${h} stays neckless`); }
  const top = (h: Height) => glb(bodyFile('boy', h)).box('head-leaf').max.y / glb('hero.glb').box('head-leaf').max.y; // to the tip of the sprout, as HEIGHT_RATIO is measured
  assert.ok(Math.abs(top('tall') - 1.152) < .004 && Math.abs(top('grown') - 1.287) < .004, `the boy stands as tall as before the neck: tall ${top('tall').toFixed(3)}, grown ${top('grown').toFixed(3)}`);
});

test('arms hang from the shoulder: the cap stays under the top of the torso, the hand is where the sleeve map puts gloves, and long arms swing less', () => {
  for (const b of FILE_BODIES) for (const h of SHAPED) {
    const g = glb(bodyFile(b, h)), arm = g.box('arm-left'), body = g.box('body');
    assert.ok(arm.max.y <= body.max.y + .005, `${b}-${h}: the shoulder cap (${arm.max.y.toFixed(3)}) does not stand above the torso (${body.max.y.toFixed(3)})`);
    const stretch = fitOf(`${b}-${h}-none-bare`)['arm-left']!.scale[1];
    assert.ok(Math.abs(handDrop(stretch) + g.local('hand-left').y) < .002, `${b}-${h}: gloves land on the hand (${handDrop(stretch).toFixed(3)} under the shoulder)`);
  }
  assert.ok(glb('hero-grown.glb').at('arm-left').y - glb('hero-grown.glb').local('hand-left').y * -1 > 1.3, 'the grown hand hangs at about mid-thigh (hips 1.36)');
  assert.deepEqual(armSwing(), { swing: .8, splay: .3, ease: 0 }); assert.deepEqual(armSwing(ARM), { swing: .8, splay: .3, ease: 0 });
  const grown = armSwing(.745), tall = armSwing(.437);
  assert.ok(Math.abs(grown.swing - .42) < 1e-9 && grown.splay === .2 && tall.swing < .8 && tall.swing > grown.swing);
  assert.ok(.745 * Math.sin(grown.swing) < .36 * Math.sin(.8) * 1.25, 'the long arm\'s hand sweeps about what the short arm\'s did');
  // The punch: the default arm stretches 2.4 x as ever; a long arm only reaches as far as that fist did (0.864), never a plank.
  assert.equal(stretchFor(PUNCH.stretch, .36), PUNCH.stretch); assert.equal(stretchFor(1, .745), 1);
  for (const arm of [.4084, .437, .745]) assert.ok(Math.abs(stretchFor(PUNCH.stretch, arm) * arm - .36 * PUNCH.stretch) < 1e-9, `arm ${arm}: the fist is out ${(stretchFor(PUNCH.stretch, arm) * arm).toFixed(3)}`);
  assert.ok(stretchFor(PUNCH.stretch, .745) < 1.2 && stretchFor(1.7, .745) > 1 && stretchFor(1.7, .745) < stretchFor(2.4, .745));
  // The shared gait (friends, other explorers): the default arm is unchanged, a long arm swings less and leans forward.
  const model = (drop: number) => { const m = new T.Group(); for (const n of ['leg-left', 'leg-right', 'arm-left', 'arm-right']) { const p = new T.Group(); p.name = n; m.add(p); if (n === 'arm-right') { const hand = new T.Object3D(); hand.name = 'hand-right'; hand.position.y = -drop; p.add(hand); } } return m; };
  const g = newGait(); g.blend = 1; g.phase = Math.PI / 2;
  const short = model(.36), long = model(.745); applyGait(limbsOf(short), g, .5); applyGait(limbsOf(long), g, .5);
  assert.equal(armOf(short), .36); assert.equal(armOf(long), .745);
  assert.ok(Math.abs(short.getObjectByName('arm-right')!.rotation.x - .55) < 1e-9 && Math.abs(short.getObjectByName('arm-left')!.rotation.x + .55) < 1e-9, 'default arms: 1.1 x the legs, as ever');
  assert.ok(Math.abs(long.getObjectByName('arm-right')!.rotation.x - (.55 * .42 / .8 - .1)) < 1e-9);
});

test('AI neighbours wear bodies from the builder: grown-ups among the rich, the same for the same seed', () => {
  for (const seed of [1, 2, 3, 7, 1234]) for (const bot of makeCast(seed)) {
    assert.ok(toLook(bot.look), `${bot.name}: ${bot.look}`);
    if (bot.tier === 'rich') assert.match(bot.look, /^(man|woman|sturdy|slim)-(tall|grown)-/);
  }
  assert.deepEqual(makeCast(7).map(b => b.look), makeCast(7).map(b => b.look));
  assert.ok([1, 2, 3, 4, 5, 6].some(seed => makeCast(seed).some(b => /^(man|woman)-/.test(b.look))), 'men and women walk the village');
});
