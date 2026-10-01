import { KINDS } from './itemKinds.js';
import { SHOWN } from '../world/seasonLooks.js';
import { treehouseDeckY, underground, ISLET, STONES, BENCHES, LIGHTHOUSE } from '../world/layout.js';
import { CONFIG } from '../config.js';

/**
 * A little task for every in-game day (#15), and the calendar in the journal (app/bottles.js addPage) that keeps
 * them: each day at midnight a new one is picked (never yesterday's, and only what the season allows: no apples in
 * spring, no boletes or crops in winter), told in a note, and followed as you play; done, it is ticked off in the
 * calendar with a handwritten check mark. Days are the running clock's days (sleep counts). Saved in the browser.
 *
 * What counts: things picked up or made (not taken out of a chest), steps walked, the angle sailed round the island,
 * fires lit, bottles opened, places reached and seats sat on.
 */
const add = (kinds, n, ok) => ({ on: 'add', kinds, n, ok });
const TASKS = [
  { id: 'steps', text: 'Walk 1000 steps', short: '1000 steps', on: 'steps', n: 1000 },
  { id: 'sail', text: 'Sail all the way round the island', short: 'Sail round', on: 'sail', n: 1 },
  { id: 'fish', text: 'Catch 3 fish', short: '3 fish', ...add(['fish', 'goldenFish'], 3) },
  { id: 'apples', text: 'Pick 5 apples', short: '5 apples', ...add(['apple'], 5, s => SHOWN.fruit(s)) },
  { id: 'shells', text: 'Gather 5 shells on the beach', short: '5 shells', ...add(['shell', 'rareShell'], 5) },
  { id: 'cones', text: 'Collect 8 spruce cones', short: '8 cones', ...add(['cone'], 8) },
  { id: 'pebbles', text: 'Collect 6 pebbles', short: '6 pebbles', ...add(['pebble'], 6) },
  { id: 'boletes', text: 'Find 3 boletes in the woods', short: '3 boletes', ...add(['mushroom'], 3, s => SHOWN.mushroom(s)) },
  { id: 'berries', text: 'Pick 4 handfuls of berries', short: '4 berries', ...add(['berry'], 4, s => SHOWN.berries(s)) },
  { id: 'cook', text: 'Cook something over a fire', short: 'Cook', ...add(null, 1) },
  { id: 'water', text: 'Draw water from the well', short: 'Well water', ...add(['water'], 1) },
  { id: 'harvest', text: 'Harvest something in the garden', short: 'Harvest', ...add(['carrot', 'potato', 'pumpkin', 'onion', 'lettuce', 'beans', 'strawberry'], 1, s => s !== 'winter') },
  { id: 'fire', text: 'Light a fire', short: 'Light a fire', on: 'fire', n: 1 },
  { id: 'bottle', text: 'Find a message in a bottle', short: 'A bottle', on: 'bottle', n: 1 },
  { id: 'treehouse', text: 'Climb up to the treehouse', short: 'Treehouse', on: 'visit', n: 1, at: p => p.y - treehouseDeckY(p.x, p.z) < 2 },
  { id: 'cave', text: 'Explore the caverns under the south slope', short: 'The caverns', on: 'visit', n: 1, at: p => underground(p.x, p.z, p.y) },
  { id: 'lighthouse', text: 'Sail to the lighthouse and climb to its gallery', short: 'Lighthouse', on: 'visit', n: 1, at: p => p.y > LIGHTHOUSE.tower.topY - 0.3 && Math.hypot(p.x - LIGHTHOUSE.tower.x, p.z - LIGHTHOUSE.tower.z) < 3 },
  { id: 'islet', text: 'Set foot on the islet', short: 'The islet', on: 'visit', n: 1, at: (p, st) => !st.aboard && Math.hypot(p.x - ISLET.x, p.z - ISLET.z) < ISLET.r * 0.8 },
  { id: 'stones', text: 'Lie down in the stone ring', short: 'Stone ring', on: 'visit', n: 1, at: (p, st) => st.seat && st.seat.lie && st.seat.seated && Math.hypot(p.x - STONES.x, p.z - STONES.z) < STONES.r },
  { id: 'benches', text: 'Sit on both benches, sunrise and sunset', short: 'Both benches', on: 'benches', n: 2 },
];
const COOKED = new Set(Object.values(KINDS).map(k => k.cook).filter(Boolean));
const TICK = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 13.2c1.6.6 3.2 2.6 4.6 5.6.3.6.8.6 1.1 0C11.6 12.8 15.4 7.6 20.8 3.6"/><path d="M4.6 12.4c1.3.9 2.3 2.2 3.2 3.8" opacity=".5"/></svg>';

export function createDailyTasks({ camera, st, clock, hours, seasons, inventory, fires, bottles, items }) {
  const KEY = 'meadow.tasks';
  let S = { h0: clock.hours, days: {} };
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.days) S = { h0: +d.h0 || 0, days: d.days }; } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { void err; } };
  const note = (text, ms = 4200) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };
  const byId = id => TASKS.find(t => t.id === id);
  const dayNow = () => Math.floor((S.h0 + hours.hours) / 24) + 1;   // day 1 is the day you arrived; a day turns at midnight
  const season = () => (seasons ? seasons.season : 'summer');
  let today = null, fresh = -1;

  /** Today's record, picked the first time the day is seen: a task the season allows, not yesterday's (by a hash of the day). */
  function begin() {
    const d = dayNow(); if (today && today.d === d) return;
    if (!S.days[d]) {
      const prev = S.days[d - 1], ok = TASKS.filter(t => (!t.ok || t.ok(season())) && (!prev || prev.id !== t.id) && (t.id !== 'bottle' || bottles.state.found.length < 25));
      let h = d * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
      S.days[d] = { id: ok[h % ok.length].id, p: 0, done: false, s: season() }; save();
      if (d > 1 || Object.keys(S.days).length > 1) setTimeout(() => note(`Day ${d}. Today: ${byId(S.days[d].id).text.toLowerCase()} (your journal has it)`), 1500);
    }
    today = { d, r: S.days[d], t: byId(S.days[d].id) };
    seen.benches = new Set(); seen.lastA = null; seen.sail = 0;
  }
  const seen = { benches: new Set(), lastA: null, sail: 0, fires: new Set(), found: bottles.state.found.length, pos: null };
  fires.fires.forEach(f => { if (f.lit) seen.fires.add(f); });

  function progress(n) {
    const r = today.r; if (r.done) return;
    r.p = Math.min(today.t.n, r.p + n);
    if (r.p >= today.t.n) { r.done = true; fresh = today.d; save(); items.sfx('rareShell'); note(`Today's task done: ${today.t.text.toLowerCase()} ✓`, 4600); }
    else if ((save.n = (save.n || 0) + 1) % 20 === 0) save();
  }

  // things picked up or made (anything going into the slots, but not out of a chest)
  const addPrev = inventory.add;
  inventory.add = kind => {
    const r = addPrev(kind);
    if (today && !st.chestOpen && today.t.on === 'add' && (today.t.kinds ? today.t.kinds.includes(kind) : COOKED.has(kind))) progress(1);
    return r;
  };

  let check = 0, off = false;   // off: the story is running (app/story.js), the daily tasks rest
  return {
    set suppressed(v) { off = v; },
    update(dt) {
      if (off) return;
      begin();
      const T = today.t, p = camera.position;
      // steps: the ground you cover walking (0.75 m a step)
      if (T.on === 'steps') {
        if (st.walk && st.grounded && !st.aboard && !st.seat && seen.pos) { const d = Math.hypot(p.x - seen.pos.x, p.z - seen.pos.z); if (d < 2) { seen.walked = (seen.walked || 0) + d; if (seen.walked > 0.75) { const n = Math.floor(seen.walked / 0.75); seen.walked -= n * 0.75; progress(n); } } }
        seen.pos = { x: p.x, z: p.z };
      }
      // sailing round the island: the angle you sail round its middle, all the way round either way
      if (T.on === 'sail') {
        if (st.aboard) { const a = Math.atan2(p.z, p.x); if (seen.lastA !== null) { let da = a - seen.lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; seen.sail += da; } seen.lastA = a; if (Math.abs(seen.sail) >= Math.PI * 2) progress(1); }
        else seen.lastA = null;
      }
      if ((check -= dt) > 0) return; check = 0.5;
      if (T.on === 'fire') fires.fires.forEach(f => { if (f.lit && !seen.fires.has(f)) progress(1); });
      seen.fires = new Set(fires.fires.filter(f => f.lit));
      const nf = bottles.state.found.length; if (T.on === 'bottle' && nf > seen.found) progress(1); seen.found = nf;
      if (T.on === 'visit' && T.at({ x: st.pos.x, y: st.pos.y - CONFIG.player.eyeHeight, z: st.pos.z }, st)) progress(1);
      if (T.on === 'benches' && st.seat && st.seat.seated) { const b = BENCHES.find(q => q.x === st.seat.s.x && q.z === st.seat.s.z); if (b && !seen.benches.has(b.name)) { seen.benches.add(b.name); progress(1); } }
    },
    /** The journal's calendar page: the days so far, a row per season, today's task with how far along it is. */
    page: {
      id: 'calendar', chip: '▦ Calendar', title: 'Calendar',
      html() {
        if (off) return '<p class="sub">While the story runs, its own tasks take the place of these (the Story page).</p>';
        begin();
        const days = Object.keys(S.days).map(Number).sort((a, b) => a - b), rows = [];
        days.forEach(d => { const r = S.days[d]; if (!rows.length || rows[rows.length - 1].s !== r.s) rows.push({ s: r.s, list: [] }); rows[rows.length - 1].list.push(d); });
        const cell = d => {
          const r = S.days[d], t = byId(r.id), now = d === today.d;
          const state = r.done ? TICK : now ? `<em>${r.p} / ${t.n}</em>` : '<i class="miss">–</i>';
          return `<div class="cd${now ? ' now' : ''}${r.done ? ' done' : ''}${r.done && d === fresh ? ' fresh' : ''}"><b>${d}</b><span>${t.short}</span>${state}</div>`;
        };
        const T = today.t, r = today.r, done = days.filter(d => S.days[d].done).length;
        return `<p class="today">Day ${today.d}: <b>${T.text}</b>${r.done ? ' — done ✓' : T.n > 1 ? ` (${r.p} of ${T.n})` : ''}</p>` +
          rows.map(w => `<div class="calrow"><div class="season">${w.s}</div><div class="cells">${w.list.map(cell).join('')}</div></div>`).join('') +
          `<p class="sum">${done} of ${days.length} days done. A new task comes every morning at midnight.</p>`;
      },
    },
    get today() { begin(); return { day: today.d, id: today.t.id, p: today.r.p, n: today.t.n, done: today.r.done }; },
    /** For testing. */
    _force(id) { begin(); today.r.id = id; today.r.p = 0; today.r.done = false; today.t = byId(id); save(); },
  };
}
