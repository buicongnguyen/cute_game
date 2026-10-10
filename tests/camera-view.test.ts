import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA, CAMERA_PITCH, cameraOffset, cameraPitch, setCameraPitch } from '../src/camera-rig.ts';

test('the camera angle setting keeps the distance and lowers the pitch; 51.5 is the original camera exactly', () => {
  assert.equal(cameraPitch(), 51.5);
  assert.deepEqual(cameraOffset(16 / 9).toArray(), [...CAMERA.offset]);
  const distance = Math.hypot(...CAMERA.offset);
  for (const deg of [47, 43, 36, 30]) {
    assert.equal(setCameraPitch(deg), deg); const o = cameraOffset(16 / 9);
    assert.ok(Math.abs(o.length() - distance) < 1e-9, deg + ' keeps the distance');
    assert.ok(Math.abs(Math.atan2(o.y, o.z) * 180 / Math.PI - deg) < 1e-9, deg + ' is the pitch');
  }
  assert.equal(setCameraPitch(10), CAMERA_PITCH.min, 'never lower than 30');
  assert.equal(setCameraPitch(80), CAMERA_PITCH.max, 'never steeper than the original');
  assert.equal(setCameraPitch('low'), 43, 'preset names work (the first version saved them)');
  assert.equal(setCameraPitch('nonsense'), CAMERA_PITCH.max);
  assert.deepEqual(cameraOffset(16 / 9).toArray(), [...CAMERA.offset]);
});
