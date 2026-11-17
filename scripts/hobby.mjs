// Friendship Depth Phase 1c through the real UI: Hobby Session variants
// (draw together, bug hunting, music time), ball practice, and a card
// project that turns into a delivery. Each one is offered, accepted "now",
// shows the time card, runs, saves a memory + souvenir and uses one period.
// Run: npm run e2e:hobby
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/hobby';
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, state, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);

await page.goto(base + '/?autostart=sample&name=Mika');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(2600);
await pump(async () => ev(() => window.__esl.welcomeDone === true && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 });
await settle();
await ev(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (const n of g.world.npcs) g.world.meet(n.id); g.hud.queue.length = 0; g.hud.refresh(); });
await settle();

/** Back to after school in the park on a dry day (each case uses one period). */
async function afterSchoolInPark() {
  await ev(async () => {
    const g = window.__esl, w = g.world;
    w.save.time.period = 1;
    w.save.weatherOverrides[w.day] = 'sunny';
    for (const p of w.save.plans) if (p.status === 'pending') p.status = 'cancelled';
    await g.enterScene('town', 'park');
  });
  await settle();
}

async function runCase(label, template, data, { prefer = [], level = 3, pickNpc = null } = {}) {
  log(`— ${label}`);
  await afterSchoolInPark();
  // Prefer someone already in the park; otherwise any classmate not used yet
  // (the test brings them over, like a friend who came to meet you).
  const id = await ev((used) => {
    const g = window.__esl;
    const a = g.npcs.actors.find((x) => !x.special && !x.plan && x.mode !== 'ball' && !used.includes(x.npc.id));
    return a ? a.npc.id : (g.world.npcs.find((n) => !used.includes(n.id))?.id || null);
  }, pickNpc ? [] : usedIds);
  const npcId = pickNpc || id;
  expect(!!npcId, `${label}: a friend is in the park (${npcId})`);
  if (!npcId) return null;
  usedIds.push(npcId);
  const before = await ev(({ npcId, template, data, level }) => {
    const g = window.__esl, w = g.world, r = w.rel(npcId), XP = [0, 0, 10, 26, 46, 72];
    r.level = Math.max(r.level, level); r.xp = Math.max(r.xp, XP[level]);
    if (template === 'project') data.recipient = w.npcs.find((o) => o.id !== npcId && w.link(npcId, o.id) >= 1).id;
    const inst = g.friendshipDebug.offer(template, npcId, data);
    const a = g.npcs.ensure(w.npc(npcId), g.player.x + 1.2, g.player.z, 0);
    g.talkTo(a);
    return { inst, period: w.period, day: w.day, mems: w.save.memories.length, souv: w.save.souvenirs.length, recipient: data.recipient || null };
  }, { npcId, template, data, level });
  let sketchShot = false;
  await pump(async () => {
    if (!sketchShot && await page.locator('.sketch').isVisible().catch(() => false)) { sketchShot = true; await sleep(1800); await shot(`${label}-sketch`); }
    const s = await state();
    return s.period === before.period + 1 && (await idle());
  }, { label, max: 420, prefer: ["Yes! Let's go now!", "Sure! Let's practice now!", "Let's go now!", "Let's go!", ...prefer] });
  await settle();
  const after = await ev(({ inst }) => {
    const w = window.__esl.world;
    const m = w.save.memories.find((x) => x.detail?.eventId === inst);
    return { period: w.period, day: w.day, mem: m ? { variant: m.detail.variant, recall: m.detail.recall?.en, photo: m.hasPhoto, focus: m.focus } : null, souv: w.save.souvenirs.slice(-1)[0]?.kind, done: window.__esl.friendship.history.some((h) => h.id === inst) };
  }, before);
  log(label, after);
  expect(after.done && after.mem, `${label}: completed with a memory ("${after.mem?.recall}")`);
  expect(after.period === before.period + 1 && after.day === before.day, `${label}: used exactly one period`);
  expect(after.mem?.photo, `${label}: a photo was taken`);
  return { ...before, ...after, npcId };
}

const usedIds = [];
const draw = await runCase('draw', 'hobby', { act: 'hobby:draw', like: 'drawing', direct: true }, { prefer: ['I want to draw', "It's", 'You can draw well!', 'Bye! See you!'] });
expect(draw?.mem?.variant === 'draw' && draw.souv === 'drawing', 'drawing: a picture went on the shelf');
const spot = await runCase('spot', 'hobby', { act: 'hobby:spot', like: 'bugs', direct: true }, { prefer: ["Let's look", 'One!', 'Two!', 'Three!', 'Yes! It was fun!'] });
expect(spot?.mem?.variant === 'spot' && spot.souv === 'nature', 'bug hunt: a bug jar went on the shelf');
const music = await runCase('music', 'hobby', { act: 'hobby:music', like: 'singing', direct: true }, { prefer: ['Yes, I can!', 'You can sing well, too!'] });
expect(music?.mem?.variant === 'music' && music.souv === 'music', 'music time: a music note went on the shelf');
const practice = await runCase('practice', 'practice', { act: 'catch', like: 'baseball' }, { prefer: ['Ready? Catch!', 'You can do it!', 'Nice! One more!', 'Last one!', 'Great job!'] });
expect(practice?.mem?.variant === 'ball' && practice.souv === 'medal', 'practice: a medal went on the shelf');
const project = await runCase('project', 'project', {}, { level: 4, prefer: ['I want to draw', "It's", 'You can draw well!'] });
expect(project?.souv === 'card', 'project: a card souvenir');
if (project) {
  const del = await ev(({ npcId, recipient }) => window.__esl.friendship.offers.find((o) => o.template === 'delivery' && o.npcId === npcId) && window.__esl.world.save.friendship.instances[window.__esl.friendship.offers.find((o) => o.template === 'delivery' && o.npcId === npcId).id].data.target === recipient, project);
  expect(del, 'project: the card is waiting to be delivered to the friend it was made for');
}
await shot('shelf-check');

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nHOBBY CHECKS PASSED');
