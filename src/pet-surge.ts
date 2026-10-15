import { CHAIN } from './five-rules.ts';
import { PET_RULES, petRoleId, petShare, petRole, type GuardKind, type PetFighter } from './pet-guard.ts';

/**
 * Bond Surge: the explorer lands the third hit of the attack chain (online, and wherever the chain is off: a third basic
 * hit within CHAIN.reset seconds of the last) while a pet is within the leash and the surge is ready. That pet grows to
 * about 85% of the explorer's height for SURGE.hold seconds, fires one signature move, then shrinks; after SURGE.cooldown
 * the next chain may start the next surge. Two pets (and the dog) take turns, one at a time.
 *
 * While big a pet's shots deal SURGE.damage x, its guard SURGE.guard x (a distraction lasts that much longer), and its
 * signature (by guard family, a few pets have their own) also staggers every boss near the explorer and leaves it taking
 * SURGE.vuln more damage FROM THE EXPLORER for SURGE.vulnTime seconds: the pet helps beat a boss without stealing the fight.
 *
 * No three.js here: the browser, the server (combat-authority.mjs, through CombatSimulation) and the tests share it, so
 * online the server decides every surge, its damage, its signature and the boss's weakness by these same rules.
 * pet-surge-view.ts draws it (the model's scale, pooled sparkles, the HUD ring).
 */
export const SURGE = {
  /** Seconds to grow, stay big, shrink, then wait before the next surge (any pet). */
  grow: .3, hold: 8, shrink: .4, cooldown: 5,
  /** The big pet's height as a share of the explorer's (the view). */
  height: .85,
  /** Shots x, guard power x (block, counter, mend) and distraction time x while big. */
  damage: 2, guard: 1.5,
  /** Every signature: bosses within `bossReach` m of the explorer are staggered `stagger` s and take +`vuln` from the explorer for `vulnTime` s. */
  bossReach: 10, stagger: .5, vuln: .15, vulnTime: 4,
  /** A press of the old basic attack counts toward three when it comes within CHAIN.reset s of the last. */
  gap: CHAIN.reset,
  /** Return fire: at most this many creature shots are sent back a surge, each for `reflect` x the explorer's attack. */
  reflects: 3, reflect: .5,
  /** Phoenix rebirth: a blow that would knock the explorer out leaves this share of health instead, at most once every `reviveEvery` s. */
  revive: .3, reviveEvery: 300,
  /** Assumed seconds from a surge's end of cooldown to the next landed chain, for the design bounds (promo/pet-sim.mts measures the real one). */
  wait: 1.2,
  /** Design bounds (tests/pet-surge.test.ts): one pet's damage share with surges, and the best pair at +10 (shots; a Vault skill does not surge). */
  shareMax: .18, pairMax: .38,
} as const;

export type SignatureId = 'bulwark' | 'returnfire' | 'bloom' | 'taunt' | 'bigbark' | 'stomp' | 'rebirth' | 'breath' | 'slam' | 'bind';
export interface Signature {
  name: string; icon: string; /** One line for the pet card and the Help topic. */ text: string;
  /** Damage x the explorer's attack to each creature it reaches (helper damage: never the explorer's). */ power: number;
  /** Where it reaches: a ring of `radius` m round the pet ('pet') or the explorer ('hero'), or a cone ahead of the pet. */ radius: number; around: 'pet' | 'hero' | 'cone';
  /** Seconds of the status it puts on ordinary creatures (taunt: blind, bind: root, bark: slow), and knock-back. */ hold?: number; knock?: number; stun?: number;
  /** The guard family's passive it keeps for the surge (the unique ones keep their family's). */ soak?: boolean; reflect?: boolean; heal?: number; ward?: number;
}
/** The four family signatures, the dog's, and five pets' own. Radii in metres, powers x the explorer's attack. */
export const SIGNATURES: Readonly<Record<SignatureId, Signature>> = {
  bulwark: { name: 'Bulwark', icon: '🛡️', text: 'Steps in front of you: soaks the next hit while it is big (a boss still lands most of its blow) and knocks small creatures back.', power: .2, radius: 3, around: 'hero', knock: 3, soak: true },
  returnfire: { name: 'Return fire', icon: '↩️', text: 'Sends creature shots aimed at you back at the shooter while it is big (up to three).', power: 0, radius: 0, around: 'hero', reflect: true },
  bloom: { name: 'Bloom', icon: '🌸', text: 'A ring of petals heals you and wards off poison, lava and storms for a few seconds.', power: 0, radius: 3, around: 'hero', heal: 3, ward: 3 },
  taunt: { name: 'Taunt', icon: '😤', text: 'Every creature nearby glares at your pet for 3 s instead of attacking you (a boss is slowed).', power: 0, radius: 8, around: 'pet', hold: 3 },
  bigbark: { name: 'Big bark', icon: '🐕', text: 'One huge bark knocks nearby creatures back and slows them.', power: .15, radius: 4, around: 'pet', hold: 2, knock: 3.5 },
  stomp: { name: 'Titan stomp', icon: '🗿', text: 'A stomp that stuns everything round it, then it soaks the next hit for you.', power: .4, radius: 4, around: 'pet', stun: .8, knock: 2.5, soak: true },
  rebirth: { name: 'Rebirth', icon: '🔥', text: 'Heals you, and if a blow would knock you out it brings you back at 30% health (once every 5 minutes).', power: 0, radius: 3, around: 'hero', heal: 3, ward: 3 },
  breath: { name: 'Fire breath', icon: '🐉', text: 'Breathes a cone of fire at the creatures ahead, then sends shots back at their owners.', power: .8, radius: 5.5, around: 'cone', reflect: true },
  slam: { name: 'Tentacle slam', icon: '🐙', text: 'Slams a ring of tentacles round itself, knocking creatures back, then soaks the next hit.', power: .7, radius: 3.5, around: 'pet', stun: .4, knock: 2, soak: true },
  bind: { name: 'Shadow bind', icon: '🌑', text: 'Roots every creature nearby in shadow for 2 s.', power: 0, radius: 6, around: 'pet', stun: 2 },
};
const FAMILY: Record<GuardKind, SignatureId> = { block: 'bulwark', counter: 'returnfire', mend: 'bloom', distract: 'taunt', bark: 'bigbark' };
const OWN: Readonly<Record<string, SignatureId>> = { pet_colossus: 'stomp', pet_b_phoenix: 'rebirth', pet_b_dragon: 'breath', pet_t_kraken: 'slam', pet_b_shadowlord: 'bind' };
/** The signature of pet `id` (a dyed pet is its base); `kind` for the dog ('bark'). */
export function signatureOf(id: string | undefined, kind?: GuardKind): SignatureId | undefined {
  const base = petRoleId(id); if (base && OWN[base]) return OWN[base];
  const guard = kind ?? petRole(id)?.guard; return guard ? FAMILY[guard] : undefined;
}
/** The cone of Fire breath: half-angle cosine. */
export const BREATH_COS = .5;

/** One pet's damage share (of the explorer's) with surges, the design formula: big for `hold` of every cycle, one pet alone. */
export const surgeUptime = (pets = 1) => SURGE.hold / (SURGE.grow + SURGE.hold + SURGE.shrink + SURGE.cooldown + SURGE.wait) / Math.max(1, pets);
/** A pet's share of the explorer's damage with surges: its shots, x SURGE.damage for its share of the time, plus its signature's damage once a cycle on one creature. */
export function surgeShare(id: string, factor = 1, pets = 1) {
  const role = petRole(id); if (!role) return 0; const sig = SIGNATURES[signatureOf(id)!], cycle = (SURGE.grow + SURGE.hold + SURGE.shrink + SURGE.cooldown + SURGE.wait) * Math.max(1, pets);
  return petShare(role, factor) * (1 + (SURGE.damage - 1) * surgeUptime(pets)) + sig.power * factor / cycle / PET_RULES.heroDps;
}

export type SurgeState = 'ready' | 'grow' | 'big' | 'shrink' | 'cool';
/** What the view and, online, the explorer are told. `phase`: 'start' (it begins to grow), 'big' (the signature fired), 'end' (it begins to shrink). */
export interface SurgeEvent { slot: number; phase: 'start' | 'big' | 'end'; sig: SignatureId; x: number; z: number; /** Creatures the signature reached. */ hits?: number; /** A boss it staggered. */ boss?: string; /** A shot sent back (return fire). */ reflect?: boolean; tx?: number; tz?: number; /** Rebirth used. */ revived?: boolean }

/** One explorer's surge: whose turn, the phase and its clock, the passives in force, and the bosses left open. Slots: 0, 1 the pets, 2 the dog. */
export class PetSurge {
  /** False: no surge at all (the 'before' rows of promo/pet-sim.mts). */
  enabled = true;
  /** Simulation seconds (stepped with the fight). */
  clock = 0;
  state: SurgeState = 'ready';
  /** The pet surging (-1: none), its signature, and seconds left in this phase. */
  slot = -1; sig: SignatureId | null = null; left = 0;
  /** The slot whose turn is next (the other pet after a surge). */
  next = 0;
  /** Bulwark: the next hit is soaked. Return fire: shots left to send back. */
  soak = false; reflects = 0;
  /** Rebirth armed for this cycle, and when it was last used (kept across resets: once every 5 minutes is a promise). */
  reviveArmed = false; revivedAt = -Infinity;
  /** Surges started a slot since the start (probes, tests and the sims). */
  readonly count = [0, 0, 0];
  private open = new Map<string, number>();
  private presses = 0; private pressAt = -Infinity;
  reset() { this.state = 'ready'; this.slot = -1; this.sig = null; this.left = 0; this.soak = false; this.reflects = 0; this.reviveArmed = false; this.open.clear(); this.presses = 0; this.pressAt = -Infinity; }
  /**
   * A basic press that reached a creature. `chainStep`: which press of the chain it was (0 to 2) when the chain is on;
   * without it the presses are counted here. True when this press completes three.
   */
  press(chainStep?: number) {
    if (chainStep !== undefined) { this.presses = 0; return chainStep === CHAIN.hits.sword.length - 1; }
    this.presses = this.clock - this.pressAt <= SURGE.gap ? this.presses + 1 : 1; this.pressAt = this.clock;
    if (this.presses < 3) return false; this.presses = 0; return true;
  }
  get ready() { return this.enabled && this.state === 'ready'; }
  /** The slot to surge now: the one whose turn it is if `can` lets it, else the first other that can; -1 when none. */
  pick(can: (slot: number) => boolean) {
    if (!this.ready) return -1; for (let i = 0; i < 3; i++) { const slot = (this.next + i) % 3; if (can(slot)) return slot; } return -1;
  }
  start(slot: number, sig: SignatureId) {
    const s = SIGNATURES[sig]; this.state = 'grow'; this.left = SURGE.grow; this.slot = slot; this.sig = sig; this.next = (slot + 1) % 3; this.count[slot]++;
    this.soak = !!s.soak; this.reflects = s.reflect ? SURGE.reflects : 0;
    this.reviveArmed = sig === 'rebirth' && this.clock - this.revivedAt >= SURGE.reviveEvery;
  }
  /** Advances the clock; 'big' when the pet has just grown (the signature fires now), 'end' when it begins to shrink. */
  step(dt: number): 'big' | 'end' | null {
    this.clock += dt; if (this.open.size) for (const [id, until] of this.open) if (until <= this.clock) this.open.delete(id);
    if (this.state === 'ready') return null;
    this.left -= dt; if (this.left > 0) return null;
    switch (this.state) {
      case 'grow': this.state = 'big'; this.left += SURGE.hold; return 'big';
      case 'big': this.state = 'shrink'; this.left += SURGE.shrink; this.soak = false; this.reflects = 0; return 'end';
      case 'shrink': this.state = 'cool'; this.left += SURGE.cooldown; this.slot = -1; return null;
      default: this.state = 'ready'; this.left = 0; this.sig = null; this.reviveArmed = false; return null;
    }
  }
  /** True while pet `slot` is big (its shots and guard are stronger). */
  big(slot: number) { return this.state === 'big' && this.slot === slot; }
  damage(slot: number) { return this.big(slot) ? SURGE.damage : 1; }
  guard(slot: number) { return this.big(slot) ? SURGE.guard : 1; }
  /** A boss a signature staggered: it takes more from the explorer until then. */
  mark(id: string) { this.open.set(id, this.clock + SURGE.vulnTime); }
  vulnerable(id: string) { return (this.open.get(id) ?? -Infinity) > this.clock; }
  /** The explorer's own hit on `target`: x(1 + SURGE.vuln) while it is open. */
  bonus(target: { id: string; boss?: boolean }) { return target.boss && this.open.size && this.vulnerable(target.id) ? 1 + SURGE.vuln : 1; }
  /** A blow is about to knock the explorer out: true (and spent) when Rebirth is armed. */
  revive() { if (!this.reviveArmed) return false; this.reviveArmed = false; this.revivedAt = this.clock; return true; }
  /** For the ring on the HUD: 'ready', 'active' (k: the share of the surge left) or 'cool' (k: the share of the wait done). */
  ring(): { state: 'ready' | 'active' | 'cool'; k: number } {
    switch (this.state) {
      case 'ready': return { state: 'ready', k: 1 };
      case 'grow': return { state: 'active', k: 1 };
      case 'big': return { state: 'active', k: Math.max(0, Math.min(1, this.left / SURGE.hold)) };
      case 'shrink': return { state: 'active', k: 0 };
      default: return { state: 'cool', k: Math.max(0, Math.min(1, 1 - this.left / SURGE.cooldown)) };
    }
  }
}

/** What a signature needs from the simulation (combat.ts builds it once). Damage is helper damage: never the explorer's. */
type Foe = { id: string; x: number; z: number; hp: number; radius: number; boss?: boolean; phase?: string };
export interface SurgeOps<T extends Foe> {
  targets(): readonly T[];
  hit(target: T, power: number, stun: number, knock: number): void;
  status(target: T, kind: 'blind' | 'slow' | 'stun', time: number): void;
  heal(fraction: number): void;
  ward(time: number): void;
}
/**
 * Fires signature `sig` of the pet `pet` (standing at its x, z) for an explorer at `hero` facing `facing` (rad, the cone
 * aims at `aim` when given; the view draws it from the event). `mend`: the pet's mend power (a share of full health) for the heal. Returns the event (hits
 * counted, the boss staggered). Every boss within SURGE.bossReach of the explorer is staggered and left open.
 */
export function fireSignature<T extends Foe>(ops: SurgeOps<T>, surge: PetSurge, slot: number, sig: SignatureId, pet: Pick<PetFighter, 'x' | 'z'>, hero: { x: number; z: number }, aim: { x: number; z: number } | null, mend: number): SurgeEvent {
  const s = SIGNATURES[sig], at = s.around === 'hero' ? hero : pet, event: SurgeEvent = { slot, phase: 'big', sig, x: pet.x, z: pet.z, hits: 0 };
  let ax = 0, az = 1; if (s.around === 'cone') { const to = aim ?? hero, dx = to.x - pet.x, dz = to.z - pet.z, l = Math.hypot(dx, dz); if (l > 1e-6) { ax = dx / l; az = dz / l; } }
  if (s.radius > 0) {
    for (const t of ops.targets()) {
      if (!(t.hp > 0) || t.boss) continue; const dx = t.x - at.x, dz = t.z - at.z, d = Math.hypot(dx, dz);
      if (d > s.radius + t.radius) continue; if (s.around === 'cone' && d > 1e-6 && (dx * ax + dz * az) / d < BREATH_COS) continue;
      event.hits!++;
      if (s.power > 0 || s.knock) ops.hit(t, s.power, 0, sig === 'bulwark' && t.radius >= CHAIN.small ? 0 : s.knock ?? 0);
      if (s.stun) ops.status(t, 'stun', s.stun);
      if (s.hold) ops.status(t, sig === 'taunt' ? 'blind' : 'slow', s.hold);
    }
  }
  if (s.heal) { ops.heal(Math.max(0, mend) * s.heal); }
  if (s.ward) ops.ward(s.ward);
  // The boss: a stagger and a short weakness to the explorer's own blows; the signature's damage reaches it too.
  for (const t of ops.targets()) {
    if (!(t.hp > 0) || !t.boss || Math.hypot(t.x - hero.x, t.z - hero.z) > SURGE.bossReach + t.radius) continue;
    if (s.power > 0 && (s.around === 'hero' || Math.hypot(t.x - at.x, t.z - at.z) <= s.radius + t.radius)) ops.hit(t, s.power, 0, 0);
    if (sig === 'taunt') ops.status(t, 'slow', s.hold!);
    // The stagger stops a boss on its way, never one winding up or recovering: a stun cancels a wind-up (world.ts), and
    // cancelling one took away the opening after it (promo/pet-sim.mts: the bear fight got 5% slower).
    if (!t.phase || t.phase === 'chase' || t.phase === 'idle') ops.status(t, 'stun', SURGE.stagger);
    surge.mark(t.id); event.boss ??= t.id;
  }
  return event;
}
