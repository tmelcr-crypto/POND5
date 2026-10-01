import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { KINDS } from './itemKinds.js';
import { CHAPTERS, FLASHBACKS, LETTERS, SON, STORY_DAYS } from '../story/content.js';
import { radioSite, insideSpot, letterSites } from '../story/sites.js';
import { HOUSE, CB, BED, JETTY, LIGHTHOUSE, ISLET, ISLANDS, EMBER, LAVA_TUBE, CAVERNS, STONES, BENCHES, WELL, GARDEN, LAKE, STORY, BRIDGE, CHESTS, treehouseDeckY, underground, jettyDeckY, seaY } from '../world/layout.js';
import { buildingAt, buildingPlans } from '../world/buildingPlans.js';
import { createSeaplane } from '../assets/water/seaplane.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * Story mode (story/content.js has the words): "The Letters". Chosen on the start screen (Begin / Continue the story;
 * Start exploring plays freely, as before). You wake on a winter night in the cabin, remembering nothing. Each story
 * day has one to three tasks (a small list on screen, ticked off as you go, and the Story page in the journal); when all
 * are done, the next sleep begins the next day, its first thought told on waking, and on chosen days a flashback (a
 * placeholder picture for now) comes back. The world's season follows the story's calendar (ten days a season, twenty
 * seasons). Letters appear in the world from the day they are needed (app/letters.js). The last chapters mend the radio
 * in the lighthouse (four parts from the four islands' houses), call your son Tomas on it, and end on the home jetty as
 * his seaplane lands. While the story runs, the ordinary daily tasks (app/dailyTasks.js) rest. Saved in the browser;
 * the panel's Story day box jumps to any day (for checking).
 */
const COOKED = Object.values(KINDS).map(k => k.cook).filter(Boolean);
const GROUPS = { fish: ['fish', 'goldenFish'], shell: ['shell', 'rareShell'], harvest: ['carrot', 'potato', 'pumpkin', 'onion', 'lettuce', 'beans', 'strawberry'], cooked: COOKED, mushroom: ['mushroom'] };
const PARTS = [['radioValve', 'windmill'], ['copperCoil', 'lodge'], ['aerialWire', 'hut'], ['battery', 'observatory']];
const RADIO_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5h17v10h-17z"/><circle cx="8.5" cy="14.5" r="2.6"/><path d="M14 12.5h4M14 15h4M14 17.5h2.5"/><path d="M6 9.5L17 3.5"/></svg>';

export function createStory(D) {
  const { scene, camera, st, setHours, scheduleEnv, seasons, inventory, items, fires, bottles, letters, flying, boating, telescope, fuelQuest, dailyTasks, softDot, skyUniforms, ctx } = D;
  const KEY = 'meadow.story', PC = CONFIG.player;
  const DAYS = CHAPTERS.flatMap((ch, c) => ch.days.map((d, k) => ({ ...d, c, k, n: c * 10 + k + 1, tasks: d.tasks.map(parse) })));
  let S = fresh(); let on = false;   // on: playing the story this session
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.started) S = { ...fresh(), ...d }; } catch (err) { void err; }
  function fresh() { return { started: false, day: 1, p: {}, seen: [], ended: false, radio: false, sail: 0 }; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { void err; } };
  const note = (t, ms = 5200) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = t; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };
  const today = () => DAYS[Math.min(S.day, STORY_DAYS) - 1];

  /* ---- places ---- */
  const sites = letterSites(), site = id => sites.find(s => s.id === id);
  DAYS.forEach(d => d.tasks.forEach(t => { if (t.type === 'letter' && !t.own) { const L = LETTERS.find(q => q.id === t.arg), s = L && site(L.site); if (s) t.text = `Find the letter ${s.name}`; } }));   // (where it lies)
  const plans = buildingPlans(), isle = k => ISLANDS.find(I => I.kind === k), cove = site('cove'), radio = radioSite();
  const near = (x, z, r) => p => Math.hypot(p.x - x, p.z - z) < r;
  const inHouse = kind => p => { const P = buildingAt(p.x, p.z); return !!P && P.kind === kind; };
  const onIsle = k => { const I = isle(k); return near(I.x, I.z, I.r * 1.15); };
  const PLACES = {
    cabin: p => Math.abs(p.x - HOUSE.x) < CB.XW && Math.abs(p.z - HOUSE.z) < CB.ZW, bed: near(BED.cx, BED.cz, 1.8),
    porch: near(HOUSE.x + 1.0, HOUSE.z + CB.ZW + 0.9, 2.6), well: near(WELL.x, WELL.z, 3), garden: near(GARDEN.x, GARDEN.z, 6), pond: near(LAKE.x, LAKE.z, 4.2),
    sunrise: near(BENCHES[0].x, BENCHES[0].z, 3), sunset: near(BENCHES[1].x, BENCHES[1].z, 3), jetty: p => jettyDeckY(p.x, p.z) > -1e9 && p.x > JETTY.head.x0 - 2 && p.x < JETTY.x1 + 1 && Math.abs(p.z - JETTY.z) < 3,
    stones: near(STONES.x, STONES.z, STONES.r + 1), treehouse: p => p.y - treehouseDeckY(p.x, p.z) < 2 && p.y - treehouseDeckY(p.x, p.z) > -0.5,
    caverns: p => underground(p.x, p.z, p.y), crystal: p => underground(p.x, p.z, p.y) && Math.hypot(p.x - CAVERNS.halls[1].x, p.z - CAVERNS.halls[1].z) < 5.5,
    crooked: near(STORY.tree.x, STORY.tree.z, 4), bridge: near(BRIDGE.x, BRIDGE.z, 3), southBeach: near(8.7, 27.5, 9), northBeach: near(-16.8, -31.1, 9),
    islet: p => Math.hypot(p.x - ISLET.x, p.z - ISLET.z) < ISLET.r * 0.85 && !st.aboard,
    lighthouse: near(LIGHTHOUSE.x, LIGHTHOUSE.z, 14), lighthouseTop: p => p.y > LIGHTHOUSE.tower.topY - 0.3 && Math.hypot(p.x - LIGHTHOUSE.tower.x, p.z - LIGHTHOUSE.tower.z) < 3.2,
    lighthouseRadio: p => Math.hypot(p.x - radio.x, p.z - radio.z) < 2.2 && Math.abs(p.y - LIGHTHOUSE.tower.floor) < 1,
    millholm: onIsle('meadow'), palm: onIsle('palm'), ember: onIsle('volcano'), marsh: onIsle('marsh'),
    windmill: inHouse('windmill'), hut: inHouse('hut'), observatory: inHouse('observatory'), lodge: inHouse('lodge'),
    spring: near(EMBER.spring.x, EMBER.spring.z, EMBER.spring.r + 2.6), emberPit: near(EMBER.pit.x, EMBER.pit.z, EMBER.pit.r + 1),
    lavaHall: p => underground(p.x, p.z, p.y) && Math.hypot(p.x - LAVA_TUBE.halls[0].x, p.z - LAVA_TUBE.halls[0].z) < 5.5, cove: near(cove.x, cove.z, 9),
    codeChest: near(CHESTS[1].x, CHESTS[1].z, 2.6), home: near(0, 0, 52),
  };
  // where the boat or the plane counts as having got there (centre, radius)
  const AREA = { islet: [ISLET.x, ISLET.z, 18], lighthouse: [LIGHTHOUSE.x - 6, LIGHTHOUSE.z, 26], cove: [cove.x, cove.z, 16], home: [0, 0, 60] };
  ISLANDS.forEach(I => { AREA[{ meadow: 'millholm', palm: 'palm', volcano: 'ember', marsh: 'marsh' }[I.kind]] = [I.x, I.z, I.r * 1.5 + 18]; });
  const inArea = (k, x, z) => { const a = AREA[k]; return a && Math.hypot(x - a[0], z - a[1]) < a[2]; };

  /* ---- tasks: 'type:arg:n|text' ---- */
  function parse(spec) {
    const [code, text] = spec.split('|'), [type, arg, n] = code.split(':');
    const t = { type, arg, n: 1, text, own: !!text };
    if (type === 'add') { t.kinds = GROUPS[arg] || arg.split(','); t.n = +n || 1; }
    if (type === 'eat' || type === 'sow') t.n = +arg || 1;
    if (!t.text) t.text = type === 'letter' ? 'Find the next letter' : spec;
    return t;
  }
  const prog = i => S.p[i] || 0, done = (t, i) => prog(i) >= t.n;
  function bump(i, k = 1) {
    const d = today(), t = d.tasks[i]; if (!t || done(t, i)) return;
    S.p[i] = Math.min(t.n, prog(i) + k); save(); hud();
    if (done(t, i)) { items.sfx('rareShell'); if (d.tasks.every(done)) { note(d.n >= STORY_DAYS ? '…' : 'Everything for today is done. Sleep when you are ready: tomorrow brings the next day.', 5200); } else note(`Done: ${t.text.replace(/^./, c => c.toLowerCase())} ✓`, 3600); }
  }
  /** Each of today's tasks of this type (and arg), with its index. */
  const each = (type, f) => { if (!on || S.ended) return; today().tasks.forEach((t, i) => { if (t.type === type && !done(t, i)) f(t, i); }); };

  // things picked up or made
  const addPrev = inventory.add;
  inventory.add = kind => { const r = addPrev(kind); if (r && !st.chestOpen) each('add', (t, i) => { if (t.kinds.includes(kind)) bump(i); }); return r; };
  addEventListener('meadow-eat', () => each('eat', (t, i) => bump(i)));
  const usePrev = inventory.onUse;
  inventory.onUse = kind => { const r = usePrev(kind); if (r && KINDS[kind] && KINDS[kind].use === 'sow') each('sow', (t, i) => bump(i)); return r; };
  addEventListener('meadow-letter', e => each('letter', (t, i) => { if (t.arg === e.detail) bump(i); }));
  addEventListener('meadow-plane-refuel', () => each('refuel', (t, i) => bump(i)));

  /* ---- the radio in the lighthouse, its parts in the four houses ---- */
  (() => {   // the radio set on the keeper's table
    const g = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a4a3c, roughness: 0.6, metalness: 0.2 }));
    box.position.y = 0.11; g.add(box);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: 0.35, metalness: 0.7 })); dial.position.set(-0.08, 0.12, 0.105); g.add(dial);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.9 })); grille.position.set(0.09, 0.12, 0.101); g.add(grille);
    const aer = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.3 })); aer.position.set(0.15, 0.45, -0.06); aer.rotation.z = -0.35; g.add(aer);
    g.position.set(radio.x, radio.y, radio.z); g.rotation.y = radio.rot; scene.add(g); return g;
  })();
  const radioAt = new THREE.Vector3(radio.x, radio.y + 0.15, radio.z);
  const partMeshes = {};
  PARTS.forEach(([kind, house], i) => {
    const P = plans.find(q => q.kind === house), q = P && insideSpot(P, 0.9, -1.3); if (!q) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: KINDS[kind].color, roughness: 0.5, metalness: 0.3 }));
    m.position.set(q.x, q.y + 0.04, q.z); m.rotation.y = i; m.visible = false; scene.add(m); m.updateMatrixWorld();
    partMeshes[kind] = { m, at: m.position.clone(), added: false };
  });
  function partsOut() {   // a part is out from its day on (and stays where it is until taken)
    PARTS.forEach(([kind]) => { const q = partMeshes[kind]; if (!q || q.added) return; const day = DAYS.find(d => d.tasks.some(t => t.type === 'add' && t.kinds.includes(kind)));
      if (on && day && S.day >= day.n) { q.added = true; q.m.visible = true; items.addThing('story_' + kind, kind, q.at, q.m); } });
  }
  const icon = createActionIcon({ scene, camera, softDot, id: 'radioIcon', glow: 0.35 });
  let radioNear = false;
  icon.onPress = useRadio;
  addEventListener('meadow-tap', e => { if (radioNear && e.detail !== 'touch') useRadio(); });
  const LISTEN = [
    ['…crackle… shipping forecast… northerly four or five… good, occasionally poor…', 'A fishing boat calling its harbour, patient, over and over.'],
    ['…a weather report for the islands: fog in the morning, clearing…', 'Music, very faint, from somewhere warm.'],
    ['Under the static, a voice says a name that is almost yours.', 'Then the mark on the dial catches the lamp light.'],
  ];
  function useRadio() {
    const d = today(); let acted = false;
    each('radio', (t, i) => {
      if (acted) return; acted = true;
      if (t.arg === 'fix') {
        const need = PARTS.map(([k]) => k); if (!need.every(k => inventory.count([k]))) { note('You need a valve, a copper coil, aerial wire and a battery. The four islands\' houses keep spares.'); return; }
        need.forEach(k => inventory.take([k], 1)); S.radio = true; save(); items.sfx('crank'); bump(i); note('Valve in, coil in, the aerial wire up the window frame, the battery clipped on. A hum. A green glow behind the dial.', 6000);
      } else if (t.arg === 'listen') { if (!S.radio) { note('The radio is dead. It needs mending first.'); return; } const L = LISTEN[(d.n * 7) % LISTEN.length]; page('The radio', L, () => bump(i)); }
      else if (t.arg === 'call') { if (!S.radio) { note('The radio is dead. It needs mending first.'); return; } call(() => bump(i)); }
    });
  }
  const CALL = [
    'You turn the big dial to the mark scratched in the brass. Static. A click. A long hum.',
    '"…Hello? Who is this?"',
    `"${SON}? It's me."`,
    'Silence. Breathing, a long way off.',
    '"…I know. I know your voice."',
    '"I forgot a lot of things. Nearly everything. But I remembered you. I\'m sorry it took me so long to call."',
    '"Are you all right? Where are you?"',
    '"On the island. I\'m all right. Will you come? Just to visit."',
    '"…Give me a little time to sort things out. I\'ll fly out. In the autumn. I\'ll bring the kids next time."',
    '"I\'ll be on the jetty."',
    '"Over."',
    '"Loud and clear."',
  ];
  function call(then) { let k = 0; const next = () => { if (k >= CALL.length) { closeView(); then(); return; } showView(`<div class="page radio"><h2>The call</h2><p>${CALL[k++]}</p><div class="foot">tap to go on</div></div>`, next); }; next(); }

  /* ---- pages over the scene: the opening, the radio, flashbacks, the end ---- */
  const view = document.createElement('div'); view.id = 'storyPage'; view.className = 'hide'; document.body.appendChild(view);
  let onTap = null, tapAfter = 0;
  function showView(html, tap, wait = 0.6) { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); view.innerHTML = html; view.classList.remove('hide'); onTap = tap; tapAfter = performance.now() + wait * 1000; st.chestOpen = true; }
  function closeView() { view.classList.add('hide'); onTap = null; st.chestOpen = false; }
  view.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (performance.now() < tapAfter) return; const f = onTap; if (f) f(); else closeView(); });
  addEventListener('keydown', e => { if (!view.classList.contains('hide') && !e.repeat && performance.now() >= tapAfter) { e.stopPropagation(); const f = onTap; if (f) f(); else closeView(); } }, true);
  const page = (title, lines, then) => showView(`<div class="page radio"><h2>${title}</h2>${lines.map(l => `<p>${l}</p>`).join('')}<div class="foot">tap to close</div></div>`, () => { closeView(); if (then) then(); });

  /** A placeholder picture for a flashback: a sepia, soft-focus card with its number (later: the real picture or video). */
  function placeholder(fb, i) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 400; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 640, 400); gr.addColorStop(0, '#d9c29a'); gr.addColorStop(1, '#8a6a46'); g.fillStyle = gr; g.fillRect(0, 0, 640, 400);
    let h = (i + 1) * 2654435761 >>> 0; const r = () => ((h = Math.imul(h ^ h >>> 15, 2246822519) >>> 0) / 4294967296);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(${60 + r() * 80 | 0},${40 + r() * 50 | 0},${20 + r() * 30 | 0},${0.08 + r() * 0.12})`; g.beginPath(); g.arc(r() * 640, r() * 400, 30 + r() * 120, 0, 7); g.fill(); }
    const v = g.createRadialGradient(320, 200, 120, 320, 200, 380); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(30,18,8,.65)'); g.fillStyle = v; g.fillRect(0, 0, 640, 400);
    g.fillStyle = 'rgba(255,245,225,.85)'; g.font = 'italic 28px Georgia, serif'; g.textAlign = 'center'; g.fillText(fb.title, 320, 190); g.font = '15px Georgia, serif'; g.fillText(`Flashback ${i + 1} of ${FLASHBACKS.length} · picture to come`, 320, 222);
    return c.toDataURL('image/jpeg', 0.8);
  }
  function flashback(id, then) {
    const i = FLASHBACKS.findIndex(f => f.id === id), fb = FLASHBACKS[i]; if (!fb) { if (then) then(); return; }
    if (!S.seen.includes(id)) { S.seen.push(id); save(); }
    showView(`<div class="flash"><img src="${fb.image || placeholder(fb, i)}" alt="${fb.picture.replace(/"/g, '&quot;')}"><h2>${fb.title}</h2><p>${fb.caption}</p><p class="ph">Placeholder: ${fb.picture}</p><div class="foot">a memory comes back · tap to close</div></div>`, () => { closeView(); if (then) then(); }, 1.5);
  }

  /* ---- the day's list on screen ---- */
  const hudEl = document.createElement('div'); hudEl.id = 'storyHud'; hudEl.className = 'glass hide'; document.body.appendChild(hudEl);
  let small = false; hudEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); small = !small; hud(); });
  function hud() {
    hudEl.classList.toggle('hide', !on || !st.playing);
    if (!on) return;
    if (S.ended) { hudEl.innerHTML = '<b>The End</b>'; return; }
    const d = today(), ch = CHAPTERS[d.c];
    hudEl.innerHTML = `<div class="hd">Day ${d.n} · ${ch.title}</div>` + (small ? '' : `<ul>${d.tasks.map((t, i) => `<li class="${done(t, i) ? 'done' : ''}">${t.text}${t.n > 1 && !done(t, i) ? ` <i>${prog(i)}/${t.n}</i>` : ''}</li>`).join('')}</ul>`);
  }

  /* ---- days ---- */
  const firstDay = {};   // letter id -> the story day it is first needed
  DAYS.forEach(d => d.tasks.forEach(t => { if (t.type === 'letter' && !firstDay[t.arg]) firstDay[t.arg] = d.n; }));
  function applyWorld() {   // the season (and its day) of the story's calendar; the letters and parts that are out by now
    const d = today(), ch = CHAPTERS[d.c];
    if (seasons.season !== ch.season || Math.floor(seasons.days) !== d.k) seasons.set(ch.season, d.k);
    letters.visible = L => on ? (S.ended || (firstDay[L.id] && S.day >= firstDay[L.id])) : !!L.code;
    partsOut();
  }
  function beginDay(announce) {
    S.p = {}; S.sail = 0; save(); applyWorld(); hud();
    const d = today(); if (!announce) return;
    const tell = () => note(`Day ${d.n}. ${d.say}`, 7000);
    if (d.flash && !S.seen.includes(d.flash)) setTimeout(() => flashback(d.flash, tell), 1200); else setTimeout(tell, 900);
  }
  /** After a night's sleep (app/sleeping.js afterTimeJump): the sleep tasks, then the next day if today is done. */
  function slept() {
    if (!on || S.ended) return;
    const p = { x: st.pos.x, z: st.pos.z, y: st.pos.y - PC.eyeHeight };
    each('sleep', (t, i) => { if ((t.arg === 'cabin' && PLACES.cabin(p)) || (t.arg === 'observatory' && PLACES.observatory(p))) bump(i); });
    const d = today();
    if (d.tasks.every(done) && d.n < STORY_DAYS) { S.day++; beginDay(true); }
    else { applyWorld(); if (!d.tasks.every(done)) setTimeout(() => note(`Day ${d.n} is not over yet: ${d.tasks.filter((t, i) => !done(t, i)).map(t => t.text.toLowerCase()).join('; ')}.`, 6500), 900); }
  }

  /* ---- the son's seaplane: in from the east, down onto the water, up to the jetty ---- */
  let arrival = null;
  const sonPlane = createSeaplane(ctx, { cream: 0xe9eef2, red: 0x1d5a8a, navy: 0x203040 }); sonPlane.group.visible = false;   // (built now, hidden: no hitch when it comes)
  function startEnding() {
    if (arrival) return; S.ended = true; save(); hud();
    const plane = sonPlane; plane.group.visible = true;
    const path = [[260, 6, 40], [150, -8, 18], [100, -12, 0.0], [64, -15, 0], [54, -19.5, 0]];   // (it stops off the head's end, clear of your own plane's wing)   // x, z, height over the sea (0: on the water)
    arrival = { plane, t: 0, path, end: 0 };
    note('A sound in the sky, from the east. A small seaplane, coming in low over the lighthouse rock.', 7000);
  }
  function updateArrival(dt) {
    const A = arrival; if (!A) return; A.t += dt;
    // segments: 0-1 flying (10 s), 1-2 descending to touch down (8 s), 2-3 running out on the water (9 s), 3-4 taxiing to the jetty (8 s)
    const D = [10, 8, 9, 8], tot = D.reduce((a, b) => a + b, 0); let t = Math.min(A.t, tot), i = 0; while (i < D.length - 1 && t > D[i]) { t -= D[i]; i++; }
    const k = Math.min(1, t / D[i]), s = i === 2 ? 1 - (1 - k) ** 2 : i === 3 ? k * k * (3 - 2 * k) : k, a = A.path[i], b = A.path[i + 1];
    const x = a[0] + (b[0] - a[0]) * s, z = a[1] + (b[1] - a[1]) * s, y = seaY() + a[2] + (b[2] - a[2]) * s, h = Math.atan2(b[1] - a[1], b[0] - a[0]);
    A.plane.setPose(x, y, z, h, 0, i === 1 ? -0.05 + 0.1 * k : i === 0 ? -0.02 : 0); A.plane.engine(i < 2 ? 0.85 : i === 2 ? 0.4 * (1 - k) + 0.25 : 0.25 * (1 - k), dt);
    if (A.t > tot + 4 && !A.end) { A.end = 1; theEnd(); }
  }
  function theEnd() {
    showView(`<div class="page end"><h2>The End</h2><p>The seaplane slows, swings round and drifts up to the jetty. A tall figure climbs out onto the float and lifts a hand.</p><p>You lift yours.</p><p class="sub">Thank you for playing The Letters, a story of Meadow Pond.</p><div class="foot">tap to go on exploring</div></div>`, () => closeView(), 2.5);
  }

  /* ---- the start screen's story button ---- */
  const startBtn = document.getElementById('start'), storyBtn = document.getElementById('storyBtn');
  if (storyBtn) {
    storyBtn.textContent = S.started && !S.ended ? `Continue the story · day ${S.day}` : S.ended ? 'Begin the story again' : 'Begin the story';
    storyBtn.disabled = false;
    storyBtn.addEventListener('click', () => { on = true; if (dailyTasks) dailyTasks.suppressed = true; if (!S.started || S.ended) begin(); else { applyWorld(); beginDay(false); setTimeout(() => note(`Day ${today().n}. ${today().say}`, 6000), 800); } startBtn.click(); });
  }
  function begin() {
    S = fresh(); S.started = true; save(); letters.reset(); fuelQuestReset();
    seasons.set('winter', 0); setHours(2); scheduleEnv(true); fires.douse('fireplace'); if (D.setLights) D.setLights(false);   // cold and dark
    const e = BED.edge; st.pos.set(e.x - 0.6, BED.floor + PC.eyeHeight, e.z); st.yaw = Math.PI / 2; st.pitch = -0.15; st.vel.set(0, 0, 0); st.walk = true;
    beginDay(false);
    setTimeout(() => showView('<div class="page opening"><p>Darkness.</p><p>Cold, and the smell of old smoke.</p><p>A bed you do not know, in a room you do not know.</p><p>You try to remember how you got here. You try to remember your name.</p><p>Nothing comes.</p><div class="foot">tap</div></div>', () => { closeView(); note(`Day 1. ${today().say}`, 7000); }, 2.0), 300);
  }
  const fuelQuestReset = () => { /* (the fuel can's chest keeps its state: once open, it stays open) */ };

  /* ---- each frame ---- */
  let check = 0, lastA = null;
  function update(dt) {
    updateArrival(dt);
    if (!on || S.ended) { icon.show(null); hudEl.classList.toggle('hide', !(on && st.playing)); return; }
    const p = { x: st.pos.x, z: st.pos.z, y: st.pos.y - PC.eyeHeight };
    // sailing round the island: the angle the boat goes round its middle
    if (boating.mode && boating.mode !== 'boarding') { const b = boating.state, a = Math.atan2(b.z, b.x); if (lastA !== null) { let da = a - lastA; da = Math.atan2(Math.sin(da), Math.cos(da)); S.sail += da; each('sailRound', (t, i) => { if (Math.abs(S.sail) >= Math.PI * 2) bump(i); }); } lastA = a; } else lastA = null;
    radioNear = st.walk && !st.aboard && !st.chestOpen && lookingAt(camera, radioAt, 2.2, 0.5) && today().tasks.some((t, i) => t.type === 'radio' && !done(t, i));
    icon.show(radioNear ? radioAt : null, 'radio', RADIO_ICON, 'Use the radio', performance.now() / 1000);
    if ((check -= dt) > 0) return; check = 0.4;
    if (!st.playing) return;
    hudEl.classList.toggle('hide', false);
    each('visit', (t, i) => { const f = PLACES[t.arg]; if (f && f(p)) bump(i); });
    each('sail', (t, i) => { const b = boating.state; if (boating.mode && boating.mode !== 'boarding' && inArea(t.arg, b.x, b.z)) bump(i); });
    each('fly', (t, i) => { const q = flying.state; if (flying.mode === 'flying' && inArea(t.arg, q.x, q.z)) bump(i); });
    each('dockPlane', (t, i) => { const B = flying.berth; if (flying.mode === 'moored' && B && B.dock.island === (isle(t.arg) || {}).name) bump(i); });
    each('fire', (t, i) => { if (fires.fires.some(f => f.id === t.arg && f.lit)) bump(i); });
    each('letter', (t, i) => { if (letters.isRead(t.arg)) bump(i); });
    each('fuel', (t, i) => { if (flying.state.unlocked) bump(i); });
    each('chest', (t, i) => { if (fuelQuest.solved) bump(i); });
    each('telescope', (t, i) => { if (telescope.viewing && skyUniforms.uNight.value > 0.5) bump(i); });
    each('sit', (t, i) => { const s = st.seat; if (!s || !s.seated || s.lie) return; const B = t.arg === 'cabin' ? { x: HOUSE.x - 0.2, z: HOUSE.z + CB.ZW + 0.51 } : BENCHES.find(b => b.name === t.arg); if (B && Math.hypot(s.s.x - B.x, s.s.z - B.z) < 0.5) bump(i); });
    each('lie', (t, i) => { const s = st.seat; if (s && s.lie && s.seated && Math.hypot(p.x - STONES.x, p.z - STONES.z) < STONES.r + 1) bump(i); });
    { const nb = bottles.state.found.length; if (S.bottles !== undefined && nb > S.bottles) each('bottle', (t, i) => bump(i)); S.bottles = nb; }
    { const nk = items.keepsakes().found.length; if (S.keeps !== undefined && nk > S.keeps) each('keepsake', (t, i) => bump(i)); S.keeps = nk; }
    each('wait', (t, i) => { if (PLACES.jetty(p)) { bump(i); startEnding(); } });
  }

  /* ---- the panel: jump to a story day (for checking) ---- */
  { const panel = document.getElementById('panel');
    if (panel) { const row = document.createElement('div'); row.className = 'row sw'; row.innerHTML = '<span>Story day</span><span class="saveBtns"><input id="storyDay" type="number" min="1" max="200" value="1" style="width:4.2em"><button id="storyGo">Go</button></span>'; panel.appendChild(row);
      row.querySelector('#storyGo').addEventListener('click', () => { const n = Math.max(1, Math.min(STORY_DAYS, +row.querySelector('#storyDay').value | 0)); goto(n); }); } }
  function goto(n) { on = true; if (dailyTasks) dailyTasks.suppressed = true; if (!S.started) { S.started = true; } S.ended = false; S.day = n; if (n >= 141) { /* the radio's chapter: parts out */ } beginDay(true); }

  hud();
  return {
    update, slept,
    get on() { return on; }, get day() { return S.day; }, get state() { return S; },
    /** The journal's Story page. */
    page: { id: 'story', chip: '❦ Story', title: 'Story', html() {
      if (!S.started) return '<p class="sub">The story has not begun. Choose “Begin the story” on the start screen.</p>';
      const d = today(), ch = CHAPTERS[d.c];
      const memories = FLASHBACKS.filter(f => S.seen.includes(f.id));
      return `<h3>${S.ended ? 'The End' : `Day ${d.n} of ${STORY_DAYS} · ${ch.title} (${ch.season})`}</h3><p><i>${d.say}</i></p><ul class="keeps">${d.tasks.map((t, i) => `<li class="${done(t, i) ? 'got' : ''}">${t.text}${t.n > 1 ? ` (${prog(i)} of ${t.n})` : ''}</li>`).join('')}</ul>` +
        `<p class="sub">Chapters: ${CHAPTERS.map((c, k) => k < d.c ? `<b>${c.title}</b>` : k === d.c ? `<b><u>${c.title}</u></b>` : '·').join(' ')}</p>` +
        (memories.length ? `<h3>Memories</h3>${memories.map(f => `<p><b>${f.title}.</b> ${f.caption}</p>`).join('')}` : '');
    } },
    _goto: goto, _flash: id => flashback(id), _bump: bump, _end: startEnding,
  };
}
