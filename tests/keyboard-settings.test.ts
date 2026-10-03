import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';

const now = 2_000_000_000_000;
const act = (state: M.SaveState, settings: unknown) => applyGameAction(state, {type: 'settings', payload: {settings}}, {now, random: () => .5});

test('old saves and invalid keyboard preferences retain the classic default', () => {
  const fresh = M.newGame();
  assert.equal(fresh.settings.keyboardLayout ?? 'classic', 'classic');
  for (const keyboardLayout of [undefined, null, '', 'WASD', 'arrows', 1, {}, []]) {
    const raw = {...fresh, settings: {...fresh.settings, keyboardLayout}};
    const loaded = M.parseSave(JSON.stringify(raw))!;
    assert.ok(loaded);
    assert.equal(loaded.settings.keyboardLayout, undefined);
    assert.equal(loaded.settings.keyboardLayout ?? 'classic', 'classic');
    assert.equal(loaded.settings.difficulty, 'easy');
  }
  const withoutSettings = {...fresh} as Partial<M.SaveState>; delete withoutSettings.settings;
  assert.equal(M.parseSave(JSON.stringify(withoutSettings))!.settings.keyboardLayout ?? 'classic', 'classic');
});

test('both keyboard layouts survive settings commands and save reloads without changing other preferences', () => {
  const state = M.newGame();
  state.settings = {sound: false, lowGraphics: true, movePad: true, joystickSide: 'left', difficulty: 'hard', difficultyLoweredAt: now - 1000};
  const preferences = {...state.settings};
  for (const keyboardLayout of ['wasd', 'classic'] as const) {
    assert.equal(act(state, {keyboardLayout}), true);
    assert.deepEqual(state.settings, {...preferences, keyboardLayout});
    assert.deepEqual(M.parseSave(JSON.stringify(state))!.settings, {...preferences, keyboardLayout});
  }
});

test('invalid keyboard actions preserve an existing selection while valid sibling settings still apply', () => {
  const state = M.newGame(); state.settings.keyboardLayout = 'wasd';
  for (const keyboardLayout of [undefined, null, '', 'WASD', 'arrows', 1, {}, []]) {
    assert.equal(act(state, {keyboardLayout, sound: false}), true);
    assert.equal(state.settings.keyboardLayout, 'wasd');
    assert.equal(state.settings.sound, false);
  }
  for (const settings of [null, 'classic', 1, []]) {
    assert.equal(act(state, settings), true);
    assert.equal(state.settings.keyboardLayout, 'wasd');
  }
});

test('a rejected difficulty change cannot partially switch keyboard layout', () => {
  const state = M.newGame();
  state.settings = {...state.settings, keyboardLayout: 'classic', difficulty: 'hard', difficultyLoweredAt: now - 1000};
  const before = structuredClone(state);
  assert.throws(() => act(state, {keyboardLayout: 'wasd', difficulty: 'easy', sound: false}), {status: 400});
  assert.deepEqual(state, before);
  assert.equal(act(state, {keyboardLayout: 'wasd'}), true, 'the difficulty cooldown does not block changing controls');
  assert.equal(state.settings.keyboardLayout, 'wasd');
  assert.equal(state.settings.difficulty, 'hard');
  assert.equal(state.settings.difficultyLoweredAt, before.settings.difficultyLoweredAt);
});
