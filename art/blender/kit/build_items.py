"""Zoo Garden item kit: little 3D models for the non-equipment items and their icons.

Seeds, crafting materials, foods and farm items are small glossy toys built from the shared
style.py primitives plus a few lofted shapes (tubes, puffy outlines, chamfered slabs, rocks and
crystals). Each item is one joined mesh named exactly its id, with 2-5 materials named
`Item <id> <part>`, at most 800 triangles, its base at z 0 and centred on the origin. The icon is
a 160 x 160 transparent WebP in the same 3/4 view and light as the crop and fish icons.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_items.py -- \
        [--only id1,id2,...] [--install] [--render]

Outputs:
    art/generated/kit/models/items.glb            (every id, only when all ids are built)
    art/generated/kit/icons/items/<id>.webp       (160 x 160, transparent, < 8 KB)
    art/generated/kit/items-manifest.json         (per id: triangles, materials, size, icon bytes)
    art/previews/kit/item-icons.webp              (--render: full size and 52 px on cream cards)
--install copies the icons to public/assets/icons/items/ (the GLB is not installed).

Blender is Z up with the front toward -Y; glTF exports are Y up with the front toward +Z.
Output is deterministic: seeded randomness, triangulated and sorted faces (as build_fish.py).
"""
import bpy
import bmesh
import json
import math
import os
import random
import shutil
import sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import (box, cone, cyl, export_glb, extrude_outline, ico, join, lathe, mat, place,  # noqa: E402
                   reset_scene, sphere, studio, torus, triangles)

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
ICONS = os.path.join(GEN, 'icons', 'items')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'items-manifest.json')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')

SEEDS = ['seed_fire', 'seed_ice', 'seed_star']
MATERIALS = ['leather', 'bone', 'tusk', 'sap', 'spine', 'sugar', 'icecrystal', 'magma', 'starshard', 'mcrystal',
             'obsidian', 'firecore', 'dragonscale', 'fcrystal', 'gear', 'battery', 'vine', 'amber', 'pearl', 'coral',
             'feather', 'thunderstone', 'shadow', 'moonstone', 'dragonegg', 'wood']
FOODS = ['meat', 'claw', 'nectar', 'cwater', 'bloom', 'honey', 'potion']
FARM = ['manure', 'spore', 'worm', 'plot_kit']
ITEM_IDS = SEEDS + MATERIALS + FOODS + FARM
TRI_LIMIT = 800
MAT_RANGE = (2, 5)
ICON_SIZE = 160
ICON_LIMIT = 8 * 1024
ITEM_SCALE = 0.35       # items are authored about 1 unit across; the GLB holds them at ~0.35 m
ICON_DEFAULT = dict(yaw=24, elevation=34, margin=1.2)
TAU = math.tau
RAD = math.radians


# ================================================================ geometry
def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh(name, verts, faces, material=None, smooth_angle=60, flat=False, mats=None, face_mats=None):
    """A mesh object from raw verts/faces; normals made consistent, smooth up to `smooth_angle`."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(v)) for v in verts]
    for i, f in enumerate(faces):
        face = bm.faces.new([vs[j] for j in f])
        if face_mats:
            face.material_index = face_mats[i]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in (mats or [material]):
        me.materials.append(m)
    obj = link(bpy.data.objects.new(name, me))
    if flat:
        for p in me.polygons:
            p.use_smooth = False
    else:
        style.smooth(obj, smooth_angle)
    return obj


def loft(name, rings, material, start=None, end=None, cap=True, **kw):
    """Skin equal-sized rings of points; fan to `start`/`end` points or cap the open ends."""
    k = len(rings[0])
    verts, faces = [], []
    for r in rings:
        verts += [tuple(p) for p in r]
    for i in range(len(rings) - 1):
        for j in range(k):
            a, b = i * k + j, i * k + (j + 1) % k
            faces.append((a, b, b + k, a + k))
    if start is not None:
        s = len(verts)
        verts.append(tuple(start))
        faces += [(s, (j + 1) % k, j) for j in range(k)]
    elif cap:
        faces.append(tuple(reversed(range(k))))
    last = (len(rings) - 1) * k
    if end is not None:
        e = len(verts)
        verts.append(tuple(end))
        faces += [(last + j, last + (j + 1) % k, e) for j in range(k)]
    elif cap:
        faces.append(tuple(range(last, last + k)))
    return mesh(name, verts, faces, material, **kw)


def frames(pts):
    """Parallel-transport frames (tangent, normal, binormal) along a polyline."""
    n = len(pts)
    tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    t0 = tans[0]
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - t0 * ref.dot(t0)).normalized()
    out = []
    for t in tans:
        nrm = (nrm - t * nrm.dot(t)).normalized()
        out.append((t, nrm, t.cross(nrm)))
    return out


def tube(name, pts, radii, material, sides=8, start_tip=False, end_tip=False, cap=True, flat=1.0, **kw):
    """A tube along `pts`; radii per point. *_tip makes that end point a single cone tip."""
    pts = [Vector(p) for p in pts]
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    fr = frames(pts)
    idx = list(range(len(pts)))
    start = end = None
    if start_tip:
        start = pts[0]
        idx = idx[1:]
    if end_tip:
        end = pts[-1]
        idx = idx[:-1]
    rings = []
    for i in idx:
        t, nv, bv = fr[i]
        rings.append([pts[i] + (nv * math.cos(TAU * j / sides) * flat + bv * math.sin(TAU * j / sides)) * radii[i]
                      for j in range(sides)])
    return loft(name, rings, material, start=start, end=end, cap=cap, **kw)


def centroid(outline):
    return (sum(p[0] for p in outline) / len(outline), sum(p[1] for p in outline) / len(outline))


def puffy(name, outline, thick, material, inner=0.55, centre=None, **kw):
    """A pillowy solid from a star-shaped 2D outline lying in XY, `thick` above and below z 0."""
    cx, cy = centre or centroid(outline)

    def ring(s, z):
        return [(cx + (x - cx) * s, cy + (y - cy) * s, z) for x, y in outline]
    rings = [ring(inner, -thick * 0.8), ring(0.9, -thick * 0.5), ring(1.0, 0.0), ring(0.9, thick * 0.5),
             ring(inner, thick * 0.8)]
    return loft(name, rings, material, start=(cx, cy, -thick), end=(cx, cy, thick), **kw)


def slab(name, outline, thick, material, chamfer=0.1, centre=None, smooth_angle=50, **kw):
    """A flat solid with chamfered rims from a star-shaped outline in XY (z from -thick to +thick)."""
    cx, cy = centre or centroid(outline)

    def ring(s, z):
        return [(cx + (x - cx) * s, cy + (y - cy) * s, z) for x, y in outline]
    c = chamfer
    rings = [ring(1 - c, -thick), ring(1, -thick * 0.55), ring(1, thick * 0.55), ring(1 - c, thick)]
    return loft(name, rings, material, start=(cx, cy, -thick), end=(cx, cy, thick),
                smooth_angle=smooth_angle, **kw)


def star_outline(points, r_out, r_in, phase=90.0, sub=0):
    pts = []
    for i in range(points * 2):
        a = RAD(phase) + i * math.pi / points
        r = r_out if i % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    if sub:
        out = []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            for s in range(sub + 1):
                t = s / (sub + 1)
                out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
        pts = out
    return pts


def heart_outline(n=24, size=1.0):
    pts = []
    for i in range(n):
        t = math.pi / 2 + i * TAU / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17 * size, (y + 2) / 17 * size))
    return pts


def gear_outline(teeth, r_out, r_in, duty=0.45):
    pts = []
    step = TAU / teeth
    for i in range(teeth):
        a = i * step
        w = step * duty / 2
        pts += [(r_in * math.cos(a - step / 2 + 0.02), r_in * math.sin(a - step / 2 + 0.02)),
                (r_out * math.cos(a - w), r_out * math.sin(a - w)),
                (r_out * math.cos(a + w), r_out * math.sin(a + w)),
                (r_in * math.cos(a + step / 2 - 0.02), r_in * math.sin(a + step / 2 - 0.02))]
    return pts


def circle(n, r, sx=1.0, sy=1.0, phase=0.0):
    return [(r * sx * math.cos(phase + i * TAU / n), r * sy * math.sin(phase + i * TAU / n)) for i in range(n)]


def rock(name, r, material, seed=1, subdiv=1, scale=(1, 1, 1), jitter=0.18, loc=(0, 0, 0), rot=(0, 0, 0),
         flat=True):
    """An irregular faceted stone (icosphere, seeded jitter)."""
    obj = ico(name, r, (0, 0, 0), material, subdiv, smooth_shading=not flat)
    rng = random.Random(seed)
    for v in obj.data.vertices:
        v.co *= 1 + jitter * (rng.random() - 0.5) * 2
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    obj.data.update()
    return place(obj, loc, rot)


def crystal(name, r, h, material, sides=6, tip=0.3, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A faceted crystal prism with a pointed top, base at the local origin."""
    return lathe(name, [(r * 0.75, 0.0), (r, h * 0.12), (r, h * (1 - tip)), (0.0, h)], loc, material,
                 segments=sides, rot=rot, smooth_angle=20)


def leaf(name, length, width, material, loc=(0, 0, 0), rot=(0, 0, 0), bend=0.15, segs=5, thick=0.05):
    """A lens-shaped leaf along +Y from its base, drooping by `bend`, with a raised midrib."""
    rings = []
    for i in range(1, segs):
        t = i / segs
        w = width * math.sin(math.pi * t) ** 0.8
        y, z = length * t, -bend * t * t
        th = thick * (0.4 + 0.6 * math.sin(math.pi * t))
        rings.append([(-w, y, z - th * 0.2), (0, y, z + th), (w, y, z - th * 0.2), (0, y, z - th * 0.6)])
    obj = loft(name, rings, material, start=(0, 0, 0), end=(0, length, -bend), smooth_angle=70)
    return place(obj, loc, rot)


def lean(obj, rx=0.0, ry=0.0, rz=0.0):
    obj.rotation_euler = (RAD(rx), RAD(ry), RAD(rz))
    return obj


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


# ================================================================ items
BUILDERS = {}


def item(iid, **view):
    def deco(fn):
        BUILDERS[iid] = (fn, dict(ICON_DEFAULT, **view))
        return fn
    return deco


class Kit:
    def __init__(self, iid):
        self.id = iid

    def m(self, part, color, rough=0.4, metal=0.0, emit=None, strength=0.0, alpha=1.0):
        m = mat(f'Item {self.id} {part}', color, rough, metal, emit, strength, alpha)
        if alpha < 1:
            # Glass: draw only the front layer so the contents keep their colour.
            m.use_backface_culling = True
            for attr in ('use_transparency_overlap', 'show_transparent_back'):
                try:
                    setattr(m, attr, False)
                except (AttributeError, TypeError):
                    pass
        return m

    def n(self, tag):
        return f'{self.id}_{tag}'

    def parts(self):
        return [o for o in bpy.data.objects if o.name.startswith(self.id + '_') and o.type == 'MESH']


def turn(objs, rx=0.0, ry=0.0, rz=0.0, pivot=(0, 0, 0)):
    """Rotate already placed parts together about `pivot` (degrees, applied X, then Y, then Z)."""
    bpy.context.view_layer.update()
    p = Vector(pivot)
    m = (Matrix.Translation(p) @ Matrix.Rotation(RAD(rz), 4, 'Z') @ Matrix.Rotation(RAD(ry), 4, 'Y')
         @ Matrix.Rotation(RAD(rx), 4, 'X') @ Matrix.Translation(-p))
    for o in objs:
        o.matrix_world = m @ o.matrix_world


def world_point(obj, local):
    bpy.context.view_layer.update()
    return obj.matrix_world @ Vector(local)


def flame(name, material, height=0.5, width=0.13, curl=0.07, sides=8, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A curling flame lick standing on its base."""
    ts = [0.0, 0.18, 0.4, 0.62, 0.82, 1.0]
    radii = [0.7, 1.0, 0.9, 0.6, 0.3, 0.0]
    pts = [(curl * math.sin(math.pi * t * 1.4), 0.0, height * t) for t in ts]
    obj = tube(name, pts, [width * r for r in radii], material, sides=sides, end_tip=True, smooth_angle=80)
    return place(obj, loc, rot)


def sparkle(name, material, r=0.12, loc=(0, 0, 0), rot=(RAD(90), 0, 0), thick=0.025):
    """A little four-point twinkle, standing and facing -Y by default."""
    obj = puffy(name, star_outline(4, r, r * 0.3, phase=90), thick, material, inner=0.4)
    return place(obj, loc, rot)


SEED_PROFILE = [(0.0, 0.0), (0.14, 0.02), (0.25, 0.09), (0.31, 0.22), (0.3, 0.38), (0.24, 0.54), (0.14, 0.68),
                (0.0, 0.84)]
SEED_FLAT = 0.72   # almond cross-section: seeds are flatter front to back


def seed_body(name, material, segs=16):
    obj = lathe(name, SEED_PROFILE, (0, 0, 0), material, segments=segs, smooth_angle=75)
    obj.scale = (1.0, SEED_FLAT, 1.0)
    return obj


def seed_stripe(name, material, side=0.0, r=0.035):
    """A raised seam line down the seed's front, half sunk into the shell."""
    a = RAD(-90 + side)
    pts = [(rr * 0.97 * math.cos(a), rr * 0.97 * SEED_FLAT * math.sin(a), z) for rr, z in SEED_PROFILE[1:-1]]
    return tube(name, pts, [r * 0.4, r, r, r, r * 0.8, r * 0.4], material, sides=5)


# ------------------------------------------------------------------ seeds
@item('seed_fire', yaw=20, elevation=30)
def b_seed_fire(k):
    shell = k.m('shell', '#FF3F1F', 0.3, emit='#FF2A00', strength=0.35)
    stripe = k.m('stripe', '#FFB347', 0.35, emit='#FF8A1A', strength=0.4)
    fire = k.m('flame', '#FFC928', 0.35, emit='#FFA200', strength=1.1)
    seed_body(k.n('body'), shell)
    seed_stripe(k.n('stripe_a'), stripe, -24)
    seed_stripe(k.n('stripe_b'), stripe, 24)
    flame(k.n('flame'), fire, 0.52, 0.12, curl=0.09, loc=(0, 0, 0.7), rot=(0, RAD(-10), 0))
    flame(k.n('flame_l'), fire, 0.3, 0.08, curl=0.05, loc=(-0.07, 0, 0.62), rot=(0, RAD(-40), 0))
    turn(k.parts(), ry=22)


@item('seed_ice', yaw=20, elevation=30)
def b_seed_ice(k):
    shell = k.m('shell', '#5FC4FF', 0.28, emit='#3AAFFF', strength=0.25)
    ice = k.m('crystal', '#E4FAFF', 0.12, emit='#A8E8FF', strength=0.45)
    frost = k.m('frost', '#FFFFFF', 0.5, emit='#DDF4FF', strength=0.2)
    seed_body(k.n('body'), shell)
    seed_stripe(k.n('stripe_a'), frost, -24, 0.028)
    seed_stripe(k.n('stripe_b'), frost, 24, 0.028)
    crystal(k.n('crystal'), 0.1, 0.5, ice, loc=(0.0, 0.0, 0.62), rot=(0, RAD(10), 0))
    crystal(k.n('crystal_l'), 0.07, 0.32, ice, loc=(-0.07, 0.02, 0.6), rot=(RAD(-10), RAD(-40), 0))
    crystal(k.n('crystal_r'), 0.06, 0.28, ice, loc=(0.08, -0.02, 0.58), rot=(RAD(8), RAD(48), 0))
    for i, (a, z) in enumerate(((210, 0.24), (330, 0.4), (235, 0.5))):
        rr = next(r for r, zz in SEED_PROFILE if zz >= z)
        sphere(k.n(f'fleck{i}'), 0.045, (rr * math.cos(RAD(a)), rr * SEED_FLAT * math.sin(RAD(a)), z), frost, 6, 4)
    turn(k.parts(), ry=-18)


@item('firecore', yaw=20, elevation=28)
def b_firecore(k):
    orb = k.m('orb', '#FF8A1A', 0.25, emit='#FF6A00', strength=1.1)
    outer = k.m('flame', '#FF4A1A', 0.35, emit='#FF2A00', strength=0.8)
    inner = k.m('flame inner', '#FFD23A', 0.35, emit='#FFB000', strength=1.0)
    cage = k.m('cage', '#F5B21E', 0.28, 0.5)
    sphere(k.n('orb'), 0.34, (0, 0, 0.4), orb, 14, 9)
    for i, (tilt, h, w, m, curl) in enumerate(((0, 0.62, 0.17, outer, 0.08), (48, 0.4, 0.12, inner, -0.05),
                                                (-48, 0.42, 0.12, inner, 0.05))):
        base = (0.2 * math.sin(RAD(tilt)), 0.0, 0.4 + 0.2 * math.cos(RAD(tilt)))
        flame(k.n(f'flame{i}'), m, h, w, curl=curl, loc=base, rot=(0, RAD(tilt), 0))
    # An iron cage of two crossed hoops holds the core.
    for i, rz in enumerate((40, -40)):
        torus(k.n(f'hoop{i}'), 0.36, 0.026, (0, 0, 0.4), cage, 16, 4, rot=(RAD(90), 0, RAD(rz)))


@item('seed_star', yaw=20, elevation=28)
def b_seed_star(k):
    gold = k.m('star', '#FFC21F', 0.28, emit='#FFA800', strength=0.4)
    sprout = k.m('sprout', '#58D13E', 0.4)
    twinkle = k.m('twinkle', '#FFF6C8', 0.3, emit='#FFF0A0', strength=1.0)
    star = puffy(k.n('star'), star_outline(5, 0.5, 0.25, sub=1), 0.17, gold, inner=0.5)
    place(star, (0, 0, 0.47), (RAD(90), 0, 0))
    tube(k.n('stem'), [(0, 0, 0.9), (0.01, 0, 1.0), (0.04, 0, 1.08)], 0.03, sprout, sides=6)
    leaf(k.n('leaf_l'), 0.22, 0.08, sprout, loc=(0.04, 0, 1.07), rot=(0, RAD(-20), RAD(95)), bend=0.04, segs=4)
    leaf(k.n('leaf_r'), 0.18, 0.07, sprout, loc=(0.04, 0, 1.07), rot=(0, RAD(25), RAD(-80)), bend=0.04, segs=4)
    sparkle(k.n('tw_a'), twinkle, 0.1, loc=(0.42, -0.05, 0.9))
    sparkle(k.n('tw_b'), twinkle, 0.07, loc=(-0.45, -0.05, 0.2))


# ------------------------------------------------------- crystals and stones
@item('icecrystal', yaw=22, elevation=30)
def b_icecrystal(k):
    ice = k.m('crystal', '#6FD3FF', 0.12)
    pale = k.m('crystal pale', '#CDF3FF', 0.12)
    stone = k.m('rock', '#5F79B8', 0.7)
    snow = k.m('snow', '#F4FAFF', 0.6)
    rock(k.n('rock'), 0.42, stone, seed=3, scale=(1.2, 0.95, 0.42), loc=(0, 0, 0.1))
    style.blob(k.n('snow'), 0.36, (0.02, -0.02, 0.24), snow, scale=(1.15, 0.9, 0.3), subdiv=1, seed=4)
    crystal(k.n('c_main'), 0.17, 1.0, ice, loc=(0, 0.02, 0.1), rot=(RAD(4), RAD(4), RAD(15)))
    crystal(k.n('c_left'), 0.12, 0.66, pale, loc=(-0.2, 0.0, 0.12), rot=(RAD(-6), RAD(-30), RAD(10)))
    crystal(k.n('c_right'), 0.11, 0.55, ice, loc=(0.2, -0.04, 0.12), rot=(RAD(10), RAD(32), RAD(-12)))
    crystal(k.n('c_back'), 0.09, 0.45, pale, loc=(0.06, 0.18, 0.12), rot=(RAD(28), RAD(8), 0))


@item('mcrystal', yaw=24, elevation=30)
def b_mcrystal(k):
    red = k.m('crystal', '#F23A2A', 0.18)
    orange = k.m('crystal glow', '#FF8A2A', 0.2)
    basalt = k.m('rock', '#3E3140', 0.75)
    rock(k.n('rock'), 0.44, basalt, seed=7, scale=(1.25, 1.0, 0.5), loc=(0, 0, 0.12))
    crystal(k.n('c_main'), 0.28, 0.95, red, sides=8, tip=0.36, loc=(0, 0.03, 0.12), rot=(RAD(-6), RAD(12), 0))
    crystal(k.n('c_side'), 0.14, 0.5, orange, sides=6, loc=(-0.3, -0.05, 0.1), rot=(RAD(-8), RAD(-38), 0))
    crystal(k.n('c_small'), 0.1, 0.32, red, sides=6, loc=(0.32, -0.08, 0.1), rot=(RAD(10), RAD(42), 0))


@item('fcrystal', yaw=24, elevation=30)
def b_fcrystal(k):
    body = k.m('crystal', '#FF7A18', 0.2, emit='#FF5A00', strength=0.45)
    tip = k.m('tip', '#FFD23A', 0.2, emit='#FFB000', strength=0.9)
    base = k.m('base', '#B8321E', 0.5)
    lathe(k.n('base'), [(0.0, 0.0), (0.36, 0.0), (0.4, 0.06), (0.34, 0.14), (0.0, 0.16)], (0, 0, 0), base,
          segments=10, smooth_angle=35)
    spec = ((0.0, 0.0, 0.95, 0.13, 0, 0), (-0.16, 0.02, 0.7, 0.1, -8, -30), (0.17, -0.02, 0.62, 0.1, 6, 34),
            (-0.05, -0.16, 0.5, 0.08, 34, -6), (0.08, 0.17, 0.55, 0.08, -30, 12))
    for i, (x, y, h, r, rx, ry) in enumerate(spec):
        rot = (RAD(rx), RAD(ry), RAD(i * 17))
        body_h = h * 0.68
        c = lathe(k.n(f'c{i}'), [(r * 0.75, 0.0), (r, h * 0.1), (r, body_h)], (x, y, 0.1), body, segments=6,
                  rot=rot, smooth_angle=20)
        lathe(k.n(f't{i}'), [(r, 0.0), (0.0, h - body_h)], world_point(c, (0, 0, body_h)), tip, segments=6,
              rot=rot, cap_top=False, smooth_angle=20)


@item('obsidian', yaw=24, elevation=32)
def b_obsidian(k):
    black = k.m('glass', '#1C1A2C', 0.07)
    sheen = k.m('sheen', '#5B4A9E', 0.08)
    obj = rock(k.n('chunk'), 0.5, black, seed=11, subdiv=2, jitter=0.2, scale=(1.25, 0.9, 0.85), loc=(0, 0, 0.4))
    obj.data.materials.append(sheen)
    light = Vector((-0.4, -0.7, 0.6)).normalized()
    for p in obj.data.polygons:
        if p.normal.dot(light) > 0.6 or p.index % 9 == 4:
            p.material_index = 1
    shard = crystal(k.n('shard'), 0.16, 0.5, black, sides=4, tip=0.55, loc=(0.28, 0.08, 0.5),
                    rot=(RAD(12), RAD(38), RAD(20)))
    shard.data.materials.append(sheen)
    for p in shard.data.polygons:
        p.material_index = p.index % 2


@item('magma', yaw=24, elevation=36)
def b_magma(k):
    stone = k.m('rock', '#3A2A2E', 0.8)
    lava = k.m('lava', '#FF6A1A', 0.4, emit='#FF4A00', strength=1.6)
    obj = rock(k.n('rock'), 0.55, stone, seed=5, subdiv=3, jitter=0.07, scale=(1.2, 1.0, 0.78), loc=(0, 0, 0.42))
    obj.data.materials.append(lava)
    planes = [Vector(v).normalized() for v in ((1, 0.3, 0.5), (-0.4, 1, 0.3), (0.2, -0.5, 1))]
    for p in obj.data.polygons:
        c = p.center.normalized()
        if any(abs(c.dot(n)) < 0.065 for n in planes) or c.z > 0.93:
            p.material_index = 1
    for i, (x, y, z, r) in enumerate(((0.22, -0.2, 0.62, 0.09), (-0.25, -0.26, 0.5, 0.07), (0.05, 0.1, 0.8, 0.1))):
        sphere(k.n(f'drop{i}'), r, (x, y, z), lava, 8, 5)


@item('starshard', yaw=24, elevation=30)
def b_starshard(k):
    body = k.m('shard', '#FFD21F', 0.2, emit='#FFB000', strength=0.45)
    core = k.m('core', '#FFF3B0', 0.2, emit='#FFE680', strength=0.8)
    twinkle = k.m('twinkle', '#8C7BFF', 0.3, emit='#6E5CFF', strength=0.6)

    def polar(r, deg):
        return (r * math.cos(RAD(deg)), r * math.sin(RAD(deg)))
    # A cut-crystal star with its lower-left point snapped off; the broken point floats beside it.
    outline = [polar(0.28, 198), polar(0.62, 162), polar(0.28, 126), polar(0.62, 90), polar(0.28, 54),
               polar(0.62, 18), polar(0.28, -18), polar(0.62, -54), polar(0.28, -90), (-0.06, -0.17),
               (-0.13, -0.24), (-0.17, -0.12)]
    star = slab(k.n('star'), outline, 0.12, body, chamfer=0.16, smooth_angle=40)
    place(star, (0, 0, 0.5), (RAD(90), 0, 0))
    tip = slab(k.n('tip'), [(0.0, 0.2), (-0.1, -0.08), (-0.02, -0.03), (0.05, -0.1), (0.1, -0.02)], 0.09, body,
               chamfer=0.2, centre=(0.0, 0.0))
    place(tip, (-0.46, 0.0, 0.04), (RAD(90), RAD(-144), 0))
    bit = slab(k.n('bit'), [polar(0.06, a) for a in (90, 200, 330)], 0.035, core, chamfer=0.2)
    place(bit, (-0.2, -0.02, 0.12), (RAD(90), RAD(25), 0))
    turn(k.parts(), ry=-10, rz=20, pivot=(0, 0, 0.5))
    sparkle(k.n('tw_a'), twinkle, 0.14, loc=(0.46, -0.12, 0.92))
    sparkle(k.n('tw_b'), twinkle, 0.09, loc=(0.52, -0.12, 0.3))


@item('moonstone', yaw=18, elevation=26)
def b_moonstone(k):
    moon = k.m('moon', '#D4CBFF', 0.25, emit='#A898FF', strength=0.5)
    pebble = k.m('pebble', '#6C73B8', 0.6)
    twinkle = k.m('twinkle', '#FFFFFF', 0.3, emit='#E8E4FF', strength=0.9)
    n = 13
    pts, radii = [], []
    for i in range(n):
        t = i / (n - 1)
        a = RAD(-150 + 300 * t)
        pts.append((0.42 * math.sin(a), 0.0, 0.62 - 0.42 * math.cos(a)))
        radii.append(0.02 + 0.2 * math.sin(math.pi * t) ** 1.2)
    tube(k.n('crescent'), pts, radii, moon, sides=10, start_tip=True, end_tip=True, smooth_angle=80)
    rock(k.n('pebble'), 0.3, pebble, seed=9, subdiv=1, jitter=0.12, scale=(1.3, 0.9, 0.45), loc=(0, 0.02, 0.1),
         flat=False)
    sparkle(k.n('tw_a'), twinkle, 0.1, loc=(0.02, -0.05, 0.64))
    sparkle(k.n('tw_b'), twinkle, 0.07, loc=(0.2, -0.05, 0.9))


@item('thunderstone', yaw=20, elevation=28)
def b_thunderstone(k):
    stone = k.m('stone', '#8A4FE8', 0.35)
    band = k.m('stone dark', '#5A2DB0', 0.4)
    bolt = k.m('bolt', '#FFDA2A', 0.3, emit='#FFC000', strength=1.3)
    obj = rock(k.n('stone'), 0.5, stone, seed=13, subdiv=2, jitter=0.07, scale=(1.05, 0.72, 1.0),
               loc=(0, 0, 0.5), flat=False)
    obj.data.materials.append(band)
    for p in obj.data.polygons:
        if p.center.z < -0.3:
            p.material_index = 1
    outline = [(-0.04, 0.36), (0.2, 0.36), (0.05, 0.08), (0.2, 0.08), (-0.14, -0.38), (-0.02, -0.04),
               (-0.17, -0.04)]
    extrude_outline(k.n('bolt'), outline, 0.12, (0.0, -0.33, 0.52), bolt, bev=0.02)


# ------------------------------------------------------- creature materials
def pelt_outline(n=32, rx=0.42, ry=0.5):
    """A stretched-hide silhouette: oval body with four leg flaps, a neck and a tail."""
    flaps = ((50, 0.42, 0.2), (130, 0.42, 0.2), (230, 0.38, 0.2), (310, 0.38, 0.2), (90, 0.2, 0.18), (270, 0.3, 0.1))
    pts = []
    for i in range(n):
        a = i * TAU / n
        r = 1.0
        for deg, amp, width in flaps:
            d = (a - RAD(deg) + math.pi) % TAU - math.pi
            r += amp * math.exp(-(d / width) ** 2)
        pts.append((rx * r * math.cos(a), ry * r * math.sin(a)))
    return pts


@item('leather', yaw=22, elevation=34)
def b_leather(k):
    hide = k.m('hide', '#B8692F', 0.55)
    suede = k.m('suede', '#E3A868', 0.65)
    stitch = k.m('stitch', '#FFF1D2', 0.6)
    outer = puffy(k.n('hide'), pelt_outline(), 0.045, hide, inner=0.6, centre=(0, 0))
    patch = puffy(k.n('patch'), [(x * 0.62, y * 0.62) for x, y in pelt_outline(20)], 0.04, suede, inner=0.6,
                  centre=(0, 0))
    patch.location = (0, 0, 0.03)
    for i in range(12):
        a = i * TAU / 12 + 0.2
        x, y = 0.34 * math.cos(a), 0.4 * math.sin(a)
        z = 0.07 + 0.22 * x * x + 0.1 * max(0.0, y) ** 2
        box(k.n(f'st{i:02d}'), (0.07, 0.022, 0.02), (x, y, z), stitch, bev=0.0,
            rot=(0, 0, a + math.pi / 2))
    for o in (outer, patch):
        for v in o.data.vertices:
            v.co.z += 0.22 * v.co.x ** 2 + 0.1 * max(0.0, v.co.y) ** 2
        o.data.update()
    turn(k.parts(), rx=58)


@item('bone', yaw=22, elevation=30)
def b_bone(k):
    shaft = k.m('shaft', '#F1E2C4', 0.45)
    knob = k.m('knob', '#FFF3DE', 0.4)
    cyl(k.n('shaft'), 0.11, 0.8, (0, 0, 0), shaft, verts=12, bev=0.0, rot=(0, RAD(90), 0))
    for i, (x, z) in enumerate(((-0.44, 0.1), (-0.44, -0.1), (0.44, 0.1), (0.44, -0.1))):
        sphere(k.n(f'knob{i}'), 0.15, (x, 0, z), knob, 12, 8)
    turn(k.parts(), ry=-28)


@item('tusk', yaw=20, elevation=26)
def b_tusk(k):
    ivory = k.m('ivory', '#F7E8C8', 0.35)
    wrap = k.m('wrap', '#8A4B25', 0.6)
    band = k.m('band', '#F5B21E', 0.3, 0.4)
    pts, radii = [], []
    n = 11
    for i in range(n):
        t = i / (n - 1)
        a = RAD(8 + 112 * t)
        pts.append((0.62 * (1 - math.cos(a)) - 0.3, 0.0, 0.95 * math.sin(a) * 0.9))
        radii.append(0.17 * (1 - t) ** 0.8 + 0.004)
    tube(k.n('tusk'), pts, radii, ivory, sides=10, end_tip=True, smooth_angle=80)
    fr = frames([Vector(p) for p in pts])
    base = Vector(pts[0])
    t0 = fr[0][0]
    tube(k.n('wrap'), [base - t0 * 0.1, base + t0 * 0.08], 0.19, wrap, sides=10)
    tube(k.n('band'), [base + t0 * 0.08, base + t0 * 0.13], 0.2, band, sides=10)


@item('spine', yaw=22, elevation=28)
def b_spine(k):
    spine = k.m('spine', '#FFEFC2', 0.35)
    tip = k.m('tip', '#C0502A', 0.35)
    band = k.m('band', '#3FAE4A', 0.5)
    flower = k.m('flower', '#FF5C8A', 0.4)
    # A tied bundle of long two-tone needles (ivory shafts, rust tips), laid on a diagonal.
    offsets = ((0.0, 0.0, 1.1), (0.09, 0.0, 1.0), (-0.09, 0.0, 0.96), (0.045, 0.078, 0.9), (-0.045, 0.078, 1.02),
               (0.045, -0.078, 0.94), (-0.045, -0.078, 1.05))
    for i, (ox, oy, length) in enumerate(offsets):
        d = Vector((ox * 0.5, oy * 0.5, 1.0)).normalized()
        base = Vector((ox, oy, 0.0))
        mid = base + d * length * 0.68
        tube(k.n(f'n{i}'), [base, mid], 0.05, spine, sides=6)
        tube(k.n(f't{i}'), [mid, mid + d * length * 0.16, mid + d * length * 0.32], [0.05, 0.03, 0.0], tip, sides=6,
             end_tip=True, cap=True)
    cyl(k.n('band'), 0.17, 0.14, (0, 0, 0.36), band, verts=12, bev=0.03, seg=1)
    fl = puffy(k.n('flower'), flower_outline(0.12), 0.03, flower, inner=0.5)
    place(fl, (0, -0.19, 0.36), (RAD(90), 0, 0))
    sphere(k.n('centre'), 0.04, (0, -0.22, 0.36), band, 6, 4)
    turn(k.parts(), ry=52)


@item('sugar', yaw=26, elevation=34)
def b_sugar(k):
    white = k.m('cube', '#F4F8FF', 0.65)
    pink = k.m('cube pink', '#FF9CC8', 0.6)
    gold = k.m('sparkle', '#FFD23A', 0.3, emit='#FFC000', strength=0.6)
    box(k.n('c1'), (0.42, 0.42, 0.42), (-0.23, 0.0, 0.21), white, bev=0.05, rot=(0, 0, RAD(-8)))
    box(k.n('c2'), (0.42, 0.42, 0.42), (0.23, 0.04, 0.21), pink, bev=0.05, rot=(0, 0, RAD(12)))
    box(k.n('c3'), (0.42, 0.42, 0.42), (0.0, 0.02, 0.63), white, bev=0.05, rot=(0, 0, RAD(28)))
    sparkle(k.n('tw_a'), gold, 0.12, loc=(0.36, -0.2, 0.72))
    sparkle(k.n('tw_b'), gold, 0.08, loc=(-0.4, -0.25, 0.62))


@item('dragonscale', yaw=18, elevation=24)
def b_dragonscale(k):
    dark = k.m('scale dark', '#0B8A78', 0.2, 0.2)
    mid = k.m('scale', '#16B597', 0.2, 0.2)
    light = k.m('scale light', '#5ADFBB', 0.2, 0.2)
    r = 0.17
    outline = [(-r, 0.13)] + [(r * math.cos(a), r * math.sin(a)) for a in (RAD(180 + 180 * i / 6) for i in range(7))]
    outline.append((r, 0.13))
    # A curved patch of shingled scales, each row overlapping the one above (fish-scale tiling).
    rows = (((-0.17, 0.17), 0.34, dark), ((-0.34, 0.0, 0.34), 0.12, mid), ((-0.17, 0.17), -0.1, light),
            ((0.0,), -0.32, light))
    for j, (xs, y, m) in enumerate(rows):
        for i, x in enumerate(xs):
            s = puffy(k.n(f's{j}{i}'), [(x + px, y + py) for px, py in outline], 0.06, m, inner=0.5,
                      centre=(x, y - 0.02))
            for v in s.data.vertices:
                v.co.z += 0.05 * j - 0.3 * v.co.x ** 2 - 0.12 * v.co.y
            s.data.update()
    turn(k.parts(), rx=62)


@item('gear', yaw=22, elevation=28)
def b_gear(k):
    blue = k.m('gear', '#35B6F2', 0.35)
    red = k.m('gear small', '#EF3B3B', 0.35)
    hub = k.m('hub', '#FFC83A', 0.3)
    holes = k.m('hole', '#1F5FA8', 0.5)
    big = slab(k.n('big'), gear_outline(9, 0.5, 0.38), 0.09, blue, chamfer=0.06)
    place(big, (0, 0, 0.5), (RAD(90), 0, 0))
    cyl(k.n('hub'), 0.15, 0.24, (0, 0, 0.5), hub, verts=12, bev=0.03, seg=1, rot=(RAD(90), 0, 0))
    for i in range(4):
        a = RAD(45 + i * 90)
        cyl(k.n(f'hole{i}'), 0.06, 0.19, (0.27 * math.cos(a), 0, 0.5 + 0.27 * math.sin(a)), holes, verts=8,
            bev=0.0, rot=(RAD(90), 0, 0))
    small = slab(k.n('small'), gear_outline(6, 0.28, 0.19), 0.08, red, chamfer=0.06)
    place(small, (0.56, 0.12, 0.28), (RAD(90), RAD(12), 0))
    cyl(k.n('hub2'), 0.08, 0.2, (0.56, 0.12, 0.28), hub, verts=8, bev=0.02, seg=1, rot=(RAD(90), 0, 0))


@item('battery', yaw=22, elevation=28)
def b_battery(k):
    body = k.m('body', '#35B6F2', 0.35)
    band = k.m('band', '#FFC83A', 0.35)
    metal = k.m('terminal', '#C9D2E0', 0.25, 0.6)
    mark = k.m('mark', '#FFFFFF', 0.4)
    cyl(k.n('body'), 0.26, 0.62, (0, 0, 0.31), body, verts=16, bev=0.04, seg=2)
    cyl(k.n('band'), 0.262, 0.3, (0, 0, 0.77), band, verts=16, bev=0.04, seg=2)
    cyl(k.n('nub'), 0.1, 0.1, (0, 0, 0.95), metal, verts=12, bev=0.025, seg=1)
    box(k.n('plus_h'), (0.2, 0.06, 0.06), (0, -0.26, 0.77), mark, bev=0.015, seg=1)
    box(k.n('plus_v'), (0.06, 0.06, 0.2), (0, -0.26, 0.77), mark, bev=0.015, seg=1)
    box(k.n('minus'), (0.18, 0.06, 0.055), (0, -0.255, 0.3), mark, bev=0.015, seg=1)
    turn(k.parts(), ry=16)


# ------------------------------------------------------- nature materials
@item('vine', yaw=20, elevation=40)
def b_vine(k):
    stem = k.m('stem', '#2F9A3A', 0.45)
    leafm = k.m('leaf', '#6FD24A', 0.4)
    bud = k.m('bud', '#FF9CC8', 0.4)
    pts = []
    n = 34
    for i in range(n):
        t = i / (n - 1)
        a = t * TAU * 2.1
        r = 0.46 - 0.34 * t
        pts.append((r * math.cos(a), r * math.sin(a), 0.07 + 0.18 * t + 0.02 * math.sin(a * 3)))
    pts.append((0.02, 0.1, 0.45))
    pts.append((-0.05, 0.02, 0.62))
    tube(k.n('stem'), pts, 0.055, stem, sides=6, smooth_angle=80)
    for i, (j, yaw) in enumerate(((3, 0), (11, 0), (18, 0), (26, 0))):
        p = Vector(pts[j])
        out = math.atan2(p.y, p.x)
        leaf(k.n(f'leaf{i}'), 0.34, 0.13, leafm, loc=p, rot=(RAD(25), 0, out - math.pi / 2 + RAD(yaw)), bend=0.08,
             segs=4)
    leaf(k.n('leaf_top'), 0.26, 0.1, leafm, loc=pts[-1], rot=(RAD(50), 0, RAD(160)), bend=0.06, segs=4)
    sphere(k.n('bud'), 0.07, pts[-1], bud, 8, 6)


@item('amber', yaw=22, elevation=30)
def b_amber(k):
    amber = k.m('amber', '#FF8400', 0.08, alpha=0.58)
    amber.use_backface_culling = False   # both walls of the gem add depth to the honey colour
    bug = k.m('bug', '#3A1F14', 0.4)
    wing = k.m('wing', '#BFEAFF', 0.3)
    gem = lathe(k.n('gem'), [(0.0, 0.0), (0.3, 0.06), (0.46, 0.3), (0.4, 0.58), (0.2, 0.74), (0.0, 0.78)],
                (0, 0, 0), amber, segments=8, smooth_angle=25)
    gem.scale = (1.1, 0.62, 1.0)
    sphere(k.n('bug_body'), 0.12, (0, -0.06, 0.34), bug, 8, 6, scale=(0.8, 0.55, 1.3))
    sphere(k.n('bug_head'), 0.075, (0, -0.06, 0.53), bug, 8, 5)
    sphere(k.n('wing_l'), 0.12, (-0.1, -0.12, 0.4), wing, 8, 5, scale=(0.6, 0.25, 1.2), rot=(0, RAD(-28), 0))
    sphere(k.n('wing_r'), 0.12, (0.1, -0.12, 0.4), wing, 8, 5, scale=(0.6, 0.25, 1.2), rot=(0, RAD(28), 0))
    for i, (z, dz) in enumerate(((0.28, -0.06), (0.36, 0.0), (0.44, 0.06))):
        for s in (-1, 1):
            tube(k.n(f'leg{i}{"lr"[s > 0]}'), [(s * 0.07, -0.06, z), (s * 0.2, -0.07, z + dz)], 0.016, bug, sides=4)


def scallop_outline(radius=0.62, n=19, hinge=(0.0, 0.3)):
    hx, hy = hinge
    pts = [(hx + 0.13, hy + 0.02)]
    for i in range(n):
        a = RAD(-72 + 144 * i / (n - 1))
        r = radius * (0.94 + 0.06 * abs(math.cos(4.5 * a * 2)))
        pts.append((hx + r * math.sin(a), hy - r * math.cos(a)))
    pts.append((hx - 0.13, hy + 0.02))
    return pts[::-1]


@item('pearl', yaw=16, elevation=34)
def b_pearl(k):
    shell = k.m('shell', '#FF8FC0', 0.35)
    lid = k.m('shell lid', '#FFB3D6', 0.35)
    pearl = k.m('pearl', '#FFFDF8', 0.12, emit='#FFE8F4', strength=0.15)
    lower = puffy(k.n('lower'), scallop_outline(), 0.08, shell, inner=0.5)
    lower.location = (0, 0, 0.08)
    upper = puffy(k.n('upper'), scallop_outline(), 0.07, lid, inner=0.5)
    upper.location = (0, 0, 0.18)
    turn([upper], rx=-62, pivot=(0, 0.3, 0.14))
    sphere(k.n('pearl'), 0.2, (0, -0.02, 0.33), pearl, 16, 10)


@item('coral', yaw=20, elevation=24)
def b_coral(k):
    coral = k.m('coral', '#FF4F6E', 0.4)
    tip = k.m('tip', '#FF9CB5', 0.4)
    base = k.m('rock', '#F2D08A', 0.7)
    branches = (
        ([(0, 0, 0.1), (0.02, 0, 0.35), (-0.15, 0, 0.6), (-0.26, -0.02, 0.86)], 0.085),
        ([(0.02, 0, 0.35), (0.2, 0, 0.55), (0.28, -0.02, 0.82)], 0.07),
        ([(-0.15, 0, 0.6), (-0.02, -0.05, 0.8), (0.02, -0.06, 0.98)], 0.06),
        ([(0.2, 0, 0.55), (0.36, 0.02, 0.62), (0.44, 0.02, 0.7)], 0.055),
        ([(-0.05, 0, 0.25), (-0.3, 0.04, 0.42), (-0.42, 0.04, 0.55)], 0.06),
    )
    for i, (pts, r) in enumerate(branches):
        tube(k.n(f'b{i}'), pts, [r * 1.1] + [r] * (len(pts) - 1), coral, sides=7, smooth_angle=80)
        sphere(k.n(f'tip{i}'), r * 1.12, pts[-1], tip, 8, 6)
    rock(k.n('rock'), 0.3, base, seed=21, subdiv=1, jitter=0.12, scale=(1.4, 1.1, 0.5), loc=(0, 0, 0.08), flat=False)


@item('feather', yaw=18, elevation=30)
def b_feather(k):
    vane = k.m('vane', '#6FC3FF', 0.4)
    fluff = k.m('fluff', '#FFFFFF', 0.6)
    quill = k.m('quill', '#F5B21E', 0.35)
    right, left = [], []
    n = 10
    for i in range(n + 1):
        t = i / n
        y = -0.3 + 0.95 * t
        w = 0.22 * math.sin(math.pi * (0.06 + 0.9 * t)) ** 0.7
        wr = w * (0.72 if 0.5 < t < 0.62 else 1.0)
        right.append((wr, y))
        left.append((-w * 0.85, y))
    outline = right + left[::-1][1:-1]
    v = puffy(k.n('vane'), outline, 0.035, vane, inner=0.5, centre=(0, 0.2))
    f = puffy(k.n('fluff'), [(0.12 * math.cos(a), -0.36 + 0.1 * math.sin(a)) for a in
                             (RAD(x) for x in range(0, 360, 30))], 0.04, fluff, inner=0.5)
    tube(k.n('quill'), [(0, -0.62, 0), (0, -0.4, 0.01), (0, 0.1, 0.035), (0, 0.66, 0.02)], [0.03, 0.028, 0.02, 0.006],
         quill, sides=6)
    for o in (v, f):
        for vert in o.data.vertices:
            vert.co.z += 0.12 * (vert.co.y + 0.2) ** 2
    turn(k.parts(), rx=64, rz=0)
    turn(k.parts(), ry=-38)


@item('shadow', yaw=20, elevation=26)
def b_shadow(k):
    glass = k.m('glass', '#E2DAFF', 0.06, alpha=0.26)
    wispm = k.m('wisp', '#7A48E8', 0.3, emit='#8A50FF', strength=0.8)
    inky = k.m('essence', '#3A1A78', 0.15, emit='#5A24E0', strength=0.5)
    lip = k.m('lip', '#F5B21E', 0.3, 0.4)
    filled_jar(k, [(0.0, 0.0), (0.26, 0.0), (0.34, 0.1), (0.36, 0.3), (0.3225, 0.4), (0.0, 0.42)],
               [(0.325, 0.38), (0.3, 0.46), (0.14, 0.58), (0.11, 0.66), (0.11, 0.76)], inky, glass, segs=14)
    torus(k.n('lip'), 0.12, 0.035, (0, 0, 0.76), lip, 14, 5)
    pts, radii = [], []
    n = 12
    for i in range(n):
        t = i / (n - 1)
        a = t * TAU * 1.1
        pts.append((0.22 * t * math.sin(a), -0.22 * t * math.cos(a) * 0.5, 0.42 + 0.66 * t))
        radii.append(0.075 * (1 - t) + 0.05 * math.sin(math.pi * t))
    tube(k.n('wisp'), pts, radii, wispm, sides=7, end_tip=True, smooth_angle=80)
    sphere(k.n('puff'), 0.12, (0.14, -0.04, 1.04), wispm, 8, 6)
    sphere(k.n('puff2'), 0.08, (-0.12, -0.06, 0.96), wispm, 6, 4)


@item('dragonegg', yaw=20, elevation=30)
def b_dragonegg(k):
    shell = k.m('shell', '#E8483A', 0.3)
    spots = k.m('spots', '#FFC83A', 0.35)
    nest = k.m('nest', '#D98B1F', 0.7)
    prof = [(0.0, 0.0), (0.2, 0.02), (0.33, 0.12), (0.38, 0.28), (0.36, 0.46), (0.28, 0.64), (0.15, 0.78), (0.0, 0.84)]
    lathe(k.n('egg'), prof, (0, 0, 0.08), shell, segments=16, smooth_angle=80)
    for i, (a, z, r) in enumerate(((250, 0.3, 0.08), (300, 0.55, 0.07), (200, 0.6, 0.06), (330, 0.2, 0.06),
                                   (270, 0.75, 0.05), (160, 0.35, 0.07))):
        rr = next(pr for pr, pz in prof if pz >= z) * 0.98
        sphere(k.n(f'spot{i}'), r, (rr * math.cos(RAD(a)), rr * math.sin(RAD(a)), z + 0.08), spots, 6, 4,
               scale=(1, 1, 0.9))
    torus(k.n('nest'), 0.36, 0.1, (0, 0, 0.1), nest, 14, 5)


@item('wood', yaw=26, elevation=30)
def b_wood(k):
    bark = k.m('bark', '#8E5634', 0.7)
    end = k.m('end grain', '#F2C27A', 0.6)
    rope = k.m('rope', '#F2B33D', 0.6)
    leafm = k.m('leaf', '#6FD24A', 0.4)
    for i, (y, z, dx) in enumerate(((-0.21, 0.2, 0.0), (0.21, 0.2, 0.05), (0.0, 0.56, -0.04))):
        log = cyl(k.n(f'log{i}'), 0.2, 0.9, (dx, y, z), bark, verts=12, bev=0.02, seg=1, rot=(0, RAD(90), 0))
        log.data.materials.append(end)
        for p in log.data.polygons:
            if abs(p.normal.z) > 0.9:
                p.material_index = 1
    for x in (-0.22, 0.24):
        torus(k.n(f'rope{x}'), 0.42, 0.03, (x, 0, 0.34), rope, 16, 4, rot=(0, RAD(90), 0))
    leaf(k.n('leaf'), 0.26, 0.1, leafm, loc=(0.1, -0.02, 0.74), rot=(RAD(40), 0, RAD(200)), bend=0.05, segs=4)
    leaf(k.n('leaf2'), 0.2, 0.08, leafm, loc=(0.1, -0.02, 0.74), rot=(RAD(35), 0, RAD(120)), bend=0.05, segs=4)


@item('sap', yaw=20, elevation=30)
def b_sap(k):
    glass = k.m('glass', '#E6F6FF', 0.06, alpha=0.24)
    sap = k.m('sap', '#FF8A0A', 0.15)
    cork = k.m('cork', '#C77A3A', 0.7)
    filled_jar(k, [(0.0, 0.0), (0.3, 0.0), (0.35, 0.06), (0.36, 0.42), (0.0, 0.44)],
               [(0.362, 0.4), (0.362, 0.44), (0.3, 0.52), (0.24, 0.56), (0.24, 0.62)], sap, glass)
    cyl(k.n('cork'), 0.21, 0.16, (0, 0, 0.66), cork, verts=14, bev=0.03, seg=1, radius_top=0.24)
    # A fat amber drop oozing from under the cork and down the jar's right shoulder.
    a = RAD(-40)
    cx, cy = math.cos(a), math.sin(a)
    tube(k.n('drip'), [(0.22 * cx, 0.22 * cy, 0.64), (0.3 * cx, 0.3 * cy, 0.57), (0.37 * cx, 0.37 * cy, 0.46),
                       (0.38 * cx, 0.38 * cy, 0.36)], [0.06, 0.055, 0.05, 0.05], sap, sides=7)
    drop = lathe(k.n('drop'), [(0.0, 0.0), (0.09, 0.02), (0.12, 0.08), (0.09, 0.15), (0.0, 0.24)], (0, 0, 0), sap,
                 segments=10, smooth_angle=80)
    place(drop, (0.39 * cx, 0.39 * cy, 0.4), (RAD(180), 0, 0))


# ------------------------------------------------------------------ foods
@item('meat', yaw=20, elevation=30)
def b_meat(k):
    meat = k.m('meat', '#D9423F', 0.4)
    skin = k.m('skin', '#FF8A7A', 0.4)
    bone = k.m('bone', '#FFF3DE', 0.4)
    lathe(k.n('meat'), [(0.0, 0.0), (0.26, 0.03), (0.38, 0.15), (0.41, 0.3), (0.35, 0.46), (0.22, 0.58), (0.11, 0.66),
                        (0.0, 0.67)], (0, 0, 0), meat, segments=16, smooth_angle=80)
    torus(k.n('ring'), 0.13, 0.04, (0, 0, 0.64), skin, 12, 5)
    cyl(k.n('bone'), 0.065, 0.3, (0, 0, 0.78), bone, verts=10, bev=0.0)
    sphere(k.n('knob_a'), 0.09, (-0.07, 0, 0.94), bone, 10, 6)
    sphere(k.n('knob_b'), 0.09, (0.07, 0, 0.94), bone, 10, 6)
    turn(k.parts(), ry=48)


@item('claw', yaw=12, elevation=26)
def b_claw(k):
    shell = k.m('shell', '#EF3B3B', 0.35)
    tip = k.m('tip', '#4A2630', 0.35)
    spot = k.m('spot', '#FFB08A', 0.4)
    sphere(k.n('palm'), 0.32, (0, 0, 0.42), shell, 14, 9, scale=(1.3, 0.72, 1.0))
    tube(k.n('upper'), [(0.26, 0, 0.58), (0.44, 0, 0.8), (0.6, 0, 0.92)], [0.15, 0.12, 0.08], shell, sides=8)
    tube(k.n('upper_tip'), [(0.6, 0, 0.92), (0.72, 0, 0.94), (0.8, 0, 0.86)], [0.08, 0.05, 0.0], tip, sides=8,
         end_tip=True)
    tube(k.n('lower'), [(0.3, 0, 0.3), (0.52, 0, 0.34), (0.7, 0, 0.44)], [0.16, 0.12, 0.08], shell, sides=8)
    tube(k.n('lower_tip'), [(0.7, 0, 0.44), (0.82, 0, 0.52), (0.88, 0, 0.64)], [0.08, 0.05, 0.0], tip, sides=8,
         end_tip=True)
    tube(k.n('arm'), [(-0.3, 0, 0.32), (-0.46, 0, 0.2), (-0.56, 0, 0.14)], [0.15, 0.13, 0.12], shell, sides=8)
    for i, (x, z) in enumerate(((-0.12, 0.56), (0.08, 0.3), (-0.2, 0.34), (0.14, 0.58))):
        sphere(k.n(f'spot{i}'), 0.05, (x, -0.22, z), spot, 6, 4, scale=(1, 0.5, 1))
    turn(k.parts(), ry=-8)


def filled_jar(k, liquid_profile, glass_profile, liquid, glass, segs=16):
    """A vessel whose lower part is the glossy liquid itself and whose empty top is clear glass.
    Layering glass over the liquid washes its colour out at icon size, so they only meet at the fill line."""
    lathe(k.n('liquid'), liquid_profile, (0, 0, 0), liquid, segments=segs, smooth_angle=60)
    return lathe(k.n('glass'), glass_profile, (0, 0, 0), glass, segments=segs, cap_top=False, cap_bottom=False,
                 smooth_angle=60)


def flower_outline(r, lobes=5, per=3, depth=0.32):
    n = lobes * per
    return [(r * (1 - depth + depth * abs(math.cos(lobes * a / 2))) * math.cos(a),
             r * (1 - depth + depth * abs(math.cos(lobes * a / 2))) * math.sin(a))
            for a in (RAD(90) + i * TAU / n for i in range(n))]


@item('nectar', yaw=20, elevation=30)
def b_nectar(k):
    glass = k.m('glass', '#E8F7FF', 0.06, alpha=0.24)
    nectar = k.m('nectar', '#F0469E', 0.14)
    petal = k.m('petal', '#FFC83A', 0.4)
    centre = k.m('centre', '#FF7A1A', 0.4)
    filled_jar(k, [(0.0, 0.0), (0.22, 0.0), (0.36, 0.14), (0.38, 0.3), (0.335, 0.4), (0.0, 0.42)],
               [(0.337, 0.38), (0.3, 0.48), (0.18, 0.56), (0.18, 0.64)], nectar, glass)
    fl = puffy(k.n('flower'), flower_outline(0.3), 0.06, petal, inner=0.5)
    place(fl, (0, 0, 0.7), (RAD(-14), 0, 0))
    sphere(k.n('centre'), 0.1, (0, -0.02, 0.76), centre, 10, 6, scale=(1, 1, 0.6))


@item('cwater', yaw=20, elevation=26)
def b_cwater(k):
    glass = k.m('glass', '#E8F7FF', 0.06, alpha=0.24)
    water = k.m('water', '#3FD0F0', 0.15)
    label = k.m('label', '#FFE9B8', 0.6)
    cactus = k.m('cactus', '#3FAE4A', 0.45)
    cork = k.m('cork', '#C77A3A', 0.7)
    filled_jar(k, [(0.0, 0.0), (0.22, 0.0), (0.26, 0.05), (0.26, 0.56), (0.226, 0.62), (0.0, 0.64)],
               [(0.228, 0.6), (0.18, 0.7), (0.1, 0.78), (0.1, 0.9)], water, glass, segs=14)
    cyl(k.n('label'), 0.272, 0.28, (0, 0, 0.3), label, verts=14, bev=0.0)
    cyl(k.n('cork'), 0.09, 0.14, (0, 0, 0.94), cork, verts=10, bev=0.02, seg=1, radius_top=0.11)
    tube(k.n('trunk'), [(0, -0.29, 0.2), (0, -0.3, 0.3), (0, -0.29, 0.4)], [0.05, 0.05, 0.04], cactus, sides=6,
         flat=1.0)
    tube(k.n('arm_l'), [(-0.03, -0.29, 0.29), (-0.08, -0.28, 0.3), (-0.09, -0.28, 0.37)], 0.025, cactus, sides=5)
    tube(k.n('arm_r'), [(0.03, -0.29, 0.26), (0.08, -0.28, 0.27), (0.09, -0.28, 0.33)], 0.025, cactus, sides=5)


@item('bloom', yaw=20, elevation=28)
def b_bloom(k):
    pink = k.m('petal pink', '#FF5C8A', 0.4)
    yellow = k.m('petal yellow', '#FFC83A', 0.4)
    stem = k.m('stem', '#3FAE4A', 0.45)
    ribbon = k.m('ribbon', '#9B6BFF', 0.4)
    heads = (((-0.24, -0.02, 0.86), pink, yellow, 22), ((0.22, 0.02, 0.9), pink, yellow, -24),
             ((0.0, -0.08, 1.02), yellow, pink, 0))
    for i, (p, pm, cm, tilt) in enumerate(heads):
        tube(k.n(f'stem{i}'), [(0, 0, 0.0), (p[0] * 0.3, p[1] * 0.3, 0.45), p], 0.035, stem, sides=5)
        fl = puffy(k.n(f'flower{i}'), flower_outline(0.22, per=2, depth=0.4), 0.05, pm, inner=0.5)
        place(fl, p, (RAD(62), RAD(tilt), 0))
        sphere(k.n(f'centre{i}'), 0.07, (p[0], p[1] - 0.05, p[2] + 0.02), cm, 6, 4)
    leaf(k.n('leaf_l'), 0.34, 0.1, stem, loc=(-0.02, 0, 0.42), rot=(RAD(35), 0, RAD(130)), bend=0.08, segs=4)
    leaf(k.n('leaf_r'), 0.3, 0.09, stem, loc=(0.02, 0, 0.42), rot=(RAD(35), 0, RAD(-130)), bend=0.08, segs=4)
    cyl(k.n('ribbon'), 0.09, 0.14, (0, 0, 0.3), ribbon, verts=10, bev=0.02, seg=1)
    sphere(k.n('bow_l'), 0.08, (-0.1, -0.06, 0.3), ribbon, 6, 4, scale=(1.2, 0.5, 0.8))
    sphere(k.n('bow_r'), 0.08, (0.1, -0.06, 0.3), ribbon, 6, 4, scale=(1.2, 0.5, 0.8))


@item('honey', yaw=20, elevation=32)
def b_honey(k):
    pot = k.m('pot', '#3D8FE0', 0.35)
    honey = k.m('honey', '#FFB21E', 0.2)
    wood = k.m('dipper', '#C77A3A', 0.5)
    lathe(k.n('pot'), [(0.0, 0.0), (0.26, 0.0), (0.4, 0.14), (0.43, 0.32), (0.36, 0.5), (0.28, 0.56), (0.32, 0.62),
                       (0.28, 0.64), (0.0, 0.6)], (0, 0, 0), pot, segments=16, smooth_angle=55)
    lathe(k.n('top'), [(0.0, 0.68), (0.2, 0.67), (0.31, 0.62), (0.33, 0.58)], (0, 0, 0), honey, segments=16,
          cap_bottom=False, smooth_angle=80)
    for i, (a, length) in enumerate(((255, 0.2), (290, 0.12), (220, 0.14))):
        x, y = 0.34 * math.cos(RAD(a)), 0.34 * math.sin(RAD(a))
        tube(k.n(f'drip{i}'), [(x, y, 0.6), (x * 1.08, y * 1.08, 0.52), (x * 1.18, y * 1.18, 0.56 - length)],
             [0.05, 0.045, 0.055], honey, sides=6)
    tube(k.n('stick'), [(0.05, 0.02, 0.5), (0.25, 0.06, 0.95)], 0.035, wood, sides=6)
    lathe(k.n('head'), [(0.0, 0.0), (0.08, 0.02), (0.1, 0.06), (0.07, 0.09), (0.1, 0.12), (0.07, 0.15), (0.1, 0.18),
                        (0.06, 0.21), (0.0, 0.22)], (0.03, 0.01, 0.42), honey, segments=10, rot=(RAD(-6), RAD(22), 0),
          smooth_angle=60)


@item('potion', yaw=20, elevation=28)
def b_potion(k):
    glass = k.m('glass', '#FFE0E6', 0.05, alpha=0.24)
    liquid = k.m('liquid', '#EF2B4B', 0.14)
    cork = k.m('cork', '#C77A3A', 0.7)
    heart = k.m('heart', '#FFFFFF', 0.35)
    filled_jar(k, [(0.0, 0.0), (0.2, 0.01), (0.36, 0.1), (0.42, 0.3), (0.36, 0.5), (0.328, 0.52), (0.0, 0.54)],
               [(0.33, 0.5), (0.2, 0.6), (0.11, 0.66), (0.11, 0.84)], liquid, glass)
    cyl(k.n('cork'), 0.1, 0.16, (0, 0, 0.88), cork, verts=10, bev=0.02, seg=1, radius_top=0.12)
    h = puffy(k.n('heart'), heart_outline(20, 0.24), 0.045, heart, inner=0.45)
    place(h, (0, -0.39, 0.34), (RAD(90), 0, 0))


# ---------------------------------------------------------- farm and other
@item('manure', yaw=20, elevation=30)
def b_manure(k):
    sack = k.m('sack', '#D9A45B', 0.75)
    rope = k.m('rope', '#8A4B25', 0.6)
    leafm = k.m('leaf', '#4FBF3A', 0.4)
    soil = k.m('soil', '#5A3A28', 0.8)
    s = lathe(k.n('sack'), [(0.0, 0.0), (0.34, 0.0), (0.42, 0.12), (0.44, 0.3), (0.38, 0.46), (0.2, 0.58),
                            (0.16, 0.62), (0.22, 0.7), (0.27, 0.78)], (0, 0, 0), sack, segments=14, cap_top=False,
              smooth_angle=70)
    rng = random.Random(31)
    for v in s.data.vertices:
        if 0.05 < v.co.z < 0.5:
            v.co.x *= 1 + 0.05 * (rng.random() - 0.5)
            v.co.y *= 1 + 0.05 * (rng.random() - 0.5)
        if v.co.z > 0.74:
            v.co.z += 0.03 * math.sin(math.atan2(v.co.y, v.co.x) * 5)
    s.data.update()
    lathe(k.n('soil'), [(0.0, 0.7), (0.22, 0.7), (0.0, 0.76)], (0, 0, 0), soil, segments=12, smooth_angle=60)
    torus(k.n('rope'), 0.18, 0.04, (0, 0, 0.6), rope, 14, 5)
    for i, rz in enumerate((-30, 30)):
        leaf(k.n(f'leaf{i}'), 0.22, 0.09, leafm, loc=(0, -0.44, 0.24), rot=(RAD(90), RAD(rz), 0), bend=0.03, segs=4)
    tube(k.n('stem'), [(0, -0.44, 0.1), (0, -0.445, 0.24)], 0.02, leafm, sides=5)


@item('spore', yaw=20, elevation=30)
def b_spore(k):
    puff = k.m('puff', '#4FE0B0', 0.35, emit='#2EE0A0', strength=0.6)
    dots = k.m('dots', '#F2FFF8', 0.3, emit='#C8FFE8', strength=1.0)
    stalk = k.m('stalk', '#B06BFF', 0.4, emit='#8A4FFF', strength=0.4)
    sphere(k.n('puff'), 0.36, (0, 0, 0.5), puff, 12, 8)
    for i in range(12):
        z = 1 - 2 * (i + 0.5) / 12
        a = i * 2.39996
        d = Vector((math.sqrt(1 - z * z) * math.cos(a), math.sqrt(1 - z * z) * math.sin(a), z))
        if d.z < -0.6:
            continue
        c = Vector((0, 0, 0.5))
        tube(k.n(f'st{i}'), [c + d * 0.3, c + d * 0.47], 0.018, stalk, sides=4)
        sphere(k.n(f'dot{i}'), 0.05, c + d * 0.49, dots, 6, 4)
    for i, p in enumerate(((0.52, -0.1, 0.95), (-0.5, -0.15, 0.82), (0.45, -0.2, 0.2))):
        sphere(k.n(f'float{i}'), 0.045, p, dots, 6, 4)


@item('worm', yaw=20, elevation=32)
def b_worm(k):
    tin = k.m('tin', '#C9D2E0', 0.3, 0.55)
    label = k.m('label', '#35B6F2', 0.45)
    soil = k.m('soil', '#5A3A28', 0.8)
    worm = k.m('worm', '#FF8FA8', 0.35)
    eye = k.m('eye', '#2A2233', 0.3)
    lathe(k.n('tin'), [(0.0, 0.0), (0.34, 0.0), (0.35, 0.02), (0.35, 0.34), (0.37, 0.36), (0.33, 0.37), (0.32, 0.3),
                       (0.0, 0.3)], (0, 0, 0), tin, segments=18, smooth_angle=40)
    cyl(k.n('label'), 0.355, 0.2, (0, 0, 0.17), label, verts=18, bev=0.0)
    cyl(k.n('soil'), 0.325, 0.04, (0, 0, 0.31), soil, verts=16, bev=0.0)
    pts = [(-0.12, 0.05, 0.3), (-0.12, 0.0, 0.5), (0.0, -0.05, 0.66), (0.14, -0.08, 0.62), (0.2, -0.12, 0.5),
           (0.2, -0.16, 0.4)]
    tube(k.n('body'), pts, [0.075, 0.08, 0.08, 0.08, 0.078, 0.075], worm, sides=8, smooth_angle=80)
    sphere(k.n('head'), 0.085, (0.2, -0.17, 0.38), worm, 10, 6)
    for x in (-0.035, 0.035):
        sphere(k.n(f'eye{x}'), 0.022, (0.2 + x, -0.245, 0.4), eye, 6, 4)
    for i, (p, r) in enumerate((((-0.12, 0.02, 0.42), 0.083), ((-0.06, -0.02, 0.6), 0.084), ((0.1, -0.07, 0.65), 0.084))):
        torus(k.n(f'band{i}'), r, 0.012, p, worm, 10, 3, rot=(RAD(90 - 30 * i), 0, RAD(90)))


@item('plot_kit', yaw=24, elevation=36)
def b_plot_kit(k):
    wood = k.m('wood', '#C77A3A', 0.55)
    post = k.m('post', '#8A4B25', 0.6)
    soil = k.m('soil', '#6A3F2A', 0.85)
    leafm = k.m('leaf', '#58D13E', 0.4)
    for i, (x, y, sx, sy) in enumerate(((0, -0.42, 0.9, 0.1), (0, 0.42, 0.9, 0.1), (-0.42, 0, 0.1, 0.74),
                                         (0.42, 0, 0.1, 0.74))):
        box(k.n(f'plank{i}'), (sx, sy, 0.24), (x, y, 0.12), wood, bev=0.03, seg=1)
    for i, (x, y) in enumerate(((-0.43, -0.43), (0.43, -0.43), (-0.43, 0.43), (0.43, 0.43))):
        box(k.n(f'post{i}'), (0.14, 0.14, 0.3), (x, y, 0.15), post, bev=0.03, seg=1)
    box(k.n('soil'), (0.76, 0.76, 0.2), (0, 0, 0.1), soil, bev=0.04, seg=1)
    tube(k.n('stem'), [(0, 0, 0.18), (0.0, -0.01, 0.34), (0.02, -0.02, 0.46)], 0.03, leafm, sides=5)
    leaf(k.n('leaf_l'), 0.28, 0.12, leafm, loc=(0.02, -0.02, 0.45), rot=(RAD(-10), RAD(-15), RAD(100)), bend=0.06,
         segs=4)
    leaf(k.n('leaf_r'), 0.24, 0.1, leafm, loc=(0.02, -0.02, 0.45), rot=(RAD(-10), RAD(15), RAD(-80)), bend=0.06,
         segs=4)


# ==== ITEMS END


def build(iid):
    fn, _view = BUILDERS[iid]
    before = {o.name for o in bpy.data.objects}
    fn(Kit(iid))
    parts = sorted((o for o in bpy.data.objects if o.name not in before and o.type == 'MESH'),
                   key=lambda o: o.name)
    obj = join(parts, iid)
    me = obj.data
    me.transform(Matrix.Scale(ITEM_SCALE, 4))
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    me.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    triangulate(obj)
    return obj


def item_stats(obj):
    vs = [v.co for v in obj.data.vertices]
    size = [round(max(c[i] for c in vs) - min(c[i] for c in vs), 3) for i in range(3)]
    return dict(triangles=triangles(obj), materials=[m.name for m in obj.data.materials], size=size)


def check_item(iid, s):
    errs = []
    if s['triangles'] > TRI_LIMIT:
        errs.append(f"{s['triangles']} triangles (> {TRI_LIMIT})")
    n = len(s['materials'])
    if not MAT_RANGE[0] <= n <= MAT_RANGE[1]:
        errs.append(f'{n} materials (want {MAT_RANGE[0]}-{MAT_RANGE[1]})')
    bad = [m for m in s['materials'] if not m.startswith(f'Item {iid} ')]
    if bad:
        errs.append(f'materials not named "Item {iid} <part>": {bad}')
    return errs


# ================================================================ icons
def _eevee(samples=48):
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.6),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def icon_camera(obj, elevation=34, yaw=24, margin=1.2):
    data = bpy.data.cameras.new('Icon camera')
    data.type = 'ORTHO'
    cam = link(bpy.data.objects.new('Icon camera', data))
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
    """Same studio as the crop and fish icons; saves each WebP at the best quality under the limit."""
    studio(size=(ICON_SIZE, ICON_SIZE), transparent=True)
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
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    os.makedirs(ICONS, exist_ok=True)
    written = {}
    for iid, obj in objs.items():
        for o in objs.values():
            o.hide_render = o is not obj
        view = BUILDERS[iid][1]
        cam = icon_camera(obj, view['elevation'], view['yaw'], view['margin'])
        bpy.ops.render.render(write_still=False)
        result = bpy.data.images['Render Result']
        path = os.path.join(ICONS, iid + '.webp')
        for quality in (88, 82, 76, 70, 64):
            scene.render.image_settings.quality = quality
            result.save_render(path, scene=scene)
            if os.path.getsize(path) <= ICON_LIMIT:
                break
        bpy.data.objects.remove(cam, do_unlink=True)
        written[iid] = dict(bytes=os.path.getsize(path), quality=quality)
    for o in objs.values():
        o.hide_render = False
    return written


def contact_sheet(ids, out_path, cols=8):
    """All icons on cream cards: full size on top, the ~52 px UI size underneath (as crop-icons.webp)."""
    import numpy as np
    cell, small, pad = 176, 52, 8
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
        ids = [s.strip() for s in opts['only'].split(',') if s.strip()]
        unknown = [s for s in ids if s not in ITEM_IDS]
        if unknown:
            raise SystemExit(f'unknown item ids: {unknown}')
        opts['only'] = [s for s in ITEM_IDS if s in ids]
    return opts


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as fh:
            return json.load(fh)
    return {}


def main():
    opts = parse_args()
    ids = opts['only'] or ITEM_IDS
    missing_builders = [i for i in ITEM_IDS if i not in BUILDERS]
    failures = [f'{i}: no builder' for i in missing_builders]
    ids = [i for i in ids if i in BUILDERS]
    reset_scene()
    objs = {iid: build(iid) for iid in ids}
    stats = {iid: item_stats(o) for iid, o in objs.items()}
    print('\n== items')
    for iid, s in stats.items():
        print(f"  {iid:13s} {s['triangles']:4d} tris  {len(s['materials'])} mats  size {s['size']}")
        failures += [f'{iid}: {e}' for e in check_item(iid, s)]

    manifest = load_manifest()
    manifest['generator'] = 'art/blender/kit/build_items.py'
    manifest['blender'] = bpy.app.version_string
    manifest['coordinates'] = ('Blender Z up, front toward -Y (glTF Y up, front toward +Z); metres; one '
                               'top-level mesh per id, base at z 0, centred on the origin')
    manifest['limits'] = dict(triangles=TRI_LIMIT, materials=list(MAT_RANGE), icon_bytes=ICON_LIMIT,
                              icon_size=[ICON_SIZE, ICON_SIZE])
    manifest['scale'] = ITEM_SCALE
    if set(ids) == set(ITEM_IDS):
        size = export_glb([objs[i] for i in ITEM_IDS], os.path.join(MODELS, 'items.glb'))
        print(f'  items.glb {size} bytes')
        manifest['model'] = dict(file='models/items.glb', bytes=size, nodes=ITEM_IDS)

    icons = render_icons(objs)
    old = manifest.get('items', {})
    items = {}
    for iid in ITEM_IDS:
        if iid in stats:
            items[iid] = dict(stats[iid], icon=f'icons/items/{iid}.webp', icon_bytes=icons[iid]['bytes'],
                              icon_quality=icons[iid]['quality'])
        elif iid in old:
            items[iid] = old[iid]
    manifest['items'] = items
    for iid in ITEM_IDS:
        path = os.path.join(ICONS, iid + '.webp')
        if iid not in items or not os.path.exists(path):
            failures.append(f'{iid}: missing from the manifest or icons')
        elif os.path.getsize(path) > ICON_LIMIT:
            failures.append(f'{iid}: icon is {os.path.getsize(path)} bytes (> {ICON_LIMIT})')
    manifest['total_icon_bytes'] = sum(v['icon_bytes'] for v in items.values())
    os.makedirs(GEN, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    for iid in ids:
        print(f"  {iid:13s} icon {icons[iid]['bytes']:5d} bytes (q{icons[iid]['quality']})")

    if opts['render']:
        have = [i for i in ITEM_IDS if os.path.exists(os.path.join(ICONS, i + '.webp'))]
        contact_sheet(have, os.path.join(PREVIEWS, 'item-icons.webp'))
        print('  preview art/previews/kit/item-icons.webp')
    if failures:
        raise RuntimeError('Item kit contract failures:\n  ' + '\n  '.join(failures))
    if opts['install']:
        os.makedirs(PUBLIC_ICONS, exist_ok=True)
        for iid in ids:
            shutil.copy2(os.path.join(ICONS, iid + '.webp'), os.path.join(PUBLIC_ICONS, iid + '.webp'))
        print('installed', len(ids), 'icons')
    print('\nItem kit OK')


if __name__ == '__main__':
    main()
