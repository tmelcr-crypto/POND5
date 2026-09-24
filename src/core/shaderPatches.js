import * as THREE from 'three';
import { U } from './uniforms.js';
import { cloudField } from './noise.js';
import { canvasTex } from './canvasTexture.js';

/**
 * onBeforeCompile patches for MeshStandardMaterial:
 *  addFlutter   - per-instance leaf/needle flutter (InstancedMesh)
 *  addWorldSway - world-space height-weighted sway (reeds, flower stems)
 *  addPlantSway - the same for a whole shrub, measured from the plant's base, so all its parts move together (roses)
 *  dampSpecular - less specular on foliage cards
 *  addThinning  - distance-based thinning of tree parts by their detail rank (island trees)
 *  addDistanceFade - dithered distance cross-fade between a near and a far mesh (island rocks)
 *  addRegionFade   - the same dither, by the camera's distance to a fixed box / point (the plot's assets)
 *  addCloudShadow  - soft cloud shadows drifting over everything the sun lights (CLOUD uniforms)
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
/**
 * Whole-plant sway for a shrub whose parts must move together (the rose's canes, leaflets, flowers and hips): every
 * vertex is pushed along the wind by k * wind * h^2, h its height above the plant's base, with gusts timed by the
 * plant's position, so a flower moves exactly with the cane tip it sits on. base: the plant's base in object space
 * (a mesh built in world space passes its world position). Chains any existing patch; it replaces the projection, so
 * apply it after addThinning (which only adds code before project_vertex). Use it on the matching depth material too.
 */
export function addPlantSway(mat, k, base = new THREE.Vector3()) {
  const prev = mat.onBeforeCompile, uBase = { value: base.clone() };
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    Object.assign(s.uniforms, { uTime: U.uTime, uWind: U.uWind, uWindDir: U.uWindDir, uPlantBase: uBase });
    const decl = ['uniform float uTime;', 'uniform float uWind;', 'uniform vec2 uWindDir;', 'uniform vec3 uPlantBase;'].filter(d => !s.vertexShader.includes(d)).join(' ');
    s.vertexShader = decl + '\n' + s.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec4 plantW = modelMatrix * mvPosition;
      vec3 plantO = (modelMatrix * vec4(uPlantBase, 1.0)).xyz;
      float plantH = max(plantW.y - plantO.y, 0.0);
      float plantG = 0.6 + 0.4 * sin(uTime * 1.6 + plantO.x * 0.8 + plantO.z * 0.6) + 0.2 * sin(uTime * 3.7 + plantO.z * 1.9);
      plantW.xz += uWindDir * (uWind * plantH * plantH * ${k.toFixed(4)} * plantG)
        + vec2(sin(uTime * 2.9 + plantO.z * 3.1 + plantH * 5.0), cos(uTime * 2.6 + plantO.x * 2.7 + plantH * 5.0)) * 0.008 * uWind * plantH;
      mvPosition = viewMatrix * plantW;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return mat;
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

/**
 * Cloud shadows. One tileable noise texture (made on a canvas at load by makeCloudTexture) lies flat over the world:
 * uCloudOffset is its drift (texture units, wraps), uCloudScale 1 / the metres one repeat covers, uCloudStrength the
 * share of direct sunlight a full shadow takes away (the time of day sets it; 0 at night). Mutate .value only.
 */
export const CLOUD = { tCloud: { value: null }, uCloudOffset: { value: new THREE.Vector2() }, uCloudScale: { value: 1 / 320 }, uCloudStrength: { value: 0 } };

/**
 * The cloud texture, made once at load on a canvas from cloudField() (core/noise.js): separate soft cloud footprints
 * `sizes` metres across covering `coverage` of a `tile`-metre tile that repeats seamlessly. Its own seed, not the
 * seeded stream, so the rest of the build is unchanged.
 */
export function makeCloudTexture({ tile = 320, size = 256, sizes = [22, 64], coverage = 0.3, soft = 7, seed = 17 } = {}) {
  const c = cloudField({ tile, size, sizes, coverage, soft, seed });
  const tex = canvasTex(size, size, g => {
    const img = g.createImageData(size, size);
    for (let i = 0; i < c.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(c[i] * 255); img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, false);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  CLOUD.tCloud.value = tex; CLOUD.uCloudScale.value = 1 / tile;
  return tex;
}

/** Move the cloud shadows by dt seconds of wind: dir the wind's unit x/z direction, speed in m/s. */
export function driftCloudShadows(dt, dir, speed) {
  const o = CLOUD.uCloudOffset.value, k = speed * dt * CLOUD.uCloudScale.value;
  o.set((o.x - dir.x * k) % 1, (o.y - dir.y * k) % 1);
}

/**
 * Cloud shadows on a MeshStandardMaterial: only the sun's direct light (direct diffuse and specular) is dimmed, by one
 * lookup of the cloud texture at the fragment's world x/z; ambient, sky and point lights (the cabin's lamps and fire)
 * are untouched. It wraps three's getDirectionalDirectLightIrradiance, so it chains with every other patch here and
 * with finalizeScene's point-light switch. Idempotent.
 */
export function addCloudShadow(mat) {
  if (mat.userData.cloud) return mat;
  mat.userData.cloud = true; mat.needsUpdate = true;
  if (!CLOUD.tCloud.value) makeCloudTexture();
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    Object.assign(s.uniforms, CLOUD);
    s.fragmentShader = s.fragmentShader.replace('#include <lights_pars_begin>', `#include <lights_pars_begin>
      #if NUM_DIR_LIGHTS > 0
        uniform sampler2D tCloud; uniform vec2 uCloudOffset; uniform float uCloudScale; uniform float uCloudStrength;
        void cloudShadowedSun(const in DirectionalLight light, const in GeometricContext geo, out IncidentLight direct) {
          getDirectionalDirectLightIrradiance(light, geo, direct);
          vec2 xz = cameraPosition.xz + (vec4(geo.position, 0.0) * viewMatrix).xz;   // view space -> world
          direct.color *= 1.0 - uCloudStrength * texture2D(tCloud, xz * uCloudScale + uCloudOffset).r;
        }
        #define getDirectionalDirectLightIrradiance cloudShadowedSun
      #endif`);
  };
  return mat;
}
