import * as THREE from 'three';
import { V } from '../core/math.js';

/**
 * The floating icon beside something you can do something with, and its soft glow on it (the look of the fires' and
 * the lantern's icons, styles/main.css .actIcon): show(at, key, svg, label, t) puts it beside the point `at` (the
 * button changes only when `key` does), show(null) hides it. Tapping it calls onPress.
 */
export function createActionIcon({ scene, camera, softDot, id, offset = 46, glow: glowSize = 0.4 }) {
  const btn = document.createElement('button'); btn.className = 'glass actIcon'; btn.id = id; btn.style.display = 'none'; document.body.appendChild(btn);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xfff2c8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  glow.visible = false; glow.renderOrder = 6; scene.add(glow);
  const sp = new V(); let shown = null, press = () => {};
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return {
    show(at, key, svg, label, t = 0, size = glowSize) {
      if (!at) { if (shown !== null) { shown = null; btn.style.display = 'none'; glow.visible = false; } return; }
      if (key !== shown) { shown = key; btn.style.display = ''; btn.innerHTML = svg; btn.setAttribute('aria-label', label); }
      const s = size * (1 + 0.08 * Math.sin(t * 4)); glow.visible = true; glow.position.copy(at); glow.scale.set(s, s, 1);
      sp.copy(at).project(camera); btn.style.left = ((sp.x + 1) / 2 * innerWidth + offset) + 'px'; btn.style.top = ((1 - sp.y) / 2 * innerHeight) + 'px'; btn.style.visibility = sp.z < 1 ? '' : 'hidden';
    },
    get shown() { return shown; },
    set onPress(f) { press = f; },
  };
}
/** Whether the camera is within `reach` of `at` and looking at it (within `cone` radians). */
const look = new V(), to = new V();
export function lookingAt(camera, at, reach, cone) {
  to.copy(at).sub(camera.position); const d = to.length(); if (d > reach) return false;
  camera.getWorldDirection(look); return to.normalize().dot(look) > Math.cos(cone);
}
