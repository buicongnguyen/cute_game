import { t, onLanguageChange } from './i18n.ts';

/**
 * Two slow ways into the game, each with a way out (the owner's request, 2026-10-14):
 * - an app's built-in browser (Facebook, Messenger, Zalo, Instagram, TikTok, KakaoTalk, LINE, Android WebViews):
 *   weaker 3D and no full screen, so a banner offers the real browser (Chrome straight away on Android);
 * - the game framed inside another page: a button opens it in its own tab.
 * Its styles (open-outside.css) are loaded by platform.ts, so this file loads in Node tests.
 * Dismissing hides the banner for this visit.
 */
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Zalo|KAKAOTALK|Line\/|musical_ly|TikTok|BytedanceWebview|Snapchat|Twitter|; wv\)/i;

export function inAppBrowser(ua = globalThis.navigator?.userAgent ?? '') { return IN_APP.test(ua); }
export function framed(win: Window | undefined = globalThis.window) {
  try { return !!win && win.self !== win.top; } catch { return true; } // a cross-origin parent throws: framed
}
export const isAndroid = (ua = globalThis.navigator?.userAgent ?? '') => /Android/i.test(ua);
/** An Android intent that opens this address in Chrome, falling back to the address itself when Chrome is missing. */
export function chromeIntent(href: string) {
  const url = new URL(href), fallback = encodeURIComponent(href);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash.replace('#', '%23')}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

export function initOpenOutside() {
  const app = inAppBrowser(), frame = !app && framed();
  if (!app && !frame) return;
  try { if (sessionStorage.getItem('zoo-open-outside') === 'closed') return; } catch { /* storage blocked: show it */ }
  const bar = document.createElement('div'); bar.className = 'open-outside'; bar.setAttribute('role', 'status');
  const text = document.createElement('span'), go = document.createElement('button'), close = document.createElement('button');
  go.type = 'button'; close.type = 'button'; close.className = 'open-outside-close'; close.textContent = '✕';
  const label = () => {
    text.textContent = app ? (isAndroid() ? t('For smooth play, open in Chrome.') : t('For smooth play, open in your browser: tap ⋯ and then Open in browser.')) : t('The game runs smoother on its own page.');
    go.textContent = app ? (isAndroid() ? t('Open in Chrome') : t('Copy link')) : t('Play full screen');
    close.setAttribute('aria-label', t('Close'));
  };
  label(); onLanguageChange(label);
  go.addEventListener('click', () => {
    const href = location.href;
    if (frame) { const tab = window.open(href, '_blank', 'noopener'); if (!tab) location.assign(href); return; }
    if (isAndroid()) { location.href = chromeIntent(href); return; }
    // iPhone in-app browsers cannot hand over to Safari from a page: copy the link and point at the app's own menu.
    void navigator.clipboard?.writeText(href).then(() => { go.textContent = t('Link copied'); }, () => {});
  });
  close.addEventListener('click', () => { bar.remove(); try { sessionStorage.setItem('zoo-open-outside', 'closed'); } catch { /* ignore */ } });
  bar.append(text, go, close); document.body.append(bar);
}
