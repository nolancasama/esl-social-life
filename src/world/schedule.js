// Resolves where an NPC is at a given (day, period): base weekly routine,
// occasional seeded variation, weather, and plans made with the player.

import { RNG } from '../core/rng.js';
import { interest, LOCATIONS, HOME_ACTS, AWAY_ACTS, thirdPerson } from '../data/content.js';
import { dow, isFreeTime, EVENING } from './time.js';

const OUTDOOR = new Set(['park', 'town']);

/**
 * @param {object} ctx { seed, weather: (day) => string, plans: [] }
 */
export function resolveSlot(ctx, npc, day, period) {
  const busyWithPlayer = (id) => (ctx.plans || []).find((p) => p.status === 'pending' && p.day === day && p.period === period && p.npcIds.includes(id));
  const plan = busyWithPlayer(npc.id);
  if (plan) return { loc: plan.loc, act: plan.act, with: plan.npcIds.filter((id) => id !== npc.id), plan: plan.id };

  // Classmates who became friends through play meet up on their own (social.js),
  // unless the other one has a plan with the player then.
  const hang = (ctx.npcPlans || []).find((p) => p.status === 'pending' && p.day === day && p.period === period && (p.a === npc.id || p.b === npc.id));
  const partner = hang && (hang.a === npc.id ? hang.b : hang.a);
  if (hang && !busyWithPlayer(partner)) return { loc: hang.loc, act: hang.act, with: [partner], hangout: hang.id };

  const base = npc.schedule[dow(day)][period];
  let slot = { loc: base.loc, act: base.act, with: [...(base.with || [])] };
  if (period === EVENING || !isFreeTime(day, period)) return slot;

  // Occasional variation keeps routines believable but not robotic. Friends
  // in a shared slot vary together (seeded by the whole group).
  const groupKey = [npc.id, ...slot.with].sort().join('+');
  const v = new RNG(`${ctx.seed}|vary|${groupKey}|${day}|${period}`);
  if (v.chance(0.1) && !slot.act.startsWith('away:piano')) {
    const alt = npc.likes[1 + v.int(0, 1)];
    const it = interest(alt);
    slot = { loc: v.pick(it.places), act: alt, with: slot.with, varied: true };
  }

  // Rain moves outdoor plans inside (or under an umbrella in town).
  if (ctx.weather(day) === 'rainy' && OUTDOOR.has(slot.loc)) {
    const r = new RNG(`${ctx.seed}|rain|${groupKey}|${day}|${period}`).next();
    const indoorLike = npc.likes.find((id) => interest(id).places.includes('cafe'));
    if (r < 0.45) slot = { loc: 'cafe', act: indoorLike || 'sweets', with: slot.with, rain: true };
    else if (r < 0.7) slot = { loc: 'town', act: 'walk', with: slot.with, umbrella: true, rain: true };
    else slot = { loc: 'house', act: 'home:' + npc.homeActs[0], with: [], rain: true };
  }
  return slot;
}

/** Which period best describes "What do you do on <day>s?" for this NPC. */
export function primaryPeriod(npc, dowIndex) {
  if (dowIndex < 5) return 1;
  const day = npc.schedule[dowIndex];
  const isLike = (s) => npc.likes.includes(s.act);
  if (isLike(day[1])) return 1;
  if (isLike(day[0])) return 0;
  return 1;
}

/** English + Japanese verb phrase for a schedule act (first person). */
export function actPhrase(act) {
  if (act === 'school') return { en: 'go to school', ja: '学校に行きます', emoji: '🏫' };
  if (act === 'walk') return { en: 'take a walk in town', ja: '町をさんぽします', emoji: '🚶' };
  if (act.startsWith('home:')) {
    const h = HOME_ACTS.find((x) => x.id === act.slice(5));
    return { en: `${h.verb} at home`, ja: `家で${h.jaDo}`, emoji: h.emoji };
  }
  if (act.startsWith('away:')) {
    const a = AWAY_ACTS.find((x) => x.id === act.slice(5));
    return { en: a.verb, ja: a.jaDo, emoji: a.emoji };
  }
  const it = interest(act);
  if (it) return { en: it.verb, ja: it.jaDo, emoji: it.emoji };
  return { en: 'relax', ja: 'のんびりします', emoji: '🙂' };
}

/** Third-person version: "plays soccer", "rides her bike". */
export function actPhrase3(act, poss = 'their') {
  const p = actPhrase(act);
  return { ...p, en: thirdPerson(p.en).replace(/\bmy\b/g, poss) };
}

export function locName(loc) { return LOCATIONS[loc] || LOCATIONS.away; }
