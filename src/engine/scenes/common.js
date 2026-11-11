// Prefabs shared by the scenes. Each adds parts to a StaticBuilder (merged
// later) and returns any spots/colliders the scene needs.

import * as THREE from 'three';
import { G } from '../builder.js';
import { textTexture } from '../textures.js';

export const PAL = {
  grass: '#8FCB6B', grass2: '#7DBE5C', grassDark: '#6AAE4C', field: '#9AD472',
  road: '#6E7681', roadLine: '#F4F1E8', sidewalk: '#E6DCCB', curb: '#CFC3AF',
  sand: '#E8D5A6', path: '#E9D9B5', stone: '#C9C3B8', water: '#69C3E6',
  trunk: '#8A5A3C', leaf: '#5DB04E', leaf2: '#4F9F43', sakura: '#FFB8D2', sakura2: '#FFA3C4', sakura3: '#FFD0E1',
  wood: '#C08A5A', woodDark: '#8F5F3A', white: '#FFFFFF', cream: '#FFF6E6', metal: '#9AA3AD', dark: '#3D4451',
  roofBlue: '#3E5C8A', roofRed: '#B5524A', roofTeal: '#2F8F8A', roofGray: '#5B6270', glass: '#A8DDF5',
};

// Triangular prism for gable roofs: apex up, length along Z, base at y=-0.5.
let prism = null;
function prismGeo() {
  if (prism) return prism;
  prism = new THREE.CylinderGeometry(1, 1, 1, 3);
  prism.rotateX(-Math.PI / 2);
  return prism;
}

export function roof(b, x, baseY, z, w, h, len, color, ry = 0) {
  // Unit prism: base width 1.732, height 1.5, base at -0.5.
  b.add(prismGeo(), color, { x, y: baseY + h / 3, z, ry, sx: w / 1.732, sy: h / 1.5, sz: len });
}

export function sakura(b, x, z, s = 1, colors = [PAL.sakura, PAL.sakura2, PAL.sakura3]) {
  b.cyl(0.16 * s, 0.24 * s, 2.0 * s, PAL.trunk, x, 0, z, { seg: 7, collide: true });
  b.add(G.cyl(6), PAL.trunk, { x: x + 0.35 * s, y: 1.8 * s, z, rz: -0.7, sx: 0.16 * s, sy: 1.0 * s, sz: 0.16 * s });
  (b.canopies ||= []).push({ x, z, r: 1.7 * s, y0: 1.3 * s, y1: 4.2 * s });
  const blobs = [[0, 2.6, 0, 1.25], [0.85, 2.35, 0.3, 0.9], [-0.8, 2.4, -0.2, 0.95], [0.2, 3.2, -0.5, 0.85], [-0.3, 2.3, 0.75, 0.8]];
  blobs.forEach(([dx, dy, dz, r], i) => b.add(G.ico(1), colors[i % colors.length], { x: x + dx * s, y: dy * s, z: z + dz * s, sx: 2 * r * s, sy: 1.7 * r * s, sz: 2 * r * s }));
}

export function tree(b, x, z, s = 1, color = PAL.leaf) {
  b.cyl(0.15 * s, 0.22 * s, 1.6 * s, PAL.trunk, x, 0, z, { seg: 7, collide: true });
  (b.canopies ||= []).push({ x, z, r: 1.3 * s, y0: 1.2 * s, y1: 3.6 * s });
  b.add(G.ico(1), color, { x, y: 2.4 * s, z, sx: 2.1 * s, sy: 2.3 * s, sz: 2.1 * s });
  b.add(G.ico(1), PAL.leaf2, { x: x + 0.5 * s, y: 2.0 * s, z: z + 0.3 * s, sx: 1.3 * s, sy: 1.2 * s, sz: 1.3 * s });
}

export function bush(b, x, z, s = 1, color = PAL.leaf2) {
  b.add(G.ico(1), color, { x, y: 0.35 * s, z, sx: 1.1 * s, sy: 0.75 * s, sz: 1.1 * s });
}

/** Bench facing +Z at yaw 0. Returns two sit spots. */
export function bench(b, x, z, ry = 0, color = PAL.wood) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const loc = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = loc(0, 0);
  b.box(1.7, 0.08, 0.45, color, px, 0.42, pz, { ry });
  [px, pz] = loc(0, -0.22);
  b.box(1.7, 0.36, 0.06, color, px, 0.52, pz, { ry });
  for (const lx of [-0.72, 0.72]) {
    [px, pz] = loc(lx, 0);
    b.box(0.08, 0.42, 0.42, PAL.dark, px, 0, pz, { ry });
  }
  b.collideBox(x, z, 1.7, 0.5, ry, 0.9);
  const seats = [-0.42, 0.42].map((lx) => { const [sx, sz] = loc(lx, 0.05); return { x: sx, z: sz, yaw: ry, seatY: 0.46 }; });
  const front = loc(0, 0.9);
  return { seats, front: { x: front[0], z: front[1] }, under: { x, z }, on: { x, z } };
}

export function lamp(b, x, z, h = 3.4) {
  b.cyl(0.06, 0.08, h, PAL.dark, x, 0, z, { seg: 6, collide: true });
  b.sphere(0.2, '#FFF4C8', x, h + 0.1, z);
  b.cyl(0.24, 0.12, 0.12, PAL.dark, x, h + 0.26, z, { seg: 8 });
}

export function pole(b, x, z, h = 6.5) {
  b.cyl(0.11, 0.14, h, '#9C9A92', x, 0, z, { seg: 7, collide: true, pad: 0.05 });
  b.box(1.2, 0.08, 0.08, '#8A877F', x, h - 0.6, z);
  b.box(0.8, 0.08, 0.08, '#8A877F', x, h - 1.1, z);
  b.cyl(0.13, 0.13, 0.3, '#7C8590', x + 0.25, h - 1.9, z + 0.05, { seg: 8 });
}

export function wire(b, x1, z1, x2, z2, y) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  b.add(G.box(), '#3A3A3A', { x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, ry: Math.atan2(dx, dz), sx: 0.025, sy: 0.025, sz: len });
}

export function vending(b, x, z, ry = 0, color = '#E8434A') {
  b.box(0.9, 1.85, 0.7, color, x, 0, z, { ry, collide: true });
  const c = Math.cos(ry), s = Math.sin(ry);
  const fx = x + s * 0.36, fz = z + c * 0.36;
  b.box(0.7, 0.8, 0.02, '#F7F7F7', fx, 0.85, fz, { ry });
  for (let i = 0; i < 4; i++) b.box(0.1, 0.2, 0.03, ['#3FA7F5', '#FFC83D', '#7BD389', '#F783AC'][i], fx + c * (-0.24 + i * 0.16), 1.15, fz, { ry });
  b.box(0.5, 0.12, 0.03, '#2E3440', fx, 0.25, fz, { ry });
}

export function fence(b, x1, z1, x2, z2, { h = 1.0, color = '#F2EEE6', post = '#C9C2B4', gap = 1.2, collide = true } = {}) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / gap));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.box(0.12, h, 0.12, post, x1 + dx * t, 0, z1 + dz * t);
  }
  for (const y of [h * 0.35, h * 0.8]) b.add(G.box(), color, { x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, ry, sx: 0.06, sy: 0.1, sz: len });
  if (collide) {
    if (Math.abs(dx) > Math.abs(dz)) b.boxes.push({ minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2) - 0.15, maxZ: Math.max(z1, z2) + 0.15, h });
    else b.boxes.push({ minX: Math.min(x1, x2) - 0.15, maxX: Math.max(x1, x2) + 0.15, minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2), h });
  }
}

export function hedge(b, x1, z1, x2, z2, h = 0.85) {
  const w = Math.abs(x2 - x1) || 0.8, d = Math.abs(z2 - z1) || 0.8;
  b.box(w, h, d, PAL.leaf2, (x1 + x2) / 2, 0, (z1 + z2) / 2, { collide: true });
  b.box(w + 0.05, 0.12, d + 0.05, PAL.leaf, (x1 + x2) / 2, h - 0.06, (z1 + z2) / 2);
}

/** Japanese-style house with gable roof. Door faces +Z (rotate with ry 0/±π/2/π). */
export function house(b, x, z, w, d, { wall = '#FFF3E0', roofColor = PAL.roofBlue, floors = 2, ry = 0, door = '#8F5F3A', balcony = true } = {}) {
  const h = floors * 2.7;
  const rot = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
  b.box(w, h, d, wall, x, 0, z, { ry, collide: true });
  b.box(w + 0.1, 0.25, d + 0.1, '#D8CDBD', x, 0, z, { ry });
  // Ridge runs parallel to the front (gable ends at the sides).
  roof(b, x, h, z, d + 0.8, 1.6, w + 0.8, roofColor, ry + Math.PI / 2);
  // Door + windows on the front (+Z local).
  let [px, pz] = rot(w * 0.22, d / 2 + 0.03);
  b.box(0.95, 1.9, 0.08, door, px, 0.12, pz, { ry });
  [px, pz] = rot(w * 0.22, d / 2 + 0.6);
  b.box(1.4, 0.06, 1.1, '#9C9A92', px, 2.2, pz, { ry });
  for (const lx of [-w * 0.22]) {
    [px, pz] = rot(lx, d / 2 + 0.03);
    b.box(1.2, 1.0, 0.08, PAL.glass, px, 1.0, pz, { ry });
    b.box(1.3, 0.08, 0.12, PAL.white, px, 0.96, pz, { ry });
  }
  if (floors > 1) {
    for (const lx of [-w * 0.22, w * 0.22]) {
      [px, pz] = rot(lx, d / 2 + 0.03);
      b.box(1.1, 0.95, 0.08, PAL.glass, px, 3.6, pz, { ry });
    }
    if (balcony) {
      [px, pz] = rot(0, d / 2 + 0.45);
      b.box(w * 0.7, 0.1, 0.9, '#CFC6B8', px, 3.05, pz, { ry });
      [px, pz] = rot(0, d / 2 + 0.88);
      b.box(w * 0.7, 0.55, 0.06, '#E8E2D8', px, 3.15, pz, { ry });
    }
  }
  return { door: rot(w * 0.22, d / 2 + 0.9) };
}

/** Big flat-roofed building helper (school, mall). */
export function block(b, x, z, w, d, h, color, o = {}) {
  b.box(w, h, d, color, x, 0, z, { collide: true });
  b.box(w + 0.3, 0.35, d + 0.3, o.trim || '#E7E1D6', x, h - 0.35, z);
}

/** Text sign mesh (not merged; has its own canvas texture). */
export function signMesh(w, h, opts) {
  const t = textTexture(Math.round(256 * (w / h)), 256, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !opts.bg }));
  return m;
}

// ---------------------------------------------------------------------------
// Sky

export function makeSky(radius = 220) {
  const geo = new THREE.SphereGeometry(radius, 24, 14);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.userData.setColors = (top, horizon, bottom) => {
    const t = new THREE.Color(top), h = new THREE.Color(horizon), bo = new THREE.Color(bottom);
    const pos = geo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / radius;
      if (y >= 0) c.copy(h).lerp(t, Math.pow(y, 0.6));
      else c.copy(h).lerp(bo, Math.min(1, -y * 3));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.attributes.color.needsUpdate = true;
  };
  return mesh;
}

export function cloudCluster(b, x, y, z, s = 1, color = '#FFFFFF') {
  for (const [dx, dy, dz, r] of [[0, 0, 0, 3], [3, -0.5, 1, 2.2], [-3, -0.4, 0.5, 2.4], [1.2, 1.2, -0.5, 2]]) {
    b.add(G.ico(1), color, { x: x + dx * s, y: y + dy * s, z: z + dz * s, sx: 2 * r * s, sy: 1.3 * r * s, sz: 2 * r * s });
  }
}

/** Lights for a scene; returned object lets ambience() retune them. */
export function makeLights(root, { shadows = false } = {}) {
  const hemi = new THREE.HemisphereLight('#EAF6FF', '#9DBF7A', 1.6);
  const sun = new THREE.DirectionalLight('#FFF3DD', 2.2);
  sun.position.set(30, 50, 20);
  sun.target.position.set(0, 0, 0);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
  }
  root.add(hemi, sun, sun.target);
  return { hemi, sun };
}
