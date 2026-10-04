"""The farm goat, its kid and their shelter. install(g) is called by build_farm_expansion.py.

An original chunky toy goat: cream coat with a soft brown saddle and patches, a slightly arched barrel body, slim
jointed legs ending in cloven hooves, a narrow face with a pink muzzle, a goatee, two swept-back horns, sideways
ears with pink insides and a short upturned tail. The kid is the same build at ~60 % with a rounder head, shorter
legs and horn nubs. Parts follow the quadruped contract (body/head/leg_fl/leg_fr/leg_bl/leg_br/tail, origins at
their hinges, ground at z = 0, front is -Y).
"""
import math

from mathutils import Vector


def build_goat(g, m, pid):
    Model, sphere, cyl, cone, tube, bez, FM = (g[n] for n in ('Model', 'sphere', 'cyl', 'cone', 'tube', 'bez', 'FM'))
    eye_pair, blush_pair, decal = g['eye_pair'], g['blush_pair'], g['decal']
    kid = pid == 'kid'
    K = 0.6 if kid else 1.0
    hk = 1.3 if kid else 1.0      # the kid's head stays big
    coat, patch = FM('goat', '#FBF0DC'), FM('goat patch', '#A56A3A')
    beard = FM('goat beard', '#7A4A28')

    def v(x, y, z):
        return Vector((x * K, y * K, z * K))

    def blob(part, mat_, c, r, segs=8, rings=5):
        part.add(sphere(1.0, segs, rings, scale=tuple(a * K for a in r)).moved(c), mat_)

    hp = 0.36 if kid else 0.40
    zb = hp + 0.1
    piv = dict(body=v(0, 0.05, hp), head=v(0, -0.25, zb + 0.07),
               leg_fl=v(-0.1, -0.19, hp), leg_fr=v(0.1, -0.19, hp), leg_bl=v(-0.1, 0.27, hp), leg_br=v(0.1, 0.27, hp),
               tail=v(0, 0.35, zb + 0.06))
    M = Model(pid, piv)

    # ---- body: a barrel with a slight arch (a spine blob), chest and rump, brown saddle and a side patch
    BC, BR = v(0, 0.05, zb), tuple(a * K for a in (0.18, 0.31, 0.17))
    M['body'].add(sphere(1.0, 11 if kid else 14, 6 if kid else 8, scale=BR).moved(BC), coat)
    blob(M['body'], coat, v(0, 0.27, zb + 0.01), (0.15, 0.12, 0.15), 8, 5)          # rump
    decal(M['body'], BC, BR, (0.0, 0.05, 1.0), 0.14 * K, 0.2 * K, patch, lift=0.016 * K, n=10, spin=0.3)
    decal(M['body'], BC, BR, (1.0, 0.4, 0.15), 0.08 * K, 0.07 * K, patch, lift=0.012 * K, n=8, spin=0.9)
    decal(M['body'], BC, BR, (-1.0, -0.3, 0.3), 0.07 * K, 0.06 * K, patch, lift=0.012 * K, n=8, spin=0.2)

    # ---- head: narrow skull, tapered pink muzzle, goatee, horns, sideways ears, big eyes
    H = v(0, -0.34, zb + 0.15)
    HR = tuple(a * K * hk for a in ((0.095, 0.115, 0.1) if not kid else (0.095, 0.11, 0.1)))
    HR = (HR[0], HR[1], HR[2])
    M['head'].add(sphere(1.0, 10 if kid else 12, 6 if kid else 7, scale=HR).moved(H), coat)
    MZ = H + Vector((0, -HR[1] * 0.75, -HR[2] * 0.42))
    MR = (HR[0] * 0.6, HR[1] * 0.8, HR[2] * 0.5)
    M['head'].add(sphere(1.0, 9, 5, scale=MR).moved(MZ), coat)
    nose = MZ + Vector((0, -MR[1] * 0.72, MR[2] * 0.05))
    M['head'].add(sphere(1.0, 7, 4, scale=(MR[0] * 0.78, MR[1] * 0.4, MR[2] * 0.7)).moved(nose), m['muzzle'])
    for side in (-1, 1):
        M['head'].add(sphere(1.0, 5, 3, scale=(0.012 * K, 0.008 * K, 0.01 * K)).moved(
            nose + Vector((side * MR[0] * 0.3, -MR[1] * 0.36, MR[2] * 0.15))), m['nostril'])
    eye_pair(M['head'], H, HR, (0.58, -0.72, 0.28), 0.034 * K * hk, m, squash=1.25, segs=7)
    blush_pair(M['head'], H, HR, (0.72, -0.62, -0.15), 0.03 * K * hk, m)
    # brown face stripe and cap
    decal(M['head'], H, HR, (0, -0.4, 1.0), 0.05 * K * hk, 0.075 * K * hk, patch, lift=0.003, n=8)
    # goatee: a tapered pointed beard under the chin
    chin = MZ + Vector((0, -MR[1] * 0.1, -MR[2] * 0.8))
    M['head'].add(cone(chin + Vector((0, 0.0, 0.015 * K)), chin + Vector((0, 0.02 * K, -0.12 * K)), 0.034 * K, sides=5), beard)
    for side in (-1, 1):
        # sideways ears with pink insides, tipped a little down
        ea = H + Vector((side * HR[0] * 0.92, HR[1] * 0.2, HR[2] * 0.2))
        tip = ea + Vector((side * 0.17 * K * hk, 0.02 * K, -0.04 * K))
        M['head'].add(cone(ea, tip, 0.045 * K * hk, sides=6), coat)
        M['head'].add(cone(ea + Vector((0, -0.016 * K, 0.0)), tip + Vector((-side * 0.012 * K, -0.012 * K, 0.0)),
                           0.026 * K * hk, sides=5), m['blush'])
        # horns: swept up then back (nubs on the kid)
        base = H + Vector((side * HR[0] * 0.42, HR[1] * 0.1, HR[2] * 0.82))
        if kid:
            M['head'].add(sphere(1.0, 6, 4, scale=(0.026 * K, 0.026 * K, 0.034 * K)).moved(base + Vector((0, 0, 0.0))), m['horn'])
        else:
            pts = bez([base, base + Vector((side * 0.03, -0.01, 0.08)), base + Vector((side * 0.05, 0.08, 0.12)),
                       base + Vector((side * 0.05, 0.17, 0.08))], 5)
            M['head'].add(tube(pts, [0.036, 0.031, 0.025, 0.017, 0.005], sides=5, cap=0.004), m['horn'])
    # neck filler so a nod never opens a gap
    M['head'].add(sphere(1.0, 8, 5, scale=tuple(a * K for a in (0.095, 0.12, 0.13))).moved(v(0, -0.27, zb + 0.07)), coat)

    # ---- legs: slim, jointed, with a pale cloven hoof; hind legs zig-zag, origin at the hip
    for name, x, y in (('leg_fl', -0.1, -0.19), ('leg_fr', 0.1, -0.19), ('leg_bl', -0.1, 0.27), ('leg_br', 0.1, 0.27)):
        back = y > 0
        ky = 0.02 if back else 0.0
        fy = 0.035 if back else 0.0
        pts = [v(x, y, hp + 0.05), v(x, y, hp - 0.05), v(x, y - ky, 0.56 * hp), v(x, y + fy * 0.4, 0.47 * hp),
               v(x, y + fy, 0.24 * hp), v(x, y + fy, 0.19 * hp)]
        M[name].add(tube(pts, [0.058 * K, 0.046 * K, 0.032 * K, 0.028 * K, 0.033 * K, 0.033 * K], sides=5 if kid else 6, cap=0.0), coat)
        if back:
            blob(M[name], coat, v(x * 0.9, y + 0.01, hp), (0.065, 0.1, 0.1), 8, 5)
        else:
            blob(M[name], coat, v(x * 0.75, y + 0.0, hp + 0.02), (0.055, 0.075, 0.08), 8, 5)
        for dx in (-1, 1):
            c0 = Vector((x * K + dx * 0.016 * K, (y + fy - 0.005) * K, 0.0))
            M[name].add(cyl(c0 + Vector((0, 0, 0.2 * hp * K)), c0, 0.019 * K, 0.025 * K, sides=5, cap=0.0), m['hoof'])
    # ---- tail: short, upturned
    tr = v(0, 0.35, zb + 0.06)
    pts = bez([tr, tr + v(0, 0.06, 0.0), tr + v(0, 0.1, 0.05), tr + v(0, 0.1, 0.13)], 4)
    M['tail'].add(tube(pts, [0.036 * K, 0.034 * K, 0.028 * K, 0.014 * K], sides=5, cap=0.01 * K), coat)
    return M


def build_shelter(g, m):
    Model, rbox, about = g['Model'], g['rbox'], g['about']
    RAD = math.radians
    model = Model('goat_shelter')
    P = model[None]
    P.add(rbox((.72, .64, .07), (0, 0, .035), n=8), m['wood'])
    P.add(rbox((.59, .52, .035), (0, 0, .087), n=8), m['hay'])
    P.add(rbox((.72, .055, .5), (0, .30, .25), n=8), m['wood_light'])                # back wall
    for side in (-1, 1):
        P.add(rbox((.055, .65, .27), (side * .34, 0, .135), n=8), m['wood_light'])  # low side boards
        P.add(rbox((.055, .055, .44), (side * .34, -.30, .22), n=8), m['wood'])    # front posts
    P.add(rbox((.82, .72, .05), (0, 0, .5), n=12), m['red'], about((0, 0, .5), (RAD(9), 0, 0)))
    P.add(rbox((.26, .26, .16), (-.12, -.05, .15), n=8), m['wood'])                # a climbing block
    return model


def install(g):
    for pid in ('goat', 'kid'):
        g['ANIMALS'].append(pid)
        g['PARTS'][pid] = g['HOOF_PARTS']
        k = 0.6 if pid == 'kid' else 1.0
        g['SIZE'][pid] = dict(h=0.85 if pid == 'goat' else 0.5, half=(0.24, 0.5) if pid == 'goat' else (0.2, 0.35))
        g['KIND'][pid] = 'animal'
        g['BUILDERS'][pid] = lambda m, pid=pid: build_goat(g, m, pid)
    g['PROPS'].append('goat_shelter')
    g['SIZE']['goat_shelter'] = dict(h=0.55, half=(0.43, 0.37))
    g['KIND']['goat_shelter'] = 'prop'
    g['BUILDERS']['goat_shelter'] = lambda m: build_shelter(g, m)
    g['FARM_IDS'] = g['ANIMALS'] + g['PROPS'] + g['PRODUCTS']
