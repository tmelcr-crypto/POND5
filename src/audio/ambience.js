import { U } from '../core/uniforms.js';
import { coastDist, forest, houseRectDist, LAKE, lakeR, lakeD } from '../world/layout.js';

/**
 * Ambient sound, all synthesised with the Web Audio API (no audio files): wind with gusts, ocean swell, pond lapping,
 * fire crackle and rumble, birdsong by day, crickets at night, and a boat creak for when there is a boat. Each layer's
 * level comes from mixAt(): the player's position (distance to the shore, the pond, the fire; inside the cabin or
 * not) and the sky's night value (skyUniforms.uNight, the scene's time of day). Fire and pond are positioned in 3D;
 * the rest is plain stereo. Pond and fire only run while their detail-manager band is on. Every number is in AMB.
 * A layer can use a looping recording instead of the synthesis: put the file in audio/ and set the layer's `file`
 * (m4a or mp3, CC0 or CC-BY, listed in audio/CREDITS.md).
 */
export const AMB = {
  volume: 0.7,                    // default master volume (the settings panel changes and remembers it)
  update: 0.1,                    // seconds between mix updates (levels glide between them)
  lookahead: 0.4,                 // seconds of events (waves, crackles, bird phrases) scheduled ahead
  wind: { level: 0.4, gustPeriod: [7, 19], cutoff: [260, 1100], whistle: 0.14, shoreBoost: 0.35 },
  ocean: { level: 0.75, waveEvery: [6.5, 11], near: -4, far: 26, inland: 0.1, file: null },
  pond: { level: 1.5, range: [1, 13], lapEvery: [0.35, 1.3], plipEvery: [1.5, 5], band: 16, file: null },
  fire: { level: 1.3, range: [0.8, 7], outside: [2, 9], outsideLevel: 0.3, wallCutoff: 900, crackles: 9, band: 18 },
  birds: { level: 0.34, count: 6, pause: [1.5, 7], night: [0.2, 0.65], file: null },
  crickets: { level: 0.16, count: 5, pitch: [4200, 4900], night: [0.35, 0.8], file: null },
  boat: { level: 0.9, every: [1.2, 3.5], file: null },
  indoor: { cutoff: 1100, level: 0.45 },   // outdoor layers heard from inside the cabin
};
const rr = (a, b) => a + (b - a) * Math.random();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Levels of every layer (0..1 before each layer's own level) for a listener at p = { x, y, z }. night: sky night value
 * (0 day .. 1 night); wind: the wind setting (U.uWind); fire: { x, y, z } of the fireplace; onBoat: on the boat.
 */
export function mixAt(p, night, wind, fire, onBoat = false) {
  const A = AMB, c = coastDist(p.x, p.z), inside = houseRectDist(p.x, p.z) <= 0 && p.y < 4;
  const day = 1 - smooth(A.birds.night[0], A.birds.night[1], night), dark = smooth(A.crickets.night[0], A.crickets.night[1], night);
  const pondD = Math.max(0, (lakeD(p.x, p.z) - 1) * lakeR(Math.atan2(p.z - LAKE.z, p.x - LAKE.x)));
  const fireD = fire ? Math.hypot(p.x - fire.x, p.y - fire.y, p.z - fire.z) : Infinity;
  const land = smooth(-6, 4, c);                                  // 0 out at sea .. 1 on the island
  return {
    inside,
    wind: (0.25 + 0.55 * Math.min(1, wind)) * (1 + A.wind.shoreBoost * (1 - smooth(0, 20, c))) * (inside ? 0.5 : 1),
    windStrength: Math.min(1.4, wind),
    ocean: onBoat ? 1 : A.ocean.inland + (1 - A.ocean.inland) * (1 - smooth(A.ocean.near, A.ocean.far, c)),
    pond: 1 - smooth(A.pond.range[0], A.pond.range[1], pondD),
    fire: inside ? 1 - smooth(A.fire.range[0], A.fire.range[1], fireD) * 0.4 : A.fire.outsideLevel * (1 - smooth(A.fire.outside[0], A.fire.outside[1], fireD)),
    birds: day * land * (0.55 + 0.45 * forest(p.x, p.z)),
    crickets: dark * land * (0.6 + 0.4 * (1 - forest(p.x, p.z))),
    boat: onBoat ? 1 : 0,
  };
}

/**
 * The sound graph on any audio context (the live one, or an OfflineAudioContext for tests). Returns setMix(mix, t),
 * schedule(t0, t1) for timed events, setListener / setPond / setFire for the positioned layers, and the master gain.
 */
export function createAmbienceGraph(ac) {
  const A = AMB, sr = ac.sampleRate, OPEN = Math.min(20000, sr / 2 - 100);   // 'no filter' cutoff, below Nyquist
  const noise = (sec, brown) => {
    const n = Math.floor(sr * sec), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    const f = Math.floor(sr * 0.05); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }   // smooth loop seam
    return b;
  };
  const white = noise(4, false), brown = noise(6, true);
  const loop = (buf, rate = 1) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * buf.duration); return s; };
  const filt = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const glide = (param, v, t, tc = 0.25) => param.setTargetAtTime(v, t, tc);
  const panner = () => { const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 1e4; return p; };
  const setPos = (node, x, y, z, t) => { if (node.positionX) { node.positionX.setValueAtTime(x, t); node.positionY.setValueAtTime(y, t); node.positionZ.setValueAtTime(z, t); } else node.setPosition(x, y, z); };
  const stereo = v => { if (!ac.createStereoPanner) return gain(1); const p = ac.createStereoPanner(); p.pan.value = v; return p; };

  /* ---- buses: outdoor layers go through the "indoor" filter (walls) when the player is inside the cabin ---- */
  const master = gain(A.volume), comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  chain(master, comp, ac.destination);
  const indoorLP = filt('lowpass', OPEN), outdoor = gain(1); chain(outdoor, indoorLP, master);

  /* ---- wind: brown noise through a moving lowpass, plus a faint whistle band; gusts are slow random swells ---- */
  const windG = gain(0), windLP = filt('lowpass', 500), whistleG = gain(0), whistleBP = filt('bandpass', 900, 7);
  chain(loop(brown, 0.9), windLP, windG, outdoor); chain(loop(white, 1), whistleBP, whistleG, outdoor);
  const gusts = [0, 1, 2].map(() => ({ p: rr(...A.wind.gustPeriod), ph: rr(0, 6.28) }));
  const gustAt = t => 0.5 + 0.5 * gusts.reduce((s, g, i) => s + Math.sin(t * 6.283 / g.p + g.ph) * [0.5, 0.3, 0.2][i], 0);

  /* ---- ocean: a lowpassed body and a hiss, both shaped per wave (surge, break, wash) ---- */
  const oceanG = gain(0), bodyG = gain(0.3), hissG = gain(0.1);
  chain(loop(white, 1), filt('lowpass', 520), bodyG, oceanG); chain(loop(white, 0.97), filt('highpass', 1800), hissG, oceanG); oceanG.connect(outdoor);
  let nextWave = 0;

  /* ---- pond: lapping (bandpassed brown noise in small swells) and the odd droplet plip, from the nearest shore ---- */
  let pond = null, nextLap = 0, nextPlip = 0;
  function startPond() {
    if (pond) return;
    const pan = panner(), g = gain(0), env = gain(rec.pond ? 1 : 0.05), src = loop(rec.pond || brown, rec.pond ? 1 : 1.1);
    if (rec.pond) chain(src, env, g); else chain(src, filt('bandpass', 360, 1.0), env, g);
    chain(g, pan, outdoor);
    pond = { pan, g, env, src };
  }
  function stopPond() { if (!pond) return; pond.src.stop(); pond.pan.disconnect(); pond = null; }

  /* ---- fire: low rumble plus short noise crackles; muffled by the walls from outside ---- */
  let fire = null, nextCrackle = 0;
  function startFire() {
    if (fire) return;
    const pan = panner(), g = gain(0), wall = filt('lowpass', OPEN), rumble = gain(0.5), src = loop(brown, 0.8), bus = gain(1);
    chain(src, filt('lowpass', 150), rumble, bus); chain(bus, g, wall, pan, master);
    fire = { pan, g, wall, rumble, bus, src };
  }
  function stopFire() { if (!fire) return; fire.src.stop(); fire.pan.disconnect(); fire = null; }

  /* ---- birds: a few individuals of three simple song types, each at its own place in the stereo field ---- */
  const birdBus = gain(0); birdBus.connect(outdoor);
  const birds = Array.from({ length: A.birds.count }, (_, i) => {
    const input = gain(rr(0.35, 1)); chain(input, stereo(rr(-0.9, 0.9)), birdBus);   // own loudness (distance) and direction
    return { type: i % 3, pitch: rr(0.85, 1.2), in: input, next: rr(0, 4) };
  });
  function note(dest, t, dur, f0, f1, amp) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + Math.min(0.012, dur * 0.25)); g.gain.linearRampToValueAtTime(0, t + dur);
    chain(o, g, dest); o.start(t); o.stop(t + dur + 0.02);
  }
  function phrase(b, t) {
    const p = b.pitch; let d = 0;
    if (b.type === 0) {            // whistled phrase: a few gliding notes (thrush / blackbird-like)
      const n = 3 + Math.floor(rr(0, 4));
      for (let i = 0; i < n; i++) { const dur = rr(0.1, 0.28), f0 = rr(1700, 3100) * p; note(b.in, t + d, dur, f0, f0 * rr(0.75, 1.35), rr(0.35, 0.6)); d += dur + rr(0.04, 0.12); }
    } else if (b.type === 1) {     // chirps speeding up into a trill (finch / sparrow-like)
      const n = 5 + Math.floor(rr(0, 7)); let gap = rr(0.1, 0.14);
      for (let i = 0; i < n; i++) { const f0 = rr(4300, 5600) * p; note(b.in, t + d, rr(0.035, 0.06), f0, f0 * 0.62, rr(0.25, 0.4)); d += gap; gap = Math.max(0.05, gap * 0.9); }
    } else {                       // fast trill on one pitch (warbler-like)
      const n = 12 + Math.floor(rr(0, 14)), f = rr(3800, 5200) * p;
      for (let i = 0; i < n; i++) { note(b.in, t + d, 0.024, f * 1.04, f * 0.96, 0.22); d += rr(0.036, 0.044); }
    }
    return d;
  }

  /* ---- crickets: steady tones gated into chirps of three pulses ---- */
  const cricketBus = gain(0); cricketBus.connect(outdoor);
  let crickets = null;
  function startCrickets() {
    if (crickets) return;
    crickets = Array.from({ length: A.crickets.count }, () => {
      const o = ac.createOscillator(), g = gain(0), out = chain(g, gain(rr(0.4, 1)), stereo(rr(-0.8, 0.8)));
      o.frequency.value = rr(...A.crickets.pitch); chain(o, g); out.connect(cricketBus); o.start();
      return { o, g, period: rr(0.5, 0.85), next: ac.currentTime + rr(0, 1) };
    });
  }
  function stopCrickets() { if (!crickets) return; crickets.forEach(c => c.o.stop()); crickets = null; }

  /* ---- boat creak: rough, irregular low tone (stick-slip) through a resonant band ---- */
  const boatBus = gain(0); boatBus.connect(outdoor);
  let nextCreak = 0;
  function creak(t) {
    const o = ac.createOscillator(), bp = filt('bandpass', rr(500, 900), 5), g = gain(0), dur = rr(0.35, 0.9), n = 24, curve = new Float32Array(n);
    o.type = 'sawtooth'; for (let i = 0; i < n; i++) curve[i] = rr(55, 120) * (1 + 0.4 * Math.sin(i / n * Math.PI));
    o.frequency.setValueCurveAtTime(curve, t, dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
    chain(o, bp, g, boatBus); o.start(t); o.stop(t + dur + 0.05);
  }

  // recordings (AMB.<layer>.file): a looping buffer takes the place of that layer's synthesis
  const rec = {};
  function useRecording(name, buffer) {
    rec[name] = buffer;
    const bus = { ocean: oceanG, birds: birdBus, crickets: cricketBus, boat: boatBus }[name];
    if (bus) loop(buffer).connect(bus);
    if (name === 'ocean') { bodyG.gain.value = 0; hissG.gain.value = 0; bodyG.disconnect(); hissG.disconnect(); }
    if (name === 'crickets') stopCrickets();
    if (name === 'pond' && pond) { stopPond(); startPond(); }
  }

  let mix = null;
  return {
    master, useRecording,
    /** Glide every layer to the levels of `m` (from mixAt) starting at time t. */
    setMix(m, t) {
      mix = m;
      const w = m.windStrength, gst = gustAt(t);
      glide(windG.gain, A.wind.level * m.wind * (0.55 + 0.45 * gst), t, 0.4); glide(windLP.frequency, A.wind.cutoff[0] + (A.wind.cutoff[1] - A.wind.cutoff[0]) * gst * Math.min(1, 0.4 + w), t, 0.5);
      glide(whistleG.gain, A.wind.level * A.wind.whistle * m.wind * gst * gst * w, t, 0.5); glide(whistleBP.frequency, 650 + 600 * gst, t, 0.6);
      glide(oceanG.gain, A.ocean.level * m.ocean, t, 0.5);
      if (pond) glide(pond.g.gain, A.pond.level * m.pond, t, 0.3);
      if (fire) { glide(fire.g.gain, A.fire.level * m.fire, t, 0.3); glide(fire.wall.frequency, m.inside ? OPEN : A.fire.wallCutoff, t, 0.2); }
      glide(birdBus.gain, A.birds.level * m.birds, t, 1); glide(cricketBus.gain, A.crickets.level * m.crickets, t, 1);
      glide(boatBus.gain, A.boat.level * m.boat, t, 0.3);
      glide(indoorLP.frequency, m.inside ? A.indoor.cutoff : OPEN, t, 0.15); glide(outdoor.gain, m.inside ? A.indoor.level : 1, t, 0.15);
      if (m.crickets > 0.01 && !rec.crickets) startCrickets(); else if (m.crickets <= 0 && crickets) stopCrickets();
    },
    /** Schedule the timed events (waves, laps, crackles, bird phrases, cricket chirps, creaks) between t0 and t1. */
    schedule(t0, t1) {
      if (!mix) return;
      if (nextWave < t0) nextWave = t0;
      while (nextWave < t1 && !rec.ocean) {           // one wave: surge, break, wash
        const P = rr(...A.ocean.waveEvery), t = nextWave, brk = t + P * rr(0.35, 0.5);
        glide(bodyG.gain, rr(0.35, 0.5), t, 1.2); glide(bodyG.gain, rr(0.85, 1.1), brk, 0.12); glide(bodyG.gain, 0.28, brk + 0.5, 1.6);
        glide(hissG.gain, 0.08, t, 1); glide(hissG.gain, rr(0.45, 0.7), brk + 0.05, 0.08); glide(hissG.gain, 0.12, brk + 0.4, 1.1);
        nextWave += P;
      }
      if (pond) {
        if (nextLap < t0) nextLap = t0; if (nextPlip < t0) nextPlip = t0 + rr(...A.pond.plipEvery);
        while (nextLap < t1 && !rec.pond) { const t = nextLap; glide(pond.env.gain, rr(0.5, 1), t, 0.05); glide(pond.env.gain, 0.06, t + 0.12, 0.25); nextLap += rr(...A.pond.lapEvery); }
        while (nextPlip < t1 && !rec.pond) { const f = rr(850, 1500); note(pond.g, nextPlip, rr(0.03, 0.05), f, f * 0.55, rr(0.15, 0.3)); nextPlip += rr(...A.pond.plipEvery); }
      }
      if (fire) {
        if (nextCrackle < t0) nextCrackle = t0;
        while (nextCrackle < t1) {
          const t = nextCrackle, s = ac.createBufferSource(), pop = Math.random() < 0.12, dur = pop ? rr(0.02, 0.05) : rr(0.003, 0.02), g = gain(0);
          s.buffer = white; chain(s, filt('bandpass', pop ? rr(400, 900) : rr(1500, 5000), 0.9), g, fire.bus);
          g.gain.setValueAtTime(pop ? rr(0.5, 0.9) : rr(0.15, 0.6), t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
          s.start(t, Math.random() * 3.5, dur + 0.01);
          nextCrackle += Math.random() < 0.3 ? rr(0.01, 0.05) : -Math.log(1 - Math.random()) / A.fire.crackles;   // clusters
        }
        const f = 0.82 + 0.1 * Math.sin(t0 * 9.1) + 0.06 * Math.sin(t0 * 15.3 + 1.3);
        glide(fire.rumble.gain, 0.45 * f, t0, 0.1);
      }
      if (mix.birds > 0.01 && !rec.birds) for (const b of birds) { if (b.next < t0) b.next = t0 + rr(0, 1.5); while (b.next < t1) b.next += phrase(b, b.next) + rr(...A.birds.pause); }
      if (crickets) for (const c of crickets) {
        if (c.next < t0) c.next = t0;
        while (c.next < t1) { for (let k = 0; k < 3; k++) { const tp = c.next + k * 0.042; c.g.gain.setValueAtTime(0, tp); c.g.gain.linearRampToValueAtTime(0.5, tp + 0.006); c.g.gain.linearRampToValueAtTime(0, tp + 0.026); } c.next += c.period * rr(0.95, 1.05); }
      }
      if (mix.boat > 0.01 && !rec.boat) { if (nextCreak < t0) nextCreak = t0; while (nextCreak < t1) { creak(nextCreak); nextCreak += rr(...A.boat.every); } }
    },
    setListener(p, fwd, t) {
      const L = ac.listener;
      if (L.positionX) { L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t); L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t); L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t); }
      else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    },
    /** Place the pond sound at the shore point nearest the listener, the fire at the fireplace. */
    setPond(p, t) { if (!pond) return; const a = Math.atan2(p.z - LAKE.z, p.x - LAKE.x), r = lakeR(a); setPos(pond.pan, LAKE.x + Math.cos(a) * r, 0.05, LAKE.z + Math.sin(a) * r, t); },
    setFire(f, t) { if (fire) setPos(fire.pan, f.x, f.y, f.z, t); },
    startPond, stopPond, startFire, stopFire,
    get active() { return { pond: !!pond, fire: !!fire, crickets: !!crickets }; },
  };
}

/**
 * createAmbience(ctx): ctx needs camera, detail (the detail manager), skyUniforms and cabin; ctx.boat, if there is one,
 * exposes onBoard. Audio starts on the "Start exploring" tap (a user gesture, required by iPad Safari), pauses while
 * the tab is hidden, and the settings panel's Sound slider / button set and remember the volume.
 */
export function createAmbience(ctx) {
  const { camera, detail, skyUniforms, cabin } = ctx, A = AMB;
  let ac = null, g = null, acc = 0, muted = false, volume = A.volume;
  try { const v = parseFloat(localStorage.getItem('meadow.volume')); if (v >= 0 && v <= 1) volume = v; muted = localStorage.getItem('meadow.muted') === '1'; } catch (err) { void err; /* private mode */ }
  const fireAt = { x: 0, y: 0, z: 0 };
  if (cabin && cabin.fireLight) { cabin.fireLight.updateWorldMatrix(true, false); const e = cabin.fireLight.matrixWorld.elements; fireAt.x = e[12]; fireAt.y = e[13]; fireAt.z = e[14]; }
  const want = { pond: false, fire: false };

  // detail-manager bands: the pond and fire layers only exist near the pond / cabin
  if (detail) {
    const V3 = camera.position.constructor;
    detail.band('pond sound', { min: new V3(LAKE.x - 2.4, -1, LAKE.z - 2.4), max: new V3(LAKE.x + 2.4, 1, LAKE.z + 2.4) }, A.pond.band, on => { want.pond = on; if (g) { if (on) g.startPond(); else g.stopPond(); } });
    detail.band('fire sound', { min: new V3(fireAt.x, fireAt.y, fireAt.z) }, A.fire.band, on => { want.fire = on; if (g) { if (on) g.startFire(); else g.stopFire(); } });
  } else { want.pond = want.fire = true; }

  function applyVolume() { if (g) g.master.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.05); }
  function start() {
    if (ac) { if (ac.state !== 'running') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); g = createAmbienceGraph(ac);
    if (want.pond) g.startPond(); if (want.fire) g.startFire();
    applyVolume(); if (ac.state !== 'running') ac.resume();
    // optional recordings (audio/<file>); a layer keeps its synthesis if its file is missing or cannot be decoded
    for (const name of ['ocean', 'pond', 'birds', 'crickets', 'boat']) {
      const f = A[name].file; if (!f) continue;
      window.fetch('audio/' + f).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => ac.decodeAudioData(b, ok, no))).then(buf => g.useRecording(name, buf)).catch(() => {});
    }
  }
  const startBtn = document.getElementById('start'); if (startBtn) startBtn.addEventListener('click', start);
  // iPad Safari can leave the context suspended or "interrupted" (a call, another app): any later tap resumes it
  addEventListener('pointerdown', () => { if (ac && ac.state !== 'running' && !document.hidden) ac.resume(); });
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });

  // settings panel: volume slider and sound on / off
  const volIn = document.getElementById('volume'), volV = document.getElementById('volumeV'), muteBtn = document.getElementById('muteBtn');
  const showUI = () => {
    if (volIn) volIn.value = volume; if (volV) volV.textContent = Math.round(volume * 100) + '%';
    if (muteBtn) { muteBtn.textContent = muted ? 'Off' : 'On'; muteBtn.setAttribute('aria-pressed', String(!muted)); }
  };
  const save = () => { try { localStorage.setItem('meadow.volume', String(volume)); localStorage.setItem('meadow.muted', muted ? '1' : '0'); } catch (err) { void err; /* private mode */ } };
  if (volIn) volIn.addEventListener('input', () => { volume = +volIn.value; if (muted && volume > 0) muted = false; showUI(); applyVolume(); save(); });
  if (muteBtn) muteBtn.addEventListener('click', () => { muted = !muted; showUI(); applyVolume(); save(); start(); });
  showUI();

  const fwd = new camera.position.constructor(), stats = { updateMs: 0, running: false };
  return {
    stats,
    update(dt) {
      if (!ac || ac.state !== 'running') { stats.running = false; return; }
      stats.running = true; acc += dt; if (acc < A.update) return; acc = 0;
      const t0 = performance.now(), t = ac.currentTime, p = camera.position, onBoat = !!(ctx.boat && ctx.boat.onBoard);
      const m = mixAt(p, skyUniforms.uNight.value, U.uWind.value, fireAt, onBoat);
      g.setMix(m, t); g.schedule(t, t + A.lookahead);
      camera.getWorldDirection(fwd); g.setListener(p, fwd, t); g.setPond(p, t); g.setFire(fireAt, t);
      stats.updateMs = performance.now() - t0;
    },
  };
}
