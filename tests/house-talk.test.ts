import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TALK, PERSONA_TALK, EXCHANGES, TalkBag, lineFor, exchangeFor, ageOf } from '../src/house-talk.ts';
import { VI_HOUSE_TALK } from '../src/locales/vi-house-talk.ts';
import { ROOMS } from '../src/house.ts';

test('every room has at least 8 kid lines and 8 grown-up lines, all distinct, each with Vietnamese', () => {
  const all: string[] = [];
  for (const room of ROOMS) for (const age of ['kid', 'grown'] as const) { const pool = ROOM_TALK[room.id][age]; assert.ok(pool.length >= 8, `${room.id} ${age}`); all.push(...pool); }
  for (const p of Object.values(PERSONA_TALK)) all.push(...p.kid, ...p.grown);
  for (const x of Object.values(EXCHANGES)) for (const [a, b] of x) all.push(a, b);
  assert.equal(new Set(all).size, all.length, 'no line written twice');
  for (const line of all) { assert.ok(VI_HOUSE_TALK[line], `vi: ${line}`); assert.notEqual(VI_HOUSE_TALK[line], line); }
  for (const room of ROOMS) assert.ok(EXCHANGES[room.id].length >= 2, room.id);
});

test('small friends talk like kids, grown friends like grown-ups, with their own lines mixed in', () => {
  assert.equal(ageOf(0), 'kid'); assert.equal(ageOf(1), 'grown'); assert.equal(ageOf(2), 'grown');
  const bag = new TalkBag(); let own = 0;
  for (let i = 0; i < 200; i++) {
    const line = lineFor(bag, { room: 'kitchen', stage: 0, role: 'cook' });
    assert.ok(ROOM_TALK.kitchen.kid.includes(line) || PERSONA_TALK.cook.kid.includes(line), line);
    if (PERSONA_TALK.cook.kid.includes(line)) own++;
    assert.ok(![...ROOM_TALK.kitchen.grown, ...PERSONA_TALK.cook.grown].includes(line));
  }
  assert.ok(own > 20 && own < 90, `own lines ${own}`);
  const grown = lineFor(new TalkBag(), { room: 'study', stage: 2, role: 'garden' }, () => .9);
  assert.ok(ROOM_TALK.study.grown.includes(grown));
});

test('a line does not come back until three quarters of its pool has been said', () => {
  const pool = ROOM_TALK.bath.kid, bag = new TalkBag(), seen: string[] = [];
  const run = Math.ceil(pool.length * .75);
  for (let i = 0; i < run; i++) seen.push(bag.pick('k', pool));
  assert.equal(new Set(seen).size, run);
  const pair = exchangeFor(new TalkBag(), 'craft'); assert.ok(pair && EXCHANGES.craft.some(p => p[0] === pair[0] && p[1] === pair[1]));
});
