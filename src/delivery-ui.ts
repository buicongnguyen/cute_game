import type { SaveState, Inventory } from './model.ts';
import { storedLine } from './delivery.ts';

interface Host {
  state(): SaveState;
  /** True while the explorer is home and inside the safe circle (not visiting, not flying). */
  home(): boolean;
  perform<T>(type: string, payload?: Record<string, unknown>): Promise<T | undefined>;
  openChest(): void;
  t(text: string, vars?: Record<string, string | number>): string;
  name(id: string): string;
  /** After "Take all" moved `count` items from the chest to the bag. */
  took?(count: number): void;
  /** True while a panel is open: the card sits above the dialog layer, so it waits (or steps aside) rather than cover the panel and swap it for the chest. */
  covered?(): boolean;
}

/**
 * "While you were out, your helpers stored: …" — a card shown once when the explorer steps back inside the home circle
 * with something waiting in the chest (delivery.ts), or after catch-up work stored something. It waits 1.5 s at home so
 * the robots' and friends' catch-ups land in one note. Reading it clears the note (ackStored) so it never repeats; a tap
 * opens the chest, and "Take all" moves what it lists from the chest to the bag ('takeChest').
 */
export function initStoredNote(host: Host, parent: HTMLElement) {
  let homeFor = 0, busy = false, timer = 0, items: Inventory = {};
  const el = document.createElement('div'); el.id = 'stored-note'; el.hidden = true; el.setAttribute('role', 'status');
  el.innerHTML = `<button type="button" class="stored-open"><span>📦</span><div><b></b><small></small></div></button><button type="button" class="stored-take"></button>`;
  parent.append(el);
  const hide = () => { el.classList.add('leaving'); clearTimeout(timer); timer = window.setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 300); };
  el.querySelector('.stored-open')!.addEventListener('click', () => { hide(); host.openChest(); });
  el.querySelector('.stored-take')!.addEventListener('click', async () => {
    hide(); const r = await host.perform<{ count: number }>('takeChest', { items });
    if (r) host.took?.(r.count);
  });
  async function show() {
    const stored = { ...(host.state().awayStore ?? {}) }, line = storedLine(stored, host.name);
    if (!line.total || busy) { if (!line.total) delete host.state().awayStore; return; } busy = true;
    try { if ((await host.perform('ackStored')) === undefined) { homeFor = -10; return; } } finally { busy = false; }
    items = stored;
    const more = line.more ? ' ' + host.t('and {count} more', { count: line.more }) : '';
    el.querySelector('b')!.textContent = host.t('While you were out, your helpers stored:') + ' ' + line.text + more;
    el.querySelector('small')!.textContent = host.t('Tap to open the chest');
    el.querySelector('.stored-take')!.textContent = host.t('Take all');
    el.hidden = false; el.classList.remove('leaving'); clearTimeout(timer); timer = window.setTimeout(hide, 9000);
  }
  return {
    /** Per frame: inside the circle with something noted for 1.5 s → show it. */
    frame(dt: number) {
      if (host.covered?.()) { homeFor = 0; if (!el.hidden && !el.classList.contains('leaving')) hide(); return; }
      homeFor = host.home() ? homeFor + dt : 0; if (homeFor > 1.5 && !busy && host.state().awayStore) void show();
    },
    show,
  };
}
