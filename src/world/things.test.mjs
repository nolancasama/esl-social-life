// Phase 2 possessions (DESIGN_DECISIONS 2026-11-23): ownership from real
// souvenirs, wearing restores the player's look, notices only describe what
// the save holds, visit choices follow interests, and NPC skill stays fair.
import test from 'node:test';
import assert from 'node:assert/strict';
import { THINGS, THING_IDS, thingsState, owns, ownedThings, setWorn, isWorn, forgetWorn, gamesCount, addDrawing, latestDrawing, noticeFor, markNoticed, visitChoices, VISIT_PLAYS, npcSkill, goodAt } from './things.js';
import { MALL_SHOPS, mallItem } from './mall.js';
import { migrateSave } from './migrate.js';
import { robotPath, ROBOT_LEVELS, pairsDeck, pairsMove, PAIR_WORDS, STORIES } from '../activities/things.js';

const saveWith = (...ids) => ({ time: { day: 3, period: 1 }, player: { look: { accessory: 'none', accColor: '#111111', top: 'hoodie', topColor: '#222222', hairStyle: 'bob' } }, souvenirs: ids.map((id) => ({ kind: mallItem(id).souvenir, npcId: null, itemId: id })) });

test('every mall item has a thing definition with at least one action', () => {
  const items = MALL_SHOPS.flatMap((s) => s.items.map((i) => i.id));
  assert.deepEqual([...items].sort(), [...THING_IDS].sort());
  for (const id of THING_IDS) assert.ok(THINGS[id].actions.length > 0 && THINGS[id].notice.en && THINGS[id].notice.ja, id);
});

test('ownership is the real shelf; old saves gain an empty things state idempotently', () => {
  const save = saveWith('robot', 'ball');
  assert.ok(owns(save, 'robot') && owns(save, 'ball') && !owns(save, 'cap'));
  assert.deepEqual(ownedThings(save).map((t) => t.id), ['ball', 'robot'].sort((a, b) => THING_IDS.indexOf(a) - THING_IDS.indexOf(b)));
  const old = { player: {}, time: { day: 0, period: 0 } };
  migrateSave(old);
  const once = structuredClone(old.things);
  migrateSave(old);
  assert.deepEqual(old.things, once);
  assert.deepEqual(old.things, { worn: {}, orig: {}, drawings: [], noticed: {}, noticeDay: {} });
});

test('wearing and taking off restores exactly the look the player made', () => {
  const save = saveWith('cap', 'shirt');
  const before = structuredClone(save.player.look);
  assert.equal(setWorn(save, 'cap', true).accessory, 'cap');
  assert.ok(isWorn(save, 'cap'));
  setWorn(save, 'shirt', true);
  assert.equal(save.player.look.top, 'tshirt');
  assert.equal(setWorn(save, 'cap', true).accessory, 'cap', 'wearing twice is harmless');
  setWorn(save, 'cap', false);
  setWorn(save, 'shirt', false);
  assert.deepEqual(save.player.look, before);
  assert.equal(setWorn(saveWith(), 'cap', true), null, 'not owned: nothing to wear');
  assert.equal(setWorn(save, 'robot', true), null, 'a robot is not clothing');
  setWorn(save, 'cap', true);
  forgetWorn(save);
  assert.ok(!isWorn(save, 'cap'), 'a new mirror look makes the cap part of the base look');
  // A worn item that is no longer owned is dropped by the state check.
  const lost = saveWith('cap');
  setWorn(lost, 'cap', true);
  lost.souvenirs = [];
  assert.ok(!isWorn(lost, 'cap'));
});

test('the games answer counts the TV game and a real board game', () => {
  assert.equal(gamesCount(saveWith()), 1);
  assert.equal(gamesCount(saveWith('board_game', 'robot')), 2);
});

test('drawings are small data records, newest first, capped', () => {
  const save = saveWith('pencils');
  for (let i = 0; i < 9; i++) addDrawing(save, { subject: { en: `thing ${i}`, emoji: '🌷' }, color: '#FF6B6B', day: i });
  assert.equal(thingsState(save).drawings.length, 6);
  assert.equal(latestDrawing(save).subject.en, 'thing 8');
  assert.ok(JSON.stringify(save.things).length < 2000);
});

test('friends notice only what the save holds, once per item and once a day', () => {
  const gamer = { id: 'g1', likes: ['games', 'music', 'cooking'] };
  const reader = { id: 'r1', likes: ['reading', 'animals', 'music'] };
  const none = saveWith();
  for (const place of ['home', 'park', 'town']) assert.equal(noticeFor(none, gamer, { place, day: 3 }), null, `nothing owned → nothing noticed (${place})`);
  const save = saveWith('robot', 'book', 'ball', 'cap');
  assert.equal(noticeFor(save, gamer, { place: 'town', day: 3 }), null, 'a robot at home is not visible in town');
  const home = noticeFor(save, gamer, { place: 'home', day: 3 });
  assert.equal(home.id, 'robot');
  assert.match(home.en, /robot/);
  assert.equal(noticeFor(save, reader, { place: 'home', day: 3 }).id, 'book');
  markNoticed(save, gamer.id, 'robot', 3);
  assert.equal(noticeFor(save, gamer, { place: 'home', day: 3 }), null, 'one comment a day');
  assert.notEqual(noticeFor(save, gamer, { place: 'home', day: 4 })?.id, 'robot', 'never the same item twice');
  setWorn(save, 'cap', true);
  assert.equal(noticeFor(save, { id: 'any', likes: ['cooking'] }, { place: 'town', day: 3 }).id, 'cap', 'anyone can notice a worn cap');
  const fan = { id: 's1', likes: ['soccer', 'music', 'games'] };
  assert.equal(noticeFor(saveWith('ball'), fan, { place: 'park', day: 3 }).id, 'ball', 'a soccer fan sees the ball in the park');
  assert.equal(noticeFor(saveWith('ball'), fan, { place: 'town', day: 3 }), null);
});

test('home-visit choices come from real things; the friend\'s wish follows their interests', () => {
  const plain = visitChoices(saveWith(), { id: 'x', likes: ['cooking', 'sweets', 'music'] });
  assert.deepEqual([...plain].sort(), ['race', 'souvenirs'], 'without things: the TV race and the shelf');
  const save = saveWith('board_game', 'robot', 'comic', 'pencils', 'kendama');
  const reader = visitChoices(save, { id: 'r', likes: ['comics', 'music', 'animals'] });
  const artist = visitChoices(save, { id: 'a', likes: ['drawing', 'music', 'sweets'] });
  assert.equal(artist[0], 'draw');
  assert.ok(['read', 'pairs'].includes(reader[0]));
  assert.notEqual(reader[0], artist[0], 'different friends want different things');
  for (const list of [reader, artist]) {
    assert.ok(list.length <= 4 && list.includes('souvenirs'));
    for (const id of list) assert.ok(VISIT_PLAYS[id]);
  }
  assert.deepEqual(visitChoices(save, { id: 'a', likes: ['drawing', 'music', 'sweets'] }), artist, 'the same friend is consistent');
  assert.ok(!visitChoices(saveWith('robot'), { id: 'b', likes: ['drawing'] }).includes('draw'), 'no pencils, no drawing');
});

test('NPC skill is seeded, interest-shaped and never unbeatable', () => {
  const musician = { id: 'm1', likes: ['music', 'piano', 'singing'] };
  const cook = { id: 'm1', likes: ['cooking', 'sweets', 'bugs'] };
  for (const kind of ['rhythm', 'racing', 'pairs', 'kendama']) {
    for (const npc of [musician, cook, null]) {
      const s = npcSkill(npc, kind);
      assert.ok(s >= 0.35 && s <= 0.8, `${kind} ${s}`);
      assert.equal(npcSkill(npc, kind), s);
    }
  }
  assert.ok(npcSkill(musician, 'rhythm') > npcSkill(cook, 'rhythm'), 'a music fan is better at rhythm');
  assert.ok(goodAt(musician, 'rhythm'));
});

test('robot paths reach every star and respect boxes', () => {
  for (const lv of ROBOT_LEVELS) {
    const path = robotPath(lv, lv.start, lv.star);
    assert.ok(path && path.length > 0);
    let p = { ...lv.start };
    const D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const step of path) {
      if (step.id === 'left') p.d = (p.d + 3) % 4;
      else if (step.id === 'right') p.d = (p.d + 1) % 4;
      else for (let i = 0; i < step.n; i++) {
        p = { ...p, x: p.x + D[p.d][0], y: p.y + D[p.d][1] };
        assert.ok(!lv.blocks.some((b) => b.x === p.x && b.y === p.y) && p.x >= 0 && p.y >= 0 && p.x < 5 && p.y < 5, 'never through a box or wall');
      }
    }
    assert.deepEqual({ x: p.x, y: p.y }, lv.star);
  }
});

test('Picture Pairs deals six real pairs and the friend plays sensibly', () => {
  const deck = pairsDeck('seed-1');
  assert.equal(deck.length, 12);
  for (const id of new Set(deck)) assert.equal(deck.filter((x) => x === id).length, 2);
  assert.deepEqual(pairsDeck('seed-1'), deck, 'seeded');
  for (const id of deck) assert.ok(PAIR_WORDS.find((w) => w.id === id));
  const i = deck.indexOf(deck[0], 1);
  const memory = new Map([[0, deck[0]], [i, deck[0]]]);
  assert.deepEqual(pairsMove(deck, new Map(), memory, () => 0.3).sort((a, b) => a - b), [0, i].sort((a, b) => a - b), 'a remembered pair is taken');
  const matched = new Map(deck.map((_, k) => [k, 'me']));
  matched.delete(0); matched.delete(i);
  const last = pairsMove(deck, matched, new Map(), () => 0.5);
  assert.deepEqual(last.sort((a, b) => a - b), [0, i].sort((a, b) => a - b), 'the last two cards are always picked');
  for (let r = 0; r < 20; r++) { const [a, b] = pairsMove(deck, new Map(), new Map(), Math.random); assert.notEqual(a, b); }
});

test('stories are short, four pages, with Japanese hints', () => {
  for (const s of Object.values(STORIES)) {
    assert.equal(s.pages.length, 4);
    for (const p of s.pages) { assert.ok(p.en.split(' ').length <= 9, p.en); assert.ok(p.ja && p.pic); }
  }
});

test('expression freshness favours what the student has said least, without gates', async () => {
  const { exprFreshness, logExpr } = await import('./progression.js');
  const save = {};
  assert.equal(exprFreshness(save, 'q.have'), 1);
  for (let i = 0; i < 3; i++) logExpr(save, { id: 'q.have', area: 'possessions', template: 'Do you have ___?' }, 'said', 1);
  assert.equal(exprFreshness(save, 'q.have'), 0.5);
  for (let i = 0; i < 9; i++) logExpr(save, { id: 'q.have', area: 'possessions' }, 'said', 1);
  assert.equal(exprFreshness(save, 'q.have'), 0, 'well practised, still allowed (never negative)');
  logExpr(save, { id: 'q.likes', area: 'selfintro' }, 'heard', 1);
  assert.equal(exprFreshness(save, 'q.likes'), 1, 'hearing is not saying');
  assert.equal(exprFreshness(save, null), 0);
});
