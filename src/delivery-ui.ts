import type { SaveState } from './model.ts';
import { storedLine } from './delivery.ts';

interface Host {
  state(): SaveState;
  /** True while the explorer is home and inside the safe circle (not visiting, not flying). */
  home(): boolean;
  perform<T>(type: string, payload?: Record<string, unknown>): Promise<T | undefined>;
  openChest(): void;
  t(text: string, vars?: Record<string, string | number>): string;
  name(id: string): string;
}

/**
 * "While you were out, your helpers stored: …" — a tappable card shown once when the explorer steps back inside the
 * home circle with something waiting in the chest (delivery.ts), or after catch-up work stored something. It waits
 * 1.5 s at home so the robots' and friends' catch-ups land in one note. Reading it clears the note (ackStored) so it
 * never repeats; a tap opens the chest.
 */
export function initStoredNote(host: Host, parent: HTMLElement) {
  let homeFor = 0, busy = false, timer = 0;
  const el = document.createElement('button'); el.id = 'stored-note'; el.type = 'button'; el.hidden = true;
  parent.append(el);
  const hide = () => { el.classList.add('leaving'); clearTimeout(timer); timer = window.setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 300); };
  el.addEventListener('click', () => { hide(); host.openChest(); });
  async function show() {
    const items = { ...(host.state().awayStore ?? {}) }, line = storedLine(items, host.name);
    if (!line.total || busy) { if (!line.total) delete host.state().awayStore; return; } busy = true;
    try { if ((await host.perform('ackStored')) === undefined) { homeFor = -10; return; } } finally { busy = false; }
    const more = line.more ? ' ' + host.t('and {count} more', { count: line.more }) : '';
    el.innerHTML = `<span>📦</span><div><b></b><small></small></div>`;
    el.querySelector('b')!.textContent = host.t('While you were out, your helpers stored:') + ' ' + line.text + more;
    el.querySelector('small')!.textContent = host.t('Tap to open the chest');
    el.hidden = false; el.classList.remove('leaving'); clearTimeout(timer); timer = window.setTimeout(hide, 9000);
  }
  return {
    /** Per frame: inside the circle with something noted for 1.5 s → show it. */
    frame(dt: number) { homeFor = host.home() ? homeFor + dt : 0; if (homeFor > 1.5 && !busy && host.state().awayStore) void show(); },
    show,
  };
}
