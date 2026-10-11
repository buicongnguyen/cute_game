import * as T from 'three';
import { buildDecoration } from './decorations-art.ts';
import { planetLight } from './toon.ts';

/**
 * Decoration icons drawn from the same 3D models the player places at home, the way
 * the reference renders its item icons. Each is drawn once, on first use, into a
 * small offscreen canvas and kept as an image URL.
 */
const cache = new Map<string, string>();
let renderer: T.WebGLRenderer | null = null, scene: T.Scene | null = null, camera: T.PerspectiveCamera | null = null;
const box = new T.Box3(), centre = new T.Vector3(), size = new T.Vector3();

function setup() {
  renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(128, 128, false); renderer.outputColorSpace = T.SRGBColorSpace;
  // The world's look (RC-05): no tone mapping and the home lights, so an icon matches its model in the garden.
  renderer.toneMapping = T.NoToneMapping; renderer.setClearColor(0x000000, 0);
  scene = new T.Scene();
  const light = planetLight('home');
  scene.add(new T.HemisphereLight(light.sky, light.ground, light.hemi));
  const sun = new T.DirectionalLight(light.sun, light.sunIntensity); sun.position.set(2, 4, 3); scene.add(sun);
  camera = new T.PerspectiveCamera(30, 1, .05, 60);
}

export function decorIcon(id: string): string {
  return modelIcon(id, () => buildDecoration(id), true);
}

/**
 * Any model drawn once into a cached icon. Creature portraits borrow the live creature's mesh
 * (dispose=false), so its shared geometry and materials stay untouched.
 */
export function modelIcon(key: string, build: () => T.Object3D, dispose = false): string {
  const known = cache.get(key); if (known !== undefined) return known;
  const url = modelShot(build, undefined, dispose ? holder => holder.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); }) : undefined);
  cache.set(key, url);
  return url;
}

/** Where the picture is taken from: sets the camera for the model in `holder` (already in the scene, matrices current). */
export type IconAim = (camera: T.PerspectiveCamera, holder: T.Group) => void;
const itemAim: IconAim = (cam, holder) => {
  holder.rotation.y = -.5; holder.updateMatrixWorld(true);
  box.setFromObject(holder); box.getCenter(centre); box.getSize(size);
  const distance = Math.max(size.x, size.y, size.z) * .62 / Math.tan(T.MathUtils.degToRad(15)), tilt = .45;
  cam.fov = 30; cam.updateProjectionMatrix();
  cam.position.set(centre.x, centre.y + Math.sin(tilt) * distance, centre.z + Math.cos(tilt) * distance); cam.lookAt(centre);
};
/**
 * One 128 px picture of a model on this module's renderer (the only icon WebGL context: hero-portrait.ts borrows it too
 * rather than opening another), as a PNG data URL; '' when the build, the render or the read-back fails. Nothing is
 * cached here. `free` gets the holder afterwards to release what the caller built.
 */
export function modelShot(build: () => T.Object3D | null, aim: IconAim = itemAim, free?: (holder: T.Group) => void): string {
  let url = ''; const holder = new T.Group();
  try {
    if (!renderer) setup();
    const model = build(); if (!model) return '';
    holder.add(model); scene!.add(holder); holder.updateMatrixWorld(true);
    aim(camera!, holder);
    renderer!.render(scene!, camera!);
    url = renderer!.getContext().isContextLost() ? '' : renderer!.domElement.toDataURL('image/png');
  } catch { url = ''; } finally { holder.removeFromParent(); try { free?.(holder); } catch { /* the picture stands */ } }
  return url;
}
