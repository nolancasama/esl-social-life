// Classroom 5-1: the weekday-morning social hub.

import * as THREE from 'three';
import { StaticBuilder } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { plankTexture, clockTexture, textTexture } from '../textures.js';
import { floorMesh, walls, wallPlane, windowView, roomLights } from './room.js';
import { TIMETABLE, SUBJECTS, DAYS } from '../../data/content.js';

const COLS = [-5, -2.5, 0, 2.5, 5];
const ROWS = [-2.1, -0.6, 0.9, 2.4, 3.9];
export const PLAYER_DESK = { x: -5, z: 3.9 };

export function buildClassroom() {
  const root = new THREE.Group();
  root.name = 'classroom';
  const b = new StaticBuilder();
  const R = { minX: -7, maxX: 7, minZ: -5.5, maxZ: 6.2 };
  walls(b, { ...R, h: 3.2, color: '#F7F2E6', base: '#A88B6A', doors: [{ side: 'e', from: -4.7, to: -3.1 }] });
  root.add(floorMesh(14, 11.7, plankTexture('#D2A774', '#C4976A'), 0, 0.35));
  // Outside the room: a soft dark plinth so the cut-away edge reads as intentional.
  b.flat(40, 40, '#262B3A', 0, -0.02, 0);

  // Blackboard wall
  b.box(7.4, 2.3, 0.1, '#7B5B3E', 0, 0.85, -5.45);
  b.box(7.0, 2.0, 0.06, '#2F5D4A', 0, 1.0, -5.4);
  b.box(7.0, 0.06, 0.18, '#7B5B3E', 0, 0.96, -5.32);
  for (let i = 0; i < 5; i++) b.box(0.12, 0.03, 0.03, ['#FFFFFF', '#FFD43B', '#FF8FA3', '#8FD6F2', '#FFFFFF'][i], -2.6 + i * 0.3, 1.0, -5.28);
  // Teacher's desk and lectern
  b.box(1.8, 0.8, 0.8, '#B98A5D', -4.4, 0, -4.1, { collide: true });
  b.box(1.85, 0.05, 0.85, '#D8B48A', -4.4, 0.8, -4.1);
  b.box(0.7, 1.05, 0.5, '#B98A5D', 0, 0, -4.0, { collide: true });
  b.box(0.75, 0.05, 0.55, '#D8B48A', 0, 1.05, -4.0);
  // Desks and chairs (25)
  const deskSpots = [];
  for (const z of ROWS) {
    for (const x of COLS) {
      b.box(0.64, 0.04, 0.46, '#E4C48F', x, 0.66, z);
      b.box(0.6, 0.18, 0.42, '#C89E68', x, 0.48, z);
      for (const [dx, dz] of [[-0.27, -0.18], [0.27, -0.18], [-0.27, 0.18], [0.27, 0.18]]) b.box(0.035, 0.66, 0.035, '#8A94A0', x + dx, 0, z + dz);
      b.collideBox(x, z, 0.64, 0.46, 0, 0.7);
      const cz = z + 0.44;
      b.box(0.42, 0.04, 0.38, '#E4C48F', x, 0.42, cz);
      b.box(0.42, 0.34, 0.04, '#E4C48F', x, 0.5, cz + 0.2);
      for (const [dx, dz] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]]) b.box(0.03, 0.42, 0.03, '#8A94A0', x + dx, 0, cz + dz);
      deskSpots.push({ x, z: cz - 0.02, desk: { x, z } });
    }
  }
  // Windows on the west wall with a view
  const view = windowView('day');
  const views = [];
  for (const z of [-3.9, -1.3, 1.3, 3.9]) {
    b.box(0.08, 1.75, 2.1, '#FFFFFF', -6.97, 0.85, z);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.6), new THREE.MeshBasicMaterial({ map: view, toneMapped: false }));
    pane.position.set(-6.92, 1.72, z);
    pane.rotation.y = Math.PI / 2;
    root.add(pane);
    views.push(pane);
    b.box(0.1, 0.06, 2.1, '#FFFFFF', -6.9, 1.7, z);
    b.box(0.12, 1.8, 0.35, '#F3E3C3', -6.88, 0.85, z - 1.2);
  }
  b.box(0.5, 0.75, 11, '#E8DCC6', -6.75, 0, 0.3, { collide: true });
  // Cubbies with school bags (east wall, behind the desks)
  b.box(0.55, 1.0, 5.6, '#C89E68', 6.7, 0, 2.6, { collide: true });
  const bags = ['#C92A2A', '#212529', '#1864AB', '#6B3E1F', '#E64980', '#2B8A3E', '#7048E8', '#0CA678'];
  for (let i = 0; i < 12; i++) {
    const zz = 0.1 + (i % 6) * 0.9, yy = i < 6 ? 0.15 : 0.6;
    b.box(0.36, 0.34, 0.32, bags[i % bags.length], 6.62, yy, zz);
  }
  // Plants
  for (const [x, z] of [[-6.3, 5.6], [6.4, -5.0]]) {
    b.cyl(0.25, 0.2, 0.45, '#D8734E', x, 0, z, { seg: 10, collide: true });
    b.sphere(0.45, '#5DB04E', x, 0.85, z);
  }
  const mesh = b.build();
  mesh.receiveShadow = true;
  root.add(mesh);

  // Wall pictures: clock, banner, timetable, calendar
  const clockMesh = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ map: clockTexture(8, 20), toneMapped: false }));
  clockMesh.position.set(0, 2.78, -5.38);
  root.add(clockMesh);
  root.add(wallPlane(2.2, 0.55, { bg: '#FFF4C2', radius: 30, lines: [{ text: "5-1  Let's be friends!  なかよし", size: 78, color: '#C2410C' }] }, -5.1, 2.45, -5.38));
  const ttRows = TIMETABLE.map((list, d) => `${DAYS[d].short}: ${list.map((s) => SUBJECTS.find((x) => x.id === s).emoji).join(' ')}`);
  root.add(wallPlane(1.6, 1.7, { bg: '#FFFFFF', border: { color: '#4C6FFF', width: 10 }, radius: 20, lines: [{ text: 'TIMETABLE  時間わり', size: 30, y: 0.11, color: '#4C6FFF' }, ...ttRows.map((t, i) => ({ text: t, size: 28, y: 0.27 + i * 0.155, color: '#2B3A55' }))] }, 6.88, 1.95, -1.2, -Math.PI / 2));

  // Blackboard writing (refreshed daily)
  let board = null;
  const setBoard = ({ dateEn, dateJa, phrase, duty }) => {
    if (board) { root.remove(board); board.material.map.dispose(); board.material.dispose(); }
    const t = textTexture(1400, 400, { lines: [
      { text: `${dateJa}   ${dateEn}`, size: 54, color: '#FFFFFF', y: 0.16, font: undefined },
      { text: "Today's English", size: 44, color: '#FFD43B', y: 0.42 },
      { text: phrase, size: 68, color: '#FFFFFF', y: 0.64 },
      { text: duty || '', size: 36, color: '#BDE8F7', y: 0.88 },
    ] });
    board = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.94), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    board.position.set(0, 2.0, -5.36);
    root.add(board);
  };

  const lights = roomLights(root);
  const collision = new CollisionWorld({ bounds: { minX: R.minX, maxX: R.maxX + 0.8, minZ: R.minZ, maxZ: R.maxZ } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);

  // Spots
  const spots = [];
  deskSpots.forEach((d, i) => {
    if (d.desk.x === PLAYER_DESK.x && d.desk.z === PLAYER_DESK.z) return;
    spots.push({ id: `desk${i}`, x: d.x, z: d.z, yaw: Math.PI, kind: 'sit', seatY: 0.44, zone: 'room', tags: ['desk'] });
  });
  for (const [i, [x, z, yaw]] of [[-6.0, -2.5, -Math.PI / 2], [-6.0, 0.0, -Math.PI / 2], [-6.0, 2.6, -Math.PI / 2], [-4, 5.6, Math.PI], [2.5, 5.6, Math.PI], [6.0, -1.7, Math.PI / 2], [-2.2, -4.7, 0], [2.6, -4.6, Math.PI]].entries()) {
    spots.push({ id: `stand${i}`, x, z, yaw, kind: 'stand', zone: 'room', tags: ['stand'] });
  }
  const groups = [];
  for (const x of [-3.75, -1.25, 1.25, 3.75]) {
    if (x > -3) groups.push({ id: `front${x}`, x, z: -3.3, r: 0.58, zone: 'room' });
    groups.push({ id: `mid${x}`, x, z: 1.65, r: 0.58, zone: 'room' });
    groups.push({ id: `back${x}`, x, z: 5.3, r: 0.55, zone: 'room' });
  }

  const interact = [
    { id: 'classDoor', x: 6.4, z: -3.9, r: 1.3, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Door', ja: 'ドア' } },
    { id: 'myDesk', x: PLAYER_DESK.x, z: PLAYER_DESK.z, r: 1.25, kind: 'desk', icon: '🪑', label: { en: 'My desk', ja: '自分の席' } },
    { id: 'timetable', x: 6.0, z: -1.2, r: 1.2, kind: 'timetable', icon: '🗓️', label: { en: 'Timetable', ja: '時間わり' } },
    { id: 'board', x: 2.0, z: -4.5, r: 1.2, kind: 'blackboard', icon: '📝', label: { en: 'Blackboard', ja: '黒板' } },
  ];

  const spawns = {
    desk: { x: -3.85, z: 4.4, yaw: Math.PI },
    door: { x: 5.6, z: -3.9, yaw: -Math.PI / 2 },
    front: { x: 2.4, z: -3.3, yaw: Math.PI },
  };

  const ambience = (period, weather) => {
    const kind = weather === 'rainy' ? 'rain' : period === 2 ? 'evening' : 'day';
    const tex = windowView(kind);
    for (const v of views) { v.material.map.dispose?.(); v.material.map = tex; v.material.needsUpdate = true; }
    lights.sun.intensity = weather === 'rainy' ? 0.7 : weather === 'cloudy' ? 1.1 : 1.6;
    lights.hemi.intensity = weather === 'rainy' ? 1.7 : 1.9;
    lights.fill.intensity = weather === 'rainy' ? 1.2 : 0.3;
    return { background: new THREE.Color('#262B3A'), fog: null };
  };

  return {
    id: 'classroom', name: { en: 'Classroom 5-1', ja: '5年1組' },
    root, collision, spots, groups, interact, spawns, lights,
    teacherSpot: { x: 0.0, z: -4.75, yaw: 0 },
    camera: { mode: 'room', yaw: 0, pitch: 0.8, dist: 10.8, center: { x: 0, z: 0.8 }, follow: 0.5, bounds: { minX: -6.4, maxX: 6.4, minZ: -5.0, maxZ: 9.5 } },
    setBoard, clock: clockMesh,
    ambience,
    update: () => {},
  };
}
