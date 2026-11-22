import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Conversation } from '../dialogue/runner.js';
import { matchOptions } from '../dialogue/intent.js';
import { buyMallFood, biteMallMeal, mallFoodPrice } from '../world/mall.js';
import { mallMealSnapshot } from './mall-meal.js';
import { orderAtMall } from './mall.js';

const counter = { counter: 'ramen', x: -6, z: -2 };

function fixture(t, save = null) {
  const game = {
    mode: 'explore', sceneId: 'mall2', sitting: false,
    world: { save: save || { time: { day: 2, period: 1 }, pocketMoney: { balance: 1000, week: 0 }, memories: [], rel: {} } },
    player: { x: 0, z: 0, char: { root: new THREE.Group(), gesture: null,
      hold(name) { this.gesture = { name }; }, stopGesture() { this.gesture = null; } } },
    npcs: { actors: [] },
    scene: { root: new THREE.Group(), seats: [{ id: 'T1-0', x: 0, z: 1, table: 'T1' }] },
    camera: { shot() {}, snap() {} },
    hud: { manualGoal: null, setGoal(goal) { this.manualGoal = goal; } },
    saved: [], save() { this.saved.push(structuredClone(this.world.save)); },
  };
  t.mock.method(Conversation, 'start', async () => { game.mode = 'talk'; return game.conversation; });
  return game;
}

function dialogue(game, sequence) {
  const events = [], remaining = [...sequence];
  const capture = () => ({ balance: game.world.save.pocketMoney.balance, meal: structuredClone(game.world.save.mallMeal || null), snapshot: mallMealSnapshot(game) });
  const conversation = {
    events, ended: false,
    async say(who, line) {
      assert.ok(line.ja, `Japanese hint for: ${line.en}`);
      events.push({ type: 'say', line, ...capture() });
    },
    async ask(options) {
      for (const option of options) assert.ok(option.ja, `Japanese hint for choice: ${option.en}`);
      const id = remaining.shift();
      assert.ok(id, `unexpected extra choice: ${options.map((o) => o.id).join(', ')}`);
      const option = options.find((o) => o.id === id);
      assert.ok(option, `expected choice ${id}, offered: ${options.map((o) => o.id).join(', ')}`);
      events.push({ type: 'ask', options, picked: id, ...capture() });
      return option;
    },
    async end() { this.ended = true; game.mode = 'explore'; assert.deepEqual(remaining, [], 'every expected conversation step was reached'); },
  };
  game.conversation = conversation;
  return conversation;
}

test('solo ordering shows prices and balance, accepts both spoken forms and charges at hand-over with food already carried', async (t) => {
  const game = fixture(t), priorTime = structuredClone(game.world.save.time);
  const c = dialogue(game, ['ramen', 'price', 'order', 'thanks', 'eat']);
  await orderAtMall(game, counter);
  const menu = c.events.find((e) => e.type === 'ask');
  assert.match(menu.options.find((o) => o.id === 'ramen').en, /¥500/);
  assert.match(menu.options.find((o) => o.id === 'water').en, /¥0/);
  assert.equal(menu.balance, 1000, 'viewing a menu never charges');
  assert.ok(c.events.some((e) => e.type === 'say' && e.line.en.includes('You have 1000 yen.')));
  const price = c.events.find((e) => e.type === 'say' && e.line.en.startsWith("It's 500 yen."));
  assert.ok(price);
  assert.equal(price.balance, 1000);
  assert.match(price.line.en, /You have 1000 yen/);
  const order = c.events.find((e) => e.type === 'ask' && e.picked === 'order');
  assert.equal(order.balance, 1000);
  assert.equal(matchOptions(["I'd like ramen, please."], order.options)?.option.id, 'order');
  assert.equal(matchOptions(['A ramen, please.'], order.options)?.option.id, 'order');
  const handovers = c.events.filter((e) => e.type === 'say' && e.line.en === 'Here you are.');
  assert.equal(handovers.length, 1);
  assert.equal(handovers[0].balance, 500);
  assert.equal(handovers[0].snapshot.carrying, true);
  assert.equal(handovers[0].snapshot.foodId, 'ramen');
  assert.equal(handovers[0].meal.bites, 4);
  assert.equal(c.events.find((e) => e.type === 'ask' && e.picked === 'thanks').options[0].en, 'Thank you!');
  assert.ok(c.events.some((e) => e.type === 'say' && e.line.en === 'You have 500 yen now.'));
  assert.equal(c.events.at(-1).picked, 'eat', 'the conversation ends in a choice');
  assert.equal(game.world.save.mallMealReceipts.length, 1);
  assert.equal(game.player.char.root.children.length, 1);
  assert.equal(game.mode, 'explore');
  assert.equal(c.ended, true);
  assert.deepEqual(game.world.save.time, priorTime);
  assert.deepEqual(game.world.save.memories, []);
  assert.deepEqual(game.world.save.rel, {});
});

test('returning to a counter with carried food gives a reminder without offering or charging another order', async (t) => {
  const game = fixture(t);
  dialogue(game, ['ramen', 'order', 'thanks', 'eat']);
  await orderAtMall(game, counter);
  const paid = structuredClone(game.world.save);
  const c = dialogue(game, ['eat']);
  await orderAtMall(game, counter);
  assert.ok(c.events.some((e) => e.type === 'say' && e.line.en === 'Your food is ready!'));
  assert.ok(c.events.some((e) => e.type === 'say' && e.line.en === 'Please sit and eat first.'));
  assert.deepEqual(c.events.filter((e) => e.type === 'ask').map((e) => e.options.map((o) => o.id)), [['eat']]);
  assert.equal(c.events.filter((e) => e.type === 'say' && e.line.en === 'Here you are.').length, 0);
  assert.deepEqual(game.world.save, paid);
  assert.equal(mallMealSnapshot(game).carrying, true);
  assert.equal(game.player.char.root.children.length, 1, 'a reminder does not duplicate the prop');
});

test('a reloaded partial pending meal is re-served with the same id and portion without another payment', async (t) => {
  const save = { time: { day: 2, period: 1 }, pocketMoney: { balance: 1000, week: 0 } };
  buyMallFood(save, 'sushi', 'saved-sushi');
  biteMallMeal(save, 'saved-sushi');
  biteMallMeal(save, 'saved-sushi');
  const game = fixture(t, JSON.parse(JSON.stringify(save)));
  const c = dialogue(game, ['thanks', 'eat']);
  assert.equal(mallMealSnapshot(game).phase, 'ready');
  assert.equal(mallMealSnapshot(game).carrying, false);
  await orderAtMall(game, counter);
  assert.equal(c.events[0].line.en, 'Your food is ready!');
  assert.deepEqual(c.events.filter((e) => e.type === 'ask').map((e) => e.picked), ['thanks', 'eat']);
  const handover = c.events.find((e) => e.type === 'say' && e.line.en === 'Here you are.');
  assert.ok(handover);
  assert.equal(handover.snapshot.carrying, true);
  assert.equal(handover.snapshot.id, 'saved-sushi');
  assert.equal(handover.snapshot.foodId, 'sushi');
  assert.equal(handover.snapshot.bitesLeft, 2);
  assert.equal(handover.snapshot.portion, 0.5);
  assert.equal(handover.balance, 500);
  assert.deepEqual(game.world.save.mallMeal, save.mallMeal);
  assert.deepEqual(game.world.save.mallMealReceipts, ['saved-sushi']);
  assert.equal(game.world.save.pocketMoney.balance, 500);
});

test('insufficient funds politely offer affordable food and free water, then hand over water without a negative balance', async (t) => {
  const game = fixture(t);
  game.world.save.pocketMoney.balance = 50;
  const c = dialogue(game, ['ramen', 'order', 'water', 'order', 'thanks', 'eat']);
  await orderAtMall(game, counter);
  const insufficient = c.events.find((e) => e.type === 'say' && e.line.en.includes("don't have enough money"));
  assert.ok(insufficient);
  assert.match(insufficient.line.en, /You have 50 yen/);
  assert.match(insufficient.line.en, /free water/);
  assert.equal(insufficient.balance, 50);
  assert.equal(insufficient.meal, null, 'an unaffordable choice creates no meal or charge');
  const alternatives = c.events.find((e) => e.type === 'ask' && e.picked === 'water');
  assert.ok(alternatives.options.some((o) => o.id === 'water'));
  assert.ok(alternatives.options.every((o) => mallFoodPrice(o.id) <= 50));
  assert.match(alternatives.options.find((o) => o.id === 'water').en, /Just water, please/);
  const handover = c.events.find((e) => e.type === 'say' && e.line.en === 'Here you are.');
  assert.equal(handover.snapshot.foodId, 'water');
  assert.equal(handover.snapshot.carrying, true);
  assert.equal(handover.balance, 50);
  assert.ok(c.events.every((e) => e.balance >= 0));
  assert.equal(game.world.save.pocketMoney.balance, 50);
  assert.equal(game.world.save.mallMealReceipts.length, 1);
  assert.equal(c.events.at(-1).picked, 'eat');
});
