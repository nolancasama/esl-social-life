// School mornings through the real lesson cards and reused activity controls.
// Fixtures only select calendar days, arrange gate-edge friendships, and replay
// the pure completion boundary to check anti-farming without extra minute games.
import path from 'node:path';
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
if (!process.env.SHOTS_DIR) throw new Error('Set SHOTS_DIR to a directory outside the repository.');
const out = path.resolve(process.env.SHOTS_DIR);
const repo = path.resolve(import.meta.dirname, '..');
const relative = path.relative(repo, out);
if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('SHOTS_DIR must be outside the repository.');
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const lessonDays = [{ day: 1, room: 'musicroom', subject: 'music' }, { day: 2, room: 'gym', subject: 'P.E.' }, { day: 4, room: 'artroom', subject: 'arts and crafts' }];

async function morning(day) {
  return ev(async (day) => {
    const g = window.__esl, w = g.world;
    const { partnerForLesson } = await import('/src/world/school.js');
    const { TIMETABLE, SUBJECTS } = await import('/src/data/content.js');
    w.save.flags.fd = 'done'; w.save.time = { day, period: 0 }; w.ensureDaily();
    g.hud.queue.length = 0;
    const n = partnerForLesson({ ...g.cls, npcs: w.npcs }, day);
    const id = typeof n === 'string' ? n : n.id;
    const r = w.rel(id);
    w.meet(id); r.level = 2; r.xp = 24; r.memories = [];
    await g.enterSchoolMorning();
    const subjects = TIMETABLE[day % 7].map((id) => SUBJECTS.find((s) => s.id === id).en);
    const list = `${subjects.slice(0, -1).join(', ')} and ${subjects.at(-1)}`;
    return { id, day, xp: r.xp, memories: w.save.memories.length, answer: `I have ${list}${list.endsWith('.') ? '' : '.'}` };
  }, day);
}

async function beginLesson() {
  // Fixture meetings can queue a "New friend!" card over the HUD; clear it first.
  await settle();
  await page.locator('.waitbtn').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.waitbtn').click();
}

async function snapshot(id) {
  return ev((id) => {
    const g = window.__esl, w = g.world, r = w.rel(id);
    return { day: w.day, period: w.period, scene: g.sceneId, mode: g.mode, xp: r.xp, level: r.level, focusCount: r.memories.length, memories: w.save.memories.length };
  }, id);
}

async function reloadProfile() {
  await page.reload();
  await page.waitForSelector('.profile:not(.new)', { timeout: 30000 });
  await page.locator('.profile:not(.new)').first().click();
  await page.waitForFunction(() => window.__esl?.world, null, { timeout: 30000 });
  await sleep(2000);
  await settle();
}

try {
  await page.goto(base + '/?autostart=sample&name=Mika');
  await page.waitForFunction(() => window.__esl?.sceneId === 'classroom', null, { timeout: 30000 });
  await sleep(2600);
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 }), 'day-zero welcome stays in the normal classroom');
  await settle();

  // The current timetable has a specialist every weekday. Temporarily remove
  // specialists from one weekday to prove the fallback, then restore it before
  // testing any authored day or timetable sentence.
  const ordinary = await ev(async () => {
    const g = window.__esl, w = g.world;
    const { TIMETABLE } = await import('/src/data/content.js');
    const saved = TIMETABLE[2].slice();
    try {
      TIMETABLE[2].splice(0, TIMETABLE[2].length, 'japanese', 'math', 'science', 'english');
      w.save.flags.fd = 'done'; w.save.time = { day: 2, period: 0 }; w.ensureDaily();
      g.hud.queue.length = 0; await g.enterSchoolMorning();
      return { scene: g.sceneId, period: w.period, lessonAction: g.scene.interact.some((i) => i.kind === 'schoolLesson') };
    } finally { TIMETABLE[2].splice(0, TIMETABLE[2].length, ...saved); }
  });
  expect(ordinary.scene === 'classroom' && ordinary.period === 0 && !ordinary.lessonAction, 'a weekday without a specialist preserves the ordinary classroom morning');

  const partners = [];
  for (const spec of lessonDays) {
    const before = await morning(spec.day);
    partners.push(before.id);
    expect((await snapshot(before.id)).scene === spec.room, `${spec.subject} starts in ${spec.room}`);
    expect(await ev(() => window.__esl.scene.interact.some((i) => i.kind === 'schoolLesson')), 'the room exposes its normal lesson action');
    await beginLesson();
    const intro = `Today we have ${spec.subject}! Make pairs, please.`;
    expect(await pump(async () => (await page.locator('.dlg-en').textContent().catch(() => '')) === intro, { label: 'intro', max: 30 }), `the teacher introduces ${spec.subject}`);
    expect(await page.locator('.dlg-ja').count() > 0, 'the teacher introduction has a Japanese hint');
    await shot(`${spec.room}-teacher-intro`);

    if (spec.day === 1) {
      await ev(() => window.__esl.save(true));
      await reloadProfile();
      const resumed = await snapshot(before.id);
      expect(resumed.scene === spec.room && resumed.mode === 'explore' && await idle(), 'a mid-lesson reload returns to an idle, replayable school room');
      expect(resumed.day === before.day && resumed.period === 0 && resumed.xp === before.xp && resumed.memories === before.memories, 'an interrupted lesson gives no XP, memory or time advance');
      await beginLesson();
    }

    const seen = { pair: false, answer: false, activity: false, room: true };
    const lines = [];
    expect(await pump(async () => {
      const en = await page.locator('.dlg-en').textContent().catch(() => '');
      if (en && !lines.includes(en)) lines.push(en);
      const cards = await page.locator('.dlg-cards .card').allTextContents();
      if (cards.some((s) => s.includes('OK!')) && /partners/.test(en)) seen.pair = true;
      if (!seen.answer && cards.some((s) => s.includes(before.answer))) {
        seen.answer = true;
        expect(lines.includes('What do you have today?'), 'the partner asks about the real timetable');
        await shot(`${spec.room}-timetable-exchange`);
      }
      const activity = await page.locator('.act-btn:visible, .sketch:visible').first().isVisible().catch(() => false);
      if (activity) {
        const state = await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id); return { room: g.sceneId, pairVisible: !!a?.char.root.visible && g.player.char.root.visible }; }, before.id);
        seen.room = seen.room && state.room === spec.room;
        if (!seen.activity) {
          seen.activity = true;
          expect(state.pairVisible, 'the player and assigned partner are visible during pair work');
          await shot(`${spec.room}-pair-activity`);
        }
      }
      return ev((day) => { const g = window.__esl; return g.world.day === day && g.world.period === 1 && g.sceneId === 'town' && g.mode === 'explore' && !g.hud.showingCard; }, spec.day);
    }, { label: spec.room, max: 250, prefer: ['OK!', before.answer, 'Yes, I can!', 'Catch the ball!', 'Thank you! That was fun!', "It's beautiful!", 'You can sing well, too!'] }), `${spec.subject} pair lesson completes through cards and activity controls`);
    await settle();
    const after = await snapshot(before.id);
    expect(seen.pair && lines.includes("Let's be partners!"), 'pair work includes the partners / OK exchange');
    expect(seen.answer && lines.some((s) => /Let's go to the (music room|gym|art room)\./.test(s)), 'room language and timetable answer were shown');
    expect(seen.activity && seen.room, 'the reused activity stays in the specialist room');
    expect(after.day === spec.day && after.period === 1 && after.scene === 'town', 'the school morning advances to the existing after-school period exactly once');
    expect(after.xp - before.xp === 2 && after.level === 2 && after.focusCount === 0, 'the lesson gives only 2 XP and opens no friendship gate at the XP threshold');
    expect(after.memories === before.memories + 1, 'the lesson stores one shared school memory');
    const duplicate = await ev(async ({ day, id }) => {
      const g = window.__esl;
      const { lessonForDay, completeSchoolLesson } = await import('/src/world/school.js');
      const original = g.world.save.time;
      try { g.world.save.time = { day, period: 0 }; return completeSchoolLesson(g.world, lessonForDay(day), id); }
      finally { g.world.save.time = original; }
    }, before);
    const repeated = await snapshot(before.id);
    expect(repeated.xp === after.xp && repeated.memories === after.memories && repeated.period === after.period, 'replaying completion cannot pay twice, add a memory or advance time');
    log('lesson', { subject: spec.subject, partner: before.id, duplicate, xp: after.xp, level: after.level });
  }
  expect(new Set(partners).size === partners.length, 'music, P.E. and art rotate to different classmates');

  // A real casual conversation on a school afternoon uses the same cards.
  const casual = await ev(async () => {
    const g = window.__esl, w = g.world;
    const n = w.npcs.find((n) => !w.daily.talked?.[n.id]) || w.npcs[0];
    const a = g.npcs.ensure(n, g.player.x + 1.1, g.player.z, 0);
    // A quiet chat: the timetable question only fills conversations where no
    // quiz, introduction or friendship offer came up first (dialogue/talk.js).
    w.rel(n.id).level = 1;
    w.daily.quiz[n.id] = true;
    w.daily.asked[`intro:${n.id}`] = true;
    w.daily.asked[`ev:${n.id}`] = true; // skip today's random friendship-event roll
    delete w.daily.asked.today;
    g.talkTo(a);
    const { TIMETABLE, SUBJECTS } = await import('/src/data/content.js');
    const subjects = TIMETABLE[w.day % 7].map((id) => SUBJECTS.find((s) => s.id === id).en);
    const list = `${subjects.slice(0, -1).join(', ')} and ${subjects.at(-1)}`;
    return `I have ${list}${list.endsWith('.') ? '' : '.'}`;
  });
  let casualQuestion = false, casualAnswer = false;
  expect(await pump(async () => {
    const en = await page.locator('.dlg-en').textContent().catch(() => '');
    if (en === 'What do you have today?') casualQuestion = true;
    if ((await page.locator('.dlg-cards .card').allTextContents()).some((s) => s.includes(casual))) {
      if (!casualAnswer) await shot('casual-timetable-exchange');
      casualAnswer = true;
    }
    return idle();
  }, { label: 'casual timetable', max: 100, prefer: [casual, 'Bye! See you!', 'See you!'] }), 'casual school-day talk ends in a choice');
  expect(casualQuestion && casualAnswer, 'casual talk asks today and offers the real timetable');

  const capped = await ev(async () => {
    const g = window.__esl;
    const { World } = await import('/src/game/world.js');
    const { lessonForDay, completeSchoolLesson } = await import('/src/world/school.js');
    const n = g.world.npcs[0];
    const save = structuredClone(g.world.save);
    save.rel = {}; save.memories = []; save.excluded = []; save.time = { day: 1, period: 0 };
    // A one-classmate fixture means every lesson necessarily uses the same
    // partner. Start beyond every XP threshold to exercise the memory gate.
    const w = new World({ ...g.cls, npcs: [n] }, save);
    w.meet(n.id); w.rel(n.id).level = 2; w.rel(n.id).xp = 72;
    const awards = [];
    for (const day of [1, 2, 3, 4]) {
      save.time = { day, period: 0 }; w.ensureDaily();
      const result = completeSchoolLesson(w, lessonForDay(day), n.id);
      awards.push(result.xp);
    }
    const beforeDuplicate = save.memories.length;
    completeSchoolLesson(w, lessonForDay(4), n.id);
    return { awards, xp: w.rel(n.id).xp, level: w.level(n.id), gates: w.rel(n.id).memories.length, allSchool: save.memories.every((m) => m.type === 'lesson' && m.focus.length === 0), memories: save.memories.length, beforeDuplicate };
  });
  expect(capped.awards[0] === 2 && capped.awards.slice(1).every((xp) => xp === 0) && capped.xp === 74, 'four lessons with the same partner award at most 2 XP in one week');
  expect(capped.level === 2 && capped.gates === 0 && capped.allSchool && capped.memories === capped.beforeDuplicate, 'even many lesson memories and high XP cannot open a friendship gate or duplicate completion');

  const finalBefore = await snapshot(partners.at(-1));
  await ev(() => window.__esl.save(true));
  await reloadProfile();
  const finalAfter = await snapshot(partners.at(-1));
  expect(finalAfter.day === finalBefore.day && finalAfter.period === finalBefore.period && finalAfter.xp === finalBefore.xp && finalAfter.memories === finalBefore.memories && await idle(), 'a completed lesson reload preserves its reward and time without a stuck lesson');
  log('school screenshots', out);
} finally { await browser.close(); }
if (H.errors.length) { console.error('SCHOOL CHECKS FAILED:', H.errors.join('; ')); process.exit(1); }
console.log('SCHOOL CHECKS PASSED');
