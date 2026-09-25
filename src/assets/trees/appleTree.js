import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr, setSeed } from '../../core/random.js';
import { V, clamp, lin } from '../../core/math.js';
import { mergeGeos, limb, joint, mergeRanked, rankedInstances } from '../../core/geometry.js';
import { addFlutter, addThinning } from '../../core/shaderPatches.js';
import { APP, H } from '../../world/layout.js';

/** A seasonal role for world/seasonLooks.js. */
const tag = (m, season) => { m.userData.season = season; return m; };
const appleProfile = () => new THREE.LatheGeometry([[0.001, -0.036], [0.013, -0.038], [0.026, -0.034], [0.036, -0.022], [0.041, -0.005], [0.04, 0.012], [0.035, 0.026], [0.025, 0.035], [0.013, 0.035], [0.005, 0.029], [0.001, 0.027]].map(p => new THREE.Vector2(p[0], p[1])), 22);
const appleStem = () => { const sg = new THREE.CylinderGeometry(0.0022, 0.003, 0.024, 5); sg.translate(0, 0.036, 0); sg.rotateZ(0.2); return sg; };

/**
 * The full-detail apple tree generator shared by the reference tree and the island's variants: recursive branching
 * trunk, a crown made only of individual leaves on twigs, apples on the tree (and, for the reference tree, on the
 * plot's ground), around the base point (x, h0, z).
 * Returns { bark, twigs: [geometries], leaves: [[matrix, colour]], apples: [matrices], appleColors, blobs, crownC, crownR }.
 * Draws from the shared random stream in a fixed order, so the reference tree is unchanged.
 */
export function buildApple(x, z, h0, groundApples) {
  const blobs = [], bark = [];
  function grow(a, dir, len, r, depth) {
    const b = a.clone().addScaledVector(dir, len);
    const mid = a.clone().lerp(b, 0.5).add(new V(rr(-1, 1), rr(-0.3, 0.3), rr(-1, 1)).multiplyScalar(len * 0.07));
    bark.push(limb(a, mid, r, r * 0.84, 9), limb(mid, b, r * 0.84, r * 0.68, 9), joint(mid, r * 0.84), joint(b, r * 0.68));
    if (depth === 1) blobs.push({ c: b.clone().add(new V(0, 0.05, 0)), r: rr(0.36, 0.46) });
    if (depth === 0) { blobs.push({ c: b.clone().addScaledVector(dir, 0.12).add(new V(0, 0.1, 0)), r: rr(0.44, 0.6) }); return; }
    const n = depth === 3 ? 3 : (rng() < 0.55 ? 2 : 3), base = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const az = base + i * 2 * Math.PI / n + rr(-0.3, 0.3), spread = (depth === 3 ? 0.68 : 0.52) + rng() * 0.22;
      const perp = new V(Math.cos(az), 0, Math.sin(az)); perp.sub(dir.clone().multiplyScalar(perp.dot(dir))).normalize();
      const nd = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(perp, Math.sin(spread)).normalize();
      nd.y = Math.max(nd.y, 0.22); nd.normalize();
      grow(b, nd, len * rr(0.68, 0.8), r * 0.63, depth - 1);
    }
  }
  bark.push(limb(new V(x, h0 - 0.1, z), new V(x, h0 + 0.28, z), 0.25, 0.15, 12));
  grow(new V(x, h0 + 0.2, z), new V(0.1, 1, 0.06).normalize(), 1.1, 0.15, 3);

  // crown built only from individual leaves on thin twigs (no solid foliage meshes)
  const crownC = new V(); blobs.forEach(bb => crownC.add(bb.c)); crownC.multiplyScalar(1 / blobs.length);
  let crownR = 0; blobs.forEach(bb => { crownR = Math.max(crownR, bb.c.distanceTo(crownC) + bb.r); });
  const randUnit = () => { const d = new V(); do { d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); } while (d.lengthSq() > 1 || d.lengthSq() < 0.02); return d.normalize(); };
  const leaves = [], twigs = [];
  const Yv = new V(), Zv = new V(), Xv = new V();
  function addLeaf(p, pointDir, sizeK) {
    Yv.copy(pointDir).normalize();
    Zv.set(rr(-0.55, 0.55), 1, rr(-0.55, 0.55)); Zv.addScaledVector(Yv, -Zv.dot(Yv));
    if (Zv.lengthSq() < 1e-4) Zv.set(1, 0, 0); Zv.normalize().applyAxisAngle(Yv, rr(-0.9, 0.9));
    Xv.crossVectors(Yv, Zv).normalize();
    const sz = rr(0.11, 0.16) * sizeK;
    const m = new THREE.Matrix4().makeBasis(Xv, Yv, Zv).scale(new V(sz * 0.6, sz, sz)); m.setPosition(p);
    const out = clamp(p.distanceTo(crownC) / crownR), hk = clamp((p.y - crownC.y) / crownR * 0.5 + 0.5);
    const shade = 0.34 + 0.6 * Math.pow(out, 1.4) + 0.22 * hk;
    const tone = new THREE.Color(rr(0.84, 1.06), rr(0.9, 1.1), rr(0.7, 0.96)).multiplyScalar(shade);
    if (rng() < 0.04) tone.lerp(new THREE.Color(1.1, 0.95, 0.42), 0.4);
    leaves.push([m, tone]);
  }
  const spurRange = isTouch ? [3, 4] : [4, 6];
  const baseBlobs = blobs.slice();
  for (let k = 0; k < 16; k++) {
    const bb = baseBlobs[Math.floor(rng() * baseBlobs.length)];
    const c = bb.c.clone().lerp(crownC, rr(0.3, 0.6)).add(new V(rr(-0.2, 0.2), rr(-0.1, 0.25), rr(-0.2, 0.2)));
    blobs.push({ c, r: rr(0.34, 0.46) });
  }
  blobs.forEach(bb => {
    const nTw = Math.round(rr(12, 18) * (bb.r / 0.5) * (isTouch ? 0.8 : 1));
    for (let k = 0; k < nTw; k++) {
      const d = randUnit(); d.y = d.y * 0.7 + 0.22; d.normalize();
      const a0 = bb.c.clone().addScaledVector(d, bb.r * rr(0.02, 0.28));
      const len = bb.r * rr(0.35, 0.65);
      const e = a0.clone().addScaledVector(d, len); e.y -= len * rr(0, 0.18);
      twigs.push(limb(a0, e, 0.0095, 0.0028, 4));
      const td = e.clone().sub(a0).normalize();
      const spurs = spurRange[0] + Math.floor(rng() * (spurRange[1] - spurRange[0] + 1));
      for (let si = 0; si < spurs; si++) {
        const t = si === spurs - 1 ? 1 : rr(0.3, 0.92);
        const sp = a0.clone().lerp(e, t);
        const nl = 5 + Math.floor(rng() * 4), base = rng() * 6.28;
        for (let l = 0; l < nl; l++) {
          const ang = base + l / nl * 6.28 + rr(-0.3, 0.3);
          const dir = td.clone().multiplyScalar(0.6).add(new V(Math.cos(ang), rr(-0.15, 0.35), Math.sin(ang))).normalize();
          addLeaf(sp, dir, t === 1 ? 1.05 : 0.95);
        }
      }
    }
    const nf = Math.round((isTouch ? 90 : 160) * (bb.r / 0.5) ** 2);
    for (let k = 0; k < nf; k++) {
      const d = randUnit(); const p = bb.c.clone().addScaledVector(d, bb.r * (0.55 + 0.5 * Math.pow(rng(), 0.5)));
      addLeaf(p, d.clone().add(new V(rr(-0.8, 0.8), rr(-0.6, 0.5), rr(-0.8, 0.8))), 0.95);
    }
  });

  // apples
  const apples = [];
  const outer = blobs.slice(0, blobs.length - 16);
  for (let k = 0; k < 55; k++) {
    const b = outer[Math.floor(rng() * outer.length)];
    const d = new V(rr(-1, 1), rr(-0.9, 0.25), rr(-1, 1)).normalize();
    const p = b.c.clone().addScaledVector(d, b.r * rr(0.95, 1.12)); p.y -= 0.02;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.25, 0.25), rng() * 6.28, rr(-0.25, 0.25)));
    apples.push(new THREE.Matrix4().compose(p, q, new V(1, 1, 1).multiplyScalar(rr(0.9, 1.15))));
  }
  if (groundApples) for (let k = 0; k < 6; k++) {
    const a = rng() * 6.28, r = rr(0.6, 1.9), gx = x + Math.cos(a) * r, gz = z + Math.sin(a) * r;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(1.2, 1.9), rng() * 6.28, 0));
    apples.push(new THREE.Matrix4().compose(new V(gx, H(gx, gz) + 0.03, gz), q, new V(1, 1, 1)));
  }
  const reds = [0xb3201a, 0xc9331f, 0x9e1b1b, 0xd24a28, 0xb82c22].map(lin), yel = lin(0xd8a53a);
  const appleColors = apples.map((m, i) => reds[i % reds.length].clone().lerp(yel, rng() < 0.3 ? rr(0.15, 0.35) : 0));
  return { bark, twigs, leaves, apples, appleColors, blobs, crownC, crownR };
}

/**
 * Apple tree: recursive branching trunk, crown made only of individual leaves on twigs, apples on the tree and on the ground.
 */
export function createAppleTree(ctx) {
  const { scene } = ctx;
  const { barkTex, leafTex } = ctx.tex;
  const { bark, twigs, leaves, apples, appleColors, blobs } = buildApple(APP.x, APP.z, H(APP.x, APP.z), true);
  {
    const barkMesh = new THREE.Mesh(mergeGeos(bark, ['position', 'normal', 'uv']), tag(new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x9a9082), roughness: 0.9 }), 'bark'));
    barkMesh.castShadow = barkMesh.receiveShadow = true; scene.add(barkMesh);
    const twigMesh = new THREE.Mesh(mergeGeos(twigs, ['position', 'normal', 'uv']), tag(new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x7d6f60), roughness: 0.9 }), 'bark'));
    twigMesh.castShadow = twigMesh.receiveShadow = true; scene.add(twigMesh);
    const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
    const lMat = tag(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.6 }), 'leaf');
    addFlutter(lMat, 0.014);
    const lm = new THREE.InstancedMesh(leafGeo, lMat, leaves.length);
    leaves.forEach(([m, c], i) => { lm.setMatrixAt(i, m); lm.setColorAt(i, c); });
    lm.instanceMatrix.needsUpdate = true; if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    lm.castShadow = lm.receiveShadow = true;
    lm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
    scene.add(lm);

    const am = new THREE.InstancedMesh(appleProfile(), tag(new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 }), 'fruit'), apples.length);
    const stems = new THREE.InstancedMesh(appleStem(), tag(new THREE.MeshStandardMaterial({ color: lin(0x4a3520), roughness: 0.9 }), 'fruit'), apples.length);
    apples.forEach((m, i) => { am.setMatrixAt(i, m); stems.setMatrixAt(i, m); am.setColorAt(i, appleColors[i]); });
    am.castShadow = am.receiveShadow = true; stems.castShadow = true;
    if (am.instanceColor) am.instanceColor.needsUpdate = true;
    scene.add(am, stems);
  }
  return { blobs };
}

/**
 * Full-detail apple tree variants for the island: the reference generator with other seeds, built once in tree-local
 * space (base at the origin) and shared by every apple tree that uses them. Detail ranks for addThinning: leaves on
 * the outside of the crown get low ranks (they survive longest), twigs and apples drop out with distance, trunk and
 * branches always stay. Bark and twigs share one mesh (their colours baked per vertex). Materials are shared.
 */
export function createAppleVariants(ctx, count, seed) {
  const { barkTex, leafTex } = ctx.tex;
  const barkMat = tag(new THREE.MeshStandardMaterial({ map: barkTex, vertexColors: true, roughness: 0.9 }), 'bark');
  const lMat = tag(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.6 }), 'leaf');
  addFlutter(lMat, 0.014);
  const appleMat = tag(new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 }), 'fruit'), stemMat = tag(new THREE.MeshStandardMaterial({ color: lin(0x4a3520), roughness: 0.9 }), 'fruit');
  const depth = (map, alphaTest) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  const barkDepth = depth(null, 0), lDepth = depth(leafTex, 0.5), appleDepth = depth(null, 0);
  addThinning(barkMat, false); addThinning(barkDepth, false); addThinning(lMat, true); addThinning(lDepth, true);
  addThinning(appleMat, true); addThinning(stemMat, true); addThinning(appleDepth, true);
  const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
  const appleGeo = appleProfile(), stemGeo = appleStem();
  const barkCol = lin(0x9a9082), twigCol = lin(0x7d6f60);
  const paintGeo = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.userData.twig = c === twigCol; return g; };
  const out = [];
  for (let v = 0; v < count; v++) {
    setSeed(seed + v * 104729);
    const t = buildApple(0, 0, 0, false);
    const P = new V();
    const leafRank = t.leaves.map(([m]) => { P.setFromMatrixPosition(m); const outer = clamp(P.distanceTo(t.crownC) / t.crownR); return rng() * (0.45 + 0.55 * (1 - outer * outer)); });
    const wood = t.bark.map(g => paintGeo(g, barkCol)).concat(t.twigs.map(g => paintGeo(g, twigCol)));
    const barkSet = mergeRanked(wood, ['position', 'normal', 'uv', 'color'], g => (g.userData.twig ? 0.3 + 0.7 * rng() : 0));
    const leafSet = rankedInstances(leafGeo, t.leaves.map(l => l[0]), leafRank, t.leaves.map(l => l[1]));
    const appleSet = rankedInstances(appleGeo, t.apples, t.apples.map(() => 0.9), t.appleColors);
    const stemSet = rankedInstances(stemGeo, t.apples, t.apples.map(() => 0.9));
    let radius = 0, top = 0; t.leaves.forEach(([m]) => { P.setFromMatrixPosition(m); radius = Math.max(radius, Math.hypot(P.x, P.z)); top = Math.max(top, P.y); });
    const bounds = new THREE.Sphere(new V(0, top / 2, 0), Math.hypot(radius, top / 2) + 0.3);
    [leafSet, appleSet, stemSet].forEach(s => { s.geometry.boundingSphere = bounds.clone(); });
    barkSet.geometry.computeBoundingSphere();
    out.push({
      name: 'apple' + v, height: top + 0.2, width: 2 * radius + 0.3, trunkRadius: 0.28, bounds,
      cards: leafSet.count, cardRanks: leafSet.ranks,
      parts: [
        { geometry: barkSet.geometry, material: barkMat, depth: barkDepth, vertexRanks: barkSet.ranks },
        { geometry: leafSet.geometry, material: lMat, depth: lDepth, instances: leafSet },
        { geometry: appleSet.geometry, material: appleMat, depth: appleDepth, instances: appleSet, fruit: true },   // fruit: pickable (app/items.js)
        { geometry: stemSet.geometry, material: stemMat, depth: appleDepth, instances: stemSet },
      ],
    });
  }
  return out;
}
