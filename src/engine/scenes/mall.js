// Niji Mall's three cutaway floors share a recognisable circulation core.
// Fixtures, merchandise and shopkeepers share the scene's merged geometry.
import * as THREE from 'three';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { bench, bush, signMesh } from './common.js';
import { walls, roomLights } from './room.js';
import { foodMesh } from '../food.js';

export const MALL_TABLES = [
  { id: 'T1', x: -2.5, z: 1.0 },
  { id: 'T2', x: 2.0, z: 1.0 },
  { id: 'T3', x: -2.5, z: 5.0 },
  { id: 'T4', x: 2.0, z: 5.0 },
  { id: 'D1', x: -4.5, z: -2.0, diners: [0] },
  { id: 'D2', x: 0, z: -2.0, diners: [0, 1] },
  { id: 'D3', x: 6.7, z: 4.8, diners: [0, 1, 3] },
];

// Reserved machine anchors: later phases can attach play flows here without
// rearranging circulation, waiting seats or the neighbouring decorative games.
export const MALL_ARCADE_POSITIONS = Object.freeze({
  racing: Object.freeze({ x: -8, z: -4.8, yaw: 0 }),
  crane: Object.freeze({ x: -2.4, z: -4.8, yaw: 0 }),
  rhythm: Object.freeze({ x: 3.0, z: -4.8, yaw: 0 }),
});
// Where a player stands to play: just in front of each cabinet's collision
// (the racing seat reaches z + 1.8, the crane box z + 0.8, the rhythm pads z + 1.1).
const ARCADE_FRONT = { racing: 2.35, crane: 1.45, rhythm: 1.65 };
export const MALL_ARCADE_STANDS = Object.freeze(Object.fromEntries(Object.entries(MALL_ARCADE_POSITIONS).map(([id, p]) => [id, Object.freeze({ x: p.x, z: p.z + ARCADE_FRONT[id] })])));
const ARCADE_LABELS = {
  racing: { icon: '🏎️', en: 'Racing Game', ja: 'レースゲーム' },
  crane: { icon: '🧸', en: 'Crane Game', ja: 'クレーンゲーム' },
  rhythm: { icon: '🥁', en: 'Rhythm Game', ja: 'リズムゲーム' },
};

const FLOOR_NAMES = {
  1: { en: '1F Shopping', ja: '1かい ショッピング' },
  2: { en: '2F Food Court', ja: '2かい フードコート' },
  3: { en: '3F Game Center', ja: '3かい ゲームセンター' },
};
const FLOOR_SPAWNS = {
  escUp: { x: 7, z: -1.9, yaw: 0 },
  escDown: { x: 10, z: -1.9, yaw: 0 },
  elevator: { x: 9.25, z: 0, yaw: -Math.PI / 2 },
};

export const MALL_SHOPS = [
  { id: 'toys', x: -7.5, z: -2.6, en: 'Toys & Games', ja: 'おもちゃ・ゲーム', color: '#ED8E9E' },
  { id: 'books', x: -2.5, z: -2.6, en: 'Books & Stationery', ja: '本・文ぼうぐ', color: '#64B8B0' },
  { id: 'sports', x: 2.5, z: -2.6, en: 'Sports & Clothes', ja: 'スポーツ・服', color: '#E5B851' },
];

export const MALL_FOOD_COUNTERS = [
  { id: 'ramen', x: -8.8, z: 0.7, yaw: Math.PI / 2, en: 'Rainbow Ramen', ja: 'にじラーメン', color: '#EC9A69' },
  { id: 'burgers', x: -8.8, z: 5.0, yaw: Math.PI / 2, en: 'Sunny Burgers', ja: 'おひさまバーガー', color: '#E9BF54' },
  { id: 'sushi', x: -7.6, z: -5.3, yaw: 0, en: 'Little Sushi', ja: 'こすし屋', color: '#75B7AF' },
  { id: 'sweets', x: -1.6, z: -5.3, yaw: 0, en: 'Cloud Crepes & Ice Cream', ja: 'くもクレープとアイス', color: '#D99BB8' },
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

function buildMallFloor(floor) {
  const root = new THREE.Group();
  const id = floor === 1 ? 'mall' : `mall${floor}`;
  root.name = id;
  const b = new StaticBuilder();
  const R = { minX: -12, maxX: 12, minZ: -7, maxZ: 8 };
  const wallColor = floor === 3 ? '#DDE0F3' : floor === 2 ? '#FFF1D8' : '#FFF3DF';
  walls(b, { ...R, h: 3.3, color: wallColor, base: floor === 3 ? '#837CB9' : '#75ACA9', doors: floor === 1 ? [{ side: 'e', from: 4.7, to: 6.5 }] : [] });
  // Return the east wall around the atrium corner, meeting the cutaway edge.
  b.box(2.4, 3.3, 0.2, wallColor, 11.0, 0, R.maxZ + 0.1);
  b.box(2.4, 0.18, 0.24, '#75ACA9', 11.0, 0, R.maxZ + 0.1);
  b.flat(48, 40, '#263B46', 0, -0.04, 0);
  b.flat(24, 15, floor === 3 ? '#565D8E' : '#F4EBD8', 0, 0, 0.5);
  // Large terrazzo tiles stay inside the merged mesh, including their grout.
  for (let x = -11; x <= 11; x += 2) for (let z = -6; z <= 7; z += 2) {
    const colors = floor === 3 ? ['#6A70A6', '#5D6399'] : floor === 2 ? ['#F8EEDB', '#EDDCC4'] : ['#F6EFDF', '#EDE6D5'];
    b.flat(1.96, 1.96, colors[Math.abs((x + z + 17) / 2) % 2 ? 0 : 1], x, 0.004, z);
  }
  b.flat(13.2, 10.5, floor === 3 ? '#7B62A6' : floor === 2 ? '#F0D6AD' : '#DEECE1', -0.25, 0.008, 2.6);
  b.flat(4.2, 5.6, floor === 3 ? '#5E86A8' : '#DAEBE6', 9.3, 0.009, 5.1);

  // Three pocket shops, each with its own canopy, counter and display shelves.
  for (const [i, s] of (floor === 1 ? MALL_SHOPS : []).entries()) {
    const z = -5.1;
    b.flat(4.6, 3.4, ['#F9E6DB', '#E5EFE1', '#F7EDCE'][i], s.x, 0.012, z);
    for (const dx of [-2.35, 2.35]) b.box(0.16, 2.85, 3.6, '#E7D9BF', s.x + dx, 0, -5.2, { collide: true });
    b.box(4.65, 0.32, 0.65, s.color, s.x, 2.58, -3.5);
    // Each storefront has its own face: a scalloped toy awning, a wooden
    // bookshop frame, a striped sports awning with a turf mat.
    if (s.id === 'toys') {
      for (let k = 0; k < 9; k++) b.sphere(0.2, k % 2 ? s.color : '#FFF8E8', s.x - 2.0 + k * 0.5, 2.5, -3.2, { sy: 0.55 });
    } else if (s.id === 'books') {
      for (const dx of [-2.22, 2.22]) b.box(0.22, 2.58, 0.24, '#B98A5C', s.x + dx, 0, -3.3);
      b.box(4.65, 0.14, 0.3, '#9C6E47', s.x, 2.44, -3.22);
    } else {
      for (let k = 0; k < 9; k++) b.box(0.24, 0.12, 0.67, '#FFF8E8', s.x - 2.0 + k * 0.5, 2.45, -3.49);
      b.flat(2.2, 1.0, '#7CB874', s.x, 0.014, -2.75);
    }
    b.box(3.5, 0.9, 0.7, s.color, s.x, 0, -3.65, { collide: true });
    b.box(3.6, 0.07, 0.81, '#FFF9E8', s.x, 0.9, -3.65);
    b.box(0.4, 0.24, 0.29, '#435A66', s.x + 1.18, 0.97, -3.68);
    // Display windows either side of the counter, each showing the shop's goods.
    for (const [w, dx] of [-1.96, 1.96].entries()) {
      const wx = s.x + dx;
      b.box(0.62, 1.2, 0.09, '#AED8DA', wx, 0.7, -3.58);
      b.box(0.7, 0.08, 0.16, '#FFF8E8', wx, 0.65, -3.54);
      b.box(0.05, 1.35, 0.12, '#FFF8E8', wx, 0.6, -3.51);
      if (s.id === 'toys' && !w) { // a toy robot
        b.box(0.26, 0.26, 0.16, '#7EB7CD', wx, 0.75, -3.42); b.box(0.22, 0.18, 0.16, '#A6D7E6', wx, 1.02, -3.42);
        for (const ex of [-0.05, 0.05]) b.sphere(0.022, '#2E3440', wx + ex, 1.12, -3.33);
      } else if (s.id === 'toys') { // a teddy bear
        b.sphere(0.15, '#C9925E', wx, 0.88, -3.42); b.sphere(0.11, '#C9925E', wx, 1.1, -3.42);
        for (const ex of [-0.08, 0.08]) b.sphere(0.045, '#C9925E', wx + ex, 1.2, -3.42);
      } else if (s.id === 'books') { // stacked books and a standing one
        for (let k = 0; k < 3; k++) b.box(0.36 - k * 0.04, 0.07, 0.24, ['#E07A5F', '#81B29A', '#F2CC8F'][k], wx, 0.73 + k * 0.07, -3.42);
        b.box(0.24, 0.32, 0.04, ['#5E81AC', '#B48EAD'][w], wx, 0.94, -3.42, { rx: -0.2 });
      } else if (!w) { // a mannequin in a team shirt
        b.box(0.3, 0.36, 0.14, s.color, wx, 0.78, -3.42); b.box(0.46, 0.1, 0.14, s.color, wx, 1.04, -3.42); b.sphere(0.09, '#EDE3D4', wx, 1.24, -3.42);
      } else { // a soccer ball on a stand
        b.cyl(0.05, 0.08, 0.2, '#8E9FAF', wx, 0.7, -3.42, { seg: 8 }); b.sphere(0.16, '#FFFFFF', wx, 1.04, -3.42); b.sphere(0.06, '#2E3440', wx, 1.1, -3.29);
      }
    }
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
    const sign = signMesh(4.2, 0.62, { bg: s.color, lines: [{ text: s.en, size: 92, color: '#243F50', y: 0.36 }, { text: s.ja, size: 64, color: '#243F50', y: 0.8 }] });
    sign.position.set(s.x, 2.76, -3.15);
    root.add(sign);
  }

  // Four food kiosks face into the shared seating area.
  const foodCounters = (floor === 2 ? MALL_FOOD_COUNTERS : []).map((c) => {
    const front = { x: c.x + Math.sin(c.yaw) * 1.0, z: c.z + Math.cos(c.yaw) * 1.0 };
    const width = c.yaw === 0 ? 4.5 : 3.4;
    b.box(width, 0.96, 0.85, c.color, c.x, 0, c.z, { ry: c.yaw, collide: true });
    b.box(width + 0.1, 0.07, 0.96, '#FFF9EB', c.x, 0.96, c.z, { ry: c.yaw });
    b.box(width + 0.1, 0.3, 0.9, c.color, c.x, 2.38, c.z, { ry: c.yaw });
    for (const offset of [-width / 2 + 0.08, width / 2 - 0.08]) b.box(0.08, 2.4, 0.08, '#B9A58D', c.x + Math.cos(c.yaw) * offset, 0, c.z - Math.sin(c.yaw) * offset);
    // Display plates give each kiosk a distinct food silhouette.
    for (let i = -1; i <= 1; i++) {
      const x = c.x + Math.cos(c.yaw) * i * 0.67, z = c.z - Math.sin(c.yaw) * i * 0.67;
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
    const sign = signMesh(width, 0.64, { bg: c.color, lines: [{ text: c.en, size: c.id === 'sweets' ? 63 : 88, color: '#243F50', y: 0.3 }, { text: c.ja, size: 66, color: '#243F50', y: 0.76 }] });
    sign.position.set(c.x + Math.sin(c.yaw) * 0.48, 2.54, c.z + Math.cos(c.yaw) * 0.48);
    sign.rotation.y = c.yaw;
    root.add(sign);
    return { ...c, front, staff: { x: c.x - Math.sin(c.yaw) * 0.95, z: c.z - Math.cos(c.yaw) * 0.95, yaw: c.yaw } };
  });

  const seats = [];
  for (const t of floor === 2 ? MALL_TABLES : []) {
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
      if (!t.diners) seats.push({ id: `${t.id}-${i}`, table: t.id, x, z, yaw: c.yaw, seatY: 0.47 });
      if (t.diners?.includes(i)) {
        staticDiner(b, x, z, c.yaw, color, i);
        const mealX = t.x + c.dx * 0.4, mealZ = t.z + c.dz * 0.4;
        b.box(0.46, 0.025, 0.35, '#A67C58', mealX, 0.76, mealZ, { ry: c.yaw });
        // foodMesh is already vertex coloured; append its transformed geometry
        // directly so diners and meals remain part of the single static draw.
        const meal = foodMesh(['ramen', 'hamburger', 'sushi', 'icecream'][i]);
        meal.geometry.translate(mealX, 0.79, mealZ);
        b.parts.push(meal.geometry);
      }
    }
    b.box(0.13, 0.15, 0.17, '#D9C39F', t.x, 0.79, t.z);
    b.box(0.11, 0.06, 0.015, '#FFFEF7', t.x, 0.91, t.z);
  }

  if (floor === 1) {
  // Entrance atrium: a low round planter and waiting seating.
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
  }

  if (floor === 1) {
    for (const x of [-8.2, -3.5, 1.2]) bench(b, x, 4.8, Math.PI, '#BF9976');
    for (const x of [-10.5, 3.8]) planter(b, x, 2.8);
    // Capsule-toy machines: a small, colourful island in the open corridor.
    for (const [k, x] of [-5.4, -4.6, -3.8, -3.0].entries()) {
      const c = ['#E98BB6', '#5FC4C2', '#F2C453', '#A889E6'][k];
      b.box(0.62, 0.78, 0.5, c, x, 0, 2.1, { collide: true });
      b.box(0.2, 0.12, 0.06, '#3A3F5C', x, 0.45, 2.37);
      b.sphere(0.27, '#E4F2F7', x, 1.05, 2.1);
      for (const [j, [dx, dy]] of [[-0.1, -0.08], [0.09, -0.1], [0, 0.04], [-0.07, 0.12], [0.1, 0.08]].entries()) b.sphere(0.075, ['#FF8FA3', '#FFD166', '#74C0FC', '#69DB7C', '#B197FC'][(j + k) % 5], x + dx, 1.05 + dy, 2.1);
      b.box(0.66, 0.06, 0.54, '#FFF8E8', x, 1.32, 2.1);
    }
    // Shoppers looking in the display windows.
    for (const [k, [x, color]] of [[-9.4, '#F08C6A'], [-0.55, '#6FA8DC'], [4.45, '#9C7BC9']].entries()) {
      staticStander(b, x, -2.8, Math.PI, color, k + 1);
      b.collideCircle(x, -2.8, 0.3, 1.6);
    }
  } else if (floor === 2) {
    for (const x of [-10.8, 4.5]) planter(b, x, -3.1);
    bench(b, 6.8, 7.15, Math.PI, '#B9936D');
  }
  const blink = floor === 3 ? arcadeShell(b, root) : null;
  const navigation = circulation(b, root, floor);

  root.add(b.build());
  const lights = roomLights(root);
  lights.hemi.color.set('#FFF8E6');
  lights.hemi.intensity = 2.1;
  lights.sun.intensity = 1.3;
  if (floor === 3) { lights.hemi.color.set('#F3EEFF'); lights.hemi.intensity = 2.45; }
  const collision = new CollisionWorld({ bounds: { ...R, maxX: R.maxX + 0.8 } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);
  const spots = seats.map((s) => ({ ...s, kind: 'sit', zone: 'room', tags: ['table', 'sweets', 'reading', 'comics', 'music'] }));
  for (const s of floor === 1 ? MALL_SHOPS : []) spots.push({ id: `browse-${s.id}`, x: s.x + 1.8, z: -1.6, yaw: Math.PI, kind: 'stand', zone: 'room', tags: [s.id === 'sports' ? 'soccer' : s.id === 'books' ? 'reading' : 'games'] });
  if (floor !== 2) for (const [i, x] of [-7, -3, 1, 5].entries()) spots.push({ id: `floor${floor}-open-${i}`, x, z: 1, yaw: Math.PI, kind: 'stand', zone: 'room', tags: floor === 3 ? ['games', 'open'] : ['shopping', 'open'] });
  const interact = [
    ...navigation,
    ...(floor === 1 ? [{ id: 'mallExit', x: 11.65, z: 5.6, r: 1.2, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Door', ja: 'ドア' } }] : []),
    ...(floor === 1 ? MALL_SHOPS : []).map((s) => ({ id: s.id, shop: s.id, x: s.x, z: s.z, r: 1.25, kind: 'mallShop', icon: '🛍️', label: { en: s.en, ja: s.ja } })),
    ...foodCounters.map((c) => ({ id: c.id, counter: c.id, x: c.front.x, z: c.front.z, r: 1.2, kind: 'mallFood', icon: '🍽️', label: { en: c.en, ja: c.ja } })),
    ...(floor === 3 ? Object.entries(MALL_ARCADE_STANDS).map(([game, s]) => ({ id: `arcade-${game}`, game, kind: 'arcade', x: s.x, z: s.z, r: 1.2, icon: ARCADE_LABELS[game].icon, label: { en: ARCADE_LABELS[game].en, ja: ARCADE_LABELS[game].ja } })) : []),
  ];
  if (floor === 3) {
    // Classmates who like games stand at the decorative cabinets as if playing.
    for (const [i, x] of [-9, -6.3, -3.6, -0.9].entries()) spots.push({ id: `arcade-play-${i}`, x, z: 4.35, yaw: Math.PI, kind: 'stand', zone: 'room', tags: ['games'] });
  }
  return {
    id, name: FLOOR_NAMES[floor], floor, root, collision, spots,
    groups: floor === 2 ? [{ id: 'mallDiningEast', x: 5.7, z: 1.5, r: 0.6, zone: 'room' }, { id: 'mallDiningWest', x: -5.0, z: 3.2, r: 0.7, zone: 'room' }] : [{ id: 'mallAtrium', x: 5.7, z: 4.2, r: 0.6, zone: 'room' }, { id: 'mallShops', x: -0.2, z: -1.9, r: 0.7, zone: 'room' }],
    interact, spawns: { ...FLOOR_SPAWNS, ...(floor === 1 ? { door: { x: 10.8, z: 5.6, yaw: -Math.PI / 2 } } : {}) }, lights, seats,
    tables: floor === 2 ? MALL_TABLES : [], shops: floor === 1 ? MALL_SHOPS : [], foodCounters,
    staffSpot: foodCounters.find((c) => c.id === 'sweets')?.staff,
    counterSpot: foodCounters.find((c) => c.id === 'sweets')?.front,
    arcadePositions: floor === 3 ? MALL_ARCADE_POSITIONS : undefined,
    arcadeStands: floor === 3 ? MALL_ARCADE_STANDS : undefined,
    camera: { mode: 'room', yaw: 0, pitch: 0.82, dist: 20.0, center: { x: 0, z: 0.9 }, follow: 0.5, bounds: { minX: -10.8, maxX: 10.8, minZ: -5.5, maxZ: 13 } },
    ambience: () => ({ background: new THREE.Color('#263B46'), fog: null }),
    // Marquee bulbs swap twice a second: two small meshes, no per-frame geometry.
    update: (dt, time = 0) => { if (blink) { const on = Math.floor(time * 2) % 2 === 0; blink[0].visible = on; blink[1].visible = !on; } },
  };
}

export function buildMall() { return buildMallFloor(1); }
export function buildMall2() { return buildMallFloor(2); }
export function buildMall3() { return buildMallFloor(3); }

function planter(b, x, z) {
  b.cyl(0.45, 0.35, 0.55, '#E6BC99', x, 0, z, { seg: 10, collide: true });
  bush(b, x, z, 1.25, '#86B784');
}

function staticDiner(b, x, z, yaw, color, i) {
  const skin = ['#E9B88D', '#BD875F', '#F2CEAA', '#D7A27A'][i];
  const parts = new StaticBuilder();
  parts.box(0.38, 0.48, 0.27, color, 0, 0.52, 0);
  parts.sphere(0.21, skin, 0, 1.19, 0, { sy: 1.1 });
  parts.sphere(0.215, ['#544638', '#34313E', '#855B42', '#43383B'][i], 0, 1.3, -0.035, { sy: 0.65 });
  for (const dx of [-0.11, 0.11]) {
    parts.box(0.15, 0.13, 0.36, '#48536E', dx, 0.44, 0.13);
    parts.box(0.13, 0.4, 0.14, '#48536E', dx, 0.07, 0.26);
    parts.box(0.12, 0.12, 0.36, skin, dx * 2, 0.72, 0.16);
    parts.sphere(0.018, '#3B3540', dx * 0.7, 1.2, 0.2);
  }
  const geometry = parts.buildGeometry();
  geometry.rotateY(yaw);
  geometry.translate(x, 0, z);
  b.parts.push(geometry);
}

function circulation(b, root, floor) {
  const interact = [];
  for (const [via, target, x] of [['escUp', floor + 1, 7], ['escDown', floor - 1, 10]]) {
    if (target < 1 || target > 3) continue;
    // Short rising steps read as an escalator; the scene transition does the
    // vertical journey, so its entire footprint remains a solid fixture.
    b.box(1.95, 0.22, 3.4, '#929FAB', x, 0, -4.7, { collide: true });
    for (let i = 0; i < 10; i++) {
      const z = -3.23 - i * 0.3;
      b.box(1.3, 0.1 + i * 0.115, 0.28, '#CBD3D7', x, 0.22, z);
      b.box(1.28, 0.025, 0.045, '#E7C55D', x, 0.325 + i * 0.115, z + 0.11);
    }
    for (const dx of [-0.86, 0.86]) {
      b.box(0.13, 1.2, 3.4, '#B8D8DA', x + dx, 0.2, -4.7);
      b.box(0.15, 0.09, 3.45, '#475F72', x + dx, 1.4, -4.7);
    }
    const isUp = via === 'escUp';
    const sign = signMesh(1.9, 0.65, { bg: '#FFF7DC', lines: [{ text: `${isUp ? '↑' : '↓'} ${target}F`, size: 130, y: 0.35, color: '#315D72' }, { text: `${target}かいへ`, size: 80, y: 0.8, color: '#315D72' }] });
    sign.position.set(x, 2.04, -4.6);
    root.add(sign);
    interact.push({ id: via, kind: 'mallEscalator', floor: target, via, x, z: -2.7, r: 1.1, icon: isUp ? '⬆️' : '⬇️', label: { en: `Go ${isUp ? 'up' : 'down'} to ${target}F`, ja: `${target}かいへ${isUp ? '上がる' : '下りる'}` } });
  }
  b.box(1.5, 2.8, 2.35, '#8E9FAF', 11.1, 0, 0, { collide: true });
  b.box(0.08, 2.45, 1.85, '#C7D3DC', 10.31, 0.08, 0);
  b.box(0.09, 2.35, 0.045, '#6C859A', 10.25, 0.08, 0);
  b.box(0.12, 0.34, 0.2, '#FFF3C6', 10.22, 1.02, 1.06);
  const elevator = signMesh(1.95, 0.55, { bg: '#F8F1D9', lines: [{ text: `Elevator ${floor}F`, size: 82, y: 0.34, color: '#315D72' }, { text: 'エレベーター', size: 75, y: 0.8, color: '#315D72' }] });
  elevator.position.set(10.24, 2.66, 0);
  elevator.rotation.y = -Math.PI / 2;
  root.add(elevator);
  interact.push({ id: 'elevator', kind: 'mallElevator', x: 9.55, z: 0, r: 1.05, icon: '↕️', label: { en: 'Elevator', ja: 'エレベーター' } });
  b.box(0.1, 1.7, 1.75, '#77AAA6', 10.5, 0, 3.45, { collide: true });
  const directory = signMesh(1.65, 1.55, { bg: '#FFFAEB', border: { color: '#77AAA6', width: 12 }, lines: [
    { text: 'NIJI MALL  にじモール', size: 31, y: 0.1, color: '#386A73' },
    { text: '3F Games  ゲーム', size: 35, y: 0.3, color: '#6E5993' },
    { text: '2F Food  食べもの', size: 35, y: 0.5, color: '#A36E44' },
    { text: '1F Shops  お店', size: 35, y: 0.7, color: '#386A73' },
    { text: `${floor}F You are here  いまここ`, size: 26, y: 0.9, color: '#C46F72' },
  ] });
  directory.position.set(10.43, 1.18, 3.45);
  directory.rotation.y = -Math.PI / 2;
  root.add(directory);
  interact.push({ id: 'directory', x: 9.7, z: 3.45, r: 1.15, kind: 'mallDirectory', icon: '🗺️', label: { en: 'Mall directory', ja: 'モールのあんない' } });
  const banner = signMesh(7.0, 0.7, { bg: floor === 3 ? '#DCC9F0' : '#FFF5DC', lines: [{ text: `${FLOOR_NAMES[floor].en}  /  ${FLOOR_NAMES[floor].ja}`, size: 40, color: '#375B70' }] });
  banner.position.set(-1.3, 3.15, -6.86);
  root.add(banner);
  return interact;
}

// A standing figure in merged geometry: shoppers browsing and arcade players.
function staticStander(b, x, z, yaw, color, i) {
  const skin = ['#E9B88D', '#BD875F', '#F2CEAA', '#D7A27A'][i % 4];
  const parts = new StaticBuilder();
  for (const dx of [-0.1, 0.1]) parts.box(0.14, 0.62, 0.17, '#48536E', dx, 0, 0);
  parts.box(0.4, 0.52, 0.27, color, 0, 0.62, 0);
  for (const dx of [-0.25, 0.25]) parts.box(0.12, 0.44, 0.14, skin, dx, 0.7, 0.06, { rx: -0.35 });
  parts.sphere(0.22, skin, 0, 1.38, 0, { sy: 1.1 });
  parts.sphere(0.225, ['#544638', '#34313E', '#855B42', '#43383B'][i % 4], 0, 1.49, -0.035, { sy: 0.65 });
  for (const dx of [-0.075, 0.075]) parts.sphere(0.02, '#3B3540', dx, 1.39, 0.2);
  const geometry = parts.buildGeometry();
  geometry.rotateY(yaw);
  geometry.translate(x, 0, z);
  b.parts.push(geometry);
}

/** 3F Game Center. Returns the two alternating marquee-bulb meshes. */
function arcadeShell(b, root) {
  const bulbs = [new StaticBuilder(), new StaticBuilder()];
  const bulbRow = (x0, x1, y, z, n) => { for (let k = 0; k < n; k++) bulbs[k % 2].sphere(0.055, ['#FFF27A', '#FF9AD5', '#8AF0FF'][k % 3], x0 + (x1 - x0) * (k / (n - 1)), y, z); };
  for (const [i, pos] of Object.values(MALL_ARCADE_POSITIONS).entries()) {
    const { x, z } = pos, color = ['#5FC2E8', '#F28DC0', '#B49BF0'][i];
    // A lit floor pad under each machine marks it as playable.
    b.flat(3.8, 3.7, ['#4E8FC4', '#C2669E', '#8A6CC8'][i], x, 0.014, z + 0.7);
    b.flat(3.5, 3.4, ['#6FB2E2', '#E58BBF', '#A88EE0'][i], x, 0.016, z + 0.7);
    if (i === 0) {
      b.box(2.3, 1.35, 0.8, color, x, 0, z, { collide: true });
      b.box(2.4, 0.5, 0.9, '#3E5D8C', x, 1.95, z);
      b.box(1.8, 0.85, 0.1, '#22304A', x, 1.1, z + 0.43);
      // Screen: a road and two little cars.
      b.box(0.5, 0.78, 0.02, '#5D6170', x, 1.13, z + 0.49);
      b.box(0.1, 0.1, 0.03, '#E5534B', x - 0.1, 1.3, z + 0.5);
      b.box(0.1, 0.1, 0.03, '#5C7CFA', x + 0.1, 1.55, z + 0.5);
      b.box(1.2, 0.45, 1.3, '#536A8C', x, 0, z + 1.15, { collide: true });
      b.box(1.0, 0.65, 0.25, color, x, 0.4, z + 1.7);
      b.add(G.torus(0.24, 0.045, 6, 12), '#E7C76C', { x, y: 1.03, z: z + 0.7, rx: -0.55 });
    } else if (i === 1) {
      b.box(2.25, 0.68, 1.6, color, x, 0, z, { collide: true });
      b.box(2.35, 0.32, 1.7, color, x, 2.25, z);
      // An open front frame (no opaque pane) keeps the prizes visible.
      b.box(2.0, 0.08, 0.06, '#E9F4F8', x, 0.68, z + 0.78);
      b.box(2.0, 0.08, 0.06, '#E9F4F8', x, 2.17, z + 0.78);
      for (const dx of [-1.08, 1.08]) b.box(0.09, 1.65, 1.55, '#D5E7EB', x + dx, 0.65, z);
      for (const [j, dx] of [-0.65, 0, 0.65].entries()) {
        b.sphere(0.23, ['#C9925E', '#F2C26B', '#86C28B'][j], x + dx, 0.92, z - 0.25);
        b.sphere(0.2, ['#F4D9E3', '#F7D84B', '#F6B94A'][j], x + dx * 0.8, 0.9, z + 0.3);
      }
      b.cyl(0.035, 0.035, 0.5, '#718999', x, 1.67, z, { seg: 6 });
      for (const dx of [-0.14, 0.14]) b.box(0.06, 0.3, 0.06, '#718999', x + dx, 1.4, z, { rz: dx });
      b.box(0.5, 0.5, 0.4, '#3A3F5C', x + 0.78, 0.18, z + 0.62);
    } else {
      b.box(2.2, 2.15, 0.9, color, x, 0, z, { collide: true });
      b.box(1.75, 1.1, 0.08, '#2A3352', x, 0.92, z + 0.49);
      for (const [j, c] of ['#F2B0BD', '#F1D47D', '#7FD3CF'].entries()) {
        b.box(0.4, 0.22, 0.05, c, x - 0.52 + j * 0.52, 1.2 + j * 0.14, z + 0.55);
        b.cyl(0.27, 0.27, 0.07, c, x - 0.6 + j * 0.6, 0.65, z + 0.9, { seg: 12 });
      }
      b.box(2.2, 0.4, 0.8, '#596988', x, 0.2, z + 0.7, { collide: true });
    }
    bulbRow(x - 1.25, x + 1.25, 2.47, z + 0.2, 9);
    const titles = [['Racing', 'レース'], ['Crane', 'クレーン'], ['Rhythm', 'リズム']];
    const sign = signMesh(2.6, 0.62, { bg: color, lines: [{ text: titles[i][0], size: 92, color: '#21304A', y: 0.36 }, { text: titles[i][1], size: 62, color: '#21304A', y: 0.78 }] });
    sign.position.set(x, 2.9, z + 0.2);
    root.add(sign);
  }
  // Decorative cabinets in the middle row, two of them being played.
  for (const [i, x] of [-9, -6.3, -3.6, -0.9].entries()) {
    const z = 3.3;
    const c = ['#E98BB6', '#5FC4C2', '#A889E6', '#E8C35C'][i];
    b.box(1.35, 1.8, 0.85, c, x, 0, z, { collide: true });
    b.box(1.45, 0.3, 0.95, '#2E3657', x, 1.8, z);
    b.box(1.0, 0.72, 0.06, '#26304C', x, 0.85, z + 0.46);
    for (const dx of [-0.25, 0, 0.25]) b.box(0.12, 0.12, 0.03, ['#D9B4E9', '#9BDCD7', '#F2CB77'][i % 3], x + dx, 1.1, z + 0.5);
    b.box(1.2, 0.1, 0.4, '#485974', x, 0.7, z + 0.55);
    bulbRow(x - 0.6, x + 0.6, 2.13, z + 0.48, 5);
  }
  staticStander(b, -6.3, 4.25, Math.PI, '#F08C6A', 0);
  staticStander(b, -0.9, 4.25, Math.PI, '#6FA8DC', 2);
  // A light-up path guides players from the escalators to the machines.
  for (let x = -9.5; x <= 6; x += 1.1) {
    b.cyl(0.13, 0.13, 0.012, ['#FFE27F', '#FF9AD5', '#8AF0FF'][Math.round((x + 9.5) / 1.1) % 3], x, 0.02, 1.0, { seg: 10 });
  }
  for (const x of [-6.5, -2.2, 2.1]) bench(b, x, 6.8, Math.PI, '#B19ACB');
  for (const x of [-10.5, 5.5]) planter(b, x, 6.4);
  // Neon strips along the back wall and a bright GAME CENTER marquee.
  for (const [k, c] of ['#FF7FC8', '#7FE8FF', '#FFE27F'].entries()) b.box(22.6, 0.07, 0.06, c, 0, 2.5 + k * 0.09, -6.83);
  for (const x of [-11.6, 11.6]) for (const [k, c] of ['#FF7FC8', '#7FE8FF'].entries()) b.box(0.06, 2.6, 0.06, c, x + (k ? 0.1 : 0), 0.3, -6.83);
  const marquee = signMesh(6.2, 0.9, { bg: '#2E2A5A', border: { color: '#FF7FC8', width: 14 }, lines: [{ text: '★ GAME CENTER ★', size: 120, color: '#FFE27F', y: 0.42 }, { text: 'ゲームセンター', size: 70, color: '#8AF0FF', y: 0.82 }] });
  marquee.position.set(6.4, 2.3, -6.74);
  root.add(marquee);
  bulbRow(3.4, 9.4, 2.85, -6.72, 15);
  const blink = bulbs.map((bb) => { const m = bb.build(new THREE.MeshBasicMaterial({ vertexColors: true })); root.add(m); return m; });
  blink[1].visible = false;
  return blink;
}
