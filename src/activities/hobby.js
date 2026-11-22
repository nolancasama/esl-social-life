// Hobby Session: doing a friend's favourite thing together (friendship
// templates hobby, practice and project). Variants built on the activity HUD
// and answer cards; every one ends in a real memory and nothing can fail
// (a miss gets a friendly "One more time!"):
//   draw   — choose what to draw and its colour, draw it stroke by stroke,
//            see your friend's picture and say something nice about it;
//   spot   — look for bugs or animals in the park ("Let's look under the
//            bench."), then count them ("How many?" — "Three!");
//   music  — sing, play or dance together: press on the beat;
//   ball   — practice: you throw, your friend learns to catch (or stop) it.
// project: draw a card for a mutual friend; it is delivered afterwards.

import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line, P } from '../dialogue/lines.js';
import { PHRASES, YES_KEYS } from '../dialogue/intent.js';
import { StaticBuilder } from '../engine/builder.js';
import { sfx } from '../core/audio.js';
import { holdMusic } from '../core/music.js';
import { wait, el } from '../core/util.js';
import { interest, numberWord } from '../data/content.js';
import { styleLine, styleGesture } from '../world/personality.js';
import { until, makeBall } from './ballplay.js';
import { rhythmGrade } from '../world/arcade.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);

function sline(npc, key, name) {
  const l = styleLine(npc, key, { name });
  return l ? line(l.en, l.ja) : line('Nice!', 'いいね！');
}

// ---------------------------------------------------------------- staging

/** Seat or stand the player and friend for a variant; returns the friend's actor. */
async function stage(game, actor, where) {
  const w = game.world;
  const schoolRoom = where === 'musicroom' || where === 'artroom';
  const needScene = schoolRoom ? where : where === 'friendhouse' ? 'friendhouse' : where === 'cafe' ? 'cafe' : 'town';
  if (game.sceneId !== needScene) await game.enterScene(needScene, needScene === 'cafe' ? 'door' : 'park');
  const scene = game.scene;
  const P0 = game.player;
  let pA, pB, sit = false;
  if (schoolRoom) {
    [pA, pB] = scene.activitySeats;
  } else if (where === 'friendhouse') {
    [pA, pB] = scene.activitySeats; sit = true;
  } else if (where === 'cafe') {
    pA = scene.seats.find((s) => s.id === 'T2-0'); pB = scene.seats.find((s) => s.id === 'T2-1'); sit = true;
  } else if (where === 'bench') {
    pA = scene.spots.find((s) => s.id === 'pb2a'); pB = scene.spots.find((s) => s.id === 'pb2b'); sit = true;
  } else {
    const f = scene.field;
    pA = { x: f.a.x, z: f.a.z, yaw: Math.PI }; pB = { x: f.b.x, z: f.b.z, yaw: 0 };
  }
  const a = game.npcs.ensure(actor.npc, pB.x, pB.z, pB.yaw);
  game.npcs.engage(a);
  await game.fade(() => {
    game.npcs.clearArea((pA.x + pB.x) / 2, (pA.z + pB.z) / 2, where === 'field' ? 6 : 2.4, [a]);
    P0.place(pA.x, pA.z, pA.yaw);
    a.char.setPosition(pB.x, pB.z);
    a.char.setYaw(pB.yaw);
    if (sit) { P0.char.setBase('sit', { height: pA.seatY }); a.char.setBase('sit', { height: pB.seatY }); }
    else { a.char.setBase('idle'); }
    const mx = (pA.x + pB.x) / 2, mz = (pA.z + pB.z) / 2;
    if (schoolRoom) {
      game.camera.configure(scene.camera, P0.char, scene.collision);
      game.camera.release();
    } else if (where === 'field') {
      game.camera.shot(new THREE.Vector3(pA.x + 0.4, 3.3, pA.z + 5.4), new THREE.Vector3(mx - 0.9, 0.5, mz - 0.6), 5);
    } else {
      const yaw = where === 'bench' ? pA.yaw : (pA.yaw + pB.yaw) / 2 + Math.PI / 2;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      game.camera.shot(new THREE.Vector3(mx + fx * 3.0, 1.7, mz + fz * 3.0), new THREE.Vector3(mx, 0.8, mz), 5);
    }
    game.camera.snap();
  });
  game.sitting = sit;
  return { a, sit, where, w };
}

function unstage(game, a, sit) {
  game.dialogue.close();
  game.activityHud.hide();
  if (sit) { game.player.char.setBase('idle'); a.char.setBase('idle'); }
  game.sitting = false;
}

// ---------------------------------------------------------------- draw together (and project cards)

const DRAW_SUBJECTS = {
  park: [{ en: 'the pond', ja: '池', emoji: '🐟' }, { en: 'the cherry tree', ja: '桜の木', emoji: '🌸' }, { en: 'the slide', ja: 'すべり台', emoji: '🛝' }, { en: 'the sky', ja: '空', emoji: '☁️' }],
  cafe: [{ en: 'a cake', ja: 'ケーキ', emoji: '🍰' }, { en: 'a cup', ja: 'カップ', emoji: '☕' }, { en: 'a flower', ja: '花', emoji: '🌷' }, { en: 'the window', ja: '窓', emoji: '🪟' }],
};
// Something to draw for each interest (cards for a friend who likes it).
const DRAW_FOR = {
  soccer: ['a soccer ball', 'サッカーボール', '⚽'], baseball: ['a baseball', '野球のボール', '⚾'], dodgeball: ['a ball', 'ボール', '🔴'], basketball: ['a basketball', 'バスケットボール', '🏀'],
  swimming: ['the sea', '海', '🌊'], running: ['shoes', 'くつ', '👟'], music: ['music notes', '音ぷ', '🎵'], singing: ['a microphone', 'マイク', '🎤'], piano: ['a piano', 'ピアノ', '🎹'],
  dancing: ['dancers', 'おどる人', '💃'], drawing: ['paints', '絵の具', '🎨'], reading: ['books', '本', '📚'], games: ['a game', 'ゲーム', '🎮'], cooking: ['a pancake', 'パンケーキ', '🥞'],
  sweets: ['a cake', 'ケーキ', '🍰'], animals: ['a dog', '犬', '🐶'], bugs: ['a ladybug', 'てんとう虫', '🐞'], shopping: ['a shop', 'お店', '🛍️'], skateboarding: ['a skateboard', 'スケボー', '🛹'],
  comics: ['a comic', 'まんが', '📖'], cycling: ['a bike', '自転車', '🚲'],
};
const COLORS = [
  { id: 'red', en: 'red', ja: '赤', hex: '#FF6B6B' }, { id: 'blue', en: 'blue', ja: '青', hex: '#4DABF7' }, { id: 'yellow', en: 'yellow', ja: '黄色', hex: '#FFD43B' },
  { id: 'green', en: 'green', ja: '緑', hex: '#69DB7C' }, { id: 'pink', en: 'pink', ja: 'ピンク', hex: '#F783AC' }, { id: 'purple', en: 'purple', ja: 'むらさき', hex: '#9775FA' }, { id: 'orange', en: 'orange', ja: 'オレンジ', hex: '#FFA94D' },
];
const drawFor = (likeId) => { const d = DRAW_FOR[likeId]; return d ? { en: d[0], ja: d[1], emoji: d[2], like: likeId } : null; };

function paintPicture(ctx, x, y, w, h, pic, step) {
  ctx.save();
  ctx.fillStyle = '#FFFDF7';
  ctx.fillRect(x, y, w, h);
  if (step >= 1) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `${pic.color}55`);
    g.addColorStop(1, '#FFFDF7');
    ctx.fillStyle = g;
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  }
  if (step >= 2) {
    ctx.fillStyle = pic.color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.floor(h * 0.42)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pic.emoji, x + w / 2, y + h * 0.55);
  }
  if (step >= 3) {
    ctx.font = `${Math.floor(h * 0.12)}px sans-serif`;
    for (const [sx, sy] of [[0.15, 0.2], [0.82, 0.25], [0.2, 0.85], [0.85, 0.8]]) ctx.fillText('✨', x + w * sx, y + h * sy);
  }
  ctx.strokeStyle = '#E0D6C4';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.restore();
}

/** Two pictures side by side (yours and your friend's) on a canvas overlay. */
function sketchbook(game, names) {
  const canvas = el('canvas', { width: 720, height: 340 });
  const wrap = el('div', { class: 'sketch' }, [canvas]);
  game.uiRoot.appendChild(wrap);
  const ctx = canvas.getContext('2d');
  const draw = (mine, theirs, myStep, theirStep, title = '') => {
    ctx.fillStyle = '#F4EBDD';
    ctx.fillRect(0, 0, 720, 340);
    paintPicture(ctx, 20, 20, 330, 270, mine, myStep);
    paintPicture(ctx, 370, 20, 330, 270, theirs, theirStep);
    ctx.fillStyle = '#5B4636';
    ctx.font = '800 22px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title || names[0], 185, 315);
    ctx.fillText(names[1], 535, 315);
  };
  const photo = () => {
    const small = document.createElement('canvas');
    small.width = 360; small.height = 225;
    small.getContext('2d').drawImage(canvas, 0, 0, 720, 340, 0, 0, 360, 225);
    try { return small.toDataURL('image/jpeg', 0.82); } catch { return null; }
  };
  return { draw, photo, close: () => wrap.remove() };
}

async function playDraw(game, actor, { project = null, where: sceneOption = null }) {
  const w = game.world;
  const name = w.save.player.name;
  const where = sceneOption || (game.sceneId === 'friendhouse' ? 'friendhouse' : game.sceneId === 'cafe' || w.weather === 'rainy' ? 'cafe' : 'bench');
  const { a, sit } = await stage(game, actor, where);
  const npc = a.npc;
  a.char.setProp('sketch');
  const c = new Conversation(game, [a]);
  const recipient = project ? w.npc(project.recipient) : null;
  let subjects;
  if (recipient) {
    const p = P(recipient);
    const like = interest(recipient.likes[0]);
    await c.say(a, line(`Let's make a card for ${recipient.name}! ${p.S} likes ${like.en}.`, `${recipient.name}にカードを作ろう！${recipient.name}は${like.ja}が好きなんだ。`, { area: 'intro', expr: 'i.likes', template: 'He/She likes ___.' }), { gesture: 'point', expr: 'happy' });
    subjects = [...recipient.likes.map(drawFor).filter(Boolean).slice(0, 2), DRAW_SUBJECTS.cafe[2]];
    await c.say(a, line('What do you want to draw?', '何をかきたい？', { area: 'wantto', expr: 'q.wantdraw', template: 'What do you want to draw?' }));
  } else {
    await c.say(a, line("Let's draw together! What do you want to draw?", 'いっしょに絵をかこう！何をかきたい？', { area: 'wantto', expr: 'q.wantdraw', template: 'What do you want to draw?' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
    subjects = shuffle(DRAW_SUBJECTS[where === 'friendhouse' || where === 'cafe' ? 'cafe' : 'park']).slice(0, 3);
  }
  const sChoice = await c.ask(subjects.map((s, i) => opt(`s${i}`, `I want to draw ${s.en}.`, `${s.ja}をかきたい。`, {
    emoji: s.emoji, keys: [[s.en.split(' ').pop()]], phrases: [`i want to draw ${s.en}`, s.en], area: 'wantto', expr: 'a.wantdraw', template: 'I want to draw ___.',
  })), { columns: 2 });
  const subject = subjects[Number(sChoice.id.slice(1))];
  const remembered = Boolean(recipient && subject.like && recipient.likes.includes(subject.like));
  if (remembered) await c.say(a, line(`Good idea! ${recipient.name} likes ${interest(subject.like).en}!`, `いいね！${recipient.name}は${interest(subject.like).ja}が好きだもんね！`), { gesture: 'happy', expr: 'happy' });
  await c.say(a, line(`What color is ${subject.en === 'the sky' ? 'the sky' : 'it'}?`, '何色にする？', { area: 'adjectives', expr: 'q.color', template: 'What color is it?' }));
  const colorOpts = shuffle(COLORS).slice(0, 4);
  const cChoice = await c.ask(colorOpts.map((col) => opt(col.id, `It's ${col.en}.`, `${col.ja}！`, { emoji: '🎨', keys: [[col.en]], phrases: [`it's ${col.en}`, col.en], area: 'adjectives', expr: 'a.color', template: "It's (color)." })), { columns: 2 });
  const myColor = COLORS.find((x) => x.id === cChoice.id);
  const theirLike = interest(npc.likes.find((l) => DRAW_FOR[l]) || npc.likes[0]);
  const theirs = drawFor(theirLike.id) || { en: 'a flower', ja: '花', emoji: '🌷' };
  const theirColor = COLORS[(npc.id.length + npc.likes.length) % COLORS.length];
  game.dialogue.close();

  // Draw it, stroke by stroke.
  const hud = game.activityHud;
  hud.show(recipient ? `💌 A card for ${recipient.name}` : '🎨 Drawing Time');
  const book = sketchbook(game, [recipient ? `For ${recipient.name}` : name, npc.name]);
  const mine = { color: myColor.hex, emoji: subject.emoji };
  const theirsPic = { color: theirColor.hex, emoji: theirs.emoji };
  let step = 0;
  book.draw(mine, theirsPic, 0, 0);
  const strokes = [];
  hud.setScore(strokes, 3);
  hud.setHint('Press DRAW three times!', 'DRAWを3回おそう！');
  await new Promise((resolve) => {
    hud.button('✏️ DRAW!', () => {
      if (step >= 3) return;
      step++;
      strokes.push(true);
      hud.setScore(strokes, 3);
      sfx.pop();
      game.player.char.play('talk', 0.6);
      a.char.play('talk', 0.6);
      book.draw(mine, theirsPic, step, step);
      if (step >= 3) { hud.button(null); setTimeout(resolve, 500); }
    }, 'throw');
  });
  hud.setHint('', '');
  sfx.great();
  hud.pop('Ta-da! ✨', 'good');
  const photo = book.photo();
  await wait(700);
  const cheer = styleLine(npc, 'cheer', { name });
  await c.say(a, line(`${cheer.en} I like your picture!`, `${cheer.ja}その絵、好きだな！`, { area: 'adjectives' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await c.say(a, line(`I drew ${theirs.en}. ${theirs.emoji}`, `わたしは${theirs.ja}をかいたよ。`, { area: 'verbs' }));
  const r = await c.ask([
    opt('well', 'You can draw well!', '絵がじょうずだね！', { emoji: '👏', phrases: ['you can draw well', 'draw well', 'well'], keys: [['well', 'draw']], area: 'verbs', expr: 'a.candraw', template: 'You can ___ well!' }),
    opt('beautiful', "It's beautiful!", 'きれい！', { emoji: '🌈', phrases: ["it's beautiful", 'beautiful'], keys: [['beautiful', 'pretty', 'nice']], area: 'adjectives', expr: 'a.beautiful', template: "It's beautiful!" }),
  ]);
  await c.say(a, sline(npc, 'thanks', name), { expr: 'happy' });
  if (recipient) await c.say(a, line(`${recipient.name} will be happy! Let's give it to ${P(recipient).o}!`, `${recipient.name}、きっとよろこぶね！わたしてあげよう！`), { gesture: 'happy', expr: 'happy' });
  book.close();
  a.char.setProp(null);
  unstage(game, a, sit);
  const place = where === 'cafe' ? 'cafe' : 'park';
  return {
    actors: [a], score: 3, photo, remembered,
    phrase: `I want to draw ${subject.en}. — It's ${myColor.en}.`,
    detail: recipient
      ? { variant: 'draw', subject: subject.en, color: myColor.id, recipient: recipient.id, place, recall: { en: `We made a card for ${recipient.name}`, ja: `${recipient.name}へのカードを作ったね` }, label: { en: `A card for ${recipient.name}!`, ja: `${recipient.name}へのカード！`, emoji: '💌' } }
      : { variant: 'draw', subject: subject.en, color: myColor.id, compliment: r.id, place, recall: { en: `We drew ${subject.en} together`, ja: `いっしょに${subject.ja}の絵をかいたね` }, label: { en: 'Drawing together!', ja: 'いっしょにお絵かき！', emoji: '🎨' } },
  };
}

// ---------------------------------------------------------------- nature spotting

const CRITTERS = {
  bugs: [
    { id: 'ladybug', en: 'ladybug', plural: 'ladybugs', ja: 'てんとう虫' }, { id: 'butterfly', en: 'butterfly', plural: 'butterflies', ja: 'ちょうちょ' },
    { id: 'beetle', en: 'beetle', plural: 'beetles', ja: 'カブトムシ' }, { id: 'ant', en: 'ant', plural: 'ants', ja: 'アリ' },
  ],
  animals: [
    { id: 'bird', en: 'bird', plural: 'birds', ja: '鳥' }, { id: 'frog', en: 'frog', plural: 'frogs', ja: 'カエル' },
    { id: 'turtle', en: 'turtle', plural: 'turtles', ja: 'カメ' }, { id: 'cat', en: 'cat', plural: 'cats', ja: 'ねこ' },
  ],
};

function critterMesh(id) {
  const b = new StaticBuilder();
  switch (id) {
    case 'ladybug': b.sphere(0.06, '#E03131', 0, 0.03, 0, { sy: 0.6 }); b.sphere(0.03, '#212529', 0, 0.03, 0.06); b.sphere(0.013, '#212529', 0.025, 0.065, -0.01); b.sphere(0.013, '#212529', -0.025, 0.065, 0.015); break;
    case 'butterfly': b.box(0.02, 0.02, 0.1, '#5C3D2E', 0, 0.06, 0); b.box(0.12, 0.012, 0.09, '#F783AC', 0.07, 0.07, 0); b.box(0.12, 0.012, 0.09, '#FFD43B', -0.07, 0.07, 0); break;
    case 'beetle': b.sphere(0.07, '#3B2B24', 0, 0.04, 0, { sy: 0.6, sz: 1.3 }); b.box(0.015, 0.06, 0.015, '#3B2B24', 0, 0.06, 0.09); break;
    case 'ant': for (const z of [-0.05, 0, 0.05]) b.sphere(0.028, '#212529', 0, 0.03, z); break;
    case 'bird': b.sphere(0.07, '#4DABF7', 0, 0.08, 0); b.sphere(0.045, '#4DABF7', 0, 0.15, 0.04); b.cone(0.02, 0.05, '#FFD43B', 0, 0.15, 0.09, { rx: Math.PI / 2 }); break;
    case 'frog': b.sphere(0.07, '#51CF66', 0, 0.05, 0, { sy: 0.7 }); b.sphere(0.022, '#FFFFFF', 0.03, 0.1, 0.04); b.sphere(0.022, '#FFFFFF', -0.03, 0.1, 0.04); break;
    case 'turtle': b.sphere(0.09, '#2F9E44', 0, 0.02, 0, { sy: 0.55 }); b.sphere(0.035, '#8CE99A', 0, 0.05, 0.1); break;
    default: b.sphere(0.08, '#FFA94D', 0, 0.07, 0); b.sphere(0.06, '#FFA94D', 0, 0.16, 0.06); b.cone(0.02, 0.04, '#FFA94D', 0.03, 0.22, 0.06); b.cone(0.02, 0.04, '#FFA94D', -0.03, 0.22, 0.06);
  }
  const m = b.build();
  m.matrixAutoUpdate = true;
  return m;
}

async function playSpot(game, actor, { like }) {
  const w = game.world;
  const name = w.save.player.name;
  if (game.sceneId !== 'town') await game.enterScene('town', 'park');
  const scene = game.scene;
  const kind = like === 'bugs' ? 'bugs' : 'animals';
  const set = CRITTERS[kind];
  const a = game.npcs.ensure(actor.npc, scene.hides[0].look.x + 1, scene.hides[0].look.z, 0);
  const npc = a.npc;
  game.npcs.engage(a);
  const c = new Conversation(game, [a]);
  const meshes = [];
  const hides = shuffle(scene.hides);
  let at = hides[0];
  const goTo = async (h) => {
    const dx = h.look.x - h.item.x, dz = h.look.z - h.item.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    await game.fade(() => {
      game.npcs.clearArea(h.look.x, h.look.z, 2.4, [a]);
      const pp = scene.collision.nearestFree(h.look.x + nx * 0.4, h.look.z + nz * 0.4, 0.3);
      game.player.place(pp.x, pp.z, Math.atan2(h.item.x - pp.x, h.item.z - pp.z));
      const fp = scene.collision.nearestFree(h.look.x + nx * 0.4 - nz * 1.0, h.look.z + nz * 0.4 + nx * 1.0, 0.3);
      a.char.setPosition(fp.x, fp.z);
      a.char.faceToward(h.item.x, h.item.z);
      game.camera.shot(new THREE.Vector3(h.look.x + nx * 3.2 + nz * 0.8, 1.9, h.look.z + nz * 3.2 - nx * 0.8), new THREE.Vector3(h.item.x, h.item.y + 0.2, h.item.z), 5);
      game.camera.snap();
    });
  };
  await goTo(at);
  await c.say(a, kind === 'bugs'
    ? line("Let's look for bugs! 🐞 Where do you want to look?", '虫をさがそう！どこを見る？', { area: 'prepositions', expr: 'q.wherelook', template: 'Where do you want to look?' })
    : line("Let's look for animals! 🐦 Where do you want to look?", '動物をさがそう！どこを見る？', { area: 'prepositions', expr: 'q.wherelook', template: 'Where do you want to look?' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  let total = 0;
  const found = [];
  let photo = null;
  const used = new Set();
  for (let round = 0; round < 3; round++) {
    const options = hides.filter((h) => !used.has(h.id)).slice(0, 3);
    if (!options.length) break;
    const pick = await c.ask(options.map((h) => opt(h.id, `Let's look ${h.prep} the ${h.obj.en}.`, `${h.obj.ja}${{ in: 'の中', on: 'の上', under: 'の下', by: 'のそば' }[h.prep]}を見よう。`, {
      emoji: '🔍', keys: [[h.prep], [h.obj.en]], phrases: [`let's look ${h.prep} the ${h.obj.en}`, `${h.prep} the ${h.obj.en}`], area: 'prepositions', expr: `p.${h.prep}`, template: "Let's look in / on / under / by the ___.",
    })), { columns: 1 });
    at = options.find((h) => h.id === pick.id);
    used.add(at.id);
    game.dialogue.close();
    await goTo(at);
    const critter = set[(round + total) % set.length];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const m = critterMesh(critter.id);
      m.position.set(at.item.x + (i - (n - 1) / 2) * 0.22, Math.max(0.02, at.item.y - 0.05), at.item.z + (i % 2) * 0.12);
      m.rotation.y = Math.random() * Math.PI * 2;
      scene.root.add(m);
      meshes.push(m);
    }
    sfx.discover();
    game.player.char.play('surprised', 0.8);
    a.char.play('point', 1.2);
    await c.say(a, line(`Look! ${cap(critter.plural)}! How many ${critter.plural}?`, `見て！${critter.ja}だ！何びきいる？`, { area: 'possessions', expr: 'q.howmany', template: 'How many ___?' }), { expr: 'surprised' });
    const nums = shuffle([1, 2, 3, 4].filter((x) => x !== n)).slice(0, 2).concat(n).sort((x, y) => x - y);
    const ans = await c.ask(nums.map((x) => opt(String(x), `${cap(numberWord(x))}!`, `${x}！`, { emoji: '🔢', keys: [[numberWord(x), String(x)]], phrases: [numberWord(x), `${numberWord(x)} ${critter.plural}`], area: 'possessions', expr: 'a.number', template: '(number)!' })));
    if (Number(ans.id) === n) await c.say(a, line(`Yes! ${cap(numberWord(n))} ${n === 1 ? critter.en : critter.plural}! ${['🐞', '🦋', '🐸', '🐦'][round % 4]}`, `そう！${n}ひき！`), { gesture: 'happy', expr: 'happy' });
    else await c.say(a, line(`Let's count! ${[...Array(n)].map((_, i) => cap(numberWord(i + 1))).join(', ')}! ${cap(numberWord(n))}!`, `数えよう！${[...Array(n)].map((_, i) => i + 1).join('、')}！`), { gesture: 'point', expr: 'happy' });
    total += n;
    found.push({ critter: critter.id, n, prep: at.prep, obj: at.obj.en });
    if (round === 1) { try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; } game.hud.flashPhoto(); }
  }
  const what = kind === 'bugs' ? 'bugs' : 'animals';
  await c.say(a, line(`We found ${numberWord(total)} ${what}! That was fun!`, `${total}ひきも見つけたね！楽しかった！`, { area: 'possessions' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await c.ask([opt('fun', 'Yes! It was fun!', 'うん！楽しかった！', { emoji: '😄', phrases: ['yes it was fun', 'it was fun', 'fun', 'yes'], keys: [['fun', 'yes']] })]);
  for (const m of meshes) m.removeFromParent();
  unstage(game, a, false);
  return {
    actors: [a], score: 3, photo, phrase: `Let's look ${at.prep} the ${at.obj.en}. — How many?`,
    detail: { variant: 'spot', kind, total, found, place: 'park', recall: { en: `We found ${numberWord(total)} ${what} in the park`, ja: `公園で${what === 'bugs' ? '虫' : '動物'}を${total}ひき見つけたね` }, label: { en: kind === 'bugs' ? 'Bug hunting!' : 'Animal watching!', ja: kind === 'bugs' ? '虫さがし！' : '動物さがし！', emoji: kind === 'bugs' ? '🐞' : '🐦' } },
  };
}

// ---------------------------------------------------------------- music time (and music practice)

const MUSIC = {
  singing: { verb: 'sing', ing: 'singing', past: 'sang songs', ja: '歌', jaPast: '歌を歌った', title: '🎤 Sing Along', gesture: 'talk' },
  music: { verb: 'play music', ing: 'playing music', past: 'played music', ja: '音楽', jaPast: '音楽をえんそうした', title: '🎵 Music Time', gesture: 'talk' },
  piano: { verb: 'play the piano', ing: 'playing the piano', past: 'played a song', ja: 'ピアノ', jaPast: '曲をえんそうした', title: '🎹 Music Time', gesture: 'talk' },
  dancing: { verb: 'dance', ing: 'dancing', past: 'danced', ja: 'ダンス', jaPast: 'おどった', title: '💃 Dance Time', gesture: 'dance' },
};

/**
 * The shared timing meter. `a` (a partner) is optional. With `grades` (an
 * array) each beat is also graded Perfect / Good / Miss for the arcade game.
 */
export async function rhythm(game, a, { beats = 8, title, gesture, grades = null, period = 1.25 }) {
  const hud = game.activityHud;
  hud.show(title);
  const results = [];
  hud.setScore(results, beats);
  hud.setHint('Press TAP when the arrow is in the green!', '矢印が緑のときにTAPをおそう！');
  hud.showMeter(true);
  const melody = [0, 2, 4, 2, 0, 4, 5, 7];
  for (let i = 0; i < beats; i++) {
    let t = 0, pressed = null;
    const T = period;
    hud.button('🎵 TAP!', () => { if (pressed === null) pressed = Math.min(1, t / T); }, 'throw');
    await until(game, (dt) => {
      t += dt;
      hud.setNeedle(Math.min(1, t / T));
      return pressed !== null || t >= T;
    });
    const hit = pressed !== null && pressed > 0.34 && pressed < 0.66;
    results.push(hit);
    hud.setScore(results, beats);
    const grade = grades ? rhythmGrade(pressed) : null;
    if (grades) grades.push(grade);
    if (hit) { sfx.note(melody[i % melody.length]); hud.pop(grades ? (grade === 'perfect' ? 'Perfect!' : 'Good!') : ['Nice!', 'Great!', 'Yes!'][i % 3], 'good'); game.player.char.play(gesture === 'dance' ? 'dance' : 'happy', 0.6); a?.char.play(gesture, 0.7); }
    else hud.pop(grades ? 'Miss' : 'Next one!', 'wait');
    await wait(220);
  }
  hud.button(null);
  hud.showMeter(false);
  hud.setHint('', '');
  return results.filter(Boolean).length;
}

async function playMusic(game, actor, { like, practice = false, where: sceneOption = null }) {
  const w = game.world;
  const name = w.save.player.name;
  const m = MUSIC[like] || MUSIC.music;
  const where = sceneOption || (game.sceneId === 'friendhouse' ? 'friendhouse' : game.sceneId === 'cafe' || w.weather === 'rainy' ? 'cafe' : 'field');
  const { a, sit } = await stage(game, actor, where);
  const npc = a.npc;
  const c = new Conversation(game, [a]);
  if (practice) {
    await c.say(a, line(`Thank you for helping me! Keep the beat for me. Press TAP on the green!`, '手伝ってくれてありがとう！リズムをとってね。緑のときにTAP！'), { expr: 'happy' });
    await c.ask([opt('yes', 'OK! You can do it!', 'うん！できるよ！', { emoji: '🙋', phrases: ['ok you can do it', 'you can do it', 'ok'], keys: YES_KEYS, area: 'verbs', expr: 'a.encourage', template: 'You can do it!' })]);
  } else {
    await c.say(a, line(`Let's ${m.verb} together! Can you ${m.verb}?`, `いっしょに${m.ja}しよう！できる？`, { area: 'verbs', expr: 'q.can', template: 'Can you ___?' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
    await c.ask([
      opt('yes', 'Yes, I can!', 'うん、できる！', { emoji: '💪', phrases: ['yes i can', ...PHRASES.yes], keys: YES_KEYS, area: 'verbs', expr: 'a.yesican', template: 'Yes, I can!' }),
      opt('little', 'A little!', 'ちょっとだけ！', { emoji: '🤏', phrases: ['a little', 'little'], keys: [['little']], area: 'verbs', expr: 'a.little' }),
    ]);
    await c.say(a, line("Let's go! Press TAP on the green!", 'いくよ！緑のときにTAPしてね！'));
  }
  game.dialogue.close();
  const hits = await rhythm(game, a, { beats: 8, title: m.title, gesture: m.gesture });
  let photo = null;
  try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; }
  game.hud.flashPhoto();
  if (practice) await c.say(a, line(`I can ${m.verb} well now! Thank you, ${name}!`, `${m.ja}がじょうずになったよ！ありがとう、${name}！`, { area: 'verbs', expr: 'a.canwell', template: 'I can ___ well!' }), { gesture: 'happy', expr: 'happy' });
  else if (hits >= 5) await c.say(a, line(`Wow! You can ${m.verb} well!`, `すごい！${m.ja}がじょうずだね！`, { area: 'verbs', expr: 'a.canwell', template: 'You can ___ well!' }), { gesture: 'happy', expr: 'happy' });
  else await c.say(a, line(`That was fun! Let's ${m.verb} again sometime!`, `楽しかった！またいっしょに${m.ja}しようね！`), { expr: 'happy' });
  await c.ask([opt('too', practice ? 'You can do it!' : `You can ${m.verb} well, too!`, practice ? 'できるよ！' : `${npc.name}もじょうずだよ！`, { emoji: '👏', phrases: ['you can do it', 'you can', 'well too', 'too'], keys: [['can', 'well', 'too']], area: 'verbs', expr: 'a.canwell', template: 'You can ___ well!' })]);
  await c.say(a, sline(npc, 'thanks', name), { expr: 'happy' });
  unstage(game, a, sit);
  const place = where === 'cafe' ? 'cafe' : 'park';
  return {
    actors: [a], score: hits >= 5 ? 3 : 2, photo, phrase: practice ? `I can ${m.verb} well now!` : `Can you ${m.verb}? — Yes, I can!`,
    detail: practice
      ? { variant: 'music', practice: true, like, hits, place, recall: { en: `You helped me practice ${m.ing}`, ja: `${m.ja}の練習を手伝ってくれたね` }, label: { en: 'Practice time!', ja: '練習！', emoji: '💪' } }
      : { variant: 'music', like, hits, place, recall: { en: `We ${m.past} together`, ja: `いっしょに${m.jaPast}ね` }, label: { en: m.title.replace(/^\S+ /, ''), ja: m.ja, emoji: m.title.split(' ')[0] } },
  };
}

// ---------------------------------------------------------------- ball practice (you throw, they learn)

async function playBallPractice(game, actor, { soccer }) {
  const w = game.world;
  const name = w.save.player.name;
  const { a } = await stage(game, actor, 'field');
  const npc = a.npc;
  const P0 = game.player;
  const hud = game.activityHud;
  const c = new Conversation(game, [a]);
  const skill = soccer ? { want: 'stop the ball well', can: 'stop the ball', ja: 'ボールを止める', ing: 'stopping the ball' } : { want: 'catch the ball well', can: 'catch well', ja: 'キャッチ', ing: 'catching' };
  await c.say(a, line(`Thank you for helping me! I want to ${skill.want}. Throw the ball to me, please!`, `手伝ってくれてありがとう！${skill.ja}がうまくなりたいんだ。ボールを投げてね！`, { area: 'wantto', expr: 'a.wantto', template: 'I want to ___.' }), { expr: 'happy' });
  const ball = makeBall(soccer);
  game.scene.root.add(ball);
  const results = [];
  const TURNS = 4;
  let photo = null;
  hud.show(soccer ? '⚽ Practice' : '⚾ Practice');
  hud.setScore(results, TURNS);
  const calls = [
    ['Ready? Catch!', 'いくよ！キャッチ！'], ['You can do it!', 'できるよ！'], ['Nice! One more!', 'いいね！もう一回！'], ['Last one! Good luck!', '最後だよ！がんばって！'],
  ];
  for (let i = 0; i < TURNS; i++) {
    const [en, ja] = soccer && i === 0 ? ['Ready? Here it comes!', 'いくよ！'] : calls[i];
    await c.ask([opt('call', en, ja, { emoji: '📣', phrases: [en.toLowerCase()], keys: [[en.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')]], area: 'verbs', expr: 'a.encourage', template: en })], { silent: true });
    game.dialogue.close();
    hud.setHint(soccer ? 'Press KICK when the arrow is in the green!' : 'Press THROW when the arrow is in the green!', '矢印が緑のときにボタンをおそう！');
    hud.showMeter(true);
    let v = 0, tt = Math.random() * 3, pressed = null;
    hud.button(soccer ? 'KICK! 🦶' : 'THROW! 💨', () => { if (pressed === null) pressed = v; }, 'throw');
    const pp = P0.char.root.position;
    await until(game, (dt) => {
      tt += dt;
      v = 0.5 + 0.5 * Math.sin(tt * 3.0);
      hud.setNeedle(v);
      ball.position.set(pp.x + Math.sin(P0.char.yaw) * 0.4, soccer ? 0.12 : 0.95, pp.z + Math.cos(P0.char.yaw) * 0.4);
      return pressed !== null;
    });
    hud.button(null);
    hud.showMeter(false);
    const good = Math.abs(pressed - 0.5) < 0.3;
    // The friend gets better each time: the first try may slip, the rest work.
    const caught = i > 0 ? true : good && Math.random() < 0.5;
    P0.char.play(soccer ? 'kick' : 'throw', 0.55);
    await wait(240);
    sfx.kick();
    const M = a.char.root.position;
    const start = ball.position.clone();
    const end = new THREE.Vector3(M.x + (caught ? 0 : 0.9), soccer ? 0.12 : 0.9, M.z + (caught ? 0.3 : 0.9));
    let t = 0;
    await until(game, (dt) => {
      t += dt;
      const s = Math.min(1, t / 1.2);
      ball.position.lerpVectors(start, end, s);
      if (!soccer) ball.position.y += Math.sin(s * Math.PI) * 1.6;
      return s >= 1;
    });
    results.push(caught);
    hud.setScore(results, TURNS);
    if (caught) { sfx.catch(); a.char.play(soccer ? 'kick' : 'catch', 0.7); hud.pop(i === TURNS - 1 ? 'Perfect!' : 'Nice!', 'good'); }
    else { a.char.play('surprised', 0.8); hud.pop('Oops!', 'wait'); await c.say(a, line("Oops! I can do it! One more time!", 'あっ！大丈夫、できるよ！もう一回！'), { expr: 'surprised' }); }
    await wait(400);
    if (i === 1) { try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; } game.hud.flashPhoto(); }
  }
  ball.removeFromParent();
  hud.setHint('', '');
  await c.say(a, line(`I can ${skill.can} now! Thank you, ${name}!`, `${skill.ja}ができるようになった！ありがとう、${name}！`, { area: 'verbs', expr: 'a.cannow', template: 'I can ___ now!' }), { gesture: 'happy', expr: 'happy' });
  await c.ask([opt('great', 'Great job!', 'よくできたね！', { emoji: '👏', phrases: ['great job', 'good job', 'great'], keys: [['great', 'good', 'job']], area: 'adjectives', expr: 'a.greatjob', template: 'Great job!' })]);
  unstage(game, a, false);
  return {
    actors: [a], score: 3, photo, phrase: `I can ${skill.can} now!`,
    detail: { variant: 'ball', practice: true, soccer, place: 'park', again: { act: soccer ? 'soccer' : 'catch' }, recall: { en: `You helped me practice ${skill.ing}`, ja: `${skill.ja}の練習を手伝ってくれたね` }, label: { en: 'Practice time!', ja: '練習！', emoji: '💪' } },
  };
}

// ---------------------------------------------------------------- entry

/**
 * variant: 'draw' | 'spot' | 'music' | 'ball'
 * like: the interest behind it; practice: help the friend get better;
 * project: { recipient } for a card.
 */
export async function playHobby(game, actors, { variant, like = null, practice = false, project = null, soccer = false, where = null } = {}) {
  const actor = actors[0];
  if (variant === 'draw') return playDraw(game, actor, { project, where });
  if (variant === 'spot') return playSpot(game, actor, { like });
  if (variant === 'music') {
    const release = holdMusic('activity');
    try { return await playMusic(game, actor, { like, practice, where }); }
    finally { release(); }
  }
  return playBallPractice(game, actor, { soccer });
}
