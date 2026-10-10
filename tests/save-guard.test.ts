import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveGuard, SUPPORTED_CONTENT, SUPPORTED_VERSION, backupKeys, savedAtOf, type StorageLike } from '../src/save-guard.ts';
import { newGame, parseSave } from '../src/model.ts';
import { restoreRowHtml } from '../src/save-guard-ui.ts';
import { setLanguage, t } from '../src/i18n.ts';

const KEY = 'cute-game-save-v1';
function memory(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data, get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, String(v)); }, removeItem: k => { data.delete(k); },
  };
}
const saveAt = (savedAt: number) => JSON.stringify({ ...newGame('Mia'), savedAt });

test('the guard knows the save format this build writes', () => {
  const s = newGame();
  assert.equal(s.version, SUPPORTED_VERSION);
  assert.equal(s.contentVersion, SUPPORTED_CONTENT);
  assert.equal(savedAtOf(saveAt(1234)), 1234);
});

test('an unreadable save is copied aside before anything can overwrite it, and only the last three copies stay', () => {
  const raw = '{"version":1,"name":"Mia","level":9';
  const storage = memory({ [KEY]: raw });
  let clock = 1000;
  const guard = new SaveGuard(storage, () => clock++);
  const result = guard.load(KEY, parseSave);
  assert.equal(result.status, 'corrupt');
  assert.equal(result.state, null);
  assert.equal(storage.getItem(result.backup!), raw, 'the raw text is kept byte for byte');
  assert.deepEqual(guard.notices, ['corrupt']);
  assert.equal(guard.frozen, null, 'saving may go on: the old text is safe in the copy');
  // Loading the same unreadable text again does not pile up identical copies.
  new SaveGuard(storage, () => clock++).load(KEY, parseSave);
  assert.equal(backupKeys(storage, KEY).length, 1);
  for (let i = 0; i < 5; i++) { storage.setItem(KEY, raw + i); new SaveGuard(storage, () => clock++).load(KEY, parseSave); }
  const kept = backupKeys(storage, KEY);
  assert.equal(kept.length, 3);
  assert.equal(storage.getItem(kept[0]), raw + 4, 'newest first');
});

test('a full browser store freezes saving instead of erasing a save that could not be copied', () => {
  const storage = memory({ [KEY]: '{broken' });
  const full = { ...storage, setItem: () => { throw new Error('quota'); } };
  const guard = new SaveGuard(full);
  guard.load(KEY, parseSave);
  assert.equal(guard.frozen, 'corrupt-unsaved');
  assert.equal(guard.canWrite(KEY), false);
});

test('a save from a newer build is never overwritten', () => {
  const newer = JSON.stringify({ ...newGame('Mia'), version: 2 });
  const storage = memory({ [KEY]: newer });
  const guard = new SaveGuard(storage);
  assert.equal(guard.load(KEY, parseSave).status, 'newer');
  assert.equal(guard.frozen, 'newer');
  assert.equal(guard.canWrite(KEY), false);
  assert.equal(storage.getItem(KEY), newer);
  const content = JSON.stringify({ ...newGame('Mia'), contentVersion: SUPPORTED_CONTENT + 1 });
  const guard2 = new SaveGuard(memory({ [KEY]: content }));
  guard2.load(KEY, parseSave);
  assert.equal(guard2.frozen, 'newer', 'newer content counts too');
});

test('two tabs: the tab that did not save last stops writing and the active tab keeps its progress', () => {
  const storage = memory({ [KEY]: saveAt(100) });
  const a = new SaveGuard(storage), b = new SaveGuard(storage);
  a.load(KEY, parseSave); b.load(KEY, parseSave);
  assert.equal(a.canWrite(KEY), true);
  storage.setItem(KEY, saveAt(200)); a.wrote(KEY, 200); // tab A saves
  let told = 0; b.onChange = () => { told++; };
  assert.equal(b.canWrite(KEY), false, 'tab B sees newer progress and refuses');
  assert.equal(b.frozen, 'stale'); assert.equal(told, 1);
  assert.equal(b.canWrite(KEY), false);
  assert.equal(savedAtOf(storage.getItem(KEY)), 200, 'nothing of B reached the store');
  assert.equal(a.canWrite(KEY), true, 'tab A can keep saving');
  storage.setItem(KEY, saveAt(300)); a.wrote(KEY, 300);
  assert.equal(a.canWrite(KEY), true);
});

test('the storage event freezes the stale tab at once, even before it tries to save', () => {
  const storage = memory({ [KEY]: saveAt(100) });
  const b = new SaveGuard(storage); b.load(KEY, parseSave);
  b.external({ key: 'something-else', newValue: saveAt(900) }, KEY);
  assert.equal(b.frozen, null);
  b.external({ key: KEY, newValue: saveAt(50) }, KEY);
  assert.equal(b.frozen, null, 'an older value is not news');
  b.external({ key: KEY, newValue: saveAt(900) }, KEY);
  assert.equal(b.frozen, 'stale');
});

test('a first save in an empty store, and a tab whose save was cleared elsewhere', () => {
  const storage = memory();
  const a = new SaveGuard(storage); a.load(KEY, parseSave);
  assert.equal(a.canWrite(KEY), true);
  storage.setItem(KEY, saveAt(500)); a.wrote(KEY, 500);
  storage.removeItem(KEY); // another tab started a new story or the player cleared data
  assert.equal(a.canWrite(KEY), false);
});

test('restore puts the newest backup back and blocks this tab from undoing it', () => {
  const storage = memory({ [KEY]: '{broken' });
  const guard = new SaveGuard(storage); guard.load(KEY, parseSave);
  storage.setItem(KEY, saveAt(10));
  assert.equal(guard.hasBackup(KEY), true);
  assert.equal(guard.restore(KEY), true);
  assert.equal(storage.getItem(KEY), '{broken');
  assert.equal(guard.canWrite(KEY), false);
  assert.equal(new SaveGuard(memory()).restore(KEY), false);
});

test('the Restore backup row shows only with a backup and speaks Vietnamese', () => {
  const none = new SaveGuard(memory());
  assert.equal(restoreRowHtml(none, KEY), '');
  const guard = new SaveGuard(memory({ [KEY]: '{broken' })); guard.load(KEY, parseSave);
  assert.match(restoreRowHtml(guard, KEY), /Restore backup/);
  setLanguage('vi');
  try {
    assert.match(restoreRowHtml(guard, KEY), /Khôi phục bản sao lưu/);
    for (const s of ['Open in another tab', 'Your old save could not be read', 'This save is from a newer version']) assert.notEqual(t(s), s);
  } finally { setLanguage('en'); }
});
