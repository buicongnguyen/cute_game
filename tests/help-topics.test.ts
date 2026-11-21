// Help (src/help-topics.ts, src/locales/vi-help-topics.ts; AAA plan WP16): a phone reads about taps and buttons, never about
// PC keys, and the Jump topic says nothing about bosses blocking low hits while that rule is switched off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HELP_TOPICS, helpTopics, forDevice } from '../src/help-topics.ts';
import { HELP_TOPICS_VI, helpTopicsVi } from '../src/locales/vi-help-topics.ts';
import { BOSS_BLOCK_ON } from '../src/jump-rules.ts';

// Key names as the Help writes them: named keys, the layouts, and a capital letter standing alone as a key ("Q throws", "F or N", "J/K/L/;").
const KEY_NAMES = /\b(WASD|Space|Enter|Esc|Tab|Shift|Ctrl)\b|arrow keys?|phím|keyboard|bàn phím|mouse|chuột|J\/K\/L|Q\/W\/E\/R/i;
const LONE_KEY = /(^|[\s(·,])[QWERFNHIJKLMP](?=[\s,.;:)·]|$)/;
const pcWords = (text: string) => [KEY_NAMES.exec(text)?.[0], LONE_KEY.exec(text)?.[0]?.trim()].filter(Boolean);

test('touch Help has no PC key names, in English and in Vietnamese', () => {
  const touch = helpTopics(true), vi = helpTopicsVi(true);
  assert.ok(touch.length >= 30, `${touch.length} topics on a phone`);
  for (const [, title, body] of touch) {
    assert.deepEqual(pcWords(body), [], `"${title}" names a key on a phone: ${body}`);
    assert.doesNotMatch(body, /\[\[|\]\]|\|\|/, `"${title}" keeps a marker`);
    assert.ok(body.length > 20 && !/ {2}| [.,;]/.test(body), `"${title}" reads cleanly: ${body}`);
    const viBody = vi[body]; assert.ok(viBody && vi[title], `"${title}" has its Vietnamese text for phones`);
    assert.deepEqual(pcWords(viBody), [], `"${title}" names a key on a phone in Vietnamese: ${viBody}`);
    assert.doesNotMatch(viBody, /\[\[|\]\]|\|\|/); assert.ok(!/ {2}| [.,;]/.test(viBody), `"${title}" reads cleanly in Vietnamese: ${viBody}`);
  }
  // The shortcut list is a keyboard topic: phones do not get it at all.
  assert.ok(!touch.some(([, title]) => title === 'Handy shortcuts')); assert.ok(helpTopics(false).some(([, title]) => title === 'Handy shortcuts'));
  // What a phone is told instead.
  const of = (title: string) => touch.find(row => row[1] === title)![2];
  assert.match(of('Wander'), /^Tap the ground to walk/); assert.match(of('Backpack and storage'), /^Tap the backpack/);
  assert.match(of('Jump and air combat'), /^The big pad in the corner of the paw is Attack/);
  assert.match(of('Attack and four specials'), /Petal Gale throws petals/);
});

test('the PC Help keeps its keys, every topic has both languages, and no marker reaches the screen', () => {
  const pc = helpTopics(false), vi = helpTopicsVi(false);
  assert.deepEqual(HELP_TOPICS, pc, 'Node has no touch screen: the module-level list is the PC one');
  assert.deepEqual(HELP_TOPICS_VI, vi);
  assert.ok(pc.length > helpTopics(true).length);
  for (const [, title, body] of pc) { assert.doesNotMatch(body, /\[\[|\]\]|\|\|/, title); assert.ok(vi[title] && vi[body], `Vietnamese for "${title}"`); assert.doesNotMatch(vi[body], /\[\[|\]\]|\|\|/, title); }
  const of = (title: string) => pc.find(row => row[1] === title)![2];
  assert.match(of('Four skills'), /^Q spins, W dashes, E slams the ground/); assert.match(of('Handy shortcuts'), /I backpack · J journal/);
  assert.match(of('Jump and air combat'), /^Space jumps and F or N attacks; H still eats\. On a phone the big pad/);
  assert.equal(forDevice('a[[b||c]]d[[e||]]', false), 'abde'); assert.equal(forDevice('a[[b||c]]d[[e||]]', true), 'acd');
});

test('the Jump topic does not mention bosses blocking while BOSS_BLOCK_ON is false', () => {
  for (const touch of [false, true]) {
    const body = helpTopics(touch).find(row => row[1] === 'Jump and air combat')![2], vi = helpTopicsVi(touch)[body];
    assert.ok(vi, 'the Jump topic has Vietnamese text');
    if (!BOSS_BLOCK_ON) { assert.doesNotMatch(body, /block/i); assert.doesNotMatch(vi, /chặn|đỡ đòn/i); }
    else assert.match(body, /block hits from the ground/, 'the rule is on again: put the sentence back in help-topics.ts and locales/vi-five.ts');
    assert.match(body, /the triple at level 25\.$/); assert.match(vi, /nhảy ba ở cấp 25\.$/);
  }
});
