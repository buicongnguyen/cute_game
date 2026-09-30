"""Zoo Garden explorer: the hero figure, ten disguise costumes and their icons.

The hero is a glossy chibi toy: a big round head with a brown fringe, big glossy eyes with
highlights, pink cheeks and a small smile, a shirt in the player's colour, cream shorts, a tan
backpack and a leaf sprout on top. It is split into the animated parts of `hero_spec.py`; every
part's origin is its pivot, so the game can swing arms and legs and turn the head. The disguises
are costumes worn over the hero, each piece tagged with the hero part it follows. See CONTRACT.md
("Explorer and gear").

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_hero.py -- \
        [--only hero|disguises|icons] [--install] [--render]

Outputs:
    art/generated/kit/models/hero.glb, disguises.glb
    art/generated/kit/icons/items/<disguise id>.webp, hero.webp   (160 x 160, transparent)
    art/generated/kit/hero-manifest.json
    art/previews/kit/hero.webp, disguises.webp, disguises-icons.webp   (--render)
--install copies the GLBs to public/assets/models/ and the icons to public/assets/icons/items/.

Blender is Z up with the explorer facing -Y; glTF exports are Y up facing +Z. Output is
deterministic: triangulated and sorted faces, no randomness.
"""
import bpy
import bmesh
import json
import math
import os
import shutil
import struct
import sys
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
import hero_spec as HS  # noqa: E402
from style import export_glb, mat, reset_scene, studio  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
ICONS = os.path.join(GEN, 'icons', 'items')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'hero-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')

PARTS = ('body', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right')
TAGS = PARTS + ('hand-right',)
DISGUISES = [('dz_ninja', 'Shadow ninja'), ('dz_mage', 'Archmage'), ('dz_knight', 'Sun knight'),
             ('dz_mecha', 'Battle robot'), ('dz_dino', 'Tyrannosaur'), ('dz_fairy', 'Flower fairy'),
             ('dz_pirate', 'Pirate captain'), ('dz_superhero', 'Superhero'), ('dz_vampire', 'Vampire count'),
             ('dz_snowman', 'Snowman')]
DISGUISE_IDS = [d for d, _ in DISGUISES]
HERO_MATERIALS = ['Hero skin', 'Hero hair', 'Hero shirt', 'Hero shirt shade', 'Hero pants', 'Hero shoe', 'Hero eye',
                  'Hero blush', 'Hero bag', 'Hero leaf']
HERO_TRI_LIMIT, HERO_GLB_LIMIT = 3500, 200 * 1024
DZ_TRI_LIMIT, DZ_GLB_LIMIT = 2500, 600 * 1024
ICON_LIMIT = 8 * 1024
PIVOT_TOL, ENVELOPE_TOL = 0.001, 0.02
SHIRT = '#4AA8FF'           # COLORS[0] in src/model.ts; the game recolours 'Hero shirt'
PLAYER_COLORS = ['#4AA8FF', '#FF7AB0', '#6FD35A', '#FFB13D', '#A07BFF', '#FF5A5A']
ARM_SPLAY = 0.3             # the game splays the arms outward this much at rest
LEAF_ORIGIN = Vector((0.0, 0.02, 2.17))

TAU = math.tau
RAD = math.radians
C = Vector(HS.HEAD_CENTRE)
HR = HS.HEAD_RADIUS
T = HS.TORSO
UP = Vector((0, 0, 1))


# ================================================================ geometry
class Geo:
    """Plain vertex/face lists; each face carries a tag (a material, or None for the default)."""

    def __init__(self, verts=(), faces=(), tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [None] * len(self.faces)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

    def moved(self, o):
        o = Vector(o)
        return Geo([v + o for v in self.verts], self.faces, self.tags)

    def retag(self, tag):
        self.tags = [tag] * len(self.faces)
        return self

    def flip(self):
        self.faces = [tuple(reversed(f)) for f in self.faces]
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def weld(self, digits=6):
        index, remap, verts = {}, [], []
        for v in self.verts:
            key = (round(v.x, digits), round(v.y, digits), round(v.z, digits))
            if key not in index:
                index[key] = len(verts)
                verts.append(v)
            remap.append(index[key])
        faces, tags = [], []
        for f, t in zip(self.faces, self.tags):
            g = []
            for i in f:
                j = remap[i]
                if not g or g[-1] != j:
                    g.append(j)
            if len(g) > 1 and g[0] == g[-1]:
                g.pop()
            if len(g) >= 3 and len(set(g)) == len(g):
                faces.append(tuple(g))
                tags.append(t)
        self.verts, self.faces, self.tags = verts, faces, tags
        return self

    def face_normal(self, f):
        n = Vector()
        for k in range(len(f)):
            a, b = self.verts[f[k]], self.verts[f[(k + 1) % len(f)]]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        return n

    def centre(self, f):
        return sum((self.verts[i] for i in f), Vector()) / len(f)

    def orient(self, outward):
        """Open shells: flip every face when most of the area faces against outward(point)."""
        score = sum(self.face_normal(f).dot(outward(self.centre(f))) for f in self.faces)
        if score < 0:
            self.flip()
        return self

    def signed_volume(self):
        vol = 0.0
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                vol += a.dot(self.verts[f[i]].cross(self.verts[f[i + 1]]))
        return vol / 6.0

    def closed(self):
        if self.signed_volume() < 0:
            self.flip()
        return self

    def boundary(self):
        edges = {}
        for fi, f in enumerate(self.faces):
            for k in range(len(f)):
                edges[(f[k], f[(k + 1) % len(f)])] = fi
        return [(a, b, self.tags[fi]) for (a, b), fi in sorted(edges.items()) if (b, a) not in edges]

    def lip(self, fn, tag='keep'):
        """Add a ring of quads along every open edge, the new ring at fn(vertex). Gives shells a thick,
        rounded rim; apply twice for a rolled edge."""
        new = {}
        for a, b, t in self.boundary():
            for v in (a, b):
                if v not in new:
                    new[v] = len(self.verts)
                    self.verts.append(Vector(fn(self.verts[v])))
            self.faces.append((b, a, new[a], new[b]))
            self.tags.append(t if tag == 'keep' else tag)
        return self

    def normals(self):
        acc = [Vector() for _ in self.verts]
        for f in self.faces:
            n = self.face_normal(f)
            for i in f:
                acc[i] += n
        return [n.normalized() if n.length > 1e-12 else Vector((0, 0, 1)) for n in acc]

    def solidify(self, thickness, inner_tag='keep', rim_tag='keep'):
        """Thicken an open sheet inward (against its normals) and close the rims."""
        normals = self.normals()
        count = len(self.verts)
        rims = self.boundary()
        self.verts += [v - n * thickness for v, n in zip(self.verts[:count], normals)]
        faces, tags = list(self.faces), list(self.tags)
        for f, t in zip(faces, tags):
            self.faces.append(tuple(i + count for i in reversed(f)))
            self.tags.append(t if inner_tag == 'keep' else inner_tag)
        for a, b, t in rims:
            self.faces.append((b, a, a + count, b + count))
            self.tags.append(t if rim_tag == 'keep' else rim_tag)
        return self


def join(*geos):
    out = Geo()
    for g in geos:
        base = len(out.verts)
        out.verts += g.verts
        out.faces += [tuple(i + base for i in f) for f in g.faces]
        out.tags += g.tags
    return out


class Piece:
    """Accumulates geometry (with materials) into one named mesh object."""

    def __init__(self, name, sharp=125):
        self.name = name
        self.sharp = sharp
        self.verts, self.faces, self.mats, self.materials = [], [], [], []

    def add(self, geo, material=None):
        base = len(self.verts)
        self.verts += geo.verts
        for f, t in zip(geo.faces, geo.tags):
            m = t if t is not None else material
            if m is None:
                raise ValueError(f'{self.name}: face without material')
            if m not in self.materials:
                self.materials.append(m)
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.materials.index(m))
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, origin=(0, 0, 0), name=None):
        name = name or self.name
        o = Vector(origin)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v - o) for v in self.verts], [], self.faces)
        for m in self.materials:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.mats)
        me.polygons.foreach_set('use_smooth', [True] * len(self.faces))
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        limit = RAD(self.sharp)
        for edge in bm.edges:
            if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > limit:
                edge.smooth = False
        bm.to_mesh(me)
        bm.free()
        me.validate()
        obj = bpy.data.objects.new(name, me)
        obj.location = o
        bpy.context.scene.collection.objects.link(obj)
        return triangulate(obj)


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


# ------------------------------------------------------------- transforms
def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list, Vector)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(s))


def frame_m(loc, ydir, zdir):
    """Local +Y along ydir, local +Z as close to zdir as possible."""
    y = Vector(ydir).normalized()
    z = Vector(zdir)
    z = z - y * z.dot(y)
    z = z.normalized() if z.length > 1e-6 else Vector((1, 0, 0)).cross(y).normalized()
    x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
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


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def smax(a, b, k):
    return 0.5 * (a + b + math.sqrt((a - b) ** 2 + k * k))


# -------------------------------------------------------------- primitives
def axis_grid(phis, zs, radius, axis=(0.0, 0.0), wrap=True, keep=None, tag=None):
    """Columns at angles phis (0 = front -Y, 90 deg = +X) and rows at heights zs.
    radius(phi, z, i, j) is the distance from the vertical axis. Rows with radius 0 weld into poles."""
    ax, ay = axis
    n, m = len(phis), len(zs)
    verts = []
    for i, phi in enumerate(phis):
        for j, z in enumerate(zs):
            r = radius(phi, z, i, j)
            verts.append((ax + r * math.sin(phi), ay - r * math.cos(phi), z))
    faces, tags = [], []
    for i in range(n if wrap else n - 1):
        k = (i + 1) % n
        for j in range(m - 1):
            if keep is not None and not keep(i, j):
                continue
            faces.append((i * m + j, k * m + j, k * m + j + 1, i * m + j + 1))
            tags.append(tag(i, j) if callable(tag) else tag)
    g = Geo(verts, faces, tags).weld()
    return g.orient(lambda p: Vector((p.x - ax, p.y - ay, 0.0)))


def ring_phis(segs, phase=0.5):
    """Column angles; with phase 0.5 a face column is centred on the front."""
    return [TAU * (i + phase) / segs for i in range(segs)]


def lathe(profile, segs=16, axis=(0.0, 0.0), tag=None, phase=0.5):
    """Revolve [(r, z), ...] (bottom to top) around a vertical axis. tag(band) labels faces."""
    zs = [p[1] for p in profile]
    return axis_grid(ring_phis(segs, phase), zs, lambda phi, z, i, j: profile[j][0], axis,
                     tag=(lambda i, j: tag(j)) if callable(tag) else tag)


def ellipsoid(centre, radii, segs=12, rings=8, tag=None, m=None):
    prof = [(math.sin(math.pi * k / rings), -math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof[0], prof[-1] = (0.0, -1.0), (0.0, 1.0)
    g = lathe(prof, segs, tag=tag).transformed(Matrix.Diagonal(Vector(radii)).to_4x4())
    g = g.transformed(m) if m is not None else g.moved(centre)
    return g.closed()


def pole_grid(F, U, R, psis, gamma, radius, rows, centre=C, tag=None):
    """Rings around direction F: column i at angle psis[i] around F (0 = U, 90 deg = R), row j at
    angle gamma(i, j) from F, at distance radius(i, j, direction) from centre."""
    verts = []
    n = len(psis)
    for i, psi in enumerate(psis):
        side = U * math.cos(psi) + R * math.sin(psi)
        for j in range(rows + 1):
            g = gamma(i, j)
            d = (F * math.cos(g) + side * math.sin(g)).normalized()
            verts.append(centre + d * radius(i, j, d))
    faces, tags = [], []
    for i in range(n):
        k = (i + 1) % n
        for j in range(rows):
            faces.append((i * (rows + 1) + j, k * (rows + 1) + j, k * (rows + 1) + j + 1, i * (rows + 1) + j + 1))
            tags.append(tag(i, j) if callable(tag) else tag)
    g = Geo(verts, faces, tags).weld()
    return g.orient(lambda p: p - centre)


def head_frame(point):
    """(F, U, R) at a point of the head: F out of the head, U up the face, R toward +X."""
    F = (Vector(point) - C).normalized()
    U = (UP - F * UP.dot(F)).normalized()
    return F, U, U.cross(F)


def superellipse(a, b, n=2.0):
    """Window outline in angles (degrees): half width a, half height b."""
    a, b = RAD(a), RAD(b)
    return lambda psi: (abs(math.sin(psi) / a) ** n + abs(math.cos(psi) / b) ** n) ** (-1.0 / n)


def decal(point, half_w, half_h, r_edge, dome, segs=12, rows=2, tuck=0.586, tag=None, surface=None):
    """An oval sticker on the head: point on the skin, half sizes in metres, domed in the middle."""
    F, U, R = head_frame(point)
    alpha = superellipse(math.degrees(half_w / HR), math.degrees(half_h / HR), 2.0)
    psis = [TAU * (i + 0.5) / segs for i in range(segs)]

    def radius(i, j, d):
        s = j / rows
        base = surface(d) if surface else r_edge
        return base + dome * (1 - s * s)
    g = pole_grid(F, U, R, psis, lambda i, j: alpha(psis[i]) * j / rows, radius, rows, tag=tag)
    return g.lip(lambda p: C + (p - C).normalized() * tuck)


def tube(path, radius, sides=6, flatten=1.0, ang0=0.0, cap_start=False, cap_end=False, up=None):
    """Sweep a (possibly flattened) circle along a polyline; radius may be a list, 0 makes a point."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * n
    tangents = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Vector(up) if up is not None else (UP if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0)))
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
            verts.append(pts[i] + nv * math.cos(a) * r * flatten + bv * math.sin(a) * r)
        rings.append(ring)
    faces = []
    for lo, hi in zip(rings, rings[1:]):
        for s in range(sides):
            if len(lo) == 1:
                faces.append((lo[0], hi[(s + 1) % sides], hi[s]))
            elif len(hi) == 1:
                faces.append((lo[s], lo[(s + 1) % sides], hi[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % sides], hi[(s + 1) % sides], hi[s]))
    if cap_start and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
    if cap_end and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
    g = Geo(verts, faces)
    closed = (cap_start or len(rings[0]) == 1) and (cap_end or len(rings[-1]) == 1)
    return g.closed() if closed else g


def torus(centre, normal, major, minor, segs=20, sides=6, tag=None, flatten=1.0):
    m = facing(centre, normal)
    verts, faces = [], []
    for i in range(segs):
        a = TAU * i / segs
        for j in range(sides):
            b = TAU * j / sides
            r = major + minor * math.cos(b)
            verts.append(m @ Vector((r * math.cos(a), r * math.sin(a), minor * flatten * math.sin(b))))
    for i in range(segs):
        k = (i + 1) % segs
        for j in range(sides):
            faces.append((i * sides + j, k * sides + j, k * sides + (j + 1) % sides, i * sides + (j + 1) % sides))
    return Geo(verts, faces, [tag] * len(faces)).closed()


def rbox(size, radius, k=1, m=None, loc=None):
    """Rounded box centred at the origin (then transformed): k segments per corner arc."""
    h = [s / 2 for s in size]
    radius = min(radius, min(h) * 0.98)
    inner = [x - radius for x in h]

    def coords(ax):
        arc = [inner[ax] + (h[ax] - inner[ax]) * a / k for a in range(k + 1)]
        return [-a for a in reversed(arc)] + arc
    index, verts, faces = {}, [], []

    def vid(q):
        key = tuple(round(c, 6) for c in q)
        if key not in index:
            clamp = Vector([max(-inner[a], min(inner[a], q[a])) for a in range(3)])
            d = Vector(q) - clamp
            index[key] = len(verts)
            verts.append(clamp + (d.normalized() * radius if d.length > 1e-9 else d))
        return index[key]
    for a, b, c in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
        cb, cc = coords(b), coords(c)
        for sign in (1, -1):
            for i in range(len(cb) - 1):
                for j in range(len(cc) - 1):
                    quad = []
                    for (ii, jj) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        q = [0.0, 0.0, 0.0]
                        q[a], q[b], q[c] = sign * h[a], cb[ii], cc[jj]
                        quad.append(vid(q))
                    faces.append(tuple(quad) if sign > 0 else tuple(reversed(quad)))
    g = Geo(verts, faces).weld()
    if m is not None:
        g = g.transformed(m)
    elif loc is not None:
        g = g.moved(loc)
    return g.closed()


def cone(base, direction, length, radius, sides=5):
    prof = [(0.0, -0.002), (radius, 0.0), (0.0, length)]
    return lathe(prof, sides, phase=0.0).transformed(facing(base, direction)).closed()


def leaf_solid(length, width, thick=0.014, rows=5, cup=0.25, bend=0.12, inner=0.5, tags=(None, None),
               shape=0.75, taper=0.2):
    """A cupped, slightly bent leaf/petal/wing along local +Y, flat side facing local +Z.
    tags = (rim tag, middle tag) for two-tone wings; inner is where the middle band starts."""
    ring = [(-1.0, 0.0), (-inner, 1.0), (inner, 1.0), (1.0, 0.0), (inner, -1.0), (-inner, -1.0)]
    verts, rings = [], []
    for k in range(rows + 1):
        t = k / rows
        w = width / 2 * math.sin(math.pi * min(1.0, t)) ** shape * (1 - taper * t)
        th = thick / 2 * math.sin(math.pi * t) ** 0.5
        y = t * length
        zc = bend * length * t * t
        if w < 1e-5:
            rings.append([len(verts)])
            verts.append((0.0, y, zc))
            continue
        idx = []
        for u, s in ring:
            idx.append(len(verts))
            verts.append((u * w, y, zc + cup * w * u * u + s * th))
        rings.append(idx)
    faces, ftags = [], []
    n = len(ring)
    for lo, hi in zip(rings, rings[1:]):
        for s in range(n):
            tg = tags[0] if s in (0, 2, 3, 5) else tags[1]
            if len(lo) == 1:
                faces.append((lo[0], hi[(s + 1) % n], hi[s]))
            elif len(hi) == 1:
                faces.append((lo[s], lo[(s + 1) % n], hi[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % n], hi[(s + 1) % n], hi[s]))
            ftags.append(tg)
    return Geo(verts, faces, ftags).weld().closed()


def star_solid(points=5, r_out=0.1, r_in=0.045, thick=0.025, dome=0.01):
    """A puffy star in local XY, facing local +Z."""
    outline = []
    for i in range(points * 2):
        a = math.pi / 2 + math.pi * i / points
        r = r_out if i % 2 == 0 else r_in
        outline.append((r * math.cos(a), r * math.sin(a)))
    n = len(outline)
    verts = [(x, y, thick / 2) for x, y in outline] + [(x, y, -thick / 2) for x, y in outline]
    verts += [(0, 0, thick / 2 + dome), (0, 0, -thick / 2)]
    top, bot = 2 * n, 2 * n + 1
    faces = [(top, i, (i + 1) % n) for i in range(n)] + [(bot, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    return Geo(verts, faces).closed()


# ================================================================ materials
def FM(name, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
    """style.mat, single sided (every part is closed or tucked into the body)."""
    m = mat(name, color, rough, metal, emit, strength)
    m.use_backface_culling = True
    return m


def shade_of(hex_color, k=0.72):
    v = hex_color.lstrip('#')
    r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
    return '#%02X%02X%02X' % (int(r * k), int(g * k), int(b * k))

def hero_materials(shirt=SHIRT, suffix=''):
    return dict(
        skin=FM('Hero skin', '#FFD3AE', 0.5),
        hair=FM('Hero hair', '#7C4527', 0.36),
        shirt=FM('Hero shirt' + suffix, shirt, 0.45),
        shade=FM('Hero shirt shade' + suffix, shade_of(shirt), 0.45),
        pants=FM('Hero pants', '#FFF1D8', 0.5),
        shoe=FM('Hero shoe', '#9A4E2A', 0.4),
        eye=FM('Hero eye', '#2A1C26', 0.12),
        blush=FM('Hero blush', '#FF8FA6', 0.55),
        bag=FM('Hero bag', '#E0A55C', 0.45),
        leaf=FM('Hero leaf', '#5ACB38', 0.4),
    )


# =================================================================== hero
# Hair edge: (phi from the front toward +X, theta from the crown, lock tip?) in degrees. Tips hang
# lower and puff out, making a zig-zag fringe over the forehead, side locks and a rounded nape.
HAIR_EDGE = [
    (-180, 128, 0), (-162, 126, 1), (-144, 123, 0), (-126, 120, 1), (-110, 113, 0), (-96, 108, 1), (-84, 101, 0),
    (-73, 110, 1), (-63, 100, 0), (-55, 106, 1), (-47, 91, 0), (-40, 81, 1), (-33, 70, 0), (-26, 75, 1),
    (-18, 67, 0), (-10, 74, 1), (-2, 65, 0), (6, 73, 1), (14, 66, 0), (22, 74, 1), (30, 69, 0), (38, 79, 1),
    (46, 90, 0), (54, 106, 1), (63, 100, 0), (73, 110, 1), (84, 101, 0), (96, 108, 1), (110, 113, 0),
    (126, 120, 1), (144, 123, 0), (162, 126, 1)]
EYE = dict(x=0.21, z=1.585, w=0.082, h=0.1)
BLUSH = dict(x=0.35, z=1.445, w=0.078, h=0.044)


def hair_geo(edge=HAIR_EDGE, rows=6, r_notch=0.598, r_tip=0.619, r_crown=0.61, lip=(0.597, 0.572),
             drop=2.0, rise=2.5):
    """A hair cap from the crown down to a lock-tipped edge, with a thick rounded rim tucked into the head."""
    F, U, R = UP, Vector((0, -1, 0)), Vector((1, 0, 0))
    psis = [RAD(p) for p, _, _ in edge]
    edges = [RAD(t) for _, t, _ in edge]

    def radius(i, j, d):
        ridge = r_tip if edge[i][2] else r_notch
        return r_crown + (ridge - r_crown) * smoothstep(0.0, 0.55, j / rows)
    g = pole_grid(F, U, R, psis, lambda i, j: edges[i] * j / rows, radius, rows)

    def ring(p, r, dtheta):
        d = (p - C).normalized()
        theta = math.acos(max(-1.0, min(1.0, d.z)))
        horiz = Vector((d.x, d.y, 0)).normalized()
        t2 = theta + RAD(dtheta)
        return C + (horiz * math.sin(t2) + UP * math.cos(t2)) * r
    g.lip(lambda p: ring(p, lip[0], drop))
    g.lip(lambda p: ring(p, lip[1], -rise - drop))
    return g


def eye_frame(side):
    x, z = EYE['x'] * side, EYE['z']
    return Vector((x, -math.sqrt(HR * HR - x * x - (z - C.z) ** 2), z))


def eye_surface(side):
    """Radius of the eye dome in a head direction, so highlights ride on it."""
    F, U, R = head_frame(eye_frame(side))
    a, b = EYE['w'] / HR, EYE['h'] / HR

    def r(d):
        g = math.acos(max(-1.0, min(1.0, d.dot(F))))
        psi = math.atan2(d.dot(R), d.dot(U))
        alpha = (abs(math.sin(psi) / a) ** 2 + abs(math.cos(psi) / b) ** 2) ** -0.5
        s = min(1.0, g / alpha)
        return 0.5935 + 0.0125 * (1 - s * s)
    return r


def eye_geo(side, M):
    p = eye_frame(side)
    g = decal(p, EYE['w'], EYE['h'], 0.5935, 0.0125, segs=14, rows=2, tag=M['eye'])
    F, U, R = head_frame(p)
    surf = eye_surface(side)
    shine = []
    for du, dv, rad, segs in ((0.036, 0.046, 0.03, 10), (-0.03, -0.052, 0.014, 7)):
        d = (F + R * (du / HR) + U * (dv / HR)).normalized()
        shine.append(decal(C + d * HR, rad, rad, 0.0, 0.0012, segs=segs, rows=1, tuck=0.598, tag=M['pants'],
                           surface=lambda dd: surf(dd) + 0.0022))
    return join(g, *shine)


def blush_geo(side, M):
    x, z = BLUSH['x'] * side, BLUSH['z']
    y = -math.sqrt(HR * HR - x * x - (z - C.z) ** 2)
    return decal((x, y, z), BLUSH['w'], BLUSH['h'], 0.5925, 0.004, segs=10, rows=1, tag=M['blush'])


def smile_geo(M):
    z = 1.463
    F, U, R = head_frame((0, -math.sqrt(HR * HR - (z - C.z) ** 2), z))
    pts = []
    for k in range(7):
        u = -0.055 + 0.11 * k / 6
        v = -0.026 * (1 - (u / 0.055) ** 2)
        pts.append(C + (F + R * (u / HR) + U * (v / HR)).normalized() * 0.5925)
    return tube(pts, [0.0, 0.0095, 0.0115, 0.012, 0.0115, 0.0095, 0.0], sides=5).retag(M['eye'])


def sprout_geo(M):
    stem = tube([(0, 0.02, 2.165), (0, 0.024, 2.215), (0.0, 0.03, 2.258)], [0.021, 0.018, 0.015], sides=6,
                cap_start=True, cap_end=True)
    left = leaf_solid(0.17, 0.105, 0.016, rows=5, cup=0.35, bend=0.18)
    right = leaf_solid(0.145, 0.09, 0.015, rows=5, cup=0.35, bend=0.18)
    base = Vector((0, 0.03, 2.25))
    lm = frame_m(base + Vector((-0.004, 0, 0)), (-0.86, -0.08, 0.42), (-0.3, 0.1, 1.0))
    rm = frame_m(base + Vector((0.004, 0, 0.004)), (0.84, 0.18, 0.46), (0.35, 0.05, 1.0))
    return join(stem, left.transformed(lm), right.transformed(rm)).retag(M['leaf'])


TORSO_PROFILE = [  # (r, z, material of the band above this ring)
    (0.0, 0.508, 'pants'), (0.33, 0.512, 'pants'), (0.405, 0.535, 'pants'), (0.411, 0.58, 'pants'),
    (0.405, 0.611, 'shade'), (0.418, 0.622, 'shade'), (0.416, 0.664, 'shade'), (0.398, 0.678, 'shirt'),
    (0.376, 0.80, 'shirt'), (0.35, 0.96, 'shirt'), (0.325, 1.10, 'shirt'), (0.285, 1.16, 'shirt'),
    (0.0, 1.196, 'shirt')]


def torso_r(z):
    prof = TORSO_PROFILE
    for (r0, z0, _), (r1, z1, _) in zip(prof, prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return 0.0


def env_r(z):
    t = (z - T['bottom_z']) / (T['top_z'] - T['bottom_z'])
    return T['bottom_radius'] + (T['top_radius'] - T['bottom_radius']) * t


def strap_geo(side, M):
    """A backpack strap down the chest, following the torso surface (a band, not a flat plank)."""
    zs = [0.735, 0.81, 0.89, 0.97, 1.05, 1.12]
    mid = math.asin(0.19 / torso_r(0.9))
    half = 0.031 / torso_r(0.9)
    phis = [side * (mid + half * u) for u in (-1, 0, 1)]
    g = axis_grid(phis, zs, lambda phi, z, i, j: torso_r(z) + 0.011, wrap=False)
    return g.lip(lambda p: p - Vector((p.x, p.y, 0)).normalized() * 0.022).retag(M['bag'])


def pack_geo(M):
    pouch = rbox((0.38, 0.18, 0.42), 0.07, k=1, loc=(0.0, 0.33, 0.895)).retag(M['bag'])
    flap = rbox((0.36, 0.05, 0.26), 0.022, k=1, loc=(0, 0.42, 0.98)).retag(M['bag'])
    pocket = rbox((0.25, 0.045, 0.13), 0.02, k=1, loc=(0, 0.422, 0.765)).retag(M['bag'])
    patch = ellipsoid((0, 0.444, 0.975), (0.068, 0.012, 0.068), segs=10, rings=4).retag(M['pants'])
    leaf = leaf_solid(0.085, 0.052, 0.008, rows=4, cup=0.06, bend=0.02).retag(M['leaf'])
    leaf = leaf.transformed(frame_m((-0.028, 0.454, 0.945), (0.55, 0, 0.85), (0, 1, 0)))
    return join(pouch, flap, pocket, patch, leaf)


def arm_geo(side, M):
    ax, ay = 0.37 * side, 0.02
    prof = [(0.0, 0.793, 'shade'), (0.1, 0.797, 'shade'), (0.118, 0.825, 'shade'), (0.114, 0.852, 'shade'),
            (0.104, 0.862, 'shirt'), (0.11, 0.93, 'shirt'), (0.121, 1.07, 'shirt'), (0.116, 1.15, 'shirt'),
            (0.085, 1.186, 'shirt'), (0.0, 1.196, 'shirt')]
    sleeve = lathe([(r, z) for r, z, _ in prof], 10, axis=(ax, ay), tag=lambda j: M[prof[j][2]])
    hand = ellipsoid((ax, -0.035, 0.728), (0.112, 0.116, 0.12), segs=10, rings=6).retag(M['skin'])
    thumb = ellipsoid((ax - 0.072 * side, -0.098, 0.752), (0.042, 0.046, 0.05), segs=6, rings=4).retag(M['skin'])
    return join(sleeve, hand, thumb)


SHOE_PROFILE = [(0.0, 0.0), (0.075, 0.0), (0.112, 0.022), (0.128, 0.065), (0.126, 0.13), (0.108, 0.195),
                (0.072, 0.24), (0.0, 0.258)]


SHOE_Y, SHOE_STRETCH = -0.08, 1.15


def leg_geo(side, M):
    lx = 0.18 * side
    cuff = lathe([(0.0, 0.418), (0.108, 0.422), (0.117, 0.45), (0.117, 0.53), (0.095, 0.558), (0.0, 0.565)], 10,
                 axis=(lx, 0.0)).retag(M['pants'])
    leg = lathe([(0.0, 0.232), (0.083, 0.24), (0.08, 0.38), (0.0, 0.43)], 10, axis=(lx, 0.0)).retag(M['skin'])
    shoe = lathe(SHOE_PROFILE, 10, tag=lambda j: M['pants'] if j == 0 else M['shoe'])
    shoe = shoe.transformed(Matrix.Translation((lx, SHOE_Y, 0)) @ Matrix.Diagonal((1.0, SHOE_STRETCH, 1.0, 1.0)))
    return join(cuff, leg, shoe)


def hero_pieces(M):
    P = {name: Piece(name) for name in PARTS}
    P['head-leaf'] = Piece('head-leaf')
    head = P['head']
    head.add(ellipsoid(C, (HR, HR, HR), segs=18, rings=11), M['skin'])
    head.add(hair_geo(), M['hair'])
    for side in (-1, 1):
        head.add(eye_geo(side, M))
        head.add(blush_geo(side, M))
    head.add(smile_geo(M))
    P['head-leaf'].add(sprout_geo(M))
    prof = TORSO_PROFILE
    P['body'].add(lathe([(r, z) for r, z, _ in prof], 18, tag=lambda j: M[prof[j][2]]))
    for side in (-1, 1):
        P['body'].add(strap_geo(side, M))
    P['body'].add(pack_geo(M))
    P['arm-left'].add(arm_geo(-1, M))
    P['arm-right'].add(arm_geo(1, M))
    P['leg-left'].add(leg_geo(-1, M))
    P['leg-right'].add(leg_geo(1, M))
    return P


def make_hero(M, prefix=''):
    """Build the hero hierarchy. Returns {name: object}; 'hero' is the root empty."""
    pieces = hero_pieces(M)
    scene = bpy.context.scene
    root = bpy.data.objects.new(prefix + 'hero', None)
    root.empty_display_size = 0.3
    scene.collection.objects.link(root)
    objs = {'hero': root}
    for name in PARTS:
        pivot = Vector(HS.PIVOTS[name])
        o = pieces[name].build(pivot, prefix + name)
        o.data.name = o.name
        o.parent = root
        o.location = pivot
        objs[name] = o
    leaf = pieces['head-leaf'].build(LEAF_ORIGIN, prefix + 'head-leaf')
    leaf.data.name = leaf.name
    leaf.parent = objs['head']
    leaf.location = LEAF_ORIGIN - Vector(HS.PIVOTS['head'])
    objs['head-leaf'] = leaf
    for hand, arm in (('hand-left', 'arm-left'), ('hand-right', 'arm-right')):
        e = bpy.data.objects.new(prefix + hand, None)
        e.empty_display_size = 0.08
        scene.collection.objects.link(e)
        e.parent = objs[arm]
        e.location = Vector(HS.HANDS[hand]) - Vector(HS.PIVOTS[arm])
        objs[hand] = e
    bpy.context.view_layer.update()
    return objs

# ============================================================== disguises
class Costume:
    """One disguise: named pieces, each tagged with the hero part it follows."""

    def __init__(self, did, short, hides_leaf=True):
        self.id = did
        self.short = short
        self.hides_leaf = hides_leaf
        self.pieces = {}

    def m(self, part, color, rough=0.45, metal=0.0, emit=None, strength=0.0):
        return FM(f'Disguise {self.short} {part}', color, rough, metal, emit, strength)

    def add(self, piece, tag, geo, material=None, sharp=125):
        name = f'{self.id}_{piece}@{tag}'
        if name not in self.pieces:
            self.pieces[name] = Piece(name, sharp)
        self.pieces[name].add(geo, material)
        return self


def tilted(tilt):
    """Front frame looking `tilt` degrees below the horizon (negative looks up)."""
    t = RAD(tilt)
    return Vector((0, -math.cos(t), -math.sin(t))), Vector((0, -math.sin(t), math.cos(t))), Vector((1, 0, 0))


def on_head(direction, r):
    return C + Vector(direction).normalized() * r


def hood(r, window, cols=24, rows=7, power=1.15, r_fn=None, lip_in=0.636, trim=None, trim_raise=0.014):
    """A shell around the head with a front window: window = (half width, half height, tilt, exponent)."""
    a, b, tilt, n = window
    F, U, R = tilted(tilt)
    alpha = superellipse(a, b, n)
    psis = [TAU * i / cols for i in range(cols)]
    g = pole_grid(F, U, R, psis, lambda i, j: alpha(psis[i]) + (math.pi - alpha(psis[i])) * (j / rows) ** power,
                  lambda i, j, d: r_fn(d) if r_fn else r, rows)
    if trim is not None:   # a rolled edge in the trim material
        g.lip(lambda p: C + ((p - C).normalized() + F * 0.045).normalized() * ((p - C).length + trim_raise), tag=trim)
        g.lip(lambda p: C + (p - C).normalized() * lip_in, tag=trim)
    else:
        g.lip(lambda p: C + (p - C).normalized() * lip_in)
    return g


def front_patch(r_fn, window, cols=20, rows=3, lift=0.0, dome=0.0, tuck=0.02):
    """A raised patch on a head shell (visors, eyes): window = (a, b, tilt, exponent[, yaw])."""
    a, b, tilt, n = window[:4]
    rot = Matrix.Rotation(RAD(window[4]) if len(window) > 4 else 0.0, 3, 'Z')
    F, U, R = (rot @ v for v in tilted(tilt))
    alpha = superellipse(a, b, n)
    psis = [TAU * (i + 0.5) / cols for i in range(cols)]
    g = pole_grid(F, U, R, psis, lambda i, j: alpha(psis[i]) * j / rows,
                  lambda i, j, d: r_fn(d) + lift + dome * (1 - (j / rows) ** 2), rows)
    return g.lip(lambda p: C + (p - C).normalized() * ((p - C).length - lift - tuck))


def shell_torso(clear=0.035, bottom=0.5, top=1.21, rows=7, segs=20, radius=None, keep=None, tag=None, hem=0.05,
                neck=0.24, lip_tag='keep'):
    """A costume layer around the torso envelope; radius(phi, z) overrides env + clear.
    tag(phi of the face centre, z of the band bottom) picks per-face materials."""
    zs = [bottom + (top - 0.07 - bottom) * k / (rows - 1) for k in range(rows)] + [top]
    phis = ring_phis(segs)
    mids = [p + TAU / (2 * segs) for p in phis]

    def r(phi, z, i, j):
        if j == len(zs) - 1:
            return neck
        return radius(phi, z) if radius else env_r(max(z, 0.525)) + clear
    g = axis_grid(phis, zs, r, keep=keep, tag=(lambda i, j: tag(mids[i], zs[j])) if tag else None)

    def tuck(p):
        return p - Vector((p.x, p.y, 0)).normalized() * hem + Vector((0, 0, 0.012))
    return g.lip(tuck, tag=lip_tag)


def front_col(segs, limit_deg):
    """keep/tag helper: is face column i centred within limit_deg of the front?"""
    phis = ring_phis(segs)
    return lambda i: abs(math.remainder(phis[i] + TAU / (2 * segs), TAU)) < RAD(limit_deg)


def arm_axis(side):
    return 0.37 * side, 0.02


def arm_env(z):
    return 0.12 if z >= 1.08 else 0.12 + (0.10 - 0.12) * (1.08 - z) / 0.30


def shell_arm(side, clear=0.03, bottom=0.79, rows=4, segs=8, flare=None, tag=None, cuff_tuck=0.05, lip_tag='keep'):
    """A sleeve around the arm envelope with a domed shoulder; flare(z) widens it, tag(z) colours bands."""
    ax, ay = arm_axis(side)
    top_r = 0.12 + clear
    zs = [bottom + (1.08 - bottom) * k / (rows - 1) for k in range(rows)]
    zs += [1.08 + top_r * math.sin(RAD(a)) for a in (35, 65)] + [1.08 + top_r]

    def r(phi, z, i, j):
        if z > 1.08:
            return math.sqrt(max(0.0, top_r * top_r - (z - 1.08) ** 2))
        return arm_env(z) + clear + (flare(z) if flare else 0.0)
    g = axis_grid(ring_phis(segs), zs, r, axis=(ax, ay), tag=(lambda i, j: tag(zs[j])) if tag else None)

    def tuck(p):
        return p - Vector((p.x - ax, p.y - ay, 0)).normalized() * cuff_tuck + Vector((0, 0, 0.012))
    return g.lip(tuck, tag=lip_tag)


def hand_centre(side):
    return Vector((0.37 * side, -0.035, 0.728))


def glove(side, extra=0.022, segs=8, rings=6, cuff=None):
    g = ellipsoid(hand_centre(side), (0.112 + extra, 0.116 + extra, 0.12 + extra), segs=segs, rings=rings)
    if cuff:
        r0, r1 = cuff
        g = join(g, lathe([(0.0, 0.79), (r0, 0.79), (r1, 0.86), (r1 - 0.012, 0.875), (0.0, 0.87)], segs,
                          axis=arm_axis(side)))
    return g


def shell_leg(side, clear=0.025, bottom=0.3, top=0.6, rows=4, segs=8, tag=None, tuck=0.04):
    """Trousers around the leg (the hero's shorts cuff included)."""
    lx, ly = 0.18 * side, 0.0
    zs = [bottom + (top - 0.04 - bottom) * k / (rows - 1) for k in range(rows)] + [top]
    g = axis_grid(ring_phis(segs), zs, lambda phi, z, i, j: 0.0 if j == len(zs) - 1 else 0.117 + clear,
                  axis=(lx, ly), tag=(lambda i, j: tag(zs[j])) if tag else None)
    return g.lip(lambda p: p - Vector((p.x - lx, p.y - ly, 0)).normalized() * tuck + Vector((0, 0, 0.012)))


def boot(side, extra=0.024, shaft=0.36, shaft_r=None, segs=10, toe=0.0, tag=None, cuff=None):
    """A cover over the hero's shoe with a shaft up the leg; tag(z0, z1) colours bands, toe points it."""
    prof = [(0.0, -0.006), (0.075 + extra * 0.5, -0.006), (0.112 + extra, 0.02), (0.128 + extra, 0.065),
            (0.126 + extra, 0.13), (0.110 + extra, 0.19)]
    sr = shaft_r or (0.083 + extra + 0.012)
    prof += [(sr, 0.25), (sr, shaft)]
    if cuff:
        prof += [(sr + cuff, shaft + 0.01), (sr + cuff, shaft + 0.06), (sr - 0.02, shaft + 0.065)]
    else:
        prof += [(sr - 0.035, shaft + 0.008)]
    g = lathe(prof, segs, tag=(lambda j: tag(prof[j][1], prof[j + 1][1])) if tag else None)
    out = []
    for v in g.verts:
        k = SHOE_STRETCH if v.z < 0.24 else 1.0 + (SHOE_STRETCH - 1.0) * max(0.0, (0.3 - v.z) / 0.06)
        y = v.y * k
        if toe and y < -0.08 and v.z < 0.2:
            y -= toe * ((-y - 0.08) / 0.1) ** 2
        out.append(Vector((v.x + 0.18 * side, y + SHOE_Y, v.z)))
    g.verts = out
    return g


PACK_COVER = dict(centre=(0.0, 0.355, 0.895), size=(0.45, 0.29, 0.49))


def pack_cover(extra=(0.0, 0.0, 0.0), radius=0.08, k=1):
    """A rounded box enclosing the hero's backpack (flap, pocket and patch included)."""
    cx, cy, cz = PACK_COVER['centre']
    sx, sy, sz = PACK_COVER['size']
    return rbox((sx + extra[0], sy + extra[1], sz + extra[2]), radius, k, loc=(cx, cy + extra[1] / 2, cz))


def back_point(z=0.895):
    return Vector((0.0, PACK_COVER['centre'][1] + PACK_COVER['size'][1] / 2, z))


def pack_need(phi, z, margin=0.03):
    """Distance from the torso axis to the far side of the backpack (plus margin) in direction phi at z."""
    cx, cy, cz = 0.0, 0.352, 0.895
    hx, hy, hz = 0.19 + margin, 0.115 + margin, 0.21 + margin
    rc = 0.1
    dz = abs(z - cz)
    if dz > hz:
        return 0.0
    if dz > hz - rc:
        shrink = rc - math.sqrt(max(0.0, rc * rc - (dz - (hz - rc)) ** 2))
        hx, hy = hx - shrink, hy - shrink
    dx, dy = math.sin(phi), -math.cos(phi)
    t0, t1 = -1e9, 1e9
    for d, lo, hi in ((dx, cx - hx, cx + hx), (dy, cy - hy, cy + hy)):
        if abs(d) < 1e-9:
            if not lo <= 0.0 <= hi:
                return 0.0
            continue
        a, b = lo / d, hi / d
        t0, t1 = max(t0, min(a, b)), min(t1, max(a, b))
    return t1 if t0 <= t1 and t1 > 0 else 0.0


def sun_emblem(m, disc_mat, ray_mat, r=0.1, rays=8, thick=0.03):
    rays_g = star_solid(rays, r, r * 0.66, thick, 0.01).retag(ray_mat)
    disc = ellipsoid((0, 0, thick * 0.5), (r * 0.5, r * 0.5, 0.018), segs=8, rings=3).retag(disc_mat)
    return join(rays_g, disc).transformed(m)


def band_on_hood(r, z0, z1, segs=20):
    """A raised band around a spherical hood between heights z0 and z1."""
    prof = [(math.sqrt(r * r - (z - C.z) ** 2) + dr, z) for z, dr in
            ((z0, -0.012), (z0 + 0.006, 0.012), (z1 - 0.006, 0.012), (z1, -0.012))]
    return lathe(prof, segs)


# ------------------------------------------------------------------ ninja
def dz_ninja():
    k = Costume('dz_ninja', 'ninja')
    cloth = k.m('cloth', '#2E3F8F', 0.55)
    dark = k.m('wrap', '#1B2456', 0.6)
    red = k.m('sash', '#F0335A', 0.42)
    steel = k.m('plate', '#D9E2F0', 0.28, 0.35)
    # Hood and mask in one, with a slit for the eyes; a red headband knotted at the back.
    k.add('hood', 'head', hood(0.665, (33, 12, -2.0, 3.2)), cloth)
    k.add('hood', 'head', band_on_hood(0.665, 1.748, 1.842), red)
    pd = Vector((0, -1, 0.34)).normalized()
    k.add('hood', 'head', rbox((0.22, 0.03, 0.1), 0.014, 1, m=facing(on_head(pd, 0.679), pd)), steel)
    k.add('hood', 'head', star_solid(4, 0.035, 0.012, 0.012, 0.004).transformed(facing(on_head(pd, 0.695), pd)), dark)
    knot = on_head((0, 1, 0.33), 0.675)
    k.add('hood', 'head', ellipsoid(knot, (0.075, 0.05, 0.06), segs=8, rings=5), red)
    for s in (-1, 1):
        path = bez([knot + Vector((0.02 * s, 0.01, 0)), knot + Vector((0.14 * s, 0.2, -0.02)),
                    knot + Vector((0.2 * s, 0.33, -0.2)), knot + Vector((0.3 * s, 0.4, -0.36 + 0.05 * s))], 6)
        k.add('hood', 'head', tube(path, [0.05, 0.055, 0.055, 0.052, 0.045, 0.0], sides=4, flatten=0.22,
                                   cap_start=True, up=(0, 0, 1)), red)
    # Suit with a crossed collar and a red sash knotted at the side.
    k.add('suit', 'body', shell_torso(0.034, bottom=0.49, rows=7, segs=20,
                                      tag=lambda phi, z: red if 0.64 <= z < 0.74 else None), cloth)
    for s in (-1, 1):
        pts = []
        for t in range(5):
            z = 1.1 - t * 0.09
            x = s * (0.03 + 0.05 * t)
            r = env_r(z) + 0.042
            pts.append((x, -math.sqrt(max(0.0, r * r - x * x)), z))
        k.add('suit', 'body', tube(pts, 0.03, sides=4, flatten=0.3, cap_start=True, cap_end=True, up=(0, -1, 0)), dark)
    kc = Vector((0.2, -0.41, 0.69))
    k.add('suit', 'body', ellipsoid(kc, (0.05, 0.035, 0.045), segs=8, rings=5), red)
    for s in (0, 1):
        path = [kc + Vector((0.01, 0, -0.02)), kc + Vector((0.03 + 0.04 * s, -0.02, -0.12)),
                kc + Vector((0.05 + 0.06 * s, -0.01, -0.22))]
        k.add('suit', 'body', tube(path, [0.035, 0.035, 0.0], sides=4, flatten=0.3, cap_start=True, up=(0, -1, 0)), red)
    # A navy pack over the backpack with crossed red cords.
    k.add('pack', 'body', pack_cover(radius=0.08), cloth)
    bp = back_point()
    for s in (-1, 1):
        path = [bp + Vector((-0.2 * s, 0.0, 0.22)), bp + Vector((0.0, 0.012, 0.0)), bp + Vector((0.2 * s, 0.0, -0.22))]
        k.add('pack', 'body', tube(path, 0.028, sides=4, flatten=0.35, cap_start=True, cap_end=True, up=(0, 1, 0)), red)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('sleeve', part, shell_arm(side, 0.03, tag=lambda z: dark if z < 0.9 else None), cloth)
        k.add('sleeve', part, glove(side, 0.02, segs=8, rings=6), dark)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.024, bottom=0.3, rows=3), cloth)
        k.add('leg', part, boot(side, 0.022, shaft=0.34, segs=10), dark)
    return k


# ------------------------------------------------------------------- mage
def dz_mage():
    k = Costume('dz_mage', 'mage')
    robe = k.m('robe', '#6B3FE0', 0.5)
    deep = k.m('deep', '#4A26A8', 0.5)
    gold = k.m('gold', '#FFC83A', 0.32, 0.15)
    white = k.m('beard', '#FFFDF6', 0.7)
    # A big hood with a floppy pointed tip, gold trim and stars.
    k.add('hood', 'head', hood(0.70, (43, 35, 9.0, 2.2), trim=gold, lip_in=0.645), robe)
    tip = bez([(0, 0.06, 2.08), (0, 0.06, 2.55), (0, 0.4, 2.78), (0.02, 0.66, 2.6)], 8)
    k.add('hood', 'head', tube(tip, [0.47, 0.39, 0.28, 0.19, 0.12, 0.075, 0.045, 0.0], sides=10), robe)
    k.add('hood', 'head', ellipsoid(tip[-1] + Vector((0.0, 0.02, -0.03)), (0.06, 0.06, 0.06), segs=8, rings=5), gold)
    for d, s in (((0.62, -0.28, 0.72), 0.075), ((-0.66, 0.1, 0.6), 0.06), ((0.2, 0.45, 0.86), 0.07)):
        dd = Vector(d).normalized()
        k.add('hood', 'head', star_solid(5, s, s * 0.45, 0.02, 0.008).transformed(facing(on_head(dd, 0.703), dd)), gold)
    k.add('hood', 'head', star_solid(5, 0.07, 0.03, 0.02, 0.008).transformed(
        facing(tip[3] + Vector((0.19, -0.02, 0.0)), (1, -0.2, 0.2))), gold)
    # A fluffy white beard with a moustache and bushy brows.
    for c, r in (((0.0, -0.66, 1.3), (0.2, 0.11, 0.17)), ((0.0, -0.62, 1.12), (0.15, 0.1, 0.14)),
                 ((-0.15, -0.6, 1.36), (0.13, 0.1, 0.12)),
                 ((0.15, -0.6, 1.36), (0.13, 0.1, 0.12))):
        k.add('beard', 'head', ellipsoid(c, r, segs=8, rings=5), white)
    for s in (-1, 1):
        k.add('beard', 'head', ellipsoid(None, (0.1, 0.05, 0.045), segs=6, rings=4,
                                         m=xf((0.085 * s, -0.612, 1.455), (0, -0.25 * s, 0))), white)
        k.add('beard', 'head', ellipsoid(None, (0.085, 0.035, 0.032), segs=6, rings=3,
                                         m=xf(on_head((0.22 * s, -0.56, 0.2), 0.628), (0, 0.18 * s, 0))), white)
    # Robe flaring to the ankles, gold hem and front stripe, a deep purple belt, stars.
    def rr(phi, z):
        return env_r(max(z, 0.525)) + 0.04 + 0.11 * smoothstep(0.62, 0.2, z)
    k.add('robe', 'body', shell_torso(bottom=0.2, rows=8, segs=20, radius=rr, lip_tag=gold, hem=0.06,
                                      tag=lambda phi, z: gold if z < 0.25 or abs(math.remainder(phi, TAU)) < 0.14 else
                                      (deep if 0.66 <= z < 0.72 else None)), robe)
    for d, s in (((0.32, -1, 0.0), 0.06), ((-0.45, -1, -0.5), 0.05), ((0.5, 1, 0.1), 0.06), ((-0.5, 1, -0.3), 0.05)):
        dir2 = Vector((d[0], d[1], 0)).normalized()
        z = 0.6 + d[2] * 0.3
        k.add('robe', 'body', star_solid(5, s, s * 0.45, 0.018, 0.006).transformed(
            facing(dir2 * (rr(0, z) + 0.004) + Vector((0, 0, z)), dir2 + Vector((0, 0, 0.25)))), gold)
    # A spellbook on the back (covers the backpack).
    k.add('book', 'body', pack_cover(radius=0.06), deep)
    bp = back_point()
    k.add('book', 'body', star_solid(5, 0.11, 0.05, 0.024, 0.01).transformed(facing(bp + Vector((0, 0.008, 0.02)), (0, 1, 0))), gold)
    for s in (-1, 1):
        k.add('book', 'body', ellipsoid((0.2 * s, bp.y, 0.895), (0.035, 0.02, 0.06), segs=6, rings=3), gold)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('sleeve', part, shell_arm(side, 0.03, flare=lambda z: 0.07 * smoothstep(1.0, 0.79, z),
                                        tag=lambda z: gold if z < 0.8 else None, lip_tag=gold, cuff_tuck=0.09), robe)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('shoe', part, boot(side, 0.022, shaft=0.27, segs=8, toe=0.12), deep)
        k.add('shoe', part, ellipsoid((0.18 * side, -0.36, 0.09), (0.035, 0.035, 0.035), segs=6, rings=4), gold)
    return k


# ------------------------------------------------------------------ knight
def dz_knight():
    k = Costume('dz_knight', 'knight')
    plate = k.m('plate', '#F4F7FD', 0.28, 0.15)
    gold = k.m('gold', '#FFBE2E', 0.28, 0.25)
    plume = k.m('plume', '#FF4A3A', 0.55)
    blue = k.m('cloth', '#2F64E0', 0.5)
    sun = k.m('sun', '#FF7A1A', 0.4)
    # Open-faced helmet with gold trim, a brow band, a crest ridge and a red plume.
    k.add('helmet', 'head', hood(0.675, (37, 29, 8.0, 2.6), trim=gold, lip_in=0.64), plate)
    k.add('helmet', 'head', band_on_hood(0.675, 1.87, 1.936), gold)
    crest = [on_head((0, math.sin(RAD(a)), math.cos(RAD(a))), 0.69 + h) for a, h in
             ((-34, 0.05), (-18, 0.12), (0, 0.17), (18, 0.19), (36, 0.18), (54, 0.14), (72, 0.07), (86, 0.0))]
    k.add('helmet', 'head', tube(crest, [0.07, 0.1, 0.12, 0.13, 0.12, 0.1, 0.07, 0.0], sides=6, flatten=0.42,
                                 cap_start=True, up=(1, 0, 0)), plume)
    sd = Vector((0, -1, 0.72)).normalized()
    k.add('helmet', 'head', sun_emblem(facing(on_head(sd, 0.685), sd), sun, gold, 0.1))
    # Chest plate over a blue tunic skirt, gold trims and the sun on the chest.
    def rr(phi, z):
        return env_r(max(z, 0.525)) + 0.04 + 0.06 * smoothstep(0.64, 0.44, z)
    k.add('plate', 'body', shell_torso(bottom=0.44, rows=7, segs=20, radius=rr, lip_tag=gold,
                                       tag=lambda phi, z: blue if z < 0.6 else (gold if z < 0.66 or z > 1.1 else None)),
          plate)
    k.add('plate', 'body', sun_emblem(facing((0, -(env_r(0.9) + 0.043), 0.9), (0, -1, 0.15)), sun, gold, 0.12))
    # A round shield on the back over a plate box (covers the backpack).
    k.add('shield', 'body', pack_cover(radius=0.08), plate)
    bp = back_point()
    shield = lathe([(0.0, -0.02), (0.31, -0.02), (0.33, 0.005), (0.31, 0.035), (0.24, 0.06), (0.0, 0.075)], 14,
                   tag=lambda j: gold if j < 3 else blue).transformed(facing(bp + Vector((0, 0.03, 0.0)), (0, 1, 0)))
    k.add('shield', 'body', shield)
    k.add('shield', 'body', sun_emblem(facing(bp + Vector((0, 0.1, 0.0)), (0, 1, 0)), sun, gold, 0.12))
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        ax, ay = arm_axis(side)
        k.add('sleeve', part, shell_arm(side, 0.028, tag=lambda z: plate if z < 0.9 else blue), plate)
        paul = lathe([(0.0, -0.01), (0.195, -0.01), (0.2, 0.02), (0.17, 0.09), (0.1, 0.14), (0.0, 0.155)], 10,
                     tag=lambda j: gold if j < 2 else plate)
        k.add('sleeve', part, paul.transformed(xf((ax + 0.03 * side, ay, 0.98), (0, 0.35 * side, 0))))
        k.add('sleeve', part, glove(side, 0.024), gold)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('greave', part, boot(side, 0.024, shaft=0.4,
                                   tag=lambda z0, z1: gold if z0 > 0.36 or z1 < 0.03 else plate))
        k.add('greave', part, shell_leg(side, 0.02, bottom=0.38, rows=3), blue)
    return k

# ------------------------------------------------------------------- mecha
def mecha_r(d):
    """Superquadric robot head: boxy on top, round underneath."""
    a, n = 0.66, 3.2
    m = 3.2 if d.z > 0 else 2.0
    xy = (abs(d.x / a) ** n + abs(d.y / a) ** n) ** (m / n)
    return (xy + abs(d.z / a) ** m) ** (-1.0 / m)


def dz_mecha():
    k = Costume('dz_mecha', 'mecha')
    white = k.m('armor', '#F2F5FB', 0.3, 0.1)
    blue = k.m('trim', '#2F6BFF', 0.35, 0.1)
    yellow = k.m('accent', '#FFC83A', 0.35)
    visor = k.m('visor', '#1C2A5E', 0.12)
    glow = k.m('glow', '#5CEBFF', 0.2, emit='#5CEBFF', strength=1.6)
    grey = k.m('steel', '#8C97AD', 0.3, 0.4)
    flame = k.m('flame', '#FF8A2A', 0.4, emit='#FF8A2A', strength=1.2)
    bulb = k.m('bulb', '#FF4A4A', 0.3, emit='#FF4A4A', strength=0.8)
    # Robot helmet open at the neck, a dark visor with two glowing eyes, ear discs and an antenna.
    cols, rows = 22, 7
    psis = [TAU * (i + 0.5) / cols for i in range(cols)]
    helm = pole_grid(Vector((0, 0, -1)), Vector((0, -1, 0)), Vector((1, 0, 0)), psis,
                     lambda i, j: RAD(34) + (math.pi - RAD(34)) * j / rows, lambda i, j, d: mecha_r(d), rows,
                     tag=lambda i, j: blue if j >= rows - 2 else None)
    helm.lip(lambda p: C + (p - C).normalized() * 0.6)
    k.add('helmet', 'head', helm, white)
    k.add('helmet', 'head', front_patch(mecha_r, (50, 17, 1.0, 3.5), cols=20, rows=3, lift=0.012, dome=0.004), visor)
    for s in (-1, 1):
        k.add('helmet', 'head', front_patch(mecha_r, (7.5, 9.5, 1.0, 2.0, -20 * s), cols=12, rows=2, lift=0.02,
                                            dome=0.006), glow)
        ear = lathe([(0.0, -0.01), (0.15, -0.01), (0.15, 0.05), (0.1, 0.075), (0.0, 0.08)], 10,
                    tag=lambda j: yellow if j > 1 else blue)
        k.add('helmet', 'head', ear.transformed(facing((0.675 * s, 0.0, 1.6), (s, 0, 0))))
    k.add('helmet', 'head', tube([(0, 0.05, 2.2), (0, 0.06, 2.42)], 0.022, sides=6, cap_end=True), grey)
    k.add('helmet', 'head', ellipsoid((0, 0.06, 2.45), (0.06, 0.06, 0.06), segs=6, rings=4), bulb)
    # Faceted armour torso with a glowing core (the flats sit at env + 0.035).
    oct_k = 1.0 / math.cos(math.pi / 8)

    def rr(phi, z):
        return (env_r(max(z, 0.525)) + 0.035 + 0.03 * smoothstep(0.62, 0.48, z)) * oct_k
    k.add('armor', 'body', shell_torso(bottom=0.46, rows=7, segs=8, radius=rr,
                                       tag=lambda phi, z: blue if z < 0.62 or z > 1.08 else (yellow if 0.66 < z < 0.76 else None)), white, sharp=30)
    front = lambda z: -(rr(0, z) / oct_k)
    k.add('armor', 'body', lathe([(0.0, 0.0), (0.105, 0.0), (0.105, 0.03), (0.0, 0.035)], 12,
                                 tag=lambda j: yellow if j < 2 else glow).transformed(
        facing((0, front(0.88) - 0.002, 0.88), (0, -1, 0.12))))
    # Jetpack over the backpack with glowing nozzles.
    k.add('jetpack', 'body', pack_cover((0.02, 0.0, 0.0), 0.09), blue)
    bp = back_point()
    for s in (-1, 1):
        nz = Vector((0.14 * s, bp.y - 0.06, 0.66))
        k.add('jetpack', 'body', lathe([(0.0, 0.0), (0.075, 0.0), (0.09, -0.06), (0.1, -0.13), (0.07, -0.13),
                                        (0.0, -0.1)], 8).transformed(Matrix.Translation(nz)), grey)
        k.add('jetpack', 'body', ellipsoid(nz + Vector((0, 0, -0.14)), (0.07, 0.07, 0.03), segs=8, rings=3), flame)
    # Shoulder cannons, outboard of the helmet.
    for s in (-1, 1):
        base = Vector((0.67 * s, 0.06, 1.2))
        k.add('cannon', 'body', rbox((0.16, 0.26, 0.12), 0.035, 1, loc=base), white)
        k.add('cannon', 'body', tube([base + Vector((0, 0.08, 0.08)), base + Vector((0, -0.36, 0.1))],
                                     0.055, sides=8, cap_start=True), grey)
        k.add('cannon', 'body', lathe([(0.05, -0.03), (0.075, -0.03), (0.086, 0.0), (0.075, 0.03), (0.05, 0.03)], 10).transformed(
            facing(base + Vector((0, -0.33, 0.1)), (0, -1, 0.05))), yellow)
        k.add('cannon', 'body', lathe([(0.0, 0.0), (0.04, 0.0), (0.0, 0.001)], 8).transformed(
            facing(base + Vector((0, -0.345, 0.1)), (0, -1, 0.05))), glow)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('arm', part, shell_arm(side, 0.032, rows=4, segs=8, tag=lambda z: blue if 0.92 < z < 1.0 else None),
              white, sharp=40)
        k.add('arm', part, rbox((0.27, 0.29, 0.26), 0.07, 1, loc=hand_centre(side) + Vector((0, -0.005, -0.005))), blue)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.028, bottom=0.26, rows=3, segs=8), white, sharp=40)
        k.add('leg', part, rbox((0.32, 0.42, 0.3), 0.07, 1, loc=(0.18 * side, -0.1, 0.14)), blue)
    return k


# --------------------------------------------------------------------- dino
def dz_dino():
    k = Costume('dz_dino', 'dino')
    green = k.m('skin', '#43C23A', 0.45)
    dark = k.m('dark', '#2A8F2E', 0.5)
    belly = k.m('belly', '#FFE27A', 0.5)
    spike = k.m('spike', '#FF9A2E', 0.4)
    tooth = k.m('tooth', '#FFFDF6', 0.35)
    mouth = k.m('mouth', '#E0456E', 0.5)
    eye = k.m('eye', '#1E1A24', 0.12)
    # The hood is the dino's head: the explorer looks out of its mouth under the snout.
    win = (40, 29, 6.0, 2.4)
    k.add('hood', 'head', hood(0.67, win, trim=mouth, lip_in=0.64, trim_raise=0.004), green)
    k.add('hood', 'head', ellipsoid((0, -0.45, 2.07), (0.36, 0.42, 0.2), segs=12, rings=7), green)
    for s in (-1, 1):
        k.add('hood', 'head', ellipsoid((0.1 * s, -0.8, 2.13), (0.035, 0.03, 0.02), segs=6, rings=3), dark)
        ec = Vector((0.23 * s, -0.36, 2.2))
        k.add('hood', 'head', ellipsoid(ec, (0.1, 0.09, 0.09), segs=8, rings=5), tooth)
        k.add('hood', 'head', ellipsoid(ec + Vector((0.004 * s, -0.045, 0.02)), (0.06, 0.05, 0.065), segs=8, rings=4), eye)
        k.add('hood', 'head', ellipsoid(ec + Vector((0.01 * s, -0.085, 0.05)), (0.018, 0.012, 0.018), segs=6, rings=3), tooth)
        k.add('hood', 'head', ellipsoid(ec + Vector((0.02 * s, -0.02, 0.085)), (0.11, 0.07, 0.035), segs=6, rings=3), dark)
    F, U, R = tilted(win[2])
    alpha = superellipse(win[0], win[1], win[3])
    for psi_d, length in ((-52, 0.055), (-30, 0.065), (-10, 0.07), (10, 0.07), (30, 0.065), (52, 0.055),
                          (150, 0.045), (180, 0.05), (210, 0.045)):
        psi = RAD(psi_d)
        side = U * math.cos(psi) + R * math.sin(psi)
        root = C + (F * math.cos(alpha(psi)) + side * math.sin(alpha(psi))).normalized() * 0.668
        point = (-side * 0.9 - F * 0.2).normalized()
        k.add('hood', 'head', cone(root - point * 0.01, point, length, 0.028, sides=4), tooth)
    for t, size in ((0.0, 0.13), (0.3, 0.15), (0.62, 0.13), (0.9, 0.1)):
        a = RAD(-5 + t * 110)
        d = Vector((0, math.sin(a), math.cos(a)))
        k.add('hood', 'head', cone(C + d * 0.66, d + Vector((0, 0.3, 0)), size, size * 0.55, sides=4), spike)
    # Suit humped over the backpack, a yellow belly, back spikes and a tail.
    def rr(phi, z):
        base = env_r(max(z, 0.525)) + 0.035
        need = pack_need(phi, z)
        return smax(base, need + 0.01, 0.06) if need > 0 else base
    k.add('suit', 'body', shell_torso(bottom=0.46, rows=8, segs=20, radius=rr,
                                      tag=lambda phi, z: belly if abs(math.remainder(phi, TAU)) < RAD(42) and z < 1.06
                                      else None), green)
    for z, size in ((1.12, 0.11), (0.98, 0.13), (0.83, 0.13), (0.68, 0.11)):
        k.add('suit', 'body', cone(Vector((0, rr(math.pi, z) - 0.01, z)), (0, 1, 0.25), size, size * 0.55, sides=4), spike)
    tail = bez([(0, 0.3, 0.66), (0, 0.72, 0.5), (0, 1.02, 0.26), (0.1, 1.34, 0.26)], 7)
    radii = [0.24, 0.2, 0.16, 0.12, 0.085, 0.05, 0.0]
    tg = tube(tail, radii, sides=10, cap_start=True)
    tg.tags = [belly if tg.face_normal(f).normalized().z < -0.45 else None for f in tg.faces]
    k.add('tail', 'body', tg, green)
    for i, size in ((1, 0.1), (2, 0.09), (3, 0.075), (4, 0.06)):
        tdir = (tail[i + 1] - tail[i - 1]).normalized()
        upv = (UP - tdir * UP.dot(tdir)).normalized()
        k.add('tail', 'body', cone(tail[i] + upv * (radii[i] - 0.015), upv + tdir * 0.35, size, size * 0.55, sides=4), spike)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('sleeve', part, shell_arm(side, 0.03, rows=4), green)
        k.add('sleeve', part, glove(side, 0.025, segs=8, rings=6), green)
        c = hand_centre(side)
        for dx in (-0.05, 0.0, 0.05):
            k.add('sleeve', part, cone(c + Vector((dx, -0.12, -0.06)), (0, -1, -0.5), 0.06, 0.022, sides=4), tooth)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.03, bottom=0.3, rows=3), green)
        k.add('leg', part, boot(side, 0.03, shaft=0.34), green)
        for dx in (-0.075, 0.0, 0.075):
            k.add('leg', part, cone(Vector((0.18 * side + dx, -0.25, 0.06)), (0, -1, 0.1), 0.07, 0.028, sides=4), tooth)
    return k


# -------------------------------------------------------------------- fairy
def dz_fairy():
    k = Costume('dz_fairy', 'fairy', hides_leaf=False)
    leaf = k.m('leaf', '#43C23A', 0.45)
    light = k.m('leaf light', '#8BE35A', 0.45)
    petal = k.m('petal', '#FF6FB5', 0.45)
    pale = k.m('petal light', '#FFB8DC', 0.45)
    sun = k.m('pollen', '#FFD23A', 0.4)
    wing = k.m('wing', '#C8F6FF', 0.25, emit='#C8F6FF', strength=0.35)
    rim = k.m('wing rim', '#C39CFF', 0.3, emit='#C39CFF', strength=0.3)
    # Petal crown on a vine ring, with a flower at the front.
    ring_z, ring_r = 1.955, 0.54
    k.add('crown', 'head', torus((0, 0, ring_z), (0, 0, 1), ring_r, 0.036, 18, 4), leaf)
    for i in range(8):
        a = TAU * i / 8
        out = Vector((math.sin(a), -math.cos(a), 0))
        m = frame_m(Vector((0, 0, ring_z)) + out * (ring_r + 0.005), out * 0.55 + UP, -out * 0.6 + UP * 0.2)
        k.add('crown', 'head', leaf_solid(0.26, 0.18, 0.018, rows=4, cup=0.45, bend=0.1, shape=0.6, taper=0.1)
              .transformed(m), petal if i % 2 == 0 else pale)
    fc = Vector((0.16, -0.52, 2.0))
    fd = Vector((0.25, -1, 0.9)).normalized()
    for i in range(5):
        m = facing(fc, fd, spin=TAU * i / 5) @ Matrix.Rotation(RAD(12), 4, 'X')
        k.add('crown', 'head', leaf_solid(0.14, 0.11, 0.016, rows=3, cup=0.3, bend=-0.1).transformed(m), petal)
    k.add('crown', 'head', ellipsoid(fc + fd * 0.02, (0.05, 0.05, 0.05), segs=6, rings=4), sun)
    # Leaf bodice with a skirt of hanging leaves and a petal waistband.
    k.add('dress', 'body', shell_torso(0.034, bottom=0.62, rows=5, segs=20), leaf)
    for i in range(10):
        a = TAU * (i + 0.5) / 10
        out = Vector((math.sin(a), -math.cos(a), 0))
        m = frame_m(out * (env_r(0.7) + 0.02) + Vector((0, 0, 0.72)), (out * 0.5 - UP).normalized(), out)
        k.add('dress', 'body', leaf_solid(0.4, 0.3, 0.02, rows=4, cup=-0.35, bend=-0.1, shape=0.65, taper=0.15)
              .transformed(m), leaf if i % 2 else light)
    k.add('dress', 'body', torus((0, 0, 0.705), (0, 0, 1), env_r(0.7) + 0.035, 0.03, 18, 4), petal)
    # Bright pale wings on a leafy pack (covers the backpack).
    k.add('wings', 'body', pack_cover(radius=0.09), light)
    bp = back_point(0.92)
    k.add('wings', 'body', ellipsoid(bp + Vector((0, 0.02, 0.04)), (0.09, 0.05, 0.09), segs=8, rings=4), petal)
    for s in (-1, 1):
        for L, W, pitch, yaw, dz in ((0.76, 0.46, 30, 14, 0.1), (0.52, 0.32, -26, 10, -0.08)):
            direction = Vector((math.cos(RAD(pitch)) * s, math.sin(RAD(yaw)) * 0.8, math.sin(RAD(pitch))))
            m = frame_m(bp + Vector((0.06 * s, 0.03, dz)), direction, (0, 1, 0))
            k.add('wings', 'body', leaf_solid(L, W, 0.022, rows=5, cup=0.0, bend=0.0, inner=0.62, tags=(rim, wing),
                                              shape=0.7, taper=0.05).transformed(m))
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        ax, ay = arm_axis(side)
        k.add('sleeve', part, shell_arm(side, 0.024, rows=4), leaf)
        for i in range(3):
            out = Vector((math.sin(TAU * i / 3 + RAD(30) * side), -math.cos(TAU * i / 3 + RAD(30) * side), 0))
            m = frame_m(Vector((ax, ay, 1.13)) + out * 0.1, (out * 0.9 - UP * 0.5).normalized(), out)
            k.add('sleeve', part, leaf_solid(0.17, 0.17, 0.016, rows=3, cup=-0.4, bend=-0.1).transformed(m), pale)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.02, bottom=0.3, rows=3), light)
        k.add('leg', part, boot(side, 0.022, shaft=0.3, segs=10, toe=0.07), petal)
    return k

# ------------------------------------------------------------------- pirate
def dz_pirate():
    k = Costume('dz_pirate', 'pirate')
    hat = k.m('hat', '#2B2336', 0.45)
    gold = k.m('gold', '#FFC83A', 0.3, 0.2)
    bone = k.m('bone', '#FFFDF6', 0.45)
    coat = k.m('coat', '#E0273F', 0.45)
    vest = k.m('vest', '#FFF1D2', 0.5)
    black = k.m('black', '#1E1A24', 0.35)
    wood = k.m('wood', '#A9612E', 0.5)
    # Tricorn: a crown over the hair and a brim turned up into three walls, the front one with a skull.
    crown = [(math.sqrt(max(0.0, 0.668 ** 2 - (z - C.z) ** 2)), z) for z in (1.84, 1.95, 2.05, 2.14, 2.21, 2.25)]
    cg = lathe(crown + [(0.0, 2.262)], 16)
    cg.lip(lambda p: Vector((p.x * 0.9, p.y * 0.9, p.z + 0.01)))
    k.add('hat', 'head', cg, hat)
    cols, rows = 24, 3
    verts, faces, tags = [], [], []
    for i in range(cols):
        phi = TAU * i / cols
        c3 = math.cos(3 * phi)
        R = 0.63 + 0.33 * ((1 - c3) / 2) ** 1.4
        lift = 0.03 + 0.34 * ((1 + c3) / 2) ** 1.2
        for j in range(rows + 1):
            s = j / rows
            r = 0.575 + (R - 0.575) * s
            verts.append((r * math.sin(phi), -r * math.cos(phi), 1.855 + lift * s ** 1.7))
    for i in range(cols):
        n = (i + 1) % cols
        for j in range(rows):
            faces.append((i * (rows + 1) + j, n * (rows + 1) + j, n * (rows + 1) + j + 1, i * (rows + 1) + j + 1))
            tags.append(gold if j == rows - 1 else None)
    brim = Geo(verts, faces, tags).orient(lambda p: Vector((0, 0, 1)) + Vector((p.x, p.y, 0)) * 0.2)
    k.add('hat', 'head', brim.solidify(0.022, rim_tag=gold), hat)
    sm = facing((0.0, -0.64, 2.07), (0, -1, 0.12))
    for a in (0.6, -0.6):
        bone_g = tube([(-0.1, 0, 0), (0.1, 0, 0)], 0.016, sides=5, cap_start=True, cap_end=True)
        k.add('hat', 'head', bone_g.transformed(sm @ Matrix.Rotation(a, 4, 'Z')), bone)
    k.add('hat', 'head', ellipsoid(None, (0.07, 0.062, 0.03), segs=8, rings=4, m=sm @ xf((0, 0.015, 0.02))), bone)
    k.add('hat', 'head', ellipsoid(None, (0.04, 0.025, 0.018), segs=6, rings=3, m=sm @ xf((0, -0.042, 0.02))), bone)
    for s in (-1, 1):
        k.add('hat', 'head', ellipsoid(None, (0.019, 0.022, 0.01), segs=6, rings=3, m=sm @ xf((0.026 * s, 0.018, 0.046))), black)
    # Eye patch with a strap across the forehead.
    ep = eye_frame(-1)
    F, U, R = head_frame(ep)
    k.add('patch', 'head', decal(ep, 0.105, 0.115, 0.612, 0.012, segs=12, rows=2, tuck=0.6), black)
    q = (R * 0.85 + U * 0.55).normalized()
    strap = [C + (F * math.cos(t) + q * math.sin(t)) * 0.636 for t in [TAU * i / 14 for i in range(15)]]
    k.add('patch', 'head', tube(strap, 0.017, sides=4, flatten=0.35), black)
    # Long red coat open over a cream waistcoat: gold trim and buttons, black belt, gold buckle.
    def rr(phi, z):
        return env_r(max(z, 0.525)) + 0.042 + 0.09 * smoothstep(0.6, 0.32, z)
    opening = front_col(20, 20)
    k.add('coat', 'body', shell_torso(bottom=0.32, rows=8, segs=20, radius=rr, lip_tag=gold, hem=0.05,
                                      keep=lambda i, j: not (opening(i) and j < 7),
                                      tag=lambda phi, z: black if 0.64 <= z < 0.72 else None), coat)
    front40 = front_col(20, 40)
    k.add('coat', 'body', shell_torso(bottom=0.52, rows=6, segs=20, radius=lambda phi, z: env_r(max(z, 0.525)) + 0.022,
                                      keep=lambda i, j: front40(i)), vest)
    k.add('coat', 'body', ellipsoid((0, -rr(0, 0.68) + 0.005, 0.68), (0.075, 0.022, 0.055), segs=8, rings=3), gold)
    for s in (-1, 1):
        for z in (0.82, 0.98):
            r, a = rr(0, z), RAD(24) * s
            k.add('coat', 'body', ellipsoid((r * math.sin(a), -r * math.cos(a), z), (0.026, 0.02, 0.026), segs=6, rings=3), gold)
    # A treasure chest on the back (covers the backpack).
    cy = PACK_COVER['centre'][1]
    k.add('chest', 'body', pack_cover(radius=0.05), wood)
    bp = back_point()
    for s in (-1, 1):   # gold bands over the lid and down the back
        band = [(0.15 * s, cy - 0.1, 1.145), (0.15 * s, bp.y - 0.02, 1.13), (0.15 * s, bp.y + 0.004, 1.05),
                (0.15 * s, bp.y + 0.004, 0.74), (0.15 * s, bp.y - 0.02, 0.655)]
        k.add('chest', 'body', tube(band, 0.03, sides=4, flatten=0.3, cap_start=True, cap_end=True, up=(0, 1, 0)), gold)
    k.add('chest', 'body', ellipsoid((0, bp.y + 0.004, 0.95), (0.05, 0.022, 0.06), segs=8, rings=3), gold)
    k.add('chest', 'body', ellipsoid((0, bp.y + 0.026, 0.935), (0.015, 0.01, 0.022), segs=6, rings=3), black)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('sleeve', part, shell_arm(side, 0.03, flare=lambda z: 0.045 * smoothstep(0.9, 0.82, z),
                                        tag=lambda z: vest if z < 0.9 else None, lip_tag=gold, cuff_tuck=0.08), coat)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('boot', part, boot(side, 0.024, shaft=0.43, shaft_r=0.142, cuff=0.03), black)
    return k


# ---------------------------------------------------------------- superhero
def cape(k, name, outer, inner, top=1.28, bottom=0.24, span_top=62, span_bottom=66, rows=9, cols=14, collar=None,
         flare=0.12, thick=0.025, neck_r=0.44):
    """A cape sheet behind the torso that clears the backpack. collar = (z top, span deg, r start, r top) rises
    behind the head above the cape."""
    zs = [bottom + (top - bottom) * j / rows for j in range(rows + 1)]
    if collar:
        zs += [top + (collar[0] - top) * t for t in (0.35, 0.7, 1.0)]
    verts = []
    for z in zs:
        above = bool(collar) and z > top + 1e-6
        span = RAD(collar[1] if above else span_bottom + (span_top - span_bottom) * (z - bottom) / (top - bottom))
        for i in range(cols + 1):
            u = -1 + 2 * i / cols
            phi = math.pi + span * u
            if above:
                t = (z - top) / (collar[0] - top)
                r = collar[2] + (collar[3] - collar[2]) * t
            else:
                base = 0.5 + flare * smoothstep(0.95, bottom, z)
                need = pack_need(phi, z, 0.04)
                r = smax(base, need, 0.05) if need else base
                if z > 1.12:
                    r += (neck_r - r) * smoothstep(1.12, top, z)
                r += 0.025 * math.sin(u * math.pi * 3.0) * smoothstep(0.9, bottom, z)
            verts.append((r * math.sin(phi), -r * math.cos(phi), z))
    n = cols + 1
    faces = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i) for j in range(len(zs) - 1)
             for i in range(cols)]
    g = Geo(verts, faces).orient(lambda p: Vector((p.x, p.y, 0)))
    k.add(name, 'body', g.solidify(thick, inner_tag=inner, rim_tag=outer), outer)


# Outer edge of one half of the domino mask, in radians around the eye centre: (outward, up).
MASK_OUTLINE = [(-0.364, 0.16), (-0.15, 0.27), (0.05, 0.28), (0.37, 0.35), (0.3, 0.05), (0.17, -0.22),
                (-0.02, -0.27), (-0.364, -0.12)]


def ray_polygon(poly, dx, dy):
    """Distance from the origin to a star-shaped polygon's edge along (dx, dy)."""
    best = None
    for (px, py), (qx, qy) in zip(poly, poly[1:] + poly[:1]):
        ex, ey = qx - px, qy - py
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        t = (px * ey - py * ex) / den
        u = (px * dy - py * dx) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9:
            best = t if best is None else min(best, t)
    return best


def dz_superhero():
    k = Costume('dz_superhero', 'superhero', hides_leaf=False)
    blue = k.m('suit', '#2F6BFF', 0.4)
    red = k.m('cape', '#F0303A', 0.45)
    darkred = k.m('cape inside', '#B51E36', 0.5)
    yellow = k.m('emblem', '#FFCC2E', 0.35)
    mask = k.m('mask', '#E8283A', 0.35)
    # Domino mask: one half per eye (a ring whose outer edge follows MASK_OUTLINE), meeting over the nose
    # and swept up into pointed wings; it rises over the fringe where the two overlap.
    for side in (-1, 1):
        F, U, R = head_frame(eye_frame(side))
        a_in, b_in = (EYE['w'] + 0.02) / HR, (EYE['h'] + 0.018) / HR
        cols, rows = 22, 2
        psis = [TAU * (i + 0.5) / cols for i in range(cols)]

        def inner(psi):
            return (abs(math.sin(psi) / a_in) ** 2 + abs(math.cos(psi) / b_in) ** 2) ** -0.5

        def outer(psi, side=side):
            return ray_polygon(MASK_OUTLINE, math.sin(psi) * side, math.cos(psi))
        g = pole_grid(F, U, R, psis, lambda i, j: inner(psis[i]) + (outer(psis[i]) - inner(psis[i])) * j / rows,
                      lambda i, j, d: 0.607 + 0.026 * (j / rows) * max(0.0, math.cos(psis[i])), rows)
        k.add('mask', 'head', g.lip(lambda p: C + (p - C).normalized() * 0.588), mask)
    # Suit with a yellow belt and a star emblem, and a red cape.
    k.add('suit', 'body', shell_torso(0.034, bottom=0.49, rows=7, segs=20,
                                      tag=lambda phi, z: yellow if 0.62 <= z < 0.69 else None), blue)
    em = facing((0, -(env_r(0.9) + 0.036), 0.9), (0, -1, 0.15))
    k.add('suit', 'body', lathe([(0.0, 0.0), (0.15, 0.0), (0.15, 0.02), (0.0, 0.028)], 16).transformed(em), yellow)
    k.add('suit', 'body', star_solid(5, 0.11, 0.05, 0.024, 0.01).transformed(em @ xf((0, 0, 0.022))), red)
    k.add('suit', 'body', rbox((0.12, 0.04, 0.09), 0.02, 1, loc=(0, -(env_r(0.655) + 0.04), 0.655)), red)
    cape(k, 'cape', red, darkred, top=1.28, bottom=0.24, cols=12)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('sleeve', part, shell_arm(side, 0.028, rows=4), blue)
        k.add('sleeve', part, glove(side, 0.022, segs=8, rings=6, cuff=(0.12, 0.155)), red)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.022, bottom=0.34, rows=3), blue)
        k.add('leg', part, boot(side, 0.024, shaft=0.4, shaft_r=0.13, cuff=0.025), red)
    return k


# ------------------------------------------------------------------ vampire
VAMP_STYLE = [(-180, 128), (-160, 126), (-140, 123), (-120, 119), (-102, 112), (-86, 108), (-72, 110), (-60, 106),
              (-50, 100), (-42, 90), (-34, 79), (-24, 78), (-12, 77), (-5, 84), (0, 94), (5, 84), (12, 77), (24, 78),
              (34, 79), (42, 90), (50, 100), (60, 106), (72, 110), (86, 108), (102, 112), (120, 119), (140, 123),
              (160, 126)]


def hair_edge_at(phi, edge=HAIR_EDGE):
    """The hero's hairline (theta, degrees) at azimuth phi (degrees), linear between the edge points."""
    pts = [(p, t) for p, t, _ in edge] + [(edge[0][0] + 360, edge[0][1])]
    phi = (phi + 180) % 360 - 180
    for (p0, t0), (p1, t1) in zip(pts, pts[1:]):
        if p0 <= phi <= p1:
            return t0 + (t1 - t0) * (phi - p0) / (p1 - p0)
    return pts[0][1]


def vamp_edge():
    """Slicked hair with a widow's peak that still covers every lock of the hero's hair."""
    return [(p, max(t, max(hair_edge_at(p + d) for d in range(-4, 5)) + 3.5), i % 2)
            for i, (p, t) in enumerate(VAMP_STYLE)]


def dz_vampire():
    k = Costume('dz_vampire', 'vampire')
    hair = k.m('hair', '#231C35', 0.25)
    black = k.m('cape', '#1E1A2B', 0.4)
    red = k.m('lining', '#D0183A', 0.45)
    white = k.m('shirt', '#FFFDF6', 0.5)
    gold = k.m('gold', '#FFC83A', 0.3, 0.2)
    gem = k.m('gem', '#FF2E4F', 0.15, emit='#FF2E4F', strength=0.4)
    k.add('hair', 'head', hair_geo(vamp_edge(), rows=7, r_notch=0.636, r_tip=0.648, r_crown=0.645,
                                   lip=(0.632, 0.605), drop=1.2, rise=1.5), hair)
    for s in (-1, 1):
        k.add('fangs', 'head', cone(on_head((0.032 * s, -0.56, -0.132), 0.588), (0.0, -0.3, -1), 0.04, 0.014, sides=4),
              white)
    cape(k, 'cape', black, red, top=1.2, bottom=0.26, span_top=64, span_bottom=64, rows=7, cols=14,
         collar=(1.95, 102, 0.66, 0.82), neck_r=0.55)
    k.add('suit', 'body', shell_torso(0.032, bottom=0.49, rows=7, segs=20,
                                      tag=lambda phi, z: white if abs(math.remainder(phi, TAU)) < RAD(20) and z > 0.7
                                      else (red if 0.62 <= z < 0.68 else None)), black)
    k.add('suit', 'body', lathe([(0.0, 0.0), (0.07, 0.0), (0.07, 0.015), (0.0, 0.02)], 12).transformed(
        facing((0, -(env_r(0.92) + 0.036), 0.92), (0, -1, 0.15))), gold)
    k.add('suit', 'body', ellipsoid((0, -(env_r(0.92) + 0.056), 0.922), (0.035, 0.02, 0.04), segs=8, rings=4), gem)
    bow = Vector((0, -(env_r(1.05) + 0.045), 1.05))
    for s in (-1, 1):
        k.add('suit', 'body', ellipsoid(None, (0.06, 0.03, 0.04), segs=6, rings=3,
                                        m=xf(bow + Vector((0.055 * s, 0, 0)), (0, 0.25 * s, 0))), red)
    k.add('suit', 'body', ellipsoid(bow + Vector((0, -0.007, 0)), (0.025, 0.025, 0.028), segs=6, rings=4), red)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('sleeve', part, shell_arm(side, 0.028, flare=lambda z: 0.04 * smoothstep(0.88, 0.79, z),
                                        tag=lambda z: white if z < 0.86 else None, lip_tag=white, cuff_tuck=0.08), black)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.022, bottom=0.3, rows=3), black)
        k.add('leg', part, boot(side, 0.022, shaft=0.31, segs=10, toe=0.08), black)
    return k


# ------------------------------------------------------------------ snowman
def lump(d, amp=0.012):
    return 1.0 + amp * (math.sin(5 * d.x + 2 * d.z) * math.cos(4 * d.y - d.z) + 0.5 * math.sin(7 * d.z + 3 * d.x))


def dz_snowman():
    k = Costume('dz_snowman', 'snowman')
    snow = k.m('snow', '#F6FBFF', 0.6)
    coal = k.m('coal', '#26242E', 0.5)
    carrot = k.m('carrot', '#FF7A1A', 0.45)
    scarf = k.m('scarf', '#EF3354', 0.55)
    stripe = k.m('stripe', '#FFD23A', 0.55)
    twig = k.m('twig', '#8A4B25', 0.6)
    # Snowball head with coal eyes and smile, a carrot nose and two twigs of hair.
    k.add('head', 'head', pole_grid(UP, Vector((0, -1, 0)), Vector((1, 0, 0)), [TAU * (i + 0.5) / 20 for i in range(20)],
                                    lambda i, j: math.pi * j / 10, lambda i, j, d: 0.70 * lump(d), 10), snow)
    for s in (-1, 1):
        d = Vector((0.24 * s, -1, 0.12)).normalized()
        k.add('head', 'head', ellipsoid(None, (0.06, 0.07, 0.035), segs=8, rings=5, m=facing(on_head(d, 0.695), d)), coal)
    nose_d = Vector((0, -1, -0.08)).normalized()
    k.add('head', 'head', lathe([(0.0, -0.02), (0.07, 0.0), (0.055, 0.12), (0.03, 0.24), (0.0, 0.33)], 8).transformed(
        facing(on_head(nose_d, 0.66), (0, -1, -0.12))), carrot)
    for t in range(5):
        u = -0.2 + 0.1 * t
        k.add('head', 'head', ellipsoid(on_head((u, -1, -0.34 + 0.72 * u * u), 0.696), (0.03, 0.03, 0.03), segs=6,
                                        rings=3), coal)
    for s in (-1, 1):
        root = on_head((0.12 * s, 0.1, 1), 0.68)
        k.add('head', 'head', tube([root, root + Vector((0.05 * s, 0.02, 0.14)), root + Vector((0.1 * s, 0.06, 0.22))],
                                   [0.018, 0.014, 0.0], sides=4, cap_start=True), twig)
    # Snowball body (covers the backpack), coal buttons and a striped scarf.
    bc = Vector((0, 0.06, 0.76))
    body = ellipsoid(bc, (0.58, 0.62, 0.5), segs=20, rings=10)
    body.verts = [bc + (v - bc) * lump((v - bc).normalized(), 0.015) for v in body.verts]
    k.add('body', 'body', body, snow)
    for z in (0.95, 0.8, 0.64):
        dz = (z - bc.z) / 0.5
        k.add('body', 'body', ellipsoid((0, bc.y - 0.62 * math.sqrt(max(0.0, 1 - dz * dz)) - 0.004, z),
                                        (0.045, 0.03, 0.045), segs=8, rings=4), coal)
    sc = torus((0, 0.03, 1.04), (0, 0, 1), 0.5, 0.075, 20, 5)
    sc.tags = [stripe if int((math.atan2(sc.centre(f).x, -(sc.centre(f).y - 0.03)) % TAU) / TAU * 10) % 2 else scarf
               for f in sc.faces]
    k.add('scarf', 'body', sc)
    tt = tube([(0.26, -0.47, 1.0), (0.31, -0.51, 0.85), (0.32, -0.53, 0.7), (0.3, -0.53, 0.58)], 0.07, sides=4,
              flatten=0.3, cap_start=True, cap_end=True, up=(0, -1, 0))
    tt.tags = [stripe if 0.72 < tt.centre(f).z < 0.82 else scarf for f in tt.faces]
    k.add('scarf', 'body', tt)
    for side, part in ((-1, 'arm-left'), (1, 'arm-right')):
        k.add('arm', part, shell_arm(side, 0.035, rows=4), snow)
        k.add('arm', part, glove(side, 0.03, segs=10, rings=6), snow)
        c = hand_centre(side)
        main = [c + Vector((0.05 * side, 0, -0.05)), c + Vector((0.18 * side, -0.02, -0.12)),
                c + Vector((0.32 * side, -0.03, -0.14))]
        k.add('arm', part, tube(main, [0.028, 0.02, 0.0], sides=5, cap_start=True), twig)
        k.add('arm', part, tube([main[1], main[1] + Vector((0.06 * side, -0.02, 0.1))], [0.016, 0.0], sides=4,
                                cap_start=True), twig)
        k.add('arm', part, tube([main[1] + Vector((0.05 * side, 0, -0.01)), main[1] + Vector((0.12 * side, -0.02, -0.1))],
                                [0.014, 0.0], sides=4, cap_start=True), twig)
    for side, part in ((-1, 'leg-left'), (1, 'leg-right')):
        k.add('leg', part, shell_leg(side, 0.03, bottom=0.3, rows=3), snow)
        k.add('leg', part, boot(side, 0.03, shaft=0.36), snow)
    return k


BUILDERS = {'dz_ninja': dz_ninja, 'dz_mage': dz_mage, 'dz_knight': dz_knight, 'dz_mecha': dz_mecha,
            'dz_dino': dz_dino, 'dz_fairy': dz_fairy, 'dz_pirate': dz_pirate, 'dz_superhero': dz_superhero,
            'dz_vampire': dz_vampire, 'dz_snowman': dz_snowman}


def build_costume(did, prefix=''):
    """Objects for one disguise: an empty named the id holding the tagged meshes (explorer space)."""
    k = BUILDERS[did]()
    root = bpy.data.objects.new(prefix + did, None)
    root.empty_display_size = 0.2
    bpy.context.scene.collection.objects.link(root)
    objs = []
    for name in sorted(k.pieces):
        o = k.pieces[name].build((0, 0, 0), prefix + name)
        o.data.name = o.name
        o.parent = root
        objs.append(o)
    return k, root, objs

# ================================================================ contract
def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return dict(min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi])


def gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4) + 0.0]


def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def world_points(obj):
    mw = obj.matrix_world
    return [mw @ v.co for v in obj.data.vertices]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


def envelope_excess(part, p):
    """How far (m) a point of a hero part sits outside the gear envelope of hero_spec."""
    if part == 'head':
        return max(0.0, (p - C).length - HS.HAIR_RADIUS)
    if part == 'head-leaf':
        return max(0.0, p.z - HS.SPROUT_TOP_Z, Vector((p.x, p.y, 0)).length - 0.3, 1.9 - p.z)
    if part == 'body':
        z = min(max(p.z, T['bottom_z']), T['top_z'])
        rho = Vector((p.x, p.y, 0)).length
        cone_x = max(0.0, rho - env_r(z), T['bottom_z'] - p.z, p.z - T['top_z'])
        c, s = Vector(HS.BACKPACK['centre']), HS.BACKPACK['size']
        box_x = Vector([max(0.0, abs(p[i] - c[i]) - s[i] / 2) for i in range(3)]).length
        head_x = max(0.0, (p - C).length - HR)
        return min(cone_x, box_x, head_x)
    if part.startswith('arm'):
        side = -1 if part.endswith('left') else 1
        a = Vector(HS.PIVOTS[part])
        d, t = seg_dist(p, a, a - Vector((0, 0, HS.ARM['length'])))
        r = HS.ARM['radius_top'] + (HS.ARM['radius_bottom'] - HS.ARM['radius_top']) * t
        hand = Vector((0.37 * side, -0.02, 0.75))
        return min(max(0.0, d - r), max(0.0, (p - hand).length - HS.ARM['hand_radius']))
    if part.startswith('leg'):
        a = Vector(HS.PIVOTS[part])
        foot = Vector((a.x, HS.LEG['foot_forward'], HS.LEG['foot_centre_z']))
        d, _ = seg_dist(p, a + Vector((0, 0, 0.04)), Vector((a.x, 0, foot.z)))
        return min(max(0.0, d - HS.LEG['radius']), max(0.0, (p - foot).length - HS.LEG['foot_radius']))
    return 0.0


def hero_stats(objs):
    stats, failures = {}, []
    root = objs['hero']
    if root.parent is not None or root.matrix_world.translation.length > 1e-6:
        failures.append('hero root must sit at the origin with no parent')
    total, mats = 0, set()
    for name in PARTS + ('head-leaf',):
        o = objs[name]
        tris = mesh_tris(o)
        total += tris
        pts = world_points(o)
        mats |= {m.name for m in o.data.materials}
        pivot = o.matrix_world.translation
        excess = max(envelope_excess(name, p) for p in pts)
        stats[name] = dict(parent=o.parent.name, triangles=tris, materials=[m.name for m in o.data.materials],
                           origin=[round(c, 4) for c in pivot], origin_gltf=gltf(pivot), bounds=bounds(pts),
                           envelope_excess=round(excess, 4))
        if name in HS.PIVOTS:
            if o.parent is not root:
                failures.append(f'{name} must be a child of hero')
            if (pivot - Vector(HS.PIVOTS[name])).length > PIVOT_TOL:
                failures.append(f'{name} origin {tuple(round(c, 4) for c in pivot)} != pivot {HS.PIVOTS[name]}')
        elif o.parent is not objs['head']:
            failures.append('head-leaf must be a child of head')
        m3 = o.matrix_world.to_3x3()
        if any(abs(m3[i][j] - (1.0 if i == j else 0.0)) > 1e-6 for i in range(3) for j in range(3)):
            failures.append(f'{name} has rotation or scale (apply it)')
        if o.data.name != o.name:
            failures.append(f'{name}: mesh data is named {o.data.name}')
        if excess > ENVELOPE_TOL:
            failures.append(f'{name} leaves the envelope by {excess:.3f} m')
    for hand, arm in (('hand-left', 'arm-left'), ('hand-right', 'arm-right')):
        e = objs[hand]
        where = e.matrix_world.translation
        stats[hand] = dict(parent=e.parent.name, origin=[round(c, 4) for c in where], origin_gltf=gltf(where))
        if e.parent is not objs[arm]:
            failures.append(f'{hand} must be a child of {arm}')
        if (where - Vector(HS.HANDS[hand])).length > PIVOT_TOL:
            failures.append(f'{hand} at {tuple(round(c, 4) for c in where)} != {HS.HANDS[hand]}')
    if total > HERO_TRI_LIMIT:
        failures.append(f'hero has {total} triangles (> {HERO_TRI_LIMIT})')
    if mats != set(HERO_MATERIALS):
        failures.append(f'hero materials {sorted(mats)} != contract {sorted(HERO_MATERIALS)}')
    return dict(triangles=total, parts=stats, materials=sorted(mats)), failures


def read_glb_json(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    length, kind = struct.unpack_from('<I4s', data, 12)
    if kind != b'JSON':
        raise ValueError(f'{path}: first chunk is not JSON')
    return json.loads(data[20:20 + length].decode('utf-8'))


def glb_tris(doc, mesh_index):
    return sum(doc['accessors'][p['indices']]['count'] // 3 for p in doc['meshes'][mesh_index]['primitives'])


def check_hero_glb(path):
    """Re-read the exported file: hierarchy, pivots, names and materials as the game will see them."""
    doc = read_glb_json(path)
    failures = []
    nodes = doc['nodes']
    by_name = {n.get('name'): i for i, n in enumerate(nodes)}
    roots = [nodes[i].get('name') for i in doc['scenes'][doc.get('scene', 0)]['nodes']]
    if roots != ['hero']:
        failures.append(f"hero.glb scene roots are {roots}, expected ['hero']")
    hero = nodes[by_name.get('hero', 0)]
    kids = {nodes[i]['name']: i for i in hero.get('children', [])}
    for name in PARTS:
        if name not in kids:
            failures.append(f'hero.glb: {name} is not a child of hero')
            continue
        n = nodes[kids[name]]
        want, got = gltf(HS.PIVOTS[name]), n.get('translation', [0, 0, 0])
        if max(abs(a - b) for a, b in zip(want, got)) > PIVOT_TOL or 'rotation' in n or 'scale' in n:
            failures.append(f'hero.glb: {name} translation {got} != {want}')
        if doc['meshes'][n['mesh']].get('name') != name:
            failures.append(f"hero.glb: {name} mesh is named {doc['meshes'][n['mesh']].get('name')}")
    for hand, arm in (('hand-left', 'arm-left'), ('hand-right', 'arm-right')):
        if by_name.get(hand) not in nodes[by_name[arm]].get('children', []):
            failures.append(f'hero.glb: {hand} is not a child of {arm}')
            continue
        want = gltf(Vector(HS.HANDS[hand]) - Vector(HS.PIVOTS[arm]))
        got = nodes[by_name[hand]].get('translation', [0, 0, 0])
        if max(abs(a - b) for a, b in zip(want, got)) > PIVOT_TOL:
            failures.append(f'hero.glb: {hand} translation {got} != {want}')
    if by_name.get('head-leaf') not in nodes[by_name['head']].get('children', []):
        failures.append('hero.glb: head-leaf is not a child of head')
    names = sorted(m['name'] for m in doc.get('materials', []))
    if names != sorted(HERO_MATERIALS):
        failures.append(f'hero.glb materials {names}')
    tris = sum(glb_tris(doc, n['mesh']) for n in nodes if 'mesh' in n)
    return dict(nodes=[n.get('name') for n in nodes], triangles=tris), failures


def check_disguises_glb(path):
    doc = read_glb_json(path)
    failures, per = [], {}
    nodes = doc['nodes']
    roots = [nodes[i] for i in doc['scenes'][doc.get('scene', 0)]['nodes']]
    names = sorted(n.get('name') for n in roots)
    if names != sorted(DISGUISE_IDS):
        failures.append(f'disguises.glb roots {names}')
    for n in roots:
        if any(k in n for k in ('translation', 'rotation', 'scale', 'matrix')):
            failures.append(f"{n['name']}: top node has a transform")
        tris = 0
        for c in n.get('children', []):
            child = nodes[c]
            tag = child['name'].rsplit('@', 1)
            if len(tag) != 2 or tag[1] not in TAGS:
                failures.append(f"{child['name']}: missing or unknown @part tag")
            if any(k in child for k in ('translation', 'rotation', 'scale')):
                failures.append(f"{child['name']}: piece has a transform")
            tris += glb_tris(doc, child['mesh'])
        per[n['name']] = tris
        if tris > DZ_TRI_LIMIT:
            failures.append(f"{n['name']}: {tris} triangles (> {DZ_TRI_LIMIT})")
    return per, failures


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


def tree(root):
    return [root] + sorted(root.children_recursive, key=lambda o: o.name)

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


def stage(size, ground='#7DD957', transparent=False, world=0.55, exposure=-0.35):
    _clear_stage()
    studio(ground_color=None if transparent else ground, size=size, transparent=transparent)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = world
    scene.view_settings.exposure = exposure
    scene.render.filter_size = 1.2
    _eevee(48)


def camera(elevation, yaw, target=(0, 0, 1.1), ortho=3.0, distance=20.0):
    data = bpy.data.cameras.new('Preview camera')
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    data.clip_end = 200
    cam = bpy.data.objects.new('Preview camera', data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elevation), RAD(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.location = Vector(target) + d * distance
    bpy.context.scene.camera = cam
    return cam


def fit(cam, objs, margin=1.08, zmin=None):
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ p for o in objs if o.type == 'MESH' and not o.hide_render for p in world_points(o)
           if zmin is None or p.z >= zmin]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    cam.location = cam.location + cam.matrix_world.to_3x3() @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    scene = bpy.context.scene
    w, h = scene.render.resolution_x, scene.render.resolution_y
    need_w, need_h = (x1 - x0) * margin, (y1 - y0) * margin
    cam.data.ortho_scale = max(need_w, need_h * w / h) if w >= h else max(need_h, need_w * h / w)
    return cam


def render_png(path):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if scene.render.film_transparent else 'RGB'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def composite(paths, layout, size, out_path, bg='#FFF6E3'):
    import numpy as np
    canvas = np.ones((size[1], size[0], 4), dtype=np.float32)
    canvas[..., :3] = np.array(style.rgba(bg)[:3]) ** (1 / 2.2)
    for p, (x, y) in zip(paths, layout):
        im = bpy.data.images.load(p)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]
        region = canvas[y:y + im.size[1], x:x + im.size[0]]
        a = px[..., 3:4]
        region[..., :3] = px[..., :3] * a + region[..., :3] * (1 - a)
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


def remove_tree(root):
    for o in [root] + list(root.children_recursive):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)


def dress(hero, did, prefix):
    """Put a disguise on a built hero: each piece parented to the part its tag names."""
    k, root, objs = build_costume(did, prefix=prefix)
    for o in objs:
        part = o.name.rsplit('@', 1)[1]
        target = hero.get(part, hero['hero'])
        o.parent = target
        o.matrix_parent_inverse = target.matrix_world.inverted()
    bpy.data.objects.remove(root, do_unlink=True)
    if k.hides_leaf:
        hero['head-leaf'].hide_render = True
    return k, objs


def pose(hero, loc=(0, 0, 0), yaw=0.0, splay=ARM_SPLAY, walk=0.0):
    hero['arm-left'].rotation_euler = (-walk * 0.8, splay, 0)
    hero['arm-right'].rotation_euler = (walk * 0.8, -splay, 0)
    hero['leg-left'].rotation_euler = (walk * 0.7, 0, 0)
    hero['leg-right'].rotation_euler = (-walk * 0.7, 0, 0)
    hero['hero'].location = loc
    hero['hero'].rotation_euler = (0, 0, yaw)
    bpy.context.view_layer.update()


def spawn(tag, shirt=SHIRT, did=None, loc=(0, 0, 0), yaw=0.0, walk=0.0):
    suffix = '' if shirt == SHIRT else ' ' + shirt
    hero = make_hero(hero_materials(shirt, suffix), prefix=tag + ' ')
    extra = dress(hero, did, tag + ' ')[1] if did else []
    pose(hero, loc, yaw, walk=walk)
    return hero, [o for o in list(hero.values()) + extra if o.type == 'MESH']


def preview_hero():
    tmp = os.path.join(GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    paths, layout = [], []
    hero, meshes = spawn('pv')
    for i, (label, elev, yaw) in enumerate((('front', 12, -32), ('back', 18, 148), ('high', 42.16, 0))):
        stage((400, 500), ground='#8FE06A')
        cam = camera(elev, yaw)
        fit(cam, meshes, 1.12)
        paths.append(render_png(os.path.join(tmp, f'hero_{label}.png')))
        layout.append((i * 400, 0))
        bpy.data.objects.remove(cam, do_unlink=True)
    remove_tree(hero['hero'])
    heroes = []
    for i, colour in enumerate(PLAYER_COLORS):
        h, _ = spawn(f'c{i}', colour, loc=((i - 2.5) * 3.0, 0, 0), yaw=RAD((-20, 10, -5, 25, 0, -15)[i]),
                     walk=(0.0, 0.6, 0.0, -0.5, 0.3, 0.0)[i])
        heroes.append(h)
    stage((1200, 300), ground='#7DD957')
    camera(42.16, 0, target=(0, 0, 0.9), ortho=21.8, distance=40)
    paths.append(render_png(os.path.join(tmp, 'hero_game.png')))
    layout.append((0, 500))
    for h in heroes:
        remove_tree(h['hero'])
    composite(paths, layout, (1200, 800), os.path.join(PREVIEWS, 'hero.webp'))


def preview_disguises():
    tmp = os.path.join(GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    paths, layout = [], []
    for i, did in enumerate(DISGUISE_IDS):
        hero, meshes = spawn(f'd{i}', did=did)
        stage((240, 330), ground='#8FE06A')
        cam = camera(16, -30)
        fit(cam, meshes, 1.1)
        paths.append(render_png(os.path.join(tmp, f'dz_{i}.png')))
        layout.append(((i % 5) * 240, (i // 5) * 330))
        bpy.data.objects.remove(cam, do_unlink=True)
        remove_tree(hero['hero'])
    crowd = []
    for i, did in enumerate(DISGUISE_IDS):
        h, _ = spawn(f'g{i}', PLAYER_COLORS[i % 6], did=did, loc=((i - 4.5) * 2.1, 0, 0),
                     yaw=RAD(((i * 37) % 50) - 25))
        crowd.append(h)
    stage((1200, 260), ground='#7DD957')
    camera(42.16, 0, target=(0, 0, 0.9), ortho=22.0, distance=40)
    paths.append(render_png(os.path.join(tmp, 'dz_game.png')))
    layout.append((0, 660))
    for h in crowd:
        remove_tree(h['hero'])
    composite(paths, layout, (1200, 920), os.path.join(PREVIEWS, 'disguises.webp'))


def save_webp_under(path, limit):
    scene = bpy.context.scene
    img = bpy.data.images['Render Result']
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    for q in (90, 85, 80, 75, 70, 64, 58, 50):
        scene.render.image_settings.quality = q
        img.save_render(filepath=path, scene=scene)
        if os.path.getsize(path) < limit:
            break
    return q


def render_icons():
    os.makedirs(ICONS, exist_ok=True)
    written = {}
    for did in [None] + DISGUISE_IDS:
        name = did or 'hero'
        hero, meshes = spawn('ic', did=did)
        stage((160, 160), transparent=True, world=0.6, exposure=-0.15)
        for light in bpy.data.objects:
            if light.type == 'LIGHT':
                try:
                    light.data.angle = RAD(22)
                except AttributeError:
                    pass
        cam = camera(20, -30)
        fit(cam, meshes, 1.03, zmin=0.42)   # knees up: the head and chest carry each look
        bpy.ops.render.render(write_still=False)
        path = os.path.join(ICONS, name + '.webp')
        q = save_webp_under(path, ICON_LIMIT)
        written[name] = dict(bytes=os.path.getsize(path), quality=q)
        bpy.data.objects.remove(cam, do_unlink=True)
        remove_tree(hero['hero'])
    return written


def contact_sheet(names, out_path):
    """Icons on cream cards: full size on top, the ~52 px UI size underneath."""
    import numpy as np
    cell, small, pad, cols = 176, 52, 8, 6
    rows = math.ceil(len(names) / cols)
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
    for i, name in enumerate(names):
        img = bpy.data.images.load(os.path.join(ICONS, name + '.webp'))
        px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)[::-1]
        paste(px, (i % cols) * cell + (cell - img.size[0]) // 2, (i // cols) * ch + pad)
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


def debug_views(out_dir):
    """--debug DIR: fit checks for every look (plain hero first): back 3/4 at rest, front 3/4 mid-stride,
    side view with arms raised, and the high game camera close up."""
    os.makedirs(out_dir, exist_ok=True)
    reset_scene()
    looks = [None] + DISGUISE_IDS
    for label, elev, yaw, walk, lift in (('back', 20, 150, 0.0, 0.0), ('walk', 14, -35, 0.8, 0.0),
                                        ('side', 8, 90, 0.0, 1.6), ('high', 42.16, 0, 0.0, 0.0)):
        paths, layout = [], []
        for i, did in enumerate(looks):
            hero, meshes = spawn(f'x{i}', did=did, walk=walk)
            if lift:
                hero['arm-right'].rotation_euler = (-lift, -0.1, 0)
                hero['arm-left'].rotation_euler = (lift * 0.5, 0.1, 0)
                bpy.context.view_layer.update()
            stage((200, 260), ground='#8FE06A')
            cam = camera(elev, yaw)
            fit(cam, meshes, 1.08)
            paths.append(render_png(os.path.join(out_dir, f'_{label}_{i}.png')))
            layout.append(((i % 6) * 200, (i // 6) * 260))
            bpy.data.objects.remove(cam, do_unlink=True)
            remove_tree(hero['hero'])
        composite(paths, layout, (1200, 520), os.path.join(out_dir, f'debug-{label}.webp'))


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
        elif a == '--debug':
            opts['debug'] = argv[i + 1]
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
    if opts['only'] not in (None, 'hero', 'disguises', 'icons'):
        raise SystemExit('--only must be hero, disguises or icons')
    return opts


def run_hero(opts, manifest, failures):
    reset_scene()
    objs = make_hero(hero_materials())
    stats, fails = hero_stats(objs)
    print(f"\n== hero: {stats['triangles']} tris")
    for name, s in stats['parts'].items():
        if 'triangles' in s:
            print(f"  {name:10s} {s['triangles']:5d} tris  origin {s['origin']}  envelope +{s['envelope_excess']:.3f}")
    path = os.path.join(MODELS, 'hero.glb')
    os.makedirs(MODELS, exist_ok=True)
    size = export_glb(tree(objs['hero']), path)
    print(f'  hero.glb {size} bytes')
    if size > HERO_GLB_LIMIT:
        fails.append(f'hero.glb is {size} bytes (> {HERO_GLB_LIMIT})')
    glb, glb_fails = check_hero_glb(path)
    fails += glb_fails
    manifest['hero'] = dict(file='hero.glb', bytes=size, triangles=stats['triangles'], materials=stats['materials'],
                            hierarchy={'hero': list(PARTS), 'arm-left': ['hand-left'], 'arm-right': ['hand-right'],
                                       'head': ['head-leaf']},
                            leaf_origin=[round(c, 4) for c in LEAF_ORIGIN], arm_splay_at_rest=ARM_SPLAY,
                            nodes=stats['parts'], glb=glb)
    failures += fails
    if opts['render'] and not fails:
        remove_tree(objs['hero'])
        preview_hero()
    return not fails


def run_disguises(opts, manifest, failures):
    reset_scene()
    per, roots = {}, []
    print('\n== disguises')
    for did in DISGUISE_IDS:
        k, root, objs = build_costume(did)
        roots.append(root)
        pieces = {o.name: dict(tag=o.name.rsplit('@', 1)[1], triangles=mesh_tris(o),
                               materials=[m.name for m in o.data.materials], bounds=bounds(world_points(o)))
                  for o in objs}
        tris = sum(p['triangles'] for p in pieces.values())
        per[did] = dict(name=dict(DISGUISES)[did], triangles=tris, hides_leaf=k.hides_leaf, pieces=pieces)
        print(f'  {did:14s} {tris:5d} tris  ' + ', '.join(f"{n[len(did) + 1:]}:{p['triangles']}" for n, p in pieces.items()))
        if tris > DZ_TRI_LIMIT:
            failures.append(f'{did} has {tris} triangles (> {DZ_TRI_LIMIT})')
    path = os.path.join(MODELS, 'disguises.glb')
    size = export_glb([o for r in roots for o in tree(r)], path)
    print(f'  disguises.glb {size} bytes')
    if size > DZ_GLB_LIMIT:
        failures.append(f'disguises.glb is {size} bytes (> {DZ_GLB_LIMIT})')
    glb, fails = check_disguises_glb(path)
    failures += fails
    manifest['disguises'] = dict(file='disguises.glb', bytes=size, items=per, glb_triangles=glb)
    if opts['render']:
        for r in roots:
            remove_tree(r)
        preview_disguises()


def run_icons(opts, manifest, failures):
    reset_scene()
    sizes = render_icons()
    for name, s in sizes.items():
        if s['bytes'] >= ICON_LIMIT:
            failures.append(f"icon {name}.webp is {s['bytes']} bytes (>= {ICON_LIMIT})")
    manifest['icons'] = dict(dir='icons/items', size=[160, 160], files=sizes)
    if opts['render']:
        contact_sheet(['hero'] + DISGUISE_IDS, os.path.join(PREVIEWS, 'disguises-icons.webp'))


def main():
    opts = parse_args()
    sections = [opts['only']] if opts['only'] else ['hero', 'disguises', 'icons']
    manifest = load_manifest()
    manifest['generator'] = 'art/blender/kit/build_hero.py'
    manifest['blender'] = bpy.app.version_string
    manifest['coordinates'] = ('Blender Z up, explorer facing -Y (glTF Y up, facing +Z); metres; part origins are '
                               'hero_spec.PIVOTS; disguise pieces are modelled in explorer space at rest pose')
    failures = []
    if opts['debug']:
        debug_views(opts['debug'])
        return
    for section, run in (('hero', run_hero), ('disguises', run_disguises), ('icons', run_icons)):
        if section in sections:
            run(opts, manifest, failures)
    tmp = os.path.join(GEN, '_tmp')
    if os.path.isdir(tmp) and not os.listdir(tmp):
        os.rmdir(tmp)
    save_manifest(manifest)
    if failures:
        raise RuntimeError('Hero kit contract failures:\n  ' + '\n  '.join(failures))
    if opts['install']:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        for section, name in (('hero', 'hero.glb'), ('disguises', 'disguises.glb')):
            if section in sections:
                shutil.copy2(os.path.join(MODELS, name), os.path.join(PUBLIC_MODELS, name))
                print('installed', name)
        if 'icons' in sections:
            os.makedirs(PUBLIC_ICONS, exist_ok=True)
            for name in ['hero'] + DISGUISE_IDS:
                shutil.copy2(os.path.join(ICONS, name + '.webp'), os.path.join(PUBLIC_ICONS, name + '.webp'))
            print('installed', 1 + len(DISGUISE_IDS), 'icons')
    print('\nHero kit OK')


if __name__ == '__main__':
    main()
