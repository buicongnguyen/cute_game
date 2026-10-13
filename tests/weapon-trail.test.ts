import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { TRAIL, SWING, CUTS, SPIN, TrailSamples, buildRibbon, bridgeStrip, bladeAxis, bladeTint, plainBlade, maxSections, swingPose, nextCut, contactDelay, spinLead, spinTurn, type SwingPose } from '../src/trail-ribbon.ts';
import { WIND, WIND_SECTIONS, PUNCH, WindBursts, buildWind, gustHead, punchPose, type PunchKind, type PunchPose } from '../src/punch-wind.ts';
import { WeaponTrail, TrailPool, measureBlade, trailMaterial } from '../src/weapon-trail.ts';
import { REACT, reactCurve, reactStrength, reactStop, newReaction, startReaction, applyReaction, reactionPose, newReactionPose } from '../src/hit-react.ts';
import { MOVES } from '../src/moves.ts';

const finite = (a: ArrayLike<number>, n: number) => { for (let i = 0; i < n; i++) if (!Number.isFinite(a[i])) return false; return true; };
/** A blade 1 m long swept round the y axis: its inner end at radius .4, its tip at 1.4. */
const sweep = (s: TrailSamples, frames: number, step = .3, dt = 1 / 60, t0 = 0) => { for (let i = 0; i < frames; i++) { const a = i * step; s.push(Math.sin(a) * .4, 1, Math.cos(a) * .4, Math.sin(a) * 1.4, 1, Math.cos(a) * 1.4, t0 + i * dt); } };
const buffers = (sections = maxSections()) => ({ position: new Float32Array(sections * 6), trail: new Float32Array(sections * 4) });

test('the sample ring keeps the newest samples, never grows, and replaces a sample when no time passed', () => {
  const s = new TrailSamples(4);
  assert.equal(s.count, 0); assert.equal(s.newest, -Infinity);
  for (let i = 0; i < 7; i++) s.push(i, 0, 0, i, 1, 0, i * .01);
  assert.equal(s.count, 4); assert.equal(s.data.length, 4 * 9, 'the buffer is the one made at the start');
  assert.deepEqual([0, 1, 2, 3].map(i => s.data[s.at(i)]), [3, 4, 5, 6], 'oldest first');
  s.push(99, 0, 0, 99, 1, 0, .06); // the same time as the last: a paused frame
  assert.equal(s.count, 4); assert.equal(s.data[s.at(3)], 99, 'the last sample is replaced, not stacked');
  s.push(NaN, 0, 0, 0, 0, 0, 1); assert.equal(s.data[s.at(3)], 99, 'a broken sample is ignored');
  s.prune(.06 + TRAIL.life * 2, TRAIL.life); assert.equal(s.count, 0, 'everything faded is dropped');
  s.push(1, 0, 0, 1, 1, 0, 5); s.clear(); assert.equal(s.count, 0);
});

test('pruning keeps one sample past the ribbon\'s life so the tail shrinks smoothly', () => {
  const s = new TrailSamples(); sweep(s, 10);
  const now = 9 / 60 + .05; s.prune(now, .1);
  assert.ok(s.count >= 2);
  assert.ok(now - s.data[s.at(0) + 6] >= .1, 'the oldest kept sample is just past the life');
  assert.ok(now - s.data[s.at(1) + 6] < .1, 'the next one is inside it');
});

test('no ribbon while idle or with a single sample', () => {
  const s = new TrailSamples(), b = buffers();
  assert.equal(buildRibbon(s, 0, TRAIL.life, TRAIL.subdiv, b.position, b.trail), 0);
  s.push(0, 0, 0, 0, 1, 0, 0);
  assert.equal(buildRibbon(s, 0, TRAIL.life, TRAIL.subdiv, b.position, b.trail), 0);
  assert.equal(buildRibbon(s, 0, 0, TRAIL.subdiv, b.position, b.trail), 0, 'no life, no ribbon');
});

test('the ribbon ends exactly on the blade, is widest and newest there, and closes onto the tip\'s path as it ages', () => {
  const s = new TrailSamples(), b = buffers(); sweep(s, 8);
  const now = 7 / 60, n = buildRibbon(s, now, TRAIL.life, TRAIL.subdiv, b.position, b.trail);
  assert.equal(n, 7 * TRAIL.subdiv + 1);
  const last = (n - 1) * 6, a = 7 * .3;
  const near = (x: number, y: number) => assert.ok(Math.abs(x - y) < 1e-5, `${x} != ${y}`);
  near(b.position[last], Math.sin(a) * .4); near(b.position[last + 2], Math.cos(a) * .4); // the inner vertex is the blade's inner end
  near(b.position[last + 3], Math.sin(a) * 1.4); near(b.position[last + 5], Math.cos(a) * 1.4); // the tip vertex is the blade's tip
  assert.equal(b.trail[(n - 1) * 4 + 1], 0, 'the newest section has age 0');
  const width = (i: number) => Math.hypot(b.position[i * 6] - b.position[i * 6 + 3], b.position[i * 6 + 1] - b.position[i * 6 + 4], b.position[i * 6 + 2] - b.position[i * 6 + 5]);
  near(width(n - 1), 1);
  for (let i = 1; i < n; i++) { assert.ok(width(i) >= width(i - 1) - 1e-6, 'wider towards the blade'); assert.ok(b.trail[i * 4 + 1] <= b.trail[(i - 1) * 4 + 1] + 1e-6, 'newer towards the blade'); }
  for (let i = 0; i < n; i++) { assert.equal(b.trail[i * 4], 0); assert.equal(b.trail[i * 4 + 2], 1); assert.ok(b.trail[i * 4 + 1] >= 0 && b.trail[i * 4 + 1] <= 1); }
  assert.ok(width(0) < .5, 'the tail has narrowed');
});

test('a fast swing is smoothed: the sections between two samples follow the curve, not the chord', () => {
  const s = new TrailSamples(), b = buffers(); sweep(s, 8, .45);
  const n = buildRibbon(s, 7 / 60, 10, TRAIL.subdiv, b.position, b.trail); // a long life: no taper to speak of
  let worst = 0;
  for (let i = TRAIL.subdiv; i < n - TRAIL.subdiv; i++) worst = Math.max(worst, Math.abs(Math.hypot(b.position[i * 6 + 3], b.position[i * 6 + 5]) - 1.4));
  const chord = 1.4 * (1 - Math.cos(.45 / 2)); // how far a straight segment's middle falls short of the arc
  assert.ok(worst < chord * .25, `tip strays ${worst.toFixed(4)} from the arc; a faceted ribbon strays ${chord.toFixed(4)}`);
});

test('the ribbon never exceeds its buffers, and a blade that does not move gives no NaN', () => {
  const s = new TrailSamples(), b = buffers();
  for (let i = 0; i < 100; i++) s.push(1, 1, 1, 1, 2, 1, i / 144);
  const n = buildRibbon(s, 99 / 144, TRAIL.life, TRAIL.subdiv, b.position, b.trail);
  assert.equal(n, maxSections()); assert.ok(n * 6 <= b.position.length);
  assert.ok(finite(b.position, n * 6) && finite(b.trail, n * 4));
  const same = new TrailSamples(); for (let i = 0; i < 5; i++) same.push(1, 1, 1, 1, 2, 1, 3); // five frames with no time passing
  assert.equal(same.count, 1); assert.equal(buildRibbon(same, 3, TRAIL.life, TRAIL.subdiv, b.position, b.trail), 0);
  const small = { position: new Float32Array(5 * 6), trail: new Float32Array(5 * 4) };
  assert.ok(buildRibbon(s, 99 / 144, TRAIL.life, TRAIL.subdiv, small.position, small.trail) <= 5, 'a small buffer is never overrun');
});

test('a second strip joins the first through two unseen sections', () => {
  const s = new TrailSamples(), b = buffers(maxSections() * 2 + 4); sweep(s, 4);
  const one = buildRibbon(s, 3 / 60, TRAIL.life, 2, b.position, b.trail), two = buildRibbon(s, 3 / 60, TRAIL.life, 2, b.position, b.trail, one);
  assert.equal(two, one * 2 + 2);
  for (const i of [one, one + 1]) { assert.equal(b.trail[i * 4 + 1], 1); assert.equal(b.trail[i * 4 + 3], 1); } // age 1 draws nothing
  assert.equal(bridgeStrip(b.position, b.trail, 0, 1, 2, 3), 0, 'nothing to join at the start');
});

/** Points of a box from (x0,y0,z0) to (x1,y1,z1), turned `tilt` round x (how a weapon lies in the hand). */
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tilt = 1.2, n = 4) => {
  const out: number[] = [], c = Math.cos(tilt), s = Math.sin(tilt);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * j / n, z = z0 + (z1 - z0) * k / n; out.push(x, y * c - z * s, y * s + z * c); }
  return out;
};
const along = (tilt = 1.2) => [0, Math.cos(tilt), Math.sin(tilt)];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: number[], b: number[]) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map(v => v / l); };

test('the blade axis of each kind of weapon runs from the grip to the far end', () => {
  const kinds: Record<string, number[]> = {
    sword: [...box(-.06, -.2, -.05, .06, .0, .05), ...box(-.2, 0, -.06, .2, .06, .06), ...box(-.07, .06, -.03, .07, 1.05, .03)],
    hammer: [...box(-.04, -.2, -.04, .04, .7, .04), ...box(-.2, .7, -.14, .2, .95, .14), ...box(-.2, .7, -.14, .2, .95, .14)],
    scythe: [...box(-.03, -.25, -.03, .03, 1.15, .03), ...box(-.02, .95, 0, .02, 1.15, .55)],
    trident: [...box(-.03, -.2, -.03, .03, .9, .03), ...box(-.25, .9, -.03, -.19, 1.25, .03), ...box(-.03, .9, -.03, .03, 1.3, .03), ...box(.19, .9, -.03, .25, 1.25, .03)],
    candyCane: [...box(-.05, -.2, -.05, .05, .9, .05), ...box(-.05, .8, 0, .05, .95, .25)],
  };
  for (const [kind, points] of Object.entries(kinds)) {
    const blade = bladeAxis(points)!; assert.ok(blade, kind);
    const axis = unit(blade.grip, blade.tip);
    assert.ok(dot(axis, along()) > (kind === 'scythe' ? .9 : .97), `${kind}: the axis follows the shaft (${dot(axis, along()).toFixed(3)})`);
    assert.ok(Math.hypot(...blade.grip) < Math.hypot(...blade.tip), `${kind}: the grip is the end in the hand`);
    assert.ok(blade.length > .9 && blade.length < 1.7, `${kind}: length ${blade.length}`);
    const inner = unit(blade.grip, blade.inner); assert.ok(dot(inner, axis) > .999, 'the ribbon\'s inner edge lies on the axis');
    assert.ok(Math.abs(Math.hypot(blade.inner[0] - blade.grip[0], blade.inner[1] - blade.grip[1], blade.inner[2] - blade.grip[2]) - blade.length * TRAIL.inner) < 1e-6);
  }
  assert.equal(bladeAxis([]), null); assert.equal(bladeAxis([1, 1, 1, 1, 1, 1]), null, 'no spread, no axis');
  const plain = plainBlade(1); assert.ok(Math.abs(Math.hypot(...plain.tip) - 1) < 1e-9); assert.deepEqual(plain.grip, [0, 0, 0]);
});

test('a weapon model is measured in the hand\'s own space, from its marked pieces', () => {
  const hero = new T.Group(), hand = new T.Group(); hero.add(hand); hero.position.set(5, 0, -3); hero.rotation.y = 1; hand.position.set(.4, .7, 0);
  const blade = new T.Mesh(new T.BoxGeometry(.1, 1, .05), new T.MeshToonMaterial({ color: '#33ddff' })); blade.position.y = .6; blade.userData.blade = true;
  const glove = new T.Mesh(new T.BoxGeometry(.6, .1, .1), new T.MeshToonMaterial({ color: '#884422' })); // not the weapon: ignored
  const ink = new T.Mesh(new T.BoxGeometry(3, 3, 3), new T.MeshBasicMaterial()); ink.userData.outline = true;
  hand.add(blade, glove, ink);
  const held = measureBlade(hand);
  assert.ok(held.measured);
  assert.ok(Math.abs(held.blade.tip[1] - 1.1) < 1e-4 && Math.abs(held.blade.grip[1] - .1) < 1e-4, 'grip and tip in hand space, wherever the hero stands');
  assert.ok(held.tint && held.tint[2] > held.tint[0], 'the trail takes the blade\'s paint');
  const empty = measureBlade(new T.Group()); assert.equal(empty.measured, false); assert.deepEqual(empty.blade, plainBlade());
});

test('the trail colour comes from the bright, colourful pieces of the weapon', () => {
  const tint = bladeTint([.1, .1, .1, 500, .9, .9, .9, 200, .2, .9, 1, 150])!; // a dark grip, a grey guard, a cyan blade
  assert.ok(tint[2] > .95 && tint[0] < .6, `cyan wins: ${tint}`);
  assert.equal(Math.max(...tint), 1, 'as bright as that hue goes');
  assert.equal(bladeTint([]), null); assert.equal(bladeTint([0, 0, 0, 0]), null);
});

const POSE: SwingPose = { angle: 0, blend: 0, settling: false, emit: false, twist: 0, lean: 0 };
/** The frames of a swing as the game draws them: the press lands between two frames, so the first one drawn is one frame in. */
const frames = (fps: number, n = 12) => Array.from({ length: n }, (_, i) => Math.min(1, (i + 1) / fps / SWING.time));

test('the swing: on its target at once, then the follow-through and the settle, inside the same quarter second', () => {
  assert.equal(SWING.time, .25, 'the swing lasts what it always has');
  assert.equal(CUTS.length, 3);
  for (const cut of CUTS) {
    const dir = Math.sign(cut.to - cut.from);
    assert.equal(swingPose(cut, 0, POSE).angle, cut.from, 'it starts wound up'); assert.equal(POSE.blend, 1, 'with no time spent getting there');
    assert.ok(Math.sign(cut.from) === -dir && Math.sign(cut.to) === dir, 'the cut passes through straight ahead (0), where the target is');
    assert.ok(Math.abs(swingPose(cut, SWING.contact, POSE).angle) < 1e-9, 'at the contact moment the blade points at the target');
    assert.ok(Math.abs(swingPose(cut, SWING.follow, POSE).angle - (cut.to + dir * cut.over)) < 1e-9, 'the follow-through ends a little past the end of the cut');
    assert.equal(swingPose(cut, 1, POSE).blend, 0, 'and it is back in the stance at the end'); assert.ok(Math.abs(POSE.twist) < 1e-9 && Math.abs(POSE.lean) < 1e-9);
    let last = swingPose(cut, 0, POSE).angle;
    for (let t = 0; t <= SWING.follow; t += .005) { const a = swingPose(cut, t, POSE).angle; assert.ok((a - last) * dir >= -1e-9, 'the blade never turns back during the cut'); assert.ok(POSE.emit, 'it leaves a trail from the first moment to the end of the follow-through'); assert.equal(POSE.settling, false); last = a; }
    assert.equal(swingPose(cut, .95, POSE).emit, false, 'no trail while settling'); assert.equal(POSE.settling, true);
    assert.ok(Math.abs(cut.from) >= 1.4, 'a wide wind-up: the trail shows where the blade came from');
    assert.ok(Math.abs(Math.hypot(...cut.axis) - 1) < 1e-9);
  }
  assert.ok(Math.sign(CUTS[0].to - CUTS[0].from) !== Math.sign(CUTS[1].to - CUTS[1].from), 'the second cut comes back the other way');
  assert.ok(Math.abs(CUTS[2].axis[0]) > Math.abs(CUTS[0].axis[0]) + .3, 'the third comes down from above');
  assert.deepEqual([nextCut(0, .2), nextCut(1, .2), nextCut(2, .2), nextCut(1, 5), nextCut(2, -1)], [1, 2, 0, 0, 0]);
});

test('the contact frame is the damage frame: every cut of a sword, hammer or scythe, the chain, and the dive\'s chop', () => {
  // Damage lands when the attack is pressed, so the first frame drawn after the press shows the flash. The blade has to
  // be on the target in that frame (60 frames a second and slower), or on faster screens within one 60 Hz frame of it.
  assert.ok(contactDelay() >= .015 && contactDelay() <= .02, `the wind-up left inside the swing is ${contactDelay() * 1000} ms`);
  for (const [index, cut] of CUTS.entries()) { // 0 and 1: ordinary swings and the first two hits of a chain; 2: the chain's last hit and the dive's chop
    const dir = Math.sign(cut.to - cut.from);
    for (const fps of [30, 45, 60, 90, 120, 144]) {
      const reached = frames(fps).findIndex(t => swingPose(cut, t, POSE).angle * dir >= -.15); // within 9 degrees of the target, or past it
      assert.ok(reached >= 0 && reached / fps <= (fps > 60 ? 1 / 60 : 0) + 1e-9, `cut ${index} at ${fps} fps: contact ${reached} frames after the damage frame`);
    }
    // At 60 frames a second the damage frame shows the blade within a few degrees of the target, not already swung through.
    assert.ok(Math.abs(swingPose(cut, frames(60)[0], POSE).angle) < .12, `cut ${index}: the blade is on the target in the damage frame`);
    // The follow-through comes after it: two frames later the blade is clearly past the target.
    assert.ok(swingPose(cut, frames(60)[2], POSE).angle * dir > .4);
  }
});

test('the contact frame is the damage frame for fists: a jab, the uppercut of a chain\'s last hit, the pound of a dive', () => {
  const pose: PunchPose = { raise: 0, stretch: 1, fist: 1, twist: 0, lean: 0, step: 0 };
  assert.ok(PUNCH.contact * SWING.time >= .015 && PUNCH.contact * SWING.time <= .02);
  for (const kind of [0, 1, 2] as PunchKind[]) {
    assert.equal(punchPose(kind, 0, pose).stretch, 1, 'the arm starts at rest');
    for (const fps of [30, 60]) { punchPose(kind, frames(fps)[0], pose); assert.ok(pose.stretch > 1 + (PUNCH.stretch - 1) * (kind === 2 ? .45 : .9), `kind ${kind} at ${fps} fps: the fist is out in the damage frame`); }
    punchPose(kind, frames(144)[2], pose); assert.ok(pose.stretch > 1 + (PUNCH.stretch - 1) * (kind === 2 ? .45 : .9), 'on a fast screen, within one 60 Hz frame of it');
    punchPose(kind, 1, pose); assert.deepEqual([pose.raise, pose.stretch, pose.fist, pose.twist, pose.lean, pose.step].map(v => Math.abs(v - (v > .5 ? 1 : 0)) < 1e-9), [true, true, true, true, true, true], 'and back at rest at the end');
  }
  // A jab reaches further than the arm is long, with a bigger fist, a lean and a step in: it shows past the head.
  punchPose(0, PUNCH.contact, pose); assert.ok(pose.stretch >= 2 && pose.fist >= 1.4 && pose.step >= .2 && pose.lean > .15 && pose.twist < 0);
  assert.ok(Math.abs(pose.raise - PUNCH.jab) < 1e-9, 'a jab goes straight ahead');
  // The uppercut meets its target and carries on upwards.
  const meet = punchPose(1, PUNCH.contact, pose).raise, top = punchPose(1, PUNCH.hold, pose).raise; assert.ok(Math.abs(meet - PUNCH.upper) < 1e-9 && top < meet - 1, `the uppercut rises from ${meet} to ${top}`);
  assert.ok(punchPose(2, PUNCH.contact, pose).step === 0 && pose.twist === 0, 'the pound is square on, on the spot');
});

test('the air swing: the blade is on the line of the facing in the damage frame', () => {
  for (const seconds of [.3, .25]) for (const fps of [60, 30, 120]) {
    const lead = spinLead(seconds), turn = spinTurn(seconds - 1 / fps, lead) + SPIN.hold; // where the blade points, from the facing
    const off = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    assert.ok(off <= SPIN.speed * Math.abs(1 / fps - 1 / 60) + 1e-9, `${fps} fps: ${off.toFixed(3)} rad off`);
    if (fps === 60) assert.ok(off < 1e-9);
  }
  assert.equal(spinTurn(1, 0), (SPIN.start - 1) * SPIN.speed, 'the spin skill itself turns as it always has');
});

test('gameplay timing is untouched by the new swing', () => {
  assert.deepEqual({ ...MOVES.strike, hits: [...MOVES.strike.hits] }, { hits: [.8, .88, 1.12], reach: 2, cone: .5, windup: .1, gap: .16, recovery: .15, cooldown: 5, launch: 1.7, small: 1.2 });
  const world = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
  assert.match(world, /this\.punchT=SWING\.time/, 'a swing sets the same timer as before');
  assert.match(world, /this\.aimT=\.7;this\.punchT=\.12/, 'the gun\'s recoil is as it was');
  // The first frame drawn after the press shows the swing exactly at its contact, whatever the frame time or hit-stop.
  assert.match(world, /if\(this\.swingFresh\)\{this\.swingFresh=false;if\(this\.punchT>0\)this\.punchT=SWING\.time\*\(1-SWING\.contact\);\}/);
  assert.match(world, /if\(this\.spinFresh\)\{this\.spinT=this\.spinFresh;this\.spinFresh=0;\}/); assert.equal(PUNCH.contact, SWING.contact, 'fists and blades share the contact moment');
  { const turn = spinTurn(.3, spinLead(.3, 0)) + SPIN.hold; assert.ok(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < 1e-9, 'an air spin starts with the blade on the facing line'); }
  // Hits still land on the press: the attack functions call the combat rules first and only then start the animation.
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if\(combat\.basic\(e\)\)\{const stats=M\.activeStats\(state\),weapon=M\.weaponStats\(state\);combatTimers\.attackCooldown=\(weapon\.cd\?\?\.4\)\/Math\.max\(\.2,1\+stats\.haste\);/, 'the basic attack and its cooldown are as they were');
  assert.match(main, /world\.hitFeedback\([^\n]*\);if\(!hazard\|\|impact\)tone\(impact\?\.critical\?'crit':'hit'\);/, 'a hit still plays its sound (the call had slipped into a comment)');
  assert.match(main, /world\.readyTrail\(\(\)=>void compileAsyncSafe\(world\.renderer,world\.scene,world\.camera\)\);/, 'the trail\'s shader is compiled with the start-up warm-up');
});

/** Every drawn vertex of the wind in the buffers: its distance along the punch and across it, and its age. */
const windVerts = (made: number, position: Float32Array, trail: Float32Array, from: number[], dir: number[]) => {
  const out: { along: number; across: number; age: number }[] = [];
  for (let i = 0; i < made * 2; i++) {
    const age = trail[i * 2 + 1]; if (age >= 1) continue; // unseen: a join between two strips, or a strip's faded end
    const d = [position[i * 3] - from[0], position[i * 3 + 1] - from[1], position[i * 3 + 2] - from[2]], along = d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2];
    out.push({ along, across: Math.hypot(d[0] - dir[0] * along, d[1] - dir[1] * along, d[2] - dir[2] * along), age });
  }
  return out;
};

test('punch wind: a bold gust that runs 1.5 to 2.5 m from the fist in about 0.14 s, bounded, bigger for the last hit of a chain', () => {
  const w = new WindBursts(), n = WIND_SECTIONS + 8, position = new Float32Array(n * 6), trail = new Float32Array(n * 4), tint = new Float32Array(n * 8);
  assert.equal(buildWind(w, 0, position, trail, tint), 0, 'nothing while idle');
  // The gust's head: out at once, at its reach by the end of the travel, and the reach is what was asked for.
  assert.ok(WIND.travel >= .12 && WIND.travel <= .16);
  assert.ok(gustHead(0) > .25, 'it shows in the very frame of the punch'); assert.ok(Math.abs(gustHead(WIND.travel) - WIND.reach) < 1e-9); assert.equal(gustHead(1), gustHead(WIND.travel), 'it does not run on');
  for (const size of [WIND.size, WIND.big]) assert.ok(gustHead(WIND.travel, size) >= 1.5 && gustHead(WIND.travel, size) <= 2.5, `size ${size} runs ${gustHead(WIND.travel, size)} m`);
  assert.ok(WIND.big >= 1.3 && WIND.pound > WIND.big, 'the last hit of a chain is clearly bigger, the dive\'s pound bigger still');
  const from = [2, 1, 3], dir = [0, 0, 1];
  w.add(2, 1, 3, 0, 0, 5, 0); assert.equal(w.count, 1); // along +z, any length
  const at = WIND.travel, made = buildWind(w, at, position, trail, tint, 0, WIND.lines, 2, 20, 20);
  assert.ok(made > 0 && made <= WIND_SECTIONS / WIND.bursts + 2, `${made} sections for one burst`);
  assert.ok(finite(position, made * 6) && finite(trail, made * 4) && finite(tint, made * 8));
  for (let i = 0; i < made * 2; i++) if (trail[i * 2 + 1] < 1) assert.equal(tint[i * 4 + 3], 1, 'every drawn vertex is marked as wind (the shader draws it with a white core in a rim)');
  const verts = windVerts(made, position, trail, from, dir), far = Math.max(...verts.map(v => v.along)), wide = Math.max(...verts.map(v => v.across));
  assert.ok(far >= WIND.reach && far <= WIND.reach + .5, `the gust and its bow reach ${far.toFixed(2)} m`);
  assert.ok(wide >= WIND.width && wide <= WIND.ring + WIND.bow, `it is ${wide.toFixed(2)} m wide at most: bold, not a hair`);
  assert.ok(Math.min(...verts.map(v => v.along)) >= -.05, 'nothing is thrown behind the fist');
  // The gust is a thick tapered body: thin at its tail, widest near its head.
  const gust = Array.from({ length: 9 }, (_, i) => Math.hypot(position[i * 6] - position[i * 6 + 3], position[i * 6 + 1] - position[i * 6 + 4], position[i * 6 + 2] - position[i * 6 + 5]));
  assert.ok(Math.max(...gust) >= WIND.width * 1.2, `the gust is ${Math.max(...gust).toFixed(2)} m thick`); assert.ok(gust[0] < Math.max(...gust) * .3, 'tapered to its tail'); assert.ok(gust.indexOf(Math.max(...gust)) >= 4, 'widest towards the head');
  // The last hit of a chain: the same shape, bigger in every direction.
  const big = new WindBursts(); big.add(2, 1, 3, 0, 0, 1, 0, WIND.big);
  const madeBig = buildWind(big, at, position, trail, tint, 0, WIND.lines, 2, 20, 20), vertsBig = windVerts(madeBig, position, trail, from, dir);
  assert.equal(madeBig, made);
  assert.ok(Math.max(...vertsBig.map(v => v.along)) > far * 1.3 && Math.max(...vertsBig.map(v => v.across)) > wide * 1.3, 'the third hit goes further and wider');
  assert.ok(Math.max(...vertsBig.map(v => v.along)) <= (WIND.reach + .5) * WIND.big);
  assert.ok(buildWind(w, at, position, trail, tint, 0, WIND.linesLow, 2, 20, 20) < made, 'fewer speed lines on Battery saver');
  assert.ok(WIND.lines >= 2 && WIND.lines <= 3 && WIND.linesLow >= 2);
  w.anchor(7, 1, 3); assert.equal(w.data[w.at(0)], 7, 'its tail follows the fist');
  for (let i = 0; i < 9; i++) w.add(0, 0, 0, 1, 0, 0, .01 * i); assert.equal(w.count, WIND.bursts, 'never more than the ring holds');
  assert.ok(buildWind(w, .09, position, trail, tint) <= WIND_SECTIONS);
  const small = { position: new Float32Array(20 * 6), trail: new Float32Array(20 * 4), tint: new Float32Array(20 * 8) };
  assert.ok(buildWind(w, .09, small.position, small.trail, small.tint) <= 20, 'small buffers are never overrun');
  w.prune(10); assert.equal(w.count, 0); assert.equal(buildWind(w, 10, position, trail, tint), 0);
  w.add(0, 0, 0, 0, 0, 0, 0); assert.equal(w.count, 0, 'a punch with no direction makes no wind');
  w.add(0, 1, 0, 0, -1, 0, 0); assert.ok(finite(position, buildWind(w, .05, position, trail, tint) * 6), 'straight down is fine too');
});

test('punch wind: the ring of pressure opens where the punch landed; the strips face the camera; a time kept in single precision still draws', () => {
  const n = WIND_SECTIONS + 8, position = new Float32Array(n * 6), trail = new Float32Array(n * 4), tint = new Float32Array(n * 8);
  const ringOf = (made: number) => Array.from({ length: 15 }, (_, i) => made - 15 + i); // the ring is the last strip of a burst
  for (const [dir, cam] of [[[1, 0, 0], [0, 20, 20]], [[0, 0, -1], [0, 20, 20]], [[.6, 0, .8], [5, 18, 25]], [[0, .6, .8], [0, 20, 20]]] as const) {
    const w = new WindBursts(); w.add(0, 1, 0, dir[0], dir[1], dir[2], 0, 1, .1, .4, .9, 1.2);
    const made = buildWind(w, WIND.ringTime, position, trail, tint, 0, WIND.lines, cam[0], cam[1], cam[2]);
    // The ring: centred 1.2 m along the punch, open to its full radius, and seen face on (every point at right angles to the line of sight).
    const view = [cam[0], cam[1] - 1, cam[2]], vl = Math.hypot(...view); let centre = [0, 0, 0], worst = 0, radius = 0;
    for (const i of ringOf(made).slice(0, 14)) for (let k = 0; k < 3; k++) centre[k] += (position[i * 6 + k] + position[i * 6 + 3 + k]) / 28;
    assert.ok(Math.hypot(centre[0] - dir[0] * 1.2, centre[1] - 1 - dir[1] * 1.2, centre[2] - dir[2] * 1.2) < .05, `the ring opens at the contact point (${centre.map(v => v.toFixed(2))})`);
    for (const i of ringOf(made)) { const d = [position[i * 6 + 3] - centre[0], position[i * 6 + 4] - centre[1], position[i * 6 + 5] - centre[2]]; radius = Math.max(radius, Math.hypot(...d)); worst = Math.max(worst, Math.abs(d[0] * view[0] + d[1] * view[1] + d[2] * view[2]) / vl); }
    assert.ok(radius > WIND.ring * .9 && radius < WIND.ring * 1.2, `it has opened to ${radius.toFixed(2)} m`); assert.ok(worst < .08, 'it faces the camera');
    // The gust's width is square to the line of sight too: never edge-on, whichever way the punch goes.
    const w0 = [position[4 * 6 + 3] - position[4 * 6], position[4 * 6 + 4] - position[4 * 6 + 1], position[4 * 6 + 5] - position[4 * 6 + 2]];
    assert.ok(Math.abs(w0[0] * view[0] + w0[1] * view[1] + w0[2] * view[2]) / (Math.hypot(...w0) * vl) < .08 && Math.hypot(...w0) > .2);
  }
  // A pound: the ring lies flat on the ground under the fists, and is the widest of all.
  const pound = new WindBursts(); pound.add(0, .2, 0, 0, 0, 1, 0, WIND.pound, 1, 1, 1, 0, true);
  const made = buildWind(pound, WIND.ringTime, position, trail, tint, 0, WIND.lines, 0, 20, 20); let radius = 0;
  for (const i of ringOf(made)) { assert.ok(Math.abs(position[i * 6 + 1] - .2) < 1e-6 && Math.abs(position[i * 6 + 4] - .2) < 1e-6, 'flat'); radius = Math.max(radius, Math.hypot(position[i * 6 + 3], position[i * 6 + 5])); }
  assert.ok(radius > WIND.ring * WIND.big * 1.5, `the pound's ring opens to ${radius.toFixed(2)} m`);
  // The burst's start is stored in single precision and can read a hair after the frame's own time: it still draws in that frame.
  const late = new WindBursts(), now = 11.922000000000001; late.add(0, 1, 0, 1, 0, 0, now);
  assert.ok(late.data[late.at(0) + 6] !== now); assert.ok(buildWind(late, Math.min(now, late.data[late.at(0) + 6] - 1e-7), position, trail, tint) > 0, 'the wind shows in the frame of the punch');
});

test('the ribbon never joins two unrelated places: a new cut, a turn while swinging, a moved explorer', () => {
  const b = buffers(maxSections() + 12);
  /** The longest step of the tip between two neighbouring sections that are both drawn. */
  const longest = (n: number) => {
    let far = 0;
    for (let i = 1; i < n; i++) if (b.trail[i * 4 + 1] < 1 && b.trail[(i - 1) * 4 + 1] < 1) far = Math.max(far, Math.hypot(b.position[i * 6 + 3] - b.position[(i - 1) * 6 + 3], b.position[i * 6 + 4] - b.position[(i - 1) * 6 + 4], b.position[i * 6 + 5] - b.position[(i - 1) * 6 + 5]));
    return far;
  };
  const limit = TRAIL.maxStep / TRAIL.subdiv * 1.6; // a full-speed sample step, split into its sections (the curve may bulge a little)
  // 1. A chain: three cuts, each starting where the last one did not end (the blade snaps to the next wound-up pose).
  const chain = new TrailSamples(); let t = 0;
  for (let cut = 0; cut < 3; cut++) for (let i = 0; i < 8; i++) { const a = (cut % 2 ? -1 : 1) * (1.6 - i * .4) + cut * 2.2; chain.push(Math.sin(a) * .4, 1, Math.cos(a) * .4, Math.sin(a) * 1.5, 1 + cut * .3, Math.cos(a) * 1.5, t, i === 0); t += 1 / 60; }
  let n = buildRibbon(chain, t, 1, TRAIL.subdiv, b.position, b.trail); // a long life: all three ribbons are still there
  assert.ok(n > 3 * 7 * TRAIL.subdiv, 'all three ribbons are drawn'); assert.ok(longest(n) < limit, `no section longer than ${limit.toFixed(2)} m (${longest(n).toFixed(2)})`);
  let joins = 0; for (let i = 0; i < n; i++) if (b.trail[i * 4 + 1] === 1 && b.trail[i * 4 + 3] === 1) joins++; assert.equal(joins, 4, 'two unseen sections between one ribbon and the next');
  // It is the new cut's mark that separates them: the same blade path without it is one ribbon, joined end to start.
  const joined = new TrailSamples(); t = 0;
  for (let cut = 0; cut < 2; cut++) for (let i = 0; i < 8; i++) { const a = (cut % 2 ? -1 : 1) * (1.6 - i * .4) + cut * .9; joined.push(Math.sin(a) * .4, 1, Math.cos(a) * .4, Math.sin(a) * 1.5, 1, Math.cos(a) * 1.5, t); t += 1 / 60; }
  n = buildRibbon(joined, t, 1, TRAIL.subdiv, b.position, b.trail); assert.equal(n, 15 * TRAIL.subdiv + 1, 'one ribbon through both');
  // 2. The explorer is moved in mid swing (a respawn, a door, a rush): the tip jumps further than any swing moves it.
  const moved = new TrailSamples(); sweep(moved, 6); for (let i = 0; i < 6; i++) { const a = i * .3; moved.push(40 + Math.sin(a) * .4, 1, Math.cos(a) * .4, 40 + Math.sin(a) * 1.4, 1, Math.cos(a) * 1.4, (6 + i) / 60); }
  assert.equal(moved.starts(6), true, 'a jump of the tip starts a new ribbon by itself'); assert.equal(moved.starts(5), false);
  n = buildRibbon(moved, 12 / 60, 1, TRAIL.subdiv, b.position, b.trail); assert.ok(longest(n) < limit);
  // 3. Walking and turning hard while swinging: one ribbon, bent, with no long section.
  const turning = new TrailSamples();
  for (let i = 0; i < 14; i++) { const facing = i * .14, a = facing + 1.6 - i * .32, x = Math.sin(facing) * i * .1, z = Math.cos(facing) * i * .1; turning.push(x + Math.sin(a) * .4, 1, z + Math.cos(a) * .4, x + Math.sin(a) * 1.5, 1, z + Math.cos(a) * 1.5, i / 60, i === 0); }
  n = buildRibbon(turning, 14 / 60, 1, TRAIL.subdiv, b.position, b.trail); assert.equal(n, 13 * TRAIL.subdiv + 1, 'one unbroken ribbon'); assert.ok(longest(n) < limit, `${longest(n).toFixed(2)} m`);
  // 4. A ribbon born soft: its far end starts part faded and the fade runs out towards the blade.
  const soft = new TrailSamples(); for (let i = 0; i < 5; i++) soft.push(i * .2, 1, 0, i * .2, 2, 0, i / 600, i === 0, TRAIL.soft * (1 - i / 4));
  n = buildRibbon(soft, 4 / 600, TRAIL.life, 1, b.position, b.trail); assert.equal(n, 5);
  assert.ok(Math.abs(b.trail[1] - TRAIL.soft) < .05 && b.trail[4 * 4 + 1] < .05, 'faded at the far end, fresh at the blade');
  for (let i = 1; i < n; i++) assert.ok(b.trail[i * 4 + 1] <= b.trail[(i - 1) * 4 + 1] + 1e-6);
  // The ring never grows however many cuts are thrown into it, and nothing overruns the buffers.
  const many = new TrailSamples(); for (let i = 0; i < 400; i++) many.push(Math.sin(i), 1, Math.cos(i), Math.sin(i) * 2, 1, Math.cos(i) * 2, i / 60, i % 5 === 0);
  assert.equal(many.count, TRAIL.samples); n = buildRibbon(many, 400 / 60, 10, TRAIL.subdiv, b.position, b.trail); assert.ok(n * 6 <= b.position.length && finite(b.position, n * 6));
});

test('the trail mesh: hidden and empty while idle, one shared material, buffers made once', () => {
  const trail = new WeaponTrail(), other = new WeaponTrail(), hand = new T.Group(), blade = plainBlade();
  assert.equal(trail.mesh.visible, false); assert.equal(trail.mesh.geometry.drawRange.count, 0); assert.equal(trail.active, false);
  assert.equal(trail.mesh.material, other.mesh.material, 'every swinger shares the material'); assert.equal(trail.mesh.material, trailMaterial());
  assert.equal(trail.draw(0, 1, 1, 1, 1), false); assert.equal(trail.mesh.visible, false);
  const arrays = ['position', 'trail', 'tint'].map(k => trail.mesh.geometry.getAttribute(k).array);
  for (let i = 0; i < 12; i++) { hand.rotation.y = i * .3; hand.updateMatrixWorld(true); trail.sample(hand, blade, i / 60, i === 0); assert.equal(trail.draw(i / 60, 1, .2, .8, 1), i > 0); }
  assert.equal(trail.mesh.visible, true); assert.ok(trail.sections >= 2 && trail.sections <= maxSections());
  assert.equal(trail.mesh.geometry.drawRange.count, (trail.sections - 1) * 6);
  assert.ok(trail.mesh.geometry.drawRange.count <= trail.mesh.geometry.index!.count);
  assert.deepEqual(['position', 'trail', 'tint'].map(k => trail.mesh.geometry.getAttribute(k).array), arrays, 'no buffer was replaced');
  const tip = new T.Vector3(...blade.tip).applyMatrix4(hand.matrixWorld), p = trail.mesh.geometry.getAttribute('position'), v = trail.sections * 2 - 1;
  assert.ok(Math.hypot(p.getX(v) - tip.x, p.getY(v) - tip.y, p.getZ(v) - tip.z) < 1e-5, 'the ribbon\'s newest edge is on the blade\'s tip');
  assert.equal(trail.mesh.geometry.getAttribute('tint').getY(0), Math.fround(.8)); assert.equal(trail.mesh.geometry.getAttribute('tint').getW(0), 0, 'a blade\'s ribbon is drawn with the blade\'s look');
  const full = trail.sections; trail.draw(11 / 60, .45, 1, 1, 1); assert.ok(trail.sections < full, 'Battery saver: a shorter ribbon with fewer sections');
  assert.equal(trail.draw(11 / 60 + 1, 1, 1, 1, 1), false, 'faded out'); assert.equal(trail.mesh.visible, false); assert.equal(trail.active, false);
  trail.wind.add(0, 1, 0, 0, 0, 1, 20); assert.equal(trail.draw(20.05, 1, 1, 1, 1), true, 'wind alone shows in the same mesh'); assert.ok(trail.sections <= WIND_SECTIONS);
  assert.equal(trail.mesh.geometry.getAttribute('tint').getW(0), 1, 'and with the wind\'s look');
  trail.clear(); assert.equal(trail.mesh.visible, false);
  // A second cut while the first ribbon still shows: both are drawn, in the one mesh, and the first is not wiped.
  for (let i = 0; i < 6; i++) { hand.rotation.y = i * .3; hand.updateMatrixWorld(true); trail.sample(hand, blade, 30 + i / 60, i === 0); }
  trail.draw(30 + 5 / 60, 1, 1, 1, 1); const one = trail.sections;
  for (let i = 0; i < 4; i++) { hand.rotation.y = 2 - i * .3; hand.updateMatrixWorld(true); trail.sample(hand, blade, 30 + (6 + i) / 60, i === 0, i === 0 ? TRAIL.soft : 0); }
  trail.draw(30 + 9 / 60, 1, 1, 1, 1); assert.ok(trail.sections > one, 'the new ribbon is added to the old one'); assert.equal(trail.samples.count, 10);
  trail.clear();
});

test('trails are pooled: a few meshes, handed out and taken back', () => {
  const pool = new TrailPool(2), a = pool.take()!, b = pool.take()!;
  assert.ok(a && b && a !== b); assert.equal(pool.take(), null, 'all out: that swing shows no trail');
  pool.give(a); assert.equal(pool.take(), a, 'reused, not made again'); assert.equal(pool.made, 2);
});

test('hit reaction curve: at rest before and after, bounded, out fast and back', () => {
  assert.equal(reactCurve(0), 0); assert.equal(reactCurve(1), 0); assert.equal(reactCurve(-1), 0); assert.equal(reactCurve(2), 0); assert.equal(reactCurve(NaN), 0);
  assert.ok(Math.abs(reactCurve(REACT.out) - 1) < 1e-9, 'the far point');
  for (let t = 0; t <= 1; t += .01) { const k = reactCurve(t); assert.ok(k >= 0 && k <= 1); }
  assert.ok(REACT.out < .5, 'out faster than back'); assert.ok(REACT.time >= .12 && REACT.time <= .18);
});

test('hit reaction strength: criticals and big hits are stronger, bosses react less, never past the cap', () => {
  const plain = reactStrength({}), crit = reactStrength({ critical: true }), big = reactStrength({ big: true }), both = reactStrength({ critical: true, big: true });
  assert.equal(plain, 1); assert.ok(crit > plain && big > plain && both >= crit); assert.ok(both <= REACT.max);
  assert.equal(reactStrength({ boss: true }), REACT.boss); assert.ok(reactStrength({ boss: true, critical: true, big: true }) < plain, 'a boss stays heavy');
  assert.equal(reactStop({}, false), 0); assert.ok(reactStop({ big: true }, false) > 0 && reactStop({ critical: true }, false) >= reactStop({ big: true }, false));
  assert.equal(reactStop({ critical: true, big: true }, true), 0, 'never on Battery saver'); assert.ok(reactStop({ critical: true, big: true }, false) <= .06, 'a few frames, not added up');
});

test('a hit reaction moves only the drawn model, stays bounded and returns exactly to rest', () => {
  const enemy = { x: 4, z: -2, radius: .8, mesh: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } };
  const rest = () => { const m = enemy.mesh; m.position.x = enemy.x; m.position.z = enemy.z; m.rotation.x = .1; m.rotation.y = .7; m.rotation.z = 0; m.scale.x = m.scale.y = m.scale.z = 1.3; }; // what the game sets each frame
  const r = newReaction();
  rest(); assert.equal(applyReaction(enemy.mesh, r, 1 / 60), false, 'idle: nothing happens'); assert.equal(enemy.mesh.position.x, 4);
  startReaction(r, 3, 4, reactStrength({ critical: true, big: true }));
  let frames = 0, furthest = 0, live = true;
  while (live && frames < 100) {
    rest(); live = applyReaction(enemy.mesh, r, 1 / 60); frames++;
    const m = enemy.mesh, off = Math.hypot(m.position.x - enemy.x, m.position.z - enemy.z); furthest = Math.max(furthest, off);
    assert.ok(off <= REACT.push * REACT.max + 1e-9); assert.ok(Math.abs(m.rotation.x - .1) <= REACT.tilt * REACT.max + 1e-9 && Math.abs(m.rotation.z) <= REACT.tilt * REACT.max + 1e-9);
    assert.ok(m.scale.y > 1.3 * (1 - REACT.squash * REACT.max) - 1e-9 && m.scale.y <= 1.3 && m.scale.x >= 1.3);
    if (off > 1e-6) assert.ok((m.position.x - enemy.x) * 3 + (m.position.z - enemy.z) * 4 > 0, 'knocked along the blow');
    assert.equal(enemy.x, 4); assert.equal(enemy.z, -2); // the place the rules use never moves
  }
  assert.ok(frames >= 8 && frames <= 11, `over in about ${REACT.time} s (${frames} frames)`); assert.ok(furthest > .2, 'a critical big hit is clearly seen');
  const m = enemy.mesh; assert.deepEqual([m.position.x, m.position.z, m.rotation.x, m.rotation.z, m.scale.x, m.scale.y, m.scale.z], [4, -2, .1, 0, 1.3, 1.3, 1.3], 'the last step adds exactly nothing');
  rest(); assert.equal(applyReaction(enemy.mesh, r, 1 / 60), false); assert.equal(m.position.x, 4);
  // A boss moves less than half as far; a blow with no direction only squashes.
  const boss = newReaction(); startReaction(boss, 3, 4, reactStrength({ critical: true, big: true, boss: true })); let bossFar = 0;
  for (let i = 0; i < 12; i++) { rest(); applyReaction(enemy.mesh, boss, 1 / 60); bossFar = Math.max(bossFar, Math.hypot(m.position.x - 4, m.position.z + 2)); }
  assert.ok(bossFar > 0 && bossFar < furthest * .5);
  const still = newReaction(); startReaction(still, 0, 0, 1); rest(); applyReaction(enemy.mesh, still, .04); assert.equal(m.position.x, 4); assert.ok(m.scale.y < 1.3);
  const bad = newReaction(); startReaction(bad, NaN, 1, NaN); rest(); applyReaction(enemy.mesh, bad, .04); assert.ok(Number.isFinite(m.position.x + m.scale.y + m.rotation.x));
});

test('reactions reach the creatures the world does not pose itself, and a boss staggers where it stands', () => {
  // The numbers a body's owner composes into its own drawing (instanced raiders, a remote avatar) are the ones applyReaction adds.
  const model = { position: { x: 4, y: 0, z: -2 }, rotation: { x: 0, y: .7, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, a = newReaction(), b = newReaction(), pose = newReactionPose();
  startReaction(a, 3, 4, 1.4); startReaction(b, 3, 4, 1.4);
  for (let i = 0; i < 12; i++) {
    Object.assign(model.position, { x: 4, z: -2 }); Object.assign(model.rotation, { x: 0, z: 0 }); Object.assign(model.scale, { x: 1, y: 1, z: 1 });
    const live = applyReaction(model, a, 1 / 60); assert.equal(reactionPose(b, 1 / 60, .7, pose), live);
    assert.ok(Math.abs(model.position.x - 4 - pose.x) < 1e-12 && Math.abs(model.position.z + 2 - pose.z) < 1e-12 && Math.abs(model.rotation.x - pose.lean) < 1e-12 && Math.abs(model.rotation.z - pose.roll) < 1e-12 && Math.abs(model.scale.y - (1 - pose.squash)) < 1e-12);
  }
  assert.deepEqual(pose, newReactionPose(), 'over: all zero'); assert.equal(reactionPose(b, 1 / 60, .7, pose), false);
  // A boss is not moved: it tips further instead, clearly (more than 10 degrees for an ordinary hit), and comes back to rest.
  const boss = newReaction(); startReaction(boss, 0, 1, reactStrength({ boss: true }), true); let tip = 0;
  for (let i = 0; i < 12; i++) { reactionPose(boss, 1 / 60, 0, pose); assert.equal(pose.x, 0); assert.equal(pose.z, 0); tip = Math.max(tip, Math.abs(pose.lean)); }
  assert.ok(tip > .17 && tip < .3, `a boss tips ${tip.toFixed(2)} rad`); assert.equal(pose.lean, 0);
  const small = newReaction(); startReaction(small, 0, 1, reactStrength({})); let smallTip = 0, push = 0; for (let i = 0; i < 12; i++) { reactionPose(small, 1 / 60, 0, pose); smallTip = Math.max(smallTip, pose.lean); push = Math.max(push, pose.z); }
  assert.ok(push > .2 && smallTip > .2, 'a small creature is knocked back and tipped');
  assert.ok(reactStrength({ boss: true, titan: true }) < reactStrength({ boss: true }) * .5, 'a titan barely moves');
  // Where each kind of creature gets it. Ordinary creatures and bosses, the Vault's among them (they are plain creatures:
  // the Vault sets no `driver`), are posed by the world; a Rescue Call raider is an instance posed by its own view; a
  // Flag Rush hero is a remote avatar posed by animateRemotes.
  const read = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
  const world = read('world.ts'), dungeon = read('dungeon.ts'), view = read('rescue-view.ts'), rescue = read('rescue.ts');
  assert.match(world, /if\(e\.react&&e\.react\.left>0\)applyReaction\(e\.mesh,e\.react,dt\);/);
  assert.match(world, /startReaction\(e\.react\?\?=newReaction\(\),-dx,-dz,reactStrength\(\{critical,big,boss:e\.boss,titan:!!e\.definition\?\.titan\}\),e\.boss\)/);
  assert.doesNotMatch(dungeon, /\.driver\s*=/, 'Vault creatures are drawn by the world like any creature');
  assert.match(world, /if\(e\.driver\)\{const remote=this\.remotePlayers\?\.get\(e\.id\);if\(remote\)remote\.mesh\.userData\.react=e\.react;\}/);
  assert.match(world, /const react=u\.react as Reaction\|undefined;\s*if\(react&&body\)\{\s*if\(react\.left>0&&!flying\)\{reactionPose\(react,dt,m\.rotation\.y,REACT_POSE\)/);
  assert.match(view, /const react = this\.reactOf\?\.\(e\.id\);\s*if \(react && react\.left > 0\) \{/); assert.match(view, /reactCurve\(1 - react\.left \/ REACT\.time\) \* react\.strength/);
  assert.match(rescue, /s\.raiders\.reactOf = id => s\.proxies\.get\(id\)\?\.react;/);
});
