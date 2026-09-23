import { isTouch } from './core/env.js';

/**
 * Every tunable of the 100 x 100 m world in one place. Units are metres unless noted.
 * Values that differ between the iPad (touch) and desktop are picked with isTouch here,
 * so nothing else in the world code needs to know which device it runs on.
 */
export const CONFIG = {
  // World extent and generation
  world: {
    size: 100,              // edge length of the square world (x and z span -size/2 .. size/2)
    seed: 5150,             // seed for everything the world adds on top of the diorama (scatter, rocks, textures)
    coreHalf: 5.5,          // the authored 10 x 10 m diorama keeps its exact terrain inside |x|,|z| < coreHalf
    coreBlend: 9,           // metres over which the diorama terrain blends into the rolling hills
  },

  // Rolling hills (seeded value-noise fBm)
  terrain: {
    segments: 200,          // world heightmap mesh resolution (segments per side, 0.5 m cells at 100 m)
    hillHeight: 3.2,        // peak-to-trough scale of the rolling hills
    hillScale: 38,          // horizontal wavelength of the hills
    detailHeight: 0.35,     // small bumps on top of the hills
    edgeRise: 7,            // how much the terrain rises towards the world border
    edgeRiseStart: 34,      // distance from the centre (box metric) where the rise begins
    skirtOuter: 160,        // the low-poly horizon ring extends to this half-size (hides the world edge)
    rockSlope: 0.8,         // terrain normal.y below which rock shows through (steep slopes)
  },

  // GPU grass around the camera (outside the diorama; the diorama keeps its own grass)
  grass: {
    density: isTouch ? 300 : 640, // blades/m2 out to fullRadius: the plot's own grass density (30k / 64k blades on 100 m2)
    fullRadius: 8,          // full density out to here ...
    radius: 18,             // ... then d(r) = density * ((radius - r) / (radius - fullRadius))^2, zero at radius
    clumping: 0.3,          // low-frequency noise varies the density by +-30%
    // rings only set the geometry cost: [inner, outer, blades per cell, segments per blade (2 = 5 tris, 1 = 3, 0 = 1)];
    // each ring's cell size is derived from the density at its inner edge
    rings: [[0, 8, 8, 2], [8, 10.5, 8, 2], [10.5, 13, 8, 1], [13, 15.5, 8, 1], [15.5, 18, 8, 0]],
    blend: 1,               // dither width (m) where two rings overlap, hides the ring seams
    height: [0.16, 0.42],   // blade height range
  },

  // Tree and rock scatter
  scatter: {
    spruceCount: isTouch ? 420 : 520,
    appleCount: 34,
    rockCount: isTouch ? 110 : 150,
    clearingRadius: 13,     // no trees closer than this to the diorama centre (open meadow around the pond)
    treeLineWidth: 11,      // dense tree line along the border, this many metres deep
    minSpacing: 2.4,        // minimum trunk spacing for spruces
    pathWidth: 1.6,         // walkable path from the cabin door to the pond shore stays clear
    lod: [18, 50],          // full mesh < lod[0] < simplified mesh < lod[1] < camera-facing billboard
    lodHysteresis: 2,       // metres of hysteresis on every LOD switch (avoids flicker at the boundary)
    horizonForest: 90,      // billboard-only spruces on the hills outside the border, out to this half-size
  },

  // Sun, shadows and atmosphere
  light: {
    shadowMapSize: isTouch ? 2048 : 4096,
    shadowExtent: 40,       // the shadow box that follows the player is this many metres wide
    shadowDistance: 60,     // sun is placed this far from the player along the sun direction
    hemiIntensity: 1,       // multiplier on the time-of-day hemisphere fill
  },
  fog: { density: 0.011 },  // FogExp2 density; colour follows the sky horizon
  camera: { far: 150, fov: 72 },

  // Rendering
  render: { maxPixelRatio: 1.5 },

  // Player
  player: {
    startMode: 'walk',      // 'walk' follows the terrain, 'fly' is the original free-flight camera
    eyeHeight: 1.55,
    stepHeight: 0.45,       // rocks lower than this can be stepped onto
    gravity: 18,
    jump: 4.2,
    flyCeiling: 30,         // maximum height above the terrain in fly mode
    boundaryMargin: 3,      // soft push-back starts this far inside the world edge
  },
};
