// Dev-only scene viewer: /?view=town|classroom|cafe|home[&cam=x,y,z,lx,ly,lz]
// Renders a scene with a few sample characters so visuals can be checked in
// isolation (used by scripts/shots.mjs).

import * as THREE from 'three';
import { Renderer } from '../engine/renderer.js';
import { Character } from '../engine/character.js';
import { buildTown } from '../engine/scenes/town.js';
import { buildClassroom } from '../engine/scenes/classroom.js';
import { buildCafe } from '../engine/scenes/cafe.js';
import { buildHome } from '../engine/scenes/home.js';
import { buildClass } from '../world/generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';

export function runViewer(which, params) {
  const stage = document.getElementById('stage');
  const r = new Renderer(stage);
  const builders = { town: buildTown, classroom: buildClassroom, cafe: buildCafe, home: buildHome };
  const scene = (builders[which] || buildTown)({ playerName: 'Ken' });
  const period = Number(params.get('period') || 0);
  const weather = params.get('weather') || 'sunny';
  r.setWorld(scene.root, scene.ambience(period, weather, 0));
  const npcs = buildClass(DEFAULT_ROSTER, 'viewer');
  const chars = [];
  const spots = scene.spots.slice(0, 12);
  npcs.slice(0, spots.length).forEach((n, i) => {
    const c = new Character(n.look, { id: n.id });
    const s = spots[i];
    c.setPosition(s.x, s.z);
    c.setYaw(s.yaw);
    if (s.kind === 'sit') c.setBase('sit', { height: s.seatY });
    c.showBag(which === 'classroom');
    scene.root.add(c.root);
    chars.push(c);
  });
  if (params.get('solo')) {
    const n = npcs[Number(params.get('solo'))] || npcs[0];
    const c = new Character(n.look, { id: n.id });
    c.setPosition(0, 0);
    c.setYaw(Number(params.get('yaw') || 0));
    scene.root.add(c.root);
    chars.push(c);
  }
  if (which === 'lineup' || params.get('lineup')) {
    npcs.forEach((n, i) => {
      const c = new Character(n.look, { id: n.id });
      c.setPosition(-6 + i * 1.1, 0);
      c.setExpression(['neutral', 'happy', 'talk', 'surprised', 'worried'][i % 5]);
      scene.root.add(c.root);
      chars.push(c);
    });
  }
  const cam = (params.get('cam') || '').split(',').map(Number);
  if (cam.length === 6 && cam.every((v) => !Number.isNaN(v))) {
    r.camera.position.set(cam[0], cam[1], cam[2]);
    r.camera.lookAt(cam[3], cam[4], cam[5]);
  } else if (scene.camera.mode === 'room') {
    const c = scene.camera;
    const look = new THREE.Vector3(c.center.x, 0.85, c.center.z);
    r.camera.position.set(look.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, look.y + Math.sin(c.pitch) * c.dist, look.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    r.camera.lookAt(look);
  } else {
    r.camera.position.set(0, 30, 55);
    r.camera.lookAt(0, 0, 0);
  }
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const c of chars) c.update(dt);
    r.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__chars = chars;
  window.__viewerReady = true;
}
