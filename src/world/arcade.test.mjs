import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRANE_PRIZES, CRANE_START, CRANE_TOLERANCE, moveClaw, craneGrab, craneCue, winCranePrize, hasCranePrize,
  RACE_FINISH, RACE_STOP_ZONE, raceCenterAt, raceCueAt, newRace, stepRace, raceGhostTime,
  rhythmGrade, rhythmFriendScore,
} from './arcade.js';

test('crane: a claw lined up over a prize always grabs it; a near miss never does', () => {
  for (const p of CRANE_PRIZES) {
    assert.equal(craneGrab({ x: p.x, z: p.z })?.id, p.id);
    assert.equal(craneGrab({ x: p.x + CRANE_TOLERANCE * 0.9, z: p.z })?.id, p.id);
  }
  assert.equal(craneGrab(CRANE_START), null, 'the chute corner is empty');
  assert.equal(craneGrab({ x: 0.5, z: 0.45 }), null, 'between prizes is a miss');
  // Prizes are spaced so one grip can never reach two of them.
  for (const a of CRANE_PRIZES) for (const b of CRANE_PRIZES) {
    if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > CRANE_TOLERANCE * 2);
  }
});

test('crane: cues lead the claw to the chosen prize and say when it is under the claw', () => {
  const cat = CRANE_PRIZES.find((p) => p.id === 'cat');
  let claw = { ...CRANE_START };
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const cue = craneCue(claw, cat);
    seen.add(cue.id);
    if (cue.id === 'under') break;
    const dir = { left: { x: -1 }, right: { x: 1 }, back: { z: -1 }, forward: { z: 1 } }[cue.id];
    claw = moveClaw(claw, dir, 1 / 30);
  }
  assert.equal(craneCue(claw, cat).en, "Stop! It's under the claw.");
  assert.equal(craneGrab(claw)?.id, 'cat');
  assert.ok(seen.has('left') && seen.has('back'));
  assert.deepEqual(moveClaw({ x: 0.06, z: 0.5 }, { x: -1 }, 5), { x: 0.05, z: 0.5 }, 'the claw stays inside the machine');
});

test('crane: each prize is awarded once, newest first, and never duplicated by retries', () => {
  const save = { souvenirs: [{ kind: 'cafe', npcId: 'n1', day: 1 }] };
  const first = winCranePrize(save, 'duck', 4);
  assert.equal(first.ok, true);
  assert.equal(save.souvenirs[0].kind, 'crane_duck');
  assert.equal(hasCranePrize(save, 'duck'), true);
  assert.deepEqual(winCranePrize(save, 'duck', 5), { ok: false, reason: 'have', prize: first.prize });
  assert.equal(save.souvenirs.filter((s) => s.kind === 'crane_duck').length, 1);
  assert.equal(winCranePrize(save, 'nope').reason, 'unknown');
  const legacy = {};
  assert.equal(winCranePrize(legacy, 'star').ok, true, 'a save without a souvenir list still works');
});

test('racing: the road bends left and right, then returns to the middle', () => {
  assert.equal(raceCenterAt(0), 0);
  assert.ok(raceCenterAt(70) < -0.4, 'after the first left turn');
  assert.ok(raceCenterAt(125) > 0.2, 'after the right turn');
  assert.ok(Math.abs(raceCenterAt(RACE_FINISH + 5)) < 1e-9);
});

test('racing: the navigator calls each direction before it is needed', () => {
  assert.equal(raceCueAt(0).en, 'Go straight!');
  assert.equal(raceCueAt(25).en, 'Turn left!', 'called 15 m before the turn');
  assert.equal(raceCueAt(80).en, 'Turn right!');
  assert.equal(raceCueAt(RACE_FINISH - 5).en, 'Stop!');
  const ids = new Set();
  for (let d = 0; d < RACE_FINISH + 10; d += 1) ids.add(raceCueAt(d).id);
  assert.deepEqual([...ids].sort(), ['left', 'right', 'stop', 'straight']);
});

const drive = ({ steer, brakeAt = null }) => {
  let s = newRace();
  for (let i = 0; i < 60 * 60 && !s.stopped; i++) {
    const center = raceCenterAt(s.d + 3);
    s = stepRace(s, { steer: steer ? Math.sign(Math.round((center - s.x) * 20)) : 0, brake: brakeAt !== null && s.d >= brakeAt }, 1 / 60);
  }
  return s;
};

test('racing: a good driver beats the rival and can make a perfect stop', () => {
  const good = drive({ steer: true, brakeAt: RACE_STOP_ZONE.from + 1 });
  assert.equal(good.stopped, true);
  assert.equal(good.perfectStop, true);
  assert.ok(good.finishTime < raceGhostTime('rival'), `${good.finishTime} < ${raceGhostTime('rival')}`);
  const lazy = drive({ steer: false });
  assert.equal(lazy.stopped, true, 'the car always stops by itself after the stop zone');
  assert.equal(lazy.perfectStop, false);
  assert.ok(lazy.finishTime > good.finishTime + 1, 'leaving the road is slower');
  assert.equal(raceGhostTime('n7'), raceGhostTime('n7'), 'ghost times are deterministic');
});

test('rhythm: grades and friend scores are deterministic', () => {
  assert.equal(rhythmGrade(0.5), 'perfect');
  assert.equal(rhythmGrade(0.62), 'good');
  assert.equal(rhythmGrade(0.8), 'miss');
  assert.equal(rhythmGrade(null), 'miss');
  const s = rhythmFriendScore('n3');
  assert.equal(s, rhythmFriendScore('n3'));
  assert.ok(s >= 3 && s <= 7);
});
