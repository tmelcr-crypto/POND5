import * as THREE from 'three';
import { rng, rr } from '../../core/random.js';
import { V, UPV, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addFlutter } from '../../core/shaderPatches.js';
import { ROSE, H } from '../../world/layout.js';

/**
 * Rose bush: tapered arching canes with thorns, compound 5-leaflet leaves, spiral-petal roses (open and closed), buds, sepals, stamens and fallen petals.
 */
export function createRoseBush(ctx) {
  const { scene } = ctx;
  {
    const base = new V(ROSE.x, H(ROSE.x, ROSE.z) - 0.02, ROSE.z);
    const petalTex = canvasTex(128, 128, (g) => {
      g.save(); g.translate(64, 128);
      const path = () => { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-26, -16, -62, -62, -52, -104); g.bezierCurveTo(-40, -126, -10, -127, 0, -116); g.bezierCurveTo(10, -127, 40, -126, 52, -104); g.bezierCurveTo(62, -62, 26, -16, 0, 0); g.closePath(); };
      path(); g.clip();
      const gr = g.createRadialGradient(0, 0, 4, 0, -30, 125); gr.addColorStop(0, '#2a0306'); gr.addColorStop(0.18, '#5e070d'); gr.addColorStop(0.45, '#a50f19'); gr.addColorStop(0.78, '#cc2327'); gr.addColorStop(1, '#b3151d');
      g.fillStyle = gr; g.fillRect(-64, -128, 128, 128);
      for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (i / 25 - 0.5) * 1.9; g.strokeStyle = `rgba(70,0,8,${0.08 + rng() * 0.12})`; g.lineWidth = 0.8 + rng(); g.beginPath(); g.moveTo(0, -2); g.quadraticCurveTo(Math.cos(a) * 40, -30 + Math.sin(a) * 40, Math.cos(a) * 120, Math.sin(a) * 120); g.stroke(); }
      for (let i = 0; i < 180; i++) { g.fillStyle = `rgba(255,${80 + rng() * 60 | 0},${90 + rng() * 40 | 0},${rng() * 0.07})`; g.fillRect(rr(-55, 55), rr(-125, -30), 2 + rng() * 5, 1 + rng() * 3); }
      path(); g.strokeStyle = 'rgba(60,0,6,.45)'; g.lineWidth = 5; g.stroke();
      g.restore();
    });
    const leafletTex = canvasTex(64, 128, (g) => {
      g.save(); g.translate(32, 126);
      const pts = []; const N = 26;
      for (let i = 0; i <= N; i++) { const t = i / N, y = -t * 120, wdt = 27 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.85) * (1 - 0.25 * t); const tooth = (i % 2 ? 3.5 : 0) * Math.sin(Math.PI * t); pts.push([wdt + tooth, y]); }
      g.beginPath(); g.moveTo(0, 0); pts.forEach(([x, y]) => g.lineTo(x, y)); for (let i = pts.length - 1; i >= 0; i--) g.lineTo(-pts[i][0], pts[i][1]); g.closePath(); g.clip();
      const gr = g.createLinearGradient(-30, 0, 30, 0); gr.addColorStop(0, '#1d4219'); gr.addColorStop(0.5, '#2f6427'); gr.addColorStop(1, '#1a3d17'); g.fillStyle = gr; g.fillRect(-32, -128, 64, 128);
      g.fillStyle = 'rgba(210,240,180,.12)'; g.beginPath(); g.ellipse(-8, -62, 8, 40, 0.1, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(180,215,140,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -118); g.stroke();
      g.lineWidth = 0.8; g.strokeStyle = 'rgba(160,200,130,.3)'; for (let i = 1; i < 9; i++) { const y = -i * 13; g.beginPath(); g.moveTo(0, y); g.lineTo(22, y - 12); g.moveTo(0, y); g.lineTo(-22, y - 12); g.stroke(); }
      g.restore();
    });
    const sepalTex = canvasTex(32, 128, (g) => { g.translate(16, 128); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-14, -30, -8, -90, 0, -126); g.bezierCurveTo(8, -90, 14, -30, 0, 0); g.fillStyle = '#2f5a23'; g.fill(); g.strokeStyle = 'rgba(160,200,120,.4)'; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -110); g.stroke(); });

    function petalGeo(cup, reflex, wave) { const g = new THREE.PlaneGeometry(1, 1, 8, 8); g.translate(0, 0.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, cup * x * x * 4 * (0.35 + 0.65 * y) - reflex * y * y * y + wave * Math.sin(x * 16 + y * 3) * y * y * 0.05); } g.computeVertexNormals(); return g; }
    const petIn = petalGeo(0.26, -0.04, 0.12), petOut = petalGeo(0.13, 0.2, 0.3), petFlat = petalGeo(0.08, 0.02, 0.2);
    const lfG = new THREE.PlaneGeometry(1, 1, 2, 4); lfG.translate(0, 0.5, 0); { const p = lfG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.abs(x) * 0.28 - y * y * 0.12); } lfG.computeVertexNormals(); }
    const spG = new THREE.PlaneGeometry(1, 1, 1, 4); spG.translate(0, 0.5, 0); { const p = spG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -0.25 * y * y); } spG.computeVertexNormals(); }

    const canes = [], thorns = [], leaflets = [], pin = [], pout = [], sep = [], stam = [], hips = [], ground = [];
    const M4 = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
    const basis = (Y, Zh) => { const y = Y.clone().normalize(); const z = Zh.clone().addScaledVector(y, -Zh.dot(y)); if (z.lengthSq() < 1e-6) z.set(1, 0, 0).addScaledVector(y, -y.x); z.normalize(); const x = new V().crossVectors(y, z); return [x, y, z]; };
    function tube(pts, r0, r1, segs = 16) {
      const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, segs, r0, 6, false), p = g.attributes.position, v = new V();
      for (let i = 0; i <= segs; i++) { const u = i / segs, c = curve.getPointAt(u), k = 1 + (r1 / r0 - 1) * u; for (let j = 0; j <= 6; j++) { const idx = i * 7 + j; v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c); p.setXYZ(idx, v.x, v.y, v.z); } }
      g.computeVertexNormals(); canes.push(g); return curve;
    }
    function addLeaf(P, tan, side, sc, young) {
      let out = new V().crossVectors(tan, UPV); if (out.lengthSq() < 1e-4) out.set(1, 0, 0); out.normalize().multiplyScalar(side);
      const ld = out.clone().multiplyScalar(0.8).addScaledVector(UPV, rr(0.1, 0.45)).addScaledVector(tan, 0.4).normalize();
      const nrm0 = UPV.clone().addScaledVector(ld, -ld.y).normalize(), lat = new V().crossVectors(ld, nrm0).normalize(), L = 0.085 * sc;
      const tone = young ? new THREE.Color(rr(1.2, 1.5), rr(0.75, 0.9), rr(0.55, 0.7)) : new THREE.Color(rr(0.8, 1.05), rr(0.9, 1.1), rr(0.8, 1.0));
      const put = (pos, dir, s) => { const nr = nrm0.clone().addScaledVector(dir, -0.25).add(new V(rr(-0.25, 0.25), 0, rr(-0.25, 0.25))); const [x, y, z] = basis(dir, nr); M4.makeBasis(x, y, z).scale(new V(s * 0.62, s, s)).setPosition(pos); leaflets.push([M4.clone(), tone]); };
      put(P.clone().addScaledVector(ld, L * 0.82), ld, 0.042 * sc);
      for (let k = 0; k < 2; k++) { const along = P.clone().addScaledVector(ld, L * (0.28 + 0.3 * k)); [-1, 1].forEach(s => { const dir = ld.clone().multiplyScalar(0.5).addScaledVector(lat, s).normalize(); put(along.clone().addScaledVector(dir, 0.004), dir, 0.034 * sc * (0.85 + 0.15 * k)); }); }
    }
    function addRose(P, axis, size, open, tint) {
      const q0 = new THREE.Quaternion().setFromUnitVectors(UPV, axis.clone().normalize()), R0 = new THREE.Matrix4().makeRotationFromQuaternion(q0);
      const N = open ? 24 : 30, rot = rng() * 6.28, tMin = open ? 0.55 : 0.07, tMax = open ? 1.55 : 1.2;
      const toW = (m) => m.premultiply(R0).premultiply(new THREE.Matrix4().makeTranslation(P.x, P.y, P.z));
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), ang = rot + i * 2.39996, tilt = tMin + (tMax - tMin) * Math.pow(t, open ? 0.8 : 1.35);
        const s = size * (0.38 + 0.62 * Math.pow(t, 0.55)) * rr(0.9, 1.08), rOff = size * ((open ? 0.1 : 0.015) + 0.13 * t);
        const Rd = new V(Math.cos(ang), 0, Math.sin(ang));
        const Y = Rd.clone().multiplyScalar(Math.sin(tilt)).addScaledVector(UPV, Math.cos(tilt)), Z = Rd.clone().multiplyScalar(-Math.cos(tilt)).addScaledVector(UPV, Math.sin(tilt)), X = new V().crossVectors(Y, Z);
        const m = new THREE.Matrix4().makeBasis(X, Y, Z).scale(new V(s * 0.95, s, s)).setPosition(Rd.clone().multiplyScalar(rOff).add(new V(0, size * 0.06 * (1 - t), 0)));
        const tone = tint.clone().multiplyScalar(0.72 + 0.35 * t);
        (t < 0.5 ? pin : pout).push([toW(m), tone]);
      }
      if (open) for (let i = 0; i < 22; i++) { const a = i * 2.39996, r = size * 0.1 * Math.sqrt(i / 22); const m = new THREE.Matrix4().makeTranslation(Math.cos(a) * r, size * 0.07, Math.sin(a) * r); stam.push([toW(m), new THREE.Color(1, rr(0.75, 0.9), 0.2)]); }
      for (let i = 0; i < 5; i++) { const a = rot + i * 1.2566, Rd = new V(Math.cos(a), 0, Math.sin(a)), tl = open ? 2.3 : 2.05; const Y = Rd.clone().multiplyScalar(Math.sin(tl)).addScaledVector(UPV, Math.cos(tl)), Z = Rd.clone().multiplyScalar(-Math.cos(tl)).addScaledVector(UPV, Math.sin(tl)), X = new V().crossVectors(Y, Z); sep.push([toW(new THREE.Matrix4().makeBasis(X, Y, Z).scale(new V(size * 0.28, size * 0.9, size)).setPosition(new V(0, -size * 0.02, 0))), new THREE.Color(1, 1, 1)]); }
      hips.push([toW(new THREE.Matrix4().compose(new V(0, -size * 0.1, 0), new THREE.Quaternion(), new V(size * 0.18, size * 0.24, size * 0.18))), new THREE.Color(1, 1, 1)]);
    }
    function addBud(P, axis, size) {
      const q0 = new THREE.Quaternion().setFromUnitVectors(UPV, axis.clone().normalize()), R0 = new THREE.Matrix4().makeRotationFromQuaternion(q0), T = new THREE.Matrix4().makeTranslation(P.x, P.y, P.z), rot = rng() * 6.28;
      for (let i = 0; i < 7; i++) { const a = rot + i * 2.39996, tilt = 0.05 + 0.03 * i, Rd = new V(Math.cos(a), 0, Math.sin(a)); const Y = Rd.clone().multiplyScalar(Math.sin(tilt)).addScaledVector(UPV, Math.cos(tilt)), Z = Rd.clone().multiplyScalar(-Math.cos(tilt)).addScaledVector(UPV, Math.sin(tilt)), X = new V().crossVectors(Y, Z); pin.push([new THREE.Matrix4().makeBasis(X, Y, Z).scale(new V(size * 0.55, size, size)).setPosition(Rd.clone().multiplyScalar(size * 0.05)).premultiply(R0).premultiply(T), new THREE.Color(0.8, 0.8, 0.8)]); }
      for (let i = 0; i < 5; i++) { const a = rot + i * 1.2566, Rd = new V(Math.cos(a), 0, Math.sin(a)), tl = 0.35 + rng() * 0.3; const Y = Rd.clone().multiplyScalar(Math.sin(tl)).addScaledVector(UPV, Math.cos(tl)), Z = Rd.clone().multiplyScalar(-Math.cos(tl)).addScaledVector(UPV, Math.sin(tl)), X = new V().crossVectors(Y, Z); sep.push([new THREE.Matrix4().makeBasis(X, Y, Z).scale(new V(size * 0.35, size * 1.05, size)).setPosition(new V(0, -size * 0.05, 0)).premultiply(R0).premultiply(T), new THREE.Color(1, 1, 1)]); }
      hips.push([new THREE.Matrix4().compose(new V(0, -size * 0.08, 0), new THREE.Quaternion(), new V(size * 0.2, size * 0.26, size * 0.2)).premultiply(R0).premultiply(T), new THREE.Color(1, 1, 1)]);
    }
    const tints = [new THREE.Color(1, 1, 1), new THREE.Color(1.1, 0.95, 0.95), new THREE.Color(0.9, 0.85, 0.9), new THREE.Color(1.15, 1.05, 0.9)];
    const NC = 24;
    for (let k = 0; k < NC; k++) {
      const a = k / NC * 6.28 + rr(-0.2, 0.2), dir = new V(Math.cos(a), 0, Math.sin(a)), h = rr(0.5, 1.02), r = rr(0.22, 0.5), side = new V(-dir.z, 0, dir.x);
      const w = () => side.clone().multiplyScalar(rr(-0.05, 0.05));
      const pts = [base.clone().addScaledVector(dir, 0.015), base.clone().addScaledVector(dir, r * 0.22).add(new V(0, h * 0.42, 0)).add(w()), base.clone().addScaledVector(dir, r * 0.6).add(new V(0, h * 0.84, 0)).add(w()), base.clone().addScaledVector(dir, r * 0.95).add(new V(0, h * 0.96, 0)).add(w()), base.clone().addScaledVector(dir, r * 1.18).add(new V(0, h * 0.8, 0)).add(w())];
      const curve = tube(pts, 0.0105, 0.0035, 18), len = curve.getLength();
      for (let u = 0.06; u < 0.98; u += 0.035 / len * 1.2) { const P = curve.getPointAt(u), T = curve.getTangentAt(u); const o = new V(rng() - 0.5, rng() - 0.5, rng() - 0.5).addScaledVector(T, -0.0).normalize(); o.addScaledVector(T, -o.dot(T)).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(UPV, o.clone().addScaledVector(T, 0.5).normalize()); thorns.push(new THREE.Matrix4().compose(P.clone().addScaledVector(o, 0.006 * (1.2 - u)), q, new V(1, 1, 1).multiplyScalar(1.1 - u * 0.5))); }
      let sd = 1;
      for (let u = 0.2; u < 0.98; u += rr(0.035, 0.055) / len) { const P = curve.getPointAt(u), T = curve.getTangentAt(u); addLeaf(P, T, sd, rr(1.0, 1.35) * (0.8 + 0.3 * u), u > 0.88); sd = -sd; }
      const shoots = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < shoots; s++) {
        const u = rr(0.45, 0.9), P = curve.getPointAt(u), T = curve.getTangentAt(u);
        const d = T.clone().multiplyScalar(0.4).addScaledVector(dir, 0.55).addScaledVector(UPV, 0.8).add(new V(rr(-0.3, 0.3), 0, rr(-0.3, 0.3))).normalize(), L = rr(0.1, 0.22);
        const e = P.clone().addScaledVector(d, L).add(new V(0, L * 0.25, 0)), m = P.clone().addScaledVector(d, L * 0.5).add(new V(0, L * 0.05, 0));
        const c2 = tube([P, m, e], 0.0045, 0.0026, 8), te = c2.getTangentAt(1);
        addLeaf(c2.getPointAt(0.2), c2.getTangentAt(0.2), -1, 1.05, false); addLeaf(c2.getPointAt(0.45), c2.getTangentAt(0.45), 1, 1.1, false); addLeaf(c2.getPointAt(0.75), c2.getTangentAt(0.75), -1, 0.95, rng() < 0.4);
        const ax = te.clone().multiplyScalar(0.5).addScaledVector(UPV, 0.75).addScaledVector(dir, 0.35).normalize();
        if (rng() < 0.72) addRose(e, ax, rr(0.034, 0.05), rng() < 0.35, tints[Math.floor(rng() * tints.length)]); else addBud(e, ax, rr(0.018, 0.026));
      }
      const tip = curve.getPointAt(1), tt = curve.getTangentAt(1), tax = tt.clone().multiplyScalar(0.35).addScaledVector(UPV, 0.8).addScaledVector(dir, 0.4).normalize();
      if (rng() < 0.6) addRose(tip, tax, rr(0.036, 0.05), rng() < 0.3, tints[Math.floor(rng() * tints.length)]); else addBud(tip, tax, rr(0.02, 0.028));
    }
    for (let i = 0; i < 22; i++) { const a = rng() * 6.28, r = rr(0.12, 0.6), x = ROSE.x + Math.cos(a) * r, z = ROSE.z + Math.sin(a) * r; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + rr(-0.25, 0.25), 0, rng() * 6.28, 'XYZ')); const s = rr(0.028, 0.04); ground.push([new THREE.Matrix4().compose(new V(x, H(x, z) + 0.012, z), q, new V(s * 0.95, s, s)), new THREE.Color(rr(0.6, 0.85), rr(0.6, 0.8), rr(0.6, 0.8))]); }

    const caneMat = new THREE.MeshStandardMaterial({ color: lin(0x55682c), roughness: 0.6, envMapIntensity: 0.6 });
    const cm = new THREE.Mesh(mergeGeos(canes, ['position', 'normal']), caneMat); cm.castShadow = cm.receiveShadow = true; scene.add(cm);
    const inst = (geo, mat, list, depthMap, alpha) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((e, i) => { if (Array.isArray(e)) { im.setMatrixAt(i, e[0]); im.setColorAt(i, e[1]); } else im.setMatrixAt(i, e); });
      im.castShadow = im.receiveShadow = true; if (depthMap) im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: depthMap, alphaTest: alpha });
      scene.add(im); return im;
    };
    const thornG = new THREE.ConeGeometry(0.0028, 0.011, 5); thornG.translate(0, 0.0055, 0);
    inst(thornG, new THREE.MeshStandardMaterial({ color: lin(0x8a3b26), roughness: 0.5 }), thorns);
    const lMat = new THREE.MeshStandardMaterial({ map: leafletTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.38, envMapIntensity: 0.8 }); addFlutter(lMat, 0.006);
    inst(lfG, lMat, leaflets, leafletTex, 0.5);
    const pMat = new THREE.MeshStandardMaterial({ map: petalTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, envMapIntensity: 0.55, emissive: new THREE.Color(0.35, 0.02, 0.04), emissiveMap: petalTex, emissiveIntensity: 0.12 });
    inst(petIn, pMat, pin, petalTex, 0.45); inst(petOut, pMat, pout, petalTex, 0.45); inst(petFlat, pMat, ground, petalTex, 0.45);
    const sMat = new THREE.MeshStandardMaterial({ map: sepalTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 });
    inst(spG, sMat, sep, sepalTex, 0.45);
    inst(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: lin(0xf0c030), roughness: 0.6 }), stam.map(([m, c]) => [m.multiply(new THREE.Matrix4().makeScale(0.004, 0.006, 0.004)), c]));
    inst(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: lin(0x4a6a28), roughness: 0.5 }), hips);
  }
}
