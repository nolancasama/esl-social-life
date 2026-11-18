// The mall reuses the café's card ordering / serving pattern, with counter
// service before everyone sits together. Shopping itself awards no XP.
import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES } from '../dialogue/intent.js';
import { FOODS, food as foodById } from '../data/content.js';
import { MALL_SHOPS, pocketMoney, buyMallItem } from '../world/mall.js';
import { foodMesh } from '../engine/food.js';

const extras = [
  { id: 'ramen', en: 'ramen', a: 'ramen', ja: 'ラーメン', emoji: '🍜' },
  { id: 'sushi', en: 'sushi', a: 'sushi', ja: 'すし', emoji: '🍣' },
  { id: 'crepe', en: 'a crepe', a: 'a crepe', ja: 'クレープ', emoji: '🥞' },
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

async function order(c, who, food) {
  await c.ask([opt('order', `I'd like ${food.a}, please.`, `${food.ja}をください。`, { emoji: food.emoji, phrases: [`i'd like ${food.a} please`, `${food.a} please`, `i want ${food.a}`], keys: [[food.id, food.en]], area: 'food', expr: 'mall.order', template: "I'd like ___, please." })]);
  await c.say(who, line('Here you are.', 'はい、どうぞ。', { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }));
  await c.ask([thanks()]);
}

export async function orderAtMall(game, target) {
  const counter = MALL_COUNTERS.find((s) => s.id === target.counter) || MALL_COUNTERS[0];
  const c = await Conversation.start(game, [], { frame: false });
  counterCamera(game, target);
  const who = counterSpeaker(game, counter.en);
  try {
    await c.say(who, line('What do you want to eat?', '何を食べたい？', { area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' }));
    const pick = await c.ask(counter.foods.map((id) => { const f = allFood.find((x) => x.id === id); return opt(id, `I want ${f.a}.`, `${f.ja}がほしいです。`, { emoji: f.emoji, phrases: [`i want ${f.a}`, f.en], keys: [[f.id, f.en]], area: 'wantto', expr: 'mall.want', template: 'I want ___.' }); }), { columns: 2 });
    await order(c, who, allFood.find((f) => f.id === pick.id));
  } finally { await c.end(); game.save(); }
}

export async function playMall(game, actors) {
  if (game.sceneId !== 'mall') {
    const ids = actors.map((a) => a.npc.id);
    await game.enterScene('mall', 'door');
    actors = ids.map((id, i) => game.npcs.actorFor(id) || game.npcs.ensure(game.world.npc(id), 1 + i, -0.8, 0));
  }
  const scene = game.scene, w = game.world;
  for (const a of actors) game.npcs.engage(a);
  const c = new Conversation(game, actors);
  const main = actors[0];
  const visitCounter = (food) => {
    const counter = MALL_COUNTERS.find((s) => s.foods.includes(food.id));
    const target = scene.interact.find((it) => it.counter === counter.id);
    const kiosk = scene.foodCounters.find((s) => s.id === counter.id);
    const dx = Math.sin(kiosk.yaw);
    game.player.place(target.x + dx * 0.3, target.z, kiosk.yaw + Math.PI);
    actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(target.x + dx * (1.3 + i * 0.7), target.z + 0.6); a.char.faceToward(kiosk.x, kiosk.z); });
    counterCamera(game, target);
    return counterSpeaker(game, counter.en);
  };
  const items = [];
  let photo = null;
  try {
    game.player.place(-6.3, 1.7, -Math.PI / 2);
    actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(-5.5 + i * 0.8, 2.6); });
    counterCamera(game, { x: -6.5, z: 1.7 });
    await c.say(main, line('What do you want to eat?', '何を食べたい？', { area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' }));
    const pick = await c.ask([extras[0], foodById('hamburger'), extras[1], extras[2], foodById('icecream')].map((f) => opt(f.id, `I want ${f.a}.`, `${f.ja}がほしいです。`, { emoji: f.emoji, phrases: [`i want ${f.a}`, f.en], keys: [[f.id, f.en]], area: 'wantto', expr: 'mall.want', template: 'I want ___.' })), { columns: 2 });
    const mine = allFood.find((f) => f.id === pick.id);
    await order(c, visitCounter(mine), mine);
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
      game.npcs.clearArea(table.x, table.z, 1.8, actors);
      [game.player.char, ...actors.map((a) => a.char)].forEach((ch, i) => {
        const seat = scene.seats.find((s) => s.id === `T2-${[0, 1, 3, 2][i]}`);
        if (i === 0) game.player.place(seat.x, seat.z, seat.yaw); else { ch.setPosition(seat.x, seat.z); ch.setYaw(seat.yaw); }
        ch.setBase('sit', { height: seat.seatY });
        const f = foodMesh(orders[i].id);
        f.position.set(table.x + (seat.x - table.x) * 0.35, 0.77, table.z + (seat.z - table.z) * 0.35);
        scene.root.add(f); items.push(f);
      });
      game.sitting = true;
      game.camera.shot(new THREE.Vector3(table.x - 0.3, 3.2, table.z + 4.7), new THREE.Vector3(table.x, 0.85, table.z), 6);
      game.camera.snap();
    });
    await c.say(main, line('Everyone is here! Let’s eat!', 'みんないるね！いただきます！'), { expr: 'happy' });
    for (const a of actors) a.char.play('eat', 1.2);
    game.player.char.play('eat', 1.2);
    try { photo = game.renderer.snapshot(360, 225); } catch { /* photos are optional */ }
    await c.ask([opt('yum', "It's delicious!", 'おいしい！', { phrases: ["it's delicious", 'yummy'], keys: [['delicious', 'yummy']] })]);
    const next = await c.ask([opt('shop', "Let's look at one shop!", 'お店を1つ見よう！', { emoji: '🛍️', phrases: ['look at one shop', 'shop'], keys: [['shop']] }), opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { emoji: '👋', phrases: [...PHRASES.bye, ...PHRASES.thanks], keys: [['bye', 'see', 'thank']] })]);
    if (next.id === 'shop') {
      const shop = await c.ask(MALL_SHOPS.map((s) => opt(s.id, `Let's go to ${s.en}!`, `${s.ja}のお店に行こう！`, { emoji: s.emoji, phrases: [s.en], keys: [[s.id, s.en]] })));
      const target = scene.interact.find((it) => it.kind === 'mallShop' && it.shop === shop.id);
      game.sitting = false;
      game.player.char.setBase('idle');
      game.player.place(target.x, target.z + 0.8, Math.PI);
      actors.forEach((a, i) => { a.char.setBase('idle'); a.char.setPosition(target.x + 1 + i * 0.7, target.z + 1); });
      await shopAtMall(game, target, { conversation: c, friends: actors });
      await c.ask([opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { phrases: PHRASES.bye, keys: [['bye', 'see']] })]);
    }
    return { actors, score: 3, photo, phrase: `I'd like ${mine.a}, please.`, detail: { place: 'mall', foodId: mine.id, foodEn: mine.en, orders: actors.map((a) => ({ npcId: a.npc.id, foodId: a.npc.food })), shop: next.id === 'shop', again: { act: 'mall' }, recall: { en: 'We went to Niji Mall', ja: 'にじモールに行ったね' } } };
  } finally {
    for (const m of items) m.removeFromParent();
    game.sitting = false;
    game.player.char.setBase('idle');
    for (const a of actors) a.char.setBase('idle');
    game.dialogue.close();
  }
}
