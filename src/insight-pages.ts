/**
 * The Village Almanac's pages as HTML strings: the analysis (scores, strengths, next steps), the product map (six
 * chapters of chains, with a detail card for the tapped item), the trend and the level report. Pure string building
 * over insight-rules.ts and insight-graph.ts; insight.ts mounts the pages and handles the taps.
 */
import { ITEMS, PLANETS } from './content.ts';
import * as M from './model.ts';
import type { PageUi } from './disguise-ui.ts';
import { barsHtml, sparkSvg } from './insight-charts.ts';
import { CHAPTERS, productGraph, isItemNode, type Cell, type ChapterId, type Group, type Row } from './insight-graph.ts';
import { ADVENTURE, SCORE_ICON, SCORE_LABEL, STRENGTH, itemView, lockOf, nextSteps, praise, report, scores, standouts, trend, type Msg, type ScoreId, type Step } from './insight-rules.ts';
import { HISTORY_CAP } from './insight-history.ts';

export interface BookUi extends PageUi { now: number; lang: string }
const fmt = (ui: BookUi, v: string | number) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString(ui.lang === 'vi' ? 'vi-VN' : 'en-US') : String(Math.round(v * 10) / 10)) : v;
let proper: Map<string, string> | null = null;
/** A name parameter in the player's language. Rules write names mid-sentence in lower case ('pink pig'): the catalogue's own spelling is looked up, translated, and lowered again. */
function name(ui: BookUi, value: string): string {
  if (!proper) { proper = new Map(); for (const item of Object.values(ITEMS)) proper.set(item.name.toLowerCase(), item.name); for (const a of Object.values(M.ANIMALS)) proper.set(a.name.toLowerCase(), a.name); }
  const known = proper.get(value); return known && known !== value ? ui.t(known).toLowerCase() : ui.t(value);
}
/** A rule's message in the player's language: names translated, big numbers grouped. */
export function say(ui: BookUi, m: Msg): string {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(m.params ?? {})) params[key] = m.names?.includes(key) && typeof value === 'string' ? name(ui, value) : fmt(ui, value);
  return ui.t(m.text, params);
}
const praiseHtml = (ui: BookUi, m: Msg) => `<div class="ins-praise"><span aria-hidden="true">🌟</span><p>${ui.esc(say(ui, m))}</p></div>`;
const stepButton = (ui: BookUi, step: Step) => { const tg = step.target, label = step.button ? ui.esc(say(ui, step.button)) : '';
  return tg && label ? `<button class="sky-button ins-go" data-insight="step" ${'go' in tg ? `data-go="${tg.go}"` : 'journal' in tg ? `data-journal="${tg.journal}"` : `data-panel="${tg.panel}"`}>${label} →</button>` : ''; };
const gainChip = (ui: BookUi, step: Step) => step.per === 'none' ? '' : `<span class="chip chip-energy">ϟ +${fmt(ui, step.gain)}${step.per === 'hour' ? ' ' + ui.esc(ui.t('an hour')) : ''}</span>`;
const stepHtml = (ui: BookUi, step: Step, rank?: number) => `<div class="ins-step">${rank ? `<span class="ins-rank" aria-hidden="true">${rank}</span>` : ''}<div><p>${ui.esc(say(ui, step.text))}</p><div class="ins-step-foot">${gainChip(ui, step)}${stepButton(ui, step)}</div></div></div>`;

/** Praise for a strong area only when it has earned it (50 or more); below that it is simply where the explorer is furthest along. */
const strengthLine = (ui: BookUi, id: ScoreId, score: number) => score >= 50 ? ui.t(STRENGTH[id]) : ui.t('{area} is where you are furthest along so far.', { area: ui.t(SCORE_LABEL[id]) });
// ---- The analysis
export function analysisHtml(ui: BookUi): string {
  const s = ui.state, list = scores(s, ui.now), marks = standouts(list), steps = nextSteps(s, ui.now), top = steps.slice(0, 3), rest = steps.slice(3);
  const rows = list.map(x => ({ label: ui.esc(ui.t(SCORE_LABEL[x.id])), icon: SCORE_ICON[x.id], value: x.score, note: ui.esc(say(ui, x.reason)),
    tone: !x.open ? '' as const : marks.strong.includes(x.id) ? 'strong' as const : marks.weak.includes(x.id) ? 'weak' as const : '' as const,
    tag: !x.open ? ui.esc(ui.t('opens later')) : marks.strong.includes(x.id) ? ui.esc(ui.t(x.score >= 50 ? 'strong' : 'furthest along')) : marks.weak.includes(x.id) ? ui.esc(ui.t('next adventure')) : '' }));
  const strong = marks.strong.map(id => `<li>${SCORE_ICON[id]} ${ui.esc(strengthLine(ui, id, list.find(x => x.id === id)!.score))}</li>`).join(''), weak = marks.weak.map(id => `<li>${SCORE_ICON[id]} ${ui.esc(ui.t(ADVENTURE[id]))}</li>`).join('');
  return praiseHtml(ui, praise(s, 'home', marks.strong[0]))
    + `<h3>${ui.esc(ui.t('What to do next'))}</h3>${top.length ? `<p class="ins-note">${ui.esc(ui.t('The three steps that would earn the most right now, with the numbers behind them.'))}</p>${top.map((step, i) => stepHtml(ui, step, i + 1)).join('')}` : `<p class="ins-note">${ui.esc(ui.t('Everything is humming along. Enjoy the valley: you have earned it.'))}</p>`}`
    + (rest.length ? `<details class="ins-more"><summary>${ui.esc(ui.t('{count} more ideas', { count: rest.length }))}</summary>${rest.map(step => stepHtml(ui, step)).join('')}</details>` : '')
    + `<h3>${ui.esc(ui.t('How the village is doing'))}</h3><p class="ins-note">${ui.esc(ui.t('Nine scores from 0 to 100, worked out from your save. They only show where the next fun is.'))}</p>`
    + `<div class="ins-two"><div class="ins-list good"><h4>${ui.esc(ui.t('Your strong points'))}</h4><ul>${strong}</ul></div><div class="ins-list care"><h4>${ui.esc(ui.t('Your next adventures'))}</h4><ul>${weak}</ul></div></div>`
    + barsHtml(rows, ui.esc(ui.t('Scores, 0 to 100')));
}

// ---- The product map
const ANIMAL_NOTE = 'Level {level} · ϟ {price}';
function tile(ui: BookUi, cell: Cell, row: Row, selected: boolean): string {
  const s = ui.state;
  if (cell.id === 'energy') return `<span class="ins-node cost" aria-label="${ui.esc(ui.t('{count} energy', { count: cell.n ?? 0 }))}"><span class="ins-node-art" aria-hidden="true">ϟ</span><b>${fmt(ui, cell.n ?? 0)}</b></span>`;
  if (cell.id.startsWith('animal:')) { const kind = cell.id.slice(7) as M.AnimalKind, a = M.ANIMALS[kind], have = M.animalCount(s, kind), locked = s.level < a.level;
    return `<span class="ins-node animal${have ? ' have' : locked ? ' unknown' : ''}"><span class="ins-node-art" aria-hidden="true">${a.icon}</span>${have ? `<i class="ins-count">${have}</i>` : ''}<small>${ui.esc(ui.t(a.name))}</small><em>${ui.esc(ui.t(ANIMAL_NOTE, { level: a.level, price: M.priceOf(s, kind) }))}</em></span>`; }
  if (!isItemNode(cell.id) || !Object.hasOwn(ITEMS, cell.id)) return '';
  const item = ITEMS[cell.id], n = (s.bag[cell.id] ?? 0) + (s.chest[cell.id] ?? 0), known = n > 0 || !!s.collection[cell.id] || Object.values(s.gear).includes(cell.id), lock = known ? null : lockOf(s, cell.id), sell = M.sellPrice(s, cell.id);
  const name = ui.esc(ui.t(item.name)), state = n > 0 ? ui.t('{count} in store', { count: n }) : known ? ui.t('met before') : ui.t('not met yet');
  return `<button class="ins-node${n > 0 ? ' have' : known ? ' known' : ' unknown'}${selected ? ' selected' : ''}" data-insight="node" data-id="${cell.id}" data-row="${ui.esc(row.id)}" aria-expanded="${selected}" aria-label="${name}${cell.n && cell.n > 1 ? ` ×${cell.n}` : ''}, ${ui.esc(state)}${sell ? `, ${ui.esc(ui.t('{count} energy', { count: sell }))}` : ''}">`
    + `<span class="ins-node-art">${ui.art(cell.id, item.icon)}</span>${cell.n && cell.n > 1 ? `<i class="ins-need">×${cell.n}</i>` : ''}${n > 0 ? `<i class="ins-count">${n > 999 ? '999+' : n}</i>` : ''}<small>${name}</small>`
    + `<em>${lock ? '🔒 ' + ui.esc(say(ui, lock)) : sell ? `ϟ ${fmt(ui, sell)}` : '&nbsp;'}</em></button>`;
}
function detailHtml(ui: BookUi, id: string): string {
  const s = ui.state, view = itemView(s, id); if (!view) return '';
  const item = ITEMS[id], g = productGraph(), uses = g.uses.get(id) ?? [];
  const becomes = [...new Set(uses.map(u => u.kind === 'plant' ? u.crop : u.kind === 'feed' ? '' : u.to).filter(Boolean))].slice(0, 10);
  const chips = [view.bag ? ui.t('{count} in your backpack', { count: view.bag }) : '', view.chest ? ui.t('{count} in the chest', { count: view.chest }) : '', !view.bag && !view.chest ? ui.t(view.known ? 'None in store right now' : 'Not met yet') : '',
    view.sell ? ui.t('Sells for {count} energy', { count: fmt(ui, view.sell) }) : '', view.heal ? ui.t(view.heal >= 9999 ? 'Heals fully' : 'Heals {count}', { count: view.heal }) : ''].filter(Boolean);
  const buff = item.buff ? Object.entries(item.buff).filter(([k]) => k !== 'time').length : 0;
  return `<div class="ins-detail" role="region" aria-label="${ui.esc(ui.t(item.name))}"><div class="ins-detail-head"><span class="ins-node-art big">${ui.art(id, item.icon)}</span><div><h4>${ui.esc(ui.t(item.name))}</h4><div class="chips">${chips.map(c => `<span class="chip">${ui.esc(c)}</span>`).join('')}${buff ? `<span class="chip chip-xp">${ui.esc(ui.t('Gives a buff for {time} s', { time: item.buff!.time }))}</span>` : ''}</div></div>`
    + `<button class="soft-button ins-close" data-insight="node-close" aria-label="${ui.esc(ui.t('Close'))}">×</button></div>`
    + (view.best ? `<p class="ins-best"><b>${ui.esc(ui.t('Best use now'))}</b> ${ui.esc(say(ui, view.best))}</p>` : '')
    + (view.lock ? `<p class="ins-lock">🔒 ${ui.esc(ui.t('How to meet it: {how}', { how: say(ui, view.lock) }))}</p>` : '')
    + (view.from.length ? `<h5>${ui.esc(ui.t('Where it comes from'))}</h5><ul>${view.from.map(line => `<li>${ui.esc(say(ui, line))}</li>`).join('')}</ul>` : '')
    + (becomes.length ? `<h5>${ui.esc(ui.t('What it becomes'))}</h5><div class="ins-mini-row">${becomes.map(to => `<span class="ins-mini"><span class="mini-art">${ui.art(to, ITEMS[to].icon)}</span>${ui.esc(ui.t(ITEMS[to].name))}</span>`).join('')}</div>` : '')
    + (uses.some(u => u.kind === 'feed') ? `<p class="ins-note">${ui.esc(ui.t('Also good as animal feed.'))}</p>` : '') + `</div>`;
}
function rowHtml(ui: BookUi, row: Row, selected: { row: string; id: string } | null): string {
  const open = selected?.row === row.id ? selected.id : null;
  const columns = row.columns.map(col => `<div class="ins-col${col.length > 2 ? ' many' : ''}">${col.map(cell => tile(ui, cell, row, open === cell.id)).join('')}</div>`).join('<span class="ins-arrow" aria-hidden="true">➜</span>');
  return `<div class="ins-row${row.columns.length === 1 ? ' single' : ''}">${row.label ? `<h5>${ui.esc(ui.t(row.label, row.labelParams))}</h5>` : ''}<div class="ins-chain">${columns}</div>${open ? detailHtml(ui, open) : ''}</div>`;
}
/** Whether a group starts open: the first of a chapter, a world already visited, and whichever holds the selected item. */
export function groupOpen(ui: BookUi, group: Group, index: number, openIds: ReadonlySet<string> | null, selected: { row: string } | null): boolean {
  if (selected && group.rows.some(r => r.id === selected.row)) return true;
  if (openIds) return openIds.has(group.id);
  return index === 0 || !!group.planet && group.planet !== 'home' && ui.state.visited.includes(group.planet) && index < 3;
}
export function mapHtml(ui: BookUi, chapterId: ChapterId, selected: { row: string; id: string } | null, openIds: ReadonlySet<string> | null): string {
  const g = productGraph(), chapter = g.chapters.find(c => c.id === chapterId) ?? g.chapters[0], s = ui.state;
  const area = chapter.id === 'workshop' ? 'workshop' : chapter.id === 'worlds' ? 'exploring' : chapter.id;
  const nav = `<nav class="ins-chapters" aria-label="${ui.esc(ui.t('Chapters'))}">${CHAPTERS.map(([id, icon, label]) => `<button class="${id === chapter.id ? 'active' : ''}" aria-pressed="${id === chapter.id}" data-insight="chapter" data-chapter="${id}"><span aria-hidden="true">${icon}</span>${ui.esc(ui.t(label))}</button>`).join('')}</nav>`;
  const groups = chapter.groups.map((group, index) => {
    const items = [...new Set(group.rows.flatMap(r => r.columns.flatMap(col => col.map(c => c.id))).filter(id => isItemNode(id) && Object.hasOwn(ITEMS, id)))], met = items.filter(id => (s.bag[id] ?? 0) + (s.chest[id] ?? 0) > 0 || s.collection[id]).length;
    const locked = group.planet && s.level < PLANETS[group.planet].level;
    return `<details class="ins-group${locked ? ' locked' : ''}" data-group="${ui.esc(group.id)}" ${groupOpen(ui, group, index, openIds, selected) ? 'open' : ''}><summary><span>${locked ? '🔒 ' : ''}${ui.esc(ui.t(group.title, group.titleParams))}</span><b>${ui.esc(ui.t('{met} of {all} met', { met, all: items.length }))}</b></summary>`
      + `${group.note ? `<p class="ins-note">${ui.esc(ui.t(group.note, group.noteParams))}</p>` : ''}<div class="ins-rows">${group.rows.map(row => rowHtml(ui, row, selected)).join('')}</div></details>`; }).join('');
  return praiseHtml(ui, praise(s, `map-${chapter.id}`, area as never)) + nav + `<p class="ins-lead">${ui.esc(ui.t(chapter.lead))}</p>`
    + `<p class="ins-note ins-key"><span class="ins-key-have">${ui.esc(ui.t('in store'))}</span><span class="ins-key-known">${ui.esc(ui.t('met before'))}</span><span class="ins-key-unknown">${ui.esc(ui.t('not met yet'))}</span> · ${ui.esc(ui.t('Tap a picture for where it comes from and its best use.'))}</p>` + groups;
}

// ---- The trend
export function trendHtml(ui: BookUi): string {
  const s = ui.state, tr = trend(s, ui.now), saved = (s.history ?? []).length;
  const card = (label: string, values: number[], color?: string) => { const first = values[0], last = values[values.length - 1], spoken = ui.t('{label}: from {from} to {to}', { label, from: fmt(ui, first), to: fmt(ui, last) });
    return `<div class="ins-trend"><div class="ins-trend-head"><strong>${ui.esc(label)}</strong><span>${fmt(ui, first)} <i aria-hidden="true">→</i> <b>${fmt(ui, last)}</b></span></div>${sparkSvg(values, ui.esc(spoken), color)}</div>`; };
  return praiseHtml(ui, praise(s, 'trend')) + `<p class="ins-lead">${ui.esc(say(ui, tr.reading))}</p>`
    + (tr.enough ? `<div class="ins-trends">${tr.lines.map((line, i) => card(ui.t(line.label), line.values, i === 0 ? '#c2540a' : '#1c6fb8')).join('')}</div>`
      + `<p class="ins-note">${ui.esc(ui.t('From level {from} to level {to}, left to right.', { from: tr.points[0].l, to: tr.points[tr.points.length - 1].l }))}</p>` : '')
    + `<p class="ins-note">${ui.esc(ui.t('{count} notes kept so far: one each time you level up and one for each day you play, the latest {cap}.', { count: saved, cap: HISTORY_CAP }))}</p>`;
}

// ---- The level report
export function reportHtml(ui: BookUi): string {
  const s = ui.state, r = report(s, ui.now);
  if (!r) return praiseHtml(ui, praise(s, 'report')) + `<p class="ins-lead">${ui.esc(ui.t('Your first report card comes at level 3, then every five levels. You are {left} levels away.', { left: Math.max(1, 3 - s.level) }))}</p>`;
  const grew = r.grew.map(g => `<li><span>${ui.esc(ui.t(g.label))}</span><b>${fmt(ui, g.from)} <i aria-hidden="true">→</i> ${fmt(ui, g.to)}</b><em>+${fmt(ui, g.to - g.from)}</em></li>`).join('');
  return `<div class="ins-report"><div class="ins-report-head"><span aria-hidden="true">🏅</span><div><h3>${ui.esc(ui.t('Level {level} report card', { level: r.level }))}</h3><small>${ui.esc(r.since ? ui.t('What grew since level {level}', { level: r.since }) : ui.t('Everything you have built so far'))}</small></div></div>`
    + praiseHtml(ui, r.praise)
    + (grew ? `<ul class="ins-grew">${grew}</ul>` : `<p class="ins-note">${ui.esc(ui.t('A calm stretch: nothing to count yet, and that is fine.'))}</p>`)
    + `<p class="ins-village">🏡 ${ui.esc(say(ui, r.village))}</p>`
    + (r.strong ? `<div class="ins-list good"><h4>${ui.esc(ui.t('Your strongest side'))}</h4><p>${SCORE_ICON[r.strong.id]} ${ui.esc(strengthLine(ui, r.strong.id, r.strong.score))} <b>${r.strong.score}/100</b></p></div>` : '')
    + (r.weak ? `<div class="ins-list care"><h4>${ui.esc(ui.t('Your next adventure'))}</h4><p>${SCORE_ICON[r.weak.id]} ${ui.esc(ui.t(ADVENTURE[r.weak.id]))}</p>${r.tip ? stepHtml(ui, r.tip) : ''}</div>` : '')
    + `<p class="ins-note">${ui.esc(ui.t('The next report card comes at level {level}.', { level: r.level < 5 ? 5 : r.level + 5 }))}</p></div>`;
}
