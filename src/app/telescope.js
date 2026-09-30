import * as THREE from 'three';
import { lin } from '../core/math.js';
import { canvasTex } from '../core/canvasTexture.js';
import { buildingPlans } from '../world/buildingPlans.js';
import { createActionIcon, lookingAt } from './actionIcon.js';
import { COMBOS, CONSTELLATIONS, SIGHTS, UFO } from './starCatalog.js';

/**
 * The observatory's telescope on Ember Rock (the building: assets/islands/islandBuildings.js; its dome and tube:
 * assets/islands/outerIslands.js). By the wall, apart from the telescope, stands a brass panel with two dials, 0 to 9:
 * set them (the icon at the panel opens it, or P) and confirm, and the dome turns and the tube swings to that part of the
 * sky. Then at the eyepiece, the icon (or P) looks through: each of the 100 settings shows one of the 88 constellations
 * (drawn as on a star chart, named), or one of eleven other sights (the Moon, Saturn, Jupiter, a galaxy, nebulae, a
 * comet...), and 9-2 shows something else entirely. Only at night, and at most two a night (a night runs noon to noon);
 * what you have seen goes into the journal's Stars page with its setting. Saved in the browser.
 */
const ICON_PANEL = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="12" r="4.2"/><circle cx="17" cy="12" r="4.2"/><path d="M8 7.8V10M17 7.8V10"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15l12-7 2 3.5-12 7z"/><path d="M14 8.5l2-1.2M7 18v3M5 21h4"/><path d="M19.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>';
const KEY = 'meadow.stars', PER_NIGHT = 2;

export function createTelescope({ scene, camera, st, skyUniforms, clock, hours, softDot, observatory, items }) {
  const P = buildingPlans().find(p => p.kind === 'observatory'), f = P.floor;
  let S = { h0: clock.hours, seen: {}, nights: {}, dials: [0, 0], set: null };
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.seen) S = { ...S, ...d }; } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { void err; } };
  const nightKey = () => Math.floor((S.h0 + hours.hours - 12) / 24);
  const tonight = () => S.nights[nightKey()] || [];
  const note = (text, ms = 4200) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };

  /* ---- the panel: a wooden pedestal by the wall, a sloping brass plate, two numbered dials, a lever ---- */
  const pa = 0.8, pr = 2.35, [pu, pv] = [Math.cos(pa) * pr, Math.sin(pa) * pr], face = pa + Math.PI;   // free-standing, facing the telescope
  const panel = new THREE.Group(); { const [x, z] = P.W(pu, pv); panel.position.set(x, f, z); panel.rotation.y = -(face + P.a) + Math.PI / 2; }
  const wood = new THREE.MeshStandardMaterial({ color: lin(0x6a4a30), roughness: 0.8 }), brass = new THREE.MeshStandardMaterial({ color: lin(0xc09a4a), roughness: 0.35, metalness: 0.7 }), dark = new THREE.MeshStandardMaterial({ color: lin(0x2a2622), roughness: 0.6, metalness: 0.4 });
  const add = (g, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; o.receiveShadow = true; panel.add(o); return o; };
  add(new THREE.BoxGeometry(0.62, 0.9, 0.4), wood, 0, 0.45, 0); add(new THREE.BoxGeometry(0.7, 0.06, 0.48), dark, 0, 0.03, 0);
  const plate = new THREE.Group(); plate.position.set(0, 0.95, 0); plate.rotation.x = 0.55; panel.add(plate);
  const pAdd = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; plate.add(o); return o; };
  pAdd(new THREE.BoxGeometry(0.66, 0.04, 0.46), wood, 0, 0, 0); pAdd(new THREE.BoxGeometry(0.6, 0.012, 0.4), brass, 0, 0.026, 0);
  const digits = canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1e10'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (let i = 0; i < 10; i++) { g.fillText(String(i), (i + 0.5) * w / 10, h / 2 + 2); g.fillRect(i * w / 10, 0, 2, h); } });
  const dials = [-0.14, 0.14].map(x => { const g = new THREE.CylinderGeometry(0.075, 0.075, 0.09, 30, 1, true); g.rotateZ(Math.PI / 2); const m = pAdd(g, new THREE.MeshStandardMaterial({ map: digits, roughness: 0.5 }), x, 0.06, -0.02);
    for (const s of [-1, 1]) { const cap = new THREE.CylinderGeometry(0.08, 0.08, 0.012, 30); cap.rotateZ(Math.PI / 2); pAdd(cap, brass, x + s * 0.05, 0.06, -0.02); }
    const win = new THREE.BoxGeometry(0.1, 0.012, 0.05); pAdd(win, dark, x, 0.13, 0.03); return m; });
  { const lev = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8); const o = pAdd(lev, dark, 0.0, 0.14, 0.12); o.rotation.x = 0.5; pAdd(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: lin(0x8a1a14), roughness: 0.4 }), 0, 0.24, 0.17); }
  { const plaque = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#c09a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a2a14'; g.font = 'italic 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('Right ascension · Declination', w / 2, 40); }); const g = new THREE.PlaneGeometry(0.5, 0.09); g.rotateX(-Math.PI / 2); pAdd(g, new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.4, metalness: 0.4 }), 0, 0.034, 0.16); }
  scene.add(panel);
  { const c = Math.cos(face), s = Math.sin(face), hu = 0.36, hv = 0.26, pt = (a, b) => [pu + c * b - s * a, pv + s * b + c * a], q = [pt(-hu, -hv), pt(hu, -hv), pt(hu, hv), pt(-hu, hv)];   // (you walk round it)
    for (let i = 0; i < 4; i++) P.walls.push([...q[i], ...q[(i + 1) % 4], f - 0.3, f + 1.2, 0.02]); }
  const dialAngle = d => -((d + 0.5) / 10) * Math.PI * 2 + Math.PI / 2;   // the digit on top, under the window
  const dialNow = S.dials.slice(); dials.forEach((m, i) => { m.rotation.x = dialAngle(dialNow[i]); });
  const panelAt = new THREE.Vector3(); panel.updateMatrixWorld(true); panel.localToWorld(panelAt.set(0, 1.05, 0));   // (its matrix first: the icon shows at the panel)

  /* ---- the telescope: the dome's azimuth, the tube's altitude, slewing to a setting ---- */
  const aim = code => ({ az: ((code * 37) % 360) * Math.PI / 180, alt: (25 + ((code * 7 + 3) % 10) * 5) * Math.PI / 180 });
  const { dome, tubePivot, eyepiece } = observatory;
  let slew = null;
  const cur = { az: -dome.rotation.y, alt: Math.PI / 2 + tubePivot.rotation.z };
  const setPose = () => { dome.rotation.y = -cur.az; tubePivot.rotation.z = -(Math.PI / 2 - cur.alt); };
  if (S.set !== null) { Object.assign(cur, aim(S.set)); setPose(); }
  function confirm(a, b) {
    const code = a * 10 + b; S.dials = [a, b]; S.set = code; save();
    const to = aim(code), dAz = Math.atan2(Math.sin(to.az - cur.az), Math.cos(to.az - cur.az));
    slew = { from: { ...cur }, to: { az: cur.az + dAz, alt: to.alt }, t: 0, T: 2.5 + Math.abs(dAz) * 1.1 + Math.abs(to.alt - cur.alt) * 2, dial: dialNow.slice() };
    if (items) items.sfx('dig');
  }
  const epWorld = new THREE.Vector3(), tubeMid = new THREE.Vector3();

  /* ---- the eyepiece: its own little scene of the sky ---- */
  const eye = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400) };
  eye.scene.background = new THREE.Color(0x03050c);
  const starTex = canvasTex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.9)'); r.addColorStop(0.45, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  { const n = 1600, p = new Float32Array(n * 3), c = new Float32Array(n * 3); let s = 77; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) { const u = R() * 2 - 1, a = R() * 6.283, r = Math.sqrt(1 - u * u); p.set([Math.cos(a) * r * 150, u * 150, Math.sin(a) * r * 150], i * 3); const k = 0.25 + 0.75 * R() ** 3, tint = R(); c.set([k * (tint < 0.3 ? 0.8 : 1), k * 0.95, k * (tint > 0.7 ? 0.8 : 1)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    eye.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ map: starTex, size: 1.1, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); }
  const shown = new THREE.Group(); eye.scene.add(shown);
  const clearShown = () => { while (shown.children.length) { const o = shown.children.pop(); o.traverse(q => { if (q.geometry) q.geometry.dispose(); }); } };
  const starColor = m => new THREE.Color().setHSL(0.58 - Math.min(0.5, Math.max(0, (m + 1) * 0.02)), 0.5, 0.85);
  function showConstellation(c) {
    const xs = c.stars.map(s => s[0]), ys = c.stars.map(s => s[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 6), k = 34 / span;
    const P3 = s => new THREE.Vector3((s[0] - cx) * k, (s[1] - cy) * k, -100);
    const lp = []; c.lines.forEach(([a, b]) => { lp.push(P3(c.stars[a]), P3(c.stars[b])); });
    const lg = new THREE.BufferGeometry().setFromPoints(lp); shown.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x7fa6e6, transparent: true, opacity: 0.55 })));
    c.stars.forEach(s => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: starColor(s[2]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.copy(P3(s)); const sz = 1.2 + Math.max(0, 5.5 - s[2]) * 0.9; sp.scale.set(sz, sz, 1); sp.userData.tw = Math.random() * 6; sp.userData.sz = sz; shown.add(sp); });
  }
  const sightTex = kind => canvasTex(512, 512, (g, w) => {
    const c = w / 2, R = (seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; })(kind.length * 997 + 13);
    const glow = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
    const star = (x, y, r, col = '255,255,255') => glow(x, y, r, `rgba(${col},A)`, 1);
    if (kind === 'moon') { g.fillStyle = '#c9c6bd'; g.beginPath(); g.arc(c, c, 190, 0, 6.283); g.fill(); g.fillStyle = 'rgba(70,70,74,0.45)'; for (const [x, y, r] of [[-60, -40, 60], [40, -70, 45], [-20, 60, 70], [70, 40, 40]]) { g.beginPath(); g.ellipse(c + x, c + y, r, r * 0.8, 0.4, 0, 6.283); g.fill(); } for (let i = 0; i < 70; i++) { const a = R() * 6.283, d = R() * 175, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d, r = 3 + R() * 14; g.strokeStyle = 'rgba(60,58,55,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke(); g.fillStyle = 'rgba(255,255,250,0.18)'; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, 6.283); g.fill(); } const sh = g.createLinearGradient(c - 190, 0, c + 190, 0); sh.addColorStop(0.7, 'rgba(3,5,12,0)'); sh.addColorStop(1, 'rgba(3,5,12,0.95)'); g.fillStyle = sh; g.beginPath(); g.arc(c, c, 191, 0, 6.283); g.fill(); }
    if (kind === 'saturn' || kind === 'jupiter') {
      const r = kind === 'saturn' ? 95 : 140, band = kind === 'saturn' ? ['#e8d6a8', '#d6bf86', '#c9ad73'] : ['#e8dcc6', '#c49a6c', '#d9c3a0', '#a8745a'];
      if (kind === 'saturn') { g.save(); g.translate(c, c); g.scale(1, 0.32); g.strokeStyle = 'rgba(214,196,150,0.9)'; g.lineWidth = 26; g.beginPath(); g.arc(0, 0, 200, Math.PI, 2 * Math.PI); g.stroke(); g.strokeStyle = 'rgba(180,160,120,0.7)'; g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 168, Math.PI, 2 * Math.PI); g.stroke(); g.restore(); }
      g.save(); g.beginPath(); g.arc(c, c, r, 0, 6.283); g.clip(); for (let y = -r; y < r; y += 12) { g.fillStyle = band[Math.abs(Math.floor(y / 12 + (kind === 'jupiter' ? 0.5 * Math.sin(y) : 0))) % band.length]; g.fillRect(c - r, c + y, 2 * r, 13); } if (kind === 'jupiter') { g.fillStyle = '#b5574a'; g.beginPath(); g.ellipse(c + 40, c + 45, 28, 16, 0, 0, 6.283); g.fill(); } const sh = g.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.2, c, c, r); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = sh; g.fillRect(c - r, c - r, 2 * r, 2 * r); g.restore();
      if (kind === 'saturn') { g.save(); g.translate(c, c); g.scale(1, 0.32); g.strokeStyle = 'rgba(224,206,160,0.95)'; g.lineWidth = 26; g.beginPath(); g.arc(0, 0, 200, 0, Math.PI); g.stroke(); g.strokeStyle = 'rgba(190,170,130,0.8)'; g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 168, 0, Math.PI); g.stroke(); g.restore(); }
      else for (const x of [-220, -175, 185, 232]) star(c + x, c + 4, 9, '255,250,230'); }
    if (kind === 'galaxy') { g.save(); g.translate(c, c); g.rotate(-0.5); g.scale(1, 0.38); glow(0, 0, 250, 'rgba(200,200,230,A)', 0.35); glow(0, 0, 120, 'rgba(255,240,210,A)', 0.8); glow(0, 0, 40, 'rgba(255,250,235,A)', 1); g.strokeStyle = 'rgba(40,30,40,0.35)'; g.lineWidth = 10; g.beginPath(); g.ellipse(0, 0, 150, 115, 0, 3.4, 6.0); g.stroke(); g.restore(); glow(c + 110, c - 90, 26, 'rgba(240,235,220,A)', 0.8); }
    if (kind === 'pleiades') { for (let i = 0; i < 40; i++) star(c + (R() - 0.5) * 380, c + (R() - 0.5) * 380, 4 + R() * 6, '190,210,255'); for (const [x, y] of [[-60, -30], [-10, -60], [30, -20], [60, 20], [0, 30], [-40, 40], [80, -60]]) { glow(c + x, c + y, 60, 'rgba(120,150,255,A)', 0.25); star(c + x, c + y, 18, '215,228,255'); } }
    if (kind === 'nebula') { for (let i = 0; i < 26; i++) glow(c + (R() - 0.5) * 260, c + (R() - 0.5) * 220, 60 + R() * 110, R() < 0.5 ? 'rgba(220,90,140,A)' : 'rgba(90,170,220,A)', 0.22); glow(c, c, 90, 'rgba(255,230,200,A)', 0.6); for (const [x, y] of [[-8, -6], [6, -4], [0, 8], [10, 6]]) star(c + x, c + y, 10); }
    if (kind === 'comet') { g.save(); g.translate(c + 120, c - 110); g.rotate(2.35); const tail = g.createLinearGradient(0, 0, 420, 0); tail.addColorStop(0, 'rgba(200,235,255,0.8)'); tail.addColorStop(1, 'rgba(200,235,255,0)'); g.fillStyle = tail; g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(220, -70, 420, -90); g.lineTo(420, 60); g.quadraticCurveTo(220, 40, 0, 10); g.fill(); g.restore(); glow(c + 120, c - 110, 50, 'rgba(210,255,240,A)', 1); star(c + 120, c - 110, 16); }
    if (kind === 'ring') { for (let i = 0; i < 30; i++) star(c + (R() - 0.5) * 460, c + (R() - 0.5) * 460, 3 + R() * 4); g.save(); g.translate(c, c); g.scale(1, 0.8); for (let k = 0; k < 3; k++) { g.strokeStyle = ['rgba(90,200,210,0.5)', 'rgba(240,120,80,0.55)', 'rgba(255,200,120,0.3)'][k]; g.lineWidth = 36 - k * 10; g.beginPath(); g.arc(0, 0, 70 + k * 8, 0, 6.283); g.stroke(); } g.restore(); star(c, c, 6, '220,230,255'); }
    if (kind === 'globular') { for (let i = 0; i < 700; i++) { const a = R() * 6.283, d = Math.pow(R(), 2.2) * 210; star(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + R() * 4, R() < 0.3 ? '255,220,180' : '255,250,240'); } glow(c, c, 120, 'rgba(255,240,215,A)', 0.4); }
    if (kind === 'double') { for (let i = 0; i < 30; i++) star(c + (R() - 0.5) * 460, c + (R() - 0.5) * 460, 3 + R() * 4); glow(c - 40, c + 10, 70, 'rgba(255,190,90,A)', 0.4); star(c - 40, c + 10, 30, '255,205,120'); glow(c + 55, c - 20, 50, 'rgba(120,160,255,A)', 0.4); star(c + 55, c - 20, 20, '160,190,255'); }
    if (kind === 'crab') { for (let i = 0; i < 18; i++) glow(c + (R() - 0.5) * 220, c + (R() - 0.5) * 160, 50 + R() * 70, 'rgba(120,160,230,A)', 0.2); g.strokeStyle = 'rgba(255,120,80,0.5)'; g.lineWidth = 3; for (let i = 0; i < 60; i++) { const a = R() * 6.283, d = 40 + R() * 110; g.beginPath(); g.moveTo(c + Math.cos(a) * d * 0.5, c + Math.sin(a) * d * 0.4); g.quadraticCurveTo(c + Math.cos(a + 0.3) * d, c + Math.sin(a + 0.3) * d * 0.7, c + Math.cos(a) * d * 1.1, c + Math.sin(a) * d * 0.8); g.stroke(); } star(c, c, 6); }
  });
  const sightCache = {};
  function showSight(s) { const t = sightCache[s.draw] || (sightCache[s.draw] = sightTex(s.draw)); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.position.set(0, 0, -100); sp.scale.set(40, 40, 1); shown.add(sp); }

  /* ---- 9-2: a flying saucer, modelled in full: a riveted hull, a band of running lights, a glass canopy with its pilot,
     a glowing underside with its beam, an antenna; its own lights in the eyepiece's scene ---- */
  const ufo = (() => {
    const g = new THREE.Group(), hull = new THREE.MeshStandardMaterial({ color: 0xb4bcc6, roughness: 0.28, metalness: 0.75 }), panelM = new THREE.MeshStandardMaterial({ color: 0x6e7680, roughness: 0.4, metalness: 0.8 });
    const prof = [[0.02, -0.34], [0.5, -0.33], [0.85, -0.25], [1.28, -0.1], [1.55, 0.0], [1.28, 0.1], [0.9, 0.2], [0.6, 0.26], [0.02, 0.28]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 64), hull));
    for (const [r, y] of [[1.05, 0.155], [0.75, 0.235], [1.05, -0.19], [0.62, -0.3]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 64), panelM); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, rv = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.012), panelM); rv.position.set(Math.cos(a) * 1.0, 0.17, Math.sin(a) * 1.0); rv.rotation.y = -a; rv.rotation.z = 1.2; g.add(rv); }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.555, 1.555, 0.06, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.5, metalness: 0.6 })); g.add(band);
    const lights = []; for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(Math.cos(a) * 1.56, 0, Math.sin(a) * 1.56); g.add(m); lights.push(m); }
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.58, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9ff0ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false })); canopy.position.y = 0.26; canopy.renderOrder = 2; g.add(canopy);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.03, 8, 48), hull); rim.rotation.x = Math.PI / 2; rim.position.y = 0.27; g.add(rim);
    const skin = new THREE.MeshStandardMaterial({ color: 0x7fcf6a, roughness: 0.5 }), black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.3 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), skin); head.scale.set(1, 1.2, 0.95); head.position.set(0, 0.55, 0.05); g.add(head);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), black); e.scale.set(1, 1.5, 0.6); e.position.set(s * 0.07, 0.57, 0.19); e.rotation.z = s * 0.4; g.add(e); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.2, 12), skin); neck.position.set(0, 0.36, 0.03); g.add(neck);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 6), panelM); ant.position.set(0.35, 0.45, -0.25); g.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 })); tip.position.set(0.35, 0.61, -0.25); g.add(tip);
    const under = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ color: 0x9ffcff })); under.rotation.x = Math.PI / 2; under.position.y = -0.345; g.add(under);
    const beamM = new THREE.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.3, 3.2, 32, 1, true), beamM); beam.position.y = -1.95; g.add(beam);
    const lights3 = new THREE.Group(); lights3.add(new THREE.HemisphereLight(0xaac8ff, 0x201810, 0.9)); const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 4, 5); lights3.add(key); const pl = new THREE.PointLight(0x9ffcff, 1.5, 8); pl.position.set(0, -1, 1); lights3.add(pl);
    return { g, lights, tip, beam, beamM, under, lights3 };
  })();
  function showUfo() { shown.add(ufo.g, ufo.lights3); ufo.g.position.set(0, 0, -14); ufo.g.scale.setScalar(1); }

  /* ---- the overlays: the panel's dials, the eyepiece's circle ---- */
  const ui = document.createElement('div'); ui.id = 'scopeView'; ui.className = 'hide'; document.body.appendChild(ui);
  const eyeUi = document.createElement('div'); eyeUi.id = 'scopeEye'; eyeUi.className = 'hide'; document.body.appendChild(eyeUi);
  let open = null, viewing = null, pick = S.dials.slice();
  const status = () => { const n = tonight().length; return skyUniforms.uNight.value < 0.55 ? 'The sky is too bright now. The stars come out at night.' : n >= PER_NIGHT ? 'Two sights tonight already. Come back tomorrow night.' : `Tonight you can still find ${PER_NIGHT - n} of 2.`; };
  function showPanel() {
    open = 'panel'; ui.classList.remove('hide');
    ui.innerHTML = `<div class="plate"><button class="close" aria-label="Close">×</button><h2>Telescope</h2><div class="sub">Set the two dials, then turn the telescope</div>
      <div class="dials">${[0, 1].map(i => `<div class="dial"><button data-d="${i}" data-s="1" aria-label="Up">▲</button><b>${pick[i]}</b><button data-d="${i}" data-s="-1" aria-label="Down">▼</button></div>`).join('<span class="dot">·</span>')}</div>
      <button class="go">Turn the telescope</button><div class="note">${status()}</div></div>`;
  }
  const closeUi = () => { open = null; ui.classList.add('hide'); };
  ui.addEventListener('pointerdown', e => {
    e.stopPropagation(); const b = e.target.closest && e.target.closest('button'); if (!b) return; e.preventDefault();
    if (b.classList.contains('close')) closeUi();
    else if (b.dataset.d !== undefined) { const i = +b.dataset.d; pick[i] = (pick[i] + +b.dataset.s + 10) % 10; ui.querySelectorAll('.dial b')[i].textContent = pick[i]; if (items) items.sfx('pebble'); }
    else if (b.classList.contains('go')) { closeUi(); confirm(pick[0], pick[1]); note(`The dome rumbles round; the telescope turns to ${pick[0]}·${pick[1]}.`, 3500); }
  });
  function look() {
    if (S.set === null) { note('Set the dials on the panel first.'); return; }
    if (slew) { note('The telescope is still turning.'); return; }
    if (skyUniforms.uNight.value < 0.55) { note('Only the bright sky in the eyepiece. Come back at night.'); return; }
    const thing = COMBOS[S.set], key = nightKey(), list = S.nights[key] || [];
    if (!list.includes(S.set) && list.length >= PER_NIGHT) { note('Clouds of your own breath fog the eyepiece… two sights a night. Come back tomorrow night.', 5200); return; }
    if (!list.includes(S.set)) { S.nights = { [key]: list.concat([S.set]) }; }
    const first = !S.seen[thing.name]; if (first) S.seen[thing.name] = S.set; save();
    clearShown(); if (thing.kind === 'constellation') showConstellation(thing); else if (thing.kind === 'sight') showSight(thing); else showUfo();
    viewing = { thing, t: 0, first }; eyeUi.classList.remove('hide');
    eyeUi.innerHTML = `<div class="ring"></div><div class="label"><b>${thing.name}</b><span>${thing.meaning}</span><em>${first ? 'Seen for the first time · noted in your journal' : 'Seen before'} · ${String(S.set).padStart(2, '0').split('').join('·')}</em></div><button class="close" aria-label="Stop looking">×</button>`;
    if (first && items) items.sfx('rareShell');
  }
  const stopLook = () => { viewing = null; eyeUi.classList.add('hide'); clearShown(); };
  eyeUi.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); stopLook(); });
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (viewing && (e.code === 'Escape' || e.code === 'KeyP')) { e.stopPropagation(); stopLook(); return; }
    if (open && e.code === 'Escape') { closeUi(); return; }
    if (e.code === 'KeyP' && st.playing && !open) { if (can() === 'panel') showPanel(); else if (can() === 'eye') look(); }
  }, true);

  const iconPanel = createActionIcon({ scene, camera, softDot, id: 'scopePanelIcon' }), iconEye = createActionIcon({ scene, camera, softDot, id: 'scopeEyeIcon' });
  iconPanel.onPress = () => { if (can() === 'panel') showPanel(); }; iconEye.onPress = () => { if (can() === 'eye') look(); };
  function can() {
    if (!st.playing || !st.walk || st.aboard || st.seat || viewing || open) return null;
    const p = camera.position; if (Math.hypot(p.x - P.x, p.z - P.z) > P.rIn) return null;
    if (lookingAt(camera, panelAt, 2.2, 0.6)) return 'panel';
    if (!slew && (lookingAt(camera, epWorld, 2.6, 0.75) || lookingAt(camera, tubeMid, 2.6, 0.45))) return 'eye';   // (at the eyepiece, or the telescope near it: look() says if the dials are not set)
    return null;
  }

  return {
    get viewing() { return !!viewing; },
    /** A takeover (app/controls.js): the camera stays put while you look through the eyepiece. */
    takeover() { return !!viewing; },
    render(renderer) { eye.camera.aspect = innerWidth / innerHeight; eye.camera.updateProjectionMatrix(); renderer.render(eye.scene, eye.camera); },
    update(dt, t) {
      if (slew) {
        slew.t += dt; const k = Math.min(1, slew.t / slew.T), e = k * k * (3 - 2 * k);
        cur.az = slew.from.az + (slew.to.az - slew.from.az) * e; cur.alt = slew.from.alt + (slew.to.alt - slew.from.alt) * e; setPose();
        S.dials.forEach((d, i) => { const from = slew.dial[i]; dials[i].rotation.x = dialAngle(from + (d - from) * Math.min(1, k * 2.5)); });
        if (k >= 1) { slew = null; dialNow.splice(0, 2, ...S.dials); cur.az = Math.atan2(Math.sin(cur.az), Math.cos(cur.az)); }
      }
      tubePivot.updateWorldMatrix(true, false); tubePivot.localToWorld(epWorld.copy(eyepiece)); tubePivot.localToWorld(tubeMid.set(0, -0.2, 0));
      const k = can();
      iconPanel.show(k === 'panel' ? panelAt : null, 'panel', ICON_PANEL, 'The telescope’s dials', t);
      iconEye.show(k === 'eye' ? epWorld : null, 'eye', ICON_EYE, 'Look through the telescope', t, 0.25);
      if (viewing) {
        viewing.t += dt; const vt = viewing.t;
        eye.camera.position.set(0, 0, 0); eye.camera.rotation.set(Math.sin(vt * 0.07) * 0.02, Math.sin(vt * 0.05) * 0.03, 0);
        shown.children.forEach(o => { if (o.isSprite && o.userData.sz) { const s = o.userData.sz * (0.9 + 0.12 * Math.sin(vt * 3 + o.userData.tw)); o.scale.set(s, s, 1); } });
        if (viewing.thing === UFO) {
          const g = ufo.g; g.position.set(Math.sin(vt * 0.4) * 1.2, Math.sin(vt * 0.9) * 0.35, -14 + Math.sin(vt * 0.3) * 1.5); g.rotation.set(0.35 + Math.sin(vt * 0.7) * 0.1, vt * 0.6, Math.sin(vt * 0.5) * 0.12);
          ufo.lights.forEach((m, i) => m.material.color.setHSL(((i / ufo.lights.length) + vt * 0.25) % 1, 1, 0.55 + 0.3 * Math.max(0, Math.sin(vt * 8 - i * 0.7))));
          ufo.tip.material.color.setRGB(Math.sin(vt * 6) > 0 ? 1 : 0.2, 0.1, 0.1); ufo.beamM.opacity = 0.12 + 0.08 * Math.sin(vt * 3); ufo.beam.rotation.y = vt;
        }
      }
    },
    /** The journal's page of what the telescope has found. */
    page: {
      id: 'stars', chip: '✦ Stars', title: 'The night sky',
      html() {
        const all = CONSTELLATIONS.concat(SIGHTS), n = all.filter(c => S.seen[c.name] !== undefined).length + (S.seen[UFO.name] !== undefined ? 1 : 0);
        const code = c => String(S.seen[c.name]).padStart(2, '0').split('').join('·');
        const sketch = c => { const xs = c.stars.map(s => s[0]), ys = c.stars.map(s => s[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), sp = Math.max(x1 - x0, y1 - y0, 4), k = 38 / sp, X = s => 4 + (s[0] - x0) * k + (38 - (x1 - x0) * k) / 2, Y = s => 4 + (y1 - s[1]) * k + (38 - (y1 - y0) * k) / 2;
          return `<svg viewBox="0 0 46 46" class="sk">${c.lines.map(([a, b]) => `<line x1="${X(c.stars[a]).toFixed(1)}" y1="${Y(c.stars[a]).toFixed(1)}" x2="${X(c.stars[b]).toFixed(1)}" y2="${Y(c.stars[b]).toFixed(1)}"/>`).join('')}${c.stars.map(s => `<circle cx="${X(s).toFixed(1)}" cy="${Y(s).toFixed(1)}" r="${Math.max(0.8, 2.6 - s[2] * 0.35).toFixed(1)}"/>`).join('')}</svg>`; };
        const seenC = CONSTELLATIONS.filter(c => S.seen[c.name] !== undefined), seenS = SIGHTS.filter(c => S.seen[c.name] !== undefined);
        return `<p class="today">${n} of 100 found through the telescope on Ember Rock. ${status()}</p>` +
          (n ? '' : '<p class="empty">Nothing yet. Sail to Ember Rock at night, set the dials in the observatory and look.</p>') +
          (seenC.length ? `<h4>Constellations · ${seenC.length} of 88</h4><div class="stars">${seenC.map(c => `<div class="st">${sketch(c)}<b>${c.name}</b><span>${c.meaning}</span><em>${code(c)}</em></div>`).join('')}</div>` : '') +
          (seenS.length ? `<h4>Other sights · ${seenS.length} of ${SIGHTS.length}</h4><ul class="keeps">${seenS.map(c => `<li class="got">${c.name} <em>${code(c)}</em> — ${c.meaning}</li>`).join('')}</ul>` : '') +
          (S.seen[UFO.name] !== undefined ? `<h4>Unexplained</h4><p class="ufo">??? — at 9·2, something hovered and blinked, then drifted off. Nobody will believe you.</p>` : '');
      },
    },
    /** For testing. */
    _state: S, _confirm: confirm, _look: look, get _slewing() { return !!slew; },
  };
}
