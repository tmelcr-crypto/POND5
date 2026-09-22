import * as THREE from 'three';

export const V = THREE.Vector3;
export const UPV = new V(0, 1, 0);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
