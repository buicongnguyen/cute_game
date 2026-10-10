import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });

test('the well lid has three settings, remembered, and starts wild', async () => {
  const lid = await import('../src/colossus-sleep.ts');
  assert.equal(lid.colossusLid(), 'wild');
  lid.setColossusLid('soothed');
  assert.equal(lid.colossusSoothed(), true); assert.equal(lid.colossusSleeps(), false);
  assert.equal(store.get('zoo-colossus-sleeps'), 'soothed');
  lid.setColossusLid('asleep');
  assert.equal(lid.colossusSleeps(), true); assert.equal(lid.colossusSoothed(), false);
  lid.setColossusLid('nonsense' as never);
  assert.equal(lid.colossusLid(), 'wild');
  assert.equal(lid.SOOTHE_FACTOR, 50);
});

test('the first version’s saved "1" still means asleep', async () => {
  store.set('zoo-colossus-sleeps', '1');
  const lid = await import('../src/colossus-sleep.ts?again');
  assert.equal(lid.colossusLid(), 'asleep');
});
