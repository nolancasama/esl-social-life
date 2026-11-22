// Game orchestrator: scenes, main loop, interaction, time flow, saving.

import * as THREE from 'three';
import { World } from './world.js';
import { NpcManager } from './npcs.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { CameraRig } from '../engine/camera.js';
import { buildTown } from '../engine/scenes/town.js';
import { buildClassroom } from '../engine/scenes/classroom.js';
import { buildCafe } from '../engine/scenes/cafe.js';
import { buildMall, buildMall2, buildMall3 } from '../engine/scenes/mall.js';
import { buildHome } from '../engine/scenes/home.js';
import { buildFriendHouse } from '../engine/scenes/friendhouse.js';
import { buildMusicRoom, buildGym, buildArtRoom } from '../engine/scenes/schoolrooms.js';
import { lessonForDay } from '../world/school.js';
import { runSchoolLesson } from '../activities/school.js';
import { mallMealSnapshot, mallSeatInteractions, updateMallMeal, eatSoloMallMeal } from '../activities/mall-meal.js';
import { arcadeSnapshot } from '../activities/arcade.js';
import { souvenirMesh } from '../engine/food.js';
import { DialogueUI } from '../dialogue/ui.js';
import { talkToNpc } from '../dialogue/talk.js';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES } from '../dialogue/intent.js';
import { speech } from '../dialogue/speech.js';
import { voice } from '../dialogue/voice.js';
import { HUD } from '../ui/hud.js';
import { Menus } from '../ui/menus.js';
import { Overlay } from '../ui/overlay.js';
import { ActivityHUD } from '../ui/activityhud.js';
import { Activities } from '../activities/index.js';
import { el, wait, clamp, damp } from '../core/util.js';
import { bus } from '../core/events.js';
import { sfx, setMuted } from '../core/audio.js';
import { musicLevel, musicSnapshot, setMusicTheme, setMusicVolume, stopMusic } from '../core/music.js';
import * as store from '../core/store.js';
import { LOCATIONS, DAYS, MONTHS, WEATHER, TIMETABLE, SUBJECTS, timeWords, timeJa, ordinal } from '../data/content.js';
import { MORNING, AFTERNOON, EVENING } from '../world/time.js';
import { migrateSave } from '../world/migrate.js';
import { recoverInterrupted, snapshot, offerEvent, completeEvent, instance, npcFree } from '../world/friendship.js';
import { runEvent, eventTitle } from '../dialogue/events.js';
import { confirmTime } from '../dialogue/common.js';
import { armFault, faultPoint } from '../core/fault.js';
import { recoverGame } from '../activities/recovery.js';

const BUILDERS = { town: buildTown, classroom: buildClassroom, cafe: buildCafe, mall: buildMall, mall2: buildMall2, mall3: buildMall3, home: buildHome, friendhouse: buildFriendHouse, musicroom: buildMusicRoom, gym: buildGym, artroom: buildArtRoom };
const MALL_FLOORS = ['mall', 'mall2', 'mall3'];
const tmpV = new THREE.Vector3();

export class Game {
  constructor({ renderer, uiRoot, cls, save, onQuit, portraitFn }) {
    this.renderer = renderer;
    this.uiRoot = uiRoot;
    this.cls = cls;
    this.onQuit = onQuit;
    this.portraitFn = portraitFn;
    // Every save is upgraded (idempotent) and an event cut off by a reload is
    // returned to its previous state without rewards before the world exists.
    migrateSave(save);
    recoverInterrupted(save);
    this.world = new World(cls, save);
    // Test/debug hooks (devtools only; nothing here is shown to students).
    this.friendshipDebug = {
      offer: (template, npcId, data = {}) => { const i = offerEvent(this.world, { template, npcId, data }); this.save(); return i.id; },
      complete: (id, outcome = {}) => { const r = completeEvent(this.world, id, outcome); this.save(); return { already: r.already, xpGained: r.xpGained ?? 0, levelAfter: r.levelAfter ?? null }; },
      // Make a classmate in this scene come over now (soft approach), ignoring the daily limits.
      approach: (npcId) => { const a = this.npcs.actorFor(npcId); if (!a) return false; this.npcs.approachQueue = [{ actor: a, delay: 0.3, scripted: false }]; return true; },
    };
    this.settings = { japanese: cls.settings?.japanese !== false, voice: true, readAnswers: true, sfx: true, quality: 'auto', mic: false, ...(save.settings || {}) };
    // Older profiles have a quiet fallback; class defaults only seed new saves.
    this.settings.music = musicLevel(this.settings.music);
    this.mode = 'explore';
    this.voice = voice;
    this.camera = new CameraRig(renderer.camera);
    this.input = new Input(renderer.canvas, uiRoot);
    this.dialogue = new DialogueUI(uiRoot, () => this.settings);
    this.overlay = new Overlay(uiRoot);
    this.hud = new HUD(uiRoot, this);
    this.menus = new Menus(uiRoot, this);
    this.activityHud = new ActivityHUD(uiRoot, () => this.settings);
    this.fadeEl = el('div', { class: 'fade' });
    uiRoot.appendChild(this.fadeEl);
    this.npcs = new NpcManager(this);
    this.activities = new Activities(this);
    this.player = new Player(this, save.player.look);
    this.scenes = {};
    this.scene = null;
    this.sceneId = null;
    this.extraInteract = [];
    this.sparkles = [];
    this.activityTick = null;
    this.activityMove = null;
    this.time = 0;
    this.saveTimer = null;
    this.running = false;
    this.disposers = [];

    this.disposers.push(this.input.on('key', (e) => this._key(e)));
    this.disposers.push(this.input.on('tap', (p) => this._tap(p)));
    this.disposers.push(this.input.on('drag', ({ dx }) => { if (this.mode === 'explore') this.camera.rotateBy(-dx * 0.006); }));
    this.disposers.push(bus.on('plan', () => this.hud.refresh()));
    this.disposers.push(bus.on('firstday', () => { this.hud.refresh(); this.save(); }));
    this.disposers.push(bus.on('message', () => { if (this.world.period === EVENING) sfx.message(); }));
    this.applySettings();
    window.__esl = this;
  }

  // ------------------------------------------------------------ settings & saving
  applySettings() {
    setMuted(!this.settings.sfx);
    setMusicVolume(this.settings.music);
    voice.enabled = this.settings.voice;
    if (!voice.enabled) voice.stop();
    voice.setAllowOnline(this.cls.settings?.speech === 'online');
    this.renderer.setQuality(this.settings.quality || 'auto');
    this.hud?.refresh();
  }

  saveSettings() { this.world.save.settings = { ...this.settings }; this.save(); }

  save(now = false) {
    clearTimeout(this.saveTimer);
    // Between a completed activity's rewards and its time advance nothing is
    // written; advanceTime commits both together (DESIGN_DECISIONS 2026-11-23).
    if (this.saveHold) return;
    const doSave = () => {
      const s = this.world.save;
      s.settings = { ...this.settings };
      store.writeSave(s);
      store.upsertProfile({ id: s.id, name: s.player.name, look: s.player.look, day: s.time.day, lastPlayed: Date.now() });
    };
    if (now) doSave(); else this.saveTimer = setTimeout(doSave, 300);
  }

  /** Read-only friendship state for tests (`window.__esl.friendship`). */
  get friendship() { return snapshot(this.world); }
  get music() { return musicSnapshot(); }
  get mallMeal() { return mallMealSnapshot(this); }
  get arcade() { return arcadeSnapshot(); }
  /** Dev-only fault injection for recovery tests; a no-op in production builds. */
  fault(name) { return armFault(name); }
  /** Read-only reliability state for tests. */
  get reliability() {
    return Object.freeze({ mode: this.mode, activityRunning: !!this.activities.running, saveHold: !!this.saveHold, tick: !!this.activityTick, fade: this.fadeEl.classList.contains('on'), lastRecovery: this.lastRecovery || null, sceneId: this.sceneId, tempUi: this.uiRoot.querySelectorAll('.act-temp, .sketch, .arc, .mall-meal-skip').length, hudActivity: !this.activityHud.root.hidden });
  }

  portrait(npc) { return this.portraitFn(npc.look, npc.id + ':' + (npc.lookSeed || 0)); }
  playerPortrait() { return this.portraitFn(this.world.save.player.look, 'player:' + JSON.stringify(this.world.save.player.look).length + this.world.save.player.look.hairStyle + this.world.save.player.look.topColor); }

  setMode(m) {
    // Swallow the extra key press that ends a conversation so it can't start a new one.
    if (m === 'explore' && this.mode !== 'explore') this.interactBlockUntil = performance.now() + 550;
    const wasExplore = this.mode === 'explore';
    this.mode = m;
    if (m === 'explore' && !wasExplore) setTimeout(() => this.hud?.pump(), 150);
    this.input.enabled = m === 'explore' || m === 'activity';
    this.input.showJoystick(m === 'explore' || (m === 'activity' && !!this.activityMove));
    if (m !== 'explore') this.hud.prompt(null);
  }

  // ------------------------------------------------------------ location
  get locationId() {
    if (this.sceneId === 'town') return this.scene.zoneOf(this.player.x, this.player.z) === 'park' ? 'park' : 'town';
    if (MALL_FLOORS.includes(this.sceneId)) return 'mall';
    return this.sceneId;
  }

  locationName() {
    const id = this.locationId;
    if (id === 'mall') return this.scene.name;
    if (id === 'home') return { en: 'My Room', ja: '自分の部屋' };
    const L = LOCATIONS[id];
    return L ? { en: L.en, ja: L.ja } : { en: 'Sakura Town', ja: 'さくら町' };
  }

  getScene(id) {
    if (id === 'friendhouse' && this.scenes[id]?.hostId !== this.friendHouseNpc?.id) {
      this.scenes[id]?.dispose?.();
      delete this.scenes[id];
    }
    if (!this.scenes[id]) {
      this.scenes[id] = BUILDERS[id]({ shadows: this.renderer.shadows, playerName: this.world.save.player.name, seed: this.cls.seed, npc: this.friendHouseNpc });
      if (id === 'friendhouse') this.scenes[id].hostId = this.friendHouseNpc?.id;
    }
    return this.scenes[id];
  }

  async fade(fn, ms = 260) {
    this.fadeEl.classList.add('on');
    try {
      await wait(ms);
      await fn?.();
      await wait(60);
    } finally {
      this.fadeEl.classList.remove('on');
    }
    await wait(ms * 0.6);
  }

  /**
   * Change scene. If building or entering the scene fails, the player goes
   * back to the scene they came from (or home), the game is made usable again,
   * and the error is rethrown so an activity in progress counts as failed.
   */
  async enterScene(id, spawnId, opts = {}) {
    const prev = this.sceneId;
    try {
      await this._enterScene(id, spawnId, opts);
    } catch (err) {
      console.error('[scene] failed to enter', id, err);
      this.fadeEl.classList.remove('on');
      const back = prev && prev !== id && this.scenes[prev] ? prev : (id === 'home' ? 'town' : 'home');
      const doorBack = { mall: 'mallDoor', cafe: 'cafeDoor', home: 'homeDoor', friendhouse: 'friendHouseDoor', classroom: 'schoolGate' }[id];
      const spawn = back === 'town' ? (doorBack || 'crossroads') : back === 'home' ? 'center' : undefined;
      try { await this._enterScene(back, spawn, { fade: false, banner: true }); } catch (err2) { console.error('[scene] fallback failed', err2); }
      throw err;
    }
  }

  async _enterScene(id, spawnId, { fade = true, banner = true, companions = [] } = {}) {
    const go = async () => {
      if (this.scene) this.npcs.clear({ preserve: companions });
      faultPoint('scene:enter');
      const scene = this.getScene(id);
      this.scene = scene;
      this.sceneId = id;
      setMusicTheme(id);
      if (this.hud.manualGoal?.local && this.hud.manualGoal.loc !== id) this.hud.setGoal(null);
      this.extraInteract = [];
      this.sparkles = [];
      const amb = scene.ambience(this.world.period, this.world.weather, this.world.day);
      this.renderer.setWorld(scene.root, amb);
      scene.root.add(this.player.char.root);
      const sp = scene.spawns[spawnId] || Object.values(scene.spawns)[0];
      this.player.place(sp.x, sp.z, sp.yaw);
      this.player.char.showBag(id === 'town' && !this.world.weekend && this.world.period === AFTERNOON);
      scene.collision.dynamic = [this.player.collider];
      this.npcs.populate(companions);
      const camCfg = { ...scene.camera };
      if (camCfg.mode === 'follow') camCfg.yaw = sp.yaw + Math.PI;
      this.camera.configure(camCfg, this.player.char, scene.collision);
      if (id === 'classroom') this._refreshClassroom();
      if (id === 'home') this._refreshHome();
      this._applyRain();
      this.hud.refresh();
      this.save();
    };
    if (fade) { sfx.door(); await this.fade(go); } else await go();
    if (banner) this.hud.location(this.locationName());
  }

  /** Read-only semantic travel state for the floor-navigation harness. */
  get mallTravel() {
    return Object.freeze({ floor: MALL_FLOORS.indexOf(this.sceneId) + 1, travelling: !!this._floorTravel, via: this._floorVia || null });
  }

  async changeFloor(floor, via = 'elevator') {
    const from = MALL_FLOORS.indexOf(this.sceneId) + 1;
    if (!from || !Number.isInteger(floor) || floor < 1 || floor > 3 || floor === from || this._floorTravel) return;
    if (!['escUp', 'escDown', 'elevator'].includes(via)) return;
    this._floorTravel = true;
    this._floorVia = via;
    const mode = this.mode;
    const companions = this.npcs.actors.filter((a) => a.engaged && !a.special);
    this.player.stop();
    this.setMode('transition');
    try {
      const spawn = via === 'escUp' ? 'escDown' : via === 'escDown' ? 'escUp' : 'elevator';
      await this.fade(() => this.enterScene(MALL_FLOORS[floor - 1], spawn, { fade: false, banner: false, companions }), 160);
      const name = this.locationName();
      this.hud.location({ ...name, en: `${floor > from ? '↑' : '↓'} ${name.en}` });
    } finally {
      this._floorTravel = false;
      this.setMode(mode);
    }
  }

  _applyRain() {
    if (!this.rain) {
      const n = 900;
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 40, y = Math.random() * 18, z = (Math.random() - 0.5) * 40;
        pos.set([x, y, z, x + 0.04, y - 0.55, z + 0.02], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#C9E3F5', transparent: true, opacity: 0.55 }));
      this.rain.frustumCulled = false;
    }
    this.rain.removeFromParent();
    if (this.sceneId === 'town' && this.world.weather === 'rainy' && this.world.period !== EVENING) this.scene.root.add(this.rain);
  }

  _refreshClassroom() {
    const w = this.world;
    const d = w.date;
    const phrases = ['What do you do on Saturdays?', 'Do you want to play soccer?', 'What do you want to eat?', 'What subject do you like?', "How's the weather?", 'This is my friend.', 'Where do you want to go?', 'Can you swim?'];
    const phrase = w.day === 0 ? 'Nice to meet you!' : phrases[w.day % phrases.length];
    this.scene.setBoard({ dateEn: `${DAYS[w.dow].en}, ${MONTHS[d.m - 1]} ${ordinal(d.d)}`, dateJa: `${d.m}月${d.d}日（${DAYS[w.dow].jaShort}）`, phrase, duty: `${WEATHER[w.weather].emoji} ${WEATHER[w.weather].en}` });
    this.boardPhrase = phrase;
  }

  _refreshHome() {
    const w = this.world;
    const d = w.date;
    this.scene.setCalendar(MONTHS[d.m - 1], `${d.d}`);
    const photos = store.loadPhotos(w.save.id).slice(0, 8).map((p) => p.url);
    this.scene.setPhotos(photos);
    this.scene.setSouvenirs(w.save.souvenirs || [], (s) => souvenirMesh(s.kind));
  }

  // ------------------------------------------------------------ start
  async start() {
    const w = this.world;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try { this.update(dt); } catch (err) { console.error('[loop]', err); }
      requestAnimationFrame(loop);
    };
    await speech.configure(this.cls.settings?.speech || 'local', this.settings.mic);
    if (w.save.flags.fd === 'start' && (!w.npc(w.save.firstFriend))) w.save.flags.fd = 'done';
    if (w.save.flags.fd !== 'start' && w.save.flags.fd !== 'done' && !w.npc(w.save.introNpc)) w.save.flags.fd = 'done';
    requestAnimationFrame(loop);
    if (w.save.flags.fd === 'start' && w.day === 0 && w.period === MORNING) {
      await this.enterScene('classroom', 'front', { fade: false, banner: false });
      await this.firstDayWelcome();
    } else if (w.period === EVENING) {
      await this.enterScene('home', 'bed', { fade: false });
    } else if (w.schoolTime) {
      await this.enterSchoolMorning({ fade: false });
    } else if (w.period === AFTERNOON && !w.weekend) {
      await this.enterScene('town', 'schoolGate', { fade: false });
    } else {
      await this.enterScene('home', 'center', { fade: false });
    }
    this.hud.refresh();
  }

  async firstDayWelcome() {
    const w = this.world;
    const teacher = this.npcs.actors.find((a) => a.special === 'teacher');
    const d = w.date;
    await this.hud.transition({ icon: '🌸', title: `${DAYS[w.dow].en}, ${MONTHS[d.m - 1]} ${ordinal(d.d)}`, sub: 'Your first day at Sakura Elementary!', ja: 'さくら小学校での初めての日！', ms: 2200 });
    if (!teacher) return;
    this.setMode('talk');
    this.player.place(1.0, -3.35, 0);
    teacher.char.faceToward(0.3, 3);
    // Student's-eye view of the front of the class, then a reverse shot of the class.
    const front = () => this.camera.shot(new THREE.Vector3(1.25, 1.8, 0.15), new THREE.Vector3(0.55, 1.05, -3.6), 3.2);
    const classShot = () => this.camera.shot(new THREE.Vector3(5.4, 2.5, -4.4), new THREE.Vector3(-2.6, 0.6, 2.2), 2.6);
    front();
    this.camera.snap();
    const c = new Conversation(this, [teacher]);
    await c.say(teacher, line(`Good morning, everyone! This is our new friend, ${w.save.player.name}!`, `みなさん、おはようございます！新しいお友達の${w.save.player.name}さんです！`, { area: 'intro', expr: 'i.thisis' }), { gesture: 'point', expr: 'happy' });
    classShot();
    for (const a of this.npcs.actors) if (!a.special) { a.char.play('clap', 1.8); a.bubble = { text: '👏', t: 2 }; }
    sfx.great();
    await wait(1300);
    front();
    await c.say(teacher, line(`${w.save.player.name}, please say hello!`, `${w.save.player.name}さん、あいさつしてね！`));
    const like = w.save.player.likes?.[0];
    const { interest } = await import('../data/content.js');
    await c.ask([opt('hello', `Hello! My name is ${w.save.player.name}. I like ${interest(like).en}. Nice to meet you!`, `こんにちは！${w.save.player.name}です。${interest(like).ja}が好きです。よろしくね！`, { emoji: '🙋', phrases: ['hello my name is', 'my name is', 'nice to meet you', 'hello', 'hi'], area: 'selfintro', expr: 'a.selfintro', template: 'Hello! My name is ___. I like ___.' })]);
    classShot();
    for (const a of this.npcs.actors) if (!a.special) { a.char.play('wave', 1.6); a.bubble = { text: Math.random() < 0.5 ? 'Nice to meet you!' : '👋', t: 2.4 }; }
    sfx.chime();
    await wait(1500);
    front();
    await c.say(teacher, line('Make some friends before class. Have fun!', '授業の前に、友達を作ってね。楽しんで！'), { expr: 'happy' });
    this.dialogue.close();
    this.camera.release();
    this.camera.configure(this.scene.camera, this.player.char, this.scene.collision);
    this.setMode('explore');
    const ff = this.npcs.actorFor(w.save.firstFriend);
    if (ff) { ff.char.play('wave', 1.6); ff.bubble = { text: `${w.save.player.name}! Over here!`, t: 4 }; }
    this.hud.toast({ icon: '🎮', en: 'Walk: WASD / arrow keys / joystick. Talk: E or tap.', ja: '歩く：WASD・矢印キー・スティック　話す：Eキーかタップ', ms: 6000 });
    this.hud.refresh();
    this.welcomeDone = true;
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    if (this.paused) return;
    this.time += dt;
    updateMallMeal(this, dt);
    const mode = this.mode;
    if (mode === 'explore') {
      this.player.update(dt, this.input.axis(), true);
      this._updateTarget();
      const g = this.hud.manualGoal;
      if (g?.temp && g.loc && this.locationId === g.loc && (!g.local || Math.hypot(this.player.x - g.target.x, this.player.z - g.target.z) < 1.3)) this.hud.setGoal(null);
    } else if (mode === 'activity') {
      if (this.activityMove) this._laneMove(dt);
      else this.player.char.update(dt);
      this.activityTick?.(dt);
    } else {
      if (this.sitting) this.player.char.update(dt);
      else this.player.update(dt, { x: 0, y: 0 }, false);
    }
    if (this.scene) {
      this.npcs.update(dt);
      this.scene.update?.(dt, this.time);
      if (this.rain && this.rain.parent) {
        const p = this.player;
        this.rain.position.set(p.x, -((this.time * 14) % 18) + 2, p.z);
      }
    }
    this.camera.target = this.player.char;
    this.camera.update(dt);
    this._overlay();
    this.hud.updateArrow(this.renderer.camera);
    this.renderer.render();
    this.renderer.trackFrame(dt);
  }

  _laneMove(dt) {
    const lane = this.activityMove.lane;
    const ax = this.input.axis().x;
    const p = this.player;
    const target = ax * 4.4;
    p.vx += (target - p.vx) * damp(12, dt);
    const nx = clamp(p.x + p.vx * dt, lane.minX, lane.maxX);
    p.char.root.position.x = nx;
    p.char.root.position.z = lane.z;
    p.char.speed = Math.abs(p.vx);
    p.char.setBase(Math.abs(p.vx) > 0.2 ? 'walk' : 'idle');
    p.char.turnTo(Math.abs(p.vx) > 0.2 ? (p.vx > 0 ? Math.PI / 2 + 0.6 : -Math.PI / 2 - 0.6) + Math.PI : Math.PI, 10);
    p.collider.x = nx; p.collider.z = lane.z;
    p.char.update(dt);
  }

  _overlay() {
    const cam = this.renderer.camera;
    const w = this.world;
    const W = this.renderer.canvas.clientWidth, H = this.renderer.canvas.clientHeight;
    const items = [];
    const px = this.player.x, pz = this.player.z;
    const inTalk = this.mode === 'talk' || this.mode === 'activity';
    for (const a of this.npcs.actors) {
      if (!a.char.root.visible) continue;
      const p = a.char.root.position;
      const dist = Math.hypot(p.x - px, p.z - pz);
      const known = a.special ? true : w.isKnown(a.npc.id);
      const lvl = a.special ? 0 : w.level(a.npc.id);
      items.push({
        key: a.npc.id,
        pos: tmpV.set(p.x, p.y + a.char.height + 0.32, p.z).clone(),
        name: inTalk ? '' : known ? a.npc.name : '?',
        hearts: !a.special && lvl ? '♥'.repeat(lvl) : '',
        stranger: !known,
        marker: inTalk ? '' : this.npcs.markerFor(a),
        bubble: a.bubble?.text || '',
        dist,
        near: this.sceneId === 'town' ? 9 : 5.5,
      });
    }
    for (const s of this.sparkles) items.push({ key: 'sp:' + s.id, pos: new THREE.Vector3(s.x, s.y, s.z), name: '', marker: '🔍', bubble: '', dist: Math.hypot(s.x - px, s.z - pz) });
    this.overlay.update(cam, items, W, H);
  }

  // ------------------------------------------------------------ interaction
  _interactables() { return [...(this.scene?.interact || []), ...this.extraInteract, ...mallSeatInteractions(this)]; }

  _updateTarget() {
    const p = this.player;
    const yaw = p.char.yaw;
    const npc = this.npcs.talkTarget(p.x, p.z, yaw);
    let best = null, bestD = Infinity;
    for (const it of this._interactables()) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < it.r && d < bestD) { best = it; bestD = d; }
    }
    let t = null;
    if (npc && (!best || Math.hypot(npc.char.root.position.x - p.x, npc.char.root.position.z - p.z) < bestD + 0.3)) {
      const known = npc.special || this.world.isKnown(npc.npc.id);
      t = { key: 'npc:' + npc.npc.id, actor: npc, icon: '💬', en: known ? `Talk to ${npc.npc.name}` : 'Say hello!', ja: known ? `${npc.npc.name}に話しかける` : 'あいさつする' };
    } else if (best) {
      t = { key: 'it:' + best.id, it: best, icon: best.icon, en: this._itLabel(best).en, ja: this._itLabel(best).ja };
    }
    this.target = t;
    this.hud.prompt(t);
  }

  _itLabel(it) {
    const w = this.world;
    if (it.kind === 'door') {
      if (it.to === 'town' && this.sceneId === 'home') return w.evening ? { en: "It's late. Stay home", ja: 'もうおそいよ' } : { en: 'Go outside', ja: '外に出る' };
      if (it.to === 'town') return { en: 'Go outside', ja: '外に出る' };
      return { en: `Go in: ${it.label.en}`, ja: `${it.label.ja}に入る` };
    }
    if (it.kind === 'desk') return w.schoolTime ? { en: 'Sit down: start class', ja: '席にすわる（授業開始）' } : { en: 'My desk', ja: '自分の席' };
    if (it.kind === 'bed') return w.evening ? { en: 'Go to bed', ja: 'ねる' } : { en: 'Rest a little', ja: '少し休む' };
    return { en: it.label.en, ja: it.label.ja };
  }

  interact() {
    if (this.mode !== 'explore' || performance.now() < (this.interactBlockUntil || 0)) return;
    const t = this.target;
    if (!t) return;
    if (t.actor) this.talkTo(t.actor);
    else if (t.it) this.useInteract(t.it);
  }

  _key(e) {
    if (this.menus.isOpen) return;
    if (this.mode === 'explore') {
      if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault?.(); this.interact(); }
      if (e.code === 'KeyJ') this.menus.open('journal');
      if (e.code === 'KeyM') this.menus.open('map');
      if (e.code === 'KeyP') this.menus.open('phone');
      if (e.code === 'KeyC') this.menus.open('calendar');
    }
    if (e.code === 'Backquote' || (e.code === 'KeyD' && e.shiftKey && e.altKey)) this.toggleDebug();
  }

  _tap({ x, y }) {
    if (this.mode !== 'explore') return;
    const cam = this.renderer.camera;
    const rect = this.renderer.canvas.getBoundingClientRect();
    const sx = x - rect.left, sy = y - rect.top;
    const W = rect.width, H = rect.height;
    // Tap a person
    let best = null, bestD = 60;
    for (const a of this.npcs.actors) {
      if (!a.char.root.visible) continue;
      const p = a.char.root.position;
      for (const hgt of [0.5, 1.0]) {
        tmpV.set(p.x, hgt, p.z).project(cam);
        if (tmpV.z > 1) continue;
        const d = Math.hypot((tmpV.x * 0.5 + 0.5) * W - sx, (-tmpV.y * 0.5 + 0.5) * H - sy);
        if (d < bestD) { bestD = d; best = a; }
      }
    }
    if (best) {
      const p = best.char.root.position;
      const pl = this.player;
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      if (d < 1.9) { this.talkTo(best); return; }
      const ang = Math.atan2(pl.x - p.x, pl.z - p.z);
      pl.walkTo(p.x + Math.sin(ang) * 1.1, p.z + Math.cos(ang) * 1.1, (ok) => { if (this.mode === 'explore' && Math.hypot(p.x - pl.x, p.z - pl.z) < 2.2) this.talkTo(best); }, 0.2);
      return;
    }
    // Tap an object
    for (const it of this._interactables()) {
      tmpV.set(it.x, 0.8, it.z).project(cam);
      const d = Math.hypot((tmpV.x * 0.5 + 0.5) * W - sx, (-tmpV.y * 0.5 + 0.5) * H - sy);
      if (tmpV.z < 1 && d < 55) {
        this.player.walkTo(it.x, it.z, () => { if (this.mode === 'explore' && Math.hypot(it.x - this.player.x, it.z - this.player.z) < it.r + 0.2) this.useInteract(it); }, Math.max(0.3, it.r - 0.5));
        return;
      }
    }
    // Tap the ground
    const ndc = new THREE.Vector2((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (t > 0 && t < 60) {
      const gx = ray.ray.origin.x + ray.ray.direction.x * t, gz = ray.ray.origin.z + ray.ray.direction.z * t;
      this.player.walkTo(gx, gz);
    }
  }

  async talkTo(actor) {
    if (this.mode !== 'explore' || !actor) return;
    this.hud.prompt(null);
    try { await talkToNpc(this, actor); } catch (err) { console.error('[talk]', err); recoverGame(this, { actors: [actor] }); }
    this.hud.refresh();
    this.save();
  }

  /** Every object interaction is guarded: an error never leaves the game stuck. */
  async useInteract(it) {
    try { return await this._useInteract(it); }
    catch (err) {
      console.error('[interact]', it?.kind, err);
      recoverGame(this, { actors: this.npcs.actors.filter((a) => a.engaged && !a.special) });
      this.save(true);
    }
  }

  async _useInteract(it) {
    const w = this.world;
    sfx.click();
    switch (it.kind) {
      case 'door': return this._door(it);
      case 'schoolLesson': return this.schoolLesson();
      case 'friendhouse': return this._friendHouseDoor();
      case 'mallShop': return this.activities.mallShop(it);
      case 'mallFood': return this.activities.mallCounter(it);
      case 'mallSeat': return eatSoloMallMeal(this, it.seatId);
      case 'arcade': return this.activities.arcade(it);
      case 'mallEscalator': return this.changeFloor(it.floor, it.via);
      case 'mallElevator': {
        const floor = MALL_FLOORS.indexOf(this.sceneId) + 1;
        const names = ['1F Shopping', '2F Food Court', '3F Game Center'];
        const hints = ['1かい ショッピング', '2かい フードコート', '3かい ゲームセンター'];
        const choice = await this.askSolo({ name: 'Elevator', color: '#2F9E9E', en: 'Where do you want to go?', ja: '何かいに行きたい？' }, names.flatMap((name, i) => i + 1 === floor ? [] : [opt(String(i + 1), name, hints[i])]).concat(opt('stay', 'Stay on this floor.', 'このかいにいる。')));
        if (choice !== 'stay') await this.changeFloor(Number(choice), 'elevator');
        return;
      }
      case 'mallDirectory': {
        const choice = await this.askSolo({ name: '🛍️ Niji Mall', color: '#2F9E9E', en: '1F Shopping: Toys & Games, Books & Stationery, Sports & Clothes.\n2F Food Court: Rainbow Ramen, Sunny Burgers, Little Sushi, Cloud Crepes & Ice Cream.\n3F Game Center: racing, crane and rhythm games. Where do you want to go?', ja: '1かい：おもちゃ・本・スポーツ\n2かい：フードコート\n3かい：ゲームセンター\nどこに行きたい？' }, [
          opt('shops', 'I want to go shopping.', '買い物に行きたい。', { emoji: '🛍️', phrases: ['i want to go shopping', 'shopping', 'shops'], keys: [['shop']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go ___.' }),
          opt('food', 'I want to go to the food court.', 'フードコートに行きたい。', { emoji: '🍜', phrases: ['i want to go to the food court', 'food court', 'food'], keys: [['food', 'eat']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' }),
          opt('games', 'I want to go to the third floor.', '3かいに行きたい。', { emoji: '🕹️', phrases: ['i want to go to the third floor', 'third floor', 'games', 'game center'], keys: [['third', 'game']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' }),
          opt('thanks', 'Thank you!', 'ありがとう！'),
        ]);
        if (choice === 'thanks') return;
        const floor = { shops: 1, food: 2, games: 3 }[choice];
        const destination = this.getScene(MALL_FLOORS[floor - 1]);
        const local = destination === this.scene;
        const target = local ? destination.interact.find((t) => choice === 'shops' ? t.shop === 'toys' : choice === 'food' ? t.counter === 'ramen' : t.game === 'racing') : this.scene.interact.find((t) => t.kind === 'mallElevator');
        this.hud.setGoal({ icon: { shops: '🛍️', food: '🍜', games: '🕹️' }[choice], en: local ? `Go to ${target.label.en}` : `Take the elevator to ${floor}F`, ja: local ? `${target.label.ja}へ行こう` : `${floor}かいへ行こう`, loc: 'mall', target: { x: target.x, z: target.z, label: target.label.en }, temp: true, local: true });
        return;
      }
      case 'board': return this.menus.open('board');
      case 'timetable': return this.menus.open('timetable');
      case 'journal': return this.menus.open('journal');
      case 'messages': return this.menus.open('phone');
      case 'calendar': return this.menus.open('calendar');
      case 'shelf': return this.menus.open('shelf');
      case 'mirror': return this.onMirror?.();
      case 'blackboard': return this._narrate({ name: '📝 Blackboard', color: '#2F5D4A' }, line(`Today's English: “${this.boardPhrase}”`, '今日の英語'));
      case 'special': return this._narrate({ name: '📋 Café', color: '#2F9E6E' }, line(`Today's special: pancakes! 🥞 What do you want to eat?`, '今日のおすすめはパンケーキ！何を食べたい？', { area: 'food' }));
      case 'counter': { const staff = this.npcs.actors.find((a) => a.special === 'staff'); if (staff) return this.talkTo(staff); return; }
      case 'desk': return this._desk();
      case 'bed': return this._bed();
      case 'look': return this.activities.look(it);
      default: return null;
    }
  }

  async _narrate(who, l) {
    this.setMode('talk');
    await this.dialogue.say({ name: who.name, color: who.color, en: l.en, ja: l.ja, voiceOpts: { pitch: 1, rate: 0.9 } });
    this.dialogue.close();
    this.setMode('explore');
  }

  /** A standalone question (no NPC): returns the chosen option id. */
  async askSolo(prompt, options, banner = null) {
    this.setMode('talk');
    this.player.stop();
    const r = await this.dialogue.choose(options, { prompt, banner });
    this.dialogue.close();
    this.setMode('explore');
    return r.option.id;
  }

  async _door(it) {
    const w = this.world;
    if (w.schoolTime && ['musicroom', 'gym', 'artroom'].includes(this.sceneId)) return this.schoolLesson();
    if (this.sceneId === 'classroom' && w.schoolTime) {
      this.hud.toast({ icon: '🔔', en: 'Class starts soon! Talk to classmates, then sit at your desk.', ja: 'もうすぐ授業！話したら、席にすわろう。' });
      return;
    }
    if (it.to === 'classroom') {
      this.hud.toast({ icon: '🏫', en: w.weekend ? 'No school today! It is the weekend.' : 'School is over for today. See you tomorrow!', ja: w.weekend ? '今日は学校はお休み！' : '今日の学校はおしまい！また明日！' });
      return;
    }
    if (it.to === 'town' && this.sceneId === 'home' && w.evening) {
      this.hud.toast({ icon: '🌙', en: "It's late. Let's stay home tonight!", ja: 'もうおそいから、家にいよう！' });
      return;
    }
    const spawn = { cafe: 'door', mall: 'door', home: 'door', classroom: 'door' }[it.to];
    if (it.to === 'town') {
      const from = { cafe: 'cafeDoor', mall: 'mallDoor', home: 'homeDoor', friendhouse: 'friendHouseDoor', classroom: 'schoolGate' }[this.sceneId] || 'crossroads';
      return this.enterScene('town', from);
    }
    return this.enterScene(it.to, spawn);
  }

  async _friendHouseDoor() {
    const w = this.world;
    const plan = w.plansNow().find((p) => p.loc === 'friendhouse' && p.eventId);
    const inst = plan && instance(w.save, plan.eventId);
    if (!w.free || !inst || inst.template !== 'friend_house' || inst.status !== 'scheduled') {
      return this.askSolo({ name: '🏡', color: '#70ABA4', en: "Not now. Let's make a plan with a close friend!", ja: '今はお休み。仲よしの友達と約束してから来よう！' }, [opt('ok', 'OK! See you later!', 'うん！また今度ね！', { phrases: ['ok', 'see you later'], keys: [['ok', 'later']] })]);
    }
    if (!npcFree(w, inst.npcId, w.day, w.period, plan.id)) return;
    const npc = w.npc(inst.npcId);
    if (!npc) return;
    const actor = this.npcs.actorFor(npc.id) || this.npcs.ensure(npc, this.player.x - 0.6, this.player.z + 1, Math.PI / 2);
    const c = await Conversation.start(this, [actor]);
    let enter = false;
    try {
      const t = eventTitle(w, inst);
      enter = await confirmTime(c, `${t.emoji} ${t.en}?`, `${t.ja}？`);
    } finally { await c.end(); }
    if (enter) await runEvent(this, actor, inst.id);
  }

  async _desk() {
    const w = this.world;
    if (!w.schoolTime) { this.hud.toast({ icon: '🪑', en: 'This is your desk.', ja: '自分の席だよ。' }); return; }
    const subs = TIMETABLE[w.dow].map((s) => SUBJECTS.find((x) => x.id === s));
    const id = await this.askSolo({ name: '🔔 School bell', color: '#4C6FFF', en: 'Start class? After class, it will be After School.', ja: '授業を始める？授業のあとは放課後だよ。' }, [
      opt('go', 'Yes! Start class.', 'はい！授業を始めよう。', { emoji: '📚', phrases: ['yes', 'start', 'ok', 'lets start'], tone: 'go' }),
      opt('no', 'Not yet.', 'まだ。', { emoji: '✋', phrases: ['not yet', 'no', 'wait'], tone: 'quiet' }),
    ]);
    if (id !== 'go') return;
    this.player.char.setBase('sit');
    await this.advanceTime({ reason: 'class', subjects: subs });
  }

  // The tutorial includes the next-morning callback; keep that whole script
  // in homeroom until it finishes, including when loading an older save.
  async enterSchoolMorning({ fade = false } = {}) {
    const w = this.world;
    const lesson = w.save.flags.fd === 'done' ? lessonForDay(w.day) : null;
    await this.enterScene(lesson?.scene || 'classroom', 'door', { fade });
  }

  schoolLesson() { return runSchoolLesson(this); }

  async _bed() {
    const w = this.world;
    if (w.evening) {
      const id = await this.askSolo({ name: '🛏️ Bed', color: '#5C7CFA', en: 'Go to bed? A new day will start.', ja: 'ねる？新しい一日が始まるよ。' }, [
        opt('sleep', 'Good night!', 'おやすみなさい！', { emoji: '🌙', phrases: ['good night', 'yes', 'sleep'], tone: 'go' }),
        opt('no', 'Not yet.', 'まだ。', { emoji: '✋', phrases: ['not yet', 'no'], tone: 'quiet' }),
      ]);
      if (id === 'sleep') await this.sleep();
      return;
    }
    if (!w.free) { this.hud.toast({ icon: '🛏️', en: "It's not bedtime yet!", ja: 'まだねる時間じゃないよ！' }); return; }
    this.askAdvance();
  }

  async askAdvance() {
    const w = this.world;
    if (this.mode !== 'explore') return;
    if (w.evening) {
      if (this.sceneId !== 'home') { await this.enterScene('home', 'bed'); return; }
      return this._bed();
    }
    if (w.schoolTime) {
      if (['musicroom', 'gym', 'artroom'].includes(this.sceneId)) return this.schoolLesson();
      if (this.sceneId === 'classroom') return this._desk();
      return;
    }
    const next = w.weekend && w.period === MORNING ? 'Afternoon' : 'Evening';
    const id = await this.askSolo({ name: '⏩ Time', color: '#4C6FFF', en: `Spend time on your own? It will be ${next}.`, ja: `ひとりで過ごす？${next === 'Evening' ? '夜' : '午後'}になるよ。` }, [
      opt('go', 'Yes, advance time.', 'はい、時間を進める。', { emoji: '⏩', phrases: ['yes', 'ok'], tone: 'go' }),
      opt('no', 'No, keep exploring.', 'いいえ、まだ遊ぶ。', { emoji: '🚶', phrases: ['no'], tone: 'quiet' }),
    ]);
    if (id === 'go') await this.advanceTime({ reason: 'skip' });
  }

  // ------------------------------------------------------------ time
  async advanceTime({ reason = 'skip', subjects = null, beforeSave = null } = {}) {
    const w = this.world;
    this.setMode('transition');
    this.hud.setGoal(null);
    // An activity's held reward is committed with this time advance.
    this.saveHold = false;
    if (w.period === EVENING) return this.sleep({ beforeSave });
    const wasSchool = w.schoolTime;
    w.advance();
    beforeSave?.();
    this.save(true);
    try {
      await this._afterAdvance(wasSchool, subjects);
    } catch (err) {
      console.error('[time] scene after advance failed', err);
      recoverGame(this, { toast: false });
    }
  }

  async _afterAdvance(wasSchool, subjects) {
    const w = this.world;
    if (wasSchool) {
      const list = (subjects || TIMETABLE[(w.dow)].map((s) => SUBJECTS.find((x) => x.id === s)));
      for (const s of list) w.logLine({ expr: 'subj:' + s.id, area: 'subjects', en: s.en, template: s.en }, 'heard');
      await this.hud.transition({ icon: '📚', title: 'Class time!', sub: list.map((s) => `${s.emoji} ${s.en}`).join('  ·  '), ja: '授業の時間！', ms: 2300 });
      sfx.bell();
      await this.hud.transition({ icon: '🎒', title: 'After School', sub: 'Free time! Where do you want to go?', ja: '放課後！どこに行きたい？', ms: 1600 });
      await this.enterScene('town', 'schoolGate', { fade: false });
    } else if (w.period === EVENING) {
      await this.hud.transition({ icon: '🌙', title: 'Evening', sub: "It's getting dark. Time to go home!", ja: '暗くなってきた。家に帰ろう！', ms: 1700 });
      await this.enterScene('home', 'door', { fade: false });
      const unread = w.unread();
      if (unread) this.hud.toast({ icon: '📱', en: `You have ${unread} new message${unread > 1 ? 's' : ''}! Check the tablet on your desk.`, ja: '新しいメッセージ！つくえのタブレットを見てね。', ms: 4500 });
    } else {
      await this.hud.transition({ icon: '☀️', title: 'Afternoon', sub: 'More free time!', ja: '午後も自由時間！', ms: 1400 });
      const spawnBack = { town: 'crossroads', cafe: 'door', mall: 'door', mall2: 'elevator', mall3: 'elevator', home: 'center', classroom: 'door' }[this.sceneId];
      await this.enterScene(this.sceneId, this.sceneId === 'town' ? (this.locationId === 'park' ? 'park' : 'crossroads') : spawnBack, { fade: false });
    }
    this.setMode('explore');
    this.hud.refresh();
    this.hud.pump();
  }

  async sleep({ beforeSave = null } = {}) {
    const w = this.world;
    this.setMode('transition');
    this.saveHold = false;
    if (w.save.flags.fd === 'played') w.save.flags.fd = 'slept';
    await this.hud.transition({ icon: '🌙', title: 'Good night...', sub: '💤', ja: 'おやすみなさい…', ms: 1500 });
    w.sleep();
    beforeSave?.();
    this.save(true);
    await this.wakeUp();
  }

  async wakeUp() {
    const w = this.world;
    const d = w.date;
    const wx = WEATHER[w.weather];
    await this.enterScene('home', 'bed', { fade: false, banner: false });
    this.setMode('transition');
    await this.hud.transition({ icon: wx.emoji, title: `${DAYS[w.dow].en}, ${MONTHS[d.m - 1]} ${ordinal(d.d)}`, sub: `Good morning! It's ${wx.en} today.`, ja: `おはよう！今日は${wx.ja}。`, ms: 1900 });
    // Morning routine: what time is it?
    const wake = w.weekend ? { h: 8, m: 0 } : { h: 7, m: 0 };
    const wrongA = { h: wake.h + 1, m: 0 }, wrongB = { h: wake.h - 1, m: 30 };
    const cards = [wake, wrongA, wrongB].sort(() => Math.random() - 0.5).map((t) => opt(`${t.h}:${t.m}`, `It's ${timeWords(t.h, t.m)}.`, `${timeJa(t.h, t.m)}です。`, { emoji: '⏰', keys: [[timeWords(t.h, t.m).split(' ')[0]]], area: 'time', expr: 'a.time', template: "It's ___ o'clock." }));
    this.setMode('talk');
    this.camera.frameTalk([this.player.char, { root: { position: new THREE.Vector3(-3.4, 0, -3.2) } }]);
    sfx.chime();
    const r = await this.dialogue.choose(cards, { prompt: { name: '⏰ Alarm clock', color: '#FF7A59', en: `Ring ring! What time is it? (The clock says ${wake.h}:${String(wake.m).padStart(2, '0')})`, ja: `ジリリリ！何時？（時計は${wake.h}:${String(wake.m).padStart(2, '0')}）` } });
    w.logLine({ expr: 'a.time', area: 'time', en: r.option.en, template: "It's ___ o'clock." }, 'said');
    const right = r.option.id === `${wake.h}:${wake.m}`;
    await this.dialogue.say({ name: '⏰ Alarm clock', color: '#FF7A59', en: right ? `That's right! It's ${timeWords(wake.h, wake.m)}. ${w.weekend ? "It's the weekend! No school!" : "Let's go to school!"}` : `Look at the clock! It's ${timeWords(wake.h, wake.m)}. ${w.weekend ? 'No school today!' : 'Time for school!'}`, ja: right ? '正解！' : `時計を見て！${timeJa(wake.h, wake.m)}だよ。`, voiceOpts: { pitch: 1, rate: 0.9 } });
    if (w.weekend) {
      const choice = await this.dialogue.choose([
        opt('park', 'I want to go to the park.', '公園に行きたい。', { emoji: '🌸', keys: [['park']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' }),
        opt('cafe', 'I want to go to the café.', 'カフェに行きたい。', { emoji: '☕', keys: [['cafe']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' }),
        opt('mall', 'I want to go to the mall.', 'モールに行きたい。', { emoji: '🛍️', keys: [['mall']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' }),
        opt('home', 'I want to stay home.', '家にいたい。', { emoji: '🏠', keys: [['home', 'stay']], area: 'wantto', expr: 'a.wantstay', template: 'I want to ___.' }),
      ], { prompt: { name: '🌞 Saturday plans', color: '#2B8CFF', en: 'What do you want to do today?', ja: '今日は何をしたい？' } });
      w.logLine({ expr: 'a.wantgo', area: 'wantto', en: choice.option.en, template: 'I want to go to ___.' }, 'said');
      if (choice.option.id === 'park') this.hud.setGoal({ icon: '🌸', en: 'Go to Sakura Park', ja: 'さくら公園へ行こう', loc: 'park', temp: true });
      if (choice.option.id === 'cafe') this.hud.setGoal({ icon: '☕', en: 'Go to Café Komorebi', ja: 'カフェへ行こう', loc: 'cafe', temp: true });
      if (choice.option.id === 'mall') this.hud.setGoal({ icon: '🛍️', en: 'Go to Niji Mall', ja: 'にじモールへ行こう', loc: 'mall', target: { x: 25, z: -14 }, temp: true });
      this.dialogue.close();
      this.camera.release();
      this.camera.configure(this.scene.camera, this.player.char, this.scene.collision);
      this.setMode('explore');
      this.hud.refresh();
      return;
    }
    this.dialogue.close();
    this.camera.release();
    await this.hud.transition({ icon: '🏫', title: 'To school!', sub: 'Have a great day!', ja: 'いってきます！', ms: 1100 });
    await this.enterSchoolMorning({ fade: false });
    this.setMode('explore');
    this.hud.refresh();
  }

  // ------------------------------------------------------------ misc
  toggleDebug() { import('../ui/debug.js').then((m) => m.toggleDebug(this)); }

  async quitToTitle() {
    this.save(true);
    this.running = false;
    for (const d of this.disposers) d();
    this.dialogue.close();
    this.npcs.clear();
    speech.abort();
    voice.stop();
    stopMusic();
    this.onQuit?.();
  }
}
