/**
 * Crossing water in the world (rules: swim-rules.ts). Runs after every frame's posing (world.afterAnimate):
 * steps the swim state, opens the ponds' colliders to the explorer while it is in the water, slows it, glides a
 * double jump over water, and draws the swim: the body sunk to the chest, a stroke, ripple rings, the stamina ring,
 * pets paddling along and other players swimming (their pose carries `swim`). main.ts asks it whether attacks and
 * skills are allowed (not while swimming) and sends its mode with the movement sync.
 */
import './swim.css';
import { SwimState, SWIM, swimSink, swimSpeed, swimBlocksActions, type Pool, type SwimMode } from './swim-rules.ts';
import type { World } from './world.ts';

export interface SwimHost {
  world: World;
  /** The explorer is in play and may move (started, no menu, alive). */
  active(): boolean;
  toast(message: string, icon?: string): void;
  /** Optional sound hook: a splash on the way in, a swish per stroke (sfx.ts). */
  sound?(kind: 'dive' | 'stroke'): void;
}
export interface SwimApi {
  mode(): SwimMode;
  /** No attacks, skills or jumps (deep water). */
  blocksActions(): boolean;
  stamina(): number;
  /** Puts the explorer back on land at once (a new world, a respawn). */
  reset(): void;
  /** For tests and probes. */
  readonly state: SwimState;
}

const TIP_KEY = 'zoo-swim-tips';
function tipSeen(id: string) { try { return (localStorage.getItem(TIP_KEY) ?? '').split(',').includes(id); } catch { return true; } }
function markTip(id: string) { try { const seen = (localStorage.getItem(TIP_KEY) ?? '').split(',').filter(Boolean); if (!seen.includes(id)) localStorage.setItem(TIP_KEY, [...seen, id].join(',')); } catch { /* private mode: the tip may show again */ } }

type Limbs = { armL?: any; armR?: any; legL?: any; legR?: any };
const limbCache = new WeakMap<object, Limbs>();
function limbs(root: any): Limbs {
  const key = root.children?.[0] ?? root; let l = limbCache.get(key);
  if (!l) { l = { armL: root.getObjectByName('arm-left'), armR: root.getObjectByName('arm-right'), legL: root.getObjectByName('leg-left'), legR: root.getObjectByName('leg-right') }; limbCache.set(key, l); }
  return l;
}
/** A gentle breaststroke and flutter kick (t: seconds, k: 0..1 how much it swims). */
function strokePose(l: Limbs, t: number, moving: boolean) {
  const s = Math.sin(t * (moving ? 6 : 2.4)), c = Math.cos(t * (moving ? 6 : 2.4));
  l.armL?.rotation.set(-2.2 + s * .55, 0, -.55 - c * .35); l.armR?.rotation.set(-2.2 + s * .55, 0, .55 + c * .35);
  l.legL?.rotation.set(.35 + s * .45, 0, 0); l.legR?.rotation.set(.35 - s * .45, 0, 0);
}

export function mountSwim(host: SwimHost): SwimApi {
  const w = host.world, state = new SwimState();
  let pools: Pool[] = [], poolsFrom: unknown = null, poolsLen = -1, rippleT = 0, strokeT = 0, sinkNow = 0, wasMode: SwimMode = 'land', lastPlanet = '';
  const remoteRipple = new Map<string, number>();
  // The ring above the head: stamina while in the water, and the push filling up at the shore.
  const ring = document.createElement('div'); ring.id = 'swim-ring'; ring.hidden = true; ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<svg viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r="16"/><circle class="fill" cx="20" cy="20" r="16" pathLength="100"/></svg><span>🌊</span>';
  document.body.append(ring);
  const fill = ring.querySelector<SVGCircleElement>('.fill')!, icon = ring.querySelector('span')!;
  let ringShown = false, ringKind = '', ringValue = -1;

  const poolsNow = () => {
    const list = w.entities;
    if (list !== poolsFrom || list.length !== poolsLen) { poolsFrom = list; poolsLen = list.length; pools = list.filter(e => e.kind === 'fish' && e.pond).map(e => ({ id: e.id, x: e.x, z: e.z, r: e.pond!.rx })); }
    return pools;
  };
  const push = () => {
    const keys = (w as unknown as { keys: Set<string> }).keys;
    let dx = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')), dz = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
    if (!dx && !dz && w.joystickInput) { dx = w.joystickInput.x; dz = w.joystickInput.z; }
    return { x: dx, z: dz };
  };
  const toShore = (to: { x: number; z: number }, message: string) => {
    w.position.x = to.x; w.position.z = to.z; w.destination = null; w.route = []; w.marker.visible = false; w.selected = null;
    w.fx?.ring({ x: to.x, y: 0, z: to.z }, { color: '#bfe9ff', from: .3, to: 1.6, life: .5, y: .1, thick: .2, opacity: .8 });
    if (message) host.toast(message, '🌊');
  };
  const showRing = (kind: 'stamina' | 'push', value: number) => {
    const p = w.position, s = w.screen(p.x, p.y + 2.95 - sinkNow + w.jump.height, p.z);
    if (!s.visible) { if (ringShown) { ring.hidden = true; ringShown = false; } return; }
    if (!ringShown) { ring.hidden = false; ringShown = true; }
    ring.style.transform = `translate(${Math.round(s.x)}px,${Math.round(s.y)}px) translate(-50%,-50%)`;
    const v = Math.round(value * 100);
    if (kind !== ringKind) { ringKind = kind; ring.dataset.kind = kind; icon.textContent = kind === 'push' ? '👣' : '🌊'; }
    if (v !== ringValue) { ringValue = v; fill.style.strokeDashoffset = String(100 - v); ring.classList.toggle('low', kind === 'stamina' && v <= 25); }
  };
  const hideRing = () => { if (ringShown) { ring.hidden = true; ringShown = false; } };

  // The guard dog paddles too (dog-world.ts asks per dog).
  w.dogSink = (x, z) => { for (const o of pools) if (Math.hypot(x - o.x, z - o.z) < o.r - .3) return .28; return 0; };
  w.afterAnimate = dt => {
    if (w.planet !== lastPlanet) { lastPlanet = w.planet; state.reset(); }
    const enabled = host.active() && !w.interior && !w.boarded && !(w.playerLift > 0) && !w.environment?.airborne && w.planet !== 'ocean' && w.state.hp > 0;
    const before = state.inside, poolBefore = state.pool;
    const j = w.jump, air = j?.airborne ? { jumps: j.jumps, falling: j.falling, height: j.height } : null;
    const sp = w.steerPoint, press = sp ? { x: sp.x, z: sp.z, age: w.time - sp.at } : null;
    const p = push(), step = state.step(dt, { pools: poolsNow(), x: w.position.x, z: w.position.z, pushX: p.x, pushZ: p.z, press, air, enabled });
    // Switched off mid-swim (a cut-scene, a menu that moves the explorer, a fall): never leave it inside a pond's collider.
    if (!enabled && before && poolBefore && Math.hypot(w.position.x - poolBefore.x, w.position.z - poolBefore.z) < poolBefore.r + SWIM.lip + SWIM.clearance) {
      const d = Math.hypot(w.position.x - poolBefore.x, w.position.z - poolBefore.z) || 1, r = poolBefore.r + SWIM.lip + SWIM.clearance + .12;
      w.position.x = poolBefore.x + (w.position.x - poolBefore.x) / d * r; w.position.z = poolBefore.z + (w.position.z - poolBefore.z) / d * r;
    }
    w.waterPass = step.pass; w.swimSpeed = swimSpeed(step.mode);
    if (j) j.glide = step.glide ? SWIM.glideFall : 0;
    if (step.entered) {
      host.sound?.('dive');
      if (step.entered.to) w.walkTo(step.entered.to.x, step.entered.to.z);
      w.fx?.ring({ x: w.position.x, y: 0, z: w.position.z }, { color: '#d8f3ff', from: .3, to: 1.4, life: .45, y: .33, thick: .16, opacity: .85 });
      if (!tipSeen('enter')) { markTip('enter'); host.toast('In the water! The rim is shallow; the middle is deep: no attacks or skills there, and watch the stamina ring.', '🏊'); }
    }
    if (step.pulled) toShore(step.pulled, 'Out of breath! You paddle back to the shore.');
    if (step.bounced) toShore(step.bounced, 'This water is too wild to swim.');
    if (step.push > 0 && !tipSeen('push')) { markTip('push'); host.toast('Keep pushing toward the water to wade in.', '👣'); }
    if (state.mode !== wasMode) { document.body.classList.toggle('swimming', state.mode === 'swim'); document.body.classList.toggle('wading', state.mode === 'wade'); wasMode = state.mode; }

    // Pose: sunk into the water, a stroke in the deep, ripples round the body.
    const sink = swimSink(state.mode); sinkNow += (sink - sinkNow) * Math.min(1, dt * 10);
    if (sinkNow > .005 && !j?.airborne) w.player.position.y -= sinkNow;
    if (state.mode === 'swim' && !j?.airborne) strokePose(limbs(w.player), w.time, w.moving);
    strokeT -= dt; if (state.mode === 'swim' && w.moving && !j?.airborne && strokeT <= 0) { strokeT = .85; host.sound?.('stroke'); }
    if (step.glide) { const l = limbs(w.player); l.armL?.rotation.set(-.2, 0, -1.35); l.armR?.rotation.set(-.2, 0, 1.35); l.legL?.rotation.set(.25, 0, 0); l.legR?.rotation.set(-.1, 0, 0); }
    if (state.mode !== 'land' && !j?.airborne) {
      rippleT -= dt;
      if (rippleT <= 0) { rippleT = w.moving ? .32 : .85; w.fx?.ring({ x: w.position.x, y: 0, z: w.position.z }, { color: '#e8f8ff', from: .35, to: w.moving ? 1.2 : 1.6, life: .9, y: .32, thick: .1, opacity: .55 }); }
    }
    // Pets that walk paddle along: lower in the water, with their own ripple now and then.
    for (const c of [w.companion, w.companion2]) {
      if (!c?.visible || c.position.y > .6) continue;
      const inPond = pools.find(o => Math.hypot(c.position.x - o.x, c.position.z - o.z) < o.r);
      if (inPond) { c.position.y -= .28; if (rippleT > .3 && rippleT - dt <= .3) w.fx?.ring({ x: c.position.x, y: 0, z: c.position.z }, { color: '#e8f8ff', from: .25, to: .8, life: .7, y: .32, thick: .08, opacity: .45 }); }
    }
    // Other players: their pose says wade or swim (server-cleaned); their body sinks and strokes the same way.
    for (const [id, remote] of w.remotePlayers ?? []) {
      const mode = (remote.pose as { swim?: SwimMode }).swim; if (!mode || mode === 'land' || !remote.mesh.visible) { remoteRipple.delete(id); continue; }
      const m = remote.mesh, body = m.children[0]; if (body) body.position.y -= swimSink(mode) * .6 / (m.scale.y || 1);
      if (mode === 'swim') strokePose(limbs(m), w.time + id.length, true);
      const left = (remoteRipple.get(id) ?? 0) - dt; if (left <= 0) { w.fx?.ring({ x: m.position.x, y: 0, z: m.position.z }, { color: '#e8f8ff', from: .35, to: 1.3, life: .9, y: .32, thick: .1, opacity: .5 }); remoteRipple.set(id, .6); } else remoteRipple.set(id, left);
    }
    // The ring: stamina while in or just out of the deep, the push while stepping in.
    if (step.push > 0) showRing('push', step.push);
    else if (enabled && (state.mode === 'swim' || state.stamina < 1 && state.sinceSwim < 2.5)) showRing('stamina', state.stamina);
    else hideRing();
  };

  return {
    mode: () => state.mode,
    blocksActions: () => swimBlocksActions(state.mode),
    stamina: () => state.stamina,
    reset: () => { state.reset(); w.waterPass = false; w.swimSpeed = 1; hideRing(); document.body.classList.remove('swimming', 'wading'); wasMode = 'land'; },
    state,
  };
}
