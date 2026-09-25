import * as THREE from 'three';
import { CONFIG } from '../../config.js';
import { U } from '../../core/uniforms.js';
import { H, WATER_Y, APP, CON, ROSE } from '../../world/layout.js';

/**
 * Rare small moments near the player, around the plot's apple tree, spruce and rose bush: a leaf now and then detaches
 * from the apple crown, flutters down with the wind, lies a while and fades; very rarely an apple (or a spruce cone)
 * drops, bounces, rolls a little downhill and rests; in strong gusts a few rose petals skip along the ground and fade.
 * Geometry and textures are the plot's own (the apple tree's leaf cards and apples, the spruce's cones, the rose's
 * fallen petals). Each part runs only within the near detail band of its plant; everything lands on the terrain
 * (H) or, over the pond, on the water. Every number is in MOMENTS. The season (setSeason, world/seasons.js): no leaves or
 * apples in winter, leaves falling four times as often (in autumn colours) in autumn, white-pink blossom instead of leaves
 * in spring, apples in summer and autumn, rose petals in spring and summer.
 */
export const MOMENTS = {
  band: CONFIG.trees.fade[0],     // m: the plants' full-detail (near) range
  leaves: { every: [6, 20], max: 6, lie: 20, fade: 3, fall: [0.55, 0.85], flutter: 0.35, drift: 0.9, size: [0.09, 0.12] },
  apples: { every: [180, 360], max: 8, bounce: 0.3, roll: 0.55, stop: 0.04 },
  cones: { every: [180, 360], max: 8, bounce: 0.25, roll: 0.45, stop: 0.04 },
  petals: { gust: 0.8, count: [2, 4], cooldown: 18, speed: [0.9, 1.6], travel: [1.5, 4], lie: [6, 10], fade: 2, max: 16 },
  g: 9.8,
};
const rr = (a, b) => a + (b - a) * Math.random();
const V3 = THREE.Vector3;

/** Ground height at (x, z) for resting things: the terrain, or the pond's surface over the water. */
const surface = (x, z) => Math.max(H(x, z), WATER_Y + 0.003);
/** Terrain normal from the height function. */
function normalAt(x, z, out) { const e = 0.05; return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); }

// dithered per-instance fade (the scene's usual pattern), for any standard material
function fadeable(mat) {
  mat.onBeforeCompile = s => {
    s.vertexShader = 'attribute float aFade; varying float vFade;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFade = aFade;');
    s.fragmentShader = 'varying float vFade;\n' + s.fragmentShader.replace('void main() {', `void main() {
      if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vFade) discard;`);
  };
  return mat;
}
/** A pool of instances of one geometry: matrices, colours and the fade attribute. */
function pool(scene, geo, mat, n) {
  const g = geo.clone(), fade = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); fade.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aFade', fade);
  const m = new THREE.InstancedMesh(g, fadeable(mat), n); m.count = 0; m.frustumCulled = false; m.userData.dynamic = true; m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); scene.add(m);
  return { m, fade, n };
}

/**
 * createSmallMoments(ctx): ctx needs scene, camera, detail and plot: { apple, spruce, rose } (the objects each plot
 * builder added). Returns update(dt), stats and a log of what happened.
 */
export function createSmallMoments(ctx) {
  const { scene, detail, plot } = ctx, M = MOMENTS, stats = { leaves: 0, apples: 0, cones: 0, petals: 0 }, log = [];
  const meshes = objs => { const out = []; objs.forEach(o => o.traverse(c => { if (c.isInstancedMesh) out.push(c); })); return out; };
  const positions = (im, max = 400) => { const out = [], m4 = new THREE.Matrix4(), step = Math.max(1, Math.floor(im.count / max)); for (let i = 0; i < im.count; i += step) { im.getMatrixAt(i, m4); out.push({ p: new V3().setFromMatrixPosition(m4), s: new V3().setFromMatrixScale(m4), i }); } return out; };
  const colorOf = (im, i) => { const c = new THREE.Color(1, 1, 1); if (im.instanceColor) im.getColorAt(i, c); return c; };

  // the plot's own parts
  const appleMs = meshes(plot.apple), leafIM = appleMs.find(m => m.material.map === ctx.tex.leafTex), appleIM = appleMs.find(m => m.geometry.type === 'LatheGeometry');
  const coneIM = meshes(plot.spruce).find(m => !m.material.map);
  const roseBase = new V3(ROSE.x, H(ROSE.x, ROSE.z), ROSE.z);
  const petalIMs = meshes(plot.rose).filter(m => m.material.map && m.material.emissiveMap);
  const groundPetals = petalIMs.find(m => positions(m, 40).every(q => q.p.y < roseBase.y + 0.08)) || petalIMs[0];
  const leafSpots = leafIM ? positions(leafIM) : [], onTree = (list, o, h) => list.filter(q => q.p.y > H(o.x, o.z) + h),   // not the ones already lying under the tree
    appleSpots = appleIM ? onTree(positions(appleIM), APP, 0.8) : [], coneSpots = coneIM ? onTree(positions(coneIM), CON, 0.8) : [], petalSpots = petalIMs.length ? positions(petalIMs[petalIMs.length - 1], 200) : [];

  const P = {
    leaves: leafIM && pool(scene, leafIM.geometry, new THREE.MeshStandardMaterial({ map: leafIM.material.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }), M.leaves.max),
    apples: appleIM && pool(scene, appleIM.geometry, new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 }), M.apples.max + 1),
    cones: coneIM && pool(scene, coneIM.geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), M.cones.max + 1),
    petals: groundPetals && pool(scene, groundPetals.geometry, new THREE.MeshStandardMaterial({ map: groundPetals.material.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5 }), M.petals.max),
  };
  const items = { leaves: [], apples: [], cones: [], petals: [] };
  const say = (t, what) => { log.push(`${t.toFixed(1)} s: ${what}`); if (log.length > 1000) log.shift(); };

  /* ---- spawning ---- */
  const q = new THREE.Quaternion(), e = new THREE.Euler(), n = new V3(), up = new V3(0, 1, 0), m4 = new THREE.Matrix4();
  function spawnLeaf(t) {
    if (!leafSpots.length || items.leaves.length >= M.leaves.max) { const lying = items.leaves.find(l => l.landed); if (!lying) return; lying.age = Math.max(lying.age, M.leaves.lie - M.leaves.fade); return; }
    const s = leafSpots[Math.floor(Math.random() * leafSpots.length)], tint = season === 'spring' ? new THREE.Color(0.95, rr(0.62, 0.85), rr(0.7, 0.85)) : season === 'autumn' ? new THREE.Color(rr(0.6, 0.85), rr(0.1, 0.5), 0.03) : colorOf(leafIM, s.i).lerp(new THREE.Color(1.1, 0.75, 0.25), rr(0.2, 0.6));
    items.leaves.push({ p: s.p.clone(), v: new V3(), rot: new V3(rr(0, 6), rr(0, 6), rr(0, 6)), spin: new V3(rr(-4, 4), rr(-3, 3), rr(-5, 5)), ph: rr(0, 6), fall: rr(...M.leaves.fall), size: s.s.y * rr(0.95, 1.05), tint, landed: false, age: 0, yaw: rr(0, 6.28) });
    say(t, `a leaf detaches at ${s.p.y.toFixed(1)} m`);
  }
  function spawnRoller(kind, t) {
    const spots = kind === 'apples' ? appleSpots : coneSpots, im = kind === 'apples' ? appleIM : coneIM; if (!spots.length) return;
    const list = items[kind], C = M[kind];
    if (list.length >= C.max) { const old = list.find(a => !a.gone); if (old) { old.gone = true; say(t, `the oldest ${kind === 'apples' ? 'apple' : 'cone'} on the ground fades out (limit ${C.max})`); } }
    const s = spots[Math.floor(Math.random() * spots.length)];
    if (!im.geometry.boundingSphere) im.geometry.computeBoundingSphere();
    list.push({ r: im.geometry.boundingSphere.radius * s.s.y * 0.85, p: s.p.clone(), v: new V3(rr(-0.2, 0.2), 0, rr(-0.2, 0.2)), s: s.s.clone(), tint: colorOf(im, s.i), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(0, 6), rr(0, 6), rr(0, 6))), bounces: 0, rolling: false, still: 0, rest: false, gone: false, fade: 1 });
    say(t, `${kind === 'apples' ? 'an apple' : 'a spruce cone'} drops from ${s.p.y.toFixed(1)} m`);
  }
  function spawnPetals(t) {
    if (!petalSpots.length || season === 'autumn' || season === 'winter') return;
    const k = Math.round(rr(...M.petals.count)), wd = U.uWindDir.value;
    for (let i = 0; i < k && items.petals.length < M.petals.max; i++) {
      const s = petalSpots[Math.floor(Math.random() * petalSpots.length)], dir = new V3(wd.x, 0, wd.y).applyAxisAngle(up, rr(-0.5, 0.5)).normalize();
      items.petals.push({ p: s.p.clone(), dir, speed: rr(...M.petals.speed) * (0.6 + U.uWind.value * 0.6), left: rr(...M.petals.travel), hop: 0, rot: rr(0, 6.28), spin: rr(-8, 8), landed: false, age: 0, life: rr(...M.petals.lie), size: s.s.y, tint: colorOf(petalIMs[petalIMs.length - 1], s.i) });
    }
    say(t, `a gust lifts ${k} rose petals`);
  }

  /* ---- motion ---- */
  function stepLeaf(l, dt) {
    const L = M.leaves;
    if (!l.landed) {
      l.ph += dt; const wd = U.uWindDir.value, w = U.uWind.value;
      l.p.x += (wd.x * w * L.drift + Math.sin(l.ph * 2.3) * L.flutter) * dt;
      l.p.z += (wd.y * w * L.drift + Math.cos(l.ph * 1.9) * L.flutter) * dt;
      l.p.y -= l.fall * (0.75 + 0.5 * Math.abs(Math.sin(l.ph * 3.1))) * dt;       // swinging: slows and speeds up
      l.rot.addScaledVector(l.spin, dt);
      const g = surface(l.p.x, l.p.z);
      if (l.p.y <= g + 0.004) { l.p.y = g + 0.004; l.landed = true; l.age = 0; }
      e.set(l.rot.x, l.rot.y, l.rot.z); q.setFromEuler(e);
    } else {
      l.age += dt;
      normalAt(l.p.x, l.p.z, n); if (H(l.p.x, l.p.z) < WATER_Y) n.set(0, 1, 0);
      q.setFromUnitVectors(new V3(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), l.yaw));   // flat on the ground: the card's face along the normal
      l.p.y = surface(l.p.x, l.p.z) + 0.004;
    }
    return m4.compose(l.p, q, new V3(l.size * 0.7, l.size, l.size));
  }
  function stepRoller(a, C, dt) {
    const r = a.r;
    if (a.rest) return;
    const onPond = x => H(x.x, x.z) < WATER_Y + 0.02;
    if (!a.rolling) {
      a.v.y -= M.g * dt; a.p.addScaledVector(a.v, dt);
      const g = H(a.p.x, a.p.z) + r;
      if (a.p.y <= g) {
        a.p.y = g; normalAt(a.p.x, a.p.z, n);
        if (a.bounces < 2 && -a.v.y > 0.6) { a.v.reflect(n).multiplyScalar(C.bounce); a.bounces++; }
        else { a.rolling = true; a.v.y = 0; }
      }
      a.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), dt * 3));
    } else {
      normalAt(a.p.x, a.p.z, n);
      const slope = new V3(n.x, 0, n.z);                                  // downhill direction, steepness
      a.v.x += slope.x * M.g * C.roll * dt; a.v.z += slope.z * M.g * C.roll * dt;
      const sp = Math.hypot(a.v.x, a.v.z), drag = Math.max(0, sp - (1.2 + 3 * (1 - C.roll)) * dt); if (sp > 0) { a.v.x *= drag / sp; a.v.z *= drag / sp; }
      const next = new V3(a.p.x + a.v.x * dt, 0, a.p.z + a.v.z * dt);
      if (onPond(next)) { a.v.set(0, 0, 0); } else { a.p.x = next.x; a.p.z = next.z; }
      a.p.y = H(a.p.x, a.p.z) + r;
      const d = Math.hypot(a.v.x, a.v.z) * dt; if (d > 0) a.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(a.v.z, 0, -a.v.x).normalize(), d / r));
      a.still = Math.hypot(a.v.x, a.v.z) < C.stop ? a.still + dt : 0;
      if (a.still > 0.6) { a.rest = true; a.v.set(0, 0, 0); }
    }
  }
  function stepPetal(pt, dt) {
    if (!pt.landed) {
      const d = Math.min(pt.left, pt.speed * dt); pt.left -= d; pt.p.addScaledVector(pt.dir, d);
      pt.hop += dt * (5 + pt.speed * 2); pt.rot += pt.spin * dt; pt.speed *= Math.exp(-dt * 0.25);
      const g = surface(pt.p.x, pt.p.z);
      pt.p.y = g + 0.004 + Math.abs(Math.sin(pt.hop)) * 0.12 * Math.min(1, pt.left);          // skipping, lower as it runs out
      if (pt.left <= 0) { pt.landed = true; pt.p.y = g + 0.004; }
      e.set(Math.sin(pt.hop) * 1.2, pt.rot, Math.cos(pt.hop * 0.7) * 0.8); q.setFromEuler(e);
    } else {
      pt.age += dt; normalAt(pt.p.x, pt.p.z, n); if (H(pt.p.x, pt.p.z) < WATER_Y) n.set(0, 1, 0);
      q.setFromUnitVectors(new V3(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), pt.rot));   // lying flat, like the leaves
      pt.p.y = surface(pt.p.x, pt.p.z) + 0.004;
    }
    return m4.compose(pt.p, q, new V3(pt.size, pt.size, pt.size));
  }

  /* ---- bands ---- */
  const on = { apple: false, spruce: false, rose: false };
  const V = new V3().constructor, at = (o, h) => ({ min: new V(o.x, H(o.x, o.z) + h, o.z) });
  if (detail) {
    detail.band('apple moments', at(APP, 2), M.band, b => { on.apple = b; });
    detail.band('spruce moments', at(CON, 3), M.band, b => { on.spruce = b; });
    detail.band('rose moments', at(ROSE, 0.4), M.band, b => { on.rose = b; });
  } else { on.apple = on.spruce = on.rose = true; }

  let season = 'summer';
  let t = 0, nextLeaf = rr(...M.leaves.every), nextApple = rr(...M.apples.every), nextCone = rr(...M.cones.every), petalCool = 0;
  const gustAt = (time, o) => 0.6 + 0.4 * Math.sin(time * 1.6 + o.x * 0.8 + o.z * 0.6) + 0.2 * Math.sin(time * 3.7 + o.z * 1.9);   // the rose's own sway gusts
  function draw(pl, list, fn) {
    if (!pl) return;
    let k = 0;
    list.forEach(it => { if (k >= pl.n) return; pl.m.setMatrixAt(k, fn(it)); pl.m.setColorAt(k, it.tint); pl.fade.array[k] = it.fadeNow; k++; });
    pl.m.count = k; pl.m.visible = k > 0; pl.m.instanceMatrix.needsUpdate = true; if (pl.m.instanceColor) pl.m.instanceColor.needsUpdate = true; pl.fade.needsUpdate = true;
  }
  const rollerMatrix = a => m4.compose(a.p, a.q, a.s);
  const KIND = { apples: 'apple', cones: 'cone', petals: 'petal' };
  return {
    stats, log, items,
    /** Drop an apple or a cone now (for testing). */
    drop: kind => spawnRoller(kind, t),
    /** The season (world/seasons.js). */
    setSeason(s) { season = s; },
    /** What lies on the ground and can be picked up (app/items.js): apples and cones at rest, landed petals. */
    loose() {
      const out = [];
      for (const k of ['apples', 'cones']) for (const a of items[k]) if (a.rest && !a.gone) out.push({ kind: KIND[k], p: a.p, obj: a, list: k });
      for (const pt of items.petals) if (pt.landed) out.push({ kind: 'petal', p: pt.p, obj: pt, list: 'petals' });
      return out;
    },
    /** Take one of them away (picked up). */
    take(it) { items[it.list] = items[it.list].filter(x => x !== it.obj); },
    /** The plot's own instanced parts, for picking straight off the tree / from under it. */
    parts: { appleIM, coneIM, groundPetals },
    update(dt) {
      if (!on.apple && !on.spruce && !on.rose) { for (const k in P) if (P[k]) P[k].m.visible = false; return; }
      t += dt;
      if (on.apple) {
        if ((nextLeaf -= dt) <= 0) { if (season !== 'winter') spawnLeaf(t); nextLeaf = rr(...M.leaves.every) / (season === 'autumn' ? 4 : 1); }
        if ((nextApple -= dt) <= 0) { if (season === 'summer' || season === 'autumn') spawnRoller('apples', t); nextApple = rr(...M.apples.every); }
        for (const l of items.leaves) { l.m = stepLeaf(l, dt).clone(); l.fadeNow = l.landed ? Math.min(1, (M.leaves.lie - l.age) / M.leaves.fade) : 1; }
        const before = items.leaves.length; items.leaves = items.leaves.filter(l => !l.landed || l.age < M.leaves.lie);
        if (items.leaves.length < before) say(t, 'a lying leaf has faded out');
        items.leaves.forEach(l => { if (l.landed && !l.said) { l.said = true; say(t, `the leaf lands ${H(l.p.x, l.p.z) < WATER_Y ? 'on the pond' : 'on the ground'} (${l.p.x.toFixed(1)}, ${l.p.z.toFixed(1)})`); } });
        draw(P.leaves, items.leaves, l => l.m);
      } else if (P.leaves) P.leaves.m.visible = false;
      for (const [kind, band] of [['apples', on.apple], ['cones', on.spruce]]) {
        if (!band || !P[kind]) { if (P[kind]) P[kind].m.visible = false; continue; }
        if (kind === 'cones' && (nextCone -= dt) <= 0) { spawnRoller('cones', t); nextCone = rr(...M.cones.every); }
        for (const a of items[kind]) {
          const was = a.rest; stepRoller(a, M[kind], dt);
          if (a.rest && !was) say(t, `the ${kind === 'apples' ? 'apple' : 'cone'} comes to rest at (${a.p.x.toFixed(1)}, ${a.p.z.toFixed(1)}), ${a.bounces} bounce(s)`);
          a.fadeNow = a.gone ? (a.fade = Math.max(0, a.fade - dt / 1.5)) : 1;
        }
        items[kind] = items[kind].filter(a => !a.gone || a.fade > 0);
        draw(P[kind], items[kind], rollerMatrix);
      }
      if (on.rose) {
        petalCool -= dt;
        // wind x the rose's own gust (its sway): windy weather only
        if (U.uWind.value * gustAt(U.uTime.value, roseBase) > M.petals.gust && petalCool <= 0) { spawnPetals(t); petalCool = M.petals.cooldown; }
        for (const pt of items.petals) { pt.m = stepPetal(pt, dt).clone(); pt.fadeNow = pt.landed ? Math.min(1, (pt.life - pt.age) / M.petals.fade) : 1; }
        items.petals = items.petals.filter(pt => !pt.landed || pt.age < pt.life);
        draw(P.petals, items.petals, pt => pt.m);
      } else if (P.petals) P.petals.m.visible = false;
      stats.leaves = items.leaves.length; stats.apples = items.apples.length; stats.cones = items.cones.length; stats.petals = items.petals.length;
    },
  };
}
