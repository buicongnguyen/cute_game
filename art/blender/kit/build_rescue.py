"""Rescue Call kit (the SOS portal and the Hold the Line fields) -> public/assets/models/rescue.glb, a manifest, a
preview and 160px icons.

Run: blender -b --factory-startup --python art/blender/kit/build_rescue.py              (model, manifest, preview)
     blender -b --factory-startup --python art/blender/kit/build_rescue.py -- --icons  (webp icons from the glb)

One top-level empty per piece with a joined child '<name>_body'; turrets also have '<name>_head' whose origin is the
turning pivot. Origin at the ground centre, front facing Blender -Y (glTF +Z), metres. Pieces (src/rescue-view.ts):
  rs_portal, rs_portal_swirl      the cracked SOS portal by the south square and its swirl (leans back 28 deg)
  rs_pad, rs_post, rs_chevron     a build pad, a squad guard post, a flat lane arrow (drawn instanced)
  rs_camp, rs_farmhouse           your end: the squad's camp and the friend's farmhouse ('RS roof' tinted per planet)
  rs_<defence>_<1..3>             popcorn turret, tesla coil, deck cannon, sandbag wall, frost lantern; 3 looks each
  rs_helmet, rs_scarf, rs_banner  small raider props for stronger waves (worn on the creature's head)
  rs_blocks, rs_ball, rs_crate, rs_candyrock, rs_bush, rs_tree    field decor (drawn instanced; 'RS leaf' tinted)
Everything is original: shapes, colours and names are this project's own.
"""
import bpy, math, os, sys, json
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style
import build_dungeon as dg
R = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(R, 'public', 'assets', 'models', 'rescue.glb')
ICONS = os.path.join(R, 'public', 'assets', 'icons', 'rescue')
TAU = math.tau
INK = dg.INK
GOLD = '#ffc93c'


class P(dg.P):
    def m(self, c, glow=0.0, name=None):
        if not isinstance(c, str):
            return c
        key = name or 'RS %s%s' % (c, ' glow' if glow else '')
        if key not in self.cache:
            self.cache[key] = style.mat(key, c, rough=.5, emit=c if glow else None, emit_strength=glow)
        return self.cache[key]

    def named(self, name, c):
        return self.m(c, 0, name)


SHARED = {}


def p(tag):
    q = P(tag)
    q.cache = SHARED  # one material per colour across the file: fewer materials, easier baking at runtime
    return q


LEAN = math.radians(28)


def lean(parts, pivot_z=.4):
    m = Matrix.Translation(Vector((0, 0, pivot_z))) @ Matrix.Rotation(-LEAN, 4, 'X') @ Matrix.Translation(Vector((0, 0, -pivot_z)))
    for o in parts:
        o.matrix_world = m @ o.matrix_world
    return parts


# ------------------------------------------------------------------ the portal
def portal():
    q = p('portal')
    q.cyl((0, 0, 0), 2.1, .3, '#c7a77a', verts=10, bev=.04)
    q.cyl((0, 0, .3), 1.8, .14, '#e8d3a6', verts=10, bev=.02)
    for s in (-1, 1):  # two lantern posts
        q.cyl((s * 2.35, .4, 0), .1, 1.7, '#7a4a2c', verts=6)
        q.ball((s * 2.35, .4, 1.85), .2, '#ffb347', glow=1.4)
        q.cone((s * 2.35, .4, 2.05), .26, .22, '#c0392b', verts=6)
    base = len(q.parts)
    q.torus((0, 0, 2.2), 1.7, .3, '#d9b98a', rot=(math.radians(90), 0, 0), segs=20, minor=6)
    q.torus((0, 0, 2.2), 1.42, .08, '#ff6a3d', rot=(math.radians(90), 0, 0), segs=20, minor=4, glow=1.6)
    for i, a in enumerate([.3, 1.4, 2.6, 3.9, 5.2]):  # cracks
        x, z = math.cos(a) * 1.7, 2.2 + math.sin(a) * 1.7
        q.box((x, -.3, z), (.06, .05, .5), INK, rot=(0, a + .4, 0), bev=0)
        q.box((x * .97, -.31, z - .15), (.05, .05, .3), INK, rot=(0, a - .5, 0), bev=0)
    for i in range(6):  # warm studs
        a = i * TAU / 6 + .25
        q.ball((math.cos(a) * 1.7, -.28, 2.2 + math.sin(a) * 1.7), .14, ['#ffd23f', '#ff7ab0', '#7fd0ff'][i % 3], glow=.9)
    # The SOS horn on top
    q.cone((0, 0, 4.05), .32, .7, GOLD, verts=10, rot=(math.radians(-90), 0, math.radians(90)))
    q.torus((.35, 0, 4.05), .2, .05, '#e09a1c', rot=(0, math.radians(90), 0), segs=12, minor=4)
    bpy.context.view_layer.update()
    lean(q.parts[base:])
    return q.parts


def portal_swirl():
    q = p('swirl')
    disc = style.cyl('d', 1.42, .05, (0, 0, 2.2), q.m('#ff8a4d', 1.0), verts=24, bev=0)
    disc.rotation_euler = (math.radians(90), 0, 0)
    q.parts.append(disc)
    for i in range(3):
        for k in range(6):
            a = i * TAU / 3 + k * .55
            r = .22 + k * .2
            q.ball((math.cos(a) * r, -.06, 2.2 + math.sin(a) * r), .08 + k * .02, ['#fff3b0', '#ff5fa2', '#ffffff'][i], glow=1.4)
    bpy.context.view_layer.update()
    lean(q.parts)
    return q.parts


# ------------------------------------------------------------------ the field
def pad():
    q = p('pad')
    q.cyl((0, 0, 0), 1.25, .16, '#b9b2a6', verts=8, bev=.03)
    q.cyl((0, 0, .16), 1.05, .05, '#d8d0c0', verts=8, bev=.01)
    q.torus((0, 0, .2), 1.05, .05, GOLD, segs=8, minor=4)
    for i in range(4):
        a = i * TAU / 4 + TAU / 8
        q.cyl((math.cos(a) * .82, math.sin(a) * .82, .18), .09, .06, '#8a8070', verts=6)
    return q.parts


def post():
    q = p('post')
    q.cyl((0, 0, 0), .06, 1.2, '#8a5a3c', verts=6)
    q.cyl((0, 0, 1.05), .32, .08, '#3f8cff', verts=12, bev=.02)
    q.parts[-1].rotation_euler = (math.radians(90), 0, 0)
    q.cone((0, -.05, 1.09), .16, .06, '#ffd23f', verts=5, rot=(math.radians(90), 0, 0))
    q.cyl((0, 0, 0), .35, .05, '#e8dcc0', verts=10)
    return q.parts


def chevron():
    q = p('chev')
    for s in (-1, 1):
        q.box((s * .22, 0, .03), (.55, .16, .04), '#fff3d6', rot=(0, 0, math.radians(s * 40)), bev=0)
    return q.parts


def camp():
    q = p('camp')
    # A big two-tone tent with an open flap
    q.cone((0, 1.2, 1.15), 1.7, 2.3, '#ff8a4d', verts=8)
    q.cone((0, 1.2, 1.95), .64, .72, '#fff3d6', verts=8)
    q.cone((0, -.32, .6), .55, 1.2, '#7a3b20', verts=3, rot=(math.radians(-36), 0, 0))
    q.ball((0, 1.2, 2.35), .12, GOLD)
    # Campfire
    for i in range(5):
        a = i * TAU / 5
        q.ball((1.8 + math.cos(a) * .45, -.6 + math.sin(a) * .45, .1), .16, '#9aa0ab', sub=1)
    for s in (-1, 1):
        q.rod((1.8 - .35, -.6 + s * .2, .08), (1.8 + .35, -.6 - s * .2, .14), .07, '#7a4a2c')
    q.cone((1.8, -.6, .12), .28, .55, '#ffb347', verts=6, glow=1.5)
    q.cone((1.8, -.6, .14), .16, .4, '#fff3b0', verts=6, glow=2.0)
    # Supplies and a banner
    q.box((-1.7, -.4, .3), (.7, .6, .6), '#c48c58', bev=.03)
    q.box((-1.7, -.4, .62), (.72, .62, .05), '#8a5a3c', bev=0)
    q.cyl((-1.3, 1.6, 0), .05, 2.6, '#e8dcc0', verts=6)
    q.box((-1.3, 1.25, 2.25), (.04, .7, .5), '#3f8cff', bev=0)
    q.ball((-1.3, 1.6, 2.65), .08, GOLD)
    return q.parts


def farmhouse():
    q = p('farm')
    roof = q.named('RS roof', '#e8524a')
    q.box((0, 0, 1.1), (4.2, 3.2, 2.2), '#fff1d6', bev=.05)
    q.box((0, 0, .1), (4.4, 3.4, .2), '#c9b38a', bev=.02)
    # Pitched roof: two slabs
    for s in (-1, 1):
        q.box((0, s * .85, 2.65), (4.6, 2.0, .18), roof, rot=(math.radians(s * -32), 0, 0), bev=.03)
    q.box((-1.3, 1.0, 3.2), (.4, .4, .9), '#b0614a', bev=.02)  # chimney
    q.box((0, -1.62, .75), (.9, .06, 1.4), '#8a5a3c', bev=.02)  # door
    q.ball((.3, -1.67, .75), .05, GOLD)
    for x in (-1.4, 1.4):  # windows that glow a little
        q.box((x, -1.62, 1.35), (.7, .06, .6), '#ffe9a8', glow=.5, bev=.01)
        q.box((x, -1.66, 1.35), (.75, .03, .06), '#8a5a3c', bev=0)
        q.box((x, -1.66, 1.35), (.06, .03, .65), '#8a5a3c', bev=0)
    # A little silo and a fence
    q.cyl((2.9, .6, 0), .7, 2.6, '#e8dcc0', verts=10)
    q.ball((2.9, .6, 2.6), (.72, .72, .5), roof, sub=1)
    for i in range(5):
        q.box((-2.4 + i * 1.2, -2.6, .45), (.1, .1, .9), '#b07a4a', bev=0)
    q.box((0, -2.6, .65), (4.9, .06, .12), '#c48c58', bev=0)
    return q.parts


# ------------------------------------------------------------------ defences: (body parts, head parts, pivot z)
def popcorn(lv):
    b, h = p('pop'), p('poph')
    r = .55 + .08 * lv
    b.cyl((0, 0, 0), r, .9 + .1 * lv, '#ff5a5f', r2=r * 1.18, verts=12)
    for i in range(6):  # white stripes
        a = i * TAU / 6
        b.box((math.cos(a) * r * 1.05, math.sin(a) * r * 1.05, .5 + .05 * lv), (.12, .04, .8 + .1 * lv), '#ffffff', rot=(0, 0, a + math.pi / 2), bev=0)
    top = .9 + .1 * lv
    if lv >= 3:
        b.torus((0, 0, top), r * 1.18, .06, GOLD, segs=12, minor=4)
    # head: a popcorn heap and the barrels
    for i in range(7):
        a = i * TAU / 7
        h.ball((math.cos(a) * .25, math.sin(a) * .25, .12), .16, '#fff6d8', sub=1)
    h.ball((0, 0, .24), .2, '#ffe9a8', sub=1)
    n = lv
    for k in range(n):
        x = (k - (n - 1) / 2) * .26
        h.rod((x, .05, .2), (x, -.75, .3), .1, '#4a5568', verts=8)
        h.torus((x, -.75, .3), .1, .035, GOLD if lv >= 2 else '#c9ced8', rot=(math.radians(90), 0, 0), segs=10, minor=4)
    return b.parts, h.parts, top


def tesla(lv):
    b, h = p('tes'), p('tesh')
    b.cyl((0, 0, 0), .7, .25, '#5a6478', verts=8, bev=.03)
    for s in range(3):  # tripod
        a = s * TAU / 3
        b.rod((math.cos(a) * .55, math.sin(a) * .55, .2), (0, 0, 1.0 + .1 * lv), .06, '#8a94a8')
    b.cyl((0, 0, .2), .18, .9 + .1 * lv, '#c47a3a', verts=8)
    top = 1.1 + .1 * lv
    for k in range(2 + lv):  # copper coils
        h.torus((0, 0, -.05 + k * .13), .28 - k * .02, .05, '#e08a3c', segs=12, minor=4)
    h.ball((0, 0, .2 + lv * .13 + .15), .22 + .03 * lv, '#7ff7ff', glow=1.6)
    if lv >= 3:
        h.torus((0, 0, .2 + lv * .13 + .15), .42, .03, '#bff7ff', segs=16, minor=4, glow=1.2)
        for s in (-1, 1):
            h.ball((s * .42, 0, .2 + lv * .13 + .15), .09, '#ffffff', glow=1.5)
    return b.parts, h.parts, top


def cannon(lv):
    b, h = p('can'), p('canh')
    w = .9 + .1 * lv
    b.box((0, 0, .32), (w, 1.2, .3), '#9a6a40', bev=.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl((sx * (w / 2 + .05), sy * .4, .22), .22, .1, '#6a4428', verts=10)
            b.parts[-1].rotation_euler = (0, math.radians(90), 0)
    if lv >= 2:
        b.box((0, .62, .5), (w, .08, .3), '#7a4a2c', bev=.01)
    top = .55
    L = .95 + .12 * lv
    h.rod((0, .3, .2), (0, -L, .32), .2 + .02 * lv, '#2f3542', verts=10)
    h.torus((0, -L, .32), .2 + .02 * lv, .05, GOLD if lv >= 3 else '#5a6478', rot=(math.radians(90), 0, 0), segs=12, minor=4)
    h.ball((0, .32, .2), .22, '#2f3542', sub=1)
    if lv >= 3:
        h.torus((0, -.2, .27), .23, .04, GOLD, rot=(math.radians(90), 0, 0), segs=12, minor=4)
    return b.parts, h.parts, top


def wall(lv):
    b = p('wall')
    rows = lv
    for r in range(rows):
        n = 5 - (r % 2)
        for i in range(n):
            x = (i - (n - 1) / 2) * .56
            b.ball((x, 0, .18 + r * .3), (.32, .26, .17), ['#d9c08a', '#cbb07a'][(i + r) % 2], sub=1)
    if lv >= 2:
        for s in (-1, 1):
            b.cyl((s * 1.5, 0, 0), .07, .5 + .3 * rows, '#8a5a3c', verts=6)
    if lv >= 3:
        b.box((0, -.3, .55), (2.6, .06, .5), '#9aa3b5', bev=.02)
        for x in (-1, 0, 1):
            b.ball((x * .9, -.34, .55), .05, '#5a6478')
    return b.parts, [], 0


def frost(lv):
    b, h = p('fro'), p('froh')
    b.cyl((0, 0, 0), .45, .18, '#9aa3b5', verts=8, bev=.02)
    b.cyl((0, 0, .18), .08, 1.5 + .15 * lv, '#5a6478', verts=6)
    top = 1.68 + .15 * lv
    b.rod((0, 0, top - .1), (.45, 0, top - .05), .04, '#5a6478')
    # The lantern hangs from the arm (head pivot at the arm's tip, so it can sway)
    h.cyl((0, 0, -.62), .2 + .03 * lv, .45, '#bff4ff', verts=8, glow=1.2)
    h.cone((0, 0, -.17), .28 + .03 * lv, .2, '#4a7fb0', verts=8)
    h.cyl((0, 0, -.66), .24 + .03 * lv, .06, '#4a7fb0', verts=8)
    h.rod((0, 0, -.17), (0, 0, 0), .02, '#2f3542')
    if lv >= 2:
        for i in range(4):
            a = i * TAU / 4
            h.cone((math.cos(a) * .3, math.sin(a) * .3, -.75), .07, .22, '#e6fbff', verts=4, rot=(math.radians(180), 0, 0))
    if lv >= 3:
        for i in range(6):
            a = i * TAU / 6
            h.rod((0, 0, .1), (math.cos(a) * .3, 0, .1 + math.sin(a) * .3), .03, '#e6fbff', verts=4, glow=.8)
    return b.parts, h.parts, (.45, top - .05)


# ------------------------------------------------------------------ raider props (sized for a ~0.8 m head; the game scales)
def helmet():
    q = p('helm')
    q.ball((0, 0, .1), (.42, .42, .3), '#8a94a8', sub=2)
    q.cyl((0, 0, 0), .45, .07, '#c0392b', verts=14)
    q.cone((0, 0, .38), .07, .22, GOLD, verts=6)
    return q.parts


def scarf():
    q = p('scarf')
    q.torus((0, 0, 0), .36, .09, '#e8524a', segs=14, minor=5)
    q.box((.15, -.36, -.18), (.16, .06, .38), '#e8524a', rot=(0, math.radians(-12), 0), bev=.02)
    q.box((.15, -.37, -.3), (.17, .065, .06), '#fff3d6', rot=(0, math.radians(-12), 0), bev=0)
    return q.parts


def banner():
    q = p('ban')
    q.rod((0, .1, 0), (0, .1, .9), .025, '#7a4a2c', verts=6)
    q.box((0, .3, .72), (.04, .38, .26), '#2f3542', bev=0)
    q.ball((0, .3, .72), .07, '#ffd23f')
    return q.parts


# ------------------------------------------------------------------ decor
def blocks():
    q = p('blk')
    for (x, y, z, c, r) in [(0, 0, .3, '#ff5a5f', 0), (.62, .1, .3, '#3f8cff', .3), (.3, .05, .9, '#ffd23f', .7)]:
        q.box((x, y, z), (.58, .58, .58), c, rot=(0, 0, r), bev=.05)
        q.box((x, y - .3, z), (.3, .02, .3), '#ffffff', rot=(0, 0, r), bev=0)
    return q.parts


def ball():
    q = p('ball')
    for i in range(6):
        a = i * TAU / 6
        q.ball((0, 0, .55), (.57, .24, .57), ['#ff5a5f', '#ffffff', '#3f8cff', '#ffffff', '#ffd23f', '#ffffff'][i], sub=2, rot=(0, 0, a))
    q.ball((0, 0, .55), .52, '#ffffff', sub=2)
    return q.parts


def crate():
    q = p('crate')
    q.box((0, 0, .4), (.8, .8, .8), '#c48c58', bev=.03)
    for s in (-1, 1):
        q.box((0, s * .41, .4), (.84, .04, .1), '#8a5a3c', bev=0)
        q.box((s * .41, 0, .4), (.04, .84, .1), '#8a5a3c', bev=0)
    return q.parts


def candyrock():
    q = p('candy')
    q.ball((0, 0, .55), (1.0, .9, .65), '#ff9ccf', sub=2)
    q.torus((0, 0, .9), .5, .1, '#ffffff', segs=16, minor=4)
    q.rod((.5, .2, .8), (.7, .25, 1.9), .06, '#ffffff', verts=6)
    q.cyl((.7, .25, 1.9), .35, .12, '#7fd0ff', verts=14)
    q.parts[-1].rotation_euler = (math.radians(90), 0, 0)
    q.torus((.7, .2, 1.96), .22, .05, '#ffffff', rot=(math.radians(90), 0, 0), segs=12, minor=4)
    return q.parts


def bush():
    q = p('bush')
    leaf = q.named('RS leaf', '#2fae52')
    for (x, y, z, s) in [(0, 0, .5, .75), (.55, .2, .4, .55), (-.5, -.1, .38, .55)]:
        q.ball((x, y, z), (s, s, s * .85), leaf, sub=1)
    for (x, y, z) in [(.3, -.55, .7), (-.4, -.45, .55), (.1, -.2, 1.05)]:
        q.ball((x, y, z), .1, '#ff6fae')
    return q.parts


def tree():
    q = p('tree')
    leaf = q.named('RS leaf', '#2fae52')
    q.cyl((0, 0, 0), .2, 1.4, '#8a5a3c', r2=.14, verts=6)
    q.ball((0, 0, 1.9), (1.0, 1.0, .9), leaf, sub=1)
    q.ball((.35, -.25, 2.45), (.65, .65, .55), leaf, sub=1)
    return q.parts


DEFENCES = [('popcorn', popcorn), ('tesla', tesla), ('cannon', cannon), ('wall', wall), ('frost', frost)]


def finish_head(name, body_parts, head_parts, pivot, budget):
    root, body, tris = dg.finish(name, body_parts, budget)
    if head_parts:
        head = style.join(head_parts, name + '_head')
        px, pz = (pivot if isinstance(pivot, tuple) else (0, pivot))
        # Head parts were modelled about the pivot (x px, z pz): place the joined head there.
        head.location = (px, 0, pz)
        head.parent = root
        tris += style.triangles(head)
        assert tris <= budget, (name, tris, budget)
    return root, body, tris


def main():
    style.reset_scene()
    roots, manifest = [], {}

    probe = bool(os.environ.get('RS_PROBE'))  # report triangle counts without the budget gate

    def add(name, parts, budget):
        root, body, tris = dg.finish(name, parts, 99999 if probe else budget)
        roots.append(root)
        manifest[name] = {'triangles': tris, 'bounds': dg.measure([body])}
        return root
    add('rs_portal', portal(), 1400)
    add('rs_portal_swirl', portal_swirl(), 600)
    add('rs_pad', pad(), 700)
    add('rs_post', post(), 300)
    add('rs_chevron', chevron(), 40)
    add('rs_camp', camp(), 600)
    add('rs_farmhouse', farmhouse(), 800)
    for kind, fn in DEFENCES:
        for lv in (1, 2, 3):
            body, head, pivot = fn(lv)
            name = 'rs_%s_%d' % (kind, lv)
            root, b, tris = finish_head(name, body, head, pivot, 99999 if probe else 1200)
            roots.append(root)
            manifest[name] = {'triangles': tris, 'bounds': dg.measure([b] + [c for c in root.children if c != b])}
    add('rs_helmet', helmet(), 200)
    add('rs_scarf', scarf(), 300)
    add('rs_banner', banner(), 100)
    add('rs_blocks', blocks(), 250)
    add('rs_ball', ball(), 700)
    add('rs_crate', crate(), 150)
    add('rs_candyrock', candyrock(), 500)
    add('rs_bush', bush(), 200)
    add('rs_tree', tree(), 100)
    objs = [o for r in roots for o in [r] + list(r.children_recursive)]
    size = style.export_glb(objs, OUT)
    assert size < 700000, size
    mp = os.path.join(R, 'art', 'generated', 'kit', 'rescue-manifest.json')
    os.makedirs(os.path.dirname(mp), exist_ok=True)
    open(mp, 'w').write(json.dumps(manifest, indent=2))
    import build_creatures as pres
    pres.stage((1800, 1000), ground='#8fd36a')
    layout = {'rs_portal': (-11, 4), 'rs_portal_swirl': (-11, 4), 'rs_camp': (-5, 5), 'rs_farmhouse': (2, 6), 'rs_pad': (-11, -3), 'rs_post': (-9, -3),
              'rs_chevron': (-8, -4.5), 'rs_helmet': (8, 5), 'rs_scarf': (9.5, 5), 'rs_banner': (11, 5), 'rs_blocks': (8, 8), 'rs_ball': (10, 8), 'rs_crate': (12, 8),
              'rs_candyrock': (13, 5), 'rs_bush': (14, 8), 'rs_tree': (16, 6)}
    for i, (kind, _) in enumerate(DEFENCES):
        for lv in (1, 2, 3):
            layout['rs_%s_%d' % (kind, lv)] = (-6 + i * 3.2, -1 - (lv - 1) * 3)
    for r in roots:
        r.location = (*layout.get(r.name, (0, 0)), 0)
    pres.camera(32, 8, (2, 1, 1), 34, distance=80)
    pp = os.path.join(R, 'art', 'previews', 'kit', 'rescue.webp')
    os.makedirs(os.path.dirname(pp), exist_ok=True)
    style.render(pp)
    print('RESCUE_OK', size, json.dumps({k: v['triangles'] for k, v in manifest.items()}))


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
    jobs = [('rs_%s_2' % k, k) for k, _ in DEFENCES] + [('rs_portal', 'portal'), ('rs_farmhouse', 'farmhouse'), ('rs_camp', 'camp')]
    for node, out in jobs:
        root = bpy.data.objects[node]
        parts = [o for o in root.children_recursive if o.type == 'MESH']
        if node == 'rs_portal':
            parts += [o for o in bpy.data.objects['rs_portal_swirl'].children_recursive if o.type == 'MESH']
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
        cam = build_items.icon_camera(joined, elevation=26, yaw=24, margin=1.12)
        bpy.ops.render.render(write_still=False)
        res = bpy.data.images['Render Result']
        dest = os.path.join(ICONS, out + '.webp')
        for qv in (88, 80, 72, 64):
            scene.render.image_settings.quality = qv
            res.save_render(dest, scene=scene)
            if os.path.getsize(dest) <= 16000:
                break
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.objects.remove(joined, do_unlink=True)
        print('ICON', node, os.path.getsize(dest))
    print('RESCUE_ICONS_OK')


if __name__ == '__main__':
    icons() if '--icons' in sys.argv else main()
