// Specialist classrooms share a bright cutaway shell. All furniture, equipment
// and floor markings are merged, keeping the full-class cost near homeroom.
import * as THREE from 'three';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { plankTexture } from '../textures.js';
import { floorMesh, walls, wallPlane, windowView, roomLights } from './room.js';

const PAINT = ['#EF8B96', '#F2C75F', '#79B9D7', '#8EC49A', '#B69BCF'];

function table(b, x, z) {
  b.box(2.5, 0.1, 1.7, '#E4BE8E', x, 0.73, z);
  for (const dx of [-1.08, 1.08]) for (const dz of [-0.68, 0.68]) b.box(0.1, 0.73, 0.1, '#AE8968', x + dx, 0, z + dz);
  b.collideBox(x, z, 2.5, 1.7, 0, 0.83);
}

function musicEquipment(b, root) {
  // A keyboard with individually coloured white and black keys.
  b.box(3.25, 0.2, 0.75, '#45546B', -4.7, 0.8, -4.9, { collide: true });
  for (const dx of [-1.25, 1.25]) b.box(0.09, 0.8, 0.6, '#6D7B8A', -4.7 + dx, 0, -4.9);
  for (let k = 0; k < 22; k++) {
    b.box(0.13, 0.025, 0.46, '#FFFAEB', -6.12 + k * 0.135, 1, -4.75);
    if (![2, 6].includes(k % 7)) b.box(0.075, 0.045, 0.27, '#303849', -6.05 + k * 0.135, 1.025, -4.89);
  }
  b.box(1.2, 0.1, 0.45, '#C08F6D', -4.7, 0.47, -3.95);
  for (const x of [-5.15, -4.25]) b.box(0.08, 0.47, 0.35, '#9B785A', x, 0, -3.95);
  // Two rainbow xylophones, with mallets resting on the end rail.
  for (const x of [-4.65, 4.65]) {
    b.box(2.5, 0.12, 0.85, '#B98B62', x, 0.65, 4.65, { collide: true });
    for (const dx of [-1, 1]) b.box(0.1, 0.65, 0.65, '#B98B62', x + dx, 0, 4.65);
    for (let k = 0; k < 9; k++) b.box(0.22, 0.07, 0.7 - k * 0.035, PAINT[k % PAINT.length], x - 1.04 + k * 0.26, 0.77, 4.65);
    for (const dz of [-0.12, 0.12]) {
      b.box(0.64, 0.025, 0.025, '#9D7659', x, 0.87, 4.65 + dz, { ry: -0.25 });
      b.sphere(0.06, '#F0D58A', x + 0.31, 0.88, 4.57 + dz);
    }
  }
  for (const x of [-6.7, 6.7]) for (const z of [-1.8, 1.5]) {
    b.cyl(0.035, 0.035, 1.05, '#5E6C7B', x, 0, z, { seg: 6 });
    b.box(0.7, 0.46, 0.055, '#536478', x, 1.02, z, { rx: -0.2 });
    b.box(0.54, 0.34, 0.025, '#FFF9E9', x, 1.09, z + 0.045, { rx: -0.2 });
    for (const dx of [-0.2, 0.2]) b.box(0.06, 0.04, 0.5, '#5E6C7B', x + dx, 0, z);
  }
  // A staff poster remains legible without loading an image or audio file.
  b.box(4.5, 1.5, 0.08, '#FFF8DF', 2.7, 1.45, -5.92);
  for (let i = 0; i < 5; i++) b.box(3.9, 0.018, 0.02, '#63768B', 2.7, 1.85 + i * 0.15, -5.86);
  for (let i = 0; i < 6; i++) {
    const x = 1.15 + i * 0.6, y = 1.91 + (i % 3) * 0.15;
    b.sphere(0.09, PAINT[i % PAINT.length], x, y, -5.82, { sy: 0.65, sz: 0.2 });
    b.box(0.025, 0.42, 0.025, '#52677F', x + 0.075, y, -5.82);
  }
  root.add(wallPlane(3.7, 0.5, { bg: '#FFF8DF', lines: [{ text: 'Keep the beat!  リズムにのろう', size: 35, color: '#536478' }] }, 2.7, 2.7, -5.86));
}

function gymEquipment(b) {
  // Court lines and centre circle are part of the same static mesh.
  for (const x of [-5.5, 5.5]) b.flat(0.055, 9, '#FFF6D9', x, 0.012, 0);
  for (const z of [-4.5, 0, 4.5]) b.flat(11, 0.055, '#FFF6D9', 0, 0.013, z);
  b.add(G.torus(1.35, 0.028, 4, 48), '#FFF6D9', { x: 0, y: 0.016, z: 0, rx: Math.PI / 2 });
  for (const x of [-6.9, 6.9]) {
    b.box(0.12, 1.15, 1.8, '#F8FCF4', x, 1.9, -3.7);
    b.box(0.14, 0.52, 0.8, '#DF8175', x, 2.1, -3.7);
    const hoopX = x - Math.sign(x) * 0.48;
    b.add(G.torus(0.35, 0.045, 6, 16), '#DC7B54', { x: hoopX, y: 2.13, z: -3.7, rx: Math.PI / 2 });
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      b.cyl(0.012, 0.012, 0.4, '#FFF8E7', hoopX + Math.cos(a) * 0.26, 1.73, -3.7 + Math.sin(a) * 0.26, { seg: 4 });
    }
  }
  for (let i = 0; i < 3; i++) {
    b.box(2.8, 0.16, 1.1, ['#8CB6D4', '#DDA1AA', '#9CC5A8'][i], -4.6, i * 0.16, 5, { collide: true });
    b.box(2.65, 0.02, 0.025, '#F5F3DC', -4.6, 0.12 + i * 0.16, 5.56);
  }
  // Open ball cart with a visible basket of balls.
  b.box(2.2, 0.1, 1.05, '#789AA9', 4.6, 0.22, 4.9, { collide: true });
  for (const dx of [-1, 1]) for (const dz of [-0.45, 0.45]) {
    b.cyl(0.035, 0.035, 0.85, '#648594', 4.6 + dx, 0.2, 4.9 + dz, { seg: 5 });
    b.sphere(0.1, '#546478', 4.6 + dx, 0.12, 4.9 + dz);
  }
  for (const y of [0.5, 0.75, 1]) {
    for (const dz of [-0.45, 0.45]) b.box(2.1, 0.035, 0.035, '#89ACB9', 4.6, y, 4.9 + dz);
    for (const dx of [-1, 1]) b.box(0.035, 0.035, 0.9, '#89ACB9', 4.6 + dx, y, 4.9);
  }
  for (let i = 0; i < 6; i++) {
    const x = 3.94 + (i % 3) * 0.63, z = 4.68 + Math.floor(i / 3) * 0.45;
    b.sphere(0.27, i % 2 ? '#EEAC64' : '#F9E8BC', x, 0.62, z);
    b.add(G.torus(0.272, 0.012, 4, 12), '#9D7359', { x, y: 0.62, z });
  }
}

function artwork(b, x, y, z, variant) {
  b.box(1.3, 1.05, 0.035, PAINT[variant % PAINT.length], x, y, z);
  b.box(1.15, 0.9, 0.02, '#FFFAE9', x, y + 0.075, z + 0.025);
  b.box(1.04, 0.25, 0.025, '#A9CF99', x, y + 0.1, z + 0.045);
  b.sphere(0.13, '#F1C85F', x + 0.32, y + 0.78, z + 0.06, { sz: 0.12 });
  if (variant % 2) {
    b.box(0.4, 0.36, 0.025, '#E59A93', x - 0.15, y + 0.25, z + 0.06);
    b.cone(0.33, 0.26, '#83AEC6', x - 0.15, y + 0.61, z + 0.06, { seg: 3, rx: Math.PI / 2 });
  } else {
    b.box(0.07, 0.37, 0.025, '#A78969', x - 0.2, y + 0.23, z + 0.06);
    for (let i = 0; i < 4; i++) b.sphere(0.17, PAINT[(variant + i) % PAINT.length], x - 0.2 + Math.cos(i * Math.PI / 2) * 0.13, y + 0.67 + Math.sin(i * Math.PI / 2) * 0.13, z + 0.06, { sz: 0.13 });
  }
}

function artEquipment(b) {
  for (const x of [-4.65, 4.65]) for (const z of [-1.7, 2.1]) {
    table(b, x, z);
    for (const dx of [-0.73, 0.73]) {
      b.box(0.68, 0.015, 0.52, '#FFFAE9', x + dx, 0.83, z + 0.15);
      b.sphere(0.13, PAINT[(dx > 0 ? 2 : 0)], x + dx, 0.85, z + 0.15, { sy: 0.04 });
    }
    for (let i = 0; i < 5; i++) {
      b.cyl(0.085, 0.07, 0.18, PAINT[i], x - 0.46 + i * 0.23, 0.83, z - 0.42, { seg: 8 });
      b.cyl(0.015, 0.015, 0.42, '#987251', x - 0.46 + i * 0.23, 0.86, z - 0.42, { seg: 5, rz: 0.14 });
    }
  }
  for (const [i, x] of [-5, -2.5, 2.5, 5].entries()) {
    artwork(b, x, 1.55, -5.87, i);
    // Easel legs and a smaller, brightly painted canvas.
    for (const dx of [-0.42, 0.42]) b.box(0.075, 1.75, 0.08, '#B98E64', x + dx, 0, -4.45, { rz: Math.sign(dx) * 0.14 });
    b.box(1.25, 0.08, 0.25, '#B98E64', x, 0.64, -4.35);
    artwork(b, x, 0.7, -4.42, i + 1);
  }
}

function buildSchoolRoom(id, name, color, furnish) {
  const root = new THREE.Group();
  root.name = id;
  const b = new StaticBuilder();
  const bounds = { minX: -7.5, maxX: 7.5, minZ: -6, maxZ: 6 };
  walls(b, { ...bounds, h: 3.3, color, base: '#B79571', doors: [{ side: 'e', from: -5.6, to: -4.1 }] });
  b.flat(40, 40, '#293944', 0, -0.03, 0);
  root.add(floorMesh(15, 12, plankTexture(id === 'gym' ? '#DEB879' : '#EBD4AD', id === 'gym' ? '#CBA363' : '#D7BC90')));
  // High windows keep the children's work/equipment visible below them.
  const view = windowView();
  for (const x of [-5.3, 0, 5.3]) {
    b.box(2.6, 0.68, 0.08, '#FFFBEF', x, 2.57, -5.94);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: view, toneMapped: false }));
    pane.position.set(x, 2.91, -5.88);
    root.add(pane);
  }
  b.box(0.14, 2.4, 1.5, '#BC9973', 7.56, 0, -4.85);
  b.box(0.035, 0.85, 1.06, '#CFE5DD', 7.47, 1.12, -4.85);
  b.sphere(0.07, '#EDC568', 7.44, 0.95, -4.33);
  furnish(b, root);
  root.add(wallPlane(3.2, 0.52, { bg: '#FFF8DF', lines: [{ text: `${name.en}  ${name.ja}`, size: 36, color: '#485E78' }] }, 0, 2.31, -5.86));
  root.add(b.build());
  const lights = roomLights(root);
  const collision = new CollisionWorld({ bounds: { ...bounds, maxX: 8.2 } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);
  // Six classmates around each of the four work areas. The middle remains
  // free for the player and partner, including the gym's catch arc.
  const spots = [];
  for (const x of [-6.2, -3.1, 3.1, 6.2]) for (const z of [-2.8, -1.7, -0.6, 1, 2.1, 3.2]) {
    spots.push({ id: `class${spots.length}`, x, z, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, kind: 'stand', zone: 'room', tags: ['school', 'stand'] });
  }
  return {
    id, name, root, collision, lights, spots, groups: [],
    teacherSpot: { x: 0, z: -4.6, yaw: 0 },
    activitySpot: { x: 0, z: 2, yaw: Math.PI },
    activitySeats: [{ x: 0, z: 2, yaw: Math.PI, seatY: 0 }, { x: 0, z: 0, yaw: 0, seatY: 0 }],
    field: { x: 0, z: 0, a: { x: 0, z: 2 }, b: { x: 0, z: -2 }, c: { x: 5, z: 1 } },
    spawns: { door: { x: 6.65, z: -4.85, yaw: -Math.PI / 2 }, center: { x: 0, z: 2, yaw: Math.PI } },
    interact: [
      { id: 'schoolLesson', x: 5.8, z: -4.5, r: 2, kind: 'schoolLesson', icon: '🏫', label: { en: 'Start class', ja: '授業を始める' } },
      { id: `${id}Exit`, x: 6.9, z: -4.85, r: 1.2, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Go outside', ja: '外に出る' } },
    ],
    camera: { mode: 'room', yaw: 0, pitch: 0.8, dist: 13.2, center: { x: 0, z: 0.4 }, follow: 0.3, bounds: { minX: -6.6, maxX: 6.6, minZ: -4.8, maxZ: 8.5 } },
    ambience: (_period, weather) => {
      lights.sun.intensity = weather === 'rainy' ? 0.9 : 1.7;
      return { background: new THREE.Color('#293944'), fog: null };
    },
    update: () => {},
  };
}

export const buildMusicRoom = () => buildSchoolRoom('musicroom', { en: 'Music Room', ja: '音楽室' }, '#FFF1D5', musicEquipment);
export const buildGym = () => buildSchoolRoom('gym', { en: 'Gym', ja: '体育館' }, '#E8F2DF', gymEquipment);
export const buildArtRoom = () => buildSchoolRoom('artroom', { en: 'Art Room', ja: '図工室' }, '#F8EBDD', artEquipment);
