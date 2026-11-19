// Synthesized sound effects (no audio files). Everything the game says with
// sound is also said with text or motion, so muted classrooms lose nothing.

let ctx = null;
let master = null;
let volume = 0.55;
let muted = false;
const unlockListeners = new Set();
let unlocked = false;

// Music shares the context, never the sound-effects master gain. This accessor
// does not create a context: music must wait for unlockAudio's user gesture.
export function audioContext() { return unlocked ? ctx : null; }
export function onAudioUnlock(fn) { unlockListeners.add(fn); return () => unlockListeners.delete(fn); }

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  unlocked = true;
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (c) for (const fn of unlockListeners) fn(c);
}

export function setVolume(v) { volume = v; if (master) master.gain.value = muted ? 0 : volume; }
export function setMuted(m) { muted = m; if (master) master.gain.value = muted ? 0 : volume; }
export function isMuted() { return muted; }

function tone(freq, { start = 0, dur = 0.12, type = 'sine', gain = 0.25, slide = 0, attack = 0.005 } = {}) {
  const c = ensure();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ start = 0, dur = 0.15, gain = 0.15, filter = 1200 } = {}) {
  const c = ensure();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export const sfx = {
  click() { tone(880, { dur: 0.06, type: 'triangle', gain: 0.12 }); },
  select() { tone(660, { dur: 0.07, type: 'triangle', gain: 0.14 }); tone(990, { start: 0.05, dur: 0.09, type: 'triangle', gain: 0.12 }); },
  blip(pitch = 1) { tone(420 * pitch, { dur: 0.035, type: 'square', gain: 0.03 }); },
  open() { tone(520, { dur: 0.1, type: 'sine', gain: 0.12, slide: 240 }); },
  close() { tone(700, { dur: 0.1, type: 'sine', gain: 0.1, slide: -260 }); },
  deny() { tone(220, { dur: 0.12, type: 'triangle', gain: 0.14 }); tone(180, { start: 0.08, dur: 0.14, type: 'triangle', gain: 0.12 }); },
  good() { [0, 2, 4].forEach((n, i) => tone(NOTES[n], { start: i * 0.07, dur: 0.18, type: 'triangle', gain: 0.16 })); },
  great() { [0, 2, 4, 7].forEach((n, i) => tone(NOTES[n], { start: i * 0.08, dur: 0.24, type: 'triangle', gain: 0.17 })); },
  /** One melody note for Music Time (index into the scale). */
  note(i = 0) { tone(NOTES[((i % NOTES.length) + NOTES.length) % NOTES.length], { dur: 0.26, type: 'triangle', gain: 0.16 }); },
  levelUp() {
    [0, 2, 4, 5, 7].forEach((n, i) => tone(NOTES[n], { start: i * 0.09, dur: 0.3, type: 'triangle', gain: 0.18 }));
    tone(NOTES[7], { start: 0.5, dur: 0.6, type: 'sine', gain: 0.12 });
  },
  discover() { tone(988, { dur: 0.08, type: 'sine', gain: 0.14 }); tone(1318, { start: 0.07, dur: 0.16, type: 'sine', gain: 0.12 }); },
  message() { tone(1046, { dur: 0.09, type: 'sine', gain: 0.12 }); tone(1318, { start: 0.1, dur: 0.12, type: 'sine', gain: 0.1 }); },
  whoosh() { noise({ dur: 0.35, gain: 0.08, filter: 900 }); },
  door() { tone(300, { dur: 0.08, type: 'square', gain: 0.05 }); noise({ start: 0.02, dur: 0.12, gain: 0.06, filter: 600 }); },
  kick() { tone(140, { dur: 0.09, type: 'sine', gain: 0.3, slide: -60 }); noise({ dur: 0.06, gain: 0.08, filter: 1800 }); },
  catch() { tone(200, { dur: 0.07, type: 'sine', gain: 0.25, slide: -80 }); noise({ dur: 0.05, gain: 0.1, filter: 2500 }); },
  bounce() { tone(180, { dur: 0.06, type: 'sine', gain: 0.18, slide: -40 }); },
  pop() { tone(600, { dur: 0.06, type: 'sine', gain: 0.18, slide: 500 }); },
  sparkle() { [5, 6, 7].forEach((n, i) => tone(NOTES[n], { start: i * 0.05, dur: 0.12, type: 'sine', gain: 0.08 })); },
  chime() { tone(784, { dur: 0.4, type: 'sine', gain: 0.12 }); tone(1046, { start: 0.18, dur: 0.5, type: 'sine', gain: 0.1 }); },
  bell() { [0, 4, 2, 0].forEach((n, i) => tone(NOTES[n] / 2, { start: i * 0.32, dur: 0.5, type: 'sine', gain: 0.14 })); },
  micOn() { tone(700, { dur: 0.06, type: 'sine', gain: 0.1 }); tone(1050, { start: 0.06, dur: 0.08, type: 'sine', gain: 0.1 }); },
  micOff() { tone(900, { dur: 0.06, type: 'sine', gain: 0.08 }); tone(600, { start: 0.06, dur: 0.08, type: 'sine', gain: 0.08 }); },
  eat() { tone(320, { dur: 0.05, type: 'triangle', gain: 0.08 }); tone(280, { start: 0.12, dur: 0.05, type: 'triangle', gain: 0.08 }); },
  step() { noise({ dur: 0.04, gain: 0.025, filter: 500 }); },
};
