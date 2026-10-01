export type MovementKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const movementKeys = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** Physical keys keep shortcuts stable with Vietnamese layouts. Composition never triggers gameplay. */
export function gameplayKey(event:{code?:string;key:string;isComposing?:boolean;keyCode?:number;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean}){
  if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return '';
  const code=event.code||'';return /^Key[A-Z]$/.test(code)?code.slice(3).toLowerCase():code==='Space'?' ':code.startsWith('Arrow')?code:code==='Escape'?'Escape':code==='Enter'?'Enter':code==='Tab'?'Tab':event.key.length===1?event.key.toLowerCase():event.key;
}
export const JOYSTICK={radius:52,deadZone:.18} as const;
export class JoystickInput{
  pointer:number|null=null;x=0;z=0;
  begin(pointer:number){if(this.pointer!==null)return false;this.pointer=pointer;return true;}
  move(pointer:number,x:number,z:number){if(this.pointer!==pointer)return;const length=Math.hypot(x,z),scale=length>JOYSTICK.radius?JOYSTICK.radius/length:1;this.x=x*scale;this.z=z*scale;}
  end(pointer=this.pointer){if(pointer!==this.pointer)return;this.pointer=null;this.x=this.z=0;}
  get direction(){const length=Math.hypot(this.x,this.z);return this.pointer===null||length<JOYSTICK.radius*JOYSTICK.deadZone?null:{x:this.x/length,z:this.z/length};}
}

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
