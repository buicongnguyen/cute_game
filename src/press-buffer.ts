/**
 * A press of Attack that comes while the last swing's cooldown still runs is kept for PRESS_BUFFER seconds and swings
 * the moment the cooldown ends, so mashing chains without lost presses (AAA-PLAN WP9). It is stepped on the game's
 * clock: a hit-stop does not eat the wait. One press is kept, the latest. The kept press only ever swings
 * (main.ts basicAttack); it never uses the thing the explorer stands beside.
 */
export const PRESS_BUFFER = .15;
export class PressBuffer {
  /** Seconds the kept press still waits; 0 when none is kept. */
  left = 0;
  press() { this.left = PRESS_BUFFER; }
  clear() { this.left = 0; }
  /** One step of `dt` seconds; `ready`: a swing may start now. True when the kept press swings in this step. */
  step(dt: number, ready: boolean) {
    if (!(this.left > 0)) return false;
    if (ready) { this.left = 0; return true; }
    this.left -= dt; return false;
  }
}
