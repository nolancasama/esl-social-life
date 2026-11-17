// Friendship event flows (DESIGN_DECISIONS 2026-11-16): the conversation side
// of src/world/friendship.js. A template can be offered only when a flow is
// registered here (FLOWS); later phases register more. Every branch ends in a
// choice; declining or postponing never costs connection; period events show
// their time cost before they start and advance time only when they finish.

import { opt } from './runner.js';
import { line, P } from './lines.js';
import { YES_KEYS, NO_KEYS } from './intent.js';
import { confirmTime, slotWords, whenPhrase } from './common.js';
import { interest, ability, adjective, DAYS, LOCATIONS, GOOD_AT } from '../data/content.js';
import { TEMPLATES, presentPhrase } from '../data/events.js';
import { RNG } from '../core/rng.js';
import { sfx } from '../core/audio.js';
import { styleLine, styleGesture } from '../world/personality.js';
import * as F from '../world/friendship.js';
import { dow } from '../world/time.js';
import { playHobby } from '../activities/hobby.js';
import { hangoutToReport, pastPhrase, joinableActivity } from '../world/social.js';
import { actPhrase } from '../world/schedule.js';
import { ACT_INFO } from '../game/world.js';
import { playVisit } from '../activities/visit.js';

export const FLOWS = {};
export function registerFlow(id, flow) { FLOWS[id] = flow; }
export function availableTemplates() { return new Set(Object.keys(FLOWS)); }

/** A line from the friend's style bank, ready for c.say(). */
export function sline(c, npc, key, meta = {}) {
  const l = styleLine(npc, key, { name: c.playerName, period: c.world.period });
  return l ? line(l.en, l.ja, meta) : line('OK!', 'オッケー！');
}

/** Title for cards, the results screen and the journal. */
export function eventTitle(world, inst) {
  const n = world.npc(inst.npcId)?.name || '';
  const d = inst.data || {};
  const t = (id) => world.npc(id)?.name || '';
  switch (inst.template) {
    case 'special_day': {
      const o = d.occasion || {};
      if (o.kind === 'birthday') return { en: `${n}'s birthday party`, ja: `${n}のお誕生日会`, emoji: '🎂' };
      if (o.kind === 'pet_birthday') return { en: `A party for ${n}'s ${o.petEn}`, ja: `${n}の${o.petJa}のお誕生日会`, emoji: '🎉' };
      return { en: `Celebrating with ${n}`, ja: `${n}とお祝い`, emoji: '🎉' };
    }
    case 'best_friend': return { en: `Best friends: ${n}`, ja: `${n}と親友に`, emoji: '🌟' };
    case 'delivery': return { en: `A present for ${t(d.target)}`, ja: `${t(d.target)}へのプレゼント`, emoji: '🎁' };
    case 'meet_request': return { en: `${n} meets ${t(d.target)}`, ja: `${n}と${t(d.target)}の出会い`, emoji: '🤝' };
    case 'remember': return { en: `Remembering with ${n}`, ja: `${n}との思い出`, emoji: '📸' };
    default: return FLOWS[inst.template]?.title?.(world, inst) || { en: `Time with ${n}`, ja: `${n}との時間`, emoji: TEMPLATES[inst.template]?.emoji || '⭐' };
  }
}

// ---------------------------------------------------------------- offering

/**
 * Once per conversation, after the greeting: talk about this friend's open
 * offer, or maybe offer something new. Friends who came over on their own
 * (a soft approach) always have something to say.
 */
export async function friendshipMoment(c, actor) {
  const w = c.world, npc = actor.npc;
  if (c.ended || c.result || actor.special) return;
  // The friend's own open plan with you comes first; news about other friends can wait.
  const open = F.openOffer(w.save, npc.id);
  if (open && !w.daily.asked[`pitch:${open.id}`]) {
    w.daily.asked[`pitch:${open.id}`] = true;
    if (open.status === 'scheduled') return mentionPlan(c, actor, open);
    if (open.data?.accepted) return FLOWS[open.template]?.remind?.(c, actor, open);
    return FLOWS[open.template]?.pitch(c, actor, open, { again: true });
  }
  // Classmates who became friends through you: seen together now, or telling you about it.
  if (await hangoutNow(c, actor)) return;
  if (await hangoutReport(c, actor)) return;
  if (open) return;
  const k = `ev:${npc.id}`;
  if (w.daily.asked[k]) return;
  w.daily.asked[k] = true;
  const chance = actor.approached ? 1 : Math.min(0.9, 0.35 + 0.1 * w.level(npc.id));
  if (Math.random() > chance) return;
  const rng = new RNG(`${w.cls.seed}|${w.save.id}|ev|${npc.id}|${w.day}|${w.period}`);
  const exclude = ['remember', 'find', ...Object.keys(FLOWS).filter((t) => FLOWS[t].here && !FLOWS[t].here(c, actor))];
  const t = F.pickEvent(w, npc.id, rng, { available: availableTemplates(), exclude });
  if (!t || !F.canOffer(w.save, w.day, t)) return;
  const data = FLOWS[t].prepare ? FLOWS[t].prepare(c, actor) : {};
  if (!data) return;
  const inst = F.offerEvent(w, { template: t, npcId: npc.id, data });
  c.game.save();
  await FLOWS[t].pitch(c, actor, inst, { again: false });
}

// ---------------------------------------------------------------- NPC–NPC hangouts (Phase 2)

/** Meeting a classmate during their hangout: "Hana and I play soccer together! Do you want to join us?" */
async function hangoutNow(c, actor) {
  const w = c.world, npc = actor.npc;
  const slot = w.slot(npc);
  if (!slot.hangout) return false;
  const k = `hangnow:${slot.hangout}`;
  if (w.daily.asked[k]) return false;
  w.daily.asked[k] = true;
  const other = w.npc(slot.with?.[0]);
  if (!other) return false;
  const act = joinableActivity(slot.act);
  const otherActor = c.game.npcs.actorFor(other.id);
  const canJoin = act && otherActor && !otherActor.engaged && w.free && F.playerFree(w, w.day, w.period);
  const ph = actPhrase(slot.act);
  await c.say(actor, line(`${other.name} and I ${ph.en.replace(/\bmy\b/g, 'our')} together! ${ph.emoji}`, `${other.name}といっしょに${ph.ja}よ！`, { area: 'weekly' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  if (!canJoin) {
    await c.ask([opt('fun', 'Have fun!', '楽しんでね！', { emoji: '👋', phrases: ['have fun', 'fun'], keys: [['fun', 'have']] })]);
    return true;
  }
  await c.say(actor, line('Do you want to join us?', 'いっしょにやる？', { area: 'wantto', expr: 'q.wantjoin', template: 'Do you want to join us?' }));
  const r = await c.ask([
    opt('join', 'Yes! Can I join?', 'うん！入っていい？', { emoji: '🙌', phrases: ['yes can i join', 'can i join', 'yes'], keys: YES_KEYS, area: 'wantto', expr: 'a.canjoin', template: 'Can I join?' }),
    opt('no', 'Have fun!', '楽しんでね！', { emoji: '👋', phrases: ['have fun', 'not now', 'no'], keys: NO_KEYS, tone: 'quiet' }),
  ]);
  if (r.id !== 'join') return true;
  await c.join(otherActor);
  await c.say(otherActor, sline(c, other, 'inviteYes'), { gesture: styleGesture(other, 'happy'), expr: 'happy' });
  const v = { soccer: '⚽ Soccer', catch: '⚾ Playing catch', cafe: '☕ The café' }[act];
  if (!(await confirmTime(c, `${v} with ${npc.name} and ${other.name}?`, `${npc.name}と${other.name}といっしょに？`))) return true;
  const plan = w.addPlan({ npcIds: [npc.id, other.id], day: w.day, period: w.period, loc: ACT_INFO[act].loc, act, source: 'now' });
  c.result = { then: () => c.game.activities.run(act, [actor, otherActor], { plan }) };
  return true;
}

/** After a hangout: "I played soccer with Hana yesterday! Thank you for introducing us!" */
async function hangoutReport(c, actor) {
  const w = c.world, npc = actor.npc;
  const h = hangoutToReport(w.save, npc.id, w.day);
  if (!h) return false;
  h.reported = true;
  const other = w.npc(h.a === npc.id ? h.b : h.a);
  if (!other) return false;
  const p = pastPhrase(h.act);
  const when = h.day === w.day ? { en: 'today', ja: '今日' } : F.whenWords(w.day - h.day, h.day) || { en: 'the other day', ja: 'この前' };
  const thanks = h.source === 'intro' ? ['Thank you for introducing us!', 'しょうかいしてくれてありがとう！'] : ['It was fun!', '楽しかったよ！'];
  await c.say(actor, line(`I ${p.en} with ${other.name} ${when.en}! ${thanks[0]}`, `${when.ja}、${other.name}と${p.ja}んだ！${thanks[1]}`, { area: 'weekly' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  const r = await c.ask([
    opt('next', 'Can I come next time?', '今度はわたしも行っていい？', { emoji: '🙋', phrases: ['can i come next time', 'can i come', 'next time'], keys: [['come', 'next']], area: 'wantto', expr: 'a.cancome', template: 'Can I come next time?' }),
    opt('nice', "That's great!", 'よかったね！', { emoji: '😊', phrases: ["that's great", 'great', 'nice'], keys: [['great', 'nice', 'good']] }),
  ]);
  if (r.id === 'nice') { await c.say(actor, sline(c, npc, 'celebrate'), { expr: 'happy' }); return true; }
  const act = joinableActivity(h.act) || 'catch';
  const slot = F.nextEventSlot(w, [npc.id, other.id], { fromDay: w.day + 1, fromPeriod: 0, weekendFirst: true });
  if (!slot || !w.isKnown(other.id)) { await c.say(actor, line('Sure! Come with us next time!', 'もちろん！今度いっしょに行こう！'), { expr: 'happy' }); return true; }
  const plan = w.addPlan({ npcIds: [npc.id, other.id], day: slot.day, period: slot.period, loc: ACT_INFO[act].loc, act, source: 'group' });
  plan.group = true;
  const wp = whenPhrase(w, slot);
  await c.say(actor, line(`Yes! Let's play together ${wp.en}! I'll tell ${other.name}!`, `うん！${wp.ja}いっしょに遊ぼう！${other.name}にも言っておくね！`, { area: 'weekly' }), { gesture: 'happy', expr: 'happy' });
  c.game.hud.planToast(plan);
  return true;
}

async function mentionPlan(c, actor, inst) {
  const w = c.world;
  const s = inst.slot;
  if (!s || (s.day === w.day && s.period === w.period)) return;
  const t = eventTitle(w, inst);
  const wp = whenPhrase(w, s);
  const L = LOCATIONS[s.loc] || LOCATIONS.park;
  await c.say(actor, line(`See you ${wp.en} at ${L.the}! ${t.emoji}`, `${wp.ja}${L.ja}で会おうね！`, { area: 'weekly' }), { gesture: styleGesture(actor.npc, 'happy'), expr: 'happy' });
}

/**
 * When does a period event happen? Now (free time only, after the time-cost
 * card), "How about ___?" (the next slot where both are free), or "Maybe
 * next time." (no penalty). Returns 'now' | 'later' | 'no' | 'wait'.
 */
export async function arrange(c, actor, inst, { loc, act = inst.template, nowLabel = null }) {
  const w = c.world, game = c.game, npc = actor.npc;
  const freeNow = w.free && F.playerFree(w, w.day, w.period);
  const from = freeNow ? (w.period === 0 ? { d: w.day, p: 1 } : { d: w.day + 1, p: 0 }) : { d: w.day, p: w.period };
  const later = F.nextEventSlot(w, [npc.id], { fromDay: from.d, fromPeriod: from.p });
  const opts = [];
  if (freeNow) {
    opts.push(opt('now', nowLabel?.en || "Let's go now!", nowLabel?.ja || '今から行こう！', {
      emoji: '✅', phrases: ['lets go now', 'now', 'lets go', 'yes', 'sure'], keys: [['now', 'go', 'yes', 'sure', 'ok', 'lets']], area: 'wantto', expr: 'a.lets', template: "Let's ___!",
    }));
  }
  if (later) {
    const sw = slotWords(w, later);
    opts.push(opt('later', `How about ${sw.en}?`, `${sw.ja}はどう？`, {
      emoji: '📅', phrases: [`how about ${sw.en.toLowerCase()}`, sw.en.toLowerCase()], keys: [[sw.en.split(' ')[0].toLowerCase(), 'about']], area: 'weekly', expr: 'q.howabout', template: 'How about ___?',
    }));
  }
  opts.push(opt('no', 'Maybe next time.', 'また今度ね。', { emoji: '🙂', phrases: ['maybe next time', 'next time', 'not now', 'no', 'sorry'], keys: NO_KEYS, tone: 'quiet' }));
  const r = await c.ask(opts);
  if (r.id === 'no') {
    F.declineEvent(w.save, inst.id, w.day);
    await c.say(actor, sline(c, npc, 'declineOk'), { expr: 'happy' });
    game.save();
    return 'no';
  }
  if (r.id === 'later') {
    const plan = F.scheduleEvent(w, inst.id, { ...later, loc, act });
    if (!plan) { await c.say(actor, line("Oh, that's a busy day. Let's talk again!", 'あ、その日はいそがしいね。また話そう！')); return 'no'; }
    const wp = whenPhrase(w, later);
    const L = LOCATIONS[loc];
    await c.say(actor, line(`OK! Let's meet ${wp.en} at ${L.the}!`, `うん！${wp.ja}${L.ja}で会おう！`, { area: 'weekly', expr: 'a.lets', template: "Let's meet at ___!" }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
    game.hud.planToast(plan);
    game.save();
    return 'later';
  }
  const t = eventTitle(w, inst);
  if (!(await confirmTime(c, `${t.emoji} ${t.en}?`, `${t.ja}？`))) {
    await c.say(actor, line("OK! Let's do it another time!", 'オッケー！また今度やろうね！'), { expr: 'happy' });
    return 'wait';
  }
  F.scheduleEvent(w, inst.id, { day: w.day, period: w.period, loc, act });
  c.result = { then: () => runEvent(game, actor, inst.id) };
  return 'now';
}

/** Start a scheduled or just-accepted event. */
export async function runEvent(game, actor, instanceId) {
  const w = game.world;
  const inst = F.instance(w.save, instanceId);
  if (!inst || inst.status === 'done' || !FLOWS[inst.template]?.run) return;
  const plan = inst.plan ? w.save.plans.find((p) => p.id === inst.plan) : null;
  await FLOWS[inst.template].run(game, actor, inst, plan);
}

/** The player met the friend at the planned time and place (called by planFlow). */
export async function plannedEventFlow(c, actor, plan) {
  const w = c.world;
  const inst = F.instance(w.save, plan.eventId);
  if (!inst || inst.status !== 'scheduled') return false;
  const t = eventTitle(w, inst);
  const hello = inst.template === 'home_visit'
    ? line("Hi! I'm here! 🏠 Thank you for inviting me!", '来たよ！さそってくれてありがとう！', { area: 'wantto' })
    : line(`You came! ${t.emoji} I'm so happy!`, '来てくれた！すごくうれしい！', { area: 'wantto' });
  await c.say(actor, hello, { gesture: styleGesture(actor.npc, 'happy'), expr: 'happy' });
  if (!(await confirmTime(c, `${t.emoji} ${t.en}?`, `${t.ja}？`))) {
    await c.say(actor, line("OK! I'll wait here!", 'オッケー！ここで待ってるね！'));
    return true;
  }
  c.result = { then: () => runEvent(c.game, actor, inst.id) };
  return true;
}

// ---------------------------------------------------------------- introductions (shared with talk.js)

function introFacts(w, o) {
  const facts = [];
  for (const i of [0, 1, 2]) if (w.knows(o.id, `like:${i}`)) facts.push({ kind: 'like', i });
  for (const i of [0, 1]) {
    if (!w.knows(o.id, `can:${i}`)) continue;
    facts.push({ kind: 'can', i });
    if (GOOD_AT[o.cans[i]]) facts.push({ kind: 'good', i });
  }
  if (w.knows(o.id, 'adj') && adjective(o.adjectives[0])) facts.push({ kind: 'adj' });
  return facts;
}

/**
 * The player introduces `other` to `actor` in three lines: "This is ___." →
 * "He is my friend." → a fact ("He likes ___." / "He can ___." / "He is good
 * at ___."). Both react; the two become friends.
 */
export async function playerIntro(c, actor, other) {
  const w = c.world, npc = actor.npc, o = other.npc;
  await c.join(other);
  const p = P(o);
  const lname = o.name.toLowerCase();
  await c.ask([opt('this', `This is ${o.name}.`, `こちらは${o.name}です。`, { emoji: '🤝', phrases: [`this is ${lname}`], keys: [[lname, 'this']], area: 'intro', expr: 'i.thisis', template: 'This is ___.' })]);
  await c.ask([opt('friend', `${p.S} is my friend.`, '友達なんだ。', { emoji: '🧑‍🤝‍🧑', phrases: [`${p.s.toLowerCase()} is my friend`, 'my friend'], keys: [['friend']], area: 'intro', expr: 'i.friend', template: 'He/She is my friend.' })]);
  const facts = introFacts(w, o).sort(() => Math.random() - 0.5).slice(0, 3);
  const cards = facts.map((f) => {
    if (f.kind === 'like') { const it = interest(o.likes[f.i]); return opt(`l${f.i}`, `${p.S} likes ${it.en}.`, `${it.ja}が好きなんだ。`, { emoji: it.emoji, keys: [[it.en.replace(/^the /, '').split(' ').pop()]], area: 'intro', expr: 'i.likes', template: 'He/She likes ___.' }); }
    if (f.kind === 'can') { const a = ability(o.cans[f.i]); return opt(`c${f.i}`, `${p.S} can ${a.en}.`, `${a.ja}んだ。`, { emoji: a.emoji, keys: [[a.en.split(' ')[0]]], area: 'intro', expr: 'i.can', template: 'He/She can ___.' }); }
    if (f.kind === 'good') { const g = GOOD_AT[o.cans[f.i]]; return opt(`g${f.i}`, `${p.S} is good at ${g.en}.`, `${g.ja}がとくいなんだ。`, { emoji: '⭐', keys: [['good'], [g.en.split(' ').pop()]], area: 'intro', expr: 'i.goodat', template: 'He/She is good at ___.' }); }
    const a = adjective(o.adjectives[0]);
    return opt('adj', `${p.S} is ${a.en}.`, `${a.ja}んだよ。`, { emoji: '😊', keys: [[a.en]], area: 'adjectives', expr: 'i.adj', template: 'He/She is (kind/funny/…).' });
  });
  const said = cards.length ? await c.ask(cards) : null;
  await c.say(other, line(`Hi! I'm ${o.name}. Nice to meet you!`, `こんにちは！${o.name}です。よろしくね！`, { area: 'selfintro' }), { gesture: 'wave', expr: 'happy' });
  let react = line(`Nice to meet you, ${o.name}!`, `よろしくね、${o.name}！`);
  if (said?.id.startsWith('l')) {
    const it = interest(o.likes[Number(said.id.slice(1))]);
    react = npc.likes.includes(it.id)
      ? line(`You like ${it.en}? Me too! I'm ${npc.name}.`, `${it.ja}が好きなの？わたしも！${npc.name}だよ。`, { area: 'selfintro' })
      : line(`You like ${it.en}? Cool! I'm ${npc.name}.`, `${it.ja}が好きなんだ！いいね！${npc.name}だよ。`);
  } else if (said?.id.startsWith('c')) {
    const a = ability(o.cans[Number(said.id.slice(1))]);
    react = line(`You can ${a.en}? Wow! I'm ${npc.name}.`, `${a.ja}の？すごい！${npc.name}だよ。`);
  } else if (said?.id.startsWith('g')) {
    const g = GOOD_AT[o.cans[Number(said.id.slice(1))]];
    react = line(`You're good at ${g.en}? Cool! I'm ${npc.name}.`, `${g.ja}がとくいなの？かっこいい！${npc.name}だよ。`);
  }
  await c.say(actor, react, { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  await c.say(other, line('Nice to meet you, too!', 'こちらこそ、よろしく！'), { gesture: 'happy', expr: 'happy' });
  w.connect(npc.id, o.id, 1, 'intro');
  w.xp(npc.id, 4, { key: `pintro:${o.id}`, reason: 'intro' });
  w.xp(o.id, 4, { key: `pintro:${npc.id}`, reason: 'intro' });
  c.game.hud.toast({ icon: '🤝', en: `${npc.name} and ${o.name} are friends now!`, ja: `${npc.name}と${o.name}が友達になった！` });
  await c.leave(other);
  return said;
}

// ---------------------------------------------------------------- special day (birthday / good news)

function occasionLine(w, o) {
  const diff = o.day - w.day;
  const D = DAYS[dow(o.day)];
  const fut = diff === 1 ? { en: 'tomorrow', ja: 'あした' } : { en: `on ${D.en}`, ja: `${D.ja}` };
  const past = diff === -1 ? { en: 'yesterday', ja: 'きのう' } : { en: `on ${D.en}`, ja: `${D.ja}` };
  if (o.kind === 'birthday') {
    if (diff === 0) return line('Today is my birthday! 🎂', '今日はわたしの誕生日なんだ！', { area: 'selfintro', expr: 'a.birthday', template: 'My birthday is ___.' });
    if (diff > 0) return line(`My birthday is ${fut.en}! 🎂`, `わたしの誕生日は${fut.ja}なんだ！`, { area: 'selfintro', expr: 'a.birthday', template: 'My birthday is ___.' });
    return line(`My birthday was ${past.en}! 🎂`, `わたしの誕生日は${past.ja}だったんだ！`, { area: 'selfintro' });
  }
  if (o.kind === 'pet_birthday') {
    if (diff === 0) return line(`Today is my ${o.petEn}'s birthday! 🎉`, `今日はうちの${o.petJa}の誕生日なんだ！`, { area: 'possessions' });
    if (diff > 0) return line(`My ${o.petEn}'s birthday is ${fut.en}! 🎉`, `うちの${o.petJa}の誕生日は${fut.ja}なんだ！`, { area: 'possessions' });
    return line(`My ${o.petEn}'s birthday was ${past.en}! 🎉`, `うちの${o.petJa}の誕生日は${past.ja}だったんだ！`, { area: 'possessions' });
  }
  return line(`I got a new ${o.thing.en}! ${o.thing.emoji} I'm so happy!`, `新しい${o.thing.ja}をもらったんだ！すごくうれしい！`, { area: 'possessions' });
}

registerFlow('special_day', {
  prepare(c, actor) {
    const o = F.occasionFor(actor.npc, c.world.cls.seed, c.world.day);
    return o ? { occasion: o } : null;
  },
  async pitch(c, actor, inst) {
    const w = c.world, npc = actor.npc, o = inst.data.occasion;
    await c.say(actor, occasionLine(w, o), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
    if (o.kind === 'birthday') w.learn(npc.id, 'birthday');
    const resp = o.kind === 'birthday'
      ? opt('hb', 'Happy birthday!', 'お誕生日おめでとう！', { emoji: '🎂', phrases: ['happy birthday'], keys: [['birthday', 'happy']] })
      : o.kind === 'pet_birthday'
        ? opt('hb', `Happy birthday to your ${o.petEn}!`, `${o.petJa}、お誕生日おめでとう！`, { emoji: '🎉', phrases: ['happy birthday'], keys: [['birthday', 'happy']] })
        : opt('great', "Wow, that's great!", 'わあ、よかったね！', { emoji: '🎉', phrases: ["that's great", 'great', 'wow', 'cool'], keys: [['great', 'wow', 'cool', 'nice']] });
    await c.ask([resp]);
    await c.say(actor, sline(c, npc, 'thanks'), { expr: 'happy' });
    const r = await c.ask([
      opt('party', "Let's have a party at the café!", 'カフェでパーティーをしよう！', { emoji: '🎉', phrases: ["let's have a party", 'party', 'lets celebrate', 'cafe'], keys: [['party', 'cafe', 'celebrate']], area: 'wantto', expr: 'a.lets', template: "Let's ___!" }),
      opt('nice', 'Have a great day!', 'すてきな一日をね！', { emoji: '🙂', phrases: ['have a great day', 'have a nice day'], keys: [['day', 'great', 'nice']], tone: 'quiet' }),
    ]);
    if (r.id === 'nice') {
      F.declineEvent(w.save, inst.id, w.day);
      await c.say(actor, line('Thank you! You too!', 'ありがとう！あなたもね！'), { expr: 'happy' });
      return;
    }
    await c.say(actor, line('A party for me? Yay! When?', 'わたしのためにパーティー？やったー！いつにする？', { area: 'weekly' }), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
    await arrange(c, actor, inst, { loc: 'cafe', act: 'cafe' });
  },
  run: (game, actor, inst, plan) => game.activities.run('cafe', [actor], { plan, event: inst, variant: { celebrate: inst.data.occasion } }),
});

// ---------------------------------------------------------------- best friend (Lv5 milestone)

registerFlow('best_friend', {
  async pitch(c, actor, inst) {
    await c.say(actor, line(`${c.playerName}, I have a special place in the park. I want to show you!`, `${c.playerName}、公園にとっておきの場所があるんだ。見せたいな！`, { area: 'wantto' }), { gesture: styleGesture(actor.npc, 'happy'), expr: 'happy' });
    await arrange(c, actor, inst, { loc: 'park', act: 'best_friend', nowLabel: { en: "Let's go!", ja: '行こう！' } });
  },
  run: (game, actor, inst, plan) => game.activities.runMilestone(actor, inst, plan),
});

// ---------------------------------------------------------------- delivery (a present for a mutual friend)

registerFlow('delivery', {
  prepare(c, actor) {
    const cands = F.sharedFriends(c.world, actor.npc.id);
    if (!cands.length) return null;
    const t = cands[Math.floor(Math.random() * cands.length)];
    return { target: t.id, present: F.presentFor(t) };
  },
  async pitch(c, actor, inst) {
    const w = c.world, npc = actor.npc, t = w.npc(inst.data.target), pr = inst.data.present;
    if (!t) { F.declineEvent(w.save, inst.id, w.day); return; }
    const p = P(t);
    await c.say(actor, line(`${c.playerName}, can you help me? I have a present for ${t.name}. ${pr.emoji}`, `${c.playerName}、手伝ってくれる？${t.name}へのプレゼントがあるんだ。`, { area: 'possessions' }), { gesture: 'hold', expr: 'happy' });
    await c.say(actor, line(`Can you give it to ${p.o}, please?`, `${t.name}にわたしてくれる？`, { area: 'possessions' }));
    const r = await c.ask([
      opt('yes', 'Sure! I can do it!', 'いいよ！まかせて！', { emoji: '🙋', phrases: ['sure', 'i can do it', 'yes', 'ok'], keys: YES_KEYS, area: 'verbs', expr: 'a.can', template: 'I can ___.' }),
      opt('no', 'Sorry, not today.', 'ごめん、今日はむり。', { emoji: '🙏', phrases: ['sorry', 'not today', 'no'], keys: NO_KEYS, tone: 'quiet' }),
    ]);
    if (r.id === 'no') {
      F.declineEvent(w.save, inst.id, w.day);
      await c.say(actor, sline(c, npc, 'declineOk'), { expr: 'happy' });
      return;
    }
    inst.data.accepted = true;
    inst.day = w.day;
    const it = pr.like ? interest(pr.like) : null;
    await c.say(actor, it
      ? line(`Thank you! It's ${presentPhrase(pr)}. ${p.S} likes ${it.en}!`, `ありがとう！${pr.ja}だよ。${t.name}は${it.ja}が好きなんだ！`, { area: 'intro', expr: 'i.likes', template: 'He/She likes ___.' })
      : line(`Thank you! It's ${presentPhrase(pr)}!`, `ありがとう！${pr.ja}だよ！`), { gesture: 'hold', expr: 'happy' });
    const li = pr.like ? t.likes.indexOf(pr.like) : -1;
    if (li >= 0) w.learn(t.id, `like:${li}`);
    c.game.hud.toast({ icon: '🎁', en: `Give the ${pr.en} to ${t.name}!`, ja: `${pr.ja}を${t.name}にわたそう！` });
    c.game.hud.refresh();
    c.game.save();
  },
  async remind(c, actor, inst) {
    const t = c.world.npc(inst.data.target);
    if (t) await c.say(actor, line(`Please give the present to ${t.name}! 🎁 Thank you!`, `${t.name}へのプレゼント、よろしくね！`), { expr: 'happy' });
  },
});

/** Talking to the person a present is for: hand it over. Returns true if it happened. */
export async function deliveryHandoff(c, actor) {
  const w = c.world, npc = actor.npc;
  const inst = F.openOffers(w.save).find((i) => i.template === 'delivery' && i.data?.accepted && i.data.target === npc.id);
  const giver = inst && w.npc(inst.npcId);
  if (!giver) return false;
  const pr = inst.data.present;
  await c.ask([opt('give', `This is from ${giver.name}. Here you are!`, `${giver.name}からだよ。はい、どうぞ！`, {
    emoji: pr.emoji, phrases: [`this is from ${giver.name.toLowerCase()}`, 'here you are', 'here you go', 'this is for you'], keys: [['here', 'from', 'for']], area: 'food', expr: 'a.hereyouare', template: 'Here you are.',
  })]);
  sfx.discover();
  await c.say(actor, line(`For me? Wow, ${presentPhrase(pr)}! ${pr.emoji}`, `わたしに？わあ、${pr.ja}だ！`), { gesture: 'surprised', expr: 'happy' });
  if (pr.like && npc.likes.includes(pr.like)) {
    await c.say(actor, line(`I like ${interest(pr.like).en}! Thank you!`, `${interest(pr.like).ja}、大好きなんだ！ありがとう！`, { area: 'selfintro', expr: 'a.like' }), { expr: 'happy' });
  }
  const r = await c.ask([
    opt('kind', `${giver.name} is kind!`, `${giver.name}はやさしいね！`, { emoji: '😊', phrases: [`${giver.name.toLowerCase()} is kind`, 'is kind', 'kind'], keys: [['kind']], area: 'adjectives', expr: 'i.adj', template: 'He/She is kind.' }),
    opt('welcome', "You're welcome!", 'どういたしまして！', { emoji: '🙂', phrases: ["you're welcome", 'you are welcome', 'welcome'], keys: [['welcome']] }),
  ]);
  if (r.id === 'kind') await c.say(actor, line(`Yes! ${giver.name} is my good friend.`, `うん！${giver.name}はなかよしなんだ。`, { area: 'intro' }), { expr: 'happy' });
  const what = pr.en === 'card' ? 'our card' : 'my present';
  F.completeEvent(w, inst.id, {
    links: [[giver.id, npc.id, 2]],
    detail: { target: npc.id, present: pr.en, recall: { en: `You gave ${what} to ${npc.name}`, ja: `${npc.name}に${pr.en === 'card' ? 'カード' : 'プレゼント'}をわたしてくれたね` } },
  });
  w.xp(npc.id, 2, { key: `got-present:${inst.id}`, reason: 'present' });
  w.addSouvenir('present', giver.id);
  w.queueEvening({ type: 'thanks', from: giver.id, en: `${npc.name} liked the present! Thank you, ${c.playerName}! 🎁`, ja: `${npc.name}、プレゼントをよろこんでたよ！ありがとう！` });
  c.game.hud.toast({ icon: '🎁', en: `You gave the present to ${npc.name}!`, ja: `${npc.name}にプレゼントをわたした！` });
  c.game.hud.refresh();
  return true;
}

// ---------------------------------------------------------------- hobby (the friend's favourite thing)

const HOBBY_PITCH = {
  'hobby:draw': () => ['Do you want to draw pictures with me?', 'いっしょに絵をかかない？', '🎨'],
  'hobby:spot': (like) => (like === 'bugs' ? ['Do you want to look for bugs with me?', 'いっしょに虫をさがさない？', '🐞'] : ['Do you want to look for animals in the park?', '公園で動物をさがさない？', '🐦']),
  'hobby:music': (like) => (like === 'dancing' ? ['Do you want to dance with me?', 'いっしょにおどらない？', '💃'] : like === 'singing' ? ['Do you want to sing songs with me?', 'いっしょに歌わない？', '🎤'] : ['Do you want to play music with me?', 'いっしょに音楽をしない？', '🎵']),
  soccer: () => ['Do you want to play soccer with me?', 'いっしょにサッカーしない？', '⚽'],
  catch: () => ['Do you want to play catch with me?', 'いっしょにキャッチボールしない？', '⚾'],
  cafe: (like) => (like === 'reading' ? ['Do you want to read books at the café?', 'カフェで本を読まない？', '📚'] : ['Do you want to go to the café with me?', 'いっしょにカフェに行かない？', '☕']),
};

/** Where an activity happens; drawing and music move into the café when it rains. */
function placeFor(act, weather) {
  if (act === 'cafe') return 'cafe';
  if ((act === 'hobby:draw' || act === 'hobby:music' || act === 'project') && weather === 'rainy') return 'cafe';
  return 'park';
}

registerFlow('hobby', {
  prepare(c, actor) {
    const o = F.hobbyOptions(actor.npc, c.world.weather)[0];
    return o ? { act: o.act, like: o.like, direct: o.direct } : null;
  },
  title(world, inst) {
    const n = world.npc(inst.npcId)?.name || '';
    const { act, like } = inst.data;
    if (act === 'hobby:draw') return { en: `Drawing with ${n}`, ja: `${n}とお絵かき`, emoji: '🎨' };
    if (act === 'hobby:spot') return like === 'bugs' ? { en: `Bug hunting with ${n}`, ja: `${n}と虫さがし`, emoji: '🐞' } : { en: `Animal watching with ${n}`, ja: `${n}と動物さがし`, emoji: '🐦' };
    if (act === 'hobby:music') return like === 'dancing' ? { en: `Dancing with ${n}`, ja: `${n}とダンス`, emoji: '💃' } : { en: `Music time with ${n}`, ja: `${n}と音楽`, emoji: '🎵' };
    const info = { soccer: ['Soccer', 'サッカー', '⚽'], catch: ['Playing catch', 'キャッチボール', '⚾'], cafe: ['Café time', 'カフェ', '☕'] }[act] || ['Fun time', '楽しい時間', '⭐'];
    return { en: `${info[0]} with ${n}`, ja: `${n}と${info[1]}`, emoji: info[2] };
  },
  async pitch(c, actor, inst, { again }) {
    const npc = actor.npc, d = inst.data;
    const [en, ja, emoji] = (HOBBY_PITCH[d.act] || HOBBY_PITCH.cafe)(d.like);
    if (!again) await c.say(actor, sline(c, npc, 'invitePre'), { gesture: styleGesture(npc, 'greet'), expr: 'happy' });
    const it = d.like && d.direct ? interest(d.like) : null;
    await c.say(actor, line(`${it ? `I love ${it.en}! ` : ''}${en} ${emoji}`, `${it ? `${it.ja}が大好きなんだ！` : ''}${ja}`, { area: 'wantto', expr: 'q.wantto', template: 'Do you want to ___?' }), { expr: 'happy' });
    await arrange(c, actor, inst, { loc: placeFor(d.act, c.world.weather), act: d.act.startsWith('hobby:') ? 'hobby' : d.act, nowLabel: { en: "Yes! Let's go now!", ja: 'うん！今から行こう！' } });
  },
  run(game, actor, inst, plan) {
    const { act, like } = inst.data;
    if (act.startsWith('hobby:')) return game.activities.run('hobby', [actor], { plan, event: inst, play: (g, as) => playHobby(g, as, { variant: act.slice(6), like }) });
    return game.activities.run(act, [actor], { plan, event: inst, like });
  },
});

// ---------------------------------------------------------------- practice (help a friend get better)

registerFlow('practice', {
  prepare(c, actor) {
    const o = F.practiceOptions(actor.npc)[0];
    return o ? { act: o.act, like: o.like } : null;
  },
  title(world, inst) { const n = world.npc(inst.npcId)?.name || ''; return { en: `Practice with ${n}`, ja: `${n}と練習`, emoji: '💪' }; },
  async pitch(c, actor, inst) {
    const d = inst.data;
    const want = d.act === 'hobby:music'
      ? (d.like === 'dancing' ? ['dance well', 'じょうずにおどれるようになりたい'] : d.like === 'singing' ? ['sing well', 'じょうずに歌えるようになりたい'] : ['play music well', '楽器がじょうずになりたい'])
      : d.act === 'soccer' ? ['stop the ball well', 'ボールをうまく止めたい'] : ['catch the ball well', 'ボールをうまくキャッチしたい'];
    await c.say(actor, line(`${c.playerName}, can you help me? I want to ${want[0]}.`, `${c.playerName}、手伝ってくれる？${want[1]}んだ。`, { area: 'wantto', expr: 'a.wantto', template: 'I want to ___.' }), { gesture: styleGesture(actor.npc, 'think'), expr: 'happy' });
    await c.say(actor, line("Let's practice together!", 'いっしょに練習しよう！', { area: 'verbs' }));
    await arrange(c, actor, inst, { loc: placeFor(d.act, c.world.weather), act: 'practice', nowLabel: { en: "Sure! Let's practice now!", ja: 'いいよ！今から練習しよう！' } });
  },
  run(game, actor, inst, plan) {
    const { act, like } = inst.data;
    const variant = act === 'hobby:music' ? 'music' : 'ball';
    return game.activities.run('practice', [actor], { plan, event: inst, play: (g, as) => playHobby(g, as, { variant, like, practice: true, soccer: act === 'soccer' }) });
  },
});

// ---------------------------------------------------------------- project (a card for a mutual friend)

registerFlow('project', {
  prepare(c, actor) {
    const cands = F.sharedFriends(c.world, actor.npc.id);
    if (!cands.length) return null;
    return { recipient: cands[Math.floor(Math.random() * cands.length)].id };
  },
  title(world, inst) { const r = world.npc(inst.data.recipient)?.name || ''; return { en: `A card for ${r}`, ja: `${r}へのカード`, emoji: '💌' }; },
  async pitch(c, actor, inst) {
    const w = c.world, r = w.npc(inst.data.recipient);
    if (!r) { F.declineEvent(w.save, inst.id, w.day); return; }
    const adj = adjective(r.adjectives[0]);
    await c.say(actor, line(`${c.playerName}, I have an idea! Let's make a card for ${r.name}!`, `${c.playerName}、いいこと思いついた！${r.name}にカードを作ろう！`, { area: 'wantto' }), { gesture: styleGesture(actor.npc, 'think'), expr: 'happy' });
    if (adj) await c.say(actor, line(`${r.name} is my friend. ${P(r).S} is ${adj.en}!`, `${r.name}は友達なんだ。${adj.ja}んだよ！`, { area: 'adjectives', expr: 'i.adj', template: 'He/She is (kind/funny/…).' }));
    await arrange(c, actor, inst, { loc: placeFor('project', w.weather), act: 'project' });
  },
  run(game, actor, inst, plan) {
    return game.activities.run('project', [actor], { plan, event: inst, play: (g, as) => playHobby(g, as, { variant: 'draw', project: { recipient: inst.data.recipient } }) });
  },
  /** The card still has to reach its friend: the player carries it (a delivery). */
  after(game, inst) {
    const w = game.world, r = w.npc(inst.data.recipient);
    if (!r) return;
    F.offerEvent(w, { template: 'delivery', npcId: inst.npcId, data: { target: r.id, present: { like: null, a: 'a', en: 'card', ja: 'カード', emoji: '💌' }, accepted: true, fromProject: true } });
    game.hud.toast({ icon: '💌', en: `Give the card to ${r.name}!`, ja: `${r.name}にカードをわたそう！` });
  },
});

// ---------------------------------------------------------------- home visit (Phase 3)

registerFlow('home_visit', {
  title(world, inst) { const n = world.npc(inst.npcId)?.name || ''; return { en: `${n} comes to your house`, ja: `${n}が家に遊びに来る`, emoji: '🏠' }; },
  async pitch(c, actor, inst, { again, invited = false } = {}) {
    if (!invited) await c.say(actor, line(`${c.playerName}, can I come to your house? I want to see your room!`, `${c.playerName}、家に遊びに行ってもいい？部屋を見てみたいな！`, { area: 'wantto', expr: 'q.cancome', template: 'Can I come to your house?' }), { gesture: styleGesture(actor.npc, 'happy'), expr: 'happy' });
    await arrange(c, actor, inst, { loc: 'home', act: 'visit', nowLabel: { en: "Sure! Let's go now!", ja: 'いいよ！今から行こう！' } });
  },
  run: (game, actor, inst, plan) => game.activities.run('visit', [actor], { plan, event: inst, play: (g, as) => playVisit(g, as[0]) }),
});

/** "Do you want to come to my house?" — the player invites a close friend (talk.js topic). */
export async function inviteHome(c, actor) {
  const w = c.world;
  const inst = F.offerEvent(w, { template: 'home_visit', npcId: actor.npc.id, data: { invitedBy: 'player' } });
  await c.say(actor, line('Your house? Yes! I want to see your room!', 'あなたの家？うん！部屋を見てみたい！', { area: 'wantto' }), { gesture: styleGesture(actor.npc, 'happy'), expr: 'happy' });
  await FLOWS.home_visit.pitch(c, actor, inst, { invited: true });
}

// ---------------------------------------------------------------- meet request ("Can you introduce us?")

function presentTargets(c, actor) {
  const ids = new Set(F.meetTargets(c.world, actor.npc.id).map((n) => n.id));
  return c.game.npcs.nearby(actor, 14).filter((o) => ids.has(o.npc.id) && !o.engaged && !o.special);
}

registerFlow('meet_request', {
  here: (c, actor) => presentTargets(c, actor).length > 0,
  prepare(c, actor) {
    const t = presentTargets(c, actor)[0];
    return t ? { target: t.npc.id } : null;
  },
  async pitch(c, actor, inst) {
    const w = c.world, npc = actor.npc;
    const other = c.game.npcs.actorFor(inst.data.target);
    if (!other || other.engaged || !c.game.npcs.nearby(actor, 16).includes(other)) {
      F.declineEvent(w.save, inst.id, w.day);
      return;
    }
    const t = other.npc;
    await c.say(actor, line(`${c.playerName}, who is that? Can you introduce us?`, `${c.playerName}、あの子はだれ？しょうかいしてくれる？`, { area: 'intro' }), { gesture: 'point' });
    const r = await c.ask([
      opt('yes', `Sure! ${t.name}! Come here!`, `いいよ！${t.name}、こっちに来て！`, { emoji: '👋', phrases: [`${t.name.toLowerCase()} come here`, 'come here', 'sure', 'ok'], keys: [['come', 'sure', 'yes', 'ok', t.name.toLowerCase()]], area: 'intro' }),
      opt('no', 'Maybe next time.', 'また今度ね。', { emoji: '🙂', phrases: ['maybe next time', 'next time', 'no'], keys: NO_KEYS, tone: 'quiet' }),
    ]);
    if (r.id === 'no') {
      F.declineEvent(w.save, inst.id, w.day);
      await c.say(actor, sline(c, npc, 'declineOk'));
      return;
    }
    await playerIntro(c, actor, other);
    F.completeEvent(w, inst.id, { detail: { target: t.id, recall: { en: `You introduced me to ${t.name}`, ja: `${t.name}をしょうかいしてくれたね` } } });
    await c.say(actor, sline(c, npc, 'thanks'), { expr: 'happy' });
  },
});
