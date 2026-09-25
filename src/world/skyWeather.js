import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { HOUSE, CB } from './layout.js';

/**
 * The weather over the island (#31 rain and storms, #32 fog days, #33 rainbow, #35 northern lights). It follows the
 * running day clock (in-game hours):
 *  - clear, rain or storm: each in-game hour of clear weather may turn to rain (a chance per season,
 *    CONFIG.weather.rain); rain lasts a few hours; some of it is a thunderstorm (more in summer, none in winter). The
 *    sky greys (timeOfDay.setOvercast), the fog thickens, streaks fall (world/weather.js; in winter the snow thickens
 *    instead), the rain is heard (on the roof, from inside the cabin), and a fire burning in the open goes out (the
 *    firepits; the fireplace and the lamps are under cover). In a storm lightning flashes now and then and thunder
 *    rolls a moment later.
 *  - fog mornings: some days (mostly in autumn) a thick fog from dawn until mid-morning.
 *  - a rainbow: when rain stops by day, often a rainbow stands in the sky opposite the sun for a while.
 *  - northern lights: on many clear winter nights, green and violet curtains over the northern sky.
 * Everything blends in and out smoothly; a jump of the clock (sleeping, the slider) starts afresh. The panel's
 * Weather picker forces a kind (for checking). Every number is in CONFIG.weather.
 */
export function createSkyWeather({ scene, camera, clock, seasons, tod, atmosphere, weather, fires, ambience, sun }) {
  const WC = CONFIG.weather, rr = (a, b) => a + (b - a) * Math.random();
  let kind = 'clear', left = rr(...WC.clearHold), rainK = 0, stormK = 0, fogK = 0, fogDay = false, forced = null, prevH = clock.hours;
  let bowK = 0, bowLeft = 0, auroraNight = false, auroraK = 0, flashIn = rr(...WC.flashEvery), fogDecided = false, auroraDecided = false, wasWet = false;

  /* ---- lightning: a white flash over the screen and a brighter sky, then thunder ---- */
  const flash = document.createElement('div'); flash.id = 'flash'; document.body.appendChild(flash);
  let flashT = 0;

  /* ---- the rainbow: a ring of the spectrum opposite the sun, standing on the horizon ---- */
  const bowMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK; varying vec2 vUv;
      vec3 spec(float x){ return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0); }
      void main(){ float r = vUv.y; float band = smoothstep(0.0, 0.25, r) * (1.0 - smoothstep(0.75, 1.0, r));
        vec3 c = spec(0.85 * (1.0 - r)); float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        gl_FragColor = vec4(c * band * ends * uK * 0.28, 1.0); }`,
  });
  const bowGeo = new THREE.RingGeometry(0.9, 1, 96, 1, 0, Math.PI);   // uv.y from the inner to the outer edge after the fix below
  { const p = bowGeo.attributes.position, u = bowGeo.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x); u.setXY(i, a / Math.PI, (r - 0.9) / 0.1); } }
  const bow = new THREE.Mesh(bowGeo, bowMat); bow.visible = false; bow.frustumCulled = false; bow.renderOrder = -1; scene.add(bow);

  /* ---- the northern lights: curtains on a band of the northern sky ---- */
  const auroraMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform float uK; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); } float n(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h(i), h(i + 1.0), f); }
      void main(){
        float x = vUv.x * 9.0, t = uT * 0.05;
        float fold = n(x * 1.3 + t) * 0.6 + n(x * 3.1 - t * 1.7) * 0.4;                        // the curtain's folds drift
        float rays = 0.55 + 0.45 * n(x * 38.0 + t * 6.0 + fold * 4.0);                           // fine vertical rays
        float base = 0.18 + 0.2 * fold, y = vUv.y;
        float body = smoothstep(base - 0.05, base + 0.06, y) * (1.0 - smoothstep(base + 0.25, base + 0.75, y));
        vec3 col = mix(vec3(0.15, 1.0, 0.45), vec3(0.55, 0.25, 0.9), smoothstep(base + 0.2, base + 0.65, y));
        float ends = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
        gl_FragColor = vec4(col * body * rays * ends * uK * 0.55, 1.0);
      }`,
  });
  const auroraGeo = new THREE.CylinderGeometry(WC.aurora.radius, WC.aurora.radius, WC.aurora.height, 64, 1, true, Math.PI - WC.aurora.arc / 2, WC.aurora.arc);
  const aurora = new THREE.Mesh(auroraGeo, auroraMat); aurora.visible = false; aurora.frustumCulled = false; aurora.renderOrder = -1; scene.add(aurora);

  /* ---- sound: rain (on the roof from inside) and thunder, through the ambience's master volume ---- */
  let rainSrc = null, rainG = null, rainLP = null;
  function rainSound(k, inside) {
    const A = ambience && ambience.audio; if (!A) return;
    const { ac, out } = A;
    if (!rainSrc) {
      const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random());
      rainSrc = ac.createBufferSource(); rainSrc.buffer = b; rainSrc.loop = true; rainLP = ac.createBiquadFilter(); rainLP.type = 'lowpass'; rainG = ac.createGain(); rainG.gain.value = 0;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400; rainSrc.connect(hp); hp.connect(rainLP); rainLP.connect(rainG); rainG.connect(out); rainSrc.start();
    }
    rainG.gain.setTargetAtTime(k * WC.rainLevel * (inside ? 0.7 : 1), ac.currentTime, 0.5);
    rainLP.frequency.setTargetAtTime(inside ? 900 : 5200, ac.currentTime, 0.3);
  }
  function thunder(delay, big) {
    const A = ambience && ambience.audio; if (!A) return;
    const { ac, out } = A, t = ac.currentTime + delay, len = rr(2.5, 5);
    const b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(big ? 900 : 400, t); lp.frequency.exponentialRampToValueAtTime(90, t + len);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(WC.thunderLevel * (big ? 1 : 0.6), t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(lp); lp.connect(g); g.connect(out); s.start(t); s.stop(t + len + 0.1);
  }

  /* ---- the panel's picker ---- */
  const sel = document.getElementById('weatherSel');
  if (sel) sel.addEventListener('change', () => { forced = sel.value === 'auto' ? null : sel.value; if (forced === 'clear') { kind = 'clear'; forced = null; left = rr(...WC.clearHold); rainK = 0; } if (forced === 'fog') fogDay = true; if (!forced) { kind = 'clear'; left = rr(...WC.clearHold); } });

  const inCabin = p => Math.abs(p.x - HOUSE.x) < CB.XW && Math.abs(p.z - HOUSE.z) < CB.ZW;
  const toward = (x, target, dt, rate) => x + Math.sign(target - x) * Math.min(Math.abs(target - x), dt * rate);
  let overSet = -1;
  function hourly(season) {   // a new in-game hour of weather
    if (kind === 'clear') {
      if (Math.random() < WC.rain[season]) { kind = Math.random() < WC.storm[season] ? 'storm' : 'rain'; left = rr(...WC.rainHours); }
      else left = 1;
    } else if ((left -= 1) <= 0) { kind = 'clear'; left = rr(...WC.clearHold); }
  }
  return {
    get state() { return { kind: forced || kind, rain: rainK, storm: stormK, fog: fogK, rainbow: bowK, aurora: auroraK }; },
    update(dt) {
      const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24, season = seasons ? seasons.season : 'summer';
      prevH = h;
      if (d > 3) { kind = 'clear'; left = rr(...WC.clearHold); rainK = stormK = 0; }   // a jump of the clock: start afresh
      else if (d > 0 && !forced) { let hrs = d; while (hrs > 0) { const step = Math.min(hrs, left); left -= step; hrs -= step; if (left <= 1e-6) hourly(season); } }
      const now = forced || kind, gameRate = d > 0 && d < 3 ? d / Math.max(dt, 1e-4) : 0;   // in-game hours per real second
      // the day's fog: decided at dawn
      if (h >= 4 && h < 12 && !fogDecided) { fogDecided = true; fogDay = Math.random() < WC.fogChance[season]; }   // decided each dawn
      if (h < 4) fogDecided = false;
      const fogWant = forced === 'fog' ? 1 : fogDay ? smoothstepH(h, 4.5, 6) * (1 - smoothstepH(h, 9.5, 10.8)) : 0;
      const wetWant = now === 'rain' ? 0.6 : now === 'storm' ? 1 : 0;
      rainK = toward(rainK, wetWant, dt, 0.06 + gameRate * 1.5); stormK = toward(stormK, now === 'storm' ? 1 : 0, dt, 0.06 + gameRate * 1.5); fogK = toward(fogK, fogWant, dt, 0.08 + gameRate * 1.2);
      // the sky, fog, streaks, sound
      const over = Math.min(1, rainK * 0.85 + stormK * 0.15 + fogK * 0.35);
      if (Math.abs(over - overSet) > 0.015 || (over === 0 && overSet !== 0)) { overSet = over; tod.setOvercast(over); }
      atmosphere.setFog(1 + fogK * (WC.fogThick - 1) + rainK * 1.2);
      weather.setRain(rainK);
      rainSound(season === 'winter' ? 0 : rainK, inCabin(camera.position));
      if (rainK > 0.45 && season !== 'winter') fires.douse('pit-');   // the firepits are out in the open
      // lightning
      if (stormK > 0.6) { if ((flashIn -= dt) <= 0) { flashIn = rr(...WC.flashEvery); flashT = 0.35; thunder(rr(0.6, 3.5), Math.random() < 0.4); } }
      if (flashT > 0) { flashT -= dt; const k = Math.max(0, flashT / 0.35); flash.style.opacity = (k * k * 0.55 * (0.6 + 0.4 * Math.sin(flashT * 90))).toFixed(3); } else if (flash.style.opacity !== '0') flash.style.opacity = '0';
      // the rainbow: after rain, by day, with the sun up
      const [rise, set] = CONFIG.seasons.sun[season], sunUp = h > rise + 0.7 && h < set - 0.7;
      if (rainK < 0.08 && wasWet) { wasWet = false; if (sunUp && Math.random() < WC.rainbowChance) bowLeft = rr(...WC.rainbowHours); }
      if (rainK > 0.3) wasWet = true;
      if (bowLeft > 0 && d < 3) bowLeft -= d;
      bowK = toward(bowK, forced === 'rainbow' || (bowLeft > 0 && sunUp && rainK < 0.2) ? 1 : 0, dt, 0.15);
      bow.visible = bowK > 0.01;
      if (bow.visible) {   // opposite the sun, round the camera, its centre below the horizon
        const sd = sun ? sun.userData.dir : new THREE.Vector3(1, 0.3, 0), ax = -sd.x, az = -sd.z, l = Math.hypot(ax, az) || 1, R = WC.rainbowRadius;
        bow.position.set(camera.position.x + ax / l * R * 1.1, camera.position.y - R * 0.35, camera.position.z + az / l * R * 1.1);
        bow.scale.setScalar(R); bow.lookAt(camera.position.x, bow.position.y, camera.position.z); bowMat.uniforms.uK.value = bowK;
      }
      // the northern lights: some clear winter nights
      if (h > 16 && h < 20 && !auroraDecided) { auroraDecided = true; auroraNight = season === 'winter' && Math.random() < WC.aurora.chance; }   // decided each dusk
      if (h > 8 && h < 16) auroraDecided = false;
      const dark = h > set + 1.2 || h < rise - 1.2;
      auroraK = toward(auroraK, (auroraNight || forced === 'aurora') && dark && rainK < 0.1 && (season === 'winter' || forced === 'aurora') ? 1 : 0, dt, 0.1);
      aurora.visible = auroraK > 0.01;
      if (aurora.visible) { aurora.position.set(camera.position.x, camera.position.y + WC.aurora.y, camera.position.z); auroraMat.uniforms.uT.value += dt; auroraMat.uniforms.uK.value = auroraK; }
    },
  };
}
const smoothstepH = (h, a, b) => { const t = Math.min(1, Math.max(0, (h - a) / (b - a))); return t * t * (3 - 2 * t); };
