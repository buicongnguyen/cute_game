import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });

test('the well lid has three settings, remembered; an explicit choice rules at any level', async () => {
  const lid = await import('../src/colossus-sleep.ts');
  assert.equal(lid.colossusChoice(), null, 'nothing stored: the player never chose');
  lid.setColossusLid('soothed');
  assert.equal(lid.colossusSoothed(1), true); assert.equal(lid.colossusSleeps(1), false, 'chosen below 20: the choice rules');
  assert.equal(store.get('zoo-colossus-sleeps'), 'soothed');
  lid.setColossusLid('asleep');
  assert.equal(lid.colossusSleeps(40), true); assert.equal(lid.colossusSoothed(40), false);
  lid.setColossusLid('nonsense' as never);
  assert.equal(lid.colossusChoice(), 'wild', 'anything else is an explicit "let it wake"');
  assert.equal(lid.colossusLid(3), 'wild');
  assert.equal(lid.SOOTHE_FACTOR, 50);
});

test('the first version’s saved "1" still means asleep', async () => {
  store.set('zoo-colossus-sleeps', '1');
  const lid = await import('../src/colossus-sleep.ts?again');
  assert.equal(lid.colossusLid(30), 'asleep');
});

test('never chose: asleep below level 20, the first day at 20 comes soothed, then wild (FIX-PLAN 4.6)', async () => {
  store.clear();
  const lid = await import('../src/colossus-sleep.ts?unchosen');
  const L = lid.COLOSSUS_LEVEL; assert.equal(L, 20);
  assert.equal(lid.lidFor(1, null, null), 'asleep'); assert.equal(lid.lidFor(L - 1, null, null), 'asleep');
  assert.equal(lid.lidFor(L, null, null, '7'), 'soothed', 'the first event after reaching 20');
  assert.equal(lid.lidFor(L, null, '7', '7'), 'soothed', 'all that day');
  assert.equal(lid.lidFor(L, null, '7', '8'), 'wild', 'after that the old default, until the player chooses');
  assert.equal(lid.lidFor(L - 5, 'wild', null), 'wild', 'chose wild is not never chose');
  assert.equal(lid.lidFor(L + 5, 'asleep', '7', '9'), 'asleep');
  // The module's own state: only a day at level 20 or more without a choice is noted, once.
  assert.equal(lid.colossusSleeps(5), true);
  lid.noteColossusDay(5, '3'); assert.equal(store.get('zoo-colossus-first'), undefined, 'below 20 nothing is noted');
  lid.noteColossusDay(L, '4'); lid.noteColossusDay(L, '5'); assert.equal(store.get('zoo-colossus-first'), '4');
  assert.equal(lid.colossusLid(L, '4'), 'soothed'); assert.equal(lid.colossusLid(L, '5'), 'wild');
});

test('the Colossus honours the rule: the event, the sky and the badge, and online below 20 no badge or News', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.killedDay !== clock\.day && this\.lid\(clock\.day\) !== 'asleep'/, 'asleep: no event, so no sky and no wake-up News');
  assert.match(src, /else if \(!online && this\.lid\(clock\.day\) !== 'asleep'\)/, 'asleep: no badge');
  assert.match(src, /online && this\.h\.state\(\)\.level < COLOSSUS_LEVEL\) mode = 'none'/, 'online under 20: no badge');
  assert.match(src, /noteColossusDay\(this\.h\.state\(\)\.level, String\(this\.day\)\)/);
  assert.match(main, /if\(before<COLOSSUS_LEVEL&&after>=COLOSSUS_LEVEL\)inbox\.announce\(\{kind:'other',icon:'🌋',title:'The Colossus stirs…'/, 'one News entry at 20');
  assert.match(main, /'Sleeping until level \{need\} \(you are level \{level\}\)\.'/, 'the well shows the rule');
  const wb = readFileSync(new URL('../src/welcome-back.ts', import.meta.url), 'utf8');
  assert.match(wb, /if \(s\.level >= COLOSSUS_LEVEL\)/, 'the daily card says nothing about it below 20');
});
