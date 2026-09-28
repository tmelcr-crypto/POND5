import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos, paint } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addWorldSway } from '../../core/shaderPatches.js';
import { GARDEN } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The vegetable garden behind the cabin (#8; site: GARDEN in world/layout.js, sowing and harvest: app/gardening.js):
 * four raised beds framed with weathered planks, dark furrowed soil, four plots in each; any crop grows in any plot.
 * The crops are instanced per part and drawn at the size their growth says (set(i, crop, k): k 0 just sown .. 1 ripe;
 * null: bare):
 *  - carrots: 8 feathery tops a plot; ripe, their orange shoulders show at the soil;
 *  - potatoes: 2 leafy plants a plot; ripe, they flower;
 *  - pumpkins: one vine of big leaves a plot; its pumpkin swells from green to orange;
 *  - onions: 6 tufts of hollow upright leaves; the bulbs swell at the soil, golden when ripe;
 *  - lettuce: 2 heads of frilly leaves, growing into round heads;
 *  - beans: 2 poles, the vines climbing them; ripe, hung with pods;
 *  - strawberries: 3 low plants of three-lobed leaves; white flowers, then berries reddening.
 * Leaves sway with the wind and are gone in winter (role 'crop', world/seasonLooks.js); snow settles on the beds.
 * The potting table at the path's end holds seven trays of seeds to pick up, each with a little painted sign, and the
 * grow book (app/gardening.js opens it). produceModel(kind): the picked produce for the hand and the stick.
 * Its own random numbers.
 */
export const PLANTS = { carrot: 8, potato: 2, pumpkin: 1, onion: 6, lettuce: 2, beans: 2, strawberry: 3 };   // plants in a plot

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
  /* ---- the potting table at the path's end: four legs, a slatted top, a shelf below; seven seed trays along it with
     a little painted sign stuck in the front of each (seeds to pick up: app/items.js), and the grow book ---- */
  const signs = [];
  {
    const TB = G.table, top = TB.y + TB.h;
    const plank = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, o = rnd();
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k) * 0.3 + o, uv.getX(k) * Math.max(w, d) * 0.8 + o * 3);
      paint(g, c => c.setScalar(rr(0.8, 1.02))); g.translate(x, y, z); frame.push(g);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(0.05, TB.h, 0.05, TB.x + sx * (TB.w / 2 - 0.04), TB.y + TB.h / 2 - 0.02, TB.z + sz * (TB.l / 2 - 0.04));
    for (let k = 0; k < 5; k++) plank(TB.w / 5 - 0.008, 0.03, TB.l, TB.x - TB.w / 2 + (k + 0.5) * TB.w / 5, top - 0.015, TB.z);   // the top's slats
    plank(TB.w - 0.06, 0.02, TB.l - 0.1, TB.x, TB.y + 0.22, TB.z);   // a shelf with pots on it
    for (let k = 0; k < 5; k++) { const pot = new THREE.CylinderGeometry(0.06, 0.045, 0.1, 10, 1); paint(pot, c => c.copy(lin(0xa4583a)).multiplyScalar(rr(0.85, 1.1))); pot.translate(TB.x + rr(-0.12, 0.12), TB.y + 0.28, TB.z - TB.l / 2 + 0.15 + k * 0.28); soil.push(pot); }
    // the trays, and what is in them
    const LOOK = { carrotSeeds: 0xe07a24, seedPotato: 0xa7865a, pumpkinSeeds: 0xd9731c, onionSets: 0xc4a067, lettuceSeeds: 0x7fb049, beanSeeds: 0x8a5a3a, strawberryPlants: 0x4f8a34 };
    G.bins.forEach((b, i) => {
      const tw = 0.34, tl = 0.15, th = 0.05, y0 = top;
      plank(tw, 0.012, tl, b.x, y0 + 0.006, b.z); for (const s2 of [-1, 1]) { plank(tw, th, 0.01, b.x, y0 + th / 2, b.z + s2 * tl / 2); plank(0.01, th, tl, b.x + s2 * tw / 2, y0 + th / 2, b.z); }
      const col = lin(LOOK[b.kind]);
      if (b.kind === 'seedPotato' || b.kind === 'onionSets') {   // little tubers or bulbs, heaped
        for (let k = 0; k < 7; k++) { const g = new THREE.SphereGeometry(1, 8, 6); const r = b.kind === 'onionSets' ? 0.018 : 0.026; g.scale(r * 1.1, r * 0.85, r); if (b.kind === 'onionSets') g.translate(0, r * 0.4, 0); paint(g, c => c.copy(col).multiplyScalar(rr(0.8, 1.1))); g.rotateY(rr(0, 6.28)); g.translate(b.x + rr(-0.12, 0.12), y0 + 0.03 + (k > 4 ? 0.02 : 0), b.z + rr(-0.04, 0.04)); soil.push(g); }
      } else if (b.kind === 'strawberryPlants') {   // runners with a few leaves, their roots in a clump of soil
        for (let k = 0; k < 3; k++) { const x = b.x + (k - 1) * 0.1; const cl = new THREE.SphereGeometry(0.03, 8, 6); cl.scale(1, 0.6, 1); paint(cl, c => c.copy(lin(0x3b2a1e))); cl.translate(x, y0 + 0.025, b.z); soil.push(cl);
          for (let l = 0; l < 3; l++) { const lf = new THREE.CircleGeometry(0.022, 6); lf.rotateX(-Math.PI / 2 + 0.5); lf.rotateY(l * 2.1 + rr(0, 1)); lf.translate(x + Math.cos(l * 2.1) * 0.02, y0 + 0.06, b.z + Math.sin(l * 2.1) * 0.02); paint(lf, c => c.copy(col).multiplyScalar(rr(0.85, 1.1))); soil.push(lf); } }
      } else {   // seed packets standing in the tray
        for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(0.055, 0.08, 0.008); paint(g, (c, px, py) => c.copy(lin(py > 0.012 ? 0xeee4cc : LOOK[b.kind]))); g.rotateX(rr(-0.3, 0.3)); g.rotateY(Math.PI / 2 + rr(-0.2, 0.2)); g.translate(b.x + (k - 1.5) * 0.075, y0 + 0.05, b.z + rr(-0.02, 0.02)); soil.push(g); }
      }
      signs.push({ kind: b.kind, x: b.x + tw / 2 + 0.03, y: y0 + 0.1, z: b.z });
    });
    obstacles.add(TB.x, TB.z - TB.l / 4, 0.36, TB.y + 1.9); obstacles.add(TB.x, TB.z + TB.l / 4, 0.36, TB.y + 1.9);
  }
  /* ---- the signs: a stake with a small board, the seed's name painted on it (one texture for all) ---- */
  {
    const names = { carrotSeeds: 'Carrots', seedPotato: 'Potatoes', pumpkinSeeds: 'Pumpkins', onionSets: 'Onions', lettuceSeeds: 'Lettuce', beanSeeds: 'Beans', strawberryPlants: 'Strawberries' };
    const rows = signs.length, tex = canvasTex(256, 64 * rows, (g, w, h) => {
      signs.forEach((sg, i) => {
        const y0 = i * 64; g.fillStyle = '#c9b48e'; g.fillRect(0, y0, w, 64);
        for (let k = 0; k < 30; k++) { g.strokeStyle = `rgba(90,60,35,${0.08 + rnd() * 0.12})`; g.lineWidth = 1; g.beginPath(); const yy = y0 + rnd() * 64; g.moveTo(0, yy); g.lineTo(w, yy + rr(-2, 2)); g.stroke(); }
        g.fillStyle = '#3a2a1c'; g.font = 'italic 600 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(names[sg.kind], w / 2, y0 + 34);
      });
    });
    tex.anisotropy = maxAniso;
    const parts = [], stakes = [];
    signs.forEach((sg, i) => {
      const bd = new THREE.PlaneGeometry(0.15, 0.04), uv = bd.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / rows);
      bd.rotateY(Math.PI / 2); bd.rotateZ(-0.25); bd.translate(sg.x + 0.005, sg.y, sg.z); parts.push(bd);
      const st2 = new THREE.BoxGeometry(0.008, 0.12, 0.008); paint(st2, c => c.copy(lin(0x6e5236))); st2.translate(sg.x, sg.y - 0.055, sg.z); stakes.push(st2);
    });
    const board = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'uv']), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
    board.castShadow = true; board.receiveShadow = true; group.add(board);
    soil.push(...stakes);
  }
  /* ---- the grow book: a thick old book lying open at the table's far end ---- */
  const bookAt = new V(G.book.x, G.book.y + 0.03, G.book.z);
  {
    const B = G.book, cover = new THREE.BoxGeometry(0.2, 0.03, 0.3); paint(cover, c => c.copy(lin(0x4a2e22)));
    cover.translate(B.x, B.y, B.z); soil.push(cover);
    for (const s2 of [-1, 1]) { const pg = new THREE.BoxGeometry(0.19, 0.02, 0.14); const p2 = pg.attributes.position; for (let k = 0; k < p2.count; k++) p2.setY(k, p2.getY(k) + 0.006 * Math.cos(p2.getZ(k) / 0.07 * Math.PI / 2) * (p2.getY(k) > 0 ? 1 : 0)); pg.computeVertexNormals(); paint(pg, (c, x, y, z) => c.copy(lin(0xeee2c6)).multiplyScalar(0.92 + 0.08 * Math.abs(Math.sin(z * 200)))); pg.translate(B.x, B.y + 0.025, B.z + s2 * 0.072); soil.push(pg); }
    const rib = new THREE.BoxGeometry(0.005, 0.004, 0.14); paint(rib, c => c.copy(lin(0x9a1f1f))); rib.translate(B.x + 0.03, B.y + 0.037, B.z + 0.072); soil.push(rib);   // a ribbon marker
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
    carrotTop: [carrotTopGeo(rr), leafMat, 'carrot'], carrotRoot: [carrotRootGeo(), solidMat, 'carrot'],
    potato: [potatoPlantGeo(rr), leafMat, 'potato'], potatoFlower: [potatoFlowerGeo(rr), solidMat, 'potato'],
    pumpkinVine: [pumpkinVineGeo(rr), leafMat, 'pumpkin'], pumpkin: [pumpkinGeo(), solidMat, 'pumpkin'],
    onionLeaves: [onionLeavesGeo(rr), leafMat, 'onion'], onionBulb: [onionBulbGeo(), solidMat, 'onion'],
    lettuce: [lettuceGeo(rr), leafMat, 'lettuce'],
    beanPole: [beanPoleGeo(), solidMat, 'beans'], beanVine: [beanVineGeo(rr), leafMat, 'beans'], beanPods: [beanPodsGeo(rr), solidMat, 'beans'],
    strawberryLeaves: [strawberryLeavesGeo(rr), leafMat, 'strawberry'], strawberryFlower: [strawberryFlowerGeo(rr), solidMat, 'strawberry'], strawberryFruit: [strawberryFruitGeo(rr), solidMat, 'strawberry'],
  };
  // where each plant of each crop would stand in each plot (its offset and turn), fixed
  const L = G.bedL / G.per - 0.1;
  const layout = {
    carrot: j => [(j % 2 ? 0.17 : -0.17), (Math.floor(j / 2) - 1.5) * L / 4],
    potato: j => [rr(-0.06, 0.06), (j - 0.5) * L / 2],
    pumpkin: () => [rr(-0.08, 0.08), rr(-0.05, 0.05)],
    onion: j => [(j % 2 ? 0.16 : -0.16), (Math.floor(j / 2) - 1) * L / 3],
    lettuce: j => [rr(-0.05, 0.05), (j - 0.5) * L / 2],
    beans: j => [(j - 0.5) * 0.36, rr(-0.04, 0.04)],
    strawberry: j => [[-0.18, 0.18, 0][j], [-L / 4, -L / 4, L / 4][j]],
  };
  const spots = G.plots.map(pl => Object.fromEntries(Object.entries(PLANTS).map(([crop, n]) => [crop, Array.from({ length: n }, (_, j) => { const [ox, oz] = layout[crop](j); return { x: pl.x + ox + rr(-0.015, 0.015), z: pl.z + oz, yaw: rr(0, 6.28), s: rr(0.85, 1.12), fx: rr(-0.1, 0.1), fz: rr(0.08, 0.16) }; })])));
  const meshes = {}, slot = G.plots.map(() => ({}));   // part -> InstancedMesh; plot -> its first instance in each part
  for (const [name, [geo, mat, crop]] of Object.entries(parts)) {
    const n = G.plots.length * PLANTS[crop]; G.plots.forEach((_, i) => { slot[i][name] = i * PLANTS[crop]; });
    const im = new THREE.InstancedMesh(geo, mat, n); im.count = n; im.castShadow = !/Flower|Fruit|Root|Bulb|Pods/.test(name); im.receiveShadow = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    for (let k = 0; k < n; k++) im.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
    im.userData.dynamic = true; im.userData.crop = crop; group.add(im); meshes[name] = im;
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new V(), P = new V(), E = new THREE.Euler(), zero = new THREE.Matrix4().makeScale(0, 0, 0), C = new THREE.Color();
  const shown = Object.fromEntries(Object.entries(meshes).map(([k, im]) => [k, new Array(im.count).fill(false)]));
  const green = lin(0x4f7a2a), orange = lin(0xd9731c), white = lin(0xf2eee6), red = lin(0xd42a34), pale = lin(0xd8e4b0), gold = lin(0xc98a4a);
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const was = G.plots.map(() => null);   // the crop each plot showed last
  /** Plot i shows crop at growth k (0 sown .. 1 ripe), or nothing (crop null). */
  function set(i, crop, k) {
    const pl = G.plots[i];
    const touched = new Set([crop, was[i]].filter(Boolean)); was[i] = crop;
    for (const [name, [, , pc]] of Object.entries(parts)) {
      if (!touched.has(pc)) continue;
      const im = meshes[name];
      spots[i][pc].forEach((sp, j) => {
        let s = 0, y = pl.y - 0.01, tint = null;
        if (crop === pc) {
          const grow = 0.08 + 0.92 * smooth(0, 1, k);
          if (/carrotTop|^potato$|pumpkinVine|onionLeaves|lettuce|beanVine|strawberryLeaves/.test(name)) s = grow * sp.s;
          else if (name === 'carrotRoot') { s = k >= 1 ? sp.s : 0; y -= 0.01; }
          else if (name === 'potatoFlower') s = k >= 1 ? sp.s : 0;
          else if (name === 'pumpkin') { s = k > 0.4 ? (0.3 + 0.7 * smooth(0.4, 1, k)) * sp.s : 0; tint = C.copy(green).lerp(orange, smooth(0.6, 1, k)); }
          else if (name === 'onionBulb') { s = k > 0.45 ? (0.3 + 0.7 * smooth(0.45, 1, k)) * sp.s : 0; tint = C.copy(pale).lerp(gold, smooth(0.7, 1, k)); }
          else if (name === 'beanPole') s = 1;
          else if (name === 'beanPods') s = k >= 0.9 ? smooth(0.9, 1, k) * sp.s : 0;
          else if (name === 'strawberryFlower') s = k > 0.5 && k < 0.85 ? sp.s : 0;
          else if (name === 'strawberryFruit') { s = k >= 0.8 ? sp.s * (0.6 + 0.4 * smooth(0.8, 1, k)) : 0; tint = C.copy(white).lerp(red, smooth(0.85, 1, k)); }
        }
        shown[name][slot[i][name] + j] = s > 0;
        if (s <= 0) { im.setMatrixAt(slot[i][name] + j, zero); return; }
        const ox = name === 'pumpkin' ? Math.cos(sp.yaw) * 0.16 : 0, oz = name === 'pumpkin' ? -Math.sin(sp.yaw) * 0.16 : 0;
        const tilt = /pumpkin$|beanPole|beanPods|onionBulb/.test(name) ? 0 : sp.fx * s;
        M.compose(P.set(sp.x + ox, y, sp.z + oz), Q.setFromEuler(E.set(tilt, name === 'beanPole' ? 0 : sp.yaw, 0)), S.setScalar(s));
        im.setMatrixAt(slot[i][name] + j, M); if (tint) im.setColorAt(slot[i][name] + j, tint);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.visible = shown[name].some(Boolean);   // nothing of it growing: not drawn at all
    }
  }
  Object.values(meshes).forEach(im => { im.visible = false; });
  return { group, set, plots: G.plots, target: i => new V(G.plots[i].x, G.plots[i].y + 0.08, G.plots[i].z), bookAt };
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

/** Onion: a tuft of hollow, upright leaves, ~30 cm. */
function onionLeavesGeo(rr) {
  const list = [];
  for (let l = 0; l < 6; l++) { const h = rr(0.2, 0.32), g = new THREE.CylinderGeometry(0.002, 0.006, h, 5, 3, true); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; p.setX(i, p.getX(i) + t * t * 0.04); } g.translate(0, h / 2, 0); g.rotateY(l / 6 * Math.PI * 2 + rr(-0.3, 0.3)); list.push(g); }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, 0x5a8a3a, x, y));
}
/** An onion's bulb at the soil (tinted per instance: pale green to gold). */
function onionBulbGeo() {
  const g = new THREE.SphereGeometry(0.03, 12, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y > 0 ? y * (1 + 0.6 * y / 0.03) : y * 0.8); }
  g.computeVertexNormals(); g.translate(0, 0.012, 0); return paint(g, (c, x, y, z) => c.setScalar(0.85 + 0.2 * Math.abs(Math.sin(Math.atan2(z, x) * 6))));
}
/** A lettuce: a rosette of frilly leaves, curling up into a round head. */
function lettuceGeo(rr) {
  const list = [];
  for (let l = 0; l < 14; l++) {
    const inner = l > 7, a = l * 2.4 + rr(-0.2, 0.2), r = inner ? 0.05 : 0.09, g = new THREE.CircleGeometry(inner ? 0.06 : 0.08, 12), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), rr2 = Math.hypot(x, y); p.setZ(i, 0.012 * Math.sin(Math.atan2(y, x) * 9) * rr2 / 0.08); }   // frilled edge
    g.rotateX(-Math.PI / 2 + (inner ? 1.1 : 0.5)); g.translate(0, (inner ? 0.07 : 0.04), r * 0.4); g.rotateY(a); list.push(g);
  }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, y > 0.06 ? 0x9cc25a : 0x6fa040, x, y));
}
/** A bean pole: a cane pushed into the soil, 60 cm. */
function beanPoleGeo() { const g = new THREE.CylinderGeometry(0.008, 0.01, 0.62, 5, 1); g.translate(0, 0.29, 0); return paint(g, c => c.copy(lin(0x8a6a44))); }
/** The bean vine: heart-shaped leaves spiralling up the pole. */
function beanVineGeo(rr) {
  const list = [];
  for (let l = 0; l < 14; l++) { const t = l / 14, a = t * 9 + rr(-0.3, 0.3), g = new THREE.CircleGeometry(0.035, 7); g.scale(1, 0.85, 1); g.rotateX(-Math.PI / 2 + rr(0.4, 1.0)); g.translate(Math.cos(a) * 0.04, 0.06 + t * 0.52, Math.sin(a) * 0.04); list.push(g); }
  const stem = new THREE.TorusGeometry(0.018, 0.002, 3, 40, Math.PI * 9); stem.rotateX(Math.PI / 2); const p = stem.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.05 + (Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (Math.PI * 2) * 0.03 + i / p.count * 0.5); list.push(stem);
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, 0x4f8a34, x, y));
}
/** Bean pods hanging from the vine. */
function beanPodsGeo(rr) {
  const list = [];
  for (let k = 0; k < 7; k++) { const g = new THREE.CylinderGeometry(0.004, 0.006, 0.1, 5, 2); g.rotateZ(rr(-0.25, 0.25)); const a = rr(0, 6.28); g.translate(Math.cos(a) * 0.05, rr(0.15, 0.5), Math.sin(a) * 0.05); list.push(g); }
  return paint(mergeGeos(list, ['position', 'normal']), c => c.copy(lin(0x6aa640)));
}
/** A strawberry plant: low three-lobed leaves on thin stalks. */
function strawberryLeavesGeo(rr) {
  const list = [];
  for (let l = 0; l < 6; l++) {
    const a = l / 6 * Math.PI * 2 + rr(-0.3, 0.3), h = rr(0.07, 0.12);
    const st = new THREE.CylinderGeometry(0.002, 0.003, h, 3, 1); st.translate(0, h / 2, 0); st.rotateZ(0.5); st.rotateY(a); list.push(st);
    for (let k = -1; k <= 1; k++) { const lf = new THREE.CircleGeometry(0.022, 7); lf.scale(0.7, 1, 1); lf.translate(0, 0.02, 0); lf.rotateZ(k * 0.7); lf.rotateX(-Math.PI / 2 + 0.3); lf.translate(Math.sin(0.5) * h, h, 0); lf.rotateY(a); list.push(lf); }
  }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => leafCol(c, 0x3f7a2c, x, y));
}
/** White strawberry flowers. */
function strawberryFlowerGeo(rr) {
  const list = [];
  for (let f = 0; f < 3; f++) { const a = rr(0, 6.28), r = rr(0.04, 0.08); for (let p = 0; p < 5; p++) { const g = new THREE.CircleGeometry(0.008, 5); g.translate(0, 0.009, 0); g.rotateZ(p / 5 * Math.PI * 2); g.rotateX(-Math.PI / 2 + 0.3); g.translate(Math.cos(a) * r, 0.08, Math.sin(a) * r); list.push(g); } }
  return paint(mergeGeos(list, ['position', 'normal']), c => c.copy(lin(0xf2eee6)));
}
/** Strawberries hanging near the soil (tinted per instance: white to red). */
function strawberryFruitGeo(rr) {
  const list = [];
  for (let f = 0; f < 5; f++) { const g = new THREE.ConeGeometry(0.014, 0.028, 8); g.rotateX(Math.PI); const a = rr(0, 6.28), r = rr(0.05, 0.1); g.translate(Math.cos(a) * r, 0.03, Math.sin(a) * r); list.push(g); }
  return paint(mergeGeos(list, ['position', 'normal']), (c, x, y) => c.setScalar(0.85 + 0.15 * Math.sin(x * 300 + y * 200)));
}

/* ---- the produce in the hand and on the roasting stick (app/items.js) ---- */
const PRODUCE = {
  carrot: () => { const g = new THREE.ConeGeometry(0.018, 0.14, 12, 4); g.rotateX(Math.PI); g.translate(0, 0.07, 0); paint(g, (c, x, y) => c.copy(lin(0xe07a24)).multiplyScalar(0.8 + 0.25 * Math.abs(Math.sin(y * 90)))); const t = new THREE.CylinderGeometry(0.004, 0.006, 0.05, 5); t.translate(0, 0.165, 0); paint(t, c => c.copy(lin(0x4e8a2c))); return mergeGeos([g, t], ['position', 'normal', 'color']); },
  potato: () => { const g = new THREE.SphereGeometry(0.035, 14, 10), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.08 * Math.sin(p.getX(i) * 90) * Math.cos(p.getZ(i) * 70); p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.85, p.getZ(i) * k); } g.computeVertexNormals(); return paint(g, (c, x, y, z) => c.copy(lin(0xb58a55)).multiplyScalar(Math.sin(x * 140 + z * 90) > 0.93 ? 0.6 : 0.9 + 0.1 * Math.sin(y * 60))); },
  onion: () => { const g = onionBulbGeo(); g.scale(1.1, 1.1, 1.1); const c = g.attributes.color, o = lin(0xc98a4a); for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * o.r, c.getY(i) * o.g, c.getZ(i) * o.b); return g; },
  lettuce: () => { const g = lettuceGeo(() => 0.5); g.scale(0.7, 0.7, 0.7); return g; },
  beans: () => { const g = new THREE.CylinderGeometry(0.005, 0.007, 0.1, 6, 2); g.rotateZ(Math.PI / 2); return paint(g, c => c.copy(lin(0x6aa640))); },
  strawberry: () => { const g = new THREE.ConeGeometry(0.016, 0.032, 10); g.rotateX(Math.PI); return paint(g, c => c.copy(lin(0xd42a34))); },
  pumpkin: () => { const g = pumpkinGeo(); g.scale(0.75, 0.75, 0.75); g.translate(0, -0.05, 0); const c = g.attributes.color, o = lin(0xd9731c); for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * o.r, c.getY(i) * o.g, c.getZ(i) * o.b); return g; },
};
const COOKED = { bakedPotato: ['potato', 0x8a5a2e], roastedPumpkin: ['pumpkin', 0xa8501a], seedPotato: ['potato', 0xd8c8b0], roastedOnion: ['onion', 0x8a5a3a], onionSets: ['onion', 0xe8dcc0] };
export const PRODUCE_KINDS = { carrot: 1, potato: 1, pumpkin: 1, bakedPotato: 1, roastedPumpkin: 1, seedPotato: 1, onion: 1, roastedOnion: 1, onionSets: 1, lettuce: 1, beans: 1, strawberry: 1 };
export function produceModel(kind) {
  const [raw, col] = COOKED[kind] || [kind, 0xffffff];
  return { geo: PRODUCE[raw](), mat: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(col).convertSRGBToLinear(), roughness: 0.6, metalness: 0 }) };
}
