// One bright cutaway room, personalised from the friend's existing facts.
// Furniture, interest props and every pet share a single static mesh.
import * as THREE from 'three';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { plankTexture } from '../textures.js';
import { floorMesh, walls, windowView, roomLights } from './room.js';
import { houseFor } from '../../world/friendhouse.js';

function petModel(b, type, x, z, i, y = 0) {
  const cream = i % 2 ? '#D9A16C' : '#F5D7B0';
  const eye = (dx, dy, dz) => b.sphere(0.025, '#344351', x + dx, y + dy, z + dz, { w: 6, h: 4 });
  if (type === 'fish') {
    b.sphere(0.14, i % 2 ? '#EFAB53' : '#F18B75', x, y + 0.22, z, { sx: 1.35, sy: 0.7, sz: 0.45 });
    b.cone(0.12, 0.18, '#F3BE60', x - 0.24, y + 0.13, z, { rz: -Math.PI / 2, seg: 3 });
    eye(0.11, 0.25, 0.06);
  } else if (type === 'bird') {
    b.sphere(0.19, i % 2 ? '#90BFD4' : '#F1D66B', x, y + 0.3, z, { sy: 1.2 });
    b.sphere(0.12, '#AACF90', x + 0.15, y + 0.27, z, { sx: 0.25, sy: 0.75 });
    b.cone(0.065, 0.14, '#E8A45B', x, y + 0.35, z + 0.18, { rx: Math.PI / 2, seg: 5 });
    for (const dx of [-0.065, 0.065]) b.box(0.04, 0.13, 0.1, '#D6A15F', x + dx, y, z);
    eye(-0.075, 0.4, 0.15); eye(0.075, 0.4, 0.15);
  } else if (type === 'turtle') {
    b.sphere(0.3, '#84AC75', x, y + 0.17, z, { sy: 0.55, sz: 1.15 });
    b.sphere(0.13, '#ADD092', x, y + 0.16, z + 0.34);
    for (const dx of [-0.26, 0.26]) for (const dz of [-0.19, 0.19]) b.sphere(0.075, '#ADD092', x + dx, y + 0.06, z + dz, { sy: 0.5 });
    b.sphere(0.16, '#6B9562', x, y + 0.29, z, { sy: 0.2 });
    eye(-0.055, 0.2, 0.44); eye(0.055, 0.2, 0.44);
  } else {
    const small = type === 'hamster';
    const r = small ? 0.2 : 0.29;
    b.sphere(r, cream, x, y + r, z, { sy: small ? 0.8 : 1.05, sz: 1.2 });
    b.sphere(r * 0.7, cream, x, y + r * 1.65, z + r * 0.8);
    for (const dx of [-r * 0.47, r * 0.47]) {
      if (type === 'cat') {
        // Tall pointed ears with a pink inner ear: the clearest "cat" cue from the dollhouse camera.
        b.cone(0.11, 0.27, cream, x + dx * 1.05, y + r * 2.05, z + r * 0.75, { seg: 4, rz: -Math.sign(dx) * 0.18 });
        b.cone(0.055, 0.17, '#E5ADAC', x + dx * 1.05, y + r * 2.1, z + r * 0.8, { seg: 4, rz: -Math.sign(dx) * 0.18 });
        // Whiskers either side of the nose.
        for (const k of [-1, 1]) b.box(0.2, 0.012, 0.012, '#6B5A55', x + dx * 0.95, y + r * 1.48 + k * 0.03, z + r * 1.42, { rz: Math.sign(dx) * k * 0.15 });
      }
      else if (type === 'rabbit') {
        b.sphere(0.1, cream, x + dx, y + 0.8, z + 0.2, { sy: 2.2, sz: 0.6 });
        b.sphere(0.055, '#E5ADAC', x + dx, y + 0.81, z + 0.255, { sy: 2.5, sz: 0.25 });
      } else b.sphere(small ? 0.075 : 0.11, cream, x + dx, y + r * 2, z + r * 0.65, { sy: small ? 1 : 1.55 });
      b.sphere(r * 0.3, '#FFF2DB', x + dx, y + 0.08, z + r * 0.6, { sy: 0.6 });
      eye(dx * 0.6, r * 1.85, r * 1.42);
    }
    b.sphere(0.045, '#805E58', x, y + r * 1.5, z + r * 1.5);
    if (type === 'cat') {
      // A thin tail held upright (not a curled torus, which read as a shiba's tail).
      b.cyl(0.035, 0.05, 0.5, cream, x, y + r * 0.9, z - r * 1.05, { seg: 6, rx: -0.35 });
      b.sphere(0.05, cream, x, y + r * 0.9 + 0.485, z - r * 1.05 - 0.09);
    }
    else b.sphere(small ? 0.05 : 0.13, cream, x, y + r, z - r * 1.2);
  }
}

function interestProps(b, props) {
  // Small displays on the long shelf: only things supported by generated data.
  props.forEach((id, i) => {
    const x = -0.85 + (i % 5) * 0.82, y = 1.2 + Math.floor(i / 5) * 0.62, z = -3.36;
    if (id === 'books' || id === 'study') {
      for (let k = 0; k < 3; k++) {
        b.box(0.12, 0.31 + k * 0.04, 0.25, ['#E9959E', '#82B8AF', '#E5BD68'][k], x - 0.17 + k * 0.14, y, z);
        b.box(0.025, 0.23, 0.26, '#FFF8E9', x - 0.17 + k * 0.14, y + 0.04, z);
      }
    } else if (id === 'music') {
      b.box(0.63, 0.22, 0.24, '#48526B', x, y, z);
      for (let k = 0; k < 7; k++) b.box(0.075, 0.025, 0.13, k % 3 ? '#FFFAEB' : '#374258', x - 0.25 + k * 0.083, y + 0.22, z + 0.06);
    } else if (id === 'drawing') {
      b.box(0.45, 0.025, 0.32, '#FFFAEB', x, y, z);
      for (let k = 0; k < 4; k++) b.cyl(0.02, 0.02, 0.32, ['#E98E99', '#6EA9CE', '#E8C05E', '#86B578'][k], x - 0.14 + k * 0.09, y + 0.025, z, { rz: 0.2, seg: 5 });
    } else if (id === 'sport') {
      b.sphere(0.21, '#E9A05D', x, y + 0.21, z);
      b.add(G.torus(0.21, 0.012, 4, 12), '#FFF1D7', { x, y: y + 0.21, z });
    } else if (id === 'games') {
      b.box(0.51, 0.14, 0.24, '#8999C5', x, y, z);
      for (const dx of [-0.15, 0.15]) b.sphere(0.05, '#F5D074', x + dx, y + 0.15, z + 0.03, { sy: 0.35 });
    } else if (id === 'cooking') {
      b.cyl(0.24, 0.24, 0.035, '#FFFAEB', x, y, z, { seg: 12 });
      for (const dx of [-0.1, 0.1]) b.cyl(0.07, 0.07, 0.05, '#D9A36A', x + dx, y + 0.035, z, { seg: 8 });
    } else if (id === 'nature') {
      b.cyl(0.13, 0.1, 0.17, '#DCA687', x, y, z, { seg: 8 });
      b.sphere(0.2, '#92BC83', x, y + 0.34, z, { sy: 0.9 });
    } else if (id === 'cleaning') {
      b.box(0.28, 0.23, 0.23, '#81BBB9', x, y, z);
      b.box(0.29, 0.04, 0.25, '#FFF5DE', x, y + 0.23, z);
    }
  });
}

export function buildFriendHouse({ seed = 'viewer', npc = {} } = {}) {
  const house = houseFor(seed, npc);
  const root = new THREE.Group();
  root.name = 'friendhouse';
  const b = new StaticBuilder();
  const R = { minX: -4.5, maxX: 4.5, minZ: -3.8, maxZ: 3.8 };
  walls(b, { ...R, h: 2.9, color: house.wallColor, base: '#AA8B70', doors: [{ side: 'e', from: 1.6, to: 3.0 }] });
  b.flat(40, 40, '#263B46', 0, -0.03, 0);
  const floor = floorMesh(9, 7.6, plankTexture('#E8CBA2', '#DCBE94'));
  root.add(floor);
  b.flat(4.8, 3.9, '#BBDCD1', 0, 0.01, 0.55);
  b.flat(4.45, 3.55, '#DAECE1', 0, 0.012, 0.55);
  // Bed and reading cushion on the west, low furniture leaves a clear entry.
  b.box(1.65, 0.32, 2.5, '#B18D6A', -3.4, 0, -2.3, { collide: true });
  b.box(1.62, 0.2, 2.4, '#FFF9EA', -3.4, 0.32, -2.3);
  b.box(1.64, 0.12, 1.65, '#8CBEB9', -3.4, 0.52, -1.95);
  b.box(1.05, 0.17, 0.48, '#FFFAED', -3.4, 0.52, -3.18);
  b.box(1.7, 0.82, 0.12, '#B18D6A', -3.4, 0, -3.62);
  b.sphere(0.44, '#E7A6B0', -3.45, 0.19, -0.25, { sy: 0.4 });
  // Desk, art paper and shelf of existing interests/home activities.
  b.box(2.2, 0.07, 0.75, '#C49D74', 2.8, 0.73, -3.3);
  for (const x of [1.8, 3.8]) b.box(0.09, 0.73, 0.65, '#AA8664', x, 0, -3.3);
  b.collideBox(2.8, -3.3, 2.2, 0.75, 0, 0.8);
  b.box(0.55, 0.015, 0.39, '#FFF9E9', 2.8, 0.8, -3.18);
  for (const y of [1.13, 1.75]) b.box(4.15, 0.07, 0.4, '#B48F6E', 0.8, y, -3.38);
  interestProps(b, house.props);
  // TV coordinates intentionally match the existing reusable racing game.
  b.box(1.05, 0.36, 0.44, '#B48F6E', 0.8, 0, -3.5, { collide: true });
  b.box(0.88, 0.54, 0.07, '#39485C', 0.8, 0.36, -3.55);
  for (const x of [0.55, 1.05]) b.box(0.26, 0.05, 0.16, '#FFF8EB', x, 0.36, -3.35);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.44), new THREE.MeshBasicMaterial({ color: '#1C2541', toneMapped: false }));
  tvScreen.position.set(0.8, 0.63, -3.51);
  root.add(tvScreen);
  const tv = { x: 0.8, z: -3.5, seats: [{ x: 0.4, z: -2.05, yaw: Math.PI }, { x: 1.25, z: -2.05, yaw: Math.PI }], setColor: (hex) => tvScreen.material.color.set(hex || '#1C2541') };
  // Window and a small photo album, with no invented family or people.
  b.box(1.35, 1.4, 0.08, '#FFFBEE', -1.55, 1.1, -3.76);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.25), new THREE.MeshBasicMaterial({ map: windowView(), toneMapped: false }));
  pane.position.set(-1.55, 1.8, -3.7);
  root.add(pane);
  b.cyl(0.73, 0.73, 0.07, '#F1C89B', 1.35, 0.45, 0.65, { seg: 16 });
  b.cyl(0.09, 0.14, 0.45, '#B48F6E', 1.35, 0, 0.65, { seg: 8 });
  b.collideCircle(1.35, 0.65, 0.73, 0.52);
  b.box(0.48, 0.04, 0.34, '#8CAED1', 1.35, 0.52, 0.65);
  b.box(0.43, 0.015, 0.29, '#FFF9EA', 1.35, 0.56, 0.65);
  b.box(1.8, 1.05, 0.06, '#FFF9EA', 2.75, 1.8, -3.73);
  const albumPhoto = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.9), new THREE.MeshBasicMaterial({ color: '#E2EDE2', toneMapped: false }));
  albumPhoto.position.set(2.75, 2.325, -3.68);
  root.add(albumPhoto);
  let disposed = false;
  const setPhoto = (url) => {
    if (!url || disposed) return;
    new THREE.TextureLoader().load(url, (texture) => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      albumPhoto.material.map?.dispose();
      albumPhoto.material.map = texture;
      albumPhoto.material.color.set('#FFFFFF');
      albumPhoto.material.needsUpdate = true;
    });
  };
  for (const x of [0.9, 1.8]) {
    b.cyl(0.075, 0.06, 0.17, '#E9B55F', x, 0.52, 0.45, { seg: 8 });
    b.cyl(0.065, 0.065, 0.01, '#F2CC6E', x, 0.69, 0.45, { seg: 8 });
  }
  const activitySeats = [{ x: 0.25, z: 0.65, yaw: Math.PI / 2, seatY: 0.12 }, { x: 2.45, z: 0.65, yaw: -Math.PI / 2, seatY: 0.12 }];
  for (const [i, s] of activitySeats.entries()) b.cyl(0.32, 0.34, 0.12, i ? '#E6ADB2' : '#8EB8D0', s.x, 0, s.z, { seg: 12 });
  const petSpot = { x: -2.85, z: 1.7, yaw: -Math.PI / 2 };
  if (house.pet) {
    const { type, count } = house.pet;
    const aquatic = type === 'fish';
    const raised = aquatic || type === 'bird' || type === 'hamster';
    b.flat(1.9, 1.5, '#F2D6A4', -3.25, 0.015, 1.6);
    if (raised) b.box(1.9, 0.58, 0.9, '#B48F6E', -3.25, 0, 1.6, { collide: true });
    if (aquatic) {
      b.box(1.9, 0.09, 0.9, '#88B8BC', -3.25, 0.58, 1.6);
      b.box(1.9, 0.65, 0.04, '#C2E7E6', -3.25, 0.67, 1.17);
      for (const x of [-4.18, -2.32]) b.box(0.05, 0.7, 0.9, '#A3CDD0', x, 0.62, 1.6);
      b.box(1.9, 0.05, 0.05, '#88B8BC', -3.25, 1.32, 2.03);
      for (const x of [-3.95, -2.6]) {
        b.cyl(0.025, 0.025, 0.35, '#83B77E', x, 0.67, 1.24, { seg: 5 });
        b.sphere(0.13, '#9BC58E', x, 0.93, 1.24, { sx: 0.5, sy: 1.2 });
      }
    }
    for (let i = 0; i < count; i++) {
      const cols = aquatic ? 3 : count > 1 ? 2 : 1;
      const x = -3.25 + (i % cols - (Math.min(cols, count) - 1) / 2) * (aquatic ? 0.53 : 0.85);
      const z = 1.55 + Math.floor(i / cols) * (aquatic ? 0.35 : 0.8);
      petModel(b, type, x, z, i, raised ? 0.67 : 0);
    }
    if (!raised) b.collideBox(-3.25, 1.6, 1.7, 1.3, 0, 0.65);
  }
  // Closed door fills the opening, like the other interior scenes.
  b.box(0.13, 2.35, 1.4, '#C09A73', 4.55, 0, 2.3);
  b.box(0.04, 0.95, 0.9, '#D6E8E2', 4.47, 1.1, 2.3);
  b.sphere(0.065, '#EAC56C', 4.44, 0.95, 1.88);
  b.flat(0.9, 1.5, '#8FBDB2', 3.95, 0.015, 2.3);
  const furniture = b.build();
  root.add(furniture);
  const lights = roomLights(root);
  const collision = new CollisionWorld({ bounds: { ...R, maxX: 5.2 } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);
  return {
    id: 'friendhouse', name: { en: "Friend's Home", ja: '友だちの家' }, root, collision, lights, house, tv, petSpot, activitySeats,
    activitySpot: { x: 0.1, z: 0.5, yaw: Math.PI }, photoSpot: { x: 2.75, y: 2.325, z: -3.68 }, setPhoto,
    spots: [{ id: 'host', x: 2.65, z: 1.8, yaw: Math.PI / 2, kind: 'stand', zone: 'room', tags: [] }], groups: [],
    spawns: { door: { x: 3.7, z: 2.3, yaw: -Math.PI / 2 }, center: { x: 0, z: 0.5, yaw: Math.PI } },
    interact: [{ id: 'friendhouseExit', x: 4.05, z: 2.3, r: 1, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Go outside', ja: '外に出る' } }],
    camera: { mode: 'room', yaw: 0, pitch: 0.86, dist: 8.8, center: { x: 0, z: 0.2 }, follow: 0.45, bounds: { minX: -4, maxX: 4, minZ: -3.2, maxZ: 7.5 } },
    ambience: (period, weather) => {
      pane.material.map.dispose();
      pane.material.map = windowView(period === 2 ? 'night' : weather === 'rainy' ? 'rain' : 'day');
      lights.sun.intensity = period === 2 ? 0.2 : 1.5;
      lights.hemi.intensity = period === 2 ? 1.2 : 2;
      lights.fill.intensity = period === 2 ? 8 : 0.5;
      return { background: new THREE.Color('#263B46'), fog: null };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      furniture.geometry.dispose();
      for (const mesh of [floor, tvScreen, pane, albumPhoto]) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
    },
    update: () => {},
  };
}
