import * as T from 'three';
import type { World } from './world.ts';

/**
 * Name and level above other explorers' heads, so people can tell each other apart in the shared world. One small DOM
 * pill per visible explorer near the camera (pooled, written only when the text changes); friends get a green heart.
 */
const MAX_PLATES = 24, REACH = 38;
export class Nameplates {
  private plates = new Map<string, { el: HTMLDivElement; text: string; friend: boolean }>();
  private v = new T.Vector3();
  constructor(private world: World, private hidden: () => boolean = () => false) {}
  frame() {
    const w = this.world, off = w.interior || this.hidden(), seen = new Set<string>();
    if (!off && w.remotePlayers) {
      let shown = 0;
      const near = [...w.remotePlayers.entries()].filter(([, r]) => r.mesh.visible && r.pose.name).map(([id, r]) => ({ id, r, d: Math.hypot(r.mesh.position.x - w.position.x, r.mesh.position.z - w.position.z) })).filter(x => x.d < REACH).sort((a, b) => a.d - b.d);
      for (const { id, r } of near) {
        if (shown >= MAX_PLATES) break;
        const p = r.mesh.position, scale = r.mesh.scale.x / 1.0;
        this.v.set(p.x, p.y + 2.35 * Math.max(.5, scale), p.z).project(w.camera);
        const x = (this.v.x + 1) / 2 * innerWidth, y = (1 - this.v.y) / 2 * innerHeight;
        if (this.v.z > 1 || x < 20 || x > innerWidth - 20 || y < 20 || y > innerHeight - 20) continue;
        const friend = w.friendIds.has(id), text = `${friend ? '💚 ' : ''}${r.pose.name} · Lv ${r.pose.level ?? 1}`;
        let plate = this.plates.get(id);
        if (!plate) { const el = document.createElement('div'); el.className = 'player-plate'; document.body.append(el); plate = { el, text: '', friend: false }; this.plates.set(id, plate); }
        if (plate.text !== text) { plate.text = text; plate.el.textContent = text; }
        if (plate.friend !== friend) { plate.friend = friend; plate.el.classList.toggle('friend', friend); }
        plate.el.style.visibility = ''; plate.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
        seen.add(id); shown++;
      }
    }
    for (const [id, plate] of this.plates) if (!seen.has(id)) { plate.el.remove(); this.plates.delete(id); }
  }
}
