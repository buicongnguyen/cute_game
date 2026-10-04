/**
 * What every fighting skill really does, in the player's words and with the numbers combat.ts uses: the skill
 * button tooltip / long-press tip, the upgrade bench and the effect sizes all read this table, so a description can
 * never drift from the hit area (tests/skill-info.test.mjs checks each radius against a cast in the simulation).
 * Pure data and string building; t() localizes through locales/vi-skills.ts.
 */
import { t } from './i18n.ts';
import { skillTuning, levelledCooldown } from './skill-upgrades.ts';

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
  volley: { damage: .7, text: 'Ten rapid shots fly 15 m ahead in one second, ×{dmg} damage each.' },
  anchor: { damage: 2, radius: 4.4, text: 'Swing a heavy anchor all around you: ×{dmg} damage within 4.4 m, knocked back.' },
  lotus: { damage: .8, text: 'Twelve lotus petals burst out all around you to 8 m, ×{dmg} damage each, and you heal 8% health.' },
  dragon: { damage: 1.3, text: 'Seven waves in a wide fan fly 12 m, ×{dmg} damage each.' },
  eagle: { damage: 1.8, radius: 3, text: 'Dive forward 7 m, then land in a burst: ×{dmg} damage within 3 m.' },
  goldstar: { damage: 1.4, radius: 2.6, text: 'Five piercing gold stars fly 11 m, ×{dmg} damage each, with a 2.6 m burst around you.' },
  laser: { damage: 3, text: 'A 14 m rainbow beam straight ahead: ×{dmg} damage to everything in the line.' },
};

/** Disguise skills (fixed kits, never levelled), by disguise and slot. */
export const DISGUISE_INFO: Record<string, readonly string[]> = {
  dz_superhero: ['Fly for 12 s (press again to land): ground attacks miss you.', 'Dive 4 m ahead and crash: ×2 damage within 5 m, ×4 if you were flying; stuns 1 s.', 'Twin eye lasers sweep a 13 m line, 1 m wide, across the front for 1.2 s: ×1 damage per touch, leaving scorch marks.', 'Throw a boulder after 0.8 s: ×3 damage, then a 4 m blast that stuns 2 s.'],
  dz_ninja: ['Two shadow clones fight beside you for 8 s.', 'Vanish for 5 s: enemies lose you, and your next hit does triple damage.', 'Blink behind the nearest enemy within 12 m: ×3 damage and stunned for 1 s.', 'Smoke within 5 m: enemies are blinded for 4 s and you vanish for 4 s.'],
  dz_mage: ['Charge 0.8 s, then a great fireball: ×3 damage and a 4 m blast that stuns 2 s.', 'Blink 8 m ahead.', 'Turn enemies within 3 m of your target into sheep for 6 s: tiny, slow and harmless.', 'A black hole near your target pulls enemies in for 3 s (5 m), then bursts for ×3 damage.'],
  dz_knight: ['Raise your shield: no damage for 4 s.', 'Charge 11 m forward, untouchable, ×3 damage to every enemy on the way.', 'Challenge every enemy within 12 m for 6 s; you take far less damage.', 'After 0.8 s a holy blade strikes your target: ×4 damage within 3.5 m, stuns 1 s.'],
  dz_mecha: ['Tank mode for 6 s: a 2 m electric shockwave every 0.25 s, ×1 damage, stunned 0.3 s.', 'Drop a tesla turret that fires shock bolts for 12 s.', 'Up to 6 shock missiles at enemies within 16 m: ×2 damage and a 2 m electric burst.', 'Energy shield: no damage for 4 s and 20% health back.'],
  dz_dino: ['Bite an enemy within 3.2 m: a weak one (under 40% health) is swallowed whole and heals you 25%; otherwise ×3 damage.', 'A tail sweep all around: ×1.8 damage within 3.6 m and a big knock-back.', 'Roar: enemies within 9 m flee in fear for 4 s.', 'Giant form for 10 s: twice as big, +60% damage, +20 defence, and your steps shake the ground.'],
  dz_fairy: ['Healing flowers for 8 s: stay within 4 m to heal 3% every half second.', 'Float for 8 s: ground attacks miss you.', 'Charm your target for 8 s: it fights the other creatures.', 'Binding roots within 6 m: ×1 damage, stuck for 4 s, then 8 more pulses that heal you.'],
  dz_pirate: ['Set a cannon that fires for 10 s.', 'Hook the nearest enemy within 14 m and pull it to you: ×1.5 damage, stunned 2 s.', 'Your parrot marks every enemy within 12 m for 8 s: they take +50% damage.', 'A broadside of 12 cannonballs around your target, ×1.5 damage within 2 m each.'],
  dz_vampire: ['Drain your target for 2.1 s: 7 bites of ×0.7 damage, each heals you 3.5%.', 'Become bats for 2.5 s: untouchable.', 'Five bats circle you for 8 s, biting enemies and healing you.', 'Blood moon for 6 s: enemies within 7 m take ×0.3 damage every 0.5 s and every hit heals you 40%.'],
  dz_snowman: ['Roll a huge snowball 21 m: ×3 damage to everything it passes, stunned 2 s.', 'A snow decoy for 6 s: enemies within 8 m are blinded, then it bursts for ×2.5 damage within 4 m.', 'An 8 s ice rink 6 m around you: enemies on it are slowed.', 'Freeze every enemy within 8 m for 3 s, then shatter them for ×2.8 damage.'],
};

export interface SkillView { name: string; icon: string; cd: number }
/**
 * The plain-words description of slot `index` with the numbers at the player's level: base skills and the weapon
 * special scale with their upgrade level; disguise skills use their fixed kit.
 */
export function skillDescription(index: number, { special = 'fist', weaponKind, level = 0, disguise }: { special?: string; weaponKind?: string; level?: number; disguise?: string }): string {
  if (disguise) { const text = DISGUISE_INFO[disguise]?.[index]; return text ? t(text) : ''; }
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
  lifesteal: { icon: '🩸', name: 'Life drain' }, bats: { icon: '🦇', name: 'Bat form' },
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
