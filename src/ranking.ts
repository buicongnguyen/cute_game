/**
 * The 🏆 leaderboard: two groups (this week, all time), a row of categories, the top 50 and the player's own rank pinned
 * at the bottom. Online and signed in it reads GET api/ranking (server/ranking.mjs); in solo play (the static Pages
 * build, or not signed in) it shows the neighbourhood board, the player and the AI neighbours (ranking-logic.ts soloBoard),
 * so it is never empty. The rules live in ranking-logic.ts; this file is only the dialog.
 */
import './ranking.css';
import type { GameBridge } from './game-bridge.ts';
import { t, getLanguage, onLanguageChange } from './i18n.ts';
import { FISH } from './model.ts';
import { makeCast, parseStore } from './bot-logic.ts';
import { activeSlot, neighboursKey } from './profiles.ts';
import {
  categoriesOf, profileTotals, advanceSoloWeek, soloWeekGains, soloBoard, weekEnds, weekStart, rankingReplyKind,
  type Board, type BoardReply, type Category, type RankedEntry, type SoloWeekState,
} from './ranking-logic.ts';

const CATEGORY: Record<Category, [string, string]> = {
  exp: ['✨', 'EXP earned'], harvest: ['🌾', 'Harvests'], fish: ['🐟', 'Fish caught'], kills: ['⚔️', 'Creatures defeated'],
  boss: ['👑', 'Bosses defeated'], level: ['⭐', 'Level'], big: ['🐳', 'Biggest fish'],
};
const BOARDS: Array<[Board, string, string]> = [['weekly', '📅', 'This week'], ['all', '🌏', 'All time']];
/** Neighbours in the solo board: as many as bots.ts walks around (its COUNT). */
const NEIGHBOURS = 5;
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* the week starts again next visit */ } };
const weekKeyFor = () => `cute-game-ranking-week-v1-slot${activeSlot() + 1}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };

export const formatSize = (cm: number) => cm >= 100 ? `${(cm / 100).toFixed(2).replace(/\.?0+$/, '')} m` : `${cm} cm`;
/** The number a row shows for its category. */
export function formatValue(entry: Pick<RankedEntry, 'value' | 'fish' | 'level'>, cat: Category, lang = getLanguage()) {
  const number = (n: number) => Math.floor(n).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
  if (cat === 'level') return t('Lv {level}', { level: entry.level });
  if (cat === 'big') return `${formatSize(entry.value)}${entry.fish && FISH[entry.fish] ? ` · ${t(FISH[entry.fish].name)}` : ''}`;
  if (cat === 'exp') return `${number(entry.value)} EXP`;
  return number(entry.value);
}
function untilReset(now: number) {
  const left = Math.max(0, weekEnds(now) - now), hours = Math.floor(left / 3_600_000), minutes = Math.floor(left / 60_000) % 60;
  return hours >= 24 ? t('{days}d {hours}h', { days: Math.floor(hours / 24), hours: hours % 24 }) : t('{hours}h {minutes}m', { hours, minutes });
}

export function initRanking(game: GameBridge) {
  const staticHost = import.meta.env.VITE_STATIC_HOST === 'true';
  let board: Board = 'weekly', cat: Category = 'exp', reply: BoardReply | null = null, status: 'loading' | 'error' | 'ready' = 'loading', solo = staticHost, request = 0;
  /** No game server behind this page (the Vite dev server, a static host): learnt from the first reply, kept for the session. */
  let noServer = staticHost;

  // ---- The player's own weekly gains in solo play: a snapshot of lifetime totals, moved on now and then ----
  let week: SoloWeekState | null = null;
  try { week = JSON.parse(read(weekKeyFor()) ?? 'null'); } catch { week = null; }
  const snapshot = () => { try { week = advanceSoloWeek(week, profileTotals(game.getState()), Date.now()); write(weekKeyFor(), JSON.stringify(week)); } catch { /* no state yet */ } };
  snapshot(); window.setInterval(() => { if (!document.hidden) snapshot(); }, 60_000);

  function localBoard(): BoardReply {
    snapshot();
    const state = game.getState(), now = Date.now(), seed = parseStore(read(neighboursKey()), 0x5eed).seed;
    return soloBoard(state, soloWeekGains(week!, profileTotals(state)), makeCast(seed, NEIGHBOURS), seed, board, cat, now);
  }

  // ---- The dialog ----
  const dialog = el('dialog', 'social-dialog ranking-dialog'); dialog.id = 'ranking-dialog';
  const header = el('header', 'social-header'), heading = el('h2'), close = el('button', 'social-close', '✕');
  close.type = 'button'; close.addEventListener('click', () => dialog.close()); header.append(heading, close);
  const tabs = el('nav', 'ranking-tabs'), chips = el('nav', 'ranking-cats'), hint = el('p', 'ranking-hint'), list = el('ol', 'ranking-list'), mine = el('footer', 'ranking-mine');
  list.setAttribute('aria-live', 'polite');
  dialog.append(header, tabs, chips, hint, list, mine); document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(), e = event as MouseEvent; if (e.clientX && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); } });

  const button = (label: string, action: () => void, className = '') => { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', action); return node; };
  function row(entry: RankedEntry, me: boolean) {
    const item = el('li', `ranking-row${entry.rank <= 3 ? ' top' : ''}${me ? ' me' : ''}`);
    const place = el('span', 'ranking-place', ['🥇', '🥈', '🥉'][entry.rank - 1] ?? `#${entry.rank}`);
    const who = el('span', 'ranking-who'), name = el('b', '', entry.name), dot = el('i', 'ranking-dot');
    if (entry.color) dot.style.background = entry.color;
    name.prepend(dot); if (me) name.append(el('span', 'ranking-you', t('You')));
    who.append(name, el('small', '', `${t('Lv {level}', { level: entry.level })}${entry.bot ? ` · ${t('neighbour')}` : ''}`));
    item.append(place, who, el('strong', 'ranking-value', entry.value > 0 ? formatValue(entry, cat) : '—'));
    return item;
  }
  function render() {
    heading.textContent = `🏆 ${t('Leaderboard')}`; close.setAttribute('aria-label', t('Close the leaderboard')); dialog.setAttribute('aria-label', t('Leaderboard'));
    tabs.replaceChildren(...BOARDS.map(([id, icon, label]) => { const b = button(`${icon} ${t(label)}`, () => { if (board === id) return; board = id; cat = categoriesOf(id)[0]; void load(); }); b.setAttribute('aria-pressed', String(board === id)); return b; }));
    chips.replaceChildren(...categoriesOf(board).map(id => { const [icon, label] = CATEGORY[id], b = button(`${icon} ${t(label)}`, () => { if (cat === id) return; cat = id; void load(); }); b.setAttribute('aria-pressed', String(cat === id)); return b; }));
    const now = Date.now();
    hint.textContent = board === 'weekly' ? t('Week from Monday {date} · resets in {time}. The weekly score is what you gained since the week began.', { date: new Date(weekStart(now)).toISOString().slice(0, 10).split('-').reverse().join('/'), time: untilReset(now) }) : '';
    hint.hidden = board !== 'weekly';
    list.replaceChildren(); mine.replaceChildren(); mine.hidden = true;
    if (status === 'loading') { list.append(el('li', 'ranking-empty', `⏳ ${t('Loading the leaderboard…')}`)); return; }
    if (status === 'error' || !reply) {
      const box = el('li', 'ranking-empty'); box.append(el('p', '', `📴 ${t('The leaderboard could not be loaded. Check your connection.')}`));
      const acts = el('div', 'ranking-actions'); acts.append(button(t('Try again'), () => void load(), 'social-primary'), button(t('Show the neighbourhood board'), () => { solo = true; void load(); }));
      box.append(acts); list.append(box); return;
    }
    const meId = reply.me?.id;
    if (!reply.top.length) { const box = el('li', 'ranking-empty'); box.append(el('p', '', t('Nobody is on this board yet.')), el('small', '', t('Be the first!'))); list.append(box); }
    for (const entry of reply.top) list.append(row(entry, entry.id === meId));
    if (reply.solo) list.append(el('li', 'ranking-note', `${t('Neighbourhood board: you and the neighbours who live nearby.')}${noServer ? '' : ' ' + t('Sign in under Play together to join the server leaderboard.')}`));
    else list.append(el('li', 'ranking-note', t('Server leaderboard · refreshed about every minute')));
    if (reply.me) {
      const [, label] = CATEGORY[cat];
      mine.hidden = false;
      mine.append(el('span', '', `${t('Your rank ({category})', { category: t(label) })}: `), el('b', '', reply.me.rank ? `#${reply.me.rank}` : t('not ranked yet')), el('span', '', ` / ${t('{count} players', { count: reply.players })}`));
      if (reply.me.rank) mine.append(el('em', '', formatValue({ value: reply.me.value, level: reply.top.find(e => e.id === meId)?.level ?? game.getState().level, fish: reply.top.find(e => e.id === meId)?.fish }, cat)));
    }
  }
  async function load() {
    const ticket = ++request;
    if (solo) { reply = localBoard(); status = 'ready'; render(); return; }
    status = 'loading'; render();
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/ranking?board=${board}&cat=${cat}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const kind = rankingReplyKind(response.status, response.headers.get('content-type'));
      if (ticket !== request) return;
      // No API here (dev server or static host): the neighbourhood board, at once and from now on.
      if (kind === 'absent' || kind === 'down') { if (kind === 'absent') noServer = true; solo = true; reply = localBoard(); status = 'ready'; render(); return; }
      if (kind === 'error') throw new Error(String(response.status));
      const data = await response.json() as BoardReply;
      if (ticket !== request) return;
      // Not signed in: the server board has no place for this player, so show the neighbourhood instead.
      if (!data.me) { solo = true; reply = localBoard(); } else reply = data;
      status = 'ready';
    } catch { if (ticket !== request) return; status = 'error'; reply = null; }
    render();
  }
  function open() { if (!noServer) solo = false; render(); if (!dialog.open) dialog.showModal(); void load(); }

  const trigger = document.querySelector<HTMLButtonElement>('#hud [data-action="ranking"]');
  trigger?.addEventListener('click', open);
  const label = () => { if (trigger) { trigger.title = t('Ranking'); trigger.setAttribute('aria-label', t('Leaderboard')); } if (dialog.open) render(); };
  label(); onLanguageChange(label);
  return { open, close: () => dialog.close() };
}
