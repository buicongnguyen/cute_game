/**
 * What a pet does in a fight: a small share of the damage, and one way of protecting its explorer.
 * No three.js and no content.ts here: the browser, the server (combat-authority.mjs) and the tests share it, and
 * content.ts reads every pet item's shot from PET_ROLES (so the numbers live in this one table).
 *
 * The player does the fighting. A pet's damage per second is `dmg / cd` times the explorer's attack; the explorer's own
 * sustained damage is about PET_RULES.heroDps times its attack (promo/pet-sim.mts measures it), so the table keeps one
 * pet near a tenth of the explorer, two near a sixth, and the very best pair at +10 near three tenths.
 *
 * Who a pet may shoot (petEngaged): only a creature that is fighting its explorer, within PET_RULES.leash metres of
 * the explorer: the explorer's chosen target, a creature that is after someone (its AI phase is not idle or going home),
 * one that hurt the explorer in the last `hurt` seconds, or one the explorer hit in the last `struck` seconds. Never a
 * peaceful or far creature, so a pet never starts a fight and stops when the explorer leaves it.
 *
 * Guards (one per pet, PetRole.guard), each ready again `every` seconds after it was used:
 *   counter   shoots an enemy shot out of the air: a shot of at most `power` x the explorer's attack is destroyed, a stronger one loses that much
 *   block     steps into a blow (melee): the blow loses `power` x the explorer's attack
 *   mend      when the explorer has just been hurt and is below half health: heals `power` of full health
 *   distract  the creature that just hurt the explorer cannot attack for `power` seconds (a boss: slowed, half as long)
 *   bark      the guard dog: the creature that just hurt the explorer is slowed for `power` seconds
 * A boss's hit never loses more than PET_RULES.bossCap of itself to pets, and is never deleted. Hazards (lava, weather)
 * are not guarded. Upgrades scale both the shot and the guard power by the pet's gear factor (+4% a level).
 */
export type GuardKind = 'counter' | 'block' | 'mend' | 'distract' | 'bark';
export interface PetRole { /** Shot damage x the explorer's attack. */ dmg: number; /** Seconds between shots. */ cd: number; guard: GuardKind; /** Damage taken off x the explorer's attack (counter, block), share of full health (mend), seconds (distract, bark). */ power: number; /** Seconds between guards. */ every: number }
export interface PetGuard { kind: GuardKind; power: number; every: number }
/** A pet as the simulation sees it: where it is, its shot and its guard. */
export interface PetFighter { x: number; z: number; dmg: number; cd: number; shot?: string; guard?: PetGuard; target?: string | null }

export const PET_RULES = {
  /** A pet only shoots creatures this close to its explorer (m, plus the creature's radius), and only while it is this close itself. */
  leash: 7,
  /** A guard needs the pet this close to what it guards: the explorer (block, mend, distract, bark) or the shot (counter). */
  reach: 6,
  /** A creature the explorer hit, or that hurt the explorer, stays fair game this long (s). */
  struck: 4, hurt: 5,
  /** The longest pet shot (m). */
  range: 9.5,
  /** A boss's hit loses at most this share to all the pets together. */
  bossCap: .3,
  /** Mend: the explorer must be below this share of full health, and hurt in the last `mendWindow` seconds. */
  mendBelow: .5, mendWindow: 1.5,
  /** An ice shot chills (slows) for this long instead of freezing: a freeze every shot stopped every attack. */
  chill: 1.2,
  /** The explorer's own sustained damage per second, x attack, without criticals (promo/pet-sim.mts). The share bounds are measured against it. */
  heroDps: 3.6,
  /** Design bounds (tests/pet-guard.test.ts): one pet's share of the explorer's damage, and the best pair at +10. */
  shareMax: .11, pairMax: .3,
} as const;

const r = (dmg: number, cd: number, guard: GuardKind, power: number, every: number): PetRole => ({ dmg, cd, guard, power, every });
/**
 * Every pet. Order within a family is weak to strong. Counter and block powers are x the explorer's attack, like the
 * shot: a creature of the explorer's own world hits for about 0.8 to 1.6 x that attack, an easier world's for less.
 */
export const PET_ROLES: Readonly<Record<string, PetRole>> = {
  // The first companion and the shop pets
  bunny: r(.25, 1.5, 'distract', 1.5, 10),
  pet_robot: r(.3, 1.2, 'counter', .32, 8),
  pet_parrot: r(.3, 1.3, 'distract', 1.6, 9),
  pet_turtle: r(.25, 1.8, 'block', .36, 6.5),
  pet_dragon: r(.35, 1.6, 'counter', .4, 8),
  pet_sheep: r(.3, 1.5, 'mend', .04, 12),
  pet_firefly: r(.35, 1.3, 'counter', .48, 8),
  // Boss pets: a first defeat's keepsake
  pet_b_bear: r(.4, 1.5, 'block', .44, 6.5), pet_b_treant: r(.4, 1.5, 'mend', .045, 12), pet_b_croc: r(.4, 1.5, 'block', .44, 6.5), pet_b_mushking: r(.4, 1.5, 'mend', .045, 12),
  pet_b_robot: r(.4, 1.5, 'counter', .48, 7.5),
  pet_b_cake: r(.4, 1.5, 'mend', .045, 12), pet_b_gingerbread: r(.4, 1.5, 'block', .48, 6.5), pet_b_jellyqueen: r(.4, 1.5, 'counter', .52, 7.5),
  pet_b_gorilla: r(.4, 1.5, 'block', .52, 6.5),
  pet_b_yeti: r(.4, 1.5, 'block', .52, 6.5), pet_b_mammoth: r(.4, 1.5, 'block', .56, 6.5), pet_b_frostowl: r(.4, 1.5, 'distract', 1.8, 9),
  pet_b_leviathan: r(.4, 1.5, 'counter', .6, 7.5),
  pet_b_golem: r(.4, 1.5, 'block', .6, 6.5), pet_b_dragon: r(.4, 1.5, 'counter', .64, 7.5),
  pet_b_phoenix: r(.4, 1.5, 'mend', .05, 12),
  pet_b_shadowlord: r(.4, 1.5, 'distract', 2, 9),
  // Titan pets
  pet_t_turtle: r(.44, 1.6, 'block', .64, 6.5),
  pet_t_clock: r(.22, .8, 'distract', 2, 8),
  pet_t_hydra: r(.26, .9, 'counter', .68, 7),
  pet_t_flower: r(.35, 1.2, 'mend', .055, 11),
  pet_t_crystal: r(.33, 1.1, 'counter', .72, 7),
  pet_t_kraken: r(.33, 1.1, 'block', .72, 6.5),
  pet_t_scorpion: r(.31, 1, 'counter', .76, 7),
  pet_t_whale: r(.37, 1.2, 'mend', .06, 11),
  pet_t_eye: r(.32, 1, 'counter', .8, 7),
  // Vault pets
  pet_dg_morel: r(.41, 1.3, 'block', .88, 6.5),
  pet_dg_owl: r(.355, 1.1, 'distract', 2.2, 8),
  pet_dg_anemone: r(.295, .9, 'mend', .065, 11),
  pet_dg_bellows: r(.265, .8, 'counter', .96, 6.5),
  pet_dg_empress: r(.305, .9, 'distract', 2.4, 8),
  // The Colossus keepsake: the best of them
  pet_colossus: r(.44, 1.2, 'block', 1.12, 6),
};
/** The guard dog's toss stays in guard-dog.ts (it grows with the explorer's level); its guard is the bark. */
export const DOG_GUARD: PetGuard = { kind: 'bark', power: 3, every: 8 };
/** The numbers before the 2026-10-14 rebalance (dmg, cd), kept for the before/after table of promo/pet-sim.mts. */
export const PET_BEFORE: Readonly<Record<string, readonly [number, number]>> = {
  bunny: [.25, 1.5], pet_robot: [.3, 1.2], pet_parrot: [.3, 1.3], pet_turtle: [.25, 1.8], pet_dragon: [.35, 1.6], pet_sheep: [.3, 1.5], pet_firefly: [.35, 1.3],
  pet_b_bear: [.4, 1.5], pet_b_treant: [.4, 1.5], pet_b_croc: [.4, 1.5], pet_b_mushking: [.4, 1.5], pet_b_robot: [.4, 1.5], pet_b_cake: [.4, 1.5], pet_b_gingerbread: [.4, 1.5], pet_b_jellyqueen: [.4, 1.5],
  pet_b_gorilla: [.4, 1.5], pet_b_yeti: [.4, 1.5], pet_b_mammoth: [.4, 1.5], pet_b_frostowl: [.4, 1.5], pet_b_leviathan: [.4, 1.5], pet_b_golem: [.4, 1.5], pet_b_dragon: [.4, 1.5], pet_b_phoenix: [.4, 1.5], pet_b_shadowlord: [.4, 1.5],
  pet_t_turtle: [.5, 1.6], pet_t_clock: [.6, .8], pet_t_hydra: [.8, .9], pet_t_flower: [.6, 1.2], pet_t_crystal: [.7, 1.1], pet_t_kraken: [.7, 1.1], pet_t_scorpion: [.9, 1], pet_t_whale: [.7, 1.2], pet_t_eye: [1, 1],
  pet_dg_morel: [.6, 1.3], pet_dg_owl: [.7, 1.1], pet_dg_anemone: [.9, .9], pet_dg_bellows: [1, .8], pet_dg_empress: [1.1, .9], pet_colossus: [2.5, .9],
};

/** A dyed pet ('dye_gilded_pet_robot') fights as the pet it is. */
export function petRoleId(id: string | undefined): string | undefined {
  if (!id) return undefined; if (Object.hasOwn(PET_ROLES, id)) return id;
  const at = id.startsWith('dye_') ? id.indexOf('_', 4) : -1, base = at > 0 ? id.slice(at + 1) : ''; return base && Object.hasOwn(PET_ROLES, base) ? base : undefined;
}
export const petRole = (id: string | undefined): PetRole | undefined => { const key = petRoleId(id); return key ? PET_ROLES[key] : undefined; };
/** A pet's damage per second as a share of the explorer's own (`factor`: the pet's gear factor, 1 at +0, 1.4 at +10). */
export const petShare = (role: Pick<PetRole, 'dmg' | 'cd'>, factor = 1) => role.dmg / role.cd * factor / PET_RULES.heroDps;
/** A guard as worn: its power grows with the pet's level; the dog's bark does not (it has no level). */
export function guardOf(id: string | undefined, factor = 1): PetGuard | undefined {
  const role = petRole(id); return role ? { kind: role.guard, power: role.power * (Number.isFinite(factor) && factor > 0 ? factor : 1), every: role.every } : undefined;
}
/** The shot and guard a worn pet brings to the simulation (the hosts add where it stands). */
export function petFighter(id: string | undefined, factor = 1, shot?: string): Omit<PetFighter, 'x' | 'z'> | null {
  const role = petRole(id); if (!role) return null; const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return { dmg: role.dmg * f, cd: role.cd, ...(shot ? { shot } : {}), guard: guardOf(id, f) };
}

/** What the rules need to know of a creature. `phase` is its AI phase (world.ts, the server's copy of it). */
export interface PetTarget { id: string; x: number; z: number; hp: number; radius?: number; boss?: boolean; phase?: string }
/** A creature that is after someone: any AI phase but resting and walking home (hud-combat.ts aggro, the same rule). */
export const hostilePhase = (phase: string | undefined) => !!phase && phase !== 'idle' && phase !== 'return';

/** One explorer's pets in a fight: who they may shoot, and when each guard is ready again. Slots: 0 and 1 the two pets, 2 the dog. */
export class PetCrew {
  /** Seconds until each slot's guard is ready. */
  readonly wait = [0, 0, 0];
  /** When the explorer last hit each creature, and when each last hurt the explorer (simulation seconds). */
  private struck = new Map<string, number>();
  private hurt = new Map<string, number>();
  /** When the explorer was last hurt by a creature (mend looks at it); -Infinity before the first blow. */
  hurtAt = -Infinity;
  /** True while anything is counting down or remembered: step() is free otherwise. */
  private live = false;
  reset() { this.wait.fill(0); this.struck.clear(); this.hurt.clear(); this.hurtAt = -Infinity; this.live = false; }
  noteStruck(id: string, time: number) { this.struck.set(id, time); this.live = true; }
  noteHurt(id: string | undefined, time: number) { if (id) this.hurt.set(id, time); this.hurtAt = time; this.live = true; }
  use(slot: number, every: number) { this.wait[slot] = Math.max(.1, every); this.live = true; }
  ready(slot: number) { return !(this.wait[slot] > 0); }
  /** Counts the guards down and forgets old blows. Nothing to do (and nothing done) while no fight is remembered. */
  step(dt: number, time: number) {
    if (!this.live) return; let busy = false;
    for (let i = 0; i < 3; i++) if (this.wait[i] > 0) { this.wait[i] = Math.max(0, this.wait[i] - dt); busy ||= this.wait[i] > 0; }
    for (const [id, at] of this.struck) if (time - at > PET_RULES.struck) this.struck.delete(id);
    for (const [id, at] of this.hurt) if (time - at > PET_RULES.hurt) this.hurt.delete(id);
    this.live = busy || this.struck.size > 0 || this.hurt.size > 0;
  }
  /** True when `t` is fighting the explorer (see the header). `focus`: the explorer's chosen target. */
  engaged(t: PetTarget, focus: string | null | undefined, time: number) {
    if (focus && t.id === focus || hostilePhase(t.phase)) return true;
    const s = this.struck.get(t.id); if (s !== undefined && time - s <= PET_RULES.struck) return true;
    const h = this.hurt.get(t.id); return h !== undefined && time - h <= PET_RULES.hurt;
  }
  /**
   * The creature a pet at `pet` shoots: the explorer's chosen target when it is engaged and in the leash, else the
   * engaged creature nearest the explorer. Undefined when the pet itself is out of the leash or nothing is fighting.
   */
  target<T extends PetTarget>(pet: { x: number; z: number }, hero: { x: number; z: number }, targets: readonly T[], focus: string | null | undefined, time: number): T | undefined {
    if (Math.hypot(pet.x - hero.x, pet.z - hero.z) > PET_RULES.leash) return undefined;
    let best: T | undefined, bestD = Infinity;
    for (const t of targets) {
      if (!(t.hp > 0)) continue;
      const d = Math.hypot(t.x - hero.x, t.z - hero.z) - (t.radius ?? 0);
      if (d > PET_RULES.leash || !this.engaged(t, focus, time)) continue;
      if (focus && t.id === focus) return t;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }
}

/** What one guard takes off a hit of `left` damage (`amount` at first): `power`, never more than the hit, and for a boss never past the cap. */
export function guardCut(left: number, power: number, boss: boolean, amount: number, taken = 0) {
  if (!(left > 0) || !(power > 0)) return 0;
  const room = boss ? Math.max(0, amount * PET_RULES.bossCap - taken) : left;
  return Math.max(0, Math.min(left, power, room));
}
/** True while a shot at (x, z) flying (vx, vz) is still on its way to pass within `near` metres of the explorer. */
export function shotThreatens(shot: { x: number; z: number; vx: number; vz: number }, hero: { x: number; z: number }, near = 1) {
  const v = Math.hypot(shot.vx, shot.vz); if (v < 1e-6) return false;
  const dx = hero.x - shot.x, dz = hero.z - shot.z; if ((dx * shot.vx + dz * shot.vz) / v <= 0) return false;
  return Math.abs(dx * shot.vz - dz * shot.vx) / v <= near;
}
/** A guard that fired, for the view (pet-guard-view.ts) and, online, for the explorer it protected. */
export interface GuardEvent {
  /** 0 and 1 the two pets, 2 the dog. */ slot: number; kind: GuardKind;
  /** Damage taken off (counter, block), health restored as a share of full (mend), seconds (distract, bark). */ power: number;
  /** Damage left of the hit (0: destroyed). */ left: number;
  /** Where the pet stood, and the creature or shot it answered. */ x: number; z: number; tx?: number; tz?: number; target?: string;
  /** A shot met in the air (solo): the view flies a bolt to (tx, tz). */ flight?: boolean;
}
