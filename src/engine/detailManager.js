import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * One place that decides, by distance, what is drawn at which detail. Assets register "bands": a region (a box, or a
 * point when min = max) and the distance at which the band switches. A few times per second (CONFIG.detail.interval)
 * the camera's distance to each region is compared with the band's distance, with hysteresis (a near band switches
 * on at d and off at d * (1 + hysteresis); a far band the other way round), and the band's onChange(on) is called
 * when its state flips. The band's own code toggles .visible / .castShadow of meshes, pauses per-frame work (check
 * band.on) or does whatever else the asset needs; the gradual part of every transition is a dithered fade on the GPU
 * (addDistanceFade / addRegionFade), so a switch only ever happens once the object is fully faded in or out.
 *
 * Rules the bands follow: lights are never added, removed, hidden or given castShadow at runtime (that recompiles
 * every shader); a light is turned off by intensity = 0, and nothing that has a light below it is hidden as a group.
 */
export function createDetailManager(camera) {
  const DC = CONFIG.detail, bands = [], P = new THREE.Vector3();
  let acc = Infinity;
  const distTo = b => P.copy(camera.position).clamp(b.min, b.max).distanceTo(camera.position);
  const stats = { bands: 0, near: 0, switches: 0 };
  return {
    stats,
    /**
     * Register a band. region: { min, max } (Vector3s; world space). at: switch distance in metres. far: true when the
     * band is "on" beyond `at` (billboards, proxies) instead of within it. onChange(on) runs on every flip and once
     * at the first update. Returns the band; band.on tells per-frame code whether to run.
     */
    band(name, region, at, onChange, far = false) {
      const b = { name, min: region.min.clone(), max: (region.max || region.min).clone(), at, far, on: null, onChange, d: 0 };
      bands.push(b); stats.bands = bands.length; return b;
    },
    /** Call once per frame; the distances are only evaluated every CONFIG.detail.interval seconds. */
    update(dt) {
      acc += dt; if (acc < DC.interval) return; acc = 0;
      const h = 1 + DC.hysteresis; let near = 0;
      for (const b of bands) {
        const d = b.d = distTo(b);
        const on = b.far ? (b.on ? d > b.at / h : d > b.at) : (b.on ? d < b.at * h : d < b.at);
        if (on !== b.on) { b.on = on; stats.switches++; b.onChange(on); }
        if (on && !b.far) near++;
      }
      stats.near = near;
    },
    bands,
  };
}

/** World-space box of a list of objects (their geometry bounds; instanced meshes: their instances). */
export function boundsOf(objects) {
  const box = new THREE.Box3(), tmp = new THREE.Box3(), M = new THREE.Matrix4();
  for (const o of objects) o.traverse(c => {
    if (!c.geometry) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    c.updateWorldMatrix(true, false);
    if (c.isInstancedMesh) for (let i = 0; i < c.count; i++) { c.getMatrixAt(i, M); box.union(tmp.copy(c.geometry.boundingBox).applyMatrix4(M.premultiply(c.matrixWorld))); }
    else if (!c.isPoints) box.union(tmp.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld));
  });
  return box;
}
/** Every drawable (mesh, points, sprite) at or below the given objects. */
export function drawables(objects) {
  const out = []; for (const o of objects) o.traverse(c => { if (c.isMesh || c.isPoints || c.isSprite) out.push(c); }); return out;
}
