// Behaviour styles for the fictional NPCs (DESIGN_DECISIONS 2026-11-16).
//
// A style changes HOW a classmate behaves: greetings, invitation wording,
// reactions in activities, gestures, which of their OWN likes they suggest
// first, which friendship events they lean towards, and whether they spend
// their initiative coming over in person or sending messages. It never changes
// HOW MUCH: every style has the same initiative budget and XP code never reads
// the style.
//
// Styles are assigned once per class from the class seed and the NPC id only,
// balanced so a class shows a spread, and stored on the class NPC. They are
// never derived from what a name means, the pronoun, the look or interests,
// and they are never shown as labels in the UI (only through behaviour).
//
// Lines: { en, ja } with placeholders {name} (the player), {hi} / {hija}
// ("Good morning" / "Hi"). Grade-5 English; positive; never romantic.

import { RNG, hashString } from '../core/rng.js';

export const STYLE_IDS = ['outgoing', 'thoughtful', 'playful', 'creative', 'curious', 'considerate'];

const S = (en, ja) => ({ en, ja });

export const STYLES = {
  outgoing: {
    id: 'outgoing',
    greet: {
      acq: [S('Hello, {name}! How are you today?', 'こんにちは、{name}！今日は元気？'), S('Hi, {name}! Nice to see you!', 'やあ、{name}！会えてうれしいな！'), S('{hi}, {name}! It\'s a great day!', '{hija}、{name}！いい日だね！')],
      friend: [S('{name}! Hi! I\'m so happy to see you!', '{name}！やあ！会えてすごくうれしい！'), S('Hey, {name}! What\'s up?', 'ねえ、{name}！どうしてる？'), S('{hi}, {name}! Let\'s have fun today!', '{hija}、{name}！今日も楽しもうね！')],
      close: [S('{name}! There you are! I was looking for you!', '{name}！いた！さがしてたんだ！'), S('Yay, it\'s {name}! {hi}!', 'やった、{name}だ！{hija}！'), S('{name}! Come here! I have a lot to tell you!', '{name}！こっち来て！話したいことがいっぱいあるの！')],
    },
    tails: [S("It's so fun!", 'すごく楽しいよ！'), S('I love it!', '大好き！'), S("Let's do it together!", 'いっしょにやろうよ！')],
    invitePre: [S('Hey! I have a great idea!', 'ねえ！いいこと思いついた！'), S('{name}, are you free?', '{name}、ひま？')],
    inviteYes: [S("Yes! Let's go!", 'うん！行こう！'), S('Of course! Sounds fun!', 'もちろん！楽しそう！')],
    declineOk: [S('OK! Next time!', 'オッケー！また今度ね！'), S('No problem! See you later!', 'だいじょうぶ！またあとでね！')],
    cheer: [S('Nice one!', 'いいね！'), S('Wow, great!', 'わあ、すごい！')],
    encourage: [S("Don't worry! Try again!", 'だいじょうぶ！もう一回！'), S('You can do it!', 'できるよ！')],
    celebrate: [S('We did it! Yay!', 'やったね！'), S('That was so much fun!', 'すごく楽しかった！')],
    thanks: [S("Thank you, {name}! You're the best!", 'ありがとう、{name}！最高！'), S('Thanks a lot, {name}!', '本当にありがとう、{name}！')],
    hello: [S('Hello!', 'こんにちは！'), S('Hi, {name}!', 'やあ、{name}！')],
    approach: [S('{name}! Hi, hi!', '{name}！やあやあ！'), S('{name}! Wait for me!', '{name}！待って！')],
    gestures: { greet: 'wave', happy: 'cheer', think: 'point' },
    affinity: ['soccer', 'dodgeball', 'basketball', 'dancing', 'singing', 'sweets', 'shopping', 'games'],
    events: { group_outing: 1.6, meet_request: 1.4, special_day: 1.3, npc_hangout: 1.3, hobby: 1.1, home_visit: 1.1, friend_house: 1.1, practice: 1, delivery: 1, find: 1, best_friend: 1, remember: 0.9, project: 0.9 },
    initiative: { approach: 0.65, message: 0.35 },
  },
  thoughtful: {
    id: 'thoughtful',
    greet: {
      acq: [S('Oh... hello, {name}.', 'あ…こんにちは、{name}。'), S('{hi}, {name}.', '{hija}、{name}。'), S('Hi, {name}. How are you?', 'こんにちは、{name}。元気？')],
      friend: [S("Oh, {name}! Hi. I'm happy to see you.", 'あ、{name}！こんにちは。会えてうれしいな。'), S('{hi}, {name}. What are you doing today?', '{hija}、{name}。今日は何をしてるの？'), S("Hi, {name}. It's nice to talk with you.", 'こんにちは、{name}。話せてうれしいな。')],
      close: [S("{name}! I'm glad you came.", '{name}！来てくれてうれしい。'), S('{hi}, {name}. I wanted to see you.', '{hija}、{name}。会いたかったんだ。'), S('{name}! You always make me smile.', '{name}！いつもえがおにしてくれるね。')],
    },
    tails: [S("It's nice.", 'いいよね。'), S('It makes me happy.', 'しあわせな気分になるんだ。'), S('I like it a lot.', 'すごく好きなんだ。')],
    invitePre: [S('Um... are you free?', 'あの…ひまかな？'), S('Um, {name}... I have an idea.', 'あのね、{name}…考えがあるんだ。')],
    inviteYes: [S('Sure. That sounds nice.', 'うん。いいね。'), S('Yes, I want to!', 'うん、そうしたい！')],
    declineOk: [S("That's OK. Maybe next time.", 'だいじょうぶ。また今度ね。'), S('OK. See you later.', 'うん。またあとでね。')],
    cheer: [S('Oh, nice!', 'あ、いいね！'), S('Good job!', 'じょうず！')],
    encourage: [S("It's OK. Take your time.", 'だいじょうぶ。ゆっくりでいいよ。'), S('You can do it.', 'できるよ。')],
    celebrate: [S("We did it. I'm so happy.", 'できたね。すごくうれしい。'), S('That was fun.', '楽しかったね。')],
    thanks: [S("Thank you, {name}. I'm really happy.", 'ありがとう、{name}。本当にうれしい。'), S("Thank you. You're very kind.", 'ありがとう。とてもやさしいね。')],
    hello: [S('Oh, hi.', 'あ、こんにちは。'), S('Hello, {name}.', 'こんにちは、{name}。')],
    approach: [S('Um... {name}?', 'あの…{name}？'), S('Hi, {name}...', 'こんにちは、{name}…')],
    gestures: { greet: 'nod', happy: 'happy', think: 'think' },
    affinity: ['reading', 'comics', 'piano', 'drawing', 'music', 'animals', 'cooking', 'games'],
    events: { remember: 1.5, hobby: 1.3, project: 1.3, home_visit: 1.2, friend_house: 1.2, delivery: 1.1, practice: 1, special_day: 1, find: 1, best_friend: 1, meet_request: 0.8, npc_hangout: 0.8, group_outing: 0.7 },
    initiative: { approach: 0.3, message: 0.7 },
  },
  playful: {
    id: 'playful',
    greet: {
      acq: [S("Hi, {name}! I'm full of energy today!", 'やあ、{name}！今日は元気いっぱい！'), S("Hello, {name}! Let's play sometime!", 'こんにちは、{name}！今度遊ぼうね！'), S('{hi}, {name}! Ha ha, hello!', '{hija}、{name}！あはは、やあ！')],
      friend: [S("Hey, {name}! I'm so excited today!", 'ねえ、{name}！今日はわくわくしてるんだ！'), S("Yo, {name}! What's up?", 'よっ、{name}！どうしてる？'), S("{hi}, {name}! Let's play a lot today!", '{hija}、{name}！今日もいっぱい遊ぼう！')],
      close: [S("{name}! Tag, you're it! Ha ha, just kidding!", '{name}！タッチ！おにだよ！あはは、じょうだん！'), S("Yay, {name}! Let's have a fun day!", 'やった、{name}！楽しい一日にしよう！'), S('{name}! I ran here to see you!', '{name}！会いたくて走ってきたよ！')],
    },
    tails: [S("It's super fun!", 'めっちゃ楽しいよ！'), S('I can do it all day!', '一日中できるよ！')],
    invitePre: [S("Hey, hey! Let's play!", 'ねえねえ！遊ぼう！'), S("I'm bored! Let's do something!", 'ひまだよ〜！何かしよう！')],
    inviteYes: [S("Yes! Let's go, go, go!", 'うん！行こう行こう！'), S('Woo-hoo! Sure!', 'やったー！いいよ！')],
    declineOk: [S('OK! Next time, then!', 'オッケー！じゃあまた今度！'), S('Aww, OK! See you!', 'そっか、オッケー！またね！')],
    cheer: [S('Whoa! Cool!', 'おお！かっこいい！'), S('Yes! Nice!', 'よし！いいね！')],
    encourage: [S("Ha ha, that's OK! Again!", 'あはは、だいじょうぶ！もう一回！'), S('Go, go! You can do it!', 'がんばれ！できるよ！')],
    celebrate: [S('Woo-hoo! We did it!', 'やったー！できたね！'), S('That was awesome!', '最高だった！')],
    thanks: [S("Thanks, {name}! You're so cool!", 'ありがとう、{name}！かっこいい！'), S('Yay! Thank you!', 'やったー！ありがとう！')],
    hello: [S('Yo!', 'よっ！'), S('Hi, hi!', 'やあやあ！')],
    approach: [S("{name}! Let's play!", '{name}！遊ぼう！'), S('Hey, {name}! Over here!', 'ねえ、{name}！こっちこっち！')],
    gestures: { greet: 'wave', happy: 'dance', think: 'happy' },
    affinity: ['soccer', 'baseball', 'dodgeball', 'basketball', 'skateboarding', 'running', 'games', 'dancing', 'cycling'],
    events: { hobby: 1.4, practice: 1.4, group_outing: 1.3, find: 1.1, npc_hangout: 1.1, home_visit: 1.1, friend_house: 1.1, remember: 1, special_day: 1, meet_request: 1, best_friend: 1, delivery: 0.9, project: 0.9 },
    initiative: { approach: 0.6, message: 0.4 },
  },
  creative: {
    id: 'creative',
    greet: {
      acq: [S('Hello, {name}! I have a lot of ideas today!', 'こんにちは、{name}！今日はアイデアがいっぱい！'), S('Hi, {name}! Nice to see you!', 'やあ、{name}！会えてうれしいな！'), S('{hi}, {name}! Today is a fun day. I can feel it!', '{hija}、{name}！今日は楽しい日になりそう！')],
      friend: [S("{name}! Hi! Let's make something fun!", '{name}！やあ！何か楽しいものを作ろう！'), S('{hi}, {name}! I had a fun dream last night!', '{hija}、{name}！きのうの夜、楽しい夢を見たんだ！'), S("Hey, {name}! I'm thinking of a new idea!", 'ねえ、{name}！新しいアイデアを考えてるんだ！')],
      close: [S("{name}! You're here! Now it's a perfect day!", '{name}！来た！これで最高の一日だ！'), S('{hi}, {name}! I want to show you my ideas!', '{hija}、{name}！わたしのアイデアを見せたいな！'), S('{name}! I drew you in my notebook! Ha ha!', '{name}！ノートに{name}の絵をかいたよ！あはは！')],
    },
    tails: [S("It's like magic!", 'まほうみたいなんだ！'), S('It gives me ideas!', 'アイデアがうかぶんだ！')],
    invitePre: [S('I have a fun idea!', '楽しいアイデアがあるの！'), S("Hey, {name}! Let's make a fun day!", 'ねえ、{name}！楽しい日にしよう！')],
    inviteYes: [S("Yes! That's a great idea!", 'うん！いいアイデアだね！'), S("Sure! Let's make it fun!", 'いいよ！楽しくしよう！')],
    declineOk: [S("OK! I'll think of more ideas!", 'オッケー！もっとアイデアを考えておくね！'), S("That's OK! Next time!", 'だいじょうぶ！また今度ね！')],
    cheer: [S('Wow, beautiful!', 'わあ、きれい！'), S("That's so cool!", 'すごくかっこいい！')],
    encourage: [S('Try it your way!', '自分のやり方でやってみて！'), S("It's OK! Let's try again!", 'だいじょうぶ！もう一回やってみよう！')],
    celebrate: [S('We made something great!', 'すごいものができたね！'), S('Ta-da! We did it!', 'じゃーん！できた！')],
    thanks: [S("Thank you, {name}! That's wonderful!", 'ありがとう、{name}！すてき！'), S("Thanks! You're so kind!", 'ありがとう！やさしいね！')],
    hello: [S('Hi there!', 'やあ！'), S('Hello, {name}!', 'こんにちは、{name}！')],
    approach: [S('{name}! I have an idea!', '{name}！アイデアがあるの！'), S('{name}! Look, look!', '{name}！見て見て！')],
    gestures: { greet: 'wave', happy: 'happy', think: 'think' },
    affinity: ['drawing', 'comics', 'music', 'singing', 'piano', 'dancing', 'cooking'],
    events: { project: 1.6, hobby: 1.4, home_visit: 1.2, friend_house: 1.2, special_day: 1.1, remember: 1, delivery: 1, best_friend: 1, group_outing: 1, npc_hangout: 1, meet_request: 0.9, practice: 0.9, find: 0.9 },
    initiative: { approach: 0.45, message: 0.55 },
  },
  curious: {
    id: 'curious',
    greet: {
      acq: [S('Hi, {name}! I want to know about you!', 'やあ、{name}！{name}のこと、知りたいな！'), S('{hi}, {name}! Today is an adventure!', '{hija}、{name}！今日もぼうけんだ！'), S('Hello, {name}! Nice to see you!', 'こんにちは、{name}！会えてうれしいな！')],
      friend: [S('{hi}, {name}! I want to go on an adventure today!', '{hija}、{name}！今日はぼうけんしたいな！'), S("Hey, {name}! It's nice to see you again!", 'ねえ、{name}！また会えてうれしい！'), S("{name}! Hi! Let's find something fun today!", '{name}！やあ！今日も楽しいことをさがそう！')],
      close: [S("{name}! Let's explore together today!", '{name}！今日もいっしょにたんけんしよう！'), S("{hi}, {name}! You're my adventure buddy!", '{hija}、{name}！ぼうけん仲間だね！'), S('{name}! There you are! I always find you!', '{name}！見つけた！いつも見つけちゃうね！')],
    },
    tails: [S('There is so much to learn!', '知りたいことがいっぱい！'), S("It's so interesting!", 'すごくおもしろいよ！')],
    invitePre: [S("Hey, {name}! Let's try something new!", 'ねえ、{name}！新しいことをやってみよう！'), S('I want to try something! Come with me?', 'やってみたいことがあるの！いっしょに来る？')],
    inviteYes: [S("Yes! Let's try it!", 'うん！やってみよう！'), S('Sure! I want to see!', 'いいよ！見てみたい！')],
    declineOk: [S("OK! Next time, let's explore!", 'オッケー！今度たんけんしようね！'), S("That's OK! See you!", 'だいじょうぶ！またね！')],
    cheer: [S('Whoa, look at that!', 'わあ、見て！'), S('Cool! How did you do that?', 'すごい！どうやったの？')],
    encourage: [S("Let's try a different way!", 'ちがうやり方でやってみよう！'), S('Almost! One more time!', 'おしい！もう一回！')],
    celebrate: [S('Yay! That was a good adventure!', 'やった！いいぼうけんだったね！'), S('Wow, we did it!', 'わあ、できたね！')],
    thanks: [S("Thank you, {name}! You're so kind!", 'ありがとう、{name}！やさしいね！'), S('Thanks! That was so interesting!', 'ありがとう！すごくおもしろかった！')],
    hello: [S('Oh! Hi!', 'あ！やあ！'), S('Hello, {name}!', 'こんにちは、{name}！')],
    approach: [S('{name}! Come and look!', '{name}！来て、見て！'), S('{name}! Over here!', '{name}！こっちだよ！')],
    gestures: { greet: 'wave', happy: 'happy', think: 'search' },
    affinity: ['animals', 'bugs', 'cycling', 'swimming', 'skateboarding', 'reading', 'running'],
    events: { hobby: 1.3, meet_request: 1.3, find: 1.3, remember: 1.1, group_outing: 1.1, npc_hangout: 1.1, practice: 1, special_day: 1, delivery: 1, project: 1, best_friend: 1, home_visit: 1, friend_house: 1 },
    initiative: { approach: 0.55, message: 0.45 },
  },
  considerate: {
    id: 'considerate',
    greet: {
      acq: [S('Hello, {name}. How are you today?', 'こんにちは、{name}。今日は元気？'), S("Hi, {name}! It's nice to see you.", 'こんにちは、{name}！会えてうれしいな。'), S('{hi}, {name}. Have a nice day!', '{hija}、{name}。いい一日をね！')],
      friend: [S('{name}! Hi! Are you having a good day?', '{name}！やあ！いい一日を過ごしてる？'), S("{hi}, {name}! I'm happy you're here.", '{hija}、{name}！来てくれてうれしいな。'), S('Hi, {name}! Do you need any help today?', 'やあ、{name}！今日、何か手伝えることある？')],
      close: [S('{name}! I always feel happy with you.', '{name}！いっしょにいると、いつもしあわせな気分だよ。'), S('{hi}, {name}! I was waiting for you!', '{hija}、{name}！待ってたよ！'), S("{name}! You're such a good friend!", '{name}！本当にいい友達だね！')],
    },
    tails: [S('It makes everyone happy!', 'みんながえがおになるんだ！'), S("It's my favorite.", 'いちばん好きなんだ。')],
    invitePre: [S('{name}, are you free? I want to spend time with you.', '{name}、ひま？いっしょに過ごしたいな。'), S("If you're not busy...", 'もしいそがしくなかったら…')],
    inviteYes: [S("Yes! I'm so happy you asked!", 'うん！さそってくれてうれしい！'), S("Sure! Let's go together!", 'いいよ！いっしょに行こう！')],
    declineOk: [S("That's OK! Take care!", 'だいじょうぶ！気をつけてね！'), S('No problem. Next time!', 'だいじょうぶ。また今度ね！')],
    cheer: [S('Great job, {name}!', 'じょうずだね、{name}！'), S("Nice! You're doing well!", 'いいね！うまくいってるよ！')],
    encourage: [S("Don't worry. You can do it!", '心配しないで。できるよ！'), S("It's OK! I'm here!", 'だいじょうぶ！わたしがいるよ！')],
    celebrate: [S('We did it together!', 'いっしょにできたね！'), S("I'm so happy! Thank you!", 'すごくうれしい！ありがとう！')],
    thanks: [S("Thank you so much, {name}! You're so kind!", '本当にありがとう、{name}！やさしいね！'), S("Thank you! I'm very happy.", 'ありがとう！とてもうれしい。')],
    hello: [S('Hello!', 'こんにちは！'), S('Hi, {name}!', 'やあ、{name}！')],
    approach: [S('{name}! Hi! How are you?', '{name}！やあ！元気？'), S('{name}! Can we talk?', '{name}！ちょっと話せる？')],
    gestures: { greet: 'wave', happy: 'clap', think: 'nod' },
    affinity: ['cooking', 'sweets', 'animals', 'music', 'reading', 'singing'],
    events: { delivery: 1.5, special_day: 1.4, practice: 1.3, find: 1.2, home_visit: 1.2, friend_house: 1.2, remember: 1.1, meet_request: 1.1, hobby: 1, project: 1, best_friend: 1, group_outing: 1, npc_hangout: 1 },
    initiative: { approach: 0.45, message: 0.55 },
  },
};

/** Total initiative per NPC; identical for every style (fairness rule). */
export const INITIATIVE_TOTAL = 1;

/**
 * Give a style to every NPC that lacks one. Uses ONLY the class seed, the NPC
 * id and the styles already present (least-represented styles first), so it
 * is deterministic, stable across reloads and roster edits, and never reads
 * name text, pronoun, look or interests. Existing styles are never changed.
 */
export function assignStyles(npcs, classSeed) {
  const counts = Object.fromEntries(STYLE_IDS.map((s) => [s, 0]));
  for (const n of npcs) if (STYLE_IDS.includes(n.style)) counts[n.style]++;
  const order = (n) => hashString(`${classSeed}|style-order|${n.id}`);
  const pending = npcs
    .filter((n) => !STYLE_IDS.includes(n.style))
    .sort((a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const n of pending) {
    const min = Math.min(...STYLE_IDS.map((s) => counts[s]));
    const options = STYLE_IDS.filter((s) => counts[s] === min);
    const style = new RNG(`${classSeed}|style|${n.id}`).pick(options);
    n.style = style;
    counts[style]++;
  }
  return npcs;
}

export function styleOf(npc) {
  if (STYLE_IDS.includes(npc?.style)) return npc.style;
  // Not reached once a class has been through assignStyles; stays deterministic.
  return STYLE_IDS[hashString(String(npc?.id ?? '')) % STYLE_IDS.length];
}

export function styleData(npc) { return STYLES[styleOf(npc)]; }

/** The NPC's own likes, the ones this style enjoys most first (stable order otherwise). */
export function preferredLikes(npc) {
  const aff = styleData(npc).affinity;
  return [...npc.likes].sort((a, b) => {
    const ia = aff.indexOf(a), ib = aff.indexOf(b);
    const ra = ia < 0 ? 99 : ia, rb = ib < 0 ? 99 : ib;
    return ra - rb || npc.likes.indexOf(a) - npc.likes.indexOf(b);
  });
}

/** Level band used by the style banks. */
export function band(level) { return level >= 4 ? 'close' : level >= 2 ? 'friend' : 'acq'; }

/** Fill {name}/{hi}/{hija} placeholders. */
export function fill(l, { name = '', period = 1 } = {}) {
  const hi = period === 0 ? 'Good morning' : 'Hi';
  const hija = period === 0 ? 'おはよう' : 'こんにちは';
  const f = (s) => s.replace(/\{name\}/g, name).replace(/\{hi\}/g, hi).replace(/\{hija\}/g, hija);
  return { en: f(l.en), ja: f(l.ja) };
}

/** A line from one of the style's banks ('cheer', 'thanks', 'greet.close', ...), filled. */
export function styleLine(npc, key, { rng = Math.random, name = '', period = 1 } = {}) {
  const st = styleData(npc);
  const bank = key.includes('.') ? key.split('.').reduce((o, k) => o?.[k], st) : st[key];
  if (!Array.isArray(bank) || !bank.length) return null;
  const r = typeof rng === 'function' ? rng() : rng.next();
  return fill(bank[Math.floor(r * bank.length)], { name, period });
}

export function styleGesture(npc, kind = 'greet') { return styleData(npc).gestures[kind] || 'wave'; }
