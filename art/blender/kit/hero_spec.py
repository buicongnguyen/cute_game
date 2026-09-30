"""The explorer's body: named parts, pivots and envelope shared by every gear generator.

Blender coordinates: Z up, the explorer faces -Y. glTF/three.js: Y up, faces +Z,
so Blender (x, y, z) becomes three.js (x, z, -y). Units are metres.

Gear (hats, outfits, boots, weapons, disguises) is modelled in THIS space, as it
would sit on the explorer standing at rest with arms hanging straight down. The
game parents each piece to the part named by its `@part` tag and keeps it in
place, so a hat follows the head and a sword follows the right arm.
"""
import math

# Part pivots (object origins) in Blender space.
PIVOTS = {
    'body': (0.0, 0.0, 0.85),        # torso centre
    'head': (0.0, 0.0, 1.12),        # neck: the head turns and bobs about this point
    'arm-left': (-0.37, 0.02, 1.08),  # shoulders; the arms hang straight down (-Z) at rest
    'arm-right': (0.37, 0.02, 1.08),
    'leg-left': (-0.18, 0.0, 0.52),   # hips
    'leg-right': (0.18, 0.0, 0.52),
}
# Empties inside the arms where the hands close. Weapons are held here.
HANDS = {'hand-left': (-0.37, -0.05, 0.72), 'hand-right': (0.37, -0.05, 0.72)}

# The envelope gear must fit around (surfaces, not pivots).
HEAD_CENTRE = (0.0, 0.0, 1.59)
HEAD_RADIUS = 0.59            # skin
HAIR_RADIUS = 0.62            # hair cap; a hat's inner surface stays >= 0.63 from HEAD_CENTRE
HAT_SEAT_Z = 1.86             # where a brim or band rests on the hair
TORSO = {'bottom_z': 0.525, 'top_z': 1.175, 'bottom_radius': 0.42, 'top_radius': 0.32}
BACKPACK = {'centre': (0.0, 0.34, 0.9), 'size': (0.4, 0.22, 0.44)}   # behind the torso (+Y is the back)
ARM = {'radius_top': 0.12, 'radius_bottom': 0.10, 'length': 0.30, 'hand_radius': 0.14}
LEG = {'radius': 0.10, 'foot_radius': 0.17, 'foot_centre_z': 0.16, 'foot_forward': -0.08}
SPROUT_TOP_Z = 2.35           # the leaf sprout on the head; hats may hide it
HEIGHT = 2.35


def hand_world(name='hand-right'):
    return HANDS[name]


def build_proxy_hero(api, collection=None):
    """A grey stand-in with the exact envelope, for fitting and previews.

    `api` is the style module (it provides mat, sphere, cyl, box). Returns the objects created.
    """
    grey = api.mat('Proxy skin', '#E8C9A0', 0.7)
    shirt = api.mat('Proxy shirt', '#6FA8DC', 0.7)
    hair = api.mat('Proxy hair', '#6B4F3A', 0.7)
    parts = [
        api.sphere('proxy head', HEAD_RADIUS, HEAD_CENTRE, grey, 24, 16, collection=collection),
        api.sphere('proxy hair', HAIR_RADIUS, (0, 0.05, 1.79), hair, 24, 16, scale=(1, 1, 0.62), collection=collection),
        api.cyl('proxy torso', TORSO['bottom_radius'], TORSO['top_z'] - TORSO['bottom_z'], (0, 0, (TORSO['top_z'] + TORSO['bottom_z']) / 2),
                shirt, 24, 0.02, radius_top=TORSO['top_radius'], collection=collection),
        api.box('proxy backpack', BACKPACK['size'][::1], BACKPACK['centre'], shirt, 0.05, collection=collection),
    ]
    for side in (-1, 1):
        x = 0.37 * side
        parts.append(api.cyl(f'proxy arm {side}', ARM['radius_top'], ARM['length'], (x, 0.02, 1.08 - ARM['length'] / 2), shirt, 12, 0.02,
                             radius_top=ARM['radius_bottom'], collection=collection))
        parts.append(api.sphere(f'proxy hand {side}', ARM['hand_radius'], (x, -0.02, 0.75), grey, 12, 8, collection=collection))
        parts.append(api.cyl(f'proxy leg {side}', LEG['radius'], 0.35, (0.18 * side, 0, 0.35), grey, 12, 0.02, collection=collection))
        parts.append(api.sphere(f'proxy foot {side}', LEG['foot_radius'], (0.18 * side, LEG['foot_forward'], LEG['foot_centre_z']), hair, 12, 8,
                                collection=collection))
    return parts


def degrees(value):
    return math.radians(value)
