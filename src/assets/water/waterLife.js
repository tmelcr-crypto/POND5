import * as THREE from 'three';
import { LAKE, lakeR, WATER_Y, SEA_Y, coastDist, H } from '../../world/layout.js';
import { mergeGeos, paint, limb } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { lin } from '../../core/math.js';

/**
 * Small life on and around the water: fish rises (a ring spreading on the surface and fading) on the pond and on the
 * sea near the shore, and dragonflies darting and hovering over the pond by day. Each part runs only while its
 * detail-manager band is on (no updates, nothing drawn otherwise); day and night come from the sky's night value
 * (skyUniforms.uNight). Every number is in WATER.
 */
export const WATER = {
  rise: {
    every: [4, 10],                // seconds between rises, on each water
    double: 0.3,                   // chance that a second ring follows at the same spot ...
    doubleGap: [0.3, 0.7],         // ... this many seconds later
    life: 2,                       // seconds a ring spreads and fades
    opacity: 0.45,                 // at its brightest
    pool: 8,                       // rings alive at once, at most
  },
  pond: { radius: 0.45, band: 20 },                              // ring size (m) on the small pond; active within `band` m of it
  sea: { radius: 1, band: 30, view: [5, 30], shore: [-14, -2.5], minDepth: 0.4, fov: 0.6, tries: 24 },
  // sea rings: 5-30 m from the camera, within `fov` rad of where it looks, 2.5-14 m out from the shoreline
  dragonflies: {
    count: 3,
    band: 15,                      // m from the pond
    night: [0.25, 0.45],           // they leave once the night value passes night[1], and come back below night[0]
    area: 1.35,                    // targets out to this many pond radii from its centre (mostly over the water)
    height: [0.25, 1.1],           // m above the water or ground
    hover: [0.5, 2.6],             // s hovering between darts
    dart: [0.4, 2.2],              // m per dart
    speed: [2.5, 5],               // m/s while darting
    flap: 27,                      // wing beats per second (reads as a shimmer at 60 fps)
    body: 0.075,                   // m, head to tail
  },
};
const rr = (a, b) => a + (b - a) * Math.random();

/** createWaterLife(ctx): ctx needs scene, camera, detail and skyUniforms. Returns update(dt) and stats. */
export function createWaterLife(ctx) {
  const { scene, camera, detail, skyUniforms } = ctx, W = WATER, V3 = THREE.Vector3;
  const stats = { rings: 0, dragonflies: 0, updateMs: 0 };

  /* ---- rises: one instanced mesh of flat quads; the shader draws a spreading crest with a trough and a weaker inner ring ---- */
  const P = W.rise.pool, ringGeo = new THREE.PlaneGeometry(2, 2); ringGeo.rotateX(-Math.PI / 2);
  const aT = new THREE.InstancedBufferAttribute(new Float32Array(P).fill(-1), 1); aT.setUsage(THREE.DynamicDrawUsage); ringGeo.setAttribute('aT', aT);
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const ringU = { uLight: { value: new THREE.Color() }, uDark: { value: lin(0x14201f) }, uOpacity: { value: W.rise.opacity } };
  ringMat.onBeforeCompile = s => {
    Object.assign(s.uniforms, ringU);
    s.vertexShader = 'attribute float aT; varying float vT; varying vec2 vR;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vT = aT; vR = position.xz;');
    s.fragmentShader = 'uniform vec3 uLight; uniform vec3 uDark; uniform float uOpacity; varying float vT; varying vec2 vR;\n' + s.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      float r = length(vR), t = clamp(vT, 0.0, 1.0);
      float R = 0.08 + 0.92 * (1.0 - (1.0 - t) * (1.0 - t));    // the front slows as it spreads
      float w = 0.035 + 0.06 * t;
      float q1 = (r - R) / w, q2 = (r - R + 2.2 * w) / w, q3 = (r - 0.6 * R) / (0.8 * w);
      float crest = max(exp(-q1 * q1), 0.55 * exp(-q3 * q3)), trough = 0.6 * exp(-q2 * q2);
      float fade = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.06, t) * step(0.0, vT) * (1.0 - smoothstep(0.92, 1.0, r));
      float a = (crest + trough) * fade * uOpacity;
      if (a < 0.004) discard;
      vec4 diffuseColor = vec4(mix(uDark, uLight, crest / (crest + trough + 1e-4)), a);`);
  };
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, P);
  rings.renderOrder = 3; rings.frustumCulled = false; rings.userData.dynamic = true; rings.visible = false;   // after the (transparent) pond
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4();
  for (let i = 0; i < P; i++) rings.setMatrixAt(i, zero);
  scene.add(rings);
  const slots = Array.from({ length: P }, () => ({ age: -1 })), queue = [];
  function ring(x, y, z, radius) {
    let k = slots.findIndex(s => s.age < 0); if (k < 0) k = slots.reduce((b, s, i) => (s.age > slots[b].age ? i : b), 0);   // reuse the oldest
    slots[k].age = 0; rings.setMatrixAt(k, M.makeScale(radius, 1, radius).setPosition(x, y, z)); rings.instanceMatrix.needsUpdate = true;
  }
  function rise(x, y, z, radius) {
    ring(x, y, z, radius);
    if (Math.random() < W.rise.double) queue.push({ at: rr(...W.rise.doubleGap), x: x + rr(-0.15, 0.15), y, z: z + rr(-0.15, 0.15), radius: radius * rr(0.7, 1) });
  }
  // the pond: anywhere a ring fits between the shores
  function pondRise() {
    for (let i = 0; i < 10; i++) {
      const a = rr(0, 6.2832), R = lakeR(a) - W.pond.radius - 0.15, r = Math.sqrt(Math.random()) * Math.max(0, R);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      if (H(x, z) < WATER_Y - 0.05) { rise(x, WATER_Y + 0.0012, z, W.pond.radius); return; }   // just under the lily pads
    }
  }
  // the sea: open water near the shore, in front of the camera
  const fwd = new V3();
  function seaRise() {
    const S = W.sea, p = camera.position; camera.getWorldDirection(fwd);
    const head = Math.atan2(fwd.z, fwd.x);
    for (let i = 0; i < S.tries; i++) {
      const a = head + rr(-S.fov, S.fov), d = rr(...S.view), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, c = coastDist(x, z);
      if (c > S.shore[0] && c < S.shore[1] && SEA_Y - H(x, z) > S.minDepth) { rise(x, SEA_Y + 0.02, z, S.radius); return; }
    }
  }
  const waters = [
    { spawn: pondRise, next: rr(1, 4), band: null },
    { spawn: seaRise, next: rr(1, 4), band: null },
  ];

  /* ---- dragonflies: an instanced body (head, thorax, tapering abdomen) and four instanced translucent wings each ---- */
  const D = W.dragonflies, s = D.body / 0.075;
  const bodyParts = [
    paint(limb(new V3(0, 0, 0.004 * s), new V3(0, 0.001 * s, -0.052 * s), 0.0026 * s, 0.0014 * s, 6, 30), (c, x, y, z, nx, ny) => {
      const seg = (0.004 * s - z) / (0.0056 * s);   // ten segments: blue, with a dark joint ring and a dark line along the back
      c.copy(lin(seg % 1 < 0.2 || ny > 0.75 ? 0x10161d : 0x2d78bd));
    }),
    paint(new THREE.SphereGeometry(0.0045 * s, 8, 6).scale(1, 0.95, 1.35).translate(0, 0.0005 * s, 0.011 * s), c => c.copy(lin(0x4f7a2c))),       // green thorax
    paint(new THREE.SphereGeometry(0.0038 * s, 8, 6).scale(1.3, 0.9, 0.8).translate(0, 0.0009 * s, 0.0195 * s), c => c.copy(lin(0x2a5f6e))),     // big eyes
  ];
  const bodyGeo = mergeGeos(bodyParts, ['position', 'normal', 'color']);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25 }), D.count);
  const wingTex = canvasTex(128, 32, g => {
    const shape = () => { g.beginPath(); g.moveTo(2, 13); g.bezierCurveTo(30, 6, 90, 5, 122, 11); g.quadraticCurveTo(128, 16, 121, 22); g.bezierCurveTo(90, 27, 40, 26, 2, 19); g.closePath(); };
    shape(); g.fillStyle = 'rgba(214,232,245,0.32)'; g.fill();
    g.save(); shape(); g.clip();
    g.strokeStyle = 'rgba(40,52,60,0.55)'; g.lineWidth = 1; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(6 + i * 7.5, 6); g.lineTo(10 + i * 7.5, 27); g.stroke(); }
    g.beginPath(); g.moveTo(2, 15); g.lineTo(124, 15); g.stroke();
    g.fillStyle = 'rgba(30,24,18,0.9)'; g.fillRect(104, 8, 9, 4);   // pterostigma
    g.restore(); shape(); g.strokeStyle = 'rgba(30,40,48,0.8)'; g.lineWidth = 1.5; g.stroke();
  });
  const wingGeo = new THREE.PlaneGeometry(0.047 * s, 0.0105 * s); wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0.0255 * s, 0, 0);   // span ~ 1.3 x body
  const wings = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ map: wingTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2, metalness: 0, envMapIntensity: 1.4 }), D.count * 4);
  for (const m of [bodies, wings]) { m.frustumCulled = false; m.userData.dynamic = true; m.visible = false; scene.add(m); }
  wings.renderOrder = 3;

  const flies = Array.from({ length: D.count }, (_, i) => ({ p: new V3(), from: new V3(), to: new V3(), anchor: new V3(), mode: 'gone', u: 0, T: 1, hold: 0, yaw: rr(0, 6.28), yawTo: 0, lift: 0, ph: i * 1.9 + rr(0, 1), leaving: false }));
  function target(out) {
    const inside = Math.random() < 0.8, a = rr(0, 6.2832), r = lakeR(a) * (inside ? Math.sqrt(Math.random()) * 0.9 : rr(0.9, D.area));
    const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
    return out.set(x, Math.max(WATER_Y, H(x, z)) + rr(...D.height), z);
  }
  function dart(f, to, speed, long = false) {   // long: flying in from / off to a distance
    f.from.copy(f.p); f.to.copy(to); f.u = 0; const d = f.from.distanceTo(f.to);
    f.T = Math.min(Math.max(d / speed, 0.15), long ? 3 : 0.7); f.lift = Math.min(0.12, d * 0.06);
    f.yawTo = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z); f.mode = 'dart';
  }
  const tmp = new V3(), away = (f, out) => { const a = Math.atan2(f.p.z - LAKE.z, f.p.x - LAKE.x) + rr(-0.6, 0.6); return out.set(LAKE.x + Math.cos(a) * 8, f.p.y + 3, LAKE.z + Math.sin(a) * 8); };
  function nextDart(f) {
    for (let i = 0; i < 6; i++) { target(tmp); const d = tmp.distanceTo(f.p); if (d > D.dart[0] && d < D.dart[1]) break; }
    dart(f, tmp, rr(...D.speed));
  }
  let clock = 0, day = null;
  const mB = new THREE.Matrix4(), mW = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new V3(1, 1, 1), root = new V3(), scl = new V3();
  function flyUpdate(dt) {
    const night = skyUniforms.uNight.value;
    const wantDay = day === null ? night < D.night[1] : (day ? night < D.night[1] : night < D.night[0]);
    if (wantDay !== day) {
      day = wantDay;
      for (const f of flies) {
        if (day && f.mode === 'gone') {
          f.leaving = false; target(tmp);
          if (clock === 0) { f.p.copy(tmp); f.anchor.copy(tmp); f.mode = 'hover'; f.hold = rr(...D.hover); }   // already there at load
          else { f.p.copy(tmp); away(f, f.p); dart(f, tmp, 4, true); }                                        // fly in from 8 m away
        }
        if (!day && f.mode !== 'gone') { f.leaving = true; dart(f, away(f, tmp), 4, true); }                   // fly off, then hide
      }
    }
    clock += dt; let shown = 0;
    flies.forEach((f, i) => {
      if (f.mode === 'gone') { bodies.setMatrixAt(i, zero); for (let k = 0; k < 4; k++) wings.setMatrixAt(i * 4 + k, zero); return; }
      shown++;
      if (f.mode === 'dart') {
        f.u = Math.min(1, f.u + dt / f.T); const k = f.u * f.u * (3 - 2 * f.u);
        f.p.lerpVectors(f.from, f.to, k); f.p.y += Math.sin(Math.PI * f.u) * f.lift;
        f.yaw += Math.atan2(Math.sin(f.yawTo - f.yaw), Math.cos(f.yawTo - f.yaw)) * (1 - Math.exp(-dt * 25));
        if (f.u >= 1) { if (f.leaving) f.mode = 'gone'; else { f.mode = 'hover'; f.anchor.copy(f.to); f.hold = rr(...D.hover); if (Math.random() < 0.5) f.yawTo = f.yaw + rr(-2, 2); } }
      } else {
        const t = clock + f.ph; f.hold -= dt;
        f.p.set(f.anchor.x + 0.008 * Math.sin(t * 5.3) + 0.004 * Math.sin(t * 13.1), f.anchor.y + 0.012 * Math.sin(t * 10.7) + 0.005 * Math.sin(t * 17.3), f.anchor.z + 0.008 * Math.cos(t * 4.7));
        f.yaw += Math.atan2(Math.sin(f.yawTo - f.yaw), Math.cos(f.yawTo - f.yaw)) * (1 - Math.exp(-dt * 12));   // a quick pivot now and then
        if (f.hold <= 0) nextDart(f);
      }
      const darting = f.mode === 'dart';
      e.set(-(darting ? 0.03 : 0.14), f.yaw, 0, 'YXZ'); q.setFromEuler(e); mB.compose(f.p, q, one); bodies.setMatrixAt(i, mB);
      for (let k = 0; k < 4; k++) {
        const side = k % 2 ? -1 : 1, hind = k > 1, amp = darting ? 0.35 : 0.55;
        const flap = 0.05 + amp * Math.sin(clock * 6.2832 * D.flap + f.ph * 7 + (hind ? 1.6 : 0));
        e.set(0, side * (hind ? -0.12 : 0.1), side * flap, 'ZYX'); q.setFromEuler(e);
        mW.compose(root.set(0, 0.003 * s, (hind ? 0.005 : 0.012) * s), q, scl.set(side, 1, 1)).premultiply(mB); wings.setMatrixAt(i * 4 + k, mW);
      }
    });
    bodies.instanceMatrix.needsUpdate = wings.instanceMatrix.needsUpdate = true;
    bodies.visible = wings.visible = shown > 0; stats.dragonflies = shown;
  }

  /* ---- detail-manager bands ---- */
  const V = camera.position.constructor, pondBox = { min: new V(LAKE.x - 2.6, WATER_Y - 0.2, LAKE.z - 2.6), max: new V(LAKE.x + 2.6, WATER_Y + 1.5, LAKE.z + 2.6) };
  let fliesOn = false;
  if (detail) {
    waters[0].band = detail.band('pond rises', pondBox, W.pond.band, () => {});
    const R = 50;   // the island and its shore
    waters[1].band = detail.band('sea rises', { min: new V(-R, SEA_Y - 1, -R), max: new V(R, SEA_Y + 20, R) }, W.sea.band, () => {});
    detail.band('dragonflies', pondBox, D.band, on => { fliesOn = on; if (!on) { bodies.visible = wings.visible = false; stats.dragonflies = 0; } });
  } else { waters.forEach(w => { w.band = { on: true }; }); fliesOn = true; }

  return {
    stats, rings, bodies, wings, flies,
    update(dt) {
      const t0 = performance.now();
      for (const w of waters) { if (!w.band || !w.band.on) continue; w.next -= dt; if (w.next <= 0) { w.spawn(); w.next = rr(...W.rise.every); } }
      for (let i = queue.length - 1; i >= 0; i--) { const d = queue[i]; d.at -= dt; if (d.at <= 0) { ring(d.x, d.y, d.z, d.radius); queue.splice(i, 1); } }
      let alive = 0;
      slots.forEach((sl, i) => {
        if (sl.age < 0) return;
        sl.age += dt;
        if (sl.age >= W.rise.life) { sl.age = -1; aT.array[i] = -1; rings.setMatrixAt(i, zero); rings.instanceMatrix.needsUpdate = true; } else { aT.array[i] = sl.age / W.rise.life; alive++; }
      });
      stats.rings = alive; rings.visible = alive > 0;
      if (alive) { aT.needsUpdate = true; const b = 1 - 0.85 * skyUniforms.uNight.value; ringU.uLight.value.setRGB(0.8 * b, 0.86 * b, 0.9 * b); }
      if (fliesOn) flyUpdate(dt);
      stats.updateMs = performance.now() - t0;
    },
  };
}
