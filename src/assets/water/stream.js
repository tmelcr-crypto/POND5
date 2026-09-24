import * as THREE from 'three';
import { U } from '../../core/uniforms.js';
import { V, UPV, clamp, lin } from '../../core/math.js';
import { vnoise2 } from '../../core/noise.js';
import { addWorldSway, addFlutter } from '../../core/shaderPatches.js';
import { fernTexture, fernGeometry } from '../rocks/rockOutcrop.js';
import { CONFIG } from '../../config.js';
import { STREAM, LAKE, SEA_Y, H, lakeD, houseRectDist, coastDist, bridgeDist, footpathDist } from '../../world/layout.js';

/**
 * The stream from the pond to the sea (course, water level and carving: STREAM in world/layout.js): one water ribbon
 * that follows the course at the water level W(s), flowing faster and foaming over the rapids, clear and still in the
 * pools, fading in where it leaves the pond and out where it meets the sea; rocks in the rapids and pebbles along the
 * banks (one instanced mesh), and taller plants in patches along both banks that half hide them: sedge clumps from the
 * water's edge up the bank, cattails at the edge of the calm pools, ferns on the bank tops (instanced, one mesh per
 * kind and stretch of the stream so each stretch is culled on its own). Its own random numbers, so the seeded build is
 * unchanged. Every number is in STREAM_LOOK.
 */
export const STREAM_LOOK = {
  across: 8,                  // ribbon vertices across
  spill: 1.2,                 // the ribbon reaches this far past the water's edge, under the banks
  speed: [0.25, 7],           // flow speed m/s = [0] + [1] * slope
  foamSlope: [0.025, 0.08],   // foam from this slope .. full at this
  rocks: { perRapid: 5, size: [0.1, 0.28] },
  pebbles: { count: 320, size: [0.025, 0.07] },
  fadeIn: [0.25, 0.6],        // s (m) over which the stream takes over from the pond's water sheet (pond.js fades out there)
  pondLook: [0.6, 3.5],       // s (m) over which its colour turns from the pond's to its own
  banks: {
    step: 0.13,                 // m along each bank between candidate spots
    patch: [-0.05, 0.45],       // patch noise: bare below .. fully planted above
    sedge: { reach: [-0.1, 0.85], height: [0.6, 1.15], blades: 20 },   // reach: from the water's edge up the bank (m)
    cattail: { chance: 0.12, maxSlope: 0.02, height: [0.8, 1.35] },
    fern: { chance: 0.14, reach: [0.6, 1.5], length: [0.35, 0.6] },
    clear: { bridge: 0.25, path: 0.6, house: 0.5, pond: 1.2 },   // keep off the bridge and path, the cabin, the pond
    stretch: 8,                 // m of stream per mesh (culling)
  },
};

export function createStream(ctx) {
  const { scene } = ctx, S = STREAM, P = S.pts, L = STREAM_LOOK;
  let seed = 911; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();

  /* ---- the water ribbon: from inside the pond (it cross-fades with the pond's sheet at the outlet) to a little way into the sea ---- */
  const k0 = 0, smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let k1 = P.findIndex((p, k) => k > k0 && p.W <= SEA_Y + 0.03); if (k1 < 0) k1 = P.length - 1;   // ends where it reaches the sea's level
  const n = k1 - k0 + 1, A = L.across, pos = [], flow = [], extra = [], idx = [];
  let tau = 0;   // travel time along the stream: the ripples advance by it, so they run at each place's own speed
  for (let k = k0; k <= k1; k++) {
    const p = P[k], sp = L.speed[0] + L.speed[1] * Math.max(0, p.slope);
    if (k > k0) tau += (p.s - P[k - 1].s) / sp;
    const nx = -p.tz, nz = p.tx, fadeIn = smooth(L.fadeIn[0], L.fadeIn[1], p.s), fadeOut = Math.min(1, (k1 - k) / 14);
    for (let a = 0; a < A; a++) {
      const t = (a / (A - 1) * 2 - 1) * L.spill, x = p.x + nx * t * p.w, z = p.z + nz * t * p.w;
      pos.push(x, p.W, z); flow.push(tau, t, 1 - smooth(L.pondLook[0], L.pondLook[1], p.s)); extra.push(p.W - H(x, z), p.slope, Math.min(fadeIn, fadeOut), Math.atan2(p.tz, p.tx));
    }
  }
  for (let k = 0; k < n - 1; k++) for (let a = 0; a < A - 1; a++) { const i = k * A + a; idx.push(i, i + 1, i + A, i + 1, i + A + 1, i + A); }   // facing up
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3)); g.setAttribute('aX', new THREE.Float32BufferAttribute(extra, 4));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const F = L.foamSlope;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.2 });   // no depth: the pond draws over its faded start
  m.onBeforeCompile = s => {
    s.uniforms.uTime = U.uTime;
    s.vertexShader = 'attribute vec3 aFlow; attribute vec4 aX; varying vec3 vFlow; varying vec4 vX; varying vec3 vWP;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFlow = aFlow; vX = aX; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = `uniform float uTime; varying vec3 vFlow; varying vec4 vX; varying vec3 vWP;
      float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y); }
      ` + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dep = vX.x, rapid = smoothstep(${F[0].toFixed(3)}, ${F[1].toFixed(3)}, vX.y);
        vec2 fp = vec2((vFlow.x - uTime) * 1.6, vFlow.y * 2.2);          // flowing coordinates
        float lace = smoothstep(0.45, 0.8, 0.6 * sNoise(fp * vec2(1.0, 1.5)) + 0.4 * sNoise(fp * vec2(2.3, 3.1) + 7.1));
        float streak = smoothstep(0.55, 0.9, sNoise(vec2(fp.x * 0.35, vFlow.y * 6.0)));
        float pondLook = vFlow.z;                                        // near the outlet: the pond's colours (pond.js)
        float sh = smoothstep(0.0, mix(0.3, 0.32, pondLook), dep);
        diffuseColor.rgb = mix(mix(vec3(0.13, 0.15, 0.1), vec3(0.16, 0.17, 0.08), pondLook), mix(vec3(0.02, 0.06, 0.065), vec3(0.018, 0.06, 0.058), pondLook), sh);
        float foam = rapid * max(lace, streak * 0.8) + (1.0 - smoothstep(0.0, 0.05, dep)) * 0.35 * lace;   // white water / a little at the edges
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.88, 0.86), clamp(foam, 0.0, 1.0));
        diffuseColor.a = smoothstep(-0.005, 0.03, dep) * mix(mix(0.28, 0.42, pondLook), mix(0.85, 0.93, pondLook), sh) * vX.z;
        diffuseColor.a = max(diffuseColor.a, clamp(foam, 0.0, 1.0) * smoothstep(-0.005, 0.02, dep) * vX.z);
        float streamFoam = foam;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.8, clamp(streamFoam, 0.0, 1.0));')
      .replace('#include <normal_fragment_maps>', `
        float e = 0.08, amp = 0.05 + 0.25 * rapid;
        float n0 = sNoise(fp * 2.0), nx = sNoise((fp + vec2(e, 0.0)) * 2.0), ny = sNoise((fp + vec2(0.0, e)) * 2.0);
        vec2 gr = vec2(nx - n0, ny - n0) / e * amp;                    // ripple slope in (along, across)
        float c = cos(vX.w), sn = sin(vX.w);
        vec3 nW = normalize(vec3(-(gr.x * c - gr.y * sn), 1.0, -(gr.x * sn + gr.y * c)));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
  };
  const water = new THREE.Mesh(g, m); water.renderOrder = 1; water.receiveShadow = true; scene.add(water);   // before the pond, whose faded sheet over the outlet would hide it in the depth buffer

  /* ---- rocks in the rapids, pebbles along the banks (one instanced mesh) ---- */
  const rockGeo = new THREE.IcosahedronGeometry(1, 1); {
    const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(0.8 + 0.35 * Math.abs(Math.sin(v.x * 5.1 + v.y * 3.7 + v.z * 4.3))); p.setXYZ(i, v.x, v.y * 0.7, v.z); }
    rockGeo.computeVertexNormals();
  }
  const list = [];
  const rapids = []; for (let k = 1; k < P.length - 1; k++) if (P[k].slope > F[1] * 0.7 && P[k].slope >= P[k - 1].slope && P[k].slope >= P[k + 1].slope) rapids.push(k);
  for (const k of rapids) for (let i = 0; i < L.rocks.perRapid; i++) {
    const p = P[Math.min(P.length - 1, Math.max(0, k + Math.round(rr(-6, 6))))], t = rr(-0.9, 0.9) * p.w, r = rr(...L.rocks.size);
    const x = p.x - p.tz * t, z = p.z + p.tx * t, y = H(x, z) + r * 0.35;
    list.push([x, y, z, r, rr(0.35, 0.5)]);
  }
  for (let i = 0; i < L.pebbles.count; i++) {
    const p = P[Math.floor(rr(0, P.length))], side = rnd() < 0.5 ? -1 : 1, t = side * (p.w + rr(-0.15, 0.6)), r = rr(...L.pebbles.size);
    const x = p.x - p.tz * t, z = p.z + p.tx * t;
    if (Math.abs(x - LAKE.x) < 2.2 && Math.abs(z - LAKE.z) < 2.2) continue;
    list.push([x, H(x, z) + r * 0.2, z, r, rr(0.45, 0.62)]);
  }
  const stones = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), list.length), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), c = new THREE.Color();
  list.forEach(([x, y, z, r, tone], i) => {
    Q.setFromEuler(E.set(rr(0, 0.4), rr(0, 6.28), rr(0, 0.4))); M4.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(r * rr(0.9, 1.3), r * rr(0.7, 1.0), r * rr(0.8, 1.1)));
    stones.setMatrixAt(i, M4); stones.setColorAt(i, c.copy(lin(0x6f6a60)).multiplyScalar(tone * 1.15).lerp(lin(0x4a5a2a), rnd() < 0.25 ? 0.35 : 0));
  });
  stones.castShadow = stones.receiveShadow = true; scene.add(stones);

  /* ---- bank plants ---- */
  const BK = L.banks, sedges = [], cattails = [], heads = [], ferns = [], stretch = p => Math.floor(p.s / BK.stretch);
  const bladeClump = (() => {   // one clump: blades arching out from the middle, dark at the base, pale at the tips, a few dry
    const pos = [], col = [], nor = [], idx = [], base = lin(0x26401a), tip = lin(0x5f8a30), dry = lin(0x8f8650), c = new THREE.Color();
    for (let b = 0; b < BK.sedge.blades; b++) {
      const a = b / BK.sedge.blades * 6.28 + rr(-0.2, 0.2), lean = rr(0.08, 0.55), h = rr(0.55, 1), wid = rr(0.014, 0.024), droop = rr(0.1, 0.3) * lean * 2, isDry = rnd() < 0.07;
      const ca = Math.cos(a), sa = Math.sin(a), i0 = pos.length / 3;
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, out = Math.sin(lean) * t * h + droop * t * t, y = Math.cos(lean) * t * h - droop * 0.6 * t * t, w = wid * (1 - t * 0.9);
        pos.push(ca * out - sa * w, y, sa * out + ca * w, ca * out + sa * w, y, sa * out - ca * w);
        c.copy(base).lerp(isDry ? dry : tip, Math.pow(t, 0.8)); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        nor.push(ca * 0.3, 1, sa * 0.3, ca * 0.3, 1, sa * 0.3);   // lit like the meadow's blades: mostly from above
        if (k) { const j = i0 + (k - 1) * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
  })();
  const clearOf = (x, z) => bridgeDist(x, z) > BK.clear.bridge && footpathDist(x, z) > BK.clear.path && houseRectDist(x, z) > BK.clear.house && lakeD(x, z) > 1 + BK.clear.pond / 2 && coastDist(x, z) > CONFIG.island.beachWidth * 0.5;
  for (const side of [-1, 1]) for (let s = 0; s < S.len; s += BK.step * rr(0.7, 1.3)) {
    const p = P[Math.min(P.length - 1, Math.round(s / (P[1].s - P[0].s)))], patch = clamp((vnoise2(s * 0.3, side * 7.3) * 0.5 + 0.5 - BK.patch[0]) / (BK.patch[1] - BK.patch[0]));
    if (rnd() > patch) continue;
    const reach = rr(...BK.sedge.reach), t = side * (p.w + reach), x = p.x - p.tz * t, z = p.z + p.tx * t;
    if (!clearOf(x, z)) continue;
    const near = 1 - clamp(reach / BK.sedge.reach[1]), h = rr(...BK.sedge.height) * (0.75 + 0.35 * near) * (0.8 + 0.4 * patch), wd = rr(0.7, 1.1) * h;
    sedges.push([stretch(p), new THREE.Matrix4().compose(new V(x, H(x, z) - 0.03, z), new THREE.Quaternion().setFromAxisAngle(UPV, rr(0, 6.28)), new V(wd, h, wd)), new THREE.Color().setScalar(rr(0.75, 1.0)).lerp(new THREE.Color(1.0, 0.95, 0.7), rr(0, 0.15))]);
    // cattails along the calm pools, at the water's edge
    if (p.slope < BK.cattail.maxSlope && rnd() < BK.cattail.chance * patch) for (let i = 0, nn = 3 + Math.floor(rnd() * 5); i < nn; i++) {
      const tt = side * (p.w + rr(-0.15, 0.1)), dx = rr(-0.25, 0.25), cx = p.x - p.tz * tt + p.tx * dx, cz = p.z + p.tx * tt + p.tz * dx;
      if (!clearOf(cx, cz)) continue;
      const len = rr(...BK.cattail.height), lean = rr(0, 0.12), la = rnd() * 6.28, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(la) * lean, rnd() * 6.28, Math.sin(la) * lean));
      const b = new V(cx, Math.min(H(cx, cz), p.W) - 0.03, cz), w = rr(0.006, 0.011);
      cattails.push([stretch(p), new THREE.Matrix4().compose(b, q, new V(w, len, w))]);
      if (rnd() < 0.5) heads.push([stretch(p), new THREE.Matrix4().compose(b.clone().addScaledVector(new V(0, 1, 0).applyQuaternion(q), len * 0.8), q, new V(0.02, rr(0.12, 0.17), 0.02))]);
    }
    // ferns on the bank tops
    if (rnd() < BK.fern.chance * patch) {
      const tf = side * (p.w + rr(...BK.fern.reach)), fx = p.x - p.tz * tf, fz = p.z + p.tx * tf;
      if (clearOf(fx, fz)) for (let i = 0, nn = 7 + Math.floor(rnd() * 5), sc = rr(0.8, 1.15); i < nn; i++) {
        const a = i / nn * 6.28 + rr(-0.25, 0.25), tilt = rr(0.45, 1.05), len = rr(...BK.fern.length) * sc, d = new V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
        const q = new THREE.Quaternion().setFromUnitVectors(UPV, d).multiply(new THREE.Quaternion().setFromAxisAngle(UPV, rr(-0.3, 0.3) + Math.PI / 2));
        ferns.push([stretch(p), new THREE.Matrix4().compose(new V(fx, H(fx, fz) - 0.01, fz), q, new V(len * 0.42, len, len)), new THREE.Color(rr(0.8, 1.05), rr(0.9, 1.1), rr(0.75, 0.95))]);
      }
    }
  }
  const sedgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0, envMapIntensity: 0.6 }); addWorldSway(sedgeMat, 0.09);
  const reedMat = new THREE.MeshStandardMaterial({ color: lin(0x5f7d34), roughness: 0.7 }); addWorldSway(reedMat, 0.07);
  const headMat = new THREE.MeshStandardMaterial({ color: lin(0x5a3a22), roughness: 0.95 }); addWorldSway(headMat, 0.07);
  const fernTex = fernTexture(rnd), fernMat = new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.6 }); addFlutter(fernMat, 0.012);
  const reedG = new THREE.CylinderGeometry(0.35, 1, 1, 5, 6); reedG.translate(0, 0.5, 0);
  const headG = new THREE.CylinderGeometry(1, 1, 1, 8, 1); headG.translate(0, 0.5, 0);
  const plants = [];
  const plant = (list, geo, mat, shadow, depthMap) => {   // one instanced mesh per stretch of the stream
    const by = new Map(); for (const e of list) (by.get(e[0]) || by.set(e[0], []).get(e[0])).push(e);
    for (const group of by.values()) {
      const im = new THREE.InstancedMesh(geo, mat, group.length); group.forEach(([, m, c], i) => { im.setMatrixAt(i, m); if (c) im.setColorAt(i, c); });
      im.castShadow = shadow; im.receiveShadow = true;
      if (depthMap) im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: depthMap, alphaTest: 0.45 });
      scene.add(im); plants.push(im);
    }
  };
  plant(sedges, bladeClump, sedgeMat, false); plant(cattails, reedG, reedMat, true); plant(heads, headG, headMat, true); plant(ferns, fernGeometry(), fernMat, true, fernTex);

  return { water, stones, plants, stats: { length: +(P[k1].s - P[k0].s).toFixed(1), rapids: rapids.length, rocks: list.length, sedges: sedges.length, cattails: cattails.length, ferns: ferns.length, plantMeshes: plants.length } };
}
