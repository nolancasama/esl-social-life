// Phase 1 reliability (DESIGN_DECISIONS 2026-11-23): explicit activity
// outcomes, no charge for owned items, idempotent outing meals, fault points
// and the until() tick guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activityOutcome, rewardable, COMPLETED, FAILED, CANCELLED } from './outcome.js';
import { buyMallItem, ownsMallItem, buyMallFood, servePaidMallMeal, outingMealId, finishMallMeal, pocketMoney } from '../world/mall.js';
import { armFault, faultPoint, armedFault } from '../core/fault.js';
import { until } from './ballplay.js';

test('only a completed outcome is rewardable', () => {
  assert.equal(activityOutcome({ score: 3, detail: { a: 1 } }).status, COMPLETED, 'older activities without a status complete');
  assert.ok(rewardable(activityOutcome({ score: 3 })));
  assert.equal(activityOutcome({ status: 'cancelled' }).status, CANCELLED);
  assert.ok(!rewardable(activityOutcome({ status: 'cancelled' })));
  assert.equal(activityOutcome({ score: 0, error: true }).status, FAILED, 'the old error flag is a failure');
  for (const raw of [null, undefined, 3, 'done']) assert.equal(activityOutcome(raw).status, FAILED);
  const thrown = activityOutcome({ score: 3 }, new Error('boom'));
  assert.equal(thrown.status, FAILED);
  assert.ok(!rewardable(thrown));
  assert.deepEqual(activityOutcome({ detail: 'bad' }).detail, {}, 'detail is always an object');
  assert.ok(!rewardable(null));
});

test('an owned unique item is never charged again', () => {
  const save = { time: { day: 0 }, souvenirs: [] };
  pocketMoney(save);
  const first = buyMallItem(save, 'kendama');
  assert.ok(first.ok);
  assert.equal(save.pocketMoney.balance, 700);
  assert.ok(!ownsMallItem(save, 'kendama'), 'ownership is the shelf souvenir the activity adds');
  save.souvenirs.push({ kind: 'mall_kendama', npcId: null });
  assert.ok(ownsMallItem(save, 'kendama'));
  const before = structuredClone(save);
  const again = buyMallItem(save, 'kendama');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'owned');
  assert.deepEqual(save, before, 'nothing changes');
  assert.ok(!ownsMallItem(save, 'missing'));
});

test('a replayed outing meal is served from its receipt without a second charge', () => {
  const save = { time: { day: 5, period: 0 }, souvenirs: [] };
  pocketMoney(save);
  const id = outingMealId(save);
  assert.equal(id, 'outing-meal:5:0');
  assert.equal(servePaidMallMeal(save, 'ramen', id), null, 'no receipt yet: must pay');
  const paid = buyMallFood(save, 'ramen', id);
  assert.ok(paid.ok && paid.charged);
  const balance = save.pocketMoney.balance;
  assert.ok(finishMallMeal(save, id));
  // Reload before the outing's reward was saved: the same slot replays.
  const replay = structuredClone(save);
  assert.equal(buyMallFood(replay, 'sushi', id).reason, 'already-paid');
  const served = servePaidMallMeal(replay, 'sushi', id);
  assert.equal(served.id, id);
  assert.equal(replay.pocketMoney.balance, balance, 'no new charge');
  assert.equal(servePaidMallMeal(replay, 'sushi', id).id, id, 'serving twice is idempotent');
  assert.equal(servePaidMallMeal(replay, 'unknown', id), null);
  save.time.period = 1;
  assert.notEqual(outingMealId(save), id, 'a new period is a new outing');
});

test('fault points throw once when armed and never otherwise', () => {
  faultPoint('activity:play');
  armFault('activity:play', { force: true });
  assert.equal(armedFault(), 'activity:play');
  faultPoint('scene:enter');
  assert.throws(() => faultPoint('activity:play'), /injected at activity:play/);
  assert.doesNotThrow(() => faultPoint('activity:play'), 'disarmed after firing');
  assert.equal(armFault('arcade:tick'), false, 'node tests are not a dev build');
  assert.equal(armedFault(), null);
});

test('a throwing activity tick rejects instead of hanging, and abort rejects too', async () => {
  const game = { activityTick: null, activityAbort: null };
  let n = 0;
  const p = until(game, () => { n++; if (n === 2) throw new Error('tick broke'); return false; });
  game.activityTick(0.016);
  game.activityTick(0.016);
  await assert.rejects(p, /tick broke/);
  assert.equal(game.activityTick, null);
  assert.equal(game.activityAbort, null);
  const q = until(game, () => false);
  game.activityAbort(new Error('recovered'));
  await assert.rejects(q, /recovered/);
  assert.equal(game.activityTick, null);
  const r = until(game, () => true);
  game.activityTick(0.016);
  await r;
  assert.equal(game.activityTick, null);
});
