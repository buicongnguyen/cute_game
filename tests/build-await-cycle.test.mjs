// A built chunk that awaits a lazy chunk at top level must not be imported back by that lazy chunk (promo/await-cycle.mjs).
// This shape left Vietnamese players with a blank page: i18n.ts awaits vi-pack, and the built vi-pack imported the chunk
// holding i18n.ts. The check runs on small fixtures always, and on dist/ when a build is there (the Pages build runs it too).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { awaitCycles, builtChunks, chunkFacts } from '../promo/await-cycle.mjs';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const AWAITS_PACK = 'let lang="vi";const load=()=>import("./pack.js");if(lang==="vi"){try{await load()}catch{}}export{lang as a};';

test('a chunk is read for its static imports, its import() calls and a top-level await', () => {
  assert.deepEqual(chunkFacts('import{a}from"./a.js";import"./b.js";export{c}from"./c.js";const d=()=>import("./d.js");'), { imports: ['./a.js', './b.js', './c.js'], dynamic: ['./d.js'], awaits: false });
  assert.equal(chunkFacts(AWAITS_PACK).awaits, true);
  assert.equal(chunkFacts('for await(const x of y){}').awaits, true);
  assert.equal(chunkFacts('const f=async()=>{await g()};async function h(){for await(const x of y){}}class K{async m(){await 1}}').awaits, false, 'an await inside a function is not top-level');
});

test('a lazy chunk that imports back the chunk awaiting it is reported', () => {
  // The failure of 2026-11: rules awaits vi-pack, vi-pack imports rules.
  const direct = awaitCycles(new Map([['assets/rules.js', AWAITS_PACK], ['assets/pack.js', 'import{a}from"./rules.js";export const P={}']]));
  assert.equal(direct.length, 1); assert.match(direct[0], /assets\/pack\.js imports assets\/rules\.js/);
  // Through a third chunk it is the same wait.
  const far = awaitCycles(new Map([['assets/rules.js', AWAITS_PACK], ['assets/pack.js', 'import"./mid.js";'], ['assets/mid.js', 'import{a}from"./rules.js";']]));
  assert.match(far[0], /assets\/pack\.js imports assets\/mid\.js imports assets\/rules\.js/);
});

test('the same graph without the way back, or without the top-level await, passes', () => {
  assert.deepEqual(awaitCycles(new Map([['assets/rules.js', 'import"./tables.js";' + AWAITS_PACK], ['assets/pack.js', 'import"./tables.js";export const P={}'], ['assets/tables.js', 'export const T=1']])), []);
  assert.deepEqual(awaitCycles(new Map([['assets/rules.js', 'export const load=()=>import("./pack.js");'], ['assets/pack.js', 'import{load}from"./rules.js";']])), [], 'an import() nobody awaits at top level cannot hang the start');
});

test('the build in dist/ has no top-level-await cycle', { skip: !existsSync(DIST + '/assets') && 'no build: run npm run build:pages' }, () => {
  const chunks = builtChunks(DIST);
  assert.deepEqual(awaitCycles(chunks), []);
  // The check must be looking at the real thing: the start awaits the Vietnamese pack somewhere.
  const awaiting = [...chunks].filter(([, text]) => { const fact = chunkFacts(text); return fact.awaits && fact.dynamic.some(s => /vi-pack/.test(s)); });
  assert.equal(awaiting.length, 1, 'one chunk awaits the Vietnamese pack at top level');
});
