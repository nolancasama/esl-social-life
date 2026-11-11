import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODES, DESTINATIONS, STARTS, EDGES, relativeTurn, exitsAt, shortestNextNode, sideOfDest, validPairs } from './directions.js';

test('turns are relative to all four visitor headings', () => {
  const directions = ['S', 'E', 'N', 'W'];
  for (let i = 0; i < 4; i++) {
    const h = i * Math.PI / 2;
    assert.equal(relativeTurn(h, 'C', directions[i]), 'straight');
    assert.equal(relativeTurn(h, 'C', directions[(i + 1) % 4]), 'left');
    assert.equal(relativeTurn(h, 'C', directions[(i + 3) % 4]), 'right');
    assert.equal(relativeTurn(h, 'C', directions[(i + 2) % 4]), 'back');
  }
  assert.equal(relativeTurn(0, 'C', { x: 0.9, z: 1 }), 'straight');
  assert.equal(relativeTurn(0, 'C', { x: 1.1, z: 1 }), 'left');
});
test('U-turns only appear off course or at a dead end', () => {
  for (const [a, b] of EDGES.flatMap(([a,b]) => [[a,b],[b,a]])) {
    const dead = EDGES.filter((e) => e.includes(b)).length === 1;
    assert.equal(exitsAt(b, a).some((e) => e.turn === 'back'), dead);
    assert.ok(exitsAt(b, a, { offCourse: true }).some((e) => e.turn === 'back'));
  }
});
test('shortest routes use the junctions and every destination is reachable', () => {
  assert.equal(shortestNextNode('W', 'mall'), 'L');
  assert.equal(shortestNextNode('C', 'school'), 'F');
  assert.equal(shortestNextNode('L', 'shrine'), 'SH');
  assert.equal(shortestNextNode('P', 'cafe'), 'C');
  for (const start of STARTS) for (const [dest, d] of Object.entries(DESTINATIONS)) {
    const seen = new Set(); let at = start;
    while (at !== d.node) {
      assert.ok(NODES[at]); assert.ok(!seen.has(at)); seen.add(at);
      const next = shortestNextNode(at, dest);
      assert.ok(EDGES.some((e) => e.includes(at) && e.includes(next)));
      at = next;
    }
    assert.equal(shortestNextNode(at, dest), null);
  }
  assert.ok(!validPairs().some((p) => p.start === 'E' && p.dest === 'mall'));
  for (const pair of validPairs()) {
    let at = pair.start, count = 0;
    while (at !== DESTINATIONS[pair.dest].node) { at = shortestNextNode(at, pair.dest); if (['L','C'].includes(at)) count++; }
    assert.ok(count >= 1 && count <= 3);
  }
});
test('doors are on the visitor’s left or right from both road directions', () => {
  for (const dest of ['cafe', 'park', 'mall']) {
    const node = DESTINATIONS[dest].node;
    assert.equal(sideOfDest(node, Math.PI / 2, dest), dest === 'mall' ? 'left' : 'right');
    assert.equal(sideOfDest(node, -Math.PI / 2, dest), dest === 'mall' ? 'right' : 'left');
  }
  assert.equal(sideOfDest('SH', 0, 'shrine'), 'ahead');
  assert.equal(sideOfDest('G', Math.PI, 'school'), 'ahead');
});
