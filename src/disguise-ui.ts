/**
 * The disguise strength pictures (disguise-profile.ts) as HTML: the small card for the outfitters and the backpack,
 * the Almanac's Disguises chapter (all seventeen, sortable) and the detail page with the numbers behind each axis and
 * the two-profile comparison. Pure string building: insight.ts mounts it and handles the taps.
 */
import { ITEMS, DISGUISES } from './content.ts';
import type { SaveState } from './model.ts';
import { AXES, AXIS_LABEL, AXIS_NOTE, ROLE_LABEL, DISGUISE_IDS, allProfiles, axisBest, profile, type Axis, type DisguiseProfile } from './disguise-profile.ts';
import { skillDescription } from './skill-info.ts';
import { radarSvg, barsHtml, legendHtml } from './insight-charts.ts';

export interface PageUi { t(text: string, params?: Record<string, string | number>): string; esc(text: string): string; art(id: string, icon: string): string; state: SaveState }
export type DzSort = Axis | 'total';
const AXIS_ICON: Record<Axis, string> = { damage: '⚔️', burst: '💥', area: '🌀', control: '💫', survival: '🛡️', mobility: '💨' };
const owns = (s: SaveState, id: string) => (s.bag[id] ?? 0) > 0 || (s.chest[id] ?? 0) > 0 || s.gear.disguise === id;
/** The weapon in hand when it fights in a disguise (model.ts weaponStats: a held weapon that is not a rod). */
export function heldWeapon(s: SaveState) { const id = s.gear.weapon, w = id ? ITEMS[id]?.weapon : undefined; return id && w && w.kind !== 'rod' ? { id, weapon: w } : null; }
const values = (p: DisguiseProfile) => AXES.map(axis => p.scores[axis]);
const name = (ui: PageUi, id: string) => ui.esc(ui.t(ITEMS[id]?.name ?? DISGUISES[id].name));
const labels = (ui: PageUi) => AXES.map(axis => ui.esc(ui.t(AXIS_LABEL[axis])));
const number = (n: number) => String(Math.round(n * 10) / 10);

/** The small block on a disguise's shop row and backpack detail: role, a mini radar, the six numbers and a way in. */
export function disguiseSlotHtml(ui: PageUi, id: string): string {
  if (!DISGUISE_IDS.includes(id)) return '';
  const p = profile(id), worn = ui.state.gear.disguise;
  const rows = AXES.map(axis => `<li><span>${AXIS_ICON[axis]} ${ui.esc(ui.t(AXIS_LABEL[axis]))}</span><i aria-hidden="true"><b style="width:${p.scores[axis]}%"></b></i><strong>${p.scores[axis]}</strong></li>`).join('');
  return `<div class="dz-slot-card" data-i18n-skip><div class="dz-slot-head"><span class="chip dz-role">${ui.esc(ui.t(ROLE_LABEL[p.role]))}</span><button class="soft-button dz-more" data-insight="dz-open" data-id="${id}"${worn && worn !== id ? ` data-compare="${worn}"` : ''}>📊 ${ui.esc(ui.t(worn && worn !== id ? 'Compare with mine' : 'Strengths'))}</button></div>`
    + `<div class="dz-slot-body">${radarSvg({ labels: labels(ui), series: [{ values: values(p), name: name(ui, id) }], compact: true, title: ui.esc(ui.t('Strength of {name}', { name: ui.t(ITEMS[id].name) })) })}<ul class="dz-mini">${rows}</ul></div></div>`;
}

/** The chapter: seventeen cards side by side, strongest first on the chosen axis; owned ones are marked. */
export function disguiseChapterHtml(ui: PageUi, sort: DzSort): string {
  const all = allProfiles(), score = (p: DisguiseProfile) => sort === 'total' ? p.total : p.scores[sort];
  const sorted = [...all].sort((a, b) => score(b) - score(a) || DISGUISE_IDS.indexOf(a.id) - DISGUISE_IDS.indexOf(b.id));
  const sortButton = (key: DzSort, label: string, icon = '') => `<button class="${sort === key ? 'active' : ''}" aria-pressed="${sort === key}" data-insight="dz-sort" data-axis="${key}">${icon ? icon + ' ' : ''}${ui.esc(ui.t(label))}</button>`;
  const owned = all.filter(p => owns(ui.state, p.id)).length;
  return `<p class="ins-lead">${ui.esc(ui.t('Seventeen disguises, seventeen ways to fight. Each picture is worked out from the real skill numbers, so you can choose with open eyes.'))}</p>`
    + `<p class="ins-note">${ui.esc(ui.t('You own {count} of {total}. A score of 100 is the best disguise at that strength.', { count: owned, total: all.length }))}</p>`
    + `<div class="ins-sort" role="group" aria-label="${ui.esc(ui.t('Sort by'))}"><span>${ui.esc(ui.t('Sort by'))}</span>${sortButton('total', 'All round')}${AXES.map(axis => sortButton(axis, AXIS_LABEL[axis], AXIS_ICON[axis])).join('')}</div>`
    + `<div class="dz-grid">${sorted.map((p, i) => { const mine = owns(ui.state, p.id), worn = ui.state.gear.disguise === p.id, item = ITEMS[p.id];
      return `<button class="dz-card${mine ? ' owned' : ''}${worn ? ' worn' : ''}" data-insight="dz-open" data-id="${p.id}" aria-label="${name(ui, p.id)}, ${ui.esc(ui.t(ROLE_LABEL[p.role]))}, ${ui.esc(ui.t(sort === 'total' ? 'All round' : AXIS_LABEL[sort]))} ${sort === 'total' ? Math.round(p.total / AXES.length) : p.scores[sort]}">`
        + `<span class="dz-rank">${i + 1}</span><span class="dz-face">${ui.art(p.id, item.icon)}</span><strong>${name(ui, p.id)}</strong><small>${ui.esc(ui.t(ROLE_LABEL[p.role]))}</small>`
        + radarSvg({ labels: labels(ui), series: [{ values: values(p), name: name(ui, p.id) }], compact: true, title: name(ui, p.id) })
        + `<span class="dz-score">${sort === 'total' ? '' : AXIS_ICON[sort] + ' '}<b>${sort === 'total' ? Math.round(p.total / AXES.length) : p.scores[sort]}</b></span>`
        + `${worn ? `<span class="chip chip-seed">${ui.esc(ui.t('Wearing'))}</span>` : mine ? `<span class="chip chip-seed">${ui.esc(ui.t('Owned'))}</span>` : `<span class="chip chip-lock">${ui.esc(ui.t('Not yet yours'))}</span>`}</button>`; }).join('')}</div>`;
}

/** One disguise in full: the radar (with your weapon, or against another disguise), each axis in words, and every skill's part. */
export function disguiseDetailHtml(ui: PageUi, id: string, compare: string | null): string {
  if (!DISGUISE_IDS.includes(id)) return '';
  const held = heldWeapon(ui.state), base = profile(id), yours = held ? profile(id, held.weapon) : null, other = compare && compare !== id && DISGUISE_IDS.includes(compare) ? profile(compare, held?.weapon) : null;
  const shown = other ? (yours ?? base) : base, second = other ?? yours, best = axisBest(), worn = ui.state.gear.disguise, item = ITEMS[id];
  const secondName = other ? name(ui, other.id) : held ? ui.esc(ui.t('With your {weapon}', { weapon: ui.t(ITEMS[held.id].name) })) : '';
  const firstName = other || !yours ? name(ui, id) : ui.esc(ui.t('With its own weapon'));
  const series = [{ values: values(shown), name: firstName }, ...(second ? [{ values: values(second), name: secondName }] : [])];
  const points = (axis: Axis, raw: number) => best[axis] > 0 ? Math.round(raw / best[axis] * 100) : 0;
  const topBurst = base.skills.reduce((a, b) => b.adds.burst > a.adds.burst ? b : a);
  const skillRows = base.skills.map(line => {
    const chips = AXES.filter(axis => axis === 'burst' ? line === topBurst && line.adds.burst > 0 : line.adds[axis] > 0).map(axis => `<span class="chip dz-add">${AXIS_ICON[axis]} ${ui.esc(ui.t(AXIS_LABEL[axis]))} +${points(axis, line.adds[axis])}</span>`).join('');
    const f = line.facts, facts = [f.damage ? ui.t('×{n} damage on one creature', { n: number(f.damage) }) : '', f.area ? ui.t('{n} m² of ground', { n: Math.round(f.area) }) : '',
      (f.hard ?? 0) + (f.soft ?? 0) > 0 ? ui.t('{n} s of control', { n: number((f.hard ?? 0) + (f.soft ?? 0)) }) : '', f.heal ? ui.t('{n}% health back', { n: number(f.heal * 100) }) : '',
      (f.safe ?? 0) > 0 ? ui.t('{n} s untouchable', { n: number(f.safe!) }) : '', f.move ? ui.t('{n} m moved', { n: number(f.move) }) : '', f.speed ? ui.t('+{n}% speed for {time} s', { n: Math.round(f.speed.bonus * 100), time: number(f.speed.time) }) : ''].filter(Boolean).join(' · ');
    return `<div class="dz-skill"><span class="dz-skill-icon" aria-hidden="true">${line.icon}</span><div><strong>${ui.esc(ui.t(line.name))} <small>${ui.esc(ui.t('{cd} s cooldown', { cd: number(line.cd) }))}</small></strong><p>${ui.esc(skillDescription(line.index, { disguise: id }))}</p>${facts ? `<p class="dz-facts">${ui.esc(facts)}</p>` : ''}<div class="chips">${chips}</div></div></div>`; }).join('');
  const basicLine = (p: DisguiseProfile) => ui.t('Basic attack: ×{hit} every {cd} s, reach {reach} m', { hit: number(p.basic.hit), cd: number(p.weapon.cd), reach: number(p.basic.reach) });
  const options = DISGUISE_IDS.filter(x => x !== id).map(x => `<option value="${x}" ${other?.id === x ? 'selected' : ''}>${name(ui, x)}${owns(ui.state, x) ? ' ✓' : ''}</option>`).join('');
  const rows = AXES.map(axis => ({ label: ui.esc(ui.t(AXIS_LABEL[axis])), icon: AXIS_ICON[axis], value: shown.scores[axis], other: second?.scores[axis], note: ui.esc(ui.t(AXIS_NOTE[axis])),
    tone: base.strong.includes(axis) ? 'strong' as const : base.weak.includes(axis) ? 'weak' as const : '' as const, tag: base.strong.includes(axis) ? ui.esc(ui.t('strong')) : base.weak.includes(axis) ? ui.esc(ui.t('room to grow')) : '' }));
  return `<div class="dz-detail"><div class="dz-hero"><span class="dz-face big">${ui.art(id, item.icon)}</span><div><h3>${name(ui, id)}</h3><div class="chips"><span class="chip dz-role">${ui.esc(ui.t(ROLE_LABEL[base.role]))}</span>`
    + `<span class="chip">${ui.esc(ui.t(base.ranged ? 'Fights from range' : 'Fights up close'))}</span>${worn === id ? `<span class="chip chip-seed">${ui.esc(ui.t('Wearing'))}</span>` : owns(ui.state, id) ? `<span class="chip chip-seed">${ui.esc(ui.t('Owned'))}</span>` : `<span class="chip chip-lock">${ui.esc(ui.t('Not yet yours'))}</span>`}</div></div></div>`
    + `<div class="dz-compare"><label for="dz-compare">${ui.esc(ui.t('Compare with'))}</label><select id="dz-compare" data-insight-select="dz-compare" data-id="${id}"><option value="">${ui.esc(ui.t(held ? 'My weapon only' : 'Nothing'))}</option>${options}</select>`
    + `${worn && worn !== id ? `<button class="sky-button" data-insight="dz-open" data-id="${id}" data-compare="${other?.id === worn ? '' : worn}" aria-pressed="${other?.id === worn}">${ui.esc(ui.t('What I wear'))}</button>` : ''}</div>`
    + `<div class="dz-chart">${radarSvg({ labels: labels(ui), series, title: ui.esc(ui.t('Strength of {name}', { name: ui.t(item.name) })) })}${second ? legendHtml([firstName, secondName]) : ''}</div>`
    + (other && held ? `<p class="ins-note">${ui.esc(ui.t('Both are shown with your {weapon} in hand.', { weapon: ui.t(ITEMS[held.id].name) }))}</p>` : '')
    + (!held ? `<p class="ins-note">${ui.esc(ui.t('Shown with its own weapon. Hold a weapon and the picture adds yours.'))}</p>` : '')
    + `<p class="dz-hint good">👍 ${ui.esc(ui.t(base.best))}</p>${base.care ? `<p class="dz-hint care">🌱 ${ui.esc(ui.t(base.care))}</p>` : ''}`
    + barsHtml(rows, ui.esc(ui.t('Scores, 0 to 100')))
    + `<h4>${ui.esc(ui.t('The numbers behind it'))}</h4><p class="ins-note">${ui.esc(ui.t('Every ten seconds of fighting, with each skill used as soon as it is ready. +points show what a skill adds to a score.'))}</p>`
    + `<div class="dz-skill basic"><span class="dz-skill-icon" aria-hidden="true">👊</span><div><strong>${ui.esc(basicLine(base))}</strong>${yours ? `<p>${ui.esc(ui.t('With your {weapon}', { weapon: ui.t(ITEMS[held!.id].name) }))}: ${ui.esc(basicLine(yours))}</p>` : ''}<div class="chips"><span class="chip dz-add">${AXIS_ICON.damage} ${ui.esc(ui.t(AXIS_LABEL.damage))} +${points('damage', base.basicShare.damage)}</span>${base.passive > 0 ? `<span class="chip dz-add">${AXIS_ICON.survival} ${ui.esc(ui.t('Life steal'))} +${points('survival', base.passive)}</span>` : ''}</div></div></div>`
    + skillRows + `</div>`;
}
