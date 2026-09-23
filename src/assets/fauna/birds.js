import * as THREE from 'three';
import { CONFIG } from '../../config.js';
import { U } from '../../core/uniforms.js';
import { SEA_Y } from '../../world/layout.js';

/**
 * Distant gulls: flat dark V silhouettes circling in loose groups far from the player. Background scenery only.
 * Every number is here; the player's top speed is read from CONFIG (the boat's, once there is one).
 */
const BIRDS = {
  groups: 4,                  // groups alive at all times
  perGroup: [6, 8],           // birds per group (min, max)
  wingspan: 2.0,              // metres (a big gull; the whole silhouette scales with it)
  color: 0x1c2026,            // unlit silhouette colour; the scene fog blends it into the haze ...
  fog: 0.35,                  // ... at this fraction of the scene fog's strength (full fog washes them out by 80 m)
  dihedral: 0.32,             // radians the wings are held up (the V) when gliding / at mid-beat
  flapAmp: 0.62,              // radians of wing beat
  altitude: [18, 40],         // metres above the water (clear of the tallest spruces)
  loopRadius: [20, 45],       // radius of each group's circle / figure-eight
  birdSpeed: [9, 13],         // m/s along the loop
  spread: 7,                  // metres a bird may sit from the group's path (formation + wobble)
  drift: 0.6,                 // m/s the loop centres wander
  flapRate: [3, 4],           // wing beats per second
  glideEvery: [5, 9],         // seconds between glides (each bird its own)
  minDistance: 25,            // no bird ever comes closer than this to the camera
  maxDistance: 160,           // a group whose centre is farther than this is recycled ...
  respawn: [60, 120],         // ... to this distance from the camera, ahead of the direction of travel
  respawnCone: 0.8,           // radians either side of the heading (never behind)
  fadeTime: 2.5,              // seconds to fade a recycled group out / in
  unseenRecycle: 2,           // a group entirely out of visible range this long is recycled at once (it is invisible)
  visible: [110, 140],        // birds dissolve between these distances (camera far plane is CONFIG.camera.far)
  steerMargin: 6,             // m/s the keep-away steering is faster than the player can ever close in
  steerZone: [12, 4],         // steering starts this many metres outside minDistance and is at full speed this close
  night: [0.15, 0.6],         // sky night value over which the birds fade out at dusk (hidden, paused at night)
};
const rr = (a, b) => a + (b - a) * Math.random();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** One bird: a thin body and two swept wings (inner + outer panel), 10 triangles. y = 1 marks wing vertices. */
function birdGeometry(span) {
  const h = 0.6, e = h * 0.45, P = [], k = span / 1.2;   // drawn at a 1.2 m span, then scaled as a whole
  const tri = (a, b, c) => P.push(...a, ...b, ...c);
  const B = { head: [0, 0, 0.24], l: [-0.035, 0, 0.02], r: [0.035, 0, 0.02], tail: [0, 0, -0.2], tl: [-0.07, 0, -0.3], tr: [0.07, 0, -0.3] };
  tri(B.head, B.l, B.tail); tri(B.head, B.tail, B.r); tri(B.tail, B.tl, [0, 0, -0.26]); tri(B.tail, [0, 0, -0.26], B.tr);
  for (const s of [-1, 1]) {
    const r1 = [s * 0.03, 1, 0.09], r2 = [s * 0.03, 1, -0.1], e1 = [s * e, 1, 0.06], e2 = [s * e, 1, -0.07], tip = [s * h, 1, -0.14];
    tri(r1, r2, e1); tri(e1, r2, e2); tri(e1, e2, tip);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.scale(k, 1, k);   // y only flags wing vertices
  return { geometry: g, elbow: e * k };
}

/**
 * createBirds(ctx): ctx needs scene, camera and skyUniforms (uNight drives the dusk fade). Returns update(dt) and stats.
 * One InstancedMesh for every bird (one draw call); the CPU only writes a matrix and a fade per bird per frame.
 */
export function createBirds(ctx) {
  const { scene, camera, skyUniforms } = ctx, C = BIRDS;
  // the fastest the player can close in: the boat's top speed if there is a boat, else fly speed x sprint (26 m/s)
  const playerMax = (CONFIG.boat && CONFIG.boat.maxSpeed) || 26;
  const steerSpeed = playerMax + C.birdSpeed[1] + C.steerMargin;   // centre moves away faster than any bird can close
  const { geometry, elbow } = birdGeometry(C.wingspan);

  /* ---- groups and birds ---- */
  const groups = [], birds = [];
  for (let k = 0; k < C.groups; k++) {
    const g = { c: new THREE.Vector3(), R: rr(...C.loopRadius), eight: Math.random() < 0.4, dir: Math.random() < 0.5 ? 1 : -1, u: rr(0, 6.28),
      speed: rr(...C.birdSpeed), alt: rr(...C.altitude), drift: new THREE.Vector3(), fade: 0, target: 1, pending: false, unseen: 0, birds: [] };
    const n = C.perGroup[0] + Math.floor(Math.random() * (C.perGroup[1] - C.perGroup[0] + 1));
    for (let i = 0; i < n; i++) {
      const b = { g, lag: i * rr(0.012, 0.03) + rr(0, 0.02), off: new THREE.Vector3(rr(-1, 1) * C.spread * 0.5, rr(-3, 3), rr(-1, 1) * C.spread * 0.4), wob: rr(0, 6.28), idx: birds.length };
      g.birds.push(b); birds.push(b);
    }
    groups.push(g);
  }
  const N = birds.length;
  const aBird = new Float32Array(N * 4), aFade = new Float32Array(N);
  birds.forEach((b, i) => { aBird[i * 4] = rr(0, 6.28); aBird[i * 4 + 1] = rr(...C.flapRate); aBird[i * 4 + 2] = rr(0, 6.28); aBird[i * 4 + 3] = 2 * Math.PI / rr(...C.glideEvery); });
  geometry.setAttribute('aBird', new THREE.InstancedBufferAttribute(aBird, 4));
  const fadeAttr = new THREE.InstancedBufferAttribute(aFade, 1); fadeAttr.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('aFade', fadeAttr);

  /* ---- material: unlit, fogged; wings flap (and glide) in the vertex shader; fades are dithered ---- */
  const mat = new THREE.MeshBasicMaterial({ color: C.color, side: THREE.DoubleSide });
  mat.onBeforeCompile = s => {   // the scene fog, but weaker (C.fog): distant birds sink into the haze without vanishing
    s.uniforms.uTime = U.uTime; s.uniforms.uElbow = { value: elbow }; s.uniforms.uFogK = { value: C.fog };
    s.vertexShader = 'uniform float uTime; uniform float uElbow; attribute vec4 aBird; attribute float aFade; varying float vFade;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position.x, 0.0, position.z);
      if (position.y > 0.5) {                                     // wing vertex: rotate about the body axis
        float glide = smoothstep(0.55, 0.8, sin(uTime * aBird.w + aBird.z));
        float ph = uTime * aBird.y * 6.2832 + aBird.x, amp = ${C.flapAmp.toFixed(3)} * (1.0 - glide);
        float a = ${C.dihedral.toFixed(3)} + amp * sin(ph);            // inner panel angle (up = positive)
        float b = 0.45 * amp * sin(ph - 0.9) - 0.25 * glide;    // outer panel lags behind; tips droop in a glide (gull M)
        float s = abs(position.x), sg = sign(position.x);
        vec2 p = s <= uElbow ? s * vec2(cos(a), sin(a)) : uElbow * vec2(cos(a), sin(a)) + (s - uElbow) * vec2(cos(a + b), sin(a + b));
        transformed.x = sg * p.x; transformed.y = p.y;
      }
      vFade = aFade;`);
    s.fragmentShader = 'uniform float uFogK; varying float vFade;\n' + s.fragmentShader.replace('void main() {', `void main() {
      if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= vFade) discard;`);
    s.fragmentShader = s.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('fogFactor );', 'fogFactor * uFogK );'));
  };
  const mesh = new THREE.InstancedMesh(geometry, mat, N);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.userData.dynamic = true;
  scene.add(mesh);

  /* ---- flight ---- */
  const pathAt = (g, u, out) => (g.eight ? out.set(g.R * Math.sin(u), 0, g.R * Math.sin(u) * Math.cos(u) * 1.3) : out.set(g.R * Math.cos(u), 0, g.R * Math.sin(u)));
  const cam = camera.position, prevCam = new THREE.Vector3().copy(cam), vel = new THREE.Vector3(), fwd = new THREE.Vector3(), away = new THREE.Vector3();
  const P = new THREE.Vector3(), P2 = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), S = new THREE.Vector3(1, 1, 1);
  const reach = g => C.minDistance + g.R + C.spread + 4;     // centre distance that keeps every bird out
  function place(g, first) {
    // heading: where the player travels (or looks), never behind; distance far enough that no bird starts too close
    const h = vel.lengthSq() > 1 ? Math.atan2(vel.x, vel.z) : (camera.getWorldDirection(fwd), Math.atan2(fwd.x, fwd.z));
    // nearest birds start 40-65 m away (inside the visible range, outside the steering zone), within the respawn range
    const a = h + (first ? rr(-Math.PI, Math.PI) : rr(-C.respawnCone, C.respawnCone)), d = Math.min(C.respawn[1], Math.max(C.respawn[0], reach(g) + rr(10, 35)));
    g.c.set(cam.x + Math.sin(a) * d, SEA_Y + g.alt, cam.z + Math.cos(a) * d);
    // start the flock on the near side of its loop (one of the points closest to the player), so it is in view
    const cand = []; for (let i = 0; i < 16; i++) { const u = i / 16 * 6.2832; pathAt(g, u, P); cand.push([Math.hypot(g.c.x + P.x - cam.x, g.c.z + P.z - cam.z), u]); }
    cand.sort((p, q) => p[0] - q[0]); g.u = cand[Math.floor(Math.random() * 4)][1];
    g.drift.set(rr(-1, 1), 0, rr(-1, 1)).setLength(C.drift);
  }
  groups.forEach(g => place(g, true));
  const stats = { drawn: 0, minDist: Infinity, recycled: 0 };
  let vis = 1;

  function update(dt) {
    vel.subVectors(cam, prevCam).divideScalar(Math.max(dt, 1e-3)); prevCam.copy(cam);
    vis = 1 - smooth(C.night[0], C.night[1], skyUniforms.uNight.value);
    mesh.visible = vis > 0.001; if (!mesh.visible) return;           // night: hidden, paused
    let n = 0; stats.minDist = Infinity;
    for (const g of groups) {
      /* keep away: nearest possible bird = centre distance - loop radius - spread (3D, incl. altitude) */
      const dx = g.c.x - cam.x, dz = g.c.z - cam.z, dh = Math.hypot(dx, dz), dy = g.c.y - cam.y;
      const nearest = Math.hypot(Math.max(0, dh - g.R - C.spread), dy);
      if (nearest < C.minDistance + C.steerZone[0]) {
        const k = smooth(C.minDistance + C.steerZone[0], C.minDistance + C.steerZone[1], nearest); // steer harder the closer it gets
        away.set(dx, 0, dz).normalize().multiplyScalar(steerSpeed * k * dt); g.c.add(away);
        g.c.y = Math.min(SEA_Y + C.altitude[1] + 25, g.c.y + 3 * k * dt);          // and climb a little
      }
      g.c.addScaledVector(g.drift, dt);
      if (Math.random() < dt * 0.05) g.drift.set(rr(-1, 1), 0, rr(-1, 1)).setLength(C.drift);
      /* recycle: fade out, move ahead of the player, fade in */
      if (dh > C.maxDistance && !g.pending) { g.pending = true; g.target = 0; }
      g.fade += Math.sign(g.target - g.fade) * Math.min(Math.abs(g.target - g.fade), dt / C.fadeTime);
      // a group all beyond the visible range is invisible already: move it ahead now and fade it in, so the sky
      // never runs empty (the camera's far plane, not maxDistance, limits how far birds can be seen)
      if (!g.pending && g.unseen > C.unseenRecycle) { g.fade = 0; g.pending = true; }
      if (g.pending && g.fade <= 0) { place(g, false); g.pending = false; g.target = 1; g.unseen = 0; stats.recycled++; }
      let seen = 0;
      g.u += g.dir * g.speed / g.R * dt;
      for (const b of g.birds) {
        const u = g.u - g.dir * b.lag, t = U.uTime.value;
        pathAt(g, u, P); pathAt(g, u + g.dir * 0.02, P2);
        const hd = Math.atan2(P2.x - P.x, P2.z - P.z);
        pathAt(g, u + g.dir * 0.04, fwd); const hd2 = Math.atan2(fwd.x - P2.x, fwd.z - P2.z);
        let turn = hd2 - hd; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const bank = Math.max(-0.45, Math.min(0.45, -turn * 12));                   // lean into the turn
        const c = Math.cos(hd), s = Math.sin(hd);
        P.x += g.c.x + b.off.x * c + b.off.z * s + Math.sin(t * 0.7 + b.wob) * 1.2;
        P.z += g.c.z - b.off.x * s + b.off.z * c + Math.cos(t * 0.6 + b.wob * 1.3) * 1.2;
        P.y = g.c.y + b.off.y + Math.sin(t * 0.9 + b.wob) * 1.5;
        const d = P.distanceTo(cam); stats.minDist = Math.min(stats.minDist, d);
        M.compose(P, Q.setFromEuler(E.set(Math.sin(t * 1.3 + b.wob) * 0.05, hd, bank)), S);
        mesh.setMatrixAt(b.idx, M);
        aFade[b.idx] = g.fade * vis * (1 - smooth(C.visible[0], C.visible[1], d));
        if (aFade[b.idx] > 0) n++;
        if (d < C.visible[1]) seen++;
      }
      g.unseen = seen ? 0 : g.unseen + dt;
    }
    mesh.instanceMatrix.needsUpdate = true; fadeAttr.needsUpdate = true; stats.drawn = n;
  }
  return { update, stats, groups, config: C };
}
