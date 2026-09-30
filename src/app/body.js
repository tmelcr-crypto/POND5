import { CONFIG } from '../config.js';
import { HOUSE, CB } from '../world/layout.js';
import { canvasTex } from '../core/canvasTexture.js';
import { clamp } from '../core/math.js';

/**
 * How the body feels:
 *  - hunger (#1): a thin bar under the quick slots that drains over an in-game day (the running clock) and never goes
 *    below CONFIG.body.floor; eating fills it (cooked food more: CONFIG.body.food).
 *  - sleepiness: a second bar under it, how rested you are. It drains over the hours you are awake (CONFIG.body.awake:
 *    full after a night's sleep, down to `slow` by late evening); sleeping fills it (slept(hours)); a cup of coffee adds
 *    `coffee`; eating more than the hunger bar holds takes what is over from it. Below `slow` you walk at half speed
 *    and your sight blurs (rendered softer, the eyelids drooping); at `collapse` you fall asleep where you stand
 *    (onCollapse: app/sleeping.js decides where you wake).
 *  - cold (#2): outdoors in winter frost creeps in from the screen's corners and sides after a while and grows over a
 *    few minutes; near a burning fire, inside the cabin or after something cooked it melts away.
 * Items tell it what was eaten with the 'meadow-eat' event (app/items.js).
 */
export function createBody({ st, clock, seasons, fires }) {
  const B = CONFIG.body, KEY = 'meadow.body';
  const A = B.awake;
  let food = 1, awake = 1, cold = 0, outFor = 0, prevH = clock.hours;
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) { food = Math.max(B.floor, Math.min(1, +d.food || 1)); if (d.awake !== undefined) awake = Math.max(A.collapse, Math.min(1, +d.awake)); } } catch (err) { void err; }
  let saveIn = 0; const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ food, awake })); } catch (err) { void err; } };

  /* ---- the hunger bar ---- */
  const bar = document.createElement('div'); bar.id = 'hungerBar'; bar.innerHTML = '<span class="fill"></span>'; bar.setAttribute('aria-label', 'Hunger'); document.body.appendChild(bar);
  const fill = bar.firstChild;
  const showFood = () => { fill.style.width = (food * 100).toFixed(1) + '%'; bar.classList.toggle('low', food < 0.45); };
  showFood();
  /* ---- the sleepiness bar ---- */
  const sbar = document.createElement('div'); sbar.id = 'sleepBar'; sbar.innerHTML = '<span class="fill"></span>'; sbar.setAttribute('aria-label', 'Sleepiness'); document.body.appendChild(sbar);
  const sfill = sbar.firstChild;
  const showAwake = () => { sfill.style.width = (awake * 100).toFixed(1) + '%'; sbar.classList.toggle('low', awake < A.slow); };
  showAwake();
  const lids = document.createElement('div'); lids.id = 'eyelids'; document.body.appendChild(lids);   // drooping eyelids when sleepy
  const note = (t, ms = 3500) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = t; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };
  const setAwake = v => { const was = awake; awake = Math.max(0, Math.min(1, v)); if (was >= A.slow && awake < A.slow) note('You are getting sleepy: find a bed, or a cup of coffee'); showAwake(); };
  addEventListener('meadow-eat', e => {
    const k = e.detail;
    if (k === 'coffee') { setAwake(awake + A.coffee); note(awake > 0.99 ? 'Wide awake' : 'The coffee wakes you up', 2200); save(); return; }
    const f = food + (B.food[k] || 0.12), over = Math.max(0, f - 1); food = Math.min(1, f);   // too much: what is over makes you drowsy
    if (over > 0) { setAwake(awake - over); if (over > 0.02) note('Too full: you feel drowsy', 2200); }
    if (B.warm.includes(k)) cold = Math.max(0, cold - 0.6); showFood(); save();
  });

  /* ---- frost round the edges ---- */
  const frostTex = canvasTex(512, 512, (g, w, h) => {   // white crystals, dense at the rim, none in the middle
    g.clearRect(0, 0, w, h); g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + 0.5 * Math.pow(Math.random(), 0.35), x = w / 2 + Math.cos(a) * r * w * 0.72, y = h / 2 + Math.sin(a) * r * h * 0.72;
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const len = 4 + Math.random() * 18, d = Math.random() * Math.PI * 2;
      g.strokeStyle = `rgba(235,245,255,${0.08 + 0.25 * Math.random()})`; g.lineWidth = 0.6 + Math.random() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(d) * len, y + Math.sin(d) * len);
      for (let k = 0; k < 2; k++) { const d2 = d + (Math.random() - 0.5) * 1.6, m = 0.3 + Math.random() * 0.4; g.moveTo(x + Math.cos(d) * len * m, y + Math.sin(d) * len * m); g.lineTo(x + Math.cos(d) * len * m + Math.cos(d2) * len * 0.4, y + Math.sin(d) * len * m + Math.sin(d2) * len * 0.4); }
      g.stroke();
    }
  }, false);
  const frost = document.createElement('div'); frost.id = 'frost'; document.body.appendChild(frost);
  frost.style.backgroundImage = `url(${frostTex.image.toDataURL()})`;

  const inCabin = p => Math.abs(p.x - HOUSE.x) < CB.XW && Math.abs(p.z - HOUSE.z) < CB.ZW;
  const byFire = p => fires.fires.some(f => f.k > 0.5 && !f.quick && Math.hypot(f.at.x - p.x, f.at.z - p.z) < B.fireWarm);
  let soft = 1, lidT = 0;
  const api = {
    get food() { return food; }, get cold() { return cold; }, get awake() { return awake; },
    /** How much slower you walk (1, or A.slowWalk when sleepy). */
    get pace() { return awake < A.slow ? A.slowWalk : 1; },
    /** How much finer the frame is rendered (1, lower when sleepy: the blur; engine/dynamicRes.js). */
    get soft() { return soft; },
    /** You slept this many hours (a bed, or where you fell asleep). */
    slept(hrs) { setAwake(awake + hrs / A.sleepHours); save(); },
    /** Set by main.js: fall asleep now; true if it could (not aboard, seated, busy...). */
    onCollapse: () => false,
    _set(v) { setAwake(v); },
    update(dt) {
      const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; prevH = h;
      if (d < 3) {
        food = Math.max(B.floor, food - d / 24 * B.perDay);
        if (st.playing && !st.inBed) setAwake(Math.max(A.collapse * 0.99, awake - d * A.perHour));
        if ((saveIn -= dt) <= 0) { saveIn = 5; showFood(); save(); }
      }
      if (awake <= A.collapse && st.playing && api.onCollapse()) setAwake(A.collapse + 0.001);   // (sleeping fills it: slept())
      // sleepy: the frame softer in steps (it is re-sized only when a step changes), the eyelids droop now and then
      const k = st.playing && !st.inBed ? clamp((A.slow - awake) / (A.slow - A.collapse)) : 0;
      soft = awake < A.slow && st.playing && !st.inBed ? [0.6, 0.45, 0.34][Math.min(2, Math.floor(k * 3))] : 1;
      lidT += dt * (0.5 + k); const droop = awake < A.slow && st.playing && !st.inBed ? (0.35 + 0.45 * k) * Math.pow(Math.max(0, Math.sin(lidT * 0.9)), 6) + 0.25 * k : 0;
      lids.style.opacity = droop.toFixed(3); st.pace = api.pace;
      const p = st.pos, warm = !st.playing || inCabin(p) || byFire(p) || seasons.season !== 'winter';
      if (warm) { outFor = 0; cold = Math.max(0, cold - dt / B.melt); }
      else if ((outFor += dt) > B.grace) cold = Math.min(1, cold + dt / B.freeze);
      frost.style.opacity = (cold * cold * (3 - 2 * cold)).toFixed(3);
    },
  };
  return api;
}
