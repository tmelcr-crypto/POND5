import * as THREE from 'three';
import { V, lin } from '../core/math.js';
import { SHELF, HOUSE, CB } from '../world/layout.js';
import { KINDS } from './itemKinds.js';

/**
 * The keepsake shelves on the cabin's back wall (SHELF in world/layout.js): two boards on brackets, with a place for
 * each keepsake (items whose use is 'keep': the golden fish, the nautilus shell, the old gold coins, the old photograph
 * and the ten keepsakes hidden round the island; the horseshoe hangs on the wall above). Inside the cabin, near the
 * shelves and looking at them, with a keepsake selected, the Use button says Place and puts it in its place, where it
 * stays (saved in the browser). The boards are one mesh.
 */
export function createShelf({ scene, camera, st, inventory, items }) {
  const KEY = 'meadow.shelf', S = SHELF, PL = S.places;
  let held = []; try { held = [...new Set((JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter(k => KINDS[k] && PL[k]))]; } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(held)); } catch (err) { void err; } };

  const wood = new THREE.MeshStandardMaterial({ color: lin(0x6e4a2c), roughness: 0.75, metalness: 0 });
  const parts = [];
  for (const B of S.boards) {
    const w = B.x1 - B.x0, mx = (B.x0 + B.x1) / 2, board = new THREE.BoxGeometry(w, 0.025, S.d); board.translate(mx, B.y - 0.0125, S.z); parts.push(board);
    // brackets: at the ends and between, clear of the bed's head posts below the lower board
    const bx = w > 1.2 ? [B.x0 + 0.06, B.x0 + w * 0.6, B.x1 - 0.14] : [B.x0 + 0.06, B.x1 - 0.06];
    for (const x of bx) { const b = new THREE.BoxGeometry(0.025, 0.12, 0.02); b.translate(x, B.y - 0.085, S.z - S.d / 2 + 0.012); parts.push(b); const d = new THREE.BoxGeometry(0.02, 0.02, S.d - 0.03); d.rotateX(-0.75); d.translate(x, B.y - 0.065, S.z - 0.01); parts.push(d); }
  }
  { const U = S.boards[1], P = PL.horseshoe, n = new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6); n.rotateX(Math.PI / 2); n.translate(P.x, U.y + 0.265, S.z - S.d / 2 + 0.015); parts.push(n); }   // the horseshoe's nail
  const g = new THREE.BufferGeometry(); { const all = parts.map(p => p.toNonIndexed()), pos = [], nor = []; all.forEach(p => { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); }
  const mesh = new THREE.Mesh(g, wood); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);

  const shown = [];
  function show() {
    shown.forEach(m => scene.remove(m)); shown.length = 0;
    held.forEach(k => {
      const P = PL[k], m = items.model(k);
      if (P.b === 2) m.position.set(P.x, S.boards[1].y + 0.2, S.z - S.d / 2 + 0.012);   // hung on the wall
      else m.position.set(P.x, S.boards[P.b].y + (P.lift || 0) + (k === 'goldenFish' || k === 'rareShell' || k === 'goldCoins' ? 0.045 : 0), S.z + 0.01);
      m.rotation.set(P.rx || 0, P.ry, 0); m.scale.setScalar(P.s || 1); shown.push(m);
    });
  }
  show();

  const look = new V(), to = new V(), spots = [];
  for (const B of S.boards) for (let x = B.x0 + 0.1; x < B.x1; x += 0.2) spots.push(new V(x, B.y + 0.05, S.z));
  /** Inside, near the shelves, looking at them. */
  function near() {
    const p = st.pos; if (!st.walk || st.seat || st.aboard || st.inBed || Math.abs(p.x - HOUSE.x) > CB.XW || Math.abs(p.z - HOUSE.z) > CB.ZW) return false;
    look.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    return spots.some(s => p.distanceTo(s) < 2.4 && to.subVectors(s, p).normalize().dot(look) > Math.cos(0.3));
  }
  const canPlace = kind => KINDS[kind] && KINDS[kind].use === 'keep' && PL[kind] && !held.includes(kind) && near();
  const prevLabel = inventory.useLabel, prevUse = inventory.onUse;
  inventory.useLabel = kind => (canPlace(kind) ? 'Place' : prevLabel(kind));
  inventory.onUse = kind => { if (!canPlace(kind)) return prevUse(kind); held.push(kind); save(); show(); if (items.sfx) items.sfx('thud'); return true; };
  let was = false, check = 0;
  return {
    get held() { return held.slice(); },
    update(dt) { if ((check -= dt) <= 0) { check = 0.25; const n = near(); if (n !== was) { was = n; inventory.refresh(); } } },
  };
}
