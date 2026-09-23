import * as THREE from 'three';
import { clamp, lin } from '../core/math.js';
import { fbm2 } from '../core/noise.js';
import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';
import { H, HALF, WORLD_HALF, forest, excluded } from './layout.js';

/**
 * Bake the world into a small RGBA half-float texture the grass vertex shader samples:
 * R = terrain height, G = grass density (0 on the plot, under forest, on exclusions, outside the world),
 * B = low-frequency patch noise (blade height / tint variation). 0.25 m per texel.
 */
export function createGroundTexture() {
  const N = 4 * WORLD_HALF * 2 + 1, ext = WORLD_HALF, st = 2 * ext / (N - 1);
  const data = new Uint16Array(N * N * 4), half = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -ext + i * st, z = -ext + j * st, k = (j * N + i) * 4;
    const inWorld = Math.max(Math.abs(x), Math.abs(z)) < WORLD_HALF - 0.5;
    let d = inWorld ? 1 - 0.85 * forest(x, z) : 0;
    if (excluded(x, z, 0) && Math.max(Math.abs(x), Math.abs(z)) > HALF + 1) d *= 0.35; // path, yard: sparser
    data[k] = half(H(x, z)); data[k + 1] = half(clamp(d)); data[k + 2] = half(clamp(fbm2(x * 0.9 + 4, z * 0.9 - 2) + 0.5)); data[k + 3] = half(1);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  // world (x, z) -> uv = (x + offset) * scale
  return { tex, N, ext, st, data, scale: 1 / (2 * ext + st), offset: ext + st / 2 };
}

/** Clump of `blades` blades with `segs` quads each (0 = a single triangle), baked into one geometry. */
function clumpGeometry(blades, segs, seed) {
  const levels = segs === 2 ? [[0, 1], [0.45, 0.72], [0.8, 0.36]] : segs === 1 ? [[0, 1], [0.55, 0.55]] : [[0, 1]];
  const pos = [], uv = [], bl = [], idx = [];
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let b = 0; b < blades; b++) {
    const base = pos.length / 3, a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()), ang = rnd() * Math.PI * 2, rv = rnd();
    const blade = [Math.cos(a) * d, Math.sin(a) * d, ang, rv];
    levels.forEach(([y, w]) => { const z = y * y * 0.32; pos.push(-w * 0.5, y, z, w * 0.5, y, z); uv.push(0, y, 1, y); bl.push(...blade, ...blade); });
    pos.push(0, 1, 0.34); uv.push(0.5, 1); bl.push(...blade);
    for (let l = 0; l < levels.length - 1; l++) { const p = base + 2 * l; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    const t = base + 2 * (levels.length - 1); idx.push(t, t + 1, t + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setIndex(idx);
  return g;
}

/**
 * GPU grass for the world outside the plot (the plot keeps its own 64k-blade grass).
 * Camera-following rings of clumps: each ring is instanced over a fixed grid of cells snapped to the
 * ring's cell size, so blades never swim. Density falls off with distance, d(r) = ((R - r) / (R - r0))^2, and
 * sparser outer rings use wider blades so the coverage stays even; ring seams are dithered.
 * Each ring is split into angular sectors (separate draws sharing one geometry) so frustum culling drops the
 * ones behind the camera. Nothing is rebuilt on the CPU per frame: update() only moves uniforms and bounding spheres.
 */
const SECTORS = 12, bs0 = new THREE.Vector3();

export function createWorldGrass(ctx, ground) {
  const { scene } = ctx;
  const G = CONFIG.grass;
  const rings = [];
  const cap0 = G.rings[0][3] / (G.rings[0][2] * G.rings[0][2]); // blades per m2 of the densest ring
  const tA = lin(0x3c6a1e), tB = lin(0x7ea03a), tDry = lin(0xa59f52);
  G.rings.forEach(([rin, rout, cell, blades, segs], ri) => {
    const base = clumpGeometry(blades, segs, 1234 + ri * 77);
    const lo = Math.max(0, rin - G.blend - cell * 1.5), hi = rout + G.blend + cell * 1.5, n = Math.ceil(hi / cell) + 1;
    // cells of the annulus, split into angular sectors: one draw each, so the sectors behind the camera are culled
    const sectors = Array.from({ length: SECTORS }, () => []);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const x = i * cell, z = j * cell, d = Math.hypot(x, z); if (d < lo || d > hi) continue;
      const a = (Math.atan2(z, x) + Math.PI) / (2 * Math.PI); sectors[Math.min(SECTORS - 1, Math.floor(a * SECTORS))].push(x, z);
    }
    const uni = {
      uOrigin: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() }, uGround: { value: ground.tex },
      uGroundST: { value: new THREE.Vector2(ground.scale, ground.offset) },
      uRing: { value: new THREE.Vector4(ri === 0 ? -1e3 : rin, ri === G.rings.length - 1 ? 1e3 : rout, cell, G.blend) },
      uFall: { value: new THREE.Vector4(G.fullRadius, G.radius, (blades / (cell * cell)) / cap0, HALF) },
      uH: { value: new THREE.Vector2(G.height[0], G.height[1]) },
      uTA: { value: tA }, uTB: { value: tB }, uTDry: { value: tDry },
    };
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.7 });
    m.onBeforeCompile = s => {
      Object.assign(s.uniforms, uni);
      s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uWindDir = U.uWindDir;
      s.vertexShader = `attribute vec4 aBlade; attribute vec2 aCell;
        uniform float uTime; uniform float uWind; uniform vec2 uWindDir;
        uniform vec2 uOrigin; uniform vec3 uCam; uniform sampler2D uGround; uniform vec2 uGroundST;
        uniform vec4 uRing; uniform vec4 uFall; uniform vec2 uH; uniform vec3 uTA; uniform vec3 uTB; uniform vec3 uTDry;
        float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        ` + s.vertexShader
        .replace('#include <color_vertex>', `
          // clump placement (world space, stable per cell)
          vec2 cw = uOrigin + aCell;
          vec2 cc = cw + (vec2(gh(cw), gh(cw + 17.31)) - 0.5) * uRing.z * 0.9;
          vec2 bp = cc + aBlade.xy * uRing.z * 0.62;
          float rnd = gh(bp * 1.37 + aBlade.w);
          float r = distance(bp, uCam.xz);
          float rj = r + (gh(cw + 5.7) - 0.5) * uRing.w;
          vec4 gd = texture2D(uGround, (bp + uGroundST.y) * uGroundST.x);
          float fall = r < uFall.x ? 1.0 : pow(clamp((uFall.y - r) / (uFall.y - uFall.x), 0.0, 1.0), 2.0);
          float want = gd.g * fall / uFall.z;            // wanted density / this ring's capacity
          float keep = step(uRing.x, rj) * step(rj, uRing.y) * step(aBlade.w, want)
                     * step(uFall.w, max(abs(bp.x), abs(bp.y)));  // the authored plot has its own grass
          float widen = clamp(want, 1.0, 2.6);               // sparser ring: wider blades keep the coverage
          float gPatch = gd.b;
          vec3 gTint = mix(uTA, uTB, clamp(rnd * 0.8 + (gPatch - 0.5) * 0.6 + 0.2, 0.0, 1.0));
          if (gh(bp + 3.3) < 0.07) gTint = mix(gTint, uTDry, 0.7);
          gTint *= 0.85 + gh(bp + 9.1) * 0.3;
          vColor = gTint * mix(0.26, 1.0, uv.y);`)
        .replace('#include <beginnormal_vertex>', `
          float cr = cos(aBlade.z), sr = sin(aBlade.z);
          vec3 objectNormal = normalize(vec3(sr, 0.0, cr) * 0.35 + vec3(0.0, 1.0, 0.0));`)
        .replace('#include <begin_vertex>', `
          float tall = mix(uH.x, uH.y, rnd) * (0.75 + 0.55 * gPatch) * smoothstep(uFall.y, uFall.y - 5.0, r) * keep;
          vec3 p = position; float hf = uv.y;
          p.x *= mix(0.03, 0.058, gh(bp + 1.9)) * widen; p.y *= tall; p.z *= tall * mix(0.3, 1.3, gh(bp + 2.7));
          p = vec3(cr*p.x + sr*p.z, p.y, -sr*p.x + cr*p.z);
          float t = uTime;
          float gust = 0.55 + 0.45*sin(dot(bp, uWindDir)*0.9 - t*1.7) + 0.22*sin(bp.x*2.3 + bp.y*1.7 + t*3.1 + rnd*6.28);
          float bend = uWind * gust * hf * hf;
          vec2 sway = uWindDir * bend * tall * 0.6 + vec2(sin(t*2.7 + rnd*20.0), cos(t*2.3 + rnd*31.0)) * 0.012 * (0.3 + uWind) * hf;
          p.xz += sway * keep;
          p.y -= dot(sway, sway) / max(tall, 0.05) * 0.55 * keep;
          vec3 transformed = p + vec3(bp.x, gd.r - 0.01, bp.y);`);
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);').replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.directSpecular *= 0.12; reflectedLight.indirectSpecular *= 0.12;');
    };
    const meshes = sectors.filter(c => c.length).map(cells => {
      const geo = new THREE.InstancedBufferGeometry();
      for (const k in base.attributes) geo.setAttribute(k, base.attributes[k]);
      geo.setIndex(base.index);
      geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 2));
      geo.instanceCount = cells.length / 2;
      // local bounding sphere of the sector; moved with the camera in update()
      let cx = 0, cz = 0; for (let i = 0; i < cells.length; i += 2) { cx += cells[i]; cz += cells[i + 1]; } cx /= cells.length / 2; cz /= cells.length / 2;
      let r = 0; for (let i = 0; i < cells.length; i += 2) r = Math.max(r, Math.hypot(cells[i] - cx, cells[i + 1] - cz));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(r + cell * 2, 6));
      const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.dynamic = true;
      mesh.userData.local = new THREE.Vector2(cx, cz);
      scene.add(mesh); return mesh;
    });
    rings.push({ meshes, uni, cell });
  });
  function update(cam) {
    for (const r of rings) {
      const o = r.uni.uOrigin.value.set(Math.floor(cam.x / r.cell) * r.cell, Math.floor(cam.z / r.cell) * r.cell);
      r.uni.uCam.value.copy(cam);
      for (const m of r.meshes) {
        const bs = m.geometry.boundingSphere.set(bs0.set(o.x + m.userData.local.x, H(cam.x, cam.z), o.y + m.userData.local.y), m.geometry.boundingSphere.radius);
        m.visible = Math.abs(bs.center.x) + bs.radius > HALF || Math.abs(bs.center.z) + bs.radius > HALF; // skip sectors lying inside the plot
      }
    }
  }
  return { rings, update };
}
