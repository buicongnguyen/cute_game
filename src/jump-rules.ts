/**
 * Jumping and air combat as pure rules (tests/jump-rules.test.ts): no three.js, no page. world.ts draws the arc,
 * main.ts turns key presses into jumps, swings and dives, combat.ts deals the damage.
 *
 * The fight these rules make:
 *   ground hits -> a launcher (every third basic hit, or a knock-up skill) -> air swings while rising -> a dive on the
 *   way down. Each hit of the chain adds a little damage, the dive that ends it adds a finisher bonus, and a dive from
 *   above a single jump's height is a sure critical on a boss or a large creature.
 *   Attacks come in two classes: 'ground' ones (shockwaves, slam rings, quakes, floor hazards, low charges) pass under
 *   an explorer who is high enough, 'body' ones (shots, bites, swings, beams, grabs) still hit. Leaving the ground just
 *   before a ground attack lands is a perfect dodge: no damage, and the next hit is a sure critical.
 *
 * Jumping never changes where the explorer may stand: the jump is a height only, so walls, fences, water and every
 * obstacle block exactly as they do on foot (world.move is the one mover, in the air too).
 *
 * Online: creature damage belongs to the server and the room's host. Only the height and the dodge are used there; the
 * damage bonuses below (air swing, dive, combo ramp, sure criticals) are solo rules and are never sent or claimed.
 */

export const JUMP = {
  /** m/s². A single jump is up and down in about 0.48 s. */
  gravity: 70,
  /** Height each jump adds above where it starts (m): the single jump, the double, the triple. */
  rise: [2, 1.3, 1.1],
  maxJumps: 3,
  /** Seconds on the ground before the next jump: after a plain landing, and after a dive strike. */
  landLag: .12, diveLag: .32,
  /** A press this long before touching down still jumps on landing. */
  buffer: .12,
  /** Fastest plain fall (m/s) and the dive's speed. */
  fallMax: 26, diveSpeed: 34,
  /** Seconds of the spin an extra jump adds. */
  flourish: .28,
} as const;
/** Take-off speed (m/s) of jump `n` (1 to 3): each adds its own height from wherever it starts. */
export const jumpSpeed = (n: number) => Math.sqrt(2 * JUMP.gravity * JUMP.rise[Math.max(0, Math.min(JUMP.maxJumps, n) - 1)]);
/** Seconds a single jump stays in the air. */
export const SINGLE_AIR_TIME = 2 * jumpSpeed(1) / JUMP.gravity;
/** The highest a triple jump reaches when each extra jump is pressed at the top of the one before. */
export const MAX_HEIGHT = JUMP.rise.reduce((a, b) => a + b, 0);

/** What a landing was: a plain touch-down or a dive, the height the dive began at, the jumps used and the highest point. */
export interface Landing { dive: boolean; from: number; jumps: number; peak: number }

/** The explorer's height above the ground while jumping. One instance per explorer; `step` runs with the world's clock. */
export class JumpState {
  height = 0; velocity = 0;
  /** Jumps used since leaving the ground: 0 standing, 1 to 3 in the air. */
  jumps = 0;
  /** Jumps this explorer has: 1 for a new player, 2 and 3 once the Jump skill is improved (jumpsFor). */
  max: number = JUMP.maxJumps;
  /** Seconds since leaving the ground, the highest point so far, and the spin left of the last extra jump. */
  airTime = 0; peak = 0; spin = 0;
  diving = false; diveFrom = 0;
  /** Seconds before the next jump is allowed, and seconds left of an air dash (the height holds). */
  lag = 0; hover = 0;
  get airborne() { return this.jumps > 0; }
  get rising() { return this.jumps > 0 && this.velocity > 0 && !this.diving; }
  get falling() { return this.jumps > 0 && this.velocity <= 0; }
  /** A jump may start now: from the ground once the landing lag is over, in the air while jumps are left. */
  get ready() { return this.diving ? false : this.jumps === 0 ? this.lag <= 0 : this.jumps < Math.min(JUMP.maxJumps, this.max); }
  /** Jumps. Returns which jump it was (1 to 3), or 0 when none is left or the landing lag still runs. */
  jump(): number {
    if (!this.ready) return 0;
    if (this.jumps === 0) { this.airTime = 0; this.peak = 0; }
    this.jumps++; this.velocity = jumpSpeed(this.jumps); this.hover = 0;
    if (this.jumps > 1) this.spin = JUMP.flourish;
    return this.jumps;
  }
  /** Starts a dive: straight down at JUMP.diveSpeed. Only from DIVE.minHeight or higher. */
  dive(): boolean {
    if (!this.airborne || this.diving || this.height < DIVE.minHeight) return false;
    this.diving = true; this.diveFrom = this.height; this.velocity = -JUMP.diveSpeed; this.hover = 0; return true;
  }
  /** Holds the height for `seconds` (the air dash). */
  hold(seconds: number) { if (this.airborne && !this.diving) { this.hover = Math.max(this.hover, seconds); this.velocity = 0; } }
  /** One step of the arc. Returns the landing on the step the explorer touches down. */
  step(dt: number): Landing | null {
    if (!(dt > 0)) return null;
    this.spin = Math.max(0, this.spin - dt);
    if (!this.airborne) { this.lag = Math.max(0, this.lag - dt); return null; }
    this.airTime += dt;
    if (this.hover > 0) { this.hover = Math.max(0, this.hover - dt); return null; }
    if (!this.diving) this.velocity = Math.max(-JUMP.fallMax, this.velocity - JUMP.gravity * dt);
    this.height += this.velocity * dt; if (this.height > this.peak) this.peak = this.height;
    if (this.height > 0) return null;
    const landing: Landing = { dive: this.diving, from: this.diving ? this.diveFrom : 0, jumps: this.jumps, peak: this.peak };
    this.lag = this.diving ? JUMP.diveLag : JUMP.landLag; this.reset(); return landing;
  }
  /** Back on the ground at once (a cut-scene, a throw, a new world). */
  cancel() { this.reset(); this.lag = 0; }
  private reset() { this.height = 0; this.velocity = 0; this.jumps = 0; this.diving = false; this.diveFrom = 0; this.hover = 0; this.spin = 0; }
}

/**
 * The jump key or button. A tap jumps; a tap just before landing jumps on touch-down; holding performs the extra
 * jumps by itself at the top of each arc (so does tapping again). Holding never bounces off the ground again.
 */
export class JumpInput {
  held = false; private buffer = 0;
  down() { this.held = true; this.buffer = JUMP.buffer; }
  up() { this.held = false; }
  clear() { this.held = false; this.buffer = 0; }
  /** Call every step: true when a jump should be tried now. Tell it with `done()` when the jump happened. */
  wants(state: JumpState, dt: number): boolean {
    // The press waits out the landing lag: its clock runs in the air and once a jump is possible again.
    if (this.buffer > 0) { if (state.airborne || state.lag <= 0) this.buffer = Math.max(0, this.buffer - dt); return true; }
    return this.held && state.airborne && !state.diving && state.velocity <= 0 && state.jumps < Math.min(JUMP.maxJumps, state.max) && state.hover <= 0;
  }
  done() { this.buffer = 0; }
}

/** Where jumping makes no sense. `canJump` returns the first reason, or '' when the explorer may jump. */
export interface JumpContext {
  playing: boolean; menu?: boolean; cutscene?: boolean; indoors?: boolean; fishing?: boolean; placing?: boolean; stunned?: boolean;
  thrown?: boolean; starship?: boolean; swimming?: boolean; flying?: boolean; riding?: boolean; casting?: boolean; down?: boolean;
}
export type JumpBlock = '' | 'idle' | 'menu' | 'cutscene' | 'indoors' | 'fishing' | 'placing' | 'stunned' | 'thrown' | 'starship' | 'swimming' | 'flying' | 'riding' | 'casting' | 'down';
export function canJump(c: JumpContext): JumpBlock {
  if (!c.playing) return 'idle';
  for (const key of ['down', 'menu', 'cutscene', 'starship', 'indoors', 'fishing', 'placing', 'stunned', 'thrown', 'swimming', 'flying', 'riding', 'casting'] as const) if (c[key]) return key;
  return '';
}

// ---------------------------------------------------------------- The Jump skill

/**
 * A new player has one jump. The second and the third are bought at the cottage's upgrade bench (upgrades.ts
 * upgradeJump, the same bench and materials as the four skills): each needs a level and a price.
 */
export const JUMP_UNLOCKS: readonly { level: number; energy: number; materials: Readonly<Record<string, number>> }[] = [
  { level: 10, energy: 600, materials: { bone: 6 } },                 // the double jump
  { level: 25, energy: 2400, materials: { bone: 10, starshard: 3 } }, // the triple jump
];
export const MAX_JUMP_LEVEL = JUMP_UNLOCKS.length;
export const clampJumpLevel = (level: unknown) => typeof level === 'number' && Number.isSafeInteger(level) ? Math.max(0, Math.min(MAX_JUMP_LEVEL, level)) : 0;
/** Jumps in one airtime at Jump skill `level` (0 to 2): 1, 2 or 3. Tester mode has all three. */
export const jumpsFor = (level: unknown, tester = false) => tester ? JUMP.maxJumps : 1 + clampJumpLevel(level);

// ---------------------------------------------------------------- Bosses block low hits

/**
 * A boss blocks hits that come from the ground or from a single jump's height: they deal `share` of their damage.
 * Hits from double-jump height or higher (an air swing up there, a dive that began there) get through whole. So a
 * single jump is for dodging, and the double jump is what opens a boss up. Ordinary creatures never block.
 * One number per boss, for the owner to tune (1 = no block). Bosses met before the double jump can be had (the home
 * map, Toybox, Candy, Jungle) do not block; the rest start at BLOCK.share. The owner's first value was a half; the
 * scripted fights (promo/fight-sim.mts) put a hero without the double jump at about 110 s on the last boss with it, so it
 * is 0.6: 65 to 90 s on the ground, 50 to 70 s with the double jump.
 */
export const BLOCK = { share: .6, /** Metres: above any single jump. */ height: 2.2, jumps: 2, /** Seconds between two 'Blocked' floats on one boss. */ textGap: .7 } as const;
export const BOSS_BLOCK: Readonly<Record<string, number>> = {
  bear: 1, treant: 1, croc: 1, mushking: 1, robot: 1, cake: 1, gingerbread: 1, jellyqueen: 1, gorilla: 1,
  yeti: .6, mammoth: .6, frostowl: .6, leviathan: .6, golem: .6, dragon: .6, phoenix: .6, shadowlord: .6,
  // The Cinderpeak Colossus keeps its own rules (the head weak point).
  colossus: 1,
};
/** The share of a low hit a boss lets through. A boss without its own number blocks only where its world opens at the double jump's level or later. */
export function blockShare(type: string | undefined, worldLevel = 0) { const own = type ? BOSS_BLOCK[type] : undefined; return own ?? (worldLevel >= JUMP_UNLOCKS[0].level ? BLOCK.share : 1); }
/** What a hit keeps against a boss with block `share`: everything from double-jump height (second jump or later, BLOCK.height up), else `share`. */
export function hitShare(share: number, height: number, jumps: number) { return jumps >= BLOCK.jumps && height >= BLOCK.height ? 1 : Math.max(0, Math.min(1, share)); }

// ---------------------------------------------------------------- Dodging

/** 'ground' attacks pass under an explorer DODGE.height m up or higher; 'body' attacks hit at any height. */
export type AttackClass = 'ground' | 'body';
/**
 * Because a jump now clears a boss's slam, the slam has an aftershock while jumping is on: a second ring, `delay` s
 * after the first and `power` times as strong. A single jump has to be timed twice; a double jump rides over both.
 */
export const AFTERSHOCK = { delay: .55, power: .8 } as const;
export const DODGE = {
  /** Metres above the ground at which a ground attack misses. */
  height: .9,
  /** Leaving the ground at most this long before a ground attack lands is a perfect dodge (s): keys, and the wider window of touch play. */
  perfect: .25, perfectTouch: .4,
  /** After a perfect dodge the next hit within this many seconds is a sure critical. */
  sure: 2,
  /** The slow-motion beat of a perfect dodge (s of hit-stop). */
  slow: .14,
} as const;
/**
 * Every attack's class, by the skill or kind that deals it. One table for the whole game: bosses (boss-patterns.ts),
 * titans (titan-patterns.ts), the Colossus (colossus-patterns.ts), ordinary creatures and the floor.
 * Ground: what travels along the floor. Body: what flies, falls, bites, swings or grabs.
 */
export const ATTACK_CLASS: Readonly<Record<string, AttackClass>> = {
  // Boss skills
  slam: 'ground', quake: 'ground', charge: 'body', barrage: 'body', rain: 'body', spin: 'body', eclipse: 'body',
  // Titan skills
  leap: 'ground', donut: 'ground', stomp4: 'ground', pools: 'ground', sweep: 'body', pull: 'body', lines: 'body', bombard: 'body', orbs: 'body', summon: 'body',
  // The Colossus (its arm sweep shares the titans' 'sweep' entry: body)
  stomp: 'ground', slap: 'ground', bite: 'body', breath: 'body', grab: 'body', spit: 'body', meteor: 'body', roar: 'body',
  // Ordinary creatures: a bite or a swing, a shot, a small charger's low rush, a shell or worm slam, a boss's plain slam
  melee: 'body', shot: 'body', rush: 'ground', burst: 'ground',
  // The floor itself
  lava: 'ground',
};
export const attackClass = (kind: string | undefined): AttackClass => (kind && ATTACK_CLASS[kind]) || 'body';
/** A ground attack misses an explorer this high; a body attack never misses. */
export function dodges(cls: AttackClass, height: number) { return cls === 'ground' && height >= DODGE.height; }
/** A dodge is perfect when the explorer left the ground at most DODGE.perfect s before the attack landed. */
export function perfectDodge(cls: AttackClass, height: number, sinceTakeoff: number, touch = false) { return dodges(cls, height) && sinceTakeoff >= 0 && sinceTakeoff <= (touch ? DODGE.perfectTouch : DODGE.perfect); }
/**
 * Another explorer's jump height as the room's host sees it: its pose height above the ground it stands on (less the
 * 1.7 m a flying disguise adds). Honoured only between DODGE.height and a little over the highest triple jump.
 */
export function poseAir(y: number | undefined, ground: number, flight = 0) {
  const air = (y ?? 0) - ground - flight; return Number.isFinite(air) && air >= DODGE.height && air <= MAX_HEIGHT + 1 ? air : 0;
}
/** Nobody stays in the air longer than this in one go (s); a pose that claims more is treated as standing. */
export const MAX_AIR_SECONDS = 2;

// ---------------------------------------------------------------- The air window and the touch slide

/**
 * When a press of the attack or a skill is an air move. The window is open while the explorer rises and for the first
 * part of the fall; below AIR_WINDOW.minHeight on the way down it is shut: the press is kept and becomes the ordinary
 * ground move on landing. The same on keys and on touch.
 */
export const AIR_WINDOW = { /** Metres: falling below this, there is no air move any more. */ minHeight: .35, /** Seconds a late press waits for the landing. */ buffer: .5 } as const;
export function airWindow(j: { airborne: boolean; diving: boolean; velocity: number; height: number }) { return j.airborne && !j.diving && (j.velocity > 0 || j.height >= AIR_WINDOW.minHeight); }
/** What a press does now: the 'ground' move, its 'air' form, or 'buffer' (late in the fall or mid-dive: the ground move after landing). */
export function pressKind(j: { airborne: boolean; diving: boolean; velocity: number; height: number }): 'ground' | 'air' | 'buffer' { return !j.airborne ? 'ground' : airWindow(j) ? 'air' : 'buffer'; }
/**
 * The touch slide: press Jump, slide the same finger onto the attack pad or a skill toe and let go there. The move fires
 * when the finger is released on that button, or has rested on it for SLIDE.dwell s, so brushing a toe on the way to
 * another fires nothing. One move per slide. Only the finger that pressed Jump is followed, so the joystick's finger
 * is never touched. `target` is the button under the finger ('attack', 'skill0' to 'skill3'), or null.
 */
export const SLIDE = { dwell: .06 } as const;
export class SlideCombo {
  private pointer: number | null = null; private target: string | null = null; private since = 0; private fired = false;
  get active() { return this.pointer !== null; }
  owns(pointer: number) { return this.pointer === pointer; }
  begin(pointer: number) { this.pointer = pointer; this.target = null; this.fired = false; this.since = 0; }
  /** The finger moved: what is under it now. Returns the move to fire (after the dwell), or null. */
  move(pointer: number, target: string | null, now: number): string | null {
    if (pointer !== this.pointer || this.fired) return null;
    if (target !== this.target) { this.target = target; this.since = now; return null; }
    return this.poll(now);
  }
  /** The clock ticked with the finger at rest: fires once the dwell is over. */
  poll(now: number): string | null {
    if (this.pointer === null || this.fired || !this.target || now - this.since < SLIDE.dwell) return null;
    this.fired = true; return this.target;
  }
  /** The finger lifted: fires the button it is on, unless the slide already fired. */
  release(pointer: number): string | null {
    if (pointer !== this.pointer) return null;
    const out = this.fired ? null : this.target; this.cancel(); return out;
  }
  cancel() { this.pointer = null; this.target = null; this.fired = false; }
}

// ---------------------------------------------------------------- Air attacks

export const AIR = {
  /** A swing in the air is quick and a little lighter (damage factor). */
  swing: .8,
  /** Breeze Step in the air: the dash holds its height and hits harder. */
  dash: 1.2,
  /** Root Quake in the air: the explorer plunges at once; the shockwave is wider (m) and stronger (factor). */
  quakeRadius: 1, quakePower: 1.3,
  /** Touch play: a dive drifts up to `homing` m toward the nearest creature within `homingRange` m (never through an obstacle). */
  homing: 1.4, homingRange: 3.6,
  /** The launcher (every third basic hit) lifts an ordinary creature this high (m); an air hit on a lifted creature pops it up again. */
  launch: 1.7, juggle: 1.1,
} as const;
export const DIVE = {
  /** A dive needs this much height (m); below it the attack is a plain swing. */
  minHeight: .9,
  radius: 2.4, stun: .6, knock: 1.5,
  /** Damage factor: base + perMetre for each metre of the height the dive began at (at most MAX_HEIGHT). */
  base: .45, perMetre: .1,
  /** A sure critical needs a second or third jump and at least this height (above any single jump), on a boss or a creature this wide (m). */
  critJumps: 2, critHeight: 2.2, big: 1.2,
  /** One dive never takes more than this share of a boss's full health. */
  bossCap: .2,
} as const;
/** The dive's damage factor (x attack) from the height it began at: single < double < triple. */
export function diveMultiplier(height: number) { return DIVE.base + DIVE.perMetre * Math.max(0, Math.min(MAX_HEIGHT, height)); }
/** A dive from a double or triple jump is a sure critical on a boss or a large creature. */
export function diveCritical(jumps: number, height: number, target: { boss?: boolean; radius: number }) {
  return jumps >= DIVE.critJumps && height >= DIVE.critHeight && (!!target.boss || target.radius >= DIVE.big);
}
/** The most one dive may take from a target: DIVE.bossCap of a boss's full health; anything from ordinary creatures. */
export function diveCap(target: { boss?: boolean; maxHp?: number }) { return target.boss && target.maxHp ? Math.max(1, Math.round(target.maxHp * DIVE.bossCap)) : Infinity; }

// ---------------------------------------------------------------- The combo

export const COMBO = {
  /** Hits chain while less than this many seconds pass between them: keys, and the wider timer of touch play. */
  window: 1.5, windowTouch: 2,
  /** Each hit of the chain adds this much damage to the next, up to `max`. */
  step: .04, max: .4,
  /** A dive that ends a chain of at least `finisherHits` hits deals this much more. */
  finisher: 1.25, finisherHits: 3,
  /** Hits closer together than this (one swing through a crowd, one tick of a whirl) count once. */
  gap: .08,
  /** Seconds the final count stays on screen after the chain ends. */
  linger: 1.2,
} as const;
export type ComboHit = 'ground' | 'launcher' | 'air' | 'dive';
/** Steps of the fight the chain has shown so far, for the HUD chip's four pips. */
export interface ComboView { count: number; bonus: number; launched: boolean; aired: boolean; finished: boolean; live: boolean }
export class ComboMeter {
  count = 0; launched = false; aired = false; finished = false;
  /** Seconds a chain survives without a hit (COMBO.window, or COMBO.windowTouch on touch screens). */
  window: number = COMBO.window;
  private since = Infinity; private shown = 0;
  /** True while a chain is running. */
  get live() { return this.count > 0 && this.since < this.window && !this.finished; }
  /** Damage factor for the next hit: +COMBO.step per hit already in the chain, up to +COMBO.max. */
  get bonus() { return this.live ? 1 + Math.min(COMBO.max, COMBO.step * this.count) : 1; }
  /** A dive now would be a finisher. */
  get finisherReady() { return this.live && this.count >= COMBO.finisherHits; }
  /** The damage factor a dive gets: the ramp, times the finisher bonus when it ends a long enough chain. */
  diveBonus() { return this.bonus * (this.finisherReady ? COMBO.finisher : 1); }
  /** A hit landed. Returns true when it added to the count (hits within COMBO.gap of the last count once). */
  hit(kind: ComboHit): boolean {
    if (!this.live) { this.count = 0; this.launched = this.aired = this.finished = false; this.since = Infinity; }
    const finisher = kind === 'dive' && this.count >= COMBO.finisherHits;
    if (this.count > 0 && this.since < COMBO.gap && !finisher) { this.mark(kind); return false; }
    this.count++; this.since = 0; this.shown = COMBO.linger; this.mark(kind);
    if (finisher) this.finished = true;
    return true;
  }
  private mark(kind: ComboHit) { if (kind === 'launcher') this.launched = true; if (kind === 'air') this.aired = true; }
  /** Being hit breaks the chain. */
  break() { if (this.count > 0 && !this.finished) this.shown = Math.min(this.shown, .35); this.since = Infinity; }
  step(dt: number) { if (!(dt > 0)) return; this.since += dt; this.shown = Math.max(0, this.shown - dt); if (!this.live && this.shown <= 0 && this.count) { this.count = 0; this.launched = this.aired = this.finished = false; } }
  /** What the chip shows: the count lingers briefly after the chain ends. */
  view(): ComboView { return { count: this.count, bonus: Math.round((this.bonus - 1) * 100), launched: this.launched, aired: this.aired, finished: this.finished, live: this.live }; }
  reset() { this.count = 0; this.launched = this.aired = this.finished = false; this.since = Infinity; this.shown = 0; }
}

/** Space jumps by default; players who liked the old way put the basic attack on Space (then Left Shift jumps). Kept per device. */
export type SpaceKey = 'jump' | 'attack';
export const SPACE_KEY_STORE = 'zoo-garden-space-key';
export function readSpaceKey(store: Pick<Storage, 'getItem'> | null): SpaceKey { try { return store?.getItem(SPACE_KEY_STORE) === 'attack' ? 'attack' : 'jump'; } catch { return 'jump'; } }
export function saveSpaceKey(store: Pick<Storage, 'setItem'> | null, value: SpaceKey) { try { store?.setItem(SPACE_KEY_STORE, value); } catch { /* storage blocked: it lasts for this visit */ } }
/**
 * The whole system sits behind one switch in Settings, on by default and kept per device. Off, the game plays as it did
 * before jumping existed: no jump key or button, Space is the basic attack, no combo, no dodge classes, no boss block.
 * Online it is off for everyone for now, so two explorers in one room never play by different rules (main.ts airOn).
 */
export const AIR_COMBAT_STORE = 'zoo-air-combat';
export function readAirCombat(store: Pick<Storage, 'getItem'> | null): boolean { try { return store?.getItem(AIR_COMBAT_STORE) !== 'off'; } catch { return true; } }
export function saveAirCombat(store: Pick<Storage, 'setItem'> | null, on: boolean) { try { store?.setItem(AIR_COMBAT_STORE, on ? 'on' : 'off'); } catch { /* storage blocked: it lasts for this visit */ } }
/** What a gameplay key does under the Space setting: 'jump', 'attack' or nothing. `code` is KeyboardEvent.code. With the system `on` = false, Space attacks and nothing jumps. */
export function jumpKeyAction(code: string, space: SpaceKey, on = true): 'jump' | 'attack' | '' {
  if (!on) return code === 'Space' ? 'attack' : '';
  if (code === 'Space') return space;
  if (code === 'ShiftLeft') return space === 'attack' ? 'jump' : '';
  return '';
}
