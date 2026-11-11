// Language practice history. Never shown as a score: it feeds the phrase book
// (a sticker collection) and quietly steers which opportunities appear.

import { LANGUAGE_AREAS } from '../data/content.js';

export function langState(save) {
  if (!save.lang) save.lang = { expr: {}, areas: {} };
  return save.lang;
}

/**
 * kind: 'heard' (NPC said it), 'said' (player chose/said it), 'spoken'
 * (player said it with the microphone).
 */
export function logExpr(save, { id, area, template, example, ja }, kind, day = null) {
  if (!id || !area) return;
  const L = langState(save);
  const e = L.expr[id] || (L.expr[id] = { area, template: template || example, ja: ja || '', example: example || template, heard: 0, said: 0, spoken: 0, firstDay: day });
  e[kind] = (e[kind] || 0) + 1;
  if (example) e.example = example;
  if (kind !== 'heard') e.lastDay = day;
  const a = L.areas[area] || (L.areas[area] = { heard: 0, said: 0, spoken: 0 });
  a[kind] = (a[kind] || 0) + 1;
}

export function areaCounts(save) {
  const L = langState(save);
  const out = {};
  for (const id of Object.keys(LANGUAGE_AREAS)) out[id] = L.areas[id] || { heard: 0, said: 0, spoken: 0 };
  return out;
}

/** 1 for well-practiced areas, up to ~3 for rarely practiced ones. */
export function areaNeed(save, area) {
  const counts = areaCounts(save);
  const said = counts[area]?.said || 0;
  const all = Object.values(counts).map((c) => c.said);
  const avg = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  return 1 + Math.max(0, Math.min(2, (avg - said) / Math.max(2, avg))) * 1.5;
}

export function leastPracticed(save, areas) {
  const counts = areaCounts(save);
  return [...areas].sort((a, b) => (counts[a]?.said || 0) - (counts[b]?.said || 0))[0];
}
