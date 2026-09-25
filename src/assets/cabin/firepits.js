import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { U } from '../../core/uniforms.js';
import { FIREPITS, H } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';
import { makeFlame } from './cabin.js';

/**
 * The firepits (FIREPITS in world/layout.js): a ring of stones round a bed of ash with charred firewood, three cut logs
 * to sit on, and a small roofed woodpile. Everything that does not burn is one mesh per pit (bark / end-grain atlas and
 * vertex colours); the firewood is a second mesh whose embers glow. Burning (set(i, k, e) from app/fires.js, k 0..1 the
 * fire, e 0..1 how hot the embers still are): flames (the fireplace's), a glow, a warm pool on the ground, sparks and
 * smoke. No real lights. Its own random numbers, so the seeded build is unchanged. Every number is in FIREPIT_LOOK.
 */
export const FIREPIT_LOOK = {
  stones: 12, stoneSize: [0.12, 0.17],
  firewood: 5,
  pile: { front: 1.45, back: 1.12, rows: 4, perRow: 9, piece: [0.07, 0.09], length: 0.8 },
  pool: { size: 3.6, opacity: 0.55, color: [1.0, 0.55, 0.22] },
  glow: 1.3, sparks: 24, smoke: 5,
  collider: { top: 1.9 },
  near: 45,                        // m: flicker, sparks and smoke only animate this close
};

export function createFirepits(ctx) {
  const { scene, maxAniso } = ctx, F = FIREPIT_LOOK, { softDot } = ctx.tex;
  let seed = 7373; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();

  /* ---- one atlas: bark (u 0-0.45), end grain (u 0.5-0.95), plain white (u 0.97-1) ---- */
  const atlas = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#76624f'; g.fillRect(0, 0, 118, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,30,22' : '150,135,112'},${rr(0.06, 0.14)})`; g.fillRect(rnd() * 118, 0, rr(4, 14), h); }   // broad tone bands along the log
    for (let i = 0; i < 520; i++) {   // fissures: long, thin, a little wavy
      const x0 = rnd() * 118, y0 = rnd() * h, len = rr(30, 150), dark = rnd() < 0.75;
      g.strokeStyle = dark ? `rgba(30,22,15,${rr(0.3, 0.6)})` : `rgba(170,158,132,${rr(0.15, 0.3)})`; g.lineWidth = rr(0.6, 1.6);
      g.beginPath(); g.moveTo(x0, y0); for (let k = 1; k <= 4; k++) g.lineTo(x0 + rr(-1.5, 1.5), y0 + len * k / 4); g.stroke();
    }
    g.fillStyle = '#c9a676'; g.fillRect(128, 0, 118, h);
    const cx = 186, cy = 128;
    for (let r = 52; r > 2; r -= rr(3, 6)) { g.strokeStyle = `rgba(120,80,45,${rr(0.35, 0.7)})`; g.lineWidth = rr(0.8, 1.8); g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.stroke(); }
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.28; g.strokeStyle = 'rgba(60,38,20,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50); g.stroke(); }
    g.strokeStyle = '#4b3a2c'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 55, 0, 6.3); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(249, 0, 7, h);
  });
  atlas.anisotropy = maxAniso;
  const woodMat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.92, metalness: 0 });
  const crackTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(255,${120 + rnd() * 90 | 0},40,${rr(0.4, 1)})`; g.lineWidth = rr(0.6, 2); g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rr(-12, 12); y += rr(-6, 6); g.lineTo(x, y); } g.stroke(); }
  });
  const poolTex = canvasTex(128, 128, g => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.5)'); r.addColorStop(0.7, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });

  /* ---- geometry helpers: every piece non-indexed with position, normal, uv, color ---- */
  const prep = (g, col, uv) => {
    g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
    const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (uv) { const a = g.attributes.uv; for (let i = 0; i < n; i++) { const [u, v] = uv(a.getX(i), a.getY(i)); a.setXY(i, u, v); } }
    return g;
  };
  const BARK = (u, v) => [u * 0.45, v], GRAIN = (u, v) => [0.5 + u * 0.45, 0.5 + (v - 0.5) * 0.45], WHITE = () => [0.985, 0.5];
  /** A round log of radius r and length len along local x, with bark sides and end-grain caps. */
  function log(r, len, seg, col, capCol) {
    const side = prep(new THREE.CylinderGeometry(r, r * rr(0.95, 1.05), len, seg, 1, true), col, BARK);
    const caps = [len / 2, -len / 2].map(y => { const c = new THREE.CircleGeometry(r, seg); c.rotateX(y > 0 ? -Math.PI / 2 : Math.PI / 2); c.translate(0, y, 0); return prep(c, capCol, GRAIN); });
    const g = mergeGeos([side, ...caps], ['position', 'normal', 'uv', 'color']); g.rotateZ(-Math.PI / 2); return g;
  }
  const tone = (hex, a = 0.85, b = 1.1) => lin(hex).multiplyScalar(rr(a, b));
  const X = new V(1, 0, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const place = (g, x, y, z, dir, spin = 0) => { q.setFromUnitVectors(X, dir.clone().normalize()); if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(X, spin)); return g.applyMatrix4(m.compose(new V(x, y, z), q, new V(1, 1, 1))); };

  const pits = [], roofs = [];   // the woodpiles' roof boards, all in one mesh (they take snow in winter)
  for (const P of FIREPITS) {
    const parts = [], wood = [];
    /* stones round the fire, half sunk, and the ash between them */
    for (let i = 0; i < F.stones; i++) {
      const a = i / F.stones * Math.PI * 2 + rr(-0.12, 0.12), r = P.ring + rr(-0.03, 0.04), s = rr(...F.stoneSize);
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position, ph = rr(0, 50);   // a lumpy stone: each corner moved by where it is, so faces sharing it stay joined
      for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), f = 1 + 0.14 * Math.sin(x * 5.3 + y * 7.1 + z * 3.7 + ph) + 0.06 * Math.sin(x * 11.7 - z * 9.3 + ph * 2); p.setXYZ(k, x * f, y * f, z * f); }
      g.scale(s * 1.2, s * 0.7, s); g.rotateY(-a + rr(-0.3, 0.3)); g.translate(x, H(x, z) + s * 0.25, z);
      parts.push(prep(g, tone([0x57524c, 0x645d55, 0x4a4641][i % 3], 0.75, 1.05), WHITE));
    }
    const ash = new THREE.CircleGeometry(P.bare ? P.ring - 0.08 : P.ring + 0.06, 20);   // a bare pit (the beach): ash only inside the stones ash.rotateX(-Math.PI / 2);
    { const p = ash.attributes.position; for (let k = 0; k < p.count; k++) { const x = P.x + p.getX(k), z = P.z + p.getZ(k); p.setXYZ(k, x, H(x, z) + 0.012, z); } }
    parts.push(prep(ash, lin(0x2c2a27), WHITE));
    if (!P.bare) {
    const scorch = new THREE.RingGeometry(P.ring + 0.06, P.ring + 0.5, 24, 1); scorch.rotateX(-Math.PI / 2);
    { const p = scorch.attributes.position; for (let k = 0; k < p.count; k++) { const x = P.x + p.getX(k), z = P.z + p.getZ(k); p.setXYZ(k, x, H(x, z) + 0.006, z); } }
    const sc = prep(scorch, lin(0x3a3129), WHITE); { const c = sc.attributes.color, p = sc.attributes.position; for (let k = 0; k < c.count; k++) { const d = Math.hypot(p.getX(k) - P.x, p.getZ(k) - P.z), f = d > P.ring + 0.3 ? 0.6 : 1; c.setXYZ(k, c.getX(k) * f + 0.18 * (1 - f), c.getY(k) * f + 0.16 * (1 - f), c.getZ(k) * f + 0.12 * (1 - f)); } }
    parts.push(sc);
    }

    /* three cut logs to sit on, lying along the ground */
    for (const L of P.logs) {
      const dir = new V(L.tx * P.logLen, L.y1 - L.y0, L.tz * P.logLen), g = log(P.logRad, P.logLen, 14, tone(0xffffff, 0.8, 1), tone(0xffffff, 0.9, 1.05));
      parts.push(place(g, L.x, (L.y0 + L.y1) / 2, L.z, dir, rr(0, 6.28)));
      for (const a of [-0.38, 0, 0.38]) obstacles.add(L.x + L.tx * a, L.z + L.tz * a, P.logRad + 0.04, L.top + F.collider.top - 0.4);
    }
    /* charred firewood in the fire: a small tepee (glows with the embers) */
    for (let i = 0; i < F.firewood; i++) {
      const a = i / F.firewood * Math.PI * 2 + rr(-0.2, 0.2), len = rr(0.42, 0.55), r = rr(0.03, 0.045), g = log(r, len, 7, lin(0x3b2f26).multiplyScalar(rr(0.7, 1.1)), lin(0x2a2018));
      const foot = new V(P.x + Math.cos(a) * 0.3, P.y + 0.02, P.z + Math.sin(a) * 0.3), top = new V(P.x + rr(-0.03, 0.03), P.y + 0.36, P.z + rr(-0.03, 0.03)), d = top.clone().sub(foot);
      wood.push(place(g, (foot.x + top.x) / 2, (foot.y + top.y) / 2, (foot.z + top.z) / 2, d, rr(0, 6.28)));
    }
    for (let i = 0; i < 2; i++) { const a = rr(0, 6.28), g = log(0.04, 0.5, 7, lin(0x302620), lin(0x221a14)); wood.push(place(g, P.x, P.y + 0.04, P.z, new V(Math.cos(a), 0, Math.sin(a)), rr(0, 6.28))); }

    let pileAt = null;
    if (P.pile) {
    /* the woodpile: a lean-to roof on four posts over split logs stacked on two rails, open towards the fire */
    const W = P.pile, PL = F.pile, fr = new V(W.fx, 0, W.fz), rt = new V(W.fz, 0, -W.fx);   // its front (towards the fire) and its side
    let base = -Infinity; for (const a of [-1, 1]) for (const b of [-1, 1]) base = Math.max(base, H(W.x + rt.x * a * W.w / 2 + fr.x * b * W.d / 2, W.z + rt.z * a * W.w / 2 + fr.z * b * W.d / 2));
    base += 0.02;
    const at = (lx, lz) => new V(W.x + rt.x * lx + fr.x * lz, 0, W.z + rt.z * lx + fr.z * lz);
    const hw = W.w / 2, hd = W.d / 2;
    for (const [lx, lz, top] of [[-hw, hd, PL.front], [hw, hd, PL.front], [-hw, -hd, PL.back], [hw, -hd, PL.back]]) {
      const p = at(lx, lz), g0 = H(p.x, p.z) - 0.1, g = new THREE.BoxGeometry(0.08, base + top - g0, 0.08);
      g.translate(0, (base + top + g0) / 2, 0); parts.push(place(prep(g, tone(0xc9b6a2), BARK), p.x, 0, p.z, rt.clone(), 0));
    }
    // roof: planks from front to back, a little overhang
    const roofDir = new V().addScaledVector(fr, -(W.d + 0.36)).setY(PL.back - PL.front), nPl = 7;
    for (let i = 0; i < nPl; i++) {
      const lx = -hw - 0.1 + (i + 0.5) * (W.w + 0.2) / nPl, c = at(lx, 0), g = new THREE.BoxGeometry(roofDir.length(), 0.025, (W.w + 0.2) / nPl - 0.012);
      roofs.push(place(prep(g, tone(0xd8c7b2, 0.8, 1.05), BARK), c.x, base + (PL.front + PL.back) / 2 + 0.035, c.z, roofDir.clone(), rr(-0.03, 0.03)));
    }
    for (const lz of [hd, -hd]) { const c = at(0, lz), g = new THREE.BoxGeometry(W.w + 0.1, 0.07, 0.07); parts.push(place(prep(g, tone(0xbfa892), BARK), c.x, base + (lz > 0 ? PL.front : PL.back) - 0.03, c.z, rt.clone())); }   // beams
    for (const lx of [-hw + 0.2, hw - 0.2]) { const c = at(lx, 0), g = new THREE.BoxGeometry(W.d - 0.1, 0.07, 0.08); parts.push(place(prep(g, tone(0xa8927c), BARK), c.x, base + 0.035, c.z, fr.clone())); }   // rails
    // split logs stacked, end grain to the front
    for (let row = 0; row < PL.rows; row++) {
      const n = PL.perRow - (row === PL.rows - 1 ? 2 : 0), off = row % 2 ? 0.5 : 0;
      for (let i = 0; i < n; i++) {
        const r = rr(...PL.piece), lx = -hw + 0.12 + (i + off) * (W.w - 0.24) / (PL.perRow - 0.5), c = at(lx, rr(-0.04, 0.04));
        const g = log(r, PL.length + rr(-0.06, 0.04), rr(0, 1) < 0.5 ? 4 : 5, tone(0xffffff, 0.75, 1), tone(0xffffff, 0.85, 1.05));
        parts.push(place(g, c.x, base + 0.07 + r + row * 0.165, c.z, fr.clone(), rr(0, 6.28)));
      }
    }
    for (const a of [-0.55, 0, 0.55]) { const c = at(a, 0); obstacles.add(c.x, c.z, 0.5, base + F.collider.top); }
    pileAt = { x: W.x, y: base + 0.6, z: W.z, fx: W.fx, fz: W.fz, hw: W.w / 2 - 0.1, hd: W.d / 2 - 0.1 };
    }
    obstacles.add(P.x, P.z, P.ring + 0.05, P.y + F.collider.top);   // not through the fire

    const still = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'uv', 'color']), woodMat); still.castShadow = true; still.receiveShadow = true; scene.add(still);
    const emberMat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 1, metalness: 0, emissive: new THREE.Color(1, 0.36, 0.08), emissiveMap: crackTex, emissiveIntensity: 1.2 });
    const firewood = new THREE.Mesh(mergeGeos(wood, ['position', 'normal', 'uv', 'color']), emberMat); firewood.castShadow = true; firewood.receiveShadow = true; scene.add(firewood);

    /* burning: flames, glow, a warm pool on the ground, sparks, smoke */
    const fire = new THREE.Group(); fire.position.set(P.x, P.y, P.z); scene.add(fire);
    const flames = [makeFlame(fire, 0, 0.06, 0, 0.5, 0.62, rr(0, 10), 1, 1.45, 3), makeFlame(fire, 0.1, 0.05, 0.08, 0.3, 0.42, rr(0, 10), 1.2, 1.3, 3)];
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xff8a3a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.4, 0); glow.scale.set(F.glow, F.glow, 1); glow.renderOrder = 5; fire.add(glow);
    const seg = 28, pg = new THREE.PlaneGeometry(F.pool.size, F.pool.size, seg, seg); pg.rotateX(-Math.PI / 2);
    { const p = pg.attributes.position; for (let k = 0; k < p.count; k++) { const x = P.x + p.getX(k), z = P.z + p.getZ(k); p.setXYZ(k, x, H(x, z) + 0.05, z); } }
    const poolMat = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, map: poolTex, color: new THREE.Color(...F.pool.color).multiplyScalar(F.pool.opacity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(pg, poolMat); pool.renderOrder = 3; pool.userData.noShadow = true; scene.add(pool);
    const sp = { pos: new Float32Array(F.sparks * 3).fill(-50), vel: Array.from({ length: F.sparks }, () => new V()), life: new Float32Array(F.sparks) };
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.022, map: softDot, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; fire.add(sparks);
    const smoke = Array.from({ length: F.smoke }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xa8a39c, transparent: true, opacity: 0, depthWrite: false })); scene.add(s); return { s, u: i / F.smoke, ph: rr(0, 6.28) }; });
    pits.push({ P, fire, flames, glow, pool, poolMat, sparks, sp, smoke, emberMat, k: 1, e: 1, at: new V(P.x, P.y + 0.3, P.z), pile: pileAt });
  }

  let night = 1;   // the warm pool and glow show at night, faintly by day (update() follows the sky)
  const byNight = () => 0.12 + 0.88 * night;
  const roofMat = woodMat.clone(); roofMat.userData.season = 'roof';
  const roof = new THREE.Mesh(mergeGeos(roofs, ['position', 'normal', 'uv', 'color']), roofMat); roof.castShadow = true; roof.receiveShadow = true; scene.add(roof);

  /** Show pit i burning k 0..1 with embers e 0..1. */
  function set(i, k, e) {
    const p = pits[i]; p.k = k; p.e = e;
    p.flames.forEach((g, j) => { const s = Math.min(1, k * (1.3 - j * 0.3)); g.visible = s > 0.01; g.scale.set(0.5 + 0.5 * s, Math.max(0.01, s), 0.5 + 0.5 * s); });
    p.glow.visible = p.pool.visible = k > 0.01; p.glow.material.opacity = 0.35 * k * (0.3 + 0.7 * night);
    p.poolMat.color.setRGB(...F.pool.color).multiplyScalar(F.pool.opacity * k * byNight());
    p.emberMat.emissiveIntensity = 1.1 * Math.max(k, 0.45 * e * e);
    p.sparks.visible = k > 0.05;
  }
  const cam = new V();
  function update(t, dt, camera, nightNow = 1) {
    night = nightNow; cam.copy(camera.position); const wd = U.uWindDir.value, ws = 0.4 + U.uWind.value;
    for (const p of pits) {
      const hot = Math.max(p.k, p.e);
      p.smoke.forEach(s => { s.s.visible = hot > 0.02; });
      if (hot <= 0.02 || p.at.distanceTo(cam) > F.near) continue;
      const f = 0.85 + 0.09 * Math.sin(t * 9.3 + p.P.x) + 0.05 * Math.sin(t * 15.7 + 1.3) + 0.04 * (Math.random() - 0.5);
      if (p.k > 0.01) { const g = F.glow * f; p.glow.scale.set(g, g, 1); p.glow.material.opacity = 0.35 * p.k * (0.3 + 0.7 * night); p.poolMat.color.setRGB(...F.pool.color).multiplyScalar(F.pool.opacity * p.k * byNight() * (0.8 + 0.25 * f)); }
      p.emberMat.emissiveIntensity = (1.0 + (f - 0.85) * 2.5) * Math.max(p.k, 0.45 * p.e * p.e);
      p.smoke.forEach(s => {
        s.u += dt * 0.12; if (s.u > 1) s.u -= 1; const u = s.u;
        s.s.position.set(p.P.x + wd.x * u * 1.6 * ws + Math.sin(u * 6 + s.ph) * 0.08, p.P.y + 0.5 + u * 2.4, p.P.z + wd.y * u * 1.6 * ws + Math.cos(u * 5 + s.ph) * 0.08);
        const sc = 0.25 + 1.1 * u; s.s.scale.set(sc, sc, 1); s.s.material.opacity = 0.22 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * hot; s.s.material.rotation = s.ph + u * 1.5;
      });
      if (p.k <= 0.05) continue;
      const S = p.sp, pa = p.sparks.geometry.attributes.position;
      for (let i = 0; i < S.life.length; i++) {
        S.life[i] -= dt;
        if (S.life[i] <= 0) { if (Math.random() < 0.04 * p.k) { S.life[i] = 0.5 + Math.random(); pa.setXYZ(i, (Math.random() - 0.5) * 0.2, 0.25, (Math.random() - 0.5) * 0.2); S.vel[i].set((Math.random() - 0.5) * 0.2 + wd.x * 0.2 * ws, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.2 + wd.y * 0.2 * ws); } else { pa.setY(i, -50); continue; } }
        const y = pa.getY(i) + S.vel[i].y * dt; S.vel[i].x += Math.sin(t * 7 + i) * dt * 0.3;
        if (y > 1.8) { S.life[i] = 0; pa.setY(i, -50); continue; }
        pa.setXYZ(i, pa.getX(i) + S.vel[i].x * dt, y, pa.getZ(i) + S.vel[i].z * dt);
      }
      pa.needsUpdate = true;
    }
  }
  return { pits, set, update };
}
