const cancellers = new Set<() => void>();
export function cancelButtonTouches() { for (const cancel of cancellers) cancel(); }

interface Tap { button: HTMLButtonElement; pointerId: number; x: number; y: number; cancelled: boolean }
interface Release extends Tap { emitted: boolean; timer: number; expiry: number }

/** Some phones emit no click for a second finger while the movement thumb is held. */
export function mountTouchButtons(root: Document = document) {
  const taps = new Map<number, Tap>(), releases = new Map<number, Release>();
  let dispatched: Event | null = null;
  const buttonAt = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
  const usable = (button: HTMLButtonElement) => button.isConnected && !button.matches(':disabled') && !button.closest('[hidden],[inert]');
  const inside = (tap: Tap, x: number, y: number) => buttonAt(root.elementFromPoint(x, y)) === tap.button;
  const remove = (release: Release) => {
    window.clearTimeout(release.timer); window.clearTimeout(release.expiry);
    if (releases.get(release.pointerId) === release) releases.delete(release.pointerId);
  };
  const cancel = () => {
    for (const tap of taps.values()) tap.cancelled = true;
    // Keep the release record: a late native click must not reactivate a cancelled touch.
    for (const release of releases.values()) { release.cancelled = true; window.clearTimeout(release.timer); }
  };
  cancellers.add(cancel);
  root.addEventListener('pointerdown', event => {
    const button = buttonAt(event.target);
    taps.delete(event.pointerId);
    const previous = releases.get(event.pointerId); if (previous) remove(previous);
    // A fresh physical press must not be mistaken for a compatibility click from the old touch.
    if (event.pointerType !== 'touch' || event.isPrimary) for (const release of releases.values()) if (release.button === button) remove(release);
    if (event.pointerType !== 'touch' || event.isPrimary || event.button !== 0 || !button || !usable(button)) return;
    if (button.dataset.move || button.id === 'boost-button') return; // These controls use hold/release directly.
    // A held Reel may become Cast when the line ends; its old release must never cast again.
    if (button.id === 'reel-button' && !button.classList.contains('cast') && !button.classList.contains('hunt')) return;
    taps.set(event.pointerId, { button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false });
  }, true);
  root.addEventListener('pointermove', event => {
    const tap = taps.get(event.pointerId);
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap.cancelled = true;
  }, true);
  root.addEventListener('pointercancel', event => { taps.delete(event.pointerId); }, true);
  root.addEventListener('lostpointercapture', event => {
    const tap = taps.get(event.pointerId); if (tap) tap.cancelled = true;
  }, true);
  root.addEventListener('pointerup', event => {
    const tap = taps.get(event.pointerId); if (!tap) return;
    taps.delete(event.pointerId);
    const release: Release = { ...tap, x: event.clientX, y: event.clientY, emitted: false, timer: 0, expiry: 0,
      cancelled: tap.cancelled || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10 || !usable(tap.button) || !inside(tap, event.clientX, event.clientY) };
    releases.set(event.pointerId, release);
    release.expiry = window.setTimeout(() => remove(release), 800);
    if (release.cancelled) return;
    // Give browsers that do emit a native click the first chance to handle the tap.
    release.timer = window.setTimeout(() => {
      if (release.cancelled || !usable(release.button) || !inside(release, release.x, release.y)) return;
      release.emitted = true;
      const click = new PointerEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1,
        pointerId: release.pointerId, pointerType: 'touch', isPrimary: false, button: 0, clientX: release.x, clientY: release.y });
      // detail=1 lets the existing long-press handlers suppress their release, and never toggles Reel.
      dispatched = click;
      try { release.button.dispatchEvent(click); } finally { dispatched = null; }
    }, 0);
  });
  root.addEventListener('click', event => {
    if (event === dispatched || event.detail === 0) return;
    const button = buttonAt(event.target), pointer = event as PointerEvent;
    const release = pointer.pointerType === 'touch' ? releases.get(pointer.pointerId)
      : !pointer.pointerType ? [...releases.values()].find(value => value.button === button && Math.hypot(event.clientX - value.x, event.clientY - value.y) <= 25) : undefined;
    if (!release || release.button !== button) return;
    if (release.cancelled || release.emitted) { event.preventDefault(); event.stopImmediatePropagation(); }
    else remove(release); // Native click arrived before the fallback; pass it through once.
  }, true);
  return cancel;
}
