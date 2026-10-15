// Rescue Call's fitted camera (src/rescue-camera.ts): the whole route and every pad on screen at phone portrait,
// phone landscape and desktop sizes, inside the free rectangle when the whole field fits, never smaller than the
// readability floor, and the lane running the right way (raiders from the top in portrait, from the right otherwise).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildField, pointAt, toWorld, chooseOrientation, wideScreen, type Field } from '../src/rescue-rules.ts';
import { fitView, screenOf, footprintOf, RESCUE_VIEW, type Rect, type Ground } from '../src/rescue-camera.ts';
import { RESCUE, type MissionId } from '../src/rescue-content.ts';

const MISSIONS: MissionId[] = ['toy', 'candy', 'jungle'];
// Free rectangles as the runtime measures them (rescue.ts freeRect): under the mission HUD, above the stick in portrait,
// and beside the build drawer when it is open.
const SIZES: Array<{ name: string; w: number; h: number; free: Rect; drawer?: Rect }> = [
  { name: 'phone portrait 390x844', w: 390, h: 844, free: { left: 8, top: 239, right: 382, bottom: 692 } },
  { name: 'phone portrait 390x844, drawer open', w: 390, h: 844, free: { left: 8, top: 239, right: 382, bottom: 619 } },
  { name: 'phone landscape 844x390', w: 844, h: 390, free: { left: 8, top: 141, right: 836, bottom: 382 } },
  { name: 'phone landscape 844x390, drawer open', w: 844, h: 390, free: { left: 8, top: 141, right: 621, bottom: 382 } },
  { name: 'desktop 1600x900', w: 1600, h: 900, free: { left: 8, top: 199, right: 1592, bottom: 892 } },
  { name: 'desktop 1600x900, drawer open', w: 1600, h: 900, free: { left: 8, top: 199, right: 1242, bottom: 892 } },
];
function points(field: Field, o: 'portrait' | 'landscape'): Ground[] {
  const out: Ground[] = [];
  for (const l of field.lanes) for (const rt of l.routes) for (let d = 0; d <= rt.length + 1.9; d += 2) out.push(toWorld(pointAt(rt, Math.min(d, rt.length)), o));
  for (const p of field.pads) out.push(toWorld(p, o));
  return out;
}

for (const size of SIZES) for (const mission of MISSIONS) {
  test(`Rescue camera: ${mission} at ${size.name} keeps the whole route and every pad on screen`, () => {
    const o = chooseOrientation(size.w, size.h), field = buildField(mission, wideScreen(o, size.w)), pts = points(field, o);
    const camp = toWorld(RESCUE.camp, o);
    // The explorer anywhere on the field: at the camp, in the middle, at the raiders' end.
    for (const at of [{ x: -26, z: 0 }, { x: 0, z: 0 }, { x: 28, z: 10 }]) {
      const fit = fitView(pts, size.w, size.h, size.free, o, toWorld(at, o), { anchor: camp });
      assert.ok(fit.pxPerM >= RESCUE_VIEW.minPxPerM - .05, `readable: ${fit.pxPerM.toFixed(1)} px/m`);
      // The explorer stays in the free part of the screen. Following them to the raiders' end (only where the whole field
      // cannot fit at a readable scale) may scroll your end away; anywhere else the whole route stays on screen.
      const me = screenOf(fit, size.w, size.h, toWorld(at, o));
      assert.ok(me.x >= size.free.left - 1 && me.x <= size.free.right + 1 && me.y >= size.free.top - 1 && me.y <= size.free.bottom + 1, `explorer in the free area (${me.x.toFixed(0)}, ${me.y.toFixed(0)})`);
      if (at.x > 20 && !fit.whole) continue;
      for (const p of pts) {
        const s = screenOf(fit, size.w, size.h, p);
        assert.ok(s.x >= -1 && s.x <= size.w + 1 && s.y >= -1 && s.y <= size.h + 1, `route point ${p.x.toFixed(1)},${p.z.toFixed(1)} on screen (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`);
        if (fit.whole) assert.ok(s.x >= size.free.left - 1 && s.x <= size.free.right + 1 && s.y >= size.free.top - 1 && s.y <= size.free.bottom + 1, 'inside the free rectangle when the whole field fits');
      }
      // Your end is never under the drawer or off the free part of the screen.
      const end = screenOf(fit, size.w, size.h, camp);
      assert.ok(end.x >= size.free.left - 1 && end.x <= size.free.right + 1 && end.y >= size.free.top - 1 && end.y <= size.free.bottom + 1, `lane end in the free area (${end.x.toFixed(0)}, ${end.y.toFixed(0)})`);
    }
  });
}

test('Rescue camera: the lane runs top to bottom on a phone held upright and right to left on wide screens', () => {
  for (const size of SIZES) {
    const o = chooseOrientation(size.w, size.h), field = buildField('toy', wideScreen(o, size.w)), pts = points(field, o);
    const fit = fitView(pts, size.w, size.h, size.free, o, toWorld({ x: 0, z: 0 }, o));
    for (const l of field.lanes) for (const rt of l.routes) {
      const a = screenOf(fit, size.w, size.h, toWorld(rt.pts[0], o)), b = screenOf(fit, size.w, size.h, toWorld(rt.pts[rt.pts.length - 1], o));
      if (o === 'portrait') assert.ok(b.y - a.y > Math.abs(b.x - a.x) * 2, `${size.name}: raiders walk down the screen`);
      else assert.ok(a.x - b.x > Math.abs(b.y - a.y) * 2, `${size.name}: raiders walk right to left`);
    }
  }
});

test('Rescue camera: wide screens fit the whole field; a phone held upright follows the explorer at the readable scale', () => {
  const at = (size: typeof SIZES[number]) => { const o = chooseOrientation(size.w, size.h); return fitView(points(buildField('jungle', wideScreen(o, size.w)), o), size.w, size.h, size.free, o, toWorld({ x: 0, z: 0 }, o)); };
  assert.equal(at(SIZES[4]).whole, true, 'desktop sees the whole field');
  assert.equal(at(SIZES[5]).whole, true, 'desktop with the drawer open still sees the whole field');
  const portrait = at(SIZES[0]);
  assert.equal(portrait.whole, false); assert.ok(Math.abs(portrait.pxPerM - RESCUE_VIEW.minPxPerM) < .3);
  // The steeper portrait camera looks down more than the explorer's own (42 to 51.5 degrees) and more than landscape.
  const pitch = (f: { offset: [number, number, number] }) => Math.atan2(f.offset[1], f.offset[2]) * 180 / Math.PI;
  assert.ok(pitch(portrait) > 58 && pitch(portrait) < 70); assert.ok(pitch(at(SIZES[4])) > 51.5 && pitch(at(SIZES[4])) < pitch(portrait));
});

test('Rescue camera: following never slides the view past the field ends (no bare edge or sky)', () => {
  const size = SIZES[0], o = 'portrait' as const, pts = points(buildField('toy', false), o);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  for (const lx of [-60, -27, 0, 27, 60]) {
    const fit = fitView(pts, size.w, size.h, size.free, o, toWorld({ x: lx, z: 0 }, o), { anchor: toWorld(RESCUE.camp, o) });
    const top = screenOf(fit, size.w, size.h, { x: (x0 + x1) / 2, z: z0 - RESCUE_VIEW.margin }), bottom = screenOf(fit, size.w, size.h, { x: (x0 + x1) / 2, z: z1 + RESCUE_VIEW.margin });
    // The field (with its margin) always reaches past the free rectangle's top or bottom edge on the side the camera is not clamped to.
    assert.ok(top.y <= size.free.top + 2 || bottom.y >= size.free.bottom - 2, `explorer at ${lx}: the view stays on the field`);
    assert.ok(top.y <= size.free.top + 2 && bottom.y >= size.free.bottom - 2, `explorer at ${lx}: the free rectangle is all field (${top.y.toFixed(0)}..${bottom.y.toFixed(0)})`);
  }
  // The ground in view, measured for the shadow box, lies around the target and reaches no further than the camera can see.
  const fp = footprintOf(fitView(pts, size.w, size.h, size.free, o, toWorld({ x: 0, z: 0 }, o)), size.w, size.h);
  assert.equal(fp.length, 4); for (const p of fp) assert.ok(Math.hypot(p.x, p.z) < 160);
});
