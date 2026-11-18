import test from 'node:test';
import assert from 'node:assert/strict';
import { houseFor, FRIEND_HOUSE_DOOR } from './friendhouse.js';
import { buildClass } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';

test('friend houses are deterministic and use generated facts without changing them', () => {
  const npcs = buildClass(DEFAULT_ROSTER, 'friend-house-test');
  const before = structuredClone(npcs);
  for (const npc of npcs) {
    assert.deepEqual(houseFor('class-seed', npc), houseFor('class-seed', structuredClone(npc)));
    const house = houseFor('class-seed', npc);
    assert.deepEqual(house.pet, npc.pet);
    assert.ok(['draw', 'music', 'race', 'photos'].includes(house.activity));
    assert.deepEqual(houseFor('class-seed', { ...npc, name: 'Another name', pronoun: 'name' }), house);
    if (house.pet) house.pet.count++;
  }
  assert.deepEqual(npcs, before);
  assert.ok(new Set(npcs.map((npc) => houseFor('class-seed', npc).wallColor)).size > 1);
  assert.notEqual(FRIEND_HOUSE_DOOR.z, 22.24, 'the neighbour is separate from the player house');
});

test('pets appear only from the friend pet fact, with exact type and count', () => {
  for (const type of ['dog', 'cat', 'rabbit', 'hamster', 'fish', 'bird', 'turtle']) {
    assert.deepEqual(houseFor('seed', { id: 'friend', pet: { type, count: 2 } }).pet, { type, count: 2 });
  }
  assert.equal(houseFor('seed', { id: 'friend', likes: ['animals'] }).pet, null);
  assert.equal(houseFor('seed', { id: 'friend', pet: null }).pet, null);
});

test('one indoor activity follows existing home activities then interests', () => {
  assert.equal(houseFor('seed', { homeActs: ['games', 'music'], likes: ['drawing'] }).activity, 'race');
  assert.equal(houseFor('seed', { homeActs: ['read'], likes: ['drawing'] }).activity, 'draw');
  assert.equal(houseFor('seed', { likes: ['piano'] }).activity, 'music');
  assert.equal(houseFor('seed', { homeActs: ['read', 'clean'], likes: ['soccer'] }).activity, 'photos');
  assert.deepEqual(houseFor('seed', { homeActs: ['read', 'study'], likes: ['reading', 'soccer'] }).props, ['books', 'study', 'sport']);
});
