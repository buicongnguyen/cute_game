import * as T from 'three';
import { buildDecoration } from './decorations-art.ts';

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
  renderer.toneMapping = T.NeutralToneMapping; renderer.setClearColor(0x000000, 0);
  scene = new T.Scene();
  scene.add(new T.HemisphereLight('#ffffff', '#b0c4a0', 2.2));
  const sun = new T.DirectionalLight('#fff4de', 2.4); sun.position.set(2, 4, 3); scene.add(sun);
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
  let url = '';
  try {
    if (!renderer) setup();
    const model = build(), holder = new T.Group();
    holder.add(model); holder.rotation.y = -.5; scene!.add(holder); holder.updateMatrixWorld(true);
    box.setFromObject(holder); box.getCenter(centre); box.getSize(size);
    const distance = Math.max(size.x, size.y, size.z) * .62 / Math.tan(T.MathUtils.degToRad(15)), tilt = .45;
    camera!.position.set(centre.x, centre.y + Math.sin(tilt) * distance, centre.z + Math.cos(tilt) * distance); camera!.lookAt(centre);
    renderer!.render(scene!, camera!);
    url = renderer!.domElement.toDataURL('image/png');
    scene!.remove(holder);
    if (dispose) holder.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); });
  } catch { url = ''; }
  cache.set(key, url);
  return url;
}
