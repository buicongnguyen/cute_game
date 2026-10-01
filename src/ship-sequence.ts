import * as T from 'three';
import type { World } from './world.ts';
import type { Sound } from './sfx.ts';

/**
 * The starship leaving and reaching a planet: ignition with smoke and shaking, a
 * spinning lift-off that speeds up, and a slowing descent onto the pad. The explorer
 * rides inside, so it is hidden until the ship has landed.
 */
export class ShipSequence {
  phase: 'ignite' | 'lift' | 'land' | null = null;
  private t = 0; private v = 0; private done: (() => void) | null = null; private finished = false;
  private focus = new T.Vector3();

  constructor(private world: World, private sound: (sound: Sound) => void) {}
  get busy() { return this.phase !== null; }

  launch(done: () => void) {
    const rocket = this.world.launchRocket();
    if (!rocket) { done(); return; }
    this.phase = 'ignite'; this.t = 0; this.v = 0; this.done = done; this.finished = false;
    this.world.boarded = true;
    this.world.fx?.burst(this.world.position, { n: 18, color: ['#ffffff', '#8ef6ff'], glow: true, speed: 3, up: 5 });
    this.sound('pop'); this.sound('alert');
  }

  land(done: () => void) {
    const rocket = this.world.launchRocket();
    if (!rocket) { done(); return; }
    this.phase = 'land'; this.t = 0; this.done = done; this.finished = false;
    this.world.boarded = true; rocket.ship.position.y = 45; if (rocket.flame) rocket.flame.visible = true;
    this.track(rocket); this.world.cameraTarget.copy(this.focus);
  }

  private track(rocket: NonNullable<ReturnType<World['launchRocket']>>) {
    this.focus.set(rocket.x + rocket.ship.position.x, rocket.ship.position.y, rocket.z + rocket.ship.position.z);
    this.world.cameraFocus = this.focus;
  }

  update(dt: number, time: number) {
    if (!this.phase) return;
    const rocket = this.world.launchRocket(), fx = this.world.fx;
    if (!rocket) { this.finish(); return; }
    const { ship, flame } = rocket, base = { x: rocket.x, z: rocket.z };
    this.t += dt;
    const flicker = (boost = 1) => flame?.scale.set(1 + Math.sin(time * 50) * .12, boost * (1 + Math.random() * .5), 1 + Math.sin(time * 43) * .12);
    const smoke = (rate: number) => { if (Math.random() < dt * rate) fx?.burst({ x: base.x + (Math.random() - .5) * 3, z: base.z + (Math.random() - .5) * 3 }, { n: 2, color: ['#ffffff', '#e8e8f0', '#d0d0e0'], size: .35, speed: 3, up: 2, y: .3, life: 1.4, gravity: -1 }); };
    if (this.phase === 'ignite') {
      if (flame) { flame.visible = this.t > .5; if (flame.visible) flicker(); }
      ship.position.x = (Math.random() - .5) * .08 * Math.min(1, this.t);
      fx?.shake(.15 * Math.min(1, this.t)); smoke(30);
      if (this.t > 1.8) {
        this.phase = 'lift'; this.t = 0; this.v = 0; ship.position.x = 0;
        this.sound('crit'); this.sound('cast');
        fx?.ring({ x: base.x, z: base.z }, { color: '#fff3c4', to: 6, life: .6, thick: .3 });
      }
    } else if (this.phase === 'lift') {
      flicker(1.4); this.v += dt * (8 + this.t * 14); ship.position.y += this.v * dt; ship.rotation.y += dt * .6;
      if (Math.random() < dt * 40) fx?.burst({ x: base.x, y: ship.position.y - .4, z: base.z }, { n: 2, color: ['#ffb13d', '#fff27a', '#ff6a2b'], glow: true, size: .2, speed: 1.5, up: -4, y: 0, life: .5, gravity: 2 });
      if (this.t > .4 && this.t < 1.6) smoke(20);
      if (this.t > 2.4) this.finish();
    } else {
      const k = Math.min(1, this.t / 3.2), s = 1 - (1 - k) ** 3;
      ship.position.y = 45 * (1 - s) + rocket.rest * s; ship.rotation.y = (1 - s) * 4; flicker(.6 + (1 - k) * .8);
      if (Math.random() < dt * 30) fx?.burst({ x: base.x, y: ship.position.y - .4, z: base.z }, { n: 1, color: ['#ffb13d', '#fff27a'], glow: true, size: .22, speed: 1.5, up: -3, y: 0, life: .5, gravity: 3 });
      if (k > .75) smoke(25);
      if (k >= 1) {
        if (flame) flame.visible = false;
        this.world.fx?.burst(this.world.position, { n: 26, color: ['#ffffff', '#8ef6ff', '#ffe66d'], glow: true, speed: 4, up: 7 });
        this.sound('level'); this.finish();
      }
    }
    // Once landed, the camera goes back to the explorer.
    if (this.phase) this.track(rocket);
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    const rocket = this.world.launchRocket();
    if (rocket && this.phase === 'land') { rocket.ship.position.set(0, rocket.rest, 0); rocket.ship.rotation.set(0, 0, 0); }
    if (this.phase === 'land') { this.world.boarded = false; this.world.cameraFocus = null; }
    this.phase = null;
    const done = this.done; this.done = null; done?.();
  }

  /** Puts the ship back on its pad, for example after a cancelled or failed launch. */
  reset() {
    const rocket = this.world.launchRocket();
    if (rocket) { rocket.ship.position.set(0, rocket.rest, 0); rocket.ship.rotation.set(0, 0, 0); if (rocket.flame) rocket.flame.visible = false; }
    this.phase = null; this.done = null; this.world.boarded = false; this.world.cameraFocus = null;
  }
}
