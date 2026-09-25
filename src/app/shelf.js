import * as THREE from 'three';
import { V, lin } from '../core/math.js';
import { SHELF, HOUSE, CB } from '../world/layout.js';
import { KINDS } from './itemKinds.js';

/**
 * The keepsake shelf on the cabin's back wall (SHELF in world/layout.js): a board on two brackets with a few places
 * for keepsakes (items whose use is 'keep': the golden fish; later the unique shell). Inside the cabin, near the shelf
 * and looking at it, with a keepsake selected, the Use button says Place and puts it on the next free place, where it
 * stays (saved in the browser). The board is one mesh.
 */
export function createShelf({ scene, camera, st, inventory, items }) {
  const KEY = 'meadow.shelf', S = SHELF;
  let held = []; try { held = (JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter(k => KINDS[k]).slice(0, S.slots.length); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(held)); } catch (err) { void err; } };

  const wood = new THREE.MeshStandardMaterial({ color: lin(0x6e4a2c), roughness: 0.75, metalness: 0 });
  const board = new THREE.BoxGeometry(S.w, 0.025, S.d); board.translate(0, -0.0125, 0);
  const parts = [board];
  for (const x of [-S.w / 2 + 0.06, S.w / 2 - 0.06]) { const b = new THREE.BoxGeometry(0.025, 0.12, 0.02); b.translate(x, -0.085, -S.d / 2 + 0.012); parts.push(b); const d = new THREE.BoxGeometry(0.02, 0.02, S.d - 0.03); d.rotateX(-0.75); d.translate(x, -0.065, -0.01); parts.push(d); }
  const g = new THREE.BufferGeometry(); { const all = parts.map(p => p.toNonIndexed()), pos = [], nor = []; all.forEach(p => { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); }
  const mesh = new THREE.Mesh(g, wood); mesh.position.set(S.x, S.y, S.z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);

  const shown = [];
  function show() {
    shown.forEach(m => scene.remove(m)); shown.length = 0;
    held.forEach((k, i) => { const m = items.model(k); m.position.set(S.x + S.slots[i], S.y + 0.045, S.z + 0.01); m.rotation.set(0, 0.25 - i * 0.2, 0); m.scale.setScalar(1.15); shown.push(m); });
  }
  show();

  const look = new V(), to = new V(), at = new V(S.x, S.y, S.z);
  /** Near the shelf, inside, looking at it. */
  function near() {
    const p = st.pos; if (!st.walk || st.seat || st.aboard || st.inBed || Math.abs(p.x - HOUSE.x) > CB.XW || Math.abs(p.z - HOUSE.z) > CB.ZW || p.distanceTo(at) > 2.2) return false;
    look.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    return to.subVectors(at, p).normalize().dot(look) > Math.cos(0.55);
  }
  const canPlace = kind => KINDS[kind] && KINDS[kind].use === 'keep' && held.length < S.slots.length && near();
  const prevLabel = inventory.useLabel, prevUse = inventory.onUse;
  inventory.useLabel = kind => (canPlace(kind) ? 'Place' : prevLabel(kind));
  inventory.onUse = kind => { if (!canPlace(kind)) return prevUse(kind); held.push(kind); save(); show(); if (items.sfx) items.sfx('thud'); return true; };
  let was = false, check = 0;
  return {
    get held() { return held.slice(); },
    update(dt) { if ((check -= dt) <= 0) { check = 0.25; const n = near(); if (n !== was) { was = n; inventory.refresh(); } } },
  };
}
