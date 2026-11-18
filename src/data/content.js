// Vocabulary and world content. English is the game language; `ja` strings are
// optional hints written for Grade 5 readers (mostly hiragana/katakana plus
// kanji learned by grade 4).

export const DAYS = [
  { id: 0, en: 'Monday', plural: 'Mondays', short: 'Mon', ja: '月曜日', jaShort: '月', color: '#4C6FFF' },
  { id: 1, en: 'Tuesday', plural: 'Tuesdays', short: 'Tue', ja: '火曜日', jaShort: '火', color: '#FF5A5F' },
  { id: 2, en: 'Wednesday', plural: 'Wednesdays', short: 'Wed', ja: '水曜日', jaShort: '水', color: '#1FB5A8' },
  { id: 3, en: 'Thursday', plural: 'Thursdays', short: 'Thu', ja: '木曜日', jaShort: '木', color: '#3BB273' },
  { id: 4, en: 'Friday', plural: 'Fridays', short: 'Fri', ja: '金曜日', jaShort: '金', color: '#F4A300' },
  { id: 5, en: 'Saturday', plural: 'Saturdays', short: 'Sat', ja: '土曜日', jaShort: '土', color: '#2B8CFF' },
  { id: 6, en: 'Sunday', plural: 'Sundays', short: 'Sun', ja: '日曜日', jaShort: '日', color: '#F2548A' },
];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function dateText(m, d) { return `${MONTHS[m - 1]} ${ordinal(d)}`; }
export function dateJa(m, d) { return `${m}月${d}日`; }

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];

export function numberWord(n) {
  if (n < 20) return ONES[n];
  if (n < 60) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return String(n);
}

/** "seven o'clock", "six thirty", "three forty-five" */
export function timeWords(h, m) {
  const hh = ((h + 11) % 12) + 1;
  if (m === 0) return `${numberWord(hh)} o'clock`;
  if (m < 10) return `${numberWord(hh)} oh ${numberWord(m)}`;
  return `${numberWord(hh)} ${numberWord(m)}`;
}
export function timeDigits(h, m) { const hh = ((h + 11) % 12) + 1; return `${hh}:${String(m).padStart(2, '0')}`; }
export function timeJa(h, m) { const hh = ((h + 11) % 12) + 1; return m === 0 ? `${hh}時` : m === 30 ? `${hh}時半` : `${hh}時${m}分`; }

// ---------------------------------------------------------------------------
// Interests ("I like ___.") with the weekly activity they turn into.
// places: where an NPC does it. activity: playable shared activity id.

export const INTERESTS = [
  { id: 'soccer', en: 'soccer', ja: 'サッカー', emoji: '⚽', verb: 'play soccer', jaDo: 'サッカーをします', jaWant: 'サッカーをしたい', places: ['park'], activity: 'soccer', cans: ['run_fast', 'kick_far'], sport: true },
  { id: 'baseball', en: 'baseball', ja: '野球', emoji: '⚾', verb: 'play baseball', jaDo: '野球をします', jaWant: '野球をしたい', places: ['park'], activity: 'catch', cans: ['catch_well', 'throw_far'], sport: true },
  { id: 'dodgeball', en: 'dodgeball', ja: 'ドッジボール', emoji: '🔴', verb: 'play dodgeball', jaDo: 'ドッジボールをします', jaWant: 'ドッジボールをしたい', places: ['park'], activity: 'catch', cans: ['catch_well', 'run_fast'], sport: true },
  { id: 'basketball', en: 'basketball', ja: 'バスケットボール', emoji: '🏀', verb: 'play basketball', jaDo: 'バスケットボールをします', jaWant: 'バスケをしたい', places: ['park'], activity: 'catch', cans: ['jump_high'], sport: true },
  { id: 'swimming', en: 'swimming', ja: '水泳', emoji: '🏊', verb: 'go swimming', jaDo: '泳ぎに行きます', jaWant: '泳ぎに行きたい', places: ['away'], activity: null, cans: ['swim_fast'], sport: true },
  { id: 'running', en: 'running', ja: 'ランニング', emoji: '🏃', verb: 'jog in the park', jaDo: '公園でジョギングをします', jaWant: 'ジョギングしたい', places: ['park'], activity: null, cans: ['run_fast'], sport: true },
  { id: 'music', en: 'music', ja: '音楽', emoji: '🎵', verb: 'listen to music', jaDo: '音楽を聞きます', jaWant: '音楽を聞きたい', places: ['house', 'cafe'], activity: null, cans: ['sing_well', 'play_recorder', 'play_guitar'] },
  { id: 'singing', en: 'singing', ja: '歌うこと', emoji: '🎤', verb: 'sing songs', jaDo: '歌を歌います', jaWant: '歌いたい', places: ['house', 'park'], activity: null, cans: ['sing_well'] },
  { id: 'piano', en: 'the piano', ja: 'ピアノ', emoji: '🎹', verb: 'practice the piano', jaDo: 'ピアノの練習をします', jaWant: 'ピアノをひきたい', places: ['house'], activity: null, cans: ['play_piano'] },
  { id: 'dancing', en: 'dancing', ja: 'ダンス', emoji: '💃', verb: 'dance in the park', jaDo: '公園でダンスをします', jaWant: 'おどりたい', places: ['park'], activity: null, cans: ['dance_well'] },
  { id: 'drawing', en: 'drawing', ja: '絵をかくこと', emoji: '🎨', verb: 'draw pictures', jaDo: '絵をかきます', jaWant: '絵をかきたい', places: ['park', 'cafe', 'house'], activity: null, cans: ['draw_well'] },
  { id: 'reading', en: 'reading', ja: '読書', emoji: '📚', verb: 'read books', jaDo: '本を読みます', jaWant: '本を読みたい', places: ['cafe', 'house'], activity: null, cans: ['speak_english'] },
  { id: 'games', en: 'video games', ja: 'テレビゲーム', emoji: '🎮', verb: 'play video games', jaDo: 'テレビゲームをします', jaWant: 'ゲームをしたい', places: ['house', 'mall'], activity: null, cans: ['play_kendama'] },
  { id: 'cooking', en: 'cooking', ja: '料理', emoji: '🍳', verb: 'cook at home', jaDo: '家で料理をします', jaWant: '料理をしたい', places: ['house'], activity: null, cans: ['cook_curry', 'make_pancakes'] },
  { id: 'sweets', en: 'sweets', ja: 'あまいもの', emoji: '🍰', verb: 'eat cake at the café', jaDo: 'カフェでケーキを食べます', jaWant: 'ケーキを食べたい', places: ['cafe'], activity: 'cafe', cans: ['bake_cookies'] },
  { id: 'animals', en: 'animals', ja: '動物', emoji: '🐶', verb: 'feed the fish in the park', jaDo: '公園で魚にえさをあげます', jaWant: '動物を見たい', places: ['park'], activity: null, cans: ['climb_trees'] },
  { id: 'bugs', en: 'bugs', ja: '虫', emoji: '🐞', verb: 'catch bugs in the park', jaDo: '公園で虫をとります', jaWant: '虫をとりたい', places: ['park'], activity: null, cans: ['climb_trees'] },
  { id: 'shopping', en: 'shopping', ja: '買い物', emoji: '🛍️', verb: 'go shopping', jaDo: '買い物に行きます', jaWant: '買い物に行きたい', places: ['mall'], activity: null, cans: [] },
  { id: 'skateboarding', en: 'skateboarding', ja: 'スケートボード', emoji: '🛹', verb: 'skateboard in the park', jaDo: '公園でスケートボードをします', jaWant: 'スケボーをしたい', places: ['park'], activity: null, cans: ['skateboard'] },
  { id: 'comics', en: 'comics', ja: 'まんが', emoji: '📖', verb: 'read comics', jaDo: 'まんがを読みます', jaWant: 'まんがを読みたい', places: ['house', 'cafe'], activity: null, cans: ['draw_well'] },
  { id: 'cycling', en: 'cycling', ja: 'サイクリング', emoji: '🚲', verb: 'ride my bike', jaDo: '自転車に乗ります', jaWant: '自転車に乗りたい', places: ['town'], activity: null, cans: ['ride_unicycle'] },
];

export const ABILITIES = [
  { id: 'run_fast', en: 'run fast', ja: '速く走れます', emoji: '🏃' },
  { id: 'kick_far', en: 'kick a ball far', ja: 'ボールを遠くまでけれます', emoji: '⚽' },
  { id: 'catch_well', en: 'catch a ball well', ja: 'ボールをじょうずにキャッチできます', emoji: '🧤' },
  { id: 'throw_far', en: 'throw a ball far', ja: 'ボールを遠くまで投げられます', emoji: '⚾' },
  { id: 'jump_high', en: 'jump high', ja: '高くジャンプできます', emoji: '🐸' },
  { id: 'swim_fast', en: 'swim fast', ja: '速く泳げます', emoji: '🏊' },
  { id: 'sing_well', en: 'sing well', ja: 'じょうずに歌えます', emoji: '🎤' },
  { id: 'play_recorder', en: 'play the recorder', ja: 'リコーダーがふけます', emoji: '🎶' },
  { id: 'play_piano', en: 'play the piano well', ja: 'ピアノがじょうずにひけます', emoji: '🎹' },
  { id: 'play_guitar', en: 'play the guitar', ja: 'ギターがひけます', emoji: '🎸' },
  { id: 'dance_well', en: 'dance well', ja: 'じょうずにおどれます', emoji: '💃' },
  { id: 'draw_well', en: 'draw well', ja: '絵がじょうずにかけます', emoji: '🎨' },
  { id: 'cook_curry', en: 'cook curry', ja: 'カレーが作れます', emoji: '🍛' },
  { id: 'make_pancakes', en: 'make pancakes', ja: 'パンケーキが作れます', emoji: '🥞' },
  { id: 'bake_cookies', en: 'bake cookies', ja: 'クッキーが焼けます', emoji: '🍪' },
  { id: 'climb_trees', en: 'climb trees', ja: '木にのぼれます', emoji: '🌳' },
  { id: 'skateboard', en: 'skateboard', ja: 'スケートボードができます', emoji: '🛹' },
  { id: 'ski', en: 'ski', ja: 'スキーができます', emoji: '⛷️' },
  { id: 'ride_unicycle', en: 'ride a unicycle', ja: '一輪車に乗れます', emoji: '🎡' },
  { id: 'jump_rope', en: 'jump rope well', ja: 'なわとびがじょうずにできます', emoji: '🪢' },
  { id: 'fly_kite', en: 'fly a kite', ja: 'たこをあげられます', emoji: '🪁' },
  { id: 'speak_english', en: 'speak English', ja: '英語が話せます', emoji: '🗣️' },
  { id: 'play_kendama', en: 'play kendama', ja: 'けん玉ができます', emoji: '🎯' },
];

// "He is good at ___." for each ability (Grade-5 introductions).
export const GOOD_AT = {
  run_fast: { en: 'running', ja: '走ること' },
  kick_far: { en: 'soccer', ja: 'サッカー' },
  catch_well: { en: 'catching', ja: 'キャッチ' },
  throw_far: { en: 'throwing', ja: '投げること' },
  jump_high: { en: 'jumping', ja: 'ジャンプ' },
  swim_fast: { en: 'swimming', ja: '水泳' },
  sing_well: { en: 'singing', ja: '歌' },
  play_recorder: { en: 'the recorder', ja: 'リコーダー' },
  play_piano: { en: 'the piano', ja: 'ピアノ' },
  play_guitar: { en: 'the guitar', ja: 'ギター' },
  dance_well: { en: 'dancing', ja: 'ダンス' },
  draw_well: { en: 'drawing', ja: '絵' },
  cook_curry: { en: 'cooking', ja: '料理' },
  make_pancakes: { en: 'cooking', ja: '料理' },
  bake_cookies: { en: 'baking', ja: 'おかし作り' },
  climb_trees: { en: 'climbing', ja: '木のぼり' },
  skateboard: { en: 'skateboarding', ja: 'スケボー' },
  ski: { en: 'skiing', ja: 'スキー' },
  ride_unicycle: { en: 'the unicycle', ja: '一輪車' },
  jump_rope: { en: 'jump rope', ja: 'なわとび' },
  fly_kite: { en: 'flying kites', ja: 'たこあげ' },
  speak_english: { en: 'English', ja: '英語' },
  play_kendama: { en: 'kendama', ja: 'けん玉' },
};

// Foods: `a` is the phrase used in "I want to eat ___." / "___, please."
// `general` is used in "Do you like ___?".
export const FOODS = [
  { id: 'hamburger', en: 'hamburger', a: 'a hamburger', general: 'hamburgers', ja: 'ハンバーガー', emoji: '🍔' },
  { id: 'pizza', en: 'pizza', a: 'pizza', general: 'pizza', ja: 'ピザ', emoji: '🍕' },
  { id: 'spaghetti', en: 'spaghetti', a: 'spaghetti', general: 'spaghetti', ja: 'スパゲッティ', emoji: '🍝' },
  { id: 'curry', en: 'curry and rice', a: 'curry and rice', general: 'curry and rice', ja: 'カレーライス', emoji: '🍛' },
  { id: 'pancakes', en: 'pancakes', a: 'pancakes', general: 'pancakes', ja: 'パンケーキ', emoji: '🥞' },
  { id: 'icecream', en: 'ice cream', a: 'ice cream', general: 'ice cream', ja: 'アイスクリーム', emoji: '🍨' },
  { id: 'cake', en: 'cake', a: 'cake', general: 'cake', ja: 'ケーキ', emoji: '🍰' },
  { id: 'sandwich', en: 'sandwich', a: 'a sandwich', general: 'sandwiches', ja: 'サンドイッチ', emoji: '🥪' },
  { id: 'omurice', en: 'omelet rice', a: 'omelet rice', general: 'omelet rice', ja: 'オムライス', emoji: '🍳' },
  { id: 'riceball', en: 'rice ball', a: 'a rice ball', general: 'rice balls', ja: 'おにぎり', emoji: '🍙' },
];

export const DRINKS = [
  { id: 'orange', en: 'orange juice', a: 'orange juice', ja: 'オレンジジュース', emoji: '🍊', color: '#FFA23A' },
  { id: 'apple', en: 'apple juice', a: 'apple juice', ja: 'りんごジュース', emoji: '🍎', color: '#F7D36B' },
  { id: 'milk', en: 'milk', a: 'milk', ja: '牛にゅう', emoji: '🥛', color: '#FFFFFF' },
  { id: 'tea', en: 'green tea', a: 'green tea', ja: '緑茶', emoji: '🍵', color: '#9BCB6C' },
  { id: 'cocoa', en: 'hot cocoa', a: 'hot cocoa', ja: 'ココア', emoji: '☕', color: '#8B5A3C' },
  { id: 'soda', en: 'soda', a: 'soda', ja: 'ソーダ', emoji: '🥤', color: '#8FD6F2' },
];

export const SUBJECTS = [
  { id: 'japanese', en: 'Japanese', ja: '国語', emoji: '📖' },
  { id: 'math', en: 'math', ja: '算数', emoji: '➗' },
  { id: 'science', en: 'science', ja: '理科', emoji: '🔬' },
  { id: 'social', en: 'social studies', ja: '社会', emoji: '🗾' },
  { id: 'english', en: 'English', ja: '英語', emoji: '🔤' },
  { id: 'music', en: 'music', ja: '音楽', emoji: '🎵' },
  { id: 'pe', en: 'P.E.', ja: '体育', emoji: '🤸' },
  { id: 'arts', en: 'arts and crafts', ja: '図工', emoji: '✂️' },
  { id: 'homeec', en: 'home economics', ja: '家庭科', emoji: '🧵' },
];

// Class 5-1 weekly timetable (Mon–Fri).
export const TIMETABLE = [
  ['japanese', 'math', 'science', 'english', 'pe'],
  ['math', 'japanese', 'social', 'music', 'arts'],
  ['science', 'math', 'english', 'japanese', 'pe'],
  ['japanese', 'social', 'math', 'homeec', 'music'],
  ['math', 'english', 'arts', 'science', 'japanese'],
];

export const PETS = [
  { id: 'dog', a: 'a dog', plural: 'dogs', ja: '犬', emoji: '🐶' },
  { id: 'cat', a: 'a cat', plural: 'cats', ja: 'ねこ', emoji: '🐱' },
  { id: 'rabbit', a: 'a rabbit', plural: 'rabbits', ja: 'うさぎ', emoji: '🐰' },
  { id: 'hamster', a: 'a hamster', plural: 'hamsters', ja: 'ハムスター', emoji: '🐹' },
  { id: 'fish', a: 'a fish', plural: 'fish', ja: '魚', emoji: '🐟' },
  { id: 'bird', a: 'a bird', plural: 'birds', ja: '鳥', emoji: '🐦' },
  { id: 'turtle', a: 'a turtle', plural: 'turtles', ja: 'カメ', emoji: '🐢' },
];

export function petPhrase(pet) {
  const p = PETS.find((x) => x.id === pet.type);
  if (!p) return '';
  return pet.count === 1 ? p.a : `${numberWord(pet.count)} ${p.plural}`;
}

// Positive adjectives that may describe roster NPCs. "smart", "popular" and
// "famous" are intentionally reserved for non-roster characters (see
// DESIGN_DECISIONS.md, classroom rules).
export const ADJECTIVES = [
  { id: 'kind', en: 'kind', ja: 'やさしい' },
  { id: 'friendly', en: 'friendly', ja: 'フレンドリー' },
  { id: 'funny', en: 'funny', ja: 'おもしろい' },
  { id: 'cool', en: 'cool', ja: 'かっこいい' },
  { id: 'active', en: 'active', ja: '元気いっぱい' },
  { id: 'brave', en: 'brave', ja: '勇気がある' },
];
export const RESERVED_ADJECTIVES = [
  { id: 'famous', en: 'famous', ja: '有名' },
  { id: 'popular', en: 'popular', ja: '人気がある' },
  { id: 'smart', en: 'smart', ja: 'かしこい' },
  { id: 'cute', en: 'cute', ja: 'かわいい' },
  { id: 'strong', en: 'strong', ja: '強い' },
  { id: 'talented', en: 'talented', ja: '才能がある' },
];

// "I want to go to Fukui. The museum is in Fukui. You can see dinosaurs there."
export const ATTRACTIONS = [
  { id: 'fukui', place: 'Fukui', placeJa: '福井', thing: 'The museum', thingJa: '博物館', can: 'see dinosaurs', canJa: '恐竜が見られます', emoji: '🦕' },
  { id: 'okinawa', place: 'Okinawa', placeJa: '沖縄', thing: 'The aquarium', thingJa: '水族館', can: 'see dolphins', canJa: 'イルカが見られます', emoji: '🐬' },
  { id: 'hokkaido', place: 'Hokkaido', placeJa: '北海道', thing: 'The zoo', thingJa: '動物園', can: 'see penguins', canJa: 'ペンギンが見られます', emoji: '🐧' },
  { id: 'nara', place: 'Nara', placeJa: '奈良', thing: 'The big park', thingJa: '大きな公園', can: 'see deer', canJa: 'シカが見られます', emoji: '🦌' },
  { id: 'kyoto', place: 'Kyoto', placeJa: '京都', thing: 'The golden temple', thingJa: '金色のお寺', can: 'see old temples', canJa: '古いお寺が見られます', emoji: '⛩️' },
  { id: 'nagano', place: 'Nagano', placeJa: '長野', thing: 'The ski park', thingJa: 'スキー場', can: 'ski', canJa: 'スキーができます', emoji: '⛷️' },
  { id: 'osaka', place: 'Osaka', placeJa: '大阪', thing: 'The castle', thingJa: 'お城', can: 'eat takoyaki', canJa: 'たこ焼きが食べられます', emoji: '🐙' },
  { id: 'tokyo', place: 'Tokyo', placeJa: '東京', thing: 'The tall tower', thingJa: '高いタワー', can: 'see the city', canJa: '町が見わたせます', emoji: '🗼' },
];

export const HOME_ACTS = [
  { id: 'read', verb: 'read books', jaDo: '本を読みます', emoji: '📚' },
  { id: 'games', verb: 'play video games', jaDo: 'テレビゲームをします', emoji: '🎮' },
  { id: 'tv', verb: 'watch TV', jaDo: 'テレビを見ます', emoji: '📺' },
  { id: 'help', verb: 'help my family', jaDo: '家の手伝いをします', emoji: '🧹' },
  { id: 'study', verb: 'study', jaDo: '勉強します', emoji: '✏️' },
  { id: 'homework', verb: 'do my homework', jaDo: '宿題をします', emoji: '📝' },
  { id: 'clean', verb: 'clean my room', jaDo: '部屋のそうじをします', emoji: '🧽' },
  { id: 'cook', verb: 'cook dinner', jaDo: '夕ごはんを作ります', emoji: '🍳' },
  { id: 'music', verb: 'listen to music', jaDo: '音楽を聞きます', emoji: '🎧' },
  { id: 'bake', verb: 'bake cookies', jaDo: 'クッキーを焼きます', emoji: '🍪' },
];

export const AWAY_ACTS = [
  { id: 'grandparents', verb: 'visit my grandparents', jaDo: 'おじいちゃん・おばあちゃんの家に行きます', emoji: '👵' },
  { id: 'library', verb: 'go to the library', jaDo: '図書館に行きます', emoji: '🏛️' },
  { id: 'pianolesson', verb: 'go to piano lessons', jaDo: 'ピアノ教室に行きます', emoji: '🎹' },
  { id: 'swim', verb: 'go swimming', jaDo: '泳ぎに行きます', emoji: '🏊' },
];

export const WEATHER = {
  sunny: { en: 'sunny', ja: '晴れ', emoji: '☀️' },
  cloudy: { en: 'cloudy', ja: 'くもり', emoji: '☁️' },
  rainy: { en: 'rainy', ja: '雨', emoji: '☔' },
};

export const LOST_ITEMS = [
  { id: 'cap', en: 'cap', ja: 'ぼうし', emoji: '🧢' },
  { id: 'ball', en: 'ball', ja: 'ボール', emoji: '⚽' },
  { id: 'bag', en: 'bag', ja: 'かばん', emoji: '👜' },
  { id: 'book', en: 'book', ja: '本', emoji: '📕' },
  { id: 'recorder', en: 'recorder', ja: 'リコーダー', emoji: '🎶' },
  { id: 'pencilcase', en: 'pencil case', ja: '筆箱', emoji: '✏️' },
];

export const PREPOSITIONS = {
  in: { en: 'in', ja: 'の中' },
  on: { en: 'on', ja: 'の上' },
  under: { en: 'under', ja: 'の下' },
  by: { en: 'by', ja: 'のそば' },
};

export const LANGUAGE_AREAS = {
  intro: { en: 'Introducing friends', ja: '友達のしょうかい', emoji: '🤝' },
  weekly: { en: 'My week', ja: '1週間のこと', emoji: '📅' },
  time: { en: 'Time', ja: '時こく', emoji: '⏰' },
  selfintro: { en: 'About me', ja: '自己しょうかい', emoji: '🙋' },
  subjects: { en: 'School subjects', ja: '教科', emoji: '📚' },
  possessions: { en: 'Things I have', ja: '持っているもの', emoji: '🎒' },
  adjectives: { en: 'Describing people', ja: '人のようす', emoji: '😊' },
  verbs: { en: 'Action words', ja: '動作のことば', emoji: '🏃' },
  prepositions: { en: 'Where is it?', ja: 'どこにある？', emoji: '📦' },
  places: { en: 'Places to visit', ja: '行きたい場所', emoji: '🗾' },
  directions: { en: 'Directions', ja: '道案内', emoji: '🧭' },
  weather: { en: 'Weather', ja: '天気', emoji: '⛅' },
  food: { en: 'Food and ordering', ja: '食べ物と注文', emoji: '🍔' },
  wantto: { en: 'I want to ...', ja: '〜したい', emoji: '💭' },
};

export const LEVEL_NAMES = [
  { en: 'Stranger', ja: '知らない人' },
  { en: 'Acquaintance', ja: '顔見知り' },
  { en: 'Friend', ja: '友達' },
  { en: 'Good friend', ja: '仲よし' },
  { en: 'Close friend', ja: '大の仲よし' },
  { en: 'Best friend', ja: '親友' },
];

// NPC locations. `scene` is the 3D scene that shows them; null = off-screen.
export const LOCATIONS = {
  classroom: { en: 'Classroom 5-1', ja: '5年1組', the: 'the classroom', scene: 'classroom', emoji: '🏫' },
  musicroom: { en: 'Music Room', ja: '音楽室', the: 'the music room', scene: 'musicroom', emoji: '🎵' },
  gym: { en: 'Gym', ja: '体育館', the: 'the gym', scene: 'gym', emoji: '🏀' },
  artroom: { en: 'Art Room', ja: '図工室', the: 'the art room', scene: 'artroom', emoji: '🎨' },
  park: { en: 'Sakura Park', ja: 'さくら公園', the: 'the park', scene: 'town', zone: 'park', emoji: '🌸', outdoor: true },
  cafe: { en: 'Café Komorebi', ja: 'カフェ・こもれび', the: 'the café', scene: 'cafe', emoji: '☕' },
  town: { en: 'Sakura Town', ja: 'さくら町', the: 'town', scene: 'town', zone: 'street', emoji: '🏘️', outdoor: true },
  home: { en: 'My House', ja: '自分の家', the: 'my house', scene: 'home', emoji: '🏠' },
  friendhouse: { en: "Friend's House", ja: '友達の家', the: 'my house', scene: 'town', zone: 'street', emoji: '🏡' },
  house: { en: 'Home', ja: '家', the: 'home', scene: null, emoji: '🏠' },
  mall: { en: 'Niji Mall', ja: 'にじモール', the: 'the mall', scene: 'mall', emoji: '🛍️' },
  away: { en: 'Away', ja: 'おでかけ', the: 'away', scene: null, emoji: '🚌' },
};

// Player self-introduction pick lists.
export const PLAYER_LIKES = ['soccer', 'baseball', 'basketball', 'dodgeball', 'swimming', 'music', 'drawing', 'games', 'reading', 'dancing', 'animals', 'cooking', 'sweets', 'comics'];
export const PLAYER_CANS = ['run_fast', 'swim_fast', 'sing_well', 'dance_well', 'draw_well', 'play_piano', 'cook_curry', 'ride_unicycle', 'jump_rope', 'play_kendama', 'catch_well', 'speak_english'];

export const byId = (list, id) => list.find((x) => x.id === id);
export const interest = (id) => byId(INTERESTS, id);
export const ability = (id) => byId(ABILITIES, id);
export const food = (id) => byId(FOODS, id);
export const drink = (id) => byId(DRINKS, id);
export const subject = (id) => byId(SUBJECTS, id);
export const adjective = (id) => byId(ADJECTIVES, id) || byId(RESERVED_ADJECTIVES, id);
export const attraction = (id) => byId(ATTRACTIONS, id);

/** Days of the week (plural form) on which the class has a subject. */
export function subjectDays(subjectId) {
  const out = [];
  TIMETABLE.forEach((list, dow) => { if (list.includes(subjectId)) out.push(dow); });
  return out;
}

export function listEn(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function thirdPerson(verbPhrase) {
  // "play soccer" -> "plays soccer"; "go swimming" -> "goes swimming"
  const [v, ...rest] = verbPhrase.split(' ');
  let t;
  if (v === 'have') t = 'has';
  else if (v === 'be') t = 'is';
  else if (/(s|sh|ch|x|z|o)$/.test(v)) t = v + 'es';
  else if (/[^aeiou]y$/.test(v)) t = v.slice(0, -1) + 'ies';
  else t = v + 's';
  // Possessive "my" becomes "his/her/their" at the call site when needed.
  return [t, ...rest].join(' ');
}
// Authored adult visitors, independent of the teacher's roster.
export const VISITORS = [
  ['green', 'Ms. Green', 'Canada', 'カナダ', '#BFE3C0', 'bob', '#60402D', '#F9D3B2'],
  ['lopez', 'Mr. Lopez', 'Mexico', 'メキシコ', '#FFD166', 'short', '#302620', '#C58D65'],
  ['kim', 'Ms. Kim', 'Korea', '韓国', '#B8C8FF', 'long', '#25232B', '#EFC29C'],
  ['silva', 'Mr. Silva', 'Brazil', 'ブラジル', '#FFB7A5', 'short', '#382A23', '#A97250'],
].map(([id, name, country, countryJa, topColor, hairStyle, hairColor, skin]) => ({
  id: `visitor-${id}`, name, from: `I'm from ${country}.`, fromJa: `${countryJa}から来ました。`,
  role: 'Visitor 旅行の人', color: '#2F9E6E', voice: { pitch: 1, rate: 0.9 },
  look: { skin, hairStyle, hairColor, top: 'collar', topColor, bottom: 'pants', bottomColor: '#44506A', shoes: '#343A40', bag: '#72543B', accessory: 'none', accColor: '#44506A', eyes: 'round', height: 1 },
}));
