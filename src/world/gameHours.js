/**
 * In-game hours since the island began, for things that grow (the garden, planted saplings): the running day clock
 * (small steps only, so dragging the time slider far does not count) plus the hours you sleep (slept(h), from main.js).
 * Saved in the browser.
 */
export function createGameHours({ clock }) {
  const KEY = 'meadow.hours';
  let total = 0, prevH = clock.hours, saveIn = 0;
  try { total = +JSON.parse(localStorage.getItem(KEY) || '0') || 0; } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(total)); } catch (err) { void err; } };
  return {
    get hours() { return total; },
    update(dt) {
      const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; prevH = h;
      if (d < 3) total += d;
      if ((saveIn -= dt) <= 0) { saveIn = 5; save(); }
    },
    slept(hours) { prevH = clock.hours; total += hours; save(); },
  };
}
