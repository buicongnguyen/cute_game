/**
 * The goals badge on the map and the Goals panel (docs/FIX-PLAN.md 5.5; rules in goals.ts and place-flags.ts, Vietnamese
 * in locales/vi-goals.ts and locales/vi-flags.ts).
 *
 * The badge is a small flag tag on the map panel's top-right corner: a flag in the explorer's colour and the places
 * reached (one arrival flag each, place-flags.ts). It replaces the goals card that used to sit under the quest chips,
 * over the play area. Tapping it opens the Goals panel: places reached with each place, planets discovered, the
 * collection and the next unlock, each with where to go. It is redrawn only when its numbers (or the language or
 * colour) change; the HUD tick only compares one short string. Hidden while a new save's HUD is calm (first-run.ts:
 * below CALM_UNTIL_LEVEL), and with the map itself in a mode or indoors (goals.css).
 */
import { collectionGoal, goalsKey, nextUnlock, planetGoal, type GoalsSave } from './goals.ts';
import { PLACES, placesReached, type PlaceFlags } from './place-flags.ts';
import { PLANETS } from './content.ts';
import { CALM_UNTIL_LEVEL, type FirstRun } from './first-run.ts';
import { getLanguage, t } from './i18n.ts';

type Save = GoalsSave & { firstRun?: FirstRun; placeFlags?: PlaceFlags; color?: string };
interface Host { esc(s: string): string; openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void }

const bar = (done: number, total: number) => `<div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? Math.min(100, done / total * 100) : 100}%"></i></div>`;
/** The badge's flag: a pole and a swallow-tailed pennant in the explorer's colour (currentColor). */
export const FLAG_ICON = '<svg class="flag-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.6v13" stroke="#fff6e0" stroke-width="2.2" stroke-linecap="round"/><path d="M5 2.2h8.6l-2.4 3.1 2.4 3.1H5z" fill="currentColor" stroke="#3a2433" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const levelOf = (planet: string) => Object.hasOwn(PLANETS, planet) ? PLANETS[planet as keyof typeof PLANETS].level : 1;
const safeColor = (c: string | undefined) => c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#4aa8ff';

export function unlockText(s: Pick<GoalsSave, 'level'>) {
  const u = nextUnlock(s);
  if (!u) return t('Everything is open');
  return u.inLevels === 1 ? t('Next level: {thing}', { thing: `${u.icon} ${t(u.name)}` }) : t('In {n} levels: {thing}', { n: u.inLevels, thing: `${u.icon} ${t(u.name)}` });
}

/** The places row: the count, a bar, the next place to go and every place (reached ones carry a flag in the explorer's colour). */
export function placesRowHtml(s: Pick<Save, 'placeFlags' | 'color' | 'level'>, esc: (s: string) => string) {
  const flags = s.placeFlags ?? {}, r = placesReached(flags), color = safeColor(s.color);
  // The next place: the first not reached whose world the explorer can land on (the wilds and landmarks are always open).
  const next = PLACES.find(p => !Object.hasOwn(flags, p.id) && (p.kind !== 'planet' || (s.level ?? 1) >= levelOf(p.planet)));
  const where = r.done >= r.total ? t('A flag stands at every place. Well travelled!')
    : next ? t('Next: {place} · {hint}', { place: `${next.icon} ${t(next.name)}`, hint: t(next.hint) }) : t('Level up to land on new worlds.');
  const items = PLACES.map(p => { const got = Object.hasOwn(flags, p.id); return `<li class="${got ? 'got' : 'todo'}"${got ? '' : ` title="${esc(t(p.hint))}"`}><span aria-hidden="true">${got ? FLAG_ICON : p.icon}</span>${esc(t(p.name))}${got ? `<span class="vh"> ✓</span>` : ''}</li>`; }).join('');
  return `<div class="goal-row goal-places" style="--flag:${color}"><span class="goal-icon">${FLAG_ICON}</span><div><strong>${esc(t('Places reached'))}<b>${r.done}/${r.total}</b></strong>${bar(r.done, r.total)}<small>${esc(t('Walk somewhere new and a flag in your colour goes up there.'))} ${esc(where)}</small><ul class="place-list">${items}</ul></div></div>`;
}

export function goalsPanelHtml(s: Save, esc: (s: string) => string) {
  const p = planetGoal(s), c = collectionGoal(s), u = nextUnlock(s);
  const row = (icon: string, title: string, count: string, done: number, total: number, where: string, button = '') =>
    `<div class="goal-row"><span class="goal-icon">${icon}</span><div><strong>${esc(title)}<b>${esc(count)}</b></strong>${bar(done, total)}<small>${esc(where)}</small>${button}</div></div>`;
  const kind = (u?.kind ?? 'crop') as 'planet' | 'vault' | 'crop';
  const unlockWhere = !u ? t('You have opened every world, crop and the Vault. Keep collecting!')
    : kind === 'planet' ? t('A new world to land on. Earn EXP with crops, fish and creatures, then fly the starship.')
    : kind === 'vault' ? t('The five-room dungeon by the south gate. Earn EXP to be ready.')
    : t('A new seed for your garden beds. Earn EXP with crops, fish and creatures.');
  return `<div class="goals-list">`
    + placesRowHtml(s, esc)
    + row('🪐', t('Planets discovered'), `${p.done}/${p.total}`, p.done, p.total, t('Fly the starship from the launch pad and spot new worlds on the star map.'), `<button class="soft-button" data-action="discovery">${esc(t('Star map'))}</button>`)
    + row('📚', t('Collection'), `${c.pct}%`, c.done, c.total, t('Fish {fish} · Treasures {items} · Bosses {bosses}', { fish: `${c.fish.done}/${c.fish.total}`, items: `${c.items.done}/${c.items.total}`, bosses: `${c.creatures.done}/${c.creatures.total}` }), `<button class="soft-button" data-action="journal-tab" data-kind="collection">${esc(t('Collection book'))}</button>`)
    + row('⭐', t('Next unlock'), u ? t('Level {level}', { level: u.level }) : '✓', u ? Math.max(0, s.level - u.from) : 1, u ? u.level - u.from : 1, `${u ? unlockText(s) + ' · ' : ''}${unlockWhere}`)
    + `</div>`;
}

export function initGoals(hud: HTMLElement, host: Host) {
  const badge = document.createElement('button');
  badge.id = 'goals-flag'; badge.type = 'button'; badge.dataset.action = 'goals'; badge.hidden = true;
  // Right after the map panel, so it paints over the map's corner and keeps the map's place in the tab order.
  const map = hud.querySelector('.minimap');
  if (map) map.after(badge); else hud.append(badge);
  let key = '', count = -1, pulse = 0;
  return {
    chip: badge,
    update(s: Save) {
      const calm = !!s.firstRun && s.level < CALM_UNTIL_LEVEL, r = placesReached(s.placeFlags), color = safeColor(s.color);
      const next = calm ? 'calm' : `${goalsKey(s)}|${r.done}|${color}|${getLanguage()}`;
      if (next === key) return; key = next;
      badge.hidden = calm; if (calm) return;
      const p = planetGoal(s), c = collectionGoal(s);
      badge.style.setProperty('--flag', color);
      badge.innerHTML = `${FLAG_ICON}<b>${r.done}</b><small>/${r.total}</small>`;
      badge.setAttribute('aria-label', t('Goals: places reached {r}, planets {p}, collection {c}%. {next}', { r: `${r.done}/${r.total}`, p: `${p.done}/${p.total}`, c: c.pct, next: unlockText(s) }));
      badge.title = t('Goals');
      // A new flag: the badge gives a little hop (goals.css; none with reduced motion).
      if (count >= 0 && r.done > count) { badge.classList.remove('hop'); void badge.offsetWidth; badge.classList.add('hop'); clearTimeout(pulse); pulse = window.setTimeout(() => badge.classList.remove('hop'), 900); }
      count = r.done;
    },
    open(s: Save) { host.openDialog('goals', t('Your long-term goals'), goalsPanelHtml(s, host.esc), t('GOALS'), '🎯'); },
  };
}
