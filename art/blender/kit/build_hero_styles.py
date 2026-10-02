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
    'chibi': None,
    'teen': dict(E=0.2, TW=0.9, TH=1.08, AW=0.94, AL=1.22, HEAD=0.9, NECK=0.03, LEG_X=0.17),
    'tall': dict(E=0.46, TW=0.8, TH=1.2, AW=0.86, AL=1.55, HEAD=0.76, NECK=0.07, LEG_X=0.155),
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


def build_pieces(body, height, M, ears='none'):
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
    pivots = {k: Vector(v) for k, v in HS.PIVOTS.items()}
    hands = {k: Vector(v) for k, v in HS.HANDS.items()}
    leaf = Vector(BH.LEAF_ORIGIN)
    if HEIGHTS[height]:
        pivots, hands, leaf = deform(P, HEIGHTS[height])
    return P, pivots, hands, leaf


def make_combo(body, height, M, prefix='', ears='none'):
    P, pivots, hands, leaf = build_pieces(body, height, M, ears)
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


def make_parts(M):
    """hero-parts.glb: ears and tails on the default hero, in explorer space (object origins at 0)."""
    root = bpy.data.objects.new('hero-parts', None)
    bpy.context.scene.collection.objects.link(root)
    objs = [root]
    for name, geo in (('ears-cat', cat_ears(M)), ('ears-bunny', bunny_ears(M)), ('tail-cat', cat_tail(M)), ('tail-bunny', bunny_tail(M))):
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
    return dict(triangles=sum(tris.values()), parts=tris, materials=mats, height=round(top, 3))


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


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
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
            print(f"{body}-{height:6s} {st['triangles']:5d} tris  height {st['height']}  {entry.get('bytes', '')}  {st['parts']}")
    reset_scene()
    parts = make_parts(BH.hero_materials())
    tris = {o.name: BH.mesh_tris(o) for o in parts[1:]}
    path = os.path.join(BH.MODELS, 'hero-parts.glb')
    out['parts'] = dict(triangles=tris, bytes=export_glb(parts, path))
    if '--install' in argv:
        shutil.copy2(path, os.path.join(BH.PUBLIC_MODELS, 'hero-parts.glb'))
    print('parts', out['parts'])
    for key, b in out['bodies'].items():
        worst = b['triangles'] - b['parts']['head-leaf'] + max(tris['ears-cat'] + tris['tail-cat'], tris['ears-bunny'] + tris['tail-bunny'])
        if worst > TRI_LIMIT:
            failures.append(f'{key}: {worst} triangles with ears and tail (> {TRI_LIMIT})')
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
