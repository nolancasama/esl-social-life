// Class/world generation. Pure logic (no DOM, no three.js) so it can be unit
// tested. Every NPC is FICTIONAL: names may come from a real class list, but
// looks, interests, skills and routines are generated from seeds and never
// inferred from the name.

import { RNG, hashString } from '../core/rng.js';
import { assignStyles } from './personality.js';
import {
  INTERESTS, ABILITIES, FOODS, DRINKS, SUBJECTS, PETS, ADJECTIVES, ATTRACTIONS,
  HOME_ACTS, AWAY_ACTS, interest, LOCATIONS,
} from '../data/content.js';

export const SKIN_TONES = ['#FFE3CC', '#F9D3B2', '#EFC29C', '#DDA77F', '#BE8460', '#8E5B3D'];
export const HAIR_COLORS = ['#1F1C24', '#3B2B24', '#5A3A27', '#86593A', '#A4562F', '#2B3150'];
export const HAIR_COLORS_FUN = ['#F2C14E', '#E86A92', '#4C8DF6', '#7BD389', '#9B6BE0', '#D5D8DD'];
export const TOP_COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#20C997', '#4DABF7', '#5C7CFA', '#9775FA', '#F783AC', '#FFFFFF', '#3D4451', '#A9E34B'];
export const BOTTOM_COLORS = ['#2B3A55', '#4B5563', '#6C4F3D', '#2F6F4E', '#2F6DB5', '#D9DEE5', '#8C2F39'];
export const SHOE_COLORS = ['#FFFFFF', '#FF6B6B', '#343A40', '#4DABF7', '#FFD43B', '#69DB7C'];
export const BAG_COLORS = ['#C92A2A', '#212529', '#1864AB', '#6B3E1F', '#E64980', '#2B8A3E', '#7048E8', '#0CA678'];

export const HAIR_STYLES = ['short', 'spiky', 'messy', 'buzz', 'side', 'curly', 'bob', 'long', 'ponytail', 'twintails', 'bun'];
export const TOP_STYLES = ['tshirt', 'hoodie', 'jacket', 'collar'];
export const BOTTOM_STYLES = ['shorts', 'pants', 'skirt'];
export const ACCESSORIES = ['none', 'glasses', 'cap', 'headband', 'hairclip'];
export const EYE_STYLES = ['round', 'happy', 'sleepy'];

// Hair/clothing pools follow the pronoun the TEACHER chose, never the name.
const HAIR_POOLS = {
  he: ['short', 'spiky', 'messy', 'buzz', 'side', 'curly'],
  she: ['bob', 'long', 'ponytail', 'twintails', 'bun', 'curly', 'short'],
  name: ['short', 'messy', 'bob', 'curly', 'side', 'ponytail'],
};
const ACC_POOLS = {
  he: [['none', 5], ['glasses', 1.4], ['cap', 1.4]],
  she: [['none', 4], ['glasses', 1.2], ['headband', 1.4], ['hairclip', 1.4], ['cap', 0.8]],
  name: [['none', 5], ['glasses', 1.4], ['cap', 1.2], ['headband', 0.8]],
};

const PERSONALITIES = ['cheerful', 'calm', 'energetic', 'gentle'];

// ---------------------------------------------------------------------------
// Names and roster parsing

export function normalizeName(name) {
  return String(name ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function nameKey(name) {
  return normalizeName(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const PRONOUN_WORDS = {
  he: 'he', him: 'he', boy: 'he', m: 'he', male: 'he', '男': 'he', 'くん': 'he', '君': 'he',
  she: 'she', her: 'she', girl: 'she', f: 'she', female: 'she', '女': 'she', 'ちゃん': 'she', 'さん': 'name',
  they: 'name', name: 'name', '-': 'name',
};

/**
 * Parse a pasted class list: one name per line, optionally followed by a
 * pronoun ("Ken, he" / "Yuki (she)" / "Aoi - name"). Blank lines are dropped
 * and duplicate names (case/spacing-insensitive) keep their first entry.
 */
export function parseRoster(text, { max = 40 } = {}) {
  const entries = [];
  const duplicates = [];
  let blanks = 0;
  const seen = new Set();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    let line = normalizeName(raw);
    if (!line) { blanks++; continue; }
    let pronoun = 'name';
    const m = line.match(/^(.*?)(?:\s*[,，、\-–(（]\s*|\s+)([A-Za-z]+|男|女|くん|君|ちゃん|さん)\s*[)）]?$/);
    if (m && PRONOUN_WORDS[m[2].toLowerCase()] !== undefined && normalizeName(m[1])) {
      pronoun = PRONOUN_WORDS[m[2].toLowerCase()];
      line = normalizeName(m[1]);
    }
    line = line.replace(/[,，、]+$/, '').trim();
    if (!line) { blanks++; continue; }
    const key = nameKey(line);
    if (!key) { blanks++; continue; }
    if (seen.has(key)) { duplicates.push(line); continue; }
    seen.add(key);
    entries.push({ name: line.slice(0, 24), pronoun });
    if (entries.length >= max) break;
  }
  return { entries, duplicates, blanks };
}

/** Stable NPC id for a roster entry. */
export function npcIdFor(name) {
  const key = nameKey(name);
  // Keep ids ASCII-safe even for Japanese names.
  return /^[a-z0-9]+$/.test(key) ? key : 'n' + hashString(key).toString(36);
}

// ---------------------------------------------------------------------------
// Looks

function randomLook(rng, pronoun) {
  const pool = HAIR_POOLS[pronoun] || HAIR_POOLS.name;
  const accPool = ACC_POOLS[pronoun] || ACC_POOLS.name;
  const bottoms = pronoun === 'she' ? [['shorts', 1], ['pants', 1], ['skirt', 1.2]] : [['shorts', 1], ['pants', 1]];
  return {
    skin: SKIN_TONES[rng.weighted([0, 1, 2, 3, 4, 5], (i) => [3, 4, 3, 1.5, 0.8, 0.6][i])],
    hairStyle: rng.pick(pool),
    hairColor: HAIR_COLORS[rng.weighted([0, 1, 2, 3, 4, 5], (i) => [5, 4, 2, 1, 0.6, 0.8][i])],
    top: rng.pick(TOP_STYLES),
    topColor: rng.pick(TOP_COLORS),
    bottom: rng.weighted(bottoms, (b) => b[1])[0],
    bottomColor: rng.pick(BOTTOM_COLORS),
    shoes: rng.pick(SHOE_COLORS),
    bag: rng.pick(BAG_COLORS),
    accessory: rng.weighted(accPool, (a) => a[1])[0],
    accColor: rng.pick(TOP_COLORS),
    eyes: rng.pick(EYE_STYLES),
    height: Math.round(rng.float(0.95, 1.05) * 100) / 100,
  };
}

export function lookDistance(a, b) {
  let d = 0;
  if (a.hairStyle !== b.hairStyle) d += 2;
  if (a.hairColor !== b.hairColor) d += 0.8;
  if (a.topColor !== b.topColor) d += 1.6;
  if (a.top !== b.top) d += 0.6;
  if (a.accessory !== b.accessory) d += 1;
  if (a.bottom !== b.bottom) d += 0.4;
  if (a.bottomColor !== b.bottomColor) d += 0.3;
  if (a.skin !== b.skin) d += 0.3;
  return d;
}

/** A look that is as different as possible from `others`. */
export function generateLook(seed, pronoun, others = []) {
  const rng = new RNG(seed);
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < 10; i++) {
    const c = randomLook(rng, pronoun);
    const score = others.length ? Math.min(...others.map((o) => lookDistance(c, o))) : 0;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Traits

function generateTraits(seed, pin = {}) {
  const rng = new RNG(seed);
  const likes = [];
  for (const id of pin.likes || []) if (interest(id) && !likes.includes(id)) likes.push(id);
  const pool = rng.shuffle(INTERESTS.map((i) => i.id)).filter((id) => !likes.includes(id));
  while (likes.length < 3) likes.push(pool.shift());

  const cans = [];
  for (const id of pin.cans || []) if (!cans.includes(id)) cans.push(id);
  for (const like of likes) {
    if (cans.length >= 2) break;
    const options = (interest(like).cans || []).filter((c) => !cans.includes(c));
    if (options.length && rng.chance(0.75)) cans.push(rng.pick(options));
  }
  const canPool = rng.shuffle(ABILITIES.map((a) => a.id)).filter((id) => !cans.includes(id));
  while (cans.length < 2) cans.push(canPool.shift());

  const hasPet = rng.chance(0.55);
  const petType = rng.pick(PETS).id;
  const petCount = petType === 'fish' ? rng.int(2, 6) : rng.chance(0.75) ? 1 : 2;
  const birthdayMonth = rng.int(1, 12);
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][birthdayMonth - 1];

  const homeActs = rng.sample(HOME_ACTS.map((h) => h.id), 2);
  if (likes.includes('piano') && !homeActs.includes('music')) homeActs[0] = 'read';

  return {
    personality: rng.pick(PERSONALITIES),
    adjectives: rng.sample(ADJECTIVES.map((a) => a.id), 2),
    likes,
    cans,
    food: rng.pick(FOODS).id,
    drink: rng.pick(DRINKS).id,
    subject: rng.pick(SUBJECTS).id,
    birthday: { m: birthdayMonth, d: rng.int(1, monthDays) },
    wake: { h: rng.pick([6, 6, 6, 7, 7]), m: rng.pick([0, 0, 15, 30, 30, 45]) },
    pet: hasPet ? { type: petType, count: petCount } : null,
    bike: rng.chance(0.8),
    games: likes.includes('games') ? rng.int(8, 25) : rng.int(0, 7),
    books: likes.includes('reading') || likes.includes('comics') ? rng.int(30, 120) : rng.int(5, 30),
    dream: rng.pick(ATTRACTIONS).id,
    homeActs,
    voice: { pitch: Math.round(rng.float(1.05, 1.6) * 100) / 100, rate: Math.round(rng.float(0.86, 0.98) * 100) / 100 },
    color: rng.pick(['#FF7A59', '#2EC4B6', '#5C7CFA', '#F06595', '#FAB005', '#20C997', '#845EF7', '#339AF0', '#E8590C', '#0CA678']),
  };
}

// ---------------------------------------------------------------------------
// Friendships between NPCs (fictional). Every NPC gets at least two links so
// no classmate's name ever appears friendless.

function linkFriends(npcs, rng, roster) {
  const ids = npcs.map((n) => n.id);
  const byId = new Map(npcs.map((n) => [n.id, n]));
  const fresh = npcs.filter((n) => !n.links);
  for (const n of npcs) {
    n.links = Object.fromEntries(Object.entries(n.links || {}).filter(([id]) => byId.has(id) && id !== n.id));
  }
  const link = (a, b, s) => {
    if (a === b) return;
    byId.get(a).links[b] = Math.max(byId.get(a).links[b] || 0, s);
    byId.get(b).links[a] = Math.max(byId.get(b).links[a] || 0, s);
  };

  // Pinned friendships (sample roster only).
  for (const entry of roster) {
    for (const friendName of entry.pin?.friends || []) {
      const a = npcIdFor(entry.name);
      const b = npcIdFor(friendName);
      if (byId.has(a) && byId.has(b)) link(a, b, 2);
    }
  }

  if (fresh.length === npcs.length) {
    // Fresh class: friend groups of 2–4, kept together where pinned.
    const order = rng.shuffle(ids);
    // Pull pinned partners next to each other.
    for (const n of npcs) {
      for (const other of Object.keys(n.links)) {
        const i = order.indexOf(n.id); const j = order.indexOf(other);
        if (Math.abs(i - j) > 1) { order.splice(j, 1); order.splice(order.indexOf(n.id) + 1, 0, other); }
      }
    }
    const groups = [];
    let i = 0;
    while (i < order.length) {
      const left = order.length - i;
      let size = left <= 4 ? left : rng.pick([2, 3, 3, 4]);
      if (left - size === 1) size += 1;
      groups.push(order.slice(i, i + size));
      i += size;
    }
    if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(...groups.pop());
    groups.forEach((g, gi) => {
      for (const a of g) { byId.get(a).group = `g${gi}`; for (const b of g) if (a !== b) link(a, b, 2); }
    });
    // Cross-group acquaintances.
    for (const a of order) {
      const others = order.filter((b) => byId.get(b).group !== byId.get(a).group);
      if (others.length) link(a, rng.pick(others), 1);
    }
  } else {
    // Roster edited: attach newcomers without disturbing existing friendships.
    for (const n of fresh) {
      const candidates = npcs.filter((o) => o.id !== n.id && o.group);
      if (candidates.length) {
        candidates.sort((x, y) => Object.keys(x.links).length - Object.keys(y.links).length);
        const host = candidates[Math.min(candidates.length - 1, rng.int(0, 2))];
        n.group = host.group;
        link(n.id, host.id, 2);
      } else {
        n.group = `g${hashString(n.id) % 997}`;
      }
    }
  }
  // Guarantee at least two links each.
  for (const n of npcs) {
    let guard = 0;
    while (Object.keys(n.links).length < Math.min(2, npcs.length - 1) && guard++ < 10) {
      const others = ids.filter((id) => id !== n.id && !n.links[id]);
      if (!others.length) break;
      link(n.id, rng.pick(others), 1);
    }
    if (!n.group) n.group = `g${hashString(n.id) % 997}`;
  }
}

// ---------------------------------------------------------------------------
// Weekly schedules. schedule[dow][period] = { loc, act, with: [ids] }
// dow 0 = Monday. period 0 = morning, 1 = after school / afternoon, 2 = evening.

const VISIBLE = ['park', 'cafe', 'town'];

function interestSlot(likeId, rng) {
  const it = interest(likeId);
  return { loc: rng.pick(it.places), act: likeId, with: [] };
}

function freeSlot(p, rng, dow, per) {
  const weekend = dow >= 5;
  const options = [];
  p.likes.forEach((id, i) => options.push({ w: [3, 2, 1.4][i], make: () => interestSlot(id, rng) }));
  options.push({ w: weekend ? 0.8 : 1.4, make: () => ({ loc: 'house', act: 'home:' + rng.pick(p.homeActs), with: [] }) });
  options.push({ w: 0.6, make: () => ({ loc: 'town', act: 'walk', with: [] }) });
  options.push({ w: weekend ? 0.7 : 0.3, make: () => ({ loc: 'away', act: 'away:' + rng.pick(['grandparents', 'library']), with: [] }) });
  return rng.weighted(options, (o) => o.w).make();
}

function buildSchedule(p, rng) {
  const sched = [];
  for (let dow = 0; dow < 7; dow++) {
    const day = [];
    for (let per = 0; per < 3; per++) {
      if (per === 2) day.push({ loc: 'house', act: 'home:' + p.homeActs[dow % p.homeActs.length], with: [] });
      else if (dow < 5 && per === 0) day.push({ loc: 'classroom', act: 'school', with: [] });
      else day.push(freeSlot(p, rng, dow, per));
    }
    sched.push(day);
  }
  // Saturday afternoon is always their main interest ("I play soccer on Saturdays.").
  sched[5][1] = interestSlot(p.likes[0], rng);
  // Lessons for piano players; swimmers swim on Sunday mornings.
  if (p.likes.includes('piano')) sched[1][1] = { loc: 'away', act: 'away:pianolesson', with: [] };
  if (p.likes.includes('swimming')) sched[6][0] = { loc: 'away', act: 'away:swim', with: [] };
  return sched;
}

function alignGroups(npcs, rng) {
  const groups = new Map();
  for (const n of npcs) {
    if (!groups.has(n.group)) groups.set(n.group, []);
    groups.get(n.group).push(n);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const g = new RNG(members.map((m) => m.id).sort().join('+') + ':' + rng.int(0, 1e6));
    const shared = members[0].likes.find((id) => members.every((m) => m.likes.includes(id)) && interest(id).places.some((pl) => VISIBLE.includes(pl)));
    const visibleLike = (m) => m.likes.find((id) => interest(id).places.some((pl) => VISIBLE.includes(pl)));
    const act = shared || visibleLike(members[0]) || 'walk';
    const loc = act === 'walk' ? 'town' : interest(act).places.find((pl) => VISIBLE.includes(pl));
    const weekdaySlot = [g.int(0, 4), 1];
    const weekendSlot = g.pick([[5, 0], [6, 0], [6, 1]]);
    for (const [dow, per] of [weekdaySlot, weekendSlot]) {
      for (const m of members) {
        if (m.schedule[dow][per].act === 'away:pianolesson' || m.schedule[dow][per].act === 'away:swim') continue;
        m.schedule[dow][per] = { loc, act, with: members.filter((o) => o !== m).map((o) => o.id) };
      }
    }
  }
}

function ensureLiveliness(npcs, rng) {
  const need = Math.max(2, Math.ceil(npcs.length * 0.3));
  for (let dow = 0; dow < 7; dow++) {
    for (let per = 0; per < 2; per++) {
      if (dow < 5 && per === 0) continue;
      let visible = npcs.filter((n) => VISIBLE.includes(n.schedule[dow][per].loc));
      const hidden = rng.shuffle(npcs.filter((n) => !VISIBLE.includes(n.schedule[dow][per].loc) && !n.schedule[dow][per].act.startsWith('away:piano') && !(dow === 5 && per === 1)));
      while (visible.length < need && hidden.length) {
        const n = hidden.shift();
        const like = n.likes.find((id) => interest(id).places.some((pl) => VISIBLE.includes(pl)));
        n.schedule[dow][per] = like
          ? { loc: interest(like).places.find((pl) => VISIBLE.includes(pl)), act: like, with: [] }
          : { loc: 'town', act: 'walk', with: [] };
        visible = npcs.filter((x) => VISIBLE.includes(x.schedule[dow][per].loc));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Build (or update) the class world.
 * roster: [{ name, pronoun, lookSeed?, pin? }]
 * prev: previous class data; profiles of names already present are kept.
 */
export function buildClass(roster, seed, prev = null) {
  const prevById = new Map((prev?.npcs || []).map((n) => [n.id, n]));
  const npcs = [];
  const looks = [];
  for (const entry of roster) {
    const id = npcIdFor(entry.name);
    const old = prevById.get(id);
    if (old && old.seedVersion === 1) {
      const kept = { ...old, name: entry.name, pronoun: entry.pronoun };
      if ((entry.lookSeed || 0) !== (old.lookSeed || 0) || entry.pronoun !== old.pronoun) {
        kept.look = generateLook(`${seed}|look|${id}|${entry.lookSeed || 0}`, entry.pronoun, looks);
        kept.lookSeed = entry.lookSeed || 0;
      }
      looks.push(kept.look);
      npcs.push(kept);
      continue;
    }
    const traits = generateTraits(`${seed}|traits|${id}`, entry.pin);
    const look = generateLook(`${seed}|look|${id}|${entry.lookSeed || 0}`, entry.pronoun, looks);
    looks.push(look);
    npcs.push({ id, name: entry.name, pronoun: entry.pronoun, lookSeed: entry.lookSeed || 0, seedVersion: 1, pin: entry.pin || null, look, ...traits });
  }
  const rng = new RNG(`${seed}|links|${npcs.length}`);
  linkFriends(npcs, rng, roster);
  for (const n of npcs) {
    if (!n.schedule) n.schedule = buildSchedule(n, new RNG(`${seed}|sched|${n.id}`));
    // Drop schedule companions who left the class.
    for (const day of n.schedule) for (const s of day) s.with = (s.with || []).filter((id) => npcs.some((o) => o.id === id));
  }
  if (!prev) alignGroups(npcs, new RNG(`${seed}|align`));
  ensureLiveliness(npcs, new RNG(`${seed}|lively`));
  // Behaviour styles: kept for existing profiles, balanced for newcomers.
  assignStyles(npcs, seed);
  return npcs;
}

/**
 * The player's starting friend and the classmate that friend introduces on
 * day one. Prefers an introduced NPC whose main interest is a playable park
 * activity so the first outing is a real minigame.
 */
export function chooseFirstPair(npcs, excludeIds, seed) {
  const pool = npcs.filter((n) => !excludeIds.includes(n.id));
  if (pool.length < 2) return { firstFriend: pool[0]?.id || null, intro: null };
  const pinnedFirst = pool.find((n) => n.pin?.firstFriend);
  const pinnedIntro = pool.find((n) => n.pin?.intro);
  if (pinnedFirst && pinnedIntro && pinnedFirst.links[pinnedIntro.id]) return { firstFriend: pinnedFirst.id, intro: pinnedIntro.id };

  const rng = new RNG(`${seed}|firstpair`);
  const score = (n) => {
    const a = interest(n.likes[0]).activity;
    return a === 'soccer' ? 4 : a === 'catch' ? 3.5 : a === 'cafe' ? 2 : n.likes.some((l) => interest(l).activity) ? 1 : 0;
  };
  const pairs = [];
  for (const f of pool) {
    for (const [otherId, s] of Object.entries(f.links)) {
      const o = pool.find((x) => x.id === otherId);
      if (!o || s < 2) continue;
      pairs.push({ f, o, w: 1 + score(o) * 2 + rng.next() });
    }
  }
  if (!pairs.length) {
    const [f, o] = rng.sample(pool, 2);
    return { firstFriend: f.id, intro: o.id };
  }
  pairs.sort((a, b) => b.w - a.w);
  return { firstFriend: pairs[0].f.id, intro: pairs[0].o.id };
}

/** Playable activity for this NPC's day-one invitation. */
export function firstOutingFor(npc) {
  for (const id of npc.likes) {
    const a = interest(id).activity;
    if (a) return { act: a, like: id };
  }
  return { act: 'cafe', like: 'sweets' };
}

export function isVisibleLoc(loc) { return Boolean(LOCATIONS[loc]?.scene); }

export { HOME_ACTS, AWAY_ACTS };
