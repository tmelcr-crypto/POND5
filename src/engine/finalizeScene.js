import * as THREE from 'three';
import { V } from '../core/math.js';
import { addCloudShadow } from '../core/shaderPatches.js';

/**
 * Run once after every asset is built:
 *  1. Outdoor materials skip point lights, so the cabin's lamps and fire never leak through the log walls.
 *  2. Give each material a unique program cache key (several share onBeforeCompile source text).
 *  3. Cloud shadows (addCloudShadow) on every lit material except the cabin interior (interiorMats): only the sun's
 *     direct light is dimmed, so this is everything the sun shines on, trunks and flowers too, not just the ground.
 *  4. Fit bounding spheres of InstancedMeshes to their instances so frustum culling works
 *     (skipped for userData.dynamic meshes, whose instances are culled per frame by the world scatter).
 */
export function finalizeScene(scene, cabinGroup, interiorMats = new Set()) {
    const NO_POINT = THREE.ShaderChunk.lights_fragment_begin.replace('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0');
    const cabinMats = new Set(); cabinGroup.traverse(o => { if (o.material) [].concat(o.material).forEach(m => cabinMats.add(m)); });
    let pid = 0;
    scene.traverse(o => {
      if (o.isInstancedMesh && !o.userData.dynamic) {
        const box = new THREE.Box3(), pp = new V(), mm = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mm); box.expandByPoint(pp.setFromMatrixPosition(mm)); }
        o.geometry.computeBoundingSphere(); const gs = o.geometry.boundingSphere.radius, sph = box.getBoundingSphere(new THREE.Sphere()); sph.radius += gs * 1.6 + 0.3; o.geometry.boundingSphere = sph;
      }
      if (!o.material || o.isPoints || o.isSprite) return;
      [].concat(o.material).forEach(m => {
        if (!m.isMeshStandardMaterial) return;
        const id = 'mat' + (pid++);
        if (!cabinMats.has(m) && !m.userData.np) {
          m.userData.np = true; const prev = m.onBeforeCompile;
          m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', NO_POINT); };
        }
        if (!interiorMats.has(m)) addCloudShadow(m);
        if (!m.userData.keyed) { m.userData.keyed = true; m.customProgramCacheKey = () => id; }
      });
    });
}
