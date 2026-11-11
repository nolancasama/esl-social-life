import * as THREE from 'three';
import { StaticBuilder } from '../engine/builder.js';
import { textTexture } from '../engine/textures.js';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES } from '../dialogue/intent.js';
import { NODES, DESTINATIONS, exitsAt, headingBetween, shortestNextNode, sideOfDest } from '../world/directions.js';

const COMMANDS = {
  straight: ['Go straight.', 'まっすぐ進んで。'],
  left: ['Turn left.', '左に曲がって。'],
  right: ['Turn right.', '右に曲がって。'],
  back: ['Turn back.', '来た道をもどって。'],
};
const SIDE_JA = { left: '左', right: '右', ahead: 'まっすぐ先' };
const OTHER_VIEW = {
  cafe: ['the school', '学校'], park: ['the town board', '町の案内板'],
  mall: ['the park', '公園'], school: ['the fence', 'フェンス'], shrine: ['the trees', '木'],
};
const sideText = (side) => side === 'ahead' ? "It's straight ahead." : `It's on your ${side}.`;

// Each arrow is one flat merged mesh with the shared toon material.
function makeArrow(scene, at, to, turn, heading) {
  const yaw = headingBetween(at, to), dx = Math.sin(yaw), dz = Math.cos(yaw);
  const b = new StaticBuilder();
  b.flat(0.24, 1.3, '#FFD166', 0, 0, 0);
  b.flat(0.22, 0.72, '#FFD166', -0.22, 0, 0.5, { ry: Math.PI / 4 });
  b.flat(0.22, 0.72, '#FFD166', 0.22, 0, 0.5, { ry: -Math.PI / 4 });
  const mesh = b.build();
  mesh.matrixAutoUpdate = true;
  mesh.position.set(at.x + dx * 2.5, 0.065, at.z + dz * 2.5);
  mesh.rotation.y = yaw;
  scene.root.add(mesh);
  const texture = textTexture(512, 128, { bg: '#FFF6E6', lines: [{ text: turn, size: 78, color: '#3E2F23' }] });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  label.position.set(at.x + dx * 3.2, 0.5, at.z + dz * 3.2);
  label.rotation.y = heading + Math.PI;
  scene.root.add(label);
  return { turn, mesh, dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); label.removeFromParent(); label.geometry.dispose(); label.material.dispose(); texture.dispose(); } };
}

export async function guideVisitor(game, actor, event) {
  const w = game.world, activities = game.activities;
  const dest = DESTINATIONS[event.dest];
  const c = new Conversation(game, [actor]);
  let node = event.start, previous = null, offCourse = false, wrongTurns = 0;
  let heading = headingBetween(node, exitsAt(node, null)[0].to);
  let arrows = [], pulse = 0;
  const state = activities._directions = { node, phase: 'walking', availableExitTurns: [], correctTurn: null, wrongTurns: 0, correctSide: null };
  const clearArrows = () => { arrows.forEach((a) => a.dispose()); arrows = []; };
  const camera = () => {
    const p = actor.char.root.position;
    game.camera.shot(new THREE.Vector3(p.x - Math.sin(heading) * 6, 5, p.z - Math.cos(heading) * 6), new THREE.Vector3(p.x + Math.sin(heading) * 1.5, 0.6, p.z + Math.cos(heading) * 1.5), 3);
  };
  const idle = () => { for (const ch of [actor.char, game.player.char]) { ch.speed = 0; ch.setBase('idle'); } };
  const publish = (phase, exits = []) => {
    Object.assign(state, { node, phase, availableExitTurns: exits.map((e) => e.turn), correctTurn: exits.find((e) => e.to === shortestNextNode(node, event.dest))?.turn || null, wrongTurns });
  };
  const walk = (target) => new Promise((resolve) => {
    state.phase = 'walking';
    state.availableExitTurns = [];
    const origin = actor.char.root.position.clone();
    const length = origin.distanceTo(target);
    let elapsed = 0;
    game.activityTick = (dt) => {
      elapsed += dt * 3;
      const t = Math.min(1, elapsed / Math.max(0.01, length));
      actor.char.root.position.lerpVectors(origin, target, t);
      actor.char.speed = 3; actor.char.setBase('walk'); actor.char.turnTo(heading);
      const p = actor.char.root.position;
      const follower = game.player.char;
      const tx = p.x - Math.sin(heading) * 1.6, tz = p.z - Math.cos(heading) * 1.6;
      const fp = follower.root.position;
      const distance = Math.hypot(tx - fp.x, tz - fp.z);
      const step = Math.min(distance, dt * 3.6);
      if (distance > 0.01) {
        follower.turnTo(Math.atan2(tx - fp.x, tz - fp.z));
        fp.x += (tx - fp.x) / distance * step; fp.z += (tz - fp.z) / distance * step;
      }
      follower.speed = distance > 0.05 ? 3 : 0; follower.setBase(distance > 0.05 ? 'walk' : 'idle');
      game.player.collider.x = fp.x; game.player.collider.z = fp.z;
      camera();
      if (t === 1) { idle(); game.activityTick = stoppedTick; resolve(); }
    };
  });
  const stoppedTick = (dt) => {
    actor.char.turnTo(heading);
    camera(); pulse += dt;
    for (const a of arrows) a.mesh.scale.setScalar(wrongTurns >= 2 && a.turn === state.correctTurn ? 1 + 0.2 * Math.sin(pulse * 5) : 1);
  };
  const frameBehind = () => new Promise((resolve) => {
    state.phase = 'framing';
    game.activityTick = (dt) => {
      stoppedTick(dt);
      const delta = Math.atan2(Math.sin(actor.char.yaw - heading), Math.cos(actor.char.yaw - heading));
      if (game.camera.pos.distanceTo(game.camera.talkShot.pos) < 0.18 && Math.abs(delta) < 0.05) {
        game.activityTick = stoppedTick;
        resolve();
      }
    };
  });
  game.player.stop();
  game.npcs.engage(actor);
  game.activityMove = null;
  game.setMode('activity');
  game.input.enabled = false;
  game.hud.setActivity(true);
  game.dialogue.close();
  game.activityTick = stoppedTick;
  try {
    while (node !== dest.node) {
      const exits = exitsAt(node, previous, { offCourse });
      publish('routing', exits);
      let choice = exits[0];
      if (exits.length > 1 || (previous && choice.turn === 'back')) {
        arrows = exits.map((e) => makeArrow(game.scene, NODES[node], NODES[e.to], e.turn, heading));
        await frameBehind();
        publish('decision', exits);
        const hint = wrongTurns >= 2 ? `「${COMMANDS[state.correctTurn][1]}」光る矢印を見てね。` : '旅行の人から見た向きで教えよう。';
        const r = await c.ask(exits.map((e) => opt(e.turn, ...COMMANDS[e.turn], { keys: [[e.turn]], phrases: PHRASES[e.turn], area: 'directions', expr: `d.${e.turn}`, template: COMMANDS[e.turn][0] })), {
          prompt: { ...c.speakerInfo(actor), en: 'Which way?', ja: `どちらへ行けばいいですか？ ${hint}` },
        });
        choice = exits.find((e) => e.turn === r.id);
        clearArrows();
      }
      game.dialogue.close();
      const wrong = choice.to !== shortestNextNode(node, event.dest);
      if (wrong) wrongTurns++;
      heading = headingBetween(node, choice.to);
      const next = NODES[choice.to];
      // Right-hand side of travel. School's offset stays inside the gate gap.
      const offset = choice.to === 'G' ? 0.6 : 1.2;
      await walk(new THREE.Vector3(next.x - Math.cos(heading) * offset, 0, next.z + Math.sin(heading) * offset));
      previous = node; node = choice.to; offCourse = wrong;
      publish(wrong ? 'wrong-turn' : 'routing');
      if (wrong) await c.say(actor, line(`Hmm, I see ${next.sees}. Where is ${dest.en}?`, `あれ、${next.ja}が見えるよ。${dest.ja}はどこかな？`));
    }
    idle();
    const correctSide = sideOfDest(node, heading, event.dest);
    await frameBehind();
    state.correctSide = correctSide;
    while (true) {
      publish('arrival');
      const sides = ['left', 'right', ...(correctSide === 'ahead' ? ['ahead'] : [])];
      const r = await c.ask(sides.map((side) => opt(side, sideText(side), `${SIDE_JA[side]}にあるよ。`, { keys: [[side === 'ahead' ? 'straight' : side]], phrases: [sideText(side)], area: 'directions', expr: `d.side.${side}`, template: sideText(side) })), { prompt: { ...c.speakerInfo(actor), en: 'Is it here?', ja: 'ここですか？旅行の人から見て、どちらかな？' } });
      if (r.id === correctSide) break;
      actor.char.play('look', 1);
      state.phase = 'wrong-side';
      const [view, viewJa] = OTHER_VIEW[event.dest];
      await c.say(actor, line(`Hmm, that's ${view}. ${correctSide === 'ahead' ? 'Is it straight ahead?' : `Is it on my ${correctSide}?`}`, `あれ、あれは${viewJa}だね。${SIDE_JA[correctSide]}かな？`));
    }
    state.phase = 'thanks';
    await c.say(actor, line('Thank you! You are very kind.', 'ありがとう！とてもやさしいね。'));
    await c.say(actor, line(actor.npc.from, actor.npc.fromJa));
    await c.ask([opt('welcome', "You're welcome!", 'どういたしまして！', { keys: [['welcome']], phrases: ["you're welcome", 'you are welcome'], area: 'directions', expr: 'd.welcome', template: "You're welcome!" })]);
    w.addSouvenir('postcard', actor.npc.id);
    event.done = true; w.daily.visitorDone = true;
    game.dialogue.close();
    state.phase = 'leaving';
    const p = actor.char.root.position;
    await walk(new THREE.Vector3(p.x + Math.sin(heading) * 2, 0, p.z + Math.cos(heading) * 2));
    state.phase = 'done';
    game.save();
  } finally {
    clearArrows(); idle();
    game.activityTick = null; game.activityMove = null;
    game.dialogue.close(); game.hud.setActivity(false);
    game.npcs.removeActor(actor);
    game.camera.release(); game.setMode('explore'); game.hud.refresh();
    activities._directions = null;
  }
}
