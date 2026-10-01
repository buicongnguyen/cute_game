"""Zoo Garden bright-worlds kit: scenery for the Candy, Toy, Cloud, Jungle and Ocean planets.

Twelve original pieces in the shared glossy toy style (style.py), authored procedurally as
vertex/face lists so every piece has a hand-tuned triangle budget. The game instances each piece
40-270 times per planet and batches by material, so pieces use few materials, and one material
name always means one identical material. See CONTRACT.md, "Bright worlds".

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_worlds_bright.py -- \
        [--only NODE[,NODE...]] [--install] [--render]

Outputs:
    art/generated/kit/models/worlds-bright.glb   one top-level mesh node per piece
    art/generated/kit/worlds-bright-manifest.json
    art/previews/kit/worlds-bright.webp          (--render) labelled contact sheet
    art/previews/kit/worlds-bright-scenes.webp   (--render) one game-camera vignette per planet
--install copies the GLB to public/assets/models/.
--only builds, checks and (with --render) previews just the named nodes in
art/previews/kit/worlds-bright-only.webp. It never writes, replaces or installs the GLB or manifest.

Every node has its origin at its own ground centre (z 0) and faces -Y (glTF: Y up, front +Z).
Contract failures (missing node, triangle budget, base not on z 0, footprint or height off the
contract, wrong material names, GLB over 350 KB) exit with status 1, after the manifest and any
previews are written and before anything is installed. Output is deterministic: all randomness is
seeded and the manifest holds no timestamps.
"""
import bpy
import bmesh
import json
import math
import os
import random
import shutil
import sys
import tempfile
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import export_glb, game_camera, mat, render, reset_scene, studio  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'worlds-bright-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
HERO_GLB = os.path.join(PUBLIC_MODELS, 'hero.glb')
GLB_NAME = 'worlds-bright.glb'
GLB_LIMIT = 350 * 1024

TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))

# ================================================================ contract
# size = (x extent, y extent, height) in metres at yaw 0; r = collision circle at ground level (None:
# walk-through dressing). Checks: tris <= budget; x/y extents <= size * 1.15; height within
# size * (0.85..1.15); everything below z 0.3 inside r * 1.15; base at z 0 +- 0.02; exact materials.
CONTRACT = {
    'candy_tree': dict(planet='candy', size=(2.6, 2.6, 3.4), r=0.35, tris=420,
                       mats=('Candy stick', 'Candy swirl A', 'Candy swirl B')),
    'candy_cane': dict(planet='candy', size=(1.05, 0.6, 2.2), r=0.3, tris=260, mats=('Candy red', 'Candy white')),
    'gumdrops': dict(planet='candy', size=(1.0, 1.0, 0.45), r=None, tris=160,
                     mats=('Gumdrop A', 'Gumdrop B', 'Gumdrop C')),
    'donut': dict(planet='candy', size=(2.0, 1.1, 1.6), r=0.9, tris=420,
                  mats=('Donut dough', 'Donut icing', 'Sprinkle A', 'Sprinkle B')),
    'cupcake': dict(planet='candy', size=(1.4, 1.4, 1.5), r=0.6, tris=320, mats=('Cupcake wrapper', 'Frosting', 'Cherry')),
    'toyblock': dict(planet='toy', size=(2.2, 1.2, 1.6), r=1.3, tris=220,
                     mats=('Toy red', 'Toy blue', 'Toy yellow', 'Toy wood')),
    'toyball': dict(planet='toy', size=(1.8, 1.8, 1.8), r=0.9, tris=260, mats=('Ball A', 'Ball B', 'Ball C')),
    'cloudtree': dict(planet='cloud', size=(2.8, 2.8, 3.6), r=0.4, tris=450,
                      mats=('Cloud trunk', 'Cloud puff A', 'Cloud puff B')),
    'skyrock': dict(planet='cloud', size=(1.8, 1.8, 1.2), r=0.8, tris=220, mats=('Sky rock', 'Sky grass', 'Crystal')),
    'jungletree': dict(planet='jungle', size=(4.4, 4.4, 5.0), r=0.6, tris=600,
                       mats=('Jungle bark', 'Jungle leaf A', 'Jungle leaf B', 'Vine')),
    'palm': dict(planet='ocean', size=(4.4, 4.3, 4.5), r=0.35, tris=450, mats=('Palm trunk', 'Palm leaf', 'Coconut')),
    'coral': dict(planet='ocean', size=(1.4, 1.1, 0.8), r=None, tris=260, mats=('Coral A', 'Coral B', 'Coral C')),
}
NODE_IDS = list(CONTRACT)
PLANETS = ('candy', 'toy', 'cloud', 'jungle', 'ocean')

# name: (base colour, roughness, double sided, emission colour, emission strength)
MATERIALS = {
    'Candy stick': ('#FFF5EE', 0.32, False, None, 0.0),
    'Candy swirl A': ('#FF2E8C', 0.28, False, None, 0.0),
    'Candy swirl B': ('#2FE0B4', 0.28, False, None, 0.0),
    'Candy red': ('#F0203A', 0.28, False, None, 0.0),
    'Candy white': ('#FFF7F1', 0.3, False, None, 0.0),
    'Gumdrop A': ('#FF3A8C', 0.82, False, None, 0.0),
    'Gumdrop B': ('#8CE01E', 0.82, False, None, 0.0),
    'Gumdrop C': ('#FF8A12', 0.82, False, None, 0.0),
    'Donut dough': ('#E8963E', 0.6, False, None, 0.0),
    'Donut icing': ('#FF3FA0', 0.3, False, None, 0.0),
    'Sprinkle A': ('#2AA4FF', 0.4, False, None, 0.0),
    'Sprinkle B': ('#FFE12A', 0.4, False, None, 0.0),
    'Cupcake wrapper': ('#FFC02A', 0.5, False, None, 0.0),
    'Frosting': ('#4FE2BE', 0.35, False, None, 0.0),
    'Cherry': ('#E3102E', 0.2, False, None, 0.0),
    'Toy red': ('#EE2D2D', 0.38, False, None, 0.0),
    'Toy blue': ('#2462EA', 0.38, False, None, 0.0),
    'Toy yellow': ('#FFC21A', 0.38, False, None, 0.0),
    'Toy wood': ('#E6AE66', 0.6, False, None, 0.0),
    'Ball A': ('#F5333D', 0.25, False, None, 0.0),
    'Ball B': ('#FFD428', 0.25, False, None, 0.0),
    'Ball C': ('#1FA6F2', 0.25, False, None, 0.0),
    'Cloud trunk': ('#ECF2FF', 0.5, False, None, 0.0),
    'Cloud puff A': ('#FCFEFF', 0.55, False, None, 0.0),
    'Cloud puff B': ('#8FD2FF', 0.55, False, None, 0.0),
    'Sky rock': ('#CBC2EC', 0.7, False, None, 0.0),
    'Sky grass': ('#5CD446', 0.6, False, None, 0.0),
    'Crystal': ('#5CE8FF', 0.2, False, '#6FF0FF', 1.5),
    'Jungle bark': ('#8A5634', 0.75, False, None, 0.0),
    'Jungle leaf A': ('#14803A', 0.55, False, None, 0.0),
    'Jungle leaf B': ('#3FC23E', 0.5, False, None, 0.0),
    'Vine': ('#9BE03A', 0.55, False, None, 0.0),
    'Palm trunk': ('#C68646', 0.7, False, None, 0.0),
    'Palm leaf': ('#30C24A', 0.5, True, None, 0.0),
    'Coconut': ('#6E4226', 0.5, False, None, 0.0),
    'Coral A': ('#FF2A72', 0.45, False, None, 0.0),
    'Coral B': ('#FF6414', 0.5, False, None, 0.0),
    'Coral C': ('#9A36FF', 0.45, True, None, 0.0),
}


class Mats(dict):
    """Lazily created materials, keyed by contract name."""

    def __missing__(self, name):
        color, rough, sheet, emit, strength = MATERIALS[name]
        m = mat(name, color, rough, 0.0, emit, strength)
        m.use_backface_culling = not sheet
        self[name] = m
        return m


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

    def away_from(self, centre):
        """Convex shapes: flip each face whose normal points back toward `centre`."""
        c = Vector(centre)
        out = []
        for f in self.faces:
            vs = [self.verts[k] for k in f]
            n = (vs[1] - vs[0]).cross(vs[2] - vs[0])
            mid = sum(vs, Vector()) / len(vs)
            out.append(f if n.dot(mid - c) >= 0 else tuple(reversed(f)))
        self.faces = out
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


def leaf_frame(base, yaw, pitch, roll=0.0):
    """Local +Y along a direction (yaw around Z, pitch above horizontal), local +Z the upper surface."""
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
        if len(pts) == 3:
            out.append((1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2])
        else:
            out.append((1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2]
                       + t ** 3 * pts[3])
    return out


# ------------------------------------------------------------- primitives
def lathe(profile, segs, mod=None, zmod=None, phase=0.0, twist=0.0, cap_bottom=False, cap_top=False, tag=None):
    """Revolve [(r, z), ...] (bottom to top) around Z; r = 0 makes a pole.
    mod(theta, ring, seg) scales the radius, zmod(theta, ring, seg) shifts z, twist turns each ring
    by ring * twist radians, tag(band, seg) labels faces."""
    verts, rings = [], []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for s in range(segs):
            th = phase + twist * i + TAU * s / segs
            rr = r * (mod(th, i, s) if mod else 1.0)
            zz = z + (zmod(th, i, s) if zmod else 0.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(th), rr * math.sin(th), zz))
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


def tube(path, radius, sides=6, flatten=1.0, ang0=0.0, twist=0.0, cap_start=False, cap_end=False, tag=None):
    """Sweep a (possibly flattened) circle along a polyline; radius may be a list, 0 makes a point.
    twist turns ring i by i * twist radians (helical stripes); tag(band, side) labels faces."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * n
    tangents = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
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
            a = ang0 + twist * i + TAU * s / sides
            ring.append(len(verts))
            verts.append(pts[i] + nv * math.cos(a) * r + bv * math.sin(a) * r * flatten)
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        for s in range(sides):
            if len(lo) == 1:
                faces.append((lo[0], up[(s + 1) % sides], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[(s + 1) % sides], up[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % sides], up[(s + 1) % sides], up[s]))
            tags.append(tag(b, s) if tag else 0)
    if cap_start and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
        tags.append(tag(0, 0) if tag else 0)
    if cap_end and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(tag(len(rings) - 2, 0) if tag else 0)
    return Geo(verts, faces, tags)


def ball(segs, lats, radii=(1, 1, 1), center=(0, 0, 0), swirl=0.0, tag=None, phase=0.0):
    """Ellipsoid with latitude rings at `lats` (degrees) and poles on Z. swirl turns each ring by
    swirl * (90 deg - latitude), so stripes spiral down from the top pole. tag(seg) labels faces."""
    verts = [(0.0, 0.0, -1.0)]
    for lat in lats:
        la = RAD(lat)
        shift = phase + swirl * (math.pi / 2 - la)
        for s in range(segs):
            th = TAU * s / segs + shift
            verts.append((math.cos(la) * math.cos(th), math.cos(la) * math.sin(th), math.sin(la)))
    verts.append((0.0, 0.0, 1.0))
    top = len(verts) - 1

    def ring(r, s):
        return 1 + r * segs + (s % segs)
    faces, tags = [], []
    for s in range(segs):
        faces.append((0, ring(0, s + 1), ring(0, s)))
        tags.append(tag(s) if tag else 0)
    for r in range(len(lats) - 1):
        for s in range(segs):
            faces.append((ring(r, s), ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s)))
            tags.append(tag(s) if tag else 0)
    for s in range(segs):
        faces.append((ring(len(lats) - 1, s), ring(len(lats) - 1, s + 1), top))
        tags.append(tag(s) if tag else 0)
    c = Vector(center)
    verts = [c + Vector((v[0] * radii[0], v[1] * radii[1], v[2] * radii[2])) for v in verts]
    return Geo(verts, faces, tags).outward()


def ico0(radius, center=(0, 0, 0), squash=1.0):
    """A 20-triangle icosahedron: coconuts and cherries."""
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


def octa(radius, center, squash=0.9):
    c = Vector(center)
    verts = [c + Vector(v) * radius for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, squash),
                                              (0, 0, -squash))]
    faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    return Geo(verts, faces).outward()


SHAPES = {
    'leaf': lambda t: math.sin(math.pi * t ** 0.8) ** 0.85,
    'frond': lambda t: math.sin(math.pi * min(1.0, t ** 0.7)) ** 0.7,
}


def leaf(length, width, segs=4, shape='leaf', fold=0.3, bend=0.0, serrate=0.0, tag=None):
    """A leaf sheet: base at the origin, along +Y, upper surface +Z. fold raises the edges (a V),
    bend curls the tip toward +Z (negative droops), serrate notches alternate rows."""
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
            e = z + fold * w
            rows.append([len(verts), len(verts) + 1, len(verts) + 2])
            verts += [(-w, y, e), (0.0, y, z), (w, y, e)]
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


def disc(outline, rings=1, dome=0.0, center=None, fracs=None):
    """A fan over a CCW 2D outline in local XY, domed toward +Z."""
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
    faces = []
    for i in range(n):
        faces.append((0, ring_ids[1][i], ring_ids[1][(i + 1) % n]))
    for k in range(1, rings):
        a, b = ring_ids[k], ring_ids[k + 1]
        for i in range(n):
            faces.append((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    return Geo(verts, faces)


# ---------------------------------------------------------------- outlines
def circle_outline(n, r, phase=0.0):
    return [(r * math.cos(phase + TAU * i / n), r * math.sin(phase + TAU * i / n)) for i in range(n)]


def star_outline(points, outer, inner, phase=math.pi / 2):
    pts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        th = phase + math.pi * i / points
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


def heart_outline(n, size):
    """A heart centred on the origin, lobes toward +Y, CCW."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((-x / 32 * size, (y + 2.5) / 32 * size))
    return pts


def rounded_triangle(size):
    pts = []
    for k in range(3):
        a = math.pi / 2 + TAU * k / 3
        for d in (-0.22, 0.22):
            pts.append((size * 0.5 * math.cos(a + d) * 0.95, size * 0.5 * math.sin(a + d) * 0.95 - 0.04 * size))
    return pts


# ---------------------------------------------------------------- canopies
LATS_HI = (-50, -15, 20, 52)
LATS_LO = (-38, 8, 46)


def _inside(p, b, margin=0.985):
    c, r = b['c'], b['r']
    return ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2 < margin * margin


def blob_geo(b, wobble=0.0, seed=0):
    """A soft ellipsoid whose rings sit where the 42 degree game camera sees the silhouette.
    b['lobes'] = (count, amount) scallops the rim (leafy pads)."""
    lats = b.get('lats', LATS_HI)
    prof = [(0.0, -1.0)] + [(math.cos(RAD(a)), math.sin(RAD(a))) for a in lats] + [(0.0, 1.0)]
    g = lathe(prof, b['segs'], phase=b.get('phase', 0.0))
    rng = random.Random(seed)
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    c, r = Vector(b['c']), b['r']
    lobes, depth = b.get('lobes', (0, 0.0))
    for v in g.verts:
        k = 1 + wobble * math.sin(2.3 * v.x + ph[0]) * math.sin(2.9 * v.y + ph[1]) * math.cos(2.1 * v.z + ph[2])
        kxy = k
        if lobes:
            # Round bumps with notches between them; use 4 segments per lobe (peak, shoulder, notch, shoulder).
            th = math.atan2(v.y, v.x) - b.get('phase', 0.0)
            bump = abs(math.cos(lobes * th / 2)) ** 0.6
            kxy *= 1 - depth * (1 - bump) * (1 - v.z * v.z)
        v.x, v.y, v.z = c.x + v.x * r[0] * kxy, c.y + v.y * r[1] * kxy, c.z + v.z * r[2] * k
    return g.outward()


def canopy(piece, blobs, wobble=0.03, floor=None, seed=7):
    """Overlapping soft blobs; faces buried inside the other blobs are dropped. A blob with 'top'
    uses that material on faces above c.z + split * r.z (light crowns over darker bellies)."""
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
            centre = sum(vs, Vector()) / len(vs)
            return not all(any(_inside(v, o, 0.93) for o in others) for v in vs + [centre])
        g = g.keep(visible)
        if 'top' in b:
            cut = b['c'][2] + b.get('split', 0.0) * b['r'][2]
            g.tags = [1 if sum(g.verts[k].z for k in f) / len(f) > cut else 0 for f in g.faces]
            piece.add(g, {0: b['m'], 1: b['top']})
        else:
            piece.add(g, b['m'])


def surface_point(b, direction, lift=0.0):
    d = Vector(direction).normalized()
    c, r = Vector(b['c']), b['r']
    k = 1 / math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2)
    p = c + d * k
    n = Vector(((p.x - c.x) / r[0] ** 2, (p.y - c.y) / r[1] ** 2, (p.z - c.z) / r[2] ** 2)).normalized()
    return p + n * lift, n


def ground_clamp(g, sink=0.0):
    """Drop a shape by `sink`, flatten what went below z 0 onto it and drop faces lying on z 0."""
    for v in g.verts:
        v.z = max(0.0, v.z - sink)
    return g.keep(lambda f: not all(g.verts[k].z <= 1e-5 for k in f))


# ==================================================================== candy
def build_candy_tree(m):
    p = Piece('candy_tree')
    # Stick: a six-sided rod twisted one side per band, so its white/pink stripes spiral.
    zs = [0.0, 0.09, 0.35, 0.61, 0.87, 1.13, 1.39, 1.65]
    prof = [(0.27, zs[0]), (0.185, zs[1])] + [(0.165, z) for z in zs[2:]]
    p.add(lathe(prof, 6, twist=TAU / 6, phase=0.3, tag=lambda b, s: s % 2),
          {0: m['Candy stick'], 1: m['Candy swirl A']})
    # Canopy: a round swirl candy whose eight stripes pinwheel out from the top.
    segs, arms, swirl = 16, 8, 1.05
    centre, radii = Vector((0.0, 0.0, 2.36)), (1.3, 1.3, 1.04)
    p.add(ball(segs, (-58, -24, 10, 40, 66), radii, centre, swirl, tag=lambda s: (s * arms // segs) % 2),
          {0: m['Candy swirl A'], 1: m['Candy swirl B']})
    blob = dict(c=centre, r=radii)
    # Sugar buttons dotted over it: white ones anywhere, coloured ones on the other colour's stripe.
    button = lathe([(0.12, -0.02), (0.085, 0.04), (0.0, 0.056)], 6)
    for k, (lat, lon, kind) in enumerate(((58, 200, 'w'), (40, 285, 'x'), (22, 330, 'w'), (35, 40, 'x'),
                                          (18, 115, 'w'), (62, 70, 'x'), (12, 245, 'w'), (28, 165, 'x'))):
        la, lo = RAD(lat), RAD(lon)
        d = Vector((math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)))
        pos, nrm = surface_point(blob, d, -0.01)
        if kind == 'w':
            material = m['Candy stick']
        else:
            s = int(((lo - swirl * (math.pi / 2 - la)) % TAU) / (TAU / segs))
            material = m['Candy swirl B'] if (s * arms // segs) % 2 == 0 else m['Candy swirl A']
        p.add(button, material, facing(pos, nrm, spin=k))
    return p.build()


def build_candy_cane(m):
    p = Piece('candy_cane')
    rad, hook, sides = 0.16, 0.3, 8
    shaft_top = 2.2 - rad - hook
    path = [(0.0, 0.0, shaft_top * i / 7) for i in range(8)]
    for k in range(1, 7):
        a = math.pi - RAD(214) * k / 6
        path.append((hook + hook * math.cos(a), 0.0, shaft_top + hook * math.sin(a)))
    # Two red and two white stripes, each a quarter turn wide, turning 45 degrees per band.
    p.add(tube(path, rad, sides=sides, twist=TAU / sides, cap_end=True, tag=lambda b, s: (s // 2) % 2),
          {0: m['Candy red'], 1: m['Candy white']})
    # A little sugar drift where it stands.
    p.add(lathe([(0.31, 0.0), (0.25, 0.06), (0.15, 0.11)], 8, phase=0.2), m['Candy white'])
    return p.build()


def build_gumdrops(m):
    p = Piece('gumdrops')
    for (x, y), r, h, key, ph in (((-0.13, 0.1), 0.27, 0.44, 'Gumdrop A', 0.0),
                                  ((0.24, 0.07), 0.22, 0.35, 'Gumdrop B', 0.4),
                                  ((0.03, -0.24), 0.2, 0.31, 'Gumdrop C', 0.8)):
        prof = [(r, 0.0), (0.93 * r, 0.42 * h), (0.58 * r, 0.86 * h), (0.0, h)]
        p.add(lathe(prof, 10, phase=ph), m[key], xf((x, y, 0)))
    return p.build()


def build_donut(m):
    p = Piece('donut')
    R, r, nu, nv = 0.56, 0.28, 16, 8
    tilt = RAD(22)  # leans back so the iced face looks up toward the game camera
    rng = random.Random(41)

    def point(u, v, rr):
        return Vector(((R + rr * math.cos(v)) * math.cos(u), (R + rr * math.cos(v)) * math.sin(u), rr * math.sin(v)))
    # Icing: from inside the hole (v_in) over the front (v = 90 deg) to a drippy outer edge.
    v_in = RAD(157)
    drips = [0.0, 0.35, 1.0, 0.15, 0.55, 0.0, 0.85, 0.3, 0.0, 1.0, 0.25, 0.6, 0.0, 0.75, 0.2, 0.45]
    # Drips run over the outer rim; near the bottom (local -Y) the icing stops short of the ground.
    v_out = [RAD(34) - RAD(8) * d if math.sin(TAU * i / nu) < -0.5 else RAD(16) - RAD(34) * d
             for i, d in enumerate(drips)]
    vs_dough = [TAU * k / nv for k in range(nv)]
    # Dough torus, minus the rows hidden under the icing.
    verts, faces, tags = [], [], []
    for i in range(nu):
        for k in range(nv):
            verts.append(point(TAU * i / nu, vs_dough[k], r))

    def vid(i, k):
        return (i % nu) * nv + (k % nv)
    for i in range(nu):
        for k in range(nv):
            v0, v1 = vs_dough[k], vs_dough[k] + TAU / nv
            covered = v0 >= max(v_out[i], v_out[(i + 1) % nu]) + 0.02 and v1 <= v_in - 0.02
            if covered:
                continue
            faces.append((vid(i, k), vid(i + 1, k), vid(i + 1, k + 1), vid(i, k + 1)))
            tags.append(0)
    dough = Geo(verts, faces, tags)
    # Icing shell, a little proud of the dough, sampled on the dough's own rows.
    ri = r + 0.04
    iverts, ifaces = [], []
    rows = 5
    for i in range(nu):
        u = TAU * i / nu
        vv = [v_out[i], RAD(45), RAD(90), RAD(135), v_in]
        for v in vv:
            iverts.append(point(u, v, ri))
    for i in range(nu):
        j = (i + 1) % nu
        for k in range(rows - 1):
            ifaces.append((i * rows + k, j * rows + k, j * rows + k + 1, i * rows + k + 1))
    icing = Geo(iverts, ifaces)
    # Orient: the torus axis (local Z) points toward -Y, tilted up.
    rot = Matrix.Rotation(RAD(90) - tilt, 4, 'X')
    sprinkles = []
    for k in range(10):
        u = TAU * (k + rng.uniform(0.1, 0.9)) / 10
        v = rng.uniform(RAD(30), RAD(140))
        c = point(u, v, ri + 0.012)
        n = (c - Vector((R * math.cos(u), R * math.sin(u), 0))).normalized()
        a = rng.uniform(0, TAU)
        t1 = Vector((-math.sin(u), math.cos(u), 0))
        t2 = n.cross(t1)
        d = (t1 * math.cos(a) + t2 * math.sin(a)) * 0.1
        g = tube([c - d, c + d], 0.034, sides=3, cap_start=True, cap_end=True, ang0=a)
        sprinkles.append((g, m['Sprinkle A'] if k % 2 else m['Sprinkle B']))
    parts = [(dough, m['Donut dough']), (icing, m['Donut icing'])] + sprinkles
    low = min((rot @ v).z for v in dough.verts)
    sink = 0.07
    lift = Matrix.Translation((0, 0.0, -low))
    for g, material in parts:
        p.add(ground_clamp(g.transformed(lift @ rot), sink), material)
    return p.build(sharp=70)


def build_cupcake(m):
    p = Piece('cupcake')
    # Pleated paper wrapper: twenty flat facets alternating in and out, flaring to the top.
    p.add(lathe([(0.47, 0.0), (0.61, 0.56)], 20, mod=lambda th, i, s: 1.0 if s % 2 == 0 else 0.9),
          m['Cupcake wrapper'], smooth=False)
    # Frosting: three soft tiers whose grooves wind round, so the stack reads as a piped swirl.
    prof = [(0.63, 0.5), (0.7, 0.6), (0.64, 0.71), (0.53, 0.78), (0.53, 0.87), (0.41, 0.98), (0.36, 1.05),
            (0.22, 1.17), (0.0, 1.26)]

    def wind(th, i, s):
        return 1.0 + (0.07 * math.cos(th - 1.1 * i) if 1 <= i <= 6 else 0.0)

    def tilt(th, i, s):
        return 0.04 * math.sin(th - 1.1 * i) if i in (3, 5) else 0.0
    p.add(lathe(prof, 14, mod=wind, zmod=tilt), m['Frosting'])
    p.add(lathe([(0.0, -0.12), (0.1, -0.075), (0.13, 0.015), (0.09, 0.095), (0.0, 0.125)], 8),
          m['Cherry'], xf((0.02, -0.03, 1.355)))
    return p.build()


# ====================================================================== toy
def chamfer_cube(size, c):
    """A cube with 45 degree chamfers: tag 0 on the six faces, tag 1 on the 12 edges and 8 corners."""
    h, e = size / 2, size / 2 - c
    index, verts = {}, []

    def vid(axis, sign, a, b):
        p = [0.0, 0.0, 0.0]
        p[axis] = sign * h
        p[(axis + 1) % 3] = a * e
        p[(axis + 2) % 3] = b * e
        key = tuple(round(q, 6) for q in p)
        if key not in index:
            index[key] = len(verts)
            verts.append(Vector(p))
        return index[key]
    faces, tags = [], []
    for axis in range(3):
        for sign in (-1, 1):
            faces.append((vid(axis, sign, -1, -1), vid(axis, sign, 1, -1), vid(axis, sign, 1, 1), vid(axis, sign, -1, 1)))
            tags.append(0)
    # Edge strips between face (axis a) and face (axis b), running along the third axis d.
    for a in range(3):
        b = (a + 1) % 3
        for sa in (-1, 1):
            for sb in (-1, 1):
                # On face a: coord b = sb*e; on face b: coord a = sa*e.
                fa = [vid(a, sa, sb, t) for t in (-1, 1)]       # face a: (a+1)=b -> sb, (a+2)=d -> t
                fb = [vid(b, sb, t, sa) for t in (-1, 1)]       # face b: (b+1)=d -> t, (b+2)=a -> sa
                faces.append((fa[0], fa[1], fb[1], fb[0]))
                tags.append(1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                s = (sx, sy, sz)
                faces.append(tuple(vid(ax, s[ax], s[(ax + 1) % 3], s[(ax + 2) % 3]) for ax in range(3)))
                tags.append(1)
    return Geo(verts, faces, tags).away_from((0, 0, 0))


def build_toyblock(m):
    p = Piece('toyblock')
    red, blue, yellow, wood = m['Toy red'], m['Toy blue'], m['Toy yellow'], m['Toy wood']
    star = star_outline(5, 0.26, 0.115)
    circle = circle_outline(9, 0.2)
    heart = heart_outline(12, 0.48)
    tri = rounded_triangle(0.5)
    # (size, centre xy, yaw, face colour, {face: (outline, colour)}); faces: -y front, +y back, -x, +x, +z top.
    blocks = [
        (0.86, (-0.5, 0.03), RAD(7), red, {'-y': (star, yellow), '+y': (circle, yellow), '-x': (tri, yellow)}),
        (0.86, (0.5, -0.05), RAD(-9), blue, {'-y': (circle, yellow), '+y': (tri, yellow), '+x': (star, yellow)}),
        (0.74, (0.03, 0.03), RAD(24), yellow, {'-y': (heart, red), '+y': (star, blue), '+z': (circle, blue)}),
    ]
    normals = {'-y': (0, -1, 0), '+y': (0, 1, 0), '-x': (-1, 0, 0), '+x': (1, 0, 0), '+z': (0, 0, 1)}
    for k, (size, (x, y), yaw, colour, emblems) in enumerate(blocks):
        z = size / 2 if k < 2 else 0.86 + size / 2
        frame = xf((x, y, z), (0, 0, yaw))
        p.add(chamfer_cube(size, size * 0.1), {0: colour, 1: wood}, frame, smooth=False)
        for face, (outline, ecol) in emblems.items():
            n = Vector(normals[face])
            up = (0, 1, 0) if face == '+z' else (0, 0, 1)
            local = facing(n * (size / 2 + 0.012), n, up=up)
            p.add(disc(outline, dome=0.045), ecol, frame @ local)
    return p.build(sharp=30)


def build_toyball(m):
    p = Piece('toyball')
    segs = 18
    g = ball(segs, (-67.5, -45, -22.5, 0, 22.5, 45, 67.5), (0.9, 0.9, 0.87), (0, 0, 0),
             tag=lambda s: (s * 6 // segs) % 3)
    # Resting at a jaunty angle: the pole leans toward the camera so the segments fan from it.
    rot = Matrix.Rotation(RAD(-24), 4, 'X') @ Matrix.Rotation(RAD(14), 4, 'Y') @ Matrix.Rotation(RAD(10), 4, 'Z')
    g = g.transformed(rot)
    low = min(v.z for v in g.verts)
    g = g.transformed(Matrix.Translation((0, 0, -low)))
    p.add(g, {0: m['Ball A'], 1: m['Ball B'], 2: m['Ball C']})
    return p.build(sharp=60)


# ==================================================================== cloud
def build_cloudtree(m):
    p = Piece('cloudtree')
    white, sky = m['Cloud puff A'], m['Cloud puff B']
    # Slender, slightly leaning trunk.
    h = 2.45
    g = lathe([(0.22, 0.0), (0.145, 0.2), (0.12, 1.2), (0.095, h)], 6, phase=0.2)
    for v in g.verts:
        k = (v.z / h) ** 2
        v.x += 0.14 * k
        v.y += 0.04 * k
    p.add(g, m['Cloud trunk'])
    # Puffs: white crowns over sky-blue bellies.
    cx, cy = 0.12, 0.03
    blobs = [dict(c=(cx, cy, 2.86), r=(0.84, 0.8, 0.68), segs=12, m=sky, top=white, split=-0.25, phase=0.1)]
    for k, (ang, dist, z, rr) in enumerate(((10, 0.86, 2.42, 0.56), (80, 0.8, 2.56, 0.52), (150, 0.88, 2.38, 0.58),
                                            (220, 0.82, 2.52, 0.54), (290, 0.86, 2.4, 0.56))):
        a = RAD(ang)
        blobs.append(dict(c=(cx + dist * math.cos(a), cy + dist * math.sin(a), z), r=(rr, rr * 0.96, rr * 0.84),
                          segs=10, lats=LATS_LO, m=sky, top=white, split=0.0, phase=k * 0.5))
    canopy(p, blobs, wobble=0.04, seed=31)
    # A small cloud wisp at the foot.
    canopy(p, [dict(c=(0.05, -0.04, 0.06), r=(0.34, 0.29, 0.2), segs=9, lats=LATS_LO, m=sky, top=white, split=0.0)],
           wobble=0.05, floor=0.0, seed=40)
    return p.build()


def build_skyrock(m):
    p = Piece('skyrock')
    rng = random.Random(17)
    jit = [[rng.uniform(-1, 1) for _ in range(9)] for _ in range(5)]
    # Faceted chunk, wider above its foot like a piece of floating island, with a rocky lip
    # showing round the grass.
    prof = [(0.6, 0.0), (0.77, 0.22), (0.88, 0.47), (0.82, 0.68), (0.6, 0.8)]
    rock = lathe(prof, 9, mod=lambda th, i, s: 1 + 0.08 * jit[i][s],
                 zmod=lambda th, i, s: 0.04 * jit[(i + 2) % 5][s] if 0 < i < 4 else 0.0, phase=0.25)
    p.add(rock, m['Sky rock'], smooth=False)
    # Grass cap with a scalloped, drooping rim.
    cap = lathe([(0.7, 0.7), (0.67, 0.83), (0.42, 0.95), (0.0, 0.99)], 14,
                mod=lambda th, i, s: (1 + 0.06 * math.cos(5 * th)) if i < 2 else 1.0,
                zmod=lambda th, i, s: -0.08 * max(0.0, math.cos(5 * th + 0.6)) if i == 0 else 0.0)
    p.add(cap, m['Sky grass'])
    # A cluster of three glowing crystals toward the back.
    crystal = lathe([(0.1, -0.08), (0.11, 0.22), (0.0, 0.38)], 6)
    for loc, rot, s in (((-0.05, 0.16, 0.93), (RAD(-6), RAD(-4), 0.3), 1.0),
                        ((-0.24, 0.1, 0.9), (RAD(-10), RAD(-30), 0.9), 0.72),
                        ((0.14, 0.2, 0.9), (RAD(-12), RAD(28), 0.5), 0.65)):
        p.add(crystal, m['Crystal'], xf(loc, rot, s))
    return p.build(sharp=45)


# =================================================================== jungle
def build_jungletree(m):
    p = Piece('jungletree')
    bark, leaf_a, leaf_b = m['Jungle bark'], m['Jungle leaf A'], m['Jungle leaf B']
    # Trunk with five buttress roots that flare out at the ground and fade by 1 m.
    fins = [(0.33, 0.66, 0.0), (0.3, 0.47, 0.3), (0.27, 0.32, 0.85), (0.24, 0.24, 2.2), (0.2, 0.2, 3.7)]

    def buttress(th, i, s):
        base, fin, _ = fins[i]
        k = 1.0 if s % 2 == 0 else 0.0
        return (base + (fin - base) * k) / base
    p.add(lathe([(f[0], f[2]) for f in fins], 10, mod=buttress, twist=RAD(5)), bark)
    # Broad layered canopy: three scalloped tiers, each a light crown over a dark rim, so the
    # layers read from the high camera as dark/light rings.
    pads = [dict(c=(0.0, 0.0, 3.5), r=(2.26, 2.16, 0.8), segs=24, lats=(-50, -12, 22, 56), lobes=(6, 0.2),
                 m=leaf_a, top=leaf_b, split=0.38, phase=0.1),
            dict(c=(0.3, 0.2, 4.18), r=(1.5, 1.4, 0.62), segs=20, lats=(-40, 10, 50), lobes=(5, 0.2),
                 m=leaf_a, top=leaf_b, split=0.32, phase=0.6),
            dict(c=(-0.12, -0.08, 4.62), r=(0.74, 0.7, 0.36), segs=16, lats=LATS_LO, lobes=(4, 0.18),
                 m=leaf_a, top=leaf_b, split=0.2, phase=1.1)]
    canopy(p, pads, wobble=0.025, seed=51)
    # Hanging vines from under the big tier.
    rng = random.Random(53)
    for k in range(7):
        a = TAU * k / 7 + rng.uniform(-0.25, 0.25)
        rr = rng.uniform(1.25, 1.8)
        top = Vector((rr * math.cos(a), rr * math.sin(a), 3.1))
        drop = rng.uniform(1.1, 1.6)
        sway = Vector((math.cos(a + 1.4), math.sin(a + 1.4), 0)) * 0.12
        path = [top, top + sway - UP * drop * 0.4, top - sway * 0.5 - UP * drop * 0.75, top + sway * 0.3 - UP * drop]
        p.add(tube(path, [0.075, 0.065, 0.055, 0.0], sides=3, ang0=a), m['Vine'])
    return p.build()


# ==================================================================== ocean
def build_palm(m):
    p = Piece('palm')
    trunk_m = m['Palm trunk']
    # Curved trunk of seven stacked segments, each a little wider at its top lip.
    curve = bez([(0, 0, 0), (0.05, 0, 1.6), (0.45, 0, 3.1), (1.08, 0, 4.12)], 61)
    lengths = [0.0]
    for a, b in zip(curve, curve[1:]):
        lengths.append(lengths[-1] + (b - a).length)

    def at(t):
        s = t * lengths[-1]
        for i in range(1, len(curve)):
            if lengths[i] >= s:
                f = (s - lengths[i - 1]) / max(1e-9, lengths[i] - lengths[i - 1])
                return curve[i - 1].lerp(curve[i], f)
        return curve[-1]
    n_seg = 7
    path, radii = [at(0.0)], [0.3]
    for k in range(n_seg):
        r = 0.23 - 0.08 * k / (n_seg - 1)
        t0, t1 = k / n_seg, (k + 1) / n_seg
        if k:
            path.append(at(t0 + 0.004))
            radii.append(r * 0.94)
        path.append(at(t1 - 0.012))
        radii.append(r * 1.22)
    path.append(at(1.0))
    radii.append(0.15)
    p.add(ground_clamp(tube(path, radii, sides=6, ang0=0.3)), trunk_m)
    crown = Vector(at(1.0))
    p.add(lathe([(0.17, -0.06), (0.2, 0.06), (0.0, 0.2)], 6), trunk_m, xf(crown))
    # Eight serrated, drooping fronds.
    rng = random.Random(61)
    for k in range(8):
        yaw = TAU * k / 8 + RAD(10) + rng.uniform(-0.12, 0.12)
        pitch = RAD(rng.uniform(18, 34))
        ln = rng.uniform(1.85, 2.05)
        fr = leaf(ln, 0.66, segs=6, shape='frond', fold=0.32, bend=-0.5, serrate=0.42)
        p.add(fr, m['Palm leaf'], leaf_frame(crown + Vector((0, 0, 0.1)), yaw, pitch, roll=rng.uniform(-0.15, 0.15)))
    # Coconuts hang in gaps between fronds, so the high camera catches them from most yaws.
    for k, gap in enumerate((5, 0, 2)):
        a = RAD(10 + 22.5 + 45 * gap)
        p.add(ico0(0.16, crown + Vector((0.24 * math.cos(a), 0.24 * math.sin(a), -0.16 - 0.03 * k))), m['Coconut'])
    return p.build(sharp=50)


def build_coral(m):
    p = Piece('coral')
    # Branching coral: six arms curling up and out from one foot.
    base = Vector((-0.3, 0.04, 0.0))
    rng = random.Random(71)
    for k in range(6):
        a = TAU * k / 6 + rng.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0))
        h = rng.uniform(0.56, 0.78)
        reach = rng.uniform(0.22, 0.38)
        path = [base + out * 0.04, base + out * reach * 0.45 + UP * h * 0.35, base + out * reach * 0.85 + UP * h * 0.7,
                base + out * reach + UP * h]
        p.add(ground_clamp(tube(path, [0.11, 0.09, 0.072, 0.056], sides=4, ang0=a, cap_end=True)), m['Coral A'])
    # Brain coral: a lumpy dome.
    prof = [(0.33, 0.0), (0.34, 0.1), (0.24, 0.25), (0.0, 0.31)]
    p.add(lathe(prof, 10, mod=lambda th, i, s: 1 + (0.08 * math.cos(5 * th + 1.7 * i) if 0 < i < 3 else 0.0)),
          m['Coral B'], xf((0.33, -0.27, 0.0)))
    # Sea fan: a curved, scalloped fan standing at the back.
    fan = []
    for k in range(13):
        a = RAD(-28 + 236 * k / 12)
        rr = 0.36 * (1 + 0.07 * math.cos(6 * a))
        fan.append((rr * math.cos(a), 0.38 + rr * math.sin(a) * 1.05))
    fan = [(0.05, 0.0)] + fan[1:-1] + [(-0.05, 0.0)]
    fan = list(reversed(fan)) if sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(fan, fan[1:] + fan[:1])) < 0 else fan
    g = disc(fan, rings=2, dome=0.06, center=(0.0, 0.36), fracs=(0.55, 1.0))
    for v in g.verts:
        v.z -= 0.12 * (v.x / 0.4) ** 2  # curve the fan around its face
    p.add(g, m['Coral C'], xf((0.27, 0.3, 0.0), (RAD(90), 0, RAD(-12)), 1.1))
    return p.build()


BUILDERS = dict(candy_tree=build_candy_tree, candy_cane=build_candy_cane, gumdrops=build_gumdrops,
                donut=build_donut, cupcake=build_cupcake, toyblock=build_toyblock, toyball=build_toyball,
                cloudtree=build_cloudtree, skyrock=build_skyrock, jungletree=build_jungletree, palm=build_palm,
                coral=build_coral)


def build_all(ids):
    m = Mats()
    return {name: BUILDERS[name](m) for name in ids}


# ================================================================== checks
def r4(v):
    return round(v + 0.0, 4)


def node_stats(obj):
    me = obj.data
    me.calc_loop_triangles()
    co = [v.co for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    low = [c for c in co if c.z <= 0.3]
    names = [mm.name for mm in me.materials]
    emissive = {}
    for mm in me.materials:
        bsdf = next(n for n in mm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        strength = bsdf.inputs['Emission Strength'].default_value
        if strength > 0:
            emissive[mm.name] = r4(strength)
    b = dict(min=[r4(v) for v in lo], max=[r4(v) for v in hi], size=[r4(hi[i] - lo[i]) for i in range(3)])
    return dict(planet=CONTRACT[obj.name]['planet'], triangles=len(me.loop_triangles), vertices=len(co),
                materials=names, emissive=emissive, bounds=b,
                bounds_gltf=dict(min=[b['min'][0], b['min'][2], r4(-b['max'][1])],
                                 max=[b['max'][0], b['max'][2], r4(-b['min'][1])]),
                radius_xy=r4(max(math.hypot(c.x, c.y) for c in co)),
                ground_radius=r4(max(math.hypot(c.x, c.y) for c in low)) if low else 0.0)


def check(name, s):
    c = CONTRACT[name]
    errors = []
    if s['triangles'] > c['tris']:
        errors.append(f"{s['triangles']} triangles > {c['tris']}")
    if sorted(s['materials']) != sorted(c['mats']):
        errors.append(f"materials {sorted(s['materials'])} != {sorted(c['mats'])}")
    lo, size = s['bounds']['min'], s['bounds']['size']
    if abs(lo[2]) > 0.02:
        errors.append(f'base z {lo[2]} not within 0 +- 0.02')
    for axis, label in ((0, 'x'), (1, 'y')):
        if size[axis] > c['size'][axis] * 1.15:
            errors.append(f"{label} extent {size[axis]} > {c['size'][axis]} + 15%")
    h = s['bounds']['max'][2]
    if not c['size'][2] * 0.85 <= h <= c['size'][2] * 1.15:
        errors.append(f"height {h} outside {c['size'][2]} +- 15%")
    if c['r'] is not None and s['ground_radius'] > c['r'] * 1.15:
        errors.append(f"ground footprint r {s['ground_radius']} > collision {c['r']} + 15%")
    return errors


def report(stats):
    print('\n== bright worlds')
    for name, s in stats.items():
        b = s['bounds']
        print(f"  {name:11s} {s['triangles']:4d}/{CONTRACT[name]['tris']:3d} tris  size {b['size'][0]:.2f} x "
              f"{b['size'][1]:.2f} x {b['max'][2]:.2f}  z0 {b['min'][2]:+.3f}  ground r {s['ground_radius']:.2f}"
              f"  x {b['min'][0]:.2f}..{b['max'][0]:.2f} y {b['min'][1]:.2f}..{b['max'][1]:.2f}")


def material_table(objs):
    out = {}
    for obj in objs.values():
        for mm in obj.data.materials:
            if mm.name in out:
                continue
            color, rough, sheet, emit, strength = MATERIALS[mm.name]
            out[mm.name] = dict(color=color, roughness=rough, double_sided=sheet,
                                emissive=dict(color=emit, strength=strength) if emit else None)
    return {k: out[k] for k in sorted(out)}


# ================================================================= previews
def _eevee(samples=48):
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.6),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def _preview_studio(size, ground='#7DD957'):
    """style.studio toned like the other kit previews: dimmer world and -0.4 EV read closer to the browser."""
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


def hud_label(cam, text, u, v, size, res, align='LEFT', color='#10283C'):
    """Flat text in front of an orthographic camera at (u, v) of the frame (-0.5..0.5 from the centre)."""
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = align
    cu.align_y = 'TOP'
    cu.materials.append(mat('Preview label ' + color, color, 0.6))
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


def project(cam, p):
    from bpy_extras.object_utils import world_to_camera_view
    co = world_to_camera_view(bpy.context.scene, cam, Vector(p))
    return co.x - 0.5, co.y - 0.5


def _remove(objs):
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)


def _composite(paths, layout, size, out_path, background='#FFF6E3'):
    import numpy as np
    canvas = np.zeros((size[1], size[0], 4), dtype=np.float32)
    canvas[..., :3] = np.array(style.rgba(background)[:3]) ** (1 / 2.2)
    canvas[..., 3] = 1.0
    for path, (x, y) in zip(paths, layout):
        im = bpy.data.images.load(path)
        w, h = im.size
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
        canvas[y:y + h, x:x + w, :3] = px[..., :3]
        bpy.data.images.remove(im)
    out = bpy.data.images.new('Composite', size[0], size[1], alpha=False)
    out.pixels = canvas[::-1].ravel()
    out.filepath_raw = out_path
    out.file_format = 'WEBP'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save()
    bpy.data.images.remove(out)


# Contact sheet: (node, x, y) at true relative scale; tall pieces at the back.
SHEET = [('jungletree', -8.3, 5.4), ('palm', -4.4, 5.4), ('cloudtree', 0.4, 5.4), ('candy_tree', 4.2, 5.4),
         ('toyblock', 8.2, 5.4),
         ('donut', -9.0, 0.0), ('cupcake', -6.4, 0.0), ('toyball', -3.9, 0.0), ('skyrock', -1.3, 0.0),
         ('candy_cane', 1.0, 0.0), ('gumdrops', 3.6, 0.0), ('coral', 6.0, 0.0)]


def _clear_preview(objs):
    """Remove everything but the kit nodes (lights, grounds, cameras of an earlier preview)."""
    keep = set(objs.values())
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)


def preview_sheet(objs, out_path):
    res = (2000, 1040)
    _clear_preview(objs)
    _preview_studio(res, ground='#9BE27A')
    cam = game_camera(target=(-0.4, 3.5, 1.4), ortho_scale=21.5)
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
    bpy.context.view_layer.update()  # the camera matrix must be current before projecting labels
    for o in objs.values():
        o.hide_render = True
    labels = []
    rows = [r for r in SHEET if r[0] in objs]
    if len(rows) < len(SHEET):  # --only: just line them up
        rows = [(n, -8 + 3.2 * i, 0.0) for i, n in enumerate(objs)]
    s = None
    for name, x, y in rows:
        obj = objs[name]
        obj.hide_render = False
        obj.location = (x, y, 0)
        s = node_stats(obj)
        u, v = project(cam, (x + (s['bounds']['min'][0] + s['bounds']['max'][0]) / 2, y - 1.0, 0))
        labels.append(hud_label(cam, f"{name}\n{s['planet']} | {s['triangles']} tris", u, v - 0.005, 0.27, res,
                                align='CENTER'))
    labels.append(hud_label(cam, 'Bright worlds kit: every piece at true scale, game camera (42 deg, orthographic)',
                            -0.49, 0.485, 0.34, res))
    render(out_path)
    _remove(labels + [cam])
    for o in objs.values():
        o.location = (0, 0, 0)


def _import_explorer():
    if not os.path.exists(HERO_GLB):
        return []
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=HERO_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.parent is None]


def _move(roots, loc, yaw=0.0, hide=False):
    for o in roots:
        o.location = loc
        o.rotation_euler = (o.rotation_euler[0], o.rotation_euler[1], yaw)
        for c in [o] + list(o.children_recursive):
            c.hide_render = hide


# planet: ground colour (the game's own ground), [(node, count, keep-out radius, scale range)]
VIGNETTES = {
    'candy': ('#FF9FD0', [('candy_tree', 5, 1.15, (0.85, 1.1)), ('donut', 3, 0.9, (0.9, 1.0)),
                          ('cupcake', 3, 0.65, (0.9, 1.05)), ('candy_cane', 8, 0.35, (0.85, 1.1)),
                          ('gumdrops', 12, 0.45, (0.8, 1.2))]),
    'toy': ('#FFE4EF', [('toyblock', 6, 1.2, (0.85, 1.05)), ('toyball', 10, 0.85, (0.55, 1.05))]),
    'cloud': ('#BFE8A0', [('cloudtree', 7, 1.2, (0.85, 1.1)), ('skyrock', 9, 0.8, (0.7, 1.1))]),
    'jungle': ('#3F8A3A', [('jungletree', 8, 1.7, (0.8, 1.05))]),
    'ocean': ('#F2DCA0', [('palm', 5, 0.9, (0.85, 1.05)), ('coral', 14, 0.55, (0.8, 1.3))]),
}
CELL = (720, 450)
CELL_ORTHO = 20.0  # 36 px per metre, the game's zoom (about 40 m across a 1440 px wide view)


def _scatter(objs, rng, items, area, taken, z=0.0):
    placed = []
    for node, count, keep, (s0, s1) in items:
        n, tries = 0, 0
        while n < count and tries < 600:
            tries += 1
            x, y = rng.uniform(area[0], area[1]), rng.uniform(area[2], area[3])
            s = rng.uniform(s0, s1)
            if all(math.hypot(x - a, y - b) > keep * s + rr for a, b, rr in taken):
                placed.append(_place_copy(objs[node], (x, y, z), rng.uniform(0, TAU), s))
                taken.append((x, y, keep * s))
                n += 1
    return placed


def preview_scenes(objs, out_path):
    tmp = tempfile.mkdtemp(prefix='worlds-bright-')
    _clear_preview(objs)
    _preview_studio(CELL, ground='#FF9FD0')
    ground = bpy.data.objects['Preview ground']
    ground_mat = ground.data.materials[0]
    bsdf = next(n for n in ground_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    cam = game_camera(target=(0, 1.5, 0.6), ortho_scale=CELL_ORTHO)
    _aim(cam, (0, 1.5, 0.6), CELL_ORTHO, CELL)
    for o in objs.values():
        o.hide_render = True
    hero = _import_explorer()
    paths, temp = [], []
    for k, planet in enumerate(PLANETS):
        colour, items = VIGNETTES[planet]
        bsdf.inputs['Base Color'].default_value = style.rgba(colour)
        rng = random.Random(100 + k)
        taken = [(0.6, -2.6, 0.7)]
        _move(hero, (0.6, -2.6, 0.0), RAD(20))
        extra = []
        if planet == 'ocean':
            # Island on the left, a shallow lagoon with a coral bed on the right.
            ground.location.z = -0.8 - 0.05
            bsdf.inputs['Base Color'].default_value = style.rgba('#E3C47E')
            sand = mat('Preview sand', colour, 0.9)
            # The game's water material (#6fd8fb, opacity 0.38). The game has no environment map, so
            # damp the sky reflection EEVEE would otherwise lay over everything under it.
            water = mat('Preview water', '#6FD8FB', 0.08, alpha=0.38)
            wb = next(n for n in water.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            wb.inputs['Specular IOR Level'].default_value = 0.1
            water.use_backface_culling = True  # one sheet of water, as in the game, not the box's two faces
            extra.append(style.box('Preview island', (14, 30, 0.8), (-6.5, 4, -0.4), sand, bev=0.25))
            extra.append(style.box('Preview lagoon', (40, 40, 0.02), (14, 4, -0.15), water, bev=0))
            extra += _scatter(objs, rng, items[:1], (-9.5, -1.6, -5.5, 9.5), taken)
            extra += _scatter(objs, rng, items[1:], (1.4, 10.0, -6.5, 9.0), list(taken), z=-0.8)
        else:
            ground.location.z = -0.05
            extra += _scatter(objs, rng, items, (-10.0, 10.0, -6.5, 9.5), taken)
        label = hud_label(cam, f'{planet.title()} planet', -0.48, 0.47, 0.62, CELL,
                          color='#FFFFFF' if planet == 'jungle' else '#10283C')
        path = os.path.join(tmp, f'{planet}.png')
        render(path)
        paths.append(path)
        _remove(extra + [label])
    # Sixth cell: every piece beside the 2.1 m explorer at game zoom.
    ground.location.z = -0.05
    bsdf.inputs['Base Color'].default_value = style.rgba('#9BE27A')
    lineup = [('candy_tree', -7.8, 5.0), ('cloudtree', -4.6, 5.0), ('palm', -1.7, 5.0), ('jungletree', 4.6, 5.0),
              ('toyblock', 8.6, 5.0), ('donut', -8.4, 0.6), ('cupcake', -6.2, 0.6), ('toyball', -4.0, 0.6),
              ('skyrock', -1.7, 0.6), ('candy_cane', 2.0, 0.6), ('gumdrops', 3.6, 0.6), ('coral', 5.2, 0.6)]
    extra = [_place_copy(objs[n], (x, y, 0)) for n, x, y in lineup if n in objs]
    _move(hero, (0.2, 0.6, 0.0), 0.0)
    label = hud_label(cam, 'Every piece beside the 2.1 m explorer', -0.48, 0.47, 0.62, CELL)
    path = os.path.join(tmp, 'lineup.png')
    render(path)
    paths.append(path)
    _remove(extra + [label])
    layout = [((i % 3) * CELL[0], (i // 3) * CELL[1]) for i in range(6)]
    _composite(paths, layout, (CELL[0] * 3, CELL[1] * 2), out_path)
    for path in paths:
        os.remove(path)
    os.rmdir(tmp)


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
    if opts['only']:
        names = [n.strip() for n in opts['only'].split(',') if n.strip()]
        unknown = [n for n in names if n not in CONTRACT]
        if unknown:
            raise SystemExit(f'unknown node(s) {unknown}; choose from {NODE_IDS}')
        opts['only'] = names
    return opts


def main():
    opts = parse_args()
    ids = opts['only'] or NODE_IDS
    reset_scene()
    objs = build_all(ids)
    failures = [f'missing node {n}' for n in ids if n not in objs or objs[n].type != 'MESH']
    stats = {n: node_stats(objs[n]) for n in ids if n in objs}
    report(stats)
    for n, s in stats.items():
        failures += [f'{n}: {e}' for e in check(n, s)]

    if opts['only']:
        print('\n--only: GLB and manifest left untouched')
        if opts['render']:
            preview_sheet(objs, os.path.join(PREVIEWS, 'worlds-bright-only.webp'))
    else:
        path = os.path.join(MODELS, GLB_NAME)
        size = export_glb([objs[n] for n in NODE_IDS], path)
        print(f'  {GLB_NAME} {size} bytes')
        if size > GLB_LIMIT:
            failures.append(f'{GLB_NAME} is {size} bytes (> {GLB_LIMIT})')
        emissive = {}
        for s in stats.values():
            emissive.update(s['emissive'])
        manifest = dict(
            generator='art/blender/kit/build_worlds_bright.py', blender=bpy.app.version_string, file=GLB_NAME,
            bytes=size, triangles=sum(s['triangles'] for s in stats.values()),
            coordinates='Blender Z up, front -Y; glTF Y up, front +Z; bounds_gltf = (x, z, -y). Origin at each '
                        "node's ground centre, metres.",
            emissive=dict(sorted(emissive.items())), materials=material_table(objs),
            nodes={n: dict(stats[n], limit=CONTRACT[n]['tris'], collision_r=CONTRACT[n]['r'],
                           size_contract=list(CONTRACT[n]['size'])) for n in NODE_IDS})
        os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
        with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(manifest, fh, indent=2)
            fh.write('\n')
        if opts['render']:
            preview_sheet(objs, os.path.join(PREVIEWS, 'worlds-bright.webp'))
            preview_scenes(objs, os.path.join(PREVIEWS, 'worlds-bright-scenes.webp'))

    if failures:
        print('\nBright worlds contract failures:\n  ' + '\n  '.join(failures))
        sys.stdout.flush()
        os._exit(1)  # Blender swallows script exceptions in background mode
    if opts['install'] and not opts['only']:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        shutil.copyfile(os.path.join(MODELS, GLB_NAME), os.path.join(PUBLIC_MODELS, GLB_NAME))
        print('installed', GLB_NAME)
    print('\nBright worlds kit OK')
    sys.stdout.flush()


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
