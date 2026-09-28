import * as THREE from 'three';
import { clamp, smooth, lin } from '../../core/math.js';
import { fbm3, vnoise3, hash3 } from '../../core/noise.js';
import { weld, mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { STONES, H } from '../../world/layout.js';
import { obstacles, rockBodies } from '../../world/bounds.js';

/**
 * The standing stones on the east hilltop (#66; the ring's places: STONES in world/layout.js). Each stone is a slab
 * of grey sarsen: a rounded box, tapering and weathered to an uneven top, with lumps, pits and rain flutes; pale
 * grey-green crusts of lichen with yellow and orange spots, darker rain streaks down from the top, moss and dirt at
 * the foot, sunk into the ground. One stone leans, one lies fallen outwards half in the turf, one is a broken stump.
 * Everything is one merged mesh (one draw call, and one in the shadow pass) with a fine grain texture for close up;
 * snow settles on the tops in winter (world/seasonLooks.js 'roof'). Its own noise offsets, no shared random numbers.
 */
const SINK = 0.35;
function slab(S) {
  const { w, d, h } = S, sink = SINK, len = h;   // length along its own y (up, or outwards when fallen), sunk 0.35 m
  const g = weld(new THREE.BoxGeometry(1, 1, 1, 7, Math.max(6, Math.round(len * 9)), 4)), p = g.attributes.position;
  const o = S.seed, top = S.broken ? 0.18 : 0.12 + 0.1 * Math.sin(o);   // how uneven the top is
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * w, y = (p.getY(i) + 0.5) * (len + sink) - sink, z = p.getZ(i) * d;
    const k = clamp(y / len);
    // rounded box: pull the corners in towards an inner box of radius rr
    const rr = Math.min(w, d) * 0.42, ix = clamp(x, -w / 2 + rr, w / 2 - rr), iz = clamp(z, -d / 2 + rr, d / 2 - rr), dx = x - ix, dz = z - iz, dl = Math.hypot(dx, dz);
    if (dl > 1e-5) { x = ix + dx / dl * Math.min(dl, rr); z = iz + dz / dl * Math.min(dl, rr); }
    // taper to the top, a slanted and broken top edge
    const taper = 1 - 0.28 * k * k - (S.broken ? 0 : 0.18 * smooth(0.75, 1, k));
    x *= taper; z *= taper * (1 - 0.15 * k);
    if (y > len * 0.6) y += (x / w) * top * len * 0.9 * smooth(0.6, 1, k) - Math.abs(fbm3(x * 2 + o, 3, z * 2)) * top * len * smooth(0.8, 1, k);
    // weathering: big lumps, small pits, vertical rain flutes on the upper half
    const lx = x + o, n = fbm3(lx * 1.6, y * 1.3, z * 1.6) * 0.07 + fbm3(lx * 7, y * 7, z * 7) * 0.014 - Math.max(0, vnoise3(lx * 12, y * 12, z * 12) - 0.55) * 0.03;
    const flute = 0.008 * Math.sin(Math.atan2(z, x) * 11 + fbm3(lx, y * 0.5, z) * 5) * smooth(0.4, 1, k);
    const r0 = Math.hypot(x, z) || 1, s = 1 + (n + flute) / Math.max(r0, 0.1);
    p.setXYZ(i, x * s, y, z * s);
  }
  g.computeVertexNormals();
  return g;
}

export function createStandingStones(ctx) {
  const { scene, maxAniso } = ctx;
  const grey = lin(0x8d8a82), greyD = lin(0x6c6a64), streak = lin(0x55534e), lichen = lin(0xa9b095), lichenY = lin(0xc6a53c), lichenO = lin(0xc97f3a), moss = lin(0x4f5d27), mossD = lin(0x3b4620), dirt = lin(0x4e4336);
  const parts = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (const S of STONES.stones) {
    const g = slab(S), p = g.attributes.position, nrm = g.attributes.normal, len = S.h, col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
    // colour in the stone's own frame (y up its length); the ground line is y = 0 (standing) or the fallen side
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nrm.getY(i), o = S.seed, k = clamp(y / len);
      c.copy(grey).lerp(greyD, clamp(fbm3(x * 3 + o, y * 3, z * 3) + 0.5));
      c.multiplyScalar(0.86 + 0.24 * clamp(vnoise3(x * 30 + o, y * 30, z * 30)));
      const st = clamp(fbm3(x * 9 + o, y * 0.8, z * 9) * 2.2 + 0.1) * smooth(0.25, 0.9, k);   // rain streaks down from the top
      c.lerp(streak, st * 0.45);
      const lc = fbm3(x * 4.2 - o, y * 4.2, z * 4.2);   // crusts of lichen, more on the upper faces
      if (lc > 0.08 - 0.12 * Math.max(0, ny)) c.lerp(lichen, clamp((lc - 0.02) * 6) * 0.75);
      const sp = vnoise3(x * 22 + o, y * 22, z * 22); if (sp > 0.72) c.lerp(hash3(Math.floor(x * 22), Math.floor(y * 22), Math.floor(z * 22 + o)) > 0.6 ? lichenO : lichenY, 0.65);
      const foot = S.fallen ? smooth(-0.02, S.d * 0.45, z + 0.06 * fbm3(x * 5, y * 5, 0)) : 1 - smooth(0.0, 0.3 + 0.15 * fbm3(x * 5, 0, z * 5), y);   // moss at the foot (a fallen one: its underside, +z)
      c.lerp(moss.clone().lerp(mossD, clamp(fbm3(x * 11, y * 11, z * 11) + 0.5)), foot * 0.85);
      if (y < 0.03 && !S.fallen) c.lerp(dirt, 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      const ax = Math.abs(nrm.getX(i)), az = Math.abs(nrm.getZ(i));
      uv[i * 2] = (ax > az ? z : x) * 1.4; uv[i * 2 + 1] = y * 1.4;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // into place: broad face to the ring's middle; leaning or fallen outwards
    const yaw = -S.a + Math.PI / 2, out = [Math.cos(S.a), Math.sin(S.a)];
    if (S.fallen) {
      // lying on its broad face, its foot at its place, its length outwards, a third in the turf
      const cx = S.x + out[0] * 0.15, cz = S.z + out[1] * 0.15;
      g.translate(0, SINK, 0); g.rotateX(Math.PI / 2 + 0.06); g.rotateY(Math.PI / 2 - S.a);   // length along +z, then outwards
      const gy = Math.min(H(cx, cz), H(cx + out[0] * S.h, cz + out[1] * S.h));
      g.translate(cx, gy + S.d * 0.2, cz);
      for (let t = 0.3; t < S.h + 0.3; t += 0.55) rockBodies.add({ x: cx + out[0] * t, y: gy + S.d * 0.2, z: cz + out[1] * t, rx: S.w * 0.55 + 0.2, ry: S.d * 0.5 + 0.2, rz: 0.6, rot: 0, body: 0.25 });
    } else {
      e.set(0, yaw, 0, 'YXZ'); q.setFromEuler(e);
      if (S.lean) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-out[1], 0, out[0]), -S.lean));   // tipped outwards
      m.compose(new THREE.Vector3(S.x, S.y - 0.04, S.z), q, new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m);
      const lx = S.lean ? Math.sin(S.lean) * S.h * 0.35 : 0;
      obstacles.add(S.x + out[0] * lx, S.z + out[1] * lx, Math.max(S.w, S.d) * 0.5 + 0.12, S.y + S.h);
    }
    parts.push(g);
  }
  const grain = canvasTex(256, 256, (g2, w, h) => {   // fine grain and specks for close up (multiplies the vertex colours)
    const img = g2.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = 0.5 + 0.5 * (0.5 * vnoise3(x / 7, y / 7, 1) + 0.3 * vnoise3(x / 2.5, y / 2.5, 5) + 0.2 * vnoise3(x / 1.2, y / 1.2, 9));
      const v = Math.round(255 * (0.8 + 0.2 * n) * (hash3(x, y, 3) > 0.985 ? 0.72 : hash3(x, y, 4) > 0.99 ? 1.12 : 1)), i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v); img.data[i + 3] = 255;
    }
    g2.putImageData(img, 0, 0);
  }, false);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.anisotropy = maxAniso;
  const mat = new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.55 });
  mat.userData.season = 'roof';   // snow on the tops in winter
  const mesh = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'color', 'uv']), mat);
  mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'standingStones'; scene.add(mesh);
  return { mesh, count: STONES.stones.length };
}
