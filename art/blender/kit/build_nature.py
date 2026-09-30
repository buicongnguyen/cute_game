"""Zoo Garden nature kit: scenery pieces and crops.

Soft, glossy "toy" scenery (trees, bushes, flowers, grass, rocks, fences) and 19
mature crops plus a sprout, all authored procedurally for Zoo Garden. Geometry is
generated directly as vertex/face lists so every piece has a hand-tuned triangle
budget; see CONTRACT.md for node names, material names, sizes and budgets.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_nature.py -- \
        [--only scenery|crops|icons] [--install] [--render]

Outputs (default):
    art/generated/kit/models/scenery.glb, crops.glb
    art/generated/kit/icons/crops/<id>.webp  (160 x 160, transparent)
    art/generated/kit/nature-manifest.json
    art/previews/kit/*.webp                   (with --render)
--install copies the GLBs to public/assets/models/ and the icons to
public/assets/icons/crops/.

Blender is Z up with -Y as the front; glTF exports are Y up with +Z as the front.
"""
import bpy
import bmesh
import json
import math
import os
import random
import shutil
import sys
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import export_glb, game_camera, mat, render, reset_scene, studio  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
ICONS = os.path.join(GEN, 'icons', 'crops')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'nature-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'crops')

CROP_IDS = ['radish', 'carrot', 'pumpkin', 'mint', 'chili', 'candy', 'bean', 'star', 'berry', 'coffee',
            'moonflower', 'magnetmelon', 'melon', 'clover', 'glowshroom', 'iceberry', 'goldcorn',
            'dragonfruit', 'rainbowrose']
SCENERY_IDS = ['tree_blossom', 'tree_round', 'tree_pine', 'bush', 'flowers', 'tuft', 'rock', 'stone_step',
               'fence', 'gate', 'mushroom']
TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))
# The game camera looks from -Y, about 42 degrees down; faces aimed here read best.
TO_CAMERA = Vector((0, -0.74, 0.67)).normalized()


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists with a per-face tag (used to pick materials)."""

    def __init__(self, verts, faces, tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [0] * len(self.faces)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

    def keep(self, predicate):
        pairs = [(f, t) for f, t in zip(self.faces, self.tags) if predicate(f)]
        return Geo(self.verts, [p[0] for p in pairs], [p[1] for p in pairs])

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


class Piece:
    """Accumulates parts (geometry + material) into one named mesh object."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.mats, self.smooth, self.materials = [], [], [], [], []

    def slot(self, material):
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def add(self, geo, material, xf=None, smooth=True):
        g = geo if xf is None else geo.transformed(xf)
        base = len(self.verts)
        self.verts.extend(g.verts)
        for f, t in zip(g.faces, g.tags):
            m = material[t] if isinstance(material, dict) else material
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.slot(m))
            self.smooth.append(smooth)
        return self

    def build(self, sharp=None):
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


def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list, Vector)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(s))


def leaf_frame(base, yaw, pitch, roll=0.0, parent=None):
    """Local +Y along a direction (yaw around Z, pitch above horizontal), local +Z the upper surface."""
    fwd = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)))
    side = Vector((math.sin(yaw), -math.cos(yaw), 0.0))
    nrm = side.cross(fwd).normalized()
    if roll:
        q = Quaternion(fwd, roll)
        side, nrm = q @ side, q @ nrm
    m = Matrix((side, fwd, nrm)).transposed().to_4x4()
    m.translation = Vector(base)
    return parent @ m if parent is not None else m


def facing(loc, normal, up=(0, 0, 1), spin=0.0):
    """Local +Z along `normal`, local +Y as close to `up` as possible."""
    z = Vector(normal).normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    if spin:
        q = Quaternion(z, spin)
        x, y = q @ x, q @ y
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def toward(normal_xy_bias=(0, 0), tilt=1.0):
    """A facing normal between straight up and the game camera, nudged sideways."""
    n = UP.lerp(TO_CAMERA, tilt) + Vector((normal_xy_bias[0], normal_xy_bias[1], 0))
    return n.normalized()


def bez(points, n):
    """Sample a quadratic or cubic Bezier through control points into n points."""
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


# ------------------------------------------------------------- primitives
def _qsphere(n):
    """Spherified cube with n x n quads per side: evenly spread, smooth with few triangles."""
    verts, index, faces = [], {}, []

    def vid(p):
        key = tuple(round(c, 5) for c in p)
        if key not in index:
            x, y, z = p
            s = Vector((x * math.sqrt(max(0.0, 1 - y * y / 2 - z * z / 2 + y * y * z * z / 3)),
                        y * math.sqrt(max(0.0, 1 - z * z / 2 - x * x / 2 + z * z * x * x / 3)),
                        z * math.sqrt(max(0.0, 1 - x * x / 2 - y * y / 2 + x * x * y * y / 3))))
            index[key] = len(verts)
            verts.append(s.normalized())
        return index[key]

    for axis in range(3):
        for sign in (-1, 1):
            ua, va = (axis + 1) % 3, (axis + 2) % 3
            grid = []
            for i in range(n + 1):
                row = []
                for j in range(n + 1):
                    p = [0.0, 0.0, 0.0]
                    p[axis] = float(sign)
                    p[ua] = -1 + 2 * i / n
                    p[va] = -1 + 2 * j / n
                    row.append(vid(p))
                grid.append(row)
            for i in range(n):
                for j in range(n):
                    a, b, c, d = grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]
                    faces.append((a, b, c, d) if sign > 0 else (a, d, c, b))
    return verts, faces


def ellipsoid(n, radii, center=(0, 0, 0), wobble=0.0, seed=0):
    verts, faces = _qsphere(n)
    rng = random.Random(seed)
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    c = Vector(center)
    out = []
    for v in verts:
        k = 1 + wobble * math.sin(2.3 * v.x + ph[0]) * math.sin(2.9 * v.y + ph[1]) * math.cos(2.1 * v.z + ph[2])
        out.append(c + Vector((v.x * radii[0] * k, v.y * radii[1] * k, v.z * radii[2] * k)))
    return Geo(out, faces).outward()


def uvsphere(segs, rings, radii=(1, 1, 1), center=(0, 0, 0), wave=None):
    """Poles on Z. `wave(lat)` may shift longitudes (for wavy stripes). Tags = segment index."""
    verts = [(0, 0, -1)]
    for r in range(1, rings):
        lat = -math.pi / 2 + math.pi * r / rings
        shift = wave(lat) if wave else 0.0
        for s in range(segs):
            th = TAU * s / segs + shift
            verts.append((math.cos(lat) * math.cos(th), math.cos(lat) * math.sin(th), math.sin(lat)))
    verts.append((0, 0, 1))
    top = len(verts) - 1
    faces, tags = [], []

    def ring(r, s):
        return 1 + (r - 1) * segs + (s % segs)
    for s in range(segs):
        faces.append((0, ring(1, s + 1), ring(1, s)))
        tags.append(s)
    for r in range(1, rings - 1):
        for s in range(segs):
            faces.append((ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)))
            tags.append(s)
    for s in range(segs):
        faces.append((ring(rings - 1, s), ring(rings - 1, s + 1), top))
        tags.append(s)
    c = Vector(center)
    verts = [c + Vector((v[0] * radii[0], v[1] * radii[1], v[2] * radii[2])) for v in verts]
    return Geo(verts, faces, tags).outward()


def ico0(radius, center=(0, 0, 0), squash=1.0):
    """A 20-triangle icosahedron: tiny berries and cherries."""
    t = (1 + 5 ** 0.5) / 2
    raw = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
           (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5),
             (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    c = Vector(center)
    verts = []
    for v in raw:
        n = Vector(v).normalized() * radius
        verts.append(c + Vector((n.x, n.y, n.z * squash)))
    return Geo(verts, faces).outward()


def lathe(profile, segs, mod=None, phase=0.0, cap_bottom=False, cap_top=False, tag=None):
    """Revolve [(r, z), ...] (bottom to top) around Z. r = 0 makes a pole.
    mod(theta, ring) scales the radius; tag(band, seg) labels faces."""
    verts, rings = [], []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for s in range(segs):
            th = phase + TAU * s / segs
            rr = r * (mod(th, i) if mod else 1.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(th), rr * math.sin(th), z))
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        for s in range(segs):
            t = tag(b, s) if tag else 0
            if len(lo) == 1 and len(up) == 1:
                break
            if len(lo) == 1:
                faces.append((lo[0], up[(s + 1) % segs], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[(s + 1) % segs], up[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % segs], up[(s + 1) % segs], up[s]))
            tags.append(t)
    if cap_bottom and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
        tags.append(tag(-1, 0) if tag else 0)
    if cap_top and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(tag(len(rings), 0) if tag else 0)
    return Geo(verts, faces, tags)


def tube(path, radius, sides=6, flatten=1.0, ang0=0.0, cap_start=False, cap_end=False, tag=None):
    """Sweep a (possibly flattened) circle along a polyline. radius may be a list; 0 makes a point."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * n
    tangents = []
    for i in range(n):
        t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tangents.append(t.normalized())
    ref = UP if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    frames = []
    for i in range(n):
        if i:
            nrm = tangents[i - 1].rotation_difference(tangents[i]) @ nrm
            nrm = (nrm - tangents[i] * nrm.dot(tangents[i])).normalized()
        frames.append((nrm, tangents[i].cross(nrm)))
    verts, rings = [], []
    for i in range(n):
        r = radii[i]
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append(pts[i])
            continue
        nv, bv = frames[i]
        ring = []
        for s in range(sides):
            a = ang0 + TAU * s / sides
            ring.append(len(verts))
            verts.append(pts[i] + nv * math.cos(a) * r + bv * math.sin(a) * r * flatten)
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        t = tag(b) if tag else 0
        for s in range(sides):
            if len(lo) == 1:
                faces.append((lo[0], up[(s + 1) % sides], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[(s + 1) % sides], up[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % sides], up[(s + 1) % sides], up[s]))
            tags.append(t)
    if cap_start and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
        tags.append(tag(0) if tag else 0)
    if cap_end and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(tag(len(rings) - 2) if tag else 0)
    return Geo(verts, faces, tags)


SHAPES = {
    'leaf': lambda t: math.sin(math.pi * t ** 0.8) ** 0.85,
    'oval': lambda t: math.sin(math.pi * t) ** 0.6,
    'round': lambda t: math.sin(math.pi * t ** 0.9) ** 0.45,
    'strap': lambda t: min(1.0, t * 5) ** 0.5 * max(0.0, 1 - t ** 2.5) ** 0.6,
    'blade': lambda t: (1 - t) ** 0.7,
    'petal': lambda t: 0.0 if t >= 0.999 else (0.4 + 0.6 * math.sin(math.pi * 0.5 * min(1.0, t / 0.55)))
    * (1 - 0.25 * max(0.0, t - 0.55) / 0.45),
    # Round-ended petal: use with leaf(tip=...) so the wide end closes in a soft point.
    'rpetal': lambda t: (0.42 + 0.58 * math.sin(math.pi * 0.5 * min(1.0, t / 0.6))) if t <= 0.6
    else 1 - 0.55 * ((t - 0.6) / 0.4) ** 2,
    'spoon': lambda t: 0.3 + 0.7 * math.sin(math.pi * 0.5 * min(1.0, t / 0.7)) if t < 0.999 else 0.62,
}


def leaf(length, width, segs=4, shape='leaf', fold=0.3, bend=0.0, serrate=0.0, tag=None, curl=0.0, tip=0.0):
    """A leaf sheet: base at the origin, along +Y, upper surface +Z.
    fold raises the edges (a V), bend curls the tip toward +Z (negative droops), curl rolls the edges up.
    For shapes still wide at the end, tip adds a closing point that far beyond (a rounded petal end)."""
    fn = SHAPES[shape] if isinstance(shape, str) else shape
    verts, rows = [], []
    for i in range(segs + 1):
        t = i / segs
        y = t * length
        w = 0.5 * width * fn(t)
        if serrate and 0 < i < segs:
            w *= 1.0 if i % 2 else (1 - serrate)
        z = bend * length * t * t
        if w < 1e-4:
            rows.append([len(verts)])
            verts.append((0.0, y, z))
        else:
            e = z + fold * w + curl * w * t
            rows.append([len(verts), len(verts) + 1, len(verts) + 2])
            verts += [(-w, y, e), (0.0, y, z), (w, y, e)]
    if tip and len(rows[-1]) == 3:
        t = 1 + tip
        rows.append([len(verts)])
        verts.append((0.0, t * length, bend * length * t * t + fold * 0.25 * width * fn(1.0)))
    faces, tags = [], []
    for b, (ra, rb) in enumerate(zip(rows, rows[1:])):
        t = tag(b) if tag else 0
        if len(ra) == 1 and len(rb) == 3:
            new = [(ra[0], rb[1], rb[0]), (ra[0], rb[2], rb[1])]
        elif len(ra) == 3 and len(rb) == 3:
            new = [(ra[0], ra[1], rb[1], rb[0]), (ra[1], ra[2], rb[2], rb[1])]
        elif len(ra) == 3 and len(rb) == 1:
            new = [(ra[0], ra[1], rb[0]), (ra[1], ra[2], rb[0])]
        else:
            new = []
        faces += new
        tags += [t] * len(new)
    return Geo(verts, faces, tags)


def disc(outline, rings=1, dome=0.0, back=None, tag=None, center=None, fracs=None):
    """A fan over a CCW 2D outline in local XY, domed toward +Z. back adds a -Z underside cone.
    fracs sets each ring's size as a fraction of the outline (default evenly spaced)."""
    n = len(outline)
    cx, cy = center or (sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n)
    verts = [(cx, cy, dome)]
    ring_ids = [[0]]
    for k in range(1, rings + 1):
        f = fracs[k - 1] if fracs else k / rings
        ids = []
        for x, y in outline:
            ids.append(len(verts))
            verts.append((cx + (x - cx) * f, cy + (y - cy) * f, dome * (1 - f * f)))
        ring_ids.append(ids)
    faces, tags = [], []
    for i in range(n):
        faces.append((0, ring_ids[1][i], ring_ids[1][(i + 1) % n]))
        tags.append(tag(0, i) if tag else 0)
    for k in range(1, rings):
        a, b = ring_ids[k], ring_ids[k + 1]
        for i in range(n):
            faces.append((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
            tags.append(tag(k, i) if tag else 0)
    if back is not None:
        cb = len(verts)
        verts.append((cx, cy, -back))
        out = ring_ids[-1]
        for i in range(n):
            faces.append((cb, out[(i + 1) % n], out[i]))
            tags.append(tag(-1, i) if tag else 0)
    return Geo(verts, faces, tags)


def puff(outline, layers, z_back, z_front, tag=None):
    """A pillowy slab: outline rings [(scale, z), ...] back to front, closed by centre fans."""
    n = len(outline)
    cx, cy = sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n
    verts, rings = [], []
    for s, z in layers:
        ids = []
        for x, y in outline:
            ids.append(len(verts))
            verts.append((cx + (x - cx) * s, cy + (y - cy) * s, z))
        rings.append(ids)
    cb, cf = len(verts), len(verts) + 1
    verts += [(cx, cy, z_back), (cx, cy, z_front)]
    faces, tags = [], []
    for i in range(n):
        faces.append((cb, rings[0][(i + 1) % n], rings[0][i]))
        tags.append(tag('back') if tag else 0)
    for lo, up in zip(rings, rings[1:]):
        for i in range(n):
            faces.append((lo[i], lo[(i + 1) % n], up[(i + 1) % n], up[i]))
            tags.append(tag('side') if tag else 0)
    for i in range(n):
        faces.append((rings[-1][i], rings[-1][(i + 1) % n], cf))
        tags.append(tag('front') if tag else 0)
    return Geo(verts, faces, tags)


# ---------------------------------------------------------------- outlines
def lobed(lobes, per, r_in, r_out, power=0.7, phase=0.0):
    pts = []
    for i in range(lobes * per):
        th = phase + TAU * i / (lobes * per)
        k = abs(math.cos(lobes * (th - phase) / 2)) ** power
        r = r_in + (r_out - r_in) * k
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


def star_outline(points, outer, inner, phase=math.pi / 2):
    pts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        th = phase + math.pi * i / points
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


def heart_outline(n, size):
    """Heart with its point at the origin and the lobes toward +Y (a clover leaflet)."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((-x / 29 * size, (y + 17) / 29 * size))
    return pts  # reversing x makes the outline CCW


def shield_outline(w, h):
    hw = w / 2
    right = [(0.0, -h * 0.55), (hw * 0.45, -h * 0.44), (hw * 0.82, -h * 0.24), (hw * 0.98, 0.0),
             (hw * 1.02, h * 0.22), (hw * 0.9, h * 0.4), (hw * 0.45, h * 0.46)]
    left = [(-x, y) for x, y in reversed(right[1:])]
    return right + [(0.0, h * 0.44)] + left


def rounded_rect(w, h, r, per_corner=2):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180)):
        for k in range(per_corner + 1):
            a = RAD(a0 + 90 * k / per_corner)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# =============================================================== materials
def M(name, color, rough=0.55, metal=0.0, emit=None, strength=0.0, sheet=False):
    """style.mat plus the side flag: sheets (leaves, petals) are double sided, solids are not."""
    m = mat(name, color, rough, metal, emit, strength)
    m.use_backface_culling = not sheet
    return m


def scenery_materials():
    return dict(
        bark=M('Bark', '#94562E', 0.7),
        leaf_a=M('Leaf A', '#2FB33D', 0.55),
        leaf_b=M('Leaf B', '#62CE3C', 0.5),
        blossom_a=M('Blossom A', '#FF62A5', 0.5),
        blossom_b=M('Blossom B', '#FF9EC4', 0.45),
        pine_a=M('Pine A', '#127E43', 0.6),
        pine_b=M('Pine B', '#2EAF52', 0.55),
        berry=M('Berry', '#7C5CFF', 0.35),
        stem=M('Stem', '#48B03A', 0.6),
        petals={k: M('Petal ' + k, c, 0.5, sheet=True) for k, c in (
            ('pink', '#FF62AE'), ('violet', '#A066FF'), ('white', '#FFFCF4'), ('blue', '#36B4FF'),
            ('yellow', '#FFD02A'))},
        centre=M('Flower centre', '#FFB31F', 0.5),
        grass=M('Grass', '#46B834', 0.6, sheet=True),
        rock=M('Rock', '#A7AEC2', 0.65),
        step=M('Step stone', '#C3CAD8', 0.6),
        post=M('Fence post', '#A5602F', 0.65),
        rail=M('Fence rail', '#E39C55', 0.6),
        sign=M('Sign', '#F9D38D', 0.55),
        cap=M('Mushroom cap', '#F2303A', 0.4),
        spots=M('Mushroom spots', '#FFF7EA', 0.5),
        mstem=M('Mushroom stem', '#FFE8C4', 0.6),
    )


# ================================================================= scenery
def _inside(p, blob, margin=0.985):
    c, r = blob['c'], blob['r']
    return ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2 < margin * margin


LATS_HI = (-50, -15, 20, 52)
LATS_LO = (-38, 8, 46)


def blob_geo(b, wobble=0.0, seed=0):
    """A soft ellipsoid: a lathe with latitude rings placed where the 42 degree game camera sees
    the silhouette, so a 16-20 sided outline costs 8 x segs triangles."""
    lats = b.get('lats', LATS_HI)
    prof = [(0.0, -1.0)] + [(math.cos(RAD(a)), math.sin(RAD(a))) for a in lats] + [(0.0, 1.0)]
    g = lathe(prof, b['segs'], phase=b.get('phase', 0.0))
    rng = random.Random(seed)
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    c, r = Vector(b['c']), b['r']
    for v in g.verts:
        k = 1 + wobble * math.sin(2.3 * v.x + ph[0]) * math.sin(2.9 * v.y + ph[1]) * math.cos(2.1 * v.z + ph[2])
        v.x, v.y, v.z = c.x + v.x * r[0] * k, c.y + v.y * r[1] * k, c.z + v.z * r[2] * k
    return g.outward()


def canopy(piece, blobs, wobble=0.03, floor=None, seed=7):
    """Overlapping soft blobs. Faces buried inside the other blobs are dropped, which pays for
    smoother blobs within the triangle budget."""
    for i, b in enumerate(blobs):
        g = blob_geo(b, wobble, seed + i)
        if floor is not None:
            for v in g.verts:
                v.z = max(v.z, floor)
        others = [o for j, o in enumerate(blobs) if j != i]

        def visible(f, g=g, others=others):
            vs = [g.verts[k] for k in f]
            if floor is not None and all(v.z <= floor + 1e-4 for v in vs):
                return False
            if any(all(_inside(v, o) for v in vs) for o in others):
                return False
            # Inside the union: every corner (and the centre) well inside some neighbour.
            centre = sum(vs, Vector()) / len(vs)
            return not all(any(_inside(v, o, 0.93) for o in others) for v in vs + [centre])
        piece.add(g.keep(visible), b['m'])


def surface_point(blob, direction, lift=0.0):
    d = Vector(direction).normalized()
    c, r = Vector(blob['c']), blob['r']
    k = 1 / math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2)
    p = c + d * k
    n = Vector(((p.x - c.x) / r[0] ** 2, (p.y - c.y) / r[1] ** 2, (p.z - c.z) / r[2] ** 2)).normalized()
    return p + n * lift, n


def octa(radius, center, squash=0.9):
    c = Vector(center)
    verts = [c + Vector(v) * radius for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, squash),
                                              (0, 0, -squash))]
    faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    return Geo(verts, faces).outward()


def trunk(piece, material, h, r0, r1, segs=7, lean=(0.0, 0.0), flare=1.5, phase=0.0):
    g = lathe([(r0 * flare, 0.0), (r0 * 1.06, 0.16), (r0 * 0.97, 0.5 * h), (r1, h)], segs, phase=phase)
    for v in g.verts:
        k = (v.z / h) ** 2
        v.x += lean[0] * k
        v.y += lean[1] * k
    piece.add(g, material)


def puffy_crown(crown_mat, lobe_mat, crown, lobes):
    """A lighter crown puff sitting on a ring of darker lobes: reads soft from any yaw."""
    blobs = [dict(c=crown[0], r=crown[1], segs=20, m=crown_mat, phase=0.1)]
    for k, (ang, dist, z, rr) in enumerate(lobes):
        a = RAD(ang)
        blobs.append(dict(c=(dist * math.cos(a), dist * math.sin(a), z), r=(rr, rr * 0.96, rr * 0.86), segs=16,
                          m=lobe_mat, phase=k * 0.4))
    return blobs


def build_tree_round(m):
    p = Piece('tree_round')
    trunk(p, m['bark'], 2.1, 0.25, 0.16, segs=8)
    blobs = puffy_crown(m['leaf_b'], m['leaf_a'], ((0.0, 0.03, 2.66), (0.98, 0.95, 0.86)),
                        ((35, 0.82, 2.22, 0.74), (125, 0.8, 2.3, 0.7), (215, 0.84, 2.18, 0.72), (305, 0.8, 2.26, 0.7)))
    canopy(p, blobs, wobble=0.025)
    return p.build()


def build_tree_blossom(m):
    p = Piece('tree_blossom')
    trunk(p, m['bark'], 2.05, 0.24, 0.15, segs=8, lean=(0.1, 0.04), phase=0.4)
    blobs = puffy_crown(m['blossom_b'], m['blossom_a'], ((0.06, 0.04, 2.72), (0.96, 0.92, 0.86)),
                        ((20, 0.84, 2.2, 0.72), (110, 0.78, 2.3, 0.68), (200, 0.86, 2.16, 0.74), (290, 0.8, 2.26, 0.7)))
    canopy(p, blobs, wobble=0.03, seed=21)
    # Pale petal flecks scattered on the hot pink lobes.
    for bi, d in ((1, (0.5, -0.4, 0.5)), (3, (-0.8, -0.3, 0.45)),
                  (3, (-0.3, 0.8, 0.5)), (4, (0.4, -0.9, 0.3)), (4, (-0.3, -0.8, 0.55))):
        pos, nrm = surface_point(blobs[bi], d, 0.004)
        p.add(disc(lobed(5, 1, 0.07, 0.07), dome=0.016), m['blossom_b'], facing(pos, nrm, spin=bi))
    return p.build()


def build_tree_pine(m):
    p = Piece('tree_pine')
    p.add(lathe([(0.22, 0.0), (0.15, 0.14), (0.12, 0.95)], 6), m['bark'])
    tiers = [(0.5, 1.98, 1.3), (1.36, 2.92, 1.02), (2.2, 3.8, 0.74)]
    for k, (b, t, r) in enumerate(tiers):
        prof = [(0.32 * r, b + 0.03), (r, b + 0.11), (0.87 * r, b + 0.29), (0.53 * r, b + 0.56 * (t - b)), (0.0, t)]

        def mod(th, i, k=k):
            return 1 + 0.06 * math.cos(8 * th + k) if i in (1, 2) else 1.0
        # Lighter tier tops over darker rims and undersides: the layers read from the high camera.
        g = lathe(prof, 16, mod=mod, phase=k * 0.4, tag=lambda band, s: 1 if band >= 2 else 0)
        p.add(g, {0: m['pine_a'], 1: m['pine_b']})
    return p.build()


def build_bush(m):
    p = Piece('bush')
    blobs = [dict(c=(0.0, 0.05, 0.3), r=(0.47, 0.45, 0.38), segs=18, m=m['leaf_a']),
             dict(c=(0.31, -0.16, 0.22), r=(0.3, 0.29, 0.26), segs=14, lats=LATS_LO, m=m['leaf_b']),
             dict(c=(-0.3, -0.12, 0.2), r=(0.3, 0.28, 0.25), segs=14, lats=LATS_LO, m=m['leaf_a'], phase=0.3)]
    canopy(p, blobs, wobble=0.04, floor=0.0, seed=3)
    for bi, d in ((0, (0.2, -0.55, 0.8)), (0, (-0.55, 0.15, 0.75)), (1, (0.5, -0.5, 0.55)), (2, (-0.4, -0.7, 0.45)),
                  (0, (0.35, 0.6, 0.65)), (0, (-0.3, -0.5, 0.9))):
        pos, _ = surface_point(blobs[bi], d, 0.028)
        p.add(octa(0.052, pos), m['berry'])
    return p.build()


def build_flowers(m):
    p = Piece('flowers')
    specs = [((0.03, 0.1), 0.3, 'pink', 0.096), ((-0.18, -0.03), 0.24, 'violet', 0.088),
             ((0.18, -0.07), 0.22, 'blue', 0.088), ((-0.04, -0.2), 0.16, 'white', 0.082),
             ((0.15, 0.22), 0.2, 'yellow', 0.082)]
    for i, ((x, y), h, colour, r) in enumerate(specs):
        top = Vector((x, y, h))
        p.add(tube(bez([(x * 0.35, y * 0.35, 0), (x * 0.8, y * 0.8, h * 0.55), top], 3), [0.017, 0.013, 0.011],
                   sides=3), m['stem'])
        frame = facing(top, (x * 1.4, y * 1.4 - 0.25, 1.0), spin=i * 0.7)
        p.add(disc(lobed(5, 4, 0.5 * r, r, 0.6), dome=-0.016), m['petals'][colour], frame)
        p.add(lathe([(0.3 * r, 0.0), (0.0, 0.22 * r)], 6), m['centre'], frame @ xf((0, 0, -0.004)))
    for yaw, (x, y) in ((RAD(200), (-0.05, 0.02)), (RAD(330), (0.06, -0.02)), (RAD(90), (0.0, 0.08))):
        p.add(leaf(0.14, 0.07, segs=2, fold=0.3, bend=-0.2), m['stem'], leaf_frame((x, y, 0.0), yaw, RAD(35)))
    return p.build()


def build_tuft(m):
    p = Piece('tuft')
    for k, (yaw, pitch, ln, w) in enumerate(((RAD(15), 74, 0.42, 0.11), (RAD(75), 62, 0.33, 0.1),
                                             (RAD(140), 70, 0.4, 0.11), (RAD(200), 58, 0.3, 0.1),
                                             (RAD(262), 66, 0.36, 0.1), (RAD(320), 60, 0.32, 0.1))):
        base = Vector((math.cos(yaw), math.sin(yaw), 0)) * 0.03
        p.add(leaf(ln, w, 2, 'blade', fold=0.5, bend=-0.25), m['grass'], leaf_frame(base, yaw, RAD(pitch)))
    return p.build()


def build_rock(m):
    p = Piece('rock')
    parts = [dict(c=(-0.1, 0.06, 0.2), r=(0.64, 0.56, 0.52), segs=11, lats=LATS_LO, m=m['rock']),
             dict(c=(0.5, -0.3, 0.07), r=(0.3, 0.27, 0.25), segs=8, lats=LATS_LO, m=m['rock'], phase=0.4)]
    planes = [((0.35, -0.55, 0.76), 0.33), ((-0.75, -0.25, 0.6), 0.5), ((0.7, 0.45, 0.55), 0.48),
              ((0.0, 0.0, 1.0), 0.42), ((-0.3, 0.8, 0.5), 0.46)]
    for bi, b in enumerate(parts):
        g = blob_geo(b, 0.05, 5 + bi)
        c, s = Vector(b['c']), b['r'][0]
        for v in g.verts:
            for d, lim in planes:
                d = Vector(d).normalized()
                over = (v - c).dot(d) - lim * s / 0.64
                if over > 0:
                    v -= d * over * 0.7
            v.z = max(v.z, 0.0)
        p.add(g.keep(lambda f, g=g: not all(g.verts[k].z <= 1e-4 for k in f)), b['m'])
    return p.build(sharp=48)


def build_stone_step(m):
    p = Piece('stone_step')

    def mod(th, i):
        return (1.0 + 0.07 * math.cos(2 * th) + 0.04 * math.sin(3 * th + 0.8)) if i < 3 else 1.0
    g = lathe([(0.385, 0.0), (0.385, 0.034), (0.33, 0.064), (0.0, 0.074)], 12, mod=mod)
    for v in g.verts:
        v.y *= 0.84
    p.add(g, m['step'])
    return p.build()


def build_fence(m):
    p = Piece('fence')
    for i, x in enumerate((-1.0, 1.0)):
        g = lathe([(0.094, 0.0), (0.088, 0.9), (0.062, 0.975), (0.0, 1.0)], 8, phase=RAD(22.5))
        p.add(g, m['post'], xf((x, 0, 0), (0, 0, RAD(10 * i))))
    for z, tilt in ((0.4, 0.012), (0.8, -0.015)):
        p.add(tube([(-1.03, 0, z - tilt), (0.0, 0.0, z + 0.012), (1.03, 0, z + tilt)], 0.086, sides=6,
                   flatten=0.6, ang0=RAD(30)), m['rail'])
    return p.build(sharp=50)


def build_gate(m):
    p = Piece('gate')
    for x in (-1.7, 1.7):
        g = lathe([(0.2, 0.0), (0.165, 0.14), (0.155, 2.55), (0.118, 2.7), (0.0, 2.76)], 8, phase=RAD(22.5))
        p.add(g, m['post'], xf((x, 0, 0)))
    # Arch: circular arc from post to post, top surface at 3.1.
    sag, half, thick = 0.5, 1.7, 0.13
    radius = (half ** 2 + sag ** 2) / (2 * sag)
    top = 3.1 - thick
    cz = top - radius
    a_max = math.asin(half / radius)
    arc = [(radius * math.sin(a), 0.0, cz + radius * math.cos(a))
           for a in (-a_max + 2 * a_max * i / 8 for i in range(9))]
    p.add(tube(arc, thick, sides=6, flatten=0.72, ang0=RAD(30)), m['rail'])
    # Blank hanging sign.
    board = puff(rounded_rect(1.2, 0.46, 0.1, 2), [(1.0, -0.04), (1.0, 0.022), (0.93, 0.045)], -0.04, 0.045)
    p.add(board, m['sign'], xf((0, -0.03, 2.16), (RAD(90), 0, 0)))
    for x in (-0.4, 0.4):
        zt = cz + math.sqrt(radius ** 2 - x ** 2) - thick * 0.6
        p.add(tube([(x, -0.03, 2.37), (x, -0.02, zt)], 0.022, sides=3), m['post'])
    return p.build(sharp=55)


def build_mushroom(m):
    p = Piece('mushroom')
    p.add(lathe([(0.068, 0.0), (0.056, 0.1), (0.05, 0.21)], 6), m['mstem'])
    prof = [(0.045, 0.195), (0.168, 0.205), (0.152, 0.285), (0.075, 0.338), (0.0, 0.352)]
    p.add(lathe(prof, 10), m['cap'])
    # Spots sit on the cap surface, tangent to it.
    for ang, t in ((RAD(-100), 0.45), (RAD(-20), 0.35), (RAD(150), 0.55)):
        a, b = Vector(prof[2]), Vector(prof[3])
        r, z = a.lerp(b, t)
        slope = Vector((b.x - a.x, b.y - a.y))
        n2 = Vector((-slope.y, slope.x)).normalized()
        if n2.x < 0:
            n2 = -n2
        nrm = Vector((n2.x * math.cos(ang), n2.x * math.sin(ang), n2.y))
        pos = Vector((r * math.cos(ang), r * math.sin(ang), z)) + nrm * 0.004
        p.add(disc(lobed(6, 1, 0.034, 0.034), dome=0.006), m['spots'], facing(pos, nrm))
    return p.build()


def build_scenery():
    m = scenery_materials()
    builders = dict(tree_blossom=build_tree_blossom, tree_round=build_tree_round, tree_pine=build_tree_pine,
                    bush=build_bush, flowers=build_flowers, tuft=build_tuft, rock=build_rock,
                    stone_step=build_stone_step, fence=build_fence, gate=build_gate, mushroom=build_mushroom)
    return {name: builders[name](m) for name in SCENERY_IDS}


# =================================================================== crops
class CropMats:
    def __init__(self):
        self.leaf = M('Crop leaf', '#3CC43E', 0.5, sheet=True)
        self.leaf_light = M('Crop leaf light', '#7DE24A', 0.5, sheet=True)
        self.stem = M('Crop stem', '#34A83A', 0.55)
        self.soil = M('Crop soil', '#7B4A2C', 0.85)


def mound(p, cm, r=0.24, h=0.075, segs=12):
    g = lathe([(r, 0.0), (0.88 * r, 0.5 * h), (0.5 * r, 0.92 * h), (0.0, h)], segs,
              mod=lambda th, i: 1 + 0.06 * math.sin(3 * th + 1.3) if i else 1.0)
    p.add(g, cm.soil)


def leaf_ring(p, material, base, count, length, width, pitch, yaw0=0.0, segs=4, shape='leaf', fold=0.3,
              bend=-0.2, jitter=0.0, serrate=0.0, skip=None, seed=1, materials=None):
    rng = random.Random(seed)
    for k in range(count):
        yaw = yaw0 + TAU * k / count + rng.uniform(-jitter, jitter)
        if skip and skip(yaw):
            continue
        mtl = materials[k % len(materials)] if materials else material
        pch = pitch + rng.uniform(-jitter, jitter) * 0.5
        ln = length * (1 + rng.uniform(-jitter, jitter) * 0.3)
        p.add(leaf(ln, width, segs, shape, fold, bend, serrate), mtl,
              leaf_frame(base, yaw, pch, roll=rng.uniform(-0.2, 0.2)))


def not_front(yaw, width=RAD(34)):
    d = (yaw - RAD(270) + math.pi) % TAU - math.pi
    return abs(d) < width


def crop_sprout(cm):
    p = Piece('crop_sprout')
    mound(p, cm, 0.18, 0.065, 10)
    top = Vector((0.0, -0.005, 0.19))
    p.add(tube(bez([(0, 0, 0.04), (0, 0, 0.12), top], 3), [0.026, 0.022, 0.018], sides=5, cap_end=True), cm.stem)
    for yaw in (RAD(8), RAD(172)):
        p.add(leaf(0.18, 0.13, 4, 'round', fold=0.35, bend=0.3), cm.leaf_light, leaf_frame(top, yaw, RAD(20)))
    return p


def crop_radish(cm):
    p = Piece('crop_radish')
    root = M('Crop radish', '#FF3C7C', 0.42)
    mound(p, cm)
    p.add(lathe([(0.1, 0.04), (0.15, 0.09), (0.172, 0.16), (0.156, 0.228), (0.104, 0.28), (0.044, 0.305),
                 (0.0, 0.31)], 12), root)
    leaf_ring(p, cm.leaf, (0, 0.01, 0.295), 5, 0.31, 0.155, RAD(60), yaw0=RAD(20), bend=-0.25, jitter=0.15,
              skip=lambda y: not_front(y, RAD(30)), seed=4)
    return p


def crop_carrot(cm):
    p = Piece('crop_carrot')
    root = M('Crop carrot', '#FF7A18', 0.45)
    ridge = M('Crop carrot ridge', '#E85D0C', 0.5)
    mound(p, cm, 0.22, 0.06, 12)
    # Half pulled up: the orange taper shows above the soil, with a darker growth ring.
    prof = [(0.055, 0.0), (0.085, 0.07), (0.106, 0.128), (0.1, 0.14), (0.12, 0.19), (0.132, 0.245),
            (0.122, 0.287), (0.08, 0.314), (0.0, 0.322)]
    p.add(lathe(prof, 10, tag=lambda b, s: 1 if b in (2, 3) else 0), {0: root, 1: ridge})
    leaf_ring(p, cm.leaf, (0, 0.0, 0.305), 5, 0.36, 0.17, RAD(68), yaw0=RAD(15), segs=8, serrate=0.62,
              fold=0.2, bend=-0.3, jitter=0.12, seed=7, materials=[cm.leaf, cm.leaf_light])
    return p


def crop_pumpkin(cm):
    p = Piece('crop_pumpkin')
    body = M('Crop pumpkin', '#FF7B16', 0.42)
    stem = M('Crop pumpkin stem', '#7A9A2C', 0.6)
    prof = [(0.0, 0.035), (0.15, 0.004), (0.25, 0.085), (0.255, 0.18), (0.158, 0.272), (0.0, 0.246)]

    def ribs(th, i):
        if i in (0, len(prof) - 1):
            return 1.0
        ph = (th * 8 / TAU) % 1.0
        return 0.86 + 0.14 * math.sin(math.pi * ph) ** 0.5
    p.add(lathe(prof, 32, mod=ribs).outward(), body, xf((0, 0.03, 0)))
    tip = Vector((0.065, 0.03, 0.36))
    p.add(tube(bez([(0, 0.03, 0.235), (0.0, 0.03, 0.335), tip], 3), [0.036, 0.029, 0.025], sides=5, cap_end=True),
          stem)
    p.add(leaf(0.22, 0.21, 4, 'round', fold=0.22, bend=-0.12), cm.leaf,
          leaf_frame((0.03, 0.06, 0.262), RAD(35), RAD(8)))
    curl = [(0.02 + 0.13 * t + 0.035 * math.sin(3.2 * math.pi * t) * (1 - 0.4 * t),
             0.0 - 0.035 * math.cos(3.2 * math.pi * t) * (1 - 0.4 * t),
             0.285 + 0.04 * math.sin(math.pi * t)) for t in (i / 10 for i in range(11))]
    p.add(tube(curl, [0.012] * 10 + [0.006], sides=3), cm.stem, xf((-0.02, -0.05, 0), (0, 0, RAD(200))))
    return p


def crop_mint(cm):
    p = Piece('crop_mint')
    mint = M('Crop mint', '#1CC47C', 0.5, sheet=True)
    mint_l = M('Crop mint light', '#5FE8A2', 0.5, sheet=True)
    # A low, dense dome of paired, toothed leaves; stems stay hidden under the leaves.
    stems = [((0.0, 0.02), 0.27, 0.0, 3), ((0.13, -0.07), 0.17, 0.7, 2), ((-0.13, -0.05), 0.18, 1.3, 2),
             ((0.1, 0.13), 0.17, 2.1, 2), ((-0.1, 0.12), 0.16, 2.7, 2)]
    for (x, y), h, rot, levels in stems:
        base, top = Vector((x * 0.4, y * 0.4, 0)), Vector((x, y, h))
        if levels == 3:  # only the centre stem shows; the outer sprigs hide theirs under the leaves
            p.add(tube([base, top], 0.016, sides=4), cm.stem)
        fs = (0.35, 0.7, 1.0) if levels == 3 else (0.5, 1.0)
        for level, f in enumerate(fs):
            pos = base.lerp(top, f)
            k = level + (3 - levels)
            ln, w, pitch = 0.2 - 0.03 * k, 0.165 - 0.025 * k, 6 + 17 * k
            for side in (0, 1):
                yaw = rot + level * math.pi / 2 + side * math.pi
                p.add(leaf(ln, w, 4, 'round', fold=0.42, bend=-0.08, serrate=0.1),
                      mint_l if f == 1.0 else mint, leaf_frame(pos, yaw, RAD(pitch), roll=0.1))
    return p


def crop_chili(cm):
    p = Piece('crop_chili')
    chili = M('Crop chili', '#F3232C', 0.28)
    p.add(tube([(0, 0, 0), (0, 0.01, 0.27)], [0.026, 0.019], sides=5), cm.stem)
    leaf_ring(p, cm.leaf, (0, 0.01, 0.19), 5, 0.19, 0.1, RAD(16), yaw0=RAD(40), jitter=0.2, bend=-0.2, seed=11)
    for k, yaw in enumerate((RAD(215), RAD(325), RAD(95))):
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        base = Vector((0, 0.01, 0.25)) + d * 0.05
        p.add(tube([Vector((0, 0.01, 0.24)), base + UP * 0.02], 0.012, sides=3), cm.stem)
        path = bez([base + UP * 0.02, base + d * 0.05 + UP * 0.12, base + d * 0.21 + UP * 0.1], 6)
        p.add(tube(path, [0.05, 0.054, 0.045, 0.032, 0.016, 0.0], sides=6, cap_start=True), chili)
        p.add(tube([base, base + (path[1] - path[0]).normalized() * 0.035], [0.054, 0.045], sides=5, cap_start=True),
              cm.stem)
    return p


def swirl(radius, n=28, rings=4, lobes=7, dome=0.035, back=0.03, arms=4):
    """A flat lollipop swirl: a polar grid whose rings twist, so arm borders spiral."""
    off = [0.0] * (rings + 1)
    for j in range(1, rings):
        ratio = j / (j + 1) / (0.9 if j + 1 == rings else 1.0)
        off[j + 1] = off[j] + 0.92 * math.acos(min(1.0, ratio))
    verts, ids = [(0.0, 0.0, dome)], [[0]]
    for j in range(1, rings + 1):
        f = j / rings
        ring = []
        for k in range(n):
            th = off[j] + TAU * k / n
            r = radius * f
            if j == rings:
                r *= 0.9 + 0.1 * abs(math.cos(lobes * th / 2)) ** 0.7
            ring.append(len(verts))
            verts.append((r * math.cos(th), r * math.sin(th), dome * (1 - f * f)))
        ids.append(ring)
    faces, tags = [], []

    def arm(k):
        return (k * arms // n) % 2
    for k in range(n):
        faces.append((0, ids[1][k], ids[1][(k + 1) % n]))
        tags.append(arm(k))
    for j in range(1, rings):
        for k in range(n):
            faces.append((ids[j][k], ids[j + 1][k], ids[j + 1][(k + 1) % n], ids[j][(k + 1) % n]))
            tags.append(arm(k))
    cb = len(verts)
    verts.append((0.0, 0.0, -back))
    for k in range(n):
        faces.append((cb, ids[rings][(k + 1) % n], ids[rings][k]))
        tags.append(2)
    return Geo(verts, faces, tags)


def crop_candy(cm):
    p = Piece('crop_candy')
    pink = M('Crop candy pink', '#FF4DA6', 0.38)
    white = M('Crop candy white', '#FFF5FB', 0.38)
    yellow = M('Crop candy yellow', '#FFD22E', 0.38)
    head = Vector((0, -0.02, 0.52))
    p.add(tube(bez([(0, 0.03, 0), (0, 0.05, 0.28), head + Vector((0, 0.03, -0.04))], 3), [0.025, 0.021, 0.019],
               sides=5), cm.stem)
    for yaw in (RAD(20), RAD(160)):
        p.add(leaf(0.19, 0.11, 4, 'leaf', fold=0.3, bend=-0.1), cm.leaf, leaf_frame((0, 0.038, 0.13), yaw, RAD(30)))
    frame = facing(head, toward(tilt=0.75), spin=0.3)
    p.add(swirl(0.215), {0: pink, 1: white, 2: pink}, frame)
    p.add(uvsphere(6, 4, (0.038, 0.038, 0.032), (0, 0, 0.037)), yellow, frame)
    return p


def crop_bean(cm):
    p = Piece('crop_bean')
    stake = M('Crop stake', '#C98B4E', 0.7)
    shield = M('Crop bean shield', '#1FAE6A', 0.5, sheet=True)
    pod = M('Crop bean pod', '#93E23C', 0.42, sheet=True)  # also the shield leaf's rim (a sheet)
    sx, sy = 0.02, 0.1
    p.add(lathe([(0.02, 0.0), (0.02, 0.6), (0.0, 0.645)], 6), stake, xf((sx, sy, 0)))
    helix = [(sx + 0.04 * math.cos(3.4 * math.pi * t), sy + 0.04 * math.sin(3.4 * math.pi * t), 0.03 + 0.55 * t)
             for t in (i / 11 for i in range(12))]
    p.add(tube(helix, 0.015, sides=3), cm.stem)
    # The shield leaf: lime rim, deep green field, facing the camera.
    sframe = facing((0.0, -0.1, 0.36), toward(tilt=0.85))
    p.add(disc(shield_outline(0.3, 0.34), rings=2, dome=0.03, fracs=(0.8, 1.0),
               tag=lambda k, i: 1 if k == 1 else 0), {0: shield, 1: pod}, sframe)
    p.add(tube([(0.0, -0.06, 0.52), (sx, sy - 0.03, 0.47)], 0.012, sides=3), cm.stem)
    for side, (x, y, z), ln in ((-1, (-0.16, 0.02, 0.54), 0.22), (1, (0.17, 0.02, 0.48), 0.22),
                                (1, (0.15, 0.1, 0.26), 0.17)):
        s = Vector((x, y, z))
        path = bez([s, s + Vector((side * 0.03, -0.02, -ln * 0.5)), s + Vector((side * 0.07, -0.05, -ln))], 7)
        p.add(tube(path, [0.0, 0.034, 0.042, 0.034, 0.042, 0.034, 0.0], sides=5, flatten=0.75), pod)
        p.add(tube([s + Vector((0, 0, 0.005)), Vector((sx + 0.04 * side, sy - 0.02, z + 0.03))], 0.01, sides=3),
              cm.stem)
    for yaw, z in ((RAD(20), 0.2), (RAD(150), 0.4)):
        p.add(leaf(0.14, 0.11, 3, 'round', fold=0.3, bend=-0.15), cm.leaf, leaf_frame((sx, sy, z), yaw, RAD(20)))
    return p


def crop_star(cm):
    p = Piece('crop_star')
    star = M('Crop star fruit', '#FFCF1C', 0.33)
    leaf_ring(p, cm.leaf, (0, 0.02, 0.0), 5, 0.21, 0.11, RAD(24), yaw0=RAD(60), jitter=0.2, bend=-0.25, seed=5)
    specs = [((0.0, -0.03, 0.54), 0.145, 0.0), ((-0.19, 0.05, 0.37), 0.11, 0.35), ((0.19, 0.03, 0.31), 0.105, -0.3)]
    for pos, r, spin in specs:
        pos = Vector(pos)
        p.add(tube(bez([(0, 0.02, 0.0), (pos.x * 0.3, 0.03, pos.z * 0.6), pos + Vector((0, 0.02, -r * 0.5))], 3),
                   0.013, sides=4), cm.stem)
        h = r * 0.5
        g = puff(star_outline(5, r, r * 0.5), [(0.78, -0.35 * h), (1.0, 0.0), (0.62, 0.55 * h)], -0.5 * h, 0.85 * h)
        p.add(g, star, facing(pos, toward((spin * 0.3, 0), 0.8), spin=spin * 0.3))
    return p


def crop_berry(cm):
    p = Piece('crop_berry')
    berry = M('Crop strawberry', '#F2213E', 0.33)
    white = M('Crop blossom white', '#FFFFFF', 0.5, sheet=True)
    centre = M('Crop flower centre', '#FFC21E', 0.5)
    for yaw in (RAD(90), RAD(205), RAD(335)):
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        tip = d * 0.11 + UP * 0.19
        p.add(tube([d * 0.01, d * 0.06 + UP * 0.13, tip], [0.013, 0.011, 0.009], sides=3), cm.stem)
        for dy in (-0.95, 0.0, 0.95):
            p.add(leaf(0.15, 0.13, 3, 'oval', fold=0.32, bend=-0.1), cm.leaf, leaf_frame(tip, yaw + dy, RAD(12)))
    prof = [(0.0, 0.0), (0.03, 0.02), (0.058, 0.06), (0.064, 0.098), (0.047, 0.123), (0.0, 0.13)]
    for (x, y, z), tilt, yaw in (((-0.14, -0.12, 0.02), 1.15, RAD(220)), ((0.13, -0.15, 0.02), 1.2, RAD(310)),
                                 ((0.0, -0.05, 0.08), 0.8, RAD(275))):
        rot = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-tilt, 4, 'Y')
        place = Matrix.Translation((x, y, z + 0.06)) @ rot @ Matrix.Translation((0, 0, -0.13))
        p.add(lathe(prof, 8).outward(), berry, place)
        p.add(disc(star_outline(5, 0.055, 0.022), dome=0.012), cm.leaf, place @ xf((0, 0, 0.13)))
    for (x, y, z), r in (((0.12, 0.04, 0.25), 0.065), ((-0.1, 0.1, 0.28), 0.06)):
        frame = facing((x, y, z), toward((x, 0), 0.5))
        p.add(disc(lobed(5, 3, 0.55 * r, r, 0.6), dome=-0.01), white, frame)
        p.add(lathe([(0.32 * r, 0.0), (0.0, 0.2 * r)], 5), centre, frame @ xf((0, 0, -0.004)))
    return p


def crop_coffee(cm):
    p = Piece('crop_coffee')
    cleaf = M('Crop coffee leaf', '#1BA852', 0.35, sheet=True)
    cherry = M('Crop coffee cherry', '#E8213A', 0.3)
    ripe = M('Crop coffee cherry ripe', '#A3162F', 0.3)
    bark = M('Crop coffee stem', '#8A5530', 0.7)
    p.add(tube(bez([(0, 0.02, 0), (0.02, 0.02, 0.3), (0.0, 0.02, 0.58)], 3), [0.032, 0.024, 0.015], sides=5), bark)
    tiers = [(0.13, 5, 0.23, 2, 0.3), (0.27, 4, 0.2, 10, RAD(45)), (0.41, 3, 0.16, 22, RAD(20)),
             (0.54, 2, 0.11, 45, RAD(70))]
    for z, count, ln, pitch, yaw0 in tiers:
        for k in range(count):
            yaw = yaw0 + TAU * k / count
            p.add(leaf(ln, 0.11, 4, 'leaf', fold=0.35, bend=-0.28), cleaf,
                  leaf_frame((0.01, 0.02, z), yaw, RAD(pitch), roll=0.15))
    for z, yaw, dist in ((0.2, RAD(250), 0.085), (0.34, RAD(315), 0.08), (0.3, RAD(170), 0.08)):
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        c = Vector((0.01, 0.02, z)) + d * dist
        side = Vector((-d.y, d.x, 0))
        for j, off in enumerate((side * 0.04, -side * 0.04, d * 0.03 + UP * 0.04)):
            p.add(ico0(0.047, c + off), ripe if j == 2 else cherry)
    return p


def crop_moonflower(cm):
    p = Piece('crop_moonflower')
    petal = M('Crop moonflower', '#EEF8FF', 0.45, emit='#D6ECFF', strength=0.7, sheet=True)
    star = M('Crop moonflower star', '#8CCBFF', 0.45, emit='#8CCBFF', strength=0.8, sheet=True)
    centre = M('Crop moonflower centre', '#FFF1A0', 0.4, emit='#FFE680', strength=1.0)
    mleaf = M('Crop moon leaf', '#1A9C7E', 0.5, sheet=True)
    head = Vector((0.0, -0.02, 0.44))
    p.add(tube(bez([(0, 0.05, 0), (0, 0.07, 0.22), head + Vector((0, 0.02, -0.03))], 3), [0.021, 0.018, 0.016],
               sides=5), cm.stem)
    frame = facing(head, toward(tilt=0.7))

    def rim(th, i):
        return (0.8 + 0.2 * math.cos(5 * th)) if i >= 2 else 1.0
    segs = 20
    trumpet = lathe([(0.03, 0.0), (0.066, 0.05), (0.145, 0.1), (0.24, 0.125)], segs, mod=rim,
                    tag=lambda b, s: 1 if math.cos(5 * TAU * s / segs) > 0.7 else 0)
    p.add(trumpet, {0: petal, 1: star}, frame)
    p.add(uvsphere(6, 3, (0.036, 0.036, 0.032), (0, 0, 0.032)), centre, frame)
    bud_base = Vector((0.16, 0.08, 0.16))
    p.add(tube([(0.0, 0.06, 0.12), bud_base], 0.011, sides=3), cm.stem)
    bud = lathe([(0.0, 0.0), (0.038, 0.045), (0.032, 0.1), (0.0, 0.155)], 6)
    p.add(bud.outward(), petal, Matrix.Translation(bud_base) @ Matrix.Rotation(RAD(-35), 4, 'Y'))
    for yaw, pos, s in ((RAD(200), (-0.07, 0.03, 0.05), 0.17), (RAD(330), (0.07, 0.0, 0.045), 0.16),
                        (RAD(95), (0.0, 0.1, 0.09), 0.15)):
        p.add(disc(heart_outline(12, s), dome=0.014), mleaf, leaf_frame(pos, yaw, RAD(18)))
    return p


def crop_magnetmelon(cm):
    p = Piece('crop_magnetmelon')
    red = M('Crop magnet red', '#EE2A36', 0.35)
    silver = M('Crop magnet silver', '#E6EDF5', 0.28, metal=0.3)
    prof = [(0.0, 0.006), (0.105, 0.03), (0.178, 0.104), (0.205, 0.2), (0.178, 0.296), (0.105, 0.366),
            (0.0, 0.378)]
    p.add(lathe(prof, 20, tag=lambda b, s: (s // 2) % 2).outward(), {0: red, 1: silver}, xf((0, 0.02, 0)))
    # A little horseshoe magnet grows on top as the stalk: red bend, silver tips.
    w, z0 = 0.06, 0.44
    pts = [(-w, 0.0, 0.575), (-w, 0.0, 0.51), (-w, 0.0, z0)]
    pts += [(-w * math.cos(a), 0.0, z0 - w * math.sin(a)) for a in (RAD(40), RAD(90), RAD(140))]
    pts += [(w, 0.0, z0), (w, 0.0, 0.51), (w, 0.0, 0.575)]
    horseshoe = tube(pts, 0.026, sides=6, cap_start=True, cap_end=True, tag=lambda b: 1 if b in (0, 7) else 0)
    p.add(horseshoe, {0: red, 1: silver}, xf((0, 0.0, -0.01), (0, 0, RAD(-12))))
    p.add(tube([(0, 0.02, 0.36), (0, 0.0, 0.4)], 0.016, sides=4), cm.stem)
    p.add(leaf(0.17, 0.13, 4, 'round', fold=0.25, bend=-0.15), cm.leaf,
          leaf_frame((0.03, 0.05, 0.36), RAD(40), RAD(12)))
    return p


def crop_melon(cm):
    p = Piece('crop_melon')
    light = M('Crop melon light', '#98E452', 0.42)
    dark = M('Crop melon dark', '#1C8A3B', 0.42)
    segs = 16
    g = uvsphere(segs, 8, (1, 1, 1), wave=lambda lat: 0.32 * (TAU / segs) * math.sin(4 * lat))
    g.tags = [t % 2 for t in g.tags]
    body = xf((-0.04, 0.03, 0.175), (0, RAD(90), RAD(8)), (0.19, 0.2, 0.285))
    p.add(g, {0: light, 1: dark}, body)
    end = body @ Vector((0, 0, 1.0))
    p.add(tube([end, end + Vector((0.025, 0.0, 0.05))], [0.016, 0.012], sides=4, cap_end=True), cm.stem)
    curl = [(0.02 + 0.022 * math.sin(3 * math.pi * t), 0.07 * t + 0.022 * math.cos(3 * math.pi * t) - 0.022,
             0.05 + 0.03 * math.sin(math.pi * t)) for t in (i / 9 for i in range(10))]
    p.add(tube([end + Vector(c) for c in curl], [0.011] * 9 + [0.005], sides=3), cm.stem)
    p.add(leaf(0.16, 0.13, 4, 'round', fold=0.25, bend=-0.15), cm.leaf,
          leaf_frame(end + Vector((-0.02, 0.03, 0.02)), RAD(115), RAD(-5)))
    return p


def crop_clover(cm):
    p = Piece('crop_clover')
    clover = M('Crop clover', '#1FC24A', 0.5, sheet=True)
    light = M('Crop clover light', '#94F27E', 0.5, sheet=True)
    head = Vector((0.0, -0.03, 0.4))
    p.add(tube(bez([(0, 0.04, 0), (0, 0.06, 0.22), head], 3), [0.02, 0.017, 0.015], sides=4), cm.stem)
    frame = facing(head, toward(tilt=0.8))
    for k in range(4):
        yaw = RAD(45) + k * math.pi / 2
        p.add(disc(heart_outline(12, 0.17), rings=2, dome=0.014, fracs=(0.55, 1.0),
                   tag=lambda r, i: 0 if r == 0 else 1),
              {0: light, 1: clover}, frame @ leaf_frame((0, 0, 0.002), yaw, RAD(8)))
    for (x, y, h, s, rot) in ((-0.18, 0.06, 0.2, 0.12, 0.3), (0.18, 0.08, 0.17, 0.115, 1.1),
                              (0.03, 0.19, 0.24, 0.115, 2.0)):
        top = Vector((x, y, h))
        p.add(tube([Vector((x * 0.6, y * 0.6, 0)), top], 0.013, sides=4), cm.stem)
        for k in range(3):
            yaw = rot + k * TAU / 3
            p.add(disc(heart_outline(10, s), dome=0.012), clover, leaf_frame(top, yaw, RAD(12)))
    return p


def mushroom_cap(p, cap_mat, stem_mat, pos, stem_h, r, cap_h, segs, spots=None, spot_mat=None, lean=0.0):
    base = Vector(pos)
    tilt = xf(base, (lean, 0, 0))
    p.add(lathe([(0.32 * r, 0.0), (0.24 * r, 0.5 * stem_h), (0.27 * r, stem_h)], max(6, segs - 4)), stem_mat, tilt)
    prof = [(0.3 * r, stem_h - 0.012), (r, stem_h + 0.01), (1.0 * r, stem_h + 0.03), (0.78 * r, stem_h + 0.62 * cap_h),
            (0.0, stem_h + cap_h)]
    p.add(lathe(prof, segs), cap_mat, tilt)
    for ang, t, sr in spots or []:
        a, b = Vector(prof[3]), Vector(prof[4])
        if t < 0:
            a, b, t = Vector(prof[2]), Vector(prof[3]), -t
        rr, z = a.lerp(b, t)
        slope = b - a
        n2 = Vector((slope.y, -slope.x)).normalized()
        if n2.y < 0:
            n2 = -n2
        nrm = Vector((n2.x * math.cos(ang), n2.x * math.sin(ang), n2.y))
        pos3 = Vector((rr * math.cos(ang), rr * math.sin(ang), z)) + nrm * 0.004
        p.add(disc(lobed(6, 1, sr, sr), dome=0.005), spot_mat, tilt @ facing(pos3, nrm))


def crop_glowshroom(cm):
    p = Piece('crop_glowshroom')
    cap = M('Crop glowshroom cap', '#2BE3FF', 0.4, emit='#2BE3FF', strength=0.85)
    spots = M('Crop glowshroom spots', '#F4FFFF', 0.4, emit='#E8FFFF', strength=1.0)
    stem = M('Crop glowshroom stem', '#E2F7F3', 0.5, emit='#9EF4FF', strength=0.18)
    mushroom_cap(p, cap, stem, (0.03, 0.05, 0), 0.3, 0.155, 0.14, 12,
                 [(RAD(-90), 0.35, 0.028), (RAD(-30), 0.5, 0.022), (RAD(-150), 0.55, 0.024), (RAD(60), 0.4, 0.024),
                  (RAD(-90), -0.55, 0.02)], spots, lean=0.08)
    mushroom_cap(p, cap, stem, (-0.17, -0.07, 0), 0.19, 0.105, 0.1, 10,
                 [(RAD(-80), 0.35, 0.02), (RAD(-160), 0.5, 0.016)], spots, lean=-0.2)
    mushroom_cap(p, cap, stem, (0.17, -0.13, 0), 0.1, 0.075, 0.075, 8, [(RAD(-100), 0.4, 0.016)], spots,
                 lean=-0.25)
    return p


def crop_iceberry(cm):
    p = Piece('crop_iceberry')
    berry = M('Crop ice berry', '#3AA8FF', 0.25)
    crystal = M('Crop ice crystal', '#C4F3FF', 0.15, emit='#A8EEFF', strength=0.4)
    fleaf = M('Crop frost leaf', '#6CD8C4', 0.5, sheet=True)
    leaf_ring(p, fleaf, (0, 0.02, 0.02), 5, 0.21, 0.11, RAD(20), yaw0=RAD(30), jitter=0.2, bend=-0.2, seed=9)
    clusters = [(-0.07, -0.04, 0.24), (0.1, 0.06, 0.2)]
    for x, y, z in clusters:
        c = Vector((x, y, z))
        p.add(tube([Vector((0, 0.02, 0.02)), c + Vector((0, 0.02, 0.02))], 0.013, sides=4), fleaf)
        offs = (Vector((0.0, 0.0, 0.035)), Vector((0.06, -0.025, -0.01)), Vector((-0.057, -0.03, -0.012)))
        for j, o in enumerate(offs[:3 if x < 0 else 2]):
            p.add(blob_geo(dict(c=c + o, r=(0.062, 0.062, 0.058), segs=8, lats=LATS_LO, phase=j)), berry)
    for (x, y), h, lean in (((0.22, -0.1), 0.22, (0.3, -0.2)), ((-0.23, 0.02), 0.18, (-0.35, 0.1)),
                            ((0.05, 0.21), 0.14, (0.1, 0.35))):
        g = lathe([(0.04, 0.0), (0.044, 0.68 * h), (0.0, h)], 6, phase=0.3)
        p.add(g.outward(), crystal, xf((x, y, 0), (lean[1], lean[0], 0)))
    return p


def crop_goldcorn(cm):
    p = Piece('crop_goldcorn')
    gold = M('Crop corn gold', '#FFC21A', 0.3, metal=0.12, emit='#FFB000', strength=0.12)
    husk = M('Crop corn husk', '#A8E35A', 0.5, sheet=True)
    tassel = M('Crop corn tassel', '#F6D35E', 0.55)
    p.add(tube([(0, 0.06, 0), (0, 0.06, 0.4), (0.01, 0.06, 0.8)], [0.032, 0.025, 0.016], sides=5), cm.stem)
    for z, yaw, ln in ((0.1, RAD(20), 0.3), (0.18, RAD(160), 0.3), (0.56, RAD(80), 0.24), (0.66, RAD(250), 0.2)):
        p.add(leaf(ln, 0.08, 5, 'strap', fold=0.3, bend=-0.55), cm.leaf, leaf_frame((0, 0.06, z), yaw, RAD(62)))
    for k in range(4):
        yaw = RAD(30 + 90 * k)
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        base = Vector((0.01, 0.06, 0.78))
        p.add(tube([base, base + d * 0.05 + UP * 0.1], [0.009, 0.0], sides=3), tassel)
    prof = [(0.0, 0.0), (0.05, 0.02), (0.068, 0.07), (0.07, 0.14), (0.058, 0.2), (0.03, 0.245), (0.0, 0.26)]
    for base, axis in (((0.02, 0.05, 0.3), (0.55, -0.3, 0.78)), ((-0.02, 0.05, 0.42), (-0.5, -0.35, 0.8))):
        frame = facing(base, axis, up=(0, 1, 0))
        cob = lathe(prof, 10, mod=lambda th, i: 1.0 + 0.07 * (1 if (round(th / (TAU / 10)) + i) % 2 else -1))
        p.add(cob.outward(), gold, frame)
        for k in range(3):
            yaw = RAD(90 + 120 * k)
            p.add(leaf(0.15, 0.085, 3, 'leaf', fold=0.4, bend=-0.3), husk, frame @ leaf_frame((0, 0, 0.02), yaw,
                                                                                                RAD(58)))
    return p


def crop_dragonfruit(cm):
    p = Piece('crop_dragonfruit')
    fruit = M('Crop dragonfruit', '#FF2D98', 0.38)
    tip = M('Crop dragonfruit tip', '#A5E22C', 0.45, sheet=True)
    cactus = M('Crop cactus', '#27B25C', 0.5)

    def ribs(th, i):
        return 0.72 + 0.28 * abs(math.cos(1.5 * th)) if 0 < i < 4 else 1.0
    p.add(lathe([(0.085, 0.0), (0.095, 0.08), (0.09, 0.16), (0.062, 0.21), (0.0, 0.225)], 12,
                mod=ribs).outward(), cactus)
    for side in (-1, 1):
        s = Vector((0.07 * side, 0.0, 0.1 + 0.02 * side))
        path = bez([s, s + Vector((0.09 * side, -0.01, 0.0)), s + Vector((0.11 * side, -0.02, 0.11))], 4)
        p.add(tube(path, [0.04, 0.04, 0.035, 0.0], sides=6, ang0=0.3), cactus)
    body = lathe([(0.0, 0.2), (0.09, 0.22), (0.142, 0.3), (0.14, 0.39), (0.095, 0.47), (0.0, 0.505)], 12)
    p.add(body.outward(), fruit)
    rng = random.Random(3)
    for k in range(8):
        upper = k >= 4
        yaw = RAD(20) + TAU * (k % 4) / 4 + (RAD(45) if upper else 0)
        z, rr = (0.42, 0.118) if upper else (0.3, 0.142)
        base = Vector((rr * math.cos(yaw), rr * math.sin(yaw), z))
        p.add(leaf(0.12 + rng.uniform(-0.01, 0.01), 0.09, 3, 'leaf', fold=0.3, bend=-0.35,
                   tag=lambda b: 1 if b >= 1 else 0), {0: fruit, 1: tip},
              leaf_frame(base, yaw, RAD(64 if upper else 48)))
    return p


def crop_rainbowrose(cm):
    p = Piece('crop_rainbowrose')
    colours = [M('Crop rose red', '#FF3043', 0.45, sheet=True), M('Crop rose orange', '#FF8A1C', 0.45, sheet=True),
               M('Crop rose yellow', '#FFD82A', 0.45, sheet=True), M('Crop rose blue', '#2FA8FF', 0.45, sheet=True),
               M('Crop rose violet', '#9A55FF', 0.45, sheet=True)]
    head = Vector((0.0, -0.03, 0.47))
    p.add(tube(bez([(0, 0.05, 0), (0.0, 0.07, 0.25), head + Vector((0, 0.02, -0.05))], 3), [0.02, 0.017, 0.015],
               sides=5), cm.leaf)
    for yaw, z in ((RAD(15), 0.18), (RAD(165), 0.27)):
        p.add(leaf(0.18, 0.11, 4, 'leaf', fold=0.3, bend=-0.15, serrate=0.25), cm.leaf,
              leaf_frame((0, 0.06, z), yaw, RAD(25)))
    frame = facing(head, toward(tilt=0.72))
    # An open rose seen from above: concentric cupped petal rings, red outside to violet inside,
    # each ring opener than a real rose so every band shows at icon size.
    rings = [(6, 0.035, 0.175, 0.15, 12, 0.12, 0.0), (5, 0.03, 0.14, 0.13, 28, 0.16, 0.45),
             (5, 0.024, 0.11, 0.105, 42, 0.2, 0.1), (4, 0.016, 0.082, 0.085, 56, 0.26, 0.6)]
    for ci, (count, r0, ln, w, pitch, bend, yaw0) in enumerate(rings):
        lift = 0.012 * ci
        for k in range(count):
            yaw = yaw0 + TAU * k / count
            base = Vector((r0 * math.cos(yaw), r0 * math.sin(yaw), lift))
            p.add(leaf(ln, w, 3, 'rpetal', fold=0.7, bend=bend, tip=0.1), colours[ci],
                  leaf_frame(base, yaw, RAD(pitch), parent=frame))
    bud = lathe([(0.0, 0.02), (0.046, 0.045), (0.04, 0.085), (0.0, 0.115)], 7)
    p.add(bud.outward(), colours[4], frame)
    return p


CROP_BUILDERS = dict(radish=crop_radish, carrot=crop_carrot, pumpkin=crop_pumpkin, mint=crop_mint, chili=crop_chili,
                     candy=crop_candy, bean=crop_bean, star=crop_star, berry=crop_berry, coffee=crop_coffee,
                     moonflower=crop_moonflower, magnetmelon=crop_magnetmelon, melon=crop_melon,
                     clover=crop_clover, glowshroom=crop_glowshroom, iceberry=crop_iceberry,
                     goldcorn=crop_goldcorn, dragonfruit=crop_dragonfruit, rainbowrose=crop_rainbowrose)


def build_crops():
    cm = CropMats()
    out = {'crop_sprout': crop_sprout(cm).build()}
    for cid in CROP_IDS:
        out['crop_' + cid] = CROP_BUILDERS[cid](cm).build()
    return out


# ================================================================ contract
SCENERY_CONTRACT = {
    'tree_blossom': dict(mats={'Bark', 'Blossom A', 'Blossom B'}, tris=600, h=(3.35, 3.85), r=(1.4, 1.8)),
    'tree_round': dict(mats={'Bark', 'Leaf A', 'Leaf B'}, tris=600, h=(3.35, 3.85), r=(1.4, 1.8)),
    'tree_pine': dict(mats={'Bark', 'Pine A', 'Pine B'}, tris=400, h=(3.55, 4.05), r=(1.1, 1.5)),
    'bush': dict(mats={'Leaf A', 'Leaf B', 'Berry'}, tris=300, r=(0.5, 0.7)),
    'flowers': dict(mats=None, tris=250, r=(0.28, 0.42)),
    'tuft': dict(mats={'Grass'}, tris=40, h=(0.32, 0.48)),
    'rock': dict(mats={'Rock'}, tris=120, r=(0.65, 0.92)),
    'stone_step': dict(mats={'Step stone'}, tris=60, r=(0.33, 0.48), hmax=0.08),
    'fence': dict(mats={'Fence post', 'Fence rail'}, tris=150, h=(0.95, 1.05), xmax=1.12),
    'gate': dict(mats={'Fence post', 'Fence rail', 'Sign'}, tris=300, h=(3.0, 3.15), xmax=1.95),
    'mushroom': dict(mats={'Mushroom cap', 'Mushroom spots', 'Mushroom stem'}, tris=120, h=(0.3, 0.4)),
}


def node_stats(obj):
    me = obj.data
    me.calc_loop_triangles()
    co = [v.co for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    return dict(triangles=len(me.loop_triangles), vertices=len(co), materials=[m.name for m in me.materials],
                bounds=dict(min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi],
                            size=[round(hi[i] - lo[i], 4) for i in range(3)]),
                radius_xy=round(max(math.hypot(c.x, c.y) for c in co), 4))


def check_scenery(name, s):
    c = SCENERY_CONTRACT[name]
    errors = []
    if s['triangles'] > c['tris']:
        errors.append(f"{s['triangles']} triangles > {c['tris']}")
    mats = set(s['materials'])
    if c['mats'] is None:
        want = {'Stem', 'Flower centre'}
        if not want <= mats or not all(m in want or m.startswith('Petal ') for m in mats):
            errors.append(f'materials {sorted(mats)}')
    elif mats != c['mats']:
        errors.append(f"materials {sorted(mats)} != {sorted(c['mats'])}")
    lo, hi = s['bounds']['min'], s['bounds']['max']
    if not -0.02 <= lo[2] <= 0.005:
        errors.append(f'base z {lo[2]}')
    if 'h' in c and not c['h'][0] <= hi[2] <= c['h'][1]:
        errors.append(f"height {hi[2]} outside {c['h']}")
    if 'hmax' in c and hi[2] > c['hmax']:
        errors.append(f"height {hi[2]} > {c['hmax']}")
    if 'r' in c and not c['r'][0] <= s['radius_xy'] <= c['r'][1]:
        errors.append(f"radius {s['radius_xy']} outside {c['r']}")
    if 'xmax' in c and max(abs(lo[0]), abs(hi[0])) > c['xmax']:
        errors.append(f"x extent {max(abs(lo[0]), abs(hi[0]))} > {c['xmax']}")
    return errors


def check_crop(name, s):
    errors = []
    lo, hi = s['bounds']['min'], s['bounds']['max']
    if s['triangles'] > 400:
        errors.append(f"{s['triangles']} triangles > 400")
    if not 2 <= len(s['materials']) <= 6:
        errors.append(f"{len(s['materials'])} materials")
    if max(abs(lo[0]), abs(hi[0]), abs(lo[1]), abs(hi[1])) > 0.35:
        errors.append(f'footprint x {lo[0]}..{hi[0]} y {lo[1]}..{hi[1]} beyond 0.7 x 0.7')
    limit = 0.35 if name == 'crop_sprout' else 0.9
    if hi[2] > limit:
        errors.append(f'height {hi[2]} > {limit}')
    if not -0.02 <= lo[2] <= 0.01:
        errors.append(f'base z {lo[2]}')
    return errors


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


def report(title, stats):
    print(f'\n== {title}')
    for name, s in stats.items():
        b = s['bounds']
        print(f"  {name:18s} {s['triangles']:4d} tris  r {s['radius_xy']:.3f}  z {b['min'][2]:.3f}..{b['max'][2]:.3f}"
              f"  x {b['min'][0]:.2f}..{b['max'][0]:.2f} y {b['min'][1]:.2f}..{b['max'][1]:.2f}  {s['materials']}")


# ================================================================= previews
def _eevee(samples=32):
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.6),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def _preview_studio(size, ground='#7DD957'):
    """style.studio toned like build_props previews: the game lights with a hemisphere and a sun and
    has no glossy sky, so a dimmer world and -0.4 EV read closer to the browser."""
    studio(ground_color=ground, size=size)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.55
    scene.view_settings.exposure = -0.4
    _eevee(48)


def _place_copy(obj, loc, rz=0.0, scale=1.0):
    o = obj.copy()
    bpy.context.scene.collection.objects.link(o)
    o.hide_render = False
    o.location = loc
    o.rotation_euler = (0, 0, rz)
    o.scale = (scale, scale, scale)
    return o


def _aim(cam, target, ortho, size):
    tx, ty, tz = target
    cam.location = (tx, ty - 25.4, tz + 23.0)
    cam.data.ortho_scale = ortho
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = size


def preview_scenery(objs):
    _preview_studio((1600, 900))
    back = [('tree_blossom', -7.2), ('tree_round', -3.5), ('tree_pine', 0.0), ('gate', 4.1), ('fence', 8.3)]
    front = [('bush', -7.0), ('flowers', -5.3), ('tuft', -4.0), ('rock', -2.2), ('stone_step', -0.3),
             ('mushroom', 1.0)]
    for name, x in back:
        objs[name].location = (x, 3.0, 0)
    for name, x in front:
        objs[name].location = (x, -1.4, 0)
    cam = game_camera(target=(0.4, 1.1, 1.2), ortho_scale=18.5)
    render(os.path.join(PREVIEWS, 'scenery.webp'))
    # Close-ups: trees, then the small pieces.
    _aim(cam, (-3.6, 3.0, 1.8), 11.5, (1800, 800))
    render(os.path.join(PREVIEWS, 'scenery-trees.webp'))
    _aim(cam, (-3.0, -1.4, 0.3), 9.6, (1600, 600))
    render(os.path.join(PREVIEWS, 'scenery-small.webp'))
    for o in objs.values():
        o.hide_render = True
    # A game-scale meadow for judging the kit in context (game zoom: 21 units tall).
    rng = random.Random(4)
    bpy.data.objects['Preview ground'].data.materials[0] = mat('Preview lawn', '#75E444', 0.9)

    def free(x, y, r, taken):
        return all(math.hypot(x - a, y - b) > r + rr for a, b, rr in taken)
    taken = []
    for i in range(38):
        x, y = rng.uniform(-17, 17), rng.uniform(-6, 16)
        if not free(x, y, 1.4, taken) or abs(x) < 2.2 or 9.2 < y < 12.8:
            continue
        kind = rng.choice(['tree_round', 'tree_round', 'tree_blossom', 'tree_pine', 'bush', 'bush'])
        s = rng.uniform(0.7, 1.4) if kind.startswith('tree') else 1.0
        _place_copy(objs[kind], (x, y, 0), rng.uniform(0, TAU), s)
        taken.append((x, y, 1.2 * s if kind.startswith('tree') else 0.6))
    for i in range(90):
        x, y = rng.uniform(-17, 17), rng.uniform(-9, 14)
        if not free(x, y, 0.3, taken) or abs(x) < 1.6 or 10.4 < y < 11.6:
            continue
        kind = rng.choice(['flowers', 'flowers', 'tuft', 'tuft', 'tuft', 'mushroom'] if i % 9 else ['rock'])
        _place_copy(objs[kind], (x, y, 0), rng.uniform(0, TAU), rng.uniform(0.9, 1.3) if kind != 'rock' else 0.8)
        taken.append((x, y, 0.3))
    for k in range(9):
        _place_copy(objs['stone_step'], (rng.uniform(-0.25, 0.25), -8 + k * 1.25, 0), rng.uniform(0, TAU))
    for k in range(-4, 5):
        if k == 0:
            continue
        _place_copy(objs['fence'], (k * 2.09 + (1.05 if k < 0 else -1.05), 11.0, 0), 0.0)
    _place_copy(objs['gate'], (0, 11.0, 0))
    _aim(cam, (0, 3.5, 0), 21, (1440, 900))
    render(os.path.join(PREVIEWS, 'scenery-scene.webp'))


def preview_crops(objs):
    _preview_studio((1500, 1000))
    soil = mat('Preview soil', '#6A3F2A', 0.9)
    bpy.data.objects['Preview ground'].location.z -= 0.02  # keep the soil tiles off the lawn plane
    names = ['crop_sprout'] + ['crop_' + c for c in CROP_IDS]
    cols = 5
    for i, name in enumerate(names):
        x, y = (i % cols - 2) * 1.0, -(i // cols - 1.5) * 1.0
        objs[name].location = (x, y, 0)
        style.box('Soil ' + name, (0.86, 0.86, 0.06), (x, y, -0.03), soil, bev=0.02)
    cam = game_camera(target=(0, 0, 0.3), ortho_scale=5.2)
    render(os.path.join(PREVIEWS, 'crops.webp'))
    # The same bed grid at the game's zoom (~43 px per metre).
    _aim(cam, (0, 0, 0.3), 21 * 300 / 900, (450, 300))
    render(os.path.join(PREVIEWS, 'crops-game-scale.webp'))


# ==================================================================== icons
def icon_camera(obj, elevation=34, yaw=24, margin=1.1):
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
    pts = [inv @ (obj.matrix_world @ v.co) for v in obj.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    right, up = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)), cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    cam.location = cam.location + right * (x0 + x1) / 2 + up * (y0 + y1) / 2
    data.ortho_scale = max(x1 - x0, y1 - y0) * margin
    bpy.context.scene.camera = cam
    return cam


def render_icons(objs):
    studio(size=(160, 160), transparent=True)
    _eevee(48)
    # A dimmer sky than the shared studio keeps icon colours saturated on cream cards.
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
    scene = bpy.context.scene
    scene.render.filter_size = 1.2
    os.makedirs(ICONS, exist_ok=True)
    written = {}
    for name, obj in objs.items():
        for o in objs.values():
            o.hide_render = o is not obj
        cid = name[len('crop_'):]
        cam = icon_camera(obj)
        path = os.path.join(ICONS, cid + '.webp')
        scene.render.image_settings.file_format = 'WEBP'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.image_settings.quality = 88
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
        written[cid] = os.path.getsize(path)
    return written


def contact_sheet(ids, out_path):
    """All icons on cream cards: full size on top, the ~52 px UI size underneath."""
    import numpy as np
    cell, small, pad = 176, 52, 8
    cols = 5
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

    for i, cid in enumerate(ids):
        img = bpy.data.images.load(os.path.join(ICONS, cid + '.webp'))
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


# ===================================================================== main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(only=None, install=False, render=False)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--only':
            opts['only'] = argv[i + 1]
            i += 1
        elif a.startswith('--only='):
            opts['only'] = a.split('=', 1)[1]
        elif a == '--install':
            opts['install'] = True
        elif a == '--render':
            opts['render'] = True
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    if opts['only'] not in (None, 'scenery', 'crops', 'icons'):
        raise SystemExit('--only must be scenery, crops or icons')
    return opts


def main():
    opts = parse_args()
    sections = [opts['only']] if opts['only'] else ['scenery', 'crops', 'icons']
    manifest = load_manifest()
    manifest['generator'] = 'art/blender/kit/build_nature.py'
    manifest['blender'] = bpy.app.version_string
    failures = []

    if 'scenery' in sections:
        reset_scene()
        objs = build_scenery()
        stats = {n: node_stats(o) for n, o in objs.items()}
        report('scenery', stats)
        for n, s in stats.items():
            failures += [f'{n}: {e}' for e in check_scenery(n, s)]
        path = os.path.join(MODELS, 'scenery.glb')
        size = export_glb([objs[n] for n in SCENERY_IDS], path)
        print(f'  scenery.glb {size} bytes')
        if size > 250 * 1024:
            failures.append(f'scenery.glb is {size} bytes (> 250 KB)')
        manifest['scenery'] = dict(file='scenery.glb', bytes=size, nodes=stats)
        if opts['render']:
            preview_scenery(objs)

    if 'crops' in sections:
        reset_scene()
        objs = build_crops()
        stats = {n: node_stats(o) for n, o in objs.items()}
        report('crops', stats)
        for n, s in stats.items():
            failures += [f'{n}: {e}' for e in check_crop(n, s)]
        path = os.path.join(MODELS, 'crops.glb')
        size = export_glb(list(objs.values()), path)
        print(f'  crops.glb {size} bytes')
        if size > 600 * 1024:
            failures.append(f'crops.glb is {size} bytes (> 600 KB)')
        manifest['crops'] = dict(file='crops.glb', bytes=size, nodes=stats)
        if opts['render']:
            preview_crops(objs)

    if 'icons' in sections:
        reset_scene()
        objs = build_crops()
        sizes = render_icons(objs)
        for cid, size in sizes.items():
            if size > 12 * 1024:
                failures.append(f'icon {cid}.webp is {size} bytes (> 12 KB)')
        manifest['icons'] = dict(dir='icons/crops', size=[160, 160], bytes=sizes)
        if opts['render']:
            contact_sheet(['sprout'] + CROP_IDS, os.path.join(PREVIEWS, 'crop-icons.webp'))

    save_manifest(manifest)
    if failures:
        raise RuntimeError('Nature kit contract failures:\n  ' + '\n  '.join(failures))

    if opts['install']:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        for name in ('scenery.glb', 'crops.glb'):
            src = os.path.join(MODELS, name)
            if os.path.exists(src) and ('crops' if name == 'crops.glb' else 'scenery') in sections:
                shutil.copy2(src, os.path.join(PUBLIC_MODELS, name))
                print('installed', name)
        if 'icons' in sections:
            os.makedirs(PUBLIC_ICONS, exist_ok=True)
            for cid in ['sprout'] + CROP_IDS:
                shutil.copy2(os.path.join(ICONS, cid + '.webp'), os.path.join(PUBLIC_ICONS, cid + '.webp'))
            print('installed', len(CROP_IDS) + 1, 'icons')
    print('\nNature kit OK')


if __name__ == '__main__':
    main()
