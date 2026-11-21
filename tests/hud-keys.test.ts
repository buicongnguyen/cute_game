// The desktop keyboard guide's memory (src/hud-keys.ts, AAA plan WP16): open for a new player; it folds itself once, after
// the first planting, three minutes of play or thirty game keys, whichever comes first; a choice made by hand is final.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KeysGuide, guideFolded, readGuide, KEYS_LEARNED, KEYS_PLAY_MS, KEYS_GUIDE_KEY } from '../src/hud-keys.ts';

function fresh(saved?: string) {
  const store = new Map<string, string>(saved ? [[KEYS_GUIDE_KEY, saved]] : []);
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as Storage;
  const root = { innerHTML: '', classList: { toggle() {} } } as unknown as HTMLElement;
  return { guide: new KeysGuide(root, storage), storage, root };
}

test('an empty store starts open, and the limits are the ones the plan names', () => {
  const { guide, storage } = fresh();
  assert.deepEqual(readGuide(storage), { mode: 'auto', uses: 0, ms: 0 });
  assert.equal(guideFolded(guide.memory), false);
  assert.equal(KEYS_LEARNED, 30); assert.equal(KEYS_PLAY_MS, 180_000);
  guide.render('wasd', 'en', 'jump', undefined, true);
  assert.match((guide as unknown as { root: { innerHTML: string } }).root.innerHTML, /<dl>/, 'the rows are drawn for a new player');
});

test('it folds after the first planting, and the device remembers', () => {
  const { guide, storage } = fresh();
  for (let i = 0; i < 5; i++) guide.used();
  assert.equal(guideFolded(guide.memory), false);
  guide.planted();
  assert.equal(guideFolded(guide.memory), true);
  assert.equal(guideFolded(readGuide(storage)), true, 'saved at once');
  assert.equal(readGuide(storage).mode, 'auto', 'it folded itself: no hand choice was made');
});

test('it folds after thirty game keys', () => {
  const { guide, storage } = fresh();
  for (let i = 0; i < KEYS_LEARNED - 1; i++) guide.used();
  assert.equal(guideFolded(guide.memory), false, '29 keys: still open');
  guide.used();
  assert.equal(guideFolded(guide.memory), true);
  assert.equal(guideFolded(readGuide(storage)), true);
});

test('it folds after three minutes of play; pauses and the title screen do not count', () => {
  const { guide, storage } = fresh();
  guide.played(KEYS_PLAY_MS - 1000);
  assert.equal(guideFolded(guide.memory), false);
  guide.played(999);
  assert.equal(guideFolded(guide.memory), false, '2:59.999');
  guide.played(1);
  assert.equal(guideFolded(guide.memory), true);
  assert.equal(guideFolded(readGuide(storage)), true);
  // The clock inside render(): only frames of a started game count, and a long gap (a hidden tab) counts as one second at most.
  const b = fresh(); let now = 1000; const clock = () => now;
  b.guide.render('wasd', 'en', 'jump', undefined, false, clock); now += 60_000; b.guide.render('wasd', 'en', 'jump', undefined, false, clock);
  assert.equal(b.guide.memory.ms, 0, 'the title screen is not play');
  b.guide.render('wasd', 'en', 'jump', undefined, true, clock); now += 120; b.guide.render('wasd', 'en', 'jump', undefined, true, clock);
  assert.equal(b.guide.memory.ms, 120);
  now += 600_000; b.guide.render('wasd', 'en', 'jump', undefined, true, clock);
  assert.equal(b.guide.memory.ms, 1120, 'a ten-minute gap is one second of play');
  // Play time is kept across visits (saved every ten seconds).
  const c = fresh(); c.guide.played(25_000);
  assert.ok(readGuide(c.storage).ms >= 20_000, `saved along the way (${readGuide(c.storage).ms})`);
});

test('a hand choice is final: reopened it stays open, folded it stays folded', () => {
  const { guide, storage } = fresh();
  guide.planted(); assert.equal(guideFolded(guide.memory), true);
  guide.toggle(); assert.equal(readGuide(storage).mode, 'open');
  guide.planted(); for (let i = 0; i < 100; i++) guide.used(); guide.played(KEYS_PLAY_MS * 2);
  assert.equal(guideFolded(guide.memory), false, 'opened by hand: planting, keys and time no longer fold it');
  guide.toggle(); assert.equal(readGuide(storage).mode, 'closed'); assert.equal(guideFolded(guide.memory), true);
  // A new player who folds it by hand before any limit keeps it folded.
  const b = fresh(); b.guide.toggle(); assert.equal(readGuide(b.storage).mode, 'closed');
  // A memory written by the older build (no play time) still reads, and a broken one starts fresh.
  assert.deepEqual(readGuide(fresh('{"mode":"auto","uses":12}').storage), { mode: 'auto', uses: 12, ms: 0 });
  assert.deepEqual(readGuide(fresh('{bad').storage), { mode: 'auto', uses: 0, ms: 0 });
  assert.equal(guideFolded(readGuide(fresh('{"mode":"auto","uses":120}').storage)), true, 'a player who had learned the keys under the old rule keeps the guide folded');
});
