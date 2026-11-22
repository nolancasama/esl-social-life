// Niji Mall 3F Game Center and flexible mall outings, through the real UI:
// solo crane / racing / rhythm play (free, no time, no XP), crane prize
// persistence and duplicate protection, and planned outings that choose
// "I want to play games." or "I want to go shopping." at the 1F entrance.
// Hooks only arrange friends, plans and the clock; play uses keys and cards.
import { launch, harness } from './lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR;
if (!out) throw new Error('Set SHOTS_DIR to a directory outside the repository.');
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const rel = path.relative(repo, path.resolve(out));
if (!rel || (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))) throw new Error('SHOTS_DIR must be outside the repository.');
// Deliberately wrong expectation for the harness trust proof.
const BROKEN = process.env.ARCADE_HARNESS_BROKEN_ASSERTION === '1';

const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const precondition = async (label, predicate, arg, timeout = 15000) => {
  try { await page.waitForFunction(predicate, arg, { timeout }); }
  catch { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`); }
};
const arcade = () => ev(() => window.__esl.arcade);
const baseline = () => ev(() => {
  const w = window.__esl.world;
  return JSON.stringify({ time: w.save.time, memories: w.save.memories.length, xp: Object.fromEntries(Object.entries(w.save.rel).map(([id, r]) => [id, r.xp])) });
});
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
// Cards until the given minigame is actually running.
const toPlaying = (kind, prefer, label) => pump(async () => { const a = await arcade(); return a.game === kind && a.phase === 'playing'; }, { label, max: 60, prefer });

const KEY = { left: 'ArrowLeft', right: 'ArrowRight', back: 'ArrowUp', forward: 'ArrowDown' };
async function driveCrane(label) {
  let held = null;
  const hold = async (k) => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  const cues = new Set();
  let midShot = false;
  for (let i = 0; i < 1500; i++) {
    const a = await arcade();
    if (a.phase === 'result') break;
    if (a.cranePhase === 'move') {
      cues.add(a.cue);
      if (a.cue === 'under') { await hold(null); await page.keyboard.press('Space'); await sleep(150); }
      else { await hold(KEY[a.cue] || null); if (!midShot && i > 8) { await shot(`${label}-crane-steering`); midShot = true; } }
    } else await hold(null);
    await sleep(25);
  }
  await hold(null);
  return cues;
}
async function driveRace() {
  let held = null, stopped = false, midShot = false;
  const hold = async (k) => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  const cues = new Set();
  for (let i = 0; i < 3000; i++) {
    const a = await arcade();
    if (a.phase !== 'playing') break;
    if (a.raceCue) cues.add(a.raceCue);
    const dx = (a.raceCenter ?? 0) - (a.raceX ?? 0);
    await hold(dx < -0.04 ? 'ArrowLeft' : dx > 0.04 ? 'ArrowRight' : null);
    if (!midShot && a.raceD > 50) { await shot('racing-mid-race'); midShot = true; }
    if (a.finishTime !== null && a.finishTime !== undefined && !stopped) { await hold(null); await page.keyboard.press('Space'); stopped = true; }
    await sleep(25);
  }
  await hold(null);
  return cues;
}
// Tap once per sweep: arm while the needle is low, tap as it crosses the middle.
async function driveRhythm() {
  let armed = false, taps = 0, midShot = false;
  for (let i = 0; i < 3000; i++) {
    const a = await arcade();
    if (a.phase !== 'playing') break;
    const left = await ev(() => { const n = document.querySelector('.act-needle'); return n && !n.parentElement.hidden ? parseFloat(n.style.left) : -1; });
    if (left >= 0 && left < 30) armed = true;
    if (armed && left >= 45 && left <= 56) { await page.keyboard.press('Space'); armed = false; taps++; if (!midShot && taps >= 3) { await shot('rhythm-mid-game'); midShot = true; } }
    await sleep(10);
  }
}
const finishCards = (prefer, label) => pump(idle, { label, max: 60, prefer });
// The dialogue types lines out; record every finished line in the page so a
// poll that lands mid-typing can't miss one.
const recordSpeech = () => ev(() => {
  window.__said = [];
  new MutationObserver(() => {
    const t = document.querySelector('.dlg-en')?.textContent;
    if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t);
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const said = (s) => ev((s) => window.__said.some((t) => t.includes(s)), s);

try {
  await page.goto(base + '/?autostart=sample&name=Mika');
  await recordSpeech();
  await page.waitForFunction(() => window.__esl?.sceneId === 'classroom', null, { timeout: 30000 });
  await sleep(2600);
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 }), 'welcome finished');
  await settle();
  const cast = await ev(async () => {
    const g = window.__esl, w = g.world;
    w.save.flags.fd = 'done';
    w.save.time = { day: 5, period: 0 }; w.ensureDaily();
    for (let d = 5; d < 12; d++) w.save.weatherOverrides[d] = 'sunny';
    const friends = w.npcs.slice(0, 2);
    for (const n of friends) { w.meet(n.id); const r = w.rel(n.id); r.level = 2; r.xp = 40; w.learn(n.id, 'food'); }
    g.hud.queue.length = 0;
    await g.enterScene('mall3', 'elevator');
    return friends.map((n) => ({ id: n.id, name: n.name }));
  });
  await settle();
  await sleep(1500);
  await shot('mall3-game-center');
  expect(await ev(() => window.__esl.locationId === 'mall' && window.__esl.mallTravel.floor === 3), 'the Game Center is 3F of Niji Mall');

  // ---------------------------------------------------------------- solo crane
  const soloBefore = await baseline();
  await use('arcade-crane');
  expect(await toPlaying('crane', ['I want the cat.', "OK! Let's try!"], 'crane'), 'crane game starts after choosing a prize');
  const craneCues = await driveCrane('solo');
  await precondition('crane result', () => window.__esl.arcade.phase === 'result');
  const won = await arcade();
  expect(won.won === true && won.result === 'cat' && won.awarded === true, 'lining the claw up over the cat wins the cat');
  expect(['left', 'back', 'under'].every((c) => craneCues.has(c)), 'the crane calls Go left / Go back / It\'s under the claw');
  await shot('crane-won');
  // Play again for the same prize: it is won but never duplicated.
  expect(await toPlaying('crane', ['One more time!', 'I want the cat.', "OK! Let's try!"], 'crane-again'), 'One more time! replays the crane');
  await driveCrane('repeat');
  await precondition('second crane result', () => window.__esl.arcade.phase === 'result');
  const again = await arcade();
  expect(again.won === true && again.awarded === false, 'winning a prize you already have gives nothing new');
  expect(await finishCards(['That was fun!'], 'crane-done'), 'crane ends in a choice and returns to exploring');
  const prizes = await ev(() => window.__esl.world.save.souvenirs.filter((s) => s.kind.startsWith('crane_')).map((s) => s.kind));
  expect(prizes.length === 1 && prizes[0] === (BROKEN ? 'crane_dog' : 'crane_cat'), 'exactly one crane_cat souvenir is saved');

  // ---------------------------------------------------------------- solo racing
  await use('arcade-racing');
  expect(await toPlaying('racing', ["OK! Let's go!"], 'racing'), 'racing game starts');
  const raceCues = await driveRace();
  await precondition('race result', () => window.__esl.arcade.phase === 'result', null, 60000);
  const race = await arcade();
  expect(race.stopped && race.result?.time > 15 && race.result.time < 40, `the car finishes and stops (${race.result?.time?.toFixed(1)} s)`);
  expect(['straight', 'left', 'right', 'stop'].every((c) => raceCues.has(c)), 'the navigator calls Go straight / Turn left / Turn right / Stop');
  expect(await finishCards(['That was fun!'], 'race-done'), 'racing ends in a choice');

  // ---------------------------------------------------------------- solo rhythm
  await use('arcade-rhythm');
  expect(await toPlaying('rhythm', ["OK! Let's go!"], 'rhythm'), 'rhythm game starts');
  await driveRhythm();
  await precondition('rhythm result', () => window.__esl.arcade.phase === 'result', null, 30000);
  const beat = await arcade();
  expect(beat.result?.hits >= 5, `timed taps score on the rhythm game (${beat.result?.hits}/8, perfect ${beat.result?.perfect})`);
  expect(await finishCards(['That was fun!'], 'rhythm-done'), 'rhythm ends in a choice');
  expect(await baseline() === soloBefore, 'solo arcade play uses no time and gives no XP or memories');

  // ---------------------------------------------------------------- shelf
  await ev(async () => { const g = window.__esl; await g.enterScene('home', 'center'); });
  await settle();
  expect(await ev(async () => {
    const { souvenirMesh } = await import('/src/engine/food.js');
    const m = souvenirMesh('crane_cat');
    return m.geometry.attributes.position.count > 50 && window.__esl.world.save.souvenirs[0].kind === 'crane_cat';
  }), 'the cat prize is first on the bedroom shelf with its own model');
  await sleep(1200);
  await shot('bedroom-shelf-with-prize');

  // ---------------------------------------------------------------- outing: games
  const meet = async (npcId, period) => {
    await ev(async ({ npcId, period }) => {
      const g = window.__esl, w = g.world;
      w.save.time = { day: 6, period }; w.ensureDaily();
      w.addPlan({ npcIds: [npcId], day: 6, period, loc: 'mall', act: 'mall', source: 'test' });
      g.hud.queue.length = 0;
      await g.enterScene('mall', 'door');
    }, { npcId, period });
    await settle();
    await precondition('the planned friend waits by the 1F entrance', (id) => { const a = window.__esl.npcs.actorFor(id); return window.__esl.sceneId === 'mall' && a && a.char.root.position.x > 6; }, npcId);
    await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id), p = a.char.root.position; const free = g.scene.collision.nearestFree(p.x - 0.9, p.z + 0.4, 0.3); g.player.place(free.x, free.z, 0); }, npcId);
    await precondition('the waiting friend offers Talk', (id) => window.__esl.target?.actor?.npc?.id === id || window.__esl.target?.a?.npc?.id === id, npcId);
    await page.locator('.action').click();
  };
  const f1 = cast[0].id, f2 = cast[1].id;
  const before1 = await ev((id) => ({ xp: window.__esl.world.rel(id).xp, mems: window.__esl.world.save.memories.length }), f1);
  await meet(f1, 0);
  const heard = [];
  expect(await pump(async () => { const t = await page.locator('.dlg-en').textContent().catch(() => ''); if (t && !heard.includes(t)) heard.push(t); const a = await arcade(); return a.game === 'crane' && a.phase === 'playing'; },
    { label: 'outing-games', max: 80, prefer: ['I want to play games.', 'I want to go to the third floor.', 'I want to play the crane game.', 'I want the duck.', "Let's play together!", "OK! Let's try!"] }), 'outing: games choice leads to the crane game on 3F');
  expect(await said('What do you want to do?') && await said('Where do you want to go?'), 'the outing asks What do you want to do? and Where do you want to go?');
  expect(await ev(() => window.__esl.sceneId === 'mall3'), 'the group travelled to 3F');
  expect(await ev((id) => !!window.__esl.npcs.actorFor(id), f1), 'the friend came along to 3F');
  await shot('outing-crane-with-friend');
  await driveCrane('outing');
  expect(await pump(() => ev(() => window.__esl.world.period === 1 && window.__esl.mode === 'explore' && !window.__esl.hud.showingCard), { label: 'outing-games-end', max: 80, prefer: ['That was fun! Thank you!', 'Thank you!'] }), 'the games outing completes in one period');
  await settle();
  const after1 = await ev((id) => { const w = window.__esl.world; return { xp: w.rel(id).xp, mems: w.save.memories.length, memory: w.save.memories.find((m) => m.act === 'mall' && m.npcIds.includes(id)) }; }, f1);
  expect(after1.memory?.detail.mallChoice === 'games' && after1.memory.detail.game === 'crane' && after1.mems === before1.mems + 1, 'one memory records the games outing');
  expect(after1.xp > before1.xp, `the friend gains connection once (${before1.xp} → ${after1.xp})`);
  expect(await ev(async (id) => { const { describeMemory } = await import('/src/world/friendship.js'); const w = window.__esl.world; const m = w.save.memories.find((x) => x.act === 'mall' && x.npcIds.includes(id)); return describeMemory(w, m, id, w.day)?.en?.includes('played games'); }, f1), 'the friend remembers: We played games at Niji Mall');

  // ---------------------------------------------------------------- outing: shopping
  const wallet = await ev(() => window.__esl.world.save.pocketMoney.balance);
  await meet(f2, 1);
  expect(await pump(() => ev(() => window.__esl.world.period === 2 && window.__esl.mode === 'explore' && !window.__esl.hud.showingCard),
    { label: 'outing-shop', max: 120, prefer: ['I want to go shopping.', 'I want to go to the first floor.', 'I want to buy a toy.', 'Yes, I do.', 'Can I see a kendama, please?', 'How much is it?', "I'll take it!", 'Thank you!', 'Thank you! See you!'] }), 'the shopping outing completes in one period');
  await settle();
  const shop = await ev((id) => { const w = window.__esl.world; return { memory: w.save.memories.find((m) => m.act === 'mall' && m.npcIds.includes(id)), balance: w.save.pocketMoney.balance, kendama: w.save.souvenirs.some((s) => s.kind === 'mall_kendama') }; }, f2);
  expect(shop.memory?.detail.mallChoice === 'shop' && shop.memory.detail.shopId === 'toys', 'the memory records the shopping choice');
  expect(shop.kendama && shop.balance === wallet - 300, 'buying a kendama on the outing costs exactly 300 yen');
  log('arcade summary', { prizes, race: race.result, rhythm: beat.result, shots: out });
} finally { await browser.close(); }
if (H.errors.length) { console.error('ARCADE CHECKS FAILED:', H.errors.join('; ')); process.exit(1); }
console.log('ARCADE CHECKS PASSED');
