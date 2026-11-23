// Procedural chibi characters with lightweight procedural animation.
// Each limb is one merged, vertex-coloured mesh (≈8 draw calls per person).
// The character faces +Z at yaw 0.

import * as THREE from 'three';
import { StaticBuilder, G } from './builder.js';
import { vertexMaterial, makeBlobShadow } from './materials.js';
import { faceMaterial } from './textures.js';
import { damp, angleDelta } from '../core/util.js';

const HEAD_R = 0.29;
const UP = new THREE.Vector3(0, 1, 0);

const FACE_GEO = new THREE.SphereGeometry(HEAD_R + 0.006, 22, 14, Math.PI / 2 - 0.85, 1.7, 1.0, 1.25);

/** Point on the head sphere. theta from top, a = angle from front toward +X. */
function onHead(theta, a, r = HEAD_R, cy = 0.24) {
  return new THREE.Vector3(r * Math.sin(a) * Math.sin(theta), cy + r * Math.cos(theta), r * Math.cos(a) * Math.sin(theta));
}

function quatAlong(dir) {
  return new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
}

function sphereCap(b, color, r, thetaLen, phiStart = 0, phiLen = Math.PI * 2, cy = 0.24) {
  const geo = new THREE.SphereGeometry(r, 20, 12, phiStart, phiLen, 0, thetaLen);
  b.add(geo, color, { y: cy });
  geo.dispose();
}

function buildHair(b, look) {
  const c = look.hairColor;
  const style = look.hairStyle;
  const capR = style === 'bob' ? 0.322 : style === 'buzz' ? 0.3 : 0.312;
  const hasCap = look.accessory === 'cap';
  // Top cap and back of the head.
  if (!hasCap) sphereCap(b, c, capR, style === 'buzz' ? 1.25 : 1.12);
  const backLen = style === 'bob' ? 2.25 : style === 'long' ? 2.15 : style === 'buzz' ? 1.85 : 1.98;
  sphereCap(b, c, capR - 0.004, backLen, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9);

  const bang = (a, theta, sx = 1.25, sy = 0.85, sz = 0.6, r = 0.09) => {
    const p = onHead(theta, a, capR * 0.97);
    const q = quatAlong(p.clone().sub(new THREE.Vector3(0, 0.24, 0)));
    b.add(G.sphere(10, 8), c, { x: p.x, y: p.y, z: p.z, q, sx: 2 * r * sx, sy: 2 * r * sz, sz: 2 * r * sy });
  };

  if (style === 'short' || style === 'ponytail' || style === 'bun' || style === 'long' || style === 'twintails') {
    for (const a of [-0.5, -0.17, 0.17, 0.5]) bang(a, 1.18);
  }
  if (style === 'bob') {
    for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) bang(a, 1.2, 1.2, 0.9, 0.55, 0.085);
    for (const s of [-1, 1]) {
      const p = onHead(1.78, s * 1.25, 0.3);
      b.add(G.sphere(10, 8), c, { x: p.x, y: p.y - 0.02, z: p.z - 0.02, sx: 0.15, sy: 0.38, sz: 0.24 });
    }
  }
  if (style === 'spiky' && !hasCap) {
    const spikes = [[0.25, 0], [0.55, 0.9], [0.55, -0.9], [0.7, 2.2], [0.7, -2.2], [0.65, Math.PI], [0.95, 0.4], [0.95, -0.4], [0.9, 1.6], [0.9, -1.6]];
    for (const [th, a] of spikes) {
      const p = onHead(th, a, capR * 0.92);
      const dir = p.clone().sub(new THREE.Vector3(0, 0.24, 0));
      dir.y += 0.25;
      b.add(G.cone(8), c, { x: p.x, y: p.y, z: p.z, q: quatAlong(dir), sx: 0.14, sy: 0.2, sz: 0.14 });
    }
    for (const a of [-0.4, 0, 0.4]) bang(a, 1.18, 1.1, 0.8, 0.5, 0.08);
  }
  if (style === 'messy' && !hasCap) {
    for (const [th, a] of [[0.2, 0], [0.6, 1.2], [0.6, -1.2], [0.7, 2.6], [0.7, -2.6], [0.45, Math.PI]]) {
      const p = onHead(th, a, capR * 1.0);
      b.add(G.sphere(10, 8), c, { x: p.x, y: p.y, z: p.z, sx: 0.17, sy: 0.13, sz: 0.17 });
    }
    for (const a of [-0.55, -0.15, 0.25, 0.6]) bang(a, 1.2, 1.1, 0.9, 0.6, 0.085);
  }
  if (style === 'side') {
    const p = onHead(1.12, -0.25, capR * 0.98);
    b.add(G.sphere(12, 8), c, { x: p.x, y: p.y, z: p.z, rz: 0.45, ry: -0.2, sx: 0.42, sy: 0.15, sz: 0.16 });
    bang(0.45, 1.16, 1, 0.8, 0.5, 0.08);
  }
  if (style === 'curly') {
    for (let i = 0; i < 16; i++) {
      if (hasCap && (i % 4) < 3 && (i * 2.4) % (Math.PI * 2) > -1) continue;
      const th = 0.25 + (i % 4) * 0.3;
      const a = (i * 2.4) % (Math.PI * 2);
      const p = onHead(th, a, capR * 1.0);
      b.add(G.sphere(8, 6), c, { x: p.x, y: p.y, z: p.z, sx: 0.17, sy: 0.17, sz: 0.17 });
    }
    for (const a of [-0.45, 0, 0.45]) bang(a, 1.15, 1.0, 1.0, 0.8, 0.085);
  }
  if (style === 'long') {
    b.add(G.box(), c, { x: 0, y: 0.06, z: -0.2, sx: 0.46, sy: 0.46, sz: 0.12 });
    b.add(G.sphere(12, 8), c, { x: 0, y: -0.16, z: -0.2, sx: 0.46, sy: 0.12, sz: 0.12 });
    for (const s of [-1, 1]) b.add(G.box(), c, { x: s * 0.24, y: 0.05, z: 0.02, sx: 0.06, sy: 0.4, sz: 0.12 });
  }
  if (style === 'ponytail') {
    const tie = onHead(1.2, Math.PI, 0.31);
    b.add(G.sphere(8, 6), look.accColor, { x: tie.x, y: tie.y, z: tie.z - 0.02, sx: 0.1, sy: 0.1, sz: 0.1 });
    b.add(G.sphere(10, 8), c, { x: 0, y: tie.y - 0.17, z: tie.z - 0.08, rx: 0.35, sx: 0.15, sy: 0.38, sz: 0.15 });
  }
  if (style === 'twintails') {
    for (const s of [-1, 1]) {
      const tie = onHead(1.05, s * 1.75, 0.31);
      b.add(G.sphere(8, 6), look.accColor, { x: tie.x, y: tie.y, z: tie.z, sx: 0.09, sy: 0.09, sz: 0.09 });
      b.add(G.sphere(10, 8), c, { x: tie.x + s * 0.07, y: tie.y - 0.16, z: tie.z - 0.02, rz: s * 0.35, sx: 0.14, sy: 0.36, sz: 0.14 });
    }
  }
  if (style === 'bun' && !hasCap) {
    const p = onHead(0.55, Math.PI, 0.3);
    b.add(G.sphere(12, 9), c, { x: p.x, y: p.y + 0.05, z: p.z - 0.02, sx: 0.24, sy: 0.22, sz: 0.24 });
  }
  if (hasCap) {
    sphereCap(b, look.accColor, 0.33, 1.25);
    const brim = onHead(1.25, 0, 0.33);
    b.add(G.cyl(14), look.accColor, { x: 0, y: brim.y - 0.005, z: brim.z + 0.06, sx: 0.5, sy: 0.03, sz: 0.3, shade: 0.9 });
    b.add(G.sphere(6, 4), look.accColor, { x: 0, y: 0.24 + 0.33, z: 0, sx: 0.06, sy: 0.04, sz: 0.06, shade: 0.85 });
  }
}

function buildAccessory(b, look) {
  const a = look.accessory;
  if (a === 'glasses') {
    const frame = '#2E3440';
    for (const s of [-1, 1]) {
      const p = onHead(1.58, s * 0.42, HEAD_R + 0.025);
      const geo = new THREE.TorusGeometry(0.058, 0.011, 6, 18);
      b.add(geo, frame, { x: p.x, y: p.y, z: p.z, ry: s * 0.4 });
      geo.dispose();
    }
    const m = onHead(1.56, 0, HEAD_R + 0.03);
    b.add(G.box(), frame, { x: m.x, y: m.y, z: m.z, sx: 0.07, sy: 0.015, sz: 0.015 });
  } else if (a === 'headband') {
    const geo = new THREE.TorusGeometry(0.318, 0.028, 6, 24, Math.PI);
    b.add(geo, look.accColor, { y: 0.24, rx: -0.35 });
    geo.dispose();
  } else if (a === 'hairclip') {
    const p = onHead(1.0, 0.75, 0.318);
    b.add(G.box(), look.accColor, { x: p.x, y: p.y, z: p.z, rz: 0.6, ry: 0.7, sx: 0.1, sy: 0.04, sz: 0.04 });
    b.add(G.sphere(8, 6), '#FFFFFF', { x: p.x, y: p.y, z: p.z + 0.01, sx: 0.045, sy: 0.045, sz: 0.045 });
  }
}

function buildHead(look, P) {
  const b = new StaticBuilder();
  b.add(G.sphere(20, 16), look.skin, { y: 0.24, sx: HEAD_R * 2, sy: HEAD_R * 2 * 0.97, sz: HEAD_R * 2 * 0.96 });
  for (const s of [-1, 1]) b.add(G.sphere(8, 6), look.skin, { x: s * 0.285, y: 0.22, z: 0, sx: 0.08, sy: 0.11, sz: 0.07, shade: 0.97 });
  b.add(G.cyl(10), look.skin, { y: -0.02, sx: 0.12, sy: 0.12, sz: 0.12 });
  buildHair(b, look);
  buildAccessory(b, look);
  const mesh = new THREE.Mesh(b.buildGeometry(), vertexMaterial());
  mesh.scale.setScalar(P.head);
  return mesh;
}

function buildTorso(look, P) {
  const b = new StaticBuilder();
  const top = look.topColor;
  const t = P.torso;
  const cap = new THREE.CapsuleGeometry(0.19, 0.1, 6, 14);
  b.add(cap, top, { y: 0.2 * t, sx: 1, sy: t, sz: 0.85 });
  cap.dispose();
  const bottom = look.bottomColor;
  if (look.bottom === 'skirt') {
    b.cyl(0.17, 0.28, 0.22, bottom, 0, -0.1, 0, { seg: 14 });
  } else {
    b.add(G.sphere(14, 8), bottom, { y: 0.02, sx: 0.4, sy: 0.22, sz: 0.34 });
  }
  if (look.top === 'hoodie') {
    const hood = new THREE.TorusGeometry(0.13, 0.055, 6, 14);
    b.add(hood, top, { y: 0.4 * t, z: -0.1, rx: 1.2, shade: 0.9 });
    hood.dispose();
    b.add(G.box(), top, { y: 0.12 * t, z: 0.158, sx: 0.22, sy: 0.08, sz: 0.03, shade: 0.88 });
    for (const s of [-1, 1]) b.add(G.cyl(6), '#FFFFFF', { x: s * 0.04, y: 0.3 * t, z: 0.16, sx: 0.012, sy: 0.08, sz: 0.012 });
  } else if (look.top === 'jacket') {
    b.add(G.box(), '#FFFFFF', { y: 0.2 * t, z: 0.158, sx: 0.1, sy: 0.32 * t, sz: 0.03 });
    b.add(G.box(), top, { y: 0.2 * t, z: 0.16, sx: 0.02, sy: 0.32 * t, sz: 0.035, shade: 0.75 });
  } else if (look.top === 'collar') {
    for (const s of [-1, 1]) b.add(G.box(), '#FFFFFF', { x: s * 0.06, y: 0.4 * t, z: 0.12, rz: s * 0.5, rx: -0.4, sx: 0.1, sy: 0.04, sz: 0.06 });
  } else {
    b.add(G.sphere(10, 8), look.accColor, { y: 0.24 * t, z: 0.158, sx: 0.12, sy: 0.12, sz: 0.03 });
  }
  return new THREE.Mesh(b.buildGeometry(), vertexMaterial());
}

function buildBag(look, P) {
  const b = new StaticBuilder();
  const c = look.bag;
  const t = P.torso;
  b.add(G.box(), c, { y: 0.24 * t, z: -0.25, sx: 0.32, sy: 0.36, sz: 0.15 });
  b.add(G.box(), c, { y: 0.31 * t, z: -0.33, sx: 0.33, sy: 0.24, sz: 0.02, shade: 0.85 });
  b.add(G.box(), '#F8E27A', { y: 0.22 * t, z: -0.345, sx: 0.06, sy: 0.04, sz: 0.01 });
  for (const s of [-1, 1]) b.add(G.box(), c, { x: s * 0.12, y: 0.3 * t, z: 0.0, sx: 0.04, sy: 0.04, sz: 0.4, shade: 0.8 });
  return new THREE.Mesh(b.buildGeometry(), vertexMaterial());
}

function buildArm(look, P, side) {
  const b = new StaticBuilder();
  const len = 0.3 * P.arm;
  const long = look.top === 'hoodie' || look.top === 'jacket';
  const armColor = long ? look.topColor : look.skin;
  const cap = new THREE.CapsuleGeometry(0.058, len - 0.116, 4, 8);
  b.add(cap, armColor, { y: -len / 2 });
  cap.dispose();
  if (!long) {
    const sl = new THREE.CapsuleGeometry(0.072, 0.05, 4, 8);
    b.add(sl, look.topColor, { y: -0.06 });
    sl.dispose();
  }
  b.add(G.sphere(10, 8), look.skin, { y: -len - 0.01, sx: 0.13, sy: 0.13, sz: 0.13 });
  return new THREE.Mesh(b.buildGeometry(), vertexMaterial());
}

function buildLeg(look, P) {
  const b = new StaticBuilder();
  const len = 0.36 * P.leg;
  const legColor = look.bottom === 'pants' ? look.bottomColor : look.skin;
  const cap = new THREE.CapsuleGeometry(0.072, len - 0.144, 4, 8);
  b.add(cap, legColor, { y: -len / 2 });
  cap.dispose();
  if (look.bottom === 'shorts') {
    const sh = new THREE.CapsuleGeometry(0.088, 0.05, 4, 8);
    b.add(sh, look.bottomColor, { y: -0.07 });
    sh.dispose();
  }
  if (look.bottom === 'skirt') {
    const so = new THREE.CapsuleGeometry(0.076, 0.06, 4, 8);
    b.add(so, '#FFFFFF', { y: -len + 0.06 });
    so.dispose();
  }
  b.add(G.sphere(10, 8), look.shoes, { y: -len - 0.01, z: 0.035, sx: 0.17, sy: 0.12, sz: 0.25 });
  return new THREE.Mesh(b.buildGeometry(), vertexMaterial());
}

// ---------------------------------------------------------------------------

const PROPS = {};
function propMesh(kind) {
  const b = new StaticBuilder();
  if (kind === 'ball') { b.sphere(0.11, '#FFFFFF', 0, 0, 0); b.sphere(0.04, '#2E3440', 0, 0.085, 0.06); b.sphere(0.04, '#2E3440', 0.08, -0.03, 0.06); }
  else if (kind === 'baseball') { b.sphere(0.07, '#FFFFFF', 0, 0, 0); }
  else if (kind === 'book') { b.box(0.2, 0.26, 0.04, '#E8590C', 0, -0.13, 0.05); b.box(0.18, 0.24, 0.045, '#FFFFFF', 0.012, -0.12, 0.05); }
  else if (kind === 'sketch') { b.box(0.28, 0.2, 0.02, '#FFFFFF', 0, -0.1, 0.06); b.box(0.28, 0.2, 0.01, '#4DABF7', 0, -0.1, 0.045); }
  else if (kind === 'console') { b.box(0.26, 0.12, 0.04, '#3D4451', 0, -0.06, 0.08); b.box(0.12, 0.08, 0.01, '#8FD6F2', 0, -0.06, 0.1); }
  else if (kind === 'umbrella') {
    b.cyl(0.012, 0.012, 0.9, '#5A5A5A', 0, -0.1, 0);
    b.cone(0.55, 0.28, '#4DABF7', 0, 0.75, 0, { seg: 10 });
  } else if (kind === 'kendama') {
    b.cyl(0.018, 0.018, 0.22, '#C8874A', 0, -0.2, 0.05, { seg: 6 });
    b.box(0.16, 0.04, 0.04, '#A0662F', 0, -0.02, 0.05);
    b.sphere(0.045, '#E5534B', 0.0, 0.1, 0.05);
  } else if (kind === 'icecream') { b.cone(0.05, 0.14, '#E0A458', 0, -0.14, 0.04, { rx: Math.PI }); b.sphere(0.06, '#FFC9DE', 0, 0.02, 0.04); }
  return new THREE.Mesh(b.buildGeometry(), vertexMaterial());
}

export class Character {
  constructor(look, { adult = false, id = '', blobSize = 0.75 } = {}) {
    this.id = id;
    this.look = look;
    const P = adult ? { leg: 1.55, torso: 1.35, head: 0.88, arm: 1.4 } : { leg: 1, torso: 1, head: 1, arm: 1 };
    this.P = P;
    this.root = new THREE.Group();
    this.root.name = 'char:' + id;
    this.body = new THREE.Group();
    this.root.add(this.body);

    const hipY = 0.4 * P.leg;
    this.hipY = hipY;
    this.torso = buildTorso(look, P);
    this.torso.position.y = hipY;
    this.body.add(this.torso);

    this.bag = buildBag(look, P);
    this.bag.position.y = hipY;
    this.bag.visible = false;
    this.body.add(this.bag);

    this.neck = new THREE.Group();
    this.neck.position.y = hipY + 0.44 * P.torso;
    this.body.add(this.neck);
    this.head = buildHead(look, P);
    this.neck.add(this.head);
    this.face = new THREE.Mesh(FACE_GEO, faceMaterial(look.eyes || 'round', 'neutral'));
    this.face.position.y = 0.24;
    this.face.renderOrder = 2;
    this.head.add(this.face);

    const shoulderY = hipY + 0.37 * P.torso;
    this.armL = new THREE.Group(); this.armL.position.set(0.225, shoulderY, 0);
    this.armR = new THREE.Group(); this.armR.position.set(-0.225, shoulderY, 0);
    this.armL.add(buildArm(look, P, 1));
    this.armR.add(buildArm(look, P, -1));
    this.body.add(this.armL, this.armR);
    this.handR = new THREE.Group();
    this.handR.position.y = -0.3 * P.arm - 0.02;
    this.armR.add(this.handR);

    this.legL = new THREE.Group(); this.legL.position.set(0.1, hipY, 0);
    this.legR = new THREE.Group(); this.legR.position.set(-0.1, hipY, 0);
    const legMesh = buildLeg(look, P);
    this.legL.add(legMesh);
    this.legR.add(new THREE.Mesh(legMesh.geometry, legMesh.material));
    this.body.add(this.legL, this.legR);

    this.shadow = makeBlobShadow(blobSize);
    this.root.add(this.shadow);

    this.root.scale.setScalar(look.height || 1);
    this.height = (hipY + 0.44 * P.torso + 0.24 * P.head + HEAD_R * P.head) * (look.height || 1);

    // Animation state
    this.base = 'idle';
    this.speed = 0;
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.gesture = null;
    this.yaw = 0;
    this.targetYaw = null;
    this.turnRate = 9;
    this.lookTarget = null;
    this.expr = 'neutral';
    this.exprTimer = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.blinkTimer = 1 + Math.random() * 3;
    this.sitHeight = 0;
    this.prop = null;
    this.propKind = null;
    this.pose = { bodyY: 0, bodyRX: 0, headRX: 0, headRY: 0, headRZ: 0, aLX: 0, aLZ: 0.1, aRX: 0, aRZ: -0.1, lLX: 0, lRX: 0 };
    this.lod = 0;
  }

  get position() { return this.root.position; }

  setPosition(x, z, y = 0) { this.root.position.set(x, y, z); }

  setYaw(yaw) { this.yaw = yaw; this.targetYaw = null; this.root.rotation.y = yaw; }
  turnTo(yaw, rate = 9) { this.targetYaw = yaw; this.turnRate = rate; }
  faceToward(x, z, rate = 9) {
    const p = this.root.position;
    if (Math.abs(x - p.x) + Math.abs(z - p.z) < 1e-3) return;
    this.turnTo(Math.atan2(x - p.x, z - p.z), rate);
  }

  setBase(name, opts = {}) {
    this.base = name;
    if (name === 'sit') this.sitHeight = opts.height ?? 0;
  }

  /** One-shot gesture. Returns a promise resolved when it ends. */
  play(name, dur = 1.4) {
    return new Promise((resolve) => {
      if (this.gesture?.resolve) this.gesture.resolve();
      this.gesture = { name, t: 0, dur, resolve };
    });
  }

  /** Looping gesture until stopped (e.g. 'talk', 'cheer'). */
  hold(name) { this.gesture = { name, t: 0, dur: Infinity, resolve: null }; }
  stopGesture() { if (this.gesture?.resolve) this.gesture.resolve(); this.gesture = null; }

  setExpression(expr, seconds = 0) {
    this.expr = expr;
    this.exprTimer = seconds;
    this._applyFace();
  }

  setTalking(on) { this.talking = on; if (!on) this._applyFace(); }

  _applyFace(override) {
    this.face.material = faceMaterial(this.look.eyes || 'round', override || this.expr);
  }

  showBag(on) { this.bag.visible = Boolean(on); }

  setProp(kind) {
    if (this.propKind === kind) return;
    if (this.prop) { this.handR.remove(this.prop); this.prop = null; }
    this.propKind = kind || null;
    if (!kind) return;
    if (!PROPS[kind]) PROPS[kind] = propMesh(kind);
    this.prop = new THREE.Mesh(PROPS[kind].geometry, PROPS[kind].material);
    this.handR.add(this.prop);
  }

  lookAt(x, y, z) { this.lookTarget = x === null ? null : new THREE.Vector3(x, y, z); }

  update(dt) {
    this.time += dt;
    // Turning
    if (this.targetYaw !== null) {
      const d = angleDelta(this.yaw, this.targetYaw);
      if (Math.abs(d) < 0.002) { this.yaw = this.targetYaw; this.targetYaw = null; }
      else this.yaw += d * damp(this.turnRate, dt);
      this.root.rotation.y = this.yaw;
    }
    // Face: blink / talk / timed expression
    if (this.exprTimer > 0) { this.exprTimer -= dt; if (this.exprTimer <= 0) { this.expr = 'neutral'; this._applyFace(); } }
    if (this.talking) {
      this.talkTimer -= dt;
      if (this.talkTimer <= 0) {
        this.talkTimer = 0.11 + Math.random() * 0.06;
        this._mouthOpen = !this._mouthOpen;
        this._applyFace(this._mouthOpen ? 'talk' : (this.expr === 'talk' ? 'neutral' : this.expr));
      }
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        if (this._blinking) { this._blinking = false; this.blinkTimer = 2 + Math.random() * 3.5; this._applyFace(); }
        else if (this.expr === 'neutral' || this.expr === 'worried') { this._blinking = true; this.blinkTimer = 0.12; this._applyFace('blink'); }
        else this.blinkTimer = 1.5;
      }
    }
    if (this.lod > 0 && Math.floor(this.time * 60) % 2) return;
    this._animate(dt);
  }

  _animate(dt) {
    const t = this.time;
    const T = { bodyY: 0, bodyRX: 0, headRX: 0, headRY: 0, headRZ: 0, aLX: 0, aLZ: 0.1, aRX: 0, aRZ: -0.1, lLX: 0, lRX: 0 };
    // Base
    if (this.base === 'walk' && this.speed > 0.05) {
      const s = Math.min(1.4, this.speed / 3);
      this.phase += dt * (6 + 5 * s);
      const sw = Math.sin(this.phase);
      T.lLX = sw * 0.75 * Math.min(1, s * 1.5);
      T.lRX = -sw * 0.75 * Math.min(1, s * 1.5);
      T.aLX = -sw * 0.6 * s;
      T.aRX = sw * 0.6 * s;
      T.bodyY = Math.abs(Math.cos(this.phase)) * 0.045 * s;
      T.bodyRX = 0.06 * s;
    } else if (this.base === 'sit') {
      T.lLX = -1.45; T.lRX = -1.45;
      T.aLX = -0.55; T.aRX = -0.55; T.aLZ = 0.05; T.aRZ = -0.05;
      T.bodyY = this.sitHeight - this.hipY + 0.02;
      T.headRX = 0.05 + Math.sin(t * 1.3) * 0.02;
    } else {
      const br = Math.sin(t * 2.1);
      T.bodyY = br * 0.006;
      T.aLZ = 0.1 + br * 0.02;
      T.aRZ = -0.1 - br * 0.02;
      T.headRX = Math.sin(t * 0.7) * 0.03;
      T.headRY = Math.sin(t * 0.37) * 0.12;
    }
    // Gesture overlay
    const g = this.gesture;
    if (g) {
      g.t += dt;
      const ramp = Math.min(1, g.t / 0.18, g.dur === Infinity ? 1 : (g.dur - g.t) / 0.2);
      const w = Math.max(0, ramp);
      const G2 = { ...T };
      const k = g.t;
      switch (g.name) {
        case 'wave': G2.aRZ = -2.55 + Math.sin(k * 11) * 0.28; G2.aRX = -0.15; G2.headRZ = 0.08; break;
        case 'nod': G2.headRX = 0.22 * Math.max(0, Math.sin(k * 11)); break;
        case 'shake': G2.headRY = Math.sin(k * 13) * 0.38; break;
        case 'happy': case 'cheer':
          G2.aLZ = 2.6 + Math.sin(k * 12) * 0.15; G2.aRZ = -2.6 - Math.sin(k * 12) * 0.15;
          G2.bodyY = T.bodyY + Math.abs(Math.sin(k * 8)) * 0.16; G2.headRX = -0.15; break;
        case 'clap':
          G2.aLX = -1.25; G2.aRX = -1.25; G2.aLZ = -0.32 - Math.max(0, Math.sin(k * 16)) * 0.2; G2.aRZ = 0.32 + Math.max(0, Math.sin(k * 16)) * 0.2; break;
        case 'think': G2.aRX = -2.25; G2.aRZ = 0.75; G2.headRZ = 0.16; G2.headRX = -0.06; break;
        case 'talk': G2.aRX = -0.45 + Math.sin(k * 4.5) * 0.25; G2.aRZ = -0.25; G2.headRX = T.headRX + Math.sin(k * 6) * 0.04; break;
        case 'point': G2.aRX = -1.5; G2.aRZ = -0.15; break;
        case 'surprised': G2.aLZ = 0.7; G2.aRZ = -0.7; G2.bodyY = T.bodyY + Math.max(0, Math.sin(Math.min(k, 0.4) * 8)) * 0.06; G2.headRX = -0.12; break;
        case 'sad': G2.headRX = 0.3; G2.aLZ = 0.05; G2.aRZ = -0.05; break;
        case 'throw': {
          const p = Math.min(1, k / g.dur);
          G2.aRX = p < 0.45 ? 2.3 * (p / 0.45) : 2.3 - 3.6 * Math.min(1, (p - 0.45) / 0.25);
          G2.bodyRX = p < 0.45 ? -0.08 : 0.12; break;
        }
        case 'catch': G2.aLX = -1.35; G2.aRX = -1.35; G2.aLZ = -0.2; G2.aRZ = 0.2; break;
        case 'kick': {
          const p = Math.min(1, k / g.dur);
          G2.lRX = p < 0.4 ? 0.6 * (p / 0.4) : 0.6 - 1.9 * Math.min(1, (p - 0.4) / 0.25);
          G2.aLX = -0.4; G2.aRX = 0.4; break;
        }
        case 'eat': G2.aRX = -1.95 - Math.max(0, Math.sin(k * 6)) * 0.25; G2.aRZ = 0.55; G2.headRX = 0.08; break;
        case 'hold': G2.aLX = -0.9; G2.aRX = -0.9; G2.aLZ = -0.25; G2.aRZ = 0.25; break;
        case 'umbrella': G2.aRX = -0.9; G2.aRZ = 0.25; break;
        case 'look': G2.headRX = 0.35; break;
        case 'search': G2.headRX = 0.3; G2.headRY = Math.sin(k * 2.5) * 0.5; G2.aRX = -0.6; break;
        case 'dance':
          G2.aLZ = 1.4 + Math.sin(k * 7) * 0.9; G2.aRZ = -1.4 + Math.sin(k * 7 + 1) * 0.9;
          G2.bodyY = Math.abs(Math.sin(k * 7)) * 0.08; G2.headRZ = Math.sin(k * 3.5) * 0.15; break;
        case 'jog': {
          const sw = Math.sin(k * 11);
          G2.lLX = sw * 0.6; G2.lRX = -sw * 0.6; G2.aLX = -sw * 0.7 - 0.5; G2.aRX = sw * 0.7 - 0.5;
          G2.bodyY = Math.abs(Math.cos(k * 11)) * 0.05; break;
        }
        default: break;
      }
      for (const key of Object.keys(T)) T[key] = T[key] + (G2[key] - T[key]) * w;
      if (g.dur !== Infinity && g.t >= g.dur) { const r = g.resolve; this.gesture = null; r?.(); }
    }
    // Head look-at (yaw only, limited)
    if (this.lookTarget) {
      const p = this.root.position;
      const want = Math.atan2(this.lookTarget.x - p.x, this.lookTarget.z - p.z);
      const d = Math.max(-0.8, Math.min(0.8, angleDelta(this.yaw, want)));
      T.headRY = d;
    }
    // Damp toward target pose
    const f = damp(14, dt);
    const P = this.pose;
    for (const key of Object.keys(T)) P[key] += (T[key] - P[key]) * f;
    this.body.position.y = P.bodyY;
    this.body.rotation.x = P.bodyRX;
    this.neck.rotation.set(P.headRX, P.headRY, P.headRZ);
    this.armL.rotation.set(P.aLX, 0, P.aLZ);
    this.armR.rotation.set(P.aRX, 0, P.aRZ);
    this.legL.rotation.x = P.lLX;
    this.legR.rotation.x = P.lRX;
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && o.geometry !== FACE_GEO && o.geometry.dispose && !Object.values(PROPS).some((p) => p.geometry === o.geometry)) o.geometry.dispose(); });
  }
}
