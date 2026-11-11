// Name tags, markers and ambient emoji bubbles positioned over characters.

import * as THREE from 'three';
import { el } from '../core/util.js';

const v = new THREE.Vector3();

export class Overlay {
  constructor(root) {
    this.root = el('div', { class: 'ov' });
    root.appendChild(this.root);
    this.pool = new Map();
    this.visible = true;
    this.target = el('div', { class: 'ov-target', hidden: true });
    this.root.appendChild(this.target);
  }

  _node(key) {
    let n = this.pool.get(key);
    if (!n) {
      const tag = el('div', { class: 'ov-tag' });
      const mark = el('div', { class: 'ov-mark' });
      const bub = el('div', { class: 'ov-bubble' });
      const wrap = el('div', { class: 'ov-item' }, [bub, mark, tag]);
      this.root.appendChild(wrap);
      n = { wrap, tag, mark, bub, last: {} };
      this.pool.set(key, n);
    }
    n.used = true;
    return n;
  }

  /** items: [{ key, pos: Vector3 (world head point), name, hearts, marker, bubble, dist }] */
  update(camera, items, width, height) {
    for (const n of this.pool.values()) n.used = false;
    if (this.visible) {
      for (const it of items) {
        v.copy(it.pos).project(camera);
        if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.3) continue;
        const n = this._node(it.key);
        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-v.y * 0.5 + 0.5) * height;
        n.wrap.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        const showTag = it.dist < (it.near ?? 8.5);
        const tagText = it.name ? `${it.name}${it.hearts ? ` <b>${it.hearts}</b>` : ''}` : '';
        if (n.last.tag !== tagText) { n.tag.innerHTML = tagText; n.last.tag = tagText; }
        n.tag.hidden = !showTag || !tagText;
        n.tag.classList.toggle('stranger', !!it.stranger);
        if (n.last.mark !== it.marker) { n.mark.textContent = it.marker || ''; n.last.mark = it.marker; }
        n.mark.hidden = !it.marker;
        if (n.last.bub !== it.bubble) { n.bub.textContent = it.bubble || ''; n.last.bub = it.bubble; if (it.bubble) { n.bub.classList.remove('pop'); void n.bub.offsetWidth; n.bub.classList.add('pop'); } }
        n.bub.hidden = !it.bubble || it.dist > 18;
        n.wrap.style.opacity = it.dim ? '0.35' : '1';
        n.wrap.hidden = false;
      }
    }
    for (const n of this.pool.values()) if (!n.used) n.wrap.hidden = true;
  }

  /** Floating "you are here / go here" marker for search targets etc. */
  setTarget(camera, pos, text, width, height) {
    if (!pos) { this.target.hidden = true; return; }
    v.copy(pos).project(camera);
    if (v.z > 1) { this.target.hidden = true; return; }
    this.target.hidden = false;
    this.target.textContent = text;
    const x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height;
    this.target.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  clear() { for (const n of this.pool.values()) n.wrap.hidden = true; this.target.hidden = true; }
}
