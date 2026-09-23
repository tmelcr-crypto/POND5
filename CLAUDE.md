# CLAUDE.md

Project rules and context for Claude Code. This file is read automatically at the start
of every session — keep it accurate and short.

## What this project is

Meadow Pond: a first-person three.js scene. A hand-tuned 10 x 10 m meadow diorama
(pond, spruce, apple tree, rose bush, rock outcrop, furnished enterable log cabin),
built entirely from procedural geometry and canvas-drawn textures. There are no model
or image files in the repo.

The diorama now sits in the middle of a seeded island in a 100 x 100 m world (hills, groves,
beaches, sea, scatter, GPU grass; see README "The world around the plot"). All world tunables are in `src/config.js`.
The longer-term goal is a streaming 500 x 500 m world while keeping the existing close-up
quality near the camera. See `ROADMAP.md`.

## Read these before changing anything

- `README.md` — structure, the asset factory pattern, build order and the seeded RNG
- `src/world/layout.js` — site plan and `H(x, z)`, the terrain height function everything samples
- `src/config.js` — world size, seed, grass, tree counts, LOD distances, shadows, fog, player
- `src/main.js` — build order and the render loop
- `src/assets/trees/spruce.js`, `src/assets/vegetation/grass.js` — the two heaviest assets

## Hard constraints

- **three.js is pinned to r128 (`0.128.0`). Do not upgrade it.** The code depends on r128
  APIs: `renderer.outputEncoding`, `THREE.sRGBEncoding`, `Color.convertSRGBToLinear()`,
  and shader chunk names such as `lights_fragment_begin` and `encodings_fragment`.
  Upgrading silently breaks the water, grass, caustics and colour handling.
- **No build step is required.** `index.html` loads three.js through an import map, so the
  project runs from any static server. Vite exists as an optional convenience only —
  don't make it mandatory.
- **Target device: iPad Pro M2 in Safari, 60 fps sustained** (after ~5 minutes, thermally
  throttled), not peak. Desktop should be comfortable.
- **Quality bar:** anything within ~15 m of the camera must keep the current diorama quality.
- **Build order matters.** Every asset draws from one seeded random stream
  (`src/core/random.js`), so the order of the calls in `src/main.js` defines the exact look.
  Add new assets at the end, or call `setSeed()` to isolate one. The world (`createWorldTerrain`,
  `createWorldGrass`, `createScatter`) is built after the plot and reseeds with `CONFIG.world.seed`.
- `standalone/meadow-pond.html` is a frozen reference copy of the original single-file
  build. Do not edit or "keep it in sync".

## Ask me first before

- upgrading three.js, or adding any dependency
- adding or requiring a build step
- changing the visual look of anything within 15 m of the camera
- committing (tell me what changed first)
- deleting or rewriting a whole asset module

## How I want you to work

- Small, reviewable commits with clear messages.
- Keep the 10 x 10 scene runnable at every step — it is the quality reference and, in the
  final design, should survive as an authored chunk.
- Measure before optimising and tell me the number. No "this should be faster" claims.
- If a design target is wrong, say so with the measurement that shows it, rather than
  working around it.
- Prefer editing an existing module over adding a parallel one.

## Architecture in one paragraph

`src/core/` holds scene-independent helpers (seeded RNG, noise, geometry tools, canvas
textures, shared uniforms, material patches). `src/world/` holds the site itself (layout
and terrain height, sky, lights, terrain mesh, day/night). `src/assets/` holds one factory
per scene element, each exporting `create<Name>(ctx)` that adds its meshes to the scene and
returns whatever the render loop needs. `src/app/controls.js` has flight, touch controls,
the settings panel and collisions. `src/engine/finalizeScene.js` runs once after every asset
is built: it makes outdoor materials skip point lights (so cabin lamps don't leak through
log walls), gives each material a unique program cache key, and fits instanced-mesh
bounding spheres for culling.

## Running it

```bash
npx serve .            # or: python3 -m http.server 8000
```

ES modules must be served over HTTP; opening `index.html` from disk will not work.
Pushing to `main` publishes to GitHub Pages via `.github/workflows/pages.yml`
(enable once under Settings > Pages > Source: GitHub Actions). That published URL is how
the scene gets tested on the iPad.

## Performance notes (current scene)

- Use the Stats overlay (top-right button). `renderer.info` in r128 excludes the shadow pass; the
  overlay shows the total and the main pass separately.
- The plot alone costs ~330 draw calls / 1.65M triangles on touch at the start view (incl. shadows);
  the world adds ~45 calls / ~1.3M, most of it world grass matched to the plot's density out to 18 m
  (~126k live blades on touch). The densest tree group is ~19 trees within 15 m (`scatter.minSpacing`). Cabin meshes are merged by `engine/mergeStatic.js`.
- Plot grass: ~64k instanced blades (30k touch), GPU wind, never casts shadows. World grass: rings in
  `world/grass.js` (density / radius in `config.js`), also no shadows; only ~1/3 of submitted blade slots
  end up visible, the rest are discarded in the vertex shader.
- Apple tree: ~23k individual leaf cards. Spruce: ~10k needle sprays. Both merged at build time.
- Pixel ratio capped at 1.5 on touch devices; shadow map 2048 there, 4096 on desktop.
- The fireplace point light casts shadows on desktop only.
- Quality scaling keys off `isTouch` in `src/core/env.js`.
