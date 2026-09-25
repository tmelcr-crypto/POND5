import * as THREE from 'three';
import { V, clamp, lin } from '../../core/math.js';
import { fbm3 } from '../../core/noise.js';
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
export const CHEST_LOOK = { lidRise: 0.16, wall: 0.035, stone: { margin: 0.36, top: 0.035, thick: 0.16 } };   // stone: the slab under it (m past the chest, above the ground, below its top)

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
    // a flat sandstone slab under it, a little wider all round, its edges sunk into the ground (the grass grows up to them)
    const ST = CL.stone, sa = L / 2 + ST.margin, sb = D / 2 + ST.margin - 0.08, off = 0.08, cr = Math.cos(C.rot), sr = Math.sin(C.rot), M = 28;   // shifted forward: less margin at the back (the wall)
    const toWorld = (lx, lz) => [C.x + lx * cr + lz * sr, C.z - lx * sr + lz * cr];
    let gMax = -Infinity; for (let k = 0; k < M; k++) { const a = k / M * 6.283, [x, z] = toWorld(Math.cos(a) * sa, Math.sin(a) * sb + off); gMax = Math.max(gMax, H(x, z)); }
    const slabTop = Math.max(gMax - 0.01, H(C.x, C.z) + ST.top), ph = rr(0, 6.28), rad = Array.from({ length: M }, (_, k) => 1 + 0.05 * Math.sin(k / M * 6.283 * 3 + ph) + rr(-0.03, 0.03));
    const edge = (k, f) => { const a = k / M * 6.283, c = Math.cos(a), s = Math.sin(a), e = Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(s), 4), -0.25);   // a rounded rectangle
      return [c * e * sa * f * rad[k], s * e * sb * f * rad[k] + off]; };
    const rings = [[0.0, 0.006], [0.6, 0.004], [0.93, 0], [1.0, -0.025], [1.05, -ST.thick]], pos = [], idx = [];
    rings.forEach(([f, y]) => { const n = f ? M : 1; for (let k = 0; k < n; k++) { const [lx, lz] = f ? edge(k, f) : [0, off]; pos.push(lx, slabTop + y + (f && f < 1 ? 0.004 * Math.sin(lx * 23 + lz * 17) : 0), lz); } });
    for (let k = 0; k < M; k++) idx.push(0, 1 + (k + 1) % M, 1 + k);
    for (let r = 0; r < rings.length - 2; r++) for (let k = 0; k < M; k++) { const a = 1 + r * M + k, b = 1 + r * M + (k + 1) % M; idx.push(a, b, a + M, b, b + M, a + M); }
    const slab = new THREE.BufferGeometry(); slab.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); slab.setIndex(idx); slab.computeVertexNormals();
    if (slab.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]]; slab.setIndex(idx); slab.computeVertexNormals(); }
    { const p = slab.attributes.position, col = new Float32Array(p.count * 3), cc = new THREE.Color(), base = lin(0x635c53), moss = lin(0x4f6a26), dirt = lin(0x4a3e31);   // the path stones' tones (lighter reads white in the sun)
      for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), rim = clamp(Math.hypot(x / sa, (z - off) / sb) - 0.7);
        cc.copy(base).multiplyScalar(0.7 + 0.4 * clamp(fbm3(x * 5 + C.x, y * 5, z * 5 + C.z) + 0.5)).multiplyScalar(0.9 + 0.2 * Math.sin(x * 41 + z * 37)); cc.lerp(moss, clamp(fbm3(x * 8, 3, z * 8) * 2 + rim * 1.4 - 0.9) * 0.5); cc.lerp(dirt, clamp((slabTop - y) / 0.05) * 0.7);
        col.set([cc.r, cc.g, cc.b], k * 3); } slab.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    const stone = new THREE.Mesh(slab, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
    stone.position.set(C.x, 0, C.z); stone.rotation.y = C.rot; stone.receiveShadow = true; scene.add(stone);
    const group = new THREE.Group(); group.position.set(C.x, slabTop, C.z); group.rotation.y = C.rot; scene.add(group);
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
    const shell = new THREE.CylinderGeometry(R, R, L, 18, 1, true, 0, Math.PI).toNonIndexed(); shell.rotateZ(Math.PI / 2); shell.scale(1, rise / R, 1); shell.translate(0, 0, D / 2);   // the upper half, turned along x
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
