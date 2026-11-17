import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClass } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { World } from '../game/world.js';
import { LEVEL_XP } from './relationships.js';
import { RNG } from '../core/rng.js';
import { TEMPLATES } from '../data/events.js';
import { migrateSave } from './migrate.js';
import {
  eligibleEvents, pickEvent, canOffer, offerEvent, scheduleEvent, startEvent, recoverInterrupted, declineEvent,
  expireOld, completeEvent, memoryRefs, markReferenced, occasionFor, nextEventSlot, npcFree, snapshot, fstate,
  hobbyOptions, recordPlayerAnswer, playerAnswer, canApproach, noteApproach, openOffer,
} from './friendship.js';

const PHASE1 = new Set(Object.values(TEMPLATES).filter((t) => t.phase === 1).map((t) => t.id));
const SEED = 'fr-seed';
const CLASS = buildClass(DEFAULT_ROSTER, SEED);

function makeWorld({ day = 5, period = 1, fd = 'done', npcs = CLASS } = {}) {
  const save = migrateSave({
    id: 'p-test', excluded: [], time: { day, period }, rel: {}, npcLinks: {}, discoveredLinks: [], plans: [], messages: [],
    memories: [], souvenirs: [], lang: { expr: {}, areas: {} }, daily: null, flags: { fd }, player: { name: 'Rio', likes: ['soccer'] },
    weatherOverrides: {}, heard: [], eveningQueue: [], stats: { activities: 0 },
  });
  return new World({ seed: SEED, npcs: JSON.parse(JSON.stringify(npcs)) }, save);
}

/** Reach a level the honest way: one-on-one memories for the gate, then XP. */
function setLevel(w, id, lvl) {
  w.meet(id);
  while (w.rel(id).memories.length < Math.max(0, lvl - 2)) w.addMemory({ npcIds: [id], type: 'activity', act: 'catch', detail: {} });
  const need = LEVEL_XP[lvl] - w.rel(id).xp;
  if (need > 0) w.xp(id, need, { reason: 'test' });
  assert.equal(w.level(id), lvl);
}

const eligible = (w, id) => eligibleEvents(w, id, { available: PHASE1 }).eligible;

test('templates unlock by level and only when their flow exists', () => {
  const w = makeWorld();
  setLevel(w, 'yuki', 1);
  assert.deepEqual(eligible(w, 'yuki'), ['find']);
  setLevel(w, 'yuki', 2);
  assert.ok(eligible(w, 'yuki').includes('hobby'));
  assert.ok(!eligible(w, 'yuki').includes('practice'));
  setLevel(w, 'yuki', 3);
  assert.ok(eligible(w, 'yuki').includes('practice'), 'Yuki likes soccer and music, so she can practise');
  assert.ok(!eligible(w, 'yuki').includes('delivery'), 'no shared friend met yet');
  w.meet('ken');
  assert.ok(eligible(w, 'yuki').includes('delivery'), 'Ken is Yuki\'s friend and the player has met him');
  setLevel(w, 'yuki', 5);
  assert.ok(eligible(w, 'yuki').includes('best_friend'));
  assert.ok(eligible(w, 'yuki').includes('project'));
  // Phase 2/3 templates stay off while their flows don't exist.
  const r = eligibleEvents(w, 'yuki', { available: PHASE1 });
  for (const t of ['group_outing', 'npc_hangout', 'home_visit']) assert.equal(r.reasons[t], 'no flow yet');
  // Nothing during the first-day script.
  const w0 = makeWorld({ fd: 'start' });
  setLevel(w0, 'yuki', 3);
  assert.deepEqual(eligible(w0, 'yuki'), []);
});

test('meet_request needs a met classmate with no link who the player knows something about', () => {
  const w = makeWorld();
  setLevel(w, 'yuki', 3);
  const stranger = CLASS.find((n) => n.id !== 'yuki' && !CLASS.find((y) => y.id === 'yuki').links[n.id]);
  assert.ok(stranger, 'the sample class has someone Yuki does not know');
  w.meet(stranger.id);
  assert.ok(!eligible(w, 'yuki').includes('meet_request'), 'nothing known about them yet');
  w.learn(stranger.id, 'like:0');
  assert.ok(eligible(w, 'yuki').includes('meet_request'));
});

test('offers have deterministic ids, survive a reload without duplicating, and respect the daily budget', () => {
  const w = makeWorld();
  for (const id of ['yuki', 'ken', 'haru']) setLevel(w, id, 3);
  assert.ok(canOffer(w.save, w.day, 'hobby'));
  const a = offerEvent(w, { template: 'hobby', npcId: 'yuki' });
  assert.equal(a.id, 'hobby:yuki:0');
  assert.equal(offerEvent(w, { template: 'hobby', npcId: 'yuki' }), a, 'an equal open offer is reused');
  // Reload: serialise and rebuild the world.
  const w2 = new World(w.cls, JSON.parse(JSON.stringify(w.save)));
  assert.equal(offerEvent(w2, { template: 'hobby', npcId: 'yuki' }).id, 'hobby:yuki:0');
  assert.equal(Object.keys(fstate(w2.save).instances).length, 1);
  offerEvent(w, { template: 'practice', npcId: 'ken' });
  assert.equal(canOffer(w.save, w.day, 'hobby'), false, 'two new offers per day');
  assert.equal(canOffer(w.save, w.day, 'remember'), true, 'remember has its own budget');
  offerEvent(w, { template: 'remember', npcId: 'haru' });
  assert.equal(canOffer(w.save, w.day, 'remember'), false);
  assert.equal(canOffer(w.save, w.day + 1, 'hobby'), true, 'budget resets the next day');
  assert.equal(openOffer(w.save, 'yuki').id, 'hobby:yuki:0');
  assert.ok(!eligible(w, 'yuki').length, 'one open offer per friend');
});

test('completing an event is atomic and idempotent', () => {
  const w = makeWorld();
  setLevel(w, 'yuki', 3);
  const inst = offerEvent(w, { template: 'hobby', npcId: 'yuki' });
  const xp0 = w.rel('yuki').xp;
  const r1 = completeEvent(w, inst.id, { detail: { recall: { en: 'We drew the pond together', ja: '池の絵をいっしょにかいたね' } } });
  assert.equal(r1.already, false);
  assert.equal(r1.xpGained, TEMPLATES.hobby.xp);
  assert.equal(r1.levelBefore, 3);
  assert.equal(r1.levelAfter, 3, 'the gate opened, but there is not enough XP for Lv4 yet');
  assert.ok(r1.memory && w.rel('yuki').memories.includes(r1.memory.id), 'the memory counts for the gate');
  const r2 = completeEvent(w, inst.id, {});
  assert.equal(r2.already, true);
  assert.equal(w.rel('yuki').xp, xp0 + TEMPLATES.hobby.xp);
  assert.equal(w.save.memories.filter((m) => m.detail.eventId === inst.id).length, 1);
  assert.equal(fstate(w.save).history.length, 1);
  assert.equal(snapshot(w).history[0].id, inst.id);
  // Cooldown, then a new occurrence with the next id.
  assert.ok(!eligible(w, 'yuki').includes('hobby'));
  w.save.time.day += TEMPLATES.hobby.cooldownDays;
  assert.ok(eligible(w, 'yuki').includes('hobby'));
  assert.equal(offerEvent(w, { template: 'hobby', npcId: 'yuki' }).id, 'hobby:yuki:1');
});

test('the best-friend milestone happens once, and comes first', () => {
  const w = makeWorld();
  setLevel(w, 'ken', 5);
  assert.equal(pickEvent(w, 'ken', new RNG('a'), { available: PHASE1 }), 'best_friend');
  const inst = offerEvent(w, { template: 'best_friend', npcId: 'ken' });
  const r = completeEvent(w, inst.id, { detail: { recall: { en: 'We watched the sunset', ja: '夕日を見たね' } } });
  assert.equal(r.xpGained, 0);
  assert.equal(w.level('ken'), 5);
  assert.ok(!eligible(w, 'ken').includes('best_friend'));
  w.save.time.day += 100;
  assert.ok(!eligible(w, 'ken').includes('best_friend'));
});

test('declining, missing, expiring or being interrupted never lowers connection', () => {
  const w = makeWorld({ day: 5, period: 1 });
  setLevel(w, 'yuki', 4);
  const snap = () => ({ xp: w.rel('yuki').xp, level: w.level('yuki') });
  const start = snap();
  // Interrupted: started, then the page reloads.
  const a = offerEvent(w, { template: 'hobby', npcId: 'yuki' });
  startEvent(w.save, a.id);
  assert.equal(fstate(w.save).activeId, a.id);
  assert.equal(recoverInterrupted(w.save), true);
  assert.equal(fstate(w.save).activeId, null);
  assert.equal(a.status, 'offered');
  assert.deepEqual(snap(), start);
  // Scheduled for tomorrow, then missed.
  const slot = nextEventSlot(w, ['yuki'], { fromDay: 6, fromPeriod: 0 });
  const plan = scheduleEvent(w, a.id, { ...slot, loc: 'park', act: 'hobby' });
  assert.ok(plan && plan.eventId === a.id && a.status === 'scheduled');
  w.save.time = { day: slot.day, period: slot.period };
  w.advance();
  assert.equal(plan.status, 'missed');
  assert.equal(a.status, 'offered', 'a missed event comes back as an offer');
  assert.deepEqual(snap(), start);
  // Declined.
  assert.equal(declineEvent(w.save, a.id, w.day), true);
  assert.equal(a.status, 'declined');
  assert.deepEqual(snap(), start);
  // Expired.
  const b = offerEvent(w, { template: 'remember', npcId: 'yuki' });
  expireOld(w.save, w.day + 4);
  assert.equal(b.status, 'expired');
  assert.deepEqual(snap(), start);
});

test('only one-on-one memories open the level gate; legacy memories behave as before', () => {
  const w = makeWorld();
  setLevel(w, 'yuki', 2);
  setLevel(w, 'ken', 2);
  w.xp('yuki', 40, { reason: 'test' });
  w.xp('ken', 40, { reason: 'test' });
  // A group outing: XP for both, no gate.
  w.addMemory({ npcIds: ['yuki', 'ken'], type: 'activity', act: 'soccer', detail: {}, focus: [] });
  assert.equal(w.level('yuki'), 2);
  assert.equal(w.level('ken'), 2);
  // A one-on-one memory opens it (XP is banked).
  w.addMemory({ npcIds: ['yuki'], type: 'activity', act: 'catch', detail: {}, focus: ['yuki'] });
  w.xp('yuki', 1, { reason: 'test' });
  assert.equal(w.level('yuki'), 3);
  // Default (no focus) keeps the old behaviour: every NPC on the memory.
  const m = w.addMemory({ npcIds: ['ken', 'haru'], type: 'activity', act: 'catch', detail: {} });
  assert.equal(m.focus, undefined);
  assert.ok(w.rel('ken').memories.includes(m.id) && w.rel('haru').memories.includes(m.id));
});

test('memory references use only real memories, rarely repeat, and invent nothing', () => {
  const w = makeWorld({ day: 8 });
  setLevel(w, 'haru', 2);
  assert.deepEqual(memoryRefs(w, 'haru'), []);
  w.save.time.day = 6;
  w.addMemory({ npcIds: ['haru'], type: 'help', detail: { item: 'book', itemJa: '本', prep: 'under', obj: 'bench' } });
  w.addMemory({ npcIds: ['haru'], type: 'activity', act: 'cafe', detail: { foodEn: 'pancakes', foodId: 'pancakes', npcFood: 'cake' } });
  w.addMemory({ npcIds: ['haru'], type: 'activity', act: 'mystery', detail: {} });
  w.addMemory({ npcIds: ['ken'], type: 'activity', act: 'soccer', detail: {} });
  w.save.time.day = 7;
  const refs = memoryRefs(w, 'haru', { day: 7 });
  assert.equal(refs.length, 2, 'unknown acts and other people\'s memories are skipped');
  assert.equal(refs[0].en, 'We went to the café yesterday! You ate pancakes!');
  assert.equal(refs[1].en, 'You found my book yesterday!');
  assert.ok(refs.every((r) => !/undefined|null/.test(r.en + r.ja)));
  markReferenced(w.save, refs[0].memoryId, 7);
  assert.equal(memoryRefs(w, 'haru', { day: 8 })[0].memoryId, refs[1].memoryId, 'not again within 3 days');
  markReferenced(w.save, refs[0].memoryId, 10);
  markReferenced(w.save, refs[0].memoryId, 13);
  assert.ok(!memoryRefs(w, 'haru', { day: 20 }).some((r) => r.memoryId === refs[0].memoryId), 'at most 3 times');
  const older = memoryRefs(w, 'haru', { day: 30 });
  assert.match(older[0].en, /^Do you remember\? /, 'old memories have no made-up day');
});

test('availability: free time, other plans and lessons', () => {
  const w = makeWorld({ day: 0, period: 0 });
  const piano = CLASS.find((n) => n.schedule[1][1].act === 'away:pianolesson');
  if (piano) assert.equal(npcFree(w, piano.id, 1, 1), false, 'piano lesson on Tuesdays');
  assert.equal(npcFree(w, 'yuki', 0, 0), false, 'school time');
  w.addPlan({ npcIds: ['yuki'], day: 2, period: 1, loc: 'park', act: 'soccer' });
  assert.equal(npcFree(w, 'yuki', 2, 1), false);
  const slot = nextEventSlot(w, ['yuki', 'ken'], { fromDay: 2, fromPeriod: 1 });
  assert.ok(slot && !(slot.day === 2 && slot.period === 1));
  const inst = offerEvent(w, { template: 'hobby', npcId: 'ken' });
  assert.equal(scheduleEvent(w, inst.id, { day: 2, period: 1, loc: 'park' }), null, 'the player is busy then');
  assert.equal(scheduleEvent(w, inst.id, { day: 1, period: 0, loc: 'park' }), null, 'school time is not free');
});

test('occasions: real birthdays nearby, otherwise good news from the friend\'s own data', () => {
  const npc = { ...CLASS[0], birthday: { m: 4, d: 20 }, pet: null };
  assert.deepEqual(occasionFor(npc, SEED, 0), { kind: 'birthday', day: 7 });
  const far = { ...npc, birthday: { m: 12, d: 1 } };
  let found = 0;
  for (let day = 0; day < 120; day += 7) {
    const o = occasionFor(far, SEED, day);
    assert.deepEqual(o, occasionFor(far, SEED, day), 'deterministic');
    if (!o) continue;
    found++;
    assert.notEqual(o.kind, 'pet_birthday', 'no pet, no pet birthday');
    if (o.kind === 'new_thing') assert.ok(far.likes.includes(o.like));
  }
  assert.ok(found > 0);
});

test('selection is deterministic, weighted by style, and never picks the lost-item favour', () => {
  const w = makeWorld();
  setLevel(w, 'yuki', 4);
  w.meet('ken');
  const picks = new Set();
  for (let i = 0; i < 30; i++) {
    const a = pickEvent(w, 'yuki', new RNG(`p${i}`), { available: PHASE1 });
    assert.equal(a, pickEvent(w, 'yuki', new RNG(`p${i}`), { available: PHASE1 }));
    assert.notEqual(a, 'find');
    picks.add(a);
  }
  assert.ok(picks.size >= 3, `varied picks: ${[...picks]}`);
  assert.equal(pickEvent(w, 'yuki', new RNG('x'), { available: new Set(['find']) }), null);
});

test('event XP never depends on the friend\'s style', () => {
  const gains = new Set();
  for (const style of ['outgoing', 'thoughtful', 'playful', 'creative', 'curious', 'considerate']) {
    const npcs = CLASS.map((n) => (n.id === 'yuki' ? { ...n, style } : n));
    const w = makeWorld({ npcs });
    setLevel(w, 'yuki', 3);
    const inst = offerEvent(w, { template: 'hobby', npcId: 'yuki' });
    gains.add(completeEvent(w, inst.id, {}).xpGained);
  }
  assert.deepEqual([...gains], [TEMPLATES.hobby.xp]);
});

test('hobby options prefer Hobby Session variants and respect rain', () => {
  const npc = { id: 'h', style: 'playful', likes: ['soccer', 'drawing', 'bugs'] };
  const sunny = hobbyOptions(npc, 'sunny');
  assert.ok(sunny[0].act.startsWith('hobby:'));
  const rainy = hobbyOptions(npc, 'rainy');
  assert.ok(rainy.every((o) => !['soccer', 'catch', 'hobby:spot'].includes(o.act)));
  assert.deepEqual(hobbyOptions({ id: 'r', style: 'curious', likes: ['bugs', 'animals', 'soccer'] }, 'rainy'), [{ like: null, act: 'cafe', direct: false }]);
});

test('player answers and soft-approach limits', () => {
  const w = makeWorld();
  recordPlayerAnswer(w.save, 'week:5', 'soccer', 5);
  assert.equal(playerAnswer(w.save, 'week:5'), 'soccer');
  assert.equal(playerAnswer(w.save, 'food'), null);
  assert.ok(canApproach(w.save, 5, 'yuki'));
  noteApproach(w.save, 5, 'yuki');
  assert.ok(!canApproach(w.save, 5, 'yuki'), 'once per classmate per day');
  noteApproach(w.save, 5, 'ken');
  assert.ok(!canApproach(w.save, 5, 'haru'), 'two a day in total');
  assert.ok(canApproach(w.save, 6, 'haru'));
  assert.ok(Object.isFrozen(snapshot(w)) && Object.isFrozen(snapshot(w).styles));
});
