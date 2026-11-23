// Meaningful possessions (DESIGN_DECISIONS 2026-11-23, Phase 2). Ownership is
// the existing souvenir list (mall_* kinds); `save.things` only holds what
// the player is wearing, their drawings and which friends noticed what.
// Pure logic: no three.js, no DOM.

import { mallItem, ownsMallItem } from './mall.js';
import { hashString } from '../core/rng.js';

/** What each Niji Mall item can do. `fans` are generated NPC interests. */
export const THINGS = Object.freeze({
  ball: { id: 'ball', actions: ['play'], fans: ['soccer', 'running', 'basketball'], play: 'kickups', where: 'park',
    notice: { en: 'Wow! You have a soccer ball! Do you want to play soccer?', ja: 'わあ！サッカーボールを持ってるんだ！サッカーしない？' } },
  board_game: { id: 'board_game', actions: ['play', 'show'], fans: ['games', 'comics', 'reading'], play: 'pairs', where: 'home', game: true,
    notice: { en: 'You have a board game! Let’s play it together!', ja: 'ボードゲームを持ってるんだ！いっしょにやろう！' } },
  robot: { id: 'robot', actions: ['play', 'show'], fans: ['games', 'bugs', 'animals', 'cycling'], play: 'robot', where: 'home',
    notice: { en: 'Wow! You have a robot! Can I play with your robot?', ja: 'わあ！ロボットを持ってるんだ！ロボットで遊んでもいい？' } },
  kendama: { id: 'kendama', actions: ['play', 'show'], fans: ['baseball', 'dodgeball', 'skateboarding', 'games'], play: 'kendama', where: 'home',
    notice: { en: 'You have a kendama! Can you do tricks?', ja: 'けん玉を持ってるんだ！わざはできる？' } },
  book: { id: 'book', actions: ['read', 'show'], fans: ['reading', 'animals'], play: 'read', where: 'home',
    notice: { en: 'You have a story book! Do you like reading?', ja: 'お話の本を持ってるんだ！本を読むのは好き？' } },
  comic: { id: 'comic', actions: ['read', 'show'], fans: ['comics', 'reading', 'drawing'], play: 'read', where: 'home',
    notice: { en: 'Do you like comics? Do you want to read this?', ja: 'まんがは好き？これ、読む？' } },
  pencils: { id: 'pencils', actions: ['draw', 'show'], fans: ['drawing'], play: 'draw', where: 'home',
    notice: { en: 'You have colored pencils! Do you like drawing?', ja: '色えんぴつを持ってるんだ！絵をかくのは好き？' } },
  cap: { id: 'cap', actions: ['wear'], fans: [], wear: { accessory: 'cap', accColor: '#E5534B' },
    notice: { en: 'Your cap is cool!', ja: 'そのぼうし、かっこいいね！' } },
  shirt: { id: 'shirt', actions: ['wear'], fans: [], wear: { top: 'tshirt', topColor: '#4DABF7' },
    notice: { en: 'Nice T-shirt! It’s so cool!', ja: 'すてきなTシャツ！かっこいいね！' } },
});

export const THING_IDS = Object.freeze(Object.keys(THINGS));
const MAX_DRAWINGS = 6;

/** Idempotent; safe for every save version (optional field). */
export function thingsState(save) {
  let t = save.things;
  if (!t || typeof t !== 'object') t = save.things = {};
  if (!t.worn || typeof t.worn !== 'object') t.worn = {};
  if (!t.orig || typeof t.orig !== 'object') t.orig = {};
  if (!Array.isArray(t.drawings)) t.drawings = [];
  if (!t.noticed || typeof t.noticed !== 'object') t.noticed = {};
  if (!t.noticeDay || typeof t.noticeDay !== 'object') t.noticeDay = {};
  for (const id of Object.keys(t.worn)) if (!THINGS[id]?.wear || !t.worn[id] || !ownsMallItem(save, id)) delete t.worn[id];
  return t;
}

export const owns = (save, id) => !!THINGS[id] && ownsMallItem(save, id);

/** Owned things in catalogue order, with shop names and emoji. */
export function ownedThings(save) {
  return THING_IDS.filter((id) => owns(save, id)).map((id) => ({ ...THINGS[id], item: mallItem(id) }));
}

export const isWorn = (save, id) => !!thingsState(save).worn[id];

/**
 * Put on or take off a cap / T-shirt. Returns the new look (a copy), or null
 * if the player does not own it. The look the player made is kept in `orig`
 * and restored exactly when the item comes off.
 */
export function setWorn(save, id, on) {
  const def = THINGS[id];
  if (!def?.wear || !owns(save, id)) return null;
  const t = thingsState(save);
  const look = { ...(save.player.look || {}) };
  if (on && !t.worn[id]) {
    t.orig[id] = Object.fromEntries(Object.keys(def.wear).map((k) => [k, look[k] ?? null]));
    Object.assign(look, def.wear);
    t.worn[id] = true;
  } else if (!on && t.worn[id]) {
    for (const [k, v] of Object.entries(t.orig[id] || {})) { if (v === null) delete look[k]; else look[k] = v; }
    delete t.worn[id];
    delete t.orig[id];
  }
  save.player.look = look;
  return look;
}

/** If the player edits their look at the mirror, worn items come off cleanly. */
export function forgetWorn(save) {
  const t = thingsState(save);
  t.worn = {};
  t.orig = {};
}

/** Real count for "How many games do you have?": the TV racing game, plus the board game. */
export function gamesCount(save) {
  return 1 + (owns(save, 'board_game') ? 1 : 0);
}

/** A drawing is data (subject + colour), never an image, so it costs no storage. */
export function addDrawing(save, { subject, color, day }) {
  const t = thingsState(save);
  const d = { id: `drawing:${day}:${t.drawings.length}:${subject}`, subject, color, day };
  t.drawings = [d, ...t.drawings].slice(0, MAX_DRAWINGS);
  return d;
}

export const latestDrawing = (save) => thingsState(save).drawings[0] || null;

// ------------------------------------------------------------ friends notice things

const likesAny = (npc, fans) => (npc.likes || []).some((l) => fans.includes(l));

/**
 * What this friend could notice right now, from what the save really holds:
 * worn clothes anywhere; the ball in the park; anything owned at home (it is
 * in the room). At most once per item per friend and one comment per day.
 * Returns { id, en, ja } or null. Does not mark anything.
 */
export function noticeFor(save, npc, { place, day }) {
  if (!npc?.id) return null;
  const t = thingsState(save);
  if (t.noticeDay[npc.id] === day) return null;
  const seen = new Set(t.noticed[npc.id] || []);
  const cands = [];
  for (const id of THING_IDS) {
    if (seen.has(id) || !owns(save, id)) continue;
    const def = THINGS[id];
    if (def.wear) { if (t.worn[id]) cands.push({ id, score: 2 }); continue; }
    const visible = place === 'home' || (place === 'park' && id === 'ball');
    if (visible && likesAny(npc, def.fans)) cands.push({ id, score: 3 });
    else if (place === 'home' && id === 'pencils' && latestDrawing(save)) cands.push({ id, score: 1 });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || (hashString(`${npc.id}|${a.id}`) % 7) - (hashString(`${npc.id}|${b.id}`) % 7));
  const id = cands[0].id;
  return { id, ...THINGS[id].notice };
}

export function markNoticed(save, npcId, id, day) {
  const t = thingsState(save);
  t.noticed[npcId] = [...new Set([...(t.noticed[npcId] || []), id])];
  t.noticeDay[npcId] = day;
}

// ------------------------------------------------------------ home visits

/** Home-visit activities: the TV race and the souvenir shelf always; owned things add more. */
export const VISIT_PLAYS = Object.freeze({
  pairs: { thing: 'board_game', fans: ['games', 'comics', 'reading', 'shopping'], en: 'I want to play a board game.', ja: 'ボードゲームをしたい。', emoji: '🎲', npc: { en: 'I want to play a board game!', ja: 'ボードゲームがしたいな！' } },
  robot: { thing: 'robot', fans: ['games', 'bugs', 'animals', 'cycling'], en: 'I want to play with my robot.', ja: 'ロボットで遊びたい。', emoji: '🤖', npc: { en: 'I want to play with your robot!', ja: 'ロボットで遊びたいな！' } },
  kendama: { thing: 'kendama', fans: ['baseball', 'dodgeball', 'skateboarding', 'basketball', 'soccer'], en: 'I want to play kendama.', ja: 'けん玉をしたい。', emoji: '🪀', npc: { en: 'I want to play kendama!', ja: 'けん玉がしたいな！' } },
  read: { thing: ['comic', 'book'], fans: ['reading', 'comics'], en: 'I want to read a book together.', ja: 'いっしょに本を読みたい。', emoji: '📖', npc: { en: 'I want to read your book!', ja: 'あなたの本が読みたいな！' } },
  draw: { thing: 'pencils', fans: ['drawing'], en: 'I want to draw pictures.', ja: '絵をかきたい。', emoji: '🖍️', npc: { en: 'I want to draw with your colored pencils!', ja: 'あなたの色えんぴつで絵をかきたいな！' } },
  race: { thing: null, fans: ['games', 'cycling', 'running'], en: 'I want to play a racing game.', ja: 'レースゲームをしたい。', emoji: '🏎️', npc: { en: 'I want to play a racing game!', ja: 'レースゲームがしたいな！' } },
  souvenirs: { thing: null, fans: [], en: 'I want to show you my souvenirs.', ja: '思い出の品を見せたい。', emoji: '🧸', npc: { en: 'I want to see your souvenirs!', ja: 'あなたの思い出の品が見たいな！' } },
});

const hasThing = (save, thing) => thing === null || (Array.isArray(thing) ? thing.some((x) => owns(save, x)) : owns(save, thing));

/**
 * Visit choices for this friend, best first. The friend's own wish (from
 * their generated interests) is first; at most four cards. Different friends
 * prefer different things; the same friend is consistent.
 */
export function visitChoices(save, npc, max = 4) {
  const ids = Object.keys(VISIT_PLAYS).filter((id) => hasThing(save, VISIT_PLAYS[id].thing));
  const score = (id) => {
    const p = VISIT_PLAYS[id];
    const liked = (npc.likes || []).reduce((s, l, i) => s + (p.fans.includes(l) ? 3 - i : 0), 0);
    const owned = p.thing ? 1 : 0;
    return liked * 10 + owned * 2 + (id === 'souvenirs' ? -1 : 0) + (hashString(`${npc.id}|${id}`) % 5) / 10;
  };
  const sorted = ids.sort((a, b) => score(b) - score(a));
  const wish = sorted[0];
  const rest = sorted.slice(1).filter((id) => id !== 'souvenirs').slice(0, max - 2);
  return [...new Set([wish, ...rest, 'souvenirs'])].slice(0, max);
}

// ------------------------------------------------------------ fair NPC skill

/**
 * A friend's skill at a minigame, 0.35–0.8. Seeded by id, a little higher for
 * related interests, so "She is good at music" shows in play. Never high
 * enough to be unbeatable.
 */
export function npcSkill(npc, kind) {
  const fans = { rhythm: ['music', 'singing', 'piano', 'dancing'], racing: ['games', 'cycling', 'running'], pairs: ['games', 'reading', 'comics'], kendama: ['baseball', 'dodgeball', 'skateboarding', 'basketball', 'soccer'] }[kind] || [];
  const base = 0.42 + (hashString(`skill-v1|${kind}|${npc?.id || 'rival'}`) % 13) / 100;
  const bonus = likesAny(npc || {}, fans) ? 0.2 : 0;
  return Math.min(0.8, Math.round((base + bonus) * 100) / 100);
}

export const goodAt = (npc, kind) => npcSkill(npc, kind) >= 0.6;
