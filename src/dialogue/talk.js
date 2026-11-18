// Talk flows: what happens when the player talks to someone. Conversations
// are short and purposeful; every branch ends in a choice, never a dead end.

import { Conversation, opt, hearts } from './runner.js';
import {
  line, P, greeting, likeLine, canLine, weekLine, subjectLine, wakeLine, birthdayLine, petLines, gamesLine,
  dreamLines, foodLine, introLines, factSentence, pick,
} from './lines.js';
import { PHRASES, YES_KEYS, NO_KEYS } from './intent.js';
import {
  interest, ability, food, subject, DAYS, INTERESTS, SUBJECTS, PETS, WEATHER, PLAYER_LIKES, timeWords, timeJa,
  dateText, dateJa, adjective, LOST_ITEMS,
} from '../data/content.js';
import { ACT_INFO } from '../game/world.js';
import { wait } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { bus } from '../core/events.js';
import { DESTINATIONS } from '../world/directions.js';
import { actVerb, jaLets, jaWant, jaInvite, confirmTime } from './common.js';
import { friendshipMoment, deliveryHandoff, plannedEventFlow, playerIntro, sline, inviteHome, askFriendHouse } from './events.js';
import { memoryRefs, markReferenced, canOffer, offerEvent, completeEvent, openOffer, eligibleEvents, recordPlayerAnswer, playerAnswer } from '../world/friendship.js';
import { styleGesture } from '../world/personality.js';
import { FOODS, petPhrase, listEn } from '../data/content.js';
import { hangoutToReport } from '../world/social.js';
import { askToday } from './school.js';

// ---------------------------------------------------------------- helpers

const yesNo = (yesEn = 'Yes, I do.', noEn = "No, I don't.", yesJa = 'うん、そうだよ。', noJa = 'ううん、ちがうよ。', area = 'possessions') => [
  opt('yes', yesEn, yesJa, { emoji: '🙆', phrases: [yesEn, ...PHRASES.yes], keys: YES_KEYS, area, expr: 'a.yesno', template: 'Yes, I do. / No, I don\'t.' }),
  opt('no', noEn, noJa, { emoji: '🙅', phrases: [noEn, ...PHRASES.no], keys: NO_KEYS, area, expr: 'a.yesno', template: 'Yes, I do. / No, I don\'t.' }),
];

function likeOptions(world, exclude = []) {
  const mine = world.save.player.likes || [];
  const ids = [...new Set([...mine, ...PLAYER_LIKES.filter((x) => !mine.includes(x))])].filter((x) => !exclude.includes(x));
  const shuffled = [ids[0], ...ids.slice(1).sort(() => Math.random() - 0.5)].slice(0, 3);
  return shuffled.map((id) => {
    const it = interest(id);
    return opt(`like:${id}`, `I like ${it.en}.`, `${it.ja}が好きです。`, { emoji: it.emoji, keys: [[it.en.replace(/^the /, '')]], phrases: [`I like ${it.en}`, it.en], area: 'selfintro', expr: 'a.like', template: 'I like ___.', value: id });
  });
}

function playerLike(world, id) {
  const p = world.save.player;
  p.likes = p.likes || [];
  if (!p.likes.includes(id)) p.likes.push(id);
}

function playableActFor(world, npc) {
  for (const [i, id] of npc.likes.entries()) {
    const a = interest(id).activity;
    if (a && world.knows(npc.id, `like:${i}`)) return { act: a, like: id, known: true };
  }
  for (const id of npc.likes) { const a = interest(id).activity; if (a) return { act: a, like: id, known: false }; }
  return { act: 'catch', like: null, known: false };
}

// ---------------------------------------------------------------- entry point

export async function talkToNpc(game, actor) {
  if (actor.special === 'visitor') return visitorStart(game, actor);
  const w = game.world;
  const npc = actor.npc;
  if (actor.special === 'teacher') return talkToTeacher(game, actor);
  if (actor.special === 'staff') return game.sceneId === 'mall' ? game.activities.mallCounter(game.scene.interact.find((it) => it.counter === 'sweets')) : game.activities.cafeCounter(actor);
  if (w.save.flags.fd === 'start' && npc.id === w.save.firstFriend) return firstDayIntro(game, actor);

  const c = await Conversation.start(game, [actor]);
  try {
    if (!w.isKnown(npc.id)) {
      await meetStranger(c, actor);
    } else {
      await greet(c, actor);
    }
    if (c.ended) return;
    // Note whether any flow below asks the player something (news, offers,
    // plans, quizzes); the casual timetable question only fills a quiet chat.
    let flowAsked = false;
    const baseAsk = c.ask;
    c.ask = function (...args) { flowAsked = true; return baseAsk.apply(this, args); };
    // A present someone asked you to bring to this classmate.
    await deliveryHandoff(c, actor);
    const plan = w.planWith(npc.id);
    if (plan && game.locationId === plan.loc) { await planFlow(c, actor, plan); if (c.result) return; }
    const lost = w.daily.lost;
    if (lost && lost.npcId === npc.id && !w.daily.lostDone && game.locationId === 'park' && w.period === lost.period) {
      await lostItemStart(c, actor, lost);
      return;
    }
    if (await birthdayCheck(c, actor)) { /* continue */ }
    // Friendship events: an open offer, or maybe something new (src/dialogue/events.js).
    await friendshipMoment(c, actor);
    actor.approached = false;
    if (c.ended || c.result) return;
    if (w.level(npc.id) >= 2 && !w.daily.quiz[npc.id] && Math.random() < 0.3) await memoryQuiz(c, actor);
    if (w.isKnown(npc.id) && (w.level(npc.id) >= 2 || w.save.flags.fd === 'done')) await maybeIntroduceFriend(c, actor);
    if (c.ended || c.result) return;
    c.ask = baseAsk;
    // "What do you have today?" is a low-priority casual question: once per
    // school day (any classmate), and only in a chat where nothing else came up.
    if (!flowAsked && w.day > 0 && !w.weekend && w.save.flags.fd === 'done' && !w.daily.asked.today) {
      w.daily.asked.today = true;
      await askToday(c, actor);
      if (c.ended || c.result) return;
    }
    await topicLoop(c, actor);
  } finally {
    await c.end();
    if (c.result?.then) await c.result.then();
  }
}

async function visitorStart(game, actor) {
  const event = game.world.daily.visitor;
  if (!event || event.done) return;
  const dest = DESTINATIONS[event.dest];
  const c = await Conversation.start(game, [actor]);
  let help = false;
  try {
    await c.say(actor, line(`Excuse me. Where is ${dest.en}?`, `すみません。${dest.ja}はどこですか？`, { area: 'directions', expr: 'd.where', template: 'Where is ___?' }));
    const r = await c.ask([
      opt('help', 'I can help you! Follow me.', '案内するよ！ついてきて。', { keys: [['help', 'follow']], area: 'directions', expr: 'd.help', template: 'I can help you! Follow me.' }),
      opt('decline', "Sorry, I don't know.", 'ごめんなさい、わかりません。', { keys: [['sorry', 'know']], tone: 'quiet' }),
    ]);
    help = r.id === 'help';
    if (!help) {
      event.done = true;
      game.world.daily.visitorDone = true;
      await c.say(actor, line("That's OK. Thank you!", 'だいじょうぶ。ありがとう！'));
      await c.ask([opt('bye', 'Goodbye!', 'さようなら！', { phrases: PHRASES.bye, keys: [['bye']] })]);
    }
  } finally {
    await c.end();
  }
  if (help) await game.activities.startDirections(actor, event);
  else { game.npcs.removeActor(actor); game.save(); }
}

// ---------------------------------------------------------------- greetings & meeting

async function greet(c, actor) {
  const w = c.world;
  const npc = actor.npc;
  const first = w.markTalked(npc.id);
  if (first) w.xp(npc.id, 1, { key: `chat:${w.day}`, reason: 'chat' });
  const rng = Math.random;
  if (!first) {
    await c.say(actor, pick(rng, [line(`Hi again, ${c.playerName}!`, `また会ったね、${c.playerName}！`), line(`Oh, ${c.playerName}! What's up?`, `あ、${c.playerName}！どうしたの？`)]));
    return;
  }
  await c.say(actor, greeting(npc, c.playerName, { level: w.level(npc.id), period: w.period, weekend: w.weekend, weather: w.weather, rng }), { gesture: styleGesture(npc, 'greet'), expr: 'happy' });
  // Best friends sometimes say something personal (what you told them).
  if (w.level(npc.id) >= 5) await personalLine(c, actor);
  // Shared memory callback. The first-day morning keeps the brief's exact
  // script; every other callback comes from stored memories (rememberMoment).
  const firstDayCallback = w.save.flags.fd === 'slept' && npc.id === w.save.introNpc;
  if (!firstDayCallback) { await rememberMoment(c, actor); return; }
  const mem = w.lastMemoryWith(npc.id, 3);
  if (mem && !w.daily.asked[`mem:${npc.id}`]) {
    w.daily.asked[`mem:${npc.id}`] = true;
    markReferenced(w.save, mem.id, w.day);
    const when = w.day - mem.day === 1 ? 'yesterday' : `on ${DAYS[(mem.day % 7 + 7) % 7].en}`;
    const whenJa = w.day - mem.day === 1 ? 'きのう' : `${DAYS[(mem.day % 7 + 7) % 7].ja}`;
    let l;
    if (mem.type === 'help') l = line(`Thank you for finding my ${mem.detail.item}! You're so kind!`, `${mem.detail.itemJa}を見つけてくれてありがとう！やさしいね！`, { area: 'adjectives', expr: 'adj.kind', template: "You're kind!" });
    else if (mem.act === 'cafe') l = line(`The ${mem.detail.foodEn || 'food'} at the café was delicious ${when}!`, `${whenJa}のカフェ、おいしかったね！`, { area: 'food' });
    else if (mem.act === 'mall') l = line(`Niji Mall was fun ${when}! Let's go again!`, `${whenJa}のにじモール、楽しかったね！また行こう！`, { area: 'verbs' });
    else l = line(`${mem.act === 'soccer' ? 'Soccer' : 'Playing catch'} was fun ${when}! Let's play again!`, `${whenJa}の${mem.act === 'soccer' ? 'サッカー' : 'キャッチボール'}、楽しかったね！またやろう！`, { area: 'verbs' });
    await c.say(actor, l, { expr: 'happy', gesture: 'happy' });
    const r = await c.ask([
      opt('fun', 'Yes! It was fun!', 'うん！楽しかった！', { emoji: '😄', phrases: ['yes it was fun', 'it was fun', 'yes', 'fun'] }),
      opt('again', "Let's play again!", 'またやろう！', { emoji: '🙌', phrases: ["let's play again", 'again', 'play again'] }),
    ]);
    w.xp(npc.id, 1, { key: `remember:${mem.id}`, reason: 'memory' });
    if (r.id === 'again') await c.say(actor, line('Yes! Let\'s!', 'うん、やろう！'), { expr: 'happy' });
    if (w.save.flags.fd === 'slept' && npc.id === w.save.introNpc) {
      w.save.flags.fd = 'done';
      bus.emit('firstday', { stage: 'done' });
    }
  }
}

/**
 * The friend recalls a real stored memory. As a "remember" event (Lv2+, one a
 * day) it becomes a choice: do it again, do something different, or next
 * time — which turns into a plan. Otherwise a light thank-you for yesterday.
 */
async function rememberMoment(c, actor) {
  const w = c.world, npc = actor.npc;
  const k = `mem:${npc.id}`;
  // Let friendshipMoment tell pending news before a recall can start another outing.
  if (w.daily.asked[k] || hangoutToReport(w.save, npc.id, w.day)) return;
  const ref = memoryRefs(w, npc.id, { limit: 1 })[0];
  if (!ref) return;
  const again = ref.again && ACT_INFO[ref.again.act] ? ref.again.act : null;
  const asEvent = w.level(npc.id) >= 2 && canOffer(w.save, w.day, 'remember') && !openOffer(w.save, npc.id)
    && eligibleEvents(w, npc.id, { available: new Set(['remember']) }).eligible.includes('remember');
  if (!asEvent && ref.diff !== 1) return;
  w.daily.asked[k] = true;
  markReferenced(w.save, ref.memoryId, w.day);
  await c.say(actor, line(ref.en, ref.ja, { area: 'verbs' }), { expr: 'happy', gesture: styleGesture(npc, 'happy') });
  if (!asEvent) {
    await c.ask([
      opt('fun', 'Yes! It was fun!', 'うん！楽しかった！', { emoji: '😄', phrases: ['yes it was fun', 'it was fun', 'yes', 'fun'], keys: [['fun', 'yes']] }),
      opt('thanks', 'Thank you, too!', 'こちらこそ、ありがとう！', { emoji: '😊', phrases: ['thank you too', 'thank you', 'thanks'], keys: [['thank']] }),
    ]);
    w.xp(npc.id, 1, { key: `remember:${ref.memoryId}`, reason: 'memory' });
    return;
  }
  const inst = offerEvent(w, { template: 'remember', npcId: npc.id, data: { memoryId: ref.memoryId } });
  const v = again ? actVerb(again, null) : null;
  await c.say(actor, v
    ? line(`Do you want to ${v.en} again?`, `また${jaInvite(v.ja)}`, { area: 'wantto', expr: 'q.wantto', template: 'Do you want to ___?' })
    : line('Do you want to do something together again?', 'また何かいっしょにしない？', { area: 'wantto', expr: 'q.wantto' }));
  const opts = [];
  if (v) opts.push(opt('again', `Yes! Let's ${v.en} again!`, `うん！また${jaLets(v.ja)}！`, { emoji: v.emoji, phrases: [`lets ${v.en} again`, 'again', 'yes'], keys: YES_KEYS, area: 'wantto', expr: 'a.lets', template: "Let's ___!" }));
  opts.push(opt('different', "Let's do something different!", '何かちがうことをしよう！', { emoji: '💡', phrases: ["let's do something different", 'something different', 'different'], keys: [['different', 'something']], area: 'wantto' }));
  opts.push(opt('later', 'Maybe next time.', 'また今度ね。', { emoji: '🙂', phrases: ['maybe next time', 'next time', 'no'], keys: NO_KEYS, tone: 'quiet' }));
  const r = await c.ask(opts);
  completeEvent(w, inst.id, {});
  if (r.id === 'later') { await c.say(actor, sline(c, npc, 'declineOk'), { expr: 'happy' }); return; }
  if (r.id === 'again') { await startOrPlan(c, actor, again, null); return; }
  await c.say(actor, line('OK! What do you want to do?', 'いいよ！何をしたい？', { area: 'wantto', expr: 'q.wantdo', template: 'What do you want to do?' }));
  let choices = ['soccer', 'catch', 'cafe', 'mall'].filter((a) => a !== again && !(ACT_INFO[a].outdoor && w.weather === 'rainy'));
  if (!choices.length) choices = ['cafe'];
  const pick = await c.ask(choices.map((a) => {
    const vv = actVerb(a, null);
    return opt(a, `I want to ${vv.en}.`, `${jaWant(vv.ja)}。`, { emoji: vv.emoji, phrases: [`i want to ${vv.en}`, vv.en], keys: [[['cafe', 'mall'].includes(a) ? a : vv.en.split(' ').pop()]], area: 'wantto', expr: 'a.wantto', template: 'I want to ___.' });
  }));
  await c.say(actor, sline(c, npc, 'inviteYes'), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await startOrPlan(c, actor, pick.id, null);
}

/** Best friends: a personal line built from what the player said about themselves. */
async function personalLine(c, actor) {
  const w = c.world, npc = actor.npc;
  const k = `personal:${npc.id}`;
  if (w.daily.asked[k] || Math.random() > 0.5) return;
  w.daily.asked[k] = true;
  const sat = interest(playerAnswer(w.save, 'week:5') || '');
  const likes = (w.save.player.likes || []).map((id) => interest(id)).filter(Boolean);
  let l = null;
  if (sat && w.dow === 5) l = line(`It's Saturday! You ${sat.verb} on Saturdays, right?`, `今日は土曜日！いつも${sat.ja}をするんだよね？`, { area: 'weekly' });
  else if (likes.length) {
    const it = likes[Math.floor(Math.random() * likes.length)];
    l = npc.likes.includes(it.id)
      ? line(`We both like ${it.en}! 😊`, `わたしたち、二人とも${it.ja}が好きだね！`, { area: 'selfintro' })
      : line(`You like ${it.en}, right? I want to try it, too!`, `${it.ja}が好きなんだよね？わたしもやってみたいな！`, { area: 'selfintro' });
  }
  if (l) await c.say(actor, l, { expr: 'happy' });
}

// Questions friends ask the player (answers are kept in save.player.answers).
const NPC_QUESTIONS = ['week:5', 'food', 'week:6', 'pet'];

async function npcAsks(c, actor) {
  const w = c.world, npc = actor.npc;
  const r = w.rel(npc.id);
  if (!r.asked) r.asked = {};
  const q = NPC_QUESTIONS.find((k) => r.asked[k] === undefined);
  if (!q) return;
  r.asked[q] = w.day;
  const name = c.playerName;
  if (q.startsWith('week:')) {
    const d = Number(q.slice(5));
    const D = DAYS[d];
    await c.say(actor, line(`${name}, what do you do on ${D.plural}?`, `${name}は${D.ja}に何をするの？`, { expr: 'q.weekly', area: 'weekly', template: 'What do you do on ___s?' }));
    const mine = (w.save.player.likes || []).filter((id) => interest(id));
    const ids = [...new Set([...mine, ...PLAYER_LIKES.filter((x) => !mine.includes(x)).sort(() => Math.random() - 0.5)])].slice(0, 3);
    const a = await c.ask(ids.map((id) => {
      const it = interest(id);
      return opt(id, `I ${it.verb} on ${D.plural}.`, `${D.ja}は${it.jaDo}。`, { emoji: it.emoji, keys: [[it.en.replace(/^the /, '').split(' ').pop()]], phrases: [`i ${it.verb} on ${D.plural}`, it.verb], area: 'weekly', expr: 'a.weekly', template: 'I ___ on ___s.' });
    }));
    recordPlayerAnswer(w.save, q, a.id, w.day);
    const theirs = npc.schedule[d][w.primaryPeriodFor(npc, d)];
    if (theirs.act === a.id) {
      await c.say(actor, line(`Me too! I ${interest(a.id).verb} on ${D.plural}, too!`, `わたしも！${D.ja}は${interest(a.id).jaDo}！`, { area: 'weekly' }), { gesture: 'happy', expr: 'happy' });
      w.learn(npc.id, q);
    } else {
      await c.say(actor, line('That sounds fun!', '楽しそう！'), { expr: 'happy' });
    }
    return;
  }
  if (q === 'food') {
    await c.say(actor, line(`What food do you like, ${name}?`, `${name}は何の食べ物が好き？`, { expr: 'q.food', area: 'food', template: 'What food do you like?' }));
    const foods = FOODS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const a = await c.ask(foods.map((f) => opt(f.id, `I like ${f.general}.`, `${f.ja}が好き。`, { emoji: f.emoji, keys: [[f.en.split(' ').pop()]], phrases: [`i like ${f.general}`, f.en], area: 'food', expr: 'a.like', template: 'I like ___.' })));
    recordPlayerAnswer(w.save, q, a.id, w.day);
    if (npc.food === a.id) { await c.say(actor, line(`Me too! I like ${food(a.id).general}, too!`, `わたしも${food(a.id).ja}が好き！`, { area: 'food' }), { gesture: 'happy', expr: 'happy' }); w.learn(npc.id, 'food'); }
    else await c.say(actor, line('Yummy! 😋', 'おいしそう！'), { expr: 'happy' });
    return;
  }
  await c.say(actor, line(`Do you have a pet, ${name}?`, `${name}はペットをかってる？`, { expr: 'q.pet', area: 'possessions', template: 'Do you have a ___?' }));
  const pets = PETS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
  const a = await c.ask([
    ...pets.map((p) => opt(p.id, `Yes, I have ${p.a}.`, `うん、${p.ja}をかってるよ。`, { emoji: p.emoji, keys: [[p.plural, p.id]], phrases: [`yes i have ${p.a}`, p.id], area: 'possessions', expr: 'a.have', template: 'I have ___.' })),
    opt('none', "No, I don't.", 'ううん、かっていないよ。', { emoji: '🙅', phrases: ["no i don't", 'no'], keys: NO_KEYS, area: 'possessions', expr: 'a.no' }),
  ]);
  recordPlayerAnswer(w.save, q, a.id, w.day);
  if (npc.pet) { await c.say(actor, line(`I have ${petPhrase(npc.pet)}! ${PETS.find((p) => p.id === npc.pet.type)?.emoji || ''}`, `わたしは${PETS.find((p) => p.id === npc.pet.type)?.ja || ''}をかってるよ！`, { area: 'possessions' }), { expr: 'happy' }); w.learn(npc.id, 'pet'); }
  else await c.say(actor, line('I want a pet, too!', 'わたしもペットがほしいな！', { area: 'wantto' }), { expr: 'happy' });
}

async function meetStranger(c, actor) {
  const w = c.world;
  const npc = actor.npc;
  await c.say(actor, pick(Math.random, [
    line("Hi! Are you new here? What's your name?", 'こんにちは！新しい子？名前は何？', { expr: 'q.name', area: 'selfintro' }),
    line("Hello! I don't know you. What's your name?", 'こんにちは！はじめて会うね。名前は何ていうの？', { expr: 'q.name', area: 'selfintro' }),
  ]), { gesture: 'wave' });
  await c.ask([
    opt('name', `My name is ${c.playerName}.`, `わたしの名前は${c.playerName}です。`, { emoji: '🙋', phrases: [`my name is ${c.playerName}`, 'my name is', `i am ${c.playerName}`, c.playerName], area: 'selfintro', expr: 'a.myname', template: 'My name is ___.' }),
    opt('im', `I'm ${c.playerName}. Nice to meet you!`, `${c.playerName}です。はじめまして！`, { emoji: '😊', phrases: [`i am ${c.playerName}`, 'nice to meet you'], area: 'selfintro', expr: 'a.myname', template: "I'm ___." }),
  ]);
  await c.say(actor, line(`Nice to meet you, ${c.playerName}! My name is ${npc.name}.`, `よろしく、${c.playerName}！わたしは${npc.name}。`, { expr: 'a.myname', area: 'selfintro' }), { expr: 'happy' });
  await c.ask([opt('nice', 'Nice to meet you, too!', 'こちらこそ、よろしく！', { emoji: '🤝', phrases: PHRASES.niceToMeet, area: 'selfintro', expr: 'a.nice', template: 'Nice to meet you, too!' })]);
  w.meet(npc.id);
  w.markTalked(npc.id);
  await askAboutPlayerLike(c, actor);
}

async function askAboutPlayerLike(c, actor) {
  const w = c.world;
  const npc = actor.npc;
  await c.say(actor, line(`What do you like, ${c.playerName}?`, `${c.playerName}は何が好き？`, { expr: 'q.likes', area: 'selfintro', template: 'What do you like?' }));
  const o = await c.ask(likeOptions(w));
  playerLike(w, o.value);
  const shared = npc.likes.indexOf(o.value);
  if (shared >= 0) {
    await c.say(actor, line(`Me too! I like ${interest(o.value).en}, too!`, `わたしも！${interest(o.value).ja}が好き！`, { expr: 'a.metoo', area: 'selfintro' }), { gesture: 'happy', expr: 'happy' });
    w.learn(npc.id, `like:${shared}`);
    w.xp(npc.id, 2, { key: `shared:${o.value}`, reason: 'shared' });
  } else {
    await c.say(actor, line(`Cool! ${interest(o.value).en.charAt(0).toUpperCase() + interest(o.value).en.slice(1)} is fun!`, `いいね！${interest(o.value).ja}って楽しいよね！`), { expr: 'happy' });
  }
}

// ---------------------------------------------------------------- first day

async function firstDayIntro(game, friendActor) {
  const w = game.world;
  const introActor = game.npcs.actorFor(w.save.introNpc);
  const c = await Conversation.start(game, [friendActor, introActor].filter(Boolean));
  try {
    const F = friendActor.npc;
    w.markTalked(F.id);
    await c.say(friendActor, line(`Good morning, ${c.playerName}! Welcome to our class!`, `おはよう、${c.playerName}！ぼくたちのクラスへようこそ！`), { gesture: 'wave', expr: 'happy' });
    if (!introActor) { w.save.flags.fd = 'done'; await topicLoop(c, friendActor); return; }
    const Y = introActor.npc;
    const L = introLines(Y);
    await c.say(friendActor, line(`${L[0].en} ${L[1].en}`, `${L[0].ja}${L[1].ja}`, { expr: 'i.thisis', area: 'intro', template: 'This is ___. He/She is my friend.' }), { gesture: 'point' });
    await c.say(friendActor, line(`${L[2].en} ${L[3].en}`, `${L[2].ja}${L[3].ja}`, { expr: 'i.likes', area: 'intro', template: 'He/She likes ___. He/She can ___.' }));
    w.discover(F.id, Y.id);
    await c.say(introActor, line('Nice to meet you!', 'はじめまして！', { expr: 'a.nice', area: 'selfintro' }), { gesture: 'wave', expr: 'happy' });
    await c.ask([
      opt('nice', 'Nice to meet you, too!', 'こちらこそ、はじめまして！', { emoji: '🤝', phrases: PHRASES.niceToMeet, area: 'selfintro', expr: 'a.nice', template: 'Nice to meet you, too!' }),
      opt('name', `Hi! My name is ${c.playerName}.`, `こんにちは！${c.playerName}です。`, { emoji: '🙋', phrases: ['my name is', `i am ${c.playerName}`, 'hi', 'hello'], area: 'selfintro', expr: 'a.myname', template: 'My name is ___.' }),
    ]);
    w.meet(Y.id, F.id);
    w.markTalked(Y.id);
    w.learn(Y.id, 'like:0');
    w.learn(Y.id, 'can:0');
    w.xp(F.id, 2, { key: `introduced:${Y.id}`, reason: 'intro' });
    c.main = introActor;
    await askAboutPlayerLike(c, introActor);
    w.save.flags.fd = 'introduced';
    bus.emit('firstday', { stage: 'introduced' });
    await c.say(friendActor, line(`${Y.name}, tell ${c.playerName} about your weekend!`, `${Y.name}、週末のこと話してあげなよ！`));
    await topicLoop(c, introActor, { guide: ['week:5', 'invite'] });
    if (w.save.flags.fd === 'planned') await c.say(friendActor, line('Have fun after school! See you!', '放課後、楽しんでね！またね！'), { gesture: 'wave', expr: 'happy' });
  } finally {
    await c.end();
    if (c.result?.then) await c.result.then();
  }
}

// ---------------------------------------------------------------- topics

function topicList(c, actor, guide) {
  const w = c.world;
  const npc = actor.npc;
  const lvl = w.level(npc.id);
  const free = w.free;
  const school = w.schoolTime;
  const outdoors = c.game.scene.outdoor;
  const T = [];
  const add = (t) => T.push(t);
  const unknownLike = [0, 1, 2].find((i) => !w.knows(npc.id, `like:${i}`));
  add({ id: 'likes', area: 'selfintro', base: unknownLike !== undefined ? 5 : 0.5, card: opt('t-likes', 'What do you like?', '何が好き？', { emoji: '💗', phrases: ['what do you like', 'what like'], expr: 'q.likes', area: 'selfintro', template: 'What do you like?' }), run: topicLikes });
  const unknownCan = [0, 1].find((i) => !w.knows(npc.id, `can:${i}`));
  add({ id: 'can', area: 'selfintro', base: unknownCan !== undefined ? 4.5 : 0.4, card: opt('t-can', 'What can you do?', '何ができる？', { emoji: '💪', phrases: ['what can you do', 'what can you'], expr: 'q.can', area: 'selfintro', template: 'What can you do?' }), run: topicCan });
  const dayOrder = [5, 6, 0, 1, 2, 3, 4];
  const qDay = dayOrder.find((d) => !w.knows(npc.id, `week:${d}`) && !c.done.has(`week:${d}`));
  if (qDay !== undefined) {
    const D = DAYS[qDay];
    add({ id: `week:${qDay}`, area: 'weekly', base: qDay >= 5 ? 4.6 : 2.6, card: opt(`t-week-${qDay}`, `What do you do on ${D.plural}?`, `${D.ja}は何をするの？`, { emoji: '📅', keys: [[D.en.toLowerCase(), D.plural.toLowerCase()]], phrases: [`what do you do on ${D.plural}`], expr: 'q.weekly', area: 'weekly', template: 'What do you do on ___s?' }), run: (cc, a) => topicWeek(cc, a, qDay) });
  }
  if (!w.knows(npc.id, 'subject')) add({ id: 'subject', area: 'subjects', base: 3.2, card: opt('t-subject', 'What subject do you like?', '何の教科が好き？', { emoji: '📚', phrases: ['what subject do you like', 'subject'], keys: [['subject']], expr: 'q.subject', area: 'subjects', template: 'What subject do you like?' }), run: topicSubject });
  if (!w.knows(npc.id, 'food')) add({ id: 'food', area: 'food', base: 2.4, card: opt('t-food', 'What food do you like?', '何の食べ物が好き？', { emoji: '🍙', phrases: ['what food do you like'], keys: [['food']], expr: 'q.food', area: 'food', template: 'What food do you like?' }), run: topicFood });
  if (lvl >= 2) {
    if (!w.knows(npc.id, 'birthday')) add({ id: 'birthday', area: 'selfintro', base: 3.2, card: opt('t-bday', 'When is your birthday?', '誕生日はいつ？', { emoji: '🎂', phrases: ['when is your birthday'], keys: [['birthday']], expr: 'q.birthday', area: 'selfintro', template: 'When is your birthday?' }), run: topicBirthday });
    if (!w.knows(npc.id, 'pet')) add({ id: 'pet', area: 'possessions', base: 3, card: opt('t-pet', 'Do you have a pet?', 'ペットをかってる？', { emoji: '🐾', phrases: ['do you have a pet'], keys: [['pet']], expr: 'q.pet', area: 'possessions', template: 'Do you have a ___?' }), run: topicPet });
    if (!w.knows(npc.id, 'wake')) add({ id: 'wake', area: 'time', base: 2.6, card: opt('t-wake', 'What time do you wake up?', '何時に起きる？', { emoji: '⏰', phrases: ['what time do you wake up'], keys: [['wake']], expr: 'q.wake', area: 'time', template: 'What time do you wake up?' }), run: topicWake });
    if (!w.knows(npc.id, 'games') && npc.games >= 3) add({ id: 'games', area: 'possessions', base: 2.2, card: opt('t-games', 'How many games do you have?', 'ゲームをいくつ持ってる？', { emoji: '🎮', phrases: ['how many games do you have'], keys: [['games', 'many']], expr: 'q.howmany', area: 'possessions', template: 'How many ___ do you have?' }), run: topicGames });
    add({ id: 'friends', area: 'intro', base: 2.2, card: opt('t-friends', 'Who is your friend?', 'だれと仲よし？', { emoji: '🧑‍🤝‍🧑', phrases: ['who is your friend'], keys: [['friend']], expr: 'q.friend', area: 'intro', template: 'Who is your friend?' }), run: topicFriends });
  }
  if (lvl >= 3 && !w.knows(npc.id, 'dream')) add({ id: 'dream', area: 'places', base: 3, card: opt('t-dream', 'Where do you want to go?', 'どこに行きたい？', { emoji: '🗾', phrases: ['where do you want to go'], keys: [['where']], expr: 'q.wantgo', area: 'wantto', template: 'Where do you want to go?' }), run: topicDream });
  add({ id: 'weather', area: 'weather', base: outdoors ? 1.6 : 0.8, card: opt('t-weather', "How's the weather?", '天気はどう？', { emoji: '⛅', phrases: ['how is the weather', 'weather'], keys: [['weather']], expr: 'q.weather', area: 'weather', template: "How's the weather?" }), run: topicWeather });
  add({ id: 'time', area: 'time', base: c.game.sceneId === 'classroom' ? 1.4 : 0.6, card: opt('t-time', 'What time is it?', '今何時？', { emoji: '🕗', phrases: ['what time is it'], keys: [['time']], expr: 'q.time', area: 'time', template: 'What time is it?' }), run: topicTime });
  // Invitations: want to + verb
  const planToday = w.save.plans.some((p) => p.status === 'pending' && p.npcIds.includes(npc.id) && p.day === w.day);
  if (!planToday && (free || school)) {
    const pa = playableActFor(w, npc);
    const v = actVerb(pa.act, pa.like);
    add({ id: 'invite', area: 'wantto', base: pa.known ? 4.2 : 2.2, card: opt('t-invite', `Do you want to ${v.en}?`, jaInvite(v.ja), { emoji: v.emoji, phrases: [`do you want to ${v.en}`, `want to ${v.en}`, `lets ${v.en}`], keys: [[pa.act === 'cafe' ? 'cafe' : v.en.split(' ').slice(-1)[0]]], expr: 'q.wantto', area: 'wantto', template: 'Do you want to ___?' }), run: (cc, a) => topicInvite(cc, a, pa.act, pa.like) });
    if (lvl >= 2) add({ id: 'mall', area: 'wantto', base: 2.2, card: opt('t-mall', 'Do you want to go to Niji Mall?', 'にじモールに行かない？', { emoji: '🛍️', phrases: ['do you want to go to niji mall', 'go to the mall', 'mall'], keys: [['mall']], expr: 'q.wantto', area: 'wantto', template: 'Do you want to ___?' }), run: (cc, a) => topicInvite(cc, a, 'mall', null) });
    if (free) add({ id: 'wantdo', area: 'wantto', base: 2.6, card: opt('t-wantdo', 'What do you want to do?', '何をしたい？', { emoji: '💭', phrases: ['what do you want to do'], keys: [['want']], expr: 'q.wantdo', area: 'wantto', template: 'What do you want to do?' }), run: topicWantDo });
  }
  // Close friends can be invited home (home_visit).
  if (lvl >= 4 && !c.done.has('visit') && !openOffer(w.save, npc.id) && canOffer(w.save, w.day, 'home_visit')
    && eligibleEvents(w, npc.id, { available: new Set(['home_visit']) }).eligible.includes('home_visit')) {
    add({ id: 'visit', area: 'wantto', base: 2.8, card: opt('t-visit', 'Do you want to come to my house?', 'うちに遊びに来ない？', { emoji: '🏠', phrases: ['do you want to come to my house', 'come to my house'], keys: [['house', 'home']], expr: 'q.comehouse', area: 'wantto', template: 'Do you want to come to my house?' }), run: (cc, a) => inviteHome(cc, a) });
  }
  if (lvl >= 4 && !c.done.has('friendhouse') && !openOffer(w.save, npc.id) && canOffer(w.save, w.day, 'friend_house') && eligibleEvents(w, npc.id, { available: new Set(['friend_house']) }).eligible.includes('friend_house')) {
    add({ id: 'friendhouse', area: 'wantto', base: 2.8, card: opt('t-friendhouse', 'Can I come to your house?', '家に遊びに行ってもいい？', { emoji: '🏡', phrases: ['can i come to your house', 'your house'], keys: [['house', 'home']], expr: 'q.cancome', area: 'wantto', template: 'Can I come to your house?' }), run: askFriendHouse });
  }
  // Introduce someone nearby that this NPC doesn't know.
  const intro = c.game.npcs.nearby(actor, 9).find((o) => w.isKnown(o.npc.id) && !o.busy && w.link(npc.id, o.npc.id) === 0 && [0, 1, 2].some((i) => w.knows(o.npc.id, `like:${i}`)));
  if (intro) add({ id: 'introduce', area: 'intro', base: 6, card: opt('t-intro', `This is ${intro.npc.name}.`, `こちらは${intro.npc.name}です。`, { emoji: '🤝', phrases: [`this is ${intro.npc.name}`], keys: [[intro.npc.name.toLowerCase()]], expr: 'i.thisis', area: 'intro', template: 'This is ___.' }), run: (cc, a) => topicIntroduce(cc, a, intro) });

  for (const t of T) {
    t.score = t.base + w.need(t.area) * 1.1 + Math.random() * 1.2;
    if (c.done.has(t.id)) t.score -= 30;
    if (guide.includes(t.id) || (t.id.startsWith('week:5') && guide.includes('week:5'))) { t.score += 50; t.card = { ...t.card, highlight: true }; }
  }
  return T.sort((a, b) => b.score - a.score);
}

async function topicLoop(c, actor, { guide = [] } = {}) {
  const w = c.world;
  c.guide = guide;
  for (let round = 0; round < 5 && !c.ended && !c.result; round++) {
    // Friends sometimes ask about you, too (never during the guided first day).
    if (round === 1 && !guide.length && !c.npcAsked && w.level(actor.npc.id) >= 2 && Math.random() < 0.45) {
      c.npcAsked = true;
      await npcAsks(c, actor);
    }
    const topics = topicList(c, actor, guide).filter((t) => t.score > -10).slice(0, 3);
    const bye = opt('bye', 'Bye! See you!', 'バイバイ！またね！', { emoji: '👋', phrases: PHRASES.bye, keys: [['bye', 'see you', 'goodbye']], tone: 'quiet', area: 'selfintro', expr: 'a.bye', template: 'See you!' });
    const choice = await c.ask([...topics.map((t) => t.card), bye], { columns: 2 });
    if (choice.id === 'bye') {
      await c.say(actor, pick(Math.random, [line('Bye! See you!', 'バイバイ！またね！'), line(`See you later, ${c.playerName}!`, `またね、${c.playerName}！`), line('Bye-bye!', 'バイバイ！')]), { gesture: 'wave', expr: 'happy' });
      return;
    }
    const topic = topics.find((t) => t.card.id === choice.id);
    c.done.add(topic.id);
    await topic.run(c, actor);
    if (guide.length && guide.every((g) => c.done.has(g) || (g === 'invite' && c.result))) guide = [];
  }
  if (!c.ended && !c.result) await c.say(actor, line("Oh! I have to go now. Let's talk again later!", 'あ、もう行かなきゃ。また話そうね！'), { gesture: 'wave' });
}

async function topicLikes(c, actor) {
  const w = c.world, npc = actor.npc;
  const i = [0, 1, 2].find((k) => !w.knows(npc.id, `like:${k}`));
  if (i === undefined) {
    await c.say(actor, line(`You know! I like ${interest(npc.likes[0]).en} and ${interest(npc.likes[1]).en}! 😄`, `知ってるでしょ！${interest(npc.likes[0]).ja}と${interest(npc.likes[1]).ja}が好き！`, { expr: 'a.like', area: 'selfintro' }), { expr: 'happy' });
    w.xp(npc.id, 1, { key: `remember-likes:${w.day}`, reason: 'remember' });
    return;
  }
  const id = npc.likes[i];
  await c.say(actor, likeLine(npc, id, true), { expr: 'happy' });
  w.learn(npc.id, `like:${i}`);
  if ((w.save.player.likes || []).includes(id)) {
    const r = await c.ask([opt('metoo', 'Me too!', 'わたしも！', { emoji: '🙌', phrases: ['me too', 'i like it too', 'same'] }), opt('cool', 'Cool!', 'いいね！', { emoji: '😎', phrases: ['cool', 'nice', 'great'] })]);
    if (r.id === 'metoo') { await c.say(actor, line('Really? Yay!', 'ほんと？やった！'), { gesture: 'happy', expr: 'happy' }); w.xp(npc.id, 2, { key: `shared:${id}`, reason: 'shared' }); }
  } else {
    await c.say(actor, line('Do you like it, too?', '好き？', { expr: 'q.doyoulike', area: 'selfintro' }));
    const r = await c.ask(yesNo('Yes, I do.', "No, I don't.", 'うん、好き！', 'ううん、あまり。', 'selfintro'));
    if (r.id === 'yes') { playerLike(w, id); await c.say(actor, line("Great! Let's do it together sometime!", 'いいね！今度いっしょにやろう！'), { expr: 'happy' }); w.xp(npc.id, 1, { key: `shared:${id}`, reason: 'shared' }); }
    else await c.say(actor, line("That's OK! What do you like?", 'だいじょうぶ！何が好き？'));
  }
}

async function topicCan(c, actor) {
  const w = c.world, npc = actor.npc;
  const i = [0, 1].find((k) => !w.knows(npc.id, `can:${k}`)) ?? 0;
  const a = ability(npc.cans[i]);
  await c.say(actor, canLine(npc, npc.cans[i]), { expr: 'happy', gesture: 'cheer' });
  w.learn(npc.id, `can:${i}`);
  await c.say(actor, line(`Can you ${a.en}?`, `${a.ja.replace('ます', 'る？').replace('です', '？')}`.replace(/れる？$/, 'れる？'), { expr: 'q.can', area: 'selfintro', template: 'Can you ___?' }));
  const r = await c.ask(yesNo('Yes, I can!', "No, I can't.", 'うん、できるよ！', 'ううん、できない。', 'selfintro'));
  if (r.id === 'yes') await c.say(actor, line('Wow! Cool!', 'すごい！かっこいい！', { area: 'adjectives' }), { gesture: 'clap', expr: 'happy' });
  else await c.say(actor, line("That's OK! Let's practice together!", 'だいじょうぶ！いっしょに練習しよう！'), { expr: 'happy' });
}

async function topicWeek(c, actor, d) {
  const w = c.world, npc = actor.npc;
  const per = w.primaryPeriodFor(npc, d);
  const slot = npc.schedule[d][per];
  const wl = weekLine(npc, d, slot, w);
  await c.say(actor, wl, { expr: 'happy' });
  w.learn(npc.id, `week:${d}`);
  if (wl.friend) {
    w.discover(npc.id, wl.friend.id);
    if (!w.isKnown(wl.friend.id)) {
      await c.say(actor, line(`${wl.friend.name} is my friend. ${P(wl.friend).S} is ${adjective(wl.friend.adjectives[0]).en}!`, `${wl.friend.name}は友達なんだ。${adjective(wl.friend.adjectives[0]).ja}んだよ！`, { expr: 'i.adj', area: 'adjectives', template: 'He/She is (kind/funny/…).' }));
      w.save.heard = [...new Set([...(w.save.heard || []), wl.friend.id])];
    }
  }
  const it = interest(slot.act);
  // On the guided first day the player's own invitation is the next step.
  if (it?.activity && !(c.guide || []).includes('invite')) {
    await c.say(actor, line(`Do you want to come, too?`, 'いっしょに来る？', { expr: 'q.wantcome', area: 'wantto', template: 'Do you want to come?' }));
    const r = await c.ask([
      opt('yes', 'Yes! I want to come!', 'うん！行きたい！', { emoji: '🙌', phrases: ['yes i want to come', 'i want to', 'yes', 'sure'], keys: YES_KEYS, area: 'wantto', expr: 'a.wantto', template: 'I want to ___.' }),
      opt('no', 'Maybe next time!', 'また今度ね！', { emoji: '🙂', phrases: ['maybe next time', 'next time', 'no', 'sorry'], keys: NO_KEYS }),
    ]);
    if (r.id === 'yes') {
      const day = nextDayIndex(w.day, d);
      const plan = w.addPlan({ npcIds: [npc.id], day, period: per, loc: it.activity === 'cafe' ? 'cafe' : 'park', act: it.activity, source: 'talk' });
      await c.say(actor, line(`Yay! See you on ${DAYS[d].en}!`, `やった！${DAYS[d].ja}に会おうね！`), { gesture: 'happy', expr: 'happy' });
      c.game.hud.planToast(plan);
    }
  }
}

function nextDayIndex(today, dowTarget) {
  const cur = ((today % 7) + 7) % 7;
  let add = (dowTarget - cur + 7) % 7;
  if (add === 0) add = 7;
  return today + add;
}

async function topicSubject(c, actor) {
  const w = c.world, npc = actor.npc;
  const [a, b] = subjectLine(npc);
  await c.say(actor, a, { expr: 'happy' });
  await c.say(actor, b);
  w.learn(npc.id, 'subject');
  await c.say(actor, line('What subject do you like?', 'あなたは何の教科が好き？', { expr: 'q.subject', area: 'subjects' }));
  const pool = [npc.subject, ...SUBJECTS.map((s) => s.id).filter((s) => s !== npc.subject).sort(() => Math.random() - 0.5)].slice(0, 4).sort(() => Math.random() - 0.5);
  if (w.save.player.subject && !pool.includes(w.save.player.subject)) pool[0] = w.save.player.subject;
  const r = await c.ask(pool.map((id) => { const s = subject(id); return opt(id, `I like ${s.en}.`, `${s.ja}が好きです。`, { emoji: s.emoji, keys: [[s.en.toLowerCase().replace('.', '')]], area: 'subjects', expr: 'a.subject', template: 'I like (subject).' }); }));
  w.save.player.subject = r.id;
  if (r.id === npc.subject) { await c.say(actor, line('Me too! High five!', 'わたしも！ハイタッチ！'), { gesture: 'happy', expr: 'happy' }); w.xp(npc.id, 2, { key: 'shared:subject', reason: 'shared' }); }
  else await c.say(actor, line(`${subject(r.id).en.charAt(0).toUpperCase() + subject(r.id).en.slice(1)} is fun, too!`, `${subject(r.id).ja}も楽しいよね！`));
}

async function topicFood(c, actor) {
  const w = c.world, npc = actor.npc;
  await c.say(actor, foodLine(npc), { expr: 'happy' });
  w.learn(npc.id, 'food');
  await c.say(actor, line('The café has it! Yummy!', 'カフェにあるよ！おいしいよ！'));
}

async function topicBirthday(c, actor) {
  const w = c.world, npc = actor.npc;
  await c.say(actor, birthdayLine(npc), { expr: 'happy' });
  w.learn(npc.id, 'birthday');
  await c.say(actor, line('When is your birthday?', 'あなたの誕生日はいつ？', { expr: 'q.birthday', area: 'selfintro' }));
  const b = w.save.player.birthday;
  const r = await c.ask([
    opt('mine', `My birthday is ${dateText(b.m, b.d)}.`, `わたしの誕生日は${dateJa(b.m, b.d)}です。`, { emoji: '🎂', phrases: [`my birthday is ${dateText(b.m, b.d)}`, dateText(b.m, b.d)], area: 'selfintro', expr: 'a.birthday', template: 'My birthday is ___.' }),
    opt('secret', "It's a secret! 🤫", 'ひみつ！', { emoji: '🤫', phrases: ['it is a secret', 'secret'] }),
  ]);
  if (r.id === 'mine') await c.say(actor, line(`${dateText(b.m, b.d)}! I'll remember!`, `${dateJa(b.m, b.d)}だね！覚えておくね！`), { expr: 'happy' });
  else await c.say(actor, line('Haha, OK!', 'あはは、オッケー！'), { expr: 'happy' });
}

async function topicPet(c, actor) {
  const w = c.world, npc = actor.npc;
  for (const l of petLines(npc)) await c.say(actor, l, { expr: 'happy' });
  w.learn(npc.id, 'pet');
  await c.say(actor, line('Do you have a pet?', 'あなたはペットをかってる？', { expr: 'q.pet', area: 'possessions' }));
  const r = await c.ask(yesNo('Yes, I do.', "No, I don't.", 'うん、かってるよ。', 'ううん、かっていない。'));
  if (r.id === 'yes') {
    const r2 = await c.ask(PETS.slice(0, 4).map((p) => opt(p.id, `I have ${p.a}.`, `${p.ja}をかっています。`, { emoji: p.emoji, keys: [[p.id]], area: 'possessions', expr: 'a.have', template: 'I have ___.' })));
    w.save.player.pet = r2.id;
    await c.say(actor, line(`Cute! I want to see your ${r2.id}!`, `かわいい！見てみたいな！`, { area: 'wantto' }), { expr: 'happy' });
  } else {
    w.save.player.pet = null;
    await c.say(actor, line('Animals are cute!', '動物ってかわいいよね！'));
  }
}

async function topicWake(c, actor) {
  const w = c.world, npc = actor.npc;
  await c.say(actor, wakeLine(npc));
  w.learn(npc.id, 'wake');
  await c.say(actor, line('What time do you wake up?', 'あなたは何時に起きる？', { expr: 'q.wake', area: 'time' }));
  const times = [[6, 0], [6, 30], [7, 0], [7, 30]];
  const r = await c.ask(times.map(([h, m]) => opt(`${h}:${m}`, `I wake up at ${timeWords(h, m)}.`, `${timeJa(h, m)}に起きます。`, { emoji: '⏰', keys: [[timeWords(h, m).split(' ')[0]], [m === 0 ? 'oclock' : timeWords(h, m).split(' ')[1]]], area: 'time', expr: 'a.wake', template: 'I wake up at ___.' })));
  w.save.player.wake = r.id;
  await c.say(actor, line(npc.wake.h * 60 + npc.wake.m < Number(r.id.split(':')[0]) * 60 + Number(r.id.split(':')[1]) ? "I wake up earlier! I'm an early bird!" : 'Wow, you wake up early!', npc.wake.h * 60 + npc.wake.m < Number(r.id.split(':')[0]) * 60 + Number(r.id.split(':')[1]) ? 'わたしのほうが早起きだね！' : 'わあ、早起きだね！'), { expr: 'happy' });
}

async function topicGames(c, actor) {
  const w = c.world, npc = actor.npc;
  await c.say(actor, gamesLine(npc), { expr: 'happy' });
  w.learn(npc.id, 'games');
}

async function topicFriends(c, actor) {
  const w = c.world, npc = actor.npc;
  const friends = w.friendsOf(npc.id).sort((a, b) => w.link(npc.id, b.id) - w.link(npc.id, a.id));
  const f = friends.find((x) => !w.npcLinkKnown(npc.id, x.id)) || friends[0];
  if (!f) { await c.say(actor, line('You are my friend!', 'あなたが友達だよ！'), { expr: 'happy' }); return; }
  const adj = adjective(f.adjectives[0]);
  await c.say(actor, line(`${f.name} is my friend. ${P(f).S} is ${adj.en}!`, `${f.name}は友達。${adj.ja}んだよ！`, { expr: 'i.adj', area: 'adjectives', template: 'He/She is (kind/funny/…).' }), { expr: 'happy' });
  w.discover(npc.id, f.id);
  if (w.isKnown(f.id)) w.learn(f.id, 'adj');
  else w.save.heard = [...new Set([...(w.save.heard || []), f.id])];
  const here = c.game.npcs.actorFor(f.id);
  if (here && !w.isKnown(f.id) && !here.busy) {
    await c.say(actor, line(`Oh, ${f.name} is here! Do you want to meet ${P(f).o}?`, `あ、${f.name}がいる！会ってみる？`, { area: 'wantto' }));
    const r = await c.ask(yesNo('Yes, please!', 'Maybe later.', 'うん、会いたい！', 'またあとでね。', 'wantto'));
    if (r.id === 'yes') await introduceNewFriend(c, actor, here);
  }
}

async function topicDream(c, actor) {
  const w = c.world, npc = actor.npc;
  for (const l of dreamLines(npc)) await c.say(actor, l, { expr: 'happy' });
  w.learn(npc.id, 'dream');
  await c.say(actor, line('Where do you want to go?', 'あなたはどこに行きたい？', { expr: 'q.wantgo', area: 'wantto' }));
  const { ATTRACTIONS } = await import('../data/content.js');
  const opts = ATTRACTIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3).map((a) => opt(a.id, `I want to go to ${a.place}.`, `${a.placeJa}に行きたい。`, { emoji: a.emoji, keys: [[a.place.toLowerCase()]], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' }));
  const r = await c.ask(opts);
  const a = ATTRACTIONS.find((x) => x.id === r.id);
  await c.say(actor, line(`Nice! You can ${a.can} there!`, `いいね！${a.canJa}ね！`, { expr: 'a.youcan', area: 'places' }), { expr: 'happy' });
}

async function topicWeather(c, actor) {
  const w = c.world, npc = actor.npc;
  const wx = WEATHER[w.weather];
  if (c.game.scene.outdoor && Math.random() < 0.6) {
    await c.say(actor, line("How's the weather today?", '今日の天気はどう？', { expr: 'q.weather', area: 'weather' }));
    const r = await c.ask(Object.entries(WEATHER).map(([id, x]) => opt(id, `It's ${x.en}.`, `${x.ja}です。`, { emoji: x.emoji, keys: [[x.en]], area: 'weather', expr: 'a.weather', template: "It's sunny / cloudy / rainy." })));
    if (r.id === w.weather) await c.say(actor, line(`Yes! It's ${wx.en}! ${wx.emoji}`, `そうだね！${wx.ja}だね！`), { expr: 'happy' });
    else await c.say(actor, line(`Hmm, look at the sky! It's ${wx.en}! ${wx.emoji}`, `空を見て！${wx.ja}だよ！`), { gesture: 'point' });
    w.xp(npc.id, 1, { key: `weather:${w.day}`, reason: 'chat' });
    return;
  }
  await c.say(actor, line(`It's ${wx.en}. ${wx.emoji}`, `${wx.ja}だよ。`, { expr: 'a.weather', area: 'weather' }));
  if (w.weather === 'rainy') await c.say(actor, line("Let's play inside today.", '今日は中で遊ぼう。'));
  else if (w.weather === 'sunny') await c.say(actor, line("Let's play outside!", '外で遊ぼう！'), { expr: 'happy' });
}

async function topicTime(c, actor) {
  const w = c.world;
  const { h, m } = w.clock;
  await c.say(actor, line(`It's ${timeWords(h, m)}.`, `${timeJa(h, m)}だよ。`, { expr: 'a.time', area: 'time', template: "It's ___ o'clock." }), { gesture: 'point' });
}

async function topicWantDo(c, actor) {
  const w = c.world, npc = actor.npc;
  const pa = playableActFor(w, npc);
  let act = pa.act;
  if (ACT_INFO[act]?.outdoor && w.weather === 'rainy') act = 'cafe';
  const v = actVerb(act, pa.like);
  await c.say(actor, line(`I want to ${v.en}!`, `${jaWant(v.ja)}！`, { expr: 'a.wantto', area: 'wantto', template: 'I want to ___.' }), { expr: 'happy' });
  if (pa.like) w.learn(npc.id, `like:${npc.likes.indexOf(pa.like)}`);
  const r = await c.ask([
    opt('ok', `OK! Let's ${v.en}!`, `いいよ！${jaLets(v.ja)}！`, { emoji: v.emoji, phrases: [`lets ${v.en}`, 'ok', 'lets go', 'sure'], keys: YES_KEYS, area: 'wantto', expr: 'a.lets', template: "Let's ___!" }),
    opt('mall', "Let's go to Niji Mall!", 'にじモールに行こう！', { emoji: '🛍️', phrases: ['lets go to niji mall', 'mall'], keys: [['mall']], area: 'wantto', expr: 'a.lets', template: "Let's ___!" }),
    opt('later', 'Sounds fun! Maybe later.', '楽しそう！またあとでね。', { emoji: '🙂', phrases: ['maybe later', 'later', 'no'], keys: NO_KEYS }),
  ]);
  if (r.id === 'mall') await startOrPlan(c, actor, 'mall', null);
  else if (r.id === 'ok') await startOrPlan(c, actor, act, pa.like);
  else await c.say(actor, line('OK!', 'オッケー！'));
}

async function topicInvite(c, actor, act, like) {
  const w = c.world, npc = actor.npc;
  const likesIt = like && npc.likes.includes(like);
  let finalAct = act;
  if (ACT_INFO[act]?.outdoor && w.weather === 'rainy' && !w.schoolTime) {
    await c.say(actor, line("It's rainy today... Let's go to the café!", '今日は雨だね…カフェに行こう！', { area: 'weather' }));
    finalAct = 'cafe';
  } else if (!likesIt && w.level(npc.id) < 2 && Math.random() < 0.5) {
    const own = playableActFor(w, npc);
    const v = actVerb(own.act, own.like);
    await c.say(actor, line(`Hmm... I want to ${v.en}! Do you want to ${v.en}?`, `うーん…${jaWant(v.ja)}な！${jaInvite(v.ja)}`, { expr: 'a.wantto', area: 'wantto' }));
    if (own.like) w.learn(npc.id, `like:${npc.likes.indexOf(own.like)}`);
    const r = await c.ask(yesNo('Yes! Sounds fun!', 'Maybe next time.', 'うん！楽しそう！', 'また今度ね。', 'wantto'));
    if (r.id === 'no') { await c.say(actor, line('OK! See you!', 'オッケー！またね！')); return; }
    finalAct = own.act;
  } else {
    await c.say(actor, line(pick(Math.random, ['Yes! Sounds fun!', "Sure! Let's go!", 'Yes, I want to!']), 'うん！楽しそう！', { expr: 'a.yes', area: 'wantto' }), { gesture: 'happy', expr: 'happy' });
    if (like) w.xp(npc.id, 2, { key: `invite-remember:${like}`, reason: 'remember' });
  }
  await startOrPlan(c, actor, finalAct, like);
}

/** Now if possible; otherwise make a plan (classroom → after school). */
async function startOrPlan(c, actor, act, like) {
  const w = c.world, npc = actor.npc;
  const info = ACT_INFO[act];
  if (w.schoolTime) {
    const plan = w.addPlan({ npcIds: [npc.id], day: w.day, period: 1, loc: info.loc, act, source: 'talk' });
    const where = info.loc === 'park' ? 'the park' : info.loc === 'mall' ? 'Niji Mall' : 'the café';
    const whereJa = info.loc === 'park' ? '公園' : info.loc === 'mall' ? 'にじモール' : 'カフェ';
    await c.say(actor, line(`Let's ${actVerb(act, like).en} after school! Let's meet at ${where}!`, `放課後に${jaLets(actVerb(act, like).ja)}！${whereJa}で会おう！`, { expr: 'a.lets', area: 'wantto', template: "Let's meet at ___!" }), { gesture: 'happy', expr: 'happy' });
    if (w.save.flags.fd === 'introduced' && npc.id === w.save.introNpc) { w.save.flags.fd = 'planned'; bus.emit('firstday', { stage: 'planned' }); }
    c.game.hud.planToast(plan);
    c.result = { planned: plan };
    return;
  }
  if (!w.free) { await c.say(actor, line("It's late. Let's play tomorrow!", 'もうおそいから、あした遊ぼう！')); return; }
  // Go now: maybe bring a friend who is nearby, then confirm the time cost first.
  const v = actVerb(act, like);
  const group = await inviteNearby(c, actor);
  const names = [npc.name, ...group.map((o) => o.npc.name)];
  const ok = await confirmTime(c, `${v.emoji} ${v.en.charAt(0).toUpperCase() + v.en.slice(1)} with ${listEn(names)}?`, `${names.join('と')}と${v.ja}？`);
  if (!ok) { await c.say(actor, line('OK! Maybe later!', 'オッケー！またあとでね！')); return; }
  const plan = w.addPlan({ npcIds: names.length > 1 ? [npc.id, ...group.map((o) => o.npc.id)] : [npc.id], day: w.day, period: w.period, loc: info.loc, act, source: 'now' });
  c.result = { then: () => c.game.activities.run(act, [actor, ...group], { plan, like }) };
}

/** "Let's invite Hana, too!" — a friend nearby can come along (a group outing). */
async function inviteNearby(c, actor) {
  const w = c.world;
  if (w.save.flags.fd !== 'done' || w.level(actor.npc.id) < 2) return [];
  const o = c.game.npcs.nearby(actor, 12).find((x) => !x.special && !x.engaged && !x.plan && x.mode !== 'search' && w.level(x.npc.id) >= 2 && !w.planWith(x.npc.id));
  if (!o) return [];
  const name = o.npc.name;
  const r = await c.ask([
    opt('invite', `Let's invite ${name}, too!`, `${name}もさそおう！`, { emoji: '🧑‍🤝‍🧑', phrases: [`let's invite ${name.toLowerCase()}`, 'invite'], keys: [['invite', name.toLowerCase()]], area: 'wantto', expr: 'a.invite', template: "Let's invite ___, too!" }),
    opt('two', 'Just us two!', '二人で行こう！', { emoji: '🙂', phrases: ['just us two', 'just us'], keys: [['just', 'two', 'us']] }),
  ]);
  if (r.id !== 'invite') return [];
  await c.join(o);
  await c.ask([opt('come', `${name}, do you want to come?`, `${name}、いっしょに来る？`, { emoji: '💌', phrases: ['do you want to come', 'want to come'], keys: [['come']], area: 'wantto', expr: 'q.wantcome', template: 'Do you want to come?' })]);
  await c.say(o, sline(c, o.npc, 'inviteYes'), { gesture: styleGesture(o.npc, 'happy'), expr: 'happy' });
  return [o];
}

// ---------------------------------------------------------------- plans

async function planFlow(c, actor, plan) {
  if (plan.eventId) { await plannedEventFlow(c, actor, plan); return; }
  const w = c.world, npc = actor.npc;
  const v = actVerb(plan.act, npc.likes.find((l) => interest(l).activity === plan.act));
  await c.say(actor, line(`You came! Let's ${v.en}!`, `来てくれた！${jaLets(v.ja)}！`, { expr: 'a.lets', area: 'wantto' }), { gesture: 'happy', expr: 'happy' });
  // A group plan: everyone who came joins in.
  const others = plan.npcIds.filter((id) => id !== npc.id).map((id) => c.game.npcs.actorFor(id)).filter(Boolean);
  for (const o of others) {
    await c.join(o);
    await c.say(o, sline(c, o.npc, 'inviteYes'), { gesture: styleGesture(o.npc, 'happy'), expr: 'happy' });
  }
  const names = [npc.name, ...others.map((o) => o.npc.name)];
  const ok = await confirmTime(c, `${v.emoji} ${v.en.charAt(0).toUpperCase() + v.en.slice(1)} with ${listEn(names)}?`, `${names.join('と')}と${v.ja}？`);
  if (!ok) { await c.say(actor, line("OK! I'll wait here!", 'オッケー！ここで待ってるね！')); return; }
  c.result = { then: () => c.game.activities.run(plan.act, [actor, ...others], { plan }) };
}

// ---------------------------------------------------------------- introductions

async function maybeIntroduceFriend(c, actor) {
  const w = c.world, npc = actor.npc;
  if (w.daily.asked[`intro:${npc.id}`]) return;
  const candidate = c.game.npcs.nearby(actor, 12).find((o) => !w.isKnown(o.npc.id) && !o.busy && w.link(npc.id, o.npc.id) >= 1);
  if (!candidate) return;
  w.daily.asked[`intro:${npc.id}`] = true;
  await c.say(actor, line(`Oh! Do you know ${candidate.npc.name}? Come here, ${candidate.npc.name}!`, `あ！${candidate.npc.name}を知ってる？おいでよ、${candidate.npc.name}！`), { gesture: 'wave' });
  await introduceNewFriend(c, actor, candidate);
}

async function introduceNewFriend(c, actor, other) {
  const w = c.world, npc = actor.npc, o = other.npc;
  await c.join(other);
  const L = introLines(o, { adjective: o.adjectives[0] });
  await c.say(actor, line(`${L[0].en} ${L[1].en}`, `${L[0].ja}${L[1].ja}`, { expr: 'i.thisis', area: 'intro', template: 'This is ___. He/She is my friend.' }), { gesture: 'point' });
  await c.say(actor, line(`${L[2].en} ${L[4].en}`, `${L[2].ja}${L[4].ja}`, { expr: 'i.likes', area: 'intro', template: 'He/She likes ___. He/She is ___.' }));
  await c.say(other, line('Nice to meet you!', 'はじめまして！', { area: 'selfintro' }), { gesture: 'wave', expr: 'happy' });
  await c.ask([opt('nice', 'Nice to meet you, too!', 'こちらこそ、はじめまして！', { emoji: '🤝', phrases: PHRASES.niceToMeet, area: 'selfintro', expr: 'a.nice', template: 'Nice to meet you, too!' })]);
  w.meet(o.id, npc.id);
  w.markTalked(o.id);
  w.learn(o.id, 'like:0');
  w.learn(o.id, 'adj');
  w.xp(npc.id, 3, { key: `introduced:${o.id}`, reason: 'intro' });
  await c.say(other, line(`See you, ${c.playerName}! Talk to me anytime!`, `またね、${c.playerName}！いつでも話しかけてね！`), { gesture: 'wave' });
  await c.leave(other);
}

async function topicIntroduce(c, actor, other) {
  // Three-line introduction shared with the meet_request event (events.js).
  await playerIntro(c, actor, other);
}

// ---------------------------------------------------------------- quiz, birthday

async function memoryQuiz(c, actor) {
  const w = c.world, npc = actor.npc;
  const knownLike = [0, 1, 2].find((i) => w.knows(npc.id, `like:${i}`));
  if (knownLike === undefined) return;
  w.daily.quiz[npc.id] = true;
  const right = npc.likes[knownLike];
  await c.say(actor, line('Do you remember? What do I like?', '覚えてる？わたしは何が好きでしょう？', { expr: 'q.remember', area: 'selfintro' }), { gesture: 'think' });
  const wrong = INTERESTS.map((x) => x.id).filter((x) => !npc.likes.includes(x)).sort(() => Math.random() - 0.5).slice(0, 2);
  const cards = [right, ...wrong].sort(() => Math.random() - 0.5).map((id) => { const it = interest(id); return opt(id, `You like ${it.en}!`, `${it.ja}が好き！`, { emoji: it.emoji, keys: [[it.en.replace(/^the /, '')]], area: 'selfintro', expr: 'a.youlike', template: 'You like ___!' }); });
  const r = await c.ask(cards);
  if (r.id === right) {
    sfx.good();
    await c.say(actor, line('Yes! You remember! 😊', 'そう！覚えててくれた！'), { gesture: 'happy', expr: 'happy' });
    w.xp(npc.id, 3, { key: `quiz:${w.day}`, reason: 'remember' });
  } else {
    await c.say(actor, line(`Haha, no! I like ${interest(right).en}!`, `あはは、ちがうよ！${interest(right).ja}が好きなんだ！`), { expr: 'happy' });
  }
}

async function birthdayCheck(c, actor) {
  const w = c.world, npc = actor.npc;
  const { m, d } = w.date;
  if (npc.birthday.m !== m || npc.birthday.d !== d || w.daily.wished[npc.id]) return false;
  if (!w.knows(npc.id, 'birthday')) return false;
  w.daily.wished[npc.id] = true;
  await c.ask([opt('hb', 'Happy birthday!', 'お誕生日おめでとう！', { emoji: '🎂', phrases: ['happy birthday'], keys: [['birthday']] })]);
  await c.say(actor, line('Thank you! You remembered my birthday!', 'ありがとう！誕生日を覚えててくれたんだね！'), { gesture: 'happy', expr: 'happy' });
  w.xp(npc.id, 5, { key: `bday:${w.day}`, reason: 'birthday' });
  return true;
}

// ---------------------------------------------------------------- lost item

async function lostItemStart(c, actor, lost) {
  const w = c.world, npc = actor.npc;
  const item = LOST_ITEMS.find((x) => x.id === lost.item);
  await c.say(actor, line(`Oh no! I can't find my ${item.en}! ${item.emoji}`, `どうしよう！${item.ja}が見つからない！`), { expr: 'worried', gesture: 'search' });
  const r = await c.ask([
    opt('help', 'Can I help you?', '手伝おうか？', { emoji: '🙋', phrases: ['can i help you', 'i can help', 'help'], keys: [['help']], area: 'verbs', expr: 'a.help', template: 'Can I help you?' }),
    opt('busy', "Sorry, I'm busy now.", 'ごめん、今いそがしいんだ。', { emoji: '🙏', phrases: ['sorry', 'busy'], keys: NO_KEYS, tone: 'quiet' }),
  ]);
  if (r.id === 'busy') { await c.say(actor, line("That's OK!", 'だいじょうぶ！'), { expr: 'worried' }); return; }
  const scene = c.game.scene;
  const hide = pick(Math.random, scene.hides || []);
  lost.hide = hide.id;
  if (lost.variant === 'clue') {
    await c.say(actor, line(`Thank you! I think it's ${hide.prep} the ${hide.obj.en}.`, `ありがとう！${hide.obj.ja}${{ in: 'の中', on: 'の上', under: 'の下', by: 'のそば' }[hide.prep]}にあると思う。`, { expr: `p.${hide.prep}`, area: 'prepositions', template: "It's in / on / under / by the ___." }), { expr: 'worried', gesture: 'point' });
  } else {
    await c.say(actor, line('Thank you! Can you look around the park, please?', 'ありがとう！公園をさがしてくれる？'), { expr: 'worried' });
  }
  c.result = { then: () => c.game.activities.startSearch(actor, lost, hide) };
}

// ---------------------------------------------------------------- teacher

async function talkToTeacher(game, actor) {
  const w = game.world;
  const c = await Conversation.start(game, [actor]);
  try {
    await c.say(actor, line(`Good morning, ${c.playerName}!`, `おはよう、${c.playerName}さん！`), { gesture: 'wave', expr: 'happy' });
    const kind = pick(Math.random, ['day', 'weather', 'time']);
    if (kind === 'day') {
      await c.say(actor, line('What day is it today?', '今日は何曜日？', { expr: 'q.day', area: 'weekly' }));
      const cards = [w.dow, (w.dow + 1) % 7, (w.dow + 6) % 7].sort(() => Math.random() - 0.5).map((d) => opt(String(d), `It's ${DAYS[d].en}.`, `${DAYS[d].ja}です。`, { emoji: '📅', keys: [[DAYS[d].en.toLowerCase()]], area: 'weekly', expr: 'a.day', template: "It's (Monday)." }));
      const r = await c.ask(cards);
      if (Number(r.id) === w.dow) await c.say(actor, line('Great job!', 'よくできました！'), { expr: 'happy' });
      else await c.say(actor, line(`Look at the board. It's ${DAYS[w.dow].en}!`, `黒板を見て。${DAYS[w.dow].ja}だよ！`), { gesture: 'point' });
    } else if (kind === 'weather') {
      await c.say(actor, line("How's the weather today?", '今日の天気は？', { expr: 'q.weather', area: 'weather' }));
      const r = await c.ask(Object.entries(WEATHER).map(([id, x]) => opt(id, `It's ${x.en}.`, `${x.ja}です。`, { emoji: x.emoji, keys: [[x.en]], area: 'weather', expr: 'a.weather', template: "It's sunny / cloudy / rainy." })));
      if (r.id === w.weather) await c.say(actor, line('Yes! Very good!', 'そうですね！よくできました！'), { expr: 'happy' });
      else await c.say(actor, line(`Look out the window. It's ${WEATHER[w.weather].en}.`, `窓の外を見てね。${WEATHER[w.weather].ja}だよ。`), { gesture: 'point' });
    } else {
      await c.say(actor, line('What time is it?', '今何時？', { expr: 'q.time', area: 'time' }));
      const { h, m } = w.clock;
      const alt = [[h, m], [h + 1, 0], [h, (m + 30) % 60]];
      const r = await c.ask(alt.sort(() => Math.random() - 0.5).map(([hh, mm], i) => opt(`${hh}:${mm}`, `It's ${timeWords(hh, mm)}.`, `${timeJa(hh, mm)}です。`, { emoji: '🕗', keys: [[timeWords(hh, mm)]], area: 'time', expr: 'a.time', template: "It's ___." })));
      if (r.id === `${h}:${m}`) await c.say(actor, line("That's right!", '正解！'), { expr: 'happy' });
      else await c.say(actor, line(`Look at the clock. It's ${timeWords(h, m)}.`, `時計を見て。${timeJa(h, m)}だよ。`), { gesture: 'point' });
    }
    await c.say(actor, line('Class starts soon. Sit at your desk when you are ready!', 'もうすぐ授業です。準備ができたら席にすわってね！'));
  } finally { await c.end(); }
}

export { confirmTime, actVerb };
