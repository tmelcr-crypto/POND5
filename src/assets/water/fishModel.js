import * as THREE from 'three';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';

/**
 * The fish you catch, cook and keep (app/items.js makes the models; app/fishing.js, app/cooking.js, app/shelf.js move
 * them): a mackerel-like fish along +x (snout) to -x (tail), about 27 cm. One geometry for every kind, one material each
 * with its own painted skin, so a fish is one draw:
 *  - body: an oval cross-section swept along the length (deeper at the belly, flattened, narrowing to the tail)
 *  - fins: a forked tail, a swept dorsal fin, the small finlets along the back and belly, pectoral and pelvic fins
 *  - eyes: a dark pupil in a pale ring
 * Skin atlas (512 x 128): the body on u 0..0.75 (u along the length, snout first; v round it, the back at 0 and 1, the
 * belly at 0.5), the fins on u 0.78..0.96, the eye's colours in the last strip. Raw: a dark barred back, silver sides
 * with the lateral line, a white belly, the gill cover and the mouth. Grilled: browned, with grill marks, crisp fins.
 * Golden: gold with fine scales, metallic.
 */
const BODY = [   // t along the length (0 snout .. 1 the root of the tail): half height, half width, centre height
  [0, 0.002, 0.002, -0.002], [0.05, 0.016, 0.011, -0.001], [0.14, 0.028, 0.017, 0], [0.3, 0.038, 0.021, 0], [0.45, 0.04, 0.021, -0.001],
  [0.6, 0.034, 0.018, 0], [0.75, 0.022, 0.012, 0.001], [0.88, 0.012, 0.007, 0.001], [1, 0.009, 0.005, 0.001],
];
const X0 = 0.12, X1 = -0.1;   // snout, root of the tail (m)
const lerpRow = t => { for (let i = 1; i < BODY.length; i++) if (t <= BODY[i][0]) { const a = BODY[i - 1], b = BODY[i], k = (t - a[0]) / (b[0] - a[0]), s = k * k * (3 - 2 * k); return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s]; } return BODY[BODY.length - 1].slice(1); };
const FIN_U = [0.78, 0.96], EYE_U = 0.985;

let geo = null;
function fishGeometry() {
  if (geo) return geo;
  const parts = [];
  /* body: rows along the length, a ring of vertices round each, closed at the snout and the tail root */
  const N = 30, R = 22, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [h, w, yc] = lerpRow(t), x = X0 + (X1 - X0) * t;
    for (let j = 0; j <= R; j++) {
      const a = j / R * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(x, yc + c * h * (c > 0 ? 0.95 : 1.05), s * w); uv.push(t * 0.75, j / R);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = a + R + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const tip = pos.length / 3; pos.push(X1 - 0.002, lerpRow(1)[2], 0); uv.push(0.75, 0.5);   // cap at the tail root
  for (let j = 0; j < R; j++) { const a = N * (R + 1) + j; idx.push(a, tip, a + 1); }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); body.setIndex(idx); body.computeVertexNormals();
  parts.push(body);

  /* fins: flat shapes, their UVs spread over the fin strip of the atlas */
  const fin = (pts, place) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), g = new THREE.ShapeGeometry(sh, 6);
    const p = g.attributes.position, u = g.attributes.uv; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let k = 0; k < p.count; k++) { x0 = Math.min(x0, p.getX(k)); x1 = Math.max(x1, p.getX(k)); y0 = Math.min(y0, p.getY(k)); y1 = Math.max(y1, p.getY(k)); }
    for (let k = 0; k < p.count; k++) u.setXY(k, FIN_U[0] + (FIN_U[1] - FIN_U[0]) * (p.getX(k) - x0) / (x1 - x0 || 1), 0.05 + 0.9 * (p.getY(k) - y0) / (y1 - y0 || 1));
    if (place) g.applyMatrix4(place); parts.push(g);
  };
  const tr = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const yT = lerpRow(1)[2];
  fin([[X1 + 0.004, yT + 0.008], [X1 - 0.03, yT + 0.03], [X1 - 0.058, yT + 0.05], [X1 - 0.05, yT + 0.022], [X1 - 0.036, yT], [X1 - 0.05, yT - 0.022], [X1 - 0.058, yT - 0.05], [X1 - 0.03, yT - 0.03], [X1 + 0.004, yT - 0.008]]);   // forked tail
  fin([[0.045, 0.036], [0.03, 0.062], [0.012, 0.066], [-0.004, 0.05], [-0.018, 0.037]]);                       // first dorsal
  fin([[-0.035, 0.03], [-0.045, 0.047], [-0.058, 0.043], [-0.062, 0.025]]);                                       // second dorsal
  fin([[-0.03, -0.031], [-0.042, -0.048], [-0.056, -0.044], [-0.058, -0.026]]);                                   // anal fin
  for (let k = 0; k < 5; k++) {   // finlets towards the tail, above and below
    const t = 0.78 + k * 0.045, x = X0 + (X1 - X0) * t, [h] = lerpRow(t);
    fin([[x + 0.004, h * 0.9], [x - 0.001, h + 0.009], [x - 0.006, h * 0.95]]);
    fin([[x + 0.004, -h * 0.9], [x - 0.001, -h - 0.009], [x - 0.006, -h * 0.95]]);
  }
  for (const s of [-1, 1]) {
    fin([[0, 0], [-0.03, 0.007], [-0.042, -0.002], [-0.03, -0.01]], tr(0.058, -0.006, s * 0.018, 0, s * 0.45, -0.25));   // pectoral
    fin([[0, 0], [-0.022, -0.004], [-0.026, -0.012], [-0.012, -0.01]], tr(0.035, -0.036, s * 0.008, s * 0.5, 0, 0));      // pelvic
  }
  /* eyes: a pale ring and a dark pupil on each side */
  for (const s of [-1, 1]) {
    const [, w] = lerpRow(0.1), ring = new THREE.SphereGeometry(0.0098, 14, 10), eye = new THREE.SphereGeometry(0.0068, 14, 10);
    ring.scale(1, 1, 0.45); eye.scale(1, 1, 0.5);
    ring.translate(0.098, 0.007, s * (w - 0.0015)); eye.translate(0.098, 0.007, s * (w + 0.002));
    [[ring, 0.75], [eye, 0.25]].forEach(([g, v]) => { const u = g.attributes.uv; for (let k = 0; k < u.count; k++) u.setXY(k, EYE_U, v); parts.push(g); });
  }
  geo = mergeGeos(parts, ['position', 'normal', 'uv']);
  return geo;
}

/** The painted skin of a kind: 'fish' (raw), 'grilledFish' or 'goldenFish'. */
function skin(kind) {
  return canvasTex(512, 128, (g, W, Hh) => {
    const BW = W * 0.75, img = g.createImageData(W, Hh), d = img.data, raw = kind === 'fish', gold = kind === 'goldenFish';
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const top = gold ? [178, 128, 30] : [31, 63, 74], side = gold ? [236, 188, 70] : [160, 180, 190], belly = gold ? [255, 232, 160] : [232, 236, 236];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, u = x / BW, v = y / Hh, a = v * Math.PI * 2, c = Math.cos(a);
      let col;
      if (x < BW) {
        col = mix(side, top, Math.pow(Math.max(0, c), 0.7)); col = mix(col, belly, Math.pow(Math.max(0, -c), 1.4));
        if (!gold && c > 0.3) { const bar = Math.sin(u * 46 + Math.sin(v * 40 + u * 9) * 1.4); if (bar > 0.35) col = mix(col, [14, 28, 34], 0.75 * Math.min(1, (c - 0.3) * 3)); }   // the wavy bars on the back
        if (Math.abs(Math.abs(c) - 0.02) < 0.02 && u > 0.18 && u < 0.97) col = mix(col, [220, 230, 232], 0.35);                                                           // lateral line
        const gill = Math.abs(u - (0.2 + 0.04 * Math.abs(c))); if (gill < 0.008 && c > -0.7) col = mix(col, [40, 50, 55], 0.55);                                             // gill cover
        if (u < 0.05) col = mix(col, [60, 70, 75], (0.05 - u) * 12);                                                                                                         // snout
        if (u < 0.09 && Math.abs(c + 0.1) < 0.05) col = mix(col, [30, 30, 30], 0.6);                                                                                          // mouth
        const sc = 0.92 + 0.08 * Math.sin(x * 1.3 + (y % 6 < 3 ? 0 : 1.6)) * Math.sin(y * 1.1);                                                                                // fine scales
        col = col.map(q => q * sc);
      } else if (x < W * 0.965) {   // fins: rays fanning out
        const fv = (x - W * 0.78) / (W * 0.18);
        col = gold ? [214, 162, 50] : [98, 122, 132]; col = mix(col, gold ? [160, 110, 20] : [48, 62, 70], 0.5 * (0.5 + 0.5 * Math.sin(v * 70)) * (0.4 + 0.6 * fv));
      } else col = v < 0.5 ? [12, 12, 14] : gold ? [255, 220, 120] : [214, 206, 150];   // the eye: pupil, ring
      if (kind === 'grilledFish') {   // browned, grill marks across the side, crisp dark fins
        const l = (col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11) / 255;
        col = x < W * 0.965 ? [120 + 90 * l, 70 + 55 * l, 30 + 20 * l] : col;
        if (x < BW && Math.abs(c) < 0.8 && ((u * 9 + v * 3) % 1) < 0.12) col = col.map(q => q * 0.25);
        if (x >= BW && x < W * 0.965) col = col.map(q => q * 0.45);
      }
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

const mats = {};
/** Geometry and material for a fish of this kind (shared). */
export function fishModel(kind) {
  if (!mats[kind]) {
    const gold = kind === 'goldenFish', grilled = kind === 'grilledFish';
    mats[kind] = new THREE.MeshStandardMaterial({ map: skin(kind), side: THREE.DoubleSide, roughness: gold ? 0.3 : grilled ? 0.8 : 0.35, metalness: gold ? 0.65 : grilled ? 0 : 0.12, envMapIntensity: gold ? 1.2 : 0.8 });
  }
  return { geo: fishGeometry(), mat: mats[kind] };
}
