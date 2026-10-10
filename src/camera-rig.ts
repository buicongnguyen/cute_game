import * as T from 'three';

/**
 * The game camera, after the reference (zoo-pet bundle @1042127, @1060136, @1060358, @1054243): a 40°
 * perspective lens at target + (0, 17, 13.5), 21.7 m away at a 51.5° pitch, looking straight at the
 * smoothed explorer (no look-ahead). Portrait screens (aspect below 0.8) sit 1.3x further back. The
 * steep pitch keeps fighters apart on screen instead of stacking the explorer over its target.
 */
export const CAMERA = { fov: 40, near: .5, far: 300, offset: [0, 17, 13.5], portraitAspect: .8, portraitScale: 1.3, follow: 9, cutSceneFollow: 5 } as const;
/** Zoom multiplies the camera distance: the wheel reaches 0.65-1.5, a pinch 0.6-1.6. */
export const ZOOM = { wheel: [.65, 1.5], pinch: [.6, 1.6], wheelStep: .001, button: .1 } as const;
/** Linear fog in the sky colour from 45 m, well beyond the fight radius, so fights are never hazy. */
export const FOG = { near: 45, far: 110 } as const;
/**
 * The sun's shadow box: depth range around the target, biases, and slack around the ground in view for
 * tall things at its edges (with the game's sun an 8 m tree top lies at most 0.7 m outside) and snapping.
 */
export const SHADOW = { near: 10, far: 70, bias: -.0008, normalBias: .03, margin: 2 } as const;

export function clampZoom(value: number, kind: 'wheel' | 'pinch') { const [low, high] = ZOOM[kind]; return Math.min(high, Math.max(low, value)); }

/** Camera position relative to its target, for a screen aspect and zoom. */
/**
 * The pitch the player picked in Settings (a slider, 30 to 51.5 degrees above the ground): the same distance, a lower
 * view. 51.5 is the camera above, untouched. A lower camera sees further, so it draws more (docs/QUALITY-PLAN.md
 * section 5: 48 is about free, 43 about 10-20% more work, 30 about 1.4 to 2 times).
 */
export const CAMERA_PITCH = { min: 30, max: 51.5, presets: { classic: 51.5, tilted: 47, low: 43, lower: 36, lowest: 30 } } as const;
export type CameraPreset = keyof typeof CAMERA_PITCH.presets;
let pitch: number = CAMERA_PITCH.max;
const viewOffset: [number, number, number] = [...CAMERA.offset];
export const cameraPitch = () => pitch;
/** Accepts degrees, or a preset name (also what the first version of the setting saved). */
export function setCameraPitch(next: number | string) {
  const asked = typeof next === 'string' && Object.hasOwn(CAMERA_PITCH.presets, next) ? CAMERA_PITCH.presets[next as CameraPreset] : Number(next);
  pitch = Number.isFinite(asked) ? Math.min(CAMERA_PITCH.max, Math.max(CAMERA_PITCH.min, asked)) : CAMERA_PITCH.max;
  if (pitch >= CAMERA_PITCH.max) { viewOffset[1] = CAMERA.offset[1]; viewOffset[2] = CAMERA.offset[2]; return pitch; }
  const distance = Math.hypot(CAMERA.offset[1], CAMERA.offset[2]), r = pitch * Math.PI / 180;
  viewOffset[1] = distance * Math.sin(r); viewOffset[2] = distance * Math.cos(r); return pitch;
}

export function cameraOffset(aspect: number, zoom = 1, out = new T.Vector3()) {
  const scale = zoom * (aspect < CAMERA.portraitAspect ? CAMERA.portraitScale : 1);
  return out.set(viewOffset[0], viewOffset[1], viewOffset[2]).multiplyScalar(scale);
}

/** Share of the remaining distance the camera covers in dt: 9/s while playing, 5/s in cut-scenes. */
export function followBlend(dt: number, cutScene: boolean) { return 1 - Math.exp(-dt * (cutScene ? CAMERA.cutSceneFollow : CAMERA.follow)); }

const lens = new T.PerspectiveCamera(), ray = new T.Ray(), ground = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
/** Where a screen point (NDC, -1..1) meets the ground, relative to the camera target; rays into the sky stop at `reach`. */
export function groundAt(aspect: number, zoom: number, ndcX: number, ndcY: number, reach = 120) {
  Object.assign(lens, { fov: CAMERA.fov, aspect, near: CAMERA.near, far: CAMERA.far }); lens.updateProjectionMatrix();
  cameraOffset(aspect, zoom, lens.position); lens.lookAt(0, 0, 0); lens.updateMatrixWorld(true);
  ray.origin.copy(lens.position); ray.direction.set(ndcX, ndcY, .5).unproject(lens).sub(lens.position).normalize();
  const t = ray.distanceToPlane(ground);
  ray.at(t === null || t > reach ? reach : t, hit);
  return { x: hit.x, z: hit.z };
}

/** The ground in view: the screen corners bottom-left, bottom-right, top-right and top-left. */
export function viewFootprint(aspect: number, zoom = 1) { return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([x, y]) => groundAt(aspect, zoom, x, y)); }

/** The x and y axes of a directional light's shadow camera, built the way three's lookAt builds them. */
export function lightAxes(sunOffset: T.Vector3): [T.Vector3, T.Vector3] {
  const dir = sunOffset.clone().normalize(), x = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), dir).normalize();
  return [x, new T.Vector3().crossVectors(dir, x)];
}

/**
 * The shadow box that just covers the ground in view, in the light's axes, around the camera target.
 * A caster outside the view that throws a shadow into it lies on the same light ray as that shadow, so
 * it is inside too. Narrow and deep in portrait, wide in landscape, and smaller than a square box, so
 * the shadow pass draws less and the texels are finer.
 */
export function shadowBox(footprint: readonly { x: number; z: number }[], axes: readonly [T.Vector3, T.Vector3], margin: number = SHADOW.margin) {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const p of footprint) {
    const a = p.x * axes[0].x + p.z * axes[0].z, b = p.x * axes[1].x + p.z * axes[1].z;
    left = Math.min(left, a); right = Math.max(right, a); bottom = Math.min(bottom, b); top = Math.max(top, b);
  }
  return { left: left - margin, right: right + margin, bottom: bottom - margin, top: top + margin };
}
