// Friendship Depth Phase 3 through the real UI: a close friend asks to visit
// by message, the player accepts on the phone, the friend comes in through
// the door at the planned time, looks at the photos, plays the racing game,
// says goodbye and leaves; a second visit starts "now" from town and shows
// the souvenirs. Sleeping, menus and saving keep working afterwards.
// Run: npm run e2e:visits
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/visits';
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
await ev(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (const n of g.world.npcs) g.world.meet(n.id); for (let d = 0; d < 20; d++) g.world.save.weatherOverrides[d] = 'sunny'; g.hud.queue.length = 0; g.hud.refresh(); });
await settle();

// ---------------------------------------------------------------- A. "Can I come to your house?" by message
log('— A. a visit request arrives');
const req = await ev(() => {
  const g = window.__esl, w = g.world;
  const v = w.npcs.find((n) => n.id !== w.save.firstFriend);
  w.addMemory({ npcIds: [v.id], type: 'activity', act: 'soccer', detail: { score: 5 } });
  w.save.memories[0].day = -1;
  const r = w.rel(v.id); r.level = 4; r.xp = 50;
  // Evenings until a close friend asks to come over (generation is seeded per day).
  const start = w.day;
  let msg = null;
  for (let d = start; d < start + 40 && !msg; d++) {
    w.save.time.day = d;
    w.save.friendship.daily = { day: null, offers: 0, remembers: 0, approaches: 0, approached: {} };
    w.makeEveningMessages();
    msg = w.save.messages.find((m) => m.invite?.act === 'visit');
  }
  w.save.time.day = start;
  return msg ? { id: msg.id, from: msg.from, en: msg.en, eventId: msg.invite.eventId, day: msg.invite.day, period: msg.invite.period, sent: msg.day } : null;
});
log('request', req);
expect(req && /Can I come to your house/.test(req.en), `a close friend asked: "${req?.en}"`);
if (!req) { await browser.close(); console.log('\nFAILED: no visit request'); process.exit(1); }
// Answer on the phone (the message's day may be later than today; read it then).
await ev((r) => { const w = window.__esl.world; w.save.time.day = r.sent; w.save.time.period = 2; w.ensureDaily(); }, req);
await ev(() => window.__esl.menus.open('phone'));
await sleep(600);
await shot('phone-visit-request');
await page.locator('.msg', { hasText: 'Can I come to your house' }).first().locator('.reply', { hasText: "Sure! Let's go!" }).click();
await sleep(500);
await page.keyboard.press('Escape');
await settle();
const plan = await ev((r) => window.__esl.world.save.plans.find((p) => p.eventId === r.eventId && p.status === 'pending') || null, req);
expect(plan && plan.loc === 'home', 'the visit is on the calendar, at home');

// ---------------------------------------------------------------- B. the friend comes over at the planned time
log('— B. the visit');
await ev(async (p) => { const g = window.__esl, w = g.world; w.save.time = { day: p.day, period: p.period }; w.ensureDaily(); await g.enterScene('home', 'door'); }, plan);
await settle();
await page.waitForFunction((id) => { const a = window.__esl.npcs.actorFor(id); return a && !a.walk; }, req.from, { timeout: 15000 }).catch(() => {});
const arrived = await ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id); if (!a) return null; const p = a.char.root.position; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), marker: g.npcs.markerFor(a), free: g.scene.collision.nearestFree(p.x, p.z, 0.3) }; }, req.from);
log('arrived', arrived);
expect(arrived && arrived.marker === '⭐', 'the friend came in and is waiting (plan marker)');
expect(arrived && Math.hypot(arrived.free.x - arrived.x, arrived.free.z - arrived.z) < 0.05, 'standing on free floor (not in furniture or a wall)');
await shot('visitor-arrived');
const t0 = await ev(() => ({ day: window.__esl.world.day, period: window.__esl.world.period }));
await ev((id) => { const g = window.__esl; g.talkTo(g.npcs.actorFor(id)); }, req.from);
let raceShot = false;
await pump(async () => {
  if (!raceShot && await page.locator('.act-btn').isVisible().catch(() => false)) { raceShot = true; await shot('racing-game'); }
  return (await state()).period === t0.period + 1 && (await idle());
}, { label: 'visit', max: 300, prefer: ["Let's go!", 'Thank you! Come in!', 'Yes! That was fun!', "Sure! Let's take one today!", 'I have five games.', 'I want to play a racing game.', 'That was fun!', 'See you tomorrow!'] });
await settle();
const v1 = await ev(({ id, ev: eid }) => {
  const g = window.__esl, w = g.world;
  const m = w.save.memories.find((x) => x.detail?.eventId === eid);
  return { gone: !g.npcs.actorFor(id), period: w.period, recall: m?.detail?.recall?.en, game: m?.detail?.game, souvenir: w.save.souvenirs.some((s) => s.kind === 'visit' && s.npcId === id), done: g.friendship.history.some((h) => h.id === eid) };
}, { id: req.from, ev: req.eventId });
log('visit', v1);
expect(v1.done && v1.recall === 'We played a racing game at your house', 'the visit is remembered as the racing game it was');
expect(v1.game === 'race', 'they played the racing game');
expect(v1.gone, 'the friend left through the door');
expect(v1.period === t0.period + 1, 'the visit used one period');
expect(v1.souvenir, 'a souvenir from the visit is on the shelf');

// ---------------------------------------------------------------- C. a visit "now" from town (souvenir tour)
log('— C. a visit now');
await ev(async () => { const g = window.__esl, w = g.world; w.save.time.period = 1; if (w.weekend) w.save.time.day += 2; for (const p of w.save.plans) if (p.status === 'pending') p.status = 'cancelled'; w.ensureDaily(); await g.enterScene('town', 'park'); });
await settle();
const w2 = await ev((used) => {
  const g = window.__esl, w = g.world;
  const n = w.npcs.find((x) => x.id !== used && x.id !== w.save.firstFriend && x.id !== w.save.introNpc);
  const r = w.rel(n.id); r.level = 4; r.xp = 50;
  const inst = g.friendshipDebug.offer('home_visit', n.id, {});
  const a = g.npcs.ensure(n, g.player.x + 1.2, g.player.z, 0);
  g.talkTo(a);
  return { id: n.id, inst, period: w.period };
}, req.from);
await pump(async () => (await state()).period === w2.period + 1 && (await idle()), { label: 'visit-now', max: 300, prefer: ["Sure! Let's go now!", "Let's go!", 'Thank you! Come in!', 'Yes! That was fun!', "Sure! Let's take one today!", 'I have two games.', 'I want to show you my souvenirs.', 'This is from', 'See you tomorrow!'] });
await settle();
const v2 = await ev(({ id, inst }) => { const g = window.__esl, w = g.world; const m = w.save.memories.find((x) => x.detail?.eventId === inst); return { scene: g.sceneId, game: m?.detail?.game, gone: !g.npcs.actorFor(id) }; }, w2);
log('visit now', v2);
expect(v2.game === 'souvenirs' && v2.gone, 'the second visit showed the souvenirs, and the friend went home');

// ---------------------------------------------------------------- D. menus, saving and sleeping still work
log('— D. after the visits');
await ev(() => window.__esl.menus.open('journal'));
await sleep(500);
expect(await page.locator('.sheet').isVisible(), 'the journal opens');
await page.keyboard.press('Escape');
await settle();
const saved = await ev(async () => { const g = window.__esl; g.save(true); const s = await import('/src/core/store.js'); const back = s.loadSave(g.world.save.id); return back.memories.filter((m) => m.detail?.template === 'home_visit').length; });
expect(saved === 2, 'both visits are in the saved game');
const dayBefore = await ev(() => window.__esl.world.day);
await ev(async () => { const g = window.__esl; g.world.save.time.period = 2; if (g.sceneId !== 'home') await g.enterScene('home', 'door'); });
await settle();
await ev(() => { window.__sleeping = window.__esl.sleep(); });
await pump(async () => { const s = await state(); return s.day === dayBefore + 1 && s.mode === 'explore'; }, { label: 'sleep', max: 60, prefer: ["It's seven o'clock.", "It's", 'Good night!'] });
expect((await ev(() => window.__esl.world.day)) === dayBefore + 1, 'sleeping still starts a new day');

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nVISIT CHECKS PASSED');
