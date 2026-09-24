import * as THREE from 'three';
import { V, clamp, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { JETTY, SEA_Y } from '../../world/layout.js';

/**
 * The little sailboat moored at the jetty (sailing it: app/boating.js). Built in its own frame: +x to the bow, y up from
 * the waterline, +z to port. A lofted white hull with a burgundy sheer stripe and a red boot stripe, a teak deck and
 * cockpit with benches, a small white cabin top, mast and boom, a white mainsail with a burgundy band and a red jib, and a
 * varnished wooden ship's wheel on a pedestal at the helm (it turns with the rudder). Mooring lines run to the jetty's
 * bollards while it lies at its berth. setPose places it; the helm, step-in and cleat points are in BOAT_LOOK.
 * Its own random numbers. Every number is in BOAT_LOOK.
 */
export const BOAT_LOOK = {
  length: 4.6, beam: 1.9, sheer: [0.55, 0.7], bottom: -0.38, draft: 0.62,   // m; sheer at the stern and the bow; draft with the keel
  cockpit: { x0: -2.05, x1: 0.35, halfW: 0.6, floor: 0.24 },
  cabin: { x0: 0.35, x1: 1.35, halfW: 0.52, height: 0.3 },
  mast: { x: 0.9, height: 5.3 }, boom: { y: 1.25, x1: -1.75 },
  wheel: { x: -1.42, y: 1.0, r: 0.34 },
  helm: new V(-1.95, 0.24 + 1.5, 0),        // eye of the helmsman, standing behind the wheel
  colors: { hull: 0xf4f2ec, stripe: 0x6e1423, boot: 0xb3202a, bottom: 0x7a1c22, teak: 0xa2764a, trim: 0xe8e4da, mast: 0xd8dadc, main: 0xf3efe6, band: 0x6e1423, jib: 0xc0242c, wood: 0x7a4a22 },
};

export function createSailboat(ctx) {
  const { scene, maxAniso } = ctx, BL = BOAT_LOOK, C = BL.colors;
  let seed = 3777; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group(); group.rotation.order = 'YXZ'; scene.add(group);
  const L = BL.length / 2, sheer = x => BL.sheer[0] + (BL.sheer[1] - BL.sheer[0]) * clamp((x + L) / BL.length) ** 2;
  const halfBeam = x => { const u = (x + L) / BL.length; return BL.beam / 2 * (u < 0.55 ? 0.8 + 0.2 * Math.sin(u / 0.55 * Math.PI / 2) : Math.cos((u - 0.55) / 0.45 * Math.PI / 2) ** 0.85); };
  const keelY = x => { const u = (x + L) / BL.length; return BL.bottom * (u < 0.7 ? 1 : 1 - 0.75 * ((u - 0.7) / 0.3) ** 1.5) + 0.05 * (1 - u); };

  /* ---- hull: stations along x, a rounded section at each, both sides; coloured by height ---- */
  const NS = 26, NP = 9, pos = [], col = [], idx = [];
  // hull paint: a vertical strip of bands, mapped by the height relative to the sheer so the stripes follow it
  const V0 = -0.5, V1 = 0.8, paint = canvasTex(4, 512, (g, w, h) => {
    const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, h - (y1 - V0) / (V1 - V0) * h, w, (y1 - y0) / (V1 - V0) * h); };
    const hex = n => '#' + n.toString(16).padStart(6, '0');
    band(V0, V1, hex(C.hull)); band(V0, -0.01, hex(C.bottom)); band(-0.01, 0.075, hex(C.boot)); band(sheer(0) - 0.14, sheer(0) - 0.05, hex(C.stripe));
  });
  for (let i = 0; i <= NS; i++) {
    const x = -L + BL.length * i / NS, b = Math.max(halfBeam(x), 0.004), ys = sheer(x), yb = keelY(x);
    for (const side of [1, -1]) for (let j = 0; j <= NP; j++) {
      const t = j / NP, z = side * b * Math.cos(t * Math.PI / 2) ** 0.55, y = ys - (ys - yb) * Math.sin(t * Math.PI / 2) ** 1.4;
      pos.push(x, y, z); col.push(x / BL.length + 0.5, clamp((y - (sheer(x) - sheer(0)) - V0) / (V1 - V0)));
    }
  }
  const row = 2 * (NP + 1);
  for (let i = 0; i < NS; i++) for (let s = 0; s < 2; s++) for (let j = 0; j < NP; j++) {
    const a = i * row + s * (NP + 1) + j, b = a + row;
    if (s === 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // the transom: a flat stern closing the sections at station 0
  for (let j = 0; j < NP; j++) { const a = j, b = NP + 1 + j; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setAttribute('uv', new THREE.Float32BufferAttribute(col, 2));
  hull.setIndex(idx); hull.computeVertexNormals();
  const hullMat = new THREE.MeshStandardMaterial({ map: paint, roughness: 0.35, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const hullMesh = new THREE.Mesh(hull, hullMat); group.add(hullMesh);

  /* ---- deck (teak), with the cockpit well cut out; cockpit floor, benches and coamings; cabin top ---- */
  const teakTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a0744a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(${120 + rnd() * 40 | 0},${80 + rnd() * 30 | 0},${45 + rnd() * 20 | 0},.5)`; g.fillRect(0, y, w, 14); g.fillStyle = 'rgba(30,22,14,.85)'; g.fillRect(0, y + 14, w, 2); }
    for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(60,38,20,${rnd() * 0.25})`; g.lineWidth = 1; const y = rnd() * h, x = rnd() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + rnd() * 60, y + rr(-1, 1)); g.stroke(); }
  });
  teakTex.wrapS = teakTex.wrapT = THREE.RepeatWrapping; teakTex.anisotropy = maxAniso;
  const outline = new THREE.Shape(), CP = BL.cockpit;
  for (let i = 0; i <= NS; i++) { const x = -L + BL.length * i / NS; outline[i ? 'lineTo' : 'moveTo'](x, halfBeam(x) - 0.01); }
  for (let i = NS; i >= 0; i--) { const x = -L + BL.length * i / NS; outline.lineTo(x, -(halfBeam(x) - 0.01)); }
  const well = new THREE.Path(); well.moveTo(CP.x0, -CP.halfW); well.lineTo(CP.x1, -CP.halfW); well.lineTo(CP.x1, CP.halfW); well.lineTo(CP.x0, CP.halfW); well.lineTo(CP.x0, -CP.halfW); outline.holes.push(well);
  const deck = new THREE.ShapeGeometry(outline, 1); deck.rotateX(Math.PI / 2);
  { const p = deck.attributes.position, uv = deck.attributes.uv; for (let k = 0; k < p.count; k++) { p.setY(k, sheer(p.getX(k)) - 0.012); uv.setXY(k, p.getX(k) * 0.5, p.getZ(k) * 0.5); } deck.computeVertexNormals(); }
  const teakMat = new THREE.MeshStandardMaterial({ map: teakTex, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  const parts = [deck];
  const floor = new THREE.PlaneGeometry(CP.x1 - CP.x0, 2 * CP.halfW); floor.rotateX(-Math.PI / 2); floor.translate((CP.x0 + CP.x1) / 2, CP.floor, 0);
  { const uv = floor.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (CP.x1 - CP.x0) * 0.5, uv.getY(k) * CP.halfW); }
  parts.push(floor);
  for (const s of [-1, 1]) { const bench = new THREE.BoxGeometry(CP.x1 - CP.x0 - 0.5, 0.05, 0.34); bench.translate((CP.x0 + CP.x1) / 2 + 0.1, CP.floor + 0.2, s * (CP.halfW - 0.17)); parts.push(bench.toNonIndexed()); }
  const teakMesh = new THREE.Mesh(mergeGeos(parts.map(g => g.index ? g.toNonIndexed() : g), ['position', 'normal', 'uv']), teakMat); group.add(teakMesh);
  const trim = [], trimMat = new THREE.MeshStandardMaterial({ color: lin(C.trim), roughness: 0.4, metalness: 0 });
  const wallTo = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), y0 = CP.floor, y1 = sheer((x0 + x1) / 2) + 0.06, g = new THREE.BoxGeometry(len, y1 - y0, 0.03); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); trim.push(g.toNonIndexed()); };
  wallTo(CP.x0, -CP.halfW, CP.x1, -CP.halfW); wallTo(CP.x0, CP.halfW, CP.x1, CP.halfW); wallTo(CP.x0, -CP.halfW, CP.x0, CP.halfW);
  { const K = BL.cabin, g = new THREE.BoxGeometry(K.x1 - K.x0, K.height + 0.2, 2 * K.halfW); g.translate((K.x0 + K.x1) / 2, sheer(K.x0) + K.height / 2 - 0.1, 0); trim.push(g.toNonIndexed()); }   // cabin top
  { const g = new THREE.TorusGeometry(0.35, 0.02, 5, 14, Math.PI); g.rotateY(Math.PI / 2); g.translate(-L + 0.05, sheer(-L) + 0.02, 0); trim.push(g.toNonIndexed()); }   // stern rail
  const trimMesh = new THREE.Mesh(mergeGeos(trim, ['position', 'normal']), trimMat); group.add(trimMesh);
  { const win = [], K = BL.cabin; for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.5, 0.07, 0.01); g.translate((K.x0 + K.x1) / 2, sheer(K.x0) + K.height * 0.6, s * (K.halfW + 0.003)); win.push(g.toNonIndexed()); }
    group.add(new THREE.Mesh(mergeGeos(win, ['position', 'normal']), new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.15, metalness: 0.3 }))); }

  /* ---- rig: mast, boom, stays; sails ---- */
  const rod = (a, b, r0, r1 = r0, radial = 8) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r1, r0, d.length(), radial, 1); g.translate(0, d.length() / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.normalize()))); g.translate(a.x, a.y, a.z); return g.toNonIndexed(); };
  const M = BL.mast, B = BL.boom, deckAt = x => sheer(x) + (x > BL.cabin.x0 && x < BL.cabin.x1 ? BL.cabin.height : 0);
  const mastTop = new V(M.x, M.height, 0), bow = new V(L - 0.08, sheer(L) + 0.02, 0), stern = new V(-L + 0.15, sheer(-L), 0);
  const rig = [rod(new V(M.x, deckAt(M.x) - 0.2, 0), mastTop, 0.05, 0.035), rod(new V(M.x, B.y, 0), new V(B.x1, B.y + 0.05, 0), 0.035, 0.03)];
  const stays = [rod(mastTop, bow, 0.006), rod(mastTop, stern, 0.006), rod(new V(M.x, M.height * 0.8, 0), new V(M.x - 0.1, sheer(M.x), halfBeam(M.x) - 0.05), 0.005), rod(new V(M.x, M.height * 0.8, 0), new V(M.x - 0.1, sheer(M.x), -(halfBeam(M.x) - 0.05)), 0.005)];
  group.add(new THREE.Mesh(mergeGeos(rig, ['position', 'normal']), new THREE.MeshStandardMaterial({ color: lin(C.mast), roughness: 0.3, metalness: 0.6 })));
  group.add(new THREE.Mesh(mergeGeos(stays, ['position', 'normal']), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 })));
  /** A cambered triangular sail through a (luff foot), b (head), c (clew); coloured by colFn(u along the luff, v across). */
  function sail(a, b, cc, camber, colFn) {
    const n = 10, pts = [], cols = [], ind = [], k = new THREE.Color();
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, p = a.clone().lerp(b, u).lerp(cc.clone().lerp(b, u), n - i ? v * n / (n - i) : 0);
      p.z += camber * Math.sin(Math.PI * (n - i ? j / (n - i) : 0)) * (1 - u * 0.7);
      pts.push(p.x, p.y, p.z); k.set(colFn(u, v, p)).convertSRGBToLinear(); cols.push(k.r, k.g, k.b);
    }
    let o = 0; const rowStart = []; for (let i = 0; i <= n; i++) { rowStart.push(o); o += n - i + 1; }
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) { const a0 = rowStart[i] + j, b0 = rowStart[i + 1] + j; ind.push(a0, a0 + 1, b0); if (j < n - i - 1) ind.push(a0 + 1, b0 + 1, b0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(ind); g.computeVertexNormals(); return g;
  }
  const sailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const main = sail(new V(M.x - 0.05, B.y + 0.04, 0), new V(M.x - 0.05, M.height - 0.25, 0), new V(B.x1 + 0.05, B.y + 0.08, 0), 0.14, (u, v, p) => p.y > 2.25 && p.y < 2.55 ? C.band : C.main);
  const jib = sail(new V(L - 0.12, sheer(L) + 0.08, 0), new V(M.x + 0.06, M.height * 0.78, 0), new V(M.x + 0.15, 0.95, -0.35), -0.1, () => C.jib);
  const sails = new THREE.Mesh(mergeGeos([main.toNonIndexed(), jib.toNonIndexed()], ['position', 'normal', 'color']), sailMat); group.add(sails);

  /* ---- the ship's wheel: pedestal, rim, eight spokes with handles, hub ---- */
  const W = BL.wheel, wheelMat = new THREE.MeshStandardMaterial({ color: lin(C.wood), roughness: 0.35, metalness: 0, envMapIntensity: 0.7 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, W.y - CP.floor, 10).translate(W.x + 0.05, (W.y + CP.floor) / 2, 0), new THREE.MeshStandardMaterial({ color: 0x3a3230, roughness: 0.5, metalness: 0.4 }));
  group.add(pedestal);
  const wheel = new THREE.Group(); wheel.position.set(W.x, W.y, 0); group.add(wheel);
  { const g = [], rim = new THREE.TorusGeometry(W.r, 0.022, 7, 36); rim.rotateY(Math.PI / 2); g.push(rim.toNonIndexed());
    const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12); hub.rotateZ(Math.PI / 2); g.push(hub.toNonIndexed());
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, d = new V(0, Math.cos(a), Math.sin(a)); g.push(rod(d.clone().multiplyScalar(0.05), d.clone().multiplyScalar(W.r + 0.02), 0.013, 0.011, 6)); g.push(rod(d.clone().multiplyScalar(W.r + 0.02), d.clone().multiplyScalar(W.r + 0.13), 0.02, 0.013, 7)); }
    wheel.add(new THREE.Mesh(mergeGeos(g, ['position', 'normal']), wheelMat)); }

  /* ---- mooring lines to the jetty's bollards, shown while it lies at its berth ---- */
  const cleats = [new V(L - 0.35, sheer(L - 0.35) + 0.02, 0.62), new V(-L + 0.3, sheer(-L + 0.3) + 0.02, 0.7)];
  const lineMat = new THREE.MeshStandardMaterial({ color: lin(0xd9cfb4), roughness: 0.9, metalness: 0 });
  const lines = new THREE.Group(); scene.add(lines);
  function mooringLines(on) {
    lines.visible = on; if (!on) return;
    lines.clear(); group.updateMatrixWorld();
    const [aft, fore] = JETTY.bollards.map(([x, z]) => new V(x, JETTY.deckY + 0.42, z)), ends = [[cleats[0], fore], [cleats[1], aft]];   // bow to the fore bollard, stern to the aft one
    for (const [cl, bo] of ends) {
      const a = cl.clone().applyMatrix4(group.matrixWorld), pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10, p = a.clone().lerp(bo, t); p.y -= Math.sin(Math.PI * t) * 0.18; pts.push(p); }
      lines.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 5), lineMat));
    }
  }

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  /** Place the boat: centre (x, z) at the waterline, heading h (the bow points along (cos h, sin h) in x, z), roll, pitch, bob. */
  function setPose(x, z, heading, roll = 0, pitch = 0, bob = 0) { group.position.set(x, SEA_Y + bob, z); group.rotation.set(roll, -heading, pitch); }
  setPose(JETTY.berth.x, JETTY.berth.z, JETTY.berth.heading);
  mooringLines(true);
  return { group, wheel, setPose, mooringLines, sheer, halfBeam, keelY, helm: BL.helm };
}
