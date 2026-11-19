// Title, Teacher Setup and Character Creation screens (DOM over a 3D stage).

import * as THREE from 'three';
import { el, escapeHtml, wait } from '../core/util.js';
import { sfx, unlockAudio } from '../core/audio.js';
import { voice } from '../dialogue/voice.js';
import { Character } from '../engine/character.js';
import { buildTown } from '../engine/scenes/town.js';
import {
  parseRoster, buildClass, nameKey, npcIdFor, generateLook, HAIR_STYLES, HAIR_COLORS, HAIR_COLORS_FUN, SKIN_TONES,
  TOP_COLORS, BOTTOM_COLORS, SHOE_COLORS, TOP_STYLES, BAG_COLORS,
} from '../world/generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { PLAYER_LIKES, PLAYER_CANS, interest, ability, MONTHS, dateText } from '../data/content.js';
import * as store from '../core/store.js';
import { dateOf } from '../world/time.js';

const HAIR_LABEL = { short: 'Short', spiky: 'Spiky', messy: 'Messy', buzz: 'Buzz', side: 'Side', curly: 'Curly', bob: 'Bob', long: 'Long', ponytail: 'Ponytail', twintails: 'Twin tails', bun: 'Bun' };
const TOP_LABEL = { tshirt: 'T-shirt', hoodie: 'Hoodie', jacket: 'Jacket', collar: 'Polo' };
const BOTTOM_LABEL = { shorts: 'Shorts', pants: 'Pants', skirt: 'Skirt' };
const ACC_LABEL = { none: 'None', glasses: 'Glasses', cap: 'Cap', headband: 'Headband', hairclip: 'Hair clip' };

/** A small 3D stage used behind the title and creator screens. */
export class Stage {
  constructor(renderer) {
    this.r = renderer;
    this.mode = null;
    this.t = 0;
    this.running = false;
  }

  showTown() {
    if (!this.town) this.town = buildTown({ playerName: '' });
    this.mode = 'town';
    this.r.setWorld(this.town.root, this.town.ambience(0, 'sunny', 0));
    this._start();
  }

  showCharacter(look) {
    if (!this.studio) {
      const root = new THREE.Group();
      root.add(new THREE.HemisphereLight('#FFFFFF', '#E7C9A9', 2.1));
      const d = new THREE.DirectionalLight('#FFF6E8', 1.8);
      d.position.set(3, 5, 6);
      root.add(d);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.14, 40), new THREE.MeshToonMaterial({ color: '#FFD9C2' }));
      disc.position.y = -0.07;
      root.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: '#FF7A59' }));
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
      this.studio = { root };
    }
    this.mode = 'studio';
    this.setLook(look);
    this.r.setWorld(this.studio.root, { background: new THREE.Color('#FFEFE2'), fog: null });
    this._start();
  }

  setLook(look) {
    if (this.char) { this.char.root.removeFromParent(); this.char.dispose(); }
    this.char = new Character(look, { id: 'preview' });
    this.char.setExpression('happy');
    this.studio?.root.add(this.char.root);
  }

  wave() { this.char?.play('wave', 1.4); this.char?.setExpression('happy', 2); }

  _start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      const cam = this.r.camera;
      if (this.mode === 'town') {
        const a = this.t * 0.05;
        cam.position.set(Math.sin(a) * 44, 24, Math.cos(a) * 44);
        cam.lookAt(0, 0, 4);
      } else if (this.mode === 'studio') {
        const wide = innerWidth / innerHeight > 1.15;
        cam.position.set(wide ? 1.05 : 0, 1.05, 3.6);
        cam.lookAt(wide ? 1.05 : 0, 0.72, 0);
        if (this.char) { this.char.root.rotation.y = Math.sin(this.t * 0.6) * 0.35; this.char.yaw = this.char.root.rotation.y; this.char.update(dt); }
      }
      this.r.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
}

// ---------------------------------------------------------------- title

export function titleScreen(ui, { cls, onNew, onContinue, onTeacher, portrait }) {
  const profiles = store.listProfiles();
  const wrap = el('div', { class: 'screen title' });
  const logo = el('div', { class: 'logo' }, [
    el('div', { class: 'logo-mark' }, ['🌸']),
    el('h1', {}, ['ESL ', el('span', {}, ['Social']), ' Life']),
    el('p', {}, ['Make friends. Make plans. Speak English!', el('small', {}, ['友達を作って、約束して、英語で話そう！'])]),
  ]);
  const list = el('div', { class: 'profiles' });
  for (const p of profiles.slice(0, 8)) {
    const d = dateOf(p.day || 0);
    const b = el('button', { class: 'profile' }, [
      el('img', { src: p.look ? portrait(p.look) : '', alt: '' }),
      el('b', {}, [p.name]),
      el('small', {}, [`Day ${(p.day || 0) + 1} · ${d.m}/${d.d}`]),
    ]);
    b.addEventListener('click', () => { unlockAudio(); sfx.select(); onContinue(p.id); });
    list.appendChild(b);
  }
  const newBtn = el('button', { class: 'profile new' }, [el('span', { class: 'plus' }, ['＋']), el('b', {}, ['New player']), el('small', {}, ['はじめから'])]);
  newBtn.addEventListener('click', () => { unlockAudio(); sfx.select(); onNew(); });
  list.appendChild(newBtn);
  const teacher = el('button', { class: 'teacher-btn', title: 'Press and hold for Teacher Setup' }, ['🍎 Teacher', el('i')]);
  let holdT = null;
  const startHold = () => { teacher.classList.add('holding'); holdT = setTimeout(() => { teacher.classList.remove('holding'); unlockAudio(); onTeacher(); }, 1100); };
  const endHold = () => { teacher.classList.remove('holding'); clearTimeout(holdT); };
  teacher.addEventListener('pointerdown', startHold);
  teacher.addEventListener('pointerup', endHold);
  teacher.addEventListener('pointerleave', endHold);
  const cname = el('div', { class: 'classname' }, [`Class ${cls.settings?.className || '5-1'} · ${cls.npcs.length} classmates`]);
  wrap.append(logo, el('div', { class: 'panel' }, [el('h3', {}, ['Who is playing?', el('small', {}, ['だれが遊ぶ？'])]), list]), cname, teacher);
  ui.appendChild(wrap);
  return () => wrap.remove();
}

// ---------------------------------------------------------------- teacher setup

export function teacherScreen(ui, { cls, onDone, portrait }) {
  const wrap = el('div', { class: 'screen teacher' });
  const box = el('div', { class: 'tpanel' });
  wrap.appendChild(box);
  let roster = (cls.roster || []).map((r) => ({ ...r }));
  let seed = cls.seed;

  const render = () => {
    box.innerHTML = '';
    const head = el('div', { class: 'thead' }, [el('h2', {}, ['🍎 Teacher Setup']), el('button', { class: 'tclose' }, ['Done ✓'])]);
    head.lastChild.addEventListener('click', () => { save(); onDone(); });
    box.appendChild(head);
    box.appendChild(el('p', { class: 'tnote' }, [
      'Paste your class list (one name per line). Add ", he" or ", she" after a name to choose a pronoun; otherwise the game uses the name instead of he/she. ',
      el('b', {}, ['All looks, hobbies, skills and personalities are made up by the game — never based on the real student.']),
      ' Names and progress stay on this device only.',
    ]));
    const ta = el('textarea', { class: 'troster', rows: 8, placeholder: 'Ken, he\nYuki, she\nAoi\n…' });
    ta.value = roster.map((r) => `${r.name}${r.pronoun !== 'name' ? ', ' + r.pronoun : ''}`).join('\n');
    const apply = el('button', { class: 'tbtn primary' }, ['Use this list']);
    const sample = el('button', { class: 'tbtn' }, ['Sample class']);
    const shuffle = el('button', { class: 'tbtn' }, ['🎲 New world']);
    const status = el('div', { class: 'tstatus' });
    apply.addEventListener('click', () => {
      const { entries, duplicates, blanks } = parseRoster(ta.value);
      if (entries.length < 3) { status.textContent = 'Please enter at least 3 names.'; return; }
      const prev = new Map(roster.map((r) => [nameKey(r.name), r]));
      roster = entries.map((e) => ({ ...e, lookSeed: prev.get(nameKey(e.name))?.lookSeed || 0 }));
      save();
      status.textContent = `✓ ${entries.length} classmates${duplicates.length ? ` · removed duplicates: ${duplicates.join(', ')}` : ''}${blanks ? ` · skipped ${blanks} blank lines` : ''}`;
      renderList();
    });
    sample.addEventListener('click', () => { roster = DEFAULT_ROSTER.map((r) => ({ ...r })); ta.value = roster.map((r) => `${r.name}, ${r.pronoun}`).join('\n'); save(); renderList(); status.textContent = '✓ Sample class (fictional names)'; });
    shuffle.addEventListener('click', () => {
      if (!confirm('Make a brand-new world? Classmates get new hobbies, looks and schedules. Player progress with them will no longer match.')) return;
      seed = Math.random().toString(36).slice(2, 10);
      cls.npcs = [];
      save(true);
      renderList();
      status.textContent = '✓ New world created';
    });
    box.append(el('div', { class: 'trow' }, [ta, el('div', { class: 'tcol' }, [apply, sample, shuffle, status])]));
    const listBox = el('div', { class: 'tlist' });
    box.appendChild(listBox);
    const renderList = () => {
      listBox.innerHTML = '';
      for (const n of cls.npcs) {
        const entry = roster.find((r) => npcIdFor(r.name) === n.id);
        if (!entry) continue;
        const card = el('div', { class: 'tnpc' }, [el('img', { src: portrait(n.look, n.id + ':' + (n.lookSeed || 0)), alt: '' }), el('b', {}, [n.name])]);
        const pr = el('select', {}, ['name', 'he', 'she'].map((p) => el('option', { value: p, selected: entry.pronoun === p ? 'selected' : null }, [p === 'name' ? 'use name' : p])));
        pr.addEventListener('change', () => { entry.pronoun = pr.value; save(); renderList(); });
        const re = el('button', { class: 'tmini', title: 'New look' }, ['🎲']);
        re.addEventListener('click', () => { entry.lookSeed = (entry.lookSeed || 0) + 1; save(); renderList(); });
        card.append(pr, re);
        listBox.appendChild(card);
      }
    };
    renderList();

    // Settings
    const s = cls.settings;
    const speechSel = el('select', {}, [
      el('option', { value: 'local', selected: s.speech === 'local' ? 'selected' : null }, ['On-device only (recommended)']),
      el('option', { value: 'online', selected: s.speech === 'online' ? 'selected' : null }, ["Allow the browser's online speech service"]),
      el('option', { value: 'off', selected: s.speech === 'off' ? 'selected' : null }, ['Off (tap cards only)']),
    ]);
    speechSel.addEventListener('change', () => { s.speech = speechSel.value; s.allowOnline = speechSel.value === 'online'; save(); });
    const jaSel = el('select', {}, [el('option', { value: '1', selected: s.japanese !== false ? 'selected' : null }, ['Japanese hints ON']), el('option', { value: '0', selected: s.japanese === false ? 'selected' : null }, ['Japanese hints OFF'])]);
    jaSel.addEventListener('change', () => { s.japanese = jaSel.value === '1'; save(); });
    const musicSel = el('select', { 'aria-label': 'Default music' }, [[0, 'Off'], [0.2, 'Quiet'], [0.4, 'Normal']].map(([value, label]) =>
      el('option', { value, selected: (s.musicDefault ?? 0.2) === value ? 'selected' : null }, [label])));
    musicSel.addEventListener('change', () => { s.musicDefault = Number(musicSel.value); save(); });
    box.appendChild(el('div', { class: 'tsettings' }, [
      el('label', {}, ['🎤 Speech input', speechSel]),
      el('label', {}, ['🇯🇵 New players start with', jaSel]),
      el('label', {}, ['Music default · 音楽', musicSel]),
      el('p', { class: 'tnote' }, ['On-device speech keeps students’ voices on the Chromebook (Chrome may need a one-time language download). The online option sends speech audio to the browser maker’s speech service. Read-aloud uses only voices installed on the device unless the online option is chosen.']),
    ]));

    // Profiles & data
    const profiles = store.listProfiles();
    const pbox = el('div', { class: 'tprofiles' }, [el('h3', {}, ['Players on this device'])]);
    for (const p of profiles) {
      const del = el('button', { class: 'tmini danger' }, ['Delete']);
      del.addEventListener('click', () => { if (confirm(`Delete ${p.name}'s progress?`)) { store.deleteProfile(p.id); render(); } });
      pbox.appendChild(el('div', { class: 'tprow' }, [el('b', {}, [p.name]), el('span', {}, [`Day ${(p.day || 0) + 1}`]), del]));
    }
    if (!profiles.length) pbox.appendChild(el('p', { class: 'tnote' }, ['No players yet.']));
    const exp = el('button', { class: 'tbtn' }, ['⬇️ Export (backup file)']);
    exp.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(store.exportAll())], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'esl-social-life-backup.json' });
      document.body.appendChild(a); a.click(); a.remove();
    });
    const imp = el('button', { class: 'tbtn' }, ['⬆️ Import']);
    const file = el('input', { type: 'file', accept: 'application/json', hidden: true });
    imp.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      try { store.importAll(JSON.parse(await file.files[0].text())); location.reload(); } catch (err) { alert('That file could not be imported: ' + err.message); }
    });
    const wipe = el('button', { class: 'tbtn danger' }, ['Delete ALL data']);
    wipe.addEventListener('click', () => { if (confirm('Delete the class list and every player on this device?')) { store.resetEverything(); location.reload(); } });
    box.appendChild(el('div', { class: 'tdata' }, [pbox, el('div', { class: 'tcol' }, [exp, imp, file, wipe])]));
  };

  const save = (fresh = false) => {
    const npcs = buildClass(roster, seed, fresh ? null : cls);
    Object.assign(cls, { seed, roster, npcs, version: 1 });
    store.saveClass(cls);
  };

  render();
  ui.appendChild(wrap);
  return () => wrap.remove();
}

// ---------------------------------------------------------------- character creation

export function randomPlayerLook() {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: r(SKIN_TONES.slice(0, 4)), hairStyle: r(HAIR_STYLES), hairColor: r(HAIR_COLORS.slice(0, 3)), top: r(TOP_STYLES), topColor: r(TOP_COLORS),
    bottom: r(['shorts', 'pants']), bottomColor: r(BOTTOM_COLORS), shoes: r(SHOE_COLORS), bag: r(BAG_COLORS), accessory: 'none', accColor: r(TOP_COLORS), eyes: 'round', height: 1,
  };
}

export function creatorScreen(ui, { cls, stage, onDone, onCancel, editLook = null }) {
  const wrap = el('div', { class: 'screen creator' });
  const panel = el('div', { class: 'cpanel' });
  wrap.appendChild(panel);
  ui.appendChild(wrap);
  let look = editLook ? { ...editLook } : randomPlayerLook();
  const state = { name: '', rosterId: null, like: 'soccer', can: 'run_fast', bm: 5, bd: 10 };
  stage.showCharacter(look);
  let step = editLook ? 'look' : 'name';

  const header = (title, ja, n) => el('div', { class: 'chead' }, [
    editLook ? null : el('div', { class: 'steps' }, [1, 2, 3].map((i) => el('span', { class: i <= n ? 'on' : '' }))),
    el('h2', {}, [title, el('small', {}, [ja])]),
  ]);

  const render = () => {
    panel.innerHTML = '';
    if (step === 'name') renderName();
    else if (step === 'look') renderLook();
    else renderIntro();
  };

  function renderName() {
    panel.appendChild(header("What's your name?", '名前を教えてね', 1));
    panel.appendChild(el('p', { class: 'chint' }, ['Find your name, or type it.', el('small', {}, ['リストから自分の名前をえらぶか、入力してね。'])]));
    const names = el('div', { class: 'namegrid' });
    for (const n of cls.npcs) {
      const b = el('button', { class: `namebtn${state.rosterId === n.id ? ' on' : ''}` }, [n.name]);
      b.addEventListener('click', () => { sfx.select(); state.name = n.name; state.rosterId = n.id; input.value = n.name; render(); });
      names.appendChild(b);
    }
    const input = el('input', { class: 'nameinput', maxlength: 16, placeholder: 'Type your name', value: state.name });
    input.addEventListener('input', () => {
      state.name = input.value.trim();
      const match = cls.npcs.find((n) => nameKey(n.name) === nameKey(state.name));
      state.rosterId = match ? match.id : null;
      for (const b of names.children) b.classList.toggle('on', match && b.textContent === match.name);
      next.disabled = !state.name;
    });
    const next = el('button', { class: 'cnext', disabled: !state.name }, ['Next ›']);
    next.addEventListener('click', () => { if (!state.name) return; sfx.select(); step = 'look'; render(); stage.wave(); });
    const back = el('button', { class: 'cback' }, ['‹ Back']);
    back.addEventListener('click', () => onCancel());
    panel.append(names, input, el('div', { class: 'cnav' }, [back, next]));
    setTimeout(() => input.focus(), 50);
  }

  function swatches(key, colors) {
    const row = el('div', { class: 'swatches' });
    for (const c of colors) {
      const b = el('button', { class: `sw${look[key] === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': c });
      b.addEventListener('click', () => { look[key] = c; sfx.click(); stage.setLook(look); renderLookRows(); });
      row.appendChild(b);
    }
    return row;
  }
  function chips(key, values, labels) {
    const row = el('div', { class: 'chips' });
    for (const v of values) {
      const b = el('button', { class: `chip${look[key] === v ? ' on' : ''}` }, [labels[v] || v]);
      b.addEventListener('click', () => { look[key] = v; sfx.click(); stage.setLook(look); renderLookRows(); });
      row.appendChild(b);
    }
    return row;
  }
  let rows = null;
  function renderLookRows() {
    rows.innerHTML = '';
    const r = (en, ja, node) => rows.appendChild(el('div', { class: 'lrow' }, [el('label', {}, [en, el('small', {}, [ja])]), node]));
    r('Hair', 'かみがた', chips('hairStyle', HAIR_STYLES, HAIR_LABEL));
    r('Hair color', 'かみの色', swatches('hairColor', [...HAIR_COLORS, ...HAIR_COLORS_FUN]));
    r('Skin', 'はだの色', swatches('skin', SKIN_TONES));
    r('Top', 'トップス', chips('top', TOP_STYLES, TOP_LABEL));
    r('Top color', 'トップスの色', swatches('topColor', TOP_COLORS));
    r('Bottoms', 'ボトムス', chips('bottom', ['shorts', 'pants', 'skirt'], BOTTOM_LABEL));
    r('Bottom color', 'ボトムスの色', swatches('bottomColor', BOTTOM_COLORS));
    r('Extra', 'アクセサリー', chips('accessory', ['none', 'glasses', 'cap', 'headband', 'hairclip'], ACC_LABEL));
    r('Shoes', 'くつ', swatches('shoes', SHOE_COLORS));
    r('School bag', 'ランドセル', swatches('bag', BAG_COLORS));
  }
  function renderLook() {
    panel.appendChild(header(editLook ? 'Change your look' : 'Make your character', editLook ? 'みた目を変える' : 'キャラクターを作ろう', 2));
    const rand = el('button', { class: 'chip rand' }, ['🎲 Random']);
    rand.addEventListener('click', () => { look = randomPlayerLook(); stage.setLook(look); stage.wave(); renderLookRows(); });
    rows = el('div', { class: 'lrows' });
    renderLookRows();
    const next = el('button', { class: 'cnext' }, [editLook ? 'Done ✓' : 'Next ›']);
    next.addEventListener('click', () => {
      sfx.select();
      if (editLook) { stage.stop(); wrap.remove(); onDone({ look }); return; }
      step = 'intro'; render(); stage.wave();
    });
    const back = el('button', { class: 'cback' }, [editLook ? 'Cancel' : '‹ Back']);
    back.addEventListener('click', () => { if (editLook) { stage.stop(); wrap.remove(); onCancel(); } else { step = 'name'; render(); } });
    panel.append(rand, rows, el('div', { class: 'cnav' }, [back, next]));
  }

  function renderIntro() {
    panel.appendChild(header('Introduce yourself!', '自己しょうかいをしよう！', 3));
    const sentences = el('div', { class: 'intro-lines' });
    const line = (en, ja, picker) => {
      const row = el('div', { class: 'iline' });
      const say = el('button', { class: 'ihear', title: 'Listen' }, ['🔊']);
      say.addEventListener('click', () => voice.speak(en(), { pitch: 1.25, rate: 0.85 }));
      const txt = el('div', { class: 'itext' });
      const upd = () => { txt.innerHTML = `<b>${escapeHtml(en())}</b><small>${escapeHtml(ja())}</small>`; };
      upd();
      row.append(say, txt);
      if (picker) row.appendChild(picker(upd));
      sentences.appendChild(row);
    };
    line(() => `My name is ${state.name}.`, () => `わたしの名前は${state.name}です。`);
    line(() => `I like ${interest(state.like).en}.`, () => `${interest(state.like).ja}が好きです。`, (upd) => {
      const row = el('div', { class: 'ipick' });
      for (const id of PLAYER_LIKES) {
        const it = interest(id);
        const b = el('button', { class: `pk${state.like === id ? ' on' : ''}`, title: it.en }, [it.emoji]);
        b.addEventListener('click', () => { state.like = id; for (const x of row.children) x.classList.remove('on'); b.classList.add('on'); upd(); sfx.click(); });
        row.appendChild(b);
      }
      return row;
    });
    line(() => `My birthday is ${dateText(state.bm, state.bd)}.`, () => `誕生日は${state.bm}月${state.bd}日です。`, (upd) => {
      const m = el('select', {}, MONTHS.map((mm, i) => el('option', { value: i + 1, selected: state.bm === i + 1 ? 'selected' : null }, [mm])));
      const d = el('select', {}, Array.from({ length: 31 }, (_, i) => el('option', { value: i + 1, selected: state.bd === i + 1 ? 'selected' : null }, [String(i + 1)])));
      m.addEventListener('change', () => { state.bm = Number(m.value); upd(); });
      d.addEventListener('change', () => { state.bd = Number(d.value); upd(); });
      return el('div', { class: 'ipick' }, [m, d]);
    });
    line(() => `I can ${ability(state.can).en}.`, () => ability(state.can).ja, (upd) => {
      const row = el('div', { class: 'ipick' });
      for (const id of PLAYER_CANS) {
        const a = ability(id);
        const b = el('button', { class: `pk${state.can === id ? ' on' : ''}`, title: a.en }, [a.emoji]);
        b.addEventListener('click', () => { state.can = id; for (const x of row.children) x.classList.remove('on'); b.classList.add('on'); upd(); sfx.click(); });
        row.appendChild(b);
      }
      return row;
    });
    const all = el('button', { class: 'chip' }, ['🔊 Listen to all']);
    all.addEventListener('click', async () => {
      for (const s of [`My name is ${state.name}.`, `I like ${interest(state.like).en}.`, `My birthday is ${dateText(state.bm, state.bd)}.`, `I can ${ability(state.can).en}.`]) await voice.speak(s, { pitch: 1.25, rate: 0.85 });
    });
    const back = el('button', { class: 'cback' }, ['‹ Back']);
    back.addEventListener('click', () => { step = 'look'; render(); });
    const go = el('button', { class: 'cnext go' }, ["I'm ready! Let's go! 🌸"]);
    go.addEventListener('click', () => {
      sfx.great();
      stage.stop();
      wrap.remove();
      onDone({ name: state.name, rosterId: state.rosterId, look, like: state.like, can: state.can, birthday: { m: state.bm, d: state.bd } });
    });
    panel.append(el('p', { class: 'chint' }, ['Choose your answers. You will use them to meet classmates!', el('small', {}, ['えらんだ答えは、クラスメートと話すときに使うよ！'])]), sentences, voice.available ? all : null, el('div', { class: 'cnav' }, [back, go]));
  }

  render();
  return () => wrap.remove();
}
