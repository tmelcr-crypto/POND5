import { CONFIG } from '../config.js';
import { H, HOUSE, CB, PAD_H, footpathDist, bridgeDeckY, jettyDeckY, coastDist, lakeD, WATER_Y, SEA_Y } from '../world/layout.js';

/**
 * Footsteps (#80), quiet under the ambience, synthesised: a step every CONFIG.steps.stride metres walked on the ground,
 * its sound from what is underfoot: wood (the cabin floor, porch, bridge, jetty), stone (the path stones), sand (the
 * beach), snow (in winter), ice (the frozen pond), water (wading), otherwise grass. Through the ambience's master volume.
 */
export function createFootsteps({ st, ambience, seasons }) {
  const S = CONFIG.steps;
  let dist = 0, left = false, noise = null;
  const last = { x: st.pos.x, z: st.pos.z };
  function surface() {
    const p = st.pos, feet = p.y - CONFIG.player.eyeHeight;
    if (Math.abs(p.x - HOUSE.x) < CB.XW + 0.3 && Math.abs(p.z - HOUSE.z) < CB.ZW + 0.9 && feet > PAD_H - 0.05) return 'wood';
    if (Math.abs(feet - bridgeDeckY(p.x, p.z)) < 0.15 || Math.abs(feet - jettyDeckY(p.x, p.z)) < 0.15) return 'wood';
    const g = H(p.x, p.z), winter = seasons && seasons.season === 'winter';
    if (winter && lakeD(p.x, p.z) < 1 && feet > WATER_Y - 0.05) return 'ice';
    if (g < SEA_Y - 0.02 || (lakeD(p.x, p.z) < 1 && g < WATER_Y)) return 'water';
    if (footpathDist(p.x, p.z) < 0.02) return 'stone';
    if (winter) return 'snow';
    if (coastDist(p.x, p.z) < CONFIG.island.beachWidth) return 'sand';
    return 'grass';
  }
  function play(kind) {
    const A = ambience.audio; if (!A) return;
    const { ac, out } = A, t = ac.currentTime, v = S.level * (0.8 + 0.4 * Math.random());
    if (!noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const burst = (dur, type, f, q, g, at = 0) => {
      const s = ac.createBufferSource(); s.buffer = noise; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f * (0.9 + 0.2 * Math.random()); fl.Q.value = q;
      const e = ac.createGain(); e.gain.setValueAtTime(0, t + at); e.gain.linearRampToValueAtTime(g * v, t + at + 0.008); e.gain.exponentialRampToValueAtTime(0.0005, t + at + dur);
      s.connect(fl); fl.connect(e); e.connect(out); s.start(t + at, Math.random() * 0.3, dur + 0.02);
    };
    const knock = (f, dur, g) => { const o = ac.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur); const e = ac.createGain(); e.gain.setValueAtTime(g * v, t); e.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.connect(e); e.connect(out); o.start(t); o.stop(t + dur + 0.02); };
    ({
      grass: () => { burst(0.12, 'highpass', 2500, 0.7, 0.5); burst(0.08, 'bandpass', 900, 0.8, 0.25, 0.02); },
      stone: () => { knock(190, 0.05, 0.5); burst(0.04, 'bandpass', 2200, 1.5, 0.35); },
      wood: () => { knock(120, 0.09, 0.8); burst(0.05, 'bandpass', 700, 1.2, 0.35); },
      sand: () => { burst(0.14, 'lowpass', 1400, 0.6, 0.55); },
      snow: () => { burst(0.16, 'bandpass', 1600, 0.9, 0.7); burst(0.1, 'bandpass', 3200, 1.5, 0.3, 0.04); },
      ice: () => { knock(260, 0.04, 0.35); burst(0.05, 'highpass', 4000, 0.8, 0.25); },
      water: () => { burst(0.22, 'lowpass', 700, 0.8, 0.7); burst(0.12, 'bandpass', 1800, 1, 0.3, 0.05); },
    }[kind] || (() => {}))();
  }
  return {
    update() {
      const p = st.pos, dx = p.x - last.x, dz = p.z - last.z, d = Math.hypot(dx, dz); last.x = p.x; last.z = p.z;
      if (!st.playing || !st.walk || !st.grounded || st.aboard || st.seat || st.inBed || d > 1) { dist = 0; return; }
      dist += d;
      if (dist >= S.stride) { dist -= S.stride; left = !left; play(surface()); }
    },
    surface,
  };
}
