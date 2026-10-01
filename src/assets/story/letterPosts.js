import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';

/**
 * The story's letters as things in the world (app/letters.js reads them): a cream envelope with a red wax seal, pinned
 * to a short weathered post in the ground, or lying flat on a floor, a deck or the bed. Two instanced meshes (posts,
 * envelopes) for all of them, so they cost two draws (and two in the shadow pass); show(i, on) puts one out or takes
 * it away. No random numbers (each post's turn and lean come from its index).
 */
export function createLetterPosts(ctx, sites) {
  const { scene } = ctx, n = sites.length;
  const tint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const k = lin(c), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = k.r; a[i + 1] = k.g; a[i + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  // the post: a squared stake 0.72 m high with a slanted top board the letter sits on
  const stake = new THREE.BoxGeometry(0.07, 0.72, 0.07).translate(0, 0.36, 0), board = new THREE.BoxGeometry(0.3, 0.025, 0.22).rotateX(-0.5).translate(0, 0.73, 0.02);
  const postGeo = mergeGeos([tint(stake, 0x5e4a36), tint(board, 0x7a6248)], ['position', 'normal', 'color']);
  // the envelope: a thin card, its flap's V in a slightly darker cream, the seal
  const card = new THREE.BoxGeometry(0.22, 0.006, 0.15), flap = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.11, 0.0035, -0.075), new THREE.Vector3(0, 0.0035, 0.01), new THREE.Vector3(0.11, 0.0035, -0.075)]);
  flap.computeVertexNormals();
  const seal = new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10).translate(0, 0.006, 0.0);
  const envGeo = mergeGeos([tint(card, 0xf2e8d0), tint(flap, 0xd9cdb0), tint(seal, 0xa11d22)], ['position', 'normal', 'color']);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  const posts = new THREE.InstancedMesh(postGeo, mat, n), envs = new THREE.InstancedMesh(envGeo, mat, n);
  posts.castShadow = envs.castShadow = true; posts.receiveShadow = envs.receiveShadow = true;
  const M = sites.map((s, i) => {
    const turn = i * 2.39996, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0));
    const post = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y - 0.05, s.z), q, new THREE.Vector3(1, 1, 1));
    const env = s.flat
      ? new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + 0.004, s.z), q, new THREE.Vector3(1, 1, 1))
      : new THREE.Matrix4().compose(new THREE.Vector3(s.x - Math.sin(turn) * 0.0, s.y - 0.05 + 0.745, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, turn, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    return { post, env, at: new THREE.Vector3(s.x, s.y + (s.flat ? 0.05 : 0.72), s.z) };
  });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function show(i, on) {
    const m = M[i]; posts.setMatrixAt(i, on && !sites[i].flat ? m.post : zero); envs.setMatrixAt(i, on ? m.env : zero);
    posts.instanceMatrix.needsUpdate = envs.instanceMatrix.needsUpdate = true;
  }
  for (let i = 0; i < n; i++) show(i, false);
  scene.add(posts, envs);
  // (finalizeScene fits the instanced meshes' bounding spheres once; they span the whole archipelago, so never culled)
  posts.frustumCulled = envs.frustumCulled = false;
  return { show, at: i => M[i].at, posts, envs };
}
