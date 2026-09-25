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
    rockSlope: 0.8,         // terrain normal.y below which rock shows through (steep slopes)
  },

  // The island: coastline, beach and sea around it
  island: {
    radius: 37,             // mean distance from the centre to the shoreline
    coastNoise: 6,          // +- metres the shoreline wanders (seeded)
    beachWidth: 7,          // sand from the waterline up to here, then the hills take over
    seaLevel: -0.8,         // below the plot's pond basin (-0.52), so the plot is untouched
    seaDepth: 6,            // the sea floor drops to this depth offshore
    wadeDepth: 0.6,         // walking further out than this depth pushes you back to shore
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
    spruceCount: isTouch ? 150 : 180,
    appleCount: 34,
    rockCount: isTouch ? 110 : 150,
    clearingRadius: 13,     // no trees closer than this to the diorama centre (open meadow around the pond)
    minSpacing: 4.5,        // minimum trunk spacing for spruces (sets the densest a grove can get)
    pathWidth: 1.6,         // walkable path from the cabin door to the pond shore stays clear
  },

  // Island trees: the reference generators at full detail, thinned continuously with distance on the GPU
  trees: {
    variants: 4,            // differently seeded full-detail variants per species (build time grows with this)
    spruceScale: [1.1, 1.7],// the reference spruce is 5.8 m tall
    appleScale: [0.85, 1.2],
    keep: [15, 19, 0.5],    // all detail up to keep[0] m, then ease out to the fraction keep[2] at keep[1] m
    grow: 0.35,             // surviving cards grow by up to this much as detail drops, so crowns stay full
    fade: [15, 19],         // full-detail trees only within fade[0] m; dithered cross-fade to the 8-angle billboard by fade[1]
    billboardTile: 384,     // billboard atlas tile width in pixels (seen from 15 m, so sharper than before)
  },

  // Island boulders: the reference outcrop's boulder generator, same near/far cross-fade as the trees (trees.fade)
  rocks: {
    variants: 6,            // differently shaped boulders
    nearDetail: 10,         // icosphere subdivision of the full-detail mesh (~2.4k triangles)
    farDetail: 3,           // icosphere subdivision of the far mesh (~320 triangles)
  },

  // Forest undergrowth and meadow life (world/undergrowth.js); logs and small things fade with trees.fade
  undergrowth: {
    bushes: isTouch ? 60 : 90,       // leafy hazel-like bushes in and along the forest (full detail + billboard, like the trees)
    bushVariants: 4,
    roses: isTouch ? 16 : 22,        // wild roses on the meadow side of forest edges (the reference rose generator)
    roseVariants: 3,
    logs: isTouch ? 12 : 16,         // fallen trunks, each beside the stump it broke from
    logVariants: 4,
    fernClumps: isTouch ? 200 : 300, // clumps of 7-12 fronds (the outcrop's fern), under the trees
    mushrooms: isTouch ? 220 : 320,  // boletes and fly agarics, in small groups on the forest floor
    sticks: isTouch ? 260 : 360,     // fallen twigs and sticks
    cones: isTouch ? 450 : 650,      // spruce cones under the spruces
    flowers: isTouch ? 1.0 : 1.5,    // meadow flowers per m2 inside flower patches (the plot's daisies / buttercups / lilac)
    butterfliesPerRose: [3, 5],      // butterflies looping around each wild rose (min, max)
    meadowButterflies: isTouch ? 30 : 40, // fewer, spread over the open meadow
    butterflyRange: 4,               // drawn only this close to the camera (shrinking over the last metre)
    pollen: isTouch ? 320 : 500,     // pollen by day, fireflies at night, in a box around the camera (the plot keeps its own)
    tile: 8,                         // small things are bucketed in tiles this wide; only tiles near the camera are drawn
    keep: [5, 11, 0.45],             // bushes and roses: all detail up to keep[0] m, easing to keep[2] at keep[1] (as trees.keep)
    fade: [8, 11],                   // ... and full detail only within fade[0] m, billboards by fade[1] (small, so closer than trees)
  },

  // Distance-based detail of the original plot's assets (engine/detailManager.js, world/plotDetail.js). The plot
  // follows the island's rules: full detail within trees.fade[0] (15 m), dithered away or cross-faded to a billboard
  // by trees.fade[1] (19 m); small instanced things fade per instance on the GPU like the island's.
  detail: {
    interval: 0.25,          // seconds between distance evaluations (switching only; fades run on the GPU every frame)
    hysteresis: 0.15,        // a band switches on at d and off at d * 1.15 (far bands the other way), so nothing flickers
    interior: [15, 18],      // cabin interior: full within 15 m of the cabin (or inside), dissolved by 18 m; glows stay
    pollen: 19,              // the plot's pollen / fireflies stop drawing and updating beyond this distance from the plot
    butterflies: 4,          // the plot's butterflies are drawn within this distance, like the island's
  },

  // Sun, shadows and atmosphere
  light: {
    shadowMapSize: isTouch ? 2048 : 4096,
    shadowExtent: 40,       // the shadow box that follows the player is this many metres wide
    shadowDistance: 60,     // sun is placed this far from the player along the sun direction
    hemiIntensity: 1,       // multiplier on the time-of-day hemisphere fill
  },
  // Soft cloud shadows drifting over the island (core/shaderPatches.js addCloudShadow): they dim only direct sunlight
  clouds: {
    tile: 320,              // metres one repeat of the cloud texture covers
    sizes: [22, 64],        // nominal cloud size range, m: the shadows come out roughly 20-60 m across
    coverage: 0.3,          // clouds are placed until they cover this share of the sky (shadows end up ~35% of the ground)
    soft: 7,                // metres of soft edge (made ragged by noise)
    seed: 17,               // the cloud layout (independent of the world seed)
    strength: 0.35,         // share of direct sunlight a full shadow takes away at midday (fades to 0 as the sun sets)
    speed: [1.5, 5],        // drift, m/s: speed[0] + speed[1] * the wind setting, along the wind direction
  },
  fog: { density: 0.011 },  // FogExp2 density at midday, the day's minimum (world/atmosphere.js thickens it at dawn / dusk); colour follows the sky horizon
  // The wider world on the horizon (world/horizon.js). No other island exists yet, so the lighthouse stands on a small
  // rock at sea; move `lighthouse` to the next island's position when there is one.
  horizon: {
    lighthouse: { x: 330, z: -300, rock: 16, cliff: 11 },   // m; rock: its radius, cliff: its height
    islands: [{ x: 0, z: 0, r: 45 }],           // islands the sailboats keep clear of (the home island's coast is ~37-49 m out)
  },
  time: {
    dayMinutes: 18,         // real minutes for one 24 h day
    lapse: 40,              // times faster while holding the time-lapse button (app/timelapse.js)
    start: 16.5,            // hour at load
    sunEvery: 0.2,          // s between sun / sky updates
    envEvery: [4, 15],      // s between rebuilds of the sky's environment map: around dawn and dusk, otherwise
  },
  camera: { far: 150, fov: 72 },

  // Rendering
  render: { maxPixelRatio: 1.25, dynamic: { enabled: true, low: 50, high: 58, min: 0.65, step: 0.05, hold: 2, wait: 3 } },   // dynamic: engine/dynamicRes.js

  // Player
  player: {
    startMode: 'walk',      // 'walk' follows the terrain, 'fly' is the original free-flight camera
    eyeHeight: 1.55,
    stepHeight: 0.45,       // rocks lower than this can be stepped onto
    gravity: 18,
    jump: 4.2,
    flyCeiling: 30,         // maximum height above the terrain in fly mode
    boundaryMargin: 3,      // soft push-back starts this far inside the world edge (fly mode over the sea)
    // sitting on a bench (app/controls.js): the button shows within `reach` m of a seat, at least `front` m in front of it
    sit: { reach: 2.4, front: 0.35, approach: 0.8, seatF: 0.02, eye: 0.74, walk: 1.1, turn: 2.6, lower: 1.1, rise: 0.9 },   // m, m/s, rad/s, s
  },

  // The wind changing by itself (world/wind.js); the panel's Wind slider overrides the strength
  wind: {
    hold: [30, 60],                // in-game minutes it holds a strength and direction
    shift: 10,                     // in-game minutes to shift to the next
    strength: [0.2, 1.6, 0.7],     // range, and the power on a uniform random number (< 1 leans strong: mean ~1.0)
  },

  // The seasons (world/seasons.js)
  seasons: {
    days: 10,                      // in-game days a season lasts; it turns during the first sleep after that
    start: 'summer',               // a first visit
    // sunrise and sunset (hours) and how high the sun climbs (1 = as the summer sun always has) per season
    sun: { spring: [6, 18, 0.85], summer: [5, 19, 1], autumn: [6.5, 17.5, 0.75], winter: [8, 16, 0.5] },
  },

  // The weather (world/skyWeather.js): chances per in-game hour of clear sky, by season
  weather: {
    rain: { spring: 0.07, summer: 0.04, autumn: 0.1, winter: 0.06 },     // clear -> rain (snow in winter)
    storm: { spring: 0.2, summer: 0.4, autumn: 0.2, winter: 0 },         // of the rain, how much is a thunderstorm
    rainHours: [1, 4], clearHold: [3, 8],                                 // in-game hours
    fogChance: { spring: 0.2, summer: 0.08, autumn: 0.45, winter: 0.25 }, fogThick: 4,   // a fog morning; how much thicker
    flashEvery: [7, 22],                                                  // s between lightning flashes in a storm
    rainLevel: 0.22, thunderLevel: 0.5,                                   // of the master volume
    rainbowChance: 0.7, rainbowHours: [0.4, 0.8], rainbowRadius: 110,
    aurora: { chance: 0.6, radius: 125, height: 70, y: 55, arc: 2.2 },    // the northern lights: share of clear winter nights, the sky band
  },

  // Lighting and putting out fires (app/fires.js)
  fire: {
    reach: 2.4, cone: 0.7,         // m from the fire, and how near the middle of the view it must be (rad)
    catch: 4,                      // s from a spark to a full fire
    out: 1.6,                      // s for the flames to die down
    embers: 45,                    // s the embers keep glowing (and the chimney smoking) after it is out
  },

  // How the body feels, shown only (app/body.js)
  body: {
    perDay: 0.75, floor: 0.25,     // hunger bar: drain per in-game day, never below this
    food: { apple: 0.15, berry: 0.08, bakedApple: 0.3, grilledFish: 0.4, roastedMushroom: 0.22, water: 0.04, carrot: 0.1, bakedPotato: 0.35, roastedPumpkin: 0.35 },   // how much each fills it
    warm: ['bakedApple', 'grilledFish', 'roastedMushroom', 'bakedPotato', 'roastedPumpkin'],   // cooked food that warms you
    grace: 60, freeze: 180, melt: 25,      // s outdoors in winter before frost starts; s to full frost; s to melt it
    fireWarm: 3.5,                 // m from a burning fire that warms you
  },

  // Footsteps (audio/footsteps.js) and the soundtrack (audio/music.js)
  steps: { stride: 0.72, level: 0.09 },   // m between steps; loudness (subtle, under the ambience)
  music: { level: 0.16, play: [2, 4], rest: [1, 3] },   // of the master volume (the nature sounds stay in front); minutes on / off

  // Fishing from the jetty's head or the anchored boat (app/fishing.js)
  fishing: {
    cast: 6, depth: 0.5,           // m out the float lands; water it needs under it
    rod: 1.7,                      // m, the rod (only shown)
    castTime: 1.1, reelTime: 1.6,  // s
    wait: [5, 25],                 // s before a bite
    dawnDusk: 1.2, dawnDuskFactor: 0.5,   // hours either side of sunrise / sunset when bites come twice as fast
    window: 1.1,                   // s to strike once it bites
    golden: 0.01,                  // share of catches that are a golden fish
    fail: 0.4,                     // share of hooked fish that slip off the hook while you reel in
  },

  // Cooking at a firepit (app/cooking.js)
  cook: {
    push: 2, time: 30,             // s: the stick reaching out to the fire (and back), the cooking
    reach: 0.9,                    // m the stick travels
    over: 0.12,                    // m the food hangs above the middle of the fire
    hand: [0.3, 0.2, 0.45],        // m from the seated eye to the hand: forward, right, down
    hearth: 1.9,                   // m from the cabin's fireplace you can cook at it, standing
  },

  // Sleeping in the cabin's bed (app/sleeping.js)
  sleep: {
    reach: 2.6, cone: 0.6,         // m from the bed, and how near the middle of the view it must be (rad)
    every: 14,                     // in-game hours after falling asleep before you can sleep again
    hours: [7, 9],                 // the clock moves on this much (random) while you sleep
    fade: 1.2, black: 1.0,         // s: fade to black, stay black, fade back in
    lie: 1.7, lookUp: 1.3, tilt: 0.785,   // s to lie back; pitch looking up and the sideways tilt lying (rad)
  },

  // Picking things up and carrying them (app/items.js, app/inventory.js)
  items: {
    stack: 10,                     // pieces of one kind in a quick slot
    reach: 0.95, above: 0.8,       // m around you, and above your eyes, that your hand gets to (crouching / reaching up)
    pickTime: 0.7,                 // s of the crouch / reach and the item flying to you
    throwSpeed: 7,                 // m/s
    maxThrown: 16,                 // thrown things lying about (the oldest goes)
    respawn: 24,                   // in-game hours before what you took is back
    rosePetals: 3,                 // petals a rose bush gives a day
    pileSticks: 10,                // sticks a firepit's woodpile gives a day
    rareShell: 0.0001,             // the chance a shell you pick up is the nautilus (a keepsake for the cabin's shelf)
  },

  // The hand lantern (app/lantern.js): where it waits (m from the cabin's centre, at the porch bench's far end; its
  // height is the bench top above the pad), how close and how squarely you look to take or leave it, where it hangs in
  // view when carried (camera space: right, down, forward) and how strong its light is at night
  lantern: { home: [-0.62, 0.45, 0.5], homeTurn: 0.5, reach: 2.2, cone: 0.45, hand: [0.27, -0.47, -0.56], strength: 1.3 },

  // The well (app/drawWater.js): how close and how squarely you look at it, the seconds the bucket takes down, filling
  // and up, and how long it then shows full
  well: { reach: 2.2, cone: 0.5, down: 2.2, fill: 0.8, up: 3.2, fullFor: 8 },
  // The vegetable garden (app/gardening.js): in-game days from sowing to ripe per crop, how close and how squarely you
  // look at a plot
  garden: { days: { carrot: 2, potato: 3, pumpkin: 4 }, reach: 2.0, cone: 0.3 },
  // Planting saplings (app/planting.js): at most `max`, in-game days to full size, how far down you look (pitch, rad)
  // and how far away the ground may be, and how clear of the island's trees and of each other they must be (m)
  planting: { max: 12, days: 8, pitch: -0.6, reach: 2.4, clear: 2.2, apart: 1.6 },

  // The island's animals (assets/fauna/rabbits.js, squirrels.js, frogs.js, gulls.js): how many, how close you can come
  // before they flee (m), and their pace (s, m/s)
  animals: {
    rabbits: { count: isTouch ? 4 : 6, range: 45, spawn: [15, 40], flee: 5.5, fleeTime: 3, fleeHop: 0.95, fleeHopTime: 0.26, hopTime: 0.3, gone: 16, away: [15, 40] },
    squirrels: { count: 3, flee: 7, roam: 3, speed: 2.2, climb: 1.4, escape: [3.5, 5.5], perch: [8, 25], coneEvery: 120 },
    frogs: { count: 5, size: 1.3, jump: 2.2, leap: 0.7, leapTime: 0.42, under: [20, 45], reappear: 4, dusk: 0.3, croakEvery: [3, 12] },
    gulls: { count: 4, beach: 3, scare: 5, speed: 6, circle: 14, beats: 2.6, flyTime: [20, 45], callEvery: [12, 35] },
  },

  // Storage chests (app/chestUI.js)
  chest: { reach: 2.2, cone: 0.6, lidOpen: 1.69, longPress: 450 },   // lidOpen 97 degrees: the lid then reaches 0.20 m behind its hinge (keep the chest that far from a wall)   // m, rad (in view), rad (lid open), ms (a press that picks how many)

  // The sailboat (app/boating.js)
  boat: {
    maxSpeed: 4.5, reverse: 0.9,   // m/s ahead in a full wind on the best point of sail, astern
    minSpeed: 2.0,                 // m/s with no wind at all (the wind adds up to maxSpeed)
    windFull: 1.0,                 // wind setting (0 still .. 1.6 gusty) at which the boat reaches maxSpeed
    polar: [0.3, 0.75],            // drive head to wind and dead downwind (1 on a beam reach)
    turnSpeed: 1.2,                // m/s from which the wheel turns the boat fully (slower, less)
    accel: 0.5, decel: 1.3,        // m/s^2 (0 to minSpeed in 4 s)
    turnRate: 0.7,                 // rad/s with the wheel hard over at full speed (less when slower, none when still)
    draft: 0.62,                   // m of water the keel needs
    maxOffshore: 90,               // m from the shore; beyond it the boat turns itself back towards the island (the fog hides the island much further out)
    reach: 2.8,                    // m from the hull within which you can board
    dockReach: 6, dockSpeed: 2.2,  // the dock button shows within this of the berth, slower than this
  },
};
