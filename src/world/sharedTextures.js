import * as THREE from 'three';
import { rng, rr } from '../core/random.js';
import { hash2, vnoise2 } from '../core/noise.js';
import { canvasTex } from '../core/canvasTexture.js';

/** Procedural textures shared by several assets (ground detail, bark, leaf, needles, soft sprite). */
export function createSharedTextures(maxAniso) {
  const detailTex = canvasTex(256, 256, (g, w, h) => {
  const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = 0.5 + 0.5 * (0.6 * vnoise2(x / 9, y / 9) + 0.4 * vnoise2(x / 3.1, y / 3.1));
      const speck = hash2(x, y) > 0.965 ? 0.75 : 1;
      const v = Math.round(255 * (0.78 + 0.22 * n) * speck); const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.repeat.set(9, 9); detailTex.anisotropy = maxAniso;
  
  const barkTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#8a7a68'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = rng() * w, y = rng() * h, len = 10 + rng() * 50, s = Math.floor(40 + rng() * 60);
      g.strokeStyle = `rgba(${s * 0.5 | 0},${s * 0.42 | 0},${s * 0.33 | 0},${0.35 + rng() * 0.4})`; g.lineWidth = 1 + rng() * 3;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-4, 4), y + len * 0.3, x + rr(-4, 4), y + len * 0.6, x + rr(-3, 3), y + len); g.stroke();
    }
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(210,200,180,${rng() * 0.18})`; g.fillRect(rng() * w, rng() * h, 2 + rng() * 6, 1 + rng() * 3); }
  });
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping; barkTex.repeat.set(1, 2);
  
  const leafTex = canvasTex(128, 128, (g) => {
    g.translate(64, 64);
    g.beginPath(); g.moveTo(0, -60); g.bezierCurveTo(44, -38, 40, 32, 0, 62); g.bezierCurveTo(-40, 32, -44, -38, 0, -60); g.closePath();
  const grd = g.createLinearGradient(-44, 0, 44, 0); grd.addColorStop(0, '#4f8130'); grd.addColorStop(0.5, '#79a846'); grd.addColorStop(1, '#43732a');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(214,236,160,.55)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -56); g.lineTo(0, 60); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(214,236,160,.32)';
    for (let i = -3; i <= 3; i++) { const y = i * 14; g.beginPath(); g.moveTo(0, y + 6); g.lineTo(26, y - 8); g.moveTo(0, y + 6); g.lineTo(-26, y - 8); g.stroke(); }
  });
  const needleTex = canvasTex(256, 128, (g, w, h) => {
    g.lineCap = 'round';
    g.strokeStyle = '#5b4630'; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 64); g.quadraticCurveTo(128, 58, 250, 64); g.stroke();
    for (let i = 0; i < 150; i++) {
      const t = i / 150, x = 8 + t * 236, side = i % 2 ? 1 : -1, len = (28 + rng() * 22) * (1 - t * 0.45);
      const ang = side * (0.75 + rng() * 0.45);
      const c = 60 + Math.floor(rng() * 40 + t * 35);
      g.strokeStyle = `rgb(${c * 0.42 | 0},${c | 0},${c * 0.45 | 0})`; g.lineWidth = 2.1;
      g.beginPath(); g.moveTo(x, 64); g.lineTo(x + Math.cos(ang) * len * 0.55 + 6, 64 + Math.sin(ang) * len); g.stroke();
    }
  });
  const softDot = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  return { detailTex, barkTex, leafTex, needleTex, softDot };
}
