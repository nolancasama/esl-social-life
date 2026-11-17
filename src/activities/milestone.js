// Best-friend milestone (template best_friend, Lv5, once): the friend takes
// you to their special bench in Sakura Park, recalls real shared memories,
// asks about your favourite day, says what the friendship means and gives you
// a keepsake made from their own interests. It costs one period; the time
// card was shown before it started.

import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES } from '../dialogue/intent.js';
import { styleGesture } from '../world/personality.js';
import { memoryRefs, presentFor } from '../world/friendship.js';
import { presentPhrase } from '../data/events.js';
import { sfx } from '../core/audio.js';
import { wait } from '../core/util.js';

/** A short card for "What was your favorite day?" (the player's own words). */
function dayCard(r) {
  const d = r.detail || {};
  if (r.type === 'help') return { en: `Finding your ${d.item}!`, ja: `${d.itemJa || d.item}をさがしたこと！`, emoji: '🔍' };
  if (r.act === 'soccer') return { en: 'Playing soccer!', ja: 'サッカーをしたこと！', emoji: '⚽' };
  if (r.act === 'catch') return { en: 'Playing catch!', ja: 'キャッチボールをしたこと！', emoji: '⚾' };
  if (r.act === 'cafe' && r.type === 'activity') return { en: 'The café!', ja: 'カフェに行ったこと！', emoji: '☕' };
  if (d.label?.en) return { en: d.label.en, ja: d.label.ja || '', emoji: d.label.emoji || '⭐' };
  return { en: 'That fun day!', ja: 'あの楽しい日！', emoji: '⭐' };
}

export async function playMilestone(game, actor) {
  const w = game.world;
  let a = actor;
  if (game.sceneId !== 'town') {
    await game.enterScene('town', 'park');
    a = game.npcs.actorFor(actor.npc.id) || a;
  }
  const npc = a.npc;
  const scene = game.scene;
  const P = game.player;
  const sA = scene.spots.find((s) => s.id === 'pb1a');
  const sB = scene.spots.find((s) => s.id === 'pb1b');
  game.npcs.engage(a);
  const c = new Conversation(game, [a]);
  await game.fade(() => {
    game.npcs.clearArea((sA.x + sB.x) / 2, (sA.z + sB.z) / 2, 2.6, [a]);
    P.place(sA.x, sA.z, sA.yaw);
    P.char.setBase('sit', { height: sA.seatY });
    a.char.setPosition(sB.x, sB.z);
    a.char.setYaw(sB.yaw);
    a.char.setBase('sit', { height: sB.seatY });
    const mx = (sA.x + sB.x) / 2, mz = (sA.z + sB.z) / 2;
    const fx = Math.sin(sA.yaw), fz = Math.cos(sA.yaw);
    game.camera.shot(new THREE.Vector3(mx + fx * 3.1, 1.6, mz + fz * 3.1), new THREE.Vector3(mx, 0.8, mz), 5);
    game.camera.snap();
  });
  game.sitting = true;
  const name = w.save.player.name;

  await c.say(a, line('This is my special place. I like this bench. 🌸', 'ここがわたしのとっておきの場所。このベンチが好きなんだ。'), { expr: 'happy' });
  const refs = memoryRefs(w, npc.id, { limit: 3, all: true });
  if (refs.length) {
    await c.say(a, line('Do you remember?', '覚えてる？'), { gesture: 'think' });
    for (const r of refs) await c.say(a, line(r.en, r.ja, { area: 'verbs' }), { expr: 'happy' });
    await c.say(a, line('What was your favorite day?', 'いちばん楽しかった日はどれ？', { expr: 'q.favorite', area: 'adjectives', template: 'What was your favorite ___?' }));
    const cards = refs.map((r, i) => { const d = dayCard(r); return opt(`m${i}`, d.en, d.ja, { emoji: d.emoji, keys: [[d.en.replace(/[!.]/g, '').split(' ').pop().toLowerCase()]] }); });
    cards.push(opt('all', 'Every day was fun!', '毎日楽しかった！', { emoji: '🌈', phrases: ['every day was fun', 'every day', 'all of them'], keys: [['every', 'all']] }));
    const pickd = await c.ask(cards, { columns: 2 });
    await c.say(a, pickd.id === 'all' ? line('Me too! Every day with you is fun!', 'わたしも！いっしょだと毎日楽しい！') : line('Me too! That was a great day!', 'わたしも！あの日は最高だった！'), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  }
  await c.say(a, line(`${name}, you are my best friend!`, `${name}は、わたしの親友だよ！`, { area: 'adjectives', expr: 'i.bestfriend', template: 'You are my best friend!' }), { gesture: 'happy', expr: 'happy' });
  await c.ask([
    opt('too', "You're my best friend, too!", 'わたしにとっても親友だよ！', { emoji: '🌟', phrases: ["you're my best friend too", 'best friend too', 'you too', 'me too'], keys: [['best', 'friend', 'too']] }),
    opt('happy', "Thank you! I'm so happy!", 'ありがとう！すごくうれしい！', { emoji: '😊', phrases: ["thank you i'm so happy", 'thank you', 'so happy'], keys: [['thank', 'happy']] }),
  ]);
  const gift = presentFor(npc);
  sfx.discover();
  await c.say(a, line(`This is for you. It's ${presentPhrase(gift)}! ${gift.emoji}`, `これ、あげる。${gift.ja}だよ！`, { area: 'possessions', expr: 'a.forYou', template: 'This is for you.' }), { gesture: 'hold', expr: 'happy' });
  await c.ask([opt('thanks', 'Thank you! I love it!', 'ありがとう！大切にするね！', { emoji: gift.emoji, phrases: PHRASES.thanks, keys: [['thank']] })]);
  P.char.setExpression('happy', 3);
  a.char.setExpression('happy', 3);
  await wait(300);
  let photo = null;
  try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; }
  game.hud.flashPhoto();
  await c.say(a, line("Let's have lots more fun together!", 'これからもいっぱい遊ぼうね！'), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  game.dialogue.close();
  game.sitting = false;
  P.char.setBase('idle');
  a.char.setBase('idle');
  return {
    actors: [a], score: 3, photo, phrase: "You're my best friend!",
    detail: {
      keepsake: gift.en, place: 'park',
      recall: { en: 'We sat on my special bench', ja: 'とっておきのベンチにいっしょにすわったね' },
      label: { en: 'Our special bench!', ja: 'とっておきのベンチ！', emoji: '🌟' },
    },
  };
}
