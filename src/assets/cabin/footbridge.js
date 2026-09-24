import * as THREE from 'three';
import { V, clamp, smooth, lin } from '../../core/math.js';
import { fbm3, vnoise3 } from '../../core/noise.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { BRIDGE, FOOTPATH, H } from '../../world/layout.js';

/**
 * The wooden footbridge over the stream and the stepping-stone paths: from the cabin to it, and on from it to the two
 * benches (positions: BRIDGE and FOOTPATH in world/layout.js). The bridge: two log stringers resting on flat stones on each bank, an arched deck of
 * weathered planks laid across them, posts and two rails each side. The path: flat, irregular sandstone slabs set almost
 * flush with the ground, the grass growing up to their edges. Planks, logs, and one stone mesh per route. Its own random
 * numbers, so the seeded build is unchanged. Every number is in FOOTBRIDGE_LOOK.
 */
export const FOOTBRIDGE_LOOK = {
  plank: { width: 0.13, gap: 0.022, thick: 0.035 },
  stringer: { r: 0.075, v: 0.36 },                 // log radius, offset from the centre line
  posts: { v: 0.54, size: 0.07, top: 0.9 },        // offset, square size, height above the deck
  rails: [{ y: 0.88, r: 0.032 }, { y: 0.46, r: 0.026 }],
  stone: { top: 0.015, thick: 0.1 },               // path stones: height above the ground, depth below their top
};

export function createFootbridge(ctx) {
  const { scene, maxAniso } = ctx, B = BRIDGE, L = FOOTBRIDGE_LOOK;
  let seed = 5150; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();

  /* ---- weathered wood: grain along the texture's v (the length of a plank or log) ---- */
  const woodTex = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#8c7a66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * w, y = rnd() * h, len = 40 + rnd() * 240;
      g.strokeStyle = rnd() < 0.55 ? `rgba(62,48,36,${0.1 + rnd() * 0.3})` : `rgba(200,188,170,${0.08 + rnd() * 0.22})`;
      g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-3, 3), y + len * 0.33, x + rr(-3, 3), y + len * 0.66, x + rr(-2, 2), y + len); g.stroke();
    }
    for (let i = 0; i < 10; i++) { const x = rnd() * w, y = rnd() * h; g.strokeStyle = 'rgba(35,26,18,.6)'; g.lineWidth = 1 + rnd() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-2, 2), y + 20 + rnd() * 90); g.stroke(); }   // cracks
    for (let i = 0; i < 4; i++) { const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * 5, gr = g.createRadialGradient(x, y, 0, x, y, r * 2.2); gr.addColorStop(0, 'rgba(50,34,20,.85)'); gr.addColorStop(1, 'rgba(50,34,20,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 2.2, 0, 0, 6.28); g.fill(); }   // knots
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.anisotropy = maxAniso;

  /* ---- the bridge, built in its own frame: u across the stream (x), v along it (z), y absolute; placed at the end ---- */
  const deck = u => B.deckY(clamp(u, -B.half, B.half)), slope = u => -2 * B.arch * clamp(u, -B.half, B.half) / (B.half * B.half);
  const tone = (g, t) => { const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = t.r; c[i + 1] = t.g; c[i + 2] = t.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const wood = (k, grey) => new THREE.Color(1, 1, 1).multiplyScalar(k).lerp(new THREE.Color(0.8, 0.82, 0.84), grey);

  // planks across the stringers, each a little different: length, twist, tone, where its grain starts
  const planks = [], P = L.plank, pitch = P.width + P.gap, n = Math.floor(2 * B.half / pitch);
  for (let i = 0; i < n; i++) {
    const u = -B.half + (i + 0.5) * (2 * B.half / n), len = B.width + rr(-0.05, 0.03);
    const g = new THREE.BoxGeometry(P.width * rr(0.92, 1.05), P.thick, len);
    const uv = g.attributes.uv, off = rnd(); for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.25 + off, uv.getY(k) * 0.6 + off * 3);
    g.applyMatrix4(new THREE.Matrix4().compose(new V(u, deck(u) - P.thick / 2 + rr(-0.004, 0.004), rr(-0.02, 0.02)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.02, 0.02), rr(-0.025, 0.025), Math.atan(slope(u)))), new V(1, 1, 1)));
    planks.push(tone(g, wood(rr(0.78, 1.08), rr(0, 0.35))));
  }
  // logs: stringers along the arch, posts, rails following the arch
  const logs = [];
  const bent = (r, u0, u1, yOf, v, radial = 8) => {   // a log along u whose centre follows yOf(u)
    const g = new THREE.CylinderGeometry(r, r * rr(1.0, 1.12), u1 - u0, radial, 16); g.rotateZ(-Math.PI / 2); g.translate((u0 + u1) / 2, 0, v);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + yOf(p.getX(k)));
    g.computeVertexNormals(); return g;
  };
  const S = L.stringer;
  for (const v of [-S.v, S.v]) logs.push(tone(bent(S.r, -B.half - 0.12, B.half + 0.12, u => deck(u) - P.thick - S.r + 0.004, v + rr(-0.02, 0.02)), wood(rr(0.7, 0.85), 0.1)));
  const PO = L.posts, postU = [-B.half + 0.12, 0, B.half - 0.12];
  for (const side of [-1, 1]) {
    for (const u of postU) {
      const y0 = deck(u) - P.thick - 2 * S.r, y1 = deck(u) + PO.top, g = new THREE.BoxGeometry(PO.size, y1 - y0, PO.size);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.2 + rnd() * 0.01, uv.getY(k) * (y1 - y0) * 0.9);
      g.applyMatrix4(new THREE.Matrix4().compose(new V(u, (y0 + y1) / 2, side * PO.v), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.03, 0.03), rr(-0.2, 0.2), rr(-0.03, 0.03))), new V(1, 1, 1)));
      logs.push(tone(g, wood(rr(0.75, 0.95), rr(0.1, 0.3))));
    }
    for (const R of L.rails) logs.push(tone(bent(R.r, postU[0] - 0.08, postU[2] + 0.08, u => deck(u) + R.y + (u - postU[0]) * rr(-0.004, 0.004), side * (PO.v + PO.size / 2 + R.r * 0.7), 7), wood(rr(0.8, 0.98), rr(0.15, 0.35))));
  }
  const place = new THREE.Matrix4().makeRotationY(Math.atan2(-B.az, B.ax)).setPosition(B.x, 0, B.z);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.4 });
  const plankMesh = new THREE.Mesh(mergeGeos(planks, ['position', 'normal', 'uv', 'color']).applyMatrix4(place), woodMat);
  const logMesh = new THREE.Mesh(mergeGeos(logs, ['position', 'normal', 'uv', 'color']).applyMatrix4(place), woodMat);

  /* ---- flat stones: the path, and one under each stringer end ---- */
  const ST = L.stone, stoneC = [lin(0x6f685e), lin(0x5c574f), lin(0x7d7466), lin(0x6a6a64)], mossC = lin(0x4f6a26), dirtC = lin(0x5a4c3c);
  function slab(x, z, r, sx, rot, sink) {
    const M = 18, rings = [[0, ST.top + 0.012], [0.55, ST.top + 0.008], [0.9, ST.top - 0.002], [1.0, ST.top - 0.022], [1.05, ST.top - ST.thick]];
    const ph = rr(0, 6.28), ph2 = rr(0, 6.28), rad = Array.from({ length: M }, (_, k) => 1 + 0.16 * Math.sin(k / M * 6.28 * 2 + ph) + 0.09 * Math.sin(k / M * 6.28 * 3 + ph2) + rr(-0.09, 0.06));
    // ground frame: the stone lies on the terrain's slope
    const e = Math.max(0.2, r), n = new V(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(), t1 = new V(1, 0, 0).addScaledVector(n, -n.x).normalize(), t2 = new V().crossVectors(t1, n);
    // lift it where the ground bulges above its plane under the rim, so no ground shows through its top
    let lift = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28, rx = Math.cos(a) * r * sx * 0.95, rz = Math.sin(a) * r * 0.95, p = new V(x, H(x, z), z).addScaledVector(t1, rx * Math.cos(rot) - rz * Math.sin(rot)).addScaledVector(t2, rx * Math.sin(rot) + rz * Math.cos(rot)); lift = Math.max(lift, H(p.x, p.z) - p.y); }
    const c = new V(x, H(x, z) + Math.min(lift, 0.08) - sink, z), cr = Math.cos(rot), sr = Math.sin(rot), pos = [];
    for (const [f, y] of rings) for (let k = 0; k < (f ? M : 1); k++) {
      const a = k / M * 6.28, lx = Math.cos(a) * r * f * rad[k] * sx, lz = Math.sin(a) * r * f * rad[k], ux = lx * cr - lz * sr, uz = lx * sr + lz * cr;
      const yy = y + (f && f < 1 ? 0.004 * vnoise3(ux * 20 + x, 0, uz * 20 + z) : 0);
      pos.push(c.clone().addScaledVector(t1, ux).addScaledVector(n, yy).addScaledVector(t2, uz));
    }
    const idx = [];
    for (let k = 0; k < M; k++) idx.push(0, 1 + (k + 1) % M, 1 + k);
    for (let ring = 0; ring < rings.length - 2; ring++) for (let k = 0; k < M; k++) {
      const a = 1 + ring * M + k, b = 1 + ring * M + (k + 1) % M; idx.push(a, b, a + M, b, b + M, a + M);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pos); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
    // paint: worn and paler on top, lichen and a little moss towards the rim, earthy where it meets the ground
    const p = g.attributes.position, nn = g.attributes.normal, col = new Float32Array(p.count * 3), cc = new THREE.Color(), base = stoneC[Math.floor(rnd() * stoneC.length)];
    for (let k = 0; k < p.count; k++) {
      const X = p.getX(k), Y = p.getY(k), Z = p.getZ(k), rim = k === 0 ? 0 : Math.floor((k - 1) / M) / 4, up = nn.getY(k);
      cc.copy(base).multiplyScalar(0.7 + 0.45 * clamp(fbm3(X * 7, Y * 7, Z * 7) + 0.5) + 0.06 * (1 - rim)).multiplyScalar(0.85 + 0.25 * vnoise3(X * 40, Y * 40, Z * 40));
      const mk = clamp(fbm3(X * 9 + 3, Y * 9, Z * 9) * 2.2 + rim * 1.3 - 0.9); cc.lerp(mossC, mk * 0.6 * up);
      cc.lerp(dirtC, (1 - smooth(-0.01, 0.02, Y - H(X, Z))) * 0.7);
      col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.toNonIndexed();
  }
  const slabs = Array.from({ length: FOOTPATH.routes }, () => []);   // one mesh per route, so each is culled on its own
  FOOTPATH.stones.forEach(s => slabs[s.route].push(slab(s.x, s.z, s.r, s.sx, s.rot, s.sink)));
  for (const end of [-1, 1]) for (const v of [-S.v, S.v]) {   // footing stones under the stringer ends
    const u = end * (B.half - 0.02), x = B.x + B.ax * u + B.az * v, z = B.z + B.az * u - B.ax * v;
    slabs[0].push(slab(x, z, rr(0.14, 0.18), rr(1.1, 1.4), rr(0, 6.28), -0.03));
  }
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.5 });
  const stoneMeshes = slabs.map(list => new THREE.Mesh(mergeGeos(list, ['position', 'normal', 'color']), stoneMat));

  for (const m of [plankMesh, logMesh, ...stoneMeshes]) { m.castShadow = m.receiveShadow = true; m.geometry.computeBoundingSphere(); scene.add(m); }
  return { planks: plankMesh, logs: logMesh, stones: stoneMeshes, stats: { planks: n, stones: FOOTPATH.stones.length } };
}
