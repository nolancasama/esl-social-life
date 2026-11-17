// Group outings (template group_outing, Phase 2). The player plans an outing
// with up to three friends from the phone ("Make a plan"): where, what, when,
// who. Each friend checks whether they are free and says why when they are
// not (lessons, grandparents, other plans) — a polite "no" never costs
// anything. Friends can also be invited along in person (talk.js).
// Group time gives every friend some connection and makes them closer to each
// other, but only one-on-one time opens the next level (DESIGN_DECISIONS
// 2026-11-16).

import { opt } from './runner.js';
import { NO_KEYS } from './intent.js';
import { slotWords } from './common.js';
import { DAYS } from '../data/content.js';
import { styleLine } from '../world/personality.js';
import { playerFree } from '../world/friendship.js';
import { hangoutFor } from '../world/social.js';
import { dow } from '../world/time.js';

const WHERE = [
  { id: 'park', en: "Let's go to the park!", ja: '公園に行こう！', emoji: '🌸' },
  { id: 'cafe', en: "Let's go to the café!", ja: 'カフェに行こう！', emoji: '☕' },
];
const WHAT = [
  { id: 'soccer', en: 'I want to play soccer.', ja: 'サッカーをしたい。', emoji: '⚽' },
  { id: 'catch', en: 'I want to play catch.', ja: 'キャッチボールをしたい。', emoji: '⚾' },
];

/** Why a friend can't come at (day, period); null when they can. */
export function busyReason(world, npc, day, period) {
  const D = DAYS[dow(day)];
  if (world.save.plans.some((p) => p.status === 'pending' && p.day === day && p.period === period && p.npcIds.includes(npc.id))) {
    return { en: 'Sorry, I have plans then.', ja: 'ごめん、その時は約束があるんだ。' };
  }
  const h = hangoutFor(world.save, npc.id, day, period);
  if (h) {
    const other = world.npc(h.a === npc.id ? h.b : h.a);
    return { en: `Sorry, I'm meeting ${other?.name || 'a friend'} then.`, ja: `ごめん、その時は${other?.name || '友達'}と会うんだ。` };
  }
  const act = npc.schedule[dow(day)][period].act;
  if (act === 'away:pianolesson') return { en: `Sorry, I have piano lessons on ${D.plural}.`, ja: `ごめん、${D.ja}はピアノ教室なんだ。` };
  if (act === 'away:swim') return { en: `Sorry, I go swimming on ${D.plural}.`, ja: `ごめん、${D.ja}は水泳に行くんだ。` };
  if (act === 'away:grandparents') return { en: "Sorry, I'm going to my grandparents' house.", ja: 'ごめん、おじいちゃんとおばあちゃんの家に行くんだ。' };
  if (act === 'away:library') return { en: "Sorry, I'm going to the library.", ja: 'ごめん、図書館に行くんだ。' };
  return null;
}

/** The next free slots for the player (not now; "now" happens in person). */
function upcomingSlots(w, n = 3) {
  const out = [];
  for (let d = w.day; d < w.day + 8 && out.length < n; d++) {
    for (const p of [0, 1]) {
      if (d === w.day && p <= w.period) continue;
      if (playerFree(w, d, p)) out.push({ day: d, period: p });
      if (out.length >= n) break;
    }
  }
  return out;
}

/**
 * Plan a group outing from the phone. Returns the plan, or null when nobody
 * could come (or there was no one to invite yet).
 */
export async function planOuting(game) {
  const w = game.world;
  const friends = w.npcs.filter((n) => w.level(n.id) >= 2);
  if (!friends.length) {
    game.hud.toast({ icon: '💌', en: 'Make some friends first! Talk with your classmates.', ja: 'まずは友達を作ろう！クラスメートと話してみよう。' });
    return null;
  }
  game.setMode('talk');
  game.player.stop();
  const ui = game.dialogue;
  const me = { name: '📅', color: '#FF7A59' };
  const ask = async (en, ja, options) => {
    const r = await ui.choose(options, { prompt: { ...me, en, ja } });
    const o = r.option;
    w.logLine({ expr: o.expr, area: o.area, template: o.template, en: o.en, ja: o.ja }, 'said');
    if (r.via === 'speech') w.logLine({ expr: o.expr, area: o.area, template: o.template, en: o.en, ja: o.ja }, 'spoken');
    return o;
  };
  try {
    let where = await ask('Where do you want to go?', 'どこに行きたい？', WHERE.map((x) => opt(x.id, x.en, x.ja, { emoji: x.emoji, keys: [[x.id === 'cafe' ? 'cafe' : 'park']], phrases: [x.en.toLowerCase(), x.id], area: 'wantto', expr: 'a.letsgo', template: "Let's go to the ___!" })));
    let act = 'cafe';
    if (where.id === 'park') {
      const what = await ask('What do you want to do?', '何をしたい？', WHAT.map((x) => opt(x.id, x.en, x.ja, { emoji: x.emoji, keys: [[x.id]], phrases: [x.en.toLowerCase(), x.id], area: 'wantto', expr: 'a.wantto', template: 'I want to ___.' })));
      act = what.id;
    }
    const slots = upcomingSlots(w);
    if (!slots.length) { game.hud.toast({ icon: '📅', en: 'Your calendar is full this week!', ja: '今週は予定がいっぱい！' }); return null; }
    const when = await ask('When?', 'いつにする？', slots.map((s, i) => {
      const sw = slotWords(w, s);
      return opt(`w${i}`, `How about ${sw.en}?`, `${sw.ja}はどう？`, { emoji: '📅', keys: [[sw.en.split(' ')[0].toLowerCase()]], phrases: [`how about ${sw.en.toLowerCase()}`, sw.en.toLowerCase()], area: 'weekly', expr: 'q.howabout', template: 'How about ___?' });
    }));
    const slot = slots[Number(when.id.slice(1))];
    let loc = where.id;
    if (loc === 'park' && w.weatherOn(slot.day) === 'rainy') {
      await ui.say({ ...me, name: '☔', en: "It will be rainy. Let's go to the café!", ja: '雨みたい。カフェに行こう！', auto: 1800 });
      loc = 'cafe'; act = 'cafe';
    }
    // Who: up to three friends, one at a time.
    const invited = [];
    for (let k = 0; k < 3; k++) {
      const pool = friends.filter((n) => !invited.includes(n)).sort(() => Math.random() - 0.5).slice(0, 3);
      if (!pool.length) break;
      const opts = pool.map((n) => opt(n.id, `${n.name}, do you want to come?`, `${n.name}、いっしょに来る？`, { emoji: '💌', keys: [[n.name.toLowerCase()]], phrases: [`${n.name.toLowerCase()} do you want to come`, n.name.toLowerCase()], area: 'wantto', expr: 'q.wantcome', template: 'Do you want to come?' }));
      if (k >= 1) opts.push(opt('done', "That's all!", 'これで全員！', { emoji: '✅', keys: [['all', 'done', 'ok']], phrases: ["that's all", 'done'], tone: 'go' }));
      const pick = await ask(k === 0 ? 'Who do you want to invite?' : 'Invite one more friend?', k === 0 ? 'だれをさそう？' : 'もう一人さそう？', opts);
      if (pick.id === 'done') break;
      invited.push(w.npc(pick.id));
    }
    // Replies.
    const yes = [];
    for (const n of invited) {
      const why = busyReason(w, n, slot.day, slot.period);
      const l = why || styleLine(n, 'inviteYes', { name: w.save.player.name });
      await ui.say({ name: n.name, color: n.color, en: l.en, ja: l.ja, voiceOpts: n.voice, auto: 0 });
      w.logLine({ expr: why ? 'a.sorry' : 'a.sure', area: 'wantto', en: l.en }, 'heard');
      if (!why) yes.push(n);
    }
    ui.close();
    if (!yes.length) {
      game.hud.toast({ icon: '🙂', en: 'Nobody is free then. Try another day!', ja: 'その日はみんないそがしいみたい。ほかの日にしよう！' });
      return null;
    }
    const plan = w.addPlan({ npcIds: yes.map((n) => n.id), day: slot.day, period: slot.period, loc, act, source: 'group' });
    plan.group = yes.length >= 2;
    game.hud.planToast(plan);
    game.save();
    return plan;
  } finally {
    ui.close();
    game.setMode('explore');
  }
}

/** Cards for "Maybe next time" in group flows. */
export const nextTimeCard = () => opt('no', 'Maybe next time.', 'また今度ね。', { emoji: '🙂', phrases: ['maybe next time', 'next time', 'no'], keys: NO_KEYS, tone: 'quiet' });
