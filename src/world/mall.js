import { hashString } from '../core/rng.js';

/** Derive one floor without consuming the schedule generator's RNG or editing saves. */
export function mallFloorFor(npc, slot, day) {
  if (slot.act === 'shopping') return 1;
  // Authored meals and meetings stay together, including an explicit hangout pair.
  if (slot.hangout || ['mall', 'cafe', 'sweets', 'eat', 'eating', 'meet', 'meeting', 'food', 'lunch', 'dinner'].includes(slot.act)) return 2;
  if (npc.likes?.includes('games') && hashString(`mall-floor-v1|${npc.id}|${day}`) % 2 === 0) return 3;
  return 1;
}

// Mall shopping is pure save logic: prices are fixed, and money never borrows.
export const WEEKLY_ALLOWANCE = 1000;

// Mall-only prices. The café intentionally does not use this purchase path.
export const MALL_FOOD_PRICES = Object.freeze({
  ramen: 500, spaghetti: 500, curry: 500, omurice: 500,
  hamburger: 400, sandwich: 300, pizza: 400, sushi: 500,
  riceball: 150, crepe: 400, icecream: 200, cake: 300,
  pancakes: 400, water: 0,
});
export const MALL_MEAL_BITES = 4;

export function mallFoodPrice(id) {
  return Object.hasOwn(MALL_FOOD_PRICES, id) ? MALL_FOOD_PRICES[id] : null;
}

// Meal ids are unique per order, so only recent receipts can ever be replayed.
const MAX_RECEIPTS = 20;
const keepReceipt = (save, mealId) => [...(save.mallMealReceipts || []), mealId].slice(-MAX_RECEIPTS);

/** Optional v3 save data: inspecting a pending meal never changes the wallet. */
export function pendingMallMeal(save) {
  const meal = save.mallMeal;
  return meal && typeof meal.id === 'string' && meal.id.length > 0 &&
    mallFoodPrice(meal.foodId) !== null && Number.isInteger(meal.bites) &&
    meal.bites >= 0 && meal.bites <= MALL_MEAL_BITES ? meal : null;
}

/** Called at hand-over only. A receipt survives clearing the dish and reloads. */
export function buyMallFood(save, foodId, mealId) {
  const price = mallFoodPrice(foodId);
  const balance = pocketMoney(save);
  if (price === null) return { ok: false, reason: 'unknown-food', balance };
  if (typeof mealId !== 'string' || !mealId) return { ok: false, reason: 'invalid-meal-id', balance };
  const pending = pendingMallMeal(save);
  if (pending) return { ok: true, meal: pending, balance, charged: false, resumed: true };
  if (save.mallMealReceipts?.includes(mealId)) return { ok: false, reason: 'already-paid', balance };
  if (balance < price) return { ok: false, reason: 'not-enough', balance, price };
  save.pocketMoney.balance -= price;
  save.mallMeal = { id: mealId, foodId, bites: MALL_MEAL_BITES };
  save.mallMealReceipts = keepReceipt(save, mealId);
  return { ok: true, meal: save.mallMeal, balance: save.pocketMoney.balance, charged: true, resumed: false };
}

/** Keep even an empty portion valid until the presentation finishes the meal. */
export function biteMallMeal(save, mealId) {
  const meal = pendingMallMeal(save);
  if (!meal || meal.id !== mealId) return null;
  meal.bites = Math.max(0, meal.bites - 1);
  return meal;
}

export function finishMallMeal(save, mealId) {
  const meal = pendingMallMeal(save);
  if (!meal || meal.id !== mealId) return false;
  // Covers a pending meal in an older v3 save that had no receipts yet.
  if (!save.mallMealReceipts?.includes(mealId)) save.mallMealReceipts = keepReceipt(save, mealId);
  delete save.mallMeal;
  return true;
}

export const MALL_SHOPS = [
  { id: 'toys', en: 'Toys and Games', ja: 'おもちゃとゲーム', emoji: '🧸', items: [
    { id: 'robot', en: 'a toy robot', ja: 'ロボットのおもちゃ', emoji: '🤖', price: 500, souvenir: 'mall_robot' },
    { id: 'board_game', en: 'a board game', ja: 'ボードゲーム', emoji: '🎲', price: 600, souvenir: 'mall_game' },
    { id: 'kendama', en: 'a kendama', ja: 'けん玉', emoji: '🪀', price: 300, souvenir: 'mall_kendama' },
  ] },
  { id: 'books', en: 'Books and Stationery', ja: '本と文ぼうぐ', emoji: '📚', items: [
    { id: 'book', en: 'a story book', ja: 'お話の本', emoji: '📘', price: 400, souvenir: 'mall_book' },
    { id: 'comic', en: 'a comic book', ja: 'まんがの本', emoji: '📖', price: 300, souvenir: 'mall_comic' },
    { id: 'pencils', en: 'colored pencils', ja: '色えんぴつ', emoji: '🖍️', price: 200, souvenir: 'mall_pencils' },
  ] },
  { id: 'sports', en: 'Sports and Clothes', ja: 'スポーツと服', emoji: '⚽', items: [
    { id: 'ball', en: 'a soccer ball', ja: 'サッカーボール', emoji: '⚽', price: 700, souvenir: 'mall_ball' },
    { id: 'cap', en: 'a cap', ja: 'ぼうし', emoji: '🧢', price: 300, souvenir: 'mall_cap' },
    { id: 'shirt', en: 'a T-shirt', ja: 'Ｔシャツ', emoji: '👕', price: 500, souvenir: 'mall_shirt' },
  ] },
];

export function mallItem(id) { return MALL_SHOPS.flatMap((shop) => shop.items).find((item) => item.id === id) || null; }

const whole = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const weekOf = (save) => Math.floor(whole(save.time?.day) / 7);

/** Initialize once, then grant each new in-game week's allowance once. */
export function pocketMoney(save) {
  const week = weekOf(save);
  if (!save.pocketMoney || typeof save.pocketMoney !== 'object') {
    save.pocketMoney = { balance: WEEKLY_ALLOWANCE, week };
  }
  const wallet = save.pocketMoney;
  wallet.balance = whole(wallet.balance);
  wallet.week = whole(wallet.week, week);
  if (week > wallet.week) {
    wallet.balance = Math.min(Number.MAX_SAFE_INTEGER, wallet.balance + (week - wallet.week) * WEEKLY_ALLOWANCE);
    wallet.week = week;
  }
  return wallet.balance;
}

/** Deduct only on success; the caller puts the returned item on the shelf. */
export function buyMallItem(save, id) {
  const balance = pocketMoney(save);
  const item = mallItem(id);
  if (!item) return { ok: false, reason: 'unknown-item', balance };
  if (balance < item.price) return { ok: false, reason: 'not-enough', item, balance };
  save.pocketMoney.balance -= item.price;
  return { ok: true, item, balance: save.pocketMoney.balance };
}
