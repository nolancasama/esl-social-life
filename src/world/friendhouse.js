// A friend's house is derived from existing class data, never names or pronouns.
import { hashString } from '../core/rng.js';
import { PETS } from '../data/content.js';

// The blue-roof neighbour north of the player's house, on the same lane.
export const FRIEND_HOUSE_DOOR = Object.freeze({ x: -24.15, z: 10.96, yaw: -Math.PI / 2 });
export const FRIEND_HOUSE_OUTSIDE = Object.freeze({ x: -22, z: 10.96, yaw: Math.PI / 2 });
export const FRIEND_HOUSE_WAIT = Object.freeze({ x: -23.6, z: 11.8, yaw: Math.PI / 2 });

const WALLS = ['#FFF1D6', '#E4F2EA', '#E8EDFF', '#FFE9EC', '#E2F3F8', '#F0E7FA'];
const ACTIVITIES = { games: 'race', music: 'music', piano: 'music', singing: 'music', dancing: 'music', drawing: 'draw' };
const PROPS = {
  games: 'games', tv: 'games', music: 'music', piano: 'music', singing: 'music', dancing: 'music',
  drawing: 'drawing', read: 'books', reading: 'books', comics: 'books', study: 'study', homework: 'study',
  help: 'cleaning', clean: 'cleaning', cook: 'cooking', bake: 'cooking', cooking: 'cooking', sweets: 'cooking',
  soccer: 'sport', baseball: 'sport', dodgeball: 'sport', basketball: 'sport', swimming: 'sport', running: 'sport',
  skateboarding: 'sport', cycling: 'sport', animals: 'nature', bugs: 'nature', shopping: 'books',
};

export function houseFor(seed, npc = {}) {
  const facts = [...(npc.homeActs || []), ...(npc.likes || [])];
  const pet = npc.pet && PETS.some((p) => p.id === npc.pet.type) && Number.isInteger(npc.pet.count) && npc.pet.count > 0
    ? { type: npc.pet.type, count: npc.pet.count } : null;
  return {
    wallColor: WALLS[hashString(`${seed}|friend-house|${npc.id || ''}`) % WALLS.length],
    pet,
    activity: facts.map((id) => ACTIVITIES[id]).find(Boolean) || 'photos',
    props: [...new Set(facts.map((id) => PROPS[id]).filter(Boolean))],
  };
}
