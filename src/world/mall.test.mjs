import test from 'node:test';
import assert from 'node:assert/strict';
import { MALL_SHOPS, WEEKLY_ALLOWANCE, mallItem, pocketMoney, buyMallItem, mallFloorFor,
  MALL_FOOD_PRICES, MALL_MEAL_BITES, mallFoodPrice, buyMallFood, pendingMallMeal, biteMallMeal, finishMallMeal } from './mall.js';
import { foodMesh } from '../engine/food.js';
import { migrateSave, SAVE_VERSION } from './migrate.js';
import { NpcManager } from '../game/npcs.js';
import { CollisionWorld } from '../engine/collision.js';
import { buildClass } from './generator.js';
import { resolveSlot, weekendMallSlot } from './schedule.js';
import { DEFAULT_ROSTER } from '../data/roster.js';

test('mall floor selection keeps shopping on 1F and meals and meetings on 2F', () => {
  const npc = { id: 'gamer', likes: ['games'] };
  for (let day = 0; day < 28; day++) {
    assert.equal(mallFloorFor(npc, { act: 'shopping' }, day), 1);
    for (const act of ['mall', 'sweets', 'cafe', 'eating', 'meeting']) {
      assert.equal(mallFloorFor(npc, { act }, day), 2);
    }
    assert.equal(mallFloorFor(npc, { act: 'games', hangout: 'pair' }, day), 2, 'a hangout pair meets together');
    assert.equal(mallFloorFor(npc, { loc: 'mall', act: 'mall', plan: 'plan-1' }, day), 1, 'friends with a plan wait at the 1F entrance');
  }
});

test('mall floors are deterministic, exclusive and independent of saved schedules', () => {
  const roster = buildClass(DEFAULT_ROSTER, 'mall-floor-test');
  const before = structuredClone(roster);
  const arcadeDays = new Set();
  for (const npc of roster) for (let day = 0; day < 14; day++) {
    for (const act of ['shopping', 'mall', 'games', 'reading']) {
      const slot = { loc: 'mall', act, with: [] };
      const floor = mallFloorFor(npc, slot, day);
      assert.ok([1, 2, 3].includes(floor));
      assert.equal([1, 2, 3].filter((f) => f === floor).length, 1);
      assert.equal(mallFloorFor(structuredClone(npc), structuredClone(slot), day), floor);
      if (floor === 3) assert.ok(npc.likes.includes('games'));
    }
    arcadeDays.add(mallFloorFor({ id: 'games-friend', likes: ['games'] }, { act: 'games' }, day));
    assert.notEqual(mallFloorFor({ id: npc.id, likes: ['reading'] }, { act: 'games' }, day), 3);
  }
  assert.deepEqual([...arcadeDays].sort(), [1, 3], 'games interests visit the arcade on some deterministic days');
  assert.deepEqual(roster, before, 'floor selection never changes generated interests or schedules');
});

test('mall population places each scheduled classmate on exactly one floor', () => {
  const npcs = [
    { id: 'shopper', likes: ['games'] }, { id: 'diner', likes: ['games'] },
    { id: 'gamer', likes: ['games'] }, { id: 'pair-a', likes: ['games'] }, { id: 'pair-b', likes: ['reading'] },
  ];
  const slots = [
    { loc: 'mall', act: 'shopping', with: [] }, { loc: 'mall', act: 'mall', with: [] },
    { loc: 'mall', act: 'games', with: [] },
    { loc: 'mall', act: 'mall', with: ['pair-b'], hangout: 'pair' },
    { loc: 'mall', act: 'mall', with: ['pair-a'], hangout: 'pair' },
  ];
  const placed = new Map(npcs.map((n) => [n.id, []]));
  for (const [index, sceneId] of ['mall', 'mall2', 'mall3'].entries()) {
    const world = { npcs, day: 6, slot: (n) => slots[npcs.indexOf(n)], plansNow: () => [], schoolTime: false, evening: true, daily: {}, save: { flags: { fd: 'done' } } };
    const manager = new NpcManager({ world, sceneId, scene: { collision: { dynamic: [] } } });
    manager._placeSingle = (e) => placed.get(e.n.id).push(index + 1);
    manager._placeGroup = (group) => group.forEach(manager._placeSingle);
    manager.populate();
  }
  for (const [i, n] of npcs.entries()) assert.deepEqual(placed.get(n.id), [mallFloorFor(n, slots[i], 6)]);
  assert.deepEqual(placed.get('pair-a'), placed.get('pair-b'));
});

test('floor companions retain actor identity and arrive without overlap or scheduled duplicates', () => {
  const npc = { id: 'companion', likes: ['games'] };
  const disposed = [];
  const char = { root: { visible: true, removeFromParent() {} }, yaw: 0,
    dispose: () => disposed.push(npc.id), setPosition(x, z) { this.x = x; this.z = z; }, setBase() {}, showBag() {} };
  const actor = { npc, char, engaged: true, collider: { x: 0, z: 0, r: 0.3 }, mode: 'sit', walk: {} };
  const collision = new CollisionWorld({ bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } });
  const world = { npcs: [npc], day: 6, slot: () => ({ loc: 'mall', act: 'mall', with: [] }), plansNow: () => [], schoolTime: false, evening: true, daily: {}, save: { flags: { fd: 'done' } } };
  const player = { x: 0, z: 0, collider: { x: 0, z: 0, r: 0.3 } };
  const manager = new NpcManager({ world, player, sceneId: 'mall2', scene: { collision, root: { add() {} } } });
  manager.actors = [actor];
  manager._placeSingle = () => assert.fail('an engaged companion must not also spawn from their schedule');
  manager.populate([actor]);
  assert.deepEqual(disposed, []);
  assert.equal(manager.actorFor(npc.id), actor);
  assert.equal(manager.actors.length, 1);
  assert.ok(actor.engaged);
  assert.equal(actor.walk, null);
  assert.ok(Math.hypot(char.x - player.x, char.z - player.z) >= 0.6);
  assert.ok(collision.dynamic.includes(actor.collider));
});

test('mall shops have distinct, round-yen prices and readable item hints', () => {
  assert.equal(MALL_SHOPS.length, 3);
  const ids = new Set();
  for (const shop of MALL_SHOPS) {
    assert.ok(shop.items.length >= 3 && shop.items.length <= 4);
    for (const item of shop.items) {
      assert.ok(item.price > 0 && item.price % 100 === 0);
      assert.ok(item.en && item.ja && item.souvenir);
      assert.ok(!ids.has(item.id));
      ids.add(item.id);
      assert.deepEqual(mallItem(item.id), item);
    }
  }
  assert.equal(mallItem('missing'), null);
});

test('buying cannot borrow money, and an unsuccessful purchase changes nothing', () => {
  const save = { time: { day: 0 }, souvenirs: [] };
  assert.equal(pocketMoney(save), WEEKLY_ALLOWANCE);
  assert.equal(buyMallItem(save, 'ball').balance, 300);
  const before = structuredClone(save);
  assert.equal(buyMallItem(save, 'robot').reason, 'not-enough');
  assert.deepEqual(save, before);
  assert.equal(buyMallItem(save, 'unknown').reason, 'unknown-item');
  assert.deepEqual(save, before);
  assert.equal(buyMallItem(save, 'cap').balance, 0);
  assert.equal(buyMallItem(save, 'pencils').ok, false);
  assert.equal(save.pocketMoney.balance, 0);
  assert.deepEqual(save.souvenirs, [], 'the activity owns shelf insertion');
});

test('mall food has fixed round prices, unknown food is rejected and water is free', () => {
  assert.deepEqual(MALL_FOOD_PRICES, {
    ramen: 500, spaghetti: 500, curry: 500, omurice: 500,
    hamburger: 400, sandwich: 300, pizza: 400, sushi: 500,
    riceball: 150, crepe: 400, icecream: 200, cake: 300,
    pancakes: 400, water: 0,
  });
  for (const [id, price] of Object.entries(MALL_FOOD_PRICES)) {
    assert.equal(mallFoodPrice(id), price);
    assert.ok(id === 'water' || (price >= 150 && price <= 500 && price % 50 === 0));
  }
  assert.equal(mallFoodPrice('unknown'), null);
  assert.equal(mallFoodPrice('__proto__'), null);
  const save = { time: { day: 0 }, pocketMoney: { balance: 0, week: 0 } };
  assert.equal(buyMallFood(save, 'unknown', 'bad').reason, 'unknown-food');
  assert.equal(pendingMallMeal(save), null);
  const bought = buyMallFood(save, 'water', 'free-water');
  assert.equal(bought.ok, true);
  assert.equal(bought.balance, 0);
  assert.deepEqual(bought.meal, { id: 'free-water', foodId: 'water', bites: MALL_MEAL_BITES });
});

test('mall food requires the full price and never changes time, rewards or allowance rules', () => {
  const save = { time: { day: 6, period: 1 }, pocketMoney: { balance: 499, week: 0 }, memories: [], rel: {}, stats: { activities: 0 } };
  const before = structuredClone(save);
  assert.equal(buyMallFood(save, 'ramen', 'meal-1').reason, 'not-enough');
  assert.deepEqual(save, before);
  save.pocketMoney.balance = 500;
  assert.equal(buyMallFood(save, 'ramen', 'meal-1').balance, 0);
  assert.equal(buyMallFood(save, 'ramen', 'meal-1').charged, false);
  finishMallMeal(save, 'meal-1');
  assert.equal(buyMallFood(save, 'riceball', 'meal-2').reason, 'not-enough');
  assert.equal(save.pocketMoney.balance, 0);
  assert.deepEqual(save.time, before.time);
  assert.deepEqual(save.memories, before.memories);
  assert.deepEqual(save.rel, before.rel);
  assert.deepEqual(save.stats, before.stats);
  save.time.day = 7;
  assert.equal(pocketMoney(save), WEEKLY_ALLOWANCE);
  assert.equal(pocketMoney(save), WEEKLY_ALLOWANCE);
});

test('pending meal re-serves after reload and receipts prevent charging a meal id twice', () => {
  let save = { version: 3, time: { day: 0 }, pocketMoney: { balance: 1000, week: 0 } };
  const paid = buyMallFood(save, 'sushi', 'solo-1');
  assert.equal(paid.charged, true);
  assert.equal(paid.balance, 500);
  biteMallMeal(save, 'solo-1');
  save = JSON.parse(JSON.stringify(save));
  const served = buyMallFood(save, 'sushi', 'solo-1');
  assert.equal(served.resumed, true);
  assert.equal(served.charged, false);
  assert.equal(served.balance, 500);
  assert.equal(served.meal.bites, 3);
  const otherOrder = buyMallFood(save, 'cake', 'solo-2');
  assert.equal(otherOrder.meal.foodId, 'sushi', 'an unfinished dish blocks another order');
  assert.equal(otherOrder.balance, 500);
  assert.equal(biteMallMeal(save, 'wrong-id'), null);
  assert.equal(finishMallMeal(save, 'wrong-id'), false);
  for (let i = 0; i < 5; i++) biteMallMeal(save, 'solo-1');
  assert.equal(pendingMallMeal(save).bites, 0);
  assert.equal(finishMallMeal(save, 'solo-1'), true);
  assert.equal(pendingMallMeal(save), null);
  save = JSON.parse(JSON.stringify(save));
  assert.equal(buyMallFood(save, 'sushi', 'solo-1').reason, 'already-paid');
  assert.equal(save.pocketMoney.balance, 500);
  assert.equal(finishMallMeal(save, 'solo-1'), false);
  assert.equal(buyMallFood(save, 'icecream', 'solo-2').balance, 300);
});

test('v1-v3 migration preserves optional pending meals idempotently without a version bump', () => {
  assert.equal(SAVE_VERSION, 3);
  for (const version of [1, 2, 3]) {
    const save = { version, time: { day: 3 }, mallMeal: { id: 'existing-paid', foodId: 'ramen', bites: 2 } };
    migrateSave(save);
    const before = structuredClone(save);
    migrateSave(save);
    assert.deepEqual(save, before);
    assert.equal(buyMallFood(save, 'ramen', 'existing-paid').charged, false);
    assert.equal(pocketMoney(save), WEEKLY_ALLOWANCE);
    assert.equal(finishMallMeal(save, 'existing-paid'), true);
    assert.equal(buyMallFood(save, 'ramen', 'existing-paid').reason, 'already-paid');
    const legacy = { version, time: { day: 3 } };
    migrateSave(legacy);
    assert.equal(legacy.mallMeal, undefined, 'old saves do not acquire an unfinished meal');
  }
});

test('every mall food supports four diminishing portions as one merged mesh and an empty dish', () => {
  for (const id of Object.keys(MALL_FOOD_PRICES)) {
    const full = foodMesh(id);
    const empty = foodMesh(id, { left: 0 });
    assert.ok(full.isMesh && empty.isMesh, `${id} keeps geometry callers compatible`);
    assert.equal(full.userData.left, 1);
    assert.equal(full.geometry.groups.length, 0, `${id} stays one draw call`);
    assert.ok(full.geometry.attributes.position.count > empty.geometry.attributes.position.count, `${id} leaves a container after eating`);
    const portions = [1, 0.75, 0.5, 0.25].map((left) => foodMesh(id, { left }));
    for (let i = 1; i < portions.length; i++) {
      const previous = portions[i - 1].geometry.attributes.position;
      const next = portions[i].geometry.attributes.position;
      assert.ok(next.count < previous.count || !Array.from(next.array).every((n, index) => n === previous.array[index]), `${id} visibly changes each bite`);
    }
    for (const mesh of [full, empty, ...portions]) mesh.geometry.dispose();
  }
});

test('allowance arrives once per week and reloading or moving backwards never grants it again', () => {
  const save = { time: { day: 6 } };
  buyMallItem(save, 'robot');
  save.time.day = 7;
  assert.equal(pocketMoney(save), 1500);
  assert.equal(pocketMoney(structuredClone(save)), 1500);
  save.time.day = 6;
  assert.equal(pocketMoney(save), 1500);
  save.time.day = 7;
  assert.equal(pocketMoney(save), 1500);
  save.time.day = 21;
  assert.equal(pocketMoney(save), 3500);
  assert.equal(pocketMoney({ time: { day: 200 } }), 1000, 'old saves start this week without backpay');
});

test('weekend mall schedules are deterministic and existing saved routines do not move', () => {
  const seed = 'mall-schedule-test';
  const a = buildClass(DEFAULT_ROSTER, seed);
  const b = buildClass(DEFAULT_ROSTER, seed);
  assert.deepEqual(a, b);
  // Shopping interests already generated mall slots before this expansion,
  // including weekdays. Assert the independent weekend addition itself.
  const malls = a.flatMap((npc) => {
    const added = weekendMallSlot(seed, npc);
    return added ? [{ npc, d: added[0], p: added[1] }] : [];
  });
  assert.ok(malls.length > 0, 'some classmates have a weekend mall routine');
  for (const { npc, d, p } of malls) {
    assert.ok((d === 5 && p === 0) || (d === 6 && p === 1));
    assert.equal(npc.schedule[d][p].loc, 'mall');
    assert.equal(npc.schedule[d][p].act, 'shopping');
    const ctx = { seed, plans: [], weather: () => 'rainy' };
    assert.equal(resolveSlot(ctx, npc, d, p).loc, 'mall');
    assert.equal(resolveSlot(ctx, npc, d + 7, p).loc, 'mall');
    ctx.plans.push({ id: 'player-plan', status: 'pending', npcIds: [npc.id], day: d, period: p, loc: 'park', act: 'soccer' });
    assert.equal(resolveSlot(ctx, npc, d, p).loc, 'park', 'player plans still win');
  }
  const saved = structuredClone(a);
  // Represent a legacy class whose only mall slots came from likes, not the
  // new generated shopping routine. Loading it must not add any new slots.
  for (const npc of saved) for (const day of npc.schedule) for (const slot of day) {
    if (slot.loc === 'mall' && slot.act === 'shopping') slot.loc = 'town';
  }
  const snapshot = structuredClone(saved.map((npc) => npc.schedule));
  const loaded = buildClass(DEFAULT_ROSTER, seed, { npcs: saved });
  assert.deepEqual(loaded.map((npc) => npc.schedule), snapshot);
});

test('mall schedule selection leaves shared routines and away appointments alone', () => {
  const npc = { id: 'test', schedule: Array.from({ length: 7 }, () => Array.from({ length: 3 }, () => ({ loc: 'park', act: 'soccer', with: ['friend'] }))) };
  npc.schedule[6][1] = { loc: 'away', act: 'away:grandparents', with: [] };
  assert.equal(weekendMallSlot('test', npc), null);
});
