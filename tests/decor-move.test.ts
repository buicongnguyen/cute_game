// Moving placed decorations and garden beds (src/decor-move.ts; owner's ask 2026-10-15): the shared rules, the actions
// the server replays, the save shape, the tap menu's wiring in main.ts and its Vietnamese.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import { applyGameAction, ACTION_RULES_VERSION } from '../src/actions.ts';
import { refusalReason } from '../src/refusals.ts';
import * as D from '../src/decor-move.ts';
import { DECOR_VI } from '../src/locales/vi-decor.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { t, localizeHtml, setLanguage } from '../src/i18n.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

const act = (s: M.SaveState, type: string, payload: Record<string, unknown>) => applyGameAction(s, { type, payload }, { now: Date.now(), random: () => .5 });
/** A home with a Little volcano at (5, 5) and a lamp at (8, 5). */
function garden() {
  const s = M.newGame('Mover'); M.addItem(s, 'deco_volcano'); M.addItem(s, 'deco_lamp');
  assert.ok(M.placeDecoration(s, 'deco_volcano', 5, 5, 0)); assert.ok(M.placeDecoration(s, 'deco_lamp', 8, 5, Math.PI / 2));
  return s;
}
const uidOf = (s: M.SaveState, id: string) => s.decorations.find(d => d.id === id)!.uid;
/** A free spot for bed `i` at least 3 m from where it stands (scanned, so layout changes do not break the test). */
function freeBedSpot(s: M.SaveState, i: number, rotation = 0) {
  const at = M.bedPosition(s, i);
  for (let x = -15; x <= 15; x += .5) for (let z = -15; z <= 15; z += .5) if (Math.hypot(x - at.x, z - at.z) > 3 && M.bedSpotOk(s, x, z, rotation, i)) return { x, z };
  throw new Error('no free bed spot');
}

test('a move starts at the item\'s own spot and turn, and nothing moves away from home', () => {
  const s = garden(), volcano = uidOf(s, 'deco_volcano'), lamp = uidOf(s, 'deco_lamp');
  assert.deepEqual(D.moveStart(s, { kind: 'decor', uid: volcano }), { id: 'deco_volcano', name: M.ITEMS.deco_volcano.name, x: 5, z: 5, rotation: 0 });
  assert.equal(D.moveStart(s, { kind: 'decor', uid: lamp })!.rotation, Math.PI / 2);
  const bed = D.moveStart(s, { kind: 'bed', index: 0 })!, at = M.bedPosition(s, 0);
  assert.deepEqual(bed, { id: 'plot_kit', name: 'Garden bed', x: at.x, z: at.z, rotation: 0 }, 'a bed moves with the bed-kit ghost');
  assert.equal(D.moveStart(s, { kind: 'decor', uid: 'decor-404' }), null);
  assert.equal(D.moveStart(s, { kind: 'bed', index: 99 }), null);
  s.planet = 'candy';
  assert.equal(D.moveStart(s, { kind: 'decor', uid: volcano }), null);
  assert.equal(D.moveStart(s, { kind: 'bed', index: 0 }), null);
});

test('the move spot rule is the placement rule without the item\'s own old spot', () => {
  const s = garden(), volcano = uidOf(s, 'deco_volcano'), target = { kind: 'decor', uid: volcano } as const;
  // Nudging the volcano half a metre: placing a new one there is refused (the volcano itself stands there), moving it is fine.
  assert.equal(M.decorSpotOk(s, 5.5, 5), false);
  assert.equal(D.moveSpotOk(s, target, 5.5, 5, 0), true);
  assert.equal(D.moveSpotOk(s, target, 8, 5.2, 0), false, 'on top of the lamp');
  assert.equal(D.moveSpotOk(s, target, 40, 0, 0), false, 'outside the fence');
  assert.equal(D.moveSpotOk(s, target, M.PEN.x, M.PEN.z, 0), false, 'inside the animal yard');
  assert.equal(D.moveSpotOk(s, target, M.bedPosition(s, 0).x, M.bedPosition(s, 0).z, 0), false, 'on a bed');
  // A bed: its own square never blocks it, its neighbours do.
  const bed = { kind: 'bed', index: 0 } as const, at = M.bedPosition(s, 0), next = M.bedPosition(s, 1);
  assert.equal(M.bedSpotOk(s, at.x, at.z), false); assert.equal(D.moveSpotOk(s, bed, at.x, at.z, 0), true);
  assert.equal(D.moveSpotOk(s, bed, next.x, next.z, 0), false);
});

test('Move saves the new spot and turn through moveDecoration; ✕ leaves the save alone; Turn turns it 45° in place', () => {
  const s = garden(), volcano = uidOf(s, 'deco_volcano'), before = structuredClone(s);
  const intent = D.moveIntent({ kind: 'decor', uid: volcano }, 4, 9, Math.PI / 4);
  assert.deepEqual(intent, { type: 'moveDecoration', payload: { uid: volcano, x: 4, z: 9, rotation: Math.PI / 4 } });
  act(s, intent.type, intent.payload);
  assert.deepEqual(s.decorations.find(d => d.uid === volcano), { uid: volcano, id: 'deco_volcano', x: 4, z: 9, rotation: Math.PI / 4 });
  assert.deepEqual(s.bag, before.bag, 'nothing goes to or comes from the bag');
  assert.equal(s.decorations.length, 2);
  const turn = D.turnIntent(s, volcano)!;
  assert.deepEqual(turn, { type: 'moveDecoration', payload: { uid: volcano, x: 4, z: 9, rotation: Math.PI / 2 } });
  act(s, turn.type, turn.payload); assert.equal(s.decorations.find(d => d.uid === volcano)!.rotation, Math.PI / 2);
  // Eight turns come all the way round.
  for (let i = 0; i < 8; i++) { const next = D.turnIntent(s, volcano)!; act(s, next.type, next.payload); }
  assert.ok(Math.abs(s.decorations.find(d => d.uid === volcano)!.rotation - Math.PI / 2) < 1e-9);
  assert.equal(D.turnIntent(s, 'decor-404'), null);
});

test('refused moves change nothing and say why: a taken spot, away from home, a decoration that is gone', () => {
  const s = garden(), volcano = uidOf(s, 'deco_volcano'), before = structuredClone(s);
  assert.throws(() => act(s, 'moveDecoration', { uid: volcano, x: 8, z: 5, rotation: 0 }), (error: Error) => error.message === 'That spot is taken. Choose a free spot.');
  assert.throws(() => act(s, 'moveDecoration', { uid: 'decor-404', x: 2, z: 2, rotation: 0 }));
  assert.throws(() => act(s, 'moveDecoration', { uid: volcano, x: 2, z: 2, rotation: 'left' }), 'a malformed turn');
  assert.deepEqual(s, before);
  s.planet = 'candy'; const away = structuredClone(s);
  assert.throws(() => act(s, 'moveDecoration', { uid: volcano, x: 2, z: 2, rotation: 0 }), (error: Error) => error.message === 'Return to your garden at home first.');
  assert.throws(() => act(s, 'moveBed', { index: 0, x: 2, z: 2, rotation: 0 }), (error: Error) => error.message === 'Return to your garden at home first.');
  assert.deepEqual(s, away);
  // Pack away with a full bag: the item stays placed and the toast says why (it used to say "already gone").
  const full = garden(); full.bag.deco_volcano = Number.MAX_SAFE_INTEGER;
  assert.equal(refusalReason('removeDecoration', full, { uid: uidOf(full, 'deco_volcano') }, Date.now()), M.BAG_FULL);
  assert.equal(refusalReason('removeDecoration', full, { uid: 'decor-404' }, Date.now()), 'That decoration is already gone.');
});

test('a bed moves with its growing crop: crop, planting time, growing time and progress all stay', () => {
  const s = M.newGame('Gardener'), now = Date.now();
  Object.assign(s.plots[2], { crop: 'carrot', plantedAt: now - 4000, growDuration: 60_000, generation: 'g-test' });
  const crop = structuredClone(s.plots[2]), progress = M.cropProgress(s.plots[2], now), spot = freeBedSpot(s, 2);
  act(s, 'moveBed', { index: 2, x: spot.x, z: spot.z, rotation: 0 });
  assert.deepEqual(M.bedPosition(s, 2), spot);
  const moved = s.plots[2];
  for (const key of ['crop', 'plantedAt', 'growDuration', 'generation'] as const) assert.equal(moved[key], crop[key], key);
  assert.equal(M.cropProgress(moved, now), progress);
  assert.equal('rotation' in moved, false, 'an unturned bed saves no rotation, like a newly placed one');
  // Turned, then moved without a turn: it keeps its turn. Back to square on: the key goes again.
  const turned = freeBedSpot(s, 2, Math.PI / 4);
  act(s, 'moveBed', { index: 2, x: turned.x, z: turned.z, rotation: Math.PI / 4 }); assert.equal(s.plots[2].rotation, Math.PI / 4);
  const again = freeBedSpot(s, 2, Math.PI / 4);
  assert.equal(M.moveBed(s, 2, again.x, again.z), true); assert.equal(s.plots[2].rotation, Math.PI / 4);
  assert.equal(M.moveBed(s, 2, again.x, again.z, 0), true); assert.equal('rotation' in s.plots[2], false);
  // Onto another bed, onto a trail, into the pen: refused, nothing changes.
  const before = structuredClone(s), other = M.bedPosition(s, 0);
  assert.throws(() => act(s, 'moveBed', { index: 2, x: other.x, z: other.z, rotation: 0 }), (error: Error) => error.message === 'That spot is taken. Choose a free spot.');
  assert.equal(M.moveBed(s, 2, 0, 6), false); assert.equal(M.moveBed(s, 2, M.PEN.x, M.PEN.z), false); assert.equal(M.moveBed(s, 2, 1.5, NaN), false);
  assert.deepEqual(s, before);
});

test('the save shape is unchanged and old saves load: moved items round-trip through parseSave', () => {
  const s = garden(), volcano = uidOf(s, 'deco_volcano'), spot = freeBedSpot(s, 0);
  act(s, 'moveDecoration', { uid: volcano, x: 3.5, z: 9.25, rotation: Math.PI / 4 });
  act(s, 'moveBed', { index: 0, x: spot.x, z: spot.z, rotation: 0 });
  const back = M.parseSave(JSON.stringify(s))!;
  assert.deepEqual(back.decorations, s.decorations);
  assert.deepEqual(Object.keys(back.decorations[0]).sort(), ['id', 'rotation', 'uid', 'x', 'z'], 'no new decoration fields');
  assert.deepEqual(M.bedPosition(back, 0), spot);
  assert.deepEqual(Object.keys(s.plots[0]).sort(), ['crop', 'plantedAt', 'x', 'z'], 'no new bed fields');
  // A decoration from an old save without a turn loads at 0 and can be moved and turned like any other.
  const old = JSON.parse(JSON.stringify(s)); delete old.decorations[1].rotation;
  const loaded = M.parseSave(JSON.stringify(old))!, lamp = loaded.decorations[1];
  assert.equal(lamp.rotation, 0);
  act(loaded, 'moveDecoration', { uid: lamp.uid, x: 8, z: 7 });
  const after = loaded.decorations[1];
  assert.deepEqual([after.x, after.z, after.rotation], [8, 7, 0], 'a move without a turn keeps the old one');
});

test('the tap menu sits over the item and stays on screen', () => {
  const box = { w: 300, h: 100 }, view = { w: 390, h: 844 };
  assert.deepEqual(D.menuSpot({ x: 195, y: 400 }, box, view), { x: 45, y: 288 }, 'centred above');
  assert.deepEqual(D.menuSpot({ x: 10, y: 400 }, box, view), { x: 8, y: 288 }, 'kept off the left edge');
  assert.deepEqual(D.menuSpot({ x: 385, y: 400 }, box, view), { x: 82, y: 288 }, 'kept off the right edge');
  assert.deepEqual(D.menuSpot({ x: 195, y: 60 }, box, view), { x: 45, y: 96 }, 'below the item when there is no room above');
  assert.deepEqual(D.menuSpot({ x: 800, y: 450 }, box, { w: 1600, h: 900 }), { x: 650, y: 338 });
  const html = D.menuHtml(M.ITEMS.deco_volcano.name, '🌋', s => s);
  assert.deepEqual([...html.matchAll(/data-decor="(\w+)"/g)].map(m => m[1]), ['close', 'move', 'turn', 'pack']);
  assert.ok(D.MENU_REACH >= 3 && D.MENU_REACH <= 6, 'the menu belongs to a decoration next to the explorer');
  assert.ok(D.MENU_GUARD_MS >= 250, 'the finger that opened the menu cannot press a button by landing');
});

test('main.ts: a tap on a decoration opens the menu, the Decor rows and bed panels offer Move, and ✕ / Esc put the item back', async () => {
  const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /else if\(e\.kind==='decoration'\)decorMenu\.open\(/, 'world.onInteract (a tap, or F / Interact next to it) opens the menu');
  assert.match(main, /if\(visiting&&e\.kind!=='travel'&&e\.kind!=='plot'\)\{toast\(/, 'visitors only look: the visiting guard runs first');
  for (const action of ['move-decor', 'turn-decor', 'remove-decor', 'move-bed']) assert.match(main, new RegExp(`case '${action}':`), action);
  assert.match(main, /usable:\(\)=>started&&!visiting&&!modal&&!placement&&!flight&&state\.planet==='home'/);
  assert.match(main, /function cancelPlacement\(\)\{[^\n]*if\(world\.lifted\)world\.liftPlaced\(null\);\}/, 'cancel (✕, Esc) sets a lifted item down where it was');
  assert.match(main, /if\(event\.key==='Escape'\)\{if\(placement\)cancelPlacement\(\);/, 'Esc cancels a move on a PC');
  assert.match(main, /placement\.ok=move\?moveSpotOk\(state,move,[^)]*\)&&\(move\.kind==='bed'\|\|!world\.blocked\(/, 'a decoration also asks the world\'s obstacles');
  const world = await readFile(new URL('../src/world.ts', import.meta.url), 'utf8');
  assert.match(world, /if\(this\.lifted\?\.kind==='decor'&&this\.lifted\.uid===d\.uid\)\{g\.visible=false;continue;\}/, 'a lifted decoration neither shows nor blocks');
  assert.match(world, /e\.kind==='plot'&&e\.index!==lifted/, 'a lifted bed leaves the instanced beds');
});

// The Decor panel itself, rendered by the real main.ts function (as tests/main-locale.test.mjs does).
async function decorPanel(s: M.SaveState) {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'decorations')!.getText(ast);
  const panels: { title: string; html: string }[] = [], esc = (v: string) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const ctx = vm.createContext({ M, t, esc, state: s, art: (id: string, icon: string) => icon, mini: (id: string) => M.ITEMS[id].icon ?? '✨', openDialog: (_type: string, title: string, html: string) => panels.push({ title: t(title), html: localizeHtml(html) }) });
  vm.runInContext(ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\ndecorations();', ctx);
  return panels[0].html;
}

test('the Decor panel lists each placed decoration with Move, Turn and Pack away, in English and Vietnamese', async () => {
  const s = garden(), uids = s.decorations.map(d => d.uid);
  try {
    setLanguage('en');
    const html = await decorPanel(s);
    for (const uid of uids) for (const action of ['move-decor', 'turn-decor', 'remove-decor']) assert.match(html, new RegExp(`data-action="${action}" data-id="${uid}"`), `${action} ${uid}`);
    assert.match(html, />Move</); assert.match(html, />Pack away</); assert.match(html, /aria-label="Turn"/); assert.match(html, /Tip: tap a decoration/);
    setLanguage('vi');
    const vi = await decorPanel(s);
    assert.match(vi, />Di chuyển</); assert.match(vi, />Cất vào ba lô</); assert.match(vi, /aria-label="Xoay"/); assert.match(vi, /Mẹo: chạm vào đồ trang trí/);
    assert.doesNotMatch(vi, />(Move|Pack away)</);
    assert.equal(t('{item} moved.', { item: t('Garden bed') }), 'Đã di chuyển Luống đất.');
    assert.equal(t('Move bed'), 'Di chuyển luống');
  } finally { setLanguage('en'); }
});

test('every new string has Vietnamese in the pack, and the menu reads Vietnamese', () => {
  for (const [en, vi] of Object.entries(DECOR_VI)) { assert.equal(VI_PACK[en], vi, en); assert.notEqual(vi, en); assert.equal(vi, vi.normalize('NFC'), en); }
  for (const en of ['Move', 'Turn', 'Pack away', 'Close', 'Garden bed', ': tap the garden to choose a spot', 'That spot is taken. Choose a free spot.']) assert.ok(VI_PACK[en], en);
  try { setLanguage('vi'); const html = D.menuHtml(M.ITEMS.deco_volcano.name, '🌋', s => s); assert.match(html, /Di chuyển/); assert.match(html, /Xoay/); assert.match(html, /Cất vào ba lô/); assert.doesNotMatch(html, /Move|Turn|Pack away/); }
  finally { setLanguage('en'); }
});

// The server: moveDecoration / moveBed pass the same gate as placeDecoration (own garden, not visiting) and the shared rules.
async function server(t: { after(fn: () => Promise<void>): void }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-decor-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = garden(); M.addItem(profile, 'deco_lamp');
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile });
  let peer: Record<string, unknown> = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer });
  const command = async (type: string, payload: Record<string, unknown> = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  return { store, command, set peer(value: Record<string, unknown>) { peer = value; }, uid: (id: string) => uidOf(profile, id) };
}

test('the server validates moves like placement: own garden only, never while visiting, free spots only', async t => {
  const f = await server(t), volcano = f.uid('deco_volcano');
  const placed = await f.command('placeDecoration', { id: 'deco_lamp', x: 5, z: 8, rotation: 0 });
  assert.equal(placed.profile.decorations.length, 3, 'placing still works');
  const moved = await f.command('moveDecoration', { uid: volcano, x: 2, z: 10, rotation: Math.PI / 4 });
  assert.deepEqual(moved.profile.decorations.find((d: M.Decoration) => d.uid === volcano), { uid: volcano, id: 'deco_volcano', x: 2, z: 10, rotation: Math.PI / 4 });
  const stored = (await f.store.get('alice')).profile.decorations.find((d: M.Decoration) => d.uid === volcano);
  assert.deepEqual([stored.x, stored.z, stored.rotation], [2, 10, Math.PI / 4], 'the move is saved on the account');
  await assert.rejects(f.command('moveDecoration', { uid: volcano, x: 8, z: 5, rotation: 0 }), /That spot is taken/);
  const spot = freeBedSpot((await f.store.get('alice')).profile, 1);
  const bed = await f.command('moveBed', { index: 1, x: spot.x, z: spot.z, rotation: 0 });
  assert.deepEqual(M.bedPosition(bed.profile, 1), spot);
  // Visiting a friend: the same refusal as placing there.
  f.peer = { active: true, planet: 'home', room: 'home:bob', visit: 'bob', pose: { x: 0, z: 0 } };
  for (const [type, payload] of [['placeDecoration', { id: 'deco_lamp', x: 2, z: 6, rotation: 0 }], ['moveDecoration', { uid: volcano, x: 3, z: 10, rotation: 0 }], ['moveBed', { index: 1, x: spot.x, z: spot.z + .5, rotation: 0 }], ['removeDecoration', { uid: volcano }]] as const)
    await assert.rejects(f.command(type, payload), /Return to your own garden first/, type);
  const after = (await f.store.get('alice')).profile;
  assert.deepEqual([after.decorations.find((d: M.Decoration) => d.uid === volcano).x, M.bedPosition(after, 1)], [2, spot], 'nothing moved while visiting');
});
