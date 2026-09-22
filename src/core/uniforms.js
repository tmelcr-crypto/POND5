import * as THREE from 'three';

/** Uniforms shared by many shaders (time, wind, sun). Mutate .value; never replace the objects. */
export const U = {
  uTime: { value: 0 }, uWind: { value: 0.6 }, uWindDir: { value: new THREE.Vector2(0.82, 0.57).normalize() },
  uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunI: { value: 2.6 }, uWater: { value: 0 }
};
