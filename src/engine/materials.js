// Shared materials. The whole static world and every character body use ONE
// vertex-coloured toon material, so draw calls stay low on Chromebooks.

import * as THREE from 'three';

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([110, 175, 225, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

let vcMat = null;
/** Vertex-coloured toon material shared by all merged geometry. */
export function vertexMaterial() {
  if (!vcMat) vcMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  return vcMat;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts }));
  return cache.get(key);
}

export function basic(color, opts = {}) {
  const key = `basic|${color}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
  return cache.get(key);
}

let blob = null;
/** Soft round contact shadow used under characters and props. */
export function blobShadowMaterial() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(20,30,40,0.42)');
  grd.addColorStop(0.6, 'rgba(20,30,40,0.22)');
  grd.addColorStop(1, 'rgba(20,30,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  blob = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return blob;
}

const blobGeo = new THREE.PlaneGeometry(1, 1);
blobGeo.rotateX(-Math.PI / 2);
export function makeBlobShadow(size = 0.8) {
  const m = new THREE.Mesh(blobGeo, blobShadowMaterial());
  m.scale.set(size, 1, size);
  m.position.y = 0.015;
  m.renderOrder = 1;
  return m;
}
