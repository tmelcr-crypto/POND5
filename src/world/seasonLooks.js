import { addSeason } from '../core/shaderPatches.js';
import { WATER_Y, SEA_Y } from './layout.js';

/**
 * What each season looks like. Every material that changes carries a role in userData.season, set where it is made;
 * after the whole scene is built (before finalizeScene) this gives each one its shader patch (addSeason: colours,
 * snow) and, for roles that come and go, shows or hides the material with the season (material.visible, so the
 * distance-detail system can keep switching the meshes themselves). Summer shows everything as it always was.
 *  ground / groundPlot  the island's and the plot's ground: grass paint by season, snow in winter above the water
 *  grass                the grass blades: coloured by season, gone under the snow in winter
 *  leaf                 apple leaves: blossom in spring, autumn colours, bare in winter
 *  leafVeg              bush, rose and fern leaves: coloured by season, bare in winter
 *  veg                  reeds: coloured by season (straw in winter)
 *  bark                 apple branches: a little snow on top in winter; their fine twigs folded away (they would float
 *                       without the leaves)
 *  twig                 the plot apple tree's fine twigs: gone in winter
 *  roof                 roofs (cabin, woodpiles, well), signposts, the garden beds: snow in winter
 *  needles              the spruces: a light dusting of snow on the upper sides in winter
 *  fruit                apples on the trees and windfalls: summer and autumn
 *  berries              summer and autumn
 *  bloom                rose flowers: spring and summer
 *  pond                 lily pads and flowers: gone under the ice in winter
 *  mushroom / flower    the forest floor's mushrooms, the plot's meadow flowers round the pond: gone in winter
 *  crop                 the garden's carrots, potatoes and pumpkins: gone under the snow in winter
 *  ice                  the jetty: a glaze of ice on its deck and rails in winter
 *  fungi                the fallen logs: their mushrooms and shelf fungi folded away in winter (a 'fungus' attribute)
 */
export const PATCH = {
  groundPlot: { veg: true, snow: { lo: 0.5, hi: 0.78, minY: WATER_Y + 0.015 } },
  ground: { veg: true, snow: { lo: 0.5, hi: 0.78, minY: SEA_Y + 0.35 } },
  grass: { veg: true }, leaf: { leaf: true }, leafVeg: { veg: true }, veg: { veg: true },
  bark: { snow: { lo: 0.55, hi: 0.85, amount: 0.9 }, foldInWinter: 'twig' },   // the island trees' twigs are part of the bark mesh
  roof: { snow: { lo: 0.3, hi: 0.55 } },
  needles: { snow: { lo: 0.25, hi: 0.75, amount: 0.55 } },   // a light dusting on the spruces
  fungi: { foldInWinter: 'fungus' },
  ice: { ice: { lo: 0.55, hi: 0.85 } },                      // the jetty: a glaze of ice                          // the fallen logs' mushrooms and shelf fungi
};
export const SHOWN = {
  grass: s => s !== 'winter', leaf: s => s !== 'winter', twig: s => s !== 'winter', mushroom: s => s !== 'winter', crop: s => s !== 'winter', flower: s => s !== 'winter', leafVeg: s => s !== 'winter', pond: s => s !== 'winter',
  fruit: s => s === 'summer' || s === 'autumn', berries: s => s === 'summer' || s === 'autumn', bloom: s => s === 'spring' || s === 'summer',
};

export function createSeasonLooks(scene, seasons) {
  const roles = {};
  scene.traverse(o => {
    if (!o.material) return;
    [].concat(o.material).forEach(m => {
      const r = m.userData.season; if (!r || m.userData.seasonDone) return;
      m.userData.seasonDone = true; if (PATCH[r]) addSeason(m, PATCH[r]);
      (roles[r] || (roles[r] = new Set())).add(m);
    });
  });
  seasons.on((s, d) => { for (const r in roles) if (SHOWN[r]) { const v = SHOWN[r](s, d); roles[r].forEach(m => { m.visible = v; }); } });
  return { roles };
}
