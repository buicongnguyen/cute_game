"""Chibi pet miniatures of the 17 regular bosses -> boss-pets.glb, manifest, preview, 256px icons.

Run: blender -b --factory-startup --python art/blender/kit/build_boss_pets.py            (model, manifest, preview)
     blender -b --factory-startup --python art/blender/kit/build_boss_pets.py -- --icons (webp icons from the glb)
Roots are 'pet_b_<key>' with child mesh 'pet_b_<key>_body' (+ 'pet_b_<key>_wing_l/_r' for flyers, origin at the
wing root, right wing on +X). Ground origin, faces -Y (glTF +Z), ~0.7 m tall, flat toon colours.
"""
import bpy, math, os, sys, json
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style
R = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(R, 'public', 'assets', 'models', 'boss-pets.glb')
ICONS = os.path.join(R, 'public', 'assets', 'icons', 'items')
KEYS = ['bear', 'treant', 'croc', 'mushking', 'cake', 'gingerbread', 'jellyqueen', 'yeti', 'mammoth', 'frostowl',
        'golem', 'dragon', 'robot', 'gorilla', 'leviathan', 'phoenix', 'shadowlord']
HEIGHT = .7
MAXW = .85
COLORS = {
    'bear': ('#8b5a3c', '#e8c8a0', '#ffd23f', '#5a3a28'),
    'treant': ('#8a5a3b', '#4fbf5a', '#2f8f45', '#e0a85a'),
    'croc': ('#4f9e5a', '#e9f0b0', '#ffd23f', '#2f7a42'),
    'mushking': ('#e95685', '#fff1dc', '#ffd23f', '#d03a6a'),
    'cake': ('#fff5fb', '#ff8ab8', '#ff3355', '#ffd23f'),
    'gingerbread': ('#c9783a', '#fff5e8', '#ff4f6a', '#4fbf5a'),
    'jellyqueen': ('#e75cad', '#ffc2e6', '#ffd23f', '#b03a86'),
    'yeti': ('#eef4ff', '#a8c8ff', '#8fb0e8', '#ffffff'),
    'mammoth': ('#8a5a3b', '#fff1cf', '#5e3a26', '#c89a6a'),
    'frostowl': ('#cee8ff', '#ffffff', '#ffb23a', '#8fb8f0'),
    'golem': ('#5a4a58', '#ff6a2b', '#3a2e3a', '#ffc23d'),
    'dragon': ('#e0443a', '#ffd27a', '#ffffff', '#a82a2a'),
    'robot': ('#81bfe6', '#f4f8ff', '#ff6a5a', '#4a7fa8'),
    'gorilla': ('#534c60', '#8a8098', '#e0c8a8', '#3a3446'),
    'leviathan': ('#557ebe', '#bfe4ff', '#3fd0c0', '#2f5a98'),
    'phoenix': ('#efa864', '#ffd23f', '#ff4f2b', '#fff0a0'),
    'shadowlord': ('#58476f', '#be91e6', '#2a2038', '#ffe14d'),
}


class B:
    def __init__(self, key):
        self.key = key
        self.mats = [style.mat('BossPet %s %d' % (key, i), c, rough=.4) for i, c in enumerate(COLORS[key])]
        self.ink = style.mat('BossPet eye', '#282238', rough=.2)
        self.white = style.mat('BossPet shine', '#fff8e2', rough=.22)
        self.glow = style.mat('BossPet glow', '#ffb23a', rough=.3, emit='#ffb23a', emit_strength=.8)
        self.parts = []
        self.wings = {}

    def m(self, c):
        return self.mats[c] if isinstance(c, int) else c

    def ball(self, p, s, c=0, sub=1, rot=(0, 0, 0), into=None):
        o = style.ico('p', 1, p, self.m(c), subdiv=sub, scale=s, rot=rot)
        (self.parts if into is None else into).append(o)
        return o

    def rod(self, a, b, r, c=0, r2=None):
        a, b = Vector(a), Vector(b)
        v = b - a
        o = style.cyl('r', r, v.length, (a + b) * .5, self.m(c), verts=8, bev=0, radius_top=r2 if r2 is not None else r)
        o.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
        self.parts.append(o)

    def eye(self, x, y, z, r=.12):
        self.ball((x, y, z), (r, r * .55, r), self.white)
        self.ball((x, y - r * .45, z), (r * .55, r * .25, r * .7), self.ink)
        self.ball((x - r * .2, y - r * .68, z + r * .28), (r * .17,) * 3, self.white)

    def eyes(self, y, z, dx=.26, r=.12):
        for s in (-1, 1):
            self.eye(s * dx, y, z, r)

    def pair(self, f):
        for s in (-1, 1):
            f(s)

    def wing(self, root, spec, c):
        """spec: right-wing balls as (offset from root, size, rot); the left wing is its mirror."""
        for side, nm in ((1, 'wing_r'), (-1, 'wing_l')):
            pcs = []
            for off, size, rot in spec:
                p = ((root[0] + off[0]) * side, root[1] + off[1], root[2] + off[2])
                self.ball(p, size, c, rot=(rot[0], rot[1] * side, rot[2] * side), into=pcs)
            self.wings[nm] = (pcs, (root[0] * side, root[1], root[2]))


def crown(b, y, z, w, h, c=2, n=5):
    for i in range(n):
        a = (i - (n - 1) / 2) * (w * 1.6 / n)
        b.rod((a, y, z), (a * 1.15, y, z + h + (i % 2) * h * .4), .09, c, .01)
    b.rod((-w * .8, y, z), (w * .8, y, z), .09, c)


def build(key):
    b = B(key)
    ball, rod, eye, eyes = b.ball, b.rod, b.eye, b.eyes
    ink = b.ink
    if key in ('bear', 'yeti', 'gorilla'):
        gor = key == 'gorilla'
        ball((0, 0, .75), (.95, .75, .8) if gor else (.8, .7, .75), 0)
        ball((0, -.3, .7), (.55, .4, .55), 3 if gor else 1)
        ball((0, -.1, 1.65), (.75, .68, .65), 0, sub=2)
        ball((0, -.65, 1.5), (.4, .3, .28), 2 if gor else 1)
        ball((0, -.9, 1.58), (.14, .1, .1), ink)
        eyes(-.72, 1.75, .27, .12)
        if key == 'bear':
            b.pair(lambda s: (ball((s * .55, 0, 2.2), (.25, .18, .25), 0), ball((s * .55, -.1, 2.2), (.13, .1, .13), 1)))
            crown(b, -.1, 2.3, .45, .35)
        if key == 'yeti':
            b.pair(lambda s: ball((s * .5, -.1, 2.15), (.22, .22, .25), 0))
            ball((0, -.55, 2.05), (.55, .3, .2), 1)
            for i in range(3):
                ball(((i - 1) * .3, -.3, 2.3), (.15, .15, .17), 0)
            b.pair(lambda s: rod((s * .3, -.78, 1.4), (s * .3, -.85, 1.2), .07, 3, .01))
        if gor:
            ball((0, -.1, 2.15), (.5, .5, .25), 0)
            eyes(-.72, 1.8, .22, .1)
        ex = .1 if gor else 0
        b.pair(lambda s: (rod((s * .8, 0, 1.2), (s * (.95 + ex), -.2, .35), .27, 0, .24),
                          ball((s * (1.0 + ex), -.25, .25), (.3, .3, .26), 1 if key == 'yeti' else 0),
                          ball((s * .38, -.15, .2), (.33, .45, .22), 0)))
    elif key == 'treant':
        rod((0, 0, .1), (0, 0, 1.5), .6, 0, .42)
        ball((0, -.35, 1.1), (.4, .15, .45), 3)
        eyes(-.5, 1.3, .22, .11)
        ball((0, -.5, .9), (.15, .1, .2), ink)
        b.pair(lambda s: (rod((s * .45, 0, 1.2), (s * 1.05, -.2, 1.7), .13, 0, .08), ball((s * 1.1, -.2, 1.8), (.28, .28, .28), 1)))
        b.pair(lambda s: ball((s * .35, .1, .12), (.4, .35, .14), 0))
        ball((0, 0, 2.2), (.95, .85, .65), 1, sub=2)
        for x, y, z, r in [(-.7, 0, 2.0, .45), (.7, 0, 2.0, .45), (0, .3, 2.6, .5), (-.3, -.3, 2.55, .38), (.35, -.35, 2.5, .36)]:
            ball((x, y, z), (r, r, r * .9), 2)
        ball((.45, -.55, 2.5), (.15, .15, .15), b.glow)
        ball((-.55, -.5, 2.2), (.14, .14, .14), b.glow)
    elif key == 'croc':
        ball((0, .1, .75), (.8, 1.2, .6), 0)
        ball((0, -.05, .55), (.62, 1.0, .38), 1)
        ball((0, -1.0, 1.0), (.62, .6, .5), 0, sub=2)
        ball((0, -1.55, .85), (.5, .55, .27), 0)
        ball((0, -1.5, .66), (.42, .45, .15), 1)
        for s in (-1, 1):
            for j in range(3):
                rod((s * .3, -1.3 - j * .2, .78), (s * .3, -1.3 - j * .2, .66), .05, 1, .005)
            eye(s * .3, -1.2, 1.4, .13)
            ball((s * .33, -1.75, 1.05), (.07, .07, .07), ink)
        for i in range(5):
            ball((0, -.5 + i * .4, 1.3 - i * .06), (.14, .2, .17), 3)
        for i in range(4):
            ball((0, 1.2 + i * .35, .75 - i * .1), (.4 - i * .07, .35, .3 - i * .05), 0)
        b.pair(lambda s: [ball((s * .65, y, .25), (.22, .3, .25), 0) for y in (-.5, .8)])
        crown(b, -.95, 1.55, .45, .3, n=3)
    elif key == 'mushking':
        rod((0, 0, .1), (0, 0, 1.2), .6, 1, .5)
        ball((0, 0, 1.3), (1.15, 1.1, .6), 0, sub=2)
        for x, y, z, r in [(-.5, -.5, 1.65, .16), (.45, -.45, 1.7, .18), (0, .1, 1.95, .2), (-.65, .2, 1.5, .14), (.7, .2, 1.45, .15)]:
            ball((x, y, z), (r, r, r * .5), 1)
        eyes(-.55, .85, .24, .12)
        ball((0, -.58, .6), (.2, .08, .12), ink)
        b.pair(lambda s: ball((s * .62, -.3, .85), (.25, .2, .18), 3))
        b.pair(lambda s: ball((s * .35, -.1, .12), (.32, .42, .15), 1))
        crown(b, -.1, 1.85, .45, .4)
    elif key == 'cake':
        rod((0, 0, .05), (0, 0, .75), 1.0, 0)
        ball((0, 0, .8), (1.0, 1.0, .12), 1)
        rod((0, 0, .8), (0, 0, 1.5), .75, 0)
        ball((0, 0, 1.52), (.78, .78, .13), 1)
        for i in range(8):
            a = i * math.tau / 8
            ball((math.sin(a) * .95, math.cos(a) * .95, .76), (.13, .13, .17), 1)
            ball((math.sin(a) * .72, math.cos(a) * .72, 1.46), (.1, .1, .15), 1)
        eyes(-.74, 1.1, .26, .11)
        ball((0, -.74, .9), (.18, .06, .1), ink)
        b.pair(lambda s: ball((s * .5, -.66, .95), (.14, .05, .1), 1))
        ball((0, 0, 1.75), (.18, .18, .2), 2)
        for i in range(4):
            a = i * math.tau / 4 + .5
            rod((math.sin(a) * .35, math.cos(a) * .35, 1.6), (math.sin(a) * .4, math.cos(a) * .4, 2.1), .06, 3, .03)
            ball((math.sin(a) * .4, math.cos(a) * .4, 2.15), (.05, .05, .08), b.glow)
    elif key == 'gingerbread':
        ball((0, 0, .95), (.75, .45, .85), 0, sub=2)
        ball((0, -.1, 1.95), (.85, .65, .75), 0, sub=2)
        b.pair(lambda s: (rod((s * .7, 0, 1.2), (s * 1.3, -.2, .9), .22, 0, .18), ball((s * 1.35, -.2, .85), (.25, .25, .25), 0),
                          rod((s * .35, 0, .3), (s * .4, -.1, .1), .27, 0, .24), ball((s * .4, -.2, .1), (.35, .4, .18), 0),
                          ball((s * 1.1, -.2, .98), (.17, .17, .1), 1), ball((s * .4, -.2, .35), (.28, .28, .09), 1)))
        eyes(-.62, 2.05, .27, .11)
        for i in range(7):
            a = (i - 3) * .22
            ball((math.sin(a * 2) * .38, -.68, 1.7 - abs(a) * .35), (.07, .06, .07), 1)
        for z, c in ((1.5, 2), (1.15, 3), (.8, 2)):
            ball((0, -.42, z), (.12, .08, .12), c)
        b.pair(lambda s: ball((s * .4, -.62, 1.8), (.15, .05, .1), 2))
        ball((-.2, -.45, 1.7), (.2, .12, .15), 2)
        ball((.2, -.45, 1.7), (.2, .12, .15), 2)
        ball((0, -.47, 1.7), (.08, .08, .08), 3)
    elif key == 'jellyqueen':
        ball((0, 0, .8), (1.0, 1.0, .85), 0, sub=2)
        ball((0, -.1, 1.0), (.75, .6, .6), 1)
        for i in range(6):
            a = i * math.tau / 6
            ball((math.sin(a) * .85, math.cos(a) * .85, .22), (.25, .25, .22), 0)
        eyes(-.88, .95, .3, .15)
        ball((0, -.95, .65), (.2, .08, .1), ink)
        b.pair(lambda s: ball((s * .62, -.78, .72), (.16, .06, .1), 1))
        ball((.3, -.7, 1.3), (.2, .2, .1), 1)
        crown(b, 0, 1.55, .55, .5)
        for i in range(3):
            ball((-.4 + i * .4, -.55 + (i % 2) * .5, 1.7), (.13, .13, .08), 1)
    elif key == 'mammoth':
        ball((0, 0, .85), (.95, 1.1, .75), 0)
        ball((0, -.95, 1.2), (.75, .65, .7), 0, sub=2)
        ball((0, -.2, 1.5), (.75, .55, .35), 0)
        ball((0, -.95, 1.85), (.4, .4, .3), 0)
        b.pair(lambda s: (ball((s * .85, -.95, 1.25), (.12, .55, .55), 0), ball((s * .9, -.95, 1.25), (.1, .38, .38), 1)))
        pts = [(0, -1.35, 1.1), (0, -1.7, .75), (0, -1.75, .4), (0, -1.55, .18)]
        for i in range(3):
            rod(pts[i], pts[i + 1], .24 - i * .04, 0, .2 - i * .04)
        ball(pts[3], (.17, .17, .17), 0)
        for s in (-1, 1):
            rod((s * .4, -1.45, .95), (s * .65, -1.85, .8), .13, 1, .09)
            rod((s * .65, -1.85, .8), (s * .75, -2.1, 1.15), .09, 1, .01)
            eye(s * .32, -1.55, 1.45, .1)
            for y in (-.6, .65):
                ball((s * .55, y, .28), (.3, .32, .3), 0)
                ball((s * .55, y - .15, .1), (.3, .3, .1), 3)
        ball((0, 1.1, .85), (.15, .15, .3), 0)
        rod((0, 1.1, .95), (0, 1.3, .35), .05, 0, .04)
        ball((0, 1.3, .3), (.12, .12, .1), 3)
    elif key == 'frostowl':
        ball((0, 0, .95), (.85, .75, .95), 0, sub=2)
        ball((0, -.45, .8), (.55, .35, .7), 1)
        ball((0, -.55, 1.5), (.9, .6, .62), 0, sub=2)
        for s in (-1, 1):
            ball((s * .38, -.95, 1.62), (.3, .12, .3), 1)
            ball((s * .38, -1.02, 1.62), (.2, .08, .22), b.white)
            ball((s * .38, -1.08, 1.62), (.1, .05, .13), ink)
            rod((s * .45, -.4, 2.05), (s * .65, -.4, 2.6), .17, 0, .02)
            ball((s * .3, -.45, .12), (.2, .3, .08), 2)
        ball((0, -1.15, 1.35), (.14, .2, .14), 2)
        for i in range(3):
            ball(((i - 1) * .22, -.85, .85), (.14, .08, .2), 3)
        ball((0, .6, .4), (.3, .5, .15), 3)
        b.wing((.7, 0, 1.1), [((.3, 0, 0), (.4, .22, .1), (0, 0, .2)), ((.65, 0, -.12), (.48, .22, .1), (0, 0, .5)), ((.9, 0, -.4), (.35, .2, .09), (0, 0, .9))], 3)
    elif key == 'golem':
        ball((0, 0, 1.0), (.95, .75, .85), 0, sub=2)
        ball((0, -.62, 1.05), (.45, .2, .45), b.glow)
        ball((0, -.1, 1.95), (.55, .5, .45), 0)
        eyes(-.55, 2.0, .2, .09)
        ball((0, -.5, 1.8), (.28, .1, .05), 3)
        b.pair(lambda s: (ball((s * 1.05, -.1, 1.35), (.42, .4, .38), 0), rod((s * 1.1, -.1, 1.2), (s * 1.3, -.25, .5), .3, 0, .36),
                          ball((s * 1.35, -.3, .35), (.42, .4, .38), 3), ball((s * .45, -.1, .28), (.4, .45, .3), 0)))
        for i in range(3):
            rod(((i - 1) * .35, .35, 1.6), ((i - 1) * .35, .5, 2.2 - (i % 2) * .2), .15, 3, .01)
        for x, z in [(-.7, .85), (.7, 1.4), (.55, .5)]:
            ball((x, -.6, z), (.14, .08, .06), b.glow)
    elif key == 'dragon':
        ball((0, .05, .8), (.8, .9, .75), 0, sub=2)
        ball((0, -.35, .75), (.55, .5, .6), 1)
        ball((0, -.35, 1.65), (.8, .7, .65), 0, sub=2)
        ball((0, -.95, 1.5), (.45, .4, .3), 0)
        ball((0, -.95, 1.38), (.4, .35, .15), 1)
        for s in (-1, 1):
            eye(s * .35, -.85, 1.85, .14)
            ball((s * .15, -1.3, 1.55), (.05, .05, .05), ink)
            rod((s * .4, -.25, 2.1), (s * .55, .1, 2.65), .14, 1, .01)
            ball((s * .55, -.1, .3), (.28, .35, .22), 0)
            ball((s * .55, -.3, .12), (.28, .3, .1), 1)
            ball((s * .55, .55, .3), (.28, .35, .22), 0)
        for i in range(4):
            ball((0, .7 + i * .4, .55 - i * .1), (.35 - i * .06, .35, .3 - i * .05), 0)
        ball((0, 1.9, .25), (.18, .2, .2), 3)
        for i in range(4):
            ball((0, -.05 + i * .35, 1.5 - i * .35 + (.1 if i else 0)), (.12, .15, .16), 1)
        b.wing((.45, .1, 1.15), [((.35, .2, .2), (.45, .22, .1), (0, 0, .3)), ((.8, .3, .3), (.55, .22, .1), (0, 0, .5)), ((1.1, .45, .1), (.4, .2, .09), (0, 0, .9))], 3)
    elif key == 'robot':
        ball((0, 0, .85), (.8, .6, .7), 0)
        ball((0, -.58, .9), (.38, .1, .3), 1)
        ball((0, -.62, .9), (.17, .08, .17), b.glow)
        ball((0, -.05, 1.95), (.9, .75, .65), 0, sub=2)
        ball((0, -.62, 1.95), (.7, .2, .45), 3)
        for s in (-1, 1):
            ball((s * .27, -.8, 1.98), (.17, .08, .17), 2)
            ball((s * .27, -.86, 1.98), (.08, .05, .08), b.white)
            rod((s * .85, -.05, 1.9), (s * 1.0, -.05, 1.9), .2, 1)
            rod((s * .85, -.05, 1.2), (s * 1.3, -.2, .8), .17, 1, .15)
            ball((s * 1.35, -.2, .72), (.25, .25, .22), 3)
            rod((s * .35, 0, .5), (s * .35, 0, .1), .2, 3, .22)
            ball((s * .35, -.15, .1), (.32, .42, .12), 3)
        rod((0, 0, 2.5), (.1, 0, 3.0), .05, 3)
        ball((.1, 0, 3.05), (.14, .14, .14), 2)
        ball((0, -.6, .55), (.5, .1, .1), 3)
    elif key == 'leviathan':
        for y, z, r in [(.9, .45, .5), (.45, .3, .55), (.05, .55, .6)]:
            ball((0, y, z), (r, r, r), 0)
        for i in range(5):
            ball((0, 1.2 + i * .35, .3 + (.15 if i % 2 else 0) + i * .08), (.4 - i * .06, .35, .35 - i * .05), 0)
        ball((0, -.5, 1.2), (.7, .65, .55), 0, sub=2)
        ball((0, -1.15, 1.05), (.5, .45, .3), 0)
        ball((0, -.7, .8), (.5, .45, .45), 1)
        for s in (-1, 1):
            eye(s * .33, -1.0, 1.45, .14)
            ball((s * .15, -1.5, 1.1), (.05, .05, .05), ink)
            ball((s * .75, -.5, 1.3), (.45, .08, .3), 2, rot=(0, 0, s * .6))
            ball((s * .7, .1, .6), (.4, .15, .22), 2)
            ball((s * .5, -.6, .25), (.3, .38, .22), 0)
            ball((s * .5, -.75, .1), (.3, .3, .1), 1)
        for i in range(5):
            dz = 0 if i < 3 else -.4
            rod((0, -.7 + i * .35, 1.5 - abs(i - 2) * .06 + dz), (0, -.7 + i * .35, 1.95 - abs(i - 1) * .1 + dz), .13, 2, .01)
        ball((0, -1.4, .98), (.2, .18, .08), b.glow)
        ball((0, 2.9, .85), (.45, .22, .5), 2)
    elif key == 'phoenix':
        ball((0, 0, .85), (.7, .75, .75), 0, sub=2)
        ball((0, -.35, .75), (.45, .3, .55), 1)
        ball((0, -.5, 1.65), (.65, .6, .6), 0, sub=2)
        for s in (-1, 1):
            eye(s * .3, -1.0, 1.75, .12)
            rod((s * .15, -.1, .3), (s * .15, -.2, .05), .06, 1)
            ball((s * .17, -.3, .06), (.15, .25, .06), 1)
        rod((0, -1.1, 1.58), (0, -1.5, 1.45), .18, 1, .02)
        ball((0, -1.15, 1.55), (.2, .15, .08), 1)
        for i in range(5):
            a = (i - 2) * .4
            rod((math.sin(a) * .2, -.45, 2.1), (math.sin(a) * .6, -.45, 2.7 + (2 - abs(i - 2)) * .12), .13, 2 if i % 2 else 1, .01)
        for i in range(5):
            a = (i - 2) * .38
            rod((math.sin(a) * .15, .6, .75), (math.sin(a) * 1.1, 1.7, .5 + (2 - abs(i - 2)) * .55), .17, [2, 1, 3, 1, 2][i], .01)
        b.wing((.5, 0, 1.0), [((.35, 0, .2), (.4, .2, .1), (0, 0, .3)), ((.8, 0, .3), (.55, .22, .1), (0, 0, .5)), ((1.15, 0, .1), (.45, .2, .09), (0, 0, .9))], 2)
    elif key == 'shadowlord':
        ball((0, .05, .9), (.95, .8, .95), 0, sub=2)
        rod((0, 0, .1), (0, 0, .5), .6, 2, .75)
        ball((0, -.1, 1.85), (.75, .65, .65), 2, sub=2)
        ball((0, -.45, 1.85), (.55, .3, .45), ink)
        for s in (-1, 1):
            ball((s * .25, -.72, 1.9), (.15, .07, .1), b.glow)
            ball((s * .25, -.78, 1.9), (.08, .05, .06), 3)
            rod((s * .35, -.1, 2.25), (s * .75, -.1, 2.9), .17, 1, .01)
            rod((s * .7, -.1, 1.2), (s * .95, -.35, .75), .2, 0, .17)
            ball((s * .95, -.4, .7), (.22, .22, .22), 1)
        ball((0, -.6, 1.2), (.22, .12, .18), 1)
        ball((0, -.65, 1.15), (.1, .06, .1), b.glow)
        crown(b, -.1, 2.35, .35, .3, n=3)
    return b


def empty(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


def stats(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def make(key):
    b = build(key)
    body = style.join(b.parts, 'pet_b_%s_body' % key)
    wings = {}
    for nm, (pcs, root) in b.wings.items():
        wings[nm] = (style.join(pcs, 'pet_b_%s_%s' % (key, nm)), root)
    allv = [Vector(v.co) for v in body.data.vertices]
    for w, _ in wings.values():
        allv += [Vector(v.co) for v in w.data.vertices]
    lo = [min(v[i] for v in allv) for i in range(3)]
    hi = [max(v[i] for v in allv) for i in range(3)]
    bl = [min(v.co[i] for v in body.data.vertices) for i in range(3)]
    bh = [max(v.co[i] for v in body.data.vertices) for i in range(3)]
    k = min(HEIGHT / (bh[2] - lo[2]), MAXW / max(hi[0] - lo[0], hi[1] - lo[1]))
    cx, cy, z0 = (bl[0] + bh[0]) / 2, (bl[1] + bh[1]) / 2, lo[2]
    for v in body.data.vertices:
        v.co = ((v.co.x - cx) * k, (v.co.y - cy) * k, (v.co.z - z0) * k)
    for w, root in wings.values():
        for v in w.data.vertices:
            v.co = ((v.co.x - root[0]) * k, (v.co.y - root[1]) * k, (v.co.z - root[2]) * k)
        w.location = ((root[0] - cx) * k, (root[1] - cy) * k, (root[2] - z0) * k)
    root = empty('pet_b_' + key)
    body.parent = root
    for w, _ in wings.values():
        w.parent = root
    return root, body, [w for w, _ in wings.values()]


def measure(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return [[round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)]]


def main():
    style.reset_scene()
    roots, manifest = [], {}
    for key in KEYS:
        root, body, wings = make(key)
        roots.append(root)
        tris = stats(body) + sum(stats(w) for w in wings)
        assert tris <= 2500, (key, tris)
        manifest[root.name] = {'triangles': tris, 'bounds': measure([body] + wings),
                               'nodes': [body.name] + [w.name for w in wings], 'flying': bool(wings)}
    objs = [o for r in roots for o in [r] + list(r.children_recursive)]
    size = style.export_glb(objs, OUT)
    assert size < 2000000, size
    p = os.path.join(R, 'art', 'generated', 'kit', 'boss-pets-manifest.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(json.dumps(manifest, indent=2))
    import build_creatures as pres
    pres.stage((1800, 1500), ground='#a2c785')
    for i, root in enumerate(roots):
        root.location = ((i % 6 - 2.5) * 10.5, (i // 6 - 1) * 10, 0)
        root.scale = (8,) * 3
    pres.camera(34, 18, (0, 0, 2), 66, distance=80)
    pp = os.path.join(R, 'art', 'previews', 'kit', 'boss-pets.webp')
    os.makedirs(os.path.dirname(pp), exist_ok=True)
    style.render(pp)
    print('BOSSPETS_OK', size, json.dumps({k: v['triangles'] for k, v in manifest.items()}))


def icons():
    import build_items
    style.reset_scene()
    bpy.ops.import_scene.gltf(filepath=OUT)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    style.studio(size=(256, 256), transparent=True)
    build_items._eevee(48)
    scene = bpy.context.scene
    scene.view_settings.exposure = -.15
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value = .6
    for o in bpy.data.objects:
        if o.type == 'LIGHT':
            o.data.angle = math.radians(22)
    os.makedirs(ICONS, exist_ok=True)
    for key in KEYS:
        iid = 'pet_b_' + key
        root = bpy.data.objects[iid]
        parts = [o for o in root.children_recursive if o.type == 'MESH']
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
        cam = build_items.icon_camera(joined, elevation=32, yaw=24, margin=1.14)
        bpy.ops.render.render(write_still=False)
        res = bpy.data.images['Render Result']
        dest = os.path.join(ICONS, iid + '.webp')
        for q in (88, 82, 76, 70, 64):
            scene.render.image_settings.quality = q
            res.save_render(dest, scene=scene)
            if os.path.getsize(dest) <= 30000:
                break
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.objects.remove(joined, do_unlink=True)
        print('ICON', iid, os.path.getsize(dest))
    print('BOSSPET_ICONS_OK')


if __name__ == '__main__':
    icons() if '--icons' in sys.argv else main()
