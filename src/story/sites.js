import { H, HOUSE, CB, BED, WELL, GARDEN, BENCHES, benchPoint, JETTY, FIREPITS, STONES, TREEHOUSE, CAVERNS, STORY, BRIDGE, LAKE, APP, SIGNS, LIE_SPOTS, ISLET, TREASURE, LIGHTHOUSE, ISLANDS, EMBER, LAVA_TUBE, MARSH_POOL, jettyDeckY, caveFloor, seaY, SEA_Y } from '../world/layout.js';
import { buildingPlans, buildingFloorY, buildingWalls } from '../world/buildingPlans.js';

/**
 * Where the story's letters lie (app/letters.js shows them, story/content.js says which letter is where): 58 places
 * round all the islands, each { id, name (where it is, as the journal says it), x, y, z, flat } (flat: lying on a floor
 * or a bed, else pinned to a short post in the ground). Worked out once, after the world is built (the islands' firepits
 * and buildings are placed then). Also the lighthouse radio's place (RADIO) for the story's last chapters.
 */
let SITES = null;
const ground = (x, z) => Math.max(H(x, z), jettyDeckY(x, z), buildingFloorY(x, z, H(x, z) + 0.5));
const pt = (id, name, x, z, o = {}) => ({ id, name, x, z, y: o.y !== undefined ? o.y : ground(x, z), flat: !!o.flat });
/** A free spot on a building's lowest floor (away from its walls and furniture), near local (u, v). */
export function insideSpot(P, u0, v0) {
  const f0 = Math.min(...P.floors.map(f => f.y)); let best = null, bd = 1e9;
  for (let u = -4; u <= 4; u += 0.25) for (let v = -4; v <= 4; v += 0.25) {
    const [x, z] = P.W(u, v), y = buildingFloorY(x, z, f0 + 0.1); if (Math.abs(y - f0) > 0.05) continue;
    const q = { x, z }; buildingWalls(q, { x, z }, f0, 0.55); if (Math.hypot(q.x - x, q.z - z) > 1e-4) continue;
    const d = Math.hypot(u - u0, v - v0); if (d < bd) { bd = d; best = { x, z, y: f0 }; }
  }
  return best;
}
/** A dry spot on an island at radius fraction f of its size towards angle a (from home), stepping inwards until dry. */
function onIsland(I, a, f) {
  const dA = Math.atan2(-I.z, -I.x) + a;
  for (let r = I.r * f; r > 0; r -= 0.5) { const x = I.x + Math.cos(dA) * r, z = I.z + Math.sin(dA) * r; if (H(x, z) > SEA_Y + 0.35) return [x, z]; }
  return [I.x, I.z];
}

export function letterSites() {
  if (SITES) return SITES;
  const S = [], add = s => { S.push(s); return s; };
  const off = (p, dx, dz) => [p.x + dx, p.z + dz];
  /* ---- the home island ---- */
  add(pt('bed', 'on the bed in the cabin', BED.cx, BED.cz + 0.25, { y: BED.top + 0.02, flat: true }));
  add(pt('porch', 'by the cabin steps', HOUSE.x + 1.9, HOUSE.z + CB.ZW + 0.9));
  add(pt('well', 'at the well', WELL.x + 1.25, WELL.z + 0.6));
  add(pt('garden', 'at the garden', GARDEN.x - 3.2, GARDEN.z - 1.9));
  { const [x, z] = benchPoint(BENCHES[0], 1.35, 0.55); add(pt('sunrise', 'by the sunrise bench', x, z)); }
  { const [x, z] = benchPoint(BENCHES[1], 1.4, 0.55); add(pt('sunset', 'by the sunset bench', x, z)); }
  add(pt('jettyRoot', 'where the jetty meets the sand', JETTY.x0 + 1.6, JETTY.z + 0.35, { flat: true, y: JETTY.deckY + 0.02 }));
  add(pt('jettyHead', 'on the jetty head', JETTY.head.x0 + 0.45, JETTY.z - 0.75, { flat: true, y: JETTY.deckY + 0.02 }));
  for (const [i, n] of [[0, 'by the beach fire'], [1, 'by the fire in the woods'], [2, 'by the fire on the north hill']]) { const f = FIREPITS[i]; add(pt('fire' + i, n, ...off(f, i ? 1.9 : -1.9, i ? -1.4 : 1.4))); }
  add(pt('stones', 'in the stone ring', STONES.x - 0.9, STONES.z + 0.9));
  { const [x, z] = TREEHOUSE.toWorld(-0.6, 0.4); add(pt('treehouse', 'up in the treehouse', x, z, { y: TREEHOUSE.deck + 0.02, flat: true })); }
  add(pt('treeFoot', 'at the foot of the treehouse ladder', TREEHOUSE.foot.x + 1.1, TREEHOUSE.foot.z + 0.6));
  { const h = CAVERNS.halls[0], x = h.x + 2.2, z = h.z - 1.2; add(pt('cavern', 'in the great hall of the caverns', x, z, { y: caveFloor(x, z) ?? h.floor, flat: true })); }
  { const h = CAVERNS.halls[1], x = h.x + 1.4, z = h.z - 1.4; add(pt('crystal', 'in the crystal chamber', x, z, { y: caveFloor(x, z) ?? h.floor, flat: true })); }
  add(pt('crooked', 'under the crooked tree', STORY.tree.x - 1.2, STORY.tree.z + 0.9));
  { const x = BRIDGE.x + BRIDGE.ax * (BRIDGE.half + 1.3) + BRIDGE.az * 0.8, z = BRIDGE.z + BRIDGE.az * (BRIDGE.half + 1.3) - BRIDGE.ax * 0.8; add(pt('bridge', 'by the footbridge', x, z)); }
  add(pt('pond', 'on the pond shore', LAKE.x + 0.4, LAKE.z + 3.3));
  add(pt('apple', 'under the old apple tree', APP.x + 1.5, APP.z + 0.7));
  add(pt('signpost', 'at the signpost by the bridge', SIGNS[0].x + 0.7, SIGNS[0].z - 0.6));
  LIE_SPOTS.slice(1).forEach((s, i) => add(pt('lie' + (i + 1), ['on the north hill', 'in the glade in the east wood', 'on the south slope', 'in the west meadow'][i], s.x + 1.3, s.z + 1.0)));
  add(pt('northBeach', 'on the north beach', -16.8 + 1.6, -31.1 + 1.2));
  add(pt('southBeach', 'on the south beach', 8.7 - 1.5, 27.5 - 1.0));
  add(pt('islet', 'on the islet', ISLET.x - 2.2, ISLET.z + 1.4));
  add(pt('cairn', 'by the cairn on the islet', TREASURE.x - 1.4, TREASURE.z + 1.0));
  add(pt('wreck', 'by the old boat on the islet', ISLET.x + 1.6, ISLET.z + 2.2));
  /* ---- the lighthouse rock ---- */
  { const L = LIGHTHOUSE, J = L.jetty, T = L.tower;
    add(pt('lhJetty', 'on the lighthouse jetty', J.head.x0 - 0.8, J.z + 0.8, { flat: true, y: J.deckY + 0.02 }));
    add(pt('lhLanding', 'at the foot of the lighthouse steps', L.x - L.gully.u1 - 0.2, L.z + 0.35));
    add(pt('lhDoor', 'by the lighthouse door', T.x - 3.4, T.z + 1.3));
    add(pt('lhPlateau', 'on the far side of the lighthouse rock', T.x + 4.2, T.z - 3.6)); }
  /* ---- the four islands ---- */
  const plans = buildingPlans(), plan = k => plans.find(P => P.kind === k);
  ISLANDS.forEach(I => {
    const k = I.kind, d = I.docks;
    add(pt(k + 'Jetty', `on the ${I.name} jetty`, ...d[0].W(1.0, 0.35), { flat: true, y: d[0].deckY + 0.02 }));
    if (d[1]) add(pt(k + 'Jetty2', `on the second ${I.name} jetty`, ...d[1].W(1.0, -0.35), { flat: true, y: d[1].deckY + 0.02 }));
    const P = plan({ meadow: 'windmill', palm: 'hut', volcano: 'observatory', marsh: 'lodge' }[k]), q = insideSpot(P, -0.6, 1.2);
    if (q) add(pt(k + 'House', { meadow: 'inside the windmill', palm: 'inside the beach hut', volcano: 'inside the observatory', marsh: 'inside the marsh lodge' }[k], q.x, q.z, { y: q.y + 0.01, flat: true }));
    const pit = FIREPITS.find(f => f.name === 'isle-' + k); if (pit) add(pt(k + 'Fire', `by the fire on ${I.name}`, ...off(pit, 1.8, 1.3)));
    if (k !== 'volcano') { add(pt(k + 'Far', `on the far side of ${I.name}`, ...onIsland(I, Math.PI, 0.8))); add(pt(k + 'Side', `on ${I.name}, looking west`, ...onIsland(I, Math.PI / 2, 0.7))); }
  });
  /* ---- Ember Rock's own places ---- */
  { const E = EMBER, c2 = E.path[E.corners[2]], c4 = E.path[E.corners[4]];
    add(pt('emberSpring', 'by the hot spring', E.spring.x + E.spring.r + 1.2, E.spring.z));
    add(pt('emberBend', 'at a bend of the path up Ember Rock', c2[0], c2[1]));
    add(pt('emberHigh', 'high on the path up Ember Rock', c4[0], c4[1]));
    const h = LAVA_TUBE.halls[0], p = h.pool, x = h.x + (h.x - p.x) * 1.2, z = h.z + (h.z - p.z) * 1.2; add(pt('lavaHall', 'in the lava chamber', x, z, { y: caveFloor(x, z) ?? h.floor, flat: true }));
    const a = E.cove.a, R = E.I.r; let cx = 0, cz = 0; for (let r = R * 0.95; r > R * 0.3; r -= 0.4) { cx = E.I.x + Math.cos(a) * r; cz = E.I.z + Math.sin(a) * r; if (H(cx, cz) > seaY() + 0.3) break; }
    add(pt('cove', 'in the black-sand cove', cx, cz)); }
  { const q = plan('lodge'); if (q && q.boardwalk) { const b = q.boardwalk[Math.floor(q.boardwalk.length / 2)]; add(pt('boardwalk', 'on the marsh boardwalk', b[0], b[2], { flat: true, y: b[1] + 0.02 })); } }
  void MARSH_POOL;
  SITES = S; return S;
}
/** The radio on the keeper's table in the lighthouse (the story's last chapters): its world position. */
export function radioSite() {
  const T = LIGHTHOUSE.tower, a = T.door + Math.PI + 0.2, x = T.x + 0.55 * Math.cos(a), z = T.z + 0.55 * Math.sin(a);
  const ta = T.door + Math.PI, s = Math.sin(ta), c = Math.cos(ta);
  return { x: x - c * 0.05 + s * 0.2, z: z - s * 0.05 - c * 0.2, y: T.floor + 0.76, rot: Math.PI / 2 - ta };
}
