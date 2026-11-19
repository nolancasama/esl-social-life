// Quiet procedural pentatonic loops. One look-ahead clock schedules audio time,
// not one JavaScript timer per note; at most a melody and a soft bass overlap.
import { audioContext, onAudioUnlock } from './audio.js';

export const QUIET_MUSIC = 0.2;
export function musicLevel(value, fallback = QUIET_MUSIC) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
const THEMES = {
  town:       { bpm: 84, root: 60, notes: [0, 2, 4, 2, 1, 0, 3, 1] },
  classroom:  { bpm: 76, root: 60, notes: [2, 1, 0, 1, 3, 2, 1, 0] },
  cafe:       { bpm: 78, root: 57, notes: [0, 3, 2, 4, 3, 1, 2, 0] },
  home:       { bpm: 70, root: 55, notes: [2, 0, 1, 0, 3, 1, 2, 0] },
  mall:       { bpm: 92, root: 62, notes: [0, 1, 3, 2, 4, 3, 1, 2] },
  friendhouse:{ bpm: 80, root: 57, notes: [1, 3, 2, 0, 2, 4, 3, 0] },
  musicroom:  { bpm: 80, root: 60, notes: [0, 2, 3, 4, 3, 2, 1, 0] },
  gym:        { bpm: 96, root: 55, notes: [0, 2, 0, 3, 1, 4, 2, 1] },
  artroom:    { bpm: 74, root: 62, notes: [4, 2, 3, 1, 2, 0, 1, 3] },
};
const SCALE = [0, 2, 4, 7, 9];
const holds = { mic: new Set(), voice: new Set(), activity: new Set() };
let theme = null, volume = QUIET_MUSIC, context = null, bus = null, track = null, timer = null;
const retiring = new Set();

function paused() { return holds.mic.size > 0; }
function ducked() { return holds.voice.size > 0 || holds.activity.size > 0; }
function audible() { return theme && volume > 0 && !paused() && context?.state === 'running'; }
function ramp(param, value, seconds) {
  const now = context.currentTime;
  param.cancelAndHoldAtTime(now);
  param.linearRampToValueAtTime(value, now + seconds);
}
function update() {
  if (!bus) return;
  const factor = paused() ? 0 : holds.activity.size ? 0.025 : holds.voice.size ? 0.15 : 1;
  ramp(bus.gain, volume * factor, paused() || ducked() ? 0.12 : 0.6);
  clearTimeout(timer); timer = null;
  if (audible()) { if (track) track.next = Math.max(track.next, context.currentTime + 0.03); schedule(); }
}
function attach(c) {
  if (!context) {
    context = c;
    bus = c.createGain(); bus.gain.value = 0; bus.connect(c.destination);
    c.addEventListener('statechange', update);
  }
  if (theme && !track) track = makeTrack(theme);
  update();
}
onAudioUnlock(attach);

function makeTrack(id) {
  const gain = context.createGain(); gain.gain.value = 0; gain.connect(bus);
  const t = { id, gain, next: context.currentTime + 0.04, step: 0, nodes: new Set(), cleanup: null };
  ramp(gain.gain, 1, 1);
  return t;
}
function dispose(t) {
  clearTimeout(t.cleanup);
  for (const o of t.nodes) { try { o.stop(); } catch { /* already ended */ } }
  t.gain.disconnect(); retiring.delete(t);
}
function note(t, midi, when, duration, level, type = 'sine') {
  const o = context.createOscillator(), g = context.createGain();
  o.type = type; o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + 0.16);
  g.gain.linearRampToValueAtTime(0, when + duration);
  o.connect(g).connect(t.gain); t.nodes.add(o);
  o.onended = () => { o.disconnect(); g.disconnect(); t.nodes.delete(o); };
  o.start(when); o.stop(when + duration + 0.02);
}
function schedule() {
  if (!audible() || !track) return;
  const t = track, score = THEMES[t.id], beat = 60 / score.bpm;
  // Recover after a background-tab stall without playing a backlog.
  t.next = Math.max(t.next, context.currentTime + 0.015);
  while (t.next < context.currentTime + 0.25) {
    note(t, score.root + SCALE[score.notes[t.step % 8]], t.next, beat * 2.3, 0.095, 'triangle');
    if (t.step % 2 === 0) note(t, score.root - 12 + (t.step % 8 >= 4 ? 7 : 0), t.next, beat * 3.4, 0.075);
    t.step++; t.next += beat * 2;
  }
  timer = setTimeout(schedule, 100);
}
export function setMusicTheme(place) {
  const next = place == null ? null : Object.hasOwn(THEMES, place) ? place : 'town';
  if (next === theme) return;
  theme = next;
  if (track) {
    const old = track; retiring.add(old); ramp(old.gain.gain, 0, 1);
    old.cleanup = setTimeout(() => dispose(old), 1100); track = null;
  }
  const c = audioContext();
  if (c) attach(c);
}
export function setMusicVolume(value) { volume = musicLevel(value); update(); }
// Each owner releases only its own hold. Late end/error events are harmless.
export function holdMusic(reason) {
  const token = {}; holds[reason].add(token); update();
  return () => { if (holds[reason].delete(token)) update(); };
}
export function stopMusic() {
  theme = null; clearTimeout(timer); timer = null;
  if (track) { dispose(track); track = null; }
  for (const t of retiring) dispose(t);
}
export function musicSnapshot() {
  return Object.freeze({ theme, playing: Boolean(audible() && track), paused: paused(), ducked: ducked(), volume });
}
