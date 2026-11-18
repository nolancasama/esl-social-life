// Sakura Town: the outdoor hub. North-west: school. North-east: Niji Mall
// (opening soon). South-east: Sakura Park. South-west: café and the lane with
// the player's house. Coordinates: x east, z south, metres.

import * as THREE from 'three';
import { FRIEND_HOUSE_DOOR } from '../../world/friendhouse.js';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { vertexMaterial } from '../materials.js';
import { clockTexture, textTexture } from '../textures.js';
import {
  PAL, sakura, tree, bush, bench, lamp, pole, wire, vending, fence, hedge, house, block, roof,
  makeSky, cloudCluster, makeLights,
} from './common.js';

function textPlane(w, h, opts, x, y, z, ry = 0) {
  const t = textTexture(Math.round(256 * (w / h)), 256, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !opts.bg, toneMapped: false }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

export function buildTown({ shadows = false, playerName = '' } = {}) {
  const root = new THREE.Group();
  root.name = 'town';
  const ground = new StaticBuilder();
  const school = new StaticBuilder();
  const mall = new StaticBuilder();
  const park = new StaticBuilder();
  const resi = new StaticBuilder();
  const decor = new StaticBuilder();
  const spots = [];
  const interact = [];
  const hides = [];

  // ---------------------------------------------------------------- ground
  ground.flat(260, 260, PAL.grass, 0, 0, 0);
  ground.flat(84, 6, PAL.road, 0, 0.012, 0);
  ground.flat(6, 76, PAL.road, 0, 0.013, 0);
  for (let x = -40; x <= 40; x += 4) if (Math.abs(x) > 6) ground.flat(1.8, 0.16, PAL.roadLine, x, 0.02, 0);
  for (let z = -36; z <= 36; z += 4) if (Math.abs(z) > 6) ground.flat(0.16, 1.8, PAL.roadLine, 0, 0.02, z);
  // Sidewalks
  for (const s of [-1, 1]) {
    ground.flat(37, 2, PAL.sidewalk, s * 23.5, 0.02, -4);
    ground.flat(37, 2, PAL.sidewalk, s * 23.5, 0.02, 4);
    ground.flat(2, 33, PAL.sidewalk, -4, 0.021, s * 21.5);
    ground.flat(2, 33, PAL.sidewalk, 4, 0.021, s * 21.5);
    ground.flat(2, 2, PAL.sidewalk, s * 4, 0.021, -4);
    ground.flat(2, 2, PAL.sidewalk, s * 4, 0.021, 4);
  }
  // Curbs
  for (const s of [-1, 1]) for (const side of [-1, 1]) {
    ground.box(37, 0.06, 0.12, PAL.curb, s * 23.5, 0, side * 3.06);
    ground.box(0.12, 0.06, 33, PAL.curb, side * 3.06, 0, s * 21.5);
  }
  // Crosswalks
  for (const s of [-1, 1]) {
    for (let k = -2.4; k <= 2.4; k += 0.95) {
      ground.flat(2.2, 0.48, PAL.roadLine, s * 4.6, 0.022, k);
      ground.flat(0.48, 2.2, PAL.roadLine, k, 0.022, s * 4.6);
    }
  }
  // Lane to the houses
  ground.flat(3, 32, PAL.road, -21.5, 0.012, 21);
  ground.flat(3, 1.2, PAL.sidewalk, -21.5, 0.025, 4.6);

  // ---------------------------------------------------------------- school (NW)
  const SX = -24, SZ = -29;
  school.flat(30, 16.5, PAL.sand, -23, 0.015, -14.75);
  block(school, SX, SZ, 26, 12, 10.5, '#F5F2EA', { trim: '#DDD6C8' });
  for (let fl = 0; fl < 3; fl++) {
    for (let x = -35.5; x <= -12.5; x += 2.3) {
      if (fl === 0 && x > -26.5 && x < -21.5) continue;
      school.box(1.7, 1.5, 0.1, PAL.glass, x, 1.1 + fl * 3.3, -22.98);
      school.box(1.8, 0.1, 0.18, '#FFFFFF', x, 1.05 + fl * 3.3, -22.95);
    }
  }
  school.box(3.2, 2.5, 0.12, '#7FB8D8', SX, 0, -22.97);
  school.box(0.08, 2.5, 0.16, '#FFFFFF', SX, 0, -22.95);
  school.box(5.2, 0.25, 2.6, '#D9D2C4', SX, 2.8, -21.8);
  school.box(0.18, 2.8, 0.18, '#C9C2B4', SX - 2.4, 0, -20.7);
  school.box(0.18, 2.8, 0.18, '#C9C2B4', SX + 2.4, 0, -20.7);
  school.cyl(0.8, 0.8, 0.14, '#FFFFFF', SX, 8.6, -22.9, { rx: Math.PI / 2, seg: 20 });
  // Yard fence with a gate gap at x ∈ [-26, -21]
  fence(school, -38, -6.2, -26.6, -6.2, { h: 1.2, color: '#4E8F6E', post: '#3E7458' });
  fence(school, -20.4, -6.2, -7.5, -6.2, { h: 1.2, color: '#4E8F6E', post: '#3E7458' });
  fence(school, -38, -23, -38, -6.2, { h: 1.2, color: '#4E8F6E', post: '#3E7458' });
  fence(school, -7.5, -23, -7.5, -6.2, { h: 1.2, color: '#4E8F6E', post: '#3E7458' });
  for (const gx of [-26.5, -20.5]) school.box(0.7, 1.7, 0.7, PAL.stone, gx, 0, -6.2, { collide: true });
  for (const x of [-35.5, -31.5, -29, -17.5, -13.5, -10]) sakura(school, x, -8.6, 1.05);
  school.cyl(0.05, 0.06, 8, '#D0D5DB', -11, 0, -19.5, { seg: 6, collide: true });
  school.box(1.2, 0.8, 0.02, '#FFFFFF', -10.4, 7.0, -19.5);
  school.sphere(0.12, '#E63946', -10.4, 7.4, -19.49, { sz: 0.1 });
  // Iron bars (tetsubō) in the yard
  for (const [x, h] of [[-34, 1.0], [-32.6, 1.3], [-31.2, 1.6]]) {
    school.cyl(0.04, 0.04, h, '#E9C46A', x - 0.6, 0, -16, { seg: 6 });
    school.cyl(0.04, 0.04, h, '#E9C46A', x + 0.6, 0, -16, { seg: 6 });
    school.add(G.cyl(6), '#E76F51', { x, y: h, z: -16, rz: Math.PI / 2, sx: 0.06, sy: 1.25, sz: 0.06 });
  }
  school.collideBox(-32.6, -16, 4.2, 0.3, 0, 1.6);
  interact.push({ id: 'schoolDoor', x: SX, z: -21.6, r: 1.8, kind: 'door', to: 'classroom', icon: '🏫', label: { en: 'School', ja: '学校' } });

  // ---------------------------------------------------------------- mall (NE)
  mall.flat(34, 10.5, '#EDE6DA', 24, 0.016, -11.75);
  block(mall, 25, -26, 28, 18, 9, '#FDF6EC', { trim: '#E6DCCB' });
  const rainbow = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA'];
  rainbow.forEach((c, i) => mall.box(28.1, 0.26, 0.1, c, 25, 7.05 + i * 0.26, -16.97));
  mall.box(8, 3.4, 0.12, '#BCE8EC', 25, 0, -16.96);
  for (const x of [21.1, 25, 28.9]) mall.box(0.08, 3.3, 0.14, '#FFFFFF', x, 0.05, -16.93);
  for (const x of [13.5, 17, 33, 36.5]) { mall.box(2.6, 2.2, 0.1, PAL.glass, x, 1.0, -16.96); mall.box(2.7, 0.12, 0.15, '#FFFFFF', x, 0.95, -16.93); }
  for (const x of [12, 18, 32, 38]) { mall.box(2.2, 0.5, 1.0, '#C9B79C', x, 0, -9.5, { collide: true }); bush(mall, x, -9.5, 1.1, PAL.leaf); }
  const mb1 = bench(mall, 15, -12.5, 0);
  const mb2 = bench(mall, 35, -12.5, 0);
  vending(mall, 40, -14, -Math.PI / 2, '#E8434A');
  vending(mall, 40, -12.8, -Math.PI / 2, '#3D8BFD');
  for (let i = 0; i < 4; i++) mall.add(G.torus(0.35, 0.03, 4, 12), '#9AA3AD', { x: 8.6, y: 0.4, z: -15 + i * 0.7, ry: Math.PI / 2 });
  // Town info board (attractions) at the crossroads corner
  mall.box(0.12, 2.3, 0.12, PAL.woodDark, 6.4, 0, -7.2);
  mall.box(0.12, 2.3, 0.12, PAL.woodDark, 8.9, 0, -7.2);
  mall.box(2.8, 1.5, 0.14, PAL.wood, 7.65, 0.95, -7.2, { collide: true });
  interact.push({ id: 'mallDoor', x: 25, z: -15.6, r: 2.4, kind: 'door', to: 'mall', icon: '🛍️', label: { en: 'Niji Mall', ja: 'にじモール' } });
  interact.push({ id: 'infoBoard', x: 7.65, z: -6.3, r: 1.6, kind: 'board', icon: '🗾', label: { en: 'Town board', ja: '町のけいじばん' } });

  // ---------------------------------------------------------------- park (SE)
  park.flat(35, 31, PAL.grass2, 23.5, 0.014, 21.5);
  park.flat(9, 9, '#DCD5C8', 10, 0.02, 10);
  park.flat(26, 2, PAL.path, 27, 0.02, 10);
  park.flat(2, 22, PAL.path, 9, 0.02, 25);
  park.flat(30, 2, PAL.path, 25, 0.02, 33.5);
  park.flat(2, 23, PAL.path, 39, 0.02, 22);
  // Field with lines and small goals
  const FX = 22, FZ = 19.75;
  park.flat(16, 12.5, PAL.field, FX, 0.022, FZ);
  for (const [w, d, x, z] of [[16, 0.12, FX, FZ - 6.2], [16, 0.12, FX, FZ + 6.2], [0.12, 12.5, FX - 8, FZ], [0.12, 12.5, FX + 8, FZ], [0.12, 12.5, FX, FZ]]) park.flat(w, d, '#FFFFFF', x, 0.028, z);
  park.add(G.torus(1.6, 0.05, 3, 28), '#FFFFFF', { x: FX, y: 0.03, z: FZ, rx: Math.PI / 2, sz: 0.4 });
  for (const s of [-1, 1]) {
    const gx = FX + s * 7.6;
    for (const dz of [-1.3, 1.3]) park.cyl(0.05, 0.05, 1.1, '#FFFFFF', gx, 0, FZ + dz, { seg: 6, collide: true });
    park.add(G.cyl(6), '#FFFFFF', { x: gx, y: 1.1, z: FZ, rx: Math.PI / 2, sx: 0.1, sy: 2.6, sz: 0.1 });
    park.box(0.04, 1.0, 2.6, '#E9ECEF', gx + s * 0.6, 0.05, FZ);
  }
  // Hedges with the entrance at the north-west corner
  hedge(park, 14.5, 6.1, 41, 6.6);
  hedge(park, 6.1, 14.5, 6.6, 37);
  hedge(park, 6.1, 36.6, 41, 37.1);
  hedge(park, 40.6, 6.6, 41.1, 36.6);
  // Fountain at the entrance plaza
  park.cyl(1.5, 1.6, 0.5, PAL.stone, 11, 0, 11, { seg: 16, collide: true });
  park.cyl(1.3, 1.3, 0.04, PAL.water, 11, 0.46, 11, { seg: 16 });
  park.cyl(0.18, 0.25, 1.1, PAL.stone, 11, 0.4, 11, { seg: 8 });
  park.sphere(0.3, '#BDE8F7', 11, 1.55, 11, { sy: 0.7 });
  // Pond with koi and rocks
  const PX = 33.5, PZ = 22;
  park.add(G.cyl(20), '#9BB8C9', { x: PX, y: 0.01, z: PZ, sx: 7, sy: 0.05, sz: 10.5 });
  park.add(G.cyl(20), PAL.water, { x: PX, y: 0.04, z: PZ, sx: 6.2, sy: 0.04, sz: 9.6 });
  for (const [dx, dz, c] of [[-1, -2, '#FF8C42'], [1.2, 1.5, '#FFFFFF'], [0.3, 3.4, '#FF6B35'], [-1.4, 2, '#FFD166']]) park.sphere(0.2, c, PX + dx, 0.07, PZ + dz, { sx: 0.5, sy: 0.25, sz: 1.2, ry: dx });
  for (const [dx, dz, r] of [[-3.4, -3, 0.5], [3.2, -2, 0.4], [3.3, 3.2, 0.55], [-3.1, 3.8, 0.45], [0, -5.2, 0.5]]) park.add(G.ico(0), '#A7A29A', { x: PX + dx, y: 0.2, z: PZ + dz, sx: r * 2, sy: r * 1.3, sz: r * 2 });
  for (const dz of [-3.2, 0, 3.2]) park.collideCircle(PX, PZ + dz, 2.9, 0.3);
  // Playground: slide, swings, sandbox, toy box
  park.flat(10.5, 5, PAL.sand, 16.5, 0.024, 29.5);
  park.box(1.0, 1.6, 1.0, '#E76F51', 13, 0, 29.2, { collide: true });
  park.add(G.box(), '#F4A261', { x: 13, y: 0.95, z: 30.6, rx: 0.65, sx: 0.8, sy: 0.06, sz: 2.2 });
  for (const s of [-1, 1]) park.add(G.box(), '#E76F51', { x: 13 + s * 0.42, y: 1.02, z: 30.6, rx: 0.65, sx: 0.06, sy: 0.18, sz: 2.2 });
  park.collideBox(13, 30.7, 1.0, 1.9, 0, 1.2);
  for (const s of [-1, 1]) park.add(G.cyl(6), '#2A9D8F', { x: 17.5 + s * 1.3, y: 1.2, z: 29.5, rz: s * 0.12, sx: 0.12, sy: 2.4, sz: 0.12 });
  park.add(G.cyl(6), '#2A9D8F', { x: 17.5, y: 2.35, z: 29.5, rz: Math.PI / 2, sx: 0.12, sy: 2.8, sz: 0.12 });
  for (const dx of [-0.6, 0.6]) {
    park.box(0.5, 0.06, 0.25, '#E9C46A', 17.5 + dx, 0.5, 29.5);
    park.add(G.cyl(4), '#9AA3AD', { x: 17.5 + dx, y: 1.45, z: 29.5, sx: 0.02, sy: 1.85, sz: 0.02 });
  }
  park.collideBox(17.5, 29.5, 2.8, 0.4, 0, 2.4);
  park.box(3, 0.3, 3, '#C9A66B', 21.8, 0, 29.6, { collide: true });
  park.flat(2.6, 2.6, '#F1DFB0', 21.8, 0.31, 29.6);
  park.box(1.0, 0.7, 0.7, '#B07D4F', 24.6, 0, 31, { collide: true });
  park.box(1.04, 0.06, 0.74, '#8F5F3A', 24.6, 0.7, 31);
  // Basketball hoop
  park.cyl(0.07, 0.09, 3.2, '#5B6270', 37.3, 0, 30.2, { seg: 6, collide: true });
  park.box(0.08, 0.9, 1.3, '#FFFFFF', 37.1, 2.7, 30.2);
  park.add(G.torus(0.24, 0.025, 4, 12), '#FF6B35', { x: 36.8, y: 2.85, z: 30.2, rx: Math.PI / 2 });
  // Benches
  const pb1 = bench(park, 10.6, 18, Math.PI / 2);
  const pb2 = bench(park, 10.6, 24, Math.PI / 2);
  const pb3 = bench(park, 22, 12.0, 0);
  const pb4 = bench(park, 31, 32.0, Math.PI);
  const pb5 = bench(park, 37.6, 15, -Math.PI / 2);
  // Big sakura (landmark) and the tree ring
  sakura(park, 33.5, 29.8, 1.5);
  for (const x of [17, 22, 27, 32, 37]) sakura(park, x, 7.8, 0.95);
  for (const z of [17, 23, 29]) sakura(park, 7.4, z + 0.5, 0.95);
  for (const x of [17, 27]) sakura(park, x, 35.6, 0.95);
  for (const [x, z] of [[39.5, 8.5], [12.5, 35.5]]) tree(park, x, z, 1.1);
  for (const [x, z] of [[13, 8.5], [24.5, 8.6], [8.3, 15], [8.3, 30], [20, 35.4], [35, 35.4], [40, 20]]) lamp(park, x, z);
  // Park sign
  park.box(0.12, 1.4, 0.12, PAL.woodDark, 6.6, 0, 5.8);
  park.box(0.12, 1.4, 0.12, PAL.woodDark, 9.4, 0, 5.8);
  park.box(3, 0.9, 0.1, PAL.wood, 8, 0.8, 5.8, { collide: true });

  // Hiding spots for the lost-item activity (park)
  hides.push(
    { id: 'pb1-under', prep: 'under', obj: { en: 'bench', ja: 'ベンチ' }, item: { x: 10.6, y: 0.1, z: 18 }, look: { x: 11.8, z: 18 } },
    { id: 'pb3-on', prep: 'on', obj: { en: 'bench', ja: 'ベンチ' }, item: { x: 22.4, y: 0.62, z: 12.0 }, look: { x: 22.4, z: 13.1 } },
    { id: 'pb4-under', prep: 'under', obj: { en: 'bench', ja: 'ベンチ' }, item: { x: 31, y: 0.1, z: 32 }, look: { x: 31, z: 30.9 } },
    { id: 'tree-by', prep: 'by', obj: { en: 'tree', ja: '木' }, item: { x: 32.3, y: 0.12, z: 28.9 }, look: { x: 31.4, z: 28.3 } },
    { id: 'box-in', prep: 'in', obj: { en: 'box', ja: '箱' }, item: { x: 24.6, y: 0.62, z: 31 }, look: { x: 24.6, z: 29.9 } },
    { id: 'slide-under', prep: 'under', obj: { en: 'slide', ja: 'すべり台' }, item: { x: 13, y: 0.12, z: 31.2 }, look: { x: 14.1, z: 31.4 } },
    { id: 'fountain-by', prep: 'by', obj: { en: 'fountain', ja: 'ふん水' }, item: { x: 12.7, y: 0.12, z: 12.4 }, look: { x: 13.4, z: 13.1 } },
  );

  // ---------------------------------------------------------------- café (SW corner)
  const CX = -12, CZ = 13;
  resi.box(10, 4.2, 8, '#F6E7D0', CX, 0, CZ, { collide: true });
  resi.box(10.1, 1.0, 8.1, '#B98A5D', CX, 0, CZ);
  roof(resi, CX, 4.2, CZ, 8.8, 1.8, 10.8, '#A45A41', Math.PI / 2);
  for (const dx of [-3.1, 3.1]) {
    resi.box(2.6, 1.7, 0.1, PAL.glass, CX + dx, 1.0, 8.97);
    resi.box(2.7, 0.12, 0.16, '#FFFFFF', CX + dx, 0.95, 8.95);
  }
  resi.box(1.3, 2.2, 0.1, '#8F5F3A', CX, 0, 8.96);
  resi.box(0.9, 1.0, 0.04, PAL.glass, CX, 1.0, 8.9);
  for (let i = 0; i < 10; i++) resi.add(G.box(), i % 2 ? '#FFFFFF' : '#2F9E6E', { x: CX - 4.5 + i + 0.5, y: 2.85, z: 8.35, rx: 0.45, sx: 1.0, sy: 0.08, sz: 1.5 });
  resi.flat(10, 3.6, '#C9A57B', CX, 0.025, 6.9);
  for (const tx of [-15.2, -8.8]) {
    resi.cyl(0.45, 0.45, 0.06, '#FFFFFF', tx, 0.72, 6.9, { seg: 14 });
    resi.cyl(0.05, 0.07, 0.72, PAL.dark, tx, 0, 6.9, { seg: 6, collide: true, pad: 0.35 });
    resi.cyl(0.03, 0.03, 2.2, '#DDDDDD', tx, 0.75, 6.9, { seg: 5 });
    resi.cone(1.25, 0.55, tx === -15.2 ? '#FF8FA3' : '#FFD166', tx, 2.6, 6.9, { seg: 10 });
    for (const dx of [-0.75, 0.75]) resi.cyl(0.22, 0.22, 0.45, PAL.wood, tx + dx, 0, 6.9, { seg: 10 });
  }
  resi.cyl(0.22, 0.22, 1.1, '#E63946', -6.2, 0, 6.4, { seg: 10, collide: true });
  resi.sphere(0.23, '#E63946', -6.2, 1.1, 6.4, { sy: 0.5 });
  // Traffic mirror (orange round mirror)
  resi.cyl(0.05, 0.05, 2.6, '#F08C2E', -5.6, 0, 5.6, { seg: 6, collide: true });
  resi.cyl(0.42, 0.42, 0.06, '#F08C2E', -5.6, 2.75, 5.6, { rx: Math.PI / 2, ry: -Math.PI / 4, seg: 16 });
  resi.cyl(0.36, 0.36, 0.07, '#DDEFF7', -5.55, 2.75, 5.55, { rx: Math.PI / 2, ry: -Math.PI / 4, seg: 16 });
  interact.push({ id: 'cafeDoor', x: CX, z: 8.3, r: 1.6, kind: 'door', to: 'cafe', icon: '☕', label: { en: 'Café', ja: 'カフェ' } });

  // ---------------------------------------------------------------- residential lane
  const H = house(resi, -28.5, 24, 8, 7, { wall: '#FFF1DE', roofColor: '#C44536', ry: Math.PI / 2 });
  resi.flat(2.2, 8, '#A7D58C', -24, 0.02, 24);
  for (let i = 0; i < 3; i++) resi.cyl(0.32, 0.32, 0.04, PAL.stone, -24.6 + i * 0.75, 0.02, 22.3, { seg: 10 });
  fence(resi, -23.2, 18.5, -23.2, 21.4, { h: 0.9, color: '#FFFFFF', post: '#E5E1D8' });
  fence(resi, -23.2, 23.2, -23.2, 28, { h: 0.9, color: '#FFFFFF', post: '#E5E1D8' });
  resi.box(0.35, 1.0, 0.35, '#E63946', -23.4, 0, 21.2);
  resi.box(0.5, 0.35, 0.4, '#E63946', -23.4, 1.0, 21.2);
  // Bicycle
  for (const dz of [-0.45, 0.45]) resi.add(G.torus(0.3, 0.035, 4, 14), '#2E3440', { x: -24.6, y: 0.32, z: 26.4 + dz, ry: Math.PI / 2 });
  resi.add(G.box(), '#4DABF7', { x: -24.6, y: 0.5, z: 26.4, sx: 0.05, sy: 0.05, sz: 0.9 });
  resi.collideBox(-24.6, 26.4, 0.4, 1.4, 0, 0.8);
  for (const [x, z, c] of [[-24.2, 19.5, '#FF8FA3'], [-24.6, 19.0, '#FFD166'], [-24.0, 28.6, '#9775FA']]) { resi.sphere(0.25, PAL.leaf, x, 0.25, z); resi.sphere(0.12, c, x, 0.48, z); }
  house(resi, -28.5, 12.5, 7, 6.5, { wall: '#EAF4FF', roofColor: PAL.roofBlue, ry: Math.PI / 2 });
  house(resi, -28.5, 33.3, 7, 6.5, { wall: '#FFF8E1', roofColor: PAL.roofGray, ry: Math.PI / 2 });
  house(resi, -15, 23.5, 7, 6.5, { wall: '#FFF0F3', roofColor: PAL.roofTeal, ry: -Math.PI / 2 });
  house(resi, -15, 32.5, 7, 6.5, { wall: '#F3FFE9', roofColor: PAL.roofRed, ry: -Math.PI / 2 });
  for (const [x, z] of [[-24, 9.5], [-19, 18.6], [-24, 16.5], [-19, 28]]) tree(resi, x, z, 0.9);
  for (const z of [11, 13, 15]) bush(resi, -18.8, z, 1.0);
  // Little shrine at the end of the lane
  resi.box(0.22, 2.6, 0.22, '#D7263D', -22.9, 0, 35.2, { collide: true });
  resi.box(0.22, 2.6, 0.22, '#D7263D', -20.1, 0, 35.2, { collide: true });
  resi.box(3.7, 0.22, 0.32, '#D7263D', -21.5, 2.5, 35.2);
  resi.box(3.2, 0.16, 0.24, '#D7263D', -21.5, 2.1, 35.2);
  resi.box(1.6, 1.2, 1.2, '#C08A5A', -21.5, 0.4, 37.0, { collide: true });
  roof(resi, -21.5, 1.6, 37.0, 1.9, 0.7, 1.6, '#5B6270');
  resi.box(1.8, 0.4, 1.4, PAL.stone, -21.5, 0, 37.0);
  interact.push({ id: 'homeDoor', x: H.door[0] + 0.2, z: H.door[1], r: 1.6, kind: 'door', to: 'home', icon: '🏠', label: { en: 'My house', ja: '自分の家' } });
  interact.push({ id: 'friendHouse', x: FRIEND_HOUSE_DOOR.x, z: FRIEND_HOUSE_DOOR.z, r: 1.5, kind: 'friendhouse', icon: '🏡', label: { en: "Friend's house", ja: '友達の家' } });

  // ---------------------------------------------------------------- street furniture
  const polesS = [-38, -27, -16, 9, 20, 31];
  polesS.forEach((x) => pole(decor, x, 4.7));
  for (let i = 0; i < polesS.length - 1; i++) {
    if (polesS[i + 1] - polesS[i] > 15) continue;
    for (const y of [5.9, 5.4]) wire(decor, polesS[i], 4.7, polesS[i + 1], 4.7, y);
  }
  const polesE = [-30, -18, 18, 30];
  polesE.forEach((z) => pole(decor, 4.7, z));
  for (const y of [5.9, 5.4]) { wire(decor, 4.7, -30, 4.7, -18, y); wire(decor, 4.7, 18, 4.7, 30, y); }
  vending(decor, 5.6, 6.6, Math.PI, '#2EAD6B');
  // Bus stop
  decor.cyl(0.05, 0.05, 2.2, '#9AA3AD', -6.2, 0, -4.6, { seg: 6, collide: true });
  decor.cyl(0.3, 0.3, 0.05, '#2B8CFF', -6.2, 2.3, -4.6, { rx: Math.PI / 2, seg: 14 });
  const sb = bench(decor, -8.3, -4.7, 0);

  // ---------------------------------------------------------------- backdrop
  const hills = [[-95, -60, 30, '#7FB069'], [-60, -110, 40, '#86BB6F'], [10, -125, 45, '#76A863'], [80, -95, 35, '#82B56B'], [120, -20, 38, '#7AAE65'],
    [105, 70, 34, '#86BB6F'], [40, 120, 42, '#7FB069'], [-40, 125, 40, '#76A863'], [-110, 60, 36, '#82B56B'], [-130, -10, 40, '#7AAE65']];
  for (const [x, z, r, c] of hills) decor.add(G.ico(1), c, { x, y: -r * 0.35, z, sx: r * 2.4, sy: r * 1.2, sz: r * 2.4 });
  const ring = [[-50, -12], [-50, 12], [-50, 30], [50, -12], [50, 12], [50, 30], [-30, -46], [-10, -46], [10, -46], [30, -46], [-30, 46], [-5, 46], [20, 46], [50, -32], [-50, -32], [45, 46]];
  ring.forEach(([x, z], i) => {
    const walls = ['#FFF3E0', '#EAF4FF', '#FFF0F3', '#F3FFE9', '#FFF8E1'];
    const roofs = [PAL.roofBlue, PAL.roofRed, PAL.roofTeal, PAL.roofGray];
    decor.box(7, 5.4, 7, walls[i % walls.length], x, 0, z);
    roof(decor, x, 5.4, z, 7.8, 1.7, 7.8, roofs[i % roofs.length], i % 2 ? 0 : Math.PI / 2);
  });
  for (const [x, z, s] of [[-45, -40, 1.3], [45, -40, 1.2], [-45, 40, 1.3], [44, 40, 1.1], [0, 44, 1.2], [-20, -44, 1], [25, 44, 1.1]]) tree(decor, x, z, s);

  // ---------------------------------------------------------------- merge
  const meshes = [ground, school, mall, park, resi, decor].map((b) => b.build());
  for (const m of meshes) { m.receiveShadow = shadows; m.castShadow = shadows; root.add(m); }
  meshes[0].castShadow = false;

  // Text signs and the school clock
  const signs = [
    textPlane(3.6, 0.9, { bg: '#FFFFFF', lines: [{ text: 'さくら小学校  SAKURA ELEMENTARY', size: 70, color: '#2E3440' }] }, SX, 3.45, -22.88),
    textPlane(2.6, 0.75, { bg: '#F7F1E3', lines: [{ text: 'さくら小学校', size: 96, color: '#3E2F23' }] }, -26.5, 1.25, -5.84),
    textPlane(9, 1.5, { lines: [{ text: 'NIJI MALL', size: 170, color: '#5C7CFA' }] }, 25, 5.4, -16.88),
    textPlane(6, 0.9, { bg: '#FFD43B', radius: 40, lines: [{ text: 'WELCOME!  いらっしゃいませ!', size: 92, color: '#7A3E00' }] }, 25, 3.9, -16.85),
    textPlane(5, 1.0, { bg: '#2F9E6E', radius: 30, lines: [{ text: 'Café Komorebi  ☕', size: 120, color: '#FFFFFF' }] }, CX, 3.55, 8.9, Math.PI),
    textPlane(2.8, 0.82, { bg: '#FFF6E6', lines: [{ text: 'さくら公園  SAKURA PARK', size: 78, color: '#C2185B' }] }, 8, 1.25, 5.74, Math.PI),
    textPlane(2.6, 1.3, { bg: '#FFFDF6', lines: [{ text: "Let's go!  行ってみよう!", size: 64, color: '#2B3A55', y: 0.25 }, { text: '🦕 🐬 🐧 🦌 ⛩️ 🗼', size: 96, y: 0.68 }] }, 7.65, 1.7, -7.12),
  ];
  for (const s of signs) root.add(s);
  const nameplate = textPlane(1.2, 0.5, { bg: '#5B4636', lines: [{ text: playerName ? `${playerName}` : 'Home', size: 110, color: '#FFFFFF' }] }, -23.08, 0.95, 20.9, Math.PI / 2);
  root.add(nameplate);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24), new THREE.MeshBasicMaterial({ map: clockTexture(8, 20), toneMapped: false }));
  clock.position.set(SX, 8.6, -22.82);
  root.add(clock);

  // Sky and clouds
  const sky = makeSky();
  root.add(sky);
  const clouds = new StaticBuilder();
  for (const [x, y, z, s] of [[-40, 52, -60, 1.6], [30, 58, -80, 2], [70, 50, 10, 1.5], [-70, 55, 30, 1.8], [10, 62, 70, 1.7], [-20, 60, -10, 1.2]]) cloudCluster(clouds, x, y, z, s);
  const cloudMesh = clouds.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  root.add(cloudMesh);

  const lights = makeLights(root, { shadows });

  // ---------------------------------------------------------------- collision
  const collision = new CollisionWorld({ bounds: { minX: -41.5, maxX: 41.5, minZ: -37.5, maxZ: 37.5 } });
  for (const b of [school, mall, park, resi, decor]) { collision.boxes.push(...b.boxes); collision.circles.push(...b.circles); collision.canopies.push(...(b.canopies || [])); }
  // Keep the far backdrop houses out of reach (bounds already stop the player).

  // ---------------------------------------------------------------- NPC spots
  const S = (id, x, z, yaw, o = {}) => spots.push({ id, x, z, yaw, kind: 'stand', zone: 'street', tags: [], ...o });
  // Park
  const seat = (bn, i, tags, id) => S(id, bn.seats[i].x, bn.seats[i].z, bn.seats[i].yaw, { kind: 'sit', seatY: bn.seats[i].seatY, zone: 'park', tags });
  seat(pb1, 0, ['bench', 'drawing', 'reading', 'comics', 'music', 'games', 'calm'], 'pb1a');
  seat(pb1, 1, ['bench', 'drawing', 'reading', 'comics', 'music', 'games'], 'pb1b');
  seat(pb2, 0, ['bench', 'drawing', 'reading', 'music', 'games'], 'pb2a');
  seat(pb2, 1, ['bench', 'singing', 'music'], 'pb2b');
  seat(pb3, 0, ['bench', 'reading', 'comics', 'drawing'], 'pb3a');
  seat(pb3, 1, ['bench', 'music', 'games'], 'pb3b');
  seat(pb4, 0, ['bench', 'drawing', 'singing'], 'pb4a');
  seat(pb5, 0, ['bench', 'reading', 'animals'], 'pb5a');
  S('pond1', 29.7, 20.5, Math.PI / 2, { zone: 'park', tags: ['animals', 'pond'] });
  S('pond2', 33.5, 15.4, 0, { zone: 'park', tags: ['animals', 'pond'] });
  S('tree1', 31.6, 28.6, Math.PI * 0.6, { zone: 'park', tags: ['bugs', 'tree'] });
  S('tree2', 35.2, 29.0, -Math.PI * 0.6, { zone: 'park', tags: ['bugs', 'tree'] });
  S('slide', 14.5, 31.6, -Math.PI / 2, { zone: 'park', tags: ['playground'] });
  S('swing', 17.5, 30.4, 0, { zone: 'park', tags: ['playground'] });
  S('sand', 21.8, 27.55, 0, { zone: 'park', tags: ['playground'] });
  S('dance1', 27.5, 29.6, Math.PI, { zone: 'park', tags: ['dancing', 'singing'] });
  S('dance2', 9.5, 14.6, Math.PI, { zone: 'park', tags: ['dancing', 'skateboarding'] });
  S('skate', 12.8, 7.6, Math.PI / 2, { zone: 'park', tags: ['skateboarding', 'running'] });
  S('hoop', 36.0, 30.2, Math.PI / 2, { zone: 'park', tags: ['basketball'] });
  S('kite', 26.5, 16.0, Math.PI, { zone: 'park', tags: ['open'] });
  // Field pairs (ball games): spots come in pairs a/b facing each other
  const pairs = [[18, 16.2, 18, 21.2], [26, 18.2, 26, 23.2], [20.5, 24.5, 25.5, 24.5]];
  pairs.forEach(([ax, az, bx, bz], i) => {
    const yawA = Math.atan2(bx - ax, bz - az), yawB = Math.atan2(ax - bx, az - bz);
    S(`field${i}a`, ax, az, yawA, { zone: 'park', tags: ['field', 'ball'], pair: `field${i}b` });
    S(`field${i}b`, bx, bz, yawB, { zone: 'park', tags: ['field', 'ball'], pair: `field${i}a` });
  });
  // Street
  const tseat = (tx, dx, id) => S(id, tx + dx, 6.9, dx < 0 ? Math.PI / 2 : -Math.PI / 2, { kind: 'sit', seatY: 0.45, tags: ['terrace', 'sweets', 'reading'] });
  tseat(-15.2, -0.75, 't1a'); tseat(-15.2, 0.75, 't1b'); tseat(-8.8, -0.75, 't2a'); tseat(-8.8, 0.75, 't2b');
  S('board', 7.6, -5.6, Math.PI, { tags: ['board'] });
  S('vend', 5.6, 5.7, 0, { tags: ['vending'] });
  S('mallplaza1', 20.5, -10.8, Math.PI, { tags: ['shopping'] });
  S('mallplaza2', 29.5, -11.5, Math.PI, { tags: ['shopping'] });
  seat(mb1, 0, ['bench', 'games', 'shopping'], 'mb1a');
  seat(mb2, 1, ['bench', 'games', 'shopping'], 'mb2b');
  seat(sb, 0, ['bench', 'busstop'], 'bus1');
  S('lane1', -21.5, 15, 0, { tags: ['lane', 'cycling'] });
  S('shrine', -21.5, 33.6, 0, { tags: ['shrine'] });
  S('corner1', -6, -6.5, Math.PI * 0.75, { tags: ['corner'] });
  S('corner2', 6.2, 5.4, -Math.PI * 0.25, { tags: ['corner'] });
  S('schoolgate', -18.8, -4.4, 0, { tags: ['corner'] });
  for (const s of spots) if (s.zone === 'park') s.zone = 'park';

  // Chat-group centres (2–4 people stand in a ring around these).
  const groups = [
    { id: 'pg1', x: 13.8, z: 13.6, zone: 'park', r: 0.85 },
    { id: 'pg2', x: 29.5, z: 12.6, zone: 'park', r: 0.85 },
    { id: 'pg3', x: 27.2, z: 27.4, zone: 'park', r: 0.85 },
    { id: 'pg4', x: 16.5, z: 26.8, zone: 'park', r: 0.85 },
    { id: 'sg1', x: 12.5, z: -7.4, zone: 'street', r: 0.85 },
    { id: 'sg2', x: -10, z: 4.6, zone: 'street', r: 0.8 },
    { id: 'sg3', x: -20, z: -9.5, zone: 'street', r: 0.85 },
    { id: 'sg4', x: 30, z: -8.3, zone: 'street', r: 0.85 },
  ];

  // Walk routes (sidewalks and park loop) for people strolling or jogging.
  const routes = {
    park: [[9, 10], [39, 10], [39, 33.5], [9, 33.5]],
    street: [[-30, 4.1], [-5, 4.1], [-4.1, 30], [-4.1, 6], [4.1, 5], [30, 4.1], [4.1, -4.1], [-30, -4.1]],
    loopA: [[-30, -4.2], [-5, -4.2], [-4.2, -30], [-4.2, -5]],
    loopB: [[5, -4.2], [35, -4.2], [35, -6.5], [5, -6.5]],
    lane: [[-21.5, 6], [-21.5, 32]],
  };

  const spawns = {
    friendHouseDoor: { x: -22, z: FRIEND_HOUSE_DOOR.z, yaw: Math.PI / 2 },
    schoolGate: { x: -23.4, z: -8.6, yaw: 0 },
    schoolDoor: { x: SX, z: -19.8, yaw: 0 },
    cafeDoor: { x: CX, z: 6.2, yaw: Math.PI },
    mallDoor: { x: 25, z: -13.7, yaw: 0 },
    homeDoor: { x: -22.0, z: H.door[1], yaw: Math.PI / 2 },
    park: { x: 11.5, z: 14.2, yaw: Math.PI / 4 },
    crossroads: { x: 0, z: 1, yaw: Math.PI },
  };

  const field = { x: FX, z: FZ, a: { x: FX - 1, z: FZ + 3.6 }, b: { x: FX - 1, z: FZ - 3.6 }, c: { x: FX + 3.2, z: FZ } };

  // ---------------------------------------------------------------- ambience
  const ambience = (period, weather, dayIdx) => {
    const rainy = weather === 'rainy', cloudy = weather === 'cloudy';
    let top = '#5AB0F0', hor = '#CDEBFF', bot = '#B8D7C9', fog = '#CFE6F5';
    let sunC = '#FFF3DD', sunI = 2.3, hemiS = '#EAF6FF', hemiG = '#9DBF7A', hemiI = 1.55;
    let sunPos = [30, 50, 20];
    if (period === 1) { top = '#58A6E8'; hor = '#FFE6C7'; fog = '#F3E3CF'; sunC = '#FFE0B3'; sunI = 2.25; hemiS = '#FFF1DD'; sunPos = [-45, 32, 18]; }
    if (period === 2) { top = '#2B3A67'; hor = '#F28C6B'; fog = '#C98A7A'; sunC = '#FFB07A'; sunI = 1.2; hemiS = '#C9B8E8'; hemiG = '#6B7A5A'; hemiI = 1.0; sunPos = [-60, 10, 10]; }
    if (cloudy) { top = '#9FB4C8'; hor = '#DDE5EC'; fog = '#D5DEE6'; sunI *= 0.65; hemiI *= 1.05; }
    if (rainy) { top = '#7D8C9C'; hor = '#B8C3CE'; fog = '#AEBAC6'; sunI *= 0.35; hemiI *= 1.0; hemiS = '#C8D3DE'; }
    sky.userData.setColors(top, hor, bot);
    lights.sun.color.set(sunC); lights.sun.intensity = sunI;
    lights.sun.position.set(...sunPos);
    lights.hemi.color.set(hemiS); lights.hemi.groundColor.set(hemiG); lights.hemi.intensity = hemiI;
    cloudMesh.material.color.set(rainy ? '#C9CED6' : cloudy ? '#EEF1F4' : '#FFFFFF');
    cloudMesh.visible = true;
    return { background: new THREE.Color(hor), fog: new THREE.Fog(fog, rainy ? 30 : 55, rainy ? 120 : 190) };
  };

  return {
    id: 'town', name: { en: 'Sakura Town', ja: 'さくら町' },
    root, collision, spots, groups, routes, interact, hides, spawns, field, lights, sky,
    outdoor: true,
    camera: { mode: 'follow', yaw: 0, pitch: 0.42, dist: 6.6 },
    zoneOf: (x, z) => (x > 6 && z > 6 ? 'park' : 'street'),
    nameplate,
    ambience,
    update: (dt, t) => { cloudMesh.rotation.y = t * 0.002; },
  };
}
