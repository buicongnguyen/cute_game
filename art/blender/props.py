"""Small, texture-free village props. Blender coordinates: Z up, -Y front."""

import math

import bmesh
import bpy


def build_props(api):
    box = api["box"]
    ball = api["uvball"]
    cylinder = api["cylinder"]
    cone = api["cone"]
    material = api["material"]

    wood = material("Props · warm oak", "#90613E")
    edge = material("Props · honey endgrain", "#D8AA55")
    dark = material("Props · walnut", "#795441")
    cream = material("Props · warm canvas", "#F4DEB1")
    rust = material("Props · rose canvas", "#D698A5")
    sage = material("Props · teal canvas", "#7FACAA")
    metal = material("Props · blue iron", "#79979B")
    gold = material("Props · brass", "#E4B865")
    soil = material("Props · rich soil", "#705447")
    green = material("Props · leaf", "#79A765")
    red = material("Props · apple", "#E99473")
    yellow = material("Props · pear", "#EACF79")
    stone = material("Props · warm stone", "#B6B8AC")
    stone_light = material("Props · stone rim", "#D6D8CA")
    cyan = material("Props · crystal blue", "#7FD0DD")
    cyan_light = material("Props · crystal light", "#B4E6E7")
    cyan_dark = material("Props · crystal shade", "#68B4C9")

    def mesh(name, verts, faces, mats, indices=None):
        data = bpy.data.meshes.new(name + "Mesh")
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        for mat in mats:
            data.materials.append(mat)
        if indices:
            for polygon, index in zip(data.polygons, indices):
                polygon.material_index = index
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        return obj

    def basket(name, x, y, z, radius=.27, height=.22):
        # Closed, hollow ten-sided basket, without overlapping bottom surfaces.
        n = 10
        verts = []
        for r, zz in [(radius * .78, z), (radius, z + height),
                      (radius - .035, z + height),
                      (radius * .78 - .035, z + .045)]:
            for i in range(n):
                angle = 2 * math.pi * i / n
                verts.append((x + r * math.cos(angle),
                              y + r * math.sin(angle), zz))
        faces = []
        for ring in range(3):
            for i in range(n):
                j = (i + 1) % n
                faces.append((ring * n + i, ring * n + j,
                              (ring + 1) * n + j, (ring + 1) * n + i))
        faces.extend([tuple(reversed(range(n))), tuple(range(3 * n, 4 * n))])
        mesh(name, verts, faces, [wood, edge],
             [0] * n + [1] * n + [0] * n + [0, 0])
        # Discrete bindings read more clearly than a high-density woven texture.
        for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
            rib = box(name + " binding", (x + radius * .95 * math.cos(angle),
                      y + radius * .95 * math.sin(angle), z + height * .65),
                      (.035, .035, height * .66), edge, bevel=.01)
            rib.rotation_euler[2] = angle

    def canopy(name, stripe_a, stripe_b):
        # The awning curves over the depth of the stall; every stripe is watertight.
        profile = [(-1.0, 2.36), (-.79, 2.47), (-.41, 2.59),
                   (0.0, 2.65), (.41, 2.60), (.79, 2.48), (1.0, 2.38)]
        for k in range(8):
            left = -1.6 + .4 * k
            right = left + .4
            verts = [(xx, yy, zz - drop) for drop in (0, .025)
                     for xx in (left, right) for yy, zz in profile]
            m = len(profile)
            faces = []
            for i in range(m - 1):
                faces.append((i, i + 1, m + i + 1, m + i))
                faces.append((2 * m + i, 3 * m + i,
                              3 * m + i + 1, 2 * m + i + 1))
                faces.append((i, 2 * m + i, 2 * m + i + 1, i + 1))
                faces.append((m + i, m + i + 1, 3 * m + i + 1, 3 * m + i))
            faces.extend([(0, m, 3 * m, 2 * m),
                          (m - 1, 2 * m - 1, 4 * m - 1, 3 * m - 1)])
            stripe = stripe_a if k % 2 == 0 else stripe_b
            mesh(name + " curved stripe " + str(k), verts, faces, [stripe])
            # Shallow scalloped canvas tabs hanging along the front edge.
            outline = [(left, 2.37), (right, 2.37), (right, 2.21),
                       (right - .06, 2.17), (left + .2, 2.15),
                       (left + .06, 2.17), (left, 2.21)]
            v = [(xx, yy, zz) for yy in (-1.005, -.975) for xx, zz in outline]
            count = len(outline)
            f = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
            for i in range(count):
                j = (i + 1) % count
                f.append((i, j, count + j, count + i))
            mesh(name + " scalloped tab " + str(k), v, f, [stripe])

    def sword(name, x, y, z, scale=1.0):
        box(name + " blade", (x, y, z + .24 * scale),
            (.10 * scale, .055 * scale, .47 * scale), metal, bevel=.018)
        tip = cone(name + " tip", (x, y, z + .515 * scale),
                   .065 * scale, 0, .14 * scale, metal, vertices=4)
        tip.rotation_euler[2] = math.pi / 4
        box(name + " guard", (x, y, z - .015 * scale),
            (.29 * scale, .09 * scale, .065 * scale), gold, bevel=.018)
        box(name + " grip", (x, y, z - .13 * scale),
            (.075 * scale, .075 * scale, .2 * scale), dark, bevel=.012)
        ball(name + " pommel", (x, y, z - .25 * scale),
             (.063 * scale, .055 * scale, .055 * scale), gold, segments=8, rings=4)

    def shield(name, x, y, z, size=.4):
        outline = [(-.5, .52), (.5, .52), (.48, -.1), (.31, -.4),
                   (0, -.65), (-.31, -.4), (-.48, -.1)]
        verts = [(x + xx * size, yy, z + zz * size)
                 for yy in (y - .065, y + .035) for xx, zz in outline]
        count = len(outline)
        faces = [tuple(range(count)), tuple(reversed(range(count, 2 * count)))]
        faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count)
                     for i in range(count))
        mesh(name, verts, faces, [sage, gold], [0, 0] + [1] * count)
        box(name + " vertical boss", (x, y - .076, z),
            (.048, .025, size * .8), gold, bevel=.012)
        box(name + " horizontal boss", (x, y - .076, z + size * .09),
            (size * .7, .025, .048), gold, bevel=.012)

    def stall(name, gear=False):
        api["start_asset"](name)
        cloth = sage if gear else rust
        for x in (-1.34, 1.34):
            for y in (-.68, .69):
                box(name + " post", (x, y, 1.25), (.14, .14, 2.5), dark, bevel=.035)
                box(name + " post foot", (x, y, .09), (.21, .21, .18), edge, bevel=.025)
                ball(name + " post cap", (x, y, 2.49), (.13, .13, .10), edge,
                     segments=8, rings=4)
        for y in (-.68, .69):
            box(name + " canopy beam", (0, y, 2.35), (2.82, .13, .13), wood)
        box(name + " back brace", (0, .72, .47), (2.6, .11, .12), dark)
        for i in range(8):
            plank = box(name + " front plank", (-1.225 + i * .35, -.68, .56),
                        (.325, .10, .85), wood if i % 3 else edge, bevel=.025)
        for x in (-1.34, 1.34):
            for j in range(4):
                box(name + " end plank", (x, -.48 + j * .31, .56),
                    (.1, .285, .85), wood, bevel=.022)
        box(name + " counter edge", (0, -.74, .95), (2.91, .16, .12), dark, bevel=.025)
        for j in range(5):
            box(name + " counter plank", (0, -.65 + j * .3, 1.0),
                (2.95, .285, .10), edge, bevel=.025)
        for x in (-1.18, 1.18):
            for z in (.22, .84):
                stud = cylinder(name + " front pin", (x, -.742, z),
                                .026, .022, gold, vertices=8)
                stud.rotation_euler[0] = math.pi / 2
        canopy(name, cloth, cream)
        # Compact sign hangs on the left, leaving the shopkeeper and view open.
        box(name + " sign cord", (-1.14, -.84, 2.13), (.025, .025, .24), dark, bevel=.005)
        sign = cylinder(name + " sign", (-1.14, -.86, 1.91), .235, .085, edge, vertices=12)
        sign.rotation_euler[0] = math.pi / 2
        if gear:
            sword(name + " sign sword", -1.14, -.92, 1.88, .43)
            box(name + " gear rack", (.54, .32, 1.40), (1.13, .12, .12), dark)
            box(name + " rack upright", (.54, .35, 1.25), (.10, .10, .48), wood)
            sword(name + " bronze sword", .22, .24, 1.37, .85)
            sword(name + " silver sword", .79, .24, 1.41, .95)
            shield(name + " display shield", -.60, -.44, 1.26, .48)
            basket(name + " supply basket", 1.05, -.32, 1.06, .22, .19)
            for dx in (-.08, .04):
                box(name + " wrapped gear", (1.05 + dx, -.32, 1.28),
                    (.08, .12, .23), dark, bevel=.025)
                ball(name + " gear cap", (1.05 + dx, -.32, 1.42), (.08, .09, .05), gold,
                     segments=8, rings=4)
        else:
            ball(name + " apple sign", (-1.14, -.93, 1.91), (.12, .045, .11), red,
                 segments=10, rings=6)
            leaf = ball(name + " sign leaf", (-1.09, -.94, 2.02), (.07, .025, .035), green,
                        segments=8, rings=4)
            leaf.rotation_euler[1] = -.45
            for k, x in enumerate((-.94, -.30, .36, 1.0)):
                basket(name + " produce basket " + str(k), x, -.18, 1.06, .27, .22)
                for i, (dx, dy) in enumerate(((-.11, -.07), (.10, -.07), (0, .11), (0, 0))):
                    z = 1.28 + (.075 if i == 3 else 0)
                    fruit = yellow if k % 2 else red
                    ball(name + " fruit", (x + dx, -.18 + dy, z),
                         (.10, .10, .12 if k % 2 else .105), fruit, segments=8, rings=5)
                    box(name + " fruit stem", (x + dx, -.18 + dy, z + .11),
                        (.023, .023, .06), dark, bevel=.006)
        api["finish_asset"](name)

    stall("market-stall")
    stall("equipment-stall", gear=True)

    api["start_asset"]("garden-bed")
    box("Garden bed soil", (0, 0, .11), (1.88, 1.88, .20), soil, bevel=.035)
    for x in (-.98, .98):
        box("Garden long rim", (x, 0, .12), (.14, 2.1, .22), wood, bevel=.035)
        box("Garden long top edge", (x, 0, .235), (.14, 2.09, .01), edge, bevel=.005)
    for y in (-.98, .98):
        box("Garden short rim", (0, y, .12), (1.89, .14, .22), wood, bevel=.035)
        box("Garden short top edge", (0, y, .235), (1.89, .14, .01), edge, bevel=.005)
    for x in (-.95, .95):
        for y in (-.95, .95):
            cylinder("Garden corner peg", (x, y, .115), .07, .22, dark, vertices=8)
            cylinder("Garden peg end", (x, y, .232), .073, .015, edge, vertices=8)
    api["finish_asset"]("garden-bed")

    def crystal(name, x, y, base, radius, height, lean_x=0, lean_y=0):
        n = 6
        verts = []
        for r, zz, drift in ((radius * .80, base, 0),
                             (radius, base + height * .20, .2),
                             (radius * .77, base + height * .77, .77)):
            for i in range(n):
                angle = i * 2 * math.pi / n + .16
                verts.append((x + math.cos(angle) * r + lean_x * drift,
                              y + math.sin(angle) * r + lean_y * drift, zz))
        verts.append((x + lean_x, y + lean_y, base + height))
        faces = [tuple(reversed(range(n)))]
        indices = [2]
        for ring in range(2):
            for i in range(n):
                j = (i + 1) % n
                faces.append((ring * n + i, ring * n + j, (ring + 1) * n + j, (ring + 1) * n + i))
                indices.append((i + 1) % 3)
        for i in range(n):
            faces.append((2 * n + i, 2 * n + (i + 1) % n, 3 * n))
            indices.append((i + 1) % 3)
        mesh(name, verts, faces, [cyan, cyan_light, cyan_dark], indices)

    api["start_asset"]("wishing-crystal")
    cylinder("Crystal lower octagonal step", (0, 0, .115), 1.30, .23, stone, vertices=8)
    cylinder("Crystal bright step edge", (0, 0, .24), 1.19, .09, stone_light, vertices=8)
    cylinder("Crystal recessed dais", (0, 0, .355), 1.07, .18, stone, vertices=8)
    cylinder("Crystal brass inset", (0, 0, .456), .87, .028, gold, vertices=12)
    cylinder("Crystal inset stone", (0, 0, .483), .80, .036, dark, vertices=12)
    crystal("Heart crystal", 0, .12, .50, .39, 2.50, -.13, .01)
    crystal("Left crystal", -.45, -.11, .50, .26, 1.50, -.30, -.08)
    crystal("Right crystal", .45, .08, .50, .25, 1.73, .27, .01)
    crystal("Small front crystal", .19, -.45, .50, .20, .95, .10, -.16)
    # Eight inset gold marks decorate the stone without thin floating geometry.
    for i in range(8):
        angle = i * math.pi / 4
        mark = box("Crystal rim marker", (.98 * math.sin(angle), .98 * math.cos(angle), .456),
                   (.10, .15, .028), gold, bevel=.013)
        mark.rotation_euler[2] = -angle
    api["finish_asset"]("wishing-crystal")
