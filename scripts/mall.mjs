// Real cards drive the purchase, solo order, phone plan and two-friend outing.
// Hooks skip onboarding, arrange friends and set wallet edge cases. Ordering,
// seating, eating, purchases and the outing all use the real UI.
import { launch, harness } from './lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR;
if (!out) throw new Error('Set SHOTS_DIR to a directory outside the repository.');
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const shotRelative = path.relative(repo, path.resolve(out));
if (!shotRelative || (!shotRelative.startsWith('..' + path.sep) && !path.isAbsolute(shotRelative))) throw new Error('SHOTS_DIR must be outside the repository.');
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const precondition = async (label, predicate, arg) => {
  try { await page.waitForFunction(predicate, arg, { timeout: 15000 }); }
  catch { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`); }
};
const drive = async (done, options) => {
  if (!await pump(done, options)) throw new Error(`HARNESS_PRECONDITION_FAILED: ${options.label} did not reach its expected state`);
  return true;
};
const onFloor = (scene) => precondition(`arrived on ${scene}`, (id) => {
  const g = window.__esl;
  return g.sceneId === id && !g.mallTravel.travelling && g.mode === 'explore';
}, scene);
const use = async (id) => {
  await precondition(`exploring before ${id}`, () => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard && performance.now() > (window.__esl.interactBlockUntil || 0));
  await ev((id) => {
    const g = window.__esl, target = g._interactables().find((it) => it.id === id);
    if (!target) throw new Error(`HARNESS_PRECONDITION_FAILED: Missing interaction: ${id}`);
    const p = g.scene.collision.nearestFree(target.x, target.z, 0.3);
    g.player.place(p.x, p.z, 0);
  }, id);
  await precondition(`walk-up prompt for ${id}`, (id) => window.__esl.target?.it?.id === id, id);
  const button = page.locator('.action');
  await button.waitFor({ state: 'visible', timeout: 3000 });
  await button.click();
};
const mealState = () => ev(() => window.__esl.mallMeal);
let soloSeatId = null;
const soloBaseline = () => ev(() => {
  const w = window.__esl.world;
  return { time: JSON.stringify(w.save.time), memories: JSON.stringify(w.save.memories), xp: JSON.stringify(Object.fromEntries(Object.entries(w.save.rel).map(([id, r]) => [id, r.xp]))) };
});
const setBalance = (balance) => ev((balance) => { const g = window.__esl; g.world.save.pocketMoney.balance = balance; g.save(true); }, balance);
const finishOrder = async (label = 'solo-order') => {
  let sawBalance = false;
  expect(await drive(async () => {
    if (/You have \d+ yen now\./.test(await page.locator('.dlg-en').textContent().catch(() => ''))) sawBalance = true;
    return await idle() && await ev(() => window.__esl.mallMeal.carrying);
  }, { label, max: 100, prefer: ['How much is it?', "I'd like", 'Just water, please.', 'Thank you!', "Let's eat!"] }), `${label} returns to explore carrying food`);
  await precondition(`${label} has a carried meal`, () => window.__esl.mode === 'explore' && window.__esl.mallMeal.carrying);
  expect(sawBalance, `${label} tells the player their balance after hand-over`);
};
const orderSolo = async (counter, foodId, price, { evidence = false } = {}) => {
  const before = await ev(() => window.__esl.world.save.pocketMoney.balance);
  await use(counter);
  const menuReady = () => ev((id) => [...document.querySelectorAll('.dlg-cards .card')].some((c) => c.getClientRects().length > 0 && c.dataset.id === id), foodId);
  if (!await pump(menuReady, { label: 'food-menu', max: 30 })) throw new Error('HARNESS_PRECONDITION_FAILED: food menu was not reached');
  const menu = page.locator('.dlg-cards .card').filter({ hasText: new RegExp(`I want (?:a |an )?${foodId === 'icecream' ? 'ice cream' : foodId}\\.`) }).first();
  await precondition(`priced ${foodId} menu is visible`, (id) => [...document.querySelectorAll('.dlg-cards .card')].some((c) => c.textContent.includes(id === 'icecream' ? 'ice cream' : id) && /[¥￥]\s*\d+/.test(c.textContent)), foodId);
  const expectedPrice = process.env.MALL_HARNESS_BROKEN_ASSERTION === '1' && evidence ? price + 1 : price;
  expect(new RegExp(`[¥￥]\\s*${expectedPrice}(?:\\D|$)`).test(await menu.innerText()), `${foodId} menu shows its exact yen price`);
  if (evidence) await shot('mall-food-counter-prices');
  await menu.click();
  await precondition('food price question is offered', () => [...document.querySelectorAll('.dlg-cards .card')].some((c) => c.getClientRects().length > 0 && c.textContent.includes('How much is it?')));
  await page.locator('.dlg-cards .card', { hasText: 'How much is it?' }).click();
  await precondition('food price and current balance are explained', ({ price, before }) => {
    const text = document.querySelector('.dlg-panel')?.textContent || '';
    return text.includes(`It's ${price} yen.`) && text.includes(`${before} yen`);
  }, { price, before });
  await finishOrder();
  expect(await ev(({ before, price, foodId }) => {
    const g = window.__esl;
    return g.world.save.pocketMoney.balance === before - price && g.world.save.mallMeal?.foodId === foodId && g.mallMeal.foodId === foodId && g.mallMeal.carrying;
  }, { before, price, foodId }), `${foodId} is paid exactly once and visibly carried`);
  return { before, paid: before - price, meal: await mealState() };
};
const sitForMeal = async () => {
  await precondition('a free highlighted food-court seat is available', () => window.__esl.mode === 'explore' && performance.now() > (window.__esl.interactBlockUntil || 0) && window.__esl.mallMeal.carrying && window.__esl._interactables().some((it) => it.kind === 'mallSeat'));
  const seat = await ev(() => window.__esl._interactables().find((it) => it.kind === 'mallSeat'));
  soloSeatId = seat.seatId;
  await ev((seat) => {
    const g = window.__esl, p = g.scene.collision.nearestFree(seat.x, seat.z, 0.3);
    g.player.place(p.x, p.z, 0);
  }, seat);
  await precondition('free seat offers Sit and eat', (id) => window.__esl.target?.it?.id === id && /Sit and eat/.test(document.querySelector('.action')?.textContent || ''), seat.id);
  expect(/すわって食べる/.test(await page.locator('.action').innerText()), 'seat prompt includes the Japanese hint');
  await page.locator('.action').click();
  await precondition('the player is seated with their dish', () => window.__esl.mallMeal.seated && window.__esl.mallMeal.dishCount > 0 && window.__esl.mallMeal.bitesLeft > 0);
  expect(await ev((id) => {
    const g = window.__esl, seat = g.scene.seats.find((s) => s.id === id);
    return !!seat && g.npcs.actors.every((a) => !a.char.root.visible || Math.hypot(a.char.root.position.x - seat.x, a.char.root.position.z - seat.z) > 0.45);
  }, seat.seatId), 'solo seat is an available scene seat with no NPC overlap');
  return mealState();
};
const finishSolo = async ({ skip = false } = {}) => {
  if (skip) {
    await precondition('Skip is available while eating', () => window.__esl.mallMeal.seated && !!document.querySelector('.mall-meal-skip'));
    await page.locator('.mall-meal-skip').click();
  }
  await precondition('the delicious end choice is reached', () => [...document.querySelectorAll('.dlg-cards .card')].some((c) => c.getClientRects().length > 0 && c.textContent.includes("It's delicious!")));
  await page.locator('.dlg-cards .card', { hasText: "It's delicious!" }).click();
  await precondition('solo meal finishes with dishes cleared and explore restored', () => {
    const g = window.__esl, m = g.mallMeal;
    return g.mode === 'explore' && !g.sitting && !m.seated && !m.carrying && m.dishCount === 0 && !g.world.save.mallMeal;
  });
  expect(await ev((seatId) => {
    const g = window.__esl, seat = g.scene.seats.find((s) => s.id === seatId);
    const distance = seat && Math.hypot(g.player.x - seat.x, g.player.z - seat.z);
    return distance >= 0.3 && distance < 2;
  }, soloSeatId), 'finished player stands beside the seat');
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

  const travelBefore = await ev(() => {
    const g = window.__esl, npc = g.world.npcs[0];
    const actor = g.npcs.actorFor(npc.id) || g.npcs.ensure(npc, 5, 2, 0);
    g.npcs.engage(actor);
    window.__mallCompanion = actor;
    return { time: JSON.stringify(g.world.save.time), memories: g.world.save.memories.length, xp: g.world.rel(npc.id).xp };
  });
  const floorChecks = async (floor) => {
    const r = await ev(async (floor) => {
      const g = window.__esl, a = window.__mallCompanion, p = g.player;
      const { mallFloorFor } = await import('/src/world/mall.js');
      return {
        location: g.locationId, floor: g.mallTravel.floor, theme: g.music.theme,
        companion: g.npcs.actorFor(a.npc.id) === a && a.char.root.parent === g.scene.root,
        clear: g.scene.collision.isFree(p.x, p.z, 0.3) && g.scene.collision.isFree(a.char.root.position.x, a.char.root.position.z, 0.3),
        distance: Math.hypot(p.x - a.char.root.position.x, p.z - a.char.root.position.z),
        unique: new Set(g.npcs.actors.map((n) => n.npc.id)).size === g.npcs.actors.length,
        scheduled: g.npcs.actors.filter((n) => !n.special && n !== a).every((n) => mallFloorFor(n.npc, g.world.slot(n.npc), g.world.day) === floor),
        spawns: ['escUp', 'escDown', 'elevator', ...(floor === 1 ? ['door'] : [])].every((id) => { const s = g.scene.spawns[id]; return s && g.scene.collision.isFree(s.x, s.z, 0.3); }),
      };
    }, floor);
    expect(r.location === 'mall' && r.floor === floor && r.theme === ['mall', 'mall2', 'mall3'][floor - 1], `floor ${floor} has mall location, floor state and music`);
    expect(r.companion && r.clear && r.distance >= 0.65 && r.distance < 3, `floor ${floor} carries the same companion beside a clear player spawn`);
    expect(r.unique && r.scheduled && r.spawns, `floor ${floor} has unique scheduled residents and clear named spawns`);
  };
  await use('escUp');
  await onFloor('mall2');
  await floorChecks(2);
  await shot('mall2-dining');
  await use('directory');
  await precondition('2F directory lists all floors', () => /1F Shopping/.test(document.querySelector('.dlg-panel')?.textContent || '') && document.querySelectorAll('.dlg-cards .card').length > 0);
  expect(await pump(idle, { label: '2F-directory', max: 30, prefer: ['Thank you!'] }), '2F directory ends in a choice');
  await use('escUp');
  await onFloor('mall3');
  await floorChecks(3);
  await shot('mall3-arcade-shell');
  expect(await ev(() => window.__esl.scene.interact.every((it) => ['mallEscalator', 'mallElevator', 'mallDirectory'].includes(it.kind))), 'arcade shell has no machine interactions');
  await use('directory');
  expect(await pump(idle, { label: '3F-directory', max: 30, prefer: ['Thank you!'] }), '3F directory ends in a choice');
  await use('elevator');
  await precondition('elevator choices omit current 3F', () => document.querySelectorAll('.dlg-cards .card').length === 3 && /1F Shopping/.test(document.querySelector('.dlg-cards')?.textContent || '') && !/3F Game Center/.test(document.querySelector('.dlg-cards')?.textContent || ''));
  await page.locator('.dlg-cards .card', { hasText: '1F Shopping' }).click();
  await onFloor('mall');
  await floorChecks(1);
  await use('escUp');
  await onFloor('mall2');
  await use('escDown');
  await onFloor('mall');
  await use('elevator');
  await precondition('elevator offers 2F', () => /2F Food Court/.test(document.querySelector('.dlg-cards')?.textContent || ''));
  await page.locator('.dlg-cards .card', { hasText: '2F Food Court' }).click();
  await onFloor('mall2');
  expect(await ev((before) => {
    const g = window.__esl, a = window.__mallCompanion;
    const unchanged = JSON.stringify(g.world.save.time) === before.time && g.world.save.memories.length === before.memories && g.world.rel(a.npc.id).xp === before.xp;
    g.npcs.release(a); delete window.__mallCompanion;
    return unchanged;
  }, travelBefore), 'all floor trips preserve day, period, XP and memories');
  const soloBefore = await soloBaseline();
  await setBalance(1000);
  const ramen = await orderSolo('ramen', 'ramen', 500, { evidence: true });
  expect(await ev(() => Object.isFrozen(window.__esl.mallMeal) && Object.isFrozen(window.__esl.mallMeal.diners)), 'mall meal semantic snapshot is frozen and read-only');
  await shot('mall-player-carrying-food');
  // A carried meal blocks another order, so tapping the counter cannot charge twice.
  await use('ramen');
  await precondition('counter reminds a carrying player to eat first', () => /Your food is ready!/.test(document.querySelector('.dlg-panel')?.textContent || ''));
  expect(await drive(idle, { label: 'eat-first', max: 35, prefer: ["Let's eat!"] }), 'pending food reminder ends in a choice');
  expect(await ev((balance) => window.__esl.world.save.pocketMoney.balance === balance, ramen.paid), 'counter reminder never charges for the pending meal again');
  const initialBites = await sitForMeal();
  await precondition('ramen has visibly diminished after a bite', (start) => {
    const m = window.__esl.mallMeal;
    return m.seated && m.foodId === 'ramen' && m.bitesLeft < start.bitesLeft && m.bitesLeft > 1 && m.portion > 0 && m.portion < start.portion;
  }, initialBites);
  await shot('mall-solo-mid-bite');
  await precondition('ramen is nearly finished', () => { const m = window.__esl.mallMeal; return m.seated && m.bitesLeft === 1 && m.portion > 0 && m.portion <= 0.34; });
  await shot('mall-solo-near-end');
  await finishSolo();
  expect(await ev(() => !window.__esl.world.save.mallMeal && window.__esl.mallMeal.foodId === null && window.__esl.mallMeal.diners.length === 0), 'finished ramen is removed from pending save and runtime dishes');

  await orderSolo('sweets', 'icecream', 200);
  await sitForMeal();
  await finishSolo({ skip: true });
  expect(await ev(() => window.__esl.world.save.pocketMoney.balance === 300), 'ice cream costs 200 yen and Skip adds no charge');

  await setBalance(50);
  await use('ramen');
  let sawLowBalance = false, sawWater = false;
  expect(await drive(async () => {
    const text = await page.locator('.dlg-panel').textContent().catch(() => '');
    if (/50 yen/.test(text || '') && /not enough|more (?:pocket )?money|enough money|need/.test(text || '')) sawLowBalance = true;
    if (await page.locator('.dlg-cards .card', { hasText: 'Just water, please.' }).isVisible().catch(() => false)) sawWater = true;
    return await idle() && await ev(() => window.__esl.mallMeal.carrying);
  }, { label: 'insufficient-funds', max: 120, prefer: ['I want ramen.', "I'd like ramen, please.", 'Just water, please.', 'Thank you!', "Let's eat!"] }), 'insufficient funds still leads to carrying free water');
  await precondition('insufficient funds produced a water meal', () => window.__esl.mallMeal.carrying && window.__esl.mallMeal.foodId === 'water');
  expect(sawLowBalance && sawWater, 'shopkeeper politely explains the balance and offers free water');
  expect(await ev(() => window.__esl.world.save.pocketMoney.balance === 50), 'free water keeps the low balance unchanged and nonnegative');
  await sitForMeal();
  await finishSolo({ skip: true });

  await setBalance(1000);
  const pending = await orderSolo('sushi', 'sushi', 500);
  await ev(() => window.__esl.save(true));
  await page.reload();
  await precondition('saved profile is offered after reload', () => !!document.querySelector('.profile'));
  await page.locator('.profile').first().click();
  await precondition('saved player has restarted after reload', () => !!window.__esl?.scene && window.__esl.mode === 'explore' && window.__esl.world.save.flags.fd === 'done');
  await settle();
  expect(await ev(({ id, paid }) => window.__esl.world.save.mallMeal?.id === id && window.__esl.world.save.pocketMoney.balance === paid, { id: pending.meal.id, paid: pending.paid }), 'paid pending sushi survives reload without a second charge');
  await ev(async () => { const g = window.__esl; if (g.sceneId !== 'mall2') await g.enterScene('mall2', 'elevator'); });
  await onFloor('mall2');
  await use('sushi');
  await precondition('reloaded pending meal is ready at the counter', () => /Your food is ready!/.test(document.querySelector('.dlg-panel')?.textContent || ''));
  await finishOrder('reserve-pending-sushi');
  expect(await ev(({ id, paid }) => window.__esl.mallMeal.id === id && window.__esl.mallMeal.foodId === 'sushi' && window.__esl.world.save.pocketMoney.balance === paid, { id: pending.meal.id, paid: pending.paid }), 'counter serves the same sushi meal id again without charging');
  await sitForMeal();
  await finishSolo({ skip: true });
  expect(JSON.stringify(await soloBaseline()) === JSON.stringify(soloBefore), 'all solo meals preserve exact day, period, friendship XP and memories');
  await setBalance(1000);

  await page.locator('.hbtn[data-id="phone"]').click();
  await page.locator('.plan-btn').click();
  expect(await pump(idle, { label: 'phone', max: 120, prefer: ["Let's go to Niji Mall!", 'How about tomorrow?', ...cast.map((n) => `${n.name}, do you want to come?`), "That's all!", 'See you there!'] }), 'phone composer finished');
  await settle();
  const plan = await ev(() => window.__esl.world.save.plans.find((p) => p.status === 'pending' && p.loc === 'mall') || null);
  expect(plan?.npcIds.length === 2 && plan.act === 'mall' && plan.day === 6 && plan.period === 0, 'phone made a mall plan with two friends');
  if (!plan) throw new Error('HARNESS_PRECONDITION_FAILED: No mall plan to play');
  await ev(async (plan) => { const g = window.__esl; g.world.save.time = { day: plan.day, period: plan.period }; g.world.ensureDaily(); g.hud.queue.length = 0; await g.enterScene('mall2', 'elevator'); }, plan);
  await settle();
  const before = await ev((ids) => { const w = window.__esl.world; return ids.map((id) => ({ id, xp: w.rel(id).xp, level: w.level(id), memories: w.rel(id).memories.length })); }, plan.npcIds);
  const groupBalanceBefore = await ev(() => window.__esl.world.save.pocketMoney.balance);
  // Walk to a waiting friend, then use the same Talk action as the keyboard.
  await precondition('planned friend is waiting in the food court', (id) => !!window.__esl.npcs.actorFor(id), plan.npcIds[0]);
  await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id), p = a.char.root.position; const free = g.scene.collision.nearestFree(p.x + 0.8, p.z + 0.6, 0.3); g.player.place(free.x, free.z, 0); }, plan.npcIds[0]);
  await precondition('waiting friend offers the Talk action', (id) => window.__esl.target?.actor?.npc?.id === id || window.__esl.target?.a?.npc?.id === id, plan.npcIds[0]);
  await page.locator('.action').click();
  const heard = [];
  let tableShot = false, groupDishes = null, sawStagger = false;
  expect(await drive(async () => {
    const t = await page.locator('.dlg-en').textContent().catch(() => '');
    if (t && !heard.includes(t)) heard.push(t);
    const m = await mealState();
    if (m.seated && m.diners.length === cast.length + 1 && m.dishCount === cast.length + 1) groupDishes ||= m.diners;
    if (m.seated && m.diners.length === cast.length + 1 && new Set(m.diners.map((d) => d.bitesLeft)).size > 1 && m.diners.some((d) => d.portion > 0 && d.portion < 1)) {
      sawStagger = true;
      if (!tableShot) { await shot('mall-group-mid-eating'); tableShot = true; }
    }
    return await ev(() => window.__esl.world.period === 1 && window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
  }, { label: 'group', max: 250, prefer: ["Let's go!", 'I want sushi.', "I'd like", "Let's look at one shop!", "Let's go to Books and Stationery!", 'No, thank you.', 'What do you want to eat?', 'Thank you!', "It's delicious!", 'Thank you! See you!'] }), 'mall group outing completed in one period');
  await settle();
  const after = await ev((ids) => {
    const w = window.__esl.world;
    const memory = w.save.memories.find((m) => m.act === 'mall' && ids.every((id) => m.npcIds.includes(id)));
    return { memory, friends: ids.map((id) => ({ id, xp: w.rel(id).xp, level: w.level(id), memories: w.rel(id).memories.length })) };
  }, plan.npcIds);
  expect(after.memory?.npcIds.length === 2 && after.memory.focus?.length === 0, 'group memory contains both friends and focus []');
  expect(after.memory?.detail.shop === true && await ev((before) => window.__esl.world.save.pocketMoney.balance === before - 500, groupBalanceBefore), 'player pays only 500 yen for their sushi; friends and declined shop add no charge');
  expect(after.friends.every((n, i) => n.xp - before[i].xp === 10 + (n.id === plan.npcIds[0] ? 1 : 0) && n.level === before[i].level && n.memories === before[i].memories), 'each friend receives existing 6 event XP + 4 first-time bonus; the greeted friend also gets existing 1 chat XP, with no level gate');
  expect(cast.every((n) => after.memory?.detail.orders.some((o) => o.npcId === n.id && o.foodId === n.food)), 'each friend orders their known favorite food');
  expect(heard.filter((t) => /It's for/.test(t)).length === 2, 'player can order for both known friends');
  if (!groupDishes) throw new Error('HARNESS_PRECONDITION_FAILED: group table with every ordered dish was never reached');
  expect(cast.every((n) => groupDishes.some((d) => d.npcId === n.id && d.foodId === n.food && d.seatId?.startsWith('T2-'))) && groupDishes.some((d) => d.foodId === 'sushi'), 'each diner gets their own ordered dish at the existing T2 seats');
  expect(sawStagger && tableShot && counterShot, 'group bites are staggered and shared-table evidence captured');
  expect(heard.some((t) => /Yummy!|It's delicious!/.test(t)), 'a friend reacts to the shared meal');
  expect(await ev(() => window.__esl.mallMeal.dishCount === 0 && !window.__esl.world.save.mallMeal), 'group dishes and pending player meal clear after eating');
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
