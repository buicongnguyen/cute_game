import test from 'node:test';
import assert from 'node:assert/strict';

test('without a real window the viewport reads straight through to the global size (never stale)', async () => {
  const g = globalThis as unknown as { innerWidth?: number; innerHeight?: number };
  const { viewWidth, viewHeight } = await import('../src/viewport.ts');
  g.innerWidth = 390; g.innerHeight = 844;
  assert.equal(viewWidth(), 390); assert.equal(viewHeight(), 844);
  g.innerWidth = 800;
  assert.equal(viewWidth(), 800, 'a changed size is seen at once');
  delete g.innerWidth; delete g.innerHeight;
  assert.equal(viewWidth(), 0);
});
