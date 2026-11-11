// Dialogue box and answer cards (DOM). One decision at a time: the NPC line,
// then cards. Tapping a card always works; speaking is an equal alternative.

import { el, escapeHtml, wait } from '../core/util.js';
import { speech, MIC_REASON } from './speech.js';
import { voice } from './voice.js';
import { matchOptions } from './intent.js';
import { sfx } from '../core/audio.js';

const NEXT_KEYS = new Set(['Space', 'Enter', 'KeyE', 'NumpadEnter']);

export class DialogueUI {
  constructor(root, getSettings) {
    this.getSettings = getSettings;
    this.root = el('div', { class: 'dlg', hidden: true });
    this.banner = el('div', { class: 'dlg-banner', hidden: true });
    this.cards = el('div', { class: 'dlg-cards' });
    this.micRow = el('div', { class: 'dlg-mic' });
    this.choiceBox = el('div', { class: 'dlg-choices', hidden: true }, [this.banner, this.micRow, this.cards]);
    this.name = el('div', { class: 'dlg-name' });
    this.en = el('div', { class: 'dlg-en' });
    this.ja = el('div', { class: 'dlg-ja' });
    this.nextBtn = el('button', { class: 'dlg-next', 'aria-label': 'Next', title: 'Next (Space)' }, ['▶']);
    this.replayBtn = el('button', { class: 'dlg-replay', 'aria-label': 'Listen again', title: 'Listen again' }, ['🔊']);
    this.panel = el('div', { class: 'dlg-panel' }, [this.name, el('div', { class: 'dlg-text' }, [this.en, this.ja]), this.replayBtn, this.nextBtn]);
    this.root.append(this.choiceBox, this.panel);
    root.appendChild(this.root);

    this.mode = null;
    this.resolveNext = null;
    this.typing = null;
    this.lastVoice = null;
    this.panel.addEventListener('click', (e) => { if (e.target === this.replayBtn) return; this._advance(); });
    this.replayBtn.addEventListener('click', (e) => { e.stopPropagation(); if (this.lastVoice) voice.speak(...this.lastVoice); });
    window.addEventListener('keydown', (e) => this._key(e), true);
    speech.onChange(() => { if (this.mode === 'choose') this._renderMic(); });
  }

  get isOpen() { return !this.root.hidden; }
  open() { this.root.hidden = false; requestAnimationFrame(() => this.root.classList.add('show')); }
  close() {
    this.root.classList.remove('show');
    this.root.hidden = true;
    this.choiceBox.hidden = true;
    this.mode = null;
    speech.abort();
    voice.stop();
  }

  _key(e) {
    if (!this.isOpen) return;
    if (this.mode === 'line' && NEXT_KEYS.has(e.code)) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) this._advance();
    } else if (this.mode === 'choose') {
      const n = Number(e.key);
      if (n >= 1 && n <= this.current.length) { e.preventDefault(); e.stopPropagation(); this._pick(this.current[n - 1], 'key'); return; }
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); e.stopPropagation(); this._toggleListen(); }
    }
  }

  _advance() {
    if (this.mode !== 'line') return;
    if (this.typing) { this.typing.finish(); return; }
    const r = this.resolveNext;
    this.resolveNext = null;
    this.mode = null;
    sfx.click();
    r?.();
  }

  _type(text) {
    return new Promise((resolve) => {
      let i = 0;
      const chars = [...text];
      const total = chars.length;
      const speed = 55;
      let cancelled = false;
      const finish = () => { cancelled = true; this.en.textContent = text; this.typing = null; resolve(); };
      this.typing = { finish };
      const tick = () => {
        if (cancelled) return;
        i = Math.min(total, i + 2);
        this.en.textContent = chars.slice(0, i).join('');
        if (i % 6 === 0) sfx.blip(1 + (this.blipPitch || 0));
        if (i >= total) { this.typing = null; resolve(); return; }
        setTimeout(tick, 1000 / speed * 2);
      };
      tick();
    });
  }

  _speaker({ name, color, badge }) {
    this.name.innerHTML = `${escapeHtml(name)}${badge ? ` <span class="dlg-badge">${escapeHtml(badge)}</span>` : ''}`;
    this.name.style.setProperty('--c', color || '#FF7A59');
    this.panel.style.setProperty('--c', color || '#FF7A59');
  }

  /** Show one line and wait for the player to continue. */
  async say({ name, color, badge, en, ja, voiceOpts = null, player = false, auto = 0 }) {
    this.open();
    this.choiceBox.hidden = true;
    this.panel.classList.toggle('player', player);
    this._speaker({ name, color, badge });
    const s = this.getSettings();
    this.ja.textContent = s.japanese ? (ja || '') : '';
    this.ja.hidden = !s.japanese || !ja;
    this.lastVoice = voiceOpts ? [en, voiceOpts] : null;
    this.replayBtn.hidden = !voice.available || !s.voice;
    if (voiceOpts && s.voice) voice.speak(en, voiceOpts);
    this.mode = 'line';
    this.nextBtn.hidden = true;
    const typed = this._type(en);
    const advanced = new Promise((r) => { this.resolveNext = r; });
    await typed;
    this.nextBtn.hidden = false;
    if (auto) {
      await Promise.race([advanced, wait(auto)]);
      if (this.mode === 'line') { this.mode = null; this.resolveNext = null; }
      return;
    }
    await advanced;
  }

  /**
   * Show answer cards. options: [{ id, en, ja, emoji, phrases?, keys?, highlight?, tone? }]
   * Resolves { option, via: 'tap'|'key'|'speech', transcript? }.
   */
  choose(options, { prompt = null, banner = null, columns = null } = {}) {
    this.open();
    this.current = options;
    this.mode = 'choose';
    this.choiceBox.hidden = false;
    this.cards.innerHTML = '';
    this.cards.style.setProperty('--cols', columns || (options.length > 2 ? 2 : options.length));
    this.cards.classList.toggle('many', options.length > 4);
    if (banner) {
      this.banner.hidden = false;
      this.banner.innerHTML = `<span class="ico">${escapeHtml(banner.icon || '⏳')}</span><span><b>${escapeHtml(banner.en)}</b>${this.getSettings().japanese && banner.ja ? `<small>${escapeHtml(banner.ja)}</small>` : ''}</span>`;
    } else this.banner.hidden = true;
    if (prompt) {
      this.panel.classList.remove('player');
      this._speaker(prompt);
      this.en.textContent = prompt.en;
      this.ja.textContent = this.getSettings().japanese ? (prompt.ja || '') : '';
      this.ja.hidden = !this.getSettings().japanese || !prompt.ja;
      this.nextBtn.hidden = true;
    } else {
      this.nextBtn.hidden = true;
    }
    const s = this.getSettings();
    options.forEach((o, i) => {
      const hear = voice.available && s.voice ? el('span', { class: 'card-hear', role: 'button', title: 'Listen', 'aria-label': 'Listen' }, ['🔊']) : null;
      const card = el('button', { class: `card${o.highlight ? ' hl' : ''}${o.tone ? ' ' + o.tone : ''}`, 'data-id': o.id }, [
        o.emoji ? el('span', { class: 'card-emoji' }, [o.emoji]) : null,
        el('span', { class: 'card-text' }, [
          el('span', { class: 'card-en' }, [o.en]),
          s.japanese && o.ja ? el('span', { class: 'card-ja' }, [o.ja]) : null,
        ]),
        hear,
        el('span', { class: 'card-num' }, [String(i + 1)]),
      ]);
      card.style.animationDelay = `${i * 45}ms`;
      card.addEventListener('click', (e) => {
        if (hear && (e.target === hear)) { e.stopPropagation(); voice.speak(o.en, { pitch: 1.1, rate: 0.85 }); return; }
        this._pick(o, 'tap');
      });
      o._el = card;
      this.cards.appendChild(card);
    });
    this._renderMic();
    this.heardText = '';
    return new Promise((resolve) => { this.resolveChoice = resolve; });
  }

  _pick(option, via, transcript = null) {
    if (this.mode !== 'choose') return;
    this.mode = null;
    speech.abort();
    sfx.select();
    option._el?.classList.add('picked');
    for (const o of this.current) if (o !== option) o._el?.classList.add('faded');
    const r = this.resolveChoice;
    this.resolveChoice = null;
    setTimeout(() => {
      this.choiceBox.hidden = true;
      r?.({ option, via, transcript });
    }, via === 'speech' ? 520 : 260);
  }

  // ------------------------------------------------------------ microphone
  _renderMic() {
    const st = speech.status;
    this.micRow.innerHTML = '';
    if (st === 'unavailable') {
      this.micRow.className = 'dlg-mic off';
      return;
    }
    const s = this.getSettings();
    if (st === 'off' || st === 'setup') {
      this.micRow.className = 'dlg-mic idle';
      this.micRow.append(el('span', { class: 'mic-hint' }, [s.japanese ? 'Tap a card!  カードをタップ！' : 'Tap a card!']));
      return;
    }
    const listening = st === 'listening';
    const btn = el('button', { class: `mic-btn${listening ? ' on' : ''}`, title: 'Speak (Space)' }, [listening ? '🎙️ Listening…' : '🎤 Speak']);
    btn.addEventListener('click', () => this._toggleListen());
    const heard = el('span', { class: 'mic-heard' }, [this.heardText || (s.japanese ? 'Say a card, or tap one!  カードを言うか、タップしてね' : 'Say a card, or tap one!')]);
    this.micRow.className = `dlg-mic ready${listening ? ' listening' : ''}`;
    this.micRow.append(btn, heard);
  }

  _setHeard(text, tone = '') {
    this.heardText = text;
    const h = this.micRow.querySelector('.mic-heard');
    if (h) { h.textContent = text; h.className = `mic-heard ${tone}`; }
  }

  _toggleListen() {
    if (this.mode !== 'choose') return;
    if (speech.status === 'listening') { speech.abort(); return; }
    if (!speech.usable) return;
    voice.stop();
    const options = this.current;
    const matchable = options.map((o) => ({ id: o.id, phrases: o.phrases || [o.en], keys: o.keys }));
    const tryMatch = (alts, final) => {
      const m = matchOptions(alts, matchable);
      if (m) {
        const opt = options.find((o) => o.id === m.option.id);
        this._setHeard(`“${m.transcript}” ✓`, 'good');
        sfx.good();
        this._pick(opt, 'speech', m.transcript);
        return true;
      }
      if (final) {
        sfx.deny();
        this._shakeCards();
        this._setHeard(`I heard “${alts[0]}”. Try again, or tap a card!`, 'retry');
      } else {
        this._setHeard(`…${alts[0]}`, '');
      }
      return false;
    };
    const ok = speech.listen({
      onInterim: (alts, isFinal) => { if (this.mode === 'choose') tryMatch(alts, false); },
      onResult: (alts) => { if (this.mode === 'choose') tryMatch(alts, true); },
      onError: (kind) => {
        if (this.mode !== 'choose') return;
        const msg = {
          'no-speech': 'I didn’t hear anything. Try again!  もう一度言ってみよう！',
          timeout: 'Time’s up! Tap 🎤 to try again.  もう一度🎤をタップ！',
          denied: MIC_REASON.denied.en,
          'no-mic': MIC_REASON['no-mic'].en,
          network: MIC_REASON.network.en + ' Tap a card!',
          error: 'Something went wrong. Tap a card!',
        }[kind] || 'Try again!';
        this._setHeard(msg, 'retry');
      },
    });
    if (ok) { sfx.micOn(); this._renderMic(); }
  }

  _shakeCards() {
    this.cards.classList.remove('shake');
    void this.cards.offsetWidth;
    this.cards.classList.add('shake');
  }
}
