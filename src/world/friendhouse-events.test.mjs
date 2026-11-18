import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClass } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { World } from '../game/world.js';
import { LEVEL_XP } from './relationships.js';
import { TEMPLATES } from '../data/events.js';
import { migrateSave, SAVE_VERSION } from './migrate.js';
import { busyReason } from '../dialogue/outing.js';
import {
  eligibleEvents, offerEvent, scheduleEvent, postponeEvent, declineEvent,
  nextEventSlot, npcFree, startEvent, recoverInterrupted, completeEvent,
  memoryRefs, fstate, historyWith, openOffer,
} from './friendship.js';

const SEED = 'friend-house-events';
const CLASS = buildClass(DEFAULT_ROSTER, SEED);
const AVAILABLE = new Set(['friend_house']);
const NPC = 'yuki';

function makeWorld({ day = 5, period = 0, fd = 'done' } = {}) {
  const npcs = structuredClone(CLASS);
  // Test explicit calendar constraints without relying on a generated routine.
  for (const npc of npcs) {
    npc.schedule = Array.from({ length: 7 }, () => Array.from({ length: 3 }, () => ({ loc: 'house', act: 'home:reading', with: [] })));
  }
  const save = migrateSave({
    id: 'friend-house-test', time: { day, period }, excluded: [],
    player: { name: 'Rio', likes: ['drawing'] }, rel: {}, plans: [], messages: [],
    memories: [], souvenirs: [], npcLinks: {}, discoveredLinks: [],
    lang: { expr: {}, areas: {} }, flags: { fd }, stats: { activities: 0 },
  });
  return new World({ seed: SEED, npcs }, save);
}

function reachLevel(w, level) {
  w.meet(NPC);
  while (w.rel(NPC).memories.length < Math.max(0, level - 2)) {
    w.addMemory({ npcIds: [NPC], type: 'activity', act: 'catch' });
  }
  const need = LEVEL_XP[level] - w.rel(NPC).xp;
  if (need > 0) w.xp(NPC, need, { reason: 'test' });
  assert.equal(w.level(NPC), level);
}

const eligible = (w) => eligibleEvents(w, NPC, { available: AVAILABLE });
const connection = (w) => ({ xp: w.rel(NPC).xp, level: w.level(NPC), memories: [...w.rel(NPC).memories] });
const offer = (w) => offerEvent(w, { template: 'friend_house', npcId: NPC });
const recall = { en: 'We played with your dog at your house', ja: '家であなたの犬と遊んだね' };

test('friend-house visits share the Lv4 home-visit gate, period cost and existing personal-event reward', () => {
  const w = makeWorld();
  reachLevel(w, 3);
  assert.equal(eligible(w).reasons.friend_house, 'needs Lv4');
  reachLevel(w, 4);
  assert.ok(eligible(w).eligible.includes('friend_house'));
  assert.equal(TEMPLATES.friend_house.minLevel, TEMPLATES.home_visit.minLevel);
  assert.equal(TEMPLATES.friend_house.cost, 'period');
  assert.equal(TEMPLATES.friend_house.xp, TEMPLATES.home_visit.xp);
  assert.equal(TEMPLATES.friend_house.memoryType, 'event');
  assert.equal(TEMPLATES.friend_house.focus, 'npc');
  assert.equal(eligibleEvents(w, NPC, { available: new Set() }).reasons.friend_house, 'no flow yet');
  const firstDay = makeWorld({ fd: 'start' });
  reachLevel(firstDay, 4);
  assert.equal(eligible(firstDay).reasons.friend_house, 'first day');
  offer(w);
  assert.match(eligible(w).reasons.friend_house, /^open offer /);
});

test('friend-house invitation slots respect actual lessons, plans and classmate meetings', () => {
  const w = makeWorld();
  const n = w.npc(NPC);
  const inst = offer(w);
  for (const [act, words] of [
    ['away:pianolesson', /piano lessons/],
    ['away:swim', /swimming/],
    ['away:grandparents', /grandparents/],
    ['away:library', /library/],
  ]) {
    n.schedule[5][0].act = act;
    assert.equal(npcFree(w, NPC, 5, 0), false, act);
    assert.equal(scheduleEvent(w, inst.id, { day: 5, period: 0, loc: 'friendhouse', act: 'friendhouse' }), null, 'accepting an old invitation cannot overwrite a busy schedule');
    const why = busyReason(w, n, 5, 0);
    assert.match(why.en, words);
    assert.ok(why.ja, 'a real schedule reason includes a Japanese hint');
    assert.deepEqual(nextEventSlot(w, [NPC]), { day: 5, period: 1 });
  }
  n.schedule[5][0].act = 'home:reading';
  const plan = w.addPlan({ npcIds: [NPC], day: 5, period: 0, loc: 'park', act: 'catch' });
  assert.equal(npcFree(w, NPC, 5, 0), false);
  assert.match(busyReason(w, n, 5, 0).en, /have plans/);
  plan.status = 'cancelled';
  w.save.npcPlans.push({ id: 'meeting', a: NPC, b: 'ken', day: 5, period: 0, status: 'pending', loc: 'park', act: 'catch' });
  assert.equal(npcFree(w, NPC, 5, 0), false);
  assert.match(busyReason(w, n, 5, 0).en, new RegExp(`meeting ${w.npc('ken').name}`));
  assert.deepEqual(nextEventSlot(w, [NPC]), { day: 5, period: 1 });
  w.save.npcPlans[0].status = 'done';
  assert.equal(npcFree(w, NPC, 5, 0), true);
  assert.equal(busyReason(w, n, 5, 0), null);
  assert.equal(npcFree(w, NPC, 7, 0), false, 'school mornings remain unavailable');
  assert.equal(npcFree(w, NPC, 5, 2), false, 'evening is not a free period');
});

test('evening requests preserve the existing home visit and offer the inverse during its cooldown', () => {
  const w = makeWorld({ period: 2 });
  reachLevel(w, 4);
  const before = connection(w);
  const start = w.day;
  let first = null;
  // Preserve the original request stream, including direct date callers that
  // look for a request without sleeping or manually expiring old offers.
  for (let day = start; day < start + 40 && !first; day++) {
    w.save.time.day = day;
    w.makeEveningMessages();
    first = openOffer(w.save, NPC);
  }
  assert.ok(first, 'a close friend sends a request within the seeded search window');
  assert.equal(first.template, 'home_visit', 'the existing request has priority while both directions are eligible');
  assert.equal(w.save.messages.find((m) => m.invite?.eventId === first.id)?.invite.act, 'visit');
  let lastDeclined = w.day;
  declineEvent(w.save, first.id, lastDeclined);
  let inverse = null;
  for (let day = lastDeclined + 1; day < start + 120 && !inverse; day++) {
    w.save.time.day = day;
    w.makeEveningMessages();
    const current = openOffer(w.save, NPC);
    if (current?.template === 'friend_house') inverse = current;
    else if (current?.template === 'home_visit') {
      // If that week's visit roll was quiet, politely decline the next home
      // request and let the existing cooldown open another inverse window.
      lastDeclined = day;
      declineEvent(w.save, current.id, day);
    }
  }
  assert.ok(inverse, 'the friend also sends an invitation to their own house');
  assert.ok(w.day < lastDeclined + TEMPLATES.home_visit.cooldownDays, 'the inverse request uses the existing home-visit cooldown');
  assert.equal(w.save.messages.find((m) => m.invite?.eventId === inverse.id)?.invite.act, 'friendhouse');
  const houseMessages = w.save.messages.filter((m) => m.invite?.eventId);
  assert.equal(new Set(houseMessages.map((m) => m.day)).size, houseMessages.length, 'both directions share the one-house-request-per-night budget');
  assert.deepEqual(connection(w), before, 'declining invitations never costs connection');
});

test('friend-house acceptance, Saturday postponement, missed plans and decline never cost connection', () => {
  const w = makeWorld();
  reachLevel(w, 4);
  const before = connection(w);
  const inst = offer(w);
  assert.equal(offer(w), inst, 'one open invitation per instance');
  const first = scheduleEvent(w, inst.id, { day: 5, period: 0, loc: 'friendhouse', act: 'friendhouse' });
  assert.equal(first.eventId, inst.id);
  assert.equal(inst.status, 'scheduled');
  // Start the weekend search on Monday to select the following Saturday.
  const nextSaturday = nextEventSlot(w, [NPC], { fromDay: 7, fromPeriod: 0, weekendFirst: true });
  assert.deepEqual(nextSaturday, { day: 12, period: 0 });
  const moved = postponeEvent(w, inst.id, { ...nextSaturday, loc: 'friendhouse', act: 'friendhouse' });
  assert.equal(first.status, 'cancelled');
  assert.equal(moved.status, 'pending');
  assert.deepEqual(connection(w), before);
  w.save.time = { day: 12, period: 0 };
  w.advance();
  assert.equal(moved.status, 'missed');
  assert.equal(inst.status, 'offered');
  assert.equal(inst.plan, null);
  assert.equal(inst.slot, null);
  assert.equal(inst.missed, 1);
  assert.deepEqual(connection(w), before);
  assert.equal(declineEvent(w.save, inst.id, w.day), true);
  assert.equal(inst.status, 'declined');
  assert.deepEqual(connection(w), before);
  assert.equal(w.save.memories.some((m) => m.detail.eventId === inst.id), false);
});

test('a completed friend-house visit stores its own recall and pays the personal event reward exactly once across reloads', () => {
  const w = makeWorld();
  reachLevel(w, 4);
  const before = connection(w);
  const inst = offer(w);
  scheduleEvent(w, inst.id, { day: 5, period: 0, loc: 'friendhouse', act: 'friendhouse' });
  startEvent(w.save, inst.id);
  const result = completeEvent(w, inst.id, { detail: { recall, place: 'friendhouse' } });
  assert.equal(result.xpGained, 12);
  assert.equal(w.rel(NPC).xp, before.xp + TEMPLATES.home_visit.xp);
  assert.deepEqual(result.memory.focus, [NPC]);
  assert.deepEqual(result.memory.npcIds, [NPC]);
  assert.equal(w.rel(NPC).memories.length, before.memories.length + 1);
  assert.ok(w.rel(NPC).memories.includes(result.memory.id));
  assert.equal(w.save.plans.find((p) => p.id === inst.plan).status, 'done');
  assert.equal(fstate(w.save).activeId, null);
  assert.equal(historyWith(w.save, NPC).filter((h) => h.id === inst.id).length, 1);
  const ref = memoryRefs(w, NPC, { day: 6 }).find((r) => r.memoryId === result.memory.id);
  assert.ok(ref);
  assert.match(ref.en, /We played with your dog at your house yesterday!/);
  assert.equal(ref.place, 'friendhouse');
  const reloaded = new World(w.cls, migrateSave(structuredClone(w.save)));
  assert.equal(reloaded.save.version, SAVE_VERSION, 'existing event state needs no new save version');
  const saved = structuredClone(reloaded.save);
  assert.equal(completeEvent(reloaded, inst.id, { detail: { recall } }).already, true);
  assert.deepEqual(reloaded.save, saved, 'repeated completion changes no memory, XP, plan or history');
});

test('reload during a scheduled friend-house visit clears transient activity and permits clean completion', () => {
  const w = makeWorld();
  reachLevel(w, 4);
  const before = connection(w);
  const inst = offer(w);
  scheduleEvent(w, inst.id, { day: 5, period: 0, loc: 'friendhouse', act: 'friendhouse' });
  startEvent(w.save, inst.id);
  const loaded = migrateSave(structuredClone(w.save));
  assert.equal(recoverInterrupted(loaded), true);
  assert.equal(recoverInterrupted(loaded), false, 'recovery is idempotent');
  const reloaded = new World(w.cls, loaded);
  assert.equal(fstate(loaded).activeId, null);
  assert.equal(openOffer(loaded, NPC).status, 'scheduled');
  assert.equal(reloaded.plansNow()[0].eventId, inst.id);
  assert.deepEqual(connection(reloaded), before, 'an interruption awards nothing and loses nothing');
  assert.equal(startEvent(loaded, inst.id).id, inst.id);
  const result = completeEvent(reloaded, inst.id, { detail: { recall } });
  assert.equal(result.xpGained, TEMPLATES.home_visit.xp);
  assert.equal(fstate(loaded).activeId, null);
  assert.equal(reloaded.plansNow().length, 0);
  assert.equal(completeEvent(reloaded, inst.id).already, true);
});
