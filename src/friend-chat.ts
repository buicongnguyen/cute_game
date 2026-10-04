import * as T from 'three';
import type { World } from './world.ts';
import { t } from './i18n.ts';

/**
 * Speech bubbles for helpers outdoors: one small DOM bubble per speaker, placed over their head each frame while it
 * speaks (a handful of elements at most; nothing is created for a silent helper).
 */
interface Bubble { el: HTMLDivElement; left: number; at: () => { x: number; z: number } }
export class ChatBubbles {
  private bubbles = new Map<string, Bubble>();
  private v = new T.Vector3();
  constructor(private world: World, private hidden: () => boolean = () => false) {}
  /** True while this speaker's bubble is showing. */
  speaking(who: string) { return this.bubbles.has(who); }
  say(who: string, text: string, at: () => { x: number; z: number }, seconds = 3.4) {
    let b = this.bubbles.get(who);
    if (!b) { const el = document.createElement('div'); el.className = 'friend-bubble'; document.body.append(el); b = { el, left: 0, at }; this.bubbles.set(who, b); }
    b.el.textContent = t(text); b.left = seconds; b.at = at;
  }
  frame(dt: number) {
    const w = this.world, off = w.interior || this.hidden();
    for (const [who, b] of this.bubbles) {
      b.left -= dt;
      if (b.left <= 0 || off) { b.el.remove(); this.bubbles.delete(who); continue; }
      const p = b.at(); this.v.set(p.x, 2.3, p.z).project(w.camera);
      const x = (this.v.x + 1) / 2 * innerWidth, y = (1 - this.v.y) / 2 * innerHeight, hide = this.v.z > 1 || x < 70 || x > innerWidth - 70 || y < 50;
      b.el.style.visibility = hide ? 'hidden' : ''; b.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
    }
  }
}
