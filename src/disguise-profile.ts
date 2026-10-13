/**
 * How strong each disguise is, and at what: six axes worked out from the numbers combat.ts really uses (DZ, GAZE,
 * BOULDER, SUMMON_HP, the kit lists, each disguise's own weapon and cooldowns in content.ts). Nothing here is a
 * hand-typed score: every skill is described once (skillFacts) as what one cast does to ONE creature and to the
 * explorer, in the table's own units, and the axes are sums of those facts over the kit.
 *
 * The axes (raw value per 10 seconds of fighting, every skill cast as soon as it is ready):
 *  - damage   : hits on one creature as a multiple of your attack: the basic attack (weapon cooldown) plus every
 *               skill's damage / its cooldown, plus what damage bonuses (giant form, torch, marks, the vanish strike)
 *               add to the basic attack while they last.
 *  - burst    : the most one cast puts on one creature within BURST_WINDOW seconds (a summon counts only its first shots).
 *  - area     : square metres of ground the skills hit or affect (circles, cones, lines), per 10 s.
 *  - control  : seconds a creature cannot fight back, per 10 s: stun, freeze, roots, sheep, charm and fear in full;
 *               slow, blind, taunt and pulls at SOFT (half).
 *  - survival : "health points saved" per 10 s, in percent of your health: heals in full; a second in which nothing
 *               can hurt you is worth HURT percent (a shield, bat form, a dash); a second of partial cover is worth
 *               that times its share (defence d blocks d / (d + 60), as main.ts computes a blow; flight and the
 *               front-only block PARTIAL; hiding HIDDEN); a decoy absorbs DECOY_SHARE of its own health, another
 *               summon OTHER_SHARE; stolen life counts at the game's own cap.
 *  - mobility : metres of dashes and blinks plus the extra metres a speed boost gives (6 m/s base speed), per 10 s.
 *
 * A score is the raw value as a percent of the best disguise on that axis (the best = 100), so the picture compares
 * the seventeen with each other. `profile(id, weapon)` gives the same kit with another weapon in hand ("yours": the
 * weapon in hand fights in a disguise): only the basic attack changes. Disguise skills are never levelled
 * (skill-upgrades.ts levelledCooldown), so there is nothing else of the player's to apply.
 *
 * Modelling choices, all in one place: a creature is REF_RADIUS wide and stands half-way along a shot's range; damage
 * that needs you to keep touching the creature (tank ram, giant steps) counts at CONTACT.
 */
import { DISGUISES, type WeaponDef } from './content.ts';
import { DISGUISE_KITS, DZ, GAZE, BOULDER, SUMMON_HP, LIFESTEAL_CAP_PER_SECOND } from './combat.ts';
import { SPECIAL_INFO } from './skill-info.ts';

export const AXES = ['damage', 'burst', 'area', 'control', 'survival', 'mobility'] as const;
export type Axis = typeof AXES[number];
export const AXIS_LABEL: Record<Axis, string> = { damage: 'Damage', burst: 'Burst', area: 'Area', control: 'Control', survival: 'Survival', mobility: 'Mobility' };
export const AXIS_NOTE: Record<Axis, string> = {
  damage: 'Steady damage on one creature: basic attacks plus every skill on cooldown.',
  burst: 'The biggest hit one skill lands within two seconds.',
  area: 'How much ground the skills cover.',
  control: 'Seconds creatures are stunned, frozen, charmed, slowed or blinded.',
  survival: 'Heals, shields, cover, decoys and stolen life.',
  mobility: 'Dashes, blinks, flight and speed boosts.',
};
export const BURST_WINDOW = 2, SOFT = .5, HURT = 10, PARTIAL = .5, HIDDEN = .75, DECOY_SHARE = .5, OTHER_SHARE = .25, CONTACT = .5;
export const REF_RADIUS = .8, BASE_SPEED = 6, WINDOW = 10;
/** A level-1 explorer's attack as a share of its health (model.ts: 10 attack, 100 health): turns stolen damage into health. */
export const ATTACK_PER_HP = 10 / 100;
/**
 * The five uniform specials are cast by combat.ts special() with literals; SPECIAL_INFO carries their damage and
 * radius, and its sentences carry the rest. These are those literals (tests/disguise-profile.test.ts checks each
 * against the sentence, so a balance change cannot slip past).
 */
export const SPECIAL_SHAPE = {
  lotus: { shots: 12, range: 8, heal: .08 }, dragon: { shots: 7, step: .15, range: 12 },
  eagle: { dash: 2.4, length: 9 }, goldstar: { shots: 5, range: 11 },
} as const;

/** What one cast does. Every field is optional; an absent one is 0. */
export interface SkillFacts {
  /** Total damage on one creature, × attack. */
  damage?: number;
  /** The part of it that lands within BURST_WINDOW (defaults to all of it). */
  burst?: number;
  /** Damage bonus on your basic attack: +share for `time` seconds, or `hits` extra basic hits at once. */
  boost?: { share: number; time: number } | { hits: number };
  /** Ground covered, m². */
  area?: number;
  /** Seconds of full / soft control on a creature. */
  hard?: number; soft?: number;
  /** Health back as a share of yours (0.2 = 20%). */
  heal?: number;
  /** Share of dealt damage returned as health for `time` seconds (0 time = this cast's own damage). */
  steal?: { share: number; time: number };
  /** Seconds nothing can hurt you / seconds of partial cover (already weighted by the share blocked). */
  safe?: number; cover?: number;
  /** Health of summons that take blows for you, as a share of yours (already weighted). */
  absorb?: number;
  /** Metres moved at once / a speed bonus for `time` seconds. */
  move?: number; speed?: { bonus: number; time: number };
  /** How far away it can reach, m. */
  reach?: number;
  /** It leaves a summon that fights or guards. */
  summon?: string;
}
const circle = (r: number) => Math.PI * r * r;
const defenceCover = (d: number) => d / (d + 60);
/** Hits a creature takes from a summon that strikes every `cd` s for `life` s. */
const strikes = (life: number, cd: number) => Math.floor(life / cd);
/** How many shots of a fan (angles in rad from the aim) pass through a creature half-way along the range. */
function fanHits(angles: readonly number[], range: number, shotRadius = .22) { const half = Math.atan2(REF_RADIUS + shotRadius, range / 2); return angles.filter(a => Math.abs(a) <= half).length; }
const ring = (count: number) => Array.from({ length: count }, (_, i) => { const a = i * 2 * Math.PI / count; return a > Math.PI ? a - 2 * Math.PI : a; });
const summonCover = (kind: string, count = 1) => count * SUMMON_HP[kind].hp * (SUMMON_HP[kind].taunt ? DECOY_SHARE : OTHER_SHARE);

/** One kit effect as facts, straight from combat.ts's table. `basic` is the wearer's basic hit (for nothing but notes). */
export function skillFacts(effect: string): SkillFacts {
  const K = DZ, S = SPECIAL_INFO, X = SPECIAL_SHAPE;
  switch (effect) {
    // Superhero
    case 'flight': return { cover: K.flight.time * PARTIAL, speed: { bonus: K.flight.speed, time: K.flight.time } };
    case 'dive': return { damage: K.dive.power, area: circle(K.dive.radius), move: K.dive.ahead, safe: K.dive.guard, reach: K.dive.ahead + K.dive.radius };
    case 'sweep': { // the beam turns GAZE.arc in GAZE.time; a creature half-way along it stays lit for `dwell` and is hit again every GAZE.rehit
      const dwell = 2 * Math.atan2(GAZE.width / 2 + REF_RADIUS, GAZE.length / 2) / (GAZE.arc / GAZE.time);
      return { damage: 1 + Math.floor(dwell / GAZE.rehit), area: .5 * GAZE.arc * GAZE.length ** 2, reach: GAZE.length }; }
    case 'boulder': return { damage: BOULDER.power, area: circle(BOULDER.radius), reach: BOULDER.range + BOULDER.radius };
    // Shadow ninja
    case 'clones': { const total = K.clones.count * strikes(K.clones.life, K.clones.cd) * K.clones.power;
      return { damage: total, burst: K.clones.count * strikes(BURST_WINDOW, K.clones.cd) * K.clones.power, absorb: summonCover('clone', K.clones.count), summon: 'clone', reach: K.clones.ring + K.clones.reach }; }
    case 'stealth': return { boost: { hits: K.stealth.bonus - 1 }, cover: K.stealth.time * HIDDEN, speed: { bonus: K.stealth.speed, time: K.stealth.time } };
    case 'backstab': return { damage: K.backstab.power, move: K.backstab.range / 2, reach: K.backstab.range };
    case 'smoke': return { soft: K.smoke.time, area: circle(K.smoke.radius), cover: K.smoke.time * HIDDEN, reach: K.smoke.radius };
    // Archmage
    case 'fireball': return { damage: K.fireball.power, area: circle(K.fireball.radius), reach: K.fireball.range + K.fireball.radius };
    case 'teleport': return { move: K.teleport.distance, safe: K.teleport.guard };
    case 'sheep': return { hard: K.sheep.time, area: circle(K.sheep.around), reach: K.sheep.range };
    case 'blackhole': return { damage: K.blackhole.power, soft: K.blackhole.time, area: circle(K.blackhole.pull), reach: K.blackhole.range + K.blackhole.pull };
    // Sun knight
    case 'block': return { cover: K.block.time * PARTIAL };
    case 'knightcharge': { const length = K.knightcharge.speed * K.knightcharge.time; return { damage: K.knightcharge.power, move: length, safe: K.knightcharge.time, area: length * 2 * K.knightcharge.grab, reach: length }; }
    case 'taunt': return { soft: K.taunt.time, cover: K.taunt.time * defenceCover(K.taunt.defence), area: circle(K.taunt.radius), reach: K.taunt.radius };
    case 'holy': return { damage: K.holy.power, area: circle(K.holy.radius), reach: K.holy.range + K.holy.radius };
    // Battle robot
    case 'tank': { const rams = 1 + strikes(K.tank.time, K.tank.rehit);
      return { damage: rams * K.tank.power * CONTACT, burst: (1 + strikes(BURST_WINDOW, K.tank.rehit)) * K.tank.power * CONTACT, cover: K.tank.time * defenceCover(K.tank.defence), speed: { bonus: K.tank.speed, time: K.tank.time }, area: circle(K.tank.reach), reach: K.tank.reach }; }
    case 'turret': return { damage: strikes(K.turret.life, K.turret.cd) * K.turret.power, burst: strikes(BURST_WINDOW, K.turret.cd) * K.turret.power, absorb: summonCover('turret'), summon: 'turret', reach: K.turret.range };
    case 'missiles': return { damage: K.missiles.count * K.missiles.power, area: K.missiles.count * circle(K.missiles.radius), reach: K.missiles.range };
    case 'energyshield': return { safe: K.energyshield.time, heal: K.energyshield.heal };
    // Tyrannosaur
    case 'devour': return { damage: K.devour.power, heal: K.devour.heal * K.devour.below /* only a creature under that share of its health is swallowed */, reach: K.devour.reach };
    case 'tail': return { damage: K.tail.power, area: circle(K.tail.radius), reach: K.tail.radius };
    case 'roar': return { hard: K.roar.time, area: circle(K.roar.radius), reach: K.roar.radius };
    case 'giant': { const steps = strikes(K.giant.time, K.giant.step) * K.giant.power * CONTACT;
      return { damage: steps, burst: strikes(BURST_WINDOW, K.giant.step) * K.giant.power * CONTACT, boost: { share: .6 /* combat.ts damage(): giant ×1.6 */, time: K.giant.time }, cover: K.giant.time * defenceCover(K.giant.defence), area: circle(K.giant.radius), reach: K.giant.radius }; }
    // Flower fairy
    case 'heal': return { heal: K.heal.perTick * K.heal.time / K.heal.tick, area: circle(K.heal.radius) };
    case 'hover': return { cover: K.hover.time * PARTIAL, speed: { bonus: K.hover.speed, time: K.hover.time } };
    case 'charm': return { hard: K.charm.time, reach: K.charm.range };
    case 'tree': return { damage: strikes(K.tree.life, K.tree.cd) * K.tree.power, burst: strikes(BURST_WINDOW, K.tree.cd) * K.tree.power, hard: K.tree.root, area: circle(K.tree.radius), absorb: summonCover('tree'), summon: 'tree', reach: K.tree.ahead + K.tree.radius };
    // Pirate captain
    case 'cannon': return { damage: strikes(K.cannon.life, K.cannon.cd) * K.cannon.power, burst: (1 + strikes(BURST_WINDOW, K.cannon.cd)) * K.cannon.power, area: circle(2 /* combat.ts: a cannon shell's explosion */), absorb: summonCover('cannon'), summon: 'cannon', reach: K.cannon.range };
    case 'hook': return { damage: K.hook.power, soft: K.hook.slow, reach: K.hook.range };
    case 'parrot': return { damage: strikes(K.parrot.life, K.parrot.cd) * K.parrot.power, burst: strikes(BURST_WINDOW, K.parrot.cd) * K.parrot.power, boost: { share: .5 /* combat.ts damage(): marked ×1.5 */, time: K.parrot.life + K.parrot.mark }, summon: 'parrot', reach: 13 /* combat.ts: a summon looks 13 m */ };
    case 'broadside': { const share = Math.min(1, (K.broadside.radius + REF_RADIUS) / K.broadside.spread); // balls land up to `spread` m off the target
      return { damage: K.broadside.count * share * K.broadside.power, area: circle(K.broadside.spread + K.broadside.radius), reach: K.broadside.range + K.broadside.spread }; }
    // Vampire count
    case 'drain': return { damage: K.drain.ticks * K.drain.power, burst: Math.min(K.drain.ticks, 1 + strikes(BURST_WINDOW, K.drain.tick)) * K.drain.power, steal: { share: K.drain.heal, time: 0 }, reach: K.drain.range };
    case 'bats': return { safe: K.bats.time, speed: { bonus: K.bats.speed, time: K.bats.time } };
    case 'batcircle': { const bites = K.batcircle.count * strikes(K.batcircle.life, .7 /* combat.ts: a bat bites every 0.7 s */);
      return { damage: bites * K.batcircle.power, burst: K.batcircle.count * strikes(BURST_WINDOW, .7) * K.batcircle.power, heal: bites * K.batcircle.heal, summon: 'bat', reach: 2.2 }; }
    case 'bloodnova': return { damage: K.bloodnova.time / K.bloodnova.tick * K.bloodnova.power, burst: BURST_WINDOW / K.bloodnova.tick * K.bloodnova.power, steal: { share: K.bloodnova.lifesteal, time: K.bloodnova.time }, area: circle(K.bloodnova.radius), reach: K.bloodnova.radius };
    // Snowman
    case 'snowball': { const length = K.snowball.speed * K.snowball.time, biggest = Math.min(2.6, .5 + K.snowball.grow * K.snowball.time), mid = (.5 + biggest) / 2; // hits for ×(1 + its radius), growing from 0.5 m
      return { damage: 1 + mid, soft: K.snowball.slow, area: length * 2 * mid, reach: length }; }
    case 'decoy': return { damage: K.decoy.power, burst: 0 /* it bursts when it melts, seconds later */, hard: K.decoy.freeze, area: circle(K.decoy.radius), absorb: summonCover('snowman'), summon: 'snowman', reach: K.decoy.ahead + K.decoy.radius };
    case 'icefloor': return { soft: K.icefloor.time, area: circle(K.icefloor.radius), speed: { bonus: K.icefloor.speed, time: K.icefloor.time }, reach: K.icefloor.radius };
    case 'iceage': return { damage: K.iceage.power, burst: 0 /* the shatter comes after the freeze, 3 s later */, hard: K.iceage.freeze, area: circle(K.iceage.radius), reach: K.iceage.radius };
    // Army soldier
    case 'popgun': { const n = K.popgun.count; return { damage: fanHits(Array.from({ length: n }, (_, i) => (i / (n - 1) - .5) * K.popgun.spread), K.popgun.range) * K.popgun.power, area: .5 * K.popgun.spread * K.popgun.range ** 2, reach: K.popgun.range }; }
    case 'sandbag': return { damage: K.sandbag.power, cover: K.sandbag.time * defenceCover(K.sandbag.defence), absorb: summonCover('sandbag'), area: circle(K.sandbag.radius), summon: 'sandbag', reach: K.sandbag.radius };
    case 'flare': return { soft: K.flare.blind, boost: { share: .5, time: K.flare.mark }, area: circle(K.flare.radius), reach: K.flare.range + K.flare.radius };
    case 'airdrop': { const hits = K.airdrop.ring <= K.airdrop.radius + REF_RADIUS ? K.airdrop.count : 1; // one crate lands on the target, the rest in a ring round it
      return { damage: hits * K.airdrop.power, heal: K.airdrop.heal, area: circle(K.airdrop.ring + K.airdrop.radius), reach: K.airdrop.range + K.airdrop.ring }; }
    // Navy sailor
    case 'anchor': return { damage: S.anchor.damage, area: circle(S.anchor.radius!), reach: S.anchor.radius };
    case 'surfride': { const length = K.surfride.speed * K.surfride.time; return { damage: K.surfride.power, move: length, safe: K.surfride.time, area: length * 2 * REF_RADIUS, reach: length }; }
    case 'whistle': return { hard: K.whistle.stun, area: circle(K.whistle.radius), reach: K.whistle.radius };
    case 'lighthouse': { const passes = Math.floor(K.lighthouse.life * K.lighthouse.turn / (2 * Math.PI)); // one hit each time the beam comes round
      return { damage: passes * K.lighthouse.power, burst: K.lighthouse.power, soft: passes * K.lighthouse.blind, area: circle(K.lighthouse.reach), summon: 'lighthouse', reach: K.lighthouse.reach }; }
    // Ao dai lady
    case 'lotus': return { damage: fanHits(ring(X.lotus.shots), X.lotus.range) * S.lotus.damage, heal: X.lotus.heal, area: circle(X.lotus.range), reach: X.lotus.range };
    case 'ribbon': return { move: K.ribbon.speed * K.ribbon.time, safe: K.ribbon.time, speed: { bonus: K.ribbon.boost, time: K.ribbon.boostTime } };
    case 'fan': return { damage: K.fan.power, soft: K.fan.slow, area: Math.acos(K.fan.cone) * K.fan.radius ** 2, reach: K.fan.radius };
    case 'lanterns': { const near = ring(K.lanterns.count).filter(a => 2 * K.lanterns.ring * Math.abs(Math.sin(a / 2)) <= K.lanterns.radius + REF_RADIUS).length; // a creature standing on the lantern ring
      return { damage: near * K.lanterns.power, burst: Math.min(near, 1 + strikes(BURST_WINDOW - K.lanterns.rise, K.lanterns.spacing)) * K.lanterns.power, heal: K.lanterns.count * K.lanterns.heal, area: circle(K.lanterns.ring + K.lanterns.radius), reach: K.lanterns.ring + K.lanterns.radius }; }
    // Ao dai gentleman
    case 'dragon': { const n = X.dragon.shots, angles = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * X.dragon.step);
      return { damage: fanHits(angles, X.dragon.range) * S.dragon.damage, area: .5 * (n - 1) * X.dragon.step * X.dragon.range ** 2, reach: X.dragon.range }; }
    case 'kite': return { cover: K.kite.time * PARTIAL, speed: { bonus: K.kite.speed, time: K.kite.time } };
    case 'ink': return { damage: K.ink.power, hard: K.ink.stun, area: circle(K.ink.radius), reach: K.ink.radius };
    case 'dragondance': return { damage: K.dragondance.time / K.dragondance.tick * K.dragondance.power, burst: BURST_WINDOW / K.dragondance.tick * K.dragondance.power, area: circle(K.dragondance.radius), reach: K.dragondance.radius };
    // Stars and stripes
    case 'eagle': return { damage: X.eagle.dash + S.eagle.damage, move: X.eagle.length, safe: .3 /* combat.ts: the dive lasts 0.3 s */, area: circle(S.eagle.radius!) + X.eagle.length * 2 * REF_RADIUS, reach: X.eagle.length + S.eagle.radius! };
    case 'starshield': return { damage: K.starshield.power, safe: K.starshield.time, area: circle(K.starshield.radius), reach: K.starshield.radius };
    case 'torch': return { boost: { share: K.torch.bonus, time: K.torch.time }, heal: K.torch.heal, soft: K.torch.blind, area: circle(K.torch.radius), reach: K.torch.radius };
    case 'fireworks': return { damage: K.fireworks.count * K.fireworks.power, burst: Math.min(K.fireworks.count, 1 + strikes(BURST_WINDOW - K.fireworks.rise, K.fireworks.spacing)) * K.fireworks.power, area: K.fireworks.count * circle(K.fireworks.radius), reach: K.fireworks.range };
    // Vietnam flag
    case 'goldstar': return { damage: fanHits(ring(X.goldstar.shots), X.goldstar.range) * S.goldstar.damage, area: circle(S.goldstar.radius!) + X.goldstar.shots * X.goldstar.range * .44, reach: X.goldstar.range };
    case 'bamboo': { const length = K.bamboo.speed * K.bamboo.time; return { damage: K.bamboo.power, move: length, safe: K.bamboo.time, area: circle(K.bamboo.radius), reach: length + K.bamboo.radius }; }
    case 'drum': return { damage: K.drum.beats * K.drum.power, hard: K.drum.stun, area: circle(K.drum.radius), reach: K.drum.radius };
    case 'bigstar': return { damage: K.bigstar.power, soft: K.bigstar.slow, area: circle(K.bigstar.radius), reach: K.bigstar.range + K.bigstar.radius };
    // Dawn star dancer
    case 'lasso': return { damage: K.lasso.power, hard: K.lasso.bind, area: Math.acos(K.lasso.cone) * K.lasso.radius ** 2, reach: K.lasso.radius };
    case 'dawnglow': return { safe: K.dawnglow.time, heal: K.dawnglow.heal }; // the pets' cheer is their damage, not the wearer's: on no axis
    case 'sparklestep': { const length = K.sparklestep.speed * K.sparklestep.time; // the trail only works on a creature that stays on it
      return { damage: strikes(K.sparklestep.trail, K.sparklestep.tick) * K.sparklestep.power * CONTACT, burst: strikes(BURST_WINDOW, K.sparklestep.tick) * K.sparklestep.power * CONTACT, soft: K.sparklestep.trail * CONTACT, move: length, safe: K.sparklestep.time, area: length * 2 * K.sparklestep.width, reach: length }; }
    case 'starshower': { const near = ring(K.starshower.count).filter(a => 2 * K.starshower.ring * Math.abs(Math.sin(a / 2)) <= K.starshower.radius + REF_RADIUS).length; // a creature standing on the ring of stars
      return { damage: near * K.starshower.power + K.starshower.finalPower, hard: K.starshower.stun, area: circle(Math.max(K.starshower.finalRadius, K.starshower.ring + K.starshower.radius)), reach: Math.max(K.starshower.finalRadius, K.starshower.ring + K.starshower.radius) }; }
    default: return {};
  }
}

/** One basic hit and the hits per second of a weapon, × attack (combat.ts basic(): a sword ×1.1, a spread gun ×0.45 a pellet, fists ×1.5 every third punch). */
export function basicAttack(weapon: Pick<WeaponDef, 'kind' | 'cd' | 'range' | 'spread'>) {
  const hit = weapon.kind === 'sword' ? 1.1 : weapon.kind === 'gun' ? ((weapon.spread ?? 1) > 1 ? weapon.spread! * .45 : 1) : (1.5 + 1 + 1) / 3;
  return { hit, perSecond: hit / Math.max(.1, weapon.cd || .5), reach: weapon.kind === 'gun' ? weapon.range + 1 : weapon.kind === 'sword' ? weapon.range : 1.6 };
}

export interface SkillLine { index: number; effect: string; name: string; icon: string; cd: number; facts: SkillFacts; /** This skill's share of each axis's raw value. */ adds: Record<Axis, number> }
export interface DisguiseRaw { id: string; weapon: Pick<WeaponDef, 'kind' | 'cd' | 'range' | 'spread'>; basic: ReturnType<typeof basicAttack>; passive: number; raw: Record<Axis, number>; basicShare: Record<Axis, number>; skills: SkillLine[]; reach: number }
const zero = (): Record<Axis, number> => ({ damage: 0, burst: 0, area: 0, control: 0, survival: 0, mobility: 0 });
/** Seconds out of every WINDOW a timed effect is up when cast on cooldown. */
const upSeconds = (time: number, cd: number) => WINDOW * Math.min(1, time / cd);
const casts = (cd: number) => WINDOW / cd;

/** The raw (unscaled) numbers of one disguise, with what each skill adds. `weapon`: the weapon in hand instead of the disguise's own. */
export function rawProfile(id: string, weapon?: Pick<WeaponDef, 'kind' | 'cd' | 'range' | 'spread'>): DisguiseRaw {
  const def = DISGUISES[id], kit = DISGUISE_KITS[id]; if (!def || !kit) throw new Error(`Unknown disguise ${id}`);
  const held = weapon && weapon.kind !== 'rod' ? weapon : def.weapon, basic = basicAttack(held), raw = zero(), basicShare = zero();
  basicShare.damage = basic.perSecond * WINDOW; raw.damage = basicShare.damage; basicShare.burst = 0;
  // Sustained damage per second with everything on cooldown, needed for stolen life; filled in two passes.
  const skills: SkillLine[] = kit.map((effect, index) => {
    const s = def.skills[index], f = skillFacts(effect), adds = zero(), n = casts(s.cd);
    const boost = f.boost ? 'hits' in f.boost ? f.boost.hits * basic.hit * n : f.boost.share * basic.perSecond * upSeconds(f.boost.time, s.cd) : 0;
    adds.damage = (f.damage ?? 0) * n + boost;
    adds.burst = (f.burst ?? f.damage ?? 0) + (f.boost && 'hits' in f.boost ? f.boost.hits * basic.hit : 0);
    adds.area = (f.area ?? 0) * n;
    adds.control = ((f.hard ?? 0) + (f.soft ?? 0) * SOFT) * n;
    adds.mobility = (f.move ?? 0) * n + (f.speed ? BASE_SPEED * f.speed.bonus * upSeconds(f.speed.time, s.cd) : 0);
    adds.survival = (f.heal ?? 0) * 100 * n + ((f.safe ?? 0) + (f.cover ?? 0)) * HURT * Math.min(n, WINDOW / Math.max(.01, (f.safe ?? 0) + (f.cover ?? 0))) + (f.absorb ?? 0) * 100 * n;
    return { index, effect, name: s.name, icon: s.icon, cd: s.cd, facts: f, adds };
  });
  for (const line of skills) for (const axis of AXES) if (axis !== 'burst') raw[axis] += line.adds[axis];
  raw.burst = Math.max(...skills.map(line => line.adds.burst));
  // Stolen life: the weapon's own life steal on everything you deal, and each skill's (drain: its own damage; blood moon: all of it while it shines), capped like the game caps it.
  const perSecond = raw.damage / WINDOW, cap = LIFESTEAL_CAP_PER_SECOND * 100;
  const passive = Math.min(cap, (def.lifesteal ?? 0) * perSecond * ATTACK_PER_HP * 100) * WINDOW; raw.survival += passive; basicShare.survival = passive;
  for (const line of skills) { const steal = line.facts.steal; if (!steal) continue;
    const got = steal.time > 0 ? Math.min(cap, steal.share * perSecond * ATTACK_PER_HP * 100) * upSeconds(steal.time, line.cd) : Math.min(cap * WINDOW, steal.share * (line.facts.damage ?? 0) * ATTACK_PER_HP * 100 * casts(line.cd));
    line.adds.survival += got; raw.survival += got; }
  const reach = Math.max(basic.reach, ...skills.map(line => line.facts.reach ?? 0));
  return { id, weapon: held, basic, passive, raw, basicShare, skills, reach };
}

export const DISGUISE_IDS: readonly string[] = Object.keys(DISGUISE_KITS).filter(id => Object.hasOwn(DISGUISES, id));
let bestCache: Record<Axis, number> | null = null;
/** The best raw value of each axis over the seventeen disguises with their own weapons: the 100 of the scale. */
export function axisBest(): Record<Axis, number> {
  if (bestCache) return bestCache; const best = zero();
  for (const id of DISGUISE_IDS) { const r = rawProfile(id).raw; for (const axis of AXES) best[axis] = Math.max(best[axis], r[axis]); }
  return bestCache = best;
}
export type RoleId = 'guardian' | 'bruiser' | 'assassin' | 'sweeper' | 'striker' | 'caster' | 'controller' | 'skirmisher' | 'healer' | 'summoner';
export const ROLE_LABEL: Record<RoleId, string> = {
  guardian: 'Front-line guardian', bruiser: 'Front-line bruiser', assassin: 'Hit-and-run fighter', sweeper: 'Crowd fighter', striker: 'Ranged striker', caster: 'Area caster',
  controller: 'Crowd controller', skirmisher: 'Quick skirmisher', healer: 'Sturdy healer', summoner: 'Summoner',
};
export interface DisguiseProfile extends DisguiseRaw { scores: Record<Axis, number>; total: number; ranged: boolean; role: RoleId; strong: Axis[]; weak: Axis[]; best: string; care: string }
/** What an axis is good for / what its lack means, for the two hint lines. */
const GOOD_FOR: Record<Axis, string> = {
  damage: 'Best in long fights: it keeps hurting one creature.', burst: 'Best against bosses: one huge hit when it counts.', area: 'Best against crowds: its skills cover a lot of ground.',
  control: 'Best when creatures swarm you: it keeps them from fighting back.', survival: 'Best where creatures hit hard: it shrugs off a lot.', mobility: 'Best for hit and run: it is hard to pin down.',
};
const CARE_FOR: Record<Axis, string> = {
  damage: 'Fights take longer: bring a strong weapon in hand.', burst: 'No big finisher: wear bosses down slowly.', area: 'Crowds are hard work: fight creatures one at a time.',
  control: 'Nothing holds creatures still: keep moving.', survival: 'Little protection: bring food and watch your health.', mobility: 'No quick escape: do not get surrounded.',
};
/**
 * The scored profile. Scores are percents of the best disguise per axis (with its own weapon), capped at 100.
 * The role follows from the numbers (see below).
 * `strong` are the axes at 60 or more (at least the top one), `weak` the lowest one or two under 30.
 */
export function profile(id: string, weapon?: Pick<WeaponDef, 'kind' | 'cd' | 'range' | 'spread'>): DisguiseProfile {
  const base = rawProfile(id, weapon), best = axisBest(), scores = zero();
  for (const axis of AXES) scores[axis] = best[axis] > 0 ? Math.max(0, Math.min(100, Math.round(base.raw[axis] / best[axis] * 100))) : 0;
  const order = [...AXES].sort((a, b) => scores[b] - scores[a] || AXES.indexOf(a) - AXES.indexOf(b)), top = order[0];
  const ranged = base.basic.reach >= 6, summons = base.skills.filter(s => s.facts.summon).length;
  // The role: the top axis picks it; a fighter that is also sturdy reads as its damage role; reach, heals and summons refine it.
  const fighter = scores.damage >= 60, hitter = top === 'damage' || top === 'burst' || top === 'survival' && fighter;
  const role: RoleId = top === 'control' ? 'controller' : top === 'mobility' ? 'skirmisher'
    : top === 'area' ? ranged ? 'caster' : 'sweeper'
    : hitter ? summons >= 2 ? 'summoner' : ranged ? 'striker' : scores.mobility >= 60 ? 'assassin' : 'bruiser'
    : base.skills.some(s => (s.facts.heal ?? 0) >= .3) ? 'healer' : 'guardian';
  const strong = order.filter((axis, i) => i === 0 || scores[axis] >= 60).slice(0, 3), weak = [...order].reverse().filter(axis => scores[axis] < 30).slice(0, 2);
  return { ...base, scores, total: AXES.reduce((sum, axis) => sum + scores[axis], 0), ranged, role, strong, weak, best: GOOD_FOR[top], care: weak.length ? CARE_FOR[weak[0]] : '' };
}
export const allProfiles = (): DisguiseProfile[] => DISGUISE_IDS.map(id => profile(id));
