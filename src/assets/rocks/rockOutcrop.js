import * as THREE from 'three';
import { rng, rr } from '../../core/random.js';
import { V, UPV, clamp, smooth, lin } from '../../core/math.js';
import { hash2, vnoise2, hash3, vnoise3, fbm3 } from '../../core/noise.js';
import { weld, blobGeo, mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addFlutter } from '../../core/shaderPatches.js';
import { ROCK, rockColliders, H } from '../../world/layout.js';

/**
 * Stepped sandstone outcrop: rounded, noise-displaced strata slabs, boulders, pebbles, moss/lichen vertex colours and fern clumps.
 * Registers ellipsoid colliders in rockColliders.
 */
export function createRockOutcrop(ctx) {
  const { scene, maxAniso } = ctx;
  {
    const rockTex = canvasTex(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = 0.5 + 0.5 * (0.5 * vnoise2(x / 16, y / 16) + 0.3 * vnoise2(x / 5.5, y / 5.5) + 0.2 * vnoise2(x / 2, y / 2));
        const v = Math.round(150 + 105 * n * (hash2(x, y) > 0.97 ? 0.8 : 1)), i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      for (let k = 0; k < 9; k++) { let x = rng() * w, y = rng() * h; g.strokeStyle = `rgba(30,26,22,${0.2 + rng() * 0.25})`; g.lineWidth = 0.6 + rng(); g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += rr(-10, 10); y += rr(-10, 10); g.lineTo(x, y); } g.stroke(); }
    }, false);
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping; rockTex.anisotropy = maxAniso;
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.55 });

    const sand = lin(0xa39580), sandD = lin(0x746b5f), band = lin(0xb8a282), bandD = lin(0x5a534b), moss = lin(0x4f6a26), mossD = lin(0x34491a), lich = lin(0xbdbd86), lichO = lin(0xc08a3a);
    function finish(g) {
      g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i), ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) { uv[i * 2] = x * 0.8; uv[i * 2 + 1] = z * 0.8; } else if (ax >= az) { uv[i * 2] = z * 0.8; uv[i * 2 + 1] = y * 0.8; } else { uv[i * 2] = x * 0.8; uv[i * 2 + 1] = y * 0.8; }
        const bn = Math.sin(y * 26 + fbm3(x * 2, y * 2, z * 2) * 3.0);
        c.copy(sand).lerp(sandD, clamp(fbm3(x * 3.1, y * 3.1, z * 3.1) + 0.5));
        c.lerp(bn > 0.55 ? band : bandD, Math.abs(bn) > 0.55 ? 0.35 : 0);
        const cav = fbm3(x * 7 + 3, y * 7, z * 7 - 2), grain = vnoise3(x * 38, y * 38, z * 38) * 0.5 + vnoise3(x * 90, y * 90, z * 90) * 0.5; c.multiplyScalar((0.78 + 0.38 * clamp(cav + 0.5)) * (0.9 + 0.12 * grain));
        const mk = clamp((ny - 0.7) * 3.0 + fbm3(x * 3, y * 3, z * 3) * 1.6 - 0.25) * (0.5 + 0.5 * (1 - smooth(0.2, 0.9, y - H(x, z))));
        c.lerp(moss.clone().lerp(mossD, clamp(fbm3(x * 9, y * 9, z * 9) + 0.5)), mk * 0.8);
        const lv = vnoise3(x * 14, y * 14, z * 14); if (lv > 0.62 && mk < 0.4) c.lerp(hash3(Math.floor(x * 14), Math.floor(y * 14), Math.floor(z * 14)) > 0.8 ? lichO : lich, 0.55);
        const foot = 1 - smooth(0.0, 0.12, y - H(x, z)); c.multiplyScalar(1 - foot * 0.35);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }
    function slab(sx, sy, sz, seed) {
      const g = new THREE.BoxGeometry(1, 1, 1, 34, 12, 26), p = g.attributes.position, v = new V(), c = new V();
      const r = Math.min(sy * 0.28, 0.07), ix = sx / 2 - r, iy = sy / 2 - r, iz = sz / 2 - r;
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i) * sx, p.getY(i) * sy, p.getZ(i) * sz);
        c.set(clamp(v.x, -ix, ix), clamp(v.y, -iy, iy), clamp(v.z, -iz, iz));
        const d = v.clone().sub(c); if (d.lengthSq() > 1e-9) v.copy(c).addScaledVector(d.normalize(), r); else d.copy(v).normalize();
        const n1 = fbm3(v.x * 2.3 + seed, v.y * 2.3, v.z * 2.3 - seed), n2 = 1 - Math.abs(vnoise3(v.x * 6 + seed, v.y * 6, v.z * 6) );
        const groove = smooth(0.8, 1.0, Math.abs(Math.sin(v.y * 44 + n1 * 2.5)));
        const dd = n1 * 0.055 + (n2 > 0.93 ? -0.03 * (n2 - 0.93) / 0.07 : 0) - groove * 0.012 + Math.max(0, d.y) * fbm3(v.x * 5, 0, v.z * 5) * 0.03;
        v.addScaledVector(d, dd);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      return weld(g);
    }
    function boulder(seed) {
      const g = blobGeo(5, 0.22, 1.25, seed), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const r = 1 - Math.abs(vnoise3(x * 3.5 + seed, y * 3.5, z * 3.5)); let s = 1 - (r > 0.9 ? (r - 0.9) * 0.4 : 0) + fbm3(x * 7, y * 7, z * 7) * 0.03; const yy = y < -0.35 ? -0.35 + (y + 0.35) * 0.3 : y; p.setXYZ(i, x * s, yy * s, z * s); }
      return g;
    }
    const parts = [], hG = H(ROCK.x, ROCK.z);
    const place = (g, x, y, z, ry, rx = 0, rz = 0) => { g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(ROCK.x + x, y, ROCK.z + z); parts.push(finish(g)); };
    const S = [[0, 0.1, 0, 1.75, 0.36, 1.3, 0.15, 0.04, 0.02], [-0.18, 0.4, -0.06, 1.28, 0.3, 0.98, 0.32, 0.0, 0.05], [-0.3, 0.66, -0.12, 0.84, 0.27, 0.72, 0.06, 0.05, -0.06], [-0.38, 0.87, -0.14, 0.46, 0.19, 0.42, 0.5, 0.0, 0.1]];
    S.forEach(([x, y, z, sx, sy, sz, ry, rx, rz], i) => { place(slab(sx, sy, sz, 3.7 + i * 5.1), x, hG + y, z, ry, rx, rz); rockColliders.push({ x: ROCK.x + x, y: hG + y, z: ROCK.z + z, rx: sx / 2 + 0.2, ry: sy / 2 + 0.2, rz: sz / 2 + 0.2 }); });
    const Bd = [[0.62, 0.2, 0.5, 0.36, 0.3, 0.33], [0.78, 0.1, -0.38, 0.27, 0.2, 0.25], [-0.82, 0.24, 0.52, 0.42, 0.36, 0.37], [0.18, 0.66, 0.24, 0.22, 0.18, 0.2], [-0.84, 0.15, -0.58, 0.3, 0.23, 0.27], [0.95, 0.06, 0.12, 0.16, 0.12, 0.15]];
    Bd.forEach(([x, y, z, a, b, c], i) => { const g = boulder(11 + i * 7.3); g.scale(a, b, c); const yy = (y > 0.5 ? hG : H(ROCK.x + x, ROCK.z + z)) + y; place(g, x, yy, z, rng() * 6.28); rockColliders.push({ x: ROCK.x + x, y: yy, z: ROCK.z + z, rx: a + 0.2, ry: b + 0.2, rz: c + 0.2 }); });
    for (let i = 0; i < 16; i++) { const a = rng() * 6.28, r = rr(0.95, 1.45), x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.9; const s = rr(0.04, 0.1), g = boulder(40 + i * 3.1); g.scale(s, s * rr(0.5, 0.8), s * rr(0.8, 1.2)); place(g, x, H(ROCK.x + x, ROCK.z + z) + s * 0.25, z, rng() * 6.28); }
    const rm = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'uv', 'color']), rockMat); rm.castShadow = rm.receiveShadow = true; scene.add(rm);

    // ferns tucked against the stone
    const fernTex = canvasTex(128, 256, (g, w, h) => {
      g.lineCap = 'round'; g.strokeStyle = '#4a6b25'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 256); g.quadraticCurveTo(66, 128, 64, 4); g.stroke();
      for (let i = 0; i < 34; i++) { const t = i / 34, y = 250 - t * 244, L = 58 * Math.sin(Math.PI * (0.12 + 0.88 * (1 - t)) * 0.9) * (1 - t * 0.55);
        [-1, 1].forEach(sd => { const c = 70 + Math.floor(rng() * 40 + t * 30); g.fillStyle = `rgb(${c * 0.45 | 0},${c | 0},${c * 0.35 | 0})`; g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + sd * L * 0.5, y - 8, 64 + sd * L, y - 12 - t * 4); g.quadraticCurveTo(64 + sd * L * 0.55, y + 2, 64, y + 5); g.fill(); }); }
    });
    const fg = new THREE.PlaneGeometry(1, 1, 1, 8); fg.translate(0, 0.5, 0); { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -0.45 * y * y); } fg.computeVertexNormals(); }
    const fMat = new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.6 });
    addFlutter(fMat, 0.012);
    const fr = [];
    [[0.95, 0.35], [0.4, 0.72], [-0.3, 0.78], [-1.15, 0.1], [-0.55, -0.82], [0.6, -0.72], [1.1, -0.2]].forEach(([cx, cz]) => {
      const x0 = ROCK.x + cx, z0 = ROCK.z + cz, y0 = H(x0, z0) - 0.01, n = 8 + Math.floor(rng() * 5), sc = rr(0.75, 1.15);
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.28 + rr(-0.25, 0.25), tilt = rr(0.45, 1.05), len = rr(0.32, 0.5) * sc;
        const d = new V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
        const q = new THREE.Quaternion().setFromUnitVectors(UPV, d); q.multiply(new THREE.Quaternion().setFromAxisAngle(UPV, rr(-0.3, 0.3) + (Math.PI / 2)));
        const m = new THREE.Matrix4().compose(new V(x0, y0, z0), q, new V(len * 0.42, len, len)); fr.push([m, new THREE.Color(rr(0.8, 1.05), rr(0.9, 1.1), rr(0.75, 0.95))]);
      }
    });
    const fm = new THREE.InstancedMesh(fg, fMat, fr.length); fr.forEach(([m, c], i) => { fm.setMatrixAt(i, m); fm.setColorAt(i, c); });
    fm.castShadow = fm.receiveShadow = true; fm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: fernTex, alphaTest: 0.45 }); scene.add(fm);
  }
}
