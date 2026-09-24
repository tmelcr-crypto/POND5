import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { U } from '../core/uniforms.js';
import { hash2 } from '../core/noise.js';
import { canvasTex } from '../core/canvasTexture.js';
import { smooth } from '../core/math.js';
import { LAKE, WATER_Y, SEA_Y } from './layout.js';

/**
 * Time-of-day atmosphere: haze (the fog density follows the hour), morning mist over the pond and the sea, shooting
 * stars at night and moths at the lit cabin windows. The hour comes from the time-of-day clock, day and night from
 * the sky's night value; mist and moths run only on their detail-manager bands. Every number is in ATMO.
 */
export const ATMO = {
  // fog density = CONFIG.fog.density x (1 + the bumps below): [peak hour, width (h), extra]; smooth, wraps midnight
  haze: [[6, 1.5, 1.0], [20, 1.6, 0.3], [1, 4, 0.15]],
  mist: {
    hours: [5, 5.7, 7.5, 9],        // fades in from [0] to [1], burns off from [2] to [3]
    opacity: 0.3,
    above: [0.3, 1.2],              // a layer fades out as the eye comes down to within [1]..[0] m above it (no mist ceiling)
    drift: 0.35,                    // m/s with the wind
    pond: { size: 8, heights: [0.12, 0.4], band: 40, scale: 0.09 },
    sea: { radius: [26, 80], heights: [0.3, 0.8], band: 30, depth: [0.4, 2.5], scale: 0.011 },   // over water deeper than depth[0]..[1] m
  },
  stars: { every: [40, 90], life: [0.4, 0.9], night: 0.85, elevation: [30, 70], length: [5, 15], distance: 120, brightness: 0.9 },
  moths: { count: 8, night: 0.5, band: 25, reach: [0.06, 0.45], size: 0.045 },
};
const rr = (a, b) => a + (b - a) * Math.random();
const wrapDist = (a, b) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d); };

/** Fog multiplier for an hour (1 at midday, the minimum). */
export function hazeAt(h) { return 1 + ATMO.haze.reduce((s, [c, w, k]) => s + k * Math.exp(-((wrapDist(h, c) / w) ** 2)), 0); }

/**
 * createAtmosphere(ctx): ctx needs scene, camera, detail, skyUniforms, clock (time of day), cabin and ground (the
 * world ground texture, for the water depth under the sea mist). Returns update(dt) and stats.
 */
export function createAtmosphere(ctx) {
  const { scene, camera, detail, skyUniforms, clock, cabin, ground } = ctx, A = ATMO, V3 = THREE.Vector3;
  const stats = { fog: 0, mist: 0, star: false, moths: 0 };

  /* ---- morning mist: soft noise layers, faded at their edges (pond) or over land (sea) ---- */
  const N = 128, P = 4;   // tileable value noise, P cells across, 3 octaves
  const mistTex = canvasTex(N, N, g => {
    const img = g.createImageData(N, N), sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, a = 0.55;
      for (let o = 0, p = P; o < 3; o++, p *= 2, a *= 0.5) {
        const fx = x / N * p, fy = y / N * p, xi = Math.floor(fx), yi = Math.floor(fy), u = sm(fx - xi), w = sm(fy - yi);
        const h = (i, j) => hash2((xi + i) % p + o * 97, (yi + j) % p + o * 53);
        v += a * (h(0, 0) + (h(1, 0) - h(0, 0)) * u + (h(0, 1) + (h(1, 1) - h(0, 1)) * u - h(0, 0) - (h(1, 0) - h(0, 0)) * u) * w);
      }
      const k = (y * N + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * sm(Math.min(1, Math.max(0, (v - 0.15) / 0.8))));   // soft, low contrast
    }
    g.putImageData(img, 0, 0);
  }, false);
  mistTex.wrapS = mistTex.wrapT = THREE.RepeatWrapping;
  const mistU = { uMistCol: { value: new THREE.Color() }, uMistA: { value: 0 }, uMistOff: { value: new THREE.Vector2() }, uMistAbove: { value: new THREE.Vector2(...A.mist.above) } };
  function mistMaterial(sea, layer) {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.onBeforeCompile = s => {
      Object.assign(s.uniforms, mistU, { tMist: { value: mistTex }, uGround: { value: ground.tex }, uGroundST: { value: new THREE.Vector2(ground.scale, ground.offset) }, uSea: { value: SEA_Y } });
      s.vertexShader = 'varying vec3 vMW; varying vec2 vMU;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMU = uv; vMW = (modelMatrix * vec4(position, 1.0)).xyz;');
      s.fragmentShader = `varying vec3 vMW; varying vec2 vMU; uniform sampler2D tMist; uniform sampler2D uGround; uniform vec2 uGroundST; uniform float uSea;
        uniform vec3 uMistCol; uniform float uMistA; uniform vec2 uMistOff; uniform vec2 uMistAbove;\n` + s.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec2 mp = vMW.xz * ${(sea ? A.mist.sea.scale : A.mist.pond.scale).toFixed(3)} + uMistOff * ${(1 + layer * 0.35).toFixed(2)} + vec2(${(layer * 0.37).toFixed(2)}, ${(layer * 0.61).toFixed(2)});
        float n = texture2D(tMist, mp).a * smoothstep(uMistAbove.x, uMistAbove.y, cameraPosition.y - vMW.y);
        ${sea
          ? `float dep = uSea - texture2D(uGround, (vMW.xz + uGroundST.y) * uGroundST.x).r;
             float edge = smoothstep(${A.mist.sea.depth[0].toFixed(2)}, ${A.mist.sea.depth[1].toFixed(2)}, dep);`
          : 'float edge = 1.0 - smoothstep(0.55, 1.0, length(vMU - 0.5) * 2.0);'}
        vec4 diffuseColor = vec4(uMistCol, n * edge * uMistA);
        if (diffuseColor.a < 0.003) discard;`);
    };
    return m;
  }
  const mist = [];
  A.mist.pond.heights.forEach((h, i) => {
    const g = new THREE.PlaneGeometry(A.mist.pond.size, A.mist.pond.size); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mistMaterial(false, i)); m.position.set(LAKE.x, WATER_Y + h, LAKE.z); m.userData.pond = true; mist.push(m);
  });
  A.mist.sea.heights.forEach((h, i) => {
    const g = new THREE.RingGeometry(A.mist.sea.radius[0], A.mist.sea.radius[1], 96, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mistMaterial(true, i + 2)); m.position.y = SEA_Y + h; mist.push(m);
  });
  mist.forEach((m, i) => { m.renderOrder = 4 + i; m.frustumCulled = false; m.visible = false; scene.add(m); });

  /* ---- shooting stars: one additive streak on the sky, head bright, tail fading ---- */
  const starTex = canvasTex(128, 8, g => {
    const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(225,235,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 8); const v = g.createLinearGradient(0, 0, 0, 8); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 128, 8);
  });
  const starMat = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0, side: THREE.DoubleSide });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), starMat); star.frustumCulled = false; star.visible = false; star.renderOrder = 2; scene.add(star);
  const S = A.stars; let nextStar = rr(...S.every) * 0.3, starT = -1, starLife = 1;
  const sDir = new V3(), sTan = new V3(), sSide = new V3(), sLen = { v: 10 };
  function launch() {
    const el = THREE.MathUtils.degToRad(rr(...S.elevation)), az = rr(0, 6.2832);
    sDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const down = new V3(0, -1, 0).addScaledVector(sDir, sDir.y).normalize(), across = new V3().crossVectors(sDir, down).normalize();
    sTan.copy(down).multiplyScalar(rr(0.3, 0.8)).addScaledVector(across, Math.random() < 0.5 ? -1 : 1).normalize();   // falling, slanted
    sSide.crossVectors(sDir, sTan).normalize();
    sLen.v = S.distance * Math.tan(THREE.MathUtils.degToRad(rr(...S.length)));
    starT = 0; starLife = rr(...S.life); star.visible = true;
  }
  const Mb = new THREE.Matrix4(), pos = new V3();

  /* ---- moths: small soft points around the lit windows ---- */
  const MO = A.moths, wins = (cabin && cabin.windows || []).map(w => ({ c: cabin.group.localToWorld(w.c.clone()), n: w.n.clone(), w: w.w, h: w.h }));
  const dot = canvasTex(32, 32, g => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,245,225,0.6)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  const mothGeo = new THREE.BufferGeometry(), mothPos = new Float32Array(MO.count * 3); mothGeo.setAttribute('position', new THREE.BufferAttribute(mothPos, 3));
  const moths = new THREE.Points(mothGeo, new THREE.PointsMaterial({ size: MO.size, map: dot, color: 0xf2e6cf, transparent: true, depthWrite: false }));
  moths.frustumCulled = false; moths.visible = false; scene.add(moths);
  const flock = Array.from({ length: MO.count }, (_, i) => ({ win: wins.length ? i % wins.length : 0, ph: rr(0, 100), sp: rr(0.8, 1.4), u: rr(-0.4, 0.4), v: rr(-0.4, 0.4) }));

  /* ---- bands ---- */
  const on = { pond: true, sea: true, moths: true };
  if (detail) {
    const V = camera.position.constructor;
    detail.band('pond mist', { min: new V(LAKE.x - 4, WATER_Y, LAKE.z - 4), max: new V(LAKE.x + 4, WATER_Y + 1, LAKE.z + 4) }, A.mist.pond.band, b => { on.pond = b; });
    detail.band('sea mist', { min: new V(-50, SEA_Y, -50), max: new V(50, SEA_Y + 3, 50) }, A.mist.sea.band, b => { on.sea = b; });
    if (wins.length) { const bx = new THREE.Box3(); wins.forEach(w => bx.expandByPoint(w.c)); detail.band('moths', { min: bx.min, max: bx.max }, MO.band, b => { on.moths = b; }); }
  }

  let t = 0;
  const sunC = new THREE.Color();
  return {
    stats, mist, star, moths,
    update(dt) {
      t += dt;
      const h = clock.hours, night = skyUniforms.uNight.value;
      // haze
      if (scene.fog) { scene.fog.density = CONFIG.fog.density * hazeAt(h); stats.fog = scene.fog.density; }
      // mist
      const MH = A.mist.hours, env = smooth(MH[0], MH[1], h) * (1 - smooth(MH[2], MH[3], h));
      stats.mist = env;
      let any = false;
      for (const m of mist) { m.visible = env > 0.002 && (m.userData.pond ? on.pond : on.sea); any = any || m.visible; }
      if (any) {
        mistU.uMistA.value = A.mist.opacity * env;
        sunC.copy(skyUniforms.uSunCol.value); mistU.uMistCol.value.copy(skyUniforms.uHorizon.value).multiplyScalar(1.15).lerp(sunC, 0.25);
        const d = A.mist.drift * dt * (0.4 + U.uWind.value); mistU.uMistOff.value.x -= U.uWindDir.value.x * d * 0.018; mistU.uMistOff.value.y -= U.uWindDir.value.y * d * 0.018;
      }
      // shooting stars
      if (starT >= 0) {
        starT += dt; const k = starT / starLife;
        if (k >= 1 || night < S.night * 0.9) { starT = -1; star.visible = false; }
        else {
          pos.copy(camera.position).addScaledVector(sDir, S.distance).addScaledVector(sTan, sLen.v * (k - 0.5) * 1.2);
          Mb.makeBasis(sTan.clone().multiplyScalar(sLen.v), sSide.clone().multiplyScalar(0.18 + 0.1 * (1 - k)), sDir).setPosition(pos);
          star.matrixAutoUpdate = false; star.matrix.copy(Mb); star.matrixWorldNeedsUpdate = true;
          starMat.opacity = S.brightness * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (night - S.night) / (1 - S.night);
        }
      }
      if (night > S.night && starT < 0) { nextStar -= dt; if (nextStar <= 0) { launch(); nextStar = rr(...S.every); } }
      stats.star = star.visible;
      // moths
      const mothsOn = wins.length && on.moths && cabin.lightsOn && night > MO.night;
      moths.visible = !!mothsOn; stats.moths = mothsOn ? MO.count : 0;
      if (mothsOn) {
        flock.forEach((f, i) => {
          const w = wins[f.win], s = t * f.sp + f.ph;
          f.u = Math.max(-0.5, Math.min(0.5, f.u + (Math.sin(s * 3.1) * 0.9 + Math.sin(s * 7.3) * 0.5) * dt));
          f.v = Math.max(-0.5, Math.min(0.5, f.v + (Math.cos(s * 2.7) * 0.9 + Math.sin(s * 8.9) * 0.5) * dt));
          const out = MO.reach[0] + (MO.reach[1] - MO.reach[0]) * Math.abs(Math.sin(s * 1.3 + Math.sin(s * 4.1)));   // darting at the glass and back
          const side = new V3(w.n.z, 0, -w.n.x);
          pos.copy(w.c).addScaledVector(w.n, out).addScaledVector(side, f.u * w.w * 1.2).add(new V3(0, f.v * w.h * 1.2 + 0.015 * Math.sin(s * 23), 0));
          pos.toArray(mothPos, i * 3);
        });
        mothGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
