import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactGap } from '../src/interact-pick.ts';

const pick = (things: { kind: string; x: number; z: number; radius: number }[], px: number, pz: number, facing: number) =>
  [...things].sort((a, b) => interactGap(a, px, pz, facing) - interactGap(b, px, pz, facing))[0].kind;

test('F at the water\'s edge fishes even when a garden bed is nearer (FIX-PLAN 3.1)', () => {
  const pond = { kind: 'fish', x: 0, z: 0, radius: 4 }, bed = { kind: 'plot', x: 5.4, z: -1.2, radius: 1 };
  // Standing 0.6 m from the water, facing the pond (west, -x): the bed's edge is nearer, the pond still wins.
  assert.equal(pick([pond, bed], 4.6, 0, -Math.PI / 2), 'fish');
  // Facing the pond from 1.8 m away also wins.
  assert.equal(pick([pond, bed], 5.8, 0, -Math.PI / 2), 'fish');
  // Turned straight away from the water and standing on the bed: the bed wins.
  assert.equal(pick([pond, bed], 5.4, -1.2, Math.PI / 2), 'plot');
  // Far from the pond: the plain nearest rule.
  assert.equal(pick([{ ...pond, x: -10 }, bed], 5.4, 0, -Math.PI / 2), 'plot');
});

test('the cottage door keeps its head start over a helper standing in front of it', () => {
  assert.equal(pick([{ kind: 'home', x: 0, z: 0, radius: 2 }, { kind: 'friend', x: 0, z: 2.8, radius: .5 }], 0, 3.6, Math.PI), 'home');
});
