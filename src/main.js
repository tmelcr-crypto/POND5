import * as THREE from 'three';
import { isTouch } from './core/env.js';
import { U } from './core/uniforms.js';
import { WATER_Y, SEA_Y } from './world/layout.js';
import { createEngine } from './engine/createEngine.js';
import { finalizeScene } from './engine/finalizeScene.js';
import { mergeStatic } from './engine/mergeStatic.js';
import { createDetailManager } from './engine/detailManager.js';
import { prepareCabinInterior, registerPlotDetail } from './world/plotDetail.js';
import { CONFIG } from './config.js';
import { createSharedTextures } from './world/sharedTextures.js';
import { createSky } from './world/sky.js';
import { createLights } from './world/lights.js';
import { createTerrain, createWorldTerrain } from './world/terrain.js';
import { createGroundTexture, createWorldGrass } from './world/grass.js';
import { createScatter } from './world/scatter.js';
import { createUndergrowth } from './world/undergrowth.js';
import { createTimeOfDay } from './world/timeOfDay.js';
import { createPond, createOcean } from './assets/water/pond.js';
import { createGrass } from './assets/vegetation/grass.js';
import { createSpruce } from './assets/trees/spruce.js';
import { createAppleTree } from './assets/trees/appleTree.js';
import { createScatteredRocks } from './assets/rocks/scatteredRocks.js';
import { createReeds } from './assets/water/reeds.js';
import { createLilyPads } from './assets/water/lilyPads.js';
import { createMeadowFlowers } from './assets/vegetation/meadowFlowers.js';
import { createButterflies, updateButterflies } from './assets/fauna/butterflies.js';
import { createRockOutcrop } from './assets/rocks/rockOutcrop.js';
import { createRoseBush } from './assets/vegetation/roseBush.js';
import { createCabin } from './assets/cabin/cabin.js';
import { createPollen } from './assets/fauna/pollen.js';
import { createControls } from './app/controls.js';
import { createDebugOverlay } from './app/debugOverlay.js';

if (isTouch) document.body.classList.add('touch');

// Engine + shared resources
const ctx = createEngine(document.getElementById('c'));
ctx.tex = createSharedTextures(ctx.maxAniso);

// World. NOTE: keep this order - every builder draws from one seeded random stream (src/core/random.js).
const { sky, skyUniforms, rebuildEnv } = createSky(ctx);
const { sun, hemi, follow: followSun } = createLights(ctx);
// objects each plot builder adds to the scene, for the detail manager (world/plotDetail.js)
const added = fn => { const n = ctx.scene.children.length, r = fn(); return { objs: ctx.scene.children.slice(n), r }; };
createTerrain(ctx);
createPond(ctx);
const plotGrass = added(() => createGrass(ctx)).objs;
const plotSpruce = added(() => createSpruce(ctx)).objs;
const plotApple = added(() => createAppleTree(ctx)).objs;
createScatteredRocks(ctx);
const plotReeds = added(() => createReeds(ctx)).objs;
const pads = createLilyPads(ctx);
const plotFlowers = added(() => createMeadowFlowers(ctx)).objs;
const flies = createButterflies(ctx);
const plotOutcrop = added(() => createRockOutcrop(ctx)).objs;
const plotRose = added(() => createRoseBush(ctx)).objs;
const { cabin, setLights, toggleDoor, update: updateCabin } = createCabin(ctx);
const { pollen, update: updatePollen } = createPollen(ctx);
const plotObjects = ctx.scene.children.length;
// The island around the plot (seeded separately via CONFIG.world.seed, so the plot above is unchanged)
createWorldTerrain(ctx);
const ground = createGroundTexture();
const ocean = createOcean(ctx, ground, SEA_Y);
const worldGrass = createWorldGrass(ctx, ground);
const scatter = createScatter(ctx);
const undergrowth = createUndergrowth(ctx, { scatter, pollen });
const { setSun, scheduleEnv } = createTimeOfDay({ ...ctx, sun, hemi, skyUniforms, rebuildEnv, pollen, cabin });

// Controls + UI
const { st, move, fmtTime, setSpeed, timeIn, timeV } = createControls({ ...ctx, cabin, toggleDoor, setLights, setSun, scheduleEnv });

// Loop
const { renderer, scene, camera } = ctx;
const actEl = document.getElementById('act'), btnDoor = document.getElementById('btnDoor');
btnDoor.addEventListener('pointerdown', e => { e.preventDefault(); toggleDoor(); });
document.getElementById('lightsBtn').addEventListener('click', () => setLights(!cabin.lightsOn));
const posV = document.getElementById('posV'), fpsV = document.getElementById('fpsV');
let last = performance.now(), fAcc = 0, fN = 0;
function frame(now) {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05); last = now;
  const t = (U.uTime.value += dt);
  move(dt);
  sky.position.copy(camera.position);
  followSun(camera.position);
  worldGrass.update(camera.position);
  ocean.update(camera.position);
  camera.updateMatrixWorld(); scatter.update(camera, debug.on); undergrowth.update(camera, t, debug.on); detail.update(dt);
  updateCabin(dt, t);
  const nearDoor = camera.position.distanceTo(cabin.door.world) < 2.8;
  if (nearDoor !== st.nearDoor) { st.nearDoor = nearDoor; actEl.classList.toggle('hide', !(nearDoor && st.playing && !isTouch)); btnDoor.style.display = nearDoor && st.playing ? '' : 'none'; }
  if (plotBands.pads.on) for (let i = 0; i < pads.length; i++) { const p = pads[i]; p.position.y = WATER_Y + 0.006 + Math.sin(t * 1.3 + p.userData.ph) * 0.0035; p.rotation.y += Math.sin(t * 0.4 + p.userData.ph) * 0.0006; }
  updateButterflies(flies, t, camera.position, CONFIG.detail.butterflies);
  if (plotBands.pollen.on) updatePollen(t);
  renderer.render(scene, camera);
  debug.frame(now);
  fAcc += dt; fN++;
  if (fAcc > 0.5) { fpsV.textContent = Math.round(fN / fAcc) + ' fps'; posV.textContent = `x ${st.pos.x.toFixed(1)}  y ${st.pos.y.toFixed(1)}  z ${st.pos.z.toFixed(1)}`; fAcc = 0; fN = 0; }
  requestAnimationFrame(frame);
}

prepareCabinInterior(cabin);   // interior gets its own materials, so the merge keeps it apart from the walls
const cabinMerge = mergeStatic(cabin.group, { ...cabin, group: null }); // ~360 cabin meshes -> a few dozen draw calls, same look
// distance-based detail of the plot, with the island's rules (see world/plotDetail.js)
const detail = createDetailManager(camera);
const plotBands = registerPlotDetail(ctx, detail, { spruce: plotSpruce, apple: plotApple, rose: plotRose, reeds: plotReeds, flowers: plotFlowers, outcrop: plotOutcrop, pads, grass: plotGrass, pollen, cabin });
finalizeScene(scene, cabin.group);
const debug = createDebugOverlay(renderer, { scatter, worldGrass, undergrowth });
window.__meadow = { renderer, scene, camera, st, move, cabinGroup: cabin.group, scatter, undergrowth, detail, cabinMerge, worldObjects: scene.children.slice(plotObjects) };
setLights(true);
setSun(+timeIn.value); timeV.textContent = fmtTime(+timeIn.value); scheduleEnv(true); setSpeed(2.2);
move(0);
renderer.compile(scene, camera);   // every program now (everything is still visible), so nothing hitches when it first appears
requestAnimationFrame(frame);
