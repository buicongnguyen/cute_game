"""Zoo Garden harsh worlds kit: scenery for the Ice, Lava and Shadow planets.

Nine original low-poly pieces in the shared glossy toy style (style.py): a snowy pine, an ice
spire, a snow-capped rock and a snowman for Ice; a cracked lava boulder, an obsidian cluster, a
charred ash tree and a small volcano (the world border ring) for Lava; and a twisted dead tree with
glowing buds for Shadow, which is lit only around the player. Geometry is generated directly as
vertex/face lists (as build_nature.py) so every piece keeps a hand-tuned triangle budget; the game
instances each piece 36-270 times per planet and batches it by material name.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_worlds_harsh.py -- \
        [--only <id>[,<id>...]] [--install] [--render]

Outputs:
    art/generated/kit/models/worlds-harsh.glb
    art/generated/kit/worlds-harsh-manifest.json
    art/previews/kit/worlds-harsh.webp          (--render: labelled contact sheet, game camera)
    art/previews/kit/worlds-harsh-scenes.webp   (--render: one vignette per planet at game zoom)
--install copies the GLB to public/assets/models/.
--only <ids> builds and checks just those pieces (no GLB, manifest or install); with --render it
writes their contact sheet to the system temp folder, for iterating on looks.

One top-level mesh node per piece, each with its origin at its own ground centre, at the file
origin. Blender is Z up with -Y as the front; glTF is Y up with +Z as the front, in metres. Output
is deterministic: seeded randomness, triangulated and sorted faces (as build_fish.py), so two runs
give byte-identical GLB and manifest. See CONTRACT.md, "Harsh worlds".
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
import tempfile
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import game_camera, mat, render, reset_scene, studio  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'worlds-harsh-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
GLB = 'worlds-harsh.glb'
GLB_LIMIT = 300 * 1024

TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))

# ================================================================ contract
# h / r: nominal height and overall xy radius. foot: the ground footprint (the collision circle the
# game blocks, or the cone base for the volcano). A piece fails if it is more than 15% over any of
# these (or more than 15% under its height).
NODES = ['snow_pine', 'ice_spire', 'snow_rock', 'snowman', 'lava_rock', 'obsidian', 'ash_tree',
         'mini_volcano', 'deadtree']
CONTRACT = {
    'snow_pine': dict(planet='ice', h=4.0, r=1.4, foot=0.45, collision=0.45, tris=420,
                      mats=['Bark', 'Snow pine', 'Snow'], look='3-tier pine, thick snow caps, small trunk'),
    'ice_spire': dict(planet='ice', h=2.8, r=0.6, foot=0.55, collision=0.55, tris=160,
                      mats=['Ice', 'Ice glow'], look='faceted ice crystal spire with side shards'),
    'snow_rock': dict(planet='ice', h=0.9, r=0.9, foot=0.8, collision=0.8, tris=160,
                      mats=['Frost rock', 'Snow'], look='rounded grey-blue rock with a snow cap'),
    'snowman': dict(planet='ice', h=1.6, r=0.8, foot=0.45, collision=0.45, tris=420,
                    mats=['Snow', 'Coal', 'Carrot', 'Scarf', 'Twig'], look='three balls, coal face, carrot, scarf, twig arms'),
    'lava_rock': dict(planet='lava', h=1.0, r=1.0, foot=0.85, collision=0.85, tris=170,
                      mats=['Basalt', 'Lava glow'], look='basalt boulder with glowing cracks'),
    'obsidian': dict(planet='lava', h=1.4, r=0.55, foot=0.5, collision=0.5, tris=160,
                     mats=['Obsidian', 'Obsidian edge'], look='glossy black-purple shard cluster'),
    'ash_tree': dict(planet='lava', h=3.2, r=1.2, foot=0.35, collision=0.35, tris=260,
                     mats=['Charcoal wood', 'Ember'], look='charred leafless tree with ember tips'),
    'mini_volcano': dict(planet='lava', h=2.6, r=2.0, foot=2.0, collision=None, tris=320,
                         mats=['Basalt', 'Volcano slope', 'Lava glow'], look='volcano cone, lava pool and drips'),
    'deadtree': dict(planet='shadow', h=3.4, r=1.3, foot=0.35, collision=0.35, tris=280,
                     mats=['Shadow wood', 'Shadow glow'], look='twisted tree, curling branches, glowing buds'),
}
EMISSIVE = {'Ice glow': 1.2, 'Lava glow': 2.5, 'Ember': 2.0, 'Shadow glow': 1.5}
GROUND = {'ice': '#cfe6fb', 'lava': '#6e5a60', 'shadow': '#2a2440'}


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists with a per-face tag (used to pick materials)."""

    def __init__(self, verts, faces, tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [0] * len(self.faces)
        self.rings = None

    def transformed(self, m):
        g = Geo([m @ v for v in self.verts], self.faces, self.tags)
        g.rings = self.rings
        return g

    def keep(self, predicate):
        pairs = [(f, t) for f, t in zip(self.faces, self.tags) if predicate(f)]
        return Geo(self.verts, [p[0] for p in pairs], [p[1] for p in pairs])


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
        for v in self.verts:  # everything stands on the ground plane
            if v.z < 0.0:
                v.z = 0.0
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


def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list, Vector)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(s))


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


def tilted(base, tilt, yaw, sink=0.0):
    """Stand a local Z-up part at `base`, leaning `tilt` toward the compass direction `yaw`."""
    axis = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
    return Matrix.Translation(Vector(base) - UP * sink) @ Matrix.Rotation(tilt, 4, axis)


def bez(points, n):
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


def lathe(profile, segs=None, angles=None, phase=0.0, mod=None, zmod=None, tag=None):
    """Revolve [(r, z), ...] (bottom to top) around Z; r = 0 makes a pole. `angles` may give an
    explicit increasing list of angles (narrow segments for cracks and drips). mod(th, ring, seg)
    scales the radius, zmod(th, ring, seg) shifts z, tag(band, seg) labels faces. Faces point out of
    the surface swept by the profile, so a profile that turns back down makes an inner wall."""
    if angles is None:
        angles = [phase + TAU * s / segs for s in range(segs)]
    n = len(angles)
    verts, rings = [], []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for s, th in enumerate(angles):
            rr = r * (mod(th, i, s) if mod else 1.0)
            zz = z + (zmod(th, i, s) if zmod else 0.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(th), rr * math.sin(th), zz))
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        if len(lo) == 1 and len(up) == 1:
            continue
        for s in range(n):
            s1 = (s + 1) % n
            if len(lo) == 1:
                faces.append((lo[0], up[s1], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[s1], up[0]))
            else:
                faces.append((lo[s], lo[s1], up[s1], up[s]))
            tags.append(tag(b, s) if tag else 0)
    g = Geo(verts, faces, tags)
    g.rings = rings
    return g


def tube(path, radius, sides=6, flatten=1.0, ang0=0.0, twist=0.0, cap_end=False, tag=None, cap_tag=0):
    """Sweep a (possibly flattened, twisting) ring along a polyline. radius may be a list; 0 makes a
    point. tag(band, side) labels faces."""
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
            s1 = (s + 1) % sides
            if len(lo) == 1:
                faces.append((lo[0], up[s1], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[s1], up[0]))
            else:
                faces.append((lo[s], lo[s1], up[s1], up[s]))
            tags.append(tag(b, s) if tag else 0)
    if cap_end and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(cap_tag)
    return Geo(verts, faces, tags)


def octa(radius, center, squash=0.9):
    c = Vector(center)
    verts = [c + Vector(v) * radius for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, squash),
                                              (0, 0, -squash))]
    faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    return Geo(verts, faces)


def tetra(radius, center):
    c = Vector(center)
    verts = [c + Vector(v).normalized() * radius for v in ((1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1))]
    return Geo(verts, [(0, 1, 2), (0, 3, 1), (0, 2, 3), (1, 3, 2)])


def strap(points, normals, width, thick, taper=None):
    """A flat closed bar along points, lying on a surface with the given normals (scarf ends)."""
    n = len(points)
    verts = []
    for i, (p, nv) in enumerate(zip(points, normals)):
        p, nv = Vector(p), Vector(nv).normalized()
        t = (Vector(points[min(i + 1, n - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        side = t.cross(nv).normalized()
        w = width * (taper[i] if taper else 1.0) / 2
        verts += [p + side * w, p + side * w + nv * thick, p - side * w + nv * thick, p - side * w]
    faces = []
    for i in range(n - 1):
        a, b = 4 * i, 4 * (i + 1)
        for k in range(4):
            k1 = (k + 1) % 4
            faces.append((a + k, a + k1, b + k1, b + k))
    faces.append((4 * (n - 1) + 3, 4 * (n - 1) + 2, 4 * (n - 1) + 1, 4 * (n - 1)))
    return Geo(verts, faces)


def ang_dist(a, b):
    return abs((a - b + math.pi) % TAU - math.pi)


def split_angles(base_n, base_phase, centres, width):
    """Evenly spaced angles plus a narrow (c - w, c, c + w) triplet around each centre. Returns
    (angles, roles) where roles[s] is None or (centre index, -1 | 0 | 1)."""
    entries = []
    for k in range(base_n):
        a = (base_phase + TAU * k / base_n) % TAU
        if all(ang_dist(a, c) > 2.4 * width for c in centres):
            entries.append((a, None))
    for ci, c in enumerate(centres):
        for role in (-1, 0, 1):
            entries.append(((c + role * width) % TAU, (ci, role)))
    entries.sort(key=lambda e: e[0])
    return [e[0] for e in entries], [e[1] for e in entries]


def in_groove(roles, s):
    """Segment s (from angle s to s + 1) lies inside a triplet: returns the centre index or None."""
    a, b = roles[s], roles[(s + 1) % len(roles)]
    if a and b and a[0] == b[0] and (a[1], b[1]) in ((-1, 0), (0, 1)):
        return a[0]
    return None


def flatten_planes(geo, centre, planes, strength=0.7, zmax=None):
    """Push vertices back behind a few planes: the chunky facets of a rock."""
    c = Vector(centre)
    for v in geo.verts:
        if zmax is not None and v.z > zmax:
            continue
        for d, lim in planes:
            d = Vector(d).normalized()
            over = (v - c).dot(d) - lim
            if over > 0:
                v -= d * over * strength


# =============================================================== materials
def M(name, color, rough=0.55, metal=0.0, emit=None, strength=0.0, sheet=False):
    """style.mat plus the side flag: every piece here is a closed solid, so single sided."""
    m = mat(name, color, rough, metal, emit, strength)
    m.use_backface_culling = not sheet
    return m


def materials():
    return dict(
        bark=M('Bark', '#94562E', 0.7),                 # identical to build_nature.py's Bark
        pine=M('Snow pine', '#0E8C74', 0.6),
        snow=M('Snow', '#F2F8FF', 0.42),
        ice=M('Ice', '#36BDF2', 0.12),
        ice_glow=M('Ice glow', '#A8EEFF', 0.18, emit='#46CFFF', strength=EMISSIVE['Ice glow']),
        frost=M('Frost rock', '#6683C2', 0.6),
        coal=M('Coal', '#25232F', 0.35),
        carrot=M('Carrot', '#FF7A1A', 0.45),
        scarf=M('Scarf', '#EC2F4B', 0.55),
        twig=M('Twig', '#7B4826', 0.7),
        basalt=M('Basalt', '#2E2836', 0.62),
        # The game tone-maps with three.js Neutral, which pulls strong emission toward white, so the
        # glows keep green low (Lava glow uses build_space.py's colours).
        lava=M('Lava glow', '#FF6A14', 0.45, emit='#FF4A00', strength=EMISSIVE['Lava glow']),
        obsidian=M('Obsidian', '#26163E', 0.1),
        edge=M('Obsidian edge', '#9C5CFF', 0.14),
        charcoal=M('Charcoal wood', '#3A2F31', 0.8),
        ember=M('Ember', '#FF6A22', 0.45, emit='#FF4612', strength=EMISSIVE['Ember']),
        slope=M('Volcano slope', '#4F2A2C', 0.75),
        shadow_wood=M('Shadow wood', '#4D3579', 0.68),
        shadow_glow=M('Shadow glow', '#9E5CFF', 0.35, emit='#8A3DFF', strength=EMISSIVE['Shadow glow']),
    )


# ===================================================================== ice
def build_snow_pine(m):
    p = Piece('snow_pine')
    p.add(lathe([(0.25, 0.0), (0.17, 0.13), (0.13, 0.8)], 6, phase=0.3), m['bark'])
    # A snow drift around the trunk foot fills the 0.45 collision circle.
    p.add(lathe([(0.45, 0.0), (0.37, 0.07), (0.19, 0.13)], 8, phase=0.1,
                mod=lambda th, i, s: 1 + 0.06 * math.sin(3 * th + 0.5) if i < 2 else 1.0), m['snow'])
    rng = random.Random(41)
    tiers = [(0.62, 2.22, 1.38, 16), (1.5, 3.12, 1.06, 16), (2.34, 4.0, 0.76, 12)]
    for k, (b, t, r, segs) in enumerate(tiers):
        h = t - b
        # Rounded drips: every fourth lip vertex hangs lowest, its neighbours half way.
        drip = []
        for s in range(segs):
            ph = s % 4
            drip.append(rng.uniform(0.8, 1.0) if ph == 0 else rng.uniform(0.4, 0.55) if ph in (1, 3)
                        else rng.uniform(0.0, 0.08))
        spikes = [1.0 + (0.07 if s % 2 == 0 else -0.03) for s in range(segs)]
        # Rings: underside pole, green rim, top of the steep green skirt, snow lip (a thick ledge
        # overhanging the skirt), snow shoulder, snowy tip. Drips pull the lip down over the skirt.
        skirt = (0.3 if k < 2 else 0.4) * h
        prof = [(0.0, b), (r, b + 0.04), (0.8 * r, b + skirt), (0.9 * r, b + skirt + 0.08),
                (0.5 * r, b + 0.72 * h), (0.0, t)]

        def mod(th, i, s, drip=drip, spikes=spikes):
            if i == 1:
                return spikes[s]
            if i == 2:
                return 1 + 0.08 * drip[s]
            if i == 3:
                return 1 + 0.05 * drip[s]
            return 1.0

        def zmod(th, i, s, drip=drip):
            if i == 2:
                return -0.16 * drip[s]
            if i == 3:
                return -0.3 * drip[s]
            return 0.0
        g = lathe(prof, segs, phase=0.5 * k, mod=mod, zmod=zmod, tag=lambda band, s: 1 if band >= 2 else 0)
        p.add(g, {0: m['pine'], 1: m['snow']})
    return p.build(sharp=55)


def crystal(base, h, r, sides, tilt, yaw, spin=0.0, taper=0.8, tip=0.72, apex=(0.0, 0.0), glow_from=2):
    """A faceted prism with a pyramid tip; bands from `glow_from` up are tagged 1 (glow)."""
    prof = [(r, 0.0), (r * 1.06, 0.1 * h), (r * taper, tip * h), (0.0, h)]
    g = lathe(prof, sides, phase=spin, tag=lambda band, s: 1 if band >= glow_from else 0)
    g.verts[-1] += Vector((apex[0], apex[1], 0.0))
    return g.transformed(tilted(base, tilt, yaw, sink=r * math.sin(tilt) + 0.01))


def build_ice_spire(m):
    p = Piece('ice_spire')
    mats = {0: m['ice'], 1: m['ice_glow']}
    specs = [  # base, height, radius, sides, tilt, lean direction, spin, taper, tip
        ((0.0, 0.05, 0.0), 2.8, 0.33, 6, RAD(4), RAD(100), 0.2, 0.8, 0.7),
        ((0.25, -0.1, 0.0), 1.32, 0.17, 5, RAD(14), RAD(-25), 0.5, 0.8, 0.7),
        ((-0.25, -0.03, 0.0), 1.0, 0.15, 5, RAD(20), RAD(178), 0.1, 0.8, 0.7),
        ((0.06, 0.3, 0.0), 0.64, 0.11, 4, RAD(24), RAD(80), 0.3, 0.78, 0.66),
        ((-0.1, -0.3, 0.0), 0.44, 0.09, 4, RAD(28), RAD(-112), 0.6, 0.78, 0.66),
    ]
    for base, h, r, sides, tilt, yaw, spin, taper, tip in specs:
        p.add(crystal(base, h, r, sides, tilt, yaw, spin, taper, tip), mats, smooth=False)
    return p.build()


def build_snow_rock(m):
    p = Piece('snow_rock')
    rng = random.Random(23)
    segs = 12
    noise = [rng.uniform(-1, 1) for _ in range(segs)]
    drip = [rng.uniform(0.7, 1.0) if s % 3 == 0 else rng.uniform(0.15, 0.35) if s % 3 == 1 else 0.0
            for s in range(segs)]
    # A half-buried round boulder: ground, belly, shoulder, then the snow cap: under-lip (rock),
    # overhanging lip, dome, crown and top. Drips pull the lip down the shoulder.
    prof = [(0.73, 0.0), (0.86, 0.18), (0.78, 0.4), (0.55, 0.52), (0.63, 0.55), (0.49, 0.73), (0.27, 0.86),
            (0.0, 0.9)]

    def mod(th, i, s):
        k = 1 + 0.06 * noise[s] + 0.05 * math.cos(2 * th - 0.4)
        if i == 3:
            return k * (1 + 0.12 * drip[s])
        if i == 4:
            return k * (1 + 0.14 * drip[s])
        return k

    def zmod(th, i, s):
        if i == 3:
            return -0.12 * drip[s]
        if i == 4:
            return -0.16 * drip[s]
        if i in (5, 6):
            return 0.025 * noise[s]
        return 0.0
    g = lathe(prof, segs, phase=0.2, mod=mod, zmod=zmod, tag=lambda b, s: 1 if b >= 3 else 0)
    for v in g.verts:
        v.y *= 0.88
    p.add(g, {0: m['frost'], 1: m['snow']})
    return p.build(sharp=50)


def _toward(yaw, elev):
    """Unit direction: yaw 0 faces the front (-Y), positive yaw turns toward +X."""
    return Vector((math.sin(RAD(yaw)) * math.cos(RAD(elev)), -math.cos(RAD(yaw)) * math.cos(RAD(elev)),
                   math.sin(RAD(elev))))


def _on_ball(c, rx, rz, d, lift=0.0):
    d = Vector(d).normalized()
    k = 1 / math.sqrt((d.x / rx) ** 2 + (d.y / rx) ** 2 + (d.z / rz) ** 2)
    p = Vector(c) + d * k
    n = Vector(((p.x - c[0]) / rx ** 2, (p.y - c[1]) / rx ** 2, (p.z - c[2]) / rz ** 2)).normalized()
    return p + n * lift, n


def build_snowman(m):
    p = Piece('snowman')
    balls = [((0.0, 0.0, 0.42), 0.45, 0.42, 13, (-55, -20, 15, 50)),
             ((0.0, 0.0, 1.0), 0.32, 0.3, 12, (-50, -15, 20, 52)),
             ((0.0, 0.0, 1.4), 0.24, 0.24, 12, (-50, -15, 20, 52))]

    def inside(v, ball, margin=0.985):
        c, rx, rz = ball[0], ball[1], ball[2]
        return ((v.x - c[0]) / rx) ** 2 + ((v.y - c[1]) / rx) ** 2 + ((v.z - c[2]) / rz) ** 2 < margin ** 2
    for i, (c, rx, rz, segs, lats) in enumerate(balls):
        prof = [(0.0, -1.0)] + [(math.cos(RAD(a)), math.sin(RAD(a))) for a in lats] + [(0.0, 1.0)]
        g = lathe(prof, segs, phase=0.13 * i)
        for v in g.verts:
            v.x, v.y, v.z = c[0] + v.x * rx, c[1] + v.y * rx, c[2] + v.z * rz
        others = [b for j, b in enumerate(balls) if j != i]
        g = g.keep(lambda f, g=g, others=others: not any(all(inside(g.verts[k], o) for k in f) for o in others))
        p.add(g, m['snow'])
    head = balls[2]
    mid = balls[1]
    # Coal eyes, a dotted smile and two buttons, half sunk into the snow.
    for yaw in (-24, 24):
        pos, _ = _on_ball(head[0], head[1], head[2], _toward(yaw, 17), -0.012)
        p.add(octa(0.045, pos, 1.1), m['coal'])
    for yaw, elev in ((-21, -20), (0, -27), (21, -20)):
        pos, _ = _on_ball(head[0], head[1], head[2], _toward(yaw, elev), -0.004)
        p.add(tetra(0.026, pos), m['coal'])
    for elev in (14, -22):
        pos, _ = _on_ball(mid[0], mid[1], mid[2], _toward(0, elev), -0.016)
        p.add(octa(0.052, pos, 0.95), m['coal'])
    # Carrot nose.
    root, _ = _on_ball(head[0], head[1], head[2], _toward(0, 0), -0.03)
    p.add(lathe([(0.056, 0.0), (0.036, 0.13), (0.0, 0.3)], 6), m['carrot'],
          facing(root, _toward(0, -7), spin=0.3))
    # Scarf: a puffy roll around the neck crease, and one end hanging over the front right.
    p.add(lathe([(0.2, 1.165), (0.255, 1.24), (0.17, 1.33)], 10, phase=0.2,
                mod=lambda th, i, s: 1 + 0.04 * math.sin(3 * th) if i == 1 else 1.0), m['scarf'])
    pts, nrms = [], []
    for z, yaw in ((1.22, 38), (1.08, 42), (0.92, 46)):
        d = _toward(yaw, 0)
        rz = (z - mid[0][2]) / mid[2]
        rr = mid[1] * math.sqrt(max(0.0, 1 - rz * rz)) if z < 1.2 else 0.25
        pos = Vector((d.x * rr, d.y * rr, z))
        pts.append(pos)
        nrms.append(Vector((d.x, d.y, 0.25 if z < 1.2 else 0.6)))
    p.add(strap(pts, nrms, 0.15, 0.045, taper=[1.0, 1.0, 1.1]), m['scarf'])
    # Twig arms: the right one down and out, the left one waving.
    for path, finger in ((((0.22, 0.0, 1.03), (0.48, -0.02, 1.12), (0.71, -0.04, 1.25)),
                          ((0.58, -0.03, 1.18), (0.64, -0.07, 1.32))),
                         (((-0.22, 0.0, 1.03), (-0.45, -0.02, 1.17), (-0.6, -0.05, 1.4)),
                          ((-0.52, -0.03, 1.27), (-0.66, -0.06, 1.33)))):
        p.add(tube(path, [0.036, 0.029, 0.0], sides=3, ang0=0.4), m['twig'])
        p.add(tube(finger, [0.022, 0.0], sides=3), m['twig'])
    return p.build(sharp=60)


# ==================================================================== lava
def build_lava_rock(m):
    p = Piece('lava_rock')
    rng = random.Random(7)
    cracks = [(RAD(-80), 4), (RAD(22), 3), (RAD(148), 4), (RAD(232), 2)]  # centre, glowing bands from the top
    angles, roles = split_angles(11, RAD(10), [c for c, _ in cracks], RAD(6))
    noise_by_crack = [rng.uniform(-1, 1) for _ in cracks]
    noise = [noise_by_crack[r[0]] if r else rng.uniform(-1, 1) for r in roles]
    prof = [(0.84, 0.0), (0.98, 0.32), (0.84, 0.73), (0.44, 1.0), (0.0, 1.09)]
    top_band = len(prof) - 2

    def glowing(band, crack):
        return band >= top_band + 1 - cracks[crack][1]

    def mod(th, i, s):
        k = 1 + 0.07 * noise[s]
        r = roles[s]
        if r and r[1] == 0 and i > top_band + 1 - cracks[r[0]][1]:
            k *= 0.88  # the groove
        return k

    def tag(band, s):
        c = in_groove(roles, s)
        return 1 if c is not None and glowing(band, c) else 0
    g = lathe(prof, angles=angles, mod=mod, tag=tag)
    # Zigzag the cracks: each ring turns its crack triplets by a small seeded angle.
    # The lowest ring of each crack pinches its sides in, so the crack ends in a point.
    jitter = [[rng.uniform(-1, 1) * RAD(6) for _ in prof] for _ in cracks]
    for i, ring in enumerate(g.rings):
        if len(ring) == 1:
            continue
        for s, vi in enumerate(ring):
            role = roles[s]
            if not role:
                continue
            turn = jitter[role[0]][i]
            if role[1] and i == top_band + 1 - cracks[role[0]][1]:
                turn -= role[1] * RAD(6) * 0.75
            g.verts[vi] = Matrix.Rotation(turn, 3, 'Z') @ g.verts[vi]
    for v in g.verts:
        v.y *= 0.86
    flatten_planes(g, (0, 0, 0.4), [((0.4, -0.8, 0.45), 0.5), ((-0.85, -0.2, 0.3), 0.62),
                                     ((0.75, 0.5, 0.35), 0.58), ((0.0, 0.1, 1.0), 0.5), ((-0.3, 0.85, 0.2), 0.62)],
                   strength=0.75)
    p.add(g, {0: m['basalt'], 1: m['lava']})
    return p.build(sharp=38)


def shard(base, h, r, sides, tilt, yaw, spin=0.0, chamfer=RAD(9), taper=0.82, tip=0.72, apex=(0.0, 0.0)):
    """A glossy faceted shard whose vertical edges are narrow chamfers (tag 1) that run to the apex."""
    angles = []
    for k in range(sides):
        c = spin + TAU * (k + 0.5) / sides
        angles += [c - chamfer, c + chamfer]
    g = lathe([(r, 0.0), (r * taper, tip * h), (0.0, h)], angles=angles, tag=lambda b, s: 1 if s % 2 == 0 else 0)
    g.verts[-1] += Vector((apex[0], apex[1], 0.0))
    return g.transformed(tilted(base, tilt, yaw, sink=r * math.sin(tilt) + 0.01))


def build_obsidian(m):
    p = Piece('obsidian')
    mats = {0: m['obsidian'], 1: m['edge']}
    specs = [  # base, height, radius, sides, tilt, lean direction, spin, apex nudge
        ((0.02, 0.1, 0.0), 1.4, 0.21, 5, RAD(6), RAD(80), 0.2, (0.03, 0.0)),
        ((0.21, -0.06, 0.0), 1.0, 0.16, 4, RAD(18), RAD(-15), 0.4, (0.0, -0.02)),
        ((-0.21, 0.02, 0.0), 0.86, 0.15, 5, RAD(22), RAD(192), 0.0, (0.0, 0.02)),
        ((-0.02, -0.22, 0.0), 0.6, 0.13, 4, RAD(26), RAD(-95), 0.7, (0.02, 0.0)),
        ((-0.13, 0.27, 0.0), 0.5, 0.1, 4, RAD(28), RAD(125), 0.3, (0.0, 0.0)),
    ]
    for base, h, r, sides, tilt, yaw, spin, apex in specs:
        p.add(shard(base, h, r, sides, tilt, yaw, spin, apex=apex), mats, smooth=False)
    return p.build()


def build_ash_tree(m):
    p = Piece('ash_tree')
    mats = {0: m['charcoal'], 1: m['ember']}
    # Trunk and leader: one gnarly tube, smouldering at the tip and in one crack low on the trunk.
    trunk = [(0, 0, 0), (0.02, 0.0, 0.45), (0.07, 0.02, 0.95), (0.03, 0.04, 1.45), (-0.05, 0.03, 1.95),
             (-0.12, 0.0, 2.45), (-0.09, -0.05, 2.9), (-0.05, -0.07, 3.2)]
    p.add(tube(trunk, [0.29, 0.225, 0.19, 0.16, 0.128, 0.09, 0.05, 0.0], sides=6, ang0=0.3,
               tag=lambda b, s: 1 if b >= 6 or (b == 1 and s == 0) else 0), mats)
    branches = [  # path, radii, glowing tip
        (((0.05, 0.02, 1.2), (0.42, -0.08, 1.55), (0.62, -0.14, 2.05), (0.9, -0.1, 2.38)), [0.125, 0.088, 0.058, 0.0], True),
        (((0.0, 0.03, 1.72), (-0.42, 0.06, 2.0), (-0.66, 0.16, 2.45), (-0.88, 0.12, 2.7)), [0.115, 0.08, 0.052, 0.0], True),
        (((-0.04, 0.03, 2.18), (0.2, 0.24, 2.5), (0.36, 0.36, 2.9)), [0.09, 0.058, 0.0], False),
    ]
    for path, radii, hot in branches:
        nb = len(path) - 1
        p.add(tube(path, radii, sides=6, ang0=0.2,
                   tag=lambda b, s, hot=hot, nb=nb: 1 if hot and b == nb - 1 else 0), mats)
    # Twigs and a snapped stub with a glowing broken end.
    for path in (((0.6, -0.13, 1.95), (0.84, -0.32, 2.05)), ((-0.56, 0.12, 2.25), (-0.74, -0.14, 2.32))):
        p.add(tube(path, [0.035, 0.0], sides=3), m['charcoal'])
    p.add(tube(((0.08, 0.0, 0.82), (0.3, -0.14, 0.95)), [0.075, 0.06], sides=4, cap_end=True, cap_tag=1), mats)
    for k, yaw in enumerate((RAD(-60), RAD(60), RAD(180))):
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        p.add(tube([d * 0.1 + UP * 0.28, d * 0.33], [0.1, 0.0], sides=3, ang0=0.5), m['charcoal'])
    return p.build(sharp=55)


def build_mini_volcano(m):
    p = Piece('mini_volcano')
    rng = random.Random(13)
    drips = [(RAD(-96), 2), (RAD(-38), 3), (RAD(206), 1), (RAD(124), 3)]  # centre, lowest ring reached
    angles, roles = split_angles(12, RAD(5), [c for c, _ in drips], RAD(6))
    noise_by_drip = [rng.uniform(-1, 1) for _ in drips]
    noise = [noise_by_drip[r[0]] if r else rng.uniform(-1, 1) for r in roles]
    # Rings: base, skirt, slope, upper slope, rim outside, rim top, crater floor edge, pool centre.
    prof = [(2.0, 0.0), (1.72, 0.3), (1.24, 1.12), (0.86, 1.98), (0.68, 2.46), (0.58, 2.6), (0.44, 2.44),
            (0.0, 2.47)]

    def mod(th, i, s):
        return 1 + (0.045 if i < 4 else 0.03) * noise[s]

    def tag(band, s):
        if band == 6:
            return 2  # the lava pool
        d = in_groove(roles, s)
        if d is not None and drips[d][1] <= band <= 5:
            return 2
        return 0 if band in (4, 5) else 1
    g = lathe(prof, angles=angles, mod=mod, tag=tag)
    # Drips: raised lava ridges spilling through a notch in the rim, each ending in a rounded point.
    for s, role in enumerate(roles):
        if not role or role[1] != 0:
            continue
        low = drips[role[0]][1]
        for i in range(low, 6):
            v = g.verts[g.rings[i][s]]
            if i == low:
                below = g.verts[g.rings[i - 1][s]]
                v += (below - v) * 0.4
            else:
                out = Vector((v.x, v.y, 0)).normalized()
                v += out * (0.06 if i < 4 else 0.03)
            if i == 5:
                v.z -= 0.06
    p.add(g, {0: m['basalt'], 1: m['slope'], 2: m['lava']})
    # Two basalt boulders at the foot.
    for k, (ang, dist, r) in enumerate(((RAD(-130), 1.7, 0.38), (RAD(18), 1.78, 0.32))):
        c = Vector((math.cos(ang) * dist, math.sin(ang) * dist, 0))
        b = lathe([(r, 0.0), (r * 1.05, 0.13), (r * 0.6, 0.3), (0.0, 0.36)], 6, phase=0.4 * k,
                  mod=lambda th, i, s: 1 + 0.12 * math.cos(2 * th + s))
        p.add(b, m['basalt'], Matrix.Translation(c))
    return p.build(sharp=50)


# ================================================================== shadow
def curl_path(base, yaw, out, rise, rho, turns=1.25, n_out=3, n_curl=3):
    """Out and up from base, then a spiral hook curling outward and down (a fiddlehead)."""
    d = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    p0 = Vector(base)
    p2 = p0 + d * out + UP * rise
    p1 = p0 + d * out * 0.3 + UP * rise * 0.8
    pts = bez([p0, p1, p2], n_out)
    c = p2 - UP * rho
    for k in range(1, n_curl + 1):
        t = k / n_curl
        a = math.pi / 2 - t * turns * math.pi
        rr = rho * (1 - 0.45 * t)
        pts.append(c + d * (rr * math.cos(a)) + UP * (rr * math.sin(a)))
    return pts


def bud(tip):
    """A hanging teardrop whose narrow top meets the branch tip."""
    g = lathe([(0.0, 0.0), (0.13, 0.1), (0.085, 0.23), (0.0, 0.3)], 4, phase=RAD(45))
    return g.transformed(Matrix.Translation(Vector(tip) - UP * 0.28))


def build_deadtree(m):
    p = Piece('deadtree')
    wood, glow = m['shadow_wood'], m['shadow_glow']
    trunk = [(0, 0, 0), (0.03, 0.0, 0.45), (-0.05, 0.03, 0.95), (0.06, 0.02, 1.45), (-0.03, -0.01, 1.95),
             (0.05, -0.02, 2.4)]
    leader = curl_path(trunk[-1], RAD(215), 0.32, 0.95, 0.2, turns=1.3, n_out=3, n_curl=3)
    path = trunk + leader[1:]
    radii = [0.28, 0.22, 0.19, 0.165, 0.14, 0.115, 0.09, 0.07, 0.055, 0.04, 0.0]
    p.add(tube(path, radii, sides=5, flatten=0.8, twist=RAD(28), ang0=0.2), wood)
    tips = [path[-1]]
    for base, yaw, out, rise, rho, hold in (((-0.03, 0.0, 1.4), RAD(160), 0.9, 0.5, 0.24, True),
                                            ((0.03, -0.01, 1.92), RAD(-12), 0.92, 0.46, 0.23, True),
                                            ((0.03, 0.0, 2.25), RAD(78), 0.62, 0.42, 0.17, False)):
        pts = curl_path(base, yaw, out, rise, rho)
        p.add(tube(pts, [0.115, 0.088, 0.066, 0.05, 0.036, 0.0], sides=4, ang0=RAD(45), twist=RAD(20)), wood)
        if hold:
            tips.append(pts[-1])
    for tip in tips:
        p.add(bud(tip), glow)
    # A couple of crooked twigs and three roots.
    for path_ in (((0.0, 0.03, 1.0), (0.22, 0.2, 1.2)), ((-0.52, 0.18, 1.77), (-0.62, -0.1, 1.98))):
        p.add(tube(path_, [0.04, 0.0], sides=3), wood)
    for yaw in (RAD(-80), RAD(40), RAD(160)):
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        p.add(tube([d * 0.1 + UP * 0.3, d * 0.34], [0.1, 0.0], sides=3, ang0=0.5), wood)
    return p.build(sharp=60)


BUILDERS = dict(snow_pine=build_snow_pine, ice_spire=build_ice_spire, snow_rock=build_snow_rock,
                snowman=build_snowman, lava_rock=build_lava_rock, obsidian=build_obsidian,
                ash_tree=build_ash_tree, mini_volcano=build_mini_volcano, deadtree=build_deadtree)


def build(ids):
    m = materials()
    return {name: BUILDERS[name](m) for name in ids}


# ================================================================= checking
def gltf_point(v):
    return [v[0], v[2], -v[1]]


def node_stats(name, obj):
    me = obj.data
    me.calc_loop_triangles()
    co = [v.co for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    glo = [lo[0], lo[2], -hi[1]]
    ghi = [hi[0], hi[2], -lo[1]]
    used = sorted({me.materials[t.material_index].name for t in me.loop_triangles})
    c = CONTRACT[name]
    rnd = lambda xs: [round(x, 4) for x in xs]  # noqa: E731
    return dict(
        planet=c['planet'],
        triangles=len(me.loop_triangles),
        vertices=len(co),
        materials=used,
        emissive=[n for n in used if n in EMISSIVE],
        bounds=dict(blender=dict(min=rnd(lo), max=rnd(hi), size=rnd([hi[i] - lo[i] for i in range(3)])),
                    gltf=dict(min=rnd(glo), max=rnd(ghi), size=rnd([ghi[i] - glo[i] for i in range(3)]))),
        height=round(hi[2], 4),
        radius_xy=round(max(math.hypot(v.x, v.y) for v in co), 4),
        ground_radius=round(max(math.hypot(v.x, v.y) for v in co if v.z <= 0.1), 4),
        collision_radius=c['collision'],
        nominal=dict(h=c['h'], r=c['r'], foot=c['foot']),
        budget=c['tris'],
    )


def check(name, s):
    c = CONTRACT[name]
    errors = []
    if s['triangles'] > c['tris']:
        errors.append(f"{s['triangles']} triangles > {c['tris']}")
    if s['materials'] != sorted(c['mats']):
        errors.append(f"materials {s['materials']} != {sorted(c['mats'])}")
    zmin = s['bounds']['blender']['min'][2]
    if abs(zmin) > 0.02:
        errors.append(f'min z {zmin} not within 0.02 of 0')
    if not 0.85 * c['h'] <= s['height'] <= 1.15 * c['h']:
        errors.append(f"height {s['height']} not within 15% of {c['h']}")
    if s['radius_xy'] > 1.15 * c['r']:
        errors.append(f"radius {s['radius_xy']} > {c['r']} + 15%")
    if s['ground_radius'] > 1.15 * c['foot']:
        errors.append(f"ground footprint {s['ground_radius']} > {c['foot']} + 15%")
    return errors


def read_glb(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen, _ = struct.unpack_from('<II', data, 12)
    return json.loads(data[20:20 + jlen])


def check_glb(path, ids):
    """Re-read the exported file: exact top-level nodes at the origin, materials per node, glow."""
    doc = read_glb(path)
    errors = []
    nodes = doc.get('nodes', [])
    top = [nodes[i] for i in doc['scenes'][doc.get('scene', 0)]['nodes']]
    names = [n.get('name') for n in top]
    if sorted(names) != sorted(ids):
        errors.append(f'GLB top-level nodes {sorted(names)} != {sorted(ids)}')
    mats = doc.get('materials', [])
    for n in top:
        if any(k in n for k in ('translation', 'rotation', 'scale', 'matrix', 'children')):
            errors.append(f"{n.get('name')}: node has a transform or children")
        if 'mesh' not in n:
            errors.append(f"{n.get('name')}: no mesh")
            continue
        got = sorted({mats[pr['material']]['name'] for pr in doc['meshes'][n['mesh']]['primitives']})
        want = sorted(CONTRACT[n['name']]['mats']) if n.get('name') in CONTRACT else None
        if got != want:
            errors.append(f"{n.get('name')}: GLB materials {got} != {want}")
    for mt in mats:
        strength = mt.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength')
        factor = mt.get('emissiveFactor', [0, 0, 0])
        lit = max(factor) * (strength or 1.0) if factor else 0.0
        want = EMISSIVE.get(mt['name'])
        if want is None and lit > 0:
            errors.append(f"material {mt['name']} should not be emissive")
        if want is not None and abs(lit - want) > 0.05:
            errors.append(f"material {mt['name']} emits {lit:.2f}, want {want}")
        if mt.get('doubleSided'):
            errors.append(f"material {mt['name']} is double sided")
    # Bark must be the very material scenery.glb ships, so the game batches and tints them together.
    for ref in (os.path.join(MODELS, 'scenery.glb'), os.path.join(PUBLIC_MODELS, 'scenery.glb')):
        if os.path.exists(ref):
            theirs = [mt for mt in read_glb(ref).get('materials', []) if mt.get('name') == 'Bark']
            ours = [mt for mt in mats if mt.get('name') == 'Bark']
            if theirs and ours and theirs[0] != ours[0]:
                errors.append(f'Bark differs from {os.path.relpath(ref, REPO)}: {ours[0]} vs {theirs[0]}')
            break
    return errors, doc


def material_info(mt):
    bsdf = next(n for n in mt.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    col = bsdf.inputs['Base Color'].default_value
    em = bsdf.inputs['Emission Color'].default_value
    strength = bsdf.inputs['Emission Strength'].default_value

    def hexc(c):
        return '#' + ''.join(f'{round(255 * (x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)):02X}'
                             for x in c[:3])
    out = dict(color=hexc(col), roughness=round(bsdf.inputs['Roughness'].default_value, 3))
    if strength > 0 and max(em[:3]) > 0:
        out.update(emissive=hexc(em), strength=round(strength, 3))
    return out


def report(stats):
    print('\n== harsh worlds')
    for name, s in stats.items():
        b = s['bounds']['blender']
        print(f"  {name:13s} {s['planet']:6s} {s['triangles']:4d}/{s['budget']:<4d} tris  h {s['height']:.2f}"
              f"  r {s['radius_xy']:.2f}  ground r {s['ground_radius']:.2f}  z0 {b['min'][2]:+.3f}  {s['materials']}")


# ================================================================= previews
def _eevee(samples=48):
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.6),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def _preview_studio(size, ground):
    """style.studio toned like the other kit previews (dimmer sky, -0.4 EV). Returns what it made."""
    lights, floor = studio(ground_color=ground, size=size)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.55
    scene.view_settings.exposure = -0.4
    _eevee(48)
    return lights + ([floor] if floor else [])


def _place_copy(obj, loc, rz=0.0, scale=1.0):
    o = obj.copy()
    bpy.context.scene.collection.objects.link(o)
    o.hide_render = False
    o.location = loc
    o.rotation_euler = (0, 0, rz)
    o.scale = (scale, scale, scale)
    return o


def project(cam, point, res):
    from bpy_extras.object_utils import world_to_camera_view
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = res
    co = world_to_camera_view(scene, cam, Vector(point))
    return co.x - 0.5, co.y - 0.5


def hud_label(cam, text, u, v, size, res, color='#10283C', align='CENTER'):
    """Flat text in front of an orthographic camera at (u, v) of the frame (-0.5..0.5 from the centre)."""
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = align
    cu.align_y = 'TOP'
    cu.materials.append(mat('Preview label ' + color, color, 0.6, emit=color, emit_strength=0.6))
    obj = bpy.data.objects.new('Label', cu)
    bpy.context.scene.collection.objects.link(obj)
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
        elif isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)


def contact_sheet(objs, stats, path):
    """Every piece from the game camera on its planet's ground, labelled with name and triangles."""
    rows = [('ice', ['snow_pine', 'ice_spire', 'snow_rock', 'snowman']),
            ('lava', ['lava_rock', 'obsidian', 'ash_tree', 'mini_volcano']),
            ('shadow', ['deadtree'])]
    width, label_room, gap_y = 21.0, 0.9, 0.25
    # Lay the strips out back to front. Seen 42 degrees down, a piece of height h covers 1.11 h of
    # ground behind its base, so each strip is deep enough to hold its tallest piece and a label.
    layout, y = [], 0.0
    for planet, names in rows:
        names = [n for n in names if n in objs]
        if not names:
            continue
        depth = max(max(stats[n]['radius_xy'] + label_room + 1.11 * stats[n]['height'] + 0.3,
                        2 * stats[n]['radius_xy'] + label_room + 0.6) for n in names)
        layout.append((planet, names, y - depth, y))
        y -= depth + gap_y
    span = layout[0][3] - layout[-1][2]
    px_per_m = 1800 / (width + 0.4)
    res = (1800, int(span * math.sin(RAD(42.16)) * px_per_m) + 24)
    made = _preview_studio(res, '#E9EEF6')
    placed = []
    for planet, names, front, back in layout:
        made.append(style.box('Strip ' + planet, (width, back - front, 0.1), (0.0, (front + back) / 2, -0.049),
                              mat('Strip ' + planet, GROUND[planet], 0.9), bev=0))
        widths = [2 * stats[n]['radius_xy'] for n in names]
        gap = 1.3
        x = -(sum(widths) + gap * (len(names) - 1)) / 2
        for n, w in zip(names, widths):
            loc = Vector((x + w / 2, front + label_room + stats[n]['radius_xy'], 0))
            objs[n].location = loc
            objs[n].hide_render = False
            placed.append((n, loc, planet))
            x += w + gap
    cam = game_camera(target=(0.0, (layout[0][3] + layout[-1][2]) / 2, 0.0), ortho_scale=width + 0.4)
    bpy.context.view_layer.update()
    labels = []
    for n, loc, planet in placed:
        u, v = project(cam, loc + Vector((0, -stats[n]['radius_xy'] - 0.1, 0)), res)
        colour = '#FFFFFF' if planet in ('shadow', 'lava') else '#10283C'
        labels.append(hud_label(cam, f"{n}  {stats[n]['triangles']} tris", u, v, 0.3, res, colour))
    render(path)
    _remove(labels + [cam])
    _remove(made)
    for o in objs.values():
        o.location = (0, 0, 0)


class HeroStandIn:
    """The explorer for scale: hero.glb if it is installed, otherwise hero_spec's proxy."""

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
            import hero_spec
            hero_spec.build_proxy_hero(style)
        bpy.context.view_layer.update()
        self.objects = [o for o in bpy.data.objects if o not in before]

    def show(self, visible):
        for o in self.objects:
            o.hide_render = not visible


SCENES = {
    # piece, x, y, yaw (degrees), scale
    'ice': [('snow_pine', -4.6, 3.4, 20, 1.0), ('snow_pine', 3.9, 4.4, 140, 1.1), ('snow_pine', -0.8, 6.2, 75, 0.95),
            ('snow_pine', 6.4, 0.6, 200, 0.9), ('snow_pine', -6.4, -1.2, 310, 1.05), ('snow_pine', 1.6, 8.6, 10, 1.0),
            ('snow_pine', -4.0, 8.2, 250, 1.1), ('ice_spire', 2.4, 1.8, 0, 1.0), ('ice_spire', -2.9, 0.6, 140, 0.9),
            ('ice_spire', 4.6, -2.7, 230, 1.05), ('snow_rock', -2.1, -2.8, 0, 1.0), ('snow_rock', 1.3, 4.3, 90, 0.9),
            ('snow_rock', -5.6, 5.4, 200, 1.1), ('snow_rock', 6.0, 3.6, 30, 0.85), ('snowman', 1.9, -1.3, 0, 1.0)],
    'lava': [('mini_volcano', -5.4, 7.6, 0, 1.0), ('mini_volcano', -1.2, 8.6, 70, 1.05), ('mini_volcano', 3.2, 8.3, 150, 1.0),
             ('mini_volcano', 7.2, 6.8, 220, 1.0), ('lava_rock', -3.4, 1.4, 0, 1.0), ('lava_rock', 3.4, -1.6, 120, 0.9),
             ('lava_rock', -5.6, -3.0, 220, 1.05), ('obsidian', 2.3, 2.2, 0, 1.0), ('obsidian', -1.9, -2.8, 160, 0.9),
             ('obsidian', 5.8, 1.6, 60, 1.1), ('ash_tree', -4.6, 4.2, 0, 1.0), ('ash_tree', 4.7, 3.4, 130, 1.1),
             ('ash_tree', 0.6, 4.0, 250, 0.95), ('ash_tree', -6.6, 0.8, 40, 0.9)],
    'shadow': [('deadtree', -3.4, 2.4, 0, 1.0), ('deadtree', 3.1, 3.4, 150, 1.05), ('deadtree', -5.4, -1.8, 260, 0.95),
               ('deadtree', 4.9, -1.0, 70, 1.0), ('deadtree', 0.2, 6.0, 200, 1.1), ('deadtree', -1.9, -4.4, 30, 0.9),
               ('deadtree', 6.6, 5.6, 110, 1.0), ('deadtree', -6.2, 5.8, 300, 1.05)],
}


def _world(color, strength):
    scene = bpy.context.scene
    world = bpy.data.worlds.get('Kit world') or bpy.data.worlds.new('Kit world')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = style.rgba(color)
    bg.inputs['Strength'].default_value = strength
    scene.world = world


def _light(name, kind, energy, color, rot=(0, 0, 0), loc=(0, 0, 0), size=None):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = style.rgba(color)[:3]
    if size is not None:
        if kind == 'SUN':
            data.angle = size
        else:
            data.shadow_soft_size = size
    obj = bpy.data.objects.new(name, data)
    obj.rotation_euler = rot
    obj.location = loc
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _vignette_lights(planet):
    if planet == 'ice':
        _world('#BFE7FF', 0.6)
        return [_light('Key', 'SUN', 3.4, '#FFF4E6', (RAD(50), 0, RAD(-35)), size=RAD(8)),
                _light('Fill', 'SUN', 1.2, '#BFDFFF', (RAD(65), 0, RAD(140)), size=RAD(8)),
                _light('Rim', 'SUN', 1.2, '#FFFFFF', (RAD(30), 0, RAD(180)), size=RAD(8))]
    if planet == 'lava':
        _world('#E4DEF2', 0.5)
        return [_light('Key', 'SUN', 3.2, '#FFF0E2', (RAD(50), 0, RAD(-35)), size=RAD(8)),
                _light('Fill', 'SUN', 1.0, '#C8BCFF', (RAD(65), 0, RAD(140)), size=RAD(8)),
                _light('Rim', 'SUN', 1.0, '#FFC89A', (RAD(30), 0, RAD(180)), size=RAD(8))]
    # Shadow: eternal night. A faint moon, and a pool of light around the explorer.
    _world('#2A2148', 0.5)
    return [_light('Moon', 'SUN', 0.4, '#9C8CFF', (RAD(55), 0, RAD(-30)), size=RAD(6)),
            _light('Player light', 'POINT', 4200.0, '#FFE8C8', loc=(0.0, -0.4, 5.2), size=0.6)]


def render_scenes(objs, path):
    """One small dense vignette per planet at the game's zoom (about 43 px per metre)."""
    import numpy as np
    scene = bpy.context.scene
    style._engine(scene)
    _eevee(64)
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
    except TypeError:
        pass
    scene.view_settings.exposure = -0.4
    hero = HeroStandIn()
    res = (660, 600)
    tmp = tempfile.mkdtemp(prefix='worlds-harsh-')
    pngs = []
    for o in objs.values():
        o.hide_render = True
    for planet in ('ice', 'lava', 'shadow'):
        made = list(_vignette_lights(planet))
        made.append(style.box('Ground ' + planet, (60, 60, 0.1), (0, 0, -0.05),
                              mat('Ground ' + planet, GROUND[planet], 0.92), bev=0))
        for name, x, y, yaw, s in SCENES[planet]:
            made.append(_place_copy(objs[name], (x, y, 0), RAD(yaw), s))
        hero.show(True)
        cam = game_camera(target=(0.3, 2.2, 0.0), ortho_scale=res[0] / 43.0)
        bpy.context.view_layer.update()
        lab = hud_label(cam, planet.capitalize(), -0.47, 0.47, 0.5, res,
                        '#10283C' if planet == 'ice' else '#FFFFFF', align='LEFT')
        scene.render.resolution_x, scene.render.resolution_y = res
        out = os.path.join(tmp, planet + '.png')
        render(out)
        pngs.append(out)
        hero.show(False)
        _remove([lab, cam])
        for o in made:
            if o.type == 'LIGHT':
                _remove([o])
            else:
                bpy.data.objects.remove(o, do_unlink=True)
    gap = 8
    w = res[0] * 3 + gap * 2
    canvas = np.ones((res[1], w, 4), dtype=np.float32)
    canvas[..., :3] = 0.08
    for k, png in enumerate(pngs):
        im = bpy.data.images.load(png)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]
        x = k * (res[0] + gap)
        canvas[:, x:x + res[0]] = px
        bpy.data.images.remove(im)
        os.remove(png)
    os.rmdir(tmp)
    img = bpy.data.images.new('Scenes', w, res[1], alpha=False)
    img.pixels = canvas[::-1].ravel()
    img.filepath_raw = path
    img.file_format = 'WEBP'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save()
    bpy.data.images.remove(img)
    return hero.source


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
    return opts


def export_glb(objects, path):
    """style.export_glb's settings with the objects in contract order."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_materials='EXPORT', export_extras=False,
                              export_cameras=False, export_lights=False, export_animations=False,
                              export_texcoords=False, export_normals=True)
    return os.path.getsize(path)


def main():
    opts = parse_args()
    ids = NODES
    partial = False
    if opts['only']:
        ids = [n for n in NODES if n in set(opts['only'].split(','))]
        unknown = set(opts['only'].split(',')) - set(NODES)
        if unknown:
            raise SystemExit(f'unknown ids {sorted(unknown)}; known: {NODES}')
        partial = ids != NODES
    reset_scene()
    objs = build(ids)
    stats = {n: node_stats(n, objs[n]) for n in ids}
    report(stats)
    failures = []
    for n, s in stats.items():
        failures += [f'{n}: {e}' for e in check(n, s)]
    for n in NODES:
        if n not in objs and not partial:
            failures.append(f'{n}: missing')

    if not partial:
        path = os.path.join(MODELS, GLB)
        size = export_glb([objs[n] for n in NODES], path)
        print(f'  {GLB} {size} bytes')
        if size > GLB_LIMIT:
            failures.append(f'{GLB} is {size} bytes (> {GLB_LIMIT})')
        errors, _ = check_glb(path, NODES)
        failures += errors
        used = sorted({mn for s in stats.values() for mn in s['materials']})
        manifest = dict(
            generator='art/blender/kit/build_worlds_harsh.py',
            blender=bpy.app.version_string,
            file=GLB,
            bytes=size,
            coordinates=('Blender Z up, front -Y (glTF Y up, front +Z); metres; every node at the file origin '
                         'with its own origin at its ground centre'),
            planets={pl: [n for n in NODES if CONTRACT[n]['planet'] == pl] for pl in ('ice', 'lava', 'shadow')},
            ground_colours=GROUND,
            materials={mn: material_info(bpy.data.materials[mn]) for mn in used},
            emissive={mn: EMISSIVE[mn] for mn in used if mn in EMISSIVE},
            nodes=stats,
        )
        os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
        with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(manifest, fh, indent=2)
            fh.write('\n')

    if opts['render']:
        sheet = (os.path.join(tempfile.gettempdir(), 'worlds-harsh-only.webp') if partial
                 else os.path.join(PREVIEWS, 'worlds-harsh.webp'))
        contact_sheet(objs, stats, sheet)
        print('  sheet', sheet)
        if not partial:
            render_scenes(objs, os.path.join(PREVIEWS, 'worlds-harsh-scenes.webp'))

    if failures:
        raise RuntimeError('Harsh worlds contract failures:\n  ' + '\n  '.join(failures))
    if opts['install'] and not partial:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        shutil.copy2(os.path.join(MODELS, GLB), os.path.join(PUBLIC_MODELS, GLB))
        print('installed', GLB)
    print('\nHarsh worlds kit OK')


if __name__ == '__main__':
    try:
        main()
    except BaseException as exc:  # Blender keeps exit code 0 on Python errors in -b --python; force failure.
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
