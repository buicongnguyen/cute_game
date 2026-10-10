/** The small level number on a skill button (main.ts updateHud): hidden at level 0 (from the moment it is made: an empty dot used to show), written only when it changes. */
export function skillPip(button: HTMLElement, level: number) {
  let pip = button.querySelector<HTMLElement>('.skill-pip');
  if (!pip) { pip = document.createElement('i'); pip.className = 'skill-pip'; pip.setAttribute('aria-hidden', 'true'); pip.hidden = true; button.append(pip); }
  const text = level > 0 ? String(level) : '';
  if (pip.textContent !== text) { pip.textContent = text; pip.hidden = !text; }
}
