// The outfit (clothes) specials of the six uniforms read, look and sound like the uniform disguise kits: toy and cute,
// no real-weapon wording, a Vietnamese name and tip, a sound of their own, and a look the effects layer draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSimulation, SPECIALS, type CombatEffect } from '../src/combat.ts';
import { SPECIALS as CONTENT_SPECIALS } from '../src/content.ts';
import { UNIFORM_SPECIAL } from '../src/uniform-skills.ts';
import { SPECIAL_INFO, skillDescription } from '../src/skill-info.ts';
import { skillSound } from '../src/skill-sounds.ts';
import { LOOKS } from '../src/skill-visuals.ts';
import { setLanguage, t } from '../src/i18n.ts';

const REAL_WEAPONS = /rifle|gun|bullet|rocket|grenade|missile|ammo|bomb|shot\b|shots\b/i;

test('the six uniform specials: toy names and tips, Vietnamese, their own sounds', () => {
  for (const [outfit, id] of Object.entries(UNIFORM_SPECIAL)) {
    const special = SPECIALS[id], info = SPECIAL_INFO[id];
    assert.ok(special && info, `${outfit} ${id}`);
    assert.doesNotMatch(special.name, REAL_WEAPONS, special.name); assert.doesNotMatch(info.text, REAL_WEAPONS, info.text);
    assert.equal(CONTENT_SPECIALS[id].name, special.name, `${id}: one English name everywhere`);
    assert.notEqual(skillSound(3, undefined, id), 'crit', `${id} has its own sound`);
    setLanguage('vi');
    try {
      assert.notEqual(t(special.name), special.name, `${id} name in Vietnamese`);
      const vi = skillDescription(3, { special: id }); assert.doesNotMatch(vi, /\b(damage|enemies|enemy|within|seconds?|ahead)\b/, vi);
    } finally { setLanguage('en'); }
  }
  assert.equal(SPECIALS.volley.name, 'Cork barrage'); assert.equal(SPECIALS.volley.icon, '🍾');
});

test('the army uniform pops toy corks with a puff, like the cork popgun of its kit', () => {
  const effects: CombatEffect[] = [], kinds = new Set<string>(), p = { x: 0, z: 0 };
  const sim = new CombatSimulation({ position: () => p, facing: () => 0, face: () => {}, targets: () => [], weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0 }), move: () => {}, hit: () => 0, effect: e => effects.push(e) }, () => .5);
  assert.equal(sim.special('volley'), true);
  for (let i = 0; i < 40; i++) { sim.update(.025); for (const shot of sim.projectiles) kinds.add(shot.kind); }
  assert.deepEqual([...kinds], ['cork']);
  assert.ok(effects.some(e => e.look === 'poof') && LOOKS.poof);
});

test("content.ts keeps no reference source strings as the disguises' internal names: they match the English labels", async () => {
  const { readFile } = await import('node:fs/promises');
  const { DISGUISES } = await import('../src/content.ts');
  const source = await readFile(new URL('../src/content.ts', import.meta.url), 'utf8'), start = source.indexOf('const DISGUISE_FACTS'), block = source.slice(start, source.indexOf('\n};', start));
  const names = [...block.matchAll(/"name": "([^"]*)"/g)].map(m => m[1]);
  assert.equal(names.length, 16 * 5);
  for (const name of names) assert.doesNotMatch(name, /[À-ỹ]/u, name);
  for (const d of Object.values(DISGUISES)) for (const s of d.skills) assert.ok(names.includes(s.name), s.name);
});
