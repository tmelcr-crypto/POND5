import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { setSeed } from '../../core/random.js';
import { V, UPV, clamp, lin } from '../../core/math.js';
import { limb, mergeRanked, rankedInstances } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { addFlutter, addThinning, dampSpecular } from '../../core/shaderPatches.js';
import { buildApple } from './appleTree.js';

/**
 * The outer islands' own trees at the home island's detail (world/islandLife.js places them, world/scatter.js plants
 * them): a silver birch (white bark with dark lenticels, fine hanging twigs of small leaves), a weeping willow (a
 * short thick trunk, arching limbs and curtains of long whips with narrow leaves), a coconut palm (a ringed, curving
 * trunk and a crown of fronds, each a rachis with a leaflet card either side every few centimetres, coconuts, dead
 * fronds hanging) and a dead, charred tree for Ember Rock (the apple generator's branching without leaves).
 * Each is built like the scatter's spruce and apple variants: local space, base at the origin, parts carrying detail
 * ranks for addThinning (outer cards low), in the variant format plantGroups / updateGroups / bakeAtlas take. Each
 * variant draws from its own seed (a stream of its own, never the shared one's order).
 */
const stream = seed => { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const tag = (m, season) => { m.userData.season = season; return m; };
const depth = (map, alphaTest) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
const colour = (g, c, twig = 0) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), t = new Float32Array(n * 3); for (let i = 0; i < n; i++) { (typeof c === 'function' ? c(g.attributes.position.getY(i)) : c).toArray(a, i * 3); t[i * 3] = twig; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('twig', new THREE.BufferAttribute(t, 3)); return g; };

/** A card's matrix: pointing along dir, its face turned up-ish (rolled by roll), w x len. */
const Xv = new V(), Yv = new V(), Zv = new V();
function card(p, dir, w, len, roll) {
  Yv.copy(dir).normalize(); Zv.set(0, 1, 0).addScaledVector(Yv, -Yv.y); if (Zv.lengthSq() < 1e-4) Zv.set(1, 0, 0);
  Zv.normalize().applyAxisAngle(Yv, roll); Xv.crossVectors(Yv, Zv).normalize(); Zv.crossVectors(Xv, Yv).normalize();
  return new THREE.Matrix4().makeBasis(Xv, Yv, Zv).scale(new V(w, len, len)).setPosition(p);
}
/** Detail ranks: cards far out for their height (the silhouette) survive longest. */
function cardRanks(cards, R, bandH = 0.35) {
  const P = new V(), band = new Map(), bin = y => Math.floor(y / bandH);
  cards.forEach(([m]) => { P.setFromMatrixPosition(m); const b = bin(P.y); band.set(b, Math.max(band.get(b) || 0.05, Math.hypot(P.x, P.z))); });
  return cards.map(([m]) => { P.setFromMatrixPosition(m); const out = clamp(Math.hypot(P.x, P.z) / band.get(bin(P.y))); return R() * (0.45 + 0.55 * (1 - out * out)); });
}
function finish(name, R, wood, cards, cardGeo, mats, trunkRadius, extra = []) {
  const woodSet = mergeRanked(wood, ['position', 'normal', 'uv', 'color', 'twig'], g => (g.userData.twig ? 0.3 + 0.7 * R() : 0));
  const parts = [{ geometry: woodSet.geometry, material: mats.wood, depth: mats.woodDepth, vertexRanks: woodSet.ranks }];
  const P = new V(); let radius = 0.5, top = 1; const grow = p => { radius = Math.max(radius, Math.hypot(p.x, p.z)); top = Math.max(top, p.y); };
  woodSet.geometry.computeBoundingBox(); const bb = woodSet.geometry.boundingBox; grow(bb.min); grow(bb.max);
  let set = null;
  if (cards.length) { set = rankedInstances(cardGeo, cards.map(c => c[0]), cardRanks(cards, R), cards.map(c => c[1])); cards.forEach(([m]) => grow(P.setFromMatrixPosition(m))); parts.push({ geometry: set.geometry, material: mats.card, depth: mats.cardDepth, instances: set }); }
  const bounds = new THREE.Sphere(new V(0, top / 2, 0), Math.hypot(radius, top / 2) + 0.4);
  parts.forEach(p => { p.geometry.boundingSphere = bounds.clone(); });
  return { name, height: top + 0.2, width: 2 * radius + 0.4, trunkRadius, bounds, cards: set ? set.count : 0, cardRanks: set ? set.ranks : new Float32Array(0), parts: parts.concat(extra) };
}
function materials(barkMap, cardMap, alphaTest, season, flutter, barkColor = 0xffffff) {
  const wood = tag(new THREE.MeshStandardMaterial({ map: barkMap, vertexColors: true, color: lin(barkColor), roughness: 0.9 }), 'bark');
  const card = new THREE.MeshStandardMaterial({ map: cardMap, alphaTest, side: THREE.DoubleSide, roughness: 0.72, envMapIntensity: 0.55 }); if (season) tag(card, season);
  addFlutter(card, flutter); dampSpecular(card, 0.5);
  const m = { wood, card, woodDepth: depth(null, 0), cardDepth: depth(cardMap, alphaTest) };
  addThinning(m.wood, false); addThinning(m.woodDepth, false); addThinning(m.card, true); addThinning(m.cardDepth, true);
  return m;
}

/* ---- textures: birch bark, a palm leaflet ---- */
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const R = stream(771);
  const birch = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#ebe7df'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(190,182,170,${0.2 + R() * 0.3})`; g.fillRect(R() * w, R() * h, 8 + R() * 30, 2 + R() * 3); }
    for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h, l = 5 + R() * 22; g.fillStyle = `rgba(28,24,22,${0.55 + R() * 0.4})`; g.beginPath(); g.ellipse(x, y, l, 0.8 + R() * 1.6, 0, 0, 6.28); g.fill(); }
    for (let i = 0; i < 9; i++) { const x = R() * w, y = R() * h; g.fillStyle = 'rgba(30,26,24,0.8)'; g.beginPath(); g.moveTo(x, y - 6 - R() * 8); g.lineTo(x + 5 + R() * 6, y); g.lineTo(x, y + 6 + R() * 8); g.lineTo(x - 5 - R() * 6, y); g.fill(); }
  });
  birch.wrapS = birch.wrapT = THREE.RepeatWrapping; birch.repeat.set(1, 3);
  const blade = canvasTex(32, 256, (g, w, h) => {
    g.beginPath(); g.moveTo(w / 2, 2); g.bezierCurveTo(w * 0.95, h * 0.25, w * 0.9, h * 0.7, w / 2 + 1, h - 1); g.bezierCurveTo(w * 0.1, h * 0.7, w * 0.05, h * 0.25, w / 2, 2); g.closePath();
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#3f7a2a'); grd.addColorStop(0.5, '#6fa446'); grd.addColorStop(1, '#3a6f26'); g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(220,236,170,0.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, h - 3); g.stroke();
  });
  TEX = { birch, blade }; return TEX;
}

/* ---- silver birch ---- */
export function createBirchVariants(ctx, count, seed) {
  const { leafTex } = ctx.tex, T = textures();
  const mats = materials(T.birch, leafTex, 0.5, 'leafVeg', 0.016);
  const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
  const dens = isTouch ? 0.65 : 1, out = [];
  const white = new THREE.Color(1, 1, 1), grey = new THREE.Color(0.8, 0.78, 0.75), twigC = lin(0x4a3228).multiplyScalar(1.6);
  for (let v = 0; v < count; v++) {
    const R = stream(seed + v * 7717), rr = (a, b) => a + (b - a) * R();
    const Ht = rr(7.2, 9.4), lean = new V(rr(-0.3, 0.3), 0, rr(-0.3, 0.3)), wood = [], cards = [];
    const trunkAt = t => new V(lean.x * t * t + 0.05 * Math.sin(t * 9 + v), t * Ht, lean.z * t * t + 0.05 * Math.cos(t * 7 + v));
    const rAt = t => 0.17 * Math.pow(1 - t, 0.85) + 0.02;
    const baseDark = y => white.clone().lerp(new THREE.Color(0.28, 0.26, 0.25), 1 - clamp(y / 1.3)).multiplyScalar(1);
    for (let i = 0; i < 10; i++) { const t0 = i / 10, t1 = (i + 1) / 10; wood.push(colour(limb(trunkAt(t0).add(new V(0, i === 0 ? -0.1 : 0, 0)), trunkAt(t1), rAt(t0), rAt(t1), 10, 2), baseDark)); }
    wood.push(colour(limb(new V(0, -0.12, 0), new V(0, 0.3, 0), 0.28, 0.18, 10), baseDark));
    const NB = Math.round(30 + 6 * R());
    for (let i = 0; i < NB; i++) {
      const t = 0.3 + 0.66 * Math.pow(i / NB, 0.9), p0 = trunkAt(t), az = i * 2.39996 + rr(-0.3, 0.3), el = rr(0.5, 0.95);
      const L = (1.9 * Math.pow(1 - t, 0.7) + 0.45) * rr(0.8, 1.15), dir = new V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const p1 = p0.clone().addScaledVector(dir, L * 0.45), d2 = new V(dir.x, dir.y * 0.3 - 0.1, dir.z).normalize(), p2 = p1.clone().addScaledVector(d2, L * 0.33);
      const d3 = new V(dir.x, -0.55, dir.z).normalize(), p3 = p2.clone().addScaledVector(d3, L * 0.25), r0 = 0.045 * (1 - t) + 0.012;
      wood.push(colour(limb(p0, p1, r0, r0 * 0.6, 6), grey), colour(limb(p1, p2, r0 * 0.6, r0 * 0.35, 5), grey), colour(limb(p2, p3, r0 * 0.35, 0.005, 4), twigC));
      const pts = [p0, p1, p2, p3], along = s => { const k = Math.min(2, Math.floor(s * 3)); return pts[k].clone().lerp(pts[k + 1], s * 3 - k); };
      const nTw = Math.round((6 + 8 * L) * dens);
      for (let k = 0; k < nTw; k++) {
        const s = rr(0.3, 1), bp = along(s), side = k % 2 ? 1 : -1;
        const td = new V(dir.x, 0, dir.z).normalize().applyAxisAngle(UPV, side * rr(0.3, 1.2)); td.y = -rr(0.5, 1.3); td.normalize();
        const tl = rr(0.35, 0.8) * Math.min(1, 0.5 + L * 0.35), mid = bp.clone().addScaledVector(td, tl * 0.5); mid.y -= tl * 0.08; const te = bp.clone().addScaledVector(td, tl); te.y -= tl * 0.2;
        const g1 = colour(limb(bp, mid, 0.006, 0.004, 3), twigC), g2 = colour(limb(mid, te, 0.004, 0.0022, 3), twigC); g1.userData.twig = g2.userData.twig = true; wood.push(g1, g2);
        for (let u = 0.12; u <= 1.001; u += 0.13 / dens) {
          const np = u < 0.5 ? bp.clone().lerp(mid, u * 2) : mid.clone().lerp(te, (u - 0.5) * 2), nl = 2 + Math.floor(R() * 2);
          for (let l = 0; l < nl; l++) {
            const a = R() * 6.28, ld = td.clone().multiplyScalar(0.7).add(new V(Math.cos(a), rr(-0.4, 0.2), Math.sin(a))).normalize(), sz = rr(0.075, 0.1);
            const shade = 0.55 + 0.35 * clamp(np.y / Ht) + 0.25 * clamp(Math.hypot(np.x, np.z) / 2.2);
            cards.push([card(np, ld, sz * 0.62, sz, rr(-0.9, 0.9)), new THREE.Color(rr(0.95, 1.12), rr(1.0, 1.15), rr(0.55, 0.78)).multiplyScalar(shade)]);
          }
        }
      }
    }
    out.push(finish('birch' + v, R, wood, cards, leafGeo, mats, 0.22));
  }
  return out;
}

/* ---- weeping willow ---- */
export function createWillowVariants(ctx, count, seed) {
  const { barkTex, leafTex } = ctx.tex;
  const mats = materials(barkTex, leafTex, 0.5, 'leafVeg', 0.02, 0x8a7e6c);
  const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, 0.5, 0);
  const dens = isTouch ? 0.65 : 1, out = [], barkC = new THREE.Color(1, 1, 1), twigC = new THREE.Color(1.25, 1.45, 0.8);   // (the whips: yellow-green through the bark tint)
  for (let v = 0; v < count; v++) {
    const R = stream(seed + v * 6007), rr = (a, b) => a + (b - a) * R();
    const wood = [], cards = [], arches = [];
    const h0 = rr(1.8, 2.5), la = R() * 6.28, top = new V(Math.cos(la) * 0.35, h0, Math.sin(la) * 0.35);
    wood.push(colour(limb(new V(0, -0.15, 0), new V(top.x * 0.5, h0 * 0.5, top.z * 0.5), 0.42, 0.34, 12, 2), barkC), colour(limb(new V(top.x * 0.5, h0 * 0.5, top.z * 0.5), top, 0.34, 0.28, 12, 2), barkC));
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.3; wood.push(colour(limb(new V(0, 0.25, 0), new V(Math.cos(a) * 0.62, -0.1, Math.sin(a) * 0.62), 0.14, 0.04, 6), barkC)); }
    const nL = 4 + Math.floor(R() * 2);
    for (let i = 0; i < nL; i++) {
      const az = i / nL * 6.28 + rr(-0.35, 0.35), el = rr(0.75, 1.1), out3 = new V(Math.cos(az), 0, Math.sin(az));
      const e1 = top.clone().add(new V(out3.x * Math.cos(el), Math.sin(el), out3.z * Math.cos(el)).multiplyScalar(rr(1.8, 2.6)));
      const e2 = e1.clone().add(new V(out3.x * 0.9, 0.35, out3.z * 0.9).normalize().multiplyScalar(rr(1.2, 1.8)));
      const e3 = e2.clone().add(new V(out3.x * 0.8, -0.35, out3.z * 0.8).multiplyScalar(rr(0.7, 1.0)));
      wood.push(colour(limb(top, e1, 0.2, 0.12, 8), barkC), colour(limb(e1, e2, 0.12, 0.06, 6), barkC), colour(limb(e2, e3, 0.06, 0.02, 5), barkC));
      arches.push([e1, e2], [e2, e3]);
      for (const s of [-1, 1]) { const d = out3.clone().applyAxisAngle(UPV, s * rr(0.5, 0.8)), e4 = e1.clone().add(new V(d.x * 0.7, 0.45, d.z * 0.7).normalize().multiplyScalar(rr(1.1, 1.5))), e5 = e4.clone().add(new V(d.x, -0.3, d.z).multiplyScalar(0.7));
        wood.push(colour(limb(e1, e4, 0.07, 0.035, 5), barkC), colour(limb(e4, e5, 0.035, 0.012, 4), barkC)); arches.push([e1, e4], [e4, e5]); }
    }
    // the whips: from the arches out a little, then hanging straight down nearly to the ground, leaves all along them
    const nW = Math.round(175 * dens);
    for (let w = 0; w < nW; w++) {
      const [a, b] = arches[Math.floor(R() * arches.length)], sp = a.clone().lerp(b, rr(0.25, 1)), out3 = new V(sp.x, 0, sp.z).normalize();
      const pts = [sp, sp.clone().add(new V(out3.x * 0.22, 0.1, out3.z * 0.22))], stop = rr(0.35, 1.5), sway = new V(rr(-0.06, 0.06), 0, rr(-0.06, 0.06));
      while (pts[pts.length - 1].y > stop && pts.length < 22) { const q = pts[pts.length - 1], k = pts.length; pts.push(q.clone().add(new V(out3.x * 0.07 / k + sway.x, -0.34, out3.z * 0.07 / k + sway.z))); }
      for (let i = 1; i < pts.length; i++) { const r0 = 0.005 * (1 - i / pts.length) + 0.0022; const g = colour(limb(pts[i - 1], pts[i], r0, r0 * 0.85, 3), twigC); g.userData.twig = true; wood.push(g); }
      const len = pts.length - 1, step = 0.048 / dens;
      for (let u = 0.04; u < len * 0.34; u += step) {
        const k = Math.min(len - 1, Math.floor(u / 0.34)), f = u / 0.34 - k, p = pts[k].clone().lerp(pts[k + 1], f), tan = pts[k + 1].clone().sub(pts[k]).normalize();
        const side = new V().crossVectors(tan, UPV); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize().multiplyScalar((Math.round(u / step) % 2 ? 1 : -1) * rr(0.4, 0.9));
        const ld = tan.clone().multiplyScalar(0.8).add(side).add(out3.clone().multiplyScalar(0.25)).normalize(), sz = rr(0.1, 0.15);
        const shade = 0.5 + 0.45 * clamp(p.y / 5) + 0.2 * clamp(Math.hypot(p.x, p.z) / 4);
        cards.push([card(p, ld, sz * 0.3, sz, rr(-0.6, 0.6)), new THREE.Color(rr(0.85, 1.0), rr(1.05, 1.18), rr(0.62, 0.82)).multiplyScalar(shade + 0.15)]);
      }
    }
    // a few leafy sprays up on the arches (the crown's top)
    for (let k = 0; k < 520 * dens; k++) {
      const [a, b] = arches[Math.floor(R() * arches.length)], p = a.clone().lerp(b, R()).add(new V(rr(-0.25, 0.25), rr(0, 0.2), rr(-0.25, 0.25))), d = new V(rr(-1, 1), rr(-0.5, 0.8), rr(-1, 1)).normalize(), sz = rr(0.085, 0.12);
      cards.push([card(p, d, sz * 0.28, sz, rr(-1, 1)), new THREE.Color(rr(0.8, 0.95), rr(1.02, 1.12), rr(0.65, 0.8)).multiplyScalar(0.95 + 0.2 * R())]);
    }
    out.push(finish('willow' + v, R, wood, cards, leafGeo, mats, 0.45));
  }
  return out;
}

/* ---- coconut palm ---- */
export function createPalmVariants(ctx, count, seed) {
  const { barkTex } = ctx.tex, T = textures();
  const mats = materials(barkTex, T.blade, 0.45, null, 0.03, 0xb0a080);
  const bladeGeo = new THREE.PlaneGeometry(1, 1); bladeGeo.translate(0, 0.5, 0);
  const dens = isTouch ? 0.72 : 1, out = [];
  const ring = y => new THREE.Color(1, 0.96, 0.9).multiplyScalar(((y / 0.13) % 1 + 1) % 1 < 0.22 ? 0.55 : 0.95), stalk = lin(0x9a9a5a).multiplyScalar(1.4), dead = lin(0x8a6a3e).multiplyScalar(1.6), nut = lin(0x5c5a22).multiplyScalar(1.6);
  for (let v = 0; v < count; v++) {
    const R = stream(seed + v * 5003), rr = (a, b) => a + (b - a) * R();
    const Ht = rr(5.2, 7.2), bend = rr(0.6, 1.3), wood = [], cards = [];
    const P = t => new V(bend * t * t * Ht * 0.3, t * Ht, 0.1 * Math.sin(t * 5 + v) * t);
    const rAt = t => 0.17 - 0.05 * t + 0.12 * Math.max(0, 1 - t * 14);
    for (let i = 0; i < 16; i++) { const t0 = i / 16, t1 = (i + 1) / 16; wood.push(colour(limb(P(t0).add(new V(0, i ? 0 : -0.15, 0)), P(t1), rAt(t0), rAt(t1), 10, 3), ring)); }
    const top = P(1), tan = P(1).sub(P(0.95)).normalize();
    wood.push(colour(limb(top.clone().addScaledVector(tan, -0.35), top.clone().addScaledVector(tan, 0.25), 0.2, 0.12, 10), stalk));   // the crown shaft
    for (let k = 0; k < 8; k++) { const a = k * 0.8 + R(), g = new THREE.SphereGeometry(0.1, 10, 8); g.translate(top.x + Math.cos(a) * 0.2, top.y - 0.28 - 0.07 * (k % 3), top.z + Math.sin(a) * 0.2); wood.push(colour(g.toNonIndexed(), nut)); }
    const frond = (az, el, L, isDead) => {
      const pts = [top.clone()], dir = new V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)), ds = L / 12;
      for (let k = 0; k < 12; k++) { dir.y -= (isDead ? 0.35 : 0.1) + 0.02 * k; dir.normalize(); pts.push(pts[k].clone().addScaledVector(dir, ds)); }
      for (let k = 0; k < 12; k++) { const r0 = 0.036 * (1 - k / 12) + 0.007; wood.push(colour(limb(pts[k], pts[k + 1], r0, r0 * 0.85, 4), isDead ? dead : stalk)); }
      const step = (isDead ? 0.07 : 0.028) / dens;
      for (let s = 0.1 * L; s < L * 0.98; s += step) {
        const k = Math.min(11, Math.floor(s / ds)), f = s / ds - k, p = pts[k].clone().lerp(pts[k + 1], f), t = pts[k + 1].clone().sub(pts[k]).normalize();
        const side = new V().crossVectors(t, UPV).normalize(), u = s / L, ll = 0.78 * Math.sin(Math.PI * (0.12 + 0.86 * u)) * rr(0.85, 1.1) + 0.08;
        for (const sg of [-1, 1]) {
          const d = side.clone().multiplyScalar(sg).addScaledVector(t, 0.55).add(new V(0, isDead ? -0.9 : -0.32 - 0.25 * u, 0)).add(new V(rr(-0.08, 0.08), rr(-0.08, 0.08), rr(-0.08, 0.08))).normalize();
          const tone = isDead ? new THREE.Color(1.35, 0.95, 0.55).multiplyScalar(rr(0.8, 1.05)) : new THREE.Color(rr(0.9, 1.05), rr(1.0, 1.12), rr(0.7, 0.85)).multiplyScalar(0.72 + 0.4 * (1 - u) * 0.5 + 0.2 * R());
          cards.push([card(p, d, 0.06, ll, sg * rr(0.3, 0.7)), tone]);
        }
      }
    };
    const nF = Math.round((14 + Math.floor(R() * 4)) * (isTouch ? 0.85 : 1));
    for (let f = 0; f < nF; f++) frond(f / nF * 6.28 + rr(-0.2, 0.2), rr(-0.25, 0.85), rr(2.5, 3.4), false);
    for (let f = 0; f < 2; f++) frond(R() * 6.28, -0.6, rr(1.6, 2.2), true);
    out.push(finish('palm' + v, R, wood, cards, bladeGeo, mats, 0.24));
  }
  return out;
}

/* ---- the dead, charred trees on Ember Rock: the apple generator's branching, leafless ---- */
export function createSnagVariants(ctx, count, seed) {
  const { barkTex } = ctx.tex;
  const mats = materials(barkTex, null, 0, null, 0, 0x4a4440);
  delete mats.wood.userData.season;
  const out = [], char = y => new THREE.Color(0.55, 0.52, 0.5).multiplyScalar(0.8 + 0.25 * Math.sin(y * 3.1));
  for (let v = 0; v < count; v++) {
    setSeed(seed + v * 3571);
    const t = buildApple(0, 0, 0, false), R = stream(seed + v);
    const wood = t.bark.map(g => colour(g.index ? g.toNonIndexed() : g, char)).concat(t.twigs.filter((g, i) => i % 3 === 0).map(g => { const c = colour(g.index ? g.toNonIndexed() : g, char); c.userData.twig = true; return c; }));
    out.push(finish('snag' + v, R, wood, [], null, mats, 0.2));
  }
  return out;
}
