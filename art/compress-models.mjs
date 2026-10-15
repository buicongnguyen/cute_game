/**
 * Mesh compression for the game's models (FIX-PLAN 2.1): rewrites GLBs with EXT_meshopt_compression, which three's
 * GLTFLoader decodes with MeshoptDecoder (src/assets.ts createGltfLoader). Pages gzips the result on top.
 *
 * What the game and the tests read stays as Blender wrote it: node names, hierarchy and pivots, mesh and material
 * names, primitive order, accessor counts (so triangle counts). What changes:
 * - Positions keep 32-bit floats through the EXPONENTIAL filter with 14 bits of mantissa (a step of about 0.1 mm on a
 *   1 m prop, 2 mm on a 20 m room); bounds are recomputed from the stored values.
 * - Normals are stored as 8-bit octahedral vectors (KHR_mesh_quantization, as gltfpack does; under a degree off).
 *   createGltfLoader turns them back into 32-bit floats on load, so code that bakes, merges or measures geometry
 *   sees the kind of data it always did.
 * - Each primitive's triangles are reordered for the GPU's vertex cache and its vertices renumbered in order of first
 *   use (meshopt reorderMesh): the same triangles, in another order.
 * - The accessors of each kind share one buffer view (the codec packs long streams far better than many short ones).
 * Every file is decoded again and checked against its source (every triangle and corner) before it is written.
 *
 *   node art/compress-models.mjs                    compress every model in public/assets/models not yet compressed
 *   node art/compress-models.mjs a.glb b.glb        compress these files in place
 *   node art/compress-models.mjs --check            list uncompressed models; exit 1 if there are any
 *   node art/compress-models.mjs --decode in out    write a plain (uncompressed) copy: Blender's glTF importer cannot
 *                                                   read meshopt (art/blender/kit/style.py import_glb uses this)
 *
 * Run it after a Blender generator installs a model (`npm run art:compress`); tests/model-compression.test.ts fails
 * while any model is uncompressed. The encoder is meshoptimizer 0.22, the version of the decoder three r180 ships.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

export const EXT = 'EXT_meshopt_compression';
const QUANTIZATION = 'KHR_mesh_quantization';
export const MODELS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'models');
/** Mantissa bits kept per position component (one exponent per component across a stream). */
export const POSITION_BITS = 14;
/** How normals are stored: octahedral vectors (8 bits: int8, more: int16; KHR_mesh_quantization) or filtered floats. */
export const NORMALS = { filter: 'OCTAHEDRAL', bits: 8 };
/** How far a decoded normal component may be from the source one. */
const normalStep = ({ filter, bits }) => filter === 'OCTAHEDRAL' ? Math.max(8 / (2 ** (bits - 1) - 1), .01) : 2 ** -(bits - 2);
const ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const GLTF = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

export function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLTF) throw new Error('not a GLB file');
  let offset = 12, json = null, bin = Buffer.alloc(0);
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(body.toString('utf8')); else if (type === BIN_CHUNK) bin = Buffer.from(body);
    offset += 8 + length;
  }
  return { json, bin };
}

export function writeGlb(json, bin) {
  const pad = (data, fill) => Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4, fill)]);
  const text = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20), body = pad(bin, 0);
  const chunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32LE(data.length, 0); head.writeUInt32LE(type, 4); return Buffer.concat([head, data]); };
  const parts = [chunk(JSON_CHUNK, text), ...(body.length ? [chunk(BIN_CHUNK, body)] : [])];
  const header = Buffer.alloc(12); header.writeUInt32LE(GLTF, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + parts.reduce((n, p) => n + p.length, 0), 8);
  return Buffer.concat([header, ...parts]);
}

export const isCompressed = json => !!json.extensionsUsed?.includes(EXT);
const elementSize = accessor => WIDTH[accessor.type] * ARRAYS[accessor.componentType].BYTES_PER_ELEMENT;
const align = (n, to = 4) => Math.ceil(n / to) * to;

/** Copies an accessor's elements out of its buffer view: count x stride bytes (zero padded past the view's end). */
function accessorBytes(json, bin, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? elementSize(accessor), start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new Uint8Array(accessor.count * stride);
  out.set(bin.subarray(start, Math.min(start + out.length, (view.byteOffset ?? 0) + view.byteLength)));
  return { bytes: out, stride };
}

/** Which accessors are indices or vertex attributes, by how many primitives, and in which primitive modes. */
function uses(json) {
  const use = new Map(), at = i => { let u = use.get(i); if (!u) use.set(i, u = { index: 0, attribute: 0, semantics: new Set(), modes: new Set() }); return u; };
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.indices !== undefined) { const u = at(primitive.indices); u.index++; u.modes.add(primitive.mode ?? 4); }
    for (const [semantic, i] of Object.entries(primitive.attributes)) { const u = at(i); u.attribute++; u.semantics.add(semantic); }
    for (const target of primitive.targets ?? []) for (const i of Object.values(target)) at(i).attribute += 2; // morph targets: never reorder
  }
  return use;
}

/**
 * Reorders each primitive's triangles for the vertex cache and renumbers its vertices in order of first use
 * (meshopt reorderMesh), which also lets the codecs pack them tighter. Returns, per primitive ('mesh/primitive'),
 * the old-to-new vertex map, for the checks.
 */
function reorder(json, accessors, use) {
  const maps = new Map();
  for (const [m, mesh] of (json.meshes ?? []).entries()) for (const [p, primitive] of mesh.primitives.entries()) {
    const attributes = Object.values(primitive.attributes), mode = primitive.mode ?? 4;
    if (primitive.indices === undefined || mode !== 4 || primitive.targets || !accessors.has(primitive.indices) || attributes.some(i => !accessors.has(i))) continue;
    // Accessors shared with another primitive keep their order: one reordering cannot suit both.
    if (use.get(primitive.indices).index + use.get(primitive.indices).attribute !== 1 || attributes.some(i => use.get(i).attribute !== 1 || use.get(i).index)) continue;
    const count = json.accessors[attributes[0]].count;
    if (attributes.some(i => json.accessors[i].count !== count)) continue;
    const source = accessors.get(primitive.indices), Index = ARRAYS[json.accessors[primitive.indices].componentType];
    if (Index !== Uint16Array && Index !== Uint32Array) continue;
    const indices = Uint32Array.from(new Index(source.bytes.buffer, source.bytes.byteOffset, json.accessors[primitive.indices].count));
    const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
    // Vertices no triangle uses go last, in their old order, so every accessor keeps its count.
    let next = unique;
    for (let i = 0; i < count; i++) if (remap[i] === 0xffffffff) remap[i] = next++;
    source.bytes = new Uint8Array(new Index(indices).buffer);
    for (const i of attributes) {
      const a = accessors.get(i), moved = new Uint8Array(a.bytes.length);
      for (let v = 0; v < count; v++) moved.set(a.bytes.subarray(v * a.stride, (v + 1) * a.stride), remap[v] * a.stride);
      a.bytes = moved;
    }
    maps.set(`${m}/${p}`, remap);
  }
  return maps;
}

/**
 * The most a filtered position may move: meshopt keeps POSITION_BITS of mantissa against an exponent shared by the
 * stream, which in practice never goes below about 2^0, so the bound is taken against max(1, largest magnitude).
 * Allowed: four times the rounding.
 */
function positionStep(floats, bits = POSITION_BITS) {
  let big = 0; for (let i = 0; i < floats.length; i++) big = Math.max(big, Math.abs(floats[i]));
  return Math.max(big, 1) * 2 ** -(bits - 2);
}
/** Largest move seen per semantic, as a share of the allowed step (the CLI prints it). */
export const worst = {};

/**
 * How an accessor is compressed: its stream key (accessors with the same key share one view), codec mode, filter,
 * the stride it is stored with and (normals) the stride it had. Null: copied as it is.
 */
function streamOf(json, i, use, stride, widened, normals) {
  const a = json.accessors[i], u = use.get(i);
  if (u?.index && !u.attribute) {
    if (a.componentType !== 5123 && a.componentType !== 5125) return null;
    const mode = [...u.modes].every(m => m === 4) && a.count % 3 === 0 ? 'TRIANGLES' : 'INDICES';
    return { key: `${mode}|${a.componentType}`, mode, stride: ARRAYS[a.componentType].BYTES_PER_ELEMENT };
  }
  if (stride % 4 !== 0 || stride > 256) return null;
  const semantics = [...(u?.semantics ?? [])], plainVec3 = (a.componentType === 5126 || widened) && a.type === 'VEC3' && stride === 12 && semantics.length === 1;
  if (plainVec3 && semantics[0] === 'POSITION') return { key: 'POSITION', mode: 'ATTRIBUTES', stride, filter: 'EXPONENTIAL', semantic: 'POSITION' };
  if (plainVec3 && semantics[0] === 'NORMAL') return normals.filter === 'OCTAHEDRAL' ? { key: 'NORMAL', mode: 'ATTRIBUTES', stride: normals.bits > 8 ? 8 : 4, from: 12, filter: 'OCTAHEDRAL', semantic: 'NORMAL' } : { key: 'NORMAL', mode: 'ATTRIBUTES', stride, filter: 'EXPONENTIAL', semantic: 'NORMAL' };
  return { key: `ATTRIBUTES|${semantics.sort().join('+') || 'other'}|${a.componentType}|${a.type}|${!!a.normalized}|${stride}`, mode: 'ATTRIBUTES', stride };
}

/** Compresses one GLB (bytes in, bytes out). Throws if the decoded result does not match the source. */
export async function compressGlb(input, { normals = NORMALS, reorder: cacheOrder = true, positionBits = POSITION_BITS } = {}) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const { json, bin } = readGlb(input);
  if (isCompressed(json)) return input;
  if ((json.buffers ?? []).length > 1) throw new Error('only single-buffer GLBs are supported');
  const original = structuredClone(json), use = uses(json);
  const perView = new Map();
  json.accessors.forEach((a, i) => { if (a.bufferView !== undefined) perView.set(a.bufferView, [...(perView.get(a.bufferView) ?? []), i]); });
  // An accessor alone in its view (what Blender writes) can be compressed; anything else is copied as it is.
  const accessors = new Map();
  for (const list of perView.values()) {
    const a = json.accessors[list[0]];
    if (list.length === 1 && !a.sparse && !(a.byteOffset > 0)) accessors.set(list[0], accessorBytes(json, bin, list[0]));
  }
  const maps = cacheOrder ? reorder(json, accessors, use) : new Map();
  // Positions and normals stored as integers (creatures.glb was quantised by its generator) are widened to floats
  // first, so they get the same filters as the rest: their values (and the nodes' dequantising scale) stay.
  for (const [i, entry] of accessors) {
    const a = json.accessors[i], semantics = [...(use.get(i)?.semantics ?? [])];
    if (use.get(i)?.index || semantics.length !== 1 || a.type !== 'VEC3' || (a.componentType === 5126 && entry.stride === 12)) continue;
    if (semantics[0] === 'NORMAL' ? !a.normalized : semantics[0] !== 'POSITION' || a.normalized) continue;
    entry.bytes = new Uint8Array(Float32Array.from(elements(a, entry.bytes, entry.stride).out).buffer); entry.stride = 12; entry.widened = true;
  }
  const streams = new Map();
  for (const [i, { stride, widened }] of [...accessors]) {
    const s = streamOf(json, i, use, stride, widened, normals);
    if (!s) { accessors.delete(i); continue; }
    if (!streams.has(s.key)) streams.set(s.key, { ...s, members: [] });
    streams.get(s.key).members.push(i);
  }
  // Views still needed as they are: those of accessors left uncompressed, and any an image or sparse accessor uses.
  const keep = new Set();
  json.accessors.forEach((a, i) => { if (a.bufferView !== undefined && !accessors.has(i)) keep.add(a.bufferView); for (const part of [a.sparse?.indices, a.sparse?.values]) if (part) keep.add(part.bufferView); });
  for (const image of json.images ?? []) if (image.bufferView !== undefined) keep.add(image.bufferView);
  const chunks = []; let body = 0, fallback = 0;
  const place = data => { const at = body; chunks.push({ at, data }); body = align(at + data.length); return at; };
  const views = [], moved = new Map();
  for (const index of [...keep].sort((a, b) => a - b)) {
    const view = json.bufferViews[index];
    moved.set(index, views.length);
    views.push({ ...view, buffer: 0, byteOffset: place(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)) });
  }
  json.accessors.forEach((a, i) => { if (a.bufferView !== undefined && !accessors.has(i)) a.bufferView = moved.get(a.bufferView); for (const part of [a.sparse?.indices, a.sparse?.values]) if (part) part.bufferView = moved.get(part.bufferView); });
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = moved.get(image.bufferView);
  const allowed = new Map();
  for (const stream of streams.values()) {
    const { mode, stride, filter, members } = stream, from = stream.from ?? stride;
    const count = members.reduce((n, i) => n + json.accessors[i].count, 0), data = new Uint8Array(count * from);
    let at = 0; const starts = members.map(i => { const start = at; data.set(accessors.get(i).bytes, start); at += accessors.get(i).bytes.length; return start / from; });
    let source = data, step = 0;
    const floats = filter ? new Float32Array(data.buffer, 0, data.length / 4) : null;
    const position = stream.semantic === 'POSITION';
    if (filter === 'EXPONENTIAL') { step = position ? positionStep(floats, positionBits) : normalStep(normals); source = MeshoptEncoder.encodeFilterExp(floats, count, stride, position ? positionBits : normals.bits, 'SharedComponent'); }
    if (filter === 'OCTAHEDRAL') {
      const four = new Float32Array(count * 4); for (let v = 0; v < count; v++) four.set(floats.subarray(v * 3, v * 3 + 3), v * 4);
      step = normalStep(normals); source = MeshoptEncoder.encodeFilterOct(four, count, stride, normals.bits);
    }
    const encoded = MeshoptEncoder.encodeGltfBuffer(source, count, stride, mode), decoded = new Uint8Array(count * stride);
    MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, encoded, mode, filter);
    // The stream must decode to its source: exactly, triangles up to a rotation of their corners (the index codec may
    // rotate them; the winding is kept), or filtered values within their step.
    if (mode === 'TRIANGLES') {
      const Index = stride === 2 ? Uint16Array : Uint32Array, was = new Index(data.buffer), now = new Index(decoded.buffer);
      for (let t = 0; t < was.length; t += 3) if (![0, 1, 2].some(r => was[t] === now[t + r] && was[t + 1] === now[t + (r + 1) % 3] && was[t + 2] === now[t + (r + 2) % 3])) throw new Error(`triangle ${t / 3} of a stream changed`);
    } else if (!filter) {
      if (Buffer.compare(Buffer.from(decoded), Buffer.from(data)) !== 0) throw new Error(`stream ${stream.key} does not decode to its source`);
    } else {
      const now = filter !== 'OCTAHEDRAL' ? new Float32Array(decoded.buffer) : stride === 4 ? Float32Array.from(new Int8Array(decoded.buffer), x => Math.max(x / 127, -1)) : Float32Array.from(new Int16Array(decoded.buffer), x => Math.max(x / 32767, -1));
      const wide = filter === 'OCTAHEDRAL' ? 4 : 3;
      for (let v = 0; v < count; v++) for (let c = 0; c < 3; c++) { const d = Math.abs(floats[v * 3 + c] - now[v * wide + c]); worst[stream.semantic] = Math.max(worst[stream.semantic] ?? 0, d / step); if (!(d <= step)) throw new Error(`${stream.semantic} moved ${d} (allowed ${step})`); }
    }
    const index = views.length, fallbackAt = fallback; fallback = align(fallback + count * stride);
    views.push({ buffer: 1, byteOffset: fallbackAt, byteLength: count * stride, ...(mode === 'ATTRIBUTES' ? { byteStride: stride, target: 34962 } : { target: 34963 }),
      extensions: { [EXT]: { buffer: 0, byteOffset: place(encoded), byteLength: encoded.length, byteStride: stride, mode, count, ...(filter ? { filter } : {}) } } });
    members.forEach((i, k) => {
      const a = json.accessors[i]; a.bufferView = index;
      if (starts[k]) a.byteOffset = starts[k] * stride; else delete a.byteOffset;
      if (filter) allowed.set(i, step);
      if (filter === 'OCTAHEDRAL') { a.componentType = stride === 4 ? 5120 : 5122; a.normalized = true; delete a.min; delete a.max; }
      if (filter === 'EXPONENTIAL') { a.componentType = 5126; delete a.normalized; }
      if (position) {
        // Bounds follow the stored (rounded) values: three sizes bounding boxes from them.
        const now = new Float32Array(decoded.buffer, starts[k] * stride, a.count * 3), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let v = 0; v < a.count; v++) for (let c = 0; c < 3; c++) { const x = now[v * 3 + c]; if (x < min[c]) min[c] = x; if (x > max[c]) max[c] = x; }
        a.min = min; a.max = max;
      }
    });
  }
  json.bufferViews = views;
  const merged = Buffer.alloc(body);
  for (const { at, data } of chunks) merged.set(data, at);
  json.buffers = [{ byteLength: merged.length }, { byteLength: fallback, extensions: { [EXT]: { fallback: true } } }];
  const added = streams.get('NORMAL')?.filter === 'OCTAHEDRAL' ? [EXT, QUANTIZATION] : [EXT];
  for (const key of ['extensionsUsed', 'extensionsRequired']) json[key] = [...new Set([...(json[key] ?? []), ...added])];
  checkJson(original, json, use);
  const output = writeGlb(json, merged);
  // The file as written decodes to the same triangles with the same corners as the source.
  checkGeometry({ json: original, bin }, readGlb(await decodeGlb(output)), allowed, maps);
  return output;
}

/** Everything but buffers, buffer views, where accessors sit in them, bounds, normals' storage and the extension lists is untouched. */
function checkJson(before, after, use) {
  const strip = doc => {
    const copy = structuredClone(doc); delete copy.buffers; delete copy.bufferViews; delete copy.extensionsUsed; delete copy.extensionsRequired;
    copy.accessors?.forEach((a, i) => { delete a.min; delete a.max; delete a.bufferView; delete a.byteOffset; if (use.get(i)?.semantics.has('NORMAL') || use.get(i)?.semantics.has('POSITION')) { delete a.componentType; delete a.normalized; } });
    return JSON.stringify(copy);
  };
  if (strip(before) !== strip(after)) throw new Error('the glTF JSON changed beyond buffers and bounds');
}

/** An accessor's values as numbers, `width` per element; normalised integers come back as -1..1 like the loader reads them. */
function values(json, bin, index) {
  const { bytes, stride } = accessorBytes(json, bin, index);
  return elements(json.accessors[index], bytes, stride);
}
function elements(a, bytes, stride) {
  const Type = ARRAYS[a.componentType], width = WIDTH[a.type];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Float64Array(a.count * width), size = Type.BYTES_PER_ELEMENT;
  const get = { 1: Type === Int8Array ? 'getInt8' : 'getUint8', 2: Type === Int16Array ? 'getInt16' : 'getUint16', 4: Type === Float32Array ? 'getFloat32' : 'getUint32' }[size];
  const scale = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 1;
  for (let v = 0; v < a.count; v++) for (let c = 0; c < width; c++) { const x = view[get](v * stride + c * size, true) / scale; out[v * width + c] = a.normalized ? Math.max(x, -1) : x; }
  return { out, width, count: a.count };
}

/**
 * Each primitive draws the same triangles: as many, the same set of corners (mapped back through the reordering),
 * and each corner's attributes equal or within their filter's step.
 */
function checkGeometry(before, after, allowed, maps) {
  for (const [m, mesh] of (before.json.meshes ?? []).entries()) for (const [p, primitive] of mesh.primitives.entries()) {
    const other = after.json.meshes[m].primitives[p], where = `mesh ${m} primitive ${p}`;
    const corners = (doc, prim) => prim.indices === undefined ? null : values(doc.json, doc.bin, prim.indices).out;
    const ia = corners(before, primitive), ib = corners(after, other);
    if ((ia?.length ?? -1) !== (ib?.length ?? -1)) throw new Error(`${where}: index count changed`);
    const attributes = Object.entries(primitive.attributes).map(([semantic, i]) => ({ a: values(before.json, before.bin, i), b: values(after.json, after.bin, other.attributes[semantic]), step: allowed.get(i) ?? 0 }));
    const count = attributes[0].a.count, remap = maps.get(`${m}/${p}`) ?? Uint32Array.from({ length: count }, (_, v) => v);
    for (let v = 0; v < count; v++) for (const { a, b, step } of attributes) for (let c = 0; c < a.width; c++) {
      if (!(Math.abs(a.out[v * a.width + c] - b.out[remap[v] * a.width + c]) <= step)) throw new Error(`${where}: vertex ${v} changed`);
    }
    if (!ia) continue;
    // Triangles as old vertex numbers, each starting at its smallest corner (keeps the winding), sorted.
    const back = new Uint32Array(count); for (let v = 0; v < count; v++) back[remap[v]] = v;
    const canon = (list, map) => { const out = []; for (let t = 0; t < list.length; t += 3) { const c = [map(list[t]), map(list[t + 1]), map(list[t + 2])], r = c.indexOf(Math.min(...c)); out.push(`${c[r]},${c[(r + 1) % 3]},${c[(r + 2) % 3]}`); } return out.sort().join(' '); };
    if (canon(ia, x => x) !== canon(ib, x => back[x])) throw new Error(`${where}: the triangles changed`);
  }
}

/** A plain GLB with every compressed view decoded (for Blender, which has no meshopt decoder, and for checks). */
export async function decodeGlb(input) {
  await MeshoptDecoder.ready;
  const { json, bin } = readGlb(input);
  if (!isCompressed(json)) return input;
  const chunks = []; let body = 0;
  json.bufferViews = json.bufferViews.map(view => {
    const ext = view.extensions?.[EXT];
    let data;
    if (ext) { data = new Uint8Array(ext.count * ext.byteStride); MeshoptDecoder.decodeGltfBuffer(data, ext.count, ext.byteStride, bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter ?? 'NONE'); }
    else data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const out = { ...view, buffer: 0, byteOffset: body, byteLength: data.length };
    if (out.extensions) { out.extensions = { ...out.extensions }; delete out.extensions[EXT]; if (!Object.keys(out.extensions).length) delete out.extensions; }
    chunks.push({ at: body, data }); body = align(body + data.length);
    return out;
  });
  const merged = Buffer.alloc(body); for (const { at, data } of chunks) merged.set(data, at);
  json.buffers = [{ byteLength: merged.length }];
  for (const key of ['extensionsUsed', 'extensionsRequired']) { json[key] = (json[key] ?? []).filter(e => e !== EXT); if (!json[key].length) delete json[key]; }
  return writeGlb(json, merged);
}

const kb = n => `${(n / 1024).toFixed(1)} KB`;
async function main(args) {
  if (args[0] === '--decode') { writeFileSync(args[2], await decodeGlb(readFileSync(args[1]))); return; }
  const all = readdirSync(MODELS).filter(n => n.endsWith('.glb')).sort().map(n => path.join(MODELS, n));
  if (args[0] === '--check') {
    const plain = all.filter(file => !isCompressed(readGlb(readFileSync(file)).json));
    for (const file of plain) console.log(`not compressed: ${path.basename(file)} (run npm run art:compress)`);
    process.exit(plain.length ? 1 : 0);
  }
  const files = args.length ? args : all;
  let before = 0, after = 0, gzBefore = 0, gzAfter = 0;
  for (const file of files) {
    const input = readFileSync(file);
    if (isCompressed(readGlb(input).json)) continue;
    const output = await compressGlb(input), gz = [gzipSync(input).length, gzipSync(output).length];
    writeFileSync(file, output);
    before += input.length; after += output.length; gzBefore += gz[0]; gzAfter += gz[1];
    console.log(`${path.basename(file).padEnd(24)} ${kb(input.length).padStart(10)} -> ${kb(output.length).padStart(10)}   gzip ${kb(gz[0]).padStart(10)} -> ${kb(gz[1]).padStart(10)}`);
  }
  if (!before) { console.log('every model is already compressed'); return; }
  console.log(`${'total'.padEnd(24)} ${kb(before).padStart(10)} -> ${kb(after).padStart(10)}   gzip ${kb(gzBefore).padStart(10)} -> ${kb(gzAfter).padStart(10)}`);
  console.log(`largest move, as a share of the allowed step: ${Object.entries(worst).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
