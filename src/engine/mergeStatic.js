import * as THREE from 'three';

/**
 * Draw-call reduction that does not change the look: merge every static leaf mesh under `root` that shares a
 * material (and shadow flags and attribute layout) into one mesh. Objects reachable from `dynamic` (any
 * Object3D found in it, e.g. the cabin's door pivot, clock hands, flames) and everything below them stay
 * separate, so animation and visibility toggles keep working. Materials are shared, not copied, so changing a
 * material (lamp emissive, colours) still affects the merged mesh.
 * Returns { before, after } mesh counts.
 */
export function mergeStatic(root, dynamic) {
  const keep = new Set(), seen = new Set();
  (function collect(v, depth) {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 4) return; seen.add(v);
    if (v.isObject3D) { v.traverse(o => keep.add(o)); return; }
    if (v.isMaterial || v.isTexture || v.isBufferGeometry) return;
    for (const k of Object.keys(v)) collect(v[k], depth + 1);
  })(dynamic, 0);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  const groups = new Map(); let before = 0;
  root.traverse(o => {
    if (!o.isMesh) return; before++;
    if (keep.has(o) || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || Array.isArray(o.material) || !o.visible || o.geometry.morphAttributes.position) return;
    const attrs = Object.keys(o.geometry.attributes).sort(), sig = attrs.map(a => a + o.geometry.attributes[a].itemSize).join(',');
    const key = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, sig].join('|');
    (groups.get(key) || groups.set(key, []).get(key)).push(o);
  });
  let merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const attrs = Object.keys(list[0].geometry.attributes), parts = [];
    let total = 0;
    for (const o of list) {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      rel.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(rel);
      if (rel.determinant() < 0) { // mirrored: restore the winding order
        for (const a of attrs) { const at = g.attributes[a], s = at.itemSize, arr = at.array; for (let t = 0; t < at.count; t += 3) for (let c = 0; c < s; c++) { const i1 = (t + 1) * s + c, i2 = (t + 2) * s + c, tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; } }
      }
      parts.push(g); total += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    for (const a of attrs) {
      const s = list[0].geometry.attributes[a].itemSize, arr = new Float32Array(total * s); let off = 0;
      for (const g of parts) { arr.set(g.attributes[a].array, off); off += g.attributes[a].array.length; }
      out.setAttribute(a, new THREE.BufferAttribute(arr, s, list[0].geometry.attributes[a].normalized));
    }
    parts.forEach(g => g.dispose());
    const m = new THREE.Mesh(out, list[0].material);
    Object.assign(m, { castShadow: list[0].castShadow, receiveShadow: list[0].receiveShadow, renderOrder: list[0].renderOrder });
    list.forEach(o => o.parent.remove(o));
    root.add(m); merged += list.length - 1;
  }
  return { before, after: before - merged };
}
