"""Zoo Garden space kit: the rocket ship, its launch pad, a flame, stardust and asteroids.

The village rocket (build_props.py `rocket`) is one merged mesh standing on its pad, so it
cannot lift off. This kit splits it for the piloted flight between planets: `ship` (the same
rocket, origin at the bottom of its engine bell) with a separate child mesh `flame` that the
game shows and stretches, and the `pad` on its own. It adds the flight's pickups and obstacles,
seen from the high flight camera against the dark purple sky: `stardust`, `asteroid_rock`,
`asteroid_ice` and `asteroid_lava`. See CONTRACT.md ("Space kit").

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_space.py -- [--install] [--render]

Outputs:
    art/generated/kit/models/space.glb
    art/generated/kit/space-manifest.json
    art/previews/kit/space.webp, space-flight.webp   (--render)
--install copies space.glb to public/assets/models/.

Blender is Z up with the front facing -Y; glTF is Y up with the front facing +Z. Output is
deterministic: seeded randomness, triangulated and sorted faces (as build_props.py). The build
exits non-zero when a node, the flame, a budget or a placement rule is wrong. All designs are
original.
"""
import argparse
import json
import math
import os
import random
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
import style  # noqa: E402
from style import (reset_scene, mat, sphere, torus, cyl, extrude_outline, smooth, join,  # noqa: E402
                   triangles, export_glb, studio, render)
import build_props as props  # noqa: E402  (import-safe: its main() only runs as a script)
from build_props import revolve, sector, polar, new_obj, triangulate  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT_DIR = os.path.join(ROOT, 'art', 'generated', 'kit')
MODEL_DIR = os.path.join(OUT_DIR, 'models')
GLB = os.path.join(MODEL_DIR, 'space.glb')
MANIFEST = os.path.join(OUT_DIR, 'space-manifest.json')
PREVIEW_DIR = os.path.join(ROOT, 'art', 'previews', 'kit')
INSTALL_DIR = os.path.join(ROOT, 'public', 'assets', 'models')
GLB_LIMIT = 250 * 1024
TAU = math.tau
SPACE_BG = '#120A2A'


def rad(deg):
    return math.radians(deg)


# ------------------------------------------------------------------ materials
# The ship and pad reuse the rocket prop's materials by name (same colours as build_props.py).
SHARED = ('Rocket white', 'Rocket red', 'Sun', 'Gold', 'Glass', 'Charcoal',
          'Pad', 'Pad dark', 'Hazard', 'Pad light')
MATERIALS = {name: props.MATERIALS[name] for name in SHARED}
# (colour, roughness[, emission colour, emission strength]). The game tone-maps with three.js
# Neutral, which pulls strong emission toward white, so the glowing colours keep green low:
# the flame still reads orange at strength 3 and the core yellow.
MATERIALS.update({
    'Rocket flame': ('#FF6A14', 0.5, '#FF4400', 3.0),
    'Rocket flame core': ('#FFE04A', 0.5, '#FFC81A', 3.0),
    'Stardust': ('#FFD21F', 0.35, '#FFBE12', 2.5),
    'Stardust rim': ('#FF8A1C', 0.4, '#FF6A0A', 1.2),
    'Asteroid rock': ('#B0826A', 0.62),
    'Asteroid crater': ('#7A4E3E', 0.75),
    'Asteroid ice': ('#45C4FF', 0.22),
    'Asteroid frost': ('#F2FCFF', 0.32),
    'Basalt': ('#5C4656', 0.55),
    'Lava glow': ('#FF6A14', 0.45, '#FF4A00', 2.5),
})


def M(name):
    spec = MATERIALS[name]
    emit, strength = (spec[2], spec[3]) if len(spec) > 2 else (None, 0.0)
    return mat(name, spec[0], spec[1], 0.0, emit, strength)


def emissive(name):
    spec = MATERIALS.get(name, ())
    return spec[3] if len(spec) > 2 else 0.0


# ------------------------------------------------------------- mesh helpers
def resmooth(obj, angle):
    """Smooth shading with edges sharper than `angle` marked hard (style.smooth, starting clean)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = rad(angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > limit)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def lathe(name, profile, material, segs, smooth_angle):
    """build_props.revolve, with a profile that starts on the axis given outward normals
    (revolve winds a starting fan inward)."""
    obj = revolve(name, profile, M(material), segs=segs, smooth_angle=smooth_angle)
    if profile[0][0] <= 1e-6:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.reverse_faces(bm, faces=[bm.faces[i] for i in range(segs)])
        bm.to_mesh(obj.data)
        bm.free()
        resmooth(obj, smooth_angle)
    return obj


def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return dict(min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi],
                size=[round(hi[i] - lo[i], 4) for i in range(3)])


def gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def gltf_bounds(b):
    lo, hi = b['min'], b['max']
    return dict(min=[lo[0], lo[2], round(-hi[1], 4)], max=[hi[0], hi[2], round(-lo[1], 4)])


def recentre(obj):
    """Move the mesh so its bounding-box centre sits on the origin."""
    pts = [v.co for v in obj.data.vertices]
    c = Vector([(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)])
    obj.data.transform(Matrix.Translation(-c))
    obj.data.update()
    return obj


# ----------------------------------------------------------------- the ship
# The ship is the prop rocket rebuilt with the prop's own numbers, then lowered so the bottom of
# the engine bell (and the fin feet) sit on z = 0.
SHIP_LIFT = 0.33        # the prop's nozzle bottom
FIN_TOP = 2.05 - SHIP_LIFT
PORTHOLE_Z = 2.35 - SHIP_LIFT
FLAME_LENGTH = 1.6


def build_ship():
    # Engine bell. Unlike the prop, it is closed by a dark recess the flame leaves from.
    lathe('Nozzle', [(0.0, 0.48), (0.3, 0.33), (0.52, 0.33), (0.48, 0.6), (0.3, 0.62)], 'Charcoal', 20, 40)
    lathe('Body', [(0.0, 0.55), (0.6, 0.55), (0.8, 0.72), (0.9, 1.15), (0.93, 1.8), (0.9, 2.5), (0.83, 3.1),
                   (0.73, 3.5)], 'Rocket white', 28, 60)
    revolve('Band', [(0.72, 3.42), (0.775, 3.45), (0.785, 3.62), (0.72, 3.66)], M('Sun'), segs=28, smooth_angle=60)
    revolve('Nose', [(0.74, 3.6), (0.7, 3.95), (0.58, 4.35), (0.4, 4.68), (0.18, 4.92), (0.0, 5.0)],
            M('Rocket red'), segs=28, smooth_angle=60)
    sphere('Nose tip', 0.1, (0, 0, 5.03), M('Gold'), segs=10, rings=6)
    revolve('Base band', [(0.82, 0.74), (0.87, 0.77), (0.925, 1.05), (0.905, 1.1)], M('Rocket red'), segs=28,
            smooth_angle=60)
    # Porthole facing -Y.
    pz = 2.35
    torus('Porthole rim', 0.31, 0.07, (0, -0.87, pz), M('Gold'), 18, 5, rot=(rad(90), 0, 0))
    sphere('Porthole glass', 0.28, (0, -0.86, pz), M('Glass'), segs=14, rings=8, scale=(1, 0.33, 1))
    # Four swept fins on the diagonals.
    fin = [(0.7, 2.05), (0.8, 0.62), (1.0, 0.36), (1.38, 0.33), (1.42, 0.5), (1.32, 0.95), (1.08, 1.5)]
    for k, deg in enumerate((45, 135, 225, 315)):
        extrude_outline(f'Fin {k}', fin, 0.15, (0, 0, 0), M('Rocket red'), rot=(0, 0, rad(deg)), bev=0.045)


def flame_shell(bm, profile, segs, mat_index, waves=0, amp=0.0, twist=0.0, phase=0.0):
    """A closed spindle from the top centre down to the tip: profile [(r, z, lobe weight)] with r = 0
    at both ends. `waves` flutes the radius into licking lobes that spiral by `twist` toward the tip."""
    top, tip = profile[0][1], profile[-1][1]
    rings = []
    for r, z, w in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
            continue
        t = (top - z) / (top - tip)
        ring = []
        for i in range(segs):
            a = phase + i * TAU / segs
            rr = r * (1 + amp * w * math.cos(waves * i * TAU / segs)) if waves else r
            ring.append(bm.verts.new((rr * math.cos(a + twist * t), rr * math.sin(a + twist * t), z)))
        rings.append(ring)
    faces = []
    for lo, hi in zip(rings, rings[1:]):
        if len(lo) == 1:
            faces += [bm.faces.new((lo[0], hi[(i + 1) % segs], hi[i])) for i in range(segs)]
        elif len(hi) == 1:
            faces += [bm.faces.new((lo[i], lo[(i + 1) % segs], hi[0])) for i in range(segs)]
        else:
            faces += [bm.faces.new((lo[i], lo[(i + 1) % segs], hi[(i + 1) % segs], hi[i])) for i in range(segs)]
    for f in faces:
        f.material_index = mat_index
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def build_flame():
    """Emissive flame below the bell exit (the origin): a fat yellow core near the bell inside a
    longer, fluted orange flame whose lobes let the core lick through. The top tucks into the bell."""
    bm = bmesh.new()
    flame_shell(bm, [(0.0, 0.1, 0), (0.28, 0.04, 0.0), (0.38, -0.14, 0.0), (0.43, -0.38, 0.65),
                     (0.38, -0.68, 1.0), (0.26, -1.0, 1.0), (0.13, -1.3, 0.8), (0.0, -FLAME_LENGTH, 0)],
                15, 0, waves=5, amp=0.24, twist=rad(70))
    flame_shell(bm, [(0.0, 0.08, 0), (0.29, 0.03, 0), (0.43, -0.12, 0), (0.46, -0.32, 0), (0.39, -0.54, 0),
                     (0.24, -0.78, 0), (0.0, -1.02, 0)], 10, 1, phase=TAU / 20)
    obj = new_obj('flame', bm, [M('Rocket flame'), M('Rocket flame core')])
    return resmooth(obj, 75)


# ------------------------------------------------------------------ the pad
PAD_TOP = 0.31


def build_pad():
    """The prop's launch pad on its own. The lights are low glowing domes so the pad stays under
    0.35 m, and the ring under the fin feet is a thin inlay so the ship sits flush on the deck."""
    revolve('Pad', [(0.0, 0.0), (2.55, 0.0), (2.64, 0.07), (2.62, 0.2), (2.52, 0.27), (2.3, 0.28), (0.0, 0.28)],
            M('Pad'), segs=40, smooth_angle=45)
    revolve('Pad deck', [(0.0, 0.28), (2.05, 0.28), (2.08, PAD_TOP), (0.0, PAD_TOP)], M('Pad dark'), segs=40)
    tiles = 20
    for i in range(0, tiles, 2):
        a0 = TAU * i / tiles + rad(3)
        a1 = TAU * (i + 1) / tiles + rad(3)
        sector(f'Hazard {i}', 1.62, 2.0, a0, a1, 0.3, 0.335, M('Hazard'), n=2, bev=0.0, seg=1)
    revolve('Pad ring', [(1.18, 0.3), (1.3, 0.3), (1.3, 0.322), (1.18, 0.322)], M('Hazard'), segs=36)
    # A centre target that shows once the ship has lifted off.
    revolve('Pad target', [(0.6, PAD_TOP + 0.012), (0.72, PAD_TOP + 0.012)], M('Hazard'), segs=28)
    for i in range(8):
        x, y, _ = polar(2.32, 22.5 + 45 * i)
        cyl(f'Pad light base {i}', 0.13, 0.04, (x, y, 0.285), M('Pad dark'), verts=8, bev=0.0)
        revolve(f'Pad light {i}', [(0.105, 0.3), (0.09, 0.322), (0.055, 0.339), (0.0, 0.345)], M('Pad light'),
                segs=8, loc=(x, y, 0.0), smooth_angle=80)


# ------------------------------------------------------------- the stardust
STAR_R = 0.5


def star_xy(r_out, r_in, points=5):
    """A star in the XY plane with one point toward +Y (screen-up from the game camera)."""
    return [((r_out if i % 2 == 0 else r_in) * math.cos(math.pi / 2 + i * math.pi / points),
             (r_out if i % 2 == 0 else r_in) * math.sin(math.pi / 2 + i * math.pi / points))
            for i in range(points * 2)]


def build_stardust():
    """A chunky, puffy five-point star lying flat (faces up), centred on its origin: a faceted
    glowing core peak on both sides, wrapped in a soft rounded rim."""
    bm = bmesh.new()
    outline = star_xy(STAR_R, STAR_R * 0.5)

    def ring(scale, z):
        return [bm.verts.new((x * scale, y * scale, z)) for x, y in outline]
    n = len(outline)
    equator = ring(1.0, 0.0)
    faces = []
    for sign in (1, -1):
        shoulder = ring(0.86, sign * 0.085)
        lip = ring(0.68, sign * 0.13)
        peak = bm.verts.new((0.0, 0.0, sign * 0.21))
        for lo, hi, m in ((equator, shoulder, 1), (shoulder, lip, 1)):
            for i in range(n):
                f = bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
                f.material_index = m
                faces.append(f)
        for i in range(n):
            f = bm.faces.new((lip[i], lip[(i + 1) % n], peak))
            f.material_index = 0
            faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    # Kept on the star's own centre (not its bounding box) so it spins without wobbling.
    obj = new_obj('stardust', bm, [M('Stardust'), M('Stardust rim')])
    return resmooth(obj, 55)


# ------------------------------------------------------------- the asteroids
def fib_sphere(n, rng, jitter):
    golden = math.pi * (3 - math.sqrt(5))
    pts = []
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - z * z))
        p = Vector((r * math.cos(i * golden), r * math.sin(i * golden), z))
        p += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * jitter
        pts.append(p.normalized())
    return pts


def unit(rng):
    while True:
        v = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if 0.05 < v.length <= 1.0:
            return v.normalized()


def rock_bm(n, seed, radius, squash, lobes, rough, jitter=0.22):
    """A lumpy closed rock: the hull of jittered sphere points, bulged by a few broad lobes."""
    rng = random.Random(seed)
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in fib_sphere(n, rng, jitter)]
    res = bmesh.ops.convex_hull(bm, input=verts, use_existing_faces=False)
    loose = [g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bulges = [(unit(rng), a, p) for a, p in lobes]
    for v in bm.verts:
        d = v.co.normalized()
        f = 1.0 + sum(a * max(0.0, d.dot(c)) ** p for c, a, p in bulges) + rng.uniform(-rough, rough)
        v.co = Vector((d.x * squash[0], d.y * squash[1], d.z * squash[2])) * f * radius
    bm.normal_update()
    return bm, rng


def pick_sites(bm, count, rng, min_angle, up_bias=0.6, valence=(5, 6), exclude=()):
    """Spread-out vertices for craters/pools, favouring the top (the camera looks down)."""
    cands = []
    for v in bm.verts:
        if len(v.link_faces) not in valence or v in exclude:
            continue
        d = v.co.normalized()
        cands.append((d.z * up_bias + rng.random(), v.index, v))
    cands.sort(key=lambda c: (-c[0], c[1]))
    chosen, near = [], set()
    for _, _, v in cands:
        d = v.co.normalized()
        if v not in near and all(d.angle(w.co.normalized()) > min_angle for w in chosen):
            chosen.append(v)
            ring = {e.other_vert(v) for e in v.link_edges}
            near |= {v} | ring | {e.other_vert(w) for w in ring for e in w.link_edges}
        if len(chosen) == count:
            break
    return chosen


def crater(bm, v, opening, depth, rim, mat_index, wall_index=None):
    """Sink the fan around `v` into a bowl with a raised rim. The opening is the fan outline scaled by
    `opening` about the centre (so walls never fold), then the centre drops by `depth`.
    Returns (bowl, wall) faces."""
    axis = v.co.normalized()
    centre = v.co.copy()
    fan = list(v.link_faces)
    wall = bmesh.ops.inset_region(bm, faces=fan, thickness=0.02, depth=0.0, use_even_offset=True)['faces']
    # inset_region keeps the original vertices on the inner ring and makes new ones on the boundary.
    inner = {w for f in fan for w in f.verts if w is not v}
    outer = {w for f in wall for w in f.verts} - inner
    for u in sorted(inner, key=lambda w: w.index):
        w = next(e.other_vert(u) for e in u.link_edges if e.other_vert(u) in outer)
        u.co = centre + (w.co - centre) * opening - axis * depth * 0.35
    v.co = centre - axis * depth
    for w in outer:
        w.co += w.co.normalized() * rim
    for f in fan:
        f.material_index = mat_index
    if wall_index is not None:
        for f in wall:
            f.material_index = wall_index
    return fan, wall


def finish_rock(name, bm, materials, angle):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = new_obj(name, bm, [M(m) for m in materials])
    return recentre(resmooth(obj, angle))


def build_asteroid_rock():
    bm, rng = rock_bm(54, 11, 0.98, (1.08, 0.98, 0.84), [(0.16, 2.0), (0.12, 3.0), (-0.1, 2.5)], 0.035)
    sites = pick_sites(bm, 4, rng, rad(66))     # far enough apart that no two fans share a face
    for k, v in enumerate(sites):
        crater(bm, v, 0.66, 0.2 if k else 0.26, 0.03, 1, wall_index=1)
    return finish_rock('asteroid_rock', bm, ('Asteroid rock', 'Asteroid crater'), 48)


def build_asteroid_ice():
    """Faceted icy blue rock with scattered frost facets (more on top) and five ice crystals with
    frosted points breaking out of it."""
    bm, rng = rock_bm(34, 23, 0.95, (1.06, 1.0, 0.86), [(0.14, 2.0), (0.1, 2.5)], 0.03, jitter=0.18)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:      # scattered frost facets, thicker on top where the camera looks
        if rng.random() < (0.36 if f.normal.z > 0.45 else 0.1):
            f.material_index = 1
    # Frost crystals: extrude a face into a short tapered prism with a point.
    cands = sorted(((f.normal.z * 0.7 + rng.random(), f.index, f) for f in bm.faces), key=lambda c: (-c[0], c[1]))
    picked = []
    for _, _, f in cands:
        c = f.calc_center_median()
        if all(c.angle(g[1]) > rad(48) for g in picked):
            picked.append((f, c.copy(), f.normal.copy()))
        if len(picked) == 5:
            break
    for k, (f, c, nrm) in enumerate(picked):
        h = (0.5, 0.36, 0.44, 0.32, 0.4)[k]
        top = bmesh.ops.extrude_discrete_faces(bm, faces=[f])['faces'][0]
        for v in top.verts:
            v.co = c + (v.co - c) * 0.62 + nrm * h * 0.45
        sides = {g for e in top.edges for g in e.link_faces if g is not top}
        point = bmesh.ops.poke(bm, faces=[top])
        point['verts'][0].co = c + nrm * h
        for g in sides:             # clear blue ice walls with a white frosted point
            g.material_index = 0
        for g in point['faces']:
            g.material_index = 1
    return finish_rock('asteroid_ice', bm, ('Asteroid ice', 'Asteroid frost'), 28)


def crack_edges(start, steps, rng, used, blocked, away):
    """A wandering edge path from `start` heading away from `away` (its pool), mostly straight and
    high on the rock, never revisiting a vertex or entering `blocked` (the pools)."""
    path, v, prev = [], start, None
    seen = {start}
    for _ in range(steps):
        opts = []
        out = (v.co - away).normalized()
        for e in v.link_edges:
            w = e.other_vert(v)
            if w in seen or w in blocked or e in used:
                continue
            d = (w.co - v.co).normalized()
            straight = d.dot(prev) if prev is not None else 0.0
            score = 0.6 * straight + 0.8 * d.dot(out) + 0.5 * w.co.normalized().z + rng.uniform(0, 0.6)
            opts.append((score, w.index, e, w, d))
        if not opts:
            break
        opts.sort(key=lambda o: (-o[0], o[1]))
        _, _, e, w, d = opts[0]
        path.append(e)
        seen.add(w)
        v, prev = w, d
    return path


def build_asteroid_lava():
    """Dark basalt split by glowing seams that run out of two bubbling lava pools."""
    bm, rng = rock_bm(36, 37, 0.97, (1.05, 1.0, 0.86), [(0.15, 2.0), (0.12, 2.5), (-0.08, 3.0)], 0.035)
    pools = pick_sites(bm, 2, rng, rad(80), up_bias=0.9)
    rims, blocked = [], set()
    for k, v in enumerate(pools):
        centre = v.co.copy()
        fan, wall = crater(bm, v, 0.6, 0.05, 0.025, 1)
        inner = {w for f in fan for w in f.verts}
        blocked |= inner
        bm.verts.index_update()
        rims.append((centre, sorted({w for f in wall for w in f.verts} - inner, key=lambda w: w.index)))
    used = set()
    paths = []
    # Two seams leave the top pool on opposite sides, one leaves the second pool.
    for k, (centre, ring) in enumerate(rims):
        first = max(ring, key=lambda w: (w.co.z, -w.index))
        starts = [first, max(ring, key=lambda w: ((w.co - first.co).length, -w.index))] if k == 0 else [first]
        for start in starts:
            path = crack_edges(start, 3, rng, used, blocked, centre)
            used.update(path)
            paths += path
    verts = list({v for e in paths for v in e.verts})
    res = bmesh.ops.bevel(bm, geom=paths + verts, offset=0.055, offset_type='OFFSET', segments=1, profile=0.5,
                          affect='EDGES', clamp_overlap=True, material=1)
    for v in {v for f in res['faces'] if f.material_index == 1 for v in f.verts}:
        v.co -= v.co.normalized() * 0.03
    return finish_rock('asteroid_lava', bm, ('Basalt', 'Lava glow'), 40)


# -------------------------------------------------------------- contract
NODES = ('ship', 'pad', 'stardust', 'asteroid_rock', 'asteroid_ice', 'asteroid_lava')
BUDGET = {'ship': 2600, 'pad': 1800, 'stardust': 140, 'asteroid_rock': 160, 'asteroid_ice': 160,
          'asteroid_lava': 170}
REQUIRED_MATS = {
    'stardust': {'Stardust', 'Stardust rim'},
    'asteroid_rock': {'Asteroid rock', 'Asteroid crater'},
    'asteroid_ice': {'Asteroid ice', 'Asteroid frost'},
    'asteroid_lava': {'Basalt', 'Lava glow'},
}
NOTES = {
    'ship': 'The prop rocket without its pad. Origin at the bottom of the engine bell (fin feet also at z 0); '
            'nose up (+Z Blender, +Y glTF), porthole facing -Y (glTF +Z). To fly level, rotate it -90 deg about '
            'glTF X: the nose then points -Z and the porthole faces up. Child mesh `flame` hangs below the bell.',
    'pad': 'The prop launch pad on its own. Stand the ship (origin) on pad_top. Emissive Pad light domes; '
           'a yellow centre target shows once the ship has gone.',
    'stardust': 'Centred on its origin, lying flat (faces up, glTF +Y) with one point toward -Z glTF '
                '(screen-up from the game camera). Spin it about the up axis.',
    'asteroid_rock': 'Centred on its origin; four raised-rim craters, mostly on top.',
    'asteroid_ice': 'Centred on its origin; faceted, frosted on top, five frost crystals.',
    'asteroid_lava': 'Centred on its origin; two lava pools with glowing seams running out of them.',
}


def mesh_points(obj):
    return [v.co.copy() for v in obj.data.vertices]


def material_names(obj):
    return [m.name for m in obj.data.materials]


def node_info(name, obj, extra_pts=None):
    pts = mesh_points(obj) + (extra_pts or [])
    b = bounds(pts)
    info = dict(triangles=triangles(obj), budget=BUDGET[name], vertices=len(obj.data.vertices),
                materials=material_names(obj), bounds=b, bounds_gltf=gltf_bounds(b),
                max_radius_xy=round(max(math.hypot(p.x, p.y) for p in pts), 4),
                max_radius=round(max(p.length for p in pts), 4),
                emissive_materials={m: emissive(m) for m in material_names(obj) if emissive(m) > 0},
                notes=NOTES[name])
    return info


def check(objects):
    problems = []
    info = {}
    for name in NODES:
        obj = objects.get(name)
        if obj is None or bpy.data.objects.get(name) is not obj or obj.type != 'MESH':
            problems.append(f'missing mesh node {name}')
            continue
        if obj.parent is not None:
            problems.append(f'{name} must be a top-level node')
    if problems:
        return problems, info
    ship = objects['ship']
    flame = bpy.data.objects.get('flame')
    flame_ok = (flame is not None and flame.type == 'MESH' and flame.parent is ship and flame.name == 'flame'
                and flame in ship.children)
    if not flame_ok:
        problems.append('ship has no child MESH named exactly "flame"')
    for name in NODES:
        obj = objects[name]
        info[name] = node_info(name, obj)
        mats = set(material_names(obj))
        if name in REQUIRED_MATS and mats != REQUIRED_MATS[name]:
            problems.append(f'{name} materials {sorted(mats)} != {sorted(REQUIRED_MATS[name])}')
    # Ship and flame.
    s = info['ship']
    pts = mesh_points(ship)
    if flame_ok:
        fpts = mesh_points(flame)
        ftris = triangles(flame)
        if any(abs(c) > 1e-6 for c in flame.location) or any(abs(c) > 1e-6 for c in flame.rotation_euler) \
                or any(abs(c - 1) > 1e-6 for c in flame.scale):
            problems.append('flame must sit at the ship origin (bell exit) with no rotation or scale')
        fb = bounds(fpts)
        length = -fb['min'][2]
        if not 1.4 <= length <= 1.8:
            problems.append(f'flame length {length:.3f} not about 1.6')
        if fb['max'][2] > 0.15:
            problems.append(f'flame rises {fb["max"][2]:.3f} above the bell exit')
        fmats = material_names(flame)
        if not fmats or any(emissive(m) <= 0 for m in fmats):
            problems.append('flame materials must all be emissive')
        s['triangles'] = dict(ship=s['triangles'], flame=ftris, total=s['triangles'] + ftris)
        s['flame'] = dict(node='flame', parent='ship', origin='bell exit (the ship origin)',
                          translation=[0.0, 0.0, 0.0], translation_gltf=[0.0, 0.0, 0.0],
                          length=round(length, 4), top=fb['max'][2], max_radius=round(
                              max(math.hypot(p.x, p.y) for p in fpts), 4),
                          triangles=ftris, materials=fmats,
                          emissive_materials={m: emissive(m) for m in fmats},
                          bounds=fb, bounds_gltf=gltf_bounds(fb),
                          stretch='scale the flame node along glTF Y (Blender Z): it grows downward from the bell')
        if s['triangles']['total'] > BUDGET['ship']:
            problems.append(f'ship + flame {s["triangles"]["total"]} triangles > {BUDGET["ship"]}')
    elif s['triangles'] > BUDGET['ship']:
        problems.append(f'ship {s["triangles"]} triangles > {BUDGET["ship"]}')
    base = min(p.z for p in pts)
    if abs(base) > 0.02:
        problems.append(f'ship base at z {base:.3f}, not 0')
    porthole = [p for p in pts if p.y < -0.5 and abs(p.z - PORTHOLE_Z) < 0.42 and abs(p.x) < 0.42]
    # The hull: everything but the porthole and the fins (the fins sit on the diagonals, under FIN_TOP).
    def on_fin(p):
        a = math.degrees(math.atan2(p.y, p.x)) % 90.0
        return p.z < FIN_TOP + 0.02 and abs(a - 45.0) < 10.0
    hull = [p for p in pts if p not in porthole and not on_fin(p)]
    body_r = max(math.hypot(p.x, p.y) for p in hull)
    port_r = max(math.hypot(p.x, p.y) for p in porthole)
    fin_r = max(math.hypot(p.x, p.y) for p in pts)
    s.update(height=s['bounds']['max'][2], body_radius=round(body_r, 4), porthole_radius=round(port_r, 4),
             fin_radius=round(fin_r, 4), porthole_centre=[0.0, -0.87, round(PORTHOLE_Z, 4)],
             porthole_centre_gltf=gltf((0.0, -0.87, PORTHOLE_Z)))
    if body_r > 0.95 + 1e-4:
        problems.append(f'ship body radius {body_r:.3f} > 0.95')
    if fin_r > 1.45 + 1e-4:
        problems.append(f'ship fins reach r {fin_r:.3f} > 1.45')
    if not 4.2 <= s['height'] <= 5.0:
        problems.append(f'ship height {s["height"]:.3f}')
    # Pad.
    p = info['pad']
    ppts = mesh_points(objects['pad'])
    top = max(v.z for v in ppts if math.hypot(v.x, v.y) <= 0.55)
    p['pad_top'] = round(top, 4)
    if not 0.1 <= top <= 0.35:
        problems.append(f'pad top {top:.3f} not between 0.1 and 0.35')
    if abs(top - PAD_TOP) > 1e-4:
        problems.append(f'pad top {top:.4f} != PAD_TOP {PAD_TOP}')
    if p['bounds']['max'][2] > 0.35 + 1e-4:
        problems.append(f'pad height {p["bounds"]["max"][2]:.3f} > 0.35')
    if p['bounds']['min'][2] < -1e-4:
        problems.append('pad below ground')
    if not 2.55 <= p['max_radius_xy'] <= 2.7:
        problems.append(f'pad radius {p["max_radius_xy"]:.3f}')
    # Centred pieces.
    for name, (r_lo, r_hi) in (('stardust', (0.42, 0.6)), ('asteroid_rock', (0.85, 1.25)),
                               ('asteroid_ice', (0.85, 1.3)), ('asteroid_lava', (0.85, 1.25))):
        b = info[name]['bounds']
        centre = [(b['min'][i] + b['max'][i]) / 2 for i in range(3)]
        if name == 'stardust':      # the star's own centre: vertex centroid in XY, bounds in Z
            pts = mesh_points(objects[name])
            centre[:2] = [sum(p[i] for p in pts) / len(pts) for i in range(2)]
        if max(abs(c) for c in centre) > 0.01:
            problems.append(f'{name} not centred on its origin: {centre}')
        if not r_lo <= info[name]['max_radius_xy'] <= r_hi:
            problems.append(f'{name} radius {info[name]["max_radius_xy"]:.3f} outside {r_lo}..{r_hi}')
    for name in NODES:
        t = info[name]['triangles']
        t = t['total'] if isinstance(t, dict) else t
        if t > BUDGET[name]:
            problems.append(f'{name} {t} triangles > {BUDGET[name]}')
    return problems, info


# ---------------------------------------------------------------- previews
def clear_stage():
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA', 'FONT') or o.name.startswith('Preview'):
            bpy.data.objects.remove(o, do_unlink=True)


def space_studio(size):
    """style.studio with a transparent film (composited over the space sky) and a dim violet ambient."""
    clear_stage()
    studio(ground_color=None, size=size, transparent=True)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = style.rgba('#B9A8FF')
    bg.inputs['Strength'].default_value = 0.42
    scene.view_settings.exposure = -0.15
    ee = scene.eevee
    for attr, value in (('taa_render_samples', 64), ('use_gtao', True), ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass
    scene.render.filter_size = 1.2


def look_camera(target, elevation, yaw, distance=60.0, ortho=None, lens=None, name='Preview camera'):
    data = bpy.data.cameras.new(name)
    if ortho is not None:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    else:
        data.lens = lens
    data.clip_end = 500.0
    data.sensor_fit = 'HORIZONTAL'      # ortho_scale / lens always span the frame width
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = rad(elevation), rad(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.location = Vector(target) + d * distance
    bpy.context.scene.camera = cam
    bpy.context.view_layer.update()
    return cam


def frame_ortho(cam, objs, res, margin=1.18, offset=(0.0, 0.0)):
    """Centre an orthographic camera on the objects and fit them in the frame."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ v.co) for o in objs for v in o.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    rot = cam.matrix_world.to_3x3()
    aspect = res[0] / res[1]
    width = max(x1 - x0, (y1 - y0) * aspect) * margin
    cam.location = cam.location + rot @ Vector(((x0 + x1) / 2 - offset[0] * width,
                                                (y0 + y1) / 2 - offset[1] * width / aspect, 0))
    cam.data.ortho_scale = width
    bpy.context.view_layer.update()


def label(cam, text, u, v, size_frac, res, colour='#EFE8FF', align='LEFT', name='Preview label'):
    """Flat emissive text in front of the camera at (u, v) of the frame (-0.5..0.5 from the centre);
    size_frac is the letter size as a fraction of the frame height."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = text
    cu.align_x = align
    cu.align_y = 'TOP'
    m = bpy.data.materials.get(name + ' ' + colour)
    if m is None:
        m = mat(name + ' ' + colour, '#000000', 1.0, emit=colour, emit_strength=1.0)
    cu.materials.append(m)
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    mw = cam.matrix_world
    depth = 2.0
    if cam.data.type == 'ORTHO':
        w = cam.data.ortho_scale
        pos = Vector((u * w, v * w * res[1] / res[0], -depth))
        h = w * res[1] / res[0]
    else:
        w = depth * 36.0 / cam.data.lens
        h = w * res[1] / res[0]
        pos = Vector((u * w, v * h, -depth))
    cu.size = size_frac * h
    obj.location = mw @ pos
    obj.rotation_euler = mw.to_euler()
    obj.visible_shadow = False
    return obj


def remove(objs):
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)


def hide_all_but(objects, keep):
    for o in objects.values():
        o.hide_render = o not in keep
    flame = bpy.data.objects.get('flame')
    if flame is not None:
        flame.hide_render = flame not in keep


def render_png(path, res):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def sky(width, height, seed):
    """The game's #120a2a space colour with a seeded sprinkle of soft stars (sRGB floats, top row first)."""
    import numpy as np
    bg = np.array([int(SPACE_BG[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
    canvas = np.empty((height, width, 3), dtype=np.float32)
    canvas[:] = bg
    rng = random.Random(seed)
    tints = ((1.0, 1.0, 1.0), (0.82, 0.88, 1.0), (1.0, 0.9, 0.78), (0.9, 0.82, 1.0))
    for _ in range(int(width * height / 3600)):
        x, y = rng.uniform(0, width), rng.uniform(0, height)
        big = rng.random() < 0.07
        sigma = rng.uniform(0.9, 1.5) if big else rng.uniform(0.45, 0.75)
        bright = (rng.uniform(0.55, 0.9) if big else rng.uniform(0.12, 0.5))
        tint = np.array(rng.choice(tints), dtype=np.float32)
        r = int(math.ceil(sigma * 3))
        x0, x1 = max(0, int(x) - r), min(width, int(x) + r + 1)
        y0, y1 = max(0, int(y) - r), min(height, int(y) + r + 1)
        if x0 >= x1 or y0 >= y1:
            continue
        gx = np.arange(x0, x1, dtype=np.float32) + 0.5 - x
        gy = np.arange(y0, y1, dtype=np.float32) + 0.5 - y
        g = np.exp(-(gy[:, None] ** 2 + gx[None, :] ** 2) / (2 * sigma * sigma))
        canvas[y0:y1, x0:x1] += bright * g[..., None] * tint
    return np.clip(canvas, 0, 1)


def paste(canvas, path, x, y):
    """Alpha-blend a rendered RGBA PNG (sRGB) onto the canvas at pixel (x, y) from the top left."""
    import numpy as np
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    a = px[..., 3:4]
    canvas[y:y + h, x:x + w] = px[..., :3] * a + canvas[y:y + h, x:x + w] * (1 - a)
    bpy.data.images.remove(im)
    os.remove(path)


def save_webp(canvas, path, quality=90):
    import numpy as np
    h, w = canvas.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = canvas
    out = bpy.data.images.new('Space sheet', w, h, alpha=False)
    out.pixels = rgba[::-1].ravel()
    out.filepath_raw = path
    out.file_format = 'WEBP'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        out.save(quality=quality)
    except TypeError:
        out.save()
    bpy.data.images.remove(out)
    return path


def fmt_tris(t):
    return f'{(t["total"] if isinstance(t, dict) else t):,}'


def preview_sheet(objects, info):
    """space.webp: every piece on the space sky, labelled with its triangles and size."""
    import numpy as np
    ship, pad, flame = objects['ship'], objects['pad'], bpy.data.objects['flame']
    W = 1800
    top_w, top_h = 600, 660
    bot_w, bot_h = 450, 450
    canvas = sky(W, top_h + bot_h, 5)
    s = info['ship']
    tiles = [
        # (objects shown, setup, elevation, yaw, label lines, tile rect)
        ('ship', [ship, flame], 14, -28,
         ['ship + flame', f'{fmt_tris(s["triangles"])} tris ({s["triangles"]["flame"]} flame)  '
                          f'h {s["height"]:.2f} + flame {s["flame"]["length"]:.1f}'], (0, 0, top_w, top_h)),
        ('ship_on_pad', [ship, pad], 42.16, 0,
         ['ship on pad', f'ship origin on pad_top z {info["pad"]["pad_top"]:.2f}'], (top_w, 0, top_w, top_h)),
        ('pad', [pad], 42.16, 0,
         ['pad', f'{fmt_tris(info["pad"]["triangles"])} tris  r {info["pad"]["max_radius_xy"]:.2f}  '
                 f'h {info["pad"]["bounds"]["max"][2]:.2f}'], (2 * top_w, 0, top_w, top_h)),
    ]
    for k, name in enumerate(('stardust', 'asteroid_rock', 'asteroid_ice', 'asteroid_lava')):
        n = info[name]
        tiles.append((name, [objects[name]], 45, -20 if name == 'stardust' else 25,
                      [name, f'{fmt_tris(n["triangles"])} tris  r {n["max_radius_xy"]:.2f}'],
                      (k * bot_w, top_h, bot_w, bot_h)))
    for key, shown, elev, yaw, lines, (x, y, w, h) in tiles:
        space_studio((w, h))
        hide_all_but(objects, shown + ([flame] if flame in shown else []))
        flame.hide_render = flame not in shown
        if key == 'ship_on_pad':
            ship.location.z = info['pad']['pad_top']
        if key == 'stardust':
            objects['stardust'].rotation_euler = (0, 0, rad(8))
        cam = look_camera((0, 0, 0), elev, yaw, ortho=10.0)
        # Frame a little low so the labels in the top left stay clear of the piece.
        frame_ortho(cam, shown, (w, h), margin={'stardust': 1.6}.get(key, 1.26 if h > 500 else 1.2),
                    offset=(0.0, -0.06 if h > 500 else -0.055))
        labs = [label(cam, lines[0], -0.47, 0.475, 0.052 if h > 500 else 0.06, (w, h), '#FFF4D6'),
                label(cam, lines[1], -0.47, 0.475 - (0.068 if h > 500 else 0.082), 0.034 if h > 500 else 0.042,
                      (w, h), '#BDAEF0')]
        path = render_png(os.path.join(PREVIEW_DIR, f'_space_{key}.png'), (w, h))
        paste(canvas, path, x, y)
        remove(labs + [cam])
        ship.location.z = 0.0
        objects['stardust'].rotation_euler = (0, 0, 0)
    # Thin gutters between the tiles.
    line = np.array([0x2C / 255, 0x1F / 255, 0x55 / 255], dtype=np.float32)
    for gx in (top_w, 2 * top_w):
        canvas[:top_h, gx - 1:gx + 1] = line
    for gx in (bot_w, 2 * bot_w, 3 * bot_w):
        canvas[top_h:, gx - 1:gx + 1] = line
    canvas[top_h - 1:top_h + 1, :] = line
    save_webp(canvas, os.path.join(PREVIEW_DIR, 'space.webp'))
    for o in list(objects.values()) + [flame]:
        o.hide_render = False


def preview_flight(objects, info):
    """space-flight.webp: the flight view. A 45-degree perspective camera 50 m up looks down on the
    ship lying level with its flame on, among scaled asteroids and stardust on the #120a2a sky."""
    W, H = 1600, 1000
    space_studio((W, H))
    scene = bpy.context.scene
    ship, flame = objects['ship'], bpy.data.objects['flame']
    hide_all_but(objects, [ship, flame])
    flame.hide_render = False
    heading = rad(-38)                                   # nose toward the upper right
    nose = Vector((-math.sin(heading), math.cos(heading), 0.0))
    centre = Vector((-1.5, -1.0, 0.0))
    ship.rotation_euler = (rad(-90), 0.0, heading)
    ship.location = centre - nose * 2.3
    flame.scale = (1.0, 1.0, 1.3)
    placed = []

    def put(name, loc, scale, rot):
        o = objects[name].copy()
        scene.collection.objects.link(o)
        o.hide_render = False
        o.location = loc
        o.scale = (scale, scale, scale)
        o.rotation_euler = rot
        placed.append(o)
    rng = random.Random(19)
    for name, (x, y), s in (('asteroid_rock', (-13.5, 7.0), 4.4), ('asteroid_lava', (12.0, 10.5), 3.6),
                            ('asteroid_ice', (-8.5, -9.5), 2.8), ('asteroid_rock', (15.5, -5.5), 2.2),
                            ('asteroid_ice', (3.5, 17.5), 3.2), ('asteroid_lava', (-19.0, -3.0), 1.9),
                            ('asteroid_rock', (6.5, -12.5), 1.6), ('asteroid_ice', (-3.0, 12.0), 1.7),
                            ('asteroid_rock', (21.0, 4.0), 2.6)):
        put(name, (x, y, 0.0), s, (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, TAU)))
    for k, (x, y) in enumerate(((4.5, 5.0), (7.2, 8.6), (9.3, 2.2), (-6.0, 3.0), (2.0, -6.5))):
        put('stardust', (x, y, 0.0), 2.0 + 0.25 * (k % 5), (0.0, 0.0, rng.uniform(-0.4, 0.4)))
    cam = look_camera((1.0, 2.0, 0.0), 45, 0, distance=50 * math.sqrt(2), lens=58)
    labs = [label(cam, 'Flight view: 45 deg camera 50 m up  |  asteroids x1.6-4.4, stardust x2-3, flame x1.3',
                  -0.48, 0.47, 0.024, (W, H), '#BDAEF0')]
    canvas = sky(W, H, 11)
    path = render_png(os.path.join(PREVIEW_DIR, '_space_flight.png'), (W, H))
    paste(canvas, path, 0, 0)
    save_webp(canvas, os.path.join(PREVIEW_DIR, 'space-flight.webp'))
    remove(labs + [cam] + placed)
    ship.location = (0, 0, 0)
    ship.rotation_euler = (0, 0, 0)
    flame.scale = (1, 1, 1)
    for o in list(objects.values()) + [flame]:
        o.hide_render = False


# ------------------------------------------------------------------- build
def build():
    reset_scene()
    objects = {}
    before = set(bpy.data.objects)
    build_ship()
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    ship = join(parts, 'ship')
    ship.data.transform(Matrix.Translation((0, 0, -SHIP_LIFT)))
    ship.data.update()
    objects['ship'] = triangulate(ship)
    flame = triangulate(build_flame())
    flame.parent = ship
    flame.matrix_parent_inverse = Matrix.Identity(4)
    flame.location = (0, 0, 0)

    before = set(bpy.data.objects)
    build_pad()
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    objects['pad'] = triangulate(join(parts, 'pad'))

    objects['stardust'] = triangulate(build_stardust())
    objects['asteroid_rock'] = triangulate(build_asteroid_rock())
    objects['asteroid_ice'] = triangulate(build_asteroid_ice())
    objects['asteroid_lava'] = triangulate(build_asteroid_lava())
    for o in list(objects.values()) + [flame]:
        o.data.name = o.name
    return objects


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--render', action='store_true')
    return parser.parse_args(argv)


def main():
    args = parse_args()
    objects = build()
    problems, info = check(objects)
    export = [objects[n] for n in NODES if n in objects]
    flame = bpy.data.objects.get('flame')
    if flame is not None:
        export.append(flame)
    size = export_glb(export, GLB)
    if size > GLB_LIMIT:
        problems.append(f'space.glb is {size} bytes (> {GLB_LIMIT})')
    mats = sorted({m for o in export for m in material_names(o)})
    manifest = dict(
        generator='art/blender/kit/build_space.py', blender=bpy.app.version_string, units='metres',
        coordinates='Blender: Z up, front faces -Y (glTF: Y up, front +Z). Ship and pad: origin at the ground '
                    'centre (the ship at the bottom of its engine bell). Stardust and asteroids: centred.',
        file='space.glb', bytes=size, limit_bytes=GLB_LIMIT,
        pad_top=info.get('pad', {}).get('pad_top'),
        flame=info.get('ship', {}).get('flame'),
        emissive={m: emissive(m) for m in mats if emissive(m) > 0},
        materials=mats, nodes=info)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    for name in NODES:
        if name not in info:
            continue
        n = info[name]
        b = n['bounds']
        print(f'[space] {name:14s} tris {fmt_tris(n["triangles"]):>6s}/{BUDGET[name]:>5,d}  '
              f'size {b["size"][0]:.2f} x {b["size"][1]:.2f} x {b["size"][2]:.2f}  r {n["max_radius_xy"]:.3f}  '
              f'mats {", ".join(n["materials"])}')
    if 'ship' in info:
        s = info['ship']
        print(f'[space] ship body r {s["body_radius"]}  porthole r {s["porthole_radius"]}  fins r {s["fin_radius"]}  '
              f'h {s["height"]}  flame {s.get("flame", {}).get("length")}  pad_top {info["pad"].get("pad_top")}')
    print(f'[space] space.glb {size / 1024:.1f} KB -> {GLB}')
    if args.render:
        preview_sheet(objects, info)
        preview_flight(objects, info)
        print(f'[space] previews -> {PREVIEW_DIR}')
    if problems:
        for p in problems:
            print(f'[space] CONTRACT FAIL: {p}')
        sys.stdout.flush()
        # Blender swallows exceptions from --python in background mode; exit non-zero explicitly.
        os._exit(1)
    if args.install:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        shutil.copyfile(GLB, os.path.join(INSTALL_DIR, 'space.glb'))
        print(f'[space] installed space.glb to {INSTALL_DIR}')
    print('[space] OK')
    sys.stdout.flush()


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
