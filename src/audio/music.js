import { CONFIG } from '../config.js';

/**
 * A soft soundtrack (#81), generated in the browser (no files): slow, sparse piano-like notes over warm pads, in a
 * scale and register of the season (spring bright, summer warm, autumn wistful, winter still), slower and quieter at
 * night. It plays a while and rests a while (CONFIG.music.play / rest minutes), always well under the nature sounds
 * (CONFIG.music.level of the master). Off by default; the panel's Music switch turns it on (remembered).
 */
const SCALES = {   // semitones above the root
  spring: { root: 60, notes: [0, 2, 4, 7, 9, 12, 14, 16] },
  summer: { root: 55, notes: [0, 2, 4, 7, 9, 12, 14, 19] },
  autumn: { root: 57, notes: [0, 3, 5, 7, 10, 12, 15, 17] },
  winter: { root: 50, notes: [0, 3, 7, 10, 12, 14, 15, 19] },
};
const CHORDS = [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]];   // I, IV, vi, V (minor seasons use the scale's own thirds)

export function createMusic({ ambience, seasons, skyUniforms }) {
  const MC = CONFIG.music, KEY = 'meadow.music';
  let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (err) { void err; }
  let bus = null, nextNote = 0, nextChord = 0, chordI = 0, phase = 'rest', phaseLeft = 10;
  const btn = document.getElementById('musicBtn');
  const show = () => { if (btn) { btn.textContent = on ? 'On' : 'Off'; btn.setAttribute('aria-pressed', String(on)); } };
  show();
  if (btn) btn.addEventListener('click', () => { on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (err) { void err; } show(); if (on) { phase = 'rest'; phaseLeft = 2; } else if (bus) bus.gain.setTargetAtTime(0, bus.context.currentTime, 1.5); });
  const hz = m => 440 * Math.pow(2, (m - 69) / 12), rr = (a, b) => a + (b - a) * Math.random();

  function ensure(A) { if (bus && bus.context === A.ac) return; bus = A.ac.createGain(); bus.gain.value = 0; const lp = A.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; bus.connect(lp); lp.connect(A.out); }
  function note(ac, m, t, dur, g) {   // a soft piano-like tone: a few harmonics, quick attack, long decay
    [1, 2, 3].forEach((h, i) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m) * h * (1 + (i ? rr(-0.002, 0.002) : 0));
      const e = ac.createGain(), a = g / (1 + i * 2.5);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + 0.012); e.gain.exponentialRampToValueAtTime(a * 0.35, t + 0.35); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function pad(ac, ms, t, dur, g) {   // a warm pad: detuned triangles, slow swell
    ms.forEach(m => [-4, 4].forEach(c => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = c;
      const e = ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + dur * 0.35); e.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(e); e.connect(bus); o.start(t); o.stop(t + dur + 0.1);
    }));
  }
  return {
    get on() { return on; },
    update(dt) {
      const A = ambience.audio; if (!A || !on) return;
      ensure(A); const ac = A.ac, t = ac.currentTime;
      if ((phaseLeft -= dt) <= 0) { phase = phase === 'play' ? 'rest' : 'play'; phaseLeft = rr(...(phase === 'play' ? MC.play : MC.rest)) * 60; }
      const night = skyUniforms.uNight.value, level = phase === 'play' ? MC.level * (1 - 0.4 * night) : 0;
      bus.gain.setTargetAtTime(level, t, 3);
      if (phase !== 'play') { nextNote = nextChord = t; return; }
      const S = SCALES[seasons ? seasons.season : 'summer'], slow = 1 + night * 0.6;
      if (nextChord < t) nextChord = t;
      if (nextChord < t + 0.5) { const c = CHORDS[chordI++ % CHORDS.length], len = rr(7, 10) * slow; pad(ac, c.map(n => S.root - 12 + (S.notes.includes(n % 12) ? n : n - 1)), nextChord, len + 1, 0.035); nextChord += len; }
      if (nextNote < t) nextNote = t + 0.2;
      if (nextNote < t + 0.5) { if (Math.random() < 0.8) note(ac, S.root + S.notes[Math.floor(Math.random() * S.notes.length)], nextNote, rr(2.5, 4.5), 0.09); nextNote += rr(0.9, 2.6) * slow; }
    },
  };
}
