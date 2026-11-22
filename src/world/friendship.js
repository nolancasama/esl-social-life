// Friendship events (DESIGN_DECISIONS 2026-11-16): eligibility, selection,
// offers, scheduling, completion, history, memory references, special-day
// occasions, spontaneous-approach limits and what the player told NPCs.
// Pure logic over a World (src/game/world.js): no DOM, no three.js.
//
// save.friendship = {
//   instances: { [id]: Instance }      open events and recently closed ones
//   counts:    { 'tpl|npc': n }        instances ever created → deterministic ids
//   done:      { 'tpl|npc': n }        completions per template and friend
//   cooldowns: { 'tpl|npc': day }      not eligible again before this day
//   history:   [{ id, template, npcIds, day, memoryId }]   newest first, max 200
//   refs:      { [memoryId]: { last, n } }   memory references (1 per 3 days, max 3)
//   daily:     { day, offers, remembers, approaches, approached: { [npcId]: true } }
//   activeId:  instance being played right now; cleared on load (never trusted)
// }
// Instance = { id: 'tpl:npc:n', template, npcId, status, day, data, plan, slot,
//              missed?, completedDay?, memoryId? }
// status: offered → scheduled → done; offered | scheduled → declined | expired.
//
// Invariants: connection never decreases (declining, missing, expiring and
// interruptions only move statuses and cooldowns); XP for an event is awarded
// once per instance (key `event:<id>`); completing twice changes nothing.

import { RNG } from '../core/rng.js';
import { TEMPLATES, INTEREST_ACTIVITY, OUTDOOR_ACTS, PRESENT_FOR, LOST_ITEM_FOR } from '../data/events.js';
import { DAYS, FOODS, PETS, listEn } from '../data/content.js';
import { dateOf, isFreeTime, dow } from './time.js';
import { styleData, styleOf, preferredLikes } from './personality.js';
import { hangoutFor } from './social.js';

const OPEN = new Set(['offered', 'scheduled']);
const MEMORY_TYPES = new Set(['activity', 'help', 'event']);
export const OFFER_EXPIRY_DAYS = 3;
export const DAILY_OFFERS = 2;
export const DAILY_REMEMBERS = 1;
export const DAILY_APPROACHES = 2;
const key = (t, n) => `${t}|${n}`;

// ---------------------------------------------------------------- state

export function fstate(save) {
  if (!save.friendship || typeof save.friendship !== 'object') save.friendship = {};
  const f = save.friendship;
  for (const k of ['instances', 'counts', 'done', 'cooldowns', 'refs']) if (!f[k] || typeof f[k] !== 'object') f[k] = {};
  if (!Array.isArray(f.history)) f.history = [];
  if (!f.daily || typeof f.daily !== 'object') f.daily = { day: null, offers: 0, remembers: 0, approaches: 0, approached: {} };
  if (f.activeId === undefined) f.activeId = null;
  return f;
}

/** Today's counters (offers, remembers, approaches); resets on a new day. */
export function today(save, day) {
  const f = fstate(save);
  if (f.daily.day !== day) f.daily = { day, offers: 0, remembers: 0, approaches: 0, approached: {} };
  return f.daily;
}

export function instance(save, id) { return fstate(save).instances[id] || null; }
export function openOffers(save) { return Object.values(fstate(save).instances).filter((i) => OPEN.has(i.status)); }
export function openOffer(save, npcId) { return openOffers(save).find((i) => i.npcId === npcId) || null; }
export function doneCount(save, template, npcId) { return fstate(save).done[key(template, npcId)] || 0; }
export function historyWith(save, npcId) { return fstate(save).history.filter((h) => h.npcIds.includes(npcId)); }

// ---------------------------------------------------------------- what a friend could do with you

export function activityFor(likeId) { return INTEREST_ACTIVITY[likeId] || { act: 'cafe', direct: false }; }

/**
 * The friend's own likes as shared activities, Hobby Session variants first,
 * then direct fits, then the rest (style order inside each group). Rain
 * removes outdoor-only activities; the café is the fallback.
 */
export function hobbyOptions(npc, weather = 'sunny') {
  const rank = (o) => (o.act.startsWith('hobby:') && o.direct ? 0 : o.direct ? 1 : 2);
  const opts = preferredLikes(npc)
    .map((like) => ({ like, ...activityFor(like) }))
    .filter((o) => !(weather === 'rainy' && OUTDOOR_ACTS.has(o.act)))
    .sort((a, b) => rank(a) - rank(b));
  return opts.length ? opts : [{ like: null, act: 'cafe', direct: false }];
}

export function practiceOptions(npc) {
  return preferredLikes(npc).map((like) => ({ like, ...activityFor(like) })).filter((o) => ['soccer', 'catch', 'hobby:music'].includes(o.act));
}

function knowsSomething(world, id) {
  return [0, 1, 2].some((i) => world.knows(id, `like:${i}`)) || [0, 1].some((i) => world.knows(id, `can:${i}`));
}

/** Classmates the player has met who are this friend's friends (presents, projects). */
export function sharedFriends(world, npcId) {
  return world.npcs.filter((o) => o.id !== npcId && world.isKnown(o.id) && world.link(npcId, o.id) >= 1);
}

/** Classmates the player can introduce to this friend (met, unlinked, something known about them). */
export function meetTargets(world, npcId) {
  return world.npcs.filter((o) => o.id !== npcId && world.isKnown(o.id) && world.link(npcId, o.id) === 0 && knowsSomething(world, o.id));
}

/** Lost-item favour: an item that belongs to the friend's interests when possible. */
export function lostItemFor(npc, rng) {
  const own = preferredLikes(npc).map((l) => LOST_ITEM_FOR[l]).filter(Boolean);
  if (own.length && rng.chance(0.8)) return own[0];
  return rng.pick(['cap', 'bag', 'pencilcase']);
}

export function presentFor(npc) {
  for (const l of preferredLikes(npc)) if (PRESENT_FOR[l]) return { like: l, ...PRESENT_FOR[l] };
  return { like: null, a: 'a', en: 'box of cookies', ja: 'クッキー', emoji: '🍪' };
}

// ---------------------------------------------------------------- availability

/** Can the player do something at (day, period)? Free time with no other plan. */
export function playerFree(world, day, period) {
  return isFreeTime(day, period) && !world.save.plans.some((p) => p.status === 'pending' && p.day === day && p.period === period);
}

/**
 * Is this classmate free at (day, period)? Not at school, no other plan, not
 * meeting another classmate, and not away (lessons, grandparents, library).
 */
export function npcFree(world, npcId, day, period, excludePlan = null) {
  if (!isFreeTime(day, period)) return false;
  if (world.save.plans.some((p) => p.id !== excludePlan && p.status === 'pending' && p.day === day && p.period === period && p.npcIds.includes(npcId))) return false;
  if (hangoutFor(world.save, npcId, day, period)) return false;
  const npc = world.npc(npcId);
  if (!npc) return false;
  return !npc.schedule[dow(day)][period].act.startsWith('away:');
}

/** Next slot where the player and every listed classmate are free. */
export function nextEventSlot(world, npcIds, { fromDay = world.day, fromPeriod = world.period, weekendFirst = false, horizon = 10 } = {}) {
  for (let d = fromDay; d < fromDay + horizon; d++) {
    for (const p of [0, 1]) {
      if (d === fromDay && p < fromPeriod) continue;
      if (weekendFirst && dow(d) < 5 && d < fromDay + 6) continue;
      if (!playerFree(world, d, p)) continue;
      if (!npcIds.every((id) => npcFree(world, id, d, p))) continue;
      return { day: d, period: p };
    }
  }
  return null;
}

// ---------------------------------------------------------------- occasions (special_day)

/**
 * The friend's next small occasion: their real birthday when it is within
 * the next 14 days (or the last 2), otherwise a seeded "good news" day made
 * only from their own data (their pet's birthday, a new thing for a like).
 * One good-news chance per 14-day window. Null when there is none.
 */
export function occasionFor(npc, classSeed, day) {
  if (npc.birthday) {
    for (let k = -2; k <= 14; k++) {
      const d = dateOf(day + k);
      if (d.m === npc.birthday.m && d.d === npc.birthday.d) return { kind: 'birthday', day: day + k };
    }
  }
  const base = Math.floor(day / 14);
  for (const w of [base, base + 1]) {
    const rng = new RNG(`${classSeed}|occasion|${npc.id}|${w}`);
    if (!rng.chance(0.5)) continue;
    const oday = w * 14 + rng.int(0, 13);
    if (oday < day - 2 || oday > day + 14) continue;
    const kinds = [];
    if (npc.pet) kinds.push('pet_birthday');
    const things = preferredLikes(npc).filter((l) => PRESENT_FOR[l] && PRESENT_FOR[l].newThing !== false);
    if (things.length) kinds.push('new_thing');
    if (!kinds.length) continue;
    const kind = rng.pick(kinds);
    if (kind === 'pet_birthday') {
      const p = PETS.find((x) => x.id === npc.pet.type);
      return { kind, day: oday, pet: npc.pet.type, petEn: p ? p.a.replace(/^an? /, '') : 'pet', petJa: p?.ja || 'ペット' };
    }
    const like = things[0];
    return { kind, day: oday, like, thing: { ...PRESENT_FOR[like] } };
  }
  return null;
}

// ---------------------------------------------------------------- eligibility & selection

function requirement(world, t, npc, day) {
  switch (t) {
    case 'hobby': return hobbyOptions(npc, 'sunny').length ? null : 'no hobby';
    case 'practice': return practiceOptions(npc).length ? null : 'nothing to practise';
    case 'delivery':
    case 'project': return sharedFriends(world, npc.id).length ? null : 'no shared friend';
    case 'meet_request': return meetTargets(world, npc.id).length ? null : 'nobody to meet';
    case 'remember': return memoryRefs(world, npc.id, { day, limit: 1 }).length ? null : 'no memory to recall';
    case 'special_day': return occasionFor(npc, world.cls.seed, day) ? null : 'no occasion';
    default: return null;
  }
}

/**
 * Templates this friend could offer now. `available` = template ids whose
 * flows exist (nothing else is ever eligible). Returns { eligible, reasons }.
 */
export function eligibleEvents(world, npcId, { available = null, day = world.day } = {}) {
  const save = world.save;
  const f = fstate(save);
  const npc = world.npc(npcId);
  const eligible = [];
  const reasons = {};
  const open = openOffer(save, npcId);
  for (const t of Object.keys(TEMPLATES)) {
    const T = TEMPLATES[t];
    let r = null;
    if (!npc) r = 'unknown classmate';
    else if (available && !available.has(t)) r = 'no flow yet';
    else if (save.flags?.fd && save.flags.fd !== 'done') r = 'first day';
    else if (world.level(npcId) < T.minLevel) r = `needs Lv${T.minLevel}`;
    else if (open) r = `open offer ${open.id}`;
    else if ((f.cooldowns[key(t, npcId)] ?? -Infinity) > day) r = 'cooldown';
    else if (T.once && doneCount(save, t, npcId) > 0) r = 'already done';
    else r = requirement(world, t, npc, day);
    if (r) reasons[t] = r;
    else eligible.push(t);
  }
  return { eligible, reasons };
}

/**
 * Weighted pick: style affinity × novelty (never done with this friend ×1.5)
 * × language need. The Lv5 milestone always comes first; `find` is never
 * picked here (the daily lost-item roll owns it).
 */
export function pickEvent(world, npcId, rng, { available = null, exclude = [] } = {}) {
  const { eligible } = eligibleEvents(world, npcId, { available });
  const list = eligible.filter((t) => t !== 'find' && !exclude.includes(t));
  if (!list.length) return null;
  if (list.includes('best_friend')) return 'best_friend';
  const st = styleData(world.npc(npcId));
  const weight = (t) => {
    const areas = TEMPLATES[t].areas || [];
    const need = areas.length ? areas.reduce((s, a) => s + world.need(a), 0) / areas.length : 1;
    return (st.events[t] ?? 1) * (doneCount(world.save, t, npcId) ? 1 : 1.5) * need;
  };
  return rng.weighted(list, weight);
}

/** Daily offer budget: 2 new offers across the class plus 1 "remember". */
export function canOffer(save, day, template) {
  const d = today(save, day);
  if (template === 'remember') return d.remembers < DAILY_REMEMBERS;
  if (template === 'find' || template === 'best_friend') return true;
  return d.offers < DAILY_OFFERS;
}

// ---------------------------------------------------------------- lifecycle

export function offerEvent(world, { template, npcId, data = {} }) {
  if (!TEMPLATES[template]) throw new Error(`unknown friendship template: ${template}`);
  const save = world.save;
  const f = fstate(save);
  const existing = Object.values(f.instances).find((i) => i.template === template && i.npcId === npcId && OPEN.has(i.status));
  if (existing) return existing;
  const k = key(template, npcId);
  const n = f.counts[k] || 0;
  f.counts[k] = n + 1;
  const inst = { id: `${template}:${npcId}:${n}`, template, npcId, status: 'offered', day: world.day, data: { ...data }, plan: null, slot: null };
  f.instances[inst.id] = inst;
  const d = today(save, world.day);
  if (template === 'remember') d.remembers++;
  else if (template !== 'find' && template !== 'best_friend') d.offers++;
  return inst;
}

function cancelPlan(save, planId) {
  const p = save.plans.find((x) => x.id === planId);
  if (p && p.status === 'pending') p.status = 'cancelled';
}

/**
 * Put an offered event on the calendar through World.addPlan. Only when the
 * slot is free time, not in the past and the player has no other plan then;
 * otherwise null (propose nextEventSlot instead).
 */
export function scheduleEvent(world, instanceId, { day, period, loc, act = null, npcIds = null }) {
  const save = world.save;
  const inst = fstate(save).instances[instanceId];
  if (!inst || !OPEN.has(inst.status)) return null;
  if (!isFreeTime(day, period)) return null;
  if (day < world.day || (day === world.day && period < world.period)) return null;
  if (inst.template === 'friend_house' && !npcFree(world, inst.npcId, day, period, inst.plan)) return null;
  if (save.plans.some((p) => p.status === 'pending' && p.day === day && p.period === period && p.id !== inst.plan)) return null;
  if (inst.plan) cancelPlan(save, inst.plan);
  const plan = world.addPlan({ npcIds: npcIds || [inst.npcId, ...(inst.data.with || [])], day, period, loc, act: act || inst.data.act || inst.template, source: 'event' });
  plan.eventId = inst.id;
  inst.status = 'scheduled';
  inst.plan = plan.id;
  inst.slot = { day, period, loc };
  return plan;
}

/** Move a scheduled event to another slot (or back to "offered" with no slot). */
export function postponeEvent(world, instanceId, slot = null) {
  const inst = fstate(world.save).instances[instanceId];
  if (!inst || !OPEN.has(inst.status)) return null;
  if (!slot) {
    if (inst.plan) cancelPlan(world.save, inst.plan);
    inst.status = 'offered'; inst.plan = null; inst.slot = null; inst.day = world.day;
    return inst;
  }
  return scheduleEvent(world, instanceId, slot);
}

export function startEvent(save, instanceId) {
  const f = fstate(save);
  if (!f.instances[instanceId]) return null;
  f.activeId = instanceId;
  return f.instances[instanceId];
}

export function endEvent(save, instanceId) {
  const f = fstate(save);
  if (f.activeId === instanceId) f.activeId = null;
}

/** On load: an event that was being played did not finish. Nothing is awarded. */
export function recoverInterrupted(save) {
  const f = fstate(save);
  const had = f.activeId !== null;
  f.activeId = null;
  return had;
}

/** "Maybe next time." Never costs connection; the template rests for a while. */
export function declineEvent(save, instanceId, day) {
  const f = fstate(save);
  const inst = f.instances[instanceId];
  if (!inst || !OPEN.has(inst.status)) return false;
  if (inst.plan) cancelPlan(save, inst.plan);
  inst.status = 'declined';
  inst.plan = null;
  f.cooldowns[key(inst.template, inst.npcId)] = day + Math.max(1, TEMPLATES[inst.template].cooldownDays || 0);
  if (f.activeId === instanceId) f.activeId = null;
  return true;
}

/** Offers nobody took expire quietly (they can come back later); old closed ones are pruned. */
export function expireOld(save, day) {
  const f = fstate(save);
  for (const inst of Object.values(f.instances)) {
    if (inst.status === 'offered' && day - inst.day > OFFER_EXPIRY_DAYS) {
      inst.status = 'expired';
      const k = key(inst.template, inst.npcId);
      f.cooldowns[k] = Math.max(f.cooldowns[k] ?? 0, day + 2);
    }
  }
  for (const [id, inst] of Object.entries(f.instances)) {
    if (!OPEN.has(inst.status) && day - (inst.completedDay ?? inst.day) > 30) delete f.instances[id];
  }
}

/** A scheduled event's plan was missed: back to "offered" with a fresh window. No penalty. */
export function onPlanMissed(save, plan, day) {
  if (!plan?.eventId) return false;
  const inst = fstate(save).instances[plan.eventId];
  if (!inst || inst.status !== 'scheduled') return false;
  inst.status = 'offered';
  inst.plan = null;
  inst.slot = null;
  inst.day = day;
  inst.missed = (inst.missed || 0) + 1;
  return true;
}

/**
 * Finish an event: memory, XP (once), links, cooldown, history — in one step.
 * outcome: { detail, photo, phrase, act, focus, npcIds, xp, xpTo, remembered, links, memory:false }
 * Idempotent: a second call returns { already: true } and changes nothing.
 */
export function completeEvent(world, instanceId, outcome = {}) {
  const save = world.save;
  const f = fstate(save);
  const inst = f.instances[instanceId];
  if (!inst) return { already: true, missing: true };
  if (inst.status === 'done') return { already: true, instance: inst };
  const T = TEMPLATES[inst.template];
  const npcIds = [...new Set([inst.npcId, ...(outcome.npcIds || inst.data.with || [])])];
  const levelBefore = world.level(inst.npcId);
  const levelsBefore = Object.fromEntries(npcIds.map((id) => [id, world.level(id)]));
  let memory = null;
  if (T.memoryType && outcome.memory !== false) {
    const focus = outcome.focus ?? (T.focus === 'none' ? [] : [inst.npcId]);
    const act = Object.prototype.hasOwnProperty.call(outcome, 'act') ? outcome.act : (inst.data.act ?? inst.template);
    memory = world.addMemory({
      npcIds, type: T.memoryType, act,
      detail: { template: inst.template, eventId: inst.id, ...(outcome.detail || {}) },
      photo: outcome.photo || null, phrase: outcome.phrase || null, focus,
    });
  }
  const amount = outcome.xp ?? T.xp;
  let xpGained = 0;
  for (const id of outcome.xpTo || [inst.npcId]) {
    if (amount > 0) xpGained += world.xp(id, amount, { key: id === inst.npcId ? `event:${inst.id}` : `event:${inst.id}:${id}`, reason: 'event' });
  }
  if (outcome.remembered) xpGained += world.xp(inst.npcId, 2, { key: `event-remember:${inst.id}`, reason: 'remember' });
  for (const [a, b, s] of outcome.links || []) world.connect(a, b, s);
  inst.status = 'done';
  inst.completedDay = world.day;
  inst.memoryId = memory?.id || null;
  const k = key(inst.template, inst.npcId);
  f.done[k] = (f.done[k] || 0) + 1;
  if (T.cooldownDays) f.cooldowns[k] = world.day + T.cooldownDays;
  f.history.unshift({ id: inst.id, template: inst.template, npcIds, day: world.day, memoryId: memory?.id || null });
  if (f.history.length > 200) f.history.length = 200;
  if (f.activeId === inst.id) f.activeId = null;
  if (inst.plan) {
    const p = save.plans.find((x) => x.id === inst.plan);
    if (p && p.status === 'pending') world.completePlan(p);
  }
  return { already: false, xpGained, levelBefore, levelAfter: world.level(inst.npcId), levelsBefore, memory, instance: inst };
}

// ---------------------------------------------------------------- memory references

export function whenWords(diff, memDay) {
  if (diff === 1) return { en: 'yesterday', ja: 'きのう' };
  if (diff >= 2 && diff <= 6) { const D = DAYS[dow(memDay)]; return { en: `on ${D.en}`, ja: `${D.ja}に` }; }
  if (diff >= 7 && diff <= 13) return { en: 'last week', ja: '先週' };
  return null;
}

/** A stored memory as something this friend can say. Uses only what the memory contains. */
export function describeMemory(world, m, npcId, day) {
  const d = m.detail || {};
  const others = m.npcIds.filter((id) => id !== npcId).map((id) => world.npc(id)).filter(Boolean);
  let en = null, ja = null, extraEn = '', extraJa = '', again = null, place = null;
  if (m.type === 'help' && d.item) {
    en = `You found my ${d.item}`; ja = `${d.itemJa || d.item}を見つけてくれたね`; place = 'park';
  } else if (m.type === 'activity' && m.act === 'cafe') {
    en = 'We went to the café'; ja = 'カフェに行ったね'; again = { act: 'cafe' }; place = 'cafe';
    const fd = FOODS.find((x) => x.id === d.foodId);
    if (fd) { extraEn = ` You ate ${fd.a}!`; extraJa = `${fd.ja}を食べてたね！`; }
  } else if (m.type === 'activity' && m.act === 'mall') {
    // Older memories have no mallChoice: they were meals.
    [en, ja] = d.mallChoice === 'games' ? ['We played games at Niji Mall', 'にじモールでゲームをしたね']
      : d.mallChoice === 'shop' ? ['We went shopping at Niji Mall', 'にじモールで買い物したね']
        : ['We ate at Niji Mall', 'にじモールでごはんを食べたね'];
    again = { act: 'mall' }; place = 'mall';
  } else if (m.type === 'activity' && m.act === 'soccer') {
    en = 'We played soccer'; ja = 'サッカーしたね'; again = { act: 'soccer' }; place = 'park';
  } else if (m.type === 'activity' && m.act === 'catch') {
    en = 'We played catch'; ja = 'キャッチボールしたね'; again = { act: 'catch' }; place = 'park';
  } else if (m.type === 'event' && d.recall?.en) {
    en = d.recall.en; ja = d.recall.ja || ''; again = d.again || null; place = d.place || null;
  }
  if (!en) return null;
  if (others.length) {
    en += ` with ${listEn(others.map((o) => o.name))}`;
    ja = `${others.map((o) => o.name).join('と')}と${ja}`;
  }
  const diff = day - m.day;
  const when = whenWords(diff, m.day);
  return {
    memoryId: m.id, type: m.type, act: m.act, template: d.template || null, day: m.day, diff, when, place, again,
    companions: others.map((o) => o.id), detail: d,
    en: when ? `${en} ${when.en}!${extraEn}` : `Do you remember? ${en}!${extraEn}`,
    ja: when ? `${when.ja}、${ja}！${extraJa}` : `覚えてる？${ja}！${extraJa}`,
  };
}

/**
 * What this friend can remember with you: only stored memories that include
 * them, at least a day old, newest first; each memory at most once per 3 days
 * and 3 times in total.
 */
export function memoryRefs(world, npcId, { day = world.day, limit = 3, all = false } = {}) {
  const f = fstate(world.save);
  const out = [];
  for (const m of world.save.memories) {
    if (out.length >= limit) break;
    if (!m.npcIds?.includes(npcId) || !MEMORY_TYPES.has(m.type) || day - m.day < 1) continue;
    const r = f.refs[m.id];
    // `all`: the best-friend milestone looks back at everything, ignoring the repeat limits.
    if (!all && r && (r.n >= 3 || day - r.last < 3)) continue;
    const ref = describeMemory(world, m, npcId, day);
    if (ref) out.push(ref);
  }
  return out;
}

export function markReferenced(save, memoryId, day) {
  const f = fstate(save);
  const r = f.refs[memoryId] || { last: null, n: 0 };
  f.refs[memoryId] = { last: day, n: r.n + 1 };
}

// ---------------------------------------------------------------- spontaneous approaches

/** Soft approaches: at most 2 a day across the class, 1 per classmate. */
export function canApproach(save, day, npcId) {
  const d = today(save, day);
  return d.approaches < DAILY_APPROACHES && !d.approached[npcId];
}

export function noteApproach(save, day, npcId) {
  const d = today(save, day);
  d.approaches++;
  d.approached[npcId] = true;
}

// ---------------------------------------------------------------- what the player told NPCs

export function recordPlayerAnswer(save, k, value, day = null) {
  if (!save.player.answers || typeof save.player.answers !== 'object') save.player.answers = {};
  save.player.answers[k] = { v: value, day };
}

export function playerAnswer(save, k) {
  const a = save.player?.answers?.[k];
  return a ? a.v : null;
}

// ---------------------------------------------------------------- harness snapshot

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Detached, frozen view for tests and debugging (`window.__esl.friendship`). */
export function snapshot(world) {
  const f = fstate(world.save);
  const d = f.daily.day === world.day ? f.daily : { offers: 0, remembers: 0, approaches: 0 };
  return deepFreeze({
    offers: openOffers(world.save).map((i) => ({ id: i.id, template: i.template, npcId: i.npcId, status: i.status, day: i.slot?.day ?? i.day, period: i.slot?.period ?? null })),
    activeId: f.activeId,
    history: f.history.slice(0, 10).map((h) => ({ id: h.id, template: h.template, npcIds: [...h.npcIds], day: h.day })),
    today: { offers: d.offers, remembers: d.remembers, approaches: d.approaches },
    styles: Object.fromEntries(world.npcs.map((n) => [n.id, styleOf(n)])),
  });
}
