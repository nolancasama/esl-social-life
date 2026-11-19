// Optional speech input (Web Speech API) with a clear, separate status for
// every way it can be unavailable. Tapping a card always works, so nothing
// here can block progress, and nothing here ever touches friendship.
//
// Privacy: Chrome's classic speech recognition streams audio to a cloud
// service. The default policy is 'local' (on-device recognition only, when the
// browser supports it). A teacher can opt in to 'online' in Teacher Setup.

import { holdMusic } from '../core/music.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const SESSION_MS = 8000;

export const MIC_REASON = {
  unsupported: { en: 'This browser has no speech input. Tap a card to answer.', ja: 'このブラウザでは音声入力が使えません。カードをタップしてね。' },
  denied: { en: 'The microphone is blocked. Tap a card to answer.', ja: 'マイクが使えません。カードをタップしてね。' },
  'no-mic': { en: 'No microphone found. Tap a card to answer.', ja: 'マイクが見つかりません。カードをタップしてね。' },
  policy: { en: 'Speech input is turned off in Teacher Setup.', ja: '音声入力は先生の設定でオフです。' },
  'no-local': { en: 'Speech input on this device needs Teacher Setup.', ja: 'この機械で話すには先生の設定が必要です。' },
  network: { en: 'Speech service is not reachable right now.', ja: '音声サービスに接続できません。' },
};

async function detectOnDevice() {
  if (!SR) return 'unavailable';
  try {
    if (typeof SR.available === 'function') return await SR.available({ langs: ['en-US'], processLocally: true });
    if (typeof SR.availableOnDevice === 'function') return await SR.availableOnDevice('en-US');
  } catch { /* fall through */ }
  return 'unknown';
}

export class SpeechInput {
  constructor() {
    this.policy = 'local';
    this.userOn = false;        // the student's mic toggle
    this.status = 'off';        // 'off' | 'ready' | 'listening' | 'unavailable' | 'setup'
    this.reason = '';
    this.onDevice = 'unknown';
    this.session = null;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  get supported() { return Boolean(SR); }
  get usable() { return this.status === 'ready' || this.status === 'listening'; }

  _set(status, reason = '') { this.status = status; this.reason = reason; this._emit(); }

  async configure(policy, userOn) {
    if (this.session && (policy !== this.policy || userOn === false)) this.abort();
    this.policy = policy;
    if (userOn !== undefined) this.userOn = userOn;
    if (!SR) return this._set('unavailable', 'unsupported');
    if (policy === 'off') return this._set('unavailable', 'policy');
    this.onDevice = await detectOnDevice();
    if (this.onDevice === 'downloadable' || this.onDevice === 'downloading') {
      if (policy === 'online') return this._set(this.userOn ? 'ready' : 'off');
      return this._set('setup');
    }
    if (policy === 'local' && this.onDevice !== 'available') return this._set('unavailable', 'no-local');
    return this._set(this.userOn ? 'ready' : 'off');
  }

  /** One-time on-device language pack install. Must run from a user gesture. */
  async installLocal() {
    try {
      if (typeof SR.install === 'function') await SR.install({ langs: ['en-US'], processLocally: true });
      else if (typeof SR.installOnDevice === 'function') await SR.installOnDevice('en-US');
    } catch (err) { console.warn('[speech] install failed', err); }
    await this.configure(this.policy, true);
  }

  /** The student's mic button. Turning it off is never a failure. */
  setUserOn(on) {
    this.userOn = Boolean(on);
    if (!this.userOn) this.abort();
    if (this.status === 'off' || this.status === 'ready') this._set(this.userOn ? 'ready' : 'off');
  }

  abort() {
    if (this.session) {
      const session = this.session;
      session.silent = true;
      try { session.rec.abort(); } catch { /* ignore */ }
      session.finish();
    }
  }

  /**
   * Start one press-to-talk session.
   * handlers: onInterim(alts), onResult(alts), onError(kind), onEnd()
   * kinds: 'no-speech' | 'timeout' | 'denied' | 'no-mic' | 'network' | 'error'
   */
  listen(handlers = {}) {
    if (!this.usable || !SR) return false;
    if (this.session) this.abort();
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    const preferLocal = this.onDevice === 'available';
    if (preferLocal) {
      if ('processLocally' in rec) rec.processLocally = true;
      else if ('mode' in rec) rec.mode = 'ondevice-only';
    } else if (this.policy !== 'online') {
      return false;
    }
    const s = { rec, silent: false, finalAlts: null, interimAlts: null, errored: false, finished: false };
    this.session = s;
    const releaseMusic = holdMusic('mic');
    let fallback;
    const timer = setTimeout(() => {
      try { rec.stop(); } catch { /* ignore */ }
      // Some implementations never deliver onend after stop or a service error.
      if (!s.finished) fallback = setTimeout(() => s.finish(), 500);
    }, SESSION_MS);
    s.finish = () => {
      if (s.finished) return;
      s.finished = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      releaseMusic();
      if (this.session === s) {
        this.session = null;
        if (this.status === 'listening') this._set(this.userOn ? 'ready' : 'off');
      }
      if (!s.silent) {
        const alts = s.finalAlts || s.interimAlts;
        if (alts) handlers.onResult?.(alts);
        else if (!s.errored) handlers.onError?.('timeout');
      }
      handlers.onEnd?.({ aborted: s.silent });
    };

    rec.onresult = (ev) => {
      if (s.finished) return;
      const result = ev.results[ev.results.length - 1];
      if (!result) return;
      const alts = [];
      for (let i = 0; i < Math.min(result.length, 5); i++) if (result[i]?.transcript) alts.push(result[i].transcript);
      if (!alts.length) return;
      if (result.isFinal) s.finalAlts = alts; else s.interimAlts = alts;
      if (!s.silent) handlers.onInterim?.(alts, result.isFinal);
    };
    rec.onerror = (ev) => {
      releaseMusic();
      if (s.finished) return;
      const e = ev?.error;
      if (e === 'aborted' || s.silent) { s.silent = true; s.finish(); return; }
      s.errored = true;
      if (e === 'no-speech') handlers.onError?.('no-speech');
      else if (e === 'not-allowed' || e === 'service-not-allowed') { this._set('unavailable', 'denied'); handlers.onError?.('denied'); }
      else if (e === 'audio-capture') { this._set('unavailable', 'no-mic'); handlers.onError?.('no-mic'); }
      else if (e === 'network') handlers.onError?.('network');
      else if (e === 'language-not-supported') { this._set('unavailable', 'no-local'); handlers.onError?.('error'); }
      else handlers.onError?.('error');
      s.finish();
    };
    rec.onend = s.finish;
    try {
      rec.start();
      this._set('listening');
      return true;
    } catch (err) {
      clearTimeout(timer);
      clearTimeout(fallback);
      releaseMusic();
      s.finished = true;
      this.session = null;
      console.warn('[speech] start failed', err);
      handlers.onError?.('error');
      return false;
    }
  }
}

export const speech = new SpeechInput();
