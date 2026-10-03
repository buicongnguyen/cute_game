"""The garden guard dog: an original chibi puppy cousin of the wilds' wolf (build_creatures.py).

It keeps the wolf's read (pointed upright ears with pink insides, a cheek ruff, a muzzle and a bushy tail) but is
round and friendly: a big head on a short barrel body, the pets' big chibi eyes and blush, stubby legs with pale
paws, a curled fluffy tail and a sky-blue collar with a gold tag. Called by build_farm_expansion.py; it keeps the
farm animal contract (root `dog`, parts body/head/leg_fl/leg_fr/leg_bl/leg_br/tail with origins at their hinges,
<= 1,500 triangles). Three coat materials let the game recolour it per breed: `Farm dog` (coat), `Farm dog ear`
(a darker shade of the coat) and `Farm dog light` (muzzle, chest, ruff, paws, tail tip: the breed's second colour).
"""
from mathutils import Vector

from build_weapons import torus, xf, RAD  # noqa: E402

K = 0.86  # the whole puppy, so the head-to-body ratio stays chibi at any size


def build_dog(g, m):
    Model, sphere, cyl, cone, tube, bez, FM = (g[n] for n in ('Model', 'sphere', 'cyl', 'cone', 'tube', 'bez', 'FM'))
    eye_pair, blush_pair, smile = g['eye_pair'], g['blush_pair'], g['smile']
    coat, ear, light = FM('dog', '#E8A25A'), FM('dog ear', '#B8743A'), FM('dog light', '#FFF1D8')
    collar = FM('collar', '#3FA9F5', 0.4)

    def v(x, y, z):
        return Vector((x * K, y * K, z * K))

    def blob(part, mat_, c, r, segs=10, rings=6):
        part.add(sphere(1.0, segs, rings, scale=tuple(a * K for a in r)).moved(c), mat_)

    hip = 0.21
    piv = dict(body=v(0, 0.03, 0.33), head=v(0, -0.23, 0.47),
               leg_fl=v(-0.12, -0.17, hip), leg_fr=v(0.12, -0.17, hip), leg_bl=v(-0.12, 0.2, hip), leg_br=v(0.12, 0.2, hip),
               tail=v(0, 0.27, 0.41))
    M = Model('dog', piv)
    # Body: a short round barrel with a pale chest and belly, the collar at the neck.
    blob(M["body"], coat, v(0, 0.03, 0.33), (0.2, 0.26, 0.18), 10, 6)
    blob(M['body'], light, v(0, -0.15, 0.3), (0.14, 0.1, 0.14), 8, 5)
    blob(M['body'], light, v(0, 0.03, 0.22), (0.13, 0.18, 0.07), 8, 4)
    ring = torus(0.115 * K, 0.026 * K, segs=14, sides=5)
    M['body'].add(ring, collar, xf(v(0, -0.21, 0.45), (RAD(62), 0, 0)))
    blob(M['body'], m['bell'], v(0, -0.29, 0.37), (0.035, 0.018, 0.04), 8, 4)
    # Head: big and round (about 0.85 of the body's width), a cheek ruff like the wolf's, a short pale muzzle.
    H, HR = v(0, -0.34, 0.62), tuple(a * K for a in (0.24, 0.21, 0.21))
    M['head'].add(sphere(1.0, 12, 8, scale=HR).moved(H), coat)
    MZ, MR = H + v(0, -0.17, -0.07), tuple(a * K for a in (0.12, 0.09, 0.08))
    M['head'].add(sphere(1.0, 10, 6, scale=MR).moved(MZ), light)
    for side in (-1, 1):
        # Cheek ruff: two soft pale tufts per side (the wolf's ruff, rounded off).
        blob(M['head'], light, H + v(side * 0.15, -0.05, -0.12), (0.08, 0.07, 0.07), 6, 4)
        # Upright ears with pink insides, tips leaning out a little.
        base, tip = H + v(side * 0.13, 0.03, 0.13), H + v(side * 0.19, 0.05, 0.31)
        M['head'].add(cone(base, tip, 0.1 * K, sides=6), ear)
        M['head'].add(cone(base + v(0, -0.06, 0.03), tip + v(-side * 0.015, -0.045, -0.06), 0.06 * K, sides=5), m['blush'])
    nose = MZ + v(0, -0.075, 0.045)
    blob(M['head'], m['eye'], nose, (0.045, 0.032, 0.032), 8, 4)
    blob(M['head'], m['glint'], nose + v(-0.012, -0.022, 0.016), (0.012, 0.008, 0.008), 6, 3)
    # smile(M['head'], MZ, MR, (0, -0.85, -0.5), 0.06 * K, 0.009 * K, m['eye'])
    blob(M['head'], m['blush'], MZ + v(0, -0.06, -0.06), (0.03, 0.02, 0.025), 6, 3)  # tongue peeking out
    eye_pair(M['head'], H, HR, (0.36, -0.86, 0.2), 0.056 * K, m, squash=1.3)
    blush_pair(M['head'], H, HR, (0.66, -0.66, -0.12), 0.042 * K, m)
    blob(M['head'], coat, H + v(0, 0.02, 0.2), (0.07, 0.06, 0.05), 6, 4)  # a tuft on top
    # Neck filler so a nod never opens a gap (part of the head).
    blob(M['head'], coat, v(0, -0.24, 0.47), (0.12, 0.11, 0.12), 6, 4)
    # Stubby legs into round pale paws, origin at the hip.
    for name, x, y in (('leg_fl', -0.12, -0.17), ('leg_fr', 0.12, -0.17), ('leg_bl', -0.12, 0.2), ('leg_br', 0.12, 0.2)):
        M[name].add(cyl(v(x, y, hip + 0.04), v(x, y, 0.07), 0.066 * K, 0.06 * K, sides=6), coat)
        blob(M[name], light, v(x, y - 0.015, 0.045), (0.072, 0.085, 0.05), 6, 4)
    # Tail: a fluffy curl up over the back with a pale tip (the wolf's brush, made round).
    tr = v(0, 0.27, 0.41)
    pts = bez([tr, tr + v(0, 0.12, 0.08), tr + v(0, 0.1, 0.24), tr + v(0, 0.0, 0.27)], 5)
    M['tail'].add(tube(pts, [0.055 * K, 0.075 * K, 0.08 * K, 0.07 * K, 0.05 * K], sides=6, cap=0.02 * K), coat)
    blob(M['tail'], light, pts[-1] + v(0, -0.02, 0.0), (0.055, 0.06, 0.05), 8, 4)
    return M


def install(g):
    """Swaps the puppy in for the old stand-in dog and sets its size for the contract checks."""
    g['BUILDERS']['dog'] = lambda m: build_dog(g, m)
    g['SIZE']['dog'] = dict(h=0.8, half=(0.25, 0.48))
