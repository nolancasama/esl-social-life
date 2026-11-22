// Phase 1 reliability (DESIGN_DECISIONS 2026-11-23), through the real UI.
// Dev-only fault points (window.__esl.fault) throw during: an arcade game, a
// food purchase, a scene transition, a one-on-one park outing and a group
// mall outing. Each failure must leave no XP, memory, souvenir, photo, charge
// or time advance, restore controls/camera/HUD, keep the plan, and let the
// same thing be retried and completed (rewards exactly once, also after a
// reload). Hooks only arrange the clock, friends, plans and faults.
import { launch, harness } from './lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR;
if (!out) throw new Error('Set SHOTS_DIR to a directory outside the repository.');
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const rel = path.relative(repo, path.resolve(out));
if (!rel || (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))) throw new Error('SHOTS_DIR must be outside the repository.');
// Deliberately wrong expectation for the harness trust proof.
const BROKEN = process.env.RECOVERY_HARNESS_BROKEN_ASSERTION === '1';

const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const precondition = async (label, predicate, arg, timeout = 15000) => {
  try { await page.waitForFunction(predicate, arg, { timeout }); }
  catch { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`); }
};
const rel8 = () => ev(() => window.__esl.reliability);
// Everything a failed activity must not change.
const ledger = () => ev(async () => {
  const w = window.__esl.world, s = w.save;
  const { loadPhotos } = await import('/src/core/store.js');
  return JSON.stringify({ time: s.time, memories: s.memories.length, souvenirs: s.souvenirs.length, money: s.pocketMoney?.balance ?? null, xp: Object.fromEntries(Object.entries(s.rel).map(([id, r]) => [id, r.xp])), activities: s.stats.activities || 0, photos: loadPhotos(s.id).length });
});
// Talking before an activity can earn ordinary chat XP (a greeting or a new
// fact, capped per day). An activity gives at least 10; a failure gives none.
const sameButChat = (a, b, max = 6) => {
  const x = JSON.parse(a), y = JSON.parse(b);
  const xp = Object.keys(y.xp).every((id) => (y.xp[id] - (x.xp[id] ?? 0)) <= max);
  delete x.xp; delete y.xp;
  return xp && JSON.stringify(x) === JSON.stringify(y);
};
const recoveredSince = (t) => ev((t) => (window.__esl.lastRecovery?.at || 0) > t, t);
const now = () => ev(() => Date.now());
const usable = async (label) => {
  const r = await rel8();
  expect(r.mode === 'explore' && !r.activityRunning && !r.saveHold && !r.tick && !r.fade && r.tempUi === 0 && !r.hudActivity, `${label}: controls, HUD and temporary UI are restored (${JSON.stringify(r)})`);
  expect(await ev(() => { const g = window.__esl; return g.input.enabled && g.camera.mode === g.scene.camera.mode && !g.sitting && g.player.char.propKind === null; }), `${label}: input, camera and player pose are back to exploring`);
};
const use = async (id, { place = true } = {}) => {
  await precondition(`exploring before ${id}`, () => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard && performance.now() > (window.__esl.interactBlockUntil || 0));
  if (place) await ev((id) => {
    const g = window.__esl, target = g._interactables().find((it) => it.id === id);
    if (!target) throw new Error(`HARNESS_PRECONDITION_FAILED: Missing interaction: ${id}`);
    const p = g.scene.collision.nearestFree(target.x, target.z, 0.3);
    g.player.place(p.x, p.z, Math.PI);
  }, id);
  await precondition(`walk-up prompt for ${id}`, (id) => window.__esl.target?.it?.id === id, id);
  await page.locator('.action').click();
};
const talkTo = async (npcId, also = []) => {
  const ids = [npcId, ...also];
  await precondition('exploring before talking', () => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard && performance.now() > (window.__esl.interactBlockUntil || 0));
  await precondition('friend is here', (id) => !!window.__esl.npcs.actorFor(id), npcId);
  await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id), p = a.char.root.position; const free = g.scene.collision.nearestFree(p.x - 0.9, p.z + 0.4, 0.3); g.player.place(free.x, free.z, 0); g.player.char.faceToward(p.x, p.z); }, npcId);
  await precondition('a planned friend offers Talk', (ids) => ids.includes(window.__esl.target?.actor?.npc?.id), ids);
  await page.locator('.action').click();
};
const arcade = () => ev(() => window.__esl.arcade);
async function driveCrane() {
  let held = null;
  const KEY = { left: 'ArrowLeft', right: 'ArrowRight', back: 'ArrowUp', forward: 'ArrowDown' };
  const hold = async (k) => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  for (let i = 0; i < 1500; i++) {
    const a = await arcade();
    if (a.phase === 'result') break;
    if (a.cranePhase === 'move') {
      if (a.cue === 'under') { await hold(null); await page.keyboard.press('Space'); await sleep(150); }
      else await hold(KEY[a.cue] || null);
    } else await hold(null);
    await sleep(25);
  }
  await hold(null);
}
async function reloadProfile() {
  await page.reload();
  await page.waitForSelector('.profile:not(.new)', { timeout: 30000 });
  await page.locator('.profile:not(.new)').first().click();
  await page.waitForFunction(() => window.__esl?.world, null, { timeout: 30000 });
  await sleep(2500);
  await settle();
}

try {
  await page.goto(base + '/?autostart=sample&name=Mika');
  await page.waitForFunction(() => window.__esl?.sceneId === 'classroom', null, { timeout: 30000 });
  await sleep(2600);
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 }), 'welcome finished');
  await settle();
  const cast = await ev(async () => {
    const g = window.__esl, w = g.world;
    w.save.flags.fd = 'done';
    w.save.time = { day: 5, period: 0 }; w.ensureDaily();
    for (let d = 5; d < 12; d++) w.save.weatherOverrides[d] = 'sunny';
    const friends = w.npcs.slice(0, 3);
    for (const n of friends) { w.meet(n.id); const r = w.rel(n.id); r.level = 2; r.xp = 40; w.learn(n.id, 'food'); }
    g.hud.queue.length = 0;
    await g.enterScene('mall3', 'elevator');
    return friends.map((n) => ({ id: n.id, name: n.name }));
  });
  await settle();
  expect(await ev(() => typeof window.__esl.fault === 'function' && window.__esl.fault('none') === true), 'the dev build exposes the fault hook');
  await ev(() => window.__esl.fault(null));

  // ---------------------------------------------------------------- 1. arcade tick throws mid-game
  let before = await ledger();
  let t0 = await now();
  await ev(() => window.__esl.fault('arcade:tick'));
  await use('arcade-racing');
  expect(await pump(() => recoveredSince(t0), { label: 'arcade-fault', max: 40, prefer: ["OK! Let's go!"] }), 'a racing tick error is recovered instead of hanging');
  await sleep(600);
  await usable('arcade');
  expect(await ledger() === before, 'arcade failure changes no time, XP, memory, souvenir or money');
  expect(await ev(() => document.querySelectorAll('.arc').length === 0), 'the cabinet screen and its key listeners are removed');
  await shot('arcade-recovered');
  // The same machine works again straight away.
  await use('arcade-crane');
  expect(await pump(async () => { const a = await arcade(); return a.game === 'crane' && a.phase === 'playing'; }, { label: 'crane-retry', max: 40, prefer: ['I want the cat.', "OK! Let's try!"] }), 'another game starts normally after recovery');
  await driveCrane();
  expect(await pump(() => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard), { label: 'crane-done', max: 40, prefer: ['That was fun!'] }), 'the retried game finishes normally');

  // ---------------------------------------------------------------- 2. food purchase throws at the counter
  await ev(async () => { await window.__esl.enterScene('mall2', 'elevator'); });
  await settle();
  before = await ledger();
  t0 = await now();
  await ev(() => window.__esl.fault('purchase:food'));
  await use('ramen');
  expect(await pump(() => recoveredSince(t0), { label: 'food-fault', max: 40, prefer: ['I want ramen. ¥500', "I'd like ramen, please."] }), 'a failed food purchase is recovered');
  await sleep(500);
  await usable('food');
  expect(await ledger() === before, 'the failed purchase charged nothing');
  expect(await ev(() => !window.__esl.world.save.mallMeal && !window.__esl.mallMeal.carrying), 'no meal is pending or carried after the failure');
  const wallet = await ev(() => window.__esl.world.save.pocketMoney.balance);
  await use('ramen');
  expect(await pump(() => ev(() => window.__esl.mallMeal.carrying && window.__esl.mode === 'explore'), { label: 'food-retry', max: 40, prefer: ['I want ramen. ¥500', "I'd like ramen, please.", 'Thank you!', "Let's eat!"] }), 'the retried order hands the food over');
  expect(await ev(() => window.__esl.world.save.pocketMoney.balance) === wallet - 500, 'the retry charges exactly once (500 yen)');
  const seat = await ev(() => window.__esl._interactables().find((it) => it.kind === 'mallSeat')?.id);
  await use(seat);
  await page.locator('.mall-meal-skip').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.mall-meal-skip').click();
  expect(await pump(() => ev(() => window.__esl.mode === 'explore' && !window.__esl.world.save.mallMeal), { label: 'meal-end', max: 30, prefer: ["It's delicious!"] }), 'the solo meal finishes');

  // ---------------------------------------------------------------- 3. scene transition throws
  await ev(async () => { await window.__esl.enterScene('town', 'mallDoor'); });
  await settle();
  t0 = await now();
  await ev(() => window.__esl.fault('scene:enter'));
  await use('mallDoor');
  await precondition('scene failure recovered', (t) => (window.__esl.lastRecovery?.at || 0) > t, t0, 15000);
  await sleep(700);
  await usable('scene');
  expect(await ev(() => window.__esl.sceneId === 'town' && window.__esl.npcs.actors.length > 0), 'a failed scene change returns to the town with people in it');
  await shot('scene-recovered');
  await use('mallDoor');
  await precondition('the mall opens on retry', () => window.__esl.sceneId === 'mall' && window.__esl.mode === 'explore');
  expect(true, 'the same door works on the next try');

  // ---------------------------------------------------------------- 4. one-on-one park outing throws
  const f1 = cast[0].id, f2 = cast[1].id, f3 = cast[2].id;
  const planPark = await ev(async (id) => {
    const g = window.__esl, w = g.world;
    const p = w.addPlan({ npcIds: [id], day: 5, period: 0, loc: 'park', act: 'catch', source: 'test' });
    g.hud.queue.length = 0;
    await g.enterScene('town', 'park');
    return p.id;
  }, f1);
  await settle();
  before = await ledger();
  t0 = await now();
  await ev(() => window.__esl.fault('activity:play'));
  await talkTo(f1);
  expect(await pump(() => recoveredSince(t0), { label: 'park-fault', max: 40, prefer: ["Let's go!", 'Yes', 'OK'] }), 'a failed one-on-one outing is recovered');
  await sleep(600);
  await usable('park');
  expect(sameButChat(before, await ledger()), 'the failed outing gives no activity XP, memory, souvenir, photo or time');
  expect(await ev((pid) => window.__esl.world.save.plans.some((p) => p.id === pid && p.status === 'pending') && window.__esl.friendship.activeId === null, planPark), 'the plan is kept for a retry and no event is stuck active');

  // ---------------------------------------------------------------- 5. group mall outing throws mid-game, reload, retry
  const planMall = await ev(async ({ a, b }) => {
    const g = window.__esl, w = g.world;
    w.save.plans = w.save.plans.filter((p) => p.loc !== 'park');
    w.save.time = { day: 6, period: 0 }; w.ensureDaily();
    const p = w.addPlan({ npcIds: [a, b], day: 6, period: 0, loc: 'mall', act: 'mall', source: 'test' });
    g.hud.queue.length = 0;
    await g.enterScene('mall', 'door');
    g.save(true);
    return p.id;
  }, { a: f2, b: f3 });
  await settle();
  before = await ledger();
  t0 = await now();
  await ev(() => window.__esl.fault('arcade:tick'));
  await talkTo(f2, [f3]);
  const GROUP = ["Let's go!", 'I want to play games.', 'I want to go to the third floor.', 'I want to play the crane game.', 'I want the duck.', "Let's play together!", "OK! Let's try!"];
  expect(await pump(() => recoveredSince(t0), { label: 'group-fault', max: 80, prefer: GROUP }), 'a failure inside a group outing game is recovered');
  await sleep(600);
  await usable('group');
  expect(sameButChat(before, await ledger()), 'the failed group outing gives nobody activity XP, memory, souvenir or time');
  before = await ledger();
  expect(await ev((pid) => window.__esl.world.save.plans.some((p) => p.id === pid && p.status === 'pending'), planMall), 'the group plan is kept');
  await shot('group-recovered');
  await reloadProfile();
  expect(await ledger() === before, 'after a reload the save still holds no partial reward');
  expect(await ev((pid) => window.__esl.world.save.plans.some((p) => p.id === pid && p.status === 'pending'), planMall), 'after a reload the group plan can be retried');
  await ev(async () => { const g = window.__esl; if (g.sceneId !== 'mall') await g.enterScene('mall', 'door'); });
  await settle();
  const xpBefore = await ev(({ a, b }) => ({ a: window.__esl.world.rel(a).xp, b: window.__esl.world.rel(b).xp, mems: window.__esl.world.save.memories.length, period: window.__esl.world.period }), { a: f2, b: f3 });
  await talkTo(f2, [f3]);
  expect(await pump(async () => { const a = await arcade(); return a.game === 'crane' && a.phase === 'playing'; }, { label: 'group-retry', max: 80, prefer: GROUP }), 'the retried outing reaches the crane game');
  await driveCrane();
  expect(await pump(() => ev(() => window.__esl.world.period === 1 && window.__esl.mode === 'explore' && !window.__esl.hud.showingCard), { label: 'group-end', max: 80, prefer: ['That was fun! Thank you!', 'Thank you!'] }), 'the retried outing completes');
  await settle();
  const done = await ev(({ a, b, pid }) => { const w = window.__esl.world; return { a: w.rel(a).xp, b: w.rel(b).xp, mems: w.save.memories.length, period: w.period, plan: w.save.plans.some((p) => p.id === pid && p.status === 'pending') }; }, { a: f2, b: f3, pid: planMall });
  expect(done.mems === xpBefore.mems + (BROKEN ? 2 : 1), `exactly one memory is saved (${xpBefore.mems} → ${done.mems})`);
  expect(done.a > xpBefore.a && done.b > xpBefore.b, 'both friends gain connection');
  expect(done.period === xpBefore.period + 1, 'exactly one period advanced');
  expect(!done.plan, 'the plan is completed');
  const committed = await ledger();
  await reloadProfile();
  expect(await ledger() === committed, 'reloading after completion adds nothing twice');
  log('recovery summary', { shots: out });
} finally { await browser.close(); }
// Injected faults log errors on purpose; anything else is a failure.
const real = H.errors.filter((e) => !/injected at /.test(e));
if (real.length) { console.error('RECOVERY CHECKS FAILED:', real.join('; ')); process.exit(1); }
console.log('RECOVERY CHECKS PASSED');
