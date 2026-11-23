// Save upgrades. migrateSave() runs on every load and on new saves; it is
// idempotent and only ADDS missing structure. It never changes levels, XP,
// facts, memories, plans, messages, flags or settings. Old memories keep no
// `focus` field, so they keep counting for all their NPCs (DESIGN_DECISIONS
// 2026-11-16, "Only one-on-one experiences open the next level").

import { thingsState } from './things.js';
import { fstate } from './friendship.js';
import { pocketMoney } from './mall.js';

export const SAVE_VERSION = 3;

export function migrateSave(save) {
  if (!save || typeof save !== 'object') return save;
  if (!save.player || typeof save.player !== 'object') save.player = {};
  if (!save.player.answers || typeof save.player.answers !== 'object') save.player.answers = {};
  for (const k of ['plans', 'messages', 'memories', 'souvenirs', 'discoveredLinks', 'heard', 'eveningQueue', 'excluded']) {
    if (!Array.isArray(save[k])) save[k] = [];
  }
  for (const k of ['rel', 'npcLinks', 'weatherOverrides']) {
    if (!save[k] || typeof save[k] !== 'object') save[k] = {};
  }
  if (!Array.isArray(save.npcPlans)) save.npcPlans = [];
  if (!save.stats || typeof save.stats !== 'object') save.stats = { activities: 0 };
  if (!save.flags || typeof save.flags !== 'object') save.flags = { fd: 'done' };
  if (!save.time || typeof save.time !== 'object') save.time = { day: 0, period: 0 };
  pocketMoney(save);
  fstate(save);
  thingsState(save);
  if (!(save.version >= SAVE_VERSION)) save.version = SAVE_VERSION;
  return save;
}
