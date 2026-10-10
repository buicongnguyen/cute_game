import type * as T from 'three';

/**
 * Warms a scene's shaders in the background (renderer.compileAsync) without the stray console error three.js raises.
 * Its polling checks each material's program every 10 ms and throws, inside a timer where no catch can see it, when a
 * material was disposed while it still waited: "Cannot read properties of undefined (reading 'isReady')". A disposed
 * material needs no shader, so that single error is marked handled; the promise then simply never settles, which is
 * fine because every caller fires it and forgets it (nothing awaits a warm-up).
 */
let guarded = false;
export function compileAsyncSafe(renderer: T.WebGLRenderer, scene: T.Object3D, camera: T.Camera, lightsFrom?: T.Scene): Promise<unknown> {
  if (!guarded && typeof window !== 'undefined') {
    guarded = true;
    window.addEventListener('error', event => { if (/reading 'isReady'/.test(event.message ?? '')) event.preventDefault(); });
  }
  return renderer.compileAsync(scene, camera, lightsFrom).catch(() => undefined);
}
