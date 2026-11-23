// End-to-end playthrough of the first-day loop through the real UI.
// Needs `npm run dev` running. Usage: node scripts/playthrough.mjs
// Screenshots go to SHOTS_DIR (default .shots/). Exits non-zero on failure.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const log = (...a) => console.log('•', ...a);

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text()); } });

let shotN = 0;
const shot = async (name) => { const f = path.join(out, `${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
const state = () => page.evaluate(() => { const g = window.__esl; if (!g) return null; return { mode: g.mode, scene: g.sceneId, day: g.world.day, period: g.world.period, fd: g.world.save.flags.fd, loc: g.locationId }; });
const sleep = (ms) => page.waitForTimeout(ms);

/** Advance dialogue/cards until `done()` is true. prefer: optional text to pick. */
async function pump(done, { max = 120, prefer = [], label = '' } = {}) {
  for (let i = 0; i < max; i++) {
    if (await done()) return true;
    const cardsVisible = await page.locator('.dlg-cards .card').first().isVisible().catch(() => false);
    const choicesShown = await page.locator('.dlg-choices').isVisible().catch(() => false);
    if (cardsVisible && choicesShown) {
      let clicked = false;
      for (const p of prefer) {
        const c = page.locator('.dlg-cards .card', { hasText: p }).first();
        if (await c.isVisible().catch(() => false)) { await c.click(); clicked = true; log(label, 'pick:', p); break; }
      }
      if (!clicked) {
        const hl = page.locator('.dlg-cards .card.hl').first();
        if (await hl.isVisible().catch(() => false)) { log(label, 'pick (✨):', (await hl.innerText()).split('\n')[0]); await hl.click(); }
        else { const c = page.locator('.dlg-cards .card').first(); log(label, 'pick:', (await c.innerText()).split('\n')[0]); await c.click(); }
      }
      await sleep(350);
      continue;
    }
    if (await page.locator('.bc-btn').isVisible().catch(() => false)) { await page.locator('.bc-btn').click(); await sleep(400); continue; }
    if (await page.locator('.act-btn').isVisible().catch(() => false)) { await page.keyboard.press('Space'); await sleep(300); continue; }
    if (await page.locator('.dlg-panel').isVisible().catch(() => false)) {
      const txt = await page.locator('.dlg-en').innerText().catch(() => '');
      if (txt) log(label, '›', txt.slice(0, 90));
      await page.keyboard.press('Space');
      await sleep(420);
      continue;
    }
    await sleep(350);
  }
  return done();
}

/** Dismiss celebration cards and wait until we are free to explore. */
async function settle() {
  for (let i = 0; i < 60; i++) {
    if (await page.locator('.bc-btn').isVisible().catch(() => false)) {
      log('card:', (await page.locator('.bc-title').innerText().catch(() => '')).split('\n')[0]);
      await page.locator('.bc-btn').click();
      await sleep(500);
      continue;
    }
    const idle = await page.evaluate(() => { const g = window.__esl; return g && g.mode === 'explore' && !g.hud.showingCard && g.hud.queue.length === 0; });
    if (idle) { await sleep(600); if (await page.evaluate(() => { const g = window.__esl; return g.mode === 'explore' && !g.hud.showingCard && g.hud.queue.length === 0; })) return; }
    await sleep(300);
  }
}

function expect(cond, msg) { if (!cond) { errors.push('EXPECT: ' + msg); console.log('✗', msg); } else log('✓', msg); }

// ---------------------------------------------------------------- start
await page.goto(base + '/?debug=1');
await page.waitForFunction(() => window.__eslReady, null, { timeout: 30000 });
await sleep(800);
await shot('title');
await page.locator('.profile.new').click();
await sleep(500);
await page.locator('.nameinput').fill('Rio');
await page.locator('.cnext').click();
await sleep(500);
await shot('creator-look');
await page.locator('.cnext').click();
await sleep(400);
await shot('creator-intro');
await page.locator('.cnext.go').click();
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
log('game started', await state());
await sleep(2600);
await shot('first-day-welcome');
await pump(async () => (await state()).mode === 'explore', { label: 'welcome' });
await sleep(600);
await shot('classroom-explore');

// Walk to the first friend with the keyboard, then talk.
const ff = await page.evaluate(() => { const g = window.__esl; const a = g.npcs.actorFor(g.world.save.firstFriend); const p = a.char.root.position; return { x: p.x, z: p.z, name: a.npc.name }; });
log('first friend', ff);
await page.evaluate(({ x, z }) => { const g = window.__esl; g.player.place(x + 1.0, z + 0.3, -Math.PI / 2); }, ff);
await sleep(900);
await shot('near-first-friend');
await settle();
await page.keyboard.press('KeyE');
await sleep(900);
await shot('intro-conversation');
await pump(async () => { const s = await state(); return s.mode === 'explore' && s.fd !== 'start'; }, { label: 'intro', prefer: ['What do you do on Saturdays?', 'Do you want to play soccer?', 'Do you want to play catch?', 'Do you want to go to the café?', 'Nice to meet you, too!'] });
let s = await state();
expect(['planned', 'introduced'].includes(s.fd), `first-day flag after intro is ${s.fd}`);
if (s.fd === 'introduced') {
  log('plan not made in the guided talk — inviting directly');
  const yk = await page.evaluate(() => { const g = window.__esl; const a = g.npcs.actorFor(g.world.save.introNpc); const p = a.char.root.position; return { x: p.x, z: p.z }; });
  await page.evaluate(({ x, z }) => window.__esl.player.place(x + 1.0, z, -Math.PI / 2), yk);
  await sleep(900);
  await page.keyboard.press('KeyE');
  await pump(async () => (await state()).fd === 'planned' && (await state()).mode === 'explore', { label: 'invite', prefer: ['Do you want to play', 'Do you want to go to the café?', 'Bye'] });
}
s = await state();
expect(s.fd === 'planned', 'a plan was made with the introduced classmate');
const plan = await page.evaluate(() => window.__esl.world.save.plans[0]);
log('plan', plan);
await shot('plan-made');

// Start class at the desk.
await settle();
await page.evaluate(() => { const g = window.__esl; g.player.place(-3.9, 4.0, Math.PI); });
await sleep(500);
log('before desk E', await page.evaluate(() => { const g = window.__esl; return { mode: g.mode, target: g.target?.key, block: (g.interactBlockUntil || 0) - performance.now(), active: document.activeElement?.className }; }));
await page.keyboard.press('KeyE');
await sleep(500);
log('after desk E', await page.evaluate(() => { const g = window.__esl; return { mode: g.mode, dlg: !document.querySelector('.dlg').hidden, en: document.querySelector('.dlg-en')?.textContent, cards: document.querySelectorAll('.dlg-cards .card').length }; }));
await pump(async () => (await state()).scene === 'town' && (await state()).mode === 'explore', { label: 'class', prefer: ['Yes! Start class.'] });
s = await state();
expect(s.scene === 'town' && s.period === 1, 'after class we are in town, after school');
await sleep(800);
await shot('after-school-town');

// Go to the plan location and talk to the friend there.
await settle();
if (plan.loc === 'park') {
  const y = await page.evaluate(() => { const g = window.__esl; const a = g.npcs.actorFor(g.world.save.introNpc); const p = a.char.root.position; return { x: p.x, z: p.z }; });
  log('friend at park', y);
  await page.evaluate(({ x, z }) => { window.__esl.player.place(x, z + 1.4, Math.PI); }, y);
} else {
  await page.evaluate(() => window.__esl.enterScene('cafe', 'door'));
  await sleep(1200);
  const y = await page.evaluate(() => { const g = window.__esl; const a = g.npcs.actorFor(g.world.save.introNpc); const p = a.char.root.position; return { x: p.x, z: p.z }; });
  await page.evaluate(({ x, z }) => { window.__esl.player.place(x - 1.2, z + 0.6, Math.PI / 2); }, y);
}
await sleep(900);
await settle();
await shot('meet-at-plan-location');
await page.keyboard.press('KeyE');
await sleep(800);
await pump(async () => (await state()).mode === 'activity', { label: 'plan', prefer: ["Let's go!"] , max: 30 });
await sleep(1500);
await shot('activity-start');
let activityShots = 0;
await pump(async () => {
  const st = await state();
  if (st.mode === 'activity' && activityShots < 2 && await page.locator('.act-btn').isVisible().catch(() => false)) { activityShots++; await shot('activity-play-' + activityShots); }
  return st.period === 2 && st.scene === 'home' && st.mode === 'explore';
}, { label: 'activity', max: 400, prefer: ["Yes, I can!", 'Catch the ball!', 'Here you go!', 'Thank you! That was fun!', 'Thank you!'] });
s = await state();
expect(s.period === 2 && s.scene === 'home', 'evening at home after the activity');
expect(s.fd === 'played', `first-day flag is played (${s.fd})`);
const relAfter = await page.evaluate(() => { const g = window.__esl; const id = g.world.save.introNpc; return { level: g.world.level(id), xp: g.world.rel(id).xp, photos: JSON.parse(localStorage.getItem('esl-social-life.v1.photos.' + g.world.save.id) || '[]').length }; });
log('friendship after activity', relAfter);
expect(relAfter.level >= 2, 'connection reached level 2 (Friend) after the first outing');
await settle();
await shot('evening-home');
await page.keyboard.press('KeyJ');
await sleep(600);
await shot('journal-friends');
await page.locator('.fcard').nth(1).click().catch(() => {});
await sleep(500);
await shot('journal-detail');
await page.keyboard.press('Escape');
await sleep(400);
await page.keyboard.press('KeyP');
await sleep(500);
await shot('messages');
await page.keyboard.press('Escape');
await sleep(400);

// Sleep
await settle();
await page.evaluate(() => { window.__esl.player.place(-1.9, -2.1, -Math.PI / 2); });
await sleep(400);
await page.keyboard.press('KeyE');
await pump(async () => { const st = await state(); return st.day === 1 && st.scene === 'classroom' && st.mode === 'explore'; }, { label: 'sleep', prefer: ['Good night!', "It's seven o'clock."], max: 80 });
s = await state();
expect(s.day === 1 && s.scene === 'classroom', 'next morning in the classroom');
await sleep(500);
await shot('next-morning');
// The friend should come over and remember yesterday.
const remembered = await (async () => {
  for (let i = 0; i < 40; i++) {
    const t = await page.locator('.dlg-en').innerText().catch(() => '');
    if (/yesterday/i.test(t)) return t;
    if (await page.locator('.dlg-panel').isVisible().catch(() => false)) {
      if (await page.locator('.dlg-cards .card').first().isVisible().catch(() => false)) await page.locator('.dlg-cards .card').first().click();
      else await page.keyboard.press('Space');
    }
    await sleep(400);
  }
  return null;
})();
if (remembered) await shot('friend-remembers');
else log('no recall: approach state', await page.evaluate(() => {
  const g = window.__esl, w = g.world, a = g.npcs.actorFor(w.save.introNpc);
  return { mode: g.mode, fd: w.save.flags.fd, approached: !!w.daily.approached[w.save.introNpc], queue: g.npcs.approachQueue.map((q) => ({ id: q.actor.npc.id, delay: q.delay, started: !!q.started, scripted: q.scripted })), actor: a ? { engaged: !!a.engaged, walk: !!a.walk, plan: !!a.plan, mode: a.mode, special: a.special || null } : null, panel: document.querySelector('.dlg-en')?.textContent || null, card: !!g.hud.showingCard };
}));
expect(!!remembered, `the friend remembers yesterday: ${remembered}`);
await pump(async () => (await state()).mode === 'explore', { label: 'morning', max: 40 });
s = await state();
log('final state', s);

await browser.close();
if (errors.length) { console.log('\nFAILED with', errors.length, 'problem(s):'); for (const e of errors) console.log(' -', e); process.exit(1); }
console.log('\nPLAYTHROUGH PASSED');
