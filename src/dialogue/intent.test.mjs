import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matchOptions, PHRASES, YES_KEYS, NO_KEYS } from './intent.js';

const foods = ['hamburger', 'pizza', 'pancakes', 'curry'].map((id) => ({
  id, phrases: [`I want to eat ${id}`, `${id} please`], keys: [[id]],
}));

test('normalize expands contractions, numbers and times', () => {
  assert.equal(normalize("It's 7:30!"), 'it is seven thirty');
  assert.equal(normalize('My birthday is May 10th.'), 'my birthday is may tenth');
  assert.equal(normalize("Let's go"), 'lets go');
  assert.equal(normalize('7:00'), 'seven oclock');
});

test('food keys win regardless of grammar', () => {
  assert.equal(matchOptions(['I want a hamburger'], foods)?.option.id, 'hamburger');
  assert.equal(matchOptions(['hamburger please'], foods)?.option.id, 'hamburger');
  assert.equal(matchOptions(['I want to eat pizza'], foods)?.option.id, 'pizza');
  assert.equal(matchOptions(['um pan cakes'], foods)?.option.id, 'pancakes');
  assert.equal(matchOptions(['I want hanbaga'], foods)?.option.id, 'hamburger');
});

test('unrelated speech does not match', () => {
  assert.equal(matchOptions(['the weather is nice'], foods), null);
  assert.equal(matchOptions([''], foods), null);
});

test('yes / no', () => {
  const opts = [
    { id: 'yes', phrases: PHRASES.yes, keys: YES_KEYS },
    { id: 'no', phrases: PHRASES.no, keys: NO_KEYS },
  ];
  assert.equal(matchOptions(['yes I can'], opts)?.option.id, 'yes');
  assert.equal(matchOptions(['yeah'], opts)?.option.id, 'yes');
  assert.equal(matchOptions(['no I can not'], opts)?.option.id, 'no');
  assert.equal(matchOptions(["no I don't"], opts)?.option.id, 'no');
});

test('phrase similarity picks greetings and byes', () => {
  const opts = [
    { id: 'nice', phrases: PHRASES.niceToMeet },
    { id: 'bye', phrases: PHRASES.bye },
  ];
  assert.equal(matchOptions(['nice to meet you too'], opts)?.option.id, 'nice');
  assert.equal(matchOptions(['nice to meat you'], opts)?.option.id, 'nice');
  assert.equal(matchOptions(['see you later'], opts)?.option.id, 'bye');
});

test('accented "like" still matches the interest', () => {
  const opts = ['soccer', 'music', 'drawing'].map((id) => ({ id, phrases: [`I like ${id}`], keys: [[id]] }));
  assert.equal(matchOptions(['I lick soccer'], opts)?.option.id, 'soccer');
  assert.equal(matchOptions(['I like sakka'], opts)?.option.id, 'soccer');
  assert.equal(matchOptions(['music and drawing'], opts)?.option.id, 'music');
});

test('prepositions distinguish under vs on', () => {
  const opts = ['in', 'on', 'under', 'by'].map((p) => ({ id: p, phrases: [`it is ${p} the bench`], keys: [[p]] }));
  assert.equal(matchOptions(["it's under the bench"], opts)?.option.id, 'under');
  assert.equal(matchOptions(['on the bench'], opts)?.option.id, 'on');
});
