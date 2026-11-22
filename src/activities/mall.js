// The mall reuses the café's card ordering / serving pattern, with counter
// service before everyone sits together. Shopping itself awards no XP.
import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES } from '../dialogue/intent.js';
import { FOODS, food as foodById } from '../data/content.js';
import { MALL_SHOPS, pocketMoney, buyMallItem, mallFoodPrice, buyMallFood, pendingMallMeal } from '../world/mall.js';
import { makeId } from '../core/util.js';
import { carryMallMeal, setDownMallMeal, mallMealSnapshot, placeMallDish, consumeMallMeal, cancelMallConsumption, clearMallDishes } from './mall-meal.js';
import { ARCADE_GAMES, runArcadeGame, standAtMachine } from './arcade.js';

const extras = [
  { id: 'ramen', en: 'ramen', a: 'ramen', ja: 'ラーメン', emoji: '🍜' },
  { id: 'sushi', en: 'sushi', a: 'sushi', ja: 'すし', emoji: '🍣' },
  { id: 'crepe', en: 'a crepe', a: 'a crepe', ja: 'クレープ', emoji: '🥞' },
  { id: 'water', en: 'water', a: 'water', ja: '水', emoji: '💧' },
];
const allFood = [...FOODS, ...extras];
export const MALL_COUNTERS = [
  { id: 'ramen', en: 'Rainbow Ramen', ja: 'にじラーメン', foods: ['ramen', 'spaghetti', 'curry', 'omurice'] },
  { id: 'burgers', en: 'Sunny Burgers', ja: 'おひさまバーガー', foods: ['hamburger', 'sandwich', 'pizza'] },
  { id: 'sushi', en: 'Little Sushi', ja: 'こすし屋', foods: ['sushi', 'riceball'] },
  { id: 'sweets', en: 'Cloud Crepes and Ice Cream', ja: 'くもクレープとアイス', foods: ['crepe', 'icecream', 'cake', 'pancakes'] },
];
const thanks = () => opt('thanks', 'Thank you!', 'ありがとう！', { emoji: '😊', phrases: PHRASES.thanks, keys: [['thank']], area: 'food', expr: 'a.thanks', template: 'Thank you!' });
// Merged shopkeeper figures need a speaker, but no extra animated draw calls.
function counterSpeaker(game, name) {
  return { special: 'mallCounter', npc: { name, color: '#278E94', role: 'Shopkeeper お店の人', voice: { pitch: 1, rate: 0.9 } }, char: { setTalking() {}, setExpression() {}, play() {} } };
}
function counterCamera(game, target) {
  const foodCounter = game.scene.foodCounters?.find((s) => s.id === target.counter);
  if (foodCounter) {
    const dx = Math.sin(foodCounter.yaw);
    game.camera.shot(new THREE.Vector3(foodCounter.x + dx * 4, 2.8, foodCounter.z + 2.8), new THREE.Vector3(foodCounter.x, 1, foodCounter.z), 5);
  } else game.camera.shot(new THREE.Vector3(target.x + 1.7, 2.8, target.z + 3.5), new THREE.Vector3(target.x, 1, target.z - 0.6), 5);
  game.camera.snap();
}

export async function shopAtMall(game, target, { conversation = null, friends = [] } = {}) {
  const shop = MALL_SHOPS.find((s) => s.id === target.shop);
  if (!shop) return;
  const w = game.world;
  const c = conversation || await Conversation.start(game, [], { frame: false });
  const who = counterSpeaker(game, shop.en);
  counterCamera(game, target);
  game.player.char.faceToward(target.x, target.z - 2.2);
  try {
    const balance = pocketMoney(w.save);
    await c.say(who, line(`Welcome! You have ${balance} yen. You get 1,000 yen each week.`, `いらっしゃいませ！おこづかいは${balance}円。毎週1,000円もらえるよ。`));
    const pick = await c.ask([...shop.items.map((item) => opt(item.id, `Can I see ${item.en}, please?`, `${item.ja}を見せてください。`, { emoji: item.emoji, phrases: [item.en, `can i see ${item.en} please`], keys: [[item.id, item.en.replace(/^a(n)? /, '')]], area: 'shopping', expr: 'shop.see', template: 'Can I see ___, please?' })), opt('no', 'No, thank you.', 'いいえ、けっこうです。', { phrases: ['no thank you'], keys: [['no']] })], { columns: 2 });
    if (pick.id === 'no') return;
    const item = shop.items.find((i) => i.id === pick.id);
    await c.ask([opt('price', 'How much is it?', 'いくらですか？', { phrases: ['how much is it', 'how much'], keys: [['much', 'price']], area: 'shopping', expr: 'shop.price', template: 'How much is it?' })]);
    await c.say(who, line(`It's ${item.price} yen.`, `${item.price}円です。`, { area: 'shopping', expr: 'shop.yen', template: "It's ___ yen." }));
    const buy = await c.ask([opt('buy', "I'll take it!", 'これをください！', { emoji: '🛍️', phrases: ["i'll take it", 'i will take it'], keys: [['take', 'buy']], area: 'shopping', expr: 'shop.buy', template: "I'll take it!" }), opt('no', 'No, thank you.', 'いいえ、けっこうです。', { phrases: ['no thank you'], keys: [['no']] })]);
    if (buy.id === 'no') return;
    const result = buyMallItem(w.save, item.id);
    if (!result.ok) {
      await c.say(who, line('You need more pocket money. You can look again next week!', 'おこづかいが足りないね。また来週、見に来てね！'));
      await c.ask([opt('next', "OK! I'll come again!", 'はい！また来ます！', { phrases: ['ok', 'come again'], keys: [['ok', 'again']] })]);
      return;
    }
    // Keep the newest purchase visible even when the bedroom shelf is full.
    const souvenir = w.addSouvenir(item.souvenir, null) || w.save.souvenirs.find((s) => s.kind === item.souvenir && s.npcId === null);
    if (souvenir) { souvenir.itemId = item.id; w.save.souvenirs = [souvenir, ...w.save.souvenirs.filter((s) => s !== souvenir)]; }
    await c.say(who, line(`Here you are. You have ${result.balance} yen now.`, `はい、どうぞ。のこりは${result.balance}円です。`, { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }));
    if (friends[0]) await c.say(friends[0], line('That looks fun!', 'それ、楽しそう！'));
    await c.ask([thanks()]);
  } finally {
    game.save();
    if (!conversation) await c.end();
  }
}

const foodCard = (f) => opt(f.id, f.id === 'water' ? 'Just water, please. ¥0' : `I want ${f.a}. ¥${mallFoodPrice(f.id)}`, `${f.ja}をください。${mallFoodPrice(f.id)}円です。`, {
  emoji: f.emoji, phrases: [`i want ${f.a}`, f.en, ...(f.id === 'water' ? ['just water please'] : [])], keys: [[f.id, f.en]], area: 'wantto', expr: 'mall.want', template: 'I want ___.',
});
const priceCard = () => opt('price', 'How much is it?', 'いくらですか？', { phrases: ['how much is it', 'how much'], keys: [['much', 'price']], area: 'shopping', expr: 'shop.price', template: 'How much is it?' });
const orderCard = (f) => opt('order', f.id === 'water' ? 'Just water, please.' : `I'd like ${f.a}, please.`, `${f.ja}をください。`, {
  emoji: f.emoji, phrases: [`i'd like ${f.a} please`, `${f.a} please`, `a ${f.en.replace(/^a(n)? /, '')} please`, `i want ${f.a}`, ...(f.id === 'water' ? ['just water please'] : [])], keys: [[f.id, f.en]], area: 'food', expr: 'mall.order', template: "I'd like ___, please.",
});
const eatCard = () => opt('eat', "Let's eat!", '食べよう！', { phrases: ["let's eat", 'eat'], keys: [['eat']] });

// Only the hand-over mutates the wallet. An interrupted order always resumes
// the saved receipt, including when it is brought along on a group outing.
async function playerOrder(game, c, menu, visit, { carry = false } = {}) {
  const save = game.world.save;
  let meal = pendingMallMeal(save), food, who;
  if (meal) {
    food = allFood.find((f) => f.id === meal.foodId);
    who = visit(food);
    await c.say(who, line('Your food is ready!', '食べものができているよ！'));
    if (mallMealSnapshot(game).carrying && carry) {
      await c.say(who, line('Please sit and eat first.', '先にすわって食べてね。'));
      await c.ask([eatCard()]);
      return food;
    }
  } else {
    who = visit(menu[0]);
    await c.say(who, line(`What do you want to eat? You have ${pocketMoney(save)} yen.`, `何を食べたい？おこづかいは${pocketMoney(save)}円です。`, { area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' }));
    const pick = await c.ask([...menu, extras.find((f) => f.id === 'water')].map(foodCard), { columns: 2 });
    food = allFood.find((f) => f.id === pick.id);
    const mealId = makeId('mall-meal');
    while (!meal) {
      who = visit(food);
      const question = await c.ask([orderCard(food), priceCard()]);
      if (question.id === 'price') {
        const price = mallFoodPrice(food.id), balance = pocketMoney(save);
        await c.say(who, line(`It's ${price} yen. You have ${balance} yen.`, `${price}円です。おこづかいは${balance}円です。`));
        await c.ask([orderCard(food)]);
      }
      const result = buyMallFood(save, food.id, mealId);
      if (result.ok) { meal = result.meal; game.save(true); break; }
      await c.say(who, line(`You don't have enough money for this yet. You have ${result.balance} yen. Please choose something cheaper, or free water!`, `今はおこづかいが足りないね。${result.balance}円あるよ。安いものか、無料の水をえらんでね！`));
      const cheaper = allFood.filter((f) => mallFoodPrice(f.id) <= result.balance && mallFoodPrice(f.id) < mallFoodPrice(food.id));
      const pick = await c.ask(cheaper.map(foodCard), { columns: 2 });
      food = allFood.find((f) => f.id === pick.id);
    }
  }
  if (carry) carryMallMeal(game, meal);
  await c.say(who, line('Here you are.', 'はい、どうぞ。', { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }));
  await c.ask([thanks()]);
  const balance = pocketMoney(save);
  await c.say(who, line(`You have ${balance} yen now.`, `のこりは${balance}円です。`));
  await c.ask([eatCard()]);
  return food;
}

export async function orderAtMall(game, target) {
  const counter = MALL_COUNTERS.find((s) => s.id === target.counter) || MALL_COUNTERS[0];
  const c = await Conversation.start(game, [], { frame: false });
  counterCamera(game, target);
  const who = counterSpeaker(game, counter.en);
  try {
    await playerOrder(game, c, counter.foods.map((id) => allFood.find((f) => f.id === id)), () => who, { carry: true });
  } finally { await c.end(); game.save(); }
}

// ------------------------------------------------------------ mall outings
// A mall outing begins wherever the group meets (planned friends wait by the
// 1F entrance): "What do you want to do?" → shopping (1F), eating (2F) or
// games (3F). Floor trips take no time; the whole outing is one activity,
// so Activities.run advances one period and rewards once.
const MALL_FLOOR_SCENES = ['mall', 'mall2', 'mall3'];
const WANTS = {
  shop: { floor: 1, emoji: '🛍️', en: 'I want to go shopping.', ja: '買い物に行きたい。', phrases: ['i want to go shopping', 'go shopping', 'shopping'], keys: [['shop']],
    where: ['I want to go to the first floor.', '1かいに行きたい。', ['i want to go to the first floor', 'first floor']], go: ["Let's go to the shops!", 'お店に行こう！'] },
  eat: { floor: 2, emoji: '🍜', en: 'I want to eat.', ja: '食べたい。', phrases: ['i want to eat', 'eat', 'lunch'], keys: [['eat', 'food']],
    where: ['I want to go to the food court.', 'フードコートに行きたい。', ['i want to go to the food court', 'food court']], go: ["Let's go to the second floor!", '2かいに行こう！'] },
  games: { floor: 3, emoji: '🕹️', en: 'I want to play games.', ja: 'ゲームをしたい。', phrases: ['i want to play games', 'play games', 'games'], keys: [['game', 'play']],
    where: ['I want to go to the third floor.', '3かいに行きたい。', ['i want to go to the third floor', 'third floor']], go: ["Let's go to the third floor!", '3かいに行こう！'] },
};

/** A friend's own wish, from generated interests only. */
export function mallWish(npc) {
  if (npc.likes?.includes('games')) return 'games';
  if (npc.likes?.includes('shopping')) return 'shop';
  return 'eat';
}

function wishLine(npc) {
  const wish = mallWish(npc);
  if (wish === 'games') return line('I want to play games!', 'ゲームがしたいな！', { area: 'wantto' });
  if (wish === 'shop') return line('I want to go shopping!', '買い物に行きたいな！', { area: 'wantto' });
  const fav = foodById(npc.food);
  return fav ? line(`I want to eat ${fav.en}!`, `${fav.ja}が食べたいな！`, { area: 'wantto' }) : line('I want to eat!', '何か食べたいな！', { area: 'wantto' });
}

function snapshot(game) { try { return game.renderer.snapshot(360, 225); } catch { return null; } }

export async function playMall(game, actors) {
  if (game.locationId !== 'mall') {
    const ids = actors.map((a) => a.npc.id);
    await game.enterScene('mall', 'door');
    actors = ids.map((id, i) => game.npcs.actorFor(id) || game.npcs.ensure(game.world.npc(id), 1 + i, -0.8, 0));
  }
  for (const a of actors) game.npcs.engage(a);
  const c = new Conversation(game, actors);
  const main = actors[0];
  c.arrange();
  c.frame();
  await c.say(main, line('What do you want to do?', '何をしたい？', { area: 'wantto', expr: 'q.wantdo', template: 'What do you want to do?' }), { gesture: 'happy', expr: 'happy' });
  for (const a of actors) await c.say(a, wishLine(a.npc), { expr: 'happy' });
  const pick = await c.ask(Object.entries(WANTS).map(([id, w]) => opt(id, w.en, w.ja, { emoji: w.emoji, phrases: w.phrases, keys: w.keys, area: 'wantto', expr: 'a.wantdo', template: 'I want to ___.' })));
  const want = WANTS[pick.id];
  const agree = actors.find((a) => mallWish(a.npc) === pick.id);
  await c.say(agree || main, agree ? line('Me too!', 'わたしも！') : line('OK! Good idea!', 'いいよ！いいね！'), { gesture: 'happy', expr: 'happy' });
  await c.say(main, line('Where do you want to go?', 'どこに行きたい？', { area: 'wantto', expr: 'q.wantgo', template: 'Where do you want to go?' }));
  await c.ask([opt('go', want.where[0], want.where[1], { emoji: want.emoji, phrases: want.where[2], keys: [['floor', 'court', 'go']], area: 'wantto', expr: 'a.wantgo', template: 'I want to go to ___.' })]);
  await c.say(main, line(want.go[0], want.go[1]), { gesture: 'point', expr: 'happy' });
  game.dialogue.close();
  if (game.sceneId !== MALL_FLOOR_SCENES[want.floor - 1]) await game.changeFloor(want.floor, 'elevator');
  if (pick.id === 'shop') return shopOuting(game, c, actors);
  if (pick.id === 'games') return gamesOuting(game, c, actors);
  return mealOuting(game, c, actors);
}

async function shopOuting(game, c, actors) {
  const main = actors[0];
  try {
    await c.say(main, line('What do you want to buy?', '何を買いたい？', { area: 'wantto', expr: 'q.wantbuy', template: 'What do you want to buy?' }));
    const buys = { toys: ['I want to buy a toy.', 'おもちゃを買いたい。', 'toy'], books: ['I want to buy a book.', '本を買いたい。', 'book'], sports: ['I want to buy clothes.', '服を買いたい。', 'clothes'] };
    const pick = await c.ask(MALL_SHOPS.map((s) => opt(s.id, buys[s.id][0], buys[s.id][1], { emoji: s.emoji, phrases: [buys[s.id][0].toLowerCase().replace('.', ''), buys[s.id][2]], keys: [[buys[s.id][2], s.id]], area: 'wantto', expr: 'a.wantbuy', template: 'I want to buy ___.' })));
    if (pick.id === 'toys') {
      // Possessions practice on the way in.
      await c.say(main, line('Do you have a board game?', 'ボードゲームを持ってる？', { area: 'possessions', expr: 'q.have', template: 'Do you have ___?' }));
      await c.ask([
        opt('yes', 'Yes, I do.', 'うん、持ってるよ。', { emoji: '🙋', phrases: ['yes i do', 'yes'], keys: [['yes']], area: 'possessions', expr: 'a.yesido', template: 'Yes, I do.' }),
        opt('no', "No, I don't.", 'ううん、持ってない。', { emoji: '🙅', phrases: ["no i don't", 'no'], keys: [['no']], area: 'possessions', expr: 'a.noidont', template: "No, I don't." }),
      ]);
    }
    const target = game.scene.interact.find((it) => it.kind === 'mallShop' && it.shop === pick.id);
    game.dialogue.close();
    game.player.place(target.x, target.z + 0.8, Math.PI);
    actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(target.x + 1 + i * 0.7, target.z + 1); a.char.faceToward(target.x, target.z); });
    await shopAtMall(game, target, { conversation: c, friends: actors });
    await c.ask([opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { emoji: '👋', phrases: PHRASES.bye, keys: [['bye', 'see']] })]);
    const shop = MALL_SHOPS.find((s) => s.id === pick.id);
    return { actors, score: 3, photo: snapshot(game), phrase: 'I want to go shopping.', detail: { place: 'mall', mallChoice: 'shop', shopId: pick.id, shopEn: shop.en, again: { act: 'mall' }, recall: { en: 'We went shopping at Niji Mall', ja: 'にじモールで買い物したね' } } };
  } finally {
    game.dialogue.close();
  }
}

async function gamesOuting(game, c, actors) {
  const main = actors[0];
  try {
    await c.say(main, line('What do you want to play?', '何であそびたい？', { area: 'wantto', expr: 'q.wantplay', template: 'What do you want to play?' }));
    const pick = await c.ask(Object.values(ARCADE_GAMES).map((g) => opt(g.id, `I want to play ${g.en}.`, `${g.ja}をしたい。`, { emoji: g.emoji, phrases: [`i want to play ${g.en}`, g.id], keys: [[g.id]], area: 'wantto', expr: 'a.wantplay', template: 'I want to play ___.' })));
    game.dialogue.close();
    standAtMachine(game, pick.id, actors);
    const r = await runArcadeGame(game, c, pick.id, { friends: actors });
    const photo = snapshot(game);
    await c.ask([opt('fun', 'That was fun! Thank you!', '楽しかった！ありがとう！', { emoji: '😊', phrases: ['that was fun', ...PHRASES.thanks], keys: [['fun', 'thank']] })]);
    return { actors, score: r.score, photo, phrase: `I want to play ${ARCADE_GAMES[pick.id].en}.`, detail: { place: 'mall', mallChoice: 'games', game: pick.id, won: r.won, again: { act: 'mall' }, recall: { en: 'We played games at Niji Mall', ja: 'にじモールでゲームをしたね' } } };
  } finally {
    game.dialogue.close();
  }
}

async function mealOuting(game, c, actors) {
  const scene = game.scene, w = game.world;
  const main = actors[0];
  const visitCounter = (food) => {
    const counter = MALL_COUNTERS.find((s) => s.foods.includes(food.id)) || MALL_COUNTERS[0];
    const target = scene.interact.find((it) => it.counter === counter.id);
    const kiosk = scene.foodCounters.find((s) => s.id === counter.id);
    const dx = Math.sin(kiosk.yaw), dz = Math.cos(kiosk.yaw);
    game.player.place(target.x + dx * 0.3, target.z + dz * 0.3, kiosk.yaw + Math.PI);
    actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(target.x + dx * (1.3 + i * 0.7) + dz * 0.6, target.z + dz * (1.3 + i * 0.7) + dx * 0.6); a.char.faceToward(kiosk.x, kiosk.z); });
    counterCamera(game, target);
    return counterSpeaker(game, counter.en);
  };
  let photo = null;
  try {
    game.player.place(-6.3, 1.7, -Math.PI / 2);
    actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(-5.5 + i * 0.8, 2.6); });
    counterCamera(game, { x: -6.5, z: 1.7 });
    await c.say(main, line('We each pay for our own food. What do you want to eat?', '食べものは一人ずつ自分で払うよ。何を食べたい？', { area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' }));
    const mine = await playerOrder(game, c, [extras[0], foodById('hamburger'), extras[1], extras[2], foodById('icecream'), foodById('riceball')], visitCounter);
    const orders = [mine];
    for (const a of actors) {
      const fav = foodById(a.npc.food);
      const who = visitCounter(fav);
      await c.ask([opt('you', 'What do you want to eat?', '何を食べたい？', { phrases: ['what do you want to eat', 'and you'], keys: [['what', 'you']], area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' })]);
      if (w.knows(a.npc.id, 'food')) {
        const choice = await c.ask([opt('friend', `I'd like ${fav.a}, please. It's for ${a.npc.name}!`, `${fav.ja}をください。${a.npc.name}の分です！`, { emoji: fav.emoji, phrases: [`${fav.a} please`, `for ${a.npc.name}`], keys: [[fav.id, a.npc.name]], area: 'food', expr: 'mall.friend', template: "I'd like ___, please." }), opt('self', 'Please choose!', 'えらんでね！', { phrases: ['please choose'], keys: [['choose']] })]);
        if (choice.id === 'self') await c.say(a, line(`I'd like ${fav.a}, please.`, `${fav.ja}をください。`, { area: 'food' }));
      } else {
        await c.say(a, line(`I want ${fav.a}. I'd like ${fav.a}, please.`, `${fav.ja}がほしいな。${fav.ja}をください。`, { area: 'food' }));
        w.learn(a.npc.id, 'food');
      }
      await c.say(who, line('Here you are.', 'はい、どうぞ。', { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }));
      await c.ask([thanks()]);
      orders.push(fav);
    }
    const table = scene.tables.find((t) => t.id === 'T2');
    game.dialogue.close();
    await game.fade(() => {
      setDownMallMeal(game);
      game.npcs.clearArea(table.x, table.z, 1.8, actors);
      [game.player.char, ...actors.map((a) => a.char)].forEach((ch, i) => {
        const seat = scene.seats.find((s) => s.id === `T2-${[0, 1, 3, 2][i]}`);
        if (i === 0) game.player.place(seat.x, seat.z, seat.yaw); else { ch.setPosition(seat.x, seat.z); ch.setYaw(seat.yaw); }
        ch.setBase('sit', { height: seat.seatY });
        const meal = i === 0 ? pendingMallMeal(w.save) : null;
        placeMallDish(game, { char: ch, npcId: i === 0 ? null : actors[i - 1].npc.id, foodId: orders[i].id, seat, mealId: meal?.id, bites: meal?.bites });
      });
      game.sitting = true;
      game.camera.shot(new THREE.Vector3(table.x - 0.3, 3.2, table.z + 4.7), new THREE.Vector3(table.x, 0.85, table.z), 6);
      game.camera.snap();
    });
    await c.say(main, line('Everyone is here! Let’s eat!', 'みんないるね！いただきます！'), { expr: 'happy' });
    const consumption = consumeMallMeal(game);
    // Reactions use the same gestures as ordinary conversation while the other
    // diners continue their own staggered bites.
    photo = snapshot(game);
    for (const [i, a] of actors.slice(0, 2).entries()) {
      await c.say(a, i ? line("It's delicious!", 'おいしい！') : line('Yummy!', 'おいしいね！'), { gesture: 'happy', expr: 'happy', auto: 1300 });
    }
    game.dialogue.close();
    await consumption;
    await c.ask([opt('yum', "It's delicious!", 'おいしい！', { phrases: ["it's delicious", 'yummy'], keys: [['delicious', 'yummy']] })]);
    const next = await c.ask([opt('shop', "Let's look at one shop!", 'お店を1つ見よう！', { emoji: '🛍️', phrases: ['look at one shop', 'shop'], keys: [['shop']] }), opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { emoji: '👋', phrases: [...PHRASES.bye, ...PHRASES.thanks], keys: [['bye', 'see', 'thank']] })]);
    if (next.id === 'shop') {
      const shop = await c.ask(MALL_SHOPS.map((s) => opt(s.id, `Let's go to ${s.en}!`, `${s.ja}のお店に行こう！`, { emoji: s.emoji, phrases: [s.en], keys: [[s.id, s.en]] })));
      game.sitting = false;
      game.player.char.setBase('idle');
      for (const a of actors) a.char.setBase('idle');
      clearMallDishes(game);
      game.dialogue.close();
      await game.changeFloor(1, 'elevator');
      const target = game.scene.interact.find((it) => it.kind === 'mallShop' && it.shop === shop.id);
      game.player.place(target.x, target.z + 0.8, Math.PI);
      actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(target.x + 1 + i * 0.7, target.z + 1); });
      await shopAtMall(game, target, { conversation: c, friends: actors });
      await c.ask([opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { phrases: PHRASES.bye, keys: [['bye', 'see']] })]);
    }
    return { actors, score: 3, photo, phrase: `I'd like ${mine.a}, please.`, detail: { place: 'mall', mallChoice: 'eat', foodId: mine.id, foodEn: mine.en, orders: actors.map((a) => ({ npcId: a.npc.id, foodId: a.npc.food })), shop: next.id === 'shop', again: { act: 'mall' }, recall: { en: 'We ate at Niji Mall', ja: 'にじモールでごはんを食べたね' } } };
  } finally {
    cancelMallConsumption(game);
    clearMallDishes(game);
    game.sitting = false;
    game.player.char.setBase('idle');
    for (const a of actors) a.char.setBase('idle');
    game.dialogue.close();
  }
}
