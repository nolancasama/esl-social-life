import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildClass } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { World } from '../game/world.js';
import { TEMPLATES } from '../data/events.js';
import { migrateSave, SAVE_VERSION } from './migrate.js';
import { eligibleEvents, fstate, recoverInterrupted } from './friendship.js';

const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'));
const PHASE1 = new Set(Object.values(TEMPLATES).filter((t) => t.phase === 1).map((t) => t.id));

test('a version 1 save keeps every level, XP value, memory and plan', () => {
  const v1 = fixture();
  const s = migrateSave(fixture());
  assert.equal(s.version, SAVE_VERSION);
  for (const k of ['rel', 'memories', 'plans', 'messages', 'souvenirs', 'flags', 'settings', 'lang', 'npcLinks', 'discoveredLinks', 'time', 'daily', 'stats']) {
    assert.deepEqual(s[k], v1[k], `${k} unchanged`);
  }
  assert.deepEqual({ ...s.player, answers: undefined }, { ...v1.player, answers: undefined });
  assert.deepEqual(s.player.answers, {});
  assert.deepEqual(s.npcPlans, []);
  assert.ok(s.memories.every((m) => m.focus === undefined), 'old memories get no focus field');
  const f = fstate(s);
  assert.deepEqual(f.history, []);
  assert.equal(f.activeId, null);
});

test('migration is idempotent', () => {
  const once = migrateSave(fixture());
  const twice = migrateSave(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
  assert.equal(recoverInterrupted(twice), false);
});

test('a migrated save builds a world with the same levels, and old Lv5 friends get the milestone', () => {
  const cls = { seed: 'fixture-seed', npcs: buildClass(DEFAULT_ROSTER, 'fixture-seed') };
  const w = new World(cls, migrateSave(fixture()));
  assert.equal(w.level('ken'), 5);
  assert.equal(w.level('yuki'), 4);
  assert.equal(w.level('haru'), 3);
  assert.equal(w.level('mei'), 2);
  assert.equal(w.level('sota'), 1);
  // XP keeps working on top of the old values; the gate still counts legacy memories.
  w.xp('haru', 30, { reason: 'test' });
  assert.equal(w.level('haru'), 3, 'one memory → still capped at Lv3');
  assert.ok(eligibleEvents(w, 'ken', { available: PHASE1 }).eligible.includes('best_friend'));
  assert.equal(w.daily.day, 9, 'the saved daily state is reused');
});
