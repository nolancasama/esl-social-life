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

// Special-day celebrations (friendship template special_day).
function celebrateCard(o) {
  if (o.kind === 'birthday') return opt('hb', 'Happy birthday!', 'お誕生日おめでとう！', { emoji: '🎂', phrases: ['happy birthday'], keys: [['birthday', 'happy']] });
  if (o.kind === 'pet_birthday') return opt('hb', `Happy birthday to your ${o.petEn}!`, `${o.petJa}、お誕生日おめでとう！`, { emoji: '🎉', phrases: ['happy birthday'], keys: [['birthday', 'happy']] });
  return opt('congrats', 'Congratulations!', 'おめでとう！', { emoji: '🎉', phrases: ['congratulations', 'congrats'], keys: [['congrat']] });
}
function celebrateMemory(o) {
  if (o.kind === 'birthday') return { recall: { en: 'We had my birthday party at the café', ja: 'カフェでわたしのお誕生日会をしたね' }, label: { en: 'Your birthday party!', ja: 'お誕生日会！', emoji: '🎂' } };
  if (o.kind === 'pet_birthday') return { recall: { en: `We had a party for my ${o.petEn} at the café`, ja: `カフェでうちの${o.petJa}のパーティーをしたね` }, label: { en: `The party for your ${o.petEn}!`, ja: `${o.petJa}のパーティー！`, emoji: '🎉' } };
  return { recall: { en: `We had a party for my new ${o.thing?.en || 'thing'} at the café`, ja: `カフェで新しい${o.thing?.ja || ''}のお祝いをしたね` }, label: { en: 'The café party!', ja: 'カフェのパーティー！', emoji: '🎉' } };
}

export async function playCafe(game, actors, { plan, celebrate = null } = {}) {
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
  // A table of four: lift the camera so the friend in the near chair doesn't hide anyone.
  const lift = actors.length >= 3 ? 0.9 : 0;

  await game.fade(() => {
    game.npcs.clearArea(table.x, table.z, 1.6, [...actors, staff]);
    const s0 = seat(0), s1 = seat(1), s2 = seat(2);
    P.place(s0.x, s0.z, s0.yaw);
    P.char.setBase('sit', { height: s0.seatY });
    main.char.setPosition(s1.x, s1.z); main.char.setYaw(s1.yaw); main.char.setBase('sit', { height: s1.seatY });
    // Friends who came along: the far chair faces the camera, so it comes first; the near chair is for a third friend.
    const s3 = seat(3);
    const extra = [s3 || s2, s2];
    actors.slice(1, 3).forEach((o, k) => { const s = extra[k]; o.char.setPosition(s.x, s.z); o.char.setYaw(s.yaw); o.char.setBase('sit', { height: s.seatY }); });
    game.camera.shot(new THREE.Vector3(table.x - 0.2, 2.25 + lift, table.z + 3.3 + lift * 0.5), new THREE.Vector3(table.x, 0.75, table.z - 0.1), 5);
    game.camera.snap();
  });
  game.sitting = true;

  // 0. A party: the friend thanks you and you congratulate them.
  if (celebrate) {
    await c.say(main, line(`A party for me! Thank you, ${w.save.player.name}!`, `わたしのためのパーティー！ありがとう、${w.save.player.name}！`), { gesture: 'happy', expr: 'happy' });
    await c.ask([celebrateCard(celebrate)]);
  }
  // 1. Decide with your friend (want to + verb)
  await c.say(main, line(`I love this café! What do you want to eat, ${w.save.player.name}?`, `このカフェ大好き！${w.save.player.name}は何を食べたい？`, { area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' }), { expr: 'happy' });
  const fav = foodById(npc.food);
  const menu = FOODS.filter((f) => f.id !== fav.id).sort(() => Math.random() - 0.5).slice(0, 3);
  if (w.knows(npc.id, 'food')) menu.splice(Math.floor(Math.random() * 3), 0, fav); else menu.push(FOODS.filter((f) => !menu.includes(f) && f !== fav)[0]);
  const choice = await c.ask(menu.map((f) => opt(f.id, `I want to eat ${f.a}.`, `${f.ja}を食べたい。`, {
    emoji: f.emoji, keys: [[f.en.split(' ').slice(-1)[0], f.id]], phrases: [`i want to eat ${f.a}`, `i want ${f.a}`, f.en], area: 'wantto', expr: 'a.wanteat', template: 'I want to eat ___.',
  })), { columns: 2 });
  const myFood = foodById(choice.id);
  let forFriend = fav;
  let remembered = false;
  if (celebrate) {
    await c.say(main, line(`Oh, you want to eat ${myFood.a}! Nice!`, `${myFood.ja}を食べたいんだね！いいね！`, { area: 'wantto' }), { expr: 'happy' });
  } else if (myFood.id === fav.id) {
    await c.say(main, line(`Oh, you want to eat ${myFood.a}! Me too! I love ${myFood.general}!`, `${myFood.ja}を食べたいの？わたしも！大好きなんだ！`, { area: 'wantto' }), { gesture: 'happy', expr: 'happy' });
    w.learn(npc.id, 'food');
    w.xp(npc.id, 2, { key: 'shared:food', reason: 'shared' });
  } else {
    await c.say(main, line(`Oh, you want to eat ${myFood.a}! Nice!`, `${myFood.ja}を食べたいんだね！いいね！`, { area: 'wantto' }), { expr: 'happy' });
  }
  if (!celebrate) {
    await c.ask([opt('you', 'What do you want to eat?', 'あなたは何を食べたい？', { emoji: '💭', phrases: ['what do you want to eat', 'what about you', 'and you'], area: 'wantto', expr: 'q.wanteat', template: 'What do you want to eat?' })]);
    await c.say(main, line(`I want to eat ${fav.a}. ${fav.emoji}`, `${fav.ja}を食べたい！`, { area: 'wantto', expr: 'a.wanteat', template: 'I want to eat ___.' }), { expr: 'happy' });
    w.learn(npc.id, 'food');
  }

  // 2. Order from the staff (want + noun / ___, please.)
  // The staff serves from the corner (the north chair is for a fourth friend).
  const tableSide = { x: table.x + 0.95, z: table.z - 1.1 };
  if (staff) {
    game.dialogue.close();
    main.char.play('wave', 1.2);
    await game.npcs.walkTo(staff, 3.6, -4.3, 2.2);
    await game.npcs.walkTo(staff, 3.6, -2.4, 2.2);
    await game.npcs.walkTo(staff, tableSide.x, tableSide.z, 2.2);
    staff.char.faceToward(table.x, table.z);
    game.camera.shot(new THREE.Vector3(table.x - 0.4, 2.0 + lift, table.z + 3.4 + lift * 0.5), new THREE.Vector3(table.x + 0.1, 0.95, table.z - 0.5), 4);
  }
  const staffWho = staff || main;
  await c.say(staffWho, line('Hello! What do you want?', 'いらっしゃいませ！ご注文は？', { area: 'food', expr: 'q.whatwant', template: 'What do you want?' }), { expr: 'happy' });
  await c.ask([opt('order', `${capFirst(myFood.a)}, please.`, `${myFood.ja}をください。`, {
    emoji: myFood.emoji, keys: [[myFood.en.split(' ').slice(-1)[0], myFood.id]], phrases: [`${myFood.a} please`, `i want ${myFood.a}`, `${myFood.en} please`], area: 'food', expr: 'a.please', template: '___, please.',
  })]);
  const npcDrink = drinkById(npc.drink);
  let myDrink = npcDrink;
  if (celebrate) {
    // Order for the friend: what do they like? Knowing it is a nice surprise; guessing is fine too.
    await c.say(staffWho, line(`And for ${npc.name}?`, `${npc.name}さんは何にしますか？`, { area: 'food' }));
    const picks = [fav, ...FOODS.filter((f) => f.id !== fav.id).sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5);
    const knew = w.knows(npc.id, 'food');
    const pick = await c.ask(picks.map((f) => opt(f.id, `${capFirst(f.a)}, please. It's for ${npc.name}!`, `${f.ja}をください。${npc.name}の分です！`, {
      emoji: f.emoji, keys: [[f.en.split(' ').slice(-1)[0], f.id]], phrases: [`${f.a} please`, f.en], area: 'food', expr: 'a.please', template: '___, please.',
    })), { columns: 2, prompt: { name: '🎁', color: '#FF7A59', en: `What does ${npc.name} like?`, ja: `${npc.name}は何が好きかな？` } });
    forFriend = foodById(pick.id);
    if (forFriend.id === fav.id) {
      remembered = knew;
      await c.say(main, knew ? line(`You remembered! I love ${fav.general}! 😊`, `覚えててくれたんだ！${fav.ja}大好き！`) : line(`Wow! I love ${fav.general}! Thank you!`, `わあ！${fav.ja}大好きなの！ありがとう！`), { gesture: 'happy', expr: 'happy' });
    } else {
      await c.say(main, line(`Thank you! I like ${fav.general} the most, but this is yummy, too!`, `ありがとう！いちばん好きなのは${fav.ja}だけど、これもおいしいよね！`), { expr: 'happy' });
    }
    w.learn(npc.id, 'food');
  } else {
    await c.say(staffWho, line('And you?', 'そちらは？'));
    await c.say(main, line(`${capFirst(fav.a)}, please.`, `${fav.ja}をください。`, { area: 'food', expr: 'a.please' }));
    await c.say(staffWho, line('What do you want to drink?', 'お飲み物は何にしますか？', { area: 'wantto', expr: 'q.wantdrink', template: 'What do you want to drink?' }));
    const drinks = DRINKS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
    const dChoice = await c.ask(drinks.map((d) => opt(d.id, `${capFirst(d.a)}, please.`, `${d.ja}をください。`, {
      emoji: d.emoji, keys: [[d.en.split(' ')[0]]], phrases: [`${d.a} please`, `i want ${d.a}`, `i want to drink ${d.a}`], area: 'food', expr: 'a.please', template: '___, please.',
    })), { columns: 2 });
    myDrink = drinkById(dChoice.id);
    await c.say(main, line(`${capFirst(npcDrink.a)}, please!`, `${npcDrink.ja}をください！`, { area: 'food' }));
  }
  // Friends who came along order, too.
  for (const o of actors.slice(1, 3)) {
    const f = foodById(o.npc.food);
    await c.say(o, line(`${capFirst(f.a)}, please! ${f.emoji}`, `${f.ja}をください！`, { area: 'food', expr: 'a.please' }), { expr: 'happy' });
  }
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
  place(foodMesh(forFriend.id), table.x + 0.3, table.z - 0.02);
  place(drinkMesh(myDrink.color), table.x - 0.25, table.z - 0.28);
  place(drinkMesh(npcDrink.color), table.x + 0.25, table.z + 0.28);
  if (actors[1]) place(foodMesh(actors[1].npc.food), table.x + 0.02, table.z - 0.3);
  if (actors[2]) place(foodMesh(actors[2].npc.food), table.x - 0.02, table.z + 0.3);
  for (const [i, m] of items.entries()) {
    setTimeout(() => {
      sfx.pop();
      const t0 = performance.now();
      const grow = () => { const t = Math.min(1, (performance.now() - t0) / 300); m.scale.setScalar(t * (1 + Math.sin(t * Math.PI) * 0.25)); if (t < 1) requestAnimationFrame(grow); else m.scale.setScalar(1); };
      grow();
    }, i * 180);
  }
  game.camera.shot(new THREE.Vector3(table.x - 0.1, 1.75 + lift, table.z + 2.4 + lift * 0.6), new THREE.Vector3(table.x, 0.75, table.z - 0.1), 4);
  await wait(800);
  await c.say(staffWho, line('Here you are.', 'はい、どうぞ。', { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }), { gesture: 'hold', expr: 'happy' });
  await c.ask([opt('thanks', 'Thank you!', 'ありがとう！', { emoji: '😊', phrases: PHRASES.thanks, keys: [['thank']], area: 'food', expr: 'a.thanks', template: 'Thank you!' })]);
  if (staff) {
    await c.say(staff, line('Enjoy!', 'ごゆっくりどうぞ！'), { expr: 'happy' });
    game.dialogue.close();
    game.npcs.walkTo(staff, 3.6, -2.4, 2.2).then(() => game.npcs.walkTo(staff, 3.6, -4.3, 2.2)).then(() => game.npcs.walkTo(staff, scene.staffSpot.x, scene.staffSpot.z, 2.2)).then(() => staff.char.setYaw(0));
  }

  // 4. Eat and chat (a party starts with a cheer)
  if (celebrate) {
    sfx.great();
    P.char.play('clap', 1.4);
    main.char.play('cheer', 1.6);
    await c.say(main, celebrate.kind === 'birthday' ? line('Yay! This is my best birthday! 🎂', 'やったー！最高のお誕生日だ！') : line('Yay! A party! 🎉', 'やったー！パーティーだ！'), { gesture: 'cheer', expr: 'happy' });
  }
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
  const groupLines = [line('Everyone is here! This is so fun!', 'みんないっしょで楽しいね！'), line('Yummy! I love this café! 😋', 'おいしい！このカフェ大好き！')];
  for (const [k, o] of actors.slice(1, 3).entries()) await c.say(o, groupLines[k], { gesture: 'happy', expr: 'happy' });
  if (celebrate) {
    await c.say(main, line(`This is the best party! Thank you, ${w.save.player.name}!`, `最高のパーティーだよ！ありがとう、${w.save.player.name}！`), { gesture: 'happy', expr: 'happy' });
    await c.ask([opt('welcome', "You're welcome! See you!", 'どういたしまして！またね！', { emoji: '👋', phrases: ["you're welcome", 'you are welcome', ...PHRASES.bye], keys: [['welcome', 'see', 'bye']] })]);
  } else {
    await c.say(main, line(`Do you like ${myFood.general}?`, `${myFood.ja}は好き？`, { area: 'food', expr: 'q.doyoulike', template: 'Do you like ___?' }));
    const likeIt = await c.ask([
      opt('yes', "Yes, I do! It's delicious!", 'うん、好き！おいしい！', { emoji: '😋', phrases: ['yes i do', "it's delicious", 'yes', 'delicious', 'yummy'], keys: YES_KEYS, area: 'food', expr: 'a.delicious', template: "It's delicious!" }),
      opt('no', "It's OK.", 'まあまあかな。', { emoji: '🙂', phrases: ["it's ok", 'so so', 'no'], keys: [['ok', 'so']] }),
    ]);
    if (likeIt.id === 'yes') await c.say(main, line('Yummy! This is the best café!', 'おいしいね！最高のカフェだね！'), { expr: 'happy' });
    else await c.say(main, line('Next time, try the pancakes!', '今度はパンケーキをためしてみて！'));
    await c.say(main, line('Thank you for today! See you!', '今日はありがとう！またね！'), { gesture: 'wave', expr: 'happy' });
    await c.ask([opt('bye', 'Thank you! See you!', 'ありがとう！またね！', { emoji: '👋', phrases: [...PHRASES.thanks, ...PHRASES.bye] })]);
  }
  game.dialogue.close();
  for (const m of items) m.removeFromParent();
  game.sitting = false;
  P.char.setBase('idle');
  const detail = { foodEn: myFood.en, foodId: myFood.id, npcFood: forFriend.id, drink: myDrink.id };
  if (celebrate) Object.assign(detail, { occasion: celebrate.kind, place: 'cafe', again: { act: 'cafe' }, ...celebrateMemory(celebrate) });
  const phrase = celebrate ? `${capFirst(forFriend.a)}, please. It's for ${npc.name}!` : `I want to eat ${myFood.a}. — ${capFirst(myFood.a)}, please.`;
  return { actors, score: 3, detail, photo, phrase, remembered };
}
