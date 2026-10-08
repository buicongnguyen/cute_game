"""Flag Rush kit (the Multiworld Gate and its Capture the Flag isle) -> public/assets/models/ctf.glb, a manifest,
a preview and 160px power-up icons.

Run: blender -b --factory-startup --python art/blender/kit/build_ctf.py              (model, manifest, preview)
     blender -b --factory-startup --python art/blender/kit/build_ctf.py -- --icons  (webp icons from the glb)

One top-level empty per piece with one joined child mesh '<name>_body'; origin at the ground centre, front facing
Blender -Y (glTF +Z), metres. Pieces (src/ctf-view.ts):
  ctf_gate, ctf_gate_swirl      the Multiworld Gate (ring arch on a plinth) and its spinning swirl disc (centre z 2.1)
  ctf_keeper                    Gatekeeper Orrin, a star-staffed traveller in a patched cloak
  ctf_stand, ctf_flag           a flag stand and a flag on its pole (team colour by material 'CTF team')
  ctf_pad                       a jump pad: a spring drum with an arrow ring ('CTF team')
  ctf_bridge                    a plank bridge, 5.6 m wide, 8 m long (across the river, along X)
  ctf_post, ctf_rock, ctf_tree  base fence post, cover rock, border tree
  ctf_banner                    a base banner on two poles ('CTF team')
  ctf_power_ring                the glowing ring a power-up floats over
  ctf_pw_<kind>                 7 power-ups: zip, bubble, pumpkin, wisp, bigcap, frost, apple (~0.8 m)
Runtime tint by material name: 'CTF team' (blue / red / neutral gold), 'CTF team glow'.
Everything is original: shapes, colours and names are this project's own.
"""
import bpy, math, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style
import build_dungeon as dg
R = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(R, 'public', 'assets', 'models', 'ctf.glb')
ICONS = os.path.join(R, 'public', 'assets', 'icons', 'ctf')
TAU = math.tau
INK = dg.INK
TEAM = '#4a8cff'


class P(dg.P):
    def m(self, c, glow=0.0, name=None):
        if not isinstance(c, str):
            return c
        key = name or 'CTF %s %s%s' % (self.tag, c, ' glow' if glow else '')
        if key not in self.cache:
            self.cache[key] = style.mat(key, c, rough=.45, emit=c if glow else None, emit_strength=glow)
        return self.cache[key]

    def team(self):
        return self.m(TEAM, 0, 'CTF team')

    def team_glow(self):
        return self.m('#9fc6ff', 1.2, 'CTF team glow')


# ------------------------------------------------------------------ the gate and its keeper
LEAN = math.radians(28)  # the ring leans back so the top-down game camera sees its face


def lean(parts, pivot_z=.5):
    """Tilts parts back (top away from the viewer, toward +Y) about a horizontal axis at pivot_z."""
    from mathutils import Matrix, Vector
    m = Matrix.Translation(Vector((0, 0, pivot_z))) @ Matrix.Rotation(-LEAN, 4, 'X') @ Matrix.Translation(Vector((0, 0, -pivot_z)))
    for o in parts:
        o.matrix_world = m @ o.matrix_world
    return parts


def gate():
    p = P('gate')
    p.cyl((0, 0, 0), 2.3, .35, '#b8a98f', verts=20, bev=.04)
    p.cyl((0, 0, .35), 2.0, .18, '#d9ccb0', verts=20, bev=.03)
    for s in (-1, 1):  # two leaning stone feet
        p.box((s * 1.75, 0, .9), (.7, .9, 1.1), '#a3937a', bev=.08)
    base = len(p.parts)
    ring = p.torus((0, 0, 2.35), 1.85, .32, '#c9b796', rot=(math.radians(90), 0, 0), segs=28, minor=8)
    p.torus((0, 0, 2.35), 1.55, .09, '#7d5cff', rot=(math.radians(90), 0, 0), segs=28, minor=4, glow=1.4)
    for i in range(8):  # rune studs round the ring
        a = i * TAU / 8 + TAU / 16
        p.ball((math.cos(a) * 1.85, -.3, 2.35 + math.sin(a) * 1.85), .17, ['#6af0ff', '#ffd23f', '#ff7ab0', '#9b7bff'][i % 4], glow=.9)
    p.cone((0, 0, 4.45), .3, .5, '#ffd23f', verts=5, glow=.6)
    p.ball((0, 0, 4.25), .2, '#fff3b0', glow=1.2)
    bpy.context.view_layer.update()
    lean(p.parts[base:])
    return p.parts


def gate_swirl():
    p = P('swirl')
    disc = style.cyl('d', 1.55, .06, (0, 0, 2.35), p.m('#7a5cff', 1.0), verts=28, bev=0)
    disc.rotation_euler = (math.radians(90), 0, 0)
    p.parts.append(disc)
    for i in range(3):  # spiral arms
        for k in range(6):
            a = i * TAU / 3 + k * .5
            r = .25 + k * .22
            p.ball((math.cos(a) * r, -.06, 2.35 + math.sin(a) * r), .09 + k * .02, ['#c7b8ff', '#6af0ff', '#ffffff'][i], glow=1.3)
    bpy.context.view_layer.update()
    lean(p.parts)
    return p.parts


def keeper():
    p = P('keeper')
    # Cloak: a wide bell with a patch, hood up
    p.cyl((0, 0, 0), .55, 1.05, '#3b5fa8', r2=.32, verts=16)
    p.box((.28, -.4, .45), (.2, .04, .2), '#ffd23f', rot=(0, 0, math.radians(12)), bev=.02)
    p.ball((0, 0, 1.25), .34, '#ffe0c2', sub=2)
    p.eyes(-.3, 1.27, .11, .06)
    p.cheeks(-.28, 1.16, .17, .05)
    p.cone((0, .05, 1.55), .42, .7, '#2c4688', verts=14, rot=(math.radians(-10), 0, 0))
    p.ball((0, .2, 1.98), .11, '#ffd23f', glow=.8)
    p.torus((0, 0, 1.47), .36, .07, '#ffd23f', segs=16, minor=4)
    p.ball((0, -.32, 1.0), (.14, .08, .2), '#f2f2f2')  # a little beard
    # Star staff
    p.rod((.55, -.1, 0), (.62, -.15, 1.75), .04, '#8a5a3c')
    p.cone((.62, -.15, 1.95), .2, .3, '#ffd23f', verts=5, glow=1.2)
    p.ball((.62, -.15, 1.88), .1, '#fff3b0', glow=1.5)
    for s in (-1, 1):
        p.ball((s * .4, -.15, .78), .12, '#3b5fa8')
        p.ball((s * .2, -.05, .05), (.14, .2, .08), '#5a3a28')
    return p.parts


# ------------------------------------------------------------------ the field
def stand():
    p = P('stand')
    p.cyl((0, 0, 0), 1.25, .22, '#e8dcc0', verts=16, bev=.03)
    p.cyl((0, 0, .22), 1.0, .12, p.team(), verts=16, bev=.02)
    p.torus((0, 0, .36), .95, .06, p.team_glow(), segs=20, minor=4)
    for i in range(6):
        a = i * TAU / 6
        p.cone((math.cos(a) * 1.15, math.sin(a) * 1.15, .22), .12, .3, '#ffd23f', verts=5)
    return p.parts


def flag():
    p = P('flag')
    p.rod((0, 0, 0), (0, 0, 2.6), .05, '#f3e6c8')
    p.ball((0, 0, 2.68), .11, '#ffd23f', glow=.5)
    # A waving cloth: three panels at slight angles
    for i, (y0, ang) in enumerate([(0, 6), (.38, -8), (.76, 7)]):
        o = p.box((0, -.2 - y0, 2.18), (.05, .4, .78), p.team(), rot=(0, 0, math.radians(ang)), bev=.01)
    p.ball((0, -.62, 2.18), .14, '#ffffff')  # emblem
    p.cone((0, -.62, 2.26), .1, .14, '#ffd23f', verts=5)
    return p.parts


def pad():
    p = P('pad')
    p.cyl((0, 0, 0), 1.35, .2, '#7d7f8c', verts=18, bev=.03)
    p.cyl((0, 0, .2), 1.15, .16, p.team(), verts=18, bev=.03)
    for k in range(3):  # spring coils peeking out
        p.torus((0, 0, .08 + k * .05), 1.25, .04, '#c9ced8', segs=18, minor=4)
    p.torus((0, 0, .38), .78, .07, p.team_glow(), segs=18, minor=4)
    p.cone((0, 0, .36), .32, .3, '#fff3b0', verts=4, glow=.8)
    return p.parts


def bridge():
    p = P('bridge')
    for i in range(10):
        x = -3.6 + i * .8
        p.box((x, 0, .18), (.74, 5.4, .14), ['#b07a4a', '#9a6a40'][i % 2], bev=.02)
    for s in (-1, 1):
        p.box((0, s * 2.75, .55), (8.0, .14, .12), '#8a5a3c', bev=.02)
        for i in range(5):
            p.cyl((-3.6 + i * 1.8, s * 2.75, 0), .1, .7, '#7a4a2c', verts=6)
    return p.parts


def post():
    p = P('post')
    p.cyl((0, 0, 0), .2, 1.0, '#b07a4a', verts=6)
    p.cone((0, 0, 1.0), .24, .22, '#8a5a3c', verts=6)
    p.box((0, 0, .55), (.9, .08, .12), '#c48c58', bev=.01)
    return p.parts


def rock():
    p = P('rock')
    for (x, y, z, s, c) in [(0, 0, .45, (1.0, .9, .7), '#9aa0ab'), (.5, .3, .3, (.55, .5, .45), '#b4bac4'), (-.45, -.2, .25, (.5, .45, .35), '#868c97')]:
        p.ball((x, y, z), s, c, sub=1)
    p.ball((-.2, -.3, .78), (.35, .3, .1), '#7fc464', sub=1)  # moss
    return p.parts


def tree():
    p = P('tree')
    p.cyl((0, 0, 0), .22, 1.4, '#8a5a3c', r2=.16, verts=7)
    p.ball((0, 0, 1.9), (1.05, 1.05, .9), '#4fae4a', sub=1)
    p.ball((.35, -.2, 2.45), (.7, .7, .6), '#6cc85a', sub=1)
    p.ball((-.4, .25, 2.25), (.6, .6, .5), '#3e9a42', sub=1)
    return p.parts


def banner():
    p = P('banner')
    for s in (-1, 1):
        p.rod((s * .9, 0, 0), (s * .9, 0, 2.8), .06, '#e8dcc0')
        p.ball((s * .9, 0, 2.86), .1, '#ffd23f')
    p.box((0, 0, 2.55), (1.9, .05, .12), '#e8dcc0', bev=.01)
    p.box((0, 0, 1.75), (1.5, .04, 1.45), p.team(), bev=.01)
    p.cone((0, -.04, 1.1), .75, .3, p.team(), verts=3, rot=(math.radians(90), 0, math.radians(180)))
    p.ball((0, -.05, 1.85), (.32, .05, .32), '#ffffff')
    p.cone((0, -.08, 1.9), .2, .1, '#ffd23f', verts=5, rot=(math.radians(-90), 0, 0))
    return p.parts


def power_ring():
    p = P('pring')
    p.cyl((0, 0, 0), .95, .08, '#e8dcc0', verts=16, bev=.02)
    p.torus((0, 0, .1), .78, .06, '#fff3b0', segs=18, minor=4, glow=1.2)
    return p.parts


# ------------------------------------------------------------------ power-ups (~0.8 m, centred at z .45)
def pw_zip():
    p = P('zip')
    p.ball((0, -.05, .3), (.3, .45, .22), '#ffd23f', sub=2)
    p.ball((0, .25, .52), (.26, .22, .3), '#ffd23f', sub=2)
    p.box((0, -.15, .12), (.6, .9, .1), '#ffffff', bev=.04)
    for s in (-1, 1):
        p.ball((s * .3, .25, .62), (.06, .2, .14), '#ffffff', rot=(0, math.radians(s * 30), 0))
    for k in range(3):
        p.box((0, .45 + k * .14, .3 + k * .08), (.08, .12, .04), '#ff9a3c', glow=.6)
    return p.parts


def pw_bubble():
    p = P('bubble')
    p.ball((0, 0, .45), .42, '#8fe3ff', sub=2)
    p.ball((-.14, -.3, .6), .1, '#ffffff', glow=.8)
    p.torus((0, 0, .45), .43, .03, '#ffffff', rot=(math.radians(70), 0, 0), segs=20, minor=4)
    return p.parts


def pw_pumpkin():
    p = P('pumpkin')
    for i in range(6):
        a = i * TAU / 6
        p.ball((math.cos(a) * .16, math.sin(a) * .16, .35), (.24, .24, .3), '#ff9a3c', sub=1)
    p.cyl((0, 0, .6), .06, .16, '#4f8a3a', verts=6)
    p.cone((-.1, -.36, .4), .07, .08, INK, verts=3, rot=(math.radians(90), 0, 0))
    p.cone((.1, -.36, .4), .07, .08, INK, verts=3, rot=(math.radians(90), 0, 0))
    p.box((0, -.37, .27), (.2, .04, .05), INK, bev=.01)
    p.rod((0, 0, .72), (.12, -.05, .88), .02, '#5a3a28')
    p.ball((.12, -.05, .9), .05, '#ffe14d', glow=1.5)
    return p.parts


def pw_wisp():
    p = P('wisp')
    p.cone((0, 0, .05), .4, .6, '#c8b8ff', verts=10)
    p.ball((0, 0, .6), (.32, .3, .3), '#e6dcff', sub=2)
    p.eyes(-.26, .64, .1, .06)
    for s in (-1, 1):
        p.ball((s * .38, -.05, .45), (.12, .08, .08), '#e6dcff')
    p.ball((0, .15, .95), .08, '#fff3b0', glow=1.4)
    return p.parts


def pw_bigcap():
    p = P('bigcap')
    p.cyl((0, 0, 0), .16, .4, '#fff1d6', r2=.13, verts=10)
    p.ball((0, 0, .5), (.45, .45, .26), '#ff5f6d', sub=2)
    for (x, y) in [(.2, -.2), (-.22, -.12), (0, .28), (.28, .12), (-.1, -.33)]:
        p.ball((x, y, .64), .08, '#ffffff')
    p.eyes(-.15, .22, .06, .045)
    return p.parts


def pw_frost():
    p = P('frost')
    for i in range(6):
        a = i * TAU / 6
        p.rod((0, 0, .45), (math.cos(a) * .42, 0, .45 + math.sin(a) * .42), .05, '#bff4ff', verts=6, glow=.6)
        p.ball((math.cos(a) * .42, 0, .45 + math.sin(a) * .42), .07, '#ffffff', glow=.6)
    p.ball((0, 0, .45), .12, '#ffffff', glow=1.0)
    return p.parts


def pw_apple():
    p = P('apple')
    p.ball((0, 0, .38), (.36, .36, .33), '#ff4d4d', sub=2)
    p.ball((-.12, -.24, .52), .07, '#ffffff', glow=.5)
    p.cyl((0, 0, .66), .03, .14, '#5a3a28', verts=6)
    p.ball((.1, 0, .76), (.14, .06, .07), '#58c24a', rot=(0, math.radians(-25), 0))
    p.torus((0, 0, .38), .45, .025, '#ffd23f', segs=16, minor=4, glow=1.0)
    return p.parts


POWERS = [('ctf_pw_zip', pw_zip), ('ctf_pw_bubble', pw_bubble), ('ctf_pw_pumpkin', pw_pumpkin), ('ctf_pw_wisp', pw_wisp),
          ('ctf_pw_bigcap', pw_bigcap), ('ctf_pw_frost', pw_frost), ('ctf_pw_apple', pw_apple)]


def main():
    style.reset_scene()
    roots, manifest = [], {}

    def add(name, parts, budget):
        root, body, tris = dg.finish(name, parts, budget)
        roots.append(root)
        manifest[name] = {'triangles': tris, 'bounds': dg.measure([body])}
        return root
    add('ctf_gate', gate(), 4000)
    add('ctf_gate_swirl', gate_swirl(), 2000)
    add('ctf_keeper', keeper(), 2500)
    add('ctf_stand', stand(), 1200)
    add('ctf_flag', flag(), 600)
    add('ctf_pad', pad(), 1500)
    add('ctf_bridge', bridge(), 1200)
    add('ctf_post', post(), 120)
    add('ctf_rock', rock(), 400)
    add('ctf_tree', tree(), 500)
    add('ctf_banner', banner(), 700)
    add('ctf_power_ring', power_ring(), 400)
    for name, fn in POWERS:
        add(name, fn(), 1500)
    objs = [o for r in roots for o in [r] + list(r.children_recursive)]
    size = style.export_glb(objs, OUT)
    assert size < 600000, size
    mp = os.path.join(R, 'art', 'generated', 'kit', 'ctf-manifest.json')
    os.makedirs(os.path.dirname(mp), exist_ok=True)
    open(mp, 'w').write(json.dumps(manifest, indent=2))
    import build_creatures as pres
    pres.stage((1800, 1000), ground='#79c95a')
    layout = {'ctf_gate': (-9, 3), 'ctf_gate_swirl': (-9, 3), 'ctf_keeper': (-5, 0), 'ctf_stand': (-1, 0), 'ctf_flag': (-1, 0),
              'ctf_pad': (2.5, 0), 'ctf_bridge': (8, 6), 'ctf_post': (5, -1.5), 'ctf_rock': (5, 1.5), 'ctf_tree': (12, 2),
              'ctf_banner': (-3, 4), 'ctf_power_ring': (0, -4)}
    for i, (name, _) in enumerate(POWERS):
        layout[name] = (-6 + i * 1.8, -4)
    for r in roots:
        r.location = (*layout.get(r.name, (0, 0)), 0)
    pres.camera(28, 10, (0, 0, 1), 30, distance=80)
    pp = os.path.join(R, 'art', 'previews', 'kit', 'ctf.webp')
    os.makedirs(os.path.dirname(pp), exist_ok=True)
    style.render(pp)
    print('CTF_OK', size, json.dumps({k: v['triangles'] for k, v in manifest.items()}))


def icons():
    import build_items
    style.reset_scene()
    bpy.ops.import_scene.gltf(filepath=OUT)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    style.studio(size=(160, 160), transparent=True)
    build_items._eevee(48)
    scene = bpy.context.scene
    scene.view_settings.exposure = -.1
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value = .6
    os.makedirs(ICONS, exist_ok=True)
    for node in [n for n, _ in POWERS] + ['ctf_flag', 'ctf_gate', 'ctf_keeper']:
        root = bpy.data.objects[node]
        parts = [o for o in root.children_recursive if o.type == 'MESH']
        if node == 'ctf_gate':
            parts += [o for o in bpy.data.objects['ctf_gate_swirl'].children_recursive if o.type == 'MESH']
        for o in meshes:
            o.hide_render = o not in parts
        tmp = []
        for o in parts:
            c = o.copy()
            c.data = o.data.copy()
            bpy.context.collection.objects.link(c)
            c.parent = None
            c.matrix_world = o.matrix_world.copy()
            c.hide_render = False
            tmp.append(c)
        bpy.context.view_layer.update()
        joined = style.join(tmp, 'tmpjoin')
        cam = build_items.icon_camera(joined, elevation=24, yaw=18, margin=1.12)
        bpy.ops.render.render(write_still=False)
        res = bpy.data.images['Render Result']
        dest = os.path.join(ICONS, node.replace('ctf_pw_', '').replace('ctf_', '') + '.webp')
        for q in (88, 80, 72, 64):
            scene.render.image_settings.quality = q
            res.save_render(dest, scene=scene)
            if os.path.getsize(dest) <= 16000:
                break
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.objects.remove(joined, do_unlink=True)
        print('ICON', node, os.path.getsize(dest))
    print('CTF_ICONS_OK')


if __name__ == '__main__':
    icons() if '--icons' in sys.argv else main()
