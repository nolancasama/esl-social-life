// Home visit (template home_visit, Lv4+): a close friend comes to the
// player's room. They look at the photo wall and remember a real shared
// memory, ask about your things ("How many games do you have?"), and you
// choose one thing to do together: a racing game on the TV, or showing your
// souvenirs ("This is from Ken."). Then they thank you and leave by the door.
// One period, like other outings; the bed, menus and saving work as before.

import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { YES_KEYS } from '../dialogue/intent.js';
import { numberWord, adjective } from '../data/content.js';
import { styleGesture } from '../world/personality.js';
import { memoryRefs, recordPlayerAnswer } from '../world/friendship.js';
import { loadPhotos } from '../core/store.js';
import { sfx } from '../core/audio.js';
import { wait } from '../core/util.js';
import { until } from './ballplay.js';

export async function raceGame(game, a, c) {
  const scene = game.scene;
  const P = game.player;
  const tv = scene.tv;
  const hud = game.activityHud;
  const npc = a.npc;
  await game.fade(() => {
    const [s1, s2] = tv.seats;
    P.place(s1.x, s1.z, s1.yaw);
    P.char.setBase('sit', { height: 0.12 });
    a.char.setPosition(s2.x, s2.z);
    a.char.setYaw(s2.yaw);
    a.char.setBase('sit', { height: 0.12 });
    P.char.setProp('console');
    a.char.setProp('console');
    game.camera.shot(new THREE.Vector3(0.85, 1.75, 0.9), new THREE.Vector3(0.8, 0.55, -3.3), 5);
    game.camera.snap();
  });
  game.sitting = true;
  await c.say(a, line("Let's race! Press BOOST on the green!", 'レースしよう！緑のときにBOOST！', { area: 'verbs' }), { expr: 'happy' });
  game.dialogue.close();
  hud.show('🏎️ Racing Game');
  const LAPS = 3;
  const results = [];
  hud.setScore(results, LAPS);
  hud.setHint('Press BOOST when the arrow is in the green!', '矢印が緑のときにBOOSTをおそう！');
  let mine = 0, theirs = 0;
  const friendLaps = [1, 2, 1];
  for (let i = 0; i < LAPS; i++) {
    tv.setColor(['#4DABF7', '#69DB7C', '#FFD43B'][i]);
    hud.showMeter(true);
    let v = 0, tt = Math.random() * 3, pressed = null;
    hud.button('🚀 BOOST!', () => { if (pressed === null) pressed = v; }, 'throw');
    await until(game, (dt) => {
      tt += dt;
      v = 0.5 + 0.5 * Math.sin(tt * 2.6);
      hud.setNeedle(v);
      return pressed !== null;
    });
    hud.button(null);
    hud.showMeter(false);
    const err = Math.abs(pressed - 0.5);
    const lap = err < 0.14 ? 2 : err < 0.3 ? 1 : 0;
    mine += lap;
    theirs += friendLaps[i];
    results.push(lap >= friendLaps[i]);
    hud.setScore(results, LAPS);
    if (lap === 2) { sfx.great(); hud.pop('Super boost! 🚀', 'good'); a.char.play('surprised', 0.8); }
    else if (lap === 1) { sfx.pop(); hud.pop('Boost!', 'good'); }
    else { sfx.deny(); hud.pop('Spin out! 🌀', 'wait'); a.char.play('happy', 0.8); }
    await wait(700);
  }
  hud.setHint('', '');
  hud.hide();
  tv.setColor(null);
  P.char.setProp(null);
  a.char.setProp(null);
  const win = mine > theirs ? 'you' : mine < theirs ? 'friend' : 'tie';
  if (win === 'you') await c.say(a, line("You win! You're good at games!", 'あなたの勝ち！ゲームがとくいだね！', { area: 'adjectives', expr: 'i.goodat', template: "You're good at ___!" }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  else if (win === 'friend') await c.say(a, line("I win! Ha ha! Let's play again!", 'わたしの勝ち！あはは！もう一回やろう！'), { gesture: 'cheer', expr: 'happy' });
  else await c.say(a, line("It's a tie! We're both good at games!", '引き分け！二人ともゲームがとくいだね！', { area: 'adjectives' }), { gesture: 'happy', expr: 'happy' });
  await c.ask([opt('fun', 'That was fun!', '楽しかった！', { emoji: '🎮', phrases: ['that was fun', 'fun'], keys: [['fun']] })]);
  P.char.setBase('idle');
  a.char.setBase('idle');
  game.sitting = false;
  return win;
}

async function souvenirTour(game, a, c) {
  const w = game.world;
  const P = game.player;
  await game.fade(() => {
    P.place(-3.0, 1.0, -Math.PI / 2);
    a.char.setPosition(-3.05, 2.1);
    a.char.setYaw(-Math.PI / 2);
    game.camera.shot(new THREE.Vector3(-0.6, 1.8, 1.7), new THREE.Vector3(-4.0, 0.8, 1.6), 5);
    game.camera.snap();
  });
  const list = w.save.souvenirs.slice(0, 12);
  if (!list.length) {
    await c.say(a, line("Your shelf is empty! Let's make memories together!", '棚がからっぽ！いっしょに思い出を作ろう！'), { expr: 'happy' });
    return 'empty';
  }
  a.char.play('point', 1.4);
  const n = Math.min(list.length, 12);
  await c.say(a, line(`Wow! You have ${numberWord(n)} souvenir${n === 1 ? '' : 's'}!`, `思い出の品が${n}こもある！`, { area: 'possessions', expr: 'a.have' }), { expr: 'surprised' });
  const mine = list.find((s) => s.npcId === a.npc.id);
  if (mine) await c.say(a, line('Oh! This one is from me! I remember that day!', 'あ！これはわたしとの思い出だ！あの日のこと覚えてるよ！'), { gesture: styleGesture(a.npc, 'happy'), expr: 'happy' });
  const other = list.find((s) => s.npcId && s.npcId !== a.npc.id && w.npc(s.npcId));
  if (other) {
    const o = w.npc(other.npcId);
    await c.ask([opt('from', `This is from ${o.name}.`, `これは${o.name}との思い出だよ。`, { emoji: '🎁', phrases: [`this is from ${o.name.toLowerCase()}`, 'this is from'], keys: [['from', o.name.toLowerCase()]], area: 'intro', expr: 'a.thisisfrom', template: 'This is from ___.' })]);
    const adj = adjective(o.adjectives[0]);
    await c.say(a, adj ? line(`Cool! ${o.name} is ${adj.en}!`, `いいね！${o.name}は${adj.ja}よね！`, { area: 'adjectives' }) : line('Cool!', 'いいね！'), { expr: 'happy' });
  }
  return 'souvenirs';
}

export async function playVisit(game, actor) {
  const w = game.world;
  if (game.sceneId !== 'home') await game.enterScene('home', 'door');
  const scene = game.scene;
  const P = game.player;
  const door = scene.spawns.door;
  const a = game.npcs.ensure(actor.npc, door.x - 0.6, door.z, -Math.PI / 2);
  const npc = a.npc;
  const name = w.save.player.name;
  game.npcs.engage(a);
  const c = new Conversation(game, [a]);
  c.arrange();
  c.frame();

  // 1. Welcome
  await c.say(a, line("Wow! This is your room? It's so nice!", 'わあ！ここがあなたの部屋？すてき！', { area: 'adjectives' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await c.ask([opt('welcome', 'Thank you! Come in!', 'ありがとう！入って！', { emoji: '🏠', phrases: ['thank you come in', 'come in', 'welcome'], keys: [['come', 'welcome', 'thank']] })]);

  // 2. The photo wall: a real memory
  await game.fade(() => {
    P.place(1.55, -2.25, Math.PI);
    a.char.setPosition(2.45, -2.25);
    a.char.setYaw(Math.PI);
    game.camera.shot(new THREE.Vector3(2.0, 1.5, 0.3), new THREE.Vector3(2.1, 1.75, -3.7), 5);
    game.camera.snap();
  });
  a.char.play('point', 1.4);
  const refs = memoryRefs(w, npc.id, { limit: 1, all: true });
  const ourPhotos = loadPhotos(w.save.id).filter((p) => (p.npcIds || []).includes(npc.id)).length;
  if (refs.length) {
    await c.say(a, ourPhotos ? line('Look! This is us!', '見て！わたしたちだ！') : line('You have nice photos!', 'すてきな写真がいっぱい！'), { expr: 'happy' });
    await c.say(a, line(refs[0].en, refs[0].ja, { area: 'verbs' }), { expr: 'happy' });
    await c.ask([opt('fun', 'Yes! That was fun!', 'うん！楽しかったね！', { emoji: '📸', phrases: ['yes that was fun', 'that was fun', 'yes'], keys: [['fun', 'yes']] })]);
  } else {
    await c.say(a, line('You have nice photos! I want a photo with you, too!', 'すてきな写真！わたしもいっしょに写りたいな！'), { expr: 'happy' });
    await c.ask([opt('sure', "Sure! Let's take one today!", 'いいよ！今日とろう！', { emoji: '📸', phrases: ['sure', "let's take one"], keys: YES_KEYS })]);
  }

  // 3. "How many games do you have?"
  await c.say(a, line(`${name}, how many games do you have?`, `${name}はゲームをいくつ持ってる？`, { area: 'possessions', expr: 'q.howmany', template: 'How many ___ do you have?' }));
  const counts = [2, 5, 10];
  const gr = await c.ask([
    ...counts.map((n) => opt(String(n), `I have ${numberWord(n)} games.`, `${n}こ持ってるよ。`, { emoji: '🎮', keys: [[numberWord(n), String(n)]], phrases: [`i have ${numberWord(n)} games`, numberWord(n)], area: 'possessions', expr: 'a.have', template: 'I have (number) ___.' })),
    opt('0', "I don't have games.", 'ゲームは持っていないよ。', { emoji: '🙅', phrases: ["i don't have games", 'no games'], keys: [['dont', "don't", 'no']], area: 'possessions', expr: 'a.no' }),
  ], { columns: 2 });
  recordPlayerAnswer(w.save, 'games', Number(gr.id), w.day);
  await c.say(a, npc.games > 0
    ? line(`I have ${numberWord(npc.games)} games! ${Number(gr.id) > npc.games ? 'You have a lot!' : ''}`.trim(), `わたしは${npc.games}こ持ってるよ！`, { area: 'possessions', expr: 'a.howmany' })
    : line("I don't have video games. Let's play yours!", 'わたしはテレビゲームを持ってないんだ。あなたのでやろう！', { area: 'possessions' }), { expr: 'happy' });
  w.learn(npc.id, 'games');

  // 4. "What do you want to play?"
  await c.say(a, line('What do you want to play?', '何をして遊びたい？', { area: 'wantto', expr: 'q.wantplay', template: 'What do you want to play?' }));
  const choice = await c.ask([
    opt('race', 'I want to play a racing game.', 'レースゲームをしたい。', { emoji: '🏎️', phrases: ['i want to play a racing game', 'racing game', 'game'], keys: [['racing', 'race', 'game']], area: 'wantto', expr: 'a.wantplay', template: 'I want to play ___.' }),
    opt('souvenirs', 'I want to show you my souvenirs.', '思い出の品を見せたい。', { emoji: '🧸', phrases: ['i want to show you my souvenirs', 'souvenirs', 'show you'], keys: [['souvenir', 'show']], area: 'wantto', expr: 'a.wantshow', template: 'I want to show you ___.' }),
  ]);
  const what = choice.id === 'race' ? await raceGame(game, a, c) : await souvenirTour(game, a, c);
  let photo = null;
  P.char.setExpression('happy', 3);
  a.char.setExpression('happy', 3);
  try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; }
  game.hud.flashPhoto();

  // 5. Goodbye: back to the door, and out.
  await c.say(a, line(`Thank you for inviting me, ${name}! Your room is so cool!`, `さそってくれてありがとう、${name}！すてきな部屋だね！`, { area: 'adjectives' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await c.ask([opt('bye', 'See you tomorrow!', 'またあしたね！', { emoji: '👋', phrases: ['see you tomorrow', 'see you', 'bye'], keys: [['see', 'bye']] })]);
  game.dialogue.close();
  game.camera.frameTalk([P.char, a.char]);
  a.char.play('wave', 1.2);
  await game.npcs.walkTo(a, door.x, door.z, 2.2);
  await game.npcs.walkTo(a, door.x + 0.8, door.z, 2.2);
  game.npcs.removeActor(a);
  sfx.door();
  return {
    actors: [a], score: 3, photo,
    phrase: choice.id === 'race' ? 'What do you want to play? — I want to play a racing game.' : 'This is from ___.',
    detail: {
      visit: true, game: choice.id, result: what, place: 'home',
      recall: { en: 'I visited your house', ja: 'あなたの家に遊びに行ったね' },
      label: { en: `${npc.name} came over!`, ja: `${npc.name}が遊びに来た！`, emoji: '🏠' },
    },
  };
}
