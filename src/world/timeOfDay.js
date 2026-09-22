import * as THREE from 'three';
import { V, clamp, smooth } from '../core/math.js';
import { U } from '../core/uniforms.js';

/**
 * Day/night cycle: moves the sun (or moon), recolours the sky, fog-free exposure, fireflies and chimney smoke.
 * scheduleEnv() debounces the PMREM environment rebuild while the slider is dragged.
 */
export function createTimeOfDay(ctx) {
  const { renderer, sun, hemi, skyUniforms, rebuildEnv, pollen, cabin } = ctx;
  const sunDir = new V();
  const moonDir = new V(-0.35, 0.72, 0.6).normalize();
  function setSun(hours) {
    const tt = (hours - 6) / 12, sN = Math.sin(Math.PI * tt), el = Math.max(0.035, sN * 1.05), az = Math.PI * clamp(tt, 0, 1);
    sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), -0.55 * Math.sin(az) * Math.cos(el)).normalize();
    const k = smooth(0.03, 0.5, sN), day = smooth(-0.16, 0.06, sN), vis = smooth(-0.03, 0.05, sN);
    const sc = new THREE.Color(1.0, 0.46, 0.22).lerp(new THREE.Color(1.0, 0.95, 0.88), k);
    const sunI = (0.8 + 2.3 * k) * vis, moonI = 0.3 * (1 - day);
    if (sunI >= moonI) { sun.color.copy(sc); sun.intensity = sunI; sun.position.copy(sunDir).multiplyScalar(20).add(sun.target.position); }
    else { sun.color.setRGB(0.55, 0.68, 1.0); sun.intensity = moonI; sun.position.copy(moonDir).multiplyScalar(20).add(sun.target.position); }
    U.uSunCol.value.copy(sc).multiplyScalar(vis); U.uSunI.value = sunI;
    skyUniforms.uSunDir.value.copy(sunDir); skyUniforms.uSunCol.value.copy(sc).multiplyScalar(vis);
    const zD = new THREE.Color(0.12, 0.2, 0.42).lerp(new THREE.Color(0.17, 0.38, 0.8), k), hD = new THREE.Color(0.95, 0.56, 0.38).lerp(new THREE.Color(0.66, 0.79, 0.92), k);
    skyUniforms.uZenith.value.setRGB(0.004, 0.008, 0.026).lerp(zD, day);
    skyUniforms.uHorizon.value.setRGB(0.02, 0.03, 0.06).lerp(hD, day);
    skyUniforms.uNight.value = 1 - day;
    hemi.color.copy(skyUniforms.uZenith.value).lerp(new THREE.Color(1, 1, 1), 0.4); hemi.intensity = 0.06 + 0.16 * day + 0.3 * k;
    renderer.toneMappingExposure = 0.92 + 0.25 * (1 - k) + 0.3 * (1 - day);
    const night = 1 - day;
    pollen.material.color.set(night > 0.5 ? 0xcfff6a : 0xfff0c8); pollen.material.size = 0.028 + 0.025 * night; pollen.material.opacity = 0.45 + 0.4 * (1 - k);
    cabin.smokeF = 0.35 + 0.65 * day;
  }
  let envTimer = null;
  function scheduleEnv(now) { clearTimeout(envTimer); if (now) rebuildEnv(); else envTimer = setTimeout(rebuildEnv, 120); }
  return { setSun, scheduleEnv };
}
