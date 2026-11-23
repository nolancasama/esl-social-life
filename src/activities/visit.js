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
import { npcSkill, gamesCount, noticeFor, markNoticed, visitChoices, VISIT_PLAYS, THINGS } from '../world/things.js';
import { visitPlay } from './things.js';
import { loadPhotos } from '../core/store.js';
import { sfx } from '../core/audio.js';
import { rngFor } from '../core/rng.js';
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
  // The friend really plays each lap: seeded by their skill, never fixed (DESIGN_DECISIONS 2026-11-23).
  const skill = npcSkill(npc, 'racing');
  const fr = rngFor('tv-race', npc.id, game.world.day, game.world.period);
  const friendLaps = [0, 1, 2].map(() => { const x = fr.next(); return x < skill * 0.6 ? 2 : x < skill + 0.3 ? 1 : 0; });
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
    hud.say({ name: npc.name, color: npc.color || '#E0607E' }, friendLaps[i] === 2 ? 'Super boost! Yay!' : friendLaps[i] === 1 ? 'Boost!' : 'Oh no! Spin out!', friendLaps[i] === 2 ? 'スーパーブースト！' : friendLaps[i] === 1 ? 'ブースト！' : 'あー！スピン！');
    if (friendLaps[i] === 2) a.char.play('cheer', 0.8); else if (friendLaps[i] === 0) a.char.play('surprised', 0.8);
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

// What a friend remembers about the visit: the thing you really played with.
const VISIT_RECALL = {
  pairs: { en: 'We played your board game at your house', ja: 'あなたの家でボードゲームをしたね' },
  robot: { en: 'We played with your robot. Your robot was funny', ja: 'あなたのロボットで遊んだね。おもしろかった' },
  kendama: { en: 'We played kendama at your house', ja: 'あなたの家でけん玉をしたね' },
  read: { en: 'We read a book together at your house', ja: 'あなたの家でいっしょに本を読んだね' },
  draw: { en: 'We drew pictures at your house', ja: 'あなたの家で絵をかいたね' },
  race: { en: 'We played a racing game at your house', ja: 'あなたの家でレースゲームをしたね' },
};

async function seatOnRug(game, a) {
  const P = game.player;
  await game.fade(() => {
    P.place(-0.35, 0.75, Math.PI / 2);
    P.char.setBase('sit', { height: 0.02 });
    a.char.setPosition(1.05, 0.75);
    a.char.setYaw(-Math.PI / 2);
    a.char.setBase('sit', { height: 0.02 });
    // Aim left of the pair so they stand on the right, beside the board.
    game.camera.shot(new THREE.Vector3(-0.7, 1.8, 3.5), new THREE.Vector3(-1.05, 0.65, 0.55), 5);
    game.camera.snap();
  });
  game.sitting = true;
}

export async function playVisit(game, actor) {
  let playDetail = null;
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
  // The real count from the save: the TV racing game, plus a board game if
  // you bought one. Only true answers are offered (DESIGN_DECISIONS 2026-11-23).
  const mineGames = gamesCount(w.save);
  const word = numberWord(mineGames);
  const gr = await c.ask([
    opt(String(mineGames), `I have ${word} game${mineGames === 1 ? '' : 's'}.`, `${mineGames}こ持ってるよ。`, { emoji: '🎮', keys: [[word, String(mineGames)]], phrases: [`i have ${word} game`, `i have ${word} games`, `${word} games`, word], area: 'possessions', expr: 'a.have', template: 'I have (number) ___.' }),
  ]);
  recordPlayerAnswer(w.save, 'games', Number(gr.id), w.day);
  await c.say(a, npc.games > 0
    ? line(`I have ${numberWord(npc.games)} games! ${Number(gr.id) > npc.games ? 'You have a lot!' : ''}`.trim(), `わたしは${npc.games}こ持ってるよ！`, { area: 'possessions', expr: 'a.howmany' })
    : line("I don't have video games. Let's play yours!", 'わたしはテレビゲームを持ってないんだ。あなたのでやろう！', { area: 'possessions' }), { expr: 'happy' });
  w.learn(npc.id, 'games');

  // 4. "What do you want to play?" Your real things decide the choices, the
  // friend's own interests decide their wish, and your answer decides what
  // you do next (DESIGN_DECISIONS 2026-11-23).
  const notice = noticeFor(w.save, npc, { place: 'home', day: w.day });
  if (notice && !THINGS[notice.id].wear) {
    markNoticed(w.save, npc.id, notice.id, w.day);
    await c.say(a, line(notice.en, notice.ja, { area: 'possessions' }), { gesture: 'point', expr: 'surprised' });
  }
  const plays = visitChoices(w.save, npc);
  const wish = plays[0];
  await c.ask([opt('ask', 'What do you want to play?', '何をして遊びたい？', { emoji: '💭', phrases: ['what do you want to play', 'what do you want to do'], keys: [['what', 'play', 'want']], area: 'wantto', expr: 'q.wantplay', template: 'What do you want to play?' })]);
  await c.say(a, line(VISIT_PLAYS[wish].npc.en, VISIT_PLAYS[wish].npc.ja, { area: 'wantto', expr: 'a.wantplay', template: 'I want to play ___.' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await c.say(a, line('What do you want to play?', 'あなたは何をして遊びたい？', { area: 'wantto', expr: 'q.wantplay', template: 'What do you want to play?' }));
  const choice = await c.ask(plays.map((id) => {
    const p = VISIT_PLAYS[id];
    const words = p.en.toLowerCase().replace(/\.$/, '').split(' ');
    return opt(id, p.en, p.ja, { emoji: p.emoji, phrases: [words.join(' '), words.slice(-2).join(' ')], keys: [[words[words.length - 1]]], area: 'wantto', expr: id === 'souvenirs' ? 'a.wantshow' : 'a.wantplay', template: id === 'souvenirs' ? 'I want to show you ___.' : 'I want to play ___.' });
  }), { columns: 2 });
  await c.say(a, choice.id === wish ? line("Me too! Let's play!", 'わたしも！あそぼう！') : line("OK! That sounds fun! Let's do it!", 'いいよ！楽しそう！やろう！'), { gesture: 'happy', expr: 'happy' });
  let what;
  if (choice.id === 'race') what = await raceGame(game, a, c);
  else if (choice.id === 'souvenirs') what = await souvenirTour(game, a, c);
  else {
    await seatOnRug(game, a);
    const r = await visitPlay(game, choice.id, a, c);
    what = r?.detail?.result || choice.id;
    playDetail = r?.detail || null;
    P.char.setBase('idle');
    a.char.setBase('idle');
    game.sitting = false;
  }
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
    phrase: choice.id === 'souvenirs' ? 'This is from ___.' : `What do you want to play? — ${VISIT_PLAYS[choice.id].en}`,
    detail: {
      visit: true, game: choice.id, result: what, place: 'home', coop: true, wish, wishMet: choice.id === wish,
      item: playDetail?.item || (choice.id === 'race' ? 'tv' : null), play: playDetail,
      recall: VISIT_RECALL[choice.id] || { en: 'I visited your house', ja: 'あなたの家に遊びに行ったね' },
      label: { en: `${npc.name} came over!`, ja: `${npc.name}が遊びに来た！`, emoji: '🏠' },
    },
  };
}
