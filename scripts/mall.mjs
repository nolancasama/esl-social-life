// Real cards drive the purchase, solo order, phone plan and two-friend outing.
// Hooks only skip onboarding, choose a free weekend and make two Lv2 friends.
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR;
if (!out) throw new Error('Set SHOTS_DIR to a directory outside the repository.');
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const use = async (id) => {
  await ev((id) => {
    const g = window.__esl, target = g.scene.interact.find((it) => it.id === id);
    if (!target) throw new Error(`Missing interaction: ${id}`);
    const p = g.scene.collision.nearestFree(target.x, target.z, 0.3);
    g.player.place(p.x, p.z, 0);
  }, id);
  await sleep(750);
  const button = page.locator('.action');
  await button.waitFor({ state: 'visible', timeout: 3000 });
  await button.click();
};

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
    const { busyReason } = await import('/src/dialogue/outing.js');
    const friends = w.npcs.filter((n) => !busyReason(w, n, 6, 0)).slice(0, 2);
    for (const n of friends) { w.meet(n.id); const r = w.rel(n.id); r.level = 2; r.xp = 40; w.learn(n.id, 'food'); }
    g.hud.queue.length = 0;
    await g.enterScene('town', 'mallDoor');
    return friends.map((n) => ({ id: n.id, name: n.name, food: n.food }));
  });
  expect(cast.length === 2, 'two friends are free for Sunday morning');
  await settle();
  await use('mallDoor');
  await page.waitForFunction(() => window.__esl.sceneId === 'mall');
  await settle();
  expect((await H.state()).scene === 'mall', 'town door enters Niji Mall');
  await sleep(2200);
  await shot('mall-atrium');
  await use('directory');
  expect(await pump(idle, { label: 'directory', max: 30, prefer: ["Let's look at the shops!"] }), 'directory choice finished');
  expect(await ev(() => { const hud = window.__esl.hud, goal = hud.currentGoal(); return goal?.loc === 'mall' && goal.target?.x === -7.5 && !hud.goal.hidden; }), 'directory choice sets the toy shop destination goal');

  const walletBefore = await ev(() => window.__esl.world.save.pocketMoney.balance);
  await use('toys');
  let counterShot = false;
  expect(await pump(async () => {
    if (!counterShot && await page.locator('.dlg-en').textContent().then((t) => /It's 500 yen/.test(t)).catch(() => false)) { await shot('mall-shop-counter'); counterShot = true; }
    return idle();
  }, { label: 'buy', max: 120, prefer: ['Can I see a toy robot, please?', 'How much is it?', "I'll take it!", 'Thank you!'] }), 'purchase conversation finished');
  await settle();
  const bought = await ev(() => ({ wallet: window.__esl.world.save.pocketMoney.balance, souvenirs: window.__esl.world.save.souvenirs, period: window.__esl.world.period }));
  expect(bought.wallet === walletBefore - 500 && bought.wallet >= 0, 'robot costs exactly 500 yen without borrowing');
  expect(bought.souvenirs.some((s) => s.kind === 'mall_robot'), 'purchase saved on the souvenir shelf');
  expect(bought.period === 0, 'shopping uses no period');

  await use('ramen');
  expect(await pump(idle, { label: 'solo-order', max: 100, prefer: ['I want ramen.', "I'd like ramen, please.", 'Thank you!'] }), 'solo ramen order finished');
  await settle();
  await shot('mall-food-counter');
  expect(await ev(() => window.__esl.world.period === 0 && window.__esl.world.save.memories.length === 0), 'solo food counter creates no friendship memory and uses no period');

  await page.locator('.hbtn[data-id="phone"]').click();
  await page.locator('.plan-btn').click();
  expect(await pump(idle, { label: 'phone', max: 120, prefer: ["Let's go to Niji Mall!", 'How about tomorrow?', ...cast.map((n) => `${n.name}, do you want to come?`), "That's all!", 'See you there!'] }), 'phone composer finished');
  await settle();
  const plan = await ev(() => window.__esl.world.save.plans.find((p) => p.status === 'pending' && p.loc === 'mall') || null);
  expect(plan?.npcIds.length === 2 && plan.act === 'mall' && plan.day === 6 && plan.period === 0, 'phone made a mall plan with two friends');
  if (!plan) throw new Error('No mall plan to play');
  await ev(async (plan) => { const g = window.__esl; g.world.save.time = { day: plan.day, period: plan.period }; g.world.ensureDaily(); g.hud.queue.length = 0; await g.enterScene('mall', 'door'); }, plan);
  await settle();
  const before = await ev((ids) => { const w = window.__esl.world; return ids.map((id) => ({ id, xp: w.rel(id).xp, level: w.level(id), memories: w.rel(id).memories.length })); }, plan.npcIds);
  // Walk to a waiting friend, then use the same Talk action as the keyboard.
  await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id), p = a.char.root.position; const free = g.scene.collision.nearestFree(p.x + 0.8, p.z + 0.6, 0.3); g.player.place(free.x, free.z, 0); }, plan.npcIds[0]);
  await sleep(800);
  await page.locator('.action').click();
  const heard = [];
  let tableShot = false;
  expect(await pump(async () => {
    const t = await page.locator('.dlg-en').textContent().catch(() => '');
    if (t && !heard.includes(t)) heard.push(t);
    if (!tableShot && /Everyone is here/.test(t || '')) { await sleep(250); await shot('mall-food-court-friends'); tableShot = true; }
    return await ev(() => window.__esl.world.period === 1 && window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
  }, { label: 'group', max: 250, prefer: ["Let's go!", 'I want sushi.', "I'd like", "Let's look at one shop!", "Let's go to Books and Stationery!", 'No, thank you.', 'What do you want to eat?', 'Thank you!', "It's delicious!", 'Thank you! See you!'] }), 'mall group outing completed in one period');
  await settle();
  const after = await ev((ids) => {
    const w = window.__esl.world;
    const memory = w.save.memories.find((m) => m.act === 'mall' && ids.every((id) => m.npcIds.includes(id)));
    return { memory, friends: ids.map((id) => ({ id, xp: w.rel(id).xp, level: w.level(id), memories: w.rel(id).memories.length })) };
  }, plan.npcIds);
  expect(after.memory?.npcIds.length === 2 && after.memory.focus?.length === 0, 'group memory contains both friends and focus []');
  expect(after.memory?.detail.shop === true && await ev(() => window.__esl.world.save.pocketMoney.balance === 500), 'friends visit one optional shop and declining spends nothing');
  expect(after.friends.every((n, i) => n.xp - before[i].xp === 10 + (n.id === plan.npcIds[0] ? 1 : 0) && n.level === before[i].level && n.memories === before[i].memories), 'each friend receives existing 6 event XP + 4 first-time bonus; the greeted friend also gets existing 1 chat XP, with no level gate');
  expect(cast.every((n) => after.memory?.detail.orders.some((o) => o.npcId === n.id && o.foodId === n.food)), 'each friend orders their known favorite food');
  expect(heard.filter((t) => /It's for/.test(t)).length === 2, 'player can order for both known friends');
  expect(tableShot && counterShot, 'shop counter and shared-table evidence captured');
  expect(await ev((id) => window.__esl.world.save.plans.find((p) => p.id === id)?.status === 'done', plan.id), 'outing marks the phone plan done');

  await use('mallExit');
  await page.waitForFunction(() => window.__esl.sceneId === 'town');
  await settle();
  expect(await ev(() => { const p = window.__esl.player; return Math.hypot(p.x - 25, p.z + 13.7) < 0.1; }), 'mall exit returns outside the same town door');
  // Prove the purchase also renders in the bedroom, rather than only in save data.
  await ev(async () => { const g = window.__esl; await g.enterScene('home', 'door'); });
  expect(await ev(() => window.__esl.scene.root.children.some((g) => g.type === 'Group' && g.children.some((m) => m.type === 'Mesh' && Math.abs(m.position.x + 4.25) < 0.01))), 'bedroom shelf renders the purchased souvenir');
  log('mall summary', { before, after: after.friends, wallet: bought.wallet, shots: out });
} finally { await browser.close(); }
if (H.errors.length) { console.error('MALL CHECKS FAILED:', H.errors.join('; ')); process.exit(1); }
console.log('MALL CHECKS PASSED');
