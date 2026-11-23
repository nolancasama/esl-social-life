// Living World end-to-end scenarios (DESIGN_DECISIONS 2026-11-23), played
// through the real UI. Hooks only set up state (clock, money, friendship
// levels, a home-visit offer, an owned item for the robot/cap/book checks)
// and read frozen snapshots; buying, playing and talking use cards and keys.
//   A. buy a soccer ball → duplicate refused → reload → kick-ups in the park →
//      a soccer fan notices the ball → soccer together → remembered next day;
//   B. buy a board game → a friend visits → "What do you want to play?" →
//      Picture Pairs with the friend taking real turns → shared memory;
//   C. a mall outing to the racing game → the rival car really drives →
//      the result matches play → one reward, one period → recalled later;
//   E. My Things: robot commands, wearing a cap at the mirror, reading.
import { launch, harness } from './lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR;
if (!out) throw new Error('Set SHOTS_DIR to a directory outside the repository.');
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const rel = path.relative(repo, path.resolve(out));
if (!rel || (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))) throw new Error('SHOTS_DIR must be outside the repository.');
const BROKEN = process.env.LIVING_HARNESS_BROKEN_ASSERTION === '1';

const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const precondition = async (label, predicate, arg, timeout = 15000) => {
  try { await page.waitForFunction(predicate, arg, { timeout }); }
  catch { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`); }
};
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const thing = () => ev(() => window.__esl.thingPlay);
const arcade = () => ev(() => window.__esl.arcade);
const use = async (id) => {
  await precondition(`exploring before ${id}`, () => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard && performance.now() > (window.__esl.interactBlockUntil || 0));
  await ev((id) => {
    const g = window.__esl, target = g._interactables().find((it) => it.id === id);
    if (!target) throw new Error(`HARNESS_PRECONDITION_FAILED: Missing interaction: ${id}`);
    const p = g.scene.collision.nearestFree(target.x, target.z, 0.3);
    g.player.place(p.x, p.z, Math.PI);
  }, id);
  await precondition(`walk-up prompt for ${id}`, (id) => window.__esl.target?.it?.id === id, id);
  await page.locator('.action').click();
};
const recordSpeech = () => ev(() => {
  window.__said = [];
  new MutationObserver(() => {
    const t = document.querySelector('.dlg-en')?.textContent;
    if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t);
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const said = (s) => ev((s) => window.__said.some((t) => t.includes(s)), s);
const cardTexts = () => page.locator('.dlg-cards .card').allInnerTexts().catch(() => []);
// Find and click in one step: cards can be replaced between two evaluations.
const clickCard = async (text) => {
  await precondition(`card "${text}"`, (t) => {
    const card = [...document.querySelectorAll('.dlg-cards .card')].find((c) => c.textContent.includes(t));
    if (card) card.click();
    return !!card;
  }, text, 10000);
};
const ledger = () => ev(() => { const s = window.__esl.world.save; return { day: s.time.day, period: s.time.period, money: s.pocketMoney.balance, memories: s.memories.length }; });
const recall = (npcId, act) => ev(async ({ npcId, act }) => {
  const { describeMemory } = await import('/src/world/friendship.js');
  const w = window.__esl.world;
  const m = w.save.memories.find((x) => (x.act === act || x.detail?.template === act) && x.npcIds.includes(npcId));
  return m ? describeMemory(w, m, npcId, w.day)?.en : null;
}, { npcId, act });
async function reloadProfile() {
  await page.reload();
  await page.waitForSelector('.profile:not(.new)', { timeout: 30000 });
  await page.locator('.profile:not(.new)').first().click();
  await page.waitForFunction(() => window.__esl?.world, null, { timeout: 30000 });
  await sleep(2500);
  await settle();
  await recordSpeech();
}
// Press the action key when the meter needle crosses the green middle.
async function driveMeter(until, { lo = 44, hi = 56 } = {}) {
  let armed = true;
  for (let i = 0; i < 4000; i++) {
    if (await until()) return true;
    const left = await ev(() => { const n = document.querySelector('.act-needle'); const b = document.querySelector('.act-btn'); return n && !n.parentElement.hidden && b && !b.hidden ? parseFloat(n.style.left) : -1; });
    if (left >= 0 && (left < 30 || left > 70)) armed = true;
    if (armed && left >= lo && left <= hi) { await page.keyboard.press('Space'); armed = false; }
    await sleep(8);
  }
  return until();
}
async function driveRace() {
  let held = null, stopped = false;
  const hold = async (k) => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  let overtakes = 0, lastLead = null;
  for (let i = 0; i < 3000; i++) {
    const a = await arcade();
    if (a.phase !== 'playing') break;
    const dx = (a.raceCenter ?? 0) - (a.raceX ?? 0);
    await hold(dx < -0.04 ? 'ArrowLeft' : dx > 0.04 ? 'ArrowRight' : null);
    const lead = (a.rivalD ?? 0) > (a.raceD ?? 0) ? 'rival' : 'me';
    if (lastLead && lead !== lastLead) overtakes++;
    lastLead = lead;
    if (a.finishTime !== null && a.finishTime !== undefined && !stopped) { await hold(null); await page.keyboard.press('Space'); stopped = true; }
    await sleep(25);
  }
  await hold(null);
  return overtakes;
}

try {
  await page.goto(base + '/?autostart=sample&name=Mika');
  await recordSpeech();
  await page.waitForFunction(() => window.__esl?.sceneId === 'classroom', null, { timeout: 30000 });
  await sleep(2600);
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 }), 'welcome finished');
  await settle();
  const cast = await ev(() => {
    const g = window.__esl, w = g.world;
    w.save.flags.fd = 'done';
    w.save.time = { day: 5, period: 0 }; w.ensureDaily();
    for (let d = 0; d < 30; d++) w.save.weatherOverrides[d] = 'sunny';
    const fan = w.npcs.find((n) => n.likes.some((l) => ['soccer', 'running', 'basketball'].includes(l)) && n.id !== w.save.firstFriend);
    const host = w.npcs.find((n) => n.id !== fan.id && n.likes.some((l) => ['games', 'comics', 'reading', 'shopping'].includes(l)));
    const racer = w.npcs.find((n) => n.id !== fan.id && n.id !== host.id);
    for (const n of [fan, host, racer]) { w.meet(n.id); const r = w.rel(n.id); r.level = 2; r.xp = 40; }
    const r = w.rel(host.id); r.level = 4; r.xp = 60;
    g.hud.queue.length = 0;
    return { fan: { id: fan.id, name: fan.name, likes: fan.likes }, host: { id: host.id, name: host.name, likes: host.likes }, racer: { id: racer.id, name: racer.name } };
  });
  log('cast', cast);

  // ================================================================ A. soccer ball
  log('— A. buy a soccer ball and use it');
  await ev(async () => { await window.__esl.enterScene('mall', 'door'); });
  await settle();
  const a0 = await ledger();
  await use('sports');
  expect(await pump(idle, { label: 'buy-ball', max: 40, prefer: ['Can I see a soccer ball, please?', 'How much is it?', "I'll take it!", 'Thank you!'] }), 'the shop conversation ends in exploring');
  const a1 = await ledger();
  expect(await said("It's 700 yen."), 'the shopkeeper answers How much is it? with the real price');
  expect(a1.money === a0.money - 700 && await ev(() => window.__esl.world.save.souvenirs.some((s) => s.kind === 'mall_ball')), `buying the ball costs 700 yen once (${a0.money} → ${a1.money})`);
  await use('sports');
  expect(await pump(idle, { label: 'buy-again', max: 30, prefer: ['Can I see a soccer ball, please?', 'No, thank you.'] }), 'the second visit ends in exploring');
  expect(await said('You have one already!') && (await ledger()).money === a1.money, 'a second ball is refused politely and costs nothing');
  await ev(() => window.__esl.menus.open('things'));
  await page.locator('.thing[data-thing="ball"]').waitFor({ state: 'visible', timeout: 5000 });
  expect(await page.locator('.thing[data-thing="ball"] .reply[disabled]').count() === 1 && /Sakura Park/.test(await page.locator('.thing[data-thing="ball"]').innerText()), 'My Things shows the ball, to be played with in the park');
  await shot('my-things-mall');
  await page.keyboard.press('Escape');
  await settle();
  await reloadProfile();
  expect(await ev(() => window.__esl.world.save.souvenirs.some((s) => s.kind === 'mall_ball')), 'the purchase is saved across a reload');
  // The park: kick-ups, and a soccer fan comes over.
  await ev(async (fan) => {
    const g = window.__esl, w = g.world;
    w.save.time = { day: 5, period: 0 }; w.ensureDaily();
    w.daily.lost = null;
    await g.enterScene('town', 'park');
    const f = g.scene.field.a;
    // The fan's schedule may already have them elsewhere in town (ensure()
    // would keep that actor where it is): stand them by the field instead.
    const have = g.npcs.actorFor(fan.id);
    if (have) g.npcs.removeActor(have);
    // Any other known soccer fan nearby (e.g. the first-day friend) could be
    // the one who comes over; keep this scene about the cast's fan.
    for (const a of g.npcs.actors.slice()) if (!a.special && a.npc.id !== fan.id && w.isKnown(a.npc.id) && (a.npc.likes || []).some((l) => ['soccer', 'running', 'basketball'].includes(l))) g.npcs.removeActor(a);
    g.npcs.ensure(w.npc(fan.id), f.x + 4, f.z + 2.5, 0);
    g.hud.queue.length = 0;
  }, cast.fan);
  await settle();
  const fanBefore = await ev((id) => window.__esl.world.rel(id).xp, cast.fan.id);
  const p0 = await ledger();
  await use('kickups');
  expect(await pump(async () => (await thing()).play === 'kickups' && (await thing()).phase === 'playing', { label: 'kickups-intro', max: 20 }), 'kick-ups start after the ball explains the game');
  await shot('kickups');
  expect(await driveMeter(async () => (await thing()).phase === 'result'), 'kick-ups finish');
  const kicks = (await thing()).kicks;
  expect(kicks >= 1, `timed kicks count (${kicks})`);
  expect(await pump(async () => (await ledger()).period === p0.period + 1 && await idle(), { label: 'fan-soccer', max: 200, prefer: ["I'm good at soccer!", "I'll practice more!", 'Yes! I want to play!', "Let's go!", 'Yes, I can!', 'Here you go!', 'Thank you! That was fun!'] }), 'the fan notices the ball and the two play soccer');
  await settle();
  expect(await said('You have a soccer ball!'), 'the friend really noticed the ball you own');
  const a2 = await ev(({ id }) => { const w = window.__esl.world; const m = w.save.memories.find((x) => x.act === 'soccer' && x.npcIds.includes(id)); return { xp: w.rel(id).xp, item: m?.detail?.item, place: m?.detail?.place }; }, cast.fan);
  expect(a2.item === 'ball' && a2.place === 'park', 'the memory records the ball and the park');
  expect(a2.xp > fanBefore, `the friendship improves (${fanBefore} → ${a2.xp})`);
  await ev(() => { const w = window.__esl.world; w.save.time = { day: 6, period: 0 }; w.ensureDaily(); });
  const ballRecall = await recall(cast.fan.id, 'soccer');
  expect(/with your ball yesterday/.test(ballRecall || ''), `the next day the friend remembers it accurately: "${ballRecall}"`);

  // ================================================================ B. board game at home
  log('— B. a board game at home with a friend');
  await ev(async () => { const g = window.__esl, w = g.world; w.save.time = { day: 6, period: 0 }; w.ensureDaily(); w.save.pocketMoney.balance = 1000; await g.enterScene('mall', 'door'); });
  await settle();
  await use('toys');
  expect(await pump(idle, { label: 'buy-game', max: 40, prefer: ['Can I see a board game, please?', 'How much is it?', "I'll take it!", 'Thank you!'] }), 'buying the board game ends in exploring');
  expect(await ev(() => window.__esl.world.save.souvenirs.some((s) => s.kind === 'mall_game')) && (await ledger()).money === 400, 'the board game is bought for 600 yen');
  const b0 = await ledger();
  await ev(async (host) => {
    const g = window.__esl, w = g.world;
    await g.enterScene('town', 'park');
    // Today's random lost-item favour comes first when it falls on the host
    // here; clear it so the visit invitation is what this scene tests.
    w.daily.lost = null;
    g.friendshipDebug.offer('home_visit', host.id, {});
    const a = g.npcs.ensure(w.npc(host.id), g.player.x + 1.2, g.player.z, 0);
    g.hud.queue.length = 0;
    g.talkTo(a);
  }, cast.host);
  expect(await pump(async () => { const t = await thing(); return t.play === 'pairs' && t.phase === 'playing'; }, { label: 'visit', max: 200, prefer: ["Sure! Let's go now!", "Let's go!", 'Thank you! Come in!', 'Yes! That was fun!', "Sure! Let's take one today!", 'What do you want to play?', 'I want to play a board game.', 'Yes! It’s fun!'] }), 'choosing "I want to play a board game." starts the board game');
  expect(await said('What do you want to play?'), 'the friend asks What do you want to play?');
  await shot('pairs-start');
  // Play: one deliberate mismatch so the friend takes a real turn, then pairs.
  let friendTurns = 0, mismatchDone = false, sawFriend = false;
  const press = async (i) => {
    const cur = (await thing()).cursor;
    const steps = (i - cur + 12) % 12;
    for (let k = 0; k < steps; k++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await sleep(480);
  };
  for (let guard = 0; guard < 120; guard++) {
    const t = await thing();
    if (t.phase !== 'playing') break;
    if (t.turn === 'friend') { if (!sawFriend) { friendTurns++; sawFriend = true; await shot('pairs-friend-turn'); } await sleep(300); continue; }
    sawFriend = false;
    if (!t.open?.length || (t.faceUp || []).length >= 2) { await sleep(200); continue; }
    if ((t.faceUp || []).length === 1) {
      // One card is up on my turn: finish the turn with its match.
      const up = t.faceUp[0], mate = t.open.find((j) => j !== up && t.deck[j] === t.deck[up]);
      await press(mate);
      continue;
    }
    const deck = t.deck, free = t.open;
    if (!mismatchDone) {
      const a = free[0], b = free.find((j) => deck[j] !== deck[a]);
      mismatchDone = true;
      await press(a); await press(b);
      continue;
    }
    const a = free[0], b = free.find((j) => j !== a && deck[j] === deck[a]);
    await press(a); await press(b);
  }
  expect(friendTurns >= 1, `the friend took real turns at the board game (${friendTurns})`);
  await precondition('pairs result', () => window.__esl.thingPlay.phase === 'result' || window.__esl.thingPlay.play === null, null, 30000);
  expect(await pump(async () => (await ledger()).period === b0.period + 1 && await idle(), { label: 'visit-end', max: 120, prefer: ['Good game!', 'See you tomorrow!', 'Me too!'] }), 'the visit ends and takes one period');
  await settle();
  const b1 = await ev((id) => { const w = window.__esl.world; const m = w.save.memories.find((x) => x.detail?.template === 'home_visit' && x.npcIds.includes(id)); return { game: m?.detail?.game, item: m?.detail?.item, coop: m?.detail?.coop, recall: m?.detail?.recall?.en, owned: w.save.souvenirs.some((s) => s.kind === 'mall_game'), mems: w.save.memories.length }; }, cast.host.id);
  expect(b1.game === 'pairs' && b1.item === 'board_game' && b1.coop === true, 'the shared memory records the board game, played together');
  expect(b1.recall === (BROKEN ? 'broken' : 'We played your board game at your house'), `the friend will recall it: "${b1.recall}"`);
  expect(b1.owned, 'the board game stays in My Things for the next visit');
  expect(b1.mems === b0.memories + 1, 'exactly one memory for the visit');

  // ================================================================ C. arcade race with a friend
  log('— C. a racing game at Niji Mall with a friend');
  await ev(async (racer) => {
    const g = window.__esl, w = g.world;
    w.save.time = { day: 12, period: 0 }; w.ensureDaily();
    w.addPlan({ npcIds: [racer.id], day: 12, period: 0, loc: 'mall', act: 'mall', source: 'test' });
    g.hud.queue.length = 0;
    await g.enterScene('mall', 'door');
  }, cast.racer);
  await settle();
  await precondition('the racer waits at the entrance', (id) => !!window.__esl.npcs.actorFor(id), cast.racer.id);
  await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id), p = a.char.root.position; const free = g.scene.collision.nearestFree(p.x - 0.9, p.z + 0.4, 0.3); g.player.place(free.x, free.z, 0); }, cast.racer.id);
  await precondition('the racer offers Talk', (id) => window.__esl.target?.actor?.npc?.id === id, cast.racer.id);
  const c0 = await ev((id) => ({ xp: window.__esl.world.rel(id).xp, mems: window.__esl.world.save.memories.length, period: window.__esl.world.period }), cast.racer.id);
  await page.locator('.action').click();
  expect(await pump(async () => { const a = await arcade(); return a.game === 'racing' && a.phase === 'playing'; }, { label: 'outing', max: 80, prefer: ["Let's go!", 'I want to play games.', 'I want to go to the third floor.', 'I want to play the racing game.', "Let's play together!"] }), '"I want to play the racing game." starts the race');
  await sleep(4000);
  await shot('race-with-rival');
  const mid = await arcade();
  expect(mid.rivalD > 1, `the rival car is driving on the track (${mid.rivalD?.toFixed(1)} m)`);
  await driveRace();
  await precondition('race result', () => window.__esl.arcade.phase === 'result', null, 60000);
  const race = await arcade();
  expect(race.result && race.result.rival > 15 && race.won === race.result.time < race.result.rival, `the result reflects the real race (${race.result?.time?.toFixed(1)} vs ${race.result?.rival?.toFixed(1)})`);
  expect(await pump(async () => (await ledger()).period === c0.period + 1 && await idle(), { label: 'race-end', max: 80, prefer: ['That was fun! Thank you!', 'Thank you!'] }), 'the outing ends');
  await settle();
  const c1 = await ev((id) => { const w = window.__esl.world; const m = w.save.memories.filter((x) => x.act === 'mall' && x.npcIds.includes(id)); return { xp: w.rel(id).xp, mems: w.save.memories.length, n: m.length, game: m[0]?.detail?.game, won: m[0]?.detail?.won, period: w.period }; }, cast.racer.id);
  expect(c1.n === 1 && c1.mems === c0.mems + 1 && c1.game === 'racing', 'one outing memory records the race');
  expect(c1.period === c0.period + 1, 'exactly one period advanced');
  expect(c1.won === race.won, 'the memory stores who really won');
  await ev(() => { const w = window.__esl.world; w.save.time = { day: 14, period: 0 }; w.ensureDaily(); });
  const raceRecall = await recall(cast.racer.id, 'mall');
  expect(/race/.test(raceRecall || ''), `later the friend remembers the race: "${raceRecall}"`);

  // ================================================================ E. robot, cap and book from My Things
  log('— E. robot, cap and book');
  await ev(async () => {
    const g = window.__esl, w = g.world;
    for (const kind of ['mall_robot', 'mall_cap', 'mall_book']) if (!w.save.souvenirs.some((s) => s.kind === kind)) w.save.souvenirs.push({ id: `test-${kind}`, kind, npcId: null, day: w.day });
    w.save.time = { day: 14, period: 0 }; w.ensureDaily();
    await g.enterScene('home', 'center');
  });
  await settle();
  expect(await ev(() => window.__esl.scene.robot.visible), 'the robot stands in the bedroom');
  await use('robot');
  await pump(async () => (await thing()).phase === 'playing', { label: 'robot-intro', max: 10 });
  await shot('robot');
  // Solve each level with real command cards. The harness reads the cards on
  // screen, and after every command waits until the game has acted on it, so
  // it never plans from a frame that is one tick old.
  const robotState = () => ev(() => { const s = window.__esl.thingPlay; return { play: s.play, phase: s.phase, level: s.level, moving: s.moving, pose: s.pose, star: s.star }; });
  let robotGoal = null;
  for (let guard = 0; guard < 200; guard++) {
    const t = await robotState();
    if (t.play !== 'robot' || t.phase !== 'playing') break;
    const cards = await ev(() => [...document.querySelectorAll('.dlg-cards .card')].map((c) => c.textContent));
    if (cards.some((c) => c.includes('Stop!'))) {
      // Robo is walking: say Stop! as it enters the last cell of the run.
      if (robotGoal) await precondition('robot reaches the planned cell', (g2) => { const s = window.__esl.thingPlay; return (s.pose.x === g2.x && s.pose.y === g2.y) || !s.moving; }, robotGoal, 20000);
      await clickCard('Stop!');
      robotGoal = null;
      await precondition('robot stops', () => !window.__esl.thingPlay.moving, null, 10000);
      await sleep(150);
      continue;
    }
    if (!cards.some((c) => c.includes('Go straight!'))) { await sleep(120); continue; }
    // Plan from one snapshot: reading the pose and the path in separate calls
    // let a level change slip between them, giving a goal off the board.
    const plan = await ev(async () => {
      const { robotPath, ROBOT_LEVELS } = await import('/src/activities/things.js');
      const s = window.__esl.thingPlay;
      if (s.moving) return null;
      return { first: robotPath({ ...ROBOT_LEVELS[s.level], star: s.star }, s.pose, s.star)?.[0] || null, pose: { ...s.pose } };
    });
    const first = plan?.first;
    if (!first) { await sleep(120); continue; }
    if (first.id === 'straight') {
      const D = [[0, -1], [1, 0], [0, 1], [-1, 0]][plan.pose.d];
      robotGoal = { x: plan.pose.x + D[0] * first.n, y: plan.pose.y + D[1] * first.n };
      if (robotGoal.x < 0 || robotGoal.y < 0 || robotGoal.x > 4 || robotGoal.y > 4) throw new Error(`HARNESS_PRECONDITION_FAILED: robot goal off the board ${JSON.stringify({ plan, robotGoal })}`);
      await clickCard('Go straight!');
      await precondition('robot starts walking', () => window.__esl.thingPlay.moving, null, 10000);
    } else {
      await clickCard(first.id === 'left' ? 'Turn left!' : 'Turn right!');
      await precondition('robot turns', (d) => window.__esl.thingPlay.pose.d !== d, plan.pose.d, 10000);
    }
    await sleep(150);
  }
  log('robot after commands', { ...(await robotState()), cards: await cardTexts(), board: await ev(() => !!document.querySelector('.robot-board')), errors: H.errors });
  await precondition('robot result', () => window.__esl.thingPlay.phase === 'result' || window.__esl.thingPlay.play === null, null, 20000);
  const robo = await thing();
  expect(robo.stars === 3 || (await said('I got 3 stars')), 'Go straight / Turn left / Turn right / Stop move the robot to all three stars');
  expect(await pump(idle, { label: 'robot-end', max: 20, prefer: ['Bye, Robo!'] }), 'the robot game ends in a choice');
  // The cap at the mirror.
  const look0 = await ev(() => JSON.stringify(window.__esl.world.save.player.look));
  await use('mirror');
  expect(await pump(idle, { label: 'wear', max: 10, prefer: ['I want to wear my cap.'] }), 'the mirror offers your cap');
  expect(await ev(() => window.__esl.world.save.player.look.accessory === 'cap' && window.__esl.player.char.look?.accessory === 'cap'), 'the player wears the cap');
  await shot('wearing-cap');
  await reloadProfile();
  expect(await ev(() => window.__esl.world.save.player.look.accessory === 'cap'), 'the cap stays on after a reload');
  await ev(async () => { const g = window.__esl; if (g.sceneId !== 'home') await g.enterScene('home', 'center'); });
  await settle();
  await use('mirror');
  await pump(idle, { label: 'unwear', max: 10, prefer: ['I want to take off my cap.'] });
  expect(await ev(() => JSON.stringify(window.__esl.world.save.player.look)) === look0, 'taking the cap off restores the look you made');
  // A failure inside a thing play recovers (dev fault point), then reading works.
  const tF = await ev(() => Date.now());
  await ev(() => window.__esl.fault('thing:read'));
  await ev(() => window.__esl.menus.open('things'));
  await page.locator('.thing[data-thing="book"] .reply', { hasText: 'Read' }).click();
  await precondition('thing failure recovered', (t) => (window.__esl.lastRecovery?.at || 0) > t && window.__esl.mode === 'explore', tF, 15000);
  expect(await ev(() => document.querySelectorAll('.act-temp, .thing-board, .book').length === 0 && !window.__esl.dialogue.root?.classList?.contains('open')), 'a failed thing play leaves no board or overlay and returns to exploring');
  await sleep(700);
  // Reading from My Things.
  await ev(() => window.__esl.menus.open('things'));
  await page.locator('.thing[data-thing="book"] .reply', { hasText: 'Read' }).click();
  await page.locator('.book').waitFor({ state: 'visible', timeout: 8000 });
  await shot('reading');
  for (let i = 0; i < 4; i++) { await page.locator('.book-btn.go').click(); await sleep(350); }
  expect(await pump(idle, { label: 'read-end', max: 10, prefer: ['That was a good story!'] }), 'the story is read to the end and closes');
  expect(await ev(() => document.querySelectorAll('.act-temp').length === 0), 'no reading overlay is left behind');
  log('living summary', { kicks, race: race.result, shots: out });
} finally { await browser.close(); }
// The one injected fault logs an error on purpose; anything else is a failure.
const real = H.errors.filter((e) => !/injected at thing:read/.test(e));
if (real.length) { console.error('LIVING CHECKS FAILED:', real.join('; ')); process.exit(1); }
console.log('LIVING CHECKS PASSED');
