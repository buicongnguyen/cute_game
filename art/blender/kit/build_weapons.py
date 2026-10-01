"""Zoo Garden weapons and pet companions: gear-weapons.glb, pets.glb and their item icons.

Nineteen hand-held weapons (swords, blasters, hammers, a scythe, a bow, a staff, a trident and three
fishing rods) and seven pet companions, authored procedurally as chunky, glossy toys that read in the
explorer's hand from the high game camera: bold silhouettes, strong colour contrast and emissive parts
for anything that should glow. See CONTRACT.md, "Explorer and gear".

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_weapons.py -- \
        [--only weapons|pets|icons|<id>[,<id>...]] [--install] [--render] [--sheet PATH]

Outputs:
    art/generated/kit/models/gear-weapons.glb, pets.glb
    art/generated/kit/icons/items/<id>.webp          (160 x 160, transparent, < 8 KB)
    art/generated/kit/weapons-manifest.json
    art/previews/kit/weapons.webp, weapons-game.webp, pets.webp   (--render)
--install copies both GLBs to public/assets/models/ and the icons to public/assets/icons/items/.
--only <ids> rebuilds just those items and their icons (no GLB, no install): for iterating on looks.
--sheet PATH writes a contact sheet of the icons (a review aid, not a deliverable).

Weapons are modelled in explorer space (hero_spec.py), gripped at hand-right (0.37, -0.05, 0.72) with
the explorer standing at rest, arms hanging straight down. Blender is Z up, the explorer faces -Y;
glTF is Y up and faces +Z. Output is deterministic: triangulated, sorted faces (as build_fish.py).
"""
import bpy
import bmesh
import json
import math
import os
import re
import shutil
import struct
import sys
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
import hero_spec  # noqa: E402
from style import game_camera, mat, render, reset_scene, studio  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
ICONS = os.path.join(GEN, 'icons', 'items')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'weapons-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')

# id, kind, name, special attack
WEAPONS = [
    ('sword_wood', 'sword', 'Wood sword', 'crescent'),
    ('sword_tusk', 'sword', 'Tusk sword', 'gore'),
    ('sword_crystal', 'sword', 'Crystal sword', 'wave'),
    ('gun_pea', 'blaster', 'Pea blaster', 'peastorm'),
    ('gun_bubble', 'blaster', 'Bubble blaster', 'bigbubble'),
    ('gun_spike', 'blaster', 'Spike blaster', 'nova'),
    ('sword_candy', 'sword', 'Candy sword', 'crescent'),
    ('gun_ice', 'blaster', 'Ice blaster', 'blizzard'),
    ('sword_lava', 'sword', 'Lava sword', 'wave'),
    ('sword_obsidian', 'sword', 'Obsidian sword', 'magma'),
    ('hammer_thunder', 'hammer', 'Thunder hammer', 'thunder'),
    ('scythe_moon', 'scythe', 'Moon scythe', 'whirl'),
    ('bow_star', 'bow', 'Star bow', 'starfall'),
    ('staff_fire', 'staff', 'Fire staff', 'inferno'),
    ('blaster_rainbow', 'blaster', 'Rainbow blaster', 'laser'),
    ('toy_hammer', 'hammer', 'Toy hammer', 'bonk'),
    ('trident', 'trident', 'Ocean trident', 'tsunami'),
    ('rod', 'rod', 'Fishing rod', None),
    ('rod_gold', 'rod', 'Golden fishing rod', None),
    ('rod_steady', 'rod', 'Steady fishing rod', None),
]
WEAPON_IDS = [w[0] for w in WEAPONS]
KIND = {w[0]: w[1] for w in WEAPONS}
# id, flying, name
PETS = [
    ('pet_robot', False, 'Robot companion'),
    ('pet_parrot', True, 'Parrot companion'),
    ('pet_turtle', False, 'Turtle companion'),
    ('pet_sheep', False, 'Sheep companion'),
    ('pet_firefly', True, 'Firefly companion'),
    ('pet_dragon', True, 'Dragon companion'),
    ('bunny', False, 'Mochi bunny'),
]
PET_IDS = [p[0] for p in PETS]
FLYING = {p[0] for p in PETS if p[1]}
NEEDS_MUZZLE = {'blaster', 'bow', 'staff'}

WEAPON_TRIS, PET_TRIS = 900, 1500
WEAPON_GLB_LIMIT, PET_GLB_LIMIT = 500 * 1024, 300 * 1024
ICON_LIMIT = 8 * 1024
GRIP_TOLERANCE = 0.08
HAND = Vector(hero_spec.HANDS['hand-right'])
HEAD_CENTRE = Vector(hero_spec.HEAD_CENTRE)
# The head hangs only ~0.3 above the fist: held weapons keep 0.01 off the skin below the head centre and
# stay outside the hair cap (HAIR_RADIUS) above it.
SKIN_CLEAR = hero_spec.HEAD_RADIUS + 0.01
HAIR_CLEAR = hero_spec.HAIR_RADIUS
# Held poses (degrees). Swords, hammers, the scythe and the trident point forward, raised; rods higher.
RAISE = {'sword': 20, 'hammer': 20, 'scythe': 20, 'trident': 20, 'rod': 50}
# The staff and bow stand upright in the fist but lean out (+X) and forward so they clear the big head.
LEAN = {'staff': (19, 9), 'bow': (19, 6)}
TAU = math.tau
RAD = math.radians


def head_clearance(p):
    """Distance from a point (explorer space) to the head envelope; negative inside it."""
    d = (Vector(p) - HEAD_CENTRE).length
    return d - (HAIR_CLEAR if p[2] > HEAD_CENTRE.z else SKIN_CLEAR)
UP = Vector((0, 0, 1))


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists with a per-face tag and a per-face flat-shading flag."""

    def __init__(self, verts, faces, tags=None, flat=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [0] * len(self.faces)
        self.flat = list(flat) if flat is not None else [False] * len(self.faces)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags, self.flat)

    def moved(self, offset):
        o = Vector(offset)
        return Geo([v + o for v in self.verts], self.faces, self.tags, self.flat)

    def mirrored(self):
        """Mirror across X (left/right pairs), keeping faces pointing outward."""
        return Geo([Vector((-v.x, v.y, v.z)) for v in self.verts], [tuple(reversed(f)) for f in self.faces],
                   self.tags, self.flat)

    def flipped(self):
        return Geo(self.verts, [tuple(reversed(f)) for f in self.faces], self.tags, self.flat)

    def signed_volume(self):
        vol = 0.0
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                vol += a.dot(self.verts[f[i]].cross(self.verts[f[i + 1]]))
        return vol / 6.0

    def outward(self):
        """Closed shapes: make sure faces point outward."""
        if self.signed_volume() < 0:
            self.faces = [tuple(reversed(f)) for f in self.faces]
        return self

    def all_flat(self):
        self.flat = [True] * len(self.faces)
        return self


class Piece:
    """Accumulates parts (geometry + material) into one named mesh object."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.mats, self.smooth, self.materials = [], [], [], [], []

    def slot(self, material):
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def add(self, geo, material=None, xf=None, smooth=True):
        """material: one material, or a dict tag -> material."""
        g = geo if xf is None else geo.transformed(xf)
        base = len(self.verts)
        self.verts.extend(g.verts)
        for f, t, fl in zip(g.faces, g.tags, g.flat):
            m = material[t] if isinstance(material, dict) else material
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.slot(m))
            self.smooth.append(smooth and not fl)
        return self

    def transform(self, m):
        self.verts = [m @ v for v in self.verts]

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, offset=None, sharp=80):
        off = Vector(offset) if offset is not None else Vector()
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v - off) for v in self.verts], [], self.faces)
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
        if sharp:
            limit = RAD(sharp)
            for edge in bm.edges:
                if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > limit:
                    edge.smooth = False
        bm.to_mesh(me)
        bm.free()
        me.validate()
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def triangulate(obj):
    """Triangulate and sort faces so the GLB is byte-for-byte reproducible (as build_props.py)."""
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


def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list, Vector)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(s))


def scl(sx, sy, sz):
    return Matrix.Diagonal(Vector((sx, sy, sz, 1.0)))


def facing(loc, normal, up=(0, 0, 1), spin=0.0):
    """Local +Z along `normal`, local +Y as close to `up` as possible (local +X = up x normal)."""
    z = Vector(normal).normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0)).cross(z) if abs(z.x) < 0.9 else Vector((0, 1, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    if spin:
        c, s = math.cos(spin), math.sin(spin)
        x, y = x * c + y * s, y * c - x * s
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def skin(rings, tag=None, start=None, end=None, flat=False):
    """Loft point rings (a single point is a pole). start/end: None (open), a point (fan cap) or 'ngon'."""
    verts, ids = [], []
    for ring in rings:
        idx = []
        for p in ring:
            idx.append(len(verts))
            verts.append(Vector(p))
        ids.append(idx)
    faces, tags, flats = [], [], []
    for b, (lo, up) in enumerate(zip(ids, ids[1:])):
        if len(lo) == 1 and len(up) == 1:
            continue
        n = max(len(lo), len(up))
        for s in range(n):
            if len(lo) == 1:
                f = (lo[0], up[(s + 1) % n], up[s])
            elif len(up) == 1:
                f = (lo[s], lo[(s + 1) % n], up[0])
            else:
                f = (lo[s], lo[(s + 1) % n], up[(s + 1) % n], up[s])
            faces.append(f)
            tags.append(tag(b, s) if tag else 0)
            flats.append(flat)
    for cap, ring, first in ((start, ids[0], True), (end, ids[-1], False)):
        if cap is None or len(ring) == 1:
            continue
        band = -1 if first else len(ids) - 1
        n = len(ring)
        if isinstance(cap, str):
            faces.append(tuple(reversed(ring)) if first else tuple(ring))
            tags.append(tag(band, 0) if tag else 0)
            flats.append(True)
            continue
        c = len(verts)
        verts.append(Vector(cap))
        for s in range(n):
            faces.append((c, ring[(s + 1) % n], ring[s]) if first else (c, ring[s], ring[(s + 1) % n]))
            tags.append(tag(band, s) if tag else 0)
            flats.append(flat)
    return Geo(verts, faces, tags, flats)


def sweep(path, sections, binormal=(1, 0, 0), tag=None, cap_start=0.0, cap_end=0.0, flat=False):
    """Loft 2D sections [(a, c), ...] along a path. c runs along `binormal` (made perpendicular to the path),
    a along tangent x binormal. A one-point section makes a pole. Caps: None (open) or a dome height."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    ref = Vector(binormal).normalized()
    rings, axes = [], []
    for i in range(n):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        b = ref - t * ref.dot(t)
        if b.length < 1e-4:
            alt = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
            b = alt - t * alt.dot(t)
        b.normalize()
        u = t.cross(b)
        sec = sections(i) if callable(sections) else sections[i]
        rings.append([pts[i] + u * a + b * c for a, c in sec])
        axes.append(t)

    def centre(ring):
        return sum(ring, Vector()) / len(ring)
    start = None if cap_start is None else centre(rings[0]) - axes[0] * cap_start
    end = None if cap_end is None else centre(rings[-1]) + axes[-1] * cap_end
    return skin(rings, tag, start, end, flat)


def lathe(profile, segs, phase=0.0, mod=None, tag=None, cap_bottom=None, cap_top=None, flat=False):
    """Revolve [(r, z), ...] (bottom to top) around Z; r = 0 makes a pole. mod(theta, ring) scales r."""
    rings = []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([Vector((0.0, 0.0, z))])
            continue
        ring = []
        for s in range(segs):
            th = phase + TAU * s / segs
            rr = r * (mod(th, i) if mod else 1.0)
            ring.append(Vector((rr * math.cos(th), rr * math.sin(th), z)))
        rings.append(ring)
    start = None if cap_bottom is None else Vector((0.0, 0.0, profile[0][1] - cap_bottom))
    end = None if cap_top is None else Vector((0.0, 0.0, profile[-1][1] + cap_top))
    return skin(rings, tag, start, end, flat)


def sphere(r, segs=12, rings=8, scale=(1, 1, 1), phase=0.0, tag=None, flat=False):
    prof = ([(0.0, -r)] + [(r * math.sin(math.pi * k / rings), -r * math.cos(math.pi * k / rings))
                           for k in range(1, rings)] + [(0.0, r)])
    return lathe(prof, segs, phase, tag=tag, flat=flat).transformed(scl(*scale)).outward()


def torus(major, minor, segs=16, sides=6, tag=None):
    verts, faces, tags = [], [], []
    for i in range(segs):
        a = TAU * i / segs
        for j in range(sides):
            b = TAU * j / sides
            r = major + minor * math.cos(b)
            verts.append((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    for i in range(segs):
        for j in range(sides):
            i2, j2 = (i + 1) % segs, (j + 1) % sides
            faces.append((i * sides + j, i2 * sides + j, i2 * sides + j2, i * sides + j2))
            tags.append(tag(i, j) if tag else 0)
    return Geo(verts, faces, tags).outward()


def cyl(a, b, r, r1=None, sides=8, n=1, cap=0.0, cap_end=None, tag=None, flat=False, binormal=None, phase=None):
    """A closed cylinder or cone from a to b with fan caps (domed by `cap`)."""
    a, b = Vector(a), Vector(b)
    r1 = r if r1 is None else r1
    d = (b - a).normalized()
    if binormal is None:
        binormal = (1, 0, 0) if abs(d.x) < 0.9 else (0, 0, 1)
    ph = math.pi / sides if phase is None else phase
    path = [a.lerp(b, i / n) for i in range(n + 1)]
    secs = [sec_circle(r + (r1 - r) * i / n, sides, ph) for i in range(n + 1)]
    return sweep(path, secs, binormal, tag, cap, cap if cap_end is None else cap_end, flat).outward()


def cone(base, tip, r, sides=6, flat=False):
    base, tip = Vector(base), Vector(tip)
    return lathe([(r, 0.0), (0.0, (tip - base).length)], sides, cap_bottom=0.0, flat=flat).transformed(
        facing(base, tip - base)).outward()


def tube(points, radius, sides=6, cap=0.0, binormal=(1, 0, 0), tag=None, flat=False):
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * len(points)
    secs = [[(0.0, 0.0)] if r <= 1e-6 else sec_circle(r, sides, math.pi / sides) for r in radii]
    return sweep(points, secs, binormal, tag, cap, cap, flat).outward()


def bez(points, n):
    pts = [Vector(p) for p in points]
    out = []
    for i in range(n):
        t = i / (n - 1)
        if len(pts) == 2:
            out.append(pts[0].lerp(pts[1], t))
        elif len(pts) == 3:
            out.append((1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2])
        else:
            out.append((1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2]
                       + t ** 3 * pts[3])
    return out


# ------------------------------------------------------------- sections
def sec_circle(r, n=8, phase=0.0, flatten=1.0):
    return [(r * math.cos(phase + TAU * i / n), r * flatten * math.sin(phase + TAU * i / n)) for i in range(n)]


def sec_super(a, c, n=12, p=3.0, phase=None):
    """Superellipse: p = 2 is an ellipse, larger is boxier."""
    phase = math.pi / n if phase is None else phase
    out = []
    for i in range(n):
        th = phase + TAU * i / n
        ct, st = math.cos(th), math.sin(th)
        out.append((a * math.copysign(abs(ct) ** (2 / p), ct), c * math.copysign(abs(st) ** (2 / p), st)))
    return out


# Blade cross-section: 12 points, edges at a = +-w, ridge at c = +-t.
EDGE = {0, 5, 6, 11}
CENTRE = {2, 3, 8, 9}


def sec_blade(w, t, e=0.86):
    return [(w, 0.0), (e * w, 0.5 * t), (0.45 * w, 0.92 * t), (0.0, t), (-0.45 * w, 0.92 * t), (-e * w, 0.5 * t),
            (-w, 0.0), (-e * w, -0.5 * t), (-0.45 * w, -0.92 * t), (0.0, -t), (0.45 * w, -0.92 * t),
            (e * w, -0.5 * t)]


def sec_hex(w, t):
    return [(w, 0.0), (0.5 * w, t), (-0.5 * w, t), (-w, 0.0), (-0.5 * w, -t), (0.5 * w, -t)]


def blade_surface_c(w, t, a, e=0.86):
    """Height (c) of the blade section's upper surface at width a."""
    pts = [(-w, 0.0), (-e * w, 0.5 * t), (-0.45 * w, 0.92 * t), (0.0, t), (0.45 * w, 0.92 * t), (e * w, 0.5 * t),
           (w, 0.0)]
    a = max(-w, min(w, a))
    for (a0, c0), (a1, c1) in zip(pts, pts[1:]):
        if a0 <= a <= a1:
            k = 0.0 if a1 == a0 else (a - a0) / (a1 - a0)
            return c0 + (c1 - c0) * k
    return 0.0


# ------------------------------------------------------------- outlines
def ccw(pts):
    area = sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))
    return list(pts) if area >= 0 else list(reversed(pts))


def offset_outline(pts, d):
    """Inset a CCW outline by d (miter joins, clamped)."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e0 = (p1 - p0).normalized()
        e1 = (p2 - p1).normalized()
        n0 = Vector((-e0.y, e0.x))
        n1 = Vector((-e1.y, e1.x))
        m = n0 + n1
        if m.length < 1e-6:
            m = n0.copy()
        m.normalize()
        k = max(m.dot(n0), 0.45)
        out.append(p1 + m * (d / k))
    return out


def slab(outline, thick, bev=None, dome=0.0, cap='fan', tag=None, centre=None):
    """A pillowy extrusion of a 2D outline (local XY) along local Z, centred on z = 0.
    cap 'fan' suits star-shaped outlines (fan from the centre); 'ngon' suits any outline (flat caps)."""
    pts = [Vector((float(x), float(y))) for x, y in ccw(outline)]
    h = thick / 2
    b = min(h * 0.8, 0.018) if bev is None else bev
    prof = [(b, -h), (0.0, -0.3 * h), (0.0, 0.3 * h), (b, h)]
    rings = [[Vector((p.x, p.y, z)) for p in offset_outline(pts, inset)] for inset, z in prof]
    if cap == 'fan':
        c = Vector(centre) if centre else sum(pts, Vector((0.0, 0.0))) / len(pts)
        g = skin(rings, tag, Vector((c.x, c.y, -h - dome)), Vector((c.x, c.y, h + dome)))
    else:
        g = skin(rings, tag, 'ngon', 'ngon')
    return g.outward()


def star_outline(points=5, r_out=1.0, r_in=0.45, phase=math.pi / 2):
    return [((r_out if i % 2 == 0 else r_in) * math.cos(phase + math.pi * i / points),
             (r_out if i % 2 == 0 else r_in) * math.sin(phase + math.pi * i / points)) for i in range(2 * points)]


def ellipse_outline(rx, ry, n=12, phase=0.0):
    return [(rx * math.cos(phase + TAU * i / n), ry * math.sin(phase + TAU * i / n)) for i in range(n)]


def leaf_outline(length, width, n=5, tip_bias=0.45):
    """A leaf/feather lying along +Y from the origin."""
    right, left = [], []
    for i in range(1, n):
        t = i / n
        w = width * math.sin(math.pi * t ** (1 / (1 + tip_bias))) / 2
        right.append((w, length * t))
        left.append((-w, length * t))
    return [(0.0, 0.0)] + right + [(0.0, length)] + list(reversed(left))


def disc(outline, dome=0.0):
    """A fan over a 2D outline in local XY, domed toward +Z (decals)."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cy = sum(p[1] for p in outline) / n
    verts = [(cx, cy, dome)] + [(x, y, 0.0) for x, y in ccw(outline)]
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    return Geo(verts, faces)


# ------------------------------------------------------ ellipsoid surfaces
def ell_point(c, radii, direction):
    """Point and normal on the ellipsoid (centre c, radii) along a direction from its centre."""
    d = Vector(direction).normalized()
    a, b, cc = radii
    t = 1.0 / math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / cc) ** 2)
    p = Vector(c) + d * t
    q = p - Vector(c)
    n = Vector((q.x / a ** 2, q.y / b ** 2, q.z / cc ** 2)).normalized()
    return p, n


def decal(piece, c, radii, direction, rx, ry, material, up=(0, 0, 1), lift=0.003, n=10, dome=0.0, outline=None,
          spin=0.0):
    """A flat patch conformed to an ellipsoid (spots, blush, face masks, shell plates)."""
    p0, n0 = ell_point(c, radii, direction)
    fr = facing(p0, n0, up, spin)
    x, y = fr.col[0].xyz, fr.col[1].xyz
    pts = outline if outline is not None else ellipse_outline(rx, ry, n)
    ring = []
    for px, py in ccw(pts):
        q = p0 + x * px + y * py
        p, nn = ell_point(c, radii, q - Vector(c))
        ring.append(p + nn * lift)
    centre = p0 + n0 * (lift + dome)
    verts = [centre] + ring
    faces = [(0, 1 + i, 1 + (i + 1) % len(ring)) for i in range(len(ring))]
    g = Geo(verts, faces)
    fn = (verts[faces[0][1]] - verts[0]).cross(verts[faces[0][2]] - verts[0])
    if fn.dot(n0) < 0:
        g = g.flipped()
    piece.add(g, material)
    return p0, n0


EYE_PROFILE = [(1.0, 0.0), (0.82, 0.2), (0.45, 0.34), (0.0, 0.38)]


def _eye_height(rho):
    for (r0, z0), (r1, z1) in zip(EYE_PROFILE, EYE_PROFILE[1:]):
        if r1 <= rho <= r0:
            k = (r0 - rho) / (r0 - r1)
            return z0 + (z1 - z0) * k
    return EYE_PROFILE[-1][1] if rho < 0.5 else 0.0


def add_eye(piece, pos, normal, r, dark, white, up=(0, 0, 1), squash=1.2, sink=0.1, segs=10, glint=True):
    """A big chibi eye: a glossy dark oval dome with a large upper glint and a small lower one."""
    n = Vector(normal).normalized()
    base = Vector(pos) - n * r * sink
    m = facing(base, n, up) @ scl(1.0, squash, 1.0)
    dome = lathe([(r * a, r * b) for a, b in EYE_PROFILE], segs, cap_bottom=0.0).outward()
    piece.add(dome, dark, m)
    if glint:
        for gx, gy, gr in ((-0.3, 0.34, 0.34), (0.32, -0.3, 0.15)):
            rho = math.hypot(gx, gy)
            z = r * _eye_height(rho)
            g = lathe([(gr * r, 0.0), (0.6 * gr * r, 0.04 * r), (0.0, 0.06 * r)], 6, cap_bottom=0.0).outward()
            piece.add(g, white, m @ Matrix.Translation(Vector((gx * r, gy * r, z - 0.02 * r))))


def surface_arc(c, radii, direction, width, depth, up=(0, 0, 1), n=7, lift=0.004):
    """Points of a smile-shaped arc projected onto an ellipsoid."""
    p0, n0 = ell_point(c, radii, direction)
    fr = facing(p0, n0, up)
    x, y = fr.col[0].xyz, fr.col[1].xyz
    pts = []
    for i in range(n):
        s = -1 + 2 * i / (n - 1)
        q = p0 + x * (s * width) + y * (-depth * (1 - s * s))
        p, nn = ell_point(c, radii, q - Vector(c))
        pts.append(p + nn * lift)
    return pts, n0


def ribbon(points, normals, widths, lift=0.0):
    """A one-sided strip over a surface, facing along the normals (cracks, stripes)."""
    n = len(points)
    verts, faces = [], []
    for i, p in enumerate(points):
        d = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        side = d.cross(normals[i]).normalized() * (widths[i] / 2)
        base = p + normals[i] * lift
        verts += [base + side, base - side]
    for i in range(n - 1):
        faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    g = Geo(verts, faces)
    fn = (g.verts[2] - g.verts[0]).cross(g.verts[1] - g.verts[0])
    if fn.dot(normals[0]) < 0:
        g = g.flipped()
    return g


# =============================================================== materials
def WM(name, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
    """style.mat, single sided (every part is a closed shape or a decal on one)."""
    m = mat(name, color, rough, metal, emit, strength)
    m.use_backface_culling = True
    return m


def material_info(m):
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    ec = bsdf.inputs['Emission Color'].default_value
    es = bsdf.inputs['Emission Strength'].default_value
    return dict(rough=round(bsdf.inputs['Roughness'].default_value, 3),
                metal=round(bsdf.inputs['Metallic'].default_value, 3),
                emissive=bool(es > 0 and max(ec[0], ec[1], ec[2]) > 0), strength=round(es, 3))


# ================================================================= weapons
class Weapon:
    """One weapon, authored in its hand frame: the grip point at the origin, explorer axes (forward -Y)."""

    def __init__(self, wid):
        self.id = wid
        self.kind = KIND[wid]
        self.piece = Piece(f'{wid}@hand-right')
        self.empties = {}
        self.handle = (Vector((0, 0.15, 0)), Vector((0, -0.15, 0)))
        self.grip_mats = set()
        self.note = ''

    def m(self, part, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
        return WM(f'Weapon {self.id} {part}', color, rough, metal, emit, strength)

    def add(self, geo, material, m=None, smooth=True):
        self.piece.add(geo, material, m, smooth)


def grip_sweep(W, a, b, start, end, r=0.046, bands=7, sides=8, ends=0.0):
    """A wrapped grip from start to end with alternating bands; registers the handle."""
    start, end = Vector(start), Vector(end)
    path = [start.lerp(end, i / bands) for i in range(bands + 1)]
    g = sweep(path, [sec_circle(r, sides, math.pi / sides)] * (bands + 1), (1, 0, 0),
              lambda bb, s: 'a' if bb % 2 == 0 else 'b', ends, ends).outward()
    W.add(g, {'a': a, 'b': b})
    W.grip_mats |= {a, b}
    W.handle = (start, end)


def sword_hilt(W, grip, guard, pommel, grip_r=0.046, guard_half=0.17, guard_y=-0.19, guard_sec=(0.05, 0.068),
               pommel_r=0.066, back=0.17, front=-0.17):
    a, b = grip if isinstance(grip, tuple) else (grip, grip)
    grip_sweep(W, a, b, (0, back, 0), (0, front, 0), grip_r)
    if guard is not None:
        gp = [(0.0, guard_y, -guard_half + guard_half * i) for i in range(3)]
        W.add(sweep(gp, [sec_super(guard_sec[0], guard_sec[1], 12, 3.0)] * 3, (1, 0, 0), None, 0.035, 0.035)
              .outward(), guard)
    if pommel is not None:
        W.add(sphere(pommel_r, 10, 7).moved((0, back + pommel_r * 0.75, 0)), pommel)


def blade_sweep(W, us, y0, length, w, t, mats, tag=None, curve=None, flat=False, sec=sec_blade):
    path, secs = [], []
    for u in us:
        path.append((0.0, y0 - u * length, curve(u) if curve else 0.0))
        wu, tu = w(u), t(u)
        secs.append([(0.0, 0.0)] if wu < 1e-4 else sec(wu, tu))
    last = len(us) - 2
    tagf = tag or (lambda b, s: 'blade')
    g = sweep(path, secs, (1, 0, 0), lambda b, s: tagf(min(max(b, 0), last), s), 0.0, 0.0, flat).outward()
    W.add(g, mats if isinstance(mats, dict) else {'blade': mats})


def tip_round(u, u0):
    return 1.0 if u < u0 else math.sqrt(max(0.0, 1.0 - ((u - u0) / (1.0 - u0)) ** 2))


def star(r_out, r_in, thick, points=5, dome=0.2):
    return slab(star_outline(points, r_out, r_in), thick, bev=min(thick * 0.3, 0.012), dome=thick * dome)


# ---------------------------------------------------------------- swords
def build_sword_wood():
    W = Weapon('sword_wood')
    blade = W.m('blade', '#F7BE6E', 0.55)
    grain = W.m('grain', '#DE8A45', 0.55)
    dark = W.m('dark wood', '#8A4B25', 0.5)
    wrap = W.m('wrap', '#2FBF4F', 0.6)
    peg = W.m('peg', '#FFD35C', 0.4)
    sword_hilt(W, (wrap, dark), dark, dark)
    us = [0, .12, .26, .4, .54, .66, .76, .84, .9, .95, 1.0]
    blade_sweep(W, us, -0.2, 0.84, lambda u: (0.108 - 0.012 * u) * tip_round(u, 0.78), lambda u: 0.04 - 0.01 * u,
                {'blade': blade, 'grain': grain}, lambda b, s: 'grain' if s in CENTRE else 'blade')
    for z in (-0.17, 0.17):
        W.add(cyl((-0.075, -0.19, z), (0.075, -0.19, z), 0.028, sides=8, cap=0.01), peg)
    return W


def build_sword_tusk():
    W = Weapon('sword_tusk')
    ivory = W.m('ivory', '#FFF4DC', 0.35)
    root = W.m('ivory root', '#E8C98E', 0.45)
    fur = W.m('fur', '#9A5A30', 0.75)
    leather = W.m('leather', '#6B3A22', 0.6)
    cord = W.m('cord', '#EF3B3B', 0.5)
    sword_hilt(W, (leather, cord), None, None)
    us = [0, .1, .22, .36, .5, .63, .75, .85, .93, 1.0]
    path, secs = [], []
    for u in us:
        path.append((0.0, -0.17 - u * 0.86, 0.26 * u ** 2.2))
        r = 0.108 * (1 - u) ** 0.75 + 0.004 * (1 - u)
        secs.append([(0.0, 0.0)] if u >= 1 else sec_circle(r, 10, 0.0, 0.84))
    g = sweep(path, secs, (1, 0, 0), lambda b, s: 'root' if b <= 0 else 'ivory', 0.0, 0.0).outward()
    W.add(g, {'root': root, 'ivory': ivory})
    # Carved rings near the root.
    for u in (0.16, 0.24):
        W.add(torus(0.1 * (1 - u) ** 0.75, 0.013, 10, 3).transformed(
            facing((0, -0.17 - u * 0.86, 0.26 * u ** 2.2), (0, -1, 0.5 * u))), cord)
    # Fur collar as the guard: a lumpy ring of puffs around the base.
    collar = torus(0.075, 0.05, 12, 6)
    for v in collar.verts:
        a = math.atan2(v.y, v.x)
        v *= 1.0 + 0.1 * math.cos(6 * a)
    W.add(collar.outward(), fur, facing((0, -0.19, 0), (0, 1, 0)))
    W.add(sphere(0.06, 10, 6, scale=(1, 1.1, 1)).moved((0, 0.225, 0)), root)
    W.add(torus(0.05, 0.014, 12, 4).transformed(facing((0, 0.2, 0), (0, 1, 0))), cord)
    return W


def build_sword_crystal():
    W = Weapon('sword_crystal')
    crystal = W.m('crystal', '#62EEFF', 0.18, emit='#2FD8FF', strength=1.1)
    light = W.m('crystal light', '#D2FCFF', 0.15, emit='#8FF3FF', strength=0.9)
    violet = W.m('violet crystal', '#A77BFF', 0.2, emit='#8A5BFF', strength=0.7)
    silver = W.m('silver', '#E4ECF6', 0.3, metal=0.2)
    navy = W.m('grip', '#2B4C9B', 0.55)
    sword_hilt(W, (navy, silver), silver, None, guard_half=0.15, guard_sec=(0.045, 0.06))
    us = [0.0, 0.07, 0.72, 1.0]
    ws = {0.0: 0.07, 0.07: 0.115, 0.72: 0.125, 1.0: 0.0}
    blade_sweep(W, us, -0.2, 0.9, lambda u: ws[u], lambda u: 0.055 if u < 1 else 0.0,
                {'a': crystal, 'b': light}, lambda b, s: 'a' if s % 2 == 0 else 'b', flat=True,
                sec=sec_hex)
    # Side shards at the blade root and on the guard ends.
    for side in (-1, 1):
        base = Vector((0, -0.23, side * 0.07))
        tip = base + Vector((0, -0.22, side * 0.12))
        W.add(sweep([base, base.lerp(tip, 0.7), tip], [sec_hex(0.035, 0.03), sec_hex(0.035, 0.03), [(0, 0)]],
                    (1, 0, 0), None, 0.0, 0.0, flat=True).outward(), light)
        gb = Vector((0, -0.19, side * 0.14))
        W.add(sweep([gb, gb + Vector((0, -0.04, side * 0.09)), gb + Vector((0, -0.07, side * 0.15))],
                    [sec_hex(0.04, 0.035), sec_hex(0.04, 0.035), [(0, 0)]], (1, 0, 0), None, 0.0, 0.0,
                    flat=True).outward(), violet)
    W.add(lathe([(0, -0.07), (0.05, 0), (0, 0.07)], 4, flat=True).transformed(facing((0, 0.225, 0), (0, 1, 0)))
          .outward(), crystal)
    W.add(lathe([(0, -0.04), (0.035, 0), (0, 0.04)], 4, flat=True).transformed(
        facing((0.07, -0.19, 0), (1, 0, 0))).outward(), violet)
    W.add(lathe([(0, -0.04), (0.035, 0), (0, 0.04)], 4, flat=True).transformed(
        facing((-0.07, -0.19, 0), (-1, 0, 0))).outward(), violet)
    return W


def build_sword_candy():
    W = Weapon('sword_candy')
    red = W.m('candy red', '#E8283F', 0.25)
    white = W.m('candy white', '#FFFDF6', 0.25)
    pink = W.m('bonbon', '#FF6FB0', 0.3)
    wrapper = W.m('wrapper', '#FFD35C', 0.35)
    mint = W.m('grip', '#39D6A4', 0.4)
    sword_hilt(W, (mint, white), None, pink, pommel_r=0.07)
    n = 15
    us = [i / n for i in range(n)] + [0.97, 1.0]
    path, secs = [], []
    for u in us:
        path.append((0.0, -0.2 - u * 0.82, 0.0))
        r = 0.058 * tip_round(u, 0.9)
        secs.append([(0.0, 0.0)] if r < 1e-4 else sec_circle(r, 10, 0.0))
    g = sweep(path, secs, (1, 0, 0), lambda b, s: 'r' if (s + max(b, 0)) % 5 < 2 else 'w', 0.0, 0.0).outward()
    W.add(g, {'r': red, 'w': white})
    # Guard: a wrapped bonbon crossways.
    W.add(sphere(0.075, 10, 6, scale=(1, 1, 1.15)).moved((0, -0.19, 0)), pink)
    for side in (-1, 1):
        prof = [(0.03, 0.0), (0.05, 0.05), (0.078, 0.1), (0.07, 0.13), (0.0, 0.135)]
        g = lathe(prof, 10, mod=lambda th, i: 1 + (0.22 * math.cos(5 * th) if i >= 2 else 0.0),
                  cap_bottom=0.0).outward()
        W.add(g, wrapper, facing((0, -0.19, side * 0.07), (0, 0, side)))
    return W


def build_sword_lava():
    W = Weapon('sword_lava')
    rock = W.m('rock', '#3E2A30', 0.65)
    magma = W.m('magma', '#FF7A1A', 0.4, emit='#FF5A0A', strength=3.0)
    char = W.m('grip', '#2A2230', 0.6)
    sword_hilt(W, (char, magma), rock, magma, guard_sec=(0.055, 0.075), pommel_r=0.062)
    us = [0, .09, .19, .29, .39, .49, .59, .69, .78, .87, .94, 1.0]
    jag = [1.0, 1.08, 0.94, 1.07, 0.95, 1.06, 0.94, 1.05, 0.95, 1.0, 1.0, 1.0]

    def w(u):
        i = us.index(u)
        return (0.118 - 0.02 * u) * jag[i] * tip_round(u, 0.8)

    def t(u):
        return 0.045 - 0.012 * u
    blade_sweep(W, us, -0.2, 0.86, w, t, {'rock': rock, 'magma': magma},
                lambda b, s: 'magma' if s in CENTRE else 'rock')
    # Glowing cracks branching from the core on both faces.
    cracks = [[(0.12, 0.1), (0.18, 0.55), (0.24, 0.42), (0.3, 0.78)],
              [(0.36, -0.1), (0.42, -0.6), (0.5, -0.45), (0.55, -0.8)],
              [(0.58, 0.1), (0.64, 0.5), (0.7, 0.66)],
              [(0.2, -0.1), (0.25, -0.5), (0.3, -0.72)],
              [(0.72, -0.05), (0.78, -0.45)]]
    for side in (1, -1):
        for crack in cracks:
            pts, nrm, wid = [], [], []
            for k, (u, af) in enumerate(crack):
                wu, tu = (0.118 - 0.02 * u) * tip_round(u, 0.8), 0.045 - 0.012 * u
                a = af * wu * side
                c = blade_surface_c(wu, tu, a)
                pts.append(Vector((side * c, -0.2 - u * 0.86, a)))
                nrm.append(Vector((side, 0, 0)))
                wid.append(0.022 * (1 - 0.6 * k / (len(crack) - 1)))
            W.add(ribbon(pts, nrm, wid, lift=0.004), magma)
    return W


def build_sword_obsidian():
    W = Weapon('sword_obsidian')
    glass = W.m('glass', '#231A2E', 0.12)
    edge = W.m('edge', '#FF8A1A', 0.3, emit='#FF6A00', strength=2.4)
    violet = W.m('grip', '#4A3272', 0.55)
    sword_hilt(W, (violet, edge), glass, None, guard_half=0.12, guard_sec=(0.05, 0.065))
    us = [0, .1, .25, .45, .62, .75, .86, .94, 1.0]
    ws = [0.085, 0.1, 0.112, 0.118, 0.118, 0.11, 0.085, 0.048, 0.0]
    blade_sweep(W, us, -0.2, 0.9, lambda u: ws[us.index(u)], lambda u: 0.04 - 0.012 * u,
                {'glass': glass, 'edge': edge}, lambda b, s: 'edge' if s in EDGE else 'glass', flat=True)
    # Obsidian shard guard ends and pommel; an ember gem in the middle.
    for side in (-1, 1):
        b0 = Vector((0, -0.19, side * 0.1))
        W.add(sweep([b0, b0 + Vector((0, 0.015, side * 0.07)), b0 + Vector((0, 0.06, side * 0.15))],
                    [sec_hex(0.05, 0.04), sec_hex(0.04, 0.035), [(0, 0)]], (1, 0, 0), None, 0.0, 0.0,
                    flat=True).outward(), glass)
    W.add(lathe([(0, -0.045), (0.04, 0), (0, 0.045)], 6, flat=True).transformed(
        facing((0, -0.19, 0), (1, 0, 0), up=(0, -1, 0))).transformed(scl(1.9, 1, 1)).moved((0.0, 0, 0))
          .outward(), edge)
    W.add(lathe([(0, 0.0), (0.06, 0.03), (0, 0.13)], 5, cap_bottom=0.0, flat=True).transformed(
        facing((0, 0.16, 0), (0, 1, 0))).outward(), glass)
    return W


# -------------------------------------------------------------- blasters
def blaster_grip(W, material, band=None, a=0.05, c=0.041, bottom=-0.155, top=0.16, lean=0.085):
    """A slim pistol grip through the fist, its top leaning forward, with a rounded butt."""
    start, end = Vector((0, lean * abs(bottom) / top, bottom)), Vector((0, -lean, top))
    n = 4
    path = [start.lerp(end, i / n) for i in range(n + 1)]
    g = sweep(path, [sec_super(a, c, 10, 2.8)] * (n + 1), (1, 0, 0),
              lambda b, s: 'b' if (band is not None and b <= 0) else 'a', 0.03, 0.0).outward()
    W.add(g, {'a': material, 'b': band or material})
    W.grip_mats.add(material)
    W.handle = (start, end)


def trigger_guard(W, material):
    """A loop in front of the grip, under the body: the cue that says 'blaster'."""
    pts = [Vector(p) for p in ((0, -0.07, 0.15), (0, -0.16, 0.13), (0, -0.19, 0.07), (0, -0.16, 0.015),
                               (0, -0.09, 0.0))]
    W.add(tube(pts, 0.016, sides=5, cap=0.008), material)
    W.add(tube([Vector((0, -0.1, 0.14)), Vector((0, -0.12, 0.09)), Vector((0, -0.105, 0.06))], [0.014, 0.013, 0.01],
               sides=5, cap=0.006), material)


def body_sweep(y0, y1, z, a, c, n=4, p=3.0, sides=12, cap=0.05, tag=None, radii=None):
    path = [(0.0, y0 + (y1 - y0) * i / n, z) for i in range(n + 1)]
    secs = []
    for i in range(n + 1):
        k = radii[i] if radii else 1.0
        secs.append(sec_super(a * k, c * k, sides, p))
    return sweep(path, secs, (1, 0, 0), tag, cap, cap).outward()


BZ = 0.235     # blaster body/barrel axis height above the grip point (the fist's top is at ~0.17)


def head_ok(p, r=0.0):
    """Blasters are unposed, so their hand frame is explorer space minus the grip point."""
    return head_clearance(HAND + Vector(p)) - r >= 0.0


def calyx(W, material, y, z, ring, count=4, length=0.13, width=0.075, spin=TAU / 8, splay=0.55):
    """Small leaves around a barrel root, pointing forward and out (like a flower's sepals)."""
    for k in range(count):
        a = spin + TAU * k / count
        radial = Vector((math.cos(a), 0.0, math.sin(a)))
        d = (radial * splay + Vector((0, -1, 0))).normalized()
        n = (radial - d * radial.dot(d)).normalized()
        W.add(slab(leaf_outline(length, width, 4), 0.018, bev=0.006, dome=0.004), material,
              facing(Vector((0, y, z)) + radial * ring, n, up=d))


def build_gun_pea():
    W = Weapon('gun_pea')
    green = W.m('body', '#56C93A', 0.45)
    light = W.m('barrel', '#9BE860', 0.45)
    dark = W.m('leaf', '#1F8E3A', 0.5)
    pea = W.m('pea', '#C8F76E', 0.35)
    mouth = W.m('mouth', '#17502A', 0.6)
    stem = W.m('grip', '#8A5A2E', 0.55)
    blaster_grip(W, stem)
    trigger_guard(W, dark)
    W.add(sphere(1.0, 12, 7, scale=(0.115, 0.23, 0.105)).moved((0, -0.1, BZ)), green)
    prof = [(0.058, 0.0), (0.056, 0.2), (0.085, 0.26), (0.1, 0.3), (0.078, 0.316), (0.05, 0.3)]
    g = lathe(prof, 12, tag=lambda b, s: 'm' if b >= 4 else 'g', cap_top=-0.05).outward()
    W.add(g, {'g': light, 'm': mouth}, facing((0, -0.28, BZ), (0, -1, 0)))
    calyx(W, dark, -0.3, BZ, 0.05, count=3, spin=TAU / 4, length=0.15)
    # A pea-pod magazine on top, forward of the head, showing three peas.
    W.add(sphere(1.0, 8, 5, scale=(0.062, 0.17, 0.042)).moved((0, -0.24, 0.325)), dark)
    for k in (-1, 0, 1):
        W.add(sphere(0.043, 8, 4).moved((0, -0.24 + k * 0.09, 0.355)), pea)
    W.empties['muzzle'] = Vector((0, -0.6, BZ))
    return W


def build_gun_bubble():
    W = Weapon('gun_bubble')
    pink = W.m('body', '#FF4F8B', 0.35)
    white = W.m('stripe', '#FFFDF6', 0.35)
    glass = W.m('tank', '#86DAFF', 0.1, emit='#A8ECFF', strength=0.35)
    yellow = W.m('trim', '#FFC83A', 0.35)
    wand = W.m('wand', '#A77BFF', 0.35)
    grip = W.m('grip', '#8A5BFF', 0.45)
    blaster_grip(W, grip)
    trigger_guard(W, yellow)
    W.add(body_sweep(0.1, -0.46, BZ, 0.1, 0.1, n=5, sides=10, tag=lambda b, s: 'w' if b in (1, 3) else 'p'),
          {'p': pink, 'w': white})
    ty, tz = -0.34, 0.385
    W.add(sphere(0.105, 12, 6).moved((0, ty, tz)), glass)
    W.add(cyl((0, ty, 0.3), (0, ty, 0.325), 0.064, sides=10, cap=0.0), yellow)
    W.add(sphere(0.034, 8, 4, scale=(1, 1, 0.7)).moved((0, ty, tz + 0.105)), yellow)
    W.add(sphere(0.02, 6, 4, scale=(1, 0.5, 1)).moved((-0.045, ty - 0.08, tz + 0.04)), white)
    W.add(cyl((0, -0.45, BZ), (0, -0.56, BZ), 0.05, sides=10, cap=0.0), yellow)
    W.add(torus(0.095, 0.026, 12, 5).transformed(facing((0, -0.62, BZ), (0, -1, 0))), wand)
    W.add(cyl((0, -0.55, BZ), (0, -0.6, BZ), 0.036, sides=8, cap=0.0), wand)
    W.empties['muzzle'] = Vector((0, -0.62, BZ))
    return W


def build_gun_spike():
    W = Weapon('gun_spike')
    cactus = W.m('cactus', '#3DB24E', 0.5)
    spine = W.m('spine', '#FFF3D0', 0.4)
    pot = W.m('grip', '#E0773A', 0.55)
    rim = W.m('pot rim', '#B8552A', 0.55)
    petal = W.m('flower', '#FF5C9A', 0.4)
    centre = W.m('flower centre', '#FFD21A', 0.4)
    mouth = W.m('mouth', '#1D5A2A', 0.6)
    blaster_grip(W, pot, rim, a=0.055, c=0.045)
    trigger_guard(W, rim)
    W.add(cyl((0, 0.06, 0.15), (0, -0.04, 0.165), 0.07, sides=10, cap=0.0), rim)
    ribs = 8
    prof = [(0.0, 0.0), (0.065, 0.012), (0.094, 0.05), (0.106, 0.13), (0.106, 0.5), (0.096, 0.57), (0.08, 0.6)]
    g = lathe(prof, 16, mod=lambda th, i: 1 + 0.1 * math.cos(ribs * th), cap_top=-0.02,
              tag=lambda b, s: 'm' if b >= len(prof) - 1 else 'c').outward()
    body = facing((0, 0.13, BZ), (0, -1, 0))
    W.add(g, {'c': cactus, 'm': mouth}, body)
    for k in range(ribs):
        th = TAU * k / ribs
        if abs(math.sin(th) + 1) < 1e-3:
            continue
        for zz in (0.14, 0.3, 0.46):
            r = 0.106 * 1.1
            p = body @ Vector((r * math.cos(th), r * math.sin(th), zz + 0.03 * (k % 2)))
            d = (body.to_3x3() @ Vector((math.cos(th), math.sin(th), 0.25))).normalized()
            if head_ok(p + d * 0.05, 0.01):
                W.add(cone(p - d * 0.01, p + d * 0.055, 0.014, 3), spine)
    for k in range(6):
        th = TAU * k / 6 + 0.3
        p = body @ Vector((0.082 * math.cos(th), 0.082 * math.sin(th), 0.59))
        d = (body.to_3x3() @ Vector((math.cos(th) * 0.6, math.sin(th) * 0.6, 1.0))).normalized()
        W.add(cone(p - d * 0.01, p + d * 0.075, 0.017, 3), spine)
    fc = Vector((0, -0.27, BZ + 0.112))
    for k in range(5):
        a = TAU * k / 5
        W.add(sphere(1.0, 6, 4, scale=(0.05, 0.03, 0.02)).transformed(
            xf(fc + Vector((math.cos(a) * 0.045, math.sin(a) * 0.045, 0.0)), (0, 0, a))), petal)
    W.add(sphere(0.028, 6, 4).moved(fc + Vector((0, 0, 0.012))), centre)
    W.empties['muzzle'] = Vector((0, -0.49, BZ))
    return W


def build_gun_ice():
    W = Weapon('gun_ice')
    ice = W.m('body', '#8EDCFF', 0.25)
    frost = W.m('frost', '#F4FAFF', 0.5)
    crystal = W.m('crystal', '#C8F6FF', 0.15, emit='#8DEBFF', strength=0.8)
    navy = W.m('grip', '#2B4C9B', 0.45)
    blaster_grip(W, navy)
    trigger_guard(W, navy)
    W.add(body_sweep(0.1, -0.4, BZ, 0.1, 0.095, n=4, radii=[0.9, 1.0, 1.0, 1.0, 0.92]), ice)
    for p, r in (((0.03, 0.0, 0.32), 0.05), ((0.0, -0.12, 0.325), 0.055), ((-0.01, -0.25, 0.325), 0.052),
                 ((0.01, -0.35, 0.32), 0.045)):
        if head_ok(Vector(p) + Vector((0, 0, r * 0.7)), 0.0):
            W.add(sphere(r, 8, 5, scale=(1.2, 1, 0.7)).moved(p), frost)
    for base, d, ln in (((0.03, -0.26, 0.31), (0.35, -0.3, 1.0), 0.2), ((0.08, -0.13, 0.28), (1.0, 0.15, 0.7), 0.16),
                        ((-0.03, -0.34, 0.31), (-0.35, -0.2, 1.0), 0.15), ((0.07, -0.34, 0.29), (0.9, -0.4, 0.8), 0.12)):
        b0 = Vector(base)
        dv = Vector(d).normalized()
        W.add(sweep([b0 - dv * 0.03, b0 + dv * ln * 0.65, b0 + dv * ln],
                    [sec_hex(0.036, 0.032), sec_hex(0.036, 0.032), [(0, 0)]],
                    (1, 0, 0) if abs(dv.x) < 0.9 else (0, 1, 0), None, 0.0, 0.0, flat=True).outward(), crystal)
    W.add(cyl((0, -0.38, BZ), (0, -0.47, BZ), 0.062, sides=10, cap=0.0), navy)
    W.add(sweep([(0, -0.45, BZ), (0, -0.52, BZ), (0, -0.7, BZ)],
                [sec_hex(0.065, 0.058), sec_hex(0.065, 0.058), [(0, 0)]], (1, 0, 0), None, 0.0, 0.0, flat=True)
          .outward(), crystal)
    # A snowflake on each side.
    for side in (-1, 1):
        for k in range(3):
            arm = slab([(-0.075, -0.013), (0.075, -0.013), (0.075, 0.013), (-0.075, 0.013)], 0.014, bev=0.004,
                       cap='ngon')
            W.add(arm, frost, facing((side * 0.1, -0.15, BZ), (side, 0, 0), spin=math.pi * k / 3))
    W.empties['muzzle'] = Vector((0, -0.7, BZ))
    return W


def build_blaster_rainbow():
    W = Weapon('blaster_rainbow')
    white = W.m('body', '#FFFDF6', 0.3)
    sky = W.m('grip', '#35B6F2', 0.4)
    gold = W.m('trim', '#FFC83A', 0.35, metal=0.2)
    glow = W.m('emitter', '#FFFFFF', 0.2, emit='#FFF6D0', strength=1.6)
    colours = [('red', '#FF3B3B'), ('orange', '#FF8A1A'), ('yellow', '#FFD21A'), ('green', '#3FD24A'),
               ('blue', '#35A6F2'), ('violet', '#9B6BFF')]
    rings = [W.m(f'band {n}', c, 0.35, emit=c, strength=0.45) for n, c in colours]
    blaster_grip(W, sky)
    trigger_guard(W, sky)
    W.add(sphere(1.0, 12, 7, scale=(0.11, 0.19, 0.105)).moved((0, -0.02, BZ)), white)
    W.add(cyl((0, -0.12, BZ), (0, -0.56, BZ), 0.05, sides=10, cap=0.0), white)
    for k, m in enumerate(rings):
        y = -0.17 - k * 0.063
        W.add(cyl((0, y, BZ), (0, y - 0.045, BZ), 0.068 + 0.012 * (k % 2 == 0), sides=10, cap=0.005), m)
    W.add(torus(0.06, 0.018, 12, 4).transformed(facing((0, -0.56, BZ), (0, -1, 0))), gold)
    W.add(sphere(0.06, 8, 5).moved((0, -0.6, BZ)), glow)
    W.add(star(0.06, 0.028, 0.02), gold, facing((0.112, -0.02, BZ + 0.01), (1, 0, 0)))
    W.empties['muzzle'] = Vector((0, -0.66, BZ))
    return W


# -------------------------------------------------------- hammers & poles
def build_hammer_thunder():
    W = Weapon('hammer_thunder')
    navy = W.m('grip', '#1F2E6B', 0.5)
    gold = W.m('gold', '#F5B21E', 0.3, metal=0.3)
    shaft = W.m('shaft', '#5A6FD8', 0.4)
    head = W.m('head', '#3F4FC4', 0.35)
    bolt = W.m('bolt', '#FFE14A', 0.3, emit='#FFD21A', strength=2.2)
    grip_sweep(W, navy, gold, (0, 0.17, 0), (0, -0.17, 0), 0.047)
    W.add(cyl((0, -0.16, 0), (0, -0.62, 0), 0.042, 0.038, sides=8, cap=0.0), shaft)
    W.add(sphere(0.062, 10, 7).moved((0, 0.215, 0)), gold)
    W.add(cyl((0, -0.56, 0), (0, -0.6, 0), 0.06, sides=10, cap=0.01), gold)
    hy = -0.72
    path = [(0.0, hy, -0.24), (0.0, hy, -0.19), (0.0, hy, 0.19), (0.0, hy, 0.24)]
    secs = [sec_super(0.14, 0.13, 12, 3.2)] * 2 + [sec_super(0.14, 0.13, 12, 3.2)] * 2
    g = sweep(path, secs, (1, 0, 0), lambda b, s: 'h' if b == 1 else 'g', 0.02, 0.02).outward()
    W.add(g, {'h': head, 'g': gold})
    outline = [(0.03, 0.16), (-0.075, -0.015), (-0.008, -0.015), (-0.035, -0.16), (0.075, 0.03), (0.01, 0.03)]
    for side in (-1, 1):
        W.add(slab(outline, 0.03, bev=0.007, cap='ngon'), bolt,
              facing((side * 0.125, hy, 0.0), (side, 0, 0), up=(0, 0, 1)))
    W.add(slab(outline, 0.03, bev=0.007, cap='ngon'), bolt, facing((0, hy - 0.13, 0.0), (0, -1, 0), up=(0, 0, 1)))
    return W


def build_toy_hammer():
    W = Weapon('toy_hammer')
    yellow = W.m('handle', '#FFC83A', 0.35)
    red = W.m('head', '#F0303A', 0.35)
    cap = W.m('cap', '#FFD84A', 0.35)
    white = W.m('star', '#FFFDF6', 0.35)
    grip_sweep(W, yellow, red, (0, 0.17, 0), (0, -0.17, 0), 0.047, bands=5)
    W.add(cyl((0, -0.16, 0), (0, -0.52, 0), 0.044, sides=8, cap=0.0), yellow)
    W.add(sphere(0.066, 10, 6).moved((0, 0.22, 0)), red)
    hy = -0.66
    prof = [(0.155, -0.2), (0.176, -0.16), (0.152, -0.108), (0.176, -0.054), (0.152, 0.0), (0.176, 0.054),
            (0.152, 0.108), (0.176, 0.16), (0.155, 0.2)]
    W.add(lathe(prof, 14, cap_bottom=0.0, cap_top=0.0).outward(), red, Matrix.Translation((0, hy, 0)))
    for side in (-1, 1):
        prof = [(0.17, 0.0), (0.192, 0.018), (0.188, 0.058), (0.0, 0.07)]
        W.add(lathe(prof, 14, cap_bottom=0.0).outward(), cap, facing((0, hy, side * 0.195), (0, 0, side)))
        W.add(star(0.08, 0.036, 0.02), white, facing((0, hy, side * 0.268), (0, 0, side), up=(0, -1, 0)))
    return W


def build_scythe_moon():
    W = Weapon('scythe_moon')
    shaft = W.m('shaft', '#6A4BD6', 0.4)
    gold = W.m('gold', '#FFC83A', 0.3, metal=0.25)
    moon = W.m("moon", "#FFE45C", 0.3, emit="#FFD23A", strength=1.0)
    edge = W.m('moon edge', '#FFFFFF', 0.25, emit='#FFF6D8', strength=1.2)
    crater = W.m('crater', '#F5C95A', 0.4, emit='#F2B84A', strength=0.5)
    gem = W.m('gem', '#C69CFF', 0.2, emit='#A77BFF', strength=0.8)
    grip_sweep(W, shaft, gold, (0, 0.2, 0), (0, -0.2, 0), 0.04, bands=4)
    W.add(cyl((0, -0.18, 0), (0, -0.93, 0), 0.036, sides=8, cap=0.0), shaft)
    for y in (-0.45, -0.7):
        W.add(cyl((0, y, 0), (0, y - 0.03, 0), 0.045, sides=8, cap=0.006), gold)
    W.add(star(0.075, 0.034, 0.04), gold, facing((0, 0.26, 0), (1, 0, 0), up=(0, 1, 0)))
    ay = -0.96
    W.add(cyl((0, -0.9, 0), (0, ay - 0.02, 0), 0.05, sides=10, cap=0.01), gold)
    R, wmax = 0.33, 0.105
    cy = ay + R - wmax * 0.75
    n = 16
    path, secs = [], []
    for i in range(n + 1):
        u = i / n
        phi = RAD(112 + 136 * u)
        path.append((0.0, cy + R * math.cos(phi), R * math.sin(phi)))
        w = wmax * math.sin(math.pi * u) ** 0.85
        secs.append([(0.0, 0.0)] if w < 1e-4 else sec_blade(w, 0.045 * math.sin(math.pi * u) ** 0.5 + 0.004))
    g = sweep(path, secs, (1, 0, 0), lambda b, s: 'e' if s in EDGE else 'm', 0.0, 0.0).outward()
    W.add(g, {'m': moon, 'e': edge})
    for side in (-1, 1):
        for u, off, r in ((0.5, 0.2, 0.026), (0.36, -0.25, 0.018), (0.66, -0.3, 0.02)):
            phi = RAD(112 + 136 * u)
            w = wmax * math.sin(math.pi * u) ** 0.85
            tt = 0.045 * math.sin(math.pi * u) ** 0.5 + 0.004
            radial = Vector((0, math.cos(phi), math.sin(phi)))
            p = Vector((0.0, cy, 0.0)) + radial * (R + off * w)
            c = blade_surface_c(w, tt, off * w)
            W.add(disc(ellipse_outline(r, r, 8), dome=0.003), crater,
                  facing(p + Vector((side * (c + 0.003), 0, 0)), (side, 0, 0)))
    W.add(sphere(0.045, 10, 7).moved((0, ay - 0.035, 0)), gem)
    return W


def build_trident():
    W = Weapon('trident')
    teal = W.m('shaft', '#18B8C9', 0.4)
    gold = W.m('gold', '#F5B21E', 0.3, metal=0.3)
    coral = W.m('coral', '#FF6F61', 0.5)
    pearl = W.m('pearl', '#FFF2F4', 0.15)
    grip_sweep(W, teal, gold, (0, 0.2, 0), (0, -0.2, 0), 0.042, bands=4)
    W.add(cyl((0, -0.18, 0), (0, -0.8, 0), 0.036, sides=8, cap=0.0), teal)
    W.add(cone((0, 0.19, 0), (0, 0.31, 0), 0.045, 6), gold)
    for y in (-0.42,):
        W.add(cyl((0, y, 0), (0, y - 0.03, 0), 0.044, sides=8, cap=0.006), gold)
    pts = [Vector((0.0, -0.8 - 0.1 * (z / 0.19) ** 2, z)) for z in (-0.19, -0.13, -0.065, 0.0, 0.065, 0.13, 0.19)]
    W.add(tube(pts, [0.03, 0.034, 0.038, 0.042, 0.038, 0.034, 0.03], sides=8, cap=0.012), gold)
    W.add(cyl((0, -0.74, 0), (0, -0.8, 0), 0.05, sides=10, cap=0.0), gold)

    def prong(base, tip, r):
        base, tip = Vector(base), Vector(tip)
        d = tip - base
        path = [base, base + d * 0.55, base + d * 0.7, base + d * 0.78, tip]
        secs = [sec_blade(r, r, 0.7), sec_blade(r * 0.9, r * 0.9, 0.7), sec_blade(r * 2.2, r * 0.9),
                sec_blade(r * 1.2, r * 0.8), [(0, 0)]]
        return sweep(path, secs, (1, 0, 0), None, 0.0, 0.0).outward()
    W.add(prong((0, -0.8, 0), (0, -1.22, 0), 0.03), gold)
    for side in (-1, 1):
        W.add(prong((0, -0.9, side * 0.19), (0, -1.12, side * 0.2), 0.026), gold)
    W.add(sphere(0.052, 10, 6).moved((0, -0.86, 0)), pearl)
    # Coral branches hugging the shaft below the head.
    for side in (-1, 1):
        base = Vector((0.0, -0.7, side * 0.03))
        W.add(tube([base, base + Vector((0.0, -0.05, side * 0.07)), base + Vector((0.0, -0.1, side * 0.1))],
                   [0.022, 0.018, 0.012], sides=6, cap=0.01), coral)
        mid = base + Vector((0.0, -0.05, side * 0.07))
        W.add(tube([mid, mid + Vector((0.02 * side, 0.03, side * 0.06))], [0.014, 0.01], sides=5, cap=0.008), coral)
    W.add(torus(0.042, 0.016, 10, 4).transformed(facing((0, -0.68, 0), (0, 1, 0))), coral)
    return W


def build_staff_fire():
    W = Weapon('staff_fire')
    wood = W.m('wood', '#A8653A', 0.55)
    wrap = W.m('wrap', '#D8243B', 0.5)
    gold = W.m('gold', '#F5B21E', 0.3, metal=0.3)
    gem = W.m('gem', '#FF4A1A', 0.2, emit='#FF3A0A', strength=2.2)
    flame = W.m('flame', '#FF8A1A', 0.4, emit='#FF6A00', strength=2.6)
    core = W.m('flame core', '#FFE14A', 0.4, emit='#FFD21A', strength=3.0)
    grip_sweep(W, wrap, wood, (0, 0, -0.15), (0, 0, 0.15), 0.044, bands=6)
    W.handle = (Vector((0, 0, -0.15)), Vector((0, 0, 0.15)))
    W.add(cyl((0, 0, -0.26), (0, 0, -0.13), 0.041, 0.043, sides=8, cap=0.0), wood)
    W.add(cone((0, 0, -0.25), (0, 0, -0.33), 0.042, 8), gold)
    W.add(cyl((0, 0, 0.13), (0, 0, 0.84), 0.042, 0.038, sides=8, cap=0.0), wood)
    for z in (0.4, 0.83):
        W.add(cyl((0, 0, z), (0, 0, z + 0.035), 0.05, sides=8, cap=0.006), gold)
    top = 0.88
    W.add(lathe([(0.05, top - 0.02), (0.075, top + 0.02), (0.06, top + 0.05), (0.0, top + 0.05)], 10,
                cap_bottom=0.0).outward(), gold)
    for k in range(3):
        a = TAU * k / 3 + RAD(90)
        pts = [Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, top + 0.03)),
               Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, top + 0.1)),
               Vector((math.cos(a) * 0.085, math.sin(a) * 0.085, top + 0.2)),
               Vector((math.cos(a) * 0.045, math.sin(a) * 0.045, top + 0.235))]
        W.add(tube(pts, [0.02, 0.018, 0.014, 0.0], sides=5, cap=0.0, binormal=(0, 0, 1)), gold)
    gz = top + 0.14
    W.add(lathe([(0, -0.11), (0.085, -0.02), (0.07, 0.04), (0, 0.1)], 8, flat=True).outward(), gem,
          Matrix.Translation((0, 0, gz)))
    fz = gz + 0.05

    def wob(th, i):
        return 1 + 0.16 * math.cos(3 * th + i * 0.9) * min(1.0, i / 3)
    prof = [(0.07, 0.0), (0.125, 0.06), (0.13, 0.14), (0.105, 0.23), (0.062, 0.32), (0.025, 0.39), (0.0, 0.44)]
    W.add(lathe(prof, 10, mod=wob, cap_bottom=0.0, tag=lambda b, s: 'c' if b <= 1 else 'f').outward(),
          {'c': core, 'f': flame}, Matrix.Translation((0, 0, fz)))
    for k, (a, h) in enumerate(((0.3, 0.18), (2.4, 0.14), (4.4, 0.16))):
        p = Vector((math.cos(a) * 0.095, math.sin(a) * 0.095, fz + 0.12))
        W.add(lathe([(0.042, 0.0), (0.036, h * 0.62), (0.0, h * 1.25)], 6, cap_bottom=0.0).outward(), flame,
              facing(p, Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.0))))
    W.empties['muzzle'] = Vector((0, 0, gz))
    return W


def build_bow_star():
    W = Weapon('bow_star')
    limb = W.m('limb', '#7C4DFF', 0.4)
    grip = W.m('grip', '#FFC83A', 0.4)
    tipm = W.m('tip', '#F5B21E', 0.3, metal=0.25)
    string = W.m("string", "#FFF6C0", 0.4, emit="#FFE88A", strength=0.6)
    starm = W.m('star', '#FFE14A', 0.3, emit='#FFD21A', strength=1.2)
    H, depth = 0.5, 0.15
    n = 14
    path, secs, tags = [], [], []
    for i in range(n + 1):
        z = -H + 2 * H * i / n
        k = abs(z) / H
        path.append((0.0, depth * k ** 1.7, z))
        g = max(0.0, 1 - abs(z) / 0.16)
        a = 0.03 + 0.024 * g - 0.01 * k
        c = 0.036 + 0.018 * g - 0.012 * k
        secs.append(sec_super(a, c, 10, 2.6))
    tagf = (lambda b, s: 'g' if abs(-H + 2 * H * (b + 0.5) / n) < 0.15 else ('t' if abs(-H + 2 * H * (b + 0.5) / n)
                                                                               > H - 0.08 else 'l'))
    W.add(sweep(path, secs, (1, 0, 0), tagf, 0.02, 0.02).outward(), {'g': grip, 't': tipm, 'l': limb})
    W.grip_mats.add(grip)
    W.handle = (Vector((0, 0, -0.13)), Vector((0, 0, 0.13)))
    ty = depth - 0.012
    W.add(cyl((0, ty, -H + 0.02), (0, ty, H - 0.02), 0.011, sides=5, cap=0.0), string)
    for side in (-1, 1):
        W.add(star(0.08, 0.036, 0.034), starm, facing((0, depth + 0.01, side * (H + 0.05)), (1, 0, 0),
                                                     up=(0, -0.3, side)))
    W.add(star(0.07, 0.032, 0.11), starm, facing((0, -0.035, 0.24), (1, 0, 0), up=(0, 0, 1)))
    W.add(sphere(0.022, 8, 5).moved((0, -0.045, 0.14)), tipm)
    W.empties['muzzle'] = Vector((0, -0.08, 0.15))
    return W


# ------------------------------------------------------------------ rods
def build_rod_common(W, handle, butt, shaft, band, reel_side, reel_line, knob, tip_mat, tip_r=0.02, gem=None):
    grip_sweep(W, handle, handle, (0, 0.26, 0), (0, -0.12, 0), 0.046, bands=3)
    W.add(sphere(0.052, 10, 6).moved((0, 0.285, 0)), butt)
    W.add(cyl((0, -0.1, 0), (0, -0.2, 0), 0.036, sides=8, cap=0.0), band)
    L = 1.5
    n = 5
    path = [(0.0, -0.18 - (L - 0.18) * i / n, 0.0) for i in range(n + 1)]
    radii = [0.03 - 0.018 * (i / n) for i in range(n + 1)]
    W.add(sweep(path, [sec_circle(r, 6, math.pi / 6) for r in radii], (1, 0, 0), None, 0.0, 0.0).outward(), shaft)
    for y in (-0.62, -0.98, -1.3):
        k = (-0.18 - y) / (L - 0.18)
        r = 0.03 - 0.018 * k
        W.add(cyl((0, y, 0), (0, y - 0.02, 0), r + 0.006, sides=6, cap=0.0), band)
        W.add(torus(0.018, 0.005, 8, 3).transformed(facing((0, y - 0.01, -r - 0.02), (0, -1, 0))), band)
    W.add(sphere(tip_r, 8, 5).moved((0, -L, 0)), tip_mat)
    # Reel under the shaft, just in front of the fist, crank on the outer (+X) side.
    ry, rz = -0.24, -0.11
    W.add(cyl((0, ry, -0.03), (0, ry, rz + 0.05), 0.016, sides=6, cap=0.0), band)
    for sx in (-1, 1):
        W.add(cyl((sx * 0.026, ry, rz), (sx * 0.042, ry, rz), 0.07, sides=14, cap=0.004), reel_side)
    W.add(cyl((-0.028, ry, rz), (0.028, ry, rz), 0.056, sides=14, cap=0.0), reel_line)
    W.add(cyl((0.035, ry, rz), (0.065, ry, rz), 0.012, sides=6, cap=0.0), band)
    W.add(cyl((0.06, ry, rz), (0.06, ry - 0.05, rz - 0.04), 0.01, sides=5, cap=0.0), band)
    W.add(sphere(0.022, 8, 5).moved((0.07, ry - 0.05, rz - 0.04)), knob)
    if gem is not None:
        W.add(lathe([(0, -0.03), (0.042, 0.0), (0.03, 0.02), (0, 0.03)], 6, flat=True).outward(), gem,
              facing((0.045, ry, rz), (1, 0, 0)))
    W.empties['rod-tip'] = Vector((0, -L - tip_r, 0))


def build_rod():
    W = Weapon('rod')
    build_rod_common(W, W.m('cork', '#E9B676', 0.7), W.m('butt', '#6B3A22', 0.5), W.m('shaft', '#C77A3A', 0.45),
                     W.m('band', '#5B6477', 0.4), W.m('reel', '#DCE4EE', 0.3, metal=0.2),
                     W.m('reel line', '#35B6F2', 0.5), W.m('knob', '#EF3B3B', 0.4), W.m('tip', '#EF3B3B', 0.4))
    return W


def build_rod_gold():
    W = Weapon('rod_gold')
    gold = W.m('gold', '#F5B21E', 0.28, metal=0.35)
    build_rod_common(W, W.m('grip', '#3A3FA8', 0.55), gold, gold, W.m('band', '#FFE08A', 0.3, metal=0.3),
                     gold, W.m('reel line', '#FF5C9A', 0.45), W.m('knob', '#FFFDF6', 0.3),
                     W.m('tip', '#6FF3FF', 0.2, emit='#3FE0FF', strength=1.0), tip_r=0.026,
                     gem=W.m('gem', '#FF4F9A', 0.15, emit='#FF2F7A', strength=0.9))
    return W


def build_rod_steady():
    # The steady rod: a sturdy cobalt rod with silver guides, a big reel wound with bright yellow line and a green
    # glowing tip; its line never snaps in the game.
    W = Weapon('rod_steady')
    build_rod_common(W, W.m('grip', '#1F2A44', 0.6), W.m('butt', '#E8453C', 0.45), W.m('shaft', '#2F6BE0', 0.35),
                     W.m('band', '#DCE4EE', 0.3, metal=0.4), W.m('reel', '#C9D3E0', 0.25, metal=0.45),
                     W.m('reel line', '#FFD23A', 0.4), W.m('knob', '#FF8A2A', 0.4),
                     W.m('tip', '#9BFF6B', 0.2, emit='#5CFF3A', strength=1.0), tip_r=0.026,
                     gem=W.m('gem', '#2EE6A8', 0.15, emit='#18D18F', strength=0.8))
    return W


WEAPON_BUILDERS = dict(
    sword_wood=build_sword_wood, sword_tusk=build_sword_tusk, sword_crystal=build_sword_crystal,
    gun_pea=build_gun_pea, gun_bubble=build_gun_bubble, gun_spike=build_gun_spike, sword_candy=build_sword_candy,
    gun_ice=build_gun_ice, sword_lava=build_sword_lava, sword_obsidian=build_sword_obsidian,
    hammer_thunder=build_hammer_thunder, scythe_moon=build_scythe_moon, bow_star=build_bow_star,
    staff_fire=build_staff_fire, blaster_rainbow=build_blaster_rainbow, toy_hammer=build_toy_hammer,
    trident=build_trident, rod=build_rod, rod_gold=build_rod_gold, rod_steady=build_rod_steady)


def pose_rotation(kind):
    if kind in RAISE:
        return Matrix.Rotation(RAD(-RAISE[kind]), 4, 'X')
    if kind in LEAN:
        out, fwd = LEAN[kind]
        return Matrix.Rotation(RAD(fwd), 4, 'X') @ Matrix.Rotation(RAD(out), 4, 'Y')
    return Matrix.Identity(4)


def pose_matrix(kind):
    return Matrix.Translation(HAND) @ pose_rotation(kind)


def new_empty(name, size=0.1, kind='PLAIN_AXES'):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    return e


def realise_weapon(W):
    pose = pose_matrix(W.kind)
    W.piece.transform(pose)
    node = new_empty(W.id, 0.2)
    obj = triangulate(W.piece.build(sharp=80))
    obj.parent = node
    empties = {}
    for name, p in W.empties.items():
        e = new_empty(name, 0.06, 'SPHERE')
        e.parent = node
        e.location = pose @ p
        empties[name] = e
    handle = [pose @ W.handle[0], pose @ W.handle[1]]
    return dict(weapon=W, node=node, meshes=[obj], empties=empties, handle=handle, pose=pose)


# ==================================================================== pets
class PetModel:
    def __init__(self, pid):
        self.id = pid
        self.flying = pid in FLYING
        self.body = Piece(pid + '_body')
        self.wings = {}      # 'l' / 'r' -> (Piece, root)
        self.note = ''

    def m(self, part, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
        return WM(f'Pet {self.id} {part}', color, rough, metal, emit, strength)

    def eyes(self):
        return self.m('eye', '#1C1B2E', 0.15), self.m('eye glint', '#FFFFFF', 0.3)

    def wing_pair(self, geo_r, root_r, material):
        """geo_r: the right (+X) wing in pet space; the left is its mirror."""
        pr = Piece(self.id + '_wing_r')
        pr.add(geo_r, material)
        pl = Piece(self.id + '_wing_l')
        pl.add(geo_r.mirrored(), material)
        rr = Vector(root_r)
        self.wings['r'] = (pr, rr)
        self.wings['l'] = (pl, Vector((-rr.x, rr.y, rr.z)))


def face(P, head_c, head_r, eye_dir, eye_r, mouth_dir=None, blush=None, mouth_w=0.035, squash=1.22,
         eye_mats=None):
    dark, white = eye_mats or P.eyes()
    for side in (-1, 1):
        d = Vector((side * eye_dir[0], eye_dir[1], eye_dir[2]))
        p, n = ell_point(head_c, head_r, d)
        add_eye(P.body, p, n, eye_r, dark, white, squash=squash)
    if blush is not None:
        bm, bdir, br = blush
        for side in (-1, 1):
            decal(P.body, head_c, head_r, (side * bdir[0], bdir[1], bdir[2]), br * 1.25, br * 0.8, bm, lift=0.004)
    if mouth_dir is not None:
        pts, n0 = surface_arc(head_c, head_r, mouth_dir, mouth_w, mouth_w * 0.45, lift=0.006)
        P.body.add(tube(pts, 0.008, sides=4, cap=0.004, binormal=n0), dark)


def build_pet_robot():
    P = PetModel('pet_robot')
    white = P.m('shell', '#F4FAFF', 0.3)
    blue = P.m('trim', '#35B6F2', 0.35)
    screen = P.m('screen', '#1B2244', 0.18)
    glow = P.m('screen glow', '#6FF3FF', 0.2, emit='#3FE6FF', strength=1.8)
    red = P.m('antenna light', '#FF4A4A', 0.3, emit='#FF2A2A', strength=1.6)
    grey = P.m('metal', '#8C95A5', 0.35, metal=0.2)
    glint = P.m('eye glint', '#FFFFFF', 0.3)
    for side in (-1, 1):
        P.body.add(sphere(1.0, 8, 5, scale=(0.075, 0.1, 0.05)).moved((side * 0.1, -0.02, 0.05)), blue)
    bc, br = Vector((0, 0, 0.21)), (0.2, 0.18, 0.16)
    P.body.add(sphere(1.0, 14, 8, scale=br).moved(bc), white)
    decal(P.body, bc, br, (0, -1, -0.1), 0.085, 0.07, blue, lift=0.004, dome=0.01)
    decal(P.body, bc, br, (0, -1, -0.1), 0.03, 0.03, glow, lift=0.012, dome=0.006, n=8)
    for side in (-1, 1):
        P.body.add(sphere(1.0, 8, 5, scale=(0.055, 0.06, 0.08)).transformed(
            xf((side * 0.215, -0.01, 0.2), (0, side * RAD(-20), 0))), blue)
    hc, hr = Vector((0, 0, 0.5)), (0.27, 0.235, 0.21)
    P.body.add(sphere(1.0, 14, 9, scale=hr).moved(hc), white)
    sc, sr = Vector((0, -0.105, 0.5)), (0.205, 0.15, 0.15)
    P.body.add(sphere(1.0, 14, 7, scale=sr).moved(sc), screen)
    for side in (-1, 1):
        p, n = ell_point(sc, sr, (side * 0.4, -1, 0.12))
        add_eye(P.body, p, n, 0.052, glow, glint, squash=1.3)
    pts, n0 = surface_arc(sc, sr, (0, -1, -0.32), 0.04, 0.02, lift=0.005)
    P.body.add(tube(pts, 0.009, sides=4, cap=0.004, binormal=n0), glow)
    for side in (-1, 1):
        P.body.add(cyl((side * 0.25, 0, 0.5), (side * 0.3, 0, 0.5), 0.075, sides=12, cap=0.01), blue)
        P.body.add(cyl((side * 0.29, 0, 0.5), (side * 0.315, 0, 0.5), 0.035, sides=10, cap=0.005), grey)
    P.body.add(cyl((0, 0.0, 0.69), (0, 0.02, 0.79), 0.012, sides=6, cap=0.0), grey)
    P.body.add(sphere(0.036, 8, 5).moved((0, 0.02, 0.81)), red)
    return P


def build_pet_parrot():
    P = PetModel('pet_parrot')
    red = P.m('feathers', '#EF3B3B', 0.45)
    face_m = P.m('face', '#FFFDF6', 0.5)
    beak = P.m('beak', '#FFD35C', 0.35)
    beak_dark = P.m('beak dark', '#3A3D4A', 0.4)
    green = P.m('crest', '#3FC24A', 0.45)
    blue = P.m('wing', '#2F7BE8', 0.45)
    tailm = P.m('tail', '#2F7BE8', 0.45)
    yellow = P.m('tail tip', '#FFC83A', 0.45)
    feet = P.m('feet', '#8C95A5', 0.5)
    z0 = 0.09
    bc, br = Vector((0, 0.04, 0.4 + z0)), (0.14, 0.14, 0.16)
    P.body.add(sphere(1.0, 12, 8, scale=br).moved(bc), red)
    hc, hr = Vector((0, -0.03, 0.6 + z0)), (0.17, 0.165, 0.16)
    P.body.add(sphere(1.0, 14, 9, scale=hr).moved(hc), red)
    for side in (-1, 1):
        decal(P.body, hc, hr, (side * 0.5, -0.84, 0.1), 0.075, 0.085, face_m, lift=0.003, n=10)
    face(P, hc, hr, (0.5, -0.84, 0.12), 0.047, squash=1.2)
    tip = Vector((0, -0.25, 0.51 + z0))
    pts = bez([(0, -0.12, 0.6 + z0), (0, -0.23, 0.6 + z0), tip], 5)
    P.body.add(tube(pts, [0.055, 0.047, 0.035, 0.018, 0.0], sides=8, cap=0.0), beak)
    P.body.add(sphere(1.0, 10, 6, scale=(0.04, 0.045, 0.03)).moved((0, -0.17, 0.535 + z0)), beak_dark)
    for k, (dx, dz, a) in enumerate(((0.0, 0.0, 0.0), (-0.045, -0.01, 0.35), (0.045, -0.01, -0.35))):
        g = slab(leaf_outline(0.13 - 0.02 * min(k, 1), 0.07, 4), 0.02, bev=0.006, dome=0.004)
        P.body.add(g, green, xf((dx, 0.0, 0.73 + dz + z0), (RAD(-60), a * 0.5, a)))
    for k, (dx, m, ln, a) in enumerate(((0.0, tailm, 0.3, 0.0), (-0.04, yellow, 0.24, 0.2),
                                        (0.04, red, 0.24, -0.2))):
        g = slab(leaf_outline(ln, 0.07, 4), 0.018, bev=0.005, dome=0.003)
        P.body.add(g, m, xf((dx, 0.14, 0.33 + z0), (RAD(-120), 0, a)))
    for side in (-1, 1):
        P.body.add(sphere(1.0, 8, 4, scale=(0.035, 0.04, 0.02)).moved((side * 0.05, -0.02, 0.245 + z0)), feet)
    wing = [(0.0, -0.05), (0.08, -0.07), (0.18, -0.04), (0.27, 0.02), (0.25, 0.06), (0.2, 0.05), (0.18, 0.1),
            (0.12, 0.08), (0.09, 0.13), (0.03, 0.08), (0.0, 0.07)]
    g = slab(wing, 0.03, bev=0.008, cap='ngon')
    root = Vector((0.11, 0.04, 0.45 + z0))
    P.wing_pair(g.transformed(xf(root, (RAD(-8), RAD(-48), RAD(-12)))), root, blue)
    return P


def build_pet_turtle():
    P = PetModel('pet_turtle')
    shell = P.m('shell', '#3AAE4A', 0.4)
    plate = P.m('shell plate', '#9BDE5E', 0.4)
    rim = P.m('shell rim', '#2A8A3A', 0.45)
    belly = P.m('belly', '#FFE3A0', 0.5)
    skin_m = P.m('skin', '#8FE07A', 0.45)
    blush = P.m('blush', '#FF8FB0', 0.5)
    base = 0.16
    sc, sr = Vector((0, 0.03, base)), (0.3, 0.34, 0.31)
    prof = [(1.0, 0.0)] + [(math.cos(RAD(a)), math.sin(RAD(a))) for a in (18, 36, 54, 72)] + [(0.0, 1.0)]
    g = lathe(prof, 16, cap_bottom=0.0).transformed(scl(*sr)).moved(sc).outward()
    P.body.add(g, shell)
    P.body.add(decal_plate(sc, sr, (0, 0, 1), 0.11), plate)
    for k in range(6):
        a = TAU * k / 6 + TAU / 12
        P.body.add(decal_plate(sc, sr, (math.cos(a), math.sin(a), 0.85), 0.085), plate)
    ring = [Vector((math.cos(TAU * i / 16) * sr[0], sc.y + math.sin(TAU * i / 16) * sr[1], base + 0.005))
            for i in range(16)]
    P.body.add(tube(ring + [ring[0]], 0.04, sides=5, cap=0.0, binormal=(0, 0, 1)), rim)
    P.body.add(sphere(1.0, 12, 4, scale=(0.27, 0.31, 0.06)).moved((0, 0.03, base - 0.01)), belly)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.body.add(sphere(1.0, 8, 5, scale=(0.075, 0.085, 0.09)).moved((sx * 0.2, 0.03 + sy * 0.2, 0.09)),
                       skin_m)
    P.body.add(cone((0, 0.34, base + 0.02), (0, 0.44, base - 0.01), 0.045, 6), skin_m)
    P.body.add(cyl((0, -0.18, base + 0.08), (0, -0.3, base + 0.16), 0.085, sides=10, cap=0.0), skin_m)
    hc, hr = Vector((0, -0.36, 0.37)), (0.175, 0.16, 0.16)
    P.body.add(sphere(1.0, 14, 9, scale=hr).moved(hc), skin_m)
    face(P, hc, hr, (0.42, -0.86, 0.22), 0.05, mouth_dir=(0, -1, -0.18), blush=(blush, (0.62, -0.72, -0.08), 0.03))
    return P


def decal_plate(c, radii, direction, r):
    """A hexagonal shell plate conformed to an ellipsoid (returns Geo)."""
    tmp = Piece('tmp')
    decal(tmp, c, radii, direction, r, r, None, lift=0.004, n=6, dome=0.012)
    return Geo(tmp.verts, tmp.faces)


def build_pet_sheep():
    P = PetModel('pet_sheep')
    wool = P.m('wool', '#FFFDF6', 0.7)
    face_m = P.m('face', '#FFD8B8', 0.5)
    ear = P.m('ear', '#FFB09A', 0.5)
    leg = P.m('legs', '#5A4034', 0.55)
    blush = P.m('blush', '#FF8FB0', 0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.body.add(cyl((sx * 0.11, 0.05 + sy * 0.1, 0.03), (sx * 0.11, 0.05 + sy * 0.1, 0.17), 0.058, 0.052,
                           sides=8, cap=0.03), leg)
    c = Vector((0, 0.05, 0.31))
    puffs = [((0, 0, 0.1), 0.17), ((0.15, 0.08, 0.02), 0.15), ((-0.15, 0.08, 0.02), 0.15),
             ((0.14, -0.1, 0.02), 0.14), ((-0.14, -0.1, 0.02), 0.14), ((0, 0.18, 0.0), 0.15),
             ((0, -0.06, -0.06), 0.16), ((0, 0.12, -0.08), 0.15)]
    for off, r in puffs:
        P.body.add(sphere(r, 8, 5).moved(c + Vector(off)), wool)
    P.body.add(sphere(0.07, 6, 4).moved((0, 0.29, 0.33)), wool)
    hc, hr = Vector((0, -0.22, 0.4)), (0.145, 0.14, 0.15)
    P.body.add(sphere(1.0, 12, 8, scale=hr).moved(hc), face_m)
    for off, r in (((0, -0.02, 0.14), 0.075), ((0.07, 0.0, 0.11), 0.06), ((-0.07, 0.0, 0.11), 0.06)):
        P.body.add(sphere(r, 8, 4).moved(hc + Vector(off)), wool)
    for side in (-1, 1):
        P.body.add(sphere(1.0, 8, 5, scale=(0.09, 0.04, 0.045)).transformed(
            xf((side * 0.16, -0.2, 0.42), (0, side * RAD(30), side * RAD(-15)))), ear)
    face(P, hc, hr, (0.4, -0.88, 0.1), 0.044, mouth_dir=(0, -1, -0.45), mouth_w=0.03,
         blush=(blush, (0.62, -0.72, -0.2), 0.026))
    return P


def build_pet_firefly():
    P = PetModel('pet_firefly')
    headm = P.m('head', '#FF9A4A', 0.4)
    body = P.m('body', '#34384A', 0.45)
    glow = P.m('glow', '#E6FF5A', 0.3, emit='#CCFF33', strength=2.6)
    stripe = P.m('stripe', '#2A2D3A', 0.45)
    wing = P.m('wing', '#CDEEFF', 0.2, emit='#A8E4FF', strength=0.25)
    tipm = P.m('antenna tip', '#FFE14A', 0.3, emit='#FFD21A', strength=1.5)
    blush = P.m('blush', '#FF6F8F', 0.5)
    z0 = -0.07
    P.body.add(sphere(1.0, 12, 8, scale=(0.1, 0.1, 0.1)).moved((0, 0.05, 0.5 + z0)), body)
    ac = Vector((0, 0.19, 0.41 + z0))
    prof = [(0.0, -0.17)] + [(0.13 * math.sin(math.pi * k / 7) * (1.0 if k > 1 else 0.9),
                              -0.17 * math.cos(math.pi * k / 7)) for k in range(1, 7)] + [(0.0, 0.17)]
    g = lathe(prof, 14, tag=lambda b, s: 's' if b in (4, 5) else 'g').outward()
    P.body.add(g, {'g': glow, 's': stripe}, xf(ac, (RAD(90 + 25), 0, 0)))
    hc, hr = Vector((0, -0.1, 0.6 + z0)), (0.165, 0.155, 0.155)
    P.body.add(sphere(1.0, 16, 10, scale=hr).moved(hc), headm)
    face(P, hc, hr, (0.42, -0.86, 0.12), 0.05, mouth_dir=(0, -1, -0.3), blush=(blush, (0.6, -0.74, -0.12), 0.026))
    for side in (-1, 1):
        pts = bez([(side * 0.05, -0.14, 0.74 + z0), (side * 0.08, -0.2, 0.85 + z0), (side * 0.14, -0.22, 0.9 + z0)], 4)
        P.body.add(tube(pts, [0.012, 0.011, 0.01, 0.009], sides=5, cap=0.0), body)
        P.body.add(sphere(0.028, 8, 6).moved(pts[-1]), tipm)
        for k, y in enumerate((0.0, 0.08)):
            a = Vector((side * 0.06, y, 0.46 + z0))
            P.body.add(tube([a, a + Vector((side * 0.05, -0.02, -0.08))], [0.014, 0.01], sides=5, cap=0.008), body)
    g = slab(ellipse_outline(0.14, 0.065, 12), 0.018, bev=0.005, cap='ngon')
    root = Vector((0.06, 0.06, 0.58 + z0))
    P.wing_pair(g.transformed(xf(root + Vector((0.11, 0.04, 0.08)), (RAD(5), RAD(-40), RAD(18)))), root, wing)
    return P


def build_pet_dragon():
    P = PetModel('pet_dragon')
    red = P.m('scales', '#FF5A26', 0.4)
    belly = P.m('belly', '#FFDE9A', 0.45)
    horn = P.m('horn', '#FFF1D2', 0.35)
    spike = P.m('spikes', '#FFC83A', 0.4)
    wing = P.m('wing', '#FFB02E', 0.45)
    blush = P.m('blush', '#FF8FB0', 0.5)
    nostril = P.m('nostril', '#8A2A1A', 0.5)
    z0 = -0.02
    bc, br = Vector((0, 0.05, 0.4 + z0)), (0.14, 0.15, 0.17)
    P.body.add(sphere(1.0, 10, 7, scale=br).moved(bc), red)
    decal(P.body, bc, br, (0, -1, -0.05), 0.09, 0.12, belly, lift=0.003, dome=0.01, n=12)
    hc, hr = Vector((0, -0.05, 0.63 + z0)), (0.2, 0.18, 0.17)
    P.body.add(sphere(1.0, 14, 9, scale=hr).moved(hc), red)
    sn, snr = Vector((0, -0.2, 0.575 + z0)), (0.11, 0.075, 0.075)
    P.body.add(sphere(1.0, 10, 6, scale=snr).moved(sn), red)
    for side in (-1, 1):
        decal(P.body, sn, snr, (side * 0.35, -1, 0.35), 0.012, 0.009, nostril, lift=0.003, n=6)
    face(P, hc, hr, (0.44, -0.84, 0.2), 0.05, blush=(blush, (0.66, -0.66, -0.15), 0.028))
    pts, n0 = surface_arc(sn, snr, (0, -1, -0.5), 0.04, 0.012, lift=0.004)
    P.body.add(tube(pts, 0.007, sides=4, cap=0.003, binormal=n0), nostril)
    for side in (-1, 1):
        pts = bez([(side * 0.08, -0.02, 0.76 + z0), (side * 0.1, 0.04, 0.86 + z0), (side * 0.12, 0.12, 0.88 + z0)], 4)
        P.body.add(tube(pts, [0.035, 0.026, 0.014, 0.0], sides=6, cap=0.0), horn)
        P.body.add(sphere(1.0, 8, 5, scale=(0.03, 0.05, 0.07)).transformed(
            xf((side * 0.19, 0.0, 0.66 + z0), (0, side * RAD(-30), 0))), spike)
    for k, (y, z) in enumerate(((0.04, 0.8), (0.13, 0.55), (0.17, 0.46))):
        P.body.add(cone((0, y, z + z0 - 0.02), (0, y + 0.06, z + z0 + 0.06), 0.035, 5), spike)
    tail = bez([(0, 0.15, 0.3 + z0), (0, 0.3, 0.24 + z0), (0, 0.4, 0.34 + z0)], 5)
    P.body.add(tube(tail, [0.065, 0.05, 0.036, 0.024, 0.015], sides=8, cap=0.01), red)
    P.body.add(slab([(0, 0.0), (0.06, 0.04), (0.04, 0.1), (0.0, 0.07), (-0.04, 0.1), (-0.06, 0.04)], 0.025,
                    bev=0.006, centre=(0, 0.05)), spike, xf(tail[-1] + Vector((0, 0.0, -0.005)), (RAD(70), 0, 0)))
    for side in (-1, 1):
        P.body.add(sphere(1.0, 6, 4, scale=(0.045, 0.05, 0.065)).transformed(
            xf((side * 0.12, -0.08, 0.4 + z0), (RAD(30), 0, 0))), red)
        P.body.add(sphere(1.0, 6, 4, scale=(0.055, 0.07, 0.05)).moved((side * 0.09, -0.02, 0.25 + z0)), red)
    wing_o = [(0.0, -0.03), (0.1, -0.06), (0.22, -0.02), (0.3, 0.06), (0.24, 0.07), (0.22, 0.12), (0.16, 0.1),
              (0.12, 0.15), (0.07, 0.11), (0.0, 0.08)]
    g = slab(wing_o, 0.026, bev=0.007, cap='ngon')
    root = Vector((0.1, 0.1, 0.52 + z0))
    P.wing_pair(g.transformed(xf(root, (RAD(-10), RAD(-35), RAD(-15)))), root, wing)
    return P


def build_bunny():
    P = PetModel('bunny')
    mochi = P.m('mochi', '#FFFBF4', 0.45)
    inner = P.m('ear inner', '#FFB0C8', 0.5)
    blush = P.m('blush', '#FF9CB8', 0.5)
    nose = P.m('nose', '#FF6F9F', 0.4)
    petal = P.m('flower', '#FF8FC0', 0.4)
    centre = P.m('flower centre', '#FFD35C', 0.4)
    bc, br = Vector((0, 0, 0.21)), (0.29, 0.27, 0.22)
    prof = [(0.0, -0.21), (0.19, -0.205), (0.26, -0.17), (0.29, -0.09), (0.285, 0.0), (0.26, 0.08), (0.2, 0.15),
            (0.11, 0.195), (0.0, 0.21)]
    P.body.add(lathe(prof, 16).outward().moved(bc), mochi)
    for side in (-1, 1):
        base = Vector((side * 0.1, 0.02, 0.35))
        pts = bez([base, base + Vector((side * 0.04, 0.03, 0.2)), base + Vector((side * 0.1, 0.1, 0.36))], 5)
        radii = [0.055, 0.07, 0.068, 0.05, 0.0]
        secs = [[(0, 0)] if r < 1e-4 else sec_circle(r, 10, 0.0, 0.5) for r in radii]
        P.body.add(sweep(pts, secs, (0, 1, 0), None, 0.0, 0.0).outward(), mochi)
        ip = [p + Vector((0, -0.02, 0)) for p in pts[1:4]]
        P.body.add(sweep(ip, [sec_circle(0.04, 8, 0.0, 0.4), sec_circle(0.045, 8, 0.0, 0.4),
                              sec_circle(0.025, 8, 0.0, 0.4)], (0, 1, 0), None, 0.0, 0.0).outward(), inner)
        P.body.add(sphere(1.0, 8, 5, scale=(0.06, 0.07, 0.04)).moved((side * 0.11, -0.2, 0.04)), mochi)
    P.body.add(sphere(0.06, 8, 5).moved((0, 0.27, 0.1)), mochi)
    ell = (0.29, 0.27, 0.215)
    face(P, bc, ell, (0.42, -0.9, 0.3), 0.05, blush=(blush, (0.66, -0.72, 0.08), 0.03))
    p, n = ell_point(bc, ell, (0, -1, 0.17))
    P.body.add(sphere(1.0, 8, 5, scale=(0.022, 0.015, 0.016)).moved(p + n * 0.004), nose)
    for side in (-1, 1):
        pts, n0 = surface_arc(bc, ell, (side * 0.07, -1, 0.1), 0.022, 0.012, lift=0.004)
        P.body.add(tube(pts, 0.006, sides=4, cap=0.003, binormal=n0), P.eyes()[0])
    fc = Vector((-0.17, -0.02, 0.4))
    for k in range(5):
        a = TAU * k / 5
        P.body.add(sphere(1.0, 6, 4, scale=(0.036, 0.022, 0.012)).transformed(
            xf(fc + Vector((math.cos(a) * 0.03, -0.02, math.sin(a) * 0.03)), (RAD(90), 0, 0)) @
            xf((0, 0, 0), (0, 0, a))), petal)
    P.body.add(sphere(0.018, 6, 4).moved(fc + Vector((0, -0.03, 0))), centre)
    return P


PET_BUILDERS = dict(pet_robot=build_pet_robot, pet_parrot=build_pet_parrot, pet_turtle=build_pet_turtle,
                    pet_sheep=build_pet_sheep, pet_firefly=build_pet_firefly, pet_dragon=build_pet_dragon,
                    bunny=build_bunny)


def realise_pet(P):
    node = new_empty(P.id, 0.2)
    body = triangulate(P.body.build(sharp=80))
    body.parent = node
    wings = {}
    for side, (piece, root) in sorted(P.wings.items()):
        root = Vector(tuple(round(c, 4) for c in root))
        w = triangulate(piece.build(offset=root, sharp=80))
        w.parent = node
        w.location = root
        wings[side] = w
    return dict(pet=P, node=node, body=body, wings=wings, meshes=[body] + [wings[s] for s in sorted(wings)])


# ================================================================ checks
def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def world_points(objs):
    bpy.context.view_layer.update()
    return [o.matrix_world @ v.co for o in objs for v in o.data.vertices]


def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return dict(min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi],
                size=[round(hi[i] - lo[i], 4) for i in range(3)])


def gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def gltf_bounds(b):
    lo, hi = b['min'], b['max']
    return dict(min=[lo[0], lo[2], round(-hi[1], 4)], max=[hi[0], hi[2], round(-lo[1], 4)])


def seg_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def weapon_stats(e):
    W, obj = e['weapon'], e['meshes'][0]
    pts = world_points([obj])
    b = bounds(pts)
    grip_idx = {i for i, m in enumerate(obj.data.materials) if m in W.grip_mats}
    grip_pts = [obj.matrix_world @ obj.data.vertices[vi].co for poly in obj.data.polygons
                if poly.material_index in grip_idx for vi in poly.vertices]
    s = dict(kind=W.kind, name=next(w[2] for w in WEAPONS if w[0] == W.id),
             special=next(w[3] for w in WEAPONS if w[0] == W.id),
             mesh=obj.name, triangles=mesh_tris(obj), materials=[m.name for m in obj.data.materials],
             bounds=b, bounds_gltf=gltf_bounds(b),
             handle=dict(axis_distance=round(seg_distance(HAND, *e['handle']), 4),
                         surface_distance=round(min((p - HAND).length for p in grip_pts), 4) if grip_pts else None,
                         axis=[[round(c, 4) for c in e['handle'][0]], [round(c, 4) for c in e['handle'][1]]]),
             head_clearance=round(min(head_clearance(p) for p in pts), 4))
    for name, emp in e['empties'].items():
        p = emp.matrix_world.translation
        s[name] = dict(blender=[round(c, 4) for c in p], gltf=gltf(p))
    if W.kind == 'rod':
        tip = e['empties']['rod-tip'].matrix_world.translation
        s['length'] = round(max((tip - p).length for p in pts), 4)
    s['emissive'] = sorted(m.name for m in obj.data.materials if material_info(m)['emissive'])
    if W.note:
        s['note'] = W.note
    return s


def check_weapon(wid, s, e):
    errors = []
    if s['triangles'] > WEAPON_TRIS:
        errors.append(f"{s['triangles']} triangles > {WEAPON_TRIS}")
    if s['kind'] in NEEDS_MUZZLE and 'muzzle' not in s:
        errors.append('no muzzle empty')
    if s['kind'] == 'rod' and 'rod-tip' not in s:
        errors.append('no rod-tip empty')
    if s['kind'] == 'rod' and not 1.6 <= s['length'] <= 2.0:
        errors.append(f"rod length {s['length']} outside 1.6..2.0")
    h = s['handle']
    if h['axis_distance'] > GRIP_TOLERANCE:
        errors.append(f"handle axis {h['axis_distance']} from the hand point (> {GRIP_TOLERANCE})")
    if h['surface_distance'] is None or h['surface_distance'] > GRIP_TOLERANCE:
        errors.append(f"handle surface {h['surface_distance']} from the hand point (> {GRIP_TOLERANCE})")
    if s["head_clearance"] < 0:
        errors.append(f"reaches into the head envelope by {-s['head_clearance']}")
    if s['bounds']['min'][2] < 0.02:
        errors.append(f"reaches the ground (z {s['bounds']['min'][2]})")
    obj, node = e['meshes'][0], e['node']
    if node.name != wid or node.matrix_world != Matrix.Identity(4):
        errors.append('item node name/transform')
    if not obj.name.endswith('@hand-right') or obj.data.name != obj.name:
        errors.append(f'mesh name {obj.name}/{obj.data.name}')
    for m in s['materials']:
        if not m.startswith(f'Weapon {wid} '):
            errors.append(f'material name {m}')
    return errors


def pet_stats(e):
    P = e['pet']
    pts = world_points(e['meshes'])
    b = bounds(pts)
    s = dict(name=next(p[2] for p in PETS if p[0] == P.id), flying=P.flying,
             triangles=dict(body=mesh_tris(e['body']), **{f'wing_{k}': mesh_tris(w) for k, w in e['wings'].items()}),
             materials=sorted({m.name for o in e['meshes'] for m in o.data.materials}),
             bounds=b, bounds_gltf=gltf_bounds(b), height=b['size'][2],
             centre_z=round((b['min'][2] + b['max'][2]) / 2, 4))
    s['triangles']['total'] = sum(v for k, v in s['triangles'].items())
    if e['wings']:
        s['wings'] = {}
        for k, w in sorted(e['wings'].items()):
            s['wings'][w.name] = dict(root=[round(c, 4) for c in w.location], root_gltf=gltf(w.location),
                                      material=w.data.materials[0].name, triangles=mesh_tris(w))
    s['emissive'] = sorted(m for m in s['materials'] if material_info(bpy.data.materials[m])['emissive'])
    return s


def check_pet(pid, s, e):
    errors = []
    if s['triangles']['total'] > PET_TRIS:
        errors.append(f"{s['triangles']['total']} triangles > {PET_TRIS}")
    if not 0.5 <= s['height'] <= 0.9:
        errors.append(f"height {s['height']} outside 0.5..0.9")
    if s['flying']:
        if abs(s['centre_z'] - 0.5) > 0.06:
            errors.append(f"flying centre z {s['centre_z']} (want 0.5)")
        for side in ('l', 'r'):
            w = e['wings'].get(side)
            if w is None or w.name != f'{pid}_wing_{side}':
                errors.append(f'missing {pid}_wing_{side}')
            elif len(w.data.materials) != 1 or any(abs(r) > 1e-9 for r in w.rotation_euler):
                errors.append(f'{w.name}: one material and no rotation')
    else:
        if s['bounds']['min'][2] < -0.005 or s['bounds']['min'][2] > 0.02:
            errors.append(f"not standing on z 0 (min z {s['bounds']['min'][2]})")
        if e['wings']:
            errors.append('walking pet with wings')
    if e['node'].name != pid or e['node'].matrix_world != Matrix.Identity(4):
        errors.append('item node name/transform')
    for o in e['meshes']:
        if o.data.name != o.name:
            errors.append(f'mesh data name {o.data.name}')
    for m in s['materials']:
        if not m.startswith(f'Pet {pid} '):
            errors.append(f'material name {m}')
    return errors


# ================================================================== export
NAME_SUFFIX = re.compile(r'^(muzzle|rod-tip)\.\d{3}$')


def fix_glb_names(path):
    """Blender keeps object names unique ('muzzle.001'); every weapon's empty must be called exactly
    'muzzle' / 'rod-tip' so the game can find it by name. Rewrites node names in the GLB's JSON chunk."""
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, _ = struct.unpack_from('<III', data, 0)
    clen, ctype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + clen].decode('utf-8'))
    rest = data[20 + clen:]
    renamed = 0
    for node in doc.get('nodes', []):
        m = NAME_SUFFIX.match(node.get('name', ''))
        if m:
            node['name'] = m.group(1)
            renamed += 1
    chunk = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    chunk += b' ' * ((4 - len(chunk) % 4) % 4)
    out = struct.pack('<III', magic, version, 12 + 8 + len(chunk) + len(rest)) + struct.pack('<II', len(chunk), ctype)
    with open(path, 'wb') as fh:
        fh.write(out + chunk + rest)
    return renamed


def export(objects, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_materials='EXPORT', export_extras=False,
                              export_cameras=False, export_lights=False, export_animations=False,
                              export_texcoords=False, export_normals=True)
    fix_glb_names(path)
    return os.path.getsize(path)


def glb_node_names(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    clen = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + clen].decode('utf-8'))
    return doc


# ================================================================ previews
def _eevee(samples=48):
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.6),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def _clear_stage():
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('Preview ground'):
            bpy.data.objects.remove(o, do_unlink=True)


def _preview_studio(size, ground=None):
    _clear_stage()
    studio(ground_color=ground, size=size)
    ground_mat = bpy.data.materials.get('Preview ground')
    if ground and ground_mat:   # style.mat reuses the first colour; set this stage's own
        bsdf = next(n for n in ground_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = style.rgba(ground)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.55
    scene.view_settings.exposure = -0.4
    _eevee(48)


def _camera(name, elevation, target, ortho, distance=30.0, yaw=0.0):
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    data.clip_end = 200
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elevation), RAD(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.location = Vector(target) + d * distance
    bpy.context.scene.camera = cam
    return cam


def hud_label(cam, text, u, v, size, res, align='LEFT'):
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = align
    cu.align_y = 'TOP'
    cu.materials.append(mat('Preview label', '#10283C', 0.6))
    obj = bpy.data.objects.new('Label', cu)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    m = cam.matrix_world
    w = cam.data.ortho_scale
    h = w * res[1] / res[0]
    obj.location = m.translation + m.to_3x3() @ Vector((u * w, v * h, -3.0))
    obj.rotation_euler = m.to_euler()
    obj.visible_shadow = False
    return obj


def _remove(objs):
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)


def _composite(paths, layout, size, out_path):
    import numpy as np
    canvas = np.ones((size[1], size[0], 4), dtype=np.float32)
    for p, (x, y) in zip(paths, layout):
        im = bpy.data.images.load(p)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]
        canvas[y:y + im.size[1], x:x + im.size[0]] = px
        bpy.data.images.remove(im)
    out = bpy.data.images.new('Composite', size[0], size[1], alpha=False)
    out.pixels = canvas[::-1].ravel()
    out.filepath_raw = out_path
    out.file_format = 'WEBP'
    out.save()
    bpy.data.images.remove(out)
    for p in paths:
        os.remove(p)


class HeroStandIn:
    """The explorer for previews: hero.glb if it is installed, otherwise hero_spec's proxy."""

    def __init__(self):
        path = os.path.join(PUBLIC_MODELS, 'hero.glb')
        before = set(bpy.data.objects)
        self.source = 'proxy'
        if os.path.exists(path):
            try:
                bpy.ops.import_scene.gltf(filepath=path)
                self.source = 'hero.glb'
            except Exception as exc:  # noqa: BLE001 - fall back to the proxy
                print('hero.glb import failed, using the proxy:', exc)
        if self.source == 'proxy':
            hero_spec.build_proxy_hero(style)
        bpy.context.view_layer.update()
        self.objects = [o for o in bpy.data.objects if o not in before]
        self.meshes = [o for o in self.objects if o.type == 'MESH']
        self.base = {o.name: o.matrix_world.copy() for o in self.meshes}
        for o in self.objects:
            o.hide_render = True
        self.copies = []

    def place(self, matrix):
        out = []
        for o in self.meshes:
            c = o.copy()
            c.parent = None
            bpy.context.scene.collection.objects.link(c)
            c.matrix_world = matrix @ self.base[o.name]
            c.hide_render = False
            out.append(c)
        self.copies += out
        return out

    def clear(self):
        for c in self.copies:
            bpy.data.objects.remove(c, do_unlink=True)
        self.copies = []


def show_only(entries, visible_ids):
    for key, e in entries.items():
        vis = key in visible_ids
        for o in [e['node']] + e['meshes'] + list(e.get('empties', {}).values()):
            o.hide_render = not vis


def place_node(e, matrix):
    e['node'].matrix_world = matrix


def reset_nodes(entries):
    for e in entries.values():
        e['node'].matrix_world = Matrix.Identity(4)
        for o in e['meshes']:
            o.hide_render = False


def lineup(n, cols, dx, dy, right, back):
    out = []
    rows = math.ceil(n / cols)
    for i in range(n):
        r, c = divmod(i, cols)
        cc = c - (cols - 1) / 2 if r < rows - 1 or n % cols == 0 else c - (n - cols * (rows - 1) - 1) / 2
        out.append(right * (cc * dx) + back * (((rows - 1) / 2 - r) * dy))
    return out


def project(cam, p, res):
    from bpy_extras.object_utils import world_to_camera_view
    co = world_to_camera_view(bpy.context.scene, cam, Vector(p))
    return co.x - 0.5, co.y - 0.5


def preview_weapons(weapons, hero):
    """weapons.webp: every weapon held by the explorer (3/4 front-right), then the weapons alone."""
    W_, H1, H2 = 1200, 860, 470
    _preview_studio((W_, H1), ground="#8BE36A")
    scene = bpy.context.scene
    yaw, elev = 62.0, 16.0
    right = Vector((math.cos(RAD(yaw)), math.sin(RAD(yaw)), 0))
    back = Vector((-math.sin(RAD(yaw)), math.cos(RAD(yaw)), 0))
    offs = lineup(len(WEAPON_IDS), 7, 1.8, 2.75 / math.sin(RAD(elev)), right, back)
    show_only(weapons, WEAPON_IDS)
    for wid, off in zip(WEAPON_IDS, offs):
        m = Matrix.Translation(off)
        hero.place(m)
        place_node(weapons[wid], m)
    cam = _camera('Grid camera', elev, (0.3, 0, 1.05), 13.6, distance=60, yaw=yaw)
    bpy.context.view_layer.update()
    labels = []
    for wid, off in zip(WEAPON_IDS, offs):
        u, v = project(cam, off + Vector((0.2, 0, 0)), (W_, H1))
        labels.append(hud_label(cam, wid, u, v - 0.012, 0.2, (W_, H1), align='CENTER'))
    top = os.path.join(PREVIEWS, '_weapons_top.png')
    render(top)
    _remove(labels + [cam])
    hero.clear()
    # The weapons alone, laid out as their icons are (same orientation), at true relative size.
    _preview_studio((W_, H2), ground='#FFF1D2')
    ground = bpy.data.objects.get('Preview ground')
    if ground:
        ground.location.z = -3.0
    cam = _camera("Row camera", 8, (0, 0, 0), 13.0, distance=40)
    pos = lineup(len(WEAPON_IDS), 10, 1.28, 1.3, Vector((1, 0, 0)), Vector((0, 0, 1)))
    for wid, off in zip(WEAPON_IDS, pos):
        e = weapons[wid]
        place_node(e, Matrix.Translation(off * 1.0 + Vector((0, 0, 0))) @ icon_matrix_weapon(e, centred=True))
    scene.render.resolution_x, scene.render.resolution_y = W_, H2
    bottom = os.path.join(PREVIEWS, '_weapons_row.png')
    render(bottom)
    bpy.data.objects.remove(cam, do_unlink=True)
    reset_nodes(weapons)
    _composite([top, bottom], [(0, 0), (0, H1)], (W_, H1 + H2), os.path.join(PREVIEWS, 'weapons.webp'))


def preview_weapons_game(weapons, hero):
    """weapons-game.webp: a few weapons held at the game camera's angle, zoomed (ortho 5), then everything
    at the game's own zoom (about 43 px per metre)."""
    W_, H1, H2 = 1200, 900, 420
    _preview_studio((W_, H1), ground='#75E444')
    # Two staggered rows far enough apart that the front heads don't hide the back row.
    picks = [('sword_crystal', 80), ('hammer_thunder', -110), ('gun_bubble', -60), ('staff_fire', 15)]
    show_only(weapons, [p[0] for p in picks])
    spots = [(-1.25, 1.6), (1.25, 1.6), (-1.25, -1.4), (1.25, -1.4)]
    for (wid, heading), (x, y) in zip(picks, spots):
        m = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(RAD(heading), 4, 'Z')
        hero.place(m)
        place_node(weapons[wid], m)
    game_camera(target=(0.0, 0.0, 1.1), ortho_scale=5.4)
    top = os.path.join(PREVIEWS, '_game_top.png')
    render(top)
    hero.clear()
    reset_nodes(weapons)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = W_, H2
    show_only(weapons, WEAPON_IDS)
    cols = 10
    for i, wid in enumerate(WEAPON_IDS):
        r, c = divmod(i, cols)
        x = (c - (cols - 1) / 2) * 2.2 + (1.1 if r else 0.0)
        y = 2.6 - r * 5.2
        heading = [0, 30, 90, 150, 200, -60, -120, 60, 0, 250][i % 10]
        m = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(RAD(heading), 4, 'Z')
        hero.place(m)
        place_node(weapons[wid], m)
    cam = game_camera(target=(0.0, 0.0, 0.9), ortho_scale=W_ / 43.0)
    lab = hud_label(cam, 'Game zoom (43 px per metre)', -0.49, 0.48, 0.55, (W_, H2))
    bottom = os.path.join(PREVIEWS, '_game_row.png')
    render(bottom)
    _remove([lab])
    hero.clear()
    reset_nodes(weapons)
    _composite([top, bottom], [(0, 0), (0, H1)], (W_, H1 + H2), os.path.join(PREVIEWS, 'weapons-game.webp'))


def preview_pets(pets, hero):
    """pets.webp: every pet at a 3/4 view, then two beside the explorer from the game camera."""
    W_, H1, H2 = 1200, 640, 520
    _preview_studio((W_, H1), ground='#8BE36A')
    yaw, elev = 24.0, 16.0
    right = Vector((math.cos(RAD(yaw)), math.sin(RAD(yaw)), 0))
    back = Vector((-math.sin(RAD(yaw)), math.cos(RAD(yaw)), 0))
    offs = lineup(len(PET_IDS), 4, 1.05, 1.02 / math.sin(RAD(elev)), right, back)
    show_only(pets, PET_IDS)
    for pid, off in zip(PET_IDS, offs):
        place_node(pets[pid], Matrix.Translation(off) @ Matrix.Rotation(RAD(-18), 4, 'Z'))
    cam = _camera('Pets camera', elev, (0.0, 0, 0.42), 4.6, distance=40, yaw=yaw)
    bpy.context.view_layer.update()
    labels = []
    for pid, off in zip(PET_IDS, offs):
        u, v = project(cam, off, (W_, H1))
        labels.append(hud_label(cam, pid, u, v - 0.02, 0.085, (W_, H1), align='CENTER'))
    top = os.path.join(PREVIEWS, '_pets_top.png')
    render(top)
    _remove(labels + [cam])
    reset_nodes(pets)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = W_, H2
    show_only(pets, ['pet_dragon', 'bunny', 'pet_robot'])
    hero.place(Matrix.Identity(4))
    place_node(pets['pet_dragon'], Matrix.Translation((1.05, 0.35, 0.0)) @ Matrix.Rotation(RAD(-10), 4, 'Z'))
    place_node(pets['bunny'], Matrix.Translation((-1.0, 0.2, 0)) @ Matrix.Rotation(RAD(15), 4, 'Z'))
    place_node(pets['pet_robot'], Matrix.Translation((2.4, -0.2, 0)) @ Matrix.Rotation(RAD(-25), 4, 'Z'))
    cam = game_camera(target=(0.6, 0.0, 1.3), ortho_scale=5.0)
    lab = hud_label(cam, 'Beside the explorer at the game camera angle, as authored (flyers centred at z 0.5)',
                    -0.49, 0.485, 0.11, (W_, H2))
    bottom = os.path.join(PREVIEWS, '_pets_hero.png')
    render(bottom)
    _remove([lab])
    hero.clear()
    reset_nodes(pets)
    _composite([top, bottom], [(0, 0), (0, H1)], (W_, H1 + H2), os.path.join(PREVIEWS, 'pets.webp'))


# =================================================================== icons
def icon_rotation(kind):
    if kind in ('sword', 'hammer', 'scythe', 'trident', 'rod'):
        return (Matrix.Rotation(RAD(-16), 4, 'Z') @ Matrix.Rotation(RAD(-45), 4, 'Y') @
                Matrix.Rotation(RAD(90), 4, 'Z'))
    if kind == 'blaster':
        return (Matrix.Rotation(RAD(-28), 4, 'Z') @ Matrix.Rotation(RAD(-10), 4, 'Y') @
                Matrix.Rotation(RAD(90), 4, 'Z'))
    if kind == 'staff':
        return Matrix.Rotation(RAD(-18), 4, 'Z') @ Matrix.Rotation(RAD(42), 4, 'Y')
    if kind == 'bow':
        return (Matrix.Rotation(RAD(-20), 4, 'Z') @ Matrix.Rotation(RAD(38), 4, 'Y') @
                Matrix.Rotation(RAD(-90), 4, 'Z'))
    return Matrix.Identity(4)


def icon_matrix_weapon(e, centred=False):
    """World matrix for a weapon node that shows it in its icon orientation (hand frame, rotated)."""
    rot = icon_rotation(e['weapon'].kind)
    m = rot @ pose_rotation(e['weapon'].kind).inverted() @ Matrix.Translation(-HAND)
    if centred:
        pts = [m @ v.co for v in e['meshes'][0].data.vertices]
        b = bounds(pts)
        c = Vector([(b['min'][i] + b['max'][i]) / 2 for i in range(3)])
        m = Matrix.Translation(-c) @ m
    return m


def icon_camera(objs, elevation=12, margin=1.06, yaw=0.0):
    data = bpy.data.cameras.new('Icon camera')
    data.type = 'ORTHO'
    cam = bpy.data.objects.new('Icon camera', data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elevation), RAD(yaw)
    direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    cam.location = direction * 10
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ v.co) for o in objs for v in o.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    rgt, up = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)), cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    cam.location = cam.location + rgt * (x0 + x1) / 2 + up * (y0 + y1) / 2
    data.ortho_scale = max(x1 - x0, y1 - y0) * margin
    bpy.context.scene.camera = cam
    return cam


def _icon_stage():
    _clear_stage()
    studio(size=(160, 160), transparent=True)
    _eevee(48)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.6
    scene.view_settings.exposure = -0.15
    for light in bpy.data.objects:
        if light.type == 'LIGHT':
            try:
                light.data.angle = RAD(22)
            except AttributeError:
                pass
    scene.render.filter_size = 1.2


def _render_icon(path):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = path
    for q in (88, 82, 76, 70, 62, 54):
        scene.render.image_settings.quality = q
        bpy.ops.render.render(write_still=True)
        if os.path.getsize(path) <= ICON_LIMIT:
            break
    return os.path.getsize(path), q


PET_ICON_VIEW = dict(heading=-30, elevation=14)


def render_icons(weapons, pets):
    _icon_stage()
    os.makedirs(ICONS, exist_ok=True)
    everything = dict(weapons)
    everything.update(pets)
    written = {}
    for key, e in everything.items():
        show_only(everything, [key])
        if key in weapons:
            place_node(e, icon_matrix_weapon(e))
            elevation = 14
        else:
            place_node(e, Matrix.Rotation(RAD(PET_ICON_VIEW['heading']), 4, 'Z'))
            elevation = PET_ICON_VIEW['elevation']
        bpy.context.view_layer.update()
        cam = icon_camera(e['meshes'], elevation, margin=1.05 if key in weapons else 1.08)
        size, q = _render_icon(os.path.join(ICONS, key + '.webp'))
        bpy.data.objects.remove(cam, do_unlink=True)
        written[key] = dict(bytes=size, quality=q)
    reset_nodes(everything)
    return written


def contact_sheet(ids, out_path):
    import numpy as np
    cell, small, pad = 176, 52, 8
    cols = 7
    rows = math.ceil(len(ids) / cols)
    ch = cell + small + 3 * pad
    w, h = cols * cell, rows * ch
    canvas = np.zeros((h, w, 4), dtype=np.float32)
    canvas[..., :3] = np.array(style.rgba('#FFF6E3')[:3]) ** (1 / 2.2)
    canvas[..., 3] = 1.0
    card = np.array([0.97, 0.91, 0.8])

    def paste(img_px, x, y):
        ih, iw = img_px.shape[:2]
        region = canvas[y:y + ih, x:x + iw]
        a = img_px[..., 3:4]
        region[..., :3] = img_px[..., :3] * a + region[..., :3] * (1 - a)

    for i, key in enumerate(ids):
        img = bpy.data.images.load(os.path.join(ICONS, key + '.webp'))
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


# ==================================================================== main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(only=None, install=False, render=False, sheet=None)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--only':
            opts['only'] = argv[i + 1]
            i += 1
        elif a.startswith('--only='):
            opts['only'] = a.split('=', 1)[1]
        elif a == '--sheet':
            opts['sheet'] = argv[i + 1]
            i += 1
        elif a == '--install':
            opts['install'] = True
        elif a == '--render':
            opts['render'] = True
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    return opts


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


def build_weapons(ids=None):
    return {wid: realise_weapon(WEAPON_BUILDERS[wid]()) for wid in WEAPON_IDS if ids is None or wid in ids}


def build_pets(ids=None):
    return {pid: realise_pet(PET_BUILDERS[pid]()) for pid in PET_IDS if ids is None or pid in ids}


def report_weapons(stats):
    print('\n== weapons')
    for wid, s in stats.items():
        extra = ''
        for k in ('muzzle', 'rod-tip'):
            if k in s:
                extra += f"  {k} {s[k]['blender']}"
        print(f"  {wid:16s} {s['triangles']:4d} tris  grip {s['handle']['axis_distance']:.3f}/"
              f"{s['handle']['surface_distance']:.3f}  head {s['head_clearance']:.3f}  "
              f"z {s['bounds']['min'][2]:+.2f}..{s['bounds']['max'][2]:+.2f}{extra}")


def report_pets(stats):
    print('== pets')
    for pid, s in stats.items():
        print(f"  {pid:12s} {s['triangles']['total']:4d} tris  h {s['height']:.3f}  centre z {s['centre_z']:.3f}  "
              f"size {s['bounds']['size']}")


def main():
    opts = parse_args()
    only = opts['only']
    ids = None
    if only in (None, 'weapons', 'pets', 'icons'):
        sections = [only] if only else ['weapons', 'pets', 'icons']
    else:
        ids = set(only.split(','))
        unknown = ids - set(WEAPON_IDS) - set(PET_IDS)
        if unknown:
            raise SystemExit(f'unknown ids {sorted(unknown)}')
        sections = ['icons']
    manifest = load_manifest()
    manifest['generator'] = 'art/blender/kit/build_weapons.py'
    manifest['blender'] = bpy.app.version_string
    manifest['coordinates'] = ('Blender Z up, explorer faces -Y (glTF Y up, faces +Z); metres; weapons in explorer '
                               'space gripped at hand-right; pets stand at the origin facing -Y')
    manifest['hand_right'] = dict(blender=[round(c, 4) for c in HAND], gltf=gltf(HAND))
    failures = []

    if 'weapons' in sections:
        reset_scene()
        weapons = build_weapons()
        stats = {wid: weapon_stats(e) for wid, e in weapons.items()}
        report_weapons(stats)
        for wid, s in stats.items():
            failures += [f'{wid}: {x}' for x in check_weapon(wid, s, weapons[wid])]
        objects = []
        for wid in WEAPON_IDS:
            e = weapons[wid]
            objects += [e['node']] + e['meshes'] + list(e['empties'].values())
        path = os.path.join(MODELS, 'gear-weapons.glb')
        size = export(objects, path)
        print(f'  gear-weapons.glb {size} bytes')
        if size > WEAPON_GLB_LIMIT:
            failures.append(f'gear-weapons.glb is {size} bytes (> {WEAPON_GLB_LIMIT})')
        doc = glb_node_names(path)
        names = [n.get('name') for n in doc['nodes']]
        for wid, s in stats.items():
            for k in ('muzzle', 'rod-tip'):
                if k in s and names.count(k) < 1:
                    failures.append(f'{wid}: {k} missing in the GLB')
        mats = sorted({m for s in stats.values() for m in s['materials']})
        manifest['weapons'] = dict(
            file='gear-weapons.glb', bytes=size, part='hand-right',
            poses=dict(raise_deg=RAISE, lean_deg={k: dict(outward=v[0], forward=v[1]) for k, v in LEAN.items()},
                       blaster='level forward', note='muzzle/rod-tip empties have no rotation; shots travel along '
                       'the explorer\'s facing'),
            items=stats, materials=mats,
            emissive={m: material_info(bpy.data.materials[m])['strength'] for m in mats
                      if material_info(bpy.data.materials[m])['emissive']})
        if opts['render']:
            hero = HeroStandIn()
            manifest['weapons']['preview_explorer'] = hero.source
            preview_weapons(weapons, hero)
            preview_weapons_game(weapons, hero)

    if 'pets' in sections:
        reset_scene()
        pets = build_pets()
        stats = {pid: pet_stats(e) for pid, e in pets.items()}
        report_pets(stats)
        for pid, s in stats.items():
            failures += [f'{pid}: {x}' for x in check_pet(pid, s, pets[pid])]
        objects = []
        for pid in PET_IDS:
            e = pets[pid]
            objects += [e['node']] + e['meshes']
        path = os.path.join(MODELS, 'pets.glb')
        size = export(objects, path)
        print(f'  pets.glb {size} bytes')
        if size > PET_GLB_LIMIT:
            failures.append(f'pets.glb is {size} bytes (> {PET_GLB_LIMIT})')
        mats = sorted({m for s in stats.values() for m in s['materials']})
        manifest['pets'] = dict(
            file='pets.glb', bytes=size,
            flap=('wings: rotate <id>_wing_l / <id>_wing_r about their own forward axis (glTF Z, Blender Y), '
                  'opposite signs; about +-0.6 rad reads as a flap. _r is on +X like hand-right.'),
            items=stats, materials=mats,
            emissive={m: material_info(bpy.data.materials[m])['strength'] for m in mats
                      if material_info(bpy.data.materials[m])['emissive']})
        if opts['render']:
            hero = HeroStandIn()
            preview_pets(pets, hero)

    if 'icons' in sections:
        reset_scene()
        weapons = build_weapons(ids)
        pets = build_pets(ids)
        if ids:
            for wid, e in weapons.items():
                s = weapon_stats(e)
                report_weapons({wid: s})
                failures += [f'{wid}: {x}' for x in check_weapon(wid, s, e)]
            for pid, e in pets.items():
                s = pet_stats(e)
                report_pets({pid: s})
                failures += [f'{pid}: {x}' for x in check_pet(pid, s, e)]
        sizes = render_icons(weapons, pets)
        for key, info in sizes.items():
            if info['bytes'] > ICON_LIMIT:
                failures.append(f"icon {key}.webp is {info['bytes']} bytes (> {ICON_LIMIT})")
        if not ids:
            manifest['icons'] = dict(dir='icons/items', size=[160, 160], files=sizes)
        if opts['sheet']:
            contact_sheet([k for k in WEAPON_IDS + PET_IDS if k in sizes], opts['sheet'])

    if not ids:
        save_manifest(manifest)
    if failures:
        raise RuntimeError('Weapons/pets contract failures:\n  ' + '\n  '.join(failures))

    if opts['install'] and not ids:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        for sec, fname in (('weapons', 'gear-weapons.glb'), ('pets', 'pets.glb')):
            if sec in sections:
                shutil.copy2(os.path.join(MODELS, fname), os.path.join(PUBLIC_MODELS, fname))
                print('installed', fname)
        if 'icons' in sections:
            os.makedirs(PUBLIC_ICONS, exist_ok=True)
            for key in WEAPON_IDS + PET_IDS:
                shutil.copy2(os.path.join(ICONS, key + '.webp'), os.path.join(PUBLIC_ICONS, key + '.webp'))
            print('installed', len(WEAPON_IDS) + len(PET_IDS), 'icons')
    print('\nWeapons and pets OK')


if __name__ == '__main__':
    main()
