// Input: keyboard (WASD/arrows), on-screen joystick for touch, tap-to-move /
// tap-to-talk, and drag to turn the camera. Touch is first-class.

import { el } from '../core/util.js';

const MOVE = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export class Input {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.listeners = {};
    this.joy = { active: false, x: 0, y: 0, id: null };
    this.touchUI = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (MOVE[e.code]) { this.keys.add(e.code); if (this.enabled) e.preventDefault(); }
      if (!e.repeat) this.emit('key', e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Joystick (always available on touch devices; also usable with a mouse)
    this.joyBase = el('div', { class: 'joy', hidden: !this.touchUI }, [el('div', { class: 'joy-knob' })]);
    uiRoot.appendChild(this.joyBase);
    const knob = this.joyBase.firstChild;
    const R = 46;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    this.joyBase.addEventListener('pointerdown', (e) => {
      this.joy.active = true; this.joy.id = e.pointerId;
      this.joyBase.setPointerCapture(e.pointerId);
      this._joyMove(e, R, setKnob);
    });
    this.joyBase.addEventListener('pointermove', (e) => { if (this.joy.active && e.pointerId === this.joy.id) this._joyMove(e, R, setKnob); });
    const end = () => { this.joy.active = false; this.joy.x = 0; this.joy.y = 0; setKnob(0, 0); };
    this.joyBase.addEventListener('pointerup', end);
    this.joyBase.addEventListener('pointercancel', end);

    // Canvas: tap/click to move or talk, drag to rotate the camera.
    let down = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, lastX: e.clientX };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.lastX;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 10) down.moved = true;
      if (down.moved) this.emit('drag', { dx });
      down.lastX = e.clientX;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || e.pointerId !== down.id) return;
      if (!down.moved && performance.now() - down.t < 450) this.emit('tap', { x: e.clientX, y: e.clientY });
      down = null;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _joyMove(e, R, setKnob) {
    const r = this.joyBase.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob(dx, dy);
    this.joy.x = dx / R;
    this.joy.y = -dy / R;
  }

  showJoystick(on) { this.joyBase.hidden = !on || !this.touchUI; }

  /** Movement axis: x = right, y = forward, magnitude ≤ 1. */
  axis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    for (const k of this.keys) { const m = MOVE[k]; if (m) { x += m[0]; y += m[1]; } }
    if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  on(evt, fn) { (this.listeners[evt] ||= new Set()).add(fn); return () => this.listeners[evt].delete(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] || []) fn(data); }
}
