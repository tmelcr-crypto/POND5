import * as THREE from 'three';
import { V } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { BENCHES, SEATS, H, benchPoint } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The two viewing benches (sites: BENCHES in world/layout.js), each of its own make:
 *  - sunrise: a rustic split-log bench, the seat a halved log on two stumps, a thinner halved log for the back on two
 *    branch posts; its lantern hangs from a hooked post;
 *  - sunset: a stained plank garden bench with armrests and a slatted, reclined back; its lantern stands on a stump.
 * The lanterns are lit with the cabin's lights (registered in cabin.lamps, so the dusk switch and the Lights button
 * drive them): glass, flame, glow and a warm pool on the ground, but no real light (every extra light would cost
 * every lit pixel on the island). Each bench is a solid obstacle, as is the cabin's bench (circles in the
 * obstacle grid, reaching well above head height). Its own random numbers. Every number is in BENCH_LOOK.
 */
export const BENCH_LOOK = {
  sunrise: { seatR: 0.19, backR: 0.1, backY: 0.4, legR: 0.13, wood: [0.62, 0.55, 0.47], bark: [0.36, 0.3, 0.24] },
  sunset: { slat: [0.1, 0.03, 0.022], back: [0.12, 0.47, 0.2], arm: 0.24, wood: [0.5, 0.3, 0.2] },   // slat width, thickness, gap; back: from, to, lean
  lantern: { glow: 0.9, pool: 2.4, poolColor: [1.0, 0.62, 0.3], poolOpacity: 0.32 },
  collider: { top: 1.9 },
};

export function createBenches(ctx) {
  const { scene, maxAniso, cabin } = ctx, BL = BENCH_LOOK;
  let seed = 7310; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();

  const grainTex = (base, n) => {   // wood grain along the texture's v
    const t = canvasTex(128, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, len = 40 + rnd() * 240;
        g.strokeStyle = rnd() < 0.55 ? `rgba(50,32,20,${0.1 + rnd() * 0.3})` : `rgba(215,190,160,${0.06 + rnd() * 0.18})`;
        g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-3, 3), y + len * 0.33, x + rr(-3, 3), y + len * 0.66, x + rr(-2, 2), y + len); g.stroke();
      }
      for (let i = 0; i < 4; i++) { const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * 5, gr = g.createRadialGradient(x, y, 0, x, y, r * 2.2); gr.addColorStop(0, 'rgba(45,28,16,.8)'); gr.addColorStop(1, 'rgba(45,28,16,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 2.2, 0, 0, 6.28); g.fill(); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t;
  };
  const tone = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const jitter = (c, k = 0.08) => { const m = 1 + rr(-k, k); return [c[0] * m, c[1] * m, c[2] * m]; };
  // pieces in the bench's frame: x along the seat (to the sitter's left), z forward, y absolute height
  const box = (w, h, d, x, y, z, rot = [0, 0, 0], uvk = 1) => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, off = rnd();
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.3 * uvk + off, uv.getY(k) * Math.max(w, h, d) * 0.8 + off * 3);
    g.applyMatrix4(new THREE.Matrix4().compose(new V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new V(1, 1, 1))); return g;
  };
  const rod = (a, b, r0, r1 = r0, radial = 8) => {   // a round piece from point a to point b
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r1, r0, d.length(), radial, 1); g.translate(0, d.length() / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.normalize()))); g.translate(a.x, a.y, a.z); return g;
  };
  const halfLog = (r, len, x, y, z, flat = 0.03) => {   // a log along x split lengthwise: flat face up, bark below
    const g = new THREE.CylinderGeometry(r, r * rr(0.95, 1.05), len, 14, 1).toNonIndexed(); g.rotateZ(Math.PI / 2);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) if (p.getY(k) > flat) p.setY(k, flat);
    g.computeVertexNormals(); g.translate(x, y, z); return g;
  };
  const barkOrWood = (g, wood, bark) => {   // flat (sawn) faces the wood's colour, round ones the bark's
    const n = g.attributes.normal, c = new Float32Array(n.count * 3);
    for (let k = 0; k < n.count; k++) { const s = n.getY(k) > 0.95 || Math.abs(n.getX(k)) > 0.95 ? wood : bark; c[k * 3] = s[0]; c[k * 3 + 1] = s[1]; c[k * 3 + 2] = s[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };

  const kit = createLanternKit(ctx, rnd), { lantern, ironMat } = kit, meshes = [];

  for (const b of BENCHES) {
    const frame = new THREE.Matrix4().makeBasis(new V(b.fz, 0, -b.fx), new V(0, 1, 0), new V(b.fx, 0, b.fz)).setPosition(b.x, 0, b.z);
    const ground = (lx, lz) => { const p = new V(lx, 0, lz).applyMatrix4(frame); return H(p.x, p.z); };
    const top = b.y + b.seatH, half = b.length / 2, parts = [], lampX = half + 0.32;   // local +x is the lantern's end (b.lantern = -1: the sitter's left)
    if (b.name === 'sunrise') {
      const S = BL.sunrise;
      parts.push(barkOrWood(halfLog(S.seatR, b.length, 0, top - 0.03, 0.02), jitter(S.wood), S.bark));                     // the seat
      for (const lx of [-half + 0.3, half - 0.3]) {                                                                        // two stumps
        const g0 = Math.min(ground(lx, 0.02), ground(lx + 0.1, 0.1), ground(lx - 0.1, -0.1)) - 0.08;
        parts.push(tone(rod(new V(lx, g0, 0.02), new V(lx + rr(-0.02, 0.02), top - 0.03 - S.seatR * 0.8, 0.02 + rr(-0.02, 0.02)), S.legR, S.legR * 0.92, 11), jitter(S.bark, 0.12)));
      }
      const bz = -0.26, by = top + S.backY;
      const back = barkOrWood(halfLog(S.backR, b.length * 0.96, 0, 0, 0, 0.02), jitter(S.wood), S.bark); back.rotateX(Math.PI / 2 - 0.25); back.translate(0, by, bz); parts.push(back);   // flat face to the sitter's back
      for (const lx of [-half + 0.22, half - 0.22]) parts.push(tone(rod(new V(lx, ground(lx, bz + 0.06) - 0.1, bz + 0.06), new V(lx + rr(-0.03, 0.03), by + 0.14, bz - 0.06), 0.045, 0.035, 7), jitter(S.bark, 0.12)));
      // lantern: hangs from a hooked post at the lantern end
      const px = lampX + 0.05, pz = -0.05, gp = ground(px, pz), hookY = gp + 1.3;
      parts.push(tone(rod(new V(px, gp - 0.1, pz), new V(px, hookY, pz), 0.035, 0.03, 7), jitter(S.bark, 0.1)));
      parts.push(tone(rod(new V(px, hookY - 0.02, pz), new V(px - 0.26, hookY + 0.03, pz), 0.018, 0.016, 6), jitter(S.bark, 0.1)));
      lantern(frame, px - 0.24, hookY - 0.26, pz, null);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), ironMat); chain.position.set(px - 0.24, hookY - 0.03, pz); chain.applyMatrix4(frame); scene.add(chain);
      obstacles.add(...benchPoint(b, b.lantern * (half + 0.37), -0.05), 0.1, b.y + BL.collider.top);
    } else {
      const S = BL.sunset, [sw, st, gap] = S.slat, wood = S.wood, frontZ = 0.26, rearZ = -0.24, armY = top + S.arm;
      for (let i = 0, n = 4; i < n; i++) parts.push(tone(box(b.length, st, sw, 0, top - st / 2, rearZ + 0.04 + i * (sw + gap) + sw / 2, [0, rr(-0.01, 0.01), 0]), jitter(wood)));   // seat slats
      const lean = S.back[2];
      for (let i = 0; i < 3; i++) {                                                                                        // back slats, reclined
        const hy = top + S.back[0] + 0.05 + i * 0.13, z = rearZ + 0.042 - (hy - top) * Math.tan(lean);   // on the sitter's side of the posts
        parts.push(tone(box(b.length - 0.06, 0.09, 0.022, 0, hy, z, [-lean, 0, 0]), jitter(wood)));
      }
      for (const sx of [-1, 1]) {                                                                                          // the two side frames
        const lx = sx * (half - 0.04);
        const gF = ground(lx, frontZ) - 0.06, gR = ground(lx, rearZ) - 0.06;
        parts.push(tone(box(0.06, armY - gF, 0.06, lx, (armY + gF) / 2, frontZ), jitter(wood, 0.05)));                     // front leg up to the arm
        const rearTop = top + S.back[1];
        parts.push(tone(rod(new V(lx, gR, rearZ), new V(lx, rearTop, rearZ - (rearTop - top) * Math.tan(lean)), 0.03, 0.03, 4), jitter(wood, 0.05)));   // rear leg and back post
        parts.push(tone(box(0.07, 0.035, frontZ - rearZ + 0.14, lx, armY + 0.018, (frontZ + rearZ) / 2 + 0.03), jitter(wood, 0.05)));   // armrest
        parts.push(tone(box(0.05, 0.06, frontZ - rearZ, lx, top - st - 0.035, (frontZ + rearZ) / 2), jitter(wood, 0.05)));            // seat rail
      }
      parts.push(tone(box(b.length - 0.1, 0.05, 0.04, 0, b.y + 0.14, rearZ + 0.04), jitter(wood, 0.05)));               // low stretcher
      // lantern: stands on a stump at the lantern end
      const px = lampX + 0.02, pz = 0.05, gp = ground(px, pz), stumpTop = gp + 0.42;
      parts.push(tone(rod(new V(px, gp - 0.1, pz), new V(px, stumpTop, pz), 0.14, 0.13, 11), [0.36, 0.3, 0.24]));
      const cut = new THREE.CircleGeometry(0.13, 11); cut.rotateX(-Math.PI / 2); cut.translate(px, stumpTop + 0.001, pz); parts.push(tone(cut.toNonIndexed(), [0.7, 0.58, 0.42]));
      lantern(frame, px, stumpTop + 0.115, pz, null);
      obstacles.add(...benchPoint(b, b.lantern * (half + 0.34), 0.05), 0.18, b.y + BL.collider.top);
    }
    const tex = b.name === 'sunrise' ? grainTex('#9a8a76', 380) : grainTex('#b98c66', 300);
    const geo = mergeGeos(parts.map(g => { if (!g.attributes.uv) { const n = (g.index ? g.toNonIndexed() : g); n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; } return g; }), ['position', 'normal', 'uv', 'color']);
    geo.applyMatrix4(frame); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 }));
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); meshes.push(mesh);
    // solid: circles along the bench (the seat and the back), reaching well above head height
    for (let i = 0, n = 4; i < n; i++) { const a = -half + 0.2 + i * (b.length - 0.4) / (n - 1), [cx, cz] = benchPoint(b, a, -0.02); obstacles.add(cx, cz, b.depth / 2, b.y + BL.collider.top); }
  }
  // the cabin's bench under the front window is solid too
  const cs = SEATS[SEATS.length - 1];
  for (const a of [-0.34, 0, 0.34]) obstacles.add(cs.x + a, cs.z, 0.17, cs.top + BL.collider.top);

  kit.register();
  return { meshes, lamps: kit.lamps, update: kit.update };
}

/**
 * Small iron lanterns lit with the cabin's lights (shared by the benches and the jetty): lantern(frame, x, y, z) puts one
 * at (x, y, z) in `frame` (a Matrix4) with its glass, flame, glow and warm pool on the ground below; register() adds them
 * to cabin.lamps (so the dusk switch and the Lights button drive them) and sets their state; update(t) flickers them.
 * rnd: the caller's random numbers.
 */
export function createLanternKit(ctx, rnd) {
  const { scene, cabin } = ctx, BL = BENCH_LOOK, { softDot } = ctx.tex;
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); rnd(); g.translate(x, y, z); return g; };   // (one draw each, as the benches' boxes)
  const lamps = [], glows = [];
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 0.55, metalness: 0.6 });
  const paneMat = new THREE.MeshStandardMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.3, emissive: new THREE.Color(1, 0.72, 0.4), emissiveIntensity: 0.6, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2, metalness: 0 });
  paneMat.userData.ei = 0.6;
  const poolTex = canvasTex(128, 128, g => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.55)'); r.addColorStop(0.65, 'rgba(255,255,255,.15)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });

  /** A small iron lantern with its flame at (x, y, z) in the frame `frame` (a Matrix4); returns its lamp entry. */
  function lantern(frame, x, y, z, pool) {
    const g = new THREE.Group(); g.applyMatrix4(frame); scene.add(g);
    const L = new THREE.Group(); L.position.set(x, y, z); g.add(L);
    const iron = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => iron.push(box(0.012, 0.19, 0.012, a * 0.058, 0, b * 0.058)));
    iron.push(box(0.14, 0.014, 0.14, 0, -0.1, 0), box(0.1, 0.01, 0.1, 0, 0.1, 0));
    const cap = new THREE.ConeGeometry(0.095, 0.09, 4); cap.rotateY(Math.PI / 4); cap.translate(0, 0.15, 0); iron.push(cap);
    const ring = new THREE.TorusGeometry(0.025, 0.005, 5, 10); ring.translate(0, 0.21, 0); iron.push(ring);
    const im = new THREE.Mesh(mergeGeos(iron.map(q => q.index ? q.toNonIndexed() : q), ['position', 'normal']), ironMat); im.castShadow = true; im.receiveShadow = true; L.add(im);
    [[0, 0.056, 0], [0, -0.056, 0], [0.056, 0, Math.PI / 2], [-0.056, 0, Math.PI / 2]].forEach(([px, pz, r]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.18), paneMat); p.position.set(px, 0, pz); p.rotation.y = r; L.add(p); });
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flame.scale.set(0.05, 0.08, 1); flame.position.set(0, -0.045, 0); flame.renderOrder = 5; L.add(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffa050, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(BL.lantern.glow, BL.lantern.glow, 1); glow.renderOrder = 5; L.add(glow);
    glows.push({ s: glow, f: flame, size: BL.lantern.glow, ph: rnd() * 10 });
    // a warm pool of light on the ground below, following the terrain
    const P = BL.lantern.pool, wp = new V(x, y, z).applyMatrix4(frame), seg = 14, pg = new THREE.PlaneGeometry(P * 2, P * 2, seg, seg); pg.rotateX(-Math.PI / 2);
    const pp = pg.attributes.position; for (let k = 0; k < pp.count; k++) { const px = wp.x + pp.getX(k), pz = wp.z + pp.getZ(k); pp.setXYZ(k, px, Math.max(H(px, pz), pool ? pool(px, pz) : -1e9) + 0.03, pz); }
    const poolMesh = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(...BL.lantern.poolColor).multiplyScalar(BL.lantern.poolOpacity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    poolMesh.renderOrder = 3; poolMesh.userData.noShadow = true; scene.add(poolMesh);
    const lamp = { light: { intensity: 0 }, base: 0, flames: [flame, glow, poolMesh], mats: [paneMat] };
    lamps.push(lamp); return lamp;
  }

  function register() {
    lamps.forEach(l => cabin.lamps.push(l));
    const on = cabin.lightsOn; lamps.forEach(L => { L.flames.forEach(f => f.visible = on); L.mats.forEach(m => m.emissiveIntensity = on ? m.userData.ei : 0); });
  }
  function update(t) {
    if (!cabin.lightsOn) return;
    for (const g of glows) { const k = 0.9 + 0.1 * Math.sin(t * 9 + g.ph) + 0.05 * Math.sin(t * 21 + g.ph * 2); g.s.scale.set(g.size * k, g.size * k, 1); g.f.scale.set(0.05 * k, 0.08 * (0.9 + 0.2 * k), 1); }
  }
  return { lantern, register, update, lamps, ironMat };
}
