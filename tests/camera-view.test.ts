import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA, CAMERA_VIEWS, cameraOffset, cameraView, setCameraView } from '../src/camera-rig.ts';

test('the camera angle setting keeps the distance and lowers the pitch; classic is the original camera exactly', () => {
  assert.equal(cameraView(), 'classic');
  assert.deepEqual(cameraOffset(16 / 9).toArray(), [...CAMERA.offset]);
  const distance = Math.hypot(...CAMERA.offset);
  for (const view of ['tilted', 'low'] as const) {
    setCameraView(view); const o = cameraOffset(16 / 9);
    assert.ok(Math.abs(o.length() - distance) < 1e-9, view + ' keeps the distance');
    assert.ok(Math.abs(Math.atan2(o.y, o.z) * 180 / Math.PI - CAMERA_VIEWS[view]) < 1e-9, view + ' has its pitch');
  }
  setCameraView('nonsense' as never); assert.equal(cameraView(), 'classic');
  assert.deepEqual(cameraOffset(16 / 9).toArray(), [...CAMERA.offset]);
});
