// Mall shopping is pure save logic: prices are fixed, and money never borrows.
export const WEEKLY_ALLOWANCE = 1000;

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
