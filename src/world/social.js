// NPC–NPC friendships in this player's world (DESIGN_DECISIONS 2026-11-16,
// SPEC F7). When play creates or strengthens a link between two classmates
// (an introduction, a delivered present, a group outing), they later hang out
// on their own: save.npcPlans holds those meetings, schedule resolution puts
// them together at a visible place, and afterwards either of them can tell
// the player about it. Seeded links are never lowered; player plans and
// lessons always win over a hangout. Pure logic: no DOM, no three.js.
//
// npcPlan = { id, pair: 'a|b', a, b, day, period, loc, act, status: 'pending'|'done', source, reported }

import { RNG } from '../core/rng.js';
import { dow, isFreeTime } from './time.js';
import { interest } from '../data/content.js';

export const DAILY_HANGOUTS = 2;
const VISIBLE = ['park', 'cafe'];
const OUTDOOR = new Set(['park', 'town']);

const pairOf = (a, b) => [a, b].sort().join('|');

/** What two classmates would do together, and where (a shared visible like if they have one). */
export function hangoutActivity(a, b, weather = 'sunny') {
  const visible = (l) => interest(l)?.places.find((p) => VISIBLE.includes(p));
  const shared = a.likes.filter((l) => b.likes.includes(l) && visible(l));
  const like = shared[0] || a.likes.find(visible) || b.likes.find(visible) || null;
  let loc = like ? visible(like) : 'park';
  let act = like || 'walk';
  if (weather === 'rainy' && OUTDOOR.has(loc)) { loc = 'cafe'; act = 'sweets'; }
  if (act === 'walk') loc = 'town';
  return { loc, act };
}

function free(world, id, d, per) {
  const save = world.save;
  if (save.plans.some((p) => p.status === 'pending' && p.day === d && p.period === per && p.npcIds.includes(id))) return false;
  if ((save.npcPlans || []).some((p) => p.status === 'pending' && p.day === d && p.period === per && (p.a === id || p.b === id))) return false;
  const n = world.npc(id);
  if (!n) return false;
  return !n.schedule[dow(d)][per].act.startsWith('away:');
}

/**
 * Plan one hangout for a pair within the next four days (deterministic per
 * player, pair and day). At most one pending per pair, one per pair every 4
 * days, two per day across the class. Returns the npcPlan or null.
 */
export function scheduleHangout(world, a, b, { source = 'play' } = {}) {
  const save = world.save;
  if (!Array.isArray(save.npcPlans)) save.npcPlans = [];
  if (a === b || !world.npc(a) || !world.npc(b)) return null;
  const pair = pairOf(a, b);
  if (save.npcPlans.some((p) => p.pair === pair && (p.status === 'pending' || world.day - p.day < 4))) return null;
  const rng = new RNG(`${world.cls.seed}|${save.id}|hang|${pair}|${world.day}`);
  for (let d = world.day + 1; d <= world.day + 4; d++) {
    if (save.npcPlans.filter((p) => p.status === 'pending' && p.day === d).length >= DAILY_HANGOUTS) continue;
    for (const per of rng.shuffle([0, 1])) {
      if (!isFreeTime(d, per) || !free(world, a, d, per) || !free(world, b, d, per)) continue;
      const { loc, act } = hangoutActivity(world.npc(a), world.npc(b), world.weatherOn(d));
      const plan = { id: `hang:${pair}:${d}:${per}`, pair, a, b, day: d, period: per, loc, act, status: 'pending', source, reported: false };
      save.npcPlans.push(plan);
      return plan;
    }
  }
  return null;
}

/** The hangout this classmate is at, at (day, period). */
export function hangoutFor(save, npcId, day, period) {
  return (save.npcPlans || []).find((p) => p.status === 'pending' && p.day === day && p.period === period && (p.a === npcId || p.b === npcId)) || null;
}

/** Hangouts in the past happened; very old ones are forgotten. */
export function settleHangouts(save, day, period) {
  if (!Array.isArray(save.npcPlans)) save.npcPlans = [];
  for (const p of save.npcPlans) {
    if (p.status === 'pending' && (p.day < day || (p.day === day && p.period < period))) p.status = 'done';
  }
  save.npcPlans = save.npcPlans.filter((p) => day - p.day <= 14);
}

/** A hangout this classmate can tell the player about (it happened in the last 3 days, not told yet). */
export function hangoutToReport(save, npcId, day) {
  return (save.npcPlans || []).find((p) => p.status === 'done' && !p.reported && (p.a === npcId || p.b === npcId) && day - p.day >= 0 && day - p.day <= 3) || null;
}

// "I played soccer with Hana yesterday!" — past tense for the acts hangouts use.
const PAST = {
  soccer: ['played soccer', 'サッカーをした'], baseball: ['played baseball', '野球をした'], dodgeball: ['played dodgeball', 'ドッジボールをした'],
  basketball: ['played basketball', 'バスケをした'], running: ['went jogging', 'ジョギングした'], music: ['listened to music', '音楽を聞いた'],
  singing: ['sang songs', '歌を歌った'], dancing: ['danced', 'おどった'], drawing: ['drew pictures', '絵をかいた'], reading: ['read books', '本を読んだ'],
  comics: ['read comics', 'まんがを読んだ'], sweets: ['ate cake at the café', 'カフェでケーキを食べた'], animals: ['fed the fish', '魚にえさをあげた'],
  bugs: ['looked for bugs', '虫をさがした'], skateboarding: ['went skateboarding', 'スケボーをした'], cycling: ['rode our bikes', '自転車に乗った'],
  games: ['played games', 'ゲームをした'], walk: ['took a walk in town', '町をさんぽした'],
};
export function pastPhrase(act) {
  const p = PAST[act] || ['had fun', '遊んだ'];
  return { en: p[0], ja: p[1] };
}

/** The shared activity a hangout turns into when the player joins (or null). */
export function joinableActivity(act) {
  if (act === 'soccer') return 'soccer';
  if (['baseball', 'dodgeball', 'basketball'].includes(act)) return 'catch';
  if (['sweets', 'reading', 'comics', 'music'].includes(act)) return 'cafe';
  return null;
}
