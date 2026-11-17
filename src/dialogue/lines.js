// Sentence builders. Every line is { en, ja, expr?, area? }; `expr` and
// `area` feed the phrase book and language-progress steering.
//
// Pronouns come from the teacher's roster choice. 'name' (the default for
// teacher-entered names) repeats the name instead of guessing he/she.

import {
  interest, ability, food, drink, subject, adjective, attraction, DAYS, petPhrase, PETS,
  dateText, dateJa, timeWords, timeJa, numberWord, listEn, subjectDays, LOCATIONS,
} from '../data/content.js';
import { actPhrase, actPhrase3 } from '../world/schedule.js';
import { styleLine, band } from '../world/personality.js';

export function P(npc) {
  if (npc.pronoun === 'he') return { s: 'he', S: 'He', o: 'him', p: 'his', P: 'His' };
  if (npc.pronoun === 'she') return { s: 'she', S: 'She', o: 'her', p: 'her', P: 'Her' };
  return { s: npc.name, S: npc.name, o: npc.name, p: `${npc.name}'s`, P: `${npc.name}'s` };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const line = (en, ja = '', meta = {}) => ({ en, ja, ...meta });
const pick = (rng, arr) => arr[Math.floor((rng ? rng() : Math.random()) * arr.length)];

// ---------------------------------------------------------------- greetings

export function greeting(npc, playerName, { level, period, weekend, weather, rng }) {
  // Opening lines come from the friend's behaviour style and level band
  // (src/world/personality.js); best friends sometimes say so.
  const lvl = Math.max(1, Math.min(5, level));
  const r = rng || Math.random;
  const hi = period === 0 ? ['Good morning', 'おはよう'] : ['Hi', 'こんにちは'];
  let en, ja;
  if (lvl >= 5 && r() < 0.35) [en, ja] = [`${playerName}! My best friend! ${hi[0]}!`, `${playerName}！親友！${hi[1]}！`];
  else ({ en, ja } = styleLine(npc, `greet.${band(lvl)}`, { rng: r, name: playerName, period }));
  const extra = [];
  if (weather === 'sunny' && rng && rng() < 0.25) extra.push(["It's sunny today!", '今日は晴れだね！']);
  if (weather === 'rainy' && rng && rng() < 0.35) extra.push(["It's rainy today...", '今日は雨だね…']);
  if (weekend && rng && rng() < 0.25) extra.push(['I love weekends!', '週末って最高！']);
  if (extra.length) return line(`${en} ${extra[0][0]}`, `${ja}${extra[0][1]}`, { expr: 'greet', area: 'selfintro' });
  return line(en, ja, { expr: 'greet', area: 'selfintro' });
}

// ---------------------------------------------------------------- facts (first person)

export function likeLine(npc, likeId, withTail = true, rng = null) {
  const it = interest(likeId);
  // Tails ("It's so fun!", "It makes me happy.") follow the behaviour style.
  const tail = withTail ? styleLine(npc, 'tails', { rng: rng || Math.random }) : null;
  const [t, tj] = tail ? [tail.en, tail.ja] : ['', ''];
  return line(`I like ${it.en}. ${t}`.trim(), `${it.ja}が好きです。${tj}`, { expr: 'a.like', area: 'selfintro', template: 'I like ___.' });
}

export function canLine(npc, canId) {
  const a = ability(canId);
  return line(`I can ${a.en}.`, `${a.ja}`, { expr: 'a.can', area: 'selfintro', template: 'I can ___.' });
}

export function weekLine(npc, dowIdx, slot, world) {
  const day = DAYS[dowIdx];
  const p = actPhrase(slot.act);
  const friends = (slot.with || []).map((id) => world.npc(id)).filter(Boolean);
  const known = friends.filter((f) => world.isKnown(f.id) || world.npcLinkKnown(npc.id, f.id));
  const withEn = friends.length ? ` with ${friends[0].name}` : '';
  const withJa = friends.length ? `${friends[0].name}と` : '';
  const after = dowIdx < 5 ? ' after school' : '';
  const afterJa = dowIdx < 5 ? '放課後に' : '';
  return {
    ...line(`I ${p.en}${withEn}${after} on ${day.plural}.`, `${day.ja}は${afterJa}${withJa}${p.ja}。`, { expr: 'a.weekly', area: 'weekly', template: 'I ___ on ___s.' }),
    friend: friends[0] || null,
    knownFriend: known[0] || null,
  };
}

export function subjectLine(npc) {
  const s = subject(npc.subject);
  const days = subjectDays(npc.subject).slice(0, 2).map((d) => DAYS[d].plural);
  const daysJa = subjectDays(npc.subject).slice(0, 2).map((d) => DAYS[d].ja).join('と');
  return [
    line(`I like ${s.en}.`, `${s.ja}が好きです。`, { expr: 'a.subject', area: 'subjects', template: 'I like (subject).' }),
    line(`We have ${s.en} on ${listEn(days)}.`, `${s.ja}は${daysJa}にあるよ。`, { expr: 'a.subjectday', area: 'subjects', template: 'We have ___ on ___s.' }),
  ];
}

export function wakeLine(npc) {
  return line(`I wake up at ${timeWords(npc.wake.h, npc.wake.m)}.`, `${timeJa(npc.wake.h, npc.wake.m)}に起きます。`, { expr: 'a.wake', area: 'time', template: 'I wake up at ___.' });
}

export function birthdayLine(npc) {
  return line(`My birthday is ${dateText(npc.birthday.m, npc.birthday.d)}.`, `わたしの誕生日は${dateJa(npc.birthday.m, npc.birthday.d)}です。`, { expr: 'a.birthday', area: 'selfintro', template: 'My birthday is ___.' });
}

export function petLines(npc) {
  if (!npc.pet) return [line("No, I don't.", 'ううん、かっていないよ。', { expr: 'a.no', area: 'possessions' }), line('I want a dog!', '犬がほしいな！', { area: 'wantto' })];
  const p = PETS.find((x) => x.id === npc.pet.type);
  return [
    line('Yes, I do.', 'うん、かってるよ。', { expr: 'a.yesido', area: 'possessions', template: 'Yes, I do.' }),
    line(`I have ${petPhrase(npc.pet)}.`, `${p.ja}を${npc.pet.count}ひき かっています。`, { expr: 'a.have', area: 'possessions', template: 'I have ___.' }),
  ];
}

export function gamesLine(npc) {
  const n = npc.games;
  if (n === 0) return line("I don't have video games.", 'テレビゲームは持っていないよ。', { area: 'possessions' });
  return line(`I have ${numberWord(n)} games.`, `ゲームを${n}こ持っているよ。`, { expr: 'a.howmany', area: 'possessions', template: 'I have (number) ___.' });
}

export function dreamLines(npc) {
  const a = attraction(npc.dream);
  return [
    line(`I want to go to ${a.place}.`, `${a.placeJa}に行きたいな。`, { expr: 'a.wantgo', area: 'wantto', template: 'I want to go to ___.' }),
    line(`${a.thing} is in ${a.place}.`, `${a.placeJa}には${a.thingJa}があるんだ。`, { expr: 'a.isin', area: 'places', template: 'The ___ is in ___.' }),
    line(`You can ${a.can} there. ${a.emoji}`, `${a.canJa}よ。`, { expr: 'a.youcan', area: 'places', template: 'You can ___ there.' }),
  ];
}

export function foodLine(npc) {
  const f = food(npc.food);
  return line(`I like ${f.general}. ${f.emoji}`, `${f.ja}が好き！`, { expr: 'a.like', area: 'food' });
}

// ---------------------------------------------------------------- third person (introductions)

export function introLines(npc, { adjective: adjId = null, like = 0, can = 0 } = {}) {
  const p = P(npc);
  const it = interest(npc.likes[like]);
  const ab = ability(npc.cans[can]);
  const out = [
    line(`This is ${npc.name}.`, `こちらは${npc.name}です。`, { expr: 'i.thisis', area: 'intro', template: 'This is ___.' }),
    line(`${p.S} ${npc.pronoun === 'name' ? 'is' : 'is'} my friend.`, '友達なんだ。', { expr: 'i.friend', area: 'intro', template: 'He/She is my friend.' }),
    line(`${p.S} ${npc.pronoun === 'name' ? 'likes' : 'likes'} ${it.en}.`, `${it.ja}が好きなんだ。`, { expr: 'i.likes', area: 'intro', template: 'He/She likes ___.' }),
    line(`${p.S} can ${ab.en}.`, `${ab.ja}よ。`, { expr: 'i.can', area: 'intro', template: 'He/She can ___.' }),
  ];
  if (adjId) {
    const a = adjective(adjId);
    out.push(line(`${p.S} is ${a.en}!`, `${a.ja}んだよ！`, { expr: 'i.adj', area: 'adjectives', template: 'He/She is (kind/funny/…).' }));
  }
  return out;
}

/** "Yuki likes soccer." for the journal and player introductions. */
export function factSentence(npc, key, world) {
  const p = P(npc);
  const [kind, arg] = key.split(':');
  const n = npc.name;
  if (kind === 'like') { const it = interest(npc.likes[Number(arg)]); return line(`${n} likes ${it.en}.`, `${n}は${it.ja}が好き。`, { emoji: it.emoji }); }
  if (kind === 'can') { const a = ability(npc.cans[Number(arg)]); return line(`${n} can ${a.en}.`, `${n}は${a.ja}。`, { emoji: a.emoji }); }
  if (kind === 'week') {
    const d = Number(arg);
    const slot = npc.schedule[d][world ? world.primaryPeriodFor(npc, d) : 1];
    const ph = actPhrase3(slot.act, p.p);
    const loc = LOCATIONS[slot.loc];
    return line(`${DAYS[d].en}: ${n} ${ph.en}.`, `${DAYS[d].ja}：${ph.ja}`, { emoji: ph.emoji, loc: slot.loc, locName: loc?.en });
  }
  if (kind === 'subject') { const s = subject(npc.subject); return line(`${n} likes ${s.en}.`, `${n}は${s.ja}が好き。`, { emoji: s.emoji }); }
  if (kind === 'birthday') return line(`${n}'s birthday is ${dateText(npc.birthday.m, npc.birthday.d)}.`, `${n}の誕生日は${dateJa(npc.birthday.m, npc.birthday.d)}。`, { emoji: '🎂' });
  if (kind === 'wake') return line(`${n} wakes up at ${timeWords(npc.wake.h, npc.wake.m)}.`, `${n}は${timeJa(npc.wake.h, npc.wake.m)}に起きる。`, { emoji: '⏰' });
  if (kind === 'pet') {
    if (!npc.pet) return line(`${n} doesn't have a pet.`, `${n}はペットをかっていない。`, { emoji: '🏠' });
    const pt = PETS.find((x) => x.id === npc.pet.type);
    return line(`${n} has ${petPhrase(npc.pet)}.`, `${n}は${pt.ja}をかっている。`, { emoji: pt.emoji });
  }
  if (kind === 'food') { const f = food(npc.food); return line(`${n} likes ${f.general}.`, `${n}は${f.ja}が好き。`, { emoji: f.emoji }); }
  if (kind === 'games') return line(`${n} has ${numberWord(npc.games)} video games.`, `${n}はゲームを${npc.games}こ持っている。`, { emoji: '🎮' });
  if (kind === 'dream') { const a = attraction(npc.dream); return line(`${n} wants to go to ${a.place}.`, `${n}は${a.placeJa}に行きたい。`, { emoji: a.emoji }); }
  if (kind === 'adj') { const a = adjective(npc.adjectives[0]); return line(`${n} is ${a.en}.`, `${n}は${a.ja}。`, { emoji: '😊' }); }
  if (kind === 'drink') { const d = drink(npc.drink); return line(`${n} likes ${d.en}.`, `${n}は${d.ja}が好き。`, { emoji: d.emoji }); }
  return line(key, key);
}

export const FACT_ORDER = ['like:0', 'can:0', 'like:1', 'week:5', 'week:6', 'subject', 'can:1', 'like:2', 'birthday', 'pet', 'food', 'wake', 'dream', 'games', 'week:0', 'week:1', 'week:2', 'week:3', 'week:4'];

export { cap, pick };
