"""Zoo Garden farm pen: farm animals, the pen pieces and the farm products.

A small kit for a farm-animal pen next to the garden, in the shared chunky toy style (see
style.py): a hen, a cow, a chick and a calf with separate named parts for simple procedural
animation; a modular pen (fence segment, gate with a swinging door, feed trough, water trough,
coop and hay bale); and the products (egg, milk bottle, basket of eggs) with their item icons.
Geometry is generated as vertex/face lists with the helpers of build_weapons.py (the pets use
the same eyes and decals), so every piece keeps a hand-tuned triangle budget. All designs are
original. See CONTRACT.md, "Farm pen".

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_farm.py -- [--install] [--render] [--debug DIR]

Outputs:
    art/generated/kit/models/farm.glb              one top-level node per piece
    art/generated/kit/farm-manifest.json           per piece: triangles, bounds, parts, pivots, materials
    art/generated/kit/icons/items/<id>.webp        egg, milk, egg_basket (160 x 160, transparent, < 8 KB)
    art/previews/kit/farm.webp, farm-pen.webp, farm-poses.webp, farm-icons.webp   (with --render)
--install copies farm.glb to public/assets/models/, the icons to public/assets/icons/items/ and the
manifest into art/asset-manifest.json (key "farm").
--debug DIR writes close-up renders of every piece to DIR.

Blender is Z up with -Y as the front; glTF exports are Y up with +Z as the front, in metres. Each
piece's origin is its own ground centre. Output is deterministic (triangulated, sorted faces), and
the build exits non-zero when any piece breaks the contract (names, parts, budgets, ground, size,
footprint, materials) or the GLB grows past its limit.
"""
import bpy
import json
import math
import os
import shutil
import sys
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import game_camera, mat, render, reset_scene  # noqa: E402
from build_weapons import (Geo, Piece, triangulate, xf, scl, facing, sweep, lathe, sphere, cyl, cone,  # noqa: E402
                           tube, bez, sec_super, slab, ellipse_outline, leaf_outline, ell_point, decal, add_eye,
                           surface_arc, ccw, new_empty, _eye_height)
import build_items  # noqa: E402
import build_wilds  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
ICONS = os.path.join(GEN, 'icons', 'items')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'farm-manifest.json')
ASSET_MANIFEST = os.path.join(REPO, 'art', 'asset-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')
HERO_GLB = os.path.join(PUBLIC_MODELS, 'hero.glb')
GLB_NAME = 'farm.glb'
GLB_LIMIT = 320 * 1024
ICON_SIZE, ICON_LIMIT = 160, 8 * 1024

ANIMALS = ['chicken', 'chick', 'cow', 'calf']
PROPS = ['pen_fence', 'pen_gate', 'feed_trough', 'water_trough', 'coop', 'hay_bale']
PRODUCTS = ['egg', 'milk', 'egg_basket']
FARM_IDS = ANIMALS + PROPS + PRODUCTS
BIRD_PARTS = ['body', 'head', 'wing_l', 'wing_r', 'leg_l', 'leg_r', 'tail']
HOOF_PARTS = ['body', 'head', 'leg_fl', 'leg_fr', 'leg_bl', 'leg_br', 'tail']
PARTS = dict(chicken=BIRD_PARTS, chick=BIRD_PARTS, cow=HOOF_PARTS, calf=HOOF_PARTS, pen_gate=['frame', 'door'])
BUDGET = dict(animal=2600, prop=800, product=300)  # animals: 1,500 until the October realism pass
KIND = {**{i: 'animal' for i in ANIMALS}, **{i: 'prop' for i in PROPS}, **{i: 'product' for i in PRODUCTS}}
# Height (top, metres) and footprint (half extents x, y) each piece must stay within (+-12 %).
SIZE = dict(
    chicken=dict(h=0.55, half=(0.2, 0.3)), chick=dict(h=0.29, half=(0.12, 0.17)),
    cow=dict(h=1.72, half=(0.48, 1.12)), calf=dict(h=1.12, half=(0.34, 0.78)),
    pen_fence=dict(h=0.98, half=(1.07, 0.07)), pen_gate=dict(h=1.7, half=(1.1, 0.11)),
    feed_trough=dict(h=0.5, half=(0.62, 0.31)), water_trough=dict(h=0.45, half=(0.64, 0.42)),
    coop=dict(h=1.8, half=(0.9, 0.9)), hay_bale=dict(h=0.55, half=(0.56, 0.3)),
    egg=dict(h=0.12, half=(0.045, 0.045)), milk=dict(h=0.3, half=(0.075, 0.075)),
    egg_basket=dict(h=0.3, half=(0.17, 0.17)),
)
TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))


# =============================================================== materials
def FM(name, color, rough=0.5, metal=0.0):
    """Shared 'Farm <name>' materials: flat colours, single sided (every part is closed or a decal)."""
    m = mat('Farm ' + name, color, rough, metal)
    m.use_backface_culling = True
    return m


def farm_materials():
    c = dict(
        feather='#FFFCF2', comb='#F0393F', beak='#FFB020', leg='#FF8A2A', chick='#FFD640', chick_wing='#FFC21F',
        eye='#1C1B2E', glint='#FFFFFF', blush='#FF8FB0',
        cow='#FFFAF0', patch='#3B3440', muzzle='#FFB3C2', nostril='#C2506A', hoof='#5A3C2E', horn='#FFE8B8',
        bell='#F5B21E', strap='#E8335A', calf='#E89A52',
        wood='#C77A3A', wood_light='#E8A85E', wood_dark='#8A4B25', red='#E8423A', trim='#FFF6E6',
        thatch='#F2B33D', thatch_dark='#D98B1F', hay='#FFCF4A', hay_dark='#E8A22A', twine='#D8343B',
        grain='#FFC83A', water='#38B8F2', iron='#5B6477', door='#5A2E1C',
        egg='#FFF0D6', speckle='#E3A05A', milk='#FFFFFF', glass='#BDEBFF', cap='#2F9BEF', label='#EF3B3B',
        wicker='#D98B1F', wicker_light='#F7BE4E',
    )
    names = dict(feather='feather', comb='comb', beak='beak', leg='bird leg', chick='chick', chick_wing='chick wing',
                 eye='eye', glint='eye glint', blush='blush', cow='cow', patch='cow patch', muzzle='muzzle',
                 nostril='nostril', hoof='hoof', horn='horn', bell='bell', strap='strap', calf='calf',
                 wood='wood', wood_light='wood light', wood_dark='wood dark', red='barn red', trim='trim',
                 thatch='thatch', thatch_dark='thatch dark', hay='hay', hay_dark='hay dark', twine='twine',
                 grain='grain', water='water', iron='iron', door='doorway', egg='egg', speckle='egg speckle',
                 milk='milk', glass='glass', cap='bottle cap', label='label', wicker='wicker',
                 wicker_light='wicker light')
    rough = dict(eye=0.15, glint=0.3, water=0.15, glass=0.2, bell=0.3, egg=0.4, milk=0.35, cap=0.35)
    metal = dict(bell=0.25, iron=0.2)
    return {k: FM(names[k], v, rough.get(k, 0.5), metal.get(k, 0.0)) for k, v in c.items()}


# ================================================================ geometry
def rbox(size, centre, axis='z', p=4.0, n=12, bev=0.0, dome=0.0, tag=None):
    """A box with rounded long edges (superellipse section, power p) swept along `axis`; bev chamfers the
    two ends, dome lifts the far end's cap into a low point (post tops)."""
    sx, sy, sz = size
    c = Vector(centre)
    if axis == 'z':
        length, a, b, d, bn = sz, sx / 2, sy / 2, Vector((0, 0, 1)), (0, 1, 0)
    elif axis == 'x':
        length, a, b, d, bn = sx, sy / 2, sz / 2, Vector((1, 0, 0)), (0, 0, 1)
    else:
        length, a, b, d, bn = sy, sx / 2, sz / 2, Vector((0, 1, 0)), (0, 0, 1)
    s, e = c - d * (length / 2), c + d * (length / 2)
    if bev > 0:
        path = [s, s + d * bev, e - d * bev, e]
        secs = [sec_super(a - bev, b - bev, n, p), sec_super(a, b, n, p), sec_super(a, b, n, p),
                sec_super(a - bev, b - bev, n, p)]
    else:
        path, secs = [s, e], [sec_super(a, b, n, p)] * 2
    g = sweep(path, secs, bn, tag, 0.0, dome).outward()
    # Flat caps shade flat (a smooth fan shows a star).
    caps = {len(g.verts) - 1, len(g.verts) - 2}
    g.flat = [fl or (not dome and bool(caps & set(fc))) or (dome and len(g.verts) - 2 in fc) for fc, fl in zip(g.faces, g.flat)]
    return g


def about(centre, rot):
    """Rotate about a point."""
    c = Vector(centre)
    return Matrix.Translation(c) @ xf((0, 0, 0), rot) @ Matrix.Translation(-c)


def frame_xz(loc, rot_y=0.0):
    """Local XY -> world XZ (an outline drawn front-on), local Z -> world -Y (toward the viewer)."""
    return Matrix.Translation(Vector(loc)) @ xf((0, 0, 0), (RAD(90), rot_y, 0))


def arch_outline(w, h, n=6):
    """A door: a rectangle w wide with a round top, total height h, bottom at y = 0."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    return pts


def blob_outline(r, n=10, phase=0.0, wobble=0.18):
    return [(r * (1 + wobble * math.sin(3 * TAU * i / n + phase) + 0.08 * math.sin(5 * TAU * i / n + 2 * phase))
             * math.cos(TAU * i / n), r * (1 + wobble * math.sin(3 * TAU * i / n + phase)
                                            + 0.08 * math.sin(5 * TAU * i / n + 2 * phase)) * math.sin(TAU * i / n))
            for i in range(n)]


class Surface:
    """Ray-casts onto a closed shape so patches (cow spots, egg speckles) hug any convex surface."""

    def __init__(self, geo, centre):
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in geo.verts], [list(f) for f in geo.faces])
        self.c = Vector(centre)

    def hit(self, origin, direction):
        loc, nrm, _i, _d = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized())
        return loc, nrm

    def point(self, direction):
        d = Vector(direction).normalized()
        return self.hit(self.c + d * 6.0, -d)

    def patch(self, piece, direction, r, material, n=10, lift=0.005, phase=0.0, wobble=0.18, squash=1.0, spin=0.0):
        """A wobbly round patch centred where `direction` (from the centre) meets the surface."""
        p0, n0 = self.point(direction)
        fr = facing(p0, n0, UP if abs(n0.z) < 0.95 else Vector((0, -1, 0)), spin)
        x, y = fr.col[0].xyz, fr.col[1].xyz
        outline = [(px, py * squash) for px, py in ccw(blob_outline(r, n, phase, wobble))]
        rings = []
        for k in (0.5, 1.0):
            ring = []
            for px, py in outline:
                q = p0 + x * px * k + y * py * k
                h, hn = self.hit(q + n0 * 0.5, -n0)
                if h is None:
                    h, hn = q, n0
                ring.append(h + hn * lift)
            rings.append(ring)
        verts = [p0 + n0 * lift] + rings[0] + rings[1]
        faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
        faces += [(1 + i, 1 + n + i, 1 + n + (i + 1) % n, 1 + (i + 1) % n) for i in range(n)]
        g = Geo(verts, faces)
        fn = (g.verts[1] - g.verts[0]).cross(g.verts[2] - g.verts[0])
        if fn.dot(n0) < 0:
            g = g.flipped()
        piece.add(g, material)


def side_plate(centre, length_dir, outward, rx, ry, thick, n=10):
    """A pillowy ellipse (wing) lying against a body side: local Y along length_dir, thickness along outward."""
    g = slab(ellipse_outline(rx, ry, n), thick, bev=thick * 0.3, cap='fan')
    m = facing(centre, outward, length_dir)
    return g.transformed(m).outward()


class BodySurface(Surface):
    """The cattle body as an implicit surface (the smooth shape its sections sample), so spots follow the
    curve instead of the mesh facets and shade smoothly."""

    def __init__(self, yc, L, A, C, Z, p=2.6):
        self.c = Vector((0, yc, Z))
        self.yc, self.L, self.A, self.C, self.Z, self.p = yc, L, A, C, Z, p

    def f(self, v):
        t = (v.y - self.yc) / self.L
        if abs(t) >= 1:
            return 9.0
        k = (1 - abs(t) ** 3) ** (1 / 3)
        return abs(v.x / (self.A * k)) ** self.p + abs((v.z - self.Z) / (self.C * k)) ** self.p

    def hit(self, origin, direction):
        o, d = Vector(origin), Vector(direction).normalized()
        lo, hi = 0.0, 12.0
        if self.f(o) < 1:
            return None, None
        # March to the first inside sample, then bisect the crossing.
        step, s = 0.01, 0.0
        while s < hi and self.f(o + d * s) >= 1:
            s += step
        if s >= hi:
            return None, None
        lo, hi = s - step, s
        for _ in range(30):
            mid = (lo + hi) / 2
            if self.f(o + d * mid) >= 1:
                lo = mid
            else:
                hi = mid
        p = o + d * hi
        e = 1e-4
        g = Vector(((self.f(p + Vector((e, 0, 0))) - self.f(p - Vector((e, 0, 0)))),
                    (self.f(p + Vector((0, e, 0))) - self.f(p - Vector((0, e, 0)))),
                    (self.f(p + Vector((0, 0, e))) - self.f(p - Vector((0, 0, e))))))
        return p, g.normalized()


def eye_pair(piece, c, radii, direction, r, m, squash=1.2, segs=8):
    """The pets' chibi eyes (build_weapons.add_eye) with only the big upper glint, to save triangles."""
    for side in (-1, 1):
        d = Vector((side * direction[0], direction[1], direction[2]))
        p, nrm = ell_point(c, radii, d)
        add_eye(piece, p, nrm, r, m['eye'], m['glint'], squash=squash, segs=segs, glint=False)
        base = Vector(p) - nrm * r * 0.1
        frame = facing(base, nrm, UP) @ scl(1.0, squash, 1.0)
        gx, gy, gr = -0.3, 0.34, 0.36
        z = r * _eye_height(math.hypot(gx, gy))
        g = lathe([(gr * r, 0.0), (0.6 * gr * r, 0.04 * r), (0.0, 0.06 * r)], 6, cap_bottom=0.0).outward()
        piece.add(g, m['glint'], frame @ Matrix.Translation(Vector((gx * r, gy * r, z - 0.02 * r))))


def blush_pair(piece, c, radii, direction, r, m):
    for side in (-1, 1):
        decal(piece, c, radii, (side * direction[0], direction[1], direction[2]), r * 1.3, r * 0.8, m['blush'],
              lift=0.003, n=8)


def smile(piece, c, radii, direction, width, thick, material):
    pts, n0 = surface_arc(c, radii, direction, width, width * 0.45, n=5, lift=thick * 0.6)
    piece.add(tube(pts, thick, sides=4, cap=thick * 0.5, binormal=n0), material)


# ================================================================ models
class Model:
    """A piece: one mesh, or (animals and the gate) a root empty with one child mesh per named part whose
    origin is the part's pivot."""

    def __init__(self, pid, pivots=None):
        self.id = pid
        self.pivots = {k: Vector(tuple(round(c, 4) for c in v)) for k, v in (pivots or {}).items()}
        self.pieces = {k: Piece(f'{pid}_{k}') for k in self.pivots} if pivots else {None: Piece(pid)}

    def __getitem__(self, part):
        return self.pieces[part]

    def realise(self, centre=False):
        if None in self.pieces:
            piece = self.pieces[None]
            if centre:
                xs = [v.x for v in piece.verts]
                ys = [v.y for v in piece.verts]
                off = Vector((round((min(xs) + max(xs)) / 2, 4), round((min(ys) + max(ys)) / 2, 4), 0))
                piece.verts = [v - off for v in piece.verts]
            obj = triangulate(piece.build(sharp=80))
            return dict(id=self.id, root=obj, parts={}, meshes=[obj])
        root = new_empty(self.id, 0.3)
        parts = {}
        for name in PARTS[self.id]:
            pv = self.pivots[name]
            obj = triangulate(self.pieces[name].build(offset=pv, sharp=80))
            obj.parent = root
            obj.location = pv
            parts[name] = obj
        return dict(id=self.id, root=root, parts=parts, meshes=[parts[n] for n in PARTS[self.id]])


# ------------------------------------------------------------------ birds
def build_bird(pid, m, s):
    """Hen and chick share one build: an egg-shaped body, a round head with big eyes, pillowy wings,
    a tail (hen: three upright feathers; chick: a fluffy point) and thin legs with three toes."""
    k = s['k']
    B, BR = Vector(s['body']), s['body_r']
    H, HR = Vector(s['head']), s['head_r']
    hip_x, hip = s['hip_x'], Vector(s['hip'])
    wing_root = Vector(s['wing_root'])
    piv = dict(body=(0, hip.y, hip.z), head=s['neck'], wing_r=wing_root, wing_l=(-wing_root.x, wing_root.y, wing_root.z),
               leg_r=(hip_x, hip.y, hip.z), leg_l=(-hip_x, hip.y, hip.z), tail=s['tail_root'])
    M = Model(pid, piv)
    plume, wingm = m[s['plume']], m[s['wing_mat']]
    # Body: an egg tipped so the tail end rides higher.
    body_g = sphere(1.0, 12, 8, scale=BR).transformed(xf(B, (RAD(s['tilt']), 0, 0)))
    M['body'].add(body_g, plume)
    if s.get('bib'):
        M['body'].add(sphere(1.0, 8, 5, scale=s['bib'][1]).moved(s['bib'][0]), plume)
    # Head.
    M['head'].add(sphere(1.0, 14, 9, scale=HR).moved(H), plume)
    eye_pair(M['head'], H, HR, s['eye_dir'], s['eye_r'], m, squash=1.25)
    blush_pair(M['head'], H, HR, s['blush_dir'], s['eye_r'] * 0.8, m)
    bp, bn = ell_point(H, HR, (0, -1, s['beak_z']))
    blen = s['beak_len']
    M['head'].add(cone(bp - bn * blen * 0.25, bp + Vector((0, -blen, -blen * 0.12)), s['beak_r'], 6), m['beak'])
    if s.get('comb'):
        for dy, dz, r in ((-0.045, -0.006, 0.026), (0.0, 0.006, 0.031), (0.045, -0.006, 0.027)):
            p, _ = ell_point(H, HR, (0, -0.25 + dy * 6, 1))
            M['head'].add(sphere(1.0, 6, 4, scale=(r * 0.75, r * 1.0, r * 1.25)).moved(p + Vector((0, 0, dz + r * 0.6))),
                          m['comb'])
        wp, _ = ell_point(H, HR, (0, -1, -0.55))
        M['head'].add(sphere(1.0, 6, 4, scale=(0.02, 0.019, 0.03)).moved(wp + Vector((0, -0.012, -0.022))), m['comb'])
    if s.get('tuft'):
        top, _ = ell_point(H, HR, (0, -0.1, 1))
        for ang in (-0.35, 0.3):
            g = slab(leaf_outline(0.05, 0.026, 4), 0.012, bev=0.004, dome=0.002)
            M['head'].add(g, plume, facing(top - Vector((0, 0, 0.01)), (1, 0, 0), (0, math.sin(ang), math.cos(ang))))
    # Wings: the right wing (+X) and its mirror, each with its origin at the shoulder.
    wl = Vector(s['wing_dir']).normalized()
    g = side_plate(Vector(s['wing_c']), wl, Vector((1, 0, 0.18)).normalized(), s['wing_r'][0], s['wing_r'][1],
                   s['wing_t'])
    M['wing_r'].add(g, wingm)
    M['wing_l'].add(g.mirrored(), wingm)
    # Tail.
    tr = Vector(s['tail_root'])
    if s.get('feathers'):
        for ang, ln, dx in s['feathers']:
            d = Vector((0, math.sin(RAD(ang)), math.cos(RAD(ang))))
            g = slab(leaf_outline(ln, ln * 0.5, 4), 0.03 * k, bev=0.008, dome=0.003)
            M['tail'].add(g, plume, facing(tr + Vector((dx, 0, 0)), (1, 0, 0), d))
    else:
        M['tail'].add(cone(tr - Vector((0, 0.02, 0.0)), tr + Vector((0, 0.065, 0.045)), 0.032, 7), plume)
    # Legs and toes, single material each.
    for side, name in ((1, 'leg_r'), (-1, 'leg_l')):
        x = side * hip_x
        top = Vector((x, hip.y, hip.z + 0.02 * k))
        ankle = Vector((x, hip.y - 0.015 * k, s['toe_r'] * 1.1))
        M[name].add(cyl(top, ankle, s['leg_r'], s['leg_r'] * 0.9, sides=6, cap=0.0), m['leg'])
        tl, tr_ = s['toe_len'], s['toe_r']
        for dx, dy in ((-0.6, -1.0), (0.0, -1.12), (0.6, -1.0), (0.0, 0.7)):
            tip = ankle + Vector((dx * tl * 0.55, dy * tl, -0.1 * tr_))
            M[name].add(cyl(ankle, tip, tr_, tr_ * 0.8, sides=5, cap=tr_ * 0.6), m['leg'])
    return M


HEN = dict(k=1.0, body=(0, 0.03, 0.255), body_r=(0.15, 0.19, 0.15), tilt=12,
           bib=((0, -0.09, 0.27), (0.11, 0.08, 0.11)),
           head=(0, -0.12, 0.42), head_r=(0.105, 0.1, 0.1), neck=(0, -0.08, 0.34),
           eye_dir=(0.52, -0.8, 0.18), eye_r=0.031, blush_dir=(0.72, -0.6, -0.14), beak_z=-0.08, beak_len=0.06,
           beak_r=0.03, comb=True, plume='feather', wing_mat='feather',
           wing_root=(0.135, -0.03, 0.31), wing_c=(0.158, 0.05, 0.25), wing_dir=(0, 1, -0.5), wing_r=(0.07, 0.12),
           wing_t=0.036, tail_root=(0, 0.19, 0.31), feathers=((12, 0.15, -0.014), (36, 0.17, 0.0), (60, 0.14, 0.014)),
           hip_x=0.062, hip=(0, 0.04, 0.13), leg_r=0.017, toe_r=0.012, toe_len=0.07)
CHICK = dict(k=0.6, body=(0, 0.01, 0.12), body_r=(0.1, 0.11, 0.095), tilt=6, bib=None,
             head=(0, -0.055, 0.205), head_r=(0.08, 0.076, 0.074), neck=(0, -0.03, 0.16),
             eye_dir=(0.5, -0.82, 0.12), eye_r=0.022, blush_dir=(0.7, -0.62, -0.18), beak_z=-0.12, beak_len=0.038,
             beak_r=0.02, comb=False, tuft=True, plume='chick', wing_mat='chick_wing',
             wing_root=(0.09, -0.005, 0.14), wing_c=(0.1, 0.03, 0.115), wing_dir=(0, 1, -0.35), wing_r=(0.042, 0.06),
             wing_t=0.026, tail_root=(0, 0.1, 0.13), feathers=None,
             hip_x=0.042, hip=(0, 0.02, 0.05), leg_r=0.011, toe_r=0.0085, toe_len=0.038)


# ----------------------------------------------------------------- cattle
def build_bovine(pid, m, s):
    """Cow and calf share one build: a rounded-box body, a big round head with a pink muzzle, ears, a bell
    (cow) and four legs with hooves; spots hug the body through ray-casts."""
    coat, spot = m[s['coat']], m[s['spot']]
    L, yc, A, C, Z = s['L'], s['yc'], s['A'], s['C'], s['Z']
    H, HR = Vector(s['head']), s['head_r']
    lx, lyf, lyb, hz = s['leg_x'], s['leg_yf'], s['leg_yb'], s['hip_z']
    piv = dict(body=(0, yc, hz), head=s['neck'], leg_fl=(-lx, lyf, hz), leg_fr=(lx, lyf, hz), leg_bl=(-lx, lyb, hz),
               leg_br=(lx, lyb, hz), tail=s['tail_root'])
    M = Model(pid, piv)
    # Body: superellipse sections along Y, rounded off at both ends.
    ts = (-1.0, -0.93, -0.74, -0.36, 0.36, 0.74, 0.93, 1.0)
    path, secs = [], []
    for t in ts:
        f = (1 - abs(t) ** 3) ** (1 / 3)
        path.append(Vector((0, yc + t * L, Z)))
        secs.append([(0.0, 0.0)] if f < 1e-4 else sec_super(A * f, C * f, 16, 2.6))
    body = sweep(path, secs, (0, 0, 1), None, None, None).outward()
    M['body'].add(body, coat)
    surf = BodySurface(yc, L, A, C, Z)
    for d, r, ph, sq in s['spots']:
        surf.patch(M['body'], d, r, spot, n=10, lift=0.012, phase=ph, wobble=0.12, squash=sq)
    if s.get('udder'):
        u = Vector((0, yc + L * 0.45, Z - C * 0.93))
        M['body'].add(sphere(1.0, 6, 4, scale=s['udder']).moved(u), m['muzzle'])
    # Head: round skull, wide muzzle, eyes, ears, horns, a forelock and (cow) a bell under the chin.
    hk = s['head_k']
    M['head'].add(sphere(1.0, 14, 8, scale=HR).moved(H), coat)
    MZ = H + Vector((0, -HR[1] * 0.78, -HR[2] * 0.36))
    MR = (HR[0] * 0.8, HR[1] * 0.5, HR[2] * 0.52)
    M['head'].add(sphere(1.0, 10, 6, scale=MR).moved(MZ), m['muzzle'])
    for side in (-1, 1):
        decal(M['head'], MZ, MR, (side * 0.42, -1, 0.3), 0.03 * hk, 0.02 * hk, m['nostril'], lift=0.003, n=7)
    smile(M['head'], MZ, MR, (0, -0.8, -0.62), 0.07 * hk, 0.008 * hk, m['nostril'])
    if s.get('head_spot'):
        decal(M['head'], H, HR, s['head_spot'], 0.13 * hk, 0.1 * hk, spot, lift=0.003, n=10, spin=0.4)
    eye_pair(M['head'], H, HR, (0.44, -0.8, 0.34), 0.06 * hk, m, squash=1.25)
    blush_pair(M['head'], H, HR, (0.7, -0.6, 0.02), 0.045 * hk, m)
    for side in (-1, 1):
        ear = sphere(1.0, 6, 4, scale=(0.13 * hk, 0.05 * hk, 0.07 * hk))
        M['head'].add(ear, coat,
                      xf(H + Vector((side * HR[0] * 1.08, HR[1] * 0.12, HR[2] * 0.22)), (0, side * RAD(-22), side * RAD(8))))
        if s.get('horns'):
            base = H + Vector((side * HR[0] * 0.5, HR[1] * 0.05, HR[2] * 0.78))
            pts = bez([base, base + Vector((side * 0.07, 0, 0.08)) * hk, base + Vector((side * 0.13, 0.02, 0.11)) * hk], 3)
            M['head'].add(tube(pts, [0.05 * hk, 0.035 * hk, 0.014 * hk], sides=5, cap=0.012 * hk), m['horn'])
        elif s.get('nubs'):
            base = H + Vector((side * HR[0] * 0.48, HR[1] * 0.05, HR[2] * 0.82))
            M['head'].add(sphere(1.0, 6, 4, scale=(0.03, 0.03, 0.025)).moved(base), m['horn'])
    if s.get('forelock'):
        top, _ = ell_point(H, HR, (0, -0.2, 1))
        for dx, r in ((-0.05, 0.05), (0.04, 0.055), (0.0, 0.045)):
            M['head'].add(sphere(1.0, 6, 4, scale=(r * hk, r * 0.9 * hk, r * 0.75 * hk)).moved(
                top + Vector((dx * hk, -0.02 * hk if dx else -0.06 * hk, 0.0))), m[s['forelock']])
    if s.get('bell'):
        bc = H + Vector((0, -HR[1] * 0.2, -HR[2] * 1.06))
        M['head'].add(cyl(bc + Vector((0, 0.0, 0.1)), bc + Vector((0, 0, 0.02)), 0.022, sides=5, cap=0.0), m['strap'])
        prof = [(0.0, 0.0), (0.075, 0.0), (0.07, 0.03), (0.05, 0.07), (0.028, 0.095), (0.0, 0.1)]
        M['head'].add(lathe(prof, 8).outward().moved(bc - Vector((0, 0, 0.08))), m['bell'])
    # Neck filler so the head never floats off the body when it nods (part of the head).
    M['head'].add(sphere(1.0, 8, 5, scale=s['neck_r']).moved(s['neck_c']), coat)
    # Legs: a slightly tapered column into a hoof, with the origin at the hip.
    for name, x, y in (('leg_fl', -lx, lyf), ('leg_fr', lx, lyf), ('leg_bl', -lx, lyb), ('leg_br', lx, lyb)):
        r = s['leg_r']
        hoof_h = s['hoof_h']
        M[name].add(cyl((x, y, hz + 0.1 * hk), (x, y, hoof_h * 0.85), r, r * 0.92, sides=8, cap=0.0),
                    spot if (s.get('sock') and name in s['sock']) else coat)
        M[name].add(cyl((x, y, hoof_h), (x, y, 0.0), r * 0.96, r * 1.05, sides=8, cap=0.0), m['hoof'])
    # Tail: hangs from the rump with a tuft.
    tr = Vector(s['tail_root'])
    tl = s['tail_len']
    pts = bez([tr, tr + Vector((0, 0.12, -0.06)) * tl, tr + Vector((0, 0.16, -0.5)) * tl], 5)
    M['tail'].add(tube(pts, [0.03 * hk, 0.026 * hk, 0.022 * hk, 0.02 * hk, 0.018 * hk], sides=5, cap=0.0), coat)
    M['tail'].add(sphere(1.0, 6, 4, scale=(0.05 * hk, 0.05 * hk, 0.08 * hk)).moved(pts[-1] + Vector((0, 0.005, -0.04 * hk))),
                  spot)
    return M


COW = dict(coat='cow', spot='patch', L=0.68, yc=0.06, A=0.42, C=0.44, Z=0.96,
           head=(0, -0.86, 1.4), head_r=(0.34, 0.29, 0.29), head_k=1.0, neck=(0, -0.6, 1.24),
           neck_c=(0, -0.62, 1.2), neck_r=(0.25, 0.22, 0.24),
           spots=(((1, 0.05, 0.35), 0.22, 0.0, 1.0), ((-1, 0.45, 0.25), 0.2, 1.3, 1.1), ((0.25, -0.35, 1), 0.17, 2.1, 0.9),
                  ((0.4, 1.0, 0.5), 0.15, 3.0, 1.0)),
           head_spot=(-0.55, -0.55, 0.45), udder=(0.15, 0.13, 0.09), horns=True, bell=True, forelock=None,
           leg_x=0.25, leg_yf=-0.36, leg_yb=0.44, hip_z=0.68, leg_r=0.13, hoof_h=0.14,
           tail_root=(0, 0.72, 1.3), tail_len=1.0)
CALF = dict(coat='calf', spot='cow', L=0.42, yc=0.05, A=0.26, C=0.27, Z=0.6,
            head=(0, -0.55, 0.92), head_r=(0.25, 0.215, 0.215), head_k=0.74, neck=(0, -0.38, 0.8),
            neck_c=(0, -0.39, 0.78), neck_r=(0.16, 0.15, 0.16),
            spots=(((0.2, -0.2, 1), 0.12, 0.6, 1.0), ((1, 0.4, 0.2), 0.1, 2.2, 1.0)),
            head_spot=None, forelock='cow', udder=None, horns=False, nubs=True, bell=False,
            leg_x=0.15, leg_yf=-0.21, leg_yb=0.29, hip_z=0.43, leg_r=0.085, hoof_h=0.09,
            tail_root=(0, 0.46, 0.8), tail_len=0.68)


# ------------------------------------------------------------------ props
def build_fence(m):
    """2.0 m segment: posts at x = +-1.0 (shared when segments are laid end to end), two rails."""
    M = Model('pen_fence')
    P = M[None]
    for x in (-1.0, 1.0):
        P.add(rbox((0.13, 0.13, 0.9), (x, 0, 0.45), 'z', 4.0, 8, dome=0.07), m['wood_dark'])
    for z in (0.42, 0.74):
        P.add(rbox((2.0, 0.055, 0.13), (0, 0.0, z), 'x', 4.0, 8), m['wood_light'])
    return M


def build_gate(m):
    """A gate the width of one fence segment: frame (posts, crossbeam, egg sign) and a red barn door that
    swings about its hinge at x = -0.9 (glTF rotation.y)."""
    hinge = Vector((-0.9, 0.0, 0.0))
    M = Model('pen_gate', dict(frame=(0, 0, 0), door=hinge))
    F, D = M['frame'], M['door']
    for x in (-1.0, 1.0):
        F.add(rbox((0.15, 0.15, 1.5), (x, 0, 0.75), 'z', 4.0, 8), m['wood_dark'])
        F.add(sphere(0.1, 8, 5).moved((x, 0, 1.58)), m['red'])
    F.add(rbox((2.16, 0.12, 0.13), (0, 0, 1.36), 'x', 4.0, 8, bev=0.02), m['wood'])
    sign = Vector((0, -0.07, 1.14))
    F.add(rbox((0.62, 0.05, 0.3), sign + Vector((0, 0.01, 0)), 'x', 4.0, 8), m['red'])
    F.add(slab(ellipse_outline(0.075, 0.095, 10), 0.02, bev=0.006, dome=0.006), m['egg'], frame_xz(sign + Vector((0, -0.03, 0))))
    for x in (-0.22, 0.22):
        F.add(cyl((x, -0.04, 1.3), (x, -0.04, 1.28), 0.012, sides=4, cap=0.0), m['iron'])
    # Door: white frame and brace on red slats, 1.8 wide, 0.08..1.0 high.
    for z in (0.14, 0.94):
        D.add(rbox((1.78, 0.07, 0.12), (0.0, 0, z), 'x', 4.0, 8), m['trim'])
    for x in (-0.84, 0.84):
        D.add(rbox((0.11, 0.07, 0.92), (x, 0, 0.54), 'z', 4.0, 8), m['trim'])
    for x in (-0.47, -0.16, 0.16, 0.47):
        D.add(rbox((0.26, 0.045, 0.72), (x, 0.0, 0.54), 'z', 4.0, 8), m['red'])
    ang = math.atan2(0.72, 1.56)
    D.add(rbox((1.72, 0.075, 0.1), (0, 0, 0.54), 'x', 4.0, 8).transformed(about((0, 0, 0.54), (0, -ang, 0))), m['trim'])
    D.add(cyl((0.84, -0.05, 0.6), (0.84, -0.09, 0.6), 0.03, sides=6, cap=0.01), m['iron'])
    return M


def build_feed_trough(m):
    M = Model('feed_trough')
    P = M[None]
    for x in (-0.56, 0.56):
        P.add(rbox((0.08, 0.6, 0.46), (x, 0, 0.23), 'z', 4.0, 8, dome=0.03), m['wood_dark'])
    P.add(rbox((1.06, 0.36, 0.06), (0, 0, 0.27), 'x', 4.0, 8), m['wood'])
    for side in (-1, 1):
        g = rbox((1.1, 0.055, 0.24), (0, side * 0.205, 0.38), 'x', 4.0, 8)
        P.add(g.transformed(about((0, side * 0.205, 0.38), (side * RAD(-14), 0, 0))), m['wood_light'])
    P.add(rbox((1.04, 0.38, 0.1), (0, 0, 0.36), 'x', 3.0, 10), m['grain'])
    for x, y, r in ((-0.33, 0.03, 0.12), (-0.05, -0.04, 0.14), (0.25, 0.04, 0.13)):
        P.add(sphere(1.0, 8, 4, scale=(r * 1.3, r * 0.95, r * 0.42)).moved((x, y, 0.4)), m['grain'])
    return M


def build_water_trough(m):
    """An oval tub of alternating staves with two iron hoops, brimming with water."""
    M = Model('water_trough')
    P = M[None]
    segs, sx = 20, 1.55
    prof = [(0.33, 0.0), (0.36, 0.03), (0.4, 0.4), (0.405, 0.44), (0.35, 0.44), (0.338, 0.39), (0.0, 0.39)]

    def tag(b, s_):
        if b >= 5:
            return 'water'
        if b == 3:
            return 'rim'
        return 'a' if s_ % 2 == 0 else 'b'
    g = lathe(prof, segs, phase=TAU / segs / 2, tag=tag, cap_bottom=0.0).outward()
    P.add(g, {'a': m['wood'], 'b': m['wood_light'], 'rim': m['wood_dark'], 'water': m['water']}, scl(sx, 1, 1))

    def r_at(z):
        return 0.36 + (z - 0.03) / 0.37 * 0.04
    for z0 in (0.1, 0.33):
        r0, r1 = r_at(z0 - 0.03), r_at(z0 + 0.03)
        hoop = lathe([(r0, z0 - 0.03), (r0 + 0.014, z0 - 0.022), (r1 + 0.014, z0 + 0.022), (r1, z0 + 0.03)], segs,
                     phase=TAU / segs / 2)
        P.add(hoop.outward(), m['iron'], scl(sx * (1 + 0.0), 1, 1))
    return M


def build_coop(m):
    """A little red hen house on stilts: gable front with a round window, an arched doorway with a ramp,
    white corner trims and a golden thatch roof."""
    M = Model('coop')
    P = M[None]
    W, Dp, base, wall_h = 1.3, 1.0, 0.3, 0.74
    for x in (-0.52, 0.52):
        for y in (-0.38, 0.38):
            P.add(cyl((x, y, 0.0), (x, y, base), 0.055, sides=6, cap=0.0), m['wood_dark'])
    P.add(rbox((W + 0.08, Dp + 0.08, 0.07), (0, 0, base + 0.035), 'z', 4.0, 12), m['wood_dark'])
    z0 = base + 0.07
    top = z0 + wall_h
    P.add(rbox((W, Dp, wall_h), (0, 0, z0 + wall_h / 2), 'z', 6.0, 12), m['red'])
    for x in (-1, 1):
        for y in (-1, 1):
            P.add(rbox((0.08, 0.08, wall_h + 0.02), (x * W / 2, y * Dp / 2, z0 + wall_h / 2), 'z', 4.0, 6), m['trim'])
    ridge = top + 0.52
    gable = [(-W / 2, 0.0), (W / 2, 0.0), (0.0, ridge - top)]
    g = slab(gable, Dp - 0.04, bev=0.0, cap='ngon')
    P.add(g, m['red'], Matrix.Translation((0, 0, top)) @ xf((0, 0, 0), (RAD(90), 0, 0)))
    # Roof: two chamfered thatch panels and a ridge roll.
    run, rise = W / 2 + 0.2, (ridge - top) * (W / 2 + 0.2) / (W / 2)
    slope = math.hypot(run, rise)
    ang = math.atan2(rise, run)
    for side in (-1, 1):
        mid = Vector((side * run / 2, 0, ridge - rise / 2))
        nrm = Vector((side * math.sin(ang), 0, math.cos(ang)))
        panel = rbox((slope + 0.04, Dp + 0.36, 0.1), (0, 0, 0), 'y', 4.0, 8, bev=0.03)
        P.add(panel, m['thatch'], Matrix.Translation(mid + nrm * 0.05) @ xf((0, 0, 0), (0, side * ang, 0)))
    P.add(cyl((0, -(Dp + 0.42) / 2, ridge + 0.07), (0, (Dp + 0.42) / 2, ridge + 0.07), 0.08, sides=8, cap=0.03),
          m['thatch_dark'])
    # Front: arched doorway with a white frame, a round window and the ramp.
    fy = -Dp / 2
    door_w, door_h = 0.4, 0.5
    P.add(slab(arch_outline(door_w + 0.1, door_h + 0.05, 4), 0.03, bev=0.008, cap='ngon'), m['trim'],
          frame_xz((0, fy - 0.01, z0 + 0.02)))
    P.add(slab(arch_outline(door_w, door_h, 4), 0.03, bev=0.006, cap='ngon'), m['door'], frame_xz((0, fy - 0.025, z0 + 0.04)))
    wz = top + 0.2
    P.add(slab(ellipse_outline(0.12, 0.12, 10), 0.03, bev=0.008), m['trim'], frame_xz((0, fy + 0.03, wz)))
    P.add(slab(ellipse_outline(0.075, 0.075, 8), 0.03, bev=0.006), m['door'], frame_xz((0, fy + 0.015, wz)))
    ramp_top, ramp_bot = Vector((0, fy - 0.05, z0 - 0.01)), Vector((0, fy - 0.6, 0.03))
    d = ramp_bot - ramp_top
    tilt = math.atan2(-d.z, -d.y)
    rc = (ramp_top + ramp_bot) / 2
    P.add(rbox((0.36, d.length + 0.04, 0.05), (0, 0, 0), 'y', 4.0, 8), m['wood'],
          Matrix.Translation(rc) @ xf((0, 0, 0), (tilt, 0, 0)))
    for t in (0.3, 0.7):
        p = ramp_top.lerp(ramp_bot, t) + Vector((0, -math.sin(tilt) * 0.035, math.cos(tilt) * 0.035))
        P.add(rbox((0.32, 0.04, 0.03), (0, 0, 0), 'x', 4.0, 6), m['wood_dark'],
              Matrix.Translation(p) @ xf((0, 0, 0), (tilt, 0, 0)))
    return M


def build_hay_bale(m):
    M = Model('hay_bale')
    P = M[None]
    a, c = 0.275, 0.25

    def tag(b, s_):
        return 'd' if s_ % 4 == 1 and 0 <= b <= 2 else 'h'
    P.add(rbox((1.0, 2 * a, 2 * c), (0, 0, c), 'x', 3.2, 16, bev=0.05, tag=tag),
          {'h': m['hay'], 'd': m['hay_dark']})
    for x in (-0.26, 0.26):
        path = [Vector((x - 0.026, 0, c)), Vector((x - 0.02, 0, c)), Vector((x + 0.02, 0, c)), Vector((x + 0.026, 0, c))]
        secs = [sec_super(a - 0.002, c - 0.002, 16, 3.2), sec_super(a + 0.012, c + 0.012, 16, 3.2),
                sec_super(a + 0.012, c + 0.012, 16, 3.2), sec_super(a - 0.002, c - 0.002, 16, 3.2)]
        P.add(sweep(path, secs, (0, 0, 1), None, None, None).outward(), m['twine'])
    for x, y, z, dx, dz in ((0.5, 0.1, 0.32, 0.07, 0.03), (0.5, -0.12, 0.18, 0.06, -0.02), (-0.5, 0.0, 0.3, -0.07, 0.04),
                            (-0.5, -0.14, 0.14, -0.06, -0.01), (0.12, -0.04, 0.5, 0.03, 0.06),
                            (-0.2, 0.08, 0.5, -0.02, 0.06)):
        P.add(cone((x, y, z), (x + dx, y, z + dz), 0.03, 4), m['hay_dark'])
    return M


# --------------------------------------------------------------- products
def egg_geo(h, r, segs, rings):
    prof = [(0.0, 0.0)]
    for i in range(1, rings):
        t = math.pi * i / rings
        prof.append((r * math.sin(t) * (1 + 0.1 * math.cos(t)), h / 2 * (1 - math.cos(t))))
    prof.append((0.0, h))
    return lathe(prof, segs).outward()


def build_egg(m):
    M = Model('egg')
    g = egg_geo(0.12, 0.045, 12, 7)
    M[None].add(g, m['egg'])
    surf = Surface(g, (0, 0, 0.06))
    for d, r, ph in (((1, -0.6, 0.5), 0.008, 0.3), ((-0.7, -0.9, 0.1), 0.006, 1.2), ((0.1, -1, -0.4), 0.007, 2.0),
                     ((-0.3, -0.7, 0.85), 0.005, 2.7)):
        surf.patch(M[None], d, r, m['speckle'], n=6, lift=0.0015, phase=ph)
    return M


def build_milk(m):
    """A glass milk bottle: milk up to the shoulder, clear neck, a red label band and a blue cap."""
    M = Model('milk')
    P = M[None]
    prof = [(0.0, 0.0), (0.06, 0.0), (0.069, 0.01), (0.072, 0.03), (0.072, 0.165), (0.064, 0.2), (0.046, 0.232),
            (0.038, 0.252), (0.038, 0.268), (0.0, 0.268)]

    def tag(b, s_):
        return 'milk' if b <= 4 else 'glass'
    P.add(lathe(prof, 10, tag=tag).outward(), {'milk': m['milk'], 'glass': m['glass']})
    P.add(lathe([(0.072, 0.07), (0.0755, 0.075), (0.0755, 0.135), (0.072, 0.14)], 10).outward(), m['label'])
    P.add(lathe([(0.0, 0.25), (0.043, 0.25), (0.045, 0.285), (0.034, 0.298), (0.0, 0.3)], 10).outward(), m['cap'])
    return M


def build_egg_basket(m):
    """A woven basket (checkered weave) with three eggs and an arched handle."""
    M = Model('egg_basket')
    P = M[None]
    prof = [(0.0, 0.0), (0.12, 0.0), (0.152, 0.07), (0.165, 0.11), (0.168, 0.125), (0.15, 0.125),
            (0.13, 0.06), (0.0, 0.06)]

    def tag(b, s_):
        if b in (3, 4):
            return 'l'
        if b >= 5:
            return 'd'
        return 'l' if (b + s_) % 2 else 'd'
    P.add(lathe(prof, 10, phase=TAU / 20, tag=tag).outward(), {'l': m['wicker_light'], 'd': m['wicker']})
    for x, y, z, rx, ry in ((-0.055, 0.03, 0.05, RAD(18), RAD(-25)), (0.06, 0.035, 0.05, RAD(15), RAD(28)),
                            (0.0, -0.055, 0.045, RAD(-26), RAD(4))):
        P.add(egg_geo(0.11, 0.041, 7, 4), m['egg'], xf((x, y, z), (rx, ry, 0)))
    pts = bez([(-0.158, 0, 0.11), (-0.17, 0, 0.36), (0.17, 0, 0.36), (0.158, 0, 0.11)], 6)
    P.add(tube(pts, 0.013, sides=4, cap=0.0, binormal=(0, 1, 0)), m['wicker'])
    return M


BUILDERS = dict(
    chicken=lambda m: build_bird('chicken', m, HEN), chick=lambda m: build_bird('chick', m, CHICK),
    cow=lambda m: build_bovine('cow', m, COW), calf=lambda m: build_bovine('calf', m, CALF),
    pen_fence=build_fence, pen_gate=build_gate, feed_trough=build_feed_trough, water_trough=build_water_trough,
    coop=build_coop, hay_bale=build_hay_bale, egg=build_egg, milk=build_milk, egg_basket=build_egg_basket,
)
ICON_VIEW = dict(egg=dict(elevation=26, yaw=24, margin=1.22), milk=dict(elevation=20, yaw=24, margin=1.18),
                 egg_basket=dict(elevation=34, yaw=20, margin=1.14))


def build_all():
    m = farm_materials()
    out = {}
    for pid in FARM_IDS:
        model = BUILDERS[pid](m)
        out[pid] = model.realise(centre=KIND[pid] == 'prop')
        out[pid]['model'] = model
    return out


# ================================================================ checks
def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def r4(v):
    return [round(c, 4) for c in v]


def gltf_vec(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def piece_stats(e):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in e['meshes'] for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    mats = sorted({mm.name for o in e['meshes'] for mm in o.data.materials})
    s = dict(kind=KIND[e['id']], triangles=sum(mesh_tris(o) for o in e['meshes']), budget=BUDGET[KIND[e['id']]],
             materials=mats, bounds=dict(min=r4(lo), max=r4(hi), size=r4([hi[i] - lo[i] for i in range(3)])))
    s['bounds_gltf'] = dict(min=[s['bounds']['min'][0], s['bounds']['min'][2], round(-hi[1], 4)],
                            max=[s['bounds']['max'][0], s['bounds']['max'][2], round(-lo[1], 4)])
    if e['parts']:
        s['parts'] = {}
        for name in PARTS[e['id']]:
            o = e['parts'][name]
            s['parts'][name] = dict(node=o.name, triangles=mesh_tris(o), materials=[mm.name for mm in o.data.materials],
                                    pivot=r4(o.location), pivot_gltf=gltf_vec(o.location))
    return s


def check_piece(e, s):
    pid = e['id']
    errs = []
    lim = SIZE[pid]
    lo, hi = s['bounds']['min'], s['bounds']['max']
    if s['triangles'] > s['budget']:
        errs.append(f"{s['triangles']} triangles > {s['budget']}")
    if abs(lo[2]) > 0.02:
        errs.append(f'ground: min z {lo[2]} not within +-0.02')
    if not 0.88 * lim['h'] <= hi[2] <= 1.12 * lim['h']:
        errs.append(f"height {hi[2]} outside 0.88..1.12 x {lim['h']}")
    hx, hy = max(abs(lo[0]), abs(hi[0])), max(abs(lo[1]), abs(hi[1]))
    if hx > 1.12 * lim['half'][0] or hy > 1.12 * lim['half'][1]:
        errs.append(f"half extents {hx:.3f} x {hy:.3f} over 1.12 x {lim['half']}")
    for axis in (0, 1):
        mid, half = (lo[axis] + hi[axis]) / 2, (hi[axis] - lo[axis]) / 2
        if abs(mid) > max(0.02, 0.2 * half):
            errs.append(f"footprint centre {'xy'[axis]} {mid:.3f} is off the origin")
    bad = [n for n in s['materials'] if not n.startswith('Farm ')]
    if bad:
        errs.append(f'materials not named "Farm <name>": {bad}')
    if len(s['materials']) > 12:
        errs.append(f"{len(s['materials'])} materials (> 12)")
    root = e['root']
    if tuple(root.location) != (0, 0, 0) or tuple(root.rotation_euler) != (0, 0, 0) or tuple(root.scale) != (1, 1, 1):
        errs.append('root transform is not identity')
    for o in e['meshes']:
        if o.data.name != o.name:
            errs.append(f'mesh data {o.data.name} != object {o.name}')
        if tuple(o.rotation_euler) != (0, 0, 0) or tuple(o.scale) != (1, 1, 1):
            errs.append(f'{o.name} is rotated or scaled')
    if e['parts']:
        names = sorted(o.name for o in root.children)
        want = sorted(f'{pid}_{p}' for p in PARTS[pid])
        if names != want:
            errs.append(f'parts {names} != {want}')
    if KIND[pid] == 'animal':
        head, body = e['parts']['head'], e['parts']['body']
        hy = min((head.matrix_world @ v.co).y for v in head.data.vertices)
        by = min((body.matrix_world @ v.co).y for v in body.data.vertices)
        if hy >= by:
            errs.append('the head is not in front of the body (front is -Y)')
        for name in PARTS[pid]:
            if name.startswith(('leg', 'wing', 'tail')) and s['parts'][name]['triangles'] == 0:
                errs.append(f'{name} is empty')
    return errs


def check_glb(path, stats):
    doc = build_wilds.read_glb_json(path)
    errs = []
    nodes = doc['nodes']
    roots = [nodes[i] for i in doc['scenes'][doc.get('scene', 0)]['nodes']]
    names = sorted(n.get('name') for n in roots)
    if names != sorted(FARM_IDS):
        errs.append(f'GLB top-level nodes {names} != {sorted(FARM_IDS)}')
    for node in roots:
        pid = node.get('name')
        if any(k in node for k in ('translation', 'rotation', 'scale', 'matrix')):
            errs.append(f'GLB node {pid} has a transform')
        if pid in PARTS:
            kids = sorted(nodes[i].get('name') for i in node.get('children', []))
            if kids != sorted(f'{pid}_{p}' for p in PARTS[pid]):
                errs.append(f'GLB node {pid} children {kids}')
            for i in node.get('children', []):
                ch = nodes[i]
                part = ch['name'][len(pid) + 1:]
                want = stats[pid]['parts'][part]['pivot_gltf']
                got = ch.get('translation', [0, 0, 0])
                if any(abs(a - b) > 1e-3 for a, b in zip(got, want)) or 'rotation' in ch or 'scale' in ch:
                    errs.append(f"GLB part {ch['name']} transform {got} != pivot {want}")
        elif 'children' in node or 'mesh' not in node:
            errs.append(f'GLB node {pid} should be a single mesh')
    for gm in doc.get('materials', []):
        if any(gm.get('emissiveFactor', [0, 0, 0])):
            errs.append(f"GLB material {gm['name']} is emissive")
        if not gm['name'].startswith('Farm '):
            errs.append(f"GLB material {gm['name']} is not a Farm material")
    if doc.get('images') or doc.get('textures'):
        errs.append('GLB has textures')
    return errs


def export(entries, path):
    objs = []
    for pid in FARM_IDS:
        objs.append(entries[pid]['root'])
        objs += list(entries[pid]['parts'].values())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_materials='EXPORT', export_extras=False,
                              export_cameras=False, export_lights=False, export_animations=False,
                              export_texcoords=False, export_normals=True)
    return os.path.getsize(path)


def material_table(entries):
    used = sorted({mm.name for e in entries.values() for o in e['meshes'] for mm in o.data.materials})
    out = {}
    for name in used:
        info = build_wilds.material_info(bpy.data.materials[name])
        out[name] = dict(color=info['color'], roughness=info['roughness'], metallic=info['metallic'])
    return out


def write_manifest(entries, stats, size, icons):
    data = dict(
        generator='art/blender/kit/build_farm.py', blender=bpy.app.version_string, units='metres',
        coordinates=("Blender: Z up, front -Y; glTF: Y up, front +Z; origin at each piece's ground centre. "
                     'Animals and the gate: a root node with one child per part, whose translation is the part '
                     'pivot (glTF) and whose vertices are relative to it.'),
        file=GLB_NAME, bytes=size, limit_bytes=GLB_LIMIT, budgets=BUDGET,
        nodes={pid: stats[pid] for pid in FARM_IDS},
        materials=material_table(entries),
        icons={pid: dict(file=f'icons/items/{pid}.webp', **icons[pid]) for pid in PRODUCTS if pid in icons},
    )
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')
    return data


def install_manifest(data):
    with open(ASSET_MANIFEST, encoding='utf-8') as fh:
        doc = json.load(fh)
    doc['farm'] = data
    with open(ASSET_MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, indent=2)
        fh.write('\n')


def report(stats):
    print('\n== farm')
    for pid in FARM_IDS:
        s = stats[pid]
        b = s['bounds']
        print(f"  {pid:12s} {s['triangles']:5d}/{s['budget']:<4d} tris  h {b['max'][2]:.3f}  "
              f"x {b['min'][0]:.2f}..{b['max'][0]:.2f}  y {b['min'][1]:.2f}..{b['max'][1]:.2f}  {len(s['materials'])} mats")
        for name, p in s.get('parts', {}).items():
            print(f"      {name:7s} {p['triangles']:4d} tris  pivot {p['pivot']}")


# ================================================================== icons
def render_icons(entries):
    """Same studio as build_items.py's icons; each WebP at the best quality under the limit."""
    style.studio(size=(ICON_SIZE, ICON_SIZE), transparent=True)
    build_items._eevee(48)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.6
    scene.view_settings.exposure = -0.15
    for light in bpy.data.objects:
        if light.type == 'LIGHT':
            light.data.angle = RAD(22)
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    os.makedirs(ICONS, exist_ok=True)
    everything = [o for e in entries.values() for o in [e['root']] + e['meshes']]
    written = {}
    for pid in PRODUCTS:
        obj = entries[pid]['root']
        for o in everything:
            o.hide_render = o is not obj
        v = ICON_VIEW[pid]
        cam = build_items.icon_camera(obj, v['elevation'], v['yaw'], v['margin'])
        bpy.ops.render.render(write_still=False)
        result = bpy.data.images['Render Result']
        path = os.path.join(ICONS, pid + '.webp')
        for quality in (88, 82, 76, 70, 64):
            scene.render.image_settings.quality = quality
            result.save_render(path, scene=scene)
            if os.path.getsize(path) <= ICON_LIMIT:
                break
        bpy.data.objects.remove(cam, do_unlink=True)
        written[pid] = dict(bytes=os.path.getsize(path), quality=quality)
    for o in everything:
        o.hide_render = False
    return written


# ================================================================ previews
def dup(e, loc, rz=0.0, pose=None, scale=1.0):
    """A linked copy of a piece (root and parts), placed and optionally posed {part: (rx, ry, rz)}."""
    root = e['root'].copy()
    bpy.context.scene.collection.objects.link(root)
    root.hide_render = False
    root.location = loc
    root.rotation_euler = (0, 0, rz)
    root.scale = (scale, scale, scale)
    for name, part in e['parts'].items():
        c = part.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = root
        c.matrix_parent_inverse = part.matrix_parent_inverse.copy()
        c.location = part.location
        c.rotation_euler = (pose or {}).get(name, (0, 0, 0))
        c.hide_render = False
    return root


def stage(size, ground='#7DD957'):
    """build_wilds' preview studio, after clearing the previous stage's lights, cameras, ground and labels."""
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA', 'FONT') or o.name.startswith('Preview ground'):
            bpy.data.objects.remove(o, do_unlink=True)
    old = bpy.data.materials.get('Preview ground')
    if old is not None:
        bpy.data.materials.remove(old)
    build_wilds._preview_studio(size, ground=ground)


def hide_all():
    for o in bpy.data.objects:
        if o.type in ('MESH', 'EMPTY', 'FONT'):
            o.hide_render = True
    g = bpy.data.objects.get('Preview ground')
    if g is not None:
        g.hide_render = False


def ground_patch(name, colour, centre, size, z=0.004, n=24):
    P = Piece('Preview ' + name)
    prof = [(1.0, 0.0), (0.0, 0.0)]
    g = lathe(prof, n, mod=lambda th, i: 1 + 0.05 * math.sin(3 * th) + 0.03 * math.sin(5 * th + 1))
    g = g.transformed(scl(size[0], size[1], 1)).moved((centre[0], centre[1], z))
    g.faces = [tuple(reversed(f)) if (g.verts[f[1]] - g.verts[f[0]]).cross(g.verts[f[2]] - g.verts[f[0]]).z < 0 else f
               for f in g.faces]
    P.add(g, mat('Preview ' + name, colour, 0.9))
    o = P.build()
    return o


def preview_sheet(entries, hero, out_path):
    """Every piece in rows at the game camera angle, labelled, next to the explorer."""
    stage((1800, 860))
    hide_all()
    rows = [
        (3.6, [('cow', -4.6, 'cow 1.4 m back'), ('calf', -2.2, 'calf'), ('chicken', -0.6, 'chicken'),
               ('chick', 0.3, 'chick'), ('coop', 2.4, 'coop'), ('pen_gate', 5.7, 'pen_gate')]),
        (0.4, [('pen_fence', -4.6, 'pen_fence (2 m)'), ('feed_trough', -1.6, 'feed_trough'),
               ('water_trough', 0.6, 'water_trough'), ('hay_bale', 2.8, 'hay_bale'), ('egg_basket', 4.4, 'egg_basket'),
               ('milk', 5.3, 'milk'), ('egg', 6.0, 'egg')]),
    ]
    placed = []
    for y, row in rows:
        for pid, x, _ in row:
            placed.append(dup(entries[pid], (x, y, 0), RAD(-20) if KIND[pid] == 'animal' else 0.0))
    if hero is not None:
        build_wilds._show_tree(hero, (-7.2, 3.6, 0))
    cam = game_camera(target=(-0.6, 2.2, 0.5), ortho_scale=15.6)
    bpy.context.view_layer.update()
    labels = []
    for y, row in rows:
        for pid, x, text in row:
            labels.append(build_wilds.label(cam, text, (x, y - (1.25 if pid in ('cow', 'coop') else 0.75), 0), 0.24))
    if hero is not None:
        labels.append(build_wilds.label(cam, 'explorer', (-7.2, 2.7, 0), 0.24))
    render(out_path)
    return cam


def preview_pen(entries, hero, out_path, size=(1600, 1000), ortho=13.5, target=(0.0, 0.6, 0.0)):
    """The pen as the game might lay it out: a 10 x 6 m fence ring with the gate in front, the coop, the
    troughs, hay, animals at play and a few products, with the explorer at the gate."""
    stage(size, ground='#7DD957')
    hide_all()
    ground_patch('dirt', '#D9A35F', (0, 0.4), (4.7, 2.75))
    ground_patch('straw', '#F2C35A', (-3.0, 2.0), (1.3, 0.8), z=0.008, n=16)
    ground_patch('puddle', '#4FC3F0', (3.3, -1.5), (0.55, 0.32), z=0.008, n=16)
    W, D = 10.0, 6.0
    for k in range(5):
        x = -4.0 + 2.0 * k
        if k == 2:
            dup(entries['pen_gate'], (x, -D / 2 + 0.4, 0), 0.0, pose=dict(door=(0, 0, RAD(-70))))
        else:
            dup(entries['pen_fence'], (x, -D / 2 + 0.4, 0))
        dup(entries['pen_fence'], (x, D / 2 + 0.4, 0))
    for k in range(3):
        y = -2.0 + 2.0 * k + 0.4
        dup(entries['pen_fence'], (-W / 2, y, 0), RAD(90))
        dup(entries['pen_fence'], (W / 2, y, 0), RAD(90))
    dup(entries['coop'], (-3.3, 2.0, 0), RAD(15))
    dup(entries['feed_trough'], (1.0, 2.6, 0))
    dup(entries['water_trough'], (3.6, 2.4, 0), RAD(-10))
    dup(entries['hay_bale'], (4.2, 0.3, 0), RAD(80))
    dup(entries['hay_bale'], (4.25, -0.75, 0), RAD(95))
    dup(entries['hay_bale'], (4.2, -0.2, 0.5), RAD(88))
    dup(entries['cow'], (1.2, 1.2, 0), RAD(25), pose=dict(head=(RAD(30), 0, RAD(-10)), tail=(0, 0, RAD(-25))))
    dup(entries['calf'], (2.4, 0.0, 0), RAD(-60),
        pose=dict(leg_fl=(RAD(22), 0, 0), leg_br=(RAD(18), 0, 0), leg_fr=(RAD(-20), 0, 0), leg_bl=(RAD(-18), 0, 0)))
    dup(entries['chicken'], (-1.6, 0.3, 0), RAD(25), pose=dict(head=(RAD(45), 0, 0)))
    dup(entries['chicken'], (-0.4, -0.9, 0), RAD(-30), pose=dict(wing_r=(0, RAD(-50), 0), wing_l=(0, RAD(50), 0)))
    for k, (x, y, r) in enumerate(((-1.1, 0.0, 60), (-1.25, 0.45, -20), (-0.85, 0.35, 120), (0.2, -1.4, -10))):
        dup(entries['chick'], (x, y, 0), RAD(r), pose=dict(head=(RAD(30 if k % 2 else -10), 0, 0)))
    dup(entries['egg_basket'], (-2.0, 1.2, 0), RAD(10))
    for x, y in ((-2.35, 1.05), (-2.5, 1.25)):
        dup(entries['egg'], (x, y, 0), 0.4)
    dup(entries['milk'], (0.75, 2.0, 0))
    dup(entries['milk'], (0.6, 2.05, 0), 0.5)
    if hero is not None:
        build_wilds._show_tree(hero, (0.6, -3.6, 0), RAD(160))
    cam = bpy.context.scene.camera or game_camera()
    cam = game_camera(target=target, ortho_scale=ortho)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = size
    render(out_path)
    return cam


def _camera(elev, yaw, target, ortho, distance=30.0):
    data = bpy.data.cameras.new('Farm camera')
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    cam = bpy.data.objects.new('Farm camera', data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elev), RAD(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = Vector(target) + d * distance
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


def preview_poses(entries, out_path):
    """Close 3/4 views of the animals at rest (top) and posed through their parts (bottom), which checks the
    pivots: heads nod, wings flap, legs swing, tails wag."""
    stage((1800, 1000), ground='#8BE36A')
    hide_all()
    # (id, rest x, posed x, row y, preview scale): the birds are shown 2.2x in front of the cattle.
    lay = [('cow', -3.3, -0.8, 1.2, 1.0), ('calf', 1.5, 3.3, 1.2, 1.0), ('chicken', -2.4, -0.9, -1.6, 2.2),
           ('chick', 0.9, 2.3, -1.6, 2.2)]
    poses = dict(
        cow=dict(head=(RAD(30), 0, RAD(15)), leg_fl=(RAD(25), 0, 0), leg_br=(RAD(25), 0, 0), leg_fr=(RAD(-25), 0, 0),
                 leg_bl=(RAD(-25), 0, 0), tail=(RAD(-20), RAD(30), 0)),
        calf=dict(head=(RAD(-20), 0, RAD(-20)), leg_fl=(RAD(-30), 0, 0), leg_fr=(RAD(-30), 0, 0),
                  leg_bl=(RAD(20), 0, 0), leg_br=(RAD(20), 0, 0), tail=(0, RAD(-35), 0)),
        chicken=dict(head=(RAD(45), 0, 0), wing_r=(0, RAD(-60), 0), wing_l=(0, RAD(60), 0), leg_l=(RAD(30), 0, 0),
                     leg_r=(RAD(-30), 0, 0), tail=(0, RAD(20), 0)),
        chick=dict(head=(RAD(-25), 0, RAD(20)), wing_r=(0, RAD(-70), 0), wing_l=(0, RAD(70), 0), leg_l=(RAD(-30), 0, 0),
                   leg_r=(RAD(30), 0, 0)),
    )
    for pid, x0, x1, y, sc in lay:
        dup(entries[pid], (x0, y, 0), RAD(-35), scale=sc)
        dup(entries[pid], (x1, y, 0), RAD(-35), pose=poses[pid], scale=sc)
    _camera(20, 12, (0.0, 0.0, 0.6), 9.4, distance=40)
    render(out_path)


def preview_closeups(entries, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    stage((900, 900), ground='#8BE36A')
    for pid in FARM_IDS:
        hide_all()
        dup(entries[pid], (0, 0, 0), RAD(-30))
        h = SIZE[pid]['h']
        w = max(SIZE[pid]['half']) * 2
        _camera(18, 20, (0, 0, h * 0.45), max(h, w) * 1.25, distance=20)
        render(os.path.join(out_dir, f'farm-{pid}.png'))


def preview_icons(out_path):
    build_items.contact_sheet(PRODUCTS, out_path, cols=3)


# ==================================================================== main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(install=False, render=False, debug=None)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--install':
            opts['install'] = True
        elif a == '--render':
            opts['render'] = True
        elif a == '--debug':
            opts['debug'] = argv[i + 1]
            i += 1
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    return opts


def main():
    opts = parse_args()
    reset_scene()
    entries = build_all()
    stats = {pid: piece_stats(entries[pid]) for pid in FARM_IDS}
    report(stats)
    failures = []
    for pid in FARM_IDS:
        failures += [f'{pid}: {e}' for e in check_piece(entries[pid], stats[pid])]
    path = os.path.join(MODELS, GLB_NAME)
    size = export(entries, path)
    print(f'  {GLB_NAME} {size} bytes ({size / 1024:.1f} KB)')
    if size > GLB_LIMIT:
        failures.append(f'{GLB_NAME} is {size} bytes (> {GLB_LIMIT})')
    failures += check_glb(path, stats)
    icons = render_icons(entries)
    for pid, info in icons.items():
        print(f"  icon {pid:11s} {info['bytes']:5d} bytes (q{info['quality']})")
        if info['bytes'] > ICON_LIMIT:
            failures.append(f"{pid}: icon is {info['bytes']} bytes (> {ICON_LIMIT})")
    data = write_manifest(entries, stats, size, icons)

    if opts['render'] or opts['debug']:
        reset_scene()
        entries = build_all()
        for e in entries.values():
            for o in [e['root']] + e['meshes']:
                o.hide_render = True
        hero = build_wilds.import_nodes(HERO_GLB, {'hero'}).get('hero')
        if opts['render']:
            preview_expansion(entries)
            preview_sheet(entries, hero, os.path.join(PREVIEWS, 'farm.webp'))
            if hero is not None:
                for o in [hero] + list(hero.children_recursive):
                    o.hide_render = True
            preview_pen(entries, hero, os.path.join(PREVIEWS, 'farm-pen.webp'))
            preview_poses(entries, os.path.join(PREVIEWS, 'farm-poses.webp'))
            preview_icons(os.path.join(PREVIEWS, 'farm-icons.webp'))
            print('  previews art/previews/kit/farm.webp, farm-pen.webp, farm-poses.webp, farm-icons.webp')
        if opts['debug']:
            preview_closeups(entries, opts['debug'])
            preview_pen(entries, hero, os.path.join(opts['debug'], 'farm-pen-2x.png'), size=(1600, 1000), ortho=6.5,
                        target=(-0.5, 0.8, 0.3))

    if failures:
        print('\nFarm kit contract failures:\n  ' + '\n  '.join(failures))
        sys.stdout.flush()
        os._exit(1)
    if opts['install']:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        shutil.copyfile(path, os.path.join(PUBLIC_MODELS, GLB_NAME))
        os.makedirs(PUBLIC_ICONS, exist_ok=True)
        for pid in PRODUCTS:
            shutil.copyfile(os.path.join(ICONS, pid + '.webp'), os.path.join(PUBLIC_ICONS, pid + '.webp'))
        install_manifest(data)
        print('installed', GLB_NAME, 'and', len(PRODUCTS), 'icons')
    print('\nFarm kit OK')


from build_farm_expansion import extend
extend(globals())

if __name__ == '__main__':
    try:
        main()
    except SystemExit as exc:
        if exc.code not in (None, 0):
            print(exc.code if isinstance(exc.code, str) else f'exit {exc.code}')
            sys.stdout.flush()
            os._exit(1)
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
