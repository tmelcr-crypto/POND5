import { createActionIcon, lookingAt } from './actionIcon.js';
import { LETTERS } from '../story/content.js';
import { letterSites } from '../story/sites.js';
import { createLetterPosts } from '../assets/story/letterPosts.js';

/**
 * Reading the story's letters (story/content.js LETTERS at story/sites.js places; meshes: assets/story/letterPosts.js).
 * A letter is out in the world while visible(id) says so (app/story.js: from the day it is needed; the six code letters
 * always, for the fuel can's chest: app/fuelQuest.js) and stays once read. Near one and looking at it, a small envelope
 * icon floats beside it: tap it (or E) to read; the letter opens on a paper page, tap to close. Read letters are kept in
 * the journal's Letters page (app/bottles.js addPage), to read again. 'meadow-letter' (detail: its id) fires on reading.
 * Saved in the browser.
 */
const ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5h17v11h-17z"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/><circle cx="12" cy="14.6" r="1.3"/></svg>';
export function createLetters({ scene, camera, st, items, softDot }) {
  const KEY = 'meadow.letters', sites = letterSites(), byId = Object.fromEntries(sites.map((s, i) => [s.id, i]));
  const list = LETTERS.filter(L => byId[L.site] !== undefined).map(L => ({ ...L, i: byId[L.site] }));
  const posts = createLetterPosts({ scene }, sites);
  let read = new Set(); try { read = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...read])); } catch (err) { void err; } };
  let visible = L => !!L.code;   // (free play: only the six code letters; app/story.js replaces it)
  const shown = new Map();
  function refresh() { for (const L of list) { const on = visible(L) || read.has(L.id); if (shown.get(L.id) !== on) { shown.set(L.id, on); posts.show(L.i, on); } } }

  /* ---- the page ---- */
  const view = document.createElement('div'); view.id = 'storyView'; view.className = 'hide'; document.body.appendChild(view);
  let open = false;
  const html = L => `<h2>${L.title}</h2>${L.text.map(p => `<p>${p}</p>`).join('')}<p class="sig">— you, before</p>`;
  function showLetter(L) { open = true; view.classList.remove('hide'); view.innerHTML = `<div class="page letter">${html(L)}<div class="foot">Found ${sites[L.i].name} · kept in your journal · tap to close</div></div>`; }
  const close = () => { open = false; view.classList.add('hide'); };
  view.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); close(); });
  addEventListener('keydown', e => { if (open && !e.repeat) { e.stopPropagation(); close(); } }, true);

  /* ---- near a letter: the icon ---- */
  const icon = createActionIcon({ scene, camera, softDot, id: 'letterIcon', glow: 0.3 });
  let near = null, check = 0, T = 0;
  function offer() {
    if (!st.playing || !st.walk || st.aboard || st.seat || st.inBed || st.chestOpen || open) return null;
    let best = null, bd = 9;
    for (const L of list) { if (!shown.get(L.id)) continue; const at = posts.at(L.i), d = camera.position.distanceTo(at); if (d < bd && lookingAt(camera, at, 2.4, 0.45)) { bd = d; best = L; } }
    return best;
  }
  function take() {
    const L = near; if (!L) return;
    const first = !read.has(L.id); read.add(L.id); save(); if (items) items.sfx('pop'); showLetter(L);
    if (first) dispatchEvent(new CustomEvent('meadow-letter', { detail: L.id }));
  }
  icon.onPress = take;
  addEventListener('meadow-tap', e => { if (near && e.detail !== 'touch') take(); });

  return {
    update(dt) {
      T += dt;
      if ((check -= dt) <= 0) { check = 0.2; refresh(); near = offer(); }
      icon.show(near ? posts.at(near.i) : null, near && near.id, ICON, 'Read the letter', T);
    },
    /** The journal's page of letters read, in the order of the story. */
    page: { id: 'letters', chip: '✉ Letters', title: 'Letters', html() {
      const got = list.filter(L => read.has(L.id));
      return `<p class="sub">${got.length} letters found${got.length ? '' : '. They lie along the ways you used to walk.'}</p>` + got.map(L => `<div class="lettercopy">${html(L)}<p class="where">Found ${sites[L.i].name}</p></div>`).join('');
    } },
    set visible(f) { visible = f; shown.clear(); refresh(); },
    isRead: id => read.has(id),
    reset() { read = new Set(); save(); shown.clear(); refresh(); },
    sites, list, posts,
    get open() { return open; },
  };
}
