import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { TRAIL, SWING, CUTS, TrailSamples, buildRibbon, bridgeStrip, bladeAxis, bladeTint, plainBlade, maxSections, swingPose, nextCut, type SwingPose } from '../src/trail-ribbon.ts';
import { WIND, WIND_SECTIONS, WindBursts, buildWind } from '../src/punch-wind.ts';
import { WeaponTrail, TrailPool, measureBlade, trailMaterial } from '../src/weapon-trail.ts';
import { REACT, reactCurve, reactStrength, reactStop, newReaction, startReaction, applyReaction } from '../src/hit-react.ts';
import { MOVES } from '../src/moves.ts';

const finite = (a: ArrayLike<number>, n: number) => { for (let i = 0; i < n; i++) if (!Number.isFinite(a[i])) return false; return true; };
/** A blade 1 m long swept round the y axis: its inner end at radius .4, its tip at 1.4. */
const sweep = (s: TrailSamples, frames: number, step = .3, dt = 1 / 60, t0 = 0) => { for (let i = 0; i < frames; i++) { const a = i * step; s.push(Math.sin(a) * .4, 1, Math.cos(a) * .4, Math.sin(a) * 1.4, 1, Math.cos(a) * 1.4, t0 + i * dt); } };
const buffers = (sections = maxSections()) => ({ position: new Float32Array(sections * 6), trail: new Float32Array(sections * 4) });

test('the sample ring keeps the newest samples, never grows, and replaces a sample when no time passed', () => {
  const s = new TrailSamples(4);
  assert.equal(s.count, 0); assert.equal(s.newest, -Infinity);
  for (let i = 0; i < 7; i++) s.push(i, 0, 0, i, 1, 0, i * .01);
  assert.equal(s.count, 4); assert.equal(s.data.length, 4 * 7, 'the buffer is the one made at the start');
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

test('the swing: a pull-back, the cut, a follow-through and the settle, inside the same quarter second', () => {
  const pose: SwingPose = { angle: 0, blend: 0, settling: false, emit: false, twist: 0, lean: 0 };
  assert.equal(SWING.time, .25, 'the swing lasts what it always has');
  assert.equal(CUTS.length, 3);
  for (const cut of CUTS) {
    const dir = Math.sign(cut.to - cut.from);
    assert.equal(swingPose(cut, 0, pose).blend, 0, 'starts from the pose it was in');
    assert.ok(Math.abs(swingPose(cut, SWING.back, pose).angle - (cut.from - dir * cut.back)) < 1e-9, 'pulled back before the cut');
    assert.equal(pose.blend, 1);
    assert.ok(Math.abs(swingPose(cut, SWING.cut, pose).angle - cut.to) < 1e-9, 'the cut ends at its end');
    assert.ok(Math.abs(swingPose(cut, SWING.follow, pose).angle - (cut.to + dir * cut.over)) < 1e-9, 'then runs a little past it');
    assert.equal(swingPose(cut, 1, pose).blend, 0, 'and is back in the stance at the end'); assert.ok(Math.abs(pose.twist) < 1e-9 && Math.abs(pose.lean) < 1e-9);
    // The cut is the fast part: more than half of the whole turn in under 40% of the time.
    const turn = Math.abs(cut.to - cut.from) + cut.back; assert.ok(turn / ((SWING.cut - SWING.back) * SWING.time) > 20, 'a fast arc (rad/s)');
    let last = swingPose(cut, SWING.back, pose).angle;
    for (let t = SWING.back; t <= SWING.follow; t += .01) { const a = swingPose(cut, t, pose).angle; assert.ok((a - last) * dir >= -1e-9, 'the blade never turns back during the cut'); assert.ok(pose.emit, 'it leaves a trail all through the cut'); last = a; }
    assert.equal(swingPose(cut, SWING.back / 2, pose).emit, false); assert.equal(swingPose(cut, .95, pose).emit, false, 'no trail while pulling back or settling');
    assert.ok(Math.abs(Math.hypot(...cut.axis) - 1) < 1e-9);
  }
  assert.ok(Math.sign(CUTS[0].to - CUTS[0].from) !== Math.sign(CUTS[1].to - CUTS[1].from), 'the second cut comes back the other way');
  assert.ok(Math.abs(CUTS[2].axis[0]) > Math.abs(CUTS[0].axis[0]) + .3, 'the third comes down from above');
  assert.ok(SWING.contact > SWING.back && SWING.contact < SWING.cut);
  assert.deepEqual([nextCut(0, .2), nextCut(1, .2), nextCut(2, .2), nextCut(1, 5), nextCut(2, -1)], [1, 2, 0, 0, 0]);
});

test('gameplay timing is untouched by the new swing', () => {
  assert.deepEqual({ ...MOVES.strike, hits: [...MOVES.strike.hits] }, { hits: [.8, .88, 1.12], reach: 2, cone: .5, windup: .1, gap: .16, recovery: .15, cooldown: 5, launch: 1.7, small: 1.2 });
  const world = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
  assert.match(world, /this\.punchT=SWING\.time/, 'a swing sets the same timer as before');
  assert.match(world, /this\.aimT=\.7;this\.punchT=\.12/, 'the gun\'s recoil is as it was');
});

test('punch wind: nothing while idle, bounded, ahead of the fist, bigger for the last hit of a chain', () => {
  const w = new WindBursts(), n = WIND_SECTIONS + 8, position = new Float32Array(n * 6), trail = new Float32Array(n * 4), tint = new Float32Array(n * 6);
  assert.equal(buildWind(w, 0, position, trail, tint), 0);
  w.add(2, 1, 3, 0, 0, 5, 0); // along +z, any length
  assert.equal(w.count, 1);
  const at = WIND.life * .5, made = buildWind(w, at, position, trail, tint);
  assert.ok(made > 0 && made <= WIND_SECTIONS);
  assert.ok(finite(position, made * 6) && finite(trail, made * 4));
  let far = 0; for (let i = 0; i < made * 2; i++) { assert.ok(position[i * 3 + 2] >= 3 - 1e-6, 'the wind runs ahead of the fist, never behind it'); far = Math.max(far, position[i * 3 + 2] - 3); }
  assert.ok(far > .8 && far < 3, `it reaches ${far.toFixed(2)} m`);
  const big = new WindBursts(); big.add(2, 1, 3, 0, 0, 1, 0, WIND.big);
  const madeBig = buildWind(big, at, position, trail, tint); let farBig = 0; for (let i = 0; i < madeBig * 2; i++) farBig = Math.max(farBig, position[i * 3 + 2] - 3);
  assert.ok(farBig > far * 1.3, 'the big one goes further');
  assert.ok(buildWind(w, at, position, trail, tint, 0, WIND.streaksLow) < made, 'fewer streaks on Battery saver');
  w.anchor(7, 1, 3); assert.equal(w.data[w.at(0)], 7, 'its tails follow the fist');
  for (let i = 0; i < 9; i++) w.add(0, 0, 0, 1, 0, 0, .01 * i); assert.equal(w.count, WIND.bursts, 'never more than the ring holds');
  assert.ok(buildWind(w, .09, position, trail, tint) <= WIND_SECTIONS);
  w.prune(10); assert.equal(w.count, 0); assert.equal(buildWind(w, 10, position, trail, tint), 0);
  w.add(0, 0, 0, 0, 0, 0, 0); assert.equal(w.count, 0, 'a punch with no direction makes no wind');
  w.add(0, 1, 0, 0, -1, 0, 0); assert.ok(finite(position, buildWind(w, .05, position, trail, tint) * 6), 'straight down is fine too');
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
  assert.equal(trail.mesh.geometry.getAttribute('tint').getY(0), Math.fround(.8));
  const full = trail.sections; trail.draw(11 / 60, .45, 1, 1, 1); assert.ok(trail.sections < full, 'Battery saver: a shorter ribbon with fewer sections');
  assert.equal(trail.draw(11 / 60 + 1, 1, 1, 1, 1), false, 'faded out'); assert.equal(trail.mesh.visible, false); assert.equal(trail.active, false);
  trail.wind.add(0, 1, 0, 0, 0, 1, 20); assert.equal(trail.draw(20.05, 1, 1, 1, 1), true, 'wind alone shows in the same mesh'); assert.ok(trail.sections <= WIND_SECTIONS);
  trail.clear(); assert.equal(trail.mesh.visible, false);
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
