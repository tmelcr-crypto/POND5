import * as THREE from 'three';
import { U } from './uniforms.js';

/**
 * onBeforeCompile patches for MeshStandardMaterial:
 *  addFlutter   - per-instance leaf/needle flutter (InstancedMesh)
 *  addWorldSway - world-space height-weighted sway (reeds, flower stems)
 *  dampSpecular - less specular on foliage cards
 *  addThinning  - distance-based thinning of tree parts by their detail rank (island trees)
 *  addDistanceFade - dithered distance cross-fade between a near and a far mesh (island rocks)
 *  addRegionFade   - the same dither, by the camera's distance to a fixed box / point (the plot's assets)
 */
export function addFlutter(mat, amp) {
  mat.onBeforeCompile = s => {
    s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind;
    s.vertexShader = 'uniform float uTime; uniform float uWind;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz + modelMatrix[3].xyz; // per card, and per tree for the island's shared trees
        float ph = ip.x*3.1 + ip.z*2.3 + ip.y*1.7;
        transformed.z += sin(uTime*(2.2 + uWind*3.5) + ph) * ${amp.toFixed(3)} * (0.25 + uWind) * (position.y + 0.5);
        transformed.x += cos(uTime*1.3 + ph*0.7) * ${(amp * 0.4).toFixed(3)} * uWind;
      #endif`);
  };
}
export function addWorldSway(mat, k) {
  mat.onBeforeCompile = s => {
    s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uWindDir = U.uWindDir; s.uniforms.uWater = U.uWater;
    s.vertexShader = 'uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uWater;\n' + s.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec3 bw = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
      #ifdef USE_INSTANCING
        bw = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
      #endif
      float wy = max(mvPosition.y + modelMatrix[3].y - bw.y, 0.0);
      float g = 0.6 + 0.4*sin(uTime*1.7 + bw.x*2.0 + bw.z*1.3);
      mvPosition.xz += uWindDir * uWind * wy * wy * ${k.toFixed(3)} * g + vec2(sin(uTime*3.1 + bw.z*5.0), cos(uTime*2.7 + bw.x*5.0)) * wy * 0.01 * uWind;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
}
/** Scale down specular reflection (sun glints and sky reflections) on foliage cards; chains any existing patch. */
export function dampSpecular(mat, k) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => { prev.call(mat, s, r); s.fragmentShader = s.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
    reflectedLight.directSpecular *= ${k.toFixed(3)}; reflectedLight.indirectSpecular *= ${k.toFixed(3)};`); };
}

/**
 * Shared uniforms of the tree thinning: uViewPos is the player camera (set every frame; the shadow pass must thin by
 * the same distance, and its own cameraPosition is the light), uKeep = (full detail up to, lowest detail at, lowest
 * keep fraction, card growth at the lowest keep), uFade = billboard cross-fade start / end.
 */
export const THIN = { uViewPos: { value: new THREE.Vector3() }, uKeep: { value: new THREE.Vector4(15, 45, 0.25, 0.35) }, uFade: { value: new THREE.Vector2(42, 48) } };
/** The same for small objects (bushes, wild roses): same camera position, their own (shorter) distances. */
export const THIN_SMALL = { uViewPos: THIN.uViewPos, uKeep: { value: new THREE.Vector4(6, 13, 0.45, 0.3) }, uFade: { value: new THREE.Vector2(10, 13) } };
/**
 * Continuous detail falloff for a tree part with an 'aRank' attribute (per vertex or per instance): with d the distance
 * from the tree's origin (modelMatrix[3]) to the player, keep(d) = 1 up to uKeep.x, then eases out (1 - (1 - t)^2) to uKeep.z at uKeep.y;
 * parts with rank >= keep collapse to a point. cards: surviving instanced cards grow by up to uKeep.w as keep drops,
 * so the crown stays full. Past uFade.x the tree dissolves (screen-space dither) into its billboard. Chains any
 * existing onBeforeCompile (so flutter still works); use it on the matching customDepthMaterial too.
 */
export function addThinning(mat, cards, uniforms = THIN) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = 'attribute float aRank; uniform vec3 uViewPos; uniform vec4 uKeep; varying float vTreeD;\n' + s.vertexShader.replace('#include <project_vertex>', `
      float treeD = distance(modelMatrix[3].xyz, uViewPos); vTreeD = treeD;
      float keepT = 1.0 - clamp((treeD - uKeep.x) / (uKeep.y - uKeep.x), 0.0, 1.0);
      float keepK = mix(1.0, uKeep.z, 1.0 - keepT * keepT);   // ease-out: detail drops soonest just past uKeep.x
      float alive = step(aRank, keepK);
      ${cards ? 'transformed *= alive * (1.0 + uKeep.w * (1.0 - keepK) / max(1.0 - uKeep.z, 1e-3));' : 'transformed *= alive;'}
      #include <project_vertex>`);
    s.fragmentShader = 'uniform vec2 uFade; varying float vTreeD;\n' + s.fragmentShader.replace('void main() {', `void main() {
      if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < smoothstep(uFade.x, uFade.y, vTreeD)) discard;`);
  };
}

/**
 * The trees' dithered distance cross-fade on its own, for objects with a near and a far mesh (island rocks):
 * fadeIn = false dissolves the mesh between uFade.x and uFade.y (the near mesh), fadeIn = true takes exactly the
 * pixels it gives up (the far mesh). Distance from the object's origin: the instance's with instancing.
 */
export function addDistanceFade(mat, fadeIn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    Object.assign(s.uniforms, THIN);
    // after the projection (hooked on clipping_planes_vertex, which every material has), so it chains after patches that
    // replace project_vertex (addWorldSway)
    s.vertexShader = 'uniform vec3 uViewPos; varying float vTreeD;\n' + s.vertexShader.replace('#include <clipping_planes_vertex>', `
      #ifdef USE_INSTANCING
        vTreeD = distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, uViewPos);
      #else
        vTreeD = distance(modelMatrix[3].xyz, uViewPos);
      #endif
      #include <clipping_planes_vertex>`);
    s.fragmentShader = 'uniform vec2 uFade; varying float vTreeD;\n' + s.fragmentShader.replace('void main() {', `void main() {
      if ((fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < smoothstep(uFade.x, uFade.y, vTreeD)) != ${fadeIn ? 'true' : 'false'}) discard;`);
  };
}

/**
 * A fade region for addRegionFade: the camera's distance to the box [min, max] (a point when min = max; 0 inside it)
 * picks the dither, smoothstep(range.x, range.y, d), the same pattern as the trees' cross-fade. One region is shared by
 * every material of an asset, so the whole asset fades as one object.
 */
export function fadeRegion(min, max, range) {
  return { uRMin: { value: min.clone() }, uRMax: { value: (max || min).clone() }, uRRange: { value: new THREE.Vector2(range[0], range[1]) } };
}
/**
 * Dithered fade by the camera's distance to a region (fadeRegion). fadeIn = false: drawn in full inside range.x,
 * dissolved by range.y; fadeIn = true takes exactly the complementary pixels (a billboard or proxy fading in). A point
 * region at a billboard's base gives the same pattern as its billboards() fade, so the two cross-fade without gaps.
 */
export function addRegionFade(mat, region, fadeIn = false) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    Object.assign(s.uniforms, { uViewPos: THIN.uViewPos }, region);
    s.fragmentShader = 'uniform vec3 uViewPos; uniform vec3 uRMin; uniform vec3 uRMax; uniform vec2 uRRange;\n' + s.fragmentShader.replace('void main() {', `void main() {
      float regionD = distance(clamp(uViewPos, uRMin, uRMax), uViewPos);
      if ((fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < smoothstep(uRRange.x, uRRange.y, regionD)) != ${fadeIn ? 'true' : 'false'}) discard;`);
  };
}
