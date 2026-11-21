import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { BED_HEIGHT, CARD_INK, CROP_BOOST, CROP_PRESENTATION_SCALE, FOOTPRINT, HARVEST_TIME, RIPE_PX, SOIL_Y, STAGE_SCALE, TREE_BOOST, VIEW_PITCH, bakePitch, bedFlip, bedScale, cardCentre, cardWidth, cropBadgeAnchor, cropStage, footprintScale, harvestFlight, phonePxPerMetre, popScale, syncBakePitch, viewBounds } from '../src/crop-cards.ts';
import { CAMERA_PITCH, cameraPitch, setCameraPitch } from '../src/camera-rig.ts';
import { perfFlags } from '../src/perf-flags.ts';
import { BED_HALF } from '../src/model.ts';
import { INK } from '../src/outline.ts';
import { GardenBeds } from '../src/garden-beds.ts';

test('crop stages follow the reference: sprout below 50 %, young until ripe, ripe at 100 %', () => {
  assert.equal(cropStage(null, 1), 0);
  assert.deepEqual([0, .2, .49].map(p => cropStage('radish', p)), [1, 1, 1]);
  assert.deepEqual([.5, .99].map(p => cropStage('radish', p)), [2, 2]);
  assert.equal(cropStage('radish', 1), 3);
  assert.deepEqual(STAGE_SCALE, [0, 1.4, .55, 1.25]);
});

const degrees = (r: number) => r * 180 / Math.PI;
test('the atlas is baked at the pitch of the camera the player uses: 30, 42 and 51.5 degrees', () => {
  try {
    for (const deg of [30, 42, 51.5]) {
      setCameraPitch(deg); const baked = syncBakePitch();
      assert.equal(baked, bakePitch()); assert.ok(Math.abs(degrees(bakePitch()) - cameraPitch()) < .05, deg + ' degrees'); assert.ok(Math.abs(degrees(bakePitch()) - deg) < .05);
      if (deg === 51.5) assert.equal(bakePitch(), VIEW_PITCH, 'the classic camera is the reference offset itself');
      // What is measured follows: a 1 m cube shows less of its top from a lower camera.
      const b = viewBounds(new T.Mesh(new T.BoxGeometry(1, 1, 1).translate(0, .5, 0)))!;
      assert.ok(Math.abs(b.top - (Math.cos(bakePitch()) + Math.sin(bakePitch()))) < 1e-9);
      // The ready badge stands on the card's own plane.
      const a = cropBadgeAnchor('carrot', .72); assert.ok(Math.abs(Math.atan2(a.back, a.y - SOIL_Y) - bakePitch()) < 1e-9);
    }
    setCameraPitch(CAMERA_PITCH.initial); syncBakePitch(); assert.ok(Math.abs(degrees(bakePitch()) - 42) < 1e-9, 'a new player: 42 degrees');
    // A camera turned later does not move the cards until the next bake (the re-bake on the slider is round 2).
    setCameraPitch(30); assert.ok(Math.abs(degrees(bakePitch()) - 42) < 1e-9);
    // With the toy finish off the cards are the reference's again.
    perfFlags.ownRamp = false; syncBakePitch(); assert.equal(bakePitch(), VIEW_PITCH);
  } finally { perfFlags.ownRamp = true; setCameraPitch(CAMERA_PITCH.max); syncBakePitch(); }
});

test('a ripe card is never wider than 0.95 of its bed, at 30, 42 and 51.5 degrees', () => {
  const bed = 2 * BED_HALF, shapes: Array<[string, T.BufferGeometry]> = [
    ['a melon lying down', new T.SphereGeometry(.5, 12, 8).scale(1.6, .7, 1).translate(0, .35, 0)],
    ['a tall corn', new T.CylinderGeometry(.15, .15, 1.4, 8).translate(0, .7, 0)],
    ['a lopsided pumpkin', new T.BoxGeometry(1.2, .6, .8).translate(.3, .3, 0)],
    ['a tree crown', new T.SphereGeometry(.7, 12, 8).translate(0, 1.2, 0)],
  ];
  try {
    for (const deg of [30, 42, 51.5]) {
      setCameraPitch(deg); syncBakePitch();
      for (const [name, geometry] of shapes) for (const boost of [CROP_BOOST[3], TREE_BOOST[3]]) {
        const b = viewBounds(new T.Mesh(geometry))!, full = STAGE_SCALE[3] * bedScale(b) * boost, scale = footprintScale(b, full);
        assert.ok(scale <= full + 1e-12, 'the cap never enlarges');
        assert.ok(cardWidth(b, scale) <= FOOTPRINT * bed + 1e-9, name + ' at ' + deg + ': ' + cardWidth(b, scale).toFixed(3) + ' m in a ' + bed + ' m bed');
        // The card is moved so its silhouette is centred on the bed: both sides, mirrored or not, stay inside it.
        for (const flip of [1, -1]) for (const edge of [b.left, b.right]) assert.ok(Math.abs((edge - cardCentre(b)) * flip * scale * .72) <= FOOTPRINT * BED_HALF + 1e-9);
        if (cardWidth(b, full) <= FOOTPRINT * bed) assert.equal(scale, full, 'a crop that fits keeps its size');
      }
    }
    assert.equal(FOOTPRINT, .95);
    // The melon is the case that hung over its neighbours: uncapped it is wider than a bed.
    const melon = viewBounds(new T.Mesh(shapes[0][1]))!, full = STAGE_SCALE[3] * bedScale(melon) * CROP_BOOST[3];
    assert.ok(cardWidth(melon, full) > bed); assert.ok(footprintScale(melon, full) < full);
    const lopsided = viewBounds(new T.Mesh(shapes[2][1]))!; assert.ok(Math.abs(cardCentre(lopsided) - .3) < 1e-6, 'a lopsided crop is centred by its silhouette');
    perfFlags.ownRamp = false; assert.equal(footprintScale(melon, full), full, 'off: as before'); assert.equal(cardCentre(lopsided), 0);
  } finally { perfFlags.ownRamp = true; setCameraPitch(CAMERA_PITCH.max); syncBakePitch(); }
});

test('the card rim is our own ink, not the reference colour', () => {
  assert.equal(CARD_INK, INK); assert.notEqual(CARD_INK.toLowerCase(), '#3a2433');
});

test('the crop update enlarges mature plants 25%; the reference pitch is kept for the look switch', () => {
  assert.ok(Math.abs(VIEW_PITCH * 180 / Math.PI - 51.5) < .1); assert.equal(bakePitch(), VIEW_PITCH);
  assert.ok(Math.abs(phonePxPerMetre() - 41.1) < .2);
  assert.ok(Math.abs(BED_HEIGHT * STAGE_SCALE[3] * phonePxPerMetre() - RIPE_PX) < 1e-9);
  assert.equal(CROP_PRESENTATION_SCALE,1.25);assert.equal(RIPE_PX,50);
});

test('view bounds put the pivot at the front ground point and measure the on-screen height', () => {
  // A 1 m cube standing on the ground: from 51.5° its silhouette is the front face plus the foreshortened top.
  const cube = new T.Mesh(new T.BoxGeometry(1, 1, 1).translate(0, .5, 0));
  const b = viewBounds(cube)!, c = Math.cos(VIEW_PITCH), s = Math.sin(VIEW_PITCH);
  assert.equal(b.front, .5); assert.equal(b.left, -.5); assert.equal(b.right, .5);
  assert.ok(Math.abs(b.bottom) < 1e-9, 'the front bottom edge is the pivot');
  assert.ok(Math.abs(b.top - (c + s)) < 1e-9, 'front face (cos) plus the top seen from above (sin)');
  // Every model is normalised to the same height; the sprout to a third of it.
  assert.ok(Math.abs(bedScale(b) * (b.top - b.bottom) - BED_HEIGHT) < 1e-9);
  assert.ok(bedScale(b, true) < bedScale(b) / 3);
});

test('sprout, young and ripe sizes grow in order and the harvest flight matches the reference timing', () => {
  const unit = { front: 0, left: -.25, right: .25, bottom: 0, top: .5 }, sprout = { ...unit, top: .25 };
  const px = (scale: number, b: typeof unit) => scale * (b.top - b.bottom) * phonePxPerMetre();
  const sizes = [px(STAGE_SCALE[1] * bedScale(sprout, true), sprout), px(STAGE_SCALE[2] * bedScale(unit), unit), px(STAGE_SCALE[3] * bedScale(unit), unit)];
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], sizes.join(' < '));
  assert.ok(Math.abs(sizes[2] - 50) < 1e-6);
  assert.ok(Math.abs(sizes[0] - 40 / 1.25 * .32 * 1.4) < 1e-6,'sprout screen size is unchanged by the mature enlargement');
  assert.equal(HARVEST_TIME, .45);
  assert.equal(harvestFlight(0).lift, 0); assert.ok(Math.abs(harvestFlight(.5).lift - 1.6) < 1e-9); assert.ok(Math.abs(harvestFlight(1).lift) < 1e-9);
  assert.ok(Math.abs(harvestFlight(0).scale - 1.4) < 1e-9); assert.ok(Math.abs(harvestFlight(1).scale - .28) < 1e-9);
  assert.equal(popScale(0), 0); assert.equal(popScale(1), 1);
  const flips = Array.from({ length: 33 }, (_, i) => bedFlip(i));
  assert.ok(flips.includes(1) && flips.includes(-1));
});

test('ready badges remain above the enlarged silhouette even before model assets load',()=>{
  for(const crop of ['carrot','apple','grape','pineapple']){
    const a=cropBadgeAnchor(crop,.88),up=(a.y-SOIL_Y)*Math.cos(VIEW_PITCH)+a.back*Math.sin(VIEW_PITCH);
    assert.ok(Number.isFinite(a.y)&&Number.isFinite(a.back));
    assert.ok(up>RIPE_PX/phonePxPerMetre()*.88,'badge clears the ripe crop and idle bob');
  }
});

test('garden beds draw as instances that receive but never cast shadows, rebuilt only on change', () => {
  const beds = new GardenBeds();
  let made = 0;
  const template = () => { made++; const g = new T.Group(); for (const [x, color] of [[0, '#a00'], [1, '#0a0'], [2, '#00a']] as const) { const m = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color })); m.position.x = x; g.add(m); } return g; };
  const layout = Array.from({ length: 33 }, (_, i) => ({ x: i * 2.25, z: 0 }));
  beds.sync(template, 'boxes', layout);
  // Three plain colours merge into one vertex-coloured mesh: one draw for every bed.
  assert.equal(beds.draws, 1);
  const mesh = beds.group.children[0] as T.InstancedMesh;
  assert.ok(mesh instanceof T.InstancedMesh); assert.equal(mesh.count, 33); assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true);
  const m = new T.Matrix4(), p = new T.Vector3(); mesh.getMatrixAt(5, m); p.setFromMatrixPosition(m); assert.equal(p.x, 5 * 2.25);
  beds.sync(template, 'boxes', layout); assert.equal(made, 1, 'same layout: no rebuild');
  beds.sync(template, 'boxes', layout.slice(0, 9)); assert.equal(made, 2); assert.equal((beds.group.children[0] as T.InstancedMesh).count, 9);
  beds.sync(template, 'boxes', []); assert.equal(beds.draws, 0);
});
