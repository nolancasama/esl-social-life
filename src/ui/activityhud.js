// Minimal HUD for minigames: title, hint, score dots, one big action button
// and an optional timing meter. Space/Enter also press the button.

import { el, escapeHtml } from '../core/util.js';

export class ActivityHUD {
  constructor(root, getSettings) {
    this.getSettings = getSettings;
    this.title = el('div', { class: 'act-title' });
    this.hint = el('div', { class: 'act-hint' });
    this.dots = el('div', { class: 'act-dots' });
    this.call = el('div', { class: 'act-call', hidden: true });
    this.btn = el('button', { class: 'act-btn', hidden: true });
    this.meter = el('div', { class: 'act-meter', hidden: true }, [el('div', { class: 'act-zone' }), el('div', { class: 'act-needle' })]);
    this.flash = el('div', { class: 'act-flash' });
    this.root = el('div', { class: 'act', hidden: true }, [
      el('div', { class: 'act-top' }, [this.title, this.dots]), this.hint, this.call, this.flash, el('div', { class: 'act-bottom' }, [this.meter, this.btn]),
    ]);
    root.appendChild(this.root);
    this.onPress = null;
    this.btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._press(); });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden || this.btn.hidden) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this._press(); }
    }, true);
  }

  _press() {
    if (!this.onPress) return;
    this.btn.classList.remove('press');
    void this.btn.offsetWidth;
    this.btn.classList.add('press');
    this.onPress();
  }

  show(title) { this.root.hidden = false; this.title.textContent = title; this.setHint('', ''); this.flash.textContent = ''; }
  hide() { this.root.hidden = true; this.button(null); this.showMeter(false); this.say(null); }

  setHint(en, ja) {
    const j = this.getSettings().japanese;
    this.hint.innerHTML = en ? `${escapeHtml(en)}${j && ja ? `<small>${escapeHtml(ja)}</small>` : ''}` : '';
    this.hint.hidden = !en;
  }

  setScore(results, total) {
    this.dots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const r = results[i];
      this.dots.appendChild(el('span', { class: `dot ${r === true ? 'ok' : r === false ? 'miss' : ''}` }, [r === true ? '★' : '•']));
    }
  }

  button(label, onPress = null, tone = '') {
    this.onPress = onPress;
    this.btn.hidden = !label;
    if (label) { this.btn.textContent = label; this.btn.className = `act-btn ${tone}`; }
  }

  shakeButton() { this.btn.classList.remove('shake'); void this.btn.offsetWidth; this.btn.classList.add('shake'); }

  showMeter(on) { this.meter.hidden = !on; }
  setNeedle(v) { this.meter.lastChild.style.left = `${(v * 100).toFixed(1)}%`; }

  pop(text, tone = 'good') {
    this.flash.textContent = text;
    this.flash.className = `act-flash ${tone}`;
    void this.flash.offsetWidth;
    this.flash.classList.add('show');
  }

  /** Short NPC call ("Catch the ball!") shown under the title. */
  say(who, en = '', ja = '') {
    if (!who) { this.call.hidden = true; return; }
    const j = this.getSettings().japanese;
    this.call.hidden = false;
    this.call.innerHTML = `<b style="color:${who.color}">${escapeHtml(who.name)}</b> ${escapeHtml(en)}${j && ja ? `<small>${escapeHtml(ja)}</small>` : ''}`;
  }
}
