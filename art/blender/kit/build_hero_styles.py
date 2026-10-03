"""Zoo Garden character builder: body (boy/girl) x height (chibi/teen/tall) x ears (none/cat/bunny).

Combinations must not multiply files, so the art is modular:

- six BODY files, one per body x height: hero.glb (boy chibi, from build_hero.py), hero-teen.glb,
  hero-tall.glb, hero-girl.glb, hero-girl-teen.glb, hero-girl-tall.glb. Each is built from the
  default hero's own pieces (build_hero.hero_pieces), so it keeps the same part names, the same ten
  `Hero ...` materials and the same draw structure: one mesh per part plus `head-leaf` (the sprout).
- one PARTS file, hero-parts.glb: `ears-cat`, `ears-bunny`, `tail-cat`, `tail-bunny`, modelled on the
  DEFAULT (chibi) hero in explorer space. The game (src/assets.ts heroKitFor) places them on any
  height with the same FIT the gear uses (ears follow the head's fit, tails the body's), then merges
  the ears into the head mesh and the tail into the body mesh at load: no extra draw.

FIT is the per-part transform the game applies to a gear piece (and to ears/tails) after expressing
it relative to the DEFAULT pivot (`piece' = fit.offset + fit.scale * piece`, in that part's space).
It depends on height only; src/looks.ts mirrors it and tests/looks.test.ts checks it against the
GLB pivots.

The girl: twin tails with ribbons, a back bob, eyelashes and a short flared skirt in the shirt's
shade (so it takes the player's colour). The boy keeps the default short hair cap.

Heights (tall is the "human-like" shape: slimmer, longer legs, smaller head):
  chibi  the default proportions, head about half the height
  teen   shins +0.2, torso x1.08 tall, arms x1.22, head x0.9
  tall   shins +0.46, torso x1.2 tall and x0.8 wide, arms x1.55, head x0.76 (about a third of the height)

Ears replace the sprout in `head-leaf`, so they follow its rule: hidden under any hat and most
disguises (nineteen hats are modelled tight over the hair cap; ears poking through would clash).

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_hero_styles.py -- [--install] [--render]

--render writes art/previews/kit/hero-styles.webp: every combination, bare-headed and in a hat.
--icons renders only the mirror's 25 option portraits (public/assets/icons/looks/<option>.webp with --install)
and art/previews/kit/look-icons.webp, without exporting any GLB; --render renders them too.
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
import build_hero as BH  # noqa: E402
import hero_spec as HS  # noqa: E402
from style import export_glb, reset_scene  # noqa: E402

BODIES = ('boy', 'girl')
EARS = ('none', 'cat', 'bunny')
# Height shapes: E extra shin length (the whole body rises by it), torso width/height, arm width/length,
# head scale, a hint of neck, hip half-spacing.
HEIGHTS = {
    # tiny: an extra-chibi toddler, shorter shins and torso, a bigger head.
    'tiny': dict(E=-0.1, TW=1.04, TH=0.88, AW=1.0, AL=0.9, HEAD=1.1, NECK=0.0, LEG_X=0.18),
    'chibi': None,
    'teen': dict(E=0.2, TW=0.9, TH=1.08, AW=0.94, AL=1.22, HEAD=0.9, NECK=0.03, LEG_X=0.17),
    'tall': dict(E=0.46, TW=0.8, TH=1.2, AW=0.86, AL=1.55, HEAD=0.76, NECK=0.07, LEG_X=0.155),
    # grown: the most human shape, about five heads tall: long legs (half the height), arms to the hips.
    'grown': dict(E=1.1, TW=0.74, TH=1.5, AW=0.8, AL=3.0, HEAD=0.52, NECK=0.12, LEG_X=0.15),
}
# Builds are applied at run time to the boy (sturdy) or girl (slim) file, no new files; src/looks.ts BUILD mirrors
# this (torso x/depth, limb thickness, shoulder and hip spread). Used here only for the render sheets.
BUILDS = {
    'sturdy': dict(base='boy', torso=(1.2, 1.15), limb=1.18, spread=1.17, hips=1.12),
    'slim': dict(base='girl', torso=(0.86, 0.9), limb=0.86, spread=0.87, hips=0.9),
}
TRI_LIMIT = 4200    # the default hero is 3,304; the girl adds hair, lashes and a skirt, ears and tail come on top


def body_file(body, height):
    if body == 'boy' and height == 'chibi':
        return 'hero.glb'
    return 'hero-' + '-'.join(([body] if body == 'girl' else []) + ([] if height == 'chibi' else [height])) + '.glb'


def torso_z(z, p):
    """Torso height map (Blender z): stretched from the hem up, then lifted by E."""
    return 0.508 + (z - 0.508) * p['TH'] + p['E']


def layout(p):
    sh = {s: Vector((0.37 * s * p['TW'] + 0.02 * s, 0.02, torso_z(1.08, p))) for s in (-1, 1)}
    neck = Vector((0, 0, torso_z(1.12, p) + p['NECK']))
    return {'body': Vector((0, 0, torso_z(0.85, p))), 'head': neck, 'arm-left': sh[-1], 'arm-right': sh[1],
            'leg-left': Vector((-p['LEG_X'], 0, 0.52 + p['E'])), 'leg-right': Vector((p['LEG_X'], 0, 0.52 + p['E']))}


def arm_rel_z(rz, p):
    """Arm length map relative to the shoulder: the sleeve stretches, the hand keeps its size."""
    knee = 0.86 - 1.08
    return rz * p['AL'] if rz >= knee else knee * p['AL'] + (rz - knee)


def deform(P, p):
    pv, E = layout(p), p['E']
    for v in P['body'].verts:
        v.x *= p['TW']
        v.y *= p['TW']
        v.z = torso_z(v.z, p)
    for name in ('arm-left', 'arm-right'):
        old = Vector(HS.PIVOTS[name])
        for v in P[name].verts:
            r = v - old
            v.x, v.y, v.z = pv[name].x + r.x * p['AW'], pv[name].y + r.y * p['AW'], pv[name].z + arm_rel_z(r.z, p)
    for name, s in (('leg-left', -1), ('leg-right', 1)):
        for v in P[name].verts:
            dx = v.x - 0.18 * s
            if v.z < 0.26:          # shoe: same size, lowered with the longer shin
                v.z -= E
            else:                   # shorts and shin stretch together; the shin fills out a little, not a stick
                skin = v.z < 0.43
                v.z = 0.565 - (0.565 - v.z) * (0.565 - 0.26 + E) / (0.565 - 0.26)
                if skin:
                    k = 1 + 0.15 * E / 0.36
                    dx *= k
                    v.y *= k
            v.x = p['LEG_X'] * s + dx
            v.z += E
    old, new = Vector(HS.PIVOTS['head']), pv['head']
    for key in ('head', 'head-leaf'):
        for v in P[key].verts:
            r = (v - old) * p['HEAD']
            v.x, v.y, v.z = new.x + r.x, new.y + r.y, new.z + r.z
    hands = {}
    for hand, arm in (('hand-left', 'arm-left'), ('hand-right', 'arm-right')):
        r = Vector(HS.HANDS[hand]) - Vector(HS.PIVOTS[arm])
        hands[hand] = pv[arm] + Vector((r.x * p['AW'], r.y * p['AW'], arm_rel_z(r.z, p)))
    leaf = new + (BH.LEAF_ORIGIN - old) * p['HEAD']
    return pv, hands, leaf


def on_head(polar, side, r):
    """A point on a sphere about the head centre: `polar` degrees from the crown toward +-X."""
    a = math.radians(polar)
    return BH.C + Vector((math.sin(a) * side, 0.0, math.cos(a))) * r


def cat_ears(M):
    geos = []
    for s in (-1, 1):
        base = on_head(38, s, 0.53)
        out = Vector((0.55 * s, -0.05, 0.84)).normalized()
        path = [base + out * t for t in (0.0, 0.1, 0.2, 0.29, 0.36)]
        outer = BH.tube(path, [0.16, 0.15, 0.11, 0.05, 0.0], sides=8, flatten=0.42, up=(0, 1, 0), cap_start=True)
        inner_path = [p + Vector((0, -0.045, 0)) for p in path[1:4]] + [path[4] + Vector((0, -0.03, -0.02))]
        inner = BH.tube(inner_path, [0.1, 0.075, 0.035, 0.0], sides=6, flatten=0.25, up=(0, 1, 0), cap_start=True)
        geos += [outer.retag(M['hair']), inner.retag(M['blush'])]
    return BH.join(*geos)


def bunny_ears(M):
    geos = []
    for s in (-1, 1):
        base = on_head(22, s, 0.5)
        # Long ears rising up and back; the left one bends over at the tip (a classic bunny flop).
        bend = Vector((0.16 * s, 0.1, -0.06)) if s < 0 else Vector((0.06, 0.06, 0.06))
        path = [base, base + Vector((0.05 * s, 0.02, 0.2)), base + Vector((0.09 * s, 0.05, 0.42)),
                base + Vector((0.11 * s, 0.07, 0.6)) + bend * 0.5, base + Vector((0.12 * s, 0.08, 0.7)) + bend]
        outer = BH.tube(path, [0.075, 0.095, 0.095, 0.07, 0.0], sides=7, flatten=0.42, up=(0, 1, 0), cap_start=True)
        inner = BH.tube([p + Vector((0, -0.03, 0)) for p in path[1:4]] + [path[4] + Vector((0, -0.02, -0.03))],
                        [0.055, 0.06, 0.04, 0.0], sides=6, flatten=0.25, up=(0, 1, 0), cap_start=True)
        geos += [outer.retag(M['pants']), inner.retag(M['blush'])]
    return BH.join(*geos)


def cat_tail(M):
    pts = BH.bez([(0, 0.3, 0.58), (0, 0.62, 0.42), (0.1, 0.78, 0.72), (0.16, 0.66, 1.0)], 9)
    return BH.tube(pts, [0.06, 0.065, 0.065, 0.062, 0.06, 0.058, 0.055, 0.05, 0.035, 0.0], sides=7,
                   cap_start=True).retag(M['hair'])


def bunny_tail(M):
    return BH.ellipsoid((0, 0.43, 0.6), (0.11, 0.1, 0.1), segs=10, rings=6).retag(M['pants'])


# ------------------------------------------------------------------ head decorations (animal hoods)
# Each is a soft hood over the crown (outside the hair cap, radius 0.665) with the animal's ears and a little face
# on its forehead, the part the high game camera sees best. They ride in `head-leaf` like the ears, so a hat
# covers them; a decoration brings its own ears, so the Ears row's ears are left off while one is worn (the tail stays).
DECOS = ('bear', 'panda', 'fox', 'kitty', 'frog', 'piggy', 'chick', 'koala', 'tiger', 'penguin', 'monkey', 'owl')
DECO_COLOURS = {
    'bear': ('#B0703F', '#F3D2A2'), 'panda': ('#FAF7EE', '#2B2B33'), 'fox': ('#F5873A', '#FFF4E6'),
    'kitty': ('#B9B3CC', '#FFFFFF'), 'frog': ('#79CC4B', '#E9FFC9'), 'piggy': ('#FFB7C8', '#FF8DA8'),
    'chick': ('#FFD84A', '#FF9E2C'), 'koala': ('#A3A8B4', '#F3F1F4'), 'tiger': ('#F79A2C', '#FFF6E6'),
    'penguin': ('#33405E', '#FFFFFF'), 'monkey': ('#93603D', '#F7CFA6'), 'owl': ('#A06C3E', '#FBE7B8'),
}
HOOD_R = 0.665


def deco_mats(name, M):
    main, accent = DECO_COLOURS[name]
    return dict(main=FMx(f'Deco {name}', main), accent=FMx(f'Deco {name} accent', accent),
                dark=M['eye'], pink=M['blush'], white=FMx('Deco white', '#FFFFFF'), beak=FMx('Deco beak', '#FF9A2E'),
                inner=FMx('Deco inner', '#FFC2CF'))


def FMx(name, colour):
    m = bpy.data.materials.get(name)
    return m if m else BH.FM(name, colour, 0.5)


def hood_dir(theta, phi):
    t, p = math.radians(theta), math.radians(phi)
    return Vector((math.sin(t) * math.sin(p), -math.sin(t) * math.cos(p), math.cos(t)))


def on_hood(theta, phi, r=HOOD_R):
    return BH.C + hood_dir(theta, phi) * r


def hood_shell(mat, front=52, back=118, segs=14, rows=3):
    """An open cap from the crown to an edge that is high over the brow and low at the nape, thickened inward."""
    edge = lambda phi: front + (back - front) * ((1 - math.cos(math.radians(phi))) / 2) ** 0.8
    phis = [360 * i / segs for i in range(segs)]
    verts, faces = [on_hood(0, 0)], []
    for j in range(1, rows + 1):
        for phi in phis:
            verts.append(on_hood(edge(phi) * j / rows, phi))
    ring = lambda j, i: 1 + (j - 1) * segs + i % segs
    for i in range(segs):
        faces.append((0, ring(1, i), ring(1, i + 1)))
        for j in range(1, rows):
            faces.append((ring(j, i), ring(j + 1, i), ring(j + 1, i + 1), ring(j, i + 1)))
    g = BH.Geo(verts, faces, [mat] * len(faces)).orient(lambda p: p - BH.C)
    return g.solidify(0.035)


def blob(centre, normal, radii, mat, segs=5, rings=2, up=(0, 0, 1)):
    return BH.ellipsoid(centre, radii, segs=segs, rings=rings, m=BH.facing(centre, normal, up=up)).retag(mat)


def round_ears(D, phi=58, theta=44, r=0.15, inner=True):
    geos = []
    for s in (-1, 1):
        c = on_hood(theta, phi * s, HOOD_R + r * 0.55)
        geos.append(blob(c, Vector((0.25 * s, -1, 0.35)), (r, r, r * 0.42), D["main"]))
        if inner:
            geos.append(blob(c + Vector((0, -r * 0.36, 0)), Vector((0, -1, 0.35)), (r * 0.62, r * 0.62, r * 0.18), D['accent'], segs=5, rings=2))
    return geos


def pointy_ears(D, phi=50, theta=40, length=0.3, r=0.14, tip=None):
    geos = []
    for s in (-1, 1):
        base = on_hood(theta, phi * s, HOOD_R - 0.03)
        out = (hood_dir(theta * 0.6, phi * s) + Vector((0, 0, 0.6))).normalized()
        geos.append(BH.cone(base, out, length, r, sides=5).transformed(
            Matrix.Translation(base) @ Matrix.Scale(0.55, 4, Vector((0, 1, 0))) @ Matrix.Translation(-base)).retag(D['main']))
        ib = base + Vector((0, -0.05, 0.02))
        geos.append(BH.cone(ib, out, length * 0.7, r * 0.55, sides=5).transformed(
            Matrix.Translation(ib) @ Matrix.Scale(0.4, 4, Vector((0, 1, 0))) @ Matrix.Translation(-ib)).retag(D['inner'] if tip is None else tip))
    return geos


def face(D, theta=30, spread=16, eye=0.045, white_eyes=False):
    geos = []
    for s in (-1, 1):
        n = hood_dir(theta, spread * s)
        if white_eyes:
            geos.append(blob(on_hood(theta, spread * s, HOOD_R + 0.01), n, (eye * 1.9, eye * 1.9, eye * 0.6), D['white'], segs=7, rings=2))
        geos.append(blob(on_hood(theta, spread * s, HOOD_R + (0.03 if white_eyes else 0.005)), n, (eye, eye * 1.15, eye * 0.6), D['dark'], segs=5, rings=3))
    return geos


def muzzle(D, mat, theta=44, size=(0.13, 0.085, 0.07), nose=None):
    n = hood_dir(theta, 0)
    geos = [blob(on_hood(theta, 0, HOOD_R), n, size, mat, segs=7, rings=3)]
    if nose is not False:
        c = on_hood(theta - size[1] * 30, 0, HOOD_R + size[2] * 0.9)
        geos.append(blob(c, n, (0.045, 0.032, 0.03), nose or D['dark'], segs=5, rings=2))
    return geos


def cheeks(D, theta=40, phi=28):
    return [blob(on_hood(theta, phi * s, HOOD_R + 0.002), hood_dir(theta, phi * s), (0.05, 0.03, 0.012), D['pink'], segs=5, rings=2) for s in (-1, 1)]


def deco_geo(name, M):
    D = deco_mats(name, M)
    g = [hood_shell(D['main'])]
    if name == 'bear':
        g += round_ears(D) + face(D) + muzzle(D, D['accent'])
    elif name == 'panda':
        g += round_ears(D, inner=False)
        for e in g[-2:]:
            e.retag(D['accent'])
        for s in (-1, 1):
            g.append(blob(on_hood(31, 17 * s, HOOD_R), hood_dir(31, 17 * s), (0.075, 0.095, 0.02), D['accent'], segs=5, rings=2, up=(0.35 * s, 0, 1)))
        g += face(D, eye=0.03, white_eyes=True) + muzzle(D, D['main'], size=(0.1, 0.07, 0.05)) + cheeks(D)
    elif name == 'fox':
        g += pointy_ears(D, tip=D['accent']) + face(D) + muzzle(D, D['accent'], size=(0.15, 0.09, 0.07))
    elif name == 'kitty':
        g += pointy_ears(D, length=0.24, r=0.13) + face(D) + muzzle(D, D['accent'], size=(0.11, 0.07, 0.05), nose=D['pink']) + cheeks(D)
    elif name == 'frog':
        for s in (-1, 1):
            c = on_hood(24, 26 * s, HOOD_R + 0.05)
            g.append(blob(c, hood_dir(24, 26 * s), (0.13, 0.13, 0.11), D['main'], segs=7, rings=3))
            g.append(blob(c + hood_dir(40, 26 * s) * 0.03 + Vector((0, -0.06, 0.03)), Vector((0, -1, 0.5)), (0.085, 0.085, 0.04), D['white'], segs=5, rings=2))
            g.append(blob(c + Vector((0, -0.1, 0.045)), Vector((0, -1, 0.5)), (0.045, 0.05, 0.02), D['dark'], segs=5, rings=2))
        g += cheeks(D, theta=44, phi=30)
        g.append(BH.tube([on_hood(46, p, HOOD_R + 0.005) for p in (-16, -8, 0, 8, 16)], 0.012, sides=4).retag(D['dark']))
    elif name == 'piggy':
        for s in (-1, 1):   # floppy triangle ears, folded forward
            base = on_hood(36, 48 * s, HOOD_R - 0.02)
            g.append(BH.cone(base, Vector((0.5 * s, -0.7, 0.45)), 0.24, 0.13, sides=5).transformed(
                Matrix.Translation(base) @ Matrix.Scale(0.45, 4, Vector((0, 0, 1))) @ Matrix.Translation(-base)).retag(D['main']))
        g += face(D, theta=28)
        n = hood_dir(44, 0)
        snout = on_hood(44, 0, HOOD_R + 0.03)
        g.append(BH.lathe([(0.0, -0.02), (0.11, -0.02), (0.12, 0.04), (0.1, 0.075), (0.0, 0.075)], 8).transformed(BH.facing(snout, n)).closed().retag(D['accent']))
        for s in (-1, 1):
            g.append(blob(snout + n * 0.075 + Vector((0.035 * s, 0, 0)), n, (0.018, 0.028, 0.008), D['dark'], segs=5, rings=2))
        g += cheeks(D, theta=40, phi=32)
    elif name == 'chick':
        top = on_hood(0, 0)
        for k, (dx, h) in enumerate(((-0.06, 0.16), (0.0, 0.22), (0.06, 0.15))):
            b = top + Vector((dx, 0.02 * k - 0.02, -0.03))
            g.append(BH.cone(b, Vector((dx * 3, 0.1, 1)), h, 0.05, sides=5).retag(D['main']))
        g += face(D, theta=32, spread=18) + cheeks(D)
        n = hood_dir(42, 0)
        g.append(BH.cone(on_hood(42, 0, HOOD_R - 0.01), n + Vector((0, 0, -0.3)), 0.12, 0.06, sides=5).retag(D['accent']))
    elif name == 'koala':
        for s in (-1, 1):
            c = on_hood(52, 72 * s, HOOD_R + 0.1)
            g.append(blob(c, Vector((0, -1, 0.2)), (0.2, 0.19, 0.08), D['main'], segs=7, rings=3))
            g.append(blob(c + Vector((0, -0.06, 0)), Vector((0, -1, 0.2)), (0.13, 0.12, 0.03), D['accent'], segs=5, rings=2))
        g += face(D, theta=30, spread=18)
        g.append(blob(on_hood(43, 0, HOOD_R + 0.02), hood_dir(43, 0), (0.08, 0.11, 0.06), D['dark'], segs=5, rings=2))
    elif name == 'tiger':
        g += round_ears(D, r=0.12) + face(D) + muzzle(D, D['accent'], size=(0.14, 0.085, 0.06))
        for k, th in enumerate((12, 18, 24)):   # forehead stripes
            g.append(blob(on_hood(th, 0, HOOD_R), hood_dir(th, 0), (0.12 - 0.025 * k, 0.018, 0.012), D['dark'], segs=5, rings=2))
        for s in (-1, 1):
            for th in (46,):
                g.append(blob(on_hood(th, 62 * s, HOOD_R), hood_dir(th, 62 * s), (0.02, 0.09, 0.012), D['dark'], segs=5, rings=2))
    elif name == 'penguin':
        for s in (-1, 1):
            g.append(blob(on_hood(38, 14 * s, HOOD_R - 0.005), hood_dir(38, 14 * s), (0.16, 0.2, 0.03), D['accent'], segs=7, rings=2))
        g += face(D, theta=33, spread=16)
        g.append(BH.cone(on_hood(44, 0, HOOD_R), hood_dir(44, 0) + Vector((0, 0, -0.2)), 0.11, 0.055, sides=5).retag(D['beak']))
        g += cheeks(D, theta=44, phi=30)
    elif name == 'monkey':
        for s in (-1, 1):
            c = on_hood(70, 88 * s, HOOD_R + 0.07)
            g.append(blob(c, Vector((s, -0.3, 0)), (0.15, 0.15, 0.06), D['main'], segs=7, rings=3))
            g.append(blob(c + Vector((0.04 * s, -0.02, 0)), Vector((s, -0.3, 0)), (0.1, 0.1, 0.02), D['accent'], segs=5, rings=2))
        g.append(blob(on_hood(35, 0, HOOD_R - 0.008), hood_dir(35, 0), (0.24, 0.17, 0.03), D["accent"], segs=7, rings=2))
        g += face(D, theta=30) + muzzle(D, D['accent'], theta=45, size=(0.13, 0.07, 0.06), nose=D['dark'])
    elif name == 'owl':
        g += pointy_ears(D, phi=40, theta=30, length=0.2, r=0.1, tip=D['main'])
        for s in (-1, 1):
            g.append(blob(on_hood(32, 20 * s, HOOD_R), hood_dir(32, 20 * s), (0.12, 0.12, 0.025), D['accent'], segs=7, rings=2))
        g += face(D, theta=32, spread=20, eye=0.04, white_eyes=False)
        g.append(BH.cone(on_hood(41, 0, HOOD_R - 0.01), hood_dir(41, 0) + Vector((0, 0, -0.6)), 0.1, 0.045, sides=5).retag(D['beak']))
    return BH.join(*g)


def girl_hair(M):
    geos = [BH.ellipsoid((0, 0.2, 1.47), (0.52, 0.42, 0.4), segs=12, rings=6).retag(M['hair'])]  # a bob behind and below the cap
    for s in (-1, 1):
        top = Vector((0.52 * s, 0.12, 1.66))
        pts = BH.bez([top, top + Vector((0.12 * s, 0.05, -0.2)), top + Vector((0.1 * s, 0.08, -0.5)),
                      top + Vector((0.04 * s, 0.05, -0.62))], 6)
        geos.append(BH.tube(pts, [0.1, 0.13, 0.12, 0.1, 0.07, 0.04, 0.0], sides=6, cap_start=True).retag(M['hair']))
        geos.append(BH.ellipsoid(top + Vector((0.02 * s, -0.02, 0.03)), (0.07, 0.05, 0.05), segs=6, rings=4).retag(M['blush']))
    return BH.join(*geos)


def lashes(M):
    geos = []
    for s in (-1, 1):
        pts = []
        for x, z in ((0.262, 1.678), (0.3, 1.668), (0.33, 1.684)):
            y = -math.sqrt(max(0.0, 0.6 ** 2 - x * x - (z - BH.C.z) ** 2))
            pts.append(Vector((x * s, y, z)))
        geos.append(BH.tube(pts, [0.014, 0.011, 0.0], sides=5, cap_start=True).retag(M['eye']))
    return BH.join(*geos)


def skirt(M):
    """A short flared skirt over the shorts, in the shirt's shade so it takes the player's colour."""
    return BH.lathe([(0.0, 0.47), (0.47, 0.47), (0.49, 0.49), (0.43, 0.6), (0.41, 0.64), (0.0, 0.64)], 18,
                    tag=lambda j: M['shade'])


def build_pieces(body, height, M, ears='none', deco=None):
    """The pieces of one combination. The game files never carry ears (they come from hero-parts.glb);
    `ears` is only for the render sheet, added before the height deform exactly as FIT places them."""
    P = BH.hero_pieces(M)
    if body == 'girl':
        P['head'].add(girl_hair(M))
        P['head'].add(lashes(M))
        P['body'].add(skirt(M))
    if ears != 'none':
        P['head-leaf'] = BH.Piece('head-leaf').add(cat_ears(M) if ears == 'cat' else bunny_ears(M))
        P['body'].add(cat_tail(M) if ears == 'cat' else bunny_tail(M))
    if deco:   # a decoration takes the head-leaf (ears and sprout give way to it)
        P['head-leaf'] = BH.Piece('head-leaf').add(deco_geo(deco, M))
    pivots = {k: Vector(v) for k, v in HS.PIVOTS.items()}
    hands = {k: Vector(v) for k, v in HS.HANDS.items()}
    leaf = Vector(BH.LEAF_ORIGIN)
    if HEIGHTS[height]:
        pivots, hands, leaf = deform(P, HEIGHTS[height])
    return P, pivots, hands, leaf


def make_combo(body, height, M, prefix='', ears='none', deco=None):
    build = BUILDS.get(body)
    P, pivots, hands, leaf = build_pieces(build['base'] if build else body, height, M, ears, deco)
    scene = bpy.context.scene
    root = bpy.data.objects.new(prefix + 'hero', None)
    scene.collection.objects.link(root)
    objs = {'hero': root}
    for name in BH.PARTS:
        o = P[name].build(pivots[name], prefix + name)
        o.data.name = o.name
        o.parent = root
        o.location = pivots[name]
        objs[name] = o
    o = P['head-leaf'].build(leaf, prefix + 'head-leaf')
    o.data.name = o.name
    o.parent = objs['head']
    o.location = leaf - pivots['head']
    objs['head-leaf'] = o
    for hand, arm in (('hand-left', 'arm-left'), ('hand-right', 'arm-right')):
        e = bpy.data.objects.new(prefix + hand, None)
        scene.collection.objects.link(e)
        e.parent = objs[arm]
        e.location = hands[hand] - pivots[arm]
        objs[hand] = e
    if build:
        apply_build(objs, build)
    bpy.context.view_layer.update()
    return objs, pivots, hands


def apply_build(objs, b):
    """The run-time build (src/assets.ts applyBuild), for the render sheets: widen or narrow the torso and limbs."""
    objs['body'].scale = (b['torso'][0], b['torso'][1], 1)
    for name in ('arm-left', 'arm-right'):
        objs[name].scale = (b['limb'], b['limb'], 1)
        objs[name].location.x *= b['spread']
    for name in ('leg-left', 'leg-right'):
        objs[name].scale = (b['limb'], b['limb'], 1)
        objs[name].location.x *= b['hips']


def make_parts(M):
    """hero-parts.glb: ears and tails on the default hero, in explorer space (object origins at 0)."""
    root = bpy.data.objects.new('hero-parts', None)
    bpy.context.scene.collection.objects.link(root)
    objs = [root]
    for name, geo in (('ears-cat', cat_ears(M)), ('ears-bunny', bunny_ears(M)), ('tail-cat', cat_tail(M)), ('tail-bunny', bunny_tail(M))) + tuple(('deco-' + d, deco_geo(d, M)) for d in DECOS):
        o = BH.Piece(name).add(geo).build((0, 0, 0), name)
        o.data.name = name
        o.parent = root
        objs.append(o)
    bpy.context.view_layer.update()
    return objs


def g3(v):
    """Blender (x, y, z) to three.js (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1] + 0.0, 4)]


def s3(v):
    return [round(v[0], 4), round(v[2], 4), round(v[1], 4)]


def fit_table(height):
    """Gear (and ears/tail) transform per part, in three.js part space (scale, then offset), relative to the default pivot."""
    p = HEIGHTS[height]
    if not p:
        return {}
    return {
        'head': dict(scale=[p['HEAD']] * 3, offset=[0, 0, 0]),
        'body': dict(scale=s3((p['TW'], p['TW'], p['TH'])), offset=[0, 0, 0]),
        'arm-left': dict(scale=s3((p['AW'], p['AW'], p['AL'])), offset=[0, 0, 0]),
        'arm-right': dict(scale=s3((p['AW'], p['AW'], p['AL'])), offset=[0, 0, 0]),
        'leg-left': dict(scale=[1, 1, 1], offset=[0, round(-p['E'], 4), 0]),
        'leg-right': dict(scale=[1, 1, 1], offset=[0, round(-p['E'], 4), 0]),
        'hand-right': dict(scale=[1, 1, 1], offset=[0, 0, 0]),
    }


def stats(objs):
    tris = {n: BH.mesh_tris(objs[n]) for n in BH.PARTS + ('head-leaf',)}
    mats = sorted({m.name for n in tris for m in objs[n].data.materials})
    top = max(p.z for n in tris for p in BH.world_points(objs[n]))
    hz = [p.z for p in BH.world_points(objs['head'])]
    # heads tall: total height over the head's own height (chibi about 2, grown about 5)
    return dict(triangles=sum(tris.values()), parts=tris, materials=mats, height=round(top, 3),
                heads=round(top / (max(hz) - min(hz)), 2))


def import_gear():
    path = os.path.join(BH.PUBLIC_MODELS, 'gear-wear.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def wear(objs, height, imported, item, prefix):
    """Copy a gear item's pieces onto a built combination, applying the height's fit like World.wearKit does."""
    fit = fit_table(height)
    root = next(o for o in imported if o.name == item)
    out = []
    for src in root.children_recursive:
        if src.type != 'MESH':
            continue
        tag = src.name.split('@', 1)[1].split('.')[0] if '@' in src.name else ('head' if item.startswith('hat') else 'body')
        o = src.copy()
        o.name = prefix + src.name
        bpy.context.scene.collection.objects.link(o)
        o.parent = None
        o.hide_render = False
        mw = src.matrix_world.copy()
        old = Vector(HS.PIVOTS.get(tag, HS.HANDS.get(tag, (0, 0, 0))))
        part = objs[tag]
        f = fit.get(tag)
        local = Matrix.Translation(-old) @ mw
        if f:
            sc, off = f['scale'], f['offset']
            local = Matrix.Translation((off[0], -off[2], off[1])) @ Matrix.Diagonal((sc[0], sc[2], sc[1], 1.0)) @ local
        o.matrix_world = part.matrix_world @ local
        out.append(o)
    return out


def render_sheet():
    """Rows: body x height (6). Columns: ears (3) bare-headed, then the same three in a straw hat."""
    tmp = os.path.join(BH.GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    imported = import_gear()
    for o in imported:
        o.hide_render = True
    paths, layout_ = [], []
    W, H = 220, 300
    rows = [(b, h) for b in BODIES for h in HEIGHTS]
    for r, (body, height) in enumerate(rows):
        for c in range(6):
            ears, hat = EARS[c % 3], c >= 3
            colour = BH.PLAYER_COLORS[(r + c) % len(BH.PLAYER_COLORS)]
            M = BH.hero_materials(colour, ' ' + colour)
            prefix = f'{body}{height}{c} '
            objs, _, _ = make_combo(body, height, M, prefix=prefix, ears=ears)
            extra = []
            if hat:
                extra = wear(objs, height, imported, 'hat_straw', prefix)
                objs['head-leaf'].hide_render = True
            BH.pose(objs, yaw=math.radians(-25))
            BH.stage((W, H), ground='#8FE06A')
            cam = BH.camera(12, -25, target=(0, 0, 1.25))
            cam.data.ortho_scale = 3.6
            paths.append(BH.render_png(os.path.join(tmp, f'combo_{r}_{c}.png')))
            layout_.append((c * W, (len(rows) - 1 - r) * H))
            bpy.data.objects.remove(cam, do_unlink=True)
            for o in extra:
                bpy.data.objects.remove(o, do_unlink=True)
            BH.remove_tree(objs['hero'])
    BH.composite(paths, layout_, (6 * W, len(rows) * H), os.path.join(BH.PREVIEWS, 'hero-styles.webp'))


def _shot(objs, path, W, H, target, ortho, elev=12, yaw=-25, ground='#8FE06A', transparent=False):
    BH.pose(objs, yaw=math.radians(yaw))
    BH.stage((W, H), ground=None if transparent else ground, transparent=transparent)
    cam = BH.camera(elev, yaw, target=target)
    cam.data.ortho_scale = ortho
    out = BH.render_png(path)
    bpy.data.objects.remove(cam, do_unlink=True)
    return out


def render_decos():
    """Rows: boy chibi, girl chibi, girl teen. Columns: the twelve decorations."""
    tmp = os.path.join(BH.GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    paths, lay, W, H = [], [], 200, 240
    rows = (('boy', 'chibi'), ('girl', 'chibi'), ('boy', 'tall'))
    for r, (body, height) in enumerate(rows):
        for c, deco in enumerate(DECOS):
            colour = BH.PLAYER_COLORS[(r + c) % len(BH.PLAYER_COLORS)]
            objs, _, _ = make_combo(body, height, BH.hero_materials(colour, ' ' + colour), prefix=f'd{r}{c} ', deco=deco)
            paths.append(_shot(objs, os.path.join(tmp, f'deco_{r}_{c}.png'), W, H, (0, 0, 1.35 if height == 'chibi' else 1.7), 3.0 if height == 'chibi' else 3.9, elev=24))
            lay.append((c * W, (len(rows) - 1 - r) * H))
            BH.remove_tree(objs['hero'])
    BH.composite(paths, lay, (len(DECOS) * W, len(rows) * H), os.path.join(BH.PREVIEWS, 'hero-decos.webp'))


def render_heights():
    """Every height side by side for each build, all on one ground line and one scale (tallest included)."""
    tmp = os.path.join(BH.GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    paths, lay, W, H = [], [], 180, 420
    bodies = ('boy', 'girl', 'sturdy', 'slim')
    for r, body in enumerate(bodies):
        for c, height in enumerate(HEIGHTS):
            colour = BH.PLAYER_COLORS[(r * 2 + c) % len(BH.PLAYER_COLORS)]
            objs, _, _ = make_combo(body, height, BH.hero_materials(colour, ' ' + colour), prefix=f'h{r}{c} ')
            paths.append(_shot(objs, os.path.join(tmp, f'h_{r}_{c}.png'), W, H, (0, 0, 1.75), 3.95, elev=6, yaw=-20))
            lay.append(((r * len(HEIGHTS) + c) * W, 0))
            BH.remove_tree(objs['hero'])
    BH.composite(paths, lay, (len(bodies) * len(HEIGHTS) * W, H), os.path.join(BH.PREVIEWS, 'hero-heights.webp'))


# The mirror's option portraits (src/looks.ts OPTIONS, src/look-shop.ts): one 128 px transparent webp per option,
# under 8 KB, each the default explorer (boy, chibi, no ears, no hood) with only that option changed. Ears and hoods
# are head portraits; bodies and heights are whole figures. The five heights share one scale and one ground line, so
# the row reads as a ladder from Tiny to Grown-up. Framing per row: (elevation, yaw, camera target z, ortho scale).
ICON_FRAMES = {
    'body': (12, -22, 1.18, 2.55),
    'height': (8, -20, 1.72, 3.55),
    'ears': (20, -32, 1.9, 2.25),
    'deco': (26, -18, 1.72, 1.95),
}
OPTION_ROWS = {
    'body': ('boy', 'girl', 'sturdy', 'slim'),
    'height': tuple(HEIGHTS),
    'ears': EARS,
    'deco': ('bare',) + DECOS,
}


def option_combo(row, option, prefix):
    """The default explorer with one option changed (sturdy and slim are builds on the boy and girl files)."""
    M = BH.hero_materials()
    if row == 'body':
        return make_combo(option, 'chibi', M, prefix=prefix)
    if row == 'height':
        return make_combo('boy', option, M, prefix=prefix)
    if row == 'ears':
        return make_combo('boy', 'chibi', M, prefix=prefix, ears=option)
    return make_combo('boy', 'chibi', M, prefix=prefix, deco=None if option == 'bare' else option)


def render_option_icons(install):
    """Every option of every row (25 portraits) into art/generated/kit/icons/looks/ (--install: public/assets/icons/looks/)."""
    out_dir = os.path.join(BH.GEN, 'icons', 'looks')
    pub = os.path.join(BH.REPO, 'public', 'assets', 'icons', 'looks')
    os.makedirs(out_dir, exist_ok=True)
    written = {}
    for row, options in OPTION_ROWS.items():
        elev, yaw, z, ortho = ICON_FRAMES[row]
        for option in options:
            objs, _, _ = option_combo(row, option, f'i{option} ')
            BH.pose(objs, yaw=math.radians(yaw))
            BH.stage((128, 128), transparent=True, world=0.6, exposure=-0.15)
            cam = BH.camera(elev, yaw, target=(0, 0, z))
            cam.data.ortho_scale = ortho
            bpy.ops.render.render(write_still=False)
            path = os.path.join(out_dir, option + '.webp')
            BH.save_webp_under(path, BH.ICON_LIMIT)
            written[option] = os.path.getsize(path)
            if install:
                os.makedirs(pub, exist_ok=True)
                shutil.copy2(path, os.path.join(pub, option + '.webp'))
            bpy.data.objects.remove(cam, do_unlink=True)
            BH.remove_tree(objs['hero'])
    print('look icons', written)
    return written


def render_icon_sheet():
    """art/previews/kit/look-icons.webp: the 25 portraits in their four rows, for review (composite eats its inputs: copies)."""
    src, tmp = os.path.join(BH.GEN, 'icons', 'looks'), os.path.join(BH.GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    paths, lay = [], []
    for r, (row, options) in enumerate(OPTION_ROWS.items()):
        for c, option in enumerate(options):
            copy = os.path.join(tmp, f'icon_{option}.webp')
            shutil.copy2(os.path.join(src, option + '.webp'), copy)
            paths.append(copy)
            lay.append((c * 128, (len(OPTION_ROWS) - 1 - r) * 128))
    BH.composite(paths, lay, (13 * 128, len(OPTION_ROWS) * 128), os.path.join(BH.PREVIEWS, 'look-icons.webp'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--icons' in argv:      # only the mirror's option portraits (no GLB export): -- --icons [--install]
        reset_scene()
        render_option_icons('--install' in argv)
        render_icon_sheet()
        print('Look icons OK')
        return
    out, failures = {'fit': {h: fit_table(h) for h in HEIGHTS}, 'bodies': {}}, []
    for body in BODIES:
        for height in HEIGHTS:
            reset_scene()
            objs, pivots, hands = make_combo(body, height, BH.hero_materials())
            st = stats(objs)
            if set(st['materials']) - set(BH.HERO_MATERIALS):
                failures.append(f'{body}-{height}: extra materials {st["materials"]}')
            name = body_file(body, height)
            entry = dict(st, file=name, pivots={k: g3(v) for k, v in pivots.items()},
                         hands={k: g3(v - pivots['arm-left' if k == 'hand-left' else 'arm-right']) for k, v in hands.items()})
            if name != 'hero.glb':     # the boy chibi is build_hero.py's own file
                path = os.path.join(BH.MODELS, name)
                entry['bytes'] = export_glb(BH.tree(objs['hero']), path)
                if '--install' in argv:
                    os.makedirs(BH.PUBLIC_MODELS, exist_ok=True)
                    shutil.copy2(path, os.path.join(BH.PUBLIC_MODELS, name))
            out['bodies'][f'{body}-{height}'] = entry
            print(f"{body}-{height:6s} {st['triangles']:5d} tris  height {st['height']}  heads {st['heads']}  {entry.get('bytes', '')}  {st['parts']}")
    reset_scene()
    parts = make_parts(BH.hero_materials())
    tris = {o.name: BH.mesh_tris(o) for o in parts[1:]}
    path = os.path.join(BH.MODELS, 'hero-parts.glb')
    out['parts'] = dict(triangles=tris, bytes=export_glb(parts, path))
    if '--install' in argv:
        shutil.copy2(path, os.path.join(BH.PUBLIC_MODELS, 'hero-parts.glb'))
    print('parts', out['parts'])
    for key, b in out['bodies'].items():
        tail = max(tris['tail-cat'], tris['tail-bunny'])
        worst = b['triangles'] - b['parts']['head-leaf'] + max(tris['ears-cat'] + tris['tail-cat'], tris['ears-bunny'] + tris['tail-bunny'],
                                                               max(tris['deco-' + d] for d in DECOS) + tail)
        if worst > TRI_LIMIT:
            failures.append(f'{key}: {worst} triangles with ears and tail (> {TRI_LIMIT})')
    with open(os.path.join(BH.GEN, 'hero-styles.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    if failures:
        raise RuntimeError('Hero styles: ' + '; '.join(failures))
    if '--render' in argv:
        reset_scene()
        render_option_icons('--install' in argv)
        render_icon_sheet()
        reset_scene()
        render_decos()
        reset_scene()
        render_heights()
        if '--sheet' in argv:
            reset_scene()
            render_sheet()
    print('Hero styles OK')


if __name__ == '__main__':
    main()
