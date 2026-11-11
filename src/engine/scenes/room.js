// Shared helpers for interior "dollhouse" rooms (south wall cut away so the
// camera can look in from the south).

import * as THREE from 'three';
import { textTexture } from '../textures.js';

export function floorMesh(w, d, texture, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: texture }));
  texture.repeat.set(w / 3.5, d / 3.5);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.001, z);
  m.receiveShadow = true;
  return m;
}

/** Walls for a rectangular room. doors: [{ side: 'e'|'w'|'n', from, to }] */
export function walls(b, { minX, maxX, minZ, maxZ, h = 3, color = '#F6F1E7', base = '#C8B79F', doors = [] }) {
  const t = 0.2;
  const seg = (side, a1, a2) => {
    const gaps = doors.filter((d) => d.side === side).sort((p, q) => p.from - q.from);
    let cur = a1;
    const pieces = [];
    for (const g of gaps) { if (g.from > cur) pieces.push([cur, g.from]); cur = g.to; }
    if (cur < a2) pieces.push([cur, a2]);
    return pieces;
  };
  for (const [a, c] of seg('n', minX, maxX)) {
    b.box(c - a, h, t, color, (a + c) / 2, 0, minZ - t / 2, { collide: true });
    b.box(c - a, 0.18, t + 0.04, base, (a + c) / 2, 0, minZ - t / 2);
  }
  for (const [a, c] of seg('w', minZ, maxZ)) {
    b.box(t, h, c - a, color, minX - t / 2, 0, (a + c) / 2, { collide: true, shade: 0.94 });
    b.box(t + 0.04, 0.18, c - a, base, minX - t / 2, 0, (a + c) / 2);
  }
  for (const [a, c] of seg('e', minZ, maxZ)) {
    b.box(t, h, c - a, color, maxX + t / 2, 0, (a + c) / 2, { collide: true, shade: 0.94 });
    b.box(t + 0.04, 0.18, c - a, base, maxX + t / 2, 0, (a + c) / 2);
  }
  // South edge: a low baseboard only (the cutaway side), but it still blocks walking.
  b.box(maxX - minX + t * 2, 0.22, 0.16, base, (minX + maxX) / 2, 0, maxZ + 0.08);
  b.collideBox((minX + maxX) / 2, maxZ + 0.08, maxX - minX + t * 2, 0.16, 0, 3);
  // Door gaps still block outward walking beyond the wall line.
  for (const d of doors) {
    if (d.side === 'e') b.collideBox(maxX + 0.6, (d.from + d.to) / 2, 0.4, d.to - d.from, 0, 3);
    if (d.side === 'w') b.collideBox(minX - 0.6, (d.from + d.to) / 2, 0.4, d.to - d.from, 0, 3);
  }
}

export function wallPlane(w, h, opts, x, y, z, ry = 0) {
  const t = textTexture(Math.round(256 * (w / h)), 256, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !opts.bg, toneMapped: false }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

/** A soft outdoor view for windows. */
export function windowView(kind = 'day') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 256);
  if (kind === 'evening') { sky.addColorStop(0, '#263257'); sky.addColorStop(1, '#E98A6B'); }
  else if (kind === 'rain') { sky.addColorStop(0, '#8C9BAA'); sky.addColorStop(1, '#C3CCD5'); }
  else if (kind === 'night') { sky.addColorStop(0, '#141B33'); sky.addColorStop(1, '#3B3F6B'); }
  else { sky.addColorStop(0, '#7CC6F6'); sky.addColorStop(1, '#DDF2FF'); }
  g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
  g.fillStyle = kind === 'night' || kind === 'evening' ? '#3E4B5E' : '#8CCB72';
  g.beginPath(); g.moveTo(0, 210); g.quadraticCurveTo(140, 150, 300, 200); g.quadraticCurveTo(420, 170, 512, 190); g.lineTo(512, 256); g.lineTo(0, 256); g.fill();
  if (kind !== 'night') {
    for (let i = 0; i < 9; i++) {
      g.fillStyle = ['#FFB8D2', '#FFA3C4', '#FFD0E1'][i % 3];
      g.beginPath(); g.arc(30 + i * 58, 175 + (i % 2) * 18, 34, 0, Math.PI * 2); g.fill();
    }
  } else {
    g.fillStyle = '#FFF6C9';
    for (let i = 0; i < 20; i++) { g.beginPath(); g.arc((i * 97) % 512, (i * 53) % 140, 1.6, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(420, 60, 18, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roomLights(root) {
  const hemi = new THREE.HemisphereLight('#FFF8EE', '#B9A58C', 1.9);
  const sun = new THREE.DirectionalLight('#FFF1DC', 1.7);
  sun.position.set(-12, 18, 8);
  const fill = new THREE.PointLight('#FFE2B8', 0, 14, 1.6);
  fill.position.set(0, 2.7, 0);
  root.add(hemi, sun, sun.target, fill);
  return { hemi, sun, fill };
}
