/**
 * Arrival flags in the world and on the map (rules in place-flags.ts).
 *
 * Drawing (lightweight-game-objects budgets): one shared flag model built here in code, 58 triangles (a soil mound,
 * a five-sided pole, a gold knob, a cream hem, the cloth with a swallow tail, a cream badge on each side), vertex
 * coloured on one toon material; the cloth takes the explorer's colour in the shader. One InstancedMesh per world (the
 * flags of the world being shown, at most eight), never casting or taking shadows. The cloth flutters and a new flag
 * pops up out of the ground in the vertex shader, on the wind clock the cover cards already advance (cover-cards.ts
 * windClock), so nothing runs per frame for them. The mesh is hidden (no draw at all) when no flag is within reach of
 * the camera, indoors, in a mode or while visiting, re-checked on the HUD tick (a few times a second).
 *
 * Arrival: the same HUD tick asks place-flags.ts where the explorer stands; a place with no flag gets one, with a toast,
 * a sound and a little burst, and the save keeps it. Online the server's save has no flags (they are personal), so the
 * browser keeps them per explorer name in localStorage and puts them back after each server update.
 */
import * as T from 'three';
import { TOON_RAMP } from './toon.ts';
import { windClock } from './cover-cards.ts';
import { terrainHeight, type EnvironmentLayout } from './environments.ts';
import { backfillFlags, flagSpot, flagsOn, parsePlaceFlags, placeAt, plantFlag, placeById, type PlaceDef, type PlaceFlags } from './place-flags.ts';

/** The triangle budget of the flag model (checked by tests/flags.test.ts). */
export const FLAG_TRIANGLES = 58;
/** Most flags one world can hold (home: four wilds and four landmarks; a planet: its pad). */
export const FLAG_CAPACITY = 8;
/** Flags farther than this from the camera's target cannot be on screen: the mesh is hidden. */
export const FLAG_VIEW_RANGE = 60;
/** The model is built at about the explorer's height and drawn this much bigger, so a flag reads at the game's camera distance. */
export const FLAG_SCALE = 1.3;
const POLE = 1.55, CLOTH_LOW = 1.02, CLOTH_HIGH = 1.5, CLOTH_LEN = .78, HEM = .1;

type V3 = [number, number, number];
/** Flat-shaded triangles with a colour each and a flag attribute (u along the cloth 0..1, tint 0/1). */
function flagGeometry(): T.BufferGeometry {
  const pos: number[] = [], col: number[] = [], flag: number[] = [];
  const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const tri = (a: V3, b: V3, c: V3, color: string, fa: [number, number] = [0, 0], fb = fa, fc = fa) => {
    const [r, g, bl] = hex(color);
    pos.push(...a, ...b, ...c); col.push(r, g, bl, r, g, bl, r, g, bl); flag.push(...fa, ...fb, ...fc);
  };
  // Soil mound: six sides from a 0.2 m ring on the ground to a 0.07 m ring on top (12).
  const ring = (r: number, y: number, i: number, n = 6): V3 => [Math.cos(i / n * Math.PI * 2) * r, y, Math.sin(i / n * Math.PI * 2) * r];
  for (let i = 0; i < 6; i++) { const a = ring(.2, 0, i), b = ring(.2, 0, i + 1), c = ring(.07, .08, i + 1), d = ring(.07, .08, i); tri(a, c, b, '#7a5236'); tri(a, d, c, '#8e6440'); }
  // Pole: five sides, light wood (10).
  for (let i = 0; i < 5; i++) { const a = ring(.035, 0, i, 5), b = ring(.035, 0, i + 1, 5), c = ring(.03, POLE, i + 1, 5), d = ring(.03, POLE, i, 5); tri(a, c, b, '#d9a464'); tri(a, d, c, '#c48d52'); }
  // Gold knob: an octahedron (8).
  const k = .075, top: V3 = [0, POLE + k * 2, 0], bottom: V3 = [0, POLE, 0], mid = (i: number): V3 => { const p = ring(k, POLE + k, i, 4); return p; };
  for (let i = 0; i < 4; i++) { tri(top, mid(i + 1), mid(i), '#ffc93a'); tri(bottom, mid(i), mid(i + 1), '#e9a92a'); }
  // Cloth in the xy plane, from the pole along +x. u is the share of the length (it drives the flutter). A cream hem
  // strip by the pole (4), then the body in three columns and two rows with a swallow-tail notch at the fly end (12).
  const at = (u: number, v: number): V3 => [u * CLOTH_LEN, CLOTH_LOW + v * (CLOTH_HIGH - CLOTH_LOW), 0];
  const grid = (u0: number, u1: number, cols: number, color: string, tint: number) => {
    for (let c = 0; c < cols; c++) for (let r = 0; r < 2; r++) {
      const ua = u0 + (u1 - u0) * c / cols, ub = u0 + (u1 - u0) * (c + 1) / cols, va = r / 2, vb = (r + 1) / 2;
      const notch = (u: number, v: number) => u > .999 && v === .5 ? .82 : u; // the fly end's middle point pulled in
      const p00 = at(notch(ua, va), va), p10 = at(notch(ub, va), va), p01 = at(notch(ua, vb), vb), p11 = at(notch(ub, vb), vb);
      const f = (u: number): [number, number] => [notch(u, 0), tint];
      tri(p00, p10, p11, color, f(ua), f(ub), f(ub)); tri(p00, p11, p01, color, f(ua), f(ub), f(ua));
    }
  };
  grid(0, HEM, 1, '#fff6e0', 0);
  grid(HEM, 1, 3, '#ffffff', 1);
  // A cream badge on each side of the cloth: a hexagon a hair off the cloth (6 + 6). It takes no tint.
  const cx = .5 * CLOTH_LEN, cy = (CLOTH_LOW + CLOTH_HIGH) / 2, br = .1;
  for (const side of [1, -1]) for (let i = 0; i < 6; i++) {
    const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2, z = side * .006;
    const p = (a: number): V3 => [cx + Math.cos(a) * br, cy + Math.sin(a) * br, z], u = (a: number): [number, number] => [(cx + Math.cos(a) * br) / CLOTH_LEN, 0];
    if (side > 0) tri([cx, cy, z], p(a0), p(a1), '#fff6e0', [.5, 0], u(a0), u(a1)); else tri([cx, cy, z], p(a1), p(a0), '#fff6e0', [.5, 0], u(a1), u(a0));
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setAttribute('aFlag', new T.Float32BufferAttribute(flag, 2));
  g.computeVertexNormals();
  g.userData.sharedKit = true;
  return g;
}

let shared: { geometry: T.BufferGeometry; material: T.MeshToonMaterial; color: { value: T.Color } } | null = null;
function kit() {
  if (shared) return shared;
  const geometry = flagGeometry(), color = { value: new T.Color('#4aa8ff') };
  const material = new T.MeshToonMaterial({ vertexColors: true, gradientMap: TOON_RAMP, side: T.DoubleSide });
  material.userData.sharedKit = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.flagTime = windClock; shader.uniforms.flagColor = color;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFlag;\nattribute float aPlant;\nuniform float flagTime;\nuniform vec3 flagColor;')
      .replace('#include <begin_vertex>', [
        'vec3 transformed = vec3(position);',
        '#ifdef USE_INSTANCING',
        'vec3 flagRoot = instanceMatrix[3].xyz;',
        '#else',
        'vec3 flagRoot = vec3(0.0);',
        '#endif',
        // The cloth flutters along its normal, more toward the fly end, a wave running away from the pole; every flag out of step.
        'float flagPhase = flagRoot.x * .37 + flagRoot.z * .23;',
        'float flagWave = (sin(flagTime * 3.1 + flagPhase - aFlag.x * 3.2) * .085 + sin(flagTime * 5.3 + flagPhase * 1.7 - aFlag.x * 5.0) * .025) * aFlag.x;',
        'transformed.z += flagWave; transformed.x -= abs(flagWave) * .3;',
        // A new flag pops up out of the ground in 0.55 s (ease out with a little overshoot); 0 = standing already.
        'float flagGrow = aPlant > 0.0 ? clamp((flagTime - aPlant) / .55, 0.0, 1.0) : 1.0;',
        'float flagPop = 1.0 + 2.4 * pow(flagGrow - 1.0, 3.0) + 1.4 * pow(flagGrow - 1.0, 2.0);',
        'transformed *= flagPop;',
      ].join('\n'))
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.rgb = mix(vColor.rgb, vColor.rgb * flagColor, aFlag.y);\n#endif');
  };
  material.customProgramCacheKey = () => 'place-flag';
  shared = { geometry, material, color };
  return shared;
}

/** The shared flag model and material (tests read its triangle count). */
export const flagModel = () => kit();

interface FlagWorld {
  scene: T.Scene; planet: string; position: { x: number; z: number }; facing: number; time: number; interior?: unknown; state: unknown;
  obstacles: readonly { x: number; z: number; r: number }[]; environment: { layout: EnvironmentLayout }; cameraTarget: { x: number; z: number };
  fx?: { burst(at: { x: number; y?: number; z: number }, options?: Record<string, unknown>): void } | null;
}
interface FlagSave { placeFlags?: PlaceFlags; visited: readonly string[]; color: string; name: string }
export interface FlagHost {
  world: FlagWorld;
  state(): FlagSave;
  /** Planting and showing are allowed: started, outdoors, alive, not in a mode, a flight or someone else's home. */
  active(): boolean;
  online(): boolean;
  /** No fight around: a flag waits until then, so its toast never lands on a boss bar or a target frame. */
  calm?(): boolean;
  /** A flag went up: the toast and the sound. */
  planted(place: PlaceDef): void;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

const MIRROR_KEY = 'zoo-garden-flags-online';
export function mountPlaceFlags(host: FlagHost) {
  const { geometry, material, color } = kit();
  const plantAt = new T.InstancedBufferAttribute(new Float32Array(FLAG_CAPACITY), 1);
  const geo = new T.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aFlag']) geo.setAttribute(name, geometry.getAttribute(name));
  geo.setAttribute('aPlant', plantAt); geo.userData.sharedKit = true;
  const mesh = new T.InstancedMesh(geo, material, FLAG_CAPACITY);
  mesh.name = 'place-flags'; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = true;
  host.world.scene.add(mesh);
  let shownKey = '', spots: { id: string; x: number; z: number }[] = [], wait = 0, lastClock = -1, ticking = false, builtFor: [unknown, string] = [null, ''];
  // Online: the flags of each explorer name, kept in this browser (the server's save never carries them).
  let mirror: Record<string, PlaceFlags> | null = null;
  const readMirror = () => { if (mirror) return mirror; try { const raw = host.storage?.getItem(MIRROR_KEY); const v = raw ? JSON.parse(raw) : {}; mirror = {}; if (v && typeof v === 'object') for (const [name, f] of Object.entries(v)) { const p = parsePlaceFlags(f); if (p) mirror[name] = p; } } catch { mirror = {}; } return mirror; };
  const writeMirror = (name: string, flags: PlaceFlags) => { const m = readMirror(); m[name] = flags; try { host.storage?.setItem(MIRROR_KEY, JSON.stringify(m)); } catch { /* this visit only */ } };
  let merged = false;
  /** The save's flags, made on first use (older saves: every planet landed on); online, with the ones this browser keeps. */
  function flags(): PlaceFlags {
    const s = host.state(), own = s.placeFlags ??= backfillFlags(s);
    if (host.online()) for (const [id, spot] of Object.entries(readMirror()[s.name] ?? {})) if (!Object.hasOwn(own, id)) { own[id] = spot; merged = true; }
    return own;
  }
  /** Puts this world's flags into the mesh. `fresh` = the place planted just now (it pops up). */
  function rebuild(fresh?: string) {
    const w = host.world, list = flagsOn(flags(), w.planet), m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), at = new T.Vector3(), size = new T.Vector3(FLAG_SCALE, FLAG_SCALE, FLAG_SCALE);
    spots = list.slice(0, FLAG_CAPACITY); builtFor = [host.state(), w.planet];
    spots.forEach((f, i) => {
      // Each flag leans its cloth a little its own way, always mostly toward the camera (it looks from the south).
      let h = 0; for (const c of f.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      q.setFromAxisAngle(up, ((h % 1000) / 1000 - .5) * 1.1);
      at.set(f.x, Math.max(0, terrainHeight(w.environment.layout, f)), f.z);
      mesh.setMatrixAt(i, m.compose(at, q, size));
      plantAt.setX(i, f.id === fresh && ticking ? Math.max(.001, windClock.value) : 0);
    });
    mesh.count = spots.length; mesh.instanceMatrix.needsUpdate = true; plantAt.needsUpdate = true;
    mesh.computeBoundingSphere(); shownKey = '';
  }
  function show() {
    const w = host.world, t = w.cameraTarget;
    const near = !!spots.length && host.active() && !w.interior && spots.some(f => Math.hypot(f.x - t.x, f.z - t.z) < FLAG_VIEW_RANGE);
    if (mesh.visible !== near) mesh.visible = near;
    const c = host.state().color; if (c !== shownKey) { shownKey = c; try { color.value.set(c); } catch { /* keep the last colour */ } }
  }
  return {
    mesh,
    /** After every world build: this world's flags. */
    rebuild() { rebuild(); show(); },
    /** On the HUD tick: plants a flag where the explorer has arrived, and shows or hides the mesh. */
    update(now = performance.now()) {
      if (now < wait) return; wait = now + 300;
      ticking = windClock.value !== lastClock; lastClock = windClock.value;
      const w = host.world, s = host.state();
      // Online a server update replaces the save without the flags: put this browser's back (and redraw if any came back).
      if (host.online()) { const before = s.placeFlags; merged = false; flags(); if (merged || !before) rebuild(); }
      if (builtFor[0] !== s || builtFor[1] !== w.planet) rebuild(); // another save, or a world built before the first rebuild
      if (host.active() && !w.interior && (host.calm?.() ?? true)) {
        const place = placeAt(w.planet, w.position.x, w.position.z), all = flags();
        if (place && !Object.hasOwn(all, place.id)) {
          const free = (x: number, z: number) => !w.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + .45);
          const spot = flagSpot(place, w.position.x, w.position.z, w.facing, free);
          if (plantFlag(all, place, spot, Date.now())) {
            if (host.online()) writeMirror(s.name, all);
            rebuild(place.id);
            w.fx?.burst({ x: spot.x, y: 0, z: spot.z }, { n: 14, color: [s.color, '#ffc93a', '#fff6e0'], speed: 2.2, up: 4.5, size: .1, life: .9, y: 1.2 });
            host.planted(place);
          }
        }
      }
      show();
    },
    /** Map marks for this world's flags. */
    marks(): readonly { x: number; z: number }[] { return spots; },
    color: () => host.state().color,
    /** For tests and the dev hook. */
    get count() { return mesh.count; },
    place: placeById,
  };
}
