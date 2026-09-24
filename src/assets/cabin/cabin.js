import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr } from '../../core/random.js';
import { V, UPV, clamp, lin } from '../../core/math.js';
import { vnoise2, fbm2, fbm3 } from '../../core/noise.js';
import { blobGeo, paint, mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { U } from '../../core/uniforms.js';
import { HOUSE, PAD_H, CB, roofY } from '../../world/layout.js';

/**
 * Furnished, enterable log cabin: saddle-notched log walls, shingled roof, stone fireplace with animated fire, windows, door,
 * furniture and props, interior lights and exterior details. Returns the cabin state plus setLights, toggleDoor and update(dt, t).
 */
export function createCabin(ctx) {
  const { scene, camera, maxAniso } = ctx;
  const { barkTex, leafTex, softDot } = ctx.tex;
  const cabin = { lamps: [], glows: [], windows: [], lightsOn: true, door: null, boxes: [], fireLight: null, emberMat: null, sparks: null, smoke: [], hands: null, pendulum: null, group: null };
  {
    const { FL, R, S, XW, ZW, EAVE, PITCH } = CB;
    const house = new THREE.Group(); house.position.set(HOUSE.x, PAD_H, HOUSE.z); scene.add(house); cabin.group = house;
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t; };
    function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }

    /* textures */
    const logTex = rep(canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#a8743f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 520; i++) {
        const x = rng() * w, y = rng() * h, L = 40 + rng() * 260;
        g.strokeStyle = rng() < 0.5 ? `rgba(90,52,22,${0.08 + rng() * 0.25})` : `rgba(215,170,110,${0.06 + rng() * 0.2})`;
        g.lineWidth = 0.6 + rng() * 2.2; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-5, 5), y + L * 0.33, x + rr(-5, 5), y + L * 0.66, x + rr(-4, 4), y + L); g.stroke();
      }
      for (let i = 0; i < 14; i++) { const x = rng() * w, y = rng() * h; g.strokeStyle = 'rgba(40,22,10,.55)'; g.lineWidth = 1 + rng() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-3, 3), y + 30 + rng() * 120); g.stroke(); }
      for (let i = 0; i < 6; i++) { const x = rng() * w, y = rng() * h, r = 5 + rng() * 9; const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.4); gr.addColorStop(0, 'rgba(60,32,12,.9)'); gr.addColorStop(0.45, 'rgba(90,52,22,.5)'); gr.addColorStop(1, 'rgba(90,52,22,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.2, r * 2.4, 0, 0, 6.28); g.fill(); }
    }));
    const endTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#c79a62'; g.fillRect(0, 0, 128, 128);
      for (let r = 60; r > 0; r -= 3 + rng() * 2) { g.strokeStyle = `rgba(120,75,35,${0.25 + rng() * 0.3})`; g.lineWidth = 1 + rng(); g.beginPath(); g.ellipse(64 + rr(-1, 1), 64 + rr(-1, 1), r, r * rr(0.95, 1.02), 0, 0, 6.28); g.stroke(); }
      g.strokeStyle = 'rgba(60,35,15,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + rr(25, 55), 64 + rr(-20, 20)); g.stroke();
      g.lineWidth = 6; g.strokeStyle = '#5a3a1c'; g.beginPath(); g.arc(64, 64, 61, 0, 6.28); g.stroke();
    });
    function plankCanvas(g, w, h, n, base) {
      for (let i = 0; i < n; i++) {
        const y0 = i * h / n, ph = h / n, tone = rr(-18, 18);
        g.fillStyle = `rgb(${base[0] + tone | 0},${base[1] + tone * 0.8 | 0},${base[2] + tone * 0.6 | 0})`; g.fillRect(0, y0, w, ph);
        for (let k = 0; k < 40; k++) { g.strokeStyle = rng() < 0.5 ? `rgba(60,35,15,${rng() * 0.2})` : `rgba(230,190,140,${rng() * 0.16})`; g.lineWidth = 0.5 + rng() * 1.5; const yy = y0 + rng() * ph; g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(w * 0.33, yy + rr(-4, 4), w * 0.66, yy + rr(-4, 4), w, yy + rr(-3, 3)); g.stroke(); }
        g.fillStyle = 'rgba(30,18,8,.7)'; g.fillRect(rng() * w, y0, 2, ph);
        g.fillStyle = 'rgba(25,15,6,.85)'; g.fillRect(0, y0, w, 2);
      }
    }
    const floorTex = rep(canvasTex(512, 512, (g, w, h) => plankCanvas(g, w, h, 6, [140, 98, 60])));
    const boardTex = rep(canvasTex(512, 512, (g, w, h) => plankCanvas(g, w, h, 5, [118, 82, 50])));
    const boardTexV = boardTex.clone(); boardTexV.center.set(0.5, 0.5); boardTexV.rotation = Math.PI / 2; boardTexV.needsUpdate = true;
    const shingleTex = rep(canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#231c16'; g.fillRect(0, 0, w, h);
      const rows = 8, rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rng() * 40;
        while (x < w) {
          const sw = 28 + rng() * 42, t = rng(), c = [92 + t * 40, 80 + t * 30, 68 + t * 22];
          const gr = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
          gr.addColorStop(0, `rgb(${c[0] * 0.75 | 0},${c[1] * 0.75 | 0},${c[2] * 0.75 | 0})`); gr.addColorStop(0.85, `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`); gr.addColorStop(1, 'rgb(35,28,22)');
          g.fillStyle = gr; g.fillRect(x, r * rh, sw - 2, rh - 1);
          for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(40,30,20,${rng() * 0.25})`; g.fillRect(x + rng() * sw, r * rh, 1, rh); }
          if (rng() < 0.15) { g.fillStyle = 'rgba(80,110,50,.25)'; g.fillRect(x, r * rh + rh * 0.5, sw - 2, rh * 0.5); }
          x += sw;
        }
      }
    }));
    const stoneTex = rep(canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#77716a'; g.fillRect(0, 0, w, h);
      let y = 0;
      while (y < h) {
        const rh = 40 + rng() * 36; let x = -rng() * 60;
        while (x < w) {
          const sw = 50 + rng() * 80, t = rng(), b = [118 + t * 50, 110 + t * 42, 98 + t * 35];
          const gr = g.createLinearGradient(x, y, x, y + rh); gr.addColorStop(0, `rgb(${b[0] + 22 | 0},${b[1] + 22 | 0},${b[2] + 20 | 0})`); gr.addColorStop(1, `rgb(${b[0] - 28 | 0},${b[1] - 28 | 0},${b[2] - 28 | 0})`);
          g.fillStyle = gr; rrect(g, x + 3 + rng() * 3, y + 3 + rng() * 3, sw - 8, rh - 8, 9); g.fill();
          x += sw;
        }
        y += rh;
      }
      for (let i = 0; i < 4000; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'; g.fillRect(rng() * w, rng() * h, 1.5, 1.5); }
    }));
    const quiltTex = rep(canvasTex(512, 512, (g, w, h) => {
      const pal = ['#a8352b', '#efe2c4', '#34557a', '#6f8f45', '#d3a03d', '#7f4f33', '#c8d4dc'], n = 8, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = pal[Math.floor(rng() * pal.length)]; g.fillRect(i * s, j * s, s, s);
        const r = rng();
        if (r < 0.3) { g.fillStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 12; k++) { g.beginPath(); g.arc(i * s + rng() * s, j * s + rng() * s, 2.2, 0, 6.28); g.fill(); } }
        else if (r < 0.55) { g.fillStyle = 'rgba(0,0,0,.15)'; for (let k = 0; k < s; k += 8) g.fillRect(i * s + k, j * s, 4, s); }
        else if (r < 0.72) { g.fillStyle = pal[Math.floor(rng() * pal.length)]; g.beginPath(); g.moveTo(i * s, j * s); g.lineTo(i * s + s, j * s + s); g.lineTo(i * s, j * s + s); g.fill(); }
      }
      g.strokeStyle = 'rgba(255,250,235,.7)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s - 3, 0); g.lineTo(i * s - 3, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s - 3); g.lineTo(w, i * s - 3); g.stroke(); }
      g.setLineDash([]);
    }));
    const ginghamTex = rep(canvasTex(64, 64, (g) => { g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(165,30,28,.55)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 8, 64); g.fillRect(0, i, 64, 8); } }));
    const plaidTex = rep(canvasTex(128, 128, (g) => { g.fillStyle = '#7d1f1a'; g.fillRect(0, 0, 128, 128); [[0, 20, 'rgba(20,40,25,.8)'], [28, 6, 'rgba(230,200,90,.7)'], [50, 26, 'rgba(20,30,45,.7)'], [90, 4, 'rgba(240,240,230,.6)']].forEach(([p, wd, c]) => { g.fillStyle = c; g.fillRect(p, 0, wd, 128); g.fillRect(0, p, 128, wd); }); }));
    const tweedTex = rep(canvasTex(128, 128, (g) => { g.fillStyle = '#8a5a3e'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 2600; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(40,25,15,.35)' : 'rgba(220,180,130,.28)'; g.fillRect(rng() * 128, rng() * 128, 2 + rng() * 3, 1); } }));
    const rugTex = canvasTex(512, 512, (g) => {
      const pal = ['#8c2f25', '#d8c9a3', '#3b5673', '#a0662e', '#5d6e3a', '#d8c9a3', '#6b2a3a'];
      g.fillStyle = '#6b2a24'; g.fillRect(0, 0, 512, 512);
      for (let r = 250, i = 0; r > 6; r -= 12, i++) {
        g.strokeStyle = pal[i % pal.length]; g.lineWidth = 11; g.beginPath(); g.arc(256, 256, r, 0, 6.28); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1.2;
        for (let a = 0; a < 6.28; a += 7 / r) { g.beginPath(); g.moveTo(256 + Math.cos(a) * (r - 5), 256 + Math.sin(a) * (r - 5)); g.lineTo(256 + Math.cos(a + 3 / r) * (r + 5), 256 + Math.sin(a + 3 / r) * (r + 5)); g.stroke(); }
      }
    });
    const paintTex = canvasTex(256, 180, (g, w, h) => {
      const sk = g.createLinearGradient(0, 0, 0, h * 0.62); sk.addColorStop(0, '#2c3e66'); sk.addColorStop(0.6, '#d9895a'); sk.addColorStop(1, '#f2c27a'); g.fillStyle = sk; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,235,190,.9)'; g.beginPath(); g.arc(170, 88, 13, 0, 6.28); g.fill();
      [['#5b4b6e', 70, 40], ['#3f3a55', 95, 30], ['#26303d', 112, 22]].forEach(([c, base, amp], L) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 6) g.lineTo(x, base - Math.abs(Math.sin(x * 0.03 + L * 2)) * amp - vnoise2(x * 0.05, L * 7) * 8); g.lineTo(w, h); g.fill(); });
      const lk = g.createLinearGradient(0, 118, 0, h); lk.addColorStop(0, '#c9876a'); lk.addColorStop(1, '#2c3e66'); g.fillStyle = lk; g.fillRect(0, 118, w, h - 118);
      g.fillStyle = '#16211a'; for (let i = 0; i < 26; i++) { const x = rng() * w, s = 8 + rng() * 14, b = 124 + rng() * 40; g.beginPath(); g.moveTo(x, b - s * 2.2); g.lineTo(x + s * 0.5, b); g.lineTo(x - s * 0.5, b); g.fill(); }
    });
    const mapTex = canvasTex(256, 192, (g, w, h) => {
      g.fillStyle = '#e6d6ad'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#cdb988'; g.strokeStyle = '#6b5533'; g.lineWidth = 1.5; g.beginPath();
      for (let a = 0; a <= 6.3; a += 0.1) { const r = 62 + fbm2(Math.cos(a) * 2, Math.sin(a) * 2) * 40; const x = 128 + Math.cos(a) * r * 1.4, y = 96 + Math.sin(a) * r; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#9fb5b0'; g.beginPath(); g.ellipse(110, 90, 16, 9, 0.4, 0, 6.28); g.fill();
      g.strokeStyle = '#8c2f25'; g.setLineDash([4, 3]); g.lineWidth = 1.6; g.beginPath(); g.moveTo(60, 130); g.bezierCurveTo(100, 60, 150, 140, 190, 70); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#4a3a22'; g.lineWidth = 1; g.beginPath(); g.moveTo(225, 20); g.lineTo(225, 50); g.moveTo(210, 35); g.lineTo(240, 35); g.stroke();
      g.fillStyle = '#4a3a22'; g.font = 'italic 11px Georgia, serif'; g.fillText('N', 221, 16);
      const vg = g.createRadialGradient(128, 96, 60, 128, 96, 150); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,60,20,.45)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    });
    const clockTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(64, 64, 62, 0, 6.28); g.fill(); g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.stroke();
      for (let i = 0; i < 60; i++) { const a = i / 60 * 6.28, r1 = i % 5 ? 55 : 49; g.lineWidth = i % 5 ? 1 : 2.5; g.beginPath(); g.moveTo(64 + Math.sin(a) * r1, 64 - Math.cos(a) * r1); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); }
      g.fillStyle = '#3a2a1a'; g.font = 'bold 14px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      ['XII', 'III', 'VI', 'IX'].forEach((s, i) => { const a = i * Math.PI / 2; g.fillText(s, 64 + Math.sin(a) * 37, 64 - Math.cos(a) * 37); });
    });
    const emberTex = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.lineCap = 'round';
      for (let i = 0; i < 70; i++) { const x = rng() * w, y = rng() * h; g.strokeStyle = `rgba(255,${120 + rng() * 90 | 0},30,${0.5 + rng() * 0.5})`; g.lineWidth = 1 + rng() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-20, 20), y + rr(-40, 40)); g.stroke(); }
      for (let i = 0; i < 25; i++) { const x = rng() * w, y = rng() * h, r = 6 + rng() * 14; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,170,60,.9)'); gr.addColorStop(1, 'rgba(255,80,10,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    });

    /* materials */
    const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0, envMapIntensity: 0.35 }, o));
    const M = {
      log: std({ map: logTex, vertexColors: true, roughness: 0.82 }),
      logP: std({ map: logTex, roughness: 0.8 }),
      end: std({ map: endTex, roughness: 0.9 }),
      floor: std({ map: floorTex, roughness: 0.6 }),
      board: std({ map: boardTex, roughness: 0.75 }),
      boardDS: std({ map: boardTex, roughness: 0.8, side: THREE.DoubleSide }),
      trim: std({ map: boardTex, color: lin(0x9a7c62), roughness: 0.7 }),
      door: std({ map: boardTexV, color: lin(0xb08a66), roughness: 0.7 }),
      furn: std({ map: boardTex, color: lin(0xe0bc92), roughness: 0.55 }),
      dark: std({ map: boardTex, color: lin(0x7a5c46), roughness: 0.6 }),
      shingle: std({ map: shingleTex, bumpMap: shingleTex, bumpScale: 0.8, roughness: 0.92, envMapIntensity: 0.6 }),
      stone: std({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.9, roughness: 0.92 }),
      soot: std({ map: stoneTex, color: lin(0x3a342e), roughness: 1 }),
      iron: std({ color: lin(0x2b2b2e), roughness: 0.45, metalness: 0.75 }),
      brass: std({ color: lin(0xc9a052), roughness: 0.28, metalness: 0.95, envMapIntensity: 0.8 }),
      glass: std({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.03, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
      jar: std({ color: 0xe8f0ea, transparent: true, opacity: 0.32, roughness: 0.05, envMapIntensity: 1.2, depthWrite: false }),
      linen: std({ color: lin(0xf1ece2), roughness: 0.9 }),
      ceramic: std({ color: lin(0xf3efe6), roughness: 0.25, envMapIntensity: 0.6 }),
      blueC: std({ color: lin(0x3e6a8a), roughness: 0.3, envMapIntensity: 0.6 }),
      brownC: std({ color: lin(0x7a4a2a), roughness: 0.35, envMapIntensity: 0.6 }),
      terra: std({ color: lin(0xb5643a), roughness: 0.85 }),
      wax: std({ color: lin(0xf2e6c8), roughness: 0.6, emissive: lin(0xffb070), emissiveIntensity: 0.06 }),
      quilt: std({ map: quiltTex, roughness: 0.95 }),
      plaid: std({ map: plaidTex, roughness: 0.95 }),
      tweed: std({ map: tweedTex, roughness: 0.95 }),
      curtain: std({ map: ginghamTex, roughness: 0.9, side: THREE.DoubleSide }),
      rug: std({ map: rugTex, roughness: 1 }),
      wool: std({ color: lin(0x3b4a5a), roughness: 0.95 }),
      felt: std({ color: lin(0x5a4230), roughness: 0.95 }),
      mat: std({ color: lin(0x8a6a3a), roughness: 1 }),
      stones: std({ vertexColors: true, roughness: 0.9 }),
      black: new THREE.MeshBasicMaterial({ color: 0x050403 })
    };
    M.ember = std({ map: barkTex, color: lin(0x3a2c22), emissive: new THREE.Color(1.0, 0.36, 0.08), emissiveMap: emberTex, emissiveIntensity: 1.2, roughness: 1 });
    cabin.emberMat = M.ember;

    /* helpers */
    function tbox(w, h, d, scale = 1) {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dims[f][0] / scale, uv.getY(j) * dims[f][1] / scale); }
      return g;
    }
    function mk(geo, mat, x, y, z, parent = house) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
    function boxB(x0, x1, y0, y1, z0, z1, mat, scale = 1, parent = house) { return mk(tbox(x1 - x0, y1 - y0, z1 - z0, scale), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent); }
    const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    const lathe = (pts, seg = 22) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
    function glow(parent, x, y, z, size, color, op) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(x, y, z); s.scale.set(size, size, 1); parent.add(s); cabin.glows.push({ s, size, ph: rng() * 10 }); return s;
    }
    const flameVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
    const flameFS = `uniform float uTime; uniform float uSeed; uniform float uAmp; uniform float uGain; varying vec2 vUv;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float ns(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hs(i),hs(i+vec2(1,0)),f.x), mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x), f.y); }
      float fb(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*ns(p); p*=2.1; a*=0.5; } return s; }
      void main(){
        vec2 uv = vUv; float t = uTime*uAmp;
        float n = fb(vec2(uv.x*3.0 + uSeed, uv.y*2.6 - t*2.4));
        float x = (uv.x - 0.5)*2.0 + (n - 0.5)*0.7*uv.y;
        float w = mix(0.8, 0.06, pow(uv.y, 0.8));
        float body = 1.0 - smoothstep(w*0.45, w, abs(x));
        float top = 1.0 - smoothstep(0.35, 1.0, uv.y + (n-0.5)*0.55);
        float f = clamp(body * top * smoothstep(0.0, 0.08, uv.y) * 1.6, 0.0, 1.0);
        vec3 col = mix(vec3(0.95,0.28,0.04), vec3(1.0,0.78,0.35), smoothstep(0.3, 0.95, f));
        col = mix(col, vec3(1.0,0.95,0.8), smoothstep(0.85,1.0,f)*(1.0-uv.y));
        gl_FragColor = vec4(col*f*uGain, 1.0);
      }`;
    const flameBase = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uSeed: { value: 0 }, uAmp: { value: 1 }, uGain: { value: 1.5 } }, vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    function flame(parent, x, y, z, w, h, seed, amp = 1, gain = 1.5, n = 3) {
      const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
      for (let i = 0; i < n; i++) {
        const m = flameBase.clone(); m.uniforms.uTime = U.uTime; m.uniforms.uSeed.value = seed + i * 3.7; m.uniforms.uAmp.value = amp; m.uniforms.uGain.value = gain;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.y = h / 2; p.rotation.y = i * Math.PI / n; p.userData.noShadow = true; p.renderOrder = 5; g.add(p);
      }
      return g;
    }
    function candle(parent, x, y, z, h) {
      mk(cyl(0.05, 0.055, 0.012, 20), M.brass, x, y + 0.006, z, parent);
      mk(cyl(0.017, 0.018, h, 14), M.wax, x, y + 0.012 + h / 2, z, parent);
      flame(parent, x, y + 0.012 + h + 0.003, z, 0.028, 0.058, rng() * 10, 1.6, 1.7, 2);
      glow(parent, x, y + h + 0.05, z, 0.22, 0xffa050, 0.32);
    }
    const addLamp = (light, base, flames, mats) => { cabin.lamps.push({ light, base, flames, mats }); };

    /* ---- walls of logs ---- */
    const logs = [], caps = [];
    function addLog(axis, a0, a1, y, c, r = R) {
      const len = a1 - a0; if (len < 0.1) return;
      const r0 = r * rr(0.95, 1.05);
      const g = new THREE.CylinderGeometry(r0, r0, len, 16, 1, true);
      const uv = g.attributes.uv, off = rng();
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + off, uv.getY(i) * len / 1.2 + off * 3);
      const tone = rr(0.82, 1.08), col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = tone; col[i + 1] = tone * 0.98; col[i + 2] = tone * 0.95; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const e0 = new THREE.CircleGeometry(r0 * 0.985, 16), e1 = new THREE.CircleGeometry(r0 * 0.985, 16);
      if (axis === 'x') { g.rotateZ(Math.PI / 2); g.translate((a0 + a1) / 2, y, c); e0.rotateY(-Math.PI / 2); e0.translate(a0, y, c); e1.rotateY(Math.PI / 2); e1.translate(a1, y, c); }
      else { g.rotateX(Math.PI / 2); g.translate(c, y, (a0 + a1) / 2); e0.rotateY(Math.PI); e0.translate(c, y, a0); e1.translate(c, y, a1); }
      logs.push(g); caps.push(e0, e1);
    }
    const yX = [], yZ = [];
    for (let k = 0; k < 12; k++) yX.push(0.24 + k * S);
    for (let k = 0; k < 20; k++) yZ.push(0.335 + k * S);
    const OPS = {
      front: { lo: -0.6, hi: 0.25, y0: 1.15, y1: 1.9 },
      door: { lo: 0.55, hi: 1.35, y0: FL, y1: FL + 1.85, door: true },
      back: { lo: -0.9, hi: 0.0, y0: 1.45, y1: 2.1 },
      side: { lo: -0.3, hi: 0.4, y0: 1.4, y1: 2.0 }
    };
    function gapFor(op, ys) { const cut = ys.filter(y => y + R * 0.6 > op.y0 && y - R * 0.6 < op.y1); const lo = Math.min(...cut), hi = Math.max(...cut); op.cut = new Set(cut); op.bottom = lo - S + R; op.top = hi + S - R; }
    const walls = [
      { axis: 'x', c: ZW, ys: yX, ops: [OPS.front, OPS.door], n: 1 },
      { axis: 'x', c: -ZW, ys: yX, ops: [OPS.back], n: -1 },
      { axis: 'z', c: XW, ys: yZ, ops: [OPS.side], n: 1 },
      { axis: 'z', c: -XW, ys: yZ, ops: [], n: -1 }];
    walls.forEach(w => w.ops.forEach(op => gapFor(op, w.ys)));
    walls.forEach(w => {
      w.ys.forEach(y => {
        let half = w.axis === 'x' ? XW + 0.26 : ZW + 0.26;
        if (w.axis === 'z') half = Math.min(half, ZW + 0.11 - (y + R - EAVE) / PITCH - 0.03);
        if (half < 0.12) return;
        let segs = [[-half, half]];
        w.ops.forEach(op => {
          if (!op.cut.has(y)) return;
          const nx = []; segs.forEach(([a, b]) => { if (op.hi <= a || op.lo >= b) nx.push([a, b]); else { if (op.lo > a) nx.push([a, op.lo]); if (op.hi < b) nx.push([op.hi, b]); } }); segs = nx;
        });
        segs.forEach(([a, b]) => addLog(w.axis, a, b, y, w.c));
      });
    });
    // gable infill boards (hidden behind the gable logs, close gaps under the roof)
    const tri = new THREE.Shape(); tri.moveTo(-ZW - 0.11, EAVE - 0.08); tri.lineTo(ZW + 0.11, EAVE - 0.08); tri.lineTo(0, roofY(0)); tri.closePath();
    [XW, -XW].forEach(x => { const g = new THREE.ShapeGeometry(tri); g.rotateY(Math.PI / 2); g.translate(x, 0, 0); house.add(new THREE.Mesh(g, M.boardDS)); });

    // opening frames, glass, muntins
    function frameOp(w, op) {
      const b = op.bottom, t = op.top, lo = op.lo, hi = op.hi, J = 0.12, E = 0.02, D2 = 0.17;
      const add = (u0, u1, v0, v1, w0, w1, mat, sc = 0.6) => w.axis === 'x' ? boxB(u0, u1, v0, v1, w.c + w0, w.c + w1, mat, sc) : boxB(w.c + w0, w.c + w1, v0, v1, u0, u1, mat, sc);
      add(lo - J, lo + E, op.door ? b - 0.01 : b - J, t + J, -D2, D2, M.trim);
      add(hi - E, hi + J, op.door ? b - 0.01 : b - J, t + J, -D2, D2, M.trim);
      add(lo - J, hi + J, t - E, t + J, -D2, D2, M.trim);
      if (op.door) { add(lo, hi, b - 0.02, b + 0.02, -D2, D2, M.dark); return; }
      add(lo - J - 0.04, hi + J + 0.04, b - J, b + E, -D2 - 0.05, D2 + 0.05, M.trim);
      const gl = add(lo, hi, b, t, -0.004, 0.004, M.glass); gl.userData.noShadow = true;
      const mu = (lo + hi) / 2, mv = (b + t) / 2, sd = Math.sign(w.c) || 1;
      cabin.windows.push(w.axis === 'x' ? { c: new V(mu, mv, w.c), n: new V(0, 0, sd), w: hi - lo, h: t - b } : { c: new V(w.c, mv, mu), n: new V(sd, 0, 0), w: hi - lo, h: t - b });   // house space
      add(mu - 0.015, mu + 0.015, b, t, -0.022, 0.022, M.trim);
      add(lo, hi, mv - 0.015, mv + 0.015, -0.022, 0.022, M.trim);
      add(lo, hi, b, b + 0.03, -0.03, 0.03, M.trim); add(lo, hi, t - 0.03, t, -0.03, 0.03, M.trim);
      add(lo, lo + 0.03, b, t, -0.03, 0.03, M.trim); add(hi - 0.03, hi, b, t, -0.03, 0.03, M.trim);
    }
    frameOp(walls[0], OPS.front); frameOp(walls[0], OPS.door); frameOp(walls[1], OPS.back); frameOp(walls[2], OPS.side);

    /* ---- floor & foundation ---- */
    boxB(-XW + 0.05, XW - 0.05, FL - 0.06, FL, -ZW + 0.05, ZW - 0.05, M.floor, 0.9);
    const fstones = [];
    const stoneAt = (x, z, sx, sy, sz, y) => { const g = blobGeo(2, 0.35, 1.6, rng() * 50); g.scale(sx, sy, sz); g.rotateY(rng() * 6.28); g.translate(x, y, z); g.computeVertexNormals(); const grey = lin(0x7a766d), grB = lin(0x57544f), moss = lin(0x4b5c26); paint(g, (c, px, py, pz, nx, ny) => { const n = fbm3(px * 9, py * 9, pz * 9); c.copy(grey).lerp(grB, clamp(n + 0.5)); c.lerp(moss, clamp((ny - 0.6) * 2 + n) * 0.5); }); fstones.push(g); };
    for (let x = -XW - 0.05; x <= XW + 0.05; x += 0.26) { stoneAt(x, ZW, rr(0.14, 0.18), rr(0.1, 0.13), 0.15, 0.03); stoneAt(x, -ZW, rr(0.14, 0.18), rr(0.1, 0.13), 0.15, 0.03); }
    for (let z = -ZW; z <= ZW; z += 0.26) { stoneAt(XW, z, 0.15, rr(0.15, 0.18), rr(0.14, 0.18), 0.08); stoneAt(-XW, z, 0.15, rr(0.15, 0.18), rr(0.14, 0.18), 0.08); }
    house.add(new THREE.Mesh(mergeGeos(fstones, ['position', 'normal', 'color']), M.stones));

    /* ---- roof ---- */
    const P = Math.atan(PITCH), RUN = ZW + 0.11 + 0.45, SL = RUN / Math.cos(P) + 0.05, RX = XW + 0.11 + 0.36, T = 0.07;
    const yMid = roofY(RUN / 2);
    [1, -1].forEach(s => {
      const deck = new THREE.Mesh(tbox(2 * RX, T, SL, 0.9), [M.trim, M.trim, M.shingle, M.board, M.trim, M.trim]);
      deck.position.set(0, yMid + Math.cos(P) * T / 2, s * (RUN / 2 + Math.sin(P) * T / 2)); deck.rotation.x = s * P; house.add(deck);
      for (let x = -RX + 0.04; x <= RX - 0.03; x += (2 * RX - 0.08) / 8) {
        const rf = mk(tbox(0.07, 0.14, SL, 0.6), M.dark, x, yMid - Math.cos(P) * 0.07, s * (RUN / 2 - Math.sin(P) * 0.07)); rf.rotation.x = s * P;
      }
      // fascia board at the eave
      const fa = mk(tbox(2 * RX, 0.16, 0.03, 0.6), M.trim, 0, roofY(RUN) - 0.02, s * (RUN + 0.02)); fa.rotation.x = s * P * 0.2;
    });
    const cap = mk(tbox(2 * RX + 0.04, 0.12, 0.12, 0.5), M.trim, 0, roofY(0) + T + 0.01, 0); cap.rotation.x = Math.PI / 4;
    addLog('x', -RX + 0.05, RX - 0.05, roofY(0) - 0.27, 0, 0.12);
    addLog('x', -RX + 0.1, RX - 0.1, roofY(0.8) - 0.24, 0.8, 0.085); addLog('x', -RX + 0.1, RX - 0.1, roofY(0.8) - 0.24, -0.8, 0.085);
    addLog('z', -ZW, ZW, 2.36, 0.55, 0.085); addLog('z', -ZW, ZW, 2.36, -0.75, 0.085);

    /* ---- door ---- */
    {
      const op = OPS.door, DH = op.top - op.bottom - 0.045, DW = op.hi - op.lo - 0.06, pw = DW / 5;
      const pivot = new THREE.Group(); pivot.position.set(op.lo + 0.03, op.bottom + 0.022, ZW - 0.02); house.add(pivot);
      for (let i = 0; i < 5; i++) { const m = mk(tbox(pw - 0.006, DH, 0.045, 0.6), M.door, pw * (i + 0.5), DH / 2, 0, pivot); m.material = M.door; }
      mk(tbox(DW - 0.06, 0.12, 0.025, 0.6), M.door, DW / 2, 0.32, -0.034, pivot);
      mk(tbox(DW - 0.06, 0.12, 0.025, 0.6), M.door, DW / 2, DH - 0.32, -0.034, pivot);
      const dl = Math.hypot(DW - 0.14, DH - 0.76), br = mk(tbox(dl, 0.1, 0.025, 0.6), M.door, DW / 2, DH / 2, -0.034, pivot); br.rotation.z = Math.atan2(DH - 0.76, DW - 0.14);
      [0.3, DH - 0.3].forEach(y => { mk(tbox(0.44, 0.045, 0.008), M.iron, 0.22, y, 0.027, pivot); mk(cyl(0.012, 0.012, 0.09, 8), M.iron, -0.005, y, 0.0, pivot); });
      const ring = mk(new THREE.TorusGeometry(0.035, 0.006, 8, 20), M.iron, DW - 0.1, 1.0, 0.04, pivot); ring.rotation.x = 0.3;
      mk(tbox(0.03, 0.06, 0.02), M.iron, DW - 0.1, 1.04, 0.032, pivot);
      mk(tbox(0.14, 0.025, 0.03), M.iron, DW - 0.12, 1.02, -0.045, pivot);
      cabin.door = { pivot, angle: 1.75, target: 1.75, lo: op.lo, hi: op.hi, top: op.top, world: new V(HOUSE.x + (op.lo + op.hi) / 2, PAD_H + FL + 1.0, HOUSE.z + ZW) };
    }

    /* ---- fireplace & chimney ---- */
    const FX = -XW + 0.11;
    boxB(FX, -0.72, FL - 0.02, FL + 0.1, -0.72, 0.72, M.stone, 0.8);
    boxB(FX, -1.02, FL + 0.1, FL + 0.85, -0.62, -0.34, M.stone, 0.8);
    boxB(FX, -1.02, FL + 0.1, FL + 0.85, 0.34, 0.62, M.stone, 0.8);
    boxB(FX, -1.42, FL + 0.1, FL + 0.85, -0.34, 0.34, M.soot, 0.8);
    boxB(-1.42, -1.03, FL + 0.1, FL + 0.84, -0.345, -0.335, M.soot, 0.8); boxB(-1.42, -1.03, FL + 0.1, FL + 0.84, 0.335, 0.345, M.soot, 0.8);
    boxB(-1.42, -1.03, FL + 0.83, FL + 0.85, -0.34, 0.34, M.soot, 0.8);
    boxB(FX, -1.02, FL + 0.85, FL + 1.2, -0.62, 0.62, M.stone, 0.8);
    boxB(-1.1, -0.9, FL + 1.2, FL + 1.3, -0.76, 0.76, M.dark, 0.6);
    boxB(FX, -1.14, FL + 1.3, 4.2, -0.46, 0.46, M.stone, 0.8);
    boxB(FX - 0.04, -1.1, 4.2, 4.27, -0.5, 0.5, M.stone, 0.8);
    boxB(-1.5, -1.22, 4.27, 4.272, -0.2, 0.2, M.black);
    const interiorFrom = new THREE.Object3D().id;   // everything built from here to the outside section is interior
    // andirons, logs, coals
    [-0.13, 0.13].forEach(z => { boxB(-1.4, -1.06, FL + 0.1, FL + 0.13, z - 0.015, z + 0.015, M.iron); boxB(-1.1, -1.06, FL + 0.1, FL + 0.24, z - 0.015, z + 0.015, M.iron); mk(new THREE.SphereGeometry(0.022, 10, 8), M.brass, -1.08, FL + 0.25, z); });
    const coal = mk(new THREE.SphereGeometry(0.2, 18, 8), M.ember, -1.24, FL + 0.1, 0); coal.scale.set(0.8, 0.18, 1.2);
    const lg = (x, y, z, rx, ry, rz, r, l) => { const m = mk(cyl(r, r * 0.9, l, 12), M.ember, x, y, z); m.rotation.set(rx, ry, rz); };
    lg(-1.26, FL + 0.18, 0, Math.PI / 2, 0, 0.1, 0.05, 0.44);
    lg(-1.18, FL + 0.19, 0.02, Math.PI / 2, 0.5, 0.05, 0.045, 0.4);
    lg(-1.25, FL + 0.27, -0.02, Math.PI / 2, -0.6, 0.35, 0.04, 0.38);
    flame(house, -1.23, FL + 0.15, 0, 0.36, 0.46, 1.0, 1, 1.45, 3);
    flame(house, -1.2, FL + 0.16, 0.12, 0.2, 0.3, 7.0, 1.2, 1.3, 2);
    flame(house, -1.2, FL + 0.16, -0.12, 0.2, 0.28, 13.0, 1.15, 1.3, 2);
    glow(house, -1.15, FL + 0.35, 0, 0.9, 0xff7a30, 0.32);
    const fireLight = new THREE.PointLight(0xff8a3a, 2.8, 6, 1.6); fireLight.position.set(-0.92, FL + 0.42, 0); house.add(fireLight);
    if (!isTouch) { fireLight.castShadow = true; fireLight.shadow.mapSize.set(512, 512); fireLight.shadow.camera.near = 0.05; fireLight.shadow.camera.far = 5; fireLight.shadow.bias = -0.004; }
    cabin.fireLight = fireLight;
    {
      const N = 40, pos = new Float32Array(N * 3), vel = [], life = [];
      for (let i = 0; i < N; i++) { vel.push(new V()); life.push(0); pos[i * 3 + 1] = -50; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.014, map: softDot, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false; house.add(pts); cabin.sparks = { pts, vel, life, FL };
    }
    // fire tools
    mk(cyl(0.07, 0.07, 0.015, 16), M.iron, -0.84, FL + 0.108, 0.6);
    mk(cyl(0.008, 0.008, 0.62, 8), M.iron, -0.84, FL + 0.42, 0.6);
    mk(new THREE.TorusGeometry(0.03, 0.005, 6, 16), M.brass, -0.84, FL + 0.74, 0.6);
    [[-0.03, 0], [0.03, 0.02], [0, -0.03]].forEach(([dx, dz], i) => {
      mk(cyl(0.006, 0.006, 0.5, 6), M.iron, -0.84 + dx, FL + 0.43, 0.6 + dz);
      if (i === 0) mk(tbox(0.07, 0.09, 0.006), M.iron, -0.84 + dx, FL + 0.16, 0.6 + dz);
      if (i === 1) mk(cyl(0.015, 0.01, 0.08, 8), M.dark, -0.84 + dx, FL + 0.16, 0.6 + dz);
    });
    // mantel decor
    candle(house, -1.0, FL + 1.3, 0.56, 0.14); candle(house, -1.0, FL + 1.3, -0.56, 0.1);
    mk(lathe([[0, 0], [0.05, 0], [0.065, 0.06], [0.05, 0.13], [0.03, 0.16], [0.036, 0.18], [0, 0.18]]), M.brownC, -1.0, FL + 1.3, 0.2);
    boxB(-1.06, -0.94, FL + 1.3, FL + 1.38, -0.28, -0.12, M.furn, 0.3);
    const pt = mk(new THREE.PlaneGeometry(0.5, 0.35), std({ map: paintTex, roughness: 0.6 }), -1.132, FL + 1.8, 0); pt.rotation.y = Math.PI / 2;
    [[0, 0.195, 0.6, 0.04], [0, -0.195, 0.6, 0.04], [0.27, 0, 0.04, 0.43], [-0.27, 0, 0.04, 0.43]].forEach(([dz, dy, wz, hy]) => boxB(-1.14, -1.115, FL + 1.8 + dy - hy / 2, FL + 1.8 + dy + hy / 2, dz - wz / 2, dz + wz / 2, M.brass));

    /* ---- rug ---- */
    const rug = mk(new THREE.CircleGeometry(0.5, 48), M.rug, -0.2, FL + 0.004, -0.3); rug.rotation.x = -Math.PI / 2; rug.scale.set(1.35, 1.05, 1);

    /* ---- armchair + side table + table lamp ---- */
    {
      // (armchair removed)
    }
    {
      const sx = 0.38, sz = -0.2;
      mk(cyl(0.19, 0.19, 0.03, 28), M.furn, sx, FL + 0.56, sz);
      mk(cyl(0.028, 0.035, 0.52, 10), M.dark, sx, FL + 0.29, sz);
      for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28, f = mk(tbox(0.2, 0.03, 0.04, 0.3), M.dark, sx + Math.cos(a) * 0.09, FL + 0.03, sz + Math.sin(a) * 0.09); f.rotation.y = -a; }
      const y0 = FL + 0.575;
      mk(lathe([[0, 0], [0.08, 0], [0.08, 0.015], [0.05, 0.03], [0.03, 0.06], [0.02, 0.1], [0, 0.1]]), M.brass, sx, y0, sz);
      mk(cyl(0.011, 0.011, 0.2, 8), M.brass, sx, y0 + 0.2, sz);
      const shadeM = std({ color: lin(0xf0dcb4), emissive: new THREE.Color(1.0, 0.7, 0.38), emissiveIntensity: 0.85, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.2 });
      shadeM.userData.ei = 0.85;
      mk(lathe([[0.155, 0], [0.095, 0.18]], 28), shadeM, sx, y0 + 0.2, sz).userData.noShadow = true;
      const bulbM = new THREE.MeshBasicMaterial({ color: 0xfff0c8 }); bulbM.userData.basic = true;
      mk(new THREE.SphereGeometry(0.026, 12, 8), bulbM, sx, y0 + 0.29, sz).userData.noShadow = true;
      const L = new THREE.PointLight(0xffc27a, 2.0, 4.2, 1.5); L.position.set(sx, y0 + 0.29, sz); house.add(L);
      addLamp(L, 2.0, [], [shadeM, bulbM]);
      // book with glasses on the side table
      boxB(sx - 0.12, sx + 0.04, FL + 0.575, FL + 0.6, sz + 0.02, sz + 0.14, std({ color: lin(0x2f4a6b), roughness: 0.7 }));
    }

    /* ---- dining table, chairs, tableware ---- */
    {
      const tx = -0.18, tz = 0.8, top = FL + 0.765;
      boxB(tx - 0.46, tx + 0.46, FL + 0.72, top, tz - 0.24, tz + 0.24, M.furn, 0.6);
      [[-0.4, -0.19], [0.4, -0.19], [-0.4, 0.19], [0.4, 0.19]].forEach(([dx, dz]) => boxB(tx + dx - 0.03, tx + dx + 0.03, FL, FL + 0.72, tz + dz - 0.03, tz + dz + 0.03, M.furn, 0.6));
      boxB(tx - 0.38, tx + 0.38, FL + 0.62, FL + 0.72, tz - 0.175, tz - 0.155, M.furn, 0.6); boxB(tx - 0.38, tx + 0.38, FL + 0.62, FL + 0.72, tz + 0.155, tz + 0.175, M.furn, 0.6);
      const chair = (x, z, ry) => {
        const g = new THREE.Group(); g.position.set(x, FL, z); g.rotation.y = ry; house.add(g);
        [[-0.18, 0.17], [0.18, 0.17]].forEach(([lx, lz]) => mk(cyl(0.02, 0.018, 0.45, 8), M.furn, lx, 0.225, lz, g));
        [-0.18, 0.18].forEach(lx => mk(cyl(0.022, 0.02, 0.95, 8), M.furn, lx, 0.475, -0.17, g));
        mk(tbox(0.42, 0.04, 0.4, 0.5), M.furn, 0, 0.45, 0, g);
        [0.62, 0.76, 0.9].forEach(y => { const sl = mk(tbox(0.36, 0.055, 0.02, 0.5), M.furn, 0, y, -0.17, g); sl.rotation.x = -0.05; });
        [0.15, 0.3].forEach(y => { const r1 = mk(cyl(0.01, 0.01, 0.36, 6), M.furn, 0, y, 0.17, g); r1.rotation.z = Math.PI / 2; const r2 = mk(cyl(0.01, 0.01, 0.34, 6), M.furn, -0.18, y, 0, g); r2.rotation.x = Math.PI / 2; const r3 = mk(cyl(0.01, 0.01, 0.34, 6), M.furn, 0.18, y, 0, g); r3.rotation.x = Math.PI / 2; });
      };
      chair(tx - 0.26, 0.31, 0.04); chair(tx + 0.3, 0.3, -0.06);
      // bowl with apples
      mk(lathe([[0, 0], [0.06, 0], [0.1, 0.02], [0.13, 0.06], [0.135, 0.075], [0.128, 0.075], [0.12, 0.06], [0.09, 0.025], [0, 0.012]], 28), M.blueC, tx - 0.18, top, tz + 0.05);
      const ap = lathe([[0.001, -0.036], [0.013, -0.038], [0.026, -0.034], [0.036, -0.022], [0.041, -0.005], [0.04, 0.012], [0.035, 0.026], [0.025, 0.035], [0.013, 0.035], [0.005, 0.029], [0.001, 0.027]], 16);
      const apM = [std({ color: lin(0xb3201a), roughness: 0.32, envMapIntensity: 0.6 }), std({ color: lin(0xc9502a), roughness: 0.32, envMapIntensity: 0.6 })];
      [[0, 0], [0.05, 0.03], [-0.05, 0.02], [0.01, -0.05], [0.0, 0.01, 0.06]].forEach(([dx, dz, dy = 0], i) => { const a = mk(ap, apM[i % 2], tx - 0.18 + dx, top + 0.05 + dy, tz + 0.05 + dz); a.rotation.set(rr(-0.3, 0.3), rng() * 6, rr(-0.3, 0.3)); });
      const mug = (x, z, m) => { mk(cyl(0.038, 0.034, 0.09, 18), m, x, top + 0.045, z); const h = mk(new THREE.TorusGeometry(0.025, 0.007, 8, 14), m, x + 0.045, top + 0.048, z); h.rotation.y = Math.PI / 2; h.rotation.x = 0; mk(cyl(0.032, 0.032, 0.002, 16), std({ color: lin(0x3a2214), roughness: 0.2 }), x, top + 0.08, z); };
      mug(tx + 0.2, tz - 0.12, M.ceramic); mug(tx - 0.33, tz - 0.14, M.blueC);
      mk(cyl(0.11, 0.08, 0.014, 28), M.ceramic, tx + 0.2, top + 0.007, tz + 0.08);
      const loaf = mk(new THREE.SphereGeometry(1, 18, 10), std({ color: lin(0xa86a32), roughness: 0.8 }), tx + 0.2, top + 0.035, tz + 0.08); loaf.scale.set(0.075, 0.04, 0.05);
      candle(house, tx + 0.02, top, tz + 0.12, 0.16);
      const bk1 = boxB(tx - 0.44, tx - 0.26, top, top + 0.012, tz + 0.0, tz + 0.18, M.linen); bk1.rotation.y = 0.2;
    }

    /* ---- bookshelf ---- */
    {
      const x0 = -1.56, x1 = -1.0, z0 = 0.95, z1 = 1.22, H0 = FL, HH = 1.75;
      boxB(x0, x0 + 0.03, H0, H0 + HH, z0, z1, M.furn, 0.6); boxB(x1 - 0.03, x1, H0, H0 + HH, z0, z1, M.furn, 0.6);
      boxB(x0, x1, H0 + HH - 0.03, H0 + HH, z0 - 0.01, z1, M.furn, 0.6); boxB(x0, x1, H0 + HH * 0 + 0.0, H0 + 0.06, z0, z1, M.furn, 0.6);
      boxB(x0 + 0.03, x1 - 0.03, H0, H0 + HH, z1 - 0.015, z1, M.dark, 0.6);
      const levels = [0.06, 0.44, 0.8, 1.14, 1.46];
      levels.slice(1).forEach(l => boxB(x0 + 0.03, x1 - 0.03, H0 + l - 0.025, H0 + l, z0, z1 - 0.015, M.furn, 0.6));
      const pal = ['#7a2b22', '#2f4a6b', '#3e5b33', '#8a6a2f', '#5a2d4a', '#c7b89a', '#2b2b2b', '#9c4a1e', '#476c7a', '#6b4f2a'].map(c => lin(parseInt(c.slice(1), 16)));
      const books = [];
      const cbox = (w, h, d, col, x, y, z, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateZ(rz); g.translate(x, y, z); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); books.push(g); };
      const gold = lin(0xd8b25a);
      for (let s = 0; s < 4; s++) {
        const yb = H0 + levels[s], space = levels[s + 1] - levels[s] - 0.03;
        let x = x0 + 0.04;
        while (x < x1 - 0.06) {
          if (rng() < 0.07) { x += 0.04; continue; }
          const w = rr(0.022, 0.05), h = Math.min(space - 0.01, rr(0.18, 0.3)), d = rr(0.15, 0.2), col = pal[Math.floor(rng() * pal.length)].clone().multiplyScalar(rr(0.8, 1.15));
          const zc = z1 - 0.02 - d / 2;
          cbox(w, h, d, col, x + w / 2, yb + h / 2, zc);
          if (rng() < 0.45) { cbox(w + 0.002, 0.012, 0.004, gold, x + w / 2, yb + h * 0.82, zc - d / 2 - 0.001); cbox(w + 0.002, 0.008, 0.004, gold, x + w / 2, yb + h * 0.18, zc - d / 2 - 0.001); }
          x += w + 0.002;
        }
      }
      cbox(0.2, 0.03, 0.14, pal[1], x0 + 0.2, H0 + levels[4] + 0.015, z1 - 0.1); cbox(0.19, 0.025, 0.13, pal[0], x0 + 0.2, H0 + levels[4] + 0.043, z1 - 0.1);
      house.add(new THREE.Mesh(mergeGeos(books, ['position', 'normal', 'color']), std({ vertexColors: true, roughness: 0.7 })));
      mk(lathe([[0, 0], [0.045, 0], [0.05, 0.01], [0.05, 0.12], [0.035, 0.14], [0.035, 0.155], [0, 0.155]]), M.jar, x1 - 0.12, H0 + levels[4], z1 - 0.1);
      mk(cyl(0.043, 0.043, 0.07, 16), std({ color: lin(0xc98a1e), roughness: 0.3 }), x1 - 0.12, H0 + levels[4] + 0.045, z1 - 0.1);
    }
    // potted plant helper
    function plant(x, y, z, s) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); house.add(g);
      mk(lathe([[0, 0], [0.05, 0], [0.065, 0.1], [0.072, 0.1], [0.072, 0.115], [0.06, 0.115], [0.05, 0.02], [0, 0.02]]), M.terra, 0, 0, 0, g);
      mk(cyl(0.062, 0.062, 0.005, 16), std({ color: lin(0x3a2a1c), roughness: 1 }), 0, 0.105, 0, g);
      const lm = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, envMapIntensity: 0.4 });
      const n = 26, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), lm, n);
      const q = new THREE.Quaternion(), Y = new V();
      for (let i = 0; i < n; i++) { const a = rng() * 6.28, up = rr(0.25, 1.1); Y.set(Math.cos(a) * (1.2 - up * 0.5), up, Math.sin(a) * (1.2 - up * 0.5)).normalize(); q.setFromUnitVectors(UPV, Y); const sz = rr(0.07, 0.11); im.setMatrixAt(i, new THREE.Matrix4().compose(new V(rr(-0.01, 0.01), 0.1, rr(-0.01, 0.01)), q, new V(sz * 0.6, sz * 1.4, sz))); im.setColorAt(i, new THREE.Color(rr(0.7, 1), rr(0.85, 1.1), rr(0.6, 0.9))); }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; g.add(im);
    }
    plant(-1.3, FL + 1.75, 1.08, 1.0);

    /* ---- bed & nightstand ---- */
    {
      const xL = 0.6, xR = 1.56, zH = -1.2, zF = 0.52;
      [[xL + 0.05, zH + 0.05, 1.05], [xR - 0.05, zH + 0.05, 1.05], [xL + 0.05, zF - 0.05, 0.72], [xR - 0.05, zF - 0.05, 0.72]].forEach(([x, z, h]) => { mk(cyl(0.05, 0.055, h, 12), M.logP, x, FL + h / 2, z); mk(new THREE.SphereGeometry(0.052, 12, 8), M.logP, x, FL + h, z); });
      boxB(xL + 0.03, xL + 0.08, FL + 0.22, FL + 0.34, zH + 0.08, zF - 0.08, M.furn, 0.6); boxB(xR - 0.08, xR - 0.03, FL + 0.22, FL + 0.34, zH + 0.08, zF - 0.08, M.furn, 0.6);
      [0.52, 0.7, 0.88].forEach(y => { const c = mk(cyl(0.045, 0.045, xR - xL - 0.1, 12), M.logP, (xL + xR) / 2, FL + y, zH + 0.05); c.rotation.z = Math.PI / 2; });
      [0.42, 0.58].forEach(y => { const c = mk(cyl(0.04, 0.04, xR - xL - 0.1, 12), M.logP, (xL + xR) / 2, FL + y, zF - 0.05); c.rotation.z = Math.PI / 2; });
      boxB(xL + 0.07, xR - 0.07, FL + 0.3, FL + 0.5, zH + 0.1, zF - 0.1, M.linen);
      boxB(xL + 0.05, xR - 0.05, FL + 0.33, FL + 0.525, -0.55, zF - 0.08, M.quilt, 0.9);
      boxB(xL + 0.06, xR - 0.06, FL + 0.5, FL + 0.535, -0.62, -0.53, M.linen);
      [0.84, 1.3].forEach(x => { const p = mk(new THREE.SphereGeometry(1, 20, 12), M.linen, x, FL + 0.56, zH + 0.26); p.scale.set(0.2, 0.065, 0.13); p.rotation.x = -0.25; });
      boxB(xL + 0.1, xR - 0.1, FL + 0.525, FL + 0.565, 0.18, 0.44, M.plaid, 0.5);
      // nightstand + oil lamp + book
      boxB(0.16, 0.52, FL, FL + 0.55, -1.2, -0.87, M.furn, 0.5);
      boxB(0.14, 0.54, FL + 0.55, FL + 0.58, -1.21, -0.85, M.furn, 0.5);
      boxB(0.2, 0.48, FL + 0.38, FL + 0.5, -0.872, -0.862, M.dark, 0.5);
      mk(new THREE.SphereGeometry(0.014, 10, 8), M.brass, 0.34, FL + 0.44, -0.856);
      const ly = FL + 0.58, lx = 0.3, lz = -1.04;
      const amber = std({ color: lin(0xb87a2a), roughness: 0.15, transparent: true, opacity: 0.85, envMapIntensity: 0.8 });
      mk(lathe([[0, 0], [0.05, 0.004], [0.06, 0.04], [0.045, 0.08], [0.015, 0.1], [0, 0.1]]), amber, lx, ly, lz);
      mk(cyl(0.022, 0.022, 0.02, 12), M.brass, lx, ly + 0.11, lz);
      const ch = mk(lathe([[0.018, 0], [0.03, 0.04], [0.028, 0.08], [0.016, 0.14], [0.018, 0.16]]), M.jar, lx, ly + 0.12, lz); ch.userData.noShadow = true;
      const of = flame(house, lx, ly + 0.125, lz, 0.018, 0.045, 3.3, 1.5, 1.8, 2);
      const og = glow(house, lx, ly + 0.16, lz, 0.28, 0xffa050, 0.35);
      const OL = new THREE.PointLight(0xffb060, 1.3, 3.2, 1.5); OL.position.set(lx, ly + 0.2, lz); house.add(OL);
      addLamp(OL, 1.3, [of, og], []);
      boxB(0.38, 0.5, ly, ly + 0.035, -1.0, -0.9, std({ color: lin(0x5a2d4a), roughness: 0.7 }));
    }

    /* ---- kitchen counter, shelf, woodbox ---- */
    {
      const top = FL + 0.87;
      boxB(-0.93, 0.08, FL, FL + 0.82, -1.22, -0.82, M.furn, 0.5);
      boxB(-0.9, -0.43, FL + 0.08, FL + 0.76, -0.822, -0.806, M.dark, 0.4); boxB(-0.4, 0.05, FL + 0.08, FL + 0.76, -0.822, -0.806, M.dark, 0.4);
      [-0.47, -0.36].forEach(x => mk(new THREE.SphereGeometry(0.014, 10, 8), M.iron, x, FL + 0.5, -0.8));
      boxB(-0.96, 0.11, FL + 0.82, top, -1.23, -0.78, M.board, 0.5);
      mk(lathe([[0, 0], [0.1, 0], [0.16, 0.06], [0.19, 0.1], [0.2, 0.105], [0.19, 0.1], [0.155, 0.058], [0.095, 0.006], [0, 0.006]], 30), M.ceramic, -0.45, top, -1.0);
      const rim = mk(new THREE.TorusGeometry(0.197, 0.006, 6, 30), M.blueC, -0.45, top + 0.104, -1.0); rim.rotation.x = Math.PI / 2;
      mk(lathe([[0, 0], [0.07, 0], [0.095, 0.04], [0.09, 0.09], [0.05, 0.12], [0.03, 0.125], [0.03, 0.13], [0, 0.13]]), M.iron, -0.8, top, -0.98);
      const sp = mk(cyl(0.01, 0.018, 0.1, 8), M.iron, -0.71, top + 0.08, -0.98); sp.rotation.z = -0.9;
      const hd = mk(new THREE.TorusGeometry(0.06, 0.007, 8, 16, Math.PI), M.iron, -0.8, top + 0.13, -0.98);
      boxB(-0.12, 0.08, top, top + 0.02, -1.08, -0.9, M.furn, 0.3);
      const lf = mk(new THREE.SphereGeometry(1, 16, 10), std({ color: lin(0xa86a32), roughness: 0.8 }), -0.02, top + 0.05, -0.99); lf.scale.set(0.07, 0.042, 0.055);
      // shelf with jars and plates
      const sy = FL + 1.38;
      boxB(-1.56, -1.1, sy, sy + 0.025, -1.23, -1.03, M.furn, 0.5);
      [-1.5, -1.16].forEach(x => boxB(x - 0.012, x + 0.012, sy - 0.14, sy, -1.23, -1.08, M.dark, 0.3));
      const fills = [0xc98a1e, 0x5f7a2a, 0x8a2a2a, 0xe0d6b8];
      [-1.49, -1.39, -1.29].forEach((x, i) => { mk(lathe([[0, 0], [0.04, 0], [0.045, 0.01], [0.045, 0.11], [0.032, 0.13], [0.032, 0.14], [0, 0.14]]), M.jar, x, sy + 0.025, -1.13); mk(cyl(0.039, 0.039, rr(0.05, 0.09), 14), std({ color: lin(fills[i]), roughness: 0.4 }), x, sy + 0.06, -1.13); mk(cyl(0.036, 0.036, 0.012, 14), i % 2 ? M.brass : M.curtain, x, sy + 0.17, -1.13); });
      [-1.18].forEach(x => { const pl = mk(cyl(0.068, 0.055, 0.012, 24), M.ceramic, x, sy + 0.095, -1.2); pl.rotation.x = Math.PI / 2 - 0.15; });
      // woodbox with split logs
      boxB(-1.56, -1.1, FL, FL + 0.32, -1.22, -1.2, M.dark, 0.5); boxB(-1.56, -1.1, FL, FL + 0.32, -0.84, -0.82, M.dark, 0.5);
      boxB(-1.56, -1.54, FL, FL + 0.32, -1.2, -0.84, M.dark, 0.5); boxB(-1.12, -1.1, FL, FL + 0.32, -1.2, -0.84, M.dark, 0.5);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - (row % 2); i++) addLog('x', -1.52, -1.14, FL + 0.06 + row * 0.085, -1.14 + i * 0.09 + (row % 2) * 0.045, 0.045);
    }

    /* ---- ceiling lantern ---- */
    {
      const lan = new THREE.Group(); lan.position.set(0.05, 2.28, 0.05); house.add(lan);
      mk(cyl(0.006, 0.006, 0.84, 6), M.iron, 0, 0.62, 0, lan);
      const tp = mk(new THREE.ConeGeometry(0.14, 0.12, 4), M.iron, 0, 0.2, 0, lan); tp.rotation.y = Math.PI / 4;
      mk(new THREE.TorusGeometry(0.02, 0.005, 6, 12), M.iron, 0, 0.275, 0, lan);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => mk(tbox(0.015, 0.28, 0.015), M.iron, a * 0.085, 0.0, b * 0.085, lan));
      mk(tbox(0.2, 0.02, 0.2), M.iron, 0, -0.14, 0, lan); mk(tbox(0.19, 0.015, 0.19), M.iron, 0, 0.135, 0, lan);
      const pane = std({ color: 0xfff2d8, transparent: true, opacity: 0.25, emissive: new THREE.Color(1, 0.7, 0.35), emissiveIntensity: 0.25, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 });
      pane.userData.ei = 0.25;
      [[0, 0.085, 0], [0, -0.085, 0], [0.085, 0, Math.PI / 2], [-0.085, 0, Math.PI / 2]].forEach(([x, z, r]) => { const p = mk(new THREE.PlaneGeometry(0.16, 0.26), pane, x, 0, z, lan); p.rotation.y = r; p.userData.noShadow = true; });
      mk(cyl(0.022, 0.022, 0.1, 12), M.wax, 0, -0.08, 0, lan);
      const lf = flame(lan, 0, -0.028, 0, 0.03, 0.065, 5.5, 1.6, 1.8, 2);
      const lg2 = glow(lan, 0, 0.0, 0, 0.45, 0xffa050, 0.3);
      const L = new THREE.PointLight(0xffb86b, 1.7, 4.8, 1.5); L.position.set(0, 0.0, 0); lan.add(L);
      addLamp(L, 1.7, [lf, lg2], [pane]);
    }

    /* ---- wall clock ---- */
    {
      const cx = 0.33, cy = 1.9, cz = -1.19;
      boxB(cx - 0.14, cx + 0.14, cy - 0.3, cy + 0.17, cz - 0.04, cz + 0.04, M.dark, 0.4);
      const face = mk(new THREE.CircleGeometry(0.1, 32), std({ map: clockTex, roughness: 0.5 }), cx, cy + 0.03, cz + 0.042);
      const hands = {};
      [['h', 0.055, 0.009, 0x1a1410], ['m', 0.085, 0.006, 0x1a1410], ['s', 0.09, 0.002, 0x8a1a14]].forEach(([k, len, w, c], i) => {
        const g = new THREE.BoxGeometry(w, len, 0.003); g.translate(0, len / 2 - 0.012, 0);
        const m = mk(g, std({ color: c, roughness: 0.4 }), cx, cy + 0.03, cz + 0.045 + i * 0.002); hands[k] = m;
      });
      mk(new THREE.CircleGeometry(0.008, 12), M.brass, cx, cy + 0.03, cz + 0.052);
      const pend = new THREE.Group(); pend.position.set(cx, cy - 0.1, cz + 0.045); house.add(pend);
      mk(tbox(0.006, 0.14, 0.004), M.brass, 0, -0.07, 0, pend);
      const bob = mk(new THREE.CircleGeometry(0.028, 20), M.brass, 0, -0.15, 0.002, pend);
      boxB(cx - 0.1, cx + 0.1, cy - 0.29, cy - 0.285, cz + 0.035, cz + 0.041, M.dark);
      cabin.hands = hands; cabin.pendulum = pend;
    }

    /* ---- coat pegs, hat, framed map ---- */
    {
      boxB(1.54, 1.58, 1.58, 1.68, 0.72, 1.18, M.dark, 0.4);
      [0.8, 0.95, 1.1].forEach(z => { const p = mk(cyl(0.012, 0.014, 0.1, 8), M.dark, 1.5, 1.64, z); p.rotation.z = Math.PI / 2 + 0.3; });
      const coat = mk(tbox(0.06, 0.78, 0.36), M.wool, 1.49, 1.22, 0.83); coat.rotation.x = 0.04;
      const col = mk(cyl(0.06, 0.09, 0.08, 12), M.wool, 1.5, 1.6, 0.83); col.scale.set(0.6, 1, 1);
      mk(cyl(0.07, 0.075, 0.1, 18), M.felt, 1.4, 1.73, 1.1).rotation.z = 0.25;
      const brim = mk(cyl(0.125, 0.125, 0.008, 24), M.felt, 1.415, 1.68, 1.1); brim.rotation.z = 0.25;
      const scarf = mk(tbox(0.02, 0.5, 0.08, 0.3), M.plaid, 1.5, 1.4, 0.97); scarf.rotation.x = 0.1;
      const mp = mk(new THREE.PlaneGeometry(0.42, 0.3), std({ map: mapTex, roughness: 0.8 }), 1.568, 1.62, -0.82); mp.rotation.y = -Math.PI / 2;
      [[0, 0.165, 0.48, 0.03], [0, -0.165, 0.48, 0.03], [0.225, 0, 0.03, 0.36], [-0.225, 0, 0.03, 0.36]].forEach(([dz, dy, wz, hy]) => boxB(1.555, 1.575, 1.62 + dy - hy / 2, 1.62 + dy + hy / 2, -0.82 + dz - wz / 2, -0.82 + dz + wz / 2, M.dark, 0.3));
    }

    /* ---- curtains ---- */
    function curtains(w, op) {
      const h = op.top - op.bottom + 0.2, yc = (op.top + op.bottom) / 2 + 0.07, off = w.c - w.n * 0.28;
      const mkPanel = (u) => {
        const g = new THREE.PlaneGeometry(0.28, h, 16, 1), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.14) / 0.28 * Math.PI * 4) * 0.018);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, M.curtain);
        if (w.axis === 'x') m.position.set(u, yc, off); else { m.position.set(off, yc, u); m.rotation.y = Math.PI / 2; }
        house.add(m);
      };
      mkPanel(op.lo - 0.05); mkPanel(op.hi + 0.05);
      const rod = new THREE.Mesh(cyl(0.01, 0.01, op.hi - op.lo + 0.5, 8), M.brass);
      if (w.axis === 'x') { rod.rotation.z = Math.PI / 2; rod.position.set((op.lo + op.hi) / 2, yc + h / 2 + 0.01, off); } else { rod.rotation.x = Math.PI / 2; rod.position.set(off, yc + h / 2 + 0.01, (op.lo + op.hi) / 2); }
      house.add(rod);
    }
    curtains(walls[0], OPS.front); curtains(walls[1], OPS.back); curtains(walls[2], OPS.side);

    const interiorTo = new THREE.Object3D().id;
    /* ---- outside: steps, porch lantern, bench, woodpile, stump & axe ---- */
    {
      const op = OPS.door;
      boxB(op.lo - 0.1, op.hi + 0.1, -0.15, 0.12, ZW + 0.1, ZW + 0.64, M.board, 0.6);
      boxB(op.lo - 0.1, op.hi + 0.1, 0.12, 0.24, ZW + 0.1, ZW + 0.38, M.board, 0.6);
      boxB(op.lo + 0.08, op.hi - 0.08, 0.24, 0.253, ZW + 0.13, ZW + 0.35, M.mat);
      const pl = new THREE.Group(); pl.position.set(op.hi + 0.22, 2.02, ZW + 0.2); house.add(pl);
      mk(tbox(0.03, 0.03, 0.2), M.iron, 0, 0.17, -0.07, pl);
      mk(new THREE.ConeGeometry(0.08, 0.08, 4), M.iron, 0, 0.13, 0, pl).rotation.y = Math.PI / 4;
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => mk(tbox(0.012, 0.18, 0.012), M.iron, a * 0.05, 0.0, b * 0.05, pl));
      mk(tbox(0.12, 0.015, 0.12), M.iron, 0, -0.09, 0, pl);
      const pane = std({ color: 0xfff2d8, transparent: true, opacity: 0.3, emissive: new THREE.Color(1, 0.72, 0.4), emissiveIntensity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      pane.userData.ei = 0.5;
      [[0, 0.05, 0], [0, -0.05, 0], [0.05, 0, Math.PI / 2], [-0.05, 0, Math.PI / 2]].forEach(([x, z, r]) => { const p = mk(new THREE.PlaneGeometry(0.095, 0.17), pane, x, 0, z, pl); p.rotation.y = r; p.userData.noShadow = true; });
      const pf = flame(pl, 0, -0.06, 0, 0.025, 0.055, 9.1, 1.6, 1.8, 2);
      const pg = glow(pl, 0, -0.02, 0, 0.4, 0xffa050, 0.35);
      const SL2 = new THREE.SpotLight(0xffc27a, 1.7, 7, 1.05, 0.7, 1.4); SL2.position.set(0, -0.02, 0.02); pl.add(SL2);
      const tg = new THREE.Object3D(); tg.position.set(-0.4, -2.1, 1.3); pl.add(tg); SL2.target = tg;
      addLamp(SL2, 1.7, [pf, pg], [pane]);
      // bench under the front window
      boxB(-0.72, 0.32, 0.38, 0.45, ZW + 0.36, ZW + 0.66, M.board, 0.6);
      [-0.58, 0.18].forEach(x => { mk(cyl(0.09, 0.1, 0.38, 14), M.logP, x, 0.19, ZW + 0.51); const c = mk(new THREE.CircleGeometry(0.09, 14), M.end, x, 0.382, ZW + 0.51); c.rotation.x = -Math.PI / 2; });
      // woodpile against the west wall
      for (let row = 0; row < 7; row++) for (let i = 0; i < 17; i++) { const z = -0.9 + i * 0.105 + (row % 2) * 0.052; if (z > 0.85) continue; addLog('x', -XW - 0.64, -XW - 0.22, 0.06 + row * 0.098, z, rr(0.045, 0.058)); }
      boxB(-XW - 0.7, -XW - 0.16, 0.76, 0.785, -0.98, 0.95, M.board, 0.6);
      // stump and axe
      const sx = -2.5, sz = 1.25;
      mk(cyl(0.19, 0.22, 0.42, 16), M.logP, sx, 0.2, sz);
      const st2 = mk(new THREE.CircleGeometry(0.19, 20), M.end, sx, 0.411, sz); st2.rotation.x = -Math.PI / 2;
      const ax = new THREE.Group(); ax.position.set(sx + 0.03, 0.42, sz); ax.rotation.set(0.1, 0.6, -0.5); house.add(ax);
      mk(cyl(0.016, 0.018, 0.62, 8), M.furn, 0, 0.3, 0, ax);
      mk(tbox(0.16, 0.07, 0.02), M.iron, 0.06, 0.02, 0, ax);
      for (let i = 0; i < 4; i++) { const c = mk(cyl(0.05, 0.05, 0.36, 10), M.logP, sx + rr(-0.5, 0.4), 0.05, sz + rr(0.25, 0.5)); c.rotation.set(Math.PI / 2, rng() * 3, 0); }
    }

    /* ---- merged logs & caps ---- */
    house.add(new THREE.Mesh(mergeGeos(logs, ['position', 'normal', 'uv', 'color']), M.log));
    house.add(new THREE.Mesh(mergeGeos(caps, ['position', 'normal', 'uv']), M.end));

    house.traverse(o => { if (o.isMesh) { const ns = o.userData.noShadow || (o.material && o.material.transparent); o.castShadow = !ns; o.receiveShadow = true; } });
    // interior tag for the detail manager (world/plotDetail.js): furniture, props, fire logs, clock, curtains - not the
    // lights, glows or flames (the lit windows stay at any distance)
    house.traverse(o => { if ((o.isMesh || o.isPoints) && o.id > interiorFrom && o.id < interiorTo) o.userData.interior = true; });

    /* ---- chimney smoke ---- */
    const chimTop = new V(HOUSE.x - 1.36, PAD_H + 4.3, HOUSE.z);
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xb8b4ae, transparent: true, opacity: 0, depthWrite: false }));
      scene.add(sp); cabin.smoke.push({ sp, u: i / 16, ph: rng() * 6.28, top: chimTop });
    }

    /* ---- collision boxes (world space) ---- */
    const B = (x0, x1, y0, y1, z0, z1, on) => cabin.boxes.push({ x0: x0 + HOUSE.x, x1: x1 + HOUSE.x, y0: y0 + PAD_H, y1: y1 + PAD_H, z0: z0 + HOUSE.z, z1: z1 + HOUSE.z, on });
    const TT = 0.12, dop = OPS.door;
    B(-XW - 0.28, dop.lo, -0.6, EAVE, ZW - TT, ZW + TT); B(dop.hi, XW + 0.28, -0.6, EAVE, ZW - TT, ZW + TT); B(dop.lo, dop.hi, dop.top, EAVE, ZW - TT, ZW + TT);
    B(dop.lo, dop.hi, -0.6, dop.top, ZW - 0.07, ZW + 0.07, () => cabin.door.angle < 1.1);
    B(-XW - 0.28, XW + 0.28, -0.6, EAVE, -ZW - TT, -ZW + TT);
    B(XW - TT, XW + TT, -0.6, 3.5, -ZW - 0.28, ZW + 0.28); B(-XW - TT, -XW + TT, -0.6, 3.5, -ZW - 0.28, ZW + 0.28);
    B(-1.62, -1.12, -0.6, 4.3, -0.48, 0.48); B(-1.62, -0.95, -0.6, FL + 1.3, -0.64, 0.64);
  }
  function setLights(on) {
    cabin.lightsOn = on;
    cabin.lamps.forEach(L => { L.light.intensity = on ? L.base : 0; L.flames.forEach(f => f.visible = on); L.mats.forEach(m => { if (m.userData.basic) m.color.set(on ? 0xfff0c8 : 0x6a6258); else m.emissiveIntensity = on ? m.userData.ei : 0; }); });
    const b = document.getElementById('lightsBtn'); if (b) { b.textContent = on ? 'On' : 'Off'; b.setAttribute('aria-pressed', String(on)); }
  }
  function toggleDoor() { const d = cabin.door; if (camera.position.distanceTo(d.world) < 2.8) d.target = d.target > 0.5 ? 0 : 1.75; }
  const _sp = new V();
  function cabinUpdate(dt, t) {
    const dr = cabin.door; dr.angle += (dr.target - dr.angle) * (1 - Math.exp(-dt * 4)); dr.pivot.rotation.y = dr.angle;
    const wd = U.uWindDir.value, ws = 0.5 + U.uWind.value;
    cabin.smoke.forEach(s => {
      s.u += dt * 0.085; if (s.u > 1) s.u -= 1; const u = s.u;
      s.sp.position.set(s.top.x + wd.x * u * 1.8 * ws + Math.sin(u * 6 + s.ph) * 0.1, s.top.y + u * 2.6, s.top.z + wd.y * u * 1.8 * ws + Math.cos(u * 5 + s.ph) * 0.1);
      const sc = 0.3 + 1.3 * u; s.sp.scale.set(sc, sc, 1);
      s.sp.material.opacity = 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.25)) * cabin.smokeF; s.sp.material.rotation = s.ph + u * 1.5;
    });
    if (cabin.detailNear === false) return;   // far from the cabin (detail manager): fire flicker, sparks, clock paused
    const f = 0.82 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 15.3 + 1.3) + 0.05 * Math.sin(t * 23.7 + 0.4) + 0.04 * (Math.random() - 0.5);
    cabin.fireLight.intensity = 2.8 * f;
    cabin.emberMat.emissiveIntensity = 1.0 + (f - 0.8) * 2.5;
    cabin.glows.forEach(g => { const k = 0.9 + 0.12 * Math.sin(t * 11 + g.ph) + 0.05 * Math.sin(t * 23 + g.ph * 2); g.s.scale.set(g.size * k, g.size * k, 1); });
    const sp = cabin.sparks, pa = sp.pts.geometry.attributes.position;
    for (let i = 0; i < sp.life.length; i++) {
      sp.life[i] -= dt;
      if (sp.life[i] <= 0) { if (Math.random() < 0.03) { sp.life[i] = rr(0.4, 1.2); pa.setXYZ(i, -1.24 + rr(-0.08, 0.08), sp.FL + 0.2, rr(-0.12, 0.12)); sp.vel[i].set(rr(-0.06, 0.1), rr(0.35, 0.8), rr(-0.08, 0.08)); } else { pa.setY(i, -50); continue; } }
      const y = pa.getY(i) + sp.vel[i].y * dt; sp.vel[i].x += Math.sin(t * 7 + i) * dt * 0.3;
      if (y > sp.FL + 0.8) { sp.life[i] = 0; pa.setY(i, -50); continue; }
      pa.setXYZ(i, pa.getX(i) + sp.vel[i].x * dt, y, pa.getZ(i) + sp.vel[i].z * dt);
    }
    pa.needsUpdate = true;
    const d = new Date(), hr = d.getHours() % 12 + d.getMinutes() / 60, mn = d.getMinutes() + d.getSeconds() / 60, sc2 = d.getSeconds() + d.getMilliseconds() / 1000;
    cabin.hands.h.rotation.z = -hr / 12 * Math.PI * 2; cabin.hands.m.rotation.z = -mn / 60 * Math.PI * 2; cabin.hands.s.rotation.z = -Math.floor(sc2) / 60 * Math.PI * 2;
    cabin.pendulum.rotation.z = Math.sin(sc2 * Math.PI) * 0.2;
  }
  return { cabin, setLights, toggleDoor, update: cabinUpdate };
}
