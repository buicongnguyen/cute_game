export type MovementKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const movementKeys = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Combine keyboard and touch input without one input source releasing another. */
export class MovementControls {
  private keyboard = new Set<MovementKey>();
  private pointers = new Map<number, MovementKey>();
  private output: Set<string>;
  constructor(output: Set<string>) { this.output = output; }

  pressKey(key: string) {
    if (!movementKeys.has(key)) return;
    this.keyboard.add(key as MovementKey); this.sync();
  }
  releaseKey(key: string) { this.keyboard.delete(key as MovementKey); this.sync(); }
  pressPointer(pointerId: number, key: string) {
    if (!movementKeys.has(key)) return;
    this.pointers.set(pointerId, key as MovementKey); this.sync();
  }
  releasePointer(pointerId: number) { this.pointers.delete(pointerId); this.sync(); }
  clear() { this.keyboard.clear(); this.pointers.clear(); this.sync(); }
  private sync() {
    this.output.clear();
    for (const key of this.keyboard) this.output.add(key);
    for (const key of this.pointers.values()) this.output.add(key);
  }
}

/** Combat uses the same pause policy as enemies and movement. */
export class CombatTimers {
  attackCooldown = 0;
  invulnerable = 0;
  readonly skills = [0, 0, 0, 0];

  advance(dt: number, active: boolean) {
    if (!active) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    for (let i = 0; i < this.skills.length; i++) this.skills[i] = Math.max(0, this.skills[i] - dt);
  }
  reset() { this.attackCooldown = 0; this.invulnerable = 0; this.skills.fill(0); }
}

interface ReelButton { disabled: boolean; focus(): void }

/** Hold/release and accessible click toggling share one fishing input state. */
export class FishingInput {
  ready = false;
  keyboardToggle = false;
  private spaceHeld = false;
  private toggledHeld = false;
  private pointers = new Set<number>();
  get held() { return this.ready && (this.spaceHeld || this.toggledHeld || this.pointers.size > 0); }

  enable(button: ReelButton) {
    this.ready = true; button.disabled = false; button.focus();
  }
  holdSpace() {
    if (!this.ready) return;
    this.keyboardToggle = false; this.toggledHeld = false; this.spaceHeld = true;
  }
  releaseSpace() { this.spaceHeld = false; }
  pressPointer(pointerId: number) {
    if (!this.ready) return;
    this.keyboardToggle = false; this.toggledHeld = false; this.pointers.add(pointerId);
  }
  releasePointer(pointerId: number) { this.pointers.delete(pointerId); }
  toggle() {
    if (!this.ready) return;
    const next = !this.held;
    this.clear(); this.keyboardToggle = true; this.toggledHeld = next;
  }
  clear() { this.spaceHeld = false; this.toggledHeld = false; this.pointers.clear(); this.keyboardToggle = false; }
}
