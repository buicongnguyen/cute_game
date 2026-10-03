"""Zoo Garden dish icons: cooked foods, farm dishes and the garden guard badge.

Cooking turns every crop, fruit, fish and the meat into a `cooked_<id>` food, and the farm kitchen
makes four dishes. None of them had art (the game showed the raw icon plus a flame emoji). Each icon
here is one joined toy model rendered in the item icon studio (build_items: same lights, ortho 3/4
camera, 160 x 160 transparent WebP under 8 KB). Every category has one look so the set reads together:

  garden crops (19)  a light-wood skewer through three roasted pieces shaped like the crop
  fruits (8)         grilled on a small round cream plate with a cornflower-blue rim
  fish (18)          the fish's own model (public/assets/models/fish.glb), whole and grilled, lying on
                     an oval version of the plate with a lemon wedge and parsley
  meat               build_items' ham, roasted golden-brown, on the round plate
  farm dishes        omelette and pancakes on the plate, a milkshake glass, a cheese wheel on a board
  guard              the guard dog's effect: a blue and gold toy shield with a white paw print

"Cooked" is a shader edit (roast()), never a texture: the raw colour is warmed and pushed toward
golden-brown (more at grazing angles, so the middle keeps the crop or fish colour; dark colours get
less so a navy manta stays navy), dark grill stripes come from a sine of the object-space position,
and the glaze is glossier. Stripes run in one world direction per category, so all pieces on a
skewer or plate share one grill. A soft white steam curl rises from the skewers and plates; the
fish go without, since beside a long fish it read as a stray tick at 52 px.

Framing: skewers rise SKEWER_ANGLE degrees on screen with touching chunks, so the frame is nearly
square; the fish are scaled to FISH_LEN, a little longer than their plate. Each icon's alpha
bounding box ("fill") is recorded in the manifest to catch tiny or clipped subjects.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_dishes.py -- \
        [--only id1,id2,...] [--install] [--render]

Outputs:
    art/generated/kit/icons/items/<id>.webp   (160 x 160, transparent, <= 8 KB)
    art/generated/kit/dishes-manifest.json    (per id: icon bytes, WebP quality, frame fill)
    art/previews/kit/dish-icons.webp          (--render: full size and 52 px on cream cards)
--install copies the icons to public/assets/icons/items/<id>.webp and records them under "dishes"
in art/asset-manifest.json. Output is deterministic: randomness is seeded per dish.
"""
import bpy
import bmesh
import json
import math
import os
import random
import shutil
import sys
import time
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
import build_items as bi  # noqa: E402  (main() only runs under __main__)
from build_items import Kit, circle, flower_outline, leaf, mesh, puffy, slab, star_outline, tube, turn  # noqa: E402
from style import box, cyl, ico, lathe, place, rgba, sphere, torus  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
ICONS = os.path.join(GEN, 'icons', 'items')
MANIFEST = os.path.join(GEN, 'dishes-manifest.json')
ASSET_MANIFEST = os.path.join(REPO, 'art', 'asset-manifest.json')
PREVIEW = os.path.join(REPO, 'art', 'previews', 'kit', 'dish-icons.webp')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')
FISH_GLB = os.path.join(REPO, 'public', 'assets', 'models', 'fish.glb')

CROPS = ('radish carrot pumpkin mint chili candy bean star berry coffee moonflower magnetmelon melon clover '
         'glowshroom iceberry goldcorn dragonfruit rainbowrose').split()
FRUITS = 'apple grape mango pineapple coconut durian lychee peach'.split()
FISH = ('perch clown puffer carp shark rainbow catfish koi eel swordfish jelly icepike whale kraken golden '
        'sunfish angler manta').split()
FARM = ['omelette', 'pancake', 'milkshake', 'cheese']
DISH_IDS = ([f'cooked_{c}' for c in CROPS] + [f'cooked_{f}' for f in FRUITS] + [f'cooked_fish_{f}' for f in FISH]
            + ['cooked_meat'] + FARM + ['guard'])
ICON_SIZE = 160
ICON_LIMIT = 8 * 1024
QUALITIES = (88, 82, 76, 70, 64, 58, 52)
TAU, RAD = math.tau, math.radians

# One camera per category (degrees; margin is the frame around the projected bounds).
VIEWS = {
    'skewer': dict(yaw=24, elevation=34, margin=1.08),
    'plate': dict(yaw=24, elevation=44, margin=1.06),
    'fish': dict(yaw=24, elevation=50, margin=1.03),
    'glass': dict(yaw=20, elevation=24, margin=1.12),
    'badge': dict(yaw=18, elevation=20, margin=1.14),
}
# Roast palette (sRGB hex): warm multiply tint, golden-brown toast, grill char; plate cream and rim.
WARM, TOAST, CHAR = '#FFD7A0', '#C66A22', '#3A1C0E'
PLATE, RIM = '#FFF4DE', '#5A8CF2'
PLATE_TOP = 0.04          # the plate's well, where food rests
ROUND = 0.9               # round plate scale (radius 0.58) for fruit, meat, omelette and pancakes
EYES = {'Fish eye', 'Fish eye white', 'Fish angler lure'}


def view_axes(view):
    """(toward the camera, screen right, screen up) in world space for a VIEWS entry."""
    e, a = RAD(view['elevation']), RAD(view['yaw'])
    fwd = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    right = Vector((math.cos(a), math.sin(a), 0.0))
    return fwd, right, fwd.cross(right)


def grill(view, angle, depth=0.3, period=0.14, width=0.2):
    """World direction of the grill-stripe sine: `angle` in the image plane (0 = screen right) plus a
    little of the view axis so the lines wrap round the food instead of looking projected; `width`
    is the charred share of each period."""
    fwd, right, up = view_axes(view)
    d = right * math.cos(RAD(angle)) + up * math.sin(RAD(angle)) + fwd * depth
    return d.normalized(), period, width


GRILLS = {'skewer': grill(VIEWS['skewer'], -40, period=0.15, width=0.26), 'plate': grill(VIEWS['plate'], -24),
          'fish': grill(VIEWS['fish'], -32, period=0.16, width=0.22)}
for _cat in ('glass', 'badge'):
    GRILLS[_cat] = GRILLS['plate']


# ================================================================ roasting
def roast(m, cat, warm=0.3, toast=0.12, edge=0.55, char=0.85, width=None, rough=0.3, coat=0.0, emit_scale=1.0):
    """Turn a plain Principled material into its cooked look (see the module docstring)."""
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    raw = tuple(bsdf.inputs['Base Color'].default_value)

    def put(sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            links.new(v, sock)
        else:
            sock.default_value = v

    def op(kind, a, b=0.0, c=0.0, clamp=False):
        n = nodes.new('ShaderNodeMath')
        n.operation, n.use_clamp = kind, clamp
        for sock, v in zip(n.inputs, (a, b, c)):
            put(sock, v)
        return n.outputs[0]

    def mix(blend, fac, a, b):
        n = nodes.new('ShaderNodeMix')
        n.data_type, n.blend_type, n.clamp_result = 'RGBA', blend, True
        cols = [s for s in n.inputs if s.type == 'RGBA']
        put(n.inputs[0], fac)
        put(cols[0], a)
        put(cols[1], b)
        return next(s for s in n.outputs if s.type == 'RGBA')

    lw = nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.45
    # Golden-brown would lighten and grey dark colours (navy manta, blue whale): toast them less.
    keep = min(1.0, 0.3 + 3.0 * (0.2126 * raw[0] + 0.7152 * raw[1] + 0.0722 * raw[2]))
    toast_fac = op('MULTIPLY_ADD', op('POWER', lw.outputs['Facing'], 1.6), edge * keep, toast * keep, clamp=True)
    col = mix('MULTIPLY', warm, raw, rgba(WARM))
    col = mix('MIX', toast_fac, col, rgba(TOAST))
    if char > 0:
        d, period, cat_width = GRILLS[cat]
        width = cat_width if width is None else width
        tc = nodes.new('ShaderNodeTexCoord')
        dot = nodes.new('ShaderNodeVectorMath')
        dot.operation = 'DOT_PRODUCT'
        links.new(tc.outputs['Object'], dot.inputs[0])
        dot.inputs[1].default_value = tuple(d)
        wave = op('SINE', op('MULTIPLY', dot.outputs['Value'], TAU / period))
        thr = math.cos(math.pi * width)
        mask = op('MULTIPLY', op('MULTIPLY', op('SUBTRACT', wave, thr - 0.07), 1 / 0.14, clamp=True), char)
        col = mix('MIX', mask, col, rgba(CHAR))
    links.new(col, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    if coat:
        for name, v in (('Coat Weight', coat), ('Coat Roughness', 0.18)):
            if name in bsdf.inputs:
                bsdf.inputs[name].default_value = v
    if emit_scale != 1.0:
        bsdf.inputs['Emission Strength'].default_value *= emit_scale
    m['roasted'] = 1
    return m


class Dish(Kit):
    """build_items.Kit (materials `Item <id> <part>`, part names `<id>_<tag>`) plus roasted materials."""

    def __init__(self, iid, cat):
        super().__init__(iid)
        self.cat = cat

    def food(self, part, color, rough=0.3, emit=None, strength=0.0, **kw):
        m = self.m(part, color, rough, emit=emit, strength=strength)
        return m if m.get('roasted') else roast(m, self.cat, rough=rough, **kw)


# ================================================================ helpers
def names():
    return {o.name for o in bpy.data.objects}


def new_since(before):
    return sorted((o for o in bpy.data.objects if o.name not in before and o.type == 'MESH'), key=lambda o: o.name)


def move(objs, offset):
    bpy.context.view_layer.update()
    m = Matrix.Translation(Vector(offset))
    for o in objs:
        o.matrix_world = m @ o.matrix_world


def scale_about(objs, s, pivot=(0, 0, 0)):
    bpy.context.view_layer.update()
    p = Vector(pivot)
    m = Matrix.Translation(p) @ Matrix.Scale(s, 4) @ Matrix.Translation(-p)
    for o in objs:
        o.matrix_world = m @ o.matrix_world


def spin(objs, view, deg, pivot=(0, 0, 0)):
    """Rotate parts about the camera's view axis: turns them in the image plane (counter-clockwise)."""
    bpy.context.view_layer.update()
    axis = view_axes(view)[0]
    p = Vector(pivot)
    m = Matrix.Translation(p) @ Matrix.Rotation(RAD(deg), 4, axis) @ Matrix.Translation(-p)
    for o in objs:
        o.matrix_world = m @ o.matrix_world


def bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))


def surface_z(obj, x, y):
    """Height of `obj`'s top surface above (x, y), by a downward ray (None when it misses)."""
    bpy.context.view_layer.update()
    tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    inv = obj.matrix_world.inverted()
    hit = tree.ray_cast(inv @ Vector((x, y, 50.0)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())[0]
    return None if hit is None else (obj.matrix_world @ hit).z


def lin(a, b, n):
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def face_mats(obj, mats, pick):
    """Append `mats` to obj and set each face's material index from pick(polygon) (None keeps it)."""
    base = len(obj.data.materials)
    for m in mats:
        obj.data.materials.append(m)
    for p in obj.data.polygons:
        j = pick(p)
        if j is not None:
            p.material_index = base + j
    return obj


def soft_cube(name, size, mats, band, cuts=8, p=4.0):
    """A rounded cube (superellipsoid |x|^p+|y|^p+|z|^p = 1) whose faces take mats[band(centre)]."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        c = v.co
        n = (abs(c.x) ** p + abs(c.y) ** p + abs(c.z) ** p) ** (1 / p)
        v.co = Vector((c.x / n * size[0] / 2, c.y / n * size[1] / 2, c.z / n * size[2] / 2))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for poly in me.polygons:
        poly.material_index = band(poly.center)
        poly.use_smooth = True
    return bi.link(bpy.data.objects.new(name, me))


def steam(k, loc, height=0.36, yaw=24, r=0.046):
    """One soft white S-curl of steam standing in the plane that faces the camera (base at `loc`)."""
    m = k.m('steam', '#F4F8FF', 0.5, emit='#FFFFFF', strength=0.12)
    pts, radii = [], []
    for t in lin(0.0, 1.0, 15):
        pts.append((0.08 * math.sin(t * 2.0 * math.pi) * (1 - 0.25 * t), 0.0, height * t))
        radii.append(r * (1 - 0.75 * t ** 1.6))
    parts = [tube(k.n('steam'), pts, radii, m, sides=8, smooth_angle=80),
             sphere(k.n('steam_cap'), r, (0, 0, 0), m, 8, 6), sphere(k.n('steam_end'), r * 0.25, pts[-1], m, 6, 4)]
    turn(parts, rz=yaw)
    move(parts, loc)
    return parts


PLATE_PROFILE = [(0.0, 0.012), (0.34, 0.0), (0.42, 0.0), (0.5, 0.028), (0.6, 0.064), (0.645, 0.08), (0.632, 0.094),
                 (0.56, 0.078), (0.47, 0.05), (0.42, PLATE_TOP), (0.0, PLATE_TOP)]


def plate(k, sx=1.0, sy=1.0):
    """Cream plate with a cornflower-blue rim; the well top is at PLATE_TOP, radius 0.645 (x sx, y sy)."""
    body = lathe(k.n('plate'), PLATE_PROFILE, (0, 0, 0), k.m('plate', PLATE, 0.28), segments=44, smooth_angle=50)
    rim = torus(k.n('plate_rim'), 0.628, 0.024, (0, 0, 0.088), k.m('plate rim', RIM, 0.3), 44, 6)
    for o in (body, rim):
        o.scale = (sx, sy, 1.0)
    return body


def lemon(k, loc, yaw=0.0, size=0.2):
    """A lemon wedge resting on its rind, both pale cut faces turned up toward the camera."""
    rind, flesh = k.m('lemon', '#FFBA00', 0.3), k.m('lemon flesh', '#FFE45A', 0.3)
    n_len = 9
    angles = lin(RAD(215), RAD(325), 7)
    verts, faces, fm = [], [], []
    rings = []
    for i in range(1, n_len - 1):
        t = i / (n_len - 1)
        x = (t - 0.5) * size * 1.9
        r = size * 0.62 * math.sin(math.pi * t) ** 0.65
        ring = [len(verts)]
        verts.append((x, 0.0, 0.0))
        for a in angles:
            ring.append(len(verts))
            verts.append((x, r * math.cos(a) * -1, r * math.sin(a)))
        rings.append(ring)
    k_ = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(k_):
            jn = (j + 1) % k_
            faces.append((a[j], a[jn], b[jn], b[j]))
            fm.append(1 if j in (0, k_ - 1) else 0)
    for tip_x, ring, rev in ((-size * 0.95, rings[0], True), (size * 0.95, rings[-1], False)):
        tip = len(verts)
        verts.append((tip_x, 0.0, 0.0))
        for j in range(k_):
            jn = (j + 1) % k_
            faces.append((ring[jn], ring[j], tip) if rev else (ring[j], ring[jn], tip))
            fm.append(1 if j in (0, k_ - 1) else 0)
    o = mesh(k.n('lemon'), verts, faces, mats=[rind, flesh], face_mats=fm, smooth_angle=50)
    return place(o, (loc[0], loc[1], loc[2] + size * 0.6), (0, 0, RAD(yaw)))


def parsley(k, loc, seed=1):
    herb = k.m('parsley', '#38B83A', 0.5)
    rng = random.Random(seed)
    for i in range(4):
        a = i * 1.7 + rng.random()
        style.blob(k.n(f'parsley{i}'), 0.055, (loc[0] + 0.06 * math.cos(a), loc[1] + 0.06 * math.sin(a),
                                                loc[2] + 0.03 + 0.02 * (i % 2)), herb, scale=(1, 1, 0.6), subdiv=1,
                   seed=seed + i, wobble=0.25)


# ================================================================ skewer pieces
# Each builder makes one piece at the origin with the stick along X. 'face' pieces are authored
# lying flat (face +Z, top edge +Y) and then stood up toward the camera; 'round' pieces are authored
# upright (+Z up, front toward -Y).
PIECES = {}


def piece(crop, kind, tilt=None):
    def deco(fn):
        PIECES[crop] = (fn, kind, 62 if tilt is None and kind == 'face' else (tilt or 0))
        return fn
    return deco


@piece('radish', 'face', tilt=56)
def p_radish(k, t, rng):
    # Cut top to tail: a white face ringed with pink skin, the leaf tuft up and the root tail down.
    skin = k.food('skin', '#FF2E6E', rough=0.24, warm=0.1, toast=0.04, edge=0.4, char=0.75)
    flesh = k.food('flesh', '#FFEAF0', toast=0.18, edge=0.7, char=0.9)
    tuft = k.food('leaf', '#3FBF3A', char=0.0, toast=0.05)
    z = 0.05      # the cut face sits in front of the stick, which runs through the dome
    lathe(t('skin'), [(0.0, -0.17), (0.09, -0.155), (0.16, -0.11), (0.195, -0.05), (0.2, 0.0)], (0, 0, z), skin,
          segments=18, smooth_angle=70)
    cyl(t('flesh'), 0.15, 0.024, (0, 0, z + 0.004), flesh, verts=18, bev=0.008, seg=1)
    tube(t('root'), [(0, -0.17, z - 0.02), (0.01, -0.25, z - 0.02), (0.04, -0.31, z - 0.02)], [0.04, 0.02, 0.0], skin,
         sides=6, end_tip=True)
    for j, (yaw, length) in enumerate(((-28, 0.15), (0, 0.19), (28, 0.15))):
        leaf(t(f'tuft{j}'), length, 0.05, tuft, loc=(0, 0.17, z - 0.02), rot=(RAD(-10), 0, RAD(yaw)), bend=-0.02,
             segs=4)


@piece('carrot', 'face')
def p_carrot(k, t, rng):
    orange, core = k.food('carrot', '#FF7A14'), k.food('core', '#FFB547', char=0.6)
    lathe(t('coin'), [(0.0, -0.055), (0.16, -0.055), (0.188, -0.03), (0.188, 0.03), (0.16, 0.055), (0.0, 0.055)],
          (0, 0, 0), orange, segments=18, smooth_angle=40)
    cyl(t('core'), 0.085, 0.014, (0, 0, 0.056), core, verts=14, bev=0.004, seg=1)


@piece('pumpkin', 'face')
def p_pumpkin(k, t, rng):
    flesh, skin = k.food('flesh', '#FF9C22'), k.food('skin', '#E8520E', char=0.5)
    seed = k.m('seed', '#FFF1C8', 0.45)
    a0, a1, r0, r1, cy = RAD(52), RAD(128), 0.05, 0.27, -0.15
    arc = [(r1 * math.cos(a), r1 * math.sin(a) + cy) for a in lin(a0, a1, 8)]
    slab(t('wedge'), arc + [(r0 * math.cos(a1), r0 * math.sin(a1) + cy), (r0 * math.cos(a0), r0 * math.sin(a0) + cy)],
         0.075, flesh, chamfer=0.1)
    tube(t('rind'), [(r1 * 1.02 * math.cos(a), r1 * 1.02 * math.sin(a) + cy, 0.0) for a in lin(a0 - 0.04, a1 + 0.04, 8)],
         0.06, skin, sides=8, flat=1.35)
    for j, x in enumerate((-0.05, 0.03)):
        sphere(t(f'seed{j}'), 0.026, (x, -0.04 + 0.03 * j, 0.072), seed, 8, 5, scale=(1.5, 0.8, 0.4))


@piece('mint', 'round')
def p_mint(k, t, rng):
    leafm, vein = k.food('leaf', '#2CCB74', char=0.6), k.food('vein', '#A6F2C2', char=0.3)
    tube(t('roll'), [(0, 0, -0.17), (0, 0, -0.08), (0, 0, 0.06), (0, 0, 0.17)], [0.09, 0.115, 0.115, 0.095], leafm,
         sides=12)
    pts = [(0.118 * math.cos(a), 0.118 * math.sin(a), z) for a, z in zip(lin(RAD(200), RAD(330), 6), lin(-0.13, 0.13, 6))]
    tube(t('edge'), pts, 0.018, vein, sides=5)
    leaf(t('flap'), 0.2, 0.09, leafm, loc=(0.0, -0.1, 0.12), rot=(RAD(-60), RAD(30), RAD(160)), bend=0.04, segs=4)
    leaf(t('flap2'), 0.17, 0.08, leafm, loc=(0.0, -0.08, -0.14), rot=(RAD(60), RAD(-20), RAD(200)), bend=0.04, segs=4)


@piece('chili', 'round')
def p_chili(k, t, rng):
    red, green = k.food('chili', '#F0261A', rough=0.22), k.food('cap', '#3FAE3A', char=0.4)
    s = 1 if rng.random() < 0.5 else -1
    pts = [(0.0, 0.0, 0.19), (0.015 * s, 0, 0.08), (0.0, 0, -0.04), (-0.05 * s, 0, -0.15), (-0.12 * s, 0, -0.21)]
    tube(t('body'), pts, [0.072, 0.08, 0.07, 0.048, 0.0], red, sides=10, end_tip=True, smooth_angle=80)
    cyl(t('cap'), 0.07, 0.04, (0, 0, 0.2), green, verts=10, bev=0.012, seg=1)
    tube(t('stem'), [(0, 0, 0.21), (0.0, 0, 0.27), (0.04 * s, 0, 0.31)], 0.02, green, sides=5)


@piece('candy', 'round')
def p_candy(k, t, rng):
    pink = k.food('candy pink', '#FF3F98', rough=0.22, char=0.55, toast=0.1)
    white = k.food('candy white', '#FFF6FA', rough=0.22, char=0.55, toast=0.14)
    o = sphere(t('ball'), 0.17, (0, 0, 0), pink, 28, 16)

    def swirl(p):   # three white arms twisting from pole to pole
        c = p.center.normalized()
        return 0 if math.sin(3 * math.atan2(c.y, c.x) + 5.5 * math.acos(max(-1.0, min(1.0, c.z)))) > 0 else None
    face_mats(o, [white], swirl)


@piece('bean', 'round')
def p_bean(k, t, rng):
    green = k.food('pod', '#4CC83A')
    pts, radii = [], []
    for u in lin(0.0, 1.0, 13):
        pts.append((0.0, -0.04 * math.sin(math.pi * u), -0.22 + 0.44 * u))
        radii.append(0.078 * math.sin(math.pi * u) ** 0.5 * (0.82 + 0.18 * abs(math.cos(3 * math.pi * u))))
    radii[0] = radii[-1] = 0.0
    tube(t('pod'), pts, radii, green, sides=10, start_tip=True, end_tip=True, flat=0.72, smooth_angle=80)
    tube(t('tip'), [(0, 0, 0.21), (0.0, 0.02, 0.27), (0.03, 0.03, 0.3)], [0.016, 0.012, 0.0], green, sides=5,
         end_tip=True)


@piece('star', 'face')
def p_star(k, t, rng):
    gold, pale = k.food('star', '#FFD21A', rough=0.26), k.food('star core', '#FFF2A2', char=0.5)
    slab(t('slice'), star_outline(5, 0.215, 0.115, sub=1), 0.045, gold, chamfer=0.16)
    slab(t('core'), star_outline(5, 0.085, 0.045), 0.012, pale, chamfer=0.2).location = (0, 0, 0.045)


@piece('berry', 'round')
def p_berry(k, t, rng):
    red = k.food('berry', '#F02848', rough=0.25)
    cap = k.food('cap', '#3FBF3A', char=0.4)
    seed = k.m('seed', '#FFE066', 0.4)
    prof = [(0.0, -0.19), (0.06, -0.165), (0.12, -0.09), (0.162, 0.01), (0.155, 0.09), (0.1, 0.13), (0.0, 0.14)]
    lathe(t('berry'), prof, (0, 0, 0), red, segments=16, smooth_angle=80)
    for j in range(14):
        z = -0.13 + 0.22 * ((j * 0.618) % 1.0)
        a = j * 2.4
        rr = next(r for r, zz in prof if zz >= z) * 0.97
        sphere(t(f'seed{j:02d}'), 0.016, (rr * math.cos(a), rr * math.sin(a), z), seed, 6, 4)
    place(puffy(t('cap'), star_outline(5, 0.13, 0.05, sub=1), 0.025, cap, inner=0.5), (0, 0, 0.14))


@piece('coffee', 'round')
def p_coffee(k, t, rng):
    bean = k.food('bean', '#8A4A26', rough=0.22, toast=0.05, edge=0.4, char=0.45)
    groove = k.m('groove', '#2A130A', 0.4)
    a, b, c = 0.15, 0.12, 0.19
    o = sphere(t('bean'), 1.0, (0, 0, 0), bean, 18, 12)
    for v in o.data.vertices:
        v.co = Vector((v.co.x * a, v.co.y * b * (0.55 if v.co.y < 0 else 1.0), v.co.z * c))
    pts = []
    for z in lin(-0.15, 0.15, 7):
        x = 0.018 * math.sin(z * 22)
        y = -b * 0.55 * math.sqrt(max(0.0, 1 - (x / a) ** 2 - (z / c) ** 2)) - 0.004
        pts.append((x, y, z))
    tube(t('groove'), pts, [0.008, 0.016, 0.02, 0.02, 0.02, 0.016, 0.008], groove, sides=6)


@piece('moonflower', 'face')
def p_moonflower(k, t, rng):
    batter = k.food('batter', '#F7B730', toast=0.2, char=0.5)
    petal = k.m('petal tip', '#FFFFFF', 0.45)
    centre = k.food('centre', '#FFE36A', char=0.3)
    outline = [(x * (1 + 0.06 * (rng.random() - 0.5)), y * (1 + 0.06 * (rng.random() - 0.5)))
               for x, y in flower_outline(0.19, lobes=5, per=4, depth=0.38)]
    puffy(t('floret'), outline, 0.07, batter, inner=0.5, centre=(0, 0))
    for j in range(5):
        a = RAD(90 + 72 * j)
        sphere(t(f'tip{j}'), 0.06, (0.2 * math.cos(a), 0.2 * math.sin(a), 0.012), petal, 10, 6, scale=(1.35, 0.8, 0.55),
               rot=(0, 0, a))
    sphere(t('centre'), 0.065, (0, 0, 0.055), centre, 12, 7, scale=(1, 1, 0.6))


@piece('magnetmelon', 'round')
def p_magnetmelon(k, t, rng):
    red = k.food('rind red', '#EE2630', rough=0.25)
    white = k.food('rind white', '#FFF8F2', rough=0.25, toast=0.1, char=0.7)
    soft_cube(t('cube'), (0.3, 0.29, 0.29), [red, white], lambda c: int((c.x + 0.15) / 0.06) % 2, cuts=9, p=4.5)


@piece('melon', 'face')
def p_melon(k, t, rng):
    flesh = k.food('flesh', '#F2364A', rough=0.28)
    pale = k.food('rind pale', '#D2F2A6', char=0.4)
    rind = k.food('rind', '#2A9A3A', char=0.4)
    seed = k.m('seed', '#2A1A1A', 0.3)
    a0, a1, R, cy = RAD(60), RAD(120), 0.36, -0.2
    arc = [(R * math.cos(a), R * math.sin(a) + cy) for a in lin(a0, a1, 9)]
    slab(t('flesh'), arc + [(0.0, cy + 0.02)], 0.055, flesh, chamfer=0.08)
    tube(t('pale'), [(R * 1.03 * math.cos(a), R * 1.03 * math.sin(a) + cy, 0.0) for a in lin(a0 - 0.02, a1 + 0.02, 9)],
         0.05, pale, sides=8, flat=1.1)
    tube(t('rind'), [(R * 1.12 * math.cos(a), R * 1.12 * math.sin(a) + cy, 0.0) for a in lin(a0 - 0.02, a1 + 0.02, 9)],
         0.042, rind, sides=8, flat=1.4)
    for j, (x, y) in enumerate(((-0.06, 0.02), (0.06, 0.03), (0.0, -0.06), (-0.03, 0.08), (0.04, -0.12))):
        sphere(t(f'seed{j}'), 0.022, (x, y, 0.052), seed, 8, 5, scale=(0.75, 1.3, 0.45))


def clover_outline(r, n=56):
    pts = []
    for i in range(n):
        a = TAU * i / n
        rr = r * (0.4 + 0.6 * abs(math.sin(2 * a)) ** 0.55)
        d = ((a - RAD(45)) % RAD(90)) - RAD(45)
        rr -= r * 0.18 * math.exp(-(d / 0.12) ** 2)
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


@piece('clover', 'face')
def p_clover(k, t, rng):
    green = k.food('clover', '#3FC23A', toast=0.2, edge=0.7, char=0.6)
    light = k.food('clover light', '#A6EC6E', char=0.4)
    puffy(t('crisp'), clover_outline(0.22), 0.045, green, inner=0.55, centre=(0, 0))
    puffy(t('inner'), clover_outline(0.1), 0.012, light, inner=0.5, centre=(0, 0)).location = (0, 0, 0.042)
    tube(t('stem'), [(0.0, -0.05, 0.0), (0.03, -0.2, -0.01), (0.07, -0.28, -0.01)], [0.024, 0.02, 0.016], green,
         sides=5)


@piece('glowshroom', 'round')
def p_glowshroom(k, t, rng):
    cap = k.food('cap', '#2EDCF2', rough=0.28, emit='#1FC8E8', strength=0.2, char=0.7)
    gills = k.food('gills', '#B06A30', char=0.4)
    stem = k.food('stem', '#F2F8FF', char=0.5)
    spot = k.m('spots', '#FFFFFF', 0.4)
    lathe(t('cap'), [(0.2, 0.0), (0.195, 0.045), (0.155, 0.115), (0.085, 0.16), (0.0, 0.172)], (0, 0, -0.02), cap,
          segments=20, smooth_angle=80)
    cyl(t('gills'), 0.186, 0.026, (0, 0, -0.03), gills, verts=20, bev=0.008, seg=1)
    cyl(t('stem'), 0.06, 0.14, (0, 0, -0.1), stem, verts=10, bev=0.02, seg=1)
    for j, (a, z) in enumerate(((250, 0.07), (300, 0.12), (200, 0.11), (20, 0.08))):
        rr = 0.2 * math.sqrt(max(0.0, 1 - ((z + 0.02) / 0.192) ** 2)) * 1.0
        sphere(t(f'spot{j}'), 0.03, (rr * math.cos(RAD(a)), rr * math.sin(RAD(a)), z), spot, 8, 5,
               scale=(1, 1, 0.5))


@piece('iceberry', 'round')
def p_iceberry(k, t, rng):
    blue = k.food('berry', '#2C82F2', rough=0.22, char=0.7)
    crown = k.food('crown', '#173C9C', char=0.0)
    frost = k.m('frost', '#E2F6FF', 0.35)
    sphere(t('berry'), 0.165, (0, 0, 0), blue, 20, 12, scale=(1, 1, 0.92))
    place(puffy(t('crown'), star_outline(5, 0.075, 0.035), 0.022, crown, inner=0.5), (0, 0, 0.148))
    for j, (x, z) in enumerate(((-0.07, 0.06), (0.05, 0.02), (-0.02, -0.08))):
        sphere(t(f'frost{j}'), 0.02, (x, -0.152, z), frost, 6, 4, scale=(1, 0.4, 1))


@piece('goldcorn', 'round')
def p_goldcorn(k, t, rng):
    kernel = k.food('kernels', '#FFC21A', rough=0.25)
    cob = k.food('cob', '#FFE7A2', char=0.5)
    R, L, rows, cols, bump = 0.15, 0.24, 4, 14, 0.026
    na, nl = cols * 4, rows * 6 + 1
    verts, faces, fm = [], [], []
    for i in range(nl):
        u = i / (nl - 1)
        x = (u - 0.5) * L
        for j in range(na):
            a = TAU * j / na
            b = abs(math.cos(math.pi * rows * u + math.pi / 2)) ** 0.5 * abs(math.cos(cols * a / 2)) ** 0.5
            r = (R + bump * b) * (1 - 0.18 * (2 * u - 1) ** 8)
            verts.append((x, r * math.cos(a), r * math.sin(a)))
    for i in range(nl - 1):
        for j in range(na):
            jn = (j + 1) % na
            faces.append((i * na + j, i * na + jn, (i + 1) * na + jn, (i + 1) * na + j))
            fm.append(0)
    for end, x in ((0, -L / 2), (nl - 1, L / 2)):
        c = len(verts)
        verts.append((x, 0.0, 0.0))
        for j in range(na):
            jn = (j + 1) % na
            faces.append((end * na + jn, end * na + j, c) if end == 0 else (end * na + j, end * na + jn, c))
            fm.append(1)
    mesh(t('corn'), verts, faces, mats=[kernel, cob], face_mats=fm, smooth_angle=80)


@piece('dragonfruit', 'round')
def p_dragonfruit(k, t, rng):
    flesh = k.food('flesh', '#FFF4F6', toast=0.1, char=0.7)
    skin = k.food('skin', '#F2308A', rough=0.28)
    seed = k.m('seed', '#1E1418', 0.35)
    soft_cube(t('cube'), (0.29, 0.29, 0.29), [flesh, skin], lambda c: 1 if c.z > 0.095 else 0, cuts=9, p=4.5)
    for j in range(16):
        u, v = (j * 0.618) % 1.0, (j * 0.381 + 0.13) % 1.0
        if j % 2:
            sphere(t(f'seed{j:02d}'), 0.013, (-0.11 + 0.22 * u, -0.146, -0.11 + 0.18 * v), seed, 6, 4, scale=(1, 0.5, 1.3))
        else:
            sphere(t(f'seed{j:02d}'), 0.013, (0.146, -0.11 + 0.22 * u, -0.11 + 0.18 * v), seed, 6, 4, scale=(0.5, 1, 1.3))


@piece('rainbowrose', 'face')
def p_rainbowrose(k, t, rng):
    cols = [k.food(f'petal {n}', c, rough=0.14, char=0.45, toast=0.06)
            for n, c in (('red', '#EE2840'), ('orange', '#FF7A1A'), ('yellow', '#FFC81F'), ('violet', '#9A4FF0'))]
    sugar = k.m('sugar', '#FFFFFF', 0.3, emit='#FFFFFF', strength=0.4)
    for ring, (n, rr, size, tilt, z) in enumerate(((7, 0.15, 0.1, 62, 0.0), (6, 0.1, 0.085, 48, 0.035),
                                                   (5, 0.055, 0.07, 32, 0.07))):
        for j in range(n):
            a = TAU * j / n + ring * 0.5
            sphere(t(f'p{ring}{j}'), size, (rr * math.cos(a), rr * math.sin(a), z), cols[ring], 10, 6,
                   scale=(1.0, 0.42, 1.1), rot=(RAD(tilt), 0, a - math.pi / 2))
    sphere(t('bud'), 0.055, (0, 0, 0.1), cols[3], 10, 7, scale=(1, 1, 0.85))
    for j, (x, y) in enumerate(((0.12, 0.1), (-0.14, 0.04), (0.02, -0.15))):
        sphere(t(f'sugar{j}'), 0.014, (x, y, 0.1), sugar, 6, 4)


SKEW_X = (-0.44, 0.0, 0.44)
SKEWER_ANGLE = 40         # the stick rises this much (degrees) in the image, left to right
PIECE_SCALE = 1.25        # pieces are authored ~0.38 across; on the stick they touch


def skewer(k, crop):
    """Three roasted pieces of `crop` on a light-wood stick, rising to the right, with a steam curl."""
    fn, kind, tilt = PIECES[crop]
    rng = random.Random('skewer ' + crop)
    wood, burnt = k.m('stick', '#F4CB8A', 0.5), k.m('stick tip', '#9A5A2C', 0.55)
    tube(k.n('stick'), [(-0.8, 0, 0), (0.7, 0, 0)], 0.034, wood, sides=8)
    sphere(k.n('stick_end'), 0.036, (-0.8, 0, 0), wood, 8, 5)
    tube(k.n('stick_tip'), [(0.7, 0, 0), (0.78, 0, 0), (0.86, 0, 0)], [0.034, 0.026, 0.0], burnt, sides=8, end_tip=True)
    pieces = []
    for i, x in enumerate(SKEW_X):
        before = names()
        fn(k, lambda tag, i=i: k.n(f'{i}{tag}'), rng)
        parts = new_since(before)
        scale_about(parts, PIECE_SCALE)
        if kind == 'face':
            turn(parts, rx=tilt + rng.uniform(-6, 6), rz=rng.uniform(-10, 10))
        elif crop == 'glowshroom':
            turn(parts, rx=(-125 if i == 1 else -12) + rng.uniform(-6, 6), rz=rng.uniform(-12, 12))
        else:
            turn(parts, rx=tilt + rng.uniform(-12, 12), rz=rng.uniform(-16, 16))
        move(parts, (x, 0, 0))
        pieces += parts
    _fwd, right, up = view_axes(VIEWS['skewer'])
    spin(k.parts(), VIEWS['skewer'], SKEWER_ANGLE - math.degrees(math.atan2(up.x, right.x)))
    first = [o for o in pieces if o.name.startswith(k.n('0'))]
    lo, hi = bounds(first)
    steam(k, ((lo.x + hi.x) / 2 - 0.04, (lo.y + hi.y) / 2 + 0.06, hi.z - 0.06), 0.34, VIEWS['skewer']['yaw'])


# ================================================================ fruit plates
FRUIT_BUILDERS = {}


def fruit(fid):
    def deco(fn):
        FRUIT_BUILDERS[fid] = fn
        return fn
    return deco


@fruit('apple')
def f_apple(k, rng):
    skin = k.food('apple', '#E8303C', rough=0.25, char=0.55)
    caramel = k.food('caramel', '#F09A28', rough=0.12, warm=0.1, toast=0.05, edge=0.35, char=0.0)
    stemm, leafm = k.m('stem', '#7A4A2A', 0.6), k.m('leaf', '#4FBF3A', 0.4)
    T = PLATE_TOP
    prof = [(0.0, 0.0), (0.18, 0.006), (0.31, 0.065), (0.385, 0.18), (0.375, 0.32), (0.31, 0.43), (0.2, 0.48),
            (0.1, 0.47), (0.0, 0.45)]
    apple = lathe(k.n('apple'), prof, (0, 0, T), skin, segments=24, smooth_angle=80)
    for v in apple.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        s = 1 + 0.03 * math.sin(7 * a + v.co.z * 14)
        v.co.x *= s
        v.co.y *= s
    lathe(k.n('caramel'), [(0.0, 0.5), (0.13, 0.495), (0.2, 0.475), (0.235, 0.45), (0.225, 0.44)], (0, 0, T), caramel,
          segments=24, cap_bottom=False, smooth_angle=80)
    for j, (a, length) in enumerate(((235, 0.2), (268, 0.3), (300, 0.17), (205, 0.12))):
        ca, sa = math.cos(RAD(a)), math.sin(RAD(a))
        pts = [(0.225 * ca, 0.225 * sa, T + 0.45), (0.31 * ca, 0.31 * sa, T + 0.41),
               (0.37 * ca, 0.37 * sa, T + 0.42 - length * 0.6), (0.385 * ca, 0.385 * sa, T + 0.42 - length)]
        tube(k.n(f'drip{j}'), pts, [0.04, 0.042, 0.04, 0.046], caramel, sides=7)
        sphere(k.n(f'drop{j}'), 0.05, (0.39 * ca, 0.39 * sa, T + 0.41 - length), caramel, 8, 6)
    style.blob(k.n('pool'), 0.22, (0.05, -0.2, T + 0.004), caramel, scale=(1.5, 1.0, 0.07), subdiv=2, seed=3)
    tube(k.n('stem'), [(0, 0, T + 0.47), (0.02, 0, T + 0.56), (0.06, 0.0, T + 0.62)], [0.03, 0.026, 0.022], stemm,
         sides=6)
    leaf(k.n('leaf'), 0.2, 0.08, leafm, loc=(0.03, 0, T + 0.57), rot=(RAD(20), 0, RAD(-60)), bend=0.04, segs=4)
    return T + 0.6


@fruit('grape')
def f_grape(k, rng):
    grape = k.food('grape', '#8E36DE', rough=0.2, char=0.65, toast=0.1)
    stemm = k.food('stem', '#6E8A2A', char=0.0)
    T, R = PLATE_TOP, 0.125
    spots = [(0.3, 0.12, 0), (0.3, -0.12, 0), (0.08, 0.22, 0), (0.08, 0.0, 0), (0.08, -0.22, 0), (-0.14, 0.11, 0),
             (-0.14, -0.11, 0), (-0.34, 0.0, 0), (0.2, 0.0, 1), (-0.02, 0.11, 1), (-0.02, -0.11, 1), (-0.22, 0.0, 1),
             (0.1, 0.0, 2)]
    for j, (x, y, layer) in enumerate(spots):
        r = R * (0.92 + 0.16 * rng.random())
        sphere(k.n(f'g{j:02d}'), r, (x, y, T + r + layer * 0.15), grape, 14, 9, scale=(1, 1, 0.95))
    tube(k.n('stem'), [(0.25, 0.0, T + 0.33), (0.42, 0.02, T + 0.4), (0.5, 0.06, T + 0.5)], [0.03, 0.026, 0.022],
         stemm, sides=6)
    tube(k.n('twig'), [(0.42, 0.02, T + 0.4), (0.52, -0.04, T + 0.4), (0.56, -0.08, T + 0.44)], 0.016, stemm, sides=5)
    return T + 0.55


@fruit('mango')
def f_mango(k, rng):
    flesh = k.food('mango', '#FFB01A', rough=0.24, char=0.75, toast=0.08)
    skin = k.food('skin', '#F04A2A', char=0.0)
    T = PLATE_TOP
    for h, (cx, cy, rz) in enumerate(((-0.22, 0.07, 18), (0.22, -0.05, -16))):
        before = names()
        cup = lathe(k.n(f'cup{h}'), [(0.0, -0.11), (0.12, -0.1), (0.19, -0.055), (0.212, 0.0)], (0, 0, 0), skin,
                    segments=20, smooth_angle=70)
        cup.scale = (1.0, 1.3, 1.0)
        ax, ay, hm = 0.2, 0.26, 0.12
        for gx in range(-2, 2):
            for gy in range(-2, 3):
                u, v = (gx + 0.5) * 0.095, gy * 0.098
                d = (u / ax) ** 2 + (v / ay) ** 2
                if d > 0.95:
                    continue
                z = hm * (1 - d)
                n = Vector((2 * u / ax ** 2 * hm, 2 * v / ay ** 2 * hm, 1.0)).normalized()
                box(k.n(f'c{h}{gx + 2}{gy + 2}'), (0.082, 0.082, 0.1), (u * 1.08, v * 1.08, z + 0.0),
                    flesh, bev=0.022, seg=2, rot=n.to_track_quat('Z', 'Y').to_euler())
        parts = new_since(before)
        turn(parts, rx=12, rz=rz)
        move(parts, (cx, cy, T + 0.11))
    return T + 0.4


@fruit('pineapple')
def f_pineapple(k, rng):
    flesh = k.food('pineapple', '#FFD21A', rough=0.26, char=0.85)
    rind = k.food('rind', '#E8901A', char=0.4)
    core = k.food('core', '#FFF2A8', char=0.3)
    crown = k.m('crown', '#38B84A', 0.4)
    T = PLATE_TOP
    prof = [(0.068, -0.038), (0.19, -0.038), (0.215, -0.022), (0.215, 0.022), (0.19, 0.038), (0.068, 0.038),
            (0.068, -0.038)]
    for i, (x, y, z, tilt) in enumerate(((0.2, 0.14, 0.2, 58), (-0.02, 0.0, 0.17, 52), (-0.24, -0.14, 0.14, 46))):
        ring = lathe(k.n(f'ring{i}'), prof, (0, 0, 0), flesh, segments=26, cap_top=False, cap_bottom=False,
                     smooth_angle=40)
        face_mats(ring, [rind, core], lambda p: 0 if math.hypot(p.center.x, p.center.y) > 0.2 else
                  (1 if math.hypot(p.center.x, p.center.y) < 0.075 else None))
        place(ring, (x, y, T + z), (RAD(tilt), 0, RAD(-16)))
    for j, (yaw, pitch, length) in enumerate(((0, 18, 0.3), (60, 34, 0.24), (-60, 34, 0.24), (150, 40, 0.2),
                                               (-150, 40, 0.2))):
        leaf(k.n(f'crown{j}'), length, 0.05, crown, loc=(0.36, 0.3, T + 0.02),
             rot=(RAD(90 - pitch), 0, RAD(yaw + 200)), bend=0.05, segs=4)
    return T + 0.42


@fruit('coconut')
def f_coconut(k, rng):
    shell = k.food('shell', '#8A4E2C', rough=0.75, warm=0.0, toast=0.0, edge=0.3, char=0.0)
    flesh = k.food('flesh', '#FFFBF2', toast=0.1, edge=0.9, char=0.7)
    T = PLATE_TOP
    before = names()
    o = lathe(k.n('shell'), [(0.0, -0.3), (0.15, -0.265), (0.255, -0.17), (0.3, -0.06), (0.31, 0.0)], (0, 0, 0),
              shell, segments=22, cap_top=False, smooth_angle=70)
    jr = random.Random(5)
    for v in o.data.vertices:
        v.co *= 1 + 0.03 * (jr.random() - 0.5)
    lathe(k.n('flesh'), [(0.31, 0.0), (0.3, 0.035), (0.26, 0.04), (0.24, 0.0), (0.215, -0.1), (0.13, -0.19),
                         (0.0, -0.215)], (0, 0, 0), flesh, segments=22, cap_top=False, cap_bottom=False,
          smooth_angle=60)
    parts = new_since(before)
    turn(parts, rx=-30)
    lo, _hi = bounds(parts)
    move(parts, (0.04, 0.06, T - lo.z))
    for j, (x, y, rz) in enumerate(((-0.34, -0.22, 20), (-0.12, -0.36, -30), (0.22, -0.34, 60))):
        chip = puffy(k.n(f'chip{j}'), circle(12, 0.1, 1.0, 0.45), 0.025, flesh, inner=0.5)
        for v in chip.data.vertices:
            v.co.z += 0.12 * v.co.x ** 2 * 10
        place(chip, (x, y, T + 0.04), (RAD(10), 0, RAD(rz)))
    return T + 0.5


@fruit('durian')
def f_durian(k, rng):
    husk = k.food('husk', '#9CC23A', rough=0.5, char=0.3)
    spike = k.food('spike', '#6E9A28', char=0.0)
    pith = k.food('pith', '#FFF2C4', char=0.3)
    pod = k.food('pod', '#FFCF36', rough=0.3, char=0.8, toast=0.12)
    T = PLATE_TOP
    before = names()
    lathe(k.n('husk'), [(0.0, -0.27), (0.14, -0.24), (0.24, -0.15), (0.28, -0.04), (0.29, 0.0)], (0, 0, 0), husk,
          segments=18, cap_top=False, smooth_angle=70)
    lathe(k.n('pith'), [(0.29, 0.0), (0.28, 0.03), (0.24, 0.035), (0.22, 0.0), (0.19, -0.1), (0.11, -0.18),
                        (0.0, -0.2)], (0, 0, 0), pith, segments=18, cap_top=False, cap_bottom=False, smooth_angle=60)
    for j in range(26):
        z = -0.02 - 0.24 * ((j * 0.618 + 0.1) % 1.0)
        a = j * 2.39996
        rr = 0.29 * math.sqrt(max(0.0, 1 - (z / 0.28) ** 2))
        p = Vector((rr * math.cos(a), rr * math.sin(a), z))
        n = Vector((p.x, p.y, p.z * 1.1)).normalized()
        o = style.cone(k.n(f'spike{j:02d}'), 0.042, 0.1, (0, 0, 0), spike, verts=4)
        o.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
        o.location = p + n * 0.035
    parts = new_since(before)
    turn(parts, rx=-26, rz=-10)
    lo, _hi = bounds(parts)
    move(parts, (0.12, 0.16, T - lo.z + 0.0))
    for j, (x, y, rz, s) in enumerate(((-0.28, -0.1, 30, 1.0), (-0.02, -0.3, -10, 0.92), (0.3, -0.26, 50, 0.8))):
        style.blob(k.n(f'pod{j}'), 0.13 * s, (x, y, T + 0.1 * s), pod, scale=(1.4, 0.95, 0.8), subdiv=2, seed=11 + j,
                   wobble=0.06).rotation_euler = (0, 0, RAD(rz))
    return T + 0.5


@fruit('lychee')
def f_lychee(k, rng):
    meat = k.food('lychee', '#FFEEF4', rough=0.12, toast=0.1, edge=0.6, char=0.7)
    peel = k.food('peel', '#EE2E4E', rough=0.45, warm=0.1, toast=0.05, edge=0.4, char=0.4)
    leafm = k.m('leaf', '#3FAE3A', 0.4)
    T = PLATE_TOP
    # Two whole lychees (bumpy red peel) behind two peeled ones sitting in the red lower half of theirs.
    for j, (x, y, rz, whole) in enumerate(((-0.2, 0.16, 10, True), (0.18, 0.18, -20, True), (-0.16, -0.14, 30, False),
                                           (0.2, -0.16, -10, False))):
        before = names()
        o = ico(k.n(f'peel{j}'), 0.165, (0, 0, 0), peel, 2, smooth_shading=False)
        if not whole:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.0], context='VERTS')
            bm.to_mesh(o.data)
            bm.free()
            sphere(k.n(f'l{j}'), 0.145, (0, 0, 0.04), meat, 16, 10, scale=(1, 1, 1.08))
        else:
            o.scale = (1, 1, 1.08)
            tube(k.n(f'stem{j}'), [(0, 0, 0.16), (0.02, 0, 0.21)], 0.016, leafm, sides=5)
        jr = random.Random(20 + j)
        for v in o.data.vertices:
            v.co *= 1 + 0.12 * (jr.random() - 0.5)
        parts = new_since(before)
        turn(parts, rx=16, rz=rz)
        lo, _hi = bounds(parts)
        move(parts, (x, y, T - lo.z))
    leaf(k.n('leaf'), 0.26, 0.09, leafm, loc=(0.3, 0.3, T + 0.02), rot=(RAD(-8), 0, RAD(-60)), bend=0.04, segs=4)
    leaf(k.n('leaf2'), 0.22, 0.08, leafm, loc=(0.3, 0.3, T + 0.02), rot=(RAD(-8), 0, RAD(10)), bend=0.04, segs=4)
    return T + 0.4


@fruit('peach')
def f_peach(k, rng):
    skin = k.food('skin', '#FF6A78', rough=0.35, char=0.0)
    flesh = k.food('flesh', '#FFB02A', rough=0.22, char=0.9, toast=0.1)
    blush = k.food('blush', '#F25A30', rough=0.22, char=0.6)
    pit = k.m('pit', '#8E2A1E', 0.5)
    T = PLATE_TOP
    for h, (cx, cy, rz) in enumerate(((-0.2, 0.08, 10), (0.21, -0.07, -12))):
        before = names()
        lathe(k.n(f'skin{h}'), [(0.0, -0.21), (0.12, -0.185), (0.195, -0.105), (0.225, 0.0)], (0, 0, 0), skin,
              segments=22, cap_top=False, smooth_angle=80)
        lathe(k.n(f'flesh{h}'), [(0.225, 0.0), (0.212, 0.022), (0.0, 0.03)], (0, 0, 0), flesh, segments=22,
              cap_bottom=False, smooth_angle=40)
        cyl(k.n(f'blush{h}'), 0.1, 0.012, (0, 0, 0.03), blush, verts=18, bev=0.004, seg=1)
        sphere(k.n(f'pit{h}'), 0.068, (0, 0, 0.03), pit, 14, 8, scale=(0.85, 1.15, 0.42))
        parts = new_since(before)
        turn(parts, rx=24, rz=rz)
        lo, _hi = bounds(parts)
        move(parts, (cx, cy, T - lo.z))
    return T + 0.38


def fruit_plate(k, fid):
    top = FRUIT_BUILDERS[fid](k, random.Random('plate ' + fid))
    plate(k, ROUND, ROUND)
    steam(k, (-0.1, 0.2, top - 0.1), 0.34, VIEWS['plate']['yaw'])


# ================================================================ fish plates
FISH_POSE = dict(roll=-72, heading=-90, wag=0.22)
FISH_POSES = {
    'eel': dict(wag=0.7), 'jelly': dict(roll=0, wag=0.0), 'kraken': dict(roll=0, wag=0.12),
    'manta': dict(roll=0, heading=0, wag=0.25), 'sunfish': dict(roll=0, wag=0.1),
}
FISH_LEN = 1.28
OVAL = (0.95, 0.62)
DISH_YAW = -16


def roast_fish_material(m, golden):
    if m.name in EYES or m.get('roasted'):
        return
    roast(m, 'fish', warm=0.32, toast=0.28, edge=0.6, char=0.82, width=0.2, rough=0.22, coat=0.25,
          emit_scale=0.3 if golden else 0.5)


def fish_plate(k, fid):
    pose = dict(FISH_POSE, **FISH_POSES.get(fid[5:], {}))
    root = bpy.data.objects[fid]
    srcs = sorted((o for o in root.children_recursive if o.type == 'MESH'), key=lambda o: o.name)
    for o in srcs:
        if o.name.endswith('_tail'):
            o.rotation_euler.z = pose['wag']
    bpy.context.view_layer.update()
    fish = []
    for o in srcs:
        mw = o.matrix_world.copy()
        c = o.copy()
        c.data = o.data.copy()
        c.name = k.n(o.name.rsplit('_', 1)[-1])
        bi.link(c)
        c.parent = None
        c.matrix_world = mw
        fish.append(c)
        for m in c.data.materials:
            roast_fish_material(m, fid == 'fish_golden')
    lo, hi = bounds(fish)
    centre = (lo + hi) / 2
    move(fish, -centre)
    scale_about(fish, FISH_LEN / max(hi.x - lo.x, hi.y - lo.y))
    turn(fish, ry=pose['roll'])
    turn(fish, rz=pose['heading'])
    lo, hi = bounds(fish)
    move(fish, (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2 + 0.03, PLATE_TOP + 0.004 - lo.z))
    lo, hi = bounds(fish)
    plate(k, *OVAL)
    lemon(k, (0.36, -0.2, PLATE_TOP), yaw=-30, size=0.2)
    parsley(k, (-0.42, 0.2, PLATE_TOP), seed=len(fid))
    turn(k.parts(), rz=DISH_YAW)     # no steam: at 52 px it read as a stray tick beside the long fish


# ================================================================ meat and farm dishes
def meat_plate(k):
    k.food('meat', '#D8743A', rough=0.28, warm=0.15, toast=0.18, edge=0.6, char=0.85)
    k.food('skin', '#F2A060', rough=0.3, char=0.4)
    k.m('bone', '#FFF3DE', 0.4)
    before = names()
    bi.BUILDERS['meat'][0](k)
    ham = new_since(before)
    turn(ham, ry=22)
    lo, hi = bounds(ham)
    move(ham, (-(lo.x + hi.x) / 2 - 0.04, -(lo.y + hi.y) / 2, -lo.z))
    scale_about(ham, 1.02)
    lo, hi = bounds(ham)
    move(ham, (0, 0, PLATE_TOP - lo.z))
    plate(k, ROUND, ROUND)
    steam(k, (-0.2, 0.18, hi.z - 0.14), 0.34, VIEWS['plate']['yaw'])


def b_omelette(k):
    egg = k.food('omelette', '#FFC92A', rough=0.32, warm=0.08, toast=0.03, edge=0.5, char=0.0)
    sauce = k.m('ketchup', '#E01E2C', 0.22)
    herb = k.m('parsley', '#38B83A', 0.5)
    T = PLATE_TOP
    arc = [(0.5 * math.cos(a), -0.36 * math.sin(a)) for a in lin(0.0, math.pi, 17)][::-1]
    outline = arc + [(0.32, 0.03), (0.0, 0.045), (-0.32, 0.03)]
    om = puffy(k.n('omelette'), outline, 0.125, egg, inner=0.55, centre=(0.0, -0.13))
    for v in om.data.vertices:
        v.co.z += 0.06 * max(0.0, v.co.y + 0.1) * (1 if v.co.z > 0 else 0.3)
        v.co.z = max(v.co.z, -0.07)
    om.location = (0, 0.06, T + 0.07)
    zz = []
    for j, x in enumerate(lin(-0.3, 0.3, 7)):
        y = -0.03 + (0.1 if j % 2 else -0.08)
        z = surface_z(om, x, y + 0.06)
        zz.append((x, y + 0.06, (z or T + 0.2) + 0.012))
    tube(k.n('ketchup'), zz, 0.024, sauce, sides=7, smooth_angle=80)
    for j, (x, y) in enumerate(((-0.22, 0.12), (0.08, -0.06), (0.25, 0.1), (-0.05, 0.15))):
        z = surface_z(om, x, y)
        sphere(k.n(f'herb{j}'), 0.024, (x, y, (z or T + 0.2) + 0.01), herb, 6, 4, scale=(1.3, 0.8, 0.4),
               rot=(0, 0, j))
    plate(k, ROUND, ROUND)
    steam(k, (-0.12, 0.22, T + 0.18), 0.32, VIEWS['plate']['yaw'])


def b_pancake(k):
    top = k.food('pancake', '#E0943A', rough=0.38, warm=0.0, toast=0.04, edge=0.45, char=0.0)
    side = k.m('pancake side', '#FFDA8E', 0.55)
    butter = k.m('butter', '#FFF09A', 0.3)
    syrup = k.m('syrup', '#C2541A', 0.08)
    T, h = PLATE_TOP, 0.088
    for j in range(3):
        cake = lathe(k.n(f'cake{j}'), [(0.0, 0.0), (0.33, 0.0), (0.36, 0.018), (0.372, 0.044), (0.358, 0.07),
                                        (0.322, 0.085), (0.0, 0.088)], (0.012 * (j - 1), -0.01 * j, T + 0.002 + h * j),
                     top, segments=30, smooth_angle=40)
        face_mats(cake, [side], lambda p: 0 if abs(p.normal.z) < 0.55 else None)
    zt = T + 0.002 + h * 3
    lathe(k.n('syrup'), [(0.0, zt + 0.012), (0.24, zt + 0.008), (0.3, zt - 0.002), (0.31, zt - 0.012)], (0, -0.02, 0),
          syrup, segments=28, cap_bottom=False, smooth_angle=80)
    for j, (a, length) in enumerate(((250, 0.2), (285, 0.12), (220, 0.15), (320, 0.08))):
        ca, sa = math.cos(RAD(a)), math.sin(RAD(a))
        pts = [(0.3 * ca, 0.3 * sa - 0.02, zt - 0.008), (0.36 * ca, 0.36 * sa - 0.02, zt - 0.03),
               (0.378 * ca, 0.378 * sa - 0.02, zt - length)]
        tube(k.n(f'drip{j}'), pts, [0.03, 0.03, 0.036], syrup, sides=7)
        sphere(k.n(f'drop{j}'), 0.038, pts[-1], syrup, 8, 6)
    box(k.n('butter'), (0.16, 0.14, 0.07), (0.02, -0.02, zt + 0.045), butter, bev=0.025, seg=2, rot=(0, 0, RAD(22)))
    plate(k, ROUND, ROUND)
    steam(k, (-0.14, 0.18, zt + 0.0), 0.32, VIEWS['plate']['yaw'])


def b_milkshake(k):
    glass = k.m('glass', '#E8F6FF', 0.06, alpha=0.24)
    foot = k.m('glass foot', '#BFE8FF', 0.1)
    shake = k.m('shake', '#FF73AA', 0.28)
    cream = k.m('cream', '#FFFDF8', 0.45)
    cherry = k.m('cherry', '#E5122C', 0.14)
    stemm = k.m('stem', '#3F9A3A', 0.45)
    red, white = k.m('straw', '#F0303A', 0.35), k.m('straw white', '#FFFFFF', 0.4)
    lathe(k.n('foot'), [(0.0, 0.0), (0.24, 0.0), (0.25, 0.02), (0.2, 0.042), (0.07, 0.06), (0.055, 0.15), (0.0, 0.16)],
          (0, 0, 0), foot, segments=24, smooth_angle=50)
    bi.filled_jar(k, [(0.0, 0.15), (0.12, 0.16), (0.21, 0.24), (0.27, 0.42), (0.295, 0.66), (0.0, 0.66)],
                  [(0.297, 0.64), (0.31, 0.72), (0.318, 0.76)], shake, glass, segs=24)
    top = lathe(k.n('cream'), [(0.0, 0.66), (0.3, 0.66), (0.33, 0.7), (0.29, 0.75), (0.3, 0.79), (0.22, 0.85),
                               (0.23, 0.88), (0.13, 0.95), (0.06, 1.0), (0.0, 1.03)], (0, 0, 0), cream, segments=32,
                smooth_angle=70)
    for v in top.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        s = 1 + 0.07 * math.cos(8 * a + v.co.z * 6)
        v.co.x *= s
        v.co.y *= s
    sphere(k.n('cherry'), 0.09, (0.02, -0.03, 1.1), cherry, 14, 9)
    tube(k.n('cherry_stem'), [(0.02, -0.03, 1.17), (0.04, -0.02, 1.25), (0.1, 0.0, 1.3)], 0.014, stemm, sides=5)
    a, b = Vector((0.1, 0.06, 0.45)), Vector((0.3, 0.16, 1.32))
    for j in range(8):
        p, q = a.lerp(b, j / 8), a.lerp(b, (j + 1) / 8)
        tube(k.n(f'straw{j}'), [p, q], 0.034, (red, white)[j % 2], sides=10)


def b_cheese(k):
    rind = k.m('cheese', '#FFBC1A', 0.38)
    cut = k.m('cheese cut', '#FFE27A', 0.45)
    hole = k.m('cheese hole', '#E8961A', 0.6)
    wood, dark = k.m('board', '#D08A48', 0.55), k.m('board dark', '#8A4B25', 0.6)
    outline = [(0.56 * math.cos(a), 0.56 * math.sin(a)) for a in lin(RAD(12), RAD(348), 30)]
    outline += [(0.6, -0.09), (0.86, -0.08), (0.9, -0.05), (0.9, 0.05), (0.86, 0.08), (0.6, 0.09)]
    handle = RAD(42)          # the handle points back right, so the icon stays compact
    place(slab(k.n('board'), outline, 0.04, wood, chamfer=0.05, centre=(0.0, 0.0)), (0, 0, 0.04), (0, 0, handle))
    cyl(k.n('board_hole'), 0.03, 0.084, (0.82 * math.cos(handle), 0.82 * math.sin(handle), 0.04), dark, verts=10,
        bev=0.0)
    mouth, half, R, H, B = RAD(-62), RAD(26), 0.42, 0.13, 0.08
    wheel = [(0.0, 0.0)] + [(R * math.cos(a), R * math.sin(a)) for a in lin(mouth + half, mouth + TAU - half, 30)]
    w = slab(k.n('wheel'), wheel, H, rind, chamfer=0.06, centre=(-0.08 * math.cos(mouth), -0.08 * math.sin(mouth)))
    planes = [Vector((-math.sin(mouth + s * half), math.cos(mouth + s * half), 0.0)) for s in (1, -1)]
    face_mats(w, [cut], lambda p: 0 if min(abs(p.center.dot(n)) for n in planes) < 0.02 and
              math.hypot(p.center.x, p.center.y) < R * 0.97 else None)
    place(w, (-0.06, 0.04, B + H))
    wedge = [(0.0, 0.0)] + [(R * math.cos(a), R * math.sin(a)) for a in lin(mouth - half * 0.9, mouth + half * 0.9, 6)]
    wd = slab(k.n('wedge'), wedge, H, rind, chamfer=0.06)
    face_mats(wd, [cut], lambda p: 0 if abs(p.normal.z) < 0.5 and math.hypot(p.center.x, p.center.y) < R * 0.9
              else None)
    place(wd, (-0.06 + 0.16 * math.cos(mouth), 0.04 + 0.16 * math.sin(mouth), B + H), (0, 0, RAD(8)))
    for j, (s, r, z, size) in enumerate(((1, 0.16, 0.05, 0.05), (1, 0.3, -0.04, 0.04), (-1, 0.22, 0.03, 0.045),
                                         (-1, 0.32, -0.06, 0.035), (1, 0.08, -0.06, 0.035))):
        a = mouth + s * half
        p = Vector((r * math.cos(a), r * math.sin(a), 0.0))
        sphere(k.n(f'hole{j}'), size, (p.x - 0.06, p.y + 0.04, B + H + z), hole, 10, 6)
    for j, (r, a, size) in enumerate(((0.2, 60, 0.05), (0.3, 150, 0.04), (0.12, 200, 0.035), (0.33, 230, 0.045))):
        sphere(k.n(f'top{j}'), size, (r * math.cos(RAD(a)) - 0.06, r * math.sin(RAD(a)) + 0.04, B + 2 * H), hole, 10,
               6, scale=(1, 1, 0.35))


def b_guard(k):
    blue = k.m('shield', '#3A8EEA', 0.28)
    gold = k.m('rim', '#FFC21F', 0.26, 0.35)
    paw = k.m('paw', '#FFFFFF', 0.38)
    half = [(0.0, 0.5), (0.2, 0.47), (0.38, 0.42), (0.47, 0.38), (0.48, 0.2), (0.45, 0.0), (0.37, -0.22),
            (0.24, -0.42), (0.1, -0.56), (0.0, -0.6)]
    outline = half + [(-x, y) for x, y in reversed(half[1:-1])]
    outline = outline[::-1]
    slab(k.n('rim'), outline, 0.07, gold, chamfer=0.1, centre=(0, 0))
    inner = [(x * 0.84, y * 0.84 - 0.01) for x, y in outline]
    place(puffy(k.n('face'), inner, 0.07, blue, inner=0.6, centre=(0, -0.01)), (0, 0, 0.04))
    pad = [(0.13 * math.cos(a) * (1 + 0.18 * math.sin(a)), 0.1 * math.sin(a) - 0.02 * math.cos(2 * a))
           for a in lin(0, TAU, 21)[:-1]]
    place(puffy(k.n('pad'), pad, 0.035, paw, inner=0.5, centre=(0, 0)), (0, -0.12, 0.13))
    for j, (x, y, r) in enumerate(((-0.17, 0.03, 0.055), (-0.065, 0.12, 0.06), (0.065, 0.12, 0.06), (0.17, 0.03, 0.055))):
        place(puffy(k.n(f'toe{j}'), circle(14, r, 0.85, 1.1), 0.03, paw, inner=0.5), (x, y, 0.125),
              (0, 0, RAD(-x * 120)))
    sphere(k.n('stud'), 0.045, (0, 0.43, 0.07), gold, 10, 6)
    turn(k.parts(), rx=90)
    turn(k.parts(), rz=-6, ry=-6)


# ================================================================ registry and build
DISHES = {}
for _c in CROPS:
    DISHES[f'cooked_{_c}'] = ('skewer', lambda k, c=_c: skewer(k, c))
for _f in FRUITS:
    DISHES[f'cooked_{_f}'] = ('plate', lambda k, f=_f: fruit_plate(k, f))
for _f in FISH:
    DISHES[f'cooked_fish_{_f}'] = ('fish', lambda k, f=_f: fish_plate(k, f'fish_{f}'))
DISHES['cooked_meat'] = ('plate', meat_plate)
DISHES.update(omelette=('plate', b_omelette), pancake=('plate', b_pancake), milkshake=('glass', b_milkshake),
              cheese=('plate', b_cheese), guard=('badge', b_guard))
assert list(DISHES) == DISH_IDS and len(DISH_IDS) == 51


def build(iid):
    cat, fn = DISHES[iid]
    before = names()
    fn(Dish(iid, cat))
    return style.join(new_since(before), iid)


# ================================================================ icons
def render_icons(objs):
    """build_items.render_icons' studio and save loop, with one camera per category."""
    style.studio(size=(ICON_SIZE, ICON_SIZE), transparent=True)
    bi._eevee(48)
    scene = bpy.context.scene
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value = 0.6
    scene.view_settings.exposure = -0.15
    for light in bpy.data.objects:
        if light.type == 'LIGHT':
            light.data.angle = RAD(22)
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    os.makedirs(ICONS, exist_ok=True)
    written = {}
    for iid, obj in objs.items():
        for o in objs.values():
            o.hide_render = o is not obj
        view = VIEWS[DISHES[iid][0]]
        cam = bi.icon_camera(obj, view['elevation'], view['yaw'], view['margin'])
        bpy.ops.render.render(write_still=False)
        result = bpy.data.images['Render Result']
        path = os.path.join(ICONS, iid + '.webp')
        for quality in QUALITIES:
            scene.render.image_settings.quality = quality
            result.save_render(path, scene=scene)
            if os.path.getsize(path) <= ICON_LIMIT:
                break
        bpy.data.objects.remove(cam, do_unlink=True)
        written[iid] = dict(bytes=os.path.getsize(path), quality=quality, **inspect_icon(path))
    return written


def inspect_icon(path):
    """Size, transparency and how much of the frame the subject fills (alpha bounding box)."""
    img = bpy.data.images.load(path)
    w, h = img.size
    alpha = img.pixels[:][3::4]
    bpy.data.images.remove(img)
    xs = [i % w for i, a in enumerate(alpha) if a > 0.1]
    ys = [i // w for i, a in enumerate(alpha) if a > 0.1]
    fill = [round((max(xs) - min(xs) + 1) / w, 3), round((max(ys) - min(ys) + 1) / h, 3)] if xs else [0, 0]
    edge = bool(xs) and (min(xs) == 0 or min(ys) == 0 or max(xs) == w - 1 or max(ys) == h - 1)
    return dict(size=[w, h], fill=fill, touches_edge=edge, transparent=min(alpha) == 0, opaque=max(alpha) > 0.95)


# ===================================================================== main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(only=None, install=False, render=False)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--only':
            opts['only'], i = argv[i + 1], i + 1
        elif a.startswith('--only='):
            opts['only'] = a.split('=', 1)[1]
        elif a in ('--install', '--render'):
            opts[a[2:]] = True
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    if opts['only']:
        ids = [s.strip() for s in opts['only'].split(',') if s.strip()]
        unknown = [s for s in ids if s not in DISHES]
        if unknown:
            raise SystemExit(f'unknown dish ids: {unknown}')
        opts['only'] = [s for s in DISH_IDS if s in ids]
    return opts


def main():
    t0 = time.time()
    opts = parse_args()
    ids = opts['only'] or DISH_IDS
    style.reset_scene()
    imported = set()
    if any(i.startswith('cooked_fish_') for i in ids):
        bpy.ops.import_scene.gltf(filepath=FISH_GLB)
        imported = names()
    objs = {iid: build(iid) for iid in ids}
    for name in imported:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    t_build = time.time() - t0
    icons = render_icons(objs)

    manifest = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as fh:
            manifest = json.load(fh)
    old = manifest.get('icons', {})
    entries = {i: icons.get(i, old.get(i)) for i in DISH_IDS if i in icons or i in old}
    manifest.update(generator='art/blender/kit/build_dishes.py', blender=bpy.app.version_string,
                    size=[ICON_SIZE, ICON_SIZE], limit=ICON_LIMIT, views=VIEWS, icons=entries)
    os.makedirs(GEN, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')

    failures = []
    for iid in DISH_IDS:
        path = os.path.join(ICONS, iid + '.webp')
        if not os.path.exists(path):
            failures.append(f'{iid}: icon missing')
        elif os.path.getsize(path) > ICON_LIMIT:
            failures.append(f'{iid}: icon is {os.path.getsize(path)} bytes (> {ICON_LIMIT})')
    for iid in ids:
        s = icons[iid]
        print(f"  {iid:24s} {s['bytes']:5d} B q{s['quality']}  fill {s['fill']}{'  EDGE' if s['touches_edge'] else ''}")
        if s['size'] != [ICON_SIZE, ICON_SIZE] or not (s['transparent'] and s['opaque']):
            failures.append(f'{iid}: wrong size or no transparent/opaque pixels {s}')
    sizes = [icons[i]['bytes'] for i in ids]
    print(f'  {len(ids)} icons, {min(sizes)}-{max(sizes)} B, total {sum(sizes)} B; '
          f'build {t_build:.1f} s, total {time.time() - t0:.1f} s')
    if opts['render']:
        have = [i for i in DISH_IDS if os.path.exists(os.path.join(ICONS, i + '.webp'))]
        bi.ICONS = ICONS
        bi.contact_sheet(have, PREVIEW, cols=9)
        print('  preview', os.path.relpath(PREVIEW, REPO))
    if failures:
        raise RuntimeError('Dish icon failures:\n  ' + '\n  '.join(failures))
    if opts['install']:
        os.makedirs(PUBLIC_ICONS, exist_ok=True)
        assets = {}
        for iid in DISH_IDS:
            shutil.copy2(os.path.join(ICONS, iid + '.webp'), os.path.join(PUBLIC_ICONS, iid + '.webp'))
            assets[iid] = {'file': f'icons/items/{iid}.webp', 'bytes': os.path.getsize(os.path.join(ICONS, iid + '.webp'))}
        with open(ASSET_MANIFEST, encoding='utf-8') as fh:
            asset_manifest = json.load(fh)
        asset_manifest['dishes'] = {'generator': 'art/blender/kit/build_dishes.py', 'size': [ICON_SIZE, ICON_SIZE],
                                    'assets': assets}
        with open(ASSET_MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(asset_manifest, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        print('installed', len(assets), 'icons')
    print('\nDish icons OK')


if __name__ == '__main__':
    main()
