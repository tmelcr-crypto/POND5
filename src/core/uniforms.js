import * as THREE from 'three';

/** Uniforms shared by many shaders (time, wind, sun). Mutate .value; never replace the objects. */
export const U = {
  uTime: { value: 0 }, uWind: { value: 0.6 }, uWindDir: { value: new THREE.Vector2(0.82, 0.57).normalize() },
  uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunI: { value: 2.6 }, uWater: { value: 0 },
  uSpring: { value: 0 }, uAutumn: { value: 0 }, uWinter: { value: 0 }, uSnow: { value: 0 },   // the season (world/seasons.js): all 0 in summer
  uHandLight: { value: new THREE.Vector4(0, 0, 0, 0) },   // the carried lantern (app/lantern.js): view-space position, strength (0: none)
};
