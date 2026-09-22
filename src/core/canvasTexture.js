import * as THREE from 'three';

/** Draw into an offscreen canvas and wrap it as a texture (sRGB by default). */
export function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
