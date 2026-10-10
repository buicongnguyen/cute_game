// Adapted from 3d_astra ee51f0a: safe touch interruptions and opt-in fullscreen.
// Canvas coordinates stay unchanged; safe margins apply to DOM controls only.
export function installMobileGameSupport({ menus = [], controls = [], existingButtons = [], fullscreen = true, fullViewport = true, classifyCanvasTaps = true, translate } = {}) {
  if (window.__mobileGameSupport) return;
  window.__mobileGameSupport = true;
  const pointers = new Map(), retired = new Set(), keys = new Map();
  let suppressClickUntil = 0;
  const ownUI = node => node instanceof Element && !!node.closest(['[data-mobile-display]', '#mobile-display-help', ...existingButtons].join(','));
  const surface = node => node instanceof Element && !ownUI(node) && node.closest(['canvas', ...controls].join(','));
  const cancel = (id, p) => {
    p.node.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, composed: true,
      pointerId: id, pointerType: p.type, clientX: p.x, clientY: p.y }));
    if (p.node.hasPointerCapture?.(id)) p.node.releasePointerCapture(id);
  };
  const reset = () => {
    const active = [...pointers];
    pointers.clear(); // Clear first: capture release can synchronously reenter listeners.
    for (const [id, p] of active) { retired.add(id); cancel(id, p); }
    for (const [code, key] of keys) document.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
    keys.clear();
    if (active.length) suppressClickUntil = performance.now() + 700;
  };
  window.addEventListener('pointerdown', e => {
    if (ownUI(e.target)) { e.stopImmediatePropagation(); return; }
    const node = surface(e.target);
    if (!node) return;
    retired.delete(e.pointerId);
    pointers.set(e.pointerId, { node: e.target, type: e.pointerType, x: e.clientX, y: e.clientY,
      sx: e.clientX, sy: e.clientY, moved: false, multi: false, canvas: node.tagName === 'CANVAS' });
    // Only canvas gestures are classified as taps. Joysticks/action buttons retain their own semantics.
    const touch = [...pointers.values()].filter(p => p.type !== 'mouse' && p.canvas);
    if (touch.length > 1) for (const p of touch) p.multi = true;
  }, true);
  window.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 9) p.moved = true;
  }, true);
  window.addEventListener('pointerup', e => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (retired.has(e.pointerId) && surface(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    pointers.delete(e.pointerId);
    p.x = e.clientX; p.y = e.clientY;
    if (p.type !== 'mouse' && p.canvas && (p.multi || classifyCanvasTaps && (p.moved || Math.hypot(p.x - p.sx, p.y - p.sy) > 9))) {
      suppressClickUntil = performance.now() + 700;
      e.preventDefault(); e.stopImmediatePropagation(); cancel(e.pointerId, p);
    }
  }, true);
  for (const name of ['pointercancel', 'lostpointercapture']) window.addEventListener(name, e => {
    const p = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (p) retired.add(e.pointerId);
    if (name === 'lostpointercapture' && p) cancel(e.pointerId, p);
  }, true);
  window.addEventListener('click', e => {
    if (surface(e.target)?.tagName === 'CANVAS' && performance.now() < suppressClickUntil && e.detail !== 0) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('keydown', e => {
    const dialog = document.getElementById('mobile-display-help');
    if (dialog?.open) {
      if (e.key === 'Escape') { e.preventDefault(); dialog.close(); }
      e.stopImmediatePropagation(); return;
    }
    if (ownUI(e.target)) { e.stopImmediatePropagation(); return; }
    if (!e.target?.closest?.('input, textarea, select, [contenteditable]')) keys.set(e.code, e.key);
  }, true);
  window.addEventListener('keyup', e => keys.delete(e.code), true);
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  window.addEventListener('resize', reset);
  window.visualViewport?.addEventListener('resize', reset);

  const style = document.createElement('style');
  style.dataset.mobileGameSupport = '';
  style.textContent = `
    ${fullViewport ? 'html, body { overscroll-behavior: none; }' : ''}
    canvas { touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    [data-mobile-display] { min-height: 44px; padding: 8px 14px; margin: 6px; cursor: pointer; font: inherit; }
    [data-mobile-display][aria-disabled="true"] { opacity: .65; cursor: progress; }
    #mobile-display-help { box-sizing: border-box; color: #f4f5f2; background: #172528; border: 1px solid #829496;
      border-radius: 14px; padding: 20px; width: min(440px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow: auto; }
    #mobile-display-help::backdrop { background: #0009; }
    #mobile-display-help p { line-height: 1.5; }
    #mobile-display-help button { min-height: 44px; padding: 8px 20px; font: inherit; }
  `;
  document.head.append(style);
  // Clamp fixed/absolute touch controls inside the existing layout instead of shifting the canvas.
  const keepControlsSafe = () => {
    if (!matchMedia('(pointer: coarse)').matches) return;
    for (const node of document.querySelectorAll(controls.join(',') || '[data-no-mobile-controls]')) {
      const css = getComputedStyle(node);
      if (!['fixed', 'absolute'].includes(css.position)) continue;
      for (const edge of ['left', 'right', 'bottom']) {
        const value = css[edge];
        if (value === 'auto' || node.dataset['mobileSafe' + edge]) continue;
        if (Number.parseFloat(value) < (edge === 'bottom' ? 16 : 12)) {
          node.style.setProperty(edge, `max(${value}, ${edge === 'bottom' ? '16px' : '12px'}, calc(env(safe-area-inset-${edge}, 0px) + 8px))`);
          node.dataset['mobileSafe' + edge] = 'true';
        }
      }
    }
  };
  let pending = false, returnFocus = null;
  const active = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const vi = () => /^vi\b/i.test(document.documentElement.lang);
  const text = (en, vn) => translate ? translate(en) : vi() ? vn : en;
  const refresh = () => {
    for (const button of document.querySelectorAll(['[data-mobile-display]', ...existingButtons].join(','))) {
      const label = active() ? text('Exit full screen', 'Thoát toàn màn hình') : text('Full screen', 'Toàn màn hình');
      if (button.hasAttribute('data-mobile-display') && button.textContent !== label) button.textContent = label;
      button.setAttribute('aria-label', label); button.title = label;
      button.setAttribute('aria-pressed', String(active()));
      button.setAttribute('aria-disabled', String(pending));
    }
  };
  const help = reason => {
    reset();
    window.dispatchEvent(new Event('mobile-game-interruption'));
    let dialog = document.getElementById('mobile-display-help');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'mobile-display-help';
      dialog.setAttribute('aria-labelledby', 'mobile-display-heading');
      document.body.append(dialog);
      dialog.addEventListener('close', () => {
        const target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus
          : [...document.querySelectorAll(['[data-mobile-display]', ...existingButtons, '[data-resume]', 'button'].join(','))].find(node => node.getClientRects().length && !node.disabled);
        target?.focus({ preventScroll: true });
      });
    }
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    dialog.innerHTML = `<h2 id="mobile-display-heading">${text('Full screen', 'Toàn màn hình')}</h2><p>${reason === 'exit'
      ? text('Use your browser’s exit control or press Esc to leave full screen.', 'Dùng nút thoát của trình duyệt hoặc nhấn Esc để thoát toàn màn hình.')
      : standalone ? text('You are already playing from a home-screen web app.', 'Bạn đang chơi trong ứng dụng web từ màn hình chính.')
      : text('Open the game in Safari if you are using an in-app browser. Tap Share → Add to Home Screen → enable Open as Web App if shown, then launch the new icon.', 'Nếu đang dùng trình duyệt trong ứng dụng, hãy mở trò chơi bằng Safari. Chạm Chia sẻ → Thêm vào Màn hình chính → bật Mở dưới dạng ứng dụng web nếu có, rồi mở biểu tượng mới.')}</p><p>${text('Start drags away from screen edges. iPhone system gestures still work.', 'Bắt đầu kéo cách xa mép màn hình. Các cử chỉ hệ thống iPhone vẫn hoạt động.')}</p><button type="button">${text('Back', 'Quay lại')}</button>`;
    dialog.querySelector('button').onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('button').focus({ preventScroll: true });
  };
  // Handle modal keys before gameplay shortcuts; native dialog supplies focus trapping.
  window.addEventListener('keydown', e => {
    const dialog = document.getElementById('mobile-display-help');
    if (!dialog?.open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dialog.close(); }
    else e.stopImmediatePropagation(); // Preserve native Tab/Enter defaults without gameplay shortcuts.
  }, true);
  const toggle = async button => {
    if (pending) return;
    returnFocus = button; button.focus({ preventScroll: true });
    pending = true; refresh();
    const exiting = active();
    try {
      const root = document.documentElement;
      const fn = exiting ? document.exitFullscreen || document.webkitExitFullscreen : root.requestFullscreen || root.webkitRequestFullscreen;
      const enabled = root.requestFullscreen ? document.fullscreenEnabled : document.webkitFullscreenEnabled;
      if (!fn || (!exiting && enabled === false)) { help(exiting ? 'exit' : 'enter'); return; }
      // Invoke directly in the click handler, before any await consumes user activation.
      await fn.call(exiting ? document : root);
    } catch { help(exiting ? 'exit' : 'enter'); }
    finally { pending = false; refresh(); }
  };
  document.addEventListener('click', e => {
    const button = e.target?.closest?.(['[data-mobile-display]', ...existingButtons].join(','));
    if (!button) return;
    e.preventDefault(); e.stopImmediatePropagation(); void toggle(button);
  }, true);
  for (const name of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(name, () => {
    reset(); refresh(); window.dispatchEvent(new Event('resize'));
  });
  const mount = () => {
    keepControlsSafe();
    if (!fullscreen) return;
    for (const selector of menus) for (const match of document.querySelectorAll(selector)) {
      const host = match.tagName === 'BUTTON' ? match.parentElement : match;
      if (host.querySelector('[data-mobile-display]')) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.mobileDisplay = ''; host.append(button);
    }
    refresh();
  };
  // Menus in these games are rebuilt when opening pause/settings or changing language.
  let queued = false;
  const observer = new MutationObserver(records => {
    // HUD clocks and counters change text every frame; they do not need layout scans.
    if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) return;
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; mount(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.addEventListener('resize', keepControlsSafe);
  mount();
}
