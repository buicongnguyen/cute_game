"""Zoo Garden creatures: the wild creatures the explorer fights, redrawn with believable anatomy.

The game used to build its creatures from a few code primitives per family (src/world.ts
speciesModel). This kit gives them real heads, snouts, ears, eyes with highlights, paws, claws,
tufts and faces while keeping the bright toon look: flat colours, smooth shading, no textures.
Every creature is a root empty named the creature id (src/enemy-types.ts ENEMY_TYPES) with one
child mesh per rigid part, named `<id>_<part>`, whose translation is the part's pivot (hip or
shoulder) so the game's walk swing and wing flap keep working. Parts per family match the old
shapes, so no creature costs more draw calls than before:

    legged  body, leg_fl, leg_fr, leg_bl, leg_br   (boar, wolf, croc, crab; crab legs hold two legs each)
    winged  body, wing_l, wing_r                    (bee)
    solid   body                                    (mushroom, mushking, frog, chomper, cactus, bear, treant)

All designs are original. See CONTRACT.md, "Creatures".

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_creatures.py -- [--install] [--render] [--debug DIR]

Outputs:
    art/generated/kit/models/creatures.glb        one top-level node per creature
    art/generated/kit/creatures-manifest.json     per creature: triangles, bounds, parts, pivots
    art/previews/kit/creatures.webp               (with --render) the render sheet
--install copies creatures.glb to public/assets/models/ and the manifest into art/asset-manifest.json
(key "creatures"). --debug DIR writes a close-up per creature.

Blender is Z up with -Y as the front; glTF is Y up with +Z as the front, in metres, at the game's
model scale before enemyScale (bosses are drawn 1.85x by the game). The build exits non-zero when a
creature breaks the contract (parts, budgets, height, ground) or the file grows past its limit.
"""
import bpy
import json
import math
import os
import shutil
import sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import mat, render, reset_scene  # noqa: E402
from build_weapons import (Geo, Piece, triangulate, xf, scl, facing, lathe, sphere, cyl, cone, tube, bez,  # noqa: E402
                           sweep, sec_super, slab, leaf_outline, ell_point, decal, add_eye, surface_arc, new_empty,
                           _eye_height)
import build_wilds  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
MANIFEST = os.path.join(GEN, 'creatures-manifest.json')
ASSET_MANIFEST = os.path.join(REPO, 'art', 'asset-manifest.json')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
HERO_GLB = os.path.join(PUBLIC_MODELS, 'hero.glb')
GLB_NAME = 'creatures.glb'
GLB_LIMIT = 900 * 1024
TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))

LEGGED = ['body', 'leg_fl', 'leg_fr', 'leg_bl', 'leg_br']
WINGED = ['body', 'wing_l', 'wing_r']
SOLID = ['body']
# id: (parts, boss, target height in metres before enemyScale). Heights follow the old shapes (src/enemy-types.ts
# ENEMY_SCALE notes) so pick circles, target arrows and HP bars stay where they were; +-20 % is allowed.
CREATURES = dict(
    mushroom=(SOLID, False, 2.35), boar=(LEGGED, False, 1.45), bee=(WINGED, False, 1.65), wolf=(LEGGED, False, 1.5),
    chomper=(SOLID, False, 2.2), frog=(SOLID, False, 1.45), cactus=(SOLID, False, 2.05), crab=(LEGGED, False, 1.35),
    bear=(SOLID, True, 2.3), treant=(SOLID, True, 3.0), croc=(LEGGED, True, 1.95), mushking=(SOLID, True, 2.7),
    # the other planets
    gummy=(LEGGED, False, 1.5), jelly=(SOLID, False, 1.45), snowball=(SOLID, False, 1.45), penguin=(SOLID, False, 1.55),
    icebloom=(SOLID, False, 2.2), magmaslime=(SOLID, False, 1.45), minislime=(SOLID, False, 1.45),
    firelizard=(LEGGED, False, 1.3), magmacrab=(LEGGED, False, 1.35), chameleon=(LEGGED, False, 1.3),
    flytrap=(SOLID, False, 2.2), cloudsheep=(LEGGED, False, 1.45), yeti=(SOLID, True, 2.4), mammoth=(LEGGED, True, 2.1),
)
IDS = list(CREATURES)
FLYING = {'bee'}  # hovers: its lowest point is a dangling leg
BUDGET = dict(common=2500, boss=5000)


# =============================================================== materials
COLOURS = dict(
    eye='#1C1B2E', glint='#FFFFFF', ink='#3A2433', blush='#FF8FB0', ivory='#FFF4DC', tongue='#E8607A', maw='#7A1F35',
    gold='#F5B21E', gem='#E8335A', gem_blue='#35B6F2',
    # mushrooms
    stem='#FFF0D8', gill='#F2C9A8', cap='#EF3B3B', spot='#FFFDF6', shoe='#C9824E', king_cap='#E95685',
    king_spot='#FFE27A', moustache='#FFFDF6',
    # boar
    boar='#A9744F', boar_dark='#5E3A26', boar_belly='#D9A47A', snout='#F0A08C', hoof='#3E2A22',
    # wolf
    wolf='#8F9BB3', wolf_dark='#5D6782', wolf_light='#EEF1F7', nose='#232030', ear_in='#F4A6B8',
    # croc
    croc='#4F9E5A', croc_dark='#2F6E3C', croc_belly='#D8EBA0', claw='#FFF1D2',
    # crab
    crab='#FF6A4D', crab_dark='#C9402E', crab_belly='#FFE1C7',
    # bee
    wasp='#FFD23F', wasp_dark='#2E2836', wing='#DDF3FF',
    # frog
    frog='#6FD35A', frog_dark='#3E9E3A', frog_belly='#EAF7B5', frog_spot='#A56BFF',
    # chomper
    plant='#58C24A', plant_dark='#2F9A3A', plant_light='#9BE36A', petal='#FF4F7A', petal_light='#FF9CC0',
    # cactus
    cactus='#4CB86B', cactus_dark='#2E8A4F', spine='#FFF1D2', sand='#E8C27A', flower='#FF5C8A', flower_eye='#FFC83A',
    # bear
    bear='#8B5A3C', bear_dark='#5A3624', bear_light='#EBC69A', cape='#D8243B', ermine='#FFFDF6',
    # treant
    bark='#8A5A3B', bark_dark='#5E3A24', leaf='#4FBF5A', leaf_light='#86E05A', leaf_dark='#2F9A3A', hollow='#2E1A10',
    glow='#FFE066', blossom='#FF9CC8',
    # the other planets
    jelly='#FF6FAE', jelly_light='#FFC2DD', magma='#FF6A2B', rock='#4A3F4F', rock_light='#7A6A80', lava='#FF8A2A',
    snow='#F4FAFF', carrot='#FF8A2A', twig='#8E5634', fire='#FF7A45', fire_dark='#C9462A', fire_belly='#FFD39A',
    flame='#FF5A1F', cham='#67A978', cham_dark='#3F7E52', cham_belly='#D8EFA8', wool='#F3F4FF', wool_shade='#D9DEFA',
    sheep_face='#6B6F9E', bolt='#FFD23F', penguin='#34405A', beak='#FF9A2A', scarf='#E8335A', mammoth='#8A5A3B',
    mammoth_dark='#5E3A24', gummy='#8FF0D0', gummy_dark='#4FC9A8', gummy_light='#EFFFF9', gummy_nose='#FF6FAE',
    trap='#48B43B', trap_dark='#2A7E26', trap_petal='#EE6998', trap_petal_light='#FFB3CC', ice='#9FE8FF',
    ice_dark='#5CB8E0', ice_light='#E6FAFF', ice_petal='#FFFFFF', ice_petal_light='#CDEFFF', ice_maw='#2B4C9B',
    ice_tongue='#8FDBFF', yeti='#EEF4FF', yeti_dark='#A8C8FF', yeti_light='#BFD9FF', navy='#2B4C9B',
)
ROUGH = dict(jelly=0.25, gummy=0.25, magma=0.35, eye=0.15, glint=0.3, gold=0.3, gem=0.2, gem_blue=0.2, wing=0.3, ivory=0.35, claw=0.35)


def creature_materials():
    out = {}
    for k, v in COLOURS.items():
        m = mat('Creature ' + k.replace('_', ' '), v, ROUGH.get(k, 0.5), 0.0)
        m.use_backface_culling = True
        out[k] = m
    return out


# ================================================================ helpers
def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def E(c, r, segs=12, rings=8, rot=None):
    """An ellipsoid centred on c with radii r, optionally turned by rot (Euler, radians). Small ones get fewer
    segments: at game zoom a 10 cm ball reads the same with 6 sides as with 12."""
    big = max(r)
    if big < 0.1:
        segs, rings = min(segs, 6), min(rings, 4)
    elif big < 0.2:
        segs, rings = min(segs, 8), min(rings, 5)
    elif big < 0.32:
        segs, rings = min(segs, 10), min(rings, 6)
    g = sphere(1.0, segs, rings, scale=r)
    return g.transformed(xf(c, rot)) if rot else g.moved(c)


def surf(c, r, d, lift=0.0):
    p, n = ell_point(c, r, d)
    return p + n * lift, n


def eye(P, c, r, d, size, m, squash=1.25, segs=8):
    """A glossy dark eye on an ellipsoid with a big and a small glint (the highlights)."""
    p, n = ell_point(c, r, d)
    add_eye(P, p, n, size, m['eye'], m['glint'], squash=squash, segs=segs, glint=True)


def eyes(P, c, r, d, size, m, squash=1.25, segs=8):
    for side in (-1, 1):
        eye(P, c, r, (side * d[0], d[1], d[2]), size, m, squash, segs)


def brows(P, c, r, inner, outer, thick, material, lift=0.02):
    """Two brow bars; an inner end lower than the outer end reads as grumpy."""
    for side in (-1, 1):
        a, n = surf(c, r, (side * inner[0], inner[1], inner[2]), lift)
        b, _ = surf(c, r, (side * outer[0], outer[1], outer[2]), lift)
        P.add(tube([a, (a + b) / 2 + n * thick * 0.4, b], [thick * 0.8, thick, thick * 0.7], sides=4, cap=thick * 0.4),
              material)


def mouth(P, c, r, d, width, depth, thick, material, lift=None):
    """A smile (depth > 0) or a frown (depth < 0) drawn on an ellipsoid."""
    pts, n0 = surface_arc(c, r, d, width, depth, n=5, lift=thick * 0.6 if lift is None else lift)
    P.add(tube(pts, thick, sides=4, cap=thick * 0.5, binormal=n0), material)


def absorb(P, CP, matrix):
    """Moves a finished sub-piece (a cap, a head) by `matrix` and appends it to P with its materials."""
    CP.transform(matrix)
    base = len(P.verts)
    P.verts.extend(CP.verts)
    for f, mi, sm in zip(CP.faces, CP.mats, CP.smooth):
        P.faces.append(tuple(base + i for i in f))
        P.mats.append(P.slot(CP.materials[mi]))
        P.smooth.append(sm)


def spike(P, base, tip, r, material, sides=4):
    P.add(cone(V(base), V(tip), r, sides), material)


def crown(P, c, r, h, m, tilt=(0.0, 0.0, 0.0), points=5):
    """A gold crown: a flared band with points tipped by balls and gems on the front."""
    M = xf(c, tilt)
    band = lathe([(r, 0.0), (r * 1.06, h * 0.5), (r * 1.12, h)], 12, cap_bottom=0.0).outward()
    P.add(sphere(1.0, 10, 5, scale=(r * 0.98, r * 0.98, r * 0.75)).moved((0, 0, h * 0.35)), m['cape'], M)
    P.add(band, m['gold'], M)
    for i in range(points):
        a = TAU * i / points - math.pi / 2
        base = V(math.cos(a) * r * 1.05, math.sin(a) * r * 1.05, h * 0.85)
        P.add(cone(base, base + V(math.cos(a) * r * 0.1, math.sin(a) * r * 0.1, h * 0.62), r * 0.3, 5), m['gold'], M)
        P.add(sphere(r * 0.11, 6, 4).moved(base + V(math.cos(a) * r * 0.11, math.sin(a) * r * 0.11, h * 0.66)),
              m['gold'], M)
        gem = 'gem' if i % 2 == 0 else 'gem_blue'
        P.add(sphere(1.0, 6, 4, scale=(r * 0.13, r * 0.07, r * 0.15)).transformed(
            xf(V(math.cos(a) * r * 1.11, math.sin(a) * r * 1.11, h * 0.45), (0, 0, a + math.pi / 2))), m[gem], M)


def trunk(yc, L, A, C, Z, p=2.4, ts=(-1.0, -0.92, -0.7, -0.3, 0.3, 0.7, 0.92, 1.0), n=14):
    """A rounded body: superellipse sections swept along Y, rounded off at both ends (as the cow)."""
    path, secs = [], []
    for t in ts:
        f = (1 - abs(t) ** 3) ** (1 / 3)
        path.append(V(0, yc + t * L, Z))
        secs.append([(0.0, 0.0)] if f < 1e-4 else sec_super(A * f, C * f, n, p))
    return sweep(path, secs, (0, 0, 1), None, None, None).outward()


def leaf(length, width, thick=0.04, n=5):
    return slab(leaf_outline(length, width, n), thick, bev=thick * 0.3, dome=0.01)


# ================================================================ model
class Model:
    """A root empty with one child mesh per named part; a child's origin is its pivot."""

    def __init__(self, cid, pivots):
        self.id = cid
        self.parts = CREATURES[cid][0]
        self.pivots = {k: V(tuple(round(c, 4) for c in pivots.get(k, (0, 0, 0)))) for k in self.parts}
        self.pieces = {k: Piece(f'{cid}_{k}') for k in self.parts}

    def __getitem__(self, part):
        return self.pieces[part]

    def realise(self):
        root = new_empty(self.id, 0.3)
        parts = {}
        for name in self.parts:
            obj = triangulate(self.pieces[name].build(offset=self.pivots[name], sharp=80))
            obj.parent = root
            obj.location = self.pivots[name]
            parts[name] = obj
        return dict(id=self.id, root=root, parts=parts, meshes=[parts[n] for n in self.parts])


def legged_pivots(lx, yf, yb, hz, body=(0, 0, 0)):
    return dict(body=body, leg_fl=(-lx, yf, hz), leg_fr=(lx, yf, hz), leg_bl=(-lx, yb, hz), leg_br=(lx, yb, hz))


def legs4(M, lx, yf, yb, hz):
    """(part, x, y) for the four legs; right parts are on +X (as the farm animals)."""
    return (('leg_fl', -lx, yf), ('leg_fr', lx, yf), ('leg_bl', -lx, yb), ('leg_br', lx, yb))


# ============================================================== mushrooms
def build_mushroom(cid, m, king=False):
    """A chubby stem with a grumpy face, stubby arms and shoes, under a dome cap with gills and spots.
    The king wears a magenta cap with gold spots, a white moustache and a crown."""
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    stem = lathe([(0.36, 0.1), (0.46, 0.3), (0.52, 0.65), (0.51, 1.0), (0.45, 1.3), (0.38, 1.55)], 14,
                 cap_bottom=0.0, cap_top=0.0).outward()
    P.add(stem, m['stem'])
    H, HR = V(0, 0, 0.7), (0.52, 0.52, 0.6)
    eyes(P, H, HR, (0.36, -1, 0.14), 0.115, m, squash=1.3)
    brows(P, H, HR, (0.1, -1, 0.3), (0.52, -1, 0.5), 0.035, m['ink'])
    if king:
        # A curled white moustache instead of a frown.
        for side in (-1, 1):
            a, n = surf(H, HR, (side * 0.04, -1, -0.12), 0.03)
            b, _ = surf(H, HR, (side * 0.3, -1, -0.2), 0.04)
            c = b + V(side * 0.08, -0.02, 0.07)
            P.add(tube(bez([a, b + V(0, -0.03, -0.02), c], 5), [0.055, 0.07, 0.06, 0.045, 0.02], sides=6, cap=0.01),
                  m['moustache'])
        mouth(P, H, HR, (0, -1, -0.38), 0.08, -0.025, 0.022, m['ink'])
    else:
        mouth(P, H, HR, (0, -1, -0.22), 0.13, -0.045, 0.026, m['ink'])
        for side in (-1, 1):
            decal(P, H, HR, (side * 0.6, -1, -0.12), 0.07, 0.045, m['blush'], lift=0.004, n=8)
    # Stubby arms (fists on the hips: grumpy) and shoes.
    for side in (-1, 1):
        P.add(E((side * 0.5, -0.04, 0.6), (0.1, 0.11, 0.18), 8, 6, rot=(0, side * RAD(-25), 0)), m['stem'])
        P.add(E((side * 0.58, -0.06, 0.44), (0.1, 0.1, 0.09), 8, 5), m['stem'])
        P.add(E((side * 0.22, -0.12, 0.11), (0.17, 0.25, 0.11), 10, 6), m['shoe'])
    # Cap: the top half of an ellipsoid with a gilled underside, leaning back so the high game camera
    # still sees the face under the brim.
    C0, CR = V(0, 0, 1.42), (0.96, 0.96, 0.88 if not king else 0.92)
    CP = Piece('cap')
    rows = [(CR[0] * math.cos(t), C0.z + CR[2] * math.sin(t)) for t in (RAD(a) for a in (0, 15, 32, 50, 66, 80))]
    prof = [(0.0, 1.57), (0.34, 1.56), (0.66, 1.49), (CR[0] * 0.995, 1.4)] + rows + [(0.0, C0.z + CR[2])]
    capm = m['king_cap' if king else 'cap']
    CP.add(lathe(prof, 20, tag=lambda b, s: 1 if b < 3 else 0).outward(), {0: capm, 1: m['gill']})
    for i in range(18):
        a = TAU * i / 18
        d = V(math.cos(a), math.sin(a), 0)
        t = d.cross(UP) * 0.008
        a0, a1 = d * 0.38 + V(0, 0, 1.55), d * 0.88 + V(0, 0, 1.43)
        verts = [a0 - t, a1 - t, a1 - t - V(0, 0, 0.06), a0 - t - V(0, 0, 0.04),
                 a0 + t, a1 + t, a1 + t - V(0, 0, 0.06), a0 + t - V(0, 0, 0.04)]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        CP.add(Geo(verts, faces).outward(), m['gill'])
    spot = m['king_spot' if king else 'spot']
    for d, r in (((0, 0, 1), 0.19), ((0.55, -0.55, 0.55), 0.16), ((-0.6, -0.45, 0.5), 0.14), ((0.1, -0.9, 0.3), 0.12),
                 ((-0.75, 0.3, 0.45), 0.15), ((0.7, 0.4, 0.4), 0.14), ((0.1, 0.8, 0.45), 0.16), ((-0.3, -0.2, 0.9), 0.1)):
        decal(CP, C0, CR, d, r, r * 0.9, spot, lift=0.006, n=9, dome=0.025)
    if king:
        crown(CP, V(0, 0, C0.z + CR[2] - 0.05), 0.25, 0.2, m)
    absorb(P, CP, Matrix.Translation(C0) @ Matrix.Rotation(RAD(-14), 4, 'X') @ Matrix.Translation(-C0))
    return M


# ================================================================== boar
def build_boar(cid, m):
    lx, yf, yb, hz = 0.28, -0.4, 0.55, 0.62
    M = Model(cid, legged_pivots(lx, yf, yb, hz, body=(0, 0.1, hz)))
    P = M['body']
    P.add(trunk(0.12, 0.74, 0.46, 0.43, 0.8), m['boar'])
    P.add(E((0, -0.22, 0.95), (0.44, 0.44, 0.4), 12, 8), m['boar'])            # shoulder hump
    P.add(E((0, 0.12, 0.5), (0.34, 0.62, 0.18), 10, 6), m['boar_belly'])
    H, HR = V(0, -0.72, 0.8), (0.34, 0.36, 0.32)
    P.add(E(H, HR, 14, 9), m['boar'])
    P.add(cyl(V(0, -0.88, 0.74), V(0, -1.16, 0.66), 0.2, 0.19, sides=12, cap=0.0), m['boar'])
    P.add(cyl(V(0, -1.15, 0.66), V(0, -1.2, 0.66), 0.205, 0.2, sides=12, cap=0.012), m['snout'])
    for side in (-1, 1):
        P.add(E((side * 0.07, -1.215, 0.67), (0.035, 0.012, 0.05), 6, 4), m['hoof'])
        # Tusks curl up and out past the snout.
        pts = bez([V(side * 0.15, -1.06, 0.58), V(side * 0.25, -1.16, 0.64), V(side * 0.22, -1.12, 0.82)], 5)
        P.add(tube(pts, [0.045, 0.042, 0.035, 0.024, 0.008], sides=6, cap=0.006), m['ivory'])
        # Pointed ears, a little floppy.
        P.add(cone(V(side * 0.2, -0.6, 1.02), V(side * 0.36, -0.52, 1.24), 0.1, 4), m['boar_dark'])
    eyes(P, H, HR, (0.5, -0.78, 0.36), 0.065, m)
    brows(P, H, HR, (0.15, -0.9, 0.48), (0.62, -0.7, 0.6), 0.03, m['boar_dark'])
    # Bristly mane along the spine and a tufted tail.
    for i in range(7):
        t = i / 6
        y = -0.62 + t * 0.95
        z = 1.3 - 0.25 * (t - 0.35) ** 2 * 3 if i else 1.12
        z = max(1.05, 1.33 - abs(y + 0.22) * 0.38)
        P.add(cone(V(0, y, z - 0.08), V(0, y + 0.14, z + 0.13), 0.085, 5), m['boar_dark'])
    pts = bez([V(0, 0.84, 0.98), V(0, 1.0, 1.06), V(0, 1.02, 0.86)], 5)
    P.add(tube(pts, 0.032, sides=5, cap=0.0), m['boar'])
    P.add(cone(pts[-1] + V(0, 0, 0.03), pts[-1] + V(0, 0.02, -0.13), 0.06, 5), m['boar_dark'])
    for name, x, y in legs4(M, lx, yf, yb, hz):
        L = M[name]
        L.add(tube([V(x, y, hz + 0.1), V(x, y - 0.02, 0.32), V(x, y, 0.13)], [0.15, 0.115, 0.1], sides=8), m['boar'])
        L.add(cyl(V(x, y - 0.01, 0.15), V(x, y - 0.015, 0.0), 0.105, 0.118, sides=8, cap=0.0), m['hoof'])
    return M


# ================================================================== wolf
def build_wolf(cid, m):
    lx, yf, yb, hz = 0.2, -0.32, 0.58, 0.72
    M = Model(cid, legged_pivots(lx, yf, yb, hz, body=(0, 0.1, hz)))
    P = M['body']
    P.add(trunk(0.22, 0.6, 0.31, 0.32, 0.86), m['wolf'])
    P.add(E((0, -0.28, 0.9), (0.36, 0.4, 0.41), 12, 8), m['wolf'])               # deep chest
    P.add(E((0, 0.12, 1.1), (0.2, 0.62, 0.12), 10, 6), m['wolf_dark'])          # saddle
    P.add(E((0, -0.55, 1.05), (0.24, 0.26, 0.28), 10, 6, rot=(RAD(-30), 0, 0)), m['wolf'])  # neck
    for x in (-0.12, 0.0, 0.12):                                                # chest ruff
        P.add(cone(V(x, -0.58, 0.88), V(x * 1.2, -0.68, 0.6), 0.11, 5), m['wolf_light'])
    H, HR = V(0, -0.76, 1.15), (0.27, 0.28, 0.25)
    P.add(E(H, HR, 14, 9), m['wolf'])
    P.add(tube([V(0, -0.9, 1.09), V(0, -1.05, 1.06), V(0, -1.18, 1.03)], [0.15, 0.12, 0.09], sides=10, cap=0.03),
          m['wolf_light'])
    P.add(E((0, -1.2, 1.07), (0.055, 0.04, 0.045), 8, 5), m['nose'])
    P.add(E((0, -1.02, 1.12), (0.1, 0.16, 0.06), 8, 5, rot=(RAD(-8), 0, 0)), m['wolf'])   # bridge of the nose
    mouth(P, V(0, -1.04, 1.05), (0.12, 0.16, 0.09), (0, -0.6, -0.8), 0.06, -0.02, 0.012, m['ink'])
    for side in (-1, 1):
        P.add(cone(V(side * 0.14, -0.72, 1.32), V(side * 0.2, -0.7, 1.55), 0.095, 4), m['wolf'])
        P.add(cone(V(side * 0.14, -0.755, 1.33), V(side * 0.19, -0.74, 1.49), 0.055, 4), m['ear_in'])
        P.add(cone(V(side * 0.22, -0.78, 1.08), V(side * 0.38, -0.7, 1.0), 0.08, 5), m['wolf_light'])   # cheek ruff
    eyes(P, H, HR, (0.42, -0.82, 0.3), 0.06, m)
    brows(P, H, HR, (0.12, -0.9, 0.42), (0.55, -0.7, 0.55), 0.026, m['wolf_dark'])
    pts = bez([V(0, 0.78, 1.0), V(0, 1.08, 1.02), V(0, 1.26, 0.72)], 6)
    P.add(tube(pts, [0.08, 0.13, 0.15, 0.14, 0.1, 0.03], sides=8, cap=0.0,
               tag=None), m['wolf'])
    P.add(E(pts[-2] + V(0, 0.02, -0.06), (0.1, 0.1, 0.13), 8, 5), m['wolf_light'])
    for name, x, y in legs4(M, lx, yf, yb, hz):
        L = M[name]
        back = name.startswith('leg_b')
        knee = V(x, y + (0.09 if back else 0.02), 0.4)
        L.add(tube([V(x, y, hz + 0.1), knee, V(x, y - 0.02, 0.1)], [0.12 if back else 0.11, 0.075, 0.065], sides=8),
              m['wolf'])
        L.add(E((x, y - 0.05, 0.065), (0.085, 0.115, 0.065), 8, 5), m['wolf_light'])
    return M


# ================================================================== croc
def build_croc(cid, m):
    lx, yf, yb, hz = 0.42, -0.25, 0.7, 0.56
    M = Model(cid, legged_pivots(lx, yf, yb, hz, body=(0, 0.2, hz)))
    P = M['body']
    P.add(trunk(0.25, 0.78, 0.5, 0.32, 0.62), m['croc'])
    P.add(E((0, 0.25, 0.42), (0.44, 0.72, 0.16), 10, 6), m['croc_belly'])
    tail = bez([V(0, 0.95, 0.6), V(0.1, 1.5, 0.45), V(0.4, 2.0, 0.22)], 7)
    P.add(tube(tail, [0.34, 0.3, 0.24, 0.18, 0.12, 0.07, 0.015], sides=9, cap=0.0), m['croc'])
    for i, p in enumerate(tail[:-1]):
        r = [0.34, 0.3, 0.24, 0.18, 0.12, 0.07][i]
        spike(P, p + V(0, 0, r * 0.75), p + V(0, 0.06, r + 0.1), 0.06, m['croc_dark'])
    neck = [V(0, -0.4, 0.7), V(0, -0.68, 0.96), V(0, -0.84, 1.2)]
    P.add(tube(neck, [0.38, 0.32, 0.27], sides=10, cap=0.0), m['croc'])
    H = V(0, -0.95, 1.32)
    P.add(E(H, (0.3, 0.3, 0.2), 12, 7), m['croc'])
    # Upper jaw: a long flat snout; lower jaw hangs open below it with a tongue between.
    up = [V(0, -0.98, 1.32), V(0, -1.35, 1.26), V(0, -1.72, 1.2)]
    P.add(sweep(up, [sec_super(0.12, 0.27, 10, 2.5), sec_super(0.1, 0.22, 10, 2.5), sec_super(0.08, 0.17, 10, 2.5)],
                (1, 0, 0), None, 0.0, 0.04).outward(), m['croc'])
    lo = [V(0, -0.98, 1.12), V(0, -1.32, 1.0), V(0, -1.64, 0.9)]
    P.add(sweep(lo, [sec_super(0.07, 0.25, 10, 2.5), sec_super(0.06, 0.2, 10, 2.5), sec_super(0.05, 0.15, 10, 2.5)],
                (1, 0, 0), None, 0.0, 0.04).outward(), m['croc'])
    P.add(E((0, -1.3, 1.1), (0.15, 0.32, 0.05), 8, 5, rot=(RAD(14), 0, 0)), m['tongue'])
    P.add(E((0, -1.3, 1.17), (0.2, 0.36, 0.06), 8, 5, rot=(RAD(10), 0, 0)), m['maw'])
    for side in (-1, 1):
        for i in range(5):
            t = 0.12 + i * 0.2
            y = -1.06 - t * 0.6
            zu = 1.32 - t * 0.12 - 0.1
            w = 0.25 - t * 0.08
            spike(P, (side * w, y, zu + 0.02), (side * w, y - 0.01, zu - 0.1), 0.028, m['ivory'])
            zl = 1.12 - t * 0.22 + 0.05
            spike(P, (side * (w - 0.02), y + 0.05, zl - 0.02), (side * (w - 0.02), y + 0.05, zl + 0.08), 0.024,
                  m['ivory'])
        B = V(side * 0.15, -0.92, 1.5)
        P.add(E(B, (0.12, 0.12, 0.1), 10, 6), m['croc'])
        eye(P, B, (0.12, 0.12, 0.1), (side * 0.35, -0.85, 0.4), 0.07, m)
        a, _ = surf(B, (0.12, 0.12, 0.1), (side * 0.1, -0.7, 0.8), 0.015)
        b, _ = surf(B, (0.12, 0.12, 0.1), (side * 0.9, -0.4, 0.75), 0.015)
        P.add(tube([a - V(0, 0, 0.02), b + V(0, 0, 0.03)], 0.025, sides=4, cap=0.01), m['croc_dark'])
        P.add(E((side * 0.06, -1.74, 1.29), (0.04, 0.04, 0.03), 6, 4), m['croc_dark'])
    for y in (-0.35, -0.12, 0.1, 0.32, 0.54, 0.76):
        for x in (-0.18, 0.18):
            spike(P, (x, y, 0.88), (x, y + 0.04, 1.02), 0.06, m['croc_dark'])
    crown(P, V(0, -0.8, 1.44), 0.2, 0.25, m, tilt=(RAD(12), 0, 0))
    for name, x, y in legs4(M, lx, yf, yb, hz):
        L = M[name]
        s = 1 if x > 0 else -1
        L.add(tube([V(x, y, hz + 0.06), V(x + s * 0.22, y, 0.42), V(x + s * 0.26, y - 0.04, 0.1)], [0.16, 0.13, 0.11],
                   sides=8), m['croc'])
        F = V(x + s * 0.27, y - 0.12, 0.06)
        L.add(E(F, (0.13, 0.2, 0.07), 8, 5), m['croc'])
        for dx in (-0.07, 0.0, 0.07):
            spike(L, F + V(dx, -0.16, 0.0), F + V(dx * 1.2, -0.28, -0.03), 0.03, m['claw'])
    return M


# ================================================================== crab
def build_crab(cid, m):
    hz = 0.6
    piv = dict(body=(0, 0, hz), leg_fl=(-0.6, -0.08, hz), leg_fr=(0.6, -0.08, hz), leg_bl=(-0.6, 0.26, hz),
               leg_br=(0.6, 0.26, hz))
    M = Model(cid, piv)
    P = M['body']
    S, SR = V(0, 0, 0.68), (0.78, 0.58, 0.36)
    P.add(E(S, SR, 18, 9), m['crab'])
    P.add(E((0, 0.02, 0.52), (0.64, 0.48, 0.2), 12, 6), m['crab_belly'])
    for d, r in (((0, 0.1, 1), 0.16), ((0.5, 0.2, 0.8), 0.12), ((-0.5, 0.2, 0.8), 0.12), ((0.3, 0.6, 0.7), 0.1),
                 ((-0.3, 0.6, 0.7), 0.1)):
        decal(P, S, SR, d, r, r * 0.8, m['crab_dark'], lift=0.006, n=8, dome=0.02)
    for side in (-1, 1):
        for k in range(3):       # serrated shell rim
            a = RAD(-60 + k * 22)
            p, n = surf(S, SR, (side * math.sin(-a), -math.cos(a), 0.05), -0.02)
            spike(P, p, p + n * 0.13 + V(0, -0.02, 0.02), 0.06, m['crab_dark'])
        stalk = [V(side * 0.17, -0.38, 0.88), V(side * 0.21, -0.45, 1.06)]
        P.add(tube(stalk, [0.055, 0.045], sides=6, cap=0.0), m['crab'])
        B, BR = V(side * 0.22, -0.47, 1.14), (0.11, 0.11, 0.11)
        P.add(E(B, BR, 10, 7), m['crab_belly'])
        eye(P, B, BR, (side * 0.2, -1, 0.15), 0.075, m, segs=8)
        a, _ = surf(B, BR, (-side * 0.3, -0.6, 0.8), 0.02)
        b, _ = surf(B, BR, (side * 0.6, -0.4, 0.95), 0.02)
        P.add(tube([a - V(0, 0, 0.02), b + V(0, 0, 0.02)], 0.022, sides=4, cap=0.01), m['ink'])
        # Arm and a big pincer, one finger open.
        arm = bez([V(side * 0.6, -0.3, 0.62), V(side * 0.9, -0.55, 0.6), V(side * 0.74, -0.86, 0.7)], 4)
        P.add(tube(arm, [0.1, 0.09, 0.085, 0.085], sides=7, cap=0.0), m['crab'])
        C = V(side * 0.72, -1.0, 0.72)
        P.add(E(C, (0.22, 0.27, 0.18), 12, 7), m['crab'])
        P.add(tube([C + V(0, -0.15, 0.06), C + V(-side * 0.04, -0.34, 0.13), C + V(-side * 0.08, -0.48, 0.1)],
                   [0.11, 0.08, 0.02], sides=7, cap=0.0), m['crab'])
        P.add(tube([C + V(0, -0.15, -0.07), C + V(-side * 0.03, -0.3, -0.13), C + V(-side * 0.05, -0.42, -0.11)],
                   [0.08, 0.06, 0.015], sides=6, cap=0.0), m['crab_dark'])
    mouth(P, S, SR, (0, -1, -0.15), 0.1, -0.035, 0.022, m['ink'])
    for name, pv in (('leg_fl', piv['leg_fl']), ('leg_fr', piv['leg_fr']), ('leg_bl', piv['leg_bl']),
                     ('leg_br', piv['leg_br'])):
        L = M[name]
        s = 1 if pv[0] > 0 else -1
        for dy in (-0.09, 0.09):
            y = pv[1] + dy
            pts = [V(s * 0.6, y, 0.62), V(s * 0.98, y + dy * 0.6, 0.86), V(s * 1.18, y + dy * 1.3, 0.04)]
            L.add(tube(bez([pts[0], pts[1], pts[1] + V(s * 0.06, 0, 0), pts[2]], 5), [0.075, 0.07, 0.06, 0.045, 0.012],
                       sides=6, cap=0.0), m['crab'])
    return M


# =================================================================== bee
def build_bee(cid, m):
    sh = (0.16, 0.0, 1.27)
    M = Model(cid, dict(body=(0, 0, 1.0), wing_l=(-sh[0], sh[1], sh[2]), wing_r=sh))
    P = M['body']
    P.add(E((0, -0.02, 1.02), (0.27, 0.3, 0.27), 12, 8), m['wasp_dark'])
    decal(P, V(0, -0.02, 1.02), (0.27, 0.3, 0.27), (0, -0.4, 1), 0.12, 0.08, m['wasp'], lift=0.005, n=8)
    H, HR = V(0, -0.4, 1.12), (0.3, 0.26, 0.27)
    P.add(E(H, HR, 14, 9), m['wasp'])
    eyes(P, H, HR, (0.5, -0.72, 0.18), 0.13, m, squash=1.35)
    brows(P, H, HR, (0.1, -1, 0.45), (0.58, -0.7, 0.62), 0.03, m['wasp_dark'])
    mouth(P, H, HR, (0, -1, -0.38), 0.07, -0.025, 0.018, m['ink'])
    for side in (-1, 1):
        p, n = surf(H, HR, (side * 0.25, -1, -0.55))
        spike(P, p, p + V(-side * 0.04, -0.08, -0.1), 0.035, m['wasp_dark'])
        ant = bez([V(side * 0.08, -0.5, 1.33), V(side * 0.12, -0.66, 1.56), V(side * 0.27, -0.62, 1.62)], 4)
        P.add(tube(ant, 0.02, sides=4, cap=0.0), m['wasp_dark'])
        P.add(sphere(0.042, 6, 4).moved(ant[-1]), m['wasp_dark'])
        for y in (-0.12, 0.0, 0.12):
            leg = [V(side * 0.14, y, 0.86), V(side * 0.3, y - 0.06, 0.74), V(side * 0.28, y + 0.06, 0.58)]
            P.add(tube(leg, [0.03, 0.025, 0.02], sides=4, cap=0.01), m['wasp_dark'])
    belly = bez([V(0, 0.16, 0.98), V(0, 0.58, 0.98), V(0, 0.92, 0.7)], 8)
    P.add(tube(belly, [0.14, 0.27, 0.32, 0.32, 0.28, 0.21, 0.12, 0.03], sides=12, cap=0.0,
               tag=lambda b, s: 1 if b in (1, 3, 5) else 0), {0: m['wasp'], 1: m['wasp_dark']})
    spike(P, belly[-1] + V(0, -0.02, 0.02), belly[-1] + V(0, 0.15, -0.1), 0.035, m['wasp_dark'])
    # Wings: a fore and a hind wing per side, origin at the shoulder, swept back and up.
    for name, side in (('wing_l', -1), ('wing_r', 1)):
        W = M[name]
        for size, back, lift in (((0.42, 0.18, 0.022), 0.08, 0.1), ((0.3, 0.13, 0.02), 0.26, 0.05)):
            c = V(side * (sh[0] + size[0] * 0.92), sh[1] + back, sh[2] + lift)
            W.add(E(c, size, 10, 5, rot=(0, side * RAD(-14), side * RAD(-24))), m['wing'])
    return M


# ================================================================== frog
def build_frog(cid, m):
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    B, BR = V(0, 0.14, 0.52), (0.6, 0.62, 0.45)
    P.add(E(B, BR, 14, 9), m['frog'])
    H, HR = V(0, -0.3, 0.78), (0.55, 0.43, 0.37)
    P.add(E(H, HR, 16, 9), m['frog'])
    P.add(E((0, -0.42, 0.6), (0.43, 0.3, 0.25), 12, 7), m['frog_belly'])
    for d, r in (((0, 0.3, 1), 0.14), ((0.55, 0.4, 0.6), 0.11), ((-0.55, 0.4, 0.6), 0.11), ((0.3, 0.8, 0.5), 0.1),
                 ((-0.3, 0.8, 0.5), 0.1), ((0, 0.9, 0.2), 0.09)):
        decal(P, B, BR, d, r, r * 0.85, m['frog_spot'], lift=0.006, n=8, dome=0.02)
    for side in (-1, 1):
        K, KR = V(side * 0.3, -0.36, 1.16), (0.23, 0.22, 0.23)
        P.add(E(K, KR, 12, 8), m['frog'])
        eye(P, K, KR, (side * 0.25, -0.95, 0.35), 0.15, m, squash=1.15)
        # Heavy lid: a grumpy half-closed look.
        a, _ = surf(K, KR, (-side * 0.25, -0.75, 0.75), 0.012)
        b, _ = surf(K, KR, (side * 0.7, -0.5, 0.65), 0.012)
        P.add(tube([a - V(0, 0, 0.03), (a + b) / 2 + V(0, -0.04, 0.02), b + V(0, 0, 0.03)], [0.03, 0.045, 0.03],
                   sides=5, cap=0.01), m['frog_dark'])
        decal(P, H, HR, (side * 0.72, -0.7, -0.15), 0.07, 0.045, m['blush'], lift=0.004, n=8)
        # Front legs with three round toes.
        P.add(tube([V(side * 0.34, -0.45, 0.5), V(side * 0.42, -0.6, 0.24), V(side * 0.42, -0.66, 0.07)],
                   [0.1, 0.08, 0.07], sides=7, cap=0.0), m['frog'])
        for dx in (-0.08, 0.0, 0.08):
            P.add(sphere(1.0, 6, 4, scale=(0.045, 0.05, 0.035)).moved((side * 0.42 + dx, -0.76, 0.035)), m['frog_belly'])
        # Folded back legs: thigh, shin and a big webbed foot.
        P.add(E((side * 0.5, 0.32, 0.38), (0.22, 0.38, 0.25), 10, 7, rot=(RAD(-20), 0, side * RAD(-10))), m['frog'])
        P.add(tube([V(side * 0.6, 0.52, 0.24), V(side * 0.66, 0.2, 0.12), V(side * 0.68, -0.08, 0.06)],
                   [0.1, 0.08, 0.06], sides=7, cap=0.0), m['frog'])
        P.add(E((side * 0.7, -0.2, 0.035), (0.17, 0.22, 0.035), 10, 4), m['frog_dark'])
        for dx in (-0.1, 0.0, 0.1):
            P.add(sphere(1.0, 6, 4, scale=(0.045, 0.05, 0.03)).moved((side * 0.7 + dx, -0.4, 0.03)), m['frog_belly'])
    mouth(P, H, HR, (0, -1, -0.32), 0.36, 0.035, 0.024, m['ink'])
    return M


# =============================================================== chomper
def build_chomper(cid, m):
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    for i in range(5):        # ground leaves
        a = TAU * i / 5 + 0.3
        d = V(math.cos(a), math.sin(a), 0.18).normalized()
        P.add(leaf(0.75, 0.38, 0.05), m['plant_dark' if i % 2 else 'plant'], facing(V(0, 0, 0.05), V(-d.x * 0.18, -d.y * 0.18, 1), d))
    stem = bez([V(0, 0.12, 0.05), V(0, 0.35, 0.7), V(0, 0.05, 1.15), V(0, -0.04, 1.36)], 7)
    P.add(tube(stem, [0.17, 0.15, 0.13, 0.12, 0.12, 0.13, 0.15], sides=8, cap=0.0), m['plant_dark'])
    for side, z in ((-1, 0.62), (1, 0.9)):
        p = V(0, 0.25, z)
        P.add(leaf(0.55, 0.26, 0.04), m['plant'], facing(p, V(0, -0.3, 1), V(side, 0.1, 0.45)))
    H, HR = V(0, -0.1, 1.6), (0.5, 0.48, 0.45)
    # Petal collar behind the head.
    for i in range(9):
        a = TAU * i / 9 + math.pi / 2
        c = H + V(math.cos(a) * 0.4, 0.2, math.sin(a) * 0.4)
        P.add(E(c, (0.17, 0.045, 0.3), 8, 5, rot=(0, math.pi / 2 - a, 0)), m['petal' if i % 2 else 'petal_light'])
    P.add(E(H, HR, 16, 10), m['plant'])
    for d, r in (((0.6, 0.2, 0.8), 0.09), ((-0.6, 0.1, 0.75), 0.08), ((0.2, 0.3, 1), 0.07), ((0.9, 0.0, 0.1), 0.08),
                 ((-0.9, 0.1, 0.0), 0.08)):
        decal(P, H, HR, d, r, r, m['plant_light'], lift=0.004, n=7)
    # An open maw: a dark mouth with a lip ring, teeth around it and a tongue.
    md = V(0, -1, -0.12)
    p0, n0 = ell_point(H, HR, md)
    fr = facing(p0, n0, UP)
    ax, ay = fr.col[0].xyz, fr.col[1].xyz
    rx, ry = 0.33, 0.22
    decal(P, H, HR, md, rx, ry, m['maw'], lift=0.006, n=16)
    ring = []
    for k in range(17):
        t = TAU * k / 16
        q = p0 + ax * rx * math.cos(t) + ay * ry * math.sin(t)
        p, nn = ell_point(H, HR, q - H)
        ring.append(p + nn * 0.02)
    P.add(tube(ring, 0.04, sides=5, cap=0.0), m['plant_light'])
    for k in range(7):
        t = RAD(28 + k * 20.7)
        q = p0 + ax * rx * 0.93 * math.cos(t) + ay * ry * 0.93 * math.sin(t)
        p, nn = ell_point(H, HR, q - H)
        spike(P, p + nn * 0.01, p + nn * 0.03 - ay * 0.1, 0.035, m['ivory'], sides=4)
    for k in range(5):
        t = RAD(212 + k * 29)
        q = p0 + ax * rx * 0.93 * math.cos(t) + ay * ry * 0.93 * math.sin(t)
        p, nn = ell_point(H, HR, q - H)
        spike(P, p + nn * 0.01, p + nn * 0.03 + ay * 0.09, 0.032, m['ivory'], sides=4)
    P.add(sphere(1.0, 8, 5, scale=(0.13, 0.05, 0.08)).transformed(facing(p0 + n0 * 0.02 - ay * 0.1, n0, UP)), m['tongue'])
    eyes(P, H, HR, (0.36, -0.78, 0.5), 0.085, m)
    brows(P, H, HR, (0.1, -0.75, 0.66), (0.5, -0.6, 0.72), 0.03, m['plant_dark'])
    return M


# ================================================================ cactus
def build_cactus(cid, m):
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    P.add(lathe([(0.78, 0.0), (0.62, 0.07), (0.44, 0.12), (0.0, 0.14)], 14, cap_bottom=0.0).outward(), m['sand'])
    rib = lambda th, i: 1 + 0.07 * math.cos(8 * th)
    prof = [(0.44, 0.05), (0.52, 0.2), (0.55, 0.55), (0.55, 1.2), (0.51, 1.5), (0.4, 1.72), (0.22, 1.84), (0.0, 1.88)]
    P.add(lathe(prof, 24, mod=rib, cap_bottom=0.0, tag=lambda b, s: 1 if s % 3 == 0 else 0).outward(),
          {0: m['cactus'], 1: m['cactus_dark']})
    arms = (bez([V(-0.45, 0, 0.82), V(-0.88, 0, 0.82), V(-0.88, 0, 1.36)], 6), bez([V(0.45, 0, 1.12), V(0.8, 0, 1.12),
                                                                                      V(0.8, 0, 1.52)], 6))
    for arm, r in zip(arms, (0.19, 0.16)):
        P.add(tube(arm, r, sides=10, cap=r * 0.7), m['cactus'])
        for k in (2, 4, 5):
            p = arm[k]
            for d in (V(0, -1, 0.3), V(1 if p.x > 0 else -1, 0, 0.3)):
                spike(P, p + d.normalized() * r * 0.85, p + d.normalized() * (r + 0.11), 0.022, m['spine'], sides=3)
    for k in range(24):
        th = k * 2.399963
        z = 0.32 + (k * 0.618 % 1.0) * 1.35
        if math.sin(th) < -0.55 and 0.85 < z < 1.45:
            continue  # keep the face clear
        r = 0.55 * (1 + 0.07 * math.cos(8 * th)) * (0.96 if z < 1.45 else 0.85)
        d = V(math.cos(th), math.sin(th), 0.25).normalized()
        base = V(math.cos(th) * r, math.sin(th) * r, z)
        spike(P, base - d * 0.02, base + d * 0.12, 0.022, m['spine'], sides=3)
    for i in range(5):
        a = TAU * i / 5
        P.add(E((math.cos(a) * 0.13, math.sin(a) * 0.13, 1.9), (0.13, 0.07, 0.05), 8, 4, rot=(0, 0, a)), m['flower'])
    P.add(sphere(0.07, 8, 5).moved((0, 0, 1.93)), m['flower_eye'])
    H, HR = V(0, 0, 1.12), (0.6, 0.6, 0.72)
    eyes(P, H, HR, (0.34, -1, 0.18), 0.095, m)
    brows(P, H, HR, (0.1, -1, 0.36), (0.5, -1, 0.5), 0.032, m['cactus_dark'], lift=0.04)
    mouth(P, H, HR, (0, -1, -0.12), 0.12, -0.04, 0.024, m['ink'], lift=0.045)
    return M


# ================================================================== bear
def build_bear(cid, m, royal=True):
    """The King Bear: a big standing bear with a cream chest, a muzzle, round ears, thick limbs with
    claws, a red cape with an ermine collar and a gold crown."""
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    B, BR = V(0, 0.02, 0.98), (0.62, 0.52, 0.66)
    P.add(E(B, BR, 16, 10), m['bear'])
    decal(P, B, BR, (0, -1, 0.1), 0.4, 0.46, m['bear_light'], lift=0.008, n=14, dome=0.03)
    H, HR = V(0, -0.16, 1.74), (0.42, 0.38, 0.38)
    P.add(E(H, HR, 16, 10), m['bear'])
    MZ, MR = V(0, -0.48, 1.64), (0.21, 0.16, 0.15)
    P.add(E(MZ, MR, 12, 7), m['bear_light'])
    P.add(E((0, -0.62, 1.71), (0.085, 0.055, 0.06), 8, 5), m['nose'])
    mouth(P, MZ, MR, (0, -0.8, -0.6), 0.07, -0.02, 0.016, m['ink'])
    eyes(P, H, HR, (0.4, -0.86, 0.3), 0.072, m)
    brows(P, H, HR, (0.1, -0.9, 0.45), (0.5, -0.78, 0.55), 0.04, m['bear_dark'])
    for side in (-1, 1):
        P.add(E((side * 0.31, -0.08, 2.06), (0.14, 0.08, 0.14), 10, 6), m['bear'])
        P.add(E((side * 0.31, -0.13, 2.05), (0.085, 0.04, 0.085), 8, 5), m['bear_light'])
        # Arms hang forward with big paws and three claws.
        arm = bez([V(side * 0.5, -0.06, 1.38), V(side * 0.76, -0.2, 1.12), V(side * 0.66, -0.4, 0.82)], 5)
        P.add(tube(arm, [0.21, 0.2, 0.18, 0.17, 0.16], sides=10, cap=0.0), m['bear'])
        Q = V(side * 0.66, -0.46, 0.74)
        P.add(E(Q, (0.17, 0.17, 0.16), 10, 6), m['bear'])
        for dx in (-0.07, 0.0, 0.07):
            spike(P, Q + V(dx, -0.13, -0.02), Q + V(dx * 1.2, -0.25, -0.1), 0.03, m['ivory'])
        P.add(E((side * 0.32, 0.04, 0.42), (0.27, 0.3, 0.33), 10, 7), m['bear'])
        F = V(side * 0.34, -0.14, 0.1)
        P.add(E(F, (0.2, 0.3, 0.11), 10, 6), m['bear'])
        for dx in (-0.08, 0.0, 0.08):
            spike(P, F + V(dx, -0.27, 0.0), F + V(dx * 1.15, -0.36, -0.06), 0.032, m['ivory'])
    P.add(sphere(0.12, 8, 5).moved((0, 0.52, 0.6)), m['bear'])
    if royal:
        # Cape from the shoulders down the back, and an ermine collar.
        path = bez([V(0, 0.4, 1.46), V(0, 0.68, 1.0), V(0, 0.66, 0.3)], 5)
        secs = [[(-0.025, -w), (0.025, -w), (0.025, w), (-0.025, w)] for w in (0.45, 0.58, 0.66, 0.72, 0.76)]
        P.add(sweep(path, secs, (1, 0, 0), None, 0.0, 0.0).outward(), m['cape'])
        ring = [V(math.cos(a) * 0.48, 0.04 + math.sin(a) * 0.42, 1.43 + 0.04 * math.sin(a)) for a in
                (TAU * k / 14 + math.pi / 2 for k in range(15))]
        P.add(tube(ring, 0.09, sides=6, cap=0.0), m['ermine'])
        for a in (0.6, 1.6, 2.6, 3.6, 4.6, 5.6):
            P.add(sphere(1.0, 5, 3, scale=(0.025, 0.02, 0.04)).moved(
                (math.cos(a) * 0.48, 0.04 + math.sin(a) * 0.42 - 0.02, 1.43)), m['ink'])
    else:
        # A shaggy mane of fur tufts over the shoulders and short curled horns (the yeti).
        for k in range(9):
            a = math.pi * (0.1 + 0.8 * k / 8)
            base = V(math.cos(a) * 0.5, 0.12 - math.sin(a) * 0.1 + 0.15, 1.42)
            spike(P, base, base + V(math.cos(a) * 0.22, 0.12, -0.12), 0.12, m['bear'], sides=5)
        for side in (-1, 1):
            hb = V(side * 0.3, -0.12, 1.98)
            P.add(tube(bez([hb, hb + V(side * 0.18, 0.02, 0.12), hb + V(side * 0.26, -0.08, 0.02)], 4), [0.07, 0.06, 0.04, 0.012],
                       sides=6, cap=0.0), m['bear_dark'])
    crown(P, V(0, -0.12, 2.04), 0.24, 0.2, m, tilt=(RAD(-6), 0, 0))
    return M


# ================================================================ treant
def build_treant(cid, m):
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    prof = [(0.74, 0.0), (0.58, 0.18), (0.5, 0.6), (0.48, 1.2), (0.52, 1.7), (0.58, 2.0), (0.38, 2.2), (0.0, 2.25)]
    P.add(lathe(prof, 16, mod=lambda th, i: 1 + 0.06 * math.cos(5 * th + i), cap_bottom=0.0,
                tag=lambda b, s: 1 if s % 4 == 0 else 0).outward(), {0: m['bark'], 1: m['bark_dark']})
    for i in range(5):
        a = TAU * i / 5 + 0.4
        d = V(math.cos(a), math.sin(a), 0)
        P.add(tube([d * 0.42 + V(0, 0, 0.32), d * 0.8 + V(0, 0, 0.12), d * 1.05 + V(0, 0, 0.03)], [0.15, 0.1, 0.03],
                   sides=6, cap=0.0), m['bark'])
    H, HR = V(0, 0, 1.3), (0.52, 0.52, 0.8)
    for side in (-1, 1):
        p, n = surf(H, HR, (side * 0.36, -1, 0.15))
        decal(P, H, HR, (side * 0.36, -1, 0.15), 0.17, 0.12, m['hollow'], lift=0.03, n=10)
        P.add(sphere(1.0, 8, 5, scale=(0.075, 0.04, 0.06)).moved(p + n * 0.04), m['glow'])
        arm = bez([V(side * 0.42, 0, 1.55), V(side * 0.9, -0.1, 1.68), V(side * 1.12, -0.25, 2.05)], 5)
        P.add(tube(arm, [0.17, 0.14, 0.11, 0.09, 0.06], sides=7, cap=0.02), m['bark'])
        for tw in (V(side * 0.18, -0.08, 0.16), V(side * 0.05, -0.18, 0.22)):
            P.add(tube([arm[3], arm[3] + tw], [0.05, 0.02], sides=5, cap=0.0), m['bark'])
        P.add(E(arm[-1] + V(0, 0, 0.08), (0.2, 0.18, 0.16), 8, 5), m['leaf_light'])
    brows(P, H, HR, (0.06, -1, 0.3), (0.66, -0.9, 0.42), 0.075, m['bark_dark'], lift=0.04)
    decal(P, H, HR, (0, -1, -0.28), 0.3, 0.13, m['hollow'], lift=0.03, n=12)
    for blob, r, key in ((V(0, 0.05, 2.45), (0.86, 0.8, 0.5), 'leaf'), (V(-0.5, 0.12, 2.28), (0.5, 0.5, 0.4), 'leaf_dark'),
                         (V(0.52, 0.0, 2.32), (0.5, 0.5, 0.4), 'leaf_dark'), (V(0.08, 0.2, 2.76), (0.55, 0.5, 0.32),
                                                                             'leaf_light')):
        P.add(E(blob, r, 14, 8), m[key])
    for d in ((0.5, -0.6, 0.6), (-0.6, -0.4, 0.5), (0.1, -0.5, 0.9), (0.7, 0.3, 0.6), (-0.4, 0.6, 0.6)):
        p, n = surf(V(0, 0.05, 2.45), (0.86, 0.8, 0.5), d, 0.01)
        P.add(sphere(0.07, 6, 4).moved(p), m['blossom'])
    return M


# ============================================================ the other planets
def remap(m, **pairs):
    """The same build in another palette: role=new material key."""
    out = dict(m)
    for role, key in pairs.items():
        out[role] = m[key]
    return out


def build_slime(cid, m, kind):
    """A glossy drop-shaped slime with a face. 'jelly' (pink jelly), 'magma' (a crusted lava blob) or 'snow' (a
    rolling snowball with twig arms and a carrot nose)."""
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    body = dict(jelly='jelly', magma='magma', snow='snow')[kind]
    if kind == 'snow':
        prof = [(0.0, 0.0), (0.45, 0.04), (0.68, 0.22), (0.76, 0.55), (0.7, 0.9), (0.5, 1.2), (0.26, 1.38), (0.0, 1.43)]
    else:
        prof = [(0.0, 0.0), (0.58, 0.02), (0.76, 0.16), (0.8, 0.42), (0.68, 0.8), (0.46, 1.1), (0.22, 1.32), (0.06, 1.43),
                (0.0, 1.46)]
    P.add(lathe(prof, 20, cap_bottom=0.0).outward(), m[body])
    H, HR = V(0, 0, 0.58), (0.78, 0.78, 0.8)
    eyes(P, H, HR, (0.33, -1, 0.16), 0.13, m, squash=1.25)
    brows(P, H, HR, (0.1, -1, 0.36), (0.52, -1, 0.5), 0.034, m['ink'])
    if kind == 'jelly':
        mouth(P, H, HR, (0, -1, -0.12), 0.14, -0.05, 0.026, m['ink'])
        for d, r in (((-0.5, -0.5, 0.75), 0.1), ((-0.35, -0.5, 0.95), 0.05), ((0.7, 0.4, 0.2), 0.13), ((0.2, 0.8, 0.1), 0.11),
                     ((-0.6, 0.6, 0.0), 0.12)):
            decal(P, H, HR, d, r, r, m['jelly_light'], lift=0.006, n=9, dome=0.02)
        for side in (-1, 1):
            decal(P, H, HR, (side * 0.62, -1, -0.05), 0.08, 0.05, m['blush'], lift=0.005, n=8)
    elif kind == 'magma':
        mouth(P, H, HR, (0, -1, -0.12), 0.15, -0.06, 0.03, m['ink'])
        for d, r in (((0, 0.1, 1), 0.3), ((0.6, 0.5, 0.5), 0.22), ((-0.6, 0.5, 0.45), 0.22), ((0.75, -0.3, 0.6), 0.16),
                     ((-0.7, -0.35, 0.6), 0.16), ((0.1, 0.9, 0.1), 0.2)):
            decal(P, H, HR, d, r, r * 0.8, m['rock'], lift=0.008, n=7, dome=0.04)
        for d in ((0.45, -0.75, -0.4), (-0.5, -0.7, -0.45), (0.85, 0.1, -0.4), (-0.2, 0.9, -0.45)):
            p, n = surf(H, HR, d, 0.0)
            P.add(E(p + n * 0.02 + V(0, 0, -0.04), (0.07, 0.07, 0.11), 8, 5), m['glow'])
    else:
        mouth(P, H, HR, (0, -1, -0.2), 0.13, -0.05, 0.03, m['ink'])
        p, n = surf(H, HR, (0, -1, 0.02))
        P.add(cone(p - n * 0.02, p + n * 0.24 + V(0, 0, -0.03), 0.06, 6), m['carrot'])
        for d, r in (((0.5, 0.4, 0.75), 0.2), ((-0.7, 0.3, 0.55), 0.18), ((0.1, 0.8, 0.5), 0.2)):
            p, n = surf(H, HR, d, -0.06)
            P.add(E(p, (r, r, r * 0.8), 8, 5), m['snow'])
        for side in (-1, 1):
            base, _ = surf(H, HR, (side, -0.1, 0.1), -0.05)
            pts = [base, base + V(side * 0.32, -0.04, 0.18), base + V(side * 0.48, -0.06, 0.34)]
            P.add(tube(pts, [0.035, 0.03, 0.02], sides=5, cap=0.01), m['twig'])
            P.add(tube([pts[1], pts[1] + V(side * 0.1, -0.02, -0.12)], [0.02, 0.012], sides=4, cap=0.0), m['twig'])
    return M


def build_lizard(cid, m, chameleon=False):
    """A compact lizard: rounded body, short snout with a long grin, splayed legs and toes. The fire lizard has a
    flame crest and a flame on its tail; the chameleon has turret eyes, a head casque and a curled tail."""
    lx, yf, yb, hz = 0.3, -0.28, 0.42, 0.42
    M = Model(cid, legged_pivots(lx, yf, yb, hz, body=(0, 0.05, hz)))
    P = M['body']
    skin, dark, belly = m['lizard'], m['lizard_dark'], m['lizard_belly']
    P.add(trunk(0.06, 0.56, 0.36, 0.3, 0.56), skin)
    P.add(E((0, 0.06, 0.38), (0.3, 0.5, 0.14), 10, 6), belly)
    H, HR = V(0, -0.66, 0.78), (0.3, 0.32, 0.26)
    P.add(E((0, -0.48, 0.66), (0.26, 0.24, 0.26), 10, 6), skin)
    P.add(E(H, HR, 14, 8), skin)
    SN, SR = V(0, -0.92, 0.72), (0.22, 0.24, 0.15)
    P.add(E(SN, SR, 12, 7), skin)
    pts, n0 = surface_arc(SN, SR, (0, -1, -0.45), 0.17, 0.035, n=5, lift=0.012)
    P.add(tube(pts, 0.016, sides=4, cap=0.008, binormal=n0), m['ink'])
    for side in (-1, 1):
        P.add(E((side * 0.07, -1.12, 0.78), (0.025, 0.02, 0.02), 6, 4), m['ink'])
    if chameleon:
        for side in (-1, 1):
            B, BR = V(side * 0.24, -0.72, 0.9), (0.13, 0.13, 0.13)
            P.add(E(B, BR, 10, 7), skin)
            eye(P, B, BR, (side * 0.55, -0.8, 0.2), 0.08, m)
        P.add(cone(V(0, -0.55, 0.92), V(0, -0.38, 1.22), 0.15, 6), dark)
        spiral = [V(0, 0.6 + 0.32 * math.sin(t) * (1 - t / 9), 0.5 + 0.32 * (1 - math.cos(t)) * (1 - t / 9))
                  for t in [i * 0.55 for i in range(12)]]
        spiral = [V(0, 0.58, 0.55)] + spiral[1:]
        P.add(tube(spiral, [0.15 - i * 0.011 for i in range(12)], sides=7, cap=0.0), skin)
        for d, r in (((0.6, 0.0, 0.7), 0.12), ((-0.6, 0.2, 0.7), 0.12), ((0.8, 0.5, 0.2), 0.1), ((-0.8, -0.3, 0.2), 0.1)):
            decal(P, V(0, 0.06, 0.56), (0.36, 0.56, 0.3), d, r, r * 0.7, dark, lift=0.006, n=8)
    else:
        eyes(P, H, HR, (0.52, -0.62, 0.42), 0.085, m)
        brows(P, H, HR, (0.18, -0.78, 0.66), (0.62, -0.5, 0.7), 0.026, dark)
        tail = bez([V(0, 0.55, 0.55), V(0, 0.95, 0.42), V(0.12, 1.2, 0.2)], 6)
        P.add(tube(tail, [0.2, 0.17, 0.13, 0.1, 0.07, 0.04], sides=8, cap=0.0), skin)
        P.add(cone(tail[-1] + V(0, -0.04, 0.0), tail[-1] + V(0.02, 0.08, 0.32), 0.1, 6), m['flame'])
        P.add(cone(tail[-1] + V(0, -0.02, 0.0), tail[-1] + V(0.0, 0.05, 0.2), 0.06, 6), m['glow'])
        for i in range(7):
            y = -0.78 + i * 0.22
            z = (1.0 if i == 0 else 0.84) if i < 2 else 0.84 - max(0, i - 4) * 0.08
            hgt = 0.2 if i % 2 == 0 else 0.15
            P.add(cone(V(0, y, z - 0.06), V(0, y + 0.07, z + hgt), 0.07, 5), m['flame' if i % 2 == 0 else 'glow'])
    for name, x, y in legs4(M, lx, yf, yb, hz):
        L = M[name]
        s = 1 if x > 0 else -1
        L.add(tube([V(x, y, hz + 0.04), V(x + s * 0.17, y, 0.3), V(x + s * 0.2, y - 0.03, 0.06)], [0.11, 0.09, 0.075],
                   sides=7), skin)
        F = V(x + s * 0.21, y - 0.08, 0.04)
        for dx in (-0.06, 0.0, 0.06):
            L.add(E(F + V(dx, -0.06, 0.0), (0.03, 0.07, 0.03), 6, 4), skin)
    return M


def build_sheep(cid, m):
    """The cloud sheep: a cumulus of wool on thin legs, a blue-grey face with flop ears and a wool fringe."""
    lx, yf, yb, hz = 0.24, -0.3, 0.38, 0.56
    M = Model(cid, legged_pivots(lx, yf, yb, hz, body=(0, 0.05, hz)))
    P = M['body']
    for c, r, key in (((0, 0.05, 0.98), (0.5, 0.62, 0.42), 'wool'), ((0.3, -0.2, 1.08), (0.3, 0.3, 0.3), 'wool'),
                      ((-0.3, -0.2, 1.08), (0.3, 0.3, 0.3), 'wool'), ((0.32, 0.3, 1.04), (0.3, 0.3, 0.3), 'wool_shade'),
                      ((-0.32, 0.3, 1.04), (0.3, 0.3, 0.3), 'wool_shade'), ((0, -0.05, 1.32), (0.32, 0.34, 0.24), 'wool'),
                      ((0, 0.45, 1.12), (0.3, 0.26, 0.28), 'wool'), ((0.42, 0.05, 0.86), (0.24, 0.3, 0.26), 'wool_shade'),
                      ((-0.42, 0.05, 0.86), (0.24, 0.3, 0.26), 'wool_shade'), ((0, -0.4, 0.84), (0.3, 0.2, 0.26), 'wool')):
        P.add(E(c, r, 10, 6), m[key])
    H, HR = V(0, -0.66, 1.0), (0.22, 0.27, 0.25)
    P.add(E(H, HR, 12, 8), m['sheep_face'])
    eyes(P, H, HR, (0.5, -0.78, 0.25), 0.055, m)
    brows(P, H, HR, (0.16, -0.9, 0.42), (0.58, -0.7, 0.5), 0.02, m['ink'])
    mouth(P, H, HR, (0, -0.8, -0.55), 0.05, -0.015, 0.012, m['ink'])
    for c, r in (((0, -0.6, 1.22), 0.13), ((0.12, -0.56, 1.2), 0.1), ((-0.12, -0.56, 1.2), 0.1)):
        P.add(sphere(1.0, 8, 5, scale=(r, r, r * 0.85)).moved(c), m['wool'])
    for side in (-1, 1):
        P.add(E((side * 0.28, -0.6, 1.06), (0.15, 0.05, 0.07), 8, 5, rot=(0, side * RAD(25), side * RAD(-10))),
              m['sheep_face'])
    # A little lightning-bolt tail from the cloud planet.
    bolt = [(0.0, 0.0), (0.06, 0.0), (0.02, 0.09), (0.08, 0.09), (-0.03, 0.26), (0.0, 0.13), (-0.06, 0.13)]
    P.add(slab(bolt, 0.04, bev=0.01), m['bolt'], facing(V(0, 0.68, 1.02), V(1, 0, 0), V(0, 0.6, 0.8)))
    for name, x, y in legs4(M, lx, yf, yb, hz):
        L = M[name]
        L.add(tube([V(x, y, hz + 0.1), V(x, y, 0.3), V(x, y, 0.1)], [0.075, 0.065, 0.06], sides=7), m['sheep_face'])
        L.add(cyl(V(x, y - 0.01, 0.12), V(x, y - 0.01, 0.0), 0.07, 0.08, sides=7, cap=0.0), m['hoof'])
    return M


def build_penguin(cid, m):
    """The penguin warrior: an egg-shaped body with a white front, flippers, an orange beak and feet, a stern brow
    and a red scarf."""
    M = Model(cid, dict(body=(0, 0, 0)))
    P = M['body']
    prof = [(0.0, 0.1), (0.4, 0.12), (0.56, 0.38), (0.57, 0.78), (0.48, 1.12), (0.3, 1.38), (0.0, 1.5)]
    P.add(lathe(prof, 20, cap_bottom=0.0).outward(), m['penguin'])
    B, BR = V(0, 0, 0.72), (0.57, 0.57, 0.72)
    P.add(E((0, -0.3, 0.64), (0.42, 0.34, 0.47), 14, 8), m['snow'])
    H, HR = V(0, 0, 1.1), (0.46, 0.46, 0.42)
    P.add(E((0, -0.3, 1.12), (0.31, 0.26, 0.23), 12, 7), m['snow'])
    H, HR = V(0, -0.3, 1.12), (0.31, 0.26, 0.23)
    eyes(P, H, HR, (0.3, -1, 0.28), 0.08, m)
    brows(P, H, HR, (0.08, -1, 0.5), (0.48, -0.9, 0.62), 0.03, m['ink'], lift=0.025)
    p, n = surf(H, HR, (0, -1, 0.02))
    P.add(cone(p - n * 0.03, p + n * 0.22 + V(0, 0, -0.05), 0.08, 6), m['beak'])
    for side in (-1, 1):
        P.add(E((side * 0.55, -0.02, 0.72), (0.08, 0.17, 0.36), 8, 6, rot=(RAD(-8), side * RAD(-18), 0)), m['penguin'])
        P.add(E((side * 0.2, -0.22, 0.06), (0.15, 0.24, 0.06), 10, 5), m['beak'])
    ring = [V(math.cos(a) * 0.5, math.sin(a) * 0.5, 0.98 + 0.02 * math.cos(a)) for a in (TAU * k / 16 for k in range(17))]
    P.add(tube(ring, 0.07, sides=6, cap=0.0), m['scarf'])
    P.add(tube([V(0.3, 0.38, 0.98), V(0.38, 0.55, 0.8), V(0.36, 0.62, 0.58)], [0.07, 0.06, 0.05], sides=5, cap=0.02),
          m['scarf'])
    return M


def build_mammoth(cid, m):
    """The Ice Mammoth: a shaggy hump-backed body, big ears, a curled trunk, long tusks and a crown."""
    lx, yf, yb, hz = 0.36, -0.4, 0.5, 0.72
    M = Model(cid, legged_pivots(lx, yf, yb, hz, body=(0, 0.05, hz)))
    P = M['body']
    fur, dark = m['mammoth'], m['mammoth_dark']
    P.add(trunk(0.08, 0.72, 0.58, 0.52, 1.06), fur)
    P.add(E((0, -0.28, 1.36), (0.48, 0.45, 0.36), 12, 8), fur)
    for i in range(14):
        a = TAU * i / 14
        y = -0.45 + (i % 7) * 0.16
        side = 1 if i < 7 else -1
        base = V(side * 0.55, y, 0.84)
        spike(P, base, base + V(side * 0.08, 0.02, -0.3), 0.09, dark, sides=5)
    H, HR = V(0, -0.82, 1.32), (0.4, 0.38, 0.42)
    P.add(E(H, HR, 14, 9), fur)
    eyes(P, H, HR, (0.5, -0.78, 0.25), 0.065, m)
    brows(P, H, HR, (0.14, -0.9, 0.44), (0.6, -0.7, 0.52), 0.035, dark)
    t = bez([V(0, -1.08, 1.2), V(0, -1.3, 0.9), V(0, -1.3, 0.45), V(0, -1.12, 0.38)], 8)
    P.add(tube(t, [0.18, 0.16, 0.14, 0.12, 0.1, 0.085, 0.07, 0.06], sides=9, cap=0.03), fur)
    for side in (-1, 1):
        P.add(E((side * 0.42, -0.66, 1.3), (0.06, 0.3, 0.34), 8, 6, rot=(0, 0, side * RAD(-30))), dark)
        tusk = bez([V(side * 0.2, -1.04, 1.04), V(side * 0.3, -1.45, 0.82), V(side * 0.48, -1.62, 1.12)], 7)
        P.add(tube(tusk, [0.07, 0.068, 0.062, 0.055, 0.045, 0.03, 0.01], sides=7, cap=0.0), m['ivory'])
    P.add(E((0, 0.72, 1.0), (0.08, 0.08, 0.08), 6, 4), dark)
    crown(P, V(0, -0.78, 1.66), 0.2, 0.2, m, tilt=(RAD(-8), 0, 0))
    for name, x, y in legs4(M, lx, yf, yb, hz):
        L = M[name]
        L.add(tube([V(x, y, hz + 0.1), V(x, y, 0.4), V(x, y, 0.1)], [0.2, 0.18, 0.17], sides=9), fur)
        L.add(cyl(V(x, y, 0.13), V(x, y, 0.0), 0.17, 0.19, sides=9, cap=0.0), dark)
        for dx in (-0.08, 0.0, 0.08):
            L.add(E((x + dx, y - 0.17, 0.05), (0.045, 0.03, 0.04), 6, 4), m['ivory'])
    return M


BUILDERS = dict(
    mushroom=lambda m: build_mushroom('mushroom', m), mushking=lambda m: build_mushroom('mushking', m, king=True),
    boar=lambda m: build_boar('boar', m), wolf=lambda m: build_wolf('wolf', m), croc=lambda m: build_croc('croc', m),
    crab=lambda m: build_crab('crab', m), bee=lambda m: build_bee('bee', m), frog=lambda m: build_frog('frog', m),
    chomper=lambda m: build_chomper('chomper', m), cactus=lambda m: build_cactus('cactus', m),
    bear=lambda m: build_bear('bear', m), treant=lambda m: build_treant('treant', m),
    gummy=lambda m: build_wolf('gummy', remap(m, wolf='gummy', wolf_dark='gummy_dark', wolf_light='gummy_light', nose='gummy_nose')),
    jelly=lambda m: build_slime('jelly', m, 'jelly'), snowball=lambda m: build_slime('snowball', m, 'snow'),
    magmaslime=lambda m: build_slime('magmaslime', m, 'magma'), minislime=lambda m: build_slime('minislime', m, 'magma'),
    penguin=lambda m: build_penguin('penguin', m),
    icebloom=lambda m: build_chomper('icebloom', remap(m, plant='ice', plant_dark='ice_dark', plant_light='ice_light', petal='ice_petal',
                                                      petal_light='ice_petal_light', maw='ice_maw', tongue='ice_tongue')),
    flytrap=lambda m: build_chomper('flytrap', remap(m, plant='trap', plant_dark='trap_dark', petal='trap_petal',
                                                    petal_light='trap_petal_light')),
    firelizard=lambda m: build_lizard('firelizard', remap(m, lizard='fire', lizard_dark='fire_dark', lizard_belly='fire_belly')),
    chameleon=lambda m: build_lizard('chameleon', remap(m, lizard='cham', lizard_dark='cham_dark', lizard_belly='cham_belly'),
                                     chameleon=True),
    magmacrab=lambda m: build_crab('magmacrab', remap(m, crab='rock', crab_dark='lava', crab_belly='rock_light')),
    cloudsheep=lambda m: build_sheep('cloudsheep', m),
    yeti=lambda m: build_bear('yeti', remap(m, bear='yeti', bear_dark='yeti_dark', bear_light='yeti_light', nose='navy'), royal=False),
    mammoth=lambda m: build_mammoth('mammoth', m),
)


def build_all():
    m = creature_materials()
    return {cid: BUILDERS[cid](m).realise() for cid in IDS}


# ================================================================ checks
def mesh_tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def r4(v):
    return [round(c, 4) for c in v]


def gltf_vec(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def stats_of(e):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in e['meshes'] for v in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    parts, boss, height = CREATURES[e['id']]
    return dict(triangles=sum(mesh_tris(o) for o in e['meshes']), budget=BUDGET['boss' if boss else 'common'],
                boss=boss, target_height=height, height=round(hi[2], 4),
                bounds=dict(min=r4(lo), max=r4(hi)),
                parts={n: dict(triangles=mesh_tris(e['parts'][n]), pivot=gltf_vec(e['parts'][n].location),
                               materials=len(e['parts'][n].data.materials)) for n in parts})


def check(e, s):
    out = []
    if s['triangles'] > s['budget']:
        out.append(f"{s['triangles']} triangles > {s['budget']}")
    if abs(s['height'] - s['target_height']) > s['target_height'] * 0.2:
        out.append(f"height {s['height']} is not within 20 % of {s['target_height']}")
    if s['bounds']['min'][2] < -0.01 or (s['bounds']['min'][2] > 0.06 and e['id'] not in FLYING):
        out.append(f"lowest point {s['bounds']['min'][2]} is not on the ground")
    for n, p in s['parts'].items():
        if p['triangles'] == 0:
            out.append(f'part {n} is empty')
    return out


def export(entries, path):
    objs = []
    for cid in IDS:
        objs.append(entries[cid]['root'])
        objs += entries[cid]['meshes']
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_materials='EXPORT', export_extras=False,
                              export_cameras=False, export_lights=False, export_animations=False,
                              export_texcoords=False, export_normals=True)
    return os.path.getsize(path)


def quantize_glb(path):
    """Rewrites the exported GLB with KHR_mesh_quantization, which three.js's GLTFLoader reads without a decoder:
    positions as int16 with the dequantising scale on each part's node (so a node's translation is still its
    pivot), normals as normalised int8. That halves the file; the game converts parts back to floats when it
    merges them (src/creature-art.ts)."""
    import struct
    import numpy as np
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    boff = 20 + jlen
    blen = struct.unpack_from('<I', data, boff)[0]
    blob = data[boff + 8:boff + 8 + blen]
    views, accs = doc['bufferViews'], doc['accessors']
    sizes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    dtypes = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}

    def read(i):
        a = accs[i]
        v = views[a['bufferView']]
        n, k, dt = a['count'], sizes[a['type']], dtypes[a['componentType']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride', 0) or k * np.dtype(dt).itemsize
        raw = np.frombuffer(blob, dtype=np.uint8, count=stride * (n - 1) + k * np.dtype(dt).itemsize, offset=start)
        if stride == k * np.dtype(dt).itemsize:
            return raw.view(dt).reshape(n, k).copy()
        return np.stack([raw[j * stride:j * stride + k * np.dtype(dt).itemsize].view(dt) for j in range(n)])

    out, new_views, new_accs = bytearray(), [], []

    def put(arr, stride=None, target=None):
        while len(out) % 4:
            out.append(0)
        view = dict(buffer=0, byteOffset=len(out), byteLength=arr.nbytes)
        if stride:
            view['byteStride'] = stride
        if target:
            view['target'] = target
        out.extend(arr.tobytes())
        new_views.append(view)
        return len(new_views) - 1

    mesh_scale = {}
    for mi, mesh in enumerate(doc['meshes']):
        big = max(float(np.abs(read(p['attributes']['POSITION'])).max()) for p in mesh['primitives'])
        s = max(big, 1e-6) / 32767.0
        mesh_scale[mi] = s
        for p in mesh['primitives']:
            pos = np.clip(np.round(read(p['attributes']['POSITION']) / s), -32767, 32767).astype(np.int16)
            pad = np.zeros((len(pos), 4), dtype=np.int16)
            pad[:, :3] = pos
            new_accs.append(dict(bufferView=put(pad, 8, 34962), componentType=5122, count=len(pos), type='VEC3',
                                 min=[int(x) for x in pos.min(0)], max=[int(x) for x in pos.max(0)]))
            attrs = {'POSITION': len(new_accs) - 1}
            if 'NORMAL' in p['attributes']:
                nrm = np.clip(np.round(read(p['attributes']['NORMAL']) * 127), -127, 127).astype(np.int8)
                padn = np.zeros((len(nrm), 4), dtype=np.int8)
                padn[:, :3] = nrm
                new_accs.append(dict(bufferView=put(padn, 4, 34962), componentType=5120, normalized=True,
                                     count=len(nrm), type='VEC3'))
                attrs['NORMAL'] = len(new_accs) - 1
            idx = read(p['indices']).reshape(-1)
            idx = idx.astype(np.uint16) if idx.max() < 65535 else idx.astype(np.uint32)
            new_accs.append(dict(bufferView=put(idx, None, 34963), componentType=5123 if idx.dtype == np.uint16 else 5125,
                                 count=len(idx), type='SCALAR'))
            p['attributes'] = attrs
            p['indices'] = len(new_accs) - 1
    for node in doc['nodes']:
        if 'mesh' in node:
            s = mesh_scale[node['mesh']]
            node['scale'] = [s, s, s]
    doc['bufferViews'], doc['accessors'] = new_views, new_accs
    while len(out) % 4:
        out.append(0)
    doc['buffers'] = [dict(byteLength=len(out))]
    for key in ('extensionsUsed', 'extensionsRequired'):
        doc[key] = sorted(set(doc.get(key, [])) | {'KHR_mesh_quantization'})
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<4sII', b'glTF', 2, total))
        fh.write(struct.pack('<I4s', len(js), b'JSON') + js)
        fh.write(struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out))
    return os.path.getsize(path)


def write_manifest(stats, size):
    data = dict(generator='art/blender/kit/build_creatures.py', blender=bpy.app.version_string, units='metres',
                coordinates=("Blender: Z up, front -Y; glTF: Y up, front +Z; origin at the ground centre. One root "
                             'node per creature id with one child per part, whose translation is the pivot (glTF).'),
                file=GLB_NAME, bytes=size, limit_bytes=GLB_LIMIT, budgets=BUDGET, nodes=stats)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')
    return data


def install_manifest(data):
    with open(ASSET_MANIFEST, encoding='utf-8') as fh:
        doc = json.load(fh)
    doc['creatures'] = data
    with open(ASSET_MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, indent=2)
        fh.write('\n')


# ================================================================ previews
def dup(e, loc, rz=0.0, pose=None, scale=1.0):
    root = e['root'].copy()
    bpy.context.scene.collection.objects.link(root)
    root.hide_render = False
    root.location = loc
    root.rotation_euler = (0, 0, rz)
    root.scale = (scale, scale, scale)
    for name, part in e['parts'].items():
        c = part.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = root
        c.matrix_parent_inverse = part.matrix_parent_inverse.copy()
        c.location = part.location
        c.rotation_euler = (pose or {}).get(name, (0, 0, 0))
        c.hide_render = False
    return root


def stage(size, ground='#8BE36A'):
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA', 'FONT') or o.name.startswith('Preview ground'):
            bpy.data.objects.remove(o, do_unlink=True)
    old = bpy.data.materials.get('Preview ground')
    if old is not None:
        bpy.data.materials.remove(old)
    build_wilds._preview_studio(size, ground=ground)


def hide_all():
    for o in bpy.data.objects:
        if o.type in ('MESH', 'EMPTY', 'FONT'):
            o.hide_render = True
    g = bpy.data.objects.get('Preview ground')
    if g is not None:
        g.hide_render = False


def camera(elev, yaw, target, ortho, distance=40.0):
    data = bpy.data.cameras.new('Creature camera')
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    cam = bpy.data.objects.new('Creature camera', data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elev), RAD(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = Vector(target) + d * distance
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


# Game scale of each creature (src/enemy-types.ts ENEMY_SCALE; bosses 1.85), so the sheet shows true sizes.
GAME_SCALE = dict(mushroom=0.49, boar=0.91, bee=0.73, wolf=0.99, chomper=0.67, frog=0.73, cactus=0.67, crab=0.99,
                  bear=1.85, treant=1.85, croc=1.85, mushking=1.85, gummy=0.91, jelly=0.73, snowball=0.73, penguin=0.85,
                  icebloom=0.67, magmaslime=0.85, minislime=0.67, firelizard=0.99, magmacrab=0.99, chameleon=0.91,
                  flytrap=0.67, cloudsheep=0.99, yeti=1.85, mammoth=1.85)
HOME_ROWS = [(-2.6, [('mushroom', -6.4), ('boar', -4.6), ('bee', -2.6), ('wolf', -0.6), ('frog', 1.4), ('crab', 3.4),
                     ('chomper', 5.4), ('cactus', 7.0)]),
             (3.6, [('mushking', -6.0), ('bear', -1.6), ('treant', 2.6), ('croc', 7.0)])]
PLANET_ROWS = [(-2.6, [('jelly', -6.6), ('gummy', -4.8), ('snowball', -2.8), ('penguin', -1.2), ('icebloom', 0.4),
                       ('magmaslime', 2.0), ('minislime', 3.3), ('firelizard', 5.0), ('magmacrab', 7.2)]),
               (3.6, [('chameleon', -6.4), ('flytrap', -4.4), ('cloudsheep', -2.4), ('yeti', 1.0), ('mammoth', 5.6)])]


def preview_sheet(entries, hero, out_path, rows):
    """Two rows at a 3/4 view: the commons at true game size next to the explorer, then the bosses."""
    stage((2000, 1100))
    hide_all()
    for y, row in rows:
        for cid, x in row:
            dup(entries[cid], (x, y, 0), RAD(-28), scale=GAME_SCALE[cid])
    if hero is not None:
        build_wilds._show_tree(hero, (-8.4, -2.6, 0), RAD(-20))
        hero.scale = (0.84, 0.84, 0.84)
    cam = camera(20, 8, (0.4, 0.8, 2.0), 19.5)
    bpy.context.view_layer.update()
    for y, row in rows:
        for cid, x in row:
            build_wilds.label(cam, cid, (x, y - 1.0, 0), 0.32)
    render(out_path)


def preview_poses(entries, out_path):
    """The legged and winged creatures at rest and posed through their parts, which checks the pivots."""
    stage((1800, 900))
    hide_all()
    pose = dict(leg_fl=(RAD(40), 0, 0), leg_br=(RAD(40), 0, 0), leg_fr=(RAD(-40), 0, 0), leg_bl=(RAD(-40), 0, 0),
                wing_l=(0, RAD(30), 0), wing_r=(0, RAD(-30), 0))
    for i, cid in enumerate(('boar', 'wolf', 'crab', 'bee')):
        dup(entries[cid], (-6 + i * 4, 1.4, 0), RAD(-70))
        dup(entries[cid], (-6 + i * 4, -1.6, 0), RAD(-70), pose=pose)
    camera(14, 4, (0, 0, 0.9), 15)
    render(out_path)


def preview_closeups(entries, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    stage((900, 900))
    for cid in IDS:
        hide_all()
        dup(entries[cid], (0, 0, 0), RAD(-30))
        h = CREATURES[cid][2]
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(o, do_unlink=True)
        camera(24, 18, (0, -0.2, h * 0.48), max(h, 2.0) * 1.25)
        render(os.path.join(out_dir, f'creature-{cid}.png'))


# ==================================================================== main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(install=False, render=False, debug=None, only=None)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--install':
            opts['install'] = True
        elif a == '--render':
            opts['render'] = True
        elif a == '--debug':
            opts['debug'] = argv[i + 1]
            i += 1
        else:
            raise SystemExit(f'unknown argument {a}')
        i += 1
    return opts


def main():
    opts = parse_args()
    reset_scene()
    entries = build_all()
    stats = {cid: stats_of(entries[cid]) for cid in IDS}
    failures = []
    print('\n== creatures')
    for cid in IDS:
        s = stats[cid]
        print(f"  {cid:9s} {s['triangles']:5d}/{s['budget']} tris  h {s['height']:.2f} (target {s['target_height']})  "
              + ' '.join(f"{n}:{p['triangles']}" for n, p in s['parts'].items()))
        failures += [f'{cid}: {f}' for f in check(entries[cid], s)]
    path = os.path.join(MODELS, GLB_NAME)
    raw = export(entries, path)
    size = quantize_glb(path)
    print(f'  quantized from {raw} bytes')
    print(f'  {GLB_NAME} {size} bytes ({size / 1024:.1f} KB)')
    if size > GLB_LIMIT:
        failures.append(f'{GLB_NAME} is {size} bytes (> {GLB_LIMIT})')
    data = write_manifest(stats, size)
    if opts['render'] or opts['debug']:
        hero = build_wilds.import_nodes(HERO_GLB, {'hero'}).get('hero')
        for e in entries.values():
            for o in [e['root']] + e['meshes']:
                o.hide_render = True
        if opts['render']:
            preview_sheet(entries, hero, os.path.join(PREVIEWS, 'creatures.webp'), HOME_ROWS)
            preview_sheet(entries, hero, os.path.join(PREVIEWS, 'creatures-planets.webp'), PLANET_ROWS)
            if hero is not None:
                for o in [hero] + list(hero.children_recursive):
                    o.hide_render = True
            preview_poses(entries, os.path.join(PREVIEWS, 'creatures-poses.webp'))
        if opts['debug']:
            preview_closeups(entries, opts['debug'])
    if failures:
        print('\nCreature kit contract failures:\n  ' + '\n  '.join(failures))
        sys.stdout.flush()
        os._exit(1)
    if opts['install']:
        os.makedirs(PUBLIC_MODELS, exist_ok=True)
        shutil.copyfile(path, os.path.join(PUBLIC_MODELS, GLB_NAME))
        install_manifest(data)
        print('installed', GLB_NAME)
    print('\nCreature kit OK')


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
