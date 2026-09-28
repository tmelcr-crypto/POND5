import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { H, SEA_Y, coastDist, jettyDist, walkwayDist, firepitDist, WORLD_HALF, KEEPSAKES } from '../world/layout.js';
import { KINDS } from './itemKinds.js';
import { obstacles } from '../world/bounds.js';
import { MESSAGES, messageHtml } from '../story/bottleMessages.js';
import { drawPhoto } from '../assets/story/friendship.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * Captain Elias's messages in bottles (#17; the texts: story/bottleMessages.js, the things: assets/story/friendship.js).
 * Bottles wash up on the island's beaches, above the high-water line, now and then (CONFIG.bottles.every in-game
 * hours, the first soon after you arrive), each with a day you have not read yet, in no order; never more than
 * CONFIG.bottles.onShore lie on the shore at once, and a new one washes up out of your sight. Looking at one, an icon
 * beside it (or T) opens it: the letter unfolds, and it is written into the journal. The journal (the book button at
 * the top left, or J) is there all the time: the days you have, in order, and the gaps.
 *
 * The messages lead here: the old dock is the jetty, the crooked tree stands on the dune beside it, the star is carved
 * in the tree, over the cave's mouth and on a lid under the jetty. Once CONFIG.bottles.reveal messages have been read,
 * a brass key glints at the tree's foot and the lid shows in the sand beneath the jetty's first span; with the key, the
 * icon opens it: the Friendship Chest, and in it the memories of Elias and Arthur (a page in the journal) and an old
 * photograph to keep (for the cabin shelf). All saved in the browser.
 */
const svg = b => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const ICON = {
  bottle: svg('<path d="M10 3h4v3.5c0 .8 2.5 1.8 2.5 4V19a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-8.5c0-2.2 2.5-3.2 2.5-4z"/><path d="M10 13h4M10 16h4"/>'),
  key: svg('<circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10M17 12v3M20 12v2.5"/>'),
  lid: svg('<path d="M3 17h18M5 17v-4h14v4"/><path d="M5 13l3-5h8l3 5"/><circle cx="12" cy="10.5" r="1"/>'),
  journal: svg('<path d="M5 3.5h12a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2z"/><path d="M5 18.5a2 2 0 0 1 2-2h12"/><path d="M9 8h6M9 11h4"/>'),
};
const CHEST_PAGE = `<p>Under the lid, in a hole lined with old boards: the Friendship Chest. The lock is stiff, but the little brass key turns.</p>
<p>No gold. A bundle of photographs, the top one of two boys and a little boat. A drawing of this island in coloured pencil, with a star where the dock is. Letters in two handwritings, tied with string. And a red tin, full of jokes on scraps of paper:</p>
<p><i>Why don't oysters share their pearls? Because they're shellfish.</i><br><i>What do you call a fish with no eyes? A fsh.</i><br><i>Why did the octopus win every fight? It was well armed.</i></p>
<p>On the inside of the lid, carved with a penknife: <b>E + A. Friends for ever. If you found this, the adventure is yours now.</b></p>
<p>You take the photograph, to keep.</p>`;

export function createBottles({ scene, camera, st, inventory, items, hours, things, softDot }) {
  const C = CONFIG.bottles, KEY = 'meadow.bottles', N = MESSAGES.length;
  let S = { found: [], shore: [], next: null, key: false, open: false };
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) S = Object.assign(S, d); } catch (err) { void err; }
  S.found = S.found.filter(i => i >= 0 && i < N); S.shore = S.shore.filter(b => b && b.i >= 0 && b.i < N && !S.found.includes(b.i));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { void err; } };
  const note = (text, ms = 3200) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };
  const revealed = () => S.found.length >= C.reveal;

  /* ---- where bottles wash up: beach spots above the high-water line, all round the island ---- */
  const spots = [], probe = new THREE.Vector3();
  for (let a = 0; a < 360; a += 2) for (let r = 20; r < WORLD_HALF + 5; r += 0.5) {
    const x = Math.cos(a * Math.PI / 180) * r, z = Math.sin(a * Math.PI / 180) * r, c = coastDist(x, z);
    if (c > 4 || c < 1) continue;
    const h = H(x, z); if (h < SEA_Y + CONFIG.tide.amp + 0.08 || h > SEA_Y + 1.0) continue;
    if (jettyDist(x, z) < 2 || walkwayDist(x, z) < 1 || firepitDist(x, z) < 2) continue;
    probe.set(x, -100, z); obstacles.resolve(probe, 0.3); if (probe.x !== x || probe.z !== z) continue;
    spots.push({ x, z }); break;
  }
  /* ---- the bottles on the shore: glass, cork and the rolled letter inside, lying half in the sand ---- */
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x4f8a4a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.7, depthWrite: false });
  const corkMat = new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.9 }), paperMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
  const meshes = [];
  for (let k = 0; k < C.onShore; k++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(things.bottle.paper, paperMat), new THREE.Mesh(things.bottle.cork, corkMat));
    const gl = new THREE.Mesh(things.bottle.glass, glassMat); gl.renderOrder = 2; g.add(gl); g.children.forEach(m => { m.castShadow = true; });
    g.scale.setScalar(1.3); g.visible = false; scene.add(g); meshes.push(g);
  }
  function place() {
    meshes.forEach((g, k) => {
      const b = S.shore[k]; g.visible = !!b; if (!b) return;
      g.position.set(b.x, H(b.x, b.z) + 0.02, b.z); g.rotation.set(Math.PI / 2 - 0.12, 0, 0); g.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), b.r);
    });
  }
  place();
  function washUp() {
    const left = []; for (let i = 0; i < N; i++) if (!S.found.includes(i) && !S.shore.some(b => b.i === i)) left.push(i);
    if (!left.length || S.shore.length >= C.onShore) return false;
    const cam = camera.position, look = new THREE.Vector3(); camera.getWorldDirection(look);
    const ok = spots.filter(s => Math.hypot(s.x - cam.x, s.z - cam.z) > C.away && !S.shore.some(b => Math.hypot(b.x - s.x, b.z - s.z) < C.apart));
    if (!ok.length) return false;
    const behind = ok.filter(s => (s.x - cam.x) * look.x + (s.z - cam.z) * look.z < 0), pool = behind.length ? behind : ok;
    const s = pool[Math.floor(Math.random() * pool.length)];
    S.shore.push({ i: left[Math.floor(Math.random() * left.length)], x: s.x, z: s.z, r: Math.random() * 6.28 }); place(); save(); return true;
  }
  if (S.next === null) S.next = hours.hours + C.first;

  /* ---- the letter and the journal: pages over the scene ---- */
  const view = document.createElement('div'); view.id = 'letterView'; view.className = 'hide'; document.body.appendChild(view);
  let viewing = null;
  function showLetter(i) {
    viewing = 'letter'; view.classList.remove('hide');
    view.innerHTML = `<div class="page"><h2>Day ${i + 1}</h2>${messageHtml(MESSAGES[i])}<div class="foot">Written into your journal · ${S.found.length} of ${N} · tap to close</div></div>`;
  }
  let sel = null;
  const pages = [];   // more pages at the journal's end (addPage): { id, chip, title, html() }
  function showJournal(pick) {
    viewing = 'journal'; view.classList.remove('hide');
    const got = S.found.slice().sort((a, b) => a - b);
    if (pick !== undefined) sel = pick; else if (sel === null || (sel !== 'chest' && !got.includes(sel) && !pages.some(p => p.id === sel))) sel = S.open ? 'chest' : got.length ? got[got.length - 1] : null;
    const chips = Array.from({ length: N }, (_, i) => `<button class="day${got.includes(i) ? '' : ' none'}${sel === i ? ' on' : ''}" data-i="${i}" ${got.includes(i) ? '' : 'disabled'}>${i + 1}</button>`).join('') + (S.open ? `<button class="day chest${sel === 'chest' ? ' on' : ''}" data-i="chest">★</button>` : '') + pages.map(p => `<button class="day page${sel === p.id ? ' on' : ''}" data-i="${p.id}" aria-label="${p.title}">${p.chip}</button>`).join('');
    const pg = pages.find(p => p.id === sel);
    const body = pg ? `<h3>${pg.title}</h3>${pg.html()}` : sel === 'chest' ? `<h3>The Friendship Chest</h3><canvas class="photo" width="320" height="224"></canvas>${CHEST_PAGE}` : sel !== null ? `<h3>Day ${sel + 1}</h3>${messageHtml(MESSAGES[sel])}` : '<p class="empty">No messages yet. Walk the beaches: the sea brings bottles now and then.</p>';
    view.innerHTML = `<div class="page journal"><button class="close" aria-label="Close the journal">×</button><h2>Captain Elias’s messages</h2><div class="sub">${got.length} of ${N} found${revealed() && !S.open ? ' · the old dock, the crooked tree…' : ''}</div><div class="days">${chips}</div><div class="entry">${body}</div></div>`;
    const cv = view.querySelector('canvas.photo'); if (cv) drawPhoto(cv.getContext('2d'), cv.width, cv.height);
  }
  const close = () => { viewing = null; view.classList.add('hide'); };
  view.addEventListener('pointerdown', e => {
    e.stopPropagation();
    const b = e.target.closest && e.target.closest('button');
    if (viewing === 'journal') { if (b && b.classList.contains('close')) { e.preventDefault(); close(); } else if (b && b.dataset.i !== undefined && !b.disabled) { e.preventDefault(); showJournal(b.dataset.i === 'chest' || pages.some(p => p.id === b.dataset.i) ? b.dataset.i : +b.dataset.i); } return; }
    e.preventDefault(); close();
  });
  addEventListener('keydown', e => { if (!viewing || e.repeat) return; if (e.code === 'Escape' || e.code === 'KeyJ' || viewing === 'letter') { e.stopPropagation(); close(); } }, true);
  const btn = document.createElement('button'); btn.id = 'journalBtn'; btn.className = 'glass'; btn.innerHTML = ICON.journal; btn.setAttribute('aria-label', 'Journal'); document.body.appendChild(btn);
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (viewing === 'journal') close(); else showJournal(); });
  addEventListener('keydown', e => { if (e.code === 'KeyJ' && !e.repeat && st.playing && !viewing) showJournal(); });

  /* ---- open a bottle, take the key, open the lid ---- */
  const icon = createActionIcon({ scene, camera, softDot, id: 'bottleIcon' });
  const tmp = new THREE.Vector3();
  function offer() {
    if (!st.playing || !st.walk || st.aboard || st.seat || st.inBed || st.chestOpen || viewing) return null;
    for (let k = 0; k < S.shore.length; k++) { const b = S.shore[k]; tmp.set(b.x, H(b.x, b.z) + 0.05, b.z); if (lookingAt(camera, tmp, C.reach, 0.4)) return { what: 'bottle', k, at: tmp.clone() }; }
    if (revealed() && !S.key && lookingAt(camera, things.keyAt, C.reach, 0.35)) return { what: 'key', at: things.keyAt };
    if (revealed() && !S.open && lookingAt(camera, things.lidAt, C.reach + 0.4, 0.4)) return { what: 'lid', at: things.lidAt };
    return null;
  }
  function act() {
    const o = offer(); if (!o) return;
    if (o.what === 'bottle') {
      const b = S.shore.splice(o.k, 1)[0]; S.found.push(b.i); place(); save(); items.sfx('pop');
      showLetter(b.i);
      if (S.found.length === C.reveal) setTimeout(() => note('Fifteen messages. The old dock, the crooked tree: maybe it is time to look', 5000), 400);
      things.reveal(revealed(), S.key, S.open);
    } else if (o.what === 'key') {
      if (!inventory.canAdd('brassKey')) { note('No room for the key'); return; }
      S.key = true; save(); inventory.add('brassKey'); items.sfx('pop'); things.reveal(revealed(), S.key, S.open);
      note('A small brass key, a star scratched on it', 3600);
    } else {
      if (!inventory.count(['brassKey'])) { note('A wooden lid in the sand, locked. The keyhole has a little star beside it', 4200); items.sfx('thud'); return; }
      if (!inventory.canAdd('oldPhotograph')) { note('No room to take anything out'); return; }
      inventory.take(['brassKey'], 1); inventory.add('oldPhotograph'); S.open = true; save(); items.sfx('crank');
      things.reveal(true, S.key, true); setTimeout(() => showJournal('chest'), 700);
    }
  }
  icon.onPress = act;
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing && !viewing) act(); });
  things.reveal(revealed(), S.key, S.open);

  return {
    update(dt, t) {
      if (hours.hours >= S.next) { washUp(); S.next = hours.hours + C.every * (0.6 + 0.8 * Math.random()); save(); }
      const o = offer(), lab = o ? { bottle: 'Open the bottle', key: 'Take the brass key', lid: 'Lift the lid' }[o.what] : '';
      icon.show(o ? o.at : null, o ? o.what + (o.k || 0) : null, o ? ICON[o.what] : '', lab, t);
    },
    washUp, get state() { return { found: S.found.slice(), shore: S.shore.map(b => ({ ...b })), key: S.key, open: S.open, spots: spots.length }; },
    get viewing() { return viewing; },
    /** A page of its own at the journal's end (its chip after the days). */
    addPage(p) { pages.push(p); },
    showJournal,
    /** For testing: mark messages read. */
    _read(list) { list.forEach(i => { if (!S.found.includes(i)) S.found.push(i); }); save(); things.reveal(revealed(), S.key, S.open); },
  };
}

/** The journal's page of the keepsakes hidden round the island (items.keepsakes(): which are found): each found one by
 *  name, each still hidden by its hint. */
export function keepsakePage(items) {
  return {
    id: 'keepsakes', chip: '◆', title: 'Keepsakes',
    html() {
      const f = items.keepsakes().found, hint = k => (KEEPSAKES.find(q => q.kind === k) || {}).hint || '';
      return `<p>Ten old things are hidden round the island, for the shelves in the cabin. ${f.length} of ${KEEPSAKES.length} found.</p><ul class="keeps">${KEEPSAKES.map(q => f.includes(q.kind) ? `<li class="got">${KINDS[q.kind].name}</li>` : `<li><i>${hint(q.kind)}</i></li>`).join('')}</ul>`;
    },
  };
}
