const cancellers = new Set<() => void>();

/** A menu, interrupted touch, or backgrounded page must not finish an old press. */
export function cancelLongPresses() { for (const cancel of cancellers) cancel(); }

/** Each button owns its timer and release click, independently of other fingers. */
export function mountLongPress(button: HTMLElement, hold: () => void, enabled: () => boolean = () => true) {
  let timer = 0, pointer: number | null = null, suppressClick = false;
  const stopTimer = () => { window.clearTimeout(timer); timer = 0; };
  const cancel = () => { stopTimer(); suppressClick ||= pointer !== null; pointer = null; };
  cancellers.add(cancel);
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || !enabled()) return;
    pointer = event.pointerId; suppressClick = false;
    timer = window.setTimeout(() => {
      timer = 0;
      if (!enabled()) { cancel(); return; }
      suppressClick = true; hold();
    }, 450);
  });
  button.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    stopTimer(); pointer = null; // Preserve the completed hold until its subsequent click.
  });
  button.addEventListener('pointerleave', event => {
    if (event.pointerId !== pointer) return;
    stopTimer(); pointer = null;
  });
  for (const type of ['pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, event => {
    if (event.pointerId === pointer) cancel();
  });
  button.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return; // Keyboard/assistive activation stays available.
    event.preventDefault(); event.stopImmediatePropagation();
    if (pointer === null) suppressClick = false;
  }, true);
  button.addEventListener('contextmenu', event => event.preventDefault());
  return cancel;
}
