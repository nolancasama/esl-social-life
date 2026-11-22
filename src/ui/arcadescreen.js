// A cabinet screen for the Game Center minigames: one canvas plus large hold
// buttons (◀ ▲ ▼ ▶) and action buttons. Arrow keys / WASD and Space work too.
import { el } from '../core/util.js';

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };

export class ArcadeScreen {
  /** dirs: which of left/right/up/down to show; actions: [{ id, label, tone }] */
  constructor(root, { width = 640, height = 400, dirs = ['left', 'right'], actions = [], color = '#7B6DC7' } = {}) {
    this.held = { left: false, right: false, up: false, down: false };
    this.pressed = new Set();
    this.canvas = el('canvas', { width, height, class: 'arc-canvas' });
    this.ctx = this.canvas.getContext('2d');
    const arrow = { left: '◀', right: '▶', up: '▲', down: '▼' };
    const pad = el('div', { class: 'arc-pad' });
    for (const d of ['left', 'up', 'down', 'right'].filter((d) => dirs.includes(d))) {
      const b = el('button', { class: `arc-dir arc-${d}`, 'aria-label': d }, [arrow[d]]);
      const on = (e) => { e.preventDefault(); this.held[d] = true; b.classList.add('on'); };
      const off = () => { this.held[d] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
      pad.appendChild(b);
    }
    this.actionButtons = {};
    const acts = el('div', { class: 'arc-acts' });
    for (const a of actions) {
      const b = el('button', { class: `arc-act ${a.tone || ''}` }, [a.label]);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pressed.add(a.id); });
      acts.appendChild(b);
      this.actionButtons[a.id] = b;
    }
    this.root = el('div', { class: 'arc', style: `--arc:${color}` }, [el('div', { class: 'arc-screen' }, [this.canvas]), el('div', { class: 'arc-controls' }, [pad, acts])]);
    root.appendChild(this.root);
    this.firstAction = actions[0]?.id || null;
    this._down = (e) => {
      const d = KEYS[e.code];
      if (d && dirs.includes(d)) { this.held[d] = true; e.preventDefault(); e.stopPropagation(); }
      else if ((e.code === 'Space' || e.code === 'Enter') && this.firstAction) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.pressed.add(this.firstAction); }
    };
    this._up = (e) => { const d = KEYS[e.code]; if (d) this.held[d] = false; };
    this._blur = () => { for (const d of Object.keys(this.held)) this.held[d] = false; };
    window.addEventListener('keydown', this._down, true);
    window.addEventListener('keyup', this._up, true);
    window.addEventListener('blur', this._blur);
  }

  /** Horizontal / vertical input in -1..1 (up is -1). */
  axis() { return { x: (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0), z: (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0) }; }

  /** True once per press of an action button. */
  take(id) { const had = this.pressed.has(id); this.pressed.delete(id); return had; }

  setAction(id, { label, hidden, disabled } = {}) {
    const b = this.actionButtons[id];
    if (!b) return;
    if (label !== undefined) b.textContent = label;
    if (hidden !== undefined) b.hidden = hidden;
    if (disabled !== undefined) b.disabled = disabled;
  }

  close() {
    window.removeEventListener('keydown', this._down, true);
    window.removeEventListener('keyup', this._up, true);
    window.removeEventListener('blur', this._blur);
    this.root.remove();
  }
}
