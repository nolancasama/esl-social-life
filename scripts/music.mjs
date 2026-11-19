// Procedural music state and real settings UI, with deterministic speech mocks.
// Audio is never compared: assertions read the engine's frozen public snapshot.
import os from 'node:os';
import path from 'node:path';
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const { browser, page } = await launch();
const H = harness(page, process.env.SHOTS_DIR || path.join(os.tmpdir(), 'esl-music'));
const { expect, shot, pump, settle } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const music = () => ev(() => window.__esl.music);

await page.addInitScript(() => {
  window.__voiceHold = false;
  window.__utterances = [];
  const synth = {
    current: null,
    getVoices: () => [{ name: 'Test English', lang: 'en-US', localService: true }],
    addEventListener() {},
    cancel() { this.current = null; /* Some browsers omit callbacks on cancel. */ },
    speak(u) {
      this.current = u;
      window.__utterances.push(u);
      if (!window.__voiceHold) setTimeout(() => u.onend?.(), 10);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  class FakeSR {
    static async available() { return 'available'; }
    constructor() { this.processLocally = false; }
    start() { window.__recognizer = this; this.onstart?.(); }
    stop() { this.onend?.(); }
    abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
});

try {
  // A fresh browser context has neither a saved profile nor a user gesture.
  const fresh = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const beforeGesture = await fresh.newPage();
    await beforeGesture.goto(base + '/?autostart=sample&name=BeforeGesture');
    await beforeGesture.waitForFunction(() => window.__esl?.music.theme === 'classroom', null, { timeout: 30000 });
    expect(await beforeGesture.evaluate(() => !window.__esl.music.playing), 'autostart cannot start music before a user gesture');
  } finally { await fresh.close(); }
  await page.goto(base);
  await page.locator('.teacher-btn').waitFor();
  await page.locator('.teacher-btn').hover();
  await page.mouse.down();
  await page.locator('[aria-label="Default music"]').waitFor();
  await page.mouse.up();
  await page.getByLabel('Default music', { exact: true }).selectOption('0.4');
  await page.locator('.tclose').click();
  expect(await ev(async () => (await import('/src/core/store.js')).loadClass().settings.musicDefault === 0.4), 'Teacher Setup saves the class music default');
  await page.locator('.profile.new').click();
  await page.locator('.nameinput').fill('Music Test');
  await page.locator('.cnext').click();
  await page.locator('.cnext').click();
  await page.locator('.cnext.go').click();
  await page.waitForFunction(() => window.__esl?.music, null, { timeout: 30000 });
  expect(await ev(() => window.__esl.settings.music === 0.4) && (await music()).volume === 0.4, 'a genuinely new profile inherits the Teacher Setup music default');
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { max: 80, label: 'welcome' }), 'the new profile completes its welcome');
  await settle();
  expect(await ev(() => Object.isFrozen(window.__esl.music)), 'music test snapshot is read-only');

  // Scene-entry fixtures exercise the normal scene lifecycle without walking
  // several long routes; no engine state or theme is set by the test.
  const themes = [];
  await ev(() => { window.__esl.friendHouseNpc = window.__esl.world.npcs[0]; });
  for (const scene of ['town', 'cafe', 'mall', 'classroom', 'home', 'friendhouse', 'musicroom', 'gym', 'artroom']) {
    await ev((scene) => window.__esl.enterScene(scene, 'door', { fade: false, banner: false }), scene);
    const s = await music();
    themes.push(s.theme);
    expect(s.theme === scene, `${scene} selects its own music loop`);
  }
  expect(new Set(themes).size === themes.length, 'place loops have distinct theme identities');
  expect((await music()).playing, 'music starts after the title/creator user gestures');

  await ev(() => window.__esl.menus.open('settings'));
  const slider = page.getByLabel('Music', { exact: true });
  await slider.fill('0.3');
  await slider.dispatchEvent('input');
  await slider.dispatchEvent('change');
  expect((await music()).volume === 0.3, 'Music slider applies the chosen level');
  const sfxRow = page.locator('.setrow').filter({ hasText: 'Sound effects' });
  await sfxRow.locator('button.toggle').click();
  expect(await ev(async () => (await import('/src/core/audio.js')).isMuted()), 'Sound effects toggle mutes the effects bus');
  expect((await music()).playing && (await music()).volume === 0.3, 'muting effects leaves music playing at its own volume');
  await shot('music-settings');
  await page.reload();
  await page.locator('.profile:not(.new)').first().click();
  await page.waitForFunction(() => window.__esl?.music, null, { timeout: 30000 });
  expect(await ev(() => window.__esl.settings.music === 0.3 && window.__esl.settings.sfx === false) && (await music()).volume === 0.3, 'player music volume and effects mute survive reload');
  // This profile has not finished the introduction tutorial, so reloading
  // replays its welcome. Finish that flow before exercising speech or lessons.
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { max: 80, label: 'reloaded welcome' }), 'reloaded welcome finishes before speech and lesson checks');
  await settle();

  await ev(async () => {
    const { voice } = await import('/src/dialogue/voice.js');
    voice.stop();
    window.__voiceHold = true;
    voice.speak('A quiet English line.');
  });
  expect((await music()).ducked && !(await music()).paused, 'read-aloud ducks music');
  await ev(() => window.speechSynthesis.current.onend());
  expect(!(await music()).ducked, 'read-aloud end restores music');
  await ev(async () => { (await import('/src/dialogue/voice.js')).voice.speak('Please try again.'); });
  await ev(() => window.speechSynthesis.current.onerror({ error: 'synthesis-failed' }));
  expect(!(await music()).ducked, 'read-aloud error restores music');
  await ev(async () => {
    const { voice } = await import('/src/dialogue/voice.js');
    voice.speak('First line.');
    window.__oldUtterance = window.speechSynthesis.current;
    voice.speak('Replacement line.');
    window.__oldUtterance.onend();
  });
  expect((await music()).ducked, 'a late callback from interrupted speech cannot release the replacement duck');
  await ev(async () => (await import('/src/dialogue/voice.js')).voice.stop());
  expect(!(await music()).ducked, 'explicit read-aloud cancellation restores music even without browser callbacks');

  await ev(async () => {
    const { SpeechInput } = await import('/src/dialogue/speech.js');
    window.__musicMic = new SpeechInput();
    await window.__musicMic.configure('local', true);
    window.__musicMic.listen();
  });
  expect((await music()).paused, 'a listening mocked microphone pauses music');
  await ev(async () => { (await import('/src/dialogue/voice.js')).voice.speak('Overlapping read-aloud.'); });
  expect((await music()).paused && (await music()).ducked, 'microphone pause and read-aloud duck can overlap');
  await ev(() => window.__musicMic.abort());
  expect(!(await music()).paused && (await music()).ducked, 'ending the microphone preserves an active read-aloud duck');
  await ev(async () => (await import('/src/dialogue/voice.js')).voice.stop());
  expect(!(await music()).paused && !(await music()).ducked && (await music()).playing, 'both speech paths restore normal music');
  await ev(() => { window.__musicMic.listen(); window.__recognizer.onerror({ error: 'network' }); window.__recognizer.onend(); });
  expect(!(await music()).paused, 'recognition error/end restores music');

  // One normal music-room lesson proves the shared Music Time lifecycle.
  // Read-aloud is disabled here so only the real hobby activity can duck music.
  await ev(async () => {
    const g = window.__esl;
    window.__voiceHold = false;
    g.settings.voice = false;
    g.applySettings();
    g.world.save.flags.fd = 'done';
    g.world.save.time = { day: 2, period: 0 }; // Wednesday: music in period 1
    g.world.ensureDaily();
    g.hud.queue.length = 0;
    await g.enterSchoolMorning();
  });
  await settle();
  expect(!(await music()).ducked, 'idle music room has no activity duck');
  await page.locator('.waitbtn').click();
  expect(await pump(() => page.locator('.act-btn').isVisible().catch(() => false), { max: 60, label: 'music lesson intro', prefer: ['OK!', 'Yes, I can!'] }), 'normal music-room lesson reaches the reused rhythm meter');
  expect(await ev(() => window.__esl.sceneId === 'musicroom') && (await music()).ducked && !(await music()).paused, 'Music Time ducks the background with read-aloud disabled');
  await shot('music-room-rhythm-duck');
  expect(await pump(() => ev(() => {
    const g = window.__esl;
    return g.mode === 'explore' && g.sceneId === 'town' && g.world.period === 1;
  }), { max: 150, label: 'music lesson', prefer: ['You can sing well, too!', 'Thank you! See you!'] }), 'rhythm controls and lesson goodbye complete normally');
  expect(!(await music()).ducked && !(await music()).paused && (await music()).playing, 'completing Music Time restores normal background music');
  await ev(() => { window.__esl.settings.voice = true; window.__esl.applySettings(); });
} catch (err) {
  H.errors.push(err.stack || String(err));
} finally {
  await browser.close();
}
if (H.errors.length) {
  console.error('\nMUSIC CHECKS FAILED:', H.errors.join('\n'));
  process.exit(1);
}
console.log('\nMUSIC CHECKS PASSED');
