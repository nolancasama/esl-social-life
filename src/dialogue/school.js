// Shared cards for lessons and ordinary school-day conversations.
import { opt } from './runner.js';
import { line } from './lines.js';
import { timetableAnswer, timetableForDay } from '../world/school.js';

export async function askToday(c, actor) {
  const day = c.world.day;
  const subjects = timetableForDay(day);
  if (!subjects.length) return;
  await c.say(actor, line('What do you have today?', '今日は何の授業がある？', {
    area: 'subjects', expr: 'q.today', template: 'What do you have today?',
  }));
  const answer = timetableAnswer(day);
  const first = subjects.slice(0, 2);
  await c.ask([
    opt('today-all', answer.en, answer.ja, { emoji: '📚', phrases: [answer.en], keys: [[subjects[0].en.toLowerCase()]], area: 'subjects', expr: 'a.today', template: 'I have ___ today.' }),
    opt('today-pair', `I have ${first.map((s) => s.en).join(' and ')}.`, `${first.map((s) => s.ja).join('と')}があるよ。`, { emoji: '📖', phrases: [first.map((s) => s.en).join(' and ')], keys: [[first[0].en.toLowerCase()]], area: 'subjects', expr: 'a.today', template: 'I have ___ today.' }),
  ]);
}
