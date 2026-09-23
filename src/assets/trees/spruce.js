import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr } from '../../core/random.js';
import { V, UPV, clamp, lin } from '../../core/math.js';
import { hash2 } from '../../core/noise.js';
import { paint, mergeGeos, limb, cardBatch, mergeColored } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addFlutter, addWorldSway, dampSpecular } from '../../core/shaderPatches.js';
import { CON, H } from '../../world/layout.js';

/**
 * Norway spruce built from whorls of branches, twigs and alpha-tested needle sprays, plus hanging and fallen pinecones.
 */
export function createSpruce(ctx) {
  const { scene } = ctx;
  const { barkTex, needleTex } = ctx.tex;
  function pineconeGeo() {
    const parts = [], N = 64, len = 0.14;
    const core = new THREE.CylinderGeometry(0.011, 0.005, len, 8); core.translate(0, -len / 2, 0); parts.push(core);
    const stalk = new THREE.CylinderGeometry(0.003, 0.004, 0.022, 5); stalk.translate(0, 0.008, 0); parts.push(stalk);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), ang = i * 2.39996;
      const prof = Math.pow(Math.sin(Math.PI * clamp(t * 0.9 + 0.07)), 0.75);
      const r = 0.006 + 0.016 * prof, y = -0.008 - t * (len - 0.012);
      const R = new V(Math.cos(ang), 0, Math.sin(ang)), T = new V(-Math.sin(ang), 0, Math.cos(ang));
      const Lax = R.clone().multiplyScalar(0.78).add(new V(0, -0.62, 0)).normalize();
      const Nax = new V().crossVectors(Lax, T).normalize();
      const sw = 0.0115 * (0.55 + 0.45 * prof), sl = 0.0145 * (0.5 + 0.5 * prof);
      const g = new THREE.SphereGeometry(1, 7, 4);
      const m = new THREE.Matrix4().makeBasis(T, Nax, Lax).scale(new V(sw, 0.0036, sl));
      m.setPosition(R.clone().multiplyScalar(r).addScaledVector(Lax, sl * 0.55).add(new V(0, y, 0)));
      g.applyMatrix4(m); parts.push(g);
    }
    const g = mergeGeos(parts, ['position', 'normal']);
    const dk = lin(0x3e2614), lt = lin(0xa0703f);
    return paint(g, (c, x, y, z) => c.copy(dk).lerp(lt, clamp((Math.hypot(x, z) - 0.008) / 0.028) * (0.85 + 0.15 * hash2(Math.round(x * 900), Math.round(z * 900)))));
  }
  {
    const h0 = H(CON.x, CON.z);
    const bark = [], cards = [], branches = [];
    const top = h0 + 5.8;
    const dens = isTouch ? 0.65 : 1;
    bark.push(limb(new V(CON.x, h0 - 0.1, CON.z), new V(CON.x, top, CON.z), 0.2, 0.015, 12, 8));
    bark.push(limb(new V(CON.x, h0 - 0.12, CON.z), new V(CON.x, h0 + 0.35, CON.z), 0.34, 0.2, 12, 1));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.4, d = new V(Math.cos(a), -0.35, Math.sin(a));
      bark.push(limb(new V(CON.x, h0 + 0.12, CON.z), new V(CON.x + d.x * 0.55, h0 - 0.08, CON.z + d.z * 0.55), 0.09, 0.02, 6));
    }
    const dark = lin(0x1d3a20), mid = lin(0x3a6a3a), light = lin(0x6f9e4e);
    const Xc = new V(), Yc = new V(), Zc = new V();
    function addCard(p, dir, roll, sz, tone) {
      Xc.copy(dir).normalize();
      Zc.copy(UPV).addScaledVector(Xc, -Xc.y); if (Zc.lengthSq() < 1e-4) Zc.set(1, 0, 0); Zc.normalize().applyAxisAngle(Xc, roll);
      Yc.crossVectors(Zc, Xc).normalize();
      const m = new THREE.Matrix4().makeBasis(Xc, Yc, Zc).scale(new V(0.42 * sz, 0.22 * sz, 1)); m.setPosition(p);
      cards.push([m, tone]);
    }
    function toneAt(p, tip, t) {
      const radial = Math.hypot(p.x - CON.x, p.z - CON.z) / (1.6 * (1 - t * 0.85) + 0.25);
      const k = clamp(0.15 + 0.55 * radial + 0.25 * tip + 0.15 * t + rr(-0.08, 0.08));
      return dark.clone().lerp(mid, clamp(k * 1.5)).lerp(light, clamp((k - 0.55) * 1.8)).multiplyScalar(2.1 + rr(-0.15, 0.15));
    }
    const along = (a0, a1, a2, s) => s < 0.5 ? a0.clone().lerp(a1, s * 2) : a1.clone().lerp(a2, (s - 0.5) * 2);
    function branch(start, a, L, t, main) {
      const droop = (main ? -0.14 - 0.26 * (1 - t) : -0.12) + rr(-0.06, 0.06);
      const dir = new V(Math.cos(a), droop, Math.sin(a)).normalize();
      const p1 = start.clone().addScaledVector(dir, L * 0.5); p1.y -= L * 0.06 * (1 - t);
      const end = start.clone().addScaledVector(dir, L); end.y += L * 0.1 * (1 - t) - L * 0.04;
      const r0 = (main ? 0.034 : 0.018) * (1 - t) + 0.01;
      bark.push(limb(start, p1, r0, r0 * 0.55, 5), limb(p1, end, r0 * 0.55, 0.004, 4));
      if (main) branches.push({ start, p1, end, t });
      const d0 = p1.clone().sub(start), d1 = end.clone().sub(p1);
      const nMain = Math.max(2, Math.round(L / 0.11));
      for (let k = 0; k < nMain; k++) {
        const s = (k + 0.5) / nMain, p = along(start, p1, end, s), d = s < 0.5 ? d0 : d1;
        if (s < 0.22 && rng() < 0.6) continue;
        const sz = (0.8 + 0.5 * (1 - t)) * rr(0.85, 1.1), tone = toneAt(p, s, t);
        addCard(p, d, rr(-0.5, 0.5), sz, tone);
        addCard(p, d, (rng() < 0.5 ? -1 : 1) * rr(1.0, 1.5), sz * 0.85, tone.clone().multiplyScalar(0.9));
      }
      const nT = Math.round((main ? 5 + 18 * L : 3 + 7 * L) * dens);
      for (let k = 0; k < nT; k++) {
        const s = 0.14 + 0.82 * (k + rng() * 0.6) / nT;
        const bp = along(start, p1, end, s), bd = (s < 0.5 ? d0 : d1).clone().normalize(), side = k % 2 ? 1 : -1;
        const td = bd.clone().applyAxisAngle(UPV, side * rr(0.55, 1.05)); td.y += rr(-0.28, 0.14); td.normalize();
        const tl = rr(0.14, 0.3) * (1 - s * 0.45) * Math.min(1, 0.45 + L * 0.6);
        const te = bp.clone().addScaledVector(td, tl);
        bark.push(limb(bp, te, 0.0065, 0.0025, 3));
        const tone = toneAt(te, s, t), sz = (0.7 + 0.45 * (1 - t)) * rr(0.85, 1.1) * Math.max(0.6, tl / 0.24);
        addCard(bp.clone().lerp(te, 0.5), td, rr(-0.6, 0.6), sz, tone);
        addCard(bp.clone().lerp(te, 0.55), td, (rng() < 0.5 ? -1 : 1) * rr(0.9, 1.4), sz * 0.9, tone.clone().multiplyScalar(0.88));
        if (!isTouch || rng() < 0.4) addCard(bp.clone().lerp(te, 0.7).add(new V(0, 0.015, 0)), td.clone().applyAxisAngle(UPV, rr(-0.4, 0.4)), rr(-0.3, 0.3), sz * 0.75, tone.clone().multiplyScalar(1.08));
      }
    }
    const NW = 17;
    for (let i = 0; i < NW; i++) {
      const t = i / (NW - 1), y = h0 + 0.75 + Math.pow(t, 0.95) * 4.85 + rr(-0.06, 0.06), L0 = 1.55 * Math.pow(1 - t, 1.05) + 0.14;
      const nb = t > 0.82 ? 5 : 6 + Math.floor(rng() * 3), phase = rng() * 6.28;
      for (let j = 0; j < nb; j++) branch(new V(CON.x, y, CON.z), phase + j * Math.PI * 2 / nb + rr(-0.3, 0.3), L0 * rr(0.75, 1.1), t, true);
      if (i < NW - 1) {
        const t2 = (i + 0.5) / (NW - 1), y2 = h0 + 0.75 + Math.pow(t2, 0.95) * 4.85, L2 = (1.55 * Math.pow(1 - t2, 1.05) + 0.14) * 0.5;
        const ni = Math.round((t2 > 0.8 ? 2 : 4) * dens);
        for (let j = 0; j < ni; j++) branch(new V(CON.x, y2, CON.z), rng() * 6.28, L2 * rr(0.7, 1.1), t2, false);
      }
    }
    // leader shoot
    for (let k = 0; k < 26; k++) {
      const yy = top - 0.6 + rng() * 0.62;
      const p = new V(CON.x + rr(-0.05, 0.05), yy, CON.z + rr(-0.05, 0.05));
      const d = new V(rr(-0.35, 0.35), 1, rr(-0.35, 0.35));
      addCard(p, d, rng() * 6.28, 0.7, light.clone().multiplyScalar(2.0));
    }
    const barkMesh = new THREE.Mesh(mergeGeos(bark, ['position', 'normal', 'uv']), new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x8a6a52), roughness: 0.95 }));
    barkMesh.castShadow = barkMesh.receiveShadow = true; scene.add(barkMesh);
    const nMat = new THREE.MeshStandardMaterial({ map: needleTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.6 });
    addFlutter(nMat, 0.01);
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), nMat, cards.length);
    cards.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = im.receiveShadow = true;
    im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: needleTex, alphaTest: 0.42 });
    scene.add(im);

    // pinecones: hanging from upper branches, a few fallen on the ground
    const cones = [];
    const upper = branches.filter(b => b.t > 0.4 && b.t < 0.93);
    for (let k = 0; k < 26 && upper.length; k++) {
      const b = upper[Math.floor(rng() * upper.length)];
      const p = along(b.start, b.p1, b.end, rr(0.5, 0.92)); p.y -= 0.012;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.25, 0.25), rng() * 6.28, rr(-0.25, 0.25)));
      cones.push(new THREE.Matrix4().compose(p, q, new V(1, 1, 1).multiplyScalar(rr(0.8, 1.15))));
    }
    for (let k = 0; k < 9; k++) {
      const a = rng() * 6.28, r = rr(0.45, 2.1), x = CON.x + Math.cos(a) * r, z = CON.z + Math.sin(a) * r;
      if (Math.abs(x) > 4.85 || Math.abs(z) > 4.85) continue;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + rr(-0.2, 0.2), rng() * 6.28, 0, 'YXZ'));
      cones.push(new THREE.Matrix4().compose(new V(x, H(x, z) + 0.02, z), q, new V(1, 1, 1).multiplyScalar(rr(0.85, 1.1))));
    }
    const cm = new THREE.InstancedMesh(pineconeGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), cones.length);
    cones.forEach((m, i) => cm.setMatrixAt(i, m));
    cm.castShadow = cm.receiveShadow = true; scene.add(cm);
  }
}

/**
 * Scatter prototype of the spruce for the wider world: the same whorl-of-branches build as the hero tree, but each
 * branch is a few "bough" cards (a whole needle-covered branch painted on a canvas) instead of hundreds of sprays.
 * Returns 2 mesh LODs (full: ~1.5k triangles, simplified: ~200) in local space, base at the origin, ~height m tall.
 * Draws from the shared random stream: call setSeed() first. Replaceable by GLB meshes with the same shape.
 */
export function createSprucePrototype(ctx, height = 10) {
  const { barkTex } = ctx.tex;
  const boughTex = canvasTex(256, 128, (g) => {
    g.lineCap = 'round';
    // a tapered needle mass (gives the card body) with the twigs and needle strokes painted over it
    const edge = (t) => 44 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.7) * (1 - 0.45 * t);
    g.fillStyle = '#20391f'; g.beginPath(); g.moveTo(4, 64);
    for (let i = 0; i <= 40; i++) { const t = i / 40; g.lineTo(4 + t * 248, 64 - edge(t) * (0.8 + 0.2 * rng())); }
    for (let i = 40; i >= 0; i--) { const t = i / 40; g.lineTo(4 + t * 248, 64 + edge(t) * (0.8 + 0.2 * rng())); }
    g.fill();
    const twig = (x0, y0, x1, y1, n, len0) => {
      g.strokeStyle = '#4a3a26'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      for (let i = 0; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, side = i % 2 ? 1 : -1, len = len0 * (1 - t * 0.5) * (0.8 + rng() * 0.4);
        const a = Math.atan2(y1 - y0, x1 - x0) + side * (0.9 + rng() * 0.5), c = 70 + Math.floor(rng() * 60 + t * 35);
        g.strokeStyle = `rgb(${c * 0.42 | 0},${c | 0},${c * 0.46 | 0})`; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
      }
    };
    for (let k = 0; k < 12; k++) { const t = 0.06 + k * 0.075, x = 4 + t * 248, sd = k % 2 ? 1 : -1, L = 62 * (1 - t * 0.55); twig(x, 64, x + L * 0.7, 64 + sd * L * 0.6, 40, 14); }
    twig(4, 64, 252, 62, 160, 20);
  });
  const dark = lin(0x1d3a20), mid = lin(0x3a6a3a), light = lin(0x6f9e4e);
  const S = height / 6.3;
  function build(lod) {
    const full = lod === 0, cards = cardBatch(), bark = [];
    const top = 5.8 * S, NW = full ? 16 : 10;
    bark.push(limb(new V(0, -0.15, 0), new V(0, top - 0.4 * S, 0), 0.16 * S, 0.02, full ? 8 : 5, 1));
    const X = new V(), Y = new V(), N = new V();
    const tone = (t, k) => dark.clone().lerp(mid, clamp(0.4 + 0.5 * k + 0.3 * t)).lerp(light, clamp(k * 0.5 + t * 0.4 - 0.2)).multiplyScalar(1.5 + rr(-0.12, 0.12));
    for (let i = 0; i < NW; i++) {
      const t = i / (NW - 1), y = (0.9 + Math.pow(t, 0.95) * 4.7) * S, L = (1.55 * Math.pow(1 - t, 1.05) + 0.2) * S;
      const nb = full ? (t > 0.8 ? 5 : 6 + Math.floor(rng() * 2)) : (t > 0.7 ? 4 : 5), ph = rng() * 6.28;
      for (let j = 0; j < nb; j++) {
        const a = ph + j * 6.28 / nb + rr(-0.25, 0.25), droop = -0.12 - 0.25 * (1 - t);
        const dir = new V(Math.cos(a), droop, Math.sin(a)).normalize(), start = new V(0, y, 0), end = start.clone().addScaledVector(dir, L);
        if (full) bark.push(limb(start, end, 0.03 * S * (1 - t) + 0.01, 0.006, 4));
        // bough cards: one flat (seen from above/below), one tilted (seen from the side), plus layered shorter ones
        const side = new V(-dir.z, 0, dir.x);
        N.copy(dir).multiplyScalar(0.4).add(new V(0, 1, 0)).normalize();
        const layers = full ? [[0.3, 1.0, 0.0], [-0.35, 0.95, 0.1], [1.25, 0.9, -0.05], [-1.2, 0.8, 0.14]] : [[0.25, 1.15, 0], [-1.2, 1.1, 0.05], [1.2, 1.0, -0.05]];
        layers.forEach(([roll, lk, lift]) => {
          Y.copy(dir); X.copy(side).applyAxisAngle(dir, roll);
          const p = start.clone().addScaledVector(dir, 0.02).add(new V(0, lift * L * 0.3, 0));
          const k = rng();
          cards.add(p, X, Y, L * 0.75 * lk, L * 1.08 * lk, tone(t, k), N);
        });
      }
    }
    // leader shoot
    for (let k = 0; k < (full ? 6 : 2); k++) { const a = k * 2.1; Y.set(Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15).normalize(); X.set(Math.cos(a + 1.57), 0, Math.sin(a + 1.57)); cards.add(new V(0, top - 0.75 * S, 0), X, Y, 0.35 * S, 0.9 * S, light.clone().multiplyScalar(1.3), Y); }
    const barkGeo = mergeColored(bark, lin(0xffffff));
    return { bark: barkGeo, foliage: cards.geometry() };
  }
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: lin(0x6a5444), roughness: 0.95 });
  const needleMat = new THREE.MeshStandardMaterial({ map: boughTex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.6 });
  addWorldSway(needleMat, 0.0009);
  dampSpecular(needleMat, 0.15);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: boughTex, alphaTest: 0.42 });
  const lods = [0, 1].map(l => { const b = build(l); return { parts: [{ geometry: b.bark, material: barkMat, castShadow: true }, { geometry: b.foliage, material: needleMat, castShadow: true, depthMaterial: depth }] }; });
  return { name: 'spruce', height: 5.9 * S, width: 3.6 * S, trunkRadius: 0.3 * S, lods };
}
