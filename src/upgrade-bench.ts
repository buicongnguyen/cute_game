/**
 * The upgrade bench in the cottage's craft room: two tabs, Gear (bench levels for hats, outfits, boots and companions;
 * a forge attempt for weapons, the same rule as the ember forge) and Skills (levels for Q, W, E and R). The rules
 * live in upgrades.ts / skill-upgrades.ts and run through actions.ts, so online the server pays and levels.
 * Each gear row shows its stats now, "Lv 7/10 · at max: ..." (the slot ceiling, gear-ceiling.ts, the same for every
 * item of that kind), a bar to +10, the next level's cost and the energy still needed to reach +10. The backpack's
 * item detail shows the same block (item-power.ts gearProgressHtml).
 */
import { t } from './i18n.ts';
import { ITEMS, type Inventory } from './content.ts';
import type { SaveState } from './model.ts';
import { forgeCost, forgeLevel, canForge, MAX_FORGE_LEVEL, FORGE_SUCCESS_CHANCE, type ForgeOutcome } from './weapon-forge.ts';
import { MAX_GEAR_LEVEL, canUpgradeGear, canUpgradeSkill, gearCost, gearCostToMax, gearLevel, skillCost, skillLevel, upgradableGear } from './upgrades.ts';
import { MAX_SKILL_LEVEL, SKILL_LEVEL_TEXT, levelledCooldown, skillTuning } from './skill-upgrades.ts';
import { whirlRadius, slamRadius } from './skill-info.ts';
import { sortByPower, powerChip, ownedScore, gearProgressHtml } from './item-power.ts';
import { groupItems, groupedHtml, GEAR_ORDER } from './item-groups.ts';
import './upgrade-bench.css';

export type BenchTab = 'gear' | 'skills';
export interface BenchSkill { name: string; icon: string; cd: number }
export interface BenchUi { art(id: string, icon: string): string; chips(materials?: Inventory): string; skills: readonly BenchSkill[]; disguised?: boolean; weaponKind?: string }
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fix = (v: number) => (Math.round(v * 100) / 100).toString();

/** Owned things the Gear tab lists: bench gear and combat weapons, weakest first as they are now (levels applied). */
export function benchGear(s: SaveState) {
  return sortByPower(Object.keys(s.bag).filter(id => (s.bag[id] || 0) > 0 && Object.hasOwn(ITEMS, id) && (upgradableGear(id) || ITEMS[id].slot === 'weapon' && !!ITEMS[id].weapon && ITEMS[id].weapon!.kind !== 'rod')), id => id, undefined, id => ownedScore(s, id));
}
function row(icon: string, title: string, lines: string, button: string) {
  return `<div class="shop-item bench-row"><span class="shop-icon">${icon}</span><div><strong>${title}</strong>${lines}</div>${button}</div>`;
}
const buy = (attrs: string, energy: number, enabled: boolean) => `<button class="primary" ${attrs} aria-label="${esc(t('Upgrade for {energy} energy', { energy }))}" ${enabled ? '' : 'disabled'}>ϟ ${energy.toLocaleString()}</button>`;
const maxed = () => `<span class="chip chip-seed">${esc(t('Maximum'))}</span>`;

function gearRows(s: SaveState, ui: BenchUi) {
  const list = benchGear(s);
  if (!list.length) return `<p class="empty-state">${esc(t('Buy hats, outfits, boots or companions first, then level them here.'))}</p>`;
  return groupedHtml('bench', groupItems(list, id => id, GEAR_ORDER, undefined, id => ownedScore(s, id)), id => {
    const item = ITEMS[id], name = esc(t(item.name)), icon = ui.art(id, item.icon);
    if (!upgradableGear(id)) {
      const level = forgeLevel(s, id), top = level >= MAX_FORGE_LEVEL, cost = forgeCost(level);
      const line = `<p>${esc(t('Forge attempt: {chance}% chance of +1 · attack +{now}%', { chance: Math.round(FORGE_SUCCESS_CHANCE * 100), now: level }))}</p>`;
      return row(icon, `${name} <span class="level-tag">+${level}</span>`, powerChip(id, s) + line + (top ? '' : ui.chips(cost.materials)), top ? maxed() : buy(`data-bench-action="forge" data-item="${id}"`, cost.energy, canForge(s, id)));
    }
    const level = gearLevel(s, id), top = level >= MAX_GEAR_LEVEL, cost = gearCost(id, level);
    const toMax = top ? '' : `<p class="muted bench-to-max">${esc(t('ϟ {energy} in all to reach +{max}', { energy: gearCostToMax(id, level).energy.toLocaleString(), max: MAX_GEAR_LEVEL }))}</p>`;
    return row(icon, `${name} <span class="level-tag">+${level}</span>`, powerChip(id, s) + gearProgressHtml(s, id) + (top ? '' : ui.chips(cost.materials)) + toMax, top ? maxed() : buy(`data-bench-action="gear" data-item="${id}"`, cost.energy, canUpgradeGear(s, id)));
  });
}
/** "Damage ×1.2 · radius 3.04 m" (the real hit radius, as the cast ring shows it) or "Damage ×1.2 · cooldown 3.6 s" for slot `index` at `level`. */
export function skillEffect(index: number, level: number, baseCd: number, weaponKind?: string) {
  const tune = skillTuning(index, level), damage = fix(tune.damage);
  return index === 0 || index === 2 ? t('Damage ×{damage} · radius {radius} m', { damage, radius: fix(index === 0 ? whirlRadius(weaponKind, level) : slamRadius(level)) }) : t('Damage ×{damage} · cooldown {cd} s', { damage, cd: fix(levelledCooldown(index, baseCd, level)) });
}
function skillRows(s: SaveState, ui: BenchUi) {
  const note = ui.disguised ? `<p class="intro">${esc(t('Disguise skills keep their own power; these levels apply to your own four skills.'))}</p>` : '';
  return note + `<div class="shop-grid">${ui.skills.slice(0, 4).map((skill, i) => {
    const level = skillLevel(s, i), top = level >= MAX_SKILL_LEVEL, cost = skillCost(level), key = ['Q', 'W', 'E', 'R'][i];
    const pips = `<span class="bench-pips" aria-label="${esc(t('Level {level} / {max}', { level, max: MAX_SKILL_LEVEL }))}">${Array.from({ length: MAX_SKILL_LEVEL }, (_, n) => `<i class="${n < level ? 'on' : ''}"></i>`).join('')}</span>`;
    const now = `<p>${esc(skillEffect(i, level, skill.cd, ui.weaponKind))}${top ? '' : ` → ${esc(skillEffect(i, level + 1, skill.cd, ui.weaponKind))}`}</p><p class="muted">${esc(t(SKILL_LEVEL_TEXT[i]))}</p>`;
    return row(`<span class="bench-skill-icon">${esc(t(skill.icon))}<kbd>${key}</kbd></span>`, `${esc(t(skill.name))} ${pips}`, now + (top ? '' : ui.chips(cost.materials)), top ? maxed() : buy(`data-bench-action="skill" data-index="${i}"`, cost.energy, canUpgradeSkill(s, i)));
  }).join('')}</div>`;
}
export function benchHtml(s: SaveState, tab: BenchTab, ui: BenchUi) {
  const tabs = (['gear', 'skills'] as const).map(id => `<button class="${tab === id ? 'active' : ''}" aria-pressed="${tab === id}" data-bench-tab="${id}">${esc(t(id === 'gear' ? 'Gear' : 'Skills'))}</button>`).join('');
  const intro = tab === 'gear'
    ? t("Level hats, outfits, boots and companions up to +10. At +10 every item of a kind is equally strong, so wear the look you like; items further behind cost more. Weapons use the forge: a 30% chance per attempt, +1% attack per level, up to +15.")
    : t('Each skill levels up to 5. Levels work in every fight, online too.');
  return `<nav class="panel-tabs" aria-label="${esc(t('Upgrade bench'))}">${tabs}</nav><p class="intro">${esc(intro)}</p>${tab === 'gear' ? gearRows(s, ui) : skillRows(s, ui)}`;
}

export interface BenchDeps {
  state(): SaveState; ui(): BenchUi;
  perform<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T | false | null | undefined>;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  modal(): string | null; toast(message: string, icon?: string): void; tone(kind?: string): void;
}
export function initUpgradeBench(d: BenchDeps) {
  let tab: BenchTab = 'gear';
  const open = (next?: BenchTab) => { if (next) tab = next; d.openDialog('bench', t('Upgrade bench'), benchHtml(d.state(), tab, d.ui()), t('UPGRADE BENCH'), '⚒️'); };
  document.addEventListener('click', async event => {
    if (d.modal() !== 'bench') return;
    const tabButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-bench-tab]');
    if (tabButton) { open(tabButton.dataset.benchTab as BenchTab); d.tone('click'); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-bench-action]'); if (!button || button.disabled) return;
    button.disabled = true;
    const action = button.dataset.benchAction, id = button.dataset.item ?? '', index = Number(button.dataset.index);
    if (action === 'gear') {
      const done = await d.perform<{ id: string; level: number }>('upgradeGear', { id });
      if (done) { d.tone('level'); d.toast(t('{name} is now +{level}!', { name: t(ITEMS[done.id].name), level: done.level }), '⚒️'); }
    } else if (action === 'forge') {
      const done = await d.perform<ForgeOutcome>('forge', { id });
      if (done) { d.tone(done.success ? 'level' : 'pop'); d.toast(done.success ? t('Forged to +{level}!', { level: done.level }) : t('The forge attempt failed. Your weapon kept its level.'), done.success ? '✨' : '🔨'); }
    } else if (action === 'skill') {
      const done = await d.perform<{ index: number; level: number }>('upgradeSkill', { index });
      if (done) { d.tone('level'); d.toast(t('{skill} reached level {level}!', { skill: t(d.ui().skills[done.index]?.name ?? ''), level: done.level }), '🌀'); }
    }
    if (d.modal() === 'bench') open();
  });
  return { open };
}
