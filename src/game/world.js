// World model for one player: class NPC profiles + this player's save.
// No three.js here; the 3D layer reads from it.

import { RNG } from '../core/rng.js';
import { makeId } from '../core/util.js';
import { bus } from '../core/events.js';
import { resolveSlot, primaryPeriod, actPhrase } from '../world/schedule.js';
import { weatherFor, dateOf, dow, isWeekend, periodLabel, clockFor, isFreeTime, MORNING, AFTERNOON, EVENING } from '../world/time.js';
import { relOf, meet, addXp, learnFact, knowsFact, npcLink, setNpcLink, discoverLink, levelProgress } from '../world/relationships.js';
import { logExpr, areaNeed } from '../world/progression.js';
import { interest, DAYS, LOST_ITEMS, LOCATIONS } from '../data/content.js';
import { isVisibleLoc } from '../world/generator.js';

export const ACT_INFO = {
  soccer: { en: 'play soccer', ja: 'サッカーをする', emoji: '⚽', loc: 'park', outdoor: true },
  catch: { en: 'play catch', ja: 'キャッチボールをする', emoji: '⚾', loc: 'park', outdoor: true },
  cafe: { en: 'go to the café', ja: 'カフェに行く', emoji: '☕', loc: 'cafe', outdoor: false },
};

export class World {
  constructor(cls, save) {
    this.cls = cls;
    this.save = save;
    this.npcs = cls.npcs.filter((n) => !save.excluded.includes(n.id));
    this.byId = new Map(this.npcs.map((n) => [n.id, n]));
    this.ensureDaily();
  }

  // ------------------------------------------------------------ time
  get day() { return this.save.time.day; }
  get period() { return this.save.time.period; }
  get dow() { return dow(this.day); }
  get weekend() { return isWeekend(this.day); }
  get date() { return dateOf(this.day); }
  get dayInfo() { return DAYS[this.dow]; }
  get periodInfo() { return periodLabel(this.day, this.period); }
  get clock() { return clockFor(this.day, this.period); }
  get weather() { return this.weatherOn(this.day); }
  get free() { return isFreeTime(this.day, this.period); }
  get schoolTime() { return !this.weekend && this.period === MORNING; }
  get evening() { return this.period === EVENING; }
  weatherOn(day) { return weatherFor(this.cls.seed, day, this.save.weatherOverrides || {}); }

  get ctx() { return { seed: this.cls.seed, weather: (d) => this.weatherOn(d), plans: this.save.plans }; }

  // ------------------------------------------------------------ people
  npc(id) { return this.byId.get(id) || null; }
  rel(id) { return relOf(this.save, id); }
  level(id) { return this.rel(id).level; }
  isKnown(id) { return this.level(id) >= 1; }
  known() { return this.npcs.filter((n) => this.isKnown(n.id)); }
  progress(id) { return levelProgress(this.save, id); }
  knows(id, fact) { return knowsFact(this.save, id, fact); }
  link(a, b) { return npcLink(this.save, this.npcs, a, b); }
  npcLinkKnown(a, b) { const k = a < b ? `${a}|${b}` : `${b}|${a}`; return this.save.discoveredLinks.includes(k); }
  friendsOf(id) { return this.npcs.filter((o) => o.id !== id && this.link(id, o.id) >= 1); }

  meet(id, by = null) {
    const fresh = meet(this.save, id, this.day, by);
    if (fresh && by) { discoverLink(this.save, id, by); }
    return fresh;
  }
  xp(id, amount, opts = {}) { return addXp(this.save, id, amount, { day: this.day, ...opts }); }
  learn(id, fact) { return learnFact(this.save, id, fact, this.day); }
  discover(a, b) { if (discoverLink(this.save, a, b)) bus.emit('link', { a, b }); }
  connect(a, b, strength = 1) { setNpcLink(this.save, a, b, strength); this.discover(a, b); }

  // ------------------------------------------------------------ schedules
  slot(npc, day = this.day, period = this.period) { return resolveSlot(this.ctx, npc, day, period); }
  primaryPeriodFor(npc, d) { return primaryPeriod(npc, d); }
  where(npc) { return this.slot(npc).loc; }
  npcsAt(loc) { return this.npcs.filter((n) => this.slot(n).loc === loc); }
  sceneNpcs(sceneId) { return this.npcs.filter((n) => LOCATIONS[this.slot(n).loc]?.scene === sceneId); }

  // ------------------------------------------------------------ plans
  addPlan({ npcIds, day, period, loc, act, source = 'talk' }) {
    const existing = this.save.plans.find((p) => p.status === 'pending' && p.day === day && p.period === period && p.npcIds.some((id) => npcIds.includes(id)));
    if (existing) return existing;
    const plan = { id: makeId('plan'), npcIds, day, period, loc, act, status: 'pending', source, made: this.day };
    this.save.plans.push(plan);
    bus.emit('plan', plan);
    return plan;
  }
  plansNow() { return this.save.plans.filter((p) => p.status === 'pending' && p.day === this.day && p.period === this.period); }
  planWith(npcId, day = this.day, period = this.period) { return this.save.plans.find((p) => p.status === 'pending' && p.day === day && p.period === period && p.npcIds.includes(npcId)); }
  upcomingPlans() { return this.save.plans.filter((p) => p.status === 'pending' && (p.day > this.day || (p.day === this.day && p.period >= this.period))).sort((a, b) => a.day - b.day || a.period - b.period); }
  completePlan(plan) { if (plan) plan.status = 'done'; }
  /** Is this NPC free to do something with the player at (day, period)? */
  busyWithOther(npcId, day, period) { return this.save.plans.some((p) => p.status === 'pending' && p.day === day && p.period === period && p.npcIds.includes(npcId)); }

  /** Next free slot for an outing with this NPC, starting from (day, period). */
  nextFreeSlot(npcId, fromDay, fromPeriod, { weekendFirst = false } = {}) {
    for (let d = fromDay; d < fromDay + 10; d++) {
      for (const p of [MORNING, AFTERNOON]) {
        if (d === fromDay && p < fromPeriod) continue;
        if (!isFreeTime(d, p)) continue;
        if (this.save.plans.some((x) => x.status === 'pending' && x.day === d && x.period === p)) continue;
        if (weekendFirst && !isWeekend(d) && d < fromDay + 6) continue;
        return { day: d, period: p };
      }
    }
    return { day: fromDay + 1, period: AFTERNOON };
  }

  // ------------------------------------------------------------ memories & souvenirs
  addMemory({ npcIds, type, act = null, detail = {}, photo = null, phrase = null }) {
    const m = { id: makeId('mem'), day: this.day, period: this.period, npcIds, type, act, detail, phrase, hasPhoto: Boolean(photo) };
    this.save.memories.unshift(m);
    for (const id of npcIds) { const r = this.rel(id); r.memories.unshift(m.id); r.memories = r.memories.slice(0, 20); }
    return m;
  }
  memoriesWith(npcId) { return this.save.memories.filter((m) => m.npcIds.includes(npcId)); }
  lastMemoryWith(npcId, withinDays = 3) {
    return this.save.memories.find((m) => m.npcIds.includes(npcId) && this.day - m.day <= withinDays && this.day - m.day >= 1 && (m.type === 'activity' || m.type === 'help'));
  }
  addSouvenir(kind, npcId) {
    if (this.save.souvenirs.some((s) => s.kind === kind && s.npcId === npcId)) return null;
    const s = { kind, npcId, day: this.day };
    this.save.souvenirs.push(s);
    return s;
  }

  // ------------------------------------------------------------ messages
  addMessage(msg) {
    const m = { id: makeId('msg'), day: this.day, read: false, ...msg };
    this.save.messages.unshift(m);
    this.save.messages = this.save.messages.slice(0, 60);
    bus.emit('message', m);
    return m;
  }
  unread() { return this.save.messages.filter((m) => !m.read).length; }

  // ------------------------------------------------------------ language
  logLine(lineObj, kind) {
    if (!lineObj?.expr || !lineObj?.area) return;
    logExpr(this.save, { id: lineObj.expr, area: lineObj.area, template: lineObj.template, example: lineObj.en, ja: lineObj.ja }, kind, this.day);
  }
  need(area) { return areaNeed(this.save, area); }

  // ------------------------------------------------------------ daily state
  ensureDaily() {
    const d = this.save.daily;
    if (d && d.day === this.day) return d;
    this.save.daily = { day: this.day, talked: {}, quiz: {}, approached: {}, asked: {}, lost: null, lostDone: false, wished: {} };
    this.rollDailyEvents();
    return this.save.daily;
  }
  get daily() { return this.ensureDaily(); }
  markTalked(id) { const first = !this.daily.talked[id]; this.daily.talked[id] = (this.daily.talked[id] || 0) + 1; return first; }

  rollDailyEvents() {
    const daily = this.save.daily;
    if (this.day < 1) return;
    // A lost item in the park for one known classmate who will be there.
    const rng = new RNG(`${this.cls.seed}|${this.save.id}|lost|${this.day}`);
    const chance = Math.min(0.85, 0.4 * this.need('prepositions'));
    if (!rng.chance(chance)) return;
    const freePeriod = this.weekend ? rng.pick([MORNING, AFTERNOON]) : AFTERNOON;
    if (this.weatherOn(this.day) === 'rainy') return;
    const candidates = this.npcs.filter((n) => this.isKnown(n.id) && resolveSlot(this.ctx, n, this.day, freePeriod).loc === 'park');
    if (!candidates.length) return;
    const npc = rng.pick(candidates);
    daily.lost = { npcId: npc.id, period: freePeriod, item: rng.pick(LOST_ITEMS).id, hide: null, variant: rng.chance(0.5) ? 'clue' : 'search' };
  }

  // ------------------------------------------------------------ advancing time
  /**
   * Move to the next period. Evening → next morning only via sleep().
   * Returns a summary for the transition UI.
   */
  advance() {
    const from = { day: this.day, period: this.period };
    if (this.period === EVENING) return this.sleep();
    // Plans for the period we are leaving that did not happen: gently missed.
    for (const p of this.save.plans) {
      if (p.status === 'pending' && p.day === from.day && p.period === from.period) {
        p.status = 'missed';
        const npc = this.npc(p.npcIds[0]);
        if (npc) this.queueEvening({ type: 'missed', from: npc.id, plan: p });
      }
    }
    this.save.time.period += 1;
    if (this.save.time.period === EVENING) this.makeEveningMessages();
    return { from, to: { day: this.day, period: this.period }, newDay: false };
  }

  sleep() {
    const from = { day: this.day, period: this.period };
    for (const p of this.save.plans) if (p.status === 'pending' && p.day <= from.day) p.status = 'missed';
    this.save.time.day += 1;
    this.save.time.period = MORNING;
    this.ensureDaily();
    return { from, to: { day: this.day, period: this.period }, newDay: true };
  }

  queueEvening(item) {
    this.save.eveningQueue = this.save.eveningQueue || [];
    this.save.eveningQueue.push(item);
  }

  makeEveningMessages() {
    const q = this.save.eveningQueue || [];
    this.save.eveningQueue = [];
    for (const item of q) {
      const npc = this.npc(item.from);
      if (!npc) continue;
      if (item.type === 'thanks') {
        this.addMessage({ from: npc.id, kind: 'thanks', en: item.en, ja: item.ja });
      } else if (item.type === 'missed') {
        const a = ACT_INFO[item.plan.act] || ACT_INFO.catch;
        this.addMessage({ from: npc.id, kind: 'missed', en: `Are you OK? We can ${a.en} next time! 😊`, ja: `だいじょうぶ？また今度${a.ja}ことにしよう！`, offer: { act: item.plan.act, loc: item.plan.loc } });
      }
    }
    // Invitations from friends (level 2+). Never more than two a night.
    const rng = new RNG(`${this.cls.seed}|${this.save.id}|inv|${this.day}`);
    const friends = rng.shuffle(this.npcs.filter((n) => this.level(n.id) >= 2 && !this.save.plans.some((p) => p.status === 'pending' && p.npcIds.includes(n.id))));
    let count = 0;
    for (const n of friends) {
      if (count >= 2) break;
      const lastInv = this.rel(n.id).lastInvite ?? -99;
      if (this.day - lastInv < 3) continue;
      if (!rng.chance(0.35 + this.level(n.id) * 0.1)) continue;
      const inv = this.makeInvite(n, rng);
      if (!inv) continue;
      this.rel(n.id).lastInvite = this.day;
      this.addMessage({ from: n.id, kind: 'invite', ...inv });
      count++;
    }
  }

  /** An invitation built from the NPC's interests and an upcoming free slot. */
  makeInvite(npc, rng = new RNG('x')) {
    const playable = npc.likes.map((id) => interest(id).activity).filter(Boolean);
    let act = playable[0] || rng.pick(['cafe', 'catch']);
    const slot = this.nextFreeSlot(npc.id, this.day + 1, MORNING, { weekendFirst: rng.chance(0.6) });
    if (ACT_INFO[act].outdoor && this.weatherOn(slot.day) === 'rainy') act = 'cafe';
    const a = ACT_INFO[act];
    const day = DAYS[dow(slot.day)];
    const when = slot.day === this.day + 1 ? (slot.period === AFTERNOON && !isWeekend(slot.day) ? 'tomorrow after school' : 'tomorrow') : `on ${day.en}`;
    const whenJa = slot.day === this.day + 1 ? 'あした' : `${day.ja}に`;
    const en = act === 'cafe' ? `Let's go to the café ${when}! Do you want to come?` : `Let's ${a.en} ${when}! Do you want to come?`;
    const ja = `${whenJa}${a.ja}のはどう？いっしょに来る？`;
    return { en, ja, invite: { act, loc: a.loc, day: slot.day, period: slot.period, status: 'pending' } };
  }

  // ------------------------------------------------------------ helpers for talk
  isVisible(loc) { return isVisibleLoc(loc); }
  actPhrase(act) { return actPhrase(act); }
}
