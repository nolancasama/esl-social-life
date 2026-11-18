import test from 'node:test';
import assert from 'node:assert/strict';
import { MALL_SHOPS, WEEKLY_ALLOWANCE, mallItem, pocketMoney, buyMallItem } from './mall.js';
import { buildClass } from './generator.js';
import { resolveSlot, weekendMallSlot } from './schedule.js';
import { DEFAULT_ROSTER } from '../data/roster.js';

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
