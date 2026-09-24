import * as THREE from 'three';
import { V, clamp, smooth } from '../core/math.js';
import { U } from '../core/uniforms.js';
import { CLOUD } from '../core/shaderPatches.js';
import { CONFIG } from '../config.js';

/**
 * three r128 applies fog after tone mapping and sRGB encoding, so the fog colour must be given in display space.
 * This reproduces ACESFilmicToneMapping + sRGB encoding on the CPU, so distant terrain fades exactly into the
 * sky dome's horizon colour.
 */
function displayColor(out, c, exposure) {
  const k = exposure / 0.6, r = c.r * k, g = c.g * k, b = c.b * k;
  const i = [0.59719 * r + 0.35458 * g + 0.04823 * b, 0.07600 * r + 0.90834 * g + 0.01566 * b, 0.02840 * r + 0.13383 * g + 0.83777 * b];
  const f = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const [x, y, z] = i.map(f);
  const o = [1.60475 * x - 0.53108 * y - 0.07367 * z, -0.10208 * x + 1.10813 * y - 0.00605 * z, -0.00327 * x - 0.07276 * y + 1.07602 * z].map(v => clamp(v));
  const s = v => (v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  return out.setRGB(s(o[0]), s(o[1]), s(o[2]));
}

/**
 * Day/night cycle: moves the sun (or moon), recolours the sky, exposure, fog colour, fireflies and chimney smoke.
 * scheduleEnv() debounces the PMREM environment rebuild while the slider is dragged.
 */
export function createTimeOfDay(ctx) {
  const { renderer, scene, sun, hemi, skyUniforms, rebuildEnv, pollen, cabin } = ctx;
  const sunDir = new V();
  const moonDir = new V(-0.35, 0.72, 0.6).normalize();
  function setSun(hours) {
    const tt = (hours - 6) / 12, sN = Math.sin(Math.PI * tt), el = Math.max(0.035, sN * 1.05), az = Math.PI * clamp(tt, 0, 1);
    sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), -0.55 * Math.sin(az) * Math.cos(el)).normalize();
    const k = smooth(0.03, 0.5, sN), day = smooth(-0.16, 0.06, sN), vis = smooth(-0.03, 0.05, sN);
    const sc = new THREE.Color(1.0, 0.46, 0.22).lerp(new THREE.Color(1.0, 0.95, 0.88), k);
    const sunI = (0.8 + 2.3 * k) * vis, moonI = 0.3 * (1 - day);
    if (sunI >= moonI) { sun.color.copy(sc); sun.intensity = sunI; sun.userData.dir.copy(sunDir); }
    else { sun.color.setRGB(0.55, 0.68, 1.0); sun.intensity = moonI; sun.userData.dir.copy(moonDir); }
    sun.position.copy(sun.userData.dir).multiplyScalar(20).add(sun.target.position);
    U.uSunCol.value.copy(sc).multiplyScalar(vis); U.uSunI.value = sunI;
    CLOUD.uCloudStrength.value = CONFIG.clouds.strength * k * vis;   // full at midday, gone by sunset (and for the moon)
    skyUniforms.uSunDir.value.copy(sunDir); skyUniforms.uSunCol.value.copy(sc).multiplyScalar(vis);
    const zD = new THREE.Color(0.12, 0.2, 0.42).lerp(new THREE.Color(0.17, 0.38, 0.8), k), hD = new THREE.Color(0.95, 0.56, 0.38).lerp(new THREE.Color(0.66, 0.79, 0.92), k);
    skyUniforms.uZenith.value.setRGB(0.004, 0.008, 0.026).lerp(zD, day);
    skyUniforms.uHorizon.value.setRGB(0.02, 0.03, 0.06).lerp(hD, day);
    skyUniforms.uNight.value = 1 - day;
    hemi.color.copy(skyUniforms.uZenith.value).lerp(new THREE.Color(1, 1, 1), 0.4); hemi.intensity = (0.06 + 0.16 * day + 0.3 * k) * CONFIG.light.hemiIntensity;
    renderer.toneMappingExposure = 0.92 + 0.25 * (1 - k) + 0.3 * (1 - day);
    if (scene && scene.fog) displayColor(scene.fog.color, skyUniforms.uHorizon.value, renderer.toneMappingExposure);
    const night = 1 - day;
    pollen.material.color.set(night > 0.5 ? 0xcfff6a : 0xfff0c8); pollen.material.size = 0.028 + 0.025 * night; pollen.material.opacity = 0.45 + 0.4 * (1 - k);
    cabin.smokeF = 0.35 + 0.65 * day;
  }
  let envTimer = null;
  function scheduleEnv(now) { clearTimeout(envTimer); if (now) rebuildEnv(); else envTimer = setTimeout(rebuildEnv, 120); }
  return { setSun, scheduleEnv };
}
