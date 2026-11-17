import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildClass } from './generator.js';
import { DEFAULT_ROSTER } from '../data/roster.js';
import { INTERESTS } from '../data/content.js';
import { TEMPLATE_IDS } from '../data/events.js';
import { STYLES, STYLE_IDS, INITIATIVE_TOTAL, assignStyles, styleOf, preferredLikes, fill, styleLine } from './personality.js';

const styles = (npcs) => Object.fromEntries(npcs.map((n) => [n.id, n.style]));
const NAMES = 'Aoi Haruto Yui Sota Hina Riku Mio Yuto Rin Kaito Mei Sora Hana Daiki Saki Ren Nana Itsuki Koharu Minato Ema Hayato Rina Takumi Yua Kenta Airi Shota Miyu Ryo Noa Kosei Riko Asahi Hikari Taiga Mana Haru Nozomi Gaku'.split(' ');

test('every fresh class gets a balanced spread of styles', () => {
  const npcs = buildClass(DEFAULT_ROSTER, 'style-seed');
  const counts = {};
  for (const n of npcs) { assert.ok(STYLE_IDS.includes(n.style), `${n.id} has a style`); counts[n.style] = (counts[n.style] || 0) + 1; }
  assert.ok(Object.keys(counts).length >= 5, 'a 12-NPC class shows at least 5 styles');
  assert.ok(Math.max(...Object.values(counts)) <= Math.ceil(npcs.length / 6) + 1);
  for (const size of [6, 9, 25, 30]) {
    const roster = NAMES.slice(0, size).map((name) => ({ name, pronoun: 'name' }));
    const c = {};
    for (const n of buildClass(roster, `size-${size}`)) c[n.style] = (c[n.style] || 0) + 1;
    assert.ok(Math.max(...Object.values(c)) <= Math.ceil(size / 6) + 1, `class of ${size} stays balanced`);
  }
});

test('styles are stable: re-running is a no-op and roster edits keep everyone else', () => {
  const seed = 'stable-seed';
  const a = buildClass(DEFAULT_ROSTER, seed);
  const before = styles(a);
  assignStyles(a, seed);
  assert.deepEqual(styles(a), before);
  // Teacher removes two names and adds two new ones.
  const edited = [...DEFAULT_ROSTER.slice(2), { name: 'Emma', pronoun: 'she' }, { name: 'Noah', pronoun: 'name' }];
  const b = buildClass(edited, seed, { npcs: a });
  for (const n of b) if (before[n.id]) assert.equal(n.style, before[n.id], `${n.id} keeps its style after a roster edit`);
  assert.ok(STYLE_IDS.includes(b.find((n) => n.id === 'emma').style));
});

test('a pronoun change or a new look never changes the style', () => {
  const seed = 'look-seed';
  const a = buildClass(DEFAULT_ROSTER, seed);
  const changed = DEFAULT_ROSTER.map((e) => (e.name === 'Ken' ? { ...e, pronoun: 'name', lookSeed: 3 } : e.name === 'Hana' ? { ...e, lookSeed: 1 } : e));
  const b = buildClass(changed, seed, { npcs: a });
  assert.deepEqual(styles(b), styles(a));
  assert.notDeepEqual(b.find((n) => n.id === 'ken').look, a.find((n) => n.id === 'ken').look);
});

test('styles come from the class seed and id, never from the name text or traits', () => {
  const roster = NAMES.map((name) => ({ name, pronoun: 'name' }));
  const s1 = styles(buildClass(roster, 'seed-one'));
  const s2 = styles(buildClass(roster, 'seed-two'));
  const same = Object.keys(s1).filter((id) => s1[id] === s2[id]).length;
  assert.ok(same < Object.keys(s1).length * 0.6, `the same names get different styles in another class (${same}/40 equal)`);
  // Identical ids with different names, pronouns, looks or likes → same style.
  const mk = (over) => [{ id: 'a1', name: 'Ken', pronoun: 'he', likes: ['soccer'], ...over }, { id: 'b2', name: 'Yuki', pronoun: 'she', likes: ['music'] }];
  const x = assignStyles(mk({}), 'k');
  const y = assignStyles(mk({ name: 'Zed', pronoun: 'she', likes: ['reading'], look: { hairStyle: 'bob' } }), 'k');
  assert.equal(x[0].style, y[0].style);
});

test('style data is complete, valid and fair', () => {
  const src = fs.readFileSync(new URL('../engine/character.js', import.meta.url), 'utf8');
  const gestures = new Set([...src.matchAll(/case '([a-z]+)'/g)].map((m) => m[1]));
  const interests = new Set(INTERESTS.map((i) => i.id));
  const banks = ['tails', 'invitePre', 'inviteYes', 'declineOk', 'cheer', 'encourage', 'celebrate', 'thanks', 'hello', 'approach'];
  assert.deepEqual(Object.keys(STYLES).sort(), [...STYLE_IDS].sort());
  for (const st of Object.values(STYLES)) {
    for (const b of ['acq', 'friend', 'close']) assert.ok(st.greet[b].length >= 3, `${st.id} greet.${b} has 3+ lines`);
    const lines = [...st.greet.acq, ...st.greet.friend, ...st.greet.close, ...banks.flatMap((b) => st[b])];
    for (const b of banks) assert.ok(st[b].length >= 2, `${st.id}.${b} has 2+ lines`);
    for (const l of lines) {
      assert.ok(l.en && l.ja, `${st.id}: every line has en and ja (${l.en})`);
      if (l.en.includes('{name}')) assert.ok(l.ja.includes('{name}'), `${st.id}: ja keeps {name} (${l.en})`);
      assert.doesNotMatch(l.en, /\b(smart|popular|famous|cute|strong|talented|love you|date)\b/i);
    }
    for (const g of Object.values(st.gestures)) assert.ok(gestures.has(g), `${st.id} gesture ${g} exists`);
    for (const id of st.affinity) assert.ok(interests.has(id), `${st.id} affinity ${id} is an interest`);
    assert.deepEqual(Object.keys(st.events).sort(), [...TEMPLATE_IDS].sort(), `${st.id} weights every template`);
    assert.ok(Math.abs(st.initiative.approach + st.initiative.message - INITIATIVE_TOTAL) < 1e-9, `${st.id} initiative sums to the shared total`);
  }
});

test('style helpers fill placeholders and reorder only the NPC own likes', () => {
  const npc = { id: 'x', style: 'creative', likes: ['soccer', 'drawing', 'bugs'] };
  assert.deepEqual([...preferredLikes(npc)].sort(), [...npc.likes].sort());
  assert.equal(preferredLikes(npc)[0], 'drawing');
  assert.deepEqual(fill({ en: '{hi}, {name}!', ja: '{hija}、{name}！' }, { name: 'Rio', period: 0 }), { en: 'Good morning, Rio!', ja: 'おはよう、Rio！' });
  const l = styleLine(npc, 'greet.close', { rng: () => 0, name: 'Rio' });
  assert.ok(l.en.includes('Rio') && !l.en.includes('{'));
  assert.equal(styleOf({ id: 'y' }), styleOf({ id: 'y' }));
});
