import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos, limb } from '../../core/geometry.js';
import { makeFlame } from './cabin.js';

/**
 * The hand lantern you can carry (#22, app/lantern.js): a hurricane lantern, ~30 cm to the top of its handle. A dark
 * iron tank with a brass burner, a glass globe in a wire guard between two side tubes, a vented cap and a bail handle;
 * a small flame (the cabin's flame shader) and a soft glow sprite. Origin at the bottom of the tank. One mesh per
 * material (iron, brass, glass) plus the flame and glow: 6 draw calls, no shadows cast by the glass or flame.
 * setLit(on) lights it (flame, glow, the glass warm).
 */
export function handLantern({ softDot }) {
  const g = new THREE.Group(); g.name = 'handLantern';
  const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const iron = [], brass = [];
  // the tank, its collar and the burner
  iron.push(lathe([[0, 0], [0.062, 0], [0.068, 0.012], [0.07, 0.03], [0.064, 0.05], [0.05, 0.062], [0.042, 0.066], [0, 0.066]]));
  brass.push(lathe([[0.03, 0.064], [0.034, 0.072], [0.033, 0.084], [0.024, 0.09], [0, 0.09]], 16));
  // the side tubes up from the tank to the cap, and their crossbar under the cap
  for (const s of [-1, 1]) {
    iron.push(limb(new V(s * 0.066, 0.03, 0), new V(s * 0.066, 0.215, 0), 0.0055, 0.0055, 6));
    iron.push(limb(new V(s * 0.066, 0.215, 0), new V(s * 0.03, 0.235, 0), 0.0055, 0.0055, 6));
  }
  // the wire guard round the globe: four bent wires and a ring
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a), pt = (r, y) => new V(c * r, y, s * r);
    [[0.034, 0.095], [0.056, 0.13], [0.058, 0.165], [0.04, 0.205]].reduce((p, q) => { iron.push(limb(pt(...p), pt(...q), 0.0022, 0.0022, 4)); return q; });
  }
  const ring = new THREE.TorusGeometry(0.057, 0.0025, 4, 24); ring.rotateX(Math.PI / 2); ring.translate(0, 0.148, 0); iron.push(ring);
  // the cap with its vent holes' shadowed band, and the bail handle
  iron.push(lathe([[0.03, 0.205], [0.05, 0.215], [0.046, 0.232], [0.028, 0.25], [0.018, 0.262], [0.02, 0.268], [0, 0.27]]));
  const bail = new THREE.TorusGeometry(0.07, 0.0028, 5, 20, Math.PI); bail.translate(0, 0.235, 0); iron.push(bail);
  brass.push(lathe([[0, 0.268], [0.009, 0.268], [0.009, 0.276], [0, 0.279]], 10));
  const ironMat = new THREE.MeshStandardMaterial({ color: lin(0x2a2522), roughness: 0.55, metalness: 0.55 });
  const brassMat = new THREE.MeshStandardMaterial({ color: lin(0xb08a3a), roughness: 0.35, metalness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0, emissive: new THREE.Color(1, 0.66, 0.32), emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide });
  const add = (geo, mat, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
  add(mergeGeos(iron, ['position', 'normal']), ironMat, true);
  add(mergeGeos(brass, ['position', 'normal']), brassMat, true);
  const globe = add(lathe([[0.03, 0.09], [0.042, 0.105], [0.05, 0.135], [0.05, 0.165], [0.04, 0.19], [0.03, 0.205]], 24), glassMat, false); globe.renderOrder = 4;
  const flame = makeFlame(g, 0, 0.098, 0, 0.018, 0.042, 7.3, 1.4, 1.7, 2);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xffa050, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, 0.13, 0); glow.scale.set(0.34, 0.34, 1); glow.renderOrder = 5; g.add(glow);
  const top = new V(0, 0.13, 0);   // where the light comes from
  function setLit(on) { flame.visible = glow.visible = on; glassMat.emissiveIntensity = on ? 0.28 : 0; }
  setLit(false);
  return { group: g, setLit, top, materials: [ironMat, brassMat, glassMat] };
}
