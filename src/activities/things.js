// Playing with the things you bought (DESIGN_DECISIONS 2026-11-23, Phase 2).
// Each play is short, works with cards or speech, and can include a friend
// (a home visit passes `friend`). Solo play is free: no time, XP or memory.
// With a friend it is part of the visit, which is rewarded once by its event.
//   robot   — "Go straight! / Turn left! / Turn right! / Stop!" moves a robot
//             on a floor grid to a star;
//   pairs   — Picture Pairs, the board game: a memory game with English words;
//   kendama — timing tricks (big cup, small cup, spike), taking turns;
//   read    — a four-page picture story (book or comic);
//   draw    — colored pencils, reusing the hobby drawing; the picture hangs on
//             the bedroom wall;
//   kickups — the soccer ball in the park; a soccer fan may come over.

import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { voice } from '../dialogue/voice.js';
import { sfx } from '../core/audio.js';
import { el, wait } from '../core/util.js';
import { rngFor } from '../core/rng.js';
import { faultPoint } from '../core/fault.js';
import { onActivityCleanup, runActivityCleanup, recoverGame } from './recovery.js';
import { paintPicture, COLORS } from './hobby.js';
import { makeBall } from './ballplay.js';
import { confirmTime } from '../dialogue/common.js';
import { THINGS, owns, addDrawing, npcSkill, goodAt, noticeFor, markNoticed, setWorn, isWorn } from '../world/things.js';

// ------------------------------------------------------------ shared helpers

let state = { play: null, phase: 'idle' };
const setState = (patch) => { state = { ...state, ...patch }; };
/** Frozen semantic state for tests (window.__esl.thingPlay). */
export function thingPlaySnapshot() { return Object.freeze(JSON.parse(JSON.stringify(state))); }

const speaker = (name, color) => ({ special: 'thing', npc: { name, color, role: 'My Things マイ・グッズ', voice: { pitch: 1.2, rate: 0.95 } }, char: { setTalking() {}, setExpression() {}, play() {} } });
const tag = (a) => ({ name: a.npc.name, color: a.npc.color || '#E0607E' });
const sayWord = (game, text) => { if (game.settings.voice) voice.speak(text, { pitch: 1.05, rate: 0.85 }); };

/** A canvas board with its own caption strip, so lines never cover the board. */
function board(game, { w = 640, h = 400, cls = '', side = false } = {}) {
  const canvas = el('canvas', { width: w, height: h });
  const cap = el('div', { class: 'thing-cap', hidden: true });
  // With a friend the board sits on the left so both players stay in view on the right.
  const root = el('div', { class: `act-temp thing-board ${cls}${side ? ' side' : ''}` }, [canvas, cap]);
  game.activityHud.setScore([], 0);
  game.uiRoot.appendChild(root);
  const close = () => root.remove();
  onActivityCleanup(game, close);
  const say = (who, en = '', ja = '') => {
    if (!who || !en) { cap.hidden = true; return; }
    cap.hidden = false;
    cap.innerHTML = '';
    cap.append(el('b', { style: `color:${who.color}` }, [who.name]), ' ', en, game.settings.japanese && ja ? el('small', {}, [ja]) : '');
  };
  return { canvas, ctx: canvas.getContext('2d'), root, close, say, W: w, H: h };
}

/**
 * A requestAnimationFrame loop that the activity cleanup always stops. An
 * error stops the loop and goes to `onError` (a promise's reject), so an
 * activity waiting on it fails instead of hanging.
 */
function loop(game, fn, onError = (err) => console.error('[thing loop]', err)) {
  let alive = true, last = performance.now();
  const step = (t) => {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    try { fn(dt); } catch (err) { alive = false; onError(err); return; }
    if (alive) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const stop = () => { alive = false; };
  onActivityCleanup(game, stop);
  return stop;
}

/** Window key handler that the cleanup removes. */
function keys(game, fn) {
  const h = (e) => fn(e);
  window.addEventListener('keydown', h, true);
  const off = () => window.removeEventListener('keydown', h, true);
  onActivityCleanup(game, off);
  return off;
}

/**
 * Run a solo or shared thing activity safely. Solo play (no conversation
 * given) opens its own conversation; an error recovers the game.
 */
export async function runThing(game, fn, { conversation = null, friend = null } = {}) {
  const own = !conversation;
  const c = conversation || await Conversation.start(game, friend ? [friend] : [], { frame: false });
  try {
    return await fn(c);
  } catch (err) {
    console.error('[thing] failed', err);
    if (!own) throw err;
    recoverGame(game, { actors: friend ? [friend] : [] });
    return { status: 'failed' };
  } finally {
    runActivityCleanup(game);
    game.activityHud.hide();
    setState({ play: null, phase: 'idle' });
    if (own) { await c.end(); game.save(); }
  }
}

// ------------------------------------------------------------ robot

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_EN = ['up', 'right', 'down', 'left'];
export const ROBOT_LEVELS = [
  { start: { x: 2, y: 4, d: 0 }, star: { x: 2, y: 1 }, blocks: [] },
  { start: { x: 0, y: 4, d: 0 }, star: { x: 3, y: 1 }, blocks: [] },
  { start: { x: 4, y: 4, d: 3 }, star: { x: 1, y: 0 }, blocks: [{ x: 1, y: 4 }, { x: 2, y: 1 }] },
];
const GRID = 5;
const blockedAt = (lv, x, y) => x < 0 || y < 0 || x >= GRID || y >= GRID || lv.blocks.some((b) => b.x === x && b.y === y);

/** Shortest command list (straight runs, turns) from a robot pose to a cell: used by the friend's turn. */
export function robotPath(lv, from, to) {
  const key = (s) => `${s.x},${s.y},${s.d}`;
  const start = { ...from }, seen = new Map([[key(start), null]]);
  const q = [start];
  while (q.length) {
    const s = q.shift();
    if (s.x === to.x && s.y === to.y) {
      const cmds = [];
      for (let cur = s; seen.get(key(cur)); cur = seen.get(key(cur)).prev) cmds.unshift(seen.get(key(cur)).cmd);
      // Merge single steps into "Go straight! ... Stop!" runs.
      const out = [];
      for (const c of cmds) { if (c === 'straight' && out[out.length - 1]?.id === 'straight') out[out.length - 1].n++; else out.push(c === 'straight' ? { id: 'straight', n: 1 } : { id: c }); }
      return out;
    }
    const nexts = [['left', { ...s, d: (s.d + 3) % 4 }], ['right', { ...s, d: (s.d + 1) % 4 }]];
    const [dx, dy] = DIRS[s.d];
    if (!blockedAt(lv, s.x + dx, s.y + dy)) nexts.push(['straight', { x: s.x + dx, y: s.y + dy, d: s.d }]);
    for (const [cmd, n] of nexts) if (!seen.has(key(n))) { seen.set(key(n), { prev: s, cmd }); q.push(n); }
  }
  return null;
}

const ROBOT_CARDS = {
  straight: opt('straight', 'Go straight!', 'まっすぐ進んで！', { emoji: '⬆️', phrases: ['go straight', 'straight', 'go'], keys: [['straight', 'go']], area: 'directions', expr: 'd.straight', template: 'Go straight.' }),
  left: opt('left', 'Turn left!', '左に曲がって！', { emoji: '⬅️', phrases: ['turn left', 'left'], keys: [['left']], area: 'directions', expr: 'd.left', template: 'Turn left.' }),
  right: opt('right', 'Turn right!', '右に曲がって！', { emoji: '➡️', phrases: ['turn right', 'right'], keys: [['right']], area: 'directions', expr: 'd.right', template: 'Turn right.' }),
  stop: opt('stop', 'Stop!', 'とまって！', { emoji: '✋', phrases: ['stop', 'stop please'], keys: [['stop']], area: 'directions', expr: 'd.stop', template: 'Stop.' }),
  done: opt('done', 'Let’s finish.', 'おしまいにしよう。', { emoji: '🏁', phrases: ["let's finish", 'finish'], keys: [['finish']], tone: 'quiet' }),
};

export async function playRobot(game, { friend = null, conversation = null } = {}) {
  return runThing(game, async (c) => {
    setState({ play: 'robot', phase: 'intro', level: 0, stars: 0 });
    const robotVoice = speaker('🤖 Robot', '#4E9CC4');
    const host = friend || robotVoice;
    if (friend) {
      await c.say(friend, line('Can I play with your robot?', 'ロボットで遊んでもいい？', { area: 'wantto', expr: 'q.canplay', template: 'Can I ___?' }), { gesture: 'happy', expr: 'happy' });
      await c.ask([opt('sure', "Sure! Let's play!", 'いいよ！遊ぼう！', { emoji: '🤖', phrases: ['sure', "let's play"], keys: [['sure', 'play']] })]);
    }
    await c.say(robotVoice, line('Beep boop! Hello! I am Robo. Tell me: Go straight, Turn left, Turn right or Stop!', 'ピポパ！こんにちは、ロボだよ。「まっすぐ」「左」「右」「とまって」と言ってね！', { area: 'directions' }));
    const b = board(game, { cls: 'robot-board', side: !!friend });
    const robot3d = game.scene.robot || null;
    let lv = null, pose = null, moving = false, t = 0, stopAsk = false, bump = 0, won = false, starFx = 0;
    const draw = () => {
      const { ctx, W, H } = b, cell = 70, ox = (W - cell * GRID) / 2, oy = (H - cell * GRID) / 2;
      ctx.fillStyle = '#F3E7D3'; ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) { ctx.fillStyle = (x + y) % 2 ? '#E9D6B8' : '#F1E2C8'; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
      ctx.strokeStyle = '#C9AE86'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, cell * GRID, cell * GRID);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '40px "Segoe UI Emoji","Noto Color Emoji",sans-serif';
      for (const k of lv.blocks) { ctx.fillStyle = '#F08C3C'; ctx.fillRect(ox + k.x * cell + 8, oy + k.y * cell + 8, cell - 16, cell - 16); ctx.fillStyle = '#FFF'; ctx.font = '900 18px Nunito, sans-serif'; ctx.fillText('BOX', ox + k.x * cell + cell / 2, oy + k.y * cell + cell / 2); }
      ctx.font = `${44 + Math.sin(starFx * 6) * 4}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      if (!won) ctx.fillText('⭐', ox + lv.star.x * cell + cell / 2, oy + lv.star.y * cell + cell / 2 + 2);
      const [dx, dy] = DIRS[pose.d];
      const prog = moving && !blockedAt(lv, pose.x + dx, pose.y + dy) ? t : 0;
      const shake = bump > 0 ? Math.sin(bump * 40) * 4 : 0;
      const rx = ox + (pose.x + dx * prog) * cell + cell / 2 + shake, ry = oy + (pose.y + dy * prog) * cell + cell / 2;
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(pose.d * Math.PI / 2);
      ctx.fillStyle = '#7EB7CD'; ctx.beginPath(); ctx.roundRect(-24, -24, 48, 48, 10); ctx.fill();
      ctx.fillStyle = '#A6D7E6'; ctx.beginPath(); ctx.roundRect(-18, -30, 36, 20, 6); ctx.fill();
      ctx.fillStyle = '#2E3440'; ctx.beginPath(); ctx.arc(-8, -20, 4, 0, Math.PI * 2); ctx.arc(8, -20, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#EAC05D'; ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(10, -32); ctx.lineTo(-10, -32); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(30,35,64,0.8)'; ctx.fillRect(10, 10, 132, 34);
      ctx.fillStyle = '#FFF'; ctx.font = '800 18px Nunito, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`⭐ ${state.stars} / ${ROBOT_LEVELS.length}`, 22, 28);
      ctx.textAlign = 'center';
    };
    const tick = (dt) => {
      starFx += dt;
      bump = Math.max(0, bump - dt);
      if (moving) {
        const [dx, dy] = DIRS[pose.d];
        if (blockedAt(lv, pose.x + dx, pose.y + dy)) { if (bump <= 0) { bump = 0.35; sfx.deny(); } if (stopAsk) { moving = false; stopAsk = false; t = 0; } }
        else if (stopAsk && t < 0.35) { moving = false; stopAsk = false; t = 0; }
        else {
          t += dt / 0.95;
          if (t >= 1) { pose = { ...pose, x: pose.x + dx, y: pose.y + dy }; t = 0; sfx.blip(1.2); if (stopAsk) { moving = false; stopAsk = false; } }
        }
      }
      if (robot3d) { robot3d.rotation.y = -pose.d * Math.PI / 2; robot3d.position.y = moving ? Math.abs(Math.sin(starFx * 12)) * 0.04 : 0; }
      setState({ pose: { ...pose }, moving, star: lv.star, blocked: moving && blockedAt(lv, pose.x + DIRS[pose.d][0], pose.y + DIRS[pose.d][1]) });
      draw();
    };
    const waitStopped = () => new Promise((res) => { const chk = () => (moving ? setTimeout(chk, 50) : res()); chk(); });
    const run = async (id) => {
      faultPoint('thing:robot');
      if (id === 'left' || id === 'right') { pose = { ...pose, d: (pose.d + (id === 'left' ? 3 : 1)) % 4 }; sfx.select(); }
      else if (id === 'straight') { moving = true; t = 0; }
      else if (id === 'stop') { stopAsk = true; await waitStopped(); }
    };
    loop(game, tick);
    game.activityHud.show('🤖 Robot');
    b.say(robotVoice.npc, 'Help Robo get the star!', 'ロボを星まで連れていこう！');
    for (let i = 0; i < ROBOT_LEVELS.length; i++) {
      lv = { ...ROBOT_LEVELS[i] };
      // A friend picks where the star goes on the second level.
      if (friend && i === 1) {
        const r = rngFor(friend.npc.id, game.world.day, 'robot-star');
        const spots = [{ x: 3, y: 1 }, { x: 4, y: 0 }, { x: 1, y: 1 }, { x: 4, y: 2 }];
        lv.star = spots[Math.floor(r.next() * spots.length)];
        b.say(tag(friend), 'I put the star here! Can you get it?', '星をここに置いたよ！取れる？');
        friend.char.play('point', 1.2);
      }
      pose = { ...lv.start };
      won = false;
      setState({ level: i, phase: 'playing', pose: { ...pose }, star: lv.star, moving: false });
      // The friend gives the commands on the last level.
      if (friend && i === ROBOT_LEVELS.length - 1) {
        b.say(tag(friend), 'My turn! I can do it!', 'わたしの番！できるよ！');
        await wait(900);
        const path = robotPath(lv, pose, lv.star) || [];
        for (const step of path) {
          const card = ROBOT_CARDS[step.id];
          b.say(tag(friend), card.en, card.ja);
          friend.char.play('point', 0.9);
          await run(step.id);
          if (step.id === 'straight') {
            const goal = { x: pose.x + DIRS[pose.d][0] * step.n, y: pose.y + DIRS[pose.d][1] * step.n };
            await new Promise((res) => { const chk = () => ((pose.x === goal.x && pose.y === goal.y) || !moving ? res() : setTimeout(chk, 40)); chk(); });
            b.say(tag(friend), 'Stop!', 'とまって！');
            await run('stop');
          }
          await wait(650);
        }
      } else {
        for (let guard = 0; guard < 80; guard++) {
          if (!moving && pose.x === lv.star.x && pose.y === lv.star.y) break;
          const cards = moving ? [ROBOT_CARDS.stop] : [ROBOT_CARDS.straight, ROBOT_CARDS.left, ROBOT_CARDS.right, ROBOT_CARDS.done];
          const pick = await c.ask(cards, { silent: true, columns: moving ? 1 : 2, prompt: { name: '🤖 Robot', color: '#4E9CC4', en: moving ? 'Robo is walking! Say “Stop!” at the star.' : `Robo is facing ${DIR_EN[pose.d]}. What do you say?`, ja: moving ? '星のところで「とまって！」と言おう。' : 'なんて言う？' } });
          if (pick.id === 'done') { setState({ phase: 'done' }); game.dialogue.close(); return { status: 'completed', detail: { item: 'robot', stars: state.stars, finished: false } }; }
          game.activityHud.pop(pick.en, 'good');
          await run(pick.id);
        }
      }
      if (pose.x === lv.star.x && pose.y === lv.star.y) {
        won = true;
        setState({ stars: state.stars + 1 });
        sfx.great();
        game.activityHud.pop('⭐ You got the star!', 'good');
        if (friend) friend.char.play('cheer', 1.2);
        await wait(1100);
      }
    }
    setState({ phase: 'result' });
    game.activityHud.hide();
    b.close();
    if (robot3d) { robot3d.rotation.y = 0; robot3d.position.y = 0; }
    await c.say(robotVoice, line(`Beep! Thank you! I got ${state.stars} stars!`, `ピッ！ありがとう！星を${state.stars}こ取ったよ！`), {});
    if (friend) {
      await c.say(friend, line('Your robot is so funny! You’re good at giving directions!', 'あなたのロボット、おもしろい！道案内がじょうずだね！', { area: 'adjectives' }), { gesture: 'happy', expr: 'happy' });
      await c.ask([opt('fun', 'That was fun!', '楽しかった！', { emoji: '🤖', phrases: ['that was fun', 'fun'], keys: [['fun']] })]);
    } else {
      await c.ask([opt('bye', 'Bye, Robo!', 'バイバイ、ロボ！', { emoji: '👋', phrases: ['bye robo', 'bye'], keys: [['bye']] })]);
    }
    return { status: 'completed', detail: { item: 'robot', stars: state.stars, coop: !!friend, result: `${state.stars} stars` } };
  }, { conversation, friend });
}

// ------------------------------------------------------------ Picture Pairs (the board game)

export const PAIR_WORDS = [
  { id: 'cat', en: 'a cat', emoji: '🐱' }, { id: 'dog', en: 'a dog', emoji: '🐶' }, { id: 'apple', en: 'an apple', emoji: '🍎' },
  { id: 'ball', en: 'a ball', emoji: '⚽' }, { id: 'star', en: 'a star', emoji: '⭐' }, { id: 'fish', en: 'a fish', emoji: '🐟' },
  { id: 'cake', en: 'a cake', emoji: '🍰' }, { id: 'bike', en: 'a bike', emoji: '🚲' }, { id: 'flower', en: 'a flower', emoji: '🌷' },
  { id: 'rabbit', en: 'a rabbit', emoji: '🐰' },
];

/** A shuffled deck of 12 cards (6 pairs). */
export function pairsDeck(seed) {
  const r = rngFor('pairs-v1', seed);
  const words = r.sample(PAIR_WORDS, 6);
  return r.shuffle([...words, ...words].map((w) => w.id));
}

/**
 * The friend's move: a known pair first; otherwise one new card, then its
 * remembered match or another new card. `memory` maps index → word id.
 */
export function pairsMove(deck, matched, memory, rnd) {
  const open = deck.map((_, i) => i).filter((i) => !matched.has(i));
  const known = open.filter((i) => memory.has(i));
  for (const i of known) for (const j of known) if (i < j && memory.get(i) === memory.get(j)) return [i, j];
  const unknown = open.filter((i) => !memory.has(i));
  const first = (unknown.length ? unknown : open)[Math.floor(rnd() * (unknown.length || open.length))];
  const mate = known.find((j) => j !== first && memory.get(j) === deck[first]);
  if (mate !== undefined) return [first, mate];
  const rest = (unknown.length > 1 ? unknown : open).filter((i) => i !== first);
  return [first, rest[Math.floor(rnd() * rest.length)]];
}

export async function playPairs(game, { friend = null, conversation = null } = {}) {
  return runThing(game, async (c) => {
    const w = game.world;
    const seed = `${w.save.id}|${w.day}|${w.period}|${friend?.npc.id || 'solo'}|${(state.pairsRound = (state.pairsRound || 0) + 1)}`;
    const deck = pairsDeck(seed);
    const word = (id) => PAIR_WORDS.find((x) => x.id === id);
    const host = friend || speaker('🎲 Picture Pairs', '#C2569A');
    await c.say(host, line(friend ? "Let's play Picture Pairs! Find two cards that match. You go first!" : 'Picture Pairs! Find two cards that match.', friend ? 'ピクチャー・ペアをしよう！同じカードを2まい見つけてね。先にどうぞ！' : 'ピクチャー・ペア！同じカードを2まい見つけよう。', { area: 'wantto' }), friend ? { gesture: 'happy', expr: 'happy' } : {});
    game.dialogue.close();
    const b = board(game, { cls: 'pairs-board', side: !!friend });
    const hud = game.activityHud;
    hud.show('🎲 Picture Pairs');
    b.say(host.npc, 'Click two cards. Arrow keys + Space work too.', 'カードを2まいえらぼう。矢印キーとスペースでもOK。');
    const faceUp = new Set(), matched = new Map(); // index → 'me' | 'friend'
    const memory = new Map();
    const skill = friend ? npcSkill(friend.npc, 'pairs') : 0;
    const rnd = (() => { const r = rngFor('pairs-npc', seed); return () => r.next(); })();
    let cursor = 0, turn = 'me', tries = 0;
    const score = { me: 0, friend: 0 };
    const cols = 4, cw = 130, ch = 110, gap = 14, ox = (640 - (cols * cw + (cols - 1) * gap)) / 2, oy = 22;
    const rect = (i) => ({ x: ox + (i % cols) * (cw + gap), y: oy + Math.floor(i / cols) * (ch + gap) });
    const draw = () => {
      const { ctx } = b;
      ctx.fillStyle = '#2F6E5A'; ctx.fillRect(0, 0, 640, 400);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      deck.forEach((id, i) => {
        const r = rect(i), up = faceUp.has(i) || matched.has(i);
        ctx.fillStyle = matched.has(i) ? (matched.get(i) === 'me' ? '#FFE8D6' : '#E3F2FD') : up ? '#FFFFFF' : '#F4B860';
        ctx.beginPath(); ctx.roundRect(r.x, r.y, cw, ch, 14); ctx.fill();
        if (turn === 'me' && i === cursor && !matched.has(i)) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5; ctx.stroke(); }
        if (up) {
          ctx.font = '48px "Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillStyle = '#000';
          ctx.fillText(word(id).emoji, r.x + cw / 2, r.y + 44);
          ctx.font = '800 18px Nunito, sans-serif'; ctx.fillStyle = '#3A3A55';
          ctx.fillText(word(id).en, r.x + cw / 2, r.y + 90);
        } else { ctx.font = '900 40px Nunito, sans-serif'; ctx.fillStyle = '#FFFFFF'; ctx.fillText('?', r.x + cw / 2, r.y + ch / 2 + 2); }
      });
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 372, 640, 28);
      ctx.fillStyle = '#FFF'; ctx.font = '800 17px Nunito, sans-serif';
      ctx.fillText(friend ? `${w.save.player.name}: ${score.me}   ·   ${friend.npc.name}: ${score.friend}   ·   ${turn === 'me' ? 'Your turn!' : `${friend.npc.name}'s turn`}` : `Pairs: ${score.me} / 6   ·   Tries: ${tries}`, 320, 386);
    };
    const snap = () => setState({ play: 'pairs', phase: 'playing', turn, score: { ...score }, matched: matched.size / 2, deck: [...deck], faceUp: [...faceUp], open: deck.map((_, i) => i).filter((i) => !matched.has(i)), cursor });
    snap(); draw();
    const remember = (i) => { if (friend && rnd() < skill + 0.15) memory.set(i, deck[i]); };
    const flip = async (i, who) => {
      faceUp.add(i); remember(i); sfx.pop();
      const wd = word(deck[i]);
      if (who === 'friend') b.say(tag(friend), `${wd.en.charAt(0).toUpperCase()}${wd.en.slice(1)}!`, '');
      snap(); draw();
      await wait(who === 'friend' ? 750 : 250);
    };
    // One input handler for the whole game: arrows always move the cursor, and
    // a pick made during a flip animation waits instead of being lost.
    let waiting = null, queued = null;
    const choose = (i) => {
      if (i < 0 || i >= deck.length || matched.has(i) || faceUp.has(i)) return;
      if (waiting) { const r = waiting; waiting = null; r(i); } else if (turn === 'me') queued = i;
    };
    const pickByPlayer = () => new Promise((resolve) => {
      if (queued !== null && !matched.has(queued) && !faceUp.has(queued)) { const i = queued; queued = null; resolve(i); return; }
      queued = null;
      waiting = resolve;
    });
    const onPtr = (e) => {
      e.preventDefault();
      const r = b.canvas.getBoundingClientRect(), x = (e.clientX - r.left) * (640 / r.width), y = (e.clientY - r.top) * (400 / r.height);
      const i = deck.findIndex((_, k) => { const q = rect(k); return x >= q.x && x <= q.x + cw && y >= q.y && y <= q.y + ch; });
      if (i >= 0) { cursor = i; choose(i); }
    };
    b.canvas.addEventListener('pointerdown', onPtr);
    onActivityCleanup(game, () => b.canvas.removeEventListener('pointerdown', onPtr));
    keys(game, (e) => {
      const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.code];
      if (mv) { e.preventDefault(); e.stopPropagation(); cursor = (cursor + mv + deck.length) % deck.length; snap(); draw(); }
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) choose(cursor); }
    });
    let firstMine = true;
    while (matched.size < deck.length) {
      faultPoint('thing:pairs');
      let a, bIdx;
      if (turn === 'me') {
        if (friend && firstMine) b.say(tag(friend), 'Your turn! Which card do you want?', 'あなたの番！どのカードにする？');
        firstMine = false;
        a = await pickByPlayer(); await flip(a, 'me');
        bIdx = await pickByPlayer(); await flip(bIdx, 'me');
        tries++;
      } else {
        friend.char.play('think', 1.0);
        b.say(tag(friend), 'Hmm... I want this one!', 'うーん…これにする！');
        await wait(800);
        [a, bIdx] = pairsMove(deck, matched, memory, rnd);
        friend.char.play('point', 0.8);
        await flip(a, 'friend');
        await flip(bIdx, 'friend');
      }
      if (deck[a] === deck[bIdx]) {
        matched.set(a, turn); matched.set(bIdx, turn);
        score[turn]++;
        const wd = word(deck[a]);
        sfx.great();
        hud.pop(`${wd.emoji} A pair!`, 'good');
        sayWord(game, wd.en);
        if (turn === 'friend') { b.say(tag(friend), `Yes! ${wd.en.charAt(0).toUpperCase()}${wd.en.slice(1)}! I got a pair!`, 'やった！ペアだ！'); friend.char.play('happy', 1); }
        else if (friend) b.say(tag(friend), `Great job! It's ${wd.en}!`, 'すごい！');
      } else {
        sfx.deny();
        await wait(850);
        if (friend) turn = turn === 'me' ? 'friend' : 'me';
      }
      faceUp.clear();
      snap(); draw();
      await wait(350);
    }
    hud.hide();
    b.close();
    const result = !friend ? 'solo' : score.me > score.friend ? 'you' : score.me < score.friend ? 'friend' : 'tie';
    setState({ play: 'pairs', phase: 'result', result, score: { ...score }, tries });
    if (!friend) {
      await c.say(host, line(`You found all six pairs in ${tries} tries!`, `${tries}回で6ペアぜんぶ見つけたね！`));
      await c.ask([opt('fun', 'That was fun!', '楽しかった！', { emoji: '🎲', phrases: ['that was fun', 'fun'], keys: [['fun']] })]);
    } else {
      if (result === 'you') await c.say(friend, line(`You win! You have ${score.me} pairs! You're good at this game!`, `あなたの勝ち！${score.me}ペアだね！このゲーム、とくいだね！`, { area: 'adjectives', expr: 'i.goodat', template: "You're good at ___!" }), { gesture: 'clap', expr: 'happy' });
      else if (result === 'friend') await c.say(friend, line(`I win! I have ${score.friend} pairs! Let's play again sometime!`, `わたしの勝ち！${score.friend}ペア！また今度やろうね！`), { gesture: 'cheer', expr: 'happy' });
      else await c.say(friend, line("It's a tie! We're both good at this game!", '引き分け！二人ともじょうずだね！', { area: 'adjectives' }), { gesture: 'happy', expr: 'happy' });
      await c.ask([opt('good', 'Good game!', 'いい試合だったね！', { emoji: '🤝', phrases: ['good game', 'that was fun'], keys: [['good', 'fun']] })]);
    }
    return { status: 'completed', detail: { item: 'board_game', result, coop: !!friend, pairs: score.me, friendPairs: score.friend } };
  }, { conversation, friend });
}

// ------------------------------------------------------------ kendama

const TRICKS = [
  { id: 'big', en: 'the big cup', ja: '大皿', zone: 0.3 },
  { id: 'small', en: 'the small cup', ja: '小皿', zone: 0.2 },
  { id: 'spike', en: 'the spike', ja: 'けん先', zone: 0.12 },
];

function setZone(hud, width) {
  const z = hud.meter.querySelector('.act-zone');
  z.style.left = `${(0.5 - width / 2) * 100}%`;
  z.style.width = `${width * 100}%`;
}

export async function playKendama(game, { friend = null, conversation = null } = {}) {
  return runThing(game, async (c) => {
    const hud = game.activityHud;
    const host = friend || speaker('🪀 Kendama', '#B5651D');
    await c.say(host, line(friend ? "Let's take turns! Press CATCH when the arrow is in the green!" : 'Press CATCH when the arrow is in the green!', friend ? '交代でやろう！矢印が緑のときにCATCH！' : '矢印が緑のときにCATCHをおそう！'), friend ? { gesture: 'happy', expr: 'happy' } : {});
    game.dialogue.close();
    const b = board(game, { w: 640, h: 300, cls: 'kendama-board' });
    hud.show('🪀 Kendama');
    game.player.char.setProp('kendama');
    if (friend) friend.char.setProp('kendama');
    const skill = friend ? npcSkill(friend.npc, 'kendama') : 0;
    const r = rngFor('kendama', friend?.npc.id || 'solo', game.world.day, game.world.period);
    let ball = { x: 0, y: 0, t: 0, mode: 'swing', target: null }, label = '';
    const draw = () => {
      const { ctx } = b;
      ctx.fillStyle = '#FFF4E0'; ctx.fillRect(0, 0, 640, 300);
      const kx = 320, ky = 210;
      ctx.fillStyle = '#C8874A'; ctx.fillRect(kx - 10, ky - 40, 20, 110);
      ctx.fillStyle = '#A0662F'; ctx.fillRect(kx - 70, ky - 40, 140, 18);
      ctx.fillStyle = '#E0A466'; ctx.beginPath(); ctx.ellipse(kx - 60, ky - 44, 22, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(kx + 60, ky - 44, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8C5A2B'; ctx.beginPath(); ctx.moveTo(kx - 5, ky - 40); ctx.lineTo(kx, ky - 70); ctx.lineTo(kx + 5, ky - 40); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(kx, ky - 22); ctx.lineTo(320 + ball.x, 120 + ball.y); ctx.stroke();
      ctx.fillStyle = '#E5534B'; ctx.beginPath(); ctx.arc(320 + ball.x, 120 + ball.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3A3A55'; ctx.font = '800 20px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, 320, 284);
    };
    loop(game, (dt) => {
      ball.t += dt;
      if (ball.mode === 'swing') { ball.x = Math.sin(ball.t * 2.4) * 120; ball.y = -Math.abs(Math.cos(ball.t * 2.4)) * 50; }
      else if (ball.mode === 'land' && ball.target) { ball.x += (ball.target.x - ball.x) * Math.min(1, dt * 10); ball.y += (ball.target.y - ball.y) * Math.min(1, dt * 10); }
      else if (ball.mode === 'miss') { ball.y += dt * 120; ball.x += dt * 60; }
      draw();
    });
    const landing = { big: { x: -60, y: 62 }, small: { x: 60, y: 64 }, spike: { x: 0, y: 34 } };
    const score = { me: 0, friend: 0 };
    const tryTrick = async (trick, who) => {
      faultPoint('thing:kendama');
      ball = { x: 0, y: 0, t: 0, mode: 'swing', target: null };
      label = `${who === 'me' ? 'Your turn' : `${friend.npc.name}'s turn`}: ${trick.en}`;
      hud.setHint(`Catch it on ${trick.en}!`, `${trick.ja}にのせよう！`);
      setZone(hud, trick.zone);
      hud.showMeter(true);
      let v = 0, tt = r.next() * 3, pressed = null;
      if (who === 'me') hud.button('🪀 CATCH!', () => { if (pressed === null) pressed = v; }, 'catch');
      else {
        hud.button(null);
        hud.say(tag(friend), 'My turn! Watch me!', 'わたしの番！見ててね！');
        friend.char.play('hold', 1.4);
      }
      const ok = who === 'friend' ? r.next() < Math.min(0.85, skill + (trick.zone - 0.12)) : null;
      const friendAt = ok === null ? null : 0.6 + r.next() * 1.2;
      let el2 = 0;
      await new Promise((res, rej) => {
        const stop = loop(game, (dt) => {
          tt += dt; el2 += dt;
          v = 0.5 + 0.5 * Math.sin(tt * 2.8);
          hud.setNeedle(v);
          if (friendAt !== null && el2 >= friendAt && pressed === null) pressed = ok ? 0.5 + (r.next() - 0.5) * trick.zone * 0.8 : (r.next() < 0.5 ? 0.5 - trick.zone : 0.5 + trick.zone) + (r.next() - 0.5) * 0.1;
          if (pressed !== null) { stop(); res(); }
        }, rej);
      });
      hud.button(null);
      const success = Math.abs(pressed - 0.5) <= trick.zone / 2;
      setState({ play: 'kendama', phase: 'playing', trick: trick.id, who, success });
      if (success) { ball.mode = 'land'; ball.target = landing[trick.id]; sfx.great(); hud.pop('Catch! 🎉', 'good'); score[who]++; }
      else { ball.mode = 'miss'; sfx.deny(); hud.pop('Oops!', 'wait'); }
      (who === 'me' ? game.player.char : friend.char).play(success ? 'cheer' : 'shake', 1);
      if (friend && who === 'friend') hud.say(tag(friend), success ? 'Yes! I did it!' : 'Oh no! So close!', success ? 'やった！できた！' : 'あー！おしい！');
      else if (friend) hud.say(tag(friend), success ? "Great job! You're good at kendama!" : "Nice try! Let's try again!", success ? 'すごい！けん玉じょうずだね！' : 'おしい！またやろう！');
      await wait(1300);
      hud.showMeter(false);
    };
    for (const trick of TRICKS) {
      await tryTrick(trick, 'me');
      if (friend) await tryTrick(trick, 'friend');
    }
    hud.hide();
    b.close();
    setZone(hud, 0.28);
    game.player.char.setProp(null);
    if (friend) friend.char.setProp(null);
    setState({ play: 'kendama', phase: 'result', score: { ...score } });
    if (friend) {
      await c.say(friend, score.me >= score.friend ? line(`You did ${score.me} tricks! You're good at kendama!`, `${score.me}回せいこう！けん玉がとくいだね！`, { area: 'adjectives', template: "You're good at ___!" }) : line(`I did ${score.friend} tricks! Let's practice together!`, `わたしは${score.friend}回！いっしょに練習しよう！`), { gesture: 'happy', expr: 'happy' });
      await c.ask([opt('fun', 'That was fun!', '楽しかった！', { emoji: '🪀', phrases: ['that was fun', 'fun'], keys: [['fun']] })]);
    } else {
      await c.say(host, line(`You did ${score.me} of 3 tricks!`, `3つのわざのうち${score.me}つできたね！`));
      await c.ask([opt('again', "I'll practice more!", 'もっと練習するぞ！', { emoji: '💪', phrases: ['practice', 'more'], keys: [['practice', 'more']] })]);
    }
    return { status: 'completed', detail: { item: 'kendama', tricks: score.me, friendTricks: score.friend, coop: !!friend, result: `${score.me} tricks` } };
  }, { conversation, friend });
}

// ------------------------------------------------------------ reading

export const STORIES = {
  book: { title: 'Momo the Cat', ja: 'ねこのモモ', pages: [
    { pic: '🐱 🏠', en: 'This is Momo. Momo is a cat.', ja: 'これはモモ。モモはねこです。' },
    { pic: '🐱 🐟 🐟', en: 'Momo likes fish. Momo can’t swim.', ja: 'モモは魚が好き。モモは泳げません。' },
    { pic: '🌳 🐱 ⬆️', en: 'Momo can climb trees. Momo is brave!', ja: 'モモは木に登れます。モモは勇かん！' },
    { pic: '🌙 🐱 💤', en: 'It’s nine o’clock. Good night, Momo!', ja: '9時です。おやすみ、モモ！' },
  ] },
  comic: { title: 'Robo-Taro', ja: 'ロボたろう', pages: [
    { pic: '🤖 👋', en: 'Hello! I’m Robo-Taro. I like soccer!', ja: 'こんにちは！ロボたろうです。サッカーが好き！' },
    { pic: '🤖 ⚽ ❓', en: 'I can’t kick the ball. Help me!', ja: 'ボールがけれないよ。助けて！' },
    { pic: '⬆️ ⬅️ ✋', en: '“Go straight! Turn left! Stop! Kick!”', ja: '「まっすぐ！左に曲がって！とまって！キック！」' },
    { pic: '🤖 🥅 🎉', en: 'Goal! Thank you! I’m happy!', ja: 'ゴール！ありがとう！うれしい！' },
  ] },
};

function storyOverlay(game, story, j) {
  return new Promise((resolve) => {
    let page = 0;
    const pic = el('div', { class: 'book-pic' });
    const en = el('div', { class: 'book-en' });
    const ja = el('div', { class: 'book-ja' });
    const num = el('div', { class: 'book-num' });
    const back = el('button', { class: 'book-btn', 'aria-label': 'Back' }, ['◀']);
    const fwd = el('button', { class: 'book-btn go', 'aria-label': 'Next' }, ['▶']);
    const read = el('button', { class: 'book-btn read', 'aria-label': 'Read aloud' }, ['🔊']);
    const root = el('div', { class: 'act-temp book' }, [el('div', { class: 'book-title' }, [story.title, j ? el('small', {}, [story.ja]) : null]), pic, en, ja, el('div', { class: 'book-nav' }, [back, read, num, fwd])]);
    game.uiRoot.appendChild(root);
    const show = () => {
      const p = story.pages[page];
      pic.textContent = p.pic; en.textContent = p.en; ja.textContent = j ? p.ja : ''; num.textContent = `${page + 1} / ${story.pages.length}`;
      back.disabled = page === 0;
      fwd.textContent = page === story.pages.length - 1 ? 'The End ✓' : '▶';
      setState({ play: 'read', phase: 'reading', page, pages: story.pages.length, title: story.title });
      sayWord(game, p.en);
    };
    const finish = () => { offK(); root.remove(); resolve(page + 1); };
    const next = () => { sfx.pop(); if (page < story.pages.length - 1) { page++; show(); } else finish(); };
    const prev = () => { if (page > 0) { sfx.pop(); page--; show(); } };
    back.addEventListener('click', prev);
    fwd.addEventListener('click', next);
    read.addEventListener('click', () => { voice.speak(story.pages[page].en, { pitch: 1.05, rate: 0.85 }); });
    const offK = keys(game, (e) => {
      if (e.code === 'ArrowRight' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) next(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); }
    });
    onActivityCleanup(game, () => root.remove());
    show();
  });
}

export async function readThing(game, id, { friend = null, conversation = null } = {}) {
  const story = STORIES[id] || STORIES.book;
  return runThing(game, async (c) => {
    faultPoint('thing:read');
    if (friend && id === 'comic') {
      await c.say(friend, line('Do you like comics?', 'まんがは好き？', { area: 'selfintro', expr: 'q.doyoulike', template: 'Do you like ___?' }), { expr: 'happy' });
      await c.ask([opt('yes', 'Yes, I do! Do you want to read this?', 'うん、好き！これ読む？', { emoji: '📖', phrases: ['yes i do', 'yes', 'do you want to read this'], keys: [['yes', 'read']], area: 'selfintro', expr: 'a.yesido', template: 'Yes, I do.' })]);
    } else if (friend) {
      await c.ask([opt('read', "Let's read this book together!", 'この本をいっしょに読もう！', { emoji: '📘', phrases: ["let's read this book together", "let's read"], keys: [['read', 'book']], area: 'wantto' })]);
    }
    game.dialogue.close();
    const pages = await storyOverlay(game, story, game.settings.japanese);
    setState({ play: 'read', phase: 'result', title: story.title, pages });
    if (friend) {
      const fan = (friend.npc.likes || []).some((l) => ['reading', 'comics'].includes(l));
      await c.say(friend, id === 'comic' ? line(fan ? 'Ha ha! Robo-Taro is so funny! I like this comic!' : 'Robo-Taro is funny!', fan ? 'あはは！ロボたろう、おもしろい！このまんが好き！' : 'ロボたろう、おもしろいね！') : line(fan ? 'Momo is so cute! I like this book!' : 'Momo is cute!', fan ? 'モモ、かわいい！この本好き！' : 'モモ、かわいいね！'), { gesture: 'happy', expr: 'happy' });
      await c.ask([opt('me', 'Me too!', 'わたしも！', { emoji: '😊', phrases: ['me too'], keys: [['me', 'too']] })]);
    } else {
      await c.ask([opt('fun', 'That was a good story!', 'いいお話だった！', { emoji: '📖', phrases: ['that was a good story', 'good story'], keys: [['good', 'story']] })]);
    }
    return { status: 'completed', detail: { item: id, title: story.title, coop: !!friend, result: 'read' } };
  }, { conversation, friend });
}

// ------------------------------------------------------------ drawing (colored pencils)

const PENCIL_SUBJECTS = [
  { en: 'a cat', ja: 'ねこ', emoji: '🐱' }, { en: 'a flower', ja: '花', emoji: '🌷' }, { en: 'a rocket', ja: 'ロケット', emoji: '🚀' },
  { en: 'my house', ja: 'わたしの家', emoji: '🏠' }, { en: 'a rainbow', ja: 'にじ', emoji: '🌈' }, { en: 'a robot', ja: 'ロボット', emoji: '🤖' },
];

export async function drawPicture(game, { friend = null, conversation = null } = {}) {
  return runThing(game, async (c) => {
    const w = game.world;
    const host = friend || speaker('🖍️ Colored pencils', '#7A5CC2');
    await c.say(host, line('What do you want to draw?', '何をかきたい？', { area: 'wantto', expr: 'q.wantdraw', template: 'What do you want to draw?' }), friend ? { expr: 'happy' } : {});
    const r = rngFor('pencils', w.day, w.period, friend?.npc.id || 'solo');
    const subjects = r.sample(PENCIL_SUBJECTS, 4);
    const s = await c.ask(subjects.map((x, i) => opt(`s${i}`, `I want to draw ${x.en}.`, `${x.ja}をかきたい。`, { emoji: x.emoji, phrases: [`i want to draw ${x.en}`, x.en], keys: [[x.en.split(' ').pop()]], area: 'wantto', expr: 'a.wantdraw', template: 'I want to draw ___.' })), { columns: 2 });
    const subject = subjects[Number(s.id.slice(1))];
    await c.say(host, line('What color is it?', '何色にする？', { area: 'adjectives', expr: 'q.color', template: 'What color is it?' }));
    const colors = r.sample(COLORS, 4);
    const col = await c.ask(colors.map((x) => opt(x.id, `It's ${x.en}.`, `${x.ja}！`, { emoji: '🖍️', phrases: [`it's ${x.en}`, x.en], keys: [[x.en]], area: 'adjectives', expr: 'a.color', template: "It's (color)." })), { columns: 2 });
    const color = COLORS.find((x) => x.id === col.id);
    game.dialogue.close();
    faultPoint('thing:draw');
    const b = board(game, { w: 720, h: 340, cls: 'draw-board' });
    const mine = { color: color.hex, emoji: subject.emoji };
    const theirs = friend ? { color: COLORS[(friend.npc.id.length + 3) % COLORS.length].hex, emoji: '🌟' } : null;
    game.player.char.setProp('sketch');
    if (friend) friend.char.setProp('sketch');
    for (let step = 0; step <= 3; step++) {
      b.ctx.fillStyle = '#F4EBDD'; b.ctx.fillRect(0, 0, 720, 340);
      if (theirs) { paintPicture(b.ctx, 20, 20, 330, 270, mine, step); paintPicture(b.ctx, 370, 20, 330, 270, theirs, step); }
      else paintPicture(b.ctx, 195, 20, 330, 270, mine, step);
      b.ctx.fillStyle = '#5B4636'; b.ctx.font = '800 22px Nunito, sans-serif'; b.ctx.textAlign = 'center'; b.ctx.textBaseline = 'middle';
      b.ctx.fillText(theirs ? w.save.player.name : `${subject.en} (${color.en})`, theirs ? 185 : 360, 315);
      if (theirs) b.ctx.fillText(friend.npc.name, 535, 315);
      sfx.pop();
      setState({ play: 'draw', phase: 'drawing', step });
      await wait(650);
    }
    const d = addDrawing(w.save, { subject, color: color.hex, day: w.day });
    game.refreshHomeThings?.();
    await wait(500);
    b.close();
    game.player.char.setProp(null);
    if (friend) friend.char.setProp(null);
    setState({ play: 'draw', phase: 'result', drawing: d.id });
    if (friend) {
      await c.say(friend, line(`I like your picture! The ${color.en} is pretty!`, `あなたの絵、好き！${color.ja}がきれい！`, { area: 'adjectives' }), { gesture: 'clap', expr: 'happy' });
      await c.ask([opt('thanks', 'Thank you! Your picture is nice, too!', 'ありがとう！あなたの絵もすてき！', { emoji: '🎨', phrases: ['thank you', 'your picture is nice'], keys: [['thank', 'nice']] })]);
    } else {
      await c.say(host, line('Your picture is on the wall now!', '絵をかべにかざったよ！', { area: 'prepositions', template: "It's on the wall." }));
      await c.ask([opt('nice', 'It looks nice!', 'いい感じ！', { emoji: '🖼️', phrases: ['it looks nice', 'nice'], keys: [['nice']] })]);
    }
    return { status: 'completed', detail: { item: 'pencils', drawing: subject.en, color: color.en, coop: !!friend, result: `drew ${subject.en}` } };
  }, { conversation, friend });
}

// ------------------------------------------------------------ soccer ball kick-ups (park)

export async function playKickups(game) {
  const res = await runThing(game, async (c) => {
    const hud = game.activityHud;
    const host = speaker('⚽ Soccer ball', '#2F9E44');
    await c.say(host, line('Kick-ups! Press KICK when the ball comes down!', 'リフティング！ボールが落ちてきたらKICK！', { area: 'verbs' }));
    game.dialogue.close();
    const P = game.player;
    const ball = makeBall(true);
    game.scene.root.add(ball);
    onActivityCleanup(game, () => ball.removeFromParent());
    // Stand on the kick-up spot facing the open south side of the field, and
    // film from there like catch and soccer do: no trees or poles in the way.
    const f = game.scene.field?.a;
    if (f) {
      P.place(f.x + 1.6, f.z + 0.6, 0);
      game.camera.shot(new THREE.Vector3(f.x + 2.3, 1.9, f.z + 4.4), new THREE.Vector3(f.x + 1.6, 0.75, f.z + 0.6), 5);
      game.camera.snap();
    } else game.camera.frameTalk([P.char, { root: ball }]);
    hud.show('⚽ Kick-ups');
    hud.setHint('KICK when the arrow is in the green!', '矢印が緑のときにKICK！');
    setZone(hud, 0.3);
    hud.showMeter(true);
    let kicks = 0, misses = 0, best = 0, pressed = false, tt = 0, h = 0.6;
    hud.button('⚽ KICK!', () => { pressed = true; }, 'catch');
    setState({ play: 'kickups', phase: 'playing', kicks: 0 });
    await new Promise((resolve, reject) => {
      const stop = loop(game, (dt) => {
        faultPoint('thing:kickups');
        tt += dt;
        const v = 0.5 + 0.5 * Math.sin(tt * 2.6);
        hud.setNeedle(v);
        h = 0.35 + (1 - Math.abs(v - 0.5) * 2) * 0.9;
        ball.position.set(P.x + Math.sin(P.char.yaw) * 0.35, h, P.z + Math.cos(P.char.yaw) * 0.35);
        if (pressed) {
          pressed = false;
          if (Math.abs(v - 0.5) <= 0.15) { kicks++; best = Math.max(best, kicks); sfx.catch(); P.char.play('kick', 0.6); hud.pop(`${kicks}!`, 'good'); }
          else { misses++; sfx.deny(); hud.pop('Oops!', 'wait'); P.char.play('surprised', 0.6); }
          setState({ play: 'kickups', phase: 'playing', kicks, misses });
        }
        if (kicks >= 10 || misses >= 3) { stop(); resolve(); }
      }, reject);
    });
    hud.hide();
    setState({ play: 'kickups', phase: 'result', kicks });
    await c.say(host, line(`You did ${kicks} kick-ups!${kicks >= 10 ? ' Amazing!' : ''}`, `リフティング${kicks}回！${kicks >= 10 ? 'すごい！' : ''}`));
    await c.ask([opt('ok', kicks >= 5 ? "I'm good at soccer!" : "I'll practice more!", kicks >= 5 ? 'サッカーがとくいだよ！' : 'もっと練習するぞ！', { emoji: '⚽', phrases: ["i'm good at soccer", 'practice'], keys: [['good', 'practice']] })]);
    return { status: 'completed', kicks };
  });
  if (res?.status !== 'completed') return res;
  // A soccer fan in the park notices the ball and suggests playing together.
  const w = game.world;
  const fan = game.npcs.actors.find((a) => !a.special && !a.busy && w.isKnown(a.npc.id) && (a.npc.likes || []).some((l) => THINGS.ball.fans.includes(l))
    && Math.hypot(a.char.root.position.x - game.player.x, a.char.root.position.z - game.player.z) < 14 && !w.planWith(a.npc.id)
    && noticeFor(w.save, a.npc, { place: 'park', day: w.day })?.id === 'ball');
  if (fan && w.free) await soccerFanComesOver(game, fan);
  return res;
}

async function soccerFanComesOver(game, fan) {
  const w = game.world;
  game.npcs.engage(fan);
  const spot = game.scene.collision.nearestFree(game.player.x + 1.1, game.player.z + 0.4, 0.3);
  await game.npcs.walkTo(fan, spot.x, spot.z, 3.4);
  const c = await Conversation.start(game, [fan]);
  let play = false;
  try {
    markNoticed(w.save, fan.npc.id, 'ball', w.day);
    await c.say(fan, line(THINGS.ball.notice.en, THINGS.ball.notice.ja, { area: 'wantto', expr: 'q.wantto', template: 'Do you want to ___?' }), { gesture: 'happy', expr: 'surprised' });
    const r = await c.ask([
      opt('yes', 'Yes! I want to play!', 'うん！やりたい！', { emoji: '⚽', phrases: ['yes i want to play', 'yes', "let's play"], keys: [['yes', 'play', 'want']], area: 'wantto', expr: 'a.wantplay', template: 'I want to ___.' }),
      opt('no', 'Maybe next time!', 'また今度ね！', { emoji: '🙂', phrases: ['maybe next time', 'next time'], keys: [['next', 'maybe']], tone: 'quiet' }),
    ]);
    if (r.id === 'yes') play = await confirmTime(c, '⚽ Soccer at Sakura Park?', 'さくら公園でサッカー？');
    else await c.say(fan, line('OK! Bring your ball next time!', 'オッケー！またボール持ってきてね！'), { expr: 'happy' });
  } finally { await c.end(); }
  if (play) await game.activities.run('soccer', [fan], { like: 'soccer', item: 'ball' });
}

// ------------------------------------------------------------ wearing

export async function wearAtMirror(game) {
  const w = game.world;
  const wearables = ['cap', 'shirt'].filter((id) => owns(w.save, id));
  if (!wearables.length) return game.onMirror?.();
  // [card noun, ja noun, toast noun, ja "want to wear", ja "wore"]
  const label = { cap: ['my cap', 'ぼうし', 'your cap', 'かぶりたい', 'かぶった'], shirt: ['my T-shirt', 'Tシャツ', 'your T-shirt', '着たい', '着た'] };
  const choice = await game.askSolo({ name: '🪞 Mirror', color: '#C8A2C8', en: 'What do you want to wear?', ja: '何を着たい？' }, [
    ...wearables.map((id) => isWorn(w.save, id)
      ? opt(`off:${id}`, `I want to take off ${label[id][0]}.`, `${label[id][1]}をぬぎたい。`, { emoji: id === 'cap' ? '🧢' : '👕', phrases: [`take off ${label[id][0]}`], keys: [['off']], area: 'wantto', template: 'I want to ___.' })
      : opt(`on:${id}`, `I want to wear ${label[id][0]}.`, `${label[id][1]}を${label[id][3]}。`, { emoji: id === 'cap' ? '🧢' : '👕', phrases: [`i want to wear ${label[id][0]}`, `wear ${label[id][0]}`], keys: [[id === 'cap' ? 'cap' : 'shirt']], area: 'wantto', expr: 'a.wantwear', template: 'I want to wear ___.' })),
    opt('look', 'I want to change my look.', '見た目を変えたい。', { emoji: '🎨', phrases: ['change my look'], keys: [['change', 'look']] }),
    opt('done', 'I look good!', 'いい感じ！', { emoji: '😊', phrases: ['i look good'], keys: [['good']], tone: 'quiet' }),
  ]);
  if (choice === 'look') return game.onMirror?.();
  if (choice === 'done') return;
  const [mode, id] = choice.split(':');
  const look = setWorn(w.save, id, mode === 'on');
  if (!look) return;
  game.player.setLook(look);
  game.player.char.showBag(false);
  sfx.great();
  game.hud.toast({ icon: id === 'cap' ? '🧢' : '👕', en: mode === 'on' ? `You're wearing ${label[id][2]}!` : `You took off ${label[id][2]}.`, ja: mode === 'on' ? `${label[id][1]}を${label[id][4]}よ！` : `${label[id][1]}をぬいだよ。` });
  game.save(true);
}

/** Which "My Things" action each owned item offers here. */
export function thingActions(game, id) {
  const def = THINGS[id];
  const atHome = game.sceneId === 'home';
  const inPark = game.locationId === 'park';
  const acts = [];
  if (def.wear) acts.push({ id: isWorn(game.world.save, id) ? 'off' : 'wear', en: isWorn(game.world.save, id) ? 'Take off' : 'Wear', ja: isWorn(game.world.save, id) ? 'ぬぐ' : '着る', ok: true });
  if (def.play === 'kickups') acts.push({ id: 'play', en: 'Play', ja: 'あそぶ', ok: inPark, why: { en: 'Take it to Sakura Park!', ja: 'さくら公園で使おう！' } });
  else if (def.play === 'read') acts.push({ id: 'read', en: 'Read', ja: '読む', ok: atHome, why: { en: 'Read it at home.', ja: '家で読もう。' } });
  else if (def.play === 'draw') acts.push({ id: 'draw', en: 'Draw', ja: 'かく', ok: atHome, why: { en: 'Draw at home.', ja: '家でかこう。' } });
  else if (def.play) acts.push({ id: 'play', en: 'Play', ja: 'あそぶ', ok: atHome, why: { en: 'Play with it at home.', ja: '家であそぼう。' } });
  return acts;
}

/** Run an action from My Things (the menu has already closed). */
export async function useThing(game, id, action) {
  if (game.mode !== 'explore') return;
  const def = THINGS[id];
  if (!def || !owns(game.world.save, id)) return;
  try {
    if (action === 'wear' || action === 'off') {
      const look = setWorn(game.world.save, id, action === 'wear');
      if (look) { game.player.setLook(look); game.player.char.showBag(false); game.save(true); game.hud.toast({ icon: id === 'cap' ? '🧢' : '👕', en: action === 'wear' ? 'Looking good!' : 'You took it off.', ja: action === 'wear' ? 'にあってる！' : 'ぬいだよ。' }); }
      return;
    }
    const plays = { robot: playRobot, pairs: playPairs, kendama: playKendama, kickups: playKickups, draw: drawPicture };
    if (def.play === 'read') return await readThing(game, id);
    return await plays[def.play]?.(game);
  } catch (err) {
    console.error('[thing] use failed', err);
    recoverGame(game);
  }
}

/** Run one shared visit play with a friend inside an existing conversation. */
export function visitPlay(game, playId, friend, c) {
  const save = game.world.save;
  if (playId === 'pairs') return playPairs(game, { friend, conversation: c });
  if (playId === 'robot') return playRobot(game, { friend, conversation: c });
  if (playId === 'kendama') return playKendama(game, { friend, conversation: c });
  if (playId === 'draw') return drawPicture(game, { friend, conversation: c });
  if (playId === 'read') return readThing(game, owns(save, 'comic') && (friend.npc.likes || []).includes('comics') ? 'comic' : owns(save, 'book') ? 'book' : 'comic', { friend, conversation: c });
  return null;
}

export { goodAt };
