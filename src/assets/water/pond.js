import * as THREE from 'three';
import { U } from '../../core/uniforms.js';
import { WATER_Y, LAKE, H, lakeD, streamDist } from '../../world/layout.js';

/**
 * Pond surface: MeshStandardMaterial with procedural wave normals, depth tint, shoreline foam.
 */
export function createPond(ctx) {
  const { scene } = ctx;
  let water;
  {
    const S = 5.4, SEG = 90;
    const g = new THREE.PlaneGeometry(S, S, SEG, SEG); g.rotateX(-Math.PI / 2); g.translate(LAKE.x, WATER_Y, LAKE.z);
    const p = g.attributes.position, dep = new Float32Array(p.count), keep = new Float32Array(p.count);
    const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); dep[i] = WATER_Y - H(x, z);
      keep[i] = 1 - smooth(0.9, 1.05, lakeD(x, z)) * (1 - smooth(0.3, 1.0, streamDist(x, z)));   // hands over to the stream in its channel
    }
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1)); g.setAttribute('aKeep', new THREE.BufferAttribute(keep, 1));
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, envMapIntensity: 1.25 });
    m.onBeforeCompile = s => {
      s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind;
      s.vertexShader = 'attribute float aDepth; attribute float aKeep; varying float vDepth; varying float vKeep; varying vec3 vWP;\n' +
        s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDepth = aDepth; vKeep = aKeep; vWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
      s.fragmentShader = `varying float vDepth; varying float vKeep; varying vec3 vWP; uniform float uTime; uniform float uWind;
        vec2 wv(vec2 p, float t, vec2 d, float f, float sp, float a){ return d * (a*f*cos(dot(d,p)*f + t*sp)); }
        vec2 waveGrad(vec2 p, float t){
          vec2 g = vec2(0.0);
          g += wv(p,t, normalize(vec2(0.8,0.6)), 7.0, 1.6, 0.0045);
          g += wv(p,t, normalize(vec2(-0.3,0.95)), 11.0, 2.1, 0.0028);
          g += wv(p,t, normalize(vec2(0.95,-0.2)), 17.0, 2.9, 0.0016);
          g += wv(p,t, normalize(vec2(-0.7,-0.7)), 29.0, 3.7, 0.0009);
          g += wv(p,t, normalize(vec2(0.2,-0.98)), 43.0, 4.6, 0.0005);
          return g * (0.22 + uWind*0.65);
        }
        ` + s.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float sh = smoothstep(0.0, 0.32, vDepth);
          diffuseColor.rgb = mix(vec3(0.16,0.17,0.08), vec3(0.018,0.06,0.058), sh);
          float foam = (1.0 - smoothstep(0.0, 0.035, vDepth)) * (0.55 + 0.45*sin(vWP.x*18.0 + vWP.z*13.0 + uTime*1.5));
          diffuseColor.rgb += vec3(0.28,0.3,0.26) * foam * 0.5;
          diffuseColor.a = smoothstep(-0.005, 0.03, vDepth) * mix(0.42, 0.93, sh) * vKeep;`)
        .replace('#include <normal_fragment_maps>', `
          vec2 wg = waveGrad(vWP.xz, uTime);
          vec3 nW = normalize(vec3(-wg.x, 1.0, -wg.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
    };
    water = new THREE.Mesh(g, m); water.receiveShadow = true; water.renderOrder = 2; scene.add(water);
  }
  return water;
}

/**
 * The sea around the island: one opaque plane at CONFIG.island.seaLevel that follows the camera (waves are in
 * world space, so it never slides). Colour comes from the water depth, read from the world ground texture
 * (height in .r): sandy turquoise in the shallows, dark teal offshore (the shore foam comes from waterLife.js). Distance fog
 * fades it into the sky's horizon colour.
 */
export function createOcean(ctx, ground, seaY) {
  const { scene } = ctx;
  const g = new THREE.PlaneGeometry(320, 320, 1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, envMapIntensity: 1.1 });
  m.onBeforeCompile = s => {
    s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uGround = { value: ground.tex };
    s.uniforms.uGroundST = { value: new THREE.Vector2(ground.scale, ground.offset) }; s.uniforms.uSea = { value: seaY };
    s.vertexShader = 'varying vec3 vWP;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = `varying vec3 vWP; uniform float uTime; uniform float uWind; uniform sampler2D uGround; uniform vec2 uGroundST; uniform float uSea;
      vec2 wv(vec2 p, float t, vec2 d, float f, float sp, float a){ return d * (a*f*cos(dot(d,p)*f + t*sp)); }
      vec2 seaGrad(vec2 p, float t){
        vec2 g = vec2(0.0);
        g += wv(p,t, normalize(vec2(0.8,0.6)), 0.9, 0.9, 0.05);
        g += wv(p,t, normalize(vec2(-0.3,0.95)), 1.7, 1.3, 0.022);
        g += wv(p,t, normalize(vec2(0.95,-0.2)), 3.1, 1.9, 0.009);
        g += wv(p,t, normalize(vec2(-0.7,-0.7)), 6.3, 2.6, 0.004);
        g += wv(p,t, normalize(vec2(0.2,-0.98)), 11.0, 3.4, 0.0022);
        return g * (0.35 + uWind*0.65);
      }
      ` + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float depth = uSea - texture2D(uGround, (vWP.xz + uGroundST.y) * uGroundST.x).r;
        vec3 shallow = vec3(0.16, 0.34, 0.30), deep = vec3(0.012, 0.055, 0.07);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 2.8, depth));
        /* shore-foam */   // assets/water/waterLife.js adds the shore foam here (depth, vWP and uTime are in scope)`)
      .replace('#include <normal_fragment_maps>', `
        vec2 wg = seaGrad(vWP.xz, uTime);
        normal = normalize((viewMatrix * vec4(normalize(vec3(-wg.x, 1.0, -wg.y)), 0.0)).xyz);`);
  };
  const sea = new THREE.Mesh(g, m); sea.position.y = seaY; sea.receiveShadow = true; sea.frustumCulled = false; scene.add(sea);
  return { sea, update(cam) { sea.position.x = cam.x; sea.position.z = cam.z; } };
}
