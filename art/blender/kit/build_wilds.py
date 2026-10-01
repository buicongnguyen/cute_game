"""Zoo Garden home wilds: swamp, forest-floor and canyon scenery for the home planet.

Nine soft, glossy toy pieces in the shared kit style (see style.py): a squat swamp tree with
root arches and hanging moss, a fallen mossy log, a toadstool cluster, a striped canyon mesa,
a bare desert tree, a dry scrub tuft, a glowing crystal cluster, a fern clump and a cattail
clump. Geometry is generated directly as vertex/face lists (as build_nature.py) so every piece
keeps a hand-tuned triangle budget; they are instanced hundreds of times and batched by
material name. All designs are original. See CONTRACT.md, "Home wilds".

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_wilds.py -- \
        [--only name[,name...]] [--install] [--render] [--debug DIR]

Outputs (default):
    art/generated/kit/models/wilds.glb       one top-level mesh node per piece
    art/generated/kit/wilds-manifest.json
    art/previews/kit/wilds.webp, wilds-scene.webp   (with --render)
--install copies wilds.glb to public/assets/models/.
--only builds, checks and (with --debug) previews just the named pieces; the GLB, manifest and
install are skipped because they need every piece.
--debug DIR writes close-up check renders (game zoom and 2x) to DIR.

Blender is Z up with -Y as the front; glTF exports are Y up with +Z as the front. Each piece's
origin is its own ground centre. Output is deterministic: seeded randomness, triangulated and
sorted faces (as build_fish.py), so two runs give byte-identical GLB and manifest files. The
build exits non-zero when any piece breaks the contract (names, budgets, ground, footprint,
materials) or the GLB grows past 200 KB.
"""
import bpy
import bmesh
import json
import math
import os
import random
import shutil
import struct
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
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'wilds-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
GLB_NAME = 'wilds.glb'
HERO_GLB = os.path.join(PUBLIC_MODELS, 'hero.glb')
SCENERY_GLB = os.path.join(PUBLIC_MODELS, 'scenery.glb')
GLB_LIMIT = 200 * 1024

WILDS_IDS = ['tree_swamp', 'log', 'toadstools', 'rock_red', 'tree_dead', 'dry_bush', 'crystals', 'fern', 'reeds']
TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists with a per-face tag (used to pick materials)."""

    def __init__(self, verts, faces, tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [0] * len(self.faces)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

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

    def face_normal(self, f):
        a, b, c = (self.verts[f[0]], self.verts[f[1]], self.verts[f[2]])
        return (b - a).cross(c - a)

    def orient(self, want):
        """Open shapes: flip each face whose normal disagrees with want(face centre)."""
        out = []
        for f in self.faces:
            c = sum((self.verts[i] for i in f), Vector()) / len(f)
            out.append(tuple(reversed(f)) if self.face_normal(f).dot(want(c)) < 0 else f)
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

    def add(self, geo, material, xf=None, smooth=True, floor=None):
        """floor clamps the part to z >= floor and drops faces lying flat on it (buried in the ground)."""
        g = geo if xf is None else geo.transformed(xf)
        verts = [Vector(v) for v in g.verts]
        if floor is not None:
            for v in verts:
                v.z = max(v.z, floor)
        base = len(self.verts)
        self.verts.extend(verts)
        for f, t in zip(g.faces, g.tags):
            if floor is not None and all(verts[i].z <= floor + 1e-5 for i in f):
                continue
            m = material[t] if isinstance(material, dict) else material
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.slot(m))
            self.smooth.append(smooth)
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

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
        return triangulate(obj)


def triangulate(obj):
    """Triangulate and sort faces so the GLB is byte-for-byte reproducible (as build_fish.py).
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


def tilt_xf(loc, toward=(1.0, 0.0), angle=0.0, yaw=0.0):
    """Stand at loc, spun by yaw about Z, then leaned by angle toward the XY direction `toward`."""
    d = Vector((toward[0], toward[1], 0.0))
    lean = Matrix.Identity(4)
    if angle and d.length > 1e-6:
        d.normalize()
        lean = Matrix.Rotation(angle, 4, Vector((-d.y, d.x, 0.0)))
    return Matrix.Translation(Vector(loc)) @ lean @ Matrix.Rotation(yaw, 4, 'Z')


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
        if len(pts) == 2:
            out.append(pts[0].lerp(pts[1], t))
        elif len(pts) == 3:
            out.append((1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2])
        else:
            out.append((1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2]
                       + t ** 3 * pts[3])
    return out


# ------------------------------------------------------------- primitives
def lathe(profile, segs, mod=None, phase=0.0, tag=None):
    """Revolve [(r, z), ...] (bottom to top) around Z. r = 0 makes a pole.
    mod(theta, ring) returns a radius scale, or (radius scale, z offset); tag(band, seg) labels faces."""
    verts, rings = [], []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for s in range(segs):
            th = phase + TAU * s / segs
            k, dz = 1.0, 0.0
            if mod:
                res = mod(th, i)
                k, dz = res if isinstance(res, tuple) else (res, 0.0)
            ring.append(len(verts))
            verts.append((r * k * math.cos(th), r * k * math.sin(th), z + dz))
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
    return Geo(verts, faces, tags)


def sweep(path, radius, sides=6, flatten=1.0, twist=0.0, ang0=0.0, tag=None):
    """Sweep a (possibly flattened) ring along a polyline; radius may be a list and 0 makes a point.
    twist turns the flattened cross-section a little more at every ring, which reads as a twisted trunk.
    Faces point outward; the ends stay open unless they close to a point."""
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
        rot = twist * i
        ring = []
        for s in range(sides):
            a = ang0 + TAU * s / sides
            u, w = math.cos(a) * r, math.sin(a) * r * flatten
            cu, su = math.cos(rot), math.sin(rot)
            ring.append(len(verts))
            verts.append(pts[i] + nv * (u * cu - w * su) + bv * (u * su + w * cu))
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
    return Geo(verts, faces, tags)


SHAPES = {
    'frond': lambda t: math.sin(math.pi * t ** 0.62) ** 0.7,
    'blade': lambda t: (1 - t) ** 0.7,
}


def leaf(length, width, segs=4, shape='blade', fold=0.3, bend=0.0, serrate=0.0, tag=None):
    """A leaf sheet: base at the origin, along +Y, upper surface +Z.
    fold raises the edges (a V), bend curls the tip toward +Z (negative droops)."""
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


def disc(outline, dome=0.0):
    """A fan over a CCW 2D outline in local XY, domed toward +Z."""
    n = len(outline)
    cx, cy = sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n
    verts = [(cx, cy, dome)] + [(x, y, 0.0) for x, y in outline]
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    return Geo(verts, faces)


def ngon(n, r, phase=0.0):
    return [(r * math.cos(phase + TAU * i / n), r * math.sin(phase + TAU * i / n)) for i in range(n)]


# =============================================================== materials
def M(name, color, rough=0.55, metal=0.0, emit=None, strength=0.0, sheet=False):
    """style.mat plus the side flag: sheets (leaves, blades) are double sided, solids are not."""
    m = mat(name, color, rough, metal, emit, strength)
    m.use_backface_culling = not sheet
    return m


def wilds_materials():
    """Shared names reuse build_nature.py's exact values (Bark, Mushroom cap/spots/stem), so a name
    means the same material in scenery.glb and wilds.glb. "A" is the darker shade, "B" the lighter."""
    return dict(
        # Shared with scenery.glb (identical definitions).
        bark=M('Bark', '#94562E', 0.7),
        cap=M('Mushroom cap', '#F2303A', 0.4),
        spots=M('Mushroom spots', '#FFF7EA', 0.5),
        mstem=M('Mushroom stem', '#FFE8C4', 0.6),
        # New in wilds.glb.
        swamp_bark=M('Swamp bark', '#6B3D27', 0.72),
        swamp_a=M('Swamp leaf A', '#127A5B', 0.55),
        swamp_b=M('Swamp leaf B', '#2AAE72', 0.5),
        moss=M('Moss', '#9AD13A', 0.65, sheet=True),
        log_end=M('Log end', '#F0B46E', 0.6),
        rock_a=M('Red rock A', '#D2482A', 0.7),
        rock_b=M('Red rock B', '#F58E3C', 0.65),
        dead=M('Dead wood', '#C9BBAA', 0.7),
        dry=M('Dry grass', '#EFBE3A', 0.65, sheet=True),
        crystal=M('Crystal', '#9F72FF', 0.2, emit='#6A36FF', strength=1.5),  # emit max channel 1: the GLB keeps 1.5
        crystal_base=M('Crystal base', '#6B648F', 0.6),
        fern_a=M('Fern A', '#1C9A47', 0.55, sheet=True),
        fern_b=M('Fern B', '#5BCB3A', 0.5, sheet=True),
        reed=M('Reed', '#4FAE36', 0.55, sheet=True),
        cattail=M('Cattail', '#8A4A22', 0.6),
    )


# ================================================================== pieces
def _inside(p, blob, margin=0.985):
    c, r = blob['c'], blob['r']
    return ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2 < margin * margin


def ellipsoid_lathe(c, r, segs, lats, phase=0.0, wobble=0.0, seed=0):
    """A soft ellipsoid as a lathe with latitude rings where the game camera sees the outline (as
    build_nature.py's blob_geo)."""
    prof = [(0.0, -1.0)] + [(math.cos(RAD(a)), math.sin(RAD(a))) for a in lats] + [(0.0, 1.0)]
    g = lathe(prof, segs, phase=phase)
    rng = random.Random(seed)
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    c = Vector(c)
    for v in g.verts:
        k = 1 + wobble * math.sin(2.3 * v.x + ph[0]) * math.sin(2.9 * v.y + ph[1]) * math.cos(2.1 * v.z + ph[2])
        v.x, v.y, v.z = c.x + v.x * r[0] * k, c.y + v.y * r[1] * k, c.z + v.z * r[2] * k
    return g.outward()


def canopy(piece, blobs, wobble=0.04, seed=7):
    """Overlapping soft blobs (as build_nature.py): faces buried inside the other blobs are dropped,
    which pays for rounder blobs within the triangle budget. The union stays closed for shadows."""
    for i, b in enumerate(blobs):
        g = ellipsoid_lathe(b['c'], b['r'], b['segs'], b['lats'], phase=b.get('phase', 0.0), wobble=wobble,
                            seed=seed + i)
        others = [o for j, o in enumerate(blobs) if j != i]

        def visible(f, g=g, others=others):
            vs = [g.verts[k] for k in f]
            if any(all(_inside(v, o) for v in vs) for o in others):
                return False
            centre = sum(vs, Vector()) / len(vs)
            return not all(any(_inside(v, o, 0.93) for o in others) for v in vs + [centre])
        pairs = [(f, t) for f, t in zip(g.faces, g.tags) if visible(f)]
        piece.add(Geo(g.verts, [f for f, _ in pairs], [t for _, t in pairs]), b['m'])


def build_tree_swamp(m):
    """Squat swamp tree: a twisted trunk on four root arches under a wide canopy of four dark,
    drooping lobes round a lighter crown, with lime moss beards hanging between the lobes."""
    p = Piece('tree_swamp')
    bark = m['swamp_bark']
    trunk = [(0.0, 0.0, 0.0), (0.06, 0.03, 0.75), (-0.05, 0.05, 1.55), (0.0, 0.04, 2.5)]
    p.add(sweep(trunk, [0.3, 0.22, 0.19, 0.15], sides=6, flatten=0.7, twist=RAD(55)), bark, floor=0.0)
    rng = random.Random(41)
    for k, yaw in enumerate((20, 112, 203, 292)):
        a = RAD(yaw + rng.uniform(-8, 8))
        d = Vector((math.cos(a), math.sin(a), 0.0))
        reach = 0.92 + 0.1 * rng.random()
        top = 1.0 + 0.12 * rng.random()
        path = bez([d * 0.06 + UP * top, d * 0.55 * reach + UP * (top + 0.24), d * 0.98 * reach + UP * 0.72,
                    d * reach - UP * 0.03], 4)
        p.add(sweep(path, [0.135, 0.112, 0.092, 0.105], sides=4, ang0=RAD(45)), bark, floor=0.0)
    centre = Vector((0.04, 0.05, 0.0))
    lobes = 4
    blobs = [dict(c=centre + Vector((-0.04, 0.08, 2.9)), r=(1.0, 0.96, 0.5), segs=14, lats=(-30, 12, 48),
                  m=m['swamp_b'], phase=0.15)]
    for k in range(lobes):
        a = RAD(45 + 360 / lobes * k)
        z = 2.24 + 0.07 * (k % 2)
        blobs.append(dict(c=centre + Vector((0.92 * math.cos(a), 0.92 * math.sin(a), z)), r=(0.66, 0.64, 0.74),
                          segs=10, lats=(-40, 4, 44), m=m['swamp_a'], phase=a))
    canopy(p, blobs)
    # Moss beards: two V-folded ribbons hang from under each lobe, their tops buried in it.
    for k in range(lobes):
        for j, off in enumerate((-24, 22)):
            a = RAD(45 + 360 / lobes * k + off)
            d = Vector((math.cos(a), math.sin(a), 0.0))
            length = (0.74, 0.95, 0.84, 1.02, 0.7, 0.9, 0.98, 0.78)[2 * k + j]
            top = centre + d * 1.34 + UP * (1.86 + 0.07 * (k % 2))
            frame = leaf_frame(top, a, RAD(-82), roll=RAD(8 if j else -8))
            p.add(leaf(length, 0.26, 2, 'blade', fold=0.4, bend=-0.08), m['moss'], frame)
    return p.build(sharp=70)


def build_log(m):
    """A fallen log along X: bark body with a slight bulge, both ends sawn at a tilt so the rings
    face up toward the camera, two moss patches and a small pale mushroom on the front."""
    p = Piece('log')
    R, half, zc, n, cut = 0.28, 0.9, 0.255, 8, RAD(16)
    body = sweep([(-half, 0.0, zc), (-0.02, 0.025, zc + 0.012), (half, 0.0, zc)], [R, R * 1.04, R * 0.97],
                 sides=n, ang0=RAD(22.5))
    # Shear the end rings onto tilted cut planes (normal (+-cos, 0, sin)).
    for ring, sign in ((0, -1), (2, 1)):
        for k in range(n):
            v = body.verts[ring * n + k]
            v.x -= sign * math.tan(cut) * (v.z - zc)
    p.add(body, m['bark'], floor=0.0)
    for ring, sign in ((0, -1), (2, 1)):
        outer = [body.verts[ring * n + k].copy() for k in range(n)]
        centre = sum(outer, Vector()) / n
        nrm = Vector((sign * math.cos(cut), 0.0, math.sin(cut)))
        rings = [outer] + [[centre + (v - centre) * f + nrm * 0.012 * (1 - f * f) for v in outer] for f in (0.6, 0.47)]
        verts = [v for r in rings for v in r] + [centre + nrm * 0.014]
        faces, tags = [], []
        for b in range(2):
            for k in range(n):
                faces.append((b * n + k, b * n + (k + 1) % n, (b + 1) * n + (k + 1) % n, (b + 1) * n + k))
                tags.append(b)                            # band 1 is the dark growth ring
        for k in range(n):
            faces.append((2 * n + k, 2 * n + (k + 1) % n, 3 * n))
            tags.append(0)
        end = Geo(verts, faces, tags).orient(lambda c, nrm=nrm: nrm)
        p.add(end, {0: m['log_end'], 1: m['bark']}, floor=0.0)

    def body_at(x):
        """Radius and axis offset of the (piecewise linear) body at x."""
        if x <= -0.02:
            t = (x + half) / (half - 0.02)
            return R * (1 + 0.04 * t), 0.025 * t, 0.012 * t
        t = (half - x) / (half + 0.02)
        return R * (0.97 + 0.07 * t), 0.025 * t, 0.012 * t

    def patch(rows, lift=0.012):
        """Moss draped over the log: rows of (angle from the top toward -Y, x start, x end). The rows
        sit on the body's own vertex angles (22.5 + 45k degrees), so no edge sags into the bark."""
        cols = 3
        verts, faces = [], []
        for phi, x0, x1 in rows:
            for c in range(cols):
                x = x0 + (x1 - x0) * c / (cols - 1)
                rr, dy, dz = body_at(x)
                rr += lift
                verts.append((x, dy - math.sin(RAD(phi)) * rr, zc + dz + math.cos(RAD(phi)) * rr))
        for r in range(len(rows) - 1):
            for c in range(cols - 1):
                faces.append((r * cols + c, r * cols + c + 1, (r + 1) * cols + c + 1, (r + 1) * cols + c))
        return Geo(verts, faces).orient(lambda c: Vector((0.0, c.y, c.z - zc)))
    p.add(patch([(-67.5, -0.5, -0.12), (-22.5, -0.66, -0.02), (22.5, -0.62, -0.06), (67.5, -0.46, -0.2)]),
          m['moss'])
    p.add(patch([(-22.5, 0.2, 0.38), (22.5, 0.16, 0.42)]), m['moss'])
    # A pale mushroom on the front flank (faces the camera when the log lies along X).
    a = RAD(50)
    base = Vector((0.55, -math.sin(a) * R * 0.9, zc + math.cos(a) * R * 0.9))
    frame = facing(base, (0.0, -0.6, 1.0))
    p.add(lathe([(0.032, 0.0), (0.026, 0.1)], 4, phase=RAD(45)), m['log_end'], frame)
    cap = lathe([(0.0, 0.092), (0.09, 0.078), (0.06, 0.128), (0.0, 0.15)], 6, phase=RAD(18)).outward()
    p.add(cap, m['log_end'], frame)
    return p.build(sharp=55)


def toadstool(p, m, base, h, R, cap_h, segs, stem_segs, spots, toward=(0, -1), lean=0.0, yaw=0.0):
    """A red toadstool with a cream stem; spots = [(angle, t along the dome, spot radius)]."""
    frame = tilt_xf(base, toward, lean, yaw)
    z_rim = h - cap_h
    p.add(lathe([(0.3 * R, 0.0), (0.24 * R, z_rim + 0.2 * cap_h)], stem_segs, phase=0.4), m['mstem'], frame,
          floor=0.0)
    prof = [(0.0, z_rim + 0.18 * cap_h), (R, z_rim), (0.8 * R, z_rim + 0.58 * cap_h), (0.0, h)]
    p.add(lathe(prof, segs, phase=0.2).outward(), m['cap'], frame)
    for ang, t, sr in spots:
        a, b = (Vector(prof[1]), Vector(prof[2])) if t < 0 else (Vector(prof[2]), Vector(prof[3]))
        t = abs(t)
        rr, z = a.lerp(b, t)
        slope = b - a
        n2 = Vector((slope.y, -slope.x)).normalized()
        if n2.y < 0:
            n2 = -n2
        nrm = Vector((n2.x * math.cos(ang), n2.x * math.sin(ang), n2.y))
        pos = Vector((rr * math.cos(ang), rr * math.sin(ang), z)) + nrm * 0.006
        p.add(disc(ngon(5, sr, ang), dome=0.004), m['spots'], frame @ facing(pos, nrm))


def build_toadstools(m):
    """Three red toadstools of different heights, leaning apart."""
    p = Piece('toadstools')
    toadstool(p, m, (0.04, 0.08, 0.0), 0.52, 0.2, 0.19, 9, 6,
              [(RAD(-95), -0.55, 0.046), (RAD(-15), 0.25, 0.042), (RAD(-170), 0.3, 0.04)],
              toward=(0.2, 0.6), lean=RAD(5))
    toadstool(p, m, (-0.19, -0.1, 0.0), 0.36, 0.15, 0.14, 8, 5,
              [(RAD(-80), -0.5, 0.036), (RAD(170), 0.3, 0.032)], toward=(-1.0, -0.4), lean=RAD(14), yaw=0.5)
    toadstool(p, m, (0.2, -0.16, 0.0), 0.23, 0.105, 0.1, 7, 4,
              [(RAD(-60), 0.3, 0.028)], toward=(1.0, -0.6), lean=RAD(18), yaw=1.1)
    return p.build(sharp=60)


def build_rock_red(m):
    """A chunky canyon mesa: three horizontal strata (dark, light, dark) stepping in at two ledges
    under a sandy top, with a fallen chunk at its foot."""
    p = Piece('rock_red')
    rng = random.Random(23)

    def mesa(n, sx, sy, rings, seed_jit, top_tag, dip=0.0):
        rad = [1.0 + rng.uniform(-0.13, 0.08) for _ in range(n)]
        ang = [TAU * k / n + rng.uniform(-0.14, 0.14) for k in range(n)]
        verts, ids = [], []
        for i, (scale, z, _) in enumerate(rings):
            ring = []
            for k in range(n):
                j = 1 + rng.uniform(-seed_jit, seed_jit)
                r = rad[k] * scale * j
                x, y = sx * r * math.cos(ang[k]), sy * r * math.sin(ang[k])
                # Strata dip a little and wobble, so the ledges read as eroded rock, not a cake.
                dz = 0.0 if i == 0 else dip * x + rng.uniform(-0.03, 0.03)
                ring.append(len(verts))
                verts.append((x, y, z + dz))
            ids.append(ring)
        faces, tags = [], []
        for b in range(len(rings) - 1):
            for k in range(n):
                lo, up = ids[b], ids[b + 1]
                faces.append((lo[k], lo[(k + 1) % n], up[(k + 1) % n], up[k]))
                tags.append(rings[b][2])
        top_z = rings[-1][1] + 0.025
        verts.append((0.0, 0.0, top_z))
        for k in range(n):
            faces.append((ids[-1][k], ids[-1][(k + 1) % n], len(verts) - 1))
            tags.append(top_tag)
        return Geo(verts, faces, tags).orient(lambda c: Vector((c.x, c.y, max(0.0, c.z - top_z + 0.2) * 3)))

    rings = [(1.0, 0.0, 0), (0.97, 0.4, 0), (0.84, 0.47, 1), (0.83, 0.86, 1), (0.72, 0.92, 0), (0.75, 1.24, 0),
             (0.63, 1.34, 1)]
    p.add(mesa(9, 1.06, 0.93, rings, 0.035, 1, dip=0.05), {0: m['rock_a'], 1: m['rock_b']},
          xf((-0.08, 0.08, 0.0), (0, 0, 0.2)), floor=0.0)
    chunk = [(1.0, 0.0, 0), (0.95, 0.24, 1), (0.7, 0.38, 1)]
    p.add(mesa(6, 0.36, 0.3, chunk, 0.06, 1), {0: m['rock_a'], 1: m['rock_b']}, xf((0.82, -0.58, 0.0), (0, 0, 0.7)),
          floor=0.0)
    return p.build(sharp=42)


def build_tree_dead(m):
    """A bare, pale desert tree: a leaning trunk that becomes the central leader, two forked limbs,
    two twigs and three root flares."""
    p = Piece('tree_dead')
    w = m['dead']
    trunk = [(0.0, 0.0, 0.0), (0.05, 0.02, 0.7), (-0.05, 0.03, 1.3), (0.0, 0.06, 1.85), (0.1, 0.1, 2.4),
             (0.16, 0.12, 2.98)]
    p.add(sweep(trunk, [0.27, 0.2, 0.16, 0.12, 0.072, 0.0], sides=6, flatten=0.85, twist=RAD(25)), w, floor=0.0)
    limbs = [
        # (path control points, radii, sides, samples)
        ([(-0.03, 0.03, 1.2), (-0.35, 0.05, 1.75), (-0.75, 0.14, 2.35), (-1.06, 0.2, 2.6)],
         [0.135, 0.115, 0.088, 0.06, 0.0], 5, 5),
        ([(-0.55, 0.11, 2.12), (-0.62, 0.1, 2.5), (-0.5, 0.06, 2.85), (-0.38, 0.04, 2.98)],
         [0.075, 0.058, 0.04, 0.0], 4, 4),
        ([(0.02, 0.02, 1.32), (0.36, -0.06, 1.72), (0.72, -0.1, 2.05), (1.04, -0.06, 2.24)],
         [0.13, 0.11, 0.082, 0.055, 0.0], 5, 5),
        ([(0.58, -0.09, 1.93), (0.66, -0.13, 2.3), (0.66, -0.18, 2.6), (0.78, -0.22, 2.84)],
         [0.07, 0.055, 0.038, 0.0], 4, 4),
    ]
    for ctrl, radii, sides, samples in limbs:
        p.add(sweep(bez(ctrl, samples), radii, sides=sides, ang0=0.4), w)
    for ctrl in (((0.02, -0.04, 0.95), (0.25, -0.18, 1.1), (0.42, -0.3, 1.32)),
                 ((-0.36, 0.06, 1.78), (-0.4, -0.12, 1.95), (-0.32, -0.32, 2.12))):
        p.add(sweep(bez(ctrl, 3), [0.05, 0.034, 0.0], sides=3), w)
    # Root flares stay inside the 0.3 m trunk footprint at the ground.
    for yaw in (35, 160, 275):
        d = Vector((math.cos(RAD(yaw)), math.sin(RAD(yaw)), 0.0))
        p.add(sweep([d * 0.05 + UP * 0.36, d * 0.29 - UP * 0.01], [0.11, 0.0], sides=4, ang0=RAD(45)), w, floor=0.0)
    return p.build(sharp=75)


def build_dry_bush(m):
    """A dry desert scrub: a fountain of thin, spiky straw-coloured blades."""
    p = Piece('dry_bush')
    rng = random.Random(17)
    specs = [(9, 0.06, 0.48, 0.1, RAD(46), -0.3, 0.0), (7, 0.035, 0.52, 0.095, RAD(63), -0.24, 0.3),
             (4, 0.012, 0.5, 0.09, RAD(80), -0.16, 0.9)]
    for count, ring_r, length, width, pitch, bend, yaw0 in specs:
        for k in range(count):
            yaw = yaw0 + TAU * k / count + rng.uniform(-0.18, 0.18)
            base = Vector((math.cos(yaw), math.sin(yaw), 0.0)) * ring_r
            ln = length * rng.uniform(0.86, 1.08)
            g = leaf(ln, width, 2, 'blade', fold=0.55, bend=bend * rng.uniform(0.8, 1.2))
            p.add(g, m['dry'], leaf_frame(base, yaw, pitch + rng.uniform(-0.12, 0.12), roll=rng.uniform(-0.3, 0.3)))
    return p.build()


def build_crystals(m):
    """Five glowing crystal prisms leaning out of a small dusky rock."""
    p = Piece('crystals')
    base = lathe([(0.44, 0.0), (0.4, 0.11), (0.25, 0.2), (0.0, 0.235)], 7, phase=0.2,
                 mod=lambda th, i: 1 + 0.07 * math.sin(3 * th + 0.5) if i < 3 else 1.0)
    p.add(base, m['crystal_base'], floor=0.0)
    specs = [  # (x, y, radius, height, lean toward (x, y), lean degrees, spin)
        (0.02, 0.05, 0.145, 1.12, (0.3, 0.6), 5, 0.1),
        (-0.15, -0.04, 0.11, 0.78, (-1.0, -0.2), 24, 0.5),
        (0.16, -0.03, 0.1, 0.66, (1.0, -0.4), 22, 0.2),
        (0.03, -0.17, 0.085, 0.5, (0.1, -1.0), 27, 0.8),
        (-0.07, 0.19, 0.075, 0.44, (-0.4, 1.0), 30, 0.3),
    ]
    for x, y, r, h, toward, lean, spin in specs:
        prism = lathe([(r, -0.12), (r * 0.9, h - 1.7 * r), (0.0, h)], 6, phase=spin)
        p.add(prism, m['crystal'], tilt_xf((x, y, 0.0), toward, RAD(lean)), smooth=False, floor=0.0)
    return p.build(sharp=50)


def build_fern(m):
    """A lush fern: four broad arching outer fronds (dark) and three upright inner ones (light)."""
    p = Piece('fern')
    rng = random.Random(5)
    specs = [(4, RAD(15), 0.04, 0.6, 0.28, RAD(58), -0.46, 'fern_a'),
             (3, RAD(75), 0.02, 0.66, 0.24, RAD(79), -0.4, 'fern_b')]
    for count, yaw0, ring_r, length, width, pitch, bend, key in specs:
        for k in range(count):
            yaw = yaw0 + TAU * k / count + rng.uniform(-0.15, 0.15)
            base = Vector((math.cos(yaw), math.sin(yaw), 0.0)) * ring_r
            g = leaf(length * rng.uniform(0.92, 1.05), width, 6, 'frond', fold=0.32, bend=bend, serrate=0.42)
            p.add(g, m[key], leaf_frame(base, yaw, pitch + rng.uniform(-0.08, 0.08), roll=rng.uniform(-0.15, 0.15)))
    return p.build()


def build_reeds(m):
    """A pond-edge clump: six reed blades and three cattails of different heights."""
    p = Piece('reeds')
    rng = random.Random(9)
    for k in range(6):
        yaw = RAD(30) + TAU * k / 6 + rng.uniform(-0.25, 0.25)
        base = Vector((math.cos(yaw), math.sin(yaw), 0.0)) * 0.03
        g = leaf(rng.uniform(0.72, 0.92), 0.08, 2, 'blade', fold=0.5, bend=-0.12)
        p.add(g, m['reed'], leaf_frame(base, yaw, RAD(rng.uniform(78, 85)), roll=rng.uniform(-0.3, 0.3)))
    for (x, y), h, lean in (((0.02, 0.03), 1.0, (0.02, 0.05)), ((-0.09, -0.05), 0.86, (-0.1, -0.04)),
                            ((0.09, -0.07), 0.72, (0.11, -0.06))):
        head_len = 0.27
        base = Vector((x, y, 0.0))
        top = Vector((x + lean[0], y + lean[1], h - head_len))
        p.add(sweep([base, top + (top - base).normalized() * 0.02], [0.017, 0.013], sides=3), m['reed'], floor=0.0)
        frame = facing(top, top - base)
        head = lathe([(0.0, 0.0), (0.042, 0.02), (0.047, 0.19), (0.0, head_len)], 5, phase=0.3).outward()
        p.add(head, m['cattail'], frame)
    return p.build()


BUILDERS = dict(tree_swamp=build_tree_swamp, log=build_log, toadstools=build_toadstools, rock_red=build_rock_red,
                tree_dead=build_tree_dead, dry_bush=build_dry_bush, crystals=build_crystals, fern=build_fern,
                reeds=build_reeds)


# ================================================================ contract
# Size targets from CONTRACT.md. r is the footprint radius from the origin (the log uses half
# extents along X and Y instead), h the height. Pieces may not exceed a target by more than 15 %
# (toadstools: h <= 0.55 hard) or fall under it by more than 25 %.
CONTRACT = {
    'tree_swamp': dict(mats=['Swamp bark', 'Swamp leaf A', 'Swamp leaf B', 'Moss'], tris=500, h=3.4, r=1.5,
                       trunk=0.35),
    'log': dict(mats=['Bark', 'Log end', 'Moss'], tris=160, h=0.56, half=(0.9, 0.28)),
    'toadstools': dict(mats=['Mushroom cap', 'Mushroom spots', 'Mushroom stem'], tris=160, h=0.5, hmax=0.55, r=0.4),
    'rock_red': dict(mats=['Red rock A', 'Red rock B'], tris=160, h=1.4, r=1.2),
    'tree_dead': dict(mats=['Dead wood'], tris=220, h=3.0, r=1.1, trunk=0.3),
    'dry_bush': dict(mats=['Dry grass'], tris=120, h=0.55, r=0.5),
    'crystals': dict(mats=['Crystal', 'Crystal base'], tris=160, h=1.1, r=0.5, emissive={'Crystal': 1.5}),
    'fern': dict(mats=['Fern A', 'Fern B'], tris=160, h=0.6, r=0.6),
    'reeds': dict(mats=['Reed', 'Cattail'], tris=120, h=1.0, r=0.3),
}
OVER, UNDER = 1.15, 0.75


def material_info(m):
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = bsdf.inputs['Base Color'].default_value
    es = bsdf.inputs['Emission Strength'].default_value
    ec = bsdf.inputs['Emission Color'].default_value

    def to_hex(col):
        def srgb(v):
            v = max(0.0, min(1.0, v))
            return v * 12.92 if v < 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        return '#' + ''.join(f'{round(srgb(col[i]) * 255):02X}' for i in range(3))
    info = dict(color=to_hex(c), roughness=round(bsdf.inputs['Roughness'].default_value, 3),
                metallic=round(bsdf.inputs['Metallic'].default_value, 3), double_sided=not m.use_backface_culling)
    if es > 0 and max(ec[0], ec[1], ec[2]) > 0:
        info.update(emissive=to_hex(ec), emissive_strength=round(es, 3))
    return info


def gltf_bounds(b):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return dict(min=[b['min'][0], b['min'][2], round(-b['max'][1], 4)],
                max=[b['max'][0], b['max'][2], round(-b['min'][1], 4)])


def node_stats(obj):
    me = obj.data
    me.calc_loop_triangles()
    co = [v.co.copy() for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    b = dict(min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi],
             size=[round(hi[i] - lo[i], 4) for i in range(3)])
    s = dict(triangles=len(me.loop_triangles), vertices=len(co), materials=[mm.name for mm in me.materials],
             bounds=b, bounds_gltf=gltf_bounds(b), radius_xy=round(max(math.hypot(c.x, c.y) for c in co), 4))
    emissive = {}
    for mm in me.materials:
        info = material_info(mm)
        if 'emissive_strength' in info:
            emissive[mm.name] = info['emissive_strength']
    s['emissive'] = emissive
    # Trunk radius at the ground: bark vertices on the ground within 0.5 m of the origin.
    bark_slots = {i for i, mm in enumerate(me.materials) if mm.name in ('Swamp bark', 'Dead wood')}
    ground = set()
    for poly in me.polygons:
        if poly.material_index in bark_slots:
            for vi in poly.vertices:
                v = me.vertices[vi].co
                if v.z < 0.02 and math.hypot(v.x, v.y) < 0.5:
                    ground.add(vi)
    if ground:
        s['trunk_r_ground'] = round(max(math.hypot(me.vertices[i].co.x, me.vertices[i].co.y) for i in ground), 4)
    return s


def check_piece(name, obj, s):
    c = CONTRACT[name]
    errors = []
    if obj.name != name or obj.data.name != name:
        errors.append(f'object/mesh named {obj.name}/{obj.data.name}')
    if tuple(obj.location) != (0, 0, 0) or tuple(obj.rotation_euler) != (0, 0, 0) or tuple(obj.scale) != (1, 1, 1):
        errors.append('object transform is not identity')
    if s['triangles'] > c['tris']:
        errors.append(f"{s['triangles']} triangles > {c['tris']}")
    if sorted(s['materials']) != sorted(c['mats']):
        errors.append(f"materials {sorted(s['materials'])} != {sorted(c['mats'])}")
    want_emissive = c.get('emissive', {})
    if set(s['emissive']) != set(want_emissive) or any(abs(s['emissive'][k] - v) > 1e-3
                                                       for k, v in want_emissive.items() if k in s['emissive']):
        errors.append(f"emissive {s['emissive']} != {want_emissive}")
    lo, hi = s['bounds']['min'], s['bounds']['max']
    if abs(lo[2]) > 0.02:
        errors.append(f'ground: min z {lo[2]} not within +-0.02')
    height = hi[2]
    if 'hmax' in c and height > c['hmax']:
        errors.append(f"height {height} > {c['hmax']}")
    if not UNDER * c['h'] <= height <= OVER * c['h']:
        errors.append(f"height {height} outside {UNDER:.2f}..{OVER:.2f} x {c['h']}")
    if 'half' in c:
        hx, hy = max(abs(lo[0]), abs(hi[0])), max(abs(lo[1]), abs(hi[1]))
        if hx > OVER * c['half'][0] or hy > OVER * c['half'][1]:
            errors.append(f"half extents {hx:.3f} x {hy:.3f} over {OVER} x {c['half']}")
        if hx < UNDER * c['half'][0]:
            errors.append(f"length {2 * hx:.3f} under {UNDER} x {2 * c['half'][0]}")
    else:
        if s['radius_xy'] > OVER * c['r']:
            errors.append(f"footprint r {s['radius_xy']} > {OVER} x {c['r']}")
        if s['radius_xy'] < UNDER * c['r']:
            errors.append(f"footprint r {s['radius_xy']} < {UNDER} x {c['r']}")
    # Origin at the ground centre: the footprint is centred on it.
    for axis in (0, 1):
        mid, half = (lo[axis] + hi[axis]) / 2, (hi[axis] - lo[axis]) / 2
        if abs(mid) > max(0.06, 0.2 * half):
            errors.append(f"footprint centre {'xy'[axis]} {mid:.3f} is off the origin")
    if 'trunk' in c and s.get('trunk_r_ground', 99) > c['trunk']:
        errors.append(f"trunk r at the ground {s.get('trunk_r_ground')} > {c['trunk']}")
    return errors


def read_glb_json(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, _version, _length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF':
        raise ValueError(f'{path} is not a GLB')
    chunk_len, chunk_type = struct.unpack_from('<I4s', data, 12)
    if chunk_type != b'JSON':
        raise ValueError(f'{path}: first chunk is not JSON')
    return json.loads(data[20:20 + chunk_len].decode('utf-8'))


def check_glb(path, stats):
    """Read the exported file back: top-level nodes, identity transforms, materials, glTF bounds."""
    doc = read_glb_json(path)
    errors = []
    roots = [doc['nodes'][i] for i in doc['scenes'][doc.get('scene', 0)]['nodes']]
    names = [n.get('name') for n in roots]
    if sorted(names) != sorted(WILDS_IDS):
        errors.append(f'GLB top-level nodes {sorted(names)} != {sorted(WILDS_IDS)}')
    for node in roots:
        name = node.get('name')
        if name not in stats:
            continue
        if any(k in node for k in ('translation', 'rotation', 'scale', 'matrix', 'children')):
            errors.append(f'GLB node {name} has a transform or children')
        mesh = doc['meshes'][node['mesh']]
        mats = sorted(doc['materials'][pr['material']]['name'] for pr in mesh['primitives'])
        if mats != sorted(CONTRACT[name]['mats']):
            errors.append(f'GLB node {name} materials {mats}')
        lo, hi = [1e9] * 3, [-1e9] * 3
        for pr in mesh['primitives']:
            acc = doc['accessors'][pr['attributes']['POSITION']]
            lo = [min(a, b) for a, b in zip(lo, acc['min'])]
            hi = [max(a, b) for a, b in zip(hi, acc['max'])]
        want = stats[name]['bounds_gltf']
        if any(abs(a - b) > 2e-3 for a, b in zip(lo + hi, want['min'] + want['max'])):
            errors.append(f'GLB node {name} bounds {lo} {hi} != {want}')
    for gm in doc.get('materials', []):
        strength = gm.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength')
        if gm['name'] == 'Crystal':
            if not strength or abs(strength - 1.5) > 1e-3:
                errors.append(f'GLB Crystal emissive strength {strength}')
        elif any(gm.get('emissiveFactor', [0, 0, 0])):
            errors.append(f"GLB material {gm['name']} is emissive")
    return errors


def report(stats):
    print('\n== wilds')
    for name, s in stats.items():
        b = s['bounds']
        extra = f"  trunk {s['trunk_r_ground']:.3f}" if 'trunk_r_ground' in s else ''
        print(f"  {name:11s} {s['triangles']:4d}/{CONTRACT[name]['tris']:<3d} tris  r {s['radius_xy']:.3f}"
              f"  z {b['min'][2]:.3f}..{b['max'][2]:.3f}  x {b['min'][0]:.2f}..{b['max'][0]:.2f}"
              f"  y {b['min'][1]:.2f}..{b['max'][1]:.2f}{extra}  {s['materials']}")


def write_manifest(stats, size):
    used = sorted({n for s in stats.values() for n in s['materials']})
    data = dict(
        generator='art/blender/kit/build_wilds.py', blender=bpy.app.version_string, units='metres',
        coordinates='Blender: Z up, front -Y; glTF: Y up, front +Z; origin at each piece\'s ground centre',
        file=GLB_NAME, bytes=size, limit_bytes=GLB_LIMIT,
        nodes={n: dict(stats[n], budget=CONTRACT[n]['tris']) for n in WILDS_IDS if n in stats},
        materials={n: material_info(bpy.data.materials[n]) for n in used},
        emissive={n: material_info(bpy.data.materials[n])['emissive_strength'] for n in used
                  if 'emissive_strength' in material_info(bpy.data.materials[n])},
    )
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')


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
    """style.studio toned like the other kit previews: a dimmer world and -0.4 EV read closer to the
    browser's hemisphere + sun lighting."""
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


def label(cam, text, at, size, drop=0.0):
    """Flat text facing the camera, centred under the world point `at` and drawn in front of the scene."""
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'TOP'
    cu.materials.append(mat('Preview label', '#10283C', 0.6))
    obj = bpy.data.objects.new('Label', cu)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    rot = cam.matrix_world.to_3x3()
    obj.location = Vector(at) + rot @ Vector((0.0, -drop, 12.0))
    obj.rotation_euler = cam.matrix_world.to_euler()
    obj.visible_shadow = False
    return obj


def import_nodes(path, names=None):
    """Import a GLB; returns {top-level name: object}. Imported materials get .001 names, so the
    kit's own materials (already exported) are untouched."""
    if not os.path.exists(path):
        return {}
    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=path)
    except Exception as exc:  # noqa: BLE001 - previews are optional
        print(f'  (could not import {path}: {exc})')
        return {}
    new = [o for o in bpy.data.objects if o not in before]
    roots = {o.name: o for o in new if o.parent is None}
    for o in new:
        o.hide_render = True
    if names is not None:
        roots = {k: v for k, v in roots.items() if k in names}
    return roots


def _show_tree(root, loc, rz=0.0):
    root.location = loc
    root.rotation_euler = (0, 0, rz)
    for o in [root] + list(root.children_recursive):
        o.hide_render = False


def preview_sheet(objs, out_path):
    """Every piece in two rows at the game camera angle, labelled, next to the explorer."""
    _preview_studio((1800, 1000))
    hero = import_nodes(HERO_GLB, {'hero'}).get('hero')
    back = [('tree_swamp', -5.6), ('tree_dead', -1.6), ('rock_red', 2.0), ('crystals', 5.0)]
    front = [('log', -5.6), ('toadstools', -3.2), ('fern', -1.6), ('reeds', 0.0), ('dry_bush', 1.6)]
    rows = [(back, 3.4), (front, -0.9)]
    for row, y in rows:
        for name, x in row:
            if name in objs:
                objs[name].location = (x, y, 0)
                objs[name].hide_render = False
    if hero is not None:
        _show_tree(hero, (-8.6, 3.4, 0))
    cam = game_camera(target=(-1.8, 1.2, 1.0), ortho_scale=16.0)
    bpy.context.view_layer.update()
    labels = []
    for row, y in rows:
        for name, x in row:
            if name in objs:
                labels.append(label(cam, name, (x, y - 1.25 if y > 0 else y - 0.75, 0), 0.34))
    if hero is not None:
        labels.append(label(cam, 'explorer 2.1 m', (-8.6, 2.3, 0), 0.3))
    render(out_path)
    for o in labels:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.curves.remove(data)
    for o in objs.values():
        o.location = (0, 0, 0)
    return cam, hero


def preview_scene(objs, out_path, ortho=21.0, target=(0.0, 1.6, 0.0), size=(1440, 900)):
    """A dense home patch at the game camera and zoom (21 m across, as the scenery-scene preview):
    a swamp with a pond (left), forest floor (middle) and a canyon edge (right), with the explorer
    and a few scenery.glb pieces for scale."""
    for o in bpy.data.objects:
        if o.type in ('MESH', 'FONT', 'EMPTY'):
            o.hide_render = True
    ground = bpy.data.objects.get('Preview ground')
    if ground is not None:
        ground.hide_render = False
        ground.data.materials[0] = mat('Preview lawn', '#75E444', 0.9)
    zones = dict(swamp=((-8.4, 2.4), 5.9, 0.0), canyon=((8.9, 2.0), 5.6, 1.7))
    pond = ((-7.4, 1.6), 2.2)

    def wobbly(radius, phase):
        return lambda th, i: 1 + 0.1 * math.sin(3 * th + phase) + 0.06 * math.sin(5 * th + 2 * phase)
    for name, colour, z, (c, r, ph), sy in (('swamp', '#3FA65A', 0.004, zones['swamp'], 1.25),
                                            ('canyon', '#F2B266', 0.004, zones['canyon'], 1.3),
                                            ('pond', '#1E8FA0', 0.01, (pond[0], pond[1], 0.6), 0.75)):
        piece = Piece('Preview ' + name)
        disc_geo = lathe([(r, 0.0), (0.0, 0.0)], 28, mod=wobbly(r, ph)).orient(lambda cc: UP)
        piece.add(disc_geo, mat('Preview ' + name, colour, 0.15 if name == 'pond' else 0.9),
                  xf((c[0], c[1], z), (0, 0, 0), (1.0, sy, 1.0)))
        piece.build()

    def in_zone(x, y, key, margin=0.0):
        (cx, cy), r, _ = zones[key]
        sy = 1.25 if key == 'swamp' else 1.3
        return math.hypot(x - cx, (y - cy) / sy) < r * 0.9 - margin

    def zone_of(x, y):
        return 'swamp' if in_zone(x, y, 'swamp') else 'canyon' if in_zone(x, y, 'canyon') else 'forest'

    def strip(o):
        return o.split('.')[0]
    scenery = {strip(k): v for k, v in import_nodes(SCENERY_GLB).items()}
    hero = next((v for k, v in import_nodes(HERO_GLB).items() if strip(k) == 'hero'), None)
    rng = random.Random(8)
    taken = [(pond[0][0], pond[0][1], pond[1] * 1.05), (0.4, 0.4, 0.9)]

    def free(x, y, r):
        return all(math.hypot(x - a, y - b) > r + rr for a, b, rr in taken)

    def scatter(kinds, count, zone, r, scale=(0.9, 1.15), tries=900):
        placed = 0
        for _ in range(tries):
            if placed >= count:
                break
            x, y = rng.uniform(-10.4, 10.4), rng.uniform(-6.8, 11.5)
            if zone_of(x, y) != zone or not free(x, y, r):
                continue
            src = objs.get(kinds[placed % len(kinds)]) or scenery.get(kinds[placed % len(kinds)])
            s = rng.uniform(*scale)
            _place_copy(src, (x, y, 0), rng.uniform(0, TAU), s)
            taken.append((x, y, r * s))
            placed += 1
    # Swamp: reeds round the pond, droopy trees, logs, ferns and toadstools between.
    for k in range(13):
        a = TAU * k / 13 + rng.uniform(-0.12, 0.12)
        x, y = pond[0][0] + math.cos(a) * pond[1] * 1.08, pond[0][1] + math.sin(a) * pond[1] * 0.83
        _place_copy(objs['reeds'], (x, y, 0), rng.uniform(0, TAU), rng.uniform(0.85, 1.2))
        taken.append((x, y, 0.25))
    scatter(['tree_swamp'], 5, 'swamp', 1.35, (0.9, 1.1))
    scatter(['log'], 2, 'swamp', 1.0)
    scatter(['fern', 'toadstools', 'fern', 'reeds'], 12, 'swamp', 0.5)
    # Forest: the existing round and pine trees with the new forest-floor pieces.
    scatter(['tree_round', 'tree_pine', 'tree_round'], 4, 'forest', 1.4, (0.9, 1.1))
    scatter(['log'], 2, 'forest', 1.0)
    scatter(['fern', 'toadstools', 'fern', 'tuft', 'toadstools', 'bush', 'tuft', 'flowers'], 22, 'forest', 0.45)
    # Canyon: mesas, dead trees, scrub and glowing crystals.
    scatter(['rock_red', 'tree_dead'], 6, 'canyon', 1.15, (0.85, 1.15))
    scatter(['dry_bush', 'crystals', 'dry_bush', 'dry_bush', 'crystals'], 14, 'canyon', 0.45)
    if hero is not None:
        _show_tree(hero, (0.4, 0.4, 0.0), RAD(-20))
    cam = bpy.context.scene.camera or game_camera()
    _aim(cam, target, ortho, size)
    render(out_path)
    return cam


def preview_closeups(objs, out_dir):
    """Debug renders: each piece at game zoom (about 43 px per metre) and at 2x, in a strip."""
    os.makedirs(out_dir, exist_ok=True)
    _preview_studio((1200, 500))
    names = [n for n in WILDS_IDS if n in objs]
    xs, x = {}, 0.0
    widths = {n: max(1.0, objs[n].dimensions.x) for n in names}
    for n in names:
        x += widths[n] / 2 + 0.6
        xs[n] = x
        x += widths[n] / 2
    mid = x / 2
    for n in names:
        objs[n].location = (xs[n] - mid, 0, 0)
        objs[n].hide_render = False
    cam = game_camera(target=(0, 0, 1.3), ortho_scale=x + 1.0)
    width = int((x + 1.0) * 43)
    _aim(cam, (0, 0, 1.3), x + 1.0, (width, int(width * 0.4)))
    render(os.path.join(out_dir, 'wilds-game-zoom.png'))
    _aim(cam, (0, 0, 1.3), x + 1.0, (width * 3, int(width * 3 * 0.4)))
    render(os.path.join(out_dir, 'wilds-3x.png'))
    for n in names:
        objs[n].location = (0, 0, 0)


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
        elif a == '--install':
            opts['install'] = True
        elif a == '--render':
            opts['render'] = True
        elif a == '--debug':
            opts['debug'] = argv[i + 1]
            i += 1
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    if opts['only']:
        names = [n for n in opts['only'].split(',') if n]
        unknown = [n for n in names if n not in BUILDERS]
        if unknown:
            raise SystemExit(f'unknown piece(s) {unknown}; choose from {WILDS_IDS}')
        opts['only'] = names
    return opts


def main():
    opts = parse_args()
    names = opts['only'] or WILDS_IDS
    reset_scene()
    m = wilds_materials()
    objs = {n: BUILDERS[n](m) for n in names}
    stats = {n: node_stats(o) for n, o in objs.items()}
    report(stats)
    failures = []
    for n in WILDS_IDS:
        if n not in names:
            continue
        if n not in objs:
            failures.append(f'{n}: missing node')
            continue
        failures += [f'{n}: {e}' for e in check_piece(n, objs[n], stats[n])]

    size = None
    if opts['only'] is None:
        path = os.path.join(MODELS, GLB_NAME)
        size = export_glb([objs[n] for n in WILDS_IDS], path)
        print(f'  {GLB_NAME} {size} bytes ({size / 1024:.1f} KB)')
        if size > GLB_LIMIT:
            failures.append(f'{GLB_NAME} is {size} bytes (> {GLB_LIMIT})')
        failures += check_glb(path, stats)
        write_manifest(stats, size)
    else:
        print('  --only: GLB, manifest and install skipped (they need every piece)')

    if opts['render'] and opts['only'] is None:
        preview_sheet(objs, os.path.join(PREVIEWS, 'wilds.webp'))
        preview_scene(objs, os.path.join(PREVIEWS, 'wilds-scene.webp'))
        if opts['debug']:
            preview_scene(objs, os.path.join(opts['debug'], 'wilds-scene-2x.png'), ortho=10.5,
                          target=(-6.0, 2.5, 0.0), size=(1440, 900))
            preview_scene(objs, os.path.join(opts['debug'], 'wilds-scene-2x-canyon.png'), ortho=10.5,
                          target=(8.0, 2.5, 0.0), size=(1440, 900))
    if opts['debug']:
        reset_scene()
        m = wilds_materials()
        objs = {n: BUILDERS[n](m) for n in names}
        preview_closeups(objs, opts['debug'])

    if failures:
        print('\nWilds kit contract failures:\n  ' + '\n  '.join(failures))
        sys.stdout.flush()
        os._exit(1)
    if opts['install'] and opts['only'] is None:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        shutil.copyfile(os.path.join(MODELS, GLB_NAME), os.path.join(PUBLIC_MODELS, GLB_NAME))
        print('installed', GLB_NAME)
    print('\nWilds kit OK')


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
