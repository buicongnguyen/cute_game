"""The Delvers' Vault kit -> public/assets/models/dungeon.glb, a manifest, a preview and 256px bag icons.

Run: blender -b --factory-startup --python art/blender/kit/build_dungeon.py              (model, manifest, preview)
     blender -b --factory-startup --python art/blender/kit/build_dungeon.py -- --icons  (webp icons from the glb)

One top-level node per piece, origin at its ground centre, front facing -Y (glTF +Z), metres:
  dg_floor, dg_wall, dg_portal       the round arena (radius 23, wall at 24-26) and its portal
  dg_dress_<stage>                   per-stage props around the rim (grotto, belfry, coral, forge, observatory)
  dg_lobby, dg_keeper                the glowing circle by the south gate and Vault Keeper Wren
  dg_<creature>                      10 vault creatures, true size (0.7-1.3 m)
  dg_<guardian>                      5 guardians, true size (3.4-4.6 m); the game undoes its boss scale
  pet_dg_<guardian>                  5 companions, ~0.7 m
  item_dg_seal                       the Rune Seal (icon only)
Runtime recolours by material name: 'Vault floor', 'Vault inlay', 'Vault glow', 'Vault stone' (per stage).
Everything is original: shapes, colours and names are this project's own.
"""
import bpy, math, os, sys, json
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style
R = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(R, 'public', 'assets', 'models', 'dungeon.glb')
ICONS = os.path.join(R, 'public', 'assets', 'icons', 'items')
TAU = math.tau
INK = '#2a2236'


class P:
    """A part list with toy primitives; materials are cached by colour."""
    def __init__(self, tag):
        self.tag, self.parts, self.cache = tag, [], {}

    def m(self, c, glow=0.0, name=None):
        if not isinstance(c, str):
            return c
        key = name or 'DG %s %s%s' % (self.tag, c, ' glow' if glow else '')
        if key not in self.cache:
            self.cache[key] = style.mat(key, c, rough=.45, emit=c if glow else None, emit_strength=glow)
        return self.cache[key]

    def ball(self, p, s, c, sub=1, rot=(0, 0, 0), glow=0.0):
        s = s if isinstance(s, (tuple, list)) else (s, s, s)
        o = style.ico('b', 1, p, self.m(c, glow), subdiv=sub, scale=s, rot=rot)
        self.parts.append(o)
        return o

    def rod(self, a, b, r, c, r2=None, verts=8, glow=0.0):
        a, b = Vector(a), Vector(b)
        v = b - a
        o = style.cyl('r', r, v.length, (a + b) * .5, self.m(c, glow), verts=verts, bev=0, radius_top=r2 if r2 is not None else r)
        o.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
        self.parts.append(o)
        return o

    def cyl(self, p, r, h, c, r2=None, verts=12, glow=0.0, bev=0.0):
        o = style.cyl('c', r, h, (p[0], p[1], p[2] + h / 2), self.m(c, glow), verts=verts, bev=bev, radius_top=r2)
        self.parts.append(o)
        return o

    def cone(self, p, r, h, c, rot=(0, 0, 0), verts=8, glow=0.0):
        o = style.cone('k', r, h, p, self.m(c, glow), verts=verts, rot=rot)
        self.parts.append(o)
        return o

    def box(self, p, size, c, rot=(0, 0, 0), bev=.03, glow=0.0):
        o = style.box('x', size, p, self.m(c, glow), bev=bev, seg=1, rot=rot)
        self.parts.append(o)
        return o

    def torus(self, p, R_, r, c, rot=(0, 0, 0), segs=24, minor=6, glow=0.0):
        o = style.torus('t', R_, r, p, self.m(c, glow), major_segs=segs, minor_segs=minor, rot=rot)
        self.parts.append(o)
        return o

    def eye(self, x, y, z, r=.1, look=0.0):
        self.ball((x, y, z), (r, r * .6, r * 1.1), '#fffaf0')
        self.ball((x + look * r * .2, y - r * .5, z - r * .05), (r * .62, r * .3, r * .72), INK)
        self.ball((x - r * .22, y - r * .78, z + r * .3), (r * .2,) * 3, '#ffffff')

    def eyes(self, y, z, dx, r=.1):
        for s in (-1, 1):
            self.eye(s * dx, y, z, r)

    def cheeks(self, y, z, dx, r=.07, c='#ff8fb0'):
        for s in (-1, 1):
            self.ball((s * dx, y, z), (r, r * .4, r * .7), c)

    def smile(self, y, z, w=.08):
        self.torus((0, y, z), w, w * .22, INK, rot=(math.radians(90), 0, 0), segs=12, minor=4)


# ------------------------------------------------------------------ creatures
def gnat(p):  # Lantern Gnat: a round little flyer with a glowing lantern belly
    p.ball((0, .08, .42), (.3, .34, .28), '#ffd86b', sub=2)
    p.ball((0, .38, .36), (.22, .26, .22), '#7fe7ff', sub=2, glow=1.4)
    p.ball((0, -.22, .52), .2, '#ffe9a8', sub=2)
    p.eyes(-.37, .56, .09, .075)
    for s in (-1, 1):
        p.ball((s * .3, .08, .66), (.3, .07, .14), '#dff8ff', rot=(0, math.radians(s * 25), 0))
        p.rod((s * .06, -.3, .68), (s * .16, -.42, .9), .018, '#5a3a28')
        p.ball((s * .16, -.42, .92), .045, '#7fe7ff', glow=1)


def truffle(p):  # Truffle Beetle: a shiny beetle that carries a truffle mushroom on its back
    p.ball((0, 0, .35), (.45, .6, .3), '#5a3a28', sub=2)
    p.ball((0, -.62, .34), (.26, .22, .2), '#3e2a20', sub=2)
    p.eyes(-.8, .4, .11, .07)
    p.cone((0, -.86, .44), .06, .22, '#ffcf6b', rot=(math.radians(-70), 0, 0))
    p.cyl((0, .05, .55), .14, .22, '#fff1d6')
    p.ball((0, .05, .82), (.38, .38, .22), '#8a5a3c', sub=2)
    for i in range(5):
        a = i * TAU / 5
        p.ball((math.cos(a) * .2, .05 + math.sin(a) * .2, .95), .05, '#ffcf6b')
    for s in (-1, 1):
        for k in (-1, 0, 1):
            p.rod((s * .35, k * .3, .25), (s * .55, k * .36, .02), .04, '#2e1e18')


def tintoad(p):  # Tin Toad: a riveted tin-plate toad
    p.ball((0, .05, .38), (.45, .45, .36), '#9fb8c9', sub=2)
    p.ball((0, -.2, .62), (.35, .3, .25), '#b9cfdc', sub=2)
    for s in (-1, 1):
        p.ball((s * .2, -.28, .86), .12, '#9fb8c9')
        p.eye(s * .2, -.36, .88, .085)
        p.ball((s * .38, -.18, .12), (.16, .22, .08), '#7f97a8')
        p.ball((s * .4, .3, .14), (.18, .26, .1), '#7f97a8')
    p.torus((0, -.48, .52), .14, .025, INK, rot=(math.radians(90), 0, 0), segs=12, minor=4)
    for i in range(6):
        a = i * TAU / 6
        p.ball((math.cos(a) * .42, .05 + math.sin(a) * .42, .44), .04, '#ffd23f')


def waxwisp(p):  # Wax Wisp: a candle stub with a friendly blue flame for a head
    p.cyl((0, 0, .1), .22, .55, '#fff1d6', verts=12)
    for i in range(4):
        a = i * TAU / 4 + .4
        p.ball((math.cos(a) * .2, math.sin(a) * .2, .5 - i * .08), (.06, .06, .12), '#fff8ea')
    p.ball((0, 0, .9), (.28, .28, .36), '#7a8cff', sub=2, glow=1.2)
    p.cone((0, 0, 1.3), .18, .4, '#b7c2ff', glow=1.2)
    p.eyes(-.24, .9, .1, .07)
    p.cyl((0, 0, 0), .32, .1, '#d9b88a', verts=12)


def urchin(p):  # Puff Urchin: a pink puff with soft yellow spikes
    p.ball((0, 0, .45), .42, '#ff8ab3', sub=2)
    for i in range(14):
        a = i * 2.39996
        z = .45 + .38 * math.cos(i * 1.3)
        rr = math.sqrt(max(0.0, .42 ** 2 - (z - .45) ** 2)) + .02
        v = Vector((math.cos(a) * rr, math.sin(a) * rr, z - .45)).normalized()
        if v.y < -.6:
            continue
        p.cone((v.x * .46, v.y * .46, .45 + v.z * .46), .07, .28, '#ffe36b', rot=v.to_track_quat('Z', 'Y').to_euler())
    p.eyes(-.38, .52, .13, .08)
    p.cheeks(-.38, .4, .22)
    p.smile(-.41, .38, .06)


def shrimp(p):  # Squirt Shrimp: a curled orange shrimp with stalk eyes
    for i in range(5):
        a = i * .55
        p.ball((0, .05 + math.sin(a) * .35, .3 + math.cos(a) * .22), (.24 - i * .025,) * 3, '#ff9a5a' if i % 2 == 0 else '#ffb27a')
    p.ball((0, -.25, .55), (.26, .3, .26), '#ff9a5a', sub=2)
    for s in (-1, 1):
        p.rod((s * .1, -.35, .7), (s * .18, -.4, .95), .03, '#ff9a5a')
        p.eye(s * .18, -.42, .98, .08)
        p.rod((s * .08, -.5, .55), (s * .3, -.85, .7), .015, '#fff1cf')
    p.cone((0, .45, .08), .18, .2, '#fff1cf', rot=(math.radians(-60), 0, 0))
    p.cyl((0, -.55, .45), .06, .12, '#ffb27a')


def imp(p):  # Cinder Imp: a cheeky ember imp with a glowing belly
    p.ball((0, 0, .4), (.3, .26, .34), '#ff6a3a', sub=2)
    p.ball((0, -.08, .36), (.2, .2, .22), '#ffd23f', sub=1, glow=1.2)
    p.ball((0, 0, .85), .3, '#ff6a3a', sub=2)
    p.eyes(-.25, .9, .11, .085)
    p.smile(-.28, .78, .06)
    for s in (-1, 1):
        p.cone((s * .17, 0, 1.12), .07, .22, '#4a2a2a', rot=(0, math.radians(s * 20), 0))
        p.rod((s * .26, 0, .5), (s * .42, -.1, .3), .06, '#ff6a3a')
        p.rod((s * .12, 0, .2), (s * .14, 0, 0), .07, '#c94a2a')
    p.rod((0, .2, .3), (0, .45, .5), .04, '#c94a2a')
    p.cone((0, .47, .55), .07, .14, '#ffd23f', rot=(math.radians(-30), 0, 0), glow=1)


def bellowbug(p):  # Bellows Beetle: an accordion-bodied beetle that puffs embers
    for i in range(4):
        p.cyl((0, .25 - i * .02, .2 + i * .14), .42 - i * .05, .1, '#5a4a58' if i % 2 else '#7a6a78', verts=12)
    p.ball((0, -.42, .42), (.25, .2, .22), '#5a4a58', sub=2)
    p.eyes(-.58, .5, .1, .07)
    p.rod((0, -.6, .38), (0, -.85, .36), .07, '#ff9a3a', r2=.1, glow=.6)
    for s in (-1, 1):
        for k in (-1, 1):
            p.rod((s * .3, k * .2 + .1, .2), (s * .5, k * .28 + .1, 0), .04, '#3a2e3a')


def comet(p):  # Comet Sprite: a star with a soft trailing tail
    for i in range(5):
        a = i * TAU / 5 + math.pi / 2
        v = Vector((math.cos(a), 0, math.sin(a)))
        p.cone((v.x * .3, -.02, .5 + v.z * .3), .13, .28, '#fff6a8', rot=v.to_track_quat('Z', 'Y').to_euler())
    p.ball((0, 0, .5), (.26, .2, .26), '#fff6a8', sub=2, glow=.8)
    p.eyes(-.18, .54, .09, .065)
    p.cheeks(-.19, .44, .15, .05)
    p.cone((0, .45, .5), .2, .7, '#9fd8ff', rot=(math.radians(-90), 0, 0), glow=.9)


def moonhare(p):  # Moon Hare Guard: a lavender hare in a crescent helmet with a little spear
    p.ball((0, 0, .45), (.3, .26, .36), '#e8e4ff', sub=2)
    p.ball((0, -.04, .95), .3, '#e8e4ff', sub=2)
    p.eyes(-.26, 1.0, .11, .08)
    p.cheeks(-.27, .9, .17)
    for s in (-1, 1):
        p.ball((s * .12, .02, 1.42), (.08, .06, .3), '#e8e4ff')
        p.ball((s * .12, -.02, 1.42), (.05, .03, .22), '#ffc2dd')
        p.rod((s * .14, 0, .1), (s * .15, -.05, 0), .09, '#d6d0f5')
    p.torus((0, 0, 1.12), .27, .05, '#b48cff', segs=16, minor=5)
    p.box((0, -.2, 1.25), (.08, .06, .16), '#ffd23f')
    p.rod((.34, -.15, .1), (.36, -.2, 1.3), .025, '#8a6a4a')
    p.cone((.36, -.2, 1.38), .06, .18, '#cfd7ff')


# ------------------------------------------------------------------ guardians
def morel(p, k=1.0):  # Mother Morel: a grand honeycomb mushroom with a kind, sleepy face
    p.cyl((0, 0, 0), .95 * k, 1.9 * k, '#fff1d6', r2=.75 * k, verts=16)
    p.ball((0, 0, 2.55 * k), (1.15 * k, 1.15 * k, 1.35 * k), '#e8734a', sub=2)
    for i in range(18):
        a = i * 2.39996
        z = 2.55 + 1.1 * math.cos(i * .9)
        rr = 1.12 * math.sqrt(max(0.0, 1 - ((z - 2.55) / 1.35) ** 2))
        p.ball((math.cos(a) * rr * k, math.sin(a) * rr * k, z * k), .2 * k, '#b4502e')
    for i in range(6):
        a = i * TAU / 6
        p.ball((math.cos(a) * 1.2 * k, math.sin(a) * 1.2 * k, 1.95 * k), .1 * k, '#7fe7ff', glow=1.5)
    p.eyes(-.86 * k, 1.35 * k, .3 * k, .17 * k)
    p.cheeks(-.88 * k, 1.12 * k, .48 * k, .11 * k)
    p.smile(-.9 * k, 1.05 * k, .12 * k)
    for s in (-1, 1):
        p.rod((s * .8 * k, -.1 * k, 1.2 * k), (s * 1.3 * k, -.3 * k, .7 * k), .14 * k, '#fff1d6')
        p.ball((s * 1.32 * k, -.32 * k, .66 * k), .18 * k, '#fff1d6')
    p.torus((0, 0, 1.9 * k), .82 * k, .09 * k, '#ffe9a8', segs=20, minor=5)


def owl(p, k=1.0):  # Bellwarden Owl: a round tower owl with a golden bell on its chest
    p.ball((0, 0, 1.75 * k), (1.35 * k, 1.2 * k, 1.75 * k), '#6a5a8f', sub=2)
    p.ball((0, -.55 * k, 1.5 * k), (.95 * k, .7 * k, 1.1 * k), '#e9dcff', sub=2)
    for s in (-1, 1):
        p.ball((s * .5 * k, -.95 * k, 2.6 * k), .42 * k, '#fff6dc', sub=2)
        p.eye(s * .5 * k, -1.2 * k, 2.6 * k, .3 * k)
        p.cone((s * .75 * k, -.1 * k, 3.45 * k), .26 * k, .7 * k, '#4e4070', rot=(0, math.radians(s * 22), 0))
        p.ball((s * 1.3 * k, .05 * k, 1.6 * k), (.35 * k, .7 * k, 1.05 * k), '#55477a', rot=(0, math.radians(s * 12), 0))
        p.rod((s * .35 * k, -.3 * k, .25 * k), (s * .4 * k, -.5 * k, 0), .1 * k, '#ffb23a')
    p.cone((0, -1.3 * k, 2.3 * k), .14 * k, .32 * k, '#ffb23a', rot=(math.radians(100), 0, 0))
    p.cyl((0, -1.05 * k, .75 * k), .45 * k, .65 * k, '#ffd23f', r2=.18 * k, verts=14, glow=.35)
    p.ball((0, -1.05 * k, .72 * k), .12 * k, '#b4892a')
    p.rod((0, -1.0 * k, 1.4 * k), (0, -1.05 * k, 1.75 * k), .04 * k, '#b4892a')
    p.torus((0, 0, 3.25 * k), .5 * k, .08 * k, '#ffd23f', segs=16, minor=5)


def anemone(p, k=1.0):  # Queen Anemone: a coral-pink column crowned with swaying tentacles
    p.cyl((0, 0, 0), 1.15 * k, .5 * k, '#c94a7a', r2=1.0 * k, verts=16)
    p.cyl((0, 0, .5 * k), 1.0 * k, 2.2 * k, '#ff5fa2', r2=.85 * k, verts=16)
    for i in range(14):
        a = i * TAU / 14
        bx, by = math.cos(a) * .82 * k, math.sin(a) * .82 * k
        tip = (math.cos(a) * 1.55 * k, math.sin(a) * 1.55 * k, 3.6 * k + .25 * math.sin(i * 2.1) * k)
        p.rod((bx, by, 2.65 * k), tip, .16 * k, '#ff8ac0', r2=.09 * k)
        p.ball(tip, .14 * k, '#7fe0ff', glow=1.2)
    p.ball((0, 0, 2.75 * k), (.85 * k, .85 * k, .35 * k), '#ffb3d4', sub=2)
    p.eyes(-.88 * k, 1.75 * k, .32 * k, .2 * k)
    p.cheeks(-.88 * k, 1.45 * k, .55 * k, .12 * k)
    p.smile(-.92 * k, 1.38 * k, .13 * k)
    for i in range(5):
        a = math.radians(-90 + (i - 2) * 22)
        p.cone((math.cos(a) * .55 * k, math.sin(a) * .55 * k, 3.05 * k), .1 * k, .45 * k, '#ffd23f')


def bellows(p, k=1.0):  # Old Bellows: a stout forge golem with a furnace heart and a hammer fist
    p.box((0, 0, 1.55 * k), (2.2 * k, 1.6 * k, 1.9 * k), '#6b5d6e', bev=.12 * k)
    p.box((0, 0, 2.65 * k), (2.6 * k, 1.8 * k, .45 * k), '#4e4352', bev=.08 * k)
    p.box((0, -.78 * k, 1.5 * k), (1.0 * k, .1 * k, .8 * k), '#2e2630', bev=.04 * k)
    p.box((0, -.8 * k, 1.48 * k), (.8 * k, .1 * k, .6 * k), '#ff8a2b', bev=.03 * k, glow=1.6)
    p.ball((0, -.35 * k, 3.2 * k), (.7 * k, .55 * k, .5 * k), '#7a6c7e', sub=2)
    for s in (-1, 1):
        p.ball((s * .28 * k, -.8 * k, 3.25 * k), .13 * k, '#ffd23f', glow=1.2)
        p.rod((s * .6 * k, 0, .6 * k), (s * .65 * k, 0, 0), .32 * k, '#4e4352')
        p.ball((s * 1.45 * k, 0, 2.3 * k), .42 * k, '#4e4352')
    p.rod((-1.5 * k, 0, 2.1 * k), (-1.65 * k, -.2 * k, 1.0 * k), .26 * k, '#6b5d6e')
    p.ball((-1.66 * k, -.22 * k, .9 * k), .36 * k, '#5a4d5e')
    p.rod((1.5 * k, 0, 2.1 * k), (1.75 * k, -.5 * k, 1.3 * k), .24 * k, '#6b5d6e')
    p.rod((1.75 * k, -.5 * k, 1.3 * k), (1.8 * k, -.6 * k, 2.6 * k), .08 * k, '#8a5a3c')
    p.box((1.8 * k, -.6 * k, 2.8 * k), (.9 * k, .55 * k, .5 * k), '#3a3440', bev=.06 * k)
    p.cyl((.55 * k, .65 * k, 2.8 * k), .2 * k, 1.1 * k, '#3a3440', verts=10)
    p.ball((.55 * k, .65 * k, 4.05 * k), .22 * k, '#ffb23a', glow=1.2)


def empress(p, k=1.0):  # Moon Moth Empress: a fluffy moth queen with crescent-patterned wings
    p.ball((0, .1 * k, 1.6 * k), (.75 * k, .85 * k, 1.3 * k), '#cfd7ff', sub=2)
    p.ball((0, -.1 * k, 2.95 * k), (.9 * k, .8 * k, .78 * k), '#f4f6ff', sub=2)
    p.torus((0, -.05 * k, 2.35 * k), .62 * k, .22 * k, '#ffffff', segs=16, minor=6)
    p.eyes(-.72 * k, 3.0 * k, .36 * k, .24 * k)
    p.cheeks(-.74 * k, 2.72 * k, .55 * k, .12 * k)
    for s in (-1, 1):
        p.ball((s * 1.75 * k, .35 * k, 2.6 * k), (1.55 * k, .1 * k, 1.25 * k), '#a9b8ff', rot=(0, math.radians(s * -18), math.radians(s * 12)))
        p.ball((s * 1.95 * k, .3 * k, 2.75 * k), (.55 * k, .12 * k, .55 * k), '#8fe6ff', glow=.8)
        p.ball((s * 1.45 * k, .4 * k, 1.25 * k), (1.0 * k, .09 * k, .8 * k), '#c4b0ff', rot=(0, math.radians(s * 20), 0))
        p.rod((s * .25 * k, -.4 * k, 3.6 * k), (s * .75 * k, -.7 * k, 4.4 * k), .05 * k, '#6a5a8f')
        for j in range(3):
            p.ball((s * (.4 + j * .14) * k, -(.5 + j * .08) * k, (3.85 + j * .2) * k), (.16 * k, .04 * k, .08 * k), '#e9dcff')
        p.rod((s * .3 * k, .1 * k, .4 * k), (s * .35 * k, 0, 0), .12 * k, '#b0b8e8')
    p.cone((0, -.2 * k, 3.75 * k), .28 * k, .4 * k, '#ffd23f', verts=6)
    p.torus((.0, -.25 * k, 4.2 * k), .16 * k, .05 * k, '#fff6a8', rot=(math.radians(90), 0, 0), segs=12, minor=4, glow=1.2)


CREATURES = [('dg_gnat', gnat), ('dg_truffle', truffle), ('dg_tintoad', tintoad), ('dg_waxwisp', waxwisp), ('dg_urchin', urchin),
             ('dg_shrimp', shrimp), ('dg_imp', imp), ('dg_bellowbug', bellowbug), ('dg_comet', comet), ('dg_moonhare', moonhare)]
GUARDIANS = [('dg_morel', morel), ('dg_owl', owl), ('dg_anemone', anemone), ('dg_bellows', bellows), ('dg_empress', empress)]
PETS = {'dg_morel': 'pet_dg_morel', 'dg_owl': 'pet_dg_owl', 'dg_anemone': 'pet_dg_anemone', 'dg_bellows': 'pet_dg_bellows', 'dg_empress': 'pet_dg_empress'}


# ------------------------------------------------------------------ arena
def floor():
    p = P('floor')
    stone, inlay, glow = style.mat('Vault floor', '#3f7f86', rough=.8), style.mat('Vault inlay', '#59a8b0', rough=.6), style.mat('Vault glow', '#7fe7ff', rough=.3, emit='#7fe7ff', emit_strength=.55)
    tile = style.mat('Vault tile', '#356c72', rough=.85)
    o = style.cyl('f', 26.5, .5, (0, 0, -.25), stone, verts=48, bev=0)
    p.parts.append(o)
    for r in (5.5, 13.5, 21.5):
        p.torus((0, 0, .01), r, .1, glow if r == 13.5 else inlay, segs=48, minor=4)
    # Flagstones: a few slightly darker slabs scattered over the floor, so it reads as worn stone, not paint.
    import random
    rnd = random.Random(7)
    for i in range(110):
        a, d = rnd.random() * TAU, 3.2 + math.sqrt(rnd.random()) * 20.5
        if abs(d - 13.5) < .7 or abs(d - 5.5) < .7 or abs(d - 21.5) < .7:
            continue
        w = .7 + rnd.random() * .7
        p.box((math.cos(a) * d, math.sin(a) * d, .0), (w, w * (.7 + rnd.random() * .5), .05), tile, rot=(0, 0, rnd.random() * 3), bev=0)
    for i in range(8):
        a = i * TAU / 8
        p.box((math.cos(a) * 9.5, math.sin(a) * 9.5, .0), (8, .22, .06), inlay, rot=(0, 0, a), bev=0)
        p.box((math.cos(a + TAU / 16) * 17.5, math.sin(a + TAU / 16) * 17.5, .01), (.9, .9, .06), glow, rot=(0, 0, a + .785), bev=0)
    p.cyl((0, 0, -.02), 2.8, .06, inlay, verts=24)
    return p.parts


def wall():
    p = P('wall')
    stone, dark, glow = style.mat('Vault stone', '#6b6a86', rough=.85), style.mat('Vault stone dark', '#45445c', rough=.9), style.mat('Vault glow', '#7fe7ff')
    for i in range(24):
        a = i * TAU / 24
        x, y = math.cos(a) * 25.2, math.sin(a) * 25.2
        p.box((x, y, 1.6), (1.1, 1.1, 3.2), stone, rot=(0, 0, a), bev=.08)
        p.box((x, y, 3.3), (1.4, 1.4, .3), dark, rot=(0, 0, a), bev=.05)
        p.ball((x, y, 3.65), .26, glow, sub=1)
        b = a + TAU / 48
        p.box((math.cos(b) * 25.3, math.sin(b) * 25.3, .7), (5.6, .8, 1.4), dark, rot=(0, 0, b + math.pi / 2), bev=.06)
    return p.parts


def portal():
    p = P('portal')
    stone, glow = style.mat('Vault stone', '#6b6a86'), style.mat('Portal glow', '#b48cff', rough=.2, emit='#b48cff', emit_strength=2.2)
    p.cyl((0, 0, 0), 2.1, .25, stone, verts=20)
    p.torus((0, 0, 2.15), 1.75, .26, stone, rot=(math.radians(90), 0, 0), segs=28, minor=6)
    p.ball((0, 0, 2.15), (1.55, .08, 1.55), glow, sub=2)
    for s in (-1, 1):
        p.box((s * 1.9, 0, .9), (.5, .5, 1.8), stone, bev=.06)
        p.ball((s * 1.9, 0, 1.95), .2, glow)
    p.ball((0, 0, 4.0), .22, glow)
    return p.parts


def lobby():
    p = P('lobby')
    stone, glow = style.mat('Lobby stone', '#a99fc6', rough=.8), style.mat('Lobby glow', '#9be7ff', rough=.3, emit='#9be7ff', emit_strength=1.4)
    p.torus((0, 0, .03), 4.2, .12, glow, segs=48, minor=4)
    p.torus((0, 0, .02), 3.3, .06, glow, segs=40, minor=3)
    for i in range(6):
        a = i * TAU / 6
        x, y = math.cos(a) * 4.6, math.sin(a) * 4.6
        p.box((x, y, .45), (.42, .3, .9), stone, rot=(0, 0, a), bev=.06)
        p.ball((x, y, .98), .1, glow)
    for i in range(12):
        a = i * TAU / 12 + .26
        p.box((math.cos(a) * 3.75, math.sin(a) * 3.75, .02), (.35, .12, .04), glow, rot=(0, 0, a + math.pi / 2), bev=0)
    return p.parts


def keeper():  # Vault Keeper Wren: a small, round old explorer in a big hat with a lantern
    p = P('keeper')
    p.cyl((0, 0, 0), .5, 1.0, '#5a6fb0', r2=.32, verts=14)
    p.ball((0, 0, 1.15), .3, '#ffd9b8', sub=2)
    p.eyes(-.25, 1.18, .1, .06)
    p.cheeks(-.27, 1.08, .17, .05)
    p.ball((0, .05, 1.0), (.26, .22, .14), '#f4f0ea')
    p.cyl((0, 0, 1.33), .55, .06, '#7a4a8a', verts=16)
    p.cyl((0, 0, 1.38), .26, .45, '#7a4a8a', r2=.08, verts=12)
    p.ball((.0, .1, 1.82), .07, '#ffd23f', glow=1)
    p.rod((.42, -.1, .4), (.5, -.15, 1.55), .035, '#8a5a3c')
    p.cyl((.5, -.15, 1.55), .12, .22, '#ffd23f', verts=8, glow=1.5)
    p.ball((-.42, -.05, .75), .1, '#ffd9b8')
    p.ball((.38, -.1, .8), .1, '#ffd9b8')
    p.box((-.3, .3, .55), (.3, .2, .4), '#c77a3a', bev=.04)
    return p.parts


def dressing(stage):
    """Props around the rim for one room, inside the wall (radius 19-22.5), clear of the portal."""
    p = P('dress ' + stage)
    spots = [(i * TAU / 14 + .2, 20.2 + (i % 3) * .9) for i in range(14)]
    for i, (a, r) in enumerate(spots):
        x, y = math.cos(a) * r, math.sin(a) * r
        if stage == 'grotto':
            h = .7 + (i % 3) * .45
            p.cyl((x, y, 0), .12 + h * .05, h, '#fff1d6', verts=8)
            p.ball((x, y, h), (.5 + h * .18, .5 + h * .18, .32 + h * .12), ['#7fe7ff', '#b48cff', '#ffd86b'][i % 3], sub=2, glow=.35)
            p.ball((x, y, h + .2 + h * .05), (.12, .12, .08), '#ffffff', glow=.6)
        elif stage == 'belfry':
            p.box((x, y, 1.0), (.25, .25, 2.0), '#8a6a4a', bev=.03)
            p.box((x, y, 2.05), (1.0, .25, .2), '#8a6a4a', rot=(0, 0, a), bev=.03)
            p.cyl((x, y, 1.25), .35, .6, '#ffd23f', r2=.14, verts=12, glow=.25)
        elif stage == 'coral':
            for j in range(3):
                b = a + j * 2.1
                p.rod((x, y, 0), (x + math.cos(b) * .5, y + math.sin(b) * .5, 1.0 + j * .35), .12, ['#ff7ab8', '#ff9a5a', '#7fe0ff'][(i + j) % 3], r2=.07)
            p.ball((x, y, .2), (.6, .6, .25), '#e8d6b0')
        elif stage == 'forge':
            if i % 2:
                p.box((x, y, .3), (.9, .5, .6), '#3a3440', rot=(0, 0, a), bev=.05)
                p.box((x, y, .7), (1.2, .55, .2), '#4e4352', rot=(0, 0, a), bev=.04)
            else:
                p.cyl((x, y, 0), .45, .8, '#4e4352', r2=.55, verts=10)
                p.ball((x, y, .9), (.4, .4, .3), '#ff8a2b', sub=2, glow=.9)
        else:
            if i % 2:
                p.cyl((x, y, 0), .3, .5, '#4a4f80', verts=10)
                p.rod((x, y, .5), (x + math.cos(a) * .9, y + math.sin(a) * .9, 2.0), .14, '#cfd7ff', r2=.2)
            else:
                p.ball((x, y, .9), (.3, .3, .7), '#b48cff', sub=2, glow=.45)
                p.cone((x, y, 1.6), .18, .5, '#fff6a8', glow=.6)
    return p.parts


def seal():
    p = P('seal')
    p.cyl((0, 0, 0), .5, .18, '#d8a24a', verts=20, bev=.03)
    p.torus((0, 0, .18), .4, .05, '#fff1b0', segs=20, minor=4)
    p.cone((0, 0, .26), .18, .16, '#9b6bff', verts=6, glow=.6)
    p.cyl((0, 0, .18), .12, .55, '#8a5a3c', verts=10)
    p.ball((0, 0, .8), .18, '#d8a24a')
    return p.parts


# ------------------------------------------------------------------ build
def empty(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


def measure(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return [[round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)]]


def finish(name, parts, budget, fit=None):
    """Joins parts into '<name>_body' under an empty '<name>'; optional fit=(height) rescales to that height."""
    body = style.join(parts, name + '_body')
    if fit:
        zs = [v.co.z for v in body.data.vertices]
        k = fit / (max(zs) - min(zs))
        z0 = min(zs)
        for v in body.data.vertices:
            v.co = (v.co.x * k, v.co.y * k, (v.co.z - z0) * k)
    tris = style.triangles(body)
    assert tris <= budget, (name, tris, budget)
    root = empty(name)
    body.parent = root
    return root, body, tris


def main():
    style.reset_scene()
    roots, manifest = [], {}

    def add(name, parts, budget, fit=None):
        root, body, tris = finish(name, parts, budget, fit)
        roots.append(root)
        manifest[name] = {'triangles': tris, 'bounds': measure([body])}
        return root
    add('dg_floor', floor(), 4000)
    add('dg_wall', wall(), 7000)
    add('dg_portal', portal(), 2500)
    add('dg_lobby', lobby(), 2500)
    add('dg_keeper', keeper(), 2500)
    for stage in ('grotto', 'belfry', 'coral', 'forge', 'observatory'):
        add('dg_dress_' + stage, dressing(stage), 5000)
    for name, fn in CREATURES:
        p = P(name)
        fn(p)
        add(name, p.parts, 1800)
    for name, fn in GUARDIANS:
        p = P(name)
        fn(p)
        add(name, p.parts, 5000)
        q = P(PETS[name])
        fn(q, .2)
        add(PETS[name], q.parts, 3000, fit=.7)
    add('item_dg_seal', seal(), 1200)
    objs = [o for r in roots for o in [r] + list(r.children_recursive)]
    size = style.export_glb(objs, OUT)
    assert size < 2500000, size
    mp = os.path.join(R, 'art', 'generated', 'kit', 'dungeon-manifest.json')
    os.makedirs(os.path.dirname(mp), exist_ok=True)
    open(mp, 'w').write(json.dumps(manifest, indent=2))
    # Preview: the guardians and creatures on a vault floor.
    import build_creatures as pres
    pres.stage((1800, 1100), ground='#3c4a5e')
    for o in roots:
        o.hide_render = True
        for c in o.children_recursive:
            c.hide_render = True
    show = [r for r in roots if r.name.startswith('dg_') and r.name not in ('dg_floor', 'dg_wall', 'dg_lobby') and not r.name.startswith('dg_dress')]
    x = -26.0
    for r in show:
        r.hide_render = False
        for c in r.children_recursive:
            c.hide_render = False
        big = r.name in PETS
        r.location = (x, 0 if big else -4, 0)
        x += 5.2 if big else 2.4
    pres.camera(26, 12, (0, -2, 1.5), 58, distance=90)
    pp = os.path.join(R, 'art', 'previews', 'kit', 'dungeon.webp')
    os.makedirs(os.path.dirname(pp), exist_ok=True)
    style.render(pp)
    print('DUNGEON_OK', size, json.dumps({k: v['triangles'] for k, v in manifest.items()}))


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
    for node, iid in [(v, v) for v in PETS.values()] + [('item_dg_seal', 'dg_seal')]:
        root = bpy.data.objects[node]
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
        cam = build_items.icon_camera(joined, elevation=30, yaw=22, margin=1.14)
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
    print('DUNGEON_ICONS_OK')


if __name__ == '__main__':
    icons() if '--icons' in sys.argv else main()
