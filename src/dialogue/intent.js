// Intent matching for spoken answers. Pure logic: no DOM, no Web Speech.
//
// Carried over from esl-likes and not negotiable: a child who says the
// sentence well enough for a teacher to understand must be rewarded.
// Recognition noise is the game's problem, not the child's, so this matcher
// errs toward acceptance. Grammar is never required to be perfect: the
// meaningful part of the answer (the food, the day, "yes") decides.

const CONTRACTIONS = [
  [/\bi'm\b/g, 'i am'], [/\bit's\b/g, 'it is'], [/\bthat's\b/g, 'that is'], [/\bwhat's\b/g, 'what is'],
  [/\bhow's\b/g, 'how is'], [/\bhe's\b/g, 'he is'], [/\bshe's\b/g, 'she is'], [/\byou're\b/g, 'you are'],
  [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'], [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'],
  [/\bi'd\b/g, 'i would'], [/\bi'll\b/g, 'i will'], [/\blet's\b/g, 'lets'], [/\bo'clock\b/g, 'oclock'],
  [/\bwanna\b/g, 'want to'], [/\bgonna\b/g, 'going to'], [/\bgotta\b/g, 'got to'],
];

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
const ORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
  11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth',
  19: 'nineteenth', 20: 'twentieth', 30: 'thirtieth' };

function num(n) {
  if (n < 20) return ONES[n];
  if (n < 60) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return String(n);
}
function ord(n) {
  if (ORD[n]) return ORD[n];
  if (n > 20 && n < 32) return TENS[Math.floor(n / 10)] + ' ' + ORD[n % 10];
  return num(n);
}

export function normalize(text) {
  let s = String(text ?? '').normalize('NFKC').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘`]/g, "'");
  // 7:30 -> seven thirty, 7:00 -> seven oclock
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => (Number(m) === 0 ? `${num(Number(h))} oclock` : `${num(Number(h))} ${num(Number(m))}`));
  s = s.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, (_, n) => ord(Number(n)));
  s = s.replace(/\b\d{1,2}\b/g, (n) => num(Number(n)));
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  s = s.replace(/'/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

const FILLERS = new Set(['a', 'an', 'the', 'um', 'uh', 'uhm', 'umm', 'er', 'erm', 'ah', 'eh', 'hmm', 'mm', 'oh', 'well', 'so', 'just', 'very', 'really']);

export function tokens(text) { return normalize(text).split(' ').filter(Boolean); }
export function contentTokens(text) { return tokens(text).filter((t) => !FILLERS.has(t)); }

// Likely recognizer outputs for Japanese-accented classroom English.
// Extend from real classroom transcripts as they are observed.
const VARIANTS = {
  like: ['lick', 'light', 'rike', 'raiku', 'laiku', 'raik', 'laik', 'likes', 'liked'],
  soccer: ['sakka', 'sacca', 'socker', 'sucker', 'soccor', 'saka', 'sakkaa', 'sockers'],
  baseball: ['beisu', 'basebal', 'baseballs', 'bass ball'],
  basketball: ['basket', 'basketballs'],
  dodgeball: ['dodge ball', 'dodge', 'dojji'],
  swimming: ['swim', 'swimmin'],
  music: ['musics', 'myujikku', 'musik'],
  drawing: ['draw', 'drawings', 'drowing'],
  reading: ['read', 'leading', 'readings'],
  games: ['game', 'video game', 'video games', 'geimu'],
  cooking: ['cook'],
  sweets: ['sweet', 'suites', 'suite'],
  animals: ['animal', 'anime', 'animaru'],
  hamburger: ['hamburgers', 'hanbaga', 'hamburg', 'burger', 'burgers', 'hamberger', 'hamburga'],
  pizza: ['pizzas', 'piza', 'peter'],
  spaghetti: ['spagetti', 'supagetti', 'pasta'],
  curry: ['kare', 'carry', 'kari', 'curry rice', 'curry and rice'],
  pancakes: ['pancake', 'pankeki', 'pan cake', 'pan cakes'],
  icecream: ['ice cream', 'ice creams', 'aisu', 'icecream', 'ice'],
  cake: ['cakes', 'keki', 'kake'],
  sandwich: ['sandwiches', 'sando', 'sandoichi', 'sand which'],
  omurice: ['omelet rice', 'omelette rice', 'omu rice', 'omelet', 'omelette', 'omuraisu'],
  riceball: ['rice ball', 'rice balls', 'onigiri', 'riceballs', 'lice ball'],
  orange: ['orange juice', 'orenji'],
  apple: ['apple juice', 'appuru'],
  milk: ['miruku', 'mill', 'milks'],
  tea: ['green tea', 'tee', 'ocha'],
  cocoa: ['hot cocoa', 'coco', 'cocoa', 'kokoa', 'hot chocolate'],
  soda: ['sodas', 'soda pop', 'coke'],
  water: ['wata', 'waters'],
  sunny: ['sonny', 'sunnie', 'sun'],
  cloudy: ['clowdy', 'claudy', 'cloud', 'cloudie', 'crowdy'],
  rainy: ['rain', 'lainy', 'rainie', 'raining', 'reini'],
  yes: ['yeah', 'yep', 'yup', 'yea', 'yess', 'iyes', 'ies'],
  thank: ['thanks', 'sank', 'sankyu', 'sankyuu', 'tank', 'senkyu'],
  please: ['pleace', 'puriizu', 'pleas', 'plz'],
  nice: ['naisu', 'nise'],
  meet: ['meat', 'mit', 'miito'],
  under: ['anda', 'undah', 'andar'],
  by: ['buy', 'bye', 'bai'],
  on: ['own', 'om'],
  in: ['inn', 'een'],
  bench: ['benchi', 'bunch', 'banch'],
  table: ['teburu', 'tabel'],
  box: ['books', 'bokkusu', 'fox'],
  tree: ['three', 'tori', 'tsuri', 'trees'],
  catch: ['cache', 'kyatchi', 'cash', 'ketch'],
  left: ['refuto', 'reft', 'lift', 'laughed'],
  right: ['raito', 'write', 'rite'],
  straight: ['street', 'sutoreto', 'strait', 'straights', 'great'],
  stop: ['sutoppu', 'stopp', 'top', 'stab'],
};

const CANON = new Map();
for (const [canon, list] of Object.entries(VARIANTS)) {
  for (const v of list) if (!v.includes(' ')) CANON.set(v, canon);
}
const MULTI = [];
for (const [canon, list] of Object.entries(VARIANTS)) for (const v of list) if (v.includes(' ')) MULTI.push([v, canon]);
MULTI.sort((a, b) => b[0].length - a[0].length);

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function maxDist(len) { return len <= 4 ? 0 : len <= 6 ? 1 : 2; }

function canonical(tok) { return CANON.get(tok) || tok; }

/** Canonicalized token list (multi-word variants folded first). */
export function canonTokens(text) {
  let s = ' ' + normalize(text) + ' ';
  for (const [v, canon] of MULTI) s = s.split(` ${v} `).join(` ${canon} `);
  return s.trim().split(' ').filter(Boolean).filter((t) => !FILLERS.has(t)).map(canonical);
}

function tokEq(a, b) {
  if (a === b) return true;
  const ca = canonical(a), cb = canonical(b);
  if (ca === cb) return true;
  const len = Math.min(ca.length, cb.length);
  return levenshtein(ca, cb) <= maxDist(len);
}

/** Dice-style similarity between two token lists with fuzzy token equality. */
export function similarity(ta, tb) {
  if (!ta.length || !tb.length) return 0;
  const used = new Array(tb.length).fill(false);
  let hits = 0;
  for (const a of ta) {
    for (let j = 0; j < tb.length; j++) {
      if (!used[j] && tokEq(a, tb[j])) { used[j] = true; hits++; break; }
    }
  }
  return (2 * hits) / (ta.length + tb.length);
}

/** Does the transcript contain this key (single token or multi-word)? Returns index or -1. */
function keyIndex(tt, key) {
  const kt = canonTokens(key);
  if (!kt.length) return -1;
  for (let i = 0; i + kt.length <= tt.length; i++) {
    let ok = true;
    for (let j = 0; j < kt.length; j++) if (!tokEq(tt[i + j], kt[j])) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

/**
 * Match recognizer alternatives against answer options.
 * option: { id, phrases: string[], keys?: string[][] }  (every key group must hit)
 * Returns { option, score, transcript } or null when nothing is clear enough.
 */
export function matchOptions(alternatives, options) {
  let best = null;
  (alternatives || []).forEach((alt, ai) => {
    const tt = canonTokens(alt);
    if (!tt.length) return;
    const weight = 1 - ai * 0.03;
    const scored = options.map((o) => {
      const sim = Math.max(0, ...(o.phrases || []).map((p) => similarity(tt, canonTokens(p))));
      let keyHit = false;
      let firstAt = Infinity;
      if (o.keys && o.keys.length) {
        keyHit = o.keys.every((group) => {
          const idx = Math.min(...group.map((k) => { const i = keyIndex(tt, k); return i < 0 ? Infinity : i; }));
          if (idx < Infinity) firstAt = Math.min(firstAt, idx);
          return idx < Infinity;
        });
      }
      const score = keyHit ? 0.62 + 0.38 * sim : o.keys && o.keys.length ? sim * 0.55 : sim;
      return { o, score: score * weight, keyHit, firstAt, sim };
    }).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt);

    const hits = scored.filter((s) => s.keyHit);
    let pick = null;
    if (hits.length === 1) pick = hits[0];
    else if (hits.length > 1) {
      // Several key words heard ("soccer and baseball"): first mentioned wins
      // unless one phrase is clearly closer.
      hits.sort((a, b) => (Math.abs(a.sim - b.sim) > 0.2 ? b.sim - a.sim : a.firstAt - b.firstAt));
      pick = hits[0];
    } else {
      const [first, second] = scored;
      if (first && first.score >= 0.5 && (!second || first.score - second.score >= 0.08)) pick = first;
    }
    if (pick && (!best || pick.score > best.score)) best = { option: pick.o, score: pick.score, transcript: alt };
  });
  return best;
}

// Shared phrase banks for common intents. Option builders pull from these so
// "another recognizable suitable expression" is accepted.
export const PHRASES = {
  left: ['turn left', 'go left', 'left'],
  right: ['turn right', 'go right', 'right'],
  straight: ['go straight', 'straight', 'straight ahead'],
  back: ['go back', 'turn back', 'turn around', 'back'],
  niceToMeet: ['nice to meet you', 'nice to meet you too', 'glad to meet you', 'nice meeting you', 'hello', 'hi', 'hi nice to meet you', 'me too'],
  greet: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you', 'hi there'],
  yes: ['yes', 'yes i do', 'yes i can', 'sure', 'ok', 'okay', 'of course', 'yes please', 'sounds good', 'sounds fun', 'good idea', 'why not', 'all right', 'yes lets'],
  no: ['no', 'no i do not', 'no i can not', 'nope', 'no thank you', 'no thanks', 'not now', 'maybe later', 'sorry'],
  thanks: ['thank you', 'thanks', 'thank you very much', 'thanks a lot', 'thank you so much', 'arigato'],
  bye: ['bye', 'goodbye', 'good bye', 'see you', 'see you later', 'see you tomorrow', 'bye bye', 'see you again'],
  letsGo: ['lets go', 'ok lets go', 'lets play', 'yes lets go', 'sounds fun', 'great', 'cool', 'sure', 'yes'],
  hereYouAre: ['here you are', 'here you go', 'here it is', 'here'],
  fine: ['i am fine', 'fine', 'i am good', 'good', 'great', 'i am great', 'i am happy', 'i am fine thank you', 'fine thank you'],
  sleepy: ['i am sleepy', 'sleepy', 'tired', 'i am tired'],
  hungry: ['i am hungry', 'hungry'],
};

export const YES_KEYS = [['yes', 'yeah', 'sure', 'ok', 'okay', 'course', 'lets', 'good', 'fun', 'great', 'cool', 'alright']];
export const NO_KEYS = [['no', 'nope', 'not', 'sorry', 'later']];
