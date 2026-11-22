// Shared meal presentation. Save mutations stay in world/mall; this owns only
// carried props, free-seat cues and the timed consumption of individual dishes.
import * as THREE from 'three';
import { StaticBuilder, G } from '../engine/builder.js';
import { foodMesh, trayMesh } from '../engine/food.js';
import { pendingMallMeal, biteMallMeal, finishMallMeal, MALL_MEAL_BITES } from '../world/mall.js';
import { Conversation, opt } from '../dialogue/runner.js';
import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';

const states = new WeakMap();
const state = (game) => {
  if (!states.has(game)) states.set(game, { carry: null, cues: null, cueKey: '', diners: [], session: null });
  return states.get(game);
};
const removeMesh = (mesh) => { mesh?.removeFromParent(); mesh?.geometry?.dispose(); };

export function freeMallSeats(game) {
  if (game.sceneId !== 'mall2') return [];
  return game.scene.seats.filter((seat) => !game.npcs.actors.some((a) => a.char.root.visible &&
    Math.hypot(a.char.root.position.x - seat.x, a.char.root.position.z - seat.z) < 0.65));
}

export function mallSeatInteractions(game) {
  if (!state(game).carry || game.sceneId !== 'mall2') return [];
  return freeMallSeats(game).map((s) => ({ id: `mallSeat:${s.id}`, kind: 'mallSeat', seatId: s.id,
    x: s.x, z: s.z, r: 0.85, icon: '🍽️', label: { en: 'Sit and eat', ja: 'すわって食べる' } }));
}

function removeCarry(game) {
  const s = state(game);
  if (s.carry) {
    s.carry.root.traverse((m) => m.geometry?.dispose());
    s.carry.root.removeFromParent();
    s.carry = null;
    if (game.player.char.gesture?.name === 'hold') game.player.char.stopGesture();
  }
  removeMesh(s.cues); s.cues = null; s.cueKey = '';
  if (game.hud.manualGoal?.mallMeal) game.hud.setGoal(null);
}

export function setDownMallMeal(game) { removeCarry(game); }

export function carryMallMeal(game, meal) {
  removeCarry(game);
  const root = new THREE.Group();
  if (!['crepe', 'icecream', 'riceball', 'hamburger'].includes(meal.foodId)) root.add(trayMesh());
  const food = foodMesh(meal.foodId, { left: meal.bites / MALL_MEAL_BITES });
  food.position.y = 0.025;
  root.add(food);
  // A root attachment keeps the tray level while the existing hold pose raises
  // both hands; it follows walking and turning without another animation.
  root.position.set(0, 0.6, 0.33);
  game.player.char.root.add(root);
  state(game).carry = { id: meal.id, root, scene: game.scene };
  game.player.char.hold('hold');
  const seat = freeMallSeats(game).sort((a, b) => Math.hypot(a.x - game.player.x, a.z - game.player.z) - Math.hypot(b.x - game.player.x, b.z - game.player.z))[0];
  if (seat) game.hud.setGoal({ mallMeal: true, icon: '🍽️', en: 'Sit and eat', ja: 'すわって食べる', loc: 'mall', local: true, temp: true, target: { x: seat.x, z: seat.z, label: 'Sit and eat' } });
}

export function placeMallDish(game, { char, npcId = null, foodId, seat, mealId = null, bites = MALL_MEAL_BITES }) {
  const table = game.scene.tables.find((t) => t.id === seat.table);
  const mesh = foodMesh(foodId, { left: bites / MALL_MEAL_BITES });
  mesh.position.set(table.x + (seat.x - table.x) * 0.4, 0.795, table.z + (seat.z - table.z) * 0.4);
  game.scene.root.add(mesh);
  const diner = { char, npcId, foodId, seatId: seat.id, mealId, bitesLeft: bites, mesh };
  state(game).diners.push(diner);
  return diner;
}

function portion(diner, bites) {
  const replacement = foodMesh(diner.foodId, { left: bites / MALL_MEAL_BITES });
  diner.mesh.geometry.dispose();
  diner.mesh.geometry = replacement.geometry;
  diner.bitesLeft = bites;
}

export function clearMallDishes(game) {
  const s = state(game);
  for (const d of s.diners) removeMesh(d.mesh);
  s.diners = [];
}

function endConsumption(game, finished) {
  const s = state(game), session = s.session;
  if (!session) return;
  s.session = null;
  session.skip.remove();
  if (finished) {
    for (const d of s.diners) {
      portion(d, 0);
      if (d.mealId) finishMallMeal(game.world.save, d.mealId);
    }
    game.save(true);
  }
  for (const d of s.diners) d.char.stopGesture();
  clearMallDishes(game);
  session.resolve(finished);
}

export function cancelMallConsumption(game) { endConsumption(game, false); }

export function consumeMallMeal(game) {
  const s = state(game);
  game.dialogue.close();
  return new Promise((resolve) => {
    const skip = el('button', { class: 'hbtn mall-meal-skip', text: 'Skip / さいごまで',
      style: { position: 'absolute', bottom: '110px', right: '24px', pointerEvents: 'auto', zIndex: '30' },
      onclick: () => endConsumption(game, true) });
    game.uiRoot.appendChild(skip);
    s.session = { scene: game.scene, elapsed: 0, resolve, skip };
    s.diners.forEach((d, i) => { d.next = 0.25 + i * 0.38; d.chewing = false; d.interval = 1.45 + i * 0.12; });
  });
}

/** Called by the game loop, so paused games also pause their bites. */
export function updateMallMeal(game, dt) {
  const s = state(game);
  if (s.carry && (s.carry.scene !== game.scene || !pendingMallMeal(game.world.save))) removeCarry(game);
  if (s.session) {
    if (s.session.scene !== game.scene) { endConsumption(game, false); return; }
    const session = s.session;
    session.elapsed += dt;
    for (const d of s.diners) {
      if (!d.bitesLeft || session.elapsed < d.next) continue;
      if (!d.chewing) {
        d.char.play('eat', 1.05);
        d.chewing = true;
        d.next += 0.85;
        if (!d.npcId && game.settings.sfx) sfx.eat();
      } else {
        portion(d, d.bitesLeft - 1);
        if (d.mealId) { biteMallMeal(game.world.save, d.mealId); game.save(true); }
        d.chewing = false;
        d.next += d.interval - 0.85;
      }
    }
    if (s.diners.every((d) => d.bitesLeft === 0)) endConsumption(game, true);
  }
  if (s.carry && game.mode === 'explore') {
    if (game.player.char.gesture?.name !== 'hold') game.player.char.hold('hold');
    const seats = freeMallSeats(game), key = seats.map((seat) => seat.id).join('|');
    if (key !== s.cueKey) {
      removeMesh(s.cues); s.cues = null; s.cueKey = key;
      if (seats.length) {
        const b = new StaticBuilder();
        for (const seat of seats) b.add(G.torus(0.34, 0.035, 4, 16), '#48CBB0', { x: seat.x, y: 0.51, z: seat.z, rx: -Math.PI / 2 });
        s.cues = b.build(); game.scene.root.add(s.cues);
      }
    }
  }
}

export function mallMealSnapshot(game) {
  const s = state(game), meal = pendingMallMeal(game.world.save);
  const diners = Object.freeze(s.diners.map((d) => Object.freeze({ npcId: d.npcId, foodId: d.foodId, seatId: d.seatId,
    bitesLeft: d.bitesLeft, portion: d.bitesLeft / MALL_MEAL_BITES, placed: d.mesh.parent === game.scene?.root })));
  return Object.freeze({ id: meal?.id ?? null, foodId: meal?.foodId ?? null, bitesLeft: meal?.bites ?? 0,
    portion: meal ? meal.bites / MALL_MEAL_BITES : 0, carrying: !!s.carry?.root.parent,
    seated: !!game.sitting && diners.length > 0, dishCount: diners.filter((d) => d.placed).length,
    phase: s.session ? 'eating' : s.carry ? 'carrying' : meal ? 'ready' : 'idle', diners });
}

export async function eatSoloMallMeal(game, seatId) {
  const s = state(game), meal = pendingMallMeal(game.world.save);
  const seat = freeMallSeats(game).find((it) => it.id === seatId);
  if (!meal || !s.carry || !seat || game.mode !== 'explore') return;
  const c = await Conversation.start(game, [], { frame: false });
  const scene = game.scene;
  try {
    removeCarry(game);
    game.player.place(seat.x, seat.z, seat.yaw);
    game.player.char.stopGesture();
    game.player.char.setBase('sit', { height: seat.seatY });
    game.sitting = true;
    const table = scene.tables.find((t) => t.id === seat.table);
    game.camera.shot(new THREE.Vector3(table.x + 0.3, 2.8, table.z + 3.5), new THREE.Vector3(table.x, 0.9, table.z), 4.6);
    game.camera.snap();
    placeMallDish(game, { char: game.player.char, foodId: meal.foodId, seat, mealId: meal.id, bites: meal.bites });
    if (await consumeMallMeal(game)) {
      await c.ask([opt('yum', "It's delicious!", 'おいしい！', { phrases: ["it's delicious", 'yummy'], keys: [['delicious', 'yummy']] })]);
    }
  } finally {
    cancelMallConsumption(game);
    clearMallDishes(game);
    game.sitting = false;
    game.player.char.setBase('idle');
    if (game.scene === scene) {
      const pos = scene.collision.nearestFree(seat.x - Math.sin(seat.yaw) * 0.65, seat.z - Math.cos(seat.yaw) * 0.65, 0.32, { dynamic: true, ignore: game.player });
      game.player.place(pos.x, pos.z, seat.yaw);
    }
    await c.end();
    game.save(true);
  }
}
