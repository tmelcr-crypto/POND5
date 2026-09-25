import { CONFIG } from '../config.js';
import { HOUSE, CB } from '../world/layout.js';
import { canvasTex } from '../core/canvasTexture.js';

/**
 * How the body feels, shown only, never limiting anything:
 *  - hunger (#1): a thin bar under the quick slots that drains over an in-game day (the running clock) and never goes
 *    below CONFIG.body.floor; eating fills it (cooked food more: CONFIG.body.food).
 *  - cold (#2): outdoors in winter frost creeps in from the screen's corners and sides after a while and grows over a
 *    few minutes; near a burning fire, inside the cabin or after something cooked it melts away.
 * Items tell it what was eaten with the 'meadow-eat' event (app/items.js).
 */
export function createBody({ st, clock, seasons, fires }) {
  const B = CONFIG.body, KEY = 'meadow.body';
  let food = 1, cold = 0, outFor = 0, prevH = clock.hours;
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) food = Math.max(B.floor, Math.min(1, +d.food || 1)); } catch (err) { void err; }
  let saveIn = 0; const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ food })); } catch (err) { void err; } };

  /* ---- the hunger bar ---- */
  const bar = document.createElement('div'); bar.id = 'hungerBar'; bar.innerHTML = '<span class="fill"></span>'; bar.setAttribute('aria-label', 'Hunger'); document.body.appendChild(bar);
  const fill = bar.firstChild;
  const showFood = () => { fill.style.width = (food * 100).toFixed(1) + '%'; bar.classList.toggle('low', food < 0.45); };
  showFood();
  addEventListener('meadow-eat', e => { food = Math.min(1, food + (B.food[e.detail] || 0.12)); if (B.warm.includes(e.detail)) cold = Math.max(0, cold - 0.6); showFood(); save(); });

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
  return {
    get food() { return food; }, get cold() { return cold; },
    update(dt) {
      const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; prevH = h;
      if (d < 3) { food = Math.max(B.floor, food - d / 24 * B.perDay); if ((saveIn -= dt) <= 0) { saveIn = 5; showFood(); save(); } }
      const p = st.pos, warm = !st.playing || inCabin(p) || byFire(p) || seasons.season !== 'winter';
      if (warm) { outFor = 0; cold = Math.max(0, cold - dt / B.melt); }
      else if ((outFor += dt) > B.grace) cold = Math.min(1, cold + dt / B.freeze);
      frost.style.opacity = (cold * cold * (3 - 2 * cold)).toFixed(3);
    },
  };
}
