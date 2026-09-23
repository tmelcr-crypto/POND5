import { U } from '../core/uniforms.js';
import { coastDist, forest, houseRectDist, LAKE, lakeR, lakeD } from '../world/layout.js';

/**
 * Ambient sound, all synthesised with the Web Audio API (no audio files): wind with gusts, ocean swell, fire crackle and
 * rumble, birdsong by day (blackbird, chaffinch, great tit, robin, chiffchaff, wood pigeon), crickets at night, and a
 * boat creak for when there is a boat. The pond layer exists but is off (AMB.pond.enabled). Each layer's level comes
 * from mixAt(): the player's position (distance to the shore, the pond, the fire; inside the cabin or not) and the
 * sky's night value (skyUniforms.uNight, the scene's time of day). Fire and pond are positioned in 3D; the rest is
 * plain stereo. Pond and fire only run while their detail-manager band is on. Every number is in AMB.
 * A layer can use a looping recording instead of the synthesis: put the file in audio/ and set the layer's `file`
 * (m4a or mp3, CC0 or CC-BY, listed in audio/CREDITS.md).
 */
export const AMB = {
  volume: 0.3,                    // default master volume (the settings panel changes and remembers it)
  update: 0.1,                    // seconds between mix updates (levels glide between them)
  lookahead: 0.4,                 // seconds of events (waves, crackles, bird phrases) scheduled ahead
  // soft pink-noise whoosh with the low rumble cut (lowCut, Hz) so gusts never thump; gust: how much gusts swell it
  wind: { level: 0.2, lowCut: 160, cutoff: [420, 950], gust: 0.3, gustPeriod: [9, 23], leaves: 0.35, whistle: 0.03, shoreBoost: 0.3 },
  ocean: { level: 0.75, waveEvery: [6.5, 11], near: -4, far: 26, inland: 0.1, file: null },
  pond: { enabled: false, level: 1.5, range: [1, 13], lapEvery: [0.35, 1.3], plipEvery: [1.5, 5], band: 16, file: null },
  fire: { level: 1.3, range: [0.8, 7], outside: [1.2, 4.5], outsideLevel: 0.15, wallCutoff: 1500, crackles: 9, band: 18 },
  birds: {
    level: 0.22, night: [0.2, 0.65], file: null,
    flock: ['blackbird', 'blackbird', 'chaffinch', 'greattit', 'robin', 'chiffchaff', 'woodpigeon'],   // one singer each (SONGS)
    distance: [7, 45],            // m, each singer's distance: sets its loudness, muffling and how much echo is heard
    move: 0.15,                   // chance after each song that the singer moves to another perch
    echo: 0.9,                    // s, length of the outdoor echo on the songs
  },
  crickets: { level: 0.16, count: 5, pitch: [4200, 4900], night: [0.35, 0.8], file: null },
  boat: { level: 0.9, every: [1.2, 3.5], file: null },
  indoor: { cutoff: 1100, level: 0.45 },   // outdoor layers heard from inside the cabin
};
const rr = (a, b) => a + (b - a) * Math.random();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
// pitch contours for tone(): u runs 0..1 through the note, s is seconds into it
const slide = (f0, f1, k = 1) => u => f0 * (f1 / f0) ** (u ** k);          // glide from f0 to f1 (k bends the curve)
const arch = (f0, fm, f1, at = 0.4) => u => u < at ? f0 * (fm / f0) ** Math.sin(u / at * Math.PI / 2) : fm * (f1 / fm) ** (((u - at) / (1 - at)) ** 1.3);
const vib = (fq, rate, depth) => (u, s) => fq(u, s) * (1 + depth * Math.sin(6.283 * rate * s));

/**
 * The songs of the birds in AMB.birds.flock, after recordings of each species. make(p) fixes one singer's own version
 * (p: its pitch), sing(s, t, tone) schedules one song from time t with tone(t, dur, contour, amp, attack, rich) and
 * returns its length in seconds; pause is the rest between songs, loud the species' loudness.
 */
const SONGS = {
  // low, fluted, unhurried phrases, most ended by a quiet high twitter; a singer keeps a few motifs and varies them
  blackbird: {
    loud: 1, pause: [2.5, 6],
    make: p => ({ motifs: Array.from({ length: 4 }, () => Array.from({ length: int(3, 6) }, () => ({ d: rr(0.12, 0.34), f: rr(1450, 2700) * p, shape: pick(['arch', 'down', 'up', 'hold']), a: rr(0.55, 0.95), gap: rr(0.02, 0.09) }))) }),
    sing(s, t, tone) {
      let d = 0;
      for (const n of pick(s.motifs)) {
        const f = n.f * rr(0.97, 1.03), dur = n.d * rr(0.9, 1.1);
        const fq = n.shape === 'arch' ? arch(f, f * 1.28, f * 0.9, 0.35) : n.shape === 'down' ? slide(f * 1.18, f * 0.8, 0.7) : n.shape === 'up' ? slide(f * 0.85, f * 1.15, 1.4) : vib(() => f, rr(14, 22), 0.02);
        tone(t + d, dur, fq, n.a, 0.25); d += dur + n.gap;
      }
      if (Math.random() < 0.7) { d += rr(0.03, 0.1); for (let i = int(2, 7); i > 0; i--) { const f = rr(4200, 7800), dur = rr(0.025, 0.06); tone(t + d, dur, slide(f, f * rr(0.6, 1.5)), rr(0.12, 0.3), 0.15); d += dur + rr(0.012, 0.04); } }
      return d;
    },
  },
  // repeated notes falling in pitch and speeding up, then the end flourish ("chip chip chip, tell tell, tissi-cheweeoo")
  chaffinch: {
    loud: 0.9, pause: [4, 9],
    make: p => ({ a: { n: int(6, 9), f: rr(5000, 6200) * p, gap: rr(0.115, 0.14) }, b: { n: int(4, 6), f: rr(3600, 4500) * p, gap: rr(0.085, 0.1) }, end: rr(2400, 2900) * p }),
    sing(s, t, tone) {
      let d = 0, gap = s.a.gap;
      for (let i = 0; i < s.a.n; i++) { const f = s.a.f * (1 - i * 0.025); tone(t + d, 0.065, slide(f, f * 0.55, 0.8), 0.3 + i * 0.03, 0.12, true); d += gap; gap *= 0.96; }
      for (let i = 0; i < s.b.n; i++) tone(t + d + i * s.b.gap, 0.055, arch(s.b.f * 0.8, s.b.f, s.b.f * 0.6, 0.3), 0.5, 0.15, true);
      d += s.b.n * s.b.gap + 0.03;
      for (let i = 0; i < 2; i++) { tone(t + d, 0.05, slide(s.end * 2.1, s.end * 2.55), 0.35, 0.3); d += 0.075; }
      tone(t + d + 0.015, 0.36, arch(s.end, s.end * 1.9, s.end * 0.75, 0.3), 0.75, 0.12, true);
      return d + 0.375;
    },
  },
  // "tea-cher, tea-cher, tea-cher": a high and a lower note, repeated (some singers add a third)
  greattit: {
    loud: 0.85, pause: [3, 8],
    make: p => ({ hi: rr(4800, 6000) * p, lo: rr(0.6, 0.72), three: Math.random() < 0.3 }),
    sing(s, t, tone) {
      let d = 0; const lo = s.hi * s.lo;
      for (let i = int(3, 7); i > 0; i--) {
        tone(t + d, 0.08, slide(s.hi * 1.04, s.hi * 0.94), 0.6, 0.2); d += 0.12;
        tone(t + d, 0.12, slide(lo * 1.03, lo * 0.9), 0.55, 0.2); d += 0.17;
        if (s.three) { tone(t + d, 0.11, slide(lo * 1.03, lo * 0.9), 0.45, 0.2); d += 0.16; }
        d += 0.03;
      }
      return d;
    },
  },
  // thin, liquid, quickly changing notes and short trills, high and wistful
  robin: {
    loud: 0.7, pause: [2, 5],
    make: () => ({}),
    sing(s, t, tone) {
      let d = 0;
      for (let i = int(6, 12); i > 0; i--) {
        const k = Math.random(), a = rr(0.25, 0.6);
        if (k < 0.35) { const f = rr(5000, 7600) * s.p, dur = rr(0.1, 0.25); tone(t + d, dur, vib(slide(f, f * rr(0.9, 1.1)), rr(8, 12), 0.03), a, 0.3); d += dur; }
        else if (k < 0.75) { const dur = rr(0.06, 0.16); tone(t + d, dur, slide(rr(2600, 6500) * s.p, rr(2600, 6500) * s.p, rr(0.6, 1.6)), a, 0.25); d += dur; }
        else { const f = rr(3500, 5500) * s.p, gap = rr(0.028, 0.035); for (let j = int(4, 8); j > 0; j--) { tone(t + d, 0.022, slide(f * 1.1, f * 0.85), a * 0.7, 0.2); d += gap; } }
        d += rr(0.02, 0.07);
      }
      return d;
    },
  },
  // "chiff chaff chiff chiff chaff": two notes in a loose, even beat
  chiffchaff: {
    loud: 0.7, pause: [4, 10],
    make: p => ({ hi: rr(5400, 6200) * p, lo: rr(0.74, 0.82), beat: rr(0.33, 0.42) }),
    sing(s, t, tone) {
      let d = 0;
      for (let i = int(6, 12); i > 0; i--) { const f = Math.random() < 0.55 ? s.hi : s.hi * s.lo; tone(t + d, 0.075, slide(f * 1.12, f * 0.82, 0.8), rr(0.4, 0.5), 0.15); d += s.beat * rr(0.94, 1.06); }
      return d;
    },
  },
  // a soft, hoarse coo in a five-beat rhythm ("coo-COO-coo, coo-coo"), a few times over, from further away
  woodpigeon: {
    loud: 0.55, pause: [14, 32], far: true,
    make: p => ({ f: rr(380, 450) * p }),
    sing(s, t, tone) {
      let d = 0;
      for (let r = int(2, 4); r > 0; r--) {
        for (const [dur, a, gap] of [[0.3, 0.55, 0.12], [0.55, 0.9, 0.1], [0.3, 0.6, 0.35], [0.26, 0.55, 0.1], [0.3, 0.5, 0]]) { tone(t + d, dur, arch(s.f * 0.9, s.f, s.f * 0.94, 0.3), a, 0.4, true); d += dur + gap; }
        d += rr(0.6, 0.9);
      }
      return d;
    },
  },
};

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
    leaves: forest(p.x, p.z),                                     // rustle of leaves among the island's trees
    ocean: onBoat ? 1 : A.ocean.inland + (1 - A.ocean.inland) * (1 - smooth(A.ocean.near, A.ocean.far, c)),
    pond: A.pond.enabled ? 1 - smooth(A.pond.range[0], A.pond.range[1], pondD) : 0,
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
  const noise = (sec, kind) => {
    const n = Math.floor(sr * sec), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0); let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
      else d[i] = w;
    }
    const f = Math.floor(sr * 0.05); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }   // smooth loop seam
    return b;
  };
  const white = noise(4, 'white'), brown = noise(6, 'brown'), pink = noise(5, 'pink');
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

  /* ---- wind: pink noise with the low rumble cut under a slowly moving lowpass, a quiet rustle of leaves among trees
     and a faint whistle in strong wind; gusts are slow random swells ---- */
  const windG = gain(0), windLP = filt('lowpass', 600, 0.5), leavesG = gain(0), whistleG = gain(0), whistleBP = filt('bandpass', 900, 6);
  chain(loop(pink, 1), filt('highpass', A.wind.lowCut, 0.5), windLP, windG, outdoor);
  chain(loop(pink, 1.13), filt('highpass', 1800, 0.5), filt('lowpass', 6500, 0.5), leavesG, outdoor);
  chain(loop(white, 1), whistleBP, whistleG, outdoor);
  const gusts = [0, 1, 2].map(() => ({ p: rr(...A.wind.gustPeriod), ph: rr(0, 6.28) }));
  const gustAt = t => 0.5 + 0.5 * gusts.reduce((s, g, i) => s + Math.sin(t * 6.283 / g.p + g.ph) * [0.5, 0.3, 0.2][i], 0);

  /* ---- ocean: a lowpassed body and a hiss, both shaped per wave (surge, break, wash) ---- */
  const oceanG = gain(0), bodyG = gain(0.3), hissG = gain(0.1);
  chain(loop(white, 1), filt('lowpass', 520), bodyG, oceanG); chain(loop(white, 0.97), filt('highpass', 1800), hissG, oceanG); oceanG.connect(outdoor);
  let nextWave = 0;

  /* ---- pond: lapping (bandpassed brown noise in small swells) and the odd droplet plip, from the nearest shore ---- */
  let pond = null, nextLap = 0, nextPlip = 0;
  function startPond() {
    if (pond || !A.pond.enabled) return;
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

  /* ---- birds: one singer per AMB.birds.flock entry, each on its own perch (distance and direction). A note is one
     oscillator following a pitch contour with a smooth envelope; distance sets loudness and muffling, and a short
     generated echo (trees, the cabin) puts the songs outdoors ---- */
  const birdBus = gain(0), verbIn = gain(1), verb = ac.createConvolver(); let verbOn = false;
  verb.buffer = echo(A.birds.echo); chain(verb, birdBus); birdBus.connect(outdoor);
  const wave = (...h) => ac.createPeriodicWave(new Float32Array(h.length + 1), Float32Array.from([0, ...h]));
  const PURE = wave(1, 0.05, 0.015), RICH = wave(1, 0.3, 0.12, 0.04);   // whistle / slightly reedy
  function echo(sec) {   // diffuse tail that darkens as it decays
    const n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = Math.floor(sr * 0.015); i < n; i++) { const x = i / sr; lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.5 * x / sec); d[i] = lp * Math.exp(-x / (sec * 0.2)); } }
    return b;
  }
  function tone(dest, t, dur, fq, amp, att = 0.2, rich = false) {
    const n = Math.max(8, Math.ceil(dur / 0.0025)), f = new Float32Array(n), e = new Float32Array(n);
    const j1 = rr(30, 50), j2 = rr(60, 90), p1 = rr(0, 6.28), p2 = rr(0, 6.28);   // slight pitch jitter: real notes are never quite smooth
    for (let i = 0; i < n; i++) { const u = i / (n - 1), x = u * dur; f[i] = Math.min(OPEN, fq(u, x) * (1 + 0.006 * Math.sin(6.283 * j1 * x + p1) + 0.004 * Math.sin(6.283 * j2 * x + p2))); e[i] = amp * (u < att ? Math.sin(u / att * Math.PI / 2) ** 2 : Math.cos((u - att) / (1 - att) * Math.PI / 2) ** 1.6); }
    const o = ac.createOscillator(), g = gain(0); o.setPeriodicWave(rich ? RICH : PURE);
    o.frequency.setValueCurveAtTime(f, t, dur); g.gain.setValueCurveAtTime(e, t, dur);
    chain(o, g, dest); o.start(t); o.stop(t + dur + 0.01);
  }
  const birds = A.birds.flock.map(sp => {
    const S = SONGS[sp], p = rr(0.94, 1.06), b = { S, s: { p, ...S.make(p) }, in: gain(0), lp: filt('lowpass', 8000), pan: stereo(0), send: gain(0), next: rr(0, 5) };
    chain(b.in, b.lp, b.pan, birdBus); chain(b.lp, b.send, verbIn); b.tone = (...a) => tone(b.in, ...a);
    perch(b, 0); return b;
  });
  // a new perch: its distance sets loudness, muffling (air, leaves) and how much of the song reaches you as echo
  function perch(b, t) {
    const [n, f] = A.birds.distance, d = b.S.far ? f * rr(0.8, 1.25) : n * (f / n) ** Math.random();
    glide(b.in.gain, b.S.loud * Math.min(1, 9 / d), t, 0.3); glide(b.lp.frequency, Math.min(OPEN, 17000 * (9 / d) ** 0.7, b.S.far ? 2400 : OPEN), t, 0.3);
    glide(b.send.gain, 0.12 + 0.38 * smooth(n, f, d), t, 0.3); if (b.pan.pan) glide(b.pan.pan, rr(-0.85, 0.85), t, 0.3);
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
      const W = A.wind, w = m.windStrength, gst = gustAt(t);
      glide(windG.gain, W.level * m.wind * (1 - W.gust + W.gust * gst), t, 1.2); glide(windLP.frequency, W.cutoff[0] + (W.cutoff[1] - W.cutoff[0]) * gst * Math.min(1, 0.4 + w), t, 1.5);
      glide(leavesG.gain, W.level * W.leaves * m.leaves * m.wind * (0.3 + 0.7 * gst), t, 0.8);
      glide(whistleG.gain, W.level * W.whistle * m.wind * gst * gst * Math.max(0, w - 0.4), t, 1); glide(whistleBP.frequency, 650 + 600 * gst, t, 1);
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
        while (nextPlip < t1 && !rec.pond) { const f = rr(850, 1500); tone(pond.g, nextPlip, rr(0.03, 0.05), slide(f, f * 0.55), rr(0.15, 0.3), 0.1); nextPlip += rr(...A.pond.plipEvery); }
      }
      if (fire) {
        if (nextCrackle < t0) nextCrackle = t0;
        while (nextCrackle < t1) {
          const t = nextCrackle, s = ac.createBufferSource(), pop = mix.inside && Math.random() < 0.1, dur = pop ? rr(0.01, 0.03) : rr(0.003, 0.02), g = gain(0);   // pops: a sharp snap, only heard inside
          s.buffer = white; chain(s, filt('bandpass', pop ? rr(900, 1800) : rr(1500, 5000), 0.9), g, fire.bus);
          g.gain.setValueAtTime(pop ? rr(0.4, 0.7) : rr(0.15, 0.6), t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
          s.start(t, Math.random() * 3.5, dur + 0.01);
          nextCrackle += Math.random() < 0.3 ? rr(0.01, 0.05) : -Math.log(1 - Math.random()) / A.fire.crackles;   // clusters
        }
        const f = 0.82 + 0.1 * Math.sin(t0 * 9.1) + 0.06 * Math.sin(t0 * 15.3 + 1.3);
        glide(fire.rumble.gain, 0.45 * f, t0, 0.1);
      }
      if (mix.birds > 0.01 && !rec.birds) {
        if (!verbOn) { verbIn.connect(verb); verbOn = true; }
        let songs = 1;   // at most one new song per update, so no single frame builds several songs' notes
        for (const b of birds) {
          if (b.next < t0) b.next = t0 + rr(0, 2);
          while (b.next < t1 && songs-- > 0) { const d = b.S.sing(b.s, b.next, b.tone); if (Math.random() < A.birds.move) perch(b, b.next + d + 0.3); b.next += d + rr(...b.S.pause); }
        }
      } else if (verbOn && mix.birds <= 0) { verbIn.disconnect(); verbOn = false; }   // no echo processing at night
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
  try { const v = parseFloat(localStorage.getItem('meadow.soundVolume')); if (v >= 0 && v <= 1) volume = v; muted = localStorage.getItem('meadow.muted') === '1'; } catch (err) { void err; /* private mode */ }
  const fireAt = { x: 0, y: 0, z: 0 };
  if (cabin && cabin.fireLight) { cabin.fireLight.updateWorldMatrix(true, false); const e = cabin.fireLight.matrixWorld.elements; fireAt.x = e[12]; fireAt.y = e[13]; fireAt.z = e[14]; }
  const want = { pond: false, fire: false };

  // detail-manager bands: the pond and fire layers only exist near the pond / cabin
  if (detail) {
    const V3 = camera.position.constructor;
    if (A.pond.enabled) detail.band('pond sound', { min: new V3(LAKE.x - 2.4, -1, LAKE.z - 2.4), max: new V3(LAKE.x + 2.4, 1, LAKE.z + 2.4) }, A.pond.band, on => { want.pond = on; if (g) { if (on) g.startPond(); else g.stopPond(); } });
    detail.band('fire sound', { min: new V3(fireAt.x, fireAt.y, fireAt.z) }, A.fire.band, on => { want.fire = on; if (g) { if (on) g.startFire(); else g.stopFire(); } });
  } else { want.pond = A.pond.enabled; want.fire = true; }

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
  const save = () => { try { localStorage.setItem('meadow.soundVolume', String(volume)); localStorage.setItem('meadow.muted', muted ? '1' : '0'); } catch (err) { void err; /* private mode */ } };
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
