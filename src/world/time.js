// Calendar and periods. Time never ticks while exploring: it only moves when
// a major activity finishes, the player chooses "Advance time", or sleeps.

import { RNG } from '../core/rng.js';
import { DAYS } from '../data/content.js';

// Day 0 = Monday, April 13 (start of the Japanese school year). The year is
// never shown; it only anchors the calendar.
const BASE = Date.UTC(2026, 3, 13);
const DAY_MS = 86400000;

export const MORNING = 0;
export const AFTERNOON = 1;
export const EVENING = 2;

export function dow(day) { return ((day % 7) + 7) % 7; }
export function isWeekend(day) { return dow(day) >= 5; }
export function isSchoolTime(day, period) { return !isWeekend(day) && period === MORNING; }
export function isFreeTime(day, period) { return period === AFTERNOON || (period === MORNING && isWeekend(day)); }

export function dateOf(day) {
  const d = new Date(BASE + day * DAY_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Day index for a calendar date (inverse of dateOf). */
export function dayFor(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - BASE) / DAY_MS); }

export function periodLabel(day, period) {
  if (period === MORNING) return { en: 'Morning', ja: '朝', emoji: '🌅' };
  if (period === AFTERNOON) return isWeekend(day) ? { en: 'Afternoon', ja: '午後', emoji: '☀️' } : { en: 'After School', ja: '放課後', emoji: '🎒' };
  return { en: 'Evening', ja: '夜', emoji: '🌙' };
}

export function dayInfo(day) { return DAYS[dow(day)]; }

/** In-world clock used by "What time is it?" and the classroom clock. */
export function clockFor(day, period) {
  if (period === MORNING) return isWeekend(day) ? { h: 10, m: 0 } : { h: 8, m: 20 };
  if (period === AFTERNOON) return isWeekend(day) ? { h: 2, m: 0 } : { h: 3, m: 30 };
  return { h: 7, m: 0 };
}

function baseWeather(seed, day) {
  const r = new RNG(`${seed}|weather|${day}`).next();
  const m = dateOf(day).m;
  const pRain = m === 6 ? 0.42 : m === 7 || m === 9 ? 0.24 : 0.17;
  const pCloud = 0.26;
  if (r < pRain) return 'rainy';
  if (r < pRain + pCloud) return 'cloudy';
  return 'sunny';
}

/** Seeded daily weather. Day 0 is always sunny; no 3 rainy days in a row. */
export function weatherFor(seed, day, overrides = {}) {
  if (overrides[day]) return overrides[day];
  if (day <= 0) return 'sunny';
  const w = baseWeather(seed, day);
  if (w === 'rainy' && baseWeather(seed, day - 1) === 'rainy' && baseWeather(seed, day - 2) === 'rainy') return 'cloudy';
  return w;
}

/** Next (day, period) after the current one. Evening → next morning. */
export function nextPeriod(day, period) {
  if (period < EVENING) return { day, period: period + 1 };
  return { day: day + 1, period: MORNING };
}

export function slotKey(day, period) { return `${day}:${period}`; }
