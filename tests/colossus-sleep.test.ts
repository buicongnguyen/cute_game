import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });

test('the well lid has three lids plus Automatic, remembered; an explicit choice rules at any level', async () => {
  const lid = await import('../src/colossus-sleep.ts');
  assert.equal(lid.colossusChoice(), null, 'nothing stored: the player never chose');
  lid.setColossusLid('soothed');
  assert.equal(lid.colossusSoothed(1), true); assert.equal(lid.colossusSleeps(1), false, 'chosen below 20: the choice rules');
  assert.equal(store.get('zoo-colossus-sleeps'), 'soothed');
  lid.setColossusLid('asleep');
  assert.equal(lid.colossusSleeps(40), true); assert.equal(lid.colossusSoothed(40), false);
  lid.setColossusLid('nonsense' as never);
  assert.equal(lid.colossusChoice(), null, 'anything else is Automatic, never the full-strength giant');
  assert.equal(lid.colossusLid(3), 'asleep');
  assert.equal(lid.SOOTHE_FACTOR, 50);
});

test('the first version’s saved "1" still means asleep', async () => {
  store.set('zoo-colossus-sleeps', '1');
  const lid = await import('../src/colossus-sleep.ts?again');
  assert.equal(lid.colossusLid(30), 'asleep');
});

test('the automatic rule (never chose, or chose Automatic): asleep below level 20, soothed from 20 on, never wild unasked (FIX-PLAN 4.6)', async () => {
  store.clear();
  const lid = await import('../src/colossus-sleep.ts?unchosen');
  const L = lid.COLOSSUS_LEVEL; assert.equal(L, 20);
  assert.equal(lid.lidFor(1, null), 'asleep'); assert.equal(lid.lidFor(L - 1, null), 'asleep');
  assert.equal(lid.lidFor(L, null), 'soothed'); assert.equal(lid.lidFor(60, null), 'soothed', 'stays soothed until the player chooses');
  assert.equal(lid.lidFor(L - 5, 'wild'), 'wild', 'chose wild is not never chose');
  assert.equal(lid.colossusChoice(), null); assert.equal(lid.colossusSleeps(5), true); assert.equal(lid.colossusSoothed(30), true);
  lid.setColossusLid('wild'); assert.equal(lid.colossusLid(5), 'wild');
  lid.setColossusLid('auto'); assert.equal(lid.colossusChoice(), null, 'Automatic brings the rule back'); assert.equal(store.get('zoo-colossus-sleeps'), 'auto');
  assert.equal(lid.colossusLid(5), 'asleep'); assert.equal(lid.colossusLid(25), 'soothed');
});

test('the Colossus honours the rule: the event, the sky and the badge, and online below 20 no badge or News', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.killedDay !== clock\.day && this\.lid\(clock\.day\) !== 'asleep'/, 'asleep: no event, so no sky and no wake-up News');
  assert.match(src, /else if \(!online && this\.lid\(clock\.day\) !== 'asleep'\)/, 'asleep: no badge');
  assert.match(src, /online && this\.h\.state\(\)\.level < COLOSSUS_LEVEL\) mode = 'none'/, 'online under 20: no badge');
  assert.match(main, /if\(before<COLOSSUS_LEVEL&&after>=COLOSSUS_LEVEL\)inbox\.announce\(\{kind:'other',icon:'🌋',title:'The Colossus stirs…'/, 'one News entry at 20');
  assert.match(main, /'Sleeping until level \{need\} \(you are level \{level\}\)\.'/, 'the well shows the rule');
  assert.match(main, /pick\('well-auto','🌙','Automatic'/, 'a fourth choice, Automatic, lit while the rule is on');
  assert.match(main, /case 'well-auto':setColossusLid\('auto'\)/);
  const wb = readFileSync(new URL('../src/welcome-back.ts', import.meta.url), 'utf8');
  assert.match(wb, /if \(s\.level >= COLOSSUS_LEVEL\)/, 'the daily card says nothing about it below 20');
});
