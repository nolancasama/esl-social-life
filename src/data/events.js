// Friendship event templates (DESIGN_DECISIONS 2026-11-16, template table).
// Data only: eligibility, selection and completion live in
// src/world/friendship.js; the playable flows live in the dialogue/activity
// layers and register which templates they can run.
//
// cost 'period' events show the time cost before starting and advance time
// when they finish; cost 'none' events are favours that never use time.
// focus: 'npc' → the memory counts for the friend's level gate;
//        'none' → a group memory (XP and NPC–NPC links, no gate).

export const TEMPLATES = {
  hobby: { id: 'hobby', kind: 'shared', minLevel: 2, cost: 'period', phase: 1, cooldownDays: 4, xp: 12, memoryType: 'event', focus: 'npc', areas: ['wantto', 'verbs'], places: ['park', 'cafe'], emoji: '🎨' },
  practice: { id: 'practice', kind: 'help', minLevel: 3, cost: 'period', phase: 1, cooldownDays: 5, xp: 12, memoryType: 'event', focus: 'npc', areas: ['verbs', 'adjectives'], places: ['park'], emoji: '💪' },
  find: { id: 'find', kind: 'help', minLevel: 1, cost: 'none', phase: 1, cooldownDays: 3, xp: 8, memoryType: 'help', focus: 'npc', areas: ['prepositions'], places: ['park'], emoji: '🔍' },
  delivery: { id: 'delivery', kind: 'help', minLevel: 3, cost: 'none', phase: 1, cooldownDays: 5, xp: 6, memoryType: 'event', focus: 'npc', areas: ['intro', 'possessions'], places: ['park', 'cafe', 'town', 'classroom'], emoji: '🎁' },
  meet_request: { id: 'meet_request', kind: 'intro', minLevel: 3, cost: 'none', phase: 1, cooldownDays: 4, xp: 6, memoryType: 'event', focus: 'npc', areas: ['intro', 'adjectives'], places: ['park', 'cafe', 'town', 'classroom'], emoji: '🤝' },
  remember: { id: 'remember', kind: 'memory', minLevel: 2, cost: 'none', phase: 1, cooldownDays: 3, xp: 3, memoryType: null, focus: 'npc', areas: ['wantto', 'weekly'], places: [], emoji: '📸' },
  special_day: { id: 'special_day', kind: 'special', minLevel: 4, cost: 'period', phase: 1, cooldownDays: 14, xp: 12, memoryType: 'event', focus: 'npc', areas: ['food', 'selfintro'], places: ['cafe'], emoji: '🎉' },
  project: { id: 'project', kind: 'project', minLevel: 4, cost: 'period', phase: 1, cooldownDays: 6, xp: 12, memoryType: 'event', focus: 'npc', areas: ['intro', 'adjectives'], places: ['park', 'cafe'], emoji: '✂️' },
  best_friend: { id: 'best_friend', kind: 'milestone', minLevel: 5, cost: 'period', phase: 1, once: true, cooldownDays: 0, xp: 0, keepsake: true, memoryType: 'event', focus: 'npc', areas: ['adjectives', 'selfintro'], places: ['park'], emoji: '🌟' },
  group_outing: { id: 'group_outing', kind: 'group', minLevel: 2, cost: 'period', phase: 2, cooldownDays: 0, xp: 6, memoryType: 'activity', focus: 'none', areas: ['wantto', 'weekly'], places: ['park', 'cafe'], emoji: '🧑‍🤝‍🧑' },
  npc_hangout: { id: 'npc_hangout', kind: 'network', minLevel: 2, cost: 'none', phase: 2, cooldownDays: 4, xp: 0, memoryType: null, focus: 'none', areas: ['intro'], places: ['park', 'cafe'], emoji: '👫' },
  home_visit: { id: 'home_visit', kind: 'home', minLevel: 4, cost: 'period', phase: 3, cooldownDays: 7, xp: 12, memoryType: 'event', focus: 'npc', areas: ['possessions', 'wantto'], places: ['home'], emoji: '🏠' },
  friend_house: { id: 'friend_house', kind: 'home', minLevel: 4, cost: 'period', cooldownDays: 7, xp: 12, memoryType: 'event', focus: 'npc', areas: ['possessions', 'wantto', 'food'], places: ['friendhouse'], emoji: '🏡' },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

// What each interest becomes as a shared activity. `direct` = the activity
// really is the interest (drawing → draw together); otherwise it is the
// nearest fit. hobby:* are Hobby Session variants (Phase 1c).
export const INTEREST_ACTIVITY = {
  soccer: { act: 'soccer', direct: true },
  baseball: { act: 'catch', direct: true },
  dodgeball: { act: 'catch', direct: true },
  basketball: { act: 'catch', direct: true },
  swimming: { act: 'catch', direct: false },
  running: { act: 'soccer', direct: false },
  music: { act: 'hobby:music', direct: true },
  singing: { act: 'hobby:music', direct: true },
  piano: { act: 'hobby:music', direct: true },
  dancing: { act: 'hobby:music', direct: true },
  drawing: { act: 'hobby:draw', direct: true },
  comics: { act: 'hobby:draw', direct: true },
  reading: { act: 'cafe', direct: true },
  games: { act: 'cafe', direct: false },
  cooking: { act: 'cafe', direct: false },
  sweets: { act: 'cafe', direct: true },
  animals: { act: 'hobby:spot', direct: true },
  bugs: { act: 'hobby:spot', direct: true },
  shopping: { act: 'cafe', direct: false },
  skateboarding: { act: 'catch', direct: false },
  cycling: { act: 'hobby:spot', direct: false },
};

/** Activities that need dry weather. */
export const OUTDOOR_ACTS = new Set(['soccer', 'catch', 'hobby:spot']);

// Lost-item favour: the item comes from the friend's interests when it can.
export const LOST_ITEM_FOR = {
  soccer: 'ball', baseball: 'ball', dodgeball: 'ball', basketball: 'ball',
  reading: 'book', comics: 'book',
  music: 'recorder', singing: 'recorder', piano: 'recorder',
  drawing: 'pencilcase',
};

// Presents and "new things" (special-day good news). en is the noun phrase
// without an article; a is its article. newThing: false → not used for "I got
// a new ___!" because it would read oddly or contradict a known fact.
export const PRESENT_FOR = {
  soccer: { a: 'a', en: 'soccer ball', ja: 'サッカーボール', emoji: '⚽' },
  baseball: { a: 'a', en: 'baseball cap', ja: '野球のぼうし', emoji: '🧢' },
  dodgeball: { a: 'a', en: 'ball', ja: 'ボール', emoji: '🔴' },
  basketball: { a: 'a', en: 'basketball', ja: 'バスケットボール', emoji: '🏀' },
  swimming: { a: 'a', en: 'towel', ja: 'タオル', emoji: '🧺' },
  running: { a: 'a', en: 'water bottle', ja: 'すいとう', emoji: '🥤' },
  music: { a: 'a', en: 'music box', ja: 'オルゴール', emoji: '🎶' },
  singing: { a: 'a', en: 'song book', ja: '歌の本', emoji: '🎤' },
  piano: { a: 'a', en: 'piano book', ja: 'ピアノの本', emoji: '🎹' },
  dancing: { a: 'a', en: 'cool hat', ja: 'かっこいいぼうし', emoji: '🎩' },
  drawing: { a: 'a', en: 'sketchbook', ja: 'スケッチブック', emoji: '🎨' },
  reading: { a: 'a', en: 'book', ja: '本', emoji: '📚' },
  games: { a: 'a', en: 'card game', ja: 'カードゲーム', emoji: '🃏' },
  cooking: { a: 'an', en: 'apron', ja: 'エプロン', emoji: '🍳' },
  sweets: { a: 'a', en: 'box of cookies', ja: 'クッキー', emoji: '🍪', newThing: false },
  animals: { a: 'an', en: 'animal book', ja: '動物の本', emoji: '🐶' },
  bugs: { a: 'a', en: 'bug box', ja: '虫かご', emoji: '🐞' },
  shopping: { a: 'a', en: 'tote bag', ja: 'トートバッグ', emoji: '👜' },
  skateboarding: { a: 'a', en: 'skateboard sticker', ja: 'スケボーのステッカー', emoji: '🛹' },
  comics: { a: 'a', en: 'comic book', ja: 'まんが', emoji: '📖' },
  cycling: { a: 'a', en: 'bike bell', ja: '自転車のベル', emoji: '🔔' },
};

export const presentPhrase = (p) => `${p.a} ${p.en}`;
