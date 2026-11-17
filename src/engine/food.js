// Small low-poly food and drink models for the café.

import * as THREE from 'three';
import { StaticBuilder, G } from './builder.js';

export function foodMesh(id) {
  const b = new StaticBuilder();
  b.cyl(0.2, 0.17, 0.025, '#FFFFFF', 0, 0, 0, { seg: 16 });
  switch (id) {
    case 'hamburger':
      b.cyl(0.11, 0.11, 0.04, '#E0A458', 0, 0.025, 0, { seg: 14 });
      b.cyl(0.115, 0.115, 0.035, '#6B3E26', 0, 0.065, 0, { seg: 14 });
      b.cyl(0.12, 0.12, 0.012, '#FFD166', 0, 0.1, 0, { seg: 4 });
      b.cyl(0.125, 0.125, 0.014, '#7BD389', 0, 0.112, 0, { seg: 10 });
      b.sphere(0.11, '#E9A65B', 0, 0.13, 0, { sy: 0.55 });
      break;
    case 'pizza':
      b.cyl(0.17, 0.17, 0.025, '#F2C46D', 0, 0.025, 0, { seg: 16 });
      b.cyl(0.155, 0.155, 0.012, '#E2553F', 0, 0.05, 0, { seg: 16 });
      for (const [x, z] of [[0.06, 0.04], [-0.05, 0.07], [-0.07, -0.05], [0.05, -0.07], [0, 0]]) b.cyl(0.025, 0.025, 0.012, '#B23A48', x, 0.062, z, { seg: 8 });
      break;
    case 'spaghetti':
      b.sphere(0.13, '#F4D58D', 0, 0.04, 0, { sy: 0.45 });
      b.sphere(0.07, '#D7263D', 0, 0.09, 0, { sy: 0.5 });
      break;
    case 'curry':
      b.sphere(0.085, '#FFFFFF', -0.06, 0.035, 0, { sy: 0.55 });
      b.cyl(0.11, 0.12, 0.02, '#B5651D', 0.04, 0.025, 0.01, { seg: 14 });
      b.sphere(0.025, '#F4A261', 0.06, 0.05, 0.03); b.sphere(0.025, '#E76F51', 0.02, 0.05, -0.03);
      break;
    case 'pancakes':
      for (let i = 0; i < 3; i++) b.cyl(0.12, 0.12, 0.03, '#E0A458', 0, 0.025 + i * 0.033, 0, { seg: 16 });
      b.box(0.05, 0.03, 0.05, '#FFF3B0', 0, 0.125, 0);
      b.cyl(0.08, 0.1, 0.006, '#A0522D', 0, 0.123, 0, { seg: 12 });
      break;
    case 'icecream':
      b.cyl(0.07, 0.04, 0.08, '#C9E4F5', 0, 0.02, 0, { seg: 12 });
      b.sphere(0.06, '#FFC9DE', 0, 0.13, 0);
      b.sphere(0.055, '#FFF3B0', 0.045, 0.17, 0.01);
      b.sphere(0.02, '#E63946', 0, 0.2, 0);
      break;
    case 'cake':
      b.add(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 12, 1, false, 0, Math.PI / 3), '#FFF3E0', { y: 0.07 });
      b.add(new THREE.CylinderGeometry(0.112, 0.112, 0.02, 12, 1, false, 0, Math.PI / 3), '#FF8FA3', { y: 0.12 });
      b.sphere(0.022, '#E63946', 0.045, 0.145, 0.03);
      break;
    case 'sandwich':
      for (const s of [-1, 1]) {
        b.add(G.box(), '#F6E7C1', { x: s * 0.05, y: 0.07, z: 0, rz: s * 0.15, sx: 0.12, sy: 0.12, sz: 0.04 });
        b.add(G.box(), '#7BD389', { x: s * 0.05, y: 0.07, z: 0.025, rz: s * 0.15, sx: 0.11, sy: 0.1, sz: 0.012 });
      }
      break;
    case 'omurice':
      b.sphere(0.12, '#FFD166', 0, 0.05, 0, { sy: 0.45, sz: 0.7 });
      b.box(0.1, 0.01, 0.02, '#D7263D', 0, 0.105, 0);
      break;
    case 'riceball':
      b.add(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 3), '#FFFFFF', { y: 0.1, rx: -Math.PI / 2 });
      b.box(0.07, 0.05, 0.065, '#2B3A2E', 0, 0.03, 0);
      break;
    default:
      b.sphere(0.08, '#F4A261', 0, 0.05, 0);
  }
  const m = b.build();
  m.matrixAutoUpdate = true;
  return m;
}

export function drinkMesh(color) {
  const b = new StaticBuilder();
  b.cyl(0.05, 0.045, 0.16, '#E9F6FF', 0, 0, 0, { seg: 12 });
  b.cyl(0.045, 0.04, 0.12, color, 0, 0.01, 0, { seg: 12 });
  b.cyl(0.006, 0.006, 0.2, '#FF6B6B', 0.02, 0.06, 0, { seg: 4, rz: 0.2 });
  const m = b.build();
  m.matrixAutoUpdate = true;
  return m;
}

export function trayMesh() {
  const b = new StaticBuilder();
  b.box(0.5, 0.03, 0.34, '#8F5F3A', 0, 0, 0);
  const m = b.build();
  m.matrixAutoUpdate = true;
  return m;
}

export function itemMesh(id) {
  const b = new StaticBuilder();
  switch (id) {
    case 'cap': b.sphere(0.12, '#E63946', 0, 0.04, 0, { sy: 0.6 }); b.cyl(0.1, 0.1, 0.012, '#C1121F', 0, 0.0, 0.09, { seg: 12, sz: 1.2 }); break;
    case 'ball': b.sphere(0.12, '#FFFFFF', 0, 0.12, 0); b.sphere(0.045, '#2E3440', 0, 0.2, 0.06); b.sphere(0.045, '#2E3440', 0.09, 0.1, 0.06); break;
    case 'bag': b.box(0.3, 0.24, 0.12, '#4DABF7', 0, 0, 0); b.add(G.torus(0.08, 0.015, 4, 10), '#1C7ED6', { y: 0.27 }); break;
    case 'book': b.box(0.22, 0.04, 0.3, '#E8590C', 0, 0, 0); b.box(0.2, 0.042, 0.28, '#FFFFFF', 0.012, 0.001, 0); break;
    case 'recorder': b.cyl(0.02, 0.025, 0.34, '#F8F1E5', 0, 0.02, 0, { rz: Math.PI / 2, seg: 8 }); break;
    case 'pencilcase': b.box(0.26, 0.06, 0.09, '#9775FA', 0, 0, 0); break;
    default: b.sphere(0.1, '#FFD166', 0, 0.1, 0);
  }
  const m = b.build();
  m.matrixAutoUpdate = true;
  return m;
}

export function souvenirMesh(kind) {
  const b = new StaticBuilder();
  switch (kind) {
    case 'postcard': b.box(0.3, 0.2, 0.025, '#FFF6E6', 0, 0, 0); b.box(0.08, 0.07, 0.005, '#FF8FA3', 0.085, 0.11, 0.016); b.box(0.14, 0.045, 0.005, '#80C7AB', -0.035, 0.045, 0.016); break;
    case 'soccer': b.sphere(0.12, '#FFFFFF', 0, 0.12, 0); b.sphere(0.05, '#2E3440', 0, 0.2, 0.07); break;
    case 'catch': b.sphere(0.07, '#FFFFFF', 0, 0.07, 0); b.sphere(0.1, '#B5651D', 0.12, 0.08, 0, { sx: 1.2, sz: 0.5 }); break;
    case 'cafe': b.cyl(0.06, 0.05, 0.11, '#FFFFFF', 0, 0, 0, { seg: 12 }); b.add(G.torus(0.035, 0.012, 4, 10), '#FFFFFF', { x: 0.07, y: 0.06, ry: Math.PI / 2 }); b.cyl(0.05, 0.05, 0.01, '#8B5A3C', 0, 0.1, 0, { seg: 12 }); break;
    case 'help': b.box(0.16, 0.2, 0.03, '#FFD166', 0, 0, 0); b.sphere(0.04, '#FF6B6B', 0, 0.12, 0.02); break;
    // Friendship events: a party cake slice, a best-friend keepsake, a present you delivered.
    case 'party': b.box(0.16, 0.09, 0.12, '#FFE3C2', 0, 0, 0); b.box(0.16, 0.03, 0.12, '#FF8FA3', 0, 0.09, 0); b.cyl(0.012, 0.012, 0.08, '#4DABF7', 0, 0.12, 0, { seg: 6 }); b.sphere(0.018, '#FFD166', 0, 0.215, 0); break;
    case 'keepsake': b.sphere(0.075, '#FFD43B', 0, 0.085, 0); b.box(0.05, 0.03, 0.05, '#FF6B6B', 0, 0.15, 0); b.box(0.12, 0.015, 0.02, '#FF6B6B', 0, 0.165, 0); break;
    case 'present': b.box(0.16, 0.13, 0.16, '#69DB7C', 0, 0, 0); b.box(0.035, 0.135, 0.165, '#FF6B6B', 0, 0, 0); b.box(0.165, 0.135, 0.035, '#FF6B6B', 0, 0, 0); break;
    // Hobby sessions and other events.
    case 'drawing': b.box(0.03, 0.22, 0.28, '#B07D4F', 0, 0, 0); b.box(0.035, 0.17, 0.22, '#FFFDF7', 0, 0.025, 0); b.sphere(0.04, '#4DABF7', 0.02, 0.12, 0.03); b.sphere(0.03, '#69DB7C', 0.02, 0.08, -0.05); break;
    case 'nature': b.cyl(0.06, 0.06, 0.13, '#D0EBFF', 0, 0, 0, { seg: 10 }); b.cyl(0.065, 0.065, 0.02, '#69DB7C', 0, 0.13, 0, { seg: 10 }); b.sphere(0.025, '#E03131', 0, 0.05, 0); break;
    case 'music': b.cyl(0.012, 0.012, 0.2, '#343A40', 0.04, 0.04, 0, { seg: 6 }); b.sphere(0.045, '#343A40', 0, 0.04, 0, { sy: 0.75 }); b.box(0.07, 0.03, 0.02, '#343A40', 0.07, 0.21, 0); break;
    case 'medal': b.cyl(0.06, 0.06, 0.015, '#FFD43B', 0, 0.06, 0, { seg: 14, rx: Math.PI / 2 }); b.box(0.05, 0.06, 0.01, '#4DABF7', 0, 0.12, 0); break;
    case 'card': b.box(0.02, 0.16, 0.12, '#FFC9DE', 0, 0, 0); b.sphere(0.025, '#E64980', 0.012, 0.09, 0); break;
    case 'visit': b.box(0.03, 0.18, 0.22, '#FFFFFF', 0, 0, 0); b.box(0.035, 0.12, 0.16, '#74C0FC', 0, 0.03, 0); b.sphere(0.03, '#FFD43B', 0.015, 0.14, 0.05); break;
    default: b.sphere(0.08, '#FF8FA3', 0, 0.08, 0);
  }
  const m = b.build();
  m.matrixAutoUpdate = true;
  m.rotation.y = Math.PI / 2;
  return m;
}
