import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr } from '../../core/random.js';
import { V, clamp, lin } from '../../core/math.js';
import { mergeGeos, limb, joint, cardBatch, mergeColored } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addFlutter, addWorldSway, dampSpecular } from '../../core/shaderPatches.js';
import { APP, H } from '../../world/layout.js';

/**
 * Apple tree: recursive branching trunk, crown made only of individual leaves on twigs, apples on the tree and on the ground.
 */
export function createAppleTree(ctx) {
  const { scene } = ctx;
  const { barkTex, leafTex } = ctx.tex;
  const blobs = [];
  {
    const h0 = H(APP.x, APP.z);
    const bark = [];
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
    bark.push(limb(new V(APP.x, h0 - 0.1, APP.z), new V(APP.x, h0 + 0.28, APP.z), 0.25, 0.15, 12));
    grow(new V(APP.x, h0 + 0.2, APP.z), new V(0.1, 1, 0.06).normalize(), 1.1, 0.15, 3);
    const barkMesh = new THREE.Mesh(mergeGeos(bark, ['position', 'normal', 'uv']), new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x9a9082), roughness: 0.9 }));
    barkMesh.castShadow = barkMesh.receiveShadow = true; scene.add(barkMesh);

    // crown built only from individual leaves on thin twigs (no solid foliage meshes)
    const crownC = new V(); blobs.forEach(bb => crownC.add(bb.c)); crownC.multiplyScalar(1 / blobs.length);
    let crownR = 0; blobs.forEach(bb => { crownR = Math.max(crownR, bb.c.distanceTo(crownC) + bb.r); });
    const randUnit = () => { const d = new V(); do { d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); } while (d.lengthSq() > 1 || d.lengthSq() < 0.02); return d.normalize(); };
    const leaves = [], twigParts = [];
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
        twigParts.push(limb(a0, e, 0.0095, 0.0028, 4));
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
    const twigMesh = new THREE.Mesh(mergeGeos(twigParts, ['position', 'normal', 'uv']), new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x7d6f60), roughness: 0.9 }));
    twigMesh.castShadow = twigMesh.receiveShadow = true; scene.add(twigMesh);
    const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
    const lMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.6 });
    addFlutter(lMat, 0.014);
    const lm = new THREE.InstancedMesh(leafGeo, lMat, leaves.length);
    leaves.forEach(([m, c], i) => { lm.setMatrixAt(i, m); lm.setColorAt(i, c); });
    lm.instanceMatrix.needsUpdate = true; if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    lm.castShadow = lm.receiveShadow = true;
    lm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
    scene.add(lm);

    // apples
    const prof = [[0.001, -0.036], [0.013, -0.038], [0.026, -0.034], [0.036, -0.022], [0.041, -0.005], [0.04, 0.012], [0.035, 0.026], [0.025, 0.035], [0.013, 0.035], [0.005, 0.029], [0.001, 0.027]].map(p => new THREE.Vector2(p[0], p[1]));
    const ag = new THREE.LatheGeometry(prof, 22);
    const sg = new THREE.CylinderGeometry(0.0022, 0.003, 0.024, 5); sg.translate(0, 0.036, 0); sg.rotateZ(0.2);
    const apples = [];
    const outer = blobs.slice(0, blobs.length - 16);
    for (let k = 0; k < 55; k++) {
      const b = outer[Math.floor(rng() * outer.length)];
      const d = new V(rr(-1, 1), rr(-0.9, 0.25), rr(-1, 1)).normalize();
      const p = b.c.clone().addScaledVector(d, b.r * rr(0.95, 1.12)); p.y -= 0.02;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.25, 0.25), rng() * 6.28, rr(-0.25, 0.25)));
      apples.push(new THREE.Matrix4().compose(p, q, new V(1, 1, 1).multiplyScalar(rr(0.9, 1.15))));
    }
    for (let k = 0; k < 6; k++) {
      const a = rng() * 6.28, r = rr(0.6, 1.9), x = APP.x + Math.cos(a) * r, z = APP.z + Math.sin(a) * r;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(1.2, 1.9), rng() * 6.28, 0));
      apples.push(new THREE.Matrix4().compose(new V(x, H(x, z) + 0.03, z), q, new V(1, 1, 1)));
    }
    const reds = [0xb3201a, 0xc9331f, 0x9e1b1b, 0xd24a28, 0xb82c22].map(lin), yel = lin(0xd8a53a);
    const am = new THREE.InstancedMesh(ag, new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 }), apples.length);
    const stems = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: lin(0x4a3520), roughness: 0.9 }), apples.length);
    apples.forEach((m, i) => { am.setMatrixAt(i, m); stems.setMatrixAt(i, m); am.setColorAt(i, reds[i % reds.length].clone().lerp(yel, rng() < 0.3 ? rr(0.15, 0.35) : 0)); });
    am.castShadow = am.receiveShadow = true; stems.castShadow = true;
    if (am.instanceColor) am.instanceColor.needsUpdate = true;
    scene.add(am, stems);
  }
  return { blobs };
}

/**
 * Scatter prototype of the apple tree for the wider world: the same recursive branching, but the crown is made of
 * leaf-cluster cards (a canvas of ~40 leaves and a few apples) instead of 23k single leaves.
 * Returns 2 mesh LODs in local space (base at the origin). Draws from the shared random stream: call setSeed() first.
 */
export function createApplePrototype(ctx) {
  const { barkTex } = ctx.tex;
  const clusterTex = canvasTex(256, 256, (g) => {
    const leaf = (x, y, a, s, c) => { g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.beginPath(); g.moveTo(0, -20); g.bezierCurveTo(14, -12, 13, 10, 0, 20); g.bezierCurveTo(-13, 10, -14, -12, 0, -20); g.fillStyle = c; g.fill(); g.strokeStyle = 'rgba(214,236,160,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 18); g.stroke(); g.restore(); };
    for (let i = 0; i < 70; i++) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 100, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.9;
      const k = 0.7 + rng() * 0.45, gr = (95 + rng() * 60) * k;
      leaf(x, y, rng() * 6.28, 0.9 + rng() * 0.6, `rgb(${gr * 0.55 | 0},${gr | 0},${gr * 0.33 | 0})`);
    }
    for (let i = 0; i < 4; i++) { const a = rng() * 6.28, r = Math.sqrt(rng()) * 70; g.fillStyle = ['#b3201a', '#c9331f', '#9e1b1b'][i % 3]; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 7, 0, 6.28); g.fill(); }
  });
  function build(lod) {
    const full = lod === 0, bark = [], blobs = [];
    function grow(a, dir, len, r, depth) {
      const b = a.clone().addScaledVector(dir, len);
      bark.push(limb(a, b, r, r * 0.7, full ? 7 : 4));
      if (depth <= 1) blobs.push({ c: b.clone().add(new V(0, 0.1, 0)), r: rr(0.45, 0.6) * (depth === 0 ? 1 : 1.2) });
      if (depth === (full ? 0 : 1)) return;
      const n = depth === 3 ? 3 : (rng() < 0.55 ? 2 : 3), base = rng() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const az = base + i * 2 * Math.PI / n + rr(-0.3, 0.3), spread = (depth === 3 ? 0.68 : 0.52) + rng() * 0.22;
        const perp = new V(Math.cos(az), 0, Math.sin(az)); perp.sub(dir.clone().multiplyScalar(perp.dot(dir))).normalize();
        const nd = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(perp, Math.sin(spread)).normalize(); nd.y = Math.max(nd.y, 0.22); nd.normalize();
        grow(b, nd, len * rr(0.68, 0.8), r * 0.63, depth - 1);
      }
    }
    bark.push(limb(new V(0, -0.1, 0), new V(0, 0.3, 0), 0.25, 0.16, full ? 10 : 5));
    grow(new V(0, 0.2, 0), new V(0.1, 1, 0.06).normalize(), 1.1, 0.15, 3);
    const cc = new V(); blobs.forEach(b => cc.add(b.c)); cc.multiplyScalar(1 / blobs.length);
    const cards = cardBatch(), X = new V(), Y = new V(), N = new V();
    const per = full ? 18 : 7;
    blobs.forEach(b => {
      for (let k = 0; k < per; k++) {
        const d = new V(rr(-1, 1), rr(-0.6, 1), rr(-1, 1)).normalize(), p = b.c.clone().addScaledVector(d, b.r * rr(0.3, 1.0));
        N.copy(p).sub(cc).normalize().add(new V(0, 0.6, 0)).normalize();
        Y.set(rr(-1, 1), rr(-0.3, 1), rr(-1, 1)).normalize(); X.crossVectors(Y, new V(rr(-1, 1), rr(-1, 1), rr(-1, 1))).normalize();
        const sz = (full ? 0.62 : 1.05) * rr(0.85, 1.15), shade = 0.5 + 0.35 * clamp(p.distanceTo(cc) / 1.6);
        cards.add(p.clone().addScaledVector(Y, -sz * 0.5), X, Y, sz, sz, new THREE.Color(rr(0.85, 1.05) * shade, rr(0.9, 1.08) * shade, rr(0.7, 0.9) * shade), N);
      }
    });
    return { bark: mergeColored(bark, new THREE.Color(1, 1, 1)), foliage: cards.geometry(), top: blobs.reduce((m, b) => Math.max(m, b.c.y + b.r), 0) };
  }
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x9a9082), roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ map: clusterTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.35 });
  addWorldSway(leafMat, 0.004);
  dampSpecular(leafMat, 0.15);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: clusterTex, alphaTest: 0.5 });
  let top = 3;
  const lods = [0, 1].map(l => { const b = build(l); if (l === 0) top = b.top; return { parts: [{ geometry: b.bark, material: barkMat, castShadow: true }, { geometry: b.foliage, material: leafMat, castShadow: true, depthMaterial: depth }] }; });
  return { name: 'apple', height: top + 0.2, width: 3.4, trunkRadius: 0.28, lods };
}
