// Fictional sample class used for testing and demos. `pin` lets the sample
// reproduce the brief's first-day story (Ken introduces Yuki, who likes
// soccer and can run fast). Teacher-entered rosters never carry pins.

export const DEFAULT_ROSTER = [
  { name: 'Ken', pronoun: 'he', pin: { likes: ['games', 'baseball'], firstFriend: true } },
  { name: 'Yuki', pronoun: 'she', pin: { likes: ['soccer', 'music'], cans: ['run_fast'], friends: ['Ken'], intro: true } },
  { name: 'Haru', pronoun: 'he', pin: { likes: ['drawing'] } },
  { name: 'Mei', pronoun: 'she', pin: { likes: ['sweets'] } },
  { name: 'Sota', pronoun: 'he' },
  { name: 'Aoi', pronoun: 'she' },
  { name: 'Riku', pronoun: 'he' },
  { name: 'Hana', pronoun: 'she' },
  { name: 'Daiki', pronoun: 'he' },
  { name: 'Sakura', pronoun: 'she' },
  { name: 'Kaito', pronoun: 'he' },
  { name: 'Mio', pronoun: 'she' },
];

export const DEFAULT_ROSTER_TEXT = DEFAULT_ROSTER.map((e) => `${e.name}, ${e.pronoun}`).join('\n');
