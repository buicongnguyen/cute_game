"""Zoo Garden fishing kit: pond fish, an old boot, pond dressing and fish icons.

Eighteen catalogue fish and the old boot, authored procedurally as soft, glossy toys that
read from the high game camera: bold silhouettes, big eyes and simple high-contrast colour
patterns that survive being seen through translucent water. Each model is an empty at its
centre of mass with a `<id>_body` mesh and (for real fish) a one-material `<id>_tail` mesh
whose origin is the tail hinge, so the game can wag it about the vertical axis. The same
GLB carries the pond dressing: bobber, lily pad, lily flower and reeds. See CONTRACT.md.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_fish.py -- \
        [--only models|icons] [--install] [--render] [--debug DIR]

Outputs (default):
    art/generated/kit/models/fish.glb
    art/generated/kit/icons/fish/<id>.webp   (160 x 160, transparent)
    art/generated/kit/fish-manifest.json
    art/previews/kit/fish.webp, fish-closeup.webp, pond-dressing.webp, fish-icons.webp  (--render)
--install copies fish.glb to public/assets/models/ and the icons to public/assets/icons/fish/.
--debug DIR writes check renders (every tail swung to +-0.6 rad, the dressing up close) to DIR.

Blender is Z up with the head toward -Y; glTF exports are Y up with the head toward +Z.
Output is deterministic: seeded randomness, triangulated and sorted faces (as build_props.py).
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
ICONS = os.path.join(GEN, 'icons', 'fish')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'fish-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'fish')

FISH_IDS = ['fish_perch', 'fish_clown', 'fish_puffer', 'fish_carp', 'fish_shark', 'fish_rainbow', 'fish_catfish',
            'fish_koi', 'fish_eel', 'fish_swordfish', 'fish_jelly', 'fish_icepike', 'fish_whale', 'fish_kraken',
            'fish_golden', 'fish_sunfish', 'fish_angler', 'fish_manta']
MODEL_IDS = FISH_IDS + ['boot']
DRESSING_IDS = ['bobber', 'lily_pad', 'lily_flower', 'reeds']
CLASS_RANGE = {'small': (0.45, 0.55), 'medium': (0.6, 0.75), 'big': (0.8, 1.1), 'junk': (0.3, 0.45)}
TRI_LIMIT, TAIL_LIMIT, BOOT_LIMIT = 450, 80, 250
GLB_LIMIT = 450 * 1024
ICON_LIMIT = 10 * 1024
TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))
AHEAD = Vector((0, -1, 0))
# The game (src/fishing-view.ts) keeps fish centres 0.09 under the surface of a pond whose bed is
# ~0.13 down, and wags the tail up to +-0.6 rad; joints and heights below are built for that.
GAME_DEPTH = 0.09


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists with a per-face tag (a material, or a key into a dict)."""

    def __init__(self, verts, faces, tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [0] * len(self.faces)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

    def moved(self, offset):
        o = Vector(offset)
        return Geo([v + o for v in self.verts], self.faces, self.tags)

    def mirrored(self):
        """Mirror across X (left/right pairs), keeping faces pointing outward."""
        return Geo([Vector((-v.x, v.y, v.z)) for v in self.verts], [tuple(reversed(f)) for f in self.faces],
                   self.tags)

    def flipped(self):
        return Geo(self.verts, [tuple(reversed(f)) for f in self.faces], self.tags)

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
        """Closed shapes: make sure faces point outward."""
        if self.signed_volume() < 0:
            self.faces = [tuple(reversed(f)) for f in self.faces]
        return self

    def moments(self):
        """(volume, volume-weighted centroid sum) of a closed, outward shape."""
        vol, acc = 0.0, Vector()
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                b, c = self.verts[f[i]], self.verts[f[i + 1]]
                v = a.dot(b.cross(c)) / 6.0
                vol += v
                acc += v * (a + b + c) / 4.0
        return vol, acc


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
        """material: one material, a dict tag -> material, or None when the tags are materials."""
        g = geo if xf is None else geo.transformed(xf)
        base = len(self.verts)
        self.verts.extend(g.verts)
        for f, t in zip(g.faces, g.tags):
            if isinstance(material, dict):
                m = material[t]
            elif material is None:
                m = t
            else:
                m = material
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.slot(m))
            self.smooth.append(smooth)
        return self

    def transform(self, m):
        self.verts = [m @ v for v in self.verts]

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, offset=None, sharp=125):
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
    """Triangulate and sort faces so the GLB is byte-for-byte reproducible (as build_props.py).
    New diagonals stay smooth, so shading is unchanged."""
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


def leaf_frame(base, yaw, pitch, roll=0.0):
    """Local +Y along a direction (yaw around Z from +X, pitch above horizontal), local +Z the upper side."""
    fwd = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)))
    side = Vector((math.sin(yaw), -math.cos(yaw), 0.0))
    nrm = side.cross(fwd).normalized()
    if roll:
        q = Quaternion(fwd, roll)
        side, nrm = q @ side, q @ nrm
    m = Matrix((side, fwd, nrm)).transposed().to_4x4()
    m.translation = Vector(base)
    return m


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


def disc(outline, dome=0.0, center=None):
    """A fan over a 2D outline in local XY, domed toward +Z (decal spots, pupils)."""
    n = len(outline)
    cx, cy = center or (sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n)
    verts = [(cx, cy, dome)] + [(x, y, 0.0) for x, y in outline]
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    return Geo(verts, faces)


def circle(n, r, phase=0.0, sx=1.0, sy=1.0):
    return [(r * sx * math.cos(phase + TAU * i / n), r * sy * math.sin(phase + TAU * i / n)) for i in range(n)]


# ------------------------------------------------------------ fish bodies
def pchip(points):
    """Monotone cubic interpolation through [(x, y), ...]: smooth, and never overshoots to a negative size."""
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    n = len(xs)
    if n == 1:
        return lambda x: ys[0]
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            h0, h1 = xs[i] - xs[i - 1], xs[i + 1] - xs[i]
            w1, w2 = 2 * h1 + h0, h1 + 2 * h0
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while xs[i + 1] < x:
            i += 1
        h = xs[i + 1] - xs[i]
        s = (x - xs[i]) / h
        return ((2 * s ** 3 - 3 * s ** 2 + 1) * ys[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i]
                + (-2 * s ** 3 + 3 * s ** 2) * ys[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1])
    return f


def _fn(v):
    if callable(v):
        return v
    if isinstance(v, (int, float)):
        return lambda t, v=float(v): v
    return pchip(v)


class Body:
    """A fish body swept from the nose (t = 0, toward -Y) to the tail end (t = 1).
    Profiles are key points [(t, value)]: half width w, upper and lower half heights ht/hb,
    centre height zc, lateral offset xc (wavy eels) and a superellipse exponent p (2 = oval)."""

    def __init__(self, y0, y1, w, ht, hb=None, zc=0.0, xc=0.0, p=2.0):
        self.y0, self.y1 = y0, y1
        self.w, self.ht = _fn(w), _fn(ht)
        self.hb = _fn(hb) if hb is not None else self.ht
        self.zc, self.xc, self.p = _fn(zc), _fn(xc), _fn(p)

    def y(self, t):
        return self.y0 + (self.y1 - self.y0) * t

    def centre(self, t):
        return Vector((self.xc(t), self.y(t), self.zc(t)))

    def axes(self, t):
        e = 1e-3
        tan = (self.centre(min(1.0, t + e)) - self.centre(max(0.0, t - e))).normalized()
        side = tan.cross(UP).normalized()
        return tan, side

    def point(self, t, th):
        c = self.centre(t)
        _, side = self.axes(t)
        cs, sn = math.cos(th), math.sin(th)
        e = 2.0 / self.p(t)
        x = math.copysign(abs(cs) ** e, cs)
        z = math.copysign(abs(sn) ** e, sn)
        h = self.ht(t) if z >= 0 else self.hb(t)
        return c + side * (self.w(t) * x) + UP * (h * z)

    def edge(self, t, side=1):
        return self.zc(t) + (self.ht(t) if side > 0 else -self.hb(t))

    def surface(self, t, th, lift=0.0):
        p = self.point(t, th)
        e = 1e-3
        dt = self.point(min(1.0, t + e), th) - self.point(max(0.0, t - e), th)
        dth = self.point(t, th + e) - self.point(t, th - e)
        n = dth.cross(dt).normalized()
        if n.dot(p - self.centre(t)) < 0:
            n = -n
        return p + n * lift, n


def skin(rings, tag=None):
    """Loft point rings (a single point is a pole) into faces; tag(band, seg) labels them."""
    verts, ids = [], []
    for ring in rings:
        idx = []
        for p in ring:
            idx.append(len(verts))
            verts.append(Vector(p))
        ids.append(idx)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(ids, ids[1:])):
        n = max(len(lo), len(up))
        if len(lo) == 1 and len(up) == 1:
            continue
        for s in range(n):
            if len(lo) == 1:
                f = (lo[0], up[(s + 1) % n], up[s])
            elif len(up) == 1:
                f = (lo[s], lo[(s + 1) % n], up[0])
            else:
                f = (lo[s], lo[(s + 1) % n], up[(s + 1) % n], up[s])
            faces.append(f)
            tags.append(tag(b, s) if tag else 0)
    return Geo(verts, faces, tags)


def body_rings(body, ts, sides, phase=0.0):
    rings = []
    for t in ts:
        if body.w(t) < 1e-5 and body.ht(t) < 1e-5 and body.hb(t) < 1e-5:
            rings.append([body.centre(t)])
        else:
            rings.append([body.point(t, phase + TAU * s / sides) for s in range(sides)])
    return rings


def body_loft(body, ts, sides, paint, phase=0.0):
    """paint(t_mid, theta_mid, band, seg) returns the material of each face."""
    def tag(b, s):
        return paint((ts[b] + ts[b + 1]) / 2, phase + TAU * (s + 0.5) / sides, b, s)
    return skin(body_rings(body, ts, sides, phase), tag).outward()


def joint_cap(body, t, sides, rear=True, steps=(RAD(40), RAD(72)), phase=0.0):
    """Rings closing a body at t with a half ellipsoid of revolution about the vertical axis
    (radius = the half width), so a tail hinged there can swing without opening a seam."""
    c = body.centre(t)
    tan, side = body.axes(t)
    w = body.w(t)
    sign = 1.0 if rear else -1.0
    rings = []
    for phi in steps:
        k = math.cos(phi)
        centre = c + tan * (sign * w * math.sin(phi))
        ring = []
        for s in range(sides):
            th = phase + TAU * s / sides
            cs, sn = math.cos(th), math.sin(th)
            h = body.ht(t) if sn >= 0 else body.hb(t)
            ring.append(centre + side * (w * cs * k) + UP * (h * sn * k))
        rings.append(ring)
    rings.append([c + tan * (sign * w)])
    return rings


# ------------------------------------------------------------------- fins
def fin2d(pts, centre=None, thick=0.012):
    """A thin closed fin: the outline pinched to an edge, puffed to +-thick/2 at `centre` (local Z)."""
    n = len(pts)
    cx, cy = centre if centre else (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    verts = [Vector((x, y, 0.0)) for x, y in pts] + [Vector((cx, cy, thick / 2)), Vector((cx, cy, -thick / 2))]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n))
        faces.append((j, i, n + 1))
    return Geo(verts, faces).outward()


# Local (u, v) of a fin outline -> body (y, z); local Z (thickness) -> body X.
YZ = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def vfin(pts, centre, thick, at=(0, 0, 0)):
    """A vertical fin; outline in (y, z) relative to `at`."""
    return fin2d(pts, centre, thick).transformed(Matrix.Translation(Vector(at)) @ YZ)


def blade(roots, tops, normals, thick):
    """A fin standing on the body: two sheets from a doubled root line (hidden in the body) to a
    shared outer edge. Cheap, and never folds over on long curved backs."""
    n = len(roots)
    verts = [Vector(r) + Vector(m) * thick / 2 for r, m in zip(roots, normals)]
    verts += [Vector(r) - Vector(m) * thick / 2 for r, m in zip(roots, normals)]
    verts += [Vector(t) for t in tops]
    L, R, T = 0, n, 2 * n
    faces = []
    for i in range(n - 1):
        faces.append((L + i, L + i + 1, T + i + 1, T + i))
        faces.append((R + i + 1, R + i, T + i, T + i + 1))
    # Point the +normal sheet along +normal (Newell normal over the whole sheet).
    acc = Vector()
    for f in faces[0::2]:
        for j in range(4):
            a, b = verts[f[j]], verts[f[(j + 1) % 4]]
            acc += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    if acc.dot(sum((Vector(m) for m in normals), Vector())) < 0:
        faces = [tuple(reversed(f)) for f in faces]
    return Geo(verts, faces)


def ridge_fin(body, outline, side=1, sink=0.012, thick=0.012):
    """A fin on the back (side 1) or belly (side -1): outline [(t, height)] front to back; the root
    follows the body surface."""
    roots, tops, normals = [], [], []
    for t, h in outline:
        c = body.centre(t)
        _, s = body.axes(t)
        root = Vector((c.x, c.y, body.edge(t, side) - side * sink))
        roots.append(root)
        tops.append(root if h <= 0 else Vector((c.x, c.y, body.edge(t, side) + side * h)))
        normals.append(s)
    return blade(roots, tops, normals, thick)


def paddle(L, W, k=2, root=0.45):
    """A rounded fin outline along local +Y from the root (x across)."""
    right = []
    for i in range(k + 1):
        u = i / k
        right.append((0.5 * W * (root + (1 - root) * math.sin(0.5 * math.pi * u)), L * (0.02 + 0.78 * u)))
    left = [(-x, y) for x, y in reversed(right)]
    return right + [(0.0, L)] + left


def side_fin(body, t, th, pts, yaw, pitch, roll=0.0, thick=0.01, sink=0.006, centre=None):
    """A paired fin on the right (+X) side; add .mirrored() for the left one."""
    pos, n = body.surface(t, th)
    c = centre or (0.0, 0.4 * max(p[1] for p in pts))
    return fin2d(pts, c, thick).transformed(leaf_frame(pos - n * sink, yaw, pitch, roll))


def fork_tail(L, H, notch=0.62, root=0.018):
    """Forked caudal fin behind the hinge (+Y), outline in (y, z)."""
    return [(0.0, root), (0.35 * L, 0.62 * H), (0.9 * L, H), (L, 0.92 * H), (0.8 * L, 0.4 * H),
            (notch * L, 0.0), (0.8 * L, -0.4 * H), (L, -0.92 * H), (0.9 * L, -H), (0.35 * L, -0.62 * H),
            (0.0, -root)]


def round_tail(L, H, root=0.018):
    return [(0.0, root), (0.3 * L, 0.72 * H), (0.7 * L, H), (0.95 * L, 0.62 * H), (L, 0.0),
            (0.95 * L, -0.62 * H), (0.7 * L, -H), (0.3 * L, -0.72 * H), (0.0, -root)]


def lunate_tail(L, H, root=0.015, lower=1.0):
    return [(0.0, root), (0.3 * L, 0.36 * H), (0.72 * L, 0.84 * H), (L, H), (0.86 * L, 0.62 * H),
            (0.58 * L, 0.2 * H), (0.5 * L, 0.0), (0.58 * L, -0.2 * H * lower), (0.86 * L, -0.62 * H * lower),
            (L * (0.6 + 0.4 * lower), -H * lower), (0.72 * L, -0.84 * H * lower), (0.3 * L, -0.36 * H * lower),
            (0.0, -root)]


# ------------------------------------------------------------ small parts
def eye_materials():
    return FM('Fish eye', '#121420', 0.18), FM('Fish eye white', '#FFFFFF', 0.3)


def add_eye(piece, pos, normal, r, look=0.3, pupil=0.62, sink=0.28, bead=False):
    """A toy eye: a white dome with a black bead pupil glancing forward."""
    black, white = eye_materials()
    n = Vector(normal).normalized()
    base = Vector(pos) - n * r * sink
    piece.add(lathe([(r, 0.0), (0.74 * r, 0.33 * r), (0.0, 0.46 * r)], 8), white, facing(base, n))
    d = (n + AHEAD * look).normalized()
    alpha = n.angle(d)
    hit = 1.0 / math.sqrt((math.sin(alpha) / r) ** 2 + (math.cos(alpha) / (0.46 * r)) ** 2)
    pr = pupil * r
    drop = pr * pr / (2 * 2.2 * r)
    prof = [(pr, 0.0), (0.6 * pr, 0.24 * pr), (0.0, 0.32 * pr)] if bead else [(pr, 0.0), (0.0, 0.3 * pr)]
    centre = base + d * (hit - drop)
    piece.add(lathe(prof, 6), black, facing(centre, d))
    # A glint on the upper front of the pupil: the toy-eye sparkle.
    up = UP - d * UP.dot(d)
    up = up.normalized() if up.length > 1e-4 else Vector((0, 0, 1))
    front = AHEAD - d * AHEAD.dot(d)
    front = front.normalized() if front.length > 1e-4 else Vector()
    spot_c = centre + d * (0.2 * pr) + up * (0.42 * pr) + front * (0.18 * pr)
    piece.add(lathe([(0.3 * pr, 0.0), (0.0, 0.12 * pr)], 3, phase=0.4), white, facing(spot_c, d))


def add_eyes(piece, body, t, th, r, **kw):
    for ang in (th, math.pi - th):
        pos, n = body.surface(t, ang)
        add_eye(piece, pos, n, r, **kw)


def spot(piece, body, t, th, r, material, n=6, lift=0.0025, squash=1.0):
    pos, nrm = body.surface(t, th, lift)
    piece.add(disc(circle(n, r, 0.3, 1.0, squash), dome=0.25 * r), material, facing(pos, nrm, up=(0, -1, 0)))


def spike(piece, body, t, th, length, radius, material, sides=3, lean=0.0):
    pos, nrm = body.surface(t, th)
    d = (nrm + Vector((0, lean, 0))).normalized()
    piece.add(lathe([(radius, 0.0), (0.0, length)], sides, phase=0.5), material, facing(pos - d * 0.004, d))


def barbel(piece, start, points, radii, material):
    piece.add(tube([start] + [Vector(p) for p in points], radii, sides=3), material)


# =============================================================== materials
def FM(name, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
    """style.mat, single sided (every kit part is a closed shape)."""
    m = mat(name, color, rough, metal, emit, strength)
    m.use_backface_culling = True
    return m


class Model:
    """One catalogue entry: an empty at the centre of mass with a body and (for fish) a tail."""

    def __init__(self, mid, size_class, wag=0.6):
        self.id = mid
        self.short = mid[5:] if mid.startswith('fish_') else mid
        self.cls = size_class
        self.body = Piece(mid + '_body')
        self.tail = None if mid == 'boot' else Piece(mid + '_tail')
        self.hinge = None
        self.mass = []
        self.symmetric = True
        self.wag = wag          # comfortable tail swing, radians either way
        self.note = ''

    def m(self, part, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
        return FM(f'Fish {self.short} {part}', color, rough, metal, emit, strength)

    def transform(self, m):
        self.body.transform(m)
        if self.tail:
            self.tail.transform(m)
        self.mass = [g.transformed(m) for g in self.mass]
        if self.hinge is not None:
            self.hinge = m @ Vector(self.hinge)


def mass_centre(geos):
    vol, acc = 0.0, Vector()
    for g in geos:
        v, a = g.moments()
        vol += v
        acc += a
    return acc / vol


# ================================================================== fish
def build_perch():
    M = Model('fish_perch', 'small')
    body = M.m('body', '#6DB22A', 0.45)
    bars = M.m('bars', '#17482A', 0.5)
    belly = M.m('belly', '#F4E28A', 0.5)
    fin = M.m('fin', '#FF660A', 0.42)
    B = Body(-0.25, 0.15,
             w=[(0, 0), (0.015, 0.015), (0.06, 0.032), (0.17, 0.05), (0.38, 0.058), (0.62, 0.05), (0.83, 0.031),
                (0.93, 0.021), (1, 0)],
             ht=[(0, 0), (0.015, 0.014), (0.06, 0.032), (0.17, 0.054), (0.4, 0.068), (0.63, 0.056), (0.84, 0.033),
                 (0.93, 0.024), (1, 0)],
             hb=[(0, 0), (0.015, 0.012), (0.06, 0.027), (0.2, 0.044), (0.45, 0.05), (0.68, 0.039), (0.85, 0.025),
                 (0.93, 0.019), (1, 0)],
             zc=[(0, -0.008), (0.3, 0.0), (1, 0.004)], p=2.1)
    bar_t = [(0.3, 0.37), (0.45, 0.52), (0.6, 0.67), (0.75, 0.81)]

    def paint(t, th, b, s):
        sn = math.sin(th)
        if sn < -0.5:
            return belly
        if any(a < t < c for a, c in bar_t) and sn > -0.3:
            return bars
        return body
    g = body_loft(B, [0, 0.015, 0.06, 0.22, 0.3, 0.37, 0.45, 0.52, 0.6, 0.67, 0.75, 0.81, 0.93, 1], 10, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.1, RAD(32), 0.026)
    M.body.add(ridge_fin(B, [(0.27, 0), (0.3, 0.045), (0.35, 0.055), (0.41, 0.046), (0.47, 0.026), (0.52, 0.036),
                             (0.6, 0.038), (0.68, 0.024), (0.72, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.64, 0), (0.67, 0.03), (0.75, 0.032), (0.8, 0.012), (0.82, 0)], side=-1), fin)
    pec = side_fin(B, 0.23, RAD(-8), paddle(0.07, 0.044), RAD(52), RAD(-14))
    pel = side_fin(B, 0.34, RAD(-62), paddle(0.045, 0.026, k=1), RAD(78), RAD(-38))
    for g in (pec, pec.mirrored(), pel, pel.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.955)
    M.tail.add(vfin(fork_tail(0.12, 0.075), (0.04, 0.0), 0.016, M.hinge), fin)
    return M


def build_clown():
    M = Model('fish_clown', 'small')
    orange = M.m('body', '#FF6A00', 0.4)
    white = M.m('band', '#FFFFFF', 0.4)
    black = M.m('edge', '#15151F', 0.45)
    fin = M.m('fin', '#FF8412', 0.42)
    B = Body(-0.225, 0.135,
             w=[(0, 0), (0.02, 0.024), (0.08, 0.046), (0.26, 0.06), (0.5, 0.058), (0.75, 0.042), (0.9, 0.027),
                (0.96, 0.021), (1, 0)],
             ht=[(0, 0), (0.02, 0.022), (0.08, 0.046), (0.3, 0.066), (0.55, 0.06), (0.78, 0.041), (0.9, 0.029),
                 (0.96, 0.023), (1, 0)],
             hb=[(0, 0), (0.02, 0.02), (0.08, 0.04), (0.3, 0.056), (0.55, 0.052), (0.78, 0.035), (0.9, 0.025),
                 (0.96, 0.02), (1, 0)])
    white_t = [(0.225, 0.3), (0.525, 0.61), (0.855, 1.0)]
    black_t = [(0.2, 0.225), (0.3, 0.325), (0.5, 0.525), (0.61, 0.635), (0.83, 0.855)]

    def paint(t, th, b, s):
        if any(a < t < c for a, c in white_t):
            return white
        if any(a < t < c for a, c in black_t):
            return black
        return orange
    g = body_loft(B, [0, 0.02, 0.1, 0.2, 0.225, 0.3, 0.325, 0.5, 0.525, 0.61, 0.635, 0.83, 0.855, 0.96, 1], 10,
                  paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.12, RAD(30), 0.028)
    M.body.add(ridge_fin(B, [(0.3, 0), (0.33, 0.03), (0.4, 0.036), (0.47, 0.026), (0.53, 0.042), (0.64, 0.044),
                             (0.74, 0.024), (0.78, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.6, 0), (0.64, 0.03), (0.73, 0.034), (0.8, 0.0)], side=-1), fin)
    pec = side_fin(B, 0.28, RAD(-12), paddle(0.062, 0.05), RAD(45), RAD(-12))
    for g in (pec, pec.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.965)
    M.tail.add(vfin(round_tail(0.105, 0.06), (0.036, 0.0), 0.016, M.hinge), fin)
    return M


def build_puffer():
    M = Model('fish_puffer', 'small')
    skin_m = M.m('body', '#FFBA14', 0.42)
    belly = M.m('belly', '#FFF1CC', 0.45)
    saddle = M.m('saddle', '#9A5214', 0.48)
    spike_m = M.m('spike', '#7A3C10', 0.5)
    fin = M.m('fin', '#FF9A12', 0.42)
    mouth = M.m('mouth', '#FF7A6A', 0.4)
    B = Body(-0.2, 0.15,
             w=[(0, 0), (0.025, 0.05), (0.1, 0.1), (0.3, 0.135), (0.55, 0.135), (0.78, 0.098), (0.92, 0.05),
                (0.97, 0.03), (1, 0)],
             ht=[(0, 0), (0.025, 0.045), (0.1, 0.09), (0.35, 0.118), (0.6, 0.112), (0.8, 0.082), (0.92, 0.042),
                 (0.97, 0.026), (1, 0)],
             hb=[(0, 0), (0.025, 0.04), (0.1, 0.075), (0.35, 0.098), (0.6, 0.094), (0.8, 0.068), (0.92, 0.036),
                 (0.97, 0.022), (1, 0)],
             zc=[(0, -0.012), (0.4, 0.0), (1, 0.01)])
    saddles = [(0.32, 0.45), (0.58, 0.7)]

    def paint(t, th, b, s):
        sn = math.sin(th)
        if sn < -0.35:
            return belly
        if any(a < t < c for a, c in saddles) and sn > 0.25:
            return saddle
        return skin_m
    g = body_loft(B, [0, 0.025, 0.1, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.9, 0.97, 1], 10, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.17, RAD(36), 0.044, pupil=0.6, bead=True)
    rng = random.Random(11)
    for t, ths in ((0.26, (8, 62, 118, 172)), (0.38, (-20, 34, 90, 146, 200)), (0.52, (6, 60, 120, 174)),
                   (0.64, (-20, 34, 90, 146, 200)), (0.76, (10, 64, 116, 170))):
        for a in ths:
            spike(M.body, B, t + rng.uniform(-0.015, 0.015), RAD(a + rng.uniform(-6, 6)), 0.03, 0.009, spike_m,
                  lean=0.35)
    lip = B.centre(0.0) + Vector((0, 0.004, -0.004))
    M.body.add(lathe([(0.02, 0.0), (0.016, 0.009), (0.0, 0.006)], 6), mouth, facing(lip, AHEAD))
    pec = side_fin(B, 0.4, RAD(-4), paddle(0.05, 0.05, k=1, root=0.6), RAD(40), RAD(-8))
    for g in (pec, pec.mirrored()):
        M.body.add(g, fin)
    M.body.add(ridge_fin(B, [(0.74, 0), (0.78, 0.035), (0.86, 0.03), (0.9, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.74, 0), (0.78, 0.03), (0.86, 0.026), (0.9, 0)], side=-1), fin)
    M.hinge = B.centre(0.972)
    M.tail.add(vfin(round_tail(0.112, 0.056), (0.038, 0.0), 0.016, M.hinge), fin)
    return M


def build_carp():
    M = Model('fish_carp', 'medium')
    back = M.m('back', '#84420E', 0.45)
    upper = M.m('bronze', '#C27618', 0.42)
    side = M.m('body', '#F0A824', 0.4)
    belly = M.m('belly', '#FFDD8A', 0.45)
    fin = M.m('fin', '#E0501C', 0.42)
    B = Body(-0.33, 0.2,
             w=[(0, 0), (0.015, 0.02), (0.06, 0.045), (0.18, 0.072), (0.4, 0.085), (0.65, 0.068), (0.85, 0.038),
                (0.95, 0.026), (1, 0)],
             ht=[(0, 0), (0.015, 0.018), (0.06, 0.044), (0.2, 0.082), (0.38, 0.094), (0.6, 0.08), (0.82, 0.046),
                 (0.95, 0.03), (1, 0)],
             hb=[(0, 0), (0.015, 0.016), (0.06, 0.036), (0.2, 0.062), (0.42, 0.07), (0.66, 0.054), (0.85, 0.032),
                 (0.95, 0.024), (1, 0)],
             zc=[(0, -0.016), (0.3, 0.0), (1, 0.01)], p=2.1)

    def paint(t, th, b, s):
        # Four bronze-to-cream tones from the back down: reads "carp" without noisy scales.
        sn = math.sin(th)
        if sn < -0.45:
            return belly
        if sn > 0.75:
            return back
        if sn > 0.2:
            return upper
        return side
    g = body_loft(B, [0, 0.015, 0.06, 0.13, 0.22, 0.32, 0.43, 0.54, 0.65, 0.76, 0.86, 0.95, 1], 10, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.1, RAD(27), 0.026)
    for side_x in (1, -1):
        root = B.point(0.03, RAD(-25 if side_x > 0 else 205))
        d = Vector((side_x, 0, 0))
        barbel(M.body, root, [root + d * 0.02 + Vector((0, -0.01, -0.02)), root + d * 0.03 + Vector((0, 0.0, -0.045))],
               [0.0055, 0.004, 0.0], fin)
        root2 = B.point(0.06, RAD(-8 if side_x > 0 else 188))
        barbel(M.body, root2, [root2 + d * 0.022 + Vector((0, 0.004, -0.01)),
                               root2 + d * 0.036 + Vector((0, 0.02, -0.022))], [0.0045, 0.0035, 0.0], fin)
    M.body.add(ridge_fin(B, [(0.3, 0), (0.33, 0.058), (0.38, 0.064), (0.46, 0.042), (0.58, 0.034), (0.7, 0.022),
                             (0.73, 0)]), back)
    M.body.add(ridge_fin(B, [(0.7, 0), (0.73, 0.038), (0.8, 0.032), (0.84, 0)], side=-1), fin)
    pec = side_fin(B, 0.24, RAD(-22), paddle(0.075, 0.042), RAD(50), RAD(-22))
    pel = side_fin(B, 0.46, RAD(-68), paddle(0.052, 0.03, k=1), RAD(75), RAD(-36))
    for g in (pec, pec.mirrored(), pel, pel.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.955)
    M.tail.add(vfin(fork_tail(0.155, 0.092), (0.05, 0.0), 0.02, M.hinge), fin)
    return M


def build_shark():
    M = Model('fish_shark', 'big')
    top = M.m('body', '#3F6DAA', 0.42)
    belly = M.m('belly', '#F4F8FF', 0.45)
    fin = M.m('fin', '#315C98', 0.42)
    B = Body(-0.5, 0.3,
             w=[(0, 0), (0.012, 0.014), (0.05, 0.042), (0.15, 0.078), (0.32, 0.096), (0.55, 0.082), (0.78, 0.048),
                (0.92, 0.029), (0.97, 0.022), (1, 0)],
             ht=[(0, 0), (0.012, 0.011), (0.05, 0.032), (0.15, 0.062), (0.35, 0.084), (0.58, 0.072), (0.8, 0.042),
                 (0.92, 0.027), (0.97, 0.021), (1, 0)],
             hb=[(0, 0), (0.012, 0.012), (0.05, 0.034), (0.15, 0.056), (0.35, 0.07), (0.58, 0.058), (0.8, 0.034),
                 (0.92, 0.023), (0.97, 0.019), (1, 0)],
             zc=[(0, -0.004), (0.15, 0.0), (1, 0.012)], p=[(0, 2.4), (0.3, 2.0), (1, 2.0)])

    def paint(t, th, b, s):
        return belly if math.sin(th) < -0.28 else top
    g = body_loft(B, [0, 0.012, 0.05, 0.12, 0.22, 0.34, 0.47, 0.6, 0.73, 0.86, 0.96, 1], 12, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.12, RAD(22), 0.028, pupil=0.7)
    M.body.add(ridge_fin(B, [(0.33, 0), (0.37, 0.08), (0.42, 0.14), (0.46, 0.16), (0.475, 0.14), (0.49, 0.07),
                             (0.52, 0)], thick=0.016), fin)
    M.body.add(ridge_fin(B, [(0.8, 0), (0.83, 0.035), (0.86, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.78, 0), (0.81, 0.03), (0.84, 0)], side=-1), fin)
    pec_pts = [(0.012, 0.0), (0.03, 0.05), (0.036, 0.1), (0.025, 0.155), (0.006, 0.12), (-0.014, 0.06),
               (-0.02, 0.012)]
    pec = side_fin(B, 0.28, RAD(-24), pec_pts, RAD(32), RAD(-16), thick=0.014, centre=(0.005, 0.05))
    for g in (pec, pec.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.965)
    M.tail.add(vfin(lunate_tail(0.2, 0.165, lower=0.62), (0.07, 0.02), 0.022, M.hinge), fin)
    return M


def build_rainbow():
    M = Model('fish_rainbow', 'small')
    cols = [M.m('red', '#FF2E4C', 0.4), M.m('orange', '#FF8A12', 0.4), M.m('yellow', '#FFD51C', 0.4),
            M.m('green', '#2FCB4E', 0.4), M.m('blue', '#2A86FF', 0.4), M.m('violet', '#8E4BFF', 0.4)]
    fin = M.m('fin', '#FF7AC6', 0.42)
    B = Body(-0.26, 0.16,
             w=[(0, 0), (0.015, 0.014), (0.06, 0.03), (0.2, 0.043), (0.45, 0.045), (0.7, 0.036), (0.88, 0.022),
                (0.96, 0.016), (1, 0)],
             ht=[(0, 0), (0.015, 0.014), (0.06, 0.033), (0.2, 0.053), (0.45, 0.057), (0.7, 0.046), (0.88, 0.029),
                 (0.96, 0.02), (1, 0)],
             hb=[(0, 0), (0.015, 0.012), (0.06, 0.028), (0.2, 0.045), (0.45, 0.049), (0.7, 0.038), (0.88, 0.024),
                 (0.96, 0.017), (1, 0)])
    edges = [0.16, 0.3, 0.44, 0.58, 0.72]

    def paint(t, th, b, s):
        return cols[sum(1 for e in edges if t > e)]
    g = body_loft(B, [0, 0.015, 0.07, 0.16, 0.3, 0.44, 0.58, 0.72, 0.86, 0.96, 1], 12, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.1, RAD(30), 0.025)
    M.body.add(ridge_fin(B, [(0.34, 0), (0.39, 0.042), (0.5, 0.046), (0.6, 0.028), (0.64, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.64, 0), (0.68, 0.03), (0.76, 0.028), (0.8, 0)], side=-1), fin)
    pec = side_fin(B, 0.22, RAD(-10), paddle(0.058, 0.034), RAD(52), RAD(-14))
    for g in (pec, pec.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.965)
    M.tail.add(vfin(fork_tail(0.11, 0.068), (0.036, 0.0), 0.015, M.hinge), fin)
    return M


def build_catfish():
    M = Model('fish_catfish', 'big')
    back = M.m('body', '#6E4F37', 0.5)
    spots = M.m('spots', '#3E2A1D', 0.55)
    belly = M.m('belly', '#EBD3A8', 0.5)
    whisker = M.m('whisker', '#2E2019', 0.5)
    fin = M.m('fin', '#5A3E2A', 0.5)
    B = Body(-0.4, 0.3,
             w=[(0, 0), (0.02, 0.05), (0.07, 0.085), (0.16, 0.1), (0.3, 0.09), (0.5, 0.07), (0.72, 0.045),
                (0.9, 0.028), (0.97, 0.02), (1, 0)],
             ht=[(0, 0), (0.02, 0.02), (0.07, 0.038), (0.16, 0.052), (0.3, 0.064), (0.5, 0.066), (0.72, 0.055),
                 (0.9, 0.037), (0.97, 0.028), (1, 0)],
             hb=[(0, 0), (0.02, 0.02), (0.07, 0.032), (0.16, 0.042), (0.3, 0.05), (0.5, 0.052), (0.72, 0.045),
                 (0.9, 0.031), (0.97, 0.024), (1, 0)],
             zc=[(0, -0.016), (0.2, 0.0), (1, 0.01)], p=[(0, 2.8), (0.3, 2.2), (1, 2.0)])

    def paint(t, th, b, s):
        return belly if math.sin(th) < -0.3 else back
    g = body_loft(B, [0, 0.02, 0.07, 0.15, 0.26, 0.39, 0.52, 0.66, 0.8, 0.92, 0.975, 1], 10, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.1, RAD(52), 0.022)
    for t, a, r in ((0.2, 70, 0.016), (0.3, 30, 0.014), (0.38, 118, 0.016), (0.47, 64, 0.015), (0.55, 150, 0.013),
                    (0.62, 40, 0.014), (0.7, 104, 0.012), (0.78, 60, 0.011)):
        spot(M.body, B, t, RAD(a), r, spots, n=5)
    for sx in (1, -1):
        root = B.point(0.02, RAD(10 if sx > 0 else 170))
        path = [root + Vector((sx * a, b, c)) for a, b, c in
                ((0.06, -0.05, -0.004), (0.16, -0.05, -0.01), (0.25, 0.03, -0.016), (0.3, 0.14, -0.024))]
        barbel(M.body, root, path, [0.0085, 0.0075, 0.0055, 0.0035, 0.0], whisker)
        chin = B.point(0.03, RAD(-60 if sx > 0 else 240))
        barbel(M.body, chin, [chin + Vector((sx * 0.025, -0.03, -0.02)), chin + Vector((sx * 0.04, -0.05, -0.035))],
               [0.005, 0.004, 0.0], whisker)
    M.body.add(ridge_fin(B, [(0.28, 0), (0.31, 0.062), (0.35, 0.056), (0.4, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.52, 0), (0.56, 0.03), (0.76, 0.034), (0.88, 0.02), (0.92, 0)], side=-1), fin)
    pec = side_fin(B, 0.17, RAD(-12), paddle(0.09, 0.05), RAD(40), RAD(-10))
    for g in (pec, pec.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.97)
    M.tail.add(vfin(round_tail(0.15, 0.075), (0.05, 0.0), 0.018, M.hinge), fin)
    return M


def build_koi():
    M = Model('fish_koi', 'medium')
    white = M.m('body', '#FFFFFF', 0.38)
    patch = M.m('patch', '#FF3000', 0.38)
    fin = M.m('fin', '#FFF1E4', 0.4)
    B = Body(-0.34, 0.2,
             w=[(0, 0), (0.015, 0.02), (0.06, 0.042), (0.18, 0.066), (0.4, 0.075), (0.65, 0.06), (0.85, 0.034),
                (0.95, 0.024), (1, 0)],
             ht=[(0, 0), (0.015, 0.018), (0.06, 0.04), (0.2, 0.068), (0.42, 0.078), (0.66, 0.06), (0.86, 0.035),
                 (0.95, 0.026), (1, 0)],
             hb=[(0, 0), (0.015, 0.016), (0.06, 0.034), (0.2, 0.054), (0.45, 0.06), (0.68, 0.046), (0.86, 0.028),
                 (0.95, 0.021), (1, 0)],
             zc=[(0, -0.01), (0.3, 0.0), (1, 0.008)])

    def paint(t, th, b, s):
        sn, cs = math.sin(th), math.cos(th)
        if 0.06 < t < 0.22 and sn > 0.3:
            return patch
        if 0.33 < t < 0.56 and sn > -0.1 and cs > -0.6:
            return patch
        if 0.68 < t < 0.8 and sn > 0.15 and cs < 0.55:
            return patch
        return white
    g = body_loft(B, [0, 0.015, 0.06, 0.13, 0.22, 0.33, 0.44, 0.56, 0.68, 0.8, 0.95, 1], 12, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.1, RAD(26), 0.026)
    for sx in (1, -1):
        root = B.point(0.02, RAD(-30 if sx > 0 else 210))
        barbel(M.body, root, [root + Vector((sx * 0.02, -0.012, -0.012)), root + Vector((sx * 0.03, -0.004, -0.03))],
               [0.005, 0.0038, 0.0], fin)
    M.body.add(ridge_fin(B, [(0.34, 0), (0.37, 0.05), (0.44, 0.054), (0.58, 0.034), (0.7, 0.02), (0.73, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.72, 0), (0.75, 0.03), (0.82, 0.026), (0.85, 0)], side=-1), fin)
    pec = side_fin(B, 0.24, RAD(-18), paddle(0.1, 0.06), RAD(48), RAD(-16))
    pel = side_fin(B, 0.47, RAD(-66), paddle(0.05, 0.03, k=1), RAD(76), RAD(-34))
    for g in (pec, pec.mirrored(), pel, pel.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.965)
    M.tail.add(vfin(fork_tail(0.16, 0.09, notch=0.7), (0.05, 0.0), 0.018, M.hinge), fin)
    return M


def build_eel():
    M = Model('fish_eel', 'big', wag=0.35)
    M.symmetric = False
    teal = M.m('body', '#0A9474', 0.42)
    belly = M.m('belly', '#C2F04E', 0.45)
    ridge = M.m('fin', '#07664F', 0.45)

    def wave(t):
        return 0.09 * math.sin(TAU * 1.2 * t - 1.1) * (0.3 + 0.7 * t)
    B = Body(-0.52, 0.52,
             w=[(0, 0), (0.012, 0.022), (0.04, 0.037), (0.09, 0.043), (0.16, 0.04), (0.3, 0.041), (0.55, 0.037),
                (0.66, 0.034), (0.8, 0.026), (0.92, 0.014), (0.975, 0.007), (1, 0)],
             ht=[(0, 0), (0.012, 0.019), (0.04, 0.033), (0.09, 0.04), (0.3, 0.042), (0.55, 0.04), (0.66, 0.038),
                 (0.8, 0.036), (0.92, 0.033), (0.975, 0.021), (1, 0)],
             hb=[(0, 0), (0.012, 0.017), (0.04, 0.03), (0.09, 0.035), (0.3, 0.037), (0.55, 0.035), (0.66, 0.033),
                 (0.8, 0.029), (0.92, 0.025), (0.975, 0.016), (1, 0)],
             xc=wave)
    th_ = 0.66
    sides = 8

    def paint(t, th, b, s):
        limit = -0.35 - 0.65 * max(0.0, (t - 0.42) / 0.2)
        return belly if math.sin(th) < limit else teal
    ts = [0, 0.012, 0.04, 0.09, 0.15, 0.22, 0.29, 0.36, 0.43, 0.5, 0.57, 0.62, th_]
    rings = body_rings(B, ts, sides) + joint_cap(B, th_, sides, rear=True)
    tmid = [(a + b) / 2 for a, b in zip(ts, ts[1:])] + [th_] * 4
    g = skin(rings, lambda b, s: paint(tmid[b], TAU * (s + 0.5) / sides, b, s)).outward()
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.055, RAD(42), 0.024, pupil=0.66)
    M.body.add(ridge_fin(B, [(0.16, 0), (0.22, 0.02), (0.32, 0.024), (0.42, 0.024), (0.52, 0.022), (0.6, 0.016),
                             (0.64, 0)], sink=0.008, thick=0.01), ridge)
    pec = side_fin(B, 0.1, RAD(-5), paddle(0.035, 0.03, k=1, root=0.6), RAD(45), RAD(-8))
    M.body.add(pec, ridge)
    pec_l = side_fin(B, 0.1, RAD(185), paddle(0.035, 0.03, k=1, root=0.6), RAD(135), RAD(-8))
    M.body.add(pec_l, ridge)
    # The tail is the rear third: it starts inside the joint ellipsoid and tapers to a flat fin tip.
    c = B.centre(th_)
    tail_rings = [[c]] + body_rings(B, [th_, 0.77, 0.87, 0.945], sides) + [[B.centre(1.0)]]
    M.tail.add(skin(tail_rings).outward(), teal)
    M.hinge = c
    M.note = ('The tail is the rear third of the body, joined by an ellipsoid of revolution; it stays sealed at '
              '+-0.6 rad but bends most naturally under ~0.35 rad.')
    return M


def build_swordfish():
    M = Model('fish_swordfish', 'big')
    top = M.m('body', '#2C6BE0', 0.4)
    belly = M.m('belly', '#E9F0FF', 0.42)
    stripe = M.m('back', '#173C9C', 0.42)
    bill = M.m('bill', '#23336B', 0.4)
    sail = M.m('sail', '#1E4FC4', 0.42)
    B = Body(-0.3, 0.37,
             w=[(0, 0), (0.015, 0.018), (0.06, 0.044), (0.18, 0.072), (0.38, 0.077), (0.62, 0.06), (0.84, 0.033),
                (0.95, 0.022), (1, 0)],
             ht=[(0, 0), (0.015, 0.019), (0.06, 0.046), (0.2, 0.082), (0.4, 0.09), (0.64, 0.068), (0.85, 0.037),
                 (0.95, 0.025), (1, 0)],
             hb=[(0, 0), (0.015, 0.017), (0.06, 0.04), (0.2, 0.068), (0.42, 0.074), (0.66, 0.055), (0.86, 0.03),
                 (0.95, 0.021), (1, 0)],
             zc=[(0, 0.008), (0.2, 0.0), (1, 0.01)])

    def paint(t, th, b, s):
        sn = math.sin(th)
        if sn < -0.2:
            return belly
        if sn > 0.8:
            return stripe
        return top
    g = body_loft(B, [0, 0.015, 0.06, 0.13, 0.23, 0.35, 0.48, 0.61, 0.74, 0.86, 0.95, 1], 12, paint)
    M.body.add(g)
    M.mass.append(g)
    nose = B.centre(0.0)
    M.body.add(lathe([(0.017, 0.0), (0.013, 0.09), (0.007, 0.18), (0.0, 0.25)], 6),
               bill, facing(nose + Vector((0, 0.02, 0)), AHEAD))
    add_eyes(M.body, B, 0.1, RAD(26), 0.026)
    M.body.add(ridge_fin(B, [(0.1, 0), (0.13, 0.1), (0.2, 0.17), (0.3, 0.19), (0.41, 0.17), (0.5, 0.12),
                             (0.56, 0.05), (0.6, 0)], thick=0.014), sail)
    M.body.add(ridge_fin(B, [(0.72, 0), (0.75, 0.03), (0.78, 0)], side=-1), sail)
    pec_pts = [(0.01, 0.0), (0.02, 0.05), (0.018, 0.11), (0.006, 0.16), (-0.006, 0.1), (-0.012, 0.03)]
    pec = side_fin(B, 0.2, RAD(-28), pec_pts, RAD(40), RAD(-24), centre=(0.003, 0.05))
    for g in (pec, pec.mirrored()):
        M.body.add(g, sail)
    M.hinge = B.centre(0.96)
    M.tail.add(vfin(lunate_tail(0.15, 0.16), (0.055, 0.0), 0.02, M.hinge), sail)
    return M


def build_jelly():
    M = Model('fish_jelly', 'small', wag=0.45)
    bell = M.m('bell', '#FF72BF', 0.35, emit='#FF84C8', strength=0.6)
    rim = M.m('rim', '#FFC4E4', 0.38, emit='#FFC4E4', strength=0.45)
    inner = M.m('inner', '#FF2A90', 0.4, emit='#FF2A90', strength=0.3)
    tent = M.m('tentacle', '#FF8ACB', 0.4, emit='#FF8ACB', strength=0.5)
    segs = 16
    # A bell: concave hot-pink underside, a scalloped pale skirt, a soft pink dome.
    prof = [(0.0, 0.04), (0.085, 0.022), (0.126, -0.004), (0.137, 0.012), (0.13, 0.055), (0.1, 0.098),
            (0.055, 0.124), (0.0, 0.132)]

    def mod(th, i):
        return 1 + 0.07 * math.cos(8 * th) if i in (2, 3) else 1.0

    def tag(b, s):
        return inner if b <= 1 else rim if b <= 3 else bell
    g = lathe(prof, segs, mod=mod, phase=TAU / 32, tag=tag).outward()
    M.body.add(g)
    M.mass.append(g)
    # Four round gonads seen through the top of the dome, as on a moon jelly.
    for k in range(4):
        a = RAD(45 + 90 * k)
        nrm = Vector((0.15 * math.cos(a), 0.15 * math.sin(a), 0.99)).normalized()
        pos = Vector((0.045 * math.cos(a), 0.045 * math.sin(a), 0.1255)) + nrm * 0.002
        M.body.add(disc(circle(6, 0.017, 0.3), dome=0.004), inner, facing(pos, nrm))
    for ang in (RAD(270 - 26), RAD(270 + 26)):
        pos = Vector((0.125 * math.cos(ang), 0.125 * math.sin(ang), 0.062))
        add_eye(M.body, pos, Vector((math.cos(ang), math.sin(ang), 0.7)), 0.021, look=0.0, pupil=0.66)
    # Frilly oral arms and thin tentacles stream back at skirt height, so the shallow pond bed never
    # hides them and they show behind the dome from the high camera.
    rng = random.Random(5)
    for dx in (-1, 0, 1):
        wig = rng.uniform(-0.02, 0.02)
        pts = bez([Vector((dx * 0.02, 0.0, 0.03)), Vector((dx * 0.03, 0.07, 0.0)),
                   Vector((dx * 0.045 + wig, 0.15, -0.006)), Vector((dx * 0.03, 0.23, -0.004))], 4)
        M.body.add(tube(pts, [0.02, 0.018, 0.012, 0.0], sides=4, flatten=0.5), inner)
    for k, deg in enumerate((18, 54, 90, 126, 162)):
        a = RAD(deg)
        root = Vector((0.075 * math.cos(a), 0.075 * math.sin(a), 0.03))
        x = root.x * 1.25
        wig = 0.05 * (1 if k % 2 else -1)
        pts = [root, Vector((x, root.y + 0.08, 0.018)), Vector((x + wig, 0.21, 0.008)),
               Vector((x - wig * 0.8, 0.36, 0.012))]
        M.tail.add(tube(pts, [0.013, 0.011, 0.007, 0.0], sides=3, flatten=0.6), tent)
    M.hinge = Vector((0, 0.0, 0.03))
    M.transform(Matrix.Rotation(RAD(6), 4, 'X'))
    M.note = ('Bell tilted 6 degrees forward; the tail is the tentacle cluster, rooted around the hinge '
              'under the bell so any swing keeps it attached.')
    return M


def build_icepike():
    M = Model('fish_icepike', 'medium')
    back = M.m('back', '#1C7AD6', 0.36)
    side = M.m('body', '#6FC4FA', 0.36)
    belly = M.m('belly', '#F0F9FF', 0.4)
    dots = M.m('spots', '#FFFFFF', 0.35)
    fin = M.m('fin', '#BDEBFF', 0.36)
    B = Body(-0.39, 0.24,
             w=[(0, 0), (0.012, 0.013), (0.05, 0.03), (0.13, 0.035), (0.3, 0.042), (0.55, 0.045), (0.78, 0.036),
                (0.92, 0.022), (0.97, 0.016), (1, 0)],
             ht=[(0, 0), (0.012, 0.006), (0.05, 0.016), (0.13, 0.03), (0.3, 0.046), (0.55, 0.052), (0.78, 0.044),
                 (0.92, 0.027), (0.97, 0.02), (1, 0)],
             hb=[(0, 0), (0.012, 0.006), (0.05, 0.014), (0.13, 0.026), (0.3, 0.04), (0.55, 0.046), (0.78, 0.038),
                 (0.92, 0.023), (0.97, 0.018), (1, 0)],
             zc=[(0, -0.012), (0.15, -0.005), (0.4, 0.0), (1, 0.004)], p=[(0, 2.8), (0.2, 2.2), (1, 2.0)])

    def paint(t, th, b, s):
        sn = math.sin(th)
        if sn < -0.5:
            return belly
        if sn > 0.45:
            return back
        return side
    g = body_loft(B, [0, 0.012, 0.05, 0.11, 0.19, 0.29, 0.4, 0.52, 0.64, 0.76, 0.87, 0.96, 1], 10, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.13, RAD(42), 0.022)
    for t, a in ((0.26, 62), (0.34, 30), (0.42, 70), (0.5, 36), (0.58, 66), (0.66, 30), (0.74, 60)):
        for ang in (RAD(a), math.pi - RAD(a)):
            spot(M.body, B, t, ang, 0.0105, dots, n=5)
    M.body.add(ridge_fin(B, [(0.7, 0), (0.72, 0.05), (0.79, 0.052), (0.85, 0.028), (0.87, 0)]), fin)
    M.body.add(ridge_fin(B, [(0.71, 0), (0.74, 0.04), (0.81, 0.038), (0.86, 0)], side=-1), fin)
    pec = side_fin(B, 0.2, RAD(-16), paddle(0.05, 0.03, k=1), RAD(50), RAD(-16))
    pel = side_fin(B, 0.5, RAD(-68), paddle(0.04, 0.024, k=1), RAD(76), RAD(-34))
    for g in (pec, pec.mirrored(), pel, pel.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.965)
    M.tail.add(vfin(fork_tail(0.12, 0.068), (0.04, 0.0), 0.015, M.hinge), fin)
    return M


def build_whale():
    M = Model('fish_whale', 'big', wag=0.5)
    top = M.m('body', '#2670DC', 0.42)
    belly = M.m('belly', '#DDF0FF', 0.45)
    groove = M.m('groove', '#9CCBF7', 0.45)
    B = Body(-0.48, 0.34,
             w=[(0, 0), (0.02, 0.07), (0.08, 0.13), (0.22, 0.17), (0.42, 0.175), (0.62, 0.14), (0.8, 0.08),
                (0.93, 0.042), (0.975, 0.032), (1, 0)],
             ht=[(0, 0), (0.02, 0.06), (0.08, 0.1), (0.25, 0.13), (0.45, 0.13), (0.65, 0.1), (0.82, 0.058),
                 (0.93, 0.034), (0.975, 0.026), (1, 0)],
             hb=[(0, 0), (0.02, 0.06), (0.08, 0.1), (0.25, 0.12), (0.45, 0.11), (0.65, 0.082), (0.82, 0.048),
                 (0.93, 0.03), (0.975, 0.024), (1, 0)],
             zc=[(0, -0.02), (0.3, 0.0), (1, 0.03)])
    sides = 12
    phase = -TAU / 24   # vertices at +-15 degrees, sector centres on the 30 degree grid

    def paint(t, th, b, s):
        sn = math.sin(th)
        if sn < -0.45:
            if t < 0.5 and s % 2 == 0:
                return groove
            return belly
        return top
    g = body_loft(B, [0, 0.02, 0.08, 0.16, 0.27, 0.39, 0.51, 0.63, 0.75, 0.87, 0.975, 1], sides, paint, phase)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.2, RAD(6), 0.032, pupil=0.66, bead=True)
    spot(M.body, B, 0.22, RAD(90), 0.016, eye_materials()[0], n=6, squash=0.6)
    M.body.add(ridge_fin(B, [(0.7, 0), (0.73, 0.03), (0.76, 0.034), (0.78, 0)], thick=0.016), top)
    flip_pts = [(0.018, 0.0), (0.034, 0.04), (0.042, 0.1), (0.03, 0.16), (0.012, 0.17), (-0.008, 0.12),
                (-0.02, 0.04)]
    flip = side_fin(B, 0.3, RAD(-28), flip_pts, RAD(30), RAD(-24), thick=0.018, centre=(0.01, 0.06))
    for g in (flip, flip.mirrored()):
        M.body.add(g, top)
    M.hinge = B.centre(0.972)
    fluke = [(0.018, 0.0), (0.07, 0.035), (0.15, 0.1), (0.19, 0.15), (0.14, 0.155), (0.06, 0.13), (0.0, 0.1),
             (-0.06, 0.13), (-0.14, 0.155), (-0.19, 0.15), (-0.15, 0.1), (-0.07, 0.035), (-0.018, 0.0)]
    M.tail.add(fin2d(fluke, (0.0, 0.05), 0.03).moved(M.hinge), top)
    M.note = 'Tail = horizontal flukes.'
    return M


def build_kraken():
    M = Model('fish_kraken', 'big', wag=0.45)
    body = M.m('body', '#A8267F', 0.4)
    spots = M.m('spots', '#FF8FD2', 0.4)
    belly = M.m('belly', '#DA58AA', 0.42)
    B = Body(-0.42, 0.07,
             w=[(0, 0), (0.05, 0.035), (0.2, 0.075), (0.5, 0.108), (0.78, 0.125), (0.92, 0.118), (0.98, 0.1),
                (1, 0)],
             ht=[(0, 0), (0.05, 0.03), (0.2, 0.066), (0.5, 0.096), (0.78, 0.108), (0.92, 0.1), (0.98, 0.084), (1, 0)],
             hb=[(0, 0), (0.05, 0.028), (0.2, 0.058), (0.5, 0.082), (0.78, 0.09), (0.92, 0.084), (0.98, 0.07), (1, 0)])

    def paint(t, th, b, s):
        return belly if math.sin(th) < -0.4 else body
    g = body_loft(B, [0, 0.05, 0.15, 0.3, 0.46, 0.62, 0.76, 0.88, 0.96, 1], 12, paint)
    M.body.add(g)
    M.mass.append(g)
    fin_pts = [(0.0, 0.0), (0.03, 0.03), (0.06, 0.1), (0.03, 0.11), (-0.02, 0.05)]
    for sx in (1, -1):
        base = B.point(0.18, RAD(0 if sx > 0 else 180))
        g2 = fin2d(fin_pts, (0.015, 0.05), 0.014).transformed(leaf_frame(base - Vector((sx * 0.01, 0, 0)),
                                                                          RAD(-20) if sx > 0 else RAD(200), RAD(4)))
        M.body.add(g2 if sx > 0 else g2, body)
    add_eyes(M.body, B, 0.82, RAD(24), 0.046, pupil=0.62, bead=True)
    for t, a in ((0.3, 90), (0.45, 50), (0.45, 130), (0.6, 90), (0.62, 20), (0.62, 160)):
        spot(M.body, B, t, RAD(a), 0.016, spots, n=6)
    # Tentacles: roots inside the mantle, near the hinge, curling behind.
    rng = random.Random(9)
    for k in range(5):
        a = RAD(-90 + 72 * k + 18)
        d = Vector((math.cos(a), 0, math.sin(a) * 0.7))
        root = Vector((0, 0.03, 0)) + d * 0.035
        spread = Vector((math.cos(a) * 0.11, 0, math.sin(a) * 0.035))
        curl = 1 if math.cos(a) >= 0 else -1
        pts = bez([root, root + spread * 0.6 + Vector((0, 0.12, 0)),
                   root + spread + Vector((0, 0.27, rng.uniform(-0.01, 0.01))),
                   root + spread * 0.7 + Vector((curl * 0.05, 0.38, 0.02))], 4)
        M.tail.add(tube(pts, [0.032, 0.024, 0.013, 0.0], sides=3), body)
    M.hinge = Vector((0, 0.03, 0.0))
    M.note = 'Squid-style mini kraken, mantle first; the tail is five tentacles hinged at the mantle opening.'
    return M


def crown(r, h, points=5):
    n = points * 2
    verts = [(r * math.cos(TAU * i / n), r * math.sin(TAU * i / n), 0.0) for i in range(n)]
    verts += [(1.14 * r * math.cos(TAU * i / n), 1.14 * r * math.sin(TAU * i / n), h if i % 2 == 0 else 0.5 * h)
              for i in range(n)]
    verts.append((0.0, 0.0, 0.42 * h))
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    return Geo(verts, faces)


def build_golden():
    M = Model('fish_golden', 'medium')
    gold = M.m('body', '#FFC21A', 0.3, metal=0.3, emit='#FFB000', strength=0.28)
    light = M.m('belly', '#FFE680', 0.32, metal=0.3, emit='#FFD84A', strength=0.25)
    fin = M.m('fin', '#FFA41F', 0.34, metal=0.2, emit='#FF9A1A', strength=0.35)
    crown_m = M.m('crown', '#FFE34D', 0.28, metal=0.3, emit='#FFD21A', strength=0.45)
    B = Body(-0.2, 0.15,
             w=[(0, 0), (0.02, 0.026), (0.08, 0.055), (0.28, 0.078), (0.5, 0.076), (0.72, 0.056), (0.88, 0.034),
                (0.96, 0.022), (1, 0)],
             ht=[(0, 0), (0.02, 0.024), (0.08, 0.056), (0.3, 0.088), (0.52, 0.088), (0.74, 0.066), (0.9, 0.037),
                 (0.96, 0.025), (1, 0)],
             hb=[(0, 0), (0.02, 0.022), (0.08, 0.05), (0.3, 0.08), (0.52, 0.078), (0.74, 0.058), (0.9, 0.032),
                 (0.96, 0.021), (1, 0)])

    def paint(t, th, b, s):
        return light if math.sin(th) < -0.45 else gold
    g = body_loft(B, [0, 0.02, 0.08, 0.17, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 0.96, 1], 10, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.13, RAD(28), 0.03, bead=True)
    top = Vector((0, B.y(0.2), B.edge(0.2) - 0.014))
    M.body.add(crown(0.034, 0.056), crown_m, xf(top, (RAD(-14), 0, 0)))
    M.body.add(ridge_fin(B, [(0.38, 0), (0.41, 0.07), (0.48, 0.09), (0.58, 0.084), (0.68, 0.064), (0.76, 0.036),
                             (0.8, 0)]), fin)
    pec = side_fin(B, 0.3, RAD(-20), paddle(0.09, 0.05), RAD(50), RAD(-18))
    pel_pts = [(0.012, 0.0), (0.016, 0.05), (0.008, 0.11), (-0.004, 0.12), (-0.012, 0.05)]
    pel = side_fin(B, 0.45, RAD(-70), pel_pts, RAD(78), RAD(-30), centre=(0.002, 0.045))
    for g in (pec, pec.mirrored(), pel, pel.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.965)
    # A fancy double fantail: two forked lobes rolled apart so the tail spreads when seen from above.
    lobe = [(0.0, 0.016), (0.06, 0.064), (0.15, 0.108), (0.25, 0.138), (0.27, 0.1), (0.2, 0.05), (0.235, 0.0),
            (0.2, -0.04), (0.265, -0.092), (0.2, -0.106), (0.1, -0.074), (0.0, -0.014)]
    for sx in (1, -1):
        g2 = vfin(lobe, (0.07, 0.0), 0.014).transformed(Matrix.Rotation(RAD(24) * sx, 4, 'Y'))
        M.tail.add(g2.moved(M.hinge), fin)
    M.note = 'Legendary: light emissive glow, a tiny crown and a double fantail.'
    return M


SUNFISH_ROLL = 85


def build_sunfish():
    M = Model('fish_sunfish', 'big', wag=0.4)
    body = M.m('body', '#7B95BA', 0.38)
    belly = M.m('belly', '#DDE7F3', 0.4)
    spots = M.m('spots', '#C3D3EA', 0.4)
    fin = M.m('fin', '#5B77A2', 0.4)
    B = Body(-0.28, 0.21,
             w=[(0, 0), (0.03, 0.036), (0.12, 0.062), (0.4, 0.078), (0.7, 0.068), (0.9, 0.05), (0.97, 0.042), (1, 0)],
             ht=[(0, 0), (0.03, 0.08), (0.12, 0.155), (0.35, 0.215), (0.6, 0.215), (0.82, 0.18), (0.95, 0.15),
                 (0.97, 0.14), (1, 0)],
             hb=[(0, 0), (0.03, 0.078), (0.12, 0.15), (0.35, 0.205), (0.6, 0.205), (0.82, 0.17), (0.95, 0.14),
                 (0.97, 0.13), (1, 0)])

    def paint(t, th, b, s):
        sn = math.sin(th)
        return belly if sn < -0.55 else body
    g = body_loft(B, [0, 0.03, 0.1, 0.2, 0.33, 0.47, 0.61, 0.75, 0.88, 0.97, 1], 12, paint)
    M.body.add(g)
    M.mass.append(g)
    add_eyes(M.body, B, 0.17, RAD(14), 0.036, pupil=0.62, bead=True)
    for t, a in ((0.42, 36), (0.58, 4)):
        for ang in (RAD(a), math.pi - RAD(a)):
            spot(M.body, B, t, ang, 0.02, spots, n=6)
    lip = B.centre(0.0) + Vector((0, 0.006, -0.01))
    M.body.add(lathe([(0.018, 0.0), (0.012, 0.01), (0.0, 0.004)], 6), fin, facing(lip, AHEAD))
    M.body.add(ridge_fin(B, [(0.56, 0), (0.6, 0.12), (0.66, 0.22), (0.71, 0.23), (0.74, 0.16), (0.78, 0)],
                         thick=0.02), fin)
    M.body.add(ridge_fin(B, [(0.56, 0), (0.6, 0.11), (0.66, 0.2), (0.71, 0.21), (0.74, 0.15), (0.78, 0)],
                         side=-1, thick=0.02), fin)
    pec = side_fin(B, 0.34, RAD(4), paddle(0.05, 0.036, k=1), RAD(40), RAD(-4))
    for g in (pec, pec.mirrored()):
        M.body.add(g, fin)
    M.hinge = B.centre(0.975)
    # The clavus reaches 8 cm into the body so a swing never opens a gap at its ends.
    clavus = [(-0.08, 0.12), (0.02, 0.15), (0.055, 0.12), (0.075, 0.07), (0.068, 0.03), (0.08, 0.0), (0.068, -0.03),
              (0.075, -0.07), (0.055, -0.12), (0.02, -0.145), (-0.08, -0.115)]
    M.tail.add(vfin(clavus, (0.0, 0.0), 0.03, M.hinge), fin)
    # Basking on its side, as ocean sunfish do at the surface: the round side reads from above and
    # the tall disc fits a shallow pond.
    M.transform(Matrix.Rotation(RAD(-SUNFISH_ROLL), 4, 'Y') @ Matrix.Scale(1.07, 4))
    M.note = (f'Basks on its side (rolled {SUNFISH_ROLL} degrees about its length, right side up) so the round '
              'body reads from the high camera and fits a shallow pond.')
    return M


def build_angler():
    M = Model('fish_angler', 'medium')
    body = M.m('body', '#22397A', 0.42)
    belly = M.m('belly', '#3D5EB4', 0.45)
    mouth = M.m('mouth', '#8A1C44', 0.5)
    teeth = M.m('teeth', '#FFFDF6', 0.3)
    stalk = M.m('fin', '#3456A8', 0.42)
    lure = M.m('lure', '#FFF27A', 0.3, emit='#FFE95A', strength=3.0)
    B = Body(-0.28, 0.18,
             w=[(0, 0), (0.02, 0.064), (0.08, 0.1), (0.2, 0.118), (0.35, 0.11), (0.55, 0.082), (0.75, 0.048),
                (0.9, 0.03), (0.97, 0.022), (1, 0)],
             ht=[(0, 0), (0.02, 0.05), (0.08, 0.086), (0.22, 0.104), (0.38, 0.094), (0.58, 0.066), (0.78, 0.042),
                 (0.9, 0.029), (0.97, 0.021), (1, 0)],
             hb=[(0, 0), (0.02, 0.066), (0.08, 0.094), (0.22, 0.094), (0.38, 0.08), (0.58, 0.056), (0.78, 0.034),
                 (0.9, 0.024), (0.97, 0.019), (1, 0)],
             zc=[(0, -0.024), (0.3, 0.0), (1, 0.02)], p=[(0, 2.3), (0.4, 2.0), (1, 2.0)])

    def paint(t, th, b, s):
        sn = math.sin(th)
        if b == 0 and sn < 0.55:
            return mouth
        if sn < -0.3:
            return belly
        return body
    ts = [0, 0.02, 0.08, 0.16, 0.26, 0.38, 0.51, 0.64, 0.77, 0.9, 0.97, 1]
    g = body_loft(B, ts, 12, paint)
    M.body.add(g)
    M.mass.append(g)
    # Teeth along the jaw: lower ones point up, upper ones down.
    for k, (a, up) in enumerate(((RAD(-38), 1), (RAD(-90), 1), (RAD(-142), 1), (RAD(20), -1), (RAD(160), -1))):
        p = B.point(0.012, a)
        d = Vector((0, -0.25, up)).normalized()
        M.body.add(lathe([(0.009, 0.0), (0.0, 0.026)], 3, phase=0.5), teeth, facing(p + Vector((0, -0.004, 0)), d))
    add_eyes(M.body, B, 0.14, RAD(40), 0.028, pupil=0.66)
    root = Vector((0, B.y(0.12), B.edge(0.12) - 0.01))
    path = bez([root, root + Vector((0, -0.01, 0.1)), root + Vector((0, -0.09, 0.14)),
                root + Vector((0, -0.14, 0.09))], 4)
    M.body.add(tube(path, [0.009, 0.007, 0.006, 0.005], sides=3), stalk)
    M.body.add(lathe([(0.0, -0.028), (0.022, -0.017), (0.028, 0.0), (0.022, 0.017), (0.0, 0.028)], 6), lure,
               xf(path[-1] + Vector((0, 0.0, -0.022))))
    M.body.add(ridge_fin(B, [(0.6, 0), (0.63, 0.04), (0.7, 0.034), (0.74, 0)]), stalk)
    pec = side_fin(B, 0.36, RAD(-10), paddle(0.07, 0.06), RAD(40), RAD(-10))
    for g in (pec, pec.mirrored()):
        M.body.add(g, stalk)
    M.hinge = B.centre(0.972)
    M.tail.add(vfin(round_tail(0.13, 0.068), (0.045, 0.0), 0.018, M.hinge), stalk)
    M.note = 'Emissive lure bulb on a stalk ahead of the mouth.'
    return M


def build_manta():
    M = Model('fish_manta', 'big', wag=0.5)
    top = M.m('body', '#1B274A', 0.42)
    under = M.m('belly', '#F2F6FF', 0.45)
    mark = M.m('mark', '#8FA8D8', 0.45)
    a_ = pchip([(0, 0.215), (0.1, 0.2), (0.2, 0.158), (0.3, 0.112), (0.4, 0.066), (0.46, 0.036), (0.5, 0.0)])
    yc = pchip([(0, 0.0), (0.1, 0.01), (0.2, 0.034), (0.3, 0.062), (0.4, 0.09), (0.5, 0.118)])
    bt = pchip([(0, 0.05), (0.1, 0.042), (0.2, 0.026), (0.3, 0.015), (0.4, 0.009), (0.5, 0.0)])
    bb = pchip([(0, 0.03), (0.1, 0.026), (0.2, 0.017), (0.3, 0.011), (0.4, 0.007), (0.5, 0.0)])
    zc = pchip([(0, 0.0), (0.2, 0.0), (0.35, 0.012), (0.5, 0.045)])
    xs = [-0.5, -0.45, -0.37, -0.27, -0.17, -0.075, 0.0, 0.075, 0.17, 0.27, 0.37, 0.45, 0.5]
    sides = 10
    rings = []
    for x in xs:
        u = abs(x)
        if a_(u) < 1e-4:
            rings.append([Vector((x, yc(u), zc(u)))])
            continue
        ring = []
        for s in range(sides):
            ph = TAU * s / sides
            cs, sn = math.cos(ph), math.sin(ph)
            ring.append(Vector((x, yc(u) + a_(u) * cs, zc(u) + (bt(u) if sn >= 0 else bb(u)) * sn)))
        rings.append(ring)

    def tag(b, s):
        u = abs((xs[b] + xs[b + 1]) / 2)
        ph = TAU * (s + 0.5) / sides
        if math.sin(ph) < -0.2:
            return under
        if 0.1 < u < 0.3 and math.cos(ph) < -0.3 and math.sin(ph) > 0.5:
            return mark
        return top
    g = skin(rings, tag).outward()
    M.body.add(g)
    M.mass.append(g)
    horn = [(0.0, 0.0), (0.016, 0.02), (0.02, 0.06), (0.008, 0.085), (-0.012, 0.06), (-0.014, 0.02)]
    for sx in (1, -1):
        base = Vector((sx * 0.09, -0.185, 0.004))
        frame = leaf_frame(base, RAD(-90 + sx * 8), RAD(-8), roll=RAD(70) * sx)
        g2 = fin2d(horn, (0.0, 0.035), 0.012).transformed(frame)
        M.body.add(g2, top)
        add_eye(M.body, Vector((sx * 0.112, -0.16, 0.014)), Vector((sx * 1.0, -0.4, 0.55)), 0.019, pupil=0.66)
    M.body.add(blade([Vector((0, 0.18, 0.02)), Vector((0, 0.2, 0.024)), Vector((0, 0.225, 0.012))],
                     [Vector((0, 0.18, 0.02)), Vector((0, 0.215, 0.05)), Vector((0, 0.225, 0.012))],
                     [Vector((1, 0, 0))] * 3, 0.012), top)
    M.hinge = Vector((0, 0.2, 0.0))
    pts = [Vector((0, 0.19, 0.0)), Vector((0, 0.3, 0.004)), Vector((0.012, 0.42, 0.01)), Vector((0.03, 0.54, 0.014))]
    M.tail.add(tube(pts, [0.013, 0.008, 0.005, 0.0], sides=3), top)
    M.note = 'Tail = thin whip tail; pale shoulder marks on the dark back.'
    return M


def build_boot():
    M = Model('boot', 'junk')
    leather = M.m('leather', '#A0582C', 0.55)
    sole = M.m('sole', '#3C2A22', 0.6)
    lace = M.m('lace', '#F6C57A', 0.5)
    inside = M.m('inside', '#2A1810', 0.6)
    patch = M.m('patch', '#D69A5A', 0.55)
    weed = M.m('weed', '#3FBF4A', 0.5)
    foot = Body(-0.22, 0.12,
                w=[(0, 0), (0.03, 0.046), (0.14, 0.066), (0.45, 0.07), (0.8, 0.066), (0.95, 0.054), (1, 0)],
                ht=[(0, 0), (0.03, 0.03), (0.15, 0.052), (0.45, 0.068), (0.8, 0.07), (1, 0)],
                hb=[(0, 0), (0.03, 0.03), (0.15, 0.04), (0.45, 0.042), (0.8, 0.042), (1, 0)],
                zc=-0.12, p=2.6)
    sides = 8

    def paint(t, th, b, s):
        return sole if math.sin(th) < -0.6 else leather
    g = body_loft(foot, [0, 0.03, 0.12, 0.3, 0.55, 0.8, 0.95, 1], sides, paint, phase=TAU / 16)
    M.body.add(g)
    M.mass.append(g)
    # Shaft: an oval tube with a turned-down cuff and a dark opening.
    shaft = lathe([(0.07, -0.1), (0.072, 0.11), (0.08, 0.15), (0.064, 0.158)], 10,
                  tag=lambda b, s: lace if b >= 1 else leather)
    M.body.add(shaft, None, xf((0, 0.055, 0), (0, 0, 0), (1.0, 1.12, 1.0)))
    M.body.add(disc(circle(10, 0.066), dome=-0.02), inside, xf((0, 0.055, 0.148), (0, 0, 0), (1.0, 1.12, 1.0)))
    M.mass.append(lathe([(0.0, -0.1), (0.07, -0.1), (0.072, 0.11), (0.07, 0.155), (0.0, 0.155)], 10).outward()
                  .transformed(xf((0, 0.055, 0), (0, 0, 0), (1.0, 1.12, 1.0))))
    # Heel block.
    heel = lathe([(0.052, -0.176), (0.052, -0.14), (0.0, -0.14)], 6, phase=TAU / 12, cap_bottom=True)
    M.body.add(heel.outward(), sole, xf((0, 0.085, 0), (0, 0, 0), (1.0, 0.8, 1.0)))
    # Laces criss-crossing the front of the shaft, bowed to follow its curve.
    for z0, z1 in ((0.0, 0.07), (0.07, 0.0), (0.1, 0.1)):
        M.body.add(tube([Vector((-0.042, -0.006, z0)), Vector((0.0, -0.026, (z0 + z1) / 2)),
                         Vector((0.042, -0.006, z1))], 0.007, sides=3), lace)
    M.body.add(disc([(-0.028, -0.024), (0.028, -0.026), (0.03, 0.026), (-0.026, 0.028)], dome=0.004), patch,
               facing(Vector((0.083, 0.07, 0.02)), Vector((1, 0, 0))))
    M.body.add(fin2d([(0.0, 0.0), (0.012, 0.05), (0.004, 0.11), (-0.01, 0.06)], (0.0, 0.03), 0.008), weed,
               leaf_frame(Vector((0.05, 0.02, 0.15)), RAD(20), RAD(-55), roll=RAD(20)))
    M.note = 'Junk catch: an old boot with a strand of pond weed.'
    return M


BUILDERS = dict(fish_perch=build_perch, fish_clown=build_clown, fish_puffer=build_puffer, fish_carp=build_carp,
                fish_shark=build_shark, fish_rainbow=build_rainbow, fish_catfish=build_catfish, fish_koi=build_koi,
                fish_eel=build_eel, fish_swordfish=build_swordfish, fish_jelly=build_jelly,
                fish_icepike=build_icepike, fish_whale=build_whale, fish_kraken=build_kraken,
                fish_golden=build_golden, fish_sunfish=build_sunfish, fish_angler=build_angler,
                fish_manta=build_manta, boot=build_boot)


def realise(M):
    """Empty at the centre of mass, body mesh, tail mesh with its origin on the hinge."""
    com = mass_centre(M.mass)
    if M.symmetric:
        com.x = 0.0
    com = Vector(tuple(round(c, 4) for c in com))
    empty = bpy.data.objects.new(M.id, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.empty_display_size = 0.15
    bpy.context.scene.collection.objects.link(empty)
    body = triangulate(M.body.build(offset=com))
    body.parent = empty
    tail = None
    hinge = None
    if M.tail is not None:
        h = Vector(tuple(round(c, 4) for c in M.hinge))
        tail = triangulate(M.tail.build(offset=h))
        tail.parent = empty
        tail.location = h - com
        hinge = h - com
    # Top of the main body (fins excluded): how deep the centre must sit to keep the body under water.
    body_top = max(v.z for g in M.mass for v in g.verts) - com.z
    return dict(model=M, empty=empty, body=body, tail=tail, com=com, hinge=hinge, body_top=body_top)


# Display scales that bring fish to ~35-45 px at the game's zoom (~43 px per metre), like the reference.
DISPLAY_SCALE = {'small': 1.6, 'medium': 1.4, 'big': 1.1, 'junk': 1.4}


def suggested_depth(entry, scale=1.0):
    """Centre depth under the surface that keeps the body (not the fins) just submerged."""
    return round(max(GAME_DEPTH * 0.5, entry['body_top'] * scale + 0.015), 3)


def build_models():
    return {mid: realise(BUILDERS[mid]()) for mid in MODEL_IDS}


# ============================================================== dressing
def build_bobber():
    p = Piece('bobber')
    red = FM('Bobber red', '#EF2B2B', 0.35)
    white = FM('Bobber white', '#FFFDF6', 0.35)
    prof = [(0.0, -0.066), (0.036, -0.056), (0.058, -0.03), (0.064, 0.0), (0.058, 0.03), (0.036, 0.056),
            (0.0, 0.066)]
    g = lathe(prof, 12, tag=lambda b, s: white if b < 3 else red)
    p.add(g.outward())
    p.add(lathe([(0.008, 0.05), (0.007, 0.112), (0.0, 0.116)], 6), white)
    p.add(lathe([(0.0, 0.106), (0.012, 0.114), (0.012, 0.126), (0.0, 0.134)], 6), red)
    return p


def build_lily_pad():
    p = Piece('lily_pad')
    pad = FM('Lily pad', '#43B838', 0.5)
    r, notch = 0.35, RAD(5)
    n = 18
    rim = []
    for i in range(n):
        a = notch + (TAU - 2 * notch) * i / (n - 1)
        k = 1.0 + 0.025 * math.sin(3 * a + 0.4)
        rim.append((r * k * math.cos(a), r * k * math.sin(a)))
    outline = [(0.04, 0.0)] + rim
    m = len(outline)
    top = [Vector((x, y, 0.014 if i else 0.016)) for i, (x, y) in enumerate(outline)]
    low = [Vector((x * 0.975, y * 0.975, -0.006)) for x, y in outline]
    verts = [Vector((0.0, 0.0, 0.019))] + top + low
    faces = [(0, 1 + i, 1 + (i + 1) % m) for i in range(m)]
    faces += [(1 + i, 1 + m + i, 1 + m + (i + 1) % m, 1 + (i + 1) % m) for i in range(m)]
    g = Geo(verts, faces)
    if (g.verts[faces[0][1]] - g.verts[0]).cross(g.verts[faces[0][2]] - g.verts[0]).z < 0:
        g = g.flipped()
    p.add(g, pad)
    return p


def build_lily_flower():
    p = Piece('lily_flower')
    petal = FM('Lily flower', '#FF6FB2', 0.42)
    centre = FM('Lily centre', '#FFC21F', 0.42)
    # The petals start at the origin so the flower rests exactly where it is placed.
    shape = [(0.0, 0.0), (0.024, 0.026), (0.023, 0.062), (0.0, 0.1), (-0.023, 0.062), (-0.024, 0.026)]
    for k in range(8):
        yaw = TAU * k / 8
        p.add(fin2d(shape, (0.0, 0.042), 0.013), petal, leaf_frame((0, 0, 0.006), yaw, RAD(26)))
    small = [(x * 0.82, y * 0.78) for x, y in shape]
    for k in range(6):
        yaw = TAU * (k + 0.5) / 6
        p.add(fin2d(small, (0.0, 0.032), 0.011), petal, leaf_frame((0, 0, 0.012), yaw, RAD(60)))
    p.add(lathe([(0.025, 0.01), (0.023, 0.03), (0.0, 0.037)], 8), centre)
    return p


def build_reeds():
    p = Piece('reeds')
    stem = FM('Reed stem', '#4FAE36', 0.55)
    head = FM('Reed head', '#8A4A22', 0.6)
    specs = [((0.0, 0.0), 0.9, (0.02, -0.01)), ((0.1, 0.05), 0.78, (0.07, 0.03)), ((-0.09, 0.06), 0.7, (-0.07, 0.03)),
             ((0.035, -0.085), 0.62, (0.03, -0.06))]
    for (x, y), h, (lx, ly) in specs:
        base = Vector((x, y, 0.0))
        tip = Vector((x + lx, y + ly, h))
        path = bez([base, Vector((x + lx * 0.2, y + ly * 0.2, h * 0.5)), tip], 9)
        hb = path[5]
        p.add(tube([path[0], path[3], hb], 0.011, sides=3), stem)
        d = (path[6] - hb).normalized()
        length = 0.2 * h
        p.add(lathe([(0.0, -0.01), (0.026, 0.008), (0.026, length - 0.012), (0.0, length)], 4, phase=RAD(45)),
              head, facing(hb, d))
        p.add(lathe([(0.006, 0.0), (0.0, max(0.05, (tip - hb).length - length))], 3), stem,
              facing(hb + d * (length - 0.01), d))
    blade_pts = [(0.0, 0.0), (0.024, 0.2), (0.0, 0.52), (-0.018, 0.2)]
    for yaw, pitch, base in ((RAD(200), RAD(64), (-0.03, 0.02, 0.0)), (RAD(330), RAD(70), (0.05, -0.02, 0.0)),
                             (RAD(95), RAD(72), (0.0, 0.07, 0.0))):
        p.add(fin2d(blade_pts, (0.0, 0.12), 0.012), stem, leaf_frame(base, yaw, pitch))
    return p


def build_dressing():
    out = {}
    for name, fn in (('bobber', build_bobber), ('lily_pad', build_lily_pad), ('lily_flower', build_lily_flower),
                     ('reeds', build_reeds)):
        out[name] = triangulate(fn().build())
    return out


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


def gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def model_stats(entry):
    M, body, tail = entry['model'], entry['body'], entry['tail']
    pts = [v.co.copy() for v in body.data.vertices]
    if tail is not None:
        pts += [v.co + tail.location for v in tail.data.vertices]
    b = bounds(pts)
    length = max(b['size'])
    s = dict(cls=M.cls, length=round(length, 4),
             triangles=dict(body=mesh_tris(body), tail=mesh_tris(tail) if tail else 0),
             materials=dict(body=[m.name for m in body.data.materials],
                            tail=[m.name for m in tail.data.materials] if tail else []),
             bounds=b, top=round(b['max'][2], 4), bottom=round(b['min'][2], 4),
             centre_of_mass_authored=[round(c, 4) for c in entry['com']],
             wag=M.wag, note=M.note)
    s['triangles']['total'] = s['triangles']['body'] + s['triangles']['tail']
    if tail is not None:
        s['tail_hinge'] = [round(c, 4) for c in entry['hinge']]
        s['tail_hinge_gltf'] = gltf(entry['hinge'])
    # Centre depths under the water surface: body just submerged (fins may break the surface, which
    # reads well for sharks and sails), everything submerged, and the body at the suggested display scale.
    s['body_top'] = round(entry['body_top'], 4)
    s['display_scale'] = DISPLAY_SCALE[M.cls]
    s['depth'] = dict(body_under=suggested_depth(entry), all_under=round(b['max'][2] + 0.015, 3),
                      body_under_at_display_scale=suggested_depth(entry, DISPLAY_SCALE[M.cls]))
    return s


def check_model(mid, s, entry):
    errors = []
    tri = s['triangles']
    limit = BOOT_LIMIT if mid == 'boot' else TRI_LIMIT
    if tri['total'] > limit:
        errors.append(f"{tri['total']} triangles > {limit}")
    tail = entry['tail']
    if mid != 'boot':
        if tail is None:
            errors.append('no tail')
        else:
            if tri['tail'] > TAIL_LIMIT:
                errors.append(f"tail {tri['tail']} triangles > {TAIL_LIMIT}")
            if len(s['materials']['tail']) != 1:
                errors.append(f"tail has {len(s['materials']['tail'])} materials")
            if tail.name != mid + '_tail' or any(abs(r) > 1e-9 for r in tail.rotation_euler):
                errors.append('tail name/rotation')
    elif tail is not None:
        errors.append('boot must not have a tail')
    if entry['body'].name != mid + '_body' or entry['empty'].name != mid:
        errors.append('node names')
    lo, hi = CLASS_RANGE[s['cls']]
    if not lo <= s['length'] <= hi:
        errors.append(f"length {s['length']} outside {s['cls']} {lo}..{hi}")
    for name in s['materials']['body'] + s['materials']['tail']:
        if not name.startswith('Fish '):
            errors.append(f'material name {name}')
        info = material_info(bpy.data.materials[name])
        if info['metal'] > (0.3 if mid == 'fish_golden' else 0.0) + 1e-6:
            errors.append(f"{name} metallic {info['metal']}")
        if not 0.15 <= info['rough'] <= 0.6:
            errors.append(f"{name} roughness {info['rough']}")
    return errors


DRESSING_CONTRACT = {
    'bobber': dict(mats={'Bobber red', 'Bobber white'}, tris=200, h=(0.17, 0.23)),
    'lily_pad': dict(mats={'Lily pad'}, tris=60, r=(0.32, 0.38)),
    'lily_flower': dict(mats={'Lily flower', 'Lily centre'}, tris=240, w=(0.15, 0.21)),
    'reeds': dict(mats={'Reed stem', 'Reed head'}, tris=150, h=(0.8, 1.0)),
}


DRESSING_NOTES = {
    'bobber': 'Origin at the waterline: white half below, red half above. The line anchor is the antenna tip.',
    'lily_pad': 'Origin at the water surface; the pad top is 0.014-0.019 above it (place lily_flower there).',
    'lily_flower': 'Origin at the flower base (its lowest point): set it on a lily_pad top (+0.016) or on the water.',
    'reeds': 'Origin at the ground where the stems stand; four cattails and three leaves.',
}


def dressing_stats(obj):
    pts = [v.co for v in obj.data.vertices]
    b = bounds(pts)
    s = dict(triangles=mesh_tris(obj), materials=[m.name for m in obj.data.materials], bounds=b,
             radius_xy=round(max(math.hypot(p.x, p.y) for p in pts), 4), note=DRESSING_NOTES[obj.name])
    if obj.name == 'bobber':
        tip = max(pts, key=lambda p: p.z)
        s['line_anchor'] = [round(tip.x, 4), round(tip.y, 4), round(tip.z, 4)]
        s['line_anchor_gltf'] = gltf(tip)
    return s


def check_dressing(name, s):
    c = DRESSING_CONTRACT[name]
    errors = []
    if s['triangles'] > c['tris']:
        errors.append(f"{s['triangles']} triangles > {c['tris']}")
    if set(s['materials']) != c['mats']:
        errors.append(f"materials {sorted(s['materials'])}")
    b = s['bounds']
    if 'h' in c and not c['h'][0] <= b['size'][2] <= c['h'][1]:
        errors.append(f"height {b['size'][2]} outside {c['h']}")
    if 'r' in c and not c['r'][0] <= s['radius_xy'] <= c['r'][1]:
        errors.append(f"radius {s['radius_xy']} outside {c['r']}")
    if 'w' in c and not c['w'][0] <= max(b['size'][0], b['size'][1]) <= c['w'][1]:
        errors.append(f"width {max(b['size'][0], b['size'][1])} outside {c['w']}")
    if name == 'bobber' and not (b['min'][2] < -0.03 and b['max'][2] > 0.1):
        errors.append('bobber must straddle the waterline')
    if name in ('lily_pad', 'lily_flower', 'reeds') and b['min'][2] < -0.012:
        errors.append(f"base z {b['min'][2]}")
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
    """Drop lights, cameras and the ground from a previous preview before setting up the next."""
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('Preview ground'):
            bpy.data.objects.remove(o, do_unlink=True)


def _preview_studio(size, ground=None):
    """style.studio toned like the other kit previews (dimmer world, -0.4 EV)."""
    _clear_stage()
    studio(ground_color=ground, size=size)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.55
    scene.view_settings.exposure = -0.4
    _eevee(48)


def _mesh(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _ellipse(name, rx, ry, z, material, n=64, loc=(0, 0)):
    verts = [(loc[0], loc[1], z)] + [(loc[0] + rx * math.cos(TAU * i / n), loc[1] + ry * math.sin(TAU * i / n), z)
                                     for i in range(n)]
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    return _mesh(name, verts, faces, material)


def _ring(name, r0, r1, z0, z1, material, n=64, sy=1.0, loc=(0, 0)):
    """An annulus (z0 == z1) or a wall between two ellipses."""
    verts = []
    for r, z in ((r0, z0), (r1, z1)):
        verts += [(loc[0] + r * math.cos(TAU * i / n), loc[1] + r * sy * math.sin(TAU * i / n), z) for i in range(n)]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    obj = _mesh(name, verts, faces, material)
    return obj


def water_mat(alpha=0.55):
    """The game's water (world.ts): #7fdcfa, transparent. No specular: three.js has no environment map
    there, so the sky must not whiten it."""
    m = mat(f'Preview water {round(alpha * 100)}', '#7FDCFA', 0.1, alpha=alpha)
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for key in ('Specular IOR Level', 'Specular'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.0
            break
    return m


def game_pond(loc=(0, 0), radius=5.6, water_alpha=0.55):
    """The game's pond (world.ts makePond) in Blender units: sand rim, blue bed with a deeper centre,
    translucent water at 0.17 (three.js y -> Blender z, three.js z scaled 0.72 -> Blender y)."""
    s = radius / 5.6
    sy = 0.72
    objs = []
    lawn = mat('Preview lawn', '#75E444', 0.9)
    objs.append(_ring('Pond lawn', 5.8 * s, 60, 0.0, 0.0, lawn, sy=sy, loc=loc))
    sand = mat('Preview sand', '#F1D9A0', 0.8)
    objs.append(_ring('Pond rim top', 5.6 * s, 5.8 * s, 0.16, 0.16, sand, sy=sy, loc=loc))
    objs.append(_ring('Pond rim wall', 5.8 * s, 5.8 * s, 0.0, 0.16, sand, sy=sy, loc=loc))
    objs.append(_ring('Pond rim inner', 5.6 * s, 5.6 * s, 0.16, 0.03, sand, sy=sy, loc=loc))
    objs.append(_ellipse('Pond bed', 5.6 * s, 5.6 * s * sy, 0.035, mat('Preview bed', '#2AA3DC', 0.8), loc=loc))
    objs.append(_ellipse('Pond deep', 3.4 * s, 3.4 * s * 0.7, 0.045, mat('Preview deep', '#1478C0', 0.8), loc=loc))
    water = _ellipse('Pond water', 5.2 * s, 5.2 * s * sy, 0.18, water_mat(water_alpha), loc=loc)
    water.visible_shadow = False
    objs.append(water)
    return objs


def place_model(entry, loc, heading=0.0, wag=0.0, scale=1.0, roll=0.0):
    """heading: radians, 0 = head toward -Y (the game's +Z); roll: about the model's length axis."""
    e = entry['empty']
    e.location = loc
    e.rotation_euler = (0.0, roll, heading)
    e.scale = (scale, scale, scale)
    if entry['tail'] is not None:
        entry['tail'].rotation_euler = (0.0, 0.0, wag)


def show_model(entry, visible=True):
    for o in (entry['empty'], entry['body'], entry['tail']):
        if o is not None:
            o.hide_render = not visible


def reset_models(models):
    for entry in models.values():
        place_model(entry, (0, 0, 0))
        show_model(entry)


def lineup_positions(ids, cols, dx, dy, origin=(0.0, 0.0)):
    out = {}
    rows = math.ceil(len(ids) / cols)
    for i, mid in enumerate(ids):
        r, c = divmod(i, cols)
        out[mid] = (origin[0] + (c - (cols - 1) / 2) * dx, origin[1] + ((rows - 1) / 2 - r) * dy)
    return out


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
    """Paste rendered PNGs (sRGB bytes) at pixel offsets into one WebP."""
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


def preview_game(models, dressing):
    """fish.webp. Top: every model from the game camera under translucent water, each at its suggested
    depth. Bottom: the game's own pond at the game's zoom (43 px per metre), as the game sets it now and
    with the suggested water opacity, depths and display scales."""
    W, H = 1600, 900
    _preview_studio((W, H))
    scene = bpy.context.scene
    for d in dressing.values():
        d.hide_render = True
    water = _ellipse('Lineup water', 14, 9, 0.18, water_mat(0.4), n=48)
    water.visible_shadow = False
    bed = _ellipse('Lineup bed', 14, 9, 0.035, mat('Preview bed', '#2AA3DC', 0.8), n=48)
    pos = lineup_positions(MODEL_IDS, 5, 1.45, 1.2)
    rng = random.Random(3)
    for mid in MODEL_IDS:
        x, y = pos[mid]
        place_model(models[mid], (x, y, 0.17 - suggested_depth(models[mid])),
                    heading=RAD(-90 + rng.uniform(-14, 14)), wag=RAD(rng.uniform(-20, 20)))
    cam = game_camera(target=(0, 0, 0.1), ortho_scale=7.6)
    labels = [hud_label(cam, 'Game camera, water opacity 0.40, every model at scale 1 and its suggested depth',
                        -0.485, 0.48, 0.12, (W, H))]
    top_path = os.path.join(PREVIEWS, '_fish_top.png')
    render(top_path)
    _remove([water, bed] + labels)
    tiles = []
    settings = [('Game now: water 0.55, depth 0.09, scale 1', 0.55, False),
                ('Suggested: water 0.38, depth per species, scale x1.6 / 1.4 / 1.1', 0.38, True)]
    for k, (text, alpha, suggested) in enumerate(settings):
        cx = k * 20.0
        pond = game_pond(loc=(cx, 0), water_alpha=alpha)
        rng = random.Random(7)
        for i, mid in enumerate(FISH_IDS):
            e = models[mid]
            s = DISPLAY_SCALE[e['model'].cls] if suggested else 1.0
            depth = suggested_depth(e, s) if suggested else GAME_DEPTH
            a = TAU * i / len(FISH_IDS) + rng.uniform(-0.1, 0.1)
            rr = 0.35 + 0.5 * ((i * 7) % 5) / 4
            place_model(e, (cx + math.cos(a) * 5.2 * rr * 0.9, math.sin(a) * 3.74 * rr * 0.9, 0.17 - depth),
                        heading=rng.uniform(0, TAU), wag=RAD(rng.uniform(-25, 25)), scale=s)
        show_model(models['boot'], False)
        pads = []
        for j in range(5):
            o = dressing['lily_pad'].copy()
            scene.collection.objects.link(o)
            o.hide_render = False
            o.location = (cx + math.sin(j * 1.4) * 3.0, math.cos(j * 1.4) * 2.0 * 0.72, 0.18)
            o.rotation_euler = (0, 0, j * 1.1)
            pads.append(o)
        cam.location = (cx, 0.0 - 25.4, 0.1 + 23.0)
        cam.data.ortho_scale = 800 / 43.0
        scene.render.resolution_x, scene.render.resolution_y = 800, 520
        lab = hud_label(cam, text, -0.48, 0.47, 0.4, (800, 520))
        path = os.path.join(PREVIEWS, f'_fish_game_{k}.png')
        render(path)
        tiles.append(path)
        _remove(pond + pads + [lab])
        show_model(models['boot'])
    reset_models(models)
    scene.render.resolution_x, scene.render.resolution_y = W, H
    bpy.data.objects.remove(cam, do_unlink=True)
    _composite([top_path] + tiles, [(0, 0), (0, H), (800, H)], (W, H + 520),
               os.path.join(PREVIEWS, 'fish.webp'))


def _camera(name, elevation, target, ortho, distance=20.0, yaw=0.0):
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elevation), RAD(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.location = Vector(target) + d * distance
    bpy.context.scene.camera = cam
    return cam


def preview_closeup(models, dressing):
    """fish-closeup.webp: every model at a 3/4 view, head to the left."""
    _preview_studio((2000, 1250), ground='#BDEBFA')
    for d in dressing.values():
        d.hide_render = True
    ground = bpy.data.objects.get('Preview ground')
    if ground:
        ground.location.z = -0.4
    pos = lineup_positions(MODEL_IDS, 5, 1.42, 1.5)
    for mid in MODEL_IDS:
        x, y = pos[mid]
        place_model(models[mid], (x, y, 0.0), heading=RAD(-90 + 24), wag=RAD(14))
    _camera('Closeup camera', 32, (0.05, 0.05, 0.0), 6.9)
    render(os.path.join(PREVIEWS, 'fish-closeup.webp'))
    reset_models(models)


def preview_dressing(models, dressing):
    """pond-dressing.webp: pads, flowers, reeds and the bobber on the game's water from the game camera."""
    _preview_studio((1400, 900))
    scene = bpy.context.scene
    for entry in models.values():
        show_model(entry, False)
    pond = game_pond(loc=(0, 3.0), radius=5.6, water_alpha=0.45)
    for d in dressing.values():
        d.hide_render = True
    placed = []

    def put(name, loc, rz=0.0, s=1.0):
        o = dressing[name].copy()
        scene.collection.objects.link(o)
        o.hide_render = False
        o.location = loc
        o.rotation_euler = (0, 0, rz)
        o.scale = (s, s, s)
        placed.append(o)
        return o
    surface = 0.18
    for (x, y), rz, s in (((-1.2, 0.3), 0.3, 1.0), ((-0.45, -0.25), 2.2, 0.85), ((0.5, 0.55), 4.1, 1.1),
                          ((1.35, -0.1), 1.2, 0.9), ((-1.9, -0.55), 5.0, 0.75)):
        put('lily_pad', (x, y, surface), rz, s)
    put('lily_flower', (-1.2, 0.3, surface + 0.016), 0.4)
    put('lily_flower', (0.5, 0.55, surface + 0.018), 1.3, 0.9)
    put('lily_flower', (-0.45, -0.25, surface + 0.014), 2.0, 0.85)
    rim_y = 3.0 - 5.7 * 0.72
    for x, rz in ((-2.3, 0.2), (2.1, 2.5), (0.9, 4.0)):
        put('reeds', (x, rim_y - 0.25 + abs(x) * 0.02, 0.0), rz)
    put('bobber', (0.95, -0.55, surface + 0.03), 0.0)
    # The line runs from the antenna tip (the anchor) back toward the explorer on the near shore.
    tip = Vector((0.95, -0.55, surface + 0.03 + 0.134))
    line = tube(bez([tip, tip + Vector((-0.3, -0.7, 0.2)), tip + Vector((-0.7, -2.6, 1.3))], 6), 0.005, sides=4)
    line_obj = _mesh('Preview line', [tuple(v) for v in line.verts], line.faces, mat('Preview line', '#FFFFFF', 0.4))
    for mid, (x, y), h in (('fish_perch', (-0.2, 0.25), RAD(-120)), ('fish_koi', (1.3, 0.75), RAD(-40)),
                           ('fish_clown', (0.35, -0.2), RAD(160))):
        entry = models[mid]
        show_model(entry)
        place_model(entry, (x, y, 0.17 - suggested_depth(entry)), heading=h, wag=RAD(18))
    game_camera(target=(0.0, -0.2, 0.2), ortho_scale=5.0)
    render(os.path.join(PREVIEWS, 'pond-dressing.webp'))
    _remove(placed + pond + [line_obj])
    reset_models(models)


def debug_wag(models, dressing, out_dir):
    """Check renders (not deliverables): every tail swung to +-0.6 rad, the game's hooked-fish swing."""
    os.makedirs(out_dir, exist_ok=True)
    _preview_studio((2000, 1250), ground='#DDF3FA')
    for d in dressing.values():
        d.hide_render = True
    bpy.data.objects['Preview ground'].location.z = -0.4
    pos = lineup_positions(MODEL_IDS, 5, 1.42, 1.5)
    for sign in (1, -1):
        for mid in MODEL_IDS:
            x, y = pos[mid]
            place_model(models[mid], (x, y, 0.0), heading=RAD(-90), wag=0.6 * sign)
        for name, elev in (('top', 89.9), ('side', 30)):
            cam = _camera('Debug camera', elev, (0.05, 0.05, 0.0), 6.9)
            render(os.path.join(out_dir, f'wag_{name}_{"pos" if sign > 0 else "neg"}.png'))
            bpy.data.objects.remove(cam, do_unlink=True)
    # The dressing pieces up close from the game camera.
    for entry in models.values():
        show_model(entry, False)
    for i, name in enumerate(DRESSING_IDS):
        dressing[name].hide_render = False
        dressing[name].location = ((i - 1.5) * 0.9, 0.0, 0.0)
    cam = _camera('Debug camera', 42.16, (0.0, 0.0, 0.2), 3.8)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1600, 700
    render(os.path.join(out_dir, 'dressing.png'))
    bpy.data.objects.remove(cam, do_unlink=True)
    for name in DRESSING_IDS:
        dressing[name].location = (0.0, 0.0, 0.0)
        dressing[name].hide_render = True
    reset_models(models)


# ==================================================================== icons
# Icon poses (degrees): heading 0 = head toward -Y, -90 = head to screen left; camera elevation; tail
# wag. roll turns the model about its length axis (shows the basking sunfish upright); tail_pitch
# swings the tail about its hinge's X axis (lets the jellyfish's streaming tentacles hang).
ICON_DEFAULT = dict(heading=-62, elevation=36, wag=12, roll=0, tail_pitch=0)
ICON_VIEW = {
    'fish_jelly': dict(heading=-68, elevation=18, wag=0, tail_pitch=-72),
    'fish_kraken': dict(heading=-55, elevation=40), 'fish_manta': dict(heading=-40, elevation=52, wag=8),
    'fish_eel': dict(heading=-60, elevation=56, wag=0), 'fish_sunfish': dict(elevation=26, wag=8, roll=SUNFISH_ROLL),
    'fish_swordfish': dict(heading=-66, elevation=34, wag=10), 'fish_whale': dict(heading=-58, elevation=34, wag=10),
    'fish_puffer': dict(heading=-50, elevation=30), 'boot': dict(heading=-60, elevation=28, wag=0),
}


def icon_camera(objs, elevation=35, margin=1.08):
    data = bpy.data.cameras.new('Icon camera')
    data.type = 'ORTHO'
    cam = bpy.data.objects.new('Icon camera', data)
    bpy.context.scene.collection.objects.link(cam)
    e = RAD(elevation)
    direction = Vector((0.0, -math.cos(e), math.sin(e)))
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    cam.location = direction * 10
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


def render_icons(models):
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
    os.makedirs(ICONS, exist_ok=True)
    written = {}
    for mid, entry in models.items():
        for other in models.values():
            for o in (other['empty'], other['body'], other['tail']):
                if o is not None:
                    o.hide_render = other is not entry
        view = dict(ICON_DEFAULT, **ICON_VIEW.get(mid, {}))
        elevation = view['elevation']
        place_model(entry, (0, 0, 0), heading=RAD(view['heading']), wag=RAD(view['wag']), roll=RAD(view['roll']))
        if entry['tail'] is not None:
            entry['tail'].rotation_euler.x = RAD(view['tail_pitch'])
        bpy.context.view_layer.update()
        objs = [o for o in (entry['body'], entry['tail']) if o is not None]
        cam = icon_camera(objs, elevation)
        path = os.path.join(ICONS, mid + '.webp')
        scene.render.image_settings.file_format = 'WEBP'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.image_settings.quality = 88
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
        place_model(entry, (0, 0, 0))
        written[mid] = os.path.getsize(path)
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

    for i, mid in enumerate(ids):
        img = bpy.data.images.load(os.path.join(ICONS, mid + '.webp'))
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
    if opts['only'] not in (None, 'models', 'icons'):
        raise SystemExit('--only must be models or icons')
    return opts


def report(stats, dress):
    print('\n== fish')
    for mid, s in stats.items():
        t = s['triangles']
        b = s['bounds']
        print(f"  {mid:15s} {t['total']:3d} tris (tail {t['tail']:2d})  len {s['length']:.3f}  "
              f"z {b['min'][2]:+.3f}..{b['max'][2]:+.3f}  w {b['size'][0]:.3f}  hinge {s.get('tail_hinge')}")
    print('== dressing')
    for name, s in dress.items():
        print(f"  {name:12s} {s['triangles']:3d} tris  size {s['bounds']['size']}  {s['materials']}")


def main():
    opts = parse_args()
    sections = [opts['only']] if opts['only'] else ['models', 'icons']
    manifest = load_manifest()
    manifest['generator'] = 'art/blender/kit/build_fish.py'
    manifest['blender'] = bpy.app.version_string
    manifest['coordinates'] = ('Blender Z up, head toward -Y (glTF Y up, head toward +Z); metres; each model '
                               'empty sits at the centre of mass; tail origin = hinge, wag about local Y (glTF)')
    failures = []

    if 'models' in sections:
        reset_scene()
        models = build_models()
        dressing = build_dressing()
        stats = {mid: model_stats(e) for mid, e in models.items()}
        dress = {name: dressing_stats(o) for name, o in dressing.items()}
        report(stats, dress)
        for mid, s in stats.items():
            failures += [f'{mid}: {e}' for e in check_model(mid, s, models[mid])]
        for name, s in dress.items():
            failures += [f'{name}: {e}' for e in check_dressing(name, s)]
        objects = []
        for mid in MODEL_IDS:
            e = models[mid]
            objects += [o for o in (e['empty'], e['body'], e['tail']) if o is not None]
        objects += [dressing[n] for n in DRESSING_IDS]
        path = os.path.join(MODELS, 'fish.glb')
        size = export_glb(objects, path)
        print(f'  fish.glb {size} bytes')
        if size > GLB_LIMIT:
            failures.append(f'fish.glb is {size} bytes (> {GLB_LIMIT})')
        mats = sorted({m for s in stats.values() for m in s['materials']['body'] + s['materials']['tail']}
                      | {m for s in dress.values() for m in s['materials']})
        manifest['models'] = dict(file='fish.glb', bytes=size, game_depth=GAME_DEPTH, fish=stats, dressing=dress,
                                  emissive={m: material_info(bpy.data.materials[m])['strength'] for m in mats
                                            if material_info(bpy.data.materials[m])['emissive']},
                                  materials=mats)
        if opts['render']:
            preview_game(models, dressing)
            preview_closeup(models, dressing)
            preview_dressing(models, dressing)
        if opts['debug']:
            debug_wag(models, dressing, opts['debug'])

    if 'icons' in sections:
        reset_scene()
        models = build_models()
        sizes = render_icons(models)
        for mid, size in sizes.items():
            if size > ICON_LIMIT:
                failures.append(f'icon {mid}.webp is {size} bytes (> {ICON_LIMIT})')
        manifest['icons'] = dict(dir='icons/fish', size=[160, 160], bytes=sizes)
        if opts['render']:
            contact_sheet(MODEL_IDS, os.path.join(PREVIEWS, 'fish-icons.webp'))

    save_manifest(manifest)
    if failures:
        raise RuntimeError('Fish kit contract failures:\n  ' + '\n  '.join(failures))

    if opts['install']:
        if 'models' in sections:
            os.makedirs(PUBLIC_MODELS, exist_ok=True)
            shutil.copy2(os.path.join(MODELS, 'fish.glb'), os.path.join(PUBLIC_MODELS, 'fish.glb'))
            print('installed fish.glb')
        if 'icons' in sections:
            os.makedirs(PUBLIC_ICONS, exist_ok=True)
            for mid in MODEL_IDS:
                shutil.copy2(os.path.join(ICONS, mid + '.webp'), os.path.join(PUBLIC_ICONS, mid + '.webp'))
            print('installed', len(MODEL_IDS), 'icons')
    print('\nFish kit OK')


if __name__ == '__main__':
    main()
