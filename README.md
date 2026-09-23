# Meadow Pond

A first-person, fully procedural meadow built with [three.js](https://threejs.org/): a hand-tuned 10 × 10 m
diorama in the middle of a 100 × 100 m island of rolling hills, spruce groves, apple trees, boulders and beaches.
Every mesh and texture is generated in code — there are no model or image files.

![Meadow Pond preview](docs/preview.png)

**In the scene:** a pond with lily pads, reeds and animated caustics · a Norway spruce with pinecones ·
an apple tree whose crown is made only of individual leaves · a rose bush with spiral-petal roses ·
a stepped sandstone outcrop with moss, lichen and ferns · a furnished, enterable log cabin with a
crackling fireplace, lamps and a working door · wind-blown grass and flowers · butterflies, pollen and
fireflies · a full day/night cycle with stars and moonlight · around it, a seeded island: rolling hills,
spruce groves and apple trees with three levels of detail, boulders, sandy beaches, the sea,
camera-following GPU grass and distance fog.

## Quick start

The project runs straight from the source files; no build step is required.
ES modules must be served over HTTP (opening `index.html` from disk will not work):

```bash
# any static server works, for example:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed address (for example `http://localhost:8000`).

### With Vite (optional, for hot reload and production builds)

```bash
npm install
npm run dev       # dev server with hot reload
npm run build     # production build into dist/
npm run preview   # serve the production build
```

### Deploy to GitHub Pages

A workflow is included in `.github/workflows/pages.yml`. Push to `main`, then enable
**Settings → Pages → Source: GitHub Actions**. The site is published as-is (no build needed).

## Controls

| Desktop | Touch | Action |
| --- | --- | --- |
| Click the scene, move the mouse (or drag) | Drag on the right half | Look around |
| `W` `A` `S` `D` / arrow keys | Drag on the left half (joystick) | Walk (or fly) where you look |
| `G` | Movement button in the panel | Switch between walking on the terrain and free flight |
| `Space` / `E`, `Q` / `C` | Jump / Up / Down buttons | Jump; rise, sink when flying |
| `Shift`, mouse wheel | Speed slider | Boost, set speed |
| `F` near the cabin door | Door button | Open / close the door |
| `L` | Cabin lights switch | Cabin lights on / off |
| `` ` `` | Stats button (top right) | Debug overlay: FPS, draw calls, triangles |
| `Esc` | | Release the mouse |

The panel also sets the **time of day** (04:30 – 23:30) and **wind** strength.

## Project structure

```
index.html                  Page markup, UI overlay, import map for three.js
styles/main.css             UI styling (intro card, panel, touch controls)
src/
  main.js                   Entry point: builds the world in order and runs the render loop
  config.js                 Every tunable of the 100 x 100 m world (size, seed, grass, trees, LOD, shadows, fog, player)
  engine/
    createEngine.js         Renderer (ACES, sRGB, soft shadows), scene with fog, camera, resize
    finalizeScene.js        Post-build pass: point-light masking, program cache keys, instanced culling bounds
    mergeStatic.js          Merges static meshes sharing a material (the cabin: ~350 meshes -> ~95 draws)
    detailManager.js        Distance bands (checked 4x a second, 15% hysteresis) that switch visibility / per-frame work
  core/                     Reusable, scene-independent helpers
    random.js               Seeded PRNG (rng, rr, setSeed)
    math.js                 V (Vector3), UPV, clamp, smooth, lin (sRGB → linear colour)
    noise.js                hash / value noise / fBm in 2D and 3D
    geometry.js             weld, blobGeo, paint, mergeGeos, limb, joint
    canvasTexture.js        canvasTex: draw a texture with the 2D canvas API
    uniforms.js             Shared shader uniforms (time, wind, sun)
    shaderPatches.js        addFlutter / addWorldSway / addThinning / addDistanceFade material patches
    env.js                  isTouch (quality scaling)
  world/                    The site itself
    layout.js               Site plan: asset positions, H(x, z) (diorama inside the plot, hills, beach and
                            sea floor outside), coastline, forest density, exclusion zones, cabin -> pond path
    sharedTextures.js       Textures used by several assets (bark, leaf, needles, ground detail, sprite)
    sky.js                  Sky dome, clouds, stars, moon, PMREM environment map
    lights.js               Sun/moon light, shadow box that follows the player, hemisphere fill
    terrain.js              Plot ground mesh + caustics; island heightmap mesh, grass/dirt/rock/sand shader
    grass.js                World GPU grass: camera-following rings of clumps, distance falloff, wind
    scatter.js              Seeded tree + rock scatter, per-tree distance thinning, 8-angle billboard atlases
    plotDetail.js           The original plot's assets on the detail manager, with the island's distance rules
    undergrowth.js          Bushes, wild roses, fallen logs + stumps, ferns, mushrooms, sticks, cones, meadow flowers,
                            pollen / fireflies around the camera
    bounds.js               Soft boundary (wading depth at the shore, world edge when flying), trunk and boulder grids
    soilSkirt.js            Soil cross-section of the old diorama edge (no longer built)
    timeOfDay.js            Day/night cycle, fog colour
  assets/                   One factory per scene element
    water/     pond.js (pond + the sea), lilyPads.js, reeds.js
    trees/     spruce.js, appleTree.js        (full-detail generator, the reference tree, island variants)
               fallenLog.js                   (fallen trunk + the stump it broke from, near / far meshes)
    vegetation/grass.js, meadowFlowers.js, roseBush.js (+ wild rose variants), bush.js, forestFloor.js
    rocks/     rockOutcrop.js (+ boulder, finishRock), scatteredRocks.js (+ createRockVariants)
    fauna/     butterflies.js, pollen.js
    cabin/     cabin.js     (structure, fireplace, furniture, props, lights, door)
  app/
    controls.js             Walk / fly controls, touch controls, settings panel, collisions
    debugOverlay.js         FPS / draw call / triangle overlay
standalone/meadow-pond.html The original single-file build (reference / fallback)
```

## How assets work

Each asset module exports a factory that receives a shared context and adds its meshes to the scene:

```js
export function createRoseBush(ctx) {
  const { scene } = ctx;       // also available: renderer, camera, maxAniso, canvas
  const { leafTex } = ctx.tex; // shared textures from world/sharedTextures.js
  // ...build geometry and materials, scene.add(...)
  return { /* anything the render loop needs */ };
}
```

- **Positions** come from `src/world/layout.js` (for example `ROSE`, `ROCK`, `HOUSE`), and ground height
  from `H(x, z)`. Move an asset by editing its entry there. Grass, flowers and terrain colouring read the
  same values, so they stay consistent.
- **Randomness** comes from one seeded stream (`src/core/random.js`). The build order in `src/main.js`
  therefore defines the exact look. Adding or reordering assets changes the variation of later ones;
  call `setSeed()` before a builder if you want an asset to be independent of the others.
- **Animation**: factories return what the loop needs (for example `createCabin` returns
  `update(dt, t)`, `createPollen` returns `update(t)`), and `main.js` calls these every frame.
- **Collisions**: the camera collides with `rockColliders` (ellipsoids, see `layout.js`), tree trunks,
  and the cabin's boxes and roof (see `app/controls.js`).

### Adding a new asset

1. Create `src/assets/<group>/<name>.js` exporting `create<Name>(ctx)`.
2. Add its position to `src/world/layout.js` (and, if it should clear grass, exclude it in
   `assets/vegetation/grass.js` like `inRose` / `inRocks`).
3. Import it in `src/main.js` and call it after the existing builders (to keep the current look intact).
4. Outdoor `MeshStandardMaterial`s are picked up automatically by `finalizeScene`
   (they ignore the cabin's interior point lights).

## The world around the plot

- **Terrain** (`world/terrain.js`, `world/layout.js`): `H(x, z)` is the original diorama height inside
  `|x|, |z| < CONFIG.world.coreHalf` and blends into seeded fBm hills outside. The hills run down to a beach at a
  noisy coastline (`coastDist`, `CONFIG.island`) and on to the sea floor. The world mesh is one 200 x 200
  heightmap cut out under the plot, whose finer ground mesh stays as it was. One shader blends grass (vertex
  colour x detail texture), dirt / forest floor, rock by slope and sand near sea level.
- **Sea** (`createOcean` in `assets/water/pond.js`): one opaque plane at `CONFIG.island.seaLevel` (below the plot's
  pond basin) that follows the camera; colour from the water depth (read from the grass ground texture), a foam
  line at the shore, world-space waves, fog into the sky's horizon colour. Walking deeper than `wadeDepth`
  eases you back to shore.
- **Grass** (`world/grass.js`): only outside the plot (the plot keeps its 64k blades). Density matches the plot
  (`CONFIG.grass.density`: 300 blades/m2 on touch, 640 on desktop) out to 8 m, then falls off continuously as
  `d(r) = full * ((18 - r) / 10)^2`, clumped with low-frequency noise. The vertex shader drops a blade when its
  threshold exceeds `d(r)`, reading height and density from a baked half-float texture; nothing is rebuilt on the
  CPU. Camera-following rings only set the geometry cost (cell size from the density at each ring's inner edge,
  cheaper blades further out); each cell shifts its blade layout by its own hash so no grid shows. Rings are split
  into 8 sectors so the ones behind the camera are culled.
- **Trees and rocks** (`world/scatter.js`): seeded Poisson-style placement driven by `forest(x, z)` (groves between
  the meadow and the beach, spaced at least `minSpacing` apart), kept off the beach and out of `EXCLUSIONS`
  (plot, cabin yard, pond, cabin -> pond path; push more to add zones).
  Every island tree uses the **reference generators** (`buildSpruce`, `buildApple`) at full detail: each species has
  `CONFIG.trees.variants` differently seeded variants, built once in tree-local space. A tree is a small group of
  meshes sharing its variant's geometry, card buffers and materials; its position, rotation and scale are in its
  modelMatrix. Every part has a detail rank (outer / silhouette cards low, twigs and fruit high) and parts are
  stored sorted by rank, so detail thins continuously with distance: keep(d) = 1 up to `CONFIG.trees.keep[0]`, easing
  out to `keep[2]` at `keep[1]`; each tree draws only its first N cards / vertices (one binary search per tree per frame) and
  the shader collapses the rest (`addThinning`, also in the shadow pass); surviving cards grow slightly. Past `CONFIG.trees.fade[0]`
  the tree dissolves (screen-space dither) into a camera-facing billboard baked at load from 8 angles per variant.
  Pinecones switch to a 32-scale version of the same cone past 6 m.
  Boulders use the same draw logic: the reference outcrop's `boulder` + `finishRock` (sandstone, moss, lichen) at
  full detail near the camera (one mesh per rock, `CONFIG.rocks.nearDetail`), dithered into an instanced low-detail
  mesh of the same shape past `CONFIG.trees.fade`. Each boulder collides as a rotated ellipsoid fitted to its mesh
  (`rockBodies` in `bounds.js`): when walking you step onto rocks whose peak is within `player.stepHeight` of your
  feet and are pushed around taller ones. A variant is a plain
  `{ height, width, bounds, parts: [{ geometry, material, depth, instances? }] }` object, so GLB models can replace
  the procedural ones.
- **Undergrowth** (`world/undergrowth.js`, `CONFIG.undergrowth`), placed after the trees and rocks and avoiding them,
  with the same draw logic:
  - leafy bushes (`bush.js`) in and along the woods and wild roses (the reference `buildRose`, 14 canes, merged into
    four meshes) on the meadow side of forest edges: full-detail variants planted like the trees, thinned by rank and
    dissolved into 8-angle billboards over a shorter range (`undergrowth.keep` / `fade`: 8 m, billboards by 11 m);
  - fallen trunks, each lying beside the stump it broke from (matching splinters, end grain, root flares, branch
    stubs, moss, bracket fungi, boletes and fly agarics): a near mesh cross-faded into an instanced far mesh like the
    boulders; the stump collides like a trunk and the log as a chain of ellipsoids (low ones can be stepped on);
  - ferns (the outcrop's fronds), boletes, fly agarics, sticks, spruce cones under the spruces and the plot's meadow
    flowers (same geometry, tints and patch noise): one InstancedMesh per kind whose buffer holds only the 8 m tiles
    near the camera (refilled every 1.5 m of movement), dithered out with `trees.fade`;
  - butterflies (the plot's wings and flight): 3-5 around every wild rose and a few spread over the meadow
    (`butterfliesPerRose`, `meadowButterflies`), drawn only within `butterflyRange` (4 m) of the camera, where they
    shrink in over the last metre; one instanced draw per wing style, none when no butterfly is near;
  - pollen by day / fireflies at night in a box around the camera, sharing the plot's pollen material so the
    time of day drives both (the plot keeps its own).
- **Plot detail** (`engine/detailManager.js`, `world/plotDetail.js`, `CONFIG.detail`): the original plot follows the
  island's rules. Nothing changes within `trees.fade[0]` (15 m). Beyond it, the reference spruce, apple tree and rose
  bush dissolve (dither) into an 8-angle billboard baked from themselves by `trees.fade[1]` (19 m); reeds, meadow
  flowers, the outcrop's ferns, lily pads and the plot grass dissolve per instance / blade on the GPU; the cabin
  interior dissolves over `detail.interior` from the cabin, keeping its lamp and fire glows so the windows still glow,
  and pauses the fire flicker, sparks and clock; the plot's pollen stops beyond `detail.pollen`, its butterflies follow
  the island's 4 m rule. Terrain, pond, cabin exterior, chimney smoke, the outcrop rock and stones always draw. The
  manager only switches things once they are fully faded, a few times a second with hysteresis; lights are never
  toggled (intensity only), and every shader is compiled once at load (`renderer.compile`).
- **Build order:** the world is built after every diorama asset and reseeds the random stream with
  `CONFIG.world.seed`, so the plot looks exactly as before and the world can be re-rolled on its own.
- **Tuning:** every number lives in `src/config.js`.

## Technical notes

- **three.js is pinned to r128** (`0.128.0`). The code uses r128 APIs such as `renderer.outputEncoding`,
  `THREE.sRGBEncoding`, `Color.convertSRGBToLinear()` and shader chunk names like
  `lights_fragment_begin`. Upgrading to a newer three.js requires porting those (colour management,
  renamed chunks such as `encodings_fragment` → `colorspace_fragment`).
- Several materials are customised with `onBeforeCompile` (grass wind, water waves, caustics,
  flutter, sway). `finalizeScene` gives each material a unique `customProgramCacheKey`.
- Quality scales automatically on touch devices (`isTouch`): fewer grass blades and leaves,
  smaller shadow maps, no fireplace shadows. World values are in `src/config.js`; plot values in the asset files.
- `renderer.info` in r128 does not count the shadow pass; the Stats overlay counts it separately.
- The world units are metres; the plot spans −5…5 on x and z, the world −50…50 (the island ~37 m radius), with y up.

## License

No license has been chosen yet. Add a `LICENSE` file before publishing if you want others to reuse the code.
