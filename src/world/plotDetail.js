import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { addDistanceFade, addRegionFade, fadeRegion } from '../core/shaderPatches.js';
import { boundsOf, drawables } from '../engine/detailManager.js';
import { bakeAtlas, billboards } from './scatter.js';

/**
 * The original plot's assets on the detail manager, with the island's rules (CONFIG.trees.fade: full detail within
 * 15 m, gone or replaced by 19 m; nothing changes within 15 m):
 *  - reference spruce, apple tree and rose bush: dithered cross-fade into an 8-angle billboard baked from the asset
 *    itself (same dither pattern as the billboard, so the two never leave a gap), like the island's trees;
 *  - reeds, meadow flowers, the outcrop's ferns, lily pads: each instance / pad dissolves by its own distance on the
 *    GPU, like the island's small things; the whole mesh stops drawing once all of it is past the fade;
 *  - cabin interior (furniture, props, fire logs, clock, curtains): dissolves over CONFIG.detail.interior metres from
 *    the cabin; its lamp and fire glows and flames stay, so the windows still glow at night; sparks, clock, pendulum
 *    and fire flicker pause with it (cabin.detailNear);
 *  - pollen / fireflies stop drawing and updating beyond CONFIG.detail.pollen; lily pads stop bobbing with the pads.
 * Always drawn at full detail: terrain, pond, cabin exterior, roof, chimney and smoke, the outcrop's rock, scattered
 * stones. Lights are never touched.
 *
 * prepareCabinInterior() must run before mergeStatic (it gives the interior its own materials, so the merge keeps it
 * separate from the walls); registerPlotDetail() after it.
 */
const fadeDepth = new Map();
function depthFor(mesh, patch) {
  // the mesh's shadow must fade with it: its own custom depth material, patched, or a plain one (what three uses anyway)
  const cur = mesh.customDepthMaterial;
  if (cur) { if (!cur.userData.faded) { patch(cur); cur.userData.faded = true; } return cur; }
  const key = patch; if (!fadeDepth.has(key)) { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patch(m); m.userData.faded = true; fadeDepth.set(key, m); }
  return fadeDepth.get(key);
}
const patchOnce = (mat, patch) => { if (!mat.userData.faded) { patch(mat); mat.userData.faded = true; } };

/** Interior materials get their own copies (dithered by the cabin region); lamp and ember references follow them. */
export function prepareCabinInterior(cabin) {
  const DC = CONFIG.detail, meshes = [];
  cabin.group.traverse(o => { if (o.userData.interior && o.isMesh && !o.material.isShaderMaterial) meshes.push(o); });
  const box = boundsOf(meshes); box.expandByScalar(0.3);
  const region = fadeRegion(box.min, box.max, DC.interior), clones = new Map();
  for (const m of meshes) {
    let c = clones.get(m.material);
    if (!c) { c = m.material.clone(); addRegionFade(c, region); clones.set(m.material, c); }
    m.material = c;
  }
  cabin.lamps.forEach(L => { L.mats = L.mats.concat(L.mats.filter(m => clones.has(m)).map(m => clones.get(m))); });
  if (clones.has(cabin.emberMat)) cabin.emberMat = clones.get(cabin.emberMat);
  cabin.interior = { box, materials: new Set(clones.values()) };
}

/**
 * plot: { spruce, apple, rose, reeds, flowers, outcrop, pads, pollen, cabin } - arrays of the objects each asset
 * added to the scene (pads: the pad meshes; pollen: the Points; cabin: the cabin object). Returns the bands the render
 * loop checks (pads, pollen) for per-frame work.
 */
export function registerPlotDetail(ctx, detail, plot) {
  const { renderer, scene } = ctx, TC = CONFIG.trees, DC = CONFIG.detail;

  /* ---- reference trees and the rose bush: cross-fade into a billboard of themselves ---- */
  function billboardOf(name, objs, tile) {
    const meshes = drawables(objs).filter(m => m.isMesh);
    const box = boundsOf(meshes), base = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    const W = 2 * Math.max(base.x - box.min.x, box.max.x - base.x, base.z - box.min.z, box.max.z - base.z) + 0.1, Hh = box.max.y - base.y + 0.1;
    const parts = meshes.map(m => ({ geometry: m.geometry, material: m.material, instances: m.isInstancedMesh ? { matrix: m.instanceMatrix, color: m.instanceColor, count: m.count } : null }));
    const atlas = bakeAtlas(renderer, [{ width: W, height: Hh, origin: base, parts }], tile);
    const bb = billboards(atlas, [{ x: base.x, y: base.y + 0.05, z: base.z, s: 1, rot: 0, variant: 0 }]);
    scene.add(bb);
    // same point and range as the billboard's own fade (its quad sits at y - 0.05), complementary dither
    const region = fadeRegion(base, base, TC.fade), patch = m => addRegionFade(m, region);
    for (const m of meshes) { patchOnce(m.material, patch); if (m.castShadow) m.customDepthMaterial = depthFor(m, patch); }
    detail.band(name, { min: base }, TC.fade[1], on => meshes.forEach(m => { m.visible = on; }));
    detail.band(name + ' billboard', { min: base }, TC.fade[0], on => { bb.visible = on; }, true);
  }
  billboardOf('spruce', plot.spruce, TC.billboardTile);
  billboardOf('apple tree', plot.apple, TC.billboardTile);
  billboardOf('rose bush', plot.rose, 192);

  /* ---- small instanced things and pads: per-instance fade, like the island's small things ---- */
  function fadeSmall(name, meshes) {
    const patch = m => addDistanceFade(m, false);
    for (const m of meshes) { patchOnce(m.material, patch); if (m.castShadow) m.customDepthMaterial = depthFor(m, patch); }
    const box = boundsOf(meshes);
    return detail.band(name, box, TC.fade[1], on => meshes.forEach(m => { m.visible = on; }));
  }
  fadeSmall('reeds', drawables(plot.reeds));
  fadeSmall('meadow flowers', drawables(plot.flowers));
  fadeSmall('outcrop ferns', drawables(plot.outcrop).filter(m => m.isInstancedMesh));   // the rock itself always draws
  const pads = fadeSmall('lily pads', drawables(plot.pads));

  /* ---- plot grass: fades per blade in its own shader (grass.js); stops drawing once all of it is past the fade ---- */
  const grass = drawables(plot.grass);
  detail.band('plot grass', { min: new THREE.Vector3(-5.5, -1, -5.5), max: new THREE.Vector3(5.5, 1, 5.5) }, TC.fade[1], on => grass.forEach(m => { m.visible = on; }));

  /* ---- cabin interior (materials prepared before the merge) ---- */
  const cabin = plot.cabin, inside = [];
  cabin.group.traverse(o => { if (o.isMesh && cabin.interior.materials.has(o.material)) inside.push(o); });
  detail.band('cabin interior', cabin.interior.box, DC.interior[1], on => {
    inside.forEach(m => { m.visible = on; });
    cabin.sparks.pts.visible = on; cabin.detailNear = on;
  });

  /* ---- pollen / fireflies ---- */
  const pollen = detail.band('pollen', { min: new THREE.Vector3(-5.5, 0, -5.5), max: new THREE.Vector3(5.5, 4, 5.5) }, DC.pollen, on => { plot.pollen.visible = on; });

  return { pads, pollen };
}
