"""Zoo Garden explorer body styles ("looks"): Tall, Cat boy and Bunny girl, beside the default hero.

Every style is built from the default hero's own pieces (build_hero.hero_pieces), so it keeps the
same part names, the same ten `Hero ...` materials and the same draw structure: one mesh per
part plus `head-leaf`. Gear is never re-modelled: each style publishes a FIT table, the per-part
transform the game applies to a gear piece after expressing it relative to the DEFAULT pivot
(`piece' = fit.offset + fit.scale * piece`, in that part's space). The game mirrors FIT in
src/looks.ts and a test checks the two agree (art/generated/kit/hero-styles.json).

- tall: a slimmer, longer body (torso x0.82 wide, x1.15 tall; shins +0.36; arms x1.45) and a
  smaller head (x0.8), so the head is about a third of the height instead of half. Still toon.
- catboy: the default chibi with cat ears and a curling tail.
- bunny: the default chibi with long bunny ears, a puff tail, twin tails with ribbons, a back
  bob of hair and eyelashes.

Ears live in `head-leaf` in place of the sprout, so they follow the sprout's rule: hidden under
any hat (and most disguises). Nineteen hats of every shape are modelled tight over the hair cap,
so ears poking through brims would clash with all of them; tucking them under is the one rule
that fits every hat, costs no extra draw, and reuses the tested leaf path.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_hero_styles.py -- [--install] [--render]

Outputs art/generated/kit/models/hero-<style>.glb, art/generated/kit/hero-styles.json and,
with --render, art/previews/kit/hero-styles.webp (four styles wearing a hat and an outfit).
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

STYLES = ('default', 'tall', 'catboy', 'bunny')
E = 0.36            # tall: extra shin length (the whole body rises by this much)
TORSO_W, TORSO_H = 0.82, 1.15
ARM_W, ARM_L = 0.88, 1.45
HEAD_S = 0.8
NECK_LIFT = 0.06    # tall: a hint of neck above the slimmer shoulders
LEG_X = 0.16        # tall: hips a little closer together under the slimmer torso
TRI_LIMIT = 3850    # the default hero is 3,304; a style may add ears, tail and hair (bunny 3,808, +15 %)


def tall_z(z):
    """Torso height map (Blender z): stretched from the hem up, then lifted by E."""
    return 0.508 + (z - 0.508) * TORSO_H + E


def tall_layout():
    sh = {s: Vector((0.37 * s * TORSO_W + 0.02 * s, 0.02, tall_z(1.08))) for s in (-1, 1)}
    neck = Vector((0, 0, tall_z(1.12) + NECK_LIFT))
    pivots = {'body': Vector((0, 0, tall_z(0.85))), 'head': neck,
              'arm-left': sh[-1], 'arm-right': sh[1],
              'leg-left': Vector((-LEG_X, 0, 0.52 + E)), 'leg-right': Vector((LEG_X, 0, 0.52 + E))}
    return pivots


def arm_rel_z(rz):
    """Arm length map relative to the shoulder: the sleeve stretches, the hand keeps its size."""
    knee = 0.86 - 1.08
    return rz * ARM_L if rz >= knee else knee * ARM_L + (rz - knee)


def deform_tall(P):
    pv = tall_layout()
    for v in P['body'].verts:
        v.x *= TORSO_W
        v.y *= TORSO_W
        v.z = tall_z(v.z)
    for name, s in (('arm-left', -1), ('arm-right', 1)):
        old = Vector(HS.PIVOTS[name])
        for v in P[name].verts:
            r = v - old
            v.x, v.y, v.z = pv[name].x + r.x * ARM_W, pv[name].y + r.y * ARM_W, pv[name].z + arm_rel_z(r.z)
    for name, s in (('leg-left', -1), ('leg-right', 1)):
        for v in P[name].verts:
            dx = v.x - 0.18 * s
            if v.z < 0.26:          # shoe: same size, lowered with the longer shin
                v.z -= E
            else:                   # shorts and shin stretch together; the shin fills out a little, not a stick
                skin = v.z < 0.43
                v.z = 0.565 - (0.565 - v.z) * (0.565 - 0.26 + E) / (0.565 - 0.26)
                if skin:
                    dx *= 1.15
                    v.y *= 1.15
            v.x = LEG_X * s + dx
            v.z += E
    old, new = Vector(HS.PIVOTS['head']), pv['head']
    for key in ('head', 'head-leaf'):
        for v in P[key].verts:
            r = (v - old) * HEAD_S
            v.x, v.y, v.z = new.x + r.x, new.y + r.y, new.z + r.z
    hands = {}
    for hand, arm in (('hand-left', 'arm-left'), ('hand-right', 'arm-right')):
        r = Vector(HS.HANDS[hand]) - Vector(HS.PIVOTS[arm])
        hands[hand] = pv[arm] + Vector((r.x * ARM_W, r.y * ARM_W, arm_rel_z(r.z)))
    leaf = new + (BH.LEAF_ORIGIN - old) * HEAD_S
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


def bunny_hair(M):
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
        for k, (x, z) in enumerate(((0.262, 1.678), (0.3, 1.668), (0.33, 1.684))):
            y = -math.sqrt(max(0.0, 0.6 ** 2 - x * x - (z - BH.C.z) ** 2))
            pts.append(Vector((x * s, y, z)))
        geos.append(BH.tube(pts, [0.014, 0.011, 0.0], sides=5, cap_start=True).retag(M['eye']))
    return BH.join(*geos)


def build_pieces(style, M):
    P = BH.hero_pieces(M)
    pivots = {k: Vector(v) for k, v in HS.PIVOTS.items()}
    hands = {k: Vector(v) for k, v in HS.HANDS.items()}
    leaf = Vector(BH.LEAF_ORIGIN)
    if style == 'tall':
        pivots, hands, leaf = deform_tall(P)
    elif style == 'catboy':
        P['head-leaf'] = BH.Piece('head-leaf').add(cat_ears(M))
        P['body'].add(cat_tail(M))
    elif style == 'bunny':
        P['head-leaf'] = BH.Piece('head-leaf').add(bunny_ears(M))
        P['head'].add(bunny_hair(M))
        P['head'].add(lashes(M))
        P['body'].add(bunny_tail(M))
    return P, pivots, hands, leaf


def make_style(style, M, prefix=''):
    P, pivots, hands, leaf = build_pieces(style, M)
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
    bpy.context.view_layer.update()
    return objs, pivots, hands


def g3(v):
    """Blender (x, y, z) to three.js (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1] + 0.0, 4)]


def s3(v):
    return [round(v[0], 4), round(v[2], 4), round(v[1], 4)]


def fit_table(style):
    """Gear transform per part, in three.js part space (scale, then offset), relative to the default pivot."""
    if style != 'tall':
        return {}
    return {
        'head': dict(scale=[HEAD_S] * 3, offset=[0, 0, 0]),
        'body': dict(scale=s3((TORSO_W, TORSO_W, TORSO_H)), offset=[0, 0, 0]),
        'arm-left': dict(scale=s3((ARM_W, ARM_W, ARM_L)), offset=[0, 0, 0]),
        'arm-right': dict(scale=s3((ARM_W, ARM_W, ARM_L)), offset=[0, 0, 0]),
        'leg-left': dict(scale=[1, 1, 1], offset=[0, round(-E, 4), 0]),
        'leg-right': dict(scale=[1, 1, 1], offset=[0, round(-E, 4), 0]),
        'hand-right': dict(scale=[1, 1, 1], offset=[0, 0, 0]),
    }


def stats(objs):
    tris = {n: BH.mesh_tris(objs[n]) for n in BH.PARTS + ('head-leaf',)}
    mats = sorted({m.name for n in tris for m in objs[n].data.materials})
    top = max(p.z for n in tris for p in BH.world_points(objs[n]))
    return dict(triangles=sum(tris.values()), parts=tris, materials=mats, height=round(top, 3))


def import_gear():
    path = os.path.join(BH.PUBLIC_MODELS, 'gear-wear.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def wear(objs, style, imported, item, prefix):
    """Copy a gear item's pieces onto a built style, applying the style's fit like World.wearKit does."""
    fit = fit_table(style)
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
    tmp = os.path.join(BH.GEN, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    imported = import_gear()
    for o in imported:
        o.hide_render = True
    paths, layout = [], []
    looks = [('default', 'hat_straw', 'armor_leather'), ('tall', 'hat_cowboy', 'armor_kimono'),
             ('catboy', 'hat_straw', 'armor_hawaii'), ('bunny', 'hat_chef', 'armor_angel')]
    for row, dressed in enumerate((False, True)):
        for i, (style, hat, outfit) in enumerate(looks):
            M = BH.hero_materials(BH.PLAYER_COLORS[i], ' ' + BH.PLAYER_COLORS[i])
            objs, _, _ = make_style(style, M, prefix=f'{style}{row} ')
            extra = []
            if dressed:
                extra = wear(objs, style, imported, hat, f'{style}{row} ') + wear(objs, style, imported, outfit, f'{style}{row} ')
                objs['head-leaf'].hide_render = True
            BH.pose(objs, yaw=math.radians(-25))
            BH.stage((360, 520), ground='#8FE06A')
            cam = BH.camera(12, -25, target=(0, 0, 1.2))
            meshes = [o for o in list(objs.values()) + extra if o.type == 'MESH']
            BH.fit(cam, meshes, 1.12)
            cam.data.ortho_scale = 3.3
            paths.append(BH.render_png(os.path.join(tmp, f'style_{style}_{row}.png')))
            layout.append((i * 360, (1 - row) * 520))
            bpy.data.objects.remove(cam, do_unlink=True)
            for o in extra:
                bpy.data.objects.remove(o, do_unlink=True)
            BH.remove_tree(objs['hero'])
    BH.composite(paths, layout, (1440, 1040), os.path.join(BH.PREVIEWS, 'hero-styles.webp'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, failures = {}, []
    for style in STYLES:
        reset_scene()
        objs, pivots, hands = make_style(style, BH.hero_materials())
        st = stats(objs)
        if st['triangles'] > TRI_LIMIT:
            failures.append(f'{style}: {st["triangles"]} triangles (> {TRI_LIMIT})')
        if set(st['materials']) - set(BH.HERO_MATERIALS):
            failures.append(f'{style}: extra materials {st["materials"]}')
        entry = dict(st, pivots={k: g3(v) for k, v in pivots.items()},
                     hands={k: g3(v - pivots['arm-left' if k == 'hand-left' else 'arm-right']) for k, v in hands.items()},
                     fit=fit_table(style))
        if style != 'default':
            name = f'hero-{style}.glb'
            path = os.path.join(BH.MODELS, name)
            entry['file'] = name
            entry['bytes'] = export_glb(BH.tree(objs['hero']), path)
            if argv and '--install' in argv:
                os.makedirs(BH.PUBLIC_MODELS, exist_ok=True)
                shutil.copy2(path, os.path.join(BH.PUBLIC_MODELS, name))
        out[style] = entry
        print(f"{style:8s} {st['triangles']:5d} tris  height {st['height']}  {entry.get('bytes', '')}  {st['parts']}")
    with open(os.path.join(BH.GEN, 'hero-styles.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    if failures:
        raise RuntimeError('Hero styles: ' + '; '.join(failures))
    if '--render' in argv:
        reset_scene()
        render_sheet()
    print('Hero styles OK')


if __name__ == '__main__':
    main()
