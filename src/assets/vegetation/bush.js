import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr, setSeed } from '../../core/random.js';
import { V, clamp, lin } from '../../core/math.js';
import { limb, mergeRanked, rankedInstances } from '../../core/geometry.js';
import { addFlutter, addThinning, dampSpecular } from '../../core/shaderPatches.js';

/**
 * Leafy understory bushes (hazel-like) for the island, built the way the reference apple tree is: bark-textured
 * stems and twigs carrying spurs of individual leaf cards (the shared leaf texture), plus red berry clusters on some
 * variants. Built once per variant in local space (base at the origin); parts carry detail ranks for addThinning
 * (outer leaves low, twigs and berries high), sorted, like the trees. Materials are shared by all variants; `thin` is
 * the thinning uniforms (THIN_SMALL).
 */
export function createBushVariants(ctx, count, seed, thin) {
  const { barkTex, leafTex } = ctx.tex;
  const woodMat = new THREE.MeshStandardMaterial({ map: barkTex, vertexColors: true, color: lin(0x8a7a66), roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.5 }); leafMat.userData.season = 'leafVeg';
  addFlutter(leafMat, 0.014); dampSpecular(leafMat, 0.3);
  const depth = (map, alphaTest) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  const woodDepth = depth(null, 0), leafDepth = depth(leafTex, 0.5);
  [[woodMat, false], [woodDepth, false], [leafMat, true], [leafDepth, true]].forEach(([m, cards]) => addThinning(m, cards, thin));
  const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
  const berryGeo = new THREE.SphereGeometry(0.009, 6, 4);
  const dens = isTouch ? 0.8 : 1;
  const out = [];
  for (let v = 0; v < count; v++) {
    setSeed(seed + v * 7907);
    const wood = [], leaves = [], berries = [];
    const Y = new V(), Z = new V(), X = new V();
    function addLeaf(p, dir, size, shade) {
      Y.copy(dir).normalize();
      Z.set(rr(-0.5, 0.5), 1, rr(-0.5, 0.5)); Z.addScaledVector(Y, -Z.dot(Y)); if (Z.lengthSq() < 1e-4) Z.set(1, 0, 0); Z.normalize().applyAxisAngle(Y, rr(-0.9, 0.9));
      X.crossVectors(Y, Z).normalize();
      const sz = rr(0.09, 0.14) * size, m = new THREE.Matrix4().makeBasis(X, Y, Z).scale(new V(sz * 0.7, sz, sz)); m.setPosition(p);
      const tone = new THREE.Color(rr(0.72, 0.9), rr(0.9, 1.08), rr(0.6, 0.8)).multiplyScalar(shade);
      if (rng() < 0.05) tone.lerp(new THREE.Color(1.05, 0.9, 0.4), 0.35);
      leaves.push([m, tone]);
    }
    const height = rr(0.95, 1.45), nStems = 6 + Math.floor(rng() * 4);
    for (let s = 0; s < nStems; s++) {
      const a = s / nStems * Math.PI * 2 + rr(-0.35, 0.35), lean = rr(0.25, 0.65), out3 = new V(Math.cos(a), 0, Math.sin(a));
      let p = out3.clone().multiplyScalar(rr(0.02, 0.08)), dir = new V(out3.x * lean, 1, out3.z * lean).normalize(), r = rr(0.016, 0.024);
      const len = height * rr(0.75, 1.15), pts = [p.clone()];
      for (let k = 0; k < 3; k++) {
        const q = p.clone().addScaledVector(dir, len / 3); wood.push(limb(p, q, r, r * 0.72, 5)); pts.push(q.clone());
        p = q; r *= 0.72; dir.addScaledVector(out3, 0.18).add(new V(rr(-0.1, 0.1), 0, rr(-0.1, 0.1))).normalize();
      }
      // side twigs with spurs of leaves, denser towards the top
      const nTw = Math.round((10 + Math.floor(rng() * 5)) * dens);
      for (let k = 0; k < nTw; k++) {
        const t = rr(0.3, 1), seg = Math.min(2, Math.floor(t * 3)), bp = pts[seg].clone().lerp(pts[seg + 1], t * 3 - seg);
        const td = out3.clone().applyAxisAngle(new V(0, 1, 0), rr(-1.2, 1.2)).add(new V(0, rr(0.2, 0.9), 0)).normalize();
        const tl = rr(0.14, 0.36), te = bp.clone().addScaledVector(td, tl);
        const g = limb(bp, te, 0.0075, 0.0028, 3); g.userData.twig = true; wood.push(g);
        for (let sp = 0; sp < 3; sp++) {
          const st = sp === 2 ? 1 : rr(0.35, 0.9), c = bp.clone().lerp(te, st), nl = 7 + Math.floor(rng() * 4), base = rng() * 6.28;
          for (let l = 0; l < nl; l++) {
            const ang = base + l / nl * 6.28 + rr(-0.3, 0.3), d = td.clone().multiplyScalar(0.55).add(new V(Math.cos(ang), rr(-0.2, 0.35), Math.sin(ang))).normalize();
            addLeaf(c, d, st === 1 ? 1.08 : 0.95, 0.55 + 0.45 * (c.y / height) + 0.15 * clamp(Math.hypot(c.x, c.z) / 0.7));
          }
        }
        if (v % 2 === 1 && rng() < 0.35) { const nb = 5 + Math.floor(rng() * 5); for (let b = 0; b < nb; b++) berries.push(new THREE.Matrix4().makeTranslation(te.x + rr(-0.03, 0.03), te.y - rr(0, 0.05), te.z + rr(-0.03, 0.03))); }
      }
    }
    // leaf ranks: leaves far from the bush's axis for their height (the silhouette) survive longest
    const P = new V(), band = new Map(), bin = y => Math.floor(y / 0.15);
    leaves.forEach(([m]) => { P.setFromMatrixPosition(m); const b = bin(P.y); band.set(b, Math.max(band.get(b) || 0.05, Math.hypot(P.x, P.z))); });
    const leafRank = leaves.map(([m]) => { P.setFromMatrixPosition(m); const outer = clamp(Math.hypot(P.x, P.z) / band.get(bin(P.y))); return rng() * (0.45 + 0.55 * (1 - outer)); });
    // berries are baked into the wood mesh (one draw call); vertex colours: white on the bark, red divided by the
    // bark tint and texture average on the berries, so they come out red
    const white = new THREE.Color(1, 1, 1), barkAvg = lin(0x8a7a66).multiply(lin(0x7a6c5c)), reds = [lin(0xb3201a), lin(0x9e1b1b), lin(0xc9331f)];
    const colour = (g, c) => { const n = g.attributes.position.count, C = new Float32Array(n * 3); for (let k = 0; k < n; k++) c.toArray(C, k * 3); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g; };
    wood.forEach(g => colour(g, white));
    const woodList = wood.concat(berries.map((m, i) => { const g = colour(berryGeo.clone().applyMatrix4(m), reds[i % 3].clone()); const c = g.attributes.color; for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) / barkAvg.r, c.getY(k) / barkAvg.g, c.getZ(k) / barkAvg.b); g.userData.berry = true; return g; }));
    const woodSet = mergeRanked(woodList, ['position', 'normal', 'uv', 'color'], g => (g.userData.berry ? 0.9 : g.userData.twig ? 0.3 + 0.7 * rng() : 0));
    const leafSet = rankedInstances(leafGeo, leaves.map(l => l[0]), leafRank, leaves.map(l => l[1]));
    let radius = 0, top = 0; leaves.forEach(([m]) => { P.setFromMatrixPosition(m); radius = Math.max(radius, Math.hypot(P.x, P.z)); top = Math.max(top, P.y); });
    const bounds = new THREE.Sphere(new V(0, top / 2, 0), Math.hypot(radius, top / 2) + 0.15);
    leafSet.geometry.boundingSphere = bounds.clone(); woodSet.geometry.boundingSphere = bounds.clone();
    // only the leaves cast shadows (stems and twigs are too thin to show in the shadow map, and would cost a draw call)
    const parts = [
      { geometry: woodSet.geometry, material: woodMat, depth: woodDepth, vertexRanks: woodSet.ranks, castShadow: false },
      { geometry: leafSet.geometry, material: leafMat, depth: leafDepth, instances: leafSet },
    ];
    out.push({ name: 'bush' + v, height: top + 0.1, width: 2 * radius + 0.2, radius, bounds, cards: leafSet.count, cardRanks: leafSet.ranks, parts });
  }
  return out;
}
