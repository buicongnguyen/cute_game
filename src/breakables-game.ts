import type { World } from './world.ts';
import type { SaveState } from './model.ts';
import type { Sound } from './sfx.ts';
import type { HitSource } from './elite-roles.ts';
import { BreakablesView } from './breakables-view.ts';
import { BREAK, fighting, grantBreakDrop } from './breakables.ts';

/**
 * Wires breakable scenery (breakables-view.ts) into the game (main.ts): the world's plan, colliders and batches, the
 * bosses, the drop into the bag (solo), the server's word (online, through the 'zoo-scenery' event from online.ts), and
 * the notes shown once. Kept out of main.ts so main only forwards effects, the power strike, the chop and the frame.
 */
export interface BreakGameDeps {
  world: World;
  state(): SaveState;
  /** The server decides (an online session). */
  online(): boolean;
  /** Sends a hit request to the server (online.ts, GameAction 'scenery'). */
  send(id: string, source: HitSource): void;
  addItem(id: string, n: number): boolean;
  changed(): void;
  toast(message: string, icon?: string): void;
  tone(kind: Sound): void;
  t(key: string, vars?: Record<string, string | number>): string;
}
const SOUNDS: Record<string, Sound> = { chop: 'hit', crack: 'snap', fall: 'land', crumble: 'land', grow: 'pop' };
export const BREAK_NOTES = {
  first: 'Crack! Trees and stones on the Ice planet break after many hits, then grow back in a few minutes.',
  held: 'A boss fight holds the scenery around it: no damage until the fight is over.',
  wood: 'Wild wood +{n} ({count}/{cap} today)',
} as const;

export function mountBreakables(d: BreakGameDeps): BreakablesView {
  const w = d.world;
  let heldAt = -Infinity;
  const view = new BreakablesView({
    planet: () => w.planet, decor: () => w.decor, obstacles: () => w.obstacles,
    scatter: () => w.root.children.find(o => o.userData.scatter === true) ?? null,
    occluders: () => w.occluders, scene: () => w.scene, fx: () => w.fx ?? null,
    bosses: () => w.enemies.filter(e => e.boss && e.hp > 0).map(e => ({ x: e.x, z: e.z, hp: e.hp, aggro: fighting(e.phase) })),
    explorer: () => w.position,
    others: () => [...w.remotePlayers.values()].filter(r => r.mesh.visible).map(r => r.pose),
    now: () => w.time, online: d.online, send: d.send,
    drop: type => { const n = grantBreakDrop(d.state(), type, Date.now(), (id, k) => d.addItem(id, k)); if (n) d.changed(); return n; },
    note: (kind, n) => {
      if (kind === 'first-break') { let seen = false; try { seen = localStorage.getItem('zoo-garden-break-note') === '1'; localStorage.setItem('zoo-garden-break-note', '1'); } catch { /* private mode: once per visit */ } if (!seen && !firstShown) d.toast(BREAK_NOTES.first, '🪓'); firstShown = true; }
      else if (kind === 'held') { if (w.time - heldAt > 20) { heldAt = w.time; d.toast(BREAK_NOTES.held, '🛡️'); } }
      else if (kind === 'wood' && n) { const key = Object.keys(d.state().worldRewards.resourceReadyAt).find(k => k.startsWith('break-wood:')), count = key ? d.state().worldRewards.resourceReadyAt[key] : n; d.toast(d.t(BREAK_NOTES.wood, { n, count, cap: BREAK.wood.daily }), '🪵'); }
    },
    sound: kind => d.tone(SOUNDS[kind] ?? 'hit'),
    reduced: () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  });
  let firstShown = false;
  // The server's word (online): one piece's change, a room snapshot, or the wood this explorer got.
  addEventListener('zoo-scenery', event => {
    const m = (event as CustomEvent).detail as { type: string; id?: string; outcome?: string; hp?: number; list?: [string, number, number][]; wood?: number; count?: number };
    if (!d.online() || !m) return;
    if (m.type === 'sceneryState' && Array.isArray(m.list)) view.applySnapshot(m.list);
    else if (m.type === 'scenery' && typeof m.id === 'string' && ['wear', 'held', 'break', 'regrow'].includes(String(m.outcome))) {
      view.apply(m.id, m.outcome as 'wear', Number(m.hp) || 0);
    } else if (m.type === 'sceneryWood' && Number(m.wood) > 0) d.toast(d.t(BREAK_NOTES.wood, { n: Number(m.wood), count: Number(m.count) || Number(m.wood), cap: BREAK.wood.daily }), '🪵');
  });
  return view;
}
