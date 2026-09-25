import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos, paint } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addWorldSway } from '../../core/shaderPatches.js';
import { GARDEN } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The vegetable garden behind the cabin (#8; site: GARDEN in world/layout.js, sowing and harvest: app/gardening.js):
 * three raised beds framed with weathered planks, dark furrowed soil, one crop per bed in three plots. The crops are
 * instanced per part and drawn at the size their growth says (set(i, crop, k): k 0 just sown .. 1 ripe; null: bare):
 *  - carrots: 8 feathery tops a plot; ripe, their orange shoulders show at the soil;
 *  - potatoes: 2 leafy plants a plot; ripe, they flower;
 *  - pumpkins: one vine of big leaves a plot; its pumpkin swells from green to orange.
 * Leaves sway with the wind and are gone in winter (role 'crop', world/seasonLooks.js); snow settles on the beds.
 * A seed box stands at the path's end: carrot seed packets, seed potatoes and pumpkin seed packets to pick up.
 * produceModel(kind): the picked produce (carrot, potato, pumpkin and their cooked kinds) for the hand and the stick.
 * Its own random numbers.
 */
export const PLANTS = { carrot: 8, potato: 2, pumpkin: 1 };   // plants in a plot

export function createGarden(ctx) {
  const { scene, maxAniso } = ctx, G = GARDEN;
  let seed = 6263; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group(); group.name = 'garden'; scene.add(group);

  /* ---- the beds: plank frames and soil ---- */
  const grain = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#8a7152'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) { const x = rnd() * w, y = rnd() * h, len = 30 + rnd() * 160; g.strokeStyle = rnd() < 0.6 ? `rgba(48,32,20,${0.1 + rnd() * 0.3})` : `rgba(215,195,165,${0.05 + rnd() * 0.15})`; g.lineWidth = 0.6 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-3, 3), y + len / 3, x + rr(-3, 3), y + len * 2 / 3, x, y + len); g.stroke(); }
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.anisotropy = maxAniso;
  const frame = [], soil = [], T = 0.045;
  for (const b of G.beds) {
    const h = b.y - b.base, cy = b.base + h / 2;
    const board = (w, d, x, z) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, o = rnd();
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k) * 0.3 + o, uv.getX(k) * Math.max(w, d) * 0.8 + o * 3);   // grain along the board
      paint(g, c => c.setScalar(rr(0.85, 1.1))); g.translate(x, cy, z); frame.push(g);
    };
    board(G.bedW + T, T, b.x, b.z - G.bedL / 2); board(G.bedW + T, T, b.x, b.z + G.bedL / 2);
    board(T, G.bedL - T, b.x - G.bedW / 2, b.z); board(T, G.bedL - T, b.x + G.bedW / 2, b.z);
    // soil: a slightly mounded top with furrows along the bed, sunk 2 cm under the boards' tops
    const s = new THREE.BoxGeometry(G.bedW - T, h, G.bedL - T, 12, 1, 30), p = s.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) - 0.02 + 0.012 * Math.cos(x / (G.bedW / 2) * Math.PI / 2) - 0.008 * Math.abs(Math.sin(x * 22)) + 0.003 * Math.sin(z * 31 + x * 7)); }
    s.computeVertexNormals();
    paint(s, (c, x, y, z) => c.copy(lin(0x3b2a1e)).multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(x * 22)) + 0.1 * Math.sin(z * 17 + x * 5)));
    s.translate(b.x, cy, b.z); soil.push(s);
  }
  /* ---- the seed box at the path's end: a little crate on legs, three compartments (seeds to pick up: app/items.js) ---- */
  {
    const SB = G.seedBox, bw = SB.w, bl = SB.l, top = SB.y + SB.h, dp = 0.14;
    const plank = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, o = rnd();
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k) * 0.3 + o, uv.getX(k) * Math.max(w, d) * 0.8 + o * 3);
      paint(g, c => c.setScalar(rr(0.8, 1.02))); g.translate(x, y, z); frame.push(g);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(0.04, SB.h - dp + 0.03, 0.04, SB.x + sx * (bw / 2 - 0.03), SB.y + (SB.h - dp) / 2 - 0.01, SB.z + sz * (bl / 2 - 0.03));
    plank(bw, 0.02, bl, SB.x, top - dp, SB.z);
    for (const s of [-1, 1]) { plank(bw, dp, 0.02, SB.x, top - dp / 2, SB.z + s * bl / 2); plank(0.02, dp, bl, SB.x + s * bw / 2, top - dp / 2, SB.z); }
    for (const dz of [-0.095, 0.095]) plank(bw - 0.02, dp * 0.8, 0.012, SB.x, top - dp * 0.55, SB.z + dz);
    // what is in it: carrot and pumpkin seed packets standing in their compartments, seed potatoes between them
    const packet = (x, z, lean, pic) => { const g = new THREE.BoxGeometry(0.055, 0.08, 0.008); paint(g, (c, px, py) => c.copy(lin(py > 0.012 ? 0xeee4cc : pic))); g.rotateX(lean); g.rotateY(rr(-0.2, 0.2)); g.translate(x, top - dp + 0.055, z); soil.push(g); };
    for (let k = 0; k < 4; k++) { packet(SB.x + (k - 1.5) * 0.07, SB.z - 0.19 + rr(-0.02, 0.02), rr(-0.35, 0.35), 0xe07a24); packet(SB.x + (k - 1.5) * 0.07, SB.z + 0.19 + rr(-0.02, 0.02), rr(-0.35, 0.35), k % 2 ? 0xd9731c : 0x6a8a36); }
    for (let k = 0; k < 6; k++) { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(0.03, 0.022, 0.024); paint(g, c => c.copy(lin(0xa7865a)).multiplyScalar(rr(0.8, 1.1))); g.rotateY(rr(0, 6.28)); g.translate(SB.x + (k % 3 - 1) * 0.08 + rr(-0.01, 0.01), top - dp + 0.035 + Math.floor(k / 3) * 0.03, SB.z + (Math.floor(k / 3) - 0.5) * 0.05); soil.push(g); }
    obstacles.add(SB.x, SB.z, 0.34, SB.y + 1.9);
  }
  const frameMat = new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.85, metalness: 0, userData: { season: 'roof' } });
  const soilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, userData: { season: 'roof' } });
  const addM = (geo, mat, cast) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  addM(mergeGeos(frame, ['position', 'normal', 'uv', 'color']), frameMat, true);
  addM(mergeGeos(soil, ['position', 'normal', 'color']), soilMat, false);

  /* ---- the crops' parts ---- */
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, userData: { season: 'crop' } });
  addWorldSway(leafMat, 0.5);
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, userData: { season: 'crop' } });
  const parts = {
    carrotTop: [carrotTopGeo(rr), leafMat], carrotRoot: [carrotRootGeo(), solidMat],
    potato: [potatoPlantGeo(rr), leafMat], potatoFlower: [potatoFlowerGeo(rr), solidMat],
    pumpkinVine: [pumpkinVineGeo(rr), leafMat], pumpkin: [pumpkinGeo(), solidMat],
  };
  const want = { carrotTop: 'carrot', carrotRoot: 'carrot', potato: 'potato', potatoFlower: 'potato', pumpkinVine: 'pumpkin', pumpkin: 'pumpkin' };
  // where each plant of each plot stands (its offset and turn), fixed
  const spots = G.plots.map(pl => {
    const n = PLANTS[pl.crop], L = G.bedL / 3 - 0.14, list = [];
    for (let j = 0; j < n; j++) {
      const ox = pl.crop === 'carrot' ? (j % 2 ? 0.17 : -0.17) : pl.crop === 'potato' ? rr(-0.06, 0.06) : rr(-0.08, 0.08);
      const oz = pl.crop === 'carrot' ? (Math.floor(j / 2) - 1.5) * L / 4 : pl.crop === 'potato' ? (j - 0.5) * L / 2 : rr(-0.05, 0.05);
      list.push({ x: pl.x + ox + rr(-0.015, 0.015), z: pl.z + oz, yaw: rr(0, 6.28), s: rr(0.85, 1.12), fx: rr(-0.1, 0.1), fz: rr(0.08, 0.16) });
    }
    return list;
  });
  const meshes = {}, slot = {};   // part -> InstancedMesh; plot index -> its first instance in each part
  for (const [name, [geo, mat]] of Object.entries(parts)) {
    let n = 0; G.plots.forEach((pl, i) => { if (pl.crop === want[name]) { (slot[i] = slot[i] || {})[name] = n; n += PLANTS[pl.crop]; } });
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.count = n; im.castShadow = name !== 'potatoFlower'; im.receiveShadow = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3).fill(1), 3);
    im.userData.dynamic = true; group.add(im); meshes[name] = im;
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new V(), P = new V(), E = new THREE.Euler(), zero = new THREE.Matrix4().makeScale(0, 0, 0), C = new THREE.Color();
  const shown = Object.fromEntries(Object.entries(meshes).map(([k, im]) => [k, new Array(im.count).fill(false)]));
  const green = lin(0x4f7a2a), orange = lin(0xd9731c);
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /** Plot i shows crop at growth k (0 sown .. 1 ripe), or nothing (crop null). */
  function set(i, crop, k) {
    const pl = G.plots[i], sl = slot[i];
    for (const name of Object.keys(sl)) {
      const im = meshes[name];
      spots[i].forEach((sp, j) => {
        let s = 0, y = pl.y - 0.01, tint = null;
        if (crop) {
          const grow = 0.08 + 0.92 * smooth(0, 1, k);
          if (name === 'carrotTop' || name === 'potato' || name === 'pumpkinVine') s = grow * sp.s;
          else if (name === 'carrotRoot') { s = k >= 1 ? sp.s : 0; y -= 0.01; }
          else if (name === 'potatoFlower') s = k >= 1 ? sp.s : 0;
          else if (name === 'pumpkin') { s = k > 0.4 ? (0.3 + 0.7 * smooth(0.4, 1, k)) * sp.s : 0; tint = C.copy(green).lerp(orange, smooth(0.6, 1, k)); }
        }
        shown[name][sl[name] + j] = s > 0;
        if (s <= 0) { im.setMatrixAt(sl[name] + j, zero); return; }
        const ox = name === 'pumpkin' ? Math.cos(sp.yaw) * 0.16 : 0, oz = name === 'pumpkin' ? -Math.sin(sp.yaw) * 0.16 : 0;
        M.compose(P.set(sp.x + ox, y, sp.z + oz), Q.setFromEuler(E.set(name === 'pumpkin' ? 0 : sp.fx * s, sp.yaw, 0)), S.setScalar(s));
        im.setMatrixAt(sl[name] + j, M); if (tint) im.setColorAt(sl[name] + j, tint);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.visible = shown[name].some(Boolean);   // nothing of it growing: not drawn at all
    }
  }
  G.plots.forEach((_, i) => set(i, null, 0));
  return { group, set, plots: G.plots, target: i => new V(G.plots[i].x, G.plots[i].y + 0.08, G.plots[i].z) };
}

/* ---- the crops, 1 unit = 1 m, base at the origin ---- */
const leafCol = (c, base, x, y) => c.copy(lin(base)).multiplyScalar(0.75 + 0.45 * Math.min(1, y * 4) + 0.08 * Math.sin(x * 40));
/** Feathery carrot tops: ~9 fine fronds arching out of the soil. */
function carrotTopGeo(rr) {
  const list = [];
  for (let f = 0; f < 9; f++) {
    const a = f / 9 * Math.PI * 2 + rr(-0.3, 0.3), lean = rr(0.25, 0.6), len = rr(0.16, 0.24), segs = 5;
    for (let s = 0; s < segs; s++) {   // a frond: a chain of small leaflets along an arching stem
      const t = (s + 0.5) / segs, g = new THREE.PlaneGeometry(0.035 * (1 - t * 0.5), len / segs * 1.3);
      g.rotateZ(rr(-0.3, 0.3)); g.translate(Math.sin(lean * t * 1.6) * len * t * 0.8, len * t * (1 - lean * t * 0.5), 0); g.rotateY(a); list.push(g);
    }
  }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, 0x4e8a2c, x, y));
}
/** A ripe carrot's orange shoulders at the soil, 2 cm across. */
function carrotRootGeo() {
  const g = new THREE.CylinderGeometry(0.011, 0.009, 0.03, 10, 1); g.translate(0, 0.005, 0);
  return paint(g, (c, x, y) => c.copy(lin(0xe07a24)).multiplyScalar(0.85 + y * 5));
}
/** A potato plant: a mound of oval leaves on short stems, ~35 cm tall at full size. */
function potatoPlantGeo(rr) {
  const list = [];
  for (let s = 0; s < 7; s++) {
    const a = s / 7 * Math.PI * 2 + rr(-0.3, 0.3), h = rr(0.15, 0.3), out = rr(0.06, 0.14);
    const stem = new THREE.CylinderGeometry(0.004, 0.006, h, 4, 1); stem.translate(0, h / 2, 0); stem.rotateZ(out * 2); stem.rotateY(a); list.push(stem);
    for (let l = 0; l < 4; l++) {
      const t = 0.45 + l * 0.18, g = new THREE.CircleGeometry(0.05, 7); g.scale(0.7, 1, 1); g.rotateX(-Math.PI / 2 + rr(0.3, 0.9)); g.rotateY(rr(0, 6.28));
      g.translate(Math.sin(out * 2) * h * t + rr(-0.03, 0.03), h * t + rr(-0.02, 0.02), rr(-0.03, 0.03)); g.rotateY(a); list.push(g);
    }
  }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, 0x3f6e2a, x, y));
}
/** White-and-yellow potato flowers over the leaves. */
function potatoFlowerGeo(rr) {
  const list = [];
  for (let f = 0; f < 5; f++) {
    const a = rr(0, 6.28), r = rr(0.02, 0.1), y = rr(0.28, 0.34);
    for (let p = 0; p < 5; p++) { const g = new THREE.CircleGeometry(0.009, 5); g.scale(1, 0.6, 1); g.translate(0, 0.008, 0); g.rotateZ(p / 5 * Math.PI * 2); g.rotateX(-Math.PI / 2); g.translate(Math.cos(a) * r, y, Math.sin(a) * r); list.push(g); }
    const eye = new THREE.SphereGeometry(0.004, 5, 4); eye.translate(Math.cos(a) * r, y + 0.003, Math.sin(a) * r); list.push(eye);
  }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => c.copy(lin((y * 1000) % 1 > 0.2 ? 0xf2eee6 : 0xe8c23a)));
}
/** A pumpkin vine: big lobed leaves on long stalks spreading low, a curl of tendril. */
function pumpkinVineGeo(rr) {
  const list = [];
  for (let l = 0; l < 6; l++) {
    const a = l / 6 * Math.PI * 2 + rr(-0.3, 0.3), d = rr(0.08, 0.22), h = rr(0.12, 0.22);
    const stalk = new THREE.CylinderGeometry(0.004, 0.006, h + 0.04, 4, 1); stalk.translate(0, (h + 0.04) / 2, 0); stalk.rotateZ(-0.5); stalk.translate(d * 0.5, 0, 0); stalk.rotateY(a); list.push(stalk);
    const leaf = new THREE.CircleGeometry(0.1, 10), p = leaf.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y); if (r > 0.01) { const k = 0.8 + 0.2 * Math.cos(Math.atan2(y, x) * 5); p.setXY(i, x * k, y * k); } }   // five lobes
    leaf.rotateX(-Math.PI / 2 + rr(0.15, 0.5)); leaf.translate(d, h, 0); leaf.rotateY(a); list.push(leaf);
  }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, 0x4a7a30, x, y));
}
/** A small ribbed pumpkin, ~16 cm across, with its stalk. */
function pumpkinGeo() {
  const g = new THREE.SphereGeometry(0.08, 24, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 - 0.06 * Math.pow(Math.abs(Math.sin(Math.atan2(z, x) * 5)), 0.5); p.setXYZ(i, x * k, y * 0.78, z * k); }
  g.computeVertexNormals(); g.translate(0, 0.062, 0);
  paint(g, (c, x, y, z) => c.setScalar(0.82 + 0.25 * Math.pow(Math.abs(Math.cos(Math.atan2(z, x) * 5)), 2)));   // the ribs' shading (tinted per instance)
  const st = new THREE.CylinderGeometry(0.008, 0.012, 0.04, 6, 1); st.rotateZ(0.3); st.translate(0.004, 0.13, 0); paint(st, c => c.copy(lin(0x6a5a2a)).multiplyScalar(1.6));
  return mergeGeos([g, st], ['position', 'normal', 'color']);
}

/* ---- the produce in the hand and on the roasting stick (app/items.js) ---- */
const PRODUCE = {
  carrot: () => { const g = new THREE.ConeGeometry(0.018, 0.14, 12, 4); g.rotateX(Math.PI); g.translate(0, 0.07, 0); paint(g, (c, x, y) => c.copy(lin(0xe07a24)).multiplyScalar(0.8 + 0.25 * Math.abs(Math.sin(y * 90)))); const t = new THREE.CylinderGeometry(0.004, 0.006, 0.05, 5); t.translate(0, 0.165, 0); paint(t, c => c.copy(lin(0x4e8a2c))); return mergeGeos([g, t], ['position', 'normal', 'color']); },
  potato: () => { const g = new THREE.SphereGeometry(0.035, 14, 10), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.08 * Math.sin(p.getX(i) * 90) * Math.cos(p.getZ(i) * 70); p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.85, p.getZ(i) * k); } g.computeVertexNormals(); return paint(g, (c, x, y, z) => c.copy(lin(0xb58a55)).multiplyScalar(Math.sin(x * 140 + z * 90) > 0.93 ? 0.6 : 0.9 + 0.1 * Math.sin(y * 60))); },
  pumpkin: () => { const g = pumpkinGeo(); g.scale(0.75, 0.75, 0.75); g.translate(0, -0.05, 0); const c = g.attributes.color, o = lin(0xd9731c); for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * o.r, c.getY(i) * o.g, c.getZ(i) * o.b); return g; },
};
const COOKED = { bakedPotato: ['potato', 0x8a5a2e], roastedPumpkin: ['pumpkin', 0xa8501a], seedPotato: ['potato', 0xd8c8b0] };
export const PRODUCE_KINDS = { carrot: 1, potato: 1, pumpkin: 1, bakedPotato: 1, roastedPumpkin: 1, seedPotato: 1 };
export function produceModel(kind) {
  const [raw, col] = COOKED[kind] || [kind, 0xffffff];
  return { geo: PRODUCE[raw](), mat: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(col).convertSRGBToLinear(), roughness: 0.6, metalness: 0 }) };
}
