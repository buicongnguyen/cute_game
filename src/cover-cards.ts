import * as T from 'three';
import type { KitPart } from './assets.ts';
import type { DecorPlacement } from './biomes.ts';
import { CAMERA } from './camera-rig.ts';
import { TOON_RAMP } from './toon.ts';

/**
 * Ground cover (grass tufts, flowers, toadstools, reeds, ferns, dry bushes, gumdrops, coral) drawn as 2D cards (G2D-7),
 * as the user asked for 2D wherever it looks right. When a world's scenery is built, each cover model (our own kits) is
 * rendered from the game camera's pitch into one small atlas, two turns per kind. Each scatter tile then draws all its
 * cover as one instanced batch of cards that face the camera's fixed direction, so a card looks like the model it came
 * from. The cards lean back perpendicular to the view, take the ground's lighting (an upward normal) and its shadows,
 * cast none, and sway in the wind in the vertex shader (smooth-dense-scenes recipe 11). Bushes, rocks and trees stay 3D.
 */
export const CARD = { cell: 128, turns: [0, 2.2], sway: .07, alphaTest: .5 } as const;

/** The game camera's view direction (towards the camera) and the card's "up" axis perpendicular to it. */
const toCamera = new T.Vector3(...CAMERA.offset).normalize(), cardUp = new T.Vector3(0, toCamera.z, -toCamera.y).normalize();
export interface CoverAtlas {
  /** Per kind: one [atlas u, atlas v, x0, y0, size] per turn; x0/y0/size place the card in metres around the piece. */
  cells: Map<string, Array<[number, number, number, number, number]>>;
  cellUv: number; material: T.Material; texture: T.Texture; target: T.WebGLRenderTarget; dispose(): void;
}

const time = { value: 0 };
/** Advances the wind on every card. */
export function tickCoverCards(seconds: number) { time.value = seconds; }

const corners = Array.from({ length: 8 }, () => new T.Vector3());
/** Card extent of a model seen from the camera direction: x across, y along cardUp, square and padded. */
function cardRect(object: T.Object3D): [number, number, number] {
  const box = new T.Box3().setFromObject(object); if (box.isEmpty()) return [-.5, 0, 1];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, i = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const c = corners[i++].set(x, y, z), u = c.dot(cardUp); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, u); y1 = Math.max(y1, u);
  }
  const size = Math.max(x1 - x0, y1 - y0) * 1.06;
  return [(x0 + x1) / 2 - size / 2, (y0 + y1) / 2 - size / 2, size];
}

/** Average surface colour of a model's parts, weighted by vertex count (vertex colours included). */
function averageColor(parts: KitPart[]) {
  const sum = new T.Color(0, 0, 0), c = new T.Color(); let n = 0;
  for (const part of parts) {
    const base = (part.material as T.MeshStandardMaterial).color ?? new T.Color(1, 1, 1), colors = part.geometry.getAttribute('color'), count = part.geometry.getAttribute('position').count;
    if (colors) for (let i = 0; i < colors.count; i++) { c.fromBufferAttribute(colors as T.BufferAttribute, i).multiply(base); sum.r += c.r; sum.g += c.g; sum.b += c.b; n++; }
    else { sum.r += base.r * count; sum.g += base.g * count; sum.b += base.b * count; n += count; }
  }
  return n ? sum.multiplyScalar(1 / n) : sum.set(1, 1, 1);
}

/** Renders every cover kind into one atlas with the given renderer, restoring its state afterwards. */
export function bakeCoverAtlas(renderer: T.WebGLRenderer, kinds: readonly string[], parts: (type: string) => KitPart[], glow = 0): CoverAtlas {
  const count = kinds.length * CARD.turns.length, columns = Math.ceil(Math.sqrt(count)), size = T.MathUtils.ceilPowerOfTwo(columns * CARD.cell);
  const target = new T.WebGLRenderTarget(size, size, { generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter });
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 40), cells: CoverAtlas['cells'] = new Map(), temporary: T.Material[] = [];
  camera.position.copy(toCamera).multiplyScalar(20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, color: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha(), shadows: renderer.shadowMap.autoUpdate };
  renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
  // Each cell is drawn through the target's own viewport and scissor (the renderer's would be scaled by the pixel ratio).
  target.scissorTest = true;
  let cell = 0;
  for (const kind of kinds) {
    const list: Array<[number, number, number, number, number]> = [];
    for (const turn of CARD.turns) {
      const model = new T.Group();
      for (const part of parts(kind)) {
        // Unlit albedo: the card takes the scene's light where it is drawn, as the ground does.
        const source = part.material as T.MeshStandardMaterial, flat = new T.MeshBasicMaterial({ color: source.color ?? 0xffffff, map: source.map ?? null, vertexColors: !!source.vertexColors, side: T.DoubleSide });
        temporary.push(flat);
        const mesh = new T.Mesh(part.geometry, flat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(part.matrix); model.add(mesh);
      }
      model.rotation.y = turn; model.updateMatrixWorld(true);
      const [x0, y0, s] = cardRect(model), col = cell % columns, row = Math.floor(cell / columns);
      Object.assign(camera, { left: x0, right: x0 + s, bottom: y0, top: y0 + s }); camera.updateProjectionMatrix();
      scene.add(model);
      target.viewport.set(col * CARD.cell, row * CARD.cell, CARD.cell, CARD.cell); target.scissor.copy(target.viewport);
      // The empty texels take the model's own colour (fully transparent), so the smaller mip levels a distant card
      // samples blend towards that colour instead of darkening to black around a small piece.
      renderer.setRenderTarget(target); renderer.setClearColor(averageColor(parts(kind)), 0); renderer.clear(); renderer.render(scene, camera); scene.remove(model);
      list.push([col * CARD.cell / size, row * CARD.cell / size, x0, y0, s]); cell++;
    }
    cells.set(kind, list);
  }
  renderer.autoClear = saved.autoClear; renderer.setClearColor(saved.color, saved.alpha); renderer.shadowMap.autoUpdate = saved.shadows;
  renderer.setRenderTarget(saved.target);
  temporary.forEach(m => m.dispose());
  const material = cardMaterial(target.texture, CARD.cell / size, glow);
  return { cells, cellUv: CARD.cell / size, material, texture: target.texture, target, dispose() { material.dispose(); target.dispose(); } };
}

function cardMaterial(map: T.Texture, cellUv: number, glow = 0) {
  // Toon-lit like the ground under it (RC-05), so a card matches the grass around it.
  const material = new T.MeshToonMaterial({ map, alphaTest: CARD.alphaTest, gradientMap: TOON_RAMP });
  // On the Night Planet the plants give off their own colour as light (the same texture, read once more).
  if (glow > 0) { material.emissive.setScalar(glow); material.emissiveMap = map; }
  material.userData.sharedKit = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.cardTime = time; shader.uniforms.cardUp = { value: cardUp }; shader.uniforms.cellUv = { value: cellUv };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCard;\nattribute vec3 aCell;\nuniform float cardTime;\nuniform vec3 cardUp;\nuniform float cellUv;')
      .replace('#include <begin_vertex>', [
        // aCard: x0, y0, size, flip; aCell: atlas u, atlas v, wind seed. position.xy is the quad's 0..1 corner.
        // A mirrored card reads the image right to left but keeps its corners in order, so it stays front-facing and
        // its upward normal is not flipped (a back face would be lit from below, i.e. dark).
        'float cardV = position.y, cardU = aCard.w > 0.0 ? position.x : 1.0 - position.x;',
        'vec3 transformed = vec3(aCard.w * (aCard.x + cardU * aCard.z), 0.0, 0.0) + cardUp * (aCard.y + cardV * aCard.z);',
        '#ifdef USE_INSTANCING',
        'vec3 cardRoot = instanceMatrix[3].xyz;',
        '#else',
        'vec3 cardRoot = vec3(0.0);',
        '#endif',
        // Only the upper part bends, more at the tip; neighbours sway a little out of step.
        `transformed.x += sin(cardTime * 1.9 + cardRoot.x * .35 + cardRoot.z * .27 + aCell.z) * ${CARD.sway.toFixed(3)} * cardV * cardV * aCard.z;`,
      ].join('\n'))
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aCell.xy + vec2(aCard.w > 0.0 ? uv.x : 1.0 - uv.x, uv.y) * cellUv;\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = vMapUv;\n#endif\n#endif');
  };
  material.customProgramCacheKey = () => 'cover-card';
  return material;
}

let quad: T.BufferGeometry | null = null;
/** One batch of cards for a tile's cover pieces. */
export function coverCards(atlas: CoverAtlas, pieces: readonly DecorPlacement[]) {
  // A 0..1 quad; its upward normal makes the card take light like the ground under it.
  quad ??= (() => { const g = new T.PlaneGeometry(1, 1).translate(.5, .5, 0); const n = g.getAttribute('normal'); for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return g; })();
  const geometry = new T.BufferGeometry(); geometry.index = quad.index;
  for (const name of ['position', 'normal', 'uv']) geometry.setAttribute(name, quad.getAttribute(name));
  const card = new Float32Array(pieces.length * 4), cell = new Float32Array(pieces.length * 3), mesh = new T.InstancedMesh(geometry, atlas.material, pieces.length);
  const matrix = new T.Matrix4(); let reach = .5;
  pieces.forEach((p, i) => {
    const turns = atlas.cells.get(p.type)!, turn = turns[Math.floor(p.rotation * 7.3) % turns.length], flip = p.rotation % 1 < .5 ? 1 : -1;
    card.set([turn[2], turn[3], turn[4], flip], i * 4); cell.set([turn[0], turn[1], p.rotation * 3.1], i * 3);
    reach = Math.max(reach, Math.hypot(Math.abs(turn[2]) + turn[4], Math.abs(turn[3]) + turn[4]));
    mesh.setMatrixAt(i, matrix.makeScale(p.scale, p.scale, p.scale).setPosition(p.x, p.y, p.z));
  });
  geometry.setAttribute('aCard', new T.InstancedBufferAttribute(card, 4)); geometry.setAttribute('aCell', new T.InstancedBufferAttribute(cell, 3));
  geometry.boundingSphere = new T.Sphere(new T.Vector3(), reach); geometry.boundingBox = new T.Box3(new T.Vector3(-reach, -reach, -reach), new T.Vector3(reach, reach, reach));
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.coverCards = true; mesh.userData.ownGeometry = true; mesh.name = 'cover-cards';
  return mesh;
}
