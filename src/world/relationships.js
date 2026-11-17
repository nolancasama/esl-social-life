// Connection levels 0–5 with the fictional NPCs. Pure state functions over
// the save; they emit bus events so the UI can celebrate.
//
// Anti-farming: every award either has a once-only key (a fact, an intro, a
// first activity) or a per-day key. Repeating the same conversation gives
// friendly variety, not unlimited XP. Nothing here ever REDUCES connection.
//
// Level gate: talking can reach Lv2; each memory in rel.memories opens one
// more level. World.addMemory puts a memory there only for its `focus` NPCs
// (one-on-one experiences); group outings use focus [] so they bank XP and
// grow NPC–NPC links without opening levels. Memories saved before `focus`
// existed count for all their NPCs, exactly as before.

import { bus } from '../core/events.js';

// Total XP needed to reach each level. Level 1 is reached by meeting.
export const LEVEL_XP = [0, 0, 10, 26, 46, 72];
export const MAX_LEVEL = 5;

export function relOf(save, npcId) {
  if (!save.rel[npcId]) {
    save.rel[npcId] = { level: 0, xp: 0, metDay: null, facts: {}, awarded: {}, memories: [], lastTalkDay: null, introducedBy: null };
  }
  return save.rel[npcId];
}

export function isMet(save, npcId) { return relOf(save, npcId).level >= 1; }

export function meet(save, npcId, day, by = null) {
  const r = relOf(save, npcId);
  if (r.level >= 1) return false;
  r.level = 1;
  r.metDay = day;
  r.introducedBy = by;
  bus.emit('met', { npcId, by });
  return true;
}

function levelFor(xp) {
  let lvl = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (xp >= LEVEL_XP[i]) lvl = i;
  return lvl;
}

/**
 * Award connection XP. `key` makes an award once-only; `dayKey` makes it
 * once per day. Returns XP actually gained.
 */
export function addXp(save, npcId, amount, { key = null, day = null, reason = '' } = {}) {
  const r = relOf(save, npcId);
  if (r.level < 1) meet(save, npcId, day);
  const k = key ? key : null;
  if (k && r.awarded[k] !== undefined) return 0;
  if (k) r.awarded[k] = day ?? true;
  const before = r.level;
  r.xp += amount;
  // Talking can make you Friends (Lv2). Deeper levels need time together:
  // each shared activity or favour (a memory) unlocks one more level.
  const gate = 2 + Math.min(3, (r.memories || []).length);
  const after = Math.max(before, Math.min(gate, levelFor(r.xp)));
  r.level = Math.min(MAX_LEVEL, after);
  bus.emit('xp', { npcId, amount, reason });
  if (r.level > before) bus.emit('levelup', { npcId, level: r.level });
  return amount;
}

/** Learn a fact about an NPC (recorded once; small XP, capped per day). Returns true if new. */
export function learnFact(save, npcId, factKey, day) {
  const r = relOf(save, npcId);
  if (r.facts[factKey] !== undefined) return false;
  r.facts[factKey] = day;
  // Up to three new facts per friend per day give XP; more are still recorded.
  if (r.factDay !== day) { r.factDay = day; r.factXpToday = 0; }
  if (r.factXpToday < 6) { r.factXpToday += 2; addXp(save, npcId, 2, { key: 'fact:' + factKey, day, reason: 'fact' }); }
  bus.emit('fact', { npcId, factKey });
  return true;
}

export function knowsFact(save, npcId, factKey) { return relOf(save, npcId).facts[factKey] !== undefined; }

export function levelProgress(save, npcId) {
  const r = relOf(save, npcId);
  if (r.level >= MAX_LEVEL) return { level: r.level, frac: 1, xp: r.xp, next: null };
  if (r.level < 1) return { level: 0, frac: 0, xp: 0, next: LEVEL_XP[2] };
  const lo = LEVEL_XP[r.level] ?? 0;
  const hi = LEVEL_XP[r.level + 1];
  return { level: r.level, frac: Math.max(0, Math.min(1, (r.xp - lo) / (hi - lo))), xp: r.xp, next: hi };
}

/** NPC-to-NPC link in this player's world (class link + changes from play). */
export function npcLink(save, classNpcs, a, b) {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (save.npcLinks[k] !== undefined) return save.npcLinks[k];
  const na = classNpcs.find((n) => n.id === a);
  return na?.links?.[b] || 0;
}

export function setNpcLink(save, a, b, value) {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  save.npcLinks[k] = Math.max(save.npcLinks[k] || 0, value);
}

export function discoverLink(save, a, b) {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (save.discoveredLinks.includes(k)) return false;
  save.discoveredLinks.push(k);
  return true;
}
