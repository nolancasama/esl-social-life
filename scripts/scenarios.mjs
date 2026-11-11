// Scenario checks beyond the first day: café outing, lost-item search,
// catch, rain, weekend wake-up and message invitations.
// Needs `npm run dev`. Usage: node scripts/scenarios.mjs
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/scenarios';
const { browser, page } = await launch();
const H = harness(page, out);
page.on('crash', () => console.log('[page crashed]'));
page.on('close', () => console.log('[page closed]'));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('[navigated]', f.url()); });
const { log, shot, state, sleep, pump, settle, expect } = H;

await page.goto(base + '/?autostart=sample&name=Mika');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(2600);
// Let the day-one welcome finish completely before starting scenarios.
await pump(async () => page.evaluate(() => window.__esl.welcomeDone === true && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 });
await settle();
// Skip the guided first day for these scenarios and get to know everyone.
await page.evaluate(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (const n of g.world.npcs) g.world.meet(n.id); g.hud.queue.length = 0; g.hud.refresh(); });
await settle();

// ---------------------------------------------------------------- café outing (after school)
log('— café outing');
await page.evaluate(() => { window.__advance = window.__esl.advanceTime({ reason: 'test' }); });
await page.waitForFunction(() => window.__esl.sceneId === 'town', null, { timeout: 30000 });
await settle();
const cafeNpc = await page.evaluate(async () => {
  const g = window.__esl, w = g.world;
  const n = w.npcs.find((x) => x.id === w.save.firstFriend) || w.npcs[0];
  const plan = w.addPlan({ npcIds: [n.id], day: w.day, period: w.period, loc: 'cafe', act: 'cafe', source: 'test' });
  await g.enterScene('cafe', 'door');
  return { id: n.id, name: n.name, plan: plan.id };
});
await settle();
log('café friend', cafeNpc);
await shot('cafe-arrive');
const startCafe = page.evaluate(({ id, plan }) => { const g = window.__esl; const a = g.npcs.actorFor(id); const p = g.world.save.plans.find((x) => x.id === plan); return g.activities.run('cafe', [a], { plan: p }); }, cafeNpc);
let cafeShots = 0;
await pump(async () => {
  const st = await state();
  const txt = await page.locator('.dlg-en').innerText().catch(() => '');
  if (/Here you are/.test(txt) && cafeShots === 0) { cafeShots++; await sleep(400); await shot('cafe-here-you-are'); }
  if (/What do you want to eat/.test(txt) && cafeShots === 0) { await shot('cafe-menu'); }
  return st.period === 2 && st.scene === 'home' && st.mode === 'explore';
}, { label: 'cafe', max: 260, prefer: ['I want to eat pancakes.', 'I want to eat a hamburger.', 'Pancakes, please.', 'A hamburger, please.', 'Orange juice, please.', 'Thank you!', "Yes, I do! It's delicious!"] });
await startCafe.catch((e) => H.errors.push('café run threw: ' + e.message));
const cafeMem = await page.evaluate(() => window.__esl.world.save.memories.find((m) => m.act === 'cafe'));
expect(!!cafeMem, 'café outing recorded a memory');
expect(cafeMem && cafeMem.detail.foodId, `food ordered: ${cafeMem?.detail?.foodEn}`);
await settle();

// ---------------------------------------------------------------- weekend: wake up, choose, rain
log('— weekend morning');
await page.evaluate(async () => { const g = window.__esl; g.world.save.time = { day: 4, period: 2 }; g.world.ensureDaily(); });
await page.evaluate(() => { window.__sleeping = window.__esl.sleep(); });
await sleep(1200);
await pump(async () => { const s = await state(); return s.day === 5 && s.mode === 'explore'; }, { label: 'wake', max: 40, prefer: ["It's eight o'clock.", 'I want to go to the park.'] });
let s = await state();
expect(s.day === 5 && s.scene === 'home', 'Saturday morning at home after choosing');
const goal = await page.evaluate(() => window.__esl.hud.currentGoal()?.en);
expect(/Park/.test(goal || ''), `weekend goal set from "I want to go to the park." (${goal})`);
await shot('weekend-home');

// ---------------------------------------------------------------- catch at the park
log('— catch');
await page.evaluate(() => window.__esl.enterScene('town', 'park'));
await page.waitForFunction(() => window.__esl.sceneId === 'town', null, { timeout: 30000 });
await settle();
await shot('park-saturday');
const catchNpc = await page.evaluate(() => {
  const g = window.__esl, w = g.world;
  const a = g.npcs.actors.find((x) => !x.special) ;
  const plan = w.addPlan({ npcIds: [a.npc.id], day: w.day, period: w.period, loc: 'park', act: 'catch', source: 'test' });
  window.__catchRun = g.activities.run('catch', [a], { plan });
  return a.npc.name;
});
log('catch with', catchNpc);
let caught = 0;
await pump(async () => {
  const st = await state();
  if (st.mode === 'activity' && caught < 1 && await page.locator('.act-btn', { hasText: 'CATCH' }).isVisible().catch(() => false)) { caught++; await sleep(300); await shot('catch-receive'); }
  return st.period === 1 && st.mode === 'explore';
}, { label: 'catch', max: 300, prefer: ['Yes, I can!', 'Catch the ball!', 'Thank you! That was fun!'] });
s = await state();
expect(s.period === 1, 'catch used the morning → afternoon');
await settle();

// ---------------------------------------------------------------- lost item search (no time cost)
log('— lost item');
const lost = await page.evaluate(async () => {
  const g = window.__esl, w = g.world;
  w.save.time.period = 1;
  const a = g.npcs.actors.find((x) => !x.special);
  w.daily.lost = { npcId: a.npc.id, period: w.period, item: 'cap', hide: null, variant: 'clue' };
  w.daily.lostDone = false;
  await g.enterScene('town', 'park', { fade: false });
  const b = g.npcs.actorFor(a.npc.id);
  const p = b.char.root.position;
  g.player.place(p.x + 1.0, p.z, -Math.PI / 2);
  return { id: a.npc.id, name: a.npc.name, marker: g.npcs.markerFor(b) };
});
await settle();
expect(lost.marker === '❗', `${lost.name} shows the ❗ marker`);
await shot('lost-item-npc');
await page.keyboard.press('KeyE');
await pump(async () => (await page.evaluate(() => !!window.__esl.activities.search)) && (await state()).mode === 'explore', { label: 'lost', max: 30, prefer: ['Can I help you?'] });
const search = await page.evaluate(() => { const s = window.__esl.activities.search; return s && { hide: s.hide.id, prep: s.hide.prep, obj: s.hide.obj.en, cands: window.__esl.extraInteract.length, look: s.hide.look }; });
log('search', search);
expect(search && search.cands >= 1, 'search candidates are marked');
await shot('search-goal');
// Look at a wrong spot first (if any), then the right one.
const wrong = await page.evaluate(() => { const g = window.__esl; const t = g.extraInteract.find((x) => x.hide.id !== g.activities.search.hide.id); return t ? { x: t.x, z: t.z } : null; });
if (wrong) {
  await page.evaluate(({ x, z }) => window.__esl.player.place(x, z, 0), wrong);
  await sleep(500);
  await page.keyboard.press('KeyE');
  await sleep(900);
}
await page.evaluate(({ x, z }) => window.__esl.player.place(x, z, 0), search.look);
await sleep(500);
await page.keyboard.press('KeyE');
await sleep(1200);
await shot('found-item');
await pump(async () => (await page.evaluate(() => window.__esl.world.daily.lostDone)) && (await state()).mode === 'explore', { label: 'found', max: 40, prefer: [`It's ${search.prep} the ${search.obj}.`, "You're welcome!"] });
const helped = await page.evaluate(() => ({ done: window.__esl.world.daily.lostDone, period: window.__esl.world.period, mem: window.__esl.world.save.memories.some((m) => m.type === 'help') }));
expect(helped.done && helped.mem, 'lost item returned and remembered');
expect(helped.period === 1, 'helping did not use time');
await settle();

// ---------------------------------------------------------------- rain in town
log('— rain');
await page.evaluate(() => { const g = window.__esl; g.world.save.weatherOverrides[g.world.day] = 'rainy'; return g.enterScene('town', 'crossroads', { fade: false }); });
await settle();
await sleep(900);
const parkNpcs = await page.evaluate(() => { const g = window.__esl; return g.npcs.actors.filter((a) => !a.special && g.scene.zoneOf(a.char.root.position.x, a.char.root.position.z) === 'park').length; });
expect(parkNpcs === 0 || parkNpcs <= 1, `rain empties the park (${parkNpcs} left)`);
await shot('rainy-town');

// ---------------------------------------------------------------- invitation message
log('— invitation');
await page.evaluate(() => { const g = window.__esl, w = g.world; const n = w.known()[1]; w.rel(n.id).level = 2; const inv = w.makeInvite(n); w.addMessage({ from: n.id, kind: 'invite', ...inv }); g.hud.refresh(); });
await page.keyboard.press('KeyP');
await sleep(600);
await shot('invite-message');
const before = await page.evaluate(() => window.__esl.world.save.plans.filter((p) => p.status === 'pending').length);
await page.locator('.reply.go').first().click();
await sleep(600);
const after = await page.evaluate(() => window.__esl.world.save.plans.filter((p) => p.status === 'pending').length);
expect(after === before + 1, 'accepting the invitation created a plan');
await page.keyboard.press('Escape');
await sleep(400);
await page.keyboard.press('KeyC');
await sleep(600);
await shot('calendar');
await page.keyboard.press('Escape');
await page.keyboard.press('KeyJ');
await sleep(500);
await page.locator('.tab', { hasText: 'Friend map' }).click();
await sleep(500);
await shot('friend-map');
await page.locator('.tab', { hasText: 'My English' }).click();
await sleep(500);
await shot('phrase-book');
await page.keyboard.press('Escape');

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nSCENARIOS PASSED');
