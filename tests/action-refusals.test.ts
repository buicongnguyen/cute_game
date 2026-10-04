// "That action is not available." (user report): every refusal now says why in plain words (src/refusals.ts), the
// generic text is left for malformed intents only, and the helpers' own jobs never ask the rules for what they refuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import * as FH from '../src/farm-helper.ts';
import { applyGameAction, ActionError, MALFORMED_ACTION, isMalformedAction } from '../src/actions.ts';
import { REFUSALS } from '../src/refusals.ts';
import { setLanguage, t } from '../src/i18n.ts';

const T0 = Date.UTC(2026, 0, 6, 12); // midday UTC: no helper is on its break
const GENERIC_409 = 'That action is not available with your current progress.';
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });
/** The error an intent throws, or null when it went through. */
function refusal(s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0): ActionError | null {
  try { act(s, type, payload, now); return null; } catch (error) { assert.ok(error instanceof ActionError, `${type} threw ${error}`); return error; }
}
const reducerTypes = () => [...readFileSync(new URL('../src/actions.ts', import.meta.url), 'utf8').matchAll(/case '(\w+)':/g)].map(m => m[1]);
const fresh = () => { const s = M.newGame('Ann'); s.welcome = 'done'; s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: T0, gear: {}, home: true }]; return s; };

test('every intent the rules know has a plain-words refusal reason', () => {
  const types = reducerTypes(); assert.ok(types.length > 90, `found ${types.length} intents`);
  for (const type of types) assert.ok(Object.hasOwn(REFUSALS, type), `no refusal reason for '${type}'`);
});

test('every refusal reason is translated into Vietnamese', () => {
  const source = readFileSync(new URL('../src/refusals.ts', import.meta.url), 'utf8');
  const texts = new Set([...source.matchAll(/'((?:[A-Z]|\{name\})[^'\n]{6,})'/g)].map(m => m[1]).filter(x => / /.test(x)));
  assert.ok(texts.size > 80, `found ${texts.size} reasons`);
  setLanguage('vi');
  try { for (const text of texts) if (text !== GENERIC_409) assert.notEqual(t(text), text, `untranslated: ${text}`); }
  finally { setLanguage('en'); }
});

test('no intent on a new game, a broke game or a far planet answers with the generic text: a refusal names its reason', () => {
  const payloads: Record<string, unknown>[] = [{}, { index: 0, id: 'carrot', kind: 'chicken', uid: 1, slot: 'hat', friend: 'pepper', count: 1, toChest: true, pick: .5, x: 0, z: 0, paused: true, on: true, autoFeed: true, take: true }];
  const states = [fresh, () => { const s = fresh(); s.energy = 0; s.bag = {}; return s; }, () => { const s = fresh(); s.planet = 'lava'; s.level = 30; return s; }];
  let refusals = 0;
  for (const make of states) for (const type of reducerTypes()) for (const payload of payloads) {
    if (type === 'reset') continue;
    const error = refusal(make(), type, payload); if (!error) continue;
    if (isMalformedAction(error)) { assert.equal(error.status, 400); continue; }
    refusals++;
    assert.equal(error.status, 409, `${type}: ${error.message}`);
    assert.notEqual(error.message, GENERIC_409, `${type} ${JSON.stringify(payload)} refused without a reason`);
    assert.notEqual(error.message, MALFORMED_ACTION, `${type} refused with the malformed text`);
  }
  assert.ok(refusals > 100, `exercised ${refusals} refusals`);
  const unknown = refusal(fresh(), 'noSuchAction'); assert.ok(unknown && isMalformedAction(unknown), 'an unknown intent is malformed');
});

test('cause 1: the cook coming out of the cottage in a new game changes nothing and is not refused', () => {
  const s = fresh(); assert.equal(F.canChangeOutfit(s, 'pepper'), false, 'nothing in the bag to change into');
  assert.deepEqual(act(s, 'friendOutfit', { id: 'pepper', pick: .4 }), { changed: false });
  s.bag.hat_bear = 1; assert.equal(F.canChangeOutfit(s, 'pepper'), true);
  assert.deepEqual(act(s, 'friendOutfit', { id: 'pepper', pick: .4 }), { changed: true }); assert.equal(F.friendOf(s, 'pepper')!.gear.hat, 'hat_bear');
  assert.equal(F.canChangeOutfit(s, 'pepper'), false, 'already wearing the only hat');
  assert.match(refusal(M.newGame(), 'friendOutfit', { id: 'pepper', pick: .4 })!.message, /has not joined you yet/);
  assert.ok(isMalformedAction(refusal(s, 'friendOutfit', { id: 'pepper' })), 'a missing pick is a caller bug');
  const crew = readFileSync(new URL('../src/friend-crew.ts', import.meta.url), 'utf8');
  assert.match(crew, /canChangeOutfit\(this\.host\.own\(\), a\.id\)\) void this\.host\.perform/, 'the crew asks only when there is something to wear');
});

test('cause 2: Expand garden explains energy, the cap and away; the max-beds line is not a button', () => {
  const s = fresh(); s.energy = 0;
  assert.equal(refusal(s, 'buyBedKit')!.message, `You need ${M.gardenExpansionCost(s)} energy to expand the garden.`);
  while (s.plots.length < M.MAX_PLOTS) s.plots.push({ ...s.plots[0], crop: null });
  assert.equal(refusal(s, 'buyBedKit')!.message, `Your garden already has the maximum ${M.MAX_PLOTS} beds.`);
  const away = fresh(); away.planet = 'ice'; away.energy = 1e6; assert.match(refusal(away, 'buyBedKit')!.message, /belong at home/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /grow-max">🌱 Your garden has the maximum/, 'the cap is shown as a note');
  assert.doesNotMatch(main, /data-action="expand">🌱 Your garden has the maximum/);
});

test('cause 3: the pen robot looks again before acting, Clover leaves the robot\'s animal alone, and a raced job names its reason', () => {
  const s = M.newGame(); s.level = 30; s.energy = 100_000; s.farm.built = true; FH.buyFarmHelper(s); FH.setFarmHelperAutoFeed(s, true);
  const chick = M.buyAnimal(s, 'chicken', T0)!, other = M.buyAnimal(s, 'chicken', T0)!, now = M.adultAt(chick) + M.productDuration(chick) + 1000;
  assert.equal(FH.stillDue(s, { kind: 'collect', uid: chick.uid }, now), true);
  M.collectProducts(s, now, [chick.uid]); // the player (or Clover) got there first
  assert.equal(FH.stillDue(s, { kind: 'collect', uid: chick.uid }, now), false, 'the robot does not send a collect for an empty animal');
  const raced = refusal(s, 'farmHelperCollect', { uid: chick.uid }, now)!; assert.equal(raced.status, 409); assert.notEqual(raced.message, MALFORMED_ACTION);
  s.friends = [{ id: 'clover', role: 'farm', rescuedAt: T0, gear: {}, home: true }];
  const task = F.nextFriendTask(s, 'clover', M.PEN, now, undefined, undefined, other.uid);
  assert.ok(!task || !('uid' in task) || task.uid !== other.uid, 'Clover picks another animal than the robot\'s');
  assert.equal((F.nextFriendTask(s, 'clover', M.PEN, now) as { uid: number }).uid, other.uid, 'without the robot she takes it');
});

test('cause 4: a bigger pen out of reach is one reason, not a refusal plus a second toast', () => {
  const s = fresh(); s.farm.built = true; s.energy = 0;
  assert.equal(refusal(s, 'expandPen')!.message, `You need ${M.penExpandCost(s)} energy to make the pen bigger.`);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /perform\('expandPen'\)\)\{[^}]*\}\}?else toast/, 'no second toast after a refused expandPen');
});

test('review: eating healing food at full health, fertilizing a ripe crop and selling the last one name their reasons', () => {
  const s = fresh(); s.bag.potion = 1; s.bag.radish = 2;
  assert.equal(s.hp, M.maxHp(s));
  assert.equal(refusal(s, 'eat', { id: 'potion' })!.message, 'Your health is already full.');
  assert.equal(refusal(s, 'eat', { id: 'radish' })!.message, 'Your health is already full.');
  s.bag.spore = 2; act(s, 'plant', { index: 0, id: 'carrot' });
  assert.match(refusal(s, 'fertilize', { index: 0, id: 'spore' }, T0 + M.CROPS.carrot.duration + 1)!.message, /already ripe/);
  assert.equal(s.bag.spore, 2, 'nothing used');
  s.bag.radish = 0; assert.equal(refusal(s, 'sell', { id: 'radish', count: 1 })!.message, 'You have none of that left to sell.');
  assert.equal(refusal(s, 'transfer', { id: 'radish', count: 0, toChest: true })!.status, 409, 'a stale chest row is a reason, not malformed');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if\(item&&!item\.buff&&state\.hp>=M\.maxHp\(state\)\)\{toast\('Your health is already full\.'/, 'the bag\'s Use button explains itself');
});

test('review: the house chest only works at home', () => {
  const s = fresh(); s.planet = 'lava'; s.chest = { potion: 5 }; s.bag = { firecore: 3 } as M.Inventory;
  assert.match(refusal(s, 'transfer', { id: 'potion', toChest: false })!.message, /chest stands at home/);
  assert.match(refusal(s, 'transfer', { id: 'firecore', toChest: true })!.message, /chest stands at home/);
  assert.deepEqual(s.chest, { potion: 5 }); assert.equal(s.bag.potion, undefined);
  s.planet = 'home'; assert.equal(act(s, 'transfer', { id: 'potion', toChest: false }), 5); assert.equal(s.bag.potion, 5);
});

test('the client shows refusals and keeps malformed intents and the helpers\' own jobs off the screen', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if\(isMalformedAction\(error\)\)\{console\.warn/);
  assert.match(main, /function workPerform[^\n]*\{quiet:true\}\)/, 'helper jobs are quiet');
  assert.match(main, /perform:\(type,payload\)=>type==='rescueFriend'\?perform\(type,payload\):workPerform\(type,payload\)/, 'a rescue tap still explains a refusal');
});
