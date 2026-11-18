// Helpers shared by the talk flows (talk.js) and the friendship event flows
// (events.js): activity verbs, Japanese verb forms, time words and the
// "this uses your time" confirmation.

import { opt } from './runner.js';
import { YES_KEYS, NO_KEYS } from './intent.js';
import { DAYS } from '../data/content.js';
import { dow, isWeekend } from '../world/time.js';

export function actVerb(act, like) {
  if (act === 'mall') return { en: 'go to Niji Mall', ja: 'にじモールに行く', emoji: '🛍️' };
  if (act === 'soccer') return { en: 'play soccer', ja: 'サッカーをする', emoji: '⚽' };
  if (act === 'cafe') return { en: 'go to the café', ja: 'カフェに行く', emoji: '☕' };
  if (like === 'baseball') return { en: 'play catch', ja: 'キャッチボールをする', emoji: '⚾' };
  if (like === 'basketball') return { en: 'play catch', ja: 'キャッチボールをする', emoji: '🏀' };
  return { en: 'play catch', ja: 'キャッチボールをする', emoji: '⚾' };
}

export const jaLets = (ja) => ja.replace(/する$/, 'しよう').replace(/行く$/, '行こう');
export const jaWant = (ja) => ja.replace(/する$/, 'したい').replace(/行く$/, '行きたい');
export const jaInvite = (ja) => ja.replace(/する$/, 'しない？').replace(/行く$/, '行かない？');

export function periodWord(world) { return world.weekend ? (world.period === 0 ? 'Morning' : 'Afternoon') : 'After School'; }

/** Show the time cost before a period activity starts. Resolves true for "Let's go!". */
export async function confirmTime(c, en, ja) {
  const w = c.world;
  const next = w.weekend && w.period === 0 ? { en: 'Afternoon', ja: '午後' } : { en: 'Evening', ja: '夜' };
  const r = await c.ask([
    opt('go', "Let's go!", '行こう！', { emoji: '✅', phrases: ['lets go', 'yes', 'ok', 'lets play', 'sure'], keys: YES_KEYS, tone: 'go' }),
    opt('no', 'Not now.', '今はやめておく。', { emoji: '✋', phrases: ['not now', 'no', 'later'], keys: NO_KEYS, tone: 'quiet' }),
  ], { banner: { icon: '⏳', en: `${en}  It uses your ${periodWord(w)} time → ${next.en}`, ja: `${ja}（${periodWord(w) === 'After School' ? '放課後' : w.period === 0 ? '朝' : '午後'}の時間を使います）` }, silent: false });
  return r.id === 'go';
}

/** "tomorrow" / "Saturday" / "later today" for a free slot. */
export function slotWords(w, slot) {
  if (slot.day === w.day) {
    if (slot.period === w.period) return { en: 'now', ja: '今' };
    return isWeekend(slot.day) ? { en: 'this afternoon', ja: '今日の午後' } : { en: 'after school', ja: '放課後' };
  }
  if (slot.day === w.day + 1) return isWeekend(slot.day) || slot.period === 0 ? { en: 'tomorrow', ja: 'あした' } : { en: 'tomorrow after school', ja: 'あしたの放課後' };
  const D = DAYS[dow(slot.day)];
  return { en: D.en, ja: D.ja };
}

/** "on Saturday" / "tomorrow" — for "See you ___!". */
export function whenPhrase(w, slot) {
  const s = slotWords(w, slot);
  return DAYS.some((d) => d.en === s.en) ? { en: `on ${s.en}`, ja: `${s.ja}に` } : s;
}
