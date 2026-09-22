import * as THREE from 'three';
import { isTouch } from '../core/env.js';
import { clamp, smooth, lin } from '../core/math.js';
import { fbm2 } from '../core/noise.js';
import { U } from '../core/uniforms.js';
import { WATER_Y, houseRectDist, ROCK, ROSE, CON, H } from './layout.js';

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
    const gA = lin(0x33501b), gB = lin(0x4f6d27), needles = lin(0x4d3c28), shore = lin(0x6b5d43), mud = lin(0x57492f), deep = lin(0x2a2a1c), dry = lin(0x6d7a34);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = H(x, z); p.setY(i, h);
      const n = fbm2(x * 0.6 + 11, z * 0.6 - 3);
      c.copy(gA).lerp(gB, clamp(n * 0.9 + 0.5)).lerp(dry, clamp(fbm2(x * 0.35 - 7, z * 0.35 + 2) * 1.2) * 0.35);
      const dc = Math.hypot(x - CON.x, z - CON.z); c.lerp(needles, (1 - smooth(0.5, 2.1, dc)) * 0.8);
      c.lerp(lin(0x4a3d2a), (1 - smooth(0.0, 0.45, houseRectDist(x, z) + 0.08 * fbm2(x * 5, z * 5, 2))) * 0.75);
      { const rdx = (x - ROCK.x) / 1.35, rdz = (z - ROCK.z) / 1.1, rd = Math.sqrt(rdx * rdx + rdz * rdz); c.lerp(lin(0x3a4a20).lerp(lin(0x51483a), clamp(fbm2(x * 6, z * 6, 2) + 0.5)), (1 - smooth(0.6, 1.0, rd + 0.1 * fbm2(x * 4, z * 4, 2))) * 0.8); }
      c.lerp(lin(0x3b2a1c), (1 - smooth(0.12, 0.42, Math.hypot(x - ROSE.x, z - ROSE.z) + 0.06 * fbm2(x * 8, z * 8, 2))) * 0.85);
      const above = h - WATER_Y;
      c.lerp(shore, (1 - smooth(0.012, 0.07, above + 0.015 * fbm2(x * 4, z * 4, 2))));
      if (above < 0) c.copy(mud).lerp(deep, clamp(-above / 0.45));
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
