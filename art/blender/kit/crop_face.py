"""Cute faces for ripe crops and fruit (build_nature.py crops, build_fruit_crops.py fruit trees).

A face is painted onto a finished mesh object as a few flat discs that hug the body's surface: two tall oval eyes
with a white sparkle, two pink blush ovals and a small smile, all facing the game camera (Blender -Y and up). Where
they go is found, not hand-placed: the body's polygons (picked by material) are grouped into connected islands, and
a ray from the camera's side finds the front of each island; every feature is then re-projected onto the surface so
it follows the curve. About 54 triangles a face, three shared materials (Crop face ink / shine / blush).

`leaf_hair` adds a two-leaf sprout on top of a body that has no leaves of its own (melons, candy, star fruit...).
"""
import math

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# The game camera looks down 51.5 degrees from the front; faces aim a little more frontal so icons read too.
VIEW = Vector((0.0, -0.86, 0.51)).normalized()
RIGHT = Vector((1.0, 0.0, 0.0))
EPS = 0.004
# Feature layout in units of the body's width w (right, up), sizes (half width, half height).
EYE = dict(dx=0.19, dy=0.07, rx=0.06, ry=0.085, n=8)
SHINE = dict(dx=-0.025, dy=0.035, r=0.026, n=5)
BLUSH = dict(dx=0.34, dy=-0.07, rx=0.075, ry=0.042, n=8)
MOUTH = dict(dy=-0.075, half=0.075, sag=0.035, thick=0.022, segs=6)


def _islands(bm, polys):
    """Connected groups (by shared vertices) of the given BMFaces."""
    todo, out, chosen = set(polys), [], set(polys)
    while todo:
        seed = todo.pop()
        group, stack = [seed], [seed]
        while stack:
            f = stack.pop()
            for v in f.verts:
                for g in v.link_faces:
                    if g in chosen and g in todo:
                        todo.discard(g)
                        group.append(g)
                        stack.append(g)
        out.append(group)
    return out


def _area(group):
    return sum(f.calc_area() for f in group)


def _bounds(group):
    vs = [v.co for f in group for v in f.verts]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


def _frame(normal, right_hint=RIGHT):
    n = normal.normalized()
    r = right_hint - n * n.dot(right_hint)
    if r.length < 1e-4:
        r = Vector((0.0, 1.0, 0.0)) - n * n.y
    r.normalize()
    return n, r, n.cross(r)


class _Out:
    """New geometry appended to the bmesh: flat fans and strips on given material slots."""

    def __init__(self, bm, slots):
        self.bm, self.slots, self.tris = bm, slots, 0

    def fan(self, centre, normal, right, rx, ry, n, slot, lift=EPS):
        _, r, u = _frame(normal, right)
        # keep the feature's own 'right' close to the face frame's right, so ovals stay upright on screen
        if r.dot(right) < 0:
            r = -r
            u = -u
        c = centre + normal.normalized() * lift
        mid = self.bm.verts.new(c)
        rim = [self.bm.verts.new(c + r * (math.cos(a) * rx) + u * (math.sin(a) * ry))
               for a in (i / n * math.tau for i in range(n))]
        for i in range(n):
            f = self.bm.faces.new((mid, rim[i], rim[(i + 1) % n]))
            f.material_index = self.slots[slot]
            f.smooth = False
        self.tris += n

    def strip(self, points, normals, half_width, slot, lift=EPS):
        rows = []
        for i, (p, nrm) in enumerate(zip(points, normals)):
            nxt = points[min(i + 1, len(points) - 1)]
            prv = points[max(i - 1, 0)]
            along = (nxt - prv).normalized()
            side = nrm.cross(along).normalized() * half_width
            c = p + nrm.normalized() * lift
            rows.append((self.bm.verts.new(c - side), self.bm.verts.new(c + side)))
        for (a0, a1), (b0, b1) in zip(rows, rows[1:]):
            for tri in ((a0, b0, b1), (a0, b1, a1)):
                f = self.bm.faces.new(tri)
                f.material_index = self.slots[slot]
                f.smooth = False
            self.tris += 2


def _slot(obj, material):
    mats = obj.data.materials
    for i, m in enumerate(mats):
        if m == material:
            return i
    mats.append(material)
    return len(mats) - 1


def add_faces(obj, body_names, mats, count=1, min_share=0.18, scale=1.0, view=VIEW, merge=False, sclera=False):
    """Paints up to `count` faces on the largest islands of the polygons whose material name is in `body_names`
    (islands smaller than `min_share` of the largest are skipped). `merge` treats every body polygon as one body
    (a bunch of leaves or petals: the face goes on the front of the whole clump). `mats` = dict(ink=, shine=, blush=).
    Returns the number of triangles added."""
    me = obj.data
    # Work in the object's own space: a joined mesh may keep its first part's turn (a fruit tree's trunk is turned 180°).
    to_local = obj.matrix_world.to_3x3().inverted()
    view = (to_local @ view).normalized()
    right_hint = (to_local @ RIGHT).normalized()
    names = [m.name if m else '' for m in me.materials]
    slots = {k: _slot(obj, m) for k, m in mats.items()}
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    body = [f for f in bm.faces if f.material_index < len(names) and names[f.material_index] in body_names]
    if not body:
        bm.free()
        raise RuntimeError(f'{obj.name}: no polygons with materials {sorted(body_names)}')
    if merge:
        groups = [body]
    else:
        groups = sorted(_islands(bm, body), key=_area, reverse=True)
        groups = [g for g in groups if _area(g) >= _area(groups[0]) * min_share][:count]
    out = _Out(bm, slots)
    for group in groups:
        verts = list({v for f in group for v in f.verts})
        index = {v: i for i, v in enumerate(verts)}
        tree = BVHTree.FromPolygons([v.co.copy() for v in verts], [[index[v] for v in f.verts] for f in group])
        lo, hi = _bounds(group)
        centre = (lo + hi) / 2
        w = min(hi.x - lo.x, max(hi.y - lo.y, hi.z - lo.z)) * scale
        reach = (hi - lo).length + 1.0

        def surface(point, direction):
            hit = tree.ray_cast(point + direction * reach, -direction, reach * 2)
            if hit[0] is None:
                return None, None
            # double-sided sheets (petals, leaves) may face away: the face always goes on the side we see
            return hit[0], (hit[1] if hit[1].dot(view) >= 0 else -hit[1])

        p, n = surface(centre, view)
        if p is None:  # an airy clump (a cherry bush): try round the centre until the camera's ray meets the body
            ext = hi - lo
            for fx, fz in ((0, .15), (0, -.15), (.15, 0), (-.15, 0), (0, .3), (0, -.3), (.25, .2), (-.25, .2)):
                p, n = surface(centre + Vector((ext.x * fx, 0, ext.z * fz)), view)
                if p is not None:
                    break
        if p is None:
            raise RuntimeError(f'{obj.name}: the camera never sees its body')
        if merge:
            # A clump (leaves, petals, cherries): the face looks straight at the camera and every feature sits on
            # the first surface the camera sees there, lifted toward it, so no leaf in front can hide it.
            n = view.copy()
        n, right, up = _frame(n, right_hint)

        def place(dx, dy):
            q = p + right * (dx * w) + up * (dy * w)
            s, sn = surface(q, n)
            if merge:
                return ((s if s is not None else q) + view * 0.012, view)
            return (s, sn) if s is not None else (q, n)

        for side in (-1, 1):
            e, en = place(EYE['dx'] * side, EYE['dy'])
            if sclera:  # dark bodies (coffee cherries): a white rim so the eyes read
                out.fan(e, en, right, EYE['rx'] * w * 1.45, EYE['ry'] * w * 1.3, EYE['n'], 'shine', lift=EPS * .5)
            out.fan(e, en, right, EYE['rx'] * w, EYE['ry'] * w, EYE['n'], 'ink', lift=EPS * 1.5 if sclera else EPS)
            s, sn = place(EYE['dx'] * side + SHINE['dx'], EYE['dy'] + SHINE['dy'])
            out.fan(s, sn, right, SHINE['r'] * w, SHINE['r'] * w, SHINE['n'], 'shine', lift=EPS * 2.5)
            b, bn = place(BLUSH['dx'] * side, BLUSH['dy'])
            out.fan(b, bn, right, BLUSH['rx'] * w, BLUSH['ry'] * w, BLUSH['n'], 'blush')
        pts, nrms = [], []
        for i in range(MOUTH['segs'] + 1):
            k = i / MOUTH['segs'] * 2 - 1
            m, mn = place(k * MOUTH['half'], MOUTH['dy'] - MOUTH['sag'] * (1 - k * k))
            pts.append(m)
            nrms.append(mn)
        out.strip(pts, nrms, MOUTH['thick'] * w / 2, 'ink')
    bm.to_mesh(me)
    bm.free()
    me.update()
    return out.tris


def leaf_hair(obj, body_names, leaf_mat, size=1.0):
    """Two small leaves sprouting from the top of the body's largest island, tipped outward like a cowlick."""
    me = obj.data
    names = [m.name if m else '' for m in me.materials]
    slot = _slot(obj, leaf_mat)
    bm = bmesh.new()
    bm.from_mesh(me)
    body = [f for f in bm.faces if f.material_index < len(names) and names[f.material_index] in body_names]
    group = max(_islands(bm, body), key=_area)
    lo, hi = _bounds(group)
    top = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z - 0.01))
    w = min(hi.x - lo.x, hi.y - lo.y) * size
    tris = 0
    for side in (-1, 1):
        base = top + Vector((side * 0.03 * w, 0, 0))
        tip = base + Vector((side * 0.42 * w, -0.05 * w, 0.32 * w))
        mid = base.lerp(tip, 0.5)
        wide = Vector((0, 0.13 * w, 0.03 * w))
        vs = [bm.verts.new(v) for v in (base, mid + wide, tip, mid - wide, mid + Vector((0, 0, 0.05 * w)))]
        for tri in ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2), (0, 2, 1)):
            f = bm.faces.new([vs[i] for i in tri])
            f.material_index = slot
            f.smooth = True
            tris += 1
    stem = [bm.verts.new(top + Vector((dx, dy, 0))) for dx, dy in ((-0.012, 0), (0.012, 0), (0, 0.012))]
    peak = bm.verts.new(top + Vector((0, 0, 0.08 * w)))
    for a, b in ((0, 1), (1, 2), (2, 0)):
        f = bm.faces.new((stem[a], stem[b], peak))
        f.material_index = slot
        tris += 1
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    return tris
