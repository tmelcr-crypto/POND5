import * as THREE from 'three';
import { rng, rr, setSeed } from '../../core/random.js';
import { V, clamp, smooth, lin } from '../../core/math.js';
import { vnoise2, hash2 } from '../../core/noise.js';
import { limb, mergeGeos } from '../../core/geometry.js';
import { addDistanceFade } from '../../core/shaderPatches.js';
import { boleteGeo, agaricGeo, bracketGeo } from '../vegetation/forestFloor.js';

// barkFar: the bark's albedo; texAvg: the shared bark texture's average, divided out where the texture is applied
const barkFar = lin(0x54443a), texAvg = lin(0x7a6c5c), moss = lin(0x5a7a2a), mossD = lin(0x3a5220), dirt = lin(0x3a3026);
const woodL = lin(0xa88a62), woodD = lin(0x7e6242), heart = lin(0x4a3422), grey = lin(0x827c72);

/**
 * A grid surface swept around an axis: rows along the axis (u), columns around it (a). pos(u, a, out) writes the
 * vertex; colour(p, n, u, a, out) paints it after normals are known. Returns an indexed geometry with uv and color.
 */
function sweep(nu, na, pos, colour, uvScale) {
  const P = [], UV = [], idx = [], p = new V();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= na; j++) {
    const a = (j / na) * Math.PI * 2; pos(i / nu, a, p, i); P.push(p.x, p.y, p.z); const v = p.len * uvScale[1] % 2; UV.push(j / na * uvScale[0], v > 1 ? 2 - v : v);   // mirrored along the axis: the texture has no vertical wrap
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + na + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(idx);
  g.computeVertexNormals(); fixSeam(g, nu, na);
  const n = g.attributes.normal, pp = g.attributes.position, C = new Float32Array(pp.count * 3), c = new THREE.Color(), q = new V(), m = new V();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= na; j++) { const k = i * (na + 1) + j; colour(q.fromBufferAttribute(pp, k), m.fromBufferAttribute(n, k), i / nu, j / na * Math.PI * 2, c); c.toArray(C, k * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}
// average the normals of the duplicated seam column so the wrap does not show
function fixSeam(g, nu, na) { const n = g.attributes.normal, t = new V(), s = new V(); for (let i = 0; i <= nu; i++) { const a = i * (na + 1), b = a + na; t.fromBufferAttribute(n, a).add(s.fromBufferAttribute(n, b)).normalize(); n.setXYZ(a, t.x, t.y, t.z); n.setXYZ(b, t.x, t.y, t.z); } }
/** A disc of wood (end grain) in the plane (e1, e2) around c with outward normal nrm; rad(a) is its rim. */
function endGrain(c, e1, e2, nrm, rad, bulge, nr, na, R, weathered) {
  const P = [], idx = [], C = [], col = new THREE.Color();
  for (let i = 0; i <= nr; i++) for (let j = 0; j <= na; j++) {
    const a = j / na * Math.PI * 2, f = i / nr, r = rad(a) * f;
    const p = c.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r).addScaledVector(nrm, bulge(a, f));
    P.push(p.x, p.y, p.z);
    const rings = 0.5 + 0.5 * Math.sin(f * R * 150 + vnoise2(Math.cos(a) * 2, Math.sin(a) * 2) * 2);
    col.copy(woodL).lerp(woodD, rings * 0.55).lerp(heart, (1 - smooth(0.08, 0.3, f)) * 0.6);
    if (f > 0.9) col.lerp(dirt, 0.7);                                  // the bark rim
    if (weathered) col.lerp(grey, 0.45 + 0.2 * vnoise2(p.x * 20, p.z * 20));
    col.multiplyScalar(0.85 + 0.2 * hash2(i * 7 + 3, j * 13));
    C.push(col.r, col.g, col.b);
  }
  for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + na + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
/** Bark albedo (barkFar) with moss on the upper side and dirt where it meets the ground (y is height above the ground). */
function barkColour(textured, p, n, y, mossAmt, out) {
  out.copy(barkFar);
  const mk = clamp((n.y - 0.05) * 2.0 + vnoise2(p.x * 3.1 + p.z * 1.7, p.y * 4) * 0.9) * mossAmt;
  out.lerp(moss.clone().lerp(mossD, clamp(0.5 + vnoise2(p.x * 11, p.z * 11 + p.y * 7))), mk);
  out.lerp(dirt, (1 - smooth(-0.05, 0.12, y)) * 0.6);
  if (textured) { out.r /= texAvg.r; out.g /= texAvg.g; out.b /= texAvg.b; }
}

/**
 * Fallen trunks, each with the stump it broke from: a stump with root flares, a splintered top and an end-grain face,
 * and beside it the trunk lying on the ground with a matching splintered end, a weathered cut far end, branch stubs,
 * moss along its top and fungi (bracket shelves, a few boletes and fly agarics). Local space: stump at the origin,
 * trunk towards +x. Near: a bark mesh (shared bark texture) and a wood / fungus mesh; far: one low-detail mesh with
 * the bark colour baked in. Near and far cross-fade like the rocks (addDistanceFade, CONFIG.trees.fade).
 * Returns { variants: [{ near: [bark, wood], far, bounds, stump: { r, top }, log: [{ x, y, z, hx, r }], yaw, length }],
 * barkMat, woodMat, farMat, nearDepth, farDepth }.
 */
export function createLogVariants(ctx, count, seed) {
  const barkMat = new THREE.MeshStandardMaterial({ map: ctx.tex.barkTex, vertexColors: true, roughness: 0.95, envMapIntensity: 0.5 });
  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.5, side: THREE.DoubleSide }); woodMat.userData.season = 'fungi';
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.5, side: THREE.DoubleSide }); farMat.userData.season = 'fungi';
  const nearDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), farDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  addDistanceFade(barkMat, false); addDistanceFade(woodMat, false); addDistanceFade(nearDepth, false); addDistanceFade(farMat, true); addDistanceFade(farDepth, true);
  const fungi = [bracketGeo(), boleteGeo(), agaricGeo()];
  const variants = [];
  for (let v = 0; v < count; v++) {
    setSeed(seed + v * 4231);
    const R = rr(0.2, 0.34), h = rr(0.3, 0.75), Jmax = rr(0.12, 0.3), s0 = rr(0, 50), s1 = rr(0, 50);
    const gap = rr(0.2, 0.7), L = rr(3, 5.8), yaw = rr(-0.3, 0.3), zOff = rr(-0.25, 0.25), taper = rr(0.35, 0.55), sag = rr(-0.04, 0.03);
    const nFlare = 4 + Math.floor(rng() * 3), flarePh = rng() * 6.28, mossy = rr(0.55, 1);
    // splinters: the stump keeps J(a), the trunk end carries the rest (Jmax - J), so the two halves look like one break
    const J = a => Jmax * clamp(0.45 + 0.9 * (vnoise2(Math.cos(a) * 1.4 + s0, Math.sin(a) * 1.4) + 0.45 * vnoise2(Math.cos(a) * 4 + s1, Math.sin(a) * 4)));
    const bump = (a, y) => 1 + 0.05 * vnoise2(Math.cos(a) * 2 + y * 3 + s1, Math.sin(a) * 2 + y);
    const stumpR = (a, y) => R * bump(a, y) * (1 + 0.55 * Math.pow(Math.max(0, Math.cos(nFlare * a + flarePh)), 3) * (1 - smooth(-0.1, 0.35, y)) + 0.25 * (1 - smooth(-0.1, 0.2, y)));
    const logO = new V(R + gap, R * 0.78, zOff), D = new V(Math.cos(yaw), 0, Math.sin(yaw)), side = new V(-D.z, 0, D.x), UP = new V(0, 1, 0);
    const logR = (a, t) => R * 0.9 * (1 - taper * t) * bump(a, t * L);
    const logC = t => logO.clone().addScaledVector(D, t * L).addScaledVector(UP, sag * Math.sin(Math.PI * t) * L * 0.1);
    const stubs = []; { const n = 2 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) stubs.push({ t: rr(0.3, 0.92), a: rr(-0.3, Math.PI + 0.3), len: rr(0.1, 0.35), r: rr(0.025, 0.05) }); }
    const fungusSpots = []; { const n = 4 + Math.floor(rng() * 6); for (let k = 0; k < n; k++) fungusSpots.push({ where: rng(), t: rr(0.1, 0.9), a: rng() * 6.28, s: rr(0.7, 1.4), kind: rng() }); }
    const shelves = []; { const a0 = rng() * 6.28, n = 3 + Math.floor(rng() * 4); for (let k = 0; k < n; k++) shelves.push({ a: a0 + rr(-0.5, 0.5), y: rr(0.08, h * 0.8), s: rr(0.6, 1.3) }); }

    const build = near => {
      const nr = near ? 16 : 7, bark = [], wood = [];
      // stump wall: explicit rows so the flare, the break height and the splinter tips each get a ring
      const ys = near ? [-0.15, -0.02, 0.04, 0.1, 0.18, 0.28, 0.5, 0.75, 1] : [-0.15, 0.06, 0.75, 1];
      const yAt = (u, a) => { const f = ys[Math.round(u * (ys.length - 1))]; return f < 0.7 ? (f <= 0.28 ? f : 0.28 + (f - 0.28) / 0.72 * (h - 0.28)) : f === 1 ? h + J(a) : h; };
      const sw = sweep(ys.length - 1, nr, (u, a, p) => {
        const y = Math.min(h, yAt(u, a)), top = yAt(u, a) > h, r = stumpR(a, y) * (top ? 0.72 : 1);
        p.set(Math.cos(a) * r, yAt(u, a), Math.sin(a) * r); p.len = yAt(u, a);
      }, (p, n, u, a, c) => barkColour(near, p, n, p.y, mossy * 0.6, c), [Math.round(R * 18), 0.45]);
      bark.push(sw);
      // splinter insides + the end-grain face of the stump
      wood.push(sweep(1, nr, (u, a, p) => { const r = stumpR(a, h) * (u ? 0.62 : 0.92); p.set(Math.cos(a) * r, u ? h + J(a) * 0.96 : h, Math.sin(a) * r); p.len = 0; },
        (p, n, u, a, c) => c.copy(woodL).lerp(grey, 0.35).multiplyScalar(0.8 + 0.2 * u), [1, 1]));   // wood is double-sided: these are seen from inside the break
      wood.push(endGrain(new V(0, h, 0), new V(1, 0, 0), new V(0, 0, 1), UP, a => stumpR(a, h) * 0.93, (a, f) => 0.03 * (1 - f) * vnoise2(Math.cos(a) * 3, Math.sin(a) * 3 + f), near ? 7 : 2, nr, R, true));
      // trunk: rows along the axis, the first row is the splinter tips reaching back towards the stump
      const na = near ? Math.max(8, Math.round(L * 3.5)) : 4, e1 = side, e2 = UP;
      const lw = sweep(na + 1, nr, (u, a, p, i) => {
        if (i === 0) { const r = logR(a, 0) * 0.68; p.copy(logC(0)).addScaledVector(D, -Math.max(0.03, Jmax * 1.05 - J(a))).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r); p.len = 0; return; }
        const t = (i - 1) / na, r = logR(a, t); p.copy(logC(t)).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r); p.len = t * L;
      }, (p, n, u, a, c) => barkColour(near, p, n, p.y - (logO.y - R * 0.9), mossy, c), [Math.round(R * 18), 0.45]);
      bark.push(lw);
      wood.push(sweep(1, nr, (u, a, p) => { const r = logR(a, 0) * (u ? 0.64 : 0.92); p.copy(logC(0)).addScaledVector(D, u ? -Math.max(0.03, Jmax * 1.05 - J(a)) * 0.96 : 0).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r); p.len = 0; },
        (p, n, u, a, c) => c.copy(woodL).lerp(grey, 0.35).multiplyScalar(0.8 + 0.2 * u), [1, 1]));
      wood.push(endGrain(logC(0), e1, e2, D.clone().negate(), a => logR(a, 0) * 0.93, (a, f) => 0.03 * (1 - f) * vnoise2(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + f), near ? 7 : 2, nr, R, false));
      // weathered, slightly rotten cut at the far end
      wood.push(endGrain(logC(1), e2, e1, D, a => logR(a, 1) * 0.95, (a, f) => -0.04 * (1 - f) * (0.5 + 0.5 * vnoise2(Math.cos(a) * 3, Math.sin(a) * 3)), near ? 5 : 2, nr, R * (1 - taper), true));
      if (near) {
        for (const sb of stubs) {
          const c = logC(sb.t), r = logR(sb.a, sb.t) * 0.9, dir = e1.clone().multiplyScalar(Math.cos(sb.a)).addScaledVector(e2, Math.sin(sb.a)).addScaledVector(D, 0.4).normalize();
          const a = c.clone().addScaledVector(dir, r * 0.6), g = limb(a, a.clone().addScaledVector(dir, sb.len), sb.r, sb.r * 0.7, 6);
          const pc = new V(); const C = new Float32Array(g.attributes.position.count * 3), col = new THREE.Color(), nn = new V();
          for (let k = 0; k < g.attributes.position.count; k++) { barkColour(true, pc.fromBufferAttribute(g.attributes.position, k), nn.fromBufferAttribute(g.attributes.normal, k), 1, mossy * 0.5, col); col.toArray(C, k * 3); }
          g.setAttribute('color', new THREE.BufferAttribute(C, 3)); bark.push(g);
          const tip = new THREE.CircleGeometry(sb.r * 0.7, 6); tip.lookAt(dir); tip.translate(...a.clone().addScaledVector(dir, sb.len).toArray());
          const tc = new Float32Array(tip.attributes.position.count * 3); for (let k = 0; k < tc.length; k += 3) grey.toArray(tc, k); tip.setAttribute('color', new THREE.BufferAttribute(tc, 3)); wood.push(tip);
        }
        // fungi: bracket shelves up one side of the stump, shelves and small mushrooms along the trunk, a few at the foot
        const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new V(), P = new V();
        const put = (geo, pos, yawA, s) => { const g = geo.clone(); g.applyMatrix4(M.compose(pos, Q.setFromAxisAngle(UP, yawA), S.setScalar(s))); g.userData.fungus = true; wood.push(g); };
        for (const sh of shelves) { const r = stumpR(sh.a, sh.y); put(fungi[0], P.set(Math.cos(sh.a) * r * 0.97, sh.y, Math.sin(sh.a) * r * 0.97), Math.PI - sh.a, sh.s); }
        for (const f of fungusSpots) {
          if (f.where < 0.55) {   // on the trunk's flank
            const a = f.kind < 0.5 ? 0.15 : Math.PI - 0.15, r = logR(a, f.t), p = logC(f.t).addScaledVector(e1, Math.cos(a) * r * 0.97).addScaledVector(e2, Math.sin(a) * r * 0.97);
            const out = e1.clone().multiplyScalar(Math.cos(a)); put(fungi[0], p, Math.atan2(out.z, -out.x), f.s);
          } else {                // on the ground next to the stump or the trunk
            const onStump = f.where < 0.75, base = onStump ? new V(0, 0, 0) : logC(f.t).setY(0), rad = onStump ? R * 1.4 + 0.05 : logR(0, f.t) + 0.08;
            const p = base.clone().add(new V(Math.cos(f.a) * rad, -0.01, Math.sin(f.a) * rad));
            put(f.kind < 0.7 ? fungi[1] : fungi[2], p, f.a, f.s);
            if (f.kind < 0.4) put(fungi[1], p.clone().add(new V(0.05, 0, 0.03)), f.a + 2, f.s * 0.6);
          }
        }
      }
      return { bark, wood };
    };
    const n = build(true), f = build(false);
    // 'fungus' (x: 1 on the mushrooms and shelf fungi) lets winter fold them away (world/seasonLooks.js)
    const flag = list => list.map(g => { g = g.index ? g.toNonIndexed() : g; const c = g.attributes.position.count, a = new Float32Array(c * 3); if (g.userData.fungus) for (let i = 0; i < c; i++) a[i * 3] = 1; g.setAttribute('fungus', new THREE.BufferAttribute(a, 3)); return g; });
    const bark = mergeGeos(n.bark, ['position', 'normal', 'uv', 'color']), woodG = mergeGeos(flag(n.wood), ['position', 'normal', 'color', 'fungus']);
    // far mesh: bark albedo in the vertex colours (no texture)
    const farBark = mergeGeos(flag(f.bark), ['position', 'normal', 'color', 'fungus']);
    const far = mergeGeos([farBark, mergeGeos(flag(f.wood), ['position', 'normal', 'color', 'fungus'])], ['position', 'normal', 'color', 'fungus']);
    bark.computeBoundingSphere(); const bounds = bark.boundingSphere.clone(); bounds.radius += 0.2;
    woodG.boundingSphere = bounds.clone(); far.boundingSphere = bounds.clone(); bark.boundingSphere = bounds.clone();
    // colliders: the stump as a trunk circle, the trunk as a chain of ellipsoids (local frame, see undergrowth.js)
    const segs = Math.max(2, Math.round(L / 0.8)), log = [];
    for (let k = 0; k < segs; k++) { const t = (k + 0.5) / segs, c = logC(t); log.push({ x: c.x, y: c.y, z: c.z, hx: L / segs * 0.5 + 0.12, r: logR(0, t) }); }
    variants.push({ near: [bark, woodG], far, bounds, stump: { r: R * 1.1, top: h + Jmax }, log, yaw, length: L + R + gap });
  }
  return { variants, barkMat, woodMat, farMat, nearDepth, farDepth };
}
