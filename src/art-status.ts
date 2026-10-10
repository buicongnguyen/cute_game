import './art-status.css';
import { t, onLanguageChange } from './i18n.ts';
import { failingArt, onArtStatus, wakeArt } from './art-retry.ts';

// Two small notices about what the player is looking at: art that is still missing after its retries
// (tap to try again), and a newer build that has taken over the service worker (tap to reload).

function pill(className: string) {
  const el = document.createElement('button'); el.type = 'button'; el.className = `art-pill ${className}`; el.hidden = true;
  document.body.append(el); return el;
}

/** "Some art didn't load - tap to retry", shown only while a model is still missing after its quick retries. */
export function initArtNote() {
  const note = pill('art-note'); note.id = 'art-note';
  let retrying = false;
  const render = () => {
    const missing = failingArt().length > 0;
    if (!missing) retrying = false;
    note.hidden = !missing;
    note.textContent = retrying ? t('Retrying…') : t('Some art didn’t load — tap to retry');
  };
  // Several files fail together when the network drops; one frame later is soon enough.
  let queued = false;
  onArtStatus(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); } });
  note.addEventListener('click', () => {
    retrying = true; render(); wakeArt();
    // A retry that fails again leaves the note up; let the player try again shortly.
    setTimeout(() => { retrying = false; render(); }, 4000);
  });
  onLanguageChange(render);
}

/**
 * Registers the offline worker. A new build's worker takes over at once (build-offline.mjs); when its
 * scripts are not the ones this page runs, the page is an older build, so offer a reload instead of
 * interrupting play.
 */
export function registerWorker(url: string, entry = new URL(import.meta.url).pathname) {
  if (!('serviceWorker' in navigator)) return;
  const prompt = pill('update-note'); prompt.id = 'update-note';
  const render = () => { prompt.textContent = `${t('A new version is ready')} · ${t('Reload')}`; };
  render(); onLanguageChange(render);
  prompt.addEventListener('click', () => location.reload());
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data as { type?: string; scripts?: string[] } | null;
    if (data?.type === 'zoo-sw-ready' && Array.isArray(data.scripts) && !data.scripts.includes(entry)) prompt.hidden = false;
  });
  void navigator.serviceWorker.register(url).catch(() => {});
  // The first page of a first visit is not controlled by the worker, so the models it loads never reach the cache. Once the
  // worker is active and the game has settled, ask it to fetch the on-demand files (a few at a time) for the next offline visit.
  void navigator.serviceWorker.ready.then(reg => { setTimeout(() => reg.active?.postMessage({ type: 'zoo-fill' }), 8000); }).catch(() => {});
}
