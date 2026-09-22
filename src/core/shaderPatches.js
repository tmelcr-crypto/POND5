import { U } from './uniforms.js';

/**
 * onBeforeCompile patches for MeshStandardMaterial:
 *  addFlutter   - per-instance leaf/needle flutter (InstancedMesh)
 *  addWorldSway - world-space height-weighted sway (reeds, flower stems)
 */
export function addFlutter(mat, amp) {
  mat.onBeforeCompile = s => {
    s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind;
    s.vertexShader = 'uniform float uTime; uniform float uWind;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
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
