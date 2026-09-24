import * as THREE from 'three';
import { isTouch } from '../core/env.js';
import { clamp, smooth, lin } from '../core/math.js';
import { fbm2, hash2 } from '../core/noise.js';
import { U } from '../core/uniforms.js';
import { canvasTex } from '../core/canvasTexture.js';
import { CONFIG } from '../config.js';
import { WATER_Y, HALF, houseRectDist, ROCK, ROSE, CON, H, coreDist, forest, coastDist, SEA_Y, streamDist } from './layout.js';

const gA = lin(0x33501b), gB = lin(0x4f6d27), needles = lin(0x4d3c28), shore = lin(0x6b5d43), mud = lin(0x57492f), deep = lin(0x2a2a1c), dry = lin(0x6d7a34);
const cabinDirt = lin(0x4a3d2a), rockMoss = lin(0x3a4a20), rockSoil = lin(0x51483a), roseSoil = lin(0x3b2a1c);
/** Painted ground colour of the diorama plot at (x, z) with height h (grass, shore, mud, dirt by the cabin, moss by the rocks). */
export function groundColor(c, x, z, h) {
  const n = fbm2(x * 0.6 + 11, z * 0.6 - 3);
  c.copy(gA).lerp(gB, clamp(n * 0.9 + 0.5)).lerp(dry, clamp(fbm2(x * 0.35 - 7, z * 0.35 + 2) * 1.2) * 0.35);
  const dc = Math.hypot(x - CON.x, z - CON.z); c.lerp(needles, (1 - smooth(0.5, 2.1, dc)) * 0.8);
  c.lerp(cabinDirt, (1 - smooth(0.0, 0.45, houseRectDist(x, z) + 0.08 * fbm2(x * 5, z * 5, 2))) * 0.75);
  { const rdx = (x - ROCK.x) / 1.35, rdz = (z - ROCK.z) / 1.1, rd = Math.sqrt(rdx * rdx + rdz * rdz); c.lerp(rockMoss.clone().lerp(rockSoil, clamp(fbm2(x * 6, z * 6, 2) + 0.5)), (1 - smooth(0.6, 1.0, rd + 0.1 * fbm2(x * 4, z * 4, 2))) * 0.8); }
  c.lerp(roseSoil, (1 - smooth(0.12, 0.42, Math.hypot(x - ROSE.x, z - ROSE.z) + 0.06 * fbm2(x * 8, z * 8, 2))) * 0.85);
  const above = h - WATER_Y;
  c.lerp(shore, (1 - smooth(0.012, 0.07, above + 0.015 * fbm2(x * 4, z * 4, 2))));
  if (above < 0) c.copy(mud).lerp(deep, clamp(-above / 0.45));
  return c;
}

/**
 * Ground mesh sampled from H(x, z) with painted vertex colours (grass, shore, mud, dirt near the cabin, moss by the rocks)
 * and animated underwater caustics.
 */
export function createTerrain(ctx) {
  const { scene } = ctx;
  const { detailTex } = ctx.tex;
  {
    const SEG = isTouch ? 160 : 220;
    const g = new THREE.PlaneGeometry(10, 10, SEG, SEG); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = H(x, z); p.setY(i, h);
      groundColor(c, x, z, h);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex, roughness: 0.95, metalness: 0, envMapIntensity: 0.6 });
    m.onBeforeCompile = s => {
      s.uniforms.uTime = U.uTime; s.uniforms.uWater = U.uWater; s.uniforms.uSunCol = U.uSunCol; s.uniforms.uSunI = U.uSunI;
      s.vertexShader = 'varying vec3 vWP;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      s.fragmentShader = 'varying vec3 vWP; uniform float uTime; uniform float uWater; uniform vec3 uSunCol; uniform float uSunI;\n' +
        s.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.directSpecular *= 0.2; reflectedLight.indirectSpecular *= 0.2;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float uwm = smoothstep(0.0, 0.04, uWater - vWP.y);
        if(uwm > 0.0){
          vec2 q = vWP.xz*4.2; float t = uTime*0.9; float cc = 0.0;
          for(int i=0;i<3;i++){ float fi=float(i); q += vec2(sin(q.y*0.9 + t + fi), cos(q.x*0.8 - t*0.7 + fi*1.3))*0.55; cc += 0.035/(0.08 + abs(sin(q.x)*sin(q.y))*6.0); }
          cc = pow(clamp(cc,0.0,1.2), 2.0);
          float fade = 1.0 - 0.7*smoothstep(0.08, 0.5, uWater - vWP.y);
          totalEmissiveRadiance += uSunCol * uSunI * cc * uwm * fade * 0.09;
        }`);
    };
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
  }
}

/** Grey value-noise detail texture (linear, tiling) used for the world's dirt and rock layers. */
function noiseTex(size, fn) {
  return canvasTex(size, size, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.round(255 * clamp(fn(x, y, w))), i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, false);
}
// tileable value noise: wrap the lattice at `per` cells
function tnoise(x, y, per) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const hh = (a, b) => hash2(((a % per) + per) % per, ((b % per) + per) % per); const a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), d = hh(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

/**
 * The 100 x 100 m island terrain: one heightmap mesh (CONFIG.terrain.segments per side); beyond the coast it
 * drops to the sea floor under the opaque ocean. Under the authored plot the mesh is cut out /
 * tucked just below the diorama's own finer ground mesh; along the seam it samples exactly the same H and colour.
 * One shader blends grass (painted vertex colour x the diorama detail texture), dirt/forest floor and rock by
 * slope and a soil mask (forest floor, bare patches), plus sand on the beaches.
 */
export function createWorldTerrain(ctx) {
  const { scene, maxAniso } = ctx;
  const { detailTex } = ctx.tex;
  const TC = CONFIG.terrain, WC = CONFIG.world;
  const pos = [], nor = [], uv = [], col = [], soil = [], streamV = [], idx = [];
  const c = new THREE.Color(), cw = new THREE.Color(), dryW = lin(0x6d7a34);
  const e = 0.25; // finite-difference step for normals
  function vertex(x, z, sink) {
    const h = H(x, z);
    pos.push(x, h - sink, z);
    const nx = H(x - e, z) - H(x + e, z), nz = H(x, z - e) - H(x, z + e), l = Math.hypot(nx, 2 * e, nz);
    nor.push(nx / l, 2 * e / l, nz / l);
    uv.push((x + HALF) / (2 * HALF), (HALF - z) / (2 * HALF)); // same mapping as the diorama ground, so the detail texture lines up
    // grass colour: the diorama paint near the plot, blending into the open-meadow palette further out
    const w = smooth(0, WC.coreBlend, coreDist(x, z));
    groundColor(c, x, z, h);
    if (w > 0) { cw.copy(gA).lerp(gB, clamp(fbm2(x * 0.6 + 11, z * 0.6 - 3) * 0.9 + 0.5)).lerp(dryW, clamp(fbm2(x * 0.11 - 7, z * 0.11 + 2) * 1.6 + 0.2) * 0.45); c.lerp(cw, w); }
    col.push(c.r, c.g, c.b);
    // soil mask: forest floor under the spruces, the path, bare patches; 0 on the plot
    // the stream: its bed and wet edges are soil; its valley (aStream) is kept out of the beach sand
    const sd = streamDist(x, z), bed = 1 - smooth(-0.1, 0.7 + 0.4 * fbm2(x * 0.8, z * 0.8, 2), sd), valley = (1 - smooth(1.5, 3.2, sd)) * smooth(CONFIG.island.beachWidth - 3, CONFIG.island.beachWidth + 1, coastDist(x, z));   // not on the beach itself
    soil.push(Math.max(w * smooth(CONFIG.island.beachWidth, CONFIG.island.beachWidth + 4, coastDist(x, z)) * clamp(forest(x, z) * 0.95 + smooth(0.2, 0.45, fbm2(x * 0.09 + 40, z * 0.09 - 13, 3)) * 0.5), bed));
    streamV.push(valley);
  }
  function grid(size, seg, keepCell, sinkAt) {
    const base = pos.length / 3, st = size / seg, h0 = -size / 2;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) { const x = h0 + i * st, z = h0 + j * st; vertex(x, z, sinkAt(x, z)); }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      if (!keepCell(h0 + i * st, h0 + j * st, st)) continue;
      const a = base + j * (seg + 1) + i, b = a + 1, cc = a + seg + 1, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const ins = (x, z, m) => Math.abs(x) < m && Math.abs(z) < m;
  // main mesh: cells completely under the diorama ground are dropped, the ring next to its edge is tucked below it
  grid(WC.size, TC.segments, (x, z, st) => !(ins(x, z, HALF - 0.5) && ins(x + st, z + st, HALF - 0.5)), (x, z) => (ins(x, z, HALF - 1e-6) ? 0.12 : 0));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSoil', new THREE.Float32BufferAttribute(soil, 1)); g.setAttribute('aStream', new THREE.Float32BufferAttribute(streamV, 1)); g.setIndex(idx);
  g.computeBoundingSphere();

  const dirtTex = noiseTex(256, (x, y) => { const n = 0.55 * tnoise(x / 16, y / 16, 16) + 0.3 * tnoise(x / 5, y / 5, 51.2) + 0.15 * tnoise(x / 1.7, y / 1.7, 150.6); return (0.35 + 0.8 * n) * (hash2(x, y) > 0.93 ? 0.7 : 1); });
  const rockTex = noiseTex(256, (x, y) => { const n = 0.5 * tnoise(x / 22, y / 22, 11.636) + 0.3 * tnoise(x / 7, y / 7, 36.57) + 0.2 * tnoise(x / 2.3, y / 2.3, 111.3); const crack = Math.abs(tnoise(x / 11, y / 5, 23.27) - 0.5) < 0.025 ? 0.55 : 1; return (0.3 + 0.85 * n) * crack; });
  [dirtTex, rockTex].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; });
  const uni = {
    uDirtTex: { value: dirtTex }, uRockTex: { value: rockTex },
    uDirtCol: { value: lin(0x4d3c28) }, uRockCol: { value: lin(0x77736a) },
    uRockSlope: { value: 1 - TC.rockSlope },
    uSea: { value: SEA_Y }, uSand: { value: lin(0xb9a57c) }, uWetSand: { value: lin(0x6f6147) },
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex, roughness: 0.95, metalness: 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, uni);
    s.vertexShader = 'attribute float aSoil; attribute float aStream; varying float vSoil; varying float vStream; varying vec3 vWP; varying vec3 vNW;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vNW = normal; vSoil = aSoil; vStream = aStream;');
    s.fragmentShader = 'uniform sampler2D uDirtTex; uniform sampler2D uRockTex; uniform vec3 uDirtCol; uniform vec3 uRockCol; uniform float uRockSlope; uniform float uSea; uniform vec3 uSand; uniform vec3 uWetSand; varying float vSoil; varying float vStream; varying vec3 vWP; varying vec3 vNW;\n' +
      s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 nW = normalize(vNW);
        float big = texture2D(uDirtTex, vWP.xz * 0.021).r;
        float streamBed = vStream;
        float soilW = clamp(vSoil * (0.75 + 0.6 * big) - 0.08, 0.0, 1.0);
        soilW = smoothstep(0.15, 0.75, soilW + (texture2D(uDirtTex, vWP.xz * 0.27).r - 0.5) * 0.35);
        vec3 dirt = uDirtCol * (0.55 + 0.6 * texture2D(uDirtTex, vWP.xz * 0.43).r);
        float slope = 1.0 - nW.y;
        vec2 side = abs(nW.x) > abs(nW.z) ? vWP.zy : vWP.xy;
        float rt = mix(texture2D(uRockTex, vWP.xz * 0.19).r, texture2D(uRockTex, side * 0.19).r, smoothstep(0.08, 0.35, slope));
        vec3 rock = uRockCol * (0.45 + 0.75 * rt);
        float rockW = smoothstep(uRockSlope - 0.05, uRockSlope + 0.05, slope + (big - 0.5) * 0.12);
        diffuseColor.rgb = mix(mix(diffuseColor.rgb, dirt, soilW), rock, rockW);
        // beach: dry sand above the waterline, darker wet sand at and below it
        float above = vWP.y - uSea + (big - 0.5) * 0.25;
        vec3 sand = mix(uWetSand, uSand, smoothstep(-0.05, 0.25, above)) * (0.8 + 0.35 * texture2D(uDirtTex, vWP.xz * 0.9).r);
        diffuseColor.rgb = mix(diffuseColor.rgb, sand, (1.0 - smoothstep(0.55, 0.95, above)) * (1.0 - streamBed));
        diffuseColor.rgb *= 1.0 - 0.3 * soilW * streamBed;             // wet bed`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.directSpecular *= 0.2; reflectedLight.indirectSpecular *= 0.2;');
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
  return { mesh };
}
