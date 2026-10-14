/**
 * The goals chip on the HUD and the Goals panel (docs/FIX-PLAN.md 5.5; rules in goals.ts, Vietnamese in locales/vi-goals.ts).
 * The chip sits on the quick-eat row under the quest chips, so it moves with them and never needs a place of its own.
 * It is redrawn only when goalsKey (or the language) changes; the HUD tick only compares one short string.
 * Hidden while a new save's HUD is calm (first-run.ts: below CALM_UNTIL_LEVEL).
 */
import { collectionGoal, goalsKey, nextUnlock, planetGoal, type GoalsSave } from './goals.ts';
import { CALM_UNTIL_LEVEL, type FirstRun } from './first-run.ts';
import { getLanguage, t } from './i18n.ts';

type Save = GoalsSave & { firstRun?: FirstRun };
interface Host { esc(s: string): string; openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void }

const bar = (done: number, total: number) => `<div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? Math.min(100, done / total * 100) : 100}%"></i></div>`;

export function unlockText(s: Pick<GoalsSave, 'level'>) {
  const u = nextUnlock(s);
  if (!u) return t('Everything is open');
  return u.inLevels === 1 ? t('Next level: {thing}', { thing: `${u.icon} ${t(u.name)}` }) : t('In {n} levels: {thing}', { n: u.inLevels, thing: `${u.icon} ${t(u.name)}` });
}

export function goalsPanelHtml(s: GoalsSave, esc: (s: string) => string) {
  const p = planetGoal(s), c = collectionGoal(s), u = nextUnlock(s);
  const row = (icon: string, title: string, count: string, done: number, total: number, where: string, button = '') =>
    `<div class="goal-row"><span class="goal-icon">${icon}</span><div><strong>${esc(title)}<b>${esc(count)}</b></strong>${bar(done, total)}<small>${esc(where)}</small>${button}</div></div>`;
  const kind = (u?.kind ?? 'crop') as 'planet' | 'vault' | 'crop';
  const unlockWhere = !u ? t('You have opened every world, crop and the Vault. Keep collecting!')
    : kind === 'planet' ? t('A new world to land on. Earn EXP with crops, fish and creatures, then fly the starship.')
    : kind === 'vault' ? t('The five-room dungeon by the south gate. Earn EXP to be ready.')
    : t('A new seed for your garden beds. Earn EXP with crops, fish and creatures.');
  return `<div class="goals-list">`
    + row('🪐', t('Planets discovered'), `${p.done}/${p.total}`, p.done, p.total, t('Fly the starship from the launch pad and spot new worlds on the star map.'), `<button class="soft-button" data-action="discovery">${esc(t('Star map'))}</button>`)
    + row('📚', t('Collection'), `${c.pct}%`, c.done, c.total, t('Fish {fish} · Treasures {items} · Bosses {bosses}', { fish: `${c.fish.done}/${c.fish.total}`, items: `${c.items.done}/${c.items.total}`, bosses: `${c.creatures.done}/${c.creatures.total}` }), `<button class="soft-button" data-action="journal-tab" data-kind="collection">${esc(t('Collection book'))}</button>`)
    + row('⭐', t('Next unlock'), u ? t('Level {level}', { level: u.level }) : '✓', u ? Math.max(0, s.level - u.from) : 1, u ? u.level - u.from : 1, `${u ? unlockText(s) + ' · ' : ''}${unlockWhere}`)
    + `</div>`;
}

export function initGoals(hud: HTMLElement, host: Host) {
  const row = hud.querySelector('.quick-eat');
  const chip = document.createElement('button');
  chip.id = 'goals-chip'; chip.type = 'button'; chip.dataset.action = 'goals'; chip.hidden = true;
  row?.append(chip);
  let key = '';
  return {
    chip,
    update(s: Save) {
      const calm = !!s.firstRun && s.level < CALM_UNTIL_LEVEL, next = calm ? 'calm' : goalsKey(s) + getLanguage();
      if (next === key) return; key = next;
      chip.hidden = calm; if (calm) return;
      const p = planetGoal(s), c = collectionGoal(s), u = nextUnlock(s);
      chip.innerHTML = `<span class="gc-top"><span>🪐 ${p.done}/${p.total}</span><span>📚 ${c.pct}%</span></span><small>⭐ ${host.esc(u ? t('In {n} lv: {thing}', { n: u.inLevels, thing: `${u.icon} ${t(u.name)}` }) : t('Everything is open'))}</small>`;
      chip.setAttribute('aria-label', t('Goals: planets {p}, collection {c}%. {next}', { p: `${p.done}/${p.total}`, c: c.pct, next: unlockText(s) }));
      chip.title = t('Goals');
    },
    open(s: GoalsSave) { host.openDialog('goals', t('Your long-term goals'), goalsPanelHtml(s, host.esc), t('GOALS'), '🎯'); },
  };
}
