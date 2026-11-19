import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './ui/base.css';
import './ui/ui.css';

import { Renderer } from './engine/renderer.js';
import * as store from './core/store.js';
import { buildClass, chooseFirstPair } from './world/generator.js';
import { meet } from './world/relationships.js';
import { assignStyles } from './world/personality.js';
import { migrateSave } from './world/migrate.js';
import { logExpr } from './world/progression.js';
import { DEFAULT_ROSTER } from './data/roster.js';
import { interest, ability, dateText } from './data/content.js';
import { makeId } from './core/util.js';
import { musicLevel } from './core/music.js';
import { unlockAudio } from './core/audio.js';

// Covers keyboard/touch entry as well as title buttons, including test autostart.
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui');

function ensureClass() {
  let cls = store.loadClass();
  if (!cls || !Array.isArray(cls.npcs) || cls.npcs.length < 2) {
    const seed = Math.random().toString(36).slice(2, 10);
    const roster = DEFAULT_ROSTER.map((r) => ({ ...r }));
    cls = { version: 1, seed, roster, npcs: buildClass(roster, seed), settings: {}, createdAt: Date.now() };
  }
  cls.settings = { speech: 'local', japanese: true, className: '5-1', ...(cls.settings || {}) };
  // Classes saved before behaviour styles existed get them now (nothing else changes).
  assignStyles(cls.npcs, cls.seed);
  store.saveClass(cls);
  return cls;
}

function newSave(cls, { name, rosterId, look, like, can, birthday }) {
  const id = makeId('p');
  const excluded = rosterId ? [rosterId] : [];
  const pair = chooseFirstPair(cls.npcs, excluded, id);
  const save = {
    version: 1, id, createdAt: Date.now(), updatedAt: Date.now(),
    player: { name, look, likes: [like], intro: { like, can }, birthday },
    excluded,
    time: { day: 0, period: 0 },
    rel: {}, npcLinks: {}, discoveredLinks: [], plans: [], messages: [], memories: [], souvenirs: [],
    lang: { expr: {}, areas: {} }, daily: null,
    flags: { fd: pair.firstFriend && pair.intro ? 'start' : 'done' },
    firstFriend: pair.firstFriend, introNpc: pair.intro, heard: [], weatherOverrides: {}, eveningQueue: [],
    settings: { japanese: cls.settings.japanese !== false, voice: true, readAnswers: true, sfx: true, quality: 'auto', mic: false, music: musicLevel(cls.settings.musicDefault) },
    stats: { activities: 0 },
  };
  migrateSave(save);
  if (pair.firstFriend) {
    // The player already knows one friendly classmate (a neighbour).
    meet(save, pair.firstFriend, 0);
    save.rel[pair.firstFriend].metDay = -1;
  }
  const it = interest(like), ab = ability(can);
  logExpr(save, { id: 'a.myname', area: 'selfintro', template: 'My name is ___.', example: `My name is ${name}.` }, 'said', 0);
  logExpr(save, { id: 'a.like', area: 'selfintro', template: 'I like ___.', example: `I like ${it.en}.` }, 'said', 0);
  logExpr(save, { id: 'a.birthday', area: 'selfintro', template: 'My birthday is ___.', example: `My birthday is ${dateText(birthday.m, birthday.d)}.` }, 'said', 0);
  logExpr(save, { id: 'a.can', area: 'selfintro', template: 'I can ___.', example: `I can ${ab.en}.` }, 'said', 0);
  return save;
}

async function boot() {
  try { await document.fonts?.ready; } catch { /* ignore */ }
  if (params.get('view')) {
    const { runViewer } = await import('./dev/viewer.js');
    runViewer(params.get('view'), params);
    return;
  }
  const renderer = new Renderer(document.getElementById('stage'));
  const { Stage, titleScreen, teacherScreen, creatorScreen } = await import('./ui/screens.js');
  const { Game } = await import('./game/game.js');
  let cls = ensureClass();
  const stage = new Stage(renderer);

  const portraits = new Map();
  const portrait = (look, key = null) => {
    const k = key || JSON.stringify(look);
    if (!portraits.has(k)) portraits.set(k, renderer.portrait(look));
    return portraits.get(k);
  };

  let close = null;
  const clear = () => { close?.(); close = null; };

  const showTitle = () => {
    clear();
    stage.showTown();
    close = titleScreen(ui, {
      cls,
      portrait: (look) => portrait(look),
      onNew: showCreator,
      onContinue: (id) => {
        const save = store.loadSave(id);
        if (!save) { store.deleteProfile(id); showTitle(); return; }
        startGame(save);
      },
      onTeacher: showTeacher,
    });
  };

  const showTeacher = () => {
    clear();
    close = teacherScreen(ui, { cls, portrait: (look, key) => { portraits.delete(key); return portrait(look, key); }, onDone: () => { cls = ensureClass(); showTitle(); } });
  };

  const showCreator = () => {
    clear();
    close = creatorScreen(ui, {
      cls, stage,
      onCancel: showTitle,
      onDone: (data) => {
        const save = newSave(cls, data);
        store.writeSave(save);
        store.upsertProfile({ id: save.id, name: save.player.name, look: save.player.look, day: 0, lastPlayed: Date.now() });
        startGame(save);
      },
    });
  };

  const startGame = async (save) => {
    clear();
    stage.stop();
    const game = new Game({ renderer, uiRoot: ui, cls, save, onQuit: () => location.reload(), portraitFn: portrait });
    game.onMirror = () => {
      game.paused = true;
      game.setMode('menu');
      const mirrorStage = new Stage(renderer);
      const restore = () => {
        mirrorStage.stop();
        const amb = game.scene.ambience(game.world.period, game.world.weather, game.world.day);
        renderer.setWorld(game.scene.root, amb);
        game.paused = false;
        game.camera.snap();
        game.setMode('explore');
      };
      creatorScreen(ui, {
        cls, stage: mirrorStage, editLook: save.player.look,
        onCancel: restore,
        onDone: ({ look }) => {
          save.player.look = look;
          game.player.setLook(look);
          game.player.char.showBag(false);
          game.save(true);
          restore();
          game.hud.toast({ icon: '🪞', en: 'Looking good!', ja: 'にあってる！' });
        },
      });
    };
    await game.start();
    if (params.has('debug')) { const { showFps } = await import('./ui/debug.js'); showFps(game); }
  };

  if (params.get('autostart') === 'sample' && !store.listProfiles().length) {
    // Test hook: create a sample player without the UI (used by scripts/playthrough.mjs).
    const save = newSave(cls, { name: params.get('name') || 'Rio', rosterId: null, look: (await import('./ui/screens.js')).randomPlayerLook(), like: 'soccer', can: 'swim_fast', birthday: { m: 5, d: 10 } });
    store.writeSave(save);
    store.upsertProfile({ id: save.id, name: save.player.name, look: save.player.look, day: 0, lastPlayed: Date.now() });
    startGame(save);
    return;
  }
  showTitle();
  window.__eslReady = true;
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#1E2230;color:#fff;font:700 20px system-ui;padding:24px;text-align:center">Sorry, the game could not start on this device.<br><small style="opacity:.7">${String(err?.message || err)}</small></div>`);
});
