// Read-aloud for English lines (speechSynthesis). Only voices that run on
// the device are used unless the teacher allows online services, because a
// cloud voice would receive the text (which can contain classmates' names).

import { holdMusic } from '../core/music.js';

const PREFERRED = ['Samantha', 'Ava', 'Allison', 'Susan', 'Chrome OS US English', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira', 'Karen', 'Moira'];

function strip(text) {
  return String(text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class Voice {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis || null : null;
    this.enabled = true;
    this.allowOnline = false;
    this.voice = null;
    this.finishSpeech = null;
    if (this.synth) {
      this._pick();
      this.synth.addEventListener?.('voiceschanged', () => this._pick());
    }
  }

  _pick() {
    if (!this.synth) return;
    const all = this.synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    const ok = all.filter((v) => v.localService || this.allowOnline);
    const score = (v) => {
      let s = 0;
      if (/en[-_]US/i.test(v.lang)) s += 4;
      const i = PREFERRED.findIndex((n) => v.name.includes(n));
      if (i >= 0) s += 10 - i * 0.5;
      if (v.localService) s += 1;
      return s;
    };
    ok.sort((a, b) => score(b) - score(a));
    this.voice = ok[0] || null;
  }

  setAllowOnline(on) { this.allowOnline = Boolean(on); this._pick(); }

  get available() { return Boolean(this.synth && this.voice); }

  speak(text, { pitch = 1.15, rate = 0.92 } = {}) {
    if (!this.enabled || !this.available) return Promise.resolve();
    const clean = strip(text);
    if (!clean) return Promise.resolve();
    this.stop();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(clean);
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.pitch = Math.max(0.5, Math.min(2, pitch));
      u.rate = Math.max(0.6, Math.min(1.2, rate));
      const releaseMusic = holdMusic('voice');
      let finished = false;
      let timer;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        releaseMusic();
        if (this.finishSpeech === done) this.finishSpeech = null;
        resolve();
      };
      this.finishSpeech = done;
      u.onend = done;
      u.onerror = done;
      timer = setTimeout(done, 9000);
      try { this.synth.speak(u); } catch { done(); }
    });
  }

  stop() {
    this.finishSpeech?.();
    try { this.synth?.cancel(); } catch { /* ignore */ }
  }
}

export const voice = new Voice();
