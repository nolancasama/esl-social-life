import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMETABLE, subject } from '../data/content.js';
import { World } from '../game/world.js';
import { migrateSave } from './migrate.js';
import { lessonForDay, partnerForLesson, timetableAnswer, timetableForDay, completeSchoolLesson, schoolLessonMemory } from './school.js';

function makeWorld(day = 1) {
  const cls = { seed: 'school-test', npcs: [{ id: 'partner', name: 'Partner', likes: [], links: {}, schedule: [] }] };
  const save = migrateSave({
    id: 'school-test', excluded: [], time: { day, period: 0 }, rel: {}, npcLinks: {}, discoveredLinks: [], plans: [], messages: [],
    memories: [], souvenirs: [], lang: { expr: {}, areas: {} }, daily: { day }, flags: { fd: 'done' }, player: { name: 'Rio' },
    weatherOverrides: {}, heard: [], eveningQueue: [], stats: { activities: 0 },
  });
  return new World(cls, save);
}

test('school lessons follow the first real specialist subject and preserve welcome and ordinary mornings', () => {
  assert.equal(lessonForDay(0), null);
  assert.equal(lessonForDay(5), null);
  assert.equal(lessonForDay(6), null);
  assert.equal(lessonForDay(1), null, 'Tuesday has music later in the day but keeps the homeroom morning');
  assert.equal(lessonForDay(3), null, 'Thursday keeps the homeroom morning');
  assert.equal(lessonForDay(7).scene, 'gym', 'Monday after the welcome day starts in the gym');
  assert.equal(lessonForDay(2).scene, 'musicroom');
  assert.equal(lessonForDay(4).scene, 'artroom');
  const ordinary = TIMETABLE.map((row) => row.filter((id) => !['music', 'pe', 'arts'].includes(id)));
  assert.equal(lessonForDay(1, ordinary), null, 'a weekday without specialist subjects stays a classroom morning');
});

test('partners rotate deterministically through the full roster before repeating', () => {
  const cls = { seed: 'rotation', npcs: Array.from({ length: 12 }, (_, i) => ({ id: `npc-${i}`, name: `Name ${i}` })) };
  // Three lesson mornings a week: 70 days give more than two full 12-person rings.
  const days = Array.from({ length: 70 }, (_, i) => i).filter((day) => lessonForDay(day));
  const ids = days.map((day) => partnerForLesson(cls, day).id);
  assert.equal(new Set(ids.slice(0, 12)).size, 12);
  assert.deepEqual(ids.slice(12, 24), ids.slice(0, 12));
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  const renamed = { ...cls, npcs: cls.npcs.map((npc) => ({ ...npc, name: 'Different', pronoun: 'name' })) };
  assert.deepEqual(days.map((day) => partnerForLesson(renamed, day).id), ids);
  assert.equal(partnerForLesson(cls, 0), null);
  assert.equal(partnerForLesson({ seed: 'none', npcs: [] }, 1), null);
});

test('timetable cards list that real day in English and Japanese', () => {
  for (let day = 0; day < 5; day++) {
    assert.deepEqual(timetableForDay(day).map((s) => s.id), TIMETABLE[day]);
    const answer = timetableAnswer(day);
    for (const id of TIMETABLE[day]) {
      assert.ok(answer.en.includes(subject(id).en));
      assert.ok(answer.ja.includes(subject(id).ja));
    }
    assert.deepEqual(timetableAnswer(day + 7), answer);
  }
  assert.equal(timetableAnswer(5).en, 'I have no school today.');
  assert.equal(timetableAnswer(1, [[], ['pe']]).en, 'I have P.E.');
});

test('lessons award at most two XP per partner per week and are idempotent after reload', () => {
  let w = makeWorld(7);
  const lesson = lessonForDay(w.day);
  const result = completeSchoolLesson(w, lesson, 'partner');
  assert.equal(result.completed, true);
  assert.equal(result.xp, 2);
  assert.equal(w.rel('partner').xp, 2);
  assert.equal(w.save.time.period, 0, 'completion itself never consumes another free period');
  w = new World(w.cls, migrateSave(structuredClone(w.save)));
  assert.equal(completeSchoolLesson(w, lesson, 'partner').completed, false);
  assert.equal(w.save.memories.length, 1);
  assert.ok(schoolLessonMemory(w.save, 7));
  for (const day of [9, 11]) {
    w.save.time.day = day;
    assert.equal(completeSchoolLesson(w, lessonForDay(day), 'partner').xp, 0);
  }
  assert.equal(w.rel('partner').xp, 2);
  w.save.time.day = 14;
  assert.equal(completeSchoolLesson(w, lessonForDay(14), 'partner').xp, 2, 'a new calendar week has its own small award');
});

test('lesson connection shares the existing daily fact ceiling in either order', () => {
  const w = makeWorld(7);
  for (const key of ['one', 'two', 'three']) w.learn('partner', key);
  assert.equal(w.rel('partner').xp, 6);
  assert.equal(completeSchoolLesson(w, lessonForDay(7), 'partner').xp, 0);
  w.save.time.day = 9;
  assert.equal(completeSchoolLesson(w, lessonForDay(9), 'partner').xp, 0, 'a capped lesson cannot move its award to a later lesson day');
  const w2 = makeWorld(7);
  completeSchoolLesson(w2, lessonForDay(7), 'partner');
  for (const key of ['one', 'two', 'three']) w2.learn('partner', key);
  assert.equal(w2.rel('partner').xp, 6);
});

test('many weeks of lesson memories never open the one-on-one level gate', () => {
  const w = makeWorld();
  w.meet('partner');
  w.xp('partner', 100, { key: 'test-banked-xp' });
  assert.equal(w.level('partner'), 2);
  for (let week = 0; week < 40; week++) {
    w.save.time.day = week * 7 + 2;
    const result = completeSchoolLesson(w, lessonForDay(w.day), 'partner');
    assert.equal(result.xp, 2);
    assert.deepEqual(result.memory.focus, []);
  }
  assert.equal(w.save.memories.length, 40);
  assert.deepEqual(w.rel('partner').memories, []);
  assert.equal(w.level('partner'), 2);
});

test('stale or out-of-period completion cannot pay or create a memory', () => {
  const w = makeWorld(7);
  assert.equal(completeSchoolLesson(w, lessonForDay(9), 'partner').completed, false);
  w.save.time.period = 1;
  assert.equal(completeSchoolLesson(w, lessonForDay(7), 'partner').completed, false);
  assert.equal(w.save.memories.length, 0);
  assert.deepEqual(w.save.rel, {});
});
