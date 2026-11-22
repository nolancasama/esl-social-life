// Park ball play: catch (arcing throws) or soccer passes (ground passes).
// Receive: move to the ring and press CATCH/STOP as the ball arrives.
// Throw: say "Catch the ball!", then press THROW while the needle is green.

import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES, YES_KEYS } from '../dialogue/intent.js';
import { StaticBuilder } from '../engine/builder.js';
import { makeBlobShadow } from '../engine/materials.js';
import { sfx } from '../core/audio.js';
import { wait } from '../core/util.js';

// A tick that throws rejects the activity instead of hanging it: the main loop
// would otherwise log the error every frame and the promise never settles.
// Recovery (activities/recovery.js) can also abort a pending tick.
export function until(game, fn) {
  return new Promise((resolve, reject) => {
    const tick = (dt) => {
      let done;
      try { done = fn(dt); } catch (err) {
        if (game.activityTick === tick) game.activityTick = null;
        game.activityAbort = null;
        reject(err);
        return;
      }
      if (done) { if (game.activityTick === tick) game.activityTick = null; game.activityAbort = null; resolve(); }
    };
    game.activityTick = tick;
    game.activityAbort = (err) => { if (game.activityTick === tick) game.activityTick = null; game.activityAbort = null; reject(err); };
  });
}

export function makeBall(soccer) {
  const b = new StaticBuilder();
  if (soccer) { b.sphere(0.12, '#FFFFFF', 0, 0, 0); b.sphere(0.05, '#2E3440', 0, 0.1, 0.05); b.sphere(0.05, '#2E3440', 0.09, -0.03, 0.06); b.sphere(0.05, '#2E3440', -0.08, -0.04, -0.06); }
  else { b.sphere(0.08, '#FFFFFF', 0, 0, 0); b.add(new THREE.TorusGeometry(0.075, 0.008, 4, 16), '#E63946', { rx: 0.4 }); }
  const m = b.build();
  m.matrixAutoUpdate = true;
  return m;
}

function makeRing(color = '#FFD43B', r = 0.6) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

export async function playBall(game, actors, { soccer = false, where = 'town' } = {}) {
  const w = game.world;
  if (game.sceneId !== where) {
    await game.enterScene(where, where === 'town' ? 'park' : 'door');
    actors = actors.map((a) => game.npcs.actorFor(a.npc.id)).filter(Boolean);
  }
  const scene = game.scene;
  const f = scene.field;
  // With friends along, the partner rotates so everyone plays; the others wait at the side.
  let main = actors[0];
  const sideSpots = [f.c, scene.collision.nearestFree(f.x - 5.0, f.z, 0.3)];
  const sideYaw = [-Math.PI / 2, Math.PI / 2];
  const P = game.player;
  const hud = game.activityHud;
  const c = new Conversation(game, actors);
  for (const a of actors) game.npcs.engage(a);

  const ball = makeBall(soccer);
  const ballShadow = makeBlobShadow(0.32);
  const ring = makeRing('#FFD43B', 0.62);
  const timing = makeRing('#FFFFFF', 0.62);
  scene.root.add(ball, ballShadow, ring, timing);
  ring.visible = timing.visible = false;
  const groundY = soccer ? 0.12 : 0;

  await game.fade(() => {
    game.npcs.clearArea(f.x, f.z, 10, actors);
    P.place(f.a.x, f.a.z, Math.PI);
    main.char.setPosition(f.b.x, f.b.z);
    main.char.setYaw(0);
    main.char.setBase('idle');
    main.char.setProp(null);
    actors.slice(1, 3).forEach((o, k) => { o.char.setPosition(sideSpots[k].x, sideSpots[k].z); o.char.setYaw(sideYaw[k]); o.char.setBase('idle'); o.char.setProp(null); });
    game.camera.shot(new THREE.Vector3(f.a.x + 0.4, 3.3, f.a.z + 5.4), new THREE.Vector3(f.x - 0.9, 0.5, f.z - 0.6), 5);
    game.camera.snap();
  });
  const holdBall = (who) => {
    const ch = who === 'player' ? P.char : who.char;
    const p = ch.root.position;
    ball.position.set(p.x + Math.sin(ch.yaw) * 0.4, soccer ? groundY : 0.95, p.z + Math.cos(ch.yaw) * 0.4);
  };
  holdBall(main);

  await c.say(main, soccer
    ? line("Let's pass the ball! Can you kick?", 'パスしよう！ボールをけれる？', { area: 'verbs', expr: 'q.cankick', template: 'Can you ___?' })
    : line('Can you catch?', 'キャッチできる？', { area: 'verbs', expr: 'q.cancatch', template: 'Can you catch?' }), { gesture: 'wave', expr: 'happy' });
  await c.ask([
    opt('yes', 'Yes, I can!', 'うん、できる！', { emoji: '💪', phrases: ['yes i can', ...PHRASES.yes], keys: YES_KEYS, area: 'verbs', expr: 'a.yesican', template: 'Yes, I can!' }),
    opt('play', "Let's play!", 'やろう！', { emoji: '🙌', phrases: ["let's play", 'lets play', 'play'], area: 'verbs', expr: 'a.letsplay', template: "Let's play!" }),
  ]);
  await c.say(main, line(soccer ? 'Here it comes! Stop the ball!' : 'OK! Catch the ball!', soccer ? 'いくよ！ボールを止めてね！' : 'いくよ！ボールをキャッチしてね！', { area: 'verbs', expr: soccer ? 'a.stop' : 'a.catchball' }), { expr: 'happy' });
  game.dialogue.close();
  hud.show(soccer ? '⚽ Soccer Pass' : '⚾ Play Catch');

  const results = [];
  const TURNS = 6;
  hud.setScore(results, TURNS);
  const lane = { minX: f.a.x - 2.7, maxX: f.a.x + 2.7, z: f.a.z };

  // --------------------------------------------------- receiving
  const receive = async () => {
    const L = { x: f.a.x + (Math.random() * 3.4 - 1.7), z: f.a.z };
    ring.position.set(L.x, 0.035, L.z);
    timing.position.set(L.x, 0.04, L.z);
    ring.visible = true; timing.visible = true;
    game.activityMove = { lane };
    hud.setHint(soccer ? 'Go to the ring! Press STOP when the ball comes!' : 'Go to the ring! Press CATCH when the ball comes!', 'リングに行って、ボールが来たらボタンをおそう！');
    hud.say(main.npc, soccer ? 'Here it comes!' : 'Catch the ball!', soccer ? 'いくよ！' : 'キャッチして！');
    if (game.settings.voice) game.voice.speak(soccer ? 'Here it comes!' : 'Catch the ball!', main.npc.voice);
    main.char.faceToward(L.x, L.z);
    await wait(650);
    main.char.play(soccer ? 'kick' : 'throw', 0.55);
    await wait(260);
    sfx.kick();
    const start = ball.position.clone();
    const end = new THREE.Vector3(L.x, soccer ? groundY : 0.9, L.z);
    const T = soccer ? 1.75 : 1.6;
    let t = 0, pressedAt = null, caught = null;
    hud.button(soccer ? 'STOP! ✋' : 'CATCH! 🧤', () => {
      if (caught !== null) return;
      if (t < T - 0.5) { hud.shakeButton(); hud.pop('Wait for it…', 'wait'); return; }
      pressedAt = t;
    }, 'catch');
    await until(game, (dt) => {
      t += dt;
      const s = Math.min(1, t / T);
      if (caught === null) {
        ball.position.lerpVectors(start, end, s);
        if (!soccer) ball.position.y += Math.sin(s * Math.PI) * 2.0;
        ball.rotation.x += dt * (soccer ? 10 : 6);
        timing.scale.setScalar(1 + 2.4 * Math.max(0, 1 - t / T));
        timing.material.opacity = 0.35 + 0.6 * (t / T);
        const dx = Math.abs(P.x - L.x);
        if (pressedAt !== null) {
          if (dx < 0.85) {
            caught = true;
            const great = Math.abs(pressedAt - T) < 0.2 && dx < 0.4;
            sfx.catch();
            P.char.play(soccer ? 'kick' : 'catch', 0.7);
            hud.pop(great ? (soccer ? 'Great stop!' : 'Great catch!') : (soccer ? 'Nice stop!' : 'Nice catch!'), 'good');
            main.char.play('clap', 1.1);
          } else {
            pressedAt = null;
            hud.pop('Move to the ring!', 'wait');
          }
        }
        if (t >= T + 0.18 && caught === null) {
          caught = false;
          sfx.bounce();
          hud.pop("Oops! That's OK!", 'miss');
        }
      } else if (caught === false) {
        // Ball rolls past, then comes back to you.
        ball.position.z += dt * 3.2;
        ball.position.y = Math.max(groundY + 0.08, ball.position.y - dt * 3);
        if (t > T + 1.0) return true;
        return false;
      } else {
        holdBall('player');
        if (t > T + 0.7) return true;
        return false;
      }
      ballShadow.position.set(ball.position.x, 0.02, ball.position.z);
      return false;
    });
    hud.button(null);
    ring.visible = timing.visible = false;
    game.activityMove = null;
    if (!caught) { main.char.play('nod', 0.8); hud.say(main.npc, "Don't worry!", 'ドンマイ！'); holdBall('player'); await wait(500); }
    return caught;
  };

  // --------------------------------------------------- throwing
  const throwBall = async () => {
    P.char.faceToward(main.char.root.position.x, main.char.root.position.z);
    holdBall('player');
    hud.say(null);
    const call = soccer ? 'Here you go!' : 'Catch the ball!';
    await c.ask([opt('call', call, soccer ? 'いくよ！' : 'ボールをキャッチして！', { emoji: soccer ? '⚽' : '⚾', phrases: [call, 'catch', 'catch the ball', 'here you go', 'here'], area: 'verbs', expr: soccer ? 'a.hereyougo' : 'a.catchball', template: call })], { silent: true, prompt: { name: 'You', color: '#FF7A59', en: 'Call to your friend!', ja: '友達に声をかけよう！' } });
    game.dialogue.close();
    hud.setHint('Press THROW when the arrow is in the green!', '矢印が緑のときにボタンをおそう！');
    hud.showMeter(true);
    let v = 0, tt = Math.random() * 3, pressed = null;
    hud.button(soccer ? 'KICK! 🦶' : 'THROW! 💨', () => { if (pressed === null) pressed = v; }, 'throw');
    await until(game, (dt) => {
      tt += dt;
      v = 0.5 + 0.5 * Math.sin(tt * 3.0);
      hud.setNeedle(v);
      holdBall('player');
      return pressed !== null;
    });
    hud.button(null);
    const err = pressed - 0.5;
    const quality = Math.abs(err) < 0.14 ? 'good' : Math.abs(err) < 0.3 ? 'ok' : 'wild';
    await wait(200);
    hud.showMeter(false);
    P.char.play(soccer ? 'kick' : 'throw', 0.55);
    await wait(240);
    sfx.kick();
    const M = main.char.root.position;
    const land = new THREE.Vector3(M.x + (Math.random() - 0.5) * 0.5 + (quality === 'wild' ? (Math.random() < 0.5 ? -1.6 : 1.6) : 0), soccer ? groundY : 0.9, M.z + err * 5.5);
    const start = ball.position.clone();
    const T = soccer ? 1.4 : 1.25;
    let t = 0;
    if (quality !== 'good') game.npcs.walkTo(main, land.x, land.z + (soccer ? 0 : 0.35), 3.6);
    await until(game, (dt) => {
      t += dt;
      const s = Math.min(1, t / T);
      ball.position.lerpVectors(start, land, s);
      if (!soccer) ball.position.y += Math.sin(s * Math.PI) * 2.2;
      ball.rotation.x -= dt * 8;
      ballShadow.position.set(ball.position.x, 0.02, ball.position.z);
      return t >= T;
    });
    let ok = quality !== 'wild';
    if (ok) {
      main.char.play(soccer ? 'kick' : 'catch', 0.6);
      sfx.catch();
      hud.pop(quality === 'good' ? 'Nice throw!' : 'Good!', 'good');
      hud.say(main.npc, quality === 'good' ? (soccer ? 'Nice pass!' : 'Nice throw!') : 'I got it!', quality === 'good' ? 'ナイス！' : 'とれた！');
    } else {
      sfx.bounce();
      hud.pop('Whoa!', 'miss');
      hud.say(main.npc, 'Oops! Let me get it!', 'おっと！取ってくるね！');
      await game.npcs.walkTo(main, land.x, land.z + 0.4, 3.6);
    }
    holdBall(main);
    await game.npcs.walkTo(main, f.b.x, f.b.z, 3.2);
    main.char.setYaw(0);
    holdBall(main);
    await wait(250);
    return ok;
  };

  // Which side spot each waiting friend stands on.
  const spotOf = new Map(actors.slice(1, 3).map((o, k) => [o, k]));
  for (let i = 0; i < TURNS; i++) {
    // Next friend's turn: they swap places with the current partner.
    const next = actors[Math.floor(i / 2) % Math.min(actors.length, 3)];
    if (i % 2 === 0 && next !== main && spotOf.has(next)) {
      const k = spotOf.get(next);
      const prev = main;
      spotOf.delete(next);
      spotOf.set(prev, k);
      hud.say(next.npc, 'My turn!', '次はわたし！');
      await Promise.all([game.npcs.walkTo(prev, sideSpots[k].x, sideSpots[k].z, 3.4), game.npcs.walkTo(next, f.b.x, f.b.z, 3.4)]);
      prev.char.setYaw(sideYaw[k]);
      next.char.setYaw(0);
      main = next;
      holdBall(main);
    }
    const ok = i % 2 === 0 ? await receive() : await throwBall();
    if (ok) for (const o of actors) if (o !== main) o.char.play('cheer', 1.0);
    results.push(ok);
    hud.setScore(results, TURNS);
    await wait(350);
  }
  main = actors[0];
  hud.setHint('', '');
  hud.say(null);
  const score = results.filter(Boolean).length;
  hud.pop(score >= 5 ? 'Amazing teamwork! ★★★' : score >= 3 ? 'Great teamwork! ★★' : 'Good teamwork! ★', 'good');
  sfx.great();
  await wait(900);
  hud.hide();

  // Photo: side by side, cheering.
  let photo = null;
  await game.fade(() => {
    ball.visible = false; ballShadow.visible = false;
    P.place(f.x - 0.45, f.z + 1.0, 0);
    main.char.setPosition(f.x + 0.45, f.z + 1.0);
    main.char.setYaw(0);
    if (actors[1]) { actors[1].char.setPosition(f.x + 1.3, f.z + 0.9); actors[1].char.setYaw(-0.2); }
    if (actors[2]) { actors[2].char.setPosition(f.x - 1.3, f.z + 0.9); actors[2].char.setYaw(0.2); }
    game.camera.shot(new THREE.Vector3(f.x + 0.1, 1.35, f.z + 4.4), new THREE.Vector3(f.x + 0.1, 0.8, f.z + 1.0), 20);
    game.camera.snap();
  });
  P.char.play('cheer', 1.6);
  for (const a of actors) { a.char.play('cheer', 1.6); a.char.setExpression('happy', 3); }
  P.char.setExpression('happy', 3);
  await wait(500);
  try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; }
  sfx.chime();
  game.hud.flashPhoto();
  await wait(700);
  game.camera.frameTalk([P.char, ...actors.map((a) => a.char)]);
  await c.say(main, line('That was fun!', '楽しかった！', { area: 'verbs' }), { gesture: 'happy', expr: 'happy' });
  const r = await c.ask([
    opt('thanks', 'Thank you! That was fun!', 'ありがとう！楽しかった！', { emoji: '😄', phrases: ['thank you that was fun', 'that was fun', 'thank you', 'fun'] }),
    opt('again', "Let's play again!", 'またやろう！', { emoji: '🙌', phrases: ["let's play again", 'play again', 'again'] }),
  ]);
  await c.say(main, r.id === 'again' ? line("Yes! Let's play again soon!", 'うん！またすぐやろうね！') : line('Thank you, too!', 'こちらこそ、ありがとう！'), { expr: 'happy' });
  game.dialogue.close();
  ball.removeFromParent(); ballShadow.removeFromParent(); ring.removeFromParent(); timing.removeFromParent();
  return { actors, score, detail: { score, turns: TURNS }, photo, phrase: soccer ? 'Do you want to play soccer?' : 'Can you catch? — Yes, I can!' };
}
