import * as THREE from 'three';
import { V, clamp, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { JETTY, SEA_Y, H, jettyDeckY } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';
import { createLanternKit } from '../cabin/benches.js';

/**
 * The wooden jetty on the east beach (site: JETTY in world/layout.js): a plank deck on three stringers, carried by pairs
 * of piles driven into the sea floor (dark and weedy where the water laps them), a wider head at the end with two
 * mooring bollards on the boat's side, a crate with a fishing net thrown over it and a coil of rope, side stairs down to
 * the sand, and a lamp post on the far corner whose lantern lights with the cabin's lights (the benches' lantern kit).
 * Bollards, lamp post, crate and piles are solid. Wood and net textures and every choice use their own random numbers.
 * Every number is in JETTY_LOOK.
 */
export const JETTY_LOOK = {
  plank: { width: 0.15, gap: 0.018, thick: 0.045 },
  stringer: [0.09, 0.16],           // width, depth
  pileR: 0.11, pileEvery: 2.3,      // piles: radius, spacing along the jetty
  pole: { height: 2.55, size: 0.11 },
  crate: [0.62, 0.42, 0.46],        // length, height, depth
  colors: { deck: [0.74, 0.66, 0.56], frame: [0.5, 0.43, 0.35], pile: [0.36, 0.31, 0.26], weed: [0.16, 0.2, 0.1], crate: [0.7, 0.58, 0.42] },
};

export function createJetty(ctx) {
  const { scene, maxAniso } = ctx, J = JETTY, JL = JETTY_LOOK, C = JL.colors;
  let seed = 6620; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();

  const woodTex = canvasTex(128, 512, (g, w, h) => {   // weathered grain along v
    g.fillStyle = '#8f7f6c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * w, y = rnd() * h, len = 40 + rnd() * 240;
      g.strokeStyle = rnd() < 0.55 ? `rgba(55,42,32,${0.1 + rnd() * 0.3})` : `rgba(205,195,180,${0.08 + rnd() * 0.22})`;
      g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-3, 3), y + len * 0.33, x + rr(-3, 3), y + len * 0.66, x + rr(-2, 2), y + len); g.stroke();
    }
    for (let i = 0; i < 12; i++) { const x = rnd() * w, y = rnd() * h; g.strokeStyle = 'rgba(30,22,16,.6)'; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-2, 2), y + 20 + rnd() * 90); g.stroke(); }
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.anisotropy = maxAniso;
  const netTex = canvasTex(256, 256, g => {   // knotted diamond mesh
    g.clearRect(0, 0, 256, 256); g.strokeStyle = 'rgba(70,82,64,0.95)'; g.lineWidth = 2.2;
    for (let i = -256; i < 512; i += 21) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;

  const parts = [], tone = (g, c, k = 0.08) => { const m = 1 + rr(-k, k), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c[0] * m; a[i + 1] = c[1] * m; a[i + 2] = c[2] * m; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const box = (w, h, d, x, y, z, rot = [0, 0, 0]) => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, off = rnd();
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.3 + off, uv.getY(k) * Math.max(w, h, d) * 0.7 + off * 3);
    g.applyMatrix4(new THREE.Matrix4().compose(new V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new V(1, 1, 1))); return g.toNonIndexed();
  };
  const post = (x, z, r, y0, y1, radial = 9) => {   // a round pile, weedy and dark where the sea laps it
    const g = new THREE.CylinderGeometry(r * rr(0.9, 1.0), r, y1 - y0, radial, 6).toNonIndexed(); g.translate(x, (y0 + y1) / 2, z);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), m = 1 + rr(-0.1, 0.1);
    for (let k = 0; k < p.count; k++) { const y = p.getY(k), wet = clamp((SEA_Y + 0.25 - y) / 0.3), s = C.pile.map((v, i) => (v + (C.weed[i] - v) * wet) * m); c.set(s, k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const halfW = x => x >= J.head.x0 ? J.head.halfW : J.halfW, P = JL.plank, top = J.deckY;

  // deck planks across the jetty, the head's longer
  for (let x = J.x0 + P.width / 2; x <= J.x1 - P.width / 2 + 1e-3; x += P.width + P.gap) {
    const hw = halfW(x), len = 2 * hw + rr(-0.04, 0.02);
    parts.push(tone(box(P.width * rr(0.93, 1.03), P.thick, len, x, top - P.thick / 2 + rr(-0.004, 0.003), J.z + rr(-0.02, 0.02), [rr(-0.01, 0.01), rr(-0.02, 0.02), 0]), C.deck, 0.1));
  }
  // stringers under them, and the head's frame
  const [sw, sd] = JL.stringer, sy = top - P.thick - sd / 2;
  for (const dz of [-J.halfW + 0.12, 0, J.halfW - 0.12]) parts.push(tone(box(J.head.x0 - J.x0, sd, sw, (J.x0 + J.head.x0) / 2, sy, J.z + dz), C.frame));
  for (const dz of [-J.head.halfW + 0.1, -0.45, 0.45, J.head.halfW - 0.1]) parts.push(tone(box(J.x1 - J.head.x0, sd, sw, (J.head.x0 + J.x1) / 2, sy, J.z + dz), C.frame));
  // piles in pairs, a cross beam on each pair; the head on a grid of them
  const pileXs = []; for (let x = J.x0 + 1.4; x < J.head.x0 - 0.5; x += JL.pileEvery) pileXs.push(x);
  const piles = [];
  for (const x of pileXs) for (const s of [-1, 1]) piles.push([x, J.z + s * (J.halfW + 0.02)]);
  for (const x of [J.head.x0 + 0.15, (J.head.x0 + J.x1) / 2, J.x1 - 0.12]) for (const s of [-1, 1]) piles.push([x, J.z + s * (J.head.halfW + 0.02)]);
  for (const [x, z] of piles) {
    parts.push(post(x, z, JL.pileR, H(x, z) - 0.4, top - 0.02));
    obstacles.add(x, z, JL.pileR + 0.08, top + 0.3);   // solid from the sand (not for someone on the deck above)
  }
  for (const x of pileXs) parts.push(tone(box(0.1, 0.12, 2 * J.halfW + 0.26, x, sy - 0.02, J.z), C.frame));
  // bollards on the berth side of the head
  for (const [x, z] of J.bollards) {
    parts.push(post(x, z, 0.1, top - 0.1, top + 0.48, 10));
    const cap = new THREE.CylinderGeometry(0.12, 0.11, 0.05, 10).toNonIndexed(); cap.translate(x, top + 0.5, z); parts.push(tone(cap, C.pile));
    obstacles.add(x, z, 0.14, top + 1.9);
  }
  // side stairs down to the sand: two strings and the treads
  const S = J.stair, sOut = S.steps * S.run, zEdge = J.z + S.side * J.halfW;
  for (const x of [S.x0 + 0.03, S.x1 - 0.03]) {
    const y0 = top - 0.05, y1 = top - S.steps * S.rise - 0.05, len = Math.hypot(sOut, y0 - y1), mid = zEdge + S.side * sOut / 2;
    parts.push(tone(box(0.05, 0.14, len + 0.1, x, (y0 + y1) / 2, mid, [S.side * Math.atan2(y0 - y1, sOut), 0, 0]), C.frame));
  }
  for (let i = 1; i <= S.steps; i++) {
    const out = (i - 0.5) * S.run, y = jettyDeckY((S.x0 + S.x1) / 2, zEdge + S.side * out);
    parts.push(tone(box(S.x1 - S.x0, 0.04, S.run - 0.02, (S.x0 + S.x1) / 2, y - 0.02, zEdge + S.side * out), C.deck, 0.1));
  }
  // the lamp post on the far corner (the lantern sits on its top)
  const [lx, lz] = J.pole, PL = JL.pole;
  parts.push(tone(box(PL.size, PL.height + 0.3, PL.size, lx, top + PL.height / 2 - 0.15, lz), C.frame));
  parts.push(tone(box(0.2, 0.03, 0.2, lx, top + PL.height + 0.015, lz), C.frame));
  parts.push(tone(box(0.05, 0.05, 0.5, lx, top + PL.height - 0.35, lz - 0.18, [0.8, 0, 0]), C.frame));   // a brace
  obstacles.add(lx, lz, 0.12, top + 3);
  // a crate by the lamp post, a net thrown over it, a coil of rope by the bollards
  const [cl, ch, cd] = JL.crate, cx = 43.1, cz = J.z + J.head.halfW - 0.42, crateRot = 0.18;
  const crate = [];
  crate.push(box(cl, ch, cd, 0, ch / 2, 0));
  for (const y of [0.06, ch - 0.06]) for (const s of [-1, 1]) crate.push(box(cl + 0.02, 0.07, 0.02, 0, y, s * (cd / 2 + 0.005)));   // slats
  for (const s of [-1, 1]) for (const e of [-1, 1]) crate.push(box(0.05, ch, 0.05, s * (cl / 2 - 0.02), ch / 2, e * (cd / 2 - 0.02)));
  const crateM = new THREE.Matrix4().compose(new V(cx, top, cz), new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), crateRot), new V(1, 1, 1));
  crate.forEach((g, i) => { g.applyMatrix4(crateM); parts.push(tone(g, i ? C.frame : C.crate, 0.06)); });
  obstacles.add(cx, cz, 0.38, top + 1.9);
  // coil of rope
  const rope = [];
  for (let i = 0; i < 4; i++) { const t = new THREE.TorusGeometry(0.17 - i * 0.012, 0.018, 5, 18).toNonIndexed(); t.rotateX(Math.PI / 2); t.translate(42.5 + rr(-0.01, 0.01), top + 0.02 + i * 0.03, J.z - J.head.halfW + 0.45); rope.push(t); }
  const ropeMesh = new THREE.Mesh(mergeGeos(rope, ['position', 'normal']), new THREE.MeshStandardMaterial({ color: lin(0xb49a6a), roughness: 0.95, metalness: 0 }));

  // the net: a cloth draped over the crate and spilling onto the deck
  const net = new THREE.PlaneGeometry(1.2, 1.0, 16, 14), np = net.attributes.position;
  for (let k = 0; k < np.count; k++) {
    const u = np.getX(k), v = np.getY(k), over = clamp(1 - (Math.abs(u) - cl / 2 + 0.05) / 0.3) * clamp(1 - (Math.abs(v) - cd / 2 + 0.08) / 0.3);
    const y = 0.012 + (ch + 0.015) * over + 0.02 * Math.sin(u * 17 + v * 11) * (1 - over);
    np.setXYZ(k, u * (1 - 0.18 * over), y, v * (1 - 0.1 * over));
  }
  net.computeVertexNormals(); net.applyMatrix4(new THREE.Matrix4().compose(new V(cx - 0.12, top, cz + 0.03), new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), crateRot + 0.35), new V(1, 1, 1)));
  const netMesh = new THREE.Mesh(net, new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
  netMesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: netTex, alphaTest: 0.35 });

  const geo = mergeGeos(parts.map(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), ['position', 'normal', 'uv', 'color']);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: woodTex, vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.4, userData: { season: 'ice' } }));   // iced over in winter
  for (const m of [mesh, ropeMesh, netMesh]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  // the lantern on the post: its warm pool falls on the deck and the water around
  const kit = createLanternKit(ctx, rnd);
  kit.lantern(new THREE.Matrix4(), lx, top + PL.height + 0.13, lz, (x, z) => Math.max(jettyDeckY(x, z) + 0.004, SEA_Y + 0.015));
  kit.register();
  return { mesh, update: kit.update };
}
