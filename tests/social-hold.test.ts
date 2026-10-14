import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { socialHold } from '../src/social-hold.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('social pop-ups wait while a living creature chases the explorer (FIX-PLAN 3.3)', () => {
  assert.equal(socialHold([{ hp: 10, phase: 'chase' }]), true);
  assert.equal(socialHold([{ hp: 10, phase: 'idle' }, { hp: 10, phase: 'return' }, { hp: 0, phase: 'chase' }]), false);
  assert.equal(socialHold([]), false);
});

test('a neighbour\'s friend card never rolls its way into a fight; it leaves a News note and waits', () => {
  const bots = src('bots.ts');
  assert.doesNotMatch(bots, /fightPass\(/, 'no 1-in-4 roll lets a card in mid-fight');
  assert.match(bots, /if \(!fighting && socialHold\(world\.enemies\)\) fighting = true;/);
  assert.match(bots, /game\.newsNote\?\.\(\{ icon: '👋', title: '\{name\} wants to meet you'/);
  const online = src('online.ts');
  assert.match(online, /socialAnnounce\('You have a new friend request!'/);
  assert.match(online, /if\(game\.inFight\?\.\(\)&&game\.newsNote\)/);
  assert.match(src('main.ts'), /newsNote:note=>\{inbox\.announce\(\{kind:'other',\.\.\.note\}\);\},inFight:\(\)=>socialHold\(world\.enemies\)/);
});
