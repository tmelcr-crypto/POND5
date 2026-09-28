import * as THREE from 'three';
import { clamp, lin } from '../../core/math.js';
import { fbm3, vnoise3, hash3 } from '../../core/noise.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { CAVE, H } from '../../world/layout.js';
import { finishRock } from './rockOutcrop.js';
import { voice } from '../fauna/animalKit.js';

/**
 * The cave (#63; site and walls: CAVE in world/layout.js). A rocky knoll on the meadow slope, painted like the island's
 * boulders (rockOutcrop.js finishRock), with a cave inside: its shell is the same dome a wall's thickness smaller, open
 * through an arched mouth facing the pond; the mouth's sides join the two. Inside it is dark: every surface carries a
 * baked occlusion (attribute `ao`, 1 outside, falling to a few percent at the back) that dims the sky's and the
 * surroundings' light, so the far end shows only by the hand lantern's light. On the back wall, old ochre paintings (a
 * herd of deer, hands, a sun, people); in a niche, a cluster of pale crystals that catch the lantern's light; water
 * drips now and then (a soft plink from where you are, only inside). All rock is one mesh; paintings and crystals one each.
 */
const NU = 96, NV = 20;
/** Merge geometries (indexed or not) keeping the listed attributes at their own sizes. */
function merge(list, attrs) {
  const out = {}; attrs.forEach(a => out[a] = []);
  for (let g of list) { if (g.index) g = g.toNonIndexed(); for (const a of attrs) { const arr = g.attributes[a].array; for (let i = 0; i < arr.length; i++) out[a].push(arr[i]); } }
  const m = new THREE.BufferGeometry(); for (const a of attrs) m.setAttribute(a, new THREE.Float32BufferAttribute(out[a], list[0].attributes[a].itemSize)); return m;
}
/** Occlusion: sky and bounce light scaled by the vertex attribute `ao` (direct sun still meets the shadow map). */
function addCaveDark(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev.call(mat, s, r);
    s.vertexShader = 'attribute float ao;\nvarying float vAO;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAO = ao;');
    s.fragmentShader = 'varying float vAO;\n' + s.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO;');
  };
  return mat;
}

export function createCave(ctx, { ambience } = {}) {
  const { scene, camera } = ctx, C = CAVE, seed = 7.3;
  const W = (lx, lz) => C.toWorld(lx, lz);
  // the dome's surface: u round (0 = the mouth), v up from the ground (0) to the top (pi / 2)
  const outerAt = (u, v) => {
    const dx = Math.sin(u) * Math.cos(v), dy = Math.sin(v), dz = Math.cos(u) * Math.cos(v);
    const n = fbm3(dx * 1.7 + seed, dy * 1.7, dz * 1.7) * 0.2 + fbm3(dx * 5 + 2, dy * 5, dz * 5) * 0.06;
    const lx = C.a * dx * (1 + n), lz = C.c * dz * (1 + n), [x, z] = W(lx, lz);
    return [x, H(x, z) - 0.35 + (C.b + 0.35) * Math.pow(dy, 0.85) * (1 + n * 0.8) + 0.04 * Math.sin(dy * 22 + n * 9), z];   // faint strata
  };
  const innerAt = (u, v) => {
    const dx = Math.sin(u) * Math.cos(v), dy = Math.sin(v), dz = Math.cos(u) * Math.cos(v);
    const n = fbm3(dx * 2.3 - seed, dy * 2.3, dz * 2.3) * 0.12 + fbm3(dx * 7, dy * 7, dz * 7 + 3) * 0.04;
    const lx = (C.a - C.wall) * dx * (1 + n), lz = (C.c - C.wall) * dz * (1 + n), [x, z] = W(lx, lz);
    return [x, H(x, z) - 0.1 + (C.b - C.wall - 0.25) * Math.pow(dy, 0.8) * (1 + n * 0.6), z];
  };
  const wrap = u => Math.atan2(Math.sin(u), Math.cos(u));
  const ARCH = 1.02, open = (u, v) => Math.abs(wrap(u)) < C.mouth * Math.sqrt(Math.max(0, 1 - (v / ARCH) ** 2));   // the arched mouth: ARCH the angle of its top
  const depth = (x, z) => { const [, lz] = C.toLocal(x, z); return clamp((C.c - lz) / (2 * C.c)); };   // 0 at the mouth, 1 at the back
  const aoIn = (x, y, z) => { const d = depth(x, z); return 0.05 + 0.85 * Math.pow(1 - d, 1.8) + 0.04 * clamp(1 - (y - H(x, z)) / 2); };   // daylight from the mouth, dark at the back

  function shell(at, keep) {
    const pos = [], idx = [], cell = (i, j) => keep(((((i % NU) + NU) % NU) + 0.5) / NU * Math.PI * 2, ((j + 0.5) / NV) * Math.PI / 2);
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      let u = (i / NU) * Math.PI * 2, v = (j / NV) * Math.PI / 2;
      // a vertex on the mouth's edge (between an open and a closed cell) goes onto the arch itself, so the edge is smooth
      const around = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].filter(([a, b]) => b >= 0 && b < NV).map(([a, b]) => cell(a, b));
      if (around.some(Boolean) && around.some(k => !k)) { const w = wrap(u), th = Math.atan2(v / ARCH, w / C.mouth); u = C.mouth * Math.cos(th); v = ARCH * Math.sin(th); }
      pos.push(...at(u, v));
    }
    const k = (i, j) => j * (NU + 1) + i;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) if (cell(i, j)) idx.push(k(i, j), k(i + 1, j), k(i + 1, j + 1), k(i, j), k(i + 1, j + 1), k(i, j + 1));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return { g, pos, k, cell };
  }
  const notOpen = (u, v) => !open(u, v);
  const out = shell(outerAt, notOpen), inn = shell(innerAt, notOpen);
  // the mouth's sides: join the two shells along every edge between an open and a closed cell
  const band = [];
  const P = (arr, n) => [arr[n * 3], arr[n * 3 + 1], arr[n * 3 + 2]];
  const quad = (a, b, c, d) => band.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    if (!out.cell(i, j)) continue;
    const i2 = (i + 1) % NU, i0 = (i + NU - 1) % NU;
    if (!out.cell(i2, j)) quad(P(out.pos, out.k(i + 1, j)), P(out.pos, out.k(i + 1, j + 1)), P(inn.pos, inn.k(i + 1, j + 1)), P(inn.pos, inn.k(i + 1, j)));
    if (!out.cell(i0, j)) quad(P(out.pos, out.k(i, j)), P(out.pos, out.k(i, j + 1)), P(inn.pos, inn.k(i, j + 1)), P(inn.pos, inn.k(i, j)));
    if (j > 0 && !out.cell(i, j - 1)) quad(P(out.pos, out.k(i, j)), P(out.pos, out.k(i + 1, j)), P(inn.pos, inn.k(i + 1, j)), P(inn.pos, inn.k(i, j)));
  }
  const bandG = new THREE.BufferGeometry(); bandG.setAttribute('position', new THREE.Float32BufferAttribute(band, 3)); bandG.computeVertexNormals();

  // colours and occlusion: the outside like the island's boulders; the inside damp, darker rock
  const outG = finishRock(out.g, H); outG.setAttribute('ao', new THREE.Float32BufferAttribute(new Float32Array(outG.attributes.position.count).fill(1), 1));
  const dampRock = (g, aoFn) => {
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), ao = new Float32Array(n), uv = new Float32Array(n * 2), c = new THREE.Color();
    const r0 = lin(0x857865), r1 = lin(0x5a5045), wet = lin(0x2f2a24), min = lin(0xb9ab8c);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      c.copy(r0).lerp(r1, clamp(fbm3(x * 2.2, y * 2.2, z * 2.2) + 0.5)).multiplyScalar(0.85 + 0.25 * vnoise3(x * 25, y * 25, z * 25));
      c.lerp(wet, clamp(Math.sin(x * 3 + fbm3(x, y * 4, z) * 6) * 2 - 1.2) * 0.5);   // damp streaks
      if (vnoise3(x * 9, y * 9, z * 9) > 0.78) c.lerp(min, 0.25);                   // pale mineral seams
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; ao[i] = aoFn(x, y, z); uv[i * 2] = x; uv[i * 2 + 1] = y;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('ao', new THREE.BufferAttribute(ao, 1)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const innG = dampRock(inn.g, aoIn);
  const bandC = dampRock(bandG, (x, y, z) => 0.35 + 0.65 * (1 - depth(x, z)) * 0.6);
  // the floor: packed earth and grit over the ground inside, a little above it
  const floorPos = [], FR = 14, FA = 48;
  for (let r = 0; r <= FR; r++) for (let a = 0; a <= FA; a++) {
    const t = r / FR, u = a / FA * Math.PI * 2, lx = Math.sin(u) * (C.a - C.wall + 0.15) * t, lz = Math.cos(u) * (C.c - C.wall + 0.15) * t, [x, z] = W(lx, lz);
    floorPos.push(x, H(x, z) + 0.03 + 0.02 * vnoise3(x * 3, 0, z * 3), z);
  }
  const fIdx = []; for (let r = 0; r < FR; r++) for (let a = 0; a < FA; a++) { const k = (rr, aa) => rr * (FA + 1) + aa; fIdx.push(k(r, a), k(r + 1, a), k(r + 1, a + 1), k(r, a), k(r + 1, a + 1), k(r, a + 1)); }
  const floorG = new THREE.BufferGeometry(); floorG.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3)); floorG.setIndex(fIdx); floorG.computeVertexNormals();
  const floor = dampRock(floorG, (x, y, z) => aoIn(x, y, z) * 0.9);
  { const col = floor.attributes.color, p = floor.attributes.position, earth = lin(0x3d3228), c = new THREE.Color(); for (let i = 0; i < col.count; i++) { c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(earth, 0.6); if (hash3(Math.floor(p.getX(i) * 12), 0, Math.floor(p.getZ(i) * 12)) > 0.93) c.multiplyScalar(1.6); col.setXYZ(i, c.r, c.g, c.b); } }
  const rockMat = addCaveDark(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.55, side: THREE.DoubleSide }));
  const rock = new THREE.Mesh(merge([outG, innG, bandC, floor], ['position', 'normal', 'color', 'ao']), rockMat);
  rock.castShadow = rock.receiveShadow = true; rock.name = 'cave'; scene.add(rock);

  /* ---- paintings on the back wall: a patch of the inner shell, a little in front of it ---- */
  const art = canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); let s = 71; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const ochre = a => `rgba(${150 + rnd() * 40 | 0},${60 + rnd() * 25 | 0},${30 + rnd() * 15 | 0},${a})`;
    const deer = (x, y, k, flip) => {   // body, neck, head, legs, antlers
      g.save(); g.translate(x, y); g.scale(flip ? -k : k, k); g.fillStyle = ochre(0.8); g.strokeStyle = ochre(0.8); g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, 0, 26, 11, 0, 0, 6.28); g.fill();
      g.lineWidth = 5; g.beginPath(); g.moveTo(20, -5); g.lineTo(32, -20); g.stroke(); g.beginPath(); g.ellipse(36, -22, 7, 4, -0.3, 0, 6.28); g.fill();
      g.lineWidth = 3.5; for (const lx of [-18, -12, 12, 18]) { g.beginPath(); g.moveTo(lx, 6); g.lineTo(lx + (lx > 0 ? 3 : -2), 28); g.stroke(); }
      g.lineWidth = 2; g.beginPath(); g.moveTo(33, -25); g.lineTo(28, -42); g.moveTo(30, -34); g.lineTo(22, -38); g.moveTo(37, -25); g.lineTo(42, -40); g.moveTo(40, -33); g.lineTo(48, -36); g.stroke();
      g.restore();
    };
    deer(150, 120, 1.3, false); deer(250, 100, 1.0, false); deer(330, 135, 1.15, true); deer(95, 175, 0.8, false);
    g.fillStyle = ochre(0.75); g.beginPath(); g.arc(440, 60, 22, 0, 6.28); g.fill(); g.strokeStyle = ochre(0.7); g.lineWidth = 3;   // the sun
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; g.beginPath(); g.moveTo(440 + Math.cos(a) * 28, 60 + Math.sin(a) * 28); g.lineTo(440 + Math.cos(a) * 40, 60 + Math.sin(a) * 40); g.stroke(); }
    const hand = (x, y, k, a) => {   // a hand stencil: sprayed pigment round an open hand
      g.save(); g.translate(x, y); g.rotate(a); g.scale(k, k);
      const grd = g.createRadialGradient(0, 0, 8, 0, 0, 38); grd.addColorStop(0, 'rgba(160,58,34,0.55)'); grd.addColorStop(1, 'rgba(160,58,34,0)'); g.fillStyle = grd; g.fillRect(-40, -40, 80, 80);
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, 6, 11, 13, 0, 0, 6.28); g.fill();
      for (const [fx, len, fa] of [[-9, 16, -0.35], [-4, 21, -0.1], [2, 22, 0.05], [8, 19, 0.2], [13, 12, 0.8]]) { g.save(); g.translate(fx, 0); g.rotate(fa); g.beginPath(); g.ellipse(0, -len / 2, 3, len / 2, 0, 0, 6.28); g.fill(); g.restore(); }
      g.restore(); g.globalCompositeOperation = 'source-over';
    };
    hand(40, 70, 1, -0.2); hand(470, 175, 0.9, 0.3); hand(60, 215, 0.8, 0.1);
    g.strokeStyle = 'rgba(40,28,22,0.75)'; g.lineWidth = 3; g.lineCap = 'round';   // charcoal people with bows
    for (const [x, y] of [[380, 200], [405, 205], [425, 198]]) { g.beginPath(); g.arc(x, y - 22, 4, 0, 6.28); g.moveTo(x, y - 18); g.lineTo(x, y); g.lineTo(x - 6, y + 14); g.moveTo(x, y); g.lineTo(x + 6, y + 14); g.moveTo(x - 8, y - 12); g.lineTo(x + 9, y - 10); g.stroke(); }
  });
  const u0 = Math.PI - 0.55, u1 = Math.PI + 0.55, v0 = 0.14, v1 = 0.62, AU = 28, AV = 12, apos = [], auv = [], aao = [], aidx = [];
  for (let j = 0; j <= AV; j++) for (let i = 0; i <= AU; i++) {
    const u = u0 + (u1 - u0) * i / AU, v = v0 + (v1 - v0) * j / AV, p = innerAt(u, v);
    const [lx, lz] = C.toLocal(p[0], p[2]), l = Math.hypot(lx, lz) || 1, [ix, iz] = W(lx * (1 - 0.03 / l), lz * (1 - 0.03 / l));   // a finger's width in front of the rock
    apos.push(ix, p[1] - 0.005, iz); auv.push(1 - i / AU, j / AV); aao.push(aoIn(p[0], p[1], p[2]));
  }
  for (let j = 0; j < AV; j++) for (let i = 0; i < AU; i++) { const k = (a, b) => b * (AU + 1) + a; aidx.push(k(i, j), k(i + 1, j), k(i + 1, j + 1), k(i, j), k(i + 1, j + 1), k(i, j + 1)); }
  const artG = new THREE.BufferGeometry(); artG.setAttribute('position', new THREE.Float32BufferAttribute(apos, 3)); artG.setAttribute('uv', new THREE.Float32BufferAttribute(auv, 2)); artG.setAttribute('ao', new THREE.Float32BufferAttribute(aao, 1)); artG.setIndex(aidx); artG.computeVertexNormals();
  const artMat = addCaveDark(new THREE.MeshStandardMaterial({ map: art, transparent: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const paintings = new THREE.Mesh(artG, artMat); paintings.receiveShadow = true; paintings.renderOrder = 1; scene.add(paintings);

  /* ---- crystals in a niche on the left, pale and faintly glowing ---- */
  const cry = []; let cs = 913; const crnd = () => { cs = (cs * 16807) % 2147483647; return (cs - 1) / 2147483646; };
  const nu = 2.3, nv = 0.1, base = innerAt(nu, nv), [bl, bz] = C.toLocal(base[0], base[2]);
  for (let i = 0; i < 11; i++) {
    const h = 0.12 + crnd() * 0.32, r = 0.025 + crnd() * 0.035, g = new THREE.CylinderGeometry(r, r, h, 6, 1); const tip = new THREE.ConeGeometry(r, r * 2.4, 6); tip.translate(0, h / 2 + r * 1.2, 0);
    const m = mergeGeos([g, tip], ['position', 'normal']); m.translate(0, h / 2, 0);
    m.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((crnd() - 0.5) * 1.1, crnd() * 6.28, (crnd() - 0.5) * 1.1)));
    const [x, z] = W(bl * 0.93 + (crnd() - 0.5) * 0.35, bz * 0.93 + (crnd() - 0.5) * 0.35); m.translate(x, H(x, z) + 0.02, z); cry.push(m);
  }
  const cryMat = addCaveDark(new THREE.MeshStandardMaterial({ color: 0xcfe2f2, emissive: 0x2f4d6a, emissiveIntensity: 0.22, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 }));
  const cryG = mergeGeos(cry, ['position', 'normal']); cryG.setAttribute('ao', new THREE.Float32BufferAttribute(new Float32Array(cryG.attributes.position.count).fill(0.06), 1));
  const crystals = new THREE.Mesh(cryG, cryMat); crystals.castShadow = false; crystals.receiveShadow = true; scene.add(crystals);   // (the knoll's shadow keeps the sun off them)

  /* ---- drips: a soft plink now and then while you are inside ---- */
  let next = 2;
  const cam = camera.position, drip = new THREE.Vector3();
  return {
    mesh: rock, paintings, crystals,
    inside: () => { const [lx, lz] = C.toLocal(cam.x, cam.z); return Math.hypot(lx / C.a, lz / C.c) < 0.8; },
    update(dt) {
      if ((next -= dt) > 0) return; next = 1.5 + Math.random() * 4;
      if (!this.inside()) return;
      const [x, z] = W((Math.random() - 0.5) * 3, (Math.random() - 0.7) * 3); drip.set(x, H(x, z) + 0.1, z);
      const v = voice(ambience, camera, drip, 8, 0.6); if (!v) return;
      const f = 1400 + Math.random() * 900; v.tone(f, f * 0.55, 0.12, 0.35, 0, 'sine'); v.tone(f * 1.5, f * 0.8, 0.08, 0.08, 0.02, 'sine');
    },
  };
}
