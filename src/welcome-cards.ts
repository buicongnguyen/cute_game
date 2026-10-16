/**
 * The welcome cards (FIX-PLAN 4.6): three short cards before a brand-new save's first steps: who you are, what the game
 * is, what to do now. Only on an untouched save (first-run.ts welcomeCardsDue: never on older saves, never on an online
 * account that already played). Skip on every card; skipping, finishing or closing the dialog saves 'cards' as seen
 * (the firstRunSeen action, so the server and other devices agree) and they never show again.
 * Drawn in the game's own dialog shell (openDialog) with the cute look of the other cards; at most two lines of body
 * text each on a phone.
 */
import { t } from './i18n.ts';

export interface WelcomeCard { icon: string; art: string; title: string; body: string; params?: Record<string, string | number> }
/** The three cards. `touch`: a phone or tablet ("Tap"), else a mouse ("Click"); `planets`: how many planets the starship reaches. */
export function welcomeCards(touch: boolean, planets: number): WelcomeCard[] {
  return [
    { icon: '🏡', art: '🌷🏡🌳', title: "You're the new keeper of Clover Village", body: 'The garden, the cottage and the starship are yours now. Welcome home!' },
    { icon: '🌍', art: '🥕🐾🚀', title: 'A little world to grow', body: 'Grow food, explore the wilds, befriend pets and fly to {n} planets.', params: { n: planets } },
    { icon: '🥕', art: '🌱⏱️🥕', title: 'First, plant a carrot', body: touch ? 'Tap a garden bed to plant. Your first crops grow in 20 seconds!' : 'Click a garden bed to plant. Your first crops grow in 20 seconds!' },
  ];
}

export interface WelcomeCardsHost {
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  closeDialog(): void;
  modal(): string | null;
  /** Saves 'cards' as seen (the firstRunSeen action). */
  seen(): void;
  touch(): boolean;
  planets(): number;
  tone(kind: string): void;
  esc(text: string): string;
}
export const CARDS_DIALOG = 'welcome-cards';

export function initWelcomeCards(h: WelcomeCardsHost) {
  let step = 0, saved = false;
  function render() {
    const cards = welcomeCards(h.touch(), h.planets()), c = cards[step], last = step === cards.length - 1, e = h.esc;
    const dots = cards.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
    const body = `<div class="wc-card wc-${step + 1}">
      <div class="wc-art" aria-hidden="true">${c.art}</div>
      <p class="wc-text">${e(t(c.body, c.params))}</p>
      <div class="wc-dots" role="img" aria-label="${e(t('Card {n} of {total}', { n: step + 1, total: cards.length }))}">${dots}</div>
      <div class="button-row wc-actions"><button class="soft-button wc-skip" data-wc="skip">${e(t('Skip'))}</button><button class="primary wc-next" data-wc="${last ? 'done' : 'next'}">${e(t(last ? "Let's grow!" : 'Next'))}</button></div>
    </div>`;
    h.openDialog(CARDS_DIALOG, c.title, body, t('WELCOME · {n} / {total}', { n: step + 1, total: cards.length }), c.icon);
    if (last) h.tone('quest');
  }
  function save() { if (saved) return; saved = true; h.seen(); }
  document.addEventListener('click', event => {
    const what = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-wc]')?.dataset.wc; if (!what || h.modal() !== CARDS_DIALOG) return;
    event.stopPropagation();
    if (what === 'next') { step = Math.min(step + 1, 2); h.tone('click'); render(); } else h.closeDialog(); // skip and done: closing saves (closed())
  }, true);
  return {
    show() { step = 0; saved = false; render(); },
    /** main.ts closeDialog calls this when the cards' dialog closes, by Skip, the last card, × or Escape. */
    closed() { save(); },
    get open() { return h.modal() === CARDS_DIALOG; },
  };
}
