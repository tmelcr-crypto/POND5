import * as THREE from 'three';
import { V, clamp, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { seaY } from '../../world/layout.js';

/**
 * The little floatplane at the home jetty (flying it: app/flying.js). Built in its own frame: +x to the nose, y up from
 * the waterline, +z to the right (starboard). Two aluminium floats on struts, a cream fuselage with a navy belly and a red
 * cheat line, open side windows and windshield (glass panes over the gaps, so you see out from the pilot's seat), a high
 * wing on two struts (its underside PLANE_LOOK.wing.y m above the water: on a jetty it passes ~0.5 m over your head), a swept fin and
 * tailplane, a red cowl, spinner and a two-bladed propeller (prop.rotation.x spins it; a faint disc shows at speed), an
 * instrument panel and a yoke. Mooring lines from the floats to a jetty's bollards while it is tied up. setPose places it.
 * No random numbers. Every number is in PLANE_LOOK.
 */
export const PLANE_LOOK = {
  float: { x0: -3.0, x1: 3.1, z: 1.3, hw: 0.27, top: 0.42, bottom: -0.2 },   // m; each float's half-width, top and keel
  body: { y0: 2.0 },
  wing: { x0: -0.15, x1: 1.45, y: 3.37, t: 0.15, half: 4.8 },                 // chord from x0 (trailing edge) to x1; y: its underside
  prop: { x: 3.22, y: 2.57, r: 0.95 },
  pilot: new V(0.68, 3.05, -0.27),                                            // the pilot's eye, in the left seat
  door: new V(0.7, 0.42, -1.3),                                              // where you step onto the left float
  colors: { cream: 0xf1ede2, navy: 0x1f2d4c, red: 0xa8202c, metal: 0xc4c8cc, dark: 0x2b2d30, glass: 0xa9c2d0, tyre: 0x202020 },
};

export function createSeaplane(ctx, colors = {}) {
  const { scene } = ctx, PL = PLANE_LOOK, C = { ...PL.colors, ...colors };   // (colors: another livery, e.g. the story's last plane)
  const group = new THREE.Group(); group.rotation.order = 'YXZ'; scene.add(group);
  const col = h => lin(h);
  /** Give a geometry a single vertex colour (or by position via fn(x, y, z) -> hex), positions + normals + colours only. */
  const tint = (g, c) => {
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position, a = new Float32Array(p.count * 3), k = new THREE.Color();
    for (let i = 0; i < p.count; i++) { k.copy(typeof c === 'function' ? col(c(p.getX(i), p.getY(i), p.getZ(i))) : col(c)); a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!g.attributes.normal) g.computeVertexNormals(); return g;
  };
  const rod = (a, b, r0, r1 = r0, radial = 8) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r1, r0, d.length(), radial, 1); g.translate(0, d.length() / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.normalize()))); g.translate(a.x, a.y, a.z); return g.toNonIndexed(); };
  const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));

  /**
   * A lofted body: stations [x, yBottom, yTop, halfWidth], a rounded-box section (superellipse) at each; hole(x, y, z) leaves a
   * quad open (its glass goes to `glass`). Returns the skin's positions as a non-indexed geometry.
   */
  function loft(stations, steps, around, n, hole, glass) {
    const at = x => { let i = 0; while (i < stations.length - 2 && x < stations[i + 1][0]) i++; const a = stations[i], b = stations[i + 1], t = ease((a[0] - x) / (a[0] - b[0])); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; };
    const x0 = stations[0][0], x1 = stations[stations.length - 1][0], ring = [];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, [yb, yt, hw] = at(x), yc = (yb + yt) / 2, hh = (yt - yb) / 2, r = [];
      for (let j = 0; j <= around; j++) { const t = j / around * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); r.push(new V(x, yc + hh * Math.sign(s) * Math.abs(s) ** (2 / n), hw * Math.sign(c) * Math.abs(c) ** (2 / n))); }
      ring.push(r);
    }
    const skin = [], pane = [];
    for (let i = 0; i < steps; i++) for (let j = 0; j < around; j++) {
      const a = ring[i][j], b = ring[i + 1][j], c = ring[i + 1][j + 1], d = ring[i][j + 1], m = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
      const out = hole && hole(m.x, m.y, m.z) ? pane : skin;
      out.push(a, b, c, a, c, d);
    }
    // close the ends with fans
    for (const i of [0, steps]) { const cen = ring[i].reduce((s, p) => s.add(p), new V()).multiplyScalar(1 / ring[i].length); for (let j = 0; j < around; j++) i ? skin.push(cen, ring[i][j + 1], ring[i][j]) : skin.push(cen, ring[i][j], ring[i][j + 1]); }
    const geo = pts => { const g = new THREE.BufferGeometry(); g.setFromPoints(pts); g.computeVertexNormals(); return g; };
    if (glass && pane.length) glass.push(geo(pane));
    return geo(skin);
  }

  const parts = [], panes = [];
  /* ---- fuselage: cowl at the front, the cabin with its windows, tapering to the tail ---- */
  const y0 = PL.body.y0;
  const ST = [[3.05, y0 + 0.32, y0 + 0.84, 0.3], [2.65, y0 + 0.17, y0 + 0.98, 0.47], [2.2, y0 + 0.07, y0 + 1.05, 0.55], [1.6, y0, y0 + 1.35, 0.58], [0.0, y0, y0 + 1.35, 0.6], [-1.1, y0 + 0.06, y0 + 1.32, 0.56], [-2.2, y0 + 0.3, y0 + 1.2, 0.42], [-3.6, y0 + 0.62, y0 + 1.06, 0.22], [-4.95, y0 + 0.82, y0 + 1.0, 0.07]];
  const win = (x, y, z) => {
    const pillar = Math.abs(x - 1.6) < 0.07 || Math.abs(x - 0.32) < 0.07 || Math.abs(x + 0.95) < 0.07;
    if (pillar) return false;
    if (x > 1.6 && x < 2.22 && y > y0 + 0.78 && Math.abs(z) > 0.03) return true;                  // the windshield
    if (Math.abs(z) > 0.35 && y > y0 + 0.66 && y < y0 + 1.22 && x > -1.75 && x < 1.6) return true;  // the side windows
    return false;
  };
  const body = loft(ST.slice().reverse().map(s => s).sort((a, b) => b[0] - a[0]), 64, 32, 3.2, win, panes);
  parts.push(tint(body, (x, y) => x > 2.25 ? C.red : y < y0 + 0.3 ? C.navy : (y > y0 + 0.5 && y < y0 + 0.6 && x < 2.25) ? C.red : C.cream));

  /* ---- floats: long, a raised bow, a stepped keel ---- */
  const F = PL.float;
  for (const s of [-1, 1]) {
    const L = F.x1 - F.x0, fs = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12, x = F.x1 - L * u, bow = clamp(1 - u / 0.18), tail = clamp((u - 0.62) / 0.38);
      fs.push([x, F.bottom + 0.42 * bow ** 1.6 + 0.3 * tail ** 1.4, F.top - 0.05 * bow - 0.1 * tail, F.hw * (1 - 0.75 * bow ** 2) * (1 - 0.6 * tail ** 1.5) + 0.02]); }
    const g = loft(fs, 36, 16, 2.6); g.translate(0, 0, s * F.z);
    parts.push(tint(g, (x, y) => y < 0.02 ? C.navy : C.metal));
  }
  /* ---- struts: floats to the fuselage, spreader bars, the wing struts ---- */
  for (const s of [-1, 1]) {
    for (const [fx, bx] of [[1.15, 1.3], [-0.95, -0.75]]) parts.push(tint(rod(new V(fx, F.top - 0.02, s * F.z), new V(bx, y0 + 0.05, s * 0.42), 0.045, 0.04, 6), C.metal));
    parts.push(tint(rod(new V(0.95, y0 + 0.12, s * 0.55), new V(0.72, PL.wing.y + 0.02, s * 2.75), 0.035, 0.03, 6), C.metal));
  }
  for (const x of [1.15, -0.95]) parts.push(tint(rod(new V(x, F.top + 0.06, -F.z), new V(x, F.top + 0.06, F.z), 0.03, 0.03, 6), C.metal));

  /* ---- wing and tailplane: an extruded airfoil ---- */
  function foil(x0, x1, y, t, half, tip) {
    const chord = x1 - x0, sh = new THREE.Shape(), N = 16, th = c => 5 * t * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1015 * c ** 4);
    for (let i = 0; i <= N; i++) { const c = (i / N) ** 1.6, px = x1 - c * chord, py = y + t * 0.3 + th(c) * chord * 0.5; i ? sh.lineTo(px, py) : sh.moveTo(px, py); }
    for (let i = N; i >= 0; i--) { const c = (i / N) ** 1.6, px = x1 - c * chord, py = y + t * 0.3 - th(c) * chord * 0.28; sh.lineTo(px, py); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: half * 2, bevelEnabled: false, curveSegments: 1, steps: Math.max(4, Math.round(half * 5)) }); g.translate(0, 0, -half); g.deleteAttribute('uv');
    return tint(g, (x, yy, z) => Math.abs(z) > half - tip ? C.red : C.cream);
  }
  const W = PL.wing;
  parts.push(foil(W.x0, W.x1, W.y, W.t, W.half, 0.35));
  parts.push(foil(-4.95, -4.1, y0 + 0.78, 0.07, 1.7, 0.25));
  { const fin = new THREE.Shape(); fin.moveTo(-4.98, y0 + 0.9); fin.lineTo(-3.55, y0 + 1.02); fin.lineTo(-4.45, y0 + 2.25); fin.lineTo(-4.98, y0 + 2.25); fin.lineTo(-4.98, y0 + 0.9);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.07, bevelEnabled: false }); g.translate(0, 0, -0.035); g.deleteAttribute('uv');
    parts.push(tint(g, (x, y) => y > y0 + 1.95 ? C.red : y > y0 + 1.75 ? C.navy : C.cream)); }
  // the cabin's floor, two seats and a rear bulkhead (seen from the pilot's seat), a glare shield
  { const bx = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(tint(g, c)); };
    bx(2.2, 0.04, 1.0, 0.45, y0 + 0.12, 0, C.dark);
    for (const z of [-0.27, 0.27]) { bx(0.5, 0.1, 0.46, 0.55, y0 + 0.5, z, 0x5a3a2a); bx(0.1, 0.62, 0.46, 0.3, y0 + 0.82, z, 0x5a3a2a); }
    bx(0.04, 1.1, 1.05, -1.0, y0 + 0.65, 0, C.cream);
    bx(0.32, 0.05, 1.08, 1.5, y0 + 0.92, 0, C.dark);
    bx(0.06, 0.52, 1.08, 1.68, y0 + 0.36, 0, C.dark); }   // the firewall under the panel

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const main = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'color']), mat); group.add(main);
  const glassMat = new THREE.MeshStandardMaterial({ color: col(C.glass), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  const glass = new THREE.Mesh(mergeGeos(panes, ['position', 'normal']), glassMat); glass.castShadow = false; glass.renderOrder = 2; group.add(glass);

  /* ---- the instrument panel (six round dials, a fuel gauge in amber) and the yoke ---- */
  const dialTex = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const cx = 60 + i * 78, cy = 80, r = 32; g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(cx, cy, r + 4, 0, 7); g.fill();
      g.strokeStyle = '#d8d4c8'; g.lineWidth = 2; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
      g.strokeStyle = i === 5 ? '#f0a020' : '#f4f0e4'; g.lineWidth = 3; const a = -0.8 + i * 0.9; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); g.stroke();
    }
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.31), new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.6 }));
  panel.rotation.y = -Math.PI / 2; panel.position.set(1.62, y0 + 0.76, 0); group.add(panel);
  const yoke = new THREE.Mesh(mergeGeos([rod(new V(1.62, y0 + 0.66, -0.27), new V(1.25, y0 + 0.66, -0.27), 0.02, 0.02, 6), rod(new V(1.25, y0 + 0.66, -0.45), new V(1.25, y0 + 0.66, -0.09), 0.018, 0.018, 6)], ['position', 'normal']), new THREE.MeshStandardMaterial({ color: col(C.dark), roughness: 0.5 }));
  group.add(yoke);

  /* ---- the propeller: spinner, two blades with yellow tips, a faint disc at speed ---- */
  const P = PL.prop, prop = new THREE.Group(); prop.position.set(P.x, P.y, 0); group.add(prop);
  { const sp = new THREE.ConeGeometry(0.17, 0.36, 14); sp.rotateZ(-Math.PI / 2); sp.translate(0.12, 0, 0);
    const blades = [tint(sp, C.red)];
    for (const s of [-1, 1]) { const b = new THREE.BoxGeometry(0.035, P.r - 0.08, 0.13); b.translate(0, s * (P.r / 2 + 0.04), 0); b.rotateY(s * 0.25); blades.push(tint(b, (x, y) => Math.abs(y) > P.r - 0.16 ? 0xe8c020 : C.dark)); }
    prop.add(new THREE.Mesh(mergeGeos(blades, ['position', 'normal', 'color']), mat)); }
  const discMat = new THREE.MeshBasicMaterial({ color: 0x303234, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(P.r, 32).rotateY(Math.PI / 2), discMat); disc.position.set(P.x + 0.02, P.y, 0); disc.visible = false; group.add(disc);
  let spin = 0;
  /** Engine speed 0 (off) .. 1 (full): turns the propeller, fades in its disc. */
  function engine(k, dt) {
    spin += dt * (k > 0 ? 6 + 60 * k : 0); prop.rotation.x = spin;
    discMat.opacity = 0.16 * clamp((k - 0.25) / 0.5); disc.visible = discMat.opacity > 0.01;
  }

  /* ---- mooring lines from the floats' ends to the bollards ---- */
  const lineMat = new THREE.MeshStandardMaterial({ color: lin(0xd9cfb4), roughness: 0.9, metalness: 0 });
  const lines = new THREE.Group(); scene.add(lines);
  const cleats = s => [new V(F.x1 - 0.5, F.top, s * F.z), new V(F.x0 + 0.4, F.top, s * F.z)];
  function mooringLines(on, berth) {
    lines.visible = on; if (!on) return;
    lines.clear(); group.updateMatrixWorld();
    const [aft, fore] = berth.bollards.map(([x, z]) => new V(x, berth.deckY + 0.42, z));
    const side = berth.side || 1, [cf, ca] = cleats(side);
    for (const [cl, bo] of [[cf, fore], [ca, aft]]) {
      const a = cl.clone().applyMatrix4(group.matrixWorld), pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10, p = a.clone().lerp(bo, t); p.y -= Math.sin(Math.PI * t) * 0.18; pts.push(p); }
      lines.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 5), lineMat));
    }
  }

  main.castShadow = main.receiveShadow = true; prop.children[0].castShadow = true;
  /** Place the plane: the frame's origin at (x, y, z) (y: seaY() on the water), heading h (the nose along (cos h, sin h) in x, z), bank (+ right wing down), pitch (+ nose up). */
  function setPose(x, y, z, h, bank = 0, pitch = 0) { group.position.set(x, y, z); group.rotation.set(bank, -h, pitch); }
  setPose(0, seaY(), 0, 0);
  return { group, prop, engine, setPose, mooringLines, look: PL };
}
