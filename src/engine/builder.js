// Geometry builder: collects primitive parts with per-part colours and merges
// them into a single BufferGeometry (vertex colours). Also records collision
// shapes for the parts that are solid.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vertexMaterial } from './materials.js';

const tmpColor = new THREE.Color();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpMat = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

const GEO_CACHE = new Map();
function cached(key, make) {
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, make());
  return GEO_CACHE.get(key);
}

export const G = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg = 12) => cached('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg)),
  cone: (seg = 10) => cached('cone' + seg, () => new THREE.ConeGeometry(0.5, 1, seg)),
  sphere: (w = 12, h = 9) => cached(`sph${w}x${h}`, () => new THREE.SphereGeometry(0.5, w, h)),
  ico: (d = 0) => cached('ico' + d, () => new THREE.IcosahedronGeometry(0.5, d)),
  plane: () => cached('plane', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; }),
  torus: (r = 0.5, t = 0.12, rs = 6, ts = 14) => cached(`tor${r}${t}${rs}${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts)),
};

export class StaticBuilder {
  constructor() {
    this.parts = [];
    this.boxes = [];
    this.circles = [];
  }

  /**
   * Add a geometry with colour and transform.
   * t: { x, y, z, rx, ry, rz, sx, sy, sz }
   */
  add(geometry, color, t = {}) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone());
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (t.q) tmpQuat.copy(t.q);
    else {
      tmpEuler.set(t.rx || 0, t.ry || 0, t.rz || 0);
      tmpQuat.setFromEuler(tmpEuler);
    }
    tmpPos.set(t.x || 0, t.y || 0, t.z || 0);
    tmpScale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    g.applyMatrix4(tmpMat);
    tmpColor.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const shade = t.shade ?? 1;
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r * shade;
      colors[i * 3 + 1] = tmpColor.g * shade;
      colors[i * 3 + 2] = tmpColor.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    }
    this.parts.push(g);
    return this;
  }

  /** Axis-aligned (or rotated) box. collide: true adds an AABB collider. */
  box(w, h, d, color, x, y, z, o = {}) {
    this.add(G.box(), color, { x, y: y + h / 2, z, ry: o.ry || 0, rx: o.rx || 0, rz: o.rz || 0, sx: w, sy: h, sz: d, shade: o.shade });
    if (o.collide) this.collideBox(x, z, w, d, o.ry || 0, y + h, o.pad || 0);
    return this;
  }

  cyl(rTop, rBot, h, color, x, y, z, o = {}) {
    const seg = o.seg || 12;
    const key = `cyl:${rTop}:${rBot}:${seg}`;
    const geo = cached(key, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, !!o.open));
    this.add(geo, color, { x, y: y + h / 2, z, rx: o.rx, ry: o.ry, rz: o.rz, sy: h, sx: o.sx ?? 1, sz: o.sz ?? 1, shade: o.shade });
    if (o.collide) this.circles.push({ x, z, r: Math.max(rTop, rBot) + (o.pad || 0), h: y + h });
    return this;
  }

  sphere(r, color, x, y, z, o = {}) {
    this.add(G.sphere(o.w || 12, o.h || 9), color, { x, y, z, sx: 2 * r * (o.sx ?? 1), sy: 2 * r * (o.sy ?? 1), sz: 2 * r * (o.sz ?? 1), rx: o.rx, ry: o.ry, rz: o.rz, shade: o.shade });
    if (o.collide) this.circles.push({ x, z, r: r * (o.sx ?? 1) + (o.pad || 0), h: y + r });
    return this;
  }

  cone(r, h, color, x, y, z, o = {}) {
    this.add(G.cone(o.seg || 10), color, { x, y: y + h / 2, z, sx: 2 * r, sy: h, sz: 2 * r, rx: o.rx, ry: o.ry, rz: o.rz, shade: o.shade });
    return this;
  }

  /** Flat horizontal rectangle (floors, roads, rugs). */
  flat(w, d, color, x, y, z, o = {}) {
    this.add(G.plane(), color, { x, y, z, sx: w, sz: d, ry: o.ry || 0, shade: o.shade });
    return this;
  }

  collideBox(x, z, w, d, ry = 0, h = 3, pad = 0) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const hw = (w * c + d * s) / 2 + pad;
    const hd = (w * s + d * c) / 2 + pad;
    this.boxes.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h });
    return this;
  }

  collideCircle(x, z, r, h = 2) { this.circles.push({ x, z, r, h }); return this; }

  /** Merge into one mesh. */
  build(material = vertexMaterial()) {
    if (!this.parts.length) return new THREE.Group();
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /** Merge into a raw geometry (used for character parts). */
  buildGeometry() {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}
