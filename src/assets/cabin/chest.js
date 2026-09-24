import * as THREE from 'three';
import { V } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { CHESTS, H } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * Wooden sea chests (sites: CHESTS in world/layout.js): a plank box with iron bands and corners, a curved lid on a hinge
 * at the back (lid.rotation.x opens it; app/chestUI.js swings it), a lock plate and rope handles, and a dark inside.
 * Built in the chest's frame (x along its front, +z out of the front, y up from its base) and set on the ground; solid
 * for the player (circles in the obstacle grid). Its own random numbers. Every number is in CHEST_LOOK.
 */
export const CHEST_LOOK = { lidRise: 0.16, wall: 0.035 };

export function createChests(ctx) {
  const { scene, maxAniso } = ctx, CL = CHEST_LOOK;
  let seed = 4141; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const plankTex = canvasTex(256, 256, (g, w, h) => {   // horizontal planks with grain and dark seams
    for (let i = 0; i < 4; i++) {
      const y0 = i * h / 4, tone = rr(-16, 16); g.fillStyle = `rgb(${122 + tone | 0},${84 + tone * 0.8 | 0},${54 + tone * 0.6 | 0})`; g.fillRect(0, y0, w, h / 4);
      for (let k = 0; k < 50; k++) { g.strokeStyle = rnd() < 0.5 ? `rgba(55,32,16,${rnd() * 0.25})` : `rgba(215,175,130,${rnd() * 0.15})`; g.lineWidth = 0.6 + rnd() * 1.4; const y = y0 + rnd() * h / 4; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rr(-3, 3), w * 0.7, y + rr(-3, 3), w, y + rr(-2, 2)); g.stroke(); }
      g.fillStyle = 'rgba(28,16,8,.85)'; g.fillRect(0, y0, w, 3);
    }
  });
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping; plankTex.anisotropy = maxAniso;
  const woodMat = new THREE.MeshStandardMaterial({ map: plankTex, vertexColors: true, roughness: 0.75, metalness: 0.1 });
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); return g; };
  // one mesh for the box and one for the lid: every part tinted by vertex colour over the one wood texture (the iron
  // and the dark inside are just very dark tints), so a chest costs two draws (and two in the shadow pass)
  const tint = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
  const WOOD = [1, 1, 1], IRON = [0.09, 0.085, 0.08], DARK = [0.035, 0.025, 0.02], ROPE = [1.3, 1.15, 0.8];

  return CHESTS.map(C => {
    const L = C.length, D = C.depth, Hh = C.height, T = CL.wall, R = D / 2, rise = CL.lidRise;
    const group = new THREE.Group(); group.position.set(C.x, H(C.x, C.z) - 0.02, C.z); group.rotation.y = C.rot; scene.add(group);
    // the box: four walls and a floor (open at the top), the dark inside, iron corners and bands
    const walls = [box(L, Hh, T, 0, Hh / 2, D / 2 - T / 2), box(L, Hh, T, 0, Hh / 2, -D / 2 + T / 2), box(T, Hh, D - 2 * T, L / 2 - T / 2, Hh / 2, 0), box(T, Hh, D - 2 * T, -L / 2 + T / 2, Hh / 2, 0), box(L - 2 * T, T, D - 2 * T, 0, T / 2, 0)];
    walls.forEach(g => { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * L, uv.getY(k) * Hh * 1.6); });
    const body = walls.map(g => tint(g, WOOD));
    [box(L - 2 * T - 0.004, 0.004, D - 2 * T - 0.004, 0, T + 0.003, 0), box(L - 2 * T - 0.004, Hh - T, 0.004, 0, Hh / 2 + T / 2, D / 2 - T - 0.003), box(L - 2 * T - 0.004, Hh - T, 0.004, 0, Hh / 2 + T / 2, -D / 2 + T + 0.003)].forEach(g => body.push(tint(g, DARK)));
    const iron = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) iron.push(box(0.05, Hh + 0.004, 0.05, sx * (L / 2 - 0.02), Hh / 2, sz * (D / 2 - 0.02)));   // corners
    for (const bx of [-L * 0.3, L * 0.3]) { iron.push(box(0.04, Hh, D + 0.008, bx, Hh / 2, 0)); iron.push(box(0.04, 0.008, D + 0.008, bx, 0.004, 0)); }   // bands round the box
    iron.push(box(0.1, 0.12, 0.012, 0, Hh - 0.07, D / 2 + 0.004));                                                               // lock plate
    iron.forEach(g => body.push(tint(g, IRON)));
    const rope = [];
    for (const sx of [-1, 1]) { const t = new THREE.TorusGeometry(0.05, 0.012, 5, 12, Math.PI).toNonIndexed(); t.rotateY(Math.PI / 2); t.rotateX(Math.PI); t.translate(sx * (L / 2 + 0.012), Hh * 0.7, 0); rope.push(t); }
    rope.forEach(g => body.push(tint(g, ROPE)));
    group.add(new THREE.Mesh(mergeGeos(body, ['position', 'normal', 'uv', 'color']), woodMat));
    // the lid: a curved top on a hinge along the back edge (lid.rotation.x < 0 opens it)
    const lid = new THREE.Group(); lid.position.set(0, Hh, -D / 2); group.add(lid);
    const shell = new THREE.CylinderGeometry(R, R, L, 18, 1, true, 0, Math.PI).toNonIndexed();   // the upper half, once turned along x shell.rotateZ(Math.PI / 2); shell.scale(1, rise / R, 1); shell.translate(0, 0, D / 2);
    { const uv = shell.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 1.2, uv.getY(k) * L); }
    const ends = [-1, 1].map(sx => { const s = new THREE.Shape(); s.moveTo(-R, 0); s.absarc(0, 0, R, Math.PI, 0, true); s.lineTo(-R, 0); const g = new THREE.ShapeGeometry(s, 10).toNonIndexed(); g.scale(1, rise / R, 1); g.rotateY(sx * Math.PI / 2); g.translate(sx * L / 2, 0, D / 2); return g; });
    const lidMat = woodMat.clone(); lidMat.side = THREE.DoubleSide;   // its underside shows when open
    const lidParts = [tint(shell, WOOD), ...ends.map(g => tint(g, WOOD)), tint(new THREE.PlaneGeometry(L - 0.02, D - 0.02).rotateX(Math.PI / 2).translate(0, 0.004, D / 2).toNonIndexed(), DARK)];
    const lidIron = [];
    for (const bx of [-L * 0.3, L * 0.3]) { const t = new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.04, 18, 1, true, 0, Math.PI).toNonIndexed(); t.rotateZ(Math.PI / 2); t.scale(1, (rise + 0.006) / (R + 0.006), 1); t.translate(bx, 0, D / 2); lidIron.push(t); }
    lidIron.push(box(0.06, 0.07, 0.012, 0, -0.01, D + 0.004));   // the hasp
    lidIron.forEach(g => lidParts.push(tint(g, IRON)));
    lid.add(new THREE.Mesh(mergeGeos(lidParts, ['position', 'normal', 'uv', 'color']), lidMat));
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // solid: two circles along its length
    const c = Math.cos(C.rot), s = Math.sin(C.rot);
    for (const a of [-L / 4, L / 4]) obstacles.add(C.x + c * a, C.z - s * a, D / 2 + 0.05, group.position.y + 1.9);
    group.updateMatrixWorld(); const top = new V(0, Hh + rise + 0.25, 0).applyMatrix4(group.matrixWorld);   // where its icon floats
    return { id: C.id, group, lid, top, data: C };
  });
}
