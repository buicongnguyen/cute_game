/**
 * The cottage interior plan: rooms, doorways, walls, furniture and where friends idle. Pure data and
 * geometry helpers (no Three.js), shared by the view (house-view.ts), the world hooks and the tests.
 *
 * The interior is a separate space drawn in its own scene at the same x/z as the village centre, so tap
 * picking, the ground plane (y = 0), navigation and the camera work unchanged. Explorers inside report
 * their pose height raised by INDOOR_Y; other clients use that to show them only to those inside too.
 *
 * Plan (x right, z toward the camera; the front door is on the camera side, z = 6.5):
 *
 *   z -7 +---------------+---------+----------------+
 *        |   bedroom     |  bath   |    study       |
 *   z -2 +----[ ]--------+--[ ]----+--[ ]--+--------+   (low cut-away wall with three doorways)
 *        |  kitchen |        living room   | craft  |
 *        |         [ ]                    [ ]       |
 *  z 6.5 +----------+--------[door]--------+--------+   (low cut-away front wall)
 *     x -10        -5                      5        10
 */
export interface Point { x: number; z: number }
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export type RoomId = 'living' | 'kitchen' | 'craft' | 'bedroom' | 'bath' | 'study';
export interface Room { id: RoomId; name: string; rect: Rect; floor: [string, string]; wall: string; pattern: 'planks' | 'tiles' }
export interface Wall {
  /** 'x': the wall runs along x at z = at; 'z': along z at x = at. */
  axis: 'x' | 'z'; at: number; from: number; to: number; height: number; gaps: Array<[number, number]>;
}
export interface Placement { kit: string; x: number; z: number; rot?: number; y?: number; scale?: number;
  /** Collision footprint (width along the piece's x, depth along its z); none for rugs and wall pieces. */
  block?: [number, number];
  /** Tappable: what it opens. */
  use?: 'door' | 'wardrobe' | 'mirror' }
export interface FriendSpot extends Point { facing: number; pose: 'sit' | 'stand' | 'wave'; y?: number }

export const INDOOR_Y = 40;
export const WALL = { thick: .2, full: 2.6, low: .55 } as const;
/** Clearance the explorer keeps from walls (navigation's default clearance for the explorer). */
export const CLEARANCE = .36;
export const HOUSE = {
  /** Camera zoom indoors (the outdoor default is 1): closer, so rooms read like a dollhouse; a little wider on landscape screens. */
  zoom: .8, wideZoom: .9,
  /** Where you stand after coming in, facing into the living room. */
  spawn: { x: 0, z: 5.2 } as Point,
  /** Inside the front door: tapping it or walking into it leaves. */
  door: { x: 0, z: 6.35 } as Point,
  /** The cottage (world.ts: home at (0, -8)) and the outdoor spot in front of its door. */
  cottage: { x: 0, z: -8 } as Point,
  outdoorDoor: { x: 0, z: -5.5 } as Point,
  outside: { x: 0, z: -4.3 } as Point,
  bounds: { x0: -10, x1: 10, z0: -7, z1: 6.5 } as Rect,
} as const;

export const ROOMS: Room[] = [
  { id: 'living', name: 'Living room', rect: { x0: -5, x1: 5, z0: -2, z1: 6.5 }, floor: ['#d7965a', '#c9874d'], wall: '#ffdcae', pattern: 'planks' },
  { id: 'kitchen', name: 'Kitchen', rect: { x0: -10, x1: -5, z0: -2, z1: 6.5 }, floor: ['#fff3dc', '#f0b9a0'], wall: '#b8ead2', pattern: 'tiles' },
  { id: 'craft', name: 'Craft room', rect: { x0: 5, x1: 10, z0: -2, z1: 6.5 }, floor: ['#e8b37b', '#dca46b'], wall: '#ffcadb', pattern: 'planks' },
  { id: 'bedroom', name: 'Bedroom', rect: { x0: -10, x1: -2, z0: -7, z1: -2 }, floor: ['#c68456', '#b9774b'], wall: '#d3c6ff', pattern: 'planks' },
  { id: 'bath', name: 'Bathroom', rect: { x0: -2, x1: 3, z0: -7, z1: -2 }, floor: ['#e4f6ff', '#a9dcf2'], wall: '#9fe0ee', pattern: 'tiles' },
  { id: 'study', name: 'Study', rect: { x0: 3, x1: 10, z0: -7, z1: -2 }, floor: ['#b9794a', '#ad6e40'], wall: '#fff0b2', pattern: 'planks' },
];
export const BIG_ROOM: RoomId = 'living';

/** Doorway gaps (1.6 m) between rooms, as [wall, gap]. */
export const WALLS: Wall[] = [
  { axis: 'x', at: -7, from: -10, to: 10, height: WALL.full, gaps: [] },
  { axis: 'x', at: 6.5, from: -10, to: 10, height: WALL.low, gaps: [[-.85, .85]] },
  { axis: 'x', at: -2, from: -10, to: 10, height: WALL.low, gaps: [[-4.6, -3], [-.3, 1.3], [3.2, 4.8]] },
  { axis: 'z', at: -10, from: -7, to: 6.5, height: WALL.full, gaps: [] },
  { axis: 'z', at: 10, from: -7, to: 6.5, height: WALL.full, gaps: [] },
  { axis: 'z', at: -5, from: -2, to: 6.5, height: WALL.full, gaps: [[3.9, 5.5]] },
  { axis: 'z', at: 5, from: -2, to: 6.5, height: WALL.full, gaps: [[3.9, 5.5]] },
  { axis: 'z', at: -2, from: -7, to: -2, height: WALL.full, gaps: [] },
  { axis: 'z', at: 3, from: -7, to: -2, height: WALL.full, gaps: [] },
];

const Q = Math.PI / 2;
/** Furniture; rot turns the piece's front (+z) toward: 0 = camera (+z), Q = +x, -Q = -x, PI = back wall. */
export const FURNITURE: Placement[] = [
  // Living room: fireplace corner with the sofa facing it, a dining table, shelves, plants and lamps.
  { kit: 'fireplace', x: -4.62, z: 1.7, rot: Q, block: [1.6, .6] },
  { kit: 'picture', x: -4.88, z: 3.75, rot: Q },
  { kit: 'rug_round', x: -1.9, z: -.1 },
  { kit: 'sofa', x: -1.9, z: -1.38, block: [2.0, .8] },
  { kit: 'coffee_table', x: -1.9, z: .05, block: [.85, .85] },
  { kit: 'floor_lamp', x: -.5, z: -1.5, block: [.4, .4] },
  { kit: 'armchair', x: -3.3, z: 4.4, rot: Math.PI * .75, block: [.9, .8] },
  { kit: 'plant_small', x: -4.7, z: -.9, block: [.3, .3] },
  { kit: 'rug_rect', x: 2.6, z: 1.0 },
  { kit: 'dining_table', x: 2.6, z: 1.0, block: [1.4, .9] },
  { kit: 'chair', x: 2.6, z: 1.85, rot: Math.PI, block: [.45, .45] },
  { kit: 'chair', x: 2.6, z: .15, block: [.45, .45] },
  { kit: 'bookshelf', x: 4.76, z: 1.6, rot: -Q, block: [1.2, .4] },
  { kit: 'plant_big', x: 4.4, z: 5.9, block: [.6, .6] },
  { kit: 'plant_big', x: -4.4, z: 5.9, block: [.6, .6] },
  { kit: 'plant_small', x: 2.3, z: -1.6, block: [.3, .3] },
  { kit: 'welcome_mat', x: 0, z: 5.75 },
  { kit: 'door_frame', x: 0, z: 6.5 },
  // Kitchen: counter, stove and fridge along the outer wall, a little round table.
  { kit: 'fridge', x: -9.58, z: -1.25, rot: Q, block: [.75, .7] },
  { kit: 'counter', x: -9.58, z: .7, rot: Q, block: [2.4, .65] },
  { kit: 'stove', x: -9.58, z: 2.4, rot: Q, block: [.8, .65] },
  { kit: 'window', x: -9.93, z: 4.4, rot: Q },
  { kit: 'round_table', x: -7.4, z: 3.0, block: [1, 1] },
  { kit: 'stool', x: -7.4, z: 4.0, block: [.4, .4] },
  { kit: 'stool', x: -6.45, z: 2.6, block: [.4, .4] },
  { kit: 'plant_small', x: -9.6, z: 5.9, block: [.3, .3] },
  // Craft room: workbench, easel, yarn and a shelf.
  { kit: 'workbench', x: 9.6, z: .3, rot: -Q, block: [1.6, .7] },
  { kit: 'upgrade_bench', x: 9.55, z: 2.6, rot: -Q, block: [1.2, .7] },
  { kit: 'window', x: 9.93, z: 2.4, rot: -Q },
  { kit: 'easel', x: 7.2, z: -.9, rot: .4, block: [.7, .6] },
  { kit: 'rug_rect', x: 7.5, z: 3.0, rot: Q, scale: .8 },
  { kit: 'yarn_basket', x: 8.6, z: 4.9, block: [.6, .6] },
  { kit: 'bookshelf', x: 9.76, z: 4.6, rot: -Q, block: [1.2, .4] },
  { kit: 'plant_big', x: 5.6, z: -1.35, block: [.6, .6] },
  // Bedroom: bed against the back wall, wardrobe and mirror (both open your own gear).
  { kit: 'rug_round', x: -6.4, z: -4.2, scale: .7 },
  { kit: 'bed', x: -7.0, z: -5.85, block: [1.4, 2.1] },
  { kit: 'nightstand', x: -8.15, z: -6.55, block: [.5, .45] },
  { kit: 'lamp_small', x: -8.15, z: -6.55, y: .52 },
  { kit: 'window', x: -5.2, z: -6.93 },
  { kit: 'wardrobe', x: -9.62, z: -3.6, rot: Q, block: [1.2, .6], use: 'wardrobe' },
  { kit: 'mirror', x: -2.35, z: -4.9, rot: -Q, block: [.6, .4], use: 'mirror' },
  { kit: 'plant_small', x: -9.6, z: -6.6, block: [.3, .3] },
  // Bathroom: tub with a duck, sink, towels.
  { kit: 'bathtub', x: -.75, z: -6.4, block: [1.75, .9] },
  { kit: 'duck', x: -.4, z: -6.35, y: .5 },
  { kit: 'sink', x: 2.35, z: -6.62, block: [.55, .5] },
  { kit: 'towel_rack', x: 2.72, z: -4.4, rot: -Q, block: [.7, .2] },
  { kit: 'window', x: 1.0, z: -6.93 },
  { kit: 'rug_rect', x: .5, z: -4.6, scale: .55 },
  // Study: desk under the window, books, globe, reading chair.
  { kit: 'rug_rect', x: 6.6, z: -4.5 },
  { kit: 'desk', x: 6.5, z: -6.55, block: [1.3, .65] },
  { kit: 'chair', x: 6.5, z: -5.7, rot: Math.PI, block: [.45, .45] },
  { kit: 'window', x: 8.6, z: -6.93 },
  { kit: 'bookshelf', x: 9.76, z: -4.4, rot: -Q, block: [1.2, .4] },
  { kit: 'globe', x: 3.8, z: -6.4, block: [.45, .45] },
  { kit: 'armchair', x: 8.2, z: -2.9, rot: Math.PI * 1.15, block: [.9, .8] },
  { kit: 'floor_lamp', x: 9.3, z: -6.45, block: [.45, .45] },
  // Activities (house-activities.ts): the trophy shelf, a radio on the dining table, the kettle, the diary on the study desk.
  { kit: 'trophy_shelf', x: 2.25, z: -1.9, y: -.695 },
  { kit: 'radio', x: 3.0, z: .85, y: .8, rot: -.3 },
  { kit: 'kettle', x: -9.5, z: .05, y: .92, rot: Q },
  { kit: 'books', x: 6.95, z: -6.5, y: .8, rot: .3 },
];

/** Friends in the big room: two on the sofa, one warming by the fire, one waving at the door, then more standing about. */
export const FRIEND_SPOTS: FriendSpot[] = [
  { x: -2.4, z: -1.32, facing: 0, pose: 'sit', y: .5 },
  { x: -1.4, z: -1.32, facing: 0, pose: 'sit', y: .5 },
  { x: -3.55, z: 2.85, facing: .5, pose: 'stand' },
  { x: 2.0, z: 3.9, facing: 0, pose: 'wave' },
  { x: 3.6, z: 3.2, facing: -.6, pose: 'stand' },
  { x: 1.0, z: 2.6, facing: .4, pose: 'stand' },
];

const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d });
const inside = (r: Rect, p: Point) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
/** Doorway passages through each wall gap (the front door is not one: walking into it leaves instead). */
export function doorwayRects(): Rect[] {
  const out: Rect[] = [], half = WALL.thick / 2 + CLEARANCE + .3;
  for (const wall of WALLS) for (const [a, b] of wall.gaps) {
    if (wall.axis === 'x' && wall.at === HOUSE.bounds.z1) continue;
    out.push(wall.axis === 'x' ? { x0: a + CLEARANCE, x1: b - CLEARANCE, z0: wall.at - half, z1: wall.at + half } : { x0: wall.at - half, x1: wall.at + half, z0: a + CLEARANCE, z1: b - CLEARANCE });
  }
  return out;
}
const WALK = [...ROOMS.map(r => inset(r.rect, WALL.thick / 2 + CLEARANCE)), ...doorwayRects()];
/** True where the explorer's centre may stand: inside a room (clear of its walls) or in a doorway. */
export function walkable(p: Point) { return WALK.some(r => inside(r, p)); }
export function roomAt(p: Point): Room | undefined { return ROOMS.find(r => inside(r.rect, p)); }

/** Circles covering a piece's footprint (navigation obstacles are circles). */
export function footprintCircles(p: Placement): Array<Point & { r: number }> {
  if (!p.block) return [];
  const s = p.scale ?? 1, [w, d] = [p.block[0] * s, p.block[1] * s], long = Math.max(w, d), short = Math.min(w, d), r = short / 2;
  const n = Math.max(1, Math.ceil(long / short)), along = w >= d ? 0 : Q, a = (p.rot ?? 0) + along, out: Array<Point & { r: number }> = [];
  // Along the long side: the piece's local x turned by rot (rotation.y = rot maps local x to (cos, -sin)).
  const ax = Math.cos(a), az = -Math.sin(a);
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : -long / 2 + r + (long - 2 * r) * i / (n - 1); out.push({ x: p.x + ax * t, z: p.z + az * t, r }); }
  return out;
}
export function furnitureObstacles() { return FURNITURE.flatMap(footprintCircles); }
export function useSpots() { return FURNITURE.filter(p => p.use); }
