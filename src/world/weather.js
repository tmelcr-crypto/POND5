import * as THREE from 'three';
import { isTouch } from '../core/env.js';
import { U } from '../core/uniforms.js';
import { canvasTex } from '../core/canvasTexture.js';
import { H, APP } from './layout.js';

/**
 * The season's weather (world/seasons.js), each one Points draw: in winter snow falls in a box that follows the
 * camera, drifting with the wind; in autumn leaves (yellow, orange, red) and in spring white-pink blossom petals come
 * off the apple trees near you (the plot's and the island's, within WEATHER.near m) and flutter down to the ground.
 * Summer has none. Rain (setRain, world/skyWeather.js) falls as short streaks round the camera, slanted by the wind, as
 * many as it rains hard; in winter it snows harder instead. Every number is in WEATHER.
 */
export const WEATHER = {
  snow: { count: isTouch ? 900 : 1600, box: [26, 12, 26], fall: [0.55, 1.0], size: 0.05, drift: 0.8 },
  leaves: { count: 140, near: 25, fall: [0.3, 0.55], flutter: 0.35, size: 0.075, every: 0.09 },
  rain: { count: isTouch ? 1100 : 2000, box: [22, 14, 22], fall: [8, 10.5], length: 0.28 },   // streaks while it rains (world/skyWeather.js)
};

export function createWeather(ctx, { apples = [] } = {}) {
  const { scene, camera, tex } = ctx, W = WEATHER, rr = (a, b) => a + (b - a) * Math.random();
  const trees = [{ x: APP.x, z: APP.z, y: H(APP.x, APP.z), s: 1 }].concat(apples.map(t => ({ x: t.x, z: t.z, y: t.y, s: t.s })));

  /* ---- snow ---- */
  const S = W.snow, sPos = new Float32Array(S.count * 3), sFall = new Float32Array(S.count), sPh = new Float32Array(S.count);
  for (let i = 0; i < S.count; i++) { sPos[i * 3] = rr(0, S.box[0]); sPos[i * 3 + 1] = rr(0, S.box[1]); sPos[i * 3 + 2] = rr(0, S.box[2]); sFall[i] = rr(...S.fall); sPh[i] = rr(0, 6.28); }
  const sGeo = new THREE.BufferGeometry(), sDraw = new Float32Array(S.count * 3); sGeo.setAttribute('position', new THREE.BufferAttribute(sDraw, 3));
  const snow = new THREE.Points(sGeo, new THREE.PointsMaterial({ map: tex.softDot, color: 0xf4f7ff, size: S.size, transparent: true, opacity: 0.9, depthWrite: false }));
  snow.frustumCulled = false; snow.visible = false; scene.add(snow);

  /* ---- leaves / blossom ---- */
  const leafTex = canvasTex(64, 64, g => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(56, 20, 52, 50, 32, 60); g.bezierCurveTo(12, 50, 8, 20, 32, 4); g.fill(); });
  const L = W.leaves, lPos = new Float32Array(L.count * 3).fill(-50), lCol = new Float32Array(L.count * 3), lv = Array.from({ length: L.count }, () => ({ on: false }));
  const lGeo = new THREE.BufferGeometry(); lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3)); lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
  const leaves = new THREE.Points(lGeo, new THREE.PointsMaterial({ map: leafTex, vertexColors: true, size: L.size, alphaTest: 0.4, transparent: false }));
  leaves.frustumCulled = false; leaves.visible = false; scene.add(leaves);

  /* ---- rain: streaks in a box that wraps round the camera ---- */
  const RN = W.rain, rPos = new Float32Array(RN.count * 3), rFall = new Float32Array(RN.count), rDraw = new Float32Array(RN.count * 6);
  for (let i = 0; i < RN.count; i++) { rPos[i * 3] = rr(0, RN.box[0]); rPos[i * 3 + 1] = rr(0, RN.box[1]); rPos[i * 3 + 2] = rr(0, RN.box[2]); rFall[i] = rr(...RN.fall); }
  const rGeo = new THREE.BufferGeometry(); rGeo.setAttribute('position', new THREE.BufferAttribute(rDraw, 3));
  const rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: 0xc9d4de, transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  let wet = 0;
  let season = 'summer', spawn = 0;
  const cam = new THREE.Vector3();
  return {
    /** How hard it rains, 0..1 (world/skyWeather.js); in winter the snow thickens instead. */
    setRain(k) { wet = k; rain.visible = k > 0.01 && season !== 'winter'; rGeo.setDrawRange(0, Math.floor(RN.count * k) * 2); sGeo.setDrawRange(0, season === 'winter' ? Math.floor(S.count * (0.45 + 0.55 * k)) : S.count); },
    setSeason(s) { season = s; snow.visible = s === 'winter'; leaves.visible = s === 'autumn' || s === 'spring'; lv.forEach(p => { p.on = false; }); lPos.fill(-50); lGeo.attributes.position.needsUpdate = true; this.setRain(wet); },
    update(dt, t) {
      cam.copy(camera.position); const wd = U.uWindDir.value, ws = U.uWind.value;
      if (rain.visible) {   // streaks slanted by the wind
        const sx = wd.x * ws * 2.2, sz = wd.y * ws * 2.2, n = Math.floor(RN.count * wet);
        for (let i = 0; i < n; i++) {
          const k = i * 3; rPos[k] += sx * dt; rPos[k + 2] += sz * dt; rPos[k + 1] -= rFall[i] * dt;
          const x = ((rPos[k] - cam.x) % RN.box[0] + RN.box[0]) % RN.box[0] - RN.box[0] / 2, y = ((rPos[k + 1] - cam.y) % RN.box[1] + RN.box[1]) % RN.box[1] - RN.box[1] * 0.4, z = ((rPos[k + 2] - cam.z) % RN.box[2] + RN.box[2]) % RN.box[2] - RN.box[2] / 2;
          const o = i * 6, l = RN.length / rFall[i];
          rDraw[o] = cam.x + x; rDraw[o + 1] = cam.y + y; rDraw[o + 2] = cam.z + z; rDraw[o + 3] = cam.x + x - sx * l; rDraw[o + 4] = cam.y + y + rFall[i] * l; rDraw[o + 5] = cam.z + z - sz * l;
        }
        rGeo.attributes.position.needsUpdate = true;
      }
      if (season === 'winter') {
        for (let i = 0; i < S.count; i++) {   // each flake keeps its place in a box that wraps round the camera
          const k = i * 3;
          sPos[k] += (wd.x * ws * S.drift + Math.sin(t * 0.8 + sPh[i]) * 0.15) * dt; sPos[k + 2] += (wd.y * ws * S.drift + Math.cos(t * 0.7 + sPh[i]) * 0.15) * dt; sPos[k + 1] -= sFall[i] * dt;
          const x = ((sPos[k] - cam.x) % S.box[0] + S.box[0]) % S.box[0] - S.box[0] / 2, y = ((sPos[k + 1] - cam.y) % S.box[1] + S.box[1]) % S.box[1] - S.box[1] * 0.35, z = ((sPos[k + 2] - cam.z) % S.box[2] + S.box[2]) % S.box[2] - S.box[2] / 2;
          sDraw[k] = cam.x + x; sDraw[k + 1] = cam.y + y; sDraw[k + 2] = cam.z + z;
        }
        sGeo.attributes.position.needsUpdate = true;
      } else if (season === 'autumn' || season === 'spring') {
        if ((spawn -= dt) <= 0) {   // a new one off a tree near you
          spawn = L.every * (season === 'spring' ? 1.6 : 1);
          const near = trees.filter(tr => Math.hypot(tr.x - cam.x, tr.z - cam.z) < L.near), p = near.length && lv.find(q => !q.on);
          if (p) {
            const tr = near[Math.floor(Math.random() * near.length)], a = rr(0, 6.28), r = rr(0.3, 1.6) * tr.s;
            Object.assign(p, { on: true, x: tr.x + Math.cos(a) * r, y: tr.y + rr(1.4, 2.6) * tr.s, z: tr.z + Math.sin(a) * r, fall: rr(...L.fall), ph: rr(0, 6.28), rest: 0 });
            const i = lv.indexOf(p), c = season === 'spring' ? [0.95, rr(0.66, 0.86), rr(0.72, 0.86)] : [rr(0.6, 0.85), rr(0.12, 0.5), 0.03];
            lCol.set(c, i * 3); lGeo.attributes.color.needsUpdate = true;
          }
        }
        lv.forEach((p, i) => {
          if (!p.on) return;
          const g = H(p.x, p.z) + 0.01;
          if (p.y > g) { p.ph += dt; p.x += (wd.x * ws * 0.6 + Math.sin(p.ph * 2.3) * L.flutter) * dt; p.z += (wd.y * ws * 0.6 + Math.cos(p.ph * 1.9) * L.flutter) * dt; p.y = Math.max(g, p.y - p.fall * (0.7 + 0.6 * Math.abs(Math.sin(p.ph * 3.1))) * dt); }
          else if ((p.rest += dt) > 6) { p.on = false; p.y = -50; }   // lies a moment, then gone
          lPos[i * 3] = p.x; lPos[i * 3 + 1] = p.y; lPos[i * 3 + 2] = p.z;
        });
        lGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
