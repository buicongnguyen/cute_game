import * as T from 'three';

/**
 * Turning shadows on or off without a freeze (FIX-PLAN 1.1).
 *
 * In three.js the number of shadow-casting lights and USE_SHADOWMAP are part of every material's program key, so
 * flipping `renderer.shadowMap.enabled` / `sun.castShadow` makes every material compile a new program in the next
 * frame. On a phone (CPU slowed 4x) that was one 0.4-0.8 s frame in the middle of a fight.
 *
 * Instead the other variant is compiled first, a few materials per frame, against a stand-in light rig (copies of
 * the scene's lights with the sun switched the new way, plus the scene's fog and environment, which is all the program
 * key reads from a scene). The live scene keeps rendering as it is meanwhile. Once the GPU reports the new programs
 * linked (KHR_parallel_shader_compile; without it they count as ready and have had frames to finish), the switch
 * flips and every material only looks its program up. Shadow map size and which objects cast are uniforms and
 * draw lists, not program keys: those change at once and never need this.
 */
export interface ShadowSwitchHost {
  renderer: T.WebGLRenderer;
  camera: T.Camera;
  sun: T.DirectionalLight;
  /** The scene being drawn now (the house interior has its own). */
  scene(): T.Scene;
}

type Compiled = { program: { isReady?: () => boolean; getUniforms?: () => unknown } | undefined; used?: boolean };

/** Milliseconds of compiling per frame; at least one material is prepared each frame. */
const FRAME_BUDGET_MS = 3;
/** Give up waiting for the GPU after this long and flip anyway (a link check then waits for what is left). */
const READY_TIMEOUT_MS = 4000;

export class ShadowSwitch {
  /** The state being prepared, or null when nothing is pending. */
  target: boolean | null = null;
  private queue: T.Object3D[] = [];
  private compiled: Compiled[] = [];
  private rig: T.Scene | null = null;
  private since = 0;
  /** For tests and the perf probe: programs prepared by the last switch, and frames it took. */
  stats = { prepared: 0, frames: 0 };

  private host: ShadowSwitchHost;
  constructor(host: ShadowSwitchHost) { this.host = host; }

  get on() { return this.host.renderer.shadowMap.enabled && this.host.sun.castShadow; }

  /** Ask for shadows on or off; nothing happens at once. A request for the current state cancels a pending one. */
  request(on: boolean) {
    if (on === this.on) { this.cancel(); return; }
    if (this.target === on) return;
    this.target = on; this.queue = []; this.compiled = []; this.rig = null; this.since = performance.now(); this.stats = { prepared: 0, frames: 0 };
    const scene = this.host.scene(), seen = new Set<string>();
    // What is drawn now; anything hidden compiles on its first use, as it would have anyway.
    scene.traverseVisible(o => {
      const m = (o as T.Mesh).material as T.Material | T.Material[] | undefined;
      if (!m || !((o as T.Mesh).isMesh || (o as T.Points).isPoints || (o as T.Line).isLine || (o as T.Sprite).isSprite)) return;
      const inst = o as T.InstancedMesh & { isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
      const kind = `${inst.isInstancedMesh ? 'i' : ''}${inst.instanceColor ? 'c' : ''}${inst.isSkinnedMesh ? 's' : ''}${inst.isBatchedMesh ? 'b' : ''}${Object.keys((o as T.Mesh).geometry?.morphAttributes ?? {}).length}`;
      const key = (Array.isArray(m) ? m.map(x => x.uuid).join(',') : m.uuid) + kind;
      if (seen.has(key)) return; seen.add(key);
      // A stand-in that shares the object's geometry, material and kind but not its children, so compiling it
      // prepares exactly this one object (renderer.compile walks the subtree it is given).
      const proxy = Object.create(o) as T.Object3D; (proxy as { children: T.Object3D[] }).children = [];
      this.queue.push(proxy);
    });
  }

  cancel() { this.target = null; this.queue = []; this.compiled = []; this.rig = null; }

  /** Call once per frame before drawing. Returns true on the frame the switch flips. */
  step(): boolean {
    if (this.target === null) return false;
    const { renderer, camera } = this.host;
    this.stats.frames++;
    if (this.queue.length) {
      const rig = this.rig ??= this.makeRig(this.target), was = renderer.shadowMap.enabled, t0 = performance.now();
      renderer.shadowMap.enabled = this.target;
      try {
        do {
          const proxy = this.queue.pop()!;
          try {
            const materials = renderer.compile(proxy, camera, rig);
            for (const m of materials) this.compiled.push({ program: (renderer.properties.get(m) as { currentProgram?: Compiled['program'] }).currentProgram });
            this.stats.prepared += materials.size;
          } catch { /* a material that cannot compile now will compile on first use, as before */ }
        } while (this.queue.length && performance.now() - t0 < FRAME_BUDGET_MS);
      } finally { renderer.shadowMap.enabled = was; }
      return false;
    }
    const late = performance.now() - this.since >= READY_TIMEOUT_MS, t0 = performance.now();
    let ready = true;
    for (const c of this.compiled) {
      if (c.used) continue;
      let linked = true; try { linked = c.program?.isReady?.() ?? true; } catch { /* counts as ready */ }
      if (!linked && !late) { ready = false; continue; }
      // Its first use reads the link log and the uniform table, a blocking round trip each: done here, a few per frame.
      if (performance.now() - t0 > FRAME_BUDGET_MS && !late) { ready = false; continue; }
      try { c.program?.getUniforms?.(); } catch { /* the flip frame retries */ }
      c.used = true;
    }
    if (!ready) return false;
    this.flip(this.target);
    return true;
  }

  /** Switch now. Every material re-picks its program (already prepared ones only look it up). */
  flip(on: boolean) {
    const { renderer, sun } = this.host;
    this.cancel();
    if (renderer.shadowMap.enabled === on && sun.castShadow === on) return;
    renderer.shadowMap.enabled = on; sun.castShadow = on;
    const mark = (s: T.Object3D) => s.traverse(o => { const m = (o as T.Mesh).material as T.Material | T.Material[] | undefined; if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true; });
    mark(this.host.scene()); if (sun.parent && sun.parent !== this.host.scene()) mark(sun.parent);
  }

  /** Copies of the drawn scene's lights, the sun switched to `on`, with the scene's fog and environment. */
  private makeRig(on: boolean) {
    const scene = this.host.scene(), rig = new T.Scene();
    rig.fog = scene.fog; rig.environment = scene.environment;
    scene.traverseVisible(o => {
      if (!(o as T.Light).isLight) return;
      const copy = (o as T.Light).clone(false) as T.Light;
      copy.castShadow = o === this.host.sun ? on : o.castShadow;
      rig.add(copy);
    });
    return rig;
  }
}
