// Town street graph. Headings are radians, atan2(east, south).
export const NODES = Object.fromEntries([
  ['W', -36, 0, 'the end of the street', '道の終わり'],
  ['L', -22.5, 0, 'a small lane', '小さな道'],
  ['F', -12, 0, 'the café', 'カフェ'],
  ['C', 0, 0, 'the crossroads', '交差点'],
  ['P', 9, 0, 'a park', '公園'],
  ['M', 25, 0, 'a big mall', '大きなモール'],
  ['E', 36, 0, 'the end of the street', '道の終わり'],
  ['N', 0, -30, 'the end of the street', '道の終わり'],
  ['S', 0, 30, 'the end of the street', '道の終わり'],
  ['G', -23.5, -6.5, 'the school gate', '学校の門'],
  ['SH', -21.5, 32, 'the shrine', '神社'],
].map(([id, x, z, sees, ja]) => [id, { id, x, z, sees, ja }]));
export const DESTINATIONS = {
  cafe: { node: 'F', x: -12, z: 8.3, en: 'the café', ja: 'カフェ' },
  school: { node: 'G', x: -23.5, z: -8, en: 'the school gate', ja: '学校の門' },
  park: { node: 'P', x: 8, z: 6, en: 'Sakura Park', ja: 'さくら公園' },
  shrine: { node: 'SH', x: -21.5, z: 35.2, en: 'the shrine', ja: '神社' },
  mall: { node: 'M', x: 25, z: -15.6, en: 'Niji Mall', ja: 'にじモール' },
};
export const STARTS = ['W', 'E', 'N', 'S'];
export const EDGES = [['W','L'], ['L','F'], ['F','C'], ['C','P'], ['P','M'], ['M','E'], ['C','N'], ['C','S'], ['L','G'], ['L','SH']];
const node = (n) => typeof n === 'string' ? NODES[n] : n;
export const headingBetween = (a, b) => Math.atan2(node(b).x - node(a).x, node(b).z - node(a).z);
export function relativeTurn(heading, fromNode, toNode) {
  const d = Math.atan2(Math.sin(headingBetween(fromNode, toNode) - heading), Math.cos(headingBetween(fromNode, toNode) - heading));
  if (Math.abs(d) < Math.PI / 4) return 'straight';
  if (Math.abs(d) > 3 * Math.PI / 4) return 'back';
  return d > 0 ? 'left' : 'right';
}
export function exitsAt(id, arrivingFrom, { offCourse = false } = {}) {
  const adjacent = EDGES.filter((e) => e.includes(id)).map((e) => e.find((n) => n !== id));
  const heading = arrivingFrom ? headingBetween(arrivingFrom, id) : headingBetween(id, adjacent[0]);
  return adjacent.map((to) => ({ turn: relativeTurn(heading, id, to), to }))
    .filter((e) => e.turn !== 'back' || offCourse || adjacent.length === 1);
}
export function shortestNextNode(from, dest) {
  const target = DESTINATIONS[dest]?.node || dest;
  if (from === target) return null;
  const queue = [[from]], seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift(), last = path.at(-1);
    for (const e of EDGES.filter((e) => e.includes(last))) {
      const next = e.find((n) => n !== last);
      if (seen.has(next)) continue;
      const route = [...path, next];
      if (next === target) return route[1];
      seen.add(next); queue.push(route);
    }
  }
  return null;
}
export function sideOfDest(id, heading, dest) {
  const turn = relativeTurn(heading, id, DESTINATIONS[dest]);
  return turn === 'straight' || turn === 'back' ? 'ahead' : turn;
}
export function validPairs() {
  return STARTS.flatMap((start) => Object.keys(DESTINATIONS).filter((dest) => {
    let at = start, decisions = 0;
    while (at !== DESTINATIONS[dest].node) {
      at = shortestNextNode(at, dest);
      if (at === 'L' || at === 'C') decisions++;
    }
    return decisions >= 1 && decisions <= 3;
  }).map((dest) => ({ start, dest })));
}
