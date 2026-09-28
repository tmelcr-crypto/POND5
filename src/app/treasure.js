import { CONFIG } from '../config.js';
import { SEA_Y, TREEHOUSE, ISLET, TREASURE, CAVE, STONES, JETTY, HOUSE, LAKE, coastDist, forest, isletH, FOOTPATH } from '../world/layout.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * The treasure map and the buried chest (#16; the things: assets/cabin/treasureChest.js). An old map lies rolled up on
 * the crate in the treehouse: looking at it there, an icon beside it (or T) takes it. Selected, the Use button says Read
 * and opens it: the island drawn by hand, its paths, the pond and the cabin, the stones, the treehouse, the cave and
 * the islet, with a red X by the islet's cairn (tap anywhere or any key closes it; it is not used up). Once it has been
 * read, a mound of loose sand shows at the X; there, the icon digs by hand (no shovel): three scoops, and a small chest
 * comes up, its lid thrown open on a heap of old gold coins, which the icon then takes (a keepsake for the cabin shelf).
 * What has happened is saved in the browser.
 */
const ICON = {
  take: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5l5-2 6 2 5-2v15l-5 2-6-2-5 2z"/><path d="M9 3.5v15M15 5.5v15"/></svg>',
  dig: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h18"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/><path d="M12 3v7M9 7l3 3 3-3"/></svg>',
  coins: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="8" rx="6" ry="2.6"/><path d="M6 8v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V8"/><path d="M6 12v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4"/></svg>',
};

export function createTreasure({ scene, camera, st, inventory, items, things, softDot }) {
  const KEY = 'meadow.treasure', eye = CONFIG.player.eyeHeight;
  let S = { map: false, read: false, dug: false, coins: false };
  try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { void err; } };
  const icon = createActionIcon({ scene, camera, softDot, id: 'treasureIcon' });
  const note = (text, ms = 3200) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };
  const show = () => { things.scroll.visible = !S.map; things.pile.visible = S.read && !S.dug; things.chest.visible = S.dug; things.coins.visible = S.dug && !S.coins; };
  show();

  /* ---- the map, drawn once on first reading ---- */
  const view = document.createElement('div'); view.id = 'mapView'; view.className = 'hide'; document.body.appendChild(view);
  const cv = document.createElement('canvas'); cv.width = cv.height = 640; view.appendChild(cv);
  const cap = document.createElement('div'); cap.className = 'mapCap'; cap.textContent = 'Tap to fold the map'; view.appendChild(cap);
  let drawn = false;
  function draw() {
    const g = cv.getContext('2d'), N = cv.width, E = 50, k = N / (2 * E), px = x => (x + E) * k, pz = z => (z + E) * k;
    let s = 5; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    // parchment
    g.fillStyle = '#e4d3a8'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${120 + rnd() * 60 | 0},${90 + rnd() * 40 | 0},${50 + rnd() * 30 | 0},${rnd() * 0.08})`; g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 10, 1 + rnd() * 4); }
    const edge = g.createRadialGradient(N / 2, N / 2, N * 0.3, N / 2, N / 2, N * 0.72); edge.addColorStop(0, 'rgba(90,60,30,0)'); edge.addColorStop(1, 'rgba(90,60,30,0.45)'); g.fillStyle = edge; g.fillRect(0, 0, N, N);
    const ink = a => `rgba(70,45,25,${a})`;
    // the sea: wavy strokes; the island and the islet: their coasts in ink, a wash of land colour
    const land = (x, z) => coastDist(x, z) > 0 || isletH(x, z) > SEA_Y;
    g.fillStyle = 'rgba(160,140,90,0.35)';
    for (let j = 0; j < N; j += 4) for (let i = 0; i < N; i += 4) { const x = i / k - E, z = j / k - E; if (land(x, z)) g.fillRect(i, j, 4, 4); }
    g.fillStyle = 'rgba(60,90,50,0.22)';   // woods
    for (let j = 0; j < N; j += 8) for (let i = 0; i < N; i += 8) { const x = i / k - E, z = j / k - E; if (coastDist(x, z) > 0 && forest(x, z) > 0.45 && rnd() < 0.7) { g.beginPath(); g.moveTo(i, j + 5); g.lineTo(i + 3, j - 2); g.lineTo(i + 6, j + 5); g.fill(); } }
    g.strokeStyle = ink(0.8); g.lineWidth = 2;
    for (const [cx, cz, test] of [[0, 0, (x, z) => coastDist(x, z) > 0], [ISLET.x, ISLET.z, (x, z) => isletH(x, z) > SEA_Y]]) {
      g.beginPath();
      for (let a = 0; a <= 6.3; a += 0.02) { let r = 0; while (r < 60 && test(cx + Math.cos(a) * (r + 0.25), cz + Math.sin(a) * (r + 0.25))) r += 0.25; const x = px(cx + Math.cos(a) * r), y = pz(cz + Math.sin(a) * r); a ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.stroke();
    }
    g.strokeStyle = ink(0.25); g.lineWidth = 1;
    for (let i = 0; i < 70; i++) { const x = rnd() * N, y = rnd() * N; if (land(x / k - E, y / k - E) || land(x / k - E + 3, y / k - E)) continue; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 5, y - 4, x + 10, y); g.quadraticCurveTo(x + 15, y + 4, x + 20, y); g.stroke(); }
    // the paths: dotted
    g.fillStyle = ink(0.55); FOOTPATH.stones.forEach((s2, i) => { if (i % 2) return; g.beginPath(); g.arc(px(s2.x), pz(s2.z), 1.3, 0, 6.28); g.fill(); });
    // the pond, the cabin, the jetty
    g.fillStyle = 'rgba(80,110,130,0.5)'; g.beginPath(); g.ellipse(px(LAKE.x), pz(LAKE.z), 1.9 * k, 1.5 * k, 0, 0, 6.28); g.fill();
    g.fillStyle = ink(0.8); g.fillRect(px(HOUSE.x) - 5, pz(HOUSE.z) - 4, 10, 8); g.beginPath(); g.moveTo(px(HOUSE.x) - 7, pz(HOUSE.z) - 4); g.lineTo(px(HOUSE.x), pz(HOUSE.z) - 10); g.lineTo(px(HOUSE.x) + 7, pz(HOUSE.z) - 4); g.fill();
    g.strokeStyle = ink(0.8); g.lineWidth = 3; g.beginPath(); g.moveTo(px(JETTY.x0), pz(JETTY.z)); g.lineTo(px(JETTY.x1), pz(JETTY.z)); g.stroke();
    // the stones, the treehouse, the cave
    g.lineWidth = 1.5; for (const s2 of STONES.stones) { g.beginPath(); g.arc(px(s2.x), pz(s2.z), 2.2, 0, 6.28); g.stroke(); }
    { const x = px(TREEHOUSE.x), y = pz(TREEHOUSE.z); g.strokeRect(x - 5, y - 5, 10, 8); g.beginPath(); g.moveTo(x - 7, y - 5); g.lineTo(x, y - 11); g.lineTo(x + 7, y - 5); g.moveTo(x - 4, y + 3); g.lineTo(x - 4, y + 10); g.moveTo(x + 4, y + 3); g.lineTo(x + 4, y + 10); g.stroke(); }
    { const x = px(CAVE.x), y = pz(CAVE.z); g.beginPath(); g.arc(x, y, 10, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.beginPath(); g.arc(x, y + 2, 4, Math.PI, 0); g.stroke(); }
    // the X
    g.strokeStyle = 'rgba(160,30,25,0.9)'; g.lineWidth = 4; g.lineCap = 'round'; const tx = px(TREASURE.x), ty = pz(TREASURE.z);
    g.beginPath(); g.moveTo(tx - 9, ty - 9); g.lineTo(tx + 9, ty + 9); g.moveTo(tx + 9, ty - 9); g.lineTo(tx - 9, ty + 9); g.stroke();
    g.setLineDash([3, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(px(JETTY.x1), pz(JETTY.z)); g.quadraticCurveTo(px(JETTY.x1 + 2), pz(-32), tx - 6, ty + 14); g.stroke(); g.setLineDash([]);
    // a compass rose, a title
    { const x = N * 0.14, y = N * 0.84; g.strokeStyle = ink(0.8); g.fillStyle = ink(0.8); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 22, 0, 6.28); g.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.lineTo(x + Math.cos(a + 0.35) * 8, y + Math.sin(a + 0.35) * 8); g.lineTo(x + Math.cos(a - 0.35) * 8, y + Math.sin(a - 0.35) * 8); g.fill(); } }
    g.fillStyle = ink(0.85); g.font = 'italic 600 30px Georgia, serif'; g.textAlign = 'center'; g.fillText('Where the cairn keeps watch', N / 2, 48);
    g.font = 'italic 18px Georgia, serif'; g.fillText('three paces toward the sunrise sea', N / 2, 74);
    drawn = true;
  }
  let open = false;
  const setOpen = on => { open = on; if (on && !drawn) draw(); view.classList.toggle('hide', !on); };
  view.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setOpen(false); });
  addEventListener('keydown', e => { if (open && !e.repeat) setOpen(false); }, true);

  /* ---- reading it: the Use button (chained like the shelf's Place) ---- */
  const prevLabel = inventory.useLabel, prevUse = inventory.onUse;
  inventory.useLabel = kind => (kind === 'map' ? 'Read' : prevLabel(kind));
  inventory.onUse = kind => {
    if (kind !== 'map') return prevUse(kind);
    setOpen(true);
    if (!S.read) { S.read = true; save(); show(); }
    return false;   // kept: you can read it again
  };

  /* ---- take the map, dig, take the coins ---- */
  const idle = () => st.playing && st.walk && !st.aboard && !st.seat && !st.inBed && !st.chestOpen && !job && !open;
  function offer() {
    if (!idle()) return null;
    if (!S.map && Math.abs(st.pos.y - eye - TREEHOUSE.deck) < 0.4 && lookingAt(camera, things.mapAt, 1.8, 0.45)) return 'take';
    if (S.read && !S.dug && st.grounded && lookingAt(camera, things.pileAt, 2.0, 0.5)) return 'dig';
    if (S.dug && !S.coins && st.grounded && lookingAt(camera, things.chestAt, 2.0, 0.5)) return 'coins';
    return null;
  }
  let job = null;
  function act() {
    const k = offer(); if (!k) return;
    if (k === 'take') {
      if (!inventory.canAdd('map')) { note('No room for the map'); return; }
      S.map = true; save(); show(); inventory.add('map'); items.sfx('pop');
      note('An old map, rolled and tied. Select it and Read it');
    } else if (k === 'dig') {
      job = { t: 0, base: st.pos.clone(), scoops: 0 }; st.vel.set(0, 0, 0);
    } else {
      if (!inventory.canAdd('goldCoins')) { note('No room for the coins'); return; }
      S.coins = true; save(); show(); inventory.add('goldCoins'); items.sfx('pop');
      note('Old gold coins! Put them on the shelf in the cabin', 4200);
    }
  }
  icon.onPress = act;
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing) act(); });
  const DIG = 3.0, pile0 = things.pile.scale.clone();
  return {
    /** Digging has the camera while it plays (a takeover, app/controls.js): three scoops, then the chest comes up. */
    takeover(dt) {
      if (!job) return false;
      job.t += dt; const k = Math.min(1, job.t / DIG), ph = (k * 3) % 1, dip = Math.sin(ph * Math.PI) * 0.55;
      camera.position.set(job.base.x, job.base.y - 0.35 - dip, job.base.z); camera.rotation.set(Math.min(st.pitch, -0.6) - 0.25 * Math.sin(ph * Math.PI), st.yaw, 0);
      if (Math.floor(k * 3) > job.scoops && job.scoops < 3) { job.scoops++; items.sfx('dig'); }
      things.pile.scale.set(pile0.x * (1 - k * 0.7), pile0.y * (1 - k * 0.9), pile0.z * (1 - k * 0.7));
      if (k >= 1) {
        job = null; S.dug = true; save(); show(); things.pile.scale.copy(pile0); items.sfx('thud');
        note('A little chest, full of old gold coins!', 3600); camera.position.copy(st.pos);
      }
      return true;
    },
    update(dt, t) { const k = offer(); icon.show(k ? (k === 'take' ? things.mapAt : k === 'dig' ? things.pileAt : things.chestAt) : null, k, ICON[k === 'take' ? 'take' : k === 'dig' ? 'dig' : 'coins'], k === 'take' ? 'Take the map' : k === 'dig' ? 'Dig here' : 'Take the coins', t); },
    get state() { return { ...S }; },
    get open() { return open; },
  };
}
