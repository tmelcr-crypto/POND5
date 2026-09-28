import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { U } from '../core/uniforms.js';
import { hash2 } from '../core/noise.js';
import { smooth } from '../core/math.js';
import { H, forest } from './layout.js';

/**
 * God rays (#92): soft shafts of sunlight slanting down through the woods. No extra render pass (too dear on a tablet):
 * a few long, thin, additive light planes (one instanced mesh, one draw call), each from a sunlit spot on the forest
 * floor up towards the sun, turned round its own axis to face you, fading at both ends and at its sides, flickering a
 * little as the crowns move. They stand at fixed places in the woods round you (cells picked by a hash, so they never
 * swim as you walk), trees and hills hide them (depth tested), and they are strongest when the sun is low and you look
 * towards it: gone at night, in rain, storms and fog. CONFIG.godRays.
 */
const VS = `
  attribute vec3 aBase; attribute vec3 aSize;   // ground point; width, length, seed
  uniform vec3 uSunDir; uniform float uSteep; varying vec2 vUv; varying float vSeed; varying float vNear; varying float vFacing;
  void main() {
    vec3 A = normalize(mix(normalize(uSunDir), vec3(0.0, 1.0, 0.0), uSteep));   // steeper than the sun: shafts come down through the crowns
    vec3 mid = aBase + A * aSize.y * 0.5, V = normalize(cameraPosition - mid);
    vec3 S = normalize(cross(A, V));
    vec3 p = aBase + A * (position.y * aSize.y) + S * (position.x * aSize.x);
    vUv = vec2(position.x + 0.5, position.y); vSeed = aSize.z;
    vNear = smoothstep(1.5, 5.0, distance(cameraPosition, p));
    vFacing = max(dot(-V, A), 0.0);   // looking towards the sun along the shaft
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FS = `
  uniform vec3 uCol; uniform float uStrength; uniform float uTime;
  varying vec2 vUv; varying float vSeed; varying float vNear; varying float vFacing;
  void main() {
    float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
    float side = pow(max(1.0 - abs(vUv.x * 2.0 - 1.0), 0.0), 1.6);
    float flick = 0.7 + 0.3 * sin(uTime * (0.7 + vSeed) + vSeed * 40.0) * sin(uTime * 0.37 + vSeed * 17.0);
    float streak = 0.75 + 0.25 * sin(vUv.x * 18.0 + vSeed * 9.0);
    float a = along * side * flick * streak * vNear * uStrength * (0.35 + 0.65 * vFacing * vFacing);
    gl_FragColor = vec4(uCol * a, 1.0);
  }`;

export function createGodRays(ctx, { skyUniforms, skyWeather } = {}) {
  const { scene, camera } = ctx, C = CONFIG.godRays, n = C.count;
  const quad = new THREE.PlaneGeometry(1, 1, 1, 4); quad.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
  const base = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), size = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute('aBase', base); geo.setAttribute('aSize', size); geo.instanceCount = 0;
  const uni = { uSunDir: skyUniforms ? skyUniforms.uSunDir : { value: new THREE.Vector3(0.3, 0.4, 0.2) }, uCol: { value: new THREE.Color() }, uStrength: { value: 0 }, uSteep: { value: C.steep }, uTime: U.uTime };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false; scene.add(mesh);

  let cx = Infinity, cz = Infinity;
  function place() {   // the shafts' places: sunlit cells in the woods round you, nearest first
    const cam = camera.position, list = [], R = C.radius, c = C.cell;
    for (let i = Math.floor((cam.x - R) / c); i <= Math.floor((cam.x + R) / c); i++) for (let j = Math.floor((cam.z - R) / c); j <= Math.floor((cam.z + R) / c); j++) {
      const h = hash2(i + 911, j - 377); if (h > C.share) continue;
      const x = (i + 0.2 + 0.6 * hash2(i, j + 5)) * c, z = (j + 0.2 + 0.6 * hash2(i + 7, j)) * c, d = Math.hypot(x - cam.x, z - cam.z);
      if (d > R || forest(x, z) < C.forest) continue;
      list.push({ x, z, d, h });
    }
    list.sort((a, b) => a.d - b.d);
    const k = Math.min(n, list.length);
    for (let q = 0; q < k; q++) {
      const s = list[q], r = s.h / C.share;
      base.setXYZ(q, s.x, H(s.x, s.z), s.z);
      size.setXYZ(q, C.width[0] + (C.width[1] - C.width[0]) * r, C.length[0] + (C.length[1] - C.length[0]) * hash2(Math.round(s.x * 3), Math.round(s.z * 3)), r * 3.1);
    }
    geo.instanceCount = k; base.needsUpdate = size.needsUpdate = true; cx = cam.x; cz = cam.z;
  }
  return {
    mesh,
    update() {
      const sun = uni.uSunDir.value, e = sun.y / (sun.length() || 1);
      const w = skyWeather ? skyWeather.state : null, bad = w ? Math.max(w.rain || 0, w.storm || 0, w.fog || 0) : 0;
      const k = smooth(0.02, 0.12, e) * (1 - smooth(0.5, 0.85, e)) * (1 - bad) * C.strength;
      uni.uStrength.value = k; mesh.visible = k > 0.003;
      if (!mesh.visible) return;
      uni.uCol.value.copy(U.uSunCol.value).multiplyScalar(0.9).lerp(new THREE.Color(1, 0.9, 0.7), 0.3);
      if (Math.hypot(camera.position.x - cx, camera.position.z - cz) > C.cell) place();
    },
    get stats() { return { shafts: geo.instanceCount, strength: +uni.uStrength.value.toFixed(3) }; },
  };
}
