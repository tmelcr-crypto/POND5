import { ISLANDS, islandH, MARSH_POOL } from './layout.js';
import { islandLife } from './islandLife.js';

/**
 * The outer islands' buildings as places you walk into (meshes: assets/islands/islandBuildings.js): each has a frame
 * (x, z, angle a: local +u points out through its door, +v to its left), and in that frame its floors, stairs, walls and
 * railings, and the furniture you walk round. app/controls.js asks buildingFloorY for the floor under you and
 * buildingWalls to keep you out of walls, railings and furniture; you go in and out through the doors only.
 *  - floors: { rect: [u0, u1, v0, v1] } or { r } (round), at y, less any holes (rects) cut in them
 *  - stairs: a rect climbing along u from y0 (at u0) to y1 (at u1) in n treads
 *  - walls: segments [u0, v0, u1, v1, yLo, yHi, pad]: they stop you while your feet are below yHi and your head above
 *    yLo; pad is half the wall's thickness
 * The windmill (Millholm): a round stone tower, the ground floor with the millstones, a steep stair up to the loft under
 * the cap where the windshaft turns the brake wheel. The beach hut (Palm Cay): one room on stilts, a porch, steps down to
 * the sand. The observatory (Ember Rock): a round stone room under the turning dome, the telescope on its pier. The
 * lodge (Heron Marsh): a plank house on stilts with a porch; steps down to the boardwalk that runs to the jetty.
 */
const STEP = 0.45;
function frame(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x, z, a, c, s, W: (u, v) => [x + c * u - s * v, z + s * u + c * v], L: (px, pz) => { const dx = px - x, dz = pz - z; return [dx * c + dz * s, -dx * s + dz * c]; } };
}
/** A ring of wall segments (radius r, n sides) with gaps: [angle, half-width in m] (angle 0 = +u). */
function ring(P, r, n, gaps, yLo, yHi, pad) {
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    if (gaps.some(([ga, hw]) => { let d = Math.abs(am - ga) % (Math.PI * 2); d = Math.min(d, Math.PI * 2 - d); return d * r < hw + (Math.PI * r / n); })) continue;
    P.walls.push([Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r, yLo, yHi, pad]);
  }
}
/** A rectangle's four sides as walls, with gaps on a side: gaps = { u1: [v0, v1] } etc. */
function box(P, u0, u1, v0, v1, yLo, yHi, pad, gaps = {}) {
  const side = (a, b, key, g) => { if (!g) { P.walls.push([...a, ...b, yLo, yHi, pad]); return; } const alongU = a[1] === b[1];
    const lo = alongU ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = alongU ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
    const seg = (p, q) => { if (q - p > 0.02) P.walls.push(alongU ? [p, a[1], q, a[1], yLo, yHi, pad] : [a[0], p, a[0], q, yLo, yHi, pad]); };
    seg(lo, g[0]); seg(g[1], hi); };
  side([u0, v0], [u1, v0], 'v0', gaps.v0); side([u0, v1], [u1, v1], 'v1', gaps.v1); side([u0, v0], [u0, v1], 'u0', gaps.u0); side([u1, v0], [u1, v1], 'u1', gaps.u1);
}

function windmill(S) {
  const [x, z, h] = S.top, P = { kind: 'windmill', ...frame(x, z, Math.atan2(-z, -x)), floors: [], stairs: [], walls: [], reach: 6 };
  P.base = h - 0.3; P.height = 7; P.f0 = h + 0.3; P.f1 = P.f0 + 3.0; P.wall = 0.32;
  P.Ro = y => 2.2 - 0.65 * (y - P.base) / P.height; P.Ri = y => P.Ro(y) - P.wall;
  P.door = { w: 1.0, h: 2.0 };
  const mid = y => P.Ro(y) - P.wall / 2;
  ring(P, mid(P.f0 + 1), 22, [[0, P.door.w / 2]], P.f0 - 0.6, P.f1, P.wall / 2);
  ring(P, mid(P.f1 + 1), 20, [], P.f1 - 0.1, P.base + P.height, P.wall / 2);
  P.stair = { rect: [-1.25, 1.0, 0.45, 1.1], y0: P.f0, y1: P.f1, n: 11 };
  P.hole = [-0.45, 1.0, 0.4, 1.2];
  P.floors.push({ r: P.Ri(P.f0), y: P.f0 }, { rect: [P.Ri(P.f0) - 0.2, P.Ro(P.f0), -0.55, 0.55], y: P.f0 }, { r: P.Ri(P.f1), y: P.f1, holes: [P.hole] });
  P.stairs.push(P.stair);
  P.walls.push([-0.3, 0.42, 1.0, 0.42, P.f0 - 0.3, P.f0 + 1.0, 0.03]);                                        // under the stair
  P.walls.push([-0.45, 0.4, 1.0, 0.4, P.f1 + 0.6, P.f1 + 1.0, 0.03], [-0.45, 0.4, -0.45, 1.2, P.f1 + 0.6, P.f1 + 1.0, 0.03]);   // the loft's rail round the stairwell (its top: whoever is on the stair passes under it)
  P.posts = [[0, 0, 0.18, P.f0 - 0.5, P.base + P.height + 1]];                                              // the main shaft
  doorSteps(P, S, P.Ro(P.f0), P.f0);
  return P;
}
function hut(S) {
  const I = S.I, [x, z] = S.build, h = islandH(I, x, z), a = Math.atan2(I.z - z - 30, I.x - x - 60);
  const P = { kind: 'hut', ...frame(x, z, a), floors: [], stairs: [], walls: [], reach: 6.5 };
  P.ground = h; P.deck = h + 1.1; P.room = [-1.6, 1.6, -1.6, 1.6]; P.porch = 2.7; P.wallH = 2.15;
  const foot = islandH(I, ...P.W(P.porch + 1.3, 0)), n = Math.max(2, Math.ceil((P.deck - foot) / 0.28));
  P.stair = { rect: [P.porch, P.porch + n * 0.3, -0.5, 0.5], y0: P.deck, y1: P.deck - (P.deck - foot) * n / (n + 0.5), n, down: true };
  P.floors.push({ rect: [-1.75, P.porch, -1.75, 1.75], y: P.deck }); P.stairs.push(P.stair);
  box(P, -1.6, 1.6, -1.6, 1.6, P.deck - 0.3, P.deck + P.wallH, 0.05, { u1: [-0.45, 0.45] });                   // the room, its door
  P.walls.push([1.6, -1.75, P.porch, -1.75, P.deck - 0.3, P.deck + 0.95, 0.03], [1.6, 1.75, P.porch, 1.75, P.deck - 0.3, P.deck + 0.95, 0.03]);   // the porch's rails
  P.walls.push([P.porch, -1.75, P.porch, -0.55, P.deck - 0.3, P.deck + 0.95, 0.03], [P.porch, 0.55, P.porch, 1.75, P.deck - 0.3, P.deck + 0.95, 0.03]);
  box(P, -1.75, P.porch, -1.75, 1.75, -99, P.deck - 0.25, 0.1, { u1: [-0.55, 0.55] });                        // (not under the deck)
  P.walls.push([P.porch, -0.55, P.porch + n * 0.3, -0.55, -99, P.deck + 0.9, 0.03], [P.porch, 0.55, P.porch + n * 0.3, 0.55, -99, P.deck + 0.9, 0.03]);   // the steps' sides
  P.posts = [];
  return P;
}
function observatory(S) {
  const [x, z, h] = S.top, P = { kind: 'observatory', ...frame(x, z, Math.atan2(-z, -x)), floors: [], stairs: [], walls: [], reach: 5 };
  P.base = h - 0.2; P.floor = h + 0.1; P.rOut = 2.6; P.rIn = 2.3; P.drumH = 3.0; P.door = { w: 1.0, h: 2.05 };
  ring(P, (P.rOut + P.rIn) / 2, 24, [[0, P.door.w / 2]], P.floor - 0.6, P.base + P.drumH + 2.5, (P.rOut - P.rIn) / 2);
  P.floors.push({ r: P.rIn, y: P.floor }, { rect: [P.rIn - 0.2, P.rOut, -0.55, 0.55], y: P.floor });
  P.posts = [[0, 0, 0.36, P.floor - 0.5, P.floor + 2.4]];   // the telescope's pier
  doorSteps(P, S, P.rOut, P.floor);
  return P;
}
function lodge(S) {
  const I = S.I, d = I.docks[0], [x, z] = S.build, h = Math.max(islandH(I, x, z), MARSH_POOL), a0 = d.W(0, 0), a = Math.atan2(a0[1] - z, a0[0] - x);
  const P = { kind: 'lodge', ...frame(x, z, a), floors: [], stairs: [], walls: [], reach: 7 };
  P.ground = h; P.floor = h + 1.2; P.house = [-1.7, 1.7, -2.1, 2.1]; P.plat = [-1.9, 2.7, -2.3, 2.3]; P.wallH = 2.3;
  // the boardwalk: from the foot of the steps to the jetty's root, planks a little over the ground (or the pools)
  const bwY = (px, pz) => Math.max(islandH(I, px, pz), MARSH_POOL) + 0.25;
  const [fx, fz] = P.W(P.plat[1] + 1.2, 0), footY = bwY(fx, fz), n = Math.max(2, Math.ceil((P.floor - footY) / 0.26));
  P.stair = { rect: [P.plat[1], P.plat[1] + n * 0.3, -0.55, 0.55], y0: P.floor, y1: footY + (P.floor - footY) / (n + 0.5) * 0.5, n, down: true };
  const [sx, sz] = P.W(P.plat[1] + n * 0.3, 0);
  P.boardwalk = []; const len = Math.hypot(a0[0] - sx, a0[1] - sz), K = Math.max(4, Math.ceil(len / 0.3));
  for (let k = 0; k <= K; k++) { const t = k / K, bx = sx + (a0[0] - sx) * t, bz = sz + (a0[1] - sz) * t; P.boardwalk.push([bx, bwY(bx, bz), bz]); }
  P.boardwalkAng = Math.atan2(a0[1] - sz, a0[0] - sx);
  P.floors.push({ rect: [P.plat[0], P.plat[1], P.plat[2], P.plat[3]], y: P.floor }); P.stairs.push(P.stair);
  box(P, ...P.house, P.floor - 0.3, P.floor + P.wallH, 0.06, { u1: [-0.45, 0.45] });
  const [u0, u1, v0, v1] = P.plat, rail = P.floor + 0.95;
  P.walls.push([u0, v0, u1, v0, P.floor - 0.3, rail, 0.03], [u0, v1, u1, v1, P.floor - 0.3, rail, 0.03], [u0, v0, u0, v1, P.floor - 0.3, rail, 0.03]);
  P.walls.push([u1, v0, u1, -0.6, P.floor - 0.3, rail, 0.03], [u1, 0.6, u1, v1, P.floor - 0.3, rail, 0.03]);
  box(P, u0, u1, v0, v1, -99, P.floor - 0.25, 0.1, { u1: [-0.6, 0.6] });
  P.walls.push([u1, -0.6, u1 + n * 0.3, -0.6, -99, P.floor + 0.9, 0.03], [u1, 0.6, u1 + n * 0.3, 0.6, -99, P.floor + 0.9, 0.03]);
  P.posts = [];
  return P;
}

/** Stone steps from a door (at u0, floor y) down to the ground outside it when it drops away; the lowest ground round
 *  the building (r m out) for its foundation. */
function doorSteps(P, S, u0, y) {
  const foot = islandH(S.I, ...P.W(u0 + 1.2, 0)), drop = y - foot;
  P.footMin = Infinity; for (let k = 0; k < 24; k++) P.footMin = Math.min(P.footMin, islandH(S.I, ...P.W(Math.cos(k / 24 * 6.283) * (u0 + 0.3), Math.sin(k / 24 * 6.283) * (u0 + 0.3))));
  if (drop < 0.3) return;
  const n = Math.ceil(drop / 0.24); let d = drop;
  for (let k = 0; k < 3; k++) { const f = islandH(S.I, ...P.W(u0 + n * 0.3 + 0.2, 0)); d = y - f; }   // (the ground at the stair's foot)
  const m = Math.max(n, Math.ceil(d / 0.24));
  P.outStair = { rect: [u0, u0 + m * 0.3, -0.62, 0.62], y0: y, y1: y - d * m / (m + 0.5), n: m, down: true }; P.stairs.push(P.outStair);
}
let PLANS = null;
/** The four buildings' plans (built once). */
export function buildingPlans() {
  if (PLANS) return PLANS;
  const life = islandLife(), make = { meadow: windmill, palm: hut, volcano: observatory, marsh: lodge };
  PLANS = life.sites.map(S => make[S.I.kind](S));
  PLANS.forEach(P => { P.I = ISLANDS.find(I => Math.hypot(I.x - P.x, I.z - P.z) < I.r * 1.5); });
  return PLANS;
}

const inRect = (u, v, r) => u >= r[0] && u <= r[1] && v >= r[2] && v <= r[3];
/** The floor, stair tread or boardwalk under (x, z) within a step of feet `feet`, or -Infinity. */
export function buildingFloorY(x, z, feet) {
  let best = -Infinity;
  for (const P of buildingPlans()) {
    if (Math.abs(x - P.x) > P.reach + 8 || Math.abs(z - P.z) > P.reach + 8) continue;
    const [u, v] = P.L(x, z), ok = y => { if (y <= feet + STEP && y > best) best = y; };
    for (const f of P.floors) if ((f.rect ? inRect(u, v, f.rect) : u * u + v * v <= f.r * f.r) && !(f.holes || []).some(hh => inRect(u, v, hh))) ok(f.y);
    for (const s of P.stairs) if (inRect(u, v, s.rect)) { const t = (u - s.rect[0]) / (s.rect[1] - s.rect[0]), k = s.down ? Math.floor(t * s.n) + 1 : Math.ceil(t * s.n), y = s.y0 + (s.y1 - s.y0) * Math.min(1, k / s.n); if (y <= feet + 0.95 && y > best) best = y; }   // (a stair: the climb's easing lags a tread or two)
    if (P.boardwalk) for (let k = 1; k < P.boardwalk.length; k++) { const [ax, ay, az] = P.boardwalk[k - 1], [bx, , bz] = P.boardwalk[k], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = ((x - ax) * dx + (z - az) * dz) / l2;
      if (t >= 0 && t <= 1 && Math.abs((x - ax) * dz - (z - az) * dx) / Math.sqrt(l2) < 0.62) ok(ay); }
  }
  return best;
}
/** Keep a walker (feet at `feet`, from prev to p) out of the buildings' walls, rails and furniture. p moves. */
export function buildingWalls(p, prev, feet, radius = 0.22) {
  for (const P of buildingPlans()) {
    if (Math.abs(p.x - P.x) > P.reach + 2 || Math.abs(p.z - P.z) > P.reach + 2) continue;
    let [u, v] = P.L(p.x, p.z); const [pu, pv] = P.L(prev.x, prev.z);
    for (const [u0, v0, u1, v1, yLo, yHi, pad] of P.walls) {
      if (feet > yHi - 0.05 || feet + 1.75 < yLo) continue;
      const du = u1 - u0, dv = v1 - v0, l2 = du * du + dv * dv, t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / l2)), qu = u0 + du * t, qv = v0 + dv * t;
      let nu = u - qu, nv = v - qv, d = Math.hypot(nu, nv); const r = radius + pad;
      if (d >= r) continue;
      const side = (pu - u0) * dv - (pv - v0) * du, now = (u - u0) * dv - (v - v0) * du;   // stay on the side you came from
      if (d < 1e-5 || Math.sign(side) !== Math.sign(now)) { const l = Math.sqrt(l2), s = Math.sign(side) || 1; nu = dv / l * s; nv = -du / l * s; d = 0; if (t <= 0 || t >= 1) { nu = u - qu; nv = v - qv; const m = Math.hypot(nu, nv) || 1; nu /= m; nv /= m; } }
      else { nu /= d; nv /= d; }
      u = qu + nu * r; v = qv + nv * r;
    }
    for (const [cu, cv, cr, yLo, yHi] of P.posts) {
      if (feet > yHi || feet + 1.75 < yLo) continue;
      const du = u - cu, dv = v - cv, d = Math.hypot(du, dv), r = cr + radius; if (d < r && d > 1e-5) { u = cu + du / d * r; v = cv + dv / d * r; }
    }
    [p.x, p.z] = P.W(u, v);
  }
}
/** Inside a building's walls (for its lamps and sound): the plan, or null. */
export function buildingAt(x, z) {
  for (const P of buildingPlans()) { if (Math.abs(x - P.x) > 4 || Math.abs(z - P.z) > 4) continue; const [u, v] = P.L(x, z);
    if (P.kind === 'windmill' ? u * u + v * v < P.Ri(P.f0) ** 2 : P.kind === 'observatory' ? u * u + v * v < P.rIn ** 2 : P.kind === 'hut' ? inRect(u, v, P.room) : inRect(u, v, P.house)) return P; }
  return null;
}
