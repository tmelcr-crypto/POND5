import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr } from '../../core/random.js';
import { clamp, smooth, lin } from '../../core/math.js';
import { fbm2 } from '../../core/noise.js';
import { U } from '../../core/uniforms.js';
import { THIN } from '../../core/shaderPatches.js';
import { WATER_Y, houseRectDist, inRocks, inRose, inSteps, CON, APP, H, H0, streamDist } from '../../world/layout.js';

/**
 * Instanced grass blades (up to 64k) with GPU wind sway. Avoids the pond, cabin, rocks and rose bush.
 */
export function createGrass(ctx) {
  const { scene } = ctx;
  {
    const N = isTouch ? 30000 : 64000;
    const bg = new THREE.InstancedBufferGeometry();
    const levels = [0, 0.3, 0.58, 0.82], widths = [1, 0.84, 0.6, 0.32];
    const bp = [], buv = [], bn = [], bi = [];
    levels.forEach((y, l) => { const w = widths[l] * 0.5, z = y * y * 0.32; bp.push(-w, y, z, w, y, z); buv.push(0, y, 1, y); bn.push(0, 0, 1, 0, 0, 1); });
    bp.push(0, 1, 0.34); buv.push(0.5, 1); bn.push(0, 0, 1);
    for (let l = 0; l < 3; l++) { const a = 2 * l, b = a + 1, c = a + 2, d = a + 3; bi.push(a, b, c, b, d, c); }
    bi.push(6, 7, 8);
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
    bg.setIndex(bi);
    const off = new Float32Array(N * 4), scl = new Float32Array(N * 3), tint = new Float32Array(N * 3);
    const tA = lin(0x3c6a1e), tB = lin(0x7ea03a), tDry = lin(0xa59f52), tc = new THREE.Color();
    let n = 0, tries = 0;
    while (n < N && tries < N * 8) {
      tries++;
      const x = rr(-4.985, 4.985), z = rr(-4.985, 4.985), h = H0(x, z), above = h - WATER_Y;   // decisions on the uncarved ground: the same random draws as before the stream
      if (above < 0.02) continue;
      if (houseRectDist(x, z) < 0.1 || inSteps(x, z) || inRocks(x, z, -0.08) || inRose(x, z, 0.14)) continue;
      let p = smooth(0.02, 0.1, above);
      const dc = Math.hypot(x - CON.x, z - CON.z), da = Math.hypot(x - APP.x, z - APP.z);
      p *= 0.3 + 0.7 * smooth(0.3, 1.9, dc); p *= smooth(0.12, 0.45, da);
      const patch = fbm2(x * 0.9 + 4, z * 0.9 - 2);
      p *= 0.7 + 0.3 * (patch + 0.5);
      if (rng() > p) continue;
      const tall = (0.16 + 0.27 * rng()) * (0.75 + 0.55 * clamp(patch + 0.5)) * (0.6 + 0.4 * smooth(0.02, 0.2, above)) * (0.65 + 0.35 * smooth(0.5, 1.8, dc));
      off[n * 4] = x; off[n * 4 + 1] = H(x, z) - 0.01; off[n * 4 + 2] = z; off[n * 4 + 3] = rng() * Math.PI * 2;
      scl[n * 3] = rr(0.03, 0.058); scl[n * 3 + 1] = streamDist(x, z) < 0.12 ? 0 : tall; scl[n * 3 + 2] = rr(0.3, 1.3);   // (none in the stream)
      tc.copy(tA).lerp(tB, clamp(rng() * 0.8 + patch * 0.6 + 0.2)); if (rng() < 0.07) tc.lerp(tDry, 0.7);
      tc.multiplyScalar(0.85 + rng() * 0.3);
      tint[n * 3] = tc.r; tint[n * 3 + 1] = tc.g; tint[n * 3 + 2] = tc.b;
      n++;
    }
    bg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    bg.setAttribute('aScl', new THREE.InstancedBufferAttribute(scl, 3));
    bg.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    bg.instanceCount = n;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.7 });
    m.onBeforeCompile = s => {
      s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uWindDir = U.uWindDir; s.uniforms.uViewPos = THIN.uViewPos; s.uniforms.uFade = THIN.uFade;
      s.vertexShader = `attribute vec4 aOff; attribute vec3 aScl; attribute vec3 aTint;
        uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform vec3 uViewPos; uniform vec2 uFade; varying float vTreeD;
        float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        ` + s.vertexShader
        .replace('#include <color_vertex>', 'vColor = aTint * mix(0.26, 1.0, uv.y);')
        .replace('#include <beginnormal_vertex>', `
          float cr = cos(aOff.w), sr = sin(aOff.w);
          vec3 objectNormal = normalize(vec3(sr, 0.0, cr)*0.35 + vec3(0.0, 1.0, 0.0));`)
        .replace('#include <begin_vertex>', `
          vec3 p = position; float hf = uv.y;
          p.x *= aScl.x; p.y *= aScl.y; p.z *= aScl.y * aScl.z;
          p = vec3(cr*p.x + sr*p.z, p.y, -sr*p.x + cr*p.z);
          vec2 wpos = aOff.xz; float t = uTime; float rnd = gh(wpos);
          float gust = 0.55 + 0.45*sin(dot(wpos, uWindDir)*0.9 - t*1.7) + 0.22*sin(wpos.x*2.3 + wpos.y*1.7 + t*3.1 + rnd*6.28);
          float bend = uWind * gust * hf * hf;
          vec2 sway = uWindDir * bend * aScl.y * 0.6 + vec2(sin(t*2.7 + rnd*20.0), cos(t*2.3 + rnd*31.0)) * 0.012 * (0.3 + uWind) * hf;
          p.xz += sway;
          p.y -= dot(sway, sway) / max(aScl.y, 0.05) * 0.55;
          vec3 transformed = p + aOff.xyz;
          vTreeD = distance(aOff.xyz, uViewPos);                       // distance fade, as the island's small things
          if (vTreeD > uFade.y) transformed = aOff.xyz;`);
      s.fragmentShader = 'uniform vec2 uFade; varying float vTreeD;\n' + s.fragmentShader.replace('void main() {', `void main() {
        if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < smoothstep(uFade.x, uFade.y, vTreeD)) discard;`).replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);').replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.directSpecular *= 0.12; reflectedLight.indirectSpecular *= 0.12;');
    };
    const mesh = new THREE.Mesh(bg, m); mesh.frustumCulled = false; mesh.receiveShadow = true; scene.add(mesh);
  }
}
