// Niji Mall: a bright cutaway arcade with small shops and a shared food court.
// Fixtures, merchandise and shopkeepers share the scene's merged geometry.
import * as THREE from 'three';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { bench, bush, signMesh } from './common.js';
import { walls, roomLights } from './room.js';

export const MALL_TABLES = [
  { id: 'T1', x: -2.5, z: 1.0 },
  { id: 'T2', x: 2.0, z: 1.0 },
  { id: 'T3', x: -2.5, z: 5.0 },
  { id: 'T4', x: 2.0, z: 5.0 },
];

export const MALL_SHOPS = [
  { id: 'toys', x: -7.5, z: -2.6, en: 'Toys & Games', ja: 'おもちゃ・ゲーム', color: '#ED8E9E' },
  { id: 'books', x: -2.5, z: -2.6, en: 'Books & Stationery', ja: '本・文ぼうぐ', color: '#64B8B0' },
  { id: 'sports', x: 2.5, z: -2.6, en: 'Sports & Clothes', ja: 'スポーツ・服', color: '#E5B851' },
];

export const MALL_FOOD_COUNTERS = [
  { id: 'ramen', x: -8.8, z: 0.7, yaw: Math.PI / 2, en: 'Ramen', ja: 'ラーメン', color: '#EC9A69' },
  { id: 'burgers', x: -8.8, z: 5.0, yaw: Math.PI / 2, en: 'Burgers', ja: 'ハンバーガー', color: '#E9BF54' },
  { id: 'sushi', x: 8.8, z: -2.6, yaw: -Math.PI / 2, en: 'Sushi', ja: 'すし', color: '#75B7AF' },
  { id: 'sweets', x: 8.8, z: 1.1, yaw: -Math.PI / 2, en: 'Crepes & Ice Cream', ja: 'クレープ・アイス', color: '#D99BB8' },
];

function keeper(b, x, z, color, i) {
  const skin = ['#F1C59F', '#C98E65', '#E2AD83'][i];
  b.box(0.38, 0.53, 0.29, '#FFF7E9', x, 0.6, z);
  b.box(0.32, 0.47, 0.035, color, x, 0.6, z + 0.16);
  for (const dx of [-0.24, 0.24]) b.box(0.12, 0.46, 0.16, skin, x + dx, 0.62, z);
  for (const dx of [-0.11, 0.11]) b.box(0.13, 0.6, 0.18, '#425A70', x + dx, 0, z);
  b.sphere(0.23, skin, x, 1.4, z, { sy: 1.1 });
  b.sphere(0.24, ['#554236', '#383642', '#785142'][i], x, 1.51, z - 0.04, { sy: 0.65 });
  for (const dx of [-0.08, 0.08]) b.sphere(0.022, '#3D3640', x + dx, 1.41, z + 0.21);
  b.box(0.07, 0.018, 0.02, '#A45F5F', x, 1.31, z + 0.22);
}

export function buildMall() {
  const root = new THREE.Group();
  root.name = 'mall';
  const b = new StaticBuilder();
  const R = { minX: -12, maxX: 12, minZ: -7, maxZ: 8 };
  walls(b, { ...R, h: 3.3, color: '#FFF3DF', base: '#75ACA9', doors: [{ side: 'e', from: 4.7, to: 6.5 }] });
  // Return the east wall around the atrium corner, meeting the cutaway edge.
  b.box(2.4, 3.3, 0.2, '#FFF3DF', 11.0, 0, R.maxZ + 0.1);
  b.box(2.4, 0.18, 0.24, '#75ACA9', 11.0, 0, R.maxZ + 0.1);
  b.flat(48, 40, '#263B46', 0, -0.04, 0);
  b.flat(24, 15, '#F4EBD8', 0, 0, 0.5);
  // Large terrazzo tiles stay inside the merged mesh, including their grout.
  for (let x = -11; x <= 11; x += 2) for (let z = -6; z <= 7; z += 2) {
    b.flat(1.96, 1.96, ((x + z + 17) / 2) % 2 ? '#F6EFDF' : '#EDE6D5', x, 0.004, z);
  }
  b.flat(13.2, 10.5, '#DEECE1', -0.25, 0.008, 2.6);
  b.flat(4.2, 5.6, '#DAEBE6', 9.3, 0.009, 5.1);

  // Three pocket shops, each with its own canopy, counter and display shelves.
  for (const [i, s] of MALL_SHOPS.entries()) {
    const z = -5.1;
    b.flat(4.6, 3.4, ['#F9E6DB', '#E5EFE1', '#F7EDCE'][i], s.x, 0.012, z);
    for (const dx of [-2.35, 2.35]) b.box(0.16, 2.85, 3.6, '#E7D9BF', s.x + dx, 0, -5.2, { collide: true });
    b.box(4.65, 0.32, 0.65, s.color, s.x, 2.58, -3.5);
    for (let k = 0; k < 9; k++) b.box(0.24, 0.12, 0.67, '#FFF8E8', s.x - 2.0 + k * 0.5, 2.45, -3.49);
    b.box(3.5, 0.9, 0.7, s.color, s.x, 0, -3.65, { collide: true });
    b.box(3.6, 0.07, 0.81, '#FFF9E8', s.x, 0.9, -3.65);
    b.box(0.4, 0.24, 0.29, '#435A66', s.x + 1.18, 0.97, -3.68);
    b.box(4.25, 0.11, 0.4, '#C39A6D', s.x, 0.8, -6.6);
    b.box(4.25, 0.11, 0.4, '#C39A6D', s.x, 1.65, -6.6);
    keeper(b, s.x + 0.65, -4.78, s.color, i);
    for (let k = 0; k < 6; k++) {
      const x = s.x - 1.72 + k * 0.67;
      const color = ['#F2C453', '#7DBCB5', '#E78D9A', '#84A9D2', '#AA97CE', '#A7C27B'][k];
      if (s.id === 'toys') {
        b.box(0.42, 0.45, 0.25, color, x, 0.91, -6.57);
        b.sphere(0.18, color, x, 1.97, -6.58);
        b.sphere(0.07, color, x - 0.14, 2.12, -6.58);
        b.sphere(0.07, color, x + 0.14, 2.12, -6.58);
      } else if (s.id === 'books') {
        b.box(0.36, 0.49 + (k % 2) * 0.12, 0.23, color, x, 0.91, -6.56, { rz: k % 2 ? 0.08 : -0.08 });
        b.box(0.42, 0.15, 0.32, color, x, 1.76, -6.56);
        b.box(0.34, 0.04, 0.31, '#FFF7E5', x, 1.83, -6.55);
      } else {
        b.sphere(0.22, color, x, 1.13, -6.55);
        b.box(0.37, 0.45, 0.12, color, x, 1.82, -6.52);
        b.box(0.6, 0.18, 0.12, color, x, 2.09, -6.52);
      }
    }
    const sign = signMesh(4.2, 0.47, { bg: s.color, lines: [{ text: `${s.en}  ${s.ja}`, size: 34, color: '#243F50' }] });
    sign.position.set(s.x, 2.76, -3.15);
    root.add(sign);
  }

  // Four food kiosks face into the shared seating area.
  const foodCounters = MALL_FOOD_COUNTERS.map((c) => {
    const front = { x: c.x + Math.sin(c.yaw) * 1.0, z: c.z };
    b.box(2.9, 0.96, 0.85, c.color, c.x, 0, c.z, { ry: c.yaw, collide: true });
    b.box(3.0, 0.07, 0.96, '#FFF9EB', c.x, 0.96, c.z, { ry: c.yaw });
    b.box(3.0, 0.3, 0.9, c.color, c.x, 2.38, c.z, { ry: c.yaw });
    for (const offset of [-1.36, 1.36]) b.box(0.08, 2.4, 0.08, '#B9A58D', c.x, 0, c.z + offset);
    // Display plates give each kiosk a distinct food silhouette.
    for (let i = -1; i <= 1; i++) {
      const x = c.x + Math.sin(c.yaw) * 0.1, z = c.z + i * 0.67;
      b.cyl(0.22, 0.22, 0.04, '#FFFBEF', x, 1.03, z, { seg: 10 });
      if (c.id === 'ramen') {
        b.cyl(0.2, 0.13, 0.17, '#D67A64', x, 1.07, z, { seg: 10 });
        b.cyl(0.18, 0.18, 0.015, '#F3D78D', x, 1.24, z, { seg: 10 });
        b.sphere(0.045, '#75A967', x + 0.05, 1.27, z - 0.06);
      } else if (c.id === 'burgers') {
        b.cyl(0.17, 0.18, 0.07, '#DFA15A', x, 1.07, z, { seg: 10 });
        b.cyl(0.19, 0.19, 0.045, '#77A957', x, 1.14, z, { seg: 10 });
        b.cyl(0.17, 0.17, 0.06, '#9B6144', x, 1.19, z, { seg: 10 });
        b.sphere(0.18, '#E8B367', x, 1.27, z, { sy: 0.45 });
      } else if (c.id === 'sushi') {
        for (const dz of [-0.085, 0.085]) {
          b.box(0.23, 0.085, 0.12, '#FFFFEF', x, 1.07, z + dz);
          b.box(0.25, 0.04, 0.13, '#F0927F', x, 1.155, z + dz);
        }
      } else {
        b.cone(0.09, 0.2, '#DEAC6E', x, 1.07, z, { rz: Math.PI, seg: 8 });
        b.sphere(0.12, ['#F2C4D5', '#FFF1C1', '#BFD8AB'][i + 1], x, 1.3, z);
      }
    }
    const sign = signMesh(2.7, 0.48, { bg: c.color, lines: [{ text: c.en, size: 114, color: '#243F50', y: 0.3 }, { text: c.ja, size: 80, color: '#243F50', y: 0.76 }] });
    sign.position.set(c.x + Math.sin(c.yaw) * 0.48, 2.54, c.z);
    sign.rotation.y = c.yaw;
    root.add(sign);
    return { ...c, front, staff: { x: c.x - Math.sin(c.yaw) * 0.95, z: c.z, yaw: c.yaw } };
  });

  const seats = [];
  for (const t of MALL_TABLES) {
    b.cyl(0.68, 0.68, 0.07, '#FFF9E8', t.x, 0.72, t.z, { seg: 16 });
    b.cyl(0.08, 0.12, 0.72, '#7B9895', t.x, 0, t.z, { seg: 8 });
    b.cyl(0.34, 0.38, 0.06, '#7B9895', t.x, 0, t.z, { seg: 10 });
    b.collideCircle(t.x, t.z, 0.68, 0.8);
    const chairs = [{ dx: -1.03, dz: 0, yaw: Math.PI / 2 }, { dx: 1.03, dz: 0, yaw: -Math.PI / 2 }, { dx: 0, dz: 1.03, yaw: Math.PI }, { dx: 0, dz: -1.03, yaw: 0 }];
    for (const [i, c] of chairs.entries()) {
      const x = t.x + c.dx, z = t.z + c.dz;
      const color = ['#D98392', '#69ABA5', '#DFB952', '#83A4CC'][i];
      b.cyl(0.24, 0.24, 0.06, color, x, 0.43, z, { seg: 10 });
      b.cyl(0.04, 0.05, 0.43, '#728D8A', x, 0, z, { seg: 6 });
      b.box(0.45, 0.36, 0.06, color, x - Math.sin(c.yaw) * 0.24, 0.5, z - Math.cos(c.yaw) * 0.24, { ry: c.yaw });
      seats.push({ id: `${t.id}-${i}`, table: t.id, x, z, yaw: c.yaw, seatY: 0.47 });
    }
    b.box(0.13, 0.15, 0.17, '#D9C39F', t.x, 0.79, t.z);
    b.box(0.11, 0.06, 0.015, '#FFFEF7', t.x, 0.91, t.z);
  }

  // Entrance atrium: a low round planter, seating and a friendly directory.
  b.cyl(1.12, 1.03, 0.45, '#EAB99B', 7.2, 0, 6.4, { seg: 18, collide: true });
  b.cyl(1.0, 1.0, 0.04, '#866954', 7.2, 0.45, 6.4, { seg: 18 });
  bush(b, 7.0, 6.3, 1.4, '#79B57E');
  bush(b, 7.65, 6.35, 1.0, '#9CC987');
  for (const [dx, dz] of [[-0.6, 0.3], [0.2, -0.4], [0.6, 0.2]]) {
    b.sphere(0.13, '#F1A4B3', 7.2 + dx, 0.83, 6.4 + dz);
    b.sphere(0.06, '#FFE3A3', 7.2 + dx, 0.94, 6.4 + dz);
  }
  b.add(G.torus(1.48, 0.09, 6, 24), '#B3D6CE', { x: 7.2, y: 0.02, z: 6.4, rx: -Math.PI / 2 });
  bench(b, 5.1, 6.5, -Math.PI / 2, '#C3986D');
  b.box(0.1, 1.7, 1.75, '#77AAA6', 10.5, 0, 3.45, { collide: true });
  const directory = signMesh(1.65, 1.55, { bg: '#FFFAEB', border: { color: '#77AAA6', width: 12 }, lines: [
    { text: 'NIJI MALL  にじモール', size: 31, y: 0.12, color: '#386A73' },
    { text: '↑ Shops  お店', size: 37, y: 0.33, color: '#386A73' },
    { text: '← Food Court', size: 35, y: 0.54, color: '#386A73' },
    { text: 'フードコート', size: 31, y: 0.69, color: '#386A73' },
    { text: 'You are here  いまここ', size: 27, y: 0.89, color: '#C46F72' },
  ] });
  directory.position.set(10.43, 1.18, 3.45);
  directory.rotation.y = -Math.PI / 2;
  root.add(directory);
  // A rainbow header makes the entrance recognisable from across the room.
  for (const [i, color] of ['#E99B9F', '#E5BD67', '#B6C985', '#76B9AD', '#91AECE'].entries()) b.box(3.2, 0.12, 0.08, color, 8.0, 2.4 + i * 0.16, -6.86);
  b.box(0.08, 2.4, 0.13, '#77AAA6', 11.91, 0, 4.6);
  b.box(0.08, 2.4, 0.13, '#77AAA6', 11.91, 0, 6.6);
  b.box(0.08, 0.22, 2.2, '#77AAA6', 11.91, 2.4, 5.6);
  // Closed glazed doors and a lintel fill the wall opening behind the trim.
  b.box(0.2, 0.9, 1.8, '#FFF3DF', 12.1, 2.4, 5.6);
  b.box(0.1, 2.4, 1.8, '#77AAA6', 12.05, 0, 5.6);
  b.box(0.04, 1.55, 1.55, '#BDDDE0', 11.98, 0.65, 5.6);
  b.box(0.06, 2.4, 0.07, '#77AAA6', 11.94, 0, 5.6);
  for (const z of [5.43, 5.77]) b.box(0.12, 0.12, 0.18, '#FFF9E8', 11.88, 1.0, z);
  b.flat(1.3, 1.65, '#8BBAB2', 11.25, 0.013, 5.6);

  root.add(b.build());
  const lights = roomLights(root);
  lights.hemi.color.set('#FFF8E6');
  lights.hemi.intensity = 2.1;
  lights.sun.intensity = 1.3;
  const collision = new CollisionWorld({ bounds: { ...R, maxX: R.maxX + 0.8 } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);
  const spots = seats.map((s) => ({ ...s, kind: 'sit', zone: 'room', tags: ['table', 'sweets', 'reading', 'comics', 'music'] }));
  for (const s of MALL_SHOPS) spots.push({ id: `browse-${s.id}`, x: s.x + 1.8, z: -1.6, yaw: Math.PI, kind: 'stand', zone: 'room', tags: [s.id === 'sports' ? 'soccer' : s.id === 'books' ? 'reading' : 'games'] });
  const interact = [
    { id: 'mallExit', x: 11.65, z: 5.6, r: 1.2, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Door', ja: 'ドア' } },
    { id: 'directory', x: 9.7, z: 3.45, r: 1.15, kind: 'mallDirectory', icon: '🗺️', label: { en: 'Mall directory', ja: 'モールのあんない' } },
    ...MALL_SHOPS.map((s) => ({ id: s.id, shop: s.id, x: s.x, z: s.z, r: 1.25, kind: 'mallShop', icon: '🛍️', label: { en: s.en, ja: s.ja } })),
    ...foodCounters.map((c) => ({ id: c.id, counter: c.id, x: c.front.x, z: c.front.z, r: 1.2, kind: 'mallFood', icon: '🍽️', label: { en: c.en, ja: c.ja } })),
  ];
  return {
    id: 'mall', name: { en: 'Niji Mall', ja: 'にじモール' }, root, collision, spots,
    groups: [{ id: 'mallAtrium', x: 5.7, z: 4.2, r: 0.6, zone: 'room' }, { id: 'mallShops', x: -0.2, z: -1.9, r: 0.7, zone: 'room' }],
    interact, spawns: { door: { x: 10.8, z: 5.6, yaw: -Math.PI / 2 } }, lights, seats,
    tables: MALL_TABLES, shops: MALL_SHOPS, foodCounters,
    staffSpot: foodCounters.find((c) => c.id === 'sweets').staff,
    counterSpot: foodCounters.find((c) => c.id === 'sweets').front,
    camera: { mode: 'room', yaw: 0, pitch: 0.82, dist: 20.0, center: { x: 0, z: 0.9 }, follow: 0.5, bounds: { minX: -10.8, maxX: 10.8, minZ: -5.5, maxZ: 13 } },
    ambience: () => ({ background: new THREE.Color('#263B46'), fog: null }),
    update: () => {},
  };
}
