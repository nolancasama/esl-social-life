// School-day choices are derived from the real timetable, class seed and day.
// No in-progress lesson state is saved: an interrupted lesson can simply replay.
import { RNG } from '../core/rng.js';
import { TIMETABLE, subject } from '../data/content.js';
import { dow, isWeekend, MORNING } from './time.js';

const LESSONS = {
  music: { scene: 'musicroom', activity: 'music', roomEn: 'music room', roomJa: '音楽室' },
  pe: { scene: 'gym', activity: 'catch', roomEn: 'gym', roomJa: '体育館' },
  arts: { scene: 'artroom', activity: 'draw', roomEn: 'art room', roomJa: '図工室' },
};

export function timetableForDay(day, timetable = TIMETABLE) {
  if (isWeekend(day)) return [];
  return (timetable[dow(day)] || []).map(subject).filter(Boolean);
}

/**
 * Only a specialist subject in period 1 moves the morning to its room; later
 * specialist periods are talked about but keep the homeroom morning.
 * Day zero keeps its authored welcome.
 */
export function lessonForDay(day, timetable = TIMETABLE) {
  if (day <= 0 || isWeekend(day)) return null;
  const id = (timetable[dow(day)] || [])[0];
  return LESSONS[id] ? { day, subject: id, ...LESSONS[id] } : null;
}

/** A seeded ring visits the entire class before repeating, with no adjacent repeat. */
export function partnerForLesson(cls, day) {
  if (!lessonForDay(day) || !cls.npcs.length) return null;
  const weekdays = TIMETABLE.map((list, index) => LESSONS[list[0]] ? index : -1).filter((d) => d >= 0);
  const prior = Math.floor(day / 7) * weekdays.length + weekdays.filter((d) => d < dow(day)).length - (weekdays.includes(0) ? 1 : 0);
  const ring = new RNG(`${cls.seed}|school-partners`).shuffle(cls.npcs);
  return ring[prior % ring.length];
}

function joinSubjects(names) {
  return names.length < 2 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function timetableAnswer(day, timetable = TIMETABLE) {
  const subjects = timetableForDay(day, timetable);
  if (!subjects.length) return { en: 'I have no school today.', ja: '今日は学校がお休みです。' };
  const list = joinSubjects(subjects.map((s) => s.en));
  return { en: `I have ${list}${list.endsWith('.') ? '' : '.'}`, ja: `今日は${subjects.map((s) => s.ja).join('、')}があります。` };
}

/** This existing memory is also the once-only completion marker after a reload. */
export function schoolLessonMemory(save, day) {
  return save.memories.find((m) => m.type === 'lesson' && m.day === day) || null;
}

/** Small connection uses the existing fact cap; school memories never open gates. */
export function completeSchoolLesson(world, lesson, partnerId) {
  const expected = lessonForDay(world.day);
  const previous = schoolLessonMemory(world.save, world.day);
  if (previous || !expected || world.period !== MORNING || lesson?.day !== world.day || lesson.subject !== expected.subject || !world.npc(partnerId)) {
    return { completed: false, xp: 0, memory: previous };
  }
  world.meet(partnerId);
  const before = world.rel(partnerId).xp;
  // Learning the weekly key consumes at most one +2 fact award and shares its
  // daily six-XP ceiling. Recording it even at that ceiling prevents a retry.
  world.learn(partnerId, `school-lesson:${Math.floor(world.day / 7)}`);
  const memory = world.addMemory({
    npcIds: [partnerId], type: 'lesson', act: expected.activity, focus: [],
    detail: { subject: expected.subject, where: expected.scene, recall: `We had ${subject(expected.subject).en} together!` },
    phrase: "Let's be partners!",
  });
  return { completed: true, xp: world.rel(partnerId).xp - before, memory };
}
