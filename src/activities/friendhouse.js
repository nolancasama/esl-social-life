// A close friend's invitation uses the same one-period event/reward path as
// the inverse bedroom visit. The town door is the only normal entry point.
import * as THREE from 'three';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PETS, petPhrase } from '../data/content.js';
import { houseFor } from '../world/friendhouse.js';
import { styleLine, styleGesture } from '../world/personality.js';
import { memoryRefs } from '../world/friendship.js';
import { playHobby } from './hobby.js';
import { raceGame } from './visit.js';
import { loadPhotos } from '../core/store.js';

const card = (id, en, ja, keys, meta = {}) => opt(id, en, ja, { phrases: [en.toLowerCase()], keys: [keys], ...meta });
const activities = {
  draw: ['draw', '絵をかきたい。', 'draw pictures', '絵をかいたね'],
  music: ['play music', '音楽をしたい。', 'play music', '音楽をしたね'],
  race: ['play a racing game', 'レースゲームをしたい。', 'play a racing game', 'レースゲームをしたね'],
  photos: ['look at photos', '写真を見たい。', 'look at photos', '写真を見たね'],
};

async function roomShot(game, a, x, z) {
  await game.fade(() => {
    game.player.place(x - 0.65, z + 1.1, Math.PI);
    a.char.setPosition(x + 0.65, z + 0.7);
    a.char.setYaw(-Math.PI / 2);
    game.player.char.setBase('idle');
    a.char.setBase('idle');
    game.camera.shot(new THREE.Vector3(x + 2.5, 3.2, z + 5), new THREE.Vector3(x, 0.65, z), 5);
    game.camera.snap();
  });
}

async function photos(game, a, c) {
  const refs = memoryRefs(game.world, a.npc.id, { all: true, limit: 1 });
  const photo = loadPhotos(game.world.save.id).find((p) => p.npcIds?.includes(a.npc.id));
  if (photo) game.scene.setPhoto?.(photo.url);
  else {
    // A new photo of this actual room, never an invented past trip or family.
    try { game.scene.setPhoto?.(game.renderer.snapshot(360, 225)); } catch { /* photo is optional */ }
  }
  await c.say(a, line('Look at this photo!', 'この写真を見て！'), { gesture: 'point', expr: 'happy' });
  await c.say(a, refs.length ? line(refs[0].en, refs[0].ja) : line('This is my room!', 'わたしの部屋だよ！'));
  await c.ask([card('photo', 'It is nice!', 'すてきだね！', ['nice'], { area: 'adjectives' })]);
}

export async function playFriendHouse(game, actor) {
  const w = game.world, npc = actor.npc;
  const house = houseFor(w.cls.seed, npc);
  game.friendHouseNpc = npc;
  await game.enterScene('friendhouse', 'door');
  // Entering clears outdoor actors: ensure just the host in the shared room.
  const a = game.npcs.ensure(npc, 2.9, 2.15, -Math.PI / 2);
  game.npcs.engage(a);
  const c = new Conversation(game, [a]);
  c.arrange(); c.frame();
  await c.say(a, line('Welcome! Come in.', 'ようこそ！入ってね。'), { gesture: styleGesture(npc, 'greet'), expr: 'happy' });
  await c.ask([card('welcome', 'Thank you!', 'ありがとう！', ['thank'])]);

  await roomShot(game, a, -1, -1.4);
  await c.say(a, line('This is my room.', 'ここがわたしの部屋だよ。', { area: 'possessions' }), { gesture: 'point', expr: 'happy' });
  await c.ask([card('room', 'It is nice!', 'すてきな部屋だね！', ['nice'], { area: 'adjectives' })]);

  if (house.pet) {
    const pet = PETS.find((p) => p.id === house.pet.type);
    const spot = game.scene.petSpot || { x: -2.8, z: 0.1 };
    await roomShot(game, a, spot.x, spot.z);
    await c.ask([card('count', `How many ${pet.plural} do you have?`, `${pet.ja}は何ひきいるの？`, ['many', pet.plural], { area: 'possessions', expr: 'q.howmany', template: 'How many ___ do you have?' })]);
    await c.say(a, line(`I have ${petPhrase(house.pet)}.`, `${pet.ja}が${house.pet.count}ひきいるよ。`, { area: 'possessions', expr: 'a.have', template: 'I have (number) ___.' }), { gesture: 'point', expr: 'happy' });
    await c.ask([card('cute', house.pet.count === 1 ? "It's cute!" : 'They are cute!', 'かわいいね！', ['cute'], { area: 'adjectives' })]);
    w.learn(npc.id, 'pet');
  }

  await roomShot(game, a, 0.4, 0.1);
  await c.say(a, line('Do you want some juice?', 'ジュースはいかが？', { area: 'food', expr: 'q.want', template: 'Do you want ___?' }), { gesture: 'hold', expr: 'happy' });
  const snack = await c.ask([
    card('yes', 'Yes, please.', 'はい、お願いします。', ['yes', 'please'], { area: 'food' }),
    card('no', 'No, thank you.', 'いいえ、けっこうです。', ['no'], { area: 'food' }),
  ]);
  await c.say(a, snack.id === 'yes' ? line('Here you are!', 'はい、どうぞ！') : line('OK!', 'オッケー！'));
  await c.ask([card('snack', 'Thank you!', 'ありがとう！', ['thank'])]);

  const activity = activities[house.activity];
  await c.ask([card('activity', `I want to ${activity[0]}.`, activity[1], [house.activity === 'photos' ? 'photo' : house.activity === 'race' ? 'game' : house.activity], { area: 'wantto', expr: 'a.wantto', template: 'I want to ___.' })]);
  let activityResult = null;
  if (house.activity === 'race') await raceGame(game, a, c);
  else if (house.activity === 'draw' || house.activity === 'music') activityResult = await playHobby(game, [a], { variant: house.activity });
  else await photos(game, a, c);
  const reaction = styleLine(npc, 'celebrate', { name: w.save.player.name });
  if (reaction) await c.say(a, line(reaction.en, reaction.ja), { gesture: styleGesture(npc, 'happy'), expr: 'happy' });
  let photo = activityResult?.photo || null;
  if (!photo) { try { photo = game.renderer.snapshot(360, 225); } catch { /* optional */ } }
  game.hud.flashPhoto();

  await roomShot(game, a, 2.5, 1.2);
  await c.ask([card('thanks', 'Thank you for having me!', '家にさそってくれてありがとう！', ['thank'], { area: 'wantto' })]);
  await c.say(a, line('See you at school!', '学校で会おうね！'), { gesture: 'wave', expr: 'happy' });
  await c.ask([card('bye', 'See you at school!', '学校で会おうね！', ['see', 'school'])]);
  game.dialogue.close();
  game.player.char.setProp(null);
  game.player.char.setBase('idle');
  game.sitting = false;
  await game.enterScene('town', 'friendHouseDoor');
  return {
    actors: [a], score: 3, photo, phrase: 'Thank you for having me! — See you at school!',
    detail: {
      place: 'friendhouse', activity: house.activity, pet: house.pet, snack: snack.id,
      recall: { en: `We ${house.activity === 'draw' ? 'drew pictures' : house.activity === 'music' ? 'played music' : house.activity === 'race' ? 'played a racing game' : 'looked at photos'} at my house`, ja: `わたしの家でいっしょに${activity[3]}` },
      label: { en: `At ${npc.name}'s house!`, ja: `${npc.name}の家に遊びに行った！`, emoji: '🏡' },
    },
  };
}
