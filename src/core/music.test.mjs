import test from 'node:test';
import assert from 'node:assert/strict';
import { unlockAudio, setMuted } from './audio.js';
import { holdMusic, musicSnapshot, setMusicTheme, setMusicVolume, stopMusic } from './music.js';

test('music unlock, look-ahead, crossfade, holds and oscillator cleanup', () => {
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 0, nextId = 0, context;
  const timers = new Map();
  globalThis.setTimeout = (fn, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { at: now + delay / 1000, fn });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const advance = (seconds) => {
    const end = now + seconds;
    while (true) {
      const due = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    now = end;
  };
  class Param {
    value = 0;
    ramps = [];
    setValueAtTime(value) { this.value = value; }
    cancelAndHoldAtTime() {}
    linearRampToValueAtTime(value, at) { this.value = value; this.ramps.push({ value, at }); }
  }
  class Node {
    disconnected = false;
    connect(target) { this.target = target; return target; }
    disconnect() { this.disconnected = true; }
  }
  class Context {
    state = 'running';
    destination = {};
    gains = [];
    oscillators = [];
    constructor() { context = this; }
    get currentTime() { return now; }
    addEventListener() {}
    createGain() {
      const node = new Node(); node.gain = new Param();
      this.gains.push(node);
      return node;
    }
    createOscillator() {
      const node = new Node(); node.frequency = new Param();
      node.start = (at) => { node.started = at; };
      node.stop = (at = now) => {
        clearTimeout(node.endTimer);
        node.endTimer = setTimeout(() => node.onended?.(), Math.max(0, at - now) * 1000);
      };
      this.oscillators.push(node);
      return node;
    }
  }
  globalThis.window = { AudioContext: Context };
  try {
    setMusicTheme('town');
    assert.equal(context, undefined, 'selecting a theme must wait for a user gesture');
    assert.equal(musicSnapshot().playing, false);
    unlockAudio();
    const [sfxBus, musicBus, firstTrack] = context.gains;
    assert.equal(musicSnapshot().playing, true);
    assert.equal(context.oscillators.length, 2, 'only the immediate look-ahead notes are scheduled');
    assert.equal(firstTrack.gain.ramps[0].at, 1, 'new track fades in over one second');
    setMusicVolume(0.4);
    setMuted(true);
    assert.equal(sfxBus.gain.value, 0);
    assert.equal(musicBus.gain.value, 0.4, 'SFX mute leaves music on its separate bus');

    const releaseVoice = holdMusic('voice');
    const releaseMic1 = holdMusic('mic');
    const releaseMic2 = holdMusic('mic');
    assert.equal(musicBus.gain.value, 0);
    releaseMic1(); releaseMic1();
    assert.equal(musicSnapshot().paused, true, 'duplicate release cannot release another owner');
    releaseMic2();
    assert.equal(musicSnapshot().paused, false);
    assert.equal(musicSnapshot().ducked, true);
    assert.equal(musicBus.gain.value, 0.4 * 0.15, 'voice duck resumes after microphone release');
    const releaseActivity = holdMusic('activity');
    releaseVoice();
    assert.equal(musicBus.gain.value, 0.4 * 0.025);
    releaseActivity();
    assert.equal(musicBus.gain.value, 0.4);

    setMusicTheme('cafe');
    assert.equal(musicSnapshot().theme, 'cafe');
    assert.equal(firstTrack.disconnected, false, 'outgoing track survives the crossfade');
    assert.deepEqual(firstTrack.gain.ramps.at(-1), { value: 0, at: 1 });
    advance(1.2);
    assert.equal(firstTrack.disconnected, true, 'outgoing track is disconnected after fading');
    advance(12);
    const live = context.oscillators.filter((node) => !node.disconnected);
    assert.ok(live.length <= 4, `few simultaneous voices: ${live.length}`);
    assert.ok(context.oscillators.some((node) => node.disconnected), 'ended oscillator nodes are cleaned up');
    assert.equal(timers.size, live.length + 1, 'only oscillator endings and one scheduler remain');
    stopMusic(); advance(0);
    assert.equal(musicSnapshot().playing, false);
    assert.ok(context.oscillators.every((node) => node.disconnected));
    assert.equal(timers.size, 0, 'stopping leaves no scheduler or note timers');
  } finally {
    stopMusic();
    setMuted(false);
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
