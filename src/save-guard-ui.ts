import { t, onLanguageChange } from './i18n.ts';
import type { GuardNotice, SaveGuard } from './save-guard.ts';

/**
 * The notice a SaveGuard raises: one banner at the top (inline styles, so it needs no stylesheet and cannot be hidden by
 * a menu layout). "corrupt" is shown once and can be dismissed; the others stay while this tab is not saving.
 */
const COPY: Record<GuardNotice, { title: string; body: string; reload: boolean }> = {
  corrupt: { title: 'Your old save could not be read', body: 'It was kept on this device instead of being erased. To bring it back: Settings, then Restore backup.', reload: false },
  'corrupt-unsaved': { title: 'Your old save could not be read', body: 'No copy could be made (the browser storage is full), so this game will not save. Free some space and reload.', reload: true },
  newer: { title: 'This save is from a newer version', body: 'To protect it, this tab will not save. Reload to get the newest version of the game.', reload: true },
  stale: { title: 'Open in another tab', body: 'Another tab saved newer progress. This tab stopped saving so it does not put older progress back.', reload: true },
};

export function installSaveGuardUi(guard: SaveGuard, root: HTMLElement = document.body, reload: () => void = () => location.reload()) {
  let shown: GuardNotice | null = null;
  const box = document.createElement('div');
  box.id = 'save-guard'; box.setAttribute('role', 'alert'); box.hidden = true;
  box.style.cssText = 'position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483000;width:min(94vw,440px);box-sizing:border-box;padding:10px 14px;border-radius:14px;background:#2d2a45;color:#fff;font:600 14px/1.35 Nunito Variable,Nunito,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:auto';
  root.append(box);
  const render = () => {
    box.replaceChildren();
    if (!shown) { box.hidden = true; return; }
    const copy = COPY[shown];
    const title = document.createElement('strong'); title.textContent = t(copy.title);
    const body = document.createElement('div'); body.textContent = t(copy.body); body.style.cssText = 'font-weight:500;margin-top:2px';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px';
    const button = (label: string, run: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t(label); b.style.cssText = 'min-height:36px;padding:0 14px;border:0;border-radius:10px;background:#ffd166;color:#2d2a45;font:inherit;cursor:pointer'; b.addEventListener('click', run); return b; };
    if (copy.reload) row.append(button('Reload', reload));
    if (shown === 'corrupt' || shown === 'newer') row.append(button('OK', () => { shown = null; render(); }));
    box.append(title, body, row); box.hidden = false;
  };
  const next = () => {
    // The most serious notice wins: a frozen tab outranks the one-time "kept your old save" note.
    const order: GuardNotice[] = ['stale', 'newer', 'corrupt-unsaved', 'corrupt'];
    const pending = order.find(n => guard.notices.includes(n));
    if (pending && pending !== shown) { shown = pending; render(); }
  };
  guard.onChange = next;
  onLanguageChange(render);
  next();
  return box;
}

/** Settings row, only while a backup of an unreadable save exists. */
export const restoreRowHtml = (guard: SaveGuard, key: string) => guard.hasBackup(key)
  ? `<div class="settings-row"><div><strong>${t('Restore backup')}</strong><small>${t('Restoring replaces the progress in this game with the backup, then reloads.')}</small></div><button type="button" class="btn" data-action="restore-backup">${t('Restore')}</button></div>` : '';

/** Settings button: confirm, put the newest backup back and reload. */
export function restoreBackup(guard: SaveGuard, key: string, ask: (message: string) => boolean = m => confirm(m), reload: () => void = () => location.reload()) {
  if (!ask(t('Restoring replaces the progress in this game with the backup, then reloads.'))) return false;
  if (!guard.restore(key)) return false;
  reload();
  return true;
}
