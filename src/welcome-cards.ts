/** A single, skippable welcome on an untouched save; dismissal is saved through firstRunSeen. */
import { t } from './i18n.ts';

export interface WelcomeCard { icon: string; art: string; title: string; body: string; params?: Record<string, string | number> }
/** The welcome message. `touch`: a phone or tablet ("Tap"), else a mouse ("Click"); `planets`: how many planets the starship reaches. */
export function welcomeCards(touch: boolean, planets: number): WelcomeCard[] {
  return [
    { icon: '🏡', art: '🌱🏡🥕', title: 'Welcome home!', body: touch ? 'Tap a garden bed to plant your first carrot.' : 'Click a garden bed to plant your first carrot.' },
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
  let saved = false;
  function render() {
    const c = welcomeCards(h.touch(), h.planets())[0], e = h.esc;
    const body = `<div class="wc-card wc-1">
      <div class="wc-art" aria-hidden="true">${c.art}</div>
      <p class="wc-text">${e(t(c.body))}</p>
      <div class="button-row wc-actions"><button class="soft-button wc-skip" data-wc="skip">${e(t('Skip'))}</button><button class="primary wc-next" data-wc="done">${e(t('Play'))}</button></div>
    </div>`;
    h.openDialog(CARDS_DIALOG, c.title, body, '', c.icon);
  }
  function save() { if (saved) return; saved = true; h.seen(); }
  document.addEventListener('click', event => {
    const what = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-wc]')?.dataset.wc; if (!what || h.modal() !== CARDS_DIALOG) return;
    event.stopPropagation();
    h.closeDialog(); // Play, Skip, × and Escape all save dismissal.
  }, true);
  return {
    show() { saved = false; render(); },
    /** main.ts closeDialog calls this when the cards' dialog closes, by Skip, the last card, × or Escape. */
    closed() { save(); },
    get open() { return h.modal() === CARDS_DIALOG; },
  };
}
