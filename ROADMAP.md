# Roadmap: 10 x 10 m diorama to a streaming 500 x 500 m world

Goal: a 500 x 500 m world that streams continuously while walking or flying, keeping the
current diorama quality near the camera and using progressively cheaper representations
further out.

Read `CLAUDE.md` first — it holds the hard constraints (three.js pinned to r128, no build
step, iPad M2 at 60 fps sustained, 15 m quality bar).

## Design targets

These are starting points, to be confirmed or corrected by the Phase 1 measurements.

- **Chunks:** 50 x 50 m, generated in a Web Worker, seeded by chunk coordinates so
  generation order no longer affects the result.
- **Rings:** full detail to ~60 m, reduced geometry to ~150 m, billboard impostors beyond,
  plus one always-resident coarse heightfield for the whole map.
- **Grass:** ~400-500 blades/m² out to 8 m, falling off continuously to zero at ~18 m with
  `d(r) = full * ((R - r) / (R - 8))^2`, clumped with low-frequency noise, blades scaled up
  slightly as density drops. Implemented on the GPU: a camera-following grid where the vertex
  shader scales a blade to zero when `hash(blade) > d(r) / full`. Never rebuild instance
  buffers on the CPU per frame.
- **Pixel ratio** capped at 1.5. Grass never casts shadows. Shadow cascades, or one
  texel-snapped shadow box that follows the camera.
- **Speed:** safe speed is roughly (hysteresis band width) / (cross-fade duration).
  A 10 m band with a 0.25 s fade allows ~40 m/s; scale LOD distances with speed.

## Phase 1 — performance spike (do this first, alone)

Build a throwaway spike in `spike/`. Do not refactor `src/` yet.

Contents: chunked terrain + GPU-falloff grass + instanced spruce at 3 LODs + impostors.
No cabin, no rose bush, no rocks, no water detail.

It must include:

- an on-screen readout: frame time (rolling average), draw calls, triangles, active chunks,
  live grass blade count
- one config object with runtime-tunable values: `fullDensity`, `grassFalloffRadius`,
  `lodDistances`, `pixelRatio`, `chunkSize`, `loadRadius`
- a walk/fly toggle to test at 2 m/s and at 25 m/s

Deliverable: measured sustained frame time on desktop, recommended iPad numbers, and where
the budget actually went. **Stop there.** The iPad numbers come back from a real device
before Phase 2 starts.

## Phase 2 — terrain

`H(x, z)` becomes layered: a base fBm landscape, a feature registry (lake basins, flat pads,
river channel, paths) each with its own blend radius, and a biome mask returning meadow,
forest, rock, shore or wetland. Terrain colouring and asset density both read that mask.
Chunks mesh at a resolution that falls with distance; the soil skirt moves to the map edge.

## Phase 3 — assets become prototypes plus placers

Split each asset in two:

- a **prototype factory** returning shared geometry and materials at 2-3 LODs (full,
  reduced counts, billboard impostor rendered from the full version at load)
- a **placer** that writes per-chunk `InstancedMesh` entries

Order: spruce, apple tree, then rose bush and rocks. The generators are parameterised
already, so the medium LOD is the same code with lower counts — expose the density numbers
as arguments rather than modelling anything twice.

Add cross-fade plus hysteresis on LOD switches to avoid popping.

## Phase 4 — scattering

Poisson-disc sampling per chunk, density driven by the biome mask, with an exclusion
registry that assets register into. This replaces the ad-hoc `inRocks`, `inRose` and
`houseRectDist` checks, which would otherwise multiply into dozens of special cases.

## Phase 5 — lighting, collisions, interiors

- Cascaded shadow maps, or a texel-snapped shadow box following the camera. Only near-ring
  objects cast shadows.
- Distance fog matched to the sky horizon colour (also hides the streaming edge).
- Replace the blunt "outdoor materials skip all point lights" trick in
  `src/engine/finalizeScene.js` with per-light bounding boxes, so several buildings can have
  lit interiors.
- Spatial-grid collision keyed by chunk instead of linear scans.

## Content to fill the world with

Terrain variety (larger lake with a stream, rocky ridge, wooded slope, wetland) ·
spruce and birch stands with undergrowth · bushes, ferns, cattails, reed beds ·
wildflower patches varying by biome · deadfall logs and stumps · boulder fields and cliffs ·
a dirt path network, fence lines, a barn, a shed, a jetty, a well · birds, more butterflies,
fish in the shallows.

Note: filling 250,000 m² convincingly is a bigger job than making it run. Procedural
scatter alone reads as wallpaper at that scale; the world needs larger structure — ridges,
a river, forest edges, clearings and a few landmarks.

## Open questions

- Does every building need a furnished interior, or are most exterior shells with one or two
  enterable? This changes the architecture more than the map size does.
- Will there ever be faster travel (vehicle, fast flight)? Prefetch design depends on it and
  is cheaper to decide now than to retrofit.

## Starter prompt

> Read `CLAUDE.md`, `README.md`, `src/world/layout.js`, `src/main.js`,
> `src/assets/trees/spruce.js` and `src/assets/vegetation/grass.js`. Then tell me your plan
> for the Phase 1 spike in `ROADMAP.md`, including what you expect the bottleneck to be.
> Don't write code until I reply.
