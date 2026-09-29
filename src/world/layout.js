import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { fbm2 } from '../core/noise.js';
import { CONFIG } from '../config.js';

/**
 * Site plan (world units = metres, y up). The authored 10 x 10 m plot spans -5..5 on x and z and sits in the
 * middle of the 100 x 100 m world. Positions of every diorama asset live here, plus H(x, z): the terrain height
 * function that everything samples. Inside the plot H is the original diorama terrain (lake basin, gentle
 * hills, flattened pad under the cabin); outside it blends into seeded rolling hills that run down to the
 * beaches of an island, surrounded by sea.
 * The world biome (forest density) and the scatter exclusion zones live here too.
 */
export const HALF = 5, WATER_Y = 0.0, BOTTOM = -1.5;
export const LAKE = { x: 1.45, z: 0.85 };
export const HOUSE = { x: 3.05, z: -3.4, w: 3.6, d: 2.9 }, PAD_H = 0.3;
export const CB = { FL: 0.34, R: 0.11, S: 0.19, XW: 1.69, ZW: 1.34, EAVE: 2.44, PITCH: 0.78 };
export const roofY = z => CB.EAVE + (CB.ZW + 0.11 - Math.abs(z)) * CB.PITCH;
export function houseRectDist(x, z) { const dx = Math.max(Math.abs(x - HOUSE.x) - HOUSE.w / 2, 0), dz = Math.max(Math.abs(z - HOUSE.z) - HOUSE.d / 2, 0); return Math.hypot(dx, dz); }
export const ROCK = { x: -3.75, z: 0.0 }, ROSE = { x: 1.72, z: -1.62 };
export const rockColliders = [];
export function inRocks(x, z, m = 0) { const dx = (x - ROCK.x) / (1.12 + m), dz = (z - ROCK.z) / (0.9 + m); return dx * dx + dz * dz < 1; }
export function inRose(x, z, r = 0.3) { return Math.hypot(x - ROSE.x, z - ROSE.z) < r; }
export function inSteps(x, z) { const lx = x - HOUSE.x, lz = z - HOUSE.z; return lx > 0.4 && lx < 1.5 && lz > CB.ZW && lz < CB.ZW + 0.7; }
/**
 * The cabin's bed (built in assets/cabin/cabin.js at these house-local coordinates): its footprint in world space,
 * the mattress top, where you sit on its open (west) side facing the room, and where your head lies on the pillow.
 * Sleeping in it: app/sleeping.js.
 */
export const BED = (() => {
  const fl = PAD_H + CB.FL, x0 = HOUSE.x + 0.6, x1 = HOUSE.x + 1.56, z0 = HOUSE.z - 1.2, z1 = HOUSE.z + 0.52, top = fl + 0.53;
  return { x0, x1, z0, z1, top, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, floor: fl,
    edge: { x: x0 + 0.14, z: HOUSE.z - 0.2, fx: -1, fz: 0, top },          // sitting on the side, facing the room
    pillow: { x: (x0 + x1) / 2, z: z0 + 0.36, y: top + 0.14 } };          // the lying eye, head on the pillow
})();
/**
 * Storage chests (meshes: assets/cabin/chest.js; using them: app/chestUI.js). Each keeps its own contents. (x, z): the
 * middle of its base; rot: the turn about y that points its front (the lid's open side, local +z) where it faces;
 * length along its front, depth, height.
 */
/**
 * The keepsake shelves on the cabin's back wall, above the nightstand and the bed's head (app/shelf.js): two boards (x0
 * to x1, top y), `d` deep against the wall (middle z); the lower one runs under the wall clock, the upper one only east
 * of it. places: where each keepsake goes (board, x along it; ry its turn, rx a tilt, s a scale): flat ones under the
 * clock, the horseshoe hung on the wall above the upper board (board 2: y is its middle), points up for luck.
 */
export const SHELF = (() => {
  const x = HOUSE.x, y = PAD_H + CB.FL, z = HOUSE.z - CB.ZW + CB.R + 0.075;
  const boards = [{ x0: x + 0.08, x1: x + 1.52, y: y + 1.2 }, { x0: x + 0.52, x1: x + 1.52, y: y + 1.5 }];
  const P = (b, lx, ry = 0, o = {}) => ({ b, x: x + lx, ry, ...o });
  return {
    z, d: 0.15, boards,
    places: {
      goldCoins: P(0, 0.18, 0.3), compass: P(0, 0.31, 0.5), pocketWatch: P(0, 0.43, -0.4),
      goldenFish: P(0, 0.62, 0.25, { s: 1.15 }), oldPhotograph: P(0, 0.8, 0.12), shipBottle: P(0, 1.02, 0), geode: P(0, 1.25, 0.5), rareShell: P(0, 1.42, -0.6, { s: 1.15 }),
      spyglass: P(1, 0.7, 0.12), ammonite: P(1, 0.93, 0.4), antler: P(1, 1.12, 0.3), birdNest: P(1, 1.32, 0), glassFloat: P(1, 1.46, 0),
      horseshoe: P(2, 1.0, 0, { rx: -Math.PI / 2 }),
    },
  };
})();
export const CHESTS = [
  { id: 'cabin', x: HOUSE.x - 0.45, z: HOUSE.z - CB.ZW - 0.11 - 0.26 - 0.25, rot: Math.PI, length: 0.86, depth: 0.5, height: 0.52 },   // under the back window (house x -0.9..0), facing away from the wall; 0.26 m out so the open lid (0.20 m behind its hinge) clears the logs
];
/** Distance to the nearest chest's footprint (< 0 under it): the grass and flowers keep out of it. */
export function chestDist(x, z) {
  let d = Infinity;
  for (const C of CHESTS) {
    const dx = x - C.x, dz = z - C.z, c = Math.cos(C.rot), s = Math.sin(C.rot), a = Math.abs(dx * c - dz * s) - C.length / 2, f = Math.abs(dx * s + dz * c) - C.depth / 2;
    d = Math.min(d, Math.max(a, f) < 0 ? Math.max(a, f) : Math.hypot(Math.max(a, 0), Math.max(f, 0)));
  }
  return d;
}
export const CON = { x: -3.0, z: -2.55 };
export const APP = { x: -2.35, z: 2.45 };
export function lakeR(a) { return 1.85 + 0.3 * Math.sin(3 * a + 1.0) + 0.17 * Math.sin(5 * a + 2.3) + 0.09 * Math.sin(7 * a + 0.4); }
export function lakeD(x, z) { const dx = x - LAKE.x, dz = z - LAKE.z; return Math.hypot(dx, dz) / lakeR(Math.atan2(dz, dx)); }
export function dioramaH(x, z) {
  const d = lakeD(x, z);
  let h = 0.035 + 0.08 * fbm2(x * 0.28 + 3.1, z * 0.28 - 1.7) * smooth(0.9, 1.6, d) + 0.02 * fbm2(x * 1.6 + 9, z * 1.6 - 4, 3) + 0.28 * smooth(0.95, 2.2, d) + 0.08 * smooth(2.2, 4.5, d) * (0.5 + fbm2(x * 0.5, z * 0.5));
  h += 0.08 * Math.exp(-((x - CON.x) ** 2 + (z - CON.z) ** 2) / 3.0) + 0.05 * Math.exp(-((x - APP.x) ** 2 + (z - APP.z) ** 2) / 2.5);
  const s = smooth(1.12, 0.45, d);
  const hh = h * (1 - s) - 0.52 * s + 0.03 * s * fbm2(x * 2.0, z * 2.0, 2);
  const kf = 1 - smooth(0.05, 0.9, houseRectDist(x, z));
  return hh * (1 - kf) + PAD_H * kf;
}

/* ---- the 100 x 100 m world around the plot ---- */
const WC = CONFIG.world, TC = CONFIG.terrain, SC = CONFIG.scatter, IC = CONFIG.island;
export const WORLD_HALF = WC.size / 2, SEA_Y = IC.seaLevel;
/** The tide (#68; world/tide.js): TIDE.y the sea's rise above its mean level SEA_Y now; seaY() the level itself. SEA_Y stays for what
 *  was placed once (the beach, shells, the stream's mouth); what floats, wades or splashes asks seaY(). */
export const TIDE = { y: 0 };
export const seaY = () => SEA_Y + TIDE.y;
// seed -> noise-space offsets (the value noise itself is unseeded, so the seed moves the sample window)
const SX = (WC.seed * 12.9898) % 911 + 37.1, SZ = (WC.seed * 78.233) % 877 - 51.7;
/** Distance outside the square that keeps the exact diorama terrain (0 inside it). */
export function coreDist(x, z) { return Math.hypot(Math.max(Math.abs(x) - WC.coreHalf, 0), Math.max(Math.abs(z) - WC.coreHalf, 0)); }
/** Distance from (x, z) to the shoreline: > 0 on land, < 0 at sea. The coast wanders with seeded noise. */
export function coastDist(x, z) {
  const a = Math.atan2(z, x), R = IC.radius + IC.coastNoise * 2 * fbm2(Math.cos(a) * 1.6 + SX, Math.sin(a) * 1.6 + SZ, 3);
  return R - Math.hypot(x, z);
}
/** Rolling hills, flat near the plot, running down to a beach and the sea floor at the coast. */
export function hillsH(x, z) {
  const f = 1 / TC.hillScale, grow = smooth(0, 24, coreDist(x, z));
  const land = 0.36 + grow * (TC.hillHeight * (0.5 + fbm2(x * f + SX, z * f + SZ, 3)) + TC.detailHeight * fbm2(x * 0.21 - SZ, z * 0.21 + SX, 3));
  const c = coastDist(x, z);
  // beach: a gentle slope up from the waterline; offshore: steeper down to the sea floor
  const shore = c > 0 ? SEA_Y + 0.12 * c : Math.max(SEA_Y - IC.seaDepth, SEA_Y + 0.25 * c);
  const h = land + (shore - land) * (1 - smooth(IC.beachWidth * 0.4, IC.beachWidth * 1.6, c));
  if (Math.abs(x - LIGHTHOUSE.x) < LIGHTHOUSE.reach && Math.abs(z - LIGHTHOUSE.z) < LIGHTHOUSE.reach) return Math.max(h, lighthouseH(x, z));
  if (Math.abs(x) > 55 || Math.abs(z) > 55) { const I = islandAt(x, z); if (I) return Math.max(h, islandH(I, x, z)); }
  return Math.abs(x - ISLET.x) < ISLET.reach && Math.abs(z - ISLET.z) < ISLET.reach ? Math.max(h, isletH(x, z)) : h;
}
/**
 * The islet off the north-east shore (#26; assets/water/islet.js): a low hump of sand `top` m above the sea, about r m
 * across its waterline (a little uneven), its flanks running down into the sea floor. Part of the terrain height (so
 * the boat grounds on it, you can walk on it, the water shallows round it), but not of coastDist: the island's scatter
 * never reaches it.
 */
export const ISLET = { x: 38.5, z: -38.5, r: 5.2, top: 0.5, reach: 16 };   // (top: all of it below the beach sand's upper edge)
/**
 * Captain Elias's story (#17; app/bottles.js, assets/story/friendship.js): the crooked tree on the dune by the old dock
 * (our jetty), with a star carved in it and, once 15 messages are read, a brass key glinting at its foot; seven steps
 * away, under the jetty's first span, the wooden lid over the Friendship Chest (hidden until then too).
 */
export const STORY = { tree: { x: 25.15, z: -22.5 }, lid: { x: 30.2, z: -17.3 } };   // (the lid half under the deck's edge)
/** Where the treasure is buried (#16; app/treasure.js): on the islet, three paces from the cairn. */
export const TREASURE = { x: 38.64, z: -40.05 };
/**
 * The lighthouse rock (#27; meshes: assets/lighthouse/lighthouse.js): a rocky island ~65 m off the east shore, beyond
 * the 100 m terrain (its own mesh), part of H so the boat grounds on it and you walk on it. A grassy plateau `top` m up
 * on cliffs; from its west side a cleft with stone steps (`gully`: u m west of the middle, `rise` a step) runs down to
 * a landing and the one jetty, which reaches west towards home with the boat's berth on its south side (the same shape
 * as the home jetty's: head, berth, bollards). The tower stands on the plateau: inside, a spiral stair round an open
 * well (`stair`: its inner and outer radius, `perTurn` steps a turn, `rise` m a turn, `turns`) up to the lantern room;
 * a door out to the gallery round it. lighthouseWalls keeps you off the cliffs and inside the tower's walls.
 */
export const LIGHTHOUSE = (() => {
  const x = 110, z = 18, top = SEA_Y + 5, deckY = SEA_Y + 1.15;
  const gully = { u0: 4.6, u1: 13.4, top: 5.2, bottom: 12.8, half: 0.85, rise: 0.26 };   // u: metres west of the middle
  const jetty = { z, deckY, halfW: 0.8, x0: x - 13.4, x1: x - 22, head: { x0: x - 19, halfW: 1.4 } };
  jetty.berth = { x: x - 20.6, z: z - jetty.head.halfW - 1.15, heading: Math.PI };            // bow west, to the sea
  jetty.bollards = [[x - 19.5, z - jetty.head.halfW + 0.13], [x - 21.7, z - jetty.head.halfW + 0.13]];   // aft, fore
  const floor = top + 0.32, stair = { r0: 1.0, r1: 1.8, perTurn: 16, rise: 3.0, turns: 4, a0: Math.PI + 0.55 };
  const topDoor = Math.atan2(Math.sin(stair.a0 + 0.94), Math.cos(stair.a0 + 0.94));   // up top, the door to the gallery: over the floored side, clear of the stair's opening
  const tower = { x: x + 2.2, z: z + 0.4, rIn: 1.85, rOut: [2.35, 2.0], floor, topY: floor + stair.rise * stair.turns, door: Math.PI, topDoor, doorHalf: 0.3, gallery: 3.0 };
  return { x, z, top, reach: 30, plateau: 8.6, gully, jetty, tower, stair };
})();
/**
 * Four more islands round the home island, each with its own ground, life and building (assets/islands/outerIslands.js):
 *  - Millholm (north): rolling meadow, wildflowers, birches, dry-stone walls, sheep; a stone windmill.
 *  - Palm Cay (west): white sand, turquoise shallows, palms; a thatched beach hut on stilts. Two jetties.
 *  - Ember Rock (south): a black volcanic cone, glowing cracks, steam vents, a hot spring; the observatory on the top.
 *  - Heron Marsh (north-west, the largest): low wetland, pools, reeds, willows, herons; a fisherman's stilt lodge. Two jetties.
 * Each is part of H (islandH), so the boat grounds on it and you walk on it. docks: the directions its jetties run out to
 * sea (rad; the first faces home); each jetty is placed where the beach meets the deck's height and runs out to water
 * deep enough for the boat, with the home jetty's shape (a head, a berth on its right, bollards; app/boating.js docks at any).
 */
export const ISLANDS = [
  { name: 'Millholm', kind: 'meadow', x: -8, z: -106, r: 15, top: 3.4, s: 0.7, docks: [null] },
  { name: 'Palm Cay', kind: 'palm', x: -108, z: 22, r: 9, top: 0.8, s: 2.1, docks: [null, 2.2] },
  { name: 'Ember Rock', kind: 'volcano', x: 20, z: 108, r: 13, top: 8.5, s: 4.3, docks: [null] },
  { name: 'Heron Marsh', kind: 'marsh', x: -86, z: -78, r: 22, top: 0.5, s: 5.9, docks: [null, -0.3] },
].map(I => ({ ...I, reach: I.r * 1.6 + 12 }));
{ const V = ISLANDS[2], a = 2.6, x = V.x + Math.cos(a) * V.r * 0.4, z = V.z + Math.sin(a) * V.r * 0.4; V.spring = { x, z, r: 1.8, y: 0 }; V.spring.y = islandH({ ...V, spring: { x: 1e9, z: 1e9, r: 0 } }, x, z) - 0.25; }   // (the hot spring's water level)
function islandR(I, a) { return I.r * (1 + 0.12 * Math.sin(a * 3 + I.s) + 0.07 * Math.sin(a * 5 + I.s * 2) + (I.kind === 'marsh' ? 0.16 * Math.sin(a * 2 + 1) : 0)); }
/** An island's height at (x, z): its beach and inland by its kind; the sea floor round it. */
export function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z, a = Math.atan2(dz, dx), R = islandR(I, a), s = Math.hypot(dx, dz) / R;
  if (s > 1) return SEA_Y - Math.min(6, (s - 1) * R * 0.35);
  const n = fbm2(x * 0.11 + I.s, z * 0.11 - I.s, 3), rise = I.kind === 'marsh' ? 0.95 : 1.25, beach = SEA_Y + rise * smooth(1.0, 0.72, s), inl = smooth(0.8, 0.15, s);
  if (I.kind === 'meadow') return beach + inl * (I.top * (0.65 + 0.35 * n) * Math.pow(inl, 0.6) + 0.3 * fbm2(x * 0.3, z * 0.3, 2));
  if (I.kind === 'palm') return beach + inl * (I.top * (0.7 + 0.3 * n)) + 0.04 * fbm2(x, z, 2);
  if (I.kind === 'volcano') {   // a cone with a flat top for the observatory, and the hot spring's basin on its flank
    const c = Math.min(I.top * Math.pow(Math.max(0, 1 - s / 0.82), 1.05), I.top * 0.9), h = beach + c + 0.3 * inl * (fbm2(x * 0.5, z * 0.5, 2) - 0.2);
    const sp = I.spring, d = Math.hypot(x - sp.x, z - sp.z); return d < sp.r + 1.2 ? Math.min(h, sp.y + 0.35 + 0.9 * smooth(sp.r * 0.3, sp.r + 1.2, d) - 0.6 * (1 - smooth(0, sp.r, d))) : h;
  }
  // the marsh: low and flat, with hollows that hold its pools
  const hol = smooth(0.35, 0.65, fbm2(x * 0.09 - 3, z * 0.09 + 5, 3));
  return beach + inl * (I.top + 0.25 * n - 0.75 * hol);
}
/** The marsh's pools stand at this level (in the hollows lower than it). */
export const MARSH_POOL = SEA_Y + 1.05;
function makeDock(I, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), deckY = SEA_Y + 1.15;
  let r0 = 0; for (let r = I.r * 1.4; r > 0; r -= 0.1) if (islandH(I, I.x + c * r, I.z + s * r) >= deckY - 0.3) { r0 = r; break; }
  let deep = r0; while (deep < r0 + 40 && islandH(I, I.x + c * deep, I.z + s * deep) > SEA_Y - 1.6) deep += 0.2;
  const len = Math.max(8, deep - r0 + 2.5), rx = I.x + c * r0, rz = I.z + s * r0, head = { len: 3, halfW: 1.4 }, hw = 0.8;
  const W = (u, v) => [rx + c * u - s * v, rz + s * u + c * v], L = (x, z) => { const dx = x - rx, dz = z - rz; return [dx * c + dz * s, -dx * s + dz * c]; };
  const [bx, bz] = W(len - 1.4, -(head.halfW + 1.15)), a1 = W(len - 2.5, -(head.halfW - 0.13)), a2 = W(len - 0.3, -(head.halfW - 0.13));
  return {
    island: I.name, rx, rz, ang, len, hw, head, deckY, W, L,
    berth: { x: bx, z: bz, heading: ang }, bollards: [a1, a2],
    deckAt(x, z) { const [u, v] = L(x, z); return u >= -0.05 && u <= len && Math.abs(v) <= (u >= len - head.len ? head.halfW : hw) ? deckY : -Infinity; },
    dist(x, z) { const [u, v] = L(x, z), w = u >= len - head.len ? head.halfW : hw, du = Math.max(-u, u - len, 0), dv = Math.abs(v) - w; return du > 0 || dv > 0 ? Math.hypot(du, Math.max(dv, 0)) : Math.max(du, dv); },
    side(b) { return L(b.x, b.z)[1] < -(head.halfW + 0.3); },   // the boat on the berth's side
    landAt(b) { const [u] = L(b.x, b.z); return W(Math.min(len - 0.4, Math.max(len - head.len + 0.3, u)), -(head.halfW - 0.45)); },
  };
}
ISLANDS.forEach(I => { I.docks = I.docks.map((a, k) => makeDock(I, a === null ? Math.atan2(-I.z, -I.x) : Math.atan2(-I.z, -I.x) + a)); I.docks.forEach((d, k) => { d.index = k; }); });
/** The island (of the four) whose reach holds (x, z), or null. */
export function islandAt(x, z) { for (const I of ISLANDS) if (Math.abs(x - I.x) < I.reach && Math.abs(z - I.z) < I.reach) return I; return null; }
export const ISLAND_DOCKS = ISLANDS.flatMap(I => I.docks);

/** The rock's height (its plateau, cliffs and cleft) at (x, z); the sea floor well away from it. */
export function lighthouseH(x, z) {
  const L = LIGHTHOUSE, dx = x - L.x, dz = z - L.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const Rp = L.plateau * (1 + 0.1 * Math.sin(a * 3 + 1.1) + 0.06 * Math.sin(a * 5 - 0.4) + 0.04 * Math.sin(a * 9 + 2));
  let h;
  if (r < Rp) h = L.top + 0.25 * (1 - (r / Rp) ** 2) + 0.12 * fbm2(x * 0.5, z * 0.5, 2);                    // the plateau, a little domed
  else if (r < Rp + 3.2) { const t = (r - Rp) / 3.2; h = L.top + (SEA_Y - 0.4 - L.top) * (t * t * (3 - 2 * t)) + 0.35 * fbm2(x * 0.9, z * 0.9, 2) * Math.sin(t * Math.PI); }   // the cliffs
  else h = SEA_Y - 0.4 - (r - Rp - 3.2) * 0.55;                                                              // into the sea
  // the cleft: stone steps from the plateau's edge down to the landing at the jetty's root
  const G = L.gully, u = -dx, v = Math.abs(dz);
  if (u > G.u0 && u < G.u1 + 0.4 && v < G.half + 0.5) {
    const n = Math.ceil((L.top - L.jetty.deckY) / G.rise), k = Math.min(n, Math.max(0, Math.ceil((u - G.top) / (G.bottom - G.top) * n)));
    const step = u >= G.bottom ? L.jetty.deckY : k === 0 ? h : L.top - k * (L.top - L.jetty.deckY) / n, w = smooth(G.half, G.half + 0.35, v);   // (the top step: the plateau itself)
    h = step + (Math.max(h, step) - step) * w;
  }
  return h;
}
/** The walkable top of the lighthouse jetty at (x, z), or -Infinity off it. */
function lhJettyY(x, z) {
  const J = LIGHTHOUSE.jetty; if (x > J.x0 + 0.05 || x < J.x1) return -Infinity;
  return Math.abs(z - J.z) <= (x <= J.head.x0 ? J.head.halfW : J.halfW) ? J.deckY : -Infinity;
}
function lhJettyDist(x, z) {
  const J = LIGHTHOUSE.jetty, hw = x <= J.head.x0 ? J.head.halfW : J.halfW, dx = Math.max(J.x1 - x, x - J.x0, 0), dz = Math.abs(z - J.z) - hw;
  return dx > 0 || dz > 0 ? Math.hypot(dx, Math.max(dz, 0)) : Math.max(dx, dz);
}
/** The tower's spiral: the height of the tread at angle a (rad, world) on turn k. */
function treadY(a, k) {
  const S = LIGHTHOUSE.stair, T = LIGHTHOUSE.tower, s = (((a - S.a0) / (Math.PI * 2)) % 1 + 1) % 1;
  return T.floor + S.rise * (k + (Math.floor(s * S.perTurn) + 1) / S.perTurn);
}
/** Every surface in the tower over (x, z): the ground floor, the treads, the lantern room's floor and the gallery. */
function towerSurfaces(x, z) {
  const T = LIGHTHOUSE.tower, S = LIGHTHOUSE.stair, dx = x - T.x, dz = z - T.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), out = [];
  if (r > T.gallery) return out;
  const s = (((a - S.a0) / (Math.PI * 2)) % 1 + 1) % 1;
  if (r < T.rIn) {
    out.push(T.floor);
    if (r >= S.r0 - 0.05 && r <= S.r1 + 0.1) for (let k = 0; k < S.turns; k++) out.push(treadY(a, k));
    if (!(r >= S.r0 - 0.1 && s > 0.3)) out.push(T.topY);            // the lantern room floor, but for the opening over the last of the stair
  } else out.push(T.topY);                                          // the gallery
  return out;
}
/** Where you stand in the tower (feet at `feet`), or -Infinity when outside it. */
export function towerY(x, z, feet) {
  const T = LIGHTHOUSE.tower; if (Math.abs(x - T.x) > 3 || Math.abs(z - T.z) > 3) return -Infinity;
  const r = Math.hypot(x - T.x, z - T.z); if (r >= T.rIn && feet < T.topY - 0.6) return -Infinity;
  let best = -Infinity; for (const h of towerSurfaces(x, z)) if (h <= feet + 0.45 && h > best) best = h;
  return best;
}
/**
 * Keep a walker (feet at `feet`, from prev to p) on the lighthouse rock: off the cliffs and the cleft's walls (no step
 * steeper than 1.4 up or down), and in the tower through its doors only: the well's railing above the ground floor,
 * nothing solid at head height (the treads above you), the gallery's railing, the lamp.
 */
export function lighthouseWalls(p, prev, feet) {
  const L = LIGHTHOUSE, T = L.tower; if (Math.abs(p.x - L.x) > L.reach || Math.abs(p.z - L.z) > L.reach) return;
  const back = () => { p.x = prev.x; p.z = prev.z; };
  const r1 = Math.hypot(p.x - T.x, p.z - T.z), a1 = Math.atan2(p.z - T.z, p.x - T.x);
  const high = feet > T.topY - 0.6, dA = high ? T.topDoor : T.door, inDoor = Math.abs(Math.atan2(Math.sin(a1 - dA), Math.cos(a1 - dA))) < T.doorHalf - 0.08;
  const wallOut = (high ? T.rOut[1] + 0.15 : T.rOut[0] + 0.22);
  // the tower's wall: you are only ever in it in a doorway (the ground-floor door, or the one to the gallery up top)
  if (r1 > T.rIn - 0.15 && r1 < wallOut && !(inDoor && (high || feet < T.floor + 0.6))) { back(); return; }
  if (r1 < T.rIn) {
    const S = L.stair;
    if (feet > T.floor + 0.35 && !high && r1 < S.r0 + 0.12) { back(); return; }                                // the well's railing
    if (high && r1 < 0.65) { back(); return; }                                                               // the lamp
    if (high && r1 > S.r0 - 0.1) { const s = (((a1 - S.a0) / (Math.PI * 2)) % 1 + 1) % 1; if (s > 0.3 && s < 0.9 && feet > T.topY - 0.05) { back(); return; } }   // the opening's railing
    for (const h of towerSurfaces(p.x, p.z)) if (h > feet + 0.5 && h < feet + 1.85) { back(); return; }     // your head
    return;
  }
  if (high && r1 > T.gallery - 0.2) { back(); return; }                                                     // the gallery's railing
  if (high) return;
  // the rock: no climbing its cliffs or dropping off them
  const d = Math.hypot(p.x - prev.x, p.z - prev.z); if (d < 1e-5) return;
  const g0 = Math.max(lighthouseH(prev.x, prev.z), lhJettyY(prev.x, prev.z)), g1 = Math.max(lighthouseH(p.x, p.z), lhJettyY(p.x, p.z));
  const G = L.gully, inCleft = q => { const u = L.x - q.x, v = Math.abs(q.z - L.z); return u > G.u0 - 1 && u < G.u1 + 0.4 && v < G.half - 0.1; };
  if (inCleft(p) && inCleft(prev)) return;                                                                   // its steps
  if (g0 > SEA_Y && Math.abs(g1 - g0) / d > 1.4 && g1 > SEA_Y - 0.3) back();
  else if (g0 > SEA_Y + 0.5 && g1 < SEA_Y + 0.2) back();                                                   // off the edge into the sea
}
export function isletH(x, z) {
  const I = ISLET, dx = x - I.x, dz = z - I.z, a = Math.atan2(dz, dx), r = I.r * (1 + 0.14 * Math.sin(a * 3 + 0.8) + 0.08 * Math.sin(a * 5 - 1.3));
  const s = Math.hypot(dx, dz) / r;
  if (s < 1) return SEA_Y + I.top * (1 - s * s) * (1 - s * s * 0.35) + 0.05 * fbm2(x * 0.7, z * 0.7, 2);   // the hump
  return SEA_Y - (s - 1) * r * 0.45;                                                                        // its flanks into the sea
}
/**
 * Terrain height before the stream is carved: exactly dioramaH() inside the plot. The plot's builders use it for their
 * placement decisions, so their random draws (and so the reference trees) are the same as before the stream.
 */
export function H0(x, z) {
  const q = coreDist(x, z);
  if (q <= 0) return dioramaH(x, z);
  const w = smooth(0, WC.coreBlend, q);
  return dioramaH(x, z) * (1 - w) + hillsH(x, z) * w;
}
/** Terrain height everywhere: H0 with the stream's channel and banks carved in. */
export function H(x, z) {
  const h0 = H0(x, z), q = streamAt(x, z);
  if (!q) return h0;
  const bed = q.W - q.depth, g = q.d < q.w ? bed + q.depth * 1.08 * (q.d / q.w) ** 2 : q.W + 0.03 + (q.d - q.w) * q.bank;
  const k = 0.06, t = clamp(0.5 + 0.5 * (g - h0) / k);                 // smooth minimum: no crease where the bank meets the land
  return g * (1 - t) + h0 * t - k * t * (1 - t);
}

/*
 * The stream: from the pond's south-east rim, past the cabin, north through a low valley and down three rapids to the
 * beach. A centripetal Catmull-Rom course through STREAM_COURSE; along it (s = metres from the pond) the water level W
 * steps down through pools and rapids from the pond's level to the sea, the channel's half-width w and depth vary, and
 * the terrain is carved to a bed and banks (H above). Keys are [s, value]; values between keys ease smoothly.
 */
const STREAM_COURSE = [[2.37, 1.62], [2.9, 1.95], [3.9, 2.35], [4.9, 1.7], [5.9, 0.4], [7.3, -1.3], [7.6, -4.4], [9.4, -7.6], [8.9, -12], [10.9, -16.2], [10.1, -20.8], [11.9, -25], [12.9, -27.6], [11.3, -30.4], [12.2, -33.8]];
const STREAM_LEVEL = [[0, 0], [4, 0], [6.5, -0.07], [13, -0.1], [15, -0.22], [22, -0.26], [24.5, -0.44], [28, -0.5], [29.6, -0.68], [33, -0.75], [36, -0.8], [99, -0.8]];
const STREAM_WIDTH = [[0, 0.5], [3, 0.42], [6, 0.55], [14, 0.5], [18, 0.62], [24, 0.5], [30, 0.6], [33, 1.0], [36, 1.8], [99, 2.2]];
const STREAM_BANK = [[0, 0.62], [31, 0.62], [35, 0.2], [99, 0.15]];   // bank slope: gentle where it fans out over the beach
const STREAM_DEPTH = [[0, 0.3], [4, 0.18], [6.5, 0.1], [9, 0.2], [15, 0.08], [18, 0.22], [24.5, 0.07], [27, 0.2], [29.6, 0.07], [32, 0.16], [99, 0.2]];
function keyed(keys, s) {
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] < s) i++;
  const [s0, v0] = keys[i], [s1, v1] = keys[i + 1], t = clamp((s - s0) / (s1 - s0));
  return v0 + (v1 - v0) * t * t * (3 - 2 * t);
}
export const STREAM = (() => {
  const curve = new THREE.CatmullRomCurve3(STREAM_COURSE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength(), step = 0.2, n = Math.ceil(len / step), pts = [];
  let wMin = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u), s = u * len;
    // falls only, stays below the natural ground (outside the pond) and ends at the sea
    wMin = Math.min(wMin, keyed(STREAM_LEVEL, s), lakeD(p.x, p.z) > 1.02 ? H0(p.x, p.z) - 0.08 : Infinity);
    pts.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s, W: Math.max(wMin, SEA_Y), w: keyed(STREAM_WIDTH, s), depth: keyed(STREAM_DEPTH, s), bank: keyed(STREAM_BANK, s) });
  }
  for (let i = 0; i < pts.length; i++) {   // slope of the water (for flow speed and foam): drop over the next metre
    const j = Math.min(pts.length - 1, i + 5); pts[i].slope = (pts[i].W - pts[j].W) / Math.max(1e-3, pts[j].s - pts[i].s);
  }
  // a 1 m grid of the samples within reach of each cell, for fast lookups
  const R = 5.5, x0 = Math.min(...pts.map(p => p.x)) - R, z0 = Math.min(...pts.map(p => p.z)) - R;
  const nx = Math.ceil(Math.max(...pts.map(p => p.x)) + R - x0) + 1, nz = Math.ceil(Math.max(...pts.map(p => p.z)) + R - z0) + 1, cells = Array.from({ length: nx * nz }, () => []);
  pts.forEach((p, k) => { for (let j = Math.floor(p.z - R - z0); j <= Math.floor(p.z + R - z0); j++) for (let i = Math.floor(p.x - R - x0); i <= Math.floor(p.x + R - x0); i++) if (i >= 0 && j >= 0 && i < nx && j < nz) cells[j * nx + i].push(k); });
  return { pts, len, reach: R, grid: { x0, z0, nx, nz, cells } };
})();
/**
 * The nearest point of the stream to (x, z) within its reach (null otherwise): d (m to the centre line), s (m along),
 * W (water level), w (half-width), depth, slope, and the sample index k.
 */
export function streamAt(x, z) {
  const G = STREAM.grid, i = Math.floor(x - G.x0), j = Math.floor(z - G.z0);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return null;
  const list = G.cells[j * G.nx + i]; if (!list.length) return null;
  let best = -1, bd = Infinity;
  for (const k of list) { const p = STREAM.pts[k], d = (x - p.x) ** 2 + (z - p.z) ** 2; if (d < bd) { bd = d; best = k; } }
  const p = STREAM.pts[best], d = Math.sqrt(bd);
  return d > STREAM.reach ? null : { d, s: p.s, W: p.W, w: p.w, depth: p.depth, slope: p.slope, bank: p.bank, k: best };
}
/** Signed distance to the stream's water edge (< 0 in the water); Infinity far from it. */
export function streamDist(x, z) { const q = streamAt(x, z); return q ? q.d - q.w : Infinity; }

/*
 * The footbridge over the stream just below its first rapid, and the stepping-stone path from the cabin steps to it (the
 * meshes: assets/cabin/footbridge.js). The bridge crosses square to the stream at BRIDGE.s; its deck arches from the
 * banks (deckY is walkable, see app/controls.js). The path's flat stones follow curves (FOOTPATH_ROUTES below); the
 * grass and flowers keep off them (footpathDist). Both use their own random numbers.
 */
export const BRIDGE = (() => {
  const s = 16.3, p = STREAM.pts.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b, STREAM.pts[0]);
  const ax = -p.tz, az = p.tx, half = 1.55, width = 1.0, arch = 0.1;   // across the stream (u), along it (v)
  const endY = Math.max(H(p.x - ax * half, p.z - az * half), H(p.x + ax * half, p.z + az * half)) + 0.16;   // the stringers rest on the banks
  const rail = { v: 0.567, t: 0.065, u: half - 0.04, top: 0.92 };   // railings: centre offset, half thickness, half span, top above the deck
  return { x: p.x, z: p.z, ax, az, half, width, arch, endY, W: p.W, rail, deckY: u => endY + arch * (1 - (u / half) ** 2) };
})();
/** Top of the bridge deck at (x, z), or -Infinity off the deck. */
export function bridgeDeckY(x, z) {
  const B = BRIDGE, dx = x - B.x, dz = z - B.z, u = dx * B.ax + dz * B.az, v = dx * B.az - dz * B.ax;
  return Math.abs(u) <= B.half + 0.05 && Math.abs(v) <= B.width / 2 ? B.deckY(Math.max(-B.half, Math.min(B.half, u))) : -Infinity;
}
/** Keep a body of `radius` out of the bridge's railings (posts and rails, as walls from the deck to just above the top
 *  rail, drawn in assets/cabin/footbridge.js): someone on the deck stays on it, someone beside it stays beside it, and the
 *  rail ends are rounded. p moves; prev (where it was) says which side of a rail it is on. foot / head: the body's height. */
export function bridgeRails(p, prev, radius, foot, head) {
  const B = BRIDGE, R = B.rail, dx = p.x - B.x, dz = p.z - B.z;
  let u = dx * B.ax + dz * B.az, v = dx * B.az - dz * B.ax;
  if (Math.abs(u) > R.u + radius + 0.1 || Math.abs(v) > R.v + R.t + radius + 0.1) return;
  const y = B.deckY(Math.max(-B.half, Math.min(B.half, u))); if (foot > y + R.top || head < y - 0.1) return;
  const pv = (prev.x - B.x) * B.az - (prev.z - B.z) * B.ax, r = R.t + radius;
  for (const side of [-1, 1]) {
    const cu = Math.max(-R.u, Math.min(R.u, u)), du = u - cu, dv = v - side * R.v, d = Math.hypot(du, dv);
    if (d >= r) continue;
    if (du === 0) v = side * R.v + (side * pv < R.v ? -side : side) * r;   // along the rail: back to the side it came from
    else if (d > 1e-5) { u = cu + du / d * r; v = side * R.v + dv / d * r; }   // round the rail's end
  }
  p.x = B.x + u * B.ax + v * B.az; p.z = B.z + u * B.az - v * B.ax;
}
const streamPt = s => STREAM.pts.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b, STREAM.pts[0]);
const westBank = (s, off) => { const p = streamPt(s), t = -(p.w + off); return [p.x - p.tz * t, p.z + p.tx * t]; };   // a point on the stream's west bank
// from the cabin steps round the cabin, then down the west bank (inside the stream's scatter exclusion) to the bridge
const FOOTPATH_COURSE = [[4.02, -1.02], [4.75, -1.12], [5.4, -1.62], [5.62, -2.45], westBank(10, 1.15), westBank(12, 1.1), westBank(13.8, 1.1),
  [BRIDGE.x - BRIDGE.ax * (BRIDGE.half + 0.35), BRIDGE.z - BRIDGE.az * (BRIDGE.half + 0.35)]];
/*
 * Two benches for the sunrise and the sunset (meshes: assets/cabin/benches.js), on the crests above the east and west
 * beaches. (x, z): the middle of the seat; face: the way a seated person looks; length / depth: the footprint the player
 * cannot walk through; seatH: the seat's height above the ground there. The paths to them start at the bridge and
 * curve round one end of the bench to stop in front of it.
 */
const faceOf = deg => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
export const BENCHES = [
  { name: 'sunrise', x: 24.3, z: -16.6, face: faceOf(-11), length: 1.5, depth: 0.62, seatH: 0.46 },   // east, the sun rising over the sea
  { name: 'sunset', x: -25.4, z: -17.6, face: faceOf(190), length: 1.6, depth: 0.66, seatH: 0.44 },  // west-south-west, the sun setting over the sea
].map(b => {
  const [fx, fz] = b.face, g = [];   // y: the mean ground under the footprint (the legs reach down to it wherever it is lower)
  for (const a of [-0.8, 0, 0.8]) for (const f of [-0.35, 0.35]) g.push(H(b.x - fz * a * b.length / 1.6 + fx * f, b.z + fx * a * b.length / 1.6 + fz * f));
  return { ...b, fx, fz, y: g.reduce((s, v) => s + v, 0) / g.length, lantern: -1 };   // lantern: the end it stands at (the path comes round the other)
});
/** A point in a bench's frame: a along the seat (to the bench's right as you sit), f towards where it faces. */
export function benchPoint(b, a, f) { return [b.x - b.fz * a + b.fx * f, b.z + b.fx * a + b.fz * f]; }
/** Everywhere you can sit (the sit button in app/controls.js): the two benches and the cabin's bench under the front window. */
export const SEATS = [
  ...BENCHES.map(b => ({ x: b.x, z: b.z, fx: b.fx, fz: b.fz, top: b.y + b.seatH, half: b.length / 2, back: -0.1 })),
  { x: HOUSE.x - 0.2, z: HOUSE.z + CB.ZW + 0.51, fx: 0, fz: 1, top: PAD_H + 0.45, half: 0.52, back: -0.05 },
];

const BRIDGE_W = [BRIDGE.x - BRIDGE.ax * (BRIDGE.half + 0.35), BRIDGE.z - BRIDGE.az * (BRIDGE.half + 0.35)], BRIDGE_E = [BRIDGE.x + BRIDGE.ax * (BRIDGE.half + 0.35), BRIDGE.z + BRIDGE.az * (BRIDGE.half + 0.35)];
const [SUNRISE, SUNSET] = BENCHES;
/*
 * The jetty on the east beach below the sunrise bench (meshes: assets/water/jetty.js; the boat: assets/water/sailboat.js,
 * sailing: app/boating.js). It runs along +x at z from where the sand meets its deck (x0) out to x1 over ~2 m of water,
 * with a wider head at the end; where the deck stands high over the sand, side stairs lead down to the beach. The boat's
 * berth is along the south side of the head, bow to the sea.
 */
export const JETTY = (() => {
  const z = -18, deckY = 0.35, halfW = 0.7, x1 = 44;
  let x0 = 25; while (x0 < 32 && H(x0, z) > deckY - 0.02) x0 += 0.05;   // the root: where the beach has dropped to the deck
  const head = { x0: 41.2, halfW: 1.3 };
  const stair = { x0: 31.0, x1: 31.9, side: -1, rise: 0.17, run: 0.27 };   // down to the sand on the south side
  stair.steps = Math.max(1, Math.round((deckY - H((stair.x0 + stair.x1) / 2, z - halfW - 1)) / stair.rise));
  const berth = { x: 42.6, z: z - head.halfW - 1.15, heading: 0 };      // boat centre and heading (0: bow along +x)
  const bollards = [[41.55, z - head.halfW + 0.13], [43.75, z - head.halfW + 0.13]];   // on the berth side of the head
  const pole = [43.72, z + head.halfW - 0.14];                             // the lamp post, on the far corner of the head
  return { z, deckY, halfW, x0, x1, head, stair, berth, bollards, pole };
})();
/** Half-width of the jetty's deck at x (0 off its length). */
const jettyHalfW = x => x < JETTY.x0 - 0.05 || x > JETTY.x1 ? 0 : x >= JETTY.head.x0 ? JETTY.head.halfW : JETTY.halfW;
/** The walkable top of the jetty (deck and side stairs) at (x, z), or -Infinity off it. */
export function jettyDeckY(x, z) {
  if (x > LIGHTHOUSE.x - 30) return lhJettyY(x, z);   // the lighthouse's jetty (app/boating.js docks at either)
  if (Math.abs(x) > 55 || Math.abs(z) > 55) { const I = islandAt(x, z); if (!I) return -Infinity; let y = -Infinity; for (const d of I.docks) y = Math.max(y, d.deckAt(x, z)); return y; }   // the four islands' jetties
  const J = JETTY, dz = z - J.z, hw = jettyHalfW(x);
  if (hw && Math.abs(dz) <= hw) return J.deckY;
  const S = J.stair, out = -dz * -S.side - J.halfW;   // metres out from the deck edge on the stair's side
  if (x >= S.x0 && x <= S.x1 && out > 0 && out <= S.steps * S.run) return J.deckY - Math.ceil(out / S.run) * S.rise;
  return -Infinity;
}
/** Distance to the jetty's footprint, stairs included (< 0 on it). */
export function jettyDist(x, z) {
  if (x > LIGHTHOUSE.x - 30) return lhJettyDist(x, z);
  if (Math.abs(x) > 55 || Math.abs(z) > 55) { const I = islandAt(x, z); if (!I) return 99; return Math.min(...I.docks.map(d => d.dist(x, z))); }
  const J = JETTY, hw = Math.max(jettyHalfW(Math.min(Math.max(x, J.x0), J.x1)), 0.01), dx = Math.max(J.x0 - x, x - J.x1, 0), dz = Math.abs(z - J.z) - hw;
  let d = dx > 0 || dz > 0 ? Math.hypot(dx, Math.max(dz, 0)) : Math.max(-dz, 0) * -1;
  const S = J.stair, sz = J.z + S.side * (J.halfW + S.steps * S.run / 2), sx = Math.max(S.x0 - x, x - S.x1, 0), szd = Math.max(Math.abs(z - sz) - S.steps * S.run / 2, 0);
  return Math.min(d, Math.hypot(sx, szd) - (sx === 0 && szd === 0 ? 0.01 : 0));
}
/** The stepping-stone routes: from the cabin to the bridge, and from the bridge to each bench (ending in front of it). */
const FOOTPATH_ROUTES = [
  { course: FOOTPATH_COURSE, from: 0.05 },
  { course: [BRIDGE_E, [12.2, -12.4], [12.8, -14.6], [13.9, -17.3], [16.5, -18.9], [19.6, -19.1], [22.2, -18.7], benchPoint(SUNRISE, 1.75, 0.2), benchPoint(SUNRISE, 1.1, 0.95), benchPoint(SUNRISE, 0, 1.0)], from: 0.55, bench: SUNRISE },
  { course: [BRIDGE_W, [6.2, -11.4], [3.8, -13.2], [0, -14.4], [-5, -15.3], [-10, -16.0], [-15, -16.4], [-19.5, -16.4], benchPoint(SUNSET, 1.85, 0.25), benchPoint(SUNSET, 1.15, 1.0), benchPoint(SUNSET, 0, 1.05)], from: 0.6, bench: SUNSET },
  { course: [[21.0, -19.05], [23.4, -19.9], [25.8, -19.5], [27.4, -18.4], [JETTY.x0 - 0.25, JETTY.z]], from: 0.62 },   // branches off the sunrise path down to the jetty
  // off the sunset path north through the open strip west of the plot to the forest firepit (route picked offline round
  // every tree and rock; it ends between two of the logs)
  { course: [[-9, -15.5], [-9.5, -13], [-9.5, -10.5], [-11, -8], [-12, -5.5], [-12, -3], [-12, -0.5], [-12, 2], [-12, 4.5], [-12.5, 7], [-13, 9.5], [-14.5, 12], [-16.5, 14], [-18.5, 16.5], [-19.7, 17.0]], from: 0.6 },
  // off the forest path east into the meadow, to the well and the garden (clear of every tree, rock and bush; picked offline)
  { course: [[-12.0, 4.75], [-11.0, 5.05], [-10.0, 5.6], [-9.0, 6.3], [-8.0, 6.75]], from: 0.6 },
  // on from the sunrise bench up the east hill to the standing stones, round the apple tree and the boulders (picked offline)
  { course: [[24.75, -15.0], [23.7, -14.2], [22.75, -13.2], [22.3, -12.0], [22.3, -10.5], [22.55, -9.0], [22.9, -7.5], [23.8, -6.3], [24.9, -5.35], [26.0, -5.0]], from: 0.6 },
  // off the stones' path north through the east wood to the treehouse's ladder (picked offline round every tree and rock)
  { course: [[24.85, -5.2], [24.5, -3.5], [24.6, -1.5], [25.1, 0.5], [25.6, 2.5], [25.8, 4.5], [25.3, 6.2], [24.5, 7.4], [23.9, 8.1]], from: 0.6 },
];
export const FOOTPATH = (() => {
  let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const stones = [], place = (x, z, tx, tz, sink, route, big = 1) => {
    const r = rr(0.2, 0.27) * big, side = rr(-0.07, 0.07);
    stones.push({ x: x - tz * side, z: z + tx * side, r, sx: rr(1.0, 1.25), rot: Math.atan2(tz, tx) + rr(-0.5, 0.5), sink, seed: Math.floor(rnd() * 1e6), route });
  };
  let len = 0;
  FOOTPATH_ROUTES.forEach((R, route) => {
    const curve = new THREE.CatmullRomCurve3(R.course.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), L = curve.getLength();
    const end = R.bench ? L - 0.62 : L;   // a bench route leaves room for the wide stone in front of the seat
    for (let d = R.from; d <= end; d += rr(0.58, 0.66)) { const u = d / L, p = curve.getPointAt(u), t = curve.getTangentAt(u); place(p.x, p.z, t.x, t.z, 0, route); }
    if (R.bench) { const b = R.bench, [x, z] = benchPoint(b, 0, 0.78); place(x, z, -b.fz, b.fx, 0, route, 1.45); }
    len += L;
  });
  // a 1 m grid of the stones within reach of each cell, for fast lookups (footpathDist)
  const reach = 2.2, x0 = Math.min(...stones.map(s => s.x)) - reach, z0 = Math.min(...stones.map(s => s.z)) - reach;
  const nx = Math.ceil(Math.max(...stones.map(s => s.x)) + reach - x0) + 1, nz = Math.ceil(Math.max(...stones.map(s => s.z)) + reach - z0) + 1, cells = Array.from({ length: nx * nz }, () => []);
  stones.forEach(st => { for (let j = Math.floor(st.z - reach - z0); j <= Math.floor(st.z + reach - z0); j++) for (let i = Math.floor(st.x - reach - x0); i <= Math.floor(st.x + reach - x0); i++) if (i >= 0 && j >= 0 && i < nx && j < nz) cells[j * nx + i].push(st); });
  return { stones, len, routes: FOOTPATH_ROUTES.length, grid: { x0, z0, nx, nz, cells, reach } };
})();
/** Distance to the nearest path stone's rim (< 0 on a stone); FOOTPATH.grid.reach (2.2 m) when none is that close. */
export function footpathDist(x, z, routes = Infinity) {   // routes: only the routes before this one
  const G = FOOTPATH.grid, i = Math.floor(x - G.x0), j = Math.floor(z - G.z0);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return G.reach;
  let d = G.reach;
  for (const s of G.cells[j * G.nx + i]) if (s.route < routes) d = Math.min(d, Math.hypot(x - s.x, z - s.z) - s.r * (1 + 0.5 * (s.sx - 1)));
  return d;
}
/** Distance to a bench's footprint, its lantern's end included (< 0 inside). */
export function benchDist(x, z) {
  let d = Infinity;
  for (const b of BENCHES) {
    const dx = x - b.x, dz = z - b.z, ab = (-dx * b.fz + dz * b.fx) * -b.lantern, a = Math.max(-ab - (b.length / 2 + 0.45), ab - (b.length / 2 + 0.05)), f = Math.abs(dx * b.fx + dz * b.fz) - b.depth / 2;
    d = Math.min(d, Math.max(a, f) < 0 ? Math.max(a, f) : Math.hypot(Math.max(a, 0), Math.max(f, 0)));
  }
  return d;
}
/*
 * Firepits (meshes: assets/cabin/firepits.js; lighting them: app/fires.js): one on the beach by the jetty (bare: only the
 * ring of stones and the fire on the sand), one in a clearing of the north-west woods, one on the south-west hill over
 * the sea. The other two: a ring of stones round the fire, three cut logs to sit on round it (logs: the directions from the fire, degrees), and a small roofed woodpile within 5 m (pile:
 * its direction and distance), all placed where no tree, rock or path had to move (sites picked offline).
 */
const PIT = { logR: 1.7, logLen: 1.15, logRad: 0.19, ring: 0.5, pileW: 1.7, pileD: 1.0 };
export const FIREPITS = [
  { name: 'beach', x: 30, z: -23, logs: [], pile: null, bare: true },   // just the stones and the fire on the sand
  { name: 'forest', x: -21.5, z: 15.5, logs: [230, 350, 110], pile: [340, 4.2] },   // a clearing in the north-west woods
  { name: 'hill', x: -19, z: -23.5, logs: [320, 80, 200], pile: [130, 3.0] },
].map(f => {
  const R = Math.PI / 180, y = H(f.x, f.z);
  const logs = f.logs.map(d => {
    const a = d * R, cx = f.x + Math.cos(a) * PIT.logR, cz = f.z + Math.sin(a) * PIT.logR, tx = -Math.sin(a), tz = Math.cos(a), h = PIT.logLen / 2;
    const y0 = H(cx - tx * h, cz - tz * h) + PIT.logRad - 0.035, y1 = H(cx + tx * h, cz + tz * h) + PIT.logRad - 0.035;   // centre heights at its ends: it lies on the ground, a little sunk
    return { x: cx, z: cz, tx, tz, fx: -Math.cos(a), fz: -Math.sin(a), y0, y1, top: (y0 + y1) / 2 + PIT.logRad };
  });
  const pa = f.pile ? f.pile[0] * R : 0, pile = f.pile ? { x: f.x + Math.cos(pa) * f.pile[1], z: f.z + Math.sin(pa) * f.pile[1], fx: -Math.cos(pa), fz: -Math.sin(pa), w: PIT.pileW, d: PIT.pileD } : null;
  return { ...f, y, logs, pile, ...PIT };
});
FIREPITS.forEach((f, pit) => f.logs.forEach(l => SEATS.push({ x: l.x, z: l.z, fx: l.fx, fz: l.fz, top: l.top, half: PIT.logLen / 2, back: 0, pit })));   // sit on any log (pit: which firepit, for cooking)
/** Distance to a firepit's footprint: the fire and its logs (a disc), or its woodpile (< 0 inside). */
export function firepitDist(x, z) {
  let d = Infinity;
  for (const f of FIREPITS) {
    d = Math.min(d, Math.hypot(x - f.x, z - f.z) - (f.logs.length ? f.logR + 0.55 : f.ring + 0.4));
    const P = f.pile; if (!P) continue;
    const dx = x - P.x, dz = z - P.z, a = Math.abs(-dx * P.fz + dz * P.fx) - P.w / 2, b = Math.abs(dx * P.fx + dz * P.fz) - P.d / 2;
    d = Math.min(d, Math.max(a, b) < 0 ? Math.max(a, b) : Math.hypot(Math.max(a, 0), Math.max(b, 0)));
  }
  return d;
}
/*
 * Signposts at the forks of the paths (#19; meshes: assets/cabin/signposts.js): by the bridge, where the jetty path leaves
 * the sunrise path, where the forest path leaves the sunset path and where the garden path leaves the forest path, each
 * in the fork, clear of the path stones,
 * trees and rocks (sites picked offline). A board's `way`: the points along the paths from the sign to the place; the
 * board points at the way a few metres on, and says how far it is in all (to the metre under 20 m, else to 5 m).
 */
const course = i => FOOTPATH_ROUTES[i].course, rev = a => a.slice().reverse();
const nearestAt = (c, x, z) => c.reduce((b, p, i) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(c[b][0] - x, c[b][1] - z) ? i : b, 0);
const upTo = (c, x, z) => c.slice(0, nearestAt(c, x, z) + 1), onFrom = (c, x, z) => c.slice(nearestAt(c, x, z));
const pitAt = name => { const f = FIREPITS.find(q => q.name === name); return [f.x, f.z]; };
const toCabin = rev(course(0)), overBridge = [BRIDGE_W, BRIDGE_E];
export const SIGNS = [
  { x: 6.55, z: -9.5, boards: [   // the bridge's west end: up to the cabin, west along the sunset path, east over the bridge
    { text: 'Cabin', way: toCabin },
    { text: 'Sunrise bench', way: [BRIDGE_W, ...course(1)] },
    { text: 'Jetty', way: [BRIDGE_W, ...upTo(course(1), 19.6, -19.1), ...course(3)] },
    { text: 'Sunset bench', way: course(2) },
  ] },
  { x: 21.0, z: -18.25, boards: [   // the jetty path's start, on the sunrise path
    { text: 'Jetty', way: course(3) },
    { text: 'Beach fire', way: [...course(3), pitAt('beach')] },
    { text: 'Sunrise bench', way: onFrom(course(1), 22.2, -18.7) },
    { text: 'Cabin', way: [...rev(upTo(course(1), 19.6, -19.1)), ...rev(overBridge), ...toCabin] },
    { text: 'Standing stones', way: [...onFrom(course(1), 22.2, -18.7), ...course(6)] },
  ] },
  { x: -9.9, z: -15.1, boards: [   // the forest path's start, on the sunset path
    { text: 'Forest fire', way: [...course(4), pitAt('forest')] },
    { text: 'Sunset bench', way: onFrom(course(2), -10, -16.0) },
    { text: 'Hill fire', way: [...upTo(onFrom(course(2), -10, -16.0), -19.5, -16.4), pitAt('hill')] },
    { text: 'Cabin', way: [...rev(upTo(course(2), -10, -16.0)), ...toCabin] },
    { text: 'Garden & well', way: [...upTo(course(4), -12, 4.5), ...course(5)] },
  ] },
  { x: -11.4, z: 5.85, boards: [   // where the garden path leaves the forest path
    { text: 'Garden & well', way: onFrom(course(5), -11.0, 5.05) },
    { text: 'Forest fire', way: [...onFrom(course(4), -12.5, 7), pitAt('forest')] },
    { text: 'Sunset bench', way: [...rev(upTo(course(4), -12, 4.5)), ...onFrom(course(2), -10, -16.0)] },
  ] },   // (no Cabin board: across the pond it is in sight, much nearer than round by the paths)
  { x: 23.9, z: -5.0, boards: [   // where the treehouse path leaves the stones' path
    { text: 'Treehouse', way: course(7) },
    { text: 'Standing stones', way: onFrom(course(6), 24.9, -5.35) },
    { text: 'Sunrise bench', way: rev(upTo(course(6), 24.9, -5.35)) },
  ] },
].map(S => ({ ...S, y: H(S.x, S.z), boards: S.boards.map(b => {
  const pts = [[S.x, S.z], ...b.way]; let len = 0, aim = null;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (!aim && len + seg >= 3) { const k = (3 - len) / seg; aim = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; }
    len += seg;
  }
  aim = aim || pts[pts.length - 1];
  return { text: b.text, metres: len < 20 ? Math.round(len) : Math.round(len / 5) * 5, angle: Math.atan2(aim[1] - S.z, aim[0] - S.x) };   // angle: of the way from +x towards +z
}) }));
/*
 * In the open meadow west of the pond, at the end of a path off the forest path (sites picked offline on the island's
 * largest clear, level ground): the vegetable garden (#8; meshes: assets/cabin/garden.js, sowing and harvest:
 * app/gardening.js), three raised beds side by side, their long side along z, each with its crop in three plots; and
 * the well (#12; assets/cabin/well.js, app/drawWater.js) beside the path. y: the top of a bed's soil / the ground at
 * the well.
 */
export const GARDEN = (() => {
  // four raised beds of four plots; any crop grows in any plot. The west edge is where it always was (the garden path
  // ends there); it grew east, clear of everything by 0.8 m (checked offline)
  const G = { x: -5.05, z: 8.2, bedW: 0.9, bedL: 2.2, gap: 0.6, h: 0.2, n: 4, per: 4 };
  const beds = Array.from({ length: G.n }, (_, b) => {
    const x = G.x + (b - (G.n - 1) / 2) * (G.bedW + G.gap), hs = [];
    for (const dx of [-G.bedW / 2, G.bedW / 2]) for (const dz of [-G.bedL / 2, 0, G.bedL / 2]) hs.push(H(x + dx, G.z + dz));
    return { x, z: G.z, base: Math.min(...hs) - 0.06, y: Math.max(...hs) + G.h };
  });
  const plots = beds.flatMap((b, bi) => Array.from({ length: G.per }, (_, k) => ({ bed: bi, row: k, x: b.x, z: b.z + (k - (G.per - 1) / 2) * G.bedL / G.per, y: b.y })));
  // a plot's neighbours (for companion planting, app/gardening.js): the plots before and after it in its bed, and the
  // plots in the same row of the beds either side
  plots.forEach(p => { p.near = plots.map((q, i) => ((q.bed === p.bed && Math.abs(q.row - p.row) === 1) || (q.row === p.row && Math.abs(q.bed - p.bed) === 1)) ? i : -1).filter(i => i >= 0); });
  // the potting table at the path's end beside the first bed: seven seed trays along it, each with a little painted
  // sign, and the grow book at its far end (app/gardening.js reads it to you)
  const tx = -8.5, tz = 7.95, table = { x: tx, z: tz, y: H(tx, tz), w: 0.5, l: 1.5, h: 0.78 };
  const seeds = ['carrotSeeds', 'seedPotato', 'pumpkinSeeds', 'onionSets', 'lettuceSeeds', 'beanSeeds', 'strawberryPlants'];
  const bins = seeds.map((kind, i) => ({ kind, x: tx, z: tz - table.l / 2 + 0.1 + i * 0.165, y: table.y + table.h + 0.03 }));
  const book = { x: tx + 0.02, z: tz + table.l / 2 - 0.16, y: table.y + table.h + 0.025 };
  return { ...G, beds, plots, table, seedBox: table, bins, book, half: [(G.n * G.bedW + (G.n - 1) * G.gap) / 2, G.bedL / 2] };
})();
export const WELL = { x: -8.7, z: 5.1, r: 0.56, rim: 0.72, y: H(-8.7, 5.1) };
/**
 * The standing stones on the east hilltop (#66; the island's highest hilltops are all 2.9-3.2 m, the two highest in the
 * spruce forest, so the ring stands on the highest open one, with the sea to the east). A ring of ten places round
 * (x, z), radius r, the gap between the first and the last facing the path from the west. Each place: angle, size
 * (w along the ring, d across it, h above the ground) and what became of it: standing, leaning (outwards, lean rad),
 * fallen (lying outwards), broken (a stump) or gone. The stones' shapes: assets/rocks/standingStones.js.
 */
export const STONES = (() => {
  const x = 29.75, z = -5, r = 2.8, n = 10;
  const kinds = [
    { w: 0.78, d: 0.42, h: 2.0 },                  // the entrance's two tall stones: this one and the last
    { w: 0.7, d: 0.38, h: 1.45 }, { w: 0.6, d: 0.36, h: 1.62 },
    { w: 0.72, d: 0.4, h: 1.55, lean: 0.3 },
    { w: 0.98, d: 0.5, h: 2.25 },                  // the tallest, facing the way in
    { w: 0.66, d: 0.36, h: 1.7 },
    { w: 0.74, d: 0.42, h: 1.85, fallen: true },
    { w: 0.62, d: 0.4, h: 0.55, broken: true },
    { gone: true },
    { w: 0.74, d: 0.42, h: 1.95 },
  ];
  const jit = [0.03, -0.05, 0.04, -0.02, 0.0, 0.05, -0.04, 0.02, 0, -0.03], rj = [0.0, 0.08, -0.06, 0.05, 0.1, -0.05, 0.06, -0.08, 0, 0.02];
  const stones = kinds.map((k, i) => {
    const a = Math.PI + (i + 0.5) / n * Math.PI * 2 + jit[i], rr = r + rj[i], sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
    return { ...k, i, a, x: sx, z: sz, y: H(sx, sz), seed: 31 + i * 17 };
  }).filter(s => !s.gone);
  // footprints (x, z, radius) for keeping grass, sticks and cones out of them; a fallen stone lies outwards from its place
  const foot = [];
  stones.forEach(s => {
    if (!s.fallen) { foot.push([s.x, s.z, Math.max(s.w, s.d) * 0.5]); return; }
    for (let t = 0.2; t < s.h; t += 0.45) foot.push([s.x + Math.cos(s.a) * t, s.z + Math.sin(s.a) * t, s.w * 0.5]);
  });
  return { x, z, r, y: H(x, z), stones, foot };
})();

/**
 * Five places to lie down in the grass and watch the sky (#99): the grass is lower there and only there can you lie
 * (app/controls.js). (x, z) is where you lie (the middle of you), (fx, fz) the way your feet point, i.e. the view
 * when you lift your head. All clear of trees, rocks, bushes, paths and the stream by 1.3 m or more (picked offline).
 */
export const LIE_SPOTS = [
  { name: 'stones', x: 30.25, z: -4.7, fx: 1, fz: 0 },            // in the stone ring, feet to the sunrise and the sea
  { name: 'north hill', x: -11.5, z: -23.5, fx: -0.57, fz: -0.82 }, // over the north shore
  { name: 'glade', x: 24, z: 13.5, fx: 0, fz: 1 },                 // a glade in the east wood by the treehouse: spruce crowns all round the sky
  { name: 'south hill', x: 7, z: 21.5, fx: 0.27, fz: 0.96 },       // the south slope down to the sea
  { name: 'west meadow', x: -16.5, z: -12, fx: -1, fz: 0 },        // feet to the sunset
].map(s => ({ ...s, y: H(s.x, s.z) }));
/**
 * The treehouse in the east wood (#58; assets/cabin/treehouse.js, climbing: app/climbing.js): a square deck `half` m
 * from its middle each way, `deck` m up on four log posts, turned so its front (local +z) faces `face`, where the rope
 * ladder hangs from a gap in the railing and the path from the stones arrives. A hut with an open front covers the back
 * of the deck. treehouseDeckY: the deck's height where you stand on it; treehouseRails keeps you on it (but for the gap).
 */
export const TREEHOUSE = (() => {
  const x = 22.5, z = 10, half = 1.3, face = [0.65, -0.76], rot = Math.atan2(face[0], face[1]);
  const ground = Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => H(x + a * half, z + b * half)));
  const deck = ground + 2.55, s = Math.sin(rot), c = Math.cos(rot);
  const toWorld = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c], toLocal = (wx, wz) => { const dx = wx - x, dz = wz - z; return [dx * c - dz * s, dx * s + dz * c]; };
  const gap = 0.36, foot = toWorld(0, half + 0.55);   // the ladder's gap (half width) and where its foot stands on the ground
  return { x, z, half, rot, deck, gap, toWorld, toLocal, foot: { x: foot[0], z: foot[1], y: H(foot[0], foot[1]) }, top: (() => { const t = toWorld(0, half - 0.35); return { x: t[0], z: t[1] }; })() };
})();
export function treehouseDeckY(x, z) { const T = TREEHOUSE, [lx, lz] = T.toLocal(x, z); return Math.abs(lx) <= T.half && Math.abs(lz) <= T.half ? T.deck : -Infinity; }
/** Keep a body of `radius` whose feet are at deck height on the treehouse deck: inside the railings and the hut's walls
 *  (on the deck's edges), except through the ladder's gap. p moves; prev says whether it was on the deck. */
export function treehouseRails(p, prev, radius, feet) {
  const T = TREEHOUSE; if (Math.abs(feet - T.deck) > 0.5) return;
  const [pl, pz] = T.toLocal(prev.x, prev.z); if (Math.abs(pl) > T.half || Math.abs(pz) > T.half) return;   // not on it
  let [lx, lz] = T.toLocal(p.x, p.z); const m = T.half - radius - 0.06;
  if (Math.abs(lx) < T.gap - radius && lz > 0) { lx = Math.max(-m, Math.min(m, lx)); }   // through the gap: fall off the front
  else { lx = Math.max(-m, Math.min(m, lx)); lz = Math.max(-m, Math.min(m, lz)); }
  const [wx, wz] = T.toWorld(lx, lz); p.x = wx; p.z = wz;
}

/**
 * The caverns (#63; meshes: assets/rocks/caverns.js): limestone caves under the south slope, after Luray Caverns. Two
 * entrances cut into the meadow, flush with the ground (the terrain mesh is opened over them), lead down stone steps
 * (ramps) into two halls: the great hall under the south hill, with a still pool that mirrors its stalactites, and the
 * crystal chamber under the west wood; a winding tunnel lit by glowing crystals joins them. Floors are ~4 m below the sea.
 *  - halls: an ellipse (rx, rz) at (x, z), a floor, a domed roof h m over it (lower towards the walls)
 *  - tubes: a path of points [x, z, floor] with half-width w and height h; stairs: the floor goes in steps of `rise`
 * caveSDF is the air (< 0) for the mesh; caveFloor where you walk; caveWalls keeps you inside and lets you in and out at
 * the ramps' top ends only; underground() says you are below the ground (the sea, rain and the sky's sounds are away).
 */
export const CAVERNS = (() => {
  const fA = -4.0, fB = -3.6, topA = [-4.5, 14.0], topB = [-16.8, 4.4];
  const halls = [
    { name: 'hall', x: -10.2, z: 22.6, rx: 7.4, rz: 4.5, floor: fA, h: 5.2, pool: { x: -13.4, z: 23.4, rx: 2.6, rz: 1.7, y: fA + 0.08 } },
    { name: 'crystal', x: -22.4, z: 13.2, rx: 4.4, rz: 4.0, floor: fB, h: 4.4 },
  ];
  const tubes = [
    { name: 'tunnel', w: 1.25, h: 2.8, pts: [[-16.6, 22.2, fA], [-19.6, 21.3, -3.9], [-22.0, 19.2, -3.8], [-22.8, 16.6, fB]] },
    { name: 'rampA', w: 1.05, h: 2.9, stairs: 0.2, pts: [[topA[0], topA[1], H(...topA) - 0.02], [-4.2, 18.4, null], [-5.6, 21.6, fA]] },
    { name: 'rampB', w: 1.05, h: 2.9, stairs: 0.2, pts: [[-20.8, 11.2, fB], [-18.7, 8.2, null], [topB[0], topB[1], H(...topB) - 0.02]] },
  ];
  for (const t of tubes) {   // arc lengths; unset floors by length between the set ones
    let a = 0; t.pts.forEach((p, i) => { if (i) a += Math.hypot(p[0] - t.pts[i - 1][0], p[1] - t.pts[i - 1][1]); p[3] = a; }); t.len = a;
    t.pts.forEach((p, i) => { if (p[2] !== null) return; let j = i - 1, k = i + 1; while (t.pts[k][2] === null) k++; const u = (p[3] - t.pts[j][3]) / (t.pts[k][3] - t.pts[j][3]); p[2] = t.pts[j][2] + (t.pts[k][2] - t.pts[j][2]) * u; });
  }
  return { halls, tubes, mouths: [{ tube: 'rampA', x: topA[0], z: topA[1] }, { tube: 'rampB', x: topB[0], z: topB[1] }], box: { x0: -28, x1: 0.5, z0: 2.5, z1: 28.5, y0: fA - 0.8 } };
})();
/** The old name for the story's cave (its mouth: app/treasure.js draws it on the map, the star is over it). */
export const CAVE = { x: CAVERNS.mouths[0].x, z: CAVERNS.mouths[0].z };
/** A tube's nearest point to (x, z): { d lateral distance, s arc length, floor there (stepped for stairs) }. */
function tubeAt(t, x, z) {
  let best = { d: Infinity, s: 0, floor: 0 };
  for (let i = 1; i < t.pts.length; i++) {
    const a = t.pts[i - 1], b = t.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const d = Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
    if (d < best.d) best = { d, s: a[3] + (b[3] - a[3]) * u, floor: a[2] + (b[2] - a[2]) * u, end: (i === 1 && u === 0) || (i === t.pts.length - 1 && u === 1) };
  }
  if (t.stairs) { const hi = Math.max(t.pts[0][2], t.pts[t.pts.length - 1][2]); best.floor = hi - Math.ceil((hi - best.floor) / t.stairs - 1e-6) * t.stairs; best.smooth = best.floor; }
  return best;
}
const inBox = (x, z) => { const B = CAVERNS.box; return x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1; };
/** Signed distance (roughly, m) to the caves' air at (x, y, z): < 0 inside. Without the rock's noise (the mesh adds it). */
export function caveSDF(x, y, z) {
  if (!inBox(x, z)) return 5;
  let d = 20;
  for (const c of CAVERNS.halls) {
    const q = Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz), lat = (q - 1) * Math.min(c.rx, c.rz);
    const pq = c.pool ? Math.hypot((x - c.pool.x) / c.pool.rx, (z - c.pool.z) / c.pool.rz) : 9;   // the pool's basin, deep enough to hold its mirror image
    const fy = c.floor + 0.12 * Math.sin(x * 1.3) * Math.sin(z * 1.1) - 2.0 * (1 - smooth(0.7, 1.15, pq)), ceil = c.floor + c.h * Math.pow(Math.max(0, 1 - q * q), 0.45);
    d = smin(d, Math.max(lat, fy - y, y - ceil), 0.9);
  }
  for (const t of CAVERNS.tubes) {
    const a = tubeAt(t, x, z); if (a.d > t.w + 1.5) continue;
    const open = t.stairs && a.floor + t.h > H(x, z) - 0.3, ceil = open ? 50 : a.floor + t.h * Math.sqrt(Math.max(0, 1 - (a.d / t.w) ** 2));   // (open to the sky: walls only)
    d = smin(d, Math.max(a.d - t.w, a.floor - y, y - ceil), 0.6);
  }
  return d;
}
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }
/** Where you walk in the caves at (x, z), or null outside them (the walkable part: clear of the walls and the pool). */
export function caveFloor(x, z) {
  if (!inBox(x, z)) return null;
  let f = null;
  for (const c of CAVERNS.halls) {
    if (Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz) > 0.84) continue;
    if (c.pool && Math.hypot((x - c.pool.x) / c.pool.rx, (z - c.pool.z) / c.pool.rz) < 1.08) return null;
    const fy = c.floor + 0.12 * Math.sin(x * 1.3) * Math.sin(z * 1.1); f = f === null ? fy : Math.max(f, fy);
  }
  for (const t of CAVERNS.tubes) { const a = tubeAt(t, x, z); if (a.d < t.w - 0.4 && !(t.stairs && a.end && a.floor > H(x, z) - 0.6)) f = f === null ? a.floor : Math.max(f, a.floor); }   // (not past a ramp's top step: that is the meadow)
  return f;
}
/** Distance to where the caves open to the sky (the ramps' trenches; < 0 inside): no grass, rocks or sticks there. */
export function caveDist(x, z) {
  if (!inBox(x, z)) return 9;
  let d = Infinity;
  for (const t of CAVERNS.tubes) if (t.stairs) { const a = tubeAt(t, x, z); if (a.floor + t.h > H(x, z) - 0.35) d = Math.min(d, a.d - t.w - 0.2); }   // (where the trench is open)
  return d;
}
/** Whether the terrain cell (x0, z0) .. (x0 + st, z0 + st) lies wholly over an open trench (the terrain mesh leaves it out;
 *  cells at the edge stay, a lip of turf over the trench's wall). */
export function caveOpenCell(x0, z0, st) {
  if (!inBox(x0, z0)) return false;
  for (const t of CAVERNS.tubes) if (t.stairs) {
    let all = true; for (const [x, z] of [[x0, z0], [x0 + st, z0], [x0, z0 + st], [x0 + st, z0 + st]]) { const a = tubeAt(t, x, z); if (!(a.d < t.w - 0.03 && !a.end && a.floor + t.h > H(x, z) - 0.3)) { all = false; break; } }
    if (all) return true;
  }
  return false;
}
/** Whether a trench is open to the sky over (x, z). */
export function caveOpen(x, z) {
  if (!inBox(x, z)) return false;
  for (const t of CAVERNS.tubes) if (t.stairs) { const a = tubeAt(t, x, z); if (a.d < t.w + 0.2 && !a.end && a.floor + t.h > H(x, z) - 0.3) return true; }
  return false;
}
/** Below the ground in the caves (feet at `feet`). */
export function underground(x, z, feet) { const f = caveFloor(x, z); return f !== null && feet < H(x, z) - 1.2 && Math.abs(feet - f) < 1.2; }
/** Where you stand in the caves, or null when not in them (on the surface, even over them). */
export function caveGround(x, z, feet) { const f = caveFloor(x, z); if (f === null) return null; return feet < H(x, z) - 0.25 || caveOpen(x, z) ? f : null; }
/**
 * Keep a walker (feet at `feet`, from prev to p) in the caves: inside the walkable floor while in them, out and in at the
 * ramps' top ends only (where the steps meet the ground), and off the open trenches' edges from outside.
 */
export function caveWalls(p, prev, feet) {
  if (!inBox(p.x, p.z) && !inBox(prev.x, prev.z)) return;
  const was = caveGround(prev.x, prev.z, feet) !== null && Math.abs(caveFloor(prev.x, prev.z) - feet) < 0.6;
  const f = caveFloor(p.x, p.z), inNow = f !== null && (feet < H(p.x, p.z) - 0.25 || caveOpen(p.x, p.z));
  if (was) { if (f === null ? H(p.x, p.z) - feet > 0.35 || feet - H(p.x, p.z) > 0.6 : Math.abs(f - feet) > 0.5) { p.x = prev.x; p.z = prev.z; } return; }
  if ((inNow || caveOpen(p.x, p.z)) && !(f !== null && Math.abs(f - feet) < 0.4)) { p.x = prev.x; p.z = prev.z; }
}

/** Distance to the nearest lie-down place's middle. */
export function lieDist(x, z) { let d = Infinity; for (const s of LIE_SPOTS) d = Math.min(d, Math.hypot(x - s.x, z - s.z)); return d; }

/** Distance to the garden's beds (as one rectangle round them), its seed box, the well, a standing stone's foot or the cave's knoll (< 0 inside). */
export function builtDist(x, z) {
  const rect = (cx, cz, hx, hz) => { const a = Math.abs(x - cx) - hx, b = Math.abs(z - cz) - hz; return Math.max(a, b) < 0 ? Math.max(a, b) : Math.hypot(Math.max(a, 0), Math.max(b, 0)); };
  const S = GARDEN.seedBox;
  let d = Math.min(rect(GARDEN.x, GARDEN.z, GARDEN.half[0], GARDEN.half[1]), rect(S.x, S.z, S.w / 2, S.l / 2), Math.hypot(x - WELL.x, z - WELL.z) - WELL.r);
  d = Math.min(d, caveDist(x, z));
  if (Math.abs(x - STONES.x) < STONES.r + 3 && Math.abs(z - STONES.z) < STONES.r + 3) for (const [a, b, r] of STONES.foot) d = Math.min(d, Math.hypot(x - a, z - b) - r);
  return d;
}
/** Distance to the nearest signpost's foot (< 0 at it). */
export function signDist(x, z) { let d = Infinity; for (const S of SIGNS) d = Math.min(d, Math.hypot(x - S.x, z - S.z) - 0.3); return d; }
/** Distance to anything built to walk on or sit at (path stones, bridge, benches, jetty, firepits): the island's scatter is cleared off these. */
export function walkwayDist(x, z, routes) { return Math.min(footpathDist(x, z, routes), bridgeDist(x, z), benchDist(x, z), jettyDist(x, z), firepitDist(x, z)); }
/** Distance to the bridge's footprint (< 0 under the deck). */
export function bridgeDist(x, z) {
  const B = BRIDGE, dx = x - B.x, dz = z - B.z, u = Math.abs(dx * B.ax + dz * B.az) - B.half, v = Math.abs(dx * B.az - dz * B.ax) - B.width / 2;
  return Math.max(u, v) < 0 ? Math.max(u, v) : Math.hypot(Math.max(u, 0), Math.max(v, 0));
}
/** Spruce forest density 0..1: noise-driven groves between the meadow around the plot and the beach. */
export function forest(x, z) {
  const groves = smooth(0.1, 0.32, fbm2(x * 0.045 + SZ, z * 0.045 + SX, 3));
  const r = Math.hypot(x, z), inland = smooth(IC.beachWidth, IC.beachWidth + 5, coastDist(x, z));
  return clamp(groves * smooth(SC.clearingRadius, SC.clearingRadius + 10, r) * inland);
}
/** Walkable path from the cabin steps to the pond shore (a capsule; scatter and world grass keep it clear). */
export const PATH = (() => {
  const a = { x: HOUSE.x + 0.95, z: HOUSE.z + CB.ZW + 0.85 }, ang = Math.atan2(a.z - LAKE.z, a.x - LAKE.x), r = lakeR(ang) * 1.05;
  return { a, b: { x: LAKE.x + Math.cos(ang) * r, z: LAKE.z + Math.sin(ang) * r } };
})();
function segDist(x, z, a, b) { const vx = b.x - a.x, vz = b.z - a.z, t = clamp(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)); return Math.hypot(x - a.x - vx * t, z - a.z - vz * t); }
/**
 * Exclusion zones for scattered trees and rocks. Each entry returns a signed distance (< 0 inside).
 * Register more with EXCLUSIONS.push(fn) before the scatter runs (for example for a new building).
 */
export const EXCLUSIONS = [
  (x, z) => Math.max(Math.abs(x), Math.abs(z)) - (WC.coreHalf + 0.5),                        // the authored plot itself
  (x, z) => houseRectDist(x, z) - 3,                                                          // cabin + yard
  (x, z) => (lakeD(x, z) - 1) * lakeR(Math.atan2(z - LAKE.z, x - LAKE.x)) - 2.5,              // pond + shore
  (x, z) => segDist(x, z, PATH.a, PATH.b) - SC.pathWidth / 2,                                 // cabin -> pond path
  (x, z) => streamDist(x, z) - 1.4,                                                          // the stream and its banks
];
export function excluded(x, z, margin = 0) { for (const f of EXCLUSIONS) if (f(x, z) < margin) return true; return false; }

/**
 * The ten keepsakes hidden round the island (app/items.js picks them up, once only; their models:
 * assets/story/keepsakes.js; the shelf in the cabin has a place for each, SHELF.places). (x, z) where it lies, y its
 * base (on the ground unless given), ry its turn; hint: its line in the journal until found. The grass is low round
 * each (world/grass.js), so it can be seen from a few steps.
 */
export const KEEPSAKES = (() => {
  const T = TREEHOUSE, [tx, tz] = T.toWorld(0.35, -1.18), fs = STONES.stones.find(s => s.fallen), cx = CAVERNS.halls[1].x - 2.9, cz = CAVERNS.halls[1].z + 0.4;   // the geode: by the paintings in the crystal chamber
  const SUNSET = BENCHES[1], [bx, bz] = benchPoint(SUNSET, 0.35, 0.05), wa = 2.4, wm = WELL.r - 0.07;
  return [
    { kind: 'compass', x: tx, z: tz, y: T.deck + 0.918, ry: 0.6, hint: 'Where someone once kept watch, high in the trees, on the shelf.' },
    { kind: 'spyglass', x: STONES.x + Math.cos(fs.a) * (STONES.r - 0.75), z: STONES.z + Math.sin(fs.a) * (STONES.r - 0.75), ry: 1.9, hint: 'In the stone ring, by the stone that fell.' },
    { kind: 'geode', x: cx, z: cz, y: (caveFloor(cx, cz) ?? CAVERNS.halls[1].floor) + 0.04, ry: 0.4, hint: 'Deep in the dark, where the walls are painted. Bring a light.' },
    { kind: 'shipBottle', x: 40.9, z: -35.3, ry: 2.3, hint: 'Beside an old boat that will never sail again.' },
    { kind: 'ammonite', x: -16.8, z: -31.1, ry: 0.8, hint: 'On the north beach, below the hill where you lie and watch the sky.' },
    { kind: 'glassFloat', x: 8.7, z: 27.5, ry: 0, hint: 'Washed up on the south beach, below the hill that looks out to sea.' },
    { kind: 'pocketWatch', x: WELL.x + Math.cos(wa) * wm, z: WELL.z + Math.sin(wa) * wm, y: WELL.y + WELL.rim, ry: -0.5, hint: 'Someone set it down while drawing water.' },
    { kind: 'birdNest', x: -20.95, z: 18.25, ry: 0, hint: 'Fallen from a spruce, a few steps from the fire in the woods.' },
    { kind: 'antler', x: -16.2, z: -13.45, ry: 2.6, hint: 'In the west meadow, where you lie with your feet to the sunset.' },
    { kind: 'horseshoe', x: bx, z: bz, ry: -1.6, hint: 'Under the seat where you watch the sun go down.' },
  ].map(k => ({ ...k, y: k.y !== undefined ? k.y : H(k.x, k.z) }));
})();
/** Distance to the nearest keepsake's place on the ground. */
export function keepsakeDist(x, z) { let d = Infinity; for (const k of KEEPSAKES) d = Math.min(d, Math.hypot(x - k.x, z - k.z)); return d; }

/**
 * Rough water round the lighthouse rock: 1 within ROUGH.full m of it, fading to 0 at ROUGH.edge (the sea patch in
 * assets/water/pond.js carries the swell there; app/boating.js rides it and feels a stronger wind). SWELL: the three
 * long waves rolling in from the open sea to the east, as [direction x, direction z, wavelength m, share]; swellAt
 * gives the height and slope, the same sum as the patch's vertex shader.
 */
export const ROUGH = { full: 16, edge: 44, amp: 0.42, wind: 0.6 };
export const SWELL = [[-0.97, 0.24, 11, 0.55], [-0.86, -0.51, 7.2, 0.3], [-0.6, 0.8, 4.6, 0.15]];
export function roughAt(x, z) { return 1 - smooth(ROUGH.full, ROUGH.edge, Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z)); }
/** The swell's height and slope { h, dx, dz } at (x, z), time t (s), wind setting w (0 .. 1.6). */
export function swellAt(x, z, t, w) {
  const A = ROUGH.amp * roughAt(x, z) * (0.7 + 0.3 * Math.min(1, w)); let h = 0, dx = 0, dz = 0;
  if (A <= 0) return { h, dx, dz };
  for (const [ux, uz, L, s] of SWELL) {
    const k = Math.PI * 2 / L, om = Math.sqrt(9.81 * k), ph = k * (ux * x + uz * z) - om * t;
    h += A * s * Math.sin(ph); dx += A * s * k * ux * Math.cos(ph); dz += A * s * k * uz * Math.cos(ph);
  }
  return { h, dx, dz };
}
