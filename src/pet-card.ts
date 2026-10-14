import { ITEMS } from './content.ts';
import { t } from './i18n.ts';
import { activeStats, type SaveState } from './model.ts';
import { gearFactor } from './upgrades.ts';
import { DOG_GUARD, PET_RULES, guardOf, petRole, petShare, type PetGuard } from './pet-guard.ts';
import { dogTossFactor, DOG_TOSS_CD } from './guard-dog.ts';
import { DOG_PET } from './pet-slots.ts';
import { DUNGEON_PETS, PET_SKILLS, petSkillDps } from './dungeon-content.ts';
import { petRoleId } from './pet-guard.ts';

/**
 * What a pet does, in plain words, for its card in the backpack, the shop and the Almanac: how much it adds to your
 * own damage, who it shoots, and how it protects you (pet-guard.ts). The numbers are the ones the fight uses: the
 * pet's level and your attack and health as they are now.
 */
export interface PetCard { /** "Adds about 8% to your damage." */ attack: string; /** Who it shoots. */ rule: string; /** Its guard, with its power and how often. */ guard: string; /** The boss note, for a counter or a block. */ boss: string; kind: PetGuard['kind'] }
const num = (v: number) => String(Math.round(v * 10) / 10);

/** The guard's line: its power as the player meets it (damage points, health points or seconds) and its rhythm. */
function guardLine(g: PetGuard, attack: number, maxHp: number): string {
  const every = num(g.every);
  switch (g.kind) {
    case 'counter': return t('🛡️ Guard: shoots enemy shots down. Takes {power} damage off a shot, and destroys a weaker one. Ready every {every} s.', { power: Math.max(1, Math.round(g.power * attack)), every });
    case 'block': return t('🛡️ Guard: steps into a blow. Takes {power} damage off a hit. Ready every {every} s.', { power: Math.max(1, Math.round(g.power * attack)), every });
    case 'mend': return t('💚 Guard: mends you when a hit leaves you below half health: +{power} health. Ready every {every} s.', { power: Math.max(1, Math.round(g.power * maxHp)), every });
    case 'distract': return t('💫 Guard: distracts a creature that hurt you: it cannot attack for {power} s. Ready every {every} s.', { power: num(g.power), every });
    default: return t('🐕 Guard: barks at a creature that hurt you: it is slowed for {power} s. Ready every {every} s.', { power: num(g.power), every });
  }
}
/** The card of pet `id` as save `s` has it, or null for anything that is not a pet. */
export function petCard(id: string, s: SaveState): PetCard | null {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item || item.slot !== 'pet') return null;
  const stats = activeStats(s), dog = id === DOG_PET, role = petRole(id); if (!dog && !role) return null;
  // A Vault pet also casts one skill of its own (dungeon-content.ts): its damage counts in the share, and its two skill names lead the lines.
  const vault = DUNGEON_PETS[petRoleId(id) ?? ''], skill = vault ? petSkillDps(petRoleId(id)!) / PET_RULES.heroDps : 0, named = (key: string | undefined, line: string) => key ? `${t(PET_SKILLS[key as keyof typeof PET_SKILLS].name)} · ${line}` : line;
  const share = (dog ? dogTossFactor(s.level) / DOG_TOSS_CD / PET_RULES.heroDps : petShare(role!, gearFactor(s, id))) + skill, guard = dog ? DOG_GUARD : guardOf(id, gearFactor(s, id))!;
  return {
    attack: named(vault?.attack, t('⚔️ Attack: adds about {share}% to your own damage.', { share: Math.max(1, Math.round(share * 100)) })),
    rule: t('It only goes for creatures that are fighting you, within {leash} m.', { leash: PET_RULES.leash }),
    guard: named(vault?.guard, guardLine(guard, stats.attack, stats.maxHp)),
    boss: guard.kind === 'counter' || guard.kind === 'block' ? t('A boss loses at most {cap}% of a hit.', { cap: Math.round(PET_RULES.bossCap * 100) }) : '', kind: guard.kind,
  };
}
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/**
 * The card as HTML ('' for anything that is not a pet): two short lines under the item's description. `brief` (the
 * shop's long list, narrow on a phone): the two lines without the notes on who it shoots and on bosses.
 */
export function petCardHtml(id: string, s: SaveState, brief = false): string {
  const card = petCard(id, s); if (!card) return '';
  return `<div class="pet-card" data-guard="${card.kind}"><p>${esc(card.attack)}${brief ? '' : ` <span class="muted">${esc(card.rule)}</span>`}</p><p>${esc(card.guard)}${card.boss && !brief ? ` <span class="muted">${esc(card.boss)}</span>` : ''}</p></div>`;
}
