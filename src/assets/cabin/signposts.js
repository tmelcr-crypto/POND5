import * as THREE from 'three';
import { V } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { SIGNS, H } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The signposts at the forks of the paths (#19; sites and boards: SIGNS in world/layout.js): a weathered round post
 * with a little pointed cap and a few stones at its foot, and an arrow board for each place, nailed to the post's side
 * and pointing along the path to it, the name and the distance burnt into both faces (readable from either side).
 * Everything is one mesh with one texture (every board's lettering, and strips of grain, stone and iron): one draw call
 * for all the signs, plus its shadow. Snow settles on the boards and caps in winter (world/seasonLooks.js 'roof').
 * Each post is a solid obstacle. Its own random numbers. Sizes in SIGN_LOOK.
 */
export const SIGN_LOOK = {
  post: { r: 0.055, top: 1.62, sink: 0.25, cap: [0.078, 0.07] },
  board: { len: 0.64, back: 0.08, h: 0.12, t: 0.024, tip: 0.07, top: 1.46, step: 0.15 },   // back: how far it reaches behind the post's centre
  ink: '#2b1a0f', wood: ['#8c7a62', '#7e6c55', '#95836a'],
  collider: { r: 0.12, top: 1.9 },
};

export function createSignposts(ctx) {
  const { scene, maxAniso } = ctx, SL = SIGN_LOOK, P = SL.post, B = SL.board;
  let seed = 5150; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();

  /* ---- the texture: a row per board (its lettering on weathered wood), then grain, stone and iron strips ---- */
  const boards = SIGNS.flatMap(S => S.boards), W = 512, ROW = 96, GRAIN = 64, STONE = 32, IRON = 32, HT = ROW * boards.length + GRAIN + STONE + IRON;
  const vOf = y => 1 - y / HT;   // canvas y to texture v (the canvas is flipped when uploaded)
  const grainY = ROW * boards.length, stoneY = grainY + GRAIN, ironY = stoneY + STONE;
  const tex = canvasTex(W, HT, (g) => {
    const streaks = (x0, y0, w, h, n, dark) => {
      for (let i = 0; i < n; i++) {
        const y = y0 + rnd() * h, x = x0 + rnd() * w, len = 30 + rnd() * 200;
        g.strokeStyle = rnd() < 0.6 ? `rgba(${dark},${0.08 + rnd() * 0.22})` : `rgba(225,210,185,${0.05 + rnd() * 0.15})`;
        g.lineWidth = 0.6 + rnd() * 1.4; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.33, y + rr(-1.5, 1.5), x + len * 0.66, y + rr(-1.5, 1.5), x + len, y + rr(-1, 1)); g.stroke();
      }
    };
    boards.forEach((b, i) => {
      const y0 = i * ROW;
      g.fillStyle = SL.wood[i % SL.wood.length]; g.fillRect(0, y0, W, ROW);
      g.save(); g.beginPath(); g.rect(0, y0, W, ROW); g.clip();
      streaks(-100, y0, W + 100, ROW, 90, '55,40,28');
      for (let k = 0; k < 2; k++) { const x = rr(0.25, 0.75) * W, y = y0 + rr(0.2, 0.8) * ROW, gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, 'rgba(60,40,25,.55)'); gr.addColorStop(1, 'rgba(60,40,25,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 9, 4, 0, 0, 6.28); g.fill(); }
      // the lettering, burnt in: a soft scorch under crisp dark letters, centred between the square end and the tip
      const lo = B.tip / B.len * W + 10, hi = W - lo, name = b.text, dist = b.metres + ' m';
      let fs = 44; const fit = () => { g.font = `600 ${fs}px Georgia, "Times New Roman", serif`; const a = g.measureText(name).width; g.font = `600 ${fs * 0.68}px Georgia, "Times New Roman", serif`; return a + fs * 0.6 + g.measureText(dist).width; };
      while (fit() > hi - lo && fs > 24) fs -= 2;
      const total = fit(), x = (lo + hi) / 2 - total / 2, y = y0 + ROW / 2 + fs * 0.34;
      g.font = `600 ${fs}px Georgia, "Times New Roman", serif`; const nw = g.measureText(name).width;
      for (const pass of [0, 1]) {
        g.fillStyle = pass ? SL.ink : 'rgba(70,40,20,0.45)'; g.shadowColor = 'rgba(60,32,14,0.6)'; g.shadowBlur = pass ? 1.5 : 5;
        g.font = `600 ${fs}px Georgia, "Times New Roman", serif`; g.fillText(name, x, y);
        g.font = `600 ${fs * 0.68}px Georgia, "Times New Roman", serif`; g.fillText(dist, x + nw + fs * 0.6, y);
      }
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(45,30,18,0.35)'; g.lineWidth = 2; g.strokeRect(6, y0 + 7, W - 12, ROW - 14);   // a routed groove round the edge
      g.restore();
    });
    g.fillStyle = '#766650'; g.fillRect(0, grainY, W, GRAIN); streaks(-100, grainY, W + 100, GRAIN, 120, '50,36,24');
    g.fillStyle = '#5d5a53'; g.fillRect(0, stoneY, W, STONE);
    for (let i = 0; i < 500; i++) { const c = 60 + rnd() * 50 | 0; g.fillStyle = rnd() < 0.15 ? 'rgba(88,104,60,0.5)' : `rgba(${c},${c - 3},${c - 8},0.55)`; g.fillRect(rnd() * W, stoneY + rnd() * STONE, 2 + rnd() * 5, 2 + rnd() * 4); }
    g.fillStyle = '#2c2825'; g.fillRect(0, ironY, W, IRON);
  });
  tex.anisotropy = maxAniso;

  /* ---- the pieces, each with its uv set into the texture ---- */
  const strip = (g, y0, h, along = 'x', k = 1) => {   // uv into a strip: u along an axis, v across the strip
    const p = g.attributes.position, uv = new Float32Array(p.count * 2), off = rnd();
    for (let i = 0; i < p.count; i++) { const a = along === 'y' ? p.getY(i) : p.getX(i), b = along === 'y' ? Math.atan2(p.getZ(i), p.getX(i)) / 6.283 + 0.5 : (p.getY(i) + p.getZ(i)) * 4; uv[i * 2] = a * k + off; uv[i * 2 + 1] = vOf(y0 + h * (0.1 + 0.8 * (((b % 1) + 1) % 1))); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
  };
  const shape = new THREE.Shape(), e = 0.003, x0 = -B.back + e, x1 = B.len - B.back - e, hh = B.h / 2 - e;
  shape.moveTo(x0, -hh); shape.lineTo(x1 - B.tip, -hh); shape.lineTo(x1, 0); shape.lineTo(x1 - B.tip, hh); shape.lineTo(x0, hh); shape.lineTo(x0, -hh);
  const boardGeo = row => {   // an arrow board along +x, faces towards ±z, the lettering of texture row `row` on both
    const g = new THREE.ExtrudeGeometry(shape, { depth: B.t, bevelEnabled: true, bevelThickness: e, bevelSize: e, bevelSegments: 1, curveSegments: 1, steps: 1 });
    g.translate(0, 0, -B.t / 2); const q = g.index ? g.toNonIndexed() : g;
    const p = q.attributes.position, n = q.attributes.normal, uv = new Float32Array(p.count * 2), lo = -B.back, L = B.len;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), nz = n.getZ(i), u = (x - lo) / L, v = (y + B.h / 2) / B.h;
      if (Math.abs(nz) > 0.9) { uv[i * 2] = nz > 0 ? u : 1 - u; uv[i * 2 + 1] = vOf(row * ROW + (1 - v) * ROW); }
      else { uv[i * 2] = u * 0.6; uv[i * 2 + 1] = vOf(grainY + GRAIN * (0.2 + 0.6 * v)); }
    }
    q.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return q;
  };
  const rock = (s) => {
    const g = new THREE.SphereGeometry(1, 10, 7), p = g.attributes.position, ph = rnd() * 6.28;   // smooth, lumpy, flattened
    for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.18 * Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3 + ph) * Math.cos(p.getY(i) * 2.7 - ph); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.55, p.getZ(i) * k); }
    g.scale(s, s, s); g.computeVertexNormals(); return strip(g, stoneY, STONE, 'x', 3);
  };
  const place = (g, pos, basis) => { const m = new THREE.Matrix4(); if (basis) m.makeBasis(...basis); m.setPosition(pos); g.applyMatrix4(m); return g; };

  const parts = [];
  let row = 0;
  for (const S of SIGNS) {
    const y = S.y, lean = [rr(-0.004, 0.004), rr(-0.004, 0.004)];   // barely: the boards are nailed on straight
    const post = new THREE.CylinderGeometry(P.r * 0.95, P.r * 1.05, P.top + P.sink, 12, 3); post.translate(0, (P.top - P.sink) / 2, 0);
    const cap = new THREE.ConeGeometry(P.cap[0], P.cap[1], 12, 1); cap.translate(0, P.top + P.cap[1] / 2, 0);
    const rim = new THREE.CylinderGeometry(P.cap[0], P.cap[0], 0.012, 12, 1); rim.translate(0, P.top + 0.006 - 0.012, 0);
    const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(lean[0], rr(0, 6.28), lean[1]));
    for (const g of [strip(post, grainY, GRAIN, 'y', 0.6), strip(cap, grainY, GRAIN, 'y', 0.6), strip(rim, grainY, GRAIN, 'y', 0.6)]) { g.applyMatrix4(tilt); parts.push(place(g, new V(S.x, y, S.z))); }
    S.boards.forEach((b, i) => {
      const dx = Math.cos(b.angle), dz = Math.sin(b.angle), side = i % 2 ? 1 : -1, off = P.r + B.t / 2 + 0.004;
      const X = new V(dx, 0, dz), Y = new V(0, 1, 0), Z = new V(-dz, 0, dx);   // along the board, up, out of its front face
      const g = boardGeo(row++); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rr(-0.03, 0.03), 0, rr(-0.02, 0.02))));
      const c = new V(S.x, y + B.top - i * B.step, S.z).addScaledVector(Z, side * off);
      parts.push(place(g, c, [X, Y, Z]));
      for (const ny of [-0.028, 0.028]) {   // two nail heads on the outer face, over the post
        const nail = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 6, 1); nail.rotateX(Math.PI / 2); nail.translate(0, ny, side * (B.t / 2 + 0.002));
        parts.push(place(strip(nail, ironY, IRON), c, [X, Y, Z]));
      }
    });
    for (let k = 0; k < 5; k++) {   // stones at its foot
      const a = k / 5 * 6.28 + rr(-0.4, 0.4), d = rr(0.12, 0.2), sx = S.x + Math.cos(a) * d, sz = S.z + Math.sin(a) * d, s = rr(0.05, 0.085);
      const g = rock(s); g.rotateY(rr(0, 6.28)); parts.push(place(g, new V(sx, H(sx, sz) + s * 0.1, sz)));
    }
    obstacles.add(S.x, S.z, SL.collider.r, y + SL.collider.top);
  }
  const geo = mergeGeos(parts, ['position', 'normal', 'uv']); geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, userData: { season: 'roof' } });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'signposts';
  scene.add(mesh);
  return { mesh, signs: SIGNS };
}
