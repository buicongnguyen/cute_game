/**
 * Elite roles drawn (elite-roles.ts holds the rules): a ground ring in the role's colour under every elite, the shielded
 * creature's crystal barrier (flashing on a deflect, cracking at one, two and three hits, shattering into pooled shards and
 * growing back), the splitter's see-through body with the two cores it will become, its children popping out, the
 * 'Deflected' and 'Split!' cues and the first-meeting toast.
 *
 * Budget (docs/QUALITY-PLAN.md section 2): every part kind is ONE instanced mesh for all elites on screen (ring, barrier,
 * three crack sets, cores), so three elites and eight children cost at most six draws together, and a kind with nothing to
 * show is hidden (no draw). The parts come from elite.glb (art/blender/kit/build_elite.py), loaded only on a planet that
 * has elites; until it arrives small built-in shapes stand in. With no elite in view nothing is computed but a scan of the
 * planet's few elites.
 */
import * as T from 'three';
import './elite.css';
import { KitLibrary, modelUrl } from './assets.ts';
import { ELITE_PARTS, ELITE_PLANETS, ELITE_ROLES, eliteBadge, type EliteRoleId } from './elite-roles.ts';
import { t } from './i18n.ts';
import type { Enemy, World, EliteEvent } from './world.ts';

export const eliteKit = new KitLibrary([modelUrl('elite.glb')]);
const CAP = 16, VIEW = 40, SHARD = ['#bff4ff', '#7fe3ff', '#ffffff', '#5cc8f0'];
type Look = { flash: number; grow: number; glass?: boolean; seen?: boolean; wasAlive?: boolean; /** The model's half width and height at scale 1 (measured once). */ foot?: number; tall?: number; /** When 'Deflected' last showed. */ said?: number };
const box = new T.Box3();
const SEEN_KEY = 'zoo-elite-seen';

function seenRoles(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); } }
function rememberRole(id: string) { try { const s = seenRoles(); s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* a private window: the toast may show again */ } }

export class EliteView {
  private root = new T.Group();
  private ring: T.InstancedMesh; private barrier: T.InstancedMesh | null = null; private cracks: T.InstancedMesh[] = []; private cores: T.InstancedMesh | null = null;
  private looks = new WeakMap<Enemy, Look>();
  private list: Enemy[] = []; private listOf: Enemy[] | null = null; private listLength = -1; private shown = false; private kitAsked = false; private kitBuilt = false;
  private seen = seenRoles();
  private m = new T.Matrix4(); private q = new T.Quaternion(); private v = new T.Vector3(); private s = new T.Vector3(); private c = new T.Color(); private up = new T.Vector3(0, 1, 0);
  private time = 0;

  constructor(private world: World, private toast: (message: string, icon: string) => void) {
    const ringGeometry = new T.RingGeometry(.86, 1, 32).rotateX(-Math.PI / 2);
    this.ring = new T.InstancedMesh(ringGeometry, new T.MeshBasicMaterial({ transparent: true, opacity: .6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), CAP);
    this.ring.name = 'elite-rings'; this.prepare(this.ring);
    this.root.name = 'elite-view';
    world.onEliteEvent = (e, event) => this.event(e, event);
  }
  private prepare(mesh: T.InstancedMesh) { mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.root.add(mesh); }
  /** The barrier, cracks and cores: from the kit when it has arrived, else small built-in stand-ins (rebuilt once the kit lands). */
  private buildParts() {
    for (const mesh of [this.barrier, ...this.cracks, this.cores]) if (mesh) { this.root.remove(mesh); mesh.dispose(); }
    const part = (name: string, fallback: () => T.BufferGeometry) => {
      const src = eliteKit.ready ? eliteKit.instance(name) : null; let geometry: T.BufferGeometry | null = null;
      src?.updateMatrixWorld(true); src?.traverse(o => { if (!geometry && o instanceof T.Mesh) geometry = (o.geometry as T.BufferGeometry).clone().applyMatrix4(o.matrixWorld); });
      return geometry ?? fallback();
    };
    const glass = new T.MeshLambertMaterial({ color: '#ffffff', emissive: '#5fd2f5', emissiveIntensity: .5, transparent: true, opacity: .8, flatShading: true });
    this.barrier = new T.InstancedMesh(part(ELITE_PARTS.barrier, () => new T.IcosahedronGeometry(1.05, 0).translate(0, .6, 0)), glass, CAP); this.barrier.name = 'elite-barrier'; this.prepare(this.barrier);
    const crackMat = new T.MeshBasicMaterial({ color: '#1f4f8f' });
    this.cracks = ELITE_PARTS.cracks.map((name, i) => { const mesh = new T.InstancedMesh(part(name, () => new T.BoxGeometry(.5, .03, .03).rotateZ(.5 * i).translate(0, .5 + .2 * i, 1.02)), crackMat, CAP); mesh.name = name; this.prepare(mesh); return mesh; });
    this.cores = new T.InstancedMesh(part(ELITE_PARTS.cores, () => new T.SphereGeometry(.18, 8, 6).translate(-.17, .42, 0).toNonIndexed()), new T.MeshLambertMaterial({ color: '#ff4fa8', emissive: '#d42a84', emissiveIntensity: .55, transparent: true, opacity: .97 }), CAP); this.cores.name = 'elite-cores'; this.prepare(this.cores);
    // Drawn after the see-through body (which writes no depth): the cores show whole inside it, still hidden behind anything solid.
    this.cores.renderOrder = 3;
    this.kitBuilt = eliteKit.ready;
  }
  private look(e: Enemy) { let l = this.looks.get(e); if (!l) { l = { flash: 0, grow: 1 }; this.looks.set(e, l); } return l; }

  private last = 0;
  /** Every frame, just before drawing (world.eliteFrame). */
  frame(now = performance.now()) {
    const w = this.world, dt = this.last ? Math.min(.1, (now - this.last) / 1000) : 0; this.last = now; this.time += dt;
    if (!ELITE_PLANETS.has(w.planet)) { this.hide(); return; }
    if (this.listOf !== w.enemies || this.listLength !== w.enemies.length) { this.listOf = w.enemies; this.listLength = w.enemies.length; this.list = w.enemies.filter(e => e.elite); }
    if (!this.list.length) { this.hide(); return; }
    if (!this.kitAsked) { this.kitAsked = true; void eliteKit.load(); }
    if (!this.barrier || (!this.kitBuilt && eliteKit.ready)) this.buildParts();
    if (this.root.parent !== w.scene) w.scene.add(this.root);
    const cx = w.cameraTarget.x, cz = w.cameraTarget.z; let rings = 0, barriers = 0, cores = 0; const cracks = [0, 0, 0];
    for (const e of this.list) {
      const l = this.look(e), alive = e.hp > 0;
      if (alive && l.wasAlive === false && e.elite === 'mini') this.pop(e); // a child just woke (online: the server split it)
      l.wasAlive = alive;
      if (!alive || !e.mesh.visible || Math.hypot(e.x - cx, e.z - cz) > VIEW) continue;
      if (!l.seen) { l.seen = true; this.meet(e); }
      if ((e.elite === 'splitter' || e.elite === 'mini') && !l.glass) { l.glass = true; this.glass(e); }
      if (l.foot === undefined) { const k = Math.max(.001, e.mesh.scale.x); box.setFromObject(e.mesh); l.foot = Number.isFinite(box.max.x) ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 / k : e.radius; l.tall = Number.isFinite(box.max.y) ? (box.max.y - box.min.y) / Math.max(.001, e.mesh.scale.y) : 1; }
      const p = e.mesh.position, r = e.radius, ground = p.y - (e.lift ?? 0), k = e.mesh.scale.x, foot = Math.max(r, l.foot * k), tall = Math.max(.5, l.tall! * e.mesh.scale.y);
      const badge = eliteBadge(e.elite)!;
      // The ground ring, breathing slowly.
      this.s.setScalar(foot * (1.22 + Math.sin(this.time * 2.4 + e.homeX) * .04)); this.v.set(p.x, ground + .04, p.z); this.m.compose(this.v, this.q.identity(), this.s);
      this.ring.setMatrixAt(rings, this.m); this.ring.setColorAt(rings, this.c.set(badge.color)); rings++;
      if (e.elite === 'shielded' && e.barrier && e.barrier.open <= 0 && this.barrier) {
        l.grow = Math.min(1, l.grow + dt / .45); l.flash = Math.max(0, l.flash - dt);
        const grow = 1 - Math.pow(1 - l.grow, 3), k = l.flash / .25;
        this.q.setFromAxisAngle(this.up, this.time * .35 + e.homeZ); const g = Math.max(.05, grow); this.s.set(foot * .95 * g, tall * .85 * g, foot * .95 * g); this.v.set(p.x, ground, p.z); this.m.compose(this.v, this.q, this.s);
        this.barrier.setMatrixAt(barriers, this.m); this.barrier.setColorAt(barriers, this.c.set('#e4fbff').lerp(new T.Color('#ffffff'), k).multiplyScalar(1 + k * .8)); barriers++;
        for (let i = 0; i < Math.min(3, e.barrier.cracks); i++) this.cracks[i].setMatrixAt(cracks[i]++, this.m);
      }
      if ((e.elite === 'splitter' || e.elite === 'mini') && this.cores) {
        // The cores inside the body: two for the splitter (the two it will become), drifting round each other.
        const size = e.elite === 'mini' ? 1.05 : 1.5, h = e.mesh.scale.y;
        this.q.setFromAxisAngle(this.up, this.time * 1.6 + e.homeX); this.s.set(r * size, r * size * (1 + Math.sin(this.time * 5 + e.homeZ) * .08), r * size);
        this.v.set(p.x, p.y - r * size * .18 + 0 * h, p.z); this.m.compose(this.v, this.q, this.s); this.cores.setMatrixAt(cores++, this.m);
      }
      if (rings >= CAP) break;
    }
    this.put(this.ring, rings); if (this.barrier) this.put(this.barrier, barriers); this.cracks.forEach((m, i) => this.put(m, cracks[i])); if (this.cores) this.put(this.cores, cores);
    this.shown = true;
  }
  private put(mesh: T.InstancedMesh, count: number) {
    mesh.count = count; mesh.visible = count > 0; if (!count) return;
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  private hide() { if (!this.shown) return; this.shown = false; for (const m of [this.ring, this.barrier, ...this.cracks, this.cores]) if (m) { m.count = 0; m.visible = false; } }
  /** The splitter's body (and its children's) turns see-through jelly: its own material copies (made for the hit flash). */
  private glass(e: Enemy) {
    e.mesh.traverse(o => { if (!(o instanceof T.Mesh) || o.userData.outline) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.transparent = true; m.opacity = .78; m.depthWrite = false; m.needsUpdate = true; } });
    // The ink outline would show through the jelly as a dark core: a see-through body drops it (the role's ring marks its edge).
    for (const hull of (e.mesh.userData.outlines ?? []) as T.Mesh[]) hull.visible = false; e.mesh.userData.outlines = []; e.mesh.userData.outlined = false;
  }
  private meet(e: Enemy) {
    const role = e.elite === 'mini' ? null : ELITE_ROLES[e.elite as EliteRoleId];
    if (!role || this.seen.has(role.id) || Math.hypot(e.x - this.world.position.x, e.z - this.world.position.z) > 18) { if (role && !this.seen.has(role.id)) this.looks.get(e)!.seen = false; return; }
    this.seen.add(role.id); rememberRole(role.id); this.toast(t(role.toast), role.icon);
  }
  private pop(e: Enemy) {
    const fx = this.world.fx; if (!fx) return; const at = { x: e.x, y: e.mesh.position.y, z: e.z };
    fx.burst(at, { n: 8, color: ['#ff6fae', '#ffc2dd', '#ffffff'], size: .12, speed: 3, up: 4, y: .4, life: .5 });
  }
  /** Rule events from world.ts (solo, the host, and the server's word online). */
  event(e: Enemy, event: EliteEvent) {
    const fx = this.world.fx, l = this.look(e), at = { x: e.x, y: e.mesh.position.y, z: e.z }, chest = at.y + e.radius * 1.1;
    if (event === 'deflect') {
      l.flash = .25; if (!fx) return;
      fx.ring({ x: e.x, z: e.z }, { color: '#bff4ff', from: e.radius * .9, to: e.radius * 1.5, life: .25, y: chest, thick: .2, opacity: .9 });
      if (this.time - (l.said ?? -9) < .6) return; l.said = this.time; // one word at a time, however fast the shots come
      fx.text({ x: e.x, y: at.y + 1.1, z: e.z }, t('🛡️ Deflected'), 'dmg block', e.id + ':deflect');
    } else if (event === 'crack') {
      l.flash = .15; fx?.burst({ ...at, y: chest }, { n: 5, color: SHARD, size: .08, speed: 4, up: 3, y: 0, life: .4 });
    } else if (event === 'break') {
      l.grow = 0; if (!fx) return;
      fx.burst({ ...at, y: chest }, { n: 22, color: SHARD, size: .16, speed: 7, up: 6, y: 0, life: .8, glow: true });
      fx.ring({ x: e.x, z: e.z }, { color: '#9be9ff', from: e.radius, to: e.radius * 2.4, life: .4, y: .1, thick: .3 });
      fx.text({ x: e.x, y: at.y + 1.4, z: e.z }, t('Shell broken!'), 'crit big'); fx.shake(.18);
    } else if (event === 'regrow') {
      l.grow = 0; fx?.burst({ ...at, y: chest }, { n: 10, color: SHARD, size: .1, speed: -3, up: 0, y: 0, life: .45, glow: true, gravity: 0 });
    } else if (event === 'split') {
      if (!fx) return;
      fx.burst({ ...at, y: at.y + .5 }, { n: 18, color: ['#ff6fae', '#ffc2dd', '#ffffff'], size: .15, speed: 6, up: 6, y: 0, life: .7, glow: true });
      fx.text({ x: e.x, y: at.y + 1.3, z: e.z }, t('Split!'), 'crit');
    }
  }
  /** Draw calls this view adds right now. */
  get draws() { return [this.ring, this.barrier, ...this.cracks, this.cores].filter(m => m?.visible && m.count > 0).length; }
}
