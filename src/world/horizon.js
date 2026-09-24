import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { smooth } from '../core/math.js';
import { SEA_Y } from './layout.js';

/**
 * Signs of a wider world on the horizon: a sailboat that now and then crosses far out at sea, and a lighthouse
 * (white and red by day; a lit lamp room and a slowly turning beam at night).
 *
 * They are far beyond the camera's far plane (150 m) and the scene fog (93 % at 150 m), so each is kept at its true
 * world position but drawn as a scaled-down proxy at HORIZON.drawDist along the same line of sight (same angular size
 * and direction), with the fog computed from its true distance at HORIZON.fogK of the scene's strength, like the
 * birds: they sink into the haze at 400-700 m instead of vanishing. Unlit silhouettes; the day brightness comes from
 * the sky's night value. Every number is in HORIZON; the lighthouse's position is CONFIG.horizon.lighthouse.
 */
export const HORIZON = {
  drawDist: 100,               // m: where the proxies are drawn
  fogK: 0.2,                   // fraction of the scene fog's density applied over the true distance
  boat: {
    every: [240, 480],         // s between crossings
    duration: [180, 240],      // s a crossing takes
    clear: 400,                // m from any island, at least
    lighthouseClear: 120,      // m from the lighthouse rock
    range: [420, 700],         // m from the home island's centre, the passing distance
    color: 0x2a2f37, sail: 0x454b54,
    night: [0.3, 0.6],         // fades out as the sky's night value goes from [0] to [1]
  },
  lighthouse: {
    height: 17, radius: [1.7, 1.15], bands: 4,    // m; red and white bands
    beam: { length: 140, spread: 0.09, period: 12, opacity: 0.22, night: [0.35, 0.6] },
  },
};
const rr = (a, b) => a + (b - a) * Math.random();
const V3 = THREE.Vector3;

/** An unlit material whose fog uses the object's true distance (uniform) at a fraction of the scene's density. */
function farMaterial(params, dist) {
  const m = new THREE.MeshBasicMaterial(params);
  m.onBeforeCompile = s => {
    s.uniforms.uTrueDist = dist; s.uniforms.uFogK = { value: HORIZON.fogK };
    s.fragmentShader = 'uniform float uTrueDist; uniform float uFogK;\n' + s.fragmentShader.replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fd = uTrueDist * uFogK;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fogDensity * fogDensity * fd * fd));
        #endif
      #endif`);
  };
  return m;
}

/** createHorizon(ctx): ctx needs scene, camera and skyUniforms. Returns update(dt), stats and the parts. */
export function createHorizon(ctx) {
  const { scene, camera, skyUniforms } = ctx, HZ = HORIZON, CH = CONFIG.horizon, stats = { boat: false, beam: 0, boatDist: 0 };

  /* ---- lighthouse on its rock ---- */
  const L = HZ.lighthouse, LP = new V3(CH.lighthouse.x, SEA_Y, CH.lighthouse.z), lhDist = { value: 0 };
  const light = new THREE.Group();
  const tower = new THREE.CylinderGeometry(L.radius[1], L.radius[0], L.height, 12, L.bands * 2, true); tower.translate(0, L.height / 2 + 2, 0);
  { const p = tower.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const k = Math.floor((p.getY(i) - 2) / L.height * L.bands * 2 - 1e-3); const red = k % 2 === 1; c.set(red ? [0.62, 0.1, 0.08] : [0.92, 0.92, 0.88], i * 3); } tower.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const lhMat = farMaterial({ vertexColors: true }, lhDist), dark = farMaterial({ color: 0x3a3a3c }, lhDist);
  light.add(new THREE.Mesh(tower, lhMat));
  const rock = new THREE.DodecahedronGeometry(CH.lighthouse.rock, 1); rock.scale(1, 0.45, 1); rock.translate(0, 1.2, 0);
  light.add(new THREE.Mesh(rock, dark));
  const gallery = new THREE.CylinderGeometry(L.radius[1] + 0.5, L.radius[1] + 0.5, 0.35, 12); gallery.translate(0, L.height + 2.2, 0); light.add(new THREE.Mesh(gallery, dark));
  const lampMat = farMaterial({ color: 0x55585c }, lhDist), lamp = new THREE.CylinderGeometry(L.radius[1] * 0.8, L.radius[1] * 0.8, 1.8, 12); lamp.translate(0, L.height + 3.3, 0); light.add(new THREE.Mesh(lamp, lampMat));
  const roof = new THREE.ConeGeometry(L.radius[1] + 0.2, 1.6, 12); roof.translate(0, L.height + 5, 0); light.add(new THREE.Mesh(roof, farMaterial({ color: 0x8a1a12 }, lhDist)));
  // the beam: two soft additive cones back to back, turning about the tower
  const B = L.beam, beamU = { uBeamA: { value: 0 } };
  const beamGeo = new THREE.ConeGeometry(B.length * Math.tan(B.spread), B.length, 16, 1, true); beamGeo.translate(0, -B.length / 2, 0); beamGeo.rotateZ(Math.PI / 2);   // apex at the lamp, opening along +x
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vAlong; void main() { vAlong = clamp(position.x / ' + B.length.toFixed(1) + ', 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uBeamA; varying float vAlong; void main() { gl_FragColor = vec4(vec3(1.0, 0.93, 0.75) * uBeamA * (1.0 - vAlong) * (1.0 - vAlong) * smoothstep(0.0, 0.04, vAlong), 1.0); }',
  });
  const beam = new THREE.Group(); beam.position.y = L.height + 3.3;
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI; beam.add(b1, b2); beam.visible = false; light.add(beam);
  light.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 1; } });
  scene.add(light);

  /* ---- sailboat: low-poly hull, mast and one sail ---- */
  const boatDist = { value: 0 }, boat = new THREE.Group();
  const hull = new THREE.BufferGeometry(); {
    const Lh = 8, W = 1.3, D = 1.1, v = [[Lh / 2, 0.2, 0], [-Lh / 2, 0.3, W], [-Lh / 2, 0.3, -W], [-Lh / 2 + 1.5, -D, 0], [Lh / 2 - 1, 0.25, W * 0.8], [Lh / 2 - 1, 0.25, -W * 0.8]];
    const idx = [0, 4, 3, 0, 3, 5, 4, 1, 3, 5, 3, 2, 1, 2, 3, 0, 5, 2, 0, 2, 1, 0, 1, 4];
    hull.setAttribute('position', new THREE.Float32BufferAttribute(idx.flatMap(i => v[i]), 3)); hull.computeVertexNormals();
  }
  const boatMat = farMaterial({ color: HZ.boat.color, side: THREE.DoubleSide, transparent: true }, boatDist);
  const sailMat = farMaterial({ color: HZ.boat.sail, side: THREE.DoubleSide, transparent: true }, boatDist);
  boat.add(new THREE.Mesh(hull, boatMat));
  const mast = new THREE.CylinderGeometry(0.08, 0.1, 10.5, 5); mast.translate(0.6, 5.4, 0); boat.add(new THREE.Mesh(mast, boatMat));
  const sh = new THREE.Shape(); sh.moveTo(0.7, 0.9); sh.lineTo(0.7, 10.4); sh.lineTo(-3.2, 0.9); sh.closePath();   // mainsail
  const jib = new THREE.Shape(); jib.moveTo(0.5, 9.6); jib.lineTo(3.9, 0.6); jib.lineTo(0.5, 0.9); jib.closePath();
  boat.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), sailMat), new THREE.Mesh(new THREE.ShapeGeometry(jib), sailMat));
  boat.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 1; } });
  boat.visible = false; scene.add(boat);

  const BT = HZ.boat, isl = () => CH.islands.concat([{ x: CH.lighthouse.x, z: CH.lighthouse.z, r: CH.lighthouse.rock + BT.lighthouseClear - BT.clear }]);
  const trip = { on: false, a: new V3(), b: new V3(), t: 0, T: 1, dir: new V3() };
  const tripOk = (a, b) => { for (let k = 0; k <= 64; k++) { const x = a.x + (b.x - a.x) * k / 64, z = a.z + (b.z - a.z) * k / 64; for (const s of isl()) if (Math.hypot(x - s.x, z - s.z) < s.r + BT.clear) return false; } return true; };
  function startTrip() {
    for (let i = 0; i < 40; i++) {   // a straight course passing `d` from the home island, long enough for the trip at 3-5 m/s
      const d = rr(...BT.range), ang = rr(0, 6.2832), T = rr(...BT.duration), half = T * rr(3, 4.5) / 2;
      const c = new V3(Math.cos(ang) * d, SEA_Y, Math.sin(ang) * d), t = new V3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      const a = c.clone().addScaledVector(t, -half), b = c.clone().addScaledVector(t, half);
      if (tripOk(a, b)) { Object.assign(trip, { on: true, t: 0, T }); trip.a.copy(a); trip.b.copy(b); trip.dir.copy(t); return true; }
    }
    return false;
  }
  let nextTrip = rr(20, 60);

  // proxy placement: true position P -> drawn at drawDist along the line of sight, scaled to the same angular size
  const tmp = new V3();
  function place(obj, P, distU, yaw) {
    tmp.copy(P).sub(camera.position); const d = tmp.length(), k = HZ.drawDist / d;
    obj.position.copy(camera.position).addScaledVector(tmp, k); obj.scale.setScalar(k); if (yaw !== undefined) obj.rotation.y = yaw;
    distU.value = d; return d;
  }
  const truePos = new V3();
  return {
    stats, light, beam, boat, trip, startTrip,
    update(dt) {
      const night = skyUniforms.uNight.value, day = 1 - night * 0.85;
      // lighthouse
      place(light, LP, lhDist);
      lhMat.color.setScalar(day); dark.color.setRGB(0.15 * day, 0.15 * day, 0.16 * day);
      const lit = smooth(B.night[0], B.night[1], night);
      lampMat.color.setRGB(0.33 * day + 1.6 * lit, 0.34 * day + 1.3 * lit, 0.36 * day + 0.6 * lit);
      beam.visible = lit > 0.01; beamU.uBeamA.value = B.opacity * lit; beam.rotation.y += dt * 6.2832 / B.period; stats.beam = lit;
      // sailboat
      if (!trip.on) { nextTrip -= dt; if (nextTrip <= 0) { startTrip(); nextTrip = rr(...BT.every); } }
      const vis = 1 - smooth(BT.night[0], BT.night[1], night);
      if (trip.on) {
        trip.t += dt; const u = trip.t / trip.T;
        if (u >= 1) { trip.on = false; boat.visible = false; }
        else {
          truePos.lerpVectors(trip.a, trip.b, u);
          const d = place(boat, truePos, boatDist, Math.atan2(-trip.dir.z, trip.dir.x)); stats.boatDist = d;
          boat.rotation.x = Math.sin(trip.t * 0.9) * 0.04; boat.rotation.z = 0.08 + Math.sin(trip.t * 0.7) * 0.03;   // heel and roll
          const edge = Math.min(1, u * 12, (1 - u) * 12);                 // fades in and out at the ends of the trip
          boatMat.opacity = sailMat.opacity = vis * edge; boat.visible = vis * edge > 0.01;
        }
      }
      stats.boat = boat.visible;
    },
  };
}
