import { DECOR, planDecor, kitsFor, type DecorPlacement } from './biomes.ts';
import { buildScatter, disposeScatter } from './scatter.ts';
import { buildGround } from './ground.ts';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeModel, gatherPart, refinedAssets, sceneryKit, cropKit, heroKit, wearKit, weaponKit, disguiseKit, petKit, spaceKit, wildsKit, brightKit, harshKit, isShared, type RefinedAsset, type RefinedAssetLibrary } from './assets.ts';
import { Effects } from './fx.ts';
import { CAMERA, FOG, SHADOW, cameraOffset, followBlend, lightAxes, shadowBox, viewFootprint } from './camera-rig.ts';
import type { QualityProfile } from './graphics.ts';
import { approach, blocked, clearSegment, findRoute, someObstacleNear, WORLD_BOUNDS, type Point, type NavigationOptions } from './navigation.ts';
import { attackRange } from './combat.ts';
import { type SaveState, type PlanetId, PLANETS, cropProgress, giftAvailable, maxHp } from './model.ts';
import * as M from './model.ts';
import {EnvironmentSimulation,createEnvironmentLayout,environmentWalkable,inWater,terrainHeight,zoneAt,type EnvironmentStatus,type EnvironmentEvent,type LightningState} from './environments.ts';
import {EnvironmentView} from './environment-art.ts';
import {buildDecoration} from './decorations-art.ts';
import {bossPhase,bossSkill,bossTelegraphs,BOSS_WINDUPS,type BossSkill} from './boss-patterns.ts';
import {LAVA_ORE_RULES,type LavaWeatherSnapshot} from './lava-weather.ts';
import {ENEMY_TYPES,HOME_SPAWNS,PLANET_SPAWNS,PLANET_BOSSES,type EnemyDefinition} from './enemy-types.ts';

export interface Entity { id: string; kind: string; name: string; icon: string; mesh: T.Group; x: number; z: number; radius: number; index?: number;waterId?:string;
  /** Swimmable water of a pond: half-extents of its ellipse and the height of the surface. */
  pond?:{rx:number;rz:number;surface:number} }
export interface Enemy extends Entity { hp: number; maxHp: number; damage: number; xp: number; homeX: number; homeZ: number; cooldown: number; respawn: number; boss: boolean; stun: number;type?:string;definition?:EnemyDefinition;phase?:string;phaseTime?:number;route?:Point[];routeTime?:number;lift?:number;liftVelocity?:number;statuses?:Record<string,number>;targetX?:number;targetZ?:number;bossStage?:number;attackCount?:number;skillCount?:number;skill?:BossSkill;telegraphs?:Array<{x:number;z:number;r:number;delay:number}>;skillEffects?:Array<{x:number;z:number;r:number;inner:number;remaining:number;multiplier:number}>;spinTick?:number;scaled?:boolean;baseMaxHp?:number;baseDamage?:number;level?:number;flash?:number;flashLit?:boolean;knockVX?:number;knockVZ?:number;dying?:number }
interface Obstacle { x: number; z: number; r: number;tag?:string }
export interface RemotePose {id?:string;x:number;z:number;y?:number;facing?:number;color?:string;name?:string;planet?:PlanetId;moving?:boolean;gear?:SaveState['gear'];hp?:number;level?:number}
export interface EnemyShotSnapshot {id:string;x:number;y:number;z:number;vx:number;vz:number;life:number;damage:number;targetEnemyId?:string}
export interface EnemySnapshot {id:string;type?:string;x:number;z:number;hp:number;maxHp:number;respawn:number;phase?:string;facing?:number;lift?:number;boss?:boolean;phaseTime?:number;stun?:number;statuses?:Record<string,number>;cooldown?:number;targetX?:number;targetZ?:number;bossStage?:number;skill?:BossSkill;attackCount?:number;skillCount?:number;telegraphs?:Enemy['telegraphs'];skillEffects?:Enemy['skillEffects'];spinTick?:number;damage?:number;shots?:EnemyShotSnapshot[]}
export interface EnvironmentSnapshot {time:number;lamps:Array<[number,number]>;eclipseUntil?:number;weather?:LavaWeatherSnapshot;nestLevel?:number;fireRain?:EnvironmentSimulation['fireRain'];lightning?:LightningState}
export interface EnvironmentAction {kind:'light-pillar'|'collect-ore';id:string;index?:number}
export interface EnvironmentReward {id:string;count:number}
type Particle = { mesh: T.Mesh; velocity: T.Vector3; life: number; max: number };
const UP = new T.Vector3(0, 1, 0);
const matCache = new Map<string, T.MeshStandardMaterial>();
const ENTITY_ASSETS: Partial<Record<string, RefinedAsset>> = { home: 'cottage', sell: 'market', shop: 'outfitters', plot: 'garden', upgrade: 'crystal', chest: 'chest', craft: 'workshop', cook: 'kitchen' };
// Planet palettes for the shared scenery kit (material name → colour). Home uses the kit's own colours.
const SCENERY_KITS = { scenery: sceneryKit, wilds: wildsKit, bright: brightKit, harsh: harshKit };
const KIT_TINTS: Partial<Record<PlanetId, Record<string, string>>> = {
  // "A" is the darker lower lobe, "B" the lighter crown on top.
  candy: { 'Leaf A': '#ff7fb8', 'Leaf B': '#ffb8d9', 'Blossom A': '#a97cff', 'Blossom B': '#dcc8ff', 'Pine A': '#ff8a5c', 'Pine B': '#ffc49a', Bark: '#b06a52', Grass: '#ff9ccf', Rock: '#d7a3e8' },
  ice: { 'Leaf A': '#8fcbe6', 'Leaf B': '#dcf5ff', 'Blossom A': '#b5e2fa', 'Blossom B': '#ecfaff', 'Pine A': '#7fbcd8', 'Pine B': '#d0f0fb', Bark: '#8b9db5', Grass: '#c6ecf7', Rock: '#b9d6e6' },
  lava: { 'Leaf A': '#7e3f36', 'Leaf B': '#b0604a', 'Blossom A': '#ff6a2a', 'Blossom B': '#ffb36b', 'Pine A': '#6a3a32', 'Pine B': '#9a5a48', Bark: '#4a3434', Grass: '#8c5a48', Rock: '#5e4553' },
  toy: { 'Leaf A': '#34b84a', 'Leaf B': '#8fe06a', 'Pine A': '#2f8fe0', 'Pine B': '#7cc8ff' },
  jungle: { 'Leaf A': '#1c8a3a', 'Leaf B': '#3cc04e', 'Pine A': '#18763a', 'Pine B': '#2fae52', Grass: '#3fbf4f' },
  shadow: { 'Leaf A': '#554a96', 'Leaf B': '#8f7fd6', 'Blossom A': '#8f6ff0', 'Blossom B': '#d3c3ff', 'Pine A': '#4a4080', 'Pine B': '#7a6cc0', Bark: '#3e3656', Grass: '#73699b', Rock: '#6d6690' },
};
function material(color: string, flat = true) {
  const key = color + flat;
  if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.9 }));
  return matCache.get(key)!;
}
function mesh(geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, material(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function ball(color: string, radius: number, x = 0, y = 0, z = 0, detail = 1) { return mesh(new T.IcosahedronGeometry(radius, detail), color, x, y, z); }
function box(color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0) { return mesh(new T.BoxGeometry(w, h, d), color, x, y, z); }
function cyl(color: string, top: number, bottom: number, h: number, x = 0, y = 0, z = 0, sides = 12) { return mesh(new T.CylinderGeometry(top, bottom, h, sides), color, x, y, z); }
function group(...children: T.Object3D[]) { const g = new T.Group(); if(children.length)g.add(...children); return g; }
function seeded(seed: number) { return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; }; }
/**
 * The explorer model stands 2.3 m, the reference's hero 1.79 m. At 0.84 (about 1.95 m, the head is
 * bigger) the explorer is as tall on screen under the reference camera as the reference's hero in
 * fights: 105-120 CSS px on a 1440x900 desktop, 73-87 px on a 390x844 phone. Explorers online match.
 */
export const HERO_SCALE = .84;

export class World {
  scene = new T.Scene(); camera = new T.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far); renderer: T.WebGLRenderer;
  root = new T.Group(); player = new T.Group(); companion = new T.Group(); entities: Entity[] = []; enemies: Enemy[] = [];
  position = new T.Vector3(0, 0, 1); destination: T.Vector3 | null = null; route: T.Vector3[] = [];
  selected: Entity | null = null; obstacles: Obstacle[] = []; particles: Particle[] = [];
  keys = new Set<string>(); facing = 0; moving = false; time = 0; zoom = 1; planet: PlanetId = 'home';
  marker: T.Mesh; ring: T.Mesh; raycaster = new T.Raycaster(); plotMeshes: T.Group[] = []; cropSignatures: string[] = [];
  aim = new T.Vector3(); cameraTarget = new T.Vector3(); distanceToInteract = 2;
  /** While set, the camera follows this point (the starship) instead of the explorer. */
  cameraFocus: T.Vector3 | null = null;
  /** Camera position relative to cameraTarget for the current screen and zoom (set by resize). */
  viewOffset = cameraOffset(16 / 9);
  /** The explorer is inside the starship: hidden, with the companion. */
  boarded = false;
  onInteract: (e: Entity) => void = () => {}; onAttackEnemy: (e: Enemy) => void = () => {}; onDamage: (amount: number,source?:'melee'|'shot'|'hazard') => void = () => {};
  onZone: (name: string) => void = () => {}; lastZone = ''; hazardTimer = 0;
  /** Called after every world build, so views such as the fishing ponds can restock. */
  onBuilt?: () => void;
  /** A creature has just noticed the explorer. */
  onAlert?: (e: Enemy) => void;
  environment!:EnvironmentSimulation;environmentView!:EnvironmentView;movementLocked=false;playerFlying=false;playerStealth=false;
  networkRole:'host'|'peer'|null=null;remotePlayers=new Map<string,{mesh:T.Group;pose:RemotePose}>();remoteRoot=new T.Group();
  onRemoteDamage:(id:string,amount:number,source?:'melee'|'shot'|'hazard')=>void=()=>{};
  onEnvironmentEvent:(event:EnvironmentEvent)=>void=()=>{};
  onEnvironmentAction:(action:EnvironmentAction)=>void=()=>{};
  onHazardEnemy:(enemy:Enemy,amount:number)=>void=(enemy,amount)=>this.damageEnemy(enemy,amount,0,true);
  private dynamicObstacles:Obstacle[]=[];private environmentSignature='';private gateHits=0;private resourceTimers=new Map<string,number>();
  private enemyShots:Array<{id:string;ownerId:string;mesh:T.Mesh;vx:number;vz:number;life:number;damage:number;targetId?:string;targetEnemyId?:string}>=[];
  private sun: T.DirectionalLight; private cropMaterials: T.Material[] = [];
  /** Pooled particles, rings, flashes, floating text, camera shake and hit-stop. */
  fx?: Effects;
  // Player animation timers set by combat and fishing.
  punchT=0; punchArm=0; swingT=0; aimT=0; hurtT=0; spinT=0; landT=0; castT=0; fishing:'idle'|'cast'|'wait'|'fight'='idle';
  walkClock=0; weaponKind:'fist'|'sword'|'gun'|'rod'='fist'; pose:{kind:'dash'|'slam';t:number}|null=null; fishTension=0; invulnerable=false;
  private shakeOffset=new T.Vector3(); private playerMaterials:T.MeshStandardMaterial[]=[];
  canvas: HTMLCanvasElement; state: SaveState;
  constructor(canvas: HTMLCanvasElement, state: SaveState, options: { antialias?: boolean } = {}) {
    this.canvas=canvas;this.state=state;
    // High-density phone screens skip multisampling; their pixels are already small.
    this.renderer = new T.WebGLRenderer({ canvas, antialias: options.antialias ?? true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap; this.renderer.outputColorSpace = T.SRGBColorSpace;
    // Neutral tone mapping keeps the toy palette saturated; ACES washed the golds and pinks out.
    this.renderer.toneMapping = T.NeutralToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.scene.add(new T.HemisphereLight('#fff5df', '#7fa174', 1.75));
    this.sun = new T.DirectionalLight('#fff0d0', 2.25); this.sun.position.set(-15, 35, 18); this.sun.castShadow = true;
    // The shadow box covers the ground in view with a margin (resize fits it); a tighter box means sharper shadows.
    this.sun.shadow.mapSize.set(1024, 1024); Object.assign(this.sun.shadow.camera, { near: SHADOW.near, far: SHADOW.far });
    this.sun.shadow.bias = SHADOW.bias; this.sun.shadow.normalBias = SHADOW.normalBias;
    this.scene.add(this.sun, this.sun.target, this.root,this.remoteRoot);
    this.marker = mesh(new T.RingGeometry(0.22, 0.32, 32), '#ffffff'); this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.09; this.marker.visible = false; this.scene.add(this.marker);
    this.ring = mesh(new T.RingGeometry(0.7, 0.8, 32), '#fff09d'); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.12; this.ring.visible = false; this.scene.add(this.ring);
    this.fx = new Effects(this.scene, this.camera);
    this.build(state.planet); this.refreshPlayer(); this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    // The reference camera (camera-rig.ts): portrait phones sit 1.3x further back and see about ±4.75 m across.
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    cameraOffset(aspect, this.zoom, this.viewOffset);
    // The shadow box hugs the ground in view, in the light's own axes: sharp up close, wide enough when zoomed out.
    const shadow=this.sun?.shadow?.camera;
    if(shadow){Object.assign(shadow,shadowBox(viewFootprint(aspect,this.zoom),this.sunAxes??=lightAxes(this.sunOffset)));shadow.updateProjectionMatrix();}
  }
  setQuality(low: boolean) { this.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.75)); this.renderer.shadowMap.enabled = !low; this.resize(); }
  /** Apply a graphics profile: render resolution, shadow map size (0 turns shadows off) and particle density. */
  applyGraphics(profile: QualityProfile, ratio: number) {
    this.renderer.setPixelRatio(ratio);
    const size = profile.shadow, shadows = size > 0, toggled = this.renderer.shadowMap.enabled !== shadows;
    this.renderer.shadowMap.enabled = shadows; this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); (this.sun.shadow as { map: T.WebGLRenderTarget | null }).map = null;
    }
    // Switching shadows on or off changes every lit material's shader.
    if (toggled) this.scene.traverse(o => { if (o instanceof T.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true; });
    if (this.fx) this.fx.density = profile.particles;
    // Battery saver draws half of the grass and flowers; trees and rocks always stay.
    const detail = profile.particles < .6 ? .5 : 1;
    if (detail !== this.detail) { this.detail = detail; if (this.scatterGroup) this.refreshScenery(); }
    this.resize();
  }
  disposeTree(g: T.Object3D) { g.traverse(o => { if (o instanceof T.Mesh) { if (!isShared(o.geometry)) o.geometry.dispose(); for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (!isShared(material) && ![...matCache.values()].includes(material as T.MeshStandardMaterial)) material.dispose(); } }); }
  applyRefinedAssets(assets: RefinedAssetLibrary = refinedAssets) {
    for (const entity of this.entities) { this.applyRefinedAsset(entity, assets); if (entity.kind === 'travel') this.dressRocket(entity); }
    // Props such as the well are scenery with their own model, kept out of batching.
    for (const prop of this.root.children.filter(o => o.userData.prop && o.userData.refinedAsset !== o.userData.prop)) {
      const visual = assets.clone(prop.userData.prop as RefinedAsset);
      if (!visual) continue;
      for (const child of [...prop.children]) { prop.remove(child); this.disposeTree(child); }
      prop.add(visual); prop.userData.refinedAsset = prop.userData.prop;
    }
  }
  private applyRefinedAsset(entity: Entity, assets: RefinedAssetLibrary = refinedAssets) {
    const asset = ENTITY_ASSETS[entity.kind];
    if (!asset || entity.mesh.userData.refinedAsset === asset) return;
    const visual = assets.clone(asset);
    if (!visual) return;
    // Preserve the entity wrapper for targeting and the live crop group for growth.
    const crops = entity.kind === 'plot' && entity.index !== undefined ? this.plotMeshes[entity.index] : undefined;
    for (const child of [...entity.mesh.children]) {
      if (child === crops) continue;
      entity.mesh.remove(child);
      this.disposeTree(child);
    }
    entity.mesh.add(visual);
    entity.mesh.userData.refinedAsset = asset;
  }
  addEntity(kind: string, name: string, icon: string, model: T.Group, x: number, z: number, radius = 1, index?: number) {
    const e: Entity = { id: `${this.planet}:${kind}:${index ?? this.entities.filter(e=>e.kind===kind).length}`, kind, name, icon, mesh: model, x, z, radius, index };
    model.position.set(x, 0, z); model.userData.entity = e; this.root.add(model); this.entities.push(e); return e;
  }
  obstacle(x: number, z: number, r: number) { this.obstacles.push({ x, z, r }); }
  batchScenery() {
    // Hundreds of little flowers share a handful of materials. Batch their geometry
    // so software WebGL and modest mobile GPUs do not need hundreds of draw calls.
    this.root.updateMatrixWorld(true);
    // Batches are split into 48 m chunks so the camera can skip scenery that is off screen.
    const batches=new Map<string,{ material:T.Material; geometries:T.BufferGeometry[]; shadow:boolean }>();
    const scenery=this.root.children.filter(o=>!o.userData.entity&&!o.userData.hazard&&!o.userData.environment&&!o.userData.prop&&!o.userData.scatter);
    for(const child of scenery){const chunk=Math.floor(child.position.x/48+.5)+':'+Math.floor(child.position.z/48+.5);child.traverse(o=>{if(!(o instanceof T.Mesh)||Array.isArray(o.material))return;const key=o.material.uuid+o.castShadow+chunk;let batch=batches.get(key);if(!batch){batch={material:o.material,geometries:[],shadow:o.castShadow};batches.set(key,batch);}const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);batch.geometries.push(geo);});}
    for(const child of scenery){this.root.remove(child);this.disposeTree(child);}
    for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries,false);if(geometry){const combined=new T.Mesh(geometry,batch.material);combined.castShadow=batch.shadow;combined.receiveShadow=true;this.root.add(combined);}batch.geometries.forEach(g=>g.dispose());}
  }
  /** Planned scenery for this world; trees and rocks among it are also obstacles. */
  decor:DecorPlacement[]=[];
  /** 1 draws all ground cover; .5 (low graphics) draws half of the grass and flowers. */
  detail=1;
  private scatterGroup:T.Group|null=null;
  /** Redraws the scenery from the plan, using whichever model files have loaded. */
  refreshScenery(){
    if(this.scatterGroup){this.root.remove(this.scatterGroup);disposeScatter(this.scatterGroup);}
    const tint=KIT_TINTS[this.planet];
    const parts=(type:string)=>{const kind=DECOR[type];if(!kind)return undefined;const kit=SCENERY_KITS[kind.kit];return kit.ready?kit.mergedParts(type,kind.tint?tint:undefined):undefined;};
    this.scatterGroup=buildScatter(this.decor??[],parts,this.detail);this.root.add(this.scatterGroup);
  }
  /** A shared-kit model tinted for this planet, or null while the kit is unavailable. */
  kit(name: string) { return sceneryKit.ready ? sceneryKit.instance(name, KIT_TINTS[this.planet]) : null; }
  tree(x: number, z: number, scale = 1, pink = false, random = Math.random) {
    const model = this.kit(pink ? 'tree_blossom' : this.planet === 'ice' || this.planet === 'home' && zoneAt({x,z}) === 'forest' && Math.abs(x * 7 + z * 3) % 5 < 2 ? 'tree_pine' : 'tree_round');
    if (model) { model.position.set(x, 0, z); model.scale.setScalar(scale); model.rotation.y = random() * 6; this.root.add(model); this.obstacle(x, z, scale * 0.55); return; }
    const trunk = cyl('#95694b', 0.18, 0.3, 2.2, 0, 1.1);
    const colors = this.planet === 'home' ? pink ? ['#ec9eb7', '#f3b3c7', '#df8eaa'] : ['#78ad6a', '#8bbc78', '#6b9c64'] : this.planet === 'candy' ? ['#ef9fc1', '#f5ca98', '#c8a5dd'] : this.planet === 'ice' ? ['#d5edf2', '#add4dc', '#eff8ef'] : this.planet === 'shadow' ? ['#8b80b1','#a398c5','#706694'] : this.planet === 'lava' ? ['#9d736e','#b08972','#866168'] : ['#5b9a74','#75ac7b','#498360'];
    const tree = group(trunk, ball(colors[0], 1.5, 0, 3), ball(colors[1], 1.1, -0.7, 2.75, 0.5), ball(colors[2], 1.15, 0.65, 2.75, -0.2));
    tree.position.set(x, 0, z); tree.scale.setScalar(scale); tree.rotation.y = random() * 6; this.root.add(tree); this.obstacle(x, z, scale * 0.55);
  }
  flower(x: number, z: number, color: string, scale = 1) {
    const cluster = this.kit('flowers');
    if (cluster) { cluster.position.set(x, 0, z); cluster.scale.setScalar(scale); cluster.rotation.y = (x * 12.9898 + z * 78.233) % 6.28; this.root.add(cluster); return; }
    const flower = group(cyl('#729959', 0.025, 0.025, 0.32, 0, 0.16), ball('#eed383', 0.065, 0, 0.35));
    for (let i=0;i<5;i++) flower.add(ball(color, .09, Math.cos(i*1.256)*.095, .35, Math.sin(i*1.256)*.095,0));
    flower.position.set(x,0,z); flower.scale.setScalar(scale); this.root.add(flower);
  }
  fence(x: number, z: number, rotate = false) {
    const g = group(box('#c99c6a', .17, 1.1, .17, -1.35, .55), box('#c99c6a', .17, 1.1, .17, 1.35, .55), box('#dfb782', 2.8, .12, .11, 0,.45),box('#dfb782',2.8,.12,.11,0,.84));
    g.position.set(x,0,z); if(rotate) g.rotation.y=Math.PI/2; this.root.add(g);
  }
  house() {
    const h = group(cyl('#f0dfa7', 2.6, 2.7, 3.2, 0,1.6), cyl('#b29564',2.8,2.9,.22,0,.16));
    h.add(cyl('#e3b653',0,3.65,2.8,0,4.4,0,24),cyl('#edc869',.9,3.8,.62,0,3.2,0,24),cyl('#e9c164',0,1.1,.7,0,5.55,0,24));
    h.add(box('#846b48',1.0,1.95,.2,0,1,2.66),ball('#e4d29c',.08,.32,1,2.83));
    for(const x of [-1.62,1.62]) h.add(box('#f9edc2',.85,1.05,.2,x,1.6,2.11),box('#77b3b0',.64,.78,.23,x,1.6,2.24),box('#f9edc2',.08,.82,.24,x,1.6,2.27));
    for(const x of [-2,2]) h.add(cyl('#96815a',.09,.09,2.55,x,1.28,2.55));
    h.add(box('#dfbd78',4.6,.15,1.4,0,.12,3));
    return h;
  }
  stall(color: string, type: string) {
    const g = group(box('#b6875e',2.9,1.05,1.45,0,.53),box('#e4ba82',3.1,.16,1.6,0,1.1));
    for(const x of [-1.3,1.3]) g.add(cyl('#987958',.07,.07,2.6,x,1.3,-.55));
    for(let i=0;i<6;i++) { const roof=box(i%2? '#fff1cc':color,.56,.12,2, -1.4+i*.56,2.5);roof.rotation.x=.16;g.add(roof);g.add(box(i%2?'#fff1cc':color,.56,.35,.12,-1.4+i*.56,2.2,.95)); }
    if(type==='sell') for(let i=0;i<6;i++) g.add(ball(i%2?'#dc8961':'#99b96a',.22,-.9+(i%3)*.85,1.35,Math.floor(i/3)*.5-.2));
    else { g.add(box('#9eb5bb',.15,1.1,.12,0,1.65),box('#e8c274',.6,.1,.2,0,1.28)); g.add(ball('#a2b491',.35,-.8,1.42),ball('#e5c478',.35,.8,1.42)); }
    return g;
  }
  crystal(color='#b8a0e1') {
    const g = group(cyl('#9e9c9b',1.2,1.4,.4,0,.2,0,7));
    for(let i=0;i<3;i++) { const c=mesh(new T.OctahedronGeometry(i===0?1.3:.7),color,i===0?0:i===1?-.75:.75,i===0?1.75:.95,0);c.scale.x=.55;c.scale.z=.55;c.rotation.z=(i-1)*.25;g.add(c); }
    g.add(cyl('#d3cebb',1.38,1.45,.12,0,.08,0,10)); return g;
  }
  /** The launch pad with its starship standing on it; the ship is a separate child so it can fly. */
  rocket() {
    const ship=group(cyl('#fffaf1',.8,.95,3.3,0,2.05),cyl('#ed3549',0,.81,1.4,0,4.4),cyl('#626d82',.65,.8,.45,0,.3));
    const rim=mesh(new T.TorusGeometry(.43,.1,6,24),'#ffcd48',0,2.6,.82);ship.add(rim);
    const window=ball('#3ca9e4',.37,0,2.6,.87);window.scale.z=.3;ship.add(window);
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const fin=mesh(new T.ConeGeometry(.65,1.9,3),'#ed3549',Math.cos(angle)*.98,.8,Math.sin(angle)*.98);fin.rotation.y=-angle;fin.rotation.z=.15;ship.add(fin);}
    ship.add(cyl('#ffcc4a',.84,.9,.15,0,.95));
    const flame=new T.Mesh(new T.ConeGeometry(.5,1.6,12).translate(0,-.8,0),new T.MeshBasicMaterial({color:'#ffb13d'}));flame.name='flame';flame.visible=false;ship.add(flame);
    ship.name='ship';ship.position.y=.2;ship.userData.rest=.2;
    return group(ship,cyl('#b7c3d1',2.45,2.65,.18,0,.09,0,32),cyl('#e3e9e8',1.95,1.95,.03,0,.2,0,32));
  }
  /** The starship on this world's pad, with its flame and resting height, for launches and landings. */
  launchRocket(){
    const e=this.entities.find(e=>e.kind==='travel'),ship=e?.mesh.getObjectByName('ship');
    if(!e||!ship)return null;
    return {ship,flame:ship.getObjectByName('flame')??null,x:e.x,z:e.z,rest:(ship.userData.rest as number|undefined)??.2};
  }
  /** Replaces the simple rocket with the Blender pad and ship once the space kit has loaded. */
  private dressRocket(entity:Entity){
    if(!spaceKit.ready||entity.mesh.userData.spaceKit)return;
    const pad=spaceKit.instance('pad'),ship=spaceKit.instance('ship');if(!pad||!ship)return;
    // The pad never moves and the ship moves as one piece, so each bakes into a few meshes.
    bakeModel(pad);
    const flying=entity.mesh.getObjectByName('ship');if(flying&&(flying.position.y>1||this.boarded))return;
    for(const child of [...entity.mesh.children]){entity.mesh.remove(child);this.disposeTree(child);}
    // The ship stands on the pad's deck (`pad_top` in the space kit contract), below its lights.
    const top=.31;
    const body=new T.Group();body.name='ship';body.add(ship);body.position.y=top;body.userData.rest=top;
    const flame=gatherPart(ship,'flame');if(flame)flame.visible=false;
    bakeModel(ship,{deep:false});
    entity.mesh.add(pad,body);entity.mesh.userData.spaceKit=true;
  }
  makePlot(index: number) {
    const saved=this.state.plots[index] as M.Plot&{x?:number;z?:number};
    const x=saved.x??-11.4+(index%3)*2.25,z=saved.z??-.4+Math.floor(index/3)*2.25;
    const p=group(box('#9b7355',1.96,.16,1.95,0,.12),box('#be9970',2.12,.17,.12,0,.2,-1),box('#be9970',2.12,.17,.12,0,.2,1),box('#be9970',.12,.17,2.12,-1,.2),box('#be9970',.12,.17,2.12,1,.2));
    for(let j=0;j<3;j++) p.add(box('#795a47',1.8,.045,.08,0,.22,-.6+j*.6));
    const crops=new T.Group();p.add(crops);this.plotMeshes[index]=crops;const entity=this.addEntity('plot','Garden bed','🌱',p,x,z,1,index);this.applyRefinedAsset(entity);
  }
  build(planet: PlanetId) {
    this.disposeTree(this.root);this.scene.remove(this.root);this.root=new T.Group();this.scene.add(this.root);
    this.entities=[];this.enemies=[];this.obstacles=[];this.dynamicObstacles=[];this.plotMeshes=[];this.cropSignatures=[];this.planet=planet;
    this.destination=null;this.route=[];this.selected=null;this.ring.visible=false;this.marker.visible=false;this.gateHits=0;
    for(const shot of this.enemyShots??[]){this.scene.remove(shot.mesh);shot.mesh.geometry.dispose();}this.enemyShots=[];
    this.environment=new EnvironmentSimulation(createEnvironmentLayout(planet));this.environmentView=new EnvironmentView(this.environment.layout);
    const theme=PLANETS[planet],rng=seeded(9281+Object.keys(PLANETS).indexOf(planet)*399);
    this.scene.background=new T.Color(planet==='home'?'#aee4ff':theme.sky);this.scene.fog=new T.Fog(theme.sky,planet==='shadow'?14:FOG.near,planet==='shadow'?55:FOG.far);
    if(this.sun)this.sun.intensity=planet==='shadow'?.7:2.25;
    if(planet==='home'){
      this.addEntity('home','Your cottage','🏡',this.house(),0,-8,3.2);this.obstacle(0,-8,2.7);
      this.addEntity('sell','Harvest market','🧺',this.stall('#f291a9','sell'),9,2.5,2);this.obstacle(9,2.5,1.7);
      const shop=this.stall('#68bcc7','shop');shop.rotation.y=-2.4;this.addEntity('shop','Equipment shop','🛍️',shop,9.6,10.6,2);this.obstacle(9.6,10.6,1.7);
      const chest=group(box('#aa794d',1.25,.7,.8,0,.35),cyl('#a67c4f',.5,.5,1.2,0,.65),box('#e7bb68',.15,.8,.84,0,.4));chest.children[1].rotation.z=Math.PI/2;
      this.addEntity('chest','Storage chest','📦',chest,-3.3,-4.9,1);this.obstacle(-3.3,-4.9,.6);
      this.addEntity('upgrade','Energy crystal','💎',this.crystal(),8.5,-7,1.5);this.obstacle(8.5,-7,1.4);
      this.addEntity('travel','Starship station','🚀',this.rocket(),13.5,-3,2);this.obstacle(13.5,-3,1.5);
      const forge=group(box('#a89e8c',1.8,.8,1.2,0,.4),box('#677b7d',1.1,.25,.65,0,1),cyl('#708384',.4,.25,.5,0,.75),box('#bd9673',.2,1.1,.2,.7,.75));
      this.addEntity('craft','Workshop','🔨',forge,5.5,6.5,1.3);this.obstacle(5.5,6.5,1.1);
      const cook=group(cyl('#71646b',1.2,.8,1.1,0,.55),cyl('#fc9b51',.7,.7,.12,0,1.12),box('#49454e',1.8,.12,.15,0,1.3));this.addEntity('cook','Volcano kitchen','🔥',cook,1,10.5,1.4);this.obstacle(1,10.5,1);
      for(let i=0;i<this.state.plots.length;i++)this.makePlot(i);
      const well=group(cyl('#a0a8a2',1,1,.8,0,.4,0,10),cyl('#63c5ed',.72,.72,.05,0,.83),box('#957651',.12,2.2,.12,-.85,1.5),box('#957651',.12,2.2,.12,.85,1.5),box('#cc9f78',2.4,.15,1.8,0,2.6));well.position.set(-7,0,-11);well.userData.prop='well';this.root.add(well);this.obstacle(-7,-11,1.2);
      for(let i=0;i<54;i++){
        const a=i/54*Math.PI*2;if(Math.abs(Math.sin(a*2))<.32)continue;
        const g=this.kit('fence')??group(box('#b18459',.16,1,.16,-1,.5),box('#b18459',.16,1,.16,1,.5),box('#edbe77',2.1,.12,.1,0,.4),box('#edbe77',2.1,.12,.1,0,.8));g.position.set(Math.cos(a)*18,0,Math.sin(a)*18);g.rotation.y=-a-Math.PI/2;this.root.add(g);
        for(const d of [-.6,0,.6])this.obstacle(Math.cos(a)*18-Math.sin(a)*d,Math.sin(a)*18+Math.cos(a)*d,.42);
      }
      for(let i=0;i<4;i++){const a=i*Math.PI/2,g=this.kit('gate')??group(cyl('#b18c59',.14,.14,3.1,-1.7,1.55),cyl('#b18c59',.14,.14,3.1,1.7,1.55),box('#edc57a',3.75,.2,.2,0,3));g.position.set(Math.cos(a)*18,0,Math.sin(a)*18);g.rotation.y=-a-Math.PI/2;this.root.add(g);}
      for(const [x,z] of [[-13,-8],[-14,7],[3,-13],[10,-11],[14,5],[-2,15]])this.tree(x,z,.75,true,rng);
      // Stepping-stone trails lead from the cottage to the four gates.
      if(sceneryKit.ready)for(const [axis,from,to] of [['z',-3.6,17.4],['z',-12.6,-17.4],['x',2.2,17.4],['x',-2.2,-17.4]] as const){
        const step=from<to?1.2:-1.2;for(let t=from,i=0;step>0?t<=to:t>=to;t+=step,i++){const side=(i%2?.22:-.22),x=axis==='z'?side:t,z=axis==='z'?t:side;
          if(this.entities.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius+.35))continue;
          const stone=this.kit('stone_step');if(stone){stone.position.set(x,0,z);stone.rotation.y=i*1.3+t;stone.scale.setScalar(.95+(i%3)*.1);this.root.add(stone);}}}
      // Walk-through dressing inside the fence. It adds no obstacles, so every player's map stays identical.
      if(sceneryKit.ready)for(let i=0;i<16;i++){const a=(i+.5)/16*Math.PI*2,x=Math.cos(a)*16.4,z=Math.sin(a)*16.4;
        if(this.entities.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius+1.4)||this.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.9))continue;
        const bush=this.kit(i%5===2?'mushroom':'bush');if(bush){bush.position.set(x,0,z);bush.rotation.y=a;bush.scale.setScalar(i%5===2?1.3:.85+(i%3)*.12);this.root.add(bush);}}
      this.makePond(-7.5,11.2,3.3);for(const [x,z,r] of [[10,52,9],[40,105,11],[-70,35,8],[-105,-30,7]])this.makePond(x,z,r);
      this.position.set(0,0,-4.8);
    }else{
      this.position.set(0,0,3.6);this.addEntity('travel','Starship','🚀',this.rocket(),0,0,2);this.obstacle(0,0,1.4);
      this.addEntity('mine',planet==='lava'?'Magma crystal vein':'Planetary crystal vein','⛏️',this.crystal(planet==='lava'?'#ffaf62':'#a9cadc'),-6,3,1.4,0);
      this.addEntity('mine','Crystal vein','⛏️',this.crystal('#c5b5e1'),9,-8,1.4,1);
      if(['candy','ice','toy','jungle','shadow'].includes(planet))for(let i=0;i<4;i++){const a=i*Math.PI/2+.4,r=38+i*17;this.makePond(Math.cos(a)*r,Math.sin(a)*r,6+i*.6);}
      if(planet==='toy')for(let i=0;i<26;i++){const a=i*2.399+.4,d=24+Math.sqrt(i/25)*95,x=Math.cos(a)*d,z=Math.sin(a)*d;
        const gift=this.addEntity('gift','Mystery present','🎁',group(box(['#c59bd0','#93bacc','#e7b583'][i%3],.85,.85,.85,0,.45),box('#fff0cc',.15,.9,.89,0,.45)),x,z,1,i);gift.mesh.visible=giftAvailable(this.state,planet,i);
      }
    }
    this.root.add(...[...this.environmentView.staticRoot.children],this.environmentView.dynamicRoot);
    for(const collider of this.environmentView.colliders)if(collider.tag!=='cave-gate'||!this.state.worldRewards.lava.gateOpen)this.obstacles.push({...collider});
    for(const node of this.environmentView.nodes){
      if(node.kind==='cave-gate'&&this.state.worldRewards.lava.gateOpen)continue;
      this.addEntity(node.kind,node.name,node.icon,node.mesh,node.x,node.z,node.radius,node.index);
    }
    const layout=this.environment.layout,ponds=this.entities.filter(e=>e.kind==='fish').map(e=>({x:e.x,z:e.z,r:e.radius}));
    // Lava pools and the dragon nest sit below the rock; stones and mesas are their own solid pieces.
    const sunk=planet==='lava'?(x:number,z:number)=>layout.pools.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+1)?-1.12:Math.hypot(x-layout.nest.x,z-layout.nest.z)<layout.nest.r+1?-.25:0:undefined;
    this.root.add(buildGround({planet,layout,ponds,base:planet==='cloud'?-30:planet==='ocean'?-1.15:0,height:sunk,segments:planet==='lava'?20:12}));
    const free=(x:number,z:number,r:number)=>!someObstacleNear(this.obstacles,x,z,x,z,r,o=>Math.hypot(x-o.x,z-o.z)<o.r+r)&&!this.entities.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius+r);
    this.decor=planDecor({planet,layout,random:rng,free,ponds});
    for(const piece of this.decor)if(piece.radius>0)this.obstacle(piece.x,piece.z,piece.radius);
    for(const name of kitsFor(planet)){const kit=SCENERY_KITS[name];if(!kit.ready)void kit.load().then(()=>{if(kit.ready&&this.planet===planet)this.refreshScenery();});}
    const angles:Record<string,number>={canyon:0,meadow:Math.PI/2,forest:Math.PI,swamp:-Math.PI/2};let enemyIndex=0;
    const placeEnemy=(type:string,zone?:string,boss=false)=>{
      const def=ENEMY_TYPES[type];if(!def)return;
      for(let attempt=0;attempt<500;attempt++){
        let a=zone?angles[zone]+(rng()-.5)*1.3:rng()*Math.PI*2,d=boss?100+rng()*24:27+rng()*97,x=Math.cos(a)*d,z=Math.sin(a)*d;
        if(planet==='cloud'){const islands=this.environment.layout.islands,isl=islands[1+(enemyIndex%(islands.length-1))];a=rng()*Math.PI*2;d=rng()*(isl.r-3);x=isl.x+Math.cos(a)*d;z=isl.z+Math.sin(a)*d;}
        if(this.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+def.radius+1)||this.enemies.some(e=>Math.hypot(x-e.x,z-e.z)<2.4))continue;
        if(planet==='lava'&&terrainHeight(this.environment.layout,{x,z})<-.4)continue;
        this.spawnSpecies(type,x,z,enemyIndex++);break;
      }
    };
    if(planet==='home'){
      for(const [zone,spawns] of Object.entries(HOME_SPAWNS))for(const [type,count] of spawns)for(let i=0;i<count;i++)placeEnemy(type,zone);
      for(const [type,zone] of [['bear','canyon'],['treant','forest'],['croc','swamp'],['mushking','meadow']])placeEnemy(type,zone,true);
    }else{for(const [type,count] of PLANET_SPAWNS[planet]??[])for(let i=0;i<count;i++)placeEnemy(type);for(const type of PLANET_BOSSES[planet]??[])placeEnemy(type,undefined,true);}
    if(planet==='lava'){
      const dragon=this.enemies.find(e=>e.type==='dragon');if(dragon){dragon.x=dragon.homeX=this.environment.layout.nest.x;dragon.z=dragon.homeZ=this.environment.layout.nest.z;dragon.hp=0;dragon.respawn=999999;dragon.mesh.visible=false;}
      for(let i=0;i<18;i++){const minion=this.spawnSpecies('minislime',30,30,enemyIndex++)!;minion.hp=0;minion.respawn=999999;minion.mesh.visible=false;}
    }
    this.batchScenery();this.refreshScenery();this.root.add(this.player,this.companion);this.cameraTarget.copy(this.position);this.syncCrops();this.syncDropped();this.applyRefinedAssets();this.syncDecorations();this.refreshEnvironmentNodes();
    if(this.remoteRoot&&!this.remoteRoot.parent)this.scene.add(this.remoteRoot);
    for(const remote of this.remotePlayers?.values()??[])remote.mesh.visible=!remote.pose.planet||remote.pose.planet===planet;
    this.onBuilt?.();
  }

  private waterMaterial?:T.MeshStandardMaterial;
  makePond(x:number,z:number,radius=5.6,waterId?:string) {
    // Translucent water over a blue bed that deepens toward the middle, so the fish
    // swimming between them stay visible from above. Heights are in world units.
    const s=radius/5.6,pond=new T.Group(),flat=(m:T.Mesh,sz=.72)=>{m.scale.set(s,1,s*sz);return m;};
    if(!this.waterMaterial){this.waterMaterial=new T.MeshStandardMaterial({color:'#6fd8fb',transparent:true,opacity:.38,roughness:.08,metalness:0,depthWrite:false});this.waterMaterial.userData.sharedKit=true;}
    // Layers from the bottom: sand rim (top .10), blue bed (.12–.135), swimming depth, glassy surface (.30), lily pads.
    const surface=.3,water=flat(new T.Mesh(new T.CylinderGeometry(5.2,5.2,.02,48),this.waterMaterial));water.position.y=surface;water.renderOrder=1;
    pond.add(flat(cyl('#f1d9a0',5.6,5.8,.1,0,.05,0,48),.73),flat(cyl('#2aa3dc',5.15,5.15,.02,0,.11,0,48)),flat(cyl('#1478c0',3.3,3.5,.02,0,.125,0,40),.7),water);
    for(let i=0;i<6;i++){const pad=cyl('#4fbf3a',.32,.32,.03,Math.sin(i*1.4)*3*s,surface+.02,Math.cos(i*1.4)*2*s,12);pad.scale.z=.85;pond.add(pad);if(i%2===0)pond.add(ball('#ff8fc4',.1,Math.sin(i*1.4)*3*s,surface+.08,Math.cos(i*1.4)*2*s));}
    pond.add(box('#d68a45',2.5*s,.13,1.6*s,-4.8*s,surface+.08,0));for(let i=0;i<6;i++)pond.add(box('#9a5a2c',.04,.02,1.6*s,(-5.8+i*.4)*s,surface+.16,0));
    pond.traverse(o=>{o.castShadow=false;});
    const entity=this.addEntity('fish',this.planet==='home'?'Fishing pond':'Planetary fishing pool','🎣',pond,x,z,radius);entity.waterId=waterId??(this.planet==='home'?Math.hypot(x,z)<18?'home':zoneAt({x,z})==='swamp'?'swamp':'lake':this.planet);entity.pond={rx:5.2*s,rz:5.2*s*.72,surface:.3};this.obstacle(x,z,radius*.83);
  }
  chibi(color: string) {
    const c=group();
    c.add(ball('#f3d5af',.59,0,1.59,0,2));
    const hair=ball('#655046',.605,0,1.79,-.05,1);hair.scale.y=.62;c.add(hair);
    c.add(ball('#655046',.23,-.42,1.61,.24),ball('#655046',.22,.4,1.7,.23),ball('#655046',.24,-.15,1.96,.25));
    for(const x of [-.21,.21]){c.add(ball('#3e4542',.052,x,1.62,.551,1),ball('#e8ab9d',.095,x*1.65,1.44,.47));}
    const smile=mesh(new T.TorusGeometry(.075,.015,4,8,Math.PI),'#8b6959',0,1.48,.578);smile.rotation.z=Math.PI;c.add(smile);
    c.add(cyl(color,.32,.42,.65,0,.85,0,8));
    // Arms hang from shoulder pivots so punches, swings and the fishing cast can animate.
    for(const side of [-1,1]){
      const arm=new T.Group();arm.name=side<0?'arm-left':'arm-right';arm.position.set(side*.37,1.08,.02);arm.rotation.order='YXZ';arm.rotation.z=side*.3;
      const grip=new T.Object3D();grip.name=side<0?'hand-left':'hand-right';grip.position.set(0,-.36,.05);
      arm.add(cyl(color,.12,.1,.3,0,-.12),ball('#f3d5af',.14,0,-.33,.02),grip);c.add(arm);
    }
    const left=group(cyl('#f0d4ad',.1,.1,.35,0,.35),ball('#775f46',.17,0,.16,.08));left.position.x=-.18;left.name='leg-left';c.add(left);
    const right=left.clone();right.position.x=.18;right.name='leg-right';c.add(right);
    c.add(box('#b38d5c',.4,.44,.22,0,.9,-.34),ball('#f8ecd0',.08,0,.93,.36));
    c.add(cyl('#b4c478',.015,.02,.24,0,2.15),ball('#94b774',.16,-.1,2.24),ball('#b1ca82',.15,.1,2.31));
    return c;
  }
  private petModel(id:string){
    const color=id.includes('dragon')?'#7ab876':id.includes('fire')?'#f5cc62':id.includes('parrot')?'#5bd7a5':'#fff0d8',pet=new T.Group();
    pet.add(ball(color,.36,0,.42),ball(color,.28,0,.77,.2));
    for(const x of [-.14,.14]){pet.add(ball('#3b3f50',.04,x,.8,.44));const ear=ball(color,.1,x,1.03,.15);ear.scale.y=id.includes('bunny')?2.5:1.3;pet.add(ear);}
    if(id.includes('dragon')||id.includes('parrot')||id.includes('fire'))for(const x of [-1,1]){const wing=ball('#e8e6a0',.32,x*.39,.6);wing.scale.set(1.3,.12,.6);pet.add(wing);}
    return pet;
  }
  /** Puts a kit gear piece on the explorer; each piece rides the body part named by its tag. */
  private wearKit(hero:T.Object3D,id:string|undefined,fallback:string){
    const kit=id?this.kitFor(id):null,item=kit&&heroKit.ready?kit.instance(id!):null;if(!item)return false;
    hero.updateMatrixWorld(true);const toHero=hero.matrixWorld.clone().invert();
    for(const piece of [...item.children]){
      const part=hero.getObjectByName(piece.userData.tag??fallback)??hero;
      // Pieces are modelled in explorer space; re-express them in the part's own space.
      piece.applyMatrix4(toHero.clone().multiply(part.matrixWorld).invert());part.add(piece);
    }
    return true;
  }
  /** A companion model: from the pet kit when it has loaded, otherwise the simple shapes. */
  petFor(id:string){
    const model=this.kitFor(id)?.instance(id)??this.petModel(id);
    model.userData.flying=['pet_parrot','pet_firefly','pet_dragon'].includes(id);
    // The kit's convention: the right wing lifts with +z, the left with -z.
    model.userData.wings=model.children.filter(c=>/_wing_[lr]/.test(c.name)).map(c=>({node:c,base:c.rotation.z,side:/_wing_l/.test(c.name)?-1:1}));
    return model;
  }
  /**
   * The loaded kit holding a gear item, or null. Asking starts that file's download the
   * first time; avatars are rebuilt when it arrives, and simple shapes stand in until then.
   */
  private kitFor(id:string){
    const slot=M.ITEMS[id]?.slot,kit=slot==='weapon'?weaponKit:slot==='disguise'?disguiseKit:slot==='pet'?petKit:wearKit;
    if(!kit.requested)void kit.load().then(()=>{if(kit.ready)this.refreshAvatars();});
    return kit.ready&&kit.has(id)?kit:null;
  }
  /**
   * The explorer in its gear. Each slot uses its Blender model when the kit has it and
   * falls back to simple shapes otherwise, so a missing file never leaves a slot empty.
   */
  private avatar(color:string,gear:SaveState['gear']={}){
    const disguise=gear.disguise?M.DISGUISES[gear.disguise]:undefined,id=gear.disguise??'';
    const kitDisguise=!!id&&!!this.kitFor(id)&&heroKit.ready;
    const tint=disguise&&!kitDisguise?disguise.color:color,c=heroKit.instance(tint)??this.chibi(tint);
    // The sprout pokes through hats and most costumes; the fairy crown and hero mask leave it showing.
    const leaf=c.getObjectByName('head-leaf');if(leaf)leaf.visible=!gear.hat&&(!id||(kitDisguise&&['dz_fairy','dz_superhero'].includes(id)));
    if(id){if(!kitDisguise)this.simpleDisguise(c,id,disguise!.color);}
    else{
      if(gear.hat&&!this.wearKit(c,gear.hat,'head'))this.simpleHat(c,gear.hat);
      if(gear.outfit&&!this.wearKit(c,gear.outfit,'body'))this.simpleOutfit(c,gear.outfit);
      if(gear.boots&&!this.wearKit(c,gear.boots,'body'))for(const x of [-.18,.18])c.add(box(gear.boots.includes('flipper')?'#66a9d6':'#b88c73',.27,.23,gear.boots.includes('flipper')?.6:.34,x,.17,.1));
    }
    if(kitDisguise)this.wearKit(c,id,'body');
    if(gear.weapon&&!this.wearKit(c,gear.weapon,'hand-right'))this.simpleWeapon(c,gear.weapon);
    if(gear.pet){const pet=this.petFor(gear.pet);pet.name='remote-pet';pet.position.set(-1,0,-.6);c.add(pet);}
    return c;
  }
  private simpleHat(c:T.Object3D,hat:string){
    const capColor=hat.includes('wizard')?'#6d60b1':hat.includes('santa')?'#e2646e':hat.includes('straw')?'#e3bd69':'#91b8c9';
    if(/wizard|party/.test(hat))c.add(cyl(capColor,0,.66,.95,0,2.4),cyl(capColor,.75,.75,.09,0,2));
    else if(/bunny|cat|bear|frog/.test(hat)){
      c.add(ball(capColor,.62,0,1.88));for(const x of [-.38,.38]){const ear=ball(capColor,.18,x,2.3);ear.scale.y=hat.includes('bunny')?2.3:1;c.add(ear);}
    }else if(hat.includes('halo')){const halo=mesh(new T.TorusGeometry(.45,.06,6,16),'#ffe387',0,2.3);halo.rotation.x=Math.PI/2;c.add(halo);}
    else c.add(cyl(capColor,.7,.74,.1,0,2.03),cyl(capColor,.43,.48,.35,0,2.2));
    if(hat.includes('lantern'))c.add(ball('#ffe892',.22,0,2.35,.43));
  }
  private simpleOutfit(c:T.Object3D,outfit:string){
    const coat=/leaf|hawaii/.test(outfit)?'#6db87a':/knight|space|bone/.test(outfit)?'#a9bed0':/angel|cloud|chef/.test(outfit)?'#f3f0e5':'#a17eaf';
    c.add(cyl(coat,.35,.48,.64,0,.85,0,8));
    if(/wings|angel|superhero/.test(outfit))for(const x of [-1,1]){const wing=mesh(new T.ConeGeometry(.55,1.4,3),coat,x*.62,1.1,-.4);wing.rotation.z=x*.65;c.add(wing);}
  }
  private simpleDisguise(c:T.Object3D,id:string,color:string){
    if(id==='dz_mage')c.add(cyl(color,0,.66,.95,0,2.4),cyl(color,.75,.75,.09,0,2));
    else if(/dino|snowman/.test(id)){c.add(ball(color,.62,0,1.88));for(const x of [-.38,.38])c.add(ball(color,.18,x,2.3));}
    else if(id==='dz_fairy'){const halo=mesh(new T.TorusGeometry(.45,.06,6,16),'#ffe387',0,2.3);halo.rotation.x=Math.PI/2;c.add(halo);}
    else c.add(cyl(color,.7,.74,.1,0,2.03),cyl(color,.43,.48,.35,0,2.2));
    c.add(cyl(color,.35,.48,.64,0,.85,0,8));
    if(/fairy|vampire|superhero/.test(id))for(const x of [-1,1]){const wing=mesh(new T.ConeGeometry(.55,1.4,3),color,x*.62,1.1,-.4);wing.rotation.z=x*.65;c.add(wing);}
    if(id==='dz_mecha')for(const x of [-.49,.49])c.add(box('#93b5cd',.35,.6,.42,x,.9),ball('#e9d762',.14,x,1.23,.1));
    if(id==='dz_ninja')c.add(box('#313f60',1.02,.2,.13,0,1.5,.54));
    if(id==='dz_dino'){c.add(cyl('#65a47d',0,.3,.9,0,.52,-.62));for(let i=0;i<4;i++)c.add(cyl('#e3c77d',0,.13,.22,0,.65+i*.33,-.48));}
    if(id==='dz_snowman')c.add(cyl('#efa75d',0,.1,.3,0,1.57,.66));
  }
  private simpleWeapon(c:T.Object3D,id:string){
    const weapon=M.ITEMS[id]?.weapon,hand=c.getObjectByName('hand-right')??c;
    if(weapon?.kind==='sword'){
      const bladeColor=/fire|lava/.test(id)?'#f1a65d':/crystal|ice/.test(id)?'#a9e8f1':'#d5dce1';
      const sword=group(box(bladeColor,.14,1.02,.13,0,.62),box('#c7a162',.42,.12,.18,0,.1),cyl('#8a5a34',.05,.05,.22,0,-.04));sword.name='weapon';sword.rotation.x=1.25;hand.add(sword);
    }else if(weapon?.kind==='gun'){const gun=group(box('#9dc7cb',.25,.3,.65,0,.05,.25),ball('#e7d997',.19,0,.06,.58));gun.name='weapon';hand.add(gun);}
    else if(weapon?.kind==='rod'){
      const rod=group(cyl('#ad8861',.025,.04,1.85,0,.92),cyl('#6b4a2e',.05,.05,.26,0,.05));rod.name='weapon';rod.rotation.x=1.05;
      const tip=new T.Object3D();tip.name='rod-tip';tip.position.set(0,1.85,0);rod.add(tip);hand.add(rod);
    }
  }
  refreshPlayer() {
    this.disposeTree(this.player);this.root.remove(this.player);this.player=this.avatar(this.state.color,{...this.state.gear,pet:undefined});this.player.rotation.order='YXZ';
    this.playerMaterials=[];this.player.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshStandardMaterial){o.material=o.material.clone();o.material.userData.sharedKit=false;this.playerMaterials.push(o.material);}});this.root.add(this.player);
    this.disposeTree(this.companion);this.root.remove(this.companion);this.companion=this.state.gear.pet?this.petFor(this.state.gear.pet):new T.Group();this.root.add(this.companion);
  }

  spawnEnemy(x:number,z:number,index:number,name:string,strong=false,boss=false) {
    const theme=PLANETS[this.planet], color=boss?'#b4906b':this.planet==='home'?(strong?'#ca9b8a':'#9cbd80'):this.planet==='candy'?'#d799b5':this.planet==='ice'?'#d4ebee':this.planet==='lava'?'#cb856b':this.planet==='shadow'?'#aaa3ce':'#a6b4a4';
    const e=group(ball(color,.7,0,.65),ball(color,.48,0,1.03,.18));
    for(const a of [-1,1]){e.add(ball('#454e45',.065,a*.18,1.07,.59),ball(color,.17,a*.5,.22,.3));}
    if(name.includes('Mushroom'))e.add(cyl('#d49c8c',0,.9,.55,0,1.42,0,12));
    else {const sprout=ball(boss?'#e5c479':'#719d61',.23,0,1.6);sprout.scale.x=1.5;e.add(sprout);}
    if(boss){e.scale.setScalar(1.9);e.add(cyl('#e9c876',.4,.35,.3,0,1.73,0,5));}
    const health=(this.planet==='home'?(strong?65:42):theme.health)*(boss?5:1);
    const ent=this.addEntity('enemy',name,boss?'👑':'🍃',e,x,z,boss?1.7:.8,index) as Enemy;
    Object.assign(ent,{hp:health,maxHp:health,damage:theme.attack*(boss?2:strong?1.4:1),xp:theme.xp*(boss?7:1),homeX:x,homeZ:z,cooldown:0,respawn:0,boss,stun:0});this.enemies.push(ent);
  }
  private speciesModel(def:EnemyDefinition){
    const color=def.color,accent=def.accent,g=new T.Group(),family=def.family;
    if(['quadruped','turtle','crab','dragon'].includes(family)){
      const body=ball(color,.8,0,.64);body.scale.set(1,.7,1.35);g.add(body,ball(color,.48,0,.95,1));
      let leg=0;for(const x of [-.58,.58])for(const z of [-.66,.66]){const hip=new T.Group();hip.name='leg'+leg++;hip.position.set(x,.55,z);hip.add(cyl(accent,.16,.2,.55,0,-.27,0));g.add(hip);}
      if(family==='crab')for(const x of [-1,1])g.add(ball(accent,.35,x,.95,.85));
      if(family==='turtle'){const shell=ball('#506353',.84,0,.87);shell.scale.y=.65;shell.name='shell';g.add(shell);}
      if(family==='dragon')for(const x of [-1,1]){const root=new T.Group();root.name=x<0?'wing-l':'wing-r';root.position.set(x*.45,1.1,-.15);const wing=mesh(new T.ConeGeometry(.7,1.5,3),accent,x*.45,0,0);wing.rotation.z=x*.8;root.add(wing);g.add(root);}
    }else if(family==='flower'||family==='cactus'||family==='lollipop'){
      g.add(cyl(color,.15,.3,1.2,0,.6),ball(color,.55,0,1.45));
      for(let i=0;i<6;i++){const a=i*Math.PI/3;g.add(ball(accent,.25,Math.cos(a)*.48,1.45+Math.sin(a)*.48,.06));}
    }else if(family==='volcano')g.add(cyl(color,.5,1.1,1.1,0,.55),ball('#ffb338',.35,0,1.1));
    else if(family==='robot'||family==='jackbox'){
      g.add(box(color,1.2,1.1,1.0,0,.65),box(accent,.95,.7,.8,0,1.6));for(const x of [-.72,.72])g.add(box(color,.3,.8,.3,x,.9));
    }else if(family==='worm'){for(let i=0;i<4;i++)g.add(ball(i%2?color:accent,.36,Math.sin(i)*.17,.3+i*.32));}
    else{g.add(ball(color,.65,0,.65),ball(color,.45,0,1.2,.15));for(const x of [-.42,.42])g.add(ball(accent,.2,x,.2,.25));}
    if(family==='mushroom')g.add(cyl(accent,0,.95,.58,0,1.72,0,12),ball(color,.65,0,1.78));
    if(family==='bunny')for(const x of [-.22,.22]){const ear=ball(accent,.18,x,1.94);ear.scale.y=2.3;g.add(ear);}
    if(family==='winged')for(const x of [-1,1]){const root=new T.Group();root.name=x<0?'wing-l':'wing-r';root.position.set(x*.3,1.05,0);const wing=ball(accent,.45,x*.36,0,0);wing.scale.set(1.5,.18,.75);root.add(wing);g.add(root);}
    if(family==='treant'){g.add(cyl(color,.55,.7,1.8,0,.9),ball(accent,.95,0,2.0));for(const x of [-1,1])g.add(box(color,.3,1.3,.3,x*.7,1.1));}
    if(family==='cake'){g.add(cyl(accent,.85,.85,.3,0,.55),cyl(color,.7,.8,.6,0,1),ball('#f06179',.23,0,1.9));}
    if(family==='eye')g.add(ball('#fff4de',.43,0,1.25,.4),ball('#db627c',.2,0,1.25,.78));
    for(const x of [-.18,.18])g.add(ball('#333441',.062,x,1.25,.56));
    if(def.boss){g.scale.setScalar(1.85);g.add(cyl('#ffda5a',.36,.3,.28,0,2.1,0,5));}
    return g;
  }
  spawnSpecies(type:string,x:number,z:number,index:number){
    const def=ENEMY_TYPES[type];if(!def)return null;
    const zone=this.planet==='home'?zoneAt({x,z}):this.planet,difficulty=({home:0,forest:1,meadow:1,swamp:2,canyon:3,candy:3,ice:4,lava:5,toy:2,jungle:3,ocean:4,cloud:5,shadow:6} as Record<string,number>)[zone],scale=[1,1,1.7,2.6,3.6,4.8,6.2][difficulty];
    const health=Math.round(def.hp*scale*(def.boss&&type!=='dragon'?2.6:1)),damage=def.damage*scale*(def.boss?1.35:1),xp=Math.round(def.xp*(.6+scale*.4));
    // Plain body parts become one or two meshes; named parts (legs, wings, shell) keep animating on their own.
    const model=bakeModel(this.speciesModel(def),{deep:false,keep:o=>!!o.name}),flash:T.MeshStandardMaterial[]=[];
    model.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshStandardMaterial){o.material=o.material.clone();flash.push(o.material);}});model.userData.flashMaterials=flash;
    const e=this.addEntity('enemy',def.name,def.boss?'👑':'⚔️',model,x,z,def.radius,index) as Enemy;
    Object.assign(e,{type,definition:def,hp:health,maxHp:health,baseMaxHp:health,baseDamage:damage,damage,xp,level:difficulty*3-2+(def.boss?6:0),homeX:x,homeZ:z,cooldown:0,respawn:0,boss:def.boss,stun:0,phase:'idle',phaseTime:0,route:[],routeTime:0,lift:0,liftVelocity:0,statuses:{}});this.enemies.push(e);return e;
  }
  environmentStatus():EnvironmentStatus[]{return this.environment?.status(this.position)??[];}
  lightSources(){
    if(!this.environment)return[];const stats=M.activeStats(this.state),radius=(stats.light?7.5:3.6)*(this.environment.time<this.environment.eclipseUntil?.4:1);
    const sources=[{x:this.position.x,z:this.position.z,radius}];
    for(const lamp of this.environment.layout.lamps)if((this.environment.lamps.get(lamp.id)??0)>this.environment.time)sources.push({x:lamp.x,z:lamp.z,radius:lamp.r});
    for(const flower of this.environment.layout.flowers)if(Math.hypot(flower.x-this.position.x,flower.z-this.position.z)<28)sources.push({x:flower.x,z:flower.z,radius:flower.r});
    return sources;
  }
  darknessActive(){return this.planet==='shadow'||this.planet==='lava'&&!!this.environment&&Math.hypot(this.position.x-this.environment.layout.cave.x,this.position.z-this.environment.layout.cave.z)<this.environment.layout.cave.r;}
  private refreshEnvironmentNodes(){
    for(const e of this.entities){
      if(e.kind==='gift')e.mesh.visible=giftAvailable(this.state,this.planet,e.index??0);
      if(['fire-crystal','magma-ore','obsidian-ore','clam'].includes(e.kind))e.mesh.visible=(this.state.worldRewards.resourceReadyAt[e.id]??0)<=Date.now();
      if(e.kind==='brazier'||e.kind==='furnace'){const fire=e.mesh.getObjectByName('flame');if(fire)fire.visible=e.kind==='furnace'?M.furnaceReady(this.state):this.state.worldRewards.lava.braziers.includes(e.index!);}
      if(e.kind==='fruit'){const fruit=e.mesh.getObjectByName('fruit');if(fruit)fruit.visible=(this.resourceTimers?.get(e.id)??0)<(this.environment?.time??0);}
      if(e.kind==='turtle'&&e.mesh.userData.ridden)e.mesh.visible=!(this.environment?.riding??false);
    }
  }
  private syncWeatherNodes(){
    if(this.planet!=='lava')return;const ores=this.environment.weather.ores,ids=new Set(ores.map(o=>o.id));
    for(const entity of this.entities.filter(e=>e.kind==='meteor-ore'&&!ids.has(e.id))){this.root.remove(entity.mesh);this.disposeTree(entity.mesh);this.entities=this.entities.filter(e=>e!==entity);}
    for(const ore of ores)if(!this.entities.some(e=>e.id===ore.id)){const model=group(ball(ore.kind==='meteor'?'#5c4d66':'#977368',.9,0,.5,0,0),this.crystal('#ffc475'));model.scale.setScalar(.65);const entity=this.addEntity('meteor-ore',ore.kind==='meteor'?'Fallen meteor · four strikes':'Erupted magma crystal','☄️',model,ore.x,ore.z,1);entity.id=ore.id;entity.mesh.position.y=ore.y;entity.mesh.userData.lootKind=ore.kind;}
  }
  applyEnvironmentAction(action:EnvironmentAction):{ok:boolean;rewards?:EnvironmentReward[]}{
    if(action.kind==='light-pillar'){const index=action.index??this.environment.layout.lamps.find(l=>'shadow:light-pillar:'+l.id===action.id)?.id;if(index===undefined||!this.environment.layout.lamps.some(l=>l.id===index))return {ok:false};this.environment.lightPillar(index);return {ok:true};}
    const ore=this.environment.weather.collectOre(action.id);if(!ore)return {ok:false};
    const rules=LAVA_ORE_RULES[ore.kind==='meteor'?'meteor':'ore_magma'],rewards:EnvironmentReward[]=[];
    for(const [id,chance,minimum,maximum] of rules.loot)if(Math.random()<chance)rewards.push({id,count:minimum+Math.floor(Math.random()*(maximum-minimum+1))});
    this.syncWeatherNodes();return {ok:true,rewards};
  }
  grantEnvironmentReward(eventId:string,rewards:EnvironmentReward[]){
    const valid=rewards.filter(r=>Object.hasOwn(M.ITEMS,r.id)&&Number.isSafeInteger(r.count)&&r.count>0&&r.count<=100);if(!valid.length)return false;
    if(!M.claimEnvironmentResource(this.state,'loot:'+eventId,valid[0].id,Date.now(),86400000))return false;
    valid.forEach((reward,index)=>M.addItem(this.state,reward.id,reward.count-(index===0?1:0)));this.onEnvironmentEvent?.({kind:'resource-collected',message:'Meteor minerals collected.'});return true;
  }
  interactEnvironment(e:Entity):{message:string;openCrafting?:boolean}|null{
    const env=this.environment,index=e.index??0;if(!env)return null;
    if(e.kind==='bounce'){const target=e.mesh.userData.bounceTo as Point;env.launch(this.position,target);this.destination=null;this.route=[];return {message:'Up you go! Jumping to the next cloud island.'};}
    if(e.kind==='turtle'){env.rideUntil=env.time+45;e.mesh.visible=false;e.mesh.userData.ridden=true;return {message:'Sea turtle ride: faster swimming and no oxygen loss for 45 seconds.'};}
    if(e.kind==='light-pillar'){env.lightPillar(index);if(this.networkRole)this.onEnvironmentAction?.({kind:'light-pillar',id:e.id,index});this.burst(e.x,e.z,'#ffe69a');return {message:'Light pillar lit for 150 seconds. Its light heals and repels shadow creatures.'};}
    if(e.kind==='meteor-ore'){
      const hits=LAVA_ORE_RULES[e.mesh.userData.lootKind==='meteor'?'meteor':'ore_magma'].hits;e.mesh.userData.hits=(e.mesh.userData.hits??0)+1;this.burst(e.x,e.z,'#ffbe6e',8);
      if(e.mesh.userData.hits<hits)return {message:`Mining ${e.mesh.userData.hits}/${hits} strikes.`};e.mesh.userData.hits=0;
      const action:EnvironmentAction={kind:'collect-ore',id:e.id};if(this.networkRole){this.onEnvironmentAction?.(action);return {message:'Collecting shared meteor minerals…'};}
      const result=this.applyEnvironmentAction(action);if(result.ok)this.grantEnvironmentReward(action.id+':'+Date.now(),result.rewards??[]);return {message:result.ok?'Meteor minerals collected!':'This meteor was already collected.'};
    }
    if(e.kind==='fruit'){if((this.resourceTimers.get(e.id)??0)>env.time)return {message:'This tree needs a minute to grow more fruit.'};this.resourceTimers.set(e.id,env.time+60);this.state.hp=Math.min(maxHp(this.state),this.state.hp+Math.round(maxHp(this.state)*.3));M.addBuff(this.state,Math.random()<.5?{regen:4,time:30}:{haste:.3,time:30},'jungle-fruit');if(Math.random()<.35)M.addItem(this.state,'vine');this.refreshEnvironmentNodes();return {message:'Jungle fruit restores health and grants a 30-second boost.'};}
    if(e.kind==='brazier'){const success=M.lightBrazier(this.state,index);this.refreshEnvironmentNodes();return {message:success?M.furnaceReady(this.state)?'All three flames are lit. The ancient furnace is awake!':`Brazier lit: ${this.state.worldRewards.lava.braziers.length}/3.`:this.state.worldRewards.lava.braziers.includes(index)?'This brazier is already burning.':'Bring one fire crystal from the cave entrance.'};}
    if(e.kind==='furnace')return {message:M.furnaceReady(this.state)?'The ancient furnace is ready to smelt.':'Light all three braziers with fire crystals first.',openCrafting:M.furnaceReady(this.state)};
    if(e.kind==='cave-gate'){
      this.gateHits++;this.burst(e.x,e.z,'#a798ba',7);
      if(this.gateHits<8)return {message:`Cracks spread through the gate. ${8-this.gateHits} more strikes.`};
      M.openCave(this.state);this.root.remove(e.mesh);this.disposeTree(e.mesh);this.entities=this.entities.filter(v=>v!==e);this.obstacles=this.obstacles.filter(o=>o.tag!=='cave-gate');return {message:'The obsidian gate breaks open. Carry a fire crystal to light the cave.'};
    }
    if(e.kind==='cave-chest')return {message:M.claimCaveChest(this.state)?'Ancient cave treasure collected. The chest replenishes tomorrow.':'The chest is empty for today.'};
    if(['fire-crystal','clam','magma-ore','obsidian-ore'].includes(e.kind)){
      if((this.state.worldRewards.resourceReadyAt[e.id]??0)>Date.now())return {message:'This resource is regrowing.'};
      const rules=e.kind==='clam'?undefined:LAVA_ORE_RULES[e.kind==='fire-crystal'?'ore_fire':e.kind==='magma-ore'?'ore_magma':'ore_obsidian'];
      if(rules){e.mesh.userData.hits=(e.mesh.userData.hits??0)+1;this.burst(e.x,e.z,'#d3bc88',5);if(e.mesh.userData.hits<rules.hits)return {message:`Mining ${e.mesh.userData.hits}/${rules.hits} strikes.`};e.mesh.userData.hits=0;}
      const item=e.kind==='fire-crystal'?'fcrystal':e.kind==='magma-ore'?'mcrystal':e.kind==='obsidian-ore'?'obsidian':'coral';const success=M.claimEnvironmentResource(this.state,e.id,item,Date.now(),e.kind==='obsidian-ore'?180000:e.kind==='fire-crystal'?120000:150000);
      if(success){this.burst(e.x,e.z,e.kind==='clam'?'#d3f5fa':'#ffc76b');if(e.kind==='clam'&&Math.random()<.3)M.addItem(this.state,'pearl');if(rules)for(const [id,chance,min,max] of rules.loot)if(Math.random()<chance)M.addItem(this.state,id,min+Math.floor(Math.random()*(max-min+1))-(id===item?1:0));}
      this.refreshEnvironmentNodes();return {message:success?e.kind==='clam'?'Clam opened: coral and a chance of a pearl.':`${M.ITEMS[item]?.name??item} collected.`:'This resource is regrowing.'};
    }
    return null;
  }
  syncDecorations(){
    for(const e of this.entities.filter(e=>e.kind==='decoration')){this.root.remove(e.mesh);this.disposeTree(e.mesh);}
    this.entities=this.entities.filter(e=>e.kind!=='decoration');this.obstacles=this.obstacles.filter(o=>!o.tag?.startsWith('decor:'));
    if(this.planet!=='home')return;
    for(const d of this.state.decorations??[]){const item=M.ITEMS[d.id];if(!item)continue;const g=buildDecoration(d.id);
      g.rotation.y=d.rotation;const e=this.addEntity('decoration',item.name,item.icon??'🏡',g,d.x,d.z,.9);e.id=`home:decoration:${d.uid}`;g.userData.decorationUid=d.uid;this.obstacles.push({x:d.x,z:d.z,r:.65,tag:'decor:'+d.uid});
    }
  }
  groundPoint(clientX:number,clientY:number){this.raycaster.setFromCamera(new T.Vector2(clientX/innerWidth*2-1,1-clientY/innerHeight*2),this.camera);const p=this.raycaster.ray.intersectPlane(new T.Plane(UP,0),new T.Vector3());return p?{x:p.x,z:p.z}:null;}
  knockUpEnemy(e:Enemy,height=2,duration=.8){e.liftVelocity=Math.max(e.liftVelocity??0,Math.sqrt(Math.max(0,height)*24));e.stun=Math.max(e.stun,duration);}
  statusEnemy(e:Enemy,kind:'fear'|'charm'|'slow'|'blind'|'sheep'|'taunt',duration:number){e.statuses??={};e.statuses[kind]=Math.max(e.statuses[kind]??0,duration);}
  setNetworkRole(role:'host'|'peer'|null){this.networkRole=role;}
  environmentSnapshot():EnvironmentSnapshot{return {time:this.environment.time,lamps:[...this.environment.lamps],eclipseUntil:this.environment.eclipseUntil,...(this.planet==='lava'?{weather:this.environment.weather.snapshot(),nestLevel:this.environment.nestLevel,fireRain:this.environment.fireRain.map(p=>({...p}))}:{}),...(this.planet==='cloud'?{lightning:{...this.environment.lightning,bolts:this.environment.lightning.bolts.map(p=>({...p}))}}:{})};}
  applyEnvironmentSnapshot(snapshot:EnvironmentSnapshot){if(!this.environment||!Number.isFinite(snapshot.time)||snapshot.time<0)return;const offset=snapshot.time-this.environment.time;if(this.environment.riding)this.environment.rideUntil+=offset;this.environment.time=snapshot.time;this.environment.lamps=new Map(snapshot.lamps.filter(([id,until])=>Number.isInteger(id)&&Number.isFinite(until)));this.environment.eclipseUntil=snapshot.eclipseUntil??0;if(snapshot.weather)this.environment.weather.restore(snapshot.weather);if(Number.isFinite(snapshot.nestLevel))this.environment.nestLevel=Math.max(-.9,Math.min(.32,snapshot.nestLevel!));if(snapshot.fireRain)this.environment.fireRain=snapshot.fireRain.filter(p=>[p.x,p.z,p.duration,p.remaining].every(Number.isFinite)&&p.remaining>0&&p.duration>0).map(p=>({...p}));if(snapshot.lightning){const source=snapshot.lightning;this.environment.lightning={wait:Math.max(0,Math.min(13,source.wait||0)),sequence:Math.max(0,Math.floor(source.sequence||0)),bolts:source.bolts.filter(p=>[p.x,p.z,p.remaining,p.duration].every(Number.isFinite)&&p.remaining>0&&p.duration>0).map(p=>({...p}))};}this.syncWeatherNodes();}
  enemySnapshots():EnemySnapshot[]{return this.enemies.map(e=>({id:e.id,type:e.type,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,respawn:e.respawn,phase:e.phase,facing:e.mesh.rotation.y,lift:e.lift??0,boss:e.boss,phaseTime:e.phaseTime,stun:e.stun,statuses:{...e.statuses},cooldown:e.cooldown,targetX:e.targetX,targetZ:e.targetZ,bossStage:e.bossStage,skill:e.skill,attackCount:e.attackCount,skillCount:e.skillCount,telegraphs:e.telegraphs?.map(p=>({...p})),skillEffects:e.skillEffects?.map(p=>({...p})),spinTick:e.spinTick,damage:e.damage,shots:(this.enemyShots??[]).filter(s=>s.ownerId===e.id).map(s=>({id:s.id,x:s.mesh.position.x,y:s.mesh.position.y,z:s.mesh.position.z,vx:s.vx,vz:s.vz,life:s.life,damage:s.damage,targetEnemyId:s.targetEnemyId}))}));}
  applyEnemySnapshots(snapshots:EnemySnapshot[]){for(const snapshot of snapshots){if(!Number.isFinite(snapshot.x)||!Number.isFinite(snapshot.z)||!Number.isFinite(snapshot.hp))continue;let e=this.enemies.find(e=>e.id===snapshot.id);if(!e&&snapshot.type&&ENEMY_TYPES[snapshot.type]){e=this.spawnSpecies(snapshot.type,snapshot.x,snapshot.z,this.enemies.length)??undefined;if(e)e.id=snapshot.id;}if(!e)continue;e.x=snapshot.x;e.z=snapshot.z;e.hp=Math.max(0,snapshot.hp);e.maxHp=snapshot.maxHp;e.respawn=snapshot.respawn;e.phase=snapshot.phase;e.lift=snapshot.lift??0;e.stun=snapshot.stun??0;e.phaseTime=snapshot.phaseTime??0;e.cooldown=snapshot.cooldown??0;e.statuses={...snapshot.statuses};e.targetX=snapshot.targetX;e.targetZ=snapshot.targetZ;e.bossStage=snapshot.bossStage;e.skill=snapshot.skill;e.attackCount=snapshot.attackCount;e.skillCount=snapshot.skillCount;e.telegraphs=snapshot.telegraphs?.map(p=>({...p}));e.skillEffects=snapshot.skillEffects?.map(p=>({...p}));e.spinTick=snapshot.spinTick;e.damage=snapshot.damage??e.damage;e.scaled=true;e.mesh.position.set(e.x,terrainHeight(this.environment.layout,e)+(e.lift??0),e.z);e.mesh.rotation.y=snapshot.facing??0;e.mesh.visible=e.hp>0;
      if(snapshot.shots){this.enemyShots??=[];const ids=new Set(snapshot.shots.map(s=>s.id));for(let i=this.enemyShots.length-1;i>=0;i--)if(this.enemyShots[i].ownerId===e.id&&!ids.has(this.enemyShots[i].id)){const old=this.enemyShots[i];this.scene.remove(old.mesh);old.mesh.geometry.dispose();this.enemyShots.splice(i,1);}for(const source of snapshot.shots){if(![source.x,source.y,source.z,source.vx,source.vz,source.life,source.damage].every(Number.isFinite)||source.life<=0)continue;let shot=this.enemyShots.find(s=>s.id===source.id);if(!shot){const model=ball(e.definition?.accent??'#ffbb72',.17);this.scene.add(model);shot={...source,ownerId:e.id,mesh:model};this.enemyShots.push(shot);}Object.assign(shot,{vx:source.vx,vz:source.vz,life:source.life,damage:source.damage,targetEnemyId:source.targetEnemyId});shot.mesh.position.set(source.x,source.y,source.z);}}
    }}
  receiveRemoteHit(id:string,amount:number,stun=0){const e=this.enemies.find(e=>e.id===id);if(!e||e.hp<=0||!Number.isFinite(amount)||amount<0)return false;this.damageEnemy(e,amount,stun);return true;}
  addRemotePlayer(id:string,pose:RemotePose){this.remotePlayers??=new Map();this.remoteRoot??=new T.Group();if(!this.remoteRoot.parent)this.scene.add(this.remoteRoot);this.removeRemotePlayer(id);const avatar=this.avatar(pose.color??'#6bafd0',pose.gear);avatar.userData.remoteId=id;this.remoteRoot.add(avatar);this.remotePlayers.set(id,{mesh:avatar,pose:{...pose}});this.updateRemotePlayer(id,pose);}
  updateRemotePlayer(id:string,pose:RemotePose){if(!Number.isFinite(pose.x)||!Number.isFinite(pose.z))return;const remote=this.remotePlayers?.get(id);if(!remote){this.addRemotePlayer(id,pose);return;}if(JSON.stringify(pose.gear??remote.pose.gear)!==JSON.stringify(remote.pose.gear)||pose.color&&pose.color!==remote.pose.color){const avatar=this.avatar(pose.color??remote.pose.color??'#6bafd0',pose.gear??remote.pose.gear);this.remoteRoot.remove(remote.mesh);this.disposeTree(remote.mesh);remote.mesh=avatar;avatar.userData.remoteId=id;this.remoteRoot.add(avatar);}remote.pose={...remote.pose,...pose};remote.mesh.position.set(pose.x,pose.y??0,pose.z);remote.mesh.rotation.y=pose.facing??0;remote.mesh.scale.setScalar(HERO_SCALE);remote.mesh.visible=!pose.planet||pose.planet===this.planet;}
  updateRemotePlayers(players:Array<RemotePose&{id:string}>){const ids=new Set(players.map(p=>p.id));for(const id of this.remotePlayers?.keys()??[])if(!ids.has(id))this.removeRemotePlayer(id);for(const pose of players)this.updateRemotePlayer(pose.id,pose);}
  removeRemotePlayer(id:string){const remote=this.remotePlayers?.get(id);if(!remote)return;this.remoteRoot.remove(remote.mesh);this.disposeTree(remote.mesh);this.remotePlayers.delete(id);}
  /** Rebuild every explorer model, for example once the Blender explorer and gear have loaded. */
  refreshAvatars(){this.refreshPlayer();for(const [id,remote] of this.remotePlayers??[]){const pose=remote.pose;this.removeRemotePlayer(id);this.addRemotePlayer(id,pose);}}
  clearRemotePlayers(){for(const id of [...this.remotePlayers?.keys()??[]])this.removeRemotePlayer(id);}
  syncCrops() {
    if(this.planet!=='home')return;
    if(this.plotMeshes.length<this.state.plots.length)for(let i=this.plotMeshes.length;i<this.state.plots.length;i++)this.makePlot(i);
    this.state.plots.forEach((p,i)=>{
      const progress=cropProgress(p),stage=p.crop?progress>=1?3:progress>.35?2:1:0,modelled=!!p.crop&&cropKit.has('crop_'+p.crop),signature=p.crop+':'+stage+(modelled?':kit':'');
      if(this.cropSignatures[i]===signature)return;this.cropSignatures[i]=signature;const g=this.plotMeshes[i];this.disposeTree(g);g.clear();
      if(!p.crop)return;
      // Blender crops: a sprout, then a young plant, then the full crop with a sparkle.
      if(modelled){for(let j=0;j<4;j++){const x=(j%2)*.8-.4,z=Math.floor(j/2)*.8-.4,plant=cropKit.instance(stage===1?'crop_sprout':'crop_'+p.crop);if(!plant)continue;
        // Crops face the camera; a small turn keeps rows from looking stamped.
        plant.position.set(x,.22,z);plant.rotation.y=(((j*37+i*17)%60)-30)*Math.PI/180;
        // Crops pop in with a springy bounce each time they grow a stage.
        plant.userData.target=stage===1?.9:stage===2?.58:1;plant.userData.stage=stage;plant.userData.pop=0;plant.userData.seed=i*3.1+j;plant.scale.setScalar(.01);g.add(plant);
        if(stage===3){const star=mesh(new T.OctahedronGeometry(.07),'#fff0a8',x,1.05+Math.sin(j)*.12,z);g.add(star);}}return;}
      for(let j=0;j<4;j++){const x=(j%2)*.8-.4,z=Math.floor(j/2)*.8-.4;const crop=group();
        if(stage>=2)crop.add(ball(p.crop==='carrot'?'#e9a068':p.crop==='berry'?'#da7f88':'#e5c4d4',stage===3?.26:.15,0,.26,0,1));
        for(let k=0;k<3;k++){const leaf=ball(k%2?'#8cb569':'#6c9953',stage===1?.11:.14,(k-1)*.1,.3+(stage*.05),0);leaf.scale.set(.8,2,.6);leaf.rotation.z=(k-1)*-.45;crop.add(leaf);}crop.position.set(x,.22,z);g.add(crop);
        if(stage===3){const star=mesh(new T.OctahedronGeometry(.065),'#fff0a8',x,.9+Math.sin(j)*.15,z);g.add(star);}
      }
    });
  }
  syncDropped() {
    const old=this.entities.find(e=>e.kind==='dropped');if(old){this.root.remove(old.mesh);this.disposeTree(old.mesh);this.entities=this.entities.filter(e=>e!==old);}
    const d=this.state.dropped;if(d&&d.planet===this.planet)this.addEntity('dropped','Your dropped backpack','🎒',group(ball('#dd94b6',.5,0,.5),cyl('#e5bad0',.17,.17,.25,0,1)),d.x,d.z,.8);
  }
  /** CSS pixels of a world point. `front` is false behind the (perspective) camera, where x and y come out mirrored. */
  screen(x:number,y:number,z:number) { const v=new T.Vector3(x,y,z).project(this.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,visible:v.z<1&&Math.abs(v.x)<1.3&&Math.abs(v.y)<1.3,front:v.z<1}; }
  pointer(clientX:number,clientY:number) {
    this.raycaster.setFromCamera(new T.Vector2(clientX/innerWidth*2-1,1-clientY/innerHeight*2),this.camera);
    const hits=this.raycaster.intersectObjects(this.root.children,true);
    for(const hit of hits){let obj:T.Object3D|null=hit.object;let entity:Entity|undefined,visible=true;
      while(obj){if(!obj.visible)visible=false;if(obj.userData.entity)entity=obj.userData.entity;obj=obj.parent;}
      if(visible&&entity&&this.validTarget(entity)){this.select(entity);return;}
    }
    const point=this.raycaster.ray.intersectPlane(new T.Plane(UP,0),new T.Vector3());if(point){this.selected=null;this.ring.visible=false;this.walkTo(point.x,point.z);}
  }
  private validTarget(e:Entity) { return this.entities.includes(e)&&e.mesh.parent===this.root&&e.mesh.visible&&(e.kind!=='enemy'||(e as Enemy).hp>0); }
  private interactionRange(e:Entity) { return e.kind==='enemy'?attackRange(M.weaponStats(this.state),e.radius):e.radius+1.45; }
  select(e:Entity) {
    if(!this.validTarget(e))return;
    this.selected=e;this.ring.visible=true;this.ring.scale.setScalar(e.radius);this.ring.position.set(e.x,.12,e.z);
    if(this.position.distanceTo(new T.Vector3(e.x,0,e.z))<=this.interactionRange(e)){this.destination=null;this.route=[];this.marker.visible=false;if(e.kind==='enemy')this.onAttackEnemy(e as Enemy);else {this.selected=null;this.ring.visible=false;this.onInteract(e);}return;}
    const point=approach(this.position,e,e.radius,this.collisionObstacles(),e.kind==='enemy'?this.interactionRange(e)-.15:e.radius+1.1,this.navigationOptions());if(point)this.walkTo(point.x,point.z,true);
  }
  private combinedObstacles:{list:Obstacle[];base:Obstacle[];length:number;dynamic:Obstacle[]}|null=null;
  /** Static and moving obstacles together; the same list is reused until either changes, so its grid index is too. */
  private collisionObstacles(){
    const dynamic=this.dynamicObstacles??[],cached=this.combinedObstacles;
    if(cached&&cached.base===this.obstacles&&cached.length===this.obstacles.length&&cached.dynamic===dynamic)return cached.list;
    const list=dynamic.length?this.obstacles.concat(dynamic):this.obstacles;
    this.combinedObstacles={list,base:this.obstacles,length:this.obstacles.length,dynamic};return list;
  }
  private navigationOptions(clearance=.36,allowVoid=false):NavigationOptions{return {bounds:WORLD_BOUNDS,clearance,walkable:p=>Math.hypot(p.x,p.z)<=WORLD_BOUNDS&&(allowVoid||this.playerFlying||!this.environment||environmentWalkable(this.environment.layout,p))};}
  blocked(x:number,z:number) {return blocked({x,z},this.collisionObstacles(),this.navigationOptions());}
  walkTo(x:number,z:number,keepSelected=false) {
    const distance=Math.hypot(x,z);if(distance>WORLD_BOUNDS-1){x*=((WORLD_BOUNDS-1)/distance);z*=((WORLD_BOUNDS-1)/distance);}if(!keepSelected)this.selected=null;
    if(this.blocked(x,z)){const obstacle=this.collisionObstacles().find(o=>Math.hypot(x-o.x,z-o.z)<o.r+.36);if(obstacle){const d=this.position.clone().sub(new T.Vector3(obstacle.x,0,obstacle.z)).normalize();x=obstacle.x+d.x*(obstacle.r+.6);z=obstacle.z+d.z*(obstacle.r+.6);}}
    this.destination=new T.Vector3(x,0,z);this.route=this.findPath(this.destination);this.marker.position.set(x,.08,z);this.marker.visible=true;
  }
  findPath(target:T.Vector3) {
    return findRoute(this.position,target,this.collisionObstacles(),this.navigationOptions()).map(p=>new T.Vector3(p.x,0,p.z));
  }
  nearest() {return this.entities.filter(e=>this.validTarget(e)).sort((a,b)=>Math.hypot(a.x-this.position.x,a.z-this.position.z)-a.radius-(Math.hypot(b.x-this.position.x,b.z-this.position.z)-b.radius)).find(e=>Math.hypot(e.x-this.position.x,e.z-this.position.z)<e.radius+2);}
  interactNearest() {const e=this.nearest();if(e)this.select(e);}
  burst(x:number,z:number,color:string,count=14) {
    if(this.fx){this.fx.burst({x,z},{n:count,color:[color,'#ffffff'],speed:4,up:5,size:.13});this.fx.burst({x,z},{n:Math.ceil(count/2),color,glow:true,size:.12,speed:3,up:4,life:.5});return;}
    for(let i=0;i<count;i++){const p=ball(color,.06+Math.random()*.05,x,.6,z,0);this.scene.add(p);this.particles.push({mesh:p,velocity:new T.Vector3((Math.random()-.5)*4,2+Math.random()*3,(Math.random()-.5)*4),life:.6+Math.random()*.4,max:1});}
  }
  skillEffect(radius:number,color:string) {
    const ring=mesh(new T.TorusGeometry(radius,.06,5,50),color,this.position.x,.4,this.position.z);ring.rotation.x=Math.PI/2;this.scene.add(ring);this.particles.push({mesh:ring,velocity:new T.Vector3(0,.5,0),life:.5,max:.5});this.burst(this.position.x,this.position.z,color,22);
  }
  /** Visual response to a landed hit: flash, colour chips, sparks, an impact ring and the number. */
  hitFeedback(e:Enemy,amount:number,critical:boolean){
    e.flash=.14;const fx=this.fx;if(!fx)return;
    const at={x:e.x,y:e.mesh.position.y,z:e.z},colors=[e.definition?.color??'#fff0bb',e.definition?.accent??'#ffffff'];
    fx.burst(at,{n:critical?14:8,color:colors,size:.12,speed:5,up:4,y:.8});
    fx.burst(at,{n:critical?12:5,color:['#ffffff','#fff7a8'],glow:true,size:critical?.16:.1,speed:critical?8:5,up:3,y:.8,life:.35});
    fx.ring({x:e.x,z:e.z},{color:critical?'#ffe14d':'#ffffff',from:.2,to:critical?1.6:1,life:.2,thick:.35,y:at.y+.8});
    fx.text(at,critical?amount+'!':String(amount),critical?'crit big':'dmg');
    if(critical){fx.flash({x:e.x,y:at.y+.9,z:e.z},'#fff3b0',1.6,.12);fx.freeze(.06);fx.shake(.12);}
  }
  /** A defeated creature bursts into a puff instead of blinking out. */
  defeatFeedback(e:Enemy){
    const fx=this.fx;if(!fx)return;const at={x:e.x,y:e.mesh.position.y,z:e.z},color=e.definition?.color??'#ffffff';
    fx.burst(at,{n:e.boss?40:16,color:[color,'#ffffff',e.definition?.accent??color],size:.16,speed:6,up:6,y:.6});
    fx.burst(at,{n:e.boss?30:12,color:['#ffffff','#fff7a8'],glow:true,size:.18,speed:4,up:5,life:.7});
    fx.ring({x:e.x,z:e.z},{color:'#ffffff',from:.3,to:e.boss?4:2,life:.45,y:.1});fx.flash({x:e.x,y:at.y+.8,z:e.z},'#ffffff',e.boss?3.2:1.8,.18);
    if(e.boss)fx.shake(.45);
  }
  /** The player flinches and briefly glows red. */
  hurtFeedback(amount:number){
    this.hurtT=.25;const fx=this.fx;if(!fx)return;
    fx.text(this.position,'-'+amount,'hurt');fx.shake(Math.min(.35,.12+amount/60));
    fx.burst(this.position,{n:6,color:['#ff7b6b','#ffffff'],size:.1,speed:4,up:3,y:.9});
  }
  /** Swing arcs and animation for the player's own attacks. */
  playerAttack(kind:'fist'|'sword'|'gun'|'rod'){
    const fx=this.fx,at={x:this.position.x,y:this.position.y,z:this.position.z};
    if(kind==='gun'){this.aimT=.7;this.punchT=.12;fx?.flash({x:at.x+Math.sin(this.facing)*.9,y:at.y+1,z:at.z+Math.cos(this.facing)*.9},'#fff8c8',.9,.08);return;}
    // The slash arc itself arrives through the shared combat effects, so remote players see it too.
    this.punchT=.25;if(kind!=='sword')this.punchArm^=1;
    fx?.burst({x:at.x+Math.sin(this.facing)*1.3,y:at.y,z:at.z+Math.cos(this.facing)*1.3},{n:5,color:'#ffffff',glow:true,size:.1,speed:3,up:2,y:.8,life:.3});
  }
  damageEnemy(e:Enemy,amount:number,stun=0,hazard=false) {
    if(e.hp<=0)return;
    if(!hazard&&e.type==='magmaturtle')amount*=e.phase==='recover'?2:.12;
    e.hp=Math.max(0,e.hp-amount);e.stun=Math.max(e.stun,stun,.17);this.burst(e.x,e.z,'#fff0bb',8);
    if(e.hp===0){e.respawn=e.type==='minislime'||e.type==='dragon'?999999:e.boss?90:22+Math.random()*10;e.dying=.3;e.knockVX=e.knockVZ=0;e.telegraphs=[];e.skillEffects=[];
      if(e.type==='magmaslime'&&this.networkRole!=='peer')this.enemies.filter(m=>m.type==='minislime'&&m.hp<=0).slice(0,3).forEach((minion,index)=>{const a=index*Math.PI*2/3;minion.x=e.x+Math.cos(a)*.9;minion.z=e.z+Math.sin(a)*.9;this.resolveOverlap(minion,this.collisionObstacles(),minion.radius);minion.homeX=minion.x;minion.homeZ=minion.z;minion.hp=minion.maxHp;minion.phase='idle';minion.stun=0;minion.respawn=0;});
      if(this.selected===e){this.selected=null;this.destination=null;this.route=[];this.ring.visible=false;}}
  }
  move(dx:number,dz:number,allowVoid=false) {
    const obstacles=this.collisionObstacles(),options=this.navigationOptions(.36,allowVoid);
    const next={x:this.position.x+dx,z:this.position.z+dz};
    if(clearSegment(this.position,next,obstacles,options)){this.position.x=next.x;this.position.z=next.z;return;}
    if(clearSegment(this.position,{x:next.x,z:this.position.z},obstacles,options))this.position.x=next.x;
    if(clearSegment(this.position,{x:this.position.x,z:next.z},obstacles,options))this.position.z=next.z;
  }
  dash() {for(let i=0;i<18;i++)this.move(Math.sin(this.facing)*.25,Math.cos(this.facing)*.25);this.burst(this.position.x,this.position.z,'#e8f5e1');}
  private resolveOverlap(point:Point,obstacles:Obstacle[],clearance:number){
    for(let pass=0;pass<8;pass++){let changed=false;for(const o of obstacles){const distance=Math.hypot(point.x-o.x,point.z-o.z),minimum=o.r+clearance+.015;if(distance<minimum){const angle=distance>.0001?Math.atan2(point.z-o.z,point.x-o.x):.73;point.x=o.x+Math.cos(angle)*minimum;point.z=o.z+Math.sin(angle)*minimum;changed=true;}}if(!changed)break;}
  }
  private creatureWalkable(e:Enemy,point:Point,allowVoid=false){
    if(Math.hypot(point.x,point.z)>=WORLD_BOUNDS)return false;
    const floating=e.definition?.flying||['firebat','thunderbird','jellyzap','wisp'].includes(e.type??'');
    if(!allowVoid&&!floating&&this.planet==='cloud'&&!environmentWalkable(this.environment.layout,point))return false;
    if(!allowVoid&&!floating&&e.type!=='lavaworm'&&this.planet==='lava'){
      // Rising lava may surround a creature: allow escape, but never walk into it from dry ground.
      if(!this.environment.lavaAt(e)&&this.environment.lavaAt(point))return false;
    }
    const safe=(this.planet==='home'?18:11)+1.5;
    return Math.hypot(point.x,point.z)>=Math.min(safe,Math.hypot(e.x,e.z))-.001;
  }
  private moveCreature(e:Enemy,dx:number,dz:number,allowVoid=false){
    const light=this.planet==='shadow'?this.environment.enemyLightObstacles():[],obstacles=light.length?this.collisionObstacles().concat(light):this.collisionObstacles(),options=this.navigationOptions(e.radius,true);
    options.walkable=p=>this.creatureWalkable(e,p,allowVoid);
    this.resolveOverlap(e,obstacles,options.clearance!);
    const next={x:e.x+dx,z:e.z+dz};
    if(clearSegment(e,next,obstacles,options)){e.x=next.x;e.z=next.z;return;}
    if(clearSegment(e,{x:next.x,z:e.z},obstacles,options))e.x=next.x;
    if(clearSegment(e,{x:e.x,z:next.z},obstacles,options))e.z=next.z;
  }
  private separateCreatures(){
    const living=this.enemies.filter(e=>e.hp>0),cells=new Map<string,Enemy[]>(),size=4;
    for(const e of living){const key=Math.floor(e.x/size)+','+Math.floor(e.z/size),cell=cells.get(key)??[];cell.push(e);cells.set(key,cell);}
    const index=new Map(living.map((e,i)=>[e,i]));
    for(const a of living){const cx=Math.floor(a.x/size),cz=Math.floor(a.z/size);
      for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const b of cells.get(x+','+z)??[]){
        if(index.get(a)!>=index.get(b)!)continue;const moveA=(a.definition?.speed??2.4)>0,moveB=(b.definition?.speed??2.4)>0;if(!moveA&&!moveB)continue;
        const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz),minimum=a.radius+b.radius;if(d>=minimum)continue;
        const angle=(index.get(a)!*2.399+index.get(b)!*.73),nx=d>.0001?dx/d:Math.cos(angle),nz=d>.0001?dz/d:Math.sin(angle),push=(minimum-d+.002)/(moveA&&moveB?2:1);
        if(moveA)this.moveCreature(a,nx*push,nz*push);if(moveB)this.moveCreature(b,-nx*push,-nz*push);
      }
    }
  }
  private enemyTarget(e:Enemy){
    const candidates:Array<Point&{id?:string;enemy?:Enemy}>=[];
    const safe=this.planet==='home'?18:11;
    if(!this.playerStealth&&Math.hypot(this.position.x,this.position.z)>=safe)candidates.push({x:this.position.x,z:this.position.z});
    for(const [id,remote] of this.remotePlayers??[])if(remote.mesh.visible&&(remote.pose.hp??1)>0&&Math.hypot(remote.pose.x,remote.pose.z)>=safe)candidates.push({x:remote.pose.x,z:remote.pose.z,id});
    if((e.statuses?.charm??0)>0)return this.enemies.filter(other=>other!==e&&other.hp>0).map(enemy=>({x:enemy.x,z:enemy.z,enemy})).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
    return candidates.sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
  }
  private hitEnemyTarget(target:Point&{id?:string;enemy?:Enemy},amount:number,source:'melee'|'shot'|'hazard'='melee'){if(target.enemy)(this.onHazardEnemy??((e,d)=>this.damageEnemy(e,d)))(target.enemy,amount);else if(target.id)this.onRemoteDamage?.(target.id,amount,source);else if(!this.playerFlying||source!=='melee')this.onDamage(amount,source);}
  private shootEnemy(e:Enemy,target:Point&{id?:string;enemy?:Enemy}){
    const distance=Math.max(.01,Math.hypot(target.x-e.x,target.z-e.z)),shot=ball(e.definition?.accent??'#f5b576',.17,e.x,1.0,e.z,0);this.scene.add(shot);
    this.enemyShots.push({id:e.id+':shot:'+Math.random().toString(36).slice(2,10),ownerId:e.id,mesh:shot,vx:(target.x-e.x)/distance*13,vz:(target.z-e.z)/distance*13,life:1.4,damage:e.damage,targetId:target.id,targetEnemyId:target.enemy?.id});
  }
  private areaDamage(e:Enemy,x:number,z:number,radius:number,multiplier:number,inner=0){
    const hit=(p:Point)=>{const d=Math.hypot(p.x-x,p.z-z);return d<radius&&d>=inner;};
    if((e.statuses?.charm??0)>0){for(const target of this.enemies)if(target!==e&&target.hp>0&&hit(target))(this.onHazardEnemy??((v,d)=>this.damageEnemy(v,d)))(target,e.damage*multiplier);return;}
    const environmentAtStart=this.environment,source=e.skill==='rain'||e.skill==='eclipse'?'shot':'melee';if(hit(this.position))this.hitEnemyTarget(this.position,e.damage*multiplier,source);
    if(this.environment!==environmentAtStart)return;
    for(const [id,remote] of this.remotePlayers??[])if(remote.mesh.visible&&(remote.pose.hp??1)>0&&hit(remote.pose))this.onRemoteDamage?.(id,e.damage*multiplier,source);
  }
  private beginBossSkill(e:Enemy,target:Point){
    e.attackCount=(e.attackCount??0)+1;
    e.skill=bossSkill(e.type??'',e.attackCount,e.hp/e.maxHp,e.skillCount??0)??undefined;
    if(!e.skill){e.telegraphs=[];return false;}
    e.skillCount=(e.skillCount??0)+1;e.phaseTime=BOSS_WINDUPS[e.skill]*(e.hp<e.maxHp*.3?.8:1);
    const phase=e.hp<e.maxHp*.5?Math.max(2,e.bossStage??1):e.bossStage??1;e.telegraphs=bossTelegraphs(e.skill,e,target,phase,e.attackCount);
    if(e.skill==='rain'&&!(e.statuses?.charm)){const additional=[this.position,...[...this.remotePlayers?.values()??[]].filter(r=>r.mesh.visible&&(r.pose.hp??1)>0).map(r=>r.pose)].filter(p=>Math.hypot(p.x-e.x,p.z-e.z)<=22&&Math.hypot(p.x-target.x,p.z-target.z)>.05);for(const p of additional)e.telegraphs.push(...bossTelegraphs(e.skill,e,p,phase,e.attackCount+e.telegraphs.length));}
    if(e.type==='dragon'&&(e.bossStage??1)>=2&&(e.skill==='slam'||e.skill==='rain')){
      const random=seeded(e.attackCount*9127),targets=[this.position,...[...this.remotePlayers?.values()??[]].filter(r=>r.mesh.visible&&(r.pose.hp??1)>0).map(r=>r.pose)].filter(p=>Math.hypot(p.x-e.x,p.z-e.z)<=25);
      targets.forEach((p,index)=>{for(let i=0;i<((e.bossStage??1)>=3?5:3);i++){const angle=random()*Math.PI*2,r=random()*4;this.environment.addFireRain({x:p.x+Math.cos(angle)*r,z:p.z+Math.sin(angle)*r},`dragon:${e.attackCount}:${index}:${i}`);}});
    }
    this.onEnvironmentEvent?.({kind:'boss-warning',message:`${e.name}: ${e.skill.toUpperCase()}! Move out of the warning marks.`});
    return true;
  }
  private castBossSkill(e:Enemy){
    const skill=e.skill;if(!skill)return;
    e.phase='recover';e.phaseTime=.7;e.cooldown=(e.definition?.cooldown??2)*(e.hp<e.maxHp*.5?.7:1)*(e.hp<e.maxHp*.3?.6:1)*((e.bossStage??1)>=3?.8:1);
    if(skill==='slam')this.areaDamage(e,e.x,e.z,4.8,1.6);
    if(skill==='quake')e.skillEffects=[3,6,9].map((r,index)=>({x:e.x,z:e.z,r:r+.4,inner:r-2.4,remaining:.12+index*.32,multiplier:1.1}));
    if(skill==='rain')for(const p of e.telegraphs??[])this.areaDamage(e,p.x,p.z,p.r,1.3);
    if(skill==='barrage'){
      const count=e.hp<e.maxHp*.5?20:14;
      for(let i=0;i<count;i++){const a=i/count*Math.PI*2+e.mesh.rotation.y;this.shootEnemy(e,{x:e.x+Math.sin(a)*10,z:e.z+Math.cos(a)*10});}
    }
    if(skill==='charge'){
      const dx=(e.targetX??e.x)-e.x,dz=(e.targetZ??e.z)-e.z,d=Math.hypot(dx,dz)||1;e.targetX=e.x+dx/d*14;e.targetZ=e.z+dz/d*14;e.phase='charge';e.phaseTime=.7;e.mesh.userData.chargeHit=false;
    }
    if(skill==='spin'){e.phase='bspin';e.phaseTime=2.4;e.spinTick=0;}
    if(skill==='eclipse'){this.areaDamage(e,e.x,e.z,7,.9);this.environment.eclipseUntil=this.environment.time+6;}
    this.burst(e.x,e.z,e.definition?.accent??'#ffc17b',25);e.telegraphs=[];
  }
  private updateBossTelegraphs(e:Enemy){
    let root=e.mesh.userData.warningRoot as T.Group|undefined;
    const marks=e.phase==='windup'?e.telegraphs??[]:[];
    if(!root&&marks.length){root=new T.Group();root.userData.environment=true;e.mesh.userData.warningRoot=root;this.root.add(root);}
    if(!root)return;root.visible=e.hp>0&&marks.length>0;
    while(root.children.length<marks.length){const ring=mesh(new T.RingGeometry(.88,1,32),'#ed5b56');ring.rotation.x=-Math.PI/2;root.add(ring);}
    root.children.forEach((ring,index)=>{const mark=marks[index];ring.visible=!!mark;if(mark){ring.position.set(mark.x,Math.max(.06,terrainHeight(this.environment.layout,mark)+.06),mark.z);ring.scale.setScalar(mark.r);}});
  }

  private updateEnemyAi(e:Enemy,dt:number){
    e.cooldown=Math.max(0,e.cooldown-dt);e.stun=Math.max(0,e.stun-dt);e.routeTime=Math.max(0,(e.routeTime??0)-dt);
    for(const key of Object.keys(e.statuses??{}))e.statuses![key]=Math.max(0,e.statuses![key]-dt);
    if(e.hp<=0){e.respawn-=dt;if(e.respawn<=0&&Math.hypot(this.position.x-e.homeX,this.position.z-e.homeZ)>22&&![...this.remotePlayers?.values()??[]].some(r=>r.mesh.visible&&Math.hypot(r.pose.x-e.homeX,r.pose.z-e.homeZ)<22)){e.maxHp=e.baseMaxHp??e.maxHp;e.damage=e.baseDamage??e.damage;e.hp=e.maxHp;e.x=e.homeX;e.z=e.homeZ;e.mesh.visible=true;e.dying=0;e.phase='idle';this.fx?.burst({x:e.x,z:e.z},{n:14,color:[e.definition?.color??'#ffffff','#ffffff'],speed:3,up:5});e.route=[];e.stun=0;e.scaled=false;e.skill=undefined;e.telegraphs=[];e.skillEffects=[];}return;}
    const def=e.definition??{speed:2.4,reach:1.8,sight:e.boss?11:6,behavior:'melee',cooldown:1.3,windup:.35,flying:false};
    const target=this.enemyTarget(e),distance=target?Math.hypot(target.x-e.x,target.z-e.z):Infinity;
    if(e.boss&&!e.scaled&&distance<def.sight&&e.hp===e.maxHp){
      const nearby=[...this.remotePlayers?.values()??[]].filter(r=>r.mesh.visible&&(r.pose.hp??1)>0&&Math.hypot(r.pose.x-e.x,r.pose.z-e.z)<32),players=nearby.length+(Math.hypot(this.position.x-e.x,this.position.z-e.z)<32?1:0),level=Math.max(this.state.level,...nearby.map(r=>r.pose.level??1)),difference=Math.max(0,level-(e.level??1));
      e.maxHp=Math.round((e.baseMaxHp??e.maxHp)*(1+.6*Math.max(0,players-1))*(e.type==='dragon'?1:1+difference*.12));e.hp=e.maxHp;e.damage=(e.baseDamage??e.damage)*(e.type==='dragon'?1:(1+difference*.07)*(1+.1*Math.max(0,players-1)));e.scaled=true;
    }
    if(distance>65&&(!e.phase||e.phase==='idle')&&e.hp===e.maxHp)return;
    if(e.boss){e.bossStage=e.type==='dragon'?bossPhase(e.hp,e.maxHp):1;for(const pulse of e.skillEffects??[]){pulse.remaining-=dt;if(pulse.remaining<=0){this.areaDamage(e,pulse.x,pulse.z,pulse.r,pulse.multiplier,pulse.inner);this.burst(pulse.x,pulse.z,'#edb875',12);}}e.skillEffects=e.skillEffects?.filter(p=>p.remaining>0);}
    const statuses=e.statuses??{},noAttack=(statuses.blind??0)>0||(statuses.sheep??0)>0||(statuses.fear??0)>0;
    if(e.stun>0){e.phase='chase';e.telegraphs=[];return;}
    if(e.phase==='windup'){
      e.phaseTime=(e.phaseTime??0)-dt;
      if(e.phaseTime<=0){
        if(e.skill&&!noAttack){this.castBossSkill(e);return;}
        if(e.type==='magmaturtle'||e.type==='lavaworm'){
          if(!noAttack)this.areaDamage(e,e.x,e.z,e.type==='magmaturtle'?2.6:2,e.type==='magmaturtle'?1.1:1.3);e.phase='recover';e.phaseTime=e.type==='magmaturtle'?3:3.2;e.cooldown=def.cooldown;this.burst(e.x,e.z,'#ffc976',18);return;
        }
        if(def.behavior==='charger'&&!noAttack){e.phase='charge';e.phaseTime=.75;e.mesh.userData.chargeHit=false;if(target){const dx=target.x-e.x,dz=target.z-e.z,d=Math.hypot(dx,dz)||1;e.targetX=e.x+dx/d*13*.75;e.targetZ=e.z+dz/d*13*.75;}}
        else{
          if(target&&!noAttack){const reach=e.mesh.userData.slam?5.5:def.reach;
            if(def.behavior==='shooter')this.shootEnemy(e,target);
            else if(distance<reach+.4&&clearSegment(e,target,this.obstacles,{bounds:WORLD_BOUNDS,clearance:0}))this.hitEnemyTarget(target,e.damage*(e.mesh.userData.slam?1.25:1));
          }
          e.phase='recover';e.phaseTime=e.boss?.7:.45;e.cooldown=def.cooldown;
        }
      }return;
    }
    if(e.phase==='bspin'){e.phaseTime=(e.phaseTime??0)-dt;e.spinTick=(e.spinTick??0)-dt;e.mesh.rotation.y+=dt*18;if(target&&distance>1.5)this.moveCreature(e,(target.x-e.x)/distance*def.speed*1.1*dt,(target.z-e.z)/distance*def.speed*1.1*dt);if(e.spinTick<=0&&!noAttack){e.spinTick=.35;this.areaDamage(e,e.x,e.z,3.4,.5);}if(e.phaseTime<=0){e.phase='recover';e.phaseTime=.7;}return;}
    if(e.phase==='charge'){
      const dx=(e.targetX??e.x)-e.x,dz=(e.targetZ??e.z)-e.z,d=Math.hypot(dx,dz);
      if(d>.1)this.moveCreature(e,dx/d*(e.skill==='charge'?18:13)*dt,dz/d*(e.skill==='charge'?18:13)*dt);
      if(target&&distance<def.reach+.4&&!e.mesh.userData.chargeHit){this.hitEnemyTarget(target,e.damage*1.3);e.mesh.userData.chargeHit=true;}
      e.phaseTime=(e.phaseTime??0)-dt;if((e.phaseTime??0)<=0||d<.3){e.phase='recover';e.phaseTime=e.boss?.7:.45;e.cooldown=def.cooldown;}return;
    }
    if(e.phase==='recover'){e.phaseTime=(e.phaseTime??0)-dt;if(e.phaseTime!<=0)e.phase='chase';return;}
    const homeDistance=Math.hypot(e.x-e.homeX,e.z-e.homeZ),leash=e.type==='dragon'?75:30,wasChasing=e.phase==='chase'||e.hp<e.maxHp&&e.phase!=='return';
    const chasing=!!target&&(distance<def.sight*(wasChasing?1.6:1)||(statuses.taunt??0)>0)&&homeDistance<(e.phase==='return'?20:leash);
    let returning=!chasing&&(wasChasing||e.phase==='return');
    if(returning){e.phase='return';e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.3*dt);if(homeDistance<.8||def.speed===0){e.hp=e.maxHp;e.phase='idle';returning=false;}}
    let goal:Point=chasing?target!:returning?{x:e.homeX,z:e.homeZ}:{x:e.homeX+Math.sin(this.time*.25+e.homeZ)*2,z:e.homeZ+Math.cos(this.time*.25+e.homeX)*2};
    if((statuses.fear??0)>0&&target)goal={x:e.x+(e.x-target.x),z:e.z+(e.z-target.z)};
    const canWindup=distance<(e.type==='lavaworm'?1.2:def.reach)||(e.type==='boar'||['firebat','thunderbird','jellyzap','wisp'].includes(e.type??''))&&distance<8;
    if(chasing&&canWindup&&!e.cooldown&&!noAttack){
      e.phase='windup';e.phaseTime=def.windup;e.targetX=target!.x;e.targetZ=target!.z;e.mesh.userData.attackCount=(e.mesh.userData.attackCount??0)+1;e.mesh.userData.slam=e.boss&&e.mesh.userData.attackCount%3===0;
      if(e.boss)this.beginBossSkill(e,target!);else e.skill=undefined;
      if(e.mesh.userData.slam&&!e.skill)e.phaseTime=1.1;e.mesh.rotation.y=Math.atan2(target!.x-e.x,target!.z-e.z);return;
    }
    if(chasing&&distance<8&&distance>.001&&['firebat','thunderbird','jellyzap','wisp'].includes(e.type??'')&&!noAttack){
      const side=(Number(e.id.split(':').at(-1))||0)%2?1:-1,dx=(target!.x-e.x)/distance,dz=(target!.z-e.z)/distance,radial=(distance-5)*.4;
      const vx=-dz*side+dx*radial,vz=dx*side+dz*radial,n=Math.hypot(vx,vz),speed=def.speed*.8*((statuses.slow??0)>0?.45:1);
      this.moveCreature(e,vx/n*speed*dt,vz/n*speed*dt);e.mesh.rotation.y=Math.atan2(vx,vz);e.phase='chase';return;
    }
    if(def.speed===0)return;
    if(chasing&&distance<def.reach*.8&&!noAttack)return;
    const obstacles=this.collisionObstacles().concat(this.planet==='shadow'?this.environment.enemyLightObstacles():[]),options=this.navigationOptions(e.radius,true);
    options.walkable=p=>this.creatureWalkable(e,p);
    this.resolveOverlap(e,obstacles,options.clearance!);
    if(!clearSegment(e,goal,obstacles,options)){
      if(!e.routeTime){e.routeTime=.7;const endpoint=approach(e,goal,0,obstacles,chasing?Math.max(.7,def.reach*.7):.3,options);e.route=endpoint?findRoute(e,endpoint,obstacles,options):[];}
      if(e.route?.length){if(Math.hypot(e.route[0].x-e.x,e.route[0].z-e.z)<.12)e.route.shift();if(e.route.length)goal=e.route[0];}
    }else e.route=[];
    const dx=goal.x-e.x,dz=goal.z-e.z,d=Math.hypot(dx,dz),speed=(chasing?def.speed:returning?def.speed*1.2:.6)*(e.boss&&e.hp<e.maxHp*.5?1.35:1)*(e.boss&&e.hp<e.maxHp*.3?1.25:1)*((e.bossStage??1)>=3?1.2:1)*((statuses.slow??0)>0?.45:1)*((statuses.sheep??0)>0?.45:1);
    if(d>.05){const step=Math.min(d,speed*dt);this.moveCreature(e,dx/d*step,dz/d*step);e.mesh.rotation.y=Math.atan2(dx,dz);e.phase=chasing?'chase':returning?'return':'idle';}
  }
  /** Push a creature back; it slides and slows like the reference's knockback, blocked by scenery. */
  knockEnemy(e:Enemy,dirX:number,dirZ:number,strength:number){
    if(e.boss)strength*=.35;if(e.definition?.behavior==='rooted'||!(e.definition?.speed??1))return;
    e.knockVX=(e.knockVX??0)+dirX*strength*8;e.knockVZ=(e.knockVZ??0)+dirZ*strength*8;
  }
  /**
   * Creature body language: hoppers squash and stretch, walkers trot, flyers flap,
   * rooted plants sway. Before an attack a creature crouches, leans back and trembles;
   * it lunges on the strike, leans into a charge, wobbles while stunned, and shouts
   * "!" when it first notices the explorer.
   */
  private animateEnemy(e:Enemy,dt:number){
    const m=e.mesh,u=m.userData,def=e.definition;m.rotation.order='YXZ';
    const moved=Math.hypot(e.x-(u.lastX??e.x),e.z-(u.lastZ??e.z));u.lastX=e.x;u.lastZ=e.z;
    const moving=dt>0&&moved>dt*.4;u.moving=moving;
    u.anim=(u.anim??(e.homeX*3.7%6))+dt*(moving?(e.phase==='charge'?22:10):3);
    const o=u.anim,s=Math.sin(o),behavior=def?.behavior??'melee';
    if(u.lastPhase!==e.phase){
      if((u.lastPhase==='idle'||u.lastPhase==='return')&&e.phase==='chase'&&Math.hypot(e.x-this.position.x,e.z-this.position.z)<20){this.fx?.text({x:e.x,y:m.position.y+(e.boss?2.4:1.1),z:e.z},'!','alert');this.onAlert?.(e);}
      if(u.lastPhase==='windup'&&e.phase!=='windup')u.strikeT=.25;
      u.lastPhase=e.phase;
    }
    u.strikeT=Math.max(0,(u.strikeT??0)-dt);
    const windup=e.phase==='windup'?Math.min(1,1-(e.phaseTime??0)/Math.max(.05,e.mesh.userData.slam?1.1:def?.windup??.45)):0;
    let lean=0,roll=0,lift=0,sx=1,sy=1,sz=1,shake=0;
    if(behavior==='hopper'){if(moving){const h=Math.abs(Math.sin(o*.6));lift=h*.45;sx=sz=1+(1-h)*.12;sy=1-(1-h)*.15+h*.08;}else sy=1+Math.sin(o)*.03;}
    else if(behavior==='rooted'){roll=Math.sin(this.time*1.5+e.homeX)*.08;lean=Math.sin(this.time*1.1+e.homeZ)*.05;}
    else if(!def?.flying){if(moving){lift=Math.abs(Math.cos(o))*.07;roll=s*.06;}else sy=1+Math.sin(o)*.02;}
    const legs=u.legs??=[0,1,2,3].map(i=>m.getObjectByName('leg'+i)).filter(Boolean);
    legs.forEach((leg:T.Object3D,i:number)=>{leg.rotation.x=moving?(i===1||i===2?s:-s)*.75:0;});
    const wings=u.wings??=['wing-l','wing-r'].map(n=>m.getObjectByName(n)).filter(Boolean);
    wings.forEach((wing:T.Object3D,i:number)=>{wing.rotation.z=(i?-1:1)*Math.sin(this.time*(def?.flying?16:6)+e.homeX)*(def?.flying?.55:.2);});
    if(windup>0){sx*=1+windup*.2;sy*=1-windup*.25;sz*=1+windup*.2;lean=-windup*.2;shake=Math.sin(this.time*60)*.04*windup;}
    if(u.strikeT>0)lean=(behavior==='rooted'?.55:.4)*(u.strikeT/.25);
    if(e.phase==='charge')lean=.25;
    if(e.stun>.25&&!e.lift){roll=Math.sin(this.time*20)*.1;if(this.fx&&Math.random()<dt*6)this.fx.burst({x:e.x,y:m.position.y+(e.boss?2.6:1.3),z:e.z},{n:1,color:'#fff27a',glow:true,size:.09,speed:1.5,up:.5,life:.5,gravity:0});}
    m.position.y+=lift;m.position.x+=shake;m.rotation.x=lean;m.rotation.z=roll;m.scale.x*=sx;m.scale.y*=sy;m.scale.z*=sz;
    // Knockback velocity decays quickly; scenery stops the slide.
    if(this.networkRole!=='peer'&&(Math.abs(e.knockVX??0)>.05||Math.abs(e.knockVZ??0)>.05)&&dt>0){
      this.moveCreature(e,(e.knockVX??0)*dt,(e.knockVZ??0)*dt);const k=Math.max(0,1-dt*8);e.knockVX=(e.knockVX??0)*k;e.knockVZ=(e.knockVZ??0)*k;
    }
  }
  private updateEnemyVisual(e:Enemy,dt:number){
    // Only creatures near the view cast shadows; the shadow box reaches well past the screen,
    // and distant creatures would otherwise double their draw cost for shadows nobody sees.
    const near=Math.hypot(e.x-this.cameraTarget.x,e.z-this.cameraTarget.z)<16;
    if(e.mesh.userData.castsShadow!==near){e.mesh.userData.castsShadow=near;e.mesh.traverse(o=>{if(o instanceof T.Mesh&&o.name!=='attack-telegraph')o.castShadow=near;});}
    // A defeated creature swells and shrinks away instead of blinking out.
    if(e.hp<=0&&(e.dying??0)>0){e.dying=Math.max(0,e.dying!-dt);const t=1-e.dying/.3;e.mesh.visible=true;e.mesh.scale.setScalar((e.boss?1.85:1)*(1+t*.3)*Math.max(.001,1-t));if(!e.dying)e.mesh.visible=false;return;}
    this.updateBossTelegraphs(e);
    const lightRadius=M.activeStats(this.state).light?7.5:3.6;
    e.mesh.visible=e.hp>0&&(this.planet!=='shadow'||this.environment.revealed(e,this.position,lightRadius))&&(!e.definition?.stealth||this.planet==='shadow'||Math.hypot(e.x-this.position.x,e.z-this.position.z)<e.definition.stealth||e.stun>0);
    if(!e.mesh.visible)return;
    e.liftVelocity=Math.max(-15,(e.liftVelocity??0)-24*dt);e.lift=Math.max(0,(e.lift??0)+(e.liftVelocity??0)*dt);if(!e.lift)e.liftVelocity=0;
    const ground=this.planet==='ocean'&&inWater(this.environment.layout,e)?-.5:Math.max(-.7,terrainHeight(this.environment.layout,e));
    e.mesh.position.set(e.x,ground+(e.lift??0)+(e.definition?.flying?1+Math.sin(this.time*4+e.homeX)*.15:Math.sin(this.time*3+e.homeX)*.06),e.z);
    const scale=(e.boss?1.85:1)*((e.statuses?.sheep??0)>0?.45:1);e.mesh.scale.setScalar(scale);
    if(e.type==='minislime')e.mesh.scale.multiplyScalar(.55);
    // Hit reaction: a white flash and a quick swell, like a squeezed toy.
    if((e.flash??0)>0){e.flash=Math.max(0,e.flash!-dt);e.mesh.scale.multiplyScalar(1+e.flash!*1.2);}
    const lit=(e.flash??0)>0;if(lit!==!!e.flashLit){e.flashLit=lit;for(const m of (e.mesh.userData.flashMaterials??[]) as T.MeshStandardMaterial[]){if(lit){m.userData.baseEmissive??=m.emissive.getHex();m.emissive.set('#ffffff');m.emissiveIntensity=.75;}else{m.emissive.setHex(m.userData.baseEmissive??0);m.emissiveIntensity=1;}}}
    this.animateEnemy(e,dt);
    const shell=e.mesh.getObjectByName('shell');if(shell)shell.rotation.x=e.phase==='recover'?-.95:0;
    let telegraph=e.mesh.getObjectByName('attack-telegraph') as T.Mesh|undefined;
    if(e.phase==='windup'&&!telegraph){telegraph=mesh(new T.RingGeometry(.92,1,32),'#f15c58');telegraph.name='attack-telegraph';telegraph.rotation.x=-Math.PI/2;telegraph.position.y=.06;e.mesh.add(telegraph);}
    if(telegraph){telegraph.visible=e.phase==='windup'&&!e.skill;const r=(e.type==='magmaturtle'?2.6:e.type==='lavaworm'?2:e.mesh.userData.slam?4.8:e.definition?.reach??1.8)/scale;telegraph.scale.setScalar(Math.min(r,5.5));}
  }
  update(dt:number,active:boolean,draw=true,simulateWorld=active||this.networkRole==='host') {
    this.environment??=new EnvironmentSimulation(createEnvironmentLayout(this.planet));this.enemyShots??=[];this.dynamicObstacles??=[];this.resourceTimers??=new Map();
    const environmentForFrame=this.environment;
    if(active||simulateWorld)this.time+=dt;
    let dx=0,dz=0,routeTarget:T.Vector3|undefined;
    if(active&&!this.movementLocked&&!this.environment.airborne){
      dx=Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft'));dz=Number(this.keys.has('ArrowDown'))-Number(this.keys.has('ArrowUp'));
      if(dx||dz){this.destination=null;this.route=[];this.selected=null;this.marker.visible=false;this.ring.visible=false;}
      else if(this.route.length){routeTarget=this.route[0];dx=routeTarget.x-this.position.x;dz=routeTarget.z-this.position.z;if(Math.hypot(dx,dz)<.001){this.route.shift();dx=dz=0;}}
    }
    const inputLength=Math.hypot(dx,dz),stats=M.activeStats(this.state),input={x:inputLength?dx/inputLength:0,z:inputLength?dz/inputLength:0};
    this.moving=active&&inputLength>.0001;
    if(active||simulateWorld){
      const environmentAtStart=this.environment;
      this.environment.authoritative=this.networkRole!=='peer';const dragon=this.enemies.find(e=>e.type==='dragon'&&e.hp>0);this.environment.dragonPhase=dragon?bossPhase(dragon.hp,dragon.maxHp):0;this.environment.nearbyPlayers=1+[...this.remotePlayers?.values()??[]].filter(r=>r.mesh.visible&&Math.hypot(r.pose.x-this.position.x,r.pose.z-this.position.z)<40).length;this.environment.weatherBlocked=(x,z,r)=>this.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+r);
      const step=this.environment.step(dt,this.position,input,{speed:stats.speed,maxHp:stats.maxHp,fireResistance:stats.lavaproof?1:stats.fireResistance,poisonImmune:stats.poisonImmune,flippers:stats.flippers,featherFall:stats.featherFall,flying:this.playerFlying||stats.flying},this.networkRole==='peer'?[]:this.enemies.map(e=>({id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,boss:e.boss,flying:e.definition?.flying||['firebat','thunderbird','jellyzap','wisp'].includes(e.type??''),lavaImmune:e.type==='lavaworm'})));
      this.dynamicObstacles=this.environment.dynamicObstacles();const signature=this.dynamicObstacles.map(o=>o.x+','+o.z).join(';');
      if(signature!==this.environmentSignature){this.environmentSignature=signature;this.resolveOverlap(this.position,this.collisionObstacles(),.36);if(this.destination)this.route=this.findPath(this.destination);}
      if(step.relocate){this.position.set(step.relocate.x,step.relocate.y??0,step.relocate.z);this.destination=null;this.route=[];this.selected=null;}
      else{
        let mx=step.motion.x,mz=step.motion.z;
        if(routeTarget&&Math.hypot(mx,mz)>inputLength){mx=dx;mz=dz;this.environment.velocity={x:0,z:0};}
        if(active&&!this.movementLocked)this.move(mx,mz);
        if(step.push.x||step.push.z)this.move(step.push.x,step.push.z,true);
        this.position.y=step.y+(this.playerFlying?1.7:0);
      }
      if(inputLength>.0001)this.facing=Math.atan2(dx,dz);
      if(routeTarget&&Math.hypot(routeTarget.x-this.position.x,routeTarget.z-this.position.z)<.001){this.route.shift();this.environment.velocity={x:0,z:0};}
      if(this.destination&&!this.route.length){this.destination=null;this.marker.visible=false;}
      this.state.hp=Math.min(stats.maxHp,this.state.hp+step.heal);
      if(step.damage>0)this.onDamage(step.damage,'hazard');
      if(this.environment!==environmentAtStart)return;
      for(const event of step.events)this.onEnvironmentEvent?.(event);
      if(step.dragonDismiss&&this.networkRole!=='peer'){const dragon=this.enemies.find(e=>e.type==='dragon'&&e.hp>0);if(dragon){dragon.hp=0;dragon.respawn=999999;dragon.mesh.visible=false;dragon.skillEffects=[];dragon.telegraphs=[];dragon.phase='idle';this.burst(dragon.x,dragon.z,'#ffc971',32);this.onEnvironmentEvent?.({kind:'dragon',message:'The dragon event has ended. The volcano dragon flies away.'});}}
      if(step.dragonSummon&&this.networkRole!=='peer'){const dragon=this.enemies.find(e=>e.type==='dragon');if(dragon&&dragon.hp<=0){dragon.x=dragon.homeX;dragon.z=dragon.homeZ;dragon.maxHp=dragon.baseMaxHp??dragon.maxHp;dragon.damage=dragon.baseDamage??dragon.damage;dragon.hp=dragon.maxHp;dragon.respawn=0;dragon.stun=0;dragon.statuses={};dragon.cooldown=0;dragon.attackCount=0;dragon.skillCount=0;dragon.skill=undefined;dragon.phase='idle';dragon.bossStage=1;dragon.mesh.visible=true;dragon.scaled=false;this.onEnvironmentEvent?.({kind:'dragon',message:'The volcano dragon has arrived! Look for the crown on your map.'});}}
      if(this.networkRole!=='peer')for(const hit of step.enemyHits){const enemy=this.enemies.find(e=>e.id===hit.id);if(enemy&&enemy.hp>0)(this.onHazardEnemy??((e,d)=>this.damageEnemy(e,d)))(enemy,hit.amount);}
      if(this.networkRole!=='peer')for(const push of step.enemyPushes){const enemy=this.enemies.find(e=>e.id===push.id);if(enemy&&enemy.hp>0)this.moveCreature(enemy,push.x,push.z,true);}
      this.environmentView?.update(this.environment);this.refreshEnvironmentNodes();this.syncWeatherNodes();
      for(const e of this.entities)if(e.kind==='turtle'){e.x=e.mesh.position.x;e.z=e.mesh.position.z;}
    }
    if(active&&!this.movementLocked&&!this.environment.airborne){
      if(this.selected&&!this.validTarget(this.selected)){this.selected=null;this.destination=null;this.route=[];this.ring.visible=false;this.marker.visible=false;}
      if(this.selected){const e=this.selected;this.ring.position.set(e.x,.1,e.z);if(Math.hypot(e.x-this.position.x,e.z-this.position.z)<=this.interactionRange(e)){this.destination=null;this.route=[];this.marker.visible=false;if(e.kind==='enemy')this.onAttackEnemy(e as Enemy);else{this.selected=null;this.ring.visible=false;this.onInteract(e);}}else if((e.kind==='enemy'||e.kind==='turtle')&&(!this.destination||Math.hypot(this.destination.x-e.x,this.destination.z-e.z)>4))this.select(e);}
    }
    if(simulateWorld&&this.networkRole!=='peer')for(const enemy of [...this.enemies]){if(!this.enemies.includes(enemy))break;this.updateEnemyAi(enemy,dt);}
    if(this.environment!==environmentForFrame)return;
    if(simulateWorld&&this.networkRole!=='peer')this.separateCreatures();
    for(const enemy of this.enemies)this.updateEnemyVisual(enemy,active||simulateWorld?dt:0);
    if(simulateWorld)for(let i=this.enemyShots.length-1;i>=0;i--){
      const shot=this.enemyShots[i],from={x:shot.mesh.position.x,z:shot.mesh.position.z};shot.mesh.position.x+=shot.vx*dt;shot.mesh.position.z+=shot.vz*dt;shot.life-=dt;
      if(this.networkRole!=='peer'){
      if(!clearSegment(from,shot.mesh.position,this.obstacles,{bounds:WORLD_BOUNDS,clearance:.1}))shot.life=0;
      if(shot.targetEnemyId){const enemy=this.enemies.find(e=>e.id===shot.targetEnemyId);if(enemy&&enemy.hp>0&&shot.life>0&&Math.hypot(shot.mesh.position.x-enemy.x,shot.mesh.position.z-enemy.z)<enemy.radius+.2){(this.onHazardEnemy??((e,d)=>this.damageEnemy(e,d)))(enemy,shot.damage);shot.life=0;}}
      else{
        if(shot.life>0&&Math.hypot(shot.mesh.position.x-this.position.x,shot.mesh.position.z-this.position.z)<.65){this.onDamage(shot.damage,'shot');shot.life=0;}
        for(const [id,remote] of this.remotePlayers??[])if(shot.life>0&&remote.mesh.visible&&Math.hypot(shot.mesh.position.x-remote.pose.x,shot.mesh.position.z-remote.pose.z)<.65){this.onRemoteDamage?.(id,shot.damage,'shot');shot.life=0;}
      }
      }
      if(shot.life<=0){this.scene.remove(shot.mesh);shot.mesh.geometry.dispose();this.enemyShots.splice(i,1);}
    }
    const names={home:'Clover Village',forest:'Mushroom Forest',meadow:'Blue Lake Meadow',swamp:'Chomper Swamp',canyon:'Redrock Canyon'},zone=this.planet==='home'?names[zoneAt(this.position)]:PLANETS[this.planet].name;
    if(zone!==this.lastZone){this.lastZone=zone;this.onZone(zone);}if(active&&this.planet==='home'&&zoneAt(this.position)==='home')this.state.hp=Math.min(maxHp(this.state),this.state.hp+dt*4);
    this.player.position.copy(this.position);this.player.rotation.y=this.facing;this.player.scale.setScalar(stats.sizeScale*HERO_SCALE);
    if(this.state.gear.pet){
      // The companion trails behind and to one side; flyers hover and flap, walkers hop.
      const back=new T.Vector3(this.position.x-Math.sin(this.facing)*1.1+Math.cos(this.facing)*.9,0,this.position.z-Math.cos(this.facing)*1.1-Math.sin(this.facing)*.9),c=this.companion,flying=!!c.userData.flying;
      const before=c.position.clone();c.position.lerp(back,1-Math.exp(-dt*4));
      c.position.y=this.position.y+(flying?1.1+Math.sin(this.time*3)*.18:Math.abs(Math.sin(this.time*5))*.12*(before.distanceTo(c.position)>dt*.5?1:.3));
      const dx=c.position.x-before.x,dz=c.position.z-before.z;if(dx*dx+dz*dz>1e-5)c.rotation.y=Math.atan2(dx,dz);c.rotation.z=flying?Math.sin(this.time*2.5)*.1:0;
      for(const wing of (c.userData.wings??[]) as {node:T.Object3D;base:number;side:number}[])wing.node.rotation.z=wing.base+wing.side*Math.sin(this.time*18)*.6;
    }
    this.animatePlayer(dt);
    this.player.visible=!this.boarded;this.companion.visible=!this.boarded;
    // The reference's follow: 9/s on the explorer, 5/s on the starship in cut-scenes, always looking straight at the target.
    this.cameraTarget.lerp(this.cameraFocus??this.position,followBlend(dt,!!this.cameraFocus));this.camera.position.copy(this.cameraTarget).add(this.viewOffset??=cameraOffset(16/9));this.camera.lookAt(this.cameraTarget);
    if(this.fx)this.camera.position.add(this.fx.shakeOffset(dt,this.shakeOffset));
    this.followSun();
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.velocity.y-=dt*7;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(Math.max(0,p.life/p.max));if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();this.particles.splice(i,1);}}
    this.animateCrops(dt);
    this.fx?.update(dt);
    this.marker.scale.setScalar(1+Math.sin(this.time*5)*.12);if(draw)this.render();
  }

  /** Pop-in, sway and the sparkle of ripe crops. */
  private animateCrops(dt:number){
    if(this.planet!=='home')return;
    this.plotMeshes.forEach((g,i)=>{
      let ripe:T.Object3D|null=null;
      for(const plant of g.children){const u=plant.userData;if(u.target===undefined)continue;
        if(u.pop<1){u.pop=Math.min(1,u.pop+dt*3);const k=u.pop,spring=1+Math.sin(k*Math.PI*2.5)*(1-k)*.4;plant.scale.setScalar(u.target*Math.min(1,k*2)*spring);}
        else plant.scale.setScalar(u.target*(u.stage===3?1+Math.sin(this.time*4+u.seed)*.04:1));
        plant.rotation.z=Math.sin(this.time*(u.stage===3?2.5:1.5)+u.seed)*(u.stage===3?.06:.04);
        if(u.stage===3)ripe=plant;}
      if(ripe&&this.fx&&Math.random()<dt*2.5){const plot=g.parent;if(plot)this.fx.burst({x:plot.position.x+ripe.position.x,z:plot.position.z+ripe.position.z},{n:1,color:'#fff7a8',glow:true,size:.08,speed:1,up:2,y:.9,gravity:0,life:.8});}
    });
  }
  private sunOffset=new T.Vector3(-15,35,18);private sunAxes:[T.Vector3,T.Vector3]|null=null;
  /**
   * The sun follows the ground under the camera target, where resize fitted the shadow box to the
   * view, snapped to whole shadow texels along the shadow camera's own axes (the box need not be
   * square). Without the snap, shadow edges crawl every frame you walk.
   */
  private followSun(){
    this.sunOffset??=new T.Vector3(-15,35,18);
    const [x,y]=this.sunAxes??=lightAxes(this.sunOffset),box=this.sun.shadow.camera,map=this.sun.shadow.mapSize;
    const tx=(box.right-box.left)/map.x,ty=(box.top-box.bottom)/map.y,p=this.sun.target.position.set(this.cameraTarget.x,0,this.cameraTarget.z);
    const a=p.dot(x),b=p.dot(y);p.addScaledVector(x,Math.round(a/tx)*tx-a).addScaledVector(y,Math.round(b/ty)*ty-b);
    this.sun.position.copy(p).add(this.sunOffset);
  }
  /**
   * The explorer's poses, after the reference: a leaning, bouncing walk; breathing
   * and a look-around at rest; a raised sword, a lowered blaster or a two-handed aim;
   * an overhead chop or alternating punches with a body twist; arms out for the
   * whirlwind; a forward lean for the dash; a leap with arms overhead for the slam;
   * casting and reeling; and a swell with a red flash when hurt.
   */
  private animatePlayer(dt:number){
    for(const key of ['punchT','swingT','aimT','hurtT','spinT','landT','castT'] as const)this[key]=Math.max(0,(this[key]||0)-dt);
    this.walkClock=(this.walkClock||0)+dt*(this.moving?11:3);
    const o=this.walkClock,c=Math.sin(o),p=this.player;
    const armL=p.getObjectByName('arm-left'),armR=p.getObjectByName('arm-right'),legL=p.getObjectByName('leg-left'),legR=p.getObjectByName('leg-right'),head=p.getObjectByName('head');
    const kind=this.weaponKind??'fist',pose=this.pose;
    let twist=0,lean=0,lift=0,sx=1,sy=1,sz=1;
    // Base: walk cycle or idle breathing.
    if(this.moving){armL?.rotation.set(-c*.8,0,-.3);armR?.rotation.set(c*.8,0,.3);legL?.rotation.set(c*.7,0,0);legR?.rotation.set(-c*.7,0,0);lift=Math.abs(Math.cos(o))*.06;lean=.1;if(head)head.rotation.set(0,0,Math.sin(o)*.05);}
    else{armL?.rotation.set(0,0,-.3-Math.sin(o)*.05);armR?.rotation.set(0,0,.3+Math.sin(o)*.05);legL?.rotation.set(0,0,0);legR?.rotation.set(0,0,0);sy=1+Math.sin(o*1.2)*.025;if(head)head.rotation.set(0,Math.sin(o*.4)*.15,0);}
    // Weapon stance.
    if(armR){
      if(kind==='sword'){armR.rotation.x=this.moving?-.3+c*.3:-.45;armR.rotation.z=.18;}
      else if(kind==='gun'){if(this.aimT>0){armR.rotation.set(-1.5,0,.05);armL?.rotation.set(-1.3,0,.45);twist=.12;}else{armR.rotation.x=this.moving?-.25+c*.2:-.35;armR.rotation.z=.2;}}
      else if(kind==='rod')armR.rotation.x=this.moving?-.2+c*.2:-.3;
    }
    const hand=p.getObjectByName('hand-right');if(hand)hand.rotation.x=kind==='gun'&&this.aimT>0?1.45:0;
    // Attacks: an overhead chop with the sword, recoil with a blaster, alternating punches otherwise.
    if(this.punchT>0&&armR){
      const t=1-this.punchT/.25,e=Math.sin(t*Math.PI);
      if(kind==='sword'){armR.rotation.set(-2.6+t*2.5,0,.1);twist=.5-t*.9;lean=.2*e;}
      else if(kind==='gun')armR.rotation.x=-1.5+e*.25;
      else{const arm=this.punchArm?armR:armL;arm?.rotation.set(-1.6*e,0,0);twist=(this.punchArm?-.4:.4)*e;lean=.15*e;}
    }
    // Skills.
    if(this.spinT>0){armL?.rotation.set(0,0,-1.45);armR?.rotation.set(kind==='sword'?-1.4:0,0,1.45);if(head)head.rotation.x=.15;}
    else if(pose?.kind==='dash'){lean=.55;armL?.rotation.set(1.2,0,-.3);armR?.rotation.set(kind==='sword'?-1.3:1.2,0,.3);legL?.rotation.set(.8,0,0);legR?.rotation.set(-.4,0,0);lift=.15;}
    else if(pose?.kind==='slam'){
      if(pose.t<.42){const e=pose.t/.42;lean=-e*.4;const up=-2.9*Math.min(1,e*2);armL?.rotation.set(up,0,-.2);armR?.rotation.set(up,0,.2);legL?.rotation.set(-.5,0,0);legR?.rotation.set(-.5,0,0);}
      else{const e=Math.min(1,(pose.t-.42)/.38);sx=sz=1+.25*(1-e);sy=1-.3*(1-e);armL?.rotation.set(-.9*(1-e),0,-.3);armR?.rotation.set(-.9*(1-e),0,.3);lean=.5*(1-e);}
    }
    // Fishing: the cast swings the rod overhead and forward; reeling leans back against the line.
    if(this.fishing&&this.fishing!=='idle'&&armR){
      armR.rotation.set(-.75,0,.1);armL?.rotation.set(-.8,0,.5);
      if(this.fishing==='cast'){const t=Math.min(1,1-this.castT/.5);armR.rotation.x=-2.4+t*1.7;if(armL)armL.rotation.x=-2.2+t*1.4;}
      if(this.fishing==='fight'){const n=this.fishTension||0;lean=-.25-n*.2;armR.rotation.x=-1+Math.sin(this.time*40)*n*.08;if(armL)armL.rotation.x=-.9+Math.sin(this.time*12)*.35;legL?.rotation.set(.3,0,0);}
    }
    if(this.hurtT>0){const k=1+this.hurtT*.4;sx*=k;sy*=k;sz*=k;}
    if(this.landT>0){const k=Math.sin(this.landT/.25*Math.PI);sx*=1+k*.18;sy*=1-k*.22;sz*=1+k*.18;}
    p.rotation.y=this.spinT>0?this.facing+(2.2-this.spinT)*22:this.facing+twist;
    p.rotation.x=lean;p.position.y+=lift;p.scale.x*=sx;p.scale.y*=sy;p.scale.z*=sz;
    if(this.spinT>0&&this.fx&&Math.random()<dt*40)this.fx.burst(this.position,{n:1,color:['#ffffff','#d4f1ff'],glow:true,size:.1,speed:6,up:1,life:.35,y:.6,gravity:0});
    if(pose?.kind==='dash'&&this.fx)this.fx.burst(this.position,{n:2,color:['#ffffff','#bfe9ff'],size:.13,speed:1,up:1,life:.4,y:.3});
    // Hurt flashes red; invulnerability after a hit blinks white.
    const flash=this.hurtT>0?'hurt':this.invulnerable&&Math.sin(this.time*30)>0?'blink':'';
    for(const m of this.playerMaterials??[])if(m.userData.flash!==flash){m.userData.flash=flash;m.userData.baseEmissive??=m.emissive.getHex();
      if(flash==='hurt'){m.emissive.setRGB(.8,.16,.16);m.emissiveIntensity=1;}else if(flash==='blink'){m.emissive.setRGB(.4,.4,.4);m.emissiveIntensity=1;}else{m.emissive.setHex(m.userData.baseEmissive);m.emissiveIntensity=1;}}
  }


  render(){this.renderer.render(this.scene,this.camera);}
}
