import * as THREE from 'three';
import { V, clamp } from '../core/math.js';
import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';

/**
 * Procedural sky dome: gradient, sun disc, drifting fBm clouds, stars and moon at night.
 * Also renders a copy into a PMREM environment map (rebuildEnv) for image-based lighting.
 */
export function createSky(ctx) {
  const { scene, renderer } = ctx;
  const skyUniforms = {
    uSunDir: { value: new V(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uTime: U.uTime, uDisc: { value: 1 }, uNight: { value: 0 }, uMoonDir: { value: new V(-0.35, 0.72, 0.6).normalize() }
  };
  const skyVS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const skyFS = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uTime; uniform float uDisc; uniform float uNight; uniform vec3 uMoonDir;
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
  varying vec3 vDir;
  float hsh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float nz(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*nz(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.42));
    if(h < 0.0) col = mix(uHorizon, uHorizon*vec3(0.55,0.66,0.78), pow(clamp(-h,0.0,1.0),0.45));
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(sd, 5.0)*0.16 + pow(sd, 60.0)*0.5);
    if(uNight > 0.01 && h > 0.0){
      vec3 q = d*230.0; vec3 cl = floor(q); float r = h3(cl);
      float stv = step(0.9962, r) * smoothstep(0.42, 0.0, length(fract(q)-0.5));
      col += vec3(0.85,0.9,1.0) * stv * (0.55+0.45*sin(uTime*2.0 + r*90.0)) * uNight * 2.4 * smoothstep(0.02, 0.2, h);
      float md = dot(d, uMoonDir);
      col += vec3(0.95,0.96,1.0) * smoothstep(0.99905, 0.99935, md) * uNight * 2.5 + vec3(0.25,0.3,0.45)*pow(max(md,0.0), 40.0)*uNight*0.25;
    }
    if(h > 0.0){
      vec2 uv = d.xz/(h+0.1)*0.85 + vec2(uTime*0.006, uTime*0.0025);
      float c = fbm(uv*1.25);
      float cov = smoothstep(0.5, 0.78, c) * smoothstep(0.015, 0.22, h);
      vec3 cc = mix(uHorizon, vec3(1.0), 0.55) * (0.72 + 0.28*uSunCol) + uSunCol*pow(sd,4.0)*0.55;
      cc *= 0.82 + 0.3*smoothstep(0.5, 0.9, c);
      col = mix(col, cc, cov*0.8);
    }
    col += uSunCol * smoothstep(0.99935, 0.99965, sd) * 14.0 * uDisc;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  const envSkyMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, skyUniforms, { uDisc: { value: 0.25 } }), vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false });
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envSkyMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function rebuildEnv() { const rt = pmrem.fromScene(envScene, 0.03, 0.1, 200); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture; }
  return { sky, skyUniforms, rebuildEnv };
}
