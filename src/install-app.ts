/**
 * "Install as app" (the reference's 📲 "Cài Zoo Pet như app" on the title and in the top bar): Chrome, Edge and
 * Android hand the page a one-time install invitation (`beforeinstallprompt`) once the manifest and service worker
 * qualify; iPhone and iPad Safari have none, so they get the Share → Add to Home Screen steps. Hidden once the game
 * runs installed (display-mode standalone) or after `appinstalled`.
 *
 * The listener is registered when this module is imported (main.ts imports it first thing), because browsers may fire
 * the invitation before the game has finished loading its art.
 */
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let invitation: InstallPrompt | null = null, installed = false;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); invitation = event as InstallPrompt; notify(); });
  window.addEventListener('appinstalled', () => { invitation = null; installed = true; notify(); });
}
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return installed || window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches && !document.fullscreenElement || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function isAppleMobile() { return typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
/** 'prompt': the browser's own install dialog is ready; 'ios': show the Add to Home Screen steps; 'none': nothing to offer. */
export function installMode(): 'installed' | 'prompt' | 'ios' | 'none' { return isStandalone() ? 'installed' : invitation ? 'prompt' : isAppleMobile() ? 'ios' : 'none'; }
export const installAvailable = () => { const mode = installMode(); return mode === 'prompt' || mode === 'ios'; };
export function onInstallChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Opens the browser's install dialog (single use, even when dismissed). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const offer = invitation; if (!offer) return 'unavailable';
  invitation = null; notify();
  try { await offer.prompt(); const choice = await offer.userChoice; if (choice.outcome === 'accepted') { installed = true; notify(); return 'accepted'; } return 'dismissed'; }
  catch { return 'unavailable'; }
}
type T = (text: string) => string;
/** The title-card / settings button; `hidden` unless the browser can install or this is an iPhone/iPad. */
export const installButtonHtml = (t: T, className = 'install-app') => `<button type="button" class="${className}" data-action="install-app" ${installAvailable() ? '' : 'hidden'}>📲 ${t('Install as app')}</button>`;
/** The settings row (hidden when there is nothing to offer). */
export const installRowHtml = (t: T) => `<div class="settings-row install-row" ${installAvailable() ? '' : 'hidden'}><div><strong>${t('Install as app')}</strong><small>${t('Play from your home screen, full screen and offline.')}</small></div>${installButtonHtml(t, 'soft-button install-app')}</div>`;
/** The steps for iPhone and iPad (Safari has no install invitation). */
export const iosGuideHtml = (t: T) => `<ol class="ios-install-steps"><li><span aria-hidden="true">⬆️</span> ${t('Tap the Share button in Safari’s toolbar.')}</li><li><span aria-hidden="true">➕</span> ${t('Choose “Add to Home Screen”.')}</li><li><span aria-hidden="true">🌱</span> ${t('Tap Add, then open Zoo Garden from its new icon.')}</li></ol><p class="muted">${t('In another app’s browser, open this page in Safari first.')}</p><div class="button-row"><button class="primary" data-action="close">${t('Got it')}</button></div>`;
/** Keeps every install button's visibility in step with the browser (an invitation arriving late, an install finishing). */
export function syncInstallButtons(root: ParentNode = document) {
  const show = installAvailable();
  root.querySelectorAll<HTMLElement>('[data-action="install-app"]').forEach(button => { button.hidden = !show; });
  root.querySelectorAll<HTMLElement>('.install-row').forEach(row => { row.hidden = !show; });
  // platform.ts keeps its own copy of the invitation for the HUD's install button: once ours is used, that one is spent too.
  if (installMode() !== 'prompt') root.querySelectorAll<HTMLElement>('.platform-tools button:not(:first-child)').forEach(button => { button.hidden = true; });
}
