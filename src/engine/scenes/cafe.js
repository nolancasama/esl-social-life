// Café Komorebi: tables for two or three, a counter with a display case and a
// staff member who takes orders.

import * as THREE from 'three';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { plankTexture } from '../textures.js';
import { floorMesh, walls, wallPlane, windowView, roomLights } from './room.js';
import { FOODS } from '../../data/content.js';

export const CAFE_TABLES = [
  { id: 'T1', x: -3.2, z: -0.4 },
  { id: 'T2', x: 1.8, z: -0.4 },
  { id: 'T3', x: -3.2, z: 2.9 },
  { id: 'T4', x: 1.8, z: 2.9 },
];

export function buildCafe() {
  const root = new THREE.Group();
  root.name = 'cafe';
  const b = new StaticBuilder();
  const R = { minX: -6.5, maxX: 6.5, minZ: -5, maxZ: 5.6 };
  walls(b, { ...R, h: 3.1, color: '#F3E2C7', base: '#7A5536', doors: [{ side: 'e', from: 2.5, to: 4.0 }] });
  b.box(13, 1.0, 0.06, '#C69C72', 0, 0, -4.97);
  root.add(floorMesh(13, 10.6, plankTexture('#A97A52', '#9A6C46', 10), 0, 0.3));
  b.flat(40, 40, '#2A2430', 0, -0.02, 0);

  // Counter, display case, register, back shelf
  b.box(7, 1.0, 0.8, '#8F5F3A', -0.5, 0, -3.5, { collide: true });
  b.box(7.1, 0.06, 0.9, '#E9D7BD', -0.5, 1.0, -3.5);
  b.box(2.4, 0.55, 0.7, '#DDF3FF', -2.6, 1.06, -3.5);
  for (const [dx, c] of [[-0.8, '#FFC9DE'], [-0.25, '#FFE3A3'], [0.3, '#B5E48C'], [0.8, '#F6BD60']]) {
    b.cyl(0.14, 0.14, 0.14, '#FFFFFF', -2.6 + dx, 1.08, -3.5, { seg: 10 });
    b.cyl(0.11, 0.11, 0.12, c, -2.6 + dx, 1.22, -3.5, { seg: 10 });
    b.sphere(0.03, '#E63946', -2.6 + dx, 1.38, -3.5);
  }
  b.box(0.5, 0.35, 0.4, '#3D4451', 1.2, 1.06, -3.6);
  b.box(0.36, 0.14, 0.02, '#8FD6F2', 1.2, 1.3, -3.39);
  b.box(9, 0.08, 0.42, '#7A5536', -0.5, 1.75, -4.76);
  b.box(9, 0.08, 0.42, '#7A5536', -0.5, 2.25, -4.76);
  for (let i = 0; i < 12; i++) b.cyl(0.11, 0.11, 0.3, ['#F4A261', '#E9C46A', '#2A9D8F', '#E76F51'][i % 4], -4.6 + i * 0.75, 1.83, -4.76, { seg: 8 });
  b.box(0.7, 0.6, 0.5, '#5B6270', 2.4, 1.06, -3.55);
  b.cyl(0.08, 0.08, 0.16, '#FFFFFF', 2.3, 1.06, -3.25, { seg: 8 });

  // Tables with three chairs each
  const seats = [];
  for (const t of CAFE_TABLES) {
    b.cyl(0.58, 0.58, 0.05, '#FFF6E6', t.x, 0.72, t.z, { seg: 18 });
    b.cyl(0.06, 0.08, 0.72, '#3D4451', t.x, 0, t.z, { seg: 8 });
    b.cyl(0.32, 0.36, 0.04, '#3D4451', t.x, 0, t.z, { seg: 12 });
    b.collideCircle(t.x, t.z, 0.58, 0.8);
    const chairs = [
      { dx: -0.95, dz: 0, yaw: Math.PI / 2 },
      { dx: 0.95, dz: 0, yaw: -Math.PI / 2 },
      { dx: 0, dz: 0.95, yaw: Math.PI },
    ];
    chairs.forEach((c, i) => {
      const x = t.x + c.dx, z = t.z + c.dz;
      b.cyl(0.21, 0.21, 0.06, '#C0392B', x, 0.42, z, { seg: 12 });
      b.cyl(0.03, 0.03, 0.42, '#3D4451', x, 0, z, { seg: 6 });
      const bx = x - Math.sin(c.yaw) * 0.22, bz = z - Math.cos(c.yaw) * 0.22;
      b.box(0.4, 0.42, 0.05, '#8F5F3A', bx, 0.5, bz, { ry: c.yaw });
      seats.push({ id: `${t.id}-${i}`, table: t.id, x, z, yaw: c.yaw, seatY: 0.46 });
    });
    // Little flower vase
    b.cyl(0.05, 0.06, 0.16, '#BDE0FE', t.x + 0.18, 0.77, t.z - 0.12, { seg: 8 });
    b.sphere(0.06, '#FF8FA3', t.x + 0.18, 0.98, t.z - 0.12);
    b.sphere(0.05, '#FFD166', t.x + 0.24, 0.95, t.z - 0.08);
  }
  // Window counter with stools (west wall)
  b.box(0.5, 0.06, 6.0, '#D8B48A', -6.2, 0.95, 0.6);
  b.box(0.45, 0.95, 0.06, '#8F5F3A', -6.2, 0, -2.3);
  b.collideBox(-6.25, 0.6, 0.5, 6.0, 0, 1.0);
  const stools = [];
  for (const z of [-1.4, 0.4, 2.2]) {
    b.cyl(0.2, 0.2, 0.05, '#2F9E6E', -5.55, 0.62, z, { seg: 12 });
    b.cyl(0.03, 0.05, 0.62, '#3D4451', -5.55, 0, z, { seg: 6 });
    stools.push({ x: -5.55, z, yaw: -Math.PI / 2, seatY: 0.66 });
  }
  const view = windowView('day');
  const panes = [];
  for (const z of [-1.2, 1.9]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({ map: view, toneMapped: false }));
    pane.position.set(-6.42, 1.85, z);
    pane.rotation.y = Math.PI / 2;
    root.add(pane);
    panes.push(pane);
    b.box(0.06, 1.62, 2.72, '#FFFFFF', -6.48, 1.04, z);
  }
  // Plants and a sleeping café cat (Mocha)
  for (const [x, z] of [[5.8, -4.4], [-5.9, 5.0], [5.9, 5.0]]) {
    b.cyl(0.28, 0.22, 0.5, '#D8734E', x, 0, z, { seg: 10, collide: true });
    b.add(G.ico(1), '#4F9F43', { x, y: 1.0, z, sx: 0.9, sy: 1.2, sz: 0.9 });
  }
  b.cyl(0.45, 0.45, 0.12, '#E9C46A', -4.6, 0, 4.7, { seg: 14, collide: true });
  b.sphere(0.28, '#8B5A3C', -4.6, 0.3, 4.7, { sx: 1.3, sy: 0.7 });
  b.sphere(0.15, '#8B5A3C', -4.25, 0.35, 4.55);
  b.cone(0.06, 0.1, '#8B5A3C', -4.18, 0.5, 4.5, { seg: 4 });
  b.cone(0.06, 0.1, '#8B5A3C', -4.32, 0.5, 4.48, { seg: 4 });
  // Special-of-the-day stand by the door
  b.box(0.06, 1.2, 0.7, '#5B4636', 5.9, 0, 1.6, { collide: true, rz: 0.12 });

  const mesh = b.build();
  root.add(mesh);
  root.add(wallPlane(4.6, 1.4, { bg: '#2E2A26', radius: 24, lines: [
    { text: 'MENU', size: 64, color: '#FFD166', y: 0.18 },
    { text: FOODS.slice(0, 5).map((f) => f.emoji).join('  '), size: 74, y: 0.5 },
    { text: FOODS.slice(5, 10).map((f) => f.emoji).join('  '), size: 74, y: 0.82 },
  ] }, -0.5, 2.6, -4.93));
  const special = { mesh: null };

  const lights = roomLights(root);
  lights.fill.intensity = 1.0;
  lights.hemi.color.set('#FFEBD2');

  const collision = new CollisionWorld({ bounds: { minX: R.minX, maxX: R.maxX + 0.8, minZ: R.minZ, maxZ: R.maxZ } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);

  const spots = seats.map((s) => ({ ...s, kind: 'sit', zone: 'room', tags: ['table', 'sweets', 'reading', 'drawing', 'comics', 'music'] }));
  stools.forEach((s, i) => spots.push({ id: `stool${i}`, ...s, kind: 'sit', zone: 'room', tags: ['stool', 'reading', 'music'] }));
  spots.push({ id: 'queue1', x: -1.2, z: -2.4, yaw: Math.PI, kind: 'stand', zone: 'room', tags: ['counter'] });
  spots.push({ id: 'queue2', x: 0.6, z: -2.3, yaw: Math.PI, kind: 'stand', zone: 'room', tags: ['counter'] });

  const groups = [{ id: 'cg1', x: 4.5, z: 0.9, r: 0.6, zone: 'room' }, { id: 'cg2', x: -0.7, z: 4.7, r: 0.55, zone: 'room' }];

  const interact = [
    { id: 'cafeExit', x: 6.1, z: 3.25, r: 1.2, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Door', ja: 'ドア' } },
    { id: 'counter', x: -0.5, z: -2.6, r: 1.3, kind: 'counter', icon: '🧁', label: { en: 'Counter', ja: 'カウンター' } },
    { id: 'special', x: 5.5, z: 1.6, r: 1.0, kind: 'special', icon: '📋', label: { en: "Today's special", ja: '今日のおすすめ' } },
  ];

  const spawns = { door: { x: 5.5, z: 3.25, yaw: -Math.PI / 2 } };

  const ambience = (period, weather) => {
    const tex = windowView(weather === 'rainy' ? 'rain' : period === 2 ? 'evening' : 'day');
    for (const p of panes) { p.material.map = tex; p.material.needsUpdate = true; }
    lights.sun.intensity = weather === 'rainy' ? 0.6 : 1.3;
    lights.fill.intensity = weather === 'rainy' ? 1.8 : 1.0;
    return { background: new THREE.Color('#2A2430'), fog: null };
  };

  return {
    id: 'cafe', name: { en: 'Café Komorebi', ja: 'カフェ・こもれび' },
    root, collision, spots, groups, interact, spawns, lights, seats,
    tables: CAFE_TABLES,
    staffSpot: { x: -0.5, z: -4.35, yaw: 0 },
    camera: { mode: 'room', yaw: 0, pitch: 0.76, dist: 10.2, center: { x: -0.2, z: 0.6 }, follow: 0.5, bounds: { minX: -6.0, maxX: 6.0, minZ: -3.0, maxZ: 9.0 } },
    special,
    ambience,
    update: () => {},
  };
}
