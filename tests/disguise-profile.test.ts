// The disguise strength profiles (disguise-profile.ts) come from combat.ts's own numbers: bounds, coverage of every
// disguise and every skill, the ties to the data, the weapon in hand, and the pictures built from them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISGUISES, ITEMS } from '../src/content.ts';
import { newGame } from '../src/model.ts';
import { DISGUISE_KITS, DZ, BOULDER } from '../src/combat.ts';
import { SPECIAL_INFO } from '../src/skill-info.ts';
import { AXES, AXIS_LABEL, AXIS_NOTE, ROLE_LABEL, DISGUISE_IDS, SPECIAL_SHAPE, WINDOW, allProfiles, axisBest, basicAttack, profile, rawProfile, skillFacts } from '../src/disguise-profile.ts';
import { disguiseChapterHtml, disguiseDetailHtml, disguiseSlotHtml, heldWeapon, type PageUi } from '../src/disguise-ui.ts';
import { radarSvg, barsHtml, sparkSvg } from '../src/insight-charts.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { INSIGHT_VI } from '../src/locales/vi-insight.ts';

test('all seventeen disguises have a profile, every score is a whole number from 0 to 100, and each axis has a best', () => {
  assert.equal(DISGUISE_IDS.length, 17);
  assert.deepEqual([...DISGUISE_IDS].sort(), Object.keys(DISGUISES).sort());
  const all = allProfiles();
  for (const p of all) for (const axis of AXES) { const v = p.scores[axis]; assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `${p.id} ${axis} ${v}`); assert.ok(Number.isFinite(p.raw[axis]) && p.raw[axis] >= 0); }
  for (const axis of AXES) { assert.ok(axisBest()[axis] > 0, axis); assert.equal(Math.max(...all.map(p => p.scores[axis])), 100, `${axis} has a 100`); }
  // The picture must tell them apart: no two disguises share all six scores.
  assert.equal(new Set(all.map(p => AXES.map(a => p.scores[a]).join())).size, 17);
});

test('every kit skill is described and adds to at least one axis; every fact is a finite, non-negative number', () => {
  for (const [id, kit] of Object.entries(DISGUISE_KITS)) {
    assert.equal(kit.length, 4, id);
    const p = profile(id);
    kit.forEach((effect, i) => {
      const facts = skillFacts(effect); assert.ok(Object.keys(facts).length > 0, `${id} ${effect} has facts`);
      for (const [key, value] of Object.entries(facts)) if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, `${effect}.${key}`);
      assert.ok(AXES.some(axis => p.skills[i].adds[axis] > 0), `${id} ${effect} contributes`);
      assert.equal(p.skills[i].cd, DISGUISES[id].skills[i].cd); assert.equal(p.skills[i].name, DISGUISES[id].skills[i].name);
    });
  }
  assert.deepEqual(skillFacts('no-such-skill'), {});
});

test('the facts are the numbers combat.ts uses, not typed-in scores', () => {
  assert.equal(skillFacts('fireball').damage, DZ.fireball.power);
  assert.equal(skillFacts('boulder').damage, BOULDER.power);
  assert.equal(skillFacts('missiles').damage, DZ.missiles.count * DZ.missiles.power);
  assert.equal(skillFacts('whistle').hard, DZ.whistle.stun);
  assert.equal(skillFacts('energyshield').safe, DZ.energyshield.time);
  assert.equal(skillFacts('energyshield').heal, DZ.energyshield.heal);
  assert.equal(skillFacts('teleport').move, DZ.teleport.distance);
  assert.equal(skillFacts('anchor').damage, SPECIAL_INFO.anchor.damage);
  // The sum on an axis is the basic attack plus each skill's part.
  for (const id of DISGUISE_IDS) { const r = rawProfile(id);
    assert.ok(Math.abs(r.raw.damage - (r.basicShare.damage + r.skills.reduce((n, s) => n + s.adds.damage, 0))) < 1e-9, id);
    assert.ok(Math.abs(r.raw.survival - (r.basicShare.survival + r.skills.reduce((n, s) => n + s.adds.survival, 0))) < 1e-9, id);
    assert.equal(r.raw.burst, Math.max(...r.skills.map(s => s.adds.burst)));
    assert.equal(r.basicShare.damage, basicAttack(DISGUISES[id].weapon).perSecond * WINDOW); }
  // Only the vampire steals life with every blow.
  assert.ok(rawProfile('dz_vampire').passive > 0); assert.equal(rawProfile('dz_ninja').passive, 0);
});

test('the uniform specials: the literals copied from combat.ts match the sentences players read', () => {
  assert.match(SPECIAL_INFO.lotus.text, /Twelve lotus petals/); assert.equal(SPECIAL_SHAPE.lotus.shots, 12);
  assert.match(SPECIAL_INFO.lotus.text, new RegExp(`to ${SPECIAL_SHAPE.lotus.range} m`)); assert.match(SPECIAL_INFO.lotus.text, new RegExp(`heal ${SPECIAL_SHAPE.lotus.heal * 100}% health`));
  assert.match(SPECIAL_INFO.dragon.text, /Seven waves/); assert.equal(SPECIAL_SHAPE.dragon.shots, 7); assert.match(SPECIAL_INFO.dragon.text, new RegExp(`fly ${SPECIAL_SHAPE.dragon.range} m`));
  assert.match(SPECIAL_INFO.eagle.text, new RegExp(`forward ${SPECIAL_SHAPE.eagle.length} m`)); assert.match(SPECIAL_INFO.eagle.text, new RegExp(`×${SPECIAL_SHAPE.eagle.dash}`));
  assert.match(SPECIAL_INFO.goldstar.text, /Five piercing gold stars/); assert.equal(SPECIAL_SHAPE.goldstar.shots, 5); assert.match(SPECIAL_INFO.goldstar.text, new RegExp(`fly ${SPECIAL_SHAPE.goldstar.range} m`));
});

test('the weapon in hand shifts only what a weapon can: a faster one raises damage, a rod changes nothing', () => {
  const own = profile('dz_knight'), fast = profile('dz_knight', { kind: 'sword', range: 2.8, cd: .3 }), slow = profile('dz_knight', { kind: 'sword', range: 2.8, cd: 1.2 });
  assert.ok(fast.raw.damage > own.raw.damage && own.raw.damage > slow.raw.damage);
  for (const axis of ['area', 'control', 'mobility'] as const) assert.equal(fast.raw[axis], own.raw[axis]);
  assert.deepEqual(profile('dz_knight', ITEMS.rod.weapon).scores, own.scores);
  // A stronger weapon than any disguise's own cannot push a score past 100.
  assert.ok(profile('dz_mecha', { kind: 'gun', range: 11, cd: .1 }).scores.damage <= 100);
  const s = newGame(); assert.equal(heldWeapon(s), null);
  s.bag.sword_wood = 1; s.gear.weapon = 'sword_wood'; assert.equal(heldWeapon(s)?.id, 'sword_wood');
  s.bag.rod = 1; s.gear.weapon = 'rod'; assert.equal(heldWeapon(s), null);
});

test('roles and hints follow from the numbers and have words in both languages', () => {
  for (const p of allProfiles()) {
    assert.ok(ROLE_LABEL[p.role], p.id); assert.ok(p.best.length > 0, p.id); assert.ok(p.strong.length >= 1);
    const top = [...AXES].sort((a, b) => p.scores[b] - p.scores[a])[0]; assert.equal(p.scores[p.strong[0]], p.scores[top]);
    for (const axis of p.weak) assert.ok(p.scores[axis] < 30);
    assert.equal(p.care !== '', p.weak.length > 0);
    assert.equal(p.ranged, p.basic.reach >= 6);
    for (const text of [ROLE_LABEL[p.role], p.best, p.care].filter(Boolean)) assert.ok(VI_PACK[text], `Vietnamese for "${text}"`);
  }
  for (const axis of AXES) { assert.ok(VI_PACK[AXIS_LABEL[axis]]); assert.ok(VI_PACK[AXIS_NOTE[axis]]); }
  for (const label of Object.values(ROLE_LABEL)) assert.ok(VI_PACK[label], label);
  // A melee and a ranged disguise read differently.
  assert.equal(profile('dz_knight').ranged, false); assert.equal(profile('dz_mage').ranged, true);
});

test('the pages: every disguise is on the chapter, owned ones are marked, and every phrase has Vietnamese', () => {
  const used = new Set<string>(), s = newGame();
  s.bag.dz_ninja = 1; s.bag.dz_mage = 1; s.gear.disguise = 'dz_ninja'; s.bag.sword_wood = 1; s.gear.weapon = 'sword_wood';
  const ui: PageUi = { t: (text, params) => { used.add(text); return params ? text.replace(/\{(\w+)\}/g, (_, k) => String(params[k])) : text; }, esc: x => x, art: (_, icon) => icon, state: s };
  const chapter = disguiseChapterHtml(ui, 'total');
  for (const id of DISGUISE_IDS) assert.ok(chapter.includes(`data-id="${id}"`), id);
  assert.equal((chapter.match(/class="dz-card owned/g) ?? []).length, 2);
  assert.equal((chapter.match(/dz-card owned worn/g) ?? []).length, 1);
  // Sorting by an axis puts its best first.
  for (const axis of AXES) { const first = disguiseChapterHtml(ui, axis).match(/data-insight="dz-open" data-id="(\w+)"/)![1]; assert.equal(profile(first).scores[axis], 100, axis); }
  const detail = disguiseDetailHtml(ui, 'dz_mage', 'dz_ninja');
  assert.match(detail, /role="img"/); assert.match(detail, /stroke-dasharray/); // the second profile is dashed, not only another colour
  assert.match(detail, /Both are shown with your/);
  for (const skill of DISGUISES.dz_mage.skills) assert.ok(detail.includes(skill.name), skill.name);
  assert.match(disguiseDetailHtml(ui, 'dz_mage', null), /With your /);
  s.gear.weapon = undefined; assert.match(disguiseDetailHtml(ui, 'dz_mage', null), /Shown with its own weapon/);
  const slot = disguiseSlotHtml(ui, 'dz_mage'); assert.match(slot, /data-compare="dz_ninja"/); assert.match(slot, /aria-label="/);
  assert.equal(disguiseSlotHtml(ui, 'sword_wood'), ''); assert.equal(disguiseDetailHtml(ui, 'nope', null), '');
  for (const id of DISGUISE_IDS) { disguiseDetailHtml(ui, id, null); disguiseSlotHtml(ui, id); }
  const missing = [...used].filter(text => !VI_PACK[text] && !/^[\d\s×·+%.-]*$/.test(text));
  assert.deepEqual(missing, [], 'phrases without Vietnamese');
  for (const [en, vi] of Object.entries(INSIGHT_VI)) { assert.ok(vi.trim().length > 0, en);
    assert.deepEqual([...vi.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...en.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `placeholders of "${en}"`); }
});

test('charts carry their numbers as text', () => {
  const svg = radarSvg({ labels: ['A', 'B', 'C'], series: [{ values: [10, 50, 100], name: 'One' }, { values: [120, -5, 30], name: 'Two' }], title: 'Test' });
  assert.match(svg, /aria-label="Test\. One: A 10, B 50, C 100\. Two: A 120, B -5, C 30"/);
  assert.equal((svg.match(/<polygon/g) ?? []).length, 4 + 2);
  assert.doesNotMatch(radarSvg({ labels: ['A', 'B', 'C'], series: [{ values: [1, 2, 3], name: 'x' }], compact: true, title: 'T' }), /<text/);
  const bars = barsHtml([{ label: 'Garden', value: 130, other: 40, tone: 'strong', tag: 'strong' }, { label: 'Fish', value: -4 }], 'Scores');
  assert.match(bars, /width:100%/); assert.match(bars, /width:0%/); assert.match(bars, /left:40%/); assert.match(bars, /<em>strong<\/em>/);
  assert.match(sparkSvg([1, 2, 3], 'Up'), /aria-label="Up"/); assert.match(sparkSvg([5], 'One'), /<circle/);
});
