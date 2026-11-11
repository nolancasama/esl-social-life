// The player's bedroom: sleep, calendar, messages, journal, souvenirs, photos.

import * as THREE from 'three';
import { StaticBuilder, G } from '../builder.js';
import { CollisionWorld } from '../collision.js';
import { plankTexture } from '../textures.js';
import { floorMesh, walls, wallPlane, windowView, roomLights } from './room.js';

export function buildHome() {
  const root = new THREE.Group();
  root.name = 'home';
  const b = new StaticBuilder();
  const R = { minX: -4.5, maxX: 4.5, minZ: -3.8, maxZ: 3.8 };
  walls(b, { ...R, h: 2.9, color: '#EAF2FB', base: '#9C7A5B', doors: [{ side: 'e', from: 1.6, to: 3.0 }] });
  root.add(floorMesh(9, 7.6, plankTexture('#E2BF8F', '#D6B181'), 0, 0));
  b.flat(40, 40, '#1F2433', 0, -0.02, 0);
  // Rug
  b.add(G.cyl(24), '#FFB4A2', { x: 0.3, y: 0.01, z: 0.6, sx: 3.2, sy: 0.02, sz: 2.6 });
  b.add(G.cyl(24), '#FFDDD2', { x: 0.3, y: 0.02, z: 0.6, sx: 2.4, sy: 0.02, sz: 1.9 });

  // Bed (north-west)
  b.box(2.0, 0.35, 2.8, '#B07D4F', -3.4, 0, -2.3, { collide: true });
  b.box(1.9, 0.22, 2.7, '#FFFFFF', -3.4, 0.35, -2.3);
  b.box(1.95, 0.14, 1.9, '#5C7CFA', -3.4, 0.52, -1.85);
  b.box(1.95, 0.05, 0.3, '#91A7FF', -3.4, 0.64, -2.65);
  b.box(1.1, 0.18, 0.5, '#FFFFFF', -3.4, 0.6, -3.35);
  b.box(2.0, 0.9, 0.1, '#B07D4F', -3.4, 0, -3.72);
  // Desk (north-east) with tablet, journal and a lamp
  b.box(2.4, 0.06, 0.8, '#C99A6B', 2.6, 0.74, -3.35);
  b.box(0.08, 0.74, 0.75, '#A57A50', 1.45, 0, -3.35);
  b.box(0.7, 0.74, 0.75, '#A57A50', 3.45, 0, -3.35);
  b.collideBox(2.6, -3.35, 2.4, 0.8, 0, 0.8);
  b.box(0.42, 0.03, 0.3, '#2E3440', 3.15, 0.8, -3.3);
  b.box(0.36, 0.01, 0.24, '#8FD6F2', 3.15, 0.835, -3.3);
  b.box(0.32, 0.06, 0.42, '#E8590C', 2.0, 0.8, -3.3);
  b.box(0.3, 0.02, 0.4, '#FFFFFF', 2.0, 0.86, -3.3);
  b.cyl(0.08, 0.1, 0.04, '#3D4451', 1.65, 0.8, -3.55, { seg: 8 });
  b.cyl(0.015, 0.015, 0.4, '#3D4451', 1.65, 0.8, -3.55, { seg: 4 });
  b.cone(0.13, 0.14, '#FFD166', 1.65, 1.16, -3.55, { seg: 10 });
  // Chair
  b.box(0.46, 0.05, 0.44, '#C99A6B', 2.6, 0.45, -2.55);
  b.box(0.46, 0.5, 0.05, '#C99A6B', 2.6, 0.5, -2.33);
  // Souvenir shelf (west wall)
  for (const y of [0.0, 0.6, 1.2, 1.8]) b.box(0.42, 0.05, 2.8, '#B07D4F', -4.27, y, 1.6);
  for (const z of [0.2, 3.0]) b.box(0.42, 1.85, 0.06, '#9C6B44', -4.27, 0, z);
  b.collideBox(-4.27, 1.6, 0.45, 2.9, 0, 1.9);
  // Mirror (east wall)
  b.box(0.06, 1.45, 0.62, '#C8A2C8', 4.47, 0.35, 0.55);
  // Toy box and cushion
  b.box(0.8, 0.5, 0.6, '#F4A261', 3.6, 0, 3.2, { collide: true });
  b.box(0.82, 0.06, 0.62, '#E76F51', 3.6, 0.5, 3.2);
  b.sphere(0.4, '#9775FA', 1.7, 0.22, 2.4, { sy: 0.5, collide: true });
  // Window frame (north wall)
  b.box(2.3, 1.5, 0.08, '#FFFFFF', -0.9, 1.0, -3.76);
  const mesh = b.build();
  root.add(mesh);

  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshBasicMaterial({ map: windowView('day'), toneMapped: false }));
  pane.position.set(-0.9, 1.75, -3.7);
  root.add(pane);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.3), new THREE.MeshBasicMaterial({ color: '#DDEFF7', toneMapped: false }));
  mirror.position.set(4.43, 1.08, 0.55);
  mirror.rotation.y = -Math.PI / 2;
  root.add(mirror);

  // Dynamic decorations (calendar page, photos, souvenirs) are refreshed by the game.
  const dyn = new THREE.Group();
  root.add(dyn);
  const setCalendar = (title, sub) => {
    const old = dyn.getObjectByName('calendar');
    if (old) dyn.remove(old);
    const m = wallPlane(0.9, 1.1, { bg: '#FFFFFF', border: { color: '#FF6B6B', width: 12 }, radius: 12, lines: [
      { text: title, size: 48, color: '#FF6B6B', y: 0.2 },
      { text: sub, size: 120, color: '#2B3A55', y: 0.6 },
    ] }, -4.44, 1.55, -0.4, Math.PI / 2);
    m.name = 'calendar';
    dyn.add(m);
  };
  const photoGroup = new THREE.Group();
  root.add(photoGroup);
  const setPhotos = (urls) => {
    while (photoGroup.children.length) {
      const c = photoGroup.children.pop();
      c.material?.map?.dispose?.();
    }
    const loader = new THREE.TextureLoader();
    urls.slice(0, 8).forEach((url, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      // Memory wall above the desk, facing the room camera.
      const x = 0.95 + col * 0.84, y = 2.45 - row * 0.62;
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.56), new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false }));
      frame.position.set(x, y, -3.735);
      frame.rotation.z = (col % 2 ? 1 : -1) * 0.04;
      photoGroup.add(frame);
      const tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.42), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      pic.position.set(x, y + 0.03, -3.73);
      pic.rotation.z = frame.rotation.z;
      photoGroup.add(pic);
    });
  };
  const souvenirGroup = new THREE.Group();
  root.add(souvenirGroup);
  const SLOTS = [];
  for (const y of [0.05, 0.65, 1.25]) for (const z of [0.55, 1.2, 1.85, 2.55]) SLOTS.push({ x: -4.25, y, z });
  const setSouvenirs = (list, makeMesh) => {
    while (souvenirGroup.children.length) souvenirGroup.remove(souvenirGroup.children[0]);
    list.slice(0, SLOTS.length).forEach((s, i) => {
      const m = makeMesh(s);
      if (!m) return;
      m.position.set(SLOTS[i].x, SLOTS[i].y, SLOTS[i].z);
      souvenirGroup.add(m);
    });
  };

  const lights = roomLights(root);
  const collision = new CollisionWorld({ bounds: { minX: R.minX, maxX: R.maxX + 0.8, minZ: R.minZ, maxZ: R.maxZ } });
  collision.boxes.push(...b.boxes);
  collision.circles.push(...b.circles);

  const interact = [
    { id: 'bed', x: -2.05, z: -2.2, r: 1.15, kind: 'bed', icon: '🛏️', label: { en: 'Bed', ja: 'ベッド' } },
    { id: 'journal', x: 2.0, z: -2.4, r: 0.95, kind: 'journal', icon: '📖', label: { en: 'Friendship journal', ja: '友達ノート' } },
    { id: 'tablet', x: 3.2, z: -2.4, r: 0.95, kind: 'messages', icon: '📱', label: { en: 'Messages', ja: 'メッセージ' } },
    { id: 'calendar', x: -3.75, z: -0.4, r: 0.95, kind: 'calendar', icon: '📅', label: { en: 'Calendar', ja: 'カレンダー' } },
    { id: 'shelf', x: -3.7, z: 1.6, r: 1.1, kind: 'shelf', icon: '🧸', label: { en: 'Memories', ja: '思い出' } },
    { id: 'mirror', x: 3.85, z: 0.55, r: 0.95, kind: 'mirror', icon: '🪞', label: { en: 'Mirror', ja: 'かがみ' } },
    { id: 'homeExit', x: 4.1, z: 2.3, r: 1.0, kind: 'door', to: 'town', icon: '🚪', label: { en: 'Go outside', ja: '外に出る' } },
  ];

  const spawns = {
    door: { x: 3.7, z: 2.3, yaw: -Math.PI / 2 },
    bed: { x: -1.75, z: -1.6, yaw: Math.PI / 2 },
    center: { x: 0.3, z: 0.4, yaw: Math.PI },
  };

  const ambience = (period, weather) => {
    const kind = period === 2 ? 'night' : weather === 'rainy' ? 'rain' : 'day';
    pane.material.map = windowView(kind);
    pane.material.needsUpdate = true;
    const night = period === 2;
    lights.sun.intensity = night ? 0.15 : weather === 'rainy' ? 0.6 : 1.5;
    lights.hemi.intensity = night ? 0.9 : 1.8;
    lights.hemi.color.set(night ? '#C9C4F0' : '#FFF8EE');
    lights.fill.intensity = night ? 9 : 0.5;
    lights.fill.color.set('#FFD39A');
    return { background: new THREE.Color(night ? '#141826' : '#1F2433'), fog: null };
  };

  return {
    id: 'home', name: { en: 'My Room', ja: '自分の部屋' },
    root, collision, spots: [], groups: [], interact, spawns, lights,
    camera: { mode: 'room', yaw: 0, pitch: 0.86, dist: 8.8, center: { x: 0, z: 0.2 }, follow: 0.45, bounds: { minX: -4.0, maxX: 4.0, minZ: -3.2, maxZ: 7.5 } },
    setCalendar, setPhotos, setSouvenirs,
    ambience,
    update: () => {},
  };
}
