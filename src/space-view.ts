import * as T from 'three';
import { PLANETS, type PlanetId } from './model.ts';
import { STAR_MAP, type SpaceFlight, type AsteroidKind } from './space.ts';
import { gatherPart, type KitLibrary, type KitPart } from './assets.ts';
import { toonMaterial } from './toon.ts';

/** Soft round glows for nebulae and planet halos, drawn once per colour. */
const glowTextures = new Map<string, T.CanvasTexture>();
function glow(color: string) {
  let texture = glowTextures.get(color);
  if (texture) return texture;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; glowTextures.set(color, texture);
  return texture;
}
const hash = (x: number, y: number, z: number) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise, used to paint continents on the planets. */
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let total = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    total += hash(ix + a, iy + b, iz + c) * (a ? sx : 1 - sx) * (b ? sy : 1 - sy) * (c ? sz : 1 - sz);
  return total;
}
function toonRamp() {
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const texture = new T.DataTexture(data, 3, 1); texture.minFilter = texture.magFilter = T.NearestFilter; texture.needsUpdate = true;
  return texture;
}
const random = (() => { let seed = 99; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; })();
const between = (a: number, b: number) => a + random() * (b - a);

interface PlanetView { id: PlanetId; group: T.Group; label: HTMLElement }
interface Spark { life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; color: T.Color }

export class SpaceView {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(45, 1, 1, 1200);
  shake = 0;
  private planets: PlanetView[] = [];
  private ship = new T.Group(); private flame: T.Object3D | null = null; private shipLight = new T.PointLight('#ffb13d', 0, 18, 1.5);
  private dust: T.InstancedMesh[] = []; private sparks: Spark[] = []; private sparkMesh!: T.InstancedMesh;
  private camPos: T.Vector3 | null = null; private lastYaw: number | null = null; private built = false; private shipFromKit = false;
  private matrix = new T.Matrix4(); private quaternion = new T.Quaternion(); private scale = new T.Vector3(); private point = new T.Vector3();
  private ray = new T.Raycaster(); private plane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  constructor(private labelRoot: HTMLElement, private kit: KitLibrary) {}

  /** Builds the sky once; asteroids and stardust come from the flight's layout. */
  build(flight: SpaceFlight, lowDetail = false) {
    if (this.built) { this.refreshShip(); return; }
    this.built = true;
    const scene = this.scene;
    scene.background = new T.Color('#120a2a');
    scene.add(new T.HemisphereLight('#c8d8ff', '#3a2a6a', 1.6));
    const sun = new T.DirectionalLight('#fff4e0', 2.2); sun.position.set(-60, 100, 40); scene.add(sun);
    // Three layers of stars at different depths drift at different speeds as the ship moves.
    for (const [count, y, size, color] of [[2200, -40, 1.2, '#ffffff'], [1400, -120, 2.2, '#cfe0ff'], [500, -260, 4, '#ffe9b0']] as const) {
      const n = Math.round(count * (lowDetail ? .45 : 1)), positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) positions.set([between(-1600, 1600), y + between(-10, 10), between(-1600, 1600)], i * 3);
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
      scene.add(new T.Points(geometry, new T.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: .9, depthWrite: false })));
    }
    const nebulae = ['rgba(255,110,200,.55)', 'rgba(110,160,255,.5)', 'rgba(160,110,255,.5)', 'rgba(110,240,220,.4)'];
    for (let i = 0; i < (lowDetail ? 14 : 26); i++) {
      const cloud = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: glow(nebulae[i % nebulae.length]), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      cloud.position.set(between(-900, 900), -300, between(-900, 900)); cloud.scale.setScalar(between(180, 420)); scene.add(cloud);
    }
    const ramp = toonRamp();
    for (const spot of Object.values(STAR_MAP)) {
      const def = PLANETS[spot.id], [low, high, accent] = def.grad.map(c => new T.Color(c));
      const geometry = new T.IcosahedronGeometry(spot.r, lowDetail ? 3 : 5), position = geometry.attributes.position, colors = new Float32Array(position.count * 3), c = new T.Color();
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i) / spot.r, y = position.getY(i) / spot.r, z = position.getZ(i) / spot.r;
        const f = noise(x * 3 + 5, y * 3, z * 3) * .7 + noise(x * 8, y * 8, z * 8) * .3;
        if (spot.id === 'home') c.copy(f > .5 ? low : accent).lerp(high, f > .5 ? (f - .5) * 1.5 : 0);
        else c.copy(low).lerp(high, T.MathUtils.smoothstep(f, .35, .7)).lerp(accent, Math.max(0, f - .7) * 2.5);
        if (Math.abs(y) > .85 && spot.id !== 'lava') c.lerp(new T.Color('#ffffff'), (Math.abs(y) - .85) * 6);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      const group = new T.Group();
      group.add(new T.Mesh(geometry, new T.MeshToonMaterial({ vertexColors: true, gradientMap: ramp, emissive: spot.id === 'lava' ? '#5a1a08' : '#000000' })));
      group.add(new T.Mesh(new T.SphereGeometry(spot.r * 1.12, 32, 20), new T.MeshBasicMaterial({ color: def.grad[0], transparent: true, opacity: .22, side: T.BackSide, depthWrite: false })));
      const halo = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: glow(def.grad[0]), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .6 }));
      halo.scale.setScalar(spot.r * 3.4); halo.position.y = -spot.r * .2; group.add(halo);
      if (spot.ring) {
        const ring = new T.Mesh(new T.RingGeometry(spot.r * 1.35, spot.r * 1.8, 64).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: spot.ring, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false }));
        ring.rotation.z = .35; group.add(ring);
      }
      group.position.set(spot.x, -spot.r - 3, spot.z); scene.add(group);
      const label = document.createElement('div'); label.className = 'space-label'; this.labelRoot.append(label);
      this.planets.push({ id: spot.id, group, label });
    }
    this.buildAsteroids(flight);
    this.dust = this.instanced('stardust', flight.layout.dust.length, () => this.fallbackStar());
    for (const mesh of this.dust) scene.add(mesh);
    this.ship.rotation.order = 'YXZ'; this.ship.add(this.shipLight); scene.add(this.ship); this.refreshShip();
    this.sparkMesh = new T.InstancedMesh(new T.SphereGeometry(.35, 8, 6), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending }), 140);
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < 140; i++) { this.sparks.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, color: new T.Color() }); this.sparkMesh.setColorAt(i, new T.Color('#ffb13d')); this.sparkMesh.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0)); }
    scene.add(this.sparkMesh);
  }

  /** Swaps the simple ship for the Blender one once the space kit has loaded. */
  refreshShip() {
    if (this.shipFromKit && this.flame) return;
    const model = this.kit.ready ? this.kit.instance('ship') : null;
    if (model) gatherPart(model, 'flame');
    for (const child of [...this.ship.children]) if (child !== this.shipLight) this.ship.remove(child);
    const body = model ?? this.fallbackShip(), holder = new T.Group();
    // The rocket stands on its engine. Laid down nose-first along the heading with its
    // porthole facing up, and centred on the flight position.
    body.rotation.x = -Math.PI / 2; body.scale.setScalar(.7); body.position.z = 1.68; holder.rotation.y = Math.PI; holder.add(body);
    this.ship.add(holder); this.flame = body.getObjectByName('flame') ?? null; this.shipFromKit = !!model;
  }

  private buildAsteroids(flight: SpaceFlight) {
    const byKind = new Map<AsteroidKind, typeof flight.layout.asteroids>();
    for (const rock of flight.layout.asteroids) { const list = byKind.get(rock.kind) ?? []; list.push(rock); byKind.set(rock.kind, list); }
    for (const [kind, rocks] of byKind) {
      const meshes = this.instanced(`asteroid_${kind}`, rocks.length, () => this.fallbackRock(kind));
      for (const mesh of meshes) {
        rocks.forEach((rock, i) => {
          this.quaternion.setFromEuler(new T.Euler(rock.spin, rock.spin * 1.7, rock.spin * .6)); this.scale.setScalar(rock.scale);
          this.matrix.compose(this.point.set(rock.x, -1, rock.z), this.quaternion, this.scale).multiply(mesh.userData.part as T.Matrix4);
          mesh.setMatrixAt(i, this.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.scene.add(mesh);
      }
    }
  }

  /** One instanced mesh per part of a kit model (or of its simple stand-in). */
  private instanced(name: string, count: number, fallback: () => KitPart[]) {
    const parts = (this.kit.ready ? this.kit.parts(name) : undefined) ?? fallback();
    return parts.map(part => { const mesh = new T.InstancedMesh(part.geometry, part.material, count); mesh.userData.part = part.matrix; return mesh; });
  }
  private fallbackRock(kind: AsteroidKind): KitPart[] {
    const color = kind === 'ice' ? '#bfe6ff' : kind === 'lava' ? '#5a4048' : '#9a8a7e';
    return [{ geometry: new T.DodecahedronGeometry(1, 0), material: toonMaterial({ color, flatShading: true, emissive: kind === 'lava' ? '#5a1a08' : '#000000' }), matrix: new T.Matrix4(), name: 'rock' }];
  }
  private fallbackStar(): KitPart[] {
    const shape = new T.Shape();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? .22 : .5; if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geometry = new T.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false }).center();
    return [{ geometry, material: toonMaterial({ color: '#ffe45c', emissive: '#ffcc33', emissiveIntensity: 1.6 }), matrix: new T.Matrix4(), name: 'stardust' }];
  }
  private fallbackShip() {
    const g = new T.Group(), white = toonMaterial({ color: '#fffaf1' }), red = toonMaterial({ color: '#ed3549' });
    const body = new T.Mesh(new T.CylinderGeometry(.8, .95, 3.3, 16), white); body.position.y = 2.25;
    const nose = new T.Mesh(new T.ConeGeometry(.81, 1.4, 16), red); nose.position.y = 4.6;
    g.add(body, nose);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, fin = new T.Mesh(new T.ConeGeometry(.65, 1.9, 3), red); fin.position.set(Math.cos(a) * .98, 1, Math.sin(a) * .98); fin.rotation.y = -a; g.add(fin); }
    const flame = new T.Mesh(new T.ConeGeometry(.55, 1.6, 12).translate(0, -.8, 0).rotateX(Math.PI), new T.MeshBasicMaterial({ color: '#ffb13d' }));
    flame.name = 'flame'; flame.position.y = .5; g.add(flame);
    return g;
  }

  /** The point on the flight plane under a screen position, for steering. */
  aimAt(ndcX: number, ndcY: number) {
    this.ray.setFromCamera(new T.Vector2(ndcX, ndcY), this.camera);
    return this.ray.ray.intersectPlane(this.plane, this.point) ? { x: this.point.x, z: this.point.z } : null;
  }

  update(dt: number, flight: SpaceFlight, discovered: ReadonlySet<PlanetId>, level: number, width: number, height: number) {
    const time = flight.time;
    for (const p of this.planets) p.group.rotation.y += dt * .05;
    // Stardust spins and bobs where the flight has put it.
    flight.layout.dust.forEach((d, i) => {
      this.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), time * 2 + d.id); this.scale.setScalar(2.4);
      for (const mesh of this.dust) { this.matrix.compose(this.point.set(d.x, Math.sin(time * 2 + d.x) * .3, d.z), this.quaternion, this.scale).multiply(mesh.userData.part as T.Matrix4); mesh.setMatrixAt(i, this.matrix); }
    });
    for (const mesh of this.dust) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    // The ship banks into turns and shrinks while it spirals down to land.
    this.ship.position.set(flight.x, 0, flight.z); this.ship.rotation.y = flight.yaw;
    const yawRate = this.lastYaw === null ? 0 : Math.atan2(Math.sin(flight.yaw - this.lastYaw), Math.cos(flight.yaw - this.lastYaw)) / Math.max(dt, .001);
    this.lastYaw = flight.yaw; this.ship.rotation.z = T.MathUtils.lerp(this.ship.rotation.z, T.MathUtils.clamp(-yawRate * .25, -.6, .6), Math.min(1, dt * 6));
    this.ship.scale.setScalar(flight.landingScale);
    const burning = flight.thrusting || !!flight.landing;
    if (this.flame) { this.flame.visible = burning; if (burning) this.flame.scale.set(1 + Math.sin(time * 50) * .15, (flight.boosting ? 1.8 : 1.1) + Math.random() * .5, 1 + Math.sin(time * 43) * .15); }
    this.shipLight.intensity = burning ? flight.boosting ? 8 : 4 : 0;
    if (burning) this.emit(flight.boosting ? 3 : 1, flight);
    let i = 0;
    for (const s of this.sparks) {
      if (s.life > 0) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; }
      const size = s.life > 0 ? Math.max(.01, s.life * 2.2) : 0;
      this.matrix.makeScale(size, size, size).setPosition(s.x, s.y, s.z); this.sparkMesh.setMatrixAt(i, this.matrix); this.sparkMesh.setColorAt(i, s.color); i++;
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true; if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
    // The camera rises and trails further back as the ship speeds up.
    const speed = flight.speed, target = new T.Vector3(flight.x, 46 + speed * .5, flight.z + 26 + speed * .3);
    this.camPos ??= target.clone(); this.camPos.lerp(target, 1 - Math.exp(-dt * 4)); this.camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; this.camera.position.x += (Math.random() - .5) * this.shake; this.camera.position.z += (Math.random() - .5) * this.shake; }
    this.camera.lookAt(flight.x, 0, flight.z); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    for (const p of this.planets) {
      const spot = STAR_MAP[p.id], def = PLANETS[p.id];
      this.point.set(spot.x, 0, spot.z - spot.r * .9).project(this.camera);
      const shown = this.point.z < 1 && Math.abs(this.point.x) < 1.2 && Math.abs(this.point.y) < 1.2;
      p.label.style.display = shown ? 'block' : 'none';
      if (!shown) continue;
      p.label.style.transform = `translate(${(this.point.x * .5 + .5) * width}px,${(-this.point.y * .5 + .5) * height}px) translate(-50%,-100%)`;
      const known = discovered.has(p.id), text = known ? `${def.icon} ${def.name}${level < def.level ? ` <span>🔒 Level ${def.level}</span>` : ''}` : '❓ Mysterious planet';
      if (p.label.innerHTML !== text) p.label.innerHTML = text;
      p.label.classList.toggle('unknown', !known);
    }
  }

  private emit(count: number, flight: SpaceFlight) {
    const back = new T.Vector3(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
    for (let n = 0; n < count; n++) {
      const s = this.sparks.find(p => p.life <= 0); if (!s) return;
      const scale = flight.landingScale;
      s.x = flight.x + back.x * 2.6 * scale + between(-.3, .3); s.y = between(-.3, .3); s.z = flight.z + back.z * 2.6 * scale + between(-.3, .3);
      const v = between(6, 12); s.vx = back.x * v + flight.vx * .5; s.vy = 0; s.vz = back.z * v + flight.vz * .5;
      s.color.set(Math.random() < .5 ? flight.boosting ? '#8ef6ff' : '#ffb13d' : '#fff27a'); s.life = between(.3, .6);
    }
  }

  /** The round radar: stardust nearby, known planets, and blinking "?" signals for unknown ones. */
  drawRadar(ctx: CanvasRenderingContext2D, flight: SpaceFlight, discovered: ReadonlySet<PlanetId>, time: number) {
    const scale = 67 / 300;
    ctx.clearRect(0, 0, 150, 150); ctx.save(); ctx.beginPath(); ctx.arc(75, 75, 73, 0, 7); ctx.clip();
    ctx.fillStyle = '#1c1244'; ctx.fillRect(0, 0, 150, 150); ctx.strokeStyle = 'rgba(142,246,255,.25)'; ctx.lineWidth = 1;
    for (const f of [.33, .66]) { ctx.beginPath(); ctx.arc(75, 75, 71 * f, 0, 7); ctx.stroke(); }
    const sweep = time * 1.5 % (Math.PI * 2);
    ctx.fillStyle = 'rgba(142,246,255,.12)'; ctx.beginPath(); ctx.moveTo(75, 75); ctx.arc(75, 75, 75, sweep, sweep + .5); ctx.fill();
    ctx.fillStyle = '#ffe45c';
    for (const d of flight.layout.dust) { const dx = d.x - flight.x, dz = d.z - flight.z; if (Math.hypot(dx, dz) < 300) ctx.fillRect(75 + dx * scale - 1, 75 + dz * scale - 1, 2, 2); }
    for (const spot of Object.values(STAR_MAP)) {
      const dx = spot.x - flight.x, dz = spot.z - flight.z, d = Math.hypot(dx, dz), known = discovered.has(spot.id);
      if (!known && d > 440) continue;
      const outside = d * scale > 63; let px = 75 + dx * scale, pz = 75 + dz * scale;
      if (outside) { px = 75 + dx / d * 63; pz = 75 + dz / d * 63; }
      if (known) { ctx.fillStyle = PLANETS[spot.id].grad[1]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, pz, outside ? 6 : Math.max(5, spot.r * scale), 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = `rgba(255,255,255,${.35 + (.5 + Math.sin(time * 5) * .5) * .6})`; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', px, pz + 5); }
    }
    ctx.translate(75, 75); ctx.rotate(-flight.yaw + Math.PI); ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  render(renderer: T.WebGLRenderer) { renderer.render(this.scene, this.camera); }
  /** Hides the planet labels when leaving space. */
  hideLabels() { for (const p of this.planets) p.label.style.display = 'none'; this.camPos = null; this.lastYaw = null; }
}
