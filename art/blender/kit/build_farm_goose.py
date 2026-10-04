"""The farm goose, its gosling and their shelter. install(g) is called by build_farm_expansion.py.

Original chunky toy goose: a plump white body with layered folded wings, a long S-curved neck (part of `head`, so
nodding never opens a gap), an orange bill with a knob, orange legs with webbed feet and an upturned tail.
Parts: BIRD_PARTS (body, head, wing_l, wing_r, leg_l, leg_r, tail), origins at their hinges, ground at z=0.
"""
import math


def build_goose(g, pid, m):
    Model, sphere, cyl, cone, tube, FM = (g[n] for n in ('Model', 'sphere', 'cyl', 'cone', 'tube', 'FM'))
    young = pid == 'gosling'
    sc = 0.6 if young else 1.0
    nk = 0.5 if young else 1.0  # neck length factor

    def v(x, y, z):
        return (x * sc, y * sc, z * sc)

    def blob(part, mat_, c, r, seg=10, rings=5):
        if young:
            seg, rings = max(6, round(seg * .8)), max(3, round(rings * .8))
        part.add(sphere(1, seg, rings, scale=tuple(a * sc for a in r)).moved(v(*c)), mat_)

    DZ = -0.07  # body, wings, tail and thighs sit lower so the neck can rise long and graceful

    def lo(part, mat_, c, r, seg=10, rings=5):
        blob(part, mat_, (c[0], c[1], c[2] + DZ), r, seg, rings)

    coat = FM('gosling' if young else 'goose', '#FFE27A' if young else '#FFFBF2')
    grey = FM('gosling grey', '#B9B2A2') if young else None
    wcol = grey if young else coat
    bill, leg = m['beak'], m['leg']
    hz = 0.5 + 0.29 * nk  # head height
    hy = -0.17 - 0.14 * nk
    piv = dict(body=v(0, 0.02, 0.34), head=v(0, -0.15, 0.46), wing_l=v(-0.2, 0.0, 0.42), wing_r=v(0.2, 0.0, 0.42),
               leg_l=v(-0.09, 0.0, 0.23), leg_r=v(0.09, 0.0, 0.23), tail=v(0, 0.3, 0.42))
    M = Model(pid, piv)
    B, Hd = M['body'], M['head']
    # Body: plump barrel, round breast, rising rump and belly.
    lo(B, coat, (0, 0.05, 0.37), (0.225, 0.34, 0.185), 14, 7)
    lo(B, coat, (0, -0.14, 0.39), (0.2, 0.18, 0.185), 10, 6)
    lo(B, coat, (0, 0.27, 0.43), (0.14, 0.16, 0.12), 8, 5)
    lo(B, coat, (0, 0.04, 0.26), (0.17, 0.27, 0.1), 8, 4)
    if young:
        lo(B, wcol, (0, 0.1, 0.46), (0.15, 0.25, 0.07), 8, 4)  # grey down over the back
    # Neck: an S-curve tube that starts inside the chest (so a nod never shows a gap), then the head.
    pts = [v(0, -0.07, 0.34), v(0, -0.2, 0.44 + 0.07 * nk), v(0, -0.19 - 0.1 * nk, 0.5 + 0.15 * nk),
           v(0, -0.2 - 0.12 * nk, 0.5 + 0.24 * nk), v(0, hy, hz - 0.02)]
    rad = [0.12, 0.075, 0.052, 0.046, 0.054] if not young else [0.13, 0.1, 0.085, 0.08, 0.08]
    Hd.add(tube(pts, [r * sc for r in rad], sides=7, cap=0.01), coat)
    blob(Hd, coat, (0, hy, hz), (0.075, 0.095, 0.075) if not young else (0.1, 0.11, 0.095), 12, 7)
    by = hy - (0.09 if not young else 0.1)
    bz = hz - 0.015
    # Bill: tapered upper and lower mandible, a knob at the base (adult), nostril dots.
    bl = 1 if not young else 0.8
    Hd.add(cone(v(0, by + 0.03, bz), v(0, by - 0.1 * bl, bz - 0.012), 0.045 * sc, sides=7), bill)
    Hd.add(cone(v(0, by + 0.03, bz - 0.022), v(0, by - 0.08 * bl, bz - 0.026), 0.036 * sc, sides=6), bill)
    if not young:
        blob(Hd, bill, (0, by + 0.035, bz + 0.036), (0.026, 0.034, 0.024), 6, 4)
    for side in (-1, 1):
        blob(Hd, m['eye'], (side * 0.028, by - 0.02, bz + 0.014), (0.007, 0.012, 0.006), 4, 3)
        ex = side * (0.062 if not young else 0.088)
        ez = hz + (0.022 if not young else 0.018)
        blob(Hd, m['eye'], (ex, hy - 0.035, ez), (0.021, 0.021, 0.027) if not young else (0.027, 0.027, 0.033), 8, 5)
        blob(Hd, m['glint'], (ex * 1.05, hy - 0.052, ez + 0.012), (0.007, 0.007, 0.008), 5, 3)
        blob(Hd, m['blush'], (side * (0.07 if not young else .094), hy - 0.045, hz - 0.03), (0.02, 0.009, 0.012), 5, 3)
        # Wings: shoulder, overlapping feather layers and a pointed tip, tucked along the flank.
        W = M['wing_l' if side < 0 else 'wing_r']
        lo(W, wcol, (side * 0.2, -0.02, 0.43), (0.055, 0.17, 0.13), 8, 5)
        lo(W, wcol, (side * 0.205, 0.1, 0.42), (0.05, 0.17, 0.11), 8, 4)
        lo(W, wcol, (side * 0.2, 0.2, 0.43), (0.045, 0.14, 0.08), 6, 4)
        W.add(cone(v(side * 0.2, 0.28, 0.44), v(side * 0.185, 0.45, 0.46), 0.05 * sc, 5), wcol)
        for yy, zz in ((0.06, 0.33), (0.17, 0.34)):
            lo(W, wcol, (side * 0.214, yy, zz), (0.034, 0.12, 0.034), 6, 3)
        # Legs: feathered thigh, orange shank, three toes joined by a web.
        L = M['leg_l' if side < 0 else 'leg_r']
        x = side * 0.09
        lo(L, coat, (x * 1.1, 0.0, 0.25), (0.07, 0.1, 0.065), 6, 4)
        L.add(cyl(v(x, 0, 0.24), v(x, -0.005, 0.04), 0.03 * sc, 0.022 * sc, sides=6), leg)
        blob(L, leg, (x, -0.005, 0.04), (0.03, 0.03, 0.025), 5, 3)
        for ang in (-0.5, 0, 0.5):
            tx, ty = x + math.sin(ang) * 0.12, -0.005 - math.cos(ang) * 0.12
            L.add(cyl(v(x, -0.005, 0.034), v(tx, ty, 0.018), 0.014 * sc, 0.01 * sc, sides=4), leg)
            blob(L, leg, (tx, ty, 0.018), (0.017, 0.018, 0.013), 4, 3)
        blob(L, leg, (x, -0.075, 0.012), (0.085, 0.085, 0.009), 7, 3)  # web
    # Tail: a short upturned fan of three feathers on a rounded base.
    T = M['tail']
    lo(T, wcol, (0, 0.34, 0.45), (0.09, 0.12, 0.09), 8, 4)
    for k in (-1, 0, 1):
        T.add(cone(v(k * 0.03, 0.36, 0.43), v(k * 0.065, 0.51 if not young else .48, 0.57 - abs(k) * 0.03), 0.055 * sc, 5), wcol)
    return M


def build_shelter(g, m):
    Model, rbox = g['Model'], g['rbox']
    M = Model('goose_shelter')
    P = M[None]
    P.add(rbox((.72, .64, .07), (0, 0, .035), n=8), m['wood'])
    P.add(rbox((.59, .52, .035), (0, 0, .087), n=8), m['hay'])
    for side in (-1, 1):
        P.add(rbox((.055, .6, .26), (side * .33, 0, .2), n=6), m['wood_light'])
    P.add(rbox((.7, .055, .26), (0, .29, .2), n=6), m['wood_light'])
    P.add(rbox((.2, .055, .14), (-.25, -.29, .15), n=6), m['wood_light'])
    P.add(rbox((.2, .055, .14), (.25, -.29, .15), n=6), m['wood_light'])
    # A round thatched cone roof, and a small water bowl at the door.
    cone = g['cone']
    P.add(cone((0, 0, .32), (0, 0, .58), .43, sides=12), m['thatch'])
    P.add(g['sphere'](1, 8, 4, scale=(.2, .2, .07)).moved((0, 0, .5)), m['thatch_dark'])  # thatch tuft on top
    P.add(g['sphere'](1, 8, 4, scale=(.1, .08, .03)).moved((0, -.4, .035)), m['water'])
    return M


def install(g):
    for pid in ('goose', 'gosling'):
        sc = 0.6 if pid == 'gosling' else 1.0
        g['ANIMALS'].append(pid)
        g['PARTS'][pid] = g['BIRD_PARTS']
        g['SIZE'][pid] = dict(h=(0.46 if sc < 1 else 0.85), half=(0.26 * sc, 0.5 * sc))
        g['KIND'][pid] = 'animal'
        g['BUILDERS'][pid] = lambda m, pid=pid: build_goose(g, pid, m)
    g['PROPS'].append('goose_shelter')
    g['SIZE']['goose_shelter'] = dict(h=0.58, half=(0.42, 0.42))
    g['KIND']['goose_shelter'] = 'prop'
    g['BUILDERS']['goose_shelter'] = lambda m: build_shelter(g, m)
    g['FARM_IDS'] = g['ANIMALS'] + g['PROPS'] + g['PRODUCTS']
