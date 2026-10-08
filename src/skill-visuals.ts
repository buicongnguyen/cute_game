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

/** Battle robot tank mode: tank treads under the robot, a cannon barrel ahead, blue sparks and a puff of exhaust. Follows the robot. */
const tank: Builder = (p, c) => {
  const f = grow(c, 8) * fadeOut(c, 12), fx = S(c.f), fz = C(c.f), sx = C(c.f), sz = -S(c.f), roll = c.a * 6;
  for (const s of [-1, 1]) {
    const tx = c.x + sx * .62 * s, tz = c.z + sz * .62 * s;
    p.put('box', '#2c3440', tx, c.y + .28, tz, .34 * f, .46 * f, 1.7 * f, 0, c.f);
    for (let w = 0; w < 4; w++) { const u = (w / 3 - .5) * 1.3; p.put('orb', '#8fa3b8', tx + fx * u + sx * .18 * s, c.y + .28, tz + fz * u + sz * .18 * s, .13 * f, .13 * f, .05, roll, c.f + PI / 2); }
    p.put('box', '#6ff2ff', tx, c.y + .53, tz, .36 * f, .04, 1.72 * f, 0, c.f);
  }
  p.put('box', '#4a5868', c.x + fx * 1.05, c.y + 1.05, c.z + fz * 1.05, .2 * f, .2 * f, 1.1 * f, 0, c.f); p.put('box', '#6ff2ff', c.x + fx * 1.6, c.y + 1.05, c.z + fz * 1.6, .26 * f, .26 * f, .1, 0, c.f);
  for (let i = 0; i < cnt(c, 5); i++) { const k = (c.a * 2 + i / 5) % 1, q = i * 2.4 + c.a * 9; p.put('gorb', i % 2 ? '#bfefff' : '#6ff2ff', c.x + S(q) * .9, c.y + .3 + k * .9, c.z + C(q) * .9, .07 * f); }
  for (let i = 0; i < cnt(c, 3); i++) { const k = (c.a * 1.5 + i / 3) % 1; p.put('mist', '#c9d3dc', c.x - fx * (1.1 + k), c.y + .5 + k * .5, c.z - fz * (1.1 + k), .25 * (1 - k) * f + .02); }
};
// ---- The six uniform kits (combat.ts DISGUISE_KITS): each look draws the thing its skill is named after.
/** Army: a ring of sandbags with a little toy flag; it stays where it was built. */
const sandbag: Builder = (p, c) => {
  const up = grow(c, 10), sink = Math.min(1, (1 - c.t) * 12), r = c.r * .92, n = cnt(c, 18);
  p.put('gring', '#e8d29a', c.x, c.y, c.z, c.r, 1, c.r);
  for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) { // two courses of plump khaki bags, the top row offset like brickwork, each with a tied seam
    const q = (i + row * .5) / n * TAU, x = c.x + S(q) * r, z = c.z + C(q) * r, y = c.y + (.2 + row * .36) * up * sink;
    p.put('orb', (i + row) % 2 ? '#e2c98e' : '#cdb075', x, y, z, .5 * up, .2 * up * sink, .3 * up, 0, q + PI / 2);
    p.put('box', '#9a7a48', x, y + .17 * up * sink, z, .04, .04 * sink, .26 * up, 0, q + PI / 2);
  }
  const fx = c.x + S(c.f) * r, fz = c.z + C(c.f) * r, h = 1.7 * up * sink;
  p.put('box', '#6b5a3c', fx, c.y + .6 + h / 2, fz, .07, h, .07); p.put('box', '#4f8a2e', fx + C(c.f) * .36, c.y + .6 + h * .85, fz - S(c.f) * .36, .7, .42 * up * sink, .04, 0, c.f, .12 * S(c.a * 6)); p.put('star', '#ffe45c', fx + C(c.f) * .36, c.y + .6 + h * .85, fz - S(c.f) * .36 + .03, .12 * up, .12 * up, .12 * up, 0, c.f);
  for (let i = 0; i < cnt(c, 6) && c.a < .6; i++) { const q = i * 1.05 + hash(i), d = r * (1 + c.a); p.put('mist', '#d8c59a', c.x + S(q) * d, c.y + .3 + c.a, c.z + C(q) * d, .4 * (1 - c.a / .6)); }
};
/** Army: a signal flare shoots up over the spot, bursts into a hanging red-gold light and dazzles the area below. */
const flare: Builder = (p, c) => {
  const rise = Math.min(1, c.a / .5), h = 1 + rise * 5.5, lit = c.a >= .5 ? Math.min(1, (c.a - .5) / .12) * fadeOut(c, 2.5) : 0;
  if (!lit) { p.put('gorb', '#ff6a3a', c.x, c.y + h, c.z, .35); p.put('orb', '#fff2c0', c.x, c.y + h, c.z, .16); for (let i = 1; i < 6; i++) p.put('gorb', i % 2 ? '#ffb03a' : '#ff6a3a', c.x + S(i * 2.1) * .06 * i, c.y + h - i * .45, c.z, .2 - i * .025); p.put('gring', '#ff6a3a', c.x, c.y, c.z, c.r * (.3 + rise * .5), 1, c.r * (.3 + rise * .5)); return; }
  // The burning flare drifts down under a little parachute, a white-hot core in a red halo.
  const hy = c.y + 6.5 - (c.a - .5) * .6;
  p.put('cone', '#ffffff', c.x, hy + 1, c.z, .5, .3, .5); p.put('box', '#fff4dc', c.x, hy + .5, c.z, .02, .9, .02);
  p.put('gorb', '#ff4a2a', c.x, hy, c.z, .95 * lit); p.put('orb', '#fff6dc', c.x, hy, c.z, .32 * lit); p.put('star', '#fff6c8', c.x, hy, c.z, .9 * lit, .9 * lit, .9 * lit, -.9, 0, c.a * 4);
  p.put('gring', '#ff6a3a', c.x, c.y, c.z, c.r, 1, c.r); p.put('gring', '#ffd070', c.x, c.y + .01, c.z, c.r * .7 * lit, 1, c.r * .7 * lit);
  for (let i = 0; i < cnt(c, 12); i++) { const q = i * TAU / 12, k = Math.min(1, (c.a - .5) * 2), d = k * 2.6; p.put('gorb', i % 2 ? '#ffd070' : '#ff6a3a', c.x + S(q) * d, hy - k * k * 2.4, c.z + C(q) * d, .11 * lit + .02); }
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + .2; p.put('gbox', '#ffe0a0', c.x + S(q) * c.r * .5, c.y + (hy - c.y) / 2, c.z + C(q) * c.r * .5, .05, (hy - c.y) * .9, .05, S(q) * .35, 0, -C(q) * .35); }
};
/** Army: a supply crate floats down under a striped parachute onto the spot. */
const parachute: Builder = (p, c) => {
  const h = (1 - c.t) * 8, y = c.y + .35 + h, sway = S(c.a * 3) * .25 * (1 - c.t);
  p.put('gring', '#e8c27a', c.x, c.y, c.z, c.r * (1 - c.t * .4), 1, c.r * (1 - c.t * .4)); p.put('petal', '#5a4a3a', c.x, c.y - .08, c.z, .6 * (.4 + c.t * .6), .01, .6 * (.4 + c.t * .6));
  p.put('box', '#b07a3a', c.x, y, c.z, .7, .6, .7, 0, c.a * .5); p.put('box', '#e8d6a8', c.x, y, c.z, .74, .1, .74, 0, c.a * .5); p.put('box', '#e8d6a8', c.x, y, c.z, .1, .64, .74, 0, c.a * .5);
  p.put('cone', '#ff5a4a', c.x + sway, y + 2, c.z, 1.25, .7, 1.25, 0, c.a * .5); p.put('cone', '#ffffff', c.x + sway, y + 2.03, c.z, 1.2, .66, 1.2, 0, c.a * .5 + PI / 6);
  for (let i = 0; i < 4; i++) { // four cords from the crate's top corners to the canopy rim
    const q = i * PI / 2 + PI / 4 + c.a * .5, ax = c.x + S(q) * .35, ay = y + .3, az = c.z + C(q) * .35, bx = c.x + sway + S(q) * 1.15, by = y + 1.7, bz = c.z + C(q) * 1.15, ex = bx - ax, ey = by - ay, ez = bz - az, len = Math.hypot(ex, ey, ez);
    p.put('box', '#fff4dc', (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, .025, .025, len, -Math.asin(ey / len), Math.atan2(ex, ez));
  }
};
/** Navy: the bosun's whistle: sharp rings ripple out and little music notes jump off. */
const whistle: Builder = (p, c) => {
  for (let i = 0; i < 3; i++) { const k = c.t * 1.4 - i * .18; if (k <= 0 || k > 1) continue; const s = k * c.r; p.put('gring', i % 2 ? '#9fd6ff' : '#ffffff', c.x, c.y + .8, c.z, s, 1, s); p.put('gring', '#bfe6ff', c.x, c.y + .04, c.z, s, 1, s); }
  const f = fadeOut(c, 3);
  for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8 + .4, k = Math.min(1, c.t * 1.6), d = 1 + k * c.r * .6, y = c.y + 1.3 + S(k * PI) * 1.4 + (i % 2) * .4, col = i % 2 ? '#ffffff' : '#7fc8ff';
    p.put('orb', col, c.x + S(q) * d, y, c.z + C(q) * d, .16 * f, .12 * f, .16 * f); p.put('box', col, c.x + S(q) * d + .13, y + .3, c.z + C(q) * d, .04, .55 * f, .04); p.put('box', col, c.x + S(q) * d + .22, y + .55, c.z + C(q) * d, .2 * f, .06, .04, 0, 0, -.4); }
  p.put('gorb', '#ffffff', c.x, c.y + 1.4, c.z, .35 * fadeOut(c, 6));
};
/** Ao dai: silk ribbons stream behind you as you glide. */
const ribbon: Builder = (p, c) => {
  const f = fadeOut(c, 4) * grow(c, 10), bx = -S(c.f), bz = -C(c.f), sx = C(c.f), sz = -S(c.f), cols = ['#ff8fb1', '#ffd0e4', '#ffd84a'];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++) {
    const u = .3 + k * .32, side = (r - 1) * .35 + S(c.a * 9 - k * .7 + r) * .35 * (k / 9), y = c.y + 1 + r * .2 + S(c.a * 7 - k * .6 + r * 2) * .25;
    p.put('box', cols[r], c.x + bx * u + sx * side, y, c.z + bz * u + sz * side, .34 * f, .03, .36, S(c.a * 7 - k * .6) * .4, c.f, S(c.a * 9 - k) * .6);
  }
  for (let i = 0; i < cnt(c, 6); i++) { const k = (c.a * 1.5 + i / 6) % 1, q = i * 2.4; p.put('petal', i % 2 ? '#ff8fb1' : '#fff0f6', c.x + bx * (1 + k * 3) + S(q) * .5, c.y + .4 + (1 - k) * 1.4, c.z + bz * (1 + k * 3) + C(q) * .5, .12, .02, .06, k * 5, q); }
};
/** Ao dai: a big paper fan opens ahead and sends a gust of wind and petals through its cone. */
const fan: Builder = (p, c) => {
  const open = grow(c, 4), f = fadeOut(c, 3), half = Math.acos(.64), ribs = 9, len = 1.9;
  for (let i = 0; i < ribs; i++) { const a = c.f + (i / (ribs - 1) - .5) * 2 * half * open, mx = c.x + S(a) * len * .55, mz = c.z + C(a) * len * .55;
    p.put('box', '#8a5a34', mx, c.y + 1.2, mz, .04, .04, len * 1.05, -.35, a);
    if (i < ribs - 1) { const b = c.f + ((i + .5) / (ribs - 1) - .5) * 2 * half * open; p.put('box', i % 2 ? '#ff8fb1' : '#fff0f6', c.x + S(b) * len * .7, c.y + 1.35, c.z + C(b) * len * .7, .5 * open + .02, .02, len * .62, -.35, b); p.put('box', '#e8352b', c.x + S(b) * len * 1.02, c.y + 1.48, c.z + C(b) * len * 1.02, .5 * open + .02, .04, .07, -.35, b); } }
  p.put('orb', '#ffd84a', c.x + S(c.f) * .1, c.y + 1.1, c.z + C(c.f) * .1, .12);
  for (let i = 0; i < cnt(c, 12); i++) { const u = (i / 11 - .5) * 2 * half, k = (c.t * 1.6 + hash(i) * .4) % 1, d = 1.5 + k * (c.r - 1.5), a = c.f + u * .95; p.put('gbox', '#ffffff', c.x + S(a) * d, c.y + .5 + hash(i + 3) * 1.4, c.z + C(a) * d, .05, .05, 1.1 * f, 0, a); }
  for (let i = 0; i < cnt(c, 8); i++) { const u = (hash(i + 7) - .5) * 2 * half, k = Math.min(1, c.t * 1.5), a = c.f + u, d = 1.5 + k * c.r * .85; p.put('petal', i % 2 ? '#ff8fb1' : '#ffd0e4', c.x + S(a) * d, c.y + .6 + hash(i) * 1.2, c.z + C(a) * d, .14, .02, .07, k * 6, a, k * 4); }
  p.put('gring', '#ffb3cf', c.x + S(c.f) * c.r * .5, c.y, c.z + C(c.f) * c.r * .5, c.r * .5 * open, 1, c.r * .5 * open);
};
/** Ao dai: a red paper lantern drifts out from you, glowing, and bursts into golden sparkles where it ends. */
const lantern: Builder = (p, c) => {
  const k = Math.min(1, c.a / Math.max(.3, c.life * .7)), sx = c.x - S(c.f) * 4 * (1 - k), sz = c.z - C(c.f) * 4 * (1 - k), y = c.y + 1 + k * 1.6 + .15 * S(c.a * 4), pop = c.t > .88 ? (c.t - .88) / .12 : 0;
  if (!pop) { // a round red silk lantern: gold caps, gold ribs, a tassel, a warm light glowing out of its open bottom
    p.put('orb', '#e8352b', sx, y, sz, .42, .5, .42); for (let i = 0; i < 3; i++) p.put('ring', '#ffcf4a', sx, y, sz, .43, 1, .51, PI / 2, i * PI / 3);
    p.put('box', '#ffd84a', sx, y + .5, sz, .34, .08, .34); p.put('box', '#ffd84a', sx, y - .5, sz, .34, .08, .34); p.put('box', '#ffd84a', sx, y - .78, sz, .05, .45, .05);
    p.put('gorb', '#ffe27a', sx, y - .55, sz, .2 + .04 * S(c.a * 12)); p.put('gring', '#ffc35a', sx, c.y + .02, sz, .7, 1, .7);
    p.put('gring', '#ffc35a', c.x, c.y, c.z, c.r * k * .6, 1, c.r * k * .6);
    return;
  }
  p.put('gorb', '#ffe27a', sx, y, sz, 1.2 * (1 - pop) + .2); p.put('gring', '#ffc35a', c.x, c.y, c.z, c.r, 1, c.r);
  for (let i = 0; i < cnt(c, 10); i++) { const q = i * TAU / 10, d = pop * c.r * .8; p.put('star', i % 2 ? '#ffd84a' : '#ff8a5a', sx + S(q) * d, y - pop * 1.2 + (i % 3) * .2, sz + C(q) * d, .22, .22, .22, 0, q + c.a * 5); }
};
/** Ao dai gentleman: a red-and-gold kite flies over you on its string while you glide. */
const kite: Builder = (p, c) => {
  const f = grow(c, 8) * fadeOut(c, 10), bx = -S(c.f), bz = -C(c.f), kx = c.x + bx * 1.6 + S(c.a * 1.3) * .4, kz = c.z + bz * 1.6, ky = c.y + 3.4 + .3 * S(c.a * 2), tilt = .25 * S(c.a * 1.7);
  p.put('box', '#ffd84a', kx, ky, kz, 1.1 * f, 1.1 * f, .04, 0, c.f, PI / 4 + tilt); p.put('box', '#e8352b', kx, ky, kz + .01, .62 * f, .62 * f, .05, 0, c.f, PI / 4 + tilt);
  p.put('star', '#ffffff', kx - bx * .04, ky, kz - bz * .04, .22 * f, .22 * f, .22 * f, 0, c.f + PI, tilt);
  p.put('box', '#8a5a34', kx, ky, kz, .03, 1.5 * f, .03, 0, c.f, tilt); p.put('box', '#8a5a34', kx, ky + .1, kz, 1.5 * f, .03, .03, 0, c.f, tilt);
  for (let i = 1; i <= 7; i++) { const u = i * .28; p.put('box', i % 2 ? '#e8352b' : '#ffd84a', kx + bx * u * .4 + S(c.a * 6 - i) * .15 * i * .3, ky - .8 - u, kz + bz * u * .4, .16 * f, .1 * f, .03, 0, c.f, S(c.a * 6 - i) * .6); }
  const hx = c.x, hy = c.y + 1.2, hz = c.z, len = Math.hypot(kx - hx, ky - hy, kz - hz); p.put('box', '#fff4dc', (hx + kx) / 2, (hy + ky) / 2, (hz + kz) / 2, .02, .02, len, -Math.asin((ky - hy) / len), Math.atan2(kx - hx, kz - hz));
  for (let i = 0; i < cnt(c, 4); i++) { const k = (c.a + i / 4) % 1; p.put('mist', '#ffffff', c.x + S(i * 1.6) * .6, c.y + .2 + k * .4, c.z + C(i * 1.6) * .6, .3 * (1 - k) * f); }
};
/** Ao dai gentleman: a calligraphy brush paints a black ink circle around you, finished with a red seal. */
const ink: Builder = (p, c) => {
  const draw = Math.min(1, c.a / .35), f = fadeOut(c, 5), n = cnt(c, 40), r = c.r * .95;
  for (let i = 0; i < n; i++) { const u = i / n; if (u > draw) break; const q = c.f + u * TAU, w = (.28 + .22 * S(u * PI * 3) + .12 * hash(i)) * f; p.put('petal', i % 7 ? '#1d2028' : '#3a3f4a', c.x + S(q) * r, c.y - .04 + (i % 2) * .005, c.z + C(q) * r, w, .01, w * 1.4, 0, q + PI / 2); }
  for (let i = 0; i < cnt(c, 10); i++) { const q = hash(i) * TAU, d = r * (.75 + hash(i + 4) * .45), s = (.06 + hash(i + 9) * .14) * f; if (hash(i + 2) > draw) continue; p.put('petal', '#1d2028', c.x + S(q) * d, c.y - .03, c.z + C(q) * d, s, .01, s); }
  if (draw >= 1) { const sx = c.x + S(c.f) * r, sz = c.z + C(c.f) * r; p.put('box', '#d23a2a', sx, c.y + .02, sz, .55 * f, .03, .55 * f, 0, c.f); p.put('box', '#ffe9d0', sx, c.y + .04, sz, .3 * f, .03, .06, 0, c.f); p.put('box', '#ffe9d0', sx, c.y + .04, sz, .06, .03, .3 * f, 0, c.f); }
  for (let i = 0; i < cnt(c, 8); i++) { const k = (c.a * .6 + i / 8) % 1, q = i * TAU / 8 + c.a * .3; p.put('mist', '#4a4f5c', c.x + S(q) * r, c.y + .2 + k * 1.4, c.z + C(q) * r, .3 * (1 - k) * f); }
};
/** Ao dai gentleman: a festive dragon puppet on poles dances in a circle around you. */
const dragondance: Builder = (p, c) => {
  // A long red-and-gold dragon on dancers' poles winds round you: a big head with horns, eyes, whiskers and a beard,
  // a body of overlapping scaled humps with a golden ridge, and a tail tuft.
  const f = grow(c, 6) * fadeOut(c, 8), r = c.r * .78, segs = 13, gap = .2, spin = c.a * 2.2 + c.f;
  for (let i = segs; i >= 0; i--) {
    const q = spin - i * gap, y = c.y + 1.4 + .4 * S(c.a * 7 - i * .7), x = c.x + S(q) * r, z = c.z + C(q) * r, head = i === 0, along = q + PI / 2;
    if (i % 3 === 0) p.put('box', '#8a5a34', x, (c.y + y) / 2, z, .06, y - c.y, .06);
    if (head) {
      const hx = x + C(q) * .25, hz = z - S(q) * .25;
      p.put('orb', '#e8352b', hx, y + .15, hz, .62 * f, .55 * f, .75 * f, 0, along); p.put('orb', '#ffd84a', hx + C(q) * .5, y - .05, hz - S(q) * .5, .4 * f, .26 * f, .42 * f, 0, along);
      p.put('box', '#ffffff', hx + C(q) * .62, y - .17, hz - S(q) * .62, .5 * f, .05, .2 * f, 0, along);
      for (const s of [-1, 1]) {
        const sx = S(q) * s, sz = C(q) * s;
        p.put('cone', '#ffd84a', hx - sx * .28 - C(q) * .1, y + .78, hz - sz * .28 + S(q) * .1, .09, .5 * f, .09, -.4, along, s * .35);
        p.put('orb', '#ffffff', hx + C(q) * .45 - sx * .3, y + .35, hz - S(q) * .45 - sz * .3, .14 * f); p.put('orb', '#1a1a22', hx + C(q) * .55 - sx * .32, y + .36, hz - S(q) * .55 - sz * .32, .07 * f);
        p.put('box', '#ffd84a', hx + C(q) * .7 - sx * .45, y - .05 + .08 * S(c.a * 9 + s), hz - S(q) * .7 - sz * .45, .04, .04, .7 * f, .3, along + s * .7);
      }
      p.put('mist', '#ffe9a0', hx, y - .45, hz, .35 * f, .25 * f, .35 * f);
    } else if (i === segs) {
      p.put('cone', '#ffd84a', x, y, z, .3 * f, .7 * f, .3 * f, PI / 2, along);
    } else {
      const s = (.5 - i * .015) * f;
      p.put('orb', i % 2 ? '#e8352b' : '#f04a3a', x, y, z, s, s * .9, s * 1.1, 0, along);
      p.put('cone', '#ffd84a', x, y + s * .85, z, .12 * f, .3 * f, .12 * f);
      p.put('orb', '#ffe27a', x, y - s * .5, z, s * .55, s * .3, s * .7, 0, along);
    }
  }
  for (let i = 0; i < cnt(c, 8); i++) { const k = (c.a * .8 + i / 8) % 1, q = i * 2.4 + c.a; p.put('petal', ['#e8352b', '#ffd84a', '#5fbf5a', '#ffffff'][i % 4], c.x + S(q) * r * 1.1, c.y + .4 + (1 - k) * 2.6, c.z + C(q) * r * 1.1, .1, .02, .06, k * 7, q, k * 5); }
  p.put('gring', '#ffd84a', c.x, c.y, c.z, c.r * f, 1, c.r * f);
};
/** Stars and stripes: a round star shield in front of you, red and white rings round a blue centre and a white star. */
const starshield: Builder = (p, c) => {
  const f = grow(c, 10) * fadeOut(c, 10), fx = S(c.f), fz = C(c.f), x = c.x + fx * .95, z = c.z + fz * .95, y = c.y + 1.05, R = .82 * f;
  const discs: [string, number][] = [['#d6283a', 1], ['#ffffff', .8], ['#d6283a', .62], ['#2f4fc4', .44]];
  discs.forEach(([col, k], i) => p.put('petal', col, x + fx * i * .015, y, z + fz * i * .015, R * k, .02, R * k, PI / 2, c.f));
  p.put('star', '#ffffff', x + fx * .08, y, z + fz * .08, .34 * f, .34 * f, .34 * f, 0, c.f);
  p.put('dome', '#5f86ff', c.x, c.y - .1, c.z, 1.7 * f, 1.8 * f, 1.7 * f);
  if (c.a < .35) { const k = c.a / .35; p.put('gring', '#ffffff', c.x, c.y, c.z, 3 * k, 1, 3 * k); for (let i = 0; i < cnt(c, 8); i++) { const q = i * TAU / 8; p.put('star', i % 2 ? '#ff5a6a' : '#ffffff', c.x + S(q) * 3 * k, c.y + .6, c.z + C(q) * 3 * k, .2 * (1 - k), .2 * (1 - k), .2 * (1 - k), 0, q); } }
};
/** Stars and stripes: the liberty torch raised high, a bright flame and a golden wave of light. */
const torch: Builder = (p, c) => {
  const f = grow(c, 8) * fadeOut(c, 12), x = c.x + .25, z = c.z, top = c.y + 2.55, flick = 1 + .12 * S(c.a * 23);
  p.put('box', '#d9a441', x, c.y + 2.05, z, .1, .7 * f, .1); p.put('cone', '#e8b84a', x, top - .05, z, .2 * f, .28 * f, .2 * f, PI);
  p.put('cone', '#ff7a1e', x, top + .32 * flick, z, .2 * f, .6 * f * flick, .2 * f); p.put('cone', '#ffe45e', x, top + .26, z, .11 * f, .4 * f * flick, .11 * f); p.put('gorb', '#ffb02e', x, top + .3, z, .7 * f * flick);
  if (c.a < .8) { const k = c.a / .8; p.put('gring', '#ffd35e', c.x, c.y, c.z, c.r * k, 1, c.r * k); p.put('gring', '#fff3b8', c.x, c.y + .02, c.z, c.r * k * .8, 1, c.r * k * .8);
    for (let i = 0; i < cnt(c, 12); i++) { const q = i * TAU / 12; p.put('gbox', '#fff1b8', c.x + S(q) * c.r * k * .9, c.y + .6, c.z + C(q) * c.r * k * .9, .06, .06, .9 * (1 - k), 0, q); } }
  for (let i = 0; i < cnt(c, 6); i++) { const k = (c.a * .9 + i / 6) % 1; p.put('gorb', i % 2 ? '#ffd35e' : '#ffffff', x + S(i * 2.1 + c.a) * .3, top + .3 + k * 1.4, z + C(i * 2.1 + c.a) * .3, .07 * (1 - k) * f + .01); }
};
/** Stars and stripes: a firework rocket shoots up from the spot and bursts in red, white or blue, raining sparks. */
const firework: Builder = (p, c) => {
  const rise = .6, top = c.y + 4.5;
  if (c.a < rise) { const k = c.a / rise, y = c.y + .3 + k * 4.2; p.put('box', c.color, c.x, y, c.z, .12, .45, .12); p.put('cone', '#ffffff', c.x, y + .32, c.z, .1, .2, .1); for (let i = 1; i < 5; i++) p.put('gorb', i % 2 ? '#ffd070' : '#ff8a3c', c.x + S(i * 3) * .05, y - .2 - i * .3, c.z, .16 - i * .025); p.put('gring', c.color, c.x, c.y, c.z, c.r * .4, 1, c.r * .4); return; }
  const k = Math.min(1, (c.a - rise) / .5), f = 1 - k, n = cnt(c, 18);
  p.put('gorb', '#ffffff', c.x, top, c.z, 1.1 * f + .1); p.put('gring', c.color, c.x, c.y, c.z, c.r * (.5 + k * .5), 1, c.r * (.5 + k * .5));
  for (let i = 0; i < n; i++) { const q = i * 2.4, el = (hash(i) - .3) * 1.6, d = 2.4 * Math.sqrt(k); p.put(i % 3 ? 'gorb' : 'star', i % 2 ? c.color : '#ffffff', c.x + S(q) * C(el) * d, top + S(el) * d - k * k * 1.8, c.z + C(q) * C(el) * d, (i % 3 ? .13 : .22) * f + .02, (i % 3 ? .13 : .22) * f + .02, (i % 3 ? .13 : .22) * f + .02, 0, q); }
};
/** Vietnam: a bamboo pole vault, the pole swinging you over, leaves flying, and a landing ring where you come down. */
const bamboo: Builder = (p, c) => {
  const fx = S(c.f), fz = C(c.f), px = c.x + fx * c.r * .45, pz = c.z + fz * c.r * .45, sw = -1 + Math.min(1, c.t * 1.3) * 2, a = sw * 1.05, L = 4, f = fadeOut(c, 6);
  for (let i = 0; i < 5; i++) { const u0 = i / 5 * L, u1 = (i + 1) / 5 * L, m = (u0 + u1) / 2, x = px + fx * S(a) * m, z = pz + fz * S(a) * m, y = c.y + C(a) * m;
    p.put('box', i % 2 ? '#9be05e' : '#7cc24a', x, y, z, .26, L / 5, .26, a, c.f, 0); p.put('box', '#4f9a32', px + fx * S(a) * u1, c.y + C(a) * u1, pz + fz * S(a) * u1, .34, .08, .34, a, c.f); }
  const tx = px + fx * S(a) * L, tz = pz + fz * S(a) * L, ty = c.y + C(a) * L; p.put('petal', '#6fcf4a', tx, ty, tz, .35 * f, .04, .12, 0, c.f, .6); p.put('petal', '#7fe05a', tx, ty - .1, tz, .3 * f, .04, .1, 0, c.f + 1, -.5);
  for (let i = 0; i < cnt(c, 8); i++) { const k = (c.t * 1.2 + i / 8) % 1, q = i * 2.4; p.put('petal', i % 2 ? '#6fcf4a' : '#a8e070', tx + S(q) * k * 1.4, ty - k * 2, tz + C(q) * k * 1.4, .14, .02, .06, k * 6, q); }
  p.put('gring', '#8fd45a', px, c.y, pz, .5, 1, .5);
  if (c.t > .7) { const k = (c.t - .7) / .3, ex = c.x + fx * c.r, ez = c.z + fz * c.r; p.put('gring', '#8fd45a', ex, c.y, ez, 3 * k, 1, 3 * k); }
};
/** Vietnam: a bronze drum (its top patterned with rings round a sun-star) booms three times; each beat rings out. */
const drum: Builder = (p, c) => {
  const f = grow(c, 10) * fadeOut(c, 8);
  p.put('cone', '#9a6a22', c.x, c.y + .22, c.z, 1.15 * f, .45 * f, 1.15 * f, PI); p.put('petal', '#c8902e', c.x, c.y + .46, c.z, 1.05 * f, .02, 1.05 * f);
  for (const [r, col] of [[.85, '#7a4e16'], [.62, '#e0a848'], [.42, '#7a4e16']] as const) p.put('ring', col, c.x, c.y + .48, c.z, r * f, 1, r * f);
  p.put('star', '#ffd35e', c.x, c.y + .5, c.z, .3 * f, .3 * f, .3 * f, -PI / 2);
  for (let i = 0; i < 6; i++) { const q = i * TAU / 6 + .3; p.put('star', '#e0a848', c.x + S(q) * .74 * f, c.y + .49, c.z + C(q) * .74 * f, .08, .08, .08, -PI / 2, q); }
  for (let b = 0; b < 3; b++) { const age = c.a - b * .35; if (age < 0 || age > .6) continue; const k = age / .6, s = 1 + (c.r - 1) * k;
    p.put('gring', b === 2 ? '#fff1b8' : '#f2c14e', c.x, c.y + .05, c.z, s, 1, s); p.put('gring', '#ffffff', c.x, c.y + .7, c.z, s * .8, 1, s * .8);
    for (let i = 0; i < cnt(c, 6); i++) { const q = i * TAU / 6 + b; p.put('gorb', '#ffd35e', c.x + S(q) * .9, c.y + .6 + k * 1.2, c.z + C(q) * .9, .1 * (1 - k)); } }
};
/** Vietnam: a giant golden star falls from the sky onto the spot and glows there. */
const bigstar: Builder = (p, c) => {
  // The five-pointed star faces the camera (tilted back like a billboard) and turns in its own plane as it falls.
  const fall = .7, k = Math.min(1, c.a / fall), h = (1 - k) * (1 - k) * 14, s = 2.3, y = c.y + 1.6 + h;
  p.put('gring', '#ffe34d', c.x, c.y, c.z, c.r * (1.1 - k * .1), 1, c.r * (1.1 - k * .1)); p.put('gring', '#da251d', c.x, c.y + .01, c.z, c.r * .8 * k, 1, c.r * .8 * k);
  p.put('gorb', '#ffd23a', c.x, y, c.z - .3, 1.1); p.put('star', '#ffd21e', c.x, y, c.z, s, s, s, -.9, 0, c.a * 2); p.put('star', '#fff6b0', c.x, y + .05, c.z + .05, s * .45, s * .45, s * .45, -.9, 0, c.a * 2);
  if (k < 1) for (let i = 1; i < 7; i++) p.put('gorb', i % 2 ? '#ffd23a' : '#ffe9a0', c.x, y + i * 1.1, c.z - i * .3, .55 - i * .06);
  else { const g = Math.min(1, (c.a - fall) / .5); for (let i = 0; i < cnt(c, 10); i++) { const q = i * TAU / 10; p.put('star', i % 2 ? '#ffe34d' : '#ffffff', c.x + S(q) * c.r * g, c.y + .5 + S(g * PI) * 1.2, c.z + C(q) * c.r * g, .3 * (1 - g) + .05, .3 * (1 - g) + .05, .3 * (1 - g) + .05, 0, q); } }
};

/** Look id -> builder. Every id in DISGUISE_LOOKS (combat.ts) must be here (tests/skill-visuals.test.ts). */
export const LOOKS: Record<string, Builder> = {
  charge, smoke, heal, icefield, blackhole, moon, holy, meteor, cannonfall, hook, drain, hearts, roots, roar, freeze, portal, bite, tail, parrot,
  shield, rush, bolt, rainbow, bats, iceage, crater, lift, blast, magma, inferno, anchor, lotus, eagle, goldstar, bonk, whirl, surf, poof, sheep, taunt, dust,
  tank, sandbag, flare, parachute, whistle, ribbon, fan, lantern, kite, ink, dragondance, starshield, torch, firework, bamboo, drum, bigstar,
};
/** Seconds a look lasts when its effect carries no duration. */
export const LOOK_LIFE: Record<string, number> = { blast: .8, crater: .8, magma: .8, inferno: .7, anchor: .7, lotus: 1.4, eagle: .8, goldstar: .8, bonk: .7, whirl: .7, iceage: 2.2, bolt: .3, rainbow: .5, surf: .9, poof: .7, dust: .8, sheep: 1, taunt: 1, lift: .9, rush: .45, shield: 4, bats: 2.5,
  tank: 6, sandbag: 6, flare: 1.4, parachute: 1.2, whistle: 1, ribbon: 1.2, fan: .7, lantern: 1.5, kite: 5, ink: 3, dragondance: 5, starshield: 3, torch: 6, firework: 1.1, bamboo: .7, drum: 1.45, bigstar: 1.2 };

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
