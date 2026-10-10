// The Vietnamese text that used to sit next to the English in the shared content modules now lives only in the lazy
// Vietnamese pack (src/locales). tests/fixtures/vi-snapshot.json was generated from the commit before the move
// (a95618c): the whole VI_PACK and every moved table as key -> Vietnamese. Nothing a Vietnamese player reads may change,
// and English players' modules may not carry Vietnamese letters any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { CTF_VI } from '../src/locales/vi-ctf.ts';
import { DUNGEON_VI } from '../src/locales/vi-dungeon.ts';
import { RESCUE_VI } from '../src/locales/vi-rescue.ts';
import { COLOSSUS_VI } from '../src/locales/vi-colossus.ts';
import { TITAN_VI } from '../src/locales/vi-titan.ts';
import { BOSS_PET_VI } from '../src/locales/vi-boss-pets.ts';
import { CHAT_VI } from '../src/locales/vi-bot-chat.ts';
import { BOT_LINE_PAIRS } from '../src/locales/vi-bot-lines.ts';
import { FRIEND_MORE_VI } from '../src/locales/vi-friend-lines-more.ts';
import { HELP_TOPICS_VI } from '../src/locales/vi-help-topics.ts';
import { VI_MOBILE } from '../src/locales/vi-mobile.ts';

const snapshot = JSON.parse(readFileSync(new URL('./fixtures/vi-snapshot.json', import.meta.url), 'utf8')) as { pack: Record<string, string>; tables: Record<string, Record<string, string>> };
const plain = (table: Record<string, string>) => ({ ...table });

test('every moved Vietnamese table equals the snapshot taken before the move', () => {
  const moved: Record<string, Record<string, string>> = { CTF_VI, DUNGEON_VI, RESCUE_VI, COLOSSUS_VI, TITAN_VI, BOSS_PET_VI, CHAT_VI, BOT_LINE_PAIRS, FRIEND_MORE_VI, HELP_VI: HELP_TOPICS_VI };
  for (const [name, expected] of Object.entries(snapshot.tables)) {
    if (name === 'MOBILE_SUPPORT_VI') continue;
    assert.ok(moved[name], name + ' has a new home');
    // Later features may append strings to a table; every snapshot entry keeps its text and its place.
    const now = plain(moved[name]), keys = Object.keys(expected);
    for (const key of keys) assert.equal(now[key], expected[key], `${name}: ${key}`);
    assert.deepEqual(Object.keys(now).slice(0, keys.length), keys, name + ' keeps its key order');
  }
});

test('the phone full-screen helper strings come from the pack with the exact Vietnamese they had', () => {
  for (const [en, vi] of Object.entries(snapshot.tables.MOBILE_SUPPORT_VI)) assert.equal(VI_PACK[en], vi, en);
  for (const [en, vi] of Object.entries(VI_MOBILE)) assert.equal(snapshot.tables.MOBILE_SUPPORT_VI[en], vi, en);
});

test('the whole Vietnamese pack is unchanged: same keys, same text (plus the full-screen helper strings, which used to be inline)', () => {
  // Every string of the snapshot is still there with the same text, in the same order; later features may only ADD strings
  // (the endgame story fillers), never change or drop one.
  const now = plain(VI_PACK), expected = { ...snapshot.pack, ...snapshot.tables.MOBILE_SUPPORT_VI } as Record<string, string>;
  for (const [key, value] of Object.entries(expected)) assert.equal(now[key], value, `changed or missing: ${key}`);
  const added = Object.keys(now).filter(key => !(key in expected));
  assert.ok(added.length < 80, `unexpected growth of the pack: ${added.length} new strings`);
});

// Vietnamese letters: Latin-1 and Latin Extended accents plus the Latin Extended Additional block (all the tone marks).
const VIETNAMESE = /[À-ÖØ-öø-ʯḀ-ỿ]/;
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
test('the shared (English) content modules hold no Vietnamese text', () => {
  const files = ['content', 'ctf-content', 'dungeon-content', 'rescue-content', 'colossus-content', 'titan-content', 'boss-pet-content', 'bot-lines', 'bot-chat', 'friend-lines-more', 'help-topics'].map(name => `../src/${name}.ts`);
  files.push('../src/mobile-game-support.mjs');
  for (const file of files) {
    const code = stripComments(readFileSync(new URL(file, import.meta.url), 'utf8'));
    const line = code.split('\n').find(l => VIETNAMESE.test(l));
    assert.equal(line, undefined, `${file} still has Vietnamese: ${line?.slice(0, 80)}`);
  }
});
