/**
 * The daily welcome-back card (FIX-PLAN 5.2): on the first visit of each local day, one cheerful card with the check-in
 * streak and today's reward (the Journal's own "Daily check-in" entry, claimed through the same claimProgress action, so
 * online it goes through the server like a Journal tap), today's Colossus, waiting rescue calls and the Vault runs left.
 * Bolt's "while you were away" news joins the card instead of showing as a separate toast.
 * Never on a brand-new save's first session (Pepper's welcome is that day's moment) and never during a fight: it waits
 * for a calm moment. It ignores the "announcements as pop-ups" setting on purpose: it is the one celebrated daily moment.
 */
import { t } from './i18n.ts';
import type { SaveState } from './model.ts';
import { progressEntries, type ProgressEntry } from './progression.ts';
import { colossusClock, clockText } from './colossus-content.ts';
import { runsLeft, DUNGEON } from './dungeon-rules.ts';
import { DUNGEON_LEVEL } from './dungeon-content.ts';
import { fullWinsLeft } from './rescue-claim.ts';
import { COLOSSUS_LEVEL } from './colossus-sleep.ts';

export const WELCOME_BACK_KEY = 'zoo-welcome-back';
/** The player's local calendar day ("2026-10-15"), not UTC: the card greets a new morning where the player lives. */
export const localDay = (now: number) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Due on a new local day, unless this session began a brand-new save (the welcome gift was pending at start). */
export const welcomeBackDue = (seenDay: string | null, today: string, newSave: boolean) => !newSave && seenDay !== today;

export interface WelcomeLine { icon: string; text: string; kind: 'colossus' | 'rescue' | 'vault' | 'away' }
export interface WelcomeFacts { checkIn: ProgressEntry | null; streak: number; lines: WelcomeLine[] }
/** What the card says at `now` (pure: tests and the card share it). `rescueCall`: a rescue call is waiting at the portal. */
export function welcomeFacts(s: SaveState, now: number, o: { colossusAsleep?: boolean; rescueCall?: boolean; away?: { text: string; icon: string }[] } = {}): WelcomeFacts {
  const checkIn = progressEntries(s, 'daily', now).find(e => e.id.endsWith(':login')) ?? null, lines: WelcomeLine[] = [];
  if (s.level >= COLOSSUS_LEVEL) { // below level 20 the Colossus sleeps for this explorer (colossus-sleep.ts): no line about it
    const c = colossusClock(now);
    lines.push({ icon: '🌋', kind: 'colossus', text: o.colossusAsleep ? t('The Colossus sleeps under the Ember Well lid.') : c.phase === 'active' ? t('The Colossus is awake now · {time} left', { time: clockText(c.left) }) : t('The Colossus wakes in {time}', { time: clockText(c.left) }) });
  }
  const wins = fullWinsLeft(s, now);
  lines.push({ icon: '🛟', kind: 'rescue', text: o.rescueCall ? t('A rescue call is waiting at the portal!') : t('Rescue Call: {n} full rewards left today', { n: wins }) });
  lines.push({ icon: '🗝️', kind: 'vault', text: s.level >= DUNGEON_LEVEL ? t("Delvers' Vault: {n} / {max} runs left today", { n: runsLeft(s, now), max: DUNGEON.perDay }) : t("Delvers' Vault opens at level {level}", { level: DUNGEON_LEVEL }) });
  for (const a of o.away ?? []) lines.push({ icon: a.icon, kind: 'away', text: a.text });
  // The streak the claim would make (the entry's description holds the stored one).
  const streak = checkIn && !checkIn.claimed && s.progression.login.day === new Date(now - 86400000).toISOString().slice(0, 10) ? s.progression.login.streak + 1 : checkIn?.claimed ? s.progression.login.streak : 1;
  return { checkIn, streak, lines };
}

export interface WelcomeHost {
  state(): SaveState;
  /** The game has started, nothing is open, no fight is near: the card may show. */
  calm(): boolean;
  /** The session began with Pepper's welcome gift pending (a brand-new save). */
  newSave(): boolean;
  colossusAsleep(): boolean;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  closeDialog(): void;
  modal(): string | null;
  perform(type: string, payload: Record<string, unknown>): Promise<unknown>;
  toast(text: string, icon?: string): void;
  tone(kind: string): void;
  esc(text: string): string;
  saveKey(): string;
}
export interface WelcomeBackApi {
  /** Bolt's catch-up news: true when the card takes it (shown or still to come today), false to toast it as before. */
  absorb(text: string, icon?: string): boolean;
  /** Development hook: show the card now (ignores the day). */
  show(): void;
  readonly open: boolean;
}

const CARD = 'welcome-back';
export function initWelcomeBack(h: WelcomeHost): WelcomeBackApi {
  const away: { text: string; icon: string }[] = [];
  let timer: ReturnType<typeof setInterval> | null = null, waiting = false, started = 0;
  const key = () => `${WELCOME_BACK_KEY}:${h.saveKey()}`;
  const seen = () => { try { return localStorage.getItem(key()); } catch { return null; } };
  const mark = () => { try { localStorage.setItem(key(), localDay(Date.now())); } catch { /* optional */ } };
  function rescueCall() { try { const v = JSON.parse(localStorage.getItem('zoo-rescue-sos') ?? 'null'); return !!v?.call && (!v.call.until || v.call.until > Date.now()); } catch { return false; } }
  function render() {
    const s = h.state(), f = welcomeFacts(s, Date.now(), { colossusAsleep: h.colossusAsleep(), rescueCall: rescueCall(), away }), c = f.checkIn, e = h.esc;
    const ready = !!c && c.complete && !c.claimed;
    const dots = Array.from({ length: 7 }, (_, i) => `<i class="${i < ((f.streak - 1) % 7) + 1 ? 'on' : ''}${i === 6 ? ' big' : ''}"></i>`).join('');
    const body = `<div class="wb-card">
      <div class="wb-streak"><div class="wb-flame" aria-hidden="true">🔥</div><div><b>${e(t('{count} consecutive days', { count: f.streak }))}</b><div class="wb-dots" aria-hidden="true">${dots}</div></div></div>
      ${c ? `<div class="wb-reward"><span class="wb-label">${e(t("Today's check-in"))}</span><span class="wb-gift">${e(c.rewardLabel)}</span></div>` : ''}
      <ul class="wb-lines">${f.lines.map(l => `<li class="wb-${l.kind}"><span aria-hidden="true">${l.icon}</span><span>${e(l.text)}</span></li>`).join('')}</ul>
      <div class="button-row wb-actions">${ready ? `<button class="primary wb-collect" data-wb="collect">🎁 ${e(t('Collect'))}</button>` : `<button class="primary wb-collect" disabled>${e(t('Collected'))}</button>`}<button class="soft-button" data-wb="close">${e(t('Close'))}</button></div>
    </div>`;
    h.openDialog(CARD, t('Welcome back!'), body, t('A NEW DAY'), '☀️');
  }
  async function collect() {
    const c = welcomeFacts(h.state(), Date.now()).checkIn; if (!c || c.claimed || !c.complete) { h.closeDialog(); return; }
    if (await h.perform('claimProgress', { kind: 'daily', id: c.id })) { h.tone('quest'); h.toast(t('Check-in reward collected!'), '🎁'); }
    h.closeDialog();
  }
  document.addEventListener('click', event => {
    const what = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-wb]')?.dataset.wb; if (!what || h.modal() !== CARD) return;
    event.stopPropagation(); if (what === 'collect') void collect(); else h.closeDialog();
  }, true);
  function poll() {
    if (!waiting) return;
    if (Date.now() - started < 2800 || !h.calm()) return; // a moment to land (and for Bolt's news), and never mid-fight
    waiting = false; if (timer) { clearInterval(timer); timer = null; }
    mark(); render();
  }
  function begin() {
    if (!welcomeBackDue(seen(), localDay(Date.now()), h.newSave())) { if (h.newSave()) mark(); return; }
    waiting = true; started = Date.now(); timer = setInterval(poll, 700);
  }
  begin();
  return {
    absorb(text, icon = '🤖') { if (h.modal() === CARD) { away.push({ text, icon }); render(); return true; } if (waiting) { away.push({ text, icon }); return true; } return false; },
    show() { waiting = false; if (timer) { clearInterval(timer); timer = null; } render(); },
    get open() { return h.modal() === CARD; },
  };
}
