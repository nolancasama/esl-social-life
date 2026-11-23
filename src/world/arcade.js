// Game Center minigame rules. Pure and deterministic: the activities draw
// them, tests check them. Arcade play is free (DESIGN_DECISIONS 2026-11-22).
import { hashString, rngFor } from '../core/rng.js';

// ------------------------------------------------------------ crane game
// The machine floor is a unit square seen from above: x 0 (left) → 1 (right),
// z 0 (back) → 1 (front). The claw starts above the prize chute.
export const CRANE_PRIZES = Object.freeze([
  { id: 'bear', en: 'the bear', a: 'a bear', ja: 'くま', emoji: '🧸', souvenir: 'crane_bear', x: 0.2, z: 0.3, color: '#C9925E' },
  { id: 'cat', en: 'the cat', a: 'a cat', ja: 'ねこ', emoji: '🐱', souvenir: 'crane_cat', x: 0.47, z: 0.24, color: '#F2C26B' },
  { id: 'rabbit', en: 'the rabbit', a: 'a rabbit', ja: 'うさぎ', emoji: '🐰', souvenir: 'crane_rabbit', x: 0.74, z: 0.32, color: '#F4D9E3' },
  { id: 'duck', en: 'the duck', a: 'a duck', ja: 'あひる', emoji: '🐤', souvenir: 'crane_duck', x: 0.24, z: 0.64, color: '#F7D84B' },
  { id: 'dino', en: 'the dinosaur', a: 'a dinosaur', ja: 'きょうりゅう', emoji: '🦕', souvenir: 'crane_dino', x: 0.5, z: 0.6, color: '#86C28B' },
  { id: 'star', en: 'the star', a: 'a star', ja: 'ほし', emoji: '⭐', souvenir: 'crane_star', x: 0.73, z: 0.66, color: '#F6B94A' },
].map((p) => Object.freeze(p)));
export const CRANE_START = Object.freeze({ x: 0.9, z: 0.9 });
export const CRANE_SPEED = 0.32; // machine widths per second
export const CRANE_TOLERANCE = 0.065; // the claw's grip radius
export const CRANE_TRIES = 3;

export function cranePrize(id) { return CRANE_PRIZES.find((p) => p.id === id) || null; }

export function moveClaw(claw, { x = 0, z = 0 }, dt) {
  const clamp = (v) => Math.min(0.95, Math.max(0.05, v));
  return { x: clamp(claw.x + x * CRANE_SPEED * dt), z: clamp(claw.z + z * CRANE_SPEED * dt) };
}

/** The prize the claw lifts, or null. Only position decides; there is no chance. */
export function craneGrab(claw) {
  let best = null, bestD = Infinity;
  for (const p of CRANE_PRIZES) {
    const d = Math.hypot(p.x - claw.x, p.z - claw.z);
    if (d <= CRANE_TOLERANCE && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** What a friend calls out while you steer toward the prize you chose. */
export function craneCue(claw, prize) {
  const dx = prize.x - claw.x, dz = prize.z - claw.z;
  const near = CRANE_TOLERANCE * 0.6;
  if (Math.abs(dx) > near && Math.abs(dx) >= Math.abs(dz)) {
    return dx < 0 ? { id: 'left', en: 'Go left.', ja: '左に行って。' } : { id: 'right', en: 'Go right.', ja: '右に行って。' };
  }
  if (Math.abs(dz) > near) {
    return dz < 0 ? { id: 'back', en: 'Go back.', ja: 'おくに行って。' } : { id: 'forward', en: 'Come forward.', ja: '手前に来て。' };
  }
  return { id: 'under', en: "Stop! It's under the claw.", ja: 'ストップ！クレーンの下にあるよ。' };
}

/** Award a won prize once. The souvenir kind is the key, so retries can't duplicate it. */
export function winCranePrize(save, prizeId, day = 0) {
  const prize = cranePrize(prizeId);
  if (!prize) return { ok: false, reason: 'unknown' };
  if (!Array.isArray(save.souvenirs)) save.souvenirs = [];
  if (save.souvenirs.some((s) => s.kind === prize.souvenir)) return { ok: false, reason: 'have', prize };
  // The newest prize goes first so it stays visible on a full shelf.
  save.souvenirs.unshift({ kind: prize.souvenir, npcId: null, day, itemId: prize.id });
  return { ok: true, prize };
}

export function hasCranePrize(save, prizeId) {
  const prize = cranePrize(prizeId);
  return !!prize && (save.souvenirs || []).some((s) => s.kind === prize.souvenir);
}

// ------------------------------------------------------------ racing game
// A short scrolling road. Distances are metres; x is the car's sideways
// position in road units (0 = straight ahead at the start line).
export const RACE_TRACK = Object.freeze([
  { kind: 'straight', len: 40 },
  { kind: 'left', len: 30, shift: -0.45 },
  { kind: 'straight', len: 25 },
  { kind: 'right', len: 30, shift: 0.7 },
  { kind: 'straight', len: 25 },
  { kind: 'left', len: 25, shift: -0.25 },
  { kind: 'straight', len: 30 },
].map((s) => Object.freeze(s)));
export const RACE_FINISH = RACE_TRACK.reduce((n, s) => n + s.len, 0);
export const RACE_STOP_ZONE = Object.freeze({ from: RACE_FINISH, to: RACE_FINISH + 12 });
export const RACE_ROAD_HALF = 0.28;
export const RACE_SPEED = 10;
const STEER_SPEED = 1.15;
const LOOKAHEAD = 20;

const smooth = (t) => t * t * (3 - 2 * t);

export function raceCenterAt(d) {
  let x = 0, start = 0;
  for (const s of RACE_TRACK) {
    if (d < start + s.len) return x + (s.shift ? s.shift * smooth(Math.max(0, d - start) / s.len) : 0);
    x += s.shift || 0;
    start += s.len;
  }
  return x;
}

export function raceSegmentAt(d) {
  let start = 0;
  for (const s of RACE_TRACK) {
    if (d < start + s.len) return { ...s, start };
    start += s.len;
  }
  return null;
}

const CUES = {
  straight: { id: 'straight', en: 'Go straight!', ja: 'まっすぐ行って！' },
  left: { id: 'left', en: 'Turn left!', ja: '左に曲がって！' },
  right: { id: 'right', en: 'Turn right!', ja: '右に曲がって！' },
  stop: { id: 'stop', en: 'Stop!', ja: 'とまって！' },
};

/** The navigator's call: the next turn a little before it, then "Stop!" at the end. */
export function raceCueAt(d) {
  if (d >= RACE_FINISH - 12) return CUES.stop;
  const now = raceSegmentAt(d);
  if (now && now.kind !== 'straight') return CUES[now.kind];
  const ahead = raceSegmentAt(d + LOOKAHEAD);
  if (ahead && ahead.kind !== 'straight') return CUES[ahead.kind];
  return CUES.straight;
}

export function newRace() { return { d: 0, x: 0, v: 0, t: 0, finishTime: null, stopped: false, perfectStop: false, offroad: 0 }; }

/** Advance one frame. steer is -1, 0 or 1; brake is the STOP button. */
export function stepRace(s, { steer = 0, brake = false }, dt, { maxSpeed = RACE_SPEED } = {}) {
  if (s.stopped) return s;
  const n = { ...s };
  n.x += steer * STEER_SPEED * dt;
  const onRoad = Math.abs(n.x - raceCenterAt(n.d)) <= RACE_ROAD_HALF;
  if (!onRoad) n.offroad += dt;
  const past = n.d >= RACE_STOP_ZONE.to;
  const target = brake || past ? 0 : onRoad ? maxSpeed : maxSpeed * 0.5;
  const rate = brake || past ? 18 : 6;
  n.v += Math.max(-rate * dt, Math.min(rate * dt, target - n.v));
  n.d += n.v * dt;
  n.t += dt;
  if (n.finishTime === null && n.d >= RACE_FINISH) n.finishTime = n.t;
  if (n.finishTime !== null && n.v < 0.4 && (brake || past)) {
    n.stopped = true;
    n.v = 0;
    n.perfectStop = !!brake && n.d >= RACE_STOP_ZONE.from && n.d <= RACE_STOP_ZONE.to;
  }
  return n;
}

// ------------------------------------------------------------ simulated rival car
// The rival drives the same track with the same rules (DESIGN_DECISIONS
// 2026-11-23): it steers toward the road a little ahead with a short
// reaction delay, its top speed is a little below the player's, and it makes
// two or three seeded small mistakes (a wobble off the line). A clean player
// always wins; a careless one can lose. No physics engine, no randomness at
// run time: everything comes from the seed.

/** skill 0.35–0.8 (see world/things.js npcSkill). */
export function newRival(skill = 0.5, seed = 'rival') {
  const r = rngFor('race-rival-v2', seed);
  const n = 2 + (r.next() < 0.5 ? 1 : 0);
  const mistakes = [];
  for (let i = 0; i < n; i++) {
    const at = 18 + (i + r.next() * 0.8) * ((RACE_FINISH - 30) / n);
    mistakes.push({ at, dur: 0.35 + r.next() * 0.35 + (0.8 - skill) * 0.4, dir: r.next() < 0.5 ? -1 : 1, done: false });
  }
  return {
    s: newRace(), skill, steer: 0, cool: 0, mistake: null, mistakes,
    react: 0.22 - skill * 0.12, maxSpeed: RACE_SPEED * (0.9 + skill * 0.07),
  };
}

/** Advance the rival one frame. Returns { rv, event } where event is 'mistake' | 'finish' | 'stop' | null. */
export function stepRival(rv, dt) {
  if (rv.s.stopped) return { rv, event: null };
  const n = { ...rv, mistakes: rv.mistakes.map((m) => ({ ...m })) };
  let event = null;
  const next = n.mistakes.find((m) => !m.done && n.s.d >= m.at);
  if (next && !n.mistake) { next.done = true; n.mistake = { t: next.dur, dir: next.dir }; event = 'mistake'; }
  n.cool -= dt;
  if (n.mistake) {
    n.mistake = { ...n.mistake, t: n.mistake.t - dt };
    n.steer = n.mistake.dir;
    if (n.mistake.t <= 0) n.mistake = null;
  } else if (n.cool <= 0) {
    // Look a little ahead, like the player following the road.
    const diff = raceCenterAt(n.s.d + 3) - n.s.x;
    n.steer = Math.abs(diff) < 0.03 ? 0 : Math.sign(diff);
    n.cool = n.react;
  }
  const brake = n.s.finishTime !== null && n.s.d >= RACE_STOP_ZONE.from + 1.5;
  const before = n.s.finishTime;
  n.s = stepRace(n.s, { steer: n.steer, brake }, dt, { maxSpeed: n.maxSpeed });
  if (before === null && n.s.finishTime !== null) event = 'finish';
  if (n.s.stopped) event = 'stop';
  return { rv: n, event };
}

/** Run a rival to the end (used when the player stops first, and by tests). */
export function finishRival(rv, dt = 1 / 60) {
  let cur = rv;
  for (let i = 0; i < 60 * 120 && !cur.s.stopped; i++) cur = stepRival(cur, dt).rv;
  return cur;
}

/** A friend's (or the rival car's) fixed, fair finishing time in seconds. */
export function raceGhostTime(id = 'rival') {
  const par = RACE_FINISH / RACE_SPEED;
  return Math.round((par + 1.0 + (hashString(`race-ghost-v1|${id}`) % 19) / 10) * 10) / 10;
}

// ------------------------------------------------------------ rhythm game
/** Grade a TAP at meter position p (0..1); the target is the middle. */
export function rhythmGrade(p) {
  if (p === null || p === undefined) return 'miss';
  const off = Math.abs(p - 0.5);
  return off <= 0.07 ? 'perfect' : off <= 0.16 ? 'good' : 'miss';
}

/** A friend's fixed score out of `beats` for a friendly challenge. */
export function rhythmFriendScore(id, beats = 8) {
  return Math.max(3, beats - 1 - (hashString(`rhythm-friend-v1|${id}`) % 4));
}
