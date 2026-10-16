import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { promptLabel, PromptFocus, PROMPT_VERBS, PROMPT_SHOW_S, PROMPT_HIDE_S, PROMPT_SWITCH_M } from '../src/action-prompt.ts';
import { PROMPT_VI } from '../src/locales/vi-prompt.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

const thing = (kind: string, name = 'Thing', icon = '✨') => ({ kind, name, icon });

test('the button says what it does: a verb and an icon per kind, a bed by its state, an unknown kind by its own name', () => {
  assert.deepEqual(promptLabel(thing('home', 'Your cottage')), { icon: '🚪', text: 'Enter cottage' });
  assert.deepEqual(promptLabel(thing('craft', 'Workshop')), { icon: '🔨', text: 'Open workshop' });
  assert.deepEqual(promptLabel(thing('chest')), { icon: '📦', text: 'Open chest' });
  assert.deepEqual(promptLabel(thing('plot'), { plot: 'empty' }), { icon: '🌱', text: 'Plant a seed' });
  assert.deepEqual(promptLabel(thing('plot'), { plot: 'growing' }), { icon: '🌿', text: 'Check crop' });
  assert.deepEqual(promptLabel(thing('plot'), { plot: 'ripe' }), { icon: '🌾', text: 'Harvest crop' });
  assert.deepEqual(promptLabel(thing('enemy', 'Slime')), { icon: '⚔️', text: 'Attack {name}' });
  assert.deepEqual(promptLabel(thing('animal'), { ready: true }), { icon: '🥚', text: 'Collect produce' });
  assert.deepEqual(promptLabel(thing('pen', 'Animal pen site')), { icon: '🔨', text: 'Build animal pen' });
  assert.deepEqual(promptLabel(thing('house-use', 'Sofa', '🛋️'), { verb: { icon: '🛋️', text: 'Sit with friends' } }), { icon: '🛋️', text: 'Sit with friends' });
  assert.deepEqual(promptLabel(thing('something-new', 'Odd stone', '🪨')), { icon: '🪨', text: '{name}' }, 'fallback: its own icon and name');
  assert.deepEqual(promptLabel(thing('toString')), { icon: '✨', text: '{name}' }, 'no prototype keys');
});

test('every kind the world can put in reach has a verb', () => {
  // Kinds added with addEntity('kind', ...) anywhere in src, plus the environment nodes (environments.ts node('kind', ...)).
  const src = new URL('../src/', import.meta.url), kinds = new Set<string>();
  for (const f of readdirSync(src)) if (f.endsWith('.ts')) { const s = readFileSync(new URL(f, src), 'utf8'); for (const m of s.matchAll(/(?:addEntity\(|\badd\((?='house-)|\bnode\()'([a-z][a-z-]*)'/g)) kinds.add(m[1]); }
  const known = new Set(['plot', 'house-use']), missing = [...kinds].filter(k => !Object.hasOwn(PROMPT_VERBS, k) && !known.has(k));
  assert.deepEqual(missing, []);
  assert.ok(kinds.has('home') && kinds.has('craft') && kinds.has('fruit'), `the scan found the kinds (${kinds.size})`);
});

test('every label has Vietnamese, in the shipped pack', () => {
  const texts = new Set([...Object.values(PROMPT_VERBS).map(v => v[1]), ...['empty', 'growing', 'ripe'].map(p => promptLabel(thing('plot'), { plot: p as 'empty' })).map(l => l.text), 'Collect produce', 'Build animal pen']);
  for (const en of texts) { assert.ok(VI_PACK[en] && VI_PACK[en] !== en, en); }
  for (const [en, vi] of Object.entries(PROMPT_VI)) { assert.equal(VI_PACK[en], vi, en); if (en.includes('{name}')) assert.ok(vi.includes('{name}'), en); }
});

test('the button waits a moment before showing, holds a moment after, and does not hop between neighbours', () => {
  const f = new PromptFocus<{ id: string; d: number }>(), a = { id: 'a', d: 1 }, b = { id: 'b', d: 1.3 }, c = { id: 'c', d: 0 };
  let reach = new Set([a, b]);
  const step = (dt: number, cand: typeof a | null) => f.step(dt, cand, e => reach.has(e), e => e.d);
  assert.equal(step(.13, a), null, 'the first tick only notices it');
  assert.equal(step(.13, a), a, `shown after ${PROMPT_SHOW_S}s`);
  // Walking along: b becomes the game's nearest by a little; the button keeps a.
  a.d = 1.4; assert.equal(step(.13, b), a, `kept while less than ${PROMPT_SWITCH_M} m nearer`);
  c.d = a.d - PROMPT_SWITCH_M - .1; reach.add(c); assert.equal(step(.13, c), c, 'clearly nearer: it takes over');
  // c goes out of reach while b is in reach: hand over at once.
  reach.delete(c); assert.equal(step(.13, b), b);
  // Everything out of reach: held for PROMPT_HIDE_S, then gone.
  reach = new Set(); assert.equal(step(.13, null), b, 'held'); assert.equal(step(PROMPT_HIDE_S, null), null, 'then hidden');
  // Walking past something in one tick never shows it.
  assert.equal(step(.13, a), null); assert.equal(step(.13, null), null); assert.equal(step(.13, a), null, 'starts waiting again');
  f.reset(); assert.equal(f.target, null);
});
