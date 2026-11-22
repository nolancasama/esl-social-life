// Niji Mall 3F Game Center: racing, crane and rhythm games. Play is free and
// takes no time on its own; during a mall outing the game is the shared
// activity (one period, rewards once, through Activities.run).
import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { sfx } from '../core/audio.js';
import { until } from './ballplay.js';
import { rhythm } from './hobby.js';
import { ArcadeScreen } from '../ui/arcadescreen.js';
import {
  CRANE_PRIZES, CRANE_START, CRANE_TRIES, CRANE_TOLERANCE, cranePrize, moveClaw, craneGrab, craneCue, winCranePrize, hasCranePrize,
  RACE_FINISH, RACE_STOP_ZONE, RACE_ROAD_HALF, RACE_TRACK, raceCenterAt, raceCueAt, newRace, stepRace, raceGhostTime,
  rhythmFriendScore,
} from '../world/arcade.js';

export const ARCADE_GAMES = {
  racing: { id: 'racing', en: 'the racing game', ja: 'レースゲーム', emoji: '🏎️', title: '🏎️ Racing Game', name: 'Racing Game', color: '#4E9CC4' },
  crane: { id: 'crane', en: 'the crane game', ja: 'クレーンゲーム', emoji: '🧸', title: '🧸 Crane Game', name: 'Crane Game', color: '#D57AA6' },
  rhythm: { id: 'rhythm', en: 'the rhythm game', ja: 'リズムゲーム', emoji: '🥁', title: '🥁 Rhythm Game', name: 'Rhythm Game', color: '#8C76C9' },
};

// Frozen semantic state for tests (window.__esl.arcade).
let state = { game: null, phase: 'idle' };
const setState = (patch) => { state = { ...state, ...patch }; };
export function arcadeSnapshot() { return Object.freeze({ ...state, claw: state.claw ? Object.freeze({ ...state.claw }) : null }); }

const tag = (who) => who?.npc ? { name: who.npc.name, color: who.npc.color || '#E0607E' } : { name: who?.name || 'Navigator', color: who?.color || '#6C5CB8' };

function machineSpeaker(g) {
  return { special: 'arcade', npc: { name: g.name, color: g.color, role: 'Game Center ゲームセンター', voice: { pitch: 1.1, rate: 0.95 } }, char: { setTalking() {}, setExpression() {}, play() {} } };
}

/** Stand at the machine and frame player, friends and cabinet together. */
export function standAtMachine(game, kind, friends = []) {
  const pos = game.scene.arcadePositions?.[kind];
  if (!pos) return;
  game.player.place(pos.x, pos.z + 1.75, Math.PI);
  friends.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(pos.x + (i ? -1 : 1) * 1.05, pos.z + 2.05); a.char.faceToward(pos.x, pos.z); });
  game.camera.shot(new THREE.Vector3(pos.x + 0.9, 2.7, pos.z + 5.6), new THREE.Vector3(pos.x, 1.1, pos.z + 0.6), 5);
  game.camera.snap();
}

/** Walk-up play at a 3F machine: alone, free, no time. */
export async function playArcadeMachine(game, target) {
  const kind = target.game;
  const g = ARCADE_GAMES[kind];
  if (!g) return;
  const c = await Conversation.start(game, [], { frame: false });
  standAtMachine(game, kind);
  const who = machineSpeaker(g);
  try {
    for (;;) {
      await runArcadeGame(game, c, kind, { friends: [], who });
      const again = await c.ask([
        opt('again', 'One more time!', 'もう1回！', { emoji: '🔁', phrases: ['one more time', 'again'], keys: [['again', 'more']] }),
        opt('done', 'That was fun!', '楽しかった！', { emoji: '😊', phrases: ['that was fun', 'fun'], keys: [['fun', 'done']] }),
      ]);
      if (again.id !== 'again') break;
    }
  } finally {
    setState({ game: null, phase: 'idle' });
    await c.end();
    game.save();
  }
}

/** Play one game inside an existing conversation. Returns { kind, won, score }. */
export async function runArcadeGame(game, c, kind, { friends = [], who = machineSpeaker(ARCADE_GAMES[kind]) } = {}) {
  setState({ game: kind, phase: 'intro', claw: null, won: null, result: null });
  const play = { racing: playRacing, crane: playCrane, rhythm: playRhythm }[kind];
  return play(game, c, { friends, who });
}

// The minigames run on the activity tick, so pausing the game pauses them.
async function asActivity(game, fn) {
  const prev = game.mode;
  game.dialogue.close();
  game.setMode('activity');
  try { return await fn(); }
  finally {
    game.activityTick = null;
    game.activityHud.hide();
    game.setMode(prev);
  }
}

// ------------------------------------------------------------ racing
async function playRacing(game, c, { friends, who }) {
  const rival = friends[0] || null;
  const rivalName = rival ? rival.npc.name : 'Rival car';
  const ghost = raceGhostTime(rival ? rival.npc.id : 'rival');
  if (rival) await c.say(rival, line("Let's play together! Let's race!", 'いっしょにあそぼう！レースしよう！'), { gesture: 'happy', expr: 'happy' });
  await c.say(who, line('Go straight, turn left and turn right. Stop at the finish line!', 'まっすぐ行って、左と右に曲がってね。ゴールでとまってね！', { area: 'directions' }));
  await c.ask([opt('go', rival ? "Let's play together!" : "OK! Let's go!", rival ? 'いっしょにあそぼう！' : 'よし！行こう！', { emoji: '🏁', phrases: ["let's play together", "let's go", 'ok'], keys: [['together', 'go', 'ok']], area: 'wantto' })]);
  const r = await asActivity(game, () => raceLoop(game, { rivalName, ghost, navigator: rival }));
  const mine = Math.round(r.finishTime);
  const won = r.finishTime < ghost;
  setState({ phase: 'result', won, result: { time: r.finishTime, ghost, perfectStop: r.perfectStop } });
  if (won) sfx.great(); else sfx.good();
  await c.say(who, line(`${won ? 'You win!' : `${rivalName} wins!`} Your time: ${mine} seconds.${r.perfectStop ? ' Perfect stop!' : ''}`, `${won ? 'あなたの勝ち！' : `${rivalName}の勝ち！`}タイムは${mine}びょう。${r.perfectStop ? 'ぴったりストップ！' : ''}`));
  if (rival) await c.say(rival, won ? line("You're fast! Good race!", 'はやいね！いいレースだった！') : line('I won! Good race!', 'わたしの勝ち！いいレースだったね！'), { gesture: 'happy', expr: 'happy' });
  return { kind: 'racing', won, score: won ? 3 : 2 };
}

function raceLoop(game, { rivalName, ghost, navigator }) {
  const hud = game.activityHud;
  hud.show(ARCADE_GAMES.racing.title);
  hud.setScore([], 0);
  hud.setHint('Steer with ◀ ▶. Press STOP at the finish!', '◀ ▶でハンドル。ゴールでSTOPをおそう！');
  const screen = new ArcadeScreen(game.uiRoot, { dirs: ['left', 'right'], actions: [{ id: 'stop', label: 'STOP ✋', tone: 'stop' }], color: ARCADE_GAMES.racing.color });
  const ctx = screen.ctx, W = 640, H = 400, carY = H * 0.78, PPM = 9, SCALE = 300;
  let s = newRace(), count = 1.6, cue = null, after = 0, brakeT = 0, parked = false;
  const call = tag(navigator || { name: 'Navigator', color: '#6C5CB8' });
  const draw = () => {
    const camX = s.x * 0.6;
    ctx.fillStyle = '#5FAE6B';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) {
      const d = s.d + (carY - y) / PPM;
      const cx = W / 2 + (raceCenterAt(d) - camX) * SCALE, half = RACE_ROAD_HALF * SCALE;
      if (Math.floor(d / 3) % 2) { ctx.fillStyle = '#6BB875'; ctx.fillRect(0, y, W, 4); }
      ctx.fillStyle = Math.floor(d / 2) % 2 ? '#E25C5C' : '#FFFFFF';
      ctx.fillRect(cx - half - 8, y, half * 2 + 16, 4);
      ctx.fillStyle = d >= RACE_STOP_ZONE.from && d <= RACE_STOP_ZONE.to ? '#B7646A' : '#5D6170';
      ctx.fillRect(cx - half, y, half * 2, 4);
      if (Math.abs(d - RACE_FINISH) < 0.5) for (let k = 0; k < 12; k++) { ctx.fillStyle = k % 2 ? '#111' : '#FFF'; ctx.fillRect(cx - half + k * (half / 6), y, half / 6, 4); }
      else if (Math.floor(d / 2.5) % 2 === 0) { ctx.fillStyle = '#F4D35E'; ctx.fillRect(cx - 2, y, 4, 4); }
    }
    // Arrow signs stand beside the road before each turn.
    let start = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const seg of RACE_TRACK) {
      if (seg.kind !== 'straight') {
        const d = start - 6, y = carY - (d - s.d) * PPM;
        if (y > -40 && y < H + 40) {
          const left = seg.kind === 'left';
          const x = W / 2 + (raceCenterAt(d) - camX) * SCALE + (left ? 1 : -1) * (RACE_ROAD_HALF * SCALE + 46);
          ctx.fillStyle = '#FFD43B'; ctx.strokeStyle = '#2F3A5E'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 30); ctx.lineTo(x - 30, y); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2F3A5E'; ctx.font = '900 30px Nunito, sans-serif';
          ctx.fillText(left ? '⬅' : '➡', x, y + 1);
        }
      }
      start += seg.len;
    }
    const sy = carY - (RACE_STOP_ZONE.from + 6 - s.d) * PPM;
    if (sy > -20 && sy < H) { ctx.fillStyle = '#FFFFFF'; ctx.font = '900 34px Nunito, sans-serif'; ctx.fillText('STOP', W / 2 + (raceCenterAt(RACE_STOP_ZONE.from + 6) - camX) * SCALE, sy); }
    const car = (x, y, body, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#20242F'; for (const [dx, dy] of [[-17, -14], [17, -14], [-17, 14], [17, 14]]) ctx.fillRect(x + dx - 5, y + dy - 7, 10, 14);
      ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(x - 15, y - 24, 30, 48, 10); ctx.fill();
      ctx.fillStyle = '#CFE8F6'; ctx.fillRect(x - 10, y - 12, 20, 10);
      ctx.globalAlpha = 1;
    };
    const ghostD = s.t > 0 ? Math.min(RACE_FINISH + 6, (s.t / ghost) * RACE_FINISH) : 0;
    const gy = carY - (ghostD - s.d) * PPM;
    if (gy > -30 && gy < H + 30) car(W / 2 + (raceCenterAt(ghostD) - camX) * SCALE, gy, '#5C7CFA', 0.7);
    car(W / 2 + (s.x - camX) * SCALE, carY, '#E5534B');
    ctx.fillStyle = 'rgba(30,35,64,0.78)'; ctx.fillRect(10, 10, 230, 58);
    ctx.fillStyle = '#FFF'; ctx.font = '800 20px Nunito, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`⏱ ${s.t.toFixed(1)} s`, 22, 30);
    ctx.fillStyle = '#AFC3FF'; ctx.fillText(`🔵 ${rivalName}`, 22, 54);
    ctx.textAlign = 'center';
    if (count > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#FFF'; ctx.font = '900 96px Nunito, sans-serif';
      ctx.fillText(count > 1.1 ? '3' : count > 0.55 ? '2' : '1', W / 2, H / 2);
    }
  };
  setState({ phase: 'playing', ghostTime: ghost });
  return until(game, (dt) => {
    if (count > 0) {
      count -= dt;
      if (count <= 0) { sfx.select(); hud.pop('GO!', 'good'); }
    } else {
      // STOP brakes briefly on the road; after the finish line it holds the car.
      if (screen.take('stop')) { if (s.finishTime !== null) parked = true; else brakeT = 0.8; }
      brakeT = Math.max(0, brakeT - dt);
      s = stepRace(s, { steer: screen.axis().x, brake: parked || brakeT > 0 }, dt);
      const next = raceCueAt(s.d);
      if (next.id !== cue) { cue = next.id; hud.say(call, next.en, next.ja); sfx.blip(next.id === 'stop' ? 0.8 : 1.3); }
      if (s.stopped) after += dt;
    }
    setState({ raceD: s.d, raceX: s.x, raceCenter: raceCenterAt(s.d), raceCue: cue, finishTime: s.finishTime, stopped: s.stopped, perfectStop: s.perfectStop });
    draw();
    if (s.stopped && after > 1.2) { screen.close(); return true; }
    return false;
  }).then(() => s);
}

// ------------------------------------------------------------ crane
async function playCrane(game, c, { friends, who }) {
  const w = game.world;
  const helper = friends[0] || null;
  const asker = helper || who;
  await c.say(asker, line('Which prize do you want?', 'どの景品がほしい？', { area: 'wantto', template: 'What do you want?' }));
  const pick = await c.ask(CRANE_PRIZES.map((p) => opt(p.id, `I want ${p.en}.`, `${p.ja}がほしい。`, {
    emoji: hasCranePrize(w.save, p.id) ? `${p.emoji}✓` : p.emoji, phrases: [`i want ${p.en}`, p.en.replace('the ', '')], keys: [[p.id, p.en.replace('the ', '')]], area: 'wantto', expr: 'a.want', template: 'I want ___.',
  })), { columns: 3 });
  const prize = cranePrize(pick.id);
  if (hasCranePrize(w.save, prize.id)) await c.say(asker, line(`You have ${prize.a} already. You can try for fun!`, `${prize.ja}はもう持ってるね。楽しむためにやってもいいよ！`, { area: 'possessions' }));
  await c.say(who, line(`Move the claw over ${prize.en}. Then press DROP. You have ${CRANE_TRIES} tries!`, `${prize.ja}の上にクレーンを動かして、DROPをおしてね。${CRANE_TRIES}回できるよ！`, { area: 'prepositions' }));
  await c.ask([opt('ok', "OK! Let's try!", 'よし！やってみよう！', { emoji: '🕹️', phrases: ["let's try", 'ok'], keys: [['try', 'ok']] })]);
  const res = await asActivity(game, () => craneLoop(game, prize, helper));
  // Award and save before anything else, so an interruption can't lose or repeat it.
  const award = res.won ? winCranePrize(w.save, res.won.id, w.day) : null;
  game.save();
  setState({ phase: 'result', won: !!res.won, result: res.won ? res.won.id : null, awarded: !!award?.ok });
  if (res.won) {
    sfx.great();
    if (award.ok) await c.say(who, line(`You got ${res.won.a}! It's on the shelf in your room now.`, `${res.won.ja}をゲット！自分の部屋のたなの上にあるよ。`, { area: 'prepositions', template: "It's on the shelf." }));
    else await c.say(who, line(`You got ${res.won.a}! But you have it already. Try another one next time!`, `${res.won.ja}をゲット！でも、もう持ってるね。次はほかのにしてみよう！`, { area: 'possessions' }));
    if (helper) await c.say(helper, line('Yay! You did it!', 'やったね！'), { gesture: 'cheer', expr: 'happy' });
  } else {
    await c.say(who, line('So close! You can try again.', 'おしい！またやってみてね。'));
  }
  return { kind: 'crane', won: !!res.won, score: res.won ? 3 : 2 };
}

function craneLoop(game, target, helper) {
  const hud = game.activityHud;
  hud.show(ARCADE_GAMES.crane.title);
  hud.setScore([], 0);
  hud.setHint('Move with ◀ ▲ ▼ ▶. Press DROP!', '◀ ▲ ▼ ▶で動かして、DROPをおそう！');
  const screen = new ArcadeScreen(game.uiRoot, { dirs: ['left', 'up', 'down', 'right'], actions: [{ id: 'drop', label: 'DROP ⬇', tone: 'go' }], color: ARCADE_GAMES.crane.color });
  const ctx = screen.ctx, W = 640, H = 400;
  const X = (x) => 60 + x * 520, Z = (z) => 22 + z * 356;
  const call = tag(helper || { name: 'Crane Game', color: ARCADE_GAMES.crane.color });
  let claw = { ...CRANE_START }, tries = CRANE_TRIES, phase = 'move', t = 0, held = null, won = null, cue = null;
  const draw = () => {
    ctx.fillStyle = '#F6E7F0'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(160,110,150,0.18)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(X(i / 10), Z(0)); ctx.lineTo(X(i / 10), Z(1)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(0), Z(i / 10)); ctx.lineTo(X(1), Z(i / 10)); ctx.stroke(); }
    ctx.fillStyle = '#3A3F5C'; ctx.fillRect(X(0.83), Z(0.82), X(0.98) - X(0.83), Z(0.98) - Z(0.82));
    ctx.fillStyle = '#FFF'; ctx.font = '800 15px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GOAL', (X(0.83) + X(0.98)) / 2, (Z(0.82) + Z(0.98)) / 2);
    for (const p of CRANE_PRIZES) {
      if (held === p) continue;
      ctx.fillStyle = p === target ? '#FFFFFF' : 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(X(p.x), Z(p.z), 40, 40, 0, 0, Math.PI * 2); ctx.fill();
      if (p === target) { ctx.strokeStyle = '#E0607E'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 30, 0, Math.PI * 2); ctx.fill();
      ctx.font = '34px sans-serif'; ctx.fillText(p.emoji, X(p.x), Z(p.z) + 2);
    }
    // The claw: a shadow on the floor and a ring that opens as it drops.
    const drop = phase === 'down' ? Math.min(1, t / 0.7) : phase === 'up' ? Math.max(0, 1 - t / 0.6) : 0;
    const cx = X(claw.x), cz = Z(claw.z);
    ctx.fillStyle = 'rgba(40,30,60,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cz, CRANE_TOLERANCE * 520, CRANE_TOLERANCE * 356, 0, 0, Math.PI * 2); ctx.fill();
    if (held) { ctx.fillStyle = held.color; ctx.beginPath(); ctx.arc(cx, cz, 30, 0, Math.PI * 2); ctx.fill(); ctx.font = '34px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(held.emoji, cx, cz + 2); }
    const r = 30 - drop * 8;
    ctx.strokeStyle = '#7B8597'; ctx.lineWidth = 6;
    for (const a of [-2.2, -0.95, 0.3]) { ctx.beginPath(); ctx.arc(cx, cz, r, a, a + 0.95); ctx.stroke(); }
    ctx.fillStyle = '#5E6880'; ctx.beginPath(); ctx.arc(cx, cz, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(30,35,64,0.78)'; ctx.fillRect(10, 10, 150, 36);
    ctx.fillStyle = '#FFF'; ctx.font = '800 19px Nunito, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Tries: ${'●'.repeat(tries)}${'○'.repeat(CRANE_TRIES - tries)}`, 20, 29);
    ctx.textAlign = 'center';
  };
  setState({ phase: 'playing', target: target.id, tries });
  return until(game, (dt) => {
    t += dt;
    if (phase === 'move') {
      claw = moveClaw(claw, screen.axis(), dt);
      const next = craneCue(claw, target);
      if (next.id !== cue) { cue = next.id; hud.say(call, next.en, next.ja); if (cue === 'under') sfx.discover(); }
      if (screen.take('drop')) { phase = 'down'; t = 0; screen.setAction('drop', { disabled: true }); sfx.whoosh(); }
    } else if (phase === 'down' && t >= 0.7) {
      held = craneGrab(claw);
      phase = 'up'; t = 0;
      if (held) sfx.catch(); else sfx.deny();
    } else if (phase === 'up' && t >= 0.6) {
      phase = 'home'; t = 0;
    } else if (phase === 'home') {
      const dx = CRANE_START.x - claw.x, dz = CRANE_START.z - claw.z, d = Math.hypot(dx, dz), step = 0.6 * dt;
      claw = d <= step ? { ...CRANE_START } : { x: claw.x + (dx / d) * step, z: claw.z + (dz / d) * step };
      if (d <= step) {
        tries--;
        if (held) { won = held; phase = 'done'; t = 0; hud.pop('You got it!', 'good'); }
        else if (tries <= 0) { phase = 'done'; t = 0; hud.pop('So close!', 'wait'); }
        else { phase = 'move'; cue = null; hud.pop('Try again!', 'wait'); screen.setAction('drop', { disabled: false }); }
      }
    }
    setState({ claw, tries, cue, cranePhase: phase });
    draw();
    if (phase === 'done' && t > 1.1) { screen.close(); return true; }
    return false;
  }).then(() => ({ won, tries }));
}

// ------------------------------------------------------------ rhythm
async function playRhythm(game, c, { friends, who }) {
  const friend = friends[0] || null;
  await c.say(friend || who, line("Let's play the rhythm game! Press TAP when the arrow is in the middle!", 'リズムゲームをしよう！矢印がまん中のときにTAP！'), friend ? { gesture: 'happy', expr: 'happy' } : {});
  await c.ask([opt('go', friend ? "Let's play together!" : "OK! Let's go!", friend ? 'いっしょにあそぼう！' : 'よし！行こう！', { emoji: '🥁', phrases: ["let's play together", "let's go", 'ok'], keys: [['together', 'go', 'ok']], area: 'wantto' })]);
  const grades = [];
  setState({ phase: 'playing', beats: 8 });
  const hits = await asActivity(game, () => rhythm(game, friend, { beats: 8, title: ARCADE_GAMES.rhythm.title, gesture: 'dance', grades, period: 1.1 }));
  const perfect = grades.filter((g) => g === 'perfect').length;
  const theirs = friend ? rhythmFriendScore(friend.npc.id) : null;
  const won = friend ? hits >= theirs : hits >= 5;
  setState({ phase: 'result', won, result: { hits, perfect, theirs } });
  if (hits >= 5) sfx.great(); else sfx.good();
  await c.say(who, line(`You got ${hits} out of 8! Perfect: ${perfect}.`, `8こ中${hits}こせいこう！パーフェクトは${perfect}こ。`));
  if (friend) await c.say(friend, hits >= theirs ? line(`I got ${theirs}. You win! Great rhythm!`, `わたしは${theirs}こ。あなたの勝ち！リズムがいいね！`) : line(`I got ${theirs}. Let's play again sometime!`, `わたしは${theirs}こ。またいっしょにやろうね！`), { gesture: 'happy', expr: 'happy' });
  return { kind: 'rhythm', won, score: hits >= 5 ? 3 : 2 };
}
