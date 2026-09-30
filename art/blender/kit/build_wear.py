"""Zoo Garden wearable gear: 19 hats, 17 outfits and 5 pairs of boots worn by the explorer.

Every item is authored procedurally as a soft, glossy toy in explorer space (hero_spec.py): Blender
Z up, the explorer faces -Y, metres, standing at the origin with arms hanging straight down. The GLB
holds one empty per item id at the origin (identity transform); inside it every mesh is modelled at
its worn position and its name ends with the hero part it follows: `@head`, `@body`, `@arm-left`,
`@arm-right`, `@leg-left` or `@leg-right`. Same-part pieces are joined into one mesh (several
materials per mesh). See CONTRACT.md, "Explorer and gear".

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_wear.py -- \
        [--only hats|outfits|boots|icons|<id>[,<id>...]] [--install] [--render] [--debug DIR]

Outputs:
    art/generated/kit/models/gear-wear.glb        (full builds only, not with --only <subset>)
    art/generated/kit/icons/items/<id>.webp        (160 x 160, transparent, 3/4 view)
    art/generated/kit/wear-manifest.json
    art/previews/kit/hats.webp, outfits.webp, boots.webp, wear-game.webp   (--render)
--install copies gear-wear.glb to public/assets/models/ and the icons to public/assets/icons/items/.
--debug DIR writes an icon contact sheet (cream cards, full size and 52 px) to DIR.

Previews dress public/assets/models/hero.glb when it exists, otherwise hero_spec's proxy (with eye
marks so a hat covering the face would show). Output is deterministic: no randomness, triangulated
and sorted faces (as build_fish.py).
"""
import bpy
import bmesh
import json
import math
import os
import shutil
import sys
import tempfile
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
import hero_spec as HS  # noqa: E402
from style import game_camera, mat, reset_scene, studio  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
ICONS = os.path.join(GEN, 'icons', 'items')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'wear-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')
HERO_GLB = os.path.join(PUBLIC_MODELS, 'hero.glb')
GLB_NAME = 'gear-wear.glb'

HATS = [('hat_straw', 'Straw hat'), ('hat_leather', 'Leather hat'), ('hat_bear', 'Bear hat'), ('crown', 'Royal crown'),
        ('hat_space', 'Space hat'), ('hat_lantern', 'Lantern hat'), ('hat_cowboy', 'Cowboy hat'),
        ('hat_wizard', 'Wizard hat'), ('hat_pirate', 'Pirate hat'), ('hat_chef', 'Chef hat'), ('hat_bunny', 'Bunny hat'),
        ('hat_cat', 'Cat hat'), ('hat_viking', 'Viking hat'), ('hat_santa', 'Santa hat'),
        ('hat_graduate', 'Graduation cap'), ('hat_samurai', 'Samurai hat'), ('hat_party', 'Party hat'),
        ('hat_halo', 'Halo'), ('hat_frog', 'Frog hat')]
OUTFITS = [('armor_leather', 'Leather outfit'), ('armor_wolf', 'Wolf outfit'), ('armor_space', 'Space outfit'),
           ('armor_bone', 'Bone outfit'), ('armor_leaf', 'Leaf outfit'), ('armor_cloud', 'Cloud outfit'),
           ('armor_wings', 'Dragon wings'), ('armor_knight', 'Knight outfit'), ('armor_pirate', 'Pirate outfit'),
           ('armor_chef', 'Chef outfit'), ('armor_tux', 'Tuxedo'), ('armor_kimono', 'Kimono'),
           ('armor_hawaii', 'Island shirt'), ('armor_superhero', 'Superhero outfit'), ('armor_angel', 'Angel outfit'),
           ('armor_santa', 'Santa outfit'), ('armor_hoodie', 'Hoodie')]
BOOTS = [('boots_rocket', 'Rocket boots'), ('boots_cowboy', 'Cowboy boots'), ('boots_flipper', 'Swim flippers'),
         ('boots_cloud', 'Cloud boots'), ('boots_lava', 'Lava boots')]
KIND = {i: 'hat' for i, _ in HATS}
KIND.update({i: 'outfit' for i, _ in OUTFITS})
KIND.update({i: 'boots' for i, _ in BOOTS})
LABEL = dict(HATS + OUTFITS + BOOTS)
ALL_IDS = [i for i, _ in HATS + OUTFITS + BOOTS]
CATEGORY = {'hats': [i for i, _ in HATS], 'outfits': [i for i, _ in OUTFITS], 'boots': [i for i, _ in BOOTS]}

TRI_LIMIT = {'hat': 700, 'outfit': 1400, 'boots': 600}
ALLOWED_PARTS = {'hat': ('head',), 'outfit': ('body', 'arm-left', 'arm-right'), 'boots': ('leg-left', 'leg-right')}
PART_ORDER = ('head', 'body', 'arm-left', 'arm-right', 'leg-left', 'leg-right')
SUFFIX = {'head': '', 'body': '', 'arm-left': '_sleeve_l', 'arm-right': '_sleeve_r', 'leg-left': '_l', 'leg-right': '_r'}
GLB_LIMIT = 700 * 1024
ICON_LIMIT = 8 * 1024
FACE_CLEAR = 0.60          # contract: no hat vertex this close to the head centre on the face side below z 1.9
HAT_CLEAR = 0.63           # hero_spec: a hat's inner surface stays this far from the head centre

TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))
X_AXIS = Vector((1, 0, 0))
HC = Vector(HS.HEAD_CENTRE)
ARM_X, ARM_Y = HS.PIVOTS['arm-right'][0], 0.01
LEG_X = HS.PIVOTS['leg-right'][0]


def env_r(z):
    """The torso envelope radius at height z (extrapolated below the hem)."""
    t = HS.TORSO
    k = (t['top_radius'] - t['bottom_radius']) / (t['top_z'] - t['bottom_z'])
    return t['bottom_radius'] + k * (z - t['bottom_z'])


ENV_SLOPE = (HS.TORSO['bottom_radius'] - HS.TORSO['top_radius']) / (HS.TORSO['top_z'] - HS.TORSO['bottom_z'])


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists with a per-face tag (a material, or a key into a dict)."""

    def __init__(self, verts, faces, tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [None] * len(self.faces)

    def xf(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

    def moved(self, o):
        o = Vector(o)
        return Geo([v + o for v in self.verts], self.faces, self.tags)

    def map(self, fn):
        return Geo([Vector(fn(v)) for v in self.verts], self.faces, self.tags)

    def mirrored(self):
        return Geo([Vector((-v.x, v.y, v.z)) for v in self.verts], [tuple(reversed(f)) for f in self.faces],
                   self.tags)

    def paint(self, tag):
        return Geo(self.verts, self.faces, [tag] * len(self.faces))

    def retag(self, fn):
        """fn(old_tag, face_centre) -> new tag."""
        tags = []
        for f, t in zip(self.faces, self.tags):
            c = sum((self.verts[i] for i in f), Vector()) / len(f)
            tags.append(fn(t, c))
        return Geo(self.verts, self.faces, tags)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def signed_volume(self):
        vol = 0.0
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                vol += a.dot(self.verts[f[i]].cross(self.verts[f[i + 1]]))
        return vol / 6.0

    def outward(self):
        if self.signed_volume() < 0:
            self.faces = [tuple(reversed(f)) for f in self.faces]
        return self

    def weld(self, eps=1e-5):
        """Merge coincident vertices (poles, closed seams) and drop the faces that collapse."""
        keymap, remap, verts = {}, [], []
        for v in self.verts:
            k = (round(v.x / eps), round(v.y / eps), round(v.z / eps))
            if k not in keymap:
                keymap[k] = len(verts)
                verts.append(v)
            remap.append(keymap[k])
        faces, tags = [], []
        for f, t in zip(self.faces, self.tags):
            nf = []
            for i in f:
                j = remap[i]
                if not nf or nf[-1] != j:
                    nf.append(j)
            if len(nf) > 1 and nf[0] == nf[-1]:
                nf.pop()
            if len(nf) >= 3 and len(set(nf)) == len(nf):
                faces.append(tuple(nf))
                tags.append(t)
        return Geo(verts, faces, tags)


def merge(*geos):
    verts, faces, tags = [], [], []
    for g in geos:
        base = len(verts)
        verts += g.verts
        faces += [tuple(base + i for i in f) for f in g.faces]
        tags += g.tags
    return Geo(verts, faces, tags)


def _newell(pts):
    n = Vector()
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    return n


def lathe(profile, segs, mod=None, phase=0.0, cap_bottom=False, cap_top=False, tag=None, closed=False, arc=None):
    """Revolve [(r, z), ...] (bottom to top, or a CCW loop when closed) around Z. r = 0 makes a pole.
    mod(theta, i) returns a radius scale or (scale, dz). arc=(th0, th1) sweeps part of a turn (a closed
    profile then gets end caps). tag(band, seg) labels faces; caps get band -1 / len."""
    full = arc is None
    ths = ([phase + TAU * s / segs for s in range(segs)] if full
           else [arc[0] + (arc[1] - arc[0]) * s / segs for s in range(segs + 1)])
    n = len(ths)
    verts, rings = [], []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6 and not closed:
            rings.append([len(verts)] * n)
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for th in ths:
            sc, dz = 1.0, 0.0
            if mod:
                v = mod(th, i)
                sc, dz = v if isinstance(v, tuple) else (v, 0.0)
            ring.append(len(verts))
            verts.append((r * sc * math.cos(th), r * sc * math.sin(th), z + dz))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
    cols = n if full else n - 1
    faces, tags = [], []
    for b, (lo, up) in enumerate(pairs):
        for s in range(cols):
            s2 = (s + 1) % n
            f = []
            for i in (lo[s], lo[s2], up[s2], up[s]):
                if i not in f:
                    f.append(i)
            if len(f) >= 3:
                faces.append(tuple(f))
                tags.append(tag(b, s) if tag else None)
    vv = [Vector(v) for v in verts]
    if full and not closed:
        if cap_bottom and profile[0][0] > 1e-6:
            faces.append(tuple(reversed(rings[0])))
            tags.append(tag(-1, 0) if tag else None)
        if cap_top and profile[-1][0] > 1e-6:
            faces.append(tuple(rings[-1]))
            tags.append(tag(len(pairs), 0) if tag else None)
    if not full and closed:
        for col, th, sign in ((0, ths[0], -1.0), (n - 1, ths[-1], 1.0)):
            cap = [ring[col] for ring in rings]
            want = Vector((-math.sin(th), math.cos(th), 0.0)) * sign
            if _newell([vv[i] for i in cap]).dot(want) < 0:
                cap = list(reversed(cap))
            faces.append(tuple(cap))
            tags.append(tag(-1, 0) if tag else None)
    return Geo(vv, faces, tags)


def zaz_tag(profile, segs, fn, phase=0.0):
    """Adapt fn(z_mid, az_mid, band, seg) to a lathe tag. az (degrees) is measured from the front (-Y)
    toward +X, so the lathe angle -90 is az 0."""
    zs = [p[1] for p in profile]

    def tag(b, s):
        if 0 <= b < len(zs) - 1:
            z = (zs[b] + zs[b + 1]) / 2
        elif b == len(zs) - 1:
            z = (zs[-1] + zs[0]) / 2
        else:
            z = zs[0] if b < 0 else zs[-1]
        az = (math.degrees(phase + TAU * (s + 0.5) / segs) + 90.0) % 360.0
        if az > 180:
            az -= 360
        return fn(z, az, b, s)
    return tag


def ellipsoid(c, radii, segs=12, rings=8, tag=None, phase=0.0):
    prof = [(math.sin(math.pi * i / rings), -math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0], prof[-1] = (0.0, -1.0), (0.0, 1.0)
    g = lathe(prof, segs, phase=phase, tag=tag)
    return g.map(lambda v: (c[0] + v.x * radii[0], c[1] + v.y * radii[1], c[2] + v.z * radii[2]))


def torus(R, r, segs, sides, tag=None, phase=0.0, mod=None, rz=None):
    rz = r if rz is None else rz
    prof = [(R + r * math.cos(TAU * j / sides), rz * math.sin(TAU * j / sides)) for j in range(sides)]
    return lathe(prof, segs, closed=True, phase=phase, tag=tag, mod=mod)


def _radii(radius, n):
    """A number, a tuple (ra, rb) for every point, or a list with one entry (number or pair) per point."""
    if isinstance(radius, (int, float)):
        return [(float(radius), float(radius))] * n
    if isinstance(radius, tuple):
        return [(float(radius[0]), float(radius[1]))] * n
    out = []
    for r in radius:
        out.append((float(r), float(r)) if isinstance(r, (int, float)) else (float(r[0]), float(r[1])))
    return out


def tube(path, radius, sides=6, ang0=0.0, cap_start=False, cap_end=False, tag=None, ref=None, frames=None):
    """Sweep an ellipse along a polyline. radius: number, list of numbers or list of (ra, rb): ra along the
    frame normal (starts as `ref` projected, default Z or X), rb along tangent x normal. 0 makes a pole.
    tag(band, side)."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    radii = _radii(radius, n)
    tangents = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    r0 = Vector(ref) if ref is not None else (UP if abs(tangents[0].z) < 0.9 else X_AXIS)
    nrm = (r0 - tangents[0] * r0.dot(tangents[0])).normalized()
    fr = []
    for i in range(n):
        if i:
            nrm = tangents[i - 1].rotation_difference(tangents[i]) @ nrm
            nrm = (nrm - tangents[i] * nrm.dot(tangents[i])).normalized()
        fr.append((nrm.copy(), tangents[i].cross(nrm)))
    if frames is not None:
        frames.extend(fr)
    verts, rings = [], []
    for i in range(n):
        ra, rb = radii[i]
        if ra <= 1e-6 and rb <= 1e-6:
            rings.append([len(verts)] * sides)
            verts.append(pts[i])
            continue
        nv, bv = fr[i]
        ring = []
        for s in range(sides):
            a = ang0 + TAU * s / sides
            ring.append(len(verts))
            verts.append(pts[i] + nv * (math.cos(a) * ra) + bv * (math.sin(a) * rb))
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        for s in range(sides):
            s2 = (s + 1) % sides
            f = []
            for i in (lo[s], lo[s2], up[s2], up[s]):
                if i not in f:
                    f.append(i)
            if len(f) >= 3:
                faces.append(tuple(f))
                tags.append(tag(b, s) if tag else None)
    if cap_start and len(set(rings[0])) > 1:
        faces.append(tuple(reversed(rings[0])))
        tags.append(tag(-1, 0) if tag else None)
    if cap_end and len(set(rings[-1])) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(tag(n - 1, 0) if tag else None)
    return Geo(verts, faces, tags)


def sheet(fn, nu, nv, thick, tag=None):
    """A thin closed panel over the grid fn(u, v) -> point (u, v in 0..1); the other face sits `thick`
    behind. tag(i, j, front) labels faces (front: the fn surface)."""
    P = [[Vector(fn(i / (nu - 1), j / (nv - 1))) for i in range(nu)] for j in range(nv)]
    N = [[None] * nu for _ in range(nv)]
    for j in range(nv):
        for i in range(nu):
            du = P[j][min(i + 1, nu - 1)] - P[j][max(i - 1, 0)]
            dv = P[min(j + 1, nv - 1)][i] - P[max(j - 1, 0)][i]
            N[j][i] = du.cross(dv).normalized()
    verts = []
    F = [[0] * nu for _ in range(nv)]
    B = [[0] * nu for _ in range(nv)]
    for j in range(nv):
        for i in range(nu):
            F[j][i] = len(verts)
            verts.append(P[j][i])
    for j in range(nv):
        for i in range(nu):
            B[j][i] = len(verts)
            verts.append(P[j][i] - N[j][i] * thick)
    faces, tags = [], []
    for j in range(nv - 1):
        for i in range(nu - 1):
            faces.append((F[j][i], F[j][i + 1], F[j + 1][i + 1], F[j + 1][i]))
            tags.append(tag(i, j, True) if tag else None)
            faces.append((B[j][i], B[j + 1][i], B[j + 1][i + 1], B[j][i + 1]))
            tags.append(tag(i, j, False) if tag else None)
    rim = [(0, j) for j in range(nv)] + [(i, nv - 1) for i in range(1, nu)] + \
          [(nu - 1, j) for j in range(nv - 2, -1, -1)] + [(i, 0) for i in range(nu - 2, 0, -1)]
    for k, (i, j) in enumerate(rim):
        i2, j2 = rim[(k + 1) % len(rim)]
        faces.append((F[j][i], F[j2][i2], B[j2][i2], B[j][i]))
        tags.append(tag(min(i, nu - 2), min(j, nv - 2), False) if tag else None)
    return Geo(verts, faces, tags).outward()


def rbox(half, r, c=(0, 0, 0), segs=8, tag=None):
    """A rounded box: half sizes, corner radius r (cheap: ~60 triangles)."""
    hx, hy, hz = half
    r = min(r, hx, hy, hz)
    phase = TAU / segs / 2
    verts, rings = [], []
    for lat in (-54.0, -18.0, 18.0, 54.0):
        ring = []
        for s in range(segs):
            th = phase + TAU * s / segs
            d = Vector((math.cos(RAD(lat)) * math.cos(th), math.cos(RAD(lat)) * math.sin(th), math.sin(RAD(lat))))
            p = d * r + Vector((math.copysign(hx - r, d.x), math.copysign(hy - r, d.y), math.copysign(hz - r, d.z)))
            ring.append(len(verts))
            verts.append(p + Vector(c))
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        for s in range(segs):
            s2 = (s + 1) % segs
            faces.append((lo[s], lo[s2], up[s2], up[s]))
            tags.append(tag(b, s) if tag else None)
    faces.append(tuple(reversed(rings[0])))
    tags.append(tag(-1, 0) if tag else None)
    faces.append(tuple(rings[-1]))
    tags.append(tag(3, 0) if tag else None)
    return Geo(verts, faces, tags)


def prism(outline, depth, bevel=0.0, tag=None):
    """Extrude a CCW 2D outline (local XY) along local Z over -depth/2..depth/2. bevel softens the rims by
    insetting the caps toward the centroid (fine for convex-ish outlines)."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cy = sum(p[1] for p in outline) / n
    size = max(max(abs(p[0] - cx), abs(p[1] - cy)) for p in outline)
    d = depth / 2

    def inset(k):
        return [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in outline]
    if bevel > 0:
        k = max(0.3, 1.0 - bevel / size)
        layers = [(inset(k), -d), (outline, -d + bevel), (outline, d - bevel), (inset(k), d)]
    else:
        layers = [(outline, -d), (outline, d)]
    verts, rings = [], []
    for pts, z in layers:
        ring = []
        for x, y in pts:
            ring.append(len(verts))
            verts.append((x, y, z))
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        for s in range(n):
            s2 = (s + 1) % n
            faces.append((lo[s], lo[s2], up[s2], up[s]))
            tags.append(tag('side', b) if tag else None)
    faces.append(tuple(reversed(rings[0])))
    tags.append(tag('back', 0) if tag else None)
    faces.append(tuple(rings[-1]))
    tags.append(tag('front', 0) if tag else None)
    return Geo(verts, faces, tags).outward()


def slab(outline, thick, centre=None):
    """A thin closed leaf/feather: the outline pinched to an edge, puffed to +-thick/2 at `centre`."""
    n = len(outline)
    cx, cy = centre if centre else (sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n)
    verts = [Vector((x, y, 0.0)) for x, y in outline] + [Vector((cx, cy, thick / 2)), Vector((cx, cy, -thick / 2))]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n))
        faces.append((j, i, n + 1))
    return Geo(verts, faces).outward()


def decal(outline, dome=0.0, centre=None):
    """A one-sided fan over a 2D outline in local XY, domed toward +Z (spots, pupils, emblems)."""
    n = len(outline)
    cx, cy = centre or (sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n)
    verts = [(cx, cy, dome)] + [(x, y, 0.0) for x, y in outline]
    return Geo(verts, [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)])


def circle(n, r, phase=0.0, sx=1.0, sy=1.0):
    return [(r * sx * math.cos(phase + TAU * i / n), r * sy * math.sin(phase + TAU * i / n)) for i in range(n)]


def star(n, ro, ri, phase=math.pi / 2):
    return [((ro if i % 2 == 0 else ri) * math.cos(phase + math.pi * i / n),
             (ro if i % 2 == 0 else ri) * math.sin(phase + math.pi * i / n)) for i in range(2 * n)]


def flower(petals, r, depth=0.45, n=None, phase=math.pi / 2):
    """Round-petalled flower outline: radius swells to r at each petal and dips by `depth` between them."""
    n = n or petals * 3
    out = []
    for i in range(n):
        phi = TAU * i / n
        rr = r * (1 - depth + depth * abs(math.cos(petals * phi / 2)))
        out.append((rr * math.cos(phase + phi), rr * math.sin(phase + phi)))
    return out


def leaf_outline(length, width, n=3):
    """A pointed leaf along +X from the origin: 2n+2 points."""
    top = [(length * (i + 1) / (n + 1), width * math.sin(math.pi * (i + 1) / (n + 1)) ** 0.8) for i in range(n)]
    return [(0.0, 0.0)] + [(x, -y) for x, y in top] + [(length, 0.0)] + [(x, y) for x, y in reversed(top)]


def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list, Vector)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(tuple(RAD(a) for a in rot)), Vector(s))


def facing(loc, normal, up=(0, 0, 1), spin=0.0):
    """Local +Z along `normal`, local +Y as close to `up` as possible; spin in degrees about the normal."""
    z = Vector(normal).normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0)).cross(z) if abs(z.x) < 0.9 else Vector((0, 1, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    if spin:
        q = Quaternion(z, RAD(spin))
        x, y = q @ x, q @ y
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def frame(loc, xaxis, yaxis):
    """Local X along xaxis, local Y along yaxis (orthogonalised), local Z = X x Y."""
    x = Vector(xaxis).normalized()
    y = Vector(yaxis)
    y = (y - x * y.dot(x)).normalized()
    m = Matrix((x, y, x.cross(y))).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def about(pivot, rx=0.0, ry=0.0, rz=0.0):
    """Rotate about a pivot (degrees). About the head centre, rx < 0 pushes a hat back (front up)."""
    p = Vector(pivot)
    return Matrix.Translation(p) @ Euler((RAD(rx), RAD(ry), RAD(rz))).to_matrix().to_4x4() @ Matrix.Translation(-p)


def hdir(az, el):
    a, e = RAD(az), RAD(el)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


def on_head(az, el, r):
    d = hdir(az, el)
    return HC + d * r, d


def torso_frame(az, z, off):
    """Point and outward normal on the torso envelope grown by `off` (front half: no back squash)."""
    d = Vector((math.sin(RAD(az)), -math.cos(RAD(az)), 0.0))
    p = d * (env_r(z) + off) + Vector((0, 0, z))
    return p, (d + Vector((0, 0, ENV_SLOPE))).normalized()


def wrap_cyl(geo, rfun, p, n, lift=0.004):
    """Bend a decal placed flat at (p, n) onto the vertical surface of revolution r = rfun(z)."""
    def f(v):
        h = (v - p).dot(n)
        d = Vector((v.x, v.y, 0.0))
        if d.length < 1e-6:
            return v
        d.normalize()
        r = rfun(v.z) + lift + max(h, 0.0)
        return (d.x * r, d.y * r, v.z)
    return geo.map(f)


def wrap_sphere(geo, centre, radius, p, n, lift=0.004):
    c = Vector(centre)

    def f(v):
        h = (v - p).dot(n)
        d = (v - c).normalized()
        return c + d * (radius + lift + max(h, 0.0))
    return geo.map(f)


def triangulate(obj):
    """Triangulate and sort faces so the GLB is byte-for-byte reproducible (as build_fish.py)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3],
                                   quad_method='FIXED', ngon_method='EAR_CLIP')
    for edge in result['edges']:
        edge.smooth = True
    bm.verts.index_update()
    bm.faces.index_update()

    def key(face):
        c = face.calc_center_median()
        return (face.material_index, round(c.x, 4), round(c.y, 4), round(c.z, 4),
                tuple(sorted(v.index for v in face.verts)))
    rank = {f.index: n for n, f in enumerate(sorted(bm.faces, key=key))}
    bm.faces.sort(key=lambda f: rank[f.index])
    bm.faces.index_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


# =============================================================== materials
def wm(name, color, rough=0.5, emit=None, strength=0.0):
    """style.mat, single sided (every piece is a closed shape or sits on one), roughness 0.35-0.6, metallic 0."""
    m = mat(name, color, min(0.6, max(0.35, rough)), 0.0, emit, strength)
    m.use_backface_culling = True
    return m


class Part:
    """Accumulates geometry + materials into one named mesh object."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.mats, self.smooth, self.materials = [], [], [], [], []

    def slot(self, material):
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def add(self, geo, material=None, m=None, smooth=True):
        g = (geo if m is None else geo.xf(m)).weld()
        base = len(self.verts)
        self.verts.extend(g.verts)
        for f, t in zip(g.faces, g.tags):
            if isinstance(material, dict):
                mt = material.get(t, material.get(None))
            elif isinstance(t, bpy.types.Material):
                mt = t
            else:
                mt = material
            if mt is None:
                raise ValueError(f'{self.name}: a face has no material (tag {t!r})')
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.slot(mt))
            self.smooth.append(smooth)

    def transform(self, m):
        self.verts = [m @ v for v in self.verts]

    def map(self, fn):
        self.verts = [Vector(fn(v)) for v in self.verts]

    def extend_mirrored(self, other):
        base = len(self.verts)
        self.verts += [Vector((-v.x, v.y, v.z)) for v in other.verts]
        for f, mi, sm in zip(other.faces, other.mats, other.smooth):
            self.faces.append(tuple(base + i for i in reversed(f)))
            self.mats.append(self.slot(other.materials[mi]))
            self.smooth.append(sm)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, sharp=86):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        for m in self.materials:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.mats)
        me.polygons.foreach_set('use_smooth', self.smooth)
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        limit = RAD(sharp)
        for edge in bm.edges:
            if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > limit:
                edge.smooth = False
        bm.to_mesh(me)
        bm.free()
        me.validate()
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.name = obj.name
        return obj


def piece_name(iid, part):
    return f'{iid}{SUFFIX[part]}@{part}'


class Item:
    """One catalogue item: pieces per hero part, materials named `Wear <id> <name>`."""

    def __init__(self, iid):
        self.id = iid
        self.kind = KIND[iid]
        self.parts = {}
        self.hints = {}
        self.note = ''

    def m(self, name, color, rough=0.5, emit=None, strength=0.0):
        return wm(f'Wear {self.id} {name}', color, rough, emit, strength)

    def piece(self, part):
        if part not in self.parts:
            self.parts[part] = Part(piece_name(self.id, part))
        return self.parts[part]

    def add(self, part, geo, material=None, m=None, smooth=True):
        self.piece(part).add(geo, material, m, smooth)
        return self

    def both(self, part, geo, material=None, m=None, smooth=True):
        """Add a body-part geometry and its mirror image (both on the same part)."""
        g = geo if m is None else geo.xf(m)
        self.add(part, g, material, smooth=smooth)
        self.add(part, g.mirrored(), material, smooth=smooth)
        return self

    def transform(self, part, m):
        self.parts[part].transform(m)

    def mirror(self, src, dst):
        self.piece(dst).extend_mirrored(self.parts[src])


# ======================================================== shared builders
def hood(R, open_deg, tilt, segs=16, lip=0.035, crest=0.024, steps=(180, 145, 112, 88), tag=None,
         squash_z=1.17, squash=0.3):
    """A hood around the head: a sphere of radius R about the head centre with a round face opening of
    half-angle open_deg around an axis tilted `tilt` degrees below the front. The rim rolls outward (crest)
    and back in (lip) to a short lining. tag(kind, band, seg): kind 'main' or 'rim'. Below squash_z at the
    back the hood is flattened onto the shoulders."""
    a0 = open_deg
    prof = [(R * math.sin(RAD(a)), R * math.cos(RAD(a))) for a in steps]
    prof += [(R * math.sin(RAD(a0 + 7)), R * math.cos(RAD(a0 + 7))),
             ((R + crest) * math.sin(RAD(a0 + 2.5)), (R + crest) * math.cos(RAD(a0 + 2.5))),
             ((R - lip) * math.sin(RAD(a0 - 0.5)), (R - lip) * math.cos(RAD(a0 - 0.5))),
             ((R - lip) * math.sin(RAD(a0 + 12)), (R - lip) * math.cos(RAD(a0 + 12)))]
    prof[0] = (0.0, prof[0][1])
    nb = len(prof) - 1
    main = len(steps)

    def t(b, s):
        kind = 'rim' if b >= main else 'main'
        return tag(kind, b, s) if tag else kind
    g = lathe(prof, segs, phase=-TAU / segs / 2, tag=t)
    axis = Vector((0.0, -math.cos(RAD(tilt)), -math.sin(RAD(tilt))))
    g = g.xf(facing(HC, axis, up=(0, 0, 1)))

    def sq(v):
        # Blend the squash in behind the ears (y 0.05 -> 0.3) so the face rim never folds.
        if v.z >= squash_z or v.y <= 0.05:
            return v
        t = min(1.0, (v.y - 0.05) / 0.25)
        w = t * t * (3 - 2 * t)
        return (v.x, v.y, v.z + (squash_z + (v.z - squash_z) * squash - v.z) * w)
    return g.map(sq)


def shirt_profile(z_hem=0.47, off=0.035, flare=0.0, flare_top=0.68, zs=(0.62, 0.8, 0.95), bands=(),
                  collar=True):
    """(r, z) points from the hem up to a recessed neck (hidden in the head). bands = [(z0, z1, bulge)]
    add raised rings (belts, trims)."""
    def r(z):
        f = flare * ((flare_top - z) / (flare_top - z_hem)) ** 1.6 if z < flare_top else 0.0
        return env_r(z) + off + f
    pts = [(r(z_hem) - 0.028, z_hem), (r(z_hem + 0.028) + 0.004, z_hem + 0.028)]
    marks = []
    for z0, z1, bulge in bands:
        marks += [(z0 - 0.006, 0.0), (z0, bulge), (z1, bulge), (z1 + 0.006, 0.0)]
    zlist = sorted([(z, 0.0) for z in zs if not any(b[0] - 0.03 < z < b[1] + 0.03 for b in bands)] + marks)
    for z, bulge in zlist:
        if z > z_hem + 0.04:
            pts.append((r(z) + bulge, z))
    top = r(1.06)
    pts += [(top, 1.06), (0.31, 1.15), (0.19, 1.182)]
    return pts


def shell(it, prof, fn, segs=16, back=0.045, part="body"):
    """The torso piece: a lathe of `prof` with the back pulled in (the backpack sits over it).
    fn(z, az, band, seg) returns each face's material; the recessed neck cap is `fn(1.2, 0, -2, 0)`."""
    def mod(th, i):
        return 1.0 - back * max(0.0, math.sin(th)) ** 2
    base = zaz_tag(prof, segs, fn, phase=-TAU / segs / 2)

    def tag(b, s):
        if b == len(prof) - 1:
            return fn(1.2, 0.0, -2, 0)
        return base(b, s)
    g = lathe(prof, segs, mod=mod, phase=-TAU / segs / 2, cap_top=True, tag=tag)
    it.add(part, g)
    return g


def shell_r(prof):
    """Radius of a shirt profile at height z (front), for placing things on it."""
    pts = sorted(prof[1:-2], key=lambda p: p[1])

    def f(z):
        if z <= pts[0][1]:
            return pts[0][0]
        for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / max(1e-6, z1 - z0)
        return pts[-1][0]
    return f


def on_shell(prof, az, z, lift=0.0):
    rf = shell_r(prof)
    d = Vector((math.sin(RAD(az)), -math.cos(RAD(az)), 0.0))
    p = d * (rf(z) + lift) + Vector((0, 0, z))
    n = (d + Vector((0, 0, ENV_SLOPE))).normalized()
    return p, n


def shell_decal(it, prof, outline, material, az, z, dome=0.01, lift=0.004, spin=0.0, part='body'):
    p, n = on_shell(prof, az, z)
    g = decal(outline, dome).xf(facing(p, n, up=(0, 0, 1), spin=spin))
    it.add(part, wrap_cyl(g, shell_r(prof), p, n, lift), material)


def surface_path(prof, pts, lift):
    """[(az, z)] -> points on the shell grown by `lift`."""
    out = []
    for az, z in pts:
        p, _ = on_shell(prof, az, z, lift)
        out.append(p)
    return out


def sleeve_profile(z_cuff=0.8, r=0.156, cuff=0.012, cuff_h=0.05, top=1.238, bell=0.0, puff=0.0):
    """(r, z) around the arm axis from the cuff (just above the hand) up over the shoulder dome. hero.glb's arm
    is r ~0.14 with a cuff down to z 0.79 and a shoulder cap up to z 1.2."""
    rc = r + bell
    return [(rc - 0.03, z_cuff), (rc + cuff, z_cuff + 0.012), (rc + cuff, z_cuff + cuff_h), (r + puff * 0.5, z_cuff + cuff_h + 0.015),
            (r + 0.006 + puff, 1.06), (0.126 + puff * 0.5, top - 0.07), (0.0, top)]


def sleeves(it, prof, fn, segs=8):
    """Right sleeve around the arm (x = +0.37), mirrored to the left. fn(band, seg) -> material."""
    g = lathe(prof, segs, phase=TAU / segs / 2, tag=fn).moved((ARM_X, ARM_Y, 0.0))
    it.add('arm-right', g)
    return g


def finish_sleeves(it):
    if 'arm-right' in it.parts:
        it.mirror('arm-right', 'arm-left')


def boot_tube(x, top=0.42, shaft=0.142, toe_y=-0.35, toe=(0.165, 0.1), ankle=(0.185, 0.19), foot=(0.19, 0.125),
              sides=10, tag=None, heel=0.0):
    """One boot as a bent tube: shaft down the leg, ankle bend, foot forward to a rounded toe.
    radii are (across, the other axis). Vertices under z 0 are flattened into the sole."""
    path = [(x, 0.012, top), (x, 0.012, top - 0.1), (x, 0.004 + heel * 0.3, 0.25), (x, -0.035 + heel, 0.158),
            (x, -0.14, 0.116), (x, toe_y + 0.08, 0.104), (x, toe_y, 0.098), (x, toe_y - 0.04, 0.1)]
    radii = [(shaft, shaft), (shaft + 0.004, shaft + 0.004), (0.168, 0.172), ankle, foot,
             (toe[0], toe[1]), (toe[0] * 0.7, toe[1] * 0.72), (0.0, 0.0)]
    g = tube(path, radii, sides, ang0=TAU / sides / 2, cap_start=True, tag=tag, ref=X_AXIS)
    return g.map(lambda v: (v.x, v.y, max(v.z, 0.0)))


def sole(x, material=None, y0=0.15, y1=-0.41, w=0.2, z0=-0.016, z1=0.04, segs=8, tag=None):
    """An egg-shaped sole slab under a boot (a touch narrower at the heel)."""
    cy, ry = (y0 + y1) / 2, (y0 - y1) / 2
    prof = [(0.9, z0), (1.0, z0 + 0.02), (0.99, z1 - 0.01), (0.9, z1)]
    g = lathe(prof, segs, cap_top=True, tag=tag, phase=TAU / segs / 2)
    g = g.map(lambda v: (x + v.x * w * (1.0 - 0.12 * max(0.0, v.y)), cy + v.y * ry, v.z))
    return g if tag is not None else g.paint(material)


# The item builders live below (hats, outfits, boots) and register themselves here.
BUILDERS = {}


def builder(fn):
    BUILDERS[fn.__name__] = fn
    return fn


# ==================================================================== hats
# Hats sit on the hair (HAT_SEAT_Z 1.86) and keep their inner surface >= 0.63 from the head centre where
# they wrap the head. Brimmed hats are pushed back a little so the game camera (42 deg down) still sees
# the eyes under the brim.
def brim_oval(inner, k_front):
    """Shorten a brim toward the front and back: radius beyond `inner` is scaled by 1 - k_front * y^2/r^2."""
    def f(v):
        rho = math.hypot(v.x, v.y)
        if rho <= inner + 1e-4:
            return v
        k = 1.0 - k_front * (v.y / rho) ** 2
        s = (inner + (rho - inner) * k) / rho
        return (v.x * s, v.y * s, v.z)
    return f


def bow(it, part, loc, normal, material, knot, size=1.0, up=(0, 0, 1), spin=0.0):
    """A ribbon bow: two lobes and a knot, facing `normal`."""
    m = facing(loc, normal, up=up, spin=spin)
    for sx in (-1, 1):
        lobe = ellipsoid((0, 0, 0), (0.085 * size, 0.055 * size, 0.032 * size), 6, 4)
        it.add(part, lobe, material, m @ xf((sx * 0.07 * size, 0.0, 0.01 * size), (0, 0, sx * 12)))
    it.add(part, ellipsoid((0, 0, 0), (0.036 * size, 0.04 * size, 0.034 * size), 6, 4), knot,
           m @ xf((0, 0, 0.02 * size)))


@builder
def hat_straw():
    it = Item('hat_straw')
    straw = it.m('straw', '#F7B32B', 0.55)
    light = it.m('straw light', '#FFD45A', 0.55)
    dark = it.m('straw dark', '#D9861C', 0.55)
    ribbon = it.m('ribbon', '#EF2F45', 0.42)
    leaf = it.m('leaf', '#4FBF3A', 0.45)
    crown = [(0.655, 1.845), (0.678, 1.868), (0.682, 1.975), (0.664, 1.995), (0.652, 2.11), (0.612, 2.232),
             (0.52, 2.322), (0.31, 2.366), (0.0, 2.376)]
    it.add('head', lathe(crown, 14,
                         tag=lambda b, s: ribbon if b <= 2 else (light if b in (4, 6) else straw)))
    brim = [(0.6, 1.852), (0.93, 1.815), (0.995, 1.83), (0.972, 1.854), (0.86, 1.868), (0.73, 1.882), (0.6, 1.893)]
    btag = {0: dark, 1: light, 2: straw, 3: light, 4: straw, 5: light, 6: dark}
    it.add('head', lathe(brim, 16, closed=True, tag=lambda b, s: btag[b]).map(brim_oval(0.6, 0.16)))
    # A red bow on the band with a sprig of two leaves tucked beside it (the explorer's sprout, grown up).
    d = hdir(62, 0)
    n = Vector((d.x, d.y, 0.0))
    bow(it, 'head', Vector((d.x * 0.69, d.y * 0.69, 1.93)), n, ribbon, ribbon, 0.95)
    side = Vector((-d.y, d.x, 0.0))
    for spin, ln in ((-35, 0.2), (-8, 0.16)):
        base = Vector((d.x * 0.675, d.y * 0.675, 1.97)) - side * 0.06
        lf = slab(leaf_outline(ln, 0.045, 2), 0.022, centre=(ln * 0.45, 0.0))
        it.add('head', lf, leaf, facing(base, n, up=(0, 0, 1), spin=90 + spin) @ xf((0, 0, 0.008)))
    it.transform('head', about(HC, rx=-9, ry=3))
    return it


@builder
def hat_leather():
    """Leather aviator cap: fur-lined edge and ear flaps, brass goggles on the forehead."""
    it = Item('hat_leather')
    leather = it.m('leather', '#B8612C', 0.5)
    seam = it.m('leather dark', '#7E3F1D', 0.5)
    fur = it.m('fur', '#FFE6BD', 0.6)
    brass = it.m('brass', '#F5B21E', 0.38)
    brass_hi = it.m('brass light', '#FFE07A', 0.36)
    lens = it.m('lens', '#35C4FF', 0.35)
    shine = fur

    def tag(kind, b, s):
        if kind == 'rim':
            return fur
        return seam if b == 3 else leather
    it.add('head', hood(0.668, 70, 40, 16, lip=0.03, crest=0.03, steps=(180, 145, 112, 90), tag=tag))
    for sx in (-1, 1):
        p, d = on_head(24 * sx, 47, 0.7)
        m = facing(p, d, up=(0, 0, 1))
        cup = lathe([(0.1, -0.035), (0.112, 0.0), (0.108, 0.042), (0.084, 0.052)], 12,
                    tag=lambda b, s: brass_hi if b == 1 else brass)
        it.add('head', cup, None, m)
        it.add('head', decal(circle(12, 0.088), 0.022), lens, m @ xf((0, 0, 0.034)))
        it.add('head', decal(circle(5, 0.024, 0.3), 0.004), shine, m @ xf((-0.03, 0.035, 0.057)))
    a, _ = on_head(-12, 47, 0.745)
    b, _ = on_head(12, 47, 0.745)
    it.add('head', tube([a, (a + b) / 2 + Vector((0, -0.012, 0.012)), b], 0.018, 5), brass)
    return it


@builder
def hat_bear():
    """Bear hood: round ears, a cream lining around the face and a little bear face on top."""
    it = Item('hat_bear')
    fur = it.m('fur', '#B8702F', 0.55)
    fur_dark = it.m('fur dark', '#955624', 0.55)
    cream = it.m('cream', '#FFE2B3', 0.55)
    pink = it.m('ear pink', '#FF9CC0', 0.5)
    black = it.m('eye', '#2A1F2B', 0.35)
    it.add('head', hood(0.68, 66, 32, 16, tag=lambda k, b, s: cream if k == 'rim' else (fur_dark if b == 0 else fur)))
    for sx in (-1, 1):
        p, d = on_head(40 * sx, 47, 0.66)
        n = (hdir(22 * sx, 20) + Vector((0, 0, 0.25))).normalized()
        m = facing(p + d * 0.06, n, up=(0, 0, 1))
        it.add("head", ellipsoid((0, 0, 0), (0.17, 0.165, 0.075), 8, 5), fur, m)
        it.add('head', decal(circle(10, 0.105, 0.0, 1.0, 0.95), 0.02), pink, m @ xf((0, -0.012, 0.066)))
    # Face on top: button eyes and a muzzle, read from the high game camera.
    for sx in (-1, 1):
        p, d = on_head(19 * sx, 62, 0.68)
        it.add('head', decal(circle(8, 0.042), 0.022), black, facing(p + d * 0.003, d))
    p, d = on_head(0, 52, 0.672)
    it.add('head', ellipsoid((0, 0, 0), (0.12, 0.09, 0.05), 10, 5), cream, facing(p, d, up=(0, 0, 1)))
    it.add('head', ellipsoid((0, 0, 0), (0.05, 0.035, 0.03), 8, 4), black, facing(p + d * 0.045, d) @ xf((0, 0.03, 0)))
    return it


@builder
def crown():
    it = Item('crown')
    gold = it.m('gold', '#FFBE1A', 0.38)
    gold_hi = it.m('gold light', '#FFE27A', 0.36)
    gold_lo = gold
    velvet = it.m('velvet', '#D8243B', 0.55)
    ruby = it.m('ruby', '#FF2E55', 0.35)
    sapphire = it.m('sapphire', '#2F86FF', 0.35)
    pearl = it.m('pearl', '#FFF6E8', 0.38)
    band = [(0.54, 1.925), (0.592, 1.92), (0.614, 1.944), (0.614, 2.085), (0.594, 2.108), (0.548, 2.108)]
    btag = {0: gold_lo, 1: gold_hi, 2: gold, 3: gold_hi, 4: gold, 5: gold_lo}
    it.add('head', lathe(band, 16, closed=True, phase=TAU / 32, tag=lambda b, s: btag[b]))
    point = [(-0.15, 0.0), (0.15, 0.0), (0.06, 0.17), (0.0, 0.29), (-0.06, 0.17)]
    for k in range(5):
        d = hdir(72 * k, 0)
        base = Vector((d.x * 0.588, d.y * 0.588, 2.08))
        m = frame(base, Vector((d.y, -d.x, 0.0)), Vector((0, 0, 1)) + d * 0.16)
        it.add('head', prism(point, 0.04, 0.012, tag=lambda k_, b: gold_hi if k_ == 'front' else gold), None, m)
        tip = m @ Vector((0, 0.322, 0.0))
        it.add('head', ellipsoid(tip, (0.042, 0.042, 0.042), 6, 3), pearl)
        gp = Vector((d.x * 0.618, d.y * 0.618, 2.015))
        it.add('head', decal(circle(8, 0.042 if k == 0 else 0.032), 0.02), ruby if k == 0 else sapphire,
               facing(gp, Vector((d.x, d.y, 0))))
    cap = [(0.556, 2.02), (0.52, 2.15), (0.34, 2.24), (0.0, 2.262)]
    it.add('head', lathe(cap, 12), velvet)
    it.add('head', ellipsoid((0, 0, 2.285), (0.055, 0.055, 0.05), 6, 4), gold_hi)
    return it


@builder
def hat_space():
    """Bubble space helmet: roomy white shell, orange face gasket, blue racing stripe, ear pods, antenna."""
    it = Item('hat_space')
    white = it.m('shell', '#F7FBFF', 0.4)
    stripe = it.m('stripe', '#2FA8F0', 0.4)
    gasket = it.m('gasket', '#FF8A2A', 0.45)
    pod = stripe
    pod_rim = it.m('pod rim', '#B8C4D6', 0.4)
    ball = it.m('antenna ball', '#FF4058', 0.38)

    def tag(kind, b, s):
        if kind == 'rim':
            return gasket
        return stripe if s == 4 and b < 5 else white
    it.add('head', hood(0.745, 60, 30, 16, lip=0.075, crest=0.04, steps=(180, 145, 110, 80), tag=tag,
                        squash_z=1.2, squash=0.35))
    for sx in (-1, 1):
        p, d = on_head(92 * sx, -4, 0.72)
        prof = [(0.16, -0.03), (0.172, 0.02), (0.15, 0.065), (0.09, 0.085), (0.0, 0.09)]
        it.add('head', lathe(prof, 12, tag=lambda b, s: pod_rim if b <= 1 else pod), None,
               facing(p, d))
    base, d = on_head(38, 58, 0.72)
    tip = base + Vector((0.03, 0.02, 0.3))
    mid = base + (tip - base) * 0.5 + Vector((0.01, 0, 0))
    it.add('head', tube([base, mid, tip], [0.022, 0.018, 0.016], 5), pod_rim)
    it.add('head', ellipsoid(tip + Vector((0, 0, 0.04)), (0.06, 0.06, 0.06), 8, 5), ball)
    return it


@builder
def hat_lantern():
    """Miner's helmet with a glowing soul lamp on the front (emissive lens)."""
    it = Item('hat_lantern')
    shell_m = it.m('helmet', '#2F55C8', 0.45)
    shell_hi = it.m('helmet light', '#4C78E8', 0.45)
    ridge = it.m('ridge', '#223F9A', 0.45)
    brass = it.m('brass', '#F5B21E', 0.38)
    brass_hi = it.m('brass light', '#FFE07A', 0.36)
    glow = it.m('glow', '#9CFBFF', 0.4, emit='#7DF6FF', strength=3.0)
    prof = [(0.63, 1.842), (0.8, 1.83), (0.818, 1.85), (0.79, 1.872), (0.7, 1.884), (0.694, 1.99),
            (0.664, 2.12), (0.58, 2.25), (0.41, 2.335), (0.0, 2.365)]
    it.add('head', lathe(prof, 18, tag=lambda b, s: shell_hi if b == 6 else shell_m).map(
        brim_oval(0.7, 0.3)))
    # A ridge over the crown, front to back, sitting on the shell (the upper shell is ~0.84 from the head centre).
    path = [on_head(0, a, 0.842 if a > 40 else 0.8)[0] for a in (46, 66, 90, 114, 138, 158)]
    it.add('head', tube(path, (0.045, 0.034), 6, cap_start=True, cap_end=True, ref=X_AXIS), ridge)
    p, d = on_head(0, 42, 0.8)
    n = (d + Vector((0, -0.9, -0.2))).normalized()
    m = facing(p, n, up=(0, 0, 1))
    it.add('head', rbox((0.13, 0.1, 0.06), 0.035, (0, 0, -0.03)), brass, m)
    prof = [(0.13, 0.0), (0.158, 0.02), (0.16, 0.09), (0.14, 0.116), (0.118, 0.108)]
    it.add('head', lathe(prof, 14, tag=lambda b, s: brass_hi if b == 2 else brass), None, m)
    it.add('head', decal(circle(14, 0.12), 0.045), glow, m @ xf((0, 0, 0.1)))
    it.transform('head', about(HC, rx=-6))
    return it


@builder
def hat_cowboy():
    it = Item('hat_cowboy')
    felt = it.m('felt', '#E08A3A', 0.55)
    felt_dark = it.m('felt dark', '#B8622A', 0.55)
    band = it.m('band', '#E8324A', 0.45)
    star_m = it.m('star', '#FFD23A', 0.38)
    crown = [(0.635, 1.86), (0.668, 1.885), (0.672, 1.975), (0.656, 1.995), (0.64, 2.16), (0.6, 2.33),
             (0.5, 2.44), (0.3, 2.47), (0.14, 2.39), (0.0, 2.36)]

    def pinch(th, i):
        if i < 5:
            return 1.0
        front = max(0.0, -math.sin(th))
        # Pinched front, and a lengthwise crease on top (sides higher than the middle line).
        return (1.0 - 0.16 * front ** 3 * min(1.0, (i - 4) / 3),
                -0.05 * (1.0 - math.cos(th) ** 2) * (1 if i >= 7 else 0))
    it.add('head', lathe(crown, 16, mod=pinch, tag=lambda b, s: band if b <= 2 else felt))
    brim = [(0.62, 1.86), (0.96, 1.83), (1.0, 1.846), (0.975, 1.872), (0.8, 1.886), (0.62, 1.9)]
    btag = {0: felt_dark, 1: felt, 2: felt, 3: felt, 4: felt, 5: felt_dark}

    def curl(v):
        rho = math.hypot(v.x, v.y)
        if rho < 0.64:
            return v
        t = min(1.0, (rho - 0.64) / 0.34)
        c = (v.x / rho) ** 2
        return (v.x, v.y, v.z + 0.34 * c ** 1.5 * t * t - 0.035 * (1 - c) * t)
    it.add('head', lathe(brim, 18, closed=True, tag=lambda b, s: btag[b]).map(brim_oval(0.62, 0.14)).map(curl))
    it.add('head', prism(star(5, 0.062, 0.028), 0.02, 0.006), star_m, facing((0, -0.676, 1.93), (0, -1, 0.02)))
    it.transform('head', about(HC, rx=-12))
    return it


@builder
def hat_wizard():
    it = Item('hat_wizard')
    purple = it.m('felt', '#8B4DFF', 0.5)
    purple_dark = it.m('felt dark', '#6634D6', 0.5)
    gold = it.m('band', '#FFC21E', 0.4)
    star_m = it.m('star', '#FFE45C', 0.38)
    moon = it.m('moon', '#FFF0A0', 0.38)
    brim = [(0.6, 1.855), (0.87, 1.832), (0.92, 1.846), (0.9, 1.866), (0.74, 1.88), (0.6, 1.896)]
    btag = {0: purple_dark, 1: purple, 2: purple, 3: purple, 4: purple, 5: purple_dark}
    it.add('head', lathe(brim, 20, closed=True, tag=lambda b, s: btag[b]).map(brim_oval(0.6, 0.1)))
    path = [(0, 0.02, 1.86), (0, 0.02, 1.975), (0, 0.03, 2.2), (0.0, 0.06, 2.45), (0.02, 0.12, 2.68),
            (0.07, 0.22, 2.87), (0.15, 0.36, 2.98), (0.23, 0.47, 2.99)]
    radii = [0.665, 0.665, 0.55, 0.43, 0.31, 0.2, 0.105, 0.0]
    fr = []
    it.add('head', tube(path, radii, 16, tag=lambda b, s: gold if b == 0 else purple, ref=X_AXIS,
                        frames=fr))
    moon_o = [(0.05 * math.cos(RAD(a)), 0.05 * math.sin(RAD(a))) for a in range(40, 321, 35)]
    moon_o += [(0.03 * math.cos(RAD(a)) + 0.018, 0.034 * math.sin(RAD(a))) for a in range(300, 59, -48)]
    # Stars and a crescent moon on the cone (frame angle 0 is +X, -90 the front).
    for idx, a, size, shape in ((2, -80, 0.07, 'star'), (3, -125, 0.055, 'star'), (4, -60, 0.045, 'star'),
                                (2, -150, 0.05, 'moon'), (3, -30, 0.05, 'star'), (5, -95, 0.04, 'star'),
                                (2, -20, 0.045, 'star')):
        nv, bv = fr[idx]
        p0, p1 = Vector(path[idx]), Vector(path[idx + 1])
        r = (radii[idx] + radii[idx + 1]) / 2
        rad = (nv * math.cos(RAD(a)) + bv * math.sin(RAD(a))).normalized()
        tang = (p1 - p0).normalized()
        n = (rad + tang * ((radii[idx] - radii[idx + 1]) / (p1 - p0).length)).normalized()
        p = (p0 + p1) / 2 + rad * r
        outline = star(5, size, size * 0.46) if shape == 'star' else moon_o
        g = decal(outline, 0.012).xf(facing(p + n * 0.006, n, up=tang))
        it.add('head', g, moon if shape == 'moon' else star_m)
    it.transform('head', about(HC, rx=-6))
    return it


@builder
def hat_pirate():
    """Tricorn with gold trim, a skull and crossbones on the front wall and a red feather."""
    it = Item('hat_pirate')
    felt = it.m('felt', '#2C3150', 0.5)
    felt_hi = it.m('felt light', '#3F4670', 0.5)
    gold = it.m('trim', '#FFC21E', 0.4)
    bone = it.m('skull', '#FFFDF4', 0.45)
    feather = it.m('feather', '#FF3B4E', 0.5)
    feather_tip = it.m('feather tip', '#FF8A2A', 0.5)
    crown = [(0.64, 1.86), (0.676, 1.9), (0.672, 2.02), (0.632, 2.15), (0.52, 2.26), (0.3, 2.322), (0.0, 2.34)]
    it.add('head', lathe(crown, 14, tag=lambda b, s: felt_hi if b == 4 else felt))

    def wall(th):
        az = (math.degrees(th) + 90.0) % 120.0
        delta = min(az, 120.0 - az)            # 0 at the middle of a wall, 60 at a corner
        R = 0.72 / math.cos(RAD(0.78 * delta))
        H = 1.9 + 0.3 * max(0.0, math.cos(RAD(1.5 * delta))) ** 1.15
        return [(0.64, 1.846), (R - 0.02, 1.84), (R + 0.016, 1.872), (R + 0.006, H - 0.022), (R - 0.036, H),
                (R - 0.074, H - 0.032), (R - 0.07, 1.905)]
    segs = 24
    verts, faces, tags, idx = [], [], [], []
    for s in range(segs):
        th = TAU * s / segs
        row = []
        for r, z in wall(th):
            row.append(len(verts))
            verts.append((r * math.cos(th), r * math.sin(th), z))
        idx.append(row)
    wtag = {0: felt, 1: felt, 2: felt, 3: gold, 4: gold, 5: felt, 6: felt}
    for s in range(segs):
        s2 = (s + 1) % segs
        for i in range(7):
            i2 = (i + 1) % 7
            faces.append((idx[s][i], idx[s2][i], idx[s2][i2], idx[s][i2]))
            tags.append(wtag[i])
    it.add('head', Geo(verts, faces, tags).outward())
    # Skull and crossbones on the front wall.
    m = facing((0, -0.744, 2.04), Vector((0, -1, 0.04)).normalized(), up=(0, 0, 1))
    bar = [(-0.12, -0.016), (0.12, -0.016), (0.12, 0.016), (-0.12, 0.016)]
    for sx in (-1, 1):
        rot = Matrix.Rotation(RAD(32 * sx), 4, 'Z')
        it.add('head', decal(bar, 0.004), bone, m @ Matrix.Translation((0, -0.03, 0.002)) @ rot)
        for ex in (-1, 1):
            for ey in (-1, 1):
                it.add('head', decal(circle(6, 0.024), 0.004), bone,
                       m @ Matrix.Translation((0, -0.03, 0.003)) @ rot @ Matrix.Translation((0.12 * ex, 0.018 * ey, 0)))
    it.add('head', decal(circle(12, 0.068, 0, 1.0, 0.92), 0.012), bone, m @ xf((0, 0.022, 0.006)))
    it.add('head', decal([(-0.04, 0.0), (-0.035, -0.04), (0.035, -0.04), (0.04, 0.0)], 0.006), bone,
           m @ xf((0, -0.02, 0.006)))
    for sx in (-1, 1):
        it.add('head', decal(circle(6, 0.02), 0.004), felt, m @ xf((0.026 * sx, 0.02, 0.019)))
    # Feather: sweeping up and back from the left corner.
    fp = [(0.0, 0.0), (0.08, -0.03), (0.2, -0.04), (0.33, -0.03), (0.42, 0.0), (0.33, 0.045), (0.2, 0.06), (0.08, 0.045)]
    g = slab(fp, 0.025, centre=(0.18, 0.0)).retag(lambda t, c: feather_tip if c.x > 0.3 else feather)
    it.add('head', g, None, frame((-0.62, 0.34, 2.02), (-0.35, 0.5, 0.8), (0.9, 0.2, 0.2)))
    it.transform('head', about(HC, rx=-5))
    return it


@builder
def hat_chef():
    it = Item('hat_chef')
    white = it.m('cotton', '#FFFDF7', 0.55)
    shade = it.m('pleat', '#E3ECF7', 0.55)
    red = it.m('stripe', '#EF3B3B', 0.45)
    band = [(0.64, 1.832), (0.672, 1.845), (0.678, 1.88), (0.678, 1.915), (0.676, 2.05), (0.668, 2.075)]
    it.add('head', lathe(band, 16, tag=lambda b, s: red if b == 2 else white))
    puff = [(0.64, 2.04), (0.72, 2.1), (0.8, 2.21), (0.828, 2.33), (0.79, 2.46), (0.665, 2.555), (0.42, 2.62),
            (0.0, 2.64)]

    def pleat(th, i):
        return 1.0 + (0.05 if 1 <= i <= 5 else 0.025 if i == 6 else 0.0) * math.cos(8 * th)
    segs = 24
    it.add('head', lathe(puff, segs, mod=pleat,
                         tag=lambda b, s: shade if math.cos(8 * TAU * (s + 0.5) / segs) < -0.6 and b < 6 else white))
    return it


@builder
def hat_bunny():
    """Bunny-ear headband: a pink band over the head and two long ears, one flopped forward."""
    it = Item('hat_bunny')
    band = it.m('band', '#FF4F86', 0.45)
    ear = it.m('ear', '#FFFDF7', 0.5)
    inner = it.m('ear inner', '#FF9CC2', 0.5)
    bow_m = it.m('bow', '#FFC21E', 0.45)
    arc = [HC + Vector((0.674 * math.sin(RAD(a)), 0.07, 0.674 * math.cos(RAD(a)))) for a in range(-100, 101, 20)]
    it.add('head', tube(arc, (0.05, 0.03), 6, cap_start=True, cap_end=True, ref=(0, 1, 0)), band)

    def ear_tag(b, s):
        a = TAU * (s + 0.5) / 10 + TAU / 20
        return inner if (math.sin(a) < -0.55 and 1 <= b <= 3) else ear
    left = [(-0.2, 0.07, 2.19), (-0.22, 0.07, 2.36), (-0.26, 0.075, 2.62), (-0.3, 0.08, 2.86), (-0.32, 0.085, 3.0),
            (-0.325, 0.088, 3.06)]
    right = [(0.2, 0.07, 2.19), (0.22, 0.07, 2.36), (0.27, 0.06, 2.62), (0.32, -0.04, 2.8), (0.36, -0.18, 2.86),
             (0.372, -0.235, 2.855)]
    radii = [(0.055, 0.036), (0.1, 0.046), (0.125, 0.05), (0.11, 0.047), (0.065, 0.034), (0.0, 0.0)]
    for path in (left, right):
        it.add('head', tube(path, radii, 10, ang0=TAU / 20, tag=ear_tag, ref=X_AXIS))
    p = HC + Vector((0.668 * math.sin(RAD(-52)), 0.07, 0.668 * math.cos(RAD(-52))))
    n = (p - HC).normalized()
    bow(it, 'head', p + n * 0.03, n, bow_m, bow_m, 1.0, up=(0, 1, 0))
    return it


@builder
def hat_cat():
    """Orange cat-ear beanie: ribbed cuff, tabby stripes and pink-lined ears."""
    it = Item('hat_cat')
    knit = it.m('knit', '#FF8A2A', 0.6)
    stripe = it.m('stripe', '#E2601A', 0.6)
    cuff = it.m('cuff', '#FFB04A', 0.6)
    cuff_dark = it.m('cuff rib', '#F29A38', 0.6)
    pink = it.m('ear pink', '#FF9CC2', 0.5)
    prof = [(0.655, 1.79), (0.696, 1.798), (0.708, 1.83), (0.708, 1.93), (0.694, 1.958), (0.668, 1.968),
            (0.676, 2.0), (0.66, 2.1), (0.606, 2.195), (0.49, 2.28), (0.3, 2.338), (0.0, 2.356)]
    segs = 16
    phase = -TAU / 32          # face centres at az 0, +-22.5, ...

    def fn(z, az, b, s):
        if b <= 4:
            return cuff_dark if s % 2 else cuff
        if b in (6, 8):
            return stripe                      # tabby rings
        return knit
    it.add('head', lathe(prof, segs, phase=phase, tag=zaz_tag(prof, segs, fn, phase)))
    ear = [(-0.16, 0.0), (0.16, 0.0), (0.05, 0.34), (-0.05, 0.34)]
    inner_o = [(-0.1, 0.0), (0.1, 0.0), (0.03, 0.2), (-0.03, 0.2)]
    for sx in (-1, 1):
        p = Vector((0.37 * sx, -0.33, 2.2))
        fwd = hdir(20 * sx, 0)
        m = frame(p, Vector((-fwd.y, fwd.x, 0)), Vector((0.25 * sx, -0.1, 1.0)))
        m = m @ xf((0, 0, 0), (0, 0, -12 * sx))
        it.add('head', prism(ear, 0.08, 0.022), knit, m)
        it.add('head', prism(inner_o, 0.02, 0.006), pink, m @ xf((0, 0.1, 0.04)))
    return it


@builder
def hat_viking():
    it = Item('hat_viking')
    steel = it.m('steel', '#A9B8D2', 0.4)
    steel_mid = it.m('steel mid', '#7E8FAE', 0.42)
    steel_hi = it.m('steel light', '#E6EEFF', 0.38)
    gold = it.m('gold', '#FFC21E', 0.4)
    gold_hi = it.m('gold light', '#FFE07A', 0.38)
    horn = it.m('horn', '#FFF1D2', 0.45)
    horn_tip = it.m('horn tip', '#E4B978', 0.45)
    prof = [(0.64, 1.82), (0.728, 1.828), (0.742, 1.855), (0.738, 1.915), (0.712, 1.935), (0.69, 1.96),
            (0.672, 2.07), (0.625, 2.2), (0.52, 2.31), (0.32, 2.385), (0.0, 2.41)]
    btag = {0: gold, 1: gold_hi, 2: gold, 3: gold, 4: steel_mid, 5: steel_mid, 6: steel, 7: steel_hi, 8: steel, 9: steel}
    it.add('head', lathe(prof, 16, tag=lambda b, s: btag.get(b, steel)))
    # Gold cross-straps over the crown (front-back and side to side), riding on the dome profile.
    for th in (-90.0, 0.0):
        pts = []
        for sgn in (1, -1):
            idx = range(5, 10) if sgn == 1 else range(8, 4, -1)
            for i in idx:
                r, z = prof[i]
                t = RAD(th if sgn == 1 else th + 180.0)
                pts.append((r * 1.035 * math.cos(t), r * 1.035 * math.sin(t), z + 0.022))
        it.add('head', tube(pts, 0.034, 5, cap_start=True, cap_end=True), gold)
    for k in range(8):
        d = hdir(22.5 + 45 * k, 0)
        p = Vector((d.x * 0.742, d.y * 0.742, 1.885))
        it.add('head', decal(circle(6, 0.024), 0.02), gold_hi, facing(p, Vector((d.x, d.y, 0))))
    path = [(0.655, 0.02, 1.99), (0.82, 0.0, 2.035), (0.95, -0.02, 2.14), (1.02, -0.02, 2.3), (1.02, 0.0, 2.45),
            (0.985, 0.02, 2.56)]
    radii = [0.12, 0.115, 0.1, 0.075, 0.045, 0.0]
    g = tube(path, radii, 8, tag=lambda b, s: gold if b == 0 else (horn_tip if b >= 3 else horn))
    it.add('head', g)
    it.add('head', g.mirrored())
    return it


@builder
def hat_santa():
    it = Item('hat_santa')
    red = it.m('felt', '#E8243B', 0.5)
    red_dark = it.m('felt dark', '#C11A30', 0.5)
    fur = it.m('fur', '#FFFDF7', 0.6)
    prof = [(0.7 + 0.075 * math.cos(TAU * j / 6), 1.875 + 0.068 * math.sin(TAU * j / 6)) for j in range(6)]
    it.add('head', lathe(prof, 20, closed=True, mod=lambda th, i: 1.0 + 0.018 * math.cos(9 * th)), fur)
    path = [(0, 0.02, 1.88), (0, 0.03, 2.1), (0.02, 0.06, 2.33), (0.1, 0.12, 2.52), (0.25, 0.2, 2.62),
            (0.42, 0.26, 2.6), (0.55, 0.3, 2.5), (0.62, 0.32, 2.38)]
    radii = [0.68, 0.64, 0.52, 0.38, 0.26, 0.17, 0.11, 0.075]
    it.add('head', tube(path, radii, 14, cap_end=True,
                        tag=lambda b, s: red_dark if (s in (5, 6) and b >= 3) else red, ref=X_AXIS))
    tip = Vector(path[-1]) + Vector((0.03, 0.01, -0.09))
    g = ellipsoid(tip, (0.13, 0.13, 0.12), 10, 6)
    g = g.map(lambda v: tip + (v - tip) * (1.0 + 0.08 * math.sin(7 * math.atan2(v.y - tip.y, v.x - tip.x))
                                           * math.cos(5 * (v.z - tip.z) / 0.12)))
    it.add('head', g, fur)
    return it


@builder
def hat_graduate():
    it = Item('hat_graduate')
    navy = it.m('cloth', '#2B4CA8', 0.5)
    navy_dark = it.m('cloth dark', '#1E357C', 0.5)
    gold = it.m('tassel', '#FFC21E', 0.42)
    gold_hi = it.m('tassel light', '#FFE07A', 0.4)
    cap = [(0.64, 1.84), (0.676, 1.86), (0.68, 1.95), (0.67, 2.08), (0.63, 2.17), (0.5, 2.236), (0.0, 2.25)]
    it.add('head', lathe(cap, 16, tag=lambda b, s: navy_dark if b <= 1 else navy))
    board = rbox((0.63, 0.63, 0.03), 0.03, (0, 0, 2.27), 8, tag=lambda b, s: navy if b >= 2 else navy_dark)
    it.add('head', board.xf(Matrix.Rotation(RAD(45), 4, 'Z')))
    it.add('head', lathe([(0.05, 2.296), (0.045, 2.31), (0.0, 2.322)], 8), gold)
    corner = 0.63 * math.sqrt(2) - 0.03
    path = [(0, 0, 2.31), (0.4, 0.0, 2.312), (corner - 0.03, 0.0, 2.31), (corner + 0.01, 0.0, 2.28),
            (corner + 0.02, -0.01, 2.15)]
    it.add('head', tube(path, 0.016, 5), gold)
    tp = [(0.028, 2.16), (0.05, 2.1), (0.062, 2.0), (0.064, 1.96), (0.0, 1.95)]
    it.add('head', lathe(list(reversed(tp)), 8, tag=lambda b, s: gold_hi if b == 3 else gold).moved(
        (corner + 0.02, -0.01, 0.0)))
    it.transform('head', about(HC, rx=-4, ry=-3))
    return it


@builder
def hat_samurai():
    """Kabuto: red lacquer bowl with gold rim and crescent crest, navy lamellar neck guard."""
    it = Item('hat_samurai')
    red = it.m('lacquer', '#D62839', 0.4)
    red_dark = it.m('lacquer dark', '#A81C2E', 0.42)
    gold = it.m('gold', '#FFC21E', 0.4)
    gold_hi = it.m('gold light', '#FFE07A', 0.38)
    navy = it.m('lames', '#2B4CA8', 0.45)
    navy_hi = it.m('lames light', '#4C78E0', 0.45)
    prof = [(0.64, 1.84), (0.722, 1.848), (0.735, 1.878), (0.708, 1.9), (0.692, 1.95), (0.68, 2.06),
            (0.63, 2.2), (0.52, 2.32), (0.3, 2.4), (0.0, 2.42)]
    it.add('head', lathe(prof, 14,
                         tag=lambda b, s: gold if b <= 2 else (red_dark if s % 2 else red)))
    it.add('head', lathe([(0.075, 2.405), (0.075, 2.43), (0.045, 2.462), (0.0, 2.47)], 8), gold)
    arc = (RAD(-20), RAD(200))
    for z0, r0, r1, dz in ((1.87, 0.712, 0.8, 0.19), (1.72, 0.775, 0.865, 0.19)):
        plate = [(r0, z0), (r1, z0 - dz), (r1 + 0.03, z0 - dz + 0.012), (r0 + 0.035, z0 + 0.03)]
        it.add('head', lathe(plate, 12, closed=True, arc=arc,
                             tag=lambda b, s: gold if b == 1 else (navy_hi if b == 2 else navy)))
    crescent = [(0.5 * math.cos(RAD(a)), 0.5 * math.sin(RAD(a)) + 0.5) for a in range(200, 341, 20)]
    crescent += [(0.4 * math.cos(RAD(a)), 0.36 * math.sin(RAD(a)) + 0.5) for a in range(330, 209, -24)]
    crescent = list(reversed(crescent))
    m = facing((0, -0.735, 1.98), (0, -1, 0.1), up=(0, 0, 1))
    it.add('head', prism(crescent, 0.03, 0.0, tag=lambda k, b: gold_hi if k == 'front' else gold), None,
           m @ xf((0, 0.02, 0.012), scale=(1.1, 1.1, 1.0)))
    it.add('head', prism(circle(10, 0.07), 0.04, 0.012, tag=lambda k, b: gold_hi if k == 'front' else gold), None,
           m @ xf((0, 0.015, 0.018)))
    return it


@builder
def hat_party():
    it = Item('hat_party')
    cols = [it.m('pink', '#FF4F86', 0.45), it.m('yellow', '#FFC83A', 0.45), it.m('blue', '#2FA8F0', 0.45)]
    frill = it.m('frill', '#FFFDF7', 0.5)
    pom = it.m('pompom', '#FFC83A', 0.55)
    base_z = 2.13
    cone = [(0.4, base_z), (0.36, base_z + 0.12), (0.31, base_z + 0.26), (0.245, base_z + 0.41), (0.17, base_z + 0.56),
            (0.095, base_z + 0.7), (0.0, base_z + 0.81)]
    it.add('head', lathe(cone, 18, tag=lambda b, s: cols[(s // 2 + b) % 3]))
    ruffle = [(0.36, base_z), (0.53, base_z - 0.08), (0.555, base_z - 0.05), (0.37, base_z + 0.04)]
    it.add('head', lathe(ruffle, 20, closed=True,
                         mod=lambda th, i: (1.0 + (0.07 if i in (1, 2) else 0.0) * math.cos(10 * th),
                                            (0.012 if i in (1, 2) else 0.0) * math.cos(10 * th))), frill)
    c = Vector((0, 0, base_z + 0.87))
    g = ellipsoid(c, (0.12, 0.12, 0.115), 8, 6)
    g = g.map(lambda v: c + (v - c) * (1.0 + 0.1 * math.sin(5 * math.atan2(v.y, v.x)) * math.sin(3 * (v.z - c.z) / 0.1)))
    it.add('head', g, pom)
    it.transform('head', about(HC, ry=-13, rx=-4))
    return it


@builder
def hat_halo():
    it = Item('hat_halo')
    gold = it.m('glow', '#FFD65C', 0.4, emit='#FFC83A', strength=2.2)
    light = it.m('glow light', '#FFF4BE', 0.4, emit='#FFE9A0', strength=2.2)
    spark = it.m('sparkle', '#FFFFFF', 0.4, emit='#FFF8DC', strength=2.5)
    z = 2.5
    it.add('head', torus(0.36, 0.058, 20, 6, tag=lambda b, s: light if b in (2, 3) else gold).moved((0, 0, z)))
    four = star(4, 0.07, 0.022)
    for k, az in enumerate((50, 170, 290)):
        d = hdir(az, 0)
        p = Vector((d.x * 0.36, d.y * 0.36, z + 0.1 + 0.02 * k))
        it.add('head', prism(four, 0.02, 0.0), spark, facing(p, Vector((d.x, d.y, 0.0)), up=(0, 0, 1), spin=10 * k))
    it.transform('head', about((0, 0, z), rx=8, ry=-6))
    return it


@builder
def hat_frog():
    """Frog hood: big eyes on top and a pink mouth-lining around the face."""
    it = Item('hat_frog')
    green = it.m('skin', '#4CC23A', 0.5)
    green_dark = it.m('skin dark', '#2E9A34', 0.5)
    mouth = it.m('lining', '#FF6F91', 0.5)
    white = it.m('eye white', '#FFFFFF', 0.38)
    black = it.m('pupil', '#1E2230', 0.35)
    belly = it.m('belly', '#C8F06A', 0.5)
    it.add('head', hood(0.68, 66, 32, 16, tag=lambda k, b, s: mouth if k == 'rim' else (green_dark if b == 0 else green)))
    for sx in (-1, 1):
        p, d = on_head(30 * sx, 50, 0.64)
        sock = p + d * 0.05
        it.add("head", ellipsoid(sock, (0.2, 0.19, 0.18), 8, 5), green)
        look = hdir(6 * sx, 12)
        eye_c = sock + look * 0.065 + Vector((0, 0, 0.03))
        it.add("head", ellipsoid(eye_c, (0.16, 0.16, 0.155), 8, 5), white)
        it.add('head', decal(circle(10, 0.075), 0.03), black, facing(eye_c + look * 0.148, look))
        it.add('head', decal(circle(5, 0.022, 0.4), 0.005), white,
               facing(eye_c + look * 0.155 + Vector((-0.03 * sx, 0, 0.04)), look))
    for sx in (-1, 1):
        p, d = on_head(58 * sx, 32, 0.686)
        it.add('head', decal(circle(8, 0.05), 0.01), belly, facing(p, d))
    return it


# ================================================================= outfits
# The torso piece hugs the envelope (a little proud of it, pulled in at the back so the backpack still
# shows), the sleeves wrap the arms from the shoulder dome down to a cuff above the hand, and capes and
# wings hang behind, clear of the backpack. The head hides everything above z ~1.1 from the game camera,
# so the readable parts are the lower chest, belt, hem, sleeves and whatever sticks out.
def stag(cuff, body, top=None, extra=None):
    """Sleeve tag: cuff bands (bottom cap and bands 0-2), body, shoulder dome (bands 5-6)."""
    def t(b, s):
        if extra and b in extra:
            return extra[b]
        if b <= 2:
            return cuff
        if top is not None and b >= 4:
            return top
        return body
    return t


def strap(prof, pts, lift, width, thick, sides=4):
    """A flat band lying on the shell along [(az, z)]."""
    path = surface_path(prof, pts, lift)
    _, n = on_shell(prof, pts[0][0], pts[0][1])
    return tube(path, (thick, width), sides, ang0=TAU / sides / 2, cap_start=True, cap_end=True, ref=n)


def back_r(prof, az, z):
    """Shell radius at (az, z) including the back pull-in used by shell()."""
    th = RAD(az - 90.0)
    return shell_r(prof)(z) * (1.0 - 0.045 * max(0.0, math.sin(th)) ** 2)


def fluffy_ring(r, z, rr, rz, segs, bumps, amp=0.04, dz=0.015, tag=None, sides=6):
    prof = [(r + rr * math.cos(TAU * j / sides), z + rz * math.sin(TAU * j / sides)) for j in range(sides)]
    return lathe(prof, segs, closed=True, tag=tag,
                 mod=lambda th, i: (1.0 + amp * math.cos(bumps * th), dz * math.cos(bumps * th + 0.8)))


def wing_frame(root, out, up):
    return frame(root, out, up)


@builder
def armor_leather():
    it = Item('armor_leather')
    leather = it.m('leather', '#B8612C', 0.5)
    light = it.m('leather light', '#DB8C45', 0.5)
    dark = it.m('leather dark', '#6E3A1E', 0.5)
    shirt = it.m('shirt', '#FFF1D2', 0.55)
    gold = it.m('buckle', '#FFC21E', 0.4)
    prof = shirt_profile(0.46, 0.036, 0.022, bands=[(0.6, 0.67, 0.016)])

    def fn(z, az, b, s):
        if b == -2:
            return dark
        if z < 0.5:
            return light if s % 2 else leather
        if 0.6 <= z <= 0.67:
            return dark
        if z > 0.8 and abs(az) < 12 + (z - 0.8) * 100:
            return shirt
        return leather
    shell(it, prof, fn)
    p, n = on_shell(prof, 0, 0.635, 0.018)
    m = facing(p, n)
    it.add('body', rbox((0.075, 0.055, 0.02), 0.018), gold, m)
    it.add('body', decal([(-0.04, -0.025), (0.04, -0.025), (0.04, 0.025), (-0.04, 0.025)], 0.003), dark, m @ xf((0, 0, 0.021)))
    pts = [(44, 1.05), (30, 0.97), (14, 0.88), (-4, 0.8), (-22, 0.72), (-40, 0.66), (-58, 0.6)]
    it.add('body', strap(prof, pts, 0.014, 0.036, 0.013), dark)
    for az, z in ((30, 0.97), (-4, 0.8), (-40, 0.66)):
        q, nq = on_shell(prof, az, z, 0.03)
        it.add('body', decal(circle(6, 0.017), 0.01), gold, facing(q, nq))
    sleeves(it, sleeve_profile(0.8, 0.156), stag(dark, leather, light))
    finish_sleeves(it)
    return it


@builder
def armor_wolf():
    it = Item('armor_wolf')
    fur = it.m('fur', '#7C8DB8', 0.55)
    belly = it.m('belly', '#D5DEEE', 0.55)
    dark = it.m('fur dark', '#56628A', 0.55)
    white = it.m('fluff', '#F2F6FC', 0.6)
    prof = shirt_profile(0.46, 0.04, 0.03)

    def fn(z, az, b, s):
        if b == -2:
            return dark
        if z < 0.5:
            return dark if s % 2 else fur
        if abs(az) < 32 and z < 0.94:
            return belly
        return fur
    shell(it, prof, fn)
    it.add('body', fluffy_ring(0.405, 1.08, 0.075, 0.065, 18, 9, 0.05, 0.016), white)
    path = [(0, 0.37, 0.62), (0, 0.5, 0.56), (0.04, 0.62, 0.46), (0.1, 0.67, 0.34), (0.15, 0.64, 0.24),
            (0.17, 0.6, 0.2)]
    radii = [0.06, 0.11, 0.13, 0.11, 0.07, 0.0]
    it.add('body', tube(path, radii, 8, cap_start=True, tag=lambda b, s: white if b >= 3 else fur))
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.032, cuff_h=0.07), stag(white, fur))
    finish_sleeves(it)
    it.note = 'Fluffy tail below the backpack (z 0.2-0.62).'
    return it


@builder
def armor_space():
    it = Item('armor_space')
    white = it.m('suit', '#F4F8FF', 0.42)
    sky = it.m('stripe', '#2FA8F0', 0.42)
    orange = it.m('belt', '#FF8A2A', 0.45)
    panel = it.m('panel', '#3B4F8C', 0.42)
    red = it.m('button red', '#FF3B4E', 0.38)
    yellow = it.m('button yellow', '#FFD23A', 0.38)
    green = sky
    prof = shirt_profile(0.46, 0.042, 0.02, bands=[(0.58, 0.66, 0.018)])

    def fn(z, az, b, s):
        if b == -2:
            return panel
        if 0.58 <= z <= 0.66:
            return orange
        if z < 0.5:
            return sky
        if abs(abs(az) - 90) < 12 and z < 1.02:
            return sky
        return white
    shell(it, prof, fn)
    p, n = on_shell(prof, 0, 0.84, 0.03)
    m = facing(p, n)
    it.add('body', rbox((0.14, 0.09, 0.035), 0.03), panel, m)
    for x, c in ((-0.075, red), (0.0, yellow), (0.075, green)):
        it.add('body', decal(circle(8, 0.026), 0.012), c, m @ xf((x, 0.012, 0.036)))
    it.add('body', decal([(-0.1, -0.012), (0.1, -0.012), (0.1, 0.012), (-0.1, 0.012)], 0.002), sky, m @ xf((0, -0.05, 0.036)))
    shell_decal(it, prof, star(5, 0.045, 0.02), yellow, -44, 0.96, 0.01)
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.018, cuff_h=0.06), stag(orange, white, white, {4: sky}))
    finish_sleeves(it)
    return it


@builder
def armor_bone():
    it = Item('armor_bone')
    tunic = it.m('tunic', '#6243B0', 0.5)
    tunic_dark = it.m('tunic dark', '#43307E', 0.5)
    bone = it.m('bone', '#F7F0DC', 0.45)
    shade = it.m('bone shade', '#E0D0AA', 0.45)
    prof = shirt_profile(0.46, 0.035, 0.02, bands=[(0.58, 0.64, 0.014)])

    def fn(z, az, b, s):
        if b == -2 or 0.58 <= z <= 0.64:
            return tunic_dark
        if z < 0.5:
            return tunic_dark if s % 2 else tunic
        return tunic
    shell(it, prof, fn)
    for z in (0.74, 0.82, 0.9, 0.98):
        for side in (-1, 1):
            pts = [(side * a, z - 0.05 * (a / 62.0) ** 2) for a in (9, 22, 36, 50, 62)]
            path = surface_path(prof, pts, 0.016)
            it.add('body', tube(path, [0.016, 0.026, 0.027, 0.024, 0.012], 4, cap_start=True, cap_end=True), bone)
    path = surface_path(prof, [(0, 0.7), (0, 0.86), (0, 1.03)], 0.02)
    it.add('body', tube(path, [0.036, 0.04, 0.034], 6, cap_start=True, cap_end=True), bone)
    p, n = on_shell(prof, 0, 0.61, 0.014)
    m = facing(p, n)
    it.add('body', ellipsoid((0, 0, 0), (0.06, 0.05, 0.03), 8, 4), bone, m @ xf((0, 0.01, 0.0)))
    for sx in (-1, 1):
        it.add('body', decal(circle(6, 0.015), 0.004), tunic_dark, m @ xf((0.022 * sx, 0.012, 0.029)))
    sleeves(it, sleeve_profile(0.8, 0.156, puff=0.012), stag(shade, tunic, bone))
    finish_sleeves(it)
    return it


@builder
def armor_leaf():
    it = Item('armor_leaf')
    base = it.m('tunic', '#3FAE3A', 0.5)
    leaf = it.m('leaf', '#5BCB3E', 0.45)
    light = it.m('leaf light', '#8BE05A', 0.45)
    dark = it.m('leaf dark', '#2A8A33', 0.45)
    vine = it.m('vine', '#2A7F2E', 0.5)
    petal = it.m('flower', '#FF5C8A', 0.45)
    centre = it.m('flower centre', '#FFC83A', 0.45)
    prof = shirt_profile(0.5, 0.035, 0.0, bands=[(0.64, 0.69, 0.014)])

    def fn(z, az, b, s):
        if b == -2 or 0.64 <= z <= 0.69:
            return vine
        return base
    shell(it, prof, fn)

    def put_leaf(az, z, length, width, down, material, out=0.35):
        p, n = on_shell(prof, az, z, 0.008)
        tang = UP.cross(n).normalized()
        axis = (-UP * down + n * out + UP * (1 - down)).normalized()
        g = slab(leaf_outline(length, width, 2), 0.02, centre=(length * 0.4, 0.0))
        it.add('body', g, material, frame(p, axis, tang))
    for k in range(8):
        put_leaf(45 * k + 22.5, 0.555, 0.22, 0.065, 1.0, leaf if k % 2 else light, 0.3)
    for k in range(8):
        put_leaf(45 * k, 0.75, 0.18, 0.055, 1.0, dark if k % 2 else leaf, 0.28)
    for az, z in ((16, 1.02), (-16, 1.02), (34, 0.97), (-34, 0.97)):
        put_leaf(az, z, 0.16, 0.05, 0.9, light, 0.25)
    shell_decal(it, prof, flower(5, 0.06, 0.4), petal, 0, 0.665, 0.012, lift=0.018)
    shell_decal(it, prof, circle(6, 0.02), centre, 0, 0.665, 0.01, lift=0.03)
    sleeves(it, sleeve_profile(0.8, 0.156), stag(light, base, base))
    for ang, ln in ((-30, 0.2), (-65, 0.17)):
        a = Vector((math.cos(RAD(ang)), 0.0, math.sin(RAD(ang))))
        g = slab(leaf_outline(ln, 0.055, 2), 0.02, centre=(ln * 0.4, 0.0))
        it.add('arm-right', g, leaf, frame((ARM_X + 0.05, ARM_Y - 0.02, 1.15), a, (0, 1, 0)))
    finish_sleeves(it)
    return it


@builder
def armor_cloud():
    it = Item('armor_cloud')
    sky = it.m('shirt', '#5EC4FF', 0.45)
    sky_dark = it.m('shirt dark', '#3AA3EC', 0.45)
    cloud = it.m('cloud', '#FFFFFF', 0.55)
    shade = it.m('cloud shade', '#DCEBFF', 0.55)
    red = it.m('rainbow red', '#FF4058', 0.42)
    yellow = it.m('rainbow yellow', '#FFC83A', 0.42)
    green = it.m('rainbow green', '#5FD84A', 0.42)
    prof = shirt_profile(0.52, 0.035, 0.0)
    shell(it, prof, lambda z, az, b, s: sky_dark if b == -2 else sky)
    it.add('body', fluffy_ring(env_r(0.52) + 0.06, 0.52, 0.085, 0.075, 16, 5, 0.07, 0.022, sides=5,
                               tag=lambda b, s: shade if b in (3, 4) else cloud))

    rf = shell_r(prof)
    for rr, col in ((0.17, red), (0.135, yellow), (0.1, green)):
        pts = []
        for k in range(9):
            t = math.pi * k / 8
            z = 0.7 + rr * math.sin(t)
            pts.append((math.degrees(rr * math.cos(t) / rf(z)), z))
        it.add('body', tube(surface_path(prof, pts, 0.018), 0.02, 4, cap_start=True, cap_end=True), col)
    for sx in (-1, 1):
        p, n = on_shell(prof, math.degrees(0.15 * sx / rf(0.7)), 0.7, 0.035)
        it.add('body', ellipsoid(p, (0.07, 0.05, 0.05), 6, 4), cloud)
        it.add('body', ellipsoid(p + Vector((0.04 * sx, -0.005, 0.03)), (0.045, 0.04, 0.04), 6, 4), cloud)
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.036, cuff_h=0.075, puff=0.02), stag(cloud, sky, cloud))
    finish_sleeves(it)
    return it


@builder
def armor_wings():
    """Fire dragon wings on a short red vest."""
    it = Item('armor_wings')
    vest = it.m('vest', '#D62839', 0.5)
    vest_dark = it.m('vest dark', '#A81C2E', 0.5)
    shirt = it.m('shirt', '#3A2E4F', 0.55)
    trim = it.m('trim', '#FFC21E', 0.4)
    outer = it.m('membrane outer', '#FFB02E', 0.5)
    mid = it.m('membrane', '#FF7A1A', 0.5)
    inner = it.m('membrane inner', '#FF4E2A', 0.5)
    bone = it.m('bone', '#8E1B2B', 0.45)
    claw = trim
    prof = shirt_profile(0.54, 0.035, 0.0)

    def fn(z, az, b, s):
        if b == -2:
            return vest_dark
        if abs(az) < 12:
            return shirt
        if z < 0.58:
            return vest_dark
        return vest
    shell(it, prof, fn)
    for sx in (-1, 1):
        it.add('body', strap(prof, [(20 * sx, 0.56), (20 * sx, 0.8), (21 * sx, 1.02)], 0.004, 0.018, 0.012), trim)
    # Right wing in its own plane, then mirrored.
    root = Vector((0.1, 0.47, 1.0))
    U = Vector((1.0, 0.32, 0.24)).normalized()
    Vv = Vector((0.0, 0.22, 1.0))
    m = frame(root, U, Vv)
    S, E, T = Vector((0.0, 0.1)), Vector((0.42, 0.42)), Vector((1.02, 0.62))
    f1, f2, f3, B = Vector((0.92, 0.04)), Vector((0.64, -0.17)), Vector((0.34, -0.25)), Vector((0.02, -0.1))

    def sc(a, b):
        mpt = (a + b) / 2
        return mpt + (E - mpt) * 0.2

    def curl(v):
        # Bow the wing back a little toward the tip.
        loc = m.inverted() @ v
        return v + Vector((0.0, 0.12 * max(0.0, loc.x) ** 2, 0.0))
    wing = []
    for outline, col in (([E, T, sc(T, f1), f1], outer), ([E, f1, sc(f1, f2), f2], mid),
                         ([E, f2, sc(f2, f3), f3, B, S], inner)):
        pts = [(p.x, p.y) for p in outline]
        c = ((outline[1] + outline[2]) / 2 + E) / 2
        wing.append((slab(pts, 0.03, centre=(c.x, c.y)).xf(m), col))
    for path, radii, sides in (([S, E, T], [0.05, 0.04, 0.012], 5), ([E, f1], [0.03, 0.01], 4),
                               ([E, f2], [0.03, 0.01], 4), ([E, f3], [0.03, 0.01], 4)):
        pts3 = [m @ Vector((p.x, p.y, 0.0)) for p in path]
        wing.append((tube(pts3, radii, sides, cap_start=True, cap_end=True), bone))
    ep = m @ Vector((E.x, E.y, 0.0))
    wing.append((lathe([(0.03, 0.0), (0.0, 0.1)], 5, cap_bottom=True).xf(facing(ep, (m.to_3x3() @ Vector((0.2, 1, 0))).normalized())), claw))
    for g, col in wing:
        it.both('body', g.map(curl), col)
    it.note = 'Wings spread from behind the backpack (roots at y 0.47); the vest has no sleeves.'
    return it


@builder
def armor_knight():
    it = Item('armor_knight')
    steel = it.m('steel', '#CBD5E6', 0.4)
    steel_mid = it.m('steel mid', '#97A6C0', 0.42)
    steel_hi = it.m('steel light', '#F1F6FF', 0.38)
    steel_dark = steel_mid
    gold = it.m('gold', '#FFC21E', 0.4)
    red = it.m('cross', '#E8243B', 0.45)
    mail = it.m('mail', '#8C98B2', 0.5)
    leather = it.m('belt', '#7A4A2A', 0.5)
    prof = shirt_profile(0.44, 0.046, 0.03, zs=(0.5, 0.56, 0.8, 0.95), bands=[(0.6, 0.66, 0.016)])

    def fn(z, az, b, s):
        if b == -2:
            return steel_dark
        if z > 1.02:
            return gold
        if 0.6 <= z <= 0.66:
            return leather
        if z < 0.6:
            return steel_mid if (b % 2) else steel
        if -40 < az < -12 and z < 0.98:
            return steel_hi
        if abs(az) > 110:
            return steel_mid
        return steel
    shell(it, prof, fn)
    arm, bar = 0.028, 0.14
    plus = [(-arm, -bar), (arm, -bar), (arm, 0.07 - arm - 0.02), (0.11, 0.07 - arm - 0.02), (0.11, 0.07 + arm - 0.02),
            (arm, 0.07 + arm - 0.02), (arm, 0.12), (-arm, 0.12), (-arm, 0.07 + arm - 0.02), (-0.11, 0.07 + arm - 0.02),
            (-0.11, 0.07 - arm - 0.02), (-arm, 0.07 - arm - 0.02)]
    p, n = on_shell(prof, 0, 0.83)
    g = prism(plus, 0.02).xf(facing(p, n))
    it.add('body', wrap_cyl(g, shell_r(prof), p, n, 0.003), red)
    q, nq = on_shell(prof, 0, 0.63, 0.016)
    it.add('body', rbox((0.07, 0.05, 0.02), 0.018), gold, facing(q, nq))
    for sx in (-1, 1):
        q, nq = on_shell(prof, 24 * sx, 0.53, 0.04)
        m = frame(q, UP.cross(nq), (UP - nq * 0.25))
        it.add('body', rbox((0.095, 0.075, 0.018), 0.018, tag=lambda b, s: gold if b in (0, 1, 2) else steel), None,
               m @ xf((0, -0.02, 0)))
    sp = [(0.128, 0.8), (0.155, 0.81), (0.155, 0.955), (0.2, 0.96), (0.212, 0.984), (0.198, 1.012),
          (0.206, 1.022), (0.22, 1.06), (0.185, 1.16), (0.11, 1.222), (0.0, 1.245)]
    ktag = {-1: mail, 0: mail, 1: mail, 2: gold, 3: steel_mid, 4: gold, 5: steel_mid, 6: steel, 7: steel_hi, 8: steel,
            9: steel}
    sleeves(it, sp, lambda b, s: ktag.get(b, steel), segs=8)
    finish_sleeves(it)
    return it


@builder
def armor_pirate():
    it = Item('armor_pirate')
    coat = it.m('coat', '#D62839', 0.5)
    coat_dark = it.m('coat dark', '#A81C2E', 0.5)
    gold = it.m('trim', '#FFC21E', 0.4)
    shirt = it.m('shirt', '#FFFDF7', 0.55)
    belt = it.m('belt', '#3A2A2A', 0.5)
    navy = it.m('cuff', '#2B4CA8', 0.5)
    prof = shirt_profile(0.34, 0.04, 0.08, flare_top=0.66, zs=(0.42, 0.52, 0.8, 0.95),
                         bands=[(0.6, 0.67, 0.02)])

    def fn(z, az, b, s):
        if b == -2:
            return coat_dark
        if z < 0.4:
            return gold
        if 0.6 <= z <= 0.67:
            return belt
        if abs(az) < 12:
            return shirt if z > 0.66 else coat_dark
        return coat
    shell(it, prof, fn)
    for sx in (-1, 1):
        it.add('body', strap(prof, [(20 * sx, 0.68), (20 * sx, 0.86), (21 * sx, 1.04)], 0.004, 0.018, 0.012), gold)
        it.add('body', strap(prof, [(20 * sx, 0.4), (20 * sx, 0.5), (20 * sx, 0.59)], 0.004, 0.018, 0.012), gold)
        for z in (0.74, 0.84, 0.94):
            q, nq = on_shell(prof, 30 * sx, z, 0.002)
            it.add('body', decal(circle(8, 0.024), 0.016), gold, facing(q, nq))
    q, nq = on_shell(prof, 0, 0.635, 0.02)
    m = facing(q, nq)
    it.add('body', rbox((0.085, 0.062, 0.02), 0.02), gold, m)
    it.add('body', decal([(-0.045, -0.03), (0.045, -0.03), (0.045, 0.03), (-0.045, 0.03)], 0.003), belt, m @ xf((0, 0, 0.021)))
    for z, sz in ((1.02, 1.0), (0.95, 0.85)):
        q, nq = on_shell(prof, 0, z, 0.025)
        it.add('body', ellipsoid((0, 0, 0), (0.07 * sz, 0.048 * sz, 0.035), 8, 4), shirt, facing(q, nq))
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.032, cuff_h=0.09), stag(navy, coat, coat, {0: gold, 2: gold}))
    finish_sleeves(it)
    return it


@builder
def armor_chef():
    it = Item('armor_chef')
    white = it.m('jacket', '#FFFDF7', 0.55)
    shade = it.m('jacket shade', '#E3ECF7', 0.55)
    red = it.m('red', '#EF3B3B', 0.45)
    navy = it.m('button', '#2B4CA8', 0.4)
    prof = shirt_profile(0.46, 0.036, 0.02, bands=[(0.745, 0.775, 0.018)])

    def fn(z, az, b, s):
        if b == -2:
            return shade
        if 0.745 <= z <= 0.775:
            return red
        if z < 0.5:
            return shade
        return white
    shell(it, prof, fn)
    it.add('body', strap(prof, [(26, 0.5), (26, 0.72), (26, 0.9), (22, 1.05)], 0.004, 0.012, 0.01), shade)
    for sx in (-1, 1):
        for z in (0.82, 0.92):
            shell_decal(it, prof, circle(8, 0.022), navy, 14 * sx, z, 0.012)
    q, nq = on_shell(prof, 0, 1.04, 0.03)
    m = facing(q, nq)
    it.add('body', ellipsoid((0, 0, 0), (0.055, 0.04, 0.035), 8, 4), red, m)
    for sx in (-1, 1):
        tri = [(0.0, 0.0), (0.075 * sx, -0.11), (0.02 * sx, -0.13)]
        if sx < 0:
            tri = list(reversed(tri))
        it.add('body', prism(tri, 0.018, 0.0), red, m @ xf((0.01 * sx, -0.01, -0.012), (0, 0, 0)))
    rf = shell_r(prof)

    def apron(u, v):
        az = 52 - 104 * u
        z = 0.74 - 0.4 * v
        r = rf(max(z, 0.47)) + 0.016 + 0.045 * v * v + (0.47 - z) * 0.15 * (z < 0.47)
        return (r * math.sin(RAD(az)), -r * math.cos(RAD(az)), z)
    it.add('body', sheet(apron, 7, 5, 0.014, tag=lambda i, j, front: (red if (i + j) % 2 else white) if front else white))
    sleeves(it, sleeve_profile(0.8, 0.156), stag(white, white, white, {1: red}))
    finish_sleeves(it)
    return it


@builder
def armor_tux():
    it = Item('armor_tux')
    jacket = it.m('jacket', '#2A3150', 0.45)
    lapel = it.m('lapel', '#46508A', 0.4)
    shirt = it.m('shirt', '#FFFDF7', 0.55)
    red = it.m('bow tie', '#E8243B', 0.42)
    button = it.m('button', '#1B1F33', 0.4)
    prof = shirt_profile(0.5, 0.036, 0.012)

    def fn(z, az, b, s):
        if b == -2:
            return jacket
        if abs(az) < 12 and z > 0.64:
            return shirt
        if abs(az) < 32 and z > 0.93:
            return shirt
        if abs(az) < 32 and z > 0.7:
            return lapel
        return jacket
    shell(it, prof, fn)
    for z in (0.72, 0.82, 0.92):
        shell_decal(it, prof, circle(6, 0.016), button, 0, z, 0.008)
    q, nq = on_shell(prof, 0, 1.02, 0.03)
    bow(it, 'body', q, nq, red, red, 0.9)
    q, nq = on_shell(prof, -40, 0.9, 0.004)
    it.add('body', prism([(-0.045, 0.0), (0.045, 0.0), (0.012, 0.05), (-0.02, 0.035)], 0.014), red, facing(q, nq))
    rf = shell_r(prof)
    for sx in (-1, 1):
        def tail(u, v, sx=sx):
            az = 180 + sx * (8 + 34 * u)
            z = 0.63 - 0.34 * v
            r = back_r(prof, az, max(z, 0.5)) + 0.014 + 0.03 * v
            return (r * math.sin(RAD(az)), -r * math.cos(RAD(az)), z)
        it.add('body', sheet(tail, 4, 4, 0.016), jacket)
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.014, cuff_h=0.045), stag(shirt, jacket))
    finish_sleeves(it)
    return it


@builder
def armor_kimono():
    it = Item('armor_kimono')
    silk = it.m('silk', '#F2477A', 0.45)
    silk_dark = it.m('silk dark', '#C92E60', 0.45)
    collar = it.m('collar', '#FFFDF7', 0.5)
    obi = it.m('obi', '#FFC21E', 0.45)
    cord = it.m('cord', '#2B4CA8', 0.45)
    petal = it.m('flower', '#FFFFFF', 0.5)
    petal2 = petal
    centre = it.m('flower centre', '#FFC21E', 0.45)
    prof = shirt_profile(0.32, 0.035, 0.05, flare_top=0.6, zs=(0.4, 0.5, 0.8, 0.95),
                         bands=[(0.6, 0.662, 0.02), (0.678, 0.74, 0.02)])

    def fn(z, az, b, s):
        if b == -2:
            return silk_dark
        if 0.6 <= z <= 0.74:
            return cord if 0.662 < z < 0.678 else obi
        if z < 0.36:
            return silk_dark
        return silk
    shell(it, prof, fn)
    it.add('body', strap(prof, [(34, 1.1), (20, 1.0), (7, 0.9), (-6, 0.81), (-15, 0.745)], 0.006, 0.03, 0.012), collar)
    it.add('body', strap(prof, [(-34, 1.1), (-20, 1.0), (-7, 0.93)], 0.003, 0.03, 0.01), collar)
    for az, z, r, col in ((-42, 0.9, 0.07, petal), (36, 0.84, 0.065, petal2), (-24, 0.5, 0.075, petal),
                          (22, 0.42, 0.07, petal2), (64, 0.55, 0.07, petal), (-66, 0.66, 0.06, petal2),
                          (120, 0.5, 0.07, petal), (-125, 0.85, 0.065, petal)):
        shell_decal(it, prof, flower(5, r, 0.42, 10), col, az, z, 0.01, lift=0.004)
        shell_decal(it, prof, circle(6, r * 0.28), centre, az, z, 0.008, lift=0.013)
    r_back = back_r(prof, 180, 0.62) + 0.035
    bow(it, 'body', Vector((0, r_back, 0.615)), Vector((0, 1, 0)), obi, cord, 1.55)
    g = rbox((0.1, 0.19, 0.16), 0.07, (ARM_X + 0.03, 0.04, 0.93), 8,
             tag=lambda b, s: silk_dark if b == -1 else silk)
    it.add('arm-right', g)
    dome = [(0.158, 1.04), (0.16, 1.1), (0.126, 1.168), (0.0, 1.238)]
    it.add('arm-right', lathe(dome, 8, phase=TAU / 16, cap_bottom=True).moved((ARM_X, ARM_Y, 0.0)), silk)
    it.add('arm-right', decal(flower(5, 0.06, 0.42), 0.008), petal, facing((ARM_X + 0.134, 0.06, 0.92), (1, 0, 0)))
    it.add('arm-right', decal(circle(6, 0.017), 0.006), centre, facing((ARM_X + 0.14, 0.06, 0.92), (1, 0, 0)))
    finish_sleeves(it)
    it.note = 'Wide hanging sleeves (z 0.77-1.09); the obi bow sits under the backpack.'
    return it


@builder
def armor_hawaii():
    it = Item('armor_hawaii')
    shirt = it.m('shirt', '#18B8C9', 0.5)
    shirt_dark = it.m('shirt dark', '#0E93A8', 0.5)
    white = it.m('white', '#FFFDF7', 0.5)
    pink = it.m('hibiscus pink', '#FF4F86', 0.45)
    yellow = it.m('hibiscus yellow', '#FFC83A', 0.45)
    centre = it.m('flower centre', '#FF7A1A', 0.45)
    leaf = it.m('leaf', '#3FBF3A', 0.45)
    prof = shirt_profile(0.5, 0.04, 0.02)

    def fn(z, az, b, s):
        if b == -2 or z < 0.53:
            return shirt_dark
        if abs(az) < 12 and z > 0.96:
            return white
        return shirt
    shell(it, prof, fn)
    for z in (0.62, 0.74, 0.86):
        shell_decal(it, prof, circle(6, 0.017), white, 0, z, 0.008)
    for az, z, r, col in ((-38, 0.86, 0.09, pink), (32, 0.7, 0.095, yellow), (-18, 0.6, 0.07, white),
                          (62, 0.93, 0.075, pink), (-72, 0.62, 0.085, yellow), (118, 0.8, 0.09, pink),
                          (-128, 0.72, 0.09, yellow)):
        shell_decal(it, prof, flower(5, r, 0.36, 10), col, az, z, 0.012)
        shell_decal(it, prof, circle(6, r * 0.26), centre, az, z, 0.008, lift=0.014)
        shell_decal(it, prof, leaf_outline(r * 1.1, r * 0.35, 2), leaf, az, z, 0.004, lift=0.002, spin=-30)
    it.add('body', lathe([(0.4 + 0.04 * math.cos(TAU * j / 5), 1.08 + 0.036 * math.sin(TAU * j / 5)) for j in range(5)],
                         20, closed=True, tag=lambda b, s: pink if s % 2 else yellow,
                         mod=lambda th, i: (1.0 + 0.03 * math.cos(20 * th),
                                            -0.1 * max(0.0, -math.sin(th)) ** 2)))
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.01, cuff_h=0.035), stag(shirt_dark, shirt))
    it.add('arm-right', decal(flower(5, 0.055, 0.36), 0.008), pink, facing((ARM_X + 0.166, ARM_Y - 0.03, 0.98), (1, -0.2, 0)))
    it.add('arm-right', decal(circle(6, 0.015), 0.005), centre, facing((ARM_X + 0.172, ARM_Y - 0.031, 0.98), (1, -0.2, 0)))
    finish_sleeves(it)
    return it


@builder
def armor_superhero():
    it = Item('armor_superhero')
    suit = it.m('suit', '#2B6BE8', 0.45)
    suit_dark = it.m('suit dark', '#1F4FB5', 0.45)
    red = it.m('red', '#EF2F45', 0.45)
    red_dark = it.m('cape lining', '#B81A30', 0.5)
    yellow = it.m('gold', '#FFC21E', 0.4)
    prof = shirt_profile(0.46, 0.036, 0.015, bands=[(0.6, 0.66, 0.015)])

    def fn(z, az, b, s):
        if b == -2:
            return suit_dark
        if 0.6 <= z <= 0.66:
            return yellow
        if z < 0.6:
            return red
        return suit
    shell(it, prof, fn)
    shield = [(-0.115, 0.075), (-0.1, -0.02), (0.0, -0.11), (0.1, -0.02), (0.115, 0.075)]
    p, n = on_shell(prof, 0, 0.86)
    g = prism(shield, 0.022, 0.006).xf(facing(p, n))
    it.add('body', wrap_cyl(g, shell_r(prof), p, n, 0.003), yellow)
    shell_decal(it, prof, star(5, 0.055, 0.024), red, 0, 0.86, 0.006, lift=0.027)
    yc = [(0.0, None, 1.14), (0.15, 0.5, 1.13), (0.35, 0.545, 0.95), (0.7, 0.565, 0.6), (1.0, 0.6, 0.26)]

    def cape(u, v):
        w = 2 * u - 1
        x_top, y_top = 0.36 * math.sin(RAD(62 * w)), 0.36 * math.cos(RAD(62 * w))
        for (v0, y0, z0), (v1, y1, z1) in zip(yc, yc[1:]):
            if v <= v1:
                t = (v - v0) / (v1 - v0)
                y0 = y_top if y0 is None else y0
                y, z = y0 + (y1 - y0) * t, z0 + (z1 - z0) * t
                break
        k = min(1.0, v / 0.15)
        s = k * k * (3 - 2 * k)
        x = x_top * (1 - s) + (0.34 + 0.24 * v) * w * s
        y = y if v > 0 else y_top
        y = y - 0.13 * w * w * s * (1 - 0.3 * v)
        return (x, y, z)
    it.add('body', sheet(cape, 8, 6, 0.02, tag=lambda i, j, front: red if front else red_dark))
    for sx in (-1, 1):
        x, y = 0.36 * math.sin(RAD(62 * sx)), 0.36 * math.cos(RAD(62 * sx))
        it.add('body', prism(circle(8, 0.045), 0.026, 0.008), yellow,
               facing((x * 1.08, y * 1.08 - 0.04, 1.13), (sx * 0.85, -0.5, 0.2)))
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.02, cuff_h=0.07), stag(red, suit))
    finish_sleeves(it)
    it.note = 'The cape drapes over the backpack (clear of it); hiding the backpack is optional.'
    return it


@builder
def armor_angel():
    it = Item('armor_angel')
    robe = it.m('robe', '#FFFDF7', 0.55)
    shade = it.m('robe shade', '#E3ECF9', 0.55)
    gold = it.m('gold', '#FFC21E', 0.4)
    sash = it.m('sash', '#7FD3FF', 0.45)
    feather = it.m('feather', '#FFFFFF', 0.5)
    tip = it.m('feather tip', '#CFE9FF', 0.5)
    prof = shirt_profile(0.32, 0.035, 0.075, flare_top=0.64, zs=(0.4, 0.5, 0.8, 0.95),
                         bands=[(0.63, 0.67, 0.014)])

    def fn(z, az, b, s):
        if b == -2:
            return shade
        if z < 0.37 or 0.63 <= z <= 0.67:
            return gold
        if z < 0.62 and s % 3 == 0:
            return shade
        return robe
    shell(it, prof, fn)
    it.add('body', strap(prof, [(42, 1.04), (24, 0.94), (4, 0.84), (-16, 0.76), (-34, 0.7), (-52, 0.66)], 0.012,
                         0.034, 0.012), sash)
    root = Vector((0.1, 0.47, 0.98))
    m = frame(root, Vector((1.0, 0.5, 0.42)), Vector((0.0, 0.2, 1.0)))
    wing = [(tube([m @ Vector((0, 0, 0)), m @ Vector((0.22, 0.12, 0)), m @ Vector((0.46, 0.1, 0))],
                  [0.05, 0.045, 0.02], 6, cap_start=True, cap_end=True), feather)]
    for k, (ang, ln, col) in enumerate(((-18, 0.3, tip), (-40, 0.34, tip), (-62, 0.32, tip), (-84, 0.28, tip))):
        base = Vector((0.42 - 0.1 * k, 0.08 - 0.02 * k, -0.004))
        a = Vector((math.cos(RAD(ang)), math.sin(RAD(ang)), 0.0))
        g = slab(leaf_outline(ln, 0.06, 2), 0.022, centre=(ln * 0.4, 0.0))
        wing.append((g.xf(m @ frame(base, a, Vector((-a.y, a.x, 0)))), col))
    for k, (ang, ln) in enumerate(((-10, 0.22), (-34, 0.24), (-58, 0.22))):
        base = Vector((0.3 - 0.1 * k, 0.12 - 0.02 * k, 0.012))
        a = Vector((math.cos(RAD(ang)), math.sin(RAD(ang)), 0.0))
        g = slab(leaf_outline(ln, 0.055, 2), 0.02, centre=(ln * 0.4, 0.0))
        wing.append((g.xf(m @ frame(base, a, Vector((-a.y, a.x, 0)))), feather))
    for g, col in wing:
        it.both('body', g, col)
    sleeves(it, sleeve_profile(0.78, 0.156, cuff=0.012, cuff_h=0.04, bell=0.05), stag(gold, robe))
    finish_sleeves(it)
    it.note = 'Small feathered wings behind the backpack (roots at y 0.47).'
    return it


@builder
def armor_santa():
    it = Item('armor_santa')
    red = it.m('coat', '#E8243B', 0.5)
    red_dark = it.m('coat dark', '#C11A30', 0.5)
    fur = it.m('fur', '#FFFDF7', 0.6)
    shade = it.m('fur shade', '#E6EEF8', 0.6)
    belt = it.m('belt', '#2A2A33', 0.45)
    gold = it.m('buckle', '#FFC21E', 0.4)
    prof = shirt_profile(0.44, 0.04, 0.04, bands=[(0.6, 0.67, 0.018)])

    def fn(z, az, b, s):
        if b == -2:
            return red_dark
        if 0.6 <= z <= 0.67:
            return belt
        return red
    shell(it, prof, fn)
    rf = shell_r(prof)
    it.add('body', fluffy_ring(rf(0.46) + 0.03, 0.465, 0.075, 0.07, 16, 5, 0.035, 0.012, sides=5,
                               tag=lambda b, s: shade if b in (3, 4) else fur))
    for zs_ in ((0.52, 0.56, 0.585), (0.69, 0.78, 0.87, 0.96, 1.05)):
        path = surface_path(prof, [(0, z) for z in zs_], 0.018)
        radii = [0.045 + 0.008 * (k % 2) for k in range(len(zs_))]
        it.add('body', tube(path, radii, 6, cap_start=True, cap_end=True), fur)
    q, nq = on_shell(prof, 0, 0.635, 0.022)
    m = facing(q, nq)
    it.add('body', rbox((0.085, 0.06, 0.02), 0.02), gold, m)
    it.add('body', decal([(-0.045, -0.028), (0.045, -0.028), (0.045, 0.028), (-0.045, 0.028)], 0.003), belt,
           m @ xf((0, 0, 0.021)))
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.038, cuff_h=0.085, puff=0.0), stag(fur, red))
    finish_sleeves(it)
    return it


@builder
def armor_hoodie():
    it = Item('armor_hoodie')
    orange = it.m('cotton', '#FF8A2A', 0.55)
    rib = it.m('rib', '#E8691A', 0.55)
    pocket = it.m('pocket', '#F57A20', 0.55)
    cord = it.m('cord', '#FFFDF7', 0.5)
    leaf = it.m('logo leaf', '#4FBF3A', 0.45)
    prof = shirt_profile(0.46, 0.04, 0.0, bands=[(0.468, 0.53, 0.012)])

    def fn(z, az, b, s):
        if b == -2:
            return rib
        if z < 0.54:
            return rib if s % 2 else pocket
        return orange
    shell(it, prof, fn)
    rf = shell_r(prof)

    def pouch(u, v):
        az = -40 + 80 * u
        z = 0.77 - 0.2 * v
        r = rf(z) + 0.014 + 0.012 * math.sin(math.pi * u)
        return (r * math.sin(RAD(az)), -r * math.cos(RAD(az)), z)
    it.add('body', sheet(pouch, 5, 3, 0.018, tag=lambda i, j, front: pocket))
    for sx in (-1, 1):
        a, _ = on_shell(prof, 8 * sx, 1.04, 0.012)
        b_, _ = on_shell(prof, 9 * sx, 0.93, 0.02)
        c, _ = on_shell(prof, 10 * sx, 0.85, 0.03)
        it.add('body', tube([a, b_, c], 0.011, 4, cap_start=True), cord)
        it.add('body', tube([c, c + Vector((0, -0.002, -0.045))], 0.017, 6, cap_start=True, cap_end=True), rib)
    hood = [(0.43 + 0.1 * math.cos(TAU * j / 6), 1.14 + 0.08 * math.sin(TAU * j / 6)) for j in range(6)]
    it.add('body', lathe(hood, 10, closed=True, arc=(RAD(12), RAD(168)),
                         mod=lambda th, i: (1.0 + 0.14 * math.sin(th) ** 2, 0.02 * math.sin(th)),
                         tag=lambda b, s: rib if b in (2, 3) else orange))
    for spin in (-40, 40):
        shell_decal(it, prof, leaf_outline(0.07, 0.025, 2), leaf, -30, 0.9, 0.006, spin=90 + spin)
    sleeves(it, sleeve_profile(0.8, 0.156, cuff=0.012, cuff_h=0.075), stag(rib, orange))
    finish_sleeves(it)
    it.note = 'The hood lies down behind the neck, on top of the backpack.'
    return it


# =================================================================== boots
# Each boot wraps the foot (r 0.17 at z 0.16, 0.08 forward) and the lower leg; the sole sits on the
# ground (z -0.016). The right boot is built at x +0.18 and mirrored to the left leg.
def finish_boots(it):
    it.mirror('leg-right', 'leg-left')


@builder
def boots_rocket():
    it = Item('boots_rocket')
    red = it.m('shell', '#EF2F45', 0.42)
    red_dark = it.m('lining', '#9E1A2C', 0.5)
    white = it.m('toe cap', '#F4F8FF', 0.4)
    sky = it.m('stripe', '#2FA8F0', 0.42)
    steel = it.m('nozzle', '#C4D0E4', 0.4)
    steel_dark = it.m('nozzle dark', '#76839E', 0.45)
    flame = it.m('flame', '#FFD23A', 0.4, emit='#FFB02E', strength=3.0)
    core = it.m('thruster glow', '#FFF4C8', 0.4, emit='#FFE9A0', strength=3.5)
    x = LEG_X

    def tag(b, s):
        if b == -1:
            return red_dark
        if b == 0:
            return white
        if b == 2:
            return sky
        if b >= 5:
            return white
        return red
    it.add('leg-right', boot_tube(x, 0.42, tag=tag))
    it.add('leg-right', sole(x, steel_dark))
    axis = Vector((0.0, 0.8, -0.6)).normalized()
    m = facing(Vector((x, 0.15, 0.2)), axis, up=(0, 0, 1))
    noz = [(0.05, -0.02), (0.07, 0.02), (0.088, 0.075), (0.07, 0.088)]
    it.add('leg-right', lathe(noz, 8, cap_bottom=True, tag=lambda b, s: steel if b == 1 else steel_dark), None, m)
    it.add('leg-right', decal(circle(8, 0.07), -0.012), core, m @ xf((0, 0, 0.08)))
    it.add('leg-right', lathe([(0.052, 0.0), (0.04, 0.07), (0.0, 0.18)], 8, cap_bottom=True), flame, m @ xf((0, 0, 0.07)))
    finish_boots(it)
    it.note = 'The thruster points back and down from the heel; flame and glow are emissive.'
    return it


@builder
def boots_cowboy():
    it = Item('boots_cowboy')
    brown = it.m('leather', '#A5582A', 0.5)
    dark = it.m('leather dark', '#6B3419', 0.5)
    tan = it.m('inlay', '#E8A457', 0.5)
    gold = it.m('spur', '#FFC21E', 0.4)
    x = LEG_X

    def tag(b, s):
        if b == -1:
            return dark
        if b == 0:
            return tan
        if b >= 5:
            return dark
        return brown
    g = boot_tube(x, 0.48, shaft=0.145, toe_y=-0.4, toe=(0.13, 0.085), foot=(0.18, 0.12), tag=tag)

    def notch(v):
        if v.z <= 0.44:
            return v
        t = (v.z - 0.44) / 0.04
        return (v.x, v.y, v.z - 0.07 * t * ((v.y - 0.012) / 0.15) ** 2)
    it.add('leg-right', g.map(notch))
    it.add('leg-right', sole(x, dark, y0=0.13, y1=-0.46, w=0.185))
    it.add('leg-right', lathe([(0.07, -0.016), (0.074, 0.02), (0.07, 0.07)], 6, cap_bottom=True, cap_top=True).map(
        lambda v: (x + v.x * 1.35, 0.075 + v.y, v.z)), dark)
    it.add('leg-right', tube([(x, 0.13, 0.12), (x, 0.2, 0.12)], 0.014, 4, cap_end=True), gold)
    it.add('leg-right', prism(star(6, 0.055, 0.025), 0.016), gold, facing((x, 0.22, 0.12), (1, 0, 0)))
    finish_boots(it)
    return it


@builder
def boots_flipper():
    it = Item('boots_flipper')
    sky = it.m('shoe', '#2FA8F0', 0.42)
    sky_dark = it.m('shoe dark', '#1D7FC8', 0.45)
    fin = it.m('fin', '#FFC83A', 0.42)
    fin_dark = it.m('fin rib', '#FF9A1A', 0.45)
    x = LEG_X
    it.add('leg-right', boot_tube(x, 0.3, shaft=0.14, toe_y=-0.3, tag=lambda b, s: sky_dark if b <= 0 else sky))
    # A long blade flaring to two rounded lobes with a notch between them, curling up at the tip.
    outline = [(-0.15, -0.14), (-0.2, -0.4), (-0.29, -0.7), (-0.25, -0.8), (-0.13, -0.8), (0.0, -0.66),
               (0.13, -0.8), (0.25, -0.8), (0.29, -0.7), (0.2, -0.4), (0.15, -0.14), (0.13, 0.12), (-0.13, 0.12)]
    g = prism(outline, 0.034, 0.0, tag=lambda k, b: fin if k == 'front' else fin_dark).moved((x, 0.0, 0.004))

    def curl(v):
        return (v.x, v.y, v.z + 0.08 * max(0.0, (-v.y - 0.32) / 0.48) ** 2)
    it.add('leg-right', g.map(curl))
    for dx in (-0.12, 0.0, 0.12):
        path = [(x + dx * 0.6, -0.3, 0.04), (x + dx * 0.85, -0.5, 0.05), (x + dx * 1.15, -0.72, 0.085)]
        it.add('leg-right', tube(path, [0.016, 0.014, 0.008], 4, cap_start=True, cap_end=True).map(curl), fin_dark)
    finish_boots(it)
    return it


@builder
def boots_cloud():
    it = Item('boots_cloud')
    cloud = it.m('cloud', '#FFFFFF', 0.55)
    shade = it.m('cloud shade', '#DCEBFF', 0.55)
    sole_m = it.m('sole', '#7FD0FF', 0.45)
    wing = it.m('wing', '#FFE27A', 0.45)
    x = LEG_X
    g = boot_tube(x, 0.4, shaft=0.15, sides=8, tag=lambda b, s: shade if b == -1 else cloud)

    def puffy(v):
        # Lumpy cloud surface: push the shell out and in around the leg axis.
        if v.z < 0.03:
            return v
        dx, dy = v.x - x, v.y + 0.06
        a = math.atan2(dy, dx)
        k = 1.0 + 0.09 * math.sin(3 * a + 11 * v.z) * math.sin(17 * v.z + 1.3)
        return (x + dx * k, -0.06 + dy * k, v.z)
    it.add('leg-right', g.map(puffy))
    for c, r in (((x, -0.02, 0.41), (0.16, 0.16, 0.085)), ((x + 0.02, -0.27, 0.2), (0.13, 0.12, 0.09)),
                 ((x - 0.04, 0.1, 0.25), (0.13, 0.12, 0.1))):
        it.add('leg-right', ellipsoid(c, r, 6, 4), cloud)
    it.add('leg-right', sole(x, sole_m))
    fp = [(0.0, 0.0), (0.09, -0.045), (0.24, -0.05), (0.33, 0.0), (0.27, 0.075), (0.12, 0.09)]
    it.add('leg-right', slab(fp, 0.024, centre=(0.12, 0.015)), wing,
           frame((x + 0.16, 0.06, 0.34), (0.35, 0.6, 0.72), (0.0, -0.72, 0.6)))
    finish_boots(it)
    return it




@builder
def boots_lava():
    it = Item('boots_lava')
    rock = it.m('basalt', '#3A3D4A', 0.6)
    rock_light = it.m('basalt light', '#565C70', 0.6)
    glow = it.m('lava', '#FF7A1A', 0.4, emit='#FF5A1A', strength=3.0)
    hot = it.m('lava hot', '#FFD23A', 0.4, emit='#FFB02E', strength=3.0)
    x = LEG_X
    it.add('leg-right', boot_tube(x, 0.43, shaft=0.155, sides=8, foot=(0.2, 0.13), ankle=(0.19, 0.2),
                                  tag=lambda b, s: rock_light if (b + s) % 3 == 0 else rock), smooth=False)
    it.add('leg-right', sole(x, tag=lambda b, s: glow if b == 1 else rock, w=0.21))
    cracks = [[(x + 0.156, -0.02, 0.41), (x + 0.158, 0.03, 0.35), (x + 0.16, -0.025, 0.29), (x + 0.162, 0.02, 0.23)],
              [(x - 0.03, -0.152, 0.41), (x + 0.025, -0.157, 0.35), (x - 0.02, -0.162, 0.3)],
              [(x - 0.05, -0.2, 0.235), (x + 0.01, -0.27, 0.212), (x - 0.03, -0.34, 0.182)]]
    for k, path in enumerate(cracks):
        it.add('leg-right', tube(path, 0.014, 3, cap_start=True, cap_end=True), hot if k == 1 else glow)
    finish_boots(it)
    it.note = 'Faceted basalt with emissive cracks and a glowing sole rim.'
    return it


# ================================================================= realise
def realise(it):
    """An empty named the item id at the origin; one triangulated mesh per hero part inside it."""
    empty = bpy.data.objects.new(it.id, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.empty_display_size = 0.3
    bpy.context.scene.collection.objects.link(empty)
    pieces = []
    for part in PART_ORDER:
        if part in it.parts:
            obj = triangulate(it.parts[part].build())
            obj.parent = empty
            pieces.append((part, obj))
    return dict(item=it, empty=empty, pieces=pieces)


def build_items(ids):
    return {iid: realise(BUILDERS[iid]()) for iid in ids}


# ================================================================ contract
def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return dict(min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi],
                size=[round(hi[i] - lo[i], 4) for i in range(3)])


def material_info(m):
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    ec = bsdf.inputs['Emission Color'].default_value
    es = bsdf.inputs['Emission Strength'].default_value
    return dict(rough=round(bsdf.inputs['Roughness'].default_value, 3),
                metal=round(bsdf.inputs['Metallic'].default_value, 3),
                emissive=bool(es > 0 and max(ec[0], ec[1], ec[2]) > 0), strength=round(es, 3))


def gltf_bounds(b):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return dict(min=[b['min'][0], b['min'][2], round(-b['max'][1], 4)],
                max=[b['max'][0], b['max'][2], round(-b['min'][1], 4)])


def item_stats(entry):
    it = entry['item']
    pieces, mats, total = [], [], 0
    for part, obj in entry['pieces']:
        b = bounds([v.co for v in obj.data.vertices])
        names = [m.name for m in obj.data.materials]
        mats += [n for n in names if n not in mats]
        t = mesh_tris(obj)
        total += t
        pieces.append(dict(name=obj.name, part=part, triangles=t, materials=names, bounds=b,
                           bounds_gltf=gltf_bounds(b)))
    infos = {n: material_info(bpy.data.materials[n]) for n in mats}
    s = dict(kind=it.kind, label=LABEL[it.id], triangles=total, limit=TRI_LIMIT[it.kind], pieces=pieces,
             materials=mats, emissive={n: i['strength'] for n, i in infos.items() if i['emissive']})
    if it.kind == 'hat':
        pts = [v.co for _, o in entry['pieces'] for v in o.data.vertices]
        face = [(p - HC).length for p in pts if p.y < 0 and p.z < 1.9]
        wrap = [(p - HC).length for p in pts if 1.34 < p.z < HC.z + 0.66 and math.hypot(p.x, p.y) < 0.8]
        s['face_min_distance'] = round(min(face), 4) if face else None
        s['head_min_distance'] = round(min(wrap), 4) if wrap else None
        s['top_z'] = round(max(p.z for p in pts), 3)
    if it.hints:
        s['hints'] = it.hints
    if it.note:
        s['note'] = it.note
    return s


def check_item(iid, s, entry):
    errors = []
    kind = KIND[iid]
    if s['triangles'] > TRI_LIMIT[kind]:
        errors.append(f"{s['triangles']} triangles > {TRI_LIMIT[kind]}")
    parts = [p['part'] for p in s['pieces']]
    if len(set(parts)) != len(parts):
        errors.append(f'duplicate parts {parts}')
    for p in s['pieces']:
        if p['part'] not in ALLOWED_PARTS[kind]:
            errors.append(f"{p['name']}: part {p['part']} not allowed for a {kind}")
        if p['name'] != piece_name(iid, p['part']) or not p['name'].endswith('@' + p['part']):
            errors.append(f"piece name {p['name']}")
        cx = (p['bounds']['min'][0] + p['bounds']['max'][0]) / 2
        if p['part'].endswith('-left') and cx >= 0:
            errors.append(f"{p['name']} sits on the right (x {cx:+.3f}); left parts are at -X")
        if p['part'].endswith('-right') and cx <= 0:
            errors.append(f"{p['name']} sits on the left (x {cx:+.3f}); right parts are at +X")
    if kind == 'hat' and parts != ['head']:
        errors.append(f'hat pieces {parts}')
    if kind == 'outfit' and 'body' not in parts:
        errors.append('outfit without a @body piece')
    if kind == 'outfit' and ('arm-left' in parts) != ('arm-right' in parts):
        errors.append('outfit with one sleeve')
    if kind == 'boots' and sorted(parts) != ['leg-left', 'leg-right']:
        errors.append(f'boots need a left and a right piece, got {parts}')
    ident = Matrix.Identity(4)
    e = entry['empty']
    if e.name != iid or e.parent is not None or e.matrix_world != ident:
        errors.append('top-level node must be named the id, at the origin, identity transform')
    for _, obj in entry['pieces']:
        if obj.data.name != obj.name:
            errors.append(f'{obj.name}: mesh data named {obj.data.name}')
        if obj.matrix_local != ident:
            errors.append(f'{obj.name}: transform must be identity (modelled in explorer space)')
    for n in s['materials']:
        if not n.startswith(f'Wear {iid} '):
            errors.append(f'material name {n}')
        info = material_info(bpy.data.materials[n])
        if info['metal'] > 1e-6:
            errors.append(f"{n} metallic {info['metal']}")
        if not 0.35 - 1e-6 <= info['rough'] <= 0.6 + 1e-6:
            errors.append(f"{n} roughness {info['rough']}")
    if kind == 'hat' and s['face_min_distance'] is not None and s['face_min_distance'] < FACE_CLEAR:
        errors.append(f"covers the face: a vertex {s['face_min_distance']} from the head centre on the face side "
                      f"below z 1.9 (< {FACE_CLEAR})")
    return errors


def export_wear(objects, path):
    """style.export_glb's settings, plus shared accessors: the primitives (materials) of one mesh share a
    single POSITION/NORMAL buffer, so vertices on material seams are not duplicated and the JSON stays small.
    Plain glTF 2.0; three.js GLTFLoader reads it as usual."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False,
              export_animations=False, export_texcoords=False, export_normals=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_shared_accessors=True, export_vertex_color='NONE')
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    compact_materials(path)
    return os.path.getsize(path)


def compact_materials(path):
    """Round material factors in the GLB's JSON chunk (float32 noise such as 0.41999998688697815 -> 0.42).
    Only material values change; geometry, accessors and their min/max are left exactly as exported."""
    import struct
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, _ = struct.unpack_from('<III', data, 0)
    jlen, jtype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + jlen])
    rest = data[20 + jlen:]
    for m in doc.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        if 'baseColorFactor' in pbr:
            pbr['baseColorFactor'] = [round(c, 4) for c in pbr['baseColorFactor']]
        for k in ('metallicFactor', 'roughnessFactor'):
            if k in pbr:
                pbr[k] = round(pbr[k], 3)
        if 'emissiveFactor' in m:
            m['emissiveFactor'] = [round(c, 4) for c in m['emissiveFactor']]
        ext = m.get('extensions', {}).get('KHR_materials_emissive_strength')
        if ext and 'emissiveStrength' in ext:
            ext['emissiveStrength'] = round(ext['emissiveStrength'], 3)
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', magic, version, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), jtype) + js + rest
    with open(path, 'wb') as fh:
        fh.write(out)


def load_manifest():
    try:
        with open(MANIFEST, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_manifest(data):
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')


# ================================================================== stage
def _eevee(samples=32):
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.5),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def _clear_stage():
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('Preview ground'):
            bpy.data.objects.remove(o, do_unlink=True)


def _preview_studio(size, ground='#7DD957'):
    """style.studio toned like the other kit previews (dimmer world, -0.4 EV)."""
    _clear_stage()
    studio(ground_color=ground, size=size)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.55
    scene.view_settings.exposure = -0.4
    _eevee(32)


def _remove(objs):
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)


def show_only(entries, keep):
    for iid, e in entries.items():
        vis = iid in keep
        e['empty'].hide_render = not vis
        for _, o in e['pieces']:
            o.hide_render = not vis


def ortho_camera(target, ortho, az, el, name='Cell camera'):
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    d = hdir(az, el)
    cam.location = Vector(target) + d * 20.0
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    bpy.context.view_layer.update()
    return cam


def hud_label(cam, text, u, v, size, res):
    """Flat text in front of an orthographic camera at (u, v) of the frame (-0.5..0.5 from the centre)."""
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = 'LEFT'
    cu.align_y = 'TOP'
    cu.materials.append(mat('Preview label', '#10283C', 0.6))
    obj = bpy.data.objects.new('Label', cu)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    m = cam.matrix_world
    w = cam.data.ortho_scale
    aspect = res[1] / res[0]
    hw, hh = (w, w * aspect) if aspect <= 1 else (w / aspect, w)
    obj.location = m.translation + m.to_3x3() @ Vector((u * hw, v * hh, -3.0))
    obj.rotation_euler = m.to_euler()
    obj.visible_shadow = False
    return obj


def _composite(paths, layout, size, out_path, bg=(1.0, 1.0, 1.0)):
    """Paste rendered PNGs (sRGB bytes) at pixel offsets into one WebP."""
    import numpy as np
    canvas = np.ones((size[1], size[0], 4), dtype=np.float32)
    canvas[..., :3] = bg
    for p, (x, y) in zip(paths, layout):
        im = bpy.data.images.load(p)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]
        canvas[y:y + im.size[1], x:x + im.size[0]] = px
        bpy.data.images.remove(im)
    out = bpy.data.images.new('Composite', size[0], size[1], alpha=False)
    out.pixels = canvas[::-1].ravel()
    out.filepath_raw = out_path
    out.file_format = 'WEBP'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save()
    bpy.data.images.remove(out)
    for p in paths:
        os.remove(p)


def _render_png(path):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if scene.render.film_transparent else 'RGB'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# ================================================================== heroes
def load_hero():
    """hero.glb when it exists, else the hero_spec proxy with eye and blush marks. Returns (objects, source)."""
    if os.path.exists(HERO_GLB):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=HERO_GLB)
        objs = [o for o in bpy.data.objects if o not in before]
        for o in objs:
            if o.name.startswith('head-leaf'):
                o.hide_render = True        # the game hides the sprout while a hat is worn
        return objs, 'hero.glb'
    objs = list(HS.build_proxy_hero(style))
    eye = wm('Proxy eye', '#1E2230', 0.4)
    blush = wm('Proxy blush', '#FF8FA8', 0.5)
    face = Part('proxy face')
    for sx in (-1, 1):
        face.add(ellipsoid((0.2 * sx, -0.548, 1.62), (0.05, 0.03, 0.072), 8, 6), eye)
        face.add(ellipsoid((0.33 * sx, -0.468, 1.49), (0.07, 0.03, 0.04), 8, 4), blush)
    objs.append(face.build())
    return objs, 'proxy'


def spawn(objs, loc, heading):
    """Linked copies of `objs` under a new root at loc, turned by heading (degrees about Z)."""
    root = bpy.data.objects.new('Spawn', None)
    bpy.context.scene.collection.objects.link(root)
    root.location = loc
    root.rotation_euler = (0.0, 0.0, RAD(heading))
    mapping = {}
    for o in objs:
        c = o.copy()
        bpy.context.scene.collection.objects.link(c)
        c.hide_render = o.name.startswith('head-leaf')
        mapping[o] = c
    for o in objs:
        c = mapping[o]
        if o.parent in mapping:
            c.parent = mapping[o.parent]
        else:
            c.parent = root
            c.matrix_parent_inverse = Matrix.Identity(4)
            c.matrix_basis = o.matrix_world.copy()
    return [root] + list(mapping.values())


# ================================================================ previews
BACK_VIEW = ('armor_wings', 'armor_angel', 'armor_superhero', 'armor_wolf', 'armor_hoodie', 'armor_kimono')


def render_grid(entries, hero, cells, cell, cols, out_path, ground='#8FDC6A'):
    """cells: [(item ids worn, label, (target, ortho, az, el))]. Renders each cell and composites a grid."""
    _preview_studio(cell, ground)
    tmp = tempfile.mkdtemp(prefix='wear_')
    paths, layout = [], []
    for k, (ids, text, (target, ortho, az, el)) in enumerate(cells):
        show_only(entries, set(ids))
        cam = ortho_camera(target, ortho, az, el)
        label = hud_label(cam, text, -0.47, 0.48, ortho * 0.052, cell)
        paths.append(_render_png(os.path.join(tmp, f'{k:03d}.png')))
        layout.append(((k % cols) * cell[0], (k // cols) * cell[1]))
        _remove([label, cam])
    rows = math.ceil(len(cells) / cols)
    _composite(paths, layout, (cols * cell[0], rows * cell[1]), out_path, bg=(0.56, 0.86, 0.42))
    show_only(entries, set(entries))
    print('  wrote', os.path.relpath(out_path, REPO))


def preview_hats(entries, hero):
    ids = [i for i in CATEGORY['hats'] if i in entries]
    cells = [([i], f"{LABEL[i]}  {entries[i]['stats']['triangles']}", ((0, 0, 2.02), 2.45, 28, 16)) for i in ids]
    render_grid(entries, hero, cells, (240, 240), 5, os.path.join(PREVIEWS, 'hats.webp'))


def preview_outfits(entries, hero):
    ids = [i for i in CATEGORY['outfits'] if i in entries]
    cells = [([i], f"{LABEL[i]}  {entries[i]['stats']['triangles']}", ((0, 0, 1.22), 2.95, 30, 10)) for i in ids]
    cells += [([i], f"{LABEL[i]} (back)", ((0, 0, 1.22), 2.75, 150, 14)) for i in ids if i in BACK_VIEW]
    render_grid(entries, hero, cells, (200, 280), 6, os.path.join(PREVIEWS, 'outfits.webp'))


def preview_boots(entries, hero):
    ids = [i for i in CATEGORY['boots'] if i in entries]
    cells = [([i], f"{LABEL[i]}  {entries[i]['stats']['triangles']}", ((0, -0.05, 0.42), 1.45, 32, 18)) for i in ids]
    cells += [([i], 'back', ((0, 0.0, 0.42), 1.45, 145, 22)) for i in ids]
    render_grid(entries, hero, cells, (240, 300), 5, os.path.join(PREVIEWS, 'boots.webp'))


GAME_SETS = [('armor_knight', 'hat_viking', 'boots_rocket', -20), ('armor_pirate', 'hat_pirate', 'boots_cowboy', 10),
             ('armor_kimono', 'hat_bunny', 'boots_cloud', 25), ('armor_superhero', 'hat_space', 'boots_rocket', 160),
             ('armor_hawaii', 'hat_straw', 'boots_flipper', -30), ('armor_wings', 'hat_samurai', 'boots_lava', 200)]


def preview_game(entries, hero):
    """wear-game.webp: six explorers dressed at the game camera (ortho 5.6), and the same six at the game's
    zoom (~43 px per metre) underneath."""
    sets = [s for s in GAME_SETS if all(i in entries for i in s[:3])]
    if not sets:
        return
    show_only(entries, set())
    for o in hero:
        o.hide_render = True
    made = []
    spots = [(-2.0, 1.5), (0.0, 1.5), (2.0, 1.5), (-2.0, -1.3), (0.0, -1.3), (2.0, -1.3)]
    for (outfit, hat, boots, heading), (x, y) in zip(sets, spots):
        objs = list(hero) + [o for iid in (outfit, hat, boots) for _, o in entries[iid]['pieces']]
        made += spawn(objs, (x, y, 0.0), heading)
    tmp = tempfile.mkdtemp(prefix='wear_')
    _preview_studio((1200, 820), '#86D95E')
    cam = game_camera(target=(0.0, 0.15, 1.1), ortho_scale=6.8)
    top = _render_png(os.path.join(tmp, 'top.png'))
    bpy.data.objects.remove(cam, do_unlink=True)
    _preview_studio((1200, 260), '#86D95E')
    cam = game_camera(target=(0.0, 0.1, 1.0), ortho_scale=1200 / 43.0)
    bottom = _render_png(os.path.join(tmp, 'bottom.png'))
    bpy.data.objects.remove(cam, do_unlink=True)
    _composite([top, bottom], [(0, 0), (0, 820)], (1200, 1080), os.path.join(PREVIEWS, 'wear-game.webp'))
    _remove(made)
    for o in hero:
        o.hide_render = o.name.startswith('head-leaf')
    show_only(entries, set(entries))
    print('  wrote art/previews/kit/wear-game.webp')


# =================================================================== icons
ICON_VIEW = {'hat': dict(heading=-30, elevation=22), 'outfit': dict(heading=-32, elevation=14),
             'boots': dict(heading=-38, elevation=30)}
ICON_OVERRIDE = {'hat_halo': dict(elevation=38), 'armor_wings': dict(heading=-22, elevation=16),
                 'armor_angel': dict(heading=-24), 'armor_superhero': dict(heading=-48)}


def icon_camera(objs, elevation, margin=1.07):
    data = bpy.data.cameras.new('Icon camera')
    data.type = 'ORTHO'
    cam = bpy.data.objects.new('Icon camera', data)
    bpy.context.scene.collection.objects.link(cam)
    e = RAD(elevation)
    direction = Vector((0.0, -math.cos(e), math.sin(e)))
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    cam.location = direction * 12
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ v.co) for o in objs for v in o.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    right, up = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)), cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    cam.location = cam.location + right * (x0 + x1) / 2 + up * (y0 + y1) / 2
    data.ortho_scale = max(x1 - x0, y1 - y0) * margin
    bpy.context.scene.camera = cam
    return cam


def render_icons(entries, ids):
    _clear_stage()
    studio(size=(160, 160), transparent=True)
    _eevee(48)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.6
    scene.view_settings.exposure = -0.1
    for light in bpy.data.objects:
        if light.type == 'LIGHT':
            try:
                light.data.angle = RAD(22)
            except AttributeError:
                pass
    scene.render.filter_size = 1.2
    os.makedirs(ICONS, exist_ok=True)
    written = {}
    for iid in ids:
        e = entries[iid]
        show_only(entries, {iid})
        view = dict(ICON_VIEW[KIND[iid]], **ICON_OVERRIDE.get(iid, {}))
        e['empty'].rotation_euler = (0.0, 0.0, RAD(view['heading']))
        bpy.context.view_layer.update()
        cam = icon_camera([o for _, o in e['pieces']], view['elevation'])
        path = os.path.join(ICONS, iid + '.webp')
        scene.render.image_settings.file_format = 'WEBP'
        scene.render.image_settings.color_mode = 'RGBA'
        for quality in (88, 78, 66, 55):
            scene.render.image_settings.quality = quality
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            if os.path.getsize(path) <= ICON_LIMIT - 200:
                break
        _remove([cam])
        e['empty'].rotation_euler = (0.0, 0.0, 0.0)
        written[iid] = os.path.getsize(path)
    show_only(entries, set(entries))
    bpy.context.view_layer.update()
    return written


def contact_sheet(ids, out_path):
    """All icons on cream cards: full size on top, the ~52 px UI size underneath."""
    import numpy as np
    cell, small, pad, cols = 176, 52, 8, 7
    rows = math.ceil(len(ids) / cols)
    ch = cell + small + 3 * pad
    w, h = cols * cell, rows * ch
    canvas = np.zeros((h, w, 4), dtype=np.float32)
    canvas[..., :3] = (1.0, 0.965, 0.89)
    canvas[..., 3] = 1.0
    card = np.array([0.97, 0.91, 0.8])

    def paste(img_px, x, y):
        ih, iw = img_px.shape[:2]
        region = canvas[y:y + ih, x:x + iw]
        a = img_px[..., 3:4]
        region[..., :3] = img_px[..., :3] * a + region[..., :3] * (1 - a)

    for i, iid in enumerate(ids):
        img = bpy.data.images.load(os.path.join(ICONS, iid + '.webp'))
        px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)[::-1]
        x0, y0 = (i % cols) * cell + (cell - img.size[0]) // 2, (i // cols) * ch + pad
        paste(px, x0, y0)
        img.scale(small, small)
        spx = np.array(img.pixels[:], dtype=np.float32).reshape(small, small, 4)[::-1]
        sx, sy = (i % cols) * cell + (cell - small) // 2, (i // cols) * ch + cell + 2 * pad - 4
        canvas[sy - 4:sy + small + 4, sx - 4:sx + small + 4, :3] = card
        paste(spx, sx, sy)
        bpy.data.images.remove(img)
    out = bpy.data.images.new('Icon sheet', w, h, alpha=False)
    out.pixels = canvas[::-1].ravel()
    out.filepath_raw = out_path
    out.file_format = 'WEBP'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save()
    bpy.data.images.remove(out)


# ===================================================================== main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(only=None, install=False, render=False, debug=None)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--only':
            opts['only'] = argv[i + 1]
            i += 1
        elif a.startswith('--only='):
            opts['only'] = a.split('=', 1)[1]
        elif a == '--debug':
            opts['debug'] = argv[i + 1]
            i += 1
        elif a == '--install':
            opts['install'] = True
        elif a == '--render':
            opts['render'] = True
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    return opts


def resolve(only):
    """-> (ids, full build?, sections)."""
    if only is None:
        return list(ALL_IDS), True, ('models', 'icons')
    if only == 'icons':
        return list(ALL_IDS), False, ('icons',)
    if only == 'models':
        return list(ALL_IDS), True, ('models',)
    if only in CATEGORY:
        return list(CATEGORY[only]), False, ('models', 'icons')
    ids = [s.strip() for s in only.split(',') if s.strip()]
    bad = [i for i in ids if i not in KIND]
    if bad:
        raise SystemExit(f'--only: unknown ids {bad} (use hats, outfits, boots, icons or item ids)')
    return [i for i in ALL_IDS if i in ids], False, ('models', 'icons')


def report(stats):
    for kind in ('hat', 'outfit', 'boots'):
        rows = [(i, s) for i, s in stats.items() if s['kind'] == kind]
        if not rows:
            continue
        print('\n== ' + ('boots' if kind == 'boots' else kind + 's'))
        for iid, s in rows:
            parts = ', '.join(f"{p['part']} {p['triangles']}" for p in s['pieces'])
            extra = ''
            if kind == 'hat':
                extra = f"  face {s['face_min_distance']}  head {s['head_min_distance']}  top {s['top_z']}"
            glow = f"  glow {sorted(s['emissive'])}" if s['emissive'] else ''
            print(f"  {iid:16s} {s['triangles']:5d} tris  [{parts}]  {len(s['materials'])} mats{extra}{glow}")


def main():
    opts = parse_args()
    ids, full, sections = resolve(opts['only'])
    missing = [i for i in ids if i not in BUILDERS]
    if missing:
        raise SystemExit(f'no builder for {missing}')
    manifest = load_manifest()
    manifest['generator'] = 'art/blender/kit/build_wear.py'
    manifest['blender'] = bpy.app.version_string
    manifest['coordinates'] = ('Explorer space (hero_spec.py): Blender Z up, the explorer faces -Y (glTF Y up, faces '
                               '+Z); metres; standing at the origin, arms hanging straight down. Each item is an '
                               'empty named the id at the origin; its meshes end with @<part>, the hero part they '
                               'follow, and keep their world transform when reparented.')
    manifest['limits'] = dict(triangles=TRI_LIMIT, glb_bytes=GLB_LIMIT, icon_bytes=ICON_LIMIT,
                              face_clearance=FACE_CLEAR, hat_clearance=HAT_CLEAR)
    failures = []

    reset_scene()
    entries = build_items(ids)
    stats = {}
    for iid in ids:
        stats[iid] = item_stats(entries[iid])
        entries[iid]['stats'] = stats[iid]
        failures += [f'{iid}: {e}' for e in check_item(iid, stats[iid], entries[iid])]
        if KIND[iid] == 'hat' and (stats[iid]['head_min_distance'] or 1.0) < HAT_CLEAR:
            print(f"  note: {iid} comes {stats[iid]['head_min_distance']} from the head centre (< {HAT_CLEAR})")
    report(stats)
    items = manifest.get('items', {})
    items.update(stats)
    manifest['items'] = {i: items[i] for i in ALL_IDS if i in items}
    manifest['emissive'] = {m: v for i in ALL_IDS if i in manifest['items']
                            for m, v in manifest['items'][i].get('emissive', {}).items()}

    glb_path = os.path.join(MODELS, GLB_NAME)
    if full:
        objects = []
        for iid in ALL_IDS:
            objects.append(entries[iid]['empty'])
            objects += [o for _, o in entries[iid]['pieces']]
        size = export_wear(objects, glb_path)
        print(f'\n  {GLB_NAME} {size} bytes ({size / 1024:.1f} KB), '
              f"{sum(s['triangles'] for s in stats.values())} triangles")
        if size > GLB_LIMIT:
            failures.append(f'{GLB_NAME} is {size} bytes (> {GLB_LIMIT})')
        manifest['file'] = dict(name=GLB_NAME, bytes=size, triangles=sum(s['triangles'] for s in stats.values()),
                                items=len(ALL_IDS))
    elif 'models' in sections:
        print(f'\n  --only {opts["only"]}: {GLB_NAME} not written (partial build)')

    if 'icons' in sections:
        sizes = render_icons(entries, ids)
        for iid, size in sizes.items():
            if size > ICON_LIMIT:
                failures.append(f'icon {iid}.webp is {size} bytes (> {ICON_LIMIT})')
        icons = manifest.get('icons', {})
        by = icons.get('bytes', {})
        by.update(sizes)
        manifest['icons'] = dict(dir='icons/items', size=[160, 160], bytes={i: by[i] for i in ALL_IDS if i in by})
        print(f"  icons: {len(sizes)} written, largest {max(sizes.values())} bytes")
        if opts['debug']:
            contact_sheet(ids, os.path.join(opts['debug'], 'wear-icons.webp'))

    if opts['render'] and 'models' in sections:
        hero, source = load_hero()
        manifest['preview_hero'] = source
        print(f'  previews dress the {source}')
        if any(KIND[i] == 'hat' for i in ids):
            preview_hats(entries, hero)
        if any(KIND[i] == 'outfit' for i in ids):
            preview_outfits(entries, hero)
        if any(KIND[i] == 'boots' for i in ids):
            preview_boots(entries, hero)
        preview_game(entries, hero)

    save_manifest(manifest)
    if failures:
        raise RuntimeError('Wear kit contract failures:\n  ' + '\n  '.join(failures))

    if opts['install']:
        if full:
            os.makedirs(PUBLIC_MODELS, exist_ok=True)
            shutil.copy2(glb_path, os.path.join(PUBLIC_MODELS, GLB_NAME))
            print('installed', GLB_NAME)
        if 'icons' in sections:
            os.makedirs(PUBLIC_ICONS, exist_ok=True)
            for iid in ids:
                shutil.copy2(os.path.join(ICONS, iid + '.webp'), os.path.join(PUBLIC_ICONS, iid + '.webp'))
            print('installed', len(ids), 'icons')
    print('\nWear kit OK')


if __name__ == '__main__':
    main()
