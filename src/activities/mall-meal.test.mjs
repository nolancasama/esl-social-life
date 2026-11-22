import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Conversation } from '../dialogue/runner.js';
import { buyMallFood, pendingMallMeal } from '../world/mall.js';
import { freeMallSeats, mallSeatInteractions, carryMallMeal, placeMallDish,
  consumeMallMeal, updateMallMeal, mallMealSnapshot, eatSoloMallMeal } from './mall-meal.js';

function character() {
  return { root: new THREE.Group(), gesture: null, plays: [], bases: [],
    hold(name) { this.gesture = { name }; },
    play(name, duration) { this.plays.push({ name, duration }); this.gesture = { name }; },
    stopGesture() { this.gesture = null; },
    setBase(name, options) { this.bases.push({ name, options }); },
  };
}

function fixture(t, save = null) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ style: {}, listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    remove() { this.parent.children = this.parent.children.filter((child) => child !== this); },
    click() { this.listeners.click(); },
  }) };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const seats = [
    { id: 'T1-0', table: 'T1', x: -0.8, z: 0, yaw: Math.PI / 2, seatY: 0.5 },
    { id: 'T1-1', table: 'T1', x: 0.8, z: 0, yaw: -Math.PI / 2, seatY: 0.5 },
    { id: 'T1-2', table: 'T1', x: 0, z: -0.8, yaw: 0, seatY: 0.5 },
  ];
  const player = { char: character(), x: -2, z: 0,
    place(x, z, yaw) { this.x = x; this.z = z; this.char.root.position.set(x, 0, z); this.char.root.rotation.y = yaw; },
  };
  const game = {
    sceneId: 'mall2', mode: 'explore', sitting: false, settings: { sfx: false }, player,
    scene: { root: new THREE.Group(), seats, tables: [{ id: 'T1', x: 0, z: 0 }],
      collision: { nearestFree: (x, z) => ({ x, z }) } },
    world: { save: save || { time: { day: 2, period: 1 }, pocketMoney: { balance: 1000, week: 0 }, memories: [], rel: {}, stats: { activities: 0 } } },
    npcs: { actors: [] },
    hud: { manualGoal: null, setGoal(goal) { this.manualGoal = goal; } },
    dialogue: { closed: 0, close() { this.closed++; } },
    uiRoot: { children: [], appendChild(child) { this.children.push(child); child.parent = this; } },
    camera: { shot() {}, snap() {} },
    saves: [], save() { this.saves.push(structuredClone(this.world.save)); },
  };
  return game;
}

function order(game, foodId = 'ramen', id = 'test-meal') {
  const result = buyMallFood(game.world.save, foodId, id);
  assert.equal(result.ok, true);
  return result.meal;
}

function advance(game, seconds) { updateMallMeal(game, seconds); }

test('carrying food offers only free seats, follows the player and clears on leaving the floor', (t) => {
  const game = fixture(t);
  const occupied = character(); occupied.root.position.set(-0.8, 0, 0);
  const invisible = character(); invisible.root.visible = false; invisible.root.position.set(0.8, 0, 0);
  game.npcs.actors.push({ char: occupied }, { char: invisible });
  assert.deepEqual(freeMallSeats(game).map((s) => s.id), ['T1-1', 'T1-2']);
  assert.deepEqual(mallSeatInteractions(game), []);
  const meal = order(game);
  carryMallMeal(game, meal);
  assert.equal(mallMealSnapshot(game).carrying, true);
  assert.equal(game.player.char.root.children.length, 1, 'carried food is attached to the player');
  assert.equal(game.player.char.gesture.name, 'hold');
  assert.deepEqual(mallSeatInteractions(game).map((s) => s.seatId), ['T1-1', 'T1-2']);
  assert.equal(game.hud.manualGoal.target.label, 'Sit and eat');
  advance(game, 0.1);
  assert.equal(game.scene.root.children.length, 1, 'free seat cues share one merged mesh');
  const oldScene = game.scene;
  game.sceneId = 'mall'; game.scene = { root: new THREE.Group(), seats: [] };
  advance(game, 0.1);
  assert.equal(mallMealSnapshot(game).phase, 'ready');
  assert.equal(mallMealSnapshot(game).carrying, false);
  assert.equal(game.player.char.root.children.length, 0);
  assert.equal(oldScene.root.children.length, 0);
  assert.equal(game.hud.manualGoal, null);
  assert.deepEqual(pendingMallMeal(game.world.save), meal);
  assert.deepEqual(freeMallSeats(game), []);
});

test('semantic meal snapshots freeze each nested diner and do not change retroactively', (t) => {
  const game = fixture(t), meal = order(game);
  placeMallDish(game, { char: game.player.char, foodId: meal.foodId, seat: game.scene.seats[0], mealId: meal.id });
  game.sitting = true;
  const snapshot = mallMealSnapshot(game);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.diners));
  assert.ok(Object.isFrozen(snapshot.diners[0]));
  assert.equal(snapshot.seated, true);
  assert.equal(snapshot.diners[0].placed, true);
  assert.throws(() => { snapshot.diners[0].bitesLeft = 0; }, TypeError);
  const consumption = consumeMallMeal(game);
  advance(game, 0.3); advance(game, 0.9);
  assert.equal(mallMealSnapshot(game).bitesLeft, 3);
  assert.equal(snapshot.bitesLeft, 4);
  assert.equal(snapshot.diners[0].bitesLeft, 4);
  game.uiRoot.children[0].click();
  return consumption;
});

test('shared consumption places each ordered dish, staggers bites and clears every dish on completion', async (t) => {
  const game = fixture(t), meal = order(game);
  const friends = [character(), character()];
  const diners = [
    placeMallDish(game, { char: game.player.char, foodId: 'ramen', seat: game.scene.seats[0], mealId: meal.id }),
    placeMallDish(game, { char: friends[0], npcId: 'friend-a', foodId: 'sushi', seat: game.scene.seats[1] }),
    placeMallDish(game, { char: friends[1], npcId: 'friend-b', foodId: 'icecream', seat: game.scene.seats[2] }),
  ];
  assert.deepEqual(mallMealSnapshot(game).diners.map((d) => [d.foodId, d.placed]), [['ramen', true], ['sushi', true], ['icecream', true]]);
  assert.ok(Math.abs(diners[0].mesh.position.x + 0.32) < 1e-9);
  assert.equal(diners[0].mesh.position.y, 0.795);
  assert.equal(diners[0].mesh.position.z, 0);
  const initialPositions = Array.from(diners[0].mesh.geometry.attributes.position.array);
  const prior = structuredClone(game.world.save);
  const consumption = consumeMallMeal(game);
  advance(game, 0.26);
  assert.equal(game.player.char.plays.length, 1);
  assert.deepEqual(friends.map((char) => char.plays.length), [0, 0]);
  advance(game, 0.4);
  assert.deepEqual(friends.map((char) => char.plays.length), [1, 0]);
  advance(game, 0.4);
  assert.deepEqual(friends.map((char) => char.plays.length), [1, 1]);
  advance(game, 0.15);
  assert.deepEqual(mallMealSnapshot(game).diners.map((d) => d.bitesLeft), [3, 4, 4]);
  assert.notDeepEqual(Array.from(diners[0].mesh.geometry.attributes.position.array), initialPositions);
  assert.equal(pendingMallMeal(game.world.save).bites, 3);
  for (let steps = 0; mallMealSnapshot(game).phase === 'eating' && steps < 150; steps++) advance(game, 0.1);
  assert.equal(mallMealSnapshot(game).phase, 'idle', 'all diners finish within the bounded simulation');
  assert.equal(await consumption, true);
  assert.deepEqual([game.player.char, ...friends].map((char) => char.plays.length), [4, 4, 4]);
  assert.equal(mallMealSnapshot(game).dishCount, 0);
  assert.equal(game.scene.root.children.length, 0);
  assert.equal(game.uiRoot.children.length, 0);
  assert.equal(pendingMallMeal(game.world.save), null);
  assert.equal(game.world.save.pocketMoney.balance, prior.pocketMoney.balance);
  assert.deepEqual(game.world.save.time, prior.time);
  assert.deepEqual(game.world.save.memories, prior.memories);
  assert.deepEqual(game.world.save.rel, prior.rel);
  assert.deepEqual(game.world.save.stats, prior.stats);
});

test('Skip finishes a second food immediately with the same cleared, paid end state', async (t) => {
  const game = fixture(t), meal = order(game, 'icecream');
  placeMallDish(game, { char: game.player.char, foodId: meal.foodId, seat: game.scene.seats[0], mealId: meal.id });
  const consumption = consumeMallMeal(game);
  assert.equal(mallMealSnapshot(game).phase, 'eating');
  game.uiRoot.children[0].click();
  assert.equal(await consumption, true);
  assert.equal(mallMealSnapshot(game).phase, 'idle');
  assert.equal(mallMealSnapshot(game).dishCount, 0);
  assert.equal(pendingMallMeal(game.world.save), null);
  assert.equal(buyMallFood(game.world.save, 'icecream', meal.id).reason, 'already-paid');
  assert.equal(game.world.save.pocketMoney.balance, 800);
  assert.equal(game.player.char.plays.length, 0);
});

test('changing scenes during eating retains the paid remaining portion for reload and re-service', async (t) => {
  const game = fixture(t), meal = order(game, 'sushi');
  placeMallDish(game, { char: game.player.char, foodId: meal.foodId, seat: game.scene.seats[0], mealId: meal.id });
  const consumption = consumeMallMeal(game);
  advance(game, 0.3); advance(game, 0.9);
  const oldScene = game.scene;
  game.scene = { root: new THREE.Group(), seats: [] }; game.sceneId = 'mall';
  advance(game, 0.1);
  assert.equal(await consumption, false);
  assert.equal(oldScene.root.children.length, 0);
  assert.equal(game.uiRoot.children.length, 0);
  assert.deepEqual(pendingMallMeal(game.world.save), { id: meal.id, foodId: 'sushi', bites: 3 });
  const reloaded = JSON.parse(JSON.stringify(game.world.save));
  const served = buyMallFood(reloaded, 'sushi', meal.id);
  assert.equal(served.charged, false);
  assert.equal(served.balance, 500);
  assert.equal(served.meal.bites, 3);
});

test('solo eating sits at the requested free seat, offers a final choice and stands beside it', async (t) => {
  const game = fixture(t), meal = order(game, 'hamburger');
  const choices = [];
  t.mock.method(Conversation, 'start', async () => {
    game.mode = 'talk';
    return { ask: async (options) => { choices.push(options); return options[0]; }, end: async () => { game.mode = 'explore'; } };
  });
  carryMallMeal(game, meal);
  const eating = eatSoloMallMeal(game, 'T1-0');
  await Promise.resolve();
  assert.equal(game.sitting, true);
  assert.equal(mallMealSnapshot(game).seated, true);
  assert.equal(mallMealSnapshot(game).carrying, false);
  assert.equal(game.player.char.bases.at(-1).name, 'sit');
  assert.equal(game.player.char.bases.at(-1).options.height, 0.5);
  game.uiRoot.children[0].click();
  await eating;
  assert.equal(choices.length, 1);
  assert.equal(choices[0][0].en, "It's delicious!");
  assert.ok(choices[0][0].ja);
  assert.equal(game.mode, 'explore');
  assert.equal(game.sitting, false);
  assert.equal(game.player.char.bases.at(-1).name, 'idle');
  assert.ok(Math.hypot(game.player.x - game.scene.seats[0].x, game.player.z - game.scene.seats[0].z) >= 0.64);
  assert.equal(mallMealSnapshot(game).dishCount, 0);
  assert.equal(pendingMallMeal(game.world.save), null);
});
