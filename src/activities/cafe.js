// Café outing: decide with your friend ("What do you want to eat?" —
// "I want to eat a hamburger."), order from the staff ("What do you want?" —
// "A hamburger, please."), receive it ("Here you are." — "Thank you!"),
// then eat and chat. Both "want to + verb" and "want + noun" appear in the
// right places.

import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES, YES_KEYS, NO_KEYS } from '../dialogue/intent.js';
import { FOODS, DRINKS, food as foodById, drink as drinkById } from '../data/content.js';
import { foodMesh, drinkMesh, trayMesh } from '../engine/food.js';
import { sfx } from '../core/audio.js';
import { wait } from '../core/util.js';

const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function playCafe(game, actors, { plan } = {}) {
  const w = game.world;
  if (game.sceneId !== 'cafe') {
    await game.enterScene('cafe', 'door');
    actors = actors.map((a) => game.npcs.actorFor(a.npc.id)).filter(Boolean);
  }
  const scene = game.scene;
  const main = actors[0];
  const npc = main.npc;
  const P = game.player;
  const table = scene.tables.find((t) => t.id === 'T2');
  const seat = (i) => scene.seats.find((s) => s.id === `T2-${i}`);
  const staff = game.npcs.actors.find((a) => a.special === 'staff');
  for (const a of actors) game.npcs.engage(a);
  if (staff) game.npcs.engage(staff);
  const c = new Conversation(game, actors);

  await game.fade(() => {
    game.npcs.clearArea(table.x, table.z, 1.6, [...actors, staff]);
    const s0 = seat(0), s1 = seat(1), s2 = seat(2);
    P.place(s0.x, s0.z, s0.yaw);
    P.char.setBase('sit', { height: s0.seatY });
    main.char.setPosition(s1.x, s1.z); main.char.setYaw(s1.yaw); main.char.setBase('sit', { height: s1.seatY });
    if (actors[1]) { actors[1].char.setPosition(s2.x, s2.z); actors[1].char.setYaw(s2.yaw); actors[1].char.setBase('sit', { height: s2.seatY }); }
    game.camera.shot(new THREE.Vector3(table.x - 0.2, 2.25, table.z + 3.3), new THREE.Vector3(table.x, 0.75, table.z - 0.1), 5);
    game.camera.snap();
  });
  game.sitting = true;

  // 1. Decide with your friend (want to + verb)
  await c.say(main, line(`I love this café! What do you want to eat, ${w.save.player.name}?`, `このカフェ大好き！${w.save.player.name}は何を食べたい？`, { area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' }), { expr: 'happy' });
  const fav = foodById(npc.food);
  const menu = FOODS.filter((f) => f.id !== fav.id).sort(() => Math.random() - 0.5).slice(0, 3);
  if (w.knows(npc.id, 'food')) menu.splice(Math.floor(Math.random() * 3), 0, fav); else menu.push(FOODS.filter((f) => !menu.includes(f) && f !== fav)[0]);
  const choice = await c.ask(menu.map((f) => opt(f.id, `I want to eat ${f.a}.`, `${f.ja}を食べたい。`, {
    emoji: f.emoji, keys: [[f.en.split(' ').slice(-1)[0], f.id]], phrases: [`i want to eat ${f.a}`, `i want ${f.a}`, f.en], area: 'wantto', expr: 'a.wanteat', template: 'I want to eat ___.',
  })), { columns: 2 });
  const myFood = foodById(choice.id);
  if (myFood.id === fav.id) {
    await c.say(main, line(`Oh, you want to eat ${myFood.a}! Me too! I love ${myFood.general}!`, `${myFood.ja}を食べたいの？わたしも！大好きなんだ！`, { area: 'wantto' }), { gesture: 'happy', expr: 'happy' });
    w.learn(npc.id, 'food');
    w.xp(npc.id, 2, { key: 'shared:food', reason: 'shared' });
  } else {
    await c.say(main, line(`Oh, you want to eat ${myFood.a}! Nice!`, `${myFood.ja}を食べたいんだね！いいね！`, { area: 'wantto' }), { expr: 'happy' });
  }
  await c.ask([opt('you', 'What do you want to eat?', 'あなたは何を食べたい？', { emoji: '💭', phrases: ['what do you want to eat', 'what about you', 'and you'], area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' })]);
  await c.say(main, line(`I want to eat ${fav.a}. ${fav.emoji}`, `${fav.ja}を食べたい！`, { area: 'wantto', expr: 'a.wanteat', template: 'I want to eat ___.' }), { expr: 'happy' });
  w.learn(npc.id, 'food');

  // 2. Order from the staff (want + noun / ___, please.)
  const tableSide = { x: table.x + 0.15, z: table.z - 1.15 };
  if (staff) {
    game.dialogue.close();
    main.char.play('wave', 1.2);
    await game.npcs.walkTo(staff, 3.6, -4.3, 2.2);
    await game.npcs.walkTo(staff, 3.6, -2.4, 2.2);
    await game.npcs.walkTo(staff, tableSide.x, tableSide.z, 2.2);
    staff.char.faceToward(table.x, table.z);
    game.camera.shot(new THREE.Vector3(table.x - 0.4, 2.0, table.z + 3.4), new THREE.Vector3(table.x + 0.1, 0.95, table.z - 0.5), 4);
  }
  const staffWho = staff || main;
  await c.say(staffWho, line('Hello! What do you want?', 'いらっしゃいませ！ご注文は？', { area: 'food', expr: 'q.whatwant', template: 'What do you want?' }), { expr: 'happy' });
  await c.ask([opt('order', `${capFirst(myFood.a)}, please.`, `${myFood.ja}をください。`, {
    emoji: myFood.emoji, keys: [[myFood.en.split(' ').slice(-1)[0], myFood.id]], phrases: [`${myFood.a} please`, `i want ${myFood.a}`, `${myFood.en} please`], area: 'food', expr: 'a.please', template: '___, please.',
  })]);
  await c.say(staffWho, line('And you?', 'そちらは？'));
  await c.say(main, line(`${capFirst(fav.a)}, please.`, `${fav.ja}をください。`, { area: 'food', expr: 'a.please' }));
  await c.say(staffWho, line('What do you want to drink?', 'お飲み物は何にしますか？', { area: 'wantto', expr: 'q.wantdrink', template: 'What do you want to drink?' }));
  const drinks = DRINKS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  const dChoice = await c.ask(drinks.map((d) => opt(d.id, `${capFirst(d.a)}, please.`, `${d.ja}をください。`, {
    emoji: d.emoji, keys: [[d.en.split(' ')[0]]], phrases: [`${d.a} please`, `i want ${d.a}`, `i want to drink ${d.a}`], area: 'food', expr: 'a.please', template: '___, please.',
  })), { columns: 2 });
  const myDrink = drinkById(dChoice.id);
  const npcDrink = drinkById(npc.drink);
  await c.say(main, line(`${capFirst(npcDrink.a)}, please!`, `${npcDrink.ja}をください！`, { area: 'food' }));
  await c.say(staffWho, line('OK! Just a moment, please.', 'かしこまりました！少々お待ちください。'), { gesture: 'nod' });
  game.dialogue.close();

  // 3. Food is prepared and delivered
  const items = [];
  if (staff) {
    await game.npcs.walkTo(staff, 3.6, -2.4, 2.4);
    await game.npcs.walkTo(staff, 3.6, -4.3, 2.4);
    await game.npcs.walkTo(staff, 0.6, -4.35, 2.4);
    staff.char.faceToward(0.6, -3.5);
    staff.char.play('hold', 1.6);
    sfx.pop();
    await wait(900);
    const tray = trayMesh();
    staff.char.handR.add(tray);
    tray.position.set(0.0, -0.02, 0.22);
    staff.char.hold('hold');
    await game.npcs.walkTo(staff, 3.6, -4.3, 2.0);
    await game.npcs.walkTo(staff, 3.6, -2.4, 2.0);
    await game.npcs.walkTo(staff, tableSide.x, tableSide.z, 2.0);
    staff.char.stopGesture();
    tray.removeFromParent();
    staff.char.faceToward(table.x, table.z);
  }
  const place = (mesh, x, z) => { mesh.position.set(x, 0.745, z); mesh.scale.setScalar(0.01); scene.root.add(mesh); items.push(mesh); };
  place(foodMesh(myFood.id), table.x - 0.3, table.z + 0.02);
  place(foodMesh(fav.id), table.x + 0.3, table.z - 0.02);
  place(drinkMesh(myDrink.color), table.x - 0.25, table.z - 0.28);
  place(drinkMesh(npcDrink.color), table.x + 0.25, table.z + 0.28);
  for (const [i, m] of items.entries()) {
    setTimeout(() => {
      sfx.pop();
      const t0 = performance.now();
      const grow = () => { const t = Math.min(1, (performance.now() - t0) / 300); m.scale.setScalar(t * (1 + Math.sin(t * Math.PI) * 0.25)); if (t < 1) requestAnimationFrame(grow); else m.scale.setScalar(1); };
      grow();
    }, i * 180);
  }
  game.camera.shot(new THREE.Vector3(table.x - 0.1, 1.75, table.z + 2.4), new THREE.Vector3(table.x, 0.75, table.z - 0.1), 4);
  await wait(800);
  await c.say(staffWho, line('Here you are.', 'はい、どうぞ。', { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }), { gesture: 'hold', expr: 'happy' });
  await c.ask([opt('thanks', 'Thank you!', 'ありがとう！', { emoji: '😊', phrases: PHRASES.thanks, keys: [['thank']], area: 'food', expr: 'a.thanks', template: 'Thank you!' })]);
  if (staff) {
    await c.say(staff, line('Enjoy!', 'ごゆっくりどうぞ！'), { expr: 'happy' });
    game.dialogue.close();
    game.npcs.walkTo(staff, 3.6, -2.4, 2.2).then(() => game.npcs.walkTo(staff, 3.6, -4.3, 2.2)).then(() => game.npcs.walkTo(staff, scene.staffSpot.x, scene.staffSpot.z, 2.2)).then(() => staff.char.setYaw(0));
  }

  // 4. Eat and chat
  await c.say(main, line("Let's eat! Itadakimasu!", 'いただきます！'), { gesture: 'clap', expr: 'happy' });
  game.dialogue.close();
  let photo = null;
  for (let bite = 0; bite < 3; bite++) {
    P.char.play('eat', 0.9);
    main.char.play('eat', 0.9);
    sfx.eat();
    await wait(950);
    items[0].scale.setScalar(1 - (bite + 1) * 0.27);
    items[1].scale.setScalar(1 - (bite + 1) * 0.25);
    if (bite === 0) {
      P.char.setExpression('happy', 2); main.char.setExpression('happy', 2);
      try { photo = game.renderer.snapshot(360, 225); } catch { photo = null; }
      game.hud.flashPhoto();
    }
  }
  await c.say(main, line(`Do you like ${myFood.general}?`, `${myFood.ja}は好き？`, { area: 'food', expr: 'q.doyoulike', template: 'Do you like ___?' }));
  const likeIt = await c.ask([
    opt('yes', "Yes, I do! It's delicious!", 'うん、好き！おいしい！', { emoji: '😋', phrases: ['yes i do', "it's delicious", 'yes', 'delicious', 'yummy'], keys: YES_KEYS, area: 'food', expr: 'a.delicious', template: "It's delicious!" }),
    opt('no', "It's OK.", 'まあまあかな。', { emoji: '🙂', phrases: ["it's ok", 'so so', 'no'], keys: [['ok', 'so']] }),
  ]);
  if (likeIt.id === 'yes') await c.say(main, line('Yummy! This is the best café!', 'おいしいね！最高のカフェだね！'), { expr: 'happy' });
  else await c.say(main, line('Next time, try the pancakes!', '今度はパンケーキをためしてみて！'));
  await c.say(main, line('Thank you for today! See you!', '今日はありがとう！またね！'), { gesture: 'wave', expr: 'happy' });
  await c.ask([opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { emoji: '👋', phrases: [...PHRASES.thanks, ...PHRASES.bye] })]);
  game.dialogue.close();
  for (const m of items) m.removeFromParent();
  game.sitting = false;
  P.char.setBase('idle');
  return { actors, score: 3, detail: { foodEn: myFood.en, foodId: myFood.id, npcFood: fav.id, drink: myDrink.id }, photo, phrase: `I want to eat ${myFood.a}. — ${capFirst(myFood.a)}, please.` };
}
