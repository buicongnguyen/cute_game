import * as T from 'three';
import { CAMERA } from './camera-rig.ts';
import { cropKit } from './assets.ts';

/**
 * Garden crops as 2D cards (G2D-1/G2D-2). The crops are our own Blender models (crops.glb); once the kit has loaded
 * they are baked with the game renderer and the scene's lights into one atlas, seen along the game camera's direction
 * (51.5° pitch, orthographic), with the reference's ink outline (#3a2433) on every crop past the sprout (RG-01, F13).
 * All cards then draw as ONE InstancedMesh: each card turns about its base toward the camera in the vertex shader
 * (yaw and pitch, never roll, so crops stay upright on screen and keep their baked size at every screen edge), sways
 * about that base, and grows or pops via a per-instance size. A second InstancedMesh draws the soft blob shadows.
 * Crops never cast into the shadow map. If the bake fails, the world keeps its 3D crops.
 */

/** Stages after the reference (RG-01): empty, sprout below 50 %, young until ripe, ripe at 100 %. */
export type CropStage = 0 | 1 | 2 | 3;
export function cropStage(crop: string | null | undefined, progress: number): CropStage { return !crop ? 0 : progress >= 1 ? 3 : progress >= .5 ? 2 : 1; }
/** Reference stage scales (sprout ×1.4, young ×0.55, ripe ×1.25), here relative to each model's bed scale. */
export const STAGE_SCALE: readonly [number, number, number, number] = [0, 1.4, .55, 1.25];
/** The camera's pitch, the direction the atlas is baked from. */
export const VIEW_PITCH = Math.atan2(CAMERA.offset[1], CAMERA.offset[2]);
/** CSS pixels per metre across the view plane at the camera target on a portrait phone (844 px tall, default zoom). */
export function phonePxPerMetre(height = 844) { return height / (2 * Math.hypot(...CAMERA.offset) * CAMERA.portraitScale * Math.tan(CAMERA.fov * Math.PI / 360)); }
/** Ripe crops read about 40 px tall on a phone, like the reference's (RG-04). */
export const RIPE_PX = 40;
/** On-screen height (view-plane metres) of a model at bed scale 1: ripe = 1.25 × this = 40 px on a phone. */
export const BED_HEIGHT = RIPE_PX / phonePxPerMetre() / STAGE_SCALE[3];
/** The sprout model is normalised smaller than the crops, so sprout ×1.4 stays below young ×0.55 ≈ 14 px vs 17 px. */
export const SPROUT_SHARE = .32;
/** Top of the soil in a bed, where crops stand. */
export const SOIL_Y = .22;
/** Reference harvest (RG-06): the crop flies up sin(πe)·1.6 m over 0.45 s while it shrinks from 1.4 to 0.28 and spins. */
export const HARVEST_TIME = .45;
export function harvestFlight(e: number) { const k = Math.min(1, Math.max(0, e)); return { lift: Math.sin(k * Math.PI) * 1.6, scale: 1.4 * (1 - .8 * k), spin: Math.cos(k * Math.PI * 4) }; }
/** The 3D crops' pop: a springy bounce up to full size over a third of a second. */
export function popScale(pop: number) { return Math.min(1, pop * 2) * (1 + Math.sin(pop * Math.PI * 2.5) * (1 - pop) * .4); }

/** A model's silhouette on the view plane, in metres, around its pivot: the front ground point (0, 0, front). */
export interface ViewBounds { front: number; left: number; right: number; bottom: number; top: number }
const vertex = new T.Vector3();
export function viewBounds(model: T.Object3D, pitch = VIEW_PITCH): ViewBounds | null {
  model.updateMatrixWorld(true);
  const c = Math.cos(pitch), s = Math.sin(pitch);
  let front = -Infinity, left = Infinity, right = -Infinity, low = Infinity, high = -Infinity;
  model.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const position = o.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      front = Math.max(front, vertex.z); left = Math.min(left, vertex.x); right = Math.max(right, vertex.x);
      // Height on the view plane: up is (0, cos p, -sin p).
      const u = vertex.y * c - vertex.z * s; low = Math.min(low, u); high = Math.max(high, u);
    }
  });
  if (!Number.isFinite(front)) return null;
  return { front, left, right, bottom: low + front * s, top: high + front * s };
}
/** Scale that gives a model the bed's standard on-screen height. */
export function bedScale(b: ViewBounds, sprout = false) { return (sprout ? SPROUT_SHARE : 1) * BED_HEIGHT / Math.max(.05, b.top - Math.min(0, b.bottom)); }

const metrics = new Map<string, ViewBounds | null>();
/** View bounds of crop_<id> (or crop_sprout), measured once from the kit. */
export function cropBounds(id: string): ViewBounds | null {
  if (!metrics.has(id)) { const model = cropKit.instance('crop_' + id); if (!model) return null; metrics.set(id, viewBounds(model)); }
  return metrics.get(id) ?? null;
}
/** Size of a crop at a stage relative to its model: the stage scale times the model's bed scale. */
export function stageScale(crop: string, stage: CropStage) {
  if (!stage) return 0;
  const b = cropBounds(stage === 1 ? 'sprout' : crop);
  return b ? STAGE_SCALE[stage] * bedScale(b, stage === 1) : STAGE_SCALE[stage];
}
/** Stable per-bed variety: about half the beds show their crop mirrored. */
export function bedFlip(index: number) { return ((index * 2654435761) >>> 0) % 7 < 3 ? -1 : 1; }

/** One bed as the card field sees it. */
export interface BedCrop { x: number; z: number; crop: string | null; progress: number }
interface Cell { u0: number; v0: number; du: number; dv: number; size: number; base: number; bounds: ViewBounds }
interface BedState { key: string; stage: CropStage; crop: string | null; pop: number }

const INK = '#3a2433', COLS = 8, MAX_FLIGHTS = 12;

/** Exactly three's Khronos PBR Neutral curve, applied in the bake because render targets skip tone mapping. */
const NEUTRAL = `vec3 neutral(vec3 color){const float start=.76;const float desat=.15;color*=exposure;float x=min(color.r,min(color.g,color.b));
  float offset=x<.08?x-6.25*x*x:.04;color-=offset;float peak=max(color.r,max(color.g,color.b));if(peak<start)return color;
  float d=1.-start;float newPeak=1.-d*d/(peak+d-start);color*=newPeak/peak;float g=1.-1./(desat*(peak-newPeak)+1.);return mix(color,vec3(newPeak),g);}`;

export class CropCards {
  /** Holds the card and blob meshes; the world adds it to its scene. */
  readonly group = new T.Group();
  ready = false;
  cellPx: number;
  /** Milliseconds the last bake took. */
  bakeMs = 0;
  private atlas: T.WebGLRenderTarget | null = null;
  private cells = new Map<string, Cell>();
  private cards: T.InstancedMesh; private blobs: T.InstancedMesh;
  private cardAttrs: { cell: T.InstancedBufferAttribute; card: T.InstancedBufferAttribute; sway: T.InstancedBufferAttribute };
  private uniforms = { uTime: { value: 0 } };
  private beds: BedState[] = [];
  private flights: Array<{ crop: string; x: number; z: number; t: number; scale: number; flip: number }> = [];
  private matrix = new T.Matrix4();
  private restore = () => { this.ready = false; this.bake(); };

  private renderer: T.WebGLRenderer; private lights: () => T.Light[];
  constructor(renderer: T.WebGLRenderer, lights: () => T.Light[], cellPx = 128, capacity = 33) {
    this.renderer = renderer; this.lights = lights; this.cellPx = cellPx; this.group.name = 'crop-cards';
    const max = capacity * 2 + MAX_FLIGHTS;
    const geometry = new T.PlaneGeometry(1, 1); geometry.translate(0, .5, 0);
    const attr = (size: number) => { const a = new T.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(T.DynamicDrawUsage); return a; };
    this.cardAttrs = { cell: attr(4), card: attr(4), sway: attr(2) };
    geometry.setAttribute('aCell', this.cardAttrs.cell); geometry.setAttribute('aCard', this.cardAttrs.card); geometry.setAttribute('aSway', this.cardAttrs.sway);
    // Colours are lit and tone-mapped in the bake; the cards only need fog on top.
    // Alpha to coverage only with multisampling: on a plain framebuffer some GPUs dither it into dotted edges.
    const material = new T.MeshBasicMaterial({ alphaTest: .5, alphaToCoverage: !!renderer.getContextAttributes?.()?.antialias, side: T.DoubleSide, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aCell;attribute vec4 aCard;attribute vec2 aSway;uniform float uTime;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv=uv*aCell.zw+aCell.xy;')
        .replace('#include <project_vertex>', `
          vec3 pivot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          vec3 toCamera=normalize(cameraPosition-pivot);
          vec3 right=normalize(cross(vec3(0.,1.,0.),toCamera));
          vec3 up=cross(toCamera,right);
          vec2 q=vec2(position.x*aCard.x,(position.y+aCard.z)*aCard.y);
          float a=sin(uTime*aSway.y+aCard.w)*aSway.x;
          q=vec2(q.x*cos(a)-q.y*sin(a),q.x*sin(a)+q.y*cos(a));
          vec4 mvPosition=viewMatrix*vec4(pivot+right*q.x+up*q.y,1.);
          gl_Position=projectionMatrix*mvPosition;`);
      // The atlas holds premultiplied colour (it was cleared to transparent black); undo that for clean edges.
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        'vec4 texel=texture2D(map,vMapUv);diffuseColor.rgb*=texel.rgb/max(texel.a,1e-4);diffuseColor.a*=texel.a;');
    };
    material.customProgramCacheKey = () => 'crop-cards-1';
    this.cards = new T.InstancedMesh(geometry, material, max);
    this.cards.name = 'crop-card-mesh'; this.cards.frustumCulled = false; this.cards.castShadow = this.cards.receiveShadow = false; this.cards.count = 0;
    const blobGeometry = new T.PlaneGeometry(1, 1); blobGeometry.rotateX(-Math.PI / 2);
    const blobMaterial = new T.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.blobs = new T.InstancedMesh(blobGeometry, blobMaterial, capacity + MAX_FLIGHTS);
    this.blobs.name = 'crop-blob-mesh'; this.blobs.frustumCulled = false; this.blobs.castShadow = this.blobs.receiveShadow = false; this.blobs.count = 0; this.blobs.renderOrder = -1;
    this.group.add(this.blobs, this.cards);
    renderer.domElement?.addEventListener?.('webglcontextrestored', this.restore);
  }

  /** Draws the crop_sprout + crop_<id> models (and a ripe sparkle) into the atlas. False leaves the 3D crops in charge. */
  bake(ids?: string[]): boolean {
    const started = performance.now(), renderer = this.renderer;
    if (ids) this.bakedIds = ids; else ids = this.bakedIds;
    try {
      if (renderer.getContext().isContextLost()) return this.ready = false;
      const entries: Array<{ id: string; model: T.Object3D; outline: boolean }> = [];
      const sprout = cropKit.instance('crop_sprout'); if (sprout) entries.push({ id: 'sprout', model: sprout, outline: false });
      for (const id of ids) { const model = cropKit.instance('crop_' + id); if (model) entries.push({ id, model, outline: true }); }
      const star = new T.Mesh(new T.OctahedronGeometry(.07), new T.MeshStandardMaterial({ color: '#fff0a8', emissive: '#fff0a8', emissiveIntensity: .35, flatShading: true }));
      star.position.y = .07; entries.push({ id: 'sparkle', model: star, outline: false });
      if (entries.length < 3) return this.ready = false;
      const px = this.cellPx, rows = Math.ceil(entries.length / COLS), width = COLS * px, height = rows * px;
      this.atlas?.dispose();
      const atlas = this.atlas = new T.WebGLRenderTarget(width, height, { depthBuffer: false, colorSpace: T.SRGBColorSpace, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter });
      const scratch = new T.WebGLRenderTarget(px, px, { samples: 4, colorSpace: T.SRGBColorSpace, generateMipmaps: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
      // The scene's lights, with the sun's direction kept and its shadow off (crops are too small to shade themselves).
      const scene = new T.Scene();
      for (const light of this.lights()) {
        if (light instanceof T.HemisphereLight) scene.add(new T.HemisphereLight(light.color, light.groundColor, light.intensity));
        else if (light instanceof T.DirectionalLight) { const sun = new T.DirectionalLight(light.color, light.intensity); sun.position.copy(light.position).sub(light.target.position).normalize().multiplyScalar(10); scene.add(sun, sun.target); }
        else if (light instanceof T.AmbientLight) scene.add(new T.AmbientLight(light.color, light.intensity));
      }
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 40), back = new T.Vector3(0, Math.sin(VIEW_PITCH), Math.cos(VIEW_PITCH));
      camera.position.copy(back).multiplyScalar(20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      // About 1.5 CSS px of ink on a phone: thinner lines break into dots without antialiasing.
      const outline = Math.max(2.5, px / 36), pad = (outline + 2) / px;
      const composite = new T.ShaderMaterial({
        uniforms: { src: { value: scratch.texture }, texel: { value: new T.Vector2(1 / px, 1 / px) }, radius: { value: outline }, ink: { value: new T.Color(INK) }, outline: { value: 1 }, exposure: { value: renderer.toneMappingExposure } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader: `uniform sampler2D src;uniform vec2 texel;uniform float radius;uniform vec3 ink;uniform float outline;uniform float exposure;varying vec2 vUv;${NEUTRAL}
          void main(){vec4 c=texture2D(src,vUv);float d=0.;
            if(outline>0.)for(int i=0;i<24;i++){float a=float(i)*.2617994;vec2 o=vec2(cos(a),sin(a))*radius*texel;d=max(d,max(texture2D(src,vUv+o).a,texture2D(src,vUv+o*.5).a));}
            d=smoothstep(.15,.55,d);vec3 rgb=c.a>0.?neutral(c.rgb/c.a)*c.a:vec3(0.);
            gl_FragColor=vec4(rgb+ink*(1.-c.a)*d,c.a+(1.-c.a)*d);}`,
        blending: T.NoBlending, depthTest: false, depthWrite: false,
      });
      const quad = new T.Mesh(new T.PlaneGeometry(2, 2), composite); quad.frustumCulled = false;
      const quadScene = new T.Scene(); quadScene.add(quad);
      const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate };
      renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.shadowMap.autoUpdate = false;
      const cells = new Map<string, Cell>();
      entries.forEach(({ id, model, outline: inked }, k) => {
        const bounds = viewBounds(model); if (!bounds) return;
        // A square cell around the silhouette, pivot centred horizontally, with room for the outline.
        const half = Math.max(-bounds.left, bounds.right), bottom = Math.min(0, bounds.bottom), size = Math.max(2 * half, bounds.top - bottom) / (1 - 2 * pad);
        const low = bottom - pad * size;
        Object.assign(camera, { left: -size / 2, right: size / 2, bottom: low, top: low + size }); camera.updateProjectionMatrix();
        model.position.z -= bounds.front; scene.add(model);
        renderer.setRenderTarget(scratch); renderer.render(scene, camera); scene.remove(model);
        const col = k % COLS, row = Math.floor(k / COLS);
        atlas.viewport.set(col * px, row * px, px, px); atlas.scissor.set(col * px, row * px, px, px); atlas.scissorTest = true;
        composite.uniforms.outline.value = inked ? 1 : 0;
        renderer.setRenderTarget(atlas); renderer.render(quadScene, camera);
        cells.set(id, { u0: col / COLS, v0: row / rows, du: 1 / COLS, dv: 1 / rows, size, base: low / size, bounds });
      });
      star.geometry.dispose(); (star.material as T.Material).dispose();
      renderer.setRenderTarget(previous.target); renderer.setClearColor(previous.color, previous.alpha); renderer.autoClear = previous.autoClear; renderer.shadowMap.autoUpdate = previous.shadows;
      scratch.dispose(); composite.dispose(); quad.geometry.dispose();
      // A bake that drew nothing (an unsupported format, a lost context) must not replace the 3D crops with blanks.
      const probe = cells.get(ids.find(id => cells.has(id)) ?? 'sprout');
      if (!probe || !this.drewSomething(atlas, probe)) return this.ready = false;
      this.cells = cells;
      (this.cards.material as T.MeshBasicMaterial).map = atlas.texture; (this.cards.material as T.MeshBasicMaterial).needsUpdate = true;
      this.bakeMs = performance.now() - started;
      return this.ready = true;
    } catch (error) {
      console.warn('Crop cards fell back to 3D crops:', error);
      return this.ready = false;
    }
  }
  private bakedIds: string[] = [];
  private drewSomething(atlas: T.WebGLRenderTarget, cell: Cell) {
    const x = Math.round((cell.u0 + cell.du / 2) * atlas.width), y = Math.round(cell.v0 * atlas.height), h = Math.round(cell.dv * atlas.height), column = new Uint8Array(4 * h);
    this.renderer.readRenderTargetPixels(atlas, x, y, 1, h, column);
    for (let i = 3; i < column.length; i += 4) if (column[i] > 0) return true;
    return false;
  }
  /** 128 px cells on low and medium, 256 px on high; a change re-bakes. */
  setCellPx(px: number) { if (px === this.cellPx) return; this.cellPx = px; if (this.bakedIds.length) this.bake(); }
  has(id: string) { return this.cells.has(id); }

  /** Lay out this frame's cards: one crop per bed, a sparkle over ripe beds, harvests flying up. */
  update(beds: readonly BedCrop[], time: number, dt: number) {
    this.uniforms.uTime.value = time;
    const { cell: cellAttr, card, sway } = this.cardAttrs;
    let n = 0, b = 0;
    const put = (c: Cell, x: number, y: number, z: number, scale: number, flip: number, seed: number, amp: number, freq: number) => {
      if (n >= this.cards.instanceMatrix.count) return;
      this.cards.setMatrixAt(n, this.matrix.makeTranslation(x, y, z));
      cellAttr.setXYZW(n, c.u0, c.v0, c.du, c.dv); card.setXYZW(n, c.size * scale * flip, c.size * scale, c.base, seed); sway.setXY(n, amp, freq); n++;
    };
    const blob = (x: number, z: number, w: number) => { if (b >= this.blobs.instanceMatrix.count) return; this.blobs.setMatrixAt(b++, this.matrix.makeScale(w, 1, w * .7).setPosition(x, SOIL_Y + .012, z)); };
    beds.forEach((bed, i) => {
      const stage = cropStage(bed.crop, bed.progress), key = `${bed.crop}:${stage}`, state = this.beds[i] ??= { key, stage, crop: bed.crop, pop: 1 };
      if (state.key !== key) {
        // A ripe crop that left its bed was harvested: send it flying.
        if (state.stage === 3 && !bed.crop && state.crop && this.flights.length < MAX_FLIGHTS) this.flights.push({ crop: state.crop, x: bed.x, z: bed.z, t: 0, scale: stageScale(state.crop, 3) / STAGE_SCALE[3], flip: bedFlip(i) });
        Object.assign(state, { key, stage, crop: bed.crop, pop: 0 });
      }
      if (!stage || !bed.crop) return;
      const c = this.cells.get(stage === 1 ? 'sprout' : bed.crop); if (!c) return;
      state.pop = Math.min(1, state.pop + dt * 3);
      const bob = stage === 3 && state.pop >= 1 ? 1 + Math.sin(time * 4 + i * 3.1) * .04 : 1, scale = stageScale(bed.crop, stage) * popScale(state.pop) * bob, seed = i * 3.1;
      put(c, bed.x, SOIL_Y, bed.z + c.bounds.front * scale, scale, bedFlip(i), seed, stage === 3 ? .06 : .04, stage === 3 ? 2.5 : 1.5);
      blob(bed.x, bed.z, Math.max(.35, (c.bounds.right - c.bounds.left) * scale * 1.05));
      const star = this.cells.get('sparkle');
      if (stage === 3 && star) put(star, bed.x + .18 * bedFlip(i), SOIL_Y + c.bounds.top * scale * 1.15 + .12 + Math.sin(time * 3 + seed) * .06, bed.z + c.bounds.front * scale, (1 + Math.sin(time * 5 + seed) * .25) * popScale(state.pop), Math.cos(time * 2 + seed) || 1, seed, 0, 0);
    });
    this.beds.length = beds.length;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]; f.t += dt; const c = this.cells.get(f.crop), e = f.t / HARVEST_TIME;
      if (!c || e >= 1) { this.flights.splice(i, 1); continue; }
      const flight = harvestFlight(e), scale = f.scale * flight.scale;
      put(c, f.x, SOIL_Y + flight.lift, f.z + c.bounds.front * scale, scale, f.flip * (Math.abs(flight.spin) < .15 ? .15 * Math.sign(flight.spin || 1) : flight.spin), 0, 0, 0);
    }
    this.cards.count = n; this.blobs.count = b;
    this.cards.instanceMatrix.needsUpdate = this.blobs.instanceMatrix.needsUpdate = true;
    cellAttr.needsUpdate = card.needsUpdate = sway.needsUpdate = true;
    this.cards.visible = n > 0; this.blobs.visible = b > 0;
    return n;
  }
  /** Forget per-bed pop and harvest state, for a rebuilt garden. */
  reset() { this.beds = []; this.flights = []; this.cards.count = this.blobs.count = 0; }
  dispose() {
    this.renderer.domElement?.removeEventListener?.('webglcontextrestored', this.restore);
    this.atlas?.dispose(); this.cards.geometry.dispose(); (this.cards.material as T.Material).dispose();
    this.blobs.geometry.dispose(); const blob = this.blobs.material as T.MeshBasicMaterial; blob.map?.dispose(); blob.dispose();
    this.cards.dispose(); this.blobs.dispose(); this.group.removeFromParent();
  }
}

/** A soft round contact shadow, made without the DOM. */
function blobTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x + .5 - size / 2, y + .5 - size / 2) / (size / 2), a = r >= 1 ? 0 : r < .6 ? .42 - r / .6 * .26 : .16 * (1 - (r - .6) / .4);
    data.set([0, 0, 0, Math.round(a * 255)], (y * size + x) * 4);
  }
  const texture = new T.DataTexture(data, size, size); texture.magFilter = texture.minFilter = T.LinearFilter; texture.needsUpdate = true;
  return texture;
}
