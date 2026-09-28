import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { vnoise3 } from '../../core/noise.js';
import { mergeGeos, paint, limb, joint } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { STORY, JETTY, H } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The things of Captain Elias's story (#17; the story: app/bottles.js, the messages: story/bottleMessages.js):
 *  - the crooked tree on the dune by the old dock: a dead, wind-bent pine, grey and twisted, a star carved in its
 *    trunk facing the jetty;
 *  - the brass key at its foot, a star scratched on its bow (shown once 15 messages have been read);
 *  - under the jetty's first span, a lid of old planks flush with the sand, an iron ring and a star burnt into it
 *    (shown then too); lifted, the Friendship Chest in its hole below, open;
 *  - a bottle's model (bottleGeo) for the ones that wash up, and the models of the brass key and the old photograph
 *    (storyModel, for the hand and the cabin shelf).
 * Its own random numbers.
 */
export function starTexture() {   // a carved five-pointed star, dark in the middle, pale cut edges
  return canvasTex(64, 64, (g, w) => {
    g.clearRect(0, 0, w, w); g.translate(w / 2, w / 2);
    const star = r => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
    star(28); g.fillStyle = 'rgba(230,215,185,0.9)'; g.fill(); star(24); g.fillStyle = 'rgba(40,28,18,0.92)'; g.fill();
  });
}
export function bottleGeo() {
  const pts = []; for (const [r, y] of [[0, 0], [0.034, 0], [0.037, 0.01], [0.037, 0.13], [0.03, 0.16], [0.014, 0.19], [0.013, 0.24], [0.016, 0.245], [0.014, 0.25]]) pts.push(new THREE.Vector2(r, y));
  const glass = new THREE.LatheGeometry(pts, 16);
  const cork = new THREE.CylinderGeometry(0.012, 0.011, 0.03, 10); cork.translate(0, 0.258, 0);
  const paper = new THREE.CylinderGeometry(0.014, 0.014, 0.11, 10); paper.translate(0, 0.075, 0);
  return { glass, cork, paper };
}
export function storyModel(kind) {
  if (kind === 'brassKey') {
    const bow = new THREE.TorusGeometry(0.013, 0.004, 6, 16), shaft = new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 6); shaft.rotateZ(Math.PI / 2); shaft.translate(0.038, 0, 0);
    const bit = new THREE.BoxGeometry(0.006, 0.012, 0.004); bit.translate(0.058, -0.008, 0); const bit2 = bit.clone(); bit2.translate(-0.01, 0, 0);
    return { geo: mergeGeos([bow, shaft, bit, bit2], ['position', 'normal']), mat: new THREE.MeshStandardMaterial({ color: lin(0xc9a043), roughness: 0.35, metalness: 0.8 }) };
  }
  // the old photograph: a small card in a wooden frame, standing
  const tex = photoTexture(), frame = new THREE.BoxGeometry(0.12, 0.09, 0.012), pic = new THREE.PlaneGeometry(0.1, 0.07); pic.translate(0, 0, 0.0065);
  const back = new THREE.BoxGeometry(0.01, 0.07, 0.04); back.rotateX(-0.35); back.translate(0, -0.012, -0.02);
  const g = mergeGeos([frame, back], ['position', 'normal']); g.addGroup(0, g.attributes.position.count, 0);
  const all = new THREE.Group(); const f = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: lin(0x6e4a2c), roughness: 0.7 })), p = new THREE.Mesh(pic, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  all.add(f, p); all.position.y = 0.045; const o = new THREE.Group(); o.add(all); return { object: o };
}
let photoTex = null;
/** The photograph in the Friendship Chest: two boys and their little boat, sepia. Also shown in the journal. */
export function photoTexture() {
  if (photoTex) return photoTex;
  photoTex = canvasTex(320, 224, (g, w, h) => { drawPhoto(g, w, h); });
  return photoTex;
}
export function drawPhoto(g, w, h) {
  g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
  const x0 = 12, y0 = 12, W = w - 24, Hh = h - 40;
  const sky = g.createLinearGradient(0, y0, 0, y0 + Hh); sky.addColorStop(0, '#d8c4a0'); sky.addColorStop(0.55, '#c9b28a'); sky.addColorStop(0.56, '#8f7a5a'); sky.addColorStop(1, '#6e5b42');
  g.fillStyle = sky; g.fillRect(x0, y0, W, Hh);
  g.fillStyle = '#5a4630'; g.beginPath(); g.moveTo(x0 + W * 0.15, y0 + Hh * 0.72); g.quadraticCurveTo(x0 + W * 0.45, y0 + Hh * 0.9, x0 + W * 0.8, y0 + Hh * 0.72); g.lineTo(x0 + W * 0.75, y0 + Hh * 0.8); g.lineTo(x0 + W * 0.2, y0 + Hh * 0.8); g.fill();   // the boat
  g.strokeStyle = '#4a3a28'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + W * 0.5, y0 + Hh * 0.72); g.lineTo(x0 + W * 0.5, y0 + Hh * 0.2); g.stroke();
  g.fillStyle = '#efe4cc'; g.beginPath(); g.moveTo(x0 + W * 0.51, y0 + Hh * 0.22); g.lineTo(x0 + W * 0.7, y0 + Hh * 0.62); g.lineTo(x0 + W * 0.51, y0 + Hh * 0.62); g.fill();
  const boy = (x, s) => { g.fillStyle = '#3e2f20'; g.beginPath(); g.arc(x, y0 + Hh * 0.47, 7 * s, 0, 6.28); g.fill(); g.fillRect(x - 6 * s, y0 + Hh * 0.52, 12 * s, 18 * s); g.fillRect(x - 6 * s - 6, y0 + Hh * 0.54, 6, 3); };
  boy(x0 + W * 0.33, 1); boy(x0 + W * 0.42, 0.9);
  g.fillStyle = 'rgba(80,60,35,0.25)'; for (let i = 0; i < 300; i++) g.fillRect(x0 + Math.random() * W, y0 + Math.random() * Hh, 1, 1);
  g.fillStyle = '#4a3a28'; g.font = 'italic 16px Georgia, serif'; g.textAlign = 'center'; g.fillText('E + A, the summer we found the island', w / 2, h - 12);
}

export function createStoryThings(ctx) {
  const { scene, maxAniso } = ctx;
  let seed = 7717; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const star = starTexture(); star.anisotropy = maxAniso;
  const starMat = new THREE.MeshStandardMaterial({ map: star, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const starAt = (p, n, size, parent = scene) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), starMat); m.position.copy(p).addScaledVector(n, 0.006); m.lookAt(p.clone().add(n)); parent.add(m); return m; };

  /* ---- the crooked tree: a dead pine bent by the wind, its bark gone grey ---- */
  const T = STORY.tree, ty = H(T.x, T.z), toJetty = new THREE.Vector3(STORY.lid.x - T.x, 0, STORY.lid.z - T.z).normalize();
  const lean = toJetty.clone().multiplyScalar(-1);   // it leans away from the sea wind, inland
  // the trunk: bent hard inland by the wind, kinked twice where it once broke, twisting; thick at the foot
  const side = new THREE.Vector3(-lean.z, 0, lean.x), pts = [new THREE.Vector3(T.x, ty - 0.2, T.z)];
  const bends = [[0.0, 0.55, 0.0], [0.18, 0.5, 0.12], [0.35, 0.42, -0.1], [0.55, 0.3, 0.2], [0.7, 0.22, 0.05], [0.55, 0.3, -0.25], [0.6, 0.12, -0.1]];
  for (const [o, up, sd] of bends) pts.push(pts[pts.length - 1].clone().add(new THREE.Vector3(lean.x * o + side.x * sd, up, lean.z * o + side.z * sd)));
  const parts = [], R = t => 0.24 * Math.pow(1 - t, 1.3) + 0.03;
  for (let i = 0; i < pts.length - 1; i++) { const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1); parts.push(limb(pts[i], pts[i + 1], R(t0), R(t1), 10, 2)); parts.push(joint(pts[i + 1], R(t1) * 1.05)); }
  for (let b = 0; b < 7; b++) {   // gnarled bare branches, reaching away from the wind
    const k = 2 + (b % 5), from = pts[k], a = Math.atan2(lean.z, lean.x) + rr(-1.6, 1.6), len = rr(0.8, 1.6), up = rr(0.1, 0.5);
    let p0 = from.clone(), r0 = R(k / (pts.length - 1)) * 0.45;
    for (let s = 0; s < 3; s++) { const aa = a + rr(-0.6, 0.6), p1 = p0.clone().add(new THREE.Vector3(Math.cos(aa) * len / 3, up / 3 + rr(-0.1, 0.12), Math.sin(aa) * len / 3)); parts.push(limb(p0, p1, r0, r0 * 0.65, 6, 1)); p0 = p1; r0 *= 0.65; }
  }
  for (let r = 0; r < 5; r++) { const a = r / 5 * 6.28 + rr(-0.3, 0.3), end = new THREE.Vector3(T.x + Math.cos(a) * rr(0.5, 0.9), ty - 0.12, T.z + Math.sin(a) * rr(0.5, 0.9)); parts.push(limb(new THREE.Vector3(T.x, ty + 0.15, T.z), end, 0.11, 0.025, 6, 1)); }   // roots
  const tree = mergeGeos(parts.map(g => g.index ? g.toNonIndexed() : g), ['position', 'normal']);
  paint(tree, (c, x, y, z) => c.copy(lin(0x9a948a)).multiplyScalar(0.7 + 0.35 * vnoise3(x * 3, y * 12, z * 3)));
  const treeMesh = new THREE.Mesh(tree, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })); treeMesh.castShadow = treeMesh.receiveShadow = true; scene.add(treeMesh);
  obstacles.add(T.x, T.z, 0.35, ty + 3.5);
  { const p = pts[2].clone().lerp(pts[3], 0.4), n = toJetty.clone(); p.addScaledVector(n, R(0.35) + 0.01); starAt(p, n, 0.18); }   // the carved star, facing the dock

  /* ---- the brass key at the tree's foot, among the roots ---- */
  const km = storyModel('brassKey'), key = new THREE.Mesh(km.geo, km.mat);
  const kx = T.x + toJetty.x * 0.55, kz = T.z + toJetty.z * 0.55; key.position.set(kx, H(kx, kz) + 0.006, kz); key.rotation.set(-Math.PI / 2, 0, 0.8); key.scale.setScalar(1.4); key.castShadow = true; key.visible = false; scene.add(key);

  /* ---- the lid under the jetty's first span, and the chest below it ---- */
  const L = STORY.lid, ly = H(L.x, L.z);
  const hole = new THREE.Group(); hole.position.set(L.x, ly, L.z); hole.visible = false; scene.add(hole);
  const wood = new THREE.MeshStandardMaterial({ color: lin(0x6b5a44), roughness: 0.9 }), iron = new THREE.MeshStandardMaterial({ color: lin(0x3a3632), roughness: 0.5, metalness: 0.6 });
  const lid = new THREE.Group(); lid.position.set(-0.3, 0.02, 0); hole.add(lid);   // hinged along its -x edge
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.035, 0.12), wood); b.position.set(0.3, 0, (i - 1.5) * 0.125); b.scale.x = rr(0.96, 1.02); b.castShadow = b.receiveShadow = true; lid.add(b); }
  for (const x of [0.1, 0.5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.5), wood); b.position.set(x, -0.03, 0); lid.add(b); }
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 16), iron); ring.rotation.x = Math.PI / 2; ring.position.set(0.52, 0.022, 0); lid.add(ring); }
  starAt(new THREE.Vector3(0.25, 0.018, 0.05), new THREE.Vector3(0, 1, 0), 0.14, lid);
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.3, 16, 1, true), new THREE.MeshStandardMaterial({ color: lin(0x5a4a36), roughness: 1, side: THREE.BackSide })); pit.position.y = -0.14; pit.visible = false; hole.add(pit);
  const chest = new THREE.Group(); chest.position.y = -0.27; chest.visible = false; hole.add(chest);
  { const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; chest.add(b); };
    box(0.44, 0.02, 0.3, 0, 0.01, 0, wood); for (const s of [-1, 1]) { box(0.44, 0.2, 0.02, 0, 0.1, s * 0.14, wood); box(0.02, 0.2, 0.28, s * 0.21, 0.1, 0, wood); }
    for (const x of [-0.14, 0.14]) box(0.025, 0.21, 0.31, x, 0.1, 0, iron);
    // what is inside: a bundle of photographs, a rolled drawing, a little tin of jokes, letters tied with string
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.085), new THREE.MeshStandardMaterial({ map: photoTexture(), roughness: 0.8 })); ph.rotation.x = -Math.PI / 2 + 0.2; ph.position.set(-0.08, 0.16, 0.02); chest.add(ph);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 10), new THREE.MeshStandardMaterial({ color: lin(0xe6d8b8), roughness: 0.9 })); roll.rotation.z = Math.PI / 2 + 0.1; roll.position.set(0.02, 0.1, -0.08); chest.add(roll);
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 14), new THREE.MeshStandardMaterial({ color: lin(0x9a2a24), roughness: 0.4, metalness: 0.5 })); tin.position.set(0.12, 0.09, 0.05); chest.add(tin);
    const letters = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.07), new THREE.MeshStandardMaterial({ color: lin(0xefe6d0), roughness: 0.9 })); letters.position.set(-0.1, 0.07, -0.06); letters.rotation.y = 0.3; chest.add(letters); }
  void JETTY;

  const bottle = bottleGeo();
  return {
    tree: treeMesh, key, hole, lid, chest, pit, bottle,
    keyAt: new THREE.Vector3(kx, H(kx, kz) + 0.05, kz), lidAt: new THREE.Vector3(L.x, ly + 0.05, L.z),
    /** Show the key and the lid (15 messages read); open: the lid thrown back and the chest in view. */
    reveal(on, keyTaken, open) { key.visible = on && !keyTaken; hole.visible = on; pit.visible = chest.visible = on && open; lid.rotation.z = open ? 1.9 : 0; },
  };
}
