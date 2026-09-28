import { CONFIG } from '../config.js';
import { U } from '../core/uniforms.js';
import { TIDE, SEA_Y } from './layout.js';

/**
 * Tides (#68). The sea rises and falls CONFIG.tide.amp m about its mean level over CONFIG.tide.period in-game hours
 * (a real tide's 12.4 h), counted from the island's first morning with the days of the seasons (world/seasons.js),
 * so it carries on across sleep and reloads. It moves TIDE.y (world/layout.js; seaY() = SEA_Y + TIDE.y) and U.uSea:
 * the sea's surface, its shallows and shore foam, the wet sand on the beaches, the sea mist, and everything that
 * floats, wades or splashes (the boat, wading back to shore, the fishing float, thrown things, footsteps in the
 * surf). What was placed once (shells and driftwood, the jetty and its stairs) stays: at high water the lowest steps
 * are under the sea, at low water more of the beach and the jetty's piles show.
 */
export function createTide({ clock, seasons }) {
  const C = CONFIG.tide;
  const level = () => {
    const h = (seasons ? seasons.days : 0) * 24 + clock.hours;
    return C.amp * Math.sin(h / C.period * Math.PI * 2 + C.phase);
  };
  function update() { TIDE.y = level(); U.uSea.value = SEA_Y + TIDE.y; }
  update();
  return {
    update,
    /** Rising (true) or falling, and the level now (m above the mean). */
    get state() { const h = (seasons ? seasons.days : 0) * 24 + clock.hours; return { y: TIDE.y, rising: Math.cos(h / C.period * Math.PI * 2 + C.phase) > 0 }; },
  };
}
