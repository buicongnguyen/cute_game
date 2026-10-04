"""The garden guard dog: an original chibi puppy cousin of the wilds' wolf (build_creatures.py).

It keeps the wolf's read (pointed upright ears with pink insides, a cheek ruff, a muzzle and a bushy tail) but is
round and friendly: a big head on a short barrel body, the pets' big chibi eyes and blush, stubby legs with pale
paws, a curled fluffy tail and a sky-blue collar with a gold tag. Called by build_farm_expansion.py; it keeps the
farm animal contract (root `dog`, parts body/head/leg_fl/leg_fr/leg_bl/leg_br/tail with origins at their hinges,
<= 2,600 triangles). Three coat materials let the game recolour it per breed: `Farm dog` (coat), `Farm dog ear`
(a darker shade of the coat) and `Farm dog light` (muzzle, chest, ruff, paws, tail tip: the breed's second colour).
"""
import math

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
    # Body: a round barrel with a pale chest and belly, haunch bulges, the collar at the neck.
    blob(M["body"], coat, v(0, 0.03, 0.33), (0.2, 0.26, 0.18), 12, 7)
    blob(M['body'], light, v(0, -0.15, 0.3), (0.14, 0.1, 0.14), 9, 5)
    blob(M['body'], light, v(0, 0.03, 0.22), (0.13, 0.18, 0.07), 9, 4)
    for side in (-1, 1):
        blob(M['body'], coat, v(side * 0.15, 0.17, 0.29), (0.07, 0.1, 0.1), 7, 4)  # haunch
    ring = torus(0.115 * K, 0.026 * K, segs=12, sides=4)
    M['body'].add(ring, collar, xf(v(0, -0.21, 0.45), (RAD(62), 0, 0)))
    M['body'].add(sphere(1.0, 8, 4, scale=tuple(a * K for a in (0.022, 0.012, 0.026))).moved(v(0, -0.275, 0.375)), m['bell'])  # tag
    # Chest tuft: three pale fur points hanging off the front of the chest.
    for dx, dz, ln in ((-0.04, 0.0, 0.09), (0.04, 0.0, 0.09)):
        M['body'].add(cone(v(dx, -0.2, 0.36 + dz), v(dx * 1.3, -0.235, 0.36 + dz - ln), 0.04 * K, sides=5), light)
    # Head: big and round, a cheek ruff, a muzzle with a nose bridge, jaw and tongue.
    H, HR = v(0, -0.34, 0.62), tuple(a * K for a in (0.24, 0.21, 0.21))
    M['head'].add(sphere(1.0, 14, 8, scale=HR).moved(H), coat)
    MZ, MR = H + v(0, -0.17, -0.07), tuple(a * K for a in (0.12, 0.09, 0.08))
    M['head'].add(sphere(1.0, 9, 6, scale=MR).moved(MZ), light)
    blob(M['head'], light, MZ + v(0, 0.03, -0.045), (0.085, 0.09, 0.04), 6, 3)  # lower jaw
    blob(M['head'], coat, MZ + v(0, 0.0, 0.05), (0.06, 0.09, 0.04), 6, 3)  # nose bridge
    for side in (-1, 1):
        # Cheek ruff: soft pale tufts per side with a fur point.
        blob(M['head'], light, H + v(side * 0.15, -0.05, -0.12), (0.08, 0.07, 0.07), 7, 4)
        M['head'].add(cone(H + v(side * 0.17, -0.02, -0.12), H + v(side * 0.235, 0.03, -0.17), 0.05 * K, sides=5), light)
        # Upright ears with pink insides and a folded-over tip leaning out.
        base, mid, tip = H + v(side * 0.13, 0.03, 0.12), H + v(side * 0.165, 0.04, 0.23), H + v(side * 0.2, 0.05, 0.315)
        M['head'].add(tube([base, mid, tip], [0.105 * K, 0.075 * K, 0.012 * K], sides=6, cap=0.01 * K), ear)
        M['head'].add(tube([base + v(0, -0.055, 0.03), mid + v(0, -0.05, 0.0), tip + v(-side * 0.012, -0.04, -0.04)], [0.06 * K, 0.042 * K, 0.008 * K], sides=5, cap=0.005), m['blush'])
        # Nostril and whisker dots.
        blob(M['head'], m['eye'], MZ + v(side * 0.03, -0.1, 0.05), (0.012, 0.01, 0.009), 4, 3)
        # Eyelid: a coat-coloured cap over the top of each eye.
        d = Vector((side * 0.36, -0.86, 0.2)).normalized()
        ep = H + Vector((d.x * HR[0], d.y * HR[1], d.z * HR[2]))
        M['head'].add(sphere(1.0, 6, 3, scale=(0.05 * K, 0.03 * K, 0.026 * K)).moved(ep + v(side * -0.003, -0.002, 0.05)), coat)
    nose = MZ + v(0, -0.075, 0.045)
    blob(M['head'], m['eye'], nose, (0.045, 0.032, 0.032), 8, 5)
    blob(M['head'], m['glint'], nose + v(-0.012, -0.022, 0.016), (0.012, 0.008, 0.008), 6, 3)
    blob(M['head'], m['blush'], MZ + v(0, -0.06, -0.075), (0.03, 0.022, 0.02), 6, 3)
    eye_pair(M['head'], H, HR, (0.36, -0.86, 0.2), 0.056 * K, m, squash=1.3, segs=7)
    blush_pair(M['head'], H, HR, (0.66, -0.66, -0.12), 0.042 * K, m)
    blob(M['head'], coat, H + v(0, 0.02, 0.2), (0.07, 0.06, 0.05), 7, 4)  # a tuft on top
    # Neck filler so a nod never opens a gap (part of the head).
    blob(M['head'], coat, v(0, -0.24, 0.47), (0.12, 0.11, 0.12), 7, 4)
    # Legs: a tapered limb with a knee/elbow bulge, a pale paw with three toes and tiny claws, origin at the hip.
    for name, x, y in (('leg_fl', -0.12, -0.17), ('leg_fr', 0.12, -0.17), ('leg_bl', -0.12, 0.2), ('leg_br', 0.12, 0.2)):
        back = y > 0
        pts = [v(x, y, hip + 0.05), v(x, y + (0.012 if back else 0.0), hip - 0.03), v(x, y - (0.006 if back else 0.0), 0.11), v(x, y, 0.07)]
        M[name].add(tube(pts, [0.074 * K, 0.064 * K, 0.052 * K, 0.056 * K], sides=6, cap=0.01), coat)
        if not back:
            blob(M[name], coat, v(x, y + 0.01, hip + 0.01), (0.07, 0.08, 0.08), 8, 5)  # shoulder
        if back:
            blob(M[name], coat, v(x * 1.05, y + 0.012, hip - 0.01), (0.075, 0.09, 0.08), 8, 5)  # thigh
        blob(M[name], light, v(x, y - 0.012, 0.042), (0.066, 0.08, 0.044), 7, 4)  # paw
        for i in (-1, 0, 1):
            tx, ty = x + i * 0.034, y - 0.075 + (0.012 if i == 0 else 0.0)
            blob(M[name], light, v(tx, ty, 0.03), (0.026, 0.03, 0.026), 5, 3)  # toe
    # Tail: a fluffy curl up over the back with feathered fur points and a pale tip.
    tr = v(0, 0.27, 0.41)
    pts = bez([tr, tr + v(0, 0.12, 0.08), tr + v(0, 0.1, 0.24), tr + v(0, 0.0, 0.27)], 5)
    n = len(pts)
    prof = [K * (0.05 + 0.032 * math.sin(math.pi * (t / (n - 1)) ** 0.8)) for t in range(n)]
    M['tail'].add(tube(pts, prof, sides=6, cap=0.02 * K), coat)
    blob(M['tail'], light, pts[-1] + v(0, -0.02, 0.0), (0.058, 0.064, 0.056), 9, 6)
    for i in [n // 2]:  # feathering
        M['tail'].add(cone(pts[i] + v(0, 0.045, 0.0), pts[i] + v(0, 0.085, -0.035), 0.03 * K, sides=5), ear)
        M['tail'].add(cone(pts[i] + v(0.03, 0.0, 0.0), pts[i] + v(0.06, 0.03, -0.04), 0.022 * K, sides=5), coat)
        M['tail'].add(cone(pts[i] + v(-0.03, 0.0, 0.0), pts[i] + v(-0.06, 0.03, -0.04), 0.022 * K, sides=5), coat)
    return M


def install(g):
    """Swaps the puppy in for the old stand-in dog and sets its size for the contract checks."""
    g['BUILDERS']['dog'] = lambda m: build_dog(g, m)
    g['SIZE']['dog'] = dict(h=0.8, half=(0.25, 0.48))
