/**
 * What every fighting skill really does, in the player's words and with the numbers combat.ts uses: the skill
 * button tooltip / long-press tip, the upgrade bench and the effect sizes all read this table, so a description can
 * never drift from the hit area (tests/skill-info.test.mjs checks each radius against a cast in the simulation).
 * Pure data and string building; t() localizes through locales/vi-skills.ts.
 */
import { t } from './i18n.ts';
import { skillTuning, levelledCooldown } from './skill-upgrades.ts';
import { DZ, GAZE, BOULDER, SUMMON_HP, DECOY, LIFESTEAL_CAP_PER_SECOND } from './combat.ts';

const fix = (n: number) => String(Math.round(n * 100) / 100);
/** Base whirlwind radius (sword users spin wider), the slam shockwave and the dash length, as combat.ts casts them. */
export const whirlRadius = (weaponKind: string | undefined, level: number) => (weaponKind === 'sword' ? 3.4 : 2.8) + skillTuning(0, level).radius;
export const slamRadius = (level: number) => 4.4 + skillTuning(2, level).radius;
export const DASH_LENGTH = 30 * .24;

/** Weapon specials: base damage factor (scaled by the R level) and the description template. */
export const SPECIAL_INFO: Record<string, { damage: number; text: string; radius?: number }> = {
  fist: { damage: .8, radius: 1.8, text: 'Six quick punches in 0.8 s, each ×{dmg} damage in a 1.8 m arc ahead.' },
  crescent: { damage: 2.4, radius: 3.8, text: 'One wide 3.8 m half-circle slash ahead for ×{dmg} damage.' },
  gore: { damage: 2, text: 'Charge 10 m forward, untouchable, goring every enemy on the way for ×{dmg} damage.' },
  wave: { damage: 2, text: 'Three piercing blade waves fly 12 m, ×{dmg} damage to everything they pass.' },
  tsunami: { damage: 1.6, text: 'Five piercing waves in a wide fan fly 13 m, ×{dmg} damage each.' },
  peastorm: { damage: .8, text: 'Spray 14 peas ahead in one second, ×{dmg} damage each.' },
  bigbubble: { damage: 1.2, text: 'A big bubble flies 11 m: the first enemy hit takes ×{dmg} damage and is trapped for 3 s.' },
  nova: { damage: 1.1, text: '24 thorns burst out all around you to 8 m, ×{dmg} damage each.' },
  blizzard: { damage: 1, text: '24 ice shards burst out all around you to 9 m: ×{dmg} damage and frozen for 1.5 s.' },
  magma: { damage: 1.5, radius: 1.6, text: 'Five lava pillars erupt in a line 8.5 m ahead: ×{dmg} damage within 1.6 m of each.' },
  thunder: { damage: 2.4, text: 'Lightning chains through up to 6 enemies within 10 m: ×{dmg} damage and stunned for 2 s.' },
  bonk: { damage: 2.2, radius: 3.6, text: 'A giant hammer blow just ahead: ×{dmg} damage within 3.6 m, stunned for 3 s.' },
  whirl: { damage: 1.4, radius: 4.4, text: 'Three cyclone pulses around you: ×{dmg} damage within 4.4 m each.' },
  starfall: { damage: 1.1, radius: 1.6, text: '12 stars fall around the nearest enemy, ×{dmg} damage within 1.6 m of each.' },
  inferno: { damage: 1.3, radius: 1.8, text: 'A ring of 10 fire bursts 3.6 m around you, ×{dmg} damage within 1.8 m of each.' },
  volley: { damage: .7, text: 'Pop ten toy corks 15 m ahead in one second, ×{dmg} damage each.' },
  anchor: { damage: 2, radius: 4.4, text: 'Swing a heavy anchor all around you: ×{dmg} damage within 4.4 m, knocked back.' },
  lotus: { damage: .8, text: 'Twelve lotus petals burst out all around you to 8 m, ×{dmg} damage each, and you heal 8% health.' },
  dragon: { damage: 1.3, text: 'Seven waves in a wide fan fly 12 m, ×{dmg} damage each.' },
  eagle: { damage: 1.8, radius: 3, text: 'Dive forward 9 m, hitting enemies on the way for ×2.4, then land in a burst: ×{dmg} damage within 3 m.' },
  goldstar: { damage: 1.4, radius: 2.6, text: 'Five piercing gold stars fly 11 m, ×{dmg} damage each, with a 2.6 m burst around you.' },
  laser: { damage: 3, text: 'A 14 m rainbow beam straight ahead: ×{dmg} damage to everything in the line.' },
};

/**
 * Disguise skills (fixed kits, never levelled), by disguise and slot. Every number is read from combat.ts (DZ, GAZE,
 * BOULDER), so a tooltip cannot drift from the hit; locales/vi-skills.ts holds the same sentences in Vietnamese.
 */
const pct = (n: number) => fix(n * 100);
const fanAngle = Math.round(2 * Math.acos(DZ.fan.cone) * 180 / Math.PI);
const snowMax = Math.min(2.6, .5 + DZ.snowball.grow * DZ.snowball.time);
/** A summon's hit points as a share of yours (combat.ts SUMMON_HP). */
const hp = (kind: string) => pct(SUMMON_HP[kind].hp);
export const DISGUISE_INFO: Record<string, readonly string[]> = {
  dz_superhero: [`Fly for ${DZ.flight.time} s, ${pct(DZ.flight.speed)}% faster (press again to land): melee attacks miss you, only shots can reach you.`,
    `Dive ${DZ.dive.ahead} m ahead and crash down: ×${DZ.dive.power} damage within ${DZ.dive.radius} m, ×${DZ.dive.flying} if you were flying, enemies thrown up.`,
    `Twin eye lasers sweep a ${GAZE.length} m line, ${GAZE.width} m wide, across the front for ${GAZE.time} s: ×1 damage per touch, leaving scorch marks.`,
    `Lob a giant rock at the nearest enemy within ${BOULDER.range} m (${BOULDER.fallback} m ahead if none): lands in ${BOULDER.time} s for ×${BOULDER.power} damage in a ${BOULDER.radius} m blast, launching enemies upward.`],
  dz_ninja: [`Four shadow clones fight beside you for ${DZ.clones.life} s, each hit ×${DZ.clones.power} damage. Creatures within ${DECOY.lure} m of a clone attack it instead of you; each has ${hp('clone')}% of your health and vanishes in a puff when it runs out.`,
    `Vanish for ${DZ.stealth.time} s, ${pct(DZ.stealth.speed)}% faster: enemies lose you, and your next hit does triple damage.`,
    `Blink behind the nearest enemy within ${DZ.backstab.range} m and strike: ×${DZ.backstab.power} damage, a critical blow.`,
    `A smoke cloud lasts ${DZ.smoke.time} s within ${DZ.smoke.radius} m: enemies inside are blinded and you stay hidden while inside.`],
  dz_mage: [`Charge ${DZ.fireball.charge} s, then hurl a great fireball at the nearest enemy within ${DZ.fireball.range} m: ×${DZ.fireball.power} damage in a ${DZ.fireball.radius} m blast, enemies thrown up.`,
    `Blink ${DZ.teleport.distance} m ahead.`,
    `Turn the nearest enemy within ${DZ.sheep.range} m, and up to ${DZ.sheep.count - 1} more within ${DZ.sheep.around} m of it, into sheep for ${DZ.sheep.time} s: tiny, slow and harmless (a boss is only slowed).`,
    `A black hole at your target pulls enemies within ${DZ.blackhole.pull} m for ${DZ.blackhole.time} s, then bursts: ×${DZ.blackhole.power} damage within ${DZ.blackhole.radius} m.`],
  dz_knight: [`Raise your shield for ${DZ.block.time} s: every blow from in front of you is blocked, and shots that hit it fly back at their shooter for ×${DZ.block.reflect} damage.`,
    `Charge ${fix(DZ.knightcharge.speed * DZ.knightcharge.time)} m forward, untouchable, carrying enemies along, then a mighty blow: ×${DZ.knightcharge.power} damage to each of them.`,
    `Challenge every enemy within ${DZ.taunt.radius} m for ${DZ.taunt.time} s; you gain +${DZ.taunt.defence} defence.`,
    `A giant sword falls on your target after ${DZ.holy.delay} s: ×${DZ.holy.power} damage within ${DZ.holy.radius} m.`],
  dz_mecha: [`Tank mode for ${DZ.tank.time} s: ${pct(DZ.tank.speed)}% faster, +${DZ.tank.defence} defence, and you ram every enemy you touch with an electric shockwave (×${DZ.tank.power} damage, once every ${DZ.tank.rehit} s each).`,
    `Drop a tesla turret that fires shock bolts for ${DZ.turret.life} s, ×${DZ.turret.power} damage each. Creatures may attack it (${hp('turret')}% of your health).`,
    `${DZ.missiles.count} shock missiles home in on up to ${DZ.missiles.count} enemies within ${DZ.missiles.range} m: ×${DZ.missiles.power} damage each in a ${DZ.missiles.radius} m electric burst.`,
    `Energy shield: no damage for ${DZ.energyshield.time} s and ${pct(DZ.energyshield.heal)}% health back.`],
  dz_dino: [`Bite an enemy within ${DZ.devour.reach} m: a weak one (under ${pct(DZ.devour.below)}% health) is swallowed whole and heals you ${pct(DZ.devour.heal)}%; otherwise ×${DZ.devour.power} damage (a boss is never swallowed).`,
    `A tail sweep all around: ×${DZ.tail.power} damage within ${DZ.tail.radius} m and a big knock-back.`,
    `Roar: enemies within ${DZ.roar.radius} m flee in fear for ${DZ.roar.time} s (a boss is only slowed).`,
    `Giant form for ${DZ.giant.time} s: twice as big, +60% damage, +${DZ.giant.defence} defence, and your steps shake the ground.`],
  dz_fairy: [`A healing flower ring for ${DZ.heal.time} s: stay within ${DZ.heal.radius} m to heal ${pct(DZ.heal.perTick / DZ.heal.tick)}% of your health every second.`,
    `Float for ${DZ.hover.time} s, ${pct(DZ.hover.speed)}% faster: melee attacks miss you.`,
    `Charm the nearest enemy within ${DZ.charm.range} m for ${DZ.charm.time} s: it fights the other creatures (a boss is only slowed).`,
    `A binding tree grows ${DZ.tree.ahead} m ahead for ${DZ.tree.life} s: its roots hold every enemy within ${DZ.tree.radius} m for ${DZ.tree.root} s, and it lashes one every ${DZ.tree.cd} s for ×${DZ.tree.power} damage. Creatures may attack it (${hp('tree')}% of your health).`],
  dz_pirate: [`Set a deck cannon that fires exploding shells for ${DZ.cannon.life} s, ×${DZ.cannon.power} damage each. Creatures may attack it (${hp('cannon')}% of your health).`,
    `Hook the nearest enemy within ${DZ.hook.range} m and reel it in: ×${DZ.hook.power} damage and slowed for ${DZ.hook.slow} s.`,
    `A scout parrot flies out for ${DZ.parrot.life} s, pecking enemies (×${DZ.parrot.power} damage) and marking them for ${DZ.parrot.mark} s: marked enemies take +50% damage.`,
    `A pirate ship's broadside: ${DZ.broadside.count} cannonballs land around your target, ×${DZ.broadside.power} damage within ${DZ.broadside.radius} m each.`],
  dz_vampire: [`Drain the nearest enemy within ${DZ.drain.range} m: ${DZ.drain.ticks} bites of ×${DZ.drain.power} damage in ${fix(DZ.drain.ticks * DZ.drain.tick)} s, and you heal ${pct(DZ.drain.heal)}% of the damage dealt (stolen life: at most ${pct(LIFESTEAL_CAP_PER_SECOND)}% of your health per second).`,
    `Become bats for ${DZ.bats.time} s: untouchable and twice as fast.`,
    `Five bats circle you for ${DZ.batcircle.life} s, biting enemies (×${DZ.batcircle.power} damage) and healing you ${pct(DZ.batcircle.heal)}% per bite.`,
    `Blood moon for ${DZ.bloodnova.time} s: enemies within ${DZ.bloodnova.radius} m take ×${DZ.bloodnova.power} damage every ${DZ.bloodnova.tick} s; your hits heal you for ${pct(DZ.bloodnova.lifesteal)}% of the damage dealt (stolen life: at most ${pct(LIFESTEAL_CAP_PER_SECOND)}% of your health per second).`],
  dz_snowman: [`Roll a growing snowball ${fix(DZ.snowball.speed * DZ.snowball.time)} m: it hits everything it passes for ×1.5 to ×${fix(1 + snowMax)} damage (more as it grows), slowing them ${DZ.snowball.slow} s.`,
    `A snow decoy stands ${DZ.decoy.ahead} m ahead for ${DZ.decoy.life} s with ${hp('snowman')}% of your health: creatures within ${DECOY.lure} m attack it instead of you. When it melts or breaks it bursts for ×${DZ.decoy.power} damage within ${DZ.decoy.radius} m and freezes them ${DZ.decoy.freeze} s.`,
    `An ${DZ.icefloor.time} s ice rink ${DZ.icefloor.radius} m around you: enemies on it are slowed, and you skate ${pct(DZ.icefloor.speed)}% faster.`,
    `Freeze every enemy within ${DZ.iceage.radius} m for ${DZ.iceage.freeze} s, then shatter them for ×${DZ.iceage.power} damage.`],
  // The six uniforms
  dz_army: [`Pop ${DZ.popgun.count} toy corks in a fan, ${DZ.popgun.range} m ahead: ×${DZ.popgun.power} damage each.`,
    `Stack a sandbag wall round you for ${DZ.sandbag.time} s: +${DZ.sandbag.defence} defence while you stand inside its ${DZ.sandbag.radius} m ring; enemies inside are pushed out (×${DZ.sandbag.power} damage). The wall has ${hp('sandbag')}% of your health and creatures may attack it.`,
    `Fire a signal flare over the nearest enemy within ${DZ.flare.range} m: after ${DZ.flare.delay} s every enemy within ${DZ.flare.radius} m is dazzled for ${DZ.flare.blind} s and marked for ${DZ.flare.mark} s (+50% damage taken).`,
    `${DZ.airdrop.count} supply crates parachute around the nearest enemy within ${DZ.airdrop.range} m: each lands for ×${DZ.airdrop.power} damage within ${DZ.airdrop.radius} m, and the supplies heal you ${pct(DZ.airdrop.heal)}%.`],
  dz_navy: [SPECIAL_INFO.anchor.text,
    `Ride a wave ${fix(DZ.surfride.speed * DZ.surfride.time)} m forward, untouchable, ×${DZ.surfride.power} damage to every enemy on the way.`,
    `Blow the bosun's whistle: every enemy within ${DZ.whistle.radius} m stands to attention, stunned for ${DZ.whistle.stun} s.`,
    `A little lighthouse stands beside you for ${DZ.lighthouse.life} s; its beam sweeps round every ${fix(2 * Math.PI / DZ.lighthouse.turn)} s: ×${DZ.lighthouse.power} damage and a ${DZ.lighthouse.blind} s dazzle to each enemy within ${DZ.lighthouse.reach} m it passes.`],
  dz_aodai: [SPECIAL_INFO.lotus.text,
    `Glide ${fix(DZ.ribbon.speed * DZ.ribbon.time)} m on a silk ribbon, untouchable, then move ${pct(DZ.ribbon.boost)}% faster for ${DZ.ribbon.boostTime} s.`,
    `Open a paper fan: a gust through a ${fanAngle}° cone ${DZ.fan.radius} m ahead, ×${DZ.fan.power} damage, enemies blown back and slowed ${DZ.fan.slow} s.`,
    `${DZ.lanterns.count} paper lanterns drift out ${DZ.lanterns.ring} m around you and burst one after another: ×${DZ.lanterns.power} damage within ${DZ.lanterns.radius} m each, and each heals you ${pct(DZ.lanterns.heal)}%.`],
  dz_aodai_man: [SPECIAL_INFO.dragon.text,
    `Glide under a kite for ${DZ.kite.time} s, ${pct(DZ.kite.speed)}% faster: melee attacks miss you.`,
    `Brush an ink circle ${DZ.ink.radius} m around you: ×${DZ.ink.power} damage, and enemies inside are held for ${DZ.ink.stun} s.`,
    `A dragon dance circles you for ${DZ.dragondance.time} s: ×${DZ.dragondance.power} damage every ${DZ.dragondance.tick} s to every enemy within ${DZ.dragondance.radius} m.`],
  dz_usa: [SPECIAL_INFO.eagle.text,
    `Raise a star shield: no damage for ${DZ.starshield.time} s, and enemies within ${DZ.starshield.radius} m are bashed back (×${DZ.starshield.power} damage).`,
    `Raise the liberty torch: +${pct(DZ.torch.bonus)}% damage for ${DZ.torch.time} s, ${pct(DZ.torch.heal)}% health back, and enemies within ${DZ.torch.radius} m are dazzled for ${DZ.torch.blind} s.`,
    `${DZ.fireworks.count} fireworks shoot up over enemies within ${DZ.fireworks.range} m and burst: ×${DZ.fireworks.power} damage within ${DZ.fireworks.radius} m each.`],
  dz_vietnam: [SPECIAL_INFO.goldstar.text,
    `Pole-vault ${fix(DZ.bamboo.speed * DZ.bamboo.time)} m forward on a bamboo pole, untouchable, landing for ×${DZ.bamboo.power} damage within ${DZ.bamboo.radius} m.`,
    `Beat the bronze drum ${DZ.drum.beats} times: each beat deals ×${DZ.drum.power} damage within ${DZ.drum.radius} m and pushes enemies back; the last stuns them ${DZ.drum.stun} s.`,
    `A great golden star falls on the nearest enemy within ${DZ.bigstar.range} m after ${DZ.bigstar.delay} s: ×${DZ.bigstar.power} damage within ${DZ.bigstar.radius} m, and enemies there are slowed ${DZ.bigstar.slow} s.`],
};

export interface SkillView { name: string; icon: string; cd: number }
/**
 * The plain-words description of slot `index` with the numbers at the player's level: base skills and the weapon
 * special scale with their upgrade level; disguise skills use their fixed kit.
 */
export function skillDescription(index: number, { special = 'fist', weaponKind, level = 0, disguise }: { special?: string; weaponKind?: string; level?: number; disguise?: string }): string {
  if (disguise) { const text = DISGUISE_INFO[disguise]?.[index], sp = Object.values(SPECIAL_INFO).find(i => i.text === text); return text ? t(text, sp ? { dmg: fix(sp.damage) } : {}) : ''; }
  const dmg = (base: number) => fix(base * skillTuning(index, level).damage);
  if (index === 0) return t('Spin for 2.2 s: 10 hits of ×{dmg} damage on every enemy within {r} m.', { dmg: dmg(.55), r: fix(whirlRadius(weaponKind, level)) });
  if (index === 1) return t('Rush {d} m forward, untouchable, striking each enemy on the way once for ×{dmg} damage.', { d: fix(DASH_LENGTH), dmg: dmg(1.7) });
  if (index === 2) return t('Leap and land a {r} m shockwave: ×{dmg} damage, enemies thrown up and stunned 0.8 s.', { r: fix(slamRadius(level)), dmg: dmg(2.3) });
  const info = SPECIAL_INFO[special] ?? SPECIAL_INFO.fist;
  return t(info.text, { dmg: dmg(info.damage) });
}
/** The tooltip / long-press tip: "Name · 7 s — what it does". */
export function skillTip(skill: SkillView, index: number, options: { special?: string; weaponKind?: string; level?: number; disguise?: string }) {
  const cd = levelledCooldown(index, skill.cd, options.level ?? 0, !!options.disguise);
  return `${t(skill.name)} · ${t('{cd} s cooldown', { cd: fix(cd) })} — ${skillDescription(index, options)}`;
}

/** Player buff chips for combat statuses: icon and name (combat.statuses keys). */
export const BUFF_CHIPS: Record<string, { icon: string; name: string }> = {
  flight: { icon: '🕊️', name: 'Flying' }, shield: { icon: '🛡️', name: 'Shielded' }, stealth: { icon: '👻', name: 'Hidden' },
  giant: { icon: '🦖', name: 'Giant' }, tank: { icon: '🤖', name: 'Tank mode' }, armor: { icon: '🪖', name: 'Armoured' },
  lifesteal: { icon: '🩸', name: 'Blood drain' }, bats: { icon: '🦇', name: 'Bat form' },
  swift: { icon: '💨', name: 'Swift' }, block: { icon: '🛡️', name: 'Blocking' }, cover: { icon: '🧱', name: 'Sandbag cover' }, rally: { icon: '🔥', name: 'Inspired' }, invuln: { icon: '✨', name: 'Untouchable' },
};
/** Enemy status marks over their HP bar, in priority order (the first two that apply are shown). */
export const STATUS_MARKS: readonly [key: string, icon: string][] = [['stun', '💫'], ['shock', '⚡'], ['sheep', '🐑'], ['charm', '💗'], ['fear', '😱'], ['blind', '🌫️'], ['taunt', '💢'], ['slow', '🐌'], ['mark', '🎯']];
/** The marks a creature shows now: stun first, then ⚡ (an electric hit, skill-fx.ts), then statuses; at most two so the bar stays small. */
export function statusMarks(e: { stun?: number; shock?: number; statuses?: Record<string, number> }, marked = false): string {
  let out = '', n = 0;
  for (const [key, icon] of STATUS_MARKS) {
    const on = key === 'stun' ? (e.stun ?? 0) > .25 : key === 'shock' ? (e.shock ?? 0) > 0 : key === 'mark' ? marked : (e.statuses?.[key] ?? 0) > 0;
    if (on) { out += icon; if (++n === 2) break; }
  }
  return out;
}
