// WebGL renderer wrapper: sizing, adaptive quality, snapshots and portraits.

import * as THREE from 'three';
import { Character } from './character.js';

const isChromeOS = typeof navigator !== 'undefined' && /CrOS/.test(navigator.userAgent);

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.quality = 'auto';
    this.shadows = !isChromeOS && (navigator.hardwareConcurrency || 4) >= 8;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxRatio = isChromeOS ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'scene';
    container.appendChild(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 420);
    this.frameTimes = [];
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; });
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    // Keep characters readable on narrow screens.
    this.camera.fov = w / h < 1.2 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  setQuality(q) {
    this.quality = q;
    if (q === 'low') { this.ratio = Math.min(1, this.maxRatio); this.setShadows(false); }
    if (q === 'high') { this.ratio = this.maxRatio; }
    this.renderer.setPixelRatio(this.ratio);
    this._resize();
  }

  setShadows(on) {
    this.shadows = on;
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  /** Adaptive quality: lower pixel ratio when frames are slow. */
  trackFrame(dt) {
    if (this.quality !== 'auto') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 38 && this.ratio > 0.7) {
      if (this.shadows) this.setShadows(false);
      else this.ratio = Math.max(0.7, this.ratio - 0.15);
      this.renderer.setPixelRatio(this.ratio);
      this._resize();
    } else if (avg < 1 / 58 && this.ratio < this.maxRatio) {
      this.ratio = Math.min(this.maxRatio, this.ratio + 0.1);
      this.renderer.setPixelRatio(this.ratio);
      this._resize();
    }
  }

  setWorld(root, { background, fog }) {
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    if (root) this.scene.add(root);
    this.applyAmbience({ background, fog });
  }

  applyAmbience({ background, fog }) {
    this.scene.background = background || new THREE.Color('#202433');
    this.scene.fog = fog || null;
  }

  render() {
    if (this.lost) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** JPEG snapshot of what the camera sees right now (no HTML UI). */
  snapshot(width = 360, height = 225, quality = 0.78) {
    this.render();
    const src = this.canvas;
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d');
    const sa = src.width / src.height, da = width / height;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sa > da) { sw = src.height * da; sx = (src.width - sw) / 2; } else { sh = src.width / da; sy = (src.height - sh) / 2; }
    g.drawImage(src, sx, sy, sw, sh, 0, 0, width, height);
    return c.toDataURL('image/jpeg', quality);
  }

  /** Head-and-shoulders portrait of a look (cached by caller). */
  portrait(look, { size = 160, bg = null, expr = 'happy' } = {}) {
    const scene = new THREE.Scene();
    scene.background = bg ? new THREE.Color(bg) : new THREE.Color('#FFF6E9');
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#C9B8A6', 2.2));
    const d = new THREE.DirectionalLight('#FFFFFF', 1.6);
    d.position.set(2, 3, 4);
    scene.add(d);
    const ch = new Character(look);
    ch.setExpression(expr);
    ch.update(0.016);
    scene.add(ch.root);
    const cam = new THREE.PerspectiveCamera(30, this.camera.aspect, 0.1, 20);
    const headY = ch.height - 0.3 * (look.height || 1);
    cam.position.set(0.0, headY + 0.12, 2.35);
    cam.lookAt(0, headY - 0.02, 0);
    this.renderer.render(scene, cam);
    const src = this.canvas;
    const s = Math.min(src.width, src.height) * 0.5;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
    const url = c.toDataURL('image/png');
    ch.dispose();
    this.render();
    return url;
  }
}
