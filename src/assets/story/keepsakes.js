import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { mergeGeos, paint, limb, joint } from '../../core/geometry.js';
import { KEEPSAKES } from '../../world/layout.js';

/**
 * The ten keepsakes hidden round the island (their places: KEEPSAKES in world/layout.js; picking them up: app/items.js;
 * the shelf: app/shelf.js). keepsakeModel(kind): one small group, its base at y = 0, a mesh per kind of surface
 * (metal, matte, gloss, glass; each merged, vertex-coloured). createKeepsakes: a copy of each lying in its place, hidden
 * once taken. Its own random numbers (a fixed little stream), so it can be built anywhere in the order.
 */
const MATS = {};
function mat(k) {
  if (MATS[k]) return MATS[k];
  const o = { vertexColors: true, metalness: 0, roughness: 0.75 };
  if (k === 'metal') Object.assign(o, { metalness: 0.8, roughness: 0.32 });
  if (k === 'rust') Object.assign(o, { metalness: 0.35, roughness: 0.8 });
  if (k === 'gloss') Object.assign(o, { roughness: 0.25 });
  if (k === 'glass') Object.assign(o, { roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
  return (MATS[k] = new THREE.MeshStandardMaterial(o));
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rnd() * (b - a);
const col = (g, hex, vary = 0) => { const c0 = lin(hex); return paint(g, c => c.copy(c0).multiplyScalar(1 + (vary ? rr(-vary, vary) : 0))); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const BUILD = {
  /* a brass pocket compass, the lid ring standing */
  compass() {
    const brass = 0xb8903a, metal = [], matte = [];
    const cs = new THREE.CylinderGeometry(0.036, 0.034, 0.014, 28); cs.translate(0, 0.007, 0); metal.push(col(cs, brass));
    const rim = new THREE.TorusGeometry(0.034, 0.003, 6, 28); rim.rotateX(Math.PI / 2); rim.translate(0, 0.014, 0); metal.push(col(rim, 0xc9a24a));
    const loop = new THREE.TorusGeometry(0.008, 0.002, 6, 12); loop.translate(0, 0.009, 0.043); metal.push(col(loop, brass));
    const face = new THREE.CircleGeometry(0.031, 28); face.rotateX(-Math.PI / 2); face.translate(0, 0.0141, 0); matte.push(col(face, 0xeee4c8));
    for (let i = 0; i < 8; i++) { const t = new THREE.BoxGeometry(0.0015, 0.0004, i % 2 ? 0.004 : 0.007); t.translate(0, 0.0145, -0.026); t.rotateY(i * Math.PI / 4); matte.push(col(t, 0x3a2a1c)); }
    const n1 = new THREE.ConeGeometry(0.0035, 0.024, 4); n1.rotateX(-Math.PI / 2); n1.translate(0, 0.016, -0.012); matte.push(col(n1, 0xb02a20));
    const n2 = new THREE.ConeGeometry(0.0035, 0.024, 4); n2.rotateX(Math.PI / 2); n2.translate(0, 0.016, 0.012); matte.push(col(n2, 0x505a64));
    const pin = new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 8); pin.translate(0, 0.017, 0); metal.push(col(pin, brass));
    return { metal, matte };
  },
  /* a brass spyglass, drawn out, the big tube in leather */
  spyglass() {
    const metal = [], matte = [], gloss = [];
    const tube = (r, x0, x1, c, list) => { const g = new THREE.CylinderGeometry(r, r, x1 - x0, 16, 1); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, 0, 0); list.push(col(g, c)); };
    tube(0.022, -0.15, -0.02, 0x3a2618, matte); tube(0.024, -0.155, -0.14, 0xc19a44, metal); tube(0.024, -0.03, -0.015, 0xc19a44, metal);
    tube(0.018, -0.015, 0.07, 0xb8903a, metal); tube(0.019, 0.06, 0.07, 0xd0aa50, metal); tube(0.014, 0.07, 0.13, 0xb8903a, metal); tube(0.015, 0.12, 0.13, 0xd0aa50, metal); tube(0.01, 0.13, 0.155, 0x2a1c12, matte);
    const lens = new THREE.CircleGeometry(0.02, 16); lens.rotateY(-Math.PI / 2); lens.translate(-0.1551, 0, 0); gloss.push(col(lens, 0x1c2a3a));
    const all = { metal, matte, gloss }; for (const k in all) all[k].forEach(g => g.translate(0, 0.024, 0));
    return all;
  },
  /* half a geode, cut face up: a rough grey rind, a pale band, purple crystals inside */
  geode() {
    const matte = [], gloss = [];
    const rind = new THREE.SphereGeometry(0.06, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); rind.scale(1, 0.75, 0.9);
    { const p = rind.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.08 * Math.sin(p.getX(i) * 140 + p.getZ(i) * 90) * Math.cos(p.getY(i) * 120); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } rind.computeVertexNormals(); }
    matte.push(paint(rind, (c, x, y) => c.copy(lin(0x7d7466)).multiplyScalar(0.8 + 0.4 * Math.abs(Math.sin(x * 90 + y * 60)))));
    const band = new THREE.RingGeometry(0.047, 0.06, 28, 1); band.rotateX(-Math.PI / 2); band.scale(1, 1, 0.9); matte.push(col(band, 0xd8d2c8));
    const inner = new THREE.CircleGeometry(0.047, 28); inner.rotateX(-Math.PI / 2); inner.scale(1, 1, 0.9); inner.translate(0, -0.004, 0); gloss.push(col(inner, 0x3a1850));
    for (let i = 0; i < 22; i++) {
      const a = rr(0, Math.PI * 2), r = Math.sqrt(rnd()) * 0.04, h = rr(0.008, 0.016), c = new THREE.ConeGeometry(rr(0.004, 0.007), h, 5);
      c.translate(0, h / 2 - 0.004, 0); c.rotateX(rr(-0.4, 0.4)); c.rotateZ(rr(-0.4, 0.4)); c.translate(Math.cos(a) * r, 0, Math.sin(a) * r * 0.9);
      gloss.push(paint(c, (cc, x, y) => cc.copy(lin(0x6a2f8f)).lerp(lin(0xc9a6e0), Math.min(1, Math.max(0, (y + 0.004) / 0.016)))));
    }
    const all = { matte, gloss }; for (const k in all) all[k].forEach(g => g.translate(0, 0.045, 0));
    return all;
  },
  /* a ship in a bottle on two little wooden cradles */
  shipBottle() {
    const matte = [], glass = [];
    const pts = [[0, 0], [0.036, 0], [0.04, 0.012], [0.04, 0.16], [0.032, 0.19], [0.014, 0.215], [0.013, 0.255], [0.016, 0.26], [0.014, 0.265]].map(([r, y]) => new THREE.Vector2(r, y));
    const gl = new THREE.LatheGeometry(pts, 18); gl.rotateZ(-Math.PI / 2); gl.translate(-0.13, 0, 0); glass.push(col(gl, 0xcfe6e0));
    const cork = new THREE.CylinderGeometry(0.012, 0.011, 0.025, 10); cork.rotateZ(-Math.PI / 2); cork.translate(0.14, 0, 0); matte.push(col(cork, 0x9a7650));
    const sea = new THREE.BoxGeometry(0.14, 0.008, 0.05); sea.translate(-0.03, -0.028, 0); matte.push(col(sea, 0x2c5a78));
    const hull = new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10, 1, false, 0, Math.PI); hull.rotateZ(Math.PI / 2); hull.rotateX(Math.PI / 2); hull.scale(1, 1.2, 1); hull.translate(-0.03, -0.022, 0); matte.push(col(hull, 0x6a3a22));
    const deck = new THREE.BoxGeometry(0.1, 0.003, 0.026); deck.translate(-0.03, -0.022, 0); matte.push(col(deck, 0xa87a4a));
    for (const [mx, mh] of [[-0.055, 0.05], [-0.02, 0.058]]) {
      const mast = new THREE.CylinderGeometry(0.0012, 0.0012, mh, 5); mast.translate(mx, -0.022 + mh / 2, 0); matte.push(col(mast, 0x3a2a1c));
      const sail = new THREE.PlaneGeometry(0.026, mh * 0.62); sail.translate(mx, -0.016 + mh * 0.42, 0.001); matte.push(col(sail, 0xf2ead8)); const sb = sail.clone(); sb.rotateY(Math.PI); sb.translate(2 * mx, 0, 0); matte.push(col(sb, 0xf2ead8));
    }
    for (const x of [-0.08, 0.06]) { const cr = new THREE.BoxGeometry(0.014, 0.018, 0.06); cr.translate(x, -0.034, 0); matte.push(col(cr, 0x6e4a2c)); }
    const all = { matte, glass }; for (const k in all) all[k].forEach(g => g.translate(0, 0.043, 0));
    return all;
  },
  /* an ammonite: a stone spiral, ribbed */
  ammonite() {
    const matte = [], pts = [];
    for (let t = 0; t <= Math.PI * 4.2; t += 0.12) { const r = 0.0055 * Math.exp(0.19 * t); pts.push(V3(Math.cos(t) * r, 0, Math.sin(t) * r)); }
    const curve = new THREE.CatmullRomCurve3(pts), n = pts.length * 2, tube = new THREE.TubeGeometry(curve, n, 1, 8, false), p = tube.attributes.position;
    // the tube's radius grows with the spiral: rebuild each ring round its centre on the curve
    for (let i = 0; i <= n; i++) {
      const c = curve.getPointAt(i / n), r = 0.42 * Math.hypot(c.x, c.z) + 0.0015;
      for (let j = 0; j <= 8; j++) { const k = i * 9 + j; p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, (p.getY(k) - c.y) * r * 0.8, c.z + (p.getZ(k) - c.z) * r); }
    }
    tube.computeVertexNormals();
    paint(tube, (cc, x, y, z) => cc.copy(lin(0xb9a687)).multiplyScalar(0.85 + 0.25 * Math.abs(Math.sin(Math.atan2(z, x) * 9))));
    tube.deleteAttribute('uv'); tube.translate(0, 0.02, 0); matte.push(tube);
    return { matte };
  },
  /* a green-blue glass fishing float in a knotted rope net */
  glassFloat() {
    const gloss = [], matte = [];
    const b = new THREE.SphereGeometry(0.058, 20, 14); gloss.push(paint(b, (c, x, y) => c.copy(lin(0x3e8a86)).lerp(lin(0x9fd4c6), 0.5 + y * 6)));
    const nub = new THREE.CylinderGeometry(0.008, 0.01, 0.01, 8); nub.translate(0, 0.061, 0); gloss.push(col(nub, 0x5a9a90));
    const eq = new THREE.TorusGeometry(0.059, 0.0035, 5, 32); eq.rotateX(Math.PI / 2); matte.push(col(eq, 0x8a7a5a));
    for (let i = 0; i < 3; i++) { const m = new THREE.TorusGeometry(0.0595, 0.0028, 5, 32); m.rotateY(i * Math.PI / 3); matte.push(col(m, 0x7a6a4a)); }
    const all = { gloss, matte }; for (const k in all) all[k].forEach(g => g.translate(0, 0.058, 0));
    return all;
  },
  /* a gold pocket watch, its chain trailing */
  pocketWatch() {
    const gold = 0xd4a64a, metal = [], matte = [];
    const cs = new THREE.CylinderGeometry(0.026, 0.026, 0.01, 28); cs.translate(0, 0.005, 0); metal.push(col(cs, gold));
    const face = new THREE.CircleGeometry(0.022, 28); face.rotateX(-Math.PI / 2); face.translate(0, 0.0102, 0); matte.push(col(face, 0xf2ecdc));
    for (let i = 0; i < 12; i++) { const t = new THREE.BoxGeometry(0.0012, 0.0004, 0.003); t.translate(0, 0.0105, -0.019); t.rotateY(i * Math.PI / 6); matte.push(col(t, 0x222222)); }
    const h1 = new THREE.BoxGeometry(0.0014, 0.0004, 0.012); h1.translate(0, 0.0108, -0.006); h1.rotateY(0.9); matte.push(col(h1, 0x111111));
    const h2 = new THREE.BoxGeometry(0.0012, 0.0004, 0.017); h2.translate(0, 0.0109, -0.0085); h2.rotateY(-0.7); matte.push(col(h2, 0x111111));
    const crown = new THREE.CylinderGeometry(0.004, 0.004, 0.006, 10); crown.rotateX(Math.PI / 2); crown.translate(0, 0.005, -0.029); metal.push(col(crown, gold));
    const bow = new THREE.TorusGeometry(0.006, 0.0015, 6, 12); bow.rotateX(Math.PI / 2); bow.translate(0, 0.005, -0.037); metal.push(col(bow, gold));
    for (let i = 0; i < 14; i++) { const a = i * 0.28, l = new THREE.TorusGeometry(0.0035, 0.001, 4, 8); l.rotateY(i % 2 ? 0 : Math.PI / 2); l.rotateX(Math.PI / 2 * (i % 2)); l.translate(Math.sin(a) * 0.03 + 0.004 * i * 0.1, 0.0015, -0.044 - i * 0.0055); metal.push(col(l, gold)); }
    return { metal, matte };
  },
  /* a bird's nest of twigs and grass, three pale blue eggs in it */
  birdNest() {
    const matte = [], gloss = [];
    const cup = new THREE.SphereGeometry(0.05, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); cup.scale(1, 0.6, 1); cup.translate(0, 0.032, 0); matte.push(col(cup, 0x5a4630));
    const lining = new THREE.CircleGeometry(0.046, 16); lining.rotateX(-Math.PI / 2); lining.translate(0, 0.012, 0); matte.push(col(lining, 0x6e5a3e));
    for (let i = 0; i < 70; i++) {
      const a = rr(0, Math.PI * 2), r = rr(0.045, 0.066), y = rr(0.004, 0.045), len = rr(0.05, 0.09), tilt = rr(-0.5, 0.5), da = len / r * 0.5;
      const p0 = V3(Math.cos(a - da) * r, y - tilt * 0.01, Math.sin(a - da) * r), p1 = V3(Math.cos(a + da) * r, y + tilt * 0.01, Math.sin(a + da) * r);
      matte.push(col(limb(p0, p1, 0.0022, 0.0016, 4), [0x6e5236, 0x8a6a44, 0x4a3a28, 0xa08658][i % 4], 0.12));
    }
    for (const [x, z, ry] of [[-0.012, 0.008, 0.3], [0.014, 0.006, 1.8], [0.001, -0.015, 2.9]]) {
      const e = new THREE.SphereGeometry(0.011, 12, 8); e.scale(1, 1, 1.35); e.rotateX(Math.PI / 2 - 0.35); e.rotateY(ry); e.translate(x, 0.024, z);
      gloss.push(paint(e, (c, px, py, pz) => c.copy(lin(0xa9d2d4)).multiplyScalar(Math.sin(px * 900) * Math.sin(pz * 800 + py * 700) > 0.85 ? 0.55 : 1)));
    }
    return { matte, gloss };
  },
  /* a shed deer antler: a curving beam off the burr, three tines */
  antler() {
    const matte = [], beam = [V3(0, 0.02, 0), V3(0.04, 0.03, 0.01), V3(0.085, 0.04, 0.005), V3(0.13, 0.045, -0.015), V3(0.17, 0.05, -0.03), V3(0.2, 0.052, -0.05)];
    const c = () => (cc, x) => cc.copy(lin(0x7a6248)).lerp(lin(0xdccfb2), Math.min(1, x / 0.12 + 0.2));
    for (let i = 0; i < beam.length - 1; i++) { const g = limb(beam[i], beam[i + 1], 0.012 - i * 0.0016, 0.012 - (i + 1) * 0.0016, 8); matte.push(paint(g, c())); matte.push(paint(joint(beam[i + 1], 0.012 - (i + 1) * 0.0016), c())); }
    const burr = new THREE.TorusGeometry(0.014, 0.005, 6, 12); burr.rotateY(Math.PI / 2); burr.translate(0, 0.02, 0); matte.push(col(burr, 0x5a4634));
    for (const [i, d, h] of [[1, V3(0.02, 0.035, 0.05), 0.007], [2, V3(0.03, 0.03, 0.05), 0.006], [3, V3(0.035, 0.02, 0.055), 0.005]]) {
      const tip = beam[i].clone().add(d); matte.push(paint(limb(beam[i], tip, h, 0.0015, 6), (cc) => cc.copy(lin(0xd8cbb0))));
    }
    return { matte };
  },
  /* an old iron horseshoe, rusty */
  horseshoe() {
    const rust = [];
    const t = new THREE.TorusGeometry(0.05, 0.011, 6, 22, Math.PI * 1.35); t.rotateZ(-Math.PI * 0.175); t.scale(1, 1, 0.55); t.rotateX(-Math.PI / 2); t.translate(0, 0.006, 0);
    rust.push(paint(t, (c, x, y, z) => c.copy(lin(0x6a4a36)).lerp(lin(0x9a5a32), 0.5 + 0.5 * Math.sin(x * 160 + z * 110))));
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 - Math.PI * 0.6 + i * Math.PI * 1.2 / 5, n = new THREE.BoxGeometry(0.004, 0.004, 0.004); n.translate(Math.cos(a) * 0.05, 0.012, -Math.sin(a) * 0.05); rust.push(col(n, 0x2a2420)); }
    return { rust };
  },
};

/** The model of a keepsake: { object } (a group; cloned where it is shown). */
const CACHE = {};
export function keepsakeModel(kind) {
  if (CACHE[kind]) return CACHE[kind];
  seed = 7 + Object.keys(BUILD).indexOf(kind) * 131;
  const parts = BUILD[kind](), o = new THREE.Group();
  for (const k in parts) {
    if (!parts[k].length) continue;
    const m = new THREE.Mesh(mergeGeos(parts[k].map(g => g.index ? g.toNonIndexed() : g), ['position', 'normal', 'color']), mat(k));
    m.castShadow = k !== 'glass'; m.receiveShadow = true; if (k === 'glass') m.renderOrder = 2; o.add(m);
  }
  return (CACHE[kind] = { object: o });
}
export const KEEPSAKE_KINDS = Object.keys(BUILD);

/** Each keepsake lying in its place. points: where to aim to pick one up; hide / show by index. */
export function createKeepsakes({ scene }) {
  const objs = KEEPSAKES.map(k => { const o = keepsakeModel(k.kind).object.clone(); o.position.set(k.x, k.y, k.z); o.rotation.y = k.ry; scene.add(o); return o; });
  const points = KEEPSAKES.map(k => new THREE.Vector3(k.x, k.y + 0.03, k.z));
  // drawn only within FAR m (tiny beyond; they cost a draw call or two each), and not once taken
  const FAR = 30, gone = objs.map(() => false);
  return {
    points, kinds: KEEPSAKES.map(k => k.kind), objects: objs,
    hide: i => { gone[i] = true; objs[i].visible = false; }, show: i => { gone[i] = false; },
    update(camera) { const c = camera.position; objs.forEach((o, i) => { o.visible = !gone[i] && Math.abs(o.position.x - c.x) < FAR && Math.abs(o.position.z - c.z) < FAR && o.position.distanceTo(c) < FAR; }); },
  };
}
