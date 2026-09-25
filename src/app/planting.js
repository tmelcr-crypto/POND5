import { CONFIG } from '../config.js';
import { V } from '../core/math.js';
import { H, HALF, walkwayDist, signDist, builtDist, coastDist, streamDist, lakeD } from '../world/layout.js';
import { obstacles, rockBodies } from '../world/bounds.js';

/**
 * Planting saplings (#7; the saplings: assets/trees/sapling.js). With an apple or a spruce cone selected, looking down
 * at open ground close by (off the paths, the plot, the beach, the water, clear of trees, rocks, the garden and other
 * saplings), the Use button says Plant: the apple or cone goes into the ground and a seedling comes up there. It grows
 * on its own over CONFIG.planting.days in-game days into a young apple tree or spruce (the hours you sleep count;
 * winter does not). At most CONFIG.planting.max of them. Where they are and when they were planted is saved.
 */
export function createPlanting({ camera, st, inventory, items, saplings, hours, seasons, scatter }) {
  const PC = CONFIG.planting, KEY = 'meadow.saplings', SPECIES = { apple: 'apple', cone: 'spruce' };
  let list = [];   // { species, x, z, yaw, g: growth 0..1 }
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(d)) list = d.filter(t => t && (t.species === 'apple' || t.species === 'spruce')).slice(0, PC.max).map(t => ({ species: t.species, x: +t.x, z: +t.z, yaw: +t.yaw || 0, g: +t.g || 0 })); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list.map(t => ({ ...t, g: +t.g.toFixed(4) })))); } catch (err) { void err; } };
  const size = g => 0.05 + 0.95 * g * g * (3 - 2 * g);
  const show = () => saplings.set(list.map(t => ({ ...t, y: H(t.x, t.z) - 0.02, s: size(Math.min(1, t.g)) })));
  show();

  const trees = scatter ? scatter.spruce.concat(scatter.apple) : [], dir = new V(), p = new V(), q = new V();
  /** The open ground point you look down at, or null. */
  function spot() {
    if (!st.playing || !st.walk || !st.grounded || st.aboard || st.seat || st.inBed || st.chestOpen || st.pitch > PC.pitch || list.length >= PC.max) return null;
    camera.getWorldDirection(dir);
    for (let t = 0.3; t < PC.reach; t += 0.05) {
      p.copy(camera.position).addScaledVector(dir, t);
      if (p.y > H(p.x, p.z)) continue;
      const x = p.x, z = p.z;
      if (Math.max(Math.abs(x), Math.abs(z)) < HALF + 0.6 || walkwayDist(x, z) < 0.8 || signDist(x, z) < 0.6 || builtDist(x, z) < 0.8) return null;
      if (coastDist(x, z) < CONFIG.island.beachWidth + 0.5 || streamDist(x, z) < 1 || lakeD(x, z) < 1.5) return null;
      if (trees.some(tr => Math.hypot(tr.x - x, tr.z - z) < PC.clear) || list.some(s => Math.hypot(s.x - x, s.z - z) < PC.apart)) return null;
      if (rockBodies.near(x, z).some(c => Math.hypot(c.x - x, c.z - z) < Math.max(c.rx, c.rz) + 0.2)) return null;
      q.set(x, -100, z); obstacles.resolve(q, 0.35); if (q.x !== x || q.z !== z) return null;   // a trunk, a bench, a firepit's logs...
      return { x, z };
    }
    return null;
  }
  const canPlant = kind => !!SPECIES[kind] && !!spot();
  const label = inventory.useLabel; inventory.useLabel = kind => canPlant(kind) ? 'Plant' : label(kind);
  const use = inventory.onUse; inventory.onUse = kind => canPlant(kind) ? plant(kind) : use(kind);
  function plant(kind) {
    const s = spot(); if (!s) return false;
    list.push({ species: SPECIES[kind], x: s.x, z: s.z, yaw: Math.random() * 6.28, g: 0 }); show(); save(); items.sfx('dig');
    return true;   // the apple or cone is used up
  }

  let last = hours.hours, redraw = 0, saveIn = 0, can = false;
  return {
    update(dt) {
      const h = hours.hours, d = h - last; last = h;
      if (d > 0 && list.length && !(seasons && seasons.season === 'winter')) {
        list.forEach(t => { if (t.g < 1) t.g = Math.min(1, t.g + d / (PC.days * 24)); });
        if ((redraw -= d) <= 0 || d > 1) { redraw = 0.25; show(); }
        if ((saveIn -= dt) <= 0) { saveIn = 5; save(); }
      }
      const sel = inventory.selected, c = !!sel && canPlant(sel.kind); if (c !== can) { can = c; inventory.refresh(); }
    },
    get list() { return list.map(t => ({ ...t })); },
  };
}
