import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from './world.js';
import { VISITORS } from '../data/content.js';
import { validPairs } from '../world/directions.js';

class EventWorld extends World {
  need(area) { return area === 'directions' ? 1 : this.cls.lostNeed; }
}
function world(seed, { day = 1, rainy = false, lostNeed = 1 } = {}) {
  return new EventWorld({ seed, npcs: [], lostNeed }, {
    id: 'visitor-test', excluded: [], time: { day, period: 0 },
    weatherOverrides: { [day]: rainy ? 'rainy' : 'sunny' },
  });
}
test('visitor rolls are deterministic and independent of lost-item chance/candidates', () => {
  let count = 0;
  for (let seed = 0; seed < 80; seed++) {
    const a = world(String(seed), { lostNeed: 0 });
    const b = world(String(seed), { lostNeed: 3 });
    assert.deepEqual(a.daily.visitor, b.daily.visitor);
    assert.deepEqual(a.daily.visitor, world(String(seed)).daily.visitor);
    if (!a.daily.visitor) continue;
    count++;
    const v = a.daily.visitor;
    assert.ok(VISITORS.some((n) => n.id === v.visitorId));
    assert.ok(validPairs().some((p) => p.start === v.start && p.dest === v.dest));
    assert.equal(v.period, 1); assert.equal(v.done, false);
  }
  assert.ok(count > 0 && count < 80);
});
test('visitor rolls respect day, rain, weekend periods, and daily reset', () => {
  for (let seed = 0; seed < 40; seed++) {
    assert.equal(world(String(seed), { day: 0 }).daily.visitor, null);
    assert.equal(world(String(seed), { rainy: true }).daily.visitor, null);
    const w = world(String(seed), { day: 5 });
    if (w.daily.visitor) assert.ok([0, 1].includes(w.daily.visitor.period));
    w.daily.visitorDone = true;
    w.save.time.day++;
    assert.equal(w.daily.visitorDone, false);
  }
});
