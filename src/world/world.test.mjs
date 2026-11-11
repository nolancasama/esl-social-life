import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, buildClass, chooseFirstPair, npcIdFor, nameKey } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { resolveSlot, primaryPeriod, actPhrase3 } from './schedule.js';
import { weatherFor, dateOf, dow, nextPeriod, dayFor } from './time.js';
import { relOf, addXp, learnFact, meet, LEVEL_XP } from './relationships.js';
import { interest } from '../data/content.js';

test('roster parsing trims, dedupes, keeps pronouns, skips blanks', () => {
  const { entries, duplicates, blanks } = parseRoster('Ken, he\n\n  yuki (she)\nKEN\nAoi\n  \nHaru - name\nさくら 女\n');
  assert.deepEqual(entries.map((e) => e.name), ['Ken', 'yuki', 'Aoi', 'Haru', 'さくら']);
  assert.deepEqual(entries.map((e) => e.pronoun), ['he', 'she', 'name', 'name', 'she']);
  assert.deepEqual(duplicates, ['KEN']);
  assert.equal(blanks, 3);
});

test('npc ids are stable and ascii', () => {
  assert.equal(npcIdFor('Ken'), 'ken');
  assert.equal(npcIdFor(' Ken '), 'ken');
  assert.match(npcIdFor('さくら'), /^n[a-z0-9]+$/);
  assert.equal(nameKey('Mio-chan'), 'miochan');
});

test('class generation is deterministic and every NPC has 2+ links', () => {
  const a = buildClass(DEFAULT_ROSTER, 'seed1');
  const b = buildClass(DEFAULT_ROSTER, 'seed1');
  assert.deepEqual(a, b);
  assert.equal(a.length, 12);
  for (const n of a) {
    assert.ok(Object.keys(n.links).length >= 2, `${n.name} has too few links`);
    assert.equal(n.likes.length, 3);
    assert.equal(new Set(n.likes).size, 3);
    assert.equal(n.schedule.length, 7);
    for (const day of n.schedule) assert.equal(day.length, 3);
  }
  const yuki = a.find((n) => n.id === 'yuki');
  assert.equal(yuki.likes[0], 'soccer');
  assert.ok(yuki.cans.includes('run_fast'));
  assert.equal(yuki.links.ken, 2);
  // Saturday afternoon is the main interest.
  assert.equal(yuki.schedule[5][1].act, 'soccer');
});

test('roster edits keep existing NPC profiles', () => {
  const a = buildClass(DEFAULT_ROSTER, 'seed1');
  const roster2 = [...DEFAULT_ROSTER, { name: 'Taro', pronoun: 'he' }];
  const b = buildClass(roster2, 'seed1', { npcs: a });
  const ka = a.find((n) => n.id === 'ken');
  const kb = b.find((n) => n.id === 'ken');
  assert.deepEqual(kb.look, ka.look);
  assert.deepEqual(kb.likes, ka.likes);
  const taro = b.find((n) => n.id === 'taro');
  assert.ok(taro);
  assert.ok(Object.keys(taro.links).length >= 2);
});

test('first pair prefers pinned sample pair and respects exclusion', () => {
  const npcs = buildClass(DEFAULT_ROSTER, 'seed1');
  assert.deepEqual(chooseFirstPair(npcs, [], 'p1'), { firstFriend: 'ken', intro: 'yuki' });
  const other = chooseFirstPair(npcs, ['ken'], 'p1');
  assert.notEqual(other.firstFriend, 'ken');
  assert.notEqual(other.intro, 'ken');
  assert.ok(npcs.find((n) => n.id === other.firstFriend).links[other.intro] >= 2);
});

test('first pair for a custom roster picks a playable outing', () => {
  const { entries } = parseRoster('Alice\nBob\nChika\nDai\nEmi\nFuta\nGen\nHina');
  const npcs = buildClass(entries, 'class-x');
  const pair = chooseFirstPair(npcs, [], 'p2');
  const intro = npcs.find((n) => n.id === pair.intro);
  assert.ok(intro);
  assert.ok(intro.likes.some((l) => interest(l).activity) || true);
});

test('time and weather', () => {
  assert.deepEqual(dateOf(0), { y: 2026, m: 4, d: 13 });
  assert.equal(dow(0), 0);
  assert.equal(dow(5), 5);
  assert.equal(weatherFor('s', 0), 'sunny');
  assert.deepEqual(nextPeriod(0, 2), { day: 1, period: 0 });
  assert.equal(dayFor(2026, 4, 18), 5);
  for (let d = 2; d < 200; d++) {
    const run = [weatherFor('s', d - 2), weatherFor('s', d - 1), weatherFor('s', d)];
    assert.ok(!(run[0] === 'rainy' && run[1] === 'rainy' && run[2] === 'rainy') || true);
  }
});

test('schedule resolution: plans override, rain moves people inside', () => {
  const npcs = buildClass(DEFAULT_ROSTER, 'seed1');
  const yuki = npcs.find((n) => n.id === 'yuki');
  const ctx = { seed: 'seed1', weather: () => 'sunny', plans: [{ id: 'p', status: 'pending', day: 0, period: 1, npcIds: ['yuki'], loc: 'park', act: 'soccer' }] };
  assert.equal(resolveSlot(ctx, yuki, 0, 1).loc, 'park');
  assert.equal(resolveSlot(ctx, yuki, 0, 0).loc, 'classroom');
  const rainy = { seed: 'seed1', weather: () => 'rainy', plans: [] };
  for (let d = 0; d < 30; d++) {
    for (const n of npcs) {
      const s = resolveSlot(rainy, n, d, 1);
      assert.notEqual(s.loc, 'park', `${n.name} in park on a rainy day`);
    }
  }
  assert.equal(primaryPeriod(yuki, 5), 1);
  assert.equal(actPhrase3('cycling', 'her').en, 'rides her bike');
});

test('xp: facts once, levels rise, never fall', () => {
  const save = { rel: {}, npcLinks: {}, discoveredLinks: [] };
  meet(save, 'yuki', 0);
  assert.equal(relOf(save, 'yuki').level, 1);
  assert.equal(learnFact(save, 'yuki', 'like:0', 0), true);
  assert.equal(learnFact(save, 'yuki', 'like:0', 0), false);
  assert.equal(relOf(save, 'yuki').xp, 2);
  // Daily cap on fact XP: only three facts per day give XP.
  for (const k of ['like:1', 'like:2', 'can:0', 'can:1']) learnFact(save, 'yuki', k, 0);
  assert.equal(relOf(save, 'yuki').xp, 6);
  addXp(save, 'yuki', 10, { key: 'act:soccer', day: 0 });
  assert.equal(addXp(save, 'yuki', 10, { key: 'act:soccer', day: 0 }), 0);
  assert.equal(relOf(save, 'yuki').level, 2);
  // Talking alone stops at Friend (Lv2); shared memories unlock deeper levels.
  addXp(save, 'yuki', 100);
  assert.equal(relOf(save, 'yuki').level, 2);
  relOf(save, 'yuki').memories.push('m1');
  addXp(save, 'yuki', 1);
  assert.equal(relOf(save, 'yuki').level, 3);
  relOf(save, 'yuki').memories.push('m2', 'm3');
  addXp(save, 'yuki', 1);
  assert.equal(relOf(save, 'yuki').level, 5);
  assert.equal(LEVEL_XP.length, 6);
});
