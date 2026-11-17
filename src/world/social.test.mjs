import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClass } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { World } from '../game/world.js';
import { migrateSave } from './migrate.js';
import { scheduleHangout, settleHangouts, hangoutToReport, hangoutFor, hangoutActivity, pastPhrase, joinableActivity, DAILY_HANGOUTS } from './social.js';
import { npcFree, offerEvent, completeEvent } from './friendship.js';
import { busyReason } from '../dialogue/outing.js';
import { dow } from './time.js';

const SEED = 'social-seed';
const CLASS = buildClass(DEFAULT_ROSTER, SEED);
function makeWorld({ day = 2, period = 1 } = {}) {
  const save = migrateSave({ id: 'p-soc', excluded: [], time: { day, period }, rel: {}, npcLinks: {}, discoveredLinks: [], plans: [], messages: [], memories: [], souvenirs: [], daily: null, flags: { fd: 'done' }, player: { name: 'Rio', likes: [] }, weatherOverrides: {} });
  return new World({ seed: SEED, npcs: JSON.parse(JSON.stringify(CLASS)) }, save);
}
const unlinked = (w) => {
  for (const a of w.npcs) for (const b of w.npcs) if (a.id < b.id && w.link(a.id, b.id) === 0) return [a.id, b.id];
  return null;
};

test('a new friendship between classmates leads to a hangout soon, on a free slot', () => {
  const w = makeWorld();
  const [a, b] = unlinked(w);
  w.meet(a); w.meet(b);
  w.connect(a, b, 1);
  const h = w.save.npcPlans.find((p) => p.pair === [a, b].sort().join('|'));
  assert.ok(h, 'a hangout was planned');
  assert.ok(h.day > w.day && h.day <= w.day + 4);
  for (const id of [a, b]) assert.ok(!w.npc(id).schedule[dow(h.day)][h.period].act.startsWith('away:'), 'not during a lesson or a family visit');
  // They are placed together there.
  const sa = w.slot(w.npc(a), h.day, h.period), sb = w.slot(w.npc(b), h.day, h.period);
  assert.equal(sa.loc, h.loc);
  assert.equal(sb.loc, h.loc);
  assert.deepEqual(sa.with, [b]);
  assert.equal(sa.hangout, h.id);
  // Not again while one is pending, and connecting again changes nothing.
  assert.equal(scheduleHangout(w, a, b), null);
  w.connect(a, b, 1);
  assert.equal(w.save.npcPlans.filter((p) => p.pair === h.pair).length, 1);
});

test('player plans and lessons always win over a hangout', () => {
  const w = makeWorld();
  const [a, b] = unlinked(w);
  const h = scheduleHangout(w, a, b);
  assert.equal(npcFree(w, b, h.day, h.period), false, 'someone at a hangout is busy');
  assert.match(busyReason(w, w.npc(b), h.day, h.period).en, /meeting/);
  w.addPlan({ npcIds: [a], day: h.day, period: h.period, loc: 'cafe', act: 'cafe' });
  assert.equal(w.slot(w.npc(a), h.day, h.period).loc, 'cafe', 'the player plan wins');
  assert.notEqual(w.slot(w.npc(b), h.day, h.period).hangout, h.id, 'and the friend does not wait alone');
  const piano = w.npcs.find((n) => n.schedule[1][1].act === 'away:pianolesson');
  if (piano) assert.match(busyReason(w, piano, 1, 1).en, /piano lessons on Tuesdays/);
});

test('hangouts per day are limited and are deterministic', () => {
  const w1 = makeWorld(), w2 = makeWorld();
  const pairs = [];
  for (const a of w1.npcs) for (const b of w1.npcs) if (a.id < b.id) pairs.push([a.id, b.id]);
  for (const [a, b] of pairs) { scheduleHangout(w1, a, b); scheduleHangout(w2, a, b); }
  assert.deepEqual(w1.save.npcPlans, w2.save.npcPlans);
  const perDay = {};
  for (const p of w1.save.npcPlans) perDay[p.day] = (perDay[p.day] || 0) + 1;
  assert.ok(Object.values(perDay).every((n) => n <= DAILY_HANGOUTS));
  assert.equal(scheduleHangout(w1, 'ken', 'ken'), null);
});

test('after a hangout, either friend can tell the player once', () => {
  const w = makeWorld();
  const [a, b] = unlinked(w);
  const h = scheduleHangout(w, a, b);
  assert.equal(hangoutFor(w.save, a, h.day, h.period), h);
  settleHangouts(w.save, h.day, h.period);
  assert.equal(h.status, 'pending', 'not over yet during its own period');
  settleHangouts(w.save, h.day + 1, 0);
  assert.equal(h.status, 'done');
  assert.equal(hangoutToReport(w.save, b, h.day + 1), h);
  h.reported = true;
  assert.equal(hangoutToReport(w.save, a, h.day + 1), null);
  settleHangouts(w.save, h.day + 20, 0);
  assert.ok(!w.save.npcPlans.includes(h), 'old hangouts are forgotten');
});

test('hangout activities come from what the two like; rain moves them inside', () => {
  const a = { likes: ['soccer', 'drawing', 'piano'] }, b = { likes: ['reading', 'soccer', 'games'] };
  assert.deepEqual(hangoutActivity(a, b, 'sunny'), { loc: 'park', act: 'soccer' });
  assert.deepEqual(hangoutActivity(a, b, 'rainy'), { loc: 'cafe', act: 'sweets' });
  assert.equal(pastPhrase('soccer').en, 'played soccer');
  assert.equal(joinableActivity('soccer'), 'soccer');
  assert.equal(joinableActivity('drawing'), null);
});

test('good friends sometimes invite you along with one of their friends', () => {
  const w = makeWorld({ day: 1, period: 2 });
  for (const o of w.npcs) w.meet(o.id);
  const n = w.npcs.find((x) => w.npcs.some((o) => o.id !== x.id && w.link(x.id, o.id) >= 2));
  const r = w.rel(n.id);
  r.level = 3; r.xp = 30;
  let found = null;
  for (let d = 1; d < 80 && !found; d++) {
    w.save.time = { day: d, period: 2 };
    w.save.messages = [];
    delete r.lastInvite;
    w.makeEveningMessages();
    found = w.save.messages.find((m) => m.kind === 'invite' && m.from === n.id && m.invite.with?.length);
  }
  assert.ok(found, 'a group invitation arrived at some point');
  const pal = w.npc(found.invite.with[0]);
  assert.match(found.en, new RegExp(`with ${pal.name}`));
  assert.ok(w.link(n.id, pal.id) >= 2, 'they bring one of their own friends');
});

test('a group outing gives each friend XP and links them, but opens no level', () => {
  const w = makeWorld();
  const [a, b] = unlinked(w);
  for (const id of [a, b]) { w.meet(id); w.xp(id, 60, { reason: 'test' }); }
  assert.equal(w.level(a), 2);
  const inst = offerEvent(w, { template: 'group_outing', npcId: a, data: { with: [b], act: 'soccer' } });
  const r = completeEvent(w, inst.id, { npcIds: [a, b], xpTo: [a, b], act: 'soccer', links: [[a, b, 2]] });
  assert.equal(r.xpGained, 12, '6 XP for each of the two friends');
  assert.deepEqual(r.memory.focus, []);
  assert.equal(w.level(a), 2, 'the gate stays closed after group time');
  assert.equal(w.link(a, b), 2);
  assert.ok(w.save.npcPlans.some((p) => p.pair === [a, b].sort().join('|')), 'and they will hang out on their own');
});
