/**
 * Looks for the area / self / burst / status skills (lightweight-game-objects: shared geometry, instanced, no lights,
 * nothing allocated per frame). A look is a pure function that "paints" instances of a few shared shapes for one moment
 * of a cast; DisguiseFx (disguise-fx.ts) owns the batches, ageing and pooling. Colours are vivid and warm.
 */
export type Shape = 'orb' | 'mist' | 'box' | 'cone' | 'ring' | 'heart' | 'star' | 'petal' | 'rock' | 'gorb' | 'gbox' | 'gring' | 'dome';
export const SHAPES: readonly Shape[] = ['orb', 'mist', 'box', 'cone', 'ring', 'heart', 'star', 'petal', 'rock', 'gorb', 'gbox', 'gring', 'dome'];
/** Most instances one cast may paint at full density (tests hold every look to it). */
export const MAX_PER_CAST = 160;
export interface Painter { put(kind: Shape, color: string, x: number, y: number, z: number, sx: number, sy?: number, sz?: number, rx?: number, ry?: number, rz?: number): void }
export interface LookContext {
  /** Cast centre, ground height + .12. */
  x: number; y: number; z: number; r: number;
  /** Progress 0-1, age in seconds, facing, cast colour, density 0-1 (graphics setting). */
  t: number; a: number; f: number; color: string; n: number;
  /** Beam-like casts: end point. */
  life: number;
}
export type Builder = (p: Painter, c: LookContext) => void;
const S = Math.sin, C = Math.cos, PI = Math.PI, TAU = PI * 2;
const cnt = (c: LookContext, n: number) => Math.max(1, Math.ceil(n * c.n));
const fadeOut = (c: LookContext, k = 5) => Math.min(1, (1 - c.t) * k);
const grow = (c: LookContext, k = 6) => Math.min(1, c.t * k);
const hash = (i: number) => { const s = S(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const smoke: Builder = (p, c) => {
  const f = fadeOut(c) * grow(c, 8), cols = ['#c9c4d8', '#a7a0bc', '#e0dcea', '#8f88a8'];
  p.put('gring', '#6d6788', c.x, c.y, c.z, c.r * grow(c), 1, c.r * grow(c));
  for (let i = 0; i < cnt(c, 20); i++) {
    const q = i * 2.4 + c.a * (.18 + (i % 3) * .05), rr = c.r * (.1 + (i % 5) * .17) * Math.min(1, .4 + c.t * 3), s = (.42 + .18 * S(c.a * 1.6 + i) + (i % 3) * .1) * f;
    p.put('mist', cols[i % 4], c.x + S(q) * rr, c.y + .45 + (i % 4) * .3 + .2 * S(c.a * 1.2 + i * 2), c.z + C(q) * rr, s * 1.3, s * .9, s * 1.3, 0, q);
  }
};
const heal: Builder = (p, c) => {
  const b = grow(c, 4) * fadeOut(c, 4), petals = ['#ff8fc8', '#fff0f8', '#ffd35e', '#ff9d6e'];
  p.put('gring', '#5fe08a', c.x, c.y, c.z, c.r, 1, c.r); p.put('gring', '#caffd0', c.x, c.y + .01, c.z, c.r * (.55 + .05 * S(c.a * 3)), 1, c.r * (.55 + .05 * S(c.a * 3)));
  for (let i = 0; i < cnt(c, 8); i++) {
    const q = i * 2.4, rr = c.r * Math.sqrt((i + .5) / 8) * .92, xx = c.x + S(q) * rr, zz = c.z + C(q) * rr, h = (.6 + (i % 3) * .15) * Math.min(1, Math.max(0, c.a * 3 - i * .12)) * b, col = petals[i % 4];
    p.put('box', '#2fa04a', xx, c.y + h / 2, zz, .08, h, .08);
    for (let j = 0; j < 6; j++) { const a = j * PI / 3 + i; p.put('petal', col, xx + S(a) * .3 * b, c.y + h + .03, zz + C(a) * .3 * b, .26 * b, .06, .15 * b, 0, a); }
    p.put('orb', '#ffe45c', xx, c.y + h + .08, zz, .15 * b);
  }
  for (let j = 0; j < cnt(c, 8); j++) {
    const k = (c.a * .55 + j / 8) % 1, q = j * 2.4 + c.a * .5, rr = c.r * (.2 + (j % 4) * .2), px = c.x + S(q) * rr, pz = c.z + C(q) * rr, yy = c.y + .2 + k * 3.2, s = .13 * S(k * PI) * b;
    p.put('gbox', '#7dff9a', px, yy, pz, s * 2.4, s * .8, s * .8); p.put('gbox', '#7dff9a', px, yy, pz, s * .8, s * 2.4, s * .8);
    p.put('gorb', '#e8ffd0', px + .3 * S(c.a * 2 + j), yy + .3, pz, .09 * S(k * PI) * b + .02);
  }
};
const hearts: Builder = (p, c) => {
  const f = fadeOut(c, 3), cols = ['#ff6eb4', '#ff9ad0', '#ff4f9a'];
  p.put('gring', '#ff80bd', c.x, c.y, c.z, (.6 + c.t) * c.r * 1.4, 1, (.6 + c.t) * c.r * 1.4);
  for (let i = 0; i < cnt(c, 9); i++) {
    const k = (c.a * .55 + i / 9) % 1, q = i * 1.9 + S(c.a * 2 + i) * .5, rr = .5 + .35 * S(k * PI * 2 + i), s = (.22 + .22 * hash(i)) * S(Math.min(1, k * 1.5) * PI * .6 + .4) * f;
    p.put('heart', cols[i % 3], c.x + S(q) * rr, c.y + .5 + k * 2.6, c.z + C(q) * rr, s, s, s, 0, 0, S(c.a * 3 + i) * .35);
  }
  for (let i = 0; i < cnt(c, 6); i++) p.put('gorb', '#ffd0e8', c.x + S(i * 1.05 + c.a) * .9, c.y + .4 + ((c.a + i * .3) % 1.4) * 1.4, c.z + C(i * 1.05 + c.a) * .9, .07);
};
const roots: Builder = (p, c) => {
  const f = fadeOut(c, 4);
  p.put('gring', '#8ad45c', c.x, c.y, c.z, c.r * grow(c, 10), 1, c.r * grow(c, 10)); p.put('gring', '#caff9a', c.x, c.y + .01, c.z, c.r * .55 * grow(c, 10), 1, c.r * .55 * grow(c, 10));
  const total = cnt(c, 16);
  for (let i = 0; i < total; i++) {
    const outer = i % 4 !== 3, q = i / total * TAU + (outer ? 0 : .3), rr = c.r * (outer ? .92 : .5), h = Math.min(1, Math.max(0, c.t * 7 - i * .06)) * f * (1 + .25 * hash(i)), xx = c.x + S(q) * rr, zz = c.z + C(q) * rr;
    if (h <= 0) continue;
    if (i % 2) { // a bamboo shoot with nodes and leaves
      p.put('box', '#8fd45a', xx, c.y + h * .9, zz, .14, 1.8 * h, .14);
      for (let k = 1; k < 4; k++) p.put('box', '#5aa83a', xx, c.y + k * .42 * h, zz, .19, .05, .19);
      p.put('petal', '#6fcf4a', xx + .22, c.y + 1.7 * h, zz, .3 * h, .04, .1, 0, 0, .5); p.put('petal', '#7fe05a', xx - .2, c.y + 1.5 * h, zz, .26 * h, .04, .09, 0, 0, -.5);
    } else { // a root writhing out of the ground, leaning inwards
      const lx = -S(q) * .55, lz = -C(q) * .55;
      for (let k = 0; k < 4; k++) { const u = (k + .5) / 4 * h, w = .14 * (1 - k * .18), bend = u * u * .6; p.put('box', k % 2 ? '#8a5a34' : '#6f4527', xx + lx * bend + S(c.a * 5 + i + k) * .03, c.y + u * 1.9, zz + lz * bend, w, .5 * h, w, lz * u * .8, 0, -lx * u * .8); }
      p.put('petal', '#6fcf4a', xx + lx * h * .6, c.y + 1.95 * h, zz + lz * h * .6, .22 * h, .04, .1, 0, q);
    }
  }
};
const holy: Builder = (p, c) => {
  const h = 9, w = (.35 + .85 * grow(c, 2.5)) * fadeOut(c, 3), strike = c.t > .85 ? 1 : 0;
  p.put('gring', '#ffd95e', c.x, c.y, c.z, c.r * (1.15 - c.t * .15), 1, c.r * (1.15 - c.t * .15)); p.put('gring', '#fff3b8', c.x, c.y + .01, c.z, c.r * (1 - grow(c, 1.4) * .6), 1, c.r * (1 - grow(c, 1.4) * .6));
  p.put('gbox', '#ffcf5a', c.x, c.y + h / 2, c.z, w * 1.6, h, w * 1.6); p.put('gbox', '#fff6c8', c.x, c.y + h / 2, c.z, w * .7, h, w * .7, 0, c.a * 2);
  for (let i = 0; i < cnt(c, 10); i++) { const k = (c.a * 1.6 + i / 10) % 1; p.put('gorb', '#fff1a8', c.x + S(i * 2.4 + c.a) * w * .9, c.y + k * h, c.z + C(i * 2.4 + c.a) * w * .9, .1 + .05 * strike); }
  const s = (1 - c.t) * 3 + .6; p.put('box', '#fff0a0', c.x, c.y + 1 + (1 - c.t) * 6, c.z, .12, 1.4 * s * .5, .12); p.put('box', '#fff0a0', c.x, c.y + 1.6 + (1 - c.t) * 6, c.z, .55 * s * .5, .12, .12);
  if (strike) for (let i = 0; i < cnt(c, 8); i++) p.put('star', '#fff6c8', c.x + S(i * .79) * c.r * .7, c.y + .6, c.z + C(i * .79) * c.r * .7, .3, .3, .3, -PI / 2);
};
const shield: Builder = (p, c) => {
  const k = grow(c, 8) * fadeOut(c, 6), r = c.r * k, pulse = 1 + .03 * S(c.a * 6);
  p.put('dome', c.color, c.x, c.y - .1, c.z, r * pulse, r * pulse * 1.05, r * pulse);
  p.put('gring', c.color, c.x, c.y, c.z, r, 1, r);
  for (let i = 0; i < cnt(c, 6); i++) { const q = i * PI / 3 + c.a * 1.6; p.put('gorb', '#ffffff', c.x + S(q) * r, c.y + .3 + (r * .8) * (.5 + .5 * S(c.a * 2 + i)), c.z + C(q) * r, .1); }
};
const roar: Builder = (p, c) => {
  for (let i = 0; i < 3; i++) { const k = Math.max(0, c.t * 1.6 - i * .22), s = Math.min(1, k) * c.r; if (k <= 0) continue; p.put('gring', i ? '#ffd35e' : c.color, c.x, c.y + .7, c.z, s, 1, s, 0, 0, 0); p.put('gring', c.color, c.x, c.y + .05, c.z, s, 1, s); }
  const s = Math.min(1, c.t * 2) * c.r * .85;
  for (let i = 0; i < cnt(c, 16); i++) { const q = i * TAU / 16; p.put('gbox', '#fff1b8', c.x + S(q) * s, c.y + .7, c.z + C(q) * s, .06, .06, 1.1 * fadeOut(c, 3), 0, q); }
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + .2, d = s * .95; p.put('mist', '#d8cfae', c.x + S(q) * d, c.y + .3 + c.t, c.z + C(q) * d, .6 * fadeOut(c, 3)); }
};
const rush: Builder = (p, c) => {
  const f = fadeOut(c, 3), bx = -S(c.f), bz = -C(c.f), px = C(c.f), pz = -S(c.f);
  for (let i = 0; i < cnt(c, 10); i++) {
    const side = (hash(i) - .5) * 2.2, y = .25 + hash(i + 9) * 1.5, len = (1.4 + hash(i + 3) * 2) * f, off = .6 + c.t * 3 + hash(i + 5) * 1.5;
    p.put('gbox', '#ffffff', c.x + bx * off + px * side, c.y + y, c.z + bz * off + pz * side, .04, .04, len, 0, c.f);
  }
  for (let i = 0; i < cnt(c, 6); i++) { const off = 1 + i * .8 * c.t * 3, s = (.35 + i * .06) * f; p.put('mist', '#d9c9a6', c.x + bx * off + (hash(i) - .5), c.y + .2 + c.t * .5, c.z + bz * off + (hash(i + 4) - .5), s, s * .7, s); }
};
const bolt: Builder = (p, c) => {
  const len = c.r, seed = Math.floor(c.a * 36), f = fadeOut(c, 3), n = 8, dx = S(c.f), dz = C(c.f), px = dz, pz = -dx;
  let ox = c.x, oy = c.y + 1, oz = c.z;
  for (let i = 1; i <= n; i++) {
    const u = i / n, j = i === n ? 0 : (hash(seed * 13 + i) - .5) * Math.min(1.6, len * .25), jy = i === n ? -.6 : (hash(seed * 7 + i) - .5) * .9;
    const nx = c.x + dx * len * u + px * j, ny = c.y + 1 + jy * (1 - u * .3), nz = c.z + dz * len * u + pz * j, ex = nx - ox, ey = ny - oy, ez = nz - oz, l = Math.hypot(ex, ey, ez) + .001;
    const yaw = Math.atan2(ex, ez), pitch = -Math.asin(ey / l), mx = (nx + ox) / 2, my = (ny + oy) / 2, mz = (nz + oz) / 2;
    p.put('gbox', '#7fdcff', mx, my, mz, .22 * f, .22 * f, l, pitch, yaw); p.put('gbox', '#ffffff', mx, my, mz, .08, .08, l * 1.02, pitch, yaw);
    ox = nx; oy = ny; oz = nz;
  }
  const ex = c.x + dx * len, ez = c.z + dz * len; p.put('gring', '#a6f8ff', ex, c.y, ez, .5 + c.t * 1.6, 1, .5 + c.t * 1.6); p.put('gorb', '#ffffff', ex, c.y + .5, ez, .5 * f);
  for (let i = 0; i < cnt(c, 4); i++) p.put('gorb', '#c8f6ff', ex + (hash(seed + i) - .5) * 1.6, c.y + .3 + hash(seed + i + 4), ez + (hash(seed + i + 8) - .5) * 1.6, .08);
};
const rainbow: Builder = (p, c) => {
  const cols = ['#ff4d4d', '#ff9a3c', '#ffe45c', '#5fe36a', '#4dc3ff', '#6a6cff', '#c26bff'], f = fadeOut(c, 4), dx = S(c.f), dz = C(c.f), px = dz, pz = -dx, w = .2 * f;
  for (let i = 0; i < 7; i++) { const o = (i - 3) * w * .95; p.put('gbox', cols[i], c.x + dx * c.r / 2 + px * o, c.y + 1, c.z + dz * c.r / 2 + pz * o, w, w * 1.1, c.r, 0, c.f); }
  p.put('gbox', '#ffffff', c.x + dx * c.r / 2, c.y + 1, c.z + dz * c.r / 2, .1, .1, c.r, 0, c.f);
  for (let i = 0; i < cnt(c, 8); i++) { const k = ((c.a * 3 + i / 8) % 1) * c.r; p.put('star', cols[i % 7], c.x + dx * k, c.y + 1 + (hash(i) - .5) * .8, c.z + dz * k, .22, .22, .22, 0, c.a * 6 + i); }
  p.put('gorb', '#ffffff', c.x + dx * 1, c.y + 1, c.z + dz * 1, .45 * f);
};
const moon: Builder = (p, c) => {
  const f = fadeOut(c, 3) * grow(c, 5) * .55, h = 9, pulse = 1 + .04 * S(c.a * 3), ring = fadeOut(c, 3) * grow(c, 5);
  p.put('gring', '#e0305a', c.x, c.y, c.z, c.r * ring, 1, c.r * ring); p.put('gring', '#ff6b8a', c.x, c.y + .01, c.z, c.r * ring * (.6 + .05 * S(c.a * 2)), 1, c.r * ring * (.6 + .05 * S(c.a * 2)));
  p.put('gorb', '#ff3d6a', c.x, c.y + h, c.z, 2.7 * f); p.put('orb', '#d62a56', c.x, c.y + h, c.z, 1.55 * f * pulse); p.put('orb', '#ff5a82', c.x - .15, c.y + h + .12, c.z + .1, 1.35 * f * pulse);
  for (let i = 0; i < 5; i++) p.put('orb', '#9c1840', c.x + S(i * 2.1) * .65, c.y + h + C(i * 1.7) * .6, c.z + 1.05, .2 * f, .2 * f, .05);
  for (let i = 0; i < cnt(c, 14); i++) { const k = (c.a * .5 + i / 14) % 1, q = i * 2.4 + c.a * .6, rr = c.r * (1 - k) * .9; p.put('gorb', '#ff5f86', c.x + S(q) * rr, c.y + .3 + k * (h - .3), c.z + C(q) * rr, .1 * S(k * PI) + .02); }
};
const bats: Builder = (p, c) => {
  const f = fadeOut(c, 5) * grow(c, 8);
  p.put('mist', '#5b3a86', c.x, c.y + 1, c.z, 1.7 * f, 1.2 * f, 1.7 * f);
  for (let i = 0; i < cnt(c, 8); i++) {
    const q = i * TAU / 8 + c.a * 4 * (i % 2 ? 1 : -1), rr = (1.1 + (i % 3) * .5) * (1.3 - .3 * f), yy = c.y + .8 + (i % 4) * .45 + .15 * S(c.a * 6 + i), bx = c.x + S(q) * rr, bz = c.z + C(q) * rr, flap = S(c.a * 22 + i) * .7;
    p.put('rock', '#3a2257', bx, yy, bz, .13 * f, .13 * f, .2 * f);
    for (const s of [-1, 1]) p.put('petal', '#6a3d9a', bx + C(q) * s * .17, yy + .03, bz - S(q) * s * .17, .22 * f, .03, .1 * f, 0, q + PI / 2, s * flap);
  }
  p.put('gring', '#8a5ac8', c.x, c.y, c.z, 1.6 * f, 1, 1.6 * f);
};
const icefield: Builder = (p, c) => {
  const open = grow(c, 8), f = fadeOut(c, 6), r = c.r * open;
  p.put('petal', '#bfeeff', c.x, c.y - .08, c.z, r, .01, r); p.put('petal', '#e8fbff', c.x, c.y - .07, c.z, r * .72, .01, r * .72, 0, c.a * .1);
  p.put('gring', '#66d9ff', c.x, c.y, c.z, r, 1, r);
  for (let i = 0; i < cnt(c, 14); i++) { const q = i * TAU / 14, h = (.5 + hash(i) * .7) * open * f, rr = r * (.96 - (i % 2) * .08); p.put('cone', i % 2 ? '#dff9ff' : '#9fe6ff', c.x + S(q) * rr, c.y + h / 2, c.z + C(q) * rr, .16, h, .16, S(q) * .15, 0, C(q) * .15); }
  for (let i = 0; i < 6; i++) { const q = i * PI / 3 + c.a * .1; p.put('gbox', '#f4feff', c.x + S(q) * r * .4, c.y + .02, c.z + C(q) * r * .4, .05, .02, r * .8, 0, q); }
  for (let i = 0; i < cnt(c, 16); i++) { const k = (c.a * .4 + hash(i)) % 1, q = i * 2.4, rr = r * Math.sqrt(hash(i + 3)); p.put('gorb', '#ffffff', c.x + S(q) * rr + S(c.a + i) * .2, c.y + 2.6 - k * 2.5, c.z + C(q) * rr, .07 + .04 * hash(i)); }
  for (let i = 0; i < cnt(c, 5); i++) { const q = i * 2.4 + .7, rr = r * (.3 + hash(i) * .6); p.put('star', '#ffffff', c.x + S(q) * rr, c.y + .06, c.z + C(q) * rr, .22 * (.6 + .4 * S(c.a * 4 + i)), .22, .22, -PI / 2); }
};
const iceage: Builder = (p, c) => {
  const w = Math.min(1, c.t * 3), f = fadeOut(c, 3), r = c.r * w;
  p.put('gring', '#d0f7ff', c.x, c.y, c.z, r, 1, r); p.put('gring', '#7fdcff', c.x, c.y + .02, c.z, r * .9, 1, r * .9); p.put('petal', '#cfeeff', c.x, c.y - .08, c.z, r * .96, .01, r * .96);
  for (let i = 0; i < cnt(c, 16); i++) { const q = i * TAU / 16 + .1, h = (1 + hash(i) * 1.2) * w * f; p.put('cone', i % 2 ? '#ffffff' : '#9fe6ff', c.x + S(q) * r * .94, c.y + h / 2, c.z + C(q) * r * .94, .24, h, .24, S(q) * .2, 0, C(q) * .2); }
  for (let i = 0; i < cnt(c, 24); i++) { const k = (c.a * .5 + hash(i)) % 1, q = i * 2.4, rr = r * Math.sqrt(hash(i + 3)); p.put('gorb', '#ffffff', c.x + S(q) * rr + S(c.a * 1.5 + i) * .3, c.y + 5 - k * 4.9, c.z + C(q) * rr, .08 + .05 * hash(i + 6)); }
};
const blackhole: Builder = (p, c) => {
  const g = grow(c, 6) * fadeOut(c, 8), core = (1 + .08 * S(c.a * 6)) * g;
  p.put('petal', '#1b1030', c.x, c.y - .08, c.z, c.r * g, .01, c.r * g); p.put('gring', '#9770ff', c.x, c.y, c.z, c.r * g, 1, c.r * g);
  p.put('gorb', '#7a3dd8', c.x, c.y + 1.5, c.z, 2.2 * g); p.put('orb', '#0a0414', c.x, c.y + 1.5, c.z, 1.15 * core);
  const cols = ['#ffb347', '#ff7ad9', '#a58bff'];
  for (let i = 0; i < 3; i++) { const s = (1.8 + i * .55) * g; p.put('gring', cols[i], c.x, c.y + 1.5, c.z, s, 1, s, .3 + i * .05, c.a * (1.5 + i * .6), .15); }
  for (let i = 0; i < cnt(c, 24); i++) { const k = (c.a * .35 + i / 24) % 1, q = i * 2.4 + c.a * 3 + (1 - k) * 4, rr = c.r * (1 - k) + 1, yy = c.y + .3 + (1.2 * (1 - rr / (c.r + 1)) + .2) * (1 - k) * 2; p.put('gorb', i % 3 ? '#d6a8ff' : '#ffc27a', c.x + S(q) * rr, yy, c.z + C(q) * rr, .09 + .06 * k); }
};
const crater: Builder = (p, c) => {
  const w = Math.min(1, c.t * 4), f = fadeOut(c, 2.2), r = c.r * w;
  p.put('gring', c.color, c.x, c.y, c.z, r, 1, r); p.put('gring', '#ffffff', c.x, c.y + .02, c.z, r * .75, 1, r * .75);
  for (let i = 0; i < cnt(c, 10); i++) { const q = i * TAU / 10 + .3, d = r * .8, s = (.6 + hash(i) * .5) * f * (1.2 - c.t * .4); p.put('mist', '#cdb994', c.x + S(q) * d, c.y + .3 + c.t * .8, c.z + C(q) * d, s, s * .8, s); }
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + hash(i), u = c.t * (1.2 + hash(i + 1)), d = r * .3 + u * c.r * .5, hy = Math.max(0, 3.5 * u * (1 - u / 1.4)); p.put('rock', '#8b6a48', c.x + S(q) * d, c.y + hy, c.z + C(q) * d, .22 * f, .18 * f, .22 * f, c.a * 4, c.a * 3); }
};
const lift: Builder = (p, c) => {
  const f = fadeOut(c, 3), w = Math.min(1, c.t * 3);
  p.put('gring', '#ffffff', c.x, c.y, c.z, c.r * (.4 + w * 1.1), 1, c.r * (.4 + w * 1.1));
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8, d = c.r * (.3 + w * .8), s = (.5 + hash(i) * .3) * f; p.put('mist', '#ffffff', c.x + S(q) * d, c.y + .3 + c.t, c.z + C(q) * d, s, s * .7, s); }
  for (let i = 0; i < cnt(c, 8); i++) { const k = (c.a * 1.2 + i / 8) % 1, q = i * 2.4 + k * 3; p.put('petal', i % 2 ? '#ffffff' : '#bfe6ff', c.x + S(q) * (.4 + k * .8), c.y + .2 + k * 3, c.z + C(q) * (.4 + k * .8), .16, .02, .06, k * 3, q, 0); }
};
const blast: Builder = (p, c) => {
  const e = Math.min(1, c.t * 4), f = fadeOut(c, 2.5), r = Math.max(.5, c.r);
  p.put('gorb', '#ff8a2a', c.x, c.y + .5 * r * .3, c.z, r * .8 * e * f + .05); p.put('gorb', '#ffe27a', c.x, c.y + .4, c.z, r * .45 * (1 - c.t) + .02);
  p.put('gring', c.color, c.x, c.y, c.z, r * (.4 + e * .7), 1, r * (.4 + e * .7)); p.put('ring', '#6b6470', c.x, c.y + .05, c.z, r * (.5 + c.t * .8), 1, r * (.5 + c.t * .8));
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + hash(i), d = r * (.3 + c.t * .5), s = (.35 + hash(i + 2) * .3) * r * .35 * f; p.put('mist', i % 2 ? '#4d4a55' : '#7c7886', c.x + S(q) * d, c.y + .3 + c.t * r * .6 * (.6 + hash(i)), c.z + C(q) * d, s, s, s); }
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + .4, u = c.t * 2, d = r * .3 + u * r * .6, hy = Math.max(0, 2 * u * (1 - u / 2) * r * .5); p.put('gorb', i % 2 ? '#ffb040' : '#ff6a30', c.x + S(q) * d, c.y + hy + .2, c.z + C(q) * d, .1 * f + .01); }
};
const cannonfall: Builder = (p, c) => {
  const h = (1 - c.t) ** 1.6 * 9, tgt = c.r * (1 - c.t * .6);
  p.put('gring', c.color, c.x, c.y, c.z, tgt, 1, tgt); p.put('petal', '#3a2a22', c.x, c.y - .08, c.z, tgt * .9, .01, tgt * .9);
  p.put('rock', '#2f3038', c.x, c.y + h, c.z, .4, .4, .4); p.put('gbox', '#ffb040', c.x, c.y + h + 1, c.z, .22, 2, .22); p.put('gorb', '#ffd070', c.x, c.y + h, c.z, .6);
  p.put('mist', '#7c7886', c.x, c.y + h + 1.7, c.z, .35, .6, .35);
};
const meteor: Builder = (p, c) => {
  const h = (1 - c.t) ** 1.4 * 11, tx = .35 * (1 - c.t), tgt = c.r * (1 - c.t * .5);
  p.put('gring', '#ffe45c', c.x, c.y, c.z, tgt, 1, tgt);
  p.put('star', '#ffe45c', c.x + tx * h, c.y + h, c.z, .75, .75, .75, 0, c.a * 8); p.put('gorb', '#fff4b0', c.x + tx * h, c.y + h, c.z, .9);
  for (let i = 1; i < 6; i++) p.put('gorb', i % 2 ? '#ffa43a' : '#ffd25a', c.x + tx * (h + i * .9), c.y + h + i * .9, c.z, .5 - i * .07);
};
const magma: Builder = (p, c) => {
  const up = Math.min(1, c.t * 6), f = fadeOut(c, 3), h = 2.4 * up * f + .1;
  p.put('gring', '#ff6a2a', c.x, c.y, c.z, c.r, 1, c.r); p.put('petal', '#3a1a14', c.x, c.y - .08, c.z, c.r * .9, .01, c.r * .9);
  p.put('cone', '#d9421f', c.x, c.y + h / 2, c.z, c.r * .6, h, c.r * .6, 0, c.a); p.put('cone', '#ff9a30', c.x, c.y + h / 2 + .2, c.z, c.r * .35, h * .9, c.r * .35, 0, c.a * 2);
  p.put('gorb', '#ffe27a', c.x, c.y + h, c.z, c.r * .45 * f);
  for (let i = 0; i < cnt(c, 6); i++) { const q = i * 1.05 + hash(i), u = c.t * 2, d = c.r * (.3 + u * .6), hy = Math.max(0, 3.5 * u * (1 - u / 2)); p.put('gorb', i % 2 ? '#ffb040' : '#ff5a28', c.x + S(q) * d, c.y + hy + .3, c.z + C(q) * d, .14 * f); }
};
const inferno: Builder = (p, c) => {
  const up = Math.min(1, c.t * 5), f = fadeOut(c, 3);
  p.put('gring', '#ff7a2a', c.x, c.y, c.z, c.r * .8, 1, c.r * .8);
  for (let i = 0; i < 5; i++) { const q = i * 1.26 + c.a * 2, d = c.r * .35, h = (1.2 + .5 * S(c.a * 14 + i * 2)) * up * f; p.put('cone', ['#ff5a28', '#ff9a30', '#ffd25a', '#ff7a2a', '#ffb040'][i], c.x + S(q) * d, c.y + h / 2, c.z + C(q) * d, .38 - i * .03, h, .38 - i * .03); }
  p.put('gorb', '#ffd070', c.x, c.y + .6, c.z, .7 * f);
};
const anchor: Builder = (p, c) => {
  const swing = Math.min(1, c.t * 1.5), f = fadeOut(c, 4), q0 = c.f, q = q0 + swing * TAU, r = c.r * .78, ax = c.x + S(q) * r, az = c.z + C(q) * r, ay = c.y + 1.1 + .35 * S(swing * PI);
  p.put('gring', '#9fd6ff', c.x, c.y, c.z, c.r * grow(c, 5), 1, c.r * grow(c, 5)); p.put('gring', '#ffffff', c.x, c.y + .02, c.z, c.r * grow(c, 3) * .8, 1, c.r * grow(c, 3) * .8);
  for (let i = 0; i < cnt(c, 14); i++) { const u = swing - i * .035; if (u <= 0) break; const qq = q0 + u * TAU; p.put('gorb', i % 2 ? '#ffffff' : '#7fc8ff', c.x + S(qq) * r, c.y + 1 + .35 * S(u * PI), c.z + C(qq) * r, .3 * (1 - i / 16) * f); }
  const rot = q + PI / 2;
  p.put('box', '#3a4658', ax, ay, az, .12, .9, .12, 0, rot); p.put('box', '#3a4658', ax, ay + .25, az, .65, .12, .12, 0, rot);
  for (const s of [-1, 1]) p.put('cone', '#4b5d78', ax + S(rot) * .3 * s, ay - .55, az + C(rot) * .3 * s, .13, .32, .13, 0, 0, s * .6);
  p.put('ring', '#9aa8bd', ax, ay + .62, az, .12, 1, .12, PI / 2, rot);
  for (let i = 0; i < cnt(c, 8); i++) p.put('gorb', '#bfe6ff', c.x + S(q + i) * r * (.6 + hash(i) * .5), c.y + .3 + hash(i + 4) * 1.2 * f, c.z + C(q + i) * r * (.6 + hash(i) * .5), .09);
};
const lotus: Builder = (p, c) => {
  const b = grow(c, 4), f = fadeOut(c, 3), cols = ['#ff9fc8', '#ffd0e4', '#ff7fb4'];
  p.put('gring', '#ffb3cf', c.x, c.y, c.z, c.r * grow(c, 5), 1, c.r * grow(c, 5));
  for (let b2 = 0; b2 < cnt(c, 5); b2++) {
    const q = b2 * TAU / 5, d = c.r * .6 * Math.min(1, c.t * 3), bx = c.x + S(q) * d, bz = c.z + C(q) * d;
    for (let j = 0; j < 8; j++) { const a = j * TAU / 8, open = .35 + .55 * b, lift = (j % 2) * .1; p.put('petal', cols[j % 3], bx + S(a) * .26 * open, c.y + .12 + lift, bz + C(a) * .26 * open, .27 * b * f, .05, .12, -.5 * (1 - open), a); }
    p.put('orb', '#ffe45c', bx, c.y + .16, bz, .1 * b * f); p.put('petal', '#4fbf5a', bx, c.y + .06, bz, .5 * b * f, .02, .4 * b * f);
  }
  for (let i = 0; i < cnt(c, 12); i++) { const k = (c.a * .8 + i / 12) % 1, q = i * 2.4 + k * 4, rr = .5 + k * c.r * .8; p.put('petal', i % 2 ? '#ffd0e4' : '#ff9fc8', c.x + S(q) * rr, c.y + .3 + (1 - k) * 2.2, c.z + C(q) * rr, .14, .02, .07, k * 5, q, k * 3); }
};
const eagle: Builder = (p, c) => {
  const w = Math.min(1, c.t * 4), f = fadeOut(c, 2.5), r = c.r * w;
  p.put('gring', '#ffffff', c.x, c.y, c.z, r, 1, r); p.put('gring', '#ffd35e', c.x, c.y + .02, c.z, r * .7, 1, r * .7);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const a = c.f + PI / 2 * s, sp = (i + 1) * .5 * w * 1.3, lift = .6 + (6 - i) * .12 * (1 - c.t); p.put('petal', i % 2 ? '#ffffff' : '#ffe9a8', c.x + S(a) * sp * 1.6 + S(c.f) * (-.3 * i), c.y + lift, c.z + C(a) * sp * 1.6 + C(c.f) * (-.3 * i), .55 * f, .03, .13, 0, c.f, s * .35 * (1 - c.t)); }
  for (let i = 0; i < cnt(c, 10); i++) { const k = (c.t + i / 10) % 1, q = i * 2.4; p.put('petal', '#ffffff', c.x + S(q) * r * k, c.y + .4 + k * 1.2 * (1 - k) * 3, c.z + C(q) * r * k, .12, .02, .05, k * 6, q); }
};
const goldstar: Builder = (p, c) => {
  const w = Math.min(1, c.t * 3), f = fadeOut(c, 3);
  p.put('gring', '#ffe34d', c.x, c.y, c.z, c.r * w, 1, c.r * w); p.put('gorb', '#fff0a0', c.x, c.y + .7, c.z, 1.1 * (1 - c.t));
  for (let i = 0; i < cnt(c, 10); i++) { const q = i * TAU / 10, d = c.r * w * (.4 + .6 * (i % 2)), s = (.3 + .15 * (i % 2)) * f; p.put('star', i % 2 ? '#ffe34d' : '#fff6b0', c.x + S(q) * d, c.y + .7 + .3 * S(c.a * 5 + i), c.z + C(q) * d, s, s, s, 0, c.a * 4 + i); }
  for (let i = 0; i < cnt(c, 12); i++) { const q = i * 2.4, k = (c.t * 1.5 + i / 12) % 1; p.put('gorb', '#ffd23a', c.x + S(q) * c.r * k, c.y + .5 + k * .8, c.z + C(q) * c.r * k, .08 * (1 - k) + .02); }
};
const bonk: Builder = (p, c) => {
  const w = Math.min(1, c.t * 5), f = fadeOut(c, 2.5), r = c.r * w;
  p.put('gring', '#ffe14d', c.x, c.y, c.z, r, 1, r); p.put('gring', '#ffffff', c.x, c.y + .02, c.z, r * .6, 1, r * .6);
  for (let i = 0; i < cnt(c, 12); i++) { const q = i * TAU / 12; p.put('gbox', '#fff4a0', c.x + S(q) * r * .7, c.y + .6, c.z + C(q) * r * .7, .08, .08, r * .5 * f, 0, q); }
  for (let i = 0; i < 5; i++) { const q = i * TAU / 5 + c.a * 6; p.put('star', '#ffe14d', c.x + S(q) * 1, c.y + 2.2 + .15 * S(c.a * 9 + i), c.z + C(q) * 1, .3 * f, .3 * f, .3 * f, 0, c.a * 6); }
  for (let i = 0; i < cnt(c, 6); i++) { const q = i * 1.05 + .3, d = r * .8; p.put('mist', '#ddc88e', c.x + S(q) * d, c.y + .3 + c.t, c.z + C(q) * d, .55 * f); }
};
const whirl: Builder = (p, c) => {
  const f = fadeOut(c, 3), g = grow(c, 6), tint = c.color;
  p.put('gring', tint, c.x, c.y, c.z, c.r * g, 1, c.r * g);
  for (let i = 0; i < cnt(c, 20); i++) { const k = i / 20, q = i * 2.2 + c.a * 9, rr = c.r * (.35 + .6 * k) * g, yy = .2 + k * 2.4; p.put('gbox', i % 3 ? tint : '#ffffff', c.x + S(q) * rr, c.y + yy, c.z + C(q) * rr, .07, .05, .9 * f, 0, q + PI / 2); }
  for (let i = 0; i < cnt(c, 5); i++) { const q = c.a * 7 + i * 1.26, rr = c.r * .55; p.put('petal', '#bfe8a0', c.x + S(q) * rr, c.y + .8 + i * .3, c.z + C(q) * rr, .16, .02, .07, c.a * 8, q); }
};
const surf: Builder = (p, c) => {
  const run = Math.min(1, c.t * 1.25), f = fadeOut(c, 4), n = cnt(c, 13), reach = c.r;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1) - .5) * 1.7, a = c.f + u * (c.r > 11 ? .85 : .5), d = reach * run * (1 - Math.abs(u) * .12), cx = c.x + S(a) * d, cz = c.z + C(a) * d, h = (1.5 + .5 * S(i * 1.7 + c.a * 8)) * (1 - Math.abs(u) * .4) * f * Math.min(1, c.t * 5);
    p.put('box', '#2f8fe8', cx, c.y + h / 2, cz, 1.3, h, .6, -.25, a); p.put('box', '#5cc4ff', cx - S(a) * .1, c.y + h * .65, cz - C(a) * .1, 1.3, h * .55, .5, -.45, a);
    p.put('mist', '#ffffff', cx + S(a) * .25, c.y + h + .05, cz + C(a) * .25, .65 * f, .38 * f, .65 * f);
    for (let k = 0; k < 2; k++) p.put('gorb', '#ffffff', cx + S(a) * (.5 + k * .3), c.y + h + .3 + k * .25 + .1 * S(c.a * 12 + i), cz + C(a) * (.5 + k * .3), .08);
  }
  p.put('gring', '#7fd0ff', c.x, c.y, c.z, 1 + run * 1.2, 1, 1 + run * 1.2);
};
const poof: Builder = (p, c) => {
  const w = Math.min(1, c.t * 4), f = fadeOut(c, 2.2), col = c.color;
  for (let i = 0; i < cnt(c, 9); i++) { const q = i * TAU / 9 + hash(i), d = c.r * .5 * w, s = (.45 + hash(i + 3) * .35) * f * (.7 + w * .5); p.put('mist', i % 2 ? '#ece8f6' : col, c.x + S(q) * d, c.y + .35 + c.t * 1.2 * (.5 + hash(i)), c.z + C(q) * d, s, s * .8, s); }
  p.put('gring', col, c.x, c.y, c.z, c.r * w, 1, c.r * w);
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * 2.4; p.put('gorb', '#ffffff', c.x + S(q) * c.r * w * .8, c.y + .5 + hash(i) * 1.4 * c.t + .2, c.z + C(q) * c.r * w * .8, .08 * f + .01); }
};
const sheep: Builder = (p, c) => {
  const w = Math.min(1, c.t * 4), f = fadeOut(c, 2.5);
  p.put('gring', '#ccbae8', c.x, c.y, c.z, c.r * w, 1, c.r * w);
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8, d = c.r * .75 * w, s = (.45 + .15 * (i % 2)) * f; p.put('mist', '#ffffff', c.x + S(q) * d, c.y + .5 + c.t, c.z + C(q) * d, s, s * .8, s); }
  for (let i = 0; i < cnt(c, 8); i++) { const k = (c.a * .8 + i / 8) % 1, q = i * 2.4; p.put('star', '#ff9ad0', c.x + S(q) * c.r * .6, c.y + .4 + k * 2, c.z + C(q) * c.r * .6, .15 * S(k * PI), .15, .15, 0, c.a * 4 + i); }
};
const taunt: Builder = (p, c) => {
  const f = fadeOut(c, 3);
  for (let i = 0; i < 3; i++) { const k = Math.max(0, c.t * 1.8 - i * .2); if (k <= 0) continue; const s = Math.min(1, k) * c.r; p.put('gring', i % 2 ? '#ffb03a' : '#ff5a4a', c.x, c.y + .1, c.z, s, 1, s); }
  const h = c.y + 2.6 + c.t * .8; p.put('box', '#ff4a3a', c.x, h, c.z, .22 * f, .8 * f, .22 * f); p.put('orb', '#ff4a3a', c.x, h - .7 * f, c.z, .15 * f);
};
const portal: Builder = (p, c) => {
  const s = .3 + S(c.t * PI) * Math.max(1, c.r), f = fadeOut(c, 3);
  p.put('gring', '#b88cff', c.x, c.y + 1, c.z, s, 1, s, PI / 2); p.put('gring', '#ffffff', c.x, c.y + 1, c.z, s * .7, 1, s * .7, PI / 2, c.a * 8);
  for (let i = 0; i < cnt(c, 10); i++) { const q = i * TAU / 10 + c.a * 6; p.put('gorb', '#eee0ff', c.x + C(q) * s, c.y + 1 + S(q) * s, c.z, .11 * f + .02); }
  p.put('gorb', '#7a4fd0', c.x, c.y + 1, c.z, s * .8);
};
const hook: Builder = (p, c) => {
  const out = Math.min(1, c.t * 2.2), back = Math.max(0, c.t * 2 - 1), reach = c.r * out * (1 - back * .1), dx = S(c.f), dz = C(c.f), links = Math.max(2, Math.min(26, Math.ceil(reach / .45)));
  for (let i = 0; i < links; i++) { const k = (i + .5) / links * reach; p.put('box', i % 2 ? '#c9c2ae' : '#8d8676', c.x + dx * k, c.y + 1 + .05 * S(i * 1.5), c.z + dz * k, i % 2 ? .12 : .06, i % 2 ? .06 : .12, .4, 0, c.f); }
  p.put('cone', '#d9d2c0', c.x + dx * (reach + .1), c.y + 1, c.z + dz * (reach + .1), .2, .55, .2, PI / 2, c.f); for (const s of [-1, 1]) p.put('cone', '#aaa38f', c.x + dx * reach - dz * .16 * s, c.y + 1, c.z + dz * reach + dx * .16 * s, .09, .3, .09, PI / 2, c.f, s * .8);
  if (c.t > .35) { const k = Math.min(1, (c.t - .35) * 4); p.put('gring', '#ffffff', c.x + dx * c.r, c.y, c.z + dz * c.r, k * 1.1, 1, k * 1.1); p.put('mist', '#ece5cb', c.x + dx * c.r, c.y + .5, c.z + dz * c.r, .45 * (1 - k * .5)); }
};
const drain: Builder = (p, c) => {
  const dx = S(c.f), dz = C(c.f), r = c.r;
  p.put('gbox', '#e24474', c.x + dx * r / 2, c.y + 1, c.z + dz * r / 2, .09, .09, Math.max(.01, r), 0, c.f);
  for (let i = 0; i < cnt(c, 6); i++) { const k = (1 - ((c.t * 1.4 + i / 6) % 1)) * r; p.put('gorb', i % 2 ? '#ff7d94' : '#ffd0da', c.x + dx * k, c.y + 1 + .2 * S(i * 3 + c.a * 9), c.z + dz * k, .14); }
  p.put('gring', '#ea7a9c', c.x + dx * r, c.y, c.z + dz * r, .5 + .5 * c.t, 1, .5 + .5 * c.t);
};
const charge: Builder = (p, c) => {
  const s = .15 + c.t, dx = S(c.f), dz = C(c.f);
  p.put('gorb', '#ff6a24', c.x + dx, c.y + 1.9, c.z + dz, s); p.put('gorb', '#ffcd55', c.x + dx, c.y + 1.9, c.z + dz, s * 1.7);
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + c.a * 7, rr = (1 - c.t) * 1 + .3; p.put('gorb', '#ffb45a', c.x + dx + S(q) * rr, c.y + 1.9 + C(q) * rr, c.z + dz, .07); }
};
const bite: Builder = (p, c) => {
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) { const q = c.f + (i - 2) * .3, rr = c.r * .65; p.put('cone', '#fff5ce', c.x + S(q) * rr, c.y + .8 + side * (.12 + .45 * (1 - c.t)), c.z + C(q) * rr, .13, .45, .13, side < 0 ? 0 : PI); }
  p.put('gring', '#d4e79a', c.x + S(c.f) * c.r * .65, c.y, c.z + C(c.f) * c.r * .65, .5 + c.t, 1, .5 + c.t);
};
const tail: Builder = (p, c) => {
  for (let i = 0; i < cnt(c, 12); i++) { const q = c.f + c.t * TAU - i * .14; p.put('gorb', '#8fe08a', c.x + S(q) * c.r * .8, c.y + .5, c.z + C(q) * c.r * .8, .34 * (1 - i / 14)); }
  p.put('gring', '#5fbf5a', c.x, c.y, c.z, c.r * Math.min(1, c.t * 3), 1, c.r * Math.min(1, c.t * 3));
  for (let i = 0; i < 5; i++) p.put('mist', '#c6b690', c.x + S(i * 1.26 + c.t * 4) * c.r * .8, c.y + .3, c.z + C(i * 1.26 + c.t * 4) * c.r * .8, .35 * fadeOut(c, 3));
};
const freeze: Builder = (p, c) => {
  const up = Math.min(1, c.t * 8), f = fadeOut(c, 6);
  for (let i = 0; i < 6; i++) { const q = i * PI / 3, h = (1.2 + (i % 2) * .6) * up * f; p.put('cone', i % 2 ? '#e6fbff' : '#9cdefa', c.x + S(q) * c.r * .8, c.y + h / 2, c.z + C(q) * c.r * .8, .28, h, .28, S(q) * .3, 0, C(q) * .3); }
  p.put('gorb', '#bdeaff', c.x, c.y + .8, c.z, c.r * 1.1 * up * f); p.put('gring', '#d0f7ff', c.x, c.y, c.z, c.r * 1.3, 1, c.r * 1.3);
};
const parrot: Builder = (p, c) => {
  const q = c.a * 1.5, xx = c.x + S(q) * 2, zz = c.z + C(q) * 2, yy = c.y + 2.6;
  p.put('orb', '#3dc880', xx, yy, zz, .3, .4, .3); p.put('orb', '#ffcf4a', xx, yy + .38, zz + .1, .22);
  for (const side of [-1, 1]) p.put('petal', '#3c94e4', xx + side * .45, yy, zz, .42, .04, .2, 0, 0, side * S(c.a * 16) * .5);
  p.put('gring', '#8ae394', c.x, c.y, c.z, 2 + .1 * S(c.a * 3), 1, 2 + .1 * S(c.a * 3));
};
const dust: Builder = (p, c) => {
  const w = Math.min(1, c.t * 5), f = fadeOut(c, 2.2);
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + hash(i), d = c.r * (.45 + .4 * hash(i + 2)) * w, s = (.35 + hash(i + 5) * .3) * f; p.put('mist', i % 2 ? '#d8c59a' : '#bfae86', c.x + S(q) * d, c.y + .25 + c.t * .5, c.z + C(q) * d, s, s * .6, s); }
  for (let i = 0; i < cnt(c, 5); i++) { const q = i * 1.26 + .4, u = c.t * 2; p.put('rock', '#8b6a48', c.x + S(q) * c.r * .5 * u, c.y + Math.max(0, 1.4 * u * (1 - u / 2)) + .1, c.z + C(q) * c.r * .5 * u, .1 * f, .08 * f, .1 * f, c.a * 5); }
  p.put('gring', c.color, c.x, c.y, c.z, c.r * w, 1, c.r * w);
};

/** Look id -> builder. Every id in DISGUISE_LOOKS (combat.ts) must be here (tests/skill-visuals.test.ts). */
export const LOOKS: Record<string, Builder> = {
  charge, smoke, heal, icefield, blackhole, moon, holy, meteor, cannonfall, hook, drain, hearts, roots, roar, freeze, portal, bite, tail, parrot,
  shield, rush, bolt, rainbow, bats, iceage, crater, lift, blast, magma, inferno, anchor, lotus, eagle, goldstar, bonk, whirl, surf, poof, sheep, taunt, dust,
};
/** Seconds a look lasts when its effect carries no duration. */
export const LOOK_LIFE: Record<string, number> = { blast: .8, crater: .8, magma: .8, inferno: .7, anchor: .7, lotus: 1.4, eagle: .8, goldstar: .8, bonk: .7, whirl: .7, iceage: 2.2, bolt: .3, rainbow: .5, surf: .9, poof: .7, dust: .8, sheep: 1, taunt: 1, lift: .9, rush: .45, shield: 4, bats: 2.5 };

/** One soft red/gold pulse at the screen edges (roar). A single reused element; skipped for reduced motion. */
let pulseEl: HTMLElement | null = null;
export function screenPulse(color = '#ffb03a') {
  if (typeof document === 'undefined') return;
  try {
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!pulseEl) { pulseEl = document.createElement('div'); pulseEl.id = 'skill-pulse'; document.body.append(pulseEl); }
    pulseEl.style.setProperty('--pulse', color); pulseEl.classList.remove('go'); void pulseEl.offsetWidth; pulseEl.classList.add('go');
  } catch { /* no DOM */ }
}
