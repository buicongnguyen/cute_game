// Bond Surge (src/pet-surge.ts): the third hit of the chain makes a pet near the explorer grow, hit harder, guard harder
// and fire one signature move; bosses are staggered and left open to the explorer's own blows.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as M from '../src/model.ts';
import { CombatSimulation, type CombatHost, type CombatTarget } from '../src/combat.ts';
import { PET_ROLES, PET_RULES, petFighter, petShare, type GuardEvent, type PetFighter } from '../src/pet-guard.ts';
import { BREATH_COS, PetSurge, SIGNATURES, SURGE, signatureOf, surgeShare, surgeUptime, type SignatureId, type SurgeEvent } from '../src/pet-surge.ts';
import { PetSurgeView, DOG_HEIGHT } from '../src/pet-surge-view.ts';
import { petCard, petCardHtml } from '../src/pet-card.ts';
import { SURGE_VI, SURGE_HELP_VI } from '../src/locales/vi-surge.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';
import { HELP_TOPICS_VI } from '../src/locales/vi-help-topics.ts';
import { setLanguage, switchLanguage } from '../src/i18n.ts';
import { petSkillDps } from '../src/dungeon-content.ts';

type Foe = CombatTarget & { taken: number; own: number };
/** A fight with the chain on: the explorer at the origin facing +z, creatures at `spots`, pets set through `pets`. */
function arena(spots: Partial<Foe>[] = [{ z: 1.5, phase: 'chase' }], attack = 100) {
  const p = { x: 0, z: 0 }, foes: Foe[] = spots.map((s, i) => ({ id: 'f' + i, x: 0, z: 4, hp: 1e9, maxHp: 1e9, radius: .5, taken: 0, own: 0, ...s }));
  const events: SurgeEvent[] = [], guards: GuardEvent[] = [], helper: number[] = [], statuses: { id: string; kind: string; time: number }[] = []; let hp = 1, healed = 0;
  const pets: (PetFighter | null)[] = [null, null, null];
  const host: CombatHost = { position: () => p, facing: () => 0, face() {}, targets: () => foes, weapon: () => ({ kind: 'sword', range: 2, arc: .4 }), stats: () => ({ attack, critChance: 0, maxHp: 1000 }), move() {}, effect() {},
    hit: (t, h) => { (t as Foe).taken += h.amount; if (!h.helper) (t as Foe).own += h.amount; else helper.push(h.amount); }, heal: f => { healed += f; hp = Math.min(1, hp + f); }, health: () => hp, focus: () => 'f0',
    guarded: e => guards.push(e), surged: e => events.push(e), status: (t, kind, time) => { statuses.push({ id: t.id, kind, time }); if (kind === 'stun') t.stun = Math.max(t.stun ?? 0, time); },
    pet: () => pets[0], pet2: () => pets[1], dog: () => pets[2] };
  const sim = new CombatSimulation(host, () => .5); sim.edge.chain = true;
  const run = (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += .025) sim.update(.025); };
  /** Three presses of the chain, a third of a second apart. */
  const chain = () => { for (let i = 0; i < 3; i++) { assert.ok(sim.basic(foes[0]), 'the press reached the creature'); run(.34); } };
  return { p, foes, sim, host, pets, events, guards, statuses, helper, run, chain, healed: () => healed, setHp: (v: number) => { hp = v; } };
}
const pet = (id: string, at = { x: .9, z: -1 }): PetFighter => ({ ...petFighter(id)!, ...at });

// ------------------------------------------------------------------------------------------------ the rules
test('every pet has a signature: the four families, the dog, and five pets of their own', () => {
  assert.equal(signatureOf('pet_turtle'), 'bulwark'); assert.equal(signatureOf('pet_robot'), 'returnfire'); assert.equal(signatureOf('pet_sheep'), 'bloom'); assert.equal(signatureOf('bunny'), 'taunt');
  assert.equal(signatureOf(undefined, 'bark'), 'bigbark'); assert.equal(signatureOf('pet_colossus'), 'stomp'); assert.equal(signatureOf('pet_b_phoenix'), 'rebirth');
  assert.equal(signatureOf('pet_b_dragon'), 'breath'); assert.equal(signatureOf('pet_t_kraken'), 'slam'); assert.equal(signatureOf('pet_b_shadowlord'), 'bind');
  const dyed = Object.keys(M.ITEMS).find(id => id.startsWith('dye_') && id.endsWith('pet_colossus')); if (dyed) assert.equal(signatureOf(dyed), 'stomp', 'a dyed pet surges as its base');
  for (const id of Object.keys(PET_ROLES)) assert.ok(SIGNATURES[signatureOf(id)!], id);
  // The unique ones keep their family's passive: the Colossus and the Kraken still soak, the Dragon still sends shots back.
  assert.ok(SIGNATURES.stomp.soak && SIGNATURES.slam.soak && SIGNATURES.breath.reflect && SIGNATURES.rebirth.heal);
  assert.deepEqual([SURGE.grow, SURGE.hold, SURGE.shrink, SURGE.cooldown, SURGE.damage, SURGE.guard, SURGE.vuln, SURGE.vulnTime], [.3, 8, .4, 5, 2, 1.5, .15, 4]);
});

test('design bounds: one pet with surges stays under 18% of the hero, the best pair at +10 under 38%', () => {
  assert.ok(Math.abs(surgeUptime(1) - 8 / 14.9) < 1e-9); assert.ok(Math.abs(surgeUptime(2) - surgeUptime(1) / 2) < 1e-9, 'two pets take turns: each is big half as often');
  const skill = (id: string) => petSkillDps(id) / PET_RULES.heroDps;
  for (const id of Object.keys(PET_ROLES)) {
    const share = surgeShare(id) + skill(id), before = petShare(PET_ROLES[id]) + skill(id);
    assert.ok(share <= SURGE.shareMax, `${id}: ${(share * 100).toFixed(1)}% of the hero with surges`); assert.ok(share > before, `${id}: the surge adds something`);
  }
  const ten = Object.keys(PET_ROLES).map(id => surgeShare(id, 1.4, 2) + skill(id)).sort((a, b) => b - a);
  assert.ok(ten[0] + ten[1] <= SURGE.pairMax, `the best pair at +10: ${((ten[0] + ten[1]) * 100).toFixed(1)}%`);
  assert.ok(ten[0] + ten[1] > PET_RULES.pairMax - .01, 'and it is a little more than without surges');
});

test('PetSurge: three quick presses, never two; a slow press starts again; one at a time, turns, cooldown, ready again', () => {
  const s = new PetSurge(); assert.equal(s.press(0), false); assert.equal(s.press(1), false); assert.equal(s.press(2), true, 'the chain\'s third press');
  assert.equal(s.press(), false); s.step(.5); assert.equal(s.press(), false); s.step(.5); assert.equal(s.press(), true, 'three presses within the gap');
  s.press(); s.step(SURGE.gap + .1); s.press(); s.step(.2); assert.equal(s.press(), false, 'a pause starts the count again');
  assert.equal(s.pick(slot => slot !== 0), 1, 'the first pet is away: the second takes its turn');
  s.start(0, 'bulwark'); assert.equal(s.ready, false); assert.equal(s.pick(() => true), -1, 'one surge at a time');
  assert.equal(s.damage(0), 1, 'growing: not yet big'); assert.equal(s.step(.31), 'big'); assert.equal(s.damage(0), 2); assert.equal(s.guard(0), 1.5); assert.equal(s.damage(1), 1, 'only the big pet');
  assert.equal(s.ring().state, 'active'); let end: string | null = null; for (let t = 0; t < 8.1 && !end; t += .05) end = s.step(.05); assert.equal(end, 'end'); assert.equal(s.damage(0), 1);
  for (let t = 0; t < .45; t += .05) s.step(.05); assert.equal(s.state, 'cool'); assert.equal(s.ring().state, 'cool');
  for (let t = 0; t < 5.05; t += .05) s.step(.05); assert.equal(s.state, 'ready'); assert.equal(s.pick(() => true), 1, 'the other pet\'s turn');
});

// ------------------------------------------------------------------------------------------------ in the fight
test('the third hit of the chain makes the pet beside the explorer surge; a pet out of the leash does not', () => {
  const a = arena(); a.pets[0] = pet('pet_turtle', { x: .9, z: -9 }); a.chain(); assert.equal(a.events.length, 0, 'a pet left 9 m behind');
  a.pets[0] = pet('pet_turtle'); a.sim.basic(a.foes[0]); a.run(.3); a.sim.basic(a.foes[0]); assert.equal(a.events.length, 0, 'two hits are not enough');
  a.run(.3); a.sim.basic(a.foes[0]); assert.deepEqual(a.events.map(e => [e.phase, e.sig, e.slot]), [['start', 'bulwark', 0]]);
  a.run(.31); assert.equal(a.events.at(-1)!.phase, 'big', 'the signature fires as it has grown');
  const b = arena(); b.chain(); assert.equal(b.events.length, 0, 'no pet: no surge'); assert.equal(b.sim.surge.count.reduce((x, y) => x + y), 0);
});

test('without the chain (online, a disguise): three basic presses within the gap', () => {
  const a = arena(); a.sim.edge.chain = false; a.pets[0] = pet('pet_robot');
  for (let i = 0; i < 2; i++) { a.sim.basic(a.foes[0]); a.run(.5); } assert.equal(a.events.length, 0); a.sim.basic(a.foes[0]); assert.equal(a.events[0]?.sig, 'returnfire');
});

test('while big: shots x2 and guards x1.5; then back to normal; two pets take turns, the dog too', () => {
  const a = arena([{ z: 1.5, phase: 'chase', hp: 1e9 }]); a.pets[0] = pet('pet_turtle'); a.pets[1] = pet('pet_robot', { x: -.9, z: -1 }); a.pets[2] = { x: -.5, z: -1.4, dmg: .2, cd: 2, guard: { kind: 'bark', power: 3, every: 8 } };
  a.chain(); a.run(.1); assert.equal(a.sim.surge.big(0), true);
  a.helper.length = 0; a.run(3.7); assert.ok(a.helper.includes(PET_ROLES.pet_turtle.dmg * 2 * 100), `the turtle's shot doubled: ${a.helper}`); assert.ok(!a.helper.includes(PET_ROLES.pet_turtle.dmg * 100));
  assert.ok(a.helper.includes(PET_ROLES.pet_robot.dmg * 100), 'the robot is not big');
  const left = a.sim.guardIncoming(1000, 'melee', a.foes[0]); assert.equal(left, 0, 'Bulwark: the next hit is soaked whole');
  a.run(.5); const cut = 1000 - a.sim.guardIncoming(1000, 'melee', a.foes[0]); assert.ok(Math.abs(cut - PET_ROLES.pet_turtle.power * 100 * 1.5) < 1e-6, `the block is half again as strong: ${cut}`);
  a.run(9.5); assert.equal(a.sim.surge.state, 'ready'); a.chain(); assert.equal(a.events.filter(e => e.phase === 'start').at(-1)!.slot, 1, 'the second pet\'s turn');
  a.run(14); a.chain(); const last = a.events.filter(e => e.phase === 'start').at(-1)!; assert.deepEqual([last.slot, last.sig], [2, 'bigbark'], 'then the dog');
});

test('Return fire: the big counter pet sends up to three shots back at their owner; a boss shot only loses 30%', () => {
  const a = arena([{ z: 1.5, phase: 'chase' }, { id: 'boss', x: 3, z: 5, boss: true, radius: 1.5, phase: 'windup' }]); a.pets[0] = pet('pet_robot'); a.chain(); a.run(.1);
  const owner = a.foes[0]; a.helper.length = 0;
  assert.equal(a.sim.counterShot({ x: 0, z: 1, damage: 400, owner: 'f0' }), 0, 'a shot in the air: gone'); a.run(.5);
  assert.ok(a.helper.includes(Math.round(100 * SURGE.reflect)), `and it hit its owner: ${a.helper}`); assert.equal(a.events.at(-1)!.reflect, true);
  assert.equal(a.sim.guardIncoming(300, 'shot', owner), 0, 'a shot that landed (online): sent back too');
  assert.equal(a.sim.counterShot({ x: 0, z: 1, damage: 400, owner: 'boss', boss: true }), 400 - 400 * PET_RULES.bossCap, 'a boss shot keeps 70%');
  assert.equal(a.sim.surge.reflects, 0); const n = a.events.length; a.sim.counterShot({ x: 0, z: 1, damage: 10, owner: 'f0' }); assert.equal(a.events.filter(e => e.reflect).length, a.events.slice(0, n).filter(e => e.reflect).length, 'three a surge');
});

test('Bloom heals and wards off hazards; Rebirth catches one knock-out in five minutes', () => {
  const a = arena(); a.pets[0] = pet('pet_sheep'); a.setHp(.4); a.chain(); a.run(.1);
  assert.ok(Math.abs(a.healed() - PET_ROLES.pet_sheep.power * SURGE.guard * SIGNATURES.bloom.heal) < 1e-9, `healed ${a.healed()}`); assert.ok(a.sim.statuses.ward > 2, 'warded');
  const b = arena(); b.pets[0] = pet('pet_b_phoenix'); assert.equal(b.sim.surge.revive(), false, 'not armed before a surge');
  b.chain(); b.run(.1); assert.equal(b.events.find(e => e.phase === 'big')!.sig, 'rebirth'); assert.equal(b.sim.surge.revive(), true); assert.equal(b.sim.surge.revive(), false, 'once');
  b.run(14); b.chain(); b.run(.1); assert.equal(b.sim.surge.revive(), false, 'the next surge within five minutes does not arm it');
  b.run(SURGE.reviveEvery); b.chain(); b.run(.1); assert.equal(b.sim.surge.revive(), true, 'five minutes later it does');
  b.sim.reset(); assert.ok(b.sim.surge.revivedAt > 0, 'a scene change keeps the five-minute promise');
});

test('Taunt, bind, slam, stomp, breath and the big bark reach the creatures they say, never far ones', () => {
  const ring = (id: string, sig: SignatureId) => {
    const a = arena([{ z: 1.5, phase: 'chase' }, { id: 'near', x: 2.5, z: 2.2, phase: 'chase' }, { id: 'far', x: 0, z: 14, phase: 'chase' }, { id: 'behind', x: 0, z: -4, phase: 'chase' }]);
    a.pets[0] = id === 'dog' ? { x: .9, z: -1, dmg: .2, cd: 9, guard: { kind: 'bark', power: 3, every: 8 } } : pet(id); a.chain(); a.run(.1);
    const big = a.events.find(e => e.phase === 'big')!; assert.equal(big.sig, sig); return a;
  };
  const t = ring('bunny', 'taunt'); assert.ok(t.statuses.some(s => s.id === 'near' && s.kind === 'blind' && s.time === 3)); assert.ok(!t.statuses.some(s => s.id === 'far'));
  const b = ring('pet_b_shadowlord', 'bind'); assert.ok(b.statuses.some(s => s.id === 'near' && s.kind === 'stun' && s.time === 2)); assert.ok(!b.statuses.some(s => s.id === 'far'));
  const k = ring('pet_t_kraken', 'slam'); assert.ok(k.foes[0].taken > 0 && k.foes[2].taken === 0); assert.ok(k.sim.surge.soak, 'the Kraken still soaks the next hit');
  const c = ring('pet_colossus', 'stomp'); assert.ok(c.statuses.some(s => s.id === 'near' && s.kind === 'stun'));
  const d = ring('pet_b_dragon', 'breath'); assert.ok(d.foes[0].taken > 0, 'the chosen creature, ahead'); assert.equal(d.foes[3].taken, 0, 'not the one behind'); assert.ok(BREATH_COS > 0);
  const g = ring('dog', 'bigbark'); assert.ok(g.statuses.some(s => s.id === 'f0' && s.kind === 'slow')); assert.equal(g.foes[2].taken, 0);
  // Signature damage is the pet's (helper), never the explorer's.
  assert.equal(c.foes[1].own, 0);
});

test('bosses: every signature staggers one on its way and leaves it open to the explorer\'s blows (+15% for 4 s), never to the pets\'', () => {
  const a = arena([{ id: 'boss', z: 1.8, boss: true, radius: .9, phase: 'chase' }]); a.pets[0] = pet('pet_turtle'); a.chain();
  const plain = a.foes[0].own; a.run(.1); const big = a.events.find(e => e.phase === 'big')!; assert.equal(big.boss, 'boss'); assert.ok(a.statuses.some(s => s.id === 'boss' && s.kind === 'stun' && s.time === SURGE.stagger));
  assert.equal(a.sim.surge.vulnerable('boss'), true);
  // The chain's three presses before (1, 1, 1.25 of a blade's 1.1) against the same three now.
  const b = a.foes[0].own; a.chain(); const open = a.foes[0].own - b; assert.ok(Math.abs(open / plain - 1.15) < .02, `${(open / plain).toFixed(3)}x`);
  a.run(4.1); assert.equal(a.sim.surge.vulnerable('boss'), false, 'for four seconds');
  // A boss winding up is not stunned (a stun cancels a wind-up and the opening after it) but is still left open.
  const w = arena([{ id: 'boss', z: 1.8, boss: true, radius: .9, phase: 'windup' }]); w.pets[0] = pet('pet_turtle'); w.chain(); w.run(.1);
  assert.ok(!w.statuses.some(s => s.kind === 'stun')); assert.equal(w.sim.surge.vulnerable('boss'), true);
  // A boss's hit is soaked only to the 30% cap.
  assert.equal(w.sim.guardIncoming(1000, 'melee', w.foes[0]), 1000 * (1 - PET_RULES.bossCap));
});

test('surges can be switched off (the before rows of the sims), and a reset ends one', () => {
  const a = arena(); a.pets[0] = pet('pet_turtle'); a.sim.surge.enabled = false; a.chain(); assert.equal(a.events.length, 0);
  a.sim.surge.enabled = true; a.chain(); assert.deepEqual(a.events.map(e => e.phase), ['start', 'big']); a.sim.reset(); assert.equal(a.sim.surge.state, 'ready'); assert.equal(a.sim.surge.damage(0), 1);
});

// ------------------------------------------------------------------------------------------------ the picture
function viewRig() {
  const calls: string[] = [], texts: string[] = [], sounds: string[] = [];
  const fx = { flash: () => calls.push('flash'), ring: () => calls.push('ring'), spark: () => calls.push('spark'), burst: () => calls.push('burst'), shake: () => calls.push('shake'), text: (_at: unknown, m: string) => { texts.push(m); } };
  const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5).translate(0, .25, 0))); model.scale.setScalar(.8); model.position.set(.9, 0, -1); model.updateMatrixWorld(true);
  const pen = { spread: 1 }, dog = { scale: 1 }; let can = true;
  const view = new PetSurgeView({ fx: () => fx as never, petModel: slot => slot === 0 ? model : null, pen: slot => slot === 0 ? pen : null, dog: () => dog, hero: () => ({ x: 0, y: 0, z: 0 }), heroHeight: () => 1.93, eye: () => ({ x: 0, y: 8, z: -10 }),
    color: () => '#ff985f', creature: () => ({ x: 0, z: 2, boss: true }), canSurge: () => can, t: k => k, sound: k => sounds.push(k) });
  return { view, calls, texts, sounds, model, pen, dog, setCan: (v: boolean) => { can = v; } };
}
const height = (m: THREE.Object3D) => { m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m); return b.max.y - b.min.y; };
test('the picture: the pet pops to 85% of the hero, steps aside, stays big, shrinks back; idle costs nothing', () => {
  const r = viewRig(); r.view.update(.016); assert.deepEqual(r.calls, [], 'nothing runs: nothing drawn');
  r.view.show({ slot: 0, phase: 'start', sig: 'bulwark', x: .9, z: -1 }); assert.ok(r.calls.includes('burst') && r.sounds.includes('grow'));
  for (let i = 0; i < 8; i++) r.view.update(.02); const mid = height(r.model); r.view.update(.2);
  const big = height(r.model); assert.ok(Math.abs(big / (SURGE.height * 1.93) - 1) < .05, `${big.toFixed(2)} m tall`); assert.ok(mid > .4, 'popping up');
  r.view.show({ slot: 0, phase: 'big', sig: 'bulwark', x: .9, z: -1, boss: 'b' }); assert.ok(r.texts.includes('🛡️ Bulwark') && r.texts.includes('💫 Staggered'));
  for (let i = 0; i < 50; i++) r.view.update(.02); assert.ok(r.pen.spread > 2, `aside: ${r.pen.spread.toFixed(2)}`); assert.equal(r.view.state().state, 'active');
  r.view.show({ slot: 0, phase: 'end', sig: 'bulwark', x: .9, z: -1 }); for (let i = 0; i < 25; i++) r.view.update(.02);
  assert.equal(r.model.scale.x, .8, 'its own size again'); assert.equal(r.model.scale.y, .8); assert.equal(r.pen.spread, 1); assert.equal(r.view.state().state, 'cool');
  for (let i = 0; i < 260; i++) r.view.update(.02); assert.equal(r.view.state().state, 'ready');
  const n = r.calls.length; r.view.update(.016); assert.equal(r.calls.length, n, 'idle again');
  // The dog has no model of its own: its instanced parts take a scale.
  r.view.show({ slot: 2, phase: 'start', sig: 'bigbark', x: 0, z: -1 }); for (let i = 0; i < 20; i++) r.view.update(.02); assert.ok(Math.abs(r.dog.scale - SURGE.height * 1.93 / DOG_HEIGHT) < .1);
  r.view.clear(); assert.equal(r.dog.scale, 1);
  // A lost end word: it shrinks anyway.
  r.view.show({ slot: 0, phase: 'start', sig: 'bulwark', x: .9, z: -1 }); for (let i = 0; i < 500; i++) r.view.update(.02); assert.equal(r.model.scale.x, .8);
});

// ------------------------------------------------------------------------------------------------ words
test('the pet card, the ring and the Help topic say it, in English and Vietnamese', async () => {
  const s = M.newGame();
  try {
    for (const lang of ['en', 'vi'] as const) {
      if (lang === 'vi') await switchLanguage('vi'); else setLanguage('en');
      for (const id of ['pet_turtle', 'pet_colossus', 'pet_b_phoenix', 'pet_dog']) {
        const card = petCard(id, s); if (!card) continue; assert.ok(!/[{}]|undefined|NaN/.test(card.surge), card.surge);
        if (lang === 'vi') assert.ok(/[À-ỹ]/.test(card.surge), card.surge); else assert.match(card.surge, /Bond Surge/);
        assert.ok(petCardHtml(id, s).includes('pet-surge')); assert.ok(!petCardHtml(id, s, true).includes('pet-surge'), 'the shop\'s brief card leaves it out');
      }
    }
  } finally { setLanguage('en'); }
  for (const [en, vi] of Object.entries(SURGE_VI)) { assert.equal(VI_PACK[en], vi, en); assert.ok(/[À-ỹ]/.test(vi), vi); }
  for (const sig of Object.values(SIGNATURES)) { assert.ok(SURGE_VI[sig.name] && SURGE_VI[sig.text], sig.name); }
  const topic = HELP_TOPICS.find(([, title]) => title === 'Bond Surge'); assert.ok(topic, 'a Help topic'); assert.equal(HELP_TOPICS_VI[topic[1]], SURGE_HELP_VI[0]); assert.equal(HELP_TOPICS_VI[topic[2]], SURGE_HELP_VI[1]);
});
