// School pair work reuses the ordinary games, without outing rewards or time.
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { askToday } from '../dialogue/school.js';
import { SUBJECTS } from '../data/content.js';
import { lessonForDay, partnerForLesson, completeSchoolLesson } from '../world/school.js';
import { playHobby } from './hobby.js';
import { playBall } from './ballplay.js';

export async function runSchoolLesson(game) {
  const w = game.world;
  const lesson = lessonForDay(w.day);
  if (game.mode !== 'explore' || !w.schoolTime || w.save.flags.fd !== 'done' || !lesson || game.sceneId !== lesson.scene) return;
  const partner = partnerForLesson({ ...w.cls, npcs: w.npcs }, w.day);
  if (!partner) return game._desk();
  const teacher = game.npcs.actors.find((a) => a.special === 'teacher');
  if (!teacher) return;
  const [pA, pB] = game.scene.activitySeats;
  const actor = game.npcs.ensure(partner, pB.x, pB.z, pB.yaw);
  game.player.place(pA.x, pA.z, pA.yaw);
  actor.char.setPosition(pB.x, pB.z);
  actor.char.setBase('idle');
  actor.char.setProp(null);
  const c = await Conversation.start(game, [actor, teacher], { frame: false });
  let finished = false;
  try {
    const subject = SUBJECTS.find((s) => s.id === lesson.subject);
    await c.say(teacher, line(`Today we have ${subject.en}! Make pairs, please.`, `今日は${subject.ja}！二人組になってね。`), { gesture: 'happy' });
    await c.ask([opt('room', `Let's go to the ${lesson.roomEn}.`, `${lesson.roomJa}へ行こう。`, { emoji: subject.emoji, phrases: [`go to the ${lesson.roomEn}`], area: 'subjects', expr: 'a.subjectroom', template: "Let's go to the ___." })]);
    await c.say(actor, line("Let's be partners!", '二人組になろう！'), { gesture: 'wave' });
    await c.ask([opt('partners', 'OK!', 'いいよ！', { phrases: ['ok', 'okay'], area: 'subjects', expr: 'a.partners', template: 'OK!' })]);
    await askToday(c, actor);
    game.dialogue.close();
    game.setMode('activity');
    game.hud.setActivity(true);
    if (lesson.activity === 'catch') await playBall(game, [actor], { where: lesson.scene });
    else await playHobby(game, [actor], { variant: lesson.activity, like: 'music', where: lesson.scene });
    game.hud.setActivity(false);
    game.setMode('talk');
    await c.say(teacher, line('Good teamwork! Class is over.', 'よくできたね！授業はおしまい。'), { gesture: 'clap' });
    await c.ask([opt('done', 'Thank you! See you!', 'ありがとう！またね！', { phrases: ['thank you', 'see you'], area: 'subjects', expr: 'a.lessonbye', template: 'Thank you! See you!' })]);
    game.dialogue.close();
    // No await between rewards and advanceTime: it advances and saves before
    // its first transition. Reload sees either an unpaid morning or afternoon.
    completeSchoolLesson(w, lesson, partner.id);
    finished = true;
    await game.advanceTime({ reason: 'class' });
  } finally {
    game.activityTick = null;
    game.activityMove = null;
    game.activityHud.hide();
    game.hud.setActivity(false);
    if (!finished) await c.end();
  }
}
