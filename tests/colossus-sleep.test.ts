import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });

test('the well lid is remembered and starts raised', async () => {
  const lid = await import('../src/colossus-sleep.ts');
  assert.equal(lid.colossusSleeps(), false);
  lid.setColossusSleeps(true);
  assert.equal(lid.colossusSleeps(), true);
  assert.equal(store.get('zoo-colossus-sleeps'), '1');
  lid.setColossusSleeps(false);
  assert.equal(lid.colossusSleeps(), false);
  assert.equal(store.get('zoo-colossus-sleeps'), '0');
});
